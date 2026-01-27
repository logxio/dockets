function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function buildTopRowsCsv(events, n = 20, lang = "en") {
  const isEn = String(lang) === "en";
  const headers = isEn
    ? ["RowId", "PlaintiffFirm", "DefendantFirm", "CaseType", "Court", "Outcome", "Weight"]
    : ["RowId", "原告律所", "被告律所", "案件类型", "法院", "结果", "权重"];
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

export function buildMcccDataInterpretationPrompt({ events, filters, maxRows = 20, lang = "zh" }) {
  const isEn = String(lang) === "en";
  const tx = (zh, en) => (isEn ? en : zh);
  const csv = buildTopRowsCsv(events, maxRows, lang);
  const filterText = filters ? JSON.stringify(filters, null, 2) : "{}";

  return (
    tx(
      "你是计算法学/实证法学研究助手。你必须严格基于下面这份 CSV 数据进行解读（不要泛泛科普）。\n",
      "You are a computational-legal-studies research assistant. You must interpret strictly based on the CSV below (no generic explanations).\n",
    ) +
    "\n" +
    tx("【硬性要求】\n", "[Hard requirements]\n") +
    tx(
      "1) 在回答中至少点名 3 个出现在 CSV 的律所；并至少点名 2 个出现在 CSV 的案件类型（若案件类型为空/缺失，请明确说明无法点名具体案件类型）。\n",
      "1) Mention at least 3 firms that appear in the CSV; and at least 2 case types that appear in the CSV (if case types are missing, explicitly say so).\n",
    ) +
    tx(
      "2) 输出必须包含两部分：REPORT_MD（Markdown）+ PAYLOAD_JSON（JSON）。除这两部分外不要输出任何多余文字。\n",
      "2) Output must contain exactly two parts: REPORT_MD (Markdown) + PAYLOAD_JSON (JSON). Do not output anything else.\n",
    ) +
    tx(
      "3) REPORT_MD：使用 Markdown（支持 ### 标题、**加粗**、列表），结构为“标题 + 3-6 条要点 + 1 段总结”。\n",
      "3) REPORT_MD: use Markdown (### headers, **bold**, lists). Structure: title + 3–6 bullets + 1 short paragraph.\n",
    ) +
    tx("4) PAYLOAD_JSON：必须是合法 JSON，对象结构如下：\n", "4) PAYLOAD_JSON: must be valid JSON with this object structure:\n") +
    '   {"claims":[{"id":"C1","title":"","confidence":"high|medium|low","statement_md":"","evidence_row_ids":[1,2,3],"caveats":["..."]}],"entities":{"senders":[],"receivers":[],"metabolites":[],"pairs":[{"sender":"","receiver":""}]},"filterPatch":{},"evidence":{"metabolites":[],"pairs":[]}}\n' +
    tx(
      "   - entities.senders/receivers：分别对应 原告/被告 律所（用于前端点击跳转/筛选）。\n",
      "   - entities.senders/receivers: plaintiff/defendant firms (for UI click-to-focus/filter).\n",
    ) +
    tx(
      "   - entities.metabolites：对应 案件类型（用于前端点击跳转/筛选）。\n",
      "   - entities.metabolites: case types (for UI click-to-filter).\n",
    ) +
    tx(
      "   - filterPatch：如果你建议聚焦某个律所或案件类型，请给出前端可直接应用的过滤 patch（例如 focusCell/metaboliteQuery/sensorQuery/annotationQuery/topEdges）。\n",
      "   - filterPatch: if you recommend focusing a firm or case type, provide an immediately-applicable UI filter patch (e.g., focusCell/metaboliteQuery/sensorQuery/annotationQuery/topEdges).\n",
    ) +
    tx(
      "   - evidence：列出你在 REPORT_MD 中点名的案件类型 / 律所对（用于前端展示证据）。\n",
      "   - evidence: list the case types / firm pairs you referenced in REPORT_MD (for evidence UI).\n",
    ) +
    tx(
      "   - claims：每条 claim 必须引用 evidence_row_ids（来自 CSV 的 RowId 列），并给出 confidence 与 caveats。\n",
      "   - claims: every claim must cite evidence_row_ids (from the CSV RowId column), and include confidence + caveats.\n",
    ) +
    "\n" +
    tx("【当前上下文】\n", "[Current context]\n") +
    tx("当前筛选条件（JSON）：\n", "Current filters (JSON):\n") +
    filterText +
    "\n\n" +
    tx(`当前表（按 weight 取 Top ${maxRows} 行，CSV）：\n`, `Current table (Top ${maxRows} rows by weight, CSV):\n`) +
    csv +
    "\n\n" +
    tx("【输出格式（必须严格遵守）】\n", "[Output format (must follow strictly)]\n") +
    "[REPORT_MD]\n" +
    tx("（在这里输出 Markdown 报告）\n", "(Write your Markdown report here)\n") +
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
