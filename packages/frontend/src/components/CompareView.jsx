import React from "react";
import { aggregatePairs, buildDeltaMatrix, computeCategoryDiff, computePairDiff } from "../lib/compare";
import { buildCompareInsights } from "../lib/intelligence";
import DeltaMatrixView from "./DeltaMatrixView";
import DeltaTableView from "./DeltaTableView";
import DeltaNetworkView from "./DeltaNetworkView";
import InsightsPanel from "./InsightsPanel";
import { useI18n } from "../lib/i18n";

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

function fmt(n, d = 2) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n.toFixed(d);
}

function SmallTable({ title, rows }) {
  const { tx } = useI18n();
  const theme = useTheme();
  const isDark = theme === "dark";
  const headerBg = isDark ? "rgba(2,6,23,0.92)" : "rgba(248,250,252,0.94)";
  const headerColor = isDark ? "rgba(248,250,252,0.82)" : "rgba(15,23,42,0.72)";
  const headerBorder = isDark ? "rgba(226,232,240,0.14)" : "rgba(15,23,42,0.10)";
  const rowEvenBg = isDark ? "rgba(30,41,59,0.45)" : "rgba(248,250,252,0.55)";
  const rowOddBg = isDark ? "transparent" : "white";
  const cellBorder = isDark ? "rgba(226,232,240,0.10)" : "rgba(15,23,42,0.06)";
  const cellColor = isDark ? "rgba(248,250,252,0.82)" : "rgba(15,23,42,0.72)";
  return (
    <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="row split" style={{ gap: 10 }}>
        <div className="card-title">{title}</div>
        <div className="pill">
          {tx("前", "Top")} {Math.min(8, rows.length)}
        </div>
      </div>
      <div style={{ height: 10 }} />
      <div className="scroll" style={{ borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
          <thead>
            <tr style={{ background: headerBg }}>
              {[tx("键", "Key"), "A", "B", "Δ(B-A)"].map((h) => (
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
            {rows.slice(0, 8).map((r, idx) => (
              <tr key={`${r.key}-${idx}`} style={{ background: idx % 2 ? rowOddBg : rowEvenBg }}>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {r.key}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {fmt(r.weightA)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {fmt(r.weightB)}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontSize: 12,
                    borderBottom: `1px solid ${cellBorder}`,
                    fontWeight: 800,
                    color: r.delta > 0 ? (isDark ? "#fca5a5" : "#9f1239") : r.delta < 0 ? (isDark ? "#00d4ff" : "#0891b2") : cellColor,
                  }}
                >
                  {fmt(r.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="viz-note" style={{ marginTop: 8 }}>
        {tx("Δ(B-A) > 0 表示该分层在 B 更强。", "Δ(B-A) > 0 means this category is stronger in B.")}
      </div>
    </div>
  );
}

export default function CompareView({ eventsA, eventsB, filters, onApplyRecommendations, selectedCell, onSelectCell }) {
  const { tx } = useI18n();
  const [tab, setTab] = React.useState("delta_table");
  const [netMode, setNetMode] = React.useState("gained_lost");
  const [netTop, setNetTop] = React.useState(200);
  const [netMinAbs, setNetMinAbs] = React.useState(0);
  const [netTopNodes, setNetTopNodes] = React.useState(0);

  const diff = React.useMemo(() => {
    const aggA = aggregatePairs(eventsA);
    const aggB = aggregatePairs(eventsB);
    const rows = computePairDiff(aggA, aggB, 1e-6);
    const matrix = buildDeltaMatrix(rows);
    return { rows, matrix };
  }, [eventsA, eventsB]);

  const strat = React.useMemo(() => {
    const ann = computeCategoryDiff(eventsA, eventsB, (e) => e.annotation || "NA");
    return { ann };
  }, [eventsA, eventsB]);

  const insights = React.useMemo(() => {
    return buildCompareInsights({
      eventsA,
      eventsB,
      diffRows: diff.rows,
      annDiffRows: strat.ann,
      fluxDiffRows: [],
      filters: filters ?? null,
    });
  }, [diff.rows, eventsA, eventsB, filters, strat.ann]);

  const counts = React.useMemo(() => {
    const gained = diff.rows.filter((r) => r.status === "gained").length;
    const lost = diff.rows.filter((r) => r.status === "lost").length;
    const shared = diff.rows.length - gained - lost;
    return { gained, lost, shared, total: diff.rows.length };
  }, [diff.rows]);

  return (
    <div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <SmallTable title={tx("结果分层差异摘要", "Outcome category delta summary")} rows={strat.ann} />
      </div>

      <div className="row split" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div className="pill">{tx("对比：Δ(B-A) · 权重口径：权重", "Δ(B-A) compare · weight mode: Weight")}</div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="pill">{tx("总计", "total")} {counts.total}</span>
          <span className="pill">{tx("增强", "gained")} {counts.gained}</span>
          <span className="pill">{tx("减弱", "lost")} {counts.lost}</span>
          <span className="pill">{tx("共有", "shared")} {counts.shared}</span>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button className={`btn small ${tab === "delta_table" ? "primary" : ""}`} onClick={() => setTab("delta_table")}>
          {tx("差异表", "ΔTable")}
        </button>
        <button className={`btn small ${tab === "delta_matrix" ? "primary" : ""}`} onClick={() => setTab("delta_matrix")}>
          {tx("差异矩阵", "ΔMatrix")}
        </button>
        <button
          className={`btn small ${tab === "delta_network" ? "primary" : ""}`}
          onClick={() => setTab("delta_network")}
        >
          {tx("差异网络", "ΔNetwork")}
        </button>
        <button className={`btn small ${tab === "insights" ? "primary" : ""}`} onClick={() => setTab("insights")}>
          {tx("洞察", "Insights")}
        </button>
      </div>

      {tab === "insights" ? (
        <InsightsPanel
          title={tx("对比自动摘要 / QC", "Compare auto-summary / QC")}
          fileLabel="compare-insights"
          insights={insights}
          onApplyRecommendations={onApplyRecommendations}
        />
      ) : tab === "delta_network" ? (
        <>
          <div className="row split" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select className="select" style={{ width: 180 }} value={netMode} onChange={(e) => setNetMode(e.target.value)}>
                <option value="gained_lost">{tx("增强 + 减弱", "Gained + Lost")}</option>
                <option value="gained">{tx("仅增强", "Gained only")}</option>
                <option value="lost">{tx("仅减弱", "Lost only")}</option>
                <option value="all">{tx("全部（Δ≠0）", "All Δ≠0")}</option>
              </select>
              <select className="select" style={{ width: 160 }} value={String(netTop)} onChange={(e) => setNetTop(Number(e.target.value))}>
                <option value="50">{tx("前 50", "Top 50")}</option>
                <option value="100">{tx("前 100", "Top 100")}</option>
                <option value="200">{tx("前 200", "Top 200")}</option>
                <option value="500">{tx("前 500", "Top 500")}</option>
              </select>
              <select
                className="select"
                style={{ width: 170 }}
                value={String(netTopNodes)}
                onChange={(e) => setNetTopNodes(Number(e.target.value))}
                title={tx("仅显示差异最强的前 N 个节点（按 Σ|Δ|）", "Show only the strongest Top N nodes (by Σ|Δ|)")}
              >
                <option value="0">{tx("全部节点", "All nodes")}</option>
                <option value="20">{tx("前 20 个节点", "Top 20 nodes")}</option>
                <option value="30">{tx("前 30 个节点", "Top 30 nodes")}</option>
                <option value="40">{tx("前 40 个节点", "Top 40 nodes")}</option>
                <option value="60">{tx("前 60 个节点", "Top 60 nodes")}</option>
              </select>
              <input
                className="input"
                style={{ width: 180 }}
                inputMode="decimal"
                placeholder={tx("最小 |Δ|（可选）", "min |Δ| (optional)")}
                value={netMinAbs ? String(netMinAbs) : ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const n = v ? Number(v) : 0;
                  setNetMinAbs(Number.isFinite(n) ? n : 0);
                }}
              />
            </div>
            <div className="pill">{tx("提示：先用过滤缩小规模", "Tip: reduce scale with filters first")}</div>
          </div>
          <DeltaNetworkView
            diffRows={diff.rows}
            mode={netMode}
            minAbsDelta={netMinAbs}
            topEdges={netTop}
            topNodes={netTopNodes}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
          />
        </>
      ) : tab === "delta_matrix" ? (
        <DeltaMatrixView matrix={diff.matrix} selectedCell={selectedCell} onSelectCell={onSelectCell} />
      ) : (
        <DeltaTableView rows={diff.rows} />
      )}
    </div>
  );
}
