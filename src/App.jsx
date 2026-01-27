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
import AssistantDrawer from "./components/AssistantDrawer";
import CommandPalette from "./components/CommandPalette";
import StoryMode from "./components/StoryMode";
import LangToggle from "./components/LangToggle";
import ThemeToggle from "./components/ThemeToggle";
import { downloadHtml, downloadTsv, generateCompareReport, generateRankingsReport, generateSingleReport, summarizeDataset } from "./lib/report";
import { aggregatePairs, computeCategoryDiff, computePairDiff } from "./lib/compare";
import { buildCompareInsights, buildSingleInsights } from "./lib/intelligence";
import { computeNullControl, computeRobustness } from "./lib/robustness";
import { isDemoMode } from "./lib/demoMode";
import { normalizeLabel, parseDelimitedText } from "./lib/parse";
import { createT, detectLang, I18nProvider } from "./lib/i18n";
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

function normalizeInitialView(view) {
  const v = String(view ?? "").trim() || "network";
  if (v === "dotplot") return { view: "matrix", matrixMode: "dot" };
  if (
    v === "network" ||
    v === "matrix" ||
    v === "table" ||
    v === "rankings" ||
    v === "whatif" ||
    v === "insights" ||
    v === "compare" ||
    v === "llm"
  ) {
    return { view: v, matrixMode: "heat" };
  }
  return { view: "network", matrixMode: "heat" };
}

function topTabFromView(view) {
  if (view === "rankings") return "rankings";
  if (view === "insights") return "report";
  if (view === "network" || view === "matrix") return "explore";
  return "advanced";
}

