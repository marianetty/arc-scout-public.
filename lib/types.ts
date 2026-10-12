export type ProductState = "LIVE" | "BETA" | "DEMO" | "PROMISE" | "UNKNOWN";
export type Classification = "PRE_SIGNAL" | "EARLY_SIGNAL" | "VERIFIED_CANDIDATE" | "WATCH_ONLY";
export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type DataAvailability = "AVAILABLE" | "UNKNOWN" | "UNAVAILABLE" | "NOT_CHECKED";

export type SourceRef = {
  provider: string;
  url?: string;
  observedAt: string;
  note?: string;
};

export type MarketSnapshot = {
  pairAddress?: string | null;
  dexId?: string | null;
  priceUsd?: number | null;
  marketCapUsd?: number | null;
  fdvUsd?: number | null;
  liquidityUsd?: number | null;
  volume5mUsd?: number | null;
  volume1hUsd?: number | null;
  volume6hUsd?: number | null;
  volume24hUsd?: number | null;
  buys5m?: number | null;
  sells5m?: number | null;
  buys1h?: number | null;
  sells1h?: number | null;
  buys24h?: number | null;
  sells24h?: number | null;
  pairCreatedAt?: number | null;
  url?: string | null;
};

export type OnchainSnapshot = {
  chainId: number;
  codeExists: boolean | null;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  totalSupplyRaw?: string | null;
  owner?: string | null;
  ownerCheck: "FOUND" | "NO_STANDARD_OWNER" | "UNAVAILABLE";
  ownerReadError?: string | null;
  proxyImplementation?: string | null;
  proxyCheck: "EIP1967_IMPLEMENTATION" | "NO_EIP1967_IMPLEMENTATION" | "UNAVAILABLE";
};

export type ContractAnalysis = {
  sourceAvailable: boolean;
  abiAvailable?: boolean;
  functionNames: string[];
  mintHint: boolean | null;
  pauseHint: boolean | null;
  blacklistHint: boolean | null;
  taxSetterHint: boolean | null;
  ownershipTransferHint: boolean | null;
  accessControlHint: boolean | null;
  adminSetterHint: boolean | null;
  privilegedFunctionNames: string[];
  upgradeHint: boolean | null;
};

export type ExplorerSnapshot = {
  holdersCount?: number | null;
  topHolders?: Array<{ address: string; valueRaw?: string | null; percentage?: number | null }>;
  holderDataSource?: "EXPLORER" | "ARCSCAN" | "RPC_TRANSFER_RECONSTRUCTION" | null;
  holderDataComplete?: boolean | null;
  holderDataFromBlock?: string | null;
  holderDataToBlock?: string | null;
  concentrationTop10Pct?: number | null;
  contractVerified?: boolean | null;
  contractAnalysis?: ContractAnalysis | null;
};

export type UsageEvidence = {
  provider?: string | null;
  statsUrl?: string | null;
  x402CallsPaid?: number | null;
  agentsOnchain?: number | null;
  totalAgentsObserved?: number | null;
  distinctPayers?: number | null;
  independenceVerified?: boolean | null;
  note?: string | null;
};

export type OfficialEvidence = {
  officialContractConfirmed: boolean | null;
  confidence: Confidence;
  productState: ProductState;
  productUrl?: string | null;
  tokenUtilityVerified: boolean | null;
  externalUsageWallets?: number | null;
  activityCircularity?: "EXTERNAL" | "MIXED" | "CIRCULAR" | "UNKNOWN";
  usageEvidence?: UsageEvidence | null;
  notes: string[];
  sources: SourceRef[];
};

export type IndependentSecurityEvidence = {
  provider: string;
  checkedAt: string;
  status: "PASSED" | "FAILED" | "UNKNOWN";
  honeypot: boolean | null;
  sellSimulation: "PASSED" | "FAILED" | "UNKNOWN";
  keepPct?: number | null;
  sourceUrl?: string | null;
  note?: string | null;
};

export type SecuritySnapshot = {
  sellObserved: boolean | null;
  honeypotFlag: boolean | null;
  criticalAdminRisk: boolean | null;
  taxRisk: "NONE_SEEN" | "PRESENT" | "UNKNOWN";
  sellSimulation: "OBSERVED_MARKET_SELLS" | "SIMULATED_OK" | "FAILED" | "NOT_RUN";
  concentrationTop10Pct?: number | null;
  mintCapabilityHint: boolean | null;
  pauseCapabilityHint: boolean | null;
  blacklistCapabilityHint: boolean | null;
  upgradeCapabilityHint: boolean | null;
  accessControlHint: boolean | null;
  adminSetterHint: boolean | null;
  privilegedFunctionNames: string[];
  independentEvidence?: IndependentSecurityEvidence | null;
  notes: string[];
};

export type SnapshotPoint = {
  observedAt: string;
  marketCapUsd?: number | null;
  fdvUsd?: number | null;
  liquidityUsd?: number | null;
  volume1hUsd?: number | null;
  volume24hUsd?: number | null;
  buys1h?: number | null;
  sells1h?: number | null;
  buys24h?: number | null;
  sells24h?: number | null;
};

export type AccelerationSnapshot = {
  previousObservedAt: string | null;
  elapsedMinutes: number | null;
  liquidityChangePct: number | null;
  marketCapChangePct: number | null;
  fdvChangePct: number | null;
  volume1hRatio: number | null;
  tx1hRatio: number | null;
  signal: "NO_BASELINE" | "FLAT" | "RISING" | "STRONG" | "FALLING";
  notes: string[];
};

export type ProtocolCategory = "DEX" | "LENDING" | "PAYMENTS" | "X402" | "RWA" | "CROSSCHAIN" | "AGENTS" | "TOOLS" | "OTHER";

export type ProtocolRegistryEntry = {
  id: string;
  name: string;
  category: ProtocolCategory;
  integrationStatus: "LIVE" | "PARTIAL" | "WATCHLIST";
  networkStatus: "MAINNET" | "TESTNET" | "UNKNOWN";
  capabilities: string[];
  website?: string;
  notes: string[];
};

export type ProtocolObservation = {
  protocolId: string;
  protocolName: string;
  matched: boolean;
  data?: {
    symbol?: string | null;
    priceUsdc?: number | null;
    buyTaxPct?: number | null;
    sellTaxPct?: number | null;
    bondingProgressPct?: number | null;
    bonded?: boolean | null;
    devAddress?: string | null;
    poolAddress?: string | null;
  };
  sources: SourceRef[];
  limitations: string[];
};

export type ProtocolContext = {
  matched: ProtocolRegistryEntry[];
  marketVenue?: string | null;
  observations: ProtocolObservation[];
  notes: string[];
};

export type ScanAvailability = {
  market: DataAvailability;
  onchain: DataAvailability;
  contractSource: DataAvailability;
  holders: DataAvailability;
  officialEvidence: DataAvailability;
  protocolContext: DataAvailability;
  independentSecurity: DataAvailability;
};

export type TokenScan = {
  contract: string;
  generatedAt: string;
  network: "Arc";
  chainId: 5042;
  market: MarketSnapshot;
  onchain: OnchainSnapshot;
  explorer: ExplorerSnapshot;
  official: OfficialEvidence;
  security: SecuritySnapshot;
  acceleration: AccelerationSnapshot;
  protocolContext: ProtocolContext;
  availability: ScanAvailability;
  historyBackend: "PROCESS_MEMORY" | "UPSTASH_REDIS";
  sources: SourceRef[];
  limitations: string[];
};

