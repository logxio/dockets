import React from "react";

const STRINGS = {
  zh: {
    langName: "中文",
    app: {
      title: "子午线 · 法律智能工作台",
      subtitle: "Verifier-first · 多智能体协作 · LLM Copilot · 图谱智能 · 证据绑定交付物",
    },
    tabs: { explore: "探索", rankings: "排名", report: "报告", advanced: "高级" },
    buttons: {
      commandPalette: "⌘K",
      story: "演示",
      assistant: "助手",
      share: "分享链接",
      exportReport: "导出报告",
      actions: "操作",
      close: "关闭",
    },
    misc: {
      demoMode: "演示模式",
      advancedHidden: "演示模式下隐藏高级功能",
      notLoaded: "未加载",
      pickView: "请选择一个视图。",
      importFirst: "先在左侧导入文件并完成列映射。",
      compareNeedsTwo: "对比模式需要导入数据集 A 与数据集 B。",
      copiedLink: "已复制可复现链接",
      copyFailed: "复制失败（浏览器限制），可手动复制地址栏链接",
      exportFailed: "导出报告失败",
    },
    actions: {
      headSub: "Share / Export · 支持快捷键",
      shareSection: "分享",
      copyLink: "复制分享链接",
      copyLinkSub: "复制包含视图/筛选/主题的可复现链接",
      copied: "已复制",
      copyFailed: "失败",
      exportSection: "导出",
      exportPng: "导出当前视图（PNG）",
      exportPngSub: "适用于 Network 视图",
      exportReport: "导出当前报告（HTML）",
      exportReportSub: "交付物：洞察 + 排名 + 过滤条件",
      exportRankingsHtml: "导出排名报告（HTML）",
      exportRankingsHtmlSub: "可直接分享给业务/团队阅读",
      exportRankingsTsv: "导出排名表（TSV）",
      exportRankingsTsvSub: "用于二次分析或合并到表格",
    },
    sections: {
      import: "导入",
      importCompare: "导入（对比）",
      importHelpSingle: "CSV/TSV 均可；先导入，再做列映射。",
      importHelpCompare: "分别导入数据集 A 与数据集 B，用同一套过滤条件进行对比。",
      dataHints: "数据提示",
      filters: "筛选",
      filtersSub: "Figure 风格：先收敛规模，再精筛。",
    },
    viewTitles: {
      matters: "案件",
      exploreTable: "探索 · 表格",
      exploreMatrix: "探索 · 矩阵",
      exploreMatrixDot: "探索 · 矩阵（点图）",
      exploreNetwork: "探索 · 网络",
      rankings: "排名",
      report: "报告",
      advanced: "高级",
    },
    viewSubtitles: {
      matters: "上传材料→自动识别→推荐律所→一键生成决策包（可导出 / 可解释 / 可追溯）。",
      explore: "点击边/律所 → 证据 / 律所画像 / 验证（右侧抽屉）。",
      rankings: "头部律所（AHPI 排名）；点击律所一键聚焦网络，并打开画像。",
      report: "可导出报告；验证优先 LLM 强制绑定 RowId 证据（无证据=未验证）。",
      advanced: "高级功能：反事实 / 对比 / 原始表格 / LLM 配置。",
    },
    fileImport: {
      loadTop100: "加载前100（演示）",
      loadTop50: "加载前50（演示）",
      loadExample: "加载示例",
      loadFig2: "加载 Fig.2（MOESM4）",
      loadTop100Tip: "演示模式：加载前100律所子图（更快更稳）",
      loadTop50Tip: "演示模式：加载前50律所子图（更快更稳）",
      presetLoadTip: "加载 Mahari 示例（Top100）并自动映射列",
      fig2Tip: "从论文 Fig.2 Source Data（MOESM4）join 回 cases_df 后导出的 interactions（plaintiff/defendant firms + case type + outcome + weight）",
      dropDisabled: "演示模式：禁用本地导入",
      dropActive: "松开导入…",
      dropIdle: "拖拽文件 / 点击选择",
      preset: "Mahari 预设",
      presetTip: "对示例列（PlaintiffFirm/DefendantFirm/CaseType/Court/Outcome/Weight）一键映射",
      currentFile: "当前文件：",
      notSelected: "未选择",
      rowsSuffix: "行",
      canStart: "可以开始分析",
      needMapping: "请至少映射 Plaintiff/Defendant firm",
      start: "开始",
      processing: "处理中…",
      mapping: {
        plaintiff: "原告律所",
        defendant: "被告律所",
        caseType: "案件类型",
        court: "法院",
        weight: "权重",
        outcome: "结果",
        requiredMark: "*",
        unselected: "（未选择）",
      },
      errors: {
        importFailed: "导入失败",
        loadExampleFailed: "加载示例失败",
        loadFig2Failed: "加载 Fig.2 示例失败",
        loadTop100Failed: "加载前100示例失败",
        loadTop50Failed: "加载前50示例失败",
      },
    },
    story: {
      title: "引导演示 / Story Mode",
      subtitle: "3 步剧本：加载 → 聚焦 → 证据 → 导出（可一键自动跑）",
      autoRun: "一键自动跑（3 步）",
      running: "运行中…",
      export: "导出报告",
      fastTip: "更快更稳：现场演示建议前100",
      stepLabel: "步骤",
      current: "当前",
      steps: {
        s1Title: "加载数据",
        s1Desc: "加载前100/前50（演示）或 Fig.2 示例（非演示）。",
        s2Title: "聚焦一个律所",
        s2Desc: "跳到 Rankings 并选一个代表性 firm，打开 profile。",
        s3Title: "打开证据",
        s3Desc: "选择最强对手边并弹出 RowId 证据；然后导出报告。",
      },
      tips: "目标是 3 分钟内展示“研究助手式闭环”—— 结论可点证据，且可一键导出交付物。",
    },
    filtersPanel: {
      topEdges: "边数上限",
      topEdgesPh: "例如 300（留空=不过滤）",
      caseType: "案件类型",
      caseTypePh: "模糊匹配（例如 Contract / IP）",
      court: "法院",
      courtPh: "模糊匹配（例如 D. Del. / S.D.N.Y.）",
      outcome: "结果",
      outcomePh: "例如 PlaintiffWin / DefendantWin / Settlement（留空=不过滤）",
      includeSelf: "包含 self-loop（plaintiff==defendant）",
      focusMode: "聚焦模式",
      any: "任意",
      outgoing: "发出",
      incoming: "进入",
      reset: "重置",
    },
    commandPalette: {
      title: "命令面板",
      subtitle: "输入 firm 名快速跳转（Esc 关闭）",
      placeholder: "搜索律所…",
      type: "类型",
      name: "名称",
      action: "操作",
      actionFocus: "聚焦",
      noResults: "无结果",
      tip: "提示：⌘K / Ctrl+K 打开；回车选择；↑↓ 移动。",
    },
    evidence: {
      title: "证据（RowId 级）",
      subtitleDefault: "✅ 引用已验证",
      verified: "✅ 引用已验证",
      rows: "行数",
      copyRowIds: "复制 RowIds",
      copyOk: "已复制到剪贴板",
      copyFail: "复制失败（浏览器限制）",
      goTable: "跳转 Table",
      copyRaw: "复制 raw",
      missingRow: "缺少该行",
      viewRaw: "查看 raw JSON（第一行）",
      actions: "操作",
    },
    errorBoundary: {
      defaultTitle: "页面渲染失败（已拦截）",
      retry: "重试渲染",
      tip: "提示：可尝试切换 Tab 或刷新页面",
    },
    loader: {
      analyzing: "分析交互中…",
      checking: "检查路径中…",
      synthesizing: "生成报告中…",
      loading: "加载中…",
    },
    think: {
      title: "查看推理过程（AI 思考）",
      badge: "推理",
    },
    network: {
      hint: "提示：点一条边即可查看 RowId 级证据",
      fit: "自适应",
      exportPng: "导出 PNG",
      fullscreen: "全屏",
      exitFullscreen: "退出全屏",
      evidenceTitle: "✅ 引用已验证 · {src}→{dst}",
      evidenceSub: "Edge {src}→{dst} · evidence",
      note: "边宽/颜色按权重（当前：{weightLabel}）；点击节点在右侧查看对手/案件类型/法院，并可一键聚焦子网络。",
    },
  },
  en: {
    langName: "English",
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
  },
};

