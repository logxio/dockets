import { normalizeLabel, parseDelimitedText } from "../lib/parse";

const KB = {
  insights: "/sample/mahari_insights.json",
  profiles: "/sample/mahari_firm_profiles.json",
  rankings: "/sample/mahari_exp_scores.csv",
  cases: "/sample/mahari_fig2_moesm4_cases.csv",
};

const INTERACTIONS = {
  full: "/sample/mahari_fig2_moesm4_interactions.csv",
};

const STORAGE_KEYS = {
  lang: "cldemo_lang",
  theme: "cldemo_theme",
  introSeen: "j2_intro_seen",
};

const J2_LIMITS = {
  topN: 100,
  evidence: 100,
  caseIdsPerPair: 100,
  topCaseTypes: 30,
  topCourts: 20,
  topNodes: 100,
};

const I18N = {
  en: {
    logo: "Meridian · Legal Intelligence",
    run: "Run",
    statusReady: "Neural Engine Ready",
    statusProcessing: "Processing Query...",
    statusIdle: "Verifier-first · KB-backed · Local DeepSeek ready · Demo uses mock",
    llmOn: "LLM: LOCAL",
    llmOff: "LLM: DEMO",
    promptPlaceholder: "Ask: top rivalries, firm profiles, or defendant advantage...",
    evidenceEmpty: "No evidence attached.",
    analysisLog: "◢ Analysis Log",
    topInsights: "◢ Top Insights",
    rankingsTitle: "◢ Rankings (KB Snapshot)",
    tableHeadRank: "Rank",
    tableHeadFirm: "Firm",
    tableHeadWin: "Win Rate",
    tableHeadScore: "Score",
    tableHeadCases: "Cases",
    firmProfile: "Firm profile",
    metricWinRate: "Win Rate",
    metricScore: "Score",
    metricCases: "Cases",
    metricRank: "Rank",
    topCaseType: "Top: {caseType}",
    evidenceLinked: "✓ Evidence-linked",
    openWorkbench: "Open Workbench",
    workbench: "Workbench",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit Fullscreen",
    collapse: "Collapse",
    workbenchCta: "Open Workbench →",
    introQuery: "Morrison & Foerster vs Quinn Emanuel for patent litigation?",
    neuralDbHeader: "Agent 1 · KB Loader",
    neuralVerifyHeader: "Agent 2 · Verifier",
    neuralSynthHeader: "Agent 3 · Synthesis",
    neuralHandoffHeader: "Agent 4 · Workbench Handoff",
    winProbability: "Win Probability",
    stronglyRecommended: "✨ Strongly Recommended",
    greedDesc: "This firm outperforms market average by <strong>3.5x</strong> in Contract Disputes.",
    passed: "PASSED",
    hallucinationCheck: "Hallucination Check",
    verificationDetail:
      'Every citation verified against <strong>Harvard CAP</strong>.<br>🔒 Zero fake cases detected.',
    generatePitchDeck: "Generate Pitch Deck",
    pitchSubtitle:
      '"Why We Are Better Than Quinn Emanuel"<br>— A Data-Driven Proposal',
    generatePdf: "✨ Generate PDF",
    pitchAlert:
      '📊 Pitch Deck Generated!\\n\\n"Why We Are Better Than Quinn Emanuel"\\n— A Data-Driven Proposal\\n\\n• Win Rate: 82%\\n• Cases Analyzed: 842\\n• Confidence: High 🔥🔥\\n\\n✓ All claims verified via Harvard CAP\\n✓ Zero hallucinations detected\\n\\n[PDF would download here]',
    introLogs: [
      "KB loaded: 60,000+ cases from Harvard CAP",
      "Verifier-first pipeline engaged",
      "Claims bound to evidence IDs",
      "Confidence: High 🔥🔥",
      "Ready for workbench handoff",
    ],
    logPhrases: [
      "KB loaded (static snapshots)",
      "Verifier-first pipeline engaged",
      "Claims bound to evidence IDs",
      "Confidence: High 🔥🔥",
      "Workbench handoff ready",
    ],
    introCard1Steps: [
      "Connecting to Harvard CAP database...",
      "Establishing secure data tunnel...",
      "Loading 60,000+ litigation records...",
      "Database synchronized ✓",
    ],
    introCard2Steps: [
      "Analyzing 842 patent cases...",
      "Cross-referencing precedents...",
      "Verifying citation integrity...",
      "Zero hallucinations detected ✓",
    ],
    introCard3Steps: [
      "Computing Bayesian inference...",
      "Optimizing recommendation...",
      "Generating confidence scores...",
      "Neural synthesis complete ✓",
    ],
  },
  zh: {
    logo: "子午线 · 法律智能",
    run: "运行",
    statusReady: "神经引擎就绪",
    statusProcessing: "正在处理查询…",
    statusIdle: "可验证优先 · 知识库驱动 · 本地 DeepSeek 已就绪 · Demo 为 mock",
    llmOn: "LLM: 本地",
    llmOff: "LLM: 演示",
    promptPlaceholder: "请输入：对抗关系、律所画像、被告优势等…",
    evidenceEmpty: "暂无证据。",
    analysisLog: "◢ 分析日志",
    topInsights: "◢ 关键洞察",
    rankingsTitle: "◢ 排名（知识库快照）",
    tableHeadRank: "排名",
    tableHeadFirm: "律所",
    tableHeadWin: "胜率",
    tableHeadScore: "分数",
    tableHeadCases: "案件数",
    firmProfile: "律所画像",
    metricWinRate: "胜率",
    metricScore: "分数",
    metricCases: "案件数",
    metricRank: "排名",
    topCaseType: "优势类型：{caseType}",
    evidenceLinked: "✓ 可追溯证据",
    openWorkbench: "打开工作台",
    workbench: "工作台",
    fullscreen: "全屏",
    exitFullscreen: "退出全屏",
    collapse: "收起",
    workbenchCta: "打开工作台 →",
    introQuery: "Morrison & Foerster vs Quinn Emanuel：专利诉讼谁更强？",
    neuralDbHeader: "Agent 1 · 知识库加载",
    neuralVerifyHeader: "Agent 2 · 证据核验",
    neuralSynthHeader: "Agent 3 · 综合生成",
    neuralHandoffHeader: "Agent 4 · 工作台交接",
    winProbability: "胜率预测",
    stronglyRecommended: "✨ 强烈推荐",
    greedDesc: "该律所在合同纠纷中胜率约为市场平均的 <strong>3.5 倍</strong>。",
    passed: "通过",
    hallucinationCheck: "幻觉检查",
    verificationDetail: "每条引用均已对照 <strong>Harvard CAP</strong> 验证。<br>🔒 未发现虚假案例。",
    generatePitchDeck: "生成 Pitch Deck",
    pitchSubtitle: "“为什么我们强过 Quinn Emanuel”<br>— 数据驱动提案",
    generatePdf: "✨ 生成 PDF",
    pitchAlert:
      "📊 Pitch Deck 已生成！\\n\\n“为什么我们强过 Quinn Emanuel”\\n— 数据驱动提案\\n\\n• 胜率：82%\\n• 覆盖案件：842\\n• 置信度：高 🔥🔥\\n\\n✓ 所有结论均可追溯 Harvard CAP\\n✓ 未发现虚假案例\\n\\n[此处会下载 PDF]",
    introLogs: ["知识库已加载：Harvard CAP 案件快照", "可验证优先流水线启动", "结论绑定证据 ID", "置信度：高 🔥🔥", "准备交接至工作台"],
    logPhrases: ["知识库已加载（静态快照）", "可验证优先流水线启动", "结论绑定证据 ID", "置信度：高 🔥🔥", "工作台交接就绪"],
    introCard1Steps: ["连接 Harvard CAP 数据库…", "建立安全数据通道…", "加载 60,000+ 诉讼记录…", "数据库同步完成 ✓"],
    introCard2Steps: ["分析 842 件专利相关案件…", "交叉对照先例…", "核验引用完整性…", "未发现幻觉 ✓"],
    introCard3Steps: ["计算贝叶斯推断…", "优化推荐策略…", "生成置信度分数…", "综合完成 ✓"],
  },
};

function normalizeLang(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "zh" || s === "zh-cn" || s === "zh-hans") return "zh";
  if (s === "en" || s === "en-us" || s === "en-gb") return "en";
  return "";
}

function normalizeTheme(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "dark" || s === "night") return "dark";
  if (s === "light" || s === "day") return "light";
  return "";
}

function getSearchParam(key) {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get(key);
  } catch {
    return null;
  }
}

function setSearchParam(key, value) {
  try {
    const url = new URL(window.location.href);
    if (!value) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore
  }
}

let currentLang = "en";
let currentTheme = "dark";
let statusKey = "statusReady";
let rankingsSort = { key: "rank", dir: "asc" };
let j2RankingsRows = [];

