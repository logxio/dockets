import React from "react";
import { toMarkdown } from "../lib/intelligence";
import { downloadJson, downloadText } from "../lib/report";
import { loadLlmConfig } from "../lib/llmConfig";
import { chatCompletions, extractAssistantText } from "../lib/llmClient";
import { buildMcccDataInterpretationPrompt, buildTopRowsCsv } from "../lib/llmPrompts";
import { splitThink } from "../lib/llmThink";
import { parseStructuredLlmAnswer } from "../lib/llmStructured";
import { computeNullControl, computeRobustness } from "../lib/robustness";
import { getLlmApiUrl } from "../lib/llmEnv";
import ThinkBlock from "./ThinkBlock";
import SmartLoader from "./SmartLoader";
import MarkdownLite from "./MarkdownLite";
import TypewriterMarkdown from "./TypewriterMarkdown";

function useTheme() {
  const [theme, setTheme] = React.useState(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });
  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function Badge({ tone, children }) {
  const theme = useTheme();
  const isDark = theme === "dark";
  const style =
    tone === "warn"
      ? isDark
        ? { background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.28)", color: "rgba(252,165,165,0.96)" }
        : { background: "rgba(220,38,38,0.10)", borderColor: "rgba(220,38,38,0.26)", color: "rgba(153,27,27,0.96)" }
      : tone === "info"
        ? isDark
          ? { background: "rgba(0,212,255,0.12)", borderColor: "rgba(0,212,255,0.25)", color: "#00d4ff" }
          : { background: "rgba(8,145,178,0.08)", borderColor: "rgba(8,145,178,0.20)", color: "rgba(8,145,178,0.96)" }
        : isDark
          ? { background: "rgba(226,232,240,0.08)", borderColor: "rgba(226,232,240,0.14)", color: "rgba(248,250,252,0.82)" }
          : { background: "rgba(15,23,42,0.04)", borderColor: "rgba(15,23,42,0.14)", color: "rgba(15,23,42,0.72)" };
  return (
    <span className="pill" style={{ ...style, fontWeight: 700 }}>
      {children}
    </span>
  );
}

