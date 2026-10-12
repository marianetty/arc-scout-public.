import type { OfficialEvidence, SourceRef } from "../types";
import { getCuratedOfficialEvidence } from "../evidence/registry";

const findNumber = (value: any, keys: string[]): number | null => {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && Number.isFinite(Number(candidate))) return Number(candidate);
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      const nested = findNumber(child, keys);
      if (nested != null) return nested;
    }
  }
  return null;
};

async function enrichUsageEvidence(evidence: OfficialEvidence): Promise<{ data: OfficialEvidence; limitation?: string }> {
  const statsUrl = evidence.usageEvidence?.statsUrl;
  if (!statsUrl) return { data: evidence };

  try {
    const response = await fetch(statsUrl, {
      headers: { accept: "application/json", "user-agent": "ArcScout/0.7" },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const stats = await response.json();

    const x402CallsPaid = findNumber(stats, ["x402CallsPaid", "x402_calls_paid", "x402Calls", "paidCalls"]);
    const agentsOnchain = findNumber(stats, ["fuciAgentsOnchain", "agentsOnchain", "agents_onchain"]);
    const totalAgentsObserved = findNumber(stats, ["arcAgents", "totalAgents", "agentsTotal", "agents"]);
    const distinctPayers = findNumber(stats, ["distinctPayers", "uniquePayers", "independentPayers", "uniqueWallets"]);

    // Different addresses do not prove different operators or external usage.
    const independenceVerified = evidence.usageEvidence?.independenceVerified ?? null;
    return {
      data: {
        ...evidence,
        externalUsageWallets: evidence.externalUsageWallets ?? null,
        activityCircularity: evidence.activityCircularity,
        usageEvidence: {
          ...evidence.usageEvidence,
          x402CallsPaid,
          agentsOnchain,
          totalAgentsObserved,
          distinctPayers,
          independenceVerified,
          note: distinctPayers != null
            ? "Distinct payer count reported by the platform; independence and external usage are not established by this count."
            : "Platform activity observed, but distinct independent payers are not explicitly exposed; independent usage remains unverified.",
        },
        sources: [
          ...evidence.sources,
          {
            provider: evidence.usageEvidence?.provider || "Usage stats",
            url: statsUrl,
            observedAt: new Date().toISOString(),
            note: "Used for platform-activity signals. Distinct addresses alone do not verify independent external usage.",
          },
        ],
      },
    };
  } catch (error) {
    return {
      data: evidence,
      limitation: `Usage evidence stats unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

export async function collectOfficial(contract: string): Promise<{ data: OfficialEvidence; limitations: string[] }> {
  const curated = getCuratedOfficialEvidence(contract);
  if (curated) {
    const enriched = await enrichUsageEvidence(curated);
    return { data: enriched.data, limitations: enriched.limitation ? [enriched.limitation] : [] };
  }

  const registry = process.env.ARC_SCOUT_OFFICIAL_REGISTRY_URL;
  if (!registry) {
    return {
      data: {
        officialContractConfirmed: null,
        confidence: "UNKNOWN",
        productState: "UNKNOWN",
        tokenUtilityVerified: null,
        activityCircularity: "UNKNOWN",
        usageEvidence: null,
        notes: ["No curated or remote official evidence exists for this contract; attribution intentionally left unknown."],
        sources: [],
      },
      limitations: ["No verified official-evidence entry exists for this contract"]
    };
  }

  const url = `${registry}${registry.includes("?") ? "&" : "?"}contract=${encodeURIComponent(contract)}`;
  try {
    const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "ArcScout/0.3" }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const x = await r.json() as Partial<OfficialEvidence>;
    const sources: SourceRef[] = Array.isArray(x.sources) ? x.sources : [];
    return {
      data: {
        officialContractConfirmed: x.officialContractConfirmed ?? null,
        confidence: x.confidence ?? "UNKNOWN",
        productState: x.productState ?? "UNKNOWN",
        productUrl: x.productUrl ?? null,
        tokenUtilityVerified: x.tokenUtilityVerified ?? null,
        externalUsageWallets: x.externalUsageWallets ?? null,
        activityCircularity: x.activityCircularity ?? "UNKNOWN",
        usageEvidence: x.usageEvidence ?? null,
        notes: Array.isArray(x.notes) ? x.notes : [],
        sources,
      },
      limitations: [],
    };
  } catch (e) {
    return {
      data: { officialContractConfirmed: null, confidence: "UNKNOWN", productState: "UNKNOWN", tokenUtilityVerified: null, activityCircularity: "UNKNOWN", usageEvidence: null, notes: ["Official registry unavailable"], sources: [] },
      limitations: [`Official evidence unavailable: ${e instanceof Error ? e.message : "unknown error"}`],
    };
  }
}

