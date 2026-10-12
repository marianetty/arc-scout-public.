import type { AccelerationSnapshot, MarketSnapshot, SnapshotPoint } from "./types";

function pctChange(current?: number | null, previous?: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function ratio(current?: number | null, previous?: number | null): number | null {
  if (current == null || previous == null || previous <= 0) return null;
  return current / previous;
}

export function toSnapshotPoint(generatedAt: string, market: MarketSnapshot): SnapshotPoint {
  return {
    observedAt: generatedAt,
    marketCapUsd: market.marketCapUsd ?? null,
    fdvUsd: market.fdvUsd ?? null,
    liquidityUsd: market.liquidityUsd ?? null,
    volume1hUsd: market.volume1hUsd ?? null,
    volume24hUsd: market.volume24hUsd ?? null,
    buys1h: market.buys1h ?? null,
    sells1h: market.sells1h ?? null,
    buys24h: market.buys24h ?? null,
    sells24h: market.sells24h ?? null,
  };
}

export function deriveAcceleration(current: SnapshotPoint, history: SnapshotPoint[]): AccelerationSnapshot {
  const previous = history.length ? history[history.length - 1] : null;
  if (!previous) {
    return {
      previousObservedAt: null,
      elapsedMinutes: null,
      liquidityChangePct: null,
      marketCapChangePct: null,
      fdvChangePct: null,
      volume1hRatio: null,
      tx1hRatio: null,
      signal: "NO_BASELINE",
      notes: ["First observation in this running process; acceleration requires at least two snapshots."],
    };
  }

  const elapsedMinutes = Math.max(0, (Date.parse(current.observedAt) - Date.parse(previous.observedAt)) / 60_000);
  const currentTx1h = (current.buys1h ?? 0) + (current.sells1h ?? 0);
  const previousTx1h = (previous.buys1h ?? 0) + (previous.sells1h ?? 0);
  const liquidityChangePct = pctChange(current.liquidityUsd, previous.liquidityUsd);
  const marketCapChangePct = pctChange(current.marketCapUsd, previous.marketCapUsd);
  const fdvChangePct = pctChange(current.fdvUsd, previous.fdvUsd);
  const volume1hRatio = ratio(current.volume1hUsd, previous.volume1hUsd);
  const tx1hRatio = ratio(currentTx1h, previousTx1h);

  const strong =
    (volume1hRatio != null && volume1hRatio >= 2) ||
    (tx1hRatio != null && tx1hRatio >= 2) ||
    (liquidityChangePct != null && liquidityChangePct >= 50);
  const rising =
    strong ||
    (volume1hRatio != null && volume1hRatio >= 1.35) ||
    (tx1hRatio != null && tx1hRatio >= 1.35) ||
    (liquidityChangePct != null && liquidityChangePct >= 20);
  const falling =
    (volume1hRatio != null && volume1hRatio <= 0.6) &&
    (tx1hRatio == null || tx1hRatio <= 0.8);

  const notes: string[] = [];
  if (strong) notes.push("Strong acceleration detected from liquidity, hourly volume or hourly transaction count.");
  else if (rising) notes.push("Moderate acceleration detected versus the previous observation.");
  else if (falling) notes.push("Market activity decelerated versus the previous observation.");
  else notes.push("No material acceleration detected versus the previous observation.");

  return {
    previousObservedAt: previous.observedAt,
    elapsedMinutes,
    liquidityChangePct,
    marketCapChangePct,
    fdvChangePct,
    volume1hRatio,
    tx1hRatio,
    signal: strong ? "STRONG" : rising ? "RISING" : falling ? "FALLING" : "FLAT",
    notes,
  };
}
