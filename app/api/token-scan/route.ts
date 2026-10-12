import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Address } from "viem";
import { scanToken } from "../../../lib/scan";

const NETWORK = "eip155:5042" as const;
const payTo = (process.env.ARC_SCOUT_PAY_TO || "") as Address;
const facilitatorUrl = process.env.X402_FACILITATOR_URL || "https://facilitator.arcusnetwork.co";
const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Payment-Signature, X-PAYMENT",
  "Access-Control-Expose-Headers": "Payment-Required, Payment-Response",
} as const;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

if (!payTo) throw new Error("ARC_SCOUT_PAY_TO is required");

const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
const server = new x402ResourceServer(facilitator).register(
  NETWORK,
  new ExactEvmScheme(),
);

const handler = async (request: NextRequest): Promise<NextResponse<unknown>> => {
  try {
    let contract = request.nextUrl.searchParams.get("contract") || undefined;

    if (!contract) {
      try {
        const body = (await request.json()) as { contract?: string };
        contract = body.contract;
      } catch {
        // Body is optional when contract is supplied as a query parameter.
      }
    }

    if (!contract) {
      return NextResponse.json<unknown>({ error: "contract is required" }, { status: 400 });
    }

    const result = await scanToken(contract);
    return NextResponse.json<unknown>({
      service: "Arc Scout Token Scan",
      version: "0.6.0-dev",
      disclaimer: "Research classification only. No trade execution or buy recommendation.",
      ...result,
    });
  } catch (e) {
    return NextResponse.json<unknown>(
      { error: e instanceof Error ? e.message : "scan failed" },
      { status: 400 },
    );
  }
};

const protectedPOST = withX402(
  handler,
  {
    accepts: [
      {
        scheme: "exact",
        price: {
          amount: "5000",
          asset: ARC_USDC,
          extra: { name: "USDC", version: "2" },
        },
        network: NETWORK,
        payTo,
      },
    ],
    description: "Arc mainnet token intelligence scan",
    mimeType: "application/json",
  },
  server,
);

export async function POST(request: NextRequest): Promise<Response> {
  const response = await protectedPOST(request);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
