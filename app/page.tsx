"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Profile = {
  cached?: boolean;
  generatedAt?: string;
  ageSeconds?: number;
  stale?: boolean;
  scan?: any;
  assessment?: any;
  error?: string;
  service?: string;
  version?: string;
  refresh?: { endpoint: string; method: string; paid: boolean };
};

const short = (value?: string | null) => {
  if (!value) return "—";
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
};

const money = (value?: number | null, compact = false) => {
  if (value == null || !Number.isFinite(value)) return "—";
  if (compact) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  if (value < 0.01) return `$${value.toFixed(7)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
};

const pct = (value?: number | null) => value == null ? "—" : `${value.toFixed(2)}%`;

type Lang = "en" | "es";

const assessmentText: Record<string, { en: string; es: string }> = {
  "PRE-SEÑAL — evidencia insuficiente para alerta": { en: "PRE-SIGNAL — insufficient evidence for an alert", es: "PRE-SEÑAL — evidencia insuficiente para alerta" },
  "liquidity above $10k": { en: "liquidity above $10k", es: "liquidez superior a $10k" },
  "multi-transaction market activity": { en: "multi-transaction market activity", es: "actividad de mercado con múltiples transacciones" },
  "completed sells observed": { en: "completed sells observed", es: "ventas completadas observadas" },
  "strong market acceleration versus previous snapshot": { en: "strong market acceleration versus previous snapshot", es: "fuerte aceleración del mercado frente al snapshot anterior" },
  "official contract confirmation by contract address": { en: "official contract confirmation by contract address", es: "confirmación oficial del contrato por dirección" },
  "functional product/use verification": { en: "functional product/use verification", es: "verificación del producto/uso funcional" },
  "2+ independent usage wallets/jobs/payers": { en: "2+ independent usage wallets/jobs/payers", es: "2+ wallets/jobs/pagadores independientes" },
  "verified token utility/value capture": { en: "verified token utility/value capture", es: "utilidad/captura de valor del token verificada" },
  "independent honeypot/security provider check": { en: "independent honeypot/security provider check", es: "comprobación independiente de honeypot/seguridad" },
  "official contract attribution fails": { en: "official contract attribution fails", es: "falla la atribución oficial del contrato" },
  "sell/exit becomes blocked": { en: "sell/exit becomes blocked", es: "la venta/salida queda bloqueada" },
  "critical owner/proxy/mint/blacklist power is found and unexplained": { en: "critical owner/proxy/mint/blacklist power is found and unexplained", es: "se detecta poder crítico de owner/proxy/mint/blacklist sin explicar" },
  "product/use evidence proves circular or non-functional": { en: "product/use evidence proves circular or non-functional", es: "la evidencia de producto/uso demuestra actividad circular o no funcional" },
};

function translatedAssessment(value: string, lang: Lang) {
  return assessmentText[value]?.[lang] || value;
}

function classificationLabel(classification: string | undefined, fallback: string | undefined, lang: Lang) {
  const labels: Record<string, { en: string; es: string }> = {
    PRE_SIGNAL: {
      en: "PRE-SIGNAL — insufficient evidence for an alert",
      es: "PRE-SEÑAL — evidencia insuficiente para alerta",
    },
    EARLY_SIGNAL: {
      en: "EARLY SIGNAL — NOT YET VERIFIED",
      es: "SEÑAL TEMPRANA — AÚN NO VERIFICADA",
    },
    VERIFIED_CANDIDATE: {
      en: "VERIFIED CANDIDATE",
      es: "CANDIDATO VERIFICADO",
    },
    WATCH_ONLY: {
      en: "WATCHLIST — unresolved blocker",
      es: "VIGILANCIA — blocker sin resolver",
    },
  };
  return labels[classification || ""]?.[lang] || (fallback ? translatedAssessment(fallback, lang) : (lang === "es" ? "Sin evaluación" : "Not assessed"));
}

function AvailabilityBadge({ value, lang = "en" }: { value?: string; lang?: Lang }) {
  const label = value || "UNKNOWN";
  const tone =
    label === "AVAILABLE" ? "good" :
    label === "UNAVAILABLE" ? "bad" :
    label === "NOT_CHECKED" ? "warn" : "muted";
  const translated = lang === "es"
    ? ({ AVAILABLE: "DISPONIBLE", UNAVAILABLE: "NO DISPONIBLE", NOT_CHECKED: "NO COMPROBADO", UNKNOWN: "DESCONOCIDO" } as Record<string,string>)[label] || label
    : label.replaceAll("_", " ");
  return <span className={`availability ${tone}`}>{translated}</span>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const ARCID_PROFILE_URL = "https://arcusid.com/agents/330";

export default function Home() {
  const [contract, setContract] = useState("0xe66d5169c5d235209d74e976e594060c44c64420");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [scanStep, setScanStep] = useState<"terms" | "connect" | "network" | "sign" | "scan" | "done" | "error" | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [securityChecking, setSecurityChecking] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("arc-scout-language");
    if (saved === "es" || saved === "en") setLang(saved);
  }, []);

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    window.localStorage.setItem("arc-scout-language", next);
  };

  const tr = (en: string, es: string) => lang === "es" ? es : en;

  async function fetchCachedProfile(value: string) {
    const response = await fetch(`/api/token/${encodeURIComponent(value)}`, { cache: "no-store" });
    const data = await response.json();
    setProfile(data);
    return data;
  }

  async function loadProfile(event?: FormEvent) {
    event?.preventDefault();
    const value = contract.trim();
    if (!value) return;

    setLoading(true);
    try {
      await fetchCachedProfile(value);
    } catch {
      setProfile({ error: "No se pudo cargar la ficha." });
    } finally {
      setLoading(false);
    }
  }

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

  async function refreshPaidScan() {
    const value = contract.trim();
    if (!value || refreshing) return;

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setScanStep("error");
      setRefreshMessage(tr("Install or enable Rabby or another EVM wallet, then retry.", "Activa Rabby u otra wallet EVM en el navegador y vuelve a intentarlo."));
      return;
    }

    setRefreshing(true);
    setScanStep("terms");
    setRefreshMessage(tr("Preparing the 0.005 USDC scan. No payment has been signed yet.", "Preparando el análisis de 0,005 USDC. Todavía no has firmado ningún pago."));

    try {
      const initial = await fetch("/api/token-scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contract: value }),
      });

      if (initial.ok) {
        await fetchCachedProfile(value);
        setScanStep("done");
        setRefreshMessage(tr("Profile updated.", "Ficha actualizada."));
        return;
      }

      const initialBody = await initial.json().catch(() => ({}));
      if (initial.status !== 402) {
        throw new Error(initialBody?.error || `Scan rechazado (HTTP ${initial.status})`);
      }

      const required = decodePaymentRequired(initial.headers.get("Payment-Required"), initialBody);
      const accepted = required?.accepts?.find(
        (x: any) => x?.scheme === "exact" && x?.network === "eip155:5042",
      );
      if (!accepted) throw new Error("El endpoint no anunció un pago exact compatible con Arc.");

      setScanStep("connect");
      setRefreshMessage(tr("Step 1 of 3: open Rabby and connect your account if prompted. Connecting does not pay. A payment signature comes next.", "Paso 1 de 3: abre Rabby y conecta tu cuenta si lo solicita. Conectar no paga. Después tendrás que firmar el pago."));
      // Reuse an authorized account; request access only when necessary.
      let accounts = await ethereum.request({ method: "eth_accounts" });
      if (!accounts?.length) {
        accounts = await ethereum.request({ method: "eth_requestAccounts" });
      }
      const from = accounts?.[0];
      if (!from) throw new Error(tr("The wallet did not return an account.", "La wallet no devolvió una cuenta."));

      // Do not open a redundant network prompt after the account approval.
      const currentChain = await ethereum.request({ method: "eth_chainId" });
      if (Number(currentChain) !== 5042) {
        setScanStep("network");
        setRefreshMessage(tr("Confirm Arc Mainnet in Rabby. Once accepted, the payment signature will be requested automatically.", "Confirma Arc Mainnet en Rabby. Al aceptar se solicitará automáticamente la firma del pago."));
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x13b2" }],
        });
        const selectedChain = await ethereum.request({ method: "eth_chainId" });
        if (Number(selectedChain) !== 5042) {
          throw new Error(tr("Arc Mainnet was not selected. No payment signature was requested.", "No se seleccionó Arc Mainnet. No se solicitó la firma del pago."));
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const validAfter = "0";
      const validBefore = String(now + Math.max(Number(accepted.maxTimeoutSeconds || 60), 120));
      const authorization = {
        from,
        to: accepted.payTo,
        value: String(accepted.amount),
        validAfter,
        validBefore,
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

      setScanStep("sign");
      setRefreshMessage(tr("Step 2 of 3: open Rabby again and review the payment authorization for 0.005 USDC. Confirm this signature to start the scan, or cancel to stop.", "Paso 2 de 3: abre Rabby de nuevo y revisa la autorización de pago de 0,005 USDC. Confirma esta firma para iniciar el análisis o cancela para detenerlo."));
      const signature = await ethereum.request({
        method: "eth_signTypedData_v4",
        params: [from, JSON.stringify(typedData)],
      });

      const paymentPayload = {
        x402Version: required?.x402Version || 2,
        resource: required?.resource,
        accepted,
        payload: { signature, authorization },
      };

      setScanStep("scan");
      setRefreshMessage(tr("Step 3 of 3: signature received. Processing payment and generating your profile. Keep this page open; it will update automatically.", "Paso 3 de 3: firma recibida. Procesando el pago y generando la ficha. Mantén esta página abierta; se actualizará automáticamente."));
      const paid = await fetch("/api/token-scan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Payment-Signature": encodePayment(paymentPayload),
        },
        body: JSON.stringify({ contract: value }),
      });

      const paidBody = await paid.json().catch(() => ({}));
      if (!paid.ok) {
        throw new Error(paidBody?.error || `El scan pagado falló (HTTP ${paid.status})`);
      }

      const generatedAt = paidBody?.scan?.generatedAt || new Date().toISOString();
      setProfile({
        service: paidBody?.service || "Arc Scout Token Profile",
        version: paidBody?.version || "0.6.0-dev",
        cached: true,
        generatedAt,
        ageSeconds: 0,
        stale: false,
        refresh: {
          endpoint: "/api/token-scan",
          method: "POST",
          paid: true,
        },
        ...paidBody,
      });
      setScanStep("done");
      setRefreshMessage(tr("Scan complete. Your new profile is displayed below.", "Análisis completado. Tu nueva ficha aparece debajo."));
    } catch (error) {
      setScanStep("error");
      const rejected = (error as { code?: number })?.code === 4001;
      setRefreshMessage(rejected
        ? tr("Cancelled in the wallet. The scan did not complete. You can retry when ready.", "Solicitud cancelada en la wallet. El análisis no se ha completado. Puedes volver a intentarlo.")
        : tr("The scan did not complete: ", "El análisis no se ha completado: ") + (error instanceof Error ? error.message : tr("Please retry.", "Vuelve a intentarlo.")));
    } finally {
      setRefreshing(false);
    }
  }

  async function runIndependentSecurityCheck() {
    const value = contract.trim();
    if (!value || securityChecking) return;

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setSecurityMessage(tr("No EVM wallet detected in the browser.", "No se detectó una wallet EVM en el navegador."));
      return;
    }

    setSecurityChecking(true);
    setSecurityMessage(tr("Requesting ArcTools x402 security terms…", "Solicitando condiciones x402 de seguridad a ArcTools…"));

    try {
      const endpoint = `/api/security-check?contract=${encodeURIComponent(value)}`;
      const initial = await fetch(endpoint, { cache: "no-store" });

      if (initial.ok) {
        await fetchCachedProfile(value);
        setSecurityMessage(tr("Independent security check updated.", "Comprobación independiente actualizada."));
        return;
      }

      const initialBody = await initial.json().catch(() => ({}));
      if (initial.status !== 402) {
        throw new Error(initialBody?.error || `Security check rejected (HTTP ${initial.status})`);
      }

      const required = decodePaymentRequired(initial.headers.get("Payment-Required"), initialBody);
      const accepted = required?.accepts?.find(
        (x: any) => x?.scheme === "exact" && x?.network === "eip155:5042" &&
          String(x?.asset || "").toLowerCase() === "0x3600000000000000000000000000000000000000",
      );

      if (!accepted) throw new Error(tr("ArcTools did not return compatible x402 payment terms.", "ArcTools no devolvió condiciones de pago x402 compatibles."));

      const rawAmount = String(accepted.maxAmountRequired ?? accepted.amount ?? "");
      if (!rawAmount) throw new Error(tr("ArcTools did not provide a payment amount.", "ArcTools no indicó el importe del pago."));
      if (BigInt(rawAmount) <= 0n || BigInt(rawAmount) > 10_000n) throw new Error(tr("Security check exceeds the $0.01 USDC limit.", "La comprobación supera el límite de $0.01 USDC."));
      const displayAmount = (Number(rawAmount) / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");

      setSecurityMessage(
        tr(
          `Review the ArcTools signature for ${displayAmount} USDC…`,
          `Revisa la firma de ArcTools por ${displayAmount} USDC…`,
        ),
      );

      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      const from = accounts?.[0];
      if (!from) throw new Error(tr("No wallet account was returned.", "No se obtuvo una cuenta de la wallet."));

      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x13b2" }],
        });
      } catch {
        throw new Error(tr("Switch the wallet to Arc Mainnet (chainId 5042) and retry.", "Cambia la wallet a Arc Mainnet (chainId 5042) y vuelve a intentarlo."));
      }

      const now = Math.floor(Date.now() / 1000);
      const authorization = {
        from,
        to: accepted.payTo,
        value: rawAmount,
        validAfter: String(now - 60),
        validBefore: String(now + Math.max(Number(accepted.maxTimeoutSeconds || 60), 60)),
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

      const paymentPayload = {
        x402Version: required?.x402Version || 1,
        scheme: accepted.scheme || "exact",
        network: accepted.network,
        payload: { signature, authorization },
      };

      setSecurityMessage(tr("Payment signed. Running independent sell simulation…", "Pago firmado. Ejecutando simulación independiente de venta…"));

      const paid = await fetch(endpoint, {
        headers: { "X-PAYMENT": encodePayment(paymentPayload) },
        cache: "no-store",
      });
      const paidBody = await paid.json().catch(() => ({}));
      if (!paid.ok) throw new Error(paidBody?.error || `Security check failed (HTTP ${paid.status})`);

      await fetchCachedProfile(value);
      const verdict = paidBody?.evidence?.status || "UNKNOWN";
      setSecurityMessage(
        verdict === "PASSED"
          ? tr("ArcTools sell simulation passed.", "La simulación de venta de ArcTools ha pasado.")
          : verdict === "FAILED"
            ? tr("ArcTools reported a failed or blocked sell simulation.", "ArcTools ha reportado una simulación de venta fallida o bloqueada.")
            : tr("ArcTools responded, but no explicit pass/fail verdict was mapped.", "ArcTools respondió, pero no se pudo mapear un veredicto explícito."),
      );
    } catch (error) {
      setSecurityMessage(error instanceof Error ? error.message : tr("Independent security check failed.", "Falló la comprobación independiente de seguridad."));
    } finally {
      setSecurityChecking(false);
    }
  }

  const scan = profile?.scan;
  const assessment = profile?.assessment;
  const market = scan?.market || {};
  const security = scan?.security || {};
  const independentSecurity = security?.independentEvidence || {};
  const onchain = scan?.onchain || {};
  const explorer = scan?.explorer || {};
  const abiReviewed = (explorer.contractAnalysis?.functionNames?.length ?? 0) > 0;
  const official = scan?.official || {};
  const usageEvidence = official?.usageEvidence || {};
  const availability = scan?.availability || {};
  const protocol = scan?.protocolContext?.observations?.find((x: any) => x?.matched);
  const protocolData = protocol?.data || {};
  const acceleration = scan?.acceleration || {};
  const explorerUrl = scan?.contract ? `https://explorer.arc.io/address/${scan.contract}` : null;

  const protocolName = useMemo(() => {
    const matched = scan?.protocolContext?.matched;
    return matched?.length ? matched.map((x: any) => x.name).join(", ") : "Sin protocolo detectado";
  }, [scan]);

  return (
    <main className="site-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-star">✦</span><span>Arc</span><b>Scout</b></div>
        <nav>
          <a href="#inicio">{tr("Home", "Inicio")}</a>
          <a href="#resumen">{tr("Explore", "Explorar")}</a>
          <a href="/api/protocols">{tr("Protocols", "Protocolos")}</a>
          <a href="/agents">{tr("Agents", "Agentes")}</a>
          <a href="/services">x402</a>
          <a href="/api/discovery">{tr("Documentation", "Documentación")}</a>
        </nav>
        <div className="top-actions">
          <a className="agent-pill" href={ARCID_PROFILE_URL} target="_blank" rel="noreferrer">
            ERC-8004 · Agent #330 ↗
          </a>
          <span className="network-pill">Arc Mainnet</span>
          <button className="language-toggle" onClick={toggleLang}>{lang === "en" ? "ES" : "EN"}</button><span className="version-pill">v0.7 UI</span>
        </div>
      </header>

      <section className={`hero ${profile && !profile.error ? "hero-results" : "hero-home"}`} id="inicio">
        <div className="hero-copy">
          <span className="eyebrow">{tr("VERIFIABLE INTELLIGENCE ON ARC", "INTELIGENCIA VERIFICABLE EN ARC")}</span>
          <h1>{tr("Explore Arc tokens ", "Explora tokens de Arc ")}<em>{tr("with evidence", "con evidencia")}</em></h1>
          <p>{tr("Market, onchain, security, protocol context and evidence. Organized by topic with unknown data clearly marked.", "Mercado, onchain, seguridad, contexto de protocolo y evidencia. Todo separado por temática y con datos desconocidos marcados claramente.")}</p>
        </div>
        <div className="hero-panel">
          <form onSubmit={loadProfile} className="search-box">
            <input
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              placeholder={tr("Paste contract address (0x...)", "Pega la dirección del contrato (0x...)")}
            />
            <button type="submit" disabled={loading}>{loading ? tr("Loading…", "Cargando…") : tr("View profile →", "Consultar ficha →")}</button>
          </form>
          <div className="hero-hint">
            <span>{tr("Cached public profile", "Ficha pública cacheada")}</span>
            <span>•</span>
            <span>{tr("Refresh via x402 scan", "Refresco mediante scan x402")}</span>
            <span>•</span>
            <a href={ARCID_PROFILE_URL} target="_blank" rel="noreferrer">{tr("Verifiable ERC-8004 identity #330", "Identidad verificable ERC-8004 #330")}</a>
          </div>
        </div>
        <div className="hero-mascot" aria-hidden="true">
          <img src="/arc-scout-hero-approved.svg" alt="" />
        </div>
        <div className="orb orb-a" />
        <div className="orb orb-b" />
      </section>

      {!profile ? (
        <section className="welcome-grid">
          <div className="welcome-card feature">
            <span className="feature-icon">⌁</span>
            <h3>{tr("A profile, not a JSON", "Una ficha, no un JSON")}</h3>
            <p>Arc Scout transforma el análisis técnico en una página clara, organizada por mercado, onchain, seguridad y protocolo.</p>
          </div>
          <div className="welcome-card">
            <span className="feature-icon">✓</span>
            <h3>{tr("Data with status", "Datos con estado")}</h3>
            <p>Disponible, desconocido, no comprobado o no disponible. Sin rellenar huecos con suposiciones.</p>
          </div>
          <div className="welcome-card">
            <span className="feature-icon">⚡</span>
            <h3>{tr("Fast by default", "Rápido por defecto")}</h3>
            <p>El análisis profundo queda separado para no hacer lenta la consulta principal.</p>
          </div>
        </section>
      ) : profile.error ? (
        <section className="error-panel">
          {profile.cached === false ? (
            <>
              <strong>{tr("This token has not been analyzed yet.", "Este token todavía no se ha analizado.")}</strong>
              <p>{tr("Create its first profile with a scan on Arc Mainnet. Existing profiles can be viewed for free.", "Crea su primera ficha mediante un análisis en Arc Mainnet. Consultar fichas existentes es gratuito.")}</p>
              <button type="button" onClick={refreshPaidScan} disabled={refreshing || loading}>
                {refreshing ? tr("Analyzing…", "Analizando…") : tr("Create first profile · $0.005 USDC", "Crear primera ficha · 0,005 USDC")}
              </button>
              <p>{tr("How it works: 1. Connect wallet / switch to Arc if needed. 2. Sign the 0.005 USDC payment authorization. 3. Wait for your profile to appear automatically.", "Cómo funciona: 1. Conecta la wallet / cambia a Arc si hace falta. 2. Firma la autorización de pago de 0,005 USDC. 3. Espera: la ficha se abrirá automáticamente.")}</p>
              {refreshMessage ? <div className="refresh-message" role="status" aria-live="polite">
                <strong>{scanStep === "done" ? tr("Complete", "Completado") : scanStep === "error" ? tr("Action needed", "Revisa este aviso") : tr("Scan progress", "Progreso del análisis")}</strong>
                <p>{refreshMessage}</p>
                {refreshing && (scanStep === "connect" || scanStep === "network" || scanStep === "sign") ? <p><strong>{tr("Waiting for you in Rabby — check the wallet extension.", "Esperando tu confirmación en Rabby — revisa la extensión de la wallet.")}</strong></p> : null}
              </div> : null}
            </>
          ) : (
            <>
              <strong>{tr("Could not load this profile.", "No se pudo cargar esta ficha.")}</strong>
              <p>{profile.error}</p>
              <button type="button" onClick={() => loadProfile()} disabled={loading}>
                {loading ? tr("Loading…", "Cargando…") : tr("Retry", "Reintentar")}
              </button>
            </>
          )}
        </section>
      ) : (
        <>
          <section className="token-head">
            <div className="token-identity">
              <div className="token-logo">{(onchain.symbol || "?").slice(0, 1)}</div>
              <div>
                <div className="token-title-line">
                  <h2>{onchain.symbol || "TOKEN"}</h2>
                  <span>{onchain.name || "Token en Arc"}</span>
                </div>
                <div className="contract-line">
                  <code>{short(scan?.contract)}</code>
                  <span className="badge">Arc Mainnet</span>
                  {protocolName !== "Sin protocolo detectado" ? <span className="badge protocol">{protocolName}</span> : null}
                  <span className={`classification ${String(assessment?.classification || "").toLowerCase()}`}>
                    {assessment?.classification || "SIN CLASIFICAR"}
                  </span>
                </div>
              </div>
            </div>
            <div className="token-actions">
              <div className="freshness">
                <span>{tr("Latest profile", "Última ficha")}</span>
                <strong>{profile.ageSeconds != null ? `${profile.ageSeconds}s` : "—"}</strong>
                <small>{profile.stale ? tr("Refresh needed", "Necesita refresco") : tr("Recent", "Reciente")}</small>
              </div>
              <button className="paid-refresh-btn" onClick={refreshPaidScan} disabled={refreshing}>
                {refreshing ? tr("Refreshing…", "Actualizando…") : tr("Refresh profile · $0.005", "Actualizar ficha · $0.005")}
              </button>
              {market.url ? <a className="external-btn" href={market.url} target="_blank" rel="noreferrer">DexScreener ↗</a> : null}
              {explorerUrl ? <a className="external-btn" href={explorerUrl} target="_blank" rel="noreferrer">Explorer ↗</a> : null}
            </div>
          </section>

          {refreshMessage ? <div className="refresh-message" role="status" aria-live="polite">
                <strong>{scanStep === "done" ? tr("Complete", "Completado") : scanStep === "error" ? tr("Action needed", "Revisa este aviso") : tr("Scan progress", "Progreso del análisis")}</strong>
                <p>{refreshMessage}</p>
                {refreshing && (scanStep === "connect" || scanStep === "network" || scanStep === "sign") ? <p><strong>{tr("Waiting for you in Rabby — check the wallet extension.", "Esperando tu confirmación en Rabby — revisa la extensión de la wallet.")}</strong></p> : null}
              </div> : null}

          <section className="stats-row">
            <StatCard label={tr("Price", "Precio")} value={money(market.priceUsd)} />
            <StatCard label="Market Cap" value={money(market.marketCapUsd, true)} sub={acceleration.marketCapChangePct != null ? `${acceleration.marketCapChangePct >= 0 ? "+" : ""}${pct(acceleration.marketCapChangePct)}` : undefined} />
            <StatCard label={tr("Liquidity", "Liquidez")} value={money(market.liquidityUsd, true)} sub={acceleration.liquidityChangePct != null ? `${acceleration.liquidityChangePct >= 0 ? "+" : ""}${pct(acceleration.liquidityChangePct)}` : undefined} />
            <StatCard label={tr("24h Volume", "Volumen 24h")} value={money(market.volume24hUsd, true)} />
            <StatCard label="Buy Tax · Argus reported" value={protocolData.buyTaxPct != null ? `${protocolData.buyTaxPct}%` : "—"} />
            <StatCard label="Sell Tax · Argus reported" value={protocolData.sellTaxPct != null ? `${protocolData.sellTaxPct}%` : "—"} />
          </section>

          <section className="tabs" id="resumen">
            <a className="active" href="#resumen">{tr("Overview", "Resumen")}</a>
            <a href="#mercado">{tr("Market", "Mercado")}</a>
            <a href="#onchain">Onchain</a>
            <a href="#seguridad">{tr("Security", "Seguridad")}</a>
            <a href="#protocolo">{tr("Protocol", "Protocolo")}</a>
            <a href="#datos">{tr("Availability", "Disponibilidad")}</a>
          </section>

          <section className="dashboard-grid">
            <article className="panel classification-panel">
              <div className="panel-title">
                <div><span className="icon">◆</span><h3>{tr("Arc Scout Classification", "Clasificación de Arc Scout")}</h3></div>
                <span className="score">{assessment?.score ?? 0}/100</span>
              </div>
              <div className="classification-main">
                <span className={`classification big ${String(assessment?.classification || "").toLowerCase()}`}>
                  {assessment?.classification || "SIN CLASIFICAR"}
                </span>
                <div>
                  <strong>{classificationLabel(assessment?.classification, assessment?.label, lang)}</strong>
                  <p>{tr("Research classification; not a buy recommendation.", "Clasificación de investigación; no es una recomendación de compra.")}</p>
                </div>
              </div>
              <div className="triple-list">
                <div>
                  <h4 className="positive">✓ {tr("Positives", "Positivos")}</h4>
                  {(assessment?.positives || []).slice(0, 5).map((x: string) => <p key={x}>✓ {translatedAssessment(x, lang)}</p>)}
                </div>
                <div>
                  <h4 className="missing">◌ {tr("Missing data", "Faltan datos")}</h4>
                  {(assessment?.missing || []).slice(0, 5).map((x: string) => <p key={x}>› {translatedAssessment(x, lang)}</p>)}
                </div>
                <div>
                  <h4 className="invalid">! {tr("Invalidators", "Invalidadores")}</h4>
                  {(assessment?.invalidators || []).slice(0, 4).map((x: string) => <p key={x}>› {translatedAssessment(x, lang)}</p>)}
                </div>
              </div>

              <div className="holders-strip" id="holders">
                <div className="holders-strip-head">
                  <div>
                    <span className="icon">◉</span>
                    <strong>{tr("Distribution / Holders", "Distribución / Holders")}</strong>
                  </div>
                  <AvailabilityBadge lang={lang} value={availability.holders} />
                </div>

                <div className="holders-kpis">
                  <div>
                    <span>Holders</span>
                    <strong>{explorer.holdersCount ?? "—"}</strong>
                  </div>
                  <div>
                    <span>{tr("Top 10 concentration", "Top 10 concentración")}</span>
                    <strong>{explorer.concentrationTop10Pct != null ? `${Number(explorer.concentrationTop10Pct).toFixed(2)}%` : security.concentrationTop10Pct != null ? `${Number(security.concentrationTop10Pct).toFixed(2)}%` : "—"}</strong>
                    {(explorer.concentrationTop10Pct ?? security.concentrationTop10Pct) != null ? (
                      <small className={`concentration-label concentration-${
                        Number(explorer.concentrationTop10Pct ?? security.concentrationTop10Pct) < 20 ? "low" :
                        Number(explorer.concentrationTop10Pct ?? security.concentrationTop10Pct) < 40 ? "medium" :
                        Number(explorer.concentrationTop10Pct ?? security.concentrationTop10Pct) < 60 ? "high" : "very-high"
                      }`}>
                        {
                          Number(explorer.concentrationTop10Pct ?? security.concentrationTop10Pct) < 20 ? "BAJA" :
                          Number(explorer.concentrationTop10Pct ?? security.concentrationTop10Pct) < 40 ? "INTERMEDIA" :
                          Number(explorer.concentrationTop10Pct ?? security.concentrationTop10Pct) < 60 ? "ALTA" : "MUY ALTA"
                        }
                      </small>
                    ) : null}
                  </div>
                  <div>
                    <span>{tr("Source", "Fuente")}</span>
                    <strong>{explorer.holderDataSource || "—"}</strong>
                  </div>
                </div>

                {(explorer.topHolders || []).length ? (
                  <div className="holders-list">
                    {(explorer.topHolders || []).slice(0, 8).map((holder: any, index: number) => (
                      <div className="holder-row" key={`${holder.address}-${index}`}>
                        <span className="holder-rank">#{index + 1}</span>
                        <code>{short(holder.address)}</code>
                        <strong>{holder.percentage != null ? `${Number(holder.percentage).toFixed(2)}%` : "—"}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="holders-note">La fuente está disponible, pero no hay una lista Top Holder utilizable en esta ficha.</p>
                )}

                <p className="holders-note">La concentración incluye contratos, pools o lockers si aparecen entre los mayores balances; no equivale automáticamente a concentración en wallets de insiders.</p>
              </div>
            </article>

            <article className="panel market-panel" id="mercado">
              <div className="panel-title">
                <div><span className="icon">▥</span><h3>{tr("Market", "Mercado")}</h3></div>
                <div className="market-status">
                  <span className={`signal-badge ${String(acceleration.signal || "NO_BASELINE").toLowerCase()}`}>
                    {acceleration.signal || "NO_BASELINE"}
                  </span>
                  <AvailabilityBadge lang={lang} value={availability.market} />
                </div>
              </div>

              <div className="market-grid">
                <DataRow label={tr("Price", "Precio")} value={money(market.priceUsd)} />
                <DataRow label="Market Cap" value={money(market.marketCapUsd, true)} />
                <DataRow label="FDV" value={money(market.fdvUsd, true)} />
                <DataRow label={tr("Liquidity", "Liquidez")} value={money(market.liquidityUsd, true)} />
                <DataRow label={tr("5m Volume", "Volumen 5m")} value={money(market.volume5mUsd, true)} />
                <DataRow label={tr("1h Volume", "Volumen 1h")} value={money(market.volume1hUsd, true)} />
                <DataRow label={tr("6h Volume", "Volumen 6h")} value={money(market.volume6hUsd, true)} />
                <DataRow label={tr("24h Volume", "Volumen 24h")} value={money(market.volume24hUsd, true)} />
              </div>

              <div className="market-activity">
                <div>
                  <span>5m</span>
                  <strong>{market.buys5m ?? "—"} / {market.sells5m ?? "—"}</strong>
                  <small>{tr("buys / sells", "compras / ventas")}</small>
                </div>
                <div>
                  <span>1h</span>
                  <strong>{market.buys1h ?? "—"} / {market.sells1h ?? "—"}</strong>
                  <small>{tr("buys / sells", "compras / ventas")}</small>
                </div>
                <div>
                  <span>24h</span>
                  <strong>{market.buys24h ?? "—"} / {market.sells24h ?? "—"}</strong>
                  <small>{tr("buys / sells", "compras / ventas")}</small>
                </div>
              </div>

              <div className="market-acceleration">
                <DataRow label="Δ Market Cap" value={acceleration.marketCapChangePct != null ? `${acceleration.marketCapChangePct >= 0 ? "+" : ""}${pct(acceleration.marketCapChangePct)}` : "—"} />
                <DataRow label={tr("Δ Liquidity", "Δ Liquidez")} value={acceleration.liquidityChangePct != null ? `${acceleration.liquidityChangePct >= 0 ? "+" : ""}${pct(acceleration.liquidityChangePct)}` : "—"} />
                <DataRow label={tr("1h volume ratio", "Ratio volumen 1h")} value={acceleration.volume1hRatio != null ? `${acceleration.volume1hRatio.toFixed(2)}×` : "—"} />
                <DataRow label={tr("1h tx ratio", "Ratio tx 1h")} value={acceleration.tx1hRatio != null ? `${acceleration.tx1hRatio.toFixed(2)}×` : "—"} />
                <DataRow label={tr("Previous baseline", "Baseline anterior")} value={acceleration.previousObservedAt ? new Date(acceleration.previousObservedAt).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}) : "—"} />
              </div>

              {market.url ? <a className="market-link" href={market.url} target="_blank" rel="noreferrer">{tr("Open market on DexScreener ↗", "Abrir mercado en DexScreener ↗")}</a> : null}
            </article>

            <article className="panel" id="onchain">
              <div className="panel-title"><div><span className="icon">⌘</span><h3>Onchain</h3></div><AvailabilityBadge lang={lang} value={availability.onchain} /></div>
              <DataRow label={tr("Network", "Red")} value="Arc Mainnet · 5042" />
              <DataRow label={tr("Contract", "Contrato")} value={short(scan?.contract)} />
              <DataRow label={tr("Symbol", "Símbolo")} value={onchain.symbol || "—"} />
              <DataRow label={tr("Decimals", "Decimales")} value={onchain.decimals != null ? String(onchain.decimals) : "—"} />
              <DataRow label={tr("Standard owner", "Owner estándar")} value={onchain.owner ? short(onchain.owner) : tr("NOT VERIFIED", "SIN VERIFICAR")} />
              <DataRow label="Proxy EIP-1967" value={onchain.proxyImplementation ? short(onchain.proxyImplementation) : onchain.proxyCheck || "—"} />
            </article>

            <article className="panel security-panel" id="seguridad">
              <div className="panel-title">
                <div><span className="icon">⬡</span><h3>{tr("Security", "Seguridad")}</h3></div>
                <AvailabilityBadge lang={lang} value={availability.contractSource} />
              </div>

              <div className="security-summary">
                <div className={`security-kpi ${security.sellObserved === true ? "ok" : security.sellObserved === false ? "bad" : "unknown"}`}>
                  <span>{tr("Sells", "Ventas")}</span>
                  <strong>{security.sellObserved === true ? tr("OBSERVED", "OBSERVADAS") : security.sellObserved === false ? tr("NOT OBSERVED", "NO OBSERVADAS") : tr("UNKNOWN", "DESCONOCIDO")}</strong>
                </div>
                <div className="security-kpi unknown">
                  <span>{tr("Current trading tax", "Impuesto actual de compraventa")}</span>
                  <strong>{tr("NOT VERIFIED", "SIN VERIFICAR")}</strong>
                </div>
              </div>

              <div className="permission-grid">
                {[
                  ["Mint", security.mintCapabilityHint],
                  ["Pause", security.pauseCapabilityHint],
                  ["Blacklist", security.blacklistCapabilityHint],
                  ["AccessControl", security.accessControlHint],
                  ["Admin setters", security.adminSetterHint],
                  ["Upgrade", security.upgradeCapabilityHint],
                ].map(([label, value]: any) => (
                  <div className="permission-item" key={label}>
                    <span>{label}</span>
                    <strong className={value === true ? "perm-bad" : value === false ? "perm-ok" : "perm-unknown"}>
                      {value === true ? tr("DETECTED", "DETECTADO") : value === false ? tr("NOT DETECTED", "NO DETECTADO") : tr("UNKNOWN", "DESCONOCIDO")}
                    </strong>
                  </div>
                ))}
              </div>

              <div className="admin-surface">
                <div className="admin-title">
                  <span>{tr("Detected admin surface", "Superficie administrativa detectada")}</span>
                  <strong>{abiReviewed ? (security.privilegedFunctionNames || []).length : tr("NOT CHECKED", "NO COMPROBADO")}</strong>
                </div>
                <div className="chips">
                  {(security.privilegedFunctionNames || []).slice(0, 8).map((x: string) => <code key={x}>{x}</code>)}
                  {!(security.privilegedFunctionNames || []).length ? <small>{abiReviewed ? tr("No matching admin function names found in the available ABI; this does not prove absence of admin powers.", "No se encontraron nombres administrativos en el ABI disponible; no demuestra que no existan poderes administrativos.") : tr("ABI unavailable: admin function detection has not been completed.", "ABI no disponible: no se ha completado la detección de funciones administrativas.")}</small> : null}
                </div>
                {(security.privilegedFunctionNames || []).length ? (
                  <p className="security-note">{tr("These functions require manual review: appearing in the ABI does not by itself prove they can be abused.", "Estas funciones requieren revisión manual: que aparezcan en el ABI no demuestra por sí solo que puedan abusarse.")}</p>
                ) : null}
              </div>

              <div className="independent-security">
                <div className="independent-security-head">
                  <div>
                    <span>{tr("Independent security", "Seguridad independiente")}</span>
                    <strong>{independentSecurity.provider || "ArcTools ArcSim"}</strong>
                  </div>
                  <span className={`security-provider-status ${independentSecurity.status === "PASSED" ? "ok" : independentSecurity.status === "FAILED" ? "bad" : "unknown"}`}>
                    {independentSecurity.status === "PASSED"
                      ? tr("PASSED", "SUPERADO")
                      : independentSecurity.status === "FAILED"
                        ? tr("FAILED", "FALLIDO")
                        : tr("NOT CHECKED", "NO COMPROBADO")}
                  </span>
                </div>

                <div className="independent-security-grid">
                  <DataRow
                    label={tr("Honeypot verdict", "Veredicto honeypot")}
                    value={independentSecurity.honeypot === false ? tr("NOT DETECTED", "NO DETECTADO") : independentSecurity.honeypot === true ? tr("DETECTED", "DETECTADO") : "—"}
                  />
                  <DataRow
                    label={tr("Sell simulation", "Simulación de venta")}
                    value={independentSecurity.sellSimulation || "—"}
                  />
                  <DataRow
                    label={tr("Amount kept", "Importe conservado")}
                    value={independentSecurity.keepPct != null ? `${Number(independentSecurity.keepPct).toFixed(2)}%` : "—"}
                  />
                  <DataRow
                    label={tr("Checked", "Comprobado")}
                    value={independentSecurity.checkedAt ? new Date(independentSecurity.checkedAt).toLocaleString(lang === "es" ? "es-ES" : "en-US") : "—"}
                  />
                </div>

                <div className="independent-security-actions">
                  <button type="button" onClick={runIndependentSecurityCheck} disabled={securityChecking || !profile?.scan}>
                    {securityChecking
                      ? tr("Checking…", "Comprobando…")
                      : tr("Run deep security check · x402", "Ejecutar seguridad profunda · x402")}
                  </button>
                  <small>{tr("Optional paid ArcTools sell simulation. Price is shown before signing.", "Simulación de venta de ArcTools opcional y de pago. El precio se muestra antes de firmar.")}</small>
                </div>
                {securityMessage ? <p className="security-provider-message">{securityMessage}</p> : null}
              </div>
            </article>

            <article className="panel protocol-panel" id="protocolo">
              <div className="panel-title">
                <div><span className="icon">◈</span><h3>{tr("Protocol context", "Contexto del protocolo")}</h3></div>
                <AvailabilityBadge lang={lang} value={availability.protocolContext} />
              </div>
              {protocol ? (
                <>
                  <div className="protocol-hero">
                    <div>
                      <span className="protocol-kicker">{protocol.protocolName || protocolName}</span>
                      <strong>{scan?.protocolContext?.matched?.[0]?.category || tr("PROTOCOL", "PROTOCOLO")} · {scan?.protocolContext?.matched?.[0]?.networkStatus || "UNKNOWN"}</strong>
                      <small>{tr("Adapter", "Adapter")} {scan?.protocolContext?.matched?.[0]?.integrationStatus || "UNKNOWN"} {tr("in Arc Scout", "en Arc Scout")}</small>
                    </div>
                    <span className={`protocol-state ${protocolData.bonded === true ? "live" : "watch"}`}>
                      {protocolData.bonded === true ? "BONDED" : protocolData.bonded === false ? tr("NOT BONDED", "NO BONDED") : tr("UNKNOWN STATUS", "ESTADO DESCONOCIDO")}
                    </span>
                  </div>

                  <div className="protocol-grid">
                    <DataRow label="Token" value={protocolData.symbol || onchain.symbol || "—"} />
                    <DataRow label={tr("Market venue", "Venue mercado")} value={scan?.protocolContext?.marketVenue || "—"} />
                    <DataRow label="Bonding" value={protocolData.bondingProgressPct != null ? `${protocolData.bondingProgressPct}%` : "—"} />
                    <DataRow label="Buy / Sell Tax · Argus reported" value={`${protocolData.buyTaxPct ?? "—"}% / ${protocolData.sellTaxPct ?? "—"}%`} />
                    <DataRow label={tr("Current market tax", "Impuesto del mercado actual")} value={tr("Not independently verified", "Sin verificación independiente")} />
                    <DataRow label="Dev" value={short(protocolData.devAddress)} />
                    <DataRow label="Pool" value={short(protocolData.poolAddress)} />
                  </div>

                  <div className="protocol-capabilities">
                    <span>{tr("Data provided by this adapter", "Datos que aporta este adapter")}</span>
                    <div className="chips">
                      {(scan?.protocolContext?.matched?.[0]?.capabilities || []).map((x: string) => (
                        <code key={x}>{x}</code>
                      ))}
                    </div>
                  </div>

                  <div className="protocol-evidence">
                    <span>{tr("Source", "Fuente")}</span>
                    <strong>{protocol.sources?.[0]?.provider || "Adapter de protocolo"}</strong>
                    {protocol.sources?.[0]?.url ? (
                      <a href={protocol.sources[0].url} target="_blank" rel="noreferrer">{tr("Open evidence ↗", "Abrir evidencia ↗")}</a>
                    ) : null}
                  </div>

                  {(protocol.limitations || []).length ? (
                    <p className="protocol-note">{tr("Limitation", "Limitación")}: {protocol.limitations[0]}</p>
                  ) : null}
                </>
              ) : <p className="muted-copy">{tr("No matching protocol adapter is available for this contract.", "No hay un adapter de protocolo coincidente para este contrato.")}</p>}
            </article>

            <article className="panel official-panel" id="evidencia">
              <div className="panel-title">
                <div><span className="icon">✓</span><h3>{tr("Official Evidence / Token Utility", "Evidencia oficial / Utilidad del token")}</h3></div>
                <AvailabilityBadge lang={lang} value={availability.officialEvidence} />
              </div>

              <div className="official-summary">
                <div className={`official-kpi ${official.officialContractConfirmed === true ? "ok" : official.officialContractConfirmed === false ? "bad" : "unknown"}`}>
                  <span>{tr("Contract attribution", "Atribución del contrato")}</span>
                  <strong>
                    {official.officialContractConfirmed === true
                      ? tr("VERIFIED", "VERIFICADO")
                      : official.officialContractConfirmed === false
                        ? tr("REJECTED", "RECHAZADO")
                        : tr("UNKNOWN", "DESCONOCIDO")}
                  </strong>
                </div>
                <div className={`official-kpi ${official.tokenUtilityVerified === true ? "ok" : official.tokenUtilityVerified === false ? "bad" : "unknown"}`}>
                  <span>{tr("Token utility / value capture", "Utilidad / captura de valor")}</span>
                  <strong>
                    {official.tokenUtilityVerified === true
                      ? tr("VERIFIED", "VERIFICADA")
                      : official.tokenUtilityVerified === false
                        ? tr("NOT VERIFIED", "NO VERIFICADA")
                        : tr("UNKNOWN", "DESCONOCIDA")}
                  </strong>
                </div>
              </div>

              <div className="official-grid">
                <DataRow label={tr("Product state", "Estado del producto")} value={official.productState || "UNKNOWN"} />
                <DataRow label={tr("Evidence confidence", "Confianza de evidencia")} value={official.confidence || "UNKNOWN"} />
                <DataRow label={tr("Independent usage wallets", "Wallets de uso independiente")} value={official.externalUsageWallets != null ? String(official.externalUsageWallets) : "—"} />
                <DataRow label={tr("Activity circularity", "Circularidad de actividad")} value={official.activityCircularity || "UNKNOWN"} />
              </div>

              <div className="usage-evidence">
                <div className="usage-title">
                  <span>{tr("Usage evidence", "Evidencia de uso")}</span>
                  <span className={`usage-status ${usageEvidence.independenceVerified === true ? "usage-ok" : "usage-unknown"}`}>
                    {usageEvidence.independenceVerified === true
                      ? tr("INDEPENDENT VERIFIED", "INDEPENDIENTE VERIFICADO")
                      : tr("NOT VERIFIED", "NO VERIFICADO")}
                  </span>
                </div>
                <div className="usage-grid">
                  <DataRow label={tr("Paid x402 calls", "Llamadas x402 pagadas")} value={usageEvidence.x402CallsPaid != null ? String(usageEvidence.x402CallsPaid) : "—"} />
                  <DataRow label={tr("Agents on-chain", "Agentes on-chain")} value={usageEvidence.agentsOnchain != null ? String(usageEvidence.agentsOnchain) : "—"} />
                  <DataRow label={tr("Agents observed", "Agentes observados")} value={usageEvidence.totalAgentsObserved != null ? String(usageEvidence.totalAgentsObserved) : "—"} />
                  <DataRow label={tr("Distinct payers", "Pagadores distintos")} value={usageEvidence.distinctPayers != null ? String(usageEvidence.distinctPayers) : "—"} />
                </div>
                {usageEvidence.note ? <p className="usage-note">{usageEvidence.note}</p> : null}
              </div>

              {(official.notes || []).length ? (
                <div className="official-notes">
                  {(official.notes || []).slice(0, 4).map((note: string) => <p key={note}>• {note}</p>)}
                </div>
              ) : null}

              <div className="official-links">
                {official.productUrl ? <a href={official.productUrl} target="_blank" rel="noreferrer">{tr("Open product ↗", "Abrir producto ↗")}</a> : null}
                {official.sources?.[0]?.url ? <a href={official.sources[0].url} target="_blank" rel="noreferrer">{tr("Open official source ↗", "Abrir fuente oficial ↗")}</a> : null}
              </div>
            </article>

            <article className="panel" id="datos">
              <div className="panel-title"><div><span className="icon">◎</span><h3>{tr("Data availability", "Disponibilidad de datos")}</h3></div></div>
              <div className="availability-grid">
                <DataRow label={tr("Market", "Mercado")} value={lang === "es" ? ({AVAILABLE:"DISPONIBLE",UNAVAILABLE:"NO DISPONIBLE",NOT_CHECKED:"NO COMPROBADO",UNKNOWN:"DESCONOCIDO"} as Record<string,string>)[availability.market || "UNKNOWN"] || availability.market || "DESCONOCIDO" : availability.market || "UNKNOWN"} />
                <DataRow label="Onchain" value={availability.onchain || "UNKNOWN"} />
                <DataRow label={tr("Code / ABI", "Código / ABI")} value={lang === "es" ? ({AVAILABLE:"DISPONIBLE",UNAVAILABLE:"NO DISPONIBLE",NOT_CHECKED:"NO COMPROBADO",UNKNOWN:"DESCONOCIDO"} as Record<string,string>)[availability.contractSource || "UNKNOWN"] || availability.contractSource || "DESCONOCIDO" : availability.contractSource || "UNKNOWN"} />
                <DataRow label="Holders" value={lang === "es" ? ({AVAILABLE:"DISPONIBLE",UNAVAILABLE:"NO DISPONIBLE",NOT_CHECKED:"NO COMPROBADO",UNKNOWN:"DESCONOCIDO"} as Record<string,string>)[availability.holders || "UNKNOWN"] || availability.holders || "DESCONOCIDO" : availability.holders || "UNKNOWN"} />
                <DataRow label={tr("Official evidence", "Evidencia oficial")} value={lang === "es" ? ({AVAILABLE:"DISPONIBLE",UNAVAILABLE:"NO DISPONIBLE",NOT_CHECKED:"NO COMPROBADO",UNKNOWN:"DESCONOCIDO"} as Record<string,string>)[availability.officialEvidence || "UNKNOWN"] || availability.officialEvidence || "DESCONOCIDO" : availability.officialEvidence || "UNKNOWN"} />
                <DataRow label={tr("Independent security", "Seguridad independiente")} value={lang === "es" ? ({AVAILABLE:"DISPONIBLE",UNAVAILABLE:"NO DISPONIBLE",NOT_CHECKED:"NO COMPROBADO",UNKNOWN:"DESCONOCIDO"} as Record<string,string>)[availability.independentSecurity || "NOT_CHECKED"] || availability.independentSecurity || "NO COMPROBADO" : availability.independentSecurity || "NOT_CHECKED"} />
              </div>
            </article>

            <article className="panel guide-panel">
              <div className="panel-title"><div><span className="icon">?</span><h3>{tr("How to read this profile", "Cómo leer esta ficha")}</h3></div></div>
              <div className="guide-step"><b>1</b><div><strong>{tr("Review the classification", "Revisa la clasificación")}</strong><p>{tr("Summarizes the evidence gathered and what is still missing.", "Resume la evidencia reunida y lo que todavía falta.")}</p></div></div>
              <div className="guide-step"><b>2</b><div><strong>{tr("Check Security and Onchain", "Comprueba Seguridad y Onchain")}</strong><p>{tr("Look for admin permissions, taxes, observed sells and proxy behavior.", "Busca permisos administrativos, taxes, ventas observadas y proxy.")}</p></div></div>
              <div className="guide-step"><b>3</b><div><strong>{tr("Check availability states", "Mira los estados de disponibilidad")}</strong><p>{tr("UNKNOWN and NOT CHECKED must never be interpreted as “no risk”.", "UNKNOWN y NOT CHECKED nunca deben interpretarse como “sin riesgo”.")}</p></div></div>
            </article>
          </section>

          <section className="limitations-panel evidence-sources">
            <h3>{tr("Sources and observation times", "Fuentes y fechas de observación")}</h3>
            <p>{tr("A source timestamp records when Scout collected the data; it does not prove when the source last updated it.", "La fecha indica cuándo Scout consultó los datos; no demuestra cuándo los actualizó la fuente.")}</p>
            <div>
              {(scan?.sources || []).map((source: any, index: number) => (
                <p key={`${source.provider}-${index}`}>
                  <strong>{source.provider}</strong>{" · "}
                  {source.observedAt && Number.isFinite(Date.parse(source.observedAt)) ? new Date(source.observedAt).toLocaleString(lang === "es" ? "es-ES" : "en-US") : tr("Time unavailable", "Fecha no disponible")}
                  {source.note ? ` · ${source.note}` : ""}{" "}
                  {typeof source.url === "string" && /^https?:\/\//i.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer">{tr("Open source ↗", "Abrir fuente ↗")}</a> : null}
                </p>
              ))}
              {!(scan?.sources || []).length ? <p>{tr("Source records unavailable.", "Registros de fuentes no disponibles.")}</p> : null}
            </div>
          </section>

          <section className="limitations-panel">
            <h3>{tr("Declared limitations", "Limitaciones declaradas")}</h3>
            <div>
              {(scan?.limitations || []).map((x: string) => <p key={x}>• {x}</p>)}
            </div>
          </section>
        </>
      )}

      <footer>
        <span>Arc Scout · research-only intelligence</span>
        <span>No trading · No custody · No automated buys</span>
      </footer>
    </main>
  );
}

