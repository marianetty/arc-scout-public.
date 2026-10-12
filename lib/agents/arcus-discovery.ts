import type { SourceRef } from "../types";

const ARCUS_CATALOG = process.env.ARCUS_MERCHANT_CATALOG_URL || "https://arcusnetwork.co/api/merchants";

export type X402Endpoint = {
  merchantId: string;
  merchantName: string;
  merchantBy?: string | null;
  official?: boolean | null;
  partner?: boolean | null;
  payTo?: string | null;
  agentId?: number | null;
  method?: string | null;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  pricing?: string | null;
  priceRaw?: string | null;
  priceUsd?: number | null;
  params: string[];
  network?: string | null;
  asset?: string | null;
};

const n = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const s = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export async function collectArcusCatalog(): Promise<{
  endpoints: X402Endpoint[];
  merchantCount: number;
  source: SourceRef;
  limitations: string[];
}> {
  const observedAt = new Date().toISOString();

  try {
    const response = await fetch(ARCUS_CATALOG, {
      headers: { accept: "application/json", "user-agent": "ArcScout/0.8" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { merchants?: any[] };
    const merchants = Array.isArray(body?.merchants) ? body.merchants : [];

    const endpoints: X402Endpoint[] = merchants.flatMap((merchant: any) => {
      const rows = Array.isArray(merchant?.endpoints) ? merchant.endpoints : [];
      return rows.map((endpoint: any) => ({
        merchantId: s(merchant?.id) || "unknown",
        merchantName: s(merchant?.name) || s(merchant?.id) || "Unknown merchant",
        merchantBy: s(merchant?.by),
        official: typeof merchant?.official === "boolean" ? merchant.official : null,
        partner: typeof merchant?.partner === "boolean" ? merchant.partner : null,
        payTo: s(merchant?.payTo),
        agentId: n(merchant?.identity?.agentId),
        method: s(endpoint?.method),
        url: s(endpoint?.url),
        title: s(endpoint?.title),
        description: s(endpoint?.description),
        pricing: s(endpoint?.pricing),
        priceRaw: endpoint?.price != null ? String(endpoint.price) : null,
        priceUsd: n(endpoint?.priceUsd),
        params: Array.isArray(endpoint?.params) ? endpoint.params.filter((x: unknown) => typeof x === "string") : [],
        network: s(merchant?.network),
        asset: s(merchant?.asset),
      }));
    });

    return {
      endpoints,
      merchantCount: merchants.length,
      source: {
        provider: "Arcus x402 merchant catalog",
        url: ARCUS_CATALOG,
        observedAt,
        note: "Self-serve merchant directory. Listing does not by itself prove that an endpoint is functional or trustworthy.",
      },
      limitations: [
        "Arcus merchant listings are self-serve and unreviewed; Arcus facilitates payments but does not vouch for upstream APIs.",
        "Endpoint reachability and successful paid execution require independent Arc Scout verification.",
      ],
    };
  } catch (error) {
    return {
      endpoints: [],
      merchantCount: 0,
      source: {
        provider: "Arcus x402 merchant catalog",
        url: ARCUS_CATALOG,
        observedAt,
        note: "unavailable",
      },
      limitations: [`Arcus catalog unavailable: ${error instanceof Error ? error.message : "unknown error"}`],
    };
  }
}
