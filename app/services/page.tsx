"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { recoverTypedDataAddress } from "viem";

type Lang = "en" | "es";

export default function X402ServicesPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [checkingKey, setCheckingKey] = useState<string | null>(null);
  const [evidenceByKey, setEvidenceByKey] = useState<Record<string, any>>({});
  const [checkMessage, setCheckMessage] = useState<Record<string, string>>({});
  const [diagnosticByKey, setDiagnosticByKey] = useState<Record<string, any>>({});
  const [inspectingKey, setInspectingKey] = useState<string | null>(null);
  const [simulatingKey, setSimulatingKey] = useState<string | null>(null);
  const [simulationByKey, setSimulationByKey] = useState<Record<string, any>>({});

  useEffect(() => {
    const saved = window.localStorage.getItem("arc-scout-language");
    if (saved === "en" || saved === "es") setLang(saved);
    void loadServices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tr = (en: string, es: string) => lang === "es" ? es : en;

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    window.localStorage.setItem("arc-scout-language", next);
  };

  async function loadServices(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`/api/x402-services?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body);
    } catch (error) {
      setData({ error: error instanceof Error ? error.message : "x402 discovery failed" });
    } finally {
      setLoading(false);
    }
  }

  const endpoints = useMemo(() => Array.isArray(data?.endpoints) ? data.endpoints : [], [data]);

  const ARC_USDC = "0x3600000000000000000000000000000000000000";
  const MAX_TEST_AMOUNT = 10_000n; // $0.01 USDC

  const endpointKey = (endpoint: any) => `${endpoint.merchantId}|${endpoint.url || ""}`;

  const decodePaymentRequired = (header: string | null, body: any) => {
    if (body?.accepts?.length) return body;
    if (!header) return body;
    try {
      const json = decodeURIComponent(
        Array.prototype.map.call(atob(header), (c: string) =>
          "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
        ).join("")
      );
      return JSON.parse(json);
    } catch {
      return body;
    }
  };

  const encodePayment = (payload: any) => {
    const json = encodeURIComponent(JSON.stringify(payload)).replace(
      /%([0-9A-F]{2})/g,
      (_match, p1) => String.fromCharCode(Number.parseInt(p1, 16)),
    );
    return btoa(json);
  };

  const randomNonce = () => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  };

  const eligibleForMysteryShopper = (endpoint: any) =>
    Boolean(endpoint?.url) &&
    (endpoint?.method || "GET").toUpperCase() === "GET" &&
    (endpoint?.params?.length ?? 0) === 0;

  useEffect(() => {
    if (!endpoints.length) return;
    let cancelled = false;

    void Promise.all(
      endpoints
        .filter(eligibleForMysteryShopper)
        .map(async (endpoint: any) => {
          try {
            const params = new URLSearchParams({
              merchantId: endpoint.merchantId,
              endpoint: endpoint.url,
              cached: "1",
            });
            const response = await fetch(`/api/x402-check?${params.toString()}`, { cache: "no-store" });
            const body = await response.json().catch(() => ({}));
            if (!cancelled && response.ok && body?.evidence) {
              const key = endpointKey(endpoint);
              setEvidenceByKey((prev) => ({ ...prev, [key]: body.evidence }));
            }
          } catch {
            // Cached evidence is optional; discovery must remain usable.
          }
        }),
    );

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoints]);

  async function inspectX402Terms(endpoint: any) {
    const key = endpointKey(endpoint);
    if (!eligibleForMysteryShopper(endpoint) || inspectingKey) return;

    setInspectingKey(key);
    setCheckMessage((prev) => ({
      ...prev,
      [key]: tr("Inspecting x402 terms without payment…", "Inspeccionando condiciones x402 sin pagar…"),
    }));

    try {
      const params = new URLSearchParams({
        merchantId: endpoint.merchantId,
        endpoint: endpoint.url,
        inspect: "1",
      });
      const response = await fetch(`/api/x402-check?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);

      if (body?.diagnostic) {
        setDiagnosticByKey((prev) => ({ ...prev, [key]: body.diagnostic }));
      }
      setCheckMessage((prev) => ({
        ...prev,
        [key]: tr("x402 terms inspected. No payment sent.", "Condiciones x402 inspeccionadas. No se envió ningún pago."),
      }));
    } catch (error) {
      setCheckMessage((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : tr("Inspection failed.", "La inspección falló."),
      }));
    } finally {
      setInspectingKey(null);
    }
  }

  async function simulateEip3009(endpoint: any) {
    const key = endpointKey(endpoint);
    if (!eligibleForMysteryShopper(endpoint) || simulatingKey) return;

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setCheckMessage((prev) => ({ ...prev, [key]: tr("No EVM wallet detected.", "No se detectó una wallet EVM.") }));
      return;
    }

    setSimulatingKey(key);
    setCheckMessage((prev) => ({
      ...prev,
      [key]: tr(
        "Preparing read-only EIP-3009 simulation…",
        "Preparando simulación EIP-3009 de solo lectura…",
      ),
    }));

    try {
      const params = new URLSearchParams({
        merchantId: endpoint.merchantId,
        endpoint: endpoint.url,
      });

      const initial = await fetch(`/api/x402-check?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const initialBody = await initial.json().catch(() => ({}));

      if (initial.status !== 402) {
        throw new Error(initialBody?.error || `Expected 402, got HTTP ${initial.status}`);
      }

      const required = decodePaymentRequired(initial.headers.get("Payment-Required"), initialBody);
      const accepted = required?.accepts?.find(
        (item: any) =>
          item?.scheme === "exact" &&
          item?.network === "eip155:5042" &&
          String(item?.asset || "").toLowerCase() === ARC_USDC.toLowerCase(),
      );

      if (!accepted) {
        throw new Error(tr(
          "No compatible Arc USDC exact-payment offer found.",
          "No se encontró una oferta de pago exacto compatible en USDC de Arc.",
        ));
      }

      if (accepted.extra?.name && accepted.extra.name !== "USDC" || accepted.extra?.version && accepted.extra.version !== "2") throw new Error("Unexpected Arc USDC signing domain");
      const amount = BigInt(String(accepted.amount || "0"));
      if (amount <= 0n || amount > MAX_TEST_AMOUNT) {
        throw new Error(tr(
          "Preflight blocks amounts above $0.01 USDC.",
          "El preflight bloquea importes superiores a $0.01 USDC.",
        ));
      }

      let accounts = await ethereum.request({ method: "eth_accounts" });
      if (!accounts?.length) accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const from = accounts?.[0];
      if (!from) throw new Error(tr("Wallet account unavailable.", "No se pudo obtener la cuenta de la wallet."));

      if (Number(await ethereum.request({ method: "eth_chainId" })) !== 5042) {
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] });
      }
      if (Number(await ethereum.request({ method: "eth_chainId" })) !== 5042) throw new Error("Arc mainnet required");

      const now = Math.floor(Date.now() / 1000);
      const authorization = {
        from,
        to: accepted.payTo,
        value: String(accepted.amount),
        validAfter: "0",
        validBefore: String(now + Math.min(Math.max(Number(accepted.maxTimeoutSeconds || 60), 30), 120)),
        nonce: randomNonce(),
      };

      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        domain: {
          name: accepted.extra?.name || "USDC",
          version: accepted.extra?.version || "2",
          chainId: 5042,
          verifyingContract: accepted.asset,
        },
        message: authorization,
      };

      setCheckMessage((prev) => ({
        ...prev,
        [key]: tr(
          "Rabby will sign typed data only. No payment will be sent.",
          "Rabby firmará solo typed data. No se enviará ningún pago.",
        ),
      }));

      const signature = await ethereum.request({
        method: "eth_signTypedData_v4",
        params: [from, JSON.stringify(typedData)],
      });

      const recovered = await recoverTypedDataAddress({
        domain: typedData.domain,
        types: {
          TransferWithAuthorization: typedData.types.TransferWithAuthorization,
        },
        primaryType: "TransferWithAuthorization",
        message: {
          ...authorization,
          value: BigInt(authorization.value),
          validAfter: BigInt(authorization.validAfter),
          validBefore: BigInt(authorization.validBefore),
        },
        signature,
      } as any);

      if (String(recovered).toLowerCase() !== String(from).toLowerCase()) {
        setSimulationByKey((prev) => ({
          ...prev,
          [key]: {
            result: "LOCAL_SIGNATURE_FAILED",
            paymentSent: false,
          },
        }));
        setCheckMessage((prev) => ({
          ...prev,
          [key]: tr(
            "Local signature verification failed. No payment was sent.",
            "La verificación local de la firma falló. No se envió ningún pago.",
          ),
        }));
        return;
      }

      const response = await fetch("/api/x402-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "simulate-eip3009",
          asset: accepted.asset,
          authorization,
          signature,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || `HTTP ${response.status}`);

      setSimulationByKey((prev) => ({ ...prev, [key]: result }));
      setCheckMessage((prev) => ({
        ...prev,
        [key]: result?.result === "SIMULATION_OK"
          ? tr(
              "Local EIP-3009 eth_call succeeded. Arcus verification remains a separate check. No payment was sent.",
              "La simulación local EIP-3009 por eth_call fue correcta. La verificación de Arcus sigue siendo una comprobación distinta. No se envió ningún pago.",
            )
          : tr(
              "Local EIP-3009 simulation failed. No payment was sent.",
              "La simulación local EIP-3009 falló. No se envió ningún pago.",
            ),
      }));
    } catch (error) {
      setCheckMessage((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : tr("Simulation failed.", "La simulación falló."),
      }));
    } finally {
      setSimulatingKey(null);
    }
  }

  async function runMysteryShopper(endpoint: any) {
    const key = endpointKey(endpoint);
    if (!eligibleForMysteryShopper(endpoint) || checkingKey) return;

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setCheckMessage((prev) => ({ ...prev, [key]: tr("No EVM wallet detected.", "No se detectó una wallet EVM.") }));
      return;
    }

    setCheckingKey(key);
    setCheckMessage((prev) => ({ ...prev, [key]: tr("Checking x402 payment terms…", "Comprobando condiciones de pago x402…") }));

    try {
      const params = new URLSearchParams({
        merchantId: endpoint.merchantId,
        endpoint: endpoint.url,
      });

      const initial = await fetch(`/api/x402-check?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const initialBody = await initial.json().catch(() => ({}));

      if (initial.ok) {
        const evidence = initialBody?.evidence;
        if (evidence) setEvidenceByKey((prev) => ({ ...prev, [key]: evidence }));
        setCheckMessage((prev) => ({
          ...prev,
          [key]: tr("Endpoint responded without a paid execution.", "El endpoint respondió sin ejecución pagada."),
        }));
        return;
      }

      if (initial.status !== 402) {
        throw new Error(initialBody?.error || `HTTP ${initial.status}`);
      }

      const required = decodePaymentRequired(initial.headers.get("Payment-Required"), initialBody);
      const accepted = required?.accepts?.find(
        (item: any) =>
          item?.scheme === "exact" &&
          item?.network === "eip155:5042" &&
          String(item?.asset || "").toLowerCase() === ARC_USDC.toLowerCase(),
      );

      if (!accepted) {
        throw new Error(tr(
          "The endpoint did not offer an Arc USDC exact-payment option.",
          "El endpoint no ofreció una opción de pago exacto en USDC de Arc.",
        ));
      }

      const amount = BigInt(String(accepted.amount || "0"));
      if (amount <= 0n || amount > MAX_TEST_AMOUNT) {
        throw new Error(tr(
          "Mystery Shopper v1 blocks payments above $0.01 USDC.",
          "Mystery Shopper v1 bloquea pagos superiores a $0.01 USDC.",
        ));
      }

      setCheckMessage((prev) => ({
        ...prev,
        [key]: tr(
          `Rabby will ask you to sign a payment of ${(Number(amount) / 1_000_000).toFixed(4)} USDC.`,
          `Rabby te pedirá firmar un pago de ${(Number(amount) / 1_000_000).toFixed(4)} USDC.`,
        ),
      }));

      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const from = accounts?.[0];
      if (!from) throw new Error(tr("Wallet account unavailable.", "No se pudo obtener la cuenta de la wallet."));

      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x13b2" }],
      });

      const now = Math.floor(Date.now() / 1000);
      const authorization = {
        from,
        to: accepted.payTo,
        value: String(accepted.amount),
        validAfter: String(Math.max(0, now - 60)),
        validBefore: String(now + Math.max(Number(accepted.maxTimeoutSeconds || 60), 300)),
        nonce: randomNonce(),
      };

      const typedData = {
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        domain: {
          name: accepted.extra?.name || "USDC",
          version: accepted.extra?.version || "2",
          chainId: 5042,
          verifyingContract: accepted.asset,
        },
        message: authorization,
      };

      const signature = await ethereum.request({
        method: "eth_signTypedData_v4",
        params: [from, JSON.stringify(typedData)],
      });

      const recovered = await recoverTypedDataAddress({
        domain: typedData.domain,
        types: {
          TransferWithAuthorization: typedData.types.TransferWithAuthorization,
        },
        primaryType: "TransferWithAuthorization",
        message: {
          ...authorization,
          value: BigInt(authorization.value),
          validAfter: BigInt(authorization.validAfter),
          validBefore: BigInt(authorization.validBefore),
        },
        signature,
      } as any);

      if (String(recovered).toLowerCase() !== String(from).toLowerCase()) {
        setCheckMessage((prev) => ({
          ...prev,
          [key]: tr(
            "Local signature verification failed. No payment was sent.",
            "La verificación local de la firma falló. No se envió ningún pago.",
          ),
        }));
        return;
      }

      setCheckMessage((prev) => ({
        ...prev,
        [key]: tr(
          "Signature verified locally. Sending x402 payment…",
          "Firma verificada localmente. Enviando pago x402…",
        ),
      }));

      const paymentPayload = {
        x402Version: required?.x402Version || 2,
        resource: required?.resource,
        accepted,
        payload: { signature, authorization },
      };

      setCheckMessage((prev) => ({ ...prev, [key]: tr("Payment signed. Testing endpoint…", "Pago firmado. Probando endpoint…") }));

      const paid = await fetch(`/api/x402-check?${params.toString()}`, {
        method: "GET",
        headers: { "Payment-Signature": encodePayment(paymentPayload) },
        cache: "no-store",
      });
      const paidBody = await paid.json().catch(() => ({}));

      if (paidBody?.evidence) {
        setEvidenceByKey((prev) => ({ ...prev, [key]: paidBody.evidence }));
      }

      if (!paid.ok) {
        setCheckMessage((prev) => ({
          ...prev,
          [key]: paidBody?.evidence?.verdict === "FACILITATOR_VERIFICATION_FAILED"
            ? tr(
                "Local signature valid; facilitator verification failed. Possible RPC/infrastructure failure.",
                "Firma local válida; falló la verificación del facilitador. Posible fallo RPC/infraestructura.",
              )
            : paidBody?.evidence?.verdict === "TRANSACTION_SIMULATION_FAILED"
              ? tr(
                  "Signature accepted; transaction simulation failed at the facilitator.",
                  "Firma aceptada; falló la simulación de la transacción en el facilitador.",
                )
              : paidBody?.evidence?.verdict === "X402_HANDSHAKE_FAILED"
                ? tr(
                    "The endpoint rejected or did not accept the signed x402 payment.",
                    "El endpoint rechazó o no aceptó el pago x402 firmado.",
                  )
                : paidBody?.evidence?.verdict === "FAILED"
                  ? tr("Paid test completed, but the endpoint failed.", "La prueba pagada terminó, pero el endpoint falló.")
                  : (paidBody?.error || `HTTP ${paid.status}`),
        }));
        return;
      }

      setCheckMessage((prev) => ({
        ...prev,
        [key]: paidBody?.evidence?.verdict === "FUNCTIONAL"
          ? tr("Paid execution verified by Arc Scout.", "Ejecución pagada verificada por Arc Scout.")
          : tr("Check completed.", "Comprobación completada."),
      }));
    } catch (error) {
      setCheckMessage((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : tr("Verification failed.", "La verificación falló."),
      }));
    } finally {
      setCheckingKey(null);
    }
  }

  return (
    <main className="site-shell explorer-page">
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-star">✦</span><span>Arc</span><b>Scout</b></a>
        <nav>
          <a href="/">{tr("Token Intelligence", "Inteligencia de tokens")}</a>
          <a href="/agents">{tr("Agents", "Agentes")}</a>
          <a href="/services">x402 Services</a>
        </nav>
        <div className="top-actions">
          <span className="network-pill">Arc Mainnet</span>
          <button className="language-toggle" onClick={toggleLang}>{lang === "en" ? "ES" : "EN"}</button>
          <span className="version-pill">v0.8 dev</span>
        </div>
      </header>

      <section className="explorer-hero">
        <span className="eyebrow">x402 SERVICE INTELLIGENCE</span>
        <h1>{tr("Discover what agents can actually pay for.", "Descubre qué servicios pueden pagar realmente los agentes.")}</h1>
        <p>{tr(
          "Arcus exposes a machine-readable catalog of paid Arc endpoints. Arc Scout adds the next layer: identity, price context and eventually independent functional verification.",
          "Arcus expone un catálogo machine-readable de endpoints de pago en Arc. Arc Scout añade la siguiente capa: identidad, contexto de precio y, próximamente, verificación funcional independiente."
        )}</p>

        <form className="explorer-search" onSubmit={loadServices}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Search weather, wallet, data, AI…", "Buscar weather, wallet, datos, IA…")}
          />
          <button type="submit" disabled={loading}>{loading ? tr("Searching…", "Buscando…") : tr("Search services", "Buscar servicios")}</button>
        </form>
      </section>

      {data?.error ? <section className="agent-error">{data.error}</section> : null}

      <section className="explorer-summary">
        <div><span>{tr("Merchants", "Merchants")}</span><strong>{data?.merchantCount ?? "—"}</strong></div>
        <div><span>{tr("Paid endpoints", "Endpoints de pago")}</span><strong>{data?.endpointCount ?? "—"}</strong></div>
        <div><span>{tr("Matched", "Coincidencias")}</span><strong>{data?.matchedCount ?? endpoints.length}</strong></div>
      </section>

      <section className="service-results">
        {endpoints.map((endpoint: any, index: number) => (
          <article className="service-card" key={`${endpoint.merchantId}-${endpoint.url || index}`}>
            <div className="service-card-head">
              <div>
                <span className="service-merchant">{endpoint.merchantName}</span>
                <h3>{endpoint.title || endpoint.url || tr("Paid endpoint", "Endpoint de pago")}</h3>
              </div>
              <div className="service-price">
                <strong>{endpoint.priceUsd != null ? `$${Number(endpoint.priceUsd).toFixed(3)}` : "—"}</strong>
                <small>USDC</small>
              </div>
            </div>
            <p>{endpoint.description || tr("No description.", "Sin descripción.")}</p>
            <div className="service-meta">
              <span>{endpoint.method || "GET"}</span>
              <span>{endpoint.pricing || "—"}</span>
              {endpoint.official ? <span>{tr("official", "oficial")}</span> : null}
              {endpoint.partner ? <span>partner</span> : null}
            </div>
            <div className="service-links">
              {endpoint.agentId != null ? <a href={`/agents/${endpoint.agentId}`}>ERC-8004 #{endpoint.agentId} →</a> : <span>{tr("No linked agent ID", "Sin Agent ID vinculado")}</span>}
              {endpoint.url ? <a href={endpoint.url} target="_blank" rel="noreferrer">{tr("Open endpoint ↗", "Abrir endpoint ↗")}</a> : null}
            </div>
            {(() => {
              const key = endpointKey(endpoint);
              const evidence = evidenceByKey[key];
              const eligible = eligibleForMysteryShopper(endpoint);
              const status = evidence?.verdict || "NOT_CHECKED";
              return (
                <>
                  <div className="service-verification-line">
                    <span>{tr("Arc Scout functional verification", "Verificación funcional Arc Scout")}</span>
                    <strong className={`verification-status status-${String(status).toLowerCase()}`}>
                      {status === "NOT_CHECKED" ? tr("NOT CHECKED", "NO COMPROBADO") : status}
                    </strong>
                  </div>
                  <div className="service-check-actions">
                    <div className="service-check-buttons">
                      <button
                        type="button"
                        disabled={!eligible || checkingKey !== null || inspectingKey !== null || simulatingKey !== null}
                        onClick={() => inspectX402Terms(endpoint)}
                      >
                        {inspectingKey === key
                          ? tr("Inspecting…", "Inspeccionando…")
                          : tr("Inspect x402 terms", "Inspeccionar x402")}
                      </button>
                      <button
                        type="button"
                        disabled={!eligible || checkingKey !== null || inspectingKey !== null || simulatingKey !== null}
                        onClick={() => simulateEip3009(endpoint)}
                      >
                        {simulatingKey === key
                          ? tr("Simulating…", "Simulando…")
                          : tr("Simulate EIP-3009", "Simular EIP-3009")}
                      </button>
                      <button
                        type="button"
                        disabled={!eligible || checkingKey !== null || inspectingKey !== null || simulatingKey !== null}
                        onClick={() => runMysteryShopper(endpoint)}
                      >
                        {checkingKey === key
                          ? tr("Checking…", "Comprobando…")
                          : tr("Verify with x402", "Verificar con x402")}
                      </button>
                    </div>
                    {!eligible ? (
                      <small>{tr(
                        "v1: GET endpoints without required params only",
                        "v1: solo endpoints GET sin parámetros obligatorios",
                      )}</small>
                    ) : evidence ? (
                      <small>
                        {evidence.paymentPassed ? tr("Paid", "Pagado") : tr("No paid execution", "Sin ejecución pagada")}
                        {" · "}
                        {evidence.latencyMs != null ? `${evidence.latencyMs} ms` : "—"}
                      </small>
                    ) : (
                      <small>{tr("Manual test · max $0.01 USDC", "Prueba manual · máx. $0.01 USDC")}</small>
                    )}
                  </div>
                  {diagnosticByKey[key] ? (
                    <div className="service-diagnostic-box">
                      <div><span>x402</span><strong>v{diagnosticByKey[key].x402Version ?? "—"}</strong></div>
                      <div><span>{tr("Network", "Red")}</span><strong>{diagnosticByKey[key].offer?.network ?? "—"}</strong></div>
                      <div><span>{tr("Amount", "Importe")}</span><strong>{diagnosticByKey[key].offer?.amount ?? "—"}</strong></div>
                      <div><span>payTo</span><strong>{diagnosticByKey[key].offer?.payTo ? `${diagnosticByKey[key].offer.payTo.slice(0, 8)}…${diagnosticByKey[key].offer.payTo.slice(-6)}` : "—"}</strong></div>
                      <div><span>Asset</span><strong>{diagnosticByKey[key].offer?.asset ? `${diagnosticByKey[key].offer.asset.slice(0, 8)}…${diagnosticByKey[key].offer.asset.slice(-6)}` : "—"}</strong></div>
                      <div><span>Domain</span><strong>{diagnosticByKey[key].offer?.extra?.name || "—"} / {diagnosticByKey[key].offer?.extra?.version || "—"}</strong></div>
                      <div><span>Timeout</span><strong>{diagnosticByKey[key].offer?.maxTimeoutSeconds ?? "—"}s</strong></div>
                      <div><span>{tr("Catalog match", "Coincide catálogo")}</span><strong>{
                        diagnosticByKey[key].comparisons &&
                        Object.values(diagnosticByKey[key].comparisons).every(Boolean)
                          ? tr("YES", "SÍ")
                          : tr("CHECK", "REVISAR")
                      }</strong></div>
                      {diagnosticByKey[key].eip3009Preflight ? (
                        <>
                          <div><span>{tr("Onchain name", "Nombre onchain")}</span><strong>{diagnosticByKey[key].eip3009Preflight.name ?? "—"}</strong></div>
                          <div><span>{tr("Onchain version", "Versión onchain")}</span><strong>{diagnosticByKey[key].eip3009Preflight.version ?? "—"}</strong></div>
                          <div><span>DOMAIN_SEPARATOR</span><strong>{
                            diagnosticByKey[key].eip3009Preflight.domainSeparatorMatches === true
                              ? tr("MATCH", "COINCIDE")
                              : diagnosticByKey[key].eip3009Preflight.domainSeparatorMatches === false
                                ? tr("MISMATCH", "NO COINCIDE")
                                : tr("UNAVAILABLE", "NO DISPONIBLE")
                          }</strong></div>
                          <div><span>EIP-3009</span><strong>{
                            diagnosticByKey[key].eip3009Preflight.authorizationStateSupported
                              ? tr("SUPPORTED", "SOPORTADO")
                              : tr("UNKNOWN", "DESCONOCIDO")
                          }</strong></div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {simulationByKey[key] ? (
                    <div className="service-simulation-box">
                      <div><span>{tr("Local simulation", "Simulación local")}</span><strong>{simulationByKey[key].result || "—"}</strong></div>
                      <div><span>{tr("Payment sent", "Pago enviado")}</span><strong>{simulationByKey[key].paymentSent ? tr("YES", "SÍ") : tr("NO", "NO")}</strong></div>
                      {simulationByKey[key].reason ? (
                        <div className="service-simulation-reason">
                          <span>{tr("Reason", "Motivo")}</span>
                          <strong>{simulationByKey[key].reason}</strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {evidence ? (
                    <div className="service-evidence-box">
                      <div><span>{tr("Last test", "Última prueba")}</span><strong>{evidence.checkedAt && Number.isFinite(Date.parse(evidence.checkedAt)) ? new Date(evidence.checkedAt).toLocaleString(lang === "es" ? "es-ES" : "en-US") : "—"}</strong></div>
                      <div><span>{tr("Verdict", "Veredicto")}</span><strong>{evidence.verdict}</strong></div>
                      <div><span>{tr("Payment", "Pago")}</span><strong>{evidence.paymentPassed ? tr("PASSED", "CORRECTO") : tr("NOT CONFIRMED", "NO CONFIRMADO")}</strong></div>
                      <div><span>HTTP</span><strong>{evidence.httpStatus ?? "—"}</strong></div>
                      <div><span>{tr("Latency", "Latencia")}</span><strong>{evidence.latencyMs != null ? `${evidence.latencyMs} ms` : "—"}</strong></div>
                      {evidence.failureReason ? (
                        <div className="service-evidence-reason">
                          <span>{tr("Failure reason", "Motivo del fallo")}</span>
                          <strong>{evidence.failureReason}</strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {checkMessage[key] ? <p className="service-check-message">{checkMessage[key]}</p> : null}
                </>
              );
            })()}
          </article>
        ))}
      </section>

      <section className="agent-limitations">
        <h3>{tr("Interpretation notes", "Notas de interpretación")}</h3>
        <p>{tr("Catalog source", "Fuente del catálogo")}: {data?.source?.provider || "Arcus"}{" · "}{data?.source?.observedAt && Number.isFinite(Date.parse(data.source.observedAt)) ? new Date(data.source.observedAt).toLocaleString(lang === "es" ? "es-ES" : "en-US") : "—"}</p>
        {(data?.limitations || []).map((item: string) => <p key={item}>• {item}</p>)}
      </section>
    </main>
  );
}

