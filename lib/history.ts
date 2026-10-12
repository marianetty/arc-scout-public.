import type { SnapshotPoint } from "./types";

const MAX_POINTS_PER_CONTRACT = 96;
const memory = new Map<string, SnapshotPoint[]>();

const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisEnabled = Boolean(redisUrl && redisToken);

function key(contract: string) {
  return `arc-scout:history:${contract.toLowerCase()}`;
}

function tokenResultKey(contract: string) {
  return `arc-scout:token-result:${contract.toLowerCase()}`;
}

function serviceEvidenceKey(serviceId: string) {
  return `arc-scout:x402-evidence:${serviceId}`;
}

async function redisCommand<T>(command: unknown[]): Promise<T> {
  if (!redisUrl || !redisToken) throw new Error("Redis is not configured");
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${redisToken}`,
      "content-type": "application/json",
      "user-agent": "ArcScout/0.4",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Redis HTTP ${response.status}`);
  const body = await response.json() as { result?: T; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result as T;
}

export async function getHistory(contract: string): Promise<SnapshotPoint[]> {
  const k = contract.toLowerCase();

  if (redisEnabled) {
    try {
      const raw = await redisCommand<string | null>(["GET", key(k)]);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SnapshotPoint[];
      return Array.isArray(parsed) ? parsed.slice(-MAX_POINTS_PER_CONTRACT) : [];
    } catch {
      // Fail soft: scans remain available even if durable storage is temporarily down.
    }
  }

  return [...(memory.get(k) ?? [])];
}

export async function appendSnapshot(contract: string, point: SnapshotPoint): Promise<void> {
  const k = contract.toLowerCase();

  if (redisEnabled) {
    try {
      const previous = await getHistory(k);
      const next = [...previous, point].slice(-MAX_POINTS_PER_CONTRACT);
      await redisCommand(["SET", key(k), JSON.stringify(next)]);
      return;
    } catch {
      // Fall through to process memory.
    }
  }

  const items = memory.get(k) ?? [];
  items.push(point);
  if (items.length > MAX_POINTS_PER_CONTRACT) items.splice(0, items.length - MAX_POINTS_PER_CONTRACT);
  memory.set(k, items);
}

export async function clearHistory(contract?: string): Promise<void> {
  if (contract) {
    const k = contract.toLowerCase();
    memory.delete(k);
    if (redisEnabled) {
      try { await redisCommand(["DEL", key(k)]); } catch {}
    }
    return;
  }

  memory.clear();
  // Deliberately do not wildcard-delete Redis keys.
}

export const historyBackend = redisEnabled ? "UPSTASH_REDIS" as const : "PROCESS_MEMORY" as const;

export async function checkHistoryBackend(): Promise<{
  backend: "UPSTASH_REDIS" | "PROCESS_MEMORY";
  configured: boolean;
  reachable: boolean;
  writable?: boolean;
  error: string | null;
}> {
  if (!redisEnabled) {
    return { backend: "PROCESS_MEMORY", configured: false, reachable: true, error: null };
  }

  try {
    const ping = await redisCommand<string>(["PING"]);
    if (ping !== "PONG") {
      return {
        backend: "UPSTASH_REDIS",
        configured: true,
        reachable: false,
        error: `Unexpected Redis PING response: ${String(ping)}`,
      };
    }

    const probeKey = "arc-scout:health:write-probe";
    const probeValue = "ok";
    await redisCommand(["SET", probeKey, probeValue, "EX", 60]);
    const readBack = await redisCommand<string | null>(["GET", probeKey]);
    await redisCommand(["DEL", probeKey]);

    return {
      backend: "UPSTASH_REDIS",
      configured: true,
      reachable: true,
      writable: readBack === probeValue,
      error: readBack === probeValue ? null : "Redis write/read probe failed",
    };
  } catch (error) {
    return {
      backend: "UPSTASH_REDIS",
      configured: true,
      reachable: false,
      writable: false,
      error: error instanceof Error ? error.message : "Unknown Redis error",
    };
  }
}


export async function setCachedTokenResult(contract: string, result: unknown): Promise<boolean> {
  if (!redisEnabled) return false;
  try {
    await redisCommand(["SET", tokenResultKey(contract), JSON.stringify(result)]);
    return true;
  } catch {
    return false;
  }
}

export async function getCachedTokenResult<T = unknown>(contract: string): Promise<T | null> {
  if (!redisEnabled) return null;
  try {
    const raw = await redisCommand<string | null>(["GET", tokenResultKey(contract)]);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}


export async function setCachedServiceEvidence(serviceId: string, result: unknown): Promise<boolean> {
  if (!redisEnabled) return false;
  try {
    await redisCommand(["SET", serviceEvidenceKey(serviceId), JSON.stringify(result)]);
    return true;
  } catch {
    return false;
  }
}

export async function getCachedServiceEvidence<T = unknown>(serviceId: string): Promise<T | null> {
  if (!redisEnabled) return null;
  try {
    const raw = await redisCommand<string | null>(["GET", serviceEvidenceKey(serviceId)]);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}
