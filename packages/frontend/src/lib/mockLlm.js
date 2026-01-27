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
  const headers = [
    "RowId,PlaintiffFirm,DefendantFirm,CaseType,Court,Outcome,Weight",
    "RowId,原告律所,被告律所,案件类型,法院,结果,权重",
  ];
  const idx = headers.map((h) => text.indexOf(h)).find((i) => i !== -1);
  if (idx === undefined) return [];
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

function detectPromptLang(prompt) {
  const s = String(prompt ?? "");
  if (s.includes("[Hard requirements]")) return "en";
  if (s.includes("【硬性要求】")) return "zh";
  return /[\u4e00-\u9fff]/.test(s) ? "zh" : "en";
}

function buildDemoStructuredContent({ prompt, reason }) {
  const lang = detectPromptLang(prompt);
  const isEn = String(lang) === "en";
  const tx = (zh, en) => (isEn ? en : zh);

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
    tx(
      "我将严格基于注入的 CSV 作答。\n",
      "I will answer strictly based on the injected CSV.\n",
    ) +
    tx(
      `1) 扫描案件类型列，提取重复出现/高权重的候选：${[m1, m2, m3].join(", ")}。\n`,
      `1) Scan the CaseType column and extract frequent/high-weight candidates: ${[m1, m2, m3].join(", ")}.\n`,
    ) +
    tx(
      "2) 结合原告/被告律所分布，定位最高频的对抗关系（pairwise games）。\n",
      "2) Use the plaintiff/defendant firm distribution to identify the most frequent pairwise matchups.\n",
    ) +
    tx(
      "3) 将每条结论绑定到 RowId（evidence_row_ids）以便可追溯与复核。\n",
      "3) Bind every claim to RowId evidence (evidence_row_ids) for traceability.\n",
    ) +
    (reason
      ? tx(
          `4) 当前为演示模式（${reason}），用于确保无外部依赖也能展示完整闭环。\n`,
          `4) Demo mode (${reason}) is enabled to keep the loop reproducible without external dependencies.\n`,
        )
      : "");

  const reportMd =
    tx(
      `### 基于结果的律所对抗（演示）\n\n`,
      `### Outcome-based law firm interactions (demo)\n\n`,
    ) +
    tx(
      `1. **高频案件类型**：在注入的样本中，**${m1}**、**${m2}**、**${m3}** 出现频繁/权重靠前，提示当前数据的对抗主要集中在这些案件类型上（可能影响整体胜率与排名稳定性）。\n`,
      `1. **Frequent case types**: In the injected rows, **${m1}**, **${m2}**, **${m3}** appear frequently / with high weight, suggesting the interactions concentrate in these case types.\n`,
    ) +
    tx(
      "2. **两两对抗视角**：优先关注最强的 原告→被告 关系（见证据）。这些配对通常构成网络结构骨架，直观展示“谁经常与谁对抗”。\n",
      "2. **Pairwise-game view**: focus on the strongest plaintiff→defendant pairs (see evidence). These pairs often form the stable backbone of the structure.\n",
    ) +
    tx(
      "3. **避免声誉排名误导**：仅看声誉/规模会忽略真实诉讼结果；用 Bradley–Terry / AHPI 思路可以把“对手强度”和“角色偏置（如被告优势）”纳入统计叙事。\n",
      "3. **Avoid reputation-only rankings**: reputation/size can miss true win-performance; Bradley–Terry / AHPI-style modeling incorporates opponent strength and role bias (e.g., defendant advantage).\n",
    ) +
    tx(
      "4. **可扩展方向**：下一步可以用 LLM 代理从判决书/案卷摘要自动抽取结果、案件类型、法院，扩大样本并保持可追溯（RowId→evidence）。\n\n",
      "4. **Extensions**: use an LLM agent to extract outcomes/case types/courts from opinions to expand the sample while keeping RowId-linked evidence.\n\n",
    ) +
    tx(
      "总结：该演示展示了“导入→筛选→证据链→导出”的可追溯闭环，可作为扩展 Mahari 排名流水线的前端/工程化原型。",
      "Summary: this demo shows a traceable loop (import → filter → evidence → export) as an engineering prototype for scaling Mahari-style ranking pipelines.",
    );

  const payload = {
    claims: [
      {
        id: "C1",
        title: tx("高频案件类型与关键对抗关系可追溯", "Frequent case types and key matchups are traceable"),
        confidence: "high",
        statement_md: tx(
          `- 在注入的样本中 **${m1}**/**${m2}**/**${m3}** 多次出现，提示当前样本集中在这些案件类型；Top 配对可作为后续校正/复核的核心子集。`,
          `- In the injected rows, **${m1}**/**${m2}**/**${m3}** appear repeatedly, suggesting concentration in these case types; top pairs can be a core subset for follow-up checks.`,
        ),
        evidence_row_ids: [e1, e2, e3],
        caveats: [
          tx(
            "演示模式输出；真实研究仍需处理抽样偏差、角色偏置（被告优势）与按案件类型的异质性。",
            "Demo output; real analysis must address sampling bias, role bias (defendant advantage), and case-type heterogeneity.",
          ),
        ],
      },
      {
        id: "C2",
        title: tx("优先复核最常见的 原告→被告 配对", "Prioritize reviewing the most common plaintiff→defendant pairs"),
        confidence: "medium",
        statement_md: tx(
          "- 建议先在网络/矩阵里绑定并复核最强边，再按案件类型/法院/结果分层复核。",
          "- First bind and review the top edges in Network/Matrix, then stratify by CaseType/Court/Outcome.",
        ),
        evidence_row_ids: [e1],
        caveats: [
          tx(
            "边数上限截断会影响结构外观；建议做敏感性分析或按案件类型分层。",
            "Top-edges truncation changes the structure; consider sensitivity analysis or stratifying by case type.",
          ),
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
    draftEmail: {
      subject: tx(
        "提案：基于结果的律所排名 Demo（POC）",
        "Proposal: outcome-based law firm ranking demo (POC)",
      ),
      body_md: tx(
        "Hi Robert,\\n\\n我读了你在 *Nature Computational Science* 上关于“基于结果的律所排名”的论文。我做了一个可分享的前端 Demo，把每个诉讼视作原告/被告律所的两两对抗，并提供一个可追溯的交互闭环（导入 → 筛选 → 证据链洞察 → 可导出报告）。\\n\\n如果你觉得有价值，我也很想进一步讨论：如何扩展到更大的案卷样本；以及如何用 LLM 代理从判决书/摘要中抽取结果、案件类型、法院等元数据来扩大数据集并保持可审计性。\\n\\nBest,\\n[Your Name]",
        "Hi Robert,\\n\\nI read your *Nature Computational Science* paper on outcome-based law firm rankings. I built a small, shareable demo that treats each lawsuit as a plaintiff/defendant pairwise game and provides an interactive workflow (import → filter → evidence-linked insights → exportable report).\\n\\nIf useful, I’d love to discuss how to scale this to larger dockets and how an LLM agent could extract outcomes/case types/courts from raw texts to expand the dataset.\\n\\nBest,\\n[Your Name]",
      ),
    },
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
