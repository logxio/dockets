import React from "react";
import CitationBadge from "./CitationBadge";
import Tooltip from "./Tooltip";
import { useI18n } from "../lib/i18n";

export default function TableView({ events, selectedPair, onSelectPair, onOpenEvidence }) {
  const { lang } = useI18n();
  const tx = (zh, en) => (lang === "en" ? en : zh);
  const [q, setQ] = React.useState("");
  const query = q.trim().toLowerCase();
  const hlRef = React.useRef(null);

  const rows = React.useMemo(() => {
    if (!query) return events;
    return events.filter((e) => {
      const text = [e.sender, e.receiver, e.metabolite ?? "", e.sensor ?? "", e.annotation ?? ""].join(" ").toLowerCase();
      return text.includes(query);
    });
  }, [events, query]);

  const isHl = React.useCallback(
    (e) => {
      const s = selectedPair?.sender;
      const r = selectedPair?.receiver;
      if (!s || !r) return false;
      return e.sender === s && e.receiver === r;
    },
    [selectedPair],
  );

  React.useEffect(() => {
    const el = hlRef.current;
    if (!el) return;
    // defer to allow table layout
    const t = setTimeout(() => {
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        el.scrollIntoView();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [selectedPair?.sender, selectedPair?.receiver, query]);

  return (
    <div className="viz-view">
      <div className="row split" style={{ marginBottom: 10 }}>
        <div className="pill">{tx("最多显示前 2000 行", "Showing up to 2000 rows")}</div>
        <input
          className="input"
          style={{ width: 320 }}
          placeholder={tx("搜索（原告/被告/案件类型/法院/结果）", "Search (plaintiff/defendant/case type/court/outcome)")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table className="table table-wide" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>RowId</th>
              <th>{tx("引用", "Citation")}</th>
              <th>{tx("原告律所", "PlaintiffFirm")}</th>
              <th>{tx("被告律所", "DefendantFirm")}</th>
              <th>{tx("案件类型", "CaseType")}</th>
              <th>{tx("法院", "Court")}</th>
              <th>{tx("结果", "Outcome")}</th>
              <th>{tx("权重", "Weight")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 2000).map((e, idx) => (
              <tr
                key={idx}
                ref={isHl(e) ? hlRef : null}
                className={`${isHl(e) ? "row-pair-hl" : ""} table-row-clickable`}
                title={tx("点击：高亮并绑定到 网络/矩阵/点图", "Click: highlight and bind to Network/Matrix/DotPlot")}
                onClick={() => (typeof onSelectPair === "function" ? onSelectPair({ sender: e.sender, receiver: e.receiver }) : null)}
              >
                <td>{e.rowId ?? ""}</td>
                <td>
                  <CitationBadge
                    rowIds={Number.isFinite(Number(e.rowId)) ? [Number(e.rowId)] : []}
                    title={
                      Number.isFinite(Number(e.rowId))
                        ? tx(`RowId ${e.rowId} · 点击查看证据`, `RowId ${e.rowId} · Click to view evidence`)
                        : tx("点击查看证据", "Click to view evidence")
                    }
                    onOpenEvidence={(ids) =>
                      typeof onOpenEvidence === "function" ? onOpenEvidence(ids, tx(`RowId ${ids[0]} · ${e.sender}→${e.receiver}`, `RowId ${ids[0]} · ${e.sender}→${e.receiver}`)) : null
                    }
                  />
                </td>
                <td>
                  {e.sender && String(e.sender).length > 26 ? (
                    <Tooltip content={e.sender} maxWidth={520}>
                      <div className="td-ellipsis">{e.sender}</div>
                    </Tooltip>
                  ) : (
                    <div className="td-ellipsis">{e.sender}</div>
                  )}
                </td>
                <td>
                  {e.receiver && String(e.receiver).length > 26 ? (
                    <Tooltip content={e.receiver} maxWidth={520}>
                      <div className="td-ellipsis">{e.receiver}</div>
                    </Tooltip>
                  ) : (
                    <div className="td-ellipsis">{e.receiver}</div>
                  )}
                </td>
                <td>{e.metabolite ?? ""}</td>
                <td>{e.sensor ?? ""}</td>
                <td>{e.annotation ?? ""}</td>
                <td>{e.weight.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
