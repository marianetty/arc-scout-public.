import { listIntegratedProtocols } from "../../../lib/protocols/registry";

export async function GET() {
  return Response.json({
    service: "Arc Scout",
    version: "0.6.0-dev",
    network: "Arc",
    chainId: 5042,
    protocols: listIntegratedProtocols(),
  });
}
