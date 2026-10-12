import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { getCachedTokenResult } from "../../../../lib/history";
import type { TokenScan } from "../../../../lib/types";
import { classify, type Assessment } from "../../../../lib/score";
import { deriveSecurity } from "../../../../lib/security";

type CachedResult = {
  scan: TokenScan;
  assessment: Assessment;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ contract: string }> },
) {
  try {
    const { contract: raw } = await context.params;
    const contract = getAddress(raw);
    const cached = await getCachedTokenResult<CachedResult>(contract);

    if (!cached) {
      return Response.json(
        {
          service: "Arc Scout Token Profile",
          version: "0.6.0-dev",
          contract,
          cached: false,
          error: "No cached analysis exists for this contract yet.",
        },
        { status: 404 },
      );
    }

    const generatedAt = cached.scan.generatedAt;
    // Re-evaluate interpretation without rescanning or charging for cached data.
    const derived = deriveSecurity(cached.scan.market, cached.scan.onchain, cached.scan.explorer, cached.scan.protocolContext);
    const scan: TokenScan = {
      ...cached.scan,
      security: {
        ...cached.scan.security,
        taxRisk: derived.taxRisk,
        criticalAdminRisk: derived.criticalAdminRisk,
      },
    };
    const ageSeconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000),
    );

    return Response.json({
      service: "Arc Scout Token Profile",
      version: "0.6.0-dev",
      cached: true,
      generatedAt,
      ageSeconds,
      stale: ageSeconds > 3600,
      refresh: {
        endpoint: "/api/token-scan",
        method: "POST",
        paid: true,
      },
      scan,
      assessment: classify(scan),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "token profile failed" },
      { status: 400 },
    );
  }
}

