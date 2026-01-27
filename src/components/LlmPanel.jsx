import React from "react";
import { loadLlmConfig, resetLlmConfig, saveLlmConfig } from "../lib/llmConfig";
import { chatCompletions, extractAssistantText } from "../lib/llmClient";
import { splitThink } from "../lib/llmThink";
import { parseStructuredLlmAnswer } from "../lib/llmStructured";
import { getLlmApiUrl, isMockMode } from "../lib/llmEnv";
import SmartLoader from "./SmartLoader";
import TypewriterMarkdown from "./TypewriterMarkdown";
import { useI18n } from "../lib/i18n";

const DEFAULT_PROMPT_ZH =
  "请用中文给出一段简洁但有信息密度的分析：\n" +
  "主题：基于诉讼结果的律所排名。\n" +
  "要求：解释为什么传统声誉/规模排名可能与真实胜诉表现弱相关；用 3-6 条要点概括「把每个诉讼视作原告/被告律所的两两对抗（Bradley–Terry / AHPI 思路）」的直觉；给出 2-3 个可扩展方向（例如：按案件类型的异质性、被告优势、用 LLM 代理从判决书抽取胜负结果/元数据以扩大样本）。\n" +
  "输出：3-6 条要点 + 1 段总结（不要写公式）。";

const DEFAULT_PROMPT_EN =
  "Write a concise but information-dense analysis in English:\n" +
  "Topic: outcome-based law firm rankings.\n" +
  "Requirements: explain why reputation/size rankings can be weakly correlated with win-performance; give 3–6 bullets for the intuition behind treating each case as a plaintiff-vs-defendant pairwise game (Bradley–Terry / AHPI-style); propose 2–3 extensions (e.g., case-type heterogeneity, defendant advantage, using an LLM agent to extract outcomes/metadata from opinions to expand the sample).\n" +
  "Output: 3–6 bullets + 1 short paragraph (no formulas).";

// Staged thinking process component
function ThinkingStages({ stage, tx }) {
  // Detect theme
  const [isDark, setIsDark] = React.useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.dataset.theme === "dark";
  });

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.dataset.theme === "dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const stages = [
    { key: "parse", zh: "解析输入提示词...", en: "Parsing input prompt..." },
    { key: "context", zh: "构建上下文理解...", en: "Building context understanding..." },
    { key: "knowledge", zh: "检索相关法律知识...", en: "Retrieving legal knowledge..." },
    { key: "reason", zh: "推理分析中...", en: "Reasoning and analyzing..." },
    { key: "generate", zh: "生成响应内容...", en: "Generating response..." },
    { key: "verify", zh: "验证输出质量...", en: "Verifying output quality..." },
  ];

  // Theme colors
  const colors = {
    activeBg: isDark ? "rgba(0, 212, 255, 0.12)" : "rgba(8, 145, 178, 0.08)",
    activeBorder: isDark ? "rgba(0, 212, 255, 0.25)" : "rgba(8, 145, 178, 0.20)",
    activeText: isDark ? "#00d4ff" : "rgba(8, 145, 178, 0.96)",
    completedBg: isDark ? "rgba(0, 255, 136, 0.10)" : "rgba(16, 185, 129, 0.06)",
    completedBorder: isDark ? "rgba(0, 255, 136, 0.20)" : "rgba(16, 185, 129, 0.15)",
    completedText: isDark ? "#00ff88" : "rgba(6, 95, 70, 0.86)",
    completedBadge: isDark ? "rgba(0, 255, 136, 0.18)" : "rgba(16, 185, 129, 0.15)",
    pendingBg: isDark ? "rgba(226, 232, 240, 0.04)" : "rgba(15, 23, 42, 0.02)",
    pendingBorder: isDark ? "rgba(226, 232, 240, 0.08)" : "rgba(15, 23, 42, 0.06)",
    pendingText: isDark ? "rgba(248, 250, 252, 0.45)" : "rgba(15, 23, 42, 0.55)",
    badgePending: isDark ? "rgba(226, 232, 240, 0.08)" : "rgba(15, 23, 42, 0.06)",
    badgeActive: isDark ? "rgba(0, 212, 255, 0.18)" : "rgba(8, 145, 178, 0.15)",
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {stages.map((s, idx) => {
        const isActive = idx === stage;
        const isCompleted = idx < stage;
        const isPending = idx > stage;

        return (
          <div
            key={s.key}
            className={isActive ? "anim-in" : ""}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              borderRadius: 10,
              background: isActive
                ? colors.activeBg
                : isCompleted
                  ? colors.completedBg
                  : colors.pendingBg,
              border: isActive
                ? `1px solid ${colors.activeBorder}`
                : isCompleted
                  ? `1px solid ${colors.completedBorder}`
                  : `1px solid ${colors.pendingBorder}`,
              opacity: isPending ? 0.5 : 1,
              transition: "all 0.3s ease",
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 800,
                background: isCompleted
                  ? colors.completedBadge
                  : isActive
                    ? colors.badgeActive
                    : colors.badgePending,
                color: isCompleted
                  ? colors.completedText
                  : isActive
                    ? colors.activeText
                    : colors.pendingText,
              }}
            >
              {isCompleted ? "✓" : idx + 1}
            </div>
            <span
              style={{
                flex: 1,
                fontSize: 13,
                color: isActive
                  ? colors.activeText
                  : isCompleted
                    ? colors.completedText
                    : colors.pendingText,
                fontWeight: isActive ? 700 : 500,
              }}
            >
              {tx(s.zh, s.en)}
            </span>
            {isActive && <span className="spinner" />}
          </div>
        );
      })}
    </div>
  );
}

