import React from "react";
import Tooltip from "./Tooltip";
import CitationBadge from "./CitationBadge";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function useTheme() {
  const [theme, setTheme] = React.useState(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });
  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

const DENSITY_KEY = "mccc_explorer_matrix_density_v1";

function loadDensity() {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "fit" || v === "normal" || v === "compact") return v;
  } catch {
    // ignore
  }
  return "fit";
}

function saveDensity(v) {
  try {
    localStorage.setItem(DENSITY_KEY, v);
  } catch {
    // ignore
  }
}

// Light mode: white -> cyan ramp
function heatColorLight(t) {
  const a = [255, 255, 255];
  const b = [8, 145, 178]; // cyan
  const u = clamp01(t);
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Dark mode: dark -> cyan ramp (J2 style)
function heatColorDark(t) {
  const a = [15, 23, 42]; // dark slate
  const b = [0, 212, 255]; // bright cyan
  const u = clamp01(t);
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function heatColor(t, isDark) {
  return isDark ? heatColorDark(t) : heatColorLight(t);
}

export default function MatrixView({ matrix, selectedCell, onSelectCell, selectedPair, onSelectPair, onOpenEvidence }) {
  const theme = useTheme();
  const isDark = theme === "dark";
  const [sortBy, setSortBy] = React.useState("senderSum");
  const scrollRef = React.useRef(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [density, setDensity] = React.useState(() => loadDensity());
  const [zoom, setZoom] = React.useState(1);
  const dragRef = React.useRef({ active: false, x: 0, y: 0, left: 0, top: 0, pid: null });
  const [spaceDown, setSpaceDown] = React.useState(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const update = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.max(0, Math.round(r.width)), h: Math.max(0, Math.round(r.height)) });
    };

    update();

    if (typeof ResizeObserver !== "undefined") {
      const obs = new ResizeObserver(() => update());
      obs.observe(el);
      return () => obs.disconnect();
    }

    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Space") return;
      const tag = String(e.target?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      setSpaceDown(true);
    };
    const onKeyUp = (e) => {
      if (e.code !== "Space") return;
      setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const setDensityAndPersist = (v) => {
    setDensity(v);
    saveDensity(v);
  };

  const clampZoom = (v) => clamp(v, 0.6, 2.4);

  const zoomBy = (delta, anchor) => {
    const el = scrollRef.current;
    if (!el) {
      setZoom((z) => clampZoom(z + delta));
      return;
    }
    const before = clampZoom(zoom);
    const after = clampZoom(before + delta);
    if (after === before) return;

    const rect = el.getBoundingClientRect();
    const ax = typeof anchor?.x === "number" ? anchor.x : rect.width / 2;
    const ay = typeof anchor?.y === "number" ? anchor.y : rect.height / 2;
    const x = el.scrollLeft + ax;
    const y = el.scrollTop + ay;

    const ratio = after / before;
    setZoom(after);

    requestAnimationFrame(() => {
      el.scrollLeft = x * ratio - ax;
      el.scrollTop = y * ratio - ay;
    });
  };

  const resetView = () => {
    const el = scrollRef.current;
    setZoom(1);
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  };

  const onWheel = (e) => {
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const el = scrollRef.current;
      if (!el) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
      return;
    }
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    zoomBy(delta, { x: e.clientX - e.currentTarget.getBoundingClientRect().left, y: e.clientY - e.currentTarget.getBoundingClientRect().top });
  };

  const onPointerDown = (e) => {
    if (!spaceDown) return;
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, pid: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const el = scrollRef.current;
    const d = dragRef.current;
    if (!el || !d.active) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    el.scrollLeft = d.left - dx;
    el.scrollTop = d.top - dy;
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (d.active && d.pid === e.pointerId) dragRef.current.active = false;
  };

  const senderSum = new Map();
  const receiverSum = new Map();
  for (const s of matrix.senders) senderSum.set(s, 0);
  for (const r of matrix.receivers) receiverSum.set(r, 0);
  for (const [k, v] of matrix.pairs.entries()) {
    const [s, r] = k.split("\t");
    senderSum.set(s, (senderSum.get(s) ?? 0) + v.weight);
    receiverSum.set(r, (receiverSum.get(r) ?? 0) + v.weight);
  }

  const senders = [...matrix.senders];
  const receivers = [...matrix.receivers];
  if (sortBy === "senderSum") senders.sort((a, b) => (senderSum.get(b) ?? 0) - (senderSum.get(a) ?? 0));
  if (sortBy === "receiverSum") receivers.sort((a, b) => (receiverSum.get(b) ?? 0) - (receiverSum.get(a) ?? 0));

  const maxW = Math.max(1, ...[...matrix.pairs.values()].map((x) => x.weight));
  const containerW = box.w || (typeof window !== "undefined" ? window.innerWidth : 1200);
  const containerH = box.h || 640;
  const densityCfg =
    density === "compact"
      ? { labelRatio: 0.20, cellMin: 22, rowMin: 22, rowMax: 88 }
      : density === "normal"
        ? { labelRatio: 0.26, cellMin: 32, rowMin: 28, rowMax: 120 }
        : { labelRatio: 0.24, cellMin: 28, rowMin: 26, rowMax: 120 };

  const z = clampZoom(zoom);
  const labelW = clamp(Math.round(containerW * densityCfg.labelRatio), 160, 420);
  const cellMin = Math.max(18, Math.round((containerW < 720 ? densityCfg.cellMin - 2 : densityCfg.cellMin) * z));
  const cellW = clamp(Math.floor((containerW - labelW) / Math.max(1, receivers.length)), cellMin, 220);
  const rowCount = senders.length + 1;
  const rowH = clamp(Math.floor((containerH / Math.max(1, rowCount)) * z), densityCfg.rowMin, densityCfg.rowMax);
  const minGridW = labelW + receivers.length * cellMin;
  const showHeatNumbers = cellW >= 44 && rowH >= 24;
  const isPair = (s, r) => selectedPair?.sender === s && selectedPair?.receiver === r;
  const selectedPairEvidence = React.useMemo(() => {
    if (!selectedPair?.sender || !selectedPair?.receiver) return null;
    const k = `${selectedPair.sender}\t${selectedPair.receiver}`;
    return matrix?.pairs?.get?.(k) ?? null;
  }, [matrix, selectedPair?.sender, selectedPair?.receiver]);

  return (
    <div className="viz-view">
      <div className="row split" style={{ marginBottom: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="pill">
            Heatmap: weight (Weight)
          </div>
          {selectedPairEvidence ? (
            <CitationBadge
              rowIds={selectedPairEvidence.rowIds ?? []}
              onOpenEvidence={(ids) =>
                typeof onOpenEvidence === "function"
                  ? onOpenEvidence(ids, `Cell ${selectedPair.sender}→${selectedPair.receiver} · evidence`)
                  : null
              }
              title={"✅ Citation verified" + ` · ${selectedPair.sender}→${selectedPair.receiver}`}
            />
          ) : null}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            className="select"
            style={{ width: 160 }}
            value={density}
            onChange={(e) => setDensityAndPersist(e.target.value)}
            title="Density: controls cell min size and row height"
          >
            <option value="fit">Density: Fit</option>
            <option value="normal">Density: Normal</option>
            <option value="compact">Density: Compact</option>
          </select>

          <button
            className="btn small"
            type="button"
            onClick={() => zoomBy(-0.12)}
            title="Zoom out (Ctrl/⌘ + wheel also works)"
          >
            −
          </button>
          <span className="pill" title="Zoom">
            {Math.round(z * 100)}%
          </span>
          <button
            className="btn small"
            type="button"
            onClick={() => zoomBy(0.12)}
            title="Zoom in (Ctrl/⌘ + wheel also works)"
          >
            +
          </button>
          <button className="btn small" type="button" onClick={resetView} title="Reset zoom and viewport">
            Reset
          </button>

          <span className="pill" title="Hold Space then drag to pan">
            {spaceDown ? "Pan: ON" : "Pan: hold Space"}
          </span>

          <span className="muted" style={{ fontSize: 12 }}>
            Sort
          </span>
          <select className="select" style={{ width: 180 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="senderSum">By plaintiff total</option>
            <option value="receiverSum">By defendant total</option>
            <option value="none">No sort</option>
          </select>
        </div>
      </div>

      <div
        className="scroll chart-scroll"
        ref={scrollRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: spaceDown ? "grab" : undefined }}
      >
        <div
          className="grid-matrix"
          style={{
            width: "100%",
            minWidth: minGridW,
            minHeight: "100%",
            gridAutoRows: `${rowH}px`,
            gridTemplateColumns: `${labelW}px repeat(${receivers.length}, minmax(${cellMin}px, 1fr))`,
          }}
        >
          <div className="cell head sticky-top sticky-left">Plaintiff \\ Defendant</div>
          {receivers.map((r) => (
            <div
              key={r}
              className={`cell head sticky-top ${r === selectedCell ? "selected" : ""}`}
              style={{ justifyContent: "center", cursor: "pointer" }}
              onClick={() => onSelectCell(r)}
            >
              <Tooltip content={r}>
                <div style={{ maxWidth: cellW - 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r}</div>
              </Tooltip>
            </div>
          ))}

          {senders.map((s) => (
            <React.Fragment key={s}>
              <div
                className="cell sticky-left label"
                style={{
                  fontWeight: s === selectedCell ? 800 : 650,
                  color: s === selectedCell ? "var(--primary-strong)" : "var(--text)",
                }}
                onClick={() => onSelectCell(s)}
              >
                <Tooltip content={s} maxWidth={520}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</div>
                </Tooltip>
              </div>
              {receivers.map((r) => {
                const v = matrix.pairs.get(`${s}\t${r}`)?.weight ?? 0;
                const bg = v ? heatColor(clamp01(v / maxW), isDark) : (isDark ? "rgba(15,23,42,0.6)" : "white");
                const fg = isDark
                  ? (v / maxW > 0.55 ? "rgba(2,6,23,0.92)" : "rgba(248,250,252,0.78)")
                  : (v / maxW > 0.55 ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.78)");
                const valueText = v ? v.toFixed(2) : "";
                return (
                  <div
                    key={`${s}\t${r}`}
                    className={`cell heat ${isPair(s, r) ? "selected-pair" : ""} ${!showHeatNumbers && v ? "heat-value-hidden" : ""}`}
                    title={`${s} → ${r}\nweight=${v.toFixed(3)}`}
                    data-value={!showHeatNumbers && v ? valueText : undefined}
                    style={{ background: bg, color: fg, justifyContent: "center", cursor: v ? "pointer" : "default" }}
                    onClick={() => (v && typeof onSelectPair === "function" ? onSelectPair({ sender: s, receiver: r }) : null)}
                  >
                    {showHeatNumbers ? valueText : ""}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
