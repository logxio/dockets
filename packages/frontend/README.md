# Frontend

React 19 + Vite. Two entry points build from one source tree.

- `workbench.html` — the analysis app. This is the real one.
- `index.html` — a scripted demo deck that walks a query through four staged panels and then hands off into the workbench in an iframe, passing theme and filter state over `postMessage`.

Project context, the ranking model, and the known limits are in the [root README](../../README.md).

## Commands

```bash
pnpm install
pnpm dev          # 127.0.0.1:5173, strict port
pnpm build        # both entry points into dist/
pnpm lint
```

`pnpm dev:demo` / `pnpm build:demo` set `VITE_DEMO_MODE=true`, which preloads the sample dataset and hides the Advanced tab. Appending `?demo=1` to any URL does the same at runtime.

## Environment

| Variable | Effect |
|----------|--------|
| `VITE_API_BASE_URL` | Backend base. Empty or `/api` uses the dev proxy. |
| `VITE_API_PROXY_TARGET` | Overrides proxy autodetection, which tries 8001 then 8000. |
| `VITE_LLM_API_URL` | OpenAI-compatible endpoint. Empty enables the mock. |
| `VITE_LLM_FORCE_MOCK` | Pins the mock on even when a URL is set. |
| `MCCC_LLM_UPSTREAM` | Dev-only. Proxies `/llm` server-side so the browser avoids CORS. |

The LLM API key is entered in the UI and kept in `localStorage`. It is never read from the build environment.

## Layout

```
src/
├── App.jsx                 Shell: tabs, filter state, URL sync, postMessage bridge
├── components/             Views and panels
├── lib/
│   ├── apiClient.js        Backend calls for the matter workflow
│   ├── transform.js        Row normalization, filtering, QC warnings
│   ├── intelligence.js     Insight generation over the filtered set
│   ├── robustness.js       Sensitivity sweep and null-control randomization
│   ├── report.js           Standalone HTML report generation
│   ├── llm*.js             Client, config, prompt building, think-block parsing
│   ├── i18n.js             UI copy table, `t("a.b.c")`
│   └── queryState.js       Filters ⇄ query string
├── j2/main.js              The demo deck, plain DOM, no React
└── styles.css
```

## Views

**Explore** renders the plaintiff-defendant graph in Cytoscape, or the same rows as a table. Clicking an edge opens the cases behind it by RowId; clicking a node opens a firm profile with opponents, case types, and courts.

**Rankings** is the AHPI table with fuzzy search, sortable columns, and a filter for firms present in the current network. Clicking a firm focuses its subgraph.

**Report** builds an exportable summary: QC checks, insights, robustness, null control, rankings. Exports as HTML, Markdown, JSON, or TSV. The LLM panel injects the filtered top-N rows as CSV into the prompt and requires every claim to carry evidence RowIds — claims without them render as unverified.

**Advanced** holds counterfactual what-if, A/B dataset comparison with delta views, the adjacency matrix, and LLM configuration.

**Matters** is the only view that needs the API: upload a complaint, confirm the extracted brief, get ranked firms with evidence, export a decision pack. Read the win-rate caveat in the root README before trusting the numbers on that screen.

## State in the URL

View, filters, theme, and demo flag all serialize to the query string, so any analysis state is a link. `⌘K` opens the command palette.
