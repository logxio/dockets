function pickTop(items, n) {
  const out = [];
  const seen = new Set();
  for (const x of items) {
    const s = String(x ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

function parseInjectedCsvFromPrompt(prompt) {
  const text = String(prompt ?? "");
  const idx = text.indexOf("RowId,PlaintiffFirm,DefendantFirm,CaseType,Court,Outcome,Weight");
  if (idx === -1) return [];
  const lines = text.slice(idx).split("\n").slice(1);
  const rows = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s) break;
    if (s.startsWith("[/")) break;
    // very simple CSV split (works for our injected csv which avoids commas in fields)
    const parts = s.split(",");
    if (parts.length < 7) continue;
    const rowId = Number(parts[0]);
    const sender = parts[1] ?? ""; // plaintiff
    const receiver = parts[2] ?? ""; // defendant
    const metabolite = parts[3] ?? ""; // case type
    const court = parts[4] ?? "";
    const outcome = parts[5] ?? "";
    if (!Number.isFinite(rowId)) continue;
    rows.push({ rowId, sender, receiver, metabolite, court, outcome });
    if (rows.length >= 40) break;
  }
  return rows;
}

function buildDemoStructuredContent({ prompt, reason }) {
  const rows = parseInjectedCsvFromPrompt(prompt);
  const mets = pickTop(rows.map((r) => r.metabolite).filter(Boolean), 5);
  const pairs = pickTop(rows.map((r) => `${r.sender}\t${r.receiver}`), 5).map((k) => {
    const [sender, receiver] = k.split("\t");
    return { sender, receiver };
  });
  const senders = pickTop(rows.map((r) => r.sender), 4);
  const receivers = pickTop(rows.map((r) => r.receiver), 4);

  const m1 = mets[0] || "Contract";
  const m2 = mets[1] || "IP";
  const m3 = mets[2] || "Employment";

  const e1 = rows[0]?.rowId ?? 1;
  const e2 = rows[1]?.rowId ?? 2;
  const e3 = rows[2]?.rowId ?? 3;

  const think =
    "I will answer strictly based on the injected CSV.\n" +
    `1) Scan the CaseType column and extract frequent/high-weight candidates: ${[m1, m2, m3].join(", ")}.\n` +
    "2) Use the plaintiff/defendant firm distribution to identify the most frequent pairwise matchups.\n" +
    "3) Bind every claim to RowId evidence (evidence_row_ids) for traceability.\n" +
    (reason
      ? `4) Demo mode (${reason}) is enabled to keep the loop reproducible without external dependencies.\n`
      : "");

  const reportMd =
    `### Outcome-based law firm interactions (demo)\n\n` +
    `1. **Frequent case types**: In the injected rows, **${m1}**, **${m2}**, **${m3}** appear frequently / with high weight, suggesting the interactions concentrate in these case types.\n` +
    "2. **Pairwise-game view**: focus on the strongest plaintiff→defendant pairs (see evidence). These pairs often form the stable backbone of the structure.\n" +
    "3. **Avoid reputation-only rankings**: reputation/size can miss true win-performance; Bradley–Terry / AHPI-style modeling incorporates opponent strength and role bias (e.g., defendant advantage).\n" +
    "4. **Extensions**: use an LLM agent to extract outcomes/case types/courts from opinions to expand the sample while keeping RowId-linked evidence.\n\n" +
    "Summary: every claim above traces back through import → filter → evidence → export, so each one can be checked against the RowIds it cites.";

  const payload = {
    claims: [
      {
        id: "C1",
        title: "Frequent case types and key matchups are traceable",
        confidence: "high",
        statement_md: `- In the injected rows, **${m1}**/**${m2}**/**${m3}** appear repeatedly, suggesting concentration in these case types; top pairs can be a core subset for follow-up checks.`,
        evidence_row_ids: [e1, e2, e3],
        caveats: [
          "Sampling bias, role bias (defendant advantage), and case-type heterogeneity all bear on this reading; stratify before generalizing.",
        ],
      },
      {
        id: "C2",
        title: "Prioritize reviewing the most common plaintiff→defendant pairs",
        confidence: "medium",
        statement_md: "- First bind and review the top edges in Network/Matrix, then stratify by CaseType/Court/Outcome.",
        evidence_row_ids: [e1],
        caveats: [
          "Top-edges truncation changes the structure; consider sensitivity analysis or stratifying by case type.",
        ],
      },
    ],
    entities: {
      senders,
      receivers,
      metabolites: [m1, m2, m3].filter(Boolean),
      pairs,
    },
    filterPatch: mets[0] ? { metaboliteQuery: mets[0], topEdges: 300 } : { topEdges: 300 },
    evidence: { metabolites: [m1, m2, m3].filter(Boolean), pairs },
  };

  return `<think>\n${think}\n</think>\n\n[REPORT_MD]\n${reportMd}\n[/REPORT_MD]\n[PAYLOAD_JSON]\n\`\`\`json\n${JSON.stringify(
    payload,
    null,
    2,
  )}\n\`\`\`\n[/PAYLOAD_JSON]\n`;
}

export function mockChatCompletions({ body, reason = "MOCK_FALLBACK" }) {
  const user = Array.isArray(body?.messages) ? body.messages.find((m) => m?.role === "user") : null;
  const prompt = user?.content ?? "";
  const content = buildDemoStructuredContent({ prompt, reason });
  return {
    id: `mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body?.model ?? "mock",
    mock: true,
    mockReason: reason,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
