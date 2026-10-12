import { createHash } from "crypto";
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  recoverTypedDataAddress,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { collectArcusCatalog } from "../../../lib/agents/arcus-discovery";
import { getCachedServiceEvidence, setCachedServiceEvidence } from "../../../lib/history";

type VerificationEvidence = {
  serviceId: string;
  merchantId: string;
  merchantName: string;
  agentId: number | null;
  endpointUrl: string;
  method: string;
  checkedAt: string;
  provider: "ARC_SCOUT_MYSTERY_SHOPPER";
  reachable: boolean;
  paymentRequired: boolean;
  paymentPassed: boolean;
  validResponse: boolean;
  httpStatus: number;
  latencyMs: number;
  catalogPriceUsd: number | null;
  chargedAmountRaw?: string | null;
  responseContentType?: string | null;
  responseHash?: string | null;
  verdict:
    | "FUNCTIONAL"
    | "FAILED"
    | "HANDSHAKE_ONLY"
    | "X402_HANDSHAKE_FAILED"
    | "FACILITATOR_VERIFICATION_FAILED"
    | "TRANSACTION_SIMULATION_FAILED";
  failureReason?: string | null;
  note: string;
};

function serviceId(merchantId: string, endpointUrl: string) {
  return createHash("sha256").update(`${merchantId}|${endpointUrl}`).digest("hex").slice(0, 24);
}


const ARC_RPC = process.env.ARC_MAINNET_RPC_URL || "https://rpc.mainnet.arc.io";

const eip3009Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
] as const;

async function readEip3009Preflight(asset: string, announcedName: string, announcedVersion: string) {
  const client = createPublicClient({ transport: http(ARC_RPC, { timeout: 8_000 }) });
  const address = getAddress(asset);

  const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try { return await fn(); } catch { return null; }
  };

  const [name, version, domainSeparator, authorizationState] = await Promise.all([
    safe(() => client.readContract({ address, abi: eip3009Abi, functionName: "name" })),
    safe(() => client.readContract({ address, abi: eip3009Abi, functionName: "version" })),
    safe(() => client.readContract({ address, abi: eip3009Abi, functionName: "DOMAIN_SEPARATOR" })),
    safe(() => client.readContract({
      address,
      abi: eip3009Abi,
      functionName: "authorizationState",
      args: [zeroAddress, zeroHash],
    })),
  ]);

  const typeHash = keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
  const computedDomainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        typeHash,
        keccak256(toHex(announcedName)),
        keccak256(toHex(announcedVersion)),
        5042n,
        address,
      ],
    ),
  );

  return {
    rpc: ARC_RPC,
    name: typeof name === "string" ? name : null,
    version: typeof version === "string" ? version : null,
    domainSeparator: typeof domainSeparator === "string" ? domainSeparator : null,
    computedDomainSeparator,
    domainSeparatorMatches:
      typeof domainSeparator === "string"
        ? domainSeparator.toLowerCase() === computedDomainSeparator.toLowerCase()
        : null,
    authorizationStateSupported: authorizationState !== null,
    authorizationStateZeroProbe:
      typeof authorizationState === "boolean" ? authorizationState : null,
    announcedDomain: {
      name: announcedName,
      version: announcedVersion,
      chainId: 5042,
      verifyingContract: address,
    },
  };
}

function extractSafeFailureReason(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const candidates = [
      parsed?.error,
      parsed?.message,
      parsed?.reason,
      parsed?.detail,
      parsed?.code,
    ].filter((value) => typeof value === "string" && value.length > 0);

    if (candidates.length > 0) return String(candidates[0]).slice(0, 180);
  } catch {
    // Fall through to a short text preview.
  }

  const compact = trimmed.replace(/\s+/g, " ");
  return compact.slice(0, 180);
}

function decodePaymentRequired(header: string | null, body: string): any | null {
  if (header) {
    try {
      return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    } catch {
      // Fall through to body parsing.
    }
  }
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function paymentAmountFromHeader(header: string | null): string | null {
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    const accepted = Array.isArray(parsed?.accepts) ? parsed.accepts[0] : null;
    return accepted?.amount != null ? String(accepted.amount) : accepted?.maxAmountRequired != null ? String(accepted.maxAmountRequired) : null;
  } catch {
    return null;
  }
}


