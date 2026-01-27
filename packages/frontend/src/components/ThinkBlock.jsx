import React from "react";
import { useI18n } from "../lib/i18n";

export default function ThinkBlock({ think, defaultOpen = false }) {
  const { t: tr } = useI18n();
  const t = typeof think === "string" ? think.trim() : "";
  if (!t) return null;
  return (
    <details className="think-block" open={defaultOpen}>
      <summary className="think-summary">
        <span className="think-title">{tr("think.title")}</span>
        <span className="think-meta">
          <span className="pill think-pill">{tr("think.badge")}</span>
        </span>
      </summary>
      <pre className="think-pre">{t}</pre>
    </details>
  );
}