function t(key, vars) {
  const dict = I18N[currentLang] || I18N.en;
  const raw = dict[key] ?? I18N.en[key] ?? "";
  if (typeof raw !== "string") return raw;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

function tx(zh, en) {
  return currentLang === "zh" ? zh : en;
}

function q(selector) {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function applyLang(nextLang) {
  const lang = normalizeLang(nextLang) || "en";
  currentLang = lang;
  try {
    window.localStorage.setItem(STORAGE_KEYS.lang, lang);
  } catch {
    // ignore
  }
  setSearchParam("lang", lang);
  try {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  } catch {
    // ignore
  }
  renderStaticCopy();
  broadcastWorkbenchLang();
}

function applyTheme(nextTheme) {
  const theme = normalizeTheme(nextTheme) || "dark";
  currentTheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch {
    // ignore
  }
  setSearchParam("theme", theme);
  try {
    document.documentElement.dataset.theme = theme;
  } catch {
    // ignore
  }
  broadcastWorkbenchTheme();
}

function detectInitialLang() {
  const qLang = normalizeLang(getSearchParam("lang"));
  if (qLang) return qLang;
  try {
    const saved = normalizeLang(window.localStorage.getItem(STORAGE_KEYS.lang));
    if (saved) return saved;
  } catch {
    // ignore
  }
  try {
    const nav = normalizeLang(navigator.language);
    if (nav) return nav;
  } catch {
    // ignore
  }
  return "en";
}

function detectInitialTheme() {
  const qTheme = normalizeTheme(getSearchParam("theme"));
  if (qTheme) return qTheme;
  try {
    const saved = normalizeTheme(window.localStorage.getItem(STORAGE_KEYS.theme));
    if (saved) return saved;
  } catch {
    // ignore
  }
  try {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    // ignore
  }
  return "dark";
}

function renderStaticCopy() {
  const logo = q(".logo");
  if (logo) logo.textContent = t("logo");

  const run = q("#runButton");
  if (run) run.textContent = t("run");

  const llm = q("#llmToggle");
  if (llm) llm.textContent = llmEnabled ? t("llmOn") : t("llmOff");

  setStatus(statusKey);

  const promptInput = q("#promptInput");
  if (promptInput) promptInput.placeholder = t("promptPlaceholder");

  const titles = document.querySelectorAll("#dashboardMap .panel-title");
  if (titles?.length >= 2) {
    titles[0].textContent = t("analysisLog");
    titles[1].textContent = t("topInsights");
  }

  const rankingsTitle = q("#dashboardMap .section-title");
  if (rankingsTitle) rankingsTitle.textContent = t("rankingsTitle");

  const openRankingsBtn = q("#openRankingsBtn");
  if (openRankingsBtn) openRankingsBtn.textContent = tx("查看全部", "Browse");

  const ths = document.querySelectorAll("#dashboardMap .rankings-table thead th .th-label");
  if (ths?.length >= 5) {
    ths[0].textContent = t("tableHeadRank");
    ths[1].textContent = t("tableHeadFirm");
    ths[2].textContent = t("tableHeadWin");
    ths[3].textContent = t("tableHeadScore");
    ths[4].textContent = t("tableHeadCases");
  }

  const evidenceOpen = q("#evidenceOpenWorkbench");
  if (evidenceOpen) evidenceOpen.textContent = t("openWorkbench");
  const evidenceClose = q("#evidenceClose");
  if (evidenceClose) evidenceClose.textContent = tx("关闭", "Close");

  const h1 = q("#card1 .neural-header");
  if (h1) h1.textContent = t("neuralDbHeader");
  const h2 = q("#card2 .neural-header");
  if (h2) h2.textContent = t("neuralVerifyHeader");
  const h3 = q("#card3 .neural-header");
  if (h3) h3.textContent = t("neuralSynthHeader");
  const h4 = q("#card4 .neural-header");
  if (h4) h4.textContent = t("neuralHandoffHeader");

  const trigger = q("#workbenchTrigger");
  if (trigger) trigger.textContent = t("workbench");

  const wbTitle = q("#workbenchPanel .workbench-title");
  if (wbTitle) {
    const icon = wbTitle.querySelector(".workbench-title-icon");
    const iconClone = icon ? icon.cloneNode(true) : null;
    wbTitle.textContent = "";
    if (iconClone) wbTitle.appendChild(iconClone);
    wbTitle.appendChild(document.createTextNode(` ${t("workbench")}`));
  }

  const langBtns = document.querySelectorAll("#langToggle button[data-lang]");
  if (langBtns?.length) {
    langBtns.forEach((btn) => {
      const v = normalizeLang(btn.getAttribute("data-lang"));
      btn.classList.toggle("active", v === currentLang);
    });
  }

  const themeBtns = document.querySelectorAll("#themeToggle button[data-theme]");
  if (themeBtns?.length) {
    themeBtns.forEach((btn) => {
      const v = normalizeTheme(btn.getAttribute("data-theme"));
      btn.classList.toggle("active", v === currentTheme);
    });
  }

  updateWorkbenchUI();

  // Update dynamically created J2 data widgets titles
  const j2DataStatsTitle = q("#j2DataStatsTitle");
  if (j2DataStatsTitle) j2DataStatsTitle.textContent = tx("◢ 数据统计", "◢ Data Stats");

  const j2TopRivalriesTitle = q("#j2TopRivalriesTitle");
  if (j2TopRivalriesTitle) j2TopRivalriesTitle.textContent = tx("◢ 头部对抗", "◢ Top Rivalries");

  const j2TopFirmsTitle = q("#j2TopFirmsTitle");
  if (j2TopFirmsTitle) j2TopFirmsTitle.textContent = tx("◢ 头部律所（mini）", "◢ Top Firms (mini)");

  // Update search input placeholder
  const rivalrySearch = q("#rivalrySearch");
  if (rivalrySearch) rivalrySearch.placeholder = tx("搜索律所（匹配原告/被告）…", "Search firms (plaintiff/defendant)…");

  // Update case type filter default option
  const caseTypeFilter = q("#caseTypeFilter");
  if (caseTypeFilter && caseTypeFilter.options?.length > 0) {
    caseTypeFilter.options[0].textContent = tx("全部案件类型（按权重聚合）", "All case types (weight-aggregated)");
  }

  const openAll = q("#openInteractionsBtn");
  if (openAll) {
    const n = Array.isArray(interactionsState?.rows) ? interactionsState.rows.length : null;
    openAll.textContent =
      n && n > 0 ? tx(`查看全部交互（${n.toLocaleString()} 行）`, `Browse all interactions (${n.toLocaleString()} rows)`) : tx("查看全部交互（14k+）", "Browse all interactions (14k+)");
  }

  if (interactionsReady && interactionsState?.stats) {
    renderJ2Stats(interactionsState.stats);
    renderCaseTypeOptions(interactionsState.stats);
    // Re-render rivalries with current language
    renderTopRivalries({
      rows: interactionsState.rows,
      stats: interactionsState.stats,
      caseType: q("#caseTypeFilter")?.value ?? "",
      query: q("#rivalrySearch")?.value ?? "",
    });
  }

  // Re-populate insights with localized summaries
  if (kbState?.insights) {
    populateInsights(kbState.insights);
  }

  applyJ2DataWidgetsTheme();
}

function cmpMaybeNumber(a, b, dir = "asc") {
  const na = typeof a === "number" && Number.isFinite(a) ? a : undefined;
  const nb = typeof b === "number" && Number.isFinite(b) ? b : undefined;
  // Always push missing to bottom for both directions.
  if (na === undefined && nb === undefined) return 0;
  if (na === undefined) return 1;
  if (nb === undefined) return -1;
  return dir === "desc" ? nb - na : na - nb;
}

function renderRankingsSnapshot() {
  const tbody = q("#rankingsTableBody");
  if (!tbody) return;
  const rows = Array.isArray(j2RankingsRows) ? j2RankingsRows : [];
  const { key, dir } = rankingsSort || { key: "rank", dir: "asc" };
  const dirNorm = dir === "desc" ? "desc" : "asc";

  const tieBreak = (a, b) => {
    const r = cmpMaybeNumber(a.rank, b.rank, "asc");
    if (r) return r;
    const fa = String(a.firm ?? "");
    const fb = String(b.firm ?? "");
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    return fa.localeCompare(fb);
  };

  const sorted = [...rows].sort((a, b) => {
    if (key === "firm") {
      const fa = String(a.firm ?? "");
      const fb = String(b.firm ?? "");
      if (!fa && !fb) return 0;
      if (!fa) return 1;
      if (!fb) return -1;
      const c = dirNorm === "desc" ? fb.localeCompare(fa) : fa.localeCompare(fb);
      return c || tieBreak(a, b);
    }
    if (key === "winRate") {
      const c = cmpMaybeNumber(pctInt(a.winRate, { estimated: !!a.winRateEstimated }), pctInt(b.winRate, { estimated: !!b.winRateEstimated }), dirNorm);
      return c || tieBreak(a, b);
    }
    if (key === "score") {
      const c = cmpMaybeNumber(a.score, b.score, dirNorm);
      return c || tieBreak(a, b);
    }
    if (key === "cases") {
      const c = cmpMaybeNumber(a.cases, b.cases, dirNorm);
      return c || tieBreak(a, b);
    }
    const c = cmpMaybeNumber(a.rank, b.rank, dirNorm);
    return c || tieBreak(a, b);
  });

  tbody.innerHTML = "";
	  sorted.forEach((r) => {
	    const row = document.createElement("tr");
	    const globalHint = Number.isFinite(r.globalRank) ? ` title="${safeAttr(`Global rank #${r.globalRank}`)}"` : "";
	    const p = typeof r.winRate === "number" ? r.winRate : undefined;
    const winText = fmtPct(p, { estimated: !!r.winRateEstimated });
    const winPrefix = r.winRateEstimated && winText !== "—" ? "~" : "";
	    const winHint = r.winRateEstimated ? ` title="${safeAttr(tx("按分数估算（规则引擎）", "Estimated from score (rule-based)"))}"` : "";
	    const casesHint =
	      r.casesSource === "interactions"
	        ? tx("Cases=交互数据中的唯一 CaseId（更接近全量）。", "Cases=unique CaseIds in interactions (closer to full).")
	        : r.casesSource === "profiles"
	          ? tx("Cases=firm profile 快照（可能偏小）。", "Cases=firm profile snapshot (may be smaller).")
	          : "";
	    const casesAttr = casesHint ? ` title="${safeAttr(casesHint)}"` : "";
	    row.innerHTML = `
	      <td><span class="rank-badge"${globalHint}>${Number(r.rank) || "—"}</span></td>
	      <td class="firm-cell">${r.firm}</td>
	      <td><span class="win-rate"${winHint}>${winPrefix}${winText}</span></td>
	      <td>${fmtNum(r.score)}</td>
	      <td><span class="cases"${casesAttr}>${fmtNum(r.cases)}</span></td>
	    `;
	    row.addEventListener("click", () => {
	      document.querySelectorAll(".rankings-table tbody tr").forEach((x) => x.classList.remove("selected"));
	      row.classList.add("selected");
	      if (r.profile) updateFirmDetail(r.profile);
      else openWorkbench({ action: "openFirm", firm: r.firmKey || normalizeLabel(r.firm), preset: "top100" });
    });
    tbody.appendChild(row);
  });

  // Update arrows
  document.querySelectorAll("#dashboardMap .rankings-table thead th[data-sort]").forEach((th) => {
    const k = String(th.getAttribute("data-sort") || "");
    const arrow = th.querySelector(".sort-arrow");
    th.classList.toggle("sorted", k === key);
    if (!arrow) return;
    if (k !== key) arrow.textContent = "";
    else arrow.textContent = dir === "desc" ? "▼" : "▲";
  });
}

function setStatus(nextKey) {
  statusKey = String(nextKey || "").trim() || "statusReady";
  const el = q("#statusText");
  if (el) el.textContent = t(statusKey);
}

function setStatusText(text) {
  const el = q("#statusText");
  if (el) el.textContent = String(text ?? "");
}

function $id(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function clampText(s, max = 140) {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function hashSeed(s) {
  const str = String(s ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededPick(arr, seed) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const idx = seed % arr.length;
  return arr[idx];
}

function initials(name) {
  const s = String(name ?? "").trim();
  const parts = s
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  const out = parts.map((p) => p[0]?.toUpperCase?.() ?? "").join("");
  return out || "LF";
}

function computeOverallWinRate(profile) {
  const roles = profile?.roles;
  if (!roles || typeof roles !== "object") return undefined;
  let wins = 0;
  let total = 0;
  for (const k of Object.keys(roles)) {
    const r = roles[k];
    const n = Number(r?.cases);
    const winRate = Number(r?.winRate);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!Number.isFinite(winRate)) continue;
    total += n;
    wins += n * winRate;
  }
  if (!total) return undefined;
  const p = wins / total;
  if (!Number.isFinite(p)) return undefined;
  return p;
}

// Convert AHPI score to a win probability [0,1] using sigmoid.
function scoreToWinProb(ahpiScore) {
  const score = Number(ahpiScore);
  if (!Number.isFinite(score)) return undefined;
  const probability = 1 / (1 + Math.exp(-score * 0.8));
  if (!Number.isFinite(probability)) return undefined;
  return probability;
}

function pctInt(p, { estimated = false } = {}) {
  if (p === undefined) return undefined;
  const n = Number(p);
  if (!Number.isFinite(n)) return undefined;
  let v = Math.round(n * 100);
  if (estimated) v = Math.min(99, v);
  v = Math.max(0, Math.min(100, v));
  return v;
}

function fmtPct(p, { estimated = false } = {}) {
  const v = pctInt(p, { estimated });
  return typeof v === "number" ? `${v}%` : "—";
}

function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function normalizeQuery(q) {
  return normalizeLabel(String(q ?? ""));
}

function parseVs(q) {
  const raw = String(q ?? "");
  const s = raw.toLowerCase();
  const separators = [" vs ", " v. ", " versus ", " 对 ", " 与 ", " and "];
  for (const sep of separators) {
    const idx = s.indexOf(sep);
    if (idx >= 0) {
      const a = raw.slice(0, idx).trim();
      const b = raw.slice(idx + sep.length).trim();
      if (a && b) return [a, b];
    }
  }
  return null;
}

function bestFirmMatch(qNorm, firms) {
  if (!qNorm) return null;
  const exact = firms.find((f) => normalizeQuery(f) === qNorm);
  if (exact) return exact;
  const contains = firms.find((f) => normalizeQuery(f).includes(qNorm) || qNorm.includes(normalizeQuery(f)));
  if (contains) return contains;
  return null;
}

function pickPrimaryInsight({ insights, q, firms }) {
  const qNorm = normalizeQuery(q);
  const vs = parseVs(q);

  const rivalry = insights.filter((x) => x?.kind === "rivalry");
  const defendant = insights.find((x) => x?.kind === "defendant_advantage") ?? null;
  const caseType = insights.find((x) => x?.kind === "case_type_bias") ?? null;

  if (vs) {
    const a = bestFirmMatch(normalizeQuery(vs[0]), firms);
    const b = bestFirmMatch(normalizeQuery(vs[1]), firms);
    if (a && b) {
      const hit = rivalry.find((r) => Array.isArray(r?.firms) && r.firms.length === 2 && r.firms.includes(a) && r.firms.includes(b));
      if (hit) return { mode: "insight", insight: hit, firms: [a, b] };
      return { mode: "compare", firms: [a, b] };
    }
  }

  const singleFirm = bestFirmMatch(qNorm, firms);
  if (singleFirm) return { mode: "firm", firm: singleFirm };

  if (/defendant|被告/i.test(String(q ?? "")) && defendant) return { mode: "insight", insight: defendant };
  if (/case|type|案件|类型/i.test(String(q ?? "")) && caseType) return { mode: "insight", insight: caseType };

  const seed = hashSeed(qNorm || "default");
  const fallback = seededPick(rivalry, seed) || defendant || caseType || (insights[0] ?? null);
  return { mode: "insight", insight: fallback };
}

// ===== Animation Utilities =====

function animateNumber(el, target, duration = 1500) {
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * eased);
    el.textContent = current + '%';
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

function typeWriter(el, text, speed = 50) {
  return new Promise((resolve) => {
    let i = 0;
    el.textContent = '';
    function type() {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
        setTimeout(type, speed);
      } else {
        resolve();
      }
    }
    type();
  });
}

function startTypewriter(el, text, { durationMs = 1500, minSpeedMs = 12 } = {}) {
  const full = String(text ?? "");
  const speed = Math.max(minSpeedMs, Math.floor(durationMs / Math.max(1, full.length)));
  let done = false;
  let finishNow;
  const promise = new Promise((resolve) => {
    finishNow = () => {
      if (done) return;
      done = true;
      el.textContent = full;
      resolve();
    };
    typeWriter(el, full, speed).then(() => finishNow());
  });
  return { promise, finish: finishNow };
}

function animateNeuralSteps(container, steps, progressBar, delayBetween = 500) {
  return new Promise((resolve) => {
    container.innerHTML = '';
    let completed = 0;
    steps.forEach((step, i) => {
      setTimeout(() => {
        const div = document.createElement('div');
        div.className = 'neural-step';
        div.style.animationDelay = `${i * 0.05}s`;
        div.textContent = step;
        container.appendChild(div);
        completed++;
        if (progressBar) {
          progressBar.style.width = `${(completed / steps.length) * 100}%`;
        }
        if (completed === steps.length) {
          setTimeout(resolve, 300);
        }
      }, i * delayBetween);
    });
  });
}

function openModal(id) {
  const el = $id(id);
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const el = $id(id);
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
}

function safeText(s) {
  return String(s ?? "").replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
}

function safeAttr(s) {
  return safeText(s).replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function setBusy(busy) {
  const deck = $id("commandDeck");
  const run = $id("runButton");
  deck.classList.toggle("processing", !!busy);
  run.disabled = !!busy;
  if (busy) setStatus("statusProcessing");
}

let introLayoutSync = null;

function createIntroLayoutSync() {
  const deck = $id("commandDeck");
  if (!deck) return { update: () => {}, sync: () => {}, destroy: () => {} };

  let raf = 0;
  const sync = () => {
    const rect = deck.getBoundingClientRect();
    const gap = window.matchMedia?.("(max-width: 980px)")?.matches ? 10 : 14;
    const px = Math.max(120, Math.ceil(rect.bottom + gap));
    document.documentElement.style.setProperty("--intro-top-offset", `${px}px`);
  };
  const update = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      sync();
    });
  };

  let ro = null;
  if (typeof window.ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => update());
    ro.observe(deck);
  }
  window.addEventListener("resize", update, { passive: true });
  if (document?.fonts?.ready) document.fonts.ready.then(update).catch(() => {});

  sync();

  const destroy = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    try {
      ro?.disconnect?.();
    } catch {
      // ignore
    }
    window.removeEventListener("resize", update);
  };

  return { update, sync, destroy };
}

