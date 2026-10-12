import { checkHistoryBackend } from "../../../lib/history";

export async function GET() {
  const history = await checkHistoryBackend();
  return Response.json({
    service: "Arc Scout",
    version: "0.6.0-dev",
    status: "ok",
    network: "Arc",
    chainId: 5042,
    mode: "research-only",
    trading: false,
    history,
    capabilities: ["rpc-metadata", "market-snapshot", "explorer-holders", "proxy-owner-hints", "sell-evidence", "optional-official-evidence", "acceleration-history", "durable-history", "verified-abi-security-hints", "protocol-adapters", "cached-token-profiles", "normalized-availability"],
  });
}