export default function App() {
  const initial = React.useMemo(() => readQueryState(window.location.search), []);
  const init = React.useMemo(() => normalizeInitialView(initial.view ?? "network"), [initial.view]);
  const demoMode = React.useMemo(() => isDemoMode(window.location.search), []);
  const [lang, setLang] = React.useState(() => detectLang({ search: window.location.search }));
  const [theme, setTheme] = React.useState(() => detectTheme({ search: window.location.search }));
  const t = React.useMemo(() => createT(lang), [lang]);
  const tx = React.useCallback((zh, en) => (lang === "en" ? en : zh), [lang]);
  const [view, setView] = React.useState(init.view);
  const [matrixMode, setMatrixMode] = React.useState(init.matrixMode); // heat | dot
  const [lastExploreView, setLastExploreView] = React.useState(init.view === "network" || init.view === "matrix" ? init.view : "network");
  const [lastAdvancedView, setLastAdvancedView] = React.useState(
    init.view === "compare" || init.view === "whatif" || init.view === "table" || init.view === "llm" ? init.view : "whatif",
  );
  const [filters, setFilters] = React.useState(() => ({ ...defaultFilters(), ...(initial.filters ?? {}) }));

  const [mapping, setMapping] = React.useState(null);
  const [events, setEvents] = React.useState(null);
  const [importWarnings, setImportWarnings] = React.useState([]);
  const [error, setError] = React.useState(null);
  const [datasetInfo, setDatasetInfo] = React.useState(null); // {name, source, rows}

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
  const [assistantTab, setAssistantTab] = React.useState("insights"); // insights | firm | evidence | verifier
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [storyOpen, setStoryOpen] = React.useState(false);
  const [storyStep, setStoryStep] = React.useState(1);
  const [storyBusy, setStoryBusy] = React.useState(false);
  const [storyError, setStoryError] = React.useState("");
  const networkApiRef = React.useRef(null);
  const [networkApiReady, setNetworkApiReady] = React.useState(false);
  const [networkFullscreen, setNetworkFullscreen] = React.useState(false);

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
      window.localStorage.setItem("cldemo_lang", String(lang));
    } catch {
      // ignore
    }
    try {
      document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    } catch {
      // ignore
    }
    // Notify parent (J2) of language change
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "cldemo:lang", lang }, window.location.origin);
      }
    } catch {
      // ignore cross-origin errors
    }
  }, [lang]);

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

  // Listen for theme/lang changes from parent (J2)
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
        if (data.type === "cldemo:lang") {
          const next = String(data.lang || "").trim().toLowerCase();
          if ((next === "zh" || next === "en") && next !== lang) {
            setLang(next);
          }
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [theme, lang]);

  React.useEffect(() => {
    const t = topTabFromView(view);
    if (t === "explore") setLastExploreView(view);
    if (t === "advanced") setLastAdvancedView(view);
  }, [view]);

  React.useEffect(() => {
    if (!demoMode) return;
    if (view === "compare" || view === "whatif" || view === "table" || view === "llm") {
      setView(lastExploreView || "network");
    }
  }, [demoMode, view, lastExploreView]);

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
    setAssistantTab("firm");
  }, []);

  const selectPair = React.useCallback((pair) => {
    if (!pair || typeof pair !== "object") return;
    const sender = typeof pair.sender === "string" ? pair.sender : "";
    const receiver = typeof pair.receiver === "string" ? pair.receiver : "";
    if (!sender || !receiver) return;
    setSelectedCell(null);
    setSelectedPair({ sender, receiver });
    setAssistantOpen(true);
    setAssistantTab("evidence");
  }, []);

  React.useEffect(() => {
    const qs = writeQueryState({ view, filters, demo: demoMode, lang, theme });
    window.history.replaceState({}, "", qs || "?");
  }, [view, filters, demoMode, lang, theme]);

  const loadRankings = React.useCallback(async () => {
    try {
      setRankingsError(null);
      const res = await fetch("/sample/mahari_exp_scores.csv");
      if (!res.ok) throw new Error(lang === "en" ? "Rankings file not found: /sample/mahari_exp_scores.csv" : "未找到 rankings 文件：/sample/mahari_exp_scores.csv");
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
      setRankingsError(e instanceof Error ? e.message : lang === "en" ? "Failed to load rankings" : "Rankings 加载失败");
    }
  }, [lang]);

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
    for (const e of Array.isArray(events) ? events : []) {
      const id = Number(e?.rowId);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!m.has(id)) m.set(id, e);
    }
    return m;
  }, [events]);

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
    return buildSingleInsights({ events: filtered, mapping, filters, lang });
  }, [filtered, mapping, filters, lang]);

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
          alert(lang === "en" ? "Import Dataset A and Dataset B in Compare first." : "请先在 Compare 模式导入两份数据（A 与 B）");
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
          lang,
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
          lang,
        });
        downloadHtml("mahari-law-firm-rankings-compare-report.html", html);
        return;
      }

      if (!filtered || !selectionSummary) {
        alert(lang === "en" ? "Import data and start analysis first." : "请先导入数据并开始分析");
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
        ? computeRobustness({ eventsAll: events, baseFilters: filters, topK: 10, lang })
        : null;
      const nullControl = events ? computeNullControl({ eventsAll: events, baseFilters: filters, n: 60, seed: 42, lang }) : null;
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
        lang,
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
      showToast(lang === "en" ? "Switch to Network view to export PNG." : "请切换到 Network 视图再导出 PNG。");
      return;
    }
    if (!networkApiReady) {
      showToast(lang === "en" ? "Network view not ready yet." : "网络视图尚未就绪。");
      return;
    }
    try {
      networkApiRef.current?.exportPng?.();
    } catch {
      showToast(lang === "en" ? "Export failed." : "导出失败。");
    }
  }, [view, networkApiReady, showToast, lang]);

  const exportRankingsTsv = React.useCallback(() => {
    const rows = Array.isArray(rankings) ? [...rankings] : [];
    if (!rows.length) {
      showToast(lang === "en" ? "Rankings not loaded yet." : "排名尚未加载。");
      return;
    }
    rows.sort((a, b) => (num(a.Rank) ?? Infinity) - (num(b.Rank) ?? Infinity));
    downloadTsv("mahari_rankings.tsv", rows, ["Rank", "Firm", "Score", "ExpScore"]);
    showToast(lang === "en" ? "Rankings exported (TSV)." : "已导出排名表（TSV）。");
  }, [rankings, showToast, lang]);

  const exportRankingsHtml = React.useCallback(() => {
    const rows = Array.isArray(rankings) ? [...rankings] : [];
    if (!rows.length) {
      showToast(lang === "en" ? "Rankings not loaded yet." : "排名尚未加载。");
      return;
    }
    rows.sort((a, b) => (num(a.Rank) ?? Infinity) - (num(b.Rank) ?? Infinity));
    const html = generateRankingsReport({
      title: lang === "en" ? "Law firm rankings report" : "律所排名报告",
      query: "",
      onlyPresent: false,
      presentFirmsCount: presentFirms?.size ?? 0,
      rows,
      lang,
    });
    downloadHtml("mahari-law-firm-rankings-rankings-report.html", html);
    showToast(lang === "en" ? "Rankings report exported (HTML)." : "已导出排名报告（HTML）。");
  }, [rankings, showToast, lang, presentFirms]);
  const topTab = topTabFromView(view);

  const goTopTab = (k) => {
    if (k === "explore") {
      setView(lastExploreView || "network");
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
      const cfg = getPreset(preset);
      const file = cfg.file;
      const res = await fetch(file);
      if (!res.ok) throw new Error(lang === "en" ? `Failed to load preset: ${file}` : `加载示例失败：${file}`);
      const rawRows = parseDelimitedText(await res.text());
      const columnMapping = cfg.mapping;
      setError(null);
      setSelectedCell(null);
      setSelectedPair(null);
      setEvidenceModal({ open: false, title: "", rowIds: [] });
      const { events: ev, report } = buildEvents(rawRows, columnMapping);
      setMapping(columnMapping);
      setEvents(ev);
      setDatasetInfo({ name: cfg.name || preset, source: `preset:${preset}`, rows: rawRows?.length ?? 0 });
      setImportWarnings(summarizeWarnings(report, columnMapping, lang));
      const baseFilters = { ...defaultFilters(), ...(initial.filters ?? {}) };
      setFilters((prev) => {
        const keepFocus = prev.focusCell ? { focusCell: prev.focusCell, focusMode: prev.focusMode } : {};
        return { ...baseFilters, ...keepFocus };
      });
      setView("network");
      return { events: ev, selectionSummary: computeSelectionSummary(filterEvents(ev, baseFilters)) };
    },
    [initial.filters, lang],
  );

  // Showcase mode: auto-load a preset so the Workbench "just works" without clicking Import.
  React.useEffect(() => {
    if (autoPresetLoaded.current) return;
    if (view === "compare") return;
    if (events || mapping) return;
    const q = new URLSearchParams(window.location.search);
    const raw = q.get("autopreset");
    if (String(raw ?? "").trim() === "0") return;
    const v = String(raw || "").trim();
    const preset = v || "top100";
    autoPresetLoaded.current = true;
    loadPreset(preset).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    });
  }, [demoMode, isEmbedded, events, mapping, view, loadPreset]);

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

  const runStory = React.useCallback(async () => {
    setStoryBusy(true);
    setStoryError("");
    setStoryStep(1);
    try {
      const loaded = await loadPreset(demoMode ? "top100" : "fig2");
      setStoryStep(2);
      setView("rankings");
      setAssistantOpen(true);
      setAssistantTab("firm");

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
    <I18nProvider lang={lang} setLang={setLang}>
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
                <LangToggle lang={lang} setLang={setLang} />
                <ThemeToggle theme={theme} setTheme={setTheme} />
              </div>
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
	          {!isEmbedded && (
	          <div className="left">
	            <div className="pipeline">
	              <div className="pipeline-head">
	                <div className="pipeline-title">{tx("流程管线", "Pipeline")}</div>
	                <div className="pipeline-sub">{tx("一键演示：数据已自动注入；全屏可查看与微调。", "Showcase: data auto-loaded; fullscreen to inspect & refine.")}</div>
	              </div>

	              <div className="pipeline-step">
	                <div className={`pipeline-badge ${view === "compare" ? (cmpA.events && cmpB.events ? "done" : "") : events ? "done" : ""}`}>1</div>
	                <div className="pipeline-body">
                    <div className="pipeline-stage">
                      <div className="pipeline-stage-name">{tx("数据导入", "Ingest")}</div>
                      <div className="pipeline-stage-meta">{tx("CSV/TSV → 标准化事件表", "CSV/TSV → normalized event table")}</div>
                    </div>
	                  <div className="card pad">
	              <div className="row split">
	                <div>
	                  <div className="card-title">{view === "compare" ? t("sections.importCompare") : t("sections.import")}</div>
	                  <div className="card-sub">
	                    {view === "compare" ? t("sections.importHelpCompare") : t("sections.importHelpSingle")}
	                  </div>
	                </div>
	              </div>
              <div className="divider" />
	              {view !== "compare" && datasetInfo ? (
	                <div className="notice" style={{ marginTop: 10 }}>
	                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
	                    <div>
	                      <div style={{ fontWeight: 800 }}>{tx("数据已注入", "Data injected")}</div>
	                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
	                        {datasetInfo.name} · {(datasetInfo.rows ?? 0).toLocaleString()} {tx("行", "rows")}
	                      </div>
	                    </div>
	                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
	                      <span className="pill success">{tx("可直接演示", "Ready")}</span>
	                      <button className="btn small" type="button" onClick={() => loadPreset("top100")}>
	                        {tx("重置为 Top100", "Reset Top100")}
	                      </button>
	                    </div>
	                  </div>
	                </div>
	              ) : null}

	              {view === "compare" ? (
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <div className="pill">{tx("数据集 A", "Dataset A")}</div>
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
                          warnings: summarizeWarnings(report, columnMapping, lang),
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
                    <div className="pill">{tx("数据集 B", "Dataset B")}</div>
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
                          warnings: summarizeWarnings(report, columnMapping, lang),
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
                <details className="details-block" style={{ marginTop: 10 }}>
                  <summary className="details-summary">{tx("替换数据 / 查看映射", "Replace dataset / mapping")}</summary>
                  <div style={{ height: 10 }} />
                  <FileImport
                    onLoaded={({ rawRows, columnMapping, fileName }) => {
                      setError(null);
                      setSelectedCell(null);
                      const { events: ev, report } = buildEvents(rawRows, columnMapping);
                      setMapping(columnMapping);
                      setEvents(ev);
                      setDatasetInfo({ name: fileName || tx("已导入数据", "Imported dataset"), source: "import", rows: rawRows?.length ?? 0 });
                      setImportWarnings(summarizeWarnings(report, columnMapping, lang));
                      setFilters((prev) => {
                        const base = { ...defaultFilters(), ...(initial.filters ?? {}) };
                        return {
                          ...base,
                          includeSelfLoops: prev.includeSelfLoops,
                        };
                      });
                    }}
                    onError={(msg) => setError(msg)}
                  />
                </details>
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
	                <div className={`pipeline-badge ${view === "compare" ? (cmpA.events && cmpB.events ? "done" : "") : events ? "done" : ""}`}>2</div>
	                <div className="pipeline-body">
                    <div className="pipeline-stage">
                      <div className="pipeline-stage-name">{tx("过滤与聚焦", "Filter & focus")}</div>
                      <div className="pipeline-stage-meta">{tx("Figure 风格：先收敛规模，再精筛", "Figure-style: reduce first, then refine")}</div>
                    </div>
	                  <div className="card pad">
	              <div className="row split">
	                <div>
	                  <div className="card-title">{t("sections.filters")}</div>
	                  <div className="card-sub">{t("sections.filtersSub")}</div>
	                </div>
                <div className="pill">
                  {view === "compare" ? (
                    filteredA && filteredB ? (
                      <>
                        <span>A {filteredA.length} rows</span>
                        <span>·</span>
                        <span>B {filteredB.length} rows</span>
                      </>
                    ) : (
                      <span className="muted">未加载</span>
                    )
                  ) : filtered ? (
                    <>
                      <span>
                        {filtered.length} {tx("行", "rows")}
                      </span>
                      <span>·</span>
                      <span>
                        {selectionSummary?.links?.length ?? 0} {tx("边", "edges")}
                      </span>
                      <span>·</span>
                      <span>
                        {selectionSummary?.nodes?.length ?? 0} {tx("节点", "nodes")}
                      </span>
                    </>
                  ) : (
                    <span className="muted">{t("misc.notLoaded")}</span>
                  )}
                </div>
              </div>
              <div className="divider" />
	              <FiltersPanel
	                disabled={view === "compare" ? !cmpA.events && !cmpB.events : !events}
	                filters={filters}
	                setFilters={(next) => setFilters(next)}
	                onReset={() => setFilters(defaultFilters())}
	              />
	                  </div>
	                </div>
	              </div>
	            </div>
	          </div>
	          )}

          <div className="right">
            <div className="card viz-shell">
              <div className="viz-titlebar">
                <div>
                  <div className="card-title">
                    {topTab === "explore"
                      ? view === "matrix"
                        ? matrixMode === "dot"
                          ? t("viewTitles.exploreMatrixDot")
                          : t("viewTitles.exploreMatrix")
                        : t("viewTitles.exploreNetwork")
                      : topTab === "rankings"
                        ? t("viewTitles.rankings")
                        : topTab === "report"
                          ? t("viewTitles.report")
                          : t("viewTitles.advanced")}
                  </div>
                  <div className="viz-note">
                    {topTab === "explore"
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
                      {tx("清除聚焦", "Clear focus")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="viz-body">
                {topTab === "explore" ? (
                  <div className="row split" style={{ paddingBottom: 10, gap: 10, flexWrap: "wrap" }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <button className={`btn small ${view === "network" ? "primary" : ""}`} onClick={() => setView("network")}>
                        {tx("网络", "Network")}
                      </button>
                      <button className={`btn small ${view === "matrix" ? "primary" : ""}`} onClick={() => setView("matrix")}>
                        {tx("矩阵", "Matrix")}
                      </button>
                      {view === "matrix" ? (
                        <>
                          <span className="pill">{tx("模式", "Mode")}</span>
                          <button className={`btn small ${matrixMode === "heat" ? "primary" : ""}`} onClick={() => setMatrixMode("heat")}>
                            {tx("热力", "Heat")}
                          </button>
                          <button className={`btn small ${matrixMode === "dot" ? "primary" : ""}`} onClick={() => setMatrixMode("dot")}>
                            {tx("点图", "Dot")}
                          </button>
                        </>
                      ) : null}
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
	                          {tx("已选边：", "Selected:")} {selectedPair.sender} → {selectedPair.receiver}
	                        </span>
	                      ) : selectedCell ? (
	                        <span className="pill">
	                          {tx("已选律所：", "Selected:")} {selectedCell}
	                        </span>
	                      ) : (
	                        <span className="pill">{tx("请选择律所/边", "Select a firm/edge")}</span>
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
                      <button className={`btn small ${view === "whatif" ? "primary" : ""}`} onClick={() => setView("whatif")}>
                        {tx("反事实", "What-if")}
                      </button>
                      <button className={`btn small ${view === "compare" ? "primary" : ""}`} onClick={() => setView("compare")}>
                        {tx("对比", "Compare")}
                      </button>
                      <button className={`btn small ${view === "table" ? "primary" : ""}`} onClick={() => setView("table")}>
                        {tx("表格", "Table")}
                      </button>
                      <button className={`btn small ${view === "llm" ? "primary" : ""}`} onClick={() => setView("llm")}>
                        LLM
                      </button>
                    </div>
                    {demoMode ? <span className="pill">{t("misc.advancedHidden")}</span> : null}
                  </div>
                ) : null}

                <ErrorBoundary title={tx("可视化区域渲染失败（已拦截）", "Visualization render failed (caught)")} resetKey={view} lang={lang}>
                  {view === "compare" ? (
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
                          title={tx("单样本自动摘要 / QC", "Single-dataset summary / QC")}
                          fileLabel="single-insights"
                          insights={singleInsights}
                          onApplyRecommendations={applyFilterPatch}
                          events={filtered}
                          eventsAll={events}
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
                      <ErrorBoundary title={tx("LLM 面板渲染失败（已拦截）", "LLM panel render failed (caught)")} resetKey="llm" lang={lang}>
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
                          setAssistantTab("firm");
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

      <AssistantDrawer
        open={assistantOpen}
        tab={assistantTab}
        onTab={(t) => setAssistantTab(t)}
        selectedCell={selectedCell}
        details={details}
        selectedPair={selectedPair}
        selectionSummary={selectionSummary}
        events={filtered}
        eventsAll={events}
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
          setAssistantTab("firm");
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
	      {toast.open ? <div className="toast">{toast.text}</div> : null}
	      </div>
	    </I18nProvider>
	  );
}
