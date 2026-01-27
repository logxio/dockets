import React from "react";
import { downloadHtml, downloadTsv, generateRankingsReport } from "../lib/report";
import Tooltip from "./Tooltip";
import { useI18n } from "../lib/i18n";

function num(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function fmt(n, digits = 3) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export default function RankingsView({ rankings, error, onReload, presentFirms, onFocusFirm }) {
  const { lang } = useI18n();
  const tx = (zh, en) => (lang === "en" ? en : zh);
  const [q, setQ] = React.useState("");
  const query = q.trim().toLowerCase();
  const [onlyPresent, setOnlyPresent] = React.useState(false);
  const [sortKey, setSortKey] = React.useState("rank"); // rank | score | firm
  const [sortDir, setSortDir] = React.useState("asc"); // asc | desc
  const [clickMode, setClickMode] = React.useState("any");
  const [limit, setLimit] = React.useState(200);

  const presentSet = React.useMemo(() => (presentFirms instanceof Set ? presentFirms : new Set(presentFirms ?? [])), [presentFirms]);

  const rows = React.useMemo(() => {
    const base = Array.isArray(rankings) ? rankings : [];
    let out = base;
    if (onlyPresent && presentSet.size) out = out.filter((r) => presentSet.has(r.Firm));
    if (query) out = out.filter((r) => String(r.Firm ?? "").toLowerCase().includes(query));

    const dir = sortDir === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => {
      if (sortKey === "firm") return dir * String(a.Firm ?? "").localeCompare(String(b.Firm ?? ""), "en");
      if (sortKey === "score") return dir * ((num(a.Score) ?? -Infinity) - (num(b.Score) ?? -Infinity));
      return dir * ((num(a.Rank) ?? Infinity) - (num(b.Rank) ?? Infinity));
    });

    const k = typeof limit === "number" && limit > 0 ? Math.min(out.length, limit) : out.length;
    return out.slice(0, k);
  }, [rankings, onlyPresent, presentSet, query, sortKey, sortDir, limit]);

  const exportTsv = () => {
    if (!rows.length) {
      alert(tx("没有可导出的行（请先加载排名或调整筛选）", "Nothing to export (load rankings or adjust filters)"));
      return;
    }
    downloadTsv("mahari_rankings.tsv", rows, ["Rank", "Firm", "Score", "ExpScore"]);
  };

  const exportHtml = () => {
    if (!rows.length) {
      alert(tx("没有可导出的行（请先加载排名或调整筛选）", "Nothing to export (load rankings or adjust filters)"));
      return;
    }
    const html = generateRankingsReport({
      title: tx("律所排名报告", "Law firm rankings report"),
      query: q,
      onlyPresent,
      presentFirmsCount: presentSet.size,
      rows,
      lang,
    });
    downloadHtml("mahari-law-firm-rankings-rankings-report.html", html);
  };

  return (
    <div className="viz-view">
      <div className="row split" style={{ marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="pill">
            {tx("律所", "firms")} {Array.isArray(rankings) ? rankings.length : 0}
          </span>
          {presentSet.size ? (
            <span className="pill">
              {tx("网络内", "in network")} {presentSet.size}
            </span>
          ) : (
            <span className="pill">{tx("网络未加载", "network not loaded")}</span>
          )}
          <span className="pill">
            {tx("当前显示", "showing")} {rows.length}
          </span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ width: 280 }}
            placeholder={tx("搜索律所（模糊匹配）", "Search firms (fuzzy)")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="select"
            style={{ width: 140 }}
            value={sortKey}
            onChange={(e) => {
              const next = e.target.value;
              setSortKey(next);
              setSortDir(next === "score" ? "desc" : "asc");
            }}
            title={tx("排序字段", "Sort key")}
          >
            <option value="rank">{tx("名次", "Rank")}</option>
            <option value="score">{tx("得分", "Score")}</option>
            <option value="firm">{tx("律所", "Firm")}</option>
          </select>
          <select className="select" style={{ width: 110 }} value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
            <option value="asc">{tx("升序", "Asc")}</option>
            <option value="desc">{tx("降序", "Desc")}</option>
          </select>
          <select
            className="select"
            style={{ width: 120 }}
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            title={tx("最多显示前 N", "Show top N")}
          >
            <option value="50">{tx("前 50", "Top 50")}</option>
            <option value="100">{tx("前 100", "Top 100")}</option>
            <option value="200">{tx("前 200", "Top 200")}</option>
            <option value="500">{tx("前 500", "Top 500")}</option>
            <option value="2000">{tx("前 2000", "Top 2000")}</option>
          </select>
        </div>
      </div>

      <div className="row split" style={{ marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
        <label className="row check-label">
          <input
            type="checkbox"
            className="check"
            checked={onlyPresent}
            onChange={(e) => setOnlyPresent(e.target.checked)}
            disabled={!presentSet.size}
            title={tx("联动：只显示当前网络里出现过的律所", "Only show firms present in the current network")}
          />
          {tx("仅显示当前网络中出现的律所", "Only show firms present in the current network")}
        </label>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select
            className="select"
            style={{ width: 160 }}
            value={clickMode}
            onChange={(e) => setClickMode(e.target.value)}
            title={tx("点击律所时的聚焦模式", "Focus mode on click")}
          >
            <option value="any">{tx("点击 → 聚焦（任意）", "Click → Focus (any)")}</option>
            <option value="outgoing">{tx("点击 → 聚焦（发出）", "Click → Focus (outgoing)")}</option>
            <option value="incoming">{tx("点击 → 聚焦（进入）", "Click → Focus (incoming)")}</option>
          </select>
          <button className="btn small" onClick={exportTsv}>
            {tx("导出 TSV", "Export TSV")}
          </button>
          <button className="btn small" onClick={exportHtml}>
            {tx("导出排名报告", "Export rankings report")}
          </button>
          {typeof onReload === "function" ? (
            <button className="btn small" onClick={onReload}>
              {tx("重新加载", "Reload")}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="warning" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table table-wide">
          <thead>
            <tr>
              <th>{tx("名次", "Rank")}</th>
              <th>{tx("律所", "Firm")}</th>
              <th>{tx("得分", "Score")}</th>
              <th>{tx("指数得分", "ExpScore")}</th>
              <th>{tx("网络内", "InNetwork")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const firm = String(r.Firm ?? "");
              const inNet = firm && presentSet.size ? presentSet.has(firm) : false;
              return (
                <tr
                  key={`${firm}-${idx}`}
                  className="table-row-clickable"
                  title={tx("点击：跳转到网络并聚焦该律所", "Click: go to Network and focus this firm")}
                  onClick={() => (typeof onFocusFirm === "function" ? onFocusFirm(firm, clickMode) : null)}
                >
                  <td>{num(r.Rank) ?? "—"}</td>
                  <td className="td-strong">
                    {firm && firm.length > 26 ? (
                      <Tooltip content={firm} maxWidth={520}>
                        <div className="td-ellipsis">{firm}</div>
                      </Tooltip>
                    ) : (
                      <div className="td-ellipsis">{firm}</div>
                    )}
                  </td>
                  <td>{fmt(num(r.Score), 3)}</td>
                  <td>{fmt(num(r.ExpScore), 3)}</td>
                  <td>{presentSet.size ? (inNet ? tx("是", "yes") : "") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="viz-note" style={{ marginTop: 10 }}>
        {tx(
          "提示：排名来自 AHPI（广义 Bradley–Terry，基于结果）。点击律所会写入左侧聚焦并跳转网络。",
          "Tip: rankings come from AHPI (generalized Bradley–Terry / outcome-based). Clicking a firm writes focus and jumps to Network.",
        )}
      </div>
    </div>
  );
}
