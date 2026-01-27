import React from "react";
import { downloadTsv } from "../lib/report";
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

export default function DeltaTableView({ rows }) {
  const { tx } = useI18n();
  const theme = useTheme();
  const isDark = theme === "dark";
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [top, setTop] = React.useState(200);

  const headerBg = isDark ? "rgba(2,6,23,0.92)" : "rgba(248,250,252,0.94)";
  const headerColor = isDark ? "rgba(248,250,252,0.82)" : "rgba(15,23,42,0.72)";
  const headerBorder = isDark ? "rgba(226,232,240,0.14)" : "rgba(15,23,42,0.10)";
  const rowEvenBg = isDark ? "rgba(30,41,59,0.45)" : "rgba(248,250,252,0.55)";
  const rowOddBg = isDark ? "transparent" : "white";
  const cellBorder = isDark ? "rgba(226,232,240,0.10)" : "rgba(15,23,42,0.06)";

  const query = q.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    let out = rows;
    if (status !== "all") out = out.filter((r) => r.status === status);
    if (query) out = out.filter((r) => `${r.sender} ${r.receiver}`.toLowerCase().includes(query));
    return out.slice(0, top);
  }, [rows, status, query, top]);

  return (
    <div>
      <div className="row split" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ width: 260 }}
            placeholder={tx("搜索 原告/被告", "Search plaintiff/defendant")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">{tx("全部", "All")}</option>
            <option value="gained">{tx("增强", "Gained")}</option>
            <option value="lost">{tx("减弱", "Lost")}</option>
            <option value="shared">{tx("共有", "Shared")}</option>
          </select>
          <select className="select" style={{ width: 160 }} value={String(top)} onChange={(e) => setTop(Number(e.target.value))}>
            <option value="50">{tx("前 50", "Top 50")}</option>
            <option value="100">{tx("前 100", "Top 100")}</option>
            <option value="200">{tx("前 200", "Top 200")}</option>
            <option value="500">{tx("前 500", "Top 500")}</option>
          </select>
        </div>
        <button
          className="btn small"
          onClick={() =>
            downloadTsv(
              "mahari_diff.tsv",
              filtered.map((r) => ({
                sender: r.sender,
                receiver: r.receiver,
                weightA: r.weightA,
                weightB: r.weightB,
                delta: r.delta,
                log2fc: r.log2fc,
                status: r.status,
                countA: r.countA,
                countB: r.countB,
              })),
              ["sender", "receiver", "weightA", "weightB", "delta", "log2fc", "status", "countA", "countB"],
            )
          }
        >
          {tx("导出差异 TSV", "Export delta TSV")}
        </button>
      </div>

      <div className="scroll">
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 920 }}>
          <thead>
            <tr style={{ background: headerBg }}>
              {(langHeaders(tx) ?? []).map((h) => (
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
            {filtered.map((r, idx) => (
              <tr key={`${r.sender}-${r.receiver}-${idx}`} style={{ background: idx % 2 ? rowOddBg : rowEvenBg }}>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {r.sender}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {r.receiver}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {fmt(r.weightA)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {fmt(r.weightB)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}`, fontWeight: 700 }}>
                  {fmt(r.delta)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {fmt(r.log2fc)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${cellBorder}` }}>
                  {r.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="viz-note" style={{ marginTop: 10 }}>
        {tx("默认按 |Δ| 排序（边数上限由左侧过滤控制）。", "Sorted by |Δ| by default (Top edges is controlled by the left filter).")}
      </div>
    </div>
  );
}

function langHeaders(tx) {
  return [
    tx("原告", "Plaintiff"),
    tx("被告", "Defendant"),
    "A",
    "B",
    "Δ(B-A)",
    "log2FC",
    tx("状态", "Status"),
  ];
}
