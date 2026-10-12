import type { MarketSnapshot, ProtocolContext, ProtocolRegistryEntry } from "../types";
import { collectArgus } from "./argus";

export const PROTOCOL_REGISTRY: ProtocolRegistryEntry[] = [
  {
    id: "argus",
    name: "Argus",
    category: "DEX",
    integrationStatus: "LIVE",
    networkStatus: "MAINNET",
    capabilities: ["launch-context", "bonding-progress", "buy-sell-tax", "developer-attribution"],
    website: "https://www.fuci.family/",
    notes: ["Protocol-specific token context is collected through Fuci's public Argus token API."],
  },
  {
    id: "arcus",
    name: "Arcus",
    category: "X402",
    integrationStatus: "LIVE",
    networkStatus: "MAINNET",
    capabilities: ["x402-facilitation", "merchant-settlement", "paid-api-discovery"],
    website: "https://arcusnetwork.co",
    notes: ["Arc Scout uses Arcus for x402 settlement on Arc mainnet."],
  },
];

export async function resolveProtocolContext(contract: string, market: MarketSnapshot): Promise<ProtocolContext> {
  const notes: string[] = [];
  const marketVenue = market.dexId ?? null;
  const argus = await collectArgus(contract);

  if (marketVenue) {
    notes.push(`Market venue reported by market provider: ${marketVenue}.`);
  }

  const matched = PROTOCOL_REGISTRY.filter((entry) =>
    entry.id === "argus" ? argus.matched : false
  );

  return {
    matched,
    marketVenue,
    observations: [argus],
    notes,
  };
}

export function listIntegratedProtocols(): ProtocolRegistryEntry[] {
  return PROTOCOL_REGISTRY;
}
