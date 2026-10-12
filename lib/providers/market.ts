import type { MarketSnapshot, SourceRef } from "../types";

const BASE = process.env.DEXSCREENER_API_URL || "https://api.dexscreener.com/latest/dex/tokens";
const ARC_CHAIN_IDS = new Set(["arc", "arc-network", "5042"]);
const n = (v: unknown): number | null => v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

export async function collectMarket(contract: string): Promise<{ data: MarketSnapshot; sources: SourceRef[]; limitations: string[] }> {
  const observedAt = new Date().toISOString();
  const url = `${BASE}/${contract}`;
  try {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "ArcScout/0.3" }, signal: AbortSignal.timeout(8_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json() as { pairs?: any[] };
    const all = Array.isArray(body.pairs) ? body.pairs : [];
    const arcPairs = all.filter((p) => ARC_CHAIN_IDS.has(String(p.chainId || "").toLowerCase()));
    const pairs = arcPairs.length ? arcPairs : all;
    const primary = [...pairs].sort((a, b) => (n(b?.liquidity?.usd) ?? 0) - (n(a?.liquidity?.usd) ?? 0))[0];
    if (!primary) return { data: {}, sources: [{ provider: "DexScreener", url, observedAt }], limitations: ["No market pair returned for contract"] };

    const tx = primary.txns || {};
    const vol = primary.volume || {};
    return {
      data: {
        pairAddress: primary.pairAddress ?? null,
        dexId: primary.dexId ?? null,
        priceUsd: n(primary.priceUsd),
        marketCapUsd: n(primary.marketCap),
        fdvUsd: n(primary.fdv),
        liquidityUsd: n(primary?.liquidity?.usd),
        volume5mUsd: n(vol.m5), volume1hUsd: n(vol.h1), volume6hUsd: n(vol.h6), volume24hUsd: n(vol.h24),
        buys5m: n(tx?.m5?.buys), sells5m: n(tx?.m5?.sells), buys1h: n(tx?.h1?.buys), sells1h: n(tx?.h1?.sells),
        buys24h: n(tx?.h24?.buys), sells24h: n(tx?.h24?.sells),
        pairCreatedAt: n(primary.pairCreatedAt),
        url: primary.url ?? null,
      },
      sources: [{ provider: "DexScreener", url, observedAt }],
      limitations: arcPairs.length ? [] : ["Provider did not label an Arc-specific pair; best returned pair used and must be cross-checked"],
    };
  } catch (e) {
    return { data: {}, sources: [{ provider: "DexScreener", url, observedAt, note: "unavailable" }], limitations: [`Market provider unavailable: ${e instanceof Error ? e.message : "unknown error"}`] };
  }
}
