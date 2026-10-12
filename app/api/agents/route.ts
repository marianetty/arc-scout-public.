import { searchArcIdAgents, getArcIdIndexerHealth } from "../../../lib/agents/arcid";

const SORTS = new Set(["newest", "score", "feedback", "settled", "relevance"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    const owner = url.searchParams.get("owner");
    const rawSort = url.searchParams.get("sort") || "relevance";
    const sort = SORTS.has(rawSort)
      ? rawSort as "newest" | "score" | "feedback" | "settled" | "relevance"
      : "relevance";
    const page = Number(url.searchParams.get("page") || "1");
    const limit = Number(url.searchParams.get("limit") || "20");

    const [results, health] = await Promise.all([
      searchArcIdAgents({ q, owner, sort, page, limit }),
      getArcIdIndexerHealth(),
    ]);

    return Response.json({
      service: "Arc Scout Agent Discovery",
      version: "0.8.0-dev",
      network: "Arc",
      chainId: 5042,
      query: { q, owner, sort, page, limit: Math.min(100, Math.max(1, limit)) },
      results: results.data,
      indexerHealth: health,
      source: results.source,
      limitations: [
        "ArcID discovery and Trust Score are external context. Arc Scout does not convert them directly into a security, product, or usage verdict.",
        "Arc mainnet Validation Registry is not deployed yet; missing validations are not negative evidence.",
      ],
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "agent discovery failed" },
      { status: 502 },
    );
  }
}
