import { getAddress } from "viem";
import { collectOnchain } from "./providers/rpc";
import { collectMarket } from "./providers/market";
import { collectExplorer } from "./providers/explorer";
import { collectOfficial } from "./providers/official";
import { collectArcscanHolders } from "./providers/holders";
import { deriveSecurity } from "./security";
import { classify } from "./score";
import type { TokenScan } from "./types";
import { appendSnapshot, getHistory, historyBackend, setCachedTokenResult } from "./history";
import { deriveAcceleration, toSnapshotPoint } from "./acceleration";
import { resolveProtocolContext } from "./protocols/registry";

export async function scanToken(rawContract: string) {
  const contract = getAddress(rawContract);
  const [onchain, market, explorer, official, arcscanHolders] = await Promise.all([
    collectOnchain(contract),
    collectMarket(contract),
    collectExplorer(contract),
    collectOfficial(contract),
    collectArcscanHolders(contract),
  ]);

  const mergedExplorer = {
    ...explorer.data,
    ...(arcscanHolders.data.holderDataSource ? {
      holdersCount: arcscanHolders.data.holdersCount ?? explorer.data.holdersCount ?? null,
      topHolders: arcscanHolders.data.topHolders ?? explorer.data.topHolders ?? [],
      holderDataSource: arcscanHolders.data.holderDataSource,
      holderDataComplete: arcscanHolders.data.holderDataComplete,
      holderDataFromBlock: arcscanHolders.data.holderDataFromBlock,
      holderDataToBlock: arcscanHolders.data.holderDataToBlock,
      concentrationTop10Pct: arcscanHolders.data.concentrationTop10Pct ?? null,
    } : {}),
  };

  const protocolContext = await resolveProtocolContext(contract, market.data);
  const security = deriveSecurity(market.data, onchain.data, mergedExplorer, protocolContext);
  const generatedAt = new Date().toISOString();
  const point = toSnapshotPoint(generatedAt, market.data);
  const history = await getHistory(contract);
  const acceleration = deriveAcceleration(point, history);

  const limitations = [
    ...(onchain.data.codeExists === null ? ["RPC bytecode check unavailable; contract existence is unknown."] : []),
    ...(onchain.data.ownerReadError ? [`owner() could not be read: ${onchain.data.ownerReadError}. This does not prove ownership is renounced or absent.`] : []),
    ...market.limitations,
    ...explorer.limitations,
    ...arcscanHolders.limitations,
    ...official.limitations,
    ...protocolContext.observations.flatMap((x) => x.limitations),
    "ABI/source capability detection is heuristic: a matching function name does not prove that an admin can successfully exercise it.",
    "Honeypot status and deterministic sell simulation still require an independent security/simulation provider.",
    "Observed market sells are evidence of exits, not a guarantee that every wallet or trade size can sell.",
  ];

  if (historyBackend === "PROCESS_MEMORY") {
    limitations.push("Durable history is not configured; acceleration history resets on restart/redeploy.");
  }

  const availability = {
    market: market.data.pairAddress || market.data.priceUsd != null ? "AVAILABLE" : "UNAVAILABLE",
    onchain: onchain.data.codeExists === true ? "AVAILABLE" : onchain.data.codeExists === false ? "UNAVAILABLE" : "UNKNOWN",
    contractSource:
      explorer.data.contractVerified === true && explorer.data.contractAnalysis
        ? "AVAILABLE"
        : explorer.data.contractVerified === false
          ? "UNKNOWN"
          : "UNAVAILABLE",
    holders:
      mergedExplorer.holderDataComplete === true &&
      ((mergedExplorer.topHolders?.length ?? 0) > 0 || mergedExplorer.holdersCount != null || mergedExplorer.concentrationTop10Pct != null)
        ? "AVAILABLE"
        : mergedExplorer.holderDataComplete === false
          ? "UNAVAILABLE"
          : "UNKNOWN",
    officialEvidence:
      official.data.officialContractConfirmed != null || official.data.productState !== "UNKNOWN"
        ? "AVAILABLE"
        : "NOT_CHECKED",
    protocolContext:
      protocolContext.observations.some((x) => x.matched)
        ? "AVAILABLE"
        : protocolContext.observations.some((x) => x.limitations.length > 0)
          ? "UNAVAILABLE"
          : "UNKNOWN",
    independentSecurity:
      security.honeypotFlag != null || security.sellSimulation === "SIMULATED_OK" || security.sellSimulation === "FAILED"
        ? "AVAILABLE"
        : "NOT_CHECKED",
  } as const;

  const scan: TokenScan = {
    contract,
    generatedAt,
    network: "Arc",
    chainId: 5042,
    market: market.data,
    onchain: onchain.data,
    explorer: mergedExplorer,
    official: official.data,
    security,
    acceleration,
    protocolContext,
    availability,
    historyBackend,
    sources: [
      ...onchain.sources,
      ...market.sources,
      ...explorer.sources,
      ...arcscanHolders.sources,
      ...official.data.sources,
      ...protocolContext.observations.flatMap((x) => x.sources),
    ],
    limitations,
  };

  const assessment = classify(scan);
  const result = { scan, assessment };
  await Promise.all([
    appendSnapshot(contract, point),
    setCachedTokenResult(contract, result),
  ]);
  return result;
}

