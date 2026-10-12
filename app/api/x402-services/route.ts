import { collectArcusCatalog } from "../../../lib/agents/arcus-discovery";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const agentIdRaw = url.searchParams.get("agentId");
    const agentId = agentIdRaw ? Number(agentIdRaw) : null;

    const catalog = await collectArcusCatalog();
    const filtered = catalog.endpoints.filter((endpoint) => {
      if (agentId != null && endpoint.agentId !== agentId) return false;
      if (!q) return true;
      const haystack = [
        endpoint.merchantName,
        endpoint.merchantBy,
        endpoint.title,
        endpoint.description,
        endpoint.method,
        endpoint.url,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });

    return Response.json({
      service: "Arc Scout x402 Service Discovery",
      version: "0.8.0-dev",
      network: "Arc",
      chainId: 5042,
      merchantCount: catalog.merchantCount,
      endpointCount: catalog.endpoints.length,
      matchedCount: filtered.length,
      endpoints: filtered,
      source: catalog.source,
      limitations: catalog.limitations,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "x402 discovery failed" },
      { status: 502 },
    );
  }
}
