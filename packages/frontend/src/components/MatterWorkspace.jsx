import React from "react";
import {
  getMatter,
  updateMatter,
  recommendCandidates,
  getCandidates,
  setCandidates,
  listEvidence,
  generatePack,
  listPacks,
  pollJob,
  listAudit,
  getPackExportHtmlUrl,
} from "../lib/apiClient";
import {
  ArrowLeft,
  FileText,
  Users,
  GitCompare,
  Package,
  ClipboardList,
  RefreshCw,
  AlertCircle,
  Check,
  X,
  ChevronRight,
  Download,
  ExternalLink,
  Sparkles,
  Trophy,
  Scale,
  DollarSign,
  AlertTriangle,
  Clock,
  Star,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

// ============================================================
// Constants
// ============================================================

const CASE_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "civil_rights", label: "Civil Rights" },
  { value: "labor", label: "Labor" },
  { value: "torts", label: "Torts" },
  { value: "other", label: "Other" },
];

const COURTS = [
  { value: "N.D. Cal.", label: "N.D. Cal. (Northern District of California)" },
  { value: "S.D.N.Y.", label: "S.D.N.Y. (Southern District of New York)" },
  { value: "D. Del.", label: "D. Del. (District of Delaware)" },
  { value: "C.D. Cal.", label: "C.D. Cal. (Central District of California)" },
  { value: "E.D. Tex.", label: "E.D. Tex. (Eastern District of Texas)" },
  { value: "D.N.J.", label: "D.N.J. (District of New Jersey)" },
  { value: "N.D. Ill.", label: "N.D. Ill. (Northern District of Illinois)" },
  { value: "D. Mass.", label: "D. Mass. (District of Massachusetts)" },
];

const BUDGET_PRESETS = [
  { value: 100000, label: "$100K" },
  { value: 250000, label: "$250K" },
  { value: 500000, label: "$500K" },
  { value: 1000000, label: "$1M" },
  { value: 2500000, label: "$2.5M" },
  { value: 5000000, label: "$5M+" },
];

const TABS = [
  { key: "brief", icon: FileText, label: "1. Brief" },
  { key: "candidates", icon: Users, label: "2. Firms" },
  { key: "compare", icon: GitCompare, label: "3. Compare" },
  { key: "pack", icon: Package, label: "4. Report" },
  { key: "audit", icon: ClipboardList, label: "Audit" },
];

// ============================================================
// Helper Components
// ============================================================