export default function LlmPanel() {
  const { lang, tx } = useI18n();
  const [cfg, setCfg] = React.useState(() => loadLlmConfig());
  const [prompt, setPrompt] = React.useState(() => (lang === "en" ? DEFAULT_PROMPT_EN : DEFAULT_PROMPT_ZH));
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState({ think: "", markdown: "", payload: null, raw: "" });
  const [error, setError] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [runId, setRunId] = React.useState(0);
  const [meta, setMeta] = React.useState({ mock: false, reason: "" });
  const [thinkingStage, setThinkingStage] = React.useState(0);
  const apiUrl = getLlmApiUrl();

  React.useEffect(() => {
    setPrompt((p) => {
      if (p !== DEFAULT_PROMPT_ZH && p !== DEFAULT_PROMPT_EN) return p;
      return lang === "en" ? DEFAULT_PROMPT_EN : DEFAULT_PROMPT_ZH;
    });
  }, [lang]);

  // Simulate thinking stages during busy state
  React.useEffect(() => {
    if (!busy) {
      setThinkingStage(0);
      return;
    }

    const stageDelays = [800, 1200, 1500, 2000, 1800, 1000]; // Delays for each stage
    let currentStage = 0;
    let timeoutId;

    const advanceStage = () => {
      if (currentStage < 5) {
        currentStage++;
        setThinkingStage(currentStage);
        timeoutId = setTimeout(advanceStage, stageDelays[currentStage] || 1000);
      }
    };

    timeoutId = setTimeout(advanceStage, stageDelays[0]);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
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
    setThinkingStage(0);
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
        setError(tx("分析服务暂时不可用（已自动使用 Mock 数据）。", "LLM service is unavailable (using mock data)."));
      }
      const text = extractAssistantText(resp);
      if (!text) throw new Error(tx("LLM 返回为空（choices[0].message.content 缺失）", "Empty LLM response (choices[0].message.content missing)"));
      const { think, answer } = splitThink(text);
      const structured = parseStructuredLlmAnswer(answer);
      setResult({ think, ...structured });
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("分析服务暂时不可用（已自动使用 Mock 数据）。", "LLM service is unavailable (using mock data)."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={isMockMode() ? "warning" : "notice"}>
        <div style={{ fontWeight: 850, marginBottom: 6 }}>{tx("LLM 状态", "LLM Status")}</div>
        <div>
          {tx("API 地址", "API URL")}: <span className="mono">{apiUrl || tx("（空）→ mock 模式", "(empty) → mock mode")}</span>
        </div>
        {meta.mock ? <div style={{ marginTop: 6 }}>{tx("Demo Mock", "Demo Mock")}: {meta.reason || tx("开启", "ON")}</div> : null}
      </div>

      <div className="card pad soft" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title">{tx("LLM API 配置", "LLM API config")}</div>
            <div className="card-sub">{tx("只保存 model/apiKey（URL 由 VITE_LLM_API_URL 提供）。", "Only stores model/apiKey (URL comes from VITE_LLM_API_URL).")}</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn small" onClick={save} disabled={busy}>
              {tx("保存配置", "Save")}
            </button>
            <button className="btn small" onClick={reset} disabled={busy}>
              {tx("重置", "Reset")}
            </button>
            <button className="btn small primary" onClick={run} disabled={busy}>
              <span className="row" style={{ gap: 8 }}>
                {busy ? <span className="spinner" /> : null}
                <span>{busy ? tx("计算中…", "Computing...") : tx("测试连接 / 生成示例", "Test connection / generate sample")}</span>
              </span>
            </button>
          </div>
        </div>

        <div style={{ height: 10 }} />
        <div style={{ display: "grid", gap: 10 }}>
          <div className="field">
            <div className="label">{tx("API Base URL", "API Base URL")}</div>
            <input
              className="input"
              value={apiUrl || ""}
              readOnly
              placeholder={tx("由 VITE_LLM_API_URL 提供；为空则进入 mock", "Provided by VITE_LLM_API_URL; empty enables mock mode")}
            />
          </div>
          <div className="field">
            <div className="label">{tx("Model", "Model")}</div>
            <input className="input" value={cfg.model} onChange={(e) => setCfg((p) => ({ ...p, model: e.target.value }))} />
          </div>
          <div className="field">
            <div className="row split" style={{ gap: 10 }}>
              <div className="label">{tx("API Key", "API Key")}</div>
              <button className="btn small" type="button" onClick={() => setShowKey((v) => !v)} disabled={busy}>
                {showKey ? tx("隐藏", "Hide") : tx("显示", "Show")}
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
            <div className="card-title">{tx("Prompt", "Prompt")}</div>
            <div className="card-sub">{tx("用于快速验证连通性；正式“数据注入”请在 Insights 里生成。", "For quick connectivity checks; for data-grounded prompts, use Insights.")}</div>
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
              <div className="card-title">{tx("AI 分析进行中", "AI Analysis in Progress")}</div>
              <div className="card-sub">{tx("正在为您深度分析法律数据...", "Deeply analyzing legal data for you...")}</div>
            </div>
            <SmartLoader />
          </div>
          <div style={{ height: 14 }} />
          <ThinkingStages stage={thinkingStage} tx={tx} />
          <div style={{ height: 14 }} />
          <details className="details-block pulse" open>
            <summary className="details-summary">{tx("查看推理过程", "View AI reasoning process")}</summary>
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
            <div className="card-title">{tx("LLM 输出", "LLM output")}</div>
            <button className="btn small" onClick={() => navigator.clipboard.writeText(result.markdown || "")} disabled={!result.markdown}>
              {tx("复制", "Copy")}
            </button>
          </div>
          <div style={{ height: 10 }} />
          <details className="details-block">
            <summary className="details-summary">{tx("查看推理过程", "View AI reasoning process")}</summary>
            <pre className="reasoning-pre">{result.think?.trim() ? result.think.trim() : tx("（模型未返回推理过程）", "(Model did not return a reasoning trace)")}</pre>
          </details>
          {result.markdown ? (
            <TypewriterMarkdown markdown={result.markdown} cps={90} />
          ) : (
            <div className="notice">{tx("模型未返回正文内容（仅返回了思考过程）。", "Model returned no main content (reasoning only).")}</div>
          )}
          {result.payload ? (
            <details className="details-block" style={{ marginTop: 10 }}>
              <summary className="details-summary">{tx("查看 PAYLOAD_JSON", "View PAYLOAD_JSON")}</summary>
              <pre className="details-pre">{JSON.stringify(result.payload, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
