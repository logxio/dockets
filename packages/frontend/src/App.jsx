import React from "react";
import { readQueryState, writeQueryState } from "./lib/queryState";
import { buildEvents, computeDetailsForCell, computeSelectionSummary, filterEvents, summarizeWarnings } from "./lib/transform";
import FileImport from "./components/FileImport";
import FiltersPanel from "./components/FiltersPanel";
import NetworkView from "./components/NetworkView";
import MatrixView from "./components/MatrixView";
import DotPlotView from "./components/DotPlotView";
import TableView from "./components/TableView";
import RankingsView from "./components/RankingsView";
import Legend from "./components/Legend";
import CompareView from "./components/CompareView";
import InsightsPanel from "./components/InsightsPanel";
import LlmPanel from "./components/LlmPanel";
import ActionsMenu from "./components/ActionsMenu";
import CitationBadge from "./components/CitationBadge";
import ErrorBoundary from "./components/ErrorBoundary";
import EvidenceModal from "./components/EvidenceModal";
import CounterfactualView from "./components/CounterfactualView";
import FitView from "./components/FitView";
import AssistantDrawer from "./components/AssistantDrawer";
import CommandPalette from "./components/CommandPalette";
import StoryMode from "./components/StoryMode";
import ThemeToggle from "./components/ThemeToggle";
import MatterList from "./components/MatterList";
import CreateMatterModal from "./components/CreateMatterModal";
import MatterWorkspace from "./components/MatterWorkspace";
import { downloadHtml, downloadTsv, generateCompareReport, generateRankingsReport, generateSingleReport, summarizeDataset } from "./lib/report";
import { aggregatePairs, computeCategoryDiff, computePairDiff } from "./lib/compare";
import { buildCompareInsights, buildSingleInsights } from "./lib/intelligence";
import { computeNullControl, computeRobustness } from "./lib/robustness";
import { isDemoMode } from "./lib/demoMode";
import { normalizeLabel, parseDelimitedText } from "./lib/parse";
import { I18nProvider, t } from "./lib/i18n";
import { applyTheme, detectTheme } from "./lib/theme";
import { getPreset } from "./lib/presets";

function defaultFilters() {
  return {
    includeSelfLoops: false,
    topEdges: 500,
    metaboliteQuery: "",
    sensorQuery: "",
    annotationQuery: "",
    focusCell: undefined,
    focusMode: "any",
  };
}

function num(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

const UI_PREFS_KEY = "cldemo_ui_prefs_v1";

function loadUiPrefs() {
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveUiPrefs(patch) {
  try {
    const prev = loadUiPrefs();
    const next = { ...prev, ...(patch && typeof patch === "object" ? patch : {}) };
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function normalizeAssistantTabGroup(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "analysis" || s === "verify") return s;
  // Back-compat: older 4-tab layout.
  if (s === "insights" || s === "firm") return "analysis";
  if (s === "evidence" || s === "verifier") return "verify";
  return "analysis";
}

function normalizeInitialView(view) {
  const v = String(view ?? "").trim() || "network";
  if (v === "dotplot") return { view: "matrix", matrixMode: "dot" };
  if (
    v === "network" ||
    v === "matrix" ||
    v === "table" ||
    v === "rankings" ||
    v === "whatif" ||
    v === "fit" ||
    v === "insights" ||
    v === "compare" ||
    v === "llm" ||
    v === "matters"
  ) {
    return { view: v, matrixMode: "heat" };
  }
  return { view: "network", matrixMode: "heat" };
}

function topTabFromView(view) {
  if (view === "matters") return "matters";
  if (view === "rankings") return "rankings";
  if (view === "insights") return "report";
  if (view === "network" || view === "table") return "explore";
  return "advanced";
}

function computeDatasetProfile(events) {
  const firms = new Set();
  const edges = new Set();
  let selfLoops = 0;
  let withCaseId = 0;
  let withCaseType = 0;
  let withCourt = 0;
  let withOutcome = 0;

  const inc = (m, k) => {
    const key = String(k ?? "").trim() || "NA";
    m.set(key, (m.get(key) ?? 0) + 1);
  };
  const caseTypes = new Map();
  const courts = new Map();
  const outcomes = new Map();

  for (const e of Array.isArray(events) ? events : []) {
    const s = String(e?.sender ?? "").trim();
    const r = String(e?.receiver ?? "").trim();
    if (s) firms.add(s);
    if (r) firms.add(r);
    if (s && r) edges.add(`${s}\t${r}`);
    if (s && r && s === r) selfLoops += 1;

    if (e?.caseId !== undefined && String(e.caseId ?? "").trim()) withCaseId += 1;
    if (e?.metabolite !== undefined && String(e.metabolite ?? "").trim()) {
      withCaseType += 1;
      inc(caseTypes, e.metabolite);
    }
    if (e?.sensor !== undefined && String(e.sensor ?? "").trim()) {
      withCourt += 1;
      inc(courts, e.sensor);
    }
    if (e?.annotation !== undefined && String(e.annotation ?? "").trim()) {
      withOutcome += 1;
      inc(outcomes, e.annotation);
    }
  }

  const top = (m, n = 5) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ key: k, count: v }));

  return {
    rows: Array.isArray(events) ? events.length : 0,
    firms: firms.size,
    edges: edges.size,
    selfLoops,
    withCaseId,
    withCaseType,
    withCourt,
    withOutcome,
    topCaseTypes: top(caseTypes),
    topCourts: top(courts),
    topOutcomes: top(outcomes),
  };
}

function buildSmoothSubset(eventsAll, { maxFirms = 100, maxEdges = 5000 } = {}) {
  const firmWeight = new Map();
  for (const e of Array.isArray(eventsAll) ? eventsAll : []) {
    const w = typeof e?.weight === "number" && Number.isFinite(e.weight) ? e.weight : 1;
    firmWeight.set(e.sender, (firmWeight.get(e.sender) ?? 0) + w);
    firmWeight.set(e.receiver, (firmWeight.get(e.receiver) ?? 0) + w);
  }

  const topFirms = new Set(
    [...firmWeight.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, maxFirms))
      .map(([k]) => k),
  );

  const firmFiltered = (Array.isArray(eventsAll) ? eventsAll : []).filter((e) => topFirms.has(e.sender) && topFirms.has(e.receiver));

  const edgeWeight = new Map();
  for (const e of firmFiltered) {
    const w = typeof e?.weight === "number" && Number.isFinite(e.weight) ? e.weight : 1;
    const k = `${e.sender}\t${e.receiver}`;
    edgeWeight.set(k, (edgeWeight.get(k) ?? 0) + w);
  }

  const topEdgeKeys = new Set(
    [...edgeWeight.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, maxEdges))
      .map(([k]) => k),
  );

  const out = firmFiltered.filter((e) => topEdgeKeys.has(`${e.sender}\t${e.receiver}`));
  return { events: out, stats: { keptRows: out.length, keptFirms: topFirms.size, keptEdges: topEdgeKeys.size } };
}

