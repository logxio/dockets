function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmt(n, digits = 3) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function countBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const REPORT_CSS = `
  <meta name="color-scheme" content="light dark" />
  <style>
    :root {
      --bg: #f6f8fc;
      --card: #ffffff;
      --fg: #0f172a;
      --muted: #64748b;
      --bd: rgba(15,23,42,.14);
      --th-bg: rgba(248,250,252,.9);
      --th-fg: rgba(15,23,42,.72);
      --row-even: rgba(248,250,252,.55);
      --row-hover: rgba(8,145,178,.07);

      --info-bg: rgba(8,145,178,.07);
      --info-bd: rgba(8,145,178,.20);
      --info-title: rgba(8,145,178,.96);
      --info-fg: rgba(15,23,42,.86);

      --warn-bg: rgba(220,38,38,.05);
      --warn-bd: rgba(220,38,38,.18);
      --warn-title: rgba(153,27,27,.96);
      --warn-fg: rgba(15,23,42,.86);
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: rgba(10, 10, 10, 0.98);
        --card: rgba(15, 23, 42, 0.92);
        --fg: rgba(248, 250, 252, 0.96);
        --muted: rgba(248, 250, 252, 0.72);
        --bd: rgba(226, 232, 240, 0.14);
        --th-bg: rgba(2, 6, 23, 0.92);
        --th-fg: rgba(248, 250, 252, 0.82);
        --row-even: rgba(30, 41, 59, 0.45);
        --row-hover: rgba(0, 212, 255, 0.08);

        --info-bg: rgba(0, 212, 255, 0.10);
        --info-bd: rgba(0, 212, 255, 0.24);
        --info-title: rgba(0, 212, 255, 0.96);
        --info-fg: rgba(224, 242, 254, 0.92);

        --warn-bg: rgba(239, 68, 68, 0.08);
        --warn-bd: rgba(239, 68, 68, 0.22);
        --warn-title: rgba(252, 165, 165, 0.96);
        --warn-fg: rgba(248, 250, 252, 0.92);
      }
    }

    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      background: var(--bg);
      color: var(--fg);
    }

    .wrap { max-width: 980px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 18px; margin: 0; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    .two { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }

    .card { background: var(--card); border:1px solid var(--bd); border-radius: 14px; padding: 12px; }
    .k { color: var(--muted); font-size: 12px; }
    .v { font-weight: 700; margin-top: 4px; }
    pre { white-space: pre-wrap; font-size: 12px; color: var(--muted); margin: 0; }

    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; border-bottom: 1px solid var(--bd); padding: 8px 8px; }
    th { color: var(--th-fg); font-weight: 700; background: var(--th-bg); }
    tbody tr:nth-child(even) { background: var(--row-even); }
    tbody tr:hover { background: var(--row-hover); }
    .section { margin-top: 14px; }
  </style>
`;

export function summarizeDataset(events) {
  const senders = new Set(events.map((e) => e.sender));
  const receivers = new Set(events.map((e) => e.receiver));
  const caseTypes = countBy(events, (e) => (e.metabolite ?? "") || "NA");
  const courts = countBy(events, (e) => (e.sensor ?? "") || "NA");
  const outcomes = countBy(events, (e) => (e.annotation ?? "") || "NA");
  return {
    rows: events.length,
    senders: senders.size,
    receivers: receivers.size,
    caseTypes,
    courts,
    outcomes,
  };
}