function ProgressIndicator({ current, total }) {
  return (
    <div className="progress-indicator">
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${(current / total) * 100}%` }} />
      </div>
      <span className="progress-text">
        {`Step ${current}/${total}`}
      </span>
    </div>
  );
}

function EmptyState({ icon: Icon, title, action, actionLabel }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={48} className="empty-state-icon" />}
      <h3>{title}</h3>
      {action && actionLabel && (
        <button className="btn primary" onClick={action}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function LoadingState({ text }) {
  return (
    <div className="loading-state">
      <RefreshCw size={24} className="spin" />
      <span>{text}</span>
    </div>
  );
}

// ============================================================
// Brief Tab - Simplified with smart defaults
// ============================================================

function BriefTab({ matter, onUpdate, saving, onNext }) {
  const brief = matter?.brief || {};

  const handleFieldChange = (field, value) => {
    onUpdate({ brief: { ...brief, [field]: value } });
  };

  const handleConstraintChange = (field, value) => {
    onUpdate({
      brief: {
        ...brief,
        constraints: { ...(brief.constraints || {}), [field]: value },
      },
    });
  };

  const isComplete = brief.court && brief.caseType && brief.role;

  return (
    <div className="tab-content brief-tab">
      <div className="brief-header">
        <h2 title="Select key info and we'll recommend the best firms">
          Case Information
        </h2>
      </div>

      <div className="brief-form">
        {/* Court Selection - Visual Cards */}
        <div className="form-section">
          <label className="form-label">Court *</label>
          <div className="option-grid">
            {COURTS.map((court) => (
              <button
                key={court.value}
                className={`option-card ${brief.court === court.value ? "selected" : ""}`}
                onClick={() => handleFieldChange("court", court.value)}
              >
                <Scale size={20} />
                <span className="option-card-value">{court.value}</span>
              </button>
            ))}
            <button
              className={`option-card ${brief.court && !COURTS.find((c) => c.value === brief.court) ? "selected" : ""}`}
              onClick={() => {
                const custom = prompt("Enter court name");
                if (custom) handleFieldChange("court", custom);
              }}
            >
              <span className="option-card-value">Other...</span>
            </button>
          </div>
        </div>

        {/* Case Type - Visual Cards */}
        <div className="form-section">
          <label className="form-label">Case Type *</label>
          <div className="option-grid">
            {CASE_TYPES.map((ct) => (
              <button
                key={ct.value}
                className={`option-card ${brief.caseType === ct.value ? "selected" : ""}`}
                onClick={() => handleFieldChange("caseType", ct.value)}
              >
                <span className="option-card-value">{ct.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Role - Simple Toggle */}
        <div className="form-section">
          <label className="form-label">Your Role *</label>
          <div className="role-toggle">
            <button
              className={`role-btn ${brief.role === "defendant" ? "selected" : ""}`}
              onClick={() => handleFieldChange("role", "defendant")}
            >
              Defendant
            </button>
            <button
              className={`role-btn ${brief.role === "plaintiff" ? "selected" : ""}`}
              onClick={() => handleFieldChange("role", "plaintiff")}
            >
              Plaintiff
            </button>
          </div>
        </div>

        {/* Budget - Quick Select */}
        <div className="form-section">
          <label className="form-label">Budget Range</label>
          <div className="budget-pills">
            {BUDGET_PRESETS.map((b) => (
              <button
                key={b.value}
                className={`budget-pill ${brief.constraints?.budgetUsd === b.value ? "selected" : ""}`}
                onClick={() => handleConstraintChange("budgetUsd", b.value)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Opponent - Optional, simple input */}
        <div className="form-section">
          <label className="form-label">Opponent (optional)</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g., Acme Corp"
            value={brief.opponentName || ""}
            onChange={(e) => handleFieldChange("opponentName", e.target.value)}
          />
        </div>
      </div>

      <div className="brief-footer">
        <div className="brief-status">
          {isComplete ? (
            <span className="status-complete">
              <Check size={16} /> Complete
            </span>
          ) : (
            <span className="status-incomplete">
              Please complete required fields
            </span>
          )}
        </div>
        <button className="btn primary large" onClick={onNext} disabled={!isComplete || saving}>
          {saving ? (
            <>
              <RefreshCw size={16} className="spin" /> Saving...
            </>
          ) : (
            <>
              Get Firm Recommendations <ChevronRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Candidates Tab - Auto-recommend, easy select
// ============================================================

function CandidatesTab({ matterId, onShowToast, onNext }) {

  const [candidates, setCandidatesState] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [recommending, setRecommending] = React.useState(false);
  const [error, setError] = React.useState(null);

  const loadCandidates = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCandidates(matterId);
      setCandidatesState(res.items || []);
    } catch (err) {
      // If no candidates yet, will trigger auto-recommend via useEffect
      if (!(err.status === 404 || (err.message && err.message.includes("not found")))) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  const doRecommend = React.useCallback(async () => {
    setRecommending(true);
    setError(null);
    try {
      const res = await recommendCandidates(matterId, { limit: 10 });
      const items = (res.items || []).map((c) => ({ ...c, selected: c.tier === "recommended" }));
      setCandidatesState(items);
      // Auto-save recommended ones
      await setCandidates(
        matterId,
        items.filter((c) => c.selected)
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setRecommending(false);
    }
  }, [matterId]);

  React.useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // Auto-recommend if no candidates
  React.useEffect(() => {
    if (!loading && !recommending && candidates.length === 0 && !error) {
      doRecommend();
    }
  }, [loading, recommending, candidates.length, error, doRecommend]);

  const toggleCandidate = async (firmKey) => {
    const updated = candidates.map((c) => (c.firmKey === firmKey ? { ...c, selected: !c.selected } : c));
    setCandidatesState(updated);
    try {
      await setCandidates(
        matterId,
        updated.filter((c) => c.selected)
      );
    } catch (err) {
      onShowToast?.(err.message);
    }
  };

  const selectedCount = candidates.filter((c) => c.selected).length;

  if (loading || recommending) {
    return (
      <LoadingState
        text={recommending ? "Analyzing and recommending firms..." : "Loading..."}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={error}
        action={doRecommend}
        actionLabel="Retry"
      />
    );
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No recommendations, complete case info first"
        action={doRecommend}
        actionLabel="Get Recommendations"
      />
    );
  }

  return (
    <div className="tab-content candidates-tab">
      <div className="candidates-header">
        <h2 title={`${selectedCount} firms selected for comparison`}>
          Recommended Firms
        </h2>
        <button className="btn" onClick={doRecommend} disabled={recommending}>
          <RefreshCw size={14} className={recommending ? "spin" : ""} />
          Refresh
        </button>
      </div>

	      <div className="candidates-list">
	        {candidates.map((c) => (
	          <div key={c.firmKey} className={`candidate-card ${c.selected ? "selected" : ""}`} onClick={() => toggleCandidate(c.firmKey)}>
	            <div className="candidate-select">
	              {c.selected ? <Check size={20} /> : <div className="candidate-select-empty" />}
	            </div>
	            <div className="candidate-info">
	              <div className="candidate-name">
	                {c.firm}
	                {c.tier === "recommended" && (
	                  <span className="candidate-badge recommended">
	                    <Star size={12} /> Top
	                  </span>
	                )}
	              </div>
	              <div className="candidate-stats">
	                {typeof c.signals?.outcomeLiftPct === "number" && (
	                  <span className={`candidate-stat ${c.signals.outcomeLiftPct >= 0 ? "positive" : "negative"}`}>
	                    <Trophy size={12} />{" "}
	                    {c.signals.outcomeLiftPct >= 0 ? "+" : ""}
	                    {c.signals.outcomeLiftPct}pp win rate
	                  </span>
	                )}
	                {c.signals?.evidenceCount != null && (
	                  <span className="candidate-stat">
	                    <FileText size={12} /> {c.signals.evidenceCount} cases
	                  </span>
	                )}
	                {c.cost?.hourlyRateUsd != null && (
	                  <span className="candidate-stat">
	                    <DollarSign size={12} /> ${c.cost.hourlyRateUsd}/hr
	                  </span>
	                )}
	              </div>
	              {c.explain?.reasons?.length ? (
	                <div className="candidate-explain" onClick={(e) => e.stopPropagation()}>
	                  <details>
	                    <summary>Why recommended?</summary>
	                    <div className="candidate-explain-meta">
	                      Confidence: {c.explain?.confidence?.level || "unknown"}
	                      {typeof c.explain?.confidence?.nEvidenceCases === "number" ? (
	                        <>
	                          {" "}· n={c.explain.confidence.nEvidenceCases}
	                        </>
	                      ) : null}
	                      {c.explain?.confidence?.usedHeadToHead ? <> · head-to-head</> : null}
	                    </div>
	                    <div className="candidate-explain-reasons">
	                      {c.explain.reasons.slice(0, 3).map((r) => (
	                        <div key={r.code} className="candidate-explain-reason">
	                          <div className="candidate-explain-title">{r.title}</div>
	                          <div className="candidate-explain-summary">{r.summary}</div>
	                          {r.citations?.length ? (
	                            <div className="candidate-explain-citations">
	                              {r.citations.slice(0, 3).map((cit) => (
	                                <div key={cit.caseId} className="candidate-explain-citation">
	                                  <code>CaseId {cit.caseId}</code>
	                                  {cit.why ? <span className="muted"> — {cit.why}</span> : null}
	                                </div>
	                              ))}
	                            </div>
	                          ) : null}
	                        </div>
	                      ))}
	                    </div>
	                  </details>
	                </div>
	              ) : null}
	            </div>
	            <div className="candidate-action">
	              {c.selected ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}
	            </div>
	          </div>
	        ))}
      </div>

      <div className="candidates-footer">
        <button className="btn primary large" onClick={onNext} disabled={selectedCount < 2}>
          {selectedCount < 2 ? "Select at least 2 firms" : (
            <>
              Compare Selected <ChevronRight size={16} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Compare Tab - Auto-generated comparison
// ============================================================

function CompareTab({ matterId, onNext }) {

  const [candidates, setCandidatesState] = React.useState([]);
  const [evidence, setEvidence] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [activeCaseId, setActiveCaseId] = React.useState(null);
  const evidenceRef = React.useRef(null);

  const loadEvidence = React.useCallback(
    async ({ caseId } = {}) => {
      const res = await listEvidence(matterId, { limit: 50, caseId });
      setEvidence(res.items || []);
    },
    [matterId]
  );

  const openEvidenceFilter = React.useCallback(
    async (caseId) => {
      const cid = Number(caseId);
      if (!Number.isFinite(cid)) return;
      setActiveCaseId(cid);
      try {
        await loadEvidence({ caseId: cid });
      } catch {
        // ignore; UI will show empty state
      } finally {
        try {
          evidenceRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        } catch {
          // ignore
        }
      }
    },
    [loadEvidence]
  );

  const clearEvidenceFilter = React.useCallback(async () => {
    setActiveCaseId(null);
    await loadEvidence({ caseId: undefined });
  }, [loadEvidence]);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const candRes = await getCandidates(matterId);
        setCandidatesState(candRes.items || []);
        setActiveCaseId(null);
        await loadEvidence({ caseId: undefined });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [matterId, loadEvidence]);

  if (loading) {
    return <LoadingState text="Loading comparison data..." />;
  }

  if (error) {
    return <EmptyState icon={AlertCircle} title={error} />;
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={GitCompare}
        title="Please select candidate firms first"
      />
    );
  }

  const formatSignedPct = (n) => {
    if (n == null) return "—";
    const v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return `${v >= 0 ? "+" : ""}${v}pp`;
  };

  // Firms with too few observed cases have no lift at all; they sort last rather
  // than tying with a firm measured at exactly the baseline.
  const liftOf = (c) => (typeof c?.signals?.outcomeLiftPct === "number" ? c.signals.outcomeLiftPct : null);
  const sorted = [...candidates].sort((a, b) => (liftOf(b) ?? -Infinity) - (liftOf(a) ?? -Infinity));
  const bestFirm = sorted[0] || null;
  const secondFirm = sorted[1] || null;
  const liftGap =
    liftOf(bestFirm) != null && liftOf(secondFirm) != null ? liftOf(bestFirm) - liftOf(secondFirm) : null;
  const bestEvidence = bestFirm?.signals?.evidenceCount || 0;

  return (
    <div className="tab-content compare-tab">
      <div className="compare-header">
        <div>
          <h2 title="Analysis on offline snapshot; key claims cite CaseIds">
            Firm Comparison
          </h2>
          <div className="compare-subtitle">
            {`${sorted.length} firms selected (evidence-driven explainability with citations)`}
          </div>
        </div>
      </div>

      {bestFirm && (
        <div className="compare-winner compare-block card pad">
          <div className="compare-winner-top">
            <div className="compare-winner-icon">
              <Trophy size={20} />
            </div>
            <div className="compare-winner-main">
              <div className="compare-winner-label">Top Recommendation</div>
              <div className="compare-winner-name">{bestFirm.firm}</div>
            </div>
            <div className="compare-winner-stat">
              {liftOf(bestFirm) != null ? `${formatSignedPct(liftOf(bestFirm))} win rate lift` : "win rate unknown"}
            </div>
          </div>

          <div className="compare-winner-metrics">
            <div className="compare-metric">
              <div className="compare-metric-label">Evidence</div>
              <div className="compare-metric-value">{bestEvidence}</div>
            </div>
            <div className="compare-metric">
              <div className="compare-metric-label">Confidence</div>
              <div className="compare-metric-value">
                <span className={`confidence ${bestFirm.signals?.confidence || "low"}`}>
                  {bestFirm.signals?.confidence === "high"
                    ? "High"
                    : bestFirm.signals?.confidence === "medium"
                      ? "Medium"
                      : "Low"}
                </span>
              </div>
            </div>
            <div className="compare-metric">
              <div className="compare-metric-label">Gap vs #2</div>
              <div className="compare-metric-value">{formatSignedPct(liftGap)}</div>
            </div>
          </div>
        </div>
      )}

      {bestFirm?.explain?.reasons?.length ? (
        <div className="compare-explain compare-block card pad">
          <div className="compare-section-title">Explainability (evidence-driven)</div>
          <div className="compare-explain-meta muted">
            Confidence: {bestFirm.explain?.confidence?.level || "unknown"}
            {typeof bestFirm.explain?.confidence?.nEvidenceCases === "number" ? (
              <> · n={bestFirm.explain.confidence.nEvidenceCases}</>
            ) : null}
            {bestFirm.explain?.confidence?.usedHeadToHead ? <> · head-to-head</> : null}
          </div>
          <div className="compare-explain-reasons">
            {bestFirm.explain.reasons.slice(0, 3).map((r) => (
              <div key={r.code} className="compare-explain-reason">
                <div className="compare-explain-title">{r.title}</div>
                <div className="compare-explain-summary">{r.summary}</div>
                {r.citations?.length ? (
                  <div className="compare-explain-citations">
                    {r.citations.slice(0, 6).map((cit) => (
                      <button key={cit.caseId} className="pill clickable" onClick={() => openEvidenceFilter(cit.caseId)} type="button">
                        CaseId {cit.caseId}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="compare-table-card compare-block card">
        <div className="compare-table-header">
          <div>
            <div className="compare-section-title">Comparison Table</div>
            <div className="muted compare-table-subtitle">
              Sorted by win-rate lift (offline snapshot only)
            </div>
          </div>
        </div>

        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Firm</th>
                <th>Win Rate Lift</th>
                <th>Evidence</th>
                <th>Hourly Rate</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
                  {sorted.map((c, i) => {
                    const lift = liftOf(c);
                    return (
                      <tr key={c.firmKey} className={i === 0 ? "highlight" : ""}>
                        <td className="compare-cell rank">{i + 1}</td>
                        <td className="firm-name">
                          {c.firm}
                          {i === 0 && <Star size={14} className="star" />}
                        </td>
                        <td className={`compare-cell ${lift == null ? "" : lift >= 0 ? "positive" : "negative"}`}>
                          {formatSignedPct(lift)}
                        </td>
                        <td className="compare-cell">{c.signals?.evidenceCount || 0}</td>
                        <td className="compare-cell">{c.cost?.hourlyRateUsd ? `$${c.cost.hourlyRateUsd}` : "-"}</td>
                        <td className="compare-cell">
                          <span className={`confidence ${c.signals?.confidence || "low"}`}>
                            {c.signals?.confidence === "high"
                              ? "High"
                              : c.signals?.confidence === "medium"
                                ? "Medium"
                                : "Low"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

      {/* Evidence preview */}
      <div ref={evidenceRef} className="evidence-section compare-block card pad">
        <div className="compare-section-title">Similar Cases</div>
        <div className="muted compare-evidence-subtitle">
          Supports explainability: click CaseId to filter
        </div>
        {activeCaseId != null ? (
          <div className="compare-evidence-filter">
            <span className="pill">CaseId {activeCaseId}</span>
            <button className="btn small" onClick={clearEvidenceFilter} type="button">
              Clear filter
            </button>
          </div>
        ) : null}

        {evidence.length > 0 ? (
          <div className="evidence-list" style={{ marginTop: 10 }}>
            {evidence.slice(0, activeCaseId != null ? 20 : 10).map((e) => (
              (() => {
                const raw = String(e.outcome || "").toLowerCase();
                const isDef =
                  raw === "defendant_win" ||
                  raw === "defendantwin" ||
                  raw === "def_win" ||
                  raw.includes("defendant win") ||
                  raw === "defendant";
                const isPlt =
                  raw === "plaintiff_win" ||
                  raw === "plaintiffwin" ||
                  raw === "plt_win" ||
                  raw.includes("plaintiff win") ||
                  raw === "plaintiff";
                const outcomeLabel = isDef ? "defendant_win" : isPlt ? "plaintiff_win" : "unknown";
                return (
              <div key={e.caseId} className="evidence-item">
                <div className="evidence-caption">{e.caption || `CaseId ${e.caseId}`}</div>
                <div className="evidence-meta">
                  <span>{e.court}</span>
                  <span>{e.year}</span>
                  <span className={`outcome ${outcomeLabel}`}>
                    {outcomeLabel === "defendant_win"
                      ? "Def Win"
                      : outcomeLabel === "plaintiff_win"
                        ? "Plt Win"
                        : "Unknown"}
                  </span>
                  <button className="pill clickable" type="button" onClick={() => openEvidenceFilter(e.caseId)}>
                    CaseId {e.caseId}
                  </button>
                  <span className="similarity">{Math.round((e.similarity || 0) * 100)}% similar</span>
                </div>
              </div>
                );
              })()
            ))}
          </div>
        ) : (
          <div className="compare-evidence-empty muted">
            No matching cases (may be missing from snapshot)
          </div>
        )}
      </div>

      <div className="compare-footer">
        <button className="btn primary large" onClick={onNext}>
          Generate Decision Report <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Decision Pack Tab - One-click generation
// ============================================================

function PackTab({ matterId, onShowToast }) {

  const [packs, setPacks] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState(null);

  const loadPacks = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPacks(matterId);
      setPacks(res.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  React.useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  const doGenerate = async () => {
    setGenerating(true);
    setProgress(0);
    setError(null);
    try {
      const { jobId } = await generatePack(matterId, { format: "html" });
      await pollJob(jobId, {
        interval: 500,
        timeout: 120000,
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      await loadPacks();
      onShowToast?.("Report generated");
    } catch (err) {
      setError(err.message);
      onShowToast?.(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <LoadingState text="Loading reports..." />;
  }

  if (error && packs.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={error}
        action={loadPacks}
        actionLabel="Retry"
      />
    );
  }

  return (
    <div className="tab-content pack-tab">
      <div className="pack-header">
        <h2 title="Generate a shareable firm selection report">
          Decision Report
        </h2>
      </div>

      {/* Generate button */}
      <div className="pack-generate">
        <button className="btn primary large generate-btn" onClick={doGenerate} disabled={generating}>
          {generating ? (
            <>
              <RefreshCw size={20} className="spin" />
              <span>Generating... {progress}%</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>Generate Report</span>
            </>
          )}
        </button>
        {generating && (
          <div className="generate-progress">
            <div className="generate-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Pack list */}
      {packs.length > 0 && (
        <div className="pack-list">
          <h3>Version History</h3>
          {packs.map((pack) => (
            <div key={pack.id} className="pack-item">
              <div className="pack-item-info">
                <div className="pack-item-version">v{pack.version}</div>
                <div className="pack-item-date">
                  <Clock size={12} />
                  {new Date(pack.createdAt).toLocaleString("en-US")}
                </div>
              </div>
              <div className="pack-item-actions">
                <a
                  href={getPackExportHtmlUrl(matterId, pack.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn small"
                >
                  <ExternalLink size={14} /> View
                </a>
                <a href={getPackExportHtmlUrl(matterId, pack.id)} download className="btn small">
                  <Download size={14} /> Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {packs.length === 0 && !generating && (
        <div className="pack-empty">
          <Package size={48} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Audit Tab - Simple log view
// ============================================================

function AuditTab({ matterId }) {

  const [events, setEvents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await listAudit(matterId);
        setEvents(res.items || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [matterId]);

  if (loading) {
    return <LoadingState text="Loading logs..." />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No activity yet"
      />
    );
  }

  const actionLabels = {
    matter_created: "Matter created",
    matter_updated: "Matter updated",
    brief_updated: "Brief updated",
    candidates_set: "Candidates updated",
    candidates_updated: "Candidates updated",
    pack_generated: "Report generated",
  };

  return (
    <div className="tab-content audit-tab">
      <h2>Activity Log</h2>
      <div className="audit-list">
        {events.map((e) => (
          <div key={e.id} className="audit-item">
            <div className="audit-time">{new Date(e.at).toLocaleString("en-US")}</div>
            <div className="audit-action">{actionLabels[e.action] || e.action}</div>
            <div className="audit-actor">{e.actor?.name || "System"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Main Workspace Component
// ============================================================

export default function MatterWorkspace({ matterId, onBack, onShowToast }) {

  const [matter, setMatter] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("brief");
  const [saving, setSaving] = React.useState(false);

  const loadMatter = React.useCallback(async () => {
    if (!matterId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMatter(matterId);
      setMatter(data);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  React.useEffect(() => {
    loadMatter();
  }, [loadMatter]);

  const handleUpdateMatter = React.useCallback(
    async (updates) => {
      if (!matterId) return;
      setSaving(true);
      try {
        const updated = await updateMatter(matterId, updates);
        setMatter(updated);
        return updated;
      } catch (err) {
        onShowToast?.(err.message || "Save failed");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [matterId, onShowToast]
  );

  const goNext = () => {
    const order = ["brief", "candidates", "compare", "pack"];
    const idx = order.indexOf(activeTab);
    if (idx < order.length - 1) {
      setActiveTab(order[idx + 1]);
    }
  };

  if (loading) {
    return (
      <div className="workspace">
        <LoadingState text="Loading matter..." />
      </div>
    );
  }

  if (error || !matter) {
    return (
      <div className="workspace">
        <div className="workspace-error-full">
          <AlertCircle size={48} />
          <h2>{error || "Matter not found"}</h2>
          <div className="workspace-error-actions">
            <button className="btn" onClick={onBack}>
              Go Back
            </button>
            <button className="btn primary" onClick={loadMatter}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabIndex = ["brief", "candidates", "compare", "pack"].indexOf(activeTab) + 1;

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div className="workspace-header-left">
          <button className="workspace-back" onClick={onBack} title="Back to list">
            <ArrowLeft size={20} />
          </button>
          <div className="workspace-title-group">
            <h1 className="workspace-title">{matter.name || "Untitled Matter"}</h1>
          </div>
        </div>
        {activeTab !== "audit" && <ProgressIndicator current={tabIndex} total={4} />}
      </div>

      <div className="workspace-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} className={`workspace-tab ${isActive ? "active" : ""}`} onClick={() => setActiveTab(tab.key)}>
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="workspace-content">
        {activeTab === "brief" && (
          <BriefTab matter={matter} onUpdate={handleUpdateMatter} saving={saving} onNext={goNext} />
        )}
        {activeTab === "candidates" && (
          <CandidatesTab matterId={matterId} onShowToast={onShowToast} onNext={goNext} />
        )}
        {activeTab === "compare" && <CompareTab matterId={matterId} onNext={goNext} />}
        {activeTab === "pack" && <PackTab matterId={matterId} onShowToast={onShowToast} />}
        {activeTab === "audit" && <AuditTab matterId={matterId} />}
      </div>
    </div>
  );
}
