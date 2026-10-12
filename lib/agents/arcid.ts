import type { SourceRef } from "../types";

const ARCID_API = (process.env.ARCID_API_URL || "https://api.arcusid.com").replace(/\/$/, "");

type ArcIdEnvelope<T = unknown> = {
  success?: boolean;
  data?: T;
  error?: string | null;
  meta?: unknown;
};

export type ArcIdIndexerHealth = {
  available: boolean;
  indexedBlock?: number | null;
  chainHead?: number | null;
  blocksBehind?: number | null;
  raw?: unknown;
};

export type ArcIdAgentIntelligence = {
  agentId: number;
  identity: {
    name?: string | null;
    description?: string | null;
    image?: string | null;
    owner?: string | null;
    agentWallet?: string | null;
    active?: boolean | null;
    x402Support?: boolean | null;
    metadataStatus?: string | null;
    registeredBlock?: number | null;
    registeredTx?: string | null;
    services: Array<{ name?: string | null; endpoint?: string | null }>;
  };
  reputation: {
    trustScore?: number | null;
    feedbackCount?: number | null;
    settledUsdc?: number | null;
    payingClients?: number | null;
    unpaidClients?: number | null;
  };
  validations: {
    availableOnNetwork: boolean;
    total?: number | null;
    passed?: number | null;
  };
  settlementEvidence?: unknown;
  provenance: "ARCID_INDEXER";
  source: SourceRef;
  raw: unknown;
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const bool = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const str = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

function findValue(value: unknown, keys: string[], depth = 0): unknown {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  for (const child of Object.values(record)) {
    const found = findValue(child, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function normalizeServices(value: unknown): Array<{ name?: string | null; endpoint?: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        name: str(row.name ?? row.type),
        endpoint: str(row.endpoint ?? row.url),
      };
    });
}

async function arcIdFetch<T>(path: string, timeoutMs = 8_000): Promise<ArcIdEnvelope<T>> {
  const response = await fetch(`${ARCID_API}${path}`, {
    headers: {
      accept: "application/json",
      "user-agent": "ArcScout/0.8",
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`ArcID HTTP ${response.status}`);

  const body = await response.json() as ArcIdEnvelope<T>;
  if (body.success === false) throw new Error(body.error || "ArcID request failed");
  return body;
}

export async function getArcIdIndexerHealth(): Promise<ArcIdIndexerHealth> {
  try {
    const response = await arcIdFetch<Record<string, unknown>>("/health", 5_000);
    const data = response.data ?? response;
    return {
      available: true,
      indexedBlock: num(findValue(data, ["indexedBlock", "indexed_block", "lastIndexedBlock"])),
      chainHead: num(findValue(data, ["chainHead", "chain_head", "headBlock", "latestBlock"])),
      blocksBehind: num(findValue(data, ["blocksBehind", "blocks_behind", "lagBlocks", "behind"])),
      raw: data,
    };
  } catch {
    return { available: false };
  }
}

export async function getArcIdAgent(agentId: number): Promise<{
  data: ArcIdAgentIntelligence;
  limitations: string[];
}> {
  const observedAt = new Date().toISOString();
  const response = await arcIdFetch<unknown>(`/v1/agents/${agentId}`);
  const data = response.data ?? response;

  const services = normalizeServices(findValue(data, ["services"]));
  const validationsTotal = num(findValue(data, ["validationCount", "validationsCount", "totalValidations", "total"]));
  const validationsPassed = num(findValue(data, ["validationPassed", "validationsPassed", "passedValidations", "passed"]));

  const intelligence: ArcIdAgentIntelligence = {
    agentId,
    identity: {
      name: str(findValue(data, ["name", "agentName"])),
      description: str(findValue(data, ["description", "bio"])),
      image: str(findValue(data, ["image", "avatar", "imageUrl"])),
      owner: str(findValue(data, ["owner", "ownerAddress", "wallet"])),
      agentWallet: str(findValue(data, ["agentWallet", "agent_wallet"])),
      active: bool(findValue(data, ["active", "isActive"])),
      x402Support: bool(findValue(data, ["x402Support", "x402_support", "x402"])),
      metadataStatus: str(findValue(data, ["metadataStatus", "metadata_status"])),
      registeredBlock: num(findValue(data, ["registeredBlock", "registered_block"])),
      registeredTx: str(findValue(data, ["registeredTx", "registered_tx", "registrationTx"])),
      services,
    },
    reputation: {
      trustScore: num(findValue(data, ["trustScore", "trust_score", "score"])),
      feedbackCount: num(findValue(data, ["feedbackCount", "feedback_count", "reviews"])),
      settledUsdc: num(findValue(data, ["settledUsdc", "settledUSDC", "settled_usdc", "settledVolume"])),
      payingClients: num(findValue(data, ["payingClients", "paying_clients", "paidClients", "paid_clients"])),
      unpaidClients: num(findValue(data, ["unpaidClients", "unpaid_clients"])),
    },
    validations: {
      // ArcID docs: Validation Registry is not deployed on Arc mainnet yet.
      availableOnNetwork: false,
      total: validationsTotal,
      passed: validationsPassed,
    },
    settlementEvidence: findValue(data, ["settlement", "settlementEvidence", "settlements"]),
    provenance: "ARCID_INDEXER",
    source: {
      provider: "ArcID indexer",
      url: `${ARCID_API}/v1/agents/${agentId}`,
      observedAt,
      note: "External ERC-8004 identity/reputation context. Arc Scout does not treat ArcID Trust Score as an independent Arc Scout verification.",
    },
    raw: data,
  };

  const limitations: string[] = [
    "ArcID Trust Score is external reputation context, not an Arc Scout security or product verdict.",
    "Arc mainnet Validation Registry is not deployed yet; missing validations must not be treated as negative evidence.",
  ];

  return { data: intelligence, limitations };
}

export async function searchArcIdAgents(params: {
  q?: string | null;
  owner?: string | null;
  sort?: "newest" | "score" | "feedback" | "settled" | "relevance";
  page?: number;
  limit?: number;
}): Promise<{ data: unknown; source: SourceRef }> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.owner) query.set("owner", params.owner);
  if (params.sort) query.set("sort", params.sort);
  query.set("page", String(Math.max(1, params.page || 1)));
  query.set("limit", String(Math.min(100, Math.max(1, params.limit || 20))));

  const path = `/v1/agents?${query.toString()}`;
  const response = await arcIdFetch<unknown>(path);
  return {
    data: response.data ?? response,
    source: {
      provider: "ArcID indexer",
      url: `${ARCID_API}${path}`,
      observedAt: new Date().toISOString(),
      note: "Agent discovery supplied by ArcID's ERC-8004 indexer.",
    },
  };
}