export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      mode?: string;
      asset?: string;
      authorization?: {
        from?: string;
        to?: string;
        value?: string;
        validAfter?: string;
        validBefore?: string;
        nonce?: string;
      };
      signature?: string;
    };

    if (body.mode !== "simulate-eip3009") {
      return Response.json({ error: "unsupported preflight mode", paymentSent: false }, { status: 400 });
    }

    const asset = body.asset ? getAddress(body.asset) : null;
    const authorization = body.authorization;
    const signature = body.signature;

    if (
      !asset ||
      !authorization?.from ||
      !authorization?.to ||
      !authorization?.value ||
      authorization?.validAfter == null ||
      authorization?.validBefore == null ||
      !authorization?.nonce ||
      !signature
    ) {
      return Response.json({ error: "incomplete EIP-3009 simulation payload", paymentSent: false }, { status: 400 });
    }

    const sig = String(signature);
    if (asset.toLowerCase() !== "0x3600000000000000000000000000000000000000") {
      return Response.json({ error: "simulation only supports official Arc USDC", paymentSent: false }, { status: 400 });
    }
    const value = BigInt(authorization.value);
    const validAfter = BigInt(authorization.validAfter);
    const validBefore = BigInt(authorization.validBefore);
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (value <= 0n || value > 10_000n || validAfter < 0n || validBefore <= now || validBefore > now + 300n || validAfter >= validBefore) {
      return Response.json({ error: "invalid simulation amount or authorization window (maximum $0.01 / 300 seconds)", paymentSent: false }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce)) {
      return Response.json({ error: "invalid authorization nonce", paymentSent: false }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) {
      return Response.json({ error: "invalid signature shape", paymentSent: false }, { status: 400 });
    }
    const recovered = await recoverTypedDataAddress({
      domain: { name: "USDC", version: "2", chainId: 5042, verifyingContract: asset },
      types: { TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" },
        { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ] },
      primaryType: "TransferWithAuthorization",
      message: { from: getAddress(authorization.from), to: getAddress(authorization.to), value, validAfter, validBefore, nonce: authorization.nonce as `0x${string}` },
      signature: sig as `0x${string}`,
    });
    if (recovered.toLowerCase() !== authorization.from.toLowerCase()) {
      return Response.json({ error: "local signature verification failed", paymentSent: false }, { status: 400 });
    }

    const r = `0x${sig.slice(2, 66)}` as `0x${string}`;
    const sPart = `0x${sig.slice(66, 130)}` as `0x${string}`;
    const rawV = Number.parseInt(sig.slice(130, 132), 16);
    const v = rawV < 27 ? rawV + 27 : rawV;

    const transferWithAuthorizationAbi = [{
      type: "function",
      name: "transferWithAuthorization",
      stateMutability: "nonpayable",
      inputs: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
        { name: "v", type: "uint8" },
        { name: "r", type: "bytes32" },
        { name: "s", type: "bytes32" },
      ],
      outputs: [],
    }] as const;

    const data = encodeFunctionData({
      abi: transferWithAuthorizationAbi,
      functionName: "transferWithAuthorization",
      args: [
        getAddress(authorization.from),
        getAddress(authorization.to),
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce as `0x${string}`,
        v,
        r,
        sPart,
      ],
    });

    const rpc = createPublicClient({ transport: http(ARC_RPC, { timeout: 8_000 }) });

    try {
      if (await rpc.getChainId() !== 5042) throw new Error("Configured RPC is not Arc mainnet (5042)");
      await rpc.call({
        account: getAddress(authorization.from),
        to: asset,
        data,
      });

      return Response.json({
        service: "Arc Scout EIP-3009 Preflight",
        simulated: true,
        paymentSent: false,
        result: "SIMULATION_OK",
        asset,
        authorization: {
          from: getAddress(authorization.from),
          to: getAddress(authorization.to),
          value: String(authorization.value),
          validAfter: String(authorization.validAfter),
          validBefore: String(authorization.validBefore),
          nonce: authorization.nonce,
        },
        signatureRecoveredLocally: true,
        note: "Read-only eth_call succeeded. No transaction or x402 payment was sent.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "simulation failed";
      return Response.json({
        service: "Arc Scout EIP-3009 Preflight",
        simulated: true,
        paymentSent: false,
        result: "SIMULATION_FAILED",
        failureCategory: /execution reverted|revert reason|reverted with/i.test(message) ? "CONTRACT_REVERT" : "RPC_OR_CALL_ERROR",
        signatureRecoveredLocally: true,
        asset,
        reason: message.slice(0, 600),
        note: "Read-only eth_call reverted or RPC simulation failed. No transaction or x402 payment was sent.",
      }, { status: 200 });
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "EIP-3009 preflight failed", paymentSent: false },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const started = Date.now();

  try {
    const url = new URL(request.url);
    const merchantId = url.searchParams.get("merchantId");
    const endpointUrl = url.searchParams.get("endpoint");

    if (!merchantId || !endpointUrl) {
      return Response.json({ error: "merchantId and endpoint are required" }, { status: 400 });
    }

    const catalog = await collectArcusCatalog();
    const endpoint = catalog.endpoints.find(
      (item) => item.merchantId === merchantId && item.url === endpointUrl,
    );

    if (!endpoint) {
      return Response.json(
        { error: "Endpoint is not present in the current Arcus discovery catalog." },
        { status: 403 },
      );
    }

    if ((endpoint.params?.length ?? 0) > 0) {
      return Response.json(
        {
          error: "Mystery Shopper v1 only supports endpoints without declared parameters.",
          params: endpoint.params,
        },
        { status: 409 },
      );
    }

    if ((endpoint.method || "GET").toUpperCase() !== "GET") {
      return Response.json(
        { error: "Mystery Shopper v1 currently supports GET endpoints only." },
        { status: 409 },
      );
    }

    const id = serviceId(endpoint.merchantId, endpoint.url!);
    const cached = await getCachedServiceEvidence<VerificationEvidence>(id);

    if (url.searchParams.get("cached") === "1") {
      return Response.json({
        serviceId: id,
        cached: Boolean(cached),
        evidence: cached,
      });
    }

    const payment = request.headers.get("x-payment") || request.headers.get("payment-signature");
    const upstreamStarted = Date.now();

    const upstream = await fetch(endpoint.url!, {
      method: "GET",
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "ArcScout-MysteryShopper/0.8",
        ...(payment ? { "Payment-Signature": payment } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    const latencyMs = Date.now() - upstreamStarted;
    const body = await upstream.text();
    const paymentRequiredHeader = upstream.headers.get("payment-required");
    const paymentResponseHeader =
      upstream.headers.get("payment-response") ||
      upstream.headers.get("x-payment-response");
    const contentType = upstream.headers.get("content-type");

    if (upstream.status === 402 && !payment) {
      if (url.searchParams.get("inspect") === "1") {
        const required = decodePaymentRequired(paymentRequiredHeader, body);
        const accepts = Array.isArray(required?.accepts) ? required.accepts : [];
        const exactArc = accepts.find(
          (item: any) => item?.scheme === "exact" && item?.network === "eip155:5042",
        ) || null;

        const preflight = exactArc?.asset
          ? await readEip3009Preflight(
              exactArc.asset,
              exactArc?.extra?.name || "USDC",
              exactArc?.extra?.version || "2",
            )
          : null;

        return Response.json({
          service: "Arc Scout x402 Inspector",
          version: "0.8.0-dev",
          endpoint: {
            merchantId: endpoint.merchantId,
            merchantName: endpoint.merchantName,
            title: endpoint.title,
            url: endpoint.url,
          },
          diagnostic: {
            inspectedAt: new Date().toISOString(),
            httpStatus: upstream.status,
            latencyMs,
            x402Version: required?.x402Version ?? null,
            resource: required?.resource ?? null,
            offer: exactArc ? {
              scheme: exactArc.scheme ?? null,
              network: exactArc.network ?? null,
              asset: exactArc.asset ?? null,
              amount: exactArc.amount != null ? String(exactArc.amount) : null,
              payTo: exactArc.payTo ?? null,
              maxTimeoutSeconds: exactArc.maxTimeoutSeconds ?? null,
              extra: {
                name: exactArc?.extra?.name ?? null,
                version: exactArc?.extra?.version ?? null,
              },
            } : null,
            signingAssumptions: exactArc ? {
              chainId: 5042,
              verifyingContract: exactArc.asset ?? null,
              domainName: exactArc?.extra?.name || "USDC",
              domainVersion: exactArc?.extra?.version || "2",
              primaryType: "TransferWithAuthorization",
            } : null,
            catalog: {
              priceUsd: endpoint.priceUsd ?? null,
              priceRaw: endpoint.priceRaw ?? null,
              asset: endpoint.asset ?? null,
              payTo: endpoint.payTo ?? null,
              network: endpoint.network ?? null,
            },
            eip3009Preflight: preflight,
            comparisons: exactArc ? {
              assetMatchesCatalog:
                endpoint.asset == null ||
                String(endpoint.asset).toLowerCase() === String(exactArc.asset || "").toLowerCase(),
              payToMatchesCatalog:
                endpoint.payTo == null ||
                String(endpoint.payTo).toLowerCase() === String(exactArc.payTo || "").toLowerCase(),
              networkMatchesCatalog:
                endpoint.network == null ||
                String(endpoint.network).toLowerCase() === String(exactArc.network || "").toLowerCase(),
              amountMatchesCatalog:
                endpoint.priceRaw == null ||
                String(endpoint.priceRaw) === String(exactArc.amount ?? ""),
            } : null,
          },
        }, {
          status: 200,
          headers: { "cache-control": "no-store" },
        });
      }

      const headers = new Headers({
        "content-type": contentType || "application/json",
        "cache-control": "no-store",
      });
      if (paymentRequiredHeader) headers.set("Payment-Required", paymentRequiredHeader);

      return new Response(body, { status: 402, headers });
    }

    const validResponse =
      upstream.ok &&
      body.trim().length > 0 &&
      !/^payment required/i.test(body.trim());

    const handshakeFailed = Boolean(payment && upstream.status === 402);
    const failureReason = handshakeFailed ? extractSafeFailureReason(body) : null;
    const normalizedFailure = String(failureReason || "").toLowerCase();
    const facilitatorVerificationFailed =
      handshakeFailed &&
      normalizedFailure.includes("invalid_exact_evm_signature");
    const transactionSimulationFailed =
      handshakeFailed &&
      normalizedFailure.includes("transaction_simulation_failed");

    const evidence: VerificationEvidence = {
      serviceId: id,
      merchantId: endpoint.merchantId,
      merchantName: endpoint.merchantName,
      agentId: endpoint.agentId ?? null,
      endpointUrl: endpoint.url!,
      method: endpoint.method || "GET",
      checkedAt: new Date().toISOString(),
      provider: "ARC_SCOUT_MYSTERY_SHOPPER",
      reachable: true,
      paymentRequired: Boolean(paymentRequiredHeader || payment),
      paymentPassed: Boolean(payment && upstream.ok),
      validResponse,
      httpStatus: upstream.status,
      latencyMs,
      catalogPriceUsd: endpoint.priceUsd ?? null,
      chargedAmountRaw:
        paymentAmountFromHeader(paymentRequiredHeader) ||
        paymentAmountFromHeader(paymentResponseHeader),
      responseContentType: contentType,
      responseHash: body
        ? createHash("sha256").update(body).digest("hex")
        : null,
      verdict:
        payment && upstream.ok && validResponse
          ? "FUNCTIONAL"
          : facilitatorVerificationFailed
            ? "FACILITATOR_VERIFICATION_FAILED"
            : transactionSimulationFailed
              ? "TRANSACTION_SIMULATION_FAILED"
              : handshakeFailed
                ? "X402_HANDSHAKE_FAILED"
                : upstream.ok && validResponse
                  ? "HANDSHAKE_ONLY"
                  : "FAILED",
      failureReason,
      note:
        payment && upstream.ok && validResponse
          ? "Arc Scout paid the catalog-listed x402 endpoint and received a non-empty successful response."
          : facilitatorVerificationFailed
            ? "The payment signature passed Arc Scout's local recovery check, but the facilitator returned invalid_exact_evm_signature. Treat this as facilitator verification failure / possible RPC infrastructure failure, not proof that the payer signature is invalid."
            : transactionSimulationFailed
              ? "The facilitator accepted the payment far enough to attempt transaction simulation, but the EIP-3009 transfer simulation failed."
              : handshakeFailed
                ? "The endpoint remained at HTTP 402 after Arc Scout sent the signed payment payload."
                : upstream.ok && validResponse
                  ? "Endpoint responded successfully without a paid execution; x402 payment was not independently verified."
                  : "Endpoint test failed or returned no valid response.",
    };

    await setCachedServiceEvidence(id, evidence);

    const headers = new Headers({
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    if (paymentResponseHeader) headers.set("Payment-Response", paymentResponseHeader);

    return Response.json({
      service: "Arc Scout x402 Mystery Shopper",
      version: "0.8.0-dev",
      endpoint: {
        merchantId: endpoint.merchantId,
        merchantName: endpoint.merchantName,
        agentId: endpoint.agentId ?? null,
        title: endpoint.title,
        url: endpoint.url,
        catalogPriceUsd: endpoint.priceUsd ?? null,
      },
      evidence,
      sample: {
        contentType,
        bodyPreview: body.slice(0, 300),
      },
      totalLatencyMs: Date.now() - started,
    }, { status: upstream.ok ? 200 : 502, headers });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "x402 verification failed",
      },
      { status: 502 },
    );
  }
}

