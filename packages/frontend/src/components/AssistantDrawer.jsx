import React from "react";
import CitationBadge from "./CitationBadge";
import Tooltip from "./Tooltip";
import SmartLoader from "./SmartLoader";
import { loadLlmConfig } from "../lib/llmConfig";
import { chatCompletions, extractAssistantText } from "../lib/llmClient";
import { splitThink } from "../lib/llmThink";
import { parseStructuredLlmAnswer } from "../lib/llmStructured";
import { buildMcccDataInterpretationPrompt } from "../lib/llmPrompts";
import { getLlmApiUrl } from "../lib/llmEnv";

function fmt(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  return x >= 1000 ? x.toFixed(0) : x.toFixed(2);
}

function norm(s) {
  return String(s ?? "").trim();
}

function pickOutcomeKind(outcome) {
  const s = String(outcome ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("defendant")) return "defendant";
  if (s.includes("plaintiff")) return "plaintiff";
  return "other";
}

function computeTopInsights({ events, selectionSummary }) {
  const out = [];
  const links = selectionSummary?.links ?? [];

  // 1) Rivalries (top edges)
  for (const l of links.slice(0, 3)) {
    out.push({
      id: `rivalry:${l.source}→${l.target}`,
      kind: "rivalry",
      title: "Top rivalry",
      subtitle: `${l.source} → ${l.target} · w=${fmt(l.weight)} · n=${l.count}`,
      pair: { sender: l.source, receiver: l.target },
      rowIds: l.rowIds ?? [],
    });
  }

  // 2) Defendant advantage (overall)
  let def = 0;
  let pla = 0;
  const defEvidence = [];
  const plaEvidence = [];
  for (const e of events ?? []) {
    const kind = pickOutcomeKind(e.annotation);
    if (kind === "defendant") {
      def += 1;
      if (defEvidence.length < 12) defEvidence.push(e.rowId);
    } else if (kind === "plaintiff") {
      pla += 1;
      if (plaEvidence.length < 12) plaEvidence.push(e.rowId);
    }
  }
  const denom = def + pla;
  if (denom >= 20) {
    const rate = def / denom;
    out.push({
      id: "def-adv:overall",
      kind: "defendant_advantage",
      title: "Defendant advantage",
      subtitle: `DefendantWin rate ≈ ${(rate * 100).toFixed(1)}% (n=${denom})`,
      rowIds: (rate >= 0.5 ? defEvidence : plaEvidence).filter((x) => Number.isFinite(Number(x))),
    });
  }

  // 3) Case-type heterogeneity (largest deviation)
  const byType = new Map(); // caseType -> {def,pla,total,rowIds}
  for (const e of events ?? []) {
    const t = norm(e.metabolite || "NA");
    const prev = byType.get(t) ?? { def: 0, pla: 0, total: 0, rowIds: [] };
    prev.total += 1;
    const kind = pickOutcomeKind(e.annotation);
    if (kind === "defendant") prev.def += 1;
    if (kind === "plaintiff") prev.pla += 1;
    if (prev.rowIds.length < 12) prev.rowIds.push(e.rowId);
    byType.set(t, prev);
  }
  if (denom >= 20 && byType.size) {
    const base = def / denom;
    const rows = [...byType.entries()]
      .map(([caseType, v]) => {
        const n = v.def + v.pla;
        if (n < 12) return null;
        const rate = n ? v.def / n : 0;
        return { caseType, n, rate, delta: rate - base, rowIds: v.rowIds };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 2);
    for (const r of rows) {
      out.push({
        id: `case-type:${r.caseType}`,
        kind: "case_type",
        title: "Case type heterogeneity",
        subtitle: `${r.caseType} · DefWin ${(r.rate * 100).toFixed(1)}% (n=${r.n}, Δ ${(r.delta * 100).toFixed(1)}pp)`,
        filterPatch: { metaboliteQuery: r.caseType === "NA" ? "" : r.caseType, topEdges: 500 },
        rowIds: r.rowIds ?? [],
      });
    }
  }

  return out.slice(0, 5);
}

function normalizeAssistantTabGroup(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "analysis" || s === "verify") return s;
  // Back-compat with older 4-tab layout.
  if (s === "insights" || s === "firm") return "analysis";
  if (s === "evidence" || s === "verifier") return "verify";
  return "analysis";
}

