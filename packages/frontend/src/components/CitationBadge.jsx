import React from "react";

export default function CitationBadge({ rowIds, onOpenEvidence, title }) {
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
          ? `✅ Citation verified (rows: ${count})`
          : "✅ Citation verified")
      }
      disabled={!canOpen}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canOpen) return;
        onOpenEvidence(ids);
      }}
    >
      ✅ Citation
      {count > 1 ? ` (${count})` : ""}
    </button>
  );
}
