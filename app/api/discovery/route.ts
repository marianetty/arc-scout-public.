export async function GET() {
  return Response.json({
    name: "Arc Scout",
    version: "0.5.0",
    description: "Research-only Arc mainnet token intelligence. No trading or wallet custody.",
    network: "eip155:5042",
    services: [
      { method: "POST", path: "/api/token-scan", price: process.env.ARC_SCOUT_TOKEN_SCAN_PRICE || "$0.005", input: { contract: "0x..." }, output: "market + onchain + explorer + official evidence + security + acceleration + explainable classification" },
      { method: "GET", path: "/api/health", price: "$0" },
    ],
    safety: { trading: false, approvals: false, custody: false, privateKeysRequired: false },
  });
}
