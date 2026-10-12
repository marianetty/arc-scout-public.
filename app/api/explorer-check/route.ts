import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { collectExplorer } from "../../../lib/providers/explorer";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("contract");

  if (!raw) {
    return Response.json({ error: "contract is required" }, { status: 400 });
  }

  try {
    const contract = getAddress(raw);
    const result = await collectExplorer(contract);

    return Response.json({
      service: "Arc Scout Explorer Check",
      version: "0.6.0-dev",
      network: "Arc",
      chainId: 5042,
      contract,
      ...result,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "explorer check failed" },
      { status: 400 },
    );
  }
}
