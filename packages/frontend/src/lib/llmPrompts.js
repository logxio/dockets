function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function buildTopRowsCsv(events, n = 20) {
  const headers = ["RowId", "PlaintiffFirm", "DefendantFirm", "CaseType", "Court", "Outcome", "Weight"];
  const rows = [];
  const top = [...(events ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, n);
  for (let i = 0; i < top.length; i += 1) {
    const e = top[i];
    rows.push([
      csvCell(String(Number.isFinite(Number(e?.rowId)) ? Number(e.rowId) : i + 1)),
      csvCell(e.sender ?? ""),
      csvCell(e.receiver ?? ""),
      csvCell(e.metabolite ?? ""),
      csvCell(e.sensor ?? ""),
      csvCell(e.annotation ?? ""),
      csvCell(typeof e.weight === "number" ? e.weight : ""),
    ]);
  }
  return `${headers.join(",")}\n${rows.map((r) => r.join(",")).join("\n")}`.trim();
}

export function buildMcccDataInterpretationPrompt({ events, filters, maxRows = 20 }) {
  const csv = buildTopRowsCsv(events, maxRows);
  const filterText = filters ? JSON.stringify(filters, null, 2) : "{}";

  return (
    "You are a computational-legal-studies research assistant. You must interpret strictly based on the CSV below (no generic explanations).\n" +
    "\n" +
    "[Hard requirements]\n" +
    "1) Mention at least 3 firms that appear in the CSV; and at least 2 case types that appear in the CSV (if case types are missing, explicitly say so).\n" +
    "2) Output must contain exactly two parts: REPORT_MD (Markdown) + PAYLOAD_JSON (JSON). Do not output anything else.\n" +
    "3) REPORT_MD: use Markdown (### headers, **bold**, lists). Structure: title + 3–6 bullets + 1 short paragraph.\n" +
    "4) PAYLOAD_JSON: must be valid JSON with this object structure:\n" +
    '   {"claims":[{"id":"C1","title":"","confidence":"high|medium|low","statement_md":"","evidence_row_ids":[1,2,3],"caveats":["..."]}],"entities":{"senders":[],"receivers":[],"metabolites":[],"pairs":[{"sender":"","receiver":""}]},"filterPatch":{},"evidence":{"metabolites":[],"pairs":[]}}\n' +
    "   - entities.senders/receivers: plaintiff/defendant firms (for UI click-to-focus/filter).\n" +
    "   - entities.metabolites: case types (for UI click-to-filter).\n" +
    "   - filterPatch: if you recommend focusing a firm or case type, provide an immediately-applicable UI filter patch (e.g., focusCell/metaboliteQuery/sensorQuery/annotationQuery/topEdges).\n" +
    "   - evidence: list the case types / firm pairs you referenced in REPORT_MD (for evidence UI).\n" +
    "   - claims: every claim must cite evidence_row_ids (from the CSV RowId column), and include confidence + caveats.\n" +
    "\n" +
    "[Current context]\n" +
    "Current filters (JSON):\n" +
    filterText +
    "\n\n" +
    `Current table (Top ${maxRows} rows by weight, CSV):\n` +
    csv +
    "\n\n" +
    "[Output format (must follow strictly)]\n" +
    "[REPORT_MD]\n" +
    "(Write your Markdown report here)\n" +
    "[/REPORT_MD]\n" +
    "[PAYLOAD_JSON]\n" +
    "```json\n" +
    "{\n" +
    '  "claims": [\n' +
    '    { "id": "C1", "title": "", "confidence": "medium", "statement_md": "", "evidence_row_ids": [1], "caveats": [] }\n' +
    "  ],\n" +
    '  "entities": { "senders": [], "receivers": [], "metabolites": [], "pairs": [] },\n' +
    '  "filterPatch": {},\n' +
    '  "evidence": { "metabolites": [], "pairs": [] }\n' +
    "}\n" +
    "```\n" +
    "[/PAYLOAD_JSON]"
  );
}
