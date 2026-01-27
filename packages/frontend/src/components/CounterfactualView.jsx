import React from "react";
import CitationBadge from "./CitationBadge";
import { useI18n } from "../lib/i18n";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function sigmoid(x) {
  const z = typeof x === "number" && Number.isFinite(x) ? x : 0;
  if (z > 50) return 1;
  if (z < -50) return 0;
  return 1 / (1 + Math.exp(-z));
}

function num(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function fmtPct(p) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

function normalizeFirm(v) {
  return String(v ?? "").trim();
}

function scoreMapFromRankings(rankings) {
  const m = new Map();
  for (const r of Array.isArray(rankings) ? rankings : []) {
    const firm = normalizeFirm(r?.Firm);
    const s = num(r?.Score);
    if (!firm || !Number.isFinite(s)) continue;
    if (!m.has(firm)) m.set(firm, s);
  }
  return m;
}

function predictDefWinProba({ defScore, plaScore, privilege = 0, valence = 0.5 }) {
  const sDef = num(defScore);
  const sPla = num(plaScore);
  if (!Number.isFinite(sDef) || !Number.isFinite(sPla)) return undefined;
  const eps = num(privilege) ?? 0;
  const q = clamp01(num(valence) ?? 0.5);
  const diff = sDef + eps - sPla;
  const probFavoured = sigmoid(diff);
  return probFavoured * q + (1 - probFavoured) * (1 - q);
}

export default function CounterfactualView({
  events,
  rankings,
  caseTypeValence,
  caseTypePrivilege,
  selectedPair,
  onSelectPair,
  onOpenEvidence,
}) {
  const { tx } = useI18n();
  const scoreByFirm = React.useMemo(() => scoreMapFromRankings(rankings), [rankings]);

  const eventsByRowId = React.useMemo(() => {
    const m = new Map();
    for (const e of Array.isArray(events) ? events : []) {
      const id = num(e?.rowId);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!m.has(id)) m.set(id, e);
    }
    return m;
  }, [events]);

  const firms = React.useMemo(() => {
    const set = new Set();
    for (const e of Array.isArray(events) ? events : []) {
      if (e?.sender) set.add(String(e.sender));
      if (e?.receiver) set.add(String(e.receiver));
    }
    const arr = [...set];
    arr.sort((a, b) => a.localeCompare(b));
    return arr;
  }, [events]);

  const [rowIdInput, setRowIdInput] = React.useState("");
  const [activeRowId, setActiveRowId] = React.useState(null);
  const [newPlaintiff, setNewPlaintiff] = React.useState("");

  React.useEffect(() => {
    if (!selectedPair?.sender || !selectedPair?.receiver) return;
    const hit =
      Array.isArray(events) && events.length
        ? [...events]
            .filter((e) => e?.sender === selectedPair.sender && e?.receiver === selectedPair.receiver)
            .sort((a, b) => (num(b?.weight) ?? 0) - (num(a?.weight) ?? 0))[0]
        : null;
    if (!hit) return;
    const rid = num(hit.rowId);
    if (!Number.isFinite(rid)) return;
    setActiveRowId(rid);
    setRowIdInput(String(rid));
    setNewPlaintiff(String(hit.sender ?? ""));
  }, [events, selectedPair?.sender, selectedPair?.receiver]);

  const activeEvent = React.useMemo(() => (activeRowId ? eventsByRowId.get(activeRowId) ?? null : null), [eventsByRowId, activeRowId]);

  const caseType = String(activeEvent?.metabolite ?? "");
  const defFirm = String(activeEvent?.receiver ?? "");
  const plaFirm = String(activeEvent?.sender ?? "");

  const q = caseType ? caseTypeValence?.get?.(caseType) : undefined;
  const eps = caseType ? caseTypePrivilege?.get?.(caseType) : undefined;

  const defScore = defFirm ? scoreByFirm.get(defFirm) : undefined;
  const plaScore = plaFirm ? scoreByFirm.get(plaFirm) : undefined;
  const newPlaScore = newPlaintiff ? scoreByFirm.get(newPlaintiff) : undefined;

  const p0 = React.useMemo(
    () => predictDefWinProba({ defScore, plaScore, privilege: eps, valence: q }),
    [defScore, plaScore, eps, q],
  );
  const p1 = React.useMemo(
    () => predictDefWinProba({ defScore, plaScore: newPlaScore, privilege: eps, valence: q }),
    [defScore, newPlaScore, eps, q],
  );
  const delta = typeof p0 === "number" && typeof p1 === "number" ? p1 - p0 : undefined;

  const runLoad = () => {
    const rid = num(rowIdInput);
    if (!Number.isFinite(rid) || rid <= 0) return;
    if (!eventsByRowId.has(rid)) return;
    setActiveRowId(rid);
    const e = eventsByRowId.get(rid);
    setNewPlaintiff(String(e?.sender ?? ""));
  };

  const hasRankings = Array.isArray(rankings) && rankings.length;

  return (
    <div className="viz-scroll">
      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title">{tx("What-if（反事实）", "What-if (Counterfactual)")}</div>
            <div className="card-sub">
              {tx(
                "选择一个 RowId（案件行）→ 更换原告律所 → 计算“被告胜诉概率”的变化。",
                "Pick a RowId (case row) → replace the plaintiff firm → see the change in predicted defendant win probability.",
              )}
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="pill">
              {tx("排名参数", "rankings")}: {hasRankings ? tx("已加载", "loaded") : tx("缺失", "missing")}
            </span>
            <span className="pill">
              {tx("案件类型参数", "case-type params")}: {caseTypeValence?.size ? tx("已加载", "loaded") : tx("缺失", "missing")}
            </span>
          </div>
        </div>

        {!hasRankings ? (
          <div className="warning" style={{ marginTop: 10 }}>
            {tx(
              "未加载 `/sample/mahari_exp_scores.csv`（或为空）：无法进行概率预测，只能展示证据/字段。",
              "Missing `/sample/mahari_exp_scores.csv` (or empty): probability prediction is disabled; only evidence/fields are available.",
            )}
          </div>
        ) : null}

        <div style={{ height: 10 }} />

        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 260 }}>
            <div className="label">RowId</div>
            <input
              className="input"
              placeholder={tx("例如：123", "e.g. 123")}
              value={rowIdInput}
              onChange={(e) => setRowIdInput(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" ? runLoad() : null)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {tx(
                "提示：先在「网络/矩阵/点图」里点一条边，会自动带入一个 RowId。",
                "Tip: click an edge in Network/Matrix/DotPlot to auto-fill a RowId.",
              )}
            </div>
          </div>
          <button className="btn" type="button" onClick={runLoad}>
            {tx("加载", "Load")}
          </button>
          {activeRowId ? (
            <CitationBadge
              rowIds={[activeRowId]}
              onOpenEvidence={(ids) =>
                typeof onOpenEvidence === "function" ? onOpenEvidence(ids, tx(`RowId ${ids[0]} · 证据`, `RowId ${ids[0]} · evidence`)) : null
              }
            />
          ) : null}
        </div>
      </div>

      {activeEvent ? (
        <div className="card pad" style={{ marginTop: 12, boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="card-title">{tx("已选择的案件行", "Selected case row")}</div>
              <div className="card-sub">
                RowId {activeRowId}
                {activeEvent?.caseId ? ` · CaseId ${activeEvent.caseId}` : ""}
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn small"
                type="button"
                onClick={() => (typeof onSelectPair === "function" ? onSelectPair({ sender: plaFirm, receiver: defFirm }) : null)}
              >
                {tx("绑定到图（edge）", "Bind to graph (edge)")}
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="metric" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <div className="k">{tx("原告", "Plaintiff")}</div>
              <div className="v" style={{ fontSize: 13 }}>
                {plaFirm || tx("—", "—")}
              </div>
            </div>
            <div>
              <div className="k">{tx("被告", "Defendant")}</div>
              <div className="v" style={{ fontSize: 13 }}>
                {defFirm || tx("—", "—")}
              </div>
            </div>
            <div>
              <div className="k">{tx("案件类型", "Case type")}</div>
              <div className="v" style={{ fontSize: 13 }}>
                {caseType || tx("—", "—")}
              </div>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 360, flex: "1 1 360px" }}>
              <div className="label">{tx("反事实：将原告替换为", "Counterfactual: replace plaintiff with")}</div>
              <input className="input" list="whatif-firms" value={newPlaintiff} onChange={(e) => setNewPlaintiff(e.target.value)} />
              <datalist id="whatif-firms">
                {firms.slice(0, 2000).map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {tx(
                  "支持输入任意律所；若该律所不在排名表中，则概率显示为“—”。",
                  "You can type any firm; if it is missing from the rankings table, probability will be shown as “—”.",
                )}
              </div>
            </div>

            <div className="card pad soft" style={{ boxShadow: "none", flex: "1 1 320px", minWidth: 320 }}>
              <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800 }}>{tx("预测：被告胜诉概率", "Predicted defendant win probability")}</div>
                <span className="pill">
                  q={typeof q === "number" ? q.toFixed(3) : "0.500"} · eps={typeof eps === "number" ? eps.toFixed(3) : "0.000"}
                </span>
              </div>
              <div style={{ height: 10 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <div className="label">{tx("原始", "Original")}</div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{fmtPct(p0)}</div>
                </div>
                <div>
                  <div className="label">{tx("反事实", "Counterfactual")}</div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{fmtPct(p1)}</div>
                </div>
                <div>
                  <div className="label">{tx("变化（百分点）", "Δ (pp)")}</div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    {typeof delta === "number" ? `${(delta * 100).toFixed(1)}pp` : tx("—", "—")}
                  </div>
                </div>
              </div>

              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                {tx(
                  "说明：使用排名表的 `Score` +（可选）案件类型参数 `ValenceProb/Privilege` 做 AHPI 风格的概率计算；用于演示级反事实直觉展示。",
                  "Note: uses rankings `Score` + optional case-type `ValenceProb/Privilege` for an AHPI-style probability; meant as a demo-grade what-if intuition.",
                )}
              </div>
            </div>
          </div>

          <details className="details-block" style={{ marginTop: 10 }}>
            <summary className="details-summary">{tx("查看原始 JSON", "View raw JSON")}</summary>
            <pre className="details-pre">{JSON.stringify(activeEvent.raw ?? {}, null, 2)}</pre>
          </details>
        </div>
      ) : (
        <div className="notice" style={{ marginTop: 12 }}>
          {tx(
            "还未选中 RowId。你可以在表格中点任意行的 `✅ Citation`，或在「网络/矩阵/点图」选中一条边后再来这里。",
            "No RowId selected yet. Click any `✅ Citation` in Table, or select an edge in Network/Matrix/DotPlot and come back.",
          )}
        </div>
      )}
    </div>
  );
}