export default function App() {
  const uiPrefs = React.useMemo(() => loadUiPrefs(), []);
  const initial = React.useMemo(() => readQueryState(window.location.search), []);
  const initViewCandidate = initial.view ?? "network";
  const init = React.useMemo(() => normalizeInitialView(initViewCandidate), [initViewCandidate]);
  const demoMode = React.useMemo(() => isDemoMode(window.location.search), []);
  const [theme, setTheme] = React.useState(() => detectTheme({ search: window.location.search }));
  const [view, setView] = React.useState(init.view);
  const [matrixMode, setMatrixMode] = React.useState(init.matrixMode); // heat | dot
  const [lastAdvancedView, setLastAdvancedView] = React.useState(
    init.view === "compare" || init.view === "whatif" || init.view === "matrix" || init.view === "llm" || init.view === "fit"
      ? init.view
      : "whatif",
  );
  const [filters, setFilters] = React.useState(() => ({ ...defaultFilters(), ...(initial.filters ?? {}) }));

  const [mapping, setMapping] = React.useState(null);
  const [eventsAll, setEventsAll] = React.useState(null);
  const [events, setEvents] = React.useState(null);
  const [importWarnings, setImportWarnings] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [datasetInfo, setDatasetInfo] = React.useState(null); // {name, source, rows}
  const [datasetMode, setDatasetMode] = React.useState("full"); // full | smooth
  const [smoothStats, setSmoothStats] = React.useState(null); // {keptRows, keptFirms, keptEdges}

  const [rankings, setRankings] = React.useState(null); // [{Rank,Firm,Score,ExpScore}]
  const [rankingsError, setRankingsError] = React.useState(null);
  const [caseTypeValence, setCaseTypeValence] = React.useState(new Map()); // CaseType -> ValenceProb
  const [caseTypePrivilege, setCaseTypePrivilege] = React.useState(new Map()); // CaseType -> Privilege

  const [cmpA, setCmpA] = React.useState({ fileName: "", rows: null, mapping: null, events: null, warnings: [] });
  const [cmpB, setCmpB] = React.useState({ fileName: "", rows: null, mapping: null, events: null, warnings: [] });

  const [selectedCell, setSelectedCell] = React.useState(null);
  const [selectedPair, setSelectedPair] = React.useState(null); // {sender, receiver}
  const [evidenceModal, setEvidenceModal] = React.useState({ open: false, title: "", rowIds: [] });
  const [assistantOpen, setAssistantOpen] = React.useState(false);
  const [assistantTab, setAssistantTab] = React.useState(() => normalizeAssistantTabGroup(uiPrefs.assistantTab)); // analysis | verify
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [storyOpen, setStoryOpen] = React.useState(false);
  const [storyStep, setStoryStep] = React.useState(1);
  const [storyBusy, setStoryBusy] = React.useState(false);
  const [storyError, setStoryError] = React.useState("");
  const networkApiRef = React.useRef(null);
  const [networkApiReady, setNetworkApiReady] = React.useState(false);
  const [networkFullscreen, setNetworkFullscreen] = React.useState(false);
  const [pipelineOpen, setPipelineOpen] = React.useState(false);
  const [consolePreset, setConsolePreset] = React.useState(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const raw = q.get("autopreset");
      const v = String(raw || "").trim();
      if (v && v !== "0") return v;
    } catch {
      // ignore
    }
    return "top100";
  });

  // Matter Workspace states
  const [createMatterOpen, setCreateMatterOpen] = React.useState(false);
  const [selectedMatterId, setSelectedMatterId] = React.useState(null);

  // Detect if embedded in iframe (non-fullscreen mode) - can be toggled by parent
  const [isEmbedded, setIsEmbedded] = React.useState(() => {
    try {
      return window.parent && window.parent !== window;
    } catch {
      return false;
    }
  });

  const [toast, setToast] = React.useState({ open: false, text: "" });
  const toastTimer = React.useRef(null);
  const autoPresetLoaded = React.useRef(false);
  const actionsRef = React.useRef({
    share: null,
    exportReport: null,
    exportRankingsHtml: null,
    exportRankingsTsv: null,
    exportViewPng: null,
  });
  const showToast = React.useCallback((text) => {
    const msg = String(text ?? "").trim();
    if (!msg) return;
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ open: true, text: msg });
    toastTimer.current = window.setTimeout(() => setToast({ open: false, text: "" }), 1800);
  }, []);

  // Listen for fullscreen toggle from parent (J2)
  React.useEffect(() => {
    const handler = (evt) => {
      try {
        if (evt.origin !== window.location.origin) return;
        const data = evt.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "cldemo:fullscreen") {
          // When fullscreen, show sidebar; when not fullscreen, hide it
          setIsEmbedded(!data.fullscreen);
        }
        // Backward compat: older J2 versions may wrap messages inside cldemo:command
        if (data.type === "cldemo:command" && data.command?.type === "cldemo:fullscreen") {
          setIsEmbedded(!data.command.fullscreen);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem("cldemo_theme", String(theme));
    } catch {
      // ignore
    }
    applyTheme(theme);
    // Notify parent (J2) of theme change
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "cldemo:theme", theme }, window.location.origin);
      }
    } catch {
      // ignore cross-origin errors
    }
  }, [theme]);

  // Listen for theme changes from parent (J2)
  React.useEffect(() => {
    const handler = (evt) => {
      try {
        if (evt.origin !== window.location.origin) return;
        const data = evt.data;
        if (!data || typeof data !== "object") return;
        if (data.type === "cldemo:theme") {
          const next = String(data.theme || "").trim().toLowerCase();
          if ((next === "dark" || next === "light") && next !== theme) {
            setTheme(next);
          }
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [theme]);

  React.useEffect(() => {
    const t = topTabFromView(view);
    if (t === "advanced") setLastAdvancedView(view);
  }, [view]);

  React.useEffect(() => {
    saveUiPrefs({ assistantTab });
  }, [assistantTab]);

  React.useEffect(() => {
    saveUiPrefs({ lastView: view, matrixMode });
  }, [view, matrixMode]);

  React.useEffect(() => {
    if (!demoMode) return;
    if (view === "compare" || view === "whatif" || view === "matrix" || view === "llm" || view === "fit") {
      setView("network");
    }
  }, [demoMode, view]);

  React.useEffect(() => {
    if (!demoMode) return;
    const maxEdges = 900;
    if (typeof filters.topEdges === "number" && filters.topEdges > maxEdges) {
      setFilters((prev) => ({ ...prev, topEdges: maxEdges }));
    }
  }, [demoMode, filters.topEdges]);

  const selectCell = React.useCallback((cellId) => {
    setSelectedPair(null);
    setSelectedCell(cellId);
    setAssistantOpen(true);
    setAssistantTab("analysis");
  }, []);

  const selectPair = React.useCallback((pair) => {
    if (!pair || typeof pair !== "object") return;
    const sender = typeof pair.sender === "string" ? pair.sender : "";
    const receiver = typeof pair.receiver === "string" ? pair.receiver : "";
    if (!sender || !receiver) return;
    setSelectedCell(null);
    setSelectedPair({ sender, receiver });
    setAssistantOpen(true);
    setAssistantTab("verify");
  }, []);

  React.useEffect(() => {
    const qs = writeQueryState({ view, filters, demo: demoMode, theme });
    window.history.replaceState({}, "", qs || "?");
  }, [view, filters, demoMode, theme]);

  const loadRankings = React.useCallback(async () => {
    try {
      setRankingsError(null);
      const res = await fetch("/sample/mahari_exp_scores.csv");
      if (!res.ok) throw new Error("Rankings file not found: /sample/mahari_exp_scores.csv");
      const parsed = parseDelimitedText(await res.text());
      const rows = (parsed ?? [])
        .map((r) => {
          const firm = normalizeLabel(r.Firm);
          const Rank = num(r.Rank);
          const Score = num(r.Score);
          const ExpScore = num(r.ExpScore);
          return firm ? { Firm: firm, Rank, Score, ExpScore } : null;
        })
        .filter(Boolean);
      setRankings(rows);
    } catch (e) {
      setRankings(null);
      setRankingsError(e instanceof Error ? e.message : "Failed to load rankings");
    }
  }, []);

  React.useEffect(() => {
    loadRankings();
  }, [loadRankings]);

  const loadCaseTypeParams = React.useCallback(async () => {
    try {
      const res = await fetch("/sample/mahari_case_type_params.csv");
      if (!res.ok) {
        setCaseTypeValence(new Map());
        return;
      }
      const parsed = parseDelimitedText(await res.text());
      const m = new Map();
      for (const r of parsed ?? []) {
        const k = normalizeLabel(r.CaseType);
        const v = num(r.ValenceProb);
        if (!k || v === undefined) continue;
        m.set(k, v);
      }
      setCaseTypeValence(m);
    } catch {
      setCaseTypeValence(new Map());
    }
  }, []);

  const loadCaseTypePrivileges = React.useCallback(async () => {
    try {
      const res = await fetch("/sample/mahari_case_type_privileges.csv");
      if (!res.ok) {
        setCaseTypePrivilege(new Map());
        return;
      }
      const parsed = parseDelimitedText(await res.text());
      const m = new Map();
      for (const r of parsed ?? []) {
        const k = normalizeLabel(r.CaseType);
        const v = num(r.Privilege);
        if (!k || v === undefined) continue;
        m.set(k, v);
      }
      setCaseTypePrivilege(m);
    } catch {
      setCaseTypePrivilege(new Map());
    }
  }, []);

  React.useEffect(() => {
    loadCaseTypeParams();
    loadCaseTypePrivileges();
  }, [loadCaseTypeParams, loadCaseTypePrivileges]);

  const filtered = React.useMemo(() => {
    if (!events) return null;
    return filterEvents(events, filters);
  }, [events, filters]);

  const filteredA = React.useMemo(() => {
    if (!cmpA.events) return null;
    return filterEvents(cmpA.events, filters);
  }, [cmpA.events, filters]);

  const filteredB = React.useMemo(() => {
    if (!cmpB.events) return null;
    return filterEvents(cmpB.events, filters);
  }, [cmpB.events, filters]);

  const selectionSummary = React.useMemo(() => {
    if (!filtered) return null;
    return computeSelectionSummary(filtered);
  }, [filtered]);

  const eventsByRowId = React.useMemo(() => {
    const m = new Map();
    for (const e of Array.isArray(eventsAll) ? eventsAll : []) {
      const id = Number(e?.rowId);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!m.has(id)) m.set(id, e);
    }
    return m;
  }, [eventsAll]);

  const openEvidence = React.useCallback((rowIds, title = "") => {
    const ids = Array.isArray(rowIds) ? rowIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
    if (!ids.length) return;
    setEvidenceModal({ open: true, title: String(title || ""), rowIds: ids });
  }, []);

  const rowIdsForCaseIds = React.useCallback((ev, caseIds, opts = {}) => {
    const ids = Array.isArray(caseIds) ? caseIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    if (!ids.length) return [];
    const set = new Set(ids);

    const pairRaw = Array.isArray(opts?.pair) && opts.pair.length === 2 ? opts.pair : null;
    const pair = pairRaw ? [normalizeLabel(pairRaw[0]), normalizeLabel(pairRaw[1])] : null;
    const pa = pair?.[0] ? normalizeLabel(pair[0]).toLowerCase() : "";
    const pb = pair?.[1] ? normalizeLabel(pair[1]).toLowerCase() : "";

    // IMPORTANT: evidenceCaseIds are CaseId-level. For UX, pick ONE representative RowId per CaseId
    // (otherwise each CaseId can explode into dozens of sender/receiver combinations).
    const firstRowIdByCaseId = new Map();

    for (const e of Array.isArray(ev) ? ev : []) {
      const cid = Number(e?.caseId);
      if (!Number.isFinite(cid)) continue;
      if (!set.has(cid)) continue;
      if (firstRowIdByCaseId.has(cid)) continue;

      if (pa && pb) {
        const s = String(e?.sender ?? "").trim().toLowerCase();
        const r = String(e?.receiver ?? "").trim().toLowerCase();
        const ok = (s === pa && r === pb) || (s === pb && r === pa);
        if (!ok) continue;
      }

      const rid = Number(e?.rowId);
      if (!Number.isFinite(rid) || rid <= 0) continue;
      firstRowIdByCaseId.set(cid, rid);
    }

    return ids.map((cid) => firstRowIdByCaseId.get(cid)).filter((rid) => Number.isFinite(rid));
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e) => {
      const isK = (e.key || "").toLowerCase() === "k";
      if (!isK) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      setPaletteOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const singleInsights = React.useMemo(() => {
    if (!filtered || !mapping) return null;
    return buildSingleInsights({ events: filtered, mapping, filters });
  }, [filtered, mapping, filters]);

  const applyFilterPatch = React.useCallback((patch) => {
    if (!patch || typeof patch !== "object") return;
    setFilters((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        next[k] = v;
      }
      return next;
    });
  }, []);

  const details = React.useMemo(() => {
    if (!filtered || !selectedCell) return null;
    const base = selectionSummary?.byCell?.get(selectedCell) ? selectionSummary.byCell.get(selectedCell) : null;
    if (!base) return null;
    return { ...base, extra: computeDetailsForCell(filtered, selectedCell) };
  }, [filtered, selectedCell, selectionSummary]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast(t("misc.copiedLink"));
      return true;
    } catch {
      showToast(t("misc.copyFailed"));
      return false;
    }
  };

  const exportReport = () => {
    try {
      const sortedRankings = Array.isArray(rankings)
        ? [...rankings].sort((a, b) => (num(a.Rank) ?? Infinity) - (num(b.Rank) ?? Infinity))
        : null;
      if (view === "compare") {
        if (!filteredA || !filteredB) {
          alert("Import Dataset A and Dataset B in Compare first.");
          return;
        }
        const diff = computePairDiff(aggregatePairs(filteredA), aggregatePairs(filteredB), 1e-6);
        const annDiffRows = computeCategoryDiff(filteredA, filteredB, (e) => e.annotation || "NA");
        const fluxDiffRows = computeCategoryDiff(filteredA, filteredB, (e) => (e.fluxPass ?? "").toUpperCase() || "NA");
        const insights = buildCompareInsights({
          eventsA: filteredA,
          eventsB: filteredB,
          diffRows: diff,
          annDiffRows,
          fluxDiffRows,
          filters,
        });
        const html = generateCompareReport({
          fileA: cmpA.fileName,
          fileB: cmpB.fileName,
          filters,
          summaryA: { ...summarizeDataset(filteredA), annDiffRows, fluxDiffRows },
          summaryB: summarizeDataset(filteredB),
          diffRows: diff,
          insights,
          rankingsTop: sortedRankings,
        });
        downloadHtml("mahari-law-firm-rankings-compare-report.html", html);
        return;
      }

      if (!filtered || !selectionSummary) {
        alert("Import data and start analysis first.");
        return;
      }
      const rankingsForTopNodes = (() => {
        if (!sortedRankings?.length) return null;
        const byFirm = new Map(sortedRankings.map((r) => [r.Firm, r]));
        const seen = new Set();
        const out = [];
        for (const n of selectionSummary.nodes.slice(0, 40)) {
          const firm = n?.id;
          if (!firm || seen.has(firm)) continue;
          const r = byFirm.get(firm);
          if (r) out.push(r);
          seen.add(firm);
        }
        return out;
      })();
      const robustness = events
        ? computeRobustness({ eventsAll: events, baseFilters: filters, topK: 10 })
        : null;
      const nullControl = events ? computeNullControl({ eventsAll: events, baseFilters: filters, n: 60, seed: 42 }) : null;
      const html = generateSingleReport({
        fileName: "single",
        filters,
        summary: summarizeDataset(filtered),
        topNodes: selectionSummary.nodes,
        topLinks: selectionSummary.links,
        insights: singleInsights,
        robustness,
        nullControl,
        rankingsTop: sortedRankings,
        rankingsForTopNodes,
      });
      downloadHtml("mahari-law-firm-rankings-report.html", html);
    } catch {
      showToast(t("misc.exportFailed"));
    }
  };

  const presentFirms = React.useMemo(() => new Set((selectionSummary?.nodes ?? []).map((n) => n.id)), [selectionSummary]);

  const selectedLink = React.useMemo(() => {
    if (!selectionSummary?.links?.length) return null;
    const s = selectedPair?.sender;
    const r = selectedPair?.receiver;
    if (!s || !r) return null;
    return selectionSummary.links.find((l) => l.source === s && l.target === r) ?? null;
  }, [selectionSummary, selectedPair?.sender, selectedPair?.receiver]);

  const setNetworkApi = React.useCallback((api) => {
    networkApiRef.current = api;
    setNetworkApiReady(!!api);
  }, []);

  const exportViewPng = React.useCallback(() => {
    if (view !== "network") {
      showToast("Switch to Network view to export PNG.");
      return;
    }
    if (!networkApiReady) {
      showToast("Network view not ready yet.");
      return;
    }
    try {
      networkApiRef.current?.exportPng?.();
    } catch {
      showToast("Export failed.");
    }
  }, [view, networkApiReady, showToast]);

  const exportRankingsTsv = React.useCallback(() => {
    const rows = Array.isArray(rankings) ? [...rankings] : [];
    if (!rows.length) {
      showToast("Rankings not loaded yet.");
      return;
    }
    rows.sort((a, b) => (num(a.Rank) ?? Infinity) - (num(b.Rank) ?? Infinity));
    downloadTsv("mahari_rankings.tsv", rows, ["Rank", "Firm", "Score", "ExpScore"]);
    showToast("Rankings exported (TSV).");
  }, [rankings, showToast]);

  const exportRankingsHtml = React.useCallback(() => {
    const rows = Array.isArray(rankings) ? [...rankings] : [];
    if (!rows.length) {
      showToast("Rankings not loaded yet.");
      return;
    }
    rows.sort((a, b) => (num(a.Rank) ?? Infinity) - (num(b.Rank) ?? Infinity));
    const html = generateRankingsReport({
      title: "Law firm rankings report",
      query: "",
      onlyPresent: false,
      presentFirmsCount: presentFirms?.size ?? 0,
      rows,
    });
    downloadHtml("mahari-law-firm-rankings-rankings-report.html", html);
    showToast("Rankings report exported (HTML).");
  }, [rankings, showToast, presentFirms]);
  const topTab = topTabFromView(view);

  const goTopTab = (k) => {
    if (k === "matters") {
      setView("matters");
      return;
    }
    if (k === "explore") {
      setView("network");
      return;
    }
    if (k === "rankings") {
      setView("rankings");
      return;
    }
    if (k === "report") {
      setView("insights");
      return;
    }
    if (k === "advanced") {
      setView(lastAdvancedView || "whatif");
    }
  };

  const actionsHotkeys = React.useMemo(() => {
    const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform || "");
    return {
      copyLink: isMac ? "Cmd+Shift+L" : "Ctrl+Shift+L",
      exportReport: isMac ? "Cmd+Shift+E" : "Ctrl+Shift+E",
      exportRankings: isMac ? "Cmd+Shift+R" : "Ctrl+Shift+R",
      exportRankingsTsv: isMac ? "Cmd+Shift+T" : "Ctrl+Shift+T",
      exportPng: isMac ? "Cmd+Shift+P" : "Ctrl+Shift+P",
    };
  }, []);

  actionsRef.current.share = share;
  actionsRef.current.exportReport = exportReport;
  actionsRef.current.exportRankingsHtml = exportRankingsHtml;
  actionsRef.current.exportRankingsTsv = exportRankingsTsv;
  actionsRef.current.exportViewPng = exportViewPng;

  React.useEffect(() => {
    const onKeyDown = (e) => {
      const key = String(e.key || "").toLowerCase();
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (key === "l") {
        e.preventDefault();
        actionsRef.current?.share?.();
      }
      if (key === "e") {
        e.preventDefault();
        actionsRef.current?.exportReport?.();
      }
      if (key === "r") {
        e.preventDefault();
        actionsRef.current?.exportRankingsHtml?.();
      }
      if (key === "t") {
        e.preventDefault();
        actionsRef.current?.exportRankingsTsv?.();
      }
      if (key === "p") {
        e.preventDefault();
        actionsRef.current?.exportViewPng?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const loadPreset = React.useCallback(
    async (preset) => {
      setConsolePreset(String(preset || "top100"));
      const cfg = getPreset(preset);
      const file = cfg.file;
      const res = await fetch(file);
      if (!res.ok) throw new Error(`Failed to load preset: ${file}`);
      const rawRows = parseDelimitedText(await res.text());
      const columnMapping = cfg.mapping;
      setError(null);
      setSelectedCell(null);
      setSelectedPair(null);
      setEvidenceModal({ open: false, title: "", rowIds: [] });
      const { events: ev, report } = buildEvents(rawRows, columnMapping);
      setMapping(columnMapping);
      setEventsAll(ev);
      setEvents(ev);
      setDatasetMode("full");
      setSmoothStats(null);
      setDatasetInfo({ name: cfg.name || preset, source: `preset:${preset}`, rows: rawRows?.length ?? 0 });
      setImportWarnings(summarizeWarnings(report, columnMapping));
      const baseFilters = { ...defaultFilters(), ...(initial.filters ?? {}) };
      setFilters((prev) => {
        const keepFocus = prev.focusCell ? { focusCell: prev.focusCell, focusMode: prev.focusMode } : {};
        return { ...baseFilters, ...keepFocus };
      });
      setView("network");
      return { events: ev, selectionSummary: computeSelectionSummary(filterEvents(ev, baseFilters)) };
    },
    [initial.filters],
  );

  // Showcase mode: auto-load a preset so the Workbench "just works" without clicking Import.
  React.useEffect(() => {
    if (autoPresetLoaded.current) return;
    if (view === "compare") return;
    if (eventsAll || events || mapping) return;
    const q = new URLSearchParams(window.location.search);
    const raw = q.get("autopreset");
    if (String(raw ?? "").trim() === "0") return;
    const v = String(raw || "").trim();
    const preset = v || "top100";
    autoPresetLoaded.current = true;
    setConsolePreset(preset);
    loadPreset(preset).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    });
  }, [demoMode, isEmbedded, eventsAll, events, mapping, view, loadPreset]);

  React.useEffect(() => {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "cldemo:ready" }, window.location.origin);
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    const onMessage = (evt) => {
      if (evt.origin !== window.location.origin) return;
      const data = evt.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "cldemo:command") return;
      const cmd = data.command;
      if (!cmd || typeof cmd !== "object") return;

      const action = String(cmd.action ?? "").trim();
      if (!action) return;

      const run = async () => {
        try {
          if (action === "openPreset") {
            const preset = String(cmd.preset ?? "top100");
            await loadPreset(preset);
            setView("network");
            return;
          }

          if (action === "openFirm") {
            const preset = String(cmd.preset ?? "top100");
            const firm = String(cmd.firm ?? "").trim();
            const loaded = await loadPreset(preset);
            if (firm) {
              setView("network");
              setFilters((prev) => ({ ...prev, focusCell: firm, focusMode: "any" }));
              setSelectedCell(firm);
              setSelectedPair(null);
            } else {
              setView("network");
            }
            return loaded;
          }

          if (action === "openInsight") {
            const preset = String(cmd.preset ?? "top100");
            const filterPatch = cmd.filterPatch && typeof cmd.filterPatch === "object" ? cmd.filterPatch : {};
            const evidenceCaseIds = Array.isArray(cmd.evidenceCaseIds) ? cmd.evidenceCaseIds : [];
            const evidencePair = Array.isArray(cmd.evidencePair) && cmd.evidencePair.length === 2 ? cmd.evidencePair : null;
            const title = String(cmd.title ?? "").trim();

            const loaded = await loadPreset(preset);
            applyFilterPatch(filterPatch);
            setView("network");

            const rowIds = rowIdsForCaseIds(loaded?.events, evidenceCaseIds, { pair: evidencePair });
            if (rowIds.length) openEvidence(rowIds, title || "Evidence");
            return loaded;
          }
        } catch (e) {
          console.error(e);
        }
      };

      run();
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyFilterPatch, loadPreset, openEvidence, rowIdsForCaseIds]);

  const datasetProfile = React.useMemo(() => (eventsAll ? computeDatasetProfile(eventsAll) : null), [eventsAll]);
  const perfLimits = React.useMemo(() => ({ maxFirms: 100, maxEdges: 5000 }), []);
  const perfNeedsSmoothing = !!datasetProfile && (datasetProfile.firms > perfLimits.maxFirms || datasetProfile.edges > perfLimits.maxEdges);

  const consolePresets = React.useMemo(
    () => [
      { value: "top100", label: "Top 100 (recommended)" },
      { value: "top50", label: "Top 50 (fastest)" },
      { value: "fig2", label: "Fig.2 (full)" },
    ],
    [],
  );

  const quickOptions = React.useMemo(() => {
    const focusFirms = (selectionSummary?.nodes ?? []).slice(0, 120).map((n) => n.id).filter(Boolean);

    const freq = (key) => {
      const m = new Map();
      for (const e of Array.isArray(eventsAll) ? eventsAll : []) {
        const v = String(e?.[key] ?? "").trim();
        if (!v) continue;
        m.set(v, (m.get(v) || 0) + 1);
      }
      return [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80)
        .map(([v]) => v);
    };

    return {
      focusFirms,
      caseTypes: freq("metabolite"),
      courts: freq("sensor"),
      outcomes: freq("annotation"),
    };
  }, [eventsAll, selectionSummary]);

  const consoleFiltersDisabled = view === "compare" ? !cmpA.events && !cmpB.events : !events;

  const applySmoothMode = React.useCallback(() => {
    if (!eventsAll?.length) return;
    const { events: next, stats } = buildSmoothSubset(eventsAll, { maxFirms: perfLimits.maxFirms, maxEdges: perfLimits.maxEdges });
    setEvents(next);
    setDatasetMode("smooth");
    setSmoothStats(stats);
    setFilters((prev) => ({ ...prev, topEdges: undefined }));
    showToast(
      `Smooth mode applied: top ${stats.keptFirms} firms, ${stats.keptEdges} edges.`,
    );
  }, [eventsAll, perfLimits.maxFirms, perfLimits.maxEdges, showToast]);

  const applyFullMode = React.useCallback(() => {
    if (!eventsAll?.length) return;
    setEvents(eventsAll);
    setDatasetMode("full");
    setSmoothStats(null);
    showToast("Switched back to full dataset.");
  }, [eventsAll, showToast]);

  React.useEffect(() => {
    if (!pipelineOpen) return;
    const onDown = (e) => {
      if (e.key === "Escape") setPipelineOpen(false);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, [pipelineOpen]);

  const runStory = React.useCallback(async () => {
    setStoryBusy(true);
    setStoryError("");
    setStoryStep(1);
    try {
      const loaded = await loadPreset(demoMode ? "top100" : "fig2");
      setStoryStep(2);
      setView("rankings");
      setAssistantOpen(true);
      setAssistantTab("analysis");

      let ranked = Array.isArray(rankings) ? rankings : null;
      if (!ranked?.length) {
        try {
          const res = await fetch("/sample/mahari_exp_scores.csv");
          if (res.ok) {
            const parsed = parseDelimitedText(await res.text());
            ranked = (parsed ?? [])
              .map((r) => {
                const firm = normalizeLabel(r.Firm);
                const Rank = num(r.Rank);
                const Score = num(r.Score);
                const ExpScore = num(r.ExpScore);
                return firm ? { Firm: firm, Rank, Score, ExpScore } : null;
              })
              .filter(Boolean);
          }
        } catch {
          // ignore
        }
      }

      const rankedSorted = Array.isArray(ranked) ? [...ranked].sort((a, b) => (num(a.Rank) ?? Infinity) - (num(b.Rank) ?? Infinity)) : [];
      const present = new Set((loaded?.selectionSummary?.nodes ?? []).map((n) => n.id));
      const picked = rankedSorted.find((r) => present.has(String(r?.Firm ?? "").trim()))?.Firm || rankedSorted.find((r) => String(r?.Firm ?? "").trim())?.Firm || "";
      if (picked) {
        setFilters((prev) => ({ ...prev, focusCell: picked, focusMode: "any" }));
        setSelectedCell(picked);
      }

      setStoryStep(3);
      const topLink = loaded?.selectionSummary?.links?.[0];
      if (topLink?.source && topLink?.target && Array.isArray(topLink.rowIds) && topLink.rowIds.length) {
        selectPair({ sender: topLink.source, receiver: topLink.target });
        openEvidence(topLink.rowIds, `Story · ${topLink.source}→${topLink.target} · evidence`);
      }
    } catch (e) {
      setStoryError(e instanceof Error ? e.message : "Story mode failed");
    } finally {
      setStoryBusy(false);
    }
  }, [demoMode, loadPreset, rankings, selectPair, openEvidence]);

  return (
    <I18nProvider>
      <div className="app">
      <div className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-title">{t("app.title")}</div>
            <div className="brand-sub">{t("app.subtitle")}</div>
          </div>

          <div className="header-actions">
            <div className="tabs" role="tablist" aria-label="views">
              {[
                ["matters", "Matters"],
                ["explore", t("tabs.explore")],
                ["rankings", t("tabs.rankings")],
                ["report", t("tabs.report")],
                ...(demoMode ? [] : [["advanced", t("tabs.advanced")]]),
              ].map(([k, label]) => (
                <button key={k} className={`tab ${topTab === k ? "active" : ""}`} onClick={() => goTopTab(k)}>
                  {label}
                </button>
              ))}
            </div>
	            <div className="header-tools" aria-label="tools">
	              <div className="toggle-stack">
	                <ThemeToggle theme={theme} setTheme={setTheme} />
	              </div>
                {isEmbedded ? (
                  <button
                    className={`btn header-btn ${pipelineOpen ? "primary" : ""}`}
                    type="button"
                    onClick={() => setPipelineOpen((v) => !v)}
                    title="Data / Performance / Filters"
                  >
                    Console
                  </button>
                ) : null}
	              <button className="btn header-btn header-btn-cmd" onClick={() => setPaletteOpen(true)} title="⌘K / Ctrl+K">
	                {t("buttons.commandPalette")}
	              </button>
              <button className="btn header-btn header-btn-story" onClick={() => setStoryOpen(true)} title="Guided demo walkthrough">
                {t("buttons.story")}
              </button>
              <button
                className={`btn header-btn header-btn-assistant ${assistantOpen ? "primary" : ""}`}
                onClick={() => setAssistantOpen((v) => !v)}
                title="Toggle assistant drawer"
              >
                {t("buttons.assistant")}
              </button>
              <ActionsMenu
                onCopyLink={share}
                onExportReport={exportReport}
                onExportRankingsHtml={exportRankingsHtml}
                onExportRankingsTsv={exportRankingsTsv}
                onExportPng={exportViewPng}
                hotkeys={actionsHotkeys}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        <div className={`layout ${isEmbedded ? "embedded" : ""}`}>
          {!isEmbedded ? (
            <div className="left">
              <div className="pipeline">
                <div className="pipeline-head">
                  <div className="pipeline-title">Console</div>
                  <div className="pipeline-sub">
                    {datasetInfo?.name
                      ? `Dataset: ${datasetInfo.name} · ${(datasetInfo.rows ?? 0).toLocaleString()} rows`
                      : "Sample data is preloaded — ready to demo."}
                  </div>
                </div>

                <div className="pipeline-step">
                  <div className={`pipeline-badge ${view === "compare" ? (cmpA.events && cmpB.events ? "done" : "") : events ? "done" : ""}`}>1</div>
                  <div className="pipeline-body">
                    <div className="pipeline-stage">
                      <div className="pipeline-stage-name">Data</div>
                      <div className="pipeline-stage-meta">Upload CSV/TSV; auto-normalize</div>
                    </div>
                    <div className="card pad">
                      {view === "compare" ? (
                        <div style={{ display: "grid", gap: 14 }}>
                          <div>
                            <div className="pill">Dataset A</div>
                            <div style={{ height: 8 }} />
                            <FileImport
                              onLoaded={({ rawRows, columnMapping, fileName }) => {
                                setError(null);
                                const { events: ev, report } = buildEvents(rawRows, columnMapping);
                                setCmpA({
                                  fileName: fileName || "A",
                                  rows: rawRows,
                                  mapping: columnMapping,
                                  events: ev,
                                  warnings: summarizeWarnings(report, columnMapping),
                                });
                              }}
                              onError={(msg) => setError(msg)}
                            />
                            {cmpA.warnings?.length ? (
                              <div className="notice" style={{ marginTop: 10 }}>
                                <div style={{ fontWeight: 700 }}>{t("sections.dataHints")} (A)</div>
                                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                  {cmpA.warnings.map((w) => (
                                    <li key={w}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                          <div>
                            <div className="pill">Dataset B</div>
                            <div style={{ height: 8 }} />
                            <FileImport
                              onLoaded={({ rawRows, columnMapping, fileName }) => {
                                setError(null);
                                const { events: ev, report } = buildEvents(rawRows, columnMapping);
                                setCmpB({
                                  fileName: fileName || "B",
                                  rows: rawRows,
                                  mapping: columnMapping,
                                  events: ev,
                                  warnings: summarizeWarnings(report, columnMapping),
                                });
                              }}
                              onError={(msg) => setError(msg)}
                            />
                            {cmpB.warnings?.length ? (
                              <div className="notice" style={{ marginTop: 10 }}>
                                <div style={{ fontWeight: 700 }}>{t("sections.dataHints")} (B)</div>
                                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                  {cmpB.warnings.map((w) => (
                                    <li key={w}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="row split">
                            <div>
                              <div className="card-title">{t("sections.import")}</div>
                              <div className="card-sub">Sample data is ready; replace only if needed.</div>
                            </div>
                            <span className="pill success">Ready</span>
                          </div>
                          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                            <div className="notice">
                              <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                                <div>
                                  <div style={{ fontWeight: 850 }}>
                                    {datasetInfo?.name
                                      ? `Injected: ${datasetInfo.name}`
                                      : "Loading sample dataset…"}
                                  </div>
                                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                    {datasetInfo?.rows ? `${datasetInfo.rows.toLocaleString()} ${"rows"}` : "No action needed — start exploring."}
                                  </div>
                                </div>
                                <span className={`pill ${datasetInfo?.name ? "success" : ""}`}>{datasetInfo?.source?.startsWith?.("preset:") ? "Preset" : "Sample"}</span>
                              </div>
                            </div>

                            <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                              <div className="label">Switch preset</div>
                              <select
                                className="select"
                                value={consolePreset}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setConsolePreset(v);
                                  loadPreset(v).catch((err) => setError(err instanceof Error ? err.message : String(err)));
                                }}
                              >
                                {consolePresets.map((p) => (
                                  <option key={p.value} value={p.value}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <details className="details-block" style={{ marginTop: 10 }}>
                            <summary className="details-summary">Replace dataset / mapping</summary>
                            <div style={{ height: 10 }} />
                            <FileImport
                              onLoaded={({ rawRows, columnMapping, fileName }) => {
                                setError(null);
                                setSelectedCell(null);
                                setSelectedPair(null);
                                setEvidenceModal({ open: false, title: "", rowIds: [] });
                                const { events: ev, report } = buildEvents(rawRows, columnMapping);
                                setMapping(columnMapping);
                                setEventsAll(ev);
                                setEvents(ev);
                                setDatasetMode("full");
                                setSmoothStats(null);
                                setDatasetInfo({ name: fileName || "Imported dataset", source: "import", rows: rawRows?.length ?? 0 });
                                setImportWarnings(summarizeWarnings(report, columnMapping));
                                setFilters((prev) => {
                                  const base = { ...defaultFilters(), ...(initial.filters ?? {}) };
                                  return { ...base, includeSelfLoops: prev.includeSelfLoops };
                                });
                                setView("network");
                              }}
                              onError={(msg) => setError(msg)}
                            />
                          </details>
                        </>
                      )}

                      {error ? (
                        <div className="warning" style={{ marginTop: 12 }}>
                          {error}
                        </div>
                      ) : null}
                      {view !== "compare" && importWarnings.length ? (
                        <div className="notice" style={{ marginTop: 12 }}>
                          <div style={{ fontWeight: 700 }}>{t("sections.dataHints")}</div>
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                            {importWarnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="pipeline-step">
                  <div className={`pipeline-badge ${datasetMode === "smooth" ? "done" : ""}`}>2</div>
                  <div className="pipeline-body">
                    <div className="pipeline-stage">
                      <div className="pipeline-stage-name">Performance</div>
                      <div className="pipeline-stage-meta">Auto-suggest smoothing for large data</div>
                    </div>
                    <div className="card pad">
                      {datasetProfile ? (
                        <>
                          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <span className="pill">
                              {datasetProfile.rows.toLocaleString()} rows
                            </span>
                            <span className="pill">
                              {datasetProfile.firms.toLocaleString()} firms
                            </span>
                            <span className="pill">
                              {datasetProfile.edges.toLocaleString()} edges
                            </span>
                            {datasetMode === "smooth" ? <span className="pill success">Optimized</span> : null}
                            {perfNeedsSmoothing && datasetMode !== "smooth" ? <span className="pill warn">Optimize recommended</span> : null}
                          </div>
                          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                            {datasetMode !== "smooth" ? (
                              <button className="btn small primary" type="button" onClick={applySmoothMode} disabled={!eventsAll?.length}>
                                Optimize (recommended)
                              </button>
                            ) : (
                              <button className="btn small" type="button" onClick={applyFullMode} disabled={!eventsAll?.length}>
                                Use full
                              </button>
                            )}
                            {smoothStats ? (
                              <span className="muted" style={{ fontSize: 12 }}>
                                Kept {smoothStats.keptFirms.toLocaleString()} firms · {smoothStats.keptEdges.toLocaleString()} edges
                              </span>
                            ) : null}
                          </div>
                          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                            {`Budget: ≤${perfLimits.maxFirms} firms, ≤${perfLimits.maxEdges} edges.`}
                          </div>
                        </>
                      ) : (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Sample data is ready; import custom data to evaluate performance automatically.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pipeline-step">
                  <div className={`pipeline-badge ${events ? "done" : ""}`}>3</div>
                  <div className="pipeline-body">
                    <div className="pipeline-stage">
                      <div className="pipeline-stage-name">Filters</div>
                      <div className="pipeline-stage-meta">Get to a clear conclusion faster</div>
                    </div>
                    <div className="card pad">
                      <div style={{ display: "grid", gap: 10, opacity: consoleFiltersDisabled ? 0.6 : 1, pointerEvents: consoleFiltersDisabled ? "none" : "auto" }}>
                        <div style={{ display: "grid", gap: 10 }}>
                          <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                            <div className="label">Focus firm</div>
                            <select
                              className="select"
                              value={filters.focusCell ?? ""}
                              onChange={(e) => {
                                const v = String(e.target.value || "").trim();
                                if (!v) setFilters({ ...filters, focusCell: undefined });
                                else setFilters({ ...filters, focusCell: v, focusMode: filters.focusMode || "any" });
                              }}
                            >
                              <option value="">(All)</option>
                              {quickOptions.focusFirms.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </div>

                          {filters.focusCell ? (
                            <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                              <div className="label">Focus mode</div>
                              <select
                                className="select"
                                value={filters.focusMode ?? "any"}
                                onChange={(e) => setFilters({ ...filters, focusMode: e.target.value })}
                              >
                                <option value="any">Any</option>
                                <option value="outgoing">As plaintiff</option>
                                <option value="incoming">As defendant</option>
                              </select>
                            </div>
                          ) : null}

                          <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                            <div className="label">Case type</div>
                            <select
                              className="select"
                              value={(filters.metaboliteQuery ?? "").trim()}
                              onChange={(e) => setFilters({ ...filters, metaboliteQuery: e.target.value })}
                            >
                              <option value="">(All)</option>
                              {quickOptions.caseTypes.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                            <div className="label">Court</div>
                            <select
                              className="select"
                              value={(filters.sensorQuery ?? "").trim()}
                              onChange={(e) => setFilters({ ...filters, sensorQuery: e.target.value })}
                            >
                              <option value="">(All)</option>
                              {quickOptions.courts.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                            <div className="label">Outcome</div>
                            <select
                              className="select"
                              value={(filters.annotationQuery ?? "").trim()}
                              onChange={(e) => setFilters({ ...filters, annotationQuery: e.target.value })}
                            >
                              <option value="">(All)</option>
                              {quickOptions.outcomes.map((v) => (
                                <option key={v} value={v}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <details className="details-block">
                          <summary className="details-summary">Advanced filters</summary>
                          <div style={{ height: 10 }} />
                          <FiltersPanel disabled={false} filters={filters} setFilters={(next) => setFilters(next)} onReset={() => setFilters(defaultFilters())} />
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="right">
	            <div className="card viz-shell">
		              <div className="viz-titlebar">
		                <div>
		                  <div className="card-title">
		                    {topTab === "matters"
		                      ? t("viewTitles.matters")
		                      : topTab === "explore"
		                      ? view === "table"
		                        ? t("viewTitles.exploreTable")
		                        : t("viewTitles.exploreNetwork")
		                      : topTab === "rankings"
		                        ? t("viewTitles.rankings")
		                        : topTab === "report"
		                          ? t("viewTitles.report")
		                          : t("viewTitles.advanced")}
	                  </div>
	                  <div className="viz-note">
	                    {topTab === "matters"
	                      ? t("viewSubtitles.matters")
	                      : topTab === "explore"
	                      ? t("viewSubtitles.explore")
	                      : topTab === "rankings"
	                        ? t("viewSubtitles.rankings")
	                        : topTab === "report"
	                          ? t("viewSubtitles.report")
	                          : t("viewSubtitles.advanced")}
	                  </div>
	                </div>
                <div className="row">
                  {demoMode ? <span className="pill">{t("misc.demoMode")}</span> : null}
                  {filters.focusCell ? (
                    <button className="btn danger small" onClick={() => setFilters({ ...filters, focusCell: undefined })}>
                      Clear focus
                    </button>
                  ) : null}
                </div>
              </div>

	              <div className="viz-body">
	                {topTab === "explore" ? (
	                  <div className="row split" style={{ paddingBottom: 10, gap: 10, flexWrap: "wrap" }}>
	                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
	                      <button className={`btn small ${view === "network" ? "primary" : ""}`} onClick={() => setView("network")}>
	                        Network
	                      </button>
	                      <button className={`btn small ${view === "table" ? "primary" : ""}`} onClick={() => setView("table")}>
	                        Table
	                      </button>
		                    </div>
		                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
		                      {view === "network" && selectedLink ? (
		                        <CitationBadge
	                          rowIds={selectedLink.rowIds ?? []}
	                          title={t("network.evidenceTitle", { src: selectedLink.source, dst: selectedLink.target })}
	                          onOpenEvidence={(ids) => openEvidence(ids, t("network.evidenceSub", { src: selectedLink.source, dst: selectedLink.target }))}
	                        />
	                      ) : view === "network" && !selectedCell && !(selectedPair?.sender && selectedPair?.receiver) ? (
	                        <span className="pill">{t("network.hint")}</span>
	                      ) : null}

	                      {selectedPair?.sender && selectedPair?.receiver ? (
	                        <span className="pill">
	                          Selected: {selectedPair.sender} → {selectedPair.receiver}
	                        </span>
	                      ) : selectedCell ? (
	                        <span className="pill">
	                          Selected: {selectedCell}
	                        </span>
	                      ) : (
	                        <span className="pill">Select a firm/edge</span>
	                      )}

		                      {view === "network" ? (
		                        <>
		                          <button className="btn small" type="button" disabled={!networkApiReady} onClick={() => networkApiRef.current?.fit?.()}>
		                            {t("network.fit")}
		                          </button>
	                          <button
	                            className="btn small"
	                            type="button"
	                            disabled={!networkApiReady}
	                            onClick={() => networkApiRef.current?.toggleFullscreen?.()}
	                          >
	                            {t(networkFullscreen ? "network.exitFullscreen" : "network.fullscreen")}
	                          </button>
	                          <button className="btn small" type="button" disabled={!networkApiReady} onClick={() => networkApiRef.current?.exportPng?.()}>
	                            {t("network.exportPng")}
	                          </button>
		                        </>
		                      ) : null}
		                    </div>
		                  </div>
		                ) : null}

	                {topTab === "advanced" ? (
	                  <div className="row split" style={{ paddingBottom: 10, gap: 10, flexWrap: "wrap" }}>
	                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
	                      <button className={`btn small ${view === "matrix" ? "primary" : ""}`} onClick={() => setView("matrix")}>
	                        Matrix
	                      </button>
	                      {view === "matrix" ? (
	                        <>
	                          <span className="pill">Mode</span>
	                          <button className={`btn small ${matrixMode === "heat" ? "primary" : ""}`} onClick={() => setMatrixMode("heat")}>
	                            Heat
	                          </button>
	                          <button className={`btn small ${matrixMode === "dot" ? "primary" : ""}`} onClick={() => setMatrixMode("dot")}>
	                            Dot
	                          </button>
	                        </>
	                      ) : null}
	                      <button className={`btn small ${view === "fit" ? "primary" : ""}`} onClick={() => setView("fit")}>
	                        Fit
	                      </button>
                      <button className={`btn small ${view === "whatif" ? "primary" : ""}`} onClick={() => setView("whatif")}>
                        What-if
                      </button>
	                      <button className={`btn small ${view === "compare" ? "primary" : ""}`} onClick={() => setView("compare")}>
	                        Compare
	                      </button>
	                      <button className={`btn small ${view === "llm" ? "primary" : ""}`} onClick={() => setView("llm")}>
	                        LLM
	                      </button>
	                    </div>
                    {demoMode ? <span className="pill">{t("misc.advancedHidden")}</span> : null}
                  </div>
                ) : null}

                <ErrorBoundary title="Visualization render failed (caught)" resetKey={view}>
                  {view === "matters" ? (
                    <div className="viz-scroll">
                      {selectedMatterId ? (
                        <MatterWorkspace
                          matterId={selectedMatterId}
                          onBack={() => setSelectedMatterId(null)}
                          onShowToast={showToast}
                        />
                      ) : (
                        <MatterList
                          onSelectMatter={(matter) => setSelectedMatterId(matter.id)}
                          onCreateMatter={() => setCreateMatterOpen(true)}
                        />
                      )}
                    </div>
                  ) : view === "compare" ? (
                    !filteredA || !filteredB ? (
                      <div className="viz-scroll">
                        <div className="notice">{t("misc.compareNeedsTwo")}</div>
                      </div>
                    ) : (
                      <div className="viz-scroll">
                        <CompareView
                          eventsA={filteredA}
                          eventsB={filteredB}
                          filters={filters}
                          onApplyRecommendations={applyFilterPatch}
                          selectedCell={selectedCell}
                          onSelectCell={setSelectedCell}
                        />
                      </div>
                    )
                  ) : view === "insights" ? (
                    !events || !filtered ? (
                      <div className="viz-scroll">
                        <div className="notice">{t("misc.importFirst")}</div>
                      </div>
                    ) : (
                      <div className="viz-scroll">
                        <InsightsPanel
                          title="Single-dataset summary / QC"
                          fileLabel="single-insights"
                          insights={singleInsights}
                          onApplyRecommendations={applyFilterPatch}
                          events={filtered}
                          eventsAll={eventsAll}
                          filters={filters}
                          selectedPair={selectedPair}
                          onSelectPair={selectPair}
                          onOpenEvidence={openEvidence}
                          onNavigate={(nextView) => setView(nextView)}
                        />
                      </div>
                    )
                  ) : view === "llm" ? (
                    <div className="viz-scroll">
                      <ErrorBoundary title="LLM panel render failed (caught)" resetKey="llm">
                        <LlmPanel />
                      </ErrorBoundary>
                    </div>
                  ) : view === "rankings" ? (
                    <div className="viz-scroll">
                      <RankingsView
                        rankings={rankings}
                        error={rankingsError}
                        onReload={loadRankings}
                        presentFirms={presentFirms}
                        onFocusFirm={(firm, mode) => {
                          if (!firm) return;
                          setFilters({ ...filters, focusCell: firm, focusMode: mode || "any" });
                          setView("network");
                          setSelectedCell(firm);
                          setAssistantOpen(true);
                          setAssistantTab("analysis");
                        }}
                      />
                    </div>
                  ) : view === "whatif" ? (
                    !events || !filtered ? (
                      <div className="viz-scroll">
                        <div className="notice">{t("misc.importFirst")}</div>
                      </div>
                    ) : (
                      <CounterfactualView
                        events={filtered}
                        rankings={rankings}
                        caseTypeValence={caseTypeValence}
                        caseTypePrivilege={caseTypePrivilege}
                        selectedPair={selectedPair}
                        onSelectPair={selectPair}
                        onOpenEvidence={openEvidence}
                      />
                    )
                  ) : view === "fit" ? (
                    <FitView />
                  ) : !events || !filtered || !selectionSummary ? (
                    <div className="viz-scroll">
                      <div className="notice">{t("misc.importFirst")}</div>
                    </div>
	                  ) : view === "network" ? (
	                    <div className="viz-stack">
	                      <Legend mode="network" />
	                      <NetworkView
	                        nodes={selectionSummary.nodes}
	                        links={selectionSummary.links}
	                        selectedCell={selectedCell}
	                        onSelectCell={selectCell}
	                        selectedPair={selectedPair}
	                        onSelectPair={selectPair}
	                        onApi={setNetworkApi}
	                        onFullscreenChange={setNetworkFullscreen}
	                      />
	                    </div>
	                  ) : view === "matrix" ? (
                    <div className="viz-stack">
                      <Legend mode={matrixMode === "dot" ? "dotplot" : "matrix"} />
                      {matrixMode === "dot" ? (
                        <DotPlotView
                          matrix={selectionSummary.matrix}
                          selectedCell={selectedCell}
                          onSelectCell={selectCell}
                          selectedPair={selectedPair}
                          onSelectPair={selectPair}
                          onOpenEvidence={openEvidence}
                        />
                      ) : (
                        <MatrixView
                          matrix={selectionSummary.matrix}
                          selectedCell={selectedCell}
                          onSelectCell={selectCell}
                          selectedPair={selectedPair}
                          onSelectPair={selectPair}
                          onOpenEvidence={openEvidence}
                        />
                      )}
                    </div>
                  ) : view === "table" ? (
                    <TableView events={filtered} selectedPair={selectedPair} onSelectPair={selectPair} onOpenEvidence={openEvidence} />
                  ) : (
                    <div className="viz-scroll">
                      <div className="notice">{t("misc.pickView")}</div>
                    </div>
                  )}
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EvidenceModal
        open={!!evidenceModal.open}
        title={evidenceModal.title}
        rowIds={evidenceModal.rowIds}
        eventsByRowId={eventsByRowId}
        onClose={() => setEvidenceModal({ open: false, title: "", rowIds: [] })}
        onSelectPair={selectPair}
        onNavigate={(nextView) => setView(nextView)}
      />

      <CreateMatterModal
        open={createMatterOpen}
        onClose={() => setCreateMatterOpen(false)}
        onCreated={(matter) => {
          setSelectedMatterId(matter.id);
          showToast(`Matter created: ${matter.name}`);
        }}
      />

	      <AssistantDrawer
	        open={assistantOpen}
	        tab={assistantTab}
	        onTab={(t) => setAssistantTab(normalizeAssistantTabGroup(t))}
	        selectedCell={selectedCell}
	        details={details}
	        selectedPair={selectedPair}
        selectionSummary={selectionSummary}
        events={filtered}
        eventsAll={eventsAll}
        filters={filters}
        focusCell={filters.focusCell}
        focusMode={filters.focusMode}
        onClose={() => setAssistantOpen(false)}
        onApplyFocus={(cell, mode) => setFilters({ ...filters, focusCell: cell, focusMode: mode })}
        onClearFocus={() => setFilters({ ...filters, focusCell: undefined })}
        onSelectPair={selectPair}
        onOpenEvidence={openEvidence}
        onApplyFilterPatch={applyFilterPatch}
        onNavigate={(nextView) => setView(nextView)}
      />

      <CommandPalette
        open={paletteOpen}
        items={(() => {
          const out = [];
          const seen = new Set();
          const ranked = Array.isArray(rankings) ? [...rankings].sort((a, b) => (num(a.Rank) ?? Infinity) - (num(b.Rank) ?? Infinity)) : [];
          for (const r of ranked.slice(0, 1200)) {
            const firm = String(r?.Firm ?? "").trim();
            if (!firm || seen.has(firm)) continue;
            out.push({ kind: "firm", id: firm, label: firm });
            seen.add(firm);
          }
          for (const firm of presentFirms ?? []) {
            const f = String(firm ?? "").trim();
            if (!f || seen.has(f)) continue;
            out.push({ kind: "firm", id: f, label: f });
            seen.add(f);
          }
          return out;
        })()}
        onClose={() => setPaletteOpen(false)}
        onPick={(it) => {
          if (!it || it.kind !== "firm") return;
          const firm = String(it.id ?? "").trim();
          if (!firm) return;
          setPaletteOpen(false);
          setView("network");
          setFilters((prev) => ({ ...prev, focusCell: firm, focusMode: "any" }));
          setSelectedCell(firm);
          setAssistantOpen(true);
          setAssistantTab("analysis");
        }}
      />

	      <StoryMode
	        open={storyOpen}
	        step={storyStep}
	        busy={storyBusy}
	        error={storyError}
	        demoMode={demoMode}
	        onClose={() => setStoryOpen(false)}
	        onRun={runStory}
	        onLoadTop100={() => loadPreset("top100")}
	        onLoadTop50={() => loadPreset("top50")}
	        onExport={exportReport}
	      />
        {isEmbedded && pipelineOpen ? (
          <div className="pipeline-overlay" role="dialog" aria-modal="true" aria-label="Console">
            <button className="pipeline-overlay-backdrop" type="button" aria-label="Close" onClick={() => setPipelineOpen(false)} />
            <div className="pipeline-overlay-panel">
              <div className="pipeline-overlay-head">
                <div>
                  <div className="pipeline-overlay-title">Console</div>
                  <div className="pipeline-overlay-sub">Data · Optimize · Filters (no extra setup)</div>
                </div>
                <button className="btn small" type="button" onClick={() => setPipelineOpen(false)}>
                  Close
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="pipeline">
                  <div className="pipeline-step">
                    <div className={`pipeline-badge ${view === "compare" ? (cmpA.events && cmpB.events ? "done" : "") : events ? "done" : ""}`}>1</div>
                    <div className="pipeline-body">
                      <div className="pipeline-stage">
                        <div className="pipeline-stage-name">Data</div>
                        <div className="pipeline-stage-meta">Upload CSV/TSV; auto-normalize</div>
                      </div>
                      <div className="card pad">
                        {view === "compare" ? (
                          <div style={{ display: "grid", gap: 14 }}>
                            <div>
                              <div className="pill">Dataset A</div>
                              <div style={{ height: 8 }} />
                              <FileImport
                                onLoaded={({ rawRows, columnMapping, fileName }) => {
                                  setError(null);
                                  const { events: ev, report } = buildEvents(rawRows, columnMapping);
                                  setCmpA({
                                    fileName: fileName || "A",
                                    rows: rawRows,
                                    mapping: columnMapping,
                                    events: ev,
                                    warnings: summarizeWarnings(report, columnMapping),
                                  });
                                }}
                                onError={(msg) => setError(msg)}
                              />
                              {cmpA.warnings?.length ? (
                                <div className="notice" style={{ marginTop: 10 }}>
                                  <div style={{ fontWeight: 700 }}>{t("sections.dataHints")} (A)</div>
                                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                    {cmpA.warnings.map((w) => (
                                      <li key={w}>{w}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                            <div>
                              <div className="pill">Dataset B</div>
                              <div style={{ height: 8 }} />
                              <FileImport
                                onLoaded={({ rawRows, columnMapping, fileName }) => {
                                  setError(null);
                                  const { events: ev, report } = buildEvents(rawRows, columnMapping);
                                  setCmpB({
                                    fileName: fileName || "B",
                                    rows: rawRows,
                                    mapping: columnMapping,
                                    events: ev,
                                    warnings: summarizeWarnings(report, columnMapping),
                                  });
                                }}
                                onError={(msg) => setError(msg)}
                              />
                              {cmpB.warnings?.length ? (
                                <div className="notice" style={{ marginTop: 10 }}>
                                  <div style={{ fontWeight: 700 }}>{t("sections.dataHints")} (B)</div>
                                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                                    {cmpB.warnings.map((w) => (
                                      <li key={w}>{w}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="notice">
                              <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                                <div>
                                  <div style={{ fontWeight: 850 }}>
                                    {datasetInfo?.name
                                      ? `Injected: ${datasetInfo.name}`
                                      : "Loading sample dataset…"}
                                  </div>
                                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                                    {datasetInfo?.rows ? `${datasetInfo.rows.toLocaleString()} ${"rows"}` : "No action needed — start exploring."}
                                  </div>
                                </div>
                                <span className={`pill ${datasetInfo?.name ? "success" : ""}`}>{datasetInfo?.source?.startsWith?.("preset:") ? "Preset" : "Sample"}</span>
                              </div>
                            </div>

                            <div className="field" style={{ gridTemplateColumns: "92px 1fr", marginTop: 10 }}>
                              <div className="label">Switch preset</div>
                              <select
                                className="select"
                                value={consolePreset}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setConsolePreset(v);
                                  loadPreset(v).catch((err) => setError(err instanceof Error ? err.message : String(err)));
                                }}
                              >
                                {consolePresets.map((p) => (
                                  <option key={p.value} value={p.value}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <details className="details-block" style={{ marginTop: 10 }}>
                              <summary className="details-summary">Replace dataset / mapping</summary>
                              <div style={{ height: 10 }} />
                              <FileImport
                                onLoaded={({ rawRows, columnMapping, fileName }) => {
                                  setError(null);
                                  setSelectedCell(null);
                                  setSelectedPair(null);
                                  setEvidenceModal({ open: false, title: "", rowIds: [] });
                                  const { events: ev, report } = buildEvents(rawRows, columnMapping);
                                  setMapping(columnMapping);
                                  setEventsAll(ev);
                                  setEvents(ev);
                                  setDatasetMode("full");
                                  setSmoothStats(null);
                                  setDatasetInfo({ name: fileName || "Imported dataset", source: "import", rows: rawRows?.length ?? 0 });
                                  setImportWarnings(summarizeWarnings(report, columnMapping));
                                  setFilters((prev) => {
                                    const base = { ...defaultFilters(), ...(initial.filters ?? {}) };
                                    return { ...base, includeSelfLoops: prev.includeSelfLoops };
                                  });
                                  setView("network");
                                  setPipelineOpen(false);
                                }}
                                onError={(msg) => setError(msg)}
                              />
                            </details>
                          </>
                        )}
                        {error ? (
                          <div className="warning" style={{ marginTop: 12 }}>
                            {error}
                          </div>
                        ) : null}
                        {view !== "compare" && importWarnings.length ? (
                          <div className="notice" style={{ marginTop: 12 }}>
                            <div style={{ fontWeight: 700 }}>{t("sections.dataHints")}</div>
                            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                              {importWarnings.map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="pipeline-step">
                    <div className={`pipeline-badge ${datasetMode === "smooth" ? "done" : ""}`}>2</div>
                    <div className="pipeline-body">
                      <div className="pipeline-stage">
                        <div className="pipeline-stage-name">Performance</div>
                        <div className="pipeline-stage-meta">Auto-suggest smoothing for large data</div>
                      </div>
                      <div className="card pad">
                        {datasetProfile ? (
                          <>
                            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                              <span className="pill">
                                {datasetProfile.rows.toLocaleString()} rows
                              </span>
                              <span className="pill">
                                {datasetProfile.firms.toLocaleString()} firms
                              </span>
                              <span className="pill">
                                {datasetProfile.edges.toLocaleString()} edges
                              </span>
                              {datasetMode === "smooth" ? <span className="pill success">Optimized</span> : null}
                              {perfNeedsSmoothing && datasetMode !== "smooth" ? <span className="pill warn">Optimize recommended</span> : null}
                            </div>
                            <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                              {datasetMode !== "smooth" ? (
                                <button className="btn small primary" type="button" onClick={applySmoothMode} disabled={!eventsAll?.length}>
                                  Optimize (recommended)
                                </button>
                              ) : (
                                <button className="btn small" type="button" onClick={applyFullMode} disabled={!eventsAll?.length}>
                                  Use full
                                </button>
                              )}
                              {smoothStats ? (
                                <span className="muted" style={{ fontSize: 12 }}>
                                  Kept {smoothStats.keptFirms.toLocaleString()} firms · {smoothStats.keptEdges.toLocaleString()} edges
                                </span>
                              ) : null}
                            </div>
                          </>
                        ) : (
                          <div className="muted" style={{ fontSize: 12 }}>
                            Import data to get automatic performance recommendations.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pipeline-step">
                    <div className={`pipeline-badge ${events ? "done" : ""}`}>3</div>
                    <div className="pipeline-body">
                      <div className="pipeline-stage">
                        <div className="pipeline-stage-name">Filters</div>
                        <div className="pipeline-stage-meta">Get to a clear conclusion faster</div>
                      </div>
                      <div className="card pad">
                        <div style={{ display: "grid", gap: 10, opacity: consoleFiltersDisabled ? 0.6 : 1, pointerEvents: consoleFiltersDisabled ? "none" : "auto" }}>
                          <div style={{ display: "grid", gap: 10 }}>
                            <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                              <div className="label">Focus firm</div>
                              <select
                                className="select"
                                value={filters.focusCell ?? ""}
                                onChange={(e) => {
                                  const v = String(e.target.value || "").trim();
                                  if (!v) setFilters({ ...filters, focusCell: undefined });
                                  else setFilters({ ...filters, focusCell: v, focusMode: filters.focusMode || "any" });
                                }}
                              >
                                <option value="">(All)</option>
                                {quickOptions.focusFirms.map((f) => (
                                  <option key={f} value={f}>
                                    {f}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {filters.focusCell ? (
                              <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                                <div className="label">Focus mode</div>
                                <select
                                  className="select"
                                  value={filters.focusMode ?? "any"}
                                  onChange={(e) => setFilters({ ...filters, focusMode: e.target.value })}
                                >
                                  <option value="any">Any</option>
                                  <option value="outgoing">As plaintiff</option>
                                  <option value="incoming">As defendant</option>
                                </select>
                              </div>
                            ) : null}

                            <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                              <div className="label">Case type</div>
                              <select
                                className="select"
                                value={(filters.metaboliteQuery ?? "").trim()}
                                onChange={(e) => setFilters({ ...filters, metaboliteQuery: e.target.value })}
                              >
                                <option value="">(All)</option>
                                {quickOptions.caseTypes.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                              <div className="label">Court</div>
                              <select
                                className="select"
                                value={(filters.sensorQuery ?? "").trim()}
                                onChange={(e) => setFilters({ ...filters, sensorQuery: e.target.value })}
                              >
                                <option value="">(All)</option>
                                {quickOptions.courts.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="field" style={{ gridTemplateColumns: "92px 1fr" }}>
                              <div className="label">Outcome</div>
                              <select
                                className="select"
                                value={(filters.annotationQuery ?? "").trim()}
                                onChange={(e) => setFilters({ ...filters, annotationQuery: e.target.value })}
                              >
                                <option value="">(All)</option>
                                {quickOptions.outcomes.map((v) => (
                                  <option key={v} value={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <details className="details-block">
                            <summary className="details-summary">Advanced filters</summary>
                            <div style={{ height: 10 }} />
                            <FiltersPanel disabled={false} filters={filters} setFilters={(next) => setFilters(next)} onReset={() => setFilters(defaultFilters())} />
                          </details>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
	      {toast.open ? <div className="toast">{toast.text}</div> : null}
	      </div>
	    </I18nProvider>
	  );
}
