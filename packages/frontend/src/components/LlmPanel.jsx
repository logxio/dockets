import React from "react";
import { loadLlmConfig, resetLlmConfig, saveLlmConfig } from "../lib/llmConfig";
import { chatCompletions, extractAssistantText } from "../lib/llmClient";
import { splitThink } from "../lib/llmThink";
import { parseStructuredLlmAnswer } from "../lib/llmStructured";
import { getLlmApiUrl, isMockMode } from "../lib/llmEnv";
import SmartLoader from "./SmartLoader";
import TypewriterMarkdown from "./TypewriterMarkdown";

const DEFAULT_PROMPT =
  "Write a concise but information-dense analysis in English:\n" +
  "Topic: outcome-based law firm rankings.\n" +
  "Requirements: explain why reputation/size rankings can be weakly correlated with win-performance; give 3–6 bullets for the intuition behind treating each case as a plaintiff-vs-defendant pairwise game (Bradley–Terry / AHPI-style); propose 2–3 extensions (e.g., case-type heterogeneity, defendant advantage, using an LLM agent to extract outcomes/metadata from opinions to expand the sample).\n" +
  "Output: 3–6 bullets + 1 short paragraph (no formulas).";

const THINKING_STAGES = [
  { key: "ingest", label: "Reading input" },
  { key: "extract", label: "Extracting key points" },
  { key: "draft", label: "Drafting recommendations" },
  { key: "polish", label: "Polishing & checking" },
];

const ThinkingStages = React.memo(function ThinkingStages({ stage }) {
  return (
    <div className="thinking-stages" aria-label="Analysis progress">
      {THINKING_STAGES.map((s, idx) => {
        const cls = idx === stage ? "active" : idx < stage ? "done" : "pending";
        return (
          <div key={s.key} className={`thinking-stage ${cls}`}>
            <div className="thinking-dot">{idx < stage ? "✓" : idx + 1}</div>
            <div className="thinking-text">{s.label}</div>
            {idx === stage ? <span className="spinner" /> : null}
          </div>
        );
      })}
    </div>
  );
});