function tableFromRows(rows, headers, rowFn) {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const trs = rows.map((r) => `<tr>${rowFn(r).map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function renderRankingsTable(rows, title) {
  if (!rows?.length) return "";
  const top = rows.slice(0, 20);
  const t = tableFromRows(top, ["Rank", "Firm", "Score", "ExpScore"], (r) => [
    typeof r.Rank === "number" && Number.isFinite(r.Rank) ? String(r.Rank) : "—",
    r.Firm ?? "",
    fmt(typeof r.Score === "number" ? r.Score : NaN, 3),
    fmt(typeof r.ExpScore === "number" ? r.ExpScore : NaN, 3),
  ]);
  return `<div class="section card">
    <div class="k">${escapeHtml(title)}</div>
    ${t}
    <div class="k" style="margin-top: 6px;">${escapeHtml(
      `Showing top ${Math.min(20, rows.length)} (of ${rows.length}).`,
    )}</div>
  </div>`;
}

export function generateRankingsReport({ title, query, onlyPresent, presentFirmsCount, rows }) {
  const now = new Date().toISOString();
  const q = (query ?? "").trim();
  const flags = { query: q || "", onlyPresent: !!onlyPresent, presentFirmsCount: presentFirmsCount ?? 0, rows: rows?.length ?? 0 };
  const table = tableFromRows((rows ?? []).slice(0, 200), ["Rank", "Firm", "Score", "ExpScore"], (r) => [
    typeof r.Rank === "number" && Number.isFinite(r.Rank) ? String(r.Rank) : "—",
    r.Firm ?? "",
    fmt(typeof r.Score === "number" ? r.Score : NaN, 3),
    fmt(typeof r.ExpScore === "number" ? r.ExpScore : NaN, 3),
  ]);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title ?? "Law firm rankings report (rankings)")}</title>
  ${REPORT_CSS}
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(title ?? "Law firm rankings report (rankings)")}</h1>
    <div class="sub">${escapeHtml(
      `${now} · Showing top ${Math.min(200, rows?.length ?? 0)} (of ${rows?.length ?? 0})`,
    )}</div>

    <div class="section card">
      <div class="k">${escapeHtml("Filters")}</div>
      <pre>${escapeHtml(JSON.stringify(flags, null, 2))}</pre>
    </div>

    <div class="section card">
      <div class="k">${escapeHtml("Rankings table")}</div>
      ${table}
      <div class="k" style="margin-top: 6px;">${escapeHtml(
        "Note: this page exports the current sorted list (including search/linked filters).",
      )}</div>
    </div>
  </div>
</body>
</html>`;
}

function listFromLines(lines) {
  if (!lines?.length) return "<div class='k'>—</div>";
  return `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
}

function renderQc(qc) {
  if (!qc?.length) return `<div class='k'>${escapeHtml("No notable issues")}</div>`;
  const items = qc
    .map((q) => {
      const tone = q.level === "warn" ? "var(--warn-title)" : "var(--info-title)";
      const bg = q.level === "warn" ? "var(--warn-bg)" : "var(--info-bg)";
      const bd = q.level === "warn" ? "var(--warn-bd)" : "var(--info-bd)";
      const fg = q.level === "warn" ? "var(--warn-fg)" : "var(--info-fg)";
      return `<div style="border:1px solid ${bd}; background:${bg}; border-radius: 12px; padding: 10px 12px; margin-top: 10px;">
        <div style="font-weight: 800; color:${tone}">[${escapeHtml(q.level)}] ${escapeHtml(q.title)}</div>
        <div style="margin-top: 6px; color: ${fg};">${escapeHtml(q.detail)}</div>
      </div>`;
    })
    .join("");
  return items;
}

function renderInsights(insights) {
  if (!insights) return "";
  const rec = insights.recommendations && Object.keys(insights.recommendations).length ? JSON.stringify(insights.recommendations, null, 2) : "";
  return `<div class="section card">
    <div class="k">${escapeHtml("Auto summary & QC")}</div>
    <div style="margin-top: 8px;">
      <div class="k" style="margin-bottom: 6px;">${escapeHtml("Summary")}</div>
      ${listFromLines(insights.summaryLines)}
    </div>
    <div style="margin-top: 12px;">
      <div class="k">QC</div>
      ${renderQc(insights.qc)}
    </div>
    ${
      rec
        ? `<div style="margin-top: 12px;">
        <div class="k">${escapeHtml("Recommendations")}</div>
        <pre>${escapeHtml(rec)}</pre>
      </div>`
        : ""
    }
  </div>`;
}

function renderRobustness(robustness) {
  if (!robustness) return "";
  const warnings = (robustness.warnings ?? []).map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  const pairRows = (robustness.stability?.pairs ?? []).slice(0, 10);
  const metRows = (robustness.stability?.metabolites ?? []).slice(0, 10);

  const pairTable = tableFromRows(pairRows, ["Plaintiff", "Defendant", "Support", "avgRank"], (r) => [
    r.sender,
    r.receiver,
    `${Math.round((r.support ?? 0) * 100)}%`,
    typeof r.avgRank === "number" && Number.isFinite(r.avgRank) ? r.avgRank.toFixed(1) : "—",
  ]);
  const metTable = tableFromRows(metRows, ["Case type", "Support", "avgRank"], (r) => [
    r.metabolite,
    `${Math.round((r.support ?? 0) * 100)}%`,
    typeof r.avgRank === "number" && Number.isFinite(r.avgRank) ? r.avgRank.toFixed(1) : "—",
  ]);

  return `<div class="section card">
    <div class="k">${escapeHtml("Robustness appendix")}</div>
    <div style="margin-top: 6px; color: var(--info-fg); font-weight: 800;">
      variants=${escapeHtml(String(robustness.variants ?? "NA"))} · TopK=${escapeHtml(String(robustness.topK ?? "NA"))}
    </div>
    ${
      warnings
        ? `<div style="margin-top: 10px; border:1px solid var(--warn-bd); background: var(--warn-bg); border-radius: 12px; padding: 10px 12px;">
        <div style="font-weight: 800; color: var(--warn-title);">${escapeHtml("Warnings")}</div>
        <ul style="margin: 6px 0 0; padding-left: 18px;">${warnings}</ul>
      </div>`
        : `<div style="margin-top: 10px; border:1px solid var(--info-bd); background: var(--info-bg); border-radius: 12px; padding: 10px 12px; color: var(--info-title);">${escapeHtml(
            "No obvious instability detected (still review with raw data and domain knowledge).",
          )}</div>`
    }
    <div class="two section">
      <div class="card"><div class="k">${escapeHtml("Baseline: top pairs stability")}</div>${pairTable}</div>
      <div class="card"><div class="k">${escapeHtml("Baseline: top case types stability")}</div>${metTable}</div>
    </div>
  </div>`;
}

function renderNullControl(nullControl) {
  if (!nullControl) return "";
  const p = typeof nullControl.pValue === "number" ? nullControl.pValue : NaN;
  const verdict = Number.isFinite(p) && p < 0.05 ? "significant (non-random)" : "not significant (be cautious)";
  return `<div class="section card">
    <div class="k">${escapeHtml("Null control appendix")}</div>
    <pre>${escapeHtml(
      JSON.stringify(
        {
          metric: nullControl.metric,
          observed: nullControl.observed,
          mean: nullControl.mean,
          sd: nullControl.sd,
          n: nullControl.n,
          pValue: nullControl.pValue,
          verdict,
        },
        null,
        2,
      ),
    )}</pre>
    <div class="k">${escapeHtml(nullControl.note ?? "")}</div>
  </div>`;
}

export function generateSingleReport({
  fileName,
  filters,
  summary,
  topNodes,
  topLinks,
  insights,
  robustness,
  nullControl,
  rankingsTop,
  rankingsForTopNodes,
}) {
  const now = new Date().toISOString();
  const wm = "Weight";

  const caseTypeTable = tableFromRows(summary.caseTypes.slice(0, 8), ["Case type", "Count"], ([k, v]) => [k, String(v)]);
  const outcomeTable = tableFromRows(summary.outcomes.slice(0, 8), ["Outcome", "Count"], ([k, v]) => [k, String(v)]);
  const courtTable = tableFromRows(summary.courts.slice(0, 8), ["Court", "Count"], ([k, v]) => [k, String(v)]);

  const nodeTable = tableFromRows(topNodes.slice(0, 12), ["Firm", "Total weight"], (n) => [n.id, fmt(n.weight, 2)]);
  const linkTable = tableFromRows(topLinks.slice(0, 12), ["Plaintiff", "Defendant", "Weight", "Count"], (l) => [
    l.source,
    l.target,
    fmt(l.weight, 2),
    String(l.count),
  ]);
  const insightsHtml = renderInsights(insights);
  const robustnessHtml = renderRobustness(robustness);
  const nullHtml = renderNullControl(nullControl);
  const rankingsHtml = [
    renderRankingsTable(rankingsForTopNodes, "AHPI rankings (top firms in current network)"),
    renderRankingsTable(rankingsTop, "AHPI rankings (global top firms)"),
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml("Law firm rankings report")}</title>
  ${REPORT_CSS}
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml("Outcome-based law firm rankings explorer · report (single)")}</h1>
    <div class="sub">${escapeHtml(fileName ?? "untitled")} · ${escapeHtml(now)} · weight=${escapeHtml(wm)}</div>

    <div class="grid">
      <div class="card"><div class="k">${escapeHtml("Rows")}</div><div class="v">${summary.rows}</div></div>
      <div class="card"><div class="k">${escapeHtml("Unique plaintiff/defendant firms")}</div><div class="v">${summary.senders} / ${summary.receivers}</div></div>
    </div>

    <div class="section card">
      <div class="k">${escapeHtml("Filters (shareable)")}</div>
      <pre>${escapeHtml(JSON.stringify(filters, null, 2))}</pre>
    </div>

    ${insightsHtml}
    ${robustnessHtml}
    ${nullHtml}
    ${rankingsHtml}

    <div class="section two">
      <div class="card">
        <div class="k">${escapeHtml("Case type distribution")}</div>
        ${caseTypeTable}
      </div>
      <div class="card">
        <div class="k">${escapeHtml("Outcome distribution")}</div>
        ${outcomeTable}
      </div>
    </div>

    <div class="section card">
      <div class="k">${escapeHtml("Court distribution")}</div>
      ${courtTable}
    </div>

    <div class="section two">
      <div class="card">
        <div class="k">${escapeHtml("Top nodes (total weight)")}</div>
        ${nodeTable}
      </div>
      <div class="card">
        <div class="k">${escapeHtml("Top edges (aggregated)")}</div>
        ${linkTable}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function generateCompareReport({ fileA, fileB, filters, summaryA, summaryB, diffRows, insights, rankingsTop }) {
  const now = new Date().toISOString();
  const wm = "Weight";
  const top = diffRows.slice(0, 20);
  const diffTable = tableFromRows(
    top,
    ["Plaintiff", "Defendant", "A", "B", "Δ(B-A)", "log2FC", "status"],
    (r) => [
    r.sender,
    r.receiver,
    fmt(r.weightA, 2),
    fmt(r.weightB, 2),
    fmt(r.delta, 2),
    fmt(r.log2fc, 2),
    r.status,
    ],
  );

  const annTable = summaryA.annDiffRows
    ? tableFromRows(summaryA.annDiffRows.slice(0, 10), ["Outcome", "A", "B", "Δ(B-A)"], (r) => [
        r.key,
        fmt(r.weightA, 2),
        fmt(r.weightB, 2),
        fmt(r.delta, 2),
      ])
    : "";
  const insightsHtml = renderInsights(insights);
  const rankingsHtml = renderRankingsTable(rankingsTop, "AHPI rankings (global top firms)");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml("Law firm rankings compare report")}</title>
  ${REPORT_CSS}
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml("Outcome-based law firm rankings explorer · report (compare)")}</h1>
    <div class="sub">${escapeHtml(fileA ?? "A")} vs ${escapeHtml(fileB ?? "B")} · ${escapeHtml(now)} · weight=${escapeHtml(wm)}</div>

    <div class="grid">
      <div class="card">
        <div class="k">${escapeHtml("Dataset A")}</div>
        <div class="v">${summaryA.rows} ${escapeHtml("rows")} · ${summaryA.senders}/${summaryA.receivers} ${escapeHtml("plaintiff/defendant firms")}</div>
      </div>
      <div class="card">
        <div class="k">${escapeHtml("Dataset B")}</div>
        <div class="v">${summaryB.rows} ${escapeHtml("rows")} · ${summaryB.senders}/${summaryB.receivers} ${escapeHtml("plaintiff/defendant firms")}</div>
      </div>
    </div>

    <div class="section card">
      <div class="k">${escapeHtml("Filters (shareable)")}</div>
      <pre>${escapeHtml(JSON.stringify(filters, null, 2))}</pre>
    </div>

    ${insightsHtml}
    ${rankingsHtml}

    <div class="section card">
      <div class="k">${escapeHtml("Stratified Δ summary")}</div>
      <div style="display:grid; grid-template-columns: 1fr; gap: 12px; margin-top: 10px;">
        <div>
          <div class="k">${escapeHtml("By outcome")}</div>
          ${annTable || "<div class='k'>—</div>"}
        </div>
      </div>
    </div>

    <div class="section card">
      <div class="k">${escapeHtml("Top Δ edges (by |Δ|)")}</div>
      ${diffTable}
    </div>
  </div>
</body>
</html>`;
}

export function downloadHtml(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename, obj) {
  downloadText(filename, JSON.stringify(obj, null, 2), "application/json;charset=utf-8");
}

export function downloadTsv(filename, rows, headers) {
  const lines = [headers.join("\t")];
  for (const r of rows) lines.push(headers.map((h) => String(r[h] ?? "")).join("\t"));
  const blob = new Blob([lines.join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
