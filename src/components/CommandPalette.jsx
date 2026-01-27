import React from "react";
import Tooltip from "./Tooltip";
import { useI18n } from "../lib/i18n";

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

export default function CommandPalette({ open, items, onClose, onPick }) {
  const { t } = useI18n();
  const [q, setQ] = React.useState("");
  const [idx, setIdx] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setIdx(0);
    const t = setTimeout(() => inputRef.current?.focus?.(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = React.useMemo(() => {
    const base = Array.isArray(items) ? items : [];
    const query = norm(q);
    if (!query) return base.slice(0, 20);
    const out = [];
    for (const it of base) {
      if (!it) continue;
      const label = String(it.label ?? "");
      if (norm(label).includes(query)) out.push(it);
      if (out.length >= 20) break;
    }
    return out;
  }, [items, q]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (typeof onClose === "function") onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((v) => Math.min(filtered.length - 1, v + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((v) => Math.max(0, v - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const it = filtered[idx];
        if (it && typeof onPick === "function") onPick(it);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, idx, onClose, onPick]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-label="command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && typeof onClose === "function") onClose();
      }}
    >
      <div className="modal" style={{ width: "min(820px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <div>
            <div className="card-title">{t("commandPalette.title")}</div>
            <div className="card-sub">{t("commandPalette.subtitle")}</div>
          </div>
          <button className="btn small" onClick={onClose}>
            {t("buttons.close")}
          </button>
        </div>

        <div className="modal-body">
          <input ref={inputRef} className="input" placeholder={t("commandPalette.placeholder")} value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ height: 10 }} />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>{t("commandPalette.type")}</th>
                  <th>{t("commandPalette.name")}</th>
                  <th style={{ width: 120 }}>{t("commandPalette.action")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((it, i) => (
                    <tr
                      key={`${it.kind}-${it.id}-${i}`}
                      className={`table-row-clickable ${i === idx ? "row-pair-hl" : ""}`}
                      onMouseEnter={() => setIdx(i)}
                      onClick={() => (typeof onPick === "function" ? onPick(it) : null)}
                    >
                      <td>{it.kind}</td>
                      <td>
                        {String(it.label ?? "").length > 36 ? (
                          <Tooltip content={String(it.label ?? "")} maxWidth={560}>
                            <div className="td-ellipsis">{it.label}</div>
                          </Tooltip>
                        ) : (
                          <div className="td-ellipsis">{it.label}</div>
                        )}
                      </td>
                      <td>{t("commandPalette.actionFocus")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="muted">
                      {t("commandPalette.noResults")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="viz-note" style={{ marginTop: 10 }}>
            {t("commandPalette.tip")}
          </div>
        </div>
      </div>
    </div>
  );
}
