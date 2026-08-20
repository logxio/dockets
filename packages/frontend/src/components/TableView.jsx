import React from "react";
import CitationBadge from "./CitationBadge";
import Tooltip from "./Tooltip";

export default function TableView({ events, selectedPair, onSelectPair, onOpenEvidence }) {
  const [q, setQ] = React.useState("");
  const query = q.trim().toLowerCase();
  const hlRef = React.useRef(null);
  const labels = {
    rowId: "RowId",
    citation: "Citation",
    plaintiff: "PlaintiffFirm",
    defendant: "DefendantFirm",
    caseType: "CaseType",
    court: "Court",
    outcome: "Outcome",
    weight: "Weight",
  };

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
        <div className="pill">Showing up to 2000 rows</div>
        <input
          className="input"
          style={{ width: "min(420px, 100%)" }}
          placeholder="Search (plaintiff/defendant/case type/court/outcome)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="table-wrap table-wrap-responsive">
        <table className="table table-responsive">
          <thead>
            <tr>
              <th>{labels.rowId}</th>
              <th>{labels.citation}</th>
              <th>{labels.plaintiff}</th>
              <th>{labels.defendant}</th>
              <th>{labels.caseType}</th>
              <th>{labels.court}</th>
              <th>{labels.outcome}</th>
              <th>{labels.weight}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 2000).map((e, idx) => (
              <tr
                key={idx}
                ref={isHl(e) ? hlRef : null}
	                className={`${isHl(e) ? "row-pair-hl" : ""} table-row-clickable`}
	                title="Click: highlight and bind to Network/Matrix/DotPlot"
	                onClick={() => (typeof onSelectPair === "function" ? onSelectPair({ sender: e.sender, receiver: e.receiver }) : null)}
	              >
	                <td data-label={labels.rowId}>{e.rowId ?? ""}</td>
	                <td data-label={labels.citation}>
	                  <CitationBadge
	                    rowIds={Number.isFinite(Number(e.rowId)) ? [Number(e.rowId)] : []}
	                    title={
	                      Number.isFinite(Number(e.rowId))
                        ? `RowId ${e.rowId} · Click to view evidence`
                        : "Click to view evidence"
                    }
                    onOpenEvidence={(ids) =>
                      typeof onOpenEvidence === "function" ? onOpenEvidence(ids, `RowId ${ids[0]} · ${e.sender}→${e.receiver}`) : null
	                    }
	                  />
	                </td>
	                <td data-label={labels.plaintiff}>
	                  {e.sender && String(e.sender).length > 26 ? (
	                    <Tooltip content={e.sender} maxWidth={520}>
	                      <div className="td-ellipsis">{e.sender}</div>
                    </Tooltip>
                  ) : (
	                    <div className="td-ellipsis">{e.sender}</div>
	                  )}
	                </td>
	                <td data-label={labels.defendant}>
	                  {e.receiver && String(e.receiver).length > 26 ? (
	                    <Tooltip content={e.receiver} maxWidth={520}>
	                      <div className="td-ellipsis">{e.receiver}</div>
                    </Tooltip>
                  ) : (
	                    <div className="td-ellipsis">{e.receiver}</div>
	                  )}
	                </td>
	                <td data-label={labels.caseType}>{e.metabolite ?? ""}</td>
	                <td data-label={labels.court}>{e.sensor ?? ""}</td>
	                <td data-label={labels.outcome}>{e.annotation ?? ""}</td>
	                <td data-label={labels.weight}>{e.weight.toFixed(3)}</td>
	              </tr>
	            ))}
	          </tbody>
	        </table>
	      </div>
    </div>
  );
}
