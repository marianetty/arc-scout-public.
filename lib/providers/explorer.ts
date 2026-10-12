import type { ContractAnalysis, ExplorerSnapshot, SourceRef } from "../types";

const BASE = (process.env.ARC_EXPLORER_API_URL || "https://explorer.arc.io/api/v2").replace(/\/$/, "");
const SOURCIFY_BASE = (process.env.SOURCIFY_API_URL || "https://sourcify.dev/server/v2").replace(/\/$/, "");
const n = (v: unknown): number | null => v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

type FetchResult = { data: any | null; error: string | null };

async function getJson(url: string): Promise<FetchResult> {
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "ArcScout/0.6" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!r.ok) return { data: null, error: `HTTP ${r.status}` };
    return { data: await r.json(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export function analyzeContract(contract: any): ContractAnalysis | null {
  if (!contract) return null;
  const abi = Array.isArray(contract?.abi) ? contract.abi : [];
  const names = abi
    .filter((x: any) => x?.type === "function" && typeof x?.name === "string")
    .map((x: any) => String(x.name))
    .filter((x: string, i: number, a: string[]) => a.indexOf(x) === i)
    .sort();

  const haystack = names.join(" ").toLowerCase();
  const sourceAvailable = Boolean(contract?.source_code || contract?.sourceCode || contract?.is_verified || abi.length);
  const abiAvailable = abi.length > 0;

  const includesAny = (patterns: string[]) => patterns.some((p) => haystack.includes(p));
  const privilegedPatterns = [
    "owner",
    "admin",
    "role",
    "grantrole",
    "revokerole",
    "setroleadmin",
    "mint",
    "issue",
    "pause",
    "unpause",
    "blacklist",
    "blocklist",
    "denylist",
    "setblocked",
    "settax",
    "setfee",
    "setbuyfee",
    "setsellfee",
    "updatetax",
    "updatefee",
    "upgrade",
    "setimplementation",
    "sethook",
    "setrouter",
    "settreasury",
    "setrecipient",
    "setbeneficiary",
    "setlocker",
    "setescrow",
    "exclude",
  ];
  const privilegedFunctionNames = abi
    .filter((x: any) => {
      if (x?.type !== "function" || typeof x?.name !== "string") return false;
      if (x?.stateMutability === "view" || x?.stateMutability === "pure") return false;
      const lower = String(x.name).toLowerCase();
      return privilegedPatterns.some((pattern) => lower.includes(pattern));
    })
    .map((x: any) => String(x.name))
    .filter((name: string, i: number, a: string[]) => a.indexOf(name) === i)
    .sort()
    .slice(0, 100);

  return {
    sourceAvailable,
    abiAvailable,
    functionNames: names.slice(0, 200),
    mintHint: abiAvailable ? includesAny(["mint", "issue", "create"]) : null,
    pauseHint: abiAvailable ? includesAny(["pause", "unpause"]) : null,
    blacklistHint: abiAvailable ? includesAny(["blacklist", "blocklist", "denylist", "banaddress", "setblocked"]) : null,
    taxSetterHint: abiAvailable ? includesAny(["settax", "setfee", "setbuyfee", "setsellfee", "updatetax", "updatefee"]) : null,
    ownershipTransferHint: abiAvailable ? includesAny(["owner", "transferownership", "renounceownership"]) : null,
    accessControlHint: abiAvailable ? includesAny(["hasrole", "grantrole", "revokerole", "getroleadmin", "setroleadmin"]) : null,
    adminSetterHint: abiAvailable ? privilegedFunctionNames.some((name: string) => {
      const lower = name.toLowerCase();
      return lower.startsWith("set") || lower.startsWith("update") || lower.startsWith("grant") || lower.startsWith("revoke") || lower === "exclude";
    }) : null,
    privilegedFunctionNames,
    upgradeHint: abiAvailable ? includesAny(["upgrade", "upgradeandcall", "setimplementation"]) : null,
  };
}

export async function collectExplorer(contract: string): Promise<{ data: ExplorerSnapshot; sources: SourceRef[]; limitations: string[] }> {
  const observedAt = new Date().toISOString();
  const tokenUrl = `${BASE}/tokens/${contract}`;
  const holdersUrl = `${BASE}/tokens/${contract}/holders`;
  const smartContractUrl = `${BASE}/smart-contracts/${contract}`;

  try {
    const [tokenResult, holdersResult, smartContractResult] = await Promise.all([
      getJson(tokenUrl),
      getJson(holdersUrl),
      getJson(smartContractUrl),
    ]);

    const token = tokenResult.data;
    const holders = holdersResult.data;

    let smartContract = smartContractResult.data;
    let sourcifyResult: FetchResult | null = null;
    const sourcifyUrl = `${SOURCIFY_BASE}/contract/5042/${contract}?fields=abi`;

    if (!smartContract) {
      sourcifyResult = await getJson(sourcifyUrl);
      const fallback = sourcifyResult.data;
      if (fallback && (fallback.match || Array.isArray(fallback.abi))) {
        smartContract = {
          abi: Array.isArray(fallback.abi) ? fallback.abi : [],
          is_verified: true,
          verification_source: "sourcify",
          verification_match: fallback.match ?? null,
        };
      }
    }

    const items = Array.isArray(holders?.items) ? holders.items.slice(0, 10) : [];
    const topHolders = items.map((h: any) => ({
      address: h?.address?.hash || h?.address_hash || h?.address || "unknown",
      valueRaw: h?.value ? String(h.value) : null,
      percentage: n(h?.value_percentage ?? h?.percentage),
    }));

    const holdersCount = n(
      token?.holders_count ??
      token?.holdersCount ??
      holders?.count
    );
    const holderDataSource = holdersResult.data ? "EXPLORER" as const : null;
    const holderDataComplete = holdersResult.data ? true : null;
    const verified =
      smartContract?.is_verified === true || token?.is_verified === true || token?.is_verified_contract === true
        ? true
        : (smartContract || token) ? false : null;

    return {
      data: {
        holdersCount,
        topHolders,
        holderDataSource,
        holderDataComplete,
        holderDataFromBlock: null,
        holderDataToBlock: null,
        contractVerified: verified,
        contractAnalysis: analyzeContract(smartContract),
      },
      sources: [
        { provider: "Arc Explorer / Blockscout", url: tokenUrl, observedAt },
        { provider: "Arc Explorer smart-contract API", url: smartContractUrl, observedAt },
        ...(sourcifyResult
          ? [{
              provider: "Sourcify v2",
              url: sourcifyUrl,
              observedAt,
              note: smartContract?.verification_source === "sourcify"
                ? "used as verified-contract ABI fallback"
                : (sourcifyResult.error ? `unavailable: ${sourcifyResult.error}` : "no verified contract found"),
            }]
          : []),
      ],
      limitations: [
        ...(tokenResult.error ? [`Explorer token endpoint unavailable: ${tokenResult.error}`] : []),
        ...(holdersResult.error
          ? [`Explorer holders endpoint unavailable: ${holdersResult.error}; deep RPC reconstruction not run in normal scan`]
          : []),
        ...(smartContractResult.error
          ? [`Explorer smart-contract endpoint unavailable: ${smartContractResult.error}${smartContract?.verification_source === "sourcify" ? "; Sourcify fallback used" : ""}`]
          : []),
        ...(sourcifyResult?.error && !smartContract
          ? [`Sourcify verified-contract fallback unavailable: ${sourcifyResult.error}`]
          : []),
        ...(!tokenResult.error && !holdersResult.error && !smartContractResult.error && !token && !holders && !smartContract
          ? ["Explorer API returned no token/holder/contract data"]
          : []),
      ],
    };
  } catch (e) {
    return {
      data: {},
      sources: [{ provider: "Arc Explorer / Blockscout", url: tokenUrl, observedAt, note: "unavailable" }],
      limitations: [`Explorer unavailable: ${e instanceof Error ? e.message : "unknown error"}`],
    };
  }
}