let kbState = null;
let interactionsState = null;
let interactionsReady = false;
let interactionsPromise = null;
let kbPromise = null;
let animationComplete = false;
let interactionsIndex = null;
let rankingsIndex = null;
let firmCaseIndex = null; // firmKey -> {cases, rows}

const interactionsUi = {
  query: "",
  caseType: "",
  court: "",
  page: 1,
  pageSize: 50,
};

const rankingsUi = {
  query: "",
  page: 1,
  pageSize: 50,
};

function buildInteractionsIndex(rows) {
  const hay = [];
  const caseTypes = new Map();
  const courts = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const p = normalizeLabel(r?.PlaintiffFirm);
    const d = normalizeLabel(r?.DefendantFirm);
    const ct = normalizeLabel(r?.CaseType);
    const c = normalizeLabel(r?.Court);
    const y = num(r?.Year);
    const cid = num(r?.CaseId);
    if (ct) caseTypes.set(ct, (caseTypes.get(ct) || 0) + 1);
    if (c) courts.set(c, (courts.get(c) || 0) + 1);
    const s = `${p}\t${d}\t${ct}\t${c}\t${Number.isFinite(y) ? y : ""}\t${Number.isFinite(cid) ? cid : ""}`.toLowerCase();
    hay.push(s);
  }
  const sortByCount = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { hay, caseTypes: sortByCount(caseTypes), courts: sortByCount(courts) };
}

function buildRankingsIndex(rankings) {
  const hay = [];
  for (const r of Array.isArray(rankings) ? rankings : []) {
    const firm = normalizeLabel(r?.firm);
    const rank = num(r?.rank);
    const score = num(r?.score);
    const exp = num(r?.expScore);
    const s = `${firm}\t${Number.isFinite(rank) ? rank : ""}\t${Number.isFinite(score) ? score : ""}\t${Number.isFinite(exp) ? exp : ""}`.toLowerCase();
    hay.push(s);
  }
  return { hay };
}

function filterInteractionIndices() {
  const rows = interactionsState?.rows;
  if (!Array.isArray(rows) || !interactionsIndex) return [];
  const qText = String(interactionsUi.query ?? "").trim().toLowerCase();
  const ct = String(interactionsUi.caseType ?? "").trim();
  const court = String(interactionsUi.court ?? "").trim();
  const out = [];

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (ct && normalizeLabel(r?.CaseType) !== ct) continue;
    if (court && normalizeLabel(r?.Court) !== court) continue;
    if (qText && !interactionsIndex.hay[i]?.includes(qText)) continue;
    out.push(i);
  }

  // stable-ish ordering: weight desc, then original index asc
  out.sort((ai, bi) => {
    const a = rows[ai];
    const b = rows[bi];
    const wa = num(a?.Weight) ?? 0;
    const wb = num(b?.Weight) ?? 0;
    if (wb !== wa) return wb - wa;
    return ai - bi;
  });
  return out;
}

function renderInteractionsModal() {
  const tbody = q("#interactionsTableBody");
  const pageInfo = q("#interactionsPageInfo");
  if (!tbody || !pageInfo) return;
  const rows = interactionsState?.rows;
  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="color: var(--text-secondary); padding: 12px;">${safeText(tx("暂无数据", "No data"))}</td></tr>`;
    pageInfo.textContent = "—";
    return;
  }

  const idx = filterInteractionIndices();
  const total = idx.length;
  const pageSize = Math.max(1, Math.min(500, Number(interactionsUi.pageSize) || 50));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(pages, Number(interactionsUi.page) || 1));
  interactionsUi.page = page;

  const start = (page - 1) * pageSize;
  const end = Math.min(total, start + pageSize);
  pageInfo.textContent = `${start + 1}-${end} / ${total.toLocaleString()} (p ${page}/${pages})`;

  const view = idx.slice(start, end).map((i) => rows[i]);
  const cells = [];
  for (const r of view) {
    const p = normalizeLabel(r?.PlaintiffFirm);
    const d = normalizeLabel(r?.DefendantFirm);
    const ct = normalizeLabel(r?.CaseType) || "NA";
    const court = normalizeLabel(r?.Court) || "NA";
    const year = num(r?.Year);
    const w = num(r?.Weight);
    const cid = num(r?.CaseId);
    const ev = Number.isFinite(cid) ? ` data-caseid="${cid}"` : "";
    cells.push(`<tr class="interactions-row"${ev}>
      <td>${safeText(p)}</td>
      <td>${safeText(d)}</td>
      <td>${safeText(ct)}</td>
      <td>${safeText(court)}</td>
      <td>${safeText(Number.isFinite(year) ? String(year) : "—")}</td>
      <td style="text-align:right;">${safeText(Number.isFinite(w) ? w.toFixed(3) : "—")}</td>
      <td style="text-align:right;">${safeText(Number.isFinite(cid) ? String(cid) : "—")}</td>
    </tr>`);
  }
  tbody.innerHTML = cells.join("") || `<tr><td colspan="7" style="color: var(--text-secondary); padding: 12px;">${safeText(tx("无匹配结果", "No matches"))}</td></tr>`;

  // Row click: open evidence modal for caseId (if available)
  tbody.querySelectorAll("tr.interactions-row[data-caseid]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const cid = Number(tr.getAttribute("data-caseid"));
      if (!Number.isFinite(cid)) return;
      showEvidenceFromCaseIds({
        title: `CaseId ${cid}`,
        caseIds: [cid],
        filterPatch: {},
        preset: "top100",
      });
    });
  });
}

function filterRankingsIndices() {
  const rows = kbState?.rankings;
  if (!Array.isArray(rows) || !rankingsIndex) return [];
  const qText = String(rankingsUi.query ?? "").trim().toLowerCase();
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (qText && !rankingsIndex.hay[i]?.includes(qText)) continue;
    out.push(i);
  }
  out.sort((ai, bi) => {
    const a = rows[ai];
    const b = rows[bi];
    const ra = num(a?.rank) ?? Infinity;
    const rb = num(b?.rank) ?? Infinity;
    if (ra !== rb) return ra - rb;
    const fa = String(a?.firm ?? "");
    const fb = String(b?.firm ?? "");
    return fa.localeCompare(fb);
  });
  return out;
}

function renderRankingsModal() {
  const tbody = q("#rankingsTableBodyModal");
  const pageInfo = q("#rankingsPageInfo");
  if (!tbody || !pageInfo) return;
  const rows = kbState?.rankings;
  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="color: var(--text-secondary); padding: 12px;">${safeText(tx("暂无数据", "No data"))}</td></tr>`;
    pageInfo.textContent = "—";
    return;
  }

  if (!rankingsIndex) rankingsIndex = buildRankingsIndex(rows);
  const idx = filterRankingsIndices();
  const total = idx.length;
  const pageSize = Math.max(1, Math.min(500, Number(rankingsUi.pageSize) || 50));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(pages, Number(rankingsUi.page) || 1));
  rankingsUi.page = page;

  const start = (page - 1) * pageSize;
  const end = Math.min(total, start + pageSize);
  pageInfo.textContent = `${start + 1}-${end} / ${total.toLocaleString()} (p ${page}/${pages})`;

  const view = idx.slice(start, end).map((i) => rows[i]);
  const cells = [];
  for (const r of view) {
    const firm = normalizeLabel(r?.firm);
    const rank = num(r?.rank);
    const score = num(r?.score);
    const exp = num(r?.expScore);
    cells.push(`<tr class="interactions-row" data-firm="${safeAttr(firm)}">
      <td>${safeText(Number.isFinite(rank) ? String(rank) : "—")}</td>
      <td>${safeText(firm)}</td>
      <td style="text-align:right;">${safeText(Number.isFinite(score) ? score.toFixed(3) : "—")}</td>
      <td style="text-align:right;">${safeText(Number.isFinite(exp) ? exp.toFixed(3) : "—")}</td>
    </tr>`);
  }
  tbody.innerHTML = cells.join("") || `<tr><td colspan="4" style="color: var(--text-secondary); padding: 12px;">${safeText(tx("无匹配结果", "No matches"))}</td></tr>`;

  tbody.querySelectorAll("tr.interactions-row[data-firm]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const firm = String(tr.getAttribute("data-firm") || "").trim();
      if (!firm) return;
      openWorkbench({ action: "openFirm", firm, preset: "top100" });
    });
  });
}

