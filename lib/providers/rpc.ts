import { createPublicClient, http, getAddress, parseAbiItem, type Address, zeroAddress } from "viem";
import type { OnchainSnapshot, SourceRef } from "../types";

const RPC_URL = process.env.ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io";
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

const erc20Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const ownerAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

function client() {
  return createPublicClient({ transport: http(RPC_URL, { timeout: 8_000 }) });
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

export async function collectOnchain(contract: string): Promise<{ data: OnchainSnapshot; sources: SourceRef[] }> {
  const address = getAddress(contract) as Address;
  const c = client();
  const observedAt = new Date().toISOString();
  const code = await safe(() => c.getBytecode({ address }));
  // A failed owner() read does not establish that the function is absent.
  let ownerReadError: string | null = null;

  const [name, symbol, decimals, totalSupply, owner, implSlot] = await Promise.all([
    safe(() => c.readContract({ address, abi: erc20Abi, functionName: "name" })),
    safe(() => c.readContract({ address, abi: erc20Abi, functionName: "symbol" })),
    safe(() => c.readContract({ address, abi: erc20Abi, functionName: "decimals" })),
    safe(() => c.readContract({ address, abi: erc20Abi, functionName: "totalSupply" })),
    c.readContract({ address, abi: ownerAbi, functionName: "owner" }).catch((error: unknown) => {
      ownerReadError = error instanceof Error ? error.message.split("\n")[0].slice(0, 180) : "owner() read failed";
      return null;
    }),
    safe(() => c.getStorageAt({ address, slot: EIP1967_IMPLEMENTATION_SLOT })),
  ]);

  let implementation: string | null = null;
  if (implSlot && BigInt(implSlot) !== 0n) {
    const candidate = `0x${implSlot.slice(-40)}`;
    if (candidate !== zeroAddress) implementation = getAddress(candidate);
  }

  return {
    data: {
      chainId: 5042,
      codeExists: code === null ? null : Boolean(code && code !== "0x"),
      name: typeof name === "string" ? name : null,
      symbol: typeof symbol === "string" ? symbol : null,
      decimals: typeof decimals === "number" ? decimals : null,
      totalSupplyRaw: typeof totalSupply === "bigint" ? totalSupply.toString() : null,
      owner: typeof owner === "string" ? owner : null,
      ownerCheck: typeof owner === "string" ? "FOUND" : "UNAVAILABLE",
      ownerReadError,
      proxyImplementation: implementation,
      proxyCheck: implSlot === null ? "UNAVAILABLE" : implementation ? "EIP1967_IMPLEMENTATION" : "NO_EIP1967_IMPLEMENTATION",
    },
    sources: [{ provider: "Arc RPC", url: RPC_URL, observedAt }],
  };
}


export type RpcHolderReconstruction = {
  complete: boolean;
  holdersCount: number | null;
  topHolders: Array<{ address: string; valueRaw: string; percentage: number | null }>;
  fromBlock: bigint | null;
  toBlock: bigint | null;
  limitation: string | null;
};

async function findDeploymentBlock(c: ReturnType<typeof client>, address: Address, latest: bigint): Promise<bigint | null> {
  const latestCode = await safe(() => c.getBytecode({ address, blockNumber: latest }));
  if (!latestCode || latestCode === "0x") return null;

  let low = 0n;
  let high = latest;

  while (low < high) {
    const mid = (low + high) / 2n;
    const code = await safe(() => c.getBytecode({ address, blockNumber: mid }));
    if (code && code !== "0x") high = mid;
    else low = mid + 1n;
  }
  return low;
}

export async function reconstructErc20Holders(contract: string): Promise<RpcHolderReconstruction> {
  const address = getAddress(contract) as Address;
  const c = client();
  const latest = await safe(() => c.getBlockNumber());

  if (latest === null) {
    return { complete: false, holdersCount: null, topHolders: [], fromBlock: null, toBlock: null, limitation: "RPC latest block unavailable" };
  }

  const deployment = await findDeploymentBlock(c, address, latest);
  if (deployment === null) {
    return { complete: false, holdersCount: null, topHolders: [], fromBlock: null, toBlock: latest, limitation: "Could not determine deployment block from historical bytecode" };
  }

  const maxSpan = BigInt(process.env.ARC_HOLDER_MAX_BLOCK_SPAN || "600000");
  if (latest - deployment > maxSpan) {
    return {
      complete: false,
      holdersCount: null,
      topHolders: [],
      fromBlock: deployment,
      toBlock: latest,
      limitation: `Transfer history spans ${latest - deployment} blocks, above configured reconstruction limit ${maxSpan}`,
    };
  }

  const balances = new Map<string, bigint>();
  const chunk = BigInt(process.env.ARC_HOLDER_LOG_CHUNK || "5000");
  const concurrency = Math.max(1, Number(process.env.ARC_HOLDER_LOG_CONCURRENCY || "2"));
  const minChunk = BigInt(process.env.ARC_HOLDER_LOG_MIN_CHUNK || "250");
  const zero = zeroAddress.toLowerCase();
  const ranges: Array<{ from: bigint; to: bigint }> = [];

  for (let from = deployment; from <= latest; from += chunk) {
    ranges.push({
      from,
      to: from + chunk - 1n > latest ? latest : from + chunk - 1n,
    });
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchRange(from: bigint, to: bigint, attempt = 0): Promise<{ logs: any[]; error: string | null }> {
    try {
      const logs = await c.getLogs({ address, event: transferEvent, fromBlock: from, toBlock: to });
      return { logs, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const span = to - from + 1n;
      const retryable = /rate limit|defined limit|too many|429/i.test(message);

      if (retryable && span > minChunk) {
        const mid = from + (span / 2n) - 1n;
        await sleep(Math.min(250 * (attempt + 1), 1000));
        const left = await fetchRange(from, mid, attempt + 1);
        if (left.error) return left;
        const right = await fetchRange(mid + 1n, to, attempt + 1);
        if (right.error) return right;
        return { logs: [...left.logs, ...right.logs], error: null };
      }

      if (retryable && attempt < 3) {
        await sleep(500 * (attempt + 1));
        return fetchRange(from, to, attempt + 1);
      }

      return { logs: [], error: message };
    }
  }

  for (let i = 0; i < ranges.length; i += concurrency) {
    const batch = ranges.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async ({ from, to }) => {
      const result = await fetchRange(from, to);
      return { from, to, ...result };
    }));

    const failed = results.find((result) => result.error);
    if (failed) {
      return {
        complete: false,
        holdersCount: null,
        topHolders: [],
        fromBlock: deployment,
        toBlock: latest,
        limitation: `Transfer log reconstruction failed for blocks ${failed.from}-${failed.to}: ${failed.error}`,
      };
    }

    for (const result of results) {
      for (const log of result.logs) {
        const fromAddress = log.args.from?.toLowerCase();
        const toAddress = log.args.to?.toLowerCase();
        const value = log.args.value;
        if (typeof value !== "bigint") continue;

        if (fromAddress && fromAddress !== zero) {
          balances.set(fromAddress, (balances.get(fromAddress) || 0n) - value);
        }
        if (toAddress && toAddress !== zero) {
          balances.set(toAddress, (balances.get(toAddress) || 0n) + value);
        }
      }
    }

    if (i + concurrency < ranges.length) {
      await sleep(150);
    }
  }

  const totalSupply = await safe(() => c.readContract({ address, abi: erc20Abi, functionName: "totalSupply" }));
  const positive = [...balances.entries()].filter(([, balance]) => balance > 0n);
  positive.sort((a, b) => a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1);

  const topHolders = positive.slice(0, 10).map(([holder, balance]) => ({
    address: getAddress(holder),
    valueRaw: balance.toString(),
    percentage:
      typeof totalSupply === "bigint" && totalSupply > 0n
        ? Number((balance * 1_000_000n) / totalSupply) / 10_000
        : null,
  }));

  return {
    complete: true,
    holdersCount: positive.length,
    topHolders,
    fromBlock: deployment,
    toBlock: latest,
    limitation: "Holder reconstruction assumes all balance changes are represented by standard ERC-20 Transfer events.",
  };
}