export default function LlmPanel() {
  const [cfg, setCfg] = React.useState(() => loadLlmConfig());
  const [prompt, setPrompt] = React.useState(() => DEFAULT_PROMPT);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState({ think: "", markdown: "", payload: null, raw: "" });
  const [error, setError] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [runId, setRunId] = React.useState(0);
  const [meta, setMeta] = React.useState({ mock: false, reason: "" });
  const [thinkingStage, setThinkingStage] = React.useState(0);
  const apiUrl = getLlmApiUrl();

  React.useEffect(() => {
    if (!busy) {
      setThinkingStage(0);
      return;
    }
    const delays = [600, 900, 1100, 1200];
    let current = 0;
    let timeoutId;
    const advance = () => {
      current = Math.min(THINKING_STAGES.length - 1, current + 1);
      setThinkingStage(current);
      if (current < THINKING_STAGES.length - 1) {
        timeoutId = window.setTimeout(advance, delays[current] || 900);
      }
    };
    timeoutId = window.setTimeout(advance, delays[0]);
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [busy]);

  const save = () => {
    saveLlmConfig(cfg);
    setError("");
  };

  const reset = () => {
    resetLlmConfig();
    const next = loadLlmConfig();
    setCfg(next);
    setError("");
    setResult({ think: "", markdown: "", payload: null, raw: "" });
  };

  const run = async () => {
    setBusy(true);
    setError("");
    setResult({ think: "", markdown: "", payload: null, raw: "" });
    setRunId((x) => x + 1);
    setMeta({ mock: false, reason: "" });
    try {
      saveLlmConfig(cfg);
      const resp = await chatCompletions({
        apiKey: cfg.apiKey,
        body: {
          model: cfg.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.3,
        },
      });
      setMeta({ mock: !!resp?.mock, reason: String(resp?.mockReason ?? "") });
      if (resp?.mock && String(resp?.mockReason ?? "") && String(resp?.mockReason ?? "") !== "ENV_MISSING") {
        setError("LLM service is unavailable (using mock data).");
      }
      const text = extractAssistantText(resp);
      if (!text) throw new Error("Empty LLM response (choices[0].message.content missing)");
      const { think, answer } = splitThink(text);
      const structured = parseStructuredLlmAnswer(answer);
      setResult({ think, ...structured });
    } catch (e) {
      setError(e instanceof Error ? e.message : "LLM service is unavailable (using mock data).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={isMockMode() ? "warning" : "notice"}>
        <div style={{ fontWeight: 850, marginBottom: 6 }}>LLM Status</div>
        <div>
          API URL: <span className="mono">{apiUrl || "(empty) → mock mode"}</span>
        </div>
        {meta.mock ? <div style={{ marginTop: 6 }}>Demo Mock: {meta.reason || "ON"}</div> : null}
      </div>

      <div className="card pad soft" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title">LLM API config</div>
            <div className="card-sub">Only stores model/apiKey (URL comes from VITE_LLM_API_URL).</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn small" onClick={save} disabled={busy}>
              Save
            </button>
            <button className="btn small" onClick={reset} disabled={busy}>
              Reset
            </button>
            <button className="btn small primary" onClick={run} disabled={busy}>
              <span className="row" style={{ gap: 8 }}>
                {busy ? <span className="spinner" /> : null}
                <span>{busy ? "Computing..." : "Test connection / generate sample"}</span>
              </span>
            </button>
          </div>
        </div>

        <div style={{ height: 10 }} />
        <div style={{ display: "grid", gap: 10 }}>
          <div className="field">
            <div className="label">API Base URL</div>
            <input
              className="input"
              value={apiUrl || ""}
              readOnly
              placeholder="Provided by VITE_LLM_API_URL; empty enables mock mode"
            />
          </div>
          <div className="field">
            <div className="label">Model</div>
            <input className="input" value={cfg.model} onChange={(e) => setCfg((p) => ({ ...p, model: e.target.value }))} />
          </div>
          <div className="field">
            <div className="row split" style={{ gap: 10 }}>
              <div className="label">API Key</div>
              <button className="btn small" type="button" onClick={() => setShowKey((v) => !v)} disabled={busy}>
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <input
              className="input"
              type={showKey ? "text" : "password"}
              value={cfg.apiKey}
              onChange={(e) => setCfg((p) => ({ ...p, apiKey: e.target.value }))}
              placeholder="sk-..."
            />
          </div>
        </div>
      </div>

      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title">Prompt</div>
            <div className="card-sub">For quick connectivity checks; for data-grounded prompts, use Insights.</div>
          </div>
          <span className="pill">max_tokens=500 · temp=0.3</span>
        </div>
        <div style={{ height: 10 }} />
        <textarea
          className="input"
          style={{ minHeight: 160 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      {error ? <div className="warning">{error}</div> : null}

      {busy ? (
        <div key={`busy-${runId}`} className="card pad anim-in" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="card-title">AI Analysis in Progress</div>
              <div className="card-sub">No action needed: generating a copy-ready summary and recommendation.</div>
            </div>
            <SmartLoader />
          </div>
          <div style={{ height: 14 }} />
          <ThinkingStages stage={thinkingStage} />
          <div style={{ height: 14 }} />
          <details className="details-block pulse" open>
            <summary className="details-summary">View AI reasoning process</summary>
            <div className="reasoning-pre" aria-hidden="true">
              <div className="skeleton-line" style={{ width: "86%" }} />
              <div className="skeleton-line" style={{ width: "72%" }} />
              <div className="skeleton-line" style={{ width: "80%" }} />
            </div>
          </details>
        </div>
      ) : result.markdown || result.think ? (
        <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="card-title">LLM output</div>
            <button className="btn small" onClick={() => navigator.clipboard.writeText(result.markdown || "")} disabled={!result.markdown}>
              Copy
            </button>
          </div>
          <div style={{ height: 10 }} />
          <details className="details-block">
            <summary className="details-summary">View AI reasoning process</summary>
            <pre className="reasoning-pre">{result.think?.trim() ? result.think.trim() : "(Model did not return a reasoning trace)"}</pre>
          </details>
          {result.markdown ? (
            <TypewriterMarkdown markdown={result.markdown} cps={90} />
          ) : (
            <div className="notice">Model returned no main content (reasoning only).</div>
          )}
          {result.payload ? (
            <details className="details-block" style={{ marginTop: 10 }}>
              <summary className="details-summary">View PAYLOAD_JSON</summary>
              <pre className="details-pre">{JSON.stringify(result.payload, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