async function openRankingsModal() {
  try {
    await startKbLazyLoad();
    if (!kbState?.rankings) throw new Error("KB rankings not ready");
    if (!rankingsIndex) rankingsIndex = buildRankingsIndex(kbState.rankings);

    const title = q("#rankingsTitleModal");
    if (title) {
      const n = Array.isArray(kbState?.rankings) ? kbState.rankings.length : 0;
      title.textContent = tx(`排名（${n.toLocaleString()} 行）`, `Rankings (${n.toLocaleString()} rows)`);
    }

    const search = q("#rankingsSearch");
    if (search) search.value = String(rankingsUi.query ?? "");

    renderRankingsModal();
    openModal("rankingsModal");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    alert(tx(`加载排名失败：${msg}`, `Failed to load rankings: ${msg}`));
  }
}

function populateInteractionsFilters() {
  const ctSel = q("#interactionsCaseType");
  const courtSel = q("#interactionsCourt");
  if (ctSel) {
    const opts = [`<option value="">${safeText(tx("全部", "All"))}</option>`].concat(
      (interactionsIndex?.caseTypes ?? []).map((k) => `<option value="${safeAttr(k)}">${safeText(k)}</option>`),
    );
    ctSel.innerHTML = opts.join("");
    ctSel.value = interactionsUi.caseType || "";
  }
  if (courtSel) {
    const opts = [`<option value="">${safeText(tx("全部", "All"))}</option>`].concat(
      (interactionsIndex?.courts ?? []).map((k) => `<option value="${safeAttr(k)}">${safeText(k)}</option>`),
    );
    courtSel.innerHTML = opts.join("");
    courtSel.value = interactionsUi.court || "";
  }
}

async function openInteractionsModal() {
  try {
    await startInteractionsLazyLoad();
    if (!interactionsIndex && interactionsState?.rows) interactionsIndex = buildInteractionsIndex(interactionsState.rows);
    const title = q("#interactionsTitle");
    if (title) {
      const n = Array.isArray(interactionsState?.rows) ? interactionsState.rows.length : 0;
      title.textContent = tx(`交互数据（${n.toLocaleString()} 行）`, `Interactions (${n.toLocaleString()} rows)`);
    }
    const search = q("#interactionsSearch");
    if (search) search.value = String(interactionsUi.query ?? "");
    populateInteractionsFilters();
    renderInteractionsModal();
    openModal("interactionsModal");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    alert(tx(`加载交互数据失败：${msg}`, `Failed to load interactions: ${msg}`));
  }
}


async function loadKb() {
  const [insightsRes, profilesRes, rankingsRes, casesRes] = await Promise.all([
    fetch(KB.insights),
    fetch(KB.profiles),
    fetch(KB.rankings),
    fetch(KB.cases),
  ]);
  if (!insightsRes.ok) throw new Error(`Missing KB: ${KB.insights}`);
  if (!profilesRes.ok) throw new Error(`Missing KB: ${KB.profiles}`);
  if (!rankingsRes.ok) throw new Error(`Missing KB: ${KB.rankings}`);
  if (!casesRes.ok) throw new Error(`Missing KB: ${KB.cases}`);
  const insightsJson = await insightsRes.json();
  const profilesJson = await profilesRes.json();
  const rankingsRows = parseDelimitedText(await rankingsRes.text()) ?? [];
  const casesRows = parseDelimitedText(await casesRes.text()) ?? [];

  const insights = Array.isArray(insightsJson?.insights) ? insightsJson.insights : [];
  const profiles = Array.isArray(profilesJson?.profiles) ? profilesJson.profiles : [];
  const firms = profiles.map((p) => String(p?.firm ?? "").trim()).filter(Boolean);

  const casesById = new Map();
  for (const r of casesRows) {
    const id = Number(r?.CaseId);
    if (!Number.isFinite(id)) continue;
    if (!casesById.has(id)) casesById.set(id, r);
  }

  const rankings = rankingsRows
    .map((r) => {
      const firm = normalizeLabel(r?.Firm);
      const rank = Number(r?.Rank);
      const score = Number(r?.Score);
      const expScore = Number(r?.ExpScore);
      if (!firm) return null;
      return {
        firm,
        rank: Number.isFinite(rank) ? rank : undefined,
        score: Number.isFinite(score) ? score : undefined,
        expScore: Number.isFinite(expScore) ? expScore : undefined,
      };
    })
    .filter(Boolean);

  return {
    source: profilesJson?.source ?? null,
    insights,
    profiles,
    firms,
    casesById,
    rankings,
  };
}

function startKbLazyLoad() {
  if (kbPromise) return kbPromise;
  kbPromise = (async () => {
    const s = await loadKb();
    kbState = s;
    populateInsights(kbState.insights);
    populateTable({ profiles: kbState.profiles, rankings: kbState.rankings });
    return s;
  })();
  return kbPromise;
}

function num(v) {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pushLimited(arr, v, limit = 30) {
  if (!Array.isArray(arr)) return;
  if (arr.length >= limit) return;
  arr.push(v);
}

async function loadInteractionsCsv() {
  const res = await fetch(INTERACTIONS.full);
  if (!res.ok) throw new Error(`Missing KB: ${INTERACTIONS.full}`);
  const rows = parseDelimitedText(await res.text()) ?? [];
  return rows;
}

function buildFirmCaseIndex(rows) {
  const acc = new Map(); // firmKey -> {caseIds:Set<string>, rows:number}
  const touch = (firmLabel, caseId) => {
    const firmKey = normalizeLabel(firmLabel);
    if (!firmKey) return;
    const id = String(caseId ?? "").trim();
    if (!id) return;
    const prev = acc.get(firmKey);
    if (!prev) acc.set(firmKey, { caseIds: new Set([id]), rows: 1 });
    else {
      prev.caseIds.add(id);
      prev.rows += 1;
    }
  };

  for (const r of Array.isArray(rows) ? rows : []) {
    const caseId = r?.CaseId;
    touch(r?.PlaintiffFirm, caseId);
    touch(r?.DefendantFirm, caseId);
  }

  const out = new Map();
  for (const [k, v] of acc.entries()) out.set(k, { cases: v.caseIds.size, rows: v.rows });
  return out;
}

function applyFirmCasesToRankingsRows() {
  if (!firmCaseIndex || !Array.isArray(j2RankingsRows) || j2RankingsRows.length === 0) return;
  let changed = false;
  j2RankingsRows = j2RankingsRows.map((r) => {
    const firmKey = String(r?.firmKey ?? "").trim();
    if (!firmKey) return r;
    const c = firmCaseIndex.get(firmKey)?.cases;
    if (!Number.isFinite(c)) return r;
    if (r.cases === c && r.casesSource === "interactions") return r;
    changed = true;
    return { ...r, cases: c, casesSource: "interactions" };
  });
  if (changed) renderRankingsSnapshot();
}

function computeInteractionsStats(rows) {
  const firms = new Set();
  const plaintiffs = new Set();
  const defendants = new Set();
  const caseTypes = new Map(); // CaseType -> {count, weight}
  const courts = new Map(); // Court -> {count, weight}
  const years = new Map(); // Year -> count
  const rivalry = new Map(); // key p\t d -> {p,d,count,weight,caseIds:[]}
  const node = new Map(); // firm -> {inW,outW,inC,outC}

  const bump = (m, k, w) => {
    const key = String(k ?? "").trim();
    if (!key) return;
    const prev = m.get(key) || { count: 0, weight: 0 };
    prev.count += 1;
    prev.weight += w;
    m.set(key, prev);
  };

  const ensureNode = (name) => {
    const k = String(name ?? "").trim();
    if (!k) return null;
    const prev = node.get(k);
    if (prev) return prev;
    const next = { inW: 0, outW: 0, inC: 0, outC: 0 };
    node.set(k, next);
    return next;
  };

  for (const r of rows) {
    const p = normalizeLabel(r?.PlaintiffFirm);
    const d = normalizeLabel(r?.DefendantFirm);
    if (!p || !d) continue;

    firms.add(p);
    firms.add(d);
    plaintiffs.add(p);
    defendants.add(d);

    const w = num(r?.Weight) ?? 1;
    const ct = normalizeLabel(r?.CaseType);
    const court = normalizeLabel(r?.Court);
    const year = num(r?.Year);

    bump(caseTypes, ct || "NA", w);
    bump(courts, court || "NA", w);
    if (Number.isFinite(year)) years.set(String(year), (years.get(String(year)) || 0) + 1);

    const pk = `${p}\t${d}`;
    const prev = rivalry.get(pk) || { p, d, count: 0, weight: 0, caseIds: [] };
    prev.count += 1;
    prev.weight += w;
    const cid = num(r?.CaseId);
    if (Number.isFinite(cid)) pushLimited(prev.caseIds, cid, J2_LIMITS.caseIdsPerPair);
    rivalry.set(pk, prev);

    const pn = ensureNode(p);
    const dn = ensureNode(d);
    if (pn) {
      pn.outW += w;
      pn.outC += 1;
    }
    if (dn) {
      dn.inW += w;
      dn.inC += 1;
    }
  }

  const topRivalries = [...rivalry.values()].sort((a, b) => b.weight - a.weight).slice(0, J2_LIMITS.topN);
  const topCaseTypes = [...caseTypes.entries()]
    .sort((a, b) => (b[1]?.weight ?? 0) - (a[1]?.weight ?? 0))
    .slice(0, J2_LIMITS.topCaseTypes);
  const topCourts = [...courts.entries()].sort((a, b) => (b[1]?.weight ?? 0) - (a[1]?.weight ?? 0)).slice(0, J2_LIMITS.topCourts);
  const topNodes = [...node.entries()]
    .map(([firm, v]) => ({ firm, ...v, totalW: (v?.inW ?? 0) + (v?.outW ?? 0) }))
    .sort((a, b) => b.totalW - a.totalW)
    .slice(0, J2_LIMITS.topNodes);

  return {
    rows: rows.length,
    firms: firms.size,
    plaintiffs: plaintiffs.size,
    defendants: defendants.size,
    topRivalries,
    topCaseTypes,
    topCourts,
    topNodes,
    years,
  };
}

function ensureJ2DataWidgets() {
  const left = q("#dashboardMap .left-panel");
  if (!left) return null;
  const existing = q("#j2DataWidgets");
  if (existing) return existing;

  const wrap = document.createElement("div");
  wrap.id = "j2DataWidgets";
  wrap.style.marginTop = "16px";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.id = "j2DataStatsTitle";
  title.textContent = tx("◢ 数据统计", "◢ Data Stats");
  wrap.appendChild(title);

  const stats = document.createElement("div");
  stats.id = "j2DataStats";
  stats.style.display = "grid";
  stats.style.gap = "8px";
  stats.style.marginTop = "10px";
  stats.style.fontSize = "12px";
  wrap.appendChild(stats);

  const openAll = document.createElement("button");
  openAll.type = "button";
  openAll.id = "openInteractionsBtn";
  openAll.textContent = tx("查看全部交互（14k+）", "Browse all interactions (14k+)");
  openAll.style.cssText =
    currentTheme === "light"
      ? "width:100%;margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(8,145,178,0.28);background:rgba(8,145,178,0.08);color:rgba(15,23,42,0.92);font-weight:900;cursor:pointer;"
      : "width:100%;margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,212,255,0.28);background:rgba(0,212,255,0.10);color:#e5e7eb;font-weight:900;cursor:pointer;";
  openAll.addEventListener("click", () => openInteractionsModal());
  wrap.appendChild(openAll);

  const controls = document.createElement("div");
  controls.style.display = "grid";
  controls.style.gap = "8px";
  controls.style.marginTop = "12px";

  const input = document.createElement("input");
  input.id = "rivalrySearch";
  input.placeholder = tx("搜索律所（匹配原告/被告）…", "Search firms (plaintiff/defendant)…");
  input.style.width = "100%";
  input.style.padding = "10px 12px";
  input.style.borderRadius = "12px";
  input.style.border = "1px solid rgba(255,255,255,0.10)";
  input.style.background = "rgba(0,0,0,0.28)";
  input.style.color = "rgba(229,231,235,0.92)";
  controls.appendChild(input);

  const select = document.createElement("select");
  select.id = "caseTypeFilter";
  select.style.width = "100%";
  select.style.padding = "10px 12px";
  select.style.borderRadius = "12px";
  select.style.border = "1px solid rgba(255,255,255,0.10)";
  select.style.background = "rgba(0,0,0,0.28)";
  select.style.color = "rgba(229,231,235,0.92)";
  controls.appendChild(select);

  wrap.appendChild(controls);

  const t2 = document.createElement("div");
  t2.className = "panel-title";
  t2.id = "j2TopRivalriesTitle";
  t2.style.marginTop = "14px";
  t2.textContent = tx("◢ 头部对抗", "◢ Top Rivalries");
  wrap.appendChild(t2);

  const list = document.createElement("div");
  list.id = "topRivalries";
  list.className = "insights-list";
  list.style.marginTop = "10px";
  wrap.appendChild(list);

  const t3 = document.createElement("div");
  t3.className = "panel-title";
  t3.id = "j2TopFirmsTitle";
  t3.style.marginTop = "16px";
  t3.textContent = tx("◢ 头部律所（mini）", "◢ Top Firms (mini)");
  wrap.appendChild(t3);

  const firms = document.createElement("div");
  firms.id = "topFirmsMini";
  firms.style.display = "grid";
  firms.style.gap = "8px";
  firms.style.marginTop = "10px";
  wrap.appendChild(firms);

  left.appendChild(wrap);
  applyJ2DataWidgetsTheme();
  return wrap;
}

function renderJ2Stats(stats) {
  ensureJ2DataWidgets();
  const el = q("#j2DataStats");
  if (!el || !stats) return;
  const isLight = currentTheme === "light";
  const labelColor = isLight ? "rgba(15,23,42,0.62)" : "rgba(229,231,235,0.62)";
  const valueColor = isLight ? "rgba(15,23,42,0.92)" : "rgba(229,231,235,0.92)";
  const line = (label, value) => {
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.gap = "10px";
    div.innerHTML = `<span style="color:${labelColor}">${label}</span><span style="font-weight:800;color:${valueColor}">${value}</span>`;
    return div;
  };
  el.innerHTML = "";
  el.appendChild(line(tx("交互行数", "Interactions"), (stats.rows ?? 0).toLocaleString()));
  el.appendChild(line(tx("覆盖律所", "Firms"), (stats.firms ?? 0).toLocaleString()));
  el.appendChild(line(tx("原告律所", "Plaintiffs"), (stats.plaintiffs ?? 0).toLocaleString()));
  el.appendChild(line(tx("被告律所", "Defendants"), (stats.defendants ?? 0).toLocaleString()));

  const ct = Array.isArray(stats.topCaseTypes) ? stats.topCaseTypes.slice(0, 8) : [];
  const courts = Array.isArray(stats.topCourts) ? stats.topCourts.slice(0, 6) : [];
  if (ct.length) {
    const div = document.createElement("div");
    div.style.marginTop = "2px";
    div.style.color = isLight ? "rgba(15,23,42,0.72)" : "rgba(229,231,235,0.70)";
    div.textContent = `${tx("案件类型", "Case types")}: ${ct.map(([k, v]) => `${k}(${(v?.weight ?? 0).toFixed(0)})`).join(", ")}`;
    el.appendChild(div);
  }
  if (courts.length) {
    const div = document.createElement("div");
    div.style.marginTop = "0px";
    div.style.color = isLight ? "rgba(15,23,42,0.62)" : "rgba(229,231,235,0.62)";
    div.textContent = `${tx("法院", "Courts")}: ${courts.map(([k, v]) => `${k}(${(v?.weight ?? 0).toFixed(0)})`).join(", ")}`;
    el.appendChild(div);
  }
}

function applyJ2DataWidgetsTheme() {
  const input = q("#rivalrySearch");
  const select = q("#caseTypeFilter");
  const openAll = q("#openInteractionsBtn");
  const isLight = currentTheme === "light";
  const bg = isLight ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.28)";
  const bd = isLight ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(255,255,255,0.10)";
  const fg = isLight ? "rgba(15,23,42,0.92)" : "rgba(229,231,235,0.92)";
  if (input) {
    input.style.background = bg;
    input.style.border = bd;
    input.style.color = fg;
  }
  if (select) {
    select.style.background = bg;
    select.style.border = bd;
    select.style.color = fg;
  }
  if (openAll) {
    openAll.style.cssText =
      currentTheme === "light"
        ? "width:100%;margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(8,145,178,0.28);background:rgba(8,145,178,0.08);color:rgba(15,23,42,0.92);font-weight:900;cursor:pointer;"
        : "width:100%;margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,212,255,0.28);background:rgba(0,212,255,0.10);color:#e5e7eb;font-weight:900;cursor:pointer;";
  }
}

