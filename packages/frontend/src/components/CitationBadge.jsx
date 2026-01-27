import React from "react";
import { useI18n } from "../lib/i18n";

export default function CitationBadge({ rowIds, onOpenEvidence, title }) {
  const { lang } = useI18n();
  const tx = (zh, en) => (lang === "en" ? en : zh);
  const ids = Array.isArray(rowIds) ? rowIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
  const count = ids.length;
  const canOpen = typeof onOpenEvidence === "function" && count > 0;

  return (
    <button
      type="button"
      className="citation-badge"
      title={
        title ||
        (count
          ? tx(`✅ 引用已验证（行数：${count}）`, `✅ Citation verified (rows: ${count})`)
          : tx("✅ 引用已验证", "✅ Citation verified"))
      }
      disabled={!canOpen}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canOpen) return;
        onOpenEvidence(ids);
      }}
    >
      {tx("✅ 引用", "✅ Citation")}
      {count > 1 ? ` (${count})` : ""}
    </button>
  );
}
