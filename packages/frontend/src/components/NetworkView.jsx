import React from "react";
import { createPortal } from "react-dom";
import CytoscapeComponent from "react-cytoscapejs";
import { useI18n } from "../lib/i18n";

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

// Light mode: cyan ramp
function edgeColorLight(t) {
  const a = [191, 219, 254];
  const b = [8, 145, 178];
  const u = clamp01(t);
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// Dark mode: cyan-green ramp (J2 style)
function edgeColorDark(t) {
  const a = [0, 80, 100]; // dark cyan
  const b = [0, 212, 255]; // bright cyan
  const u = clamp01(t);
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function edgeColor(t, isDark) {
  return isDark ? edgeColorDark(t) : edgeColorLight(t);
}

export default function NetworkView({
  nodes,
  links,
  selectedCell,
  onSelectCell,
  selectedPair,
  onSelectPair,
  onApi,
  onFullscreenChange,
}) {
  const { t } = useI18n();
  const theme = useTheme();
  const isDark = theme === "dark";
  const cyRef = React.useRef(null);
  const containerRef = React.useRef(null);
  const hoverRef = React.useRef({ active: false, text: "", x: 0, y: 0 });
  const rafRef = React.useRef(0);
  const fitRaf = React.useRef(0);
  const lastUserInteractAt = React.useRef(0);
  const [hover, setHover] = React.useState(null); // {text,x,y}
  const weightLabel = "Weight";

  const maxNode = Math.max(1, ...nodes.map((n) => n.weight));
  const maxEdge = Math.max(1, ...links.map((l) => l.weight));

  const elements = React.useMemo(() => {
    const els = [];
    for (const n of nodes) {
      els.push({
        data: {
          id: n.id,
          label: n.id,
          weight: n.weight,
        },
      });
    }
    for (const l of links) {
      els.push({
        data: {
          id: `${l.source}→${l.target}`,
          source: l.source,
          target: l.target,
          weight: l.weight,
          count: l.count,
        },
      });
    }
    return els;
  }, [nodes, links]);

  const stylesheet = React.useMemo(
    () => [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "font-size": 10,
          "text-wrap": "wrap",
          "text-max-width": 110,
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 8,
          color: isDark ? "rgba(248,250,252,0.92)" : "rgba(17,24,39,0.92)",
          "text-outline-width": 2,
          "text-outline-color": isDark ? "rgba(2,6,23,0.92)" : "rgba(255,255,255,0.92)",
          "background-color": (ele) => {
            const w = ele.data("weight") ?? 0;
            const t = clamp01(w / maxNode);
            return edgeColor(0.12 + 0.78 * t, isDark);
          },
          width: (ele) => {
            const w = ele.data("weight") ?? 0;
            return 18 + 26 * clamp01(Math.sqrt(w / maxNode));
          },
          height: (ele) => {
            const w = ele.data("weight") ?? 0;
            return 18 + 26 * clamp01(Math.sqrt(w / maxNode));
          },
          "border-color": isDark ? "rgba(0,212,255,0.35)" : "rgba(17,24,39,0.18)",
          "border-width": 1,
        },
      },
      {
        selector: "edge",
        style: {
          width: (ele) => 1 + 7 * clamp01((ele.data("weight") ?? 0) / maxEdge),
          "line-color": (ele) => edgeColor(clamp01((ele.data("weight") ?? 0) / maxEdge), isDark),
          "target-arrow-color": (ele) => edgeColor(clamp01((ele.data("weight") ?? 0) / maxEdge), isDark),
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          opacity: isDark ? 0.75 : 0.65,
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 3,
          "border-color": isDark ? "rgba(0,255,136,0.90)" : "rgba(17,24,39,0.90)",
        },
      },
      {
        selector: "edge:selected",
        style: {
          opacity: 0.95,
          width: (ele) => 2 + 9 * clamp01((ele.data("weight") ?? 0) / maxEdge),
          "line-color": isDark ? "rgba(0,255,136,0.96)" : "rgba(8,145,178,0.96)",
          "target-arrow-color": isDark ? "rgba(0,255,136,0.96)" : "rgba(8,145,178,0.96)",
        },
      },
    ],
    [maxNode, maxEdge, isDark],
  );

  const smartFit = React.useCallback(
    ({ force = false } = {}) => {
      const cy = cyRef.current;
      const host = containerRef.current;
      if (!cy || !host) return;
      const now = Date.now();
      if (!force && now - (lastUserInteractAt.current || 0) < 900) return;
      const rect = host.getBoundingClientRect();
      const pad = clamp(Math.min(rect.width, rect.height) * 0.06, 24, 72);
      const run = () => {
        try {
          cy.resize();
          cy.fit(undefined, pad);
          const z = cy.zoom();
          const boost = nodes.length <= 30 ? 1.12 : nodes.length <= 60 ? 1.08 : 1.04;
          const next = clamp(z * boost, 0.35, 1.35);
          cy.zoom({ level: next, renderedPosition: { x: rect.width / 2, y: rect.height / 2 } });
        } catch {
          // ignore
        }
      };
      if (fitRaf.current) cancelAnimationFrame(fitRaf.current);
      fitRaf.current = requestAnimationFrame(run);
    },
    [nodes.length],
  );

  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!selectedCell) {
      cy.nodes().unselect();
      return;
    }
    cy.nodes().unselect();
    const n = cy.getElementById(selectedCell);
    if (n) n.select();
  }, [selectedCell]);

  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const s = selectedPair?.sender;
    const r = selectedPair?.receiver;
    cy.edges().unselect();
    if (!s || !r) return;
    const id = `${s}→${r}`;
    const e = cy.getElementById(id);
    if (e) e.select();
  }, [selectedPair?.sender, selectedPair?.receiver]);

  React.useEffect(() => {
    return () => {
      if (fitRaf.current) cancelAnimationFrame(fitRaf.current);
    };
  }, []);

  // Re-fit when data changes (initial load / preset switch).
  React.useEffect(() => {
    smartFit({ force: true });
  }, [elements, smartFit]);

  // Re-fit when container size changes (e.g. sidebar hide/show, fullscreen).
  React.useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => smartFit({ force: false }));
    ro.observe(host);
    return () => ro.disconnect();
  }, [smartFit]);

  const exportPng = React.useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const png64 = cy.png({ full: true, bg: isDark ? "#0a0a0a" : "#ffffff", scale: 2 });
    const a = document.createElement("a");
    a.href = png64;
    a.download = "litigation-network.png";
    a.click();
  }, [isDark]);

  const toggleFullscreen = React.useCallback(async () => {
    const host = containerRef.current;
    if (!host || typeof document === "undefined") return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        return;
      }
      await host.requestFullscreen?.();
    } catch {
      // ignore (browser / iframe restrictions)
    }
  }, []);

  React.useEffect(() => {
    if (typeof onApi !== "function") return;
    onApi({
      fit: () => smartFit({ force: true }),
      exportPng,
      toggleFullscreen,
    });
  }, [onApi, smartFit, exportPng, toggleFullscreen]);

  const pushHover = React.useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const h = hoverRef.current;
      setHover(h.active ? { text: h.text, x: h.x, y: h.y } : null);
    });
  }, []);

  React.useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  React.useEffect(() => {
    const onFs = () => {
      const host = containerRef.current;
      const active = !!(host && document.fullscreenElement === host);
      if (typeof onFullscreenChange === "function") onFullscreenChange(active);
      if (active) smartFit({ force: true });
    };
    document.addEventListener?.("fullscreenchange", onFs);
    return () => document.removeEventListener?.("fullscreenchange", onFs);
  }, [smartFit, onFullscreenChange]);

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const hx = hover?.x ?? 0;
  const hy = hover?.y ?? 0;
  const flipX = hx > vw * 0.66;
  const flipY = hy > vh * 0.72;
  const left = clamp(hx + 12, 8, Math.max(8, vw - 8));
  const top = clamp(hy + 12, 8, Math.max(8, vh - 8));

  return (
    <div className="viz-view">
      <div
        className="scroll"
        ref={containerRef}
        style={{
          background: isDark
            ? "radial-gradient(900px 520px at 18% 0%, rgba(0,212,255,0.08), rgba(2,6,23,0) 60%), rgba(10,10,10,0.96)"
            : "radial-gradient(900px 520px at 18% 0%, rgba(8,145,178,0.10), rgba(255,255,255,0) 60%), rgba(255,255,255,0.96)",
        }}
      >
        {hover && hover.text && typeof document !== "undefined"
          ? createPortal(
              <div className="tooltip-layer" style={{ left, top }}>
                <div className={`tooltip-bubble ${flipX ? "flip-x" : ""} ${flipY ? "flip-y" : ""}`} role="tooltip" style={{ maxWidth: 520 }}>
                  {hover.text}
                </div>
              </div>,
              document.body,
            )
          : null}
        <CytoscapeComponent
          elements={elements}
          cy={(cy) => {
            cyRef.current = cy;
            cy.on("tap", "node", (evt) => (typeof onSelectCell === "function" ? onSelectCell(evt.target.id()) : null));
            cy.on("tap", "edge", (evt) => {
              const data = evt.target.data();
              if (typeof onSelectPair === "function") onSelectPair({ sender: data.source, receiver: data.target });
            });
            cy.on("zoom pan", (evt) => {
              if (evt?.originalEvent) lastUserInteractAt.current = Date.now();
            });
            cy.on("layoutstop", () => smartFit({ force: true }));
            cy.on("mouseover", "node", (evt) => {
              hoverRef.current.active = true;
              hoverRef.current.text = evt.target.id();
              pushHover();
            });
            cy.on("mouseout", "node", () => {
              hoverRef.current.active = false;
              pushHover();
            });
            cy.on("mouseover", "edge", (evt) => {
              const d = evt.target.data();
              const s = typeof d?.source === "string" ? d.source : "";
              const t = typeof d?.target === "string" ? d.target : "";
              hoverRef.current.active = true;
              hoverRef.current.text = s && t ? `${s} → ${t}` : "Edge";
              pushHover();
            });
            cy.on("mouseout", "edge", () => {
              hoverRef.current.active = false;
              pushHover();
            });
            cy.on("mousemove", (evt) => {
              const oe = evt.originalEvent;
              if (!oe) return;
              hoverRef.current.x = oe.clientX;
              hoverRef.current.y = oe.clientY;
              if (hoverRef.current.active) pushHover();
            });
          }}
          style={{ width: "100%", height: "100%" }}
          layout={{
            name: "cose",
            animate: false,
            fit: false,
            padding: 0,
            randomize: false,
            nodeRepulsion: 9000,
            idealEdgeLength: 120,
          }}
          stylesheet={stylesheet}
        />
      </div>

      <div className="viz-note" style={{ marginTop: 10 }}>
        {t("network.note", { weightLabel })}
      </div>
    </div>
  );
}
