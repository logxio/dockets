function topAgg(events, keyFn, n = 8) {
  const m = new Map();
  for (const e of events) {
    const k = (keyFn(e) ?? "").toString().trim();
    if (!k) continue;
    const prev = m.get(k);
    if (prev) {
      prev.weight += e.weight;
      prev.count += 1;
    } else {
      m.set(k, { key: k, weight: e.weight, count: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.weight - a.weight).slice(0, n);
}

function countStats(events, keyFn) {
  const m = new Map();
  for (const e of events) {
    const k = (keyFn(e) ?? "").toString().trim() || "NA";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  const top = rows[0]?.count ?? 0;
  return { rows, topShare: events.length ? top / events.length : 0, hasAny: rows.some((r) => r.key !== "NA") };
}

function aggByCell(events) {
  const m = new Map();
  const ensure = (id) => {
    const prev = m.get(id);
    if (prev) return prev;
    const row = { id, inWeight: 0, outWeight: 0, inCount: 0, outCount: 0, totalWeight: 0 };
    m.set(id, row);
    return row;
  };
  for (const e of events) {
    const s = ensure(e.sender);
    const r = ensure(e.receiver);
    s.outWeight += e.weight;
    s.outCount += 1;
    s.totalWeight += e.weight;
    r.inWeight += e.weight;
    r.inCount += 1;
    r.totalWeight += e.weight;
  }
  const rows = [...m.values()];
  return {
    topSenders: [...rows].sort((a, b) => b.outWeight - a.outWeight).slice(0, 8),
    topReceivers: [...rows].sort((a, b) => b.inWeight - a.inWeight).slice(0, 8),
    topCells: [...rows].sort((a, b) => b.totalWeight - a.totalWeight).slice(0, 8),
    cellCount: rows.length,
  };
}

function aggPairs(events) {
  const m = new Map();
  for (const e of events) {
    const k = `${e.sender}\t${e.receiver}`;
    const prev = m.get(k);
    if (prev) {
      prev.weight += e.weight;
      prev.count += 1;
    } else {
      m.set(k, { sender: e.sender, receiver: e.receiver, weight: e.weight, count: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.weight - a.weight);
}

function annotationStats(events) {
  const m = new Map();
  for (const e of events) {
    const k = (e.annotation ?? "").toString().trim() || "NA";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  const top = rows[0]?.count ?? 0;
  return { rows, topShare: events.length ? top / events.length : 0, hasAny: rows.some((r) => r.key !== "NA") };
}

function densityStats(events) {
  const senders = new Set(events.map((e) => e.sender));
  const receivers = new Set(events.map((e) => e.receiver));
  const pairs = new Set(events.map((e) => `${e.sender}\t${e.receiver}`));
  const denom = Math.max(1, senders.size * receivers.size);
  return {
    rows: events.length,
    senders: senders.size,
    receivers: receivers.size,
    pairs: pairs.size,
    density: pairs.size / denom,
  };
}

export function buildSingleInsights(opts) {
  const events = Array.isArray(opts?.events) ? opts.events : [];
  const qc = [];
  const rec = {};
  const stats = {
    density: densityStats(events),
    outcomes: annotationStats(events),
    caseTypes: countStats(events, (e) => e.metabolite ?? ""),
    courts: countStats(events, (e) => e.sensor ?? ""),
  };

  const weightLabel = "Weight";

  if (stats.outcomes.hasAny && stats.outcomes.topShare > 0.85) {
    qc.push({
      level: "info",
      title: "Outcome skew",
      detail: `A single outcome accounts for ${(stats.outcomes.topShare * 100).toFixed(1)}%. Consider stratifying by case type/court to avoid global conclusions driven by one outcome.`,
    });
  }
  if (stats.density.senders > 120 || stats.density.receivers > 120) {
    qc.push({
      level: "info",
      title: "Too many nodes",
      detail: `Many plaintiff/defendant firms (${stats.density.senders}/${stats.density.receivers}). Consider lowering Top edges or focusing on a firm.`,
    });
  }

  // Recommendations (minimal + actionable)
  rec.topEdges = stats.density.pairs > 800 ? 300 : 500;

  const cells = aggByCell(events);
  const topMet = topAgg(events, (e) => e.metabolite, 8); // CaseType
  const topSens = topAgg(events, (e) => e.sensor, 8); // Court
  const topAnn = topAgg(events, (e) => e.annotation, 6); // Outcome
  const topEdges = aggPairs(events).slice(0, 8);

  const summaryLines = [
    `View: rows=${stats.density.rows}, pairs=${stats.density.pairs}, senders=${stats.density.senders}, receivers=${stats.density.receivers}, density=${stats.density.density.toFixed(3)}`,
    `Weight: ${weightLabel}`,
    stats.outcomes.hasAny
      ? `Outcome: Top=${stats.outcomes.rows[0]?.key} (${(stats.outcomes.topShare * 100).toFixed(1)}%)`
      : "Outcome: NA (missing)",
  ];

  return {
    kind: "single",
    summaryLines,
    qc,
    recommendations: rec,
    top: { ...cells, topMet, topSens, topAnn, topEdges },
    stats,
  };
}

export function buildCompareInsights(opts) {
  const eventsA = Array.isArray(opts?.eventsA) ? opts.eventsA : [];
  const eventsB = Array.isArray(opts?.eventsB) ? opts.eventsB : [];
  const diffRows = Array.isArray(opts?.diffRows) ? opts.diffRows : [];
  const annDiffRows = Array.isArray(opts?.annDiffRows) ? opts.annDiffRows : [];
  const qc = [];
  const rec = {};
  const densityA = densityStats(eventsA);
  const densityB = densityStats(eventsB);
  const gained = diffRows.filter((r) => r.status === "gained").length;
  const lost = diffRows.filter((r) => r.status === "lost").length;
  const shared = diffRows.length - gained - lost;
  const total = diffRows.length || 1;

  const weightLabel = "Weight";

  if (densityA.rows < 50 || densityB.rows < 50) {
    qc.push({
      level: "warn",
      title: "Small sample for compare",
      detail: `One side has too few rows (A=${densityA.rows}, B=${densityB.rows}); the delta network may be unstable. Consider loosening filters or checking import settings.`,
    });
  }

  if ((gained + lost) / total > 0.85 && total >= 100) {
    qc.push({
      level: "info",
      title: "Few shared edges",
      detail: `Under current filters, shared=${shared} (${((shared / total) * 100).toFixed(1)}%). If A/B should be comparable, check that mapping and filters match.`,
    });
  }

  // Recommendations (minimal + actionable)
  rec.topEdges = Math.max(densityA.pairs, densityB.pairs) > 800 ? 300 : 500;

  const summaryLines = [
    `A: rows=${densityA.rows}, pairs=${densityA.pairs}, senders=${densityA.senders}, receivers=${densityA.receivers}`,
    `B: rows=${densityB.rows}, pairs=${densityB.pairs}, senders=${densityB.senders}, receivers=${densityB.receivers}`,
    `Delta: total=${diffRows.length}, gained=${gained}, lost=${lost}`,
    `Weight: ${weightLabel}`,
  ];

  const topUp = [...diffRows].sort((a, b) => b.delta - a.delta).slice(0, 8);
  const topDown = [...diffRows].sort((a, b) => a.delta - b.delta).slice(0, 8);

  return {
    kind: "compare",
    summaryLines,
    qc,
    recommendations: rec,
    top: { topUp, topDown, annDiffRows: annDiffRows.slice(0, 8) },
    stats: { densityA, densityB },
  };
}

export function toMarkdown(insights, title = "Outcome-Based Law Firm Insights") {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`## ${"Summary"}`);
  for (const l of insights.summaryLines ?? []) lines.push(`- ${l}`);
  lines.push("");
  lines.push(`## ${"QC"}`);
  if (!insights.qc?.length) lines.push(`- ${"No issues"}`);
  else for (const q of insights.qc) lines.push(`- [${q.level}] ${q.title}: ${q.detail}`);
  lines.push("");

  if (insights.kind === "single") {
    lines.push(`## ${"Top"}`);
    const top = insights.top ?? {};
    const fmtRow = (r) => `- ${r.key} (w=${r.weight.toFixed(2)}, n=${r.count})`;
    lines.push(`### ${"Top plaintiff firms"}`);
    for (const r of top.topSenders ?? []) lines.push(`- ${r.id} (out=${r.outWeight.toFixed(2)}, n=${r.outCount})`);
    lines.push(`### ${"Top defendant firms"}`);
    for (const r of top.topReceivers ?? []) lines.push(`- ${r.id} (in=${r.inWeight.toFixed(2)}, n=${r.inCount})`);
    lines.push(`### ${"Top case types"}`);
    for (const r of top.topMet ?? []) lines.push(fmtRow(r));
    lines.push(`### ${"Top courts"}`);
    for (const r of top.topSens ?? []) lines.push(fmtRow(r));
    lines.push(`### ${"Top edges (aggregated)"}`);
    for (const r of top.topEdges ?? []) lines.push(`- ${r.sender} → ${r.receiver} (w=${r.weight.toFixed(2)}, n=${r.count})`);
  } else {
    lines.push(`## ${"Compare Top Δ"}`);
    lines.push(`### ${"Top increased (B-A)"}`);
    for (const r of insights.top?.topUp ?? []) lines.push(`- ${r.sender} → ${r.receiver} (Δ=${r.delta.toFixed(2)})`);
    lines.push(`### ${"Top decreased (B-A)"}`);
    for (const r of insights.top?.topDown ?? []) lines.push(`- ${r.sender} → ${r.receiver} (Δ=${r.delta.toFixed(2)})`);
    lines.push(`### ${"By Outcome"}`);
    for (const r of insights.top?.annDiffRows ?? []) lines.push(`- ${r.key} (Δ=${r.delta.toFixed(2)})`);
  }

  lines.push("");
  return lines.join("\n");
}
