import React from "react";
import { createMatter, getMatter, health, parseMatterDocumentWithProgress, pollJob, startMatterIntakeWithProgress } from "../lib/apiClient";
import { X, Briefcase, AlertCircle, Upload, FileText, XCircle } from "lucide-react";

const CASE_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "civil_rights", label: "Civil Rights" },
  { value: "labor", label: "Labor" },
  { value: "torts", label: "Torts" },
  { value: "other", label: "Other" },
];

const ROLES = [
  { value: "defendant", label: "Defendant" },
  { value: "plaintiff", label: "Plaintiff" },
];

const JURISDICTIONS = [
  { value: "US", label: "United States" },
];

export default function CreateMatterModal({ open, onClose, onCreated }) {

  const SAMPLE_INTAKE_TEXT = React.useMemo(
    () =>
      [
        "UNITED STATES DISTRICT COURT",
        "NORTHERN DISTRICT OF CALIFORNIA",
        "",
        "ACME, INC. v. BETA INC.",
        "",
        "COMPLAINT FOR BREACH OF CONTRACT",
        "Damages exceed $5,000,000.",
        "Client role: Plaintiff",
        "Opposing counsel: Skadden, Arps, Slate, Meagher & Flom LLP",
        "Estimated litigation budget (USD): 500,000",
        "Notes: Need outside counsel shortlist + pricing rationale for CFO; prefer alternative fee discussion.",
      ].join("\n"),
    []
  );

  const SAMPLE_PREFILL_BRIEF = React.useMemo(
    () => ({
      jurisdiction: "US",
      court: "N.D. Cal.",
      judge: null,
      caseType: "contract",
      role: "plaintiff",
      opponentName: "BETA INC.",
      opponentCounsel: "Skadden, Arps, Slate, Meagher & Flom LLP",
      notes: "Need outside counsel shortlist + pricing rationale for CFO; prefer alternative fee discussion.",
      constraints: { budgetUsd: 500000, preferredFirms: [], excludedFirms: [], geo: [], panelOnly: false },
      extracted: { caption: "ACME, INC. v. BETA INC.", plaintiff: "ACME, INC.", defendant: "BETA INC.", amountHint: "$5,000,000" },
    }),
    []
  );

  const [form, setForm] = React.useState({
    name: "",
    jurisdiction: "US",
    court: "",
    caseType: "contract",
    role: "defendant",
    opponentName: "",
    opponentCounsel: "",
    notes: "",
    budgetUsd: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [apiStatus, setApiStatus] = React.useState({ ok: null, message: "" });
  const [importText, setImportText] = React.useState("");
  const [importFile, setImportFile] = React.useState(null);
  const [importing, setImporting] = React.useState(false);
  const [importDragActive, setImportDragActive] = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(null); // 0-100 or null
  const [importWarnings, setImportWarnings] = React.useState([]);
  const [importPreview, setImportPreview] = React.useState(null);
  const [importTextPreview, setImportTextPreview] = React.useState(null);
  const [importMeta, setImportMeta] = React.useState(null);
  const [intaking, setIntaking] = React.useState(false);
  const [intakeProgress, setIntakeProgress] = React.useState(null); // 0-100 or null
  const [intakeStage, setIntakeStage] = React.useState(null);
  const fileInputRef = React.useRef(null);

  const intakeStageLabel = React.useMemo(() => {
    const s = String(intakeStage || "");
    if (!s) return "";
    if (s === "upload") return "Uploading";
    if (s === "processing") return "Processing";
    if (s === "extract") return "Extracting text";
    if (s === "parse") return "Parsing fields";
    if (s === "create_matter") return "Creating matter";
    if (s === "recommend") return "Shortlisting firms";
    if (s === "evidence") return "Gathering evidence";
    if (s === "pack") return "Generating pack";
    if (s === "done") return "Done";
    return s;
  }, [intakeStage]);

  const resetForm = React.useCallback(() => {
    setForm({
      name: "",
      jurisdiction: "US",
      court: "",
      caseType: "contract",
      role: "defendant",
      opponentName: "",
      opponentCounsel: "",
      notes: "",
      budgetUsd: "",
    });
    setError(null);
    setImportText("");
    setImportFile(null);
    setImportProgress(null);
    setImportWarnings([]);
    setImportPreview(null);
    setImportTextPreview(null);
    setImportMeta(null);
    setIntaking(false);
    setIntakeProgress(null);
    setIntakeStage(null);
  }, []);

  React.useEffect(() => {
    if (open) {
      resetForm();
      setApiStatus({ ok: null, message: "" });
    }
  }, [open, resetForm]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await health();
        if (cancelled) return;
        setApiStatus({ ok: !!r?.ok, message: "" });
      } catch (err) {
        if (cancelled) return;
        setApiStatus({
          ok: false,
          message:
            err?.message ||
            "Backend API not reachable (start the FastAPI server first)",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const applyParsedBrief = React.useCallback(
    (brief) => {
      if (!brief || typeof brief !== "object") return;
      const constraints = brief.constraints && typeof brief.constraints === "object" ? brief.constraints : {};
      const extracted = brief.extracted && typeof brief.extracted === "object" ? brief.extracted : {};

      setForm((prev) => {
        const next = { ...prev };
        if (!prev.name.trim()) {
          const caption = String(extracted.caption || "").trim();
          if (caption) {
            const ct = String(brief.caseType || "").trim();
            const court = String(brief.court || "").trim();
            const suffix = [ct, court].filter(Boolean).join(" · ");
            next.name = suffix ? `${caption} — ${suffix}` : caption;
          }
        }
        if (brief.jurisdiction) next.jurisdiction = brief.jurisdiction;
        if (!prev.court.trim() && brief.court) next.court = String(brief.court || "");
        if (brief.caseType) next.caseType = brief.caseType;
        if (brief.role) next.role = brief.role;

        if (!prev.opponentName.trim()) {
          const explicitOpponent = String(brief.opponentName || "").trim();
          if (explicitOpponent) {
            next.opponentName = explicitOpponent;
          } else {
            const plaintiff = String(extracted.plaintiff || "").trim();
            const defendant = String(extracted.defendant || "").trim();
            const role = String(brief.role || prev.role || "").trim();
            if (role === "defendant" && plaintiff) next.opponentName = plaintiff;
            if (role === "plaintiff" && defendant) next.opponentName = defendant;
          }
        }

        if (!prev.opponentCounsel.trim() && brief.opponentCounsel) next.opponentCounsel = String(brief.opponentCounsel || "");
        if (!prev.notes.trim() && brief.notes) next.notes = String(brief.notes || "");
        if (constraints.budgetUsd != null && String(constraints.budgetUsd) !== "NaN") {
          next.budgetUsd = String(constraints.budgetUsd);
        }
        return next;
      });
    },
    [setForm]
  );

  const handlePickedFile = React.useCallback(
    async (f) => {
      if (!f) return;
      try {
        const name = String(f.name || "").toLowerCase();
        const isPdf = f.type === "application/pdf" || name.endsWith(".pdf");
        setError(null);
        setImportWarnings([]);
        setImportPreview(null);
        setImportTextPreview(null);
        setImportMeta(null);
        setImportProgress(null);
        if (isPdf) {
          setImportFile(f);
          setImportText("");
        } else {
          const text = await f.text();
          setImportFile(null);
          setImportText(text);
        }
      } catch (err) {
        setError(err?.message || "Failed to read file");
      }
    },
    []
  );

  const handleImportFile = async (e) => {
    const f = e.target.files?.[0] ?? null;
    await handlePickedFile(f);
  };

  const parseAndFill = React.useCallback(async ({ file, text } = {}) => {
    setImporting(true);
    setError(null);
    setImportWarnings([]);
    setImportPreview(null);
    setImportTextPreview(null);
    setImportMeta(null);
    setImportProgress(file ? 1 : null);
    try {
      const parsed = await parseMatterDocumentWithProgress(
        { file, text },
        {
          onProgress: ({ percent }) => {
            if (typeof percent === "number") setImportProgress(Math.max(1, Math.min(99, percent)));
          },
        }
      );
      setImportWarnings(Array.isArray(parsed?.warnings) ? parsed.warnings : []);
      setImportPreview(parsed?.fields ?? null);
      setImportTextPreview(typeof parsed?.textPreview === "string" ? parsed.textPreview : null);
      setImportMeta(parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : null);
      applyParsedBrief(parsed?.brief ?? null);
    } catch (err) {
      setError(err?.message || "Failed to parse document");
    } finally {
      setImportProgress(null);
      setImporting(false);
    }
  }, [applyParsedBrief]);

  const handleParseImport = async () => {
    const text = String(importText || "").trim();
    if (!importFile && !text) {
      setError("Upload a document or paste text first");
      return;
    }
    return parseAndFill({ file: importFile, text: importFile ? undefined : text });
  };

  const handleOneClickIntake = async () => {
    const text = String(importText || "").trim();
    if (!importFile && !text) {
      setError("Upload a document or paste text first");
      return;
    }
    if (apiStatus.ok === false) {
      setError(
        "Backend API not reachable: start FastAPI (port 8000 or 8001), then run one-click intake."
      );
      return;
    }

    setIntaking(true);
    setIntakeStage("upload");
    setIntakeProgress(importFile ? 1 : null);
    setError(null);
    setImportWarnings([]);
    setImportPreview(null);
    setImportTextPreview(null);
    setImportMeta(null);

    try {
      const accepted = await startMatterIntakeWithProgress(
        { file: importFile, text: importFile ? undefined : text },
        {
          onProgress: ({ percent }) => {
            if (typeof percent === "number") setIntakeProgress(Math.max(1, Math.min(99, percent)));
          },
        }
      );
      const jobId = accepted?.jobId;
      if (!jobId) {
        throw new Error("Missing jobId");
      }
      setIntakeStage("processing");
      setIntakeProgress(10);

      const job = await pollJob(jobId, {
        interval: 900,
        timeout: 180000,
        onProgress: (p) => {
          if (typeof p === "number" && Number.isFinite(p)) setIntakeProgress(Math.max(5, Math.min(99, Math.round(p * 100))));
        },
      });

      const stage = job?.result?.stage ?? null;
      if (stage) setIntakeStage(String(stage));
      const warnings = Array.isArray(job?.result?.warnings) ? job.result.warnings : [];
      const preview = typeof job?.result?.textPreview === "string" ? job.result.textPreview : null;
      const meta = job?.result?.meta && typeof job.result.meta === "object" ? job.result.meta : null;
      setImportWarnings(warnings);
      setImportTextPreview(preview);
      setImportMeta(meta);

      const matterId = job?.result?.matterId;
      if (!matterId) {
        throw new Error("Intake finished but missing matterId");
      }
      const matter = await getMatter(matterId);
      onCreated?.(matter);
      onClose?.();
    } catch (err) {
      setError(err?.message || "One-click intake failed");
    } finally {
      setIntakeProgress(null);
      setIntakeStage(null);
      setIntaking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Please enter a matter name");
      return;
    }
    if (apiStatus.ok === false) {
      setError(
        "Backend API not reachable: start FastAPI first (see below), then create the matter."
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        name: form.name.trim(),
        brief: {
          jurisdiction: form.jurisdiction,
          court: form.court.trim() || undefined,
          caseType: form.caseType,
          role: form.role,
          opponentName: form.opponentName.trim() || undefined,
          opponentCounsel: form.opponentCounsel.trim() || undefined,
          notes: form.notes.trim() || undefined,
          constraints: {
            budgetUsd: form.budgetUsd ? Number(form.budgetUsd) : undefined,
          },
        },
      };

      const matter = await createMatter(payload);
      onCreated?.(matter);
      onClose?.();
    } catch (err) {
      setError(err.message || "Failed to create matter");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={intaking || submitting ? undefined : onClose}>
      <div className="modal-content modal-lg create-matter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-title">
            <Briefcase size={20} />
            <div>
              <h2>New Matter</h2>
              <div className="modal-subtitle">
                Auto-extract → One-click Decision Pack
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} disabled={intaking || submitting} title="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error ? (
              <div className="form-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            {apiStatus.ok === false ? (
              <div className="form-error" style={{ opacity: 0.95 }}>
                <AlertCircle size={16} />
                <span>
                  Backend not reachable: start FastAPI (port 8000 or 8001), then verify `http://127.0.0.1:8001/api/health` or `http://127.0.0.1:8000/api/health`.
                </span>
              </div>
            ) : null}

            <div className="form-section">
              <h3 className="form-section-title">Auto-extract from documents (optional)</h3>

              <div className="form-hint" style={{ marginTop: -6, marginBottom: 12 }}>
                Upload a document and we’ll auto-extract court/case type/parties and prefill the form (you just confirm).
              </div>

              <div className="form-group">
                <label className="form-label">Upload PDF (scanned PDFs supported)</label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown"
                  onChange={handleImportFile}
                  style={{ display: "none" }}
                />

                <div
                  className={`doc-dropzone ${importDragActive ? "active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click?.()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") fileInputRef.current?.click?.();
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setImportDragActive(true);
                  }}
                  onDragLeave={() => setImportDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setImportDragActive(false);
                    const f = e.dataTransfer?.files?.[0] ?? null;
                    void handlePickedFile(f);
                  }}
                >
                  <div className="doc-dropzone-row">
                    <div className="doc-dropzone-icon">
                      <Upload size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="doc-dropzone-title">
                        {"Drag & drop a PDF here (scanned PDFs supported), or click to choose"}
                      </div>
                      <div className="doc-dropzone-sub">
                        We’ll auto-extract and prefill (also supports .md/.txt)
                      </div>
                    </div>
                  </div>
                </div>

                {importFile ? (
                  <div className="file-chip-row">
                    <div className="file-chip">
                      <FileText size={14} />
                      <span className="file-chip-name" title={importFile.name}>
                        {importFile.name}
                      </span>
                      <span className="file-chip-meta">{Math.max(1, Math.round(importFile.size / 1024)).toLocaleString()} KB</span>
                      <button
                        type="button"
                        className="file-chip-remove"
                        onClick={() => {
                          setImportFile(null);
                          setImportProgress(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        title="Remove file"
                        disabled={importing || submitting}
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  </div>
                ) : null}

                {importing ? (
                  <div className="progress-row">
                    <div className={`progress-bar ${typeof importProgress === "number" ? "" : "indeterminate"}`}>
                      <div
                        className="progress-bar-fill"
                        style={typeof importProgress === "number" ? { width: `${importProgress}%` } : undefined}
                      />
                    </div>
                    <div className="form-hint" style={{ marginTop: 6 }}>
                      Parsing and prefilling…
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="form-group">
                <label className="form-label">Or paste text (optional)</label>
                <textarea
                  className="form-textarea"
                  placeholder="Paste complaint/email text (or OCR text)..."
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="form-actions-row">
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleOneClickIntake}
                  disabled={intaking || importing || submitting}
                  title="Auto-extract → create matter → recommend → generate pack"
                >
                  {intaking ? "Running pipeline..." : "One-click (recommended)"}
                </button>
                <button type="button" className="btn" onClick={handleParseImport} disabled={intaking || importing || submitting}>
                  {importing ? "Parsing..." : "Parse & Fill"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setImportText("");
                    setImportFile(null);
                    setImportProgress(null);
                    setImportWarnings([]);
                    setImportPreview(null);
                    setImportTextPreview(null);
                    setImportMeta(null);
                  }}
                  disabled={intaking || importing || submitting}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setError(null);
                    setImportFile(null);
                    setImportProgress(null);
                    setImportText(SAMPLE_INTAKE_TEXT);
                    setImportWarnings([]);
                    setImportPreview([
                      { key: "caption", value: "ACME, INC. v. BETA INC." },
                      { key: "court", value: "N.D. Cal." },
                      { key: "caseType", value: "contract" },
                      { key: "role", value: "plaintiff" },
                      { key: "opponentName", value: "BETA INC." },
                      { key: "budgetUsd", value: 500000 },
                    ]);
                    setImportTextPreview(SAMPLE_INTAKE_TEXT);
                    setImportMeta({ source: "sample" });
                    applyParsedBrief(SAMPLE_PREFILL_BRIEF);
                  }}
                  disabled={intaking || importing || submitting}
                >
                  Sample: Auto-fill
                </button>
              </div>

              {intaking ? (
                <div className="progress-row" style={{ marginTop: 12 }}>
                  <div className={`progress-bar ${typeof intakeProgress === "number" ? "" : "indeterminate"}`}>
                    <div
                      className="progress-bar-fill"
                      style={typeof intakeProgress === "number" ? { width: `${intakeProgress}%` } : undefined}
                    />
                  </div>
                  <div className="form-hint" style={{ marginTop: 6 }}>
                    Pipeline: extract → shortlist → decision pack
                    {intakeStageLabel ? ` · ${intakeStageLabel}` : ""}
                  </div>
                </div>
              ) : null}

              {importWarnings?.length ? (
                <div className="parse-notice" style={{ marginTop: 10 }}>
                  <div className="parse-notice-title">
                    <AlertCircle size={14} />
                    <span>Extraction notes</span>
                  </div>
                  <div className="parse-notice-body">{importWarnings.join(" / ")}</div>
                </div>
              ) : null}

              {Array.isArray(importPreview) && importPreview.length ? (
                <div className="form-hint" style={{ marginTop: 8 }}>
                  {"Extracted: "}
                  {importPreview
                    .slice(0, 6)
                    .map((f) => {
                      const k = String(f?.key ?? "");
                      const v = String(f?.value ?? "");
                      const label =
                        k === "caption"
                          ? "Caption"
                          : k === "court"
                          ? "Court"
                          : k === "amountHint"
                          ? "Amount hint"
                          : k === "caseType"
                          ? "Case type"
                          : k || "Field";
                      return `${label}: ${v}`;
                    })
                    .join(" · ")}
                </div>
              ) : null}

              {importTextPreview ? (
                <details className="parse-preview-details">
                  <summary className="parse-preview-summary">
                    <FileText size={14} />
                    <span>View extracted text (preview)</span>
                    {importMeta?.ocrUsed ? <span className="parse-preview-badge">OCR</span> : null}
                  </summary>
                  <pre className="parse-preview">{importTextPreview}</pre>
                </details>
              ) : null}
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Basic Information</h3>

              <div className="form-group">
                <label className="form-label required">Matter Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Acme v. Beta — Contract (NDCA)"
                  value={form.name}
                  onChange={handleChange("name")}
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Jurisdiction</label>
                  <select className="form-select" value={form.jurisdiction} onChange={handleChange("jurisdiction")}>
                    {JURISDICTIONS.map((j) => (
                      <option key={j.value} value={j.value}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Court</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., N.D. Cal."
                    value={form.court}
                    onChange={handleChange("court")}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Case Type</label>
                  <select className="form-select" value={form.caseType} onChange={handleChange("caseType")}>
                    {CASE_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Your Role</label>
                  <select className="form-select" value={form.role} onChange={handleChange("role")}>
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">Opponent Information</h3>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Opponent Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Beta Inc."
                    value={form.opponentName}
                    onChange={handleChange("opponentName")}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Opponent Counsel</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Skadden Arps"
                    value={form.opponentCounsel}
                    onChange={handleChange("opponentCounsel")}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="form-section-title">{"Budget & Notes"}</h3>

              <div className="form-group">
                <label className="form-label">Budget (USD)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="e.g., 500000"
                  value={form.budgetUsd}
                  onChange={handleChange("budgetUsd")}
                  min="0"
                  step="1000"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  placeholder="Any additional information..."
                  value={form.notes}
                  onChange={handleChange("notes")}
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? "Creating..." : "Create Matter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
