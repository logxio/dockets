import React from "react";

// UI copy lives here so views stay free of inline strings.
// `t("a.b.c")` walks the tree; `{name}` placeholders are filled from the vars argument.
const STRINGS = {
  app: {
    title: "Meridian · Workbench",
    subtitle: "Verifier-first · Multi-Agent · LLM Copilot · Graph Intelligence · Evidence-bound Deliverables",
  },
  tabs: { explore: "Explore", rankings: "Rankings", report: "Report", advanced: "Advanced" },
  buttons: {
    commandPalette: "⌘K",
    story: "Story",
    assistant: "Assistant",
    share: "Share link",
    exportReport: "Export report",
    actions: "Actions",
    close: "Close",
  },
  misc: {
    demoMode: "DEMO MODE",
    advancedHidden: "Advanced is hidden in demo mode",
    notLoaded: "Not loaded",
    pickView: "Select a view.",
    importFirst: "Import a file on the left and finish column mapping.",
    compareNeedsTwo: "Compare requires both Dataset A and Dataset B.",
    copiedLink: "Reproducible link copied",
    copyFailed: "Copy failed (browser restrictions); copy the address bar URL manually.",
    exportFailed: "Failed to export report",
  },
  actions: {
    headSub: "Share / Export · Hotkeys enabled",
    shareSection: "Share",
    copyLink: "Copy share link",
    copyLinkSub: "Copies a reproducible URL with view/filters/theme",
    copied: "Copied",
    copyFailed: "Failed",
    exportSection: "Export",
    exportPng: "Export current view (PNG)",
    exportPngSub: "Best for Network view",
    exportReport: "Export current report (HTML)",
    exportReportSub: "Deliverable: insights + rankings + filters",
    exportRankingsHtml: "Export rankings report (HTML)",
    exportRankingsHtmlSub: "Shareable, presentation-ready HTML",
    exportRankingsTsv: "Export rankings table (TSV)",
    exportRankingsTsvSub: "For analysis or spreadsheet workflows",
  },
  sections: {
    import: "Import",
    importCompare: "Import (Compare)",
    importHelpSingle: "CSV/TSV supported; import first, then map columns.",
    importHelpCompare: "Import Dataset A and Dataset B, then compare with the same filters.",
    dataHints: "Data notes",
    filters: "Filters",
    filtersSub: "Figure-style workflow: reduce scale first, then refine.",
  },
  viewTitles: {
    matters: "Matters",
    exploreTable: "Explore · Table",
    exploreMatrix: "Explore · Matrix",
    exploreMatrixDot: "Explore · Matrix (Dot)",
    exploreNetwork: "Explore · Network",
    rankings: "Rankings",
    report: "Report",
    advanced: "Advanced",
  },
  viewSubtitles: {
    matters: "Upload → auto-extract → recommend firms → one-click Decision Pack (exportable, explainable, traceable).",
    explore: "Click edges/firms → Evidence / Firm profile / Verifier (right drawer).",
    rankings: "Top firms (AHPI rankings); click a firm to focus the network and open its profile.",
    report: "Export a report; the verifier-first LLM must bind every claim to RowId evidence (no evidence = Unverified).",
    advanced: "Advanced: What-if / Compare / Raw table / LLM configuration.",
  },
  fileImport: {
    loadTop100: "Load Top100 (Demo)",
    loadTop50: "Load Top50 (Demo)",
    loadExample: "Load example",
    loadFig2: "Load Fig.2 (MOESM4)",
    loadTop100Tip: "Demo mode: load the Top100 subgraph (faster & more stable)",
    loadTop50Tip: "Demo mode: load the Top50 subgraph (faster & more stable)",
    presetLoadTip: "Load the Mahari sample (Top100) and auto-map columns",
    fig2Tip: "Interactions exported by joining Fig.2 source data (MOESM4) back to cases_df (firms + case type + outcome + weight)",
    dropDisabled: "Demo mode: local file import disabled",
    dropActive: "Drop to import…",
    dropIdle: "Drag a file / click to choose",
    preset: "Mahari preset",
    presetTip: "Auto-map common columns (PlaintiffFirm/DefendantFirm/CaseType/Court/Outcome/Weight)",
    currentFile: "File:",
    notSelected: "None",
    rowsSuffix: "rows",
    canStart: "Ready to run",
    needMapping: "Map at least Plaintiff/Defendant firm",
    start: "Start",
    processing: "Processing…",
    mapping: {
      plaintiff: "Plaintiff firm",
      defendant: "Defendant firm",
      caseType: "Case type",
      court: "Court",
      weight: "Weight",
      outcome: "Outcome",
      requiredMark: "*",
      unselected: "(unselected)",
    },
    errors: {
      importFailed: "Import failed",
      loadExampleFailed: "Failed to load example",
      loadFig2Failed: "Failed to load Fig.2 example",
      loadTop100Failed: "Failed to load Top100 example",
      loadTop50Failed: "Failed to load Top50 example",
    },
  },
  story: {
    title: "Guided Tour / Story Mode",
    subtitle: "3-step script: load → focus → evidence → export (auto-run available)",
    autoRun: "Auto-run (3 steps)",
    running: "Running…",
    export: "Export report",
    fastTip: "Faster & steadier: use Top100 for live demos",
    stepLabel: "Step",
    current: "current",
    steps: {
      s1Title: "Load dataset",
      s1Desc: "Load Top100/Top50 (demo) or the Fig.2 example (non-demo).",
      s2Title: "Focus a firm",
      s2Desc: "Go to Rankings, pick a representative firm, and open its profile.",
      s3Title: "Open evidence",
      s3Desc: "Pick the top rivalry (strongest edge), open RowId evidence, then export the report.",
    },
    tips: "The goal is to show a “research-assistant loop” within ~3 minutes: every claim links to evidence, and you can export a deliverable.",
  },
  filtersPanel: {
    topEdges: "Top edges",
    topEdgesPh: "e.g. 300 (empty = no filter)",
    caseType: "Case type",
    caseTypePh: "Fuzzy match (e.g. Contract / IP)",
    court: "Court",
    courtPh: "Fuzzy match (e.g. D. Del. / S.D.N.Y.)",
    outcome: "Outcome",
    outcomePh: "e.g. PlaintiffWin / DefendantWin / Settlement (empty = no filter)",
    includeSelf: "Include self-loops (plaintiff==defendant)",
    focusMode: "Focus mode",
    any: "Any",
    outgoing: "Outgoing",
    incoming: "Incoming",
    reset: "Reset",
  },
  commandPalette: {
    title: "Command Palette",
    subtitle: "Type a firm name to jump (Esc to close)",
    placeholder: "Search firms…",
    type: "Type",
    name: "Name",
    action: "Action",
    actionFocus: "Focus",
    noResults: "No results",
    tip: "Tip: ⌘K / Ctrl+K to open; Enter to pick; ↑↓ to navigate.",
  },
  evidence: {
    title: "Evidence (RowId-level)",
    subtitleDefault: "✅ Citation verified",
    verified: "✅ Citation verified",
    rows: "rows",
    copyRowIds: "Copy RowIds",
    copyOk: "Copied to clipboard",
    copyFail: "Copy failed (browser restrictions)",
    goTable: "Go to table",
    copyRaw: "Copy raw",
    missingRow: "Missing row",
    viewRaw: "View raw JSON (first row)",
    actions: "Actions",
  },
  errorBoundary: {
    defaultTitle: "Render failed (caught)",
    retry: "Retry render",
    tip: "Tip: try switching tabs or refreshing the page",
  },
  loader: {
    analyzing: "Analyzing interactions...",
    checking: "Checking pathways...",
    synthesizing: "Synthesizing report...",
    loading: "Loading...",
  },
  think: {
    title: "View reasoning process",
    badge: "Reasoning",
  },
  network: {
    hint: "Tip: click an edge to view RowId-level evidence",
    fit: "Fit",
    exportPng: "Export PNG",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit fullscreen",
    evidenceTitle: "✅ Citation verified · {src}→{dst}",
    evidenceSub: "Edge {src}→{dst} · evidence",
    note: "Edge width/color uses weight (current: {weightLabel}); click a node to see opponents/case types/courts on the right, and focus the subgraph.",
  },
};

function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

export function t(key, vars) {
  const v = getByPath(STRINGS, key);
  const base = typeof v === "string" ? v : "";
  if (!vars || typeof vars !== "object") return base;
  return base.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}

const I18nContext = React.createContext({ t });

export function I18nProvider({ children }) {
  const value = React.useMemo(() => ({ t }), []);
  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return React.useContext(I18nContext);
}
