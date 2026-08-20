import { normalizeLabel, toNumber } from "./parse.js";

function toFiniteNumber(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function deriveRowId(raw, idx) {
  const candidates = ["RowId", "rowId", "row_id", "ROW_ID", "rowid", "ROWID"];
  for (const k of candidates) {
    if (raw && Object.prototype.hasOwnProperty.call(raw, k)) {
      const n = toFiniteNumber(raw[k]);
      if (Number.isFinite(n) && n > 0) return Math.trunc(n);
    }
  }
  return idx + 1;
}

function pickCaseId(raw) {
  const candidates = ["CaseId", "caseId", "case_id", "CASE_ID", "ID", "id_number", "idNumber"];
  for (const k of candidates) {
    if (raw && Object.prototype.hasOwnProperty.call(raw, k)) {
      const v = raw[k];
      const s = String(v ?? "").trim();
      if (s) return s;
    }
  }
  return "";
}

function pushLimited(arr, value, limit = 120) {
  if (!Array.isArray(arr)) return;
  if (arr.length >= limit) return;
  arr.push(value);
}

export function buildEvents(rows, mapping) {
  const report = {
    totalRows: rows.length,
    keptRows: 0,
    droppedMissingSenderReceiver: 0,
    nonNumericFdr: 0,
    nonNumericScore: 0,
    nonPositiveFdr: 0,
    zeroFdr: 0,
    fdrOver1: 0,
    fluxPassMissing: 0,
  };

  const events = [];
  for (let idx = 0; idx < rows.length; idx += 1) {
    const raw = rows[idx];
    const sender = normalizeLabel(raw[mapping.sender]);
    const receiver = normalizeLabel(raw[mapping.receiver]);
    if (!sender || !receiver) {
      report.droppedMissingSenderReceiver += 1;
      continue;
    }

    const rowId = deriveRowId(raw, idx);
    const caseId = pickCaseId(raw);

    const metabolite = mapping.metabolite ? normalizeLabel(raw[mapping.metabolite]) : "";
    const sensor = mapping.sensor ? normalizeLabel(raw[mapping.sensor]) : "";
    const fluxPass = mapping.fluxPass ? normalizeLabel(raw[mapping.fluxPass]) : "";
    const annotation = mapping.annotation ? normalizeLabel(raw[mapping.annotation]) : "";

    const fdrRaw = mapping.fdr ? raw[mapping.fdr] : undefined;
    const scoreRaw = mapping.score ? raw[mapping.score] : undefined;
    let fdr = mapping.fdr ? toNumber(fdrRaw) : undefined;
    const score = mapping.score ? toNumber(scoreRaw) : undefined;

    if (mapping.fdr && fdrRaw !== undefined && fdr === undefined) report.nonNumericFdr += 1;
    if (mapping.score && scoreRaw !== undefined && score === undefined) report.nonNumericScore += 1;

    if (typeof fdr === "number") {
      if (fdr < 0) {
        report.nonPositiveFdr += 1;
        fdr = undefined;
      } else if (fdr === 0) {
        // A finite permutation run reports 0 when the true value is just below its resolution.
        report.zeroFdr += 1;
        fdr = 1e-300;
      } else if (fdr > 1) {
        report.fdrOver1 += 1;
        fdr = undefined;
      }
    }

    const weight = typeof score === "number" ? score : 1;

    if (mapping.fluxPass && !fluxPass) report.fluxPassMissing += 1;

    events.push({
      rowId,
      caseId: caseId || undefined,
      sender,
      receiver,
      metabolite: metabolite || undefined,
      sensor: sensor || undefined,
      fdr,
      score,
      weight,
      fluxPass: fluxPass || undefined,
      annotation: annotation || undefined,
      raw,
    });
    report.keptRows += 1;
  }

  return { events, report };
}

export function summarizeWarnings(report, mapping) {
  const warnings = [];
  if (!mapping.score)
    warnings.push(
      "Weight is not mapped: visualization weight falls back to 1 (consider providing a numeric column such as Weight/Stake/Amount).",
    );
  if (mapping.fdr && report.nonPositiveFdr)
    warnings.push(`Found ${report.nonPositiveFdr} rows with FDR<0 (treated as missing).`);
  if (mapping.fdr && report.fdrOver1)
    warnings.push(
      `Found ${report.fdrOver1} rows with FDR>1 (treated as missing; verify that this column is really FDR).`,
    );
  if (report.droppedMissingSenderReceiver)
    warnings.push(
      `${report.droppedMissingSenderReceiver} rows are missing Plaintiff/Defendant firm (skipped).`,
    );
  if (mapping.fdr && report.nonNumericFdr)
    warnings.push(`${report.nonNumericFdr} rows have non-numeric FDR (treated as missing).`);
  if (mapping.score && report.nonNumericScore)
    warnings.push(
      `${report.nonNumericScore} rows have non-numeric Weight (treated as missing).`,
    );
  if (mapping.fluxPass && report.fluxPassMissing)
    warnings.push(
      `${report.fluxPassMissing} rows have empty Flux_PASS (won't be matched by the PASS-only filter).`,
    );
  return warnings;
}

export function filterEvents(events, filters) {
  const mq = (filters.metaboliteQuery ?? "").trim().toLowerCase();
  const sq = (filters.sensorQuery ?? "").trim().toLowerCase();
  const focus = filters.focusCell?.trim();
  const flux = filters.fluxPass ?? "all";
  const ann = (filters.annotationQuery ?? "").trim().toLowerCase();

  let out = events.filter((e) => {
    if (!filters.includeSelfLoops && e.sender === e.receiver) return false;

    if (focus) {
      if (filters.focusMode === "outgoing" && e.sender !== focus) return false;
      if (filters.focusMode === "incoming" && e.receiver !== focus) return false;
      if ((!filters.focusMode || filters.focusMode === "any") && e.sender !== focus && e.receiver !== focus) return false;
    }

    if (typeof filters.fdrMax === "number" && typeof e.fdr === "number" && e.fdr > filters.fdrMax) return false;
    if (mq && !(e.metabolite ?? "").toLowerCase().includes(mq)) return false;
    if (sq && !(e.sensor ?? "").toLowerCase().includes(sq)) return false;
    if (ann && !(e.annotation ?? "").toLowerCase().includes(ann)) return false;
    const fp = (e.fluxPass ?? "").toUpperCase();
    // If dataset doesn't have Flux_PASS (empty), do not drop by flux filter.
    if (fp) {
      if (flux === "pass" && fp !== "PASS") return false;
      if (flux === "unpass" && fp === "PASS") return false;
    }
    return true;
  });

  if (typeof filters.topEdges === "number" && filters.topEdges > 0) {
    out = [...out].sort((a, b) => b.weight - a.weight).slice(0, filters.topEdges);
  }

  return out;
}

export function computeSelectionSummary(events) {
  const nodeMap = new Map();
  const linkMap = new Map();
  const pairMap = new Map(); // key sender\treceiver -> {weight,count,rowIds}

  const ensureNode = (id) => {
    const prev = nodeMap.get(id);
    if (prev) return prev;
    const node = { id, weight: 0, in: 0, out: 0, inCount: 0, outCount: 0 };
    nodeMap.set(id, node);
    return node;
  };

  for (const e of events) {
    const sender = ensureNode(e.sender);
    const receiver = ensureNode(e.receiver);
    sender.weight += e.weight;
    receiver.weight += e.weight;
    sender.out += e.weight;
    receiver.in += e.weight;
    sender.outCount += 1;
    receiver.inCount += 1;

    const lk = `${e.sender}→${e.receiver}`;
    const prevLink = linkMap.get(lk);
    if (prevLink) {
      prevLink.weight += e.weight;
      prevLink.count += 1;
      pushLimited(prevLink.rowIds, e.rowId);
    } else {
      linkMap.set(lk, { source: e.sender, target: e.receiver, weight: e.weight, count: 1, rowIds: [e.rowId] });
    }

    const pk = `${e.sender}\t${e.receiver}`;
    const prevPair = pairMap.get(pk);
    if (prevPair) {
      prevPair.weight += e.weight;
      prevPair.count += 1;
      pushLimited(prevPair.rowIds, e.rowId);
    } else {
      pairMap.set(pk, { weight: e.weight, count: 1, rowIds: [e.rowId] });
    }
  }

  const nodes = [...nodeMap.values()].sort((a, b) => b.weight - a.weight);
  const links = [...linkMap.values()].sort((a, b) => b.weight - a.weight);

  const senders = new Set();
  const receivers = new Set();
  for (const l of links) {
    senders.add(l.source);
    receivers.add(l.target);
  }

  const matrix = {
    senders: [...senders],
    receivers: [...receivers],
    pairs: pairMap,
  };

  // per-cell details
  const byCell = new Map();
  for (const n of nodes) {
    byCell.set(n.id, {
      id: n.id,
      totalWeight: n.weight,
      inWeight: n.in,
      outWeight: n.out,
      inCount: n.inCount,
      outCount: n.outCount,
    });
  }

  return { nodes, links, matrix, byCell };
}

export function computeDetailsForCell(events, cellId) {
  const outgoingPartners = new Map();
  const incomingPartners = new Map();
  const metaboliteAgg = new Map();
  const sensorAgg = new Map();
  const annotationAgg = new Map();
  const fluxAgg = new Map();

  const bump = (map, key, weight, rowId) => {
    if (!key) return;
    const prev = map.get(key);
    if (prev) {
      prev.weight += weight;
      prev.count += 1;
      pushLimited(prev.rowIds, rowId);
    } else {
      map.set(key, { key, weight, count: 1, rowIds: [rowId] });
    }
  };

  for (const e of events) {
    if (e.sender === cellId) {
      bump(outgoingPartners, e.receiver, e.weight, e.rowId);
      bump(metaboliteAgg, e.metabolite, e.weight, e.rowId);
      bump(sensorAgg, e.sensor, e.weight, e.rowId);
      bump(annotationAgg, e.annotation, e.weight, e.rowId);
      bump(fluxAgg, e.fluxPass, e.weight, e.rowId);
    }
    if (e.receiver === cellId) {
      bump(incomingPartners, e.sender, e.weight, e.rowId);
      bump(metaboliteAgg, e.metabolite, e.weight, e.rowId);
      bump(sensorAgg, e.sensor, e.weight, e.rowId);
      bump(annotationAgg, e.annotation, e.weight, e.rowId);
      bump(fluxAgg, e.fluxPass, e.weight, e.rowId);
    }
  }

  const top = (map) =>
    [...map.values()].sort((a, b) => b.weight - a.weight).slice(0, 12);

  return {
    outgoingPartners: top(outgoingPartners),
    incomingPartners: top(incomingPartners),
    metabolites: top(metaboliteAgg),
    sensors: top(sensorAgg),
    annotations: top(annotationAgg),
    fluxPass: top(fluxAgg),
  };
}