function renderCaseTypeOptions(stats) {
  ensureJ2DataWidgets();
  const sel = q("#caseTypeFilter");
  if (!sel) return;
  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = tx("全部案件类型（按权重聚合）", "All case types (weight-aggregated)");
  sel.appendChild(opt0);

  const types = Array.isArray(stats?.topCaseTypes) ? stats.topCaseTypes : [];
  for (const [k, v] of types) {
    const opt = document.createElement("option");
    opt.value = String(k);
    opt.textContent = `${k} · w=${(v?.weight ?? 0).toFixed(1)} · n=${v?.count ?? 0}`;
    sel.appendChild(opt);
  }
}

function showEvidenceFromCaseIds({ title, caseIds, filterPatch, preset = "top100", evidencePair } = {}) {
  const list = $id("evidenceList");
  $id("evidenceTitle").textContent = String(title ?? tx("证据", "Evidence"));
  list.innerHTML = "";

  const ids = Array.isArray(caseIds) ? caseIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
  const items = ids.slice(0, J2_LIMITS.evidence);
  if (!items.length) {
    const div = document.createElement("div");
    div.className = "evidence-empty";
    div.textContent = t("evidenceEmpty");
    list.appendChild(div);
  } else {
    for (const id of items) {
      const row = kbState?.casesById?.get(id) ?? null;
      const el = document.createElement("div");
      el.className = "evidence-row";
      el.innerHTML = `<div class="evidence-id">CaseId ${id}</div>
        <div class="evidence-meta">${clampText(JSON.stringify(row ?? { CaseId: id }), 220)}</div>`;
      list.appendChild(el);
    }
  }

  const openBtn = $id("evidenceOpenWorkbench");
  openBtn.onclick = () =>
    openWorkbench({
      action: "openInsight",
      preset,
      filterPatch: filterPatch && typeof filterPatch === "object" ? filterPatch : {},
      evidenceCaseIds: ids,
      evidencePair:
        Array.isArray(evidencePair) && evidencePair.length === 2
          ? [String(evidencePair[0] ?? "").trim(), String(evidencePair[1] ?? "").trim()]
          : undefined,
      title,
    });
  openModal("evidenceModal");
}

function renderTopRivalries({ rows, stats, caseType, query }) {
  ensureJ2DataWidgets();
  const list = q("#topRivalries");
  if (!list) return;
  const qText = String(query ?? "").trim().toLowerCase();

  const filterCt = String(caseType ?? "").trim();
  const filteredRows = filterCt ? rows.filter((r) => normalizeLabel(r?.CaseType) === filterCt) : rows;
  const filteredStats = filterCt ? computeInteractionsStats(filteredRows) : stats || computeInteractionsStats(filteredRows);

  const rivalries = filteredStats.topRivalries.filter((r) => {
    if (!qText) return true;
    return String(r.p).toLowerCase().includes(qText) || String(r.d).toLowerCase().includes(qText);
  });

  list.innerHTML = "";
  if (!rivalries.length) {
    const div = document.createElement("div");
    div.className = "muted";
    div.style.fontSize = "12px";
    div.textContent = tx("无匹配结果", "No matches");
    list.appendChild(div);
    return;
  }

  rivalries.slice(0, J2_LIMITS.topN).forEach((r) => {
    const btn = document.createElement("button");
    btn.className = "insight-item";
    btn.type = "button";
    btn.innerHTML = `<div class="insight-title">${clampText(`${r.p} → ${r.d}`, 60)}</div>
      <div class="insight-sub">${tx("权重", "weight")} ${r.weight.toFixed(2)} · ${tx("样本", "n")} ${r.count}</div>`;
    btn.addEventListener("click", () => {
      const title = `${r.p} → ${r.d}`;
      const patch = {
        focusCell: r.p,
        focusMode: "outgoing",
        ...(filterCt ? { metaboliteQuery: filterCt } : {}),
      };
      showEvidenceFromCaseIds({ title, caseIds: r.caseIds, filterPatch: patch, preset: "top100" });
    });
    list.appendChild(btn);
  });

  const firmsMini = q("#topFirmsMini");
  if (firmsMini) {
    firmsMini.innerHTML = "";
    filteredStats.topNodes.slice(0, 30).forEach((n) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "insight-item";
      btn.innerHTML = `<div class="insight-title">${clampText(n.firm, 46)}</div>
        <div class="insight-sub">${tx("总权重", "total w")} ${n.totalW.toFixed(1)} · out ${n.outC} · in ${n.inC}</div>`;
      btn.addEventListener("click", () => {
        const input = q("#rivalrySearch");
        if (input) input.value = n.firm;
        renderTopRivalries({ rows, stats, caseType: filterCt, query: n.firm });
      });
      firmsMini.appendChild(btn);
    });
  }
}

function startInteractionsLazyLoad() {
  if (interactionsPromise) return interactionsPromise;
  interactionsPromise = (async () => {
    const rows = await loadInteractionsCsv();
    const stats = computeInteractionsStats(rows);
    interactionsState = { rows, stats };
    interactionsIndex = buildInteractionsIndex(rows);
    firmCaseIndex = buildFirmCaseIndex(rows);
    interactionsReady = true;
    renderJ2Stats(stats);
    renderCaseTypeOptions(stats);
    wireJ2DataControls();
    renderTopRivalries({ rows, stats, caseType: "", query: "" });
    applyFirmCasesToRankingsRows();
    return interactionsState;
  })();
  return interactionsPromise;
}

let j2DataWired = false;
function wireJ2DataControls() {
  if (j2DataWired) return;
  const input = q("#rivalrySearch");
  const select = q("#caseTypeFilter");
  if (!input || !select) return;
  j2DataWired = true;

  let timer = null;
  const rerender = () => {
    if (!interactionsState?.rows || !interactionsState?.stats) return;
    const query = String(input.value ?? "");
    const caseType = String(select.value ?? "");
    renderTopRivalries({ rows: interactionsState.rows, stats: interactionsState.stats, caseType, query });
  };
  const schedule = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(rerender, 120);
  };

  input.addEventListener("input", schedule);
  select.addEventListener("change", schedule);
}