export default function AssistantDrawer({
  open,
  tab,
  onTab,
  selectedCell,
  details,
  selectedPair,
  selectionSummary,
  events,
  eventsAll,
  filters,
  focusCell,
  focusMode,
  onClose,
  onApplyFocus,
  onClearFocus,
  onSelectPair,
  onOpenEvidence,
  onApplyFilterPatch,
  onNavigate,
}) {
  const activeTab = normalizeAssistantTabGroup(tab);
  const topInsights = React.useMemo(
    () => computeTopInsights({ events: Array.isArray(events) ? events : [], selectionSummary }),
    [events, selectionSummary],
  );
  const nextAction = React.useMemo(() => {
    const ranked = topInsights.filter((x) => x && x.rowIds?.length);
    const rivalry = ranked.find((x) => x.kind === "rivalry" && x.pair);
    return rivalry || ranked[0] || null;
  }, [topInsights]);

  const selectedPairEvidence = React.useMemo(() => {
    const s = selectedPair?.sender;
    const r = selectedPair?.receiver;
    if (!s || !r) return null;
    const k = `${s}\t${r}`;
    return selectionSummary?.matrix?.pairs?.get?.(k) ?? null;
  }, [selectionSummary, selectedPair]);

  const [analysisFirmOpen, setAnalysisFirmOpen] = React.useState(false);
  const [verifyVerifierOpen, setVerifyVerifierOpen] = React.useState(false);

  React.useEffect(() => {
    if (selectedCell && details) setAnalysisFirmOpen(true);
  }, [selectedCell, details]);

  React.useEffect(() => {
    if (selectedPair?.sender && selectedPair?.receiver) setVerifyVerifierOpen(true);
  }, [selectedPair?.sender, selectedPair?.receiver]);

  const [llmBusy, setLlmBusy] = React.useState(false);
  const [llmError, setLlmError] = React.useState("");
  const [llmMeta, setLlmMeta] = React.useState({ mock: false, reason: "" });
  const [llmTopRows, setLlmTopRows] = React.useState(24);
  const [llmResult, setLlmResult] = React.useState({ think: "", markdown: "", payload: null, raw: "" });

  const apiUrl = getLlmApiUrl();

  const runVerifier = async () => {
    setLlmBusy(true);
    setLlmError("");
    setLlmMeta({ mock: false, reason: "" });
    setLlmResult({ think: "", markdown: "", payload: null, raw: "" });
    try {
      const cfg = loadLlmConfig();
      const prompt = buildMcccDataInterpretationPrompt({
        events: Array.isArray(events) ? events : [],
        filters: filters ?? null,
        maxRows: llmTopRows,
      });
      const resp = await chatCompletions({
        apiKey: cfg.apiKey,
        body: {
          model: cfg.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 900,
          temperature: 0.2,
        },
      });
      setLlmMeta({ mock: !!resp?.mock, reason: String(resp?.mockReason ?? "") });
      const text = extractAssistantText(resp);
      if (!text) throw new Error("LLM returned empty output (choices[0].message.content missing)");
      const { think, answer } = splitThink(text);
      const structured = parseStructuredLlmAnswer(answer);
      setLlmResult({ think, ...structured });
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "Verifier failed");
    } finally {
      setLlmBusy(false);
    }
  };

  const claims = Array.isArray(llmResult?.payload?.claims) ? llmResult.payload.claims : [];
  const filterPatch = llmResult?.payload?.filterPatch ?? null;

  if (!open) return null;

  return (
    <div className="drawer" role="dialog" aria-label="assistant drawer">
      <div className="drawer-inner">
        <div className="drawer-head">
            <div>
              <div className="card-title">Assistant</div>
              <div className="card-sub">Insights/Firm · Evidence/Verifier</div>
            </div>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {[
              ["analysis", "Insights/Firm"],
              ["verify", "Evidence/Verifier"],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`btn small ${activeTab === k ? "primary" : ""}`}
                onClick={() => (typeof onTab === "function" ? onTab(k) : null)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ height: 10 }} />

          {activeTab === "analysis" ? (
            <>
              <div className="details-block" style={{ marginBottom: 12 }}>
                <div className="row split" style={{ gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title" style={{ fontSize: 13 }}>
                      Next step
                    </div>
                    <div className="card-sub" style={{ marginTop: 4 }}>
                      {nextAction
                        ? `Click once to auto-focus ${nextAction.kind === "rivalry" ? "a rivalry edge" : "an insight"} and open RowId-level evidence.`
                        : 'Import data first, or use the top-right "Story" to load the Top50/Top100 presets.'}
                    </div>
                    {nextAction ? <div className="meta" style={{ marginTop: 6 }}>{nextAction.subtitle}</div> : null}
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {nextAction?.rowIds?.length ? (
                      <button
                        className="btn small primary"
                        onClick={() => {
                          if (nextAction.pair && typeof onSelectPair === "function") onSelectPair(nextAction.pair);
                          if (nextAction.filterPatch && typeof onApplyFilterPatch === "function") onApplyFilterPatch(nextAction.filterPatch);
                          if (typeof onNavigate === "function") onNavigate("network");
                          if (typeof onOpenEvidence === "function") onOpenEvidence(nextAction.rowIds, `Next step · ${nextAction.subtitle}`);
                        }}
                      >
                        Focus + Evidence
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="list">
                <h4>Top 5 insights (clickable)</h4>
                {topInsights.length ? (
                  topInsights.map((it) => (
                    <div
                      key={it.id}
                      className="item"
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        if (it.pair && typeof onSelectPair === "function") onSelectPair(it.pair);
                        if (it.filterPatch && typeof onApplyFilterPatch === "function") onApplyFilterPatch(it.filterPatch);
                        if (typeof onNavigate === "function") onNavigate("network");
                        if (it.rowIds?.length && typeof onOpenEvidence === "function") onOpenEvidence(it.rowIds, it.subtitle || it.title);
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{it.title}</div>
                        <div className="meta">{it.subtitle}</div>
                      </div>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {it.rowIds?.length ? (
                          <CitationBadge rowIds={it.rowIds} onOpenEvidence={(ids) => (typeof onOpenEvidence === "function" ? onOpenEvidence(ids, it.subtitle) : null)} />
                        ) : (
                          <span className="pill">no evidence</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    —
                  </div>
                )}
              </div>

              <div style={{ height: 12 }} />

              <div className="row split" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div className="card-title" style={{ fontSize: 13 }}>
                  Firm profile
                </div>
                <button className="btn small" type="button" onClick={() => setAnalysisFirmOpen((v) => !v)}>
                  {analysisFirmOpen ? "Collapse" : "Expand"}
                </button>
              </div>

              <div style={{ height: 10 }} />

              {analysisFirmOpen ? (
                !selectedCell || !details ? (
                  <div className="notice">Click a firm in Network/Matrix first.</div>
                ) : (
                  <>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <Tooltip content={selectedCell} maxWidth={560}>
                        <span className="pill td-ellipsis" style={{ maxWidth: 260 }}>
                          {selectedCell}
                        </span>
                      </Tooltip>
                      <button className="btn small" onClick={() => (typeof onApplyFocus === "function" ? onApplyFocus(selectedCell, "any") : null)}>
                        Focus (any)
                      </button>
                      <button className="btn small" onClick={() => (typeof onApplyFocus === "function" ? onApplyFocus(selectedCell, "outgoing") : null)}>
                        Focus (out)
                      </button>
                      <button className="btn small" onClick={() => (typeof onApplyFocus === "function" ? onApplyFocus(selectedCell, "incoming") : null)}>
                        Focus (in)
                      </button>
                      {focusCell === selectedCell ? (
                        <button className="btn danger small" onClick={onClearFocus}>
                          Clear focus
                        </button>
                      ) : null}
                      {focusCell === selectedCell ? <span className="pill">focused ({focusMode ?? "any"})</span> : null}
                    </div>

                    <div className="metric">
                      <div>
                        <div className="k">Total weight</div>
                        <div className="v">{fmt(details.totalWeight)}</div>
                      </div>
                      <div>
                        <div className="k">Total edges</div>
                        <div className="v">{(details.inCount ?? 0) + (details.outCount ?? 0)}</div>
                      </div>
                      <div>
                        <div className="k">Outgoing weight</div>
                        <div className="v">{fmt(details.outWeight)}</div>
                      </div>
                      <div>
                        <div className="k">Incoming weight</div>
                        <div className="v">{fmt(details.inWeight)}</div>
                      </div>
                    </div>

                    <div className="divider" />

                    <div className="list">
                      <h4>Top opponents (as plaintiff)</h4>
                      {details.extra?.outgoingPartners?.length ? (
                        details.extra.outgoingPartners.map((p) => (
                          <div
                            key={`out-${p.key}`}
                            className="item"
                            onClick={() => (typeof onSelectPair === "function" ? onSelectPair({ sender: selectedCell, receiver: p.key }) : null)}
                          >
                            <Tooltip content={p.key} maxWidth={560}>
                              <div className="name td-ellipsis" style={{ maxWidth: 210 }}>
                                {p.key}
                              </div>
                            </Tooltip>
                            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              <div className="meta">
                                w={fmt(p.weight)} · n={p.count}
                              </div>
                              <CitationBadge
                                rowIds={p.rowIds ?? []}
                                onOpenEvidence={(ids) =>
                                  typeof onOpenEvidence === "function" ? onOpenEvidence(ids, `${selectedCell}→${p.key} · evidence`) : null
                                }
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                          —
                        </div>
                      )}
                    </div>

                    <div className="list">
                      <h4>Top opponents (as defendant)</h4>
                      {details.extra?.incomingPartners?.length ? (
                        details.extra.incomingPartners.map((p) => (
                          <div
                            key={`in-${p.key}`}
                            className="item"
                            onClick={() => (typeof onSelectPair === "function" ? onSelectPair({ sender: p.key, receiver: selectedCell }) : null)}
                          >
                            <Tooltip content={p.key} maxWidth={560}>
                              <div className="name td-ellipsis" style={{ maxWidth: 210 }}>
                                {p.key}
                              </div>
                            </Tooltip>
                            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              <div className="meta">
                                w={fmt(p.weight)} · n={p.count}
                              </div>
                              <CitationBadge
                                rowIds={p.rowIds ?? []}
                                onOpenEvidence={(ids) => (typeof onOpenEvidence === "function" ? onOpenEvidence(ids, `${p.key}→${selectedCell} · evidence`) : null)}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                          —
                        </div>
                      )}
                    </div>
                  </>
                )
              ) : null}
            </>
          ) : (
            <>
              {selectedPairEvidence ? (
                <>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span className="pill">Pair</span>
                    <Tooltip content={`${selectedPair.sender} → ${selectedPair.receiver}`} maxWidth={560}>
                      <span className="pill td-ellipsis" style={{ maxWidth: 260 }}>
                        {selectedPair.sender} → {selectedPair.receiver}
                      </span>
                    </Tooltip>
                    <span className="pill">
                      w={fmt(selectedPairEvidence.weight)} · n={selectedPairEvidence.count}
                    </span>
                    <CitationBadge
                      rowIds={selectedPairEvidence.rowIds ?? []}
                      onOpenEvidence={(ids) =>
                        typeof onOpenEvidence === "function" ? onOpenEvidence(ids, `${selectedPair.sender}→${selectedPair.receiver} · evidence`) : null
                      }
                    />
                  </div>
                  <div style={{ height: 10 }} />
                  <div className="notice">
                    Click ✅ Citation to open RowId-level evidence (including raw JSON).
                  </div>
                </>
              ) : (
                <div className="notice">Click an edge (pair) in Network/Matrix first.</div>
              )}

              <div style={{ height: 12 }} />

              <div className="row split" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div className="card-title" style={{ fontSize: 13 }}>
                  Verifier-first LLM
                </div>
                <button className="btn small" type="button" onClick={() => setVerifyVerifierOpen((v) => !v)}>
                  {verifyVerifierOpen ? "Collapse" : "Expand"}
                </button>
              </div>

              <div style={{ height: 10 }} />

              {verifyVerifierOpen ? (
                <>
                  <div className={apiUrl ? "notice" : "warning"}>
                    <div style={{ fontWeight: 850, marginBottom: 6 }}>Verifier-first LLM</div>
                    <div>
                      API URL: <span className="mono">{apiUrl || "(empty) → mock mode"}</span>
                    </div>
                    {llmMeta.mock ? <div style={{ marginTop: 6 }}>Mock: {llmMeta.reason || "ON"}</div> : null}
                    <div style={{ marginTop: 6 }}>
                      Rule: claims must cite RowIds; no evidence → mark as Unverified.
                    </div>
                  </div>

                  <div style={{ height: 10 }} />

                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <span className="pill">Top rows</span>
                      <select
                        className="select"
                        style={{ width: 120 }}
                        value={String(llmTopRows)}
                        onChange={(e) => setLlmTopRows(Number(e.target.value))}
                        disabled={llmBusy}
                      >
                        <option value="12">12</option>
                        <option value="24">24</option>
                        <option value="40">40</option>
                        <option value="60">60</option>
                      </select>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {filterPatch && typeof onApplyFilterPatch === "function" ? (
                        <button className="btn small" onClick={() => onApplyFilterPatch(filterPatch)} disabled={llmBusy}>
                          Apply suggestions
                        </button>
                      ) : null}
                      <button className="btn small primary" onClick={runVerifier} disabled={llmBusy || !eventsAll?.length}>
                        {llmBusy ? "Running…" : "Run verifier"}
                      </button>
                    </div>
                  </div>

                  {llmError ? <div className="warning" style={{ marginTop: 10 }}>{llmError}</div> : null}
                  {llmBusy ? (
                    <div className="card pad anim-in" style={{ marginTop: 10 }}>
                      <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                        <div className="card-title">Verifier output</div>
                        <SmartLoader />
                      </div>
                    </div>
                  ) : null}

                  {!llmBusy && claims.length ? (
                    <div className="list" style={{ marginTop: 10 }}>
                      <h4>Claims</h4>
                      {claims.map((c) => {
                        const ids = Array.isArray(c?.evidence_row_ids) ? c.evidence_row_ids : [];
                        const ok = ids.some((x) => Number.isFinite(Number(x)) && Number(x) > 0);
                        return (
                          <div key={c.id || c.title || JSON.stringify(c)} className="item">
                            <div style={{ minWidth: 0 }}>
                              <div className="name">{c.title || c.id || "Claim"}</div>
                              <div className="meta">
                                {c.confidence ? `confidence=${c.confidence}` : "confidence=?"}
                                {!ok ? " · Unverified" : ""}
                              </div>
                            </div>
                            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {ok ? (
                                <CitationBadge
                                  rowIds={ids}
                                  onOpenEvidence={(rowIds) =>
                                    typeof onOpenEvidence === "function" ? onOpenEvidence(rowIds, c.title || c.id || "claim") : null
                                  }
                                />
                              ) : (
                                <span className="pill">Unverified</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : !llmBusy ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                      —
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
