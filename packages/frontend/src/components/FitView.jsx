import React from "react";
import { useDropzone } from "react-dropzone";
import { useI18n } from "../lib/i18n";
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
  const { tx } = useI18n();
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
      ? tx("上传中…", "Uploading…")
      : phase === "fitting"
        ? tx("后端拟合中…", "Fitting on backend…")
        : phase === "done"
          ? tx("完成", "Done")
          : phase === "error"
            ? tx("失败", "Failed")
            : tx("就绪", "Ready");

  const percent = typeof progress.percent === "number" ? Math.max(0, Math.min(100, progress.percent)) : undefined;

  return (
    <div className="viz-scroll">
      <div className="notice" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 800 }}>{tx("实时拟合（/api/fit）", "Real-time fit (/api/fit)")}</div>
        <div className="muted" style={{ marginTop: 4 }}>
          {tx("上传 CSV → 后端拟合 → 返回结果（JSON）", "Upload CSV → fit on backend → render JSON result")}
        </div>
      </div>

      <div className="card pad">
        <div className="row split" style={{ gap: 10 }}>
          <div>
            <div className="card-title">{tx("1) 选择 CSV", "1) Select CSV")}</div>
            <div className="card-sub">{tx("拖拽文件或点击选择。", "Drag & drop or click to select.")}</div>
          </div>
          <div className="pill">{statusLabel}</div>
        </div>

        <div className="divider" />

        <div {...getRootProps()} className={`btn dropzone ${isDragActive ? "active" : ""}`} style={{ width: "100%", justifyContent: "center" }}>
          <input {...getInputProps()} />
          {isDragActive ? tx("松开导入…", "Drop to select…") : tx("拖拽 CSV / 点击选择", "Drop CSV / click to select")}
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
              tx("未选择文件", "No file selected")
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className={`btn ${canStart ? "primary" : ""}`} disabled={!canStart} onClick={onStart}>
              {tx("开始拟合", "Fit")}
            </button>
            <button className="btn" disabled={!busy} onClick={onCancel}>
              {tx("取消", "Cancel")}
            </button>
            <button className="btn" disabled={busy && phase !== "done" && phase !== "error"} onClick={reset}>
              {tx("重置", "Reset")}
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
                  ? tx(`上传进度：${percent}%`, `Upload: ${percent}%`)
                  : tx(`已上传：${fmtBytes(progress.loaded)}`, `Uploaded: ${fmtBytes(progress.loaded)}`)}
              </div>
              {phase === "fitting" ? <SmartLoader messages={[tx("拟合中…", "Fitting…"), tx("计算中…", "Computing…")]} /> : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="warning" style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800 }}>{tx("错误", "Error")}</div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{error}</div>
          </div>
        ) : null}

        {result ? (
          <div style={{ marginTop: 12 }}>
            <div className="row split" style={{ marginBottom: 8 }}>
              <div className="card-title">{tx("2) 拟合结果", "2) Fit result")}</div>
              <span className="pill success">{tx("已返回", "Returned")}</span>
            </div>
            <pre className="reasoning-pre">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}

