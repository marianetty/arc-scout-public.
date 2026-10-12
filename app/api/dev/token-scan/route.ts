import { scanToken } from "../../../../lib/scan";

export async function POST(request: Request) {
  if (process.env.ARC_SCOUT_ENABLE_DEV_SCAN !== "true") return Response.json({ error: "dev scan disabled" }, { status: 404 });
  try {
    const body = await request.json() as { contract?: string };
    if (!body.contract) return Response.json({ error: "contract is required" }, { status: 400 });
    return Response.json(await scanToken(body.contract));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "scan failed" }, { status: 400 });
  }
}