function normalizeLang(lang) {
  const v = String(lang ?? "").trim().toLowerCase();
  if (v === "zh" || v === "zh-cn" || v === "zh_cn" || v === "cn") return "zh";
  if (v === "en" || v === "en-us" || v === "en_us") return "en";
  return "";
}

export function detectLang({ search = "", storageKey = "cldemo_lang" } = {}) {
  // First check current document (may be set by inline script before React)
  try {
    const current = normalizeLang(document?.documentElement?.lang);
    if (current) return current;
  } catch {
    // ignore
  }
  try {
    const sp = new URLSearchParams(String(search || "").startsWith("?") ? String(search || "").slice(1) : String(search || ""));
    const q = normalizeLang(sp.get("lang"));
    if (q) return q;
  } catch {
    // ignore
  }
  try {
    const saved = normalizeLang(window.localStorage.getItem(storageKey));
    if (saved) return saved;
  } catch {
    // ignore
  }
  try {
    const nav = normalizeLang(navigator.language || navigator.languages?.[0] || "");
    if (nav) return nav;
  } catch {
    // ignore
  }
  return "zh";
}

function getByPath(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

export function createT(lang) {
  const l = normalizeLang(lang) || "zh";
  const dict = STRINGS[l] ?? STRINGS.zh;
  return (key, vars) => {
    const v = getByPath(dict, key);
    const base = typeof v === "string" ? v : "";
    if (!vars || typeof vars !== "object") return base;
    return base.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
  };
}

export function createTx(lang) {
  const l = normalizeLang(lang) || "zh";
  return (zh, en) => (l === "zh" ? String(zh ?? "") : String(en ?? ""));
}

const I18nContext = React.createContext({
  lang: "zh",
  setLang: () => {},
  t: (k) => k,
  tx: (zh, en) => (String(en ?? "") ? String(en) : String(zh ?? "")),
});

export function I18nProvider({ lang, setLang, children }) {
  const t = React.useMemo(() => createT(lang), [lang]);
  const tx = React.useMemo(() => createTx(lang), [lang]);
  const value = React.useMemo(() => ({ lang, setLang, t, tx }), [lang, setLang, t, tx]);
  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return React.useContext(I18nContext);
}
