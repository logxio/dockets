import React from "react";
import { useI18n } from "../lib/i18n";

function StepCard({ currentStep, n, title, desc }) {
  const { t } = useI18n();
  return (
    <div className="details-block" style={{ opacity: currentStep === n ? 1 : 0.8 }}>
      <div className="row split" style={{ gap: 10 }}>
        <div>
          <div className="card-title">
            {t("story.stepLabel")} {n}: {title}
          </div>
          <div className="card-sub">{desc}</div>
        </div>
        {currentStep === n ? <span className="pill">{t("story.current")}</span> : <span className="pill">—</span>}
      </div>
    </div>
  );
}

export default function StoryMode({ open, step, busy, error, demoMode, onClose, onRun, onLoadTop100, onLoadTop50, onExport }) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-label="story mode"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && typeof onClose === "function") onClose();
      }}
    >
      <div className="modal" style={{ width: "min(980px, calc(100vw - 32px))" }}>
        <div className="modal-head">
          <div>
            <div className="card-title">{t("story.title")}</div>
            <div className="card-sub">{t("story.subtitle")}</div>
          </div>
          <button className="btn small" onClick={onClose}>
            {t("buttons.close")}
          </button>
        </div>

        <div className="modal-body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn small primary" onClick={onRun} disabled={busy}>
              {busy ? t("story.running") : t("story.autoRun")}
            </button>
            <button className="btn small" onClick={onExport} disabled={busy}>
              {t("story.export")}
            </button>
            {demoMode ? <span className="pill">{t("misc.demoMode")}</span> : null}
          </div>

          {demoMode ? (
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn small" onClick={onLoadTop100} disabled={busy}>
                {t("fileImport.loadTop100")}
              </button>
              <button className="btn small" onClick={onLoadTop50} disabled={busy}>
                {t("fileImport.loadTop50")}
              </button>
              <span className="pill">{t("story.fastTip")}</span>
            </div>
          ) : null}

          {error ? (
            <div className="warning" style={{ marginTop: 10 }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <StepCard currentStep={step} n={1} title={t("story.steps.s1Title")} desc={t("story.steps.s1Desc")} />
            <StepCard currentStep={step} n={2} title={t("story.steps.s2Title")} desc={t("story.steps.s2Desc")} />
            <StepCard currentStep={step} n={3} title={t("story.steps.s3Title")} desc={t("story.steps.s3Desc")} />
          </div>

          <div className="notice" style={{ marginTop: 10 }}>
            {t("story.tips")}
          </div>
        </div>
      </div>
    </div>
  );
}
