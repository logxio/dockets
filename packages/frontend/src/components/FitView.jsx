import React from "react";
import { useDropzone } from "react-dropzone";
import SmartLoader from "./SmartLoader";
import { fitCsv } from "../lib/apiClient";

function fmtBytes(n) {
  const num = typeof n === "number" && Number.isFinite(n) ? n : 0;
  if (num < 1024) return `${num} B`;
  const units = ["KB", "MB", "GB"];
  let v = num / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 ? 1 : 2)} ${units[i]}`;
}

export default function FitView() {
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [phase, setPhase] = React.useState("idle"); // idle | uploading | fitting | done | error
  const [progress, setProgress] = React.useState({ loaded: 0, total: undefined, percent: undefined });
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState("");
  const abortRef = React.useRef(null);

  const reset = React.useCallback(() => {
    setBusy(false);
    setPhase("idle");
    setProgress({ loaded: 0, total: undefined, percent: undefined });
    setResult(null);
    setError("");
  }, []);

  React.useEffect(() => () => abortRef.current?.abort?.(), []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: { "text/csv": [".csv"] },
    onDrop: async (files) => {
      const f = files?.[0];
      if (!f) return;
      reset();
      setFile(f);
    },
  });

  const canStart = !!file && !busy;

  const onStart = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setPhase("uploading");
    setProgress({ loaded: 0, total: file.size, percent: 0 });

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const data = await fitCsv(file, {
        signal: ac.signal,
        onProgress: (p) => {
          setProgress(p);
          if (typeof p.percent === "number" && p.percent >= 100) setPhase("fitting");
        },
      });
      setResult(data);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e ?? ""));
      setPhase("error");
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const onCancel = () => abortRef.current?.abort?.();

  const statusLabel =
    phase === "uploading"
      ? "Uploading…"
      : phase === "fitting"
        ? "Fitting on backend…"
        : phase === "done"
          ? "Done"
          : phase === "error"
            ? "Failed"
            : "Ready";

  const percent = typeof progress.percent === "number" ? Math.max(0, Math.min(100, progress.percent)) : undefined;

  return (
    <div className="viz-scroll">
      <div className="notice" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>Real-time fit (/api/fit)</div>
        <div className="muted" style={{ marginTop: 4 }}>
          Upload CSV → fit on backend → render JSON result
        </div>
      </div>

      <div className="card pad">
        <div className="row split" style={{ gap: 10 }}>
          <div>
            <div className="card-title">1) Select CSV</div>
            <div className="card-sub">{"Drag & drop or click to select."}</div>
          </div>
          <div className="pill">{statusLabel}</div>
        </div>

        <div className="divider" />

        <div {...getRootProps()} className={`btn dropzone ${isDragActive ? "active" : ""}`} style={{ width: "100%", justifyContent: "center" }}>
          <input {...getInputProps()} />
          {isDragActive ? "Drop to select…" : "Drop CSV / click to select"}
        </div>

        <div className="row split" style={{ marginTop: 10, gap: 10 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            {file ? (
              <>
                <span style={{ fontWeight: 760 }}>{file.name}</span>
                <span> · </span>
                <span>{fmtBytes(file.size)}</span>
              </>
            ) : (
              "No file selected"
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className={`btn ${canStart ? "primary" : ""}`} disabled={!canStart} onClick={onStart}>
              Fit
            </button>
            <button className="btn" disabled={!busy} onClick={onCancel}>
              Cancel
            </button>
            <button className="btn" disabled={busy && phase !== "done" && phase !== "error"} onClick={reset}>
              Reset
            </button>
          </div>
        </div>

        {busy ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <div className="progress-track" aria-label="upload progress">
              <div className="progress-bar" style={{ width: `${typeof percent === "number" ? percent : 20}%` }} />
            </div>
            <div className="row split" style={{ gap: 10 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                {typeof percent === "number"
                  ? `Upload: ${percent}%`
                  : `Uploaded: ${fmtBytes(progress.loaded)}`}
              </div>
              {phase === "fitting" ? <SmartLoader messages={["Fitting…", "Computing…"]} /> : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="warning" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800 }}>Error</div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{error}</div>
          </div>
        ) : null}

        {result ? (
          <div style={{ marginTop: 12 }}>
            <div className="row split" style={{ marginBottom: 8 }}>
              <div className="card-title">2) Fit result</div>
              <span className="pill success">Returned</span>
            </div>
            <pre className="reasoning-pre">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

