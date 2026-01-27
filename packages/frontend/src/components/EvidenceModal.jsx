import React from "react";
import { useI18n } from "../lib/i18n";

function fmt(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v);
}

async function copyText(text, { ok, fail }) {
  try {
    await navigator.clipboard.writeText(text);
    alert(ok);
  } catch {
    alert(fail);
  }
}

export default function EvidenceModal({ open, title, rowIds, eventsByRowId, onClose, onSelectPair, onNavigate }) {
  const { t } = useI18n();
  const labels = React.useMemo(
    () => ({
      rowId: "RowId",
      caseId: "CaseId",
      plaintiff: "PlaintiffFirm",
      defendant: "DefendantFirm",
      caseType: "CaseType",
      court: "Court",
      outcome: "Outcome",
      weight: "Weight",
      actions: t("evidence.actions"),
    }),
    [t],
  );
  const ids = React.useMemo(
    () => (Array.isArray(rowIds) ? rowIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : []),
    [rowIds],
  );
  const rows = React.useMemo(() => ids.map((id) => ({ id, e: eventsByRowId?.get?.(id) || null })), [ids, eventsByRowId]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-label="citation evidence"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && typeof onClose === "function") onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <div>
            <div className="card-title">{t("evidence.title")}</div>
            <div className="card-sub">{title || t("evidence.subtitleDefault")}</div>
          </div>
          <button className="btn small" onClick={onClose}>
            {t("buttons.close")}
          </button>
        </div>

        <div className="modal-body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="pill success">{t("evidence.verified")}</span>
            <span className="pill">
              {t("evidence.rows")}: {ids.length}
            </span>
            <button
              className="btn small"
              onClick={() => copyText(JSON.stringify({ rowIds: ids }, null, 2), { ok: t("evidence.copyOk"), fail: t("evidence.copyFail") })}
            >
              {t("evidence.copyRowIds")}
            </button>
          </div>

          <div style={{ height: 10 }} />

          <div className="table-wrap table-wrap-responsive">
            <table className="table table-responsive">
              <thead>
                <tr>
                  {[
                    labels.rowId,
                    labels.caseId,
                    labels.plaintiff,
                    labels.defendant,
                    labels.caseType,
                    labels.court,
                    labels.outcome,
                    labels.weight,
                    labels.actions,
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ id, e }) => (
                  <tr key={id}>
                    <td data-label={labels.rowId}>{id}</td>
                    <td data-label={labels.caseId}>{fmt(e?.caseId ?? "")}</td>
                    <td data-label={labels.plaintiff}>{fmt(e?.sender ?? "")}</td>
                    <td data-label={labels.defendant}>{fmt(e?.receiver ?? "")}</td>
                    <td data-label={labels.caseType}>{fmt(e?.metabolite ?? "")}</td>
                    <td data-label={labels.court}>{fmt(e?.sensor ?? "")}</td>
                    <td data-label={labels.outcome}>{fmt(e?.annotation ?? "")}</td>
                    <td data-label={labels.weight}>{typeof e?.weight === "number" ? e.weight.toFixed(3) : ""}</td>
                    <td data-label={labels.actions}>
                      {e ? (
                        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => {
                              if (typeof onSelectPair === "function") onSelectPair({ sender: e.sender, receiver: e.receiver });
                              if (typeof onNavigate === "function") onNavigate("table");
                            }}
                          >
                            {t("evidence.goTable")}
                          </button>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => copyText(JSON.stringify(e.raw ?? {}, null, 2), { ok: t("evidence.copyOk"), fail: t("evidence.copyFail") })}
                          >
                            {t("evidence.copyRaw")}
                          </button>
                        </div>
                      ) : (
                        <span className="muted">{t("evidence.missingRow")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.some((r) => r.e?.raw) ? (
            <details className="details-block" style={{ marginTop: 10 }}>
              <summary className="details-summary">{t("evidence.viewRaw")}</summary>
              <pre className="details-pre">{JSON.stringify(rows.find((r) => r.e?.raw)?.e?.raw ?? {}, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
