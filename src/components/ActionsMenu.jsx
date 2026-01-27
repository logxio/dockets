import React from "react";
import { useI18n } from "../lib/i18n";

function hotkeyLabel(keys) {
  const s = String(keys ?? "").trim();
  if (!s) return "";
  const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || "");
  return isMac ? s.replaceAll("Ctrl", "⌃").replaceAll("Cmd", "⌘").replaceAll("Shift", "⇧") : s;
}

export default function ActionsMenu({ onCopyLink, onExportReport, onExportRankingsHtml, onExportRankingsTsv, onExportPng, hotkeys }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [flash, setFlash] = React.useState(null);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const hk = hotkeys && typeof hotkeys === "object" ? hotkeys : {};
  const flashTimer = React.useRef(null);

  const setFlashSafe = (next) => {
    setFlash(next);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1250);
  };

  React.useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  return (
    <div className="actions-menu" ref={rootRef}>
      <button
        className={`btn header-btn actions-btn ${open ? "primary" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="actions-icon" aria-hidden="true">
          ⌁
        </span>
        <span className="actions-text">{t("buttons.actions")}</span>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="menu" role="menu" aria-label={t("buttons.actions")}>
          <div className="menu-head">
            <div className="menu-head-title">{t("buttons.actions")}</div>
            <div className="menu-head-sub">{t("actions.headSub")}</div>
          </div>

          <div className="menu-section">{t("actions.shareSection")}</div>
          <button
            className="menu-item"
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              try {
                const ok = typeof onCopyLink === "function" ? await onCopyLink() : false;
                setFlashSafe(ok ? "copied" : "copyFailed");
              } catch {
                setFlashSafe("copyFailed");
              }
            }}
          >
            <span className="menu-left">
              <span className="menu-label">{t("actions.copyLink")}</span>
              <span className="menu-desc">{t("actions.copyLinkSub")}</span>
            </span>
            <span className="menu-right">
              <span className={`menu-tag ${flash === "copied" ? "ok" : flash === "copyFailed" ? "warn" : ""}`}>
                {flash === "copied" ? t("actions.copied") : flash === "copyFailed" ? t("actions.copyFailed") : "LINK"}
              </span>
              <span className="menu-kbd">{hotkeyLabel(hk.copyLink)}</span>
            </span>
          </button>

          <div className="menu-sep" role="separator" />

          <div className="menu-section">{t("actions.exportSection")}</div>
          {typeof onExportPng === "function" ? (
            <button
              className="menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExportPng();
                setFlashSafe("exported");
              }}
            >
              <span className="menu-left">
                <span className="menu-label">{t("actions.exportPng")}</span>
                <span className="menu-desc">{t("actions.exportPngSub")}</span>
              </span>
              <span className="menu-right">
                <span className={`menu-tag ${flash === "exported" ? "ok" : ""}`}>PNG</span>
                <span className="menu-kbd">{hotkeyLabel(hk.exportPng)}</span>
              </span>
            </button>
          ) : null}
          <button
            className="menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (typeof onExportReport === "function") onExportReport();
              setFlashSafe("exported");
            }}
          >
            <span className="menu-left">
              <span className="menu-label">{t("actions.exportReport")}</span>
              <span className="menu-desc">{t("actions.exportReportSub")}</span>
            </span>
            <span className="menu-right">
              <span className={`menu-tag ${flash === "exported" ? "ok" : ""}`}>HTML</span>
              <span className="menu-kbd">{hotkeyLabel(hk.exportReport)}</span>
            </span>
          </button>

          <button
            className="menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (typeof onExportRankingsHtml === "function") onExportRankingsHtml();
              setFlashSafe("exported");
            }}
          >
            <span className="menu-left">
              <span className="menu-label">{t("actions.exportRankingsHtml")}</span>
              <span className="menu-desc">{t("actions.exportRankingsHtmlSub")}</span>
            </span>
            <span className="menu-right">
              <span className={`menu-tag ${flash === "exported" ? "ok" : ""}`}>HTML</span>
              <span className="menu-kbd">{hotkeyLabel(hk.exportRankings)}</span>
            </span>
          </button>

          <button
            className="menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (typeof onExportRankingsTsv === "function") onExportRankingsTsv();
              setFlashSafe("exported");
            }}
          >
            <span className="menu-left">
              <span className="menu-label">{t("actions.exportRankingsTsv")}</span>
              <span className="menu-desc">{t("actions.exportRankingsTsvSub")}</span>
            </span>
            <span className="menu-right">
              <span className={`menu-tag ${flash === "exported" ? "ok" : ""}`}>TSV</span>
              <span className="menu-kbd">{hotkeyLabel(hk.exportRankingsTsv)}</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
