import React from "react";
import { listMatters, deleteMatter } from "../lib/apiClient";
import { Briefcase, Plus, Trash2, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";

const STATUS_LABELS = {
  draft: { zh: "草稿", en: "Draft", color: "gray" },
  ready: { zh: "就绪", en: "Ready", color: "green" },
  archived: { zh: "已归档", en: "Archived", color: "orange" },
};

const CASE_TYPE_LABELS = {
  civil_rights: { zh: "民权", en: "Civil Rights" },
  contract: { zh: "合同", en: "Contract" },
  labor: { zh: "劳动", en: "Labor" },
  torts: { zh: "侵权", en: "Torts" },
  other: { zh: "其他", en: "Other" },
};

function formatDate(isoString, lang) {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(lang === "en" ? "en-US" : "zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

export default function MatterList({ lang = "zh", onSelectMatter, onCreateMatter }) {
  const tx = React.useCallback((zh, en) => (lang === "en" ? en : zh), [lang]);

  const [matters, setMatters] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [deleting, setDeleting] = React.useState(null);

  const loadMatters = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMatters({ limit: 100 });
      setMatters(res.items || []);
    } catch (err) {
      setError(err.message || tx("加载失败", "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [tx]);

  React.useEffect(() => {
    loadMatters();
  }, [loadMatters]);

  const handleDelete = React.useCallback(
    async (e, matterId, matterName) => {
      e.stopPropagation();
      const confirmed = window.confirm(
        tx(
          `确定要删除案件 "${matterName}" 吗？此操作不可撤销。`,
          `Are you sure you want to delete "${matterName}"? This action cannot be undone.`
        )
      );
      if (!confirmed) return;

      setDeleting(matterId);
      try {
        await deleteMatter(matterId);
        setMatters((prev) => prev.filter((m) => m.id !== matterId));
      } catch (err) {
        alert(err.message || tx("删除失败", "Delete failed"));
      } finally {
        setDeleting(null);
      }
    },
    [tx]
  );

  return (
    <div className="matter-list">
      <div className="matter-list-header">
        <div className="matter-list-title-group">
          <Briefcase size={24} className="matter-list-icon" />
          <div>
            <h1
              className="matter-list-title"
              title={tx("管理您的法律案件与决策报告", "Manage your legal matters and decision packs")}
            >
              {tx("案件列表", "Matters")}
            </h1>
          </div>
        </div>
        <div className="matter-list-actions">
          <button className="btn small" onClick={loadMatters} disabled={loading} title={tx("刷新", "Refresh")}>
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
          <button className="btn primary" onClick={onCreateMatter}>
            <Plus size={16} />
            <span>{tx("新建案件", "New Matter")}</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="matter-list-error">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button className="btn small" onClick={loadMatters}>
            {tx("重试", "Retry")}
          </button>
        </div>
      ) : loading && matters.length === 0 ? (
        <div className="matter-list-loading">
          <RefreshCw size={24} className="spin" />
          <span>{tx("加载中...", "Loading...")}</span>
        </div>
      ) : matters.length === 0 ? (
        <div className="matter-list-empty">
          <Briefcase size={48} className="matter-list-empty-icon" />
          <h3>{tx("暂无案件", "No matters yet")}</h3>
          <p>{tx("点击「新建案件」开始创建您的第一个案件", "Click \"New Matter\" to create your first matter")}</p>
          <button className="btn primary" onClick={onCreateMatter}>
            <Plus size={16} />
            <span>{tx("新建案件", "New Matter")}</span>
          </button>
        </div>
      ) : (
        <div className="matter-list-grid">
          {matters.map((matter) => {
            const status = STATUS_LABELS[matter.status] || STATUS_LABELS.draft;
            const caseType = CASE_TYPE_LABELS[matter.brief?.caseType] || CASE_TYPE_LABELS.other;
            const isDeleting = deleting === matter.id;

            return (
              <div
                key={matter.id}
                className={`matter-card ${isDeleting ? "deleting" : ""}`}
                onClick={() => !isDeleting && onSelectMatter?.(matter)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isDeleting) onSelectMatter?.(matter);
                }}
              >
                <div className="matter-card-header">
                  <div className="matter-card-title-row">
                    <h3 className="matter-card-title">{matter.name || tx("未命名案件", "Untitled Matter")}</h3>
                    <span className={`pill ${status.color}`}>{lang === "en" ? status.en : status.zh}</span>
                  </div>
                  <p className="matter-card-id">{matter.id}</p>
                </div>

                <div className="matter-card-body">
                  <div className="matter-card-meta">
                    <div className="matter-card-meta-item">
                      <span className="matter-card-meta-label">{tx("案由", "Case Type")}</span>
                      <span className="matter-card-meta-value">{lang === "en" ? caseType.en : caseType.zh}</span>
                    </div>
                    <div className="matter-card-meta-item">
                      <span className="matter-card-meta-label">{tx("法院", "Court")}</span>
                      <span className="matter-card-meta-value">{matter.brief?.court || "-"}</span>
                    </div>
                    <div className="matter-card-meta-item">
                      <span className="matter-card-meta-label">{tx("角色", "Role")}</span>
                      <span className="matter-card-meta-value">
                        {matter.brief?.role === "defendant"
                          ? tx("被告", "Defendant")
                          : matter.brief?.role === "plaintiff"
                            ? tx("原告", "Plaintiff")
                            : "-"}
                      </span>
                    </div>
                    <div className="matter-card-meta-item">
                      <span className="matter-card-meta-label">{tx("创建时间", "Created")}</span>
                      <span className="matter-card-meta-value">{formatDate(matter.createdAt, lang)}</span>
                    </div>
                  </div>

                  {matter.brief?.opponentName ? (
                    <div className="matter-card-opponent">
                      <span className="matter-card-opponent-label">{tx("对方", "Opponent")}</span>
                      <span className="matter-card-opponent-value">{matter.brief.opponentName}</span>
                    </div>
                  ) : null}
                </div>

                <div className="matter-card-footer">
                  <button
                    className="btn small danger"
                    onClick={(e) => handleDelete(e, matter.id, matter.name)}
                    disabled={isDeleting}
                    title={tx("删除", "Delete")}
                  >
                    {isDeleting ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                  </button>
                  <div className="matter-card-open">
                    <span>{tx("打开", "Open")}</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
