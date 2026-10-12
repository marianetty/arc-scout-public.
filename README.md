# Arc Scout

Verifiable intelligence for the Arc ecosystem: **what do we know, what is verified, and what remains unknown?**

Live application: https://arcscout.significarse.com

ERC-8004 identity: [Arc Scout, agent #330](https://arcusid.com/agents/330)

This is a public source snapshot dated October 12, 2026. It contains application code and regression tests, without private repository history, local credentials or deployment secrets.

## What it does

- **Token Intelligence:** combines market data, onchain reads, contract/ABI hints, holder data, protocol context and official evidence, keyed by the exact contract address.
- **Agent Intelligence:** reads ERC-8004 identity and reputation through ArcID. Registration, declared services and economic activity are separate signals. ArcID Trust Score is external context, not an Arc Scout verification score.
- **x402 Service Explorer:** discovers Arcus merchant endpoints and displays prices, methods, linked agent IDs and cached verification evidence.
- **No-payment diagnostics:** inspects x402 terms and the Arc USDC EIP-712 domain; supports locally verified EIP-3009 signatures followed by a read-only eth_call.

Arc Scout does not execute trades, custody funds or automate buys. Endpoint payment tests are manual, limited to supported GET endpoints on Arc mainnet, official Arc USDC and a maximum of $0.01. Inspecting terms does not require a wallet or payment.

## Evidence boundaries

- Missing ABI data is **not checked**, not “zero admin powers”. Function-name matches are hints; they do not prove authorization or executable admin powers.
- Failed RPC reads mean unavailable evidence, not proof that no contract or owner exists.
- Argus-reported buy/sell taxes remain distinct from independently measured current trading taxes.
- Distinct payer addresses alone do not establish independent external usage.
- A generic API success is not a passed sell simulation. A failed simulation alone is not an explicit honeypot verdict.
- Observation timestamps record when Scout collected data, not when an upstream source last refreshed it.
- Read-only EIP-3009 simulation does not submit a transaction or x402 payment. Its outcome does not prove how a separate facilitator will behave.

Classifications (PRE_SIGNAL, EARLY_SIGNAL, VERIFIED_CANDIDATE, WATCH_ONLY) are research categories, not investment recommendations or guarantees of safety. Profiles expose sources, observation times, limitations and missing evidence.

## Why Arc

The application reads Arc mainnet (chain ID 5042), uses official Arc USDC (0x3600000000000000000000000000000000000000) for x402 payment authorizations, and has an ERC-8004 identity in Arc's identity registry. Public cached token profiles are free to read; creating or refreshing a scan uses a manual $0.005 USDC x402 authorization.

## Routes

| Route | Purpose |
| --- | --- |
| / | Token Intelligence |
| /agents | Agent directory |
| /agents/[id] | Agent profile and evidence provenance |
| /services | x402 discovery and diagnostics |
| GET /api/token/[contract] | Free cached token profile |
| POST /api/token-scan | x402-paid scan |
| GET /api/agents | ArcID discovery |
| GET /api/agents/[id] | ArcID identity/reputation context |
| GET /api/x402-services | Arcus catalog |
| GET /api/x402-check | Cached evidence or manual endpoint inspection |
| POST /api/x402-check | simulate-eip3009: read-only simulation |
| GET /api/security-check | Optional external ArcTools sell-simulation adapter |
| GET /api/health | Health information |
| GET /api/discovery | Machine-readable metadata |

## Run locally

Requires Node.js 20.9 or later.

```sh
npm ci
cp .env.example .env.local
# Set ARC_SCOUT_PAY_TO to your public Arc receiving address.
npm test
npm run typecheck
npm run dev
```

Optional Upstash Redis configuration provides durable token history, profiles and service evidence. Without Redis, storage falls back to process memory and is not durable across restarts or serverless instances. Configure credentials in the hosting environment; do not commit them.

The free development scan route is disabled by default. Enable ARC_SCOUT_ENABLE_DEV_SCAN=true only for local testing, never on a public deployment.

## Validation

Seven offline regression tests cover unavailable ABI/RPC evidence, reported taxes, admin function hints, distinct-payer interpretation, ambiguous security responses and EIP-3009 signature/read-only boundaries. Synthetic test signatures use a disposable public test account, not a user wallet. TypeScript checks, GitHub CI and Vercel builds passed for the application source snapshot. Token, agent and service read paths were checked on the live deployment without payments.

Actual wallet signing and paid endpoint settlement are separate manual checks; the offline simulation test does not claim those flows were verified.

## Current limitations

External APIs may be unavailable or incomplete. Independent endpoint uptime/usage monitoring and an evidence ledger remain future work. Owner/proxy powers, effective trading taxes and real external usage require further evidence; token profiles do not claim a full audit. ArcID's profile still lists the previous application URL while its metadata update is pending.

## Public profile

- Website: https://arcscout.significarse.com
- X: https://x.com/ArcScoutHQ
- Contact: arcscout@significarse.com
