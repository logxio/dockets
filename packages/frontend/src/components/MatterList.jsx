import React from "react";
import { listMatters, deleteMatter } from "../lib/apiClient";
import { Briefcase, Plus, Trash2, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";

const STATUS_LABELS = {
  draft: { label: "Draft", color: "gray" },
  ready: { label: "Ready", color: "green" },
  archived: { label: "Archived", color: "orange" },
};

const CASE_TYPE_LABELS = {
  civil_rights: "Civil Rights",
  contract: "Contract",
  labor: "Labor",
  torts: "Torts",
  other: "Other",
};

function formatDate(isoString) {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
  }
}

export default function MatterList({ onSelectMatter, onCreateMatter }) {

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
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadMatters();
  }, [loadMatters]);

  const handleDelete = React.useCallback(
    async (e, matterId, matterName) => {
      e.stopPropagation();
      const confirmed = window.confirm(
        `Are you sure you want to delete "${matterName}"? This action cannot be undone.`
      );
      if (!confirmed) return;

      setDeleting(matterId);
      try {
        await deleteMatter(matterId);
        setMatters((prev) => prev.filter((m) => m.id !== matterId));
      } catch (err) {
        alert(err.message || "Delete failed");
      } finally {
        setDeleting(null);
      }
    },
    []
  );

  return (
    <div className="matter-list">
      <div className="matter-list-header">
        <div className="matter-list-title-group">
          <Briefcase size={24} className="matter-list-icon" />
          <div>
            <h1
              className="matter-list-title"
              title="Manage your legal matters and decision packs"
            >
              Matters
            </h1>
          </div>
        </div>
        <div className="matter-list-actions">
          <button className="btn small" onClick={loadMatters} disabled={loading} title="Refresh">
            <RefreshCw size={16} className={loading ? "spin" : ""} />
          </button>
          <button className="btn primary" onClick={onCreateMatter}>
            <Plus size={16} />
            <span>New Matter</span>
          </button>
        </div>
      </div>

      {error ? (
        <div className="matter-list-error">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button className="btn small" onClick={loadMatters}>
            Retry
          </button>
        </div>
      ) : loading && matters.length === 0 ? (
        <div className="matter-list-loading">
          <RefreshCw size={24} className="spin" />
          <span>Loading...</span>
        </div>
      ) : matters.length === 0 ? (
        <div className="matter-list-empty">
          <Briefcase size={48} className="matter-list-empty-icon" />
          <h3>No matters yet</h3>
          <p>Click "New Matter" to create your first matter</p>
          <button className="btn primary" onClick={onCreateMatter}>
            <Plus size={16} />
            <span>New Matter</span>
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
                    <h3 className="matter-card-title">{matter.name || "Untitled Matter"}</h3>
                    <span className={`pill ${status.color}`}>{status.label}</span>
                  </div>
                  <p className="matter-card-id">{matter.id}</p>
                </div>

                <div className="matter-card-body">
                  <div className="matter-card-meta">
                    <div className="matter-card-meta-item">
                      <span className="matter-card-meta-label">Case Type</span>
                      <span className="matter-card-meta-value">{caseType}</span>
                    </div>
                    <div className="matter-card-meta-item">
                      <span className="matter-card-meta-label">Court</span>
                      <span className="matter-card-meta-value">{matter.brief?.court || "-"}</span>
                    </div>
                    <div className="matter-card-meta-item">
                      <span className="matter-card-meta-label">Role</span>
                      <span className="matter-card-meta-value">
                        {matter.brief?.role === "defendant"
                          ? "Defendant"
                          : matter.brief?.role === "plaintiff"
                            ? "Plaintiff"
                            : "-"}
                      </span>
                    </div>
                    <div className="matter-card-meta-item">
                      <span className="matter-card-meta-label">Created</span>
                      <span className="matter-card-meta-value">{formatDate(matter.createdAt)}</span>
                    </div>
                  </div>

                  {matter.brief?.opponentName ? (
                    <div className="matter-card-opponent">
                      <span className="matter-card-opponent-label">Opponent</span>
                      <span className="matter-card-opponent-value">{matter.brief.opponentName}</span>
                    </div>
                  ) : null}
                </div>

                <div className="matter-card-footer">
                  <button
                    className="btn small danger"
                    onClick={(e) => handleDelete(e, matter.id, matter.name)}
                    disabled={isDeleting}
                    title="Delete"
                  >
                    {isDeleting ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                  </button>
                  <div className="matter-card-open">
                    <span>Open</span>
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
