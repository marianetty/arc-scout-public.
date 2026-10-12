import { getArcIdAgent, getArcIdIndexerHealth } from "../../../../lib/agents/arcid";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const agentId = Number(id);
    if (!Number.isInteger(agentId) || agentId < 0) {
      return Response.json({ error: "valid agent id is required" }, { status: 400 });
    }

    const [agent, health] = await Promise.all([
      getArcIdAgent(agentId),
      getArcIdIndexerHealth(),
    ]);

    return Response.json({
      service: "Arc Scout Agent Intelligence",
      version: "0.8.0-dev",
      network: "Arc",
      chainId: 5042,
      agent: agent.data,
      indexerHealth: health,
      limitations: [
        ...agent.limitations,
        ...(health.available ? [] : ["ArcID indexer health could not be confirmed at request time."]),
      ],
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "agent intelligence failed" },
      { status: 502 },
    );
  }
}
