import React from "react";
import CitationBadge from "./CitationBadge";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function sigmoid(x) {
  const z = typeof x === "number" && Number.isFinite(x) ? x : 0;
  if (z > 50) return 1;
  if (z < -50) return 0;
  return 1 / (1 + Math.exp(-z));
}

function num(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function fmtPct(p) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

function normalizeFirm(v) {
  return String(v ?? "").trim();
}

function scoreMapFromRankings(rankings) {
  const m = new Map();
  for (const r of Array.isArray(rankings) ? rankings : []) {
    const firm = normalizeFirm(r?.Firm);
    const s = num(r?.Score);
    if (!firm || !Number.isFinite(s)) continue;
    if (!m.has(firm)) m.set(firm, s);
  }
  return m;
}

function predictDefWinProba({ defScore, plaScore, privilege = 0, valence = 0.5 }) {
  const sDef = num(defScore);
  const sPla = num(plaScore);
  if (!Number.isFinite(sDef) || !Number.isFinite(sPla)) return undefined;
  const eps = num(privilege) ?? 0;
  const q = clamp01(num(valence) ?? 0.5);
  const diff = sDef + eps - sPla;
  const probFavoured = sigmoid(diff);
  return probFavoured * q + (1 - probFavoured) * (1 - q);
}

export default function CounterfactualView({
  events,
  rankings,
  caseTypeValence,
  caseTypePrivilege,
  selectedPair,
  onSelectPair,
  onOpenEvidence,
}) {
  const scoreByFirm = React.useMemo(() => scoreMapFromRankings(rankings), [rankings]);

  const eventsByRowId = React.useMemo(() => {
    const m = new Map();
    for (const e of Array.isArray(events) ? events : []) {
      const id = num(e?.rowId);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!m.has(id)) m.set(id, e);
    }
    return m;
  }, [events]);

  const firms = React.useMemo(() => {
    const set = new Set();
    for (const e of Array.isArray(events) ? events : []) {
      if (e?.sender) set.add(String(e.sender));
      if (e?.receiver) set.add(String(e.receiver));
    }
    const arr = [...set];
    arr.sort((a, b) => a.localeCompare(b));
    return arr;
  }, [events]);

  const [rowIdInput, setRowIdInput] = React.useState("");
  const [activeRowId, setActiveRowId] = React.useState(null);
  const [newPlaintiff, setNewPlaintiff] = React.useState("");

  React.useEffect(() => {
    if (!selectedPair?.sender || !selectedPair?.receiver) return;
    const hit =
      Array.isArray(events) && events.length
        ? [...events]
            .filter((e) => e?.sender === selectedPair.sender && e?.receiver === selectedPair.receiver)
            .sort((a, b) => (num(b?.weight) ?? 0) - (num(a?.weight) ?? 0))[0]
        : null;
    if (!hit) return;
    const rid = num(hit.rowId);
    if (!Number.isFinite(rid)) return;
    setActiveRowId(rid);
    setRowIdInput(String(rid));
    setNewPlaintiff(String(hit.sender ?? ""));
  }, [events, selectedPair?.sender, selectedPair?.receiver]);

  const activeEvent = React.useMemo(() => (activeRowId ? eventsByRowId.get(activeRowId) ?? null : null), [eventsByRowId, activeRowId]);

  const caseType = String(activeEvent?.metabolite ?? "");
  const defFirm = String(activeEvent?.receiver ?? "");
  const plaFirm = String(activeEvent?.sender ?? "");

  const q = caseType ? caseTypeValence?.get?.(caseType) : undefined;
  const eps = caseType ? caseTypePrivilege?.get?.(caseType) : undefined;

  const defScore = defFirm ? scoreByFirm.get(defFirm) : undefined;
  const plaScore = plaFirm ? scoreByFirm.get(plaFirm) : undefined;
  const newPlaScore = newPlaintiff ? scoreByFirm.get(newPlaintiff) : undefined;

  const p0 = React.useMemo(
    () => predictDefWinProba({ defScore, plaScore, privilege: eps, valence: q }),
    [defScore, plaScore, eps, q],
  );
  const p1 = React.useMemo(
    () => predictDefWinProba({ defScore, plaScore: newPlaScore, privilege: eps, valence: q }),
    [defScore, newPlaScore, eps, q],
  );
  const delta = typeof p0 === "number" && typeof p1 === "number" ? p1 - p0 : undefined;

  const runLoad = () => {
    const rid = num(rowIdInput);
    if (!Number.isFinite(rid) || rid <= 0) return;
    if (!eventsByRowId.has(rid)) return;
    setActiveRowId(rid);
    const e = eventsByRowId.get(rid);
    setNewPlaintiff(String(e?.sender ?? ""));
  };

  const hasRankings = Array.isArray(rankings) && rankings.length;

  return (
    <div className="viz-scroll">
      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title">What-if (Counterfactual)</div>
            <div className="card-sub">
              Pick a RowId (case row) → replace the plaintiff firm → see the change in predicted defendant win probability.
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="pill">
              rankings: {hasRankings ? "loaded" : "missing"}
            </span>
            <span className="pill">
              case-type params: {caseTypeValence?.size ? "loaded" : "missing"}
            </span>
          </div>
        </div>

        {!hasRankings ? (
          <div className="warning" style={{ marginTop: 10 }}>
            Missing `/sample/mahari_exp_scores.csv` (or empty): probability prediction is disabled; only evidence/fields are available.
          </div>
        ) : null}

        <div style={{ height: 10 }} />

        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: 260 }}>
            <div className="label">RowId</div>
            <input
              className="input"
              placeholder="e.g. 123"
              value={rowIdInput}
              onChange={(e) => setRowIdInput(e.target.value)}
              onKeyDown={(e) => (e.key === "Enter" ? runLoad() : null)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Tip: click an edge in Network/Matrix/DotPlot to auto-fill a RowId.
            </div>
          </div>
          <button className="btn" type="button" onClick={runLoad}>
            Load
          </button>
          {activeRowId ? (
            <CitationBadge
              rowIds={[activeRowId]}
              onOpenEvidence={(ids) =>
                typeof onOpenEvidence === "function" ? onOpenEvidence(ids, `RowId ${ids[0]} · evidence`) : null
              }
            />
          ) : null}
        </div>
      </div>

      {activeEvent ? (
        <div className="card pad" style={{ marginTop: 12, boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="card-title">Selected case row</div>
              <div className="card-sub">
                RowId {activeRowId}
                {activeEvent?.caseId ? ` · CaseId ${activeEvent.caseId}` : ""}
              </div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn small"
                type="button"
                onClick={() => (typeof onSelectPair === "function" ? onSelectPair({ sender: plaFirm, receiver: defFirm }) : null)}
              >
                Bind to graph (edge)
              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="metric" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <div className="k">Plaintiff</div>
              <div className="v" style={{ fontSize: 13 }}>
                {plaFirm || "—"}
              </div>
            </div>
            <div>
              <div className="k">Defendant</div>
              <div className="v" style={{ fontSize: 13 }}>
                {defFirm || "—"}
              </div>
            </div>
            <div>
              <div className="k">Case type</div>
              <div className="v" style={{ fontSize: 13 }}>
                {caseType || "—"}
              </div>
            </div>
          </div>

          <div style={{ height: 10 }} />

          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 360, flex: "1 1 360px" }}>
              <div className="label">Counterfactual: replace plaintiff with</div>
              <input className="input" list="whatif-firms" value={newPlaintiff} onChange={(e) => setNewPlaintiff(e.target.value)} />
              <datalist id="whatif-firms">
                {firms.slice(0, 2000).map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                You can type any firm; if it is missing from the rankings table, probability will be shown as “—”.
              </div>
            </div>

            <div className="card pad soft" style={{ boxShadow: "none", flex: "1 1 320px", minWidth: 320 }}>
              <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800 }}>Predicted defendant win probability</div>
                <span className="pill">
                  q={typeof q === "number" ? q.toFixed(3) : "0.500"} · eps={typeof eps === "number" ? eps.toFixed(3) : "0.000"}
                </span>
              </div>
              <div style={{ height: 10 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <div className="label">Original</div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{fmtPct(p0)}</div>
                </div>
                <div>
                  <div className="label">Counterfactual</div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{fmtPct(p1)}</div>
                </div>
                <div>
                  <div className="label">Δ (pp)</div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    {typeof delta === "number" ? `${(delta * 100).toFixed(1)}pp` : "—"}
                  </div>
                </div>
              </div>

              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                Note: uses rankings `Score` + optional case-type `ValenceProb/Privilege` for an AHPI-style probability; meant as a demo-grade what-if intuition.
              </div>
            </div>
          </div>

          <details className="details-block" style={{ marginTop: 10 }}>
            <summary className="details-summary">View raw JSON</summary>
            <pre className="details-pre">{JSON.stringify(activeEvent.raw ?? {}, null, 2)}</pre>
          </details>
        </div>
      ) : (
        <div className="notice" style={{ marginTop: 12 }}>
          No RowId selected yet. Click any `✅ Citation` in Table, or select an edge in Network/Matrix/DotPlot and come back.
        </div>
      )}
    </div>
  );
}