// Generate localized summary for insights based on kind and metrics
function getInsightSummary(ins) {
  const kind = ins?.kind;
  const metrics = ins?.metrics ?? {};

  if (kind === "rivalry") {
    const weight = (metrics.weightTotal ?? 0).toFixed(2);
    const balance = (metrics.balance ?? 0).toFixed(2);
    return tx(
      `双向高频对手关系（total_weight=${weight}, balance=${balance}）。`,
      `High-frequency bidirectional rivalry (total_weight=${weight}, balance=${balance}).`
    );
  }

  if (kind === "defendant_advantage") {
    const rate = ((metrics.defendantWinRate ?? 0) * 100).toFixed(1);
    const cases = metrics.cases ?? 0;
    return tx(
      `整体上 DefendantWin 占比 ${rate}%（case-level）。`,
      `Overall defendant win rate: ${rate}% (${cases} cases).`
    );
  }

  if (kind === "case_type_bias") {
    const caseType = metrics.caseType ?? "";
    const rate = ((metrics.defendantWinRate ?? 0) * 100).toFixed(1);
    const cases = metrics.cases ?? 0;
    return tx(
      `${caseType} 的 DefendantWin 占比 ${rate}%。`,
      `${caseType}: defendant win rate ${rate}% (${cases} cases).`
    );
  }

  // Fallback to original summary
  return ins?.summary ?? "";
}

function populateInsights(insights) {
  const wrap = $id("topInsights");
  wrap.innerHTML = "";
  insights.slice(0, J2_LIMITS.topN).forEach((ins) => {
    const btn = document.createElement("button");
    btn.className = "insight-item";
    btn.type = "button";
    btn.innerHTML = `<div class="insight-title">${clampText(ins?.title ?? ins?.id ?? "Insight")}</div>
      <div class="insight-sub">${clampText(getInsightSummary(ins), 120)}</div>`;
    btn.addEventListener("click", () => showEvidence(ins));
    wrap.appendChild(btn);
  });
}

function populateTable({ profiles, rankings } = {}) {
  const tbody = $id("rankingsTableBody");
  tbody.innerHTML = "";

  const profileList = Array.isArray(profiles) ? profiles : [];
  const profileByFirm = new Map(profileList.map((p) => [normalizeLabel(p?.firm), p]));

  const rankingList = Array.isArray(rankings) ? rankings : [];
  const rankingByFirm = new Map(rankingList.map((r) => [normalizeLabel(r?.firm), r]));

  // Snapshot should be stable and fast: show Top-N from global rankings (exp_scores).
  // If we don't have a firm profile, derive an estimated win probability from the score
  // and mark it as estimated in the UI.
  const base =
    rankingList.length > 0
      ? [...rankingList].sort((a, b) => (num(a?.rank) ?? Infinity) - (num(b?.rank) ?? Infinity)).slice(0, J2_LIMITS.topN)
      : [...profileList].sort((a, b) => (num(a?.rank) ?? Infinity) - (num(b?.rank) ?? Infinity)).slice(0, J2_LIMITS.topN);

  j2RankingsRows = base.map((r, i) => {
    const isRankingRow = rankingList.length > 0;

    if (isRankingRow) {
      const firmKey = normalizeLabel(r?.firm);
      const profile = profileByFirm.get(firmKey) ?? null;
      const firmDisplay = String(profile?.firm ?? r?.firm ?? firmKey).trim();
      const score = num(r?.expScore) ?? num(r?.score) ?? num(profile?.score);
      const winRate = profile ? computeOverallWinRate(profile) : scoreToWinProb(score);
      const winRateEstimated = !profile && typeof winRate === "number";
      const profileCases = num(profile?.cases);
      const interactionCases = firmCaseIndex?.get(firmKey)?.cases;
      const cases = Number.isFinite(interactionCases) ? interactionCases : profileCases;
      const casesSource = Number.isFinite(interactionCases) ? "interactions" : Number.isFinite(profileCases) ? "profiles" : "unknown";
      const rank = num(r?.rank) ?? i + 1;
      const globalRank = num(r?.rank);
      return { firm: firmDisplay || firmKey, firmKey, profile, rank, globalRank, winRate, winRateEstimated, score, cases, casesSource };
    }

    const firmDisplay = String(r?.firm ?? "").trim();
    const firmKey = normalizeLabel(firmDisplay);
    const profile = r ?? profileByFirm.get(firmKey) ?? null;
    const rankingRow = rankingByFirm.get(firmKey) ?? null;
    const score = num(rankingRow?.expScore) ?? num(rankingRow?.score) ?? num(profile?.score);
    const winRate = profile ? computeOverallWinRate(profile) : undefined;
    const profileCases = num(profile?.cases);
    const interactionCases = firmCaseIndex?.get(firmKey)?.cases;
    const cases = Number.isFinite(interactionCases) ? interactionCases : profileCases;
    const casesSource = Number.isFinite(interactionCases) ? "interactions" : Number.isFinite(profileCases) ? "profiles" : "unknown";
    const rank = num(rankingRow?.rank) ?? num(profile?.rank) ?? i + 1;
    const globalRank = num(rankingRow?.rank);
    return { firm: firmDisplay || firmKey, firmKey, profile, rank, globalRank, winRate, winRateEstimated: false, score, cases, casesSource };
  });

  renderRankingsSnapshot();
  // Do not auto-show firm detail on load - user must click a row
}

function showFirmPanel() {
  const panel = q(".right-panel");
  if (panel) panel.classList.add("visible");
}

function hideFirmPanel() {
  const panel = q(".right-panel");
  if (panel) panel.classList.remove("visible");
  document.querySelectorAll(".rankings-table tbody tr").forEach((r) => r.classList.remove("selected"));
}

function updateFirmDetail(profile) {
  const firm = String(profile?.firm ?? "").trim();
  const firmKey = normalizeLabel(firm);
  const topCaseType = Array.isArray(profile?.byCaseType)
    ? profile.byCaseType.slice().sort((a, b) => (b?.cases ?? 0) - (a?.cases ?? 0))[0]?.caseType
    : "";
  const winRate = fmtPct(computeOverallWinRate(profile));
  const interactionCases = firmCaseIndex?.get(firmKey)?.cases;
  const hasInteractionCases = typeof interactionCases === "number" && Number.isFinite(interactionCases);
  const cases = hasInteractionCases ? interactionCases : num(profile?.cases);
  const casesHint = hasInteractionCases
    ? tx("基于 interactions CSV 的唯一 CaseId 计数（更接近全量数据）。", "Unique CaseIds from interactions CSV (closer to full dataset).")
    : tx("基于 firm profile 快照（可能偏小）。", "From firm profile snapshot (may be smaller).");
  const card = $id("firmDetail");
  card.innerHTML = `
    <button class="firm-detail-close" type="button" id="closeFirmDetail" title="${tx("关闭", "Close")}">×</button>
    <div class="firm-header">
      <div class="firm-avatar-large">${initials(firm)}</div>
      <div class="firm-name-large">${firm}</div>
      <div class="firm-specialty-large">${topCaseType ? t("topCaseType", { caseType: topCaseType }) : t("firmProfile")}</div>
    </div>

    <div class="metrics-grid">
      <div class="metric-box">
        <div class="metric-label">${t("metricWinRate")}</div>
        <div class="metric-value-large">${winRate}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">${t("metricScore")}</div>
        <div class="metric-value-large">${fmtNum(profile?.score)}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">${t("metricCases")}</div>
        <div class="metric-value-large" title="${safeAttr(casesHint)}">${fmtNum(cases)}</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">${t("metricRank")}</div>
        <div class="metric-value-large">#${fmtNum(profile?.rank)}</div>
      </div>
    </div>

    <div class="detail-section">
      <div class="verification-badge">${t("evidenceLinked")}</div>
      <button class="action-button" type="button" id="openWorkbenchFromFirm">${t("openWorkbench")}</button>
    </div>
  `;
  $id("closeFirmDetail").addEventListener("click", hideFirmPanel);
  $id("openWorkbenchFromFirm").addEventListener("click", () => {
    openWorkbench({ action: "openFirm", firm });
  });
  showFirmPanel();
}

function showEvidence(insight) {
  const title = String(insight?.title ?? "Evidence").trim();
  const caseIds = Array.isArray(insight?.evidence?.caseIds) ? insight.evidence.caseIds : [];
  $id("evidenceTitle").textContent = title;

  const list = $id("evidenceList");
  list.innerHTML = "";
  const items = caseIds
    .slice(0, J2_LIMITS.evidence)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  if (!items.length) {
    const div = document.createElement("div");
    div.className = "evidence-empty";
    div.textContent = t("evidenceEmpty");
    list.appendChild(div);
  } else {
    for (const id of items) {
      const row = kbState?.casesById?.get(id) ?? null;
      const el = document.createElement("div");
      el.className = "evidence-row";
      el.innerHTML = `<div class="evidence-id">CaseId ${id}</div>
        <div class="evidence-meta">${clampText(JSON.stringify(row ?? { CaseId: id }), 220)}</div>`;
      list.appendChild(el);
    }
  }

  const openBtn = $id("evidenceOpenWorkbench");
  openBtn.onclick = () =>
    openWorkbench({
      action: "openInsight",
      preset: "top100",
      filterPatch: insight?.filterPatch ?? {},
      evidenceCaseIds: caseIds,
      title,
    });

  openModal("evidenceModal");
}

let workbenchReady = false;
let workbenchQueue = [];
let llmEnabled = false;
let workbenchFullscreen = false;
let workbenchOpen = false;

