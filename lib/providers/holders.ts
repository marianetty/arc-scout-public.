import type { ExplorerSnapshot, SourceRef } from "../types";

const TYPED_BASE = (process.env.ARCSCAN_API_URL || "https://api.arc-scan.org/v1").replace(/\/$/, "");
const API_BASE = TYPED_BASE.endsWith("/v1") ? TYPED_BASE.slice(0, -3) : "https://api.arc-scan.org";

type Result = {
  data: Partial<ExplorerSnapshot>;
  sources: SourceRef[];
  limitations: string[];
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const first = (obj: any, keys: string[]) => {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return null;
};

function findHolderRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const key of ["holders", "items", "results", "data", "rows"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  for (const value of Object.values(payload)) {
    if (value && typeof value === "object") {
      const nested = findHolderRows(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizeAddress(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return String(
      first(value, ["checksum", "address", "hash", "value"]) || "unknown"
    );
  }
  return "unknown";
}

function normalizeRawBalance(row: any): string | null {
  const nested = first(row?.balance, ["raw"]);
  const direct = first(row, [
    "balance_raw",
    "value_raw",
    "raw_balance",
    "TokenHolderQuantity",
    "tokenHolderQuantity",
    "balance",
    "value",
  ]);
  const value = nested ?? direct;
  if (value == null || typeof value === "object") return null;
  return String(value);
}

function normalizePct(value: unknown): number | null {
  const n = num(value);
  if (n == null) return null;
  return n >= 0 && n <= 1 ? n * 100 : n;
}

async function getJson(url: string): Promise<{ data: any | null; error: string | null }> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "ArcScout/0.7" },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const code = body?.error?.code || `HTTP ${response.status}`;
      return { data: null, error: code };
    }
    return { data: body, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "unknown error" };
  }
}

function compatibleRows(payload: any): any[] {
  return payload?.status === "1" && Array.isArray(payload?.result) ? payload.result : [];
}

export async function collectArcscanHolders(contract: string): Promise<Result> {
  const observedAt = new Date().toISOString();
  const holdersUrl = `${TYPED_BASE}/tokens/${contract}/holders?limit=10`;
  const concentrationUrl = `${TYPED_BASE}/tokens/${contract}/concentration`;
  const compatibleHoldersUrl = `${API_BASE}/api?module=token&action=tokenholderlist&contractaddress=${contract}&page=1&offset=10`;
  const supplyUrl = `${API_BASE}/api?module=stats&action=tokensupply&contractaddress=${contract}`;

  const [holdersResult, concentrationResult, compatibleResult, supplyResult] = await Promise.all([
    getJson(holdersUrl),
    getJson(concentrationUrl),
    getJson(compatibleHoldersUrl),
    getJson(supplyUrl),
  ]);

  const typedRows = findHolderRows(holdersResult.data);
  const fallbackRows = compatibleRows(compatibleResult.data);
  const rows = typedRows.length ? typedRows : fallbackRows;

  const totalSupplyRaw =
    supplyResult.data?.status === "1" && typeof supplyResult.data?.result === "string"
      ? supplyResult.data.result
      : null;

  const topHolders = rows.slice(0, 10).map((row: any) => {
    const raw = normalizeRawBalance(row);
    let percentage = normalizePct(
      first(row, ["percentage", "share_pct", "share_percent", "supply_pct", "percent", "share"])
    );

    if (percentage == null && raw && totalSupplyRaw) {
      try {
        const balance = BigInt(raw);
        const supply = BigInt(totalSupplyRaw);
        if (supply > 0n) {
          percentage = Number((balance * 1_000_000n) / supply) / 10_000;
        }
      } catch {
        // Keep percentage unknown if a provider returns a non-integer balance.
      }
    }

    return {
      address: normalizeAddress(
        first(row, [
          "address",
          "holder",
          "account",
          "address_hash",
          "TokenHolderAddress",
          "tokenHolderAddress",
        ])
      ),
      valueRaw: raw,
      percentage,
    };
  });

  const holderCount = num(first(holdersResult.data, [
    "holder_count",
    "holders_count",
    "total_holders",
    "count",
    "total",
  ]));

  const concentration = concentrationResult.data || {};
  let top10 = normalizePct(first(concentration, [
    "top_10_pct",
    "top10_pct",
    "top_10_percent",
    "top10_percent",
    "top_10_share",
    "top10_share",
  ]));

  if (top10 == null) {
    const percentages = topHolders
      .map((holder) => holder.percentage)
      .filter((value): value is number => typeof value === "number");
    if (percentages.length) top10 = percentages.reduce((sum, value) => sum + value, 0);
  }

  const hasHolderData = topHolders.length > 0 || holderCount != null || top10 != null;

  return {
    data: hasHolderData ? {
      holdersCount: holderCount,
      topHolders,
      holderDataSource: "ARCSCAN",
      holderDataComplete: true,
      holderDataFromBlock: "0",
      holderDataToBlock: null,
      concentrationTop10Pct: top10,
    } : {},
    sources: [
      { provider: "Arcscan typed holder index", url: holdersUrl, observedAt },
      { provider: "Arcscan concentration", url: concentrationUrl, observedAt },
      { provider: "Arcscan compatible tokenholderlist", url: compatibleHoldersUrl, observedAt },
      { provider: "Arcscan compatible tokensupply", url: supplyUrl, observedAt },
    ],
    limitations: [
      ...(holdersResult.error ? [`Arcscan typed holders unavailable: ${holdersResult.error}`] : []),
      ...(concentrationResult.error ? [`Arcscan concentration unavailable: ${concentrationResult.error}`] : []),
      ...(compatibleResult.error ? [`Arcscan compatible holders unavailable: ${compatibleResult.error}`] : []),
      ...(supplyResult.error ? [`Arcscan token supply unavailable: ${supplyResult.error}`] : []),
      ...(!hasHolderData
        ? [`Arcscan returned no usable holder data (typed rows=${typedRows.length}, compatible rows=${fallbackRows.length}).`]
        : []),
    ],
  };
}
