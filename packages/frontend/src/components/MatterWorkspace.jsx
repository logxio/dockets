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
  { value: "contract", zh: "合同纠纷", en: "Contract" },
  { value: "civil_rights", zh: "民权案件", en: "Civil Rights" },
  { value: "labor", zh: "劳动争议", en: "Labor" },
  { value: "torts", zh: "侵权案件", en: "Torts" },
  { value: "other", zh: "其他", en: "Other" },
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
  { key: "brief", icon: FileText, zh: "1. 案情", en: "1. Brief" },
  { key: "candidates", icon: Users, zh: "2. 推荐律所", en: "2. Firms" },
  { key: "compare", icon: GitCompare, zh: "3. 对比", en: "3. Compare" },
  { key: "pack", icon: Package, zh: "4. 报告", en: "4. Report" },
  { key: "audit", icon: ClipboardList, zh: "审计", en: "Audit" },
];

// ============================================================
// Helper Components
// ============================================================

function ProgressIndicator({ current, total, lang }) {
  const tx = (zh, en) => (lang === "en" ? en : zh);
  return (
    <div className="progress-indicator">
      <div className="progress-bar-bg">
        <div className="progress-bar-fill" style={{ width: `${(current / total) * 100}%` }} />
      </div>
      <span className="progress-text">
        {tx(`步骤 ${current}/${total}`, `Step ${current}/${total}`)}
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

function BriefTab({ matter, lang, onUpdate, saving, onNext }) {
  const tx = React.useCallback((zh, en) => (lang === "en" ? en : zh), [lang]);
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
        <h2 title={tx("选择关键信息，系统将自动推荐最合适的律所", "Select key info and we'll recommend the best firms")}>
          {tx("填写案情信息", "Case Information")}
        </h2>
      </div>

      <div className="brief-form">
        {/* Court Selection - Visual Cards */}
        <div className="form-section">
          <label className="form-label">{tx("法院", "Court")} *</label>
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
                const custom = prompt(tx("输入法院名称", "Enter court name"));
                if (custom) handleFieldChange("court", custom);
              }}
            >
              <span className="option-card-value">{tx("其他...", "Other...")}</span>
            </button>
          </div>
        </div>

        {/* Case Type - Visual Cards */}
        <div className="form-section">
          <label className="form-label">{tx("案由", "Case Type")} *</label>
          <div className="option-grid">
            {CASE_TYPES.map((ct) => (
              <button
                key={ct.value}
                className={`option-card ${brief.caseType === ct.value ? "selected" : ""}`}
                onClick={() => handleFieldChange("caseType", ct.value)}
              >
                <span className="option-card-value">{lang === "en" ? ct.en : ct.zh}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Role - Simple Toggle */}
        <div className="form-section">
          <label className="form-label">{tx("您的角色", "Your Role")} *</label>
          <div className="role-toggle">
            <button
              className={`role-btn ${brief.role === "defendant" ? "selected" : ""}`}
              onClick={() => handleFieldChange("role", "defendant")}
            >
              {tx("被告", "Defendant")}
            </button>
            <button
              className={`role-btn ${brief.role === "plaintiff" ? "selected" : ""}`}
              onClick={() => handleFieldChange("role", "plaintiff")}
            >
              {tx("原告", "Plaintiff")}
            </button>
          </div>
        </div>

        {/* Budget - Quick Select */}
        <div className="form-section">
          <label className="form-label">{tx("预算范围", "Budget Range")}</label>
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
          <label className="form-label">{tx("对方名称（可选）", "Opponent (optional)")}</label>
          <input
            type="text"
            className="form-input"
            placeholder={tx("例如：Acme Corp", "e.g., Acme Corp")}
            value={brief.opponentName || ""}
            onChange={(e) => handleFieldChange("opponentName", e.target.value)}
          />
        </div>
      </div>

      <div className="brief-footer">
        <div className="brief-status">
          {isComplete ? (
            <span className="status-complete">
              <Check size={16} /> {tx("信息完整", "Complete")}
            </span>
          ) : (
            <span className="status-incomplete">
              {tx("请完成必填项", "Please complete required fields")}
            </span>
          )}
        </div>
        <button className="btn primary large" onClick={onNext} disabled={!isComplete || saving}>
          {saving ? (
            <>
              <RefreshCw size={16} className="spin" /> {tx("保存中...", "Saving...")}
            </>
          ) : (
            <>
              {tx("获取推荐律所", "Get Firm Recommendations")} <ChevronRight size={16} />
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

function CandidatesTab({ matterId, lang, onShowToast, onNext }) {
  const tx = React.useCallback((zh, en) => (lang === "en" ? en : zh), [lang]);

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
        text={recommending ? tx("正在分析并推荐律所...", "Analyzing and recommending firms...") : tx("加载中...", "Loading...")}
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={error}
        action={doRecommend}
        actionLabel={tx("重新推荐", "Retry")}
      />
    );
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={tx("暂无推荐，请先完善案情", "No recommendations, complete case info first")}
        action={doRecommend}
        actionLabel={tx("获取推荐", "Get Recommendations")}
      />
    );
  }

  return (
    <div className="tab-content candidates-tab">
      <div className="candidates-header">
        <h2 title={tx(`已选择 ${selectedCount} 家律所进行对比`, `${selectedCount} firms selected for comparison`)}>
          {tx("推荐律所", "Recommended Firms")}
        </h2>
        <button className="btn" onClick={doRecommend} disabled={recommending}>
          <RefreshCw size={14} className={recommending ? "spin" : ""} />
          {tx("重新推荐", "Refresh")}
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
	                    <Star size={12} /> {tx("推荐", "Top")}
	                  </span>
	                )}
	              </div>
	              <div className="candidate-stats">
	                {c.signals?.outcomeLiftPct != null && (
	                  <span className="candidate-stat positive">
	                    <Trophy size={12} /> +{c.signals.outcomeLiftPct}% {tx("胜率提升", "win rate")}
	                  </span>
	                )}
	                {c.signals?.evidenceCount != null && (
	                  <span className="candidate-stat">
	                    <FileText size={12} /> {c.signals.evidenceCount} {tx("案例", "cases")}
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
	                    <summary>{tx("为什么推荐？", "Why recommended?")}</summary>
	                    <div className="candidate-explain-meta">
	                      {tx("置信度", "Confidence")}: {c.explain?.confidence?.level || "unknown"}
	                      {typeof c.explain?.confidence?.nEvidenceCases === "number" ? (
	                        <>
	                          {" "}· n={c.explain.confidence.nEvidenceCases}
	                        </>
	                      ) : null}
	                      {c.explain?.confidence?.usedHeadToHead ? <> · {tx("含对手对抗证据", "head-to-head")}</> : null}
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
          {selectedCount < 2 ? tx("至少选择2家律所", "Select at least 2 firms") : (
            <>
              {tx("对比所选律所", "Compare Selected")} <ChevronRight size={16} />
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

function CompareTab({ matterId, lang, onNext }) {
  const tx = React.useCallback((zh, en) => (lang === "en" ? en : zh), [lang]);

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
    return <LoadingState text={tx("加载对比数据...", "Loading comparison data...")} />;
  }

  if (error) {
    return <EmptyState icon={AlertCircle} title={error} />;
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={GitCompare}
        title={tx("请先选择候选律所", "Please select candidate firms first")}
      />
    );
  }

  const formatSignedPct = (n) => {
    const v = Number(n || 0);
    if (!Number.isFinite(v)) return "0%";
    return `${v >= 0 ? "+" : ""}${v}%`;
  };

  const sorted = [...candidates].sort((a, b) => (b.signals?.outcomeLiftPct || 0) - (a.signals?.outcomeLiftPct || 0));
  const bestFirm = sorted[0] || null;
  const secondFirm = sorted[1] || null;
  const liftGap = (bestFirm?.signals?.outcomeLiftPct || 0) - (secondFirm?.signals?.outcomeLiftPct || 0);
  const bestEvidence = bestFirm?.signals?.evidenceCount || 0;

  return (
    <div className="tab-content compare-tab">
      <div className="compare-header">
        <div>
          <h2 title={tx("基于离线快照数据的分析结果，所有关键结论均可回溯到 CaseId", "Analysis on offline snapshot; key claims cite CaseIds")}>
            {tx("律所对比", "Firm Comparison")}
          </h2>
          <div className="compare-subtitle">
            {tx(
              `已选择 ${sorted.length} 家律所（证据驱动解释，可点开查看引用）`,
              `${sorted.length} firms selected (evidence-driven explainability with citations)`
            )}
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
              <div className="compare-winner-label">{tx("推荐首选", "Top Recommendation")}</div>
              <div className="compare-winner-name">{bestFirm.firm}</div>
            </div>
            <div className="compare-winner-stat">
              {formatSignedPct(bestFirm.signals?.outcomeLiftPct || 0)} {tx("胜率提升", "win rate lift")}
            </div>
          </div>

          <div className="compare-winner-metrics">
            <div className="compare-metric">
              <div className="compare-metric-label">{tx("证据数量", "Evidence")}</div>
              <div className="compare-metric-value">{bestEvidence}</div>
            </div>
            <div className="compare-metric">
              <div className="compare-metric-label">{tx("置信度", "Confidence")}</div>
              <div className="compare-metric-value">
                <span className={`confidence ${bestFirm.signals?.confidence || "low"}`}>
                  {bestFirm.signals?.confidence === "high"
                    ? tx("高", "High")
                    : bestFirm.signals?.confidence === "medium"
                      ? tx("中", "Medium")
                      : tx("低", "Low")}
                </span>
              </div>
            </div>
            <div className="compare-metric">
              <div className="compare-metric-label">{tx("与第2名差距", "Gap vs #2")}</div>
              <div className="compare-metric-value">{formatSignedPct(liftGap)}</div>
            </div>
          </div>
        </div>
      )}

      {bestFirm?.explain?.reasons?.length ? (
        <div className="compare-explain compare-block card pad">
          <div className="compare-section-title">{tx("可解释性（证据驱动）", "Explainability (evidence-driven)")}</div>
          <div className="compare-explain-meta muted">
            {tx("置信度", "Confidence")}: {bestFirm.explain?.confidence?.level || "unknown"}
            {typeof bestFirm.explain?.confidence?.nEvidenceCases === "number" ? (
              <> · n={bestFirm.explain.confidence.nEvidenceCases}</>
            ) : null}
            {bestFirm.explain?.confidence?.usedHeadToHead ? <> · {tx("含对手对抗证据", "head-to-head")}</> : null}
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
            <div className="compare-section-title">{tx("对比表", "Comparison Table")}</div>
            <div className="muted compare-table-subtitle">
              {tx("按胜率提升排序（仅离线快照）", "Sorted by win-rate lift (offline snapshot only)")}
            </div>
          </div>
        </div>

        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{tx("律所", "Firm")}</th>
                <th>{tx("胜率提升", "Win Rate Lift")}</th>
                <th>{tx("证据数量", "Evidence")}</th>
                <th>{tx("费率", "Hourly Rate")}</th>
                <th>{tx("置信度", "Confidence")}</th>
              </tr>
            </thead>
            <tbody>
                  {sorted.map((c, i) => {
                    const lift = c.signals?.outcomeLiftPct || 0;
                    return (
                      <tr key={c.firmKey} className={i === 0 ? "highlight" : ""}>
                        <td className="compare-cell rank">{i + 1}</td>
                        <td className="firm-name">
                          {c.firm}
                          {i === 0 && <Star size={14} className="star" />}
                        </td>
                        <td className={`compare-cell ${lift >= 0 ? "positive" : "negative"}`}>{formatSignedPct(lift)}</td>
                        <td className="compare-cell">{c.signals?.evidenceCount || 0}</td>
                        <td className="compare-cell">{c.cost?.hourlyRateUsd ? `$${c.cost.hourlyRateUsd}` : "-"}</td>
                        <td className="compare-cell">
                          <span className={`confidence ${c.signals?.confidence || "low"}`}>
                            {c.signals?.confidence === "high"
                              ? tx("高", "High")
                              : c.signals?.confidence === "medium"
                                ? tx("中", "Medium")
                                : tx("低", "Low")}
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
        <div className="compare-section-title">{tx("相似案例参考", "Similar Cases")}</div>
        <div className="muted compare-evidence-subtitle">
          {tx("用于支撑可解释性：点击 CaseId 过滤查看", "Supports explainability: click CaseId to filter")}
        </div>
        {activeCaseId != null ? (
          <div className="compare-evidence-filter">
            <span className="pill">CaseId {activeCaseId}</span>
            <button className="btn small" onClick={clearEvidenceFilter} type="button">
              {tx("清除过滤", "Clear filter")}
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
                      ? tx("被告胜", "Def Win")
                      : outcomeLabel === "plaintiff_win"
                        ? tx("原告胜", "Plt Win")
                        : tx("未知", "Unknown")}
                  </span>
                  <button className="pill clickable" type="button" onClick={() => openEvidenceFilter(e.caseId)}>
                    CaseId {e.caseId}
                  </button>
                  <span className="similarity">{Math.round((e.similarity || 0) * 100)}% {tx("相似", "similar")}</span>
                </div>
              </div>
                );
              })()
            ))}
          </div>
        ) : (
          <div className="compare-evidence-empty muted">
            {tx("未找到匹配的案例（可能不在当前快照里）", "No matching cases (may be missing from snapshot)")}
          </div>
        )}
      </div>

      <div className="compare-footer">
        <button className="btn primary large" onClick={onNext}>
          {tx("生成决策报告", "Generate Decision Report")} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Decision Pack Tab - One-click generation
// ============================================================

function PackTab({ matterId, lang, onShowToast }) {
  const tx = React.useCallback((zh, en) => (lang === "en" ? en : zh), [lang]);

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
      onShowToast?.(tx("报告已生成", "Report generated"));
    } catch (err) {
      setError(err.message);
      onShowToast?.(err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <LoadingState text={tx("加载报告...", "Loading reports...")} />;
  }

  if (error && packs.length === 0) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={error}
        action={loadPacks}
        actionLabel={tx("重试", "Retry")}
      />
    );
  }

  return (
    <div className="tab-content pack-tab">
      <div className="pack-header">
        <h2 title={tx("一键生成可分享的律所选择报告", "Generate a shareable firm selection report")}>
          {tx("决策报告", "Decision Report")}
        </h2>
      </div>

      {/* Generate button */}
      <div className="pack-generate">
        <button className="btn primary large generate-btn" onClick={doGenerate} disabled={generating}>
          {generating ? (
            <>
              <RefreshCw size={20} className="spin" />
              <span>{tx("生成中...", "Generating...")} {progress}%</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>{tx("一键生成报告", "Generate Report")}</span>
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
          <h3>{tx("历史版本", "Version History")}</h3>
          {packs.map((pack) => (
            <div key={pack.id} className="pack-item">
              <div className="pack-item-info">
                <div className="pack-item-version">v{pack.version}</div>
                <div className="pack-item-date">
                  <Clock size={12} />
                  {new Date(pack.createdAt).toLocaleString(lang === "en" ? "en-US" : "zh-CN")}
                </div>
              </div>
              <div className="pack-item-actions">
                <a
                  href={getPackExportHtmlUrl(matterId, pack.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn small"
                >
                  <ExternalLink size={14} /> {tx("查看", "View")}
                </a>
                <a href={getPackExportHtmlUrl(matterId, pack.id)} download className="btn small">
                  <Download size={14} /> {tx("下载", "Download")}
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

function AuditTab({ matterId, lang }) {
  const tx = React.useCallback((zh, en) => (lang === "en" ? en : zh), [lang]);

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
    return <LoadingState text={tx("加载日志...", "Loading logs...")} />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={tx("暂无操作记录", "No activity yet")}
      />
    );
  }

  const actionLabels = {
    matter_created: tx("创建案件", "Matter created"),
    matter_updated: tx("更新案件", "Matter updated"),
    brief_updated: tx("更新案情", "Brief updated"),
    candidates_set: tx("更新候选律所", "Candidates updated"),
    candidates_updated: tx("更新候选律所", "Candidates updated"),
    pack_generated: tx("生成报告", "Report generated"),
  };

  return (
    <div className="tab-content audit-tab">
      <h2>{tx("操作记录", "Activity Log")}</h2>
      <div className="audit-list">
        {events.map((e) => (
          <div key={e.id} className="audit-item">
            <div className="audit-time">{new Date(e.at).toLocaleString(lang === "en" ? "en-US" : "zh-CN")}</div>
            <div className="audit-action">{actionLabels[e.action] || e.action}</div>
            <div className="audit-actor">{e.actor?.name || tx("系统", "System")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Main Workspace Component
// ============================================================

export default function MatterWorkspace({ matterId, lang = "zh", onBack, onShowToast }) {
  const tx = React.useCallback((zh, en) => (lang === "en" ? en : zh), [lang]);

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
      setError(err.message || tx("加载失败", "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [matterId, tx]);

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
        onShowToast?.(err.message || tx("保存失败", "Save failed"));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [matterId, tx, onShowToast]
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
        <LoadingState text={tx("加载案件...", "Loading matter...")} />
      </div>
    );
  }

  if (error || !matter) {
    return (
      <div className="workspace">
        <div className="workspace-error-full">
          <AlertCircle size={48} />
          <h2>{error || tx("案件不存在", "Matter not found")}</h2>
          <div className="workspace-error-actions">
            <button className="btn" onClick={onBack}>
              {tx("返回", "Go Back")}
            </button>
            <button className="btn primary" onClick={loadMatter}>
              {tx("重试", "Retry")}
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
          <button className="workspace-back" onClick={onBack} title={tx("返回列表", "Back to list")}>
            <ArrowLeft size={20} />
          </button>
          <div className="workspace-title-group">
            <h1 className="workspace-title">{matter.name || tx("未命名案件", "Untitled Matter")}</h1>
          </div>
        </div>
        {activeTab !== "audit" && <ProgressIndicator current={tabIndex} total={4} lang={lang} />}
      </div>

      <div className="workspace-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} className={`workspace-tab ${isActive ? "active" : ""}`} onClick={() => setActiveTab(tab.key)}>
              <Icon size={16} />
              <span>{lang === "en" ? tab.en : tab.zh}</span>
            </button>
          );
        })}
      </div>

      <div className="workspace-content">
        {activeTab === "brief" && (
          <BriefTab matter={matter} lang={lang} onUpdate={handleUpdateMatter} saving={saving} onNext={goNext} />
        )}
        {activeTab === "candidates" && (
          <CandidatesTab matterId={matterId} lang={lang} onShowToast={onShowToast} onNext={goNext} />
        )}
        {activeTab === "compare" && <CompareTab matterId={matterId} lang={lang} onNext={goNext} />}
        {activeTab === "pack" && <PackTab matterId={matterId} lang={lang} onShowToast={onShowToast} />}
        {activeTab === "audit" && <AuditTab matterId={matterId} lang={lang} />}
      </div>
    </div>
  );
}