function loadWorkbenchPrefs() {
  try {
    const raw = window.localStorage.getItem("j2_workbench_prefs");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveWorkbenchPrefs(next) {
  try {
    window.localStorage.setItem("j2_workbench_prefs", JSON.stringify(next));
  } catch (e) {
    void e;
  }
}

function postWorkbench(cmd) {
  const frame = $id("workbenchFrame");
  const win = frame?.contentWindow;
  if (!win) return;
  win.postMessage({ type: "cldemo:command", command: cmd }, window.location.origin);
}

function flushWorkbenchQueue() {
  if (!workbenchReady) return;
  const q = workbenchQueue;
  workbenchQueue = [];
  q.forEach((cmd) => postWorkbench(cmd));
}

function broadcastWorkbenchTheme() {
  if (!workbenchOpen) return;
  const frame = $id("workbenchFrame");
  const win = frame?.contentWindow;
  if (!win) return;
  win.postMessage({ type: "cldemo:theme", theme: currentTheme }, window.location.origin);
}

function broadcastWorkbenchLang() {
  if (!workbenchOpen) return;
  const frame = $id("workbenchFrame");
  const win = frame?.contentWindow;
  if (!win) return;
  win.postMessage({ type: "cldemo:lang", lang: currentLang }, window.location.origin);
}

function broadcastWorkbenchFullscreen() {
  if (!workbenchOpen) return;
  const frame = $id("workbenchFrame");
  const win = frame?.contentWindow;
  if (!win) return;
  win.postMessage({ type: "cldemo:fullscreen", fullscreen: !!workbenchFullscreen }, window.location.origin);
}

function buildWorkbenchSrc() {
  const params = new URLSearchParams();
  if (!llmEnabled) params.set("demo", "1");
  params.set("theme", currentTheme);
  params.set("lang", currentLang);
  const qs = params.toString();
  // Use relative URL so Workbench works when J2 is served from a sub-path / local folder.
  return qs ? `workbench.html?${qs}` : "workbench.html";
}

function syncWorkbenchSrc({ force = false } = {}) {
  const frame = $id("workbenchFrame");
  const desiredSrc = buildWorkbenchSrc();
  const prevSrc = frame.getAttribute("src") || "";
  if (!prevSrc) {
    frame.setAttribute("src", desiredSrc);
    workbenchReady = false;
    return;
  }
  if (force || prevSrc !== desiredSrc) {
    frame.setAttribute("src", desiredSrc);
    workbenchReady = false;
  }
}

function updateWorkbenchUI() {
  const panel = $id("workbenchPanel");
  const trigger = $id("workbenchTrigger");
  const fullscreenBtn = $id("wbFullscreen");
  const collapseBtn = $id("wbCollapse");

  panel.classList.toggle("open", workbenchOpen);
  panel.classList.toggle("fullscreen", workbenchFullscreen);

  // Only show trigger if animation is complete and workbench is closed
  if (animationComplete && !workbenchOpen) {
    trigger.classList.add("visible");
    trigger.classList.remove("hidden");
  } else {
    trigger.classList.remove("visible");
    trigger.classList.add("hidden");
  }

  if (fullscreenBtn) {
    fullscreenBtn.textContent = workbenchFullscreen ? t("exitFullscreen") : t("fullscreen");
  }
  if (collapseBtn) collapseBtn.textContent = t("collapse");
}

function openWorkbench(initialCommand = null) {
  const panel = $id("workbenchPanel");
  const frame = $id("workbenchFrame");
  syncWorkbenchSrc();

  workbenchOpen = true;
  updateWorkbenchUI();

  const prefs = loadWorkbenchPrefs();
  if (prefs?.width && !workbenchFullscreen) {
    panel.style.width = `${prefs.width}px`;
  }

  if (initialCommand) {
    if (workbenchReady) postWorkbench(initialCommand);
    else workbenchQueue.push(initialCommand);
  }

  frame.focus();
  broadcastWorkbenchTheme();
  broadcastWorkbenchFullscreen();
}

function closeWorkbench() {
  workbenchOpen = false;
  workbenchFullscreen = false;
  const panel = $id("workbenchPanel");
  panel.style.width = "";
  updateWorkbenchUI();
}

function toggleFullscreen() {
  const panel = $id("workbenchPanel");
  const next = !workbenchFullscreen;
  workbenchFullscreen = next;
  if (next) {
    panel.style.width = "";
  } else {
    const prefs = loadWorkbenchPrefs();
    if (prefs?.width) panel.style.width = `${prefs.width}px`;
  }
  updateWorkbenchUI();
  // Notify iframe of fullscreen state (direct message, not wrapped command)
  broadcastWorkbenchFullscreen();
}

// ===== Intro Animation Sequence =====

let isFirstRun = true;
let introTyping = null;
let introQueryText = "";
let introCancelled = false;

async function runIntroAnimation() {
  const typedText = $id("typedText");
  const cursor = $id("cursor");
  const promptInput = $id("promptInput");
  const dashboardMap = $id("dashboardMap");

  if (introCancelled) return;

  const forceIntro = getSearchParam("intro") === "1";
  const hasSeenIntro = (() => {
    try {
      return window.localStorage.getItem(STORAGE_KEYS.introSeen) === "true";
    } catch {
      return false;
    }
  })();

  dashboardMap.classList.remove("revealed", "blurred");
  setStatus("statusIdle");

  const query = t("introQuery");
  introQueryText = query;
  if (introCancelled) return;

  // Returning users: skip animation entirely
  if (hasSeenIntro && !forceIntro) {
    cursor.style.display = "none";
    typedText.textContent = "";
    promptInput.style.display = "block";
    promptInput.value = "";
    promptInput.placeholder = t("promptPlaceholder");
    setStatus("statusIdle");
    animationComplete = false;
    isFirstRun = true;
    updateWorkbenchUI();
    return;
  }

  // New users: typewriter only, wait for Run click
  animationComplete = false;
  isFirstRun = true;
  updateWorkbenchUI();

  // Typewriter effect
  await new Promise((r) => setTimeout(r, 500));
  if (introCancelled) return;
  introTyping = startTypewriter(typedText, query, { durationMs: 1800 });
  await introTyping.promise;
  if (introCancelled) return;
  introTyping = null;

  // After typewriter, show input and wait for user to click Run
  await new Promise((r) => setTimeout(r, 400));
  if (introCancelled) return;
  cursor.style.display = "none";
  typedText.textContent = "";
  promptInput.style.display = "block";
  promptInput.value = query;
  promptInput.placeholder = t("promptPlaceholder");
  setStatus("statusIdle");

  // User will click Run → runPrompt() → neural cards animation
}

function addIntroLog() {
  const logContainer = $id("logEntries");
  logContainer.innerHTML = "";

  const logs = Array.isArray(t("introLogs")) ? t("introLogs") : [];

  logs.forEach((text, i) => {
    setTimeout(() => {
      const div = document.createElement("div");
      div.className = "log-entry";
      div.textContent = text;
      logContainer.appendChild(div);
    }, i * 250);
  });
}

function setIntroAgentState(n, state) {
  const pill = (() => {
    try {
      return document.getElementById(`pill${n}`);
    } catch {
      return null;
    }
  })();
  const bar = (() => {
    try {
      return document.getElementById(`progress${n}`);
    } catch {
      return null;
    }
  })();
  if (pill) {
    pill.classList.remove("run", "done");
    if (state === "RUNNING") pill.classList.add("run");
    if (state === "DONE") pill.classList.add("done");
    pill.textContent = state;
  }
  if (bar) {
    bar.classList.toggle("running", state === "RUNNING");
  }
}

async function runPrompt(prompt) {
  const landingStrip = $id("landingStrip");
  const dashboard = $id("dashboardMap");
  const card1 = $id("card1");
  const card2 = $id("card2");
  const card3 = $id("card3");
  const card4 = $id("card4");

  // Start heavy loads during the "neural cards" time window.
  const kbJob = startKbLazyLoad().catch(() => null);
  const interactionsJob = startInteractionsLazyLoad().catch(() => null);

  const speed = (() => {
    const v = num(getSearchParam("introSpeed"));
    if (typeof v === "number" && v > 0.35 && v <= 1.2) return v;
    return getSearchParam("fast") === "1" ? 0.7 : 1.06;
  })();

  $id("card1Content").innerHTML = "";
  $id("card2Content").innerHTML = "";
  $id("card3Content").innerHTML = "";
  $id("card4Content").innerHTML = "";
  $id("logEntries").innerHTML = "";

  // Reset cards
  card1.classList.remove("landing", "takeoff");
  card2.classList.remove("landing", "takeoff");
  card3.classList.remove("landing", "takeoff");
  card4.classList.remove("landing", "takeoff");
  $id("progress1").style.width = "0";
  $id("progress2").style.width = "0";
  $id("progress3").style.width = "0";
  $id("progress4").style.width = "0";
  setIntroAgentState(1, "WAITING");
  setIntroAgentState(2, "WAITING");
  setIntroAgentState(3, "WAITING");
  setIntroAgentState(4, "WAITING");

  dashboard.classList.remove("revealed");
  dashboard.classList.add("blurred");
  ensureJ2DataWidgets();
  introLayoutSync?.sync?.();
  landingStrip.classList.add("active");

  // Card 1 can run immediately; Card 2+ needs KB.

  const hintRows = interactionsState?.stats?.rows;
  const hintFirms = interactionsState?.stats?.firms;

  // Card animations
  await new Promise((r) => setTimeout(r, 300 * speed));
  card1.classList.add("landing");
  setIntroAgentState(1, "RUNNING");
  const c1 = animateNeuralSteps(
    $id('card1Content'),
    [
      tx("加载知识库快照…", "Loading KB snapshots…"),
      tx("来源：Harvard Case Law Access Project（CAP）", "Source: Harvard Case Law Access Project (CAP)"),
      tx("参考：case.law（演示快照）", "Reference: case.law (demo snapshot)"),
      tx(
        `交互数据：${typeof hintRows === "number" ? hintRows.toLocaleString() : "…"} 行`,
        `Interactions: ${typeof hintRows === "number" ? hintRows.toLocaleString() : "…"} rows`,
      ),
      tx(
        `${typeof hintFirms === "number" ? hintFirms.toLocaleString() : "…"} 家律所 ✓`,
        `${typeof hintFirms === "number" ? hintFirms.toLocaleString() : "…"} firms ✓`,
      ),
      tx("结构校验：cases / profiles / insights ✓", "Schema checks: cases / profiles / insights ✓"),
    ],
    $id('progress1'),
    Math.round(420 * speed)
  );

  // While Card1 is animating, wait for KB to become available.
  await kbJob;
  if (!kbState?.insights || !kbState?.firms) throw new Error("KB not ready");
  const primary = pickPrimaryInsight({ insights: kbState.insights, q: prompt, firms: kbState.firms });
  const finalInsightTitle =
    primary.mode === "insight"
      ? String(primary?.insight?.title ?? tx("洞察", "Insight"))
      : primary.mode === "firm"
        ? `${tx("律所画像", "Firm profile")}: ${primary.firm}`
        : primary.mode === "compare"
          ? `${tx("对比", "Compare")}: ${primary.firms?.[0]} vs ${primary.firms?.[1]}`
          : tx("洞察", "Insight");

  await c1;
  setIntroAgentState(1, "DONE");

  await new Promise((r) => setTimeout(r, 260 * speed));
  card2.classList.add("landing");
  setIntroAgentState(2, "RUNNING");
  await animateNeuralSteps(
    $id('card2Content'),
    [
      tx("可验证优先：选择证据…", "Verifier-first: selecting evidence…"),
      tx("引用格式标准化（Bluebook 风格）…", "Citation normalization (Bluebook-style)…"),
      tx(`主线：${clampText(finalInsightTitle, 70)}`, `Primary: ${clampText(finalInsightTitle, 70)}`),
      tx(
        `证据：${primary.mode === "insight" ? (primary?.insight?.evidence?.caseIds?.length ?? 0) : 0} 个 CaseId ✓`,
        `Evidence: ${primary.mode === "insight" ? (primary?.insight?.evidence?.caseIds?.length ?? 0) : 0} caseIds ✓`,
      ),
      tx("CaseId → KB 行映射 ✓", "CaseId → KB row mapping ✓"),
    ],
    $id('progress2'),
    Math.round(420 * speed)
  );
  setIntroAgentState(2, "DONE");

  await new Promise((r) => setTimeout(r, 260 * speed));
  card3.classList.add("landing");
  setIntroAgentState(3, "RUNNING");
  await animateNeuralSteps(
    $id('card3Content'),
    [
      tx("生成可交付界面…", "Synthesizing deliverable UI…"),
      tx("计算对抗关系图 + 先验胜率…", "Computing rivalry graph + win-rate priors…"),
      tx("排名 + 画像 + 证据", "Rankings + profiles + evidence"),
      tx("置信度校准（演示）✓", "Confidence calibration (demo) ✓"),
      tx("工作台已就绪 ✓", "Ready for workbench ✓"),
    ],
    $id('progress3'),
    Math.round(420 * speed)
  );
  setIntroAgentState(3, "DONE");

  await new Promise((r) => setTimeout(r, 260 * speed));
  card4.classList.add("landing");
  setIntroAgentState(4, "RUNNING");
  await animateNeuralSteps(
    $id("card4Content"),
    [
      tx("准备工作台交接…", "Preparing workbench handoff…"),
      tx("同步主题/语言/筛选状态…", "Syncing theme/language/state…"),
      tx("初始化消息通道…", "Initializing message channel…"),
      tx("预热工作台视图…", "Pre-warming workbench view…"),
      tx("可在右侧打开 Workbench ✓", "Workbench is ready on the right ✓"),
    ],
    $id("progress4"),
    Math.round(420 * speed),
  );
  setIntroAgentState(4, "DONE");

  await interactionsJob;
  await new Promise((r) => setTimeout(r, 600 * speed));

  // Takeoff
  card1.classList.add("takeoff");
  await new Promise((r) => setTimeout(r, 120 * speed));
  card2.classList.add("takeoff");
  await new Promise((r) => setTimeout(r, 120 * speed));
  card3.classList.add("takeoff");
  await new Promise((r) => setTimeout(r, 120 * speed));
  card4.classList.add("takeoff");

  await new Promise((r) => setTimeout(r, 520 * speed));
  landingStrip.classList.remove("active");
  dashboard.classList.remove("blurred");

  dashboard.classList.add("revealed");
  addLog(primary);

  // Mark animation complete after first run
  if (isFirstRun) {
    isFirstRun = false;
    animationComplete = true;
    try {
      window.localStorage.setItem(STORAGE_KEYS.introSeen, "true");
    } catch {
      // ignore
    }
    updateWorkbenchUI();
  }

  if (primary.mode === "insight" && primary.insight) {
    if (/vs|rival|对手|被告|case|案件/i.test(prompt)) {
      showEvidence(primary.insight);
    }
  }
}

function addLog(primary) {
  const logContainer = $id("logEntries");
  const seed = hashSeed($id("promptInput").value);
  const phrases = Array.isArray(t("logPhrases")) ? t("logPhrases") : [];
  const start = seed % phrases.length;
  phrases
    .slice(start)
    .concat(phrases.slice(0, start))
    .forEach((text, i) => {
      setTimeout(() => {
        const div = document.createElement("div");
        div.className = "log-entry";
        div.textContent = text;
        logContainer.appendChild(div);
      }, i * 280);
    });

  const next = document.createElement("button");
  next.type = "button";
  next.className = "log-cta";
  next.textContent = t("workbenchCta");
  const ctaStyle =
    currentTheme === "light"
      ? "width:100%;margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(5,150,105,0.35);background:rgba(5,150,105,0.08);color:rgba(15,23,42,0.92);font-weight:800;cursor:pointer;"
      : "width:100%;margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,255,136,0.3);background:rgba(0,255,136,0.08);color:#e5e7eb;font-weight:800;cursor:pointer;";
  next.style.cssText = ctaStyle;
  next.addEventListener("click", () => {
    if (primary?.mode === "insight") {
      openWorkbench({
        action: "openInsight",
        preset: "top100",
        filterPatch: primary?.insight?.filterPatch ?? {},
        evidenceCaseIds: primary?.insight?.evidence?.caseIds ?? [],
        title: primary?.insight?.title ?? "Insight",
      });
      return;
    }
    if (primary?.mode === "firm") {
      openWorkbench({ action: "openFirm", firm: primary.firm });
      return;
    }
    openWorkbench({ action: "openPreset", preset: "top100" });
  });
  setTimeout(() => logContainer.appendChild(next), phrases.length * 280 + 100);
}

async function init() {
  const promptInput = $id("promptInput");
  const run = $id("runButton");
  const llmToggle = $id("llmToggle");
  const closeEvidence = $id("evidenceClose");
  const interactionsClose = q("#interactionsClose");
  const interactionsPrev = q("#interactionsPrev");
  const interactionsNext = q("#interactionsNext");
  const interactionsSearch = q("#interactionsSearch");
  const interactionsCaseType = q("#interactionsCaseType");
  const interactionsCourt = q("#interactionsCourt");
  const interactionsPageSize = q("#interactionsPageSize");
  const openRankingsBtn = q("#openRankingsBtn");
  const rankingsClose = q("#rankingsClose");
  const rankingsPrev = q("#rankingsPrev");
  const rankingsNext = q("#rankingsNext");
  const rankingsSearch = q("#rankingsSearch");
  const rankingsPageSize = q("#rankingsPageSize");
  const panel = $id("workbenchPanel");
  const resizer = $id("panelResizer");
  const trigger = $id("workbenchTrigger");
  const wbFullscreen = $id("wbFullscreen");
  const wbCollapse = $id("wbCollapse");
  const typedText = $id("typedText");

  try {
    llmEnabled = window.localStorage.getItem("j2_llm_enabled") === "true";
  } catch {
    llmEnabled = false;
  }
  llmToggle.classList.toggle("on", llmEnabled);

  applyLang(detectInitialLang());
  applyTheme(detectInitialTheme());
  renderStaticCopy();

  introLayoutSync = createIntroLayoutSync();

  const langToggle = q("#langToggle");
  if (langToggle) {
    langToggle.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button[data-lang]");
      const v = btn?.getAttribute?.("data-lang");
      if (!v) return;
      applyLang(v);
      renderStaticCopy();
      introLayoutSync?.sync?.();
    });
  }

  const themeToggle = q("#themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button[data-theme]");
      const v = btn?.getAttribute?.("data-theme");
      if (!v) return;
      applyTheme(v);
      renderStaticCopy();
      introLayoutSync?.sync?.();
    });
  }

  closeEvidence.addEventListener("click", () => closeModal("evidenceModal"));
  if (interactionsClose) interactionsClose.addEventListener("click", () => closeModal("interactionsModal"));
  trigger.addEventListener("click", () => openWorkbench({ action: "openPreset", preset: "top100" }));
  wbFullscreen.addEventListener("click", toggleFullscreen);
  wbCollapse.addEventListener("click", closeWorkbench);

  // Rankings sort toggles (Rankings KB Snapshot)
  const rankingThead = q("#dashboardMap .rankings-table thead");
  if (rankingThead) {
    rankingThead.addEventListener("click", (e) => {
      const th = e.target?.closest?.("th[data-sort]");
      const k = th?.getAttribute?.("data-sort");
      if (!k) return;
      const numeric = ["winRate", "score", "cases"].includes(k);
      // Demo-friendly: numeric columns default to "best first" (desc) and won't flip to asc unless Shift-click.
      if (numeric) {
        if (e.shiftKey) {
          if (rankingsSort.key === k) rankingsSort = { key: k, dir: rankingsSort.dir === "asc" ? "desc" : "asc" };
          else rankingsSort = { key: k, dir: "asc" };
        } else {
          rankingsSort = { key: k, dir: "desc" };
        }
      } else {
        const defaultDir = "asc";
        if (rankingsSort.key === k) rankingsSort = { key: k, dir: rankingsSort.dir === "asc" ? "desc" : "asc" };
        else rankingsSort = { key: k, dir: defaultDir };
      }
      renderRankingsSnapshot();
    });
  }

  if (interactionsPrev) {
    interactionsPrev.addEventListener("click", () => {
      interactionsUi.page = Math.max(1, (interactionsUi.page || 1) - 1);
      renderInteractionsModal();
    });
  }
  if (interactionsNext) {
    interactionsNext.addEventListener("click", () => {
      interactionsUi.page = (interactionsUi.page || 1) + 1;
      renderInteractionsModal();
    });
  }
  if (interactionsSearch) {
    let timer = null;
    interactionsSearch.addEventListener("input", () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        interactionsUi.query = String(interactionsSearch.value ?? "");
        interactionsUi.page = 1;
        renderInteractionsModal();
      }, 120);
    });
  }
  if (interactionsCaseType) {
    interactionsCaseType.addEventListener("change", () => {
      interactionsUi.caseType = String(interactionsCaseType.value ?? "");
      interactionsUi.page = 1;
      renderInteractionsModal();
    });
  }
  if (interactionsCourt) {
    interactionsCourt.addEventListener("change", () => {
      interactionsUi.court = String(interactionsCourt.value ?? "");
      interactionsUi.page = 1;
      renderInteractionsModal();
    });
  }
  if (interactionsPageSize) {
    interactionsPageSize.addEventListener("change", () => {
      interactionsUi.pageSize = Number(interactionsPageSize.value) || 50;
      interactionsUi.page = 1;
      renderInteractionsModal();
    });
  }

  if (openRankingsBtn) {
    openRankingsBtn.addEventListener("click", () => openRankingsModal());
  }
  if (rankingsClose) rankingsClose.addEventListener("click", () => closeModal("rankingsModal"));
  if (rankingsPrev) {
    rankingsPrev.addEventListener("click", () => {
      rankingsUi.page = Math.max(1, (rankingsUi.page || 1) - 1);
      renderRankingsModal();
    });
  }
  if (rankingsNext) {
    rankingsNext.addEventListener("click", () => {
      rankingsUi.page = (rankingsUi.page || 1) + 1;
      renderRankingsModal();
    });
  }
  if (rankingsSearch) {
    let timer = null;
    rankingsSearch.addEventListener("input", () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        rankingsUi.query = String(rankingsSearch.value ?? "");
        rankingsUi.page = 1;
        renderRankingsModal();
      }, 120);
    });
  }
  if (rankingsPageSize) {
    rankingsPageSize.addEventListener("change", () => {
      rankingsUi.pageSize = Number(rankingsPageSize.value) || 50;
      rankingsUi.page = 1;
      renderRankingsModal();
    });
  }

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    const key = (e.key || "").toLowerCase();
    if (key === "escape") {
      closeModal("evidenceModal");
      if (workbenchFullscreen) {
        workbenchFullscreen = false;
        updateWorkbenchUI();
      } else if (workbenchOpen) {
        closeWorkbench();
      }
    }
    if (key === "f" && (e.metaKey || e.ctrlKey) && e.shiftKey && workbenchOpen) {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  // Listen for theme/lang changes from workbench iframe
  window.addEventListener("message", (evt) => {
    try {
      if (evt.origin !== location.origin) return;
      const data = evt.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "cldemo:theme") {
        const next = String(data.theme || "").trim().toLowerCase();
        if (next === "dark" || next === "light") {
          applyTheme(next);
          renderStaticCopy();
        }
      }
      if (data.type === "cldemo:lang") {
        const next = String(data.lang || "").trim().toLowerCase();
        if (next === "zh" || next === "en") {
          applyLang(next);
          renderStaticCopy();
        }
      }
    } catch {
      // ignore
    }
  });

  // LLM toggle
  llmToggle.addEventListener("click", () => {
    llmEnabled = !llmEnabled;
    llmToggle.classList.toggle("on", llmEnabled);
    llmToggle.textContent = llmEnabled ? t("llmOn") : t("llmOff");
    try {
      window.localStorage.setItem("j2_llm_enabled", llmEnabled ? "true" : "false");
    } catch {
      // ignore
    }
    if (workbenchOpen) syncWorkbenchSrc({ force: true });
  });

  // Submit handler (wire before intro animation so Run works immediately).
  const submit = async () => {
    introCancelled = true;
    if (introTyping) {
      introTyping.finish?.();
      try {
        await introTyping.promise;
      } catch {
        // ignore
      }
    }

    const raw = String(promptInput.value ?? "").trim();
    const fallback = String(typedText?.textContent ?? "").trim() || introQueryText || t("introQuery");
    const prompt = raw || fallback;
    if (!prompt) return;

    if (promptInput.style.display === "none") {
      promptInput.style.display = "block";
      promptInput.placeholder = t("promptPlaceholder");
    }
    const cursor = q("#cursor");
    if (cursor) cursor.style.display = "none";
    if (typedText) typedText.textContent = "";
    if (!raw) promptInput.value = prompt;

    setBusy(true);
    try {
      await runPrompt(prompt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(e);
      setStatusText(tx(`运行失败：${msg}`, `Run failed: ${msg}`));
      alert(tx(`运行失败：${msg}`, `Run failed: ${msg}`));
    } finally {
      setBusy(false);
      if (!workbenchOpen) setStatus("statusIdle");
    }
  };

  run.addEventListener("click", submit);
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  // Resizer
  let resizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener("pointerdown", (e) => {
    if (workbenchFullscreen || e.button !== 0) return;
    resizing = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    resizer.classList.add("dragging");
    resizer.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  resizer.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    const dx = startX - e.clientX;
    const newWidth = Math.min(window.innerWidth * 0.85, Math.max(400, startWidth + dx));
    panel.style.width = `${newWidth}px`;
  });

  const finishResize = () => {
    if (!resizing) return;
    resizing = false;
    resizer.classList.remove("dragging");
    saveWorkbenchPrefs({ width: Math.round(panel.getBoundingClientRect().width) });
  };

  resizer.addEventListener("pointerup", finishResize);
  resizer.addEventListener("pointercancel", finishResize);

  // Workbench iframe
  const frame = $id("workbenchFrame");
  frame.addEventListener("load", () => {
    workbenchReady = true;
    flushWorkbenchQueue();
    broadcastWorkbenchTheme();
    broadcastWorkbenchFullscreen();
  });
  window.addEventListener("message", (evt) => {
    if (evt.origin !== window.location.origin) return;
    if (evt.data?.type === "cldemo:ready") {
      workbenchReady = true;
      flushWorkbenchQueue();
      broadcastWorkbenchTheme();
      broadcastWorkbenchFullscreen();
    }
  });

  // Run intro animation
  await runIntroAnimation();
}

init().catch((e) => {
  console.error(e);
  alert(`Failed to initialize J2: ${e instanceof Error ? e.message : String(e)}`);
});
