import React from "react";
import { useDropzone } from "react-dropzone";
import { parseDelimitedFile, parseDelimitedText, guessMapping } from "../lib/parse";
import { isDemoMode } from "../lib/demoMode";
import { useI18n } from "../lib/i18n";

function headersFromRows(rows) {
  const set = new Set();
  for (const r of rows) Object.keys(r ?? {}).forEach((k) => set.add(k));
  return [...set];
}

function SelectRow({ label, value, options, required, onChange, unselectedLabel }) {
  return (
    <div className="field">
      <div className="label">
        {label}
        {required ? <span style={{ color: "var(--danger)" }}> *</span> : null}
      </div>
      <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
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
  const demoMode = React.useMemo(() => isDemoMode(window.location.search), []);
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
    disabled: demoMode,
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

  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {demoMode ? (
          <>
            <button
              className="btn small primary"
              disabled={busy}
              onClick={() =>
                loadRows("mahari_top100_interactions.csv", async () => {
                  const res = await fetch("/sample/mahari_top100_interactions.csv");
                  if (!res.ok) throw new Error(t("fileImport.errors.loadTop100Failed"));
                  return parseDelimitedText(await res.text());
                })
              }
              title={t("fileImport.loadTop100Tip")}
            >
              {t("fileImport.loadTop100")}
            </button>
            <button
              className="btn small"
              disabled={busy}
              onClick={() =>
                loadRows("mahari_top50_interactions.csv", async () => {
                  const res = await fetch("/sample/mahari_top50_interactions.csv");
                  if (!res.ok) throw new Error(t("fileImport.errors.loadTop50Failed"));
                  return parseDelimitedText(await res.text());
                })
              }
              title={t("fileImport.loadTop50Tip")}
            >
              {t("fileImport.loadTop50")}
            </button>
          </>
        ) : null}
        <button
          className="btn small"
          disabled={busy}
          onClick={() =>
            loadRows("mahari_lawsuits_example.csv", async () => {
              const res = await fetch("/sample/mahari_lawsuits_example.csv");
              if (!res.ok) throw new Error(t("fileImport.errors.loadExampleFailed"));
              return parseDelimitedText(await res.text());
            })
          }
        >
          {t("fileImport.loadExample")}
        </button>
        {!demoMode ? (
          <button
            className="btn small"
            disabled={busy}
            onClick={() =>
              loadRows("mahari_fig2_moesm4_interactions.csv", async () => {
                const res = await fetch("/sample/mahari_fig2_moesm4_interactions.csv");
                if (!res.ok) throw new Error(t("fileImport.errors.loadFig2Failed"));
                return parseDelimitedText(await res.text());
              })
            }
            title={t("fileImport.fig2Tip")}
          >
            {t("fileImport.loadFig2")}
          </button>
        ) : null}

        {!demoMode ? (
          <div {...getRootProps()} className={`btn small dropzone ${isDragActive ? "active" : ""}`}>
            <input {...getInputProps()} />
            {isDragActive ? t("fileImport.dropActive") : t("fileImport.dropIdle")}
          </div>
        ) : (
          <span className="pill" title={t("fileImport.dropDisabled")}>
            {t("fileImport.dropDisabled")}
          </span>
        )}

        {headers?.length ? (
          <button
            className="btn small"
            disabled={busy}
            onClick={() => setMapping((m) => applyMahariPreset(headers, m))}
            title={t("fileImport.presetTip")}
          >
            {t("fileImport.preset")}
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 10 }} className="muted">
        <span style={{ fontSize: 12 }}>
          {t("fileImport.currentFile")} <span className="td-strong">{fileName ? fileName : t("fileImport.notSelected")}</span>
          {rows ? ` (${rows.length} ${t("fileImport.rowsSuffix")})` : ""}
        </span>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <SelectRow
          label={t("fileImport.mapping.plaintiff")}
          required
          options={headers}
          value={mapping.sender}
          onChange={(v) => setMapping((m) => ({ ...m, sender: v }))}
          unselectedLabel={t("fileImport.mapping.unselected")}
        />
        <SelectRow
          label={t("fileImport.mapping.defendant")}
          required
          options={headers}
          value={mapping.receiver}
          onChange={(v) => setMapping((m) => ({ ...m, receiver: v }))}
          unselectedLabel={t("fileImport.mapping.unselected")}
        />
        <SelectRow
          label={t("fileImport.mapping.caseType")}
          options={headers}
          value={mapping.metabolite}
          onChange={(v) => setMapping((m) => ({ ...m, metabolite: v || undefined }))}
          unselectedLabel={t("fileImport.mapping.unselected")}
        />
        <SelectRow
          label={t("fileImport.mapping.court")}
          options={headers}
          value={mapping.sensor}
          onChange={(v) => setMapping((m) => ({ ...m, sensor: v || undefined }))}
          unselectedLabel={t("fileImport.mapping.unselected")}
        />
        <SelectRow
          label={t("fileImport.mapping.weight")}
          options={headers}
          value={mapping.score}
          onChange={(v) => setMapping((m) => ({ ...m, score: v || undefined }))}
          unselectedLabel={t("fileImport.mapping.unselected")}
        />
        <SelectRow
          label={t("fileImport.mapping.outcome")}
          options={headers}
          value={mapping.annotation}
          onChange={(v) => setMapping((m) => ({ ...m, annotation: v || undefined }))}
          unselectedLabel={t("fileImport.mapping.unselected")}
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
