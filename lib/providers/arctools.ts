import type { IndependentSecurityEvidence } from "../types";

function walk(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  for (const child of Object.values(record)) {
    const hit = walk(child, keys);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function asBool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "TRUE") return true;
  if (value === 0 || value === "0" || value === "false" || value === "FALSE") return false;
  return null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asVerdict(value: unknown): "PASSED" | "FAILED" | "UNKNOWN" {
  if (typeof value !== "string") return "UNKNOWN";
  const normalized = value.trim().toLowerCase();
  if (["pass", "passed", "ok", "safe", "sellable", "success", "successful", "not_honeypot", "not honeypot"].includes(normalized)) return "PASSED";
  if (["fail", "failed", "blocked", "honeypot", "unsellable", "revert", "reverted"].includes(normalized)) return "FAILED";
  return "UNKNOWN";
}

function diagnosticFields(value: unknown, prefix = "", depth = 0): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || depth > 2) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child === null || typeof child === "string" || typeof child === "number" || typeof child === "boolean") {
      out[path] = typeof child === "string" ? child.slice(0, 160) : child;
    } else if (typeof child === "object") {
      Object.assign(out, diagnosticFields(child, path, depth + 1));
    }
    if (Object.keys(out).length >= 30) break;
  }
  return out;
}

export function normalizeArcTools(payload: unknown, sourceUrl: string): IndependentSecurityEvidence & { diagnostic?: Record<string, string | number | boolean | null> } {
  const explicitHoneypot = asBool(walk(payload, [
    "honeypot", "isHoneypot", "is_honeypot", "honeypotDetected", "honeypot_detected"
  ]));
  const canSell = asBool(walk(payload, [
    "canSell", "can_sell", "sellable", "sellOk", "sell_ok", "sellSuccess", "sell_success"
  ]));
  const verdict = asVerdict(walk(payload, [
    "sellVerdict", "sell_verdict", "simulationVerdict", "simulation_verdict"
  ]));
  const keepPct = asNumber(walk(payload, [
    "keepPct", "keep_pct", "percentKept", "percent_kept", "receivedPct", "received_pct",
    "keepPercent", "keep_percent", "retainedPct", "retained_pct", "roundTripPct", "round_trip_pct"
  ]));

  let sellSimulation: IndependentSecurityEvidence["sellSimulation"] = "UNKNOWN";
  if (explicitHoneypot === true || canSell === false || verdict === "FAILED") sellSimulation = "FAILED";
  else if (canSell === true || verdict === "PASSED") sellSimulation = "PASSED";

  // A failed simulation may be infrastructure failure; only an explicit flag
  // establishes the provider's honeypot verdict.
  const honeypot = explicitHoneypot;

  return {
    provider: "ArcTools ArcSim",
    checkedAt: new Date().toISOString(),
    status: sellSimulation === "PASSED" ? "PASSED" : sellSimulation === "FAILED" ? "FAILED" : "UNKNOWN",
    honeypot,
    sellSimulation,
    keepPct,
    sourceUrl,
    note:
      sellSimulation === "PASSED"
        ? "Independent ArcTools sell simulation completed successfully."
        : sellSimulation === "FAILED"
          ? "Independent ArcTools sell simulation reported a failed/blocked exit."
          : "ArcTools returned a result, but Arc Scout could not map it to an explicit pass/fail verdict.",
    ...(sellSimulation === "UNKNOWN" ? { diagnostic: diagnosticFields(payload) } : {}),
  };
}

