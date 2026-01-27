import React from "react";
import { useI18n } from "../lib/i18n";

export default function FiltersPanel({ disabled, filters, setFilters, onReset }) {
  const { t } = useI18n();
  const updateNum = (key, raw) => {
    const s = raw.trim();
    if (!s) {
      setFilters({ ...filters, [key]: undefined });
      return;
    }
    const n = Number(s);
    setFilters({ ...filters, [key]: Number.isFinite(n) ? n : undefined });
  };

  return (
    <div style={{ opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div className="field">
          <div className="label">{t("filtersPanel.topEdges")}</div>
          <input
            className="input"
            inputMode="numeric"
            placeholder={t("filtersPanel.topEdgesPh")}
            value={typeof filters.topEdges === "number" ? String(filters.topEdges) : ""}
            onChange={(e) => updateNum("topEdges", e.target.value)}
          />
        </div>

        <div className="field">
          <div className="label">{t("filtersPanel.caseType")}</div>
          <input
            className="input"
            placeholder={t("filtersPanel.caseTypePh")}
            value={filters.metaboliteQuery}
            onChange={(e) => setFilters({ ...filters, metaboliteQuery: e.target.value })}
          />
        </div>

        <div className="field">
          <div className="label">{t("filtersPanel.court")}</div>
          <input
            className="input"
            placeholder={t("filtersPanel.courtPh")}
            value={filters.sensorQuery}
            onChange={(e) => setFilters({ ...filters, sensorQuery: e.target.value })}
          />
        </div>

        <div className="field">
          <div className="label">{t("filtersPanel.outcome")}</div>
          <input
            className="input"
            placeholder={t("filtersPanel.outcomePh")}
            value={filters.annotationQuery ?? ""}
            onChange={(e) => setFilters({ ...filters, annotationQuery: e.target.value })}
          />
        </div>

        <label className="row check-label">
          <input
            type="checkbox"
            className="check"
            checked={filters.includeSelfLoops}
            onChange={(e) => setFilters({ ...filters, includeSelfLoops: e.target.checked })}
          />
          {t("filtersPanel.includeSelf")}
        </label>

        {filters.focusCell ? (
          <div className="field">
            <div className="label">{t("filtersPanel.focusMode")}</div>
            <select
              className="select"
              value={filters.focusMode ?? "any"}
              onChange={(e) => setFilters({ ...filters, focusMode: e.target.value })}
            >
              <option value="any">{t("filtersPanel.any")}</option>
              <option value="outgoing">{t("filtersPanel.outgoing")}</option>
              <option value="incoming">{t("filtersPanel.incoming")}</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn small" onClick={onReset}>
          {t("filtersPanel.reset")}
        </button>
      </div>
    </div>
  );
}
