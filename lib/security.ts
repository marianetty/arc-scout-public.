import type { ExplorerSnapshot, MarketSnapshot, OnchainSnapshot, ProtocolContext, SecuritySnapshot } from "./types";

export function deriveSecurity(
  market: MarketSnapshot,
  onchain: OnchainSnapshot,
  explorer: ExplorerSnapshot,
  protocolContext?: ProtocolContext,
): SecuritySnapshot {
  const sells = market.sells24h ?? market.sells1h ?? market.sells5m;
  const sellObserved = sells === null || sells === undefined ? null : sells > 0;
  const percentages = (explorer.topHolders || []).map((h) => h.percentage).filter((x): x is number => typeof x === "number");
  const top10 = explorer.concentrationTop10Pct ?? (percentages.length ? percentages.reduce((a, b) => a + b, 0) : null);
  const analysis = explorer.contractAnalysis;
  const argus = protocolContext?.observations.find((x) => x.protocolId === "argus" && x.matched);
  const buyTaxPct = argus?.data?.buyTaxPct ?? null;
  const sellTaxPct = argus?.data?.sellTaxPct ?? null;
  const notes: string[] = [];

  if (onchain.proxyImplementation) notes.push(`EIP-1967 proxy implementation detected: ${onchain.proxyImplementation}`);
  if (onchain.owner) notes.push(`Standard owner() detected: ${onchain.owner}; actual powers require source/ABI review.`);
  if (sellObserved) notes.push("Market provider reports completed sells; this is exit evidence, not a deterministic sell simulation.");

  if (analysis?.mintHint) notes.push("Verified ABI/source exposes a mint/issue-like function name; authorization and reachability are not yet proven.");
  if (analysis?.pauseHint) notes.push("Verified ABI/source exposes pause/unpause-like functions.");
  if (analysis?.blacklistHint) notes.push("Verified ABI/source exposes blacklist/blocklist-like functions.");
  if (analysis?.taxSetterHint) notes.push("Verified ABI/source exposes fee/tax setter-like functions.");
  if (analysis?.upgradeHint) notes.push("Verified ABI/source exposes upgrade-like functions.");
  if (analysis?.accessControlHint) notes.push("Verified ABI/source exposes role-based access-control functions.");
  if (analysis?.adminSetterHint) notes.push("Verified ABI/source exposes one or more privileged setter/admin-like functions; authorization must be reviewed.");
  if ((analysis?.privilegedFunctionNames?.length ?? 0) > 0) {
    notes.push(`Privileged/admin surface observed in ABI: ${analysis!.privilegedFunctionNames.join(", ")}.`);
  }
  if (buyTaxPct != null || sellTaxPct != null) {
    notes.push(`Argus reports buy/sell tax: ${buyTaxPct ?? "unknown"}% / ${sellTaxPct ?? "unknown"}%. Effective tax on the current market is not independently verified.`);
  }

  // Function-name hints do not establish authorization or executable powers.
  const criticalAdminRisk = null;

  return {
    sellObserved,
    honeypotFlag: null,
    criticalAdminRisk,
    // Protocol-reported terms and setter hints do not verify the effective trading tax.
    taxRisk: "UNKNOWN",
    sellSimulation: sellObserved ? "OBSERVED_MARKET_SELLS" : "NOT_RUN",
    concentrationTop10Pct: top10,
    mintCapabilityHint: analysis?.mintHint ?? null,
    pauseCapabilityHint: analysis?.pauseHint ?? null,
    blacklistCapabilityHint: analysis?.blacklistHint ?? null,
    upgradeCapabilityHint: analysis?.upgradeHint ?? (onchain.proxyImplementation ? true : null),
    accessControlHint: analysis?.accessControlHint ?? null,
    adminSetterHint: analysis?.adminSetterHint ?? null,
    privilegedFunctionNames: analysis?.privilegedFunctionNames ?? [],
    notes,
  };
}

