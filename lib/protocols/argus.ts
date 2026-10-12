import type { ProtocolObservation } from "../types";

const FUCI_BASE = (process.env.FUCI_API_URL || "https://www.fuci.family").replace(/\/$/, "");

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const bool = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export async function collectArgus(contract: string): Promise<ProtocolObservation> {
  const observedAt = new Date().toISOString();
  const url = `${FUCI_BASE}/api/token/${contract}`;

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "ArcScout/0.6" },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });

    if (response.status === 404) {
      return {
        protocolId: "argus",
        protocolName: "Argus",
        matched: false,
        sources: [{ provider: "Fuci Argus token API", url, observedAt, note: "token not found" }],
        limitations: [],
      };
    }

    if (!response.ok) {
      return {
        protocolId: "argus",
        protocolName: "Argus",
        matched: false,
        sources: [{ provider: "Fuci Argus token API", url, observedAt, note: `HTTP ${response.status}` }],
        limitations: [`Argus adapter unavailable: HTTP ${response.status}`],
      };
    }

    const data = await response.json() as Record<string, any>;
    const token = (data.token && typeof data.token === "object") ? data.token : data;

    const parsed = {
      symbol: str(token.symbol),
      priceUsdc: num(token.priceUsdc ?? token.price_usdc ?? token.price),
      buyTaxPct: num(token.buyTaxPct ?? token.buy_tax_pct ?? token.buyTax ?? token.buy_tax),
      sellTaxPct: num(token.sellTaxPct ?? token.sell_tax_pct ?? token.sellTax ?? token.sell_tax),
      bondingProgressPct: num(token.bondingProgressPct ?? token.bonding_progress_pct ?? token.progressPct ?? token.progress),
      bonded: bool(token.bonded),
      devAddress: str(token.devAddress ?? token.dev_address ?? token.dev ?? token.creator),
      poolAddress: str(token.poolAddress ?? token.pool_address ?? token.pool),
    };

    return {
      protocolId: "argus",
      protocolName: "Argus",
      matched: true,
      data: parsed,
      sources: [{ provider: "Fuci Argus token API", url, observedAt }],
      limitations: [],
    };
  } catch (error) {
    return {
      protocolId: "argus",
      protocolName: "Argus",
      matched: false,
      sources: [{ provider: "Fuci Argus token API", url, observedAt, note: "unavailable" }],
      limitations: [`Argus adapter unavailable: ${error instanceof Error ? error.message : "unknown error"}`],
    };
  }
}
