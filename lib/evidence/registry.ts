import type { OfficialEvidence } from "../types";

type CuratedEvidenceEntry = OfficialEvidence & {
  contract: string;
};

const observedAt = "2026-09-29T00:00:00.000Z";

export const CURATED_OFFICIAL_EVIDENCE: CuratedEvidenceEntry[] = [
  {
    contract: "0xe66d5169c5d235209d74e976e594060c44c64420",
    officialContractConfirmed: true,
    confidence: "HIGH",
    productState: "LIVE",
    productUrl: "https://www.fuci.family/",
    tokenUtilityVerified: true,
    externalUsageWallets: null,
    activityCircularity: "UNKNOWN",
    usageEvidence: {
      provider: "Fuci public stats",
      statsUrl: "https://www.fuci.family/api/stats",
      x402CallsPaid: null,
      agentsOnchain: null,
      totalAgentsObserved: null,
      distinctPayers: null,
      independenceVerified: null,
      note: "Platform activity may be substantial, but only explicit distinct-payer evidence counts as independent usage.",
    },
    notes: [
      "Fuci's official website publishes the exact $FUCI contract address.",
      "Fuci presents a live Arc product with on-chain agents and paid x402 API calls.",
      "$FUCI utility/value capture is explicitly described: 1% buy tax and 1% sell tax, with holder USDC dividends from the creator share.",
      "Independent external-usage wallet count is intentionally left unknown; Fuci-created agents are not automatically treated as independent economic users.",
    ],
    sources: [
      {
        provider: "Fuci official website",
        url: "https://www.fuci.family/",
        observedAt,
        note: "Exact contract, live product and token value-capture mechanism published by project.",
      },
    ],
  },
];

export function getCuratedOfficialEvidence(contract: string): OfficialEvidence | null {
  const normalized = contract.toLowerCase();
  const hit = CURATED_OFFICIAL_EVIDENCE.find((entry) => entry.contract.toLowerCase() === normalized);
  if (!hit) return null;

  const { contract: _contract, ...evidence } = hit;
  return evidence;
}
