import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { collectArgus } from "../../../lib/protocols/argus";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("contract");

  if (!raw) {
    return Response.json(
      { error: "contract is required" },
      { status: 400 },
    );
  }

  try {
    const contract = getAddress(raw);
    const observation = await collectArgus(contract);

    return Response.json({
      service: "Arc Scout Protocol Check",
      version: "0.6.0-dev",
      network: "Arc",
      chainId: 5042,
      contract,
      observation,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "protocol check failed" },
      { status: 400 },
    );
  }
}
