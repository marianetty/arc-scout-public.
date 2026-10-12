"use client";

import { useEffect, useState } from "react";

type Lang = "en" | "es";

const short = (value?: string | null) => {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
};

const money = (value?: number | null) => {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(Number(value));
};

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const [agentId, setAgentId] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("arc-scout-language");
    if (saved === "en" || saved === "es") setLang(saved);

    params.then(({ id }) => {
      setAgentId(id);
      fetch(`/api/agents/${encodeURIComponent(id)}`, { cache: "no-store" })
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
          setData(body);
        })
        .catch((error) => setData({ error: error instanceof Error ? error.message : "Agent load failed" }))
        .finally(() => setLoading(false));
    });
  }, [params]);

  const tr = (en: string, es: string) => lang === "es" ? es : en;

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    window.localStorage.setItem("arc-scout-language", next);
  };

  const agent = data?.agent || {};
  const identity = agent?.identity || {};
  const reputation = agent?.reputation || {};
  const validations = agent?.validations || {};
  const health = data?.indexerHealth || {};
  const services = identity?.services || [];

  return (
    <main className="site-shell agent-page">
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

      <section className="agent-hero">
        <div>
          <span className="eyebrow">{tr("ERC-8004 AGENT INTELLIGENCE", "INTELIGENCIA DE AGENTES ERC-8004")}</span>
          <h1>{loading ? tr("Loading agent…", "Cargando agente…") : identity.name || `Agent #${agentId}`}</h1>
          <p>{identity.description || tr("External ArcID identity and reputation context, separated from Arc Scout verification.", "Contexto externo de identidad y reputación de ArcID, separado de la verificación propia de Arc Scout.")}</p>
        </div>
        <div className="agent-hero-badges">
          <span className="agent-id-badge">ERC-8004 · #{agentId || "—"}</span>
          <span className={`agent-x402-badge ${identity.x402Support === true ? "live" : "unknown"}`}>
            x402 {identity.x402Support === true ? "SUPPORTED" : "UNKNOWN"}
          </span>
        </div>
      </section>

      {data?.error ? (
        <section className="agent-error">{data.error}</section>
      ) : loading ? (
        <section className="agent-error" role="status">{tr("Loading ArcID evidence…", "Cargando evidencia de ArcID…")}</section>
      ) : (
        <section className="agent-intelligence-grid">
          <article className="panel agent-panel">
            <div className="panel-title">
              <div><span className="icon">◉</span><h3>{tr("Identity", "Identidad")}</h3></div>
              <span className="agent-source-badge">ARCID INDEXER</span>
            </div>
            <DataRow label={tr("Agent ID", "ID del agente")} value={String(agent.agentId ?? agentId ?? "—")} />
            <DataRow label={tr("Owner", "Propietario")} value={short(identity.owner)} />
            <DataRow label={tr("Agent wallet", "Wallet del agente")} value={short(identity.agentWallet)} />
            <DataRow label={tr("Metadata", "Metadatos")} value={identity.metadataStatus || "—"} />
            <DataRow label={tr("Registered block", "Bloque de registro")} value={identity.registeredBlock != null ? String(identity.registeredBlock) : "—"} />
            <DataRow label={tr("Registration tx", "Tx de registro")} value={short(identity.registeredTx)} />
          </article>

          <article className="panel agent-panel">
            <div className="panel-title">
              <div><span className="icon">⌁</span><h3>{tr("Services", "Servicios")}</h3></div>
              <span className={`agent-service-status ${identity.x402Support === true ? "ok" : "unknown"}`}>
                {identity.x402Support === true ? "x402" : tr("UNKNOWN", "DESCONOCIDO")}
              </span>
            </div>
            {services.length ? services.map((service: any, index: number) => (
              <div className="agent-service-row" key={`${service.name || "service"}-${index}`}>
                <div>
                  <strong>{service.name || tr("Service", "Servicio")}</strong>
                  <small>{service.endpoint || "—"}</small>
                </div>
                {typeof service.endpoint === "string" && /^https?:\/\//i.test(service.endpoint) ? <a href={service.endpoint} target="_blank" rel="noreferrer">↗</a> : null}
              </div>
            )) : <p className="muted-copy">{tr("No services declared.", "No hay servicios declarados.")}</p>}
            <p className="agent-panel-note">
              {tr(
                "Services are declared in ERC-8004 metadata. Arc Scout does not treat declaration alone as proof that a service is functional.",
                "Los servicios se declaran en los metadatos ERC-8004. Arc Scout no considera la declaración por sí sola como prueba de funcionamiento."
              )}
            </p>
          </article>

          <article className="panel agent-panel">
            <div className="panel-title">
              <div><span className="icon">◇</span><h3>{tr("ArcID Reputation", "Reputación ArcID")}</h3></div>
              <span className="agent-source-badge">{tr("EXTERNAL", "EXTERNA")}</span>
            </div>
            <div className="agent-trust-score">
              <span>{tr("Trust Score", "Trust Score")}</span>
              <strong>{reputation.trustScore != null ? Number(reputation.trustScore).toFixed(1) : "—"}</strong>
              <small>{tr("ArcID context — not an Arc Scout verdict", "Contexto ArcID — no es un veredicto de Arc Scout")}</small>
            </div>
            <div className="agent-metrics-grid">
              <DataRow label={tr("Feedback", "Feedback")} value={reputation.feedbackCount != null ? String(reputation.feedbackCount) : "—"} />
              <DataRow label={tr("Paying clients", "Clientes de pago")} value={reputation.payingClients != null ? String(reputation.payingClients) : "—"} />
              <DataRow label={tr("Unpaid clients", "Clientes sin pago")} value={reputation.unpaidClients != null ? String(reputation.unpaidClients) : "—"} />
              <DataRow label={tr("Settled USDC", "USDC liquidado")} value={money(reputation.settledUsdc)} />
            </div>
          </article>

          <article className="panel agent-panel verification-panel">
            <div className="panel-title">
              <div><span className="icon">✓</span><h3>{tr("Arc Scout Verification", "Verificación Arc Scout")}</h3></div>
              <span className="agent-verification-pending">{tr("IN PROGRESS", "EN DESARROLLO")}</span>
            </div>
            <div className="verification-list">
              <div><span>{tr("ERC-8004 identity", "Identidad ERC-8004")}</span><strong className="verified">{tr("OBSERVED", "OBSERVADA")}</strong></div>
              <div><span>{tr("x402 product test", "Prueba producto x402")}</span><strong>{tr("NOT CHECKED", "NO COMPROBADO")}</strong></div>
              <div><span>{tr("Endpoint uptime", "Uptime endpoint")}</span><strong>{tr("NOT CHECKED", "NO COMPROBADO")}</strong></div>
              <div><span>{tr("Independent paying usage", "Uso de pago independiente")}</span><strong>{tr("UNKNOWN", "DESCONOCIDO")}</strong></div>
            </div>
            <p className="agent-panel-note">
              {tr(
                "This section will be populated by Arc Scout Mystery Shopper, uptime monitoring and the future Evidence Ledger.",
                "Esta sección se alimentará con Mystery Shopper, monitorización de uptime y el futuro Evidence Ledger de Arc Scout."
              )}
            </p>
          </article>

          <article className="panel agent-panel">
            <div className="panel-title">
              <div><span className="icon">◎</span><h3>{tr("Indexer / Validation", "Indexer / Validación")}</h3></div>
              <span className={`agent-indexer-status ${health.available && (health.blocksBehind === 0 || health.blocksBehind == null) ? "ok" : "warn"}`}>
                {health.available ? tr("ONLINE", "ONLINE") : tr("UNKNOWN", "DESCONOCIDO")}
              </span>
            </div>
            <DataRow label={tr("Indexed block", "Bloque indexado")} value={health.indexedBlock != null ? String(health.indexedBlock) : "—"} />
            <DataRow label={tr("Chain head", "Cabeza de cadena")} value={health.chainHead != null ? String(health.chainHead) : "—"} />
            <DataRow label={tr("Blocks behind", "Bloques de retraso")} value={health.blocksBehind != null ? String(health.blocksBehind) : "—"} />
            <DataRow label={tr("Mainnet validations", "Validaciones mainnet")} value={validations.availableOnNetwork ? String(validations.total ?? "—") : tr("REGISTRY NOT DEPLOYED", "REGISTRO NO DESPLEGADO")} />
          </article>

          <article className="panel agent-panel provenance-panel">
            <div className="panel-title">
              <div><span className="icon">↳</span><h3>{tr("Evidence Provenance", "Procedencia de evidencia")}</h3></div>
            </div>
            <DataRow label={tr("Source", "Fuente")} value={agent.source?.provider || "ArcID indexer"} />
            <DataRow label={tr("Observed", "Consultado")} value={agent.source?.observedAt && Number.isFinite(Date.parse(agent.source.observedAt)) ? new Date(agent.source.observedAt).toLocaleString(lang === "es" ? "es-ES" : "en-US") : "—"} />
            <div className="provenance-row">
              <span>ARCID_INDEXER</span>
              <p>{tr("Identity, metadata and external reputation.", "Identidad, metadatos y reputación externa.")}</p>
            </div>
            <div className="provenance-row pending">
              <span>ARC_SCOUT_VERIFIED</span>
              <p>{tr("Direct product tests, uptime and independent usage — coming next.", "Pruebas directas de producto, uptime y uso independiente — siguiente fase.")}</p>
            </div>
          </article>
        </section>
      )}

      <section className="agent-limitations">
        <h3>{tr("Interpretation notes", "Notas de interpretación")}</h3>
        {(data?.limitations || []).map((item: string) => <p key={item}>• {item}</p>)}
      </section>

      <footer>
        <span>Arc Scout · research-only intelligence</span>
        <span>No trading · No custody · No automated buys</span>
      </footer>
    </main>
  );
}

