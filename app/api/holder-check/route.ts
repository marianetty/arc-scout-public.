import { NextRequest } from "next/server";
import { getAddress } from "viem";
import { reconstructErc20Holders } from "../../../lib/providers/rpc";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("contract");

  if (!raw) {
    return Response.json({ error: "contract is required" }, { status: 400 });
  }

  try {
    const contract = getAddress(raw);
    const result = await reconstructErc20Holders(contract);

    return Response.json({
      service: "Arc Scout Holder Deep Check",
      version: "0.6.0-dev",
      network: "Arc",
      chainId: 5042,
      contract,
      mode: "DEEP_RPC_TRANSFER_RECONSTRUCTION",
      warning: "Deep diagnostic only; not executed during normal paid scans.",
      result: {
        ...result,
        fromBlock: result.fromBlock?.toString() ?? null,
        toBlock: result.toBlock?.toString() ?? null,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "holder check failed" },
      { status: 400 },
    );
  }
}
