"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Lang = "en" | "es";

const short = (value?: string | null) => {
  if (!value) return "—";
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
};

function normalizeRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.agents)) return payload.agents;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.results && typeof payload.results === "object") return normalizeRows(payload.results);
  return [];
}

export default function AgentsExplorerPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("score");
  const [x402Only, setX402Only] = useState(false);
  const [economicOnly, setEconomicOnly] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("arc-scout-language");
    if (saved === "en" || saved === "es") setLang(saved);
    void runSearch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tr = (en: string, es: string) => lang === "es" ? es : en;

  const toggleLang = () => {
    const next: Lang = lang === "en" ? "es" : "en";
    setLang(next);
    window.localStorage.setItem("arc-scout-language", next);
  };

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("sort", sort);
      params.set("limit", "50");
      const response = await fetch(`/api/agents?${params.toString()}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      setData(body);
    } catch (error) {
      setData({ error: error instanceof Error ? error.message : "Agent discovery failed" });
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => normalizeRows(data?.results), [data]);

  const filteredRows = useMemo(() => rows.filter((row: any) => {
    const x402 = row.x402 === true || row.x402Support === true || row.x402_support === true;
    const settled = Number(row.settledUsdc ?? row.settledUSDC ?? row?.trust?.settledUsdc ?? row?.reputation?.settledUsdc ?? 0);
    const paidClients = Number(row.paidClients ?? row.payingClients ?? row?.trust?.paidClients ?? row?.reputation?.payingClients ?? 0);
    if (x402Only && !x402) return false;
    if (economicOnly && !(settled > 0 || paidClients > 0)) return false;
    return true;
  }), [rows, x402Only, economicOnly]);

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
        <span className="eyebrow">{tr("ARC AGENT EXPLORER", "EXPLORADOR DE AGENTES ARC")}</span>
        <h1>{tr("Registered is not the same as functional.", "Registrado no significa funcional.")}</h1>
        <p>{tr(
          "Discover ERC-8004 agents through ArcID, then separate registration from services, economic activity and what Arc Scout can verify independently.",
          "Descubre agentes ERC-8004 mediante ArcID y separa registro, servicios, actividad económica y lo que Arc Scout puede verificar de forma independiente."
        )}</p>

        <form className="explorer-search" onSubmit={runSearch}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Search agent name, description or owner…", "Buscar agente, descripción u owner…")}
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="relevance">{tr("Relevance", "Relevancia")}</option>
            <option value="score">Trust Score</option>
            <option value="feedback">Feedback</option>
            <option value="settled">Settled USDC</option>
            <option value="newest">{tr("Newest", "Más nuevos")}</option>
          </select>
          <button type="submit" disabled={loading}>{loading ? tr("Searching…", "Buscando…") : tr("Search", "Buscar")}</button>
        </form>

        <div className="explorer-filters">
          <button type="button" className={x402Only ? "active" : ""} onClick={() => setX402Only((v) => !v)}>
            x402 {x402Only ? "✓" : ""}
          </button>
          <button type="button" className={economicOnly ? "active" : ""} onClick={() => setEconomicOnly((v) => !v)}>
            {tr("Economic activity", "Actividad económica")} {economicOnly ? "✓" : ""}
          </button>
          <span>{tr("Filters are local to the current ArcID result set.", "Los filtros se aplican al conjunto actual devuelto por ArcID.")}</span>
        </div>
      </section>

      {data?.error ? <section className="agent-error">{data.error}</section> : null}

      <section className="explorer-summary">
        <div><span>{tr("Results", "Resultados")}</span><strong>{filteredRows.length}</strong></div>
        <div><span>{tr("Indexer", "Indexer")}</span><strong>{data?.indexerHealth?.available ? "ONLINE" : "UNKNOWN"}</strong></div>
        <div><span>{tr("Blocks behind", "Bloques de retraso")}</span><strong>{data?.indexerHealth?.blocksBehind ?? "—"}</strong></div>
      </section>

      <section className="agent-results">
        {filteredRows.map((row: any, index: number) => {
          const id = row.id ?? row.agentId ?? row.agent_id;
          const name = row.name ?? row.agentName ?? `Agent #${id ?? index + 1}`;
          const description = row.description ?? row.bio ?? "";
          const trustScore = row.trustScore ?? row.trust_score ?? row?.trust?.score ?? row?.reputation?.trustScore;
          const feedback = row.feedbackCount ?? row.feedback_count ?? row?.reputation?.feedbackCount ?? row?.reputation?.feedbackCount;
          const settled = row.settledUsdc ?? row.settledUSDC ?? row?.trust?.settledUsdc ?? row?.reputation?.settledUsdc;
          const x402 = row.x402 === true || row.x402Support === true || row.x402_support === true;
          const rawPaidClients = row.paidClients ?? row.payingClients ?? row?.trust?.paidClients ?? row?.reputation?.payingClients;
          const paidClients = rawPaidClients == null || rawPaidClients === "" || !Number.isFinite(Number(rawPaidClients)) ? null : Number(rawPaidClients);
          const hasEconomicActivity = Number(settled ?? 0) > 0 || (paidClients ?? 0) > 0;
          const owner = row.owner ?? row.ownerAddress ?? row.wallet;

          return (
            <a className="agent-result-card" href={id != null ? `/agents/${id}` : "#"} key={String(id ?? index)}>
              <div className="agent-result-main">
                <div className="agent-result-title">
                  <strong>{name}</strong>
                  {id != null ? <span>#{id}</span> : null}
                  {x402 ? <span className="mini-pill good">x402</span> : null}
                  {hasEconomicActivity
                    ? <span className="mini-pill economic">{tr("ECONOMIC ACTIVITY", "ACTIVIDAD ECONÓMICA")}</span>
                    : <span className="mini-pill muted">{tr("REGISTERED", "REGISTRADO")}</span>}
                </div>
                <p>{description || tr("No description exposed by the indexer.", "El indexer no expone descripción.")}</p>
                <small>{short(owner)}</small>
              </div>
              <div className="agent-result-metrics">
                <div><span>Trust</span><strong>{trustScore != null ? Number(trustScore).toFixed(1) : "—"}</strong></div>
                <div><span>Feedback</span><strong>{feedback != null ? String(feedback) : "—"}</strong></div>
                <div><span>{tr("Paid clients", "Clientes pago")}</span><strong>{paidClients != null ? String(paidClients) : "—"}</strong></div>
                <div><span>USDC</span><strong>{settled != null ? Number(settled).toFixed(2) : "—"}</strong></div>
              </div>
            </a>
          );
        })}
      </section>

      {!loading && !data?.error && filteredRows.length === 0 ? (
        <section className="empty-state">{tr("No agents matched this search.", "Ningún agente coincide con la búsqueda.")}</section>
      ) : null}

      <section className="agent-limitations">
        <h3>{tr("Interpretation notes", "Notas de interpretación")}</h3>
        {(data?.limitations || []).map((item: string) => <p key={item}>• {item}</p>)}
      </section>
    </main>
  );
}

