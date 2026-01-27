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
import { useI18n } from "../lib/i18n";

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

function computeTopInsights({ events, selectionSummary, lang }) {
  const tx = (zh, en) => (String(lang) === "en" ? en : zh);
  const out = [];
  const links = selectionSummary?.links ?? [];

  // 1) Rivalries (top edges)
  for (const l of links.slice(0, 3)) {
    out.push({
      id: `rivalry:${l.source}→${l.target}`,
      kind: "rivalry",
      title: tx("头部对手关系", "Top rivalry"),
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
      title: tx("被告优势", "Defendant advantage"),
      subtitle: tx(`被告胜诉率 ≈ ${(rate * 100).toFixed(1)}%（n=${denom}）`, `DefendantWin rate ≈ ${(rate * 100).toFixed(1)}% (n=${denom})`),
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
        title: tx("案件类型异质性", "Case type heterogeneity"),
        subtitle: tx(
          `${r.caseType} · 被告胜 ${(r.rate * 100).toFixed(1)}%（n=${r.n}，Δ ${(r.delta * 100).toFixed(1)}pp）`,
          `${r.caseType} · DefWin ${(r.rate * 100).toFixed(1)}% (n=${r.n}, Δ ${(r.delta * 100).toFixed(1)}pp)`,
        ),
        filterPatch: { metaboliteQuery: r.caseType === "NA" ? "" : r.caseType, topEdges: 500 },
        rowIds: r.rowIds ?? [],
      });
    }
  }

  return out.slice(0, 5);
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
  const { lang } = useI18n();
  const tx = React.useCallback((zh, en) => (String(lang) === "en" ? en : zh), [lang]);
  const topInsights = React.useMemo(
    () => computeTopInsights({ events: Array.isArray(events) ? events : [], selectionSummary, lang }),
    [events, selectionSummary, lang],
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
        lang,
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
      if (!text) throw new Error(tx("LLM 返回为空（choices[0].message.content 缺失）", "LLM returned empty output (choices[0].message.content missing)"));
      const { think, answer } = splitThink(text);
      const structured = parseStructuredLlmAnswer(answer);
      setLlmResult({ think, ...structured });
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : tx("Verifier 运行失败", "Verifier failed"));
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
            <div className="card-title">{tx("助手", "Assistant")}</div>
            <div className="card-sub">{tx("洞察 · 律所画像 · 证据 · 验证", "Insights · Firm profile · Evidence · Verifier")}</div>
          </div>
          <button className="btn small" onClick={onClose}>
            {tx("关闭", "Close")}
          </button>
        </div>

        <div className="drawer-body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {[
              ["insights", tx("洞察", "Insights")],
              ["firm", tx("律所", "Firm")],
              ["evidence", tx("证据", "Evidence")],
              ["verifier", tx("验证", "Verifier")],
            ].map(([k, label]) => (
              <button key={k} className={`btn small ${tab === k ? "primary" : ""}`} onClick={() => (typeof onTab === "function" ? onTab(k) : null)}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ height: 10 }} />

          {tab === "insights" ? (
            <>
              <div className="details-block" style={{ marginBottom: 12 }}>
                <div className="row split" style={{ gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="card-title" style={{ fontSize: 13 }}>
                      {tx("下一步", "Next step")}
                    </div>
                    <div className="card-sub" style={{ marginTop: 4 }}>
                      {nextAction
                        ? tx(
                            `点击一次：自动高亮${nextAction.kind === "rivalry" ? "一条对手边" : "一个洞察"}，并打开 RowId 级证据。`,
                            `Click once to auto-focus ${nextAction.kind === "rivalry" ? "a rivalry edge" : "an insight"} and open RowId-level evidence.`,
                          )
                        : tx("先导入数据，或点击右上角“演示”加载前50/前100示例。", 'Import data first, or use the top-right "Story" to load the Top50/Top100 presets.')}
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
                          if (typeof onOpenEvidence === "function") onOpenEvidence(nextAction.rowIds, tx(`下一步 · ${nextAction.subtitle}`, `Next step · ${nextAction.subtitle}`));
                        }}
                      >
                        {tx("聚焦 + 证据", "Focus + Evidence")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="list">
                <h4>{tx("前 5 条洞察（可点击）", "Top 5 insights (clickable)")}</h4>
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
                          <span className="pill">{tx("无证据", "no evidence")}</span>
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
            </>
          ) : tab === "firm" ? (
            !selectedCell || !details ? (
              <div className="notice">{tx("先在网络/矩阵中点击一个律所。", "Click a firm in Network/Matrix first.")}</div>
            ) : (
              <>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <Tooltip content={selectedCell} maxWidth={560}>
                    <span className="pill td-ellipsis" style={{ maxWidth: 260 }}>
                      {selectedCell}
                    </span>
                  </Tooltip>
                  <button className="btn small" onClick={() => (typeof onApplyFocus === "function" ? onApplyFocus(selectedCell, "any") : null)}>
                    {tx("聚焦（任意）", "Focus (any)")}
                  </button>
                  <button className="btn small" onClick={() => (typeof onApplyFocus === "function" ? onApplyFocus(selectedCell, "outgoing") : null)}>
                    {tx("聚焦（发出）", "Focus (out)")}
                  </button>
                  <button className="btn small" onClick={() => (typeof onApplyFocus === "function" ? onApplyFocus(selectedCell, "incoming") : null)}>
                    {tx("聚焦（进入）", "Focus (in)")}
                  </button>
                  {focusCell === selectedCell ? (
                    <button className="btn danger small" onClick={onClearFocus}>
                      {tx("清除聚焦", "Clear focus")}
                    </button>
                  ) : null}
                  {focusCell === selectedCell ? <span className="pill">{tx("已聚焦", "focused")} ({focusMode ?? "any"})</span> : null}
                </div>

                <div className="metric">
                  <div>
                    <div className="k">{tx("总权重", "Total weight")}</div>
                    <div className="v">{fmt(details.totalWeight)}</div>
                  </div>
                  <div>
                    <div className="k">{tx("总边数", "Total edges")}</div>
                    <div className="v">{(details.inCount ?? 0) + (details.outCount ?? 0)}</div>
                  </div>
                  <div>
                    <div className="k">{tx("发出权重", "Outgoing weight")}</div>
                    <div className="v">{fmt(details.outWeight)}</div>
                  </div>
                  <div>
                    <div className="k">{tx("进入权重", "Incoming weight")}</div>
                    <div className="v">{fmt(details.inWeight)}</div>
                  </div>
                </div>

                <div className="divider" />

                <div className="list">
                  <h4>{tx("主要对手（作为原告）", "Top opponents (as plaintiff)")}</h4>
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
                            onOpenEvidence={(ids) => (typeof onOpenEvidence === "function" ? onOpenEvidence(ids, `${selectedCell}→${p.key} · evidence`) : null)}
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
                  <h4>{tx("主要对手（作为被告）", "Top opponents (as defendant)")}</h4>
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
          ) : tab === "evidence" ? (
            selectedPairEvidence ? (
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
                <div className="notice">{tx("点击 ✅ 引用 可打开 RowId 级证据（含原始 JSON）。", "Click ✅ Citation to open RowId-level evidence (including raw JSON).")}</div>
              </>
            ) : (
              <div className="notice">{tx("先在网络/矩阵中点击一条边。", "Click an edge (pair) in Network/Matrix first.")}</div>
            )
          ) : (
            <>
              <div className={apiUrl ? "notice" : "warning"}>
                <div style={{ fontWeight: 850, marginBottom: 6 }}>{tx("证据优先验证（LLM）", "Verifier-first LLM")}</div>
                <div>
                  {tx("API 地址", "API URL")}: <span className="mono">{apiUrl || tx("（空）→ 模拟模式", "(empty) → mock mode")}</span>
                </div>
                {llmMeta.mock ? <div style={{ marginTop: 6 }}>{tx("模拟", "Mock")}: {llmMeta.reason || "ON"}</div> : null}
                <div style={{ marginTop: 6 }}>
                  {tx("规则：结论必须引用 RowId；无证据 → 标注未验证。", "Rule: claims must cite RowIds; no evidence → mark as Unverified.")}
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="pill">{tx("注入行数", "Top rows")}</span>
                  <select className="select" style={{ width: 120 }} value={String(llmTopRows)} onChange={(e) => setLlmTopRows(Number(e.target.value))} disabled={llmBusy}>
                    <option value="12">12</option>
                    <option value="24">24</option>
                    <option value="40">40</option>
                    <option value="60">60</option>
                  </select>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  {filterPatch && typeof onApplyFilterPatch === "function" ? (
                    <button className="btn small" onClick={() => onApplyFilterPatch(filterPatch)} disabled={llmBusy}>
                      {tx("应用建议", "Apply suggestions")}
                    </button>
                  ) : null}
                  <button className="btn small primary" onClick={runVerifier} disabled={llmBusy || !eventsAll?.length}>
                    {llmBusy ? tx("运行中…", "Running…") : tx("运行验证", "Run verifier")}
                  </button>
                </div>
              </div>

              {llmError ? <div className="warning" style={{ marginTop: 10 }}>{llmError}</div> : null}
              {llmBusy ? (
                <div className="card pad anim-in" style={{ marginTop: 10 }}>
                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div className="card-title">{tx("验证输出", "Verifier output")}</div>
                    <SmartLoader />
                  </div>
                </div>
              ) : null}

              {!llmBusy && claims.length ? (
                <div className="list" style={{ marginTop: 10 }}>
                  <h4>{tx("结论（可追溯）", "Claims")}</h4>
                  {claims.map((c) => {
                    const ids = Array.isArray(c?.evidence_row_ids) ? c.evidence_row_ids : [];
                    const ok = ids.some((x) => Number.isFinite(Number(x)) && Number(x) > 0);
                    return (
                      <div key={c.id || c.title || JSON.stringify(c)} className="item">
                        <div style={{ minWidth: 0 }}>
                          <div className="name">{c.title || c.id || tx("结论", "Claim")}</div>
                          <div className="meta">
                            {c.confidence ? `confidence=${c.confidence}` : tx("confidence=？", "confidence=?")}
                            {!ok ? tx(" · 未验证", " · Unverified") : ""}
                          </div>
                        </div>
                        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {ok ? (
                            <CitationBadge
                              rowIds={ids}
                              onOpenEvidence={(rowIds) => (typeof onOpenEvidence === "function" ? onOpenEvidence(rowIds, c.title || c.id || "claim") : null)}
                            />
                          ) : (
                            <span className="pill">{tx("未验证", "Unverified")}</span>
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
          )}
        </div>
      </div>
    </div>
  );
}
