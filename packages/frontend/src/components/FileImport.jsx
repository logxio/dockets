import React from "react";
import { useDropzone } from "react-dropzone";
import { parseDelimitedFile, parseDelimitedText, guessMapping } from "../lib/parse";
import { useI18n } from "../lib/i18n";

function pickPreviewHeaders(headers, mapping) {
  const prioritized = [
    mapping?.sender,
    mapping?.receiver,
    mapping?.metabolite,
    mapping?.sensor,
    mapping?.score,
    mapping?.annotation,
    "RowId",
    "CaseId",
  ]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const h of prioritized) {
    if (!headers.includes(h)) continue;
    if (seen.has(h)) continue;
    out.push(h);
    seen.add(h);
  }
  for (const h of headers) {
    if (out.length >= 8) break;
    if (seen.has(h)) continue;
    out.push(h);
    seen.add(h);
  }
  return out;
}

function headersFromRows(rows) {
  const set = new Set();
  for (const r of rows) Object.keys(r ?? {}).forEach((k) => set.add(k));
  return [...set];
}

function SelectRow({ label, value, options, required, onChange, unselectedLabel, disabled }) {
  return (
    <div className="field">
      <div className="label">
        {label}
        {required ? <span style={{ color: "var(--danger)" }}> *</span> : null}
      </div>
      <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={!!disabled}>
        <option value="">{unselectedLabel ?? ""}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function applyMahariPreset(headers, mapping) {
  const has = (name) => headers.includes(name);
  const next = { ...mapping };
  if (has("PlaintiffFirm")) next.sender = "PlaintiffFirm";
  if (has("DefendantFirm")) next.receiver = "DefendantFirm";
  if (has("CaseType")) next.metabolite = "CaseType";
  if (has("Court")) next.sensor = "Court";
  if (has("Outcome")) next.annotation = "Outcome";
  if (has("Weight")) next.score = "Weight";
  return next;
}

export default function FileImport({ onLoaded, onError }) {
  const { t } = useI18n();
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState(null);
  const [headers, setHeaders] = React.useState([]);
  const [mapping, setMapping] = React.useState({ sender: "", receiver: "" });
  const [busy, setBusy] = React.useState(false);

  const loadRows = async (name, getRows) => {
    setBusy(true);
    try {
      const parsed = await getRows();
      const hs = headersFromRows(parsed);
      const guess = guessMapping(hs);
      setFileName(name);
      setRows(parsed);
      setHeaders(hs);
      const next = {
        sender: guess.sender,
        receiver: guess.receiver,
        metabolite: guess.metabolite,
        sensor: guess.sensor,
        score: guess.score,
        annotation: guess.annotation,
      };
      setMapping(applyMahariPreset(hs, next));
    } catch (e) {
      onError(e instanceof Error ? e.message : t("fileImport.errors.importFailed"));
    } finally {
      setBusy(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "text/plain": [".txt"],
    },
    onDrop: async (files) => {
      const f = files?.[0];
      if (!f) return;
      await loadRows(f.name, () => parseDelimitedFile(f));
    },
  });

  const canStart = !!rows?.length && !!mapping.sender && !!mapping.receiver;
  const previewHeaders = React.useMemo(() => pickPreviewHeaders(headers, mapping), [headers, mapping]);
  const previewRows = React.useMemo(() => (Array.isArray(rows) ? rows.slice(0, 8) : []), [rows]);
  const mappingHint = React.useMemo(() => {
    if (!rows?.length) return "";
    const sample = rows.slice(0, Math.min(800, rows.length));
    const countNonEmpty = (key) => {
      if (!key) return 0;
      let n = 0;
      for (const r of sample) {
        const v = r?.[key];
        if (String(v ?? "").trim()) n += 1;
      }
      return n;
    };
    const senderOk = countNonEmpty(mapping.sender);
    const receiverOk = countNonEmpty(mapping.receiver);
    const total = sample.length || 1;
    const pct = (x) => Math.round((x / total) * 100);
    return `${t("fileImport.currentFile")} ${fileName ? fileName : t("fileImport.notSelected")} · ${t("fileImport.rowsSuffix")}: ${rows.length.toLocaleString()} · ${t("fileImport.mapping.plaintiff")}: ${pct(senderOk)}% · ${t("fileImport.mapping.defendant")}: ${pct(receiverOk)}%`;
  }, [rows, mapping.sender, mapping.receiver, fileName, t]);

  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn small primary"
          disabled={busy}
          onClick={() => {
            return loadRows("mahari_top100_interactions.csv", async () => {
              const res = await fetch("/sample/mahari_top100_interactions.csv");
              if (!res.ok) throw new Error(t("fileImport.errors.loadTop100Failed"));
              return parseDelimitedText(await res.text());
            });
          }}
          title={t("fileImport.presetLoadTip")}
        >
          {t("fileImport.preset")}
        </button>

        <div {...getRootProps()} className={`btn small dropzone ${isDragActive ? "active" : ""}`}>
          <input {...getInputProps()} />
          {isDragActive ? t("fileImport.dropActive") : t("fileImport.dropIdle")}
        </div>
      </div>

      <div style={{ marginTop: 10 }} className="muted">
        <span style={{ fontSize: 12 }}>
          {t("fileImport.currentFile")} <span className="td-strong">{fileName ? fileName : t("fileImport.notSelected")}</span>
          {rows ? ` (${rows.length} ${t("fileImport.rowsSuffix")})` : ""}
        </span>
      </div>

      {rows?.length ? (
        <details className="details-block" style={{ marginTop: 10 }}>
          <summary className="details-summary">Preview / mapping quality</summary>
          <div style={{ height: 10 }} />
          <div className="muted" style={{ fontSize: 12 }}>
            {mappingHint}
          </div>
          {previewRows.length && previewHeaders.length ? (
            <div style={{ marginTop: 10 }}>
              <div className="table-wrap-responsive">
                <table className="table-responsive">
                  <thead>
                    <tr>
                      {previewHeaders.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, idx) => (
                      <tr key={idx}>
                        {previewHeaders.map((h) => (
                          <td key={h} data-label={h}>
                            {String(r?.[h] ?? "").slice(0, 120)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {`Showing first ${previewRows.length} rows · ${previewHeaders.length} columns`}
              </div>
            </div>
          ) : null}
        </details>
      ) : null}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <SelectRow
          label={t("fileImport.mapping.plaintiff")}
          required
          options={headers}
          value={mapping.sender}
          onChange={(v) => setMapping((m) => ({ ...m, sender: v }))}
          unselectedLabel={headers.length ? t("fileImport.mapping.unselected") : "(load a file first)"}
          disabled={!headers.length}
        />
        <SelectRow
          label={t("fileImport.mapping.defendant")}
          required
          options={headers}
          value={mapping.receiver}
          onChange={(v) => setMapping((m) => ({ ...m, receiver: v }))}
          unselectedLabel={headers.length ? t("fileImport.mapping.unselected") : "(load a file first)"}
          disabled={!headers.length}
        />
        <SelectRow
          label={t("fileImport.mapping.caseType")}
          options={headers}
          value={mapping.metabolite}
          onChange={(v) => setMapping((m) => ({ ...m, metabolite: v || undefined }))}
          unselectedLabel={headers.length ? t("fileImport.mapping.unselected") : "(load a file first)"}
          disabled={!headers.length}
        />
        <SelectRow
          label={t("fileImport.mapping.court")}
          options={headers}
          value={mapping.sensor}
          onChange={(v) => setMapping((m) => ({ ...m, sensor: v || undefined }))}
          unselectedLabel={headers.length ? t("fileImport.mapping.unselected") : "(load a file first)"}
          disabled={!headers.length}
        />
        <SelectRow
          label={t("fileImport.mapping.weight")}
          options={headers}
          value={mapping.score}
          onChange={(v) => setMapping((m) => ({ ...m, score: v || undefined }))}
          unselectedLabel={headers.length ? t("fileImport.mapping.unselected") : "(load a file first)"}
          disabled={!headers.length}
        />
        <SelectRow
          label={t("fileImport.mapping.outcome")}
          options={headers}
          value={mapping.annotation}
          onChange={(v) => setMapping((m) => ({ ...m, annotation: v || undefined }))}
          unselectedLabel={headers.length ? t("fileImport.mapping.unselected") : "(load a file first)"}
          disabled={!headers.length}
        />
      </div>

      <div className="row split" style={{ marginTop: 12 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {busy ? t("fileImport.processing") : canStart ? t("fileImport.canStart") : t("fileImport.needMapping")}
        </div>
        <button
          className={`btn ${canStart ? "primary" : ""}`}
          disabled={!canStart || busy}
          onClick={() => onLoaded({ rawRows: rows, columnMapping: mapping, fileName })}
        >
          {t("fileImport.start")}
        </button>
      </div>
    </div>
  );
}
