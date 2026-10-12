import { normalizeArcTools } from "../../../lib/providers/arctools";
import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { classify, type Assessment } from "../../../lib/score";
import { getCachedTokenResult, setCachedTokenResult } from "../../../lib/history";
import type { TokenScan } from "../../../lib/types";

type CachedResult = {
  scan: TokenScan;
  assessment: Assessment;
};

const ARCTOOLS_BASE = (process.env.ARCTOOLS_API_URL || "https://arctools.fun").replace(/\/$/, "");

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const raw = request.nextUrl.searchParams.get("contract");
    if (!raw) return Response.json({ error: "contract is required" }, { status: 400 });
    const contract = getAddress(raw);

    const cached = await getCachedTokenResult<CachedResult>(contract);
    if (!cached) {
      return Response.json(
        { error: "Run a normal Arc Scout token scan before the independent security check." },
        { status: 409 },
      );
    }

    const target = `${ARCTOOLS_BASE}/api/x402/sell-sim?token=${encodeURIComponent(contract)}`;
    const payment = request.headers.get("x-payment") || request.headers.get("payment-signature");

    const upstream = await fetch(target, {
      headers: {
        accept: "application/json",
        "user-agent": "ArcScout/0.7",
        ...(payment ? { "X-PAYMENT": payment } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    const text = await upstream.text();
    const headers = new Headers({
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });

    const paymentRequired = upstream.headers.get("payment-required");
    if (paymentRequired) headers.set("Payment-Required", paymentRequired);
    const paymentResponse = upstream.headers.get("x-payment-response") || upstream.headers.get("payment-response");
    if (paymentResponse) headers.set("Payment-Response", paymentResponse);

    if (upstream.status === 402) {
      return new Response(text, { status: 402, headers });
    }

    if (!upstream.ok) {
      return Response.json(
        { error: `ArcTools security provider returned HTTP ${upstream.status}`, upstream: text.slice(0, 500) },
        { status: 502, headers },
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return Response.json({ error: "ArcTools returned a non-JSON response." }, { status: 502, headers });
    }

    const evidence = normalizeArcTools(payload, target);
    const security = {
      ...cached.scan.security,
      honeypotFlag: evidence.honeypot,
      sellSimulation:
        evidence.sellSimulation === "PASSED"
          ? "SIMULATED_OK" as const
          : evidence.sellSimulation === "FAILED"
            ? "FAILED" as const
            : cached.scan.security.sellSimulation,
      independentEvidence: evidence,
      notes: [
        ...cached.scan.security.notes.filter((note) => !note.startsWith("Independent ArcTools")),
        evidence.note || "Independent ArcTools security result recorded.",
      ],
    };

    const scan: TokenScan = {
      ...cached.scan,
      security,
      availability: {
        ...cached.scan.availability,
        independentSecurity:
          evidence.sellSimulation === "UNKNOWN" && evidence.honeypot === null
            ? "UNKNOWN"
            : "AVAILABLE",
      },
    };

    const result = { scan, assessment: classify(scan) };
    await setCachedTokenResult(contract, result);

    return Response.json({
      service: "Arc Scout Independent Security Check",
      provider: "ArcTools ArcSim",
      contract,
      evidence,
      ...(evidence.status === "UNKNOWN" ? { providerDiagnostic: evidence.diagnostic || {} } : {}),
      assessment: result.assessment,
    }, { headers });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "independent security check failed" },
      { status: 400 },
    );
  }
}