function KeyValueTable({ title, headers, rows }) {
  const theme = useTheme();
  const isDark = theme === "dark";
  const headerBg = isDark ? "rgba(2,6,23,0.92)" : "rgba(248,250,252,0.94)";
  const headerColor = isDark ? "rgba(248,250,252,0.82)" : "rgba(15,23,42,0.72)";
  const headerBorder = isDark ? "rgba(226,232,240,0.14)" : "rgba(15,23,42,0.10)";
  const rowEvenBg = isDark ? "rgba(30,41,59,0.45)" : "rgba(248,250,252,0.55)";
  const rowOddBg = isDark ? "transparent" : "white";
  const cellBorder = isDark ? "rgba(226,232,240,0.10)" : "rgba(15,23,42,0.06)";
  return (
    <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="row split" style={{ gap: 10 }}>
        <div className="card-title">{title}</div>
        <div className="pill">
          Top {Math.min(rows.length, 8)}
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div className="scroll scroll-table-responsive" style={{ borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: headerBg }}>
              {headers.map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 10px",
                    fontSize: 12,
                    borderBottom: `1px solid ${headerBorder}`,
                    color: headerColor,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r, idx) => (
              <tr key={idx} style={{ background: idx % 2 ? rowOddBg : rowEvenBg }}>
                {r.map((c, j) => (
                  <td
                    key={j}
                    style={{
                      padding: "8px 10px",
                      fontSize: 12,
                      borderBottom: `1px solid ${cellBorder}`,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 200,
                    }}
                    title={String(c)}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function sleep(ms) {
  const t = Number(ms);
  if (!Number.isFinite(t) || t <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, t));
}

export default function InsightsPanel({
  title,
  fileLabel,
  insights,
  onApplyRecommendations,
  events,
  eventsAll,
  filters,
  selectedPair,
  onSelectPair,
  onOpenEvidence,
  onNavigate,
}) {
  const theme = useTheme();
  const isDark = theme === "dark";

  // Theme-aware table colors
  const headerBg = isDark ? "rgba(2,6,23,0.92)" : "rgba(248,250,252,0.94)";
  const headerColor = isDark ? "rgba(248,250,252,0.82)" : "rgba(15,23,42,0.72)";
  const headerBorder = isDark ? "rgba(226,232,240,0.14)" : "rgba(15,23,42,0.10)";
  const rowEvenBg = isDark ? "rgba(30,41,59,0.45)" : "rgba(248,250,252,0.55)";
  const rowOddBg = isDark ? "transparent" : "white";
  const cellBorder = isDark ? "rgba(226,232,240,0.10)" : "rgba(15,23,42,0.06)";

  const hasInsights = !!insights;
  const safeInsights = insights ?? {
    kind: "single",
    summaryLines: [],
    qc: [],
    recommendations: {},
    top: {},
    stats: {},
  };

  const [llmBusy, setLlmBusy] = React.useState(false);
  const [llmError, setLlmError] = React.useState("");
  const [llmResult, setLlmResult] = React.useState({ think: "", markdown: "", payload: null, raw: "" });
  const [llmRunId, setLlmRunId] = React.useState(0);
  const [llmMeta, setLlmMeta] = React.useState({ mock: false, reason: "" });
  const [llmStage, setLlmStage] = React.useState(0);
  const llmStageTimer = React.useRef(null);
  const [llmTopRows, setLlmTopRows] = React.useState(20);
  const [llmSender, setLlmSender] = React.useState("");
  const [llmReceiver, setLlmReceiver] = React.useState("");

  const [llmCfg, setLlmCfg] = React.useState(() => loadLlmConfig());
  const apiUrl = getLlmApiUrl();

  const [robBusy, setRobBusy] = React.useState(false);
  const [rob, setRob] = React.useState(null);
  const [nullBusy, setNullBusy] = React.useState(false);
  const [nullRes, setNullRes] = React.useState(null);

  React.useEffect(() => {
    return () => {
      if (llmStageTimer.current) window.clearInterval(llmStageTimer.current);
    };
  }, []);

  const hasRec = safeInsights.recommendations && Object.keys(safeInsights.recommendations).length > 0;
  const md = toMarkdown(safeInsights, title || "Outcome-based law firm insights");
  const baseName = String(fileLabel || safeInsights.kind || "insights").replace(/\s+/g, "_");

  const exportMd = () => downloadText(`${baseName}.md`, md, "text/markdown;charset=utf-8");
  const exportJson = () => downloadJson(`${baseName}.json`, insights);

  const applyRec = () => {
    if (!hasRec) return;
    if (typeof onApplyRecommendations === "function") onApplyRecommendations(insights.recommendations);
  };

  const llmInputEvents = React.useMemo(() => {
    const inputEvents = Array.isArray(events) ? events : [];
    const subset = inputEvents.filter((e) => {
      if (llmSender.trim() && (e.sender ?? "") !== llmSender.trim()) return false;
      if (llmReceiver.trim() && (e.receiver ?? "") !== llmReceiver.trim()) return false;
      return true;
    });
    return subset.length ? subset : inputEvents;
  }, [events, llmSender, llmReceiver]);

  const injectedCsvPreview = React.useMemo(() => buildTopRowsCsv(llmInputEvents, llmTopRows), [llmInputEvents, llmTopRows]);

  const injectedPromptPreview = React.useMemo(
    () =>
      buildMcccDataInterpretationPrompt({
        events: llmInputEvents,
        filters: filters ?? null,
        maxRows: llmTopRows,
      }),
    [llmInputEvents, llmTopRows, filters],
  );

  const evidenceRows = React.useMemo(() => {
    const top = [...(llmInputEvents ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, llmTopRows);
    return top.map((e, idx) => ({
      idx: idx + 1,
      rowId: Number.isFinite(Number(e?.rowId)) ? Number(e.rowId) : idx + 1,
      sender: e.sender,
      receiver: e.receiver,
      caseType: e.metabolite ?? "",
      court: e.sensor ?? "",
      outcome: e.annotation ?? "",
      weight: typeof e.weight === "number" ? e.weight : "",
    }));
  }, [llmInputEvents, llmTopRows]);

  const runRobustness = async () => {
    setRobBusy(true);
    try {
      const r = computeRobustness({
        eventsAll: Array.isArray(eventsAll) ? eventsAll : [],
        baseFilters: filters ?? {},
        topK: 10,
      });
      setRob(r);
    } finally {
      setRobBusy(false);
    }
  };

  const runNull = async () => {
    setNullBusy(true);
    try {
      const r = computeNullControl({
        eventsAll: Array.isArray(eventsAll) ? eventsAll : [],
        baseFilters: filters ?? {},
        n: 60,
        seed: 42,
      });
      setNullRes(r);
    } finally {
      setNullBusy(false);
    }
  };

  const runLlm = async () => {
    const startedAt = Date.now();
    setLlmBusy(true);
    setLlmError("");
    setLlmResult({ think: "", markdown: "", payload: null, raw: "" });
    setLlmRunId((x) => x + 1);
    setLlmMeta({ mock: false, reason: "" });
    setLlmStage(0);
    try {
      if (llmStageTimer.current) window.clearInterval(llmStageTimer.current);
      llmStageTimer.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const next = Math.min(5, Math.floor(elapsed / 900));
        setLlmStage(next);
      }, 220);

      const cfg = loadLlmConfig();
      setLlmCfg(cfg);
      const prompt = injectedPromptPreview;

      const resp = await chatCompletions({
        apiKey: cfg.apiKey,
        body: {
          model: cfg.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 900,
          temperature: 0.2,
        },
      });

      // Make the demo feel "premium": enforce a minimum processing duration.
      await sleep(Math.max(0, 5200 - (Date.now() - startedAt)));

      setLlmMeta({ mock: !!resp?.mock, reason: String(resp?.mockReason ?? "") });
      if (resp?.mock && String(resp?.mockReason ?? "") && String(resp?.mockReason ?? "") !== "ENV_MISSING") {
        setLlmError("LLM service is unavailable (using mock data).");
      }
      const text = extractAssistantText(resp);
      if (!text) throw new Error("Empty LLM response (choices[0].message.content missing)");
      const { answer } = splitThink(text);
      const structured = parseStructuredLlmAnswer(answer);
      // Do not surface chain-of-thought; show a staged processing trace instead.
      setLlmResult({ think: "", ...structured });
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "LLM service is unavailable (using mock data).");
    } finally {
      if (llmStageTimer.current) window.clearInterval(llmStageTimer.current);
      setLlmBusy(false);
    }
  };

  const payloadEntities = llmResult?.payload?.entities ?? null;
  const payloadPatch = llmResult?.payload?.filterPatch ?? null;
  const payloadClaims = Array.isArray(llmResult?.payload?.claims) ? llmResult.payload.claims : [];

  const navigate = (nextView) => {
    if (typeof onNavigate === "function" && nextView) onNavigate(nextView);
  };

  const applyPatch = (patch) => {
    if (!patch || typeof patch !== "object") return;
    if (typeof onApplyRecommendations === "function") onApplyRecommendations(patch);
  };

  const normalizeArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);

  const mdEntities = React.useMemo(() => {
    const out = [];
    const mets = normalizeArray(payloadEntities?.metabolites);
    for (const m of mets) out.push({ kind: "metabolite", value: m });
    const cells = [...normalizeArray(payloadEntities?.senders), ...normalizeArray(payloadEntities?.receivers)];
    for (const c of cells) out.push({ kind: "cell", value: c });
    return out;
  }, [payloadEntities]);

  const onEntityClick = (kind, value) => {
    if (kind === "metabolite") {
      applyPatch({ metaboliteQuery: value });
      navigate("table");
      return;
    }
    if (kind === "cell") {
      applyPatch({ focusCell: value, focusMode: "any" });
      navigate("network");
    }
  };

  const isSelectedEvidence = (r) => selectedPair?.sender === r.sender && selectedPair?.receiver === r.receiver;

  const claimConfidenceTone = (c) => {
    const v = typeof c?.confidence === "string" ? c.confidence.toLowerCase() : "";
    if (v === "high") return { bg: "rgba(16,185,129,0.10)", bd: "rgba(16,185,129,0.22)", fg: "rgba(6,95,70,0.96)" };
    if (v === "low") return { bg: "rgba(220,38,38,0.10)", bd: "rgba(220,38,38,0.22)", fg: "rgba(153,27,27,0.96)" };
    return { bg: "rgba(8,145,178,0.08)", bd: "rgba(8,145,178,0.22)", fg: "rgba(8,145,178,0.96)" };
  };

  const selectEvidenceRowId = (rowId) => {
    const n = Number(rowId);
    if (!Number.isFinite(n) || n < 1) return;
    const r = evidenceRows.find((x) => x.rowId === n);
    if (!r) return;
    if (typeof onSelectPair === "function") onSelectPair({ sender: r.sender, receiver: r.receiver });
    if (typeof onOpenEvidence === "function")
      onOpenEvidence([n], `RowId ${n} · ${r.sender}→${r.receiver} · evidence`);
    navigate("table");
  };

  if (!hasInsights)
    return <div className="notice">Import data and finish filtering to generate auto-summary/QC.</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="row split" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="pill">{insights.kind === "compare" ? "Compare insights" : "Single insights"}</span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {hasRec ? (
            <button
              className="btn small primary"
              onClick={applyRec}
              title="Apply recommendations to the left filters (and write into URL)"
            >
              Apply recommendations
            </button>
          ) : null}
          <button className="btn small" onClick={exportMd}>
            Export summary (MD)
          </button>
          <button className="btn small" onClick={exportJson}>
            Export JSON
          </button>
        </div>
      </div>

      {Array.isArray(events) && events.length ? (
        <div className="card pad soft" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="card-title">LLM interpretation (grounded in current filters)</div>
              <div className="card-sub">
                Injects the Top-N filtered rows (CSV) into the prompt to avoid generic summaries.
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn small primary" disabled={llmBusy} onClick={runLlm}>
                <span className="row" style={{ gap: 8 }}>
                  {llmBusy ? <span className="spinner" /> : null}
                  <span>{llmBusy ? "Computing..." : "Generate insights (LLM)"}</span>
                </span>
              </button>
              <button className="btn small" disabled={llmBusy} onClick={() => setLlmCfg(loadLlmConfig())}>
                Reload config
              </button>
              <button
                className="btn small"
                disabled={!llmResult.markdown}
                onClick={() => navigator.clipboard.writeText(llmResult.markdown || "")}
              >
                Copy
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="pill">model: {llmCfg.model}</span>
            <span className="pill">api: {apiUrl || "mock"}</span>
            {llmMeta.mock ? <span className="pill" style={{ fontWeight: 800 }}>DEMO MOCK{llmMeta.reason ? ` · ${llmMeta.reason}` : ""}</span> : null}
            <span className="pill">{`Injected ${llmTopRows} rows (CSV)`}</span>
            {llmSender.trim() ? <span className="pill">sender={llmSender.trim()}</span> : null}
            {llmReceiver.trim() ? <span className="pill">receiver={llmReceiver.trim()}</span> : null}
          </div>

          <div style={{ height: 10 }} />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="field" style={{ minWidth: 160 }}>
              <div className="label">Top rows</div>
              <select className="select" value={String(llmTopRows)} onChange={(e) => setLlmTopRows(Number(e.target.value))} disabled={llmBusy}>
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="40">40</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <div className="label">Plaintiff (optional)</div>
              <input
                className="input"
                value={llmSender}
                onChange={(e) => setLlmSender(e.target.value)}
                placeholder="e.g. Skadden"
                disabled={llmBusy}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <div className="label">Defendant (optional)</div>
              <input
                className="input"
                value={llmReceiver}
                onChange={(e) => setLlmReceiver(e.target.value)}
                placeholder="e.g. Wachtell"
                disabled={llmBusy}
              />
            </div>
          </div>

          <div style={{ height: 10 }} />
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn small" type="button" disabled={llmBusy} onClick={() => navigator.clipboard.writeText(injectedCsvPreview)}>
              Copy injected CSV
            </button>
            <button className="btn small" type="button" disabled={llmBusy} onClick={() => navigator.clipboard.writeText(injectedPromptPreview)}>
              Copy prompt
            </button>
          </div>

          <div style={{ height: 10 }} />
          <details className="details-block">
            <summary className="details-summary">View injected CSV (Top rows)</summary>
            <pre className="details-pre">{injectedCsvPreview}</pre>
          </details>
          <details className="details-block">
            <summary className="details-summary">View full prompt</summary>
            <pre className="details-pre">{injectedPromptPreview}</pre>
          </details>

          {llmError ? (
            <div className="warning" style={{ marginTop: 10 }}>
              {llmError}
            </div>
          ) : null}

          {llmBusy ? (
            <div key={`busy-${llmRunId}`} className="anim-in" style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
                <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                  <div className="card-title">LLM output</div>
                  <SmartLoader />
                </div>
                <div className="viz-note" style={{ marginTop: 8 }}>
                  Processing a complex query: evidence sampling → entity normalization → robustness cues → synthesis → evidence binding.
                </div>
              </div>

              <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
                <div className="row split" style={{ gap: 10 }}>
                  <div className="card-title">Processing trace</div>
                  <span className="pill">High-signal path</span>
                </div>
                <div style={{ height: 10 }} />
                {[
                  "Sampling evidence rows (top-weight + coverage)",
                  "Normalizing entities (firms / case type / court)",
                  "Aggregating statistics & bias checks",
                  "Drafting verifiable claims",
                  "Binding RowId evidence to claims",
                  "Packaging deliverable report",
                ].map((label, idx) => (
                  <div key={label} className="row" style={{ gap: 10, justifyContent: "space-between", marginTop: idx ? 8 : 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className={`pill ${llmStage >= idx ? "success" : ""}`}>{llmStage >= idx ? "✓" : "·"}</span>
                      <span style={{ fontSize: 13, fontWeight: llmStage >= idx ? 800 : 600, color: isDark ? "rgba(248,250,252,0.86)" : "rgba(15,23,42,0.86)" }}>
                        {label}
                      </span>
                    </div>
                    {idx === 0 ? (
                      <span className="pill">
                        Injected {llmTopRows}
                      </span>
                    ) : null}
                  </div>
                ))}
                <div className="viz-note" style={{ marginTop: 10 }}>
                  This report is evidence-forward. Keep exploring the graph; we’ll finish generation in the background.
                </div>
              </div>

              <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
                <div className="skeleton-line" style={{ width: "92%" }} />
                <div style={{ height: 10 }} />
                <div className="skeleton-line" style={{ width: "85%" }} />
                <div style={{ height: 10 }} />
                <div className="skeleton-line" style={{ width: "78%" }} />
              </div>
            </div>
          ) : llmResult.think || llmResult.markdown ? (
            <div key={`res-${llmRunId}`} className="anim-in" style={{ marginTop: 10 }}>
              <ThinkBlock think={llmResult.think} />

              <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="card-title">{"Robustness & negative control"}</div>
                    <div className="card-sub">
                      For review: stability across parameter variants + a randomized null control.
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button className="btn small" disabled={robBusy} onClick={runRobustness} type="button">
                      <span className="row" style={{ gap: 8 }}>
                        {robBusy ? <span className="spinner" /> : null}
                        <span>{robBusy ? "Computing..." : "Compute robustness"}</span>
                      </span>
                    </button>
                    <button className="btn small" disabled={nullBusy} onClick={runNull} type="button">
                      <span className="row" style={{ gap: 8 }}>
                        {nullBusy ? <span className="spinner" /> : null}
                        <span>{nullBusy ? "Computing..." : "Run null control"}</span>
                      </span>
                    </button>
                  </div>
                </div>

                {rob ? (
                  <div className="anim-in" style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {rob.warnings?.length ? (
                      <div className="warning">
                        <div style={{ fontWeight: 850, marginBottom: 6 }}>Robustness warnings</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {rob.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="notice">
                        Robustness: no obvious instability detected (still review with raw data and domain knowledge).
                      </div>
                    )}

                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <span className="pill">variants: {rob.variants}</span>
                      <span className="pill">TopK: {rob.topK}</span>
                    </div>

                    <div className="insights-grid-2">
                      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
                        <div className="card-title">Baseline: Top pairs stability</div>
                        <div style={{ height: 10 }} />
                        <div className="scroll scroll-table-responsive" style={{ borderRadius: 12 }}>
                          <table style={{ borderCollapse: "collapse", width: "100%" }}>
                            <thead>
                              <tr style={{ background: headerBg }}>
                                {["Plaintiff", "Defendant", "Support", "avgRank"].map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      textAlign: "left",
                                      padding: "10px 10px",
                                      fontSize: 12,
                                      borderBottom: `1px solid ${headerBorder}`,
                                      color: headerColor,
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rob.stability.pairs.slice(0, 10).map((p, idx) => (
                                <tr
                                  key={`${p.sender}\t${p.receiver}`}
                                  style={{ background: idx % 2 ? rowOddBg : rowEvenBg, cursor: "pointer" }}
                                  title="Click: go to Table and bind to the graph"
                                  onClick={() => {
                                    if (typeof onSelectPair === "function") onSelectPair({ sender: p.sender, receiver: p.receiver });
                                    navigate("table");
                                  }}
                                >
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                                    {p.sender}
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                                    {p.receiver}
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                                    {(p.support * 100).toFixed(0)}%
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                                    {Number.isFinite(p.avgRank) ? p.avgRank.toFixed(1) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
                        <div className="card-title">Baseline: Top case types stability</div>
                        <div style={{ height: 10 }} />
                        <div className="scroll scroll-table-responsive" style={{ borderRadius: 12 }}>
                          <table style={{ borderCollapse: "collapse", width: "100%" }}>
                            <thead>
                              <tr style={{ background: headerBg }}>
                                {["Case type", "Support", "avgRank"].map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      textAlign: "left",
                                      padding: "10px 10px",
                                      fontSize: 12,
                                      borderBottom: `1px solid ${headerBorder}`,
                                      color: headerColor,
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rob.stability.metabolites.slice(0, 10).map((m, idx) => (
                                <tr
                                  key={m.metabolite}
                                  style={{ background: idx % 2 ? rowOddBg : rowEvenBg, cursor: "pointer" }}
                                  title="Click: filter by this case type and go to Table"
                                  onClick={() => {
                                    applyPatch({ metaboliteQuery: m.metabolite });
                                    navigate("table");
                                  }}
                                >
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                                    {m.metabolite}
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                                    {(m.support * 100).toFixed(0)}%
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                                    {Number.isFinite(m.avgRank) ? m.avgRank.toFixed(1) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {nullRes ? (
                  <div className="anim-in" style={{ marginTop: 10 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <span className="pill">
                        null n={nullRes.n}
                      </span>
                      <span className="pill">metric={nullRes.metric}</span>
                      <span className="pill">obs={nullRes.observed.toFixed(4)}</span>
                      <span className="pill">mean={nullRes.mean.toFixed(4)}</span>
                      <span className="pill">sd={nullRes.sd.toFixed(4)}</span>
                      <span className="pill">p≈{nullRes.pValue.toFixed(3)}</span>
                    </div>
                    <div className={nullRes.pValue < 0.05 ? "notice" : "warning"} style={{ marginTop: 10 }}>
                      {nullRes.pValue < 0.05
                        ? "Null control: the observed concentration is significantly higher than random (supports a non-random structure)."
                        : "Null control: the observed concentration is not significantly higher than random (be cautious: filters may be too strict / sample too small / structure unstable)."}
                      <div style={{ marginTop: 6 }} className="subtle">
                        {nullRes.note}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {payloadClaims.length ? (
                <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div className="card-title">Claims (review-traceable)</div>
                      <div className="card-sub">
                        Each claim is bound to evidence_row_ids; click an evidence RowId to jump to Table and highlight the corresponding edge.
                      </div>
                    </div>
                    <div className="pill">
                      {payloadClaims.length} claims
                    </div>
                  </div>
                  <div style={{ height: 10 }} />
                  <div style={{ display: "grid", gap: 10 }}>
                    {payloadClaims.slice(0, 8).map((c, idx) => {
                      const tone = claimConfidenceTone(c);
                      const ids = Array.isArray(c?.evidence_row_ids) ? c.evidence_row_ids : [];
                      const title = (typeof c?.title === "string" && c.title.trim()) || `Claim ${idx + 1}`;
                      return (
                        <div
                          key={c?.id || idx}
                          style={{
                            border: `1px solid ${isDark ? "rgba(226,232,240,0.14)" : "rgba(15,23,42,0.12)"}`,
                            borderRadius: 14,
                            padding: "10px 12px",
                            background: isDark ? "rgba(30,41,59,0.55)" : "rgba(255,255,255,0.78)",
                          }}
                        >
                          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                              <span
                                className="pill"
                                style={{ background: tone.bg, borderColor: tone.bd, color: tone.fg, fontWeight: 800 }}
                                title="Reviewer note: confidence is not claim strength; it reflects robustness under the current filters/definitions."
                              >
                                {String(c?.confidence || "medium").toUpperCase()}
                              </span>
                              <div style={{ fontWeight: 850 }}>{title}</div>
                            </div>
                            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                              {(ids ?? []).slice(0, 10).map((rid) => (
                                <button
                                  key={`${c?.id || idx}-rid-${rid}`}
                                  type="button"
                                  className="chip"
                                  onClick={() => selectEvidenceRowId(rid)}
                                  title="Click: go to Table and highlight the plaintiff→defendant for this RowId"
                                >
                                  RowId {rid}
                                </button>
                              ))}
                            </div>
                          </div>
                          {typeof c?.statement_md === "string" && c.statement_md.trim() ? (
                            <div style={{ marginTop: 8 }}>
                              <MarkdownLite markdown={c.statement_md.trim()} entities={mdEntities} onEntityClick={onEntityClick} />
                            </div>
                          ) : null}
                          {Array.isArray(c?.caveats) && c.caveats.length ? (
                            <div className="notice" style={{ marginTop: 8 }}>
                              <div style={{ fontWeight: 800, marginBottom: 6 }}>Caveats</div>
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {c.caveats.slice(0, 6).map((x, j) => (
                                  <li key={j}>{String(x)}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {payloadEntities ? (
                <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div className="card-title">Key entities (clickable)</div>
                      <div className="card-sub">
                        Click to write filters back to the left panel (and into URL).
                      </div>
                    </div>
                    {payloadPatch && typeof payloadPatch === "object" ? (
                      <button className="btn small primary" onClick={() => applyPatch(payloadPatch)}>
                        Apply LLM suggested filters
                      </button>
                    ) : null}
                  </div>
                  <div style={{ height: 10 }} />

                  <div className="chips">
                    {normalizeArray(payloadEntities.metabolites).length ? (
                      normalizeArray(payloadEntities.metabolites).map((m) => (
                        <button
                          key={`met-${m}`}
                          className="chip"
                          onClick={() => {
                            applyPatch({ metaboliteQuery: m });
                            navigate("table");
                          }}
                          type="button"
                        >
                          case type: {m}
                        </button>
                      ))
                    ) : (
                      <span className="chip muted">no case types</span>
                    )}

                    {normalizeArray(payloadEntities.senders).map((c) => (
                      <button
                        key={`s-${c}`}
                        className="chip"
                        onClick={() => {
                          applyPatch({ focusCell: c, focusMode: "outgoing" });
                          navigate("network");
                        }}
                        type="button"
                      >
                        plaintiff: {c}
                      </button>
                    ))}
                    {normalizeArray(payloadEntities.receivers).map((c) => (
                      <button
                        key={`r-${c}`}
                        className="chip"
                        onClick={() => {
                          applyPatch({ focusCell: c, focusMode: "incoming" });
                          navigate("network");
                        }}
                        type="button"
                      >
                        defendant: {c}
                      </button>
                    ))}
                    {(Array.isArray(payloadEntities.pairs) ? payloadEntities.pairs : []).slice(0, 6).map((p, idx) => {
                      const s = typeof p?.sender === "string" ? p.sender.trim() : "";
                      const r = typeof p?.receiver === "string" ? p.receiver.trim() : "";
                      if (!s || !r) return null;
                      return (
                        <button
                          key={`p-${idx}-${s}-${r}`}
                          className="chip"
                          onClick={() => {
                            if (typeof onSelectPair === "function") onSelectPair({ sender: s, receiver: r });
                            navigate("network");
                          }}
                          type="button"
                          title="Click: select this edge and go to Network (also binds highlights in Matrix/DotPlot/Table)"
                        >
                          pair: {s} → {r}
                        </button>
                      );
                    })}
                  </div>

                  <details className="details-block" style={{ marginTop: 10 }}>
                    <summary className="details-summary">View PAYLOAD_JSON</summary>
                    <pre className="details-pre">{JSON.stringify(llmResult.payload, null, 2)}</pre>
                  </details>
                </div>
              ) : null}

              {evidenceRows.length ? (
                <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div className="card-title">Evidence (Injected top rows)</div>
                      <div className="card-sub">
                        Click a row to jump to Table and highlight the plaintiff→defendant; use the right buttons to bind to the graph.
                      </div>
                    </div>
                    <div className="pill">
                      rows: {evidenceRows.length}
                    </div>
                  </div>
                  <div style={{ height: 10 }} />
                  <div className="scroll scroll-table-responsive" style={{ borderRadius: 12 }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr style={{ background: headerBg }}>
                          {[
                            "RowId",
                            "Plaintiff",
                            "Defendant",
                            "Case type",
                            "Court",
                            "Outcome",
                            "Weight",
                            "Bind",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                textAlign: "left",
                                padding: "10px 10px",
                                fontSize: 12,
                                borderBottom: `1px solid ${headerBorder}`,
                                color: headerColor,
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {evidenceRows.map((r) => (
                          <tr
                            key={`${r.rowId}-${r.sender}-${r.receiver}-${r.caseType}`}
                            className={isSelectedEvidence(r) ? "row-pair-hl" : ""}
                            style={{
                              background: r.idx % 2 ? rowOddBg : rowEvenBg,
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              if (typeof onSelectPair === "function") onSelectPair({ sender: r.sender, receiver: r.receiver });
                              navigate("table");
                            }}
                            title="Click to go to Table and highlight"
                          >
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                              {r.rowId}
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                              {r.sender}
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                              {r.receiver}
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                              <button
                                type="button"
                                className="chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyPatch({ metaboliteQuery: r.caseType });
                                  navigate("table");
                                }}
                                title="Click: filter by this case type and go to Table"
                              >
                                {r.caseType || "NA"}
                              </button>
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                              <button
                                type="button"
                                className="chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyPatch({ sensorQuery: r.court });
                                  navigate("table");
                                }}
                                title="Click: filter by this court and go to Table"
                              >
                                {r.court || "NA"}
                              </button>
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                              <button
                                type="button"
                                className="chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyPatch({ annotationQuery: r.outcome });
                                  navigate("table");
                                }}
                                title="Click: filter by this outcome and go to Table"
                              >
                                {r.outcome || "NA"}
                              </button>
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                              {typeof r.weight === "number" ? r.weight.toFixed(3) : r.weight}
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                                {["network", "matrix", "dotplot"].map((v) => (
                                  <button
                                    key={v}
                                    type="button"
                                    className="btn small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (typeof onSelectPair === "function") onSelectPair({ sender: r.sender, receiver: r.receiver });
                                      navigate(v);
                                    }}
                                  >
                                    {v === "network" ? "Network" : v === "matrix" ? "Matrix" : "Dot plot"}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {llmResult.markdown ? (
                <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                  <div className="card-title">LLM report</div>
                  <div style={{ height: 10 }} />
                  <TypewriterMarkdown markdown={llmResult.markdown} cps={45} entities={mdEntities} onEntityClick={onEntityClick} />
                </div>
              ) : (
                <div className="notice">Model returned no main content.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="card-title">{title || "Summary"}</div>
        <div style={{ height: 10 }} />
        <ul style={{ margin: 0, paddingLeft: 18, color: isDark ? "rgba(248,250,252,0.82)" : "rgba(15,23,42,0.82)", fontSize: 13 }}>
          {(insights.summaryLines ?? []).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>

      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split">
          <div className="card-title">QC (explainable checks)</div>
          <div className="pill">{insights.qc?.length ? `${insights.qc.length} ${"items"}` : `0 ${"item"}`}</div>
        </div>
        <div style={{ height: 10 }} />
        {insights.qc?.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {insights.qc.map((q, idx) => (
              <div key={`${q.title}-${idx}`} className={q.level === "warn" ? "warning" : "notice"}>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <Badge tone={q.level}>{q.level.toUpperCase()}</Badge>
                  <div style={{ fontWeight: 800 }}>{q.title}</div>
                </div>
                <div style={{ marginTop: 6 }}>{q.detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="notice">No obvious anomalies (still review with raw data and domain knowledge).</div>
        )}
      </div>

      {hasRec ? (
        <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ flexWrap: "wrap", gap: 10 }}>
            <div>
              <div className="card-title">Recommendations</div>
              <div className="card-sub">
                Can be applied to the left filters to reduce scale and improve robustness.
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small primary" onClick={applyRec}>
                Apply
              </button>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <pre style={{ margin: 0, fontSize: 12, color: headerColor, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(insights.recommendations, null, 2)}
          </pre>
        </div>
      ) : null}

      {insights.kind === "single" ? (
        <div className="insights-grid-2">
          <KeyValueTable
            title="Top plaintiff firms"
            headers={["Firm", "outWeight", "outCount"]}
            rows={(insights.top?.topSenders ?? []).map((r) => [r.id, r.outWeight.toFixed(2), String(r.outCount)])}
          />
          <KeyValueTable
            title="Top defendant firms"
            headers={["Firm", "inWeight", "inCount"]}
            rows={(insights.top?.topReceivers ?? []).map((r) => [r.id, r.inWeight.toFixed(2), String(r.inCount)])}
          />
          <KeyValueTable
            title="Top case types"
            headers={["Case type", "weight", "count"]}
            rows={(insights.top?.topMet ?? []).map((r) => [r.key, r.weight.toFixed(2), String(r.count)])}
          />
          <KeyValueTable
            title="Top courts"
            headers={["Court", "weight", "count"]}
            rows={(insights.top?.topSens ?? []).map((r) => [r.key, r.weight.toFixed(2), String(r.count)])}
          />
          <div className="insights-full-row">
            <KeyValueTable
              title="Top edges (aggregated)"
              headers={["Plaintiff", "Defendant", "weight", "count"]}
              rows={(insights.top?.topEdges ?? []).map((r) => [r.sender, r.receiver, r.weight.toFixed(2), String(r.count)])}
            />
          </div>
        </div>
      ) : (
        <div className="insights-grid-2">
          <KeyValueTable
            title="Top increased (B-A)"
            headers={["Plaintiff", "Defendant", "Δ"]}
            rows={(insights.top?.topUp ?? []).map((r) => [r.sender, r.receiver, r.delta.toFixed(2)])}
          />
          <KeyValueTable
            title="Top decreased (B-A)"
            headers={["Plaintiff", "Defendant", "Δ"]}
            rows={(insights.top?.topDown ?? []).map((r) => [r.sender, r.receiver, r.delta.toFixed(2)])}
          />
          <KeyValueTable
            title="By outcome (Δ)"
            headers={["Outcome", "A", "B", "Δ(B-A)"]}
            rows={(insights.top?.annDiffRows ?? []).map((r) => [r.key, r.weightA.toFixed(2), r.weightB.toFixed(2), r.delta.toFixed(2)])}
          />
        </div>
      )}
    </div>
  );
}
