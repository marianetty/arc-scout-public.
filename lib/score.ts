import type { Classification, TokenScan } from "./types";

export type Assessment = {
  classification: Classification;
  score: number;
  blockers: string[];
  missing: string[];
  positives: string[];
  invalidators: string[];
  label: string;
};

export function classify(s: TokenScan): Assessment {
  const blockers: string[] = [];
  const missing: string[] = [];
  const positives: string[] = [];
  const invalidators: string[] = [];
  let score = 0;

  if (s.onchain.codeExists === false) blockers.push("address has no contract bytecode on Arc mainnet");
  if (s.onchain.codeExists == null) missing.push("contract bytecode check unavailable");
  if (s.official.officialContractConfirmed === false) blockers.push("official source rejects/does not confirm this contract");
  if (s.security.honeypotFlag === true) blockers.push("honeypot flag unresolved");
  if (s.security.criticalAdminRisk === true) blockers.push("critical admin risk unresolved");
  if (s.security.sellObserved === false) blockers.push("no sell/exit evidence");
  if (s.security.sellSimulation === "FAILED") blockers.push("independent sell simulation failed; cause unresolved");

  if (s.official.officialContractConfirmed === true) { score += 20; positives.push("contract confirmed by official evidence"); }
  else missing.push("official contract confirmation by contract address");

  if (["LIVE", "BETA"].includes(s.official.productState)) { score += 20; positives.push(`${s.official.productState.toLowerCase()} product`); }
  else if (s.official.productState === "DEMO") { score += 10; positives.push("functional demo"); }
  else missing.push("functional product/use verification");

  const liq = s.market.liquidityUsd ?? 0;
  if (liq >= 10_000) { score += 15; positives.push("liquidity above $10k"); }
  else if (liq >= 2_000) { score += 8; positives.push("early liquidity above $2k"); }
  else missing.push("meaningful tradable liquidity");

  const tx24 = (s.market.buys24h ?? 0) + (s.market.sells24h ?? 0);
  if (tx24 >= 20) { score += 10; positives.push("multi-transaction market activity"); }
  else if (tx24 > 0) score += 4;
  else missing.push("market activity");

  if (s.security.sellObserved === true) { score += 10; positives.push("completed sells observed"); }
  else missing.push("sell/exit evidence or simulation");

  if ((s.official.externalUsageWallets ?? 0) >= 2) { score += 10; positives.push("independent external usage observed"); }
  else missing.push("2+ independent usage wallets/jobs/payers");

  if (s.official.tokenUtilityVerified === true) { score += 15; positives.push("token utility/value capture verified"); }
  else missing.push("verified token utility/value capture");

  if (s.onchain.proxyImplementation) missing.push("proxy implementation/admin powers review");
  if (s.onchain.owner) missing.push("owner powers review");
  if (s.security.honeypotFlag === null) missing.push("independent honeypot/security provider check");
  if (s.security.taxRisk === "UNKNOWN") missing.push("buy/sell tax verification");

  if (s.acceleration.signal === "STRONG") { score += 8; positives.push("strong market acceleration versus previous snapshot"); }
  else if (s.acceleration.signal === "RISING") { score += 4; positives.push("rising market activity versus previous snapshot"); }

  const mc = s.market.marketCapUsd ?? s.market.fdvUsd;
  if (mc !== null && mc !== undefined && mc < 50_000) positives.push("extra-early valuation (<$50k)");
  else if (mc !== null && mc !== undefined && mc < 150_000) positives.push("early valuation (<$150k)");

  invalidators.push("official contract attribution fails", "sell/exit becomes blocked", "critical owner/proxy/mint/blacklist power is found and unexplained", "product/use evidence proves circular or non-functional");

  score = Math.max(0, Math.min(100, score));
  if (blockers.length) return { classification: "WATCH_ONLY", score, blockers, missing, positives, invalidators, label: "VIGILANCIA: blocker unresolved" };

  const verified =
    s.onchain.codeExists === true &&
    s.official.officialContractConfirmed === true &&
    ["LIVE", "BETA"].includes(s.official.productState) &&
    liq > 10_000 && tx24 >= 10 && s.security.sellObserved === true &&
    s.official.tokenUtilityVerified === true && (s.official.externalUsageWallets ?? 0) >= 2 &&
    s.security.honeypotFlag === false && s.security.sellSimulation === "SIMULATED_OK" &&
    s.security.criticalAdminRisk !== true;
  if (verified) return { classification: "VERIFIED_CANDIDATE", score, blockers, missing, positives, invalidators, label: "CANDIDATO VERIFICADO (research classification, not a buy recommendation)" };

  const early =
    s.official.officialContractConfirmed === true &&
    ["LIVE", "BETA", "DEMO"].includes(s.official.productState) &&
    (liq >= 2_000 || tx24 >= 8 || (s.market.volume1hUsd ?? 0) >= 3_000 || (s.market.volume24hUsd ?? 0) >= 3_000 || s.acceleration.signal === "STRONG");
  return { classification: early ? "EARLY_SIGNAL" : "PRE_SIGNAL", score, blockers, missing, positives, invalidators, label: early ? "SEÑAL TEMPRANA — NO APTO AÚN PARA COMPRAR" : "PRE-SEÑAL — evidencia insuficiente para alerta" };
}

