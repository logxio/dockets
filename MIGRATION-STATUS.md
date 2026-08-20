# Migration status

Terminal state of the pass that converged the duplicate source trees, removed all Chinese, and brought the repo to a publishable state. Written to the repo root as requested.

**Delete this file before the repo goes public.** It is a working record for the author, not project documentation, and it quotes the phrasing it removed.

## Callback

`callback_sent` — to `claude-2d`, which identified itself as the originating session when it relayed the author's correction on the proof-of-concept line. The first attempt was marked `callback_failed`: the task arrived with no originating-session identifier and guessing among four peers was out of bounds.

**Receipt:** Done. Output at `/Users/suapril/Code/dockets`, pushed to `origin/main`. No blockers. Six defects found and fixed along the way (listed under *Defects fixed*); one modelling bug documented rather than fixed (`PredDefWinProba`, see *Deliberately not done*). Repo left private.

## Source tree

**`packages/frontend/` survived. The root-level tree was deleted.**

Evidence, in order of weight:

1. **Git history.** `6db39a1` created the root tree (`src/`, `index.html`, `vite.config.js`, `package.json`). `e98e8f4`, the second-newest commit, created `packages/frontend/` as a copy plus later work. The `packages/` tree is strictly newer.
2. **`docker-compose.yml`** builds `context: ./packages/frontend`. The root tree was not referenced by any build config.
3. **Build config divergence.** `packages/frontend/vite.config.js` carries the `/api` dev proxy with port autodetection (8001 → 8000) that the FastAPI service in `api/` needs. The root `vite.config.js` had only the `/llm` proxy, so the root tree could not talk to the backend at all.
4. **Superset source.** `CreateMatterModal.jsx`, `MatterWorkspace.jsx`, `MatterList.jsx`, `FitView.jsx`, and `lib/apiClient.js` existed only under `packages/`. `j2/main.js` was 4,043 lines there against 1,241 at root.
5. **Stale paths at root.** Root `package.json` `data:refresh` still pointed at `../computational-law-demo-sy/public/sample/...`, a sibling directory name from before the monorepo. The `packages/` copy pointed at `../packages/frontend/public/sample/...`.
6. **Personal-path leak at root.** Root `public/sample/*.json` embedded the author's local Desktop path, including a Chinese directory name, in an `interactionsCsv` field. The `packages/` copies were already sanitized to `/sample/...`.

Deleted from the root: `src/`, `public/`, `index.html`, `workbench.html`, `vite.config.js`, `package.json`, `pnpm-lock.yaml`, `postcss.config.js`, `tailwind.config.js`, `eslint.config.js`, `vercel.json`, `README_ZH.md`, `scripts/llm_data_injection_test.mjs`. Also removed: `packages/frontend/README_ZH.md`, `packages/frontend/docs/` (placeholder duplicate), `.lh/` (editor local-history artifact), 31 tracked `__pycache__/*.pyc` files, and `docs/README.md` (a two-line placeholder next to the GIFs it described).

`netlify.toml` was retargeted with `base = "packages/frontend"` and lost its redirect to `https://computational-law-demo.onrender.com` — a personal deployment that does not belong in a public repo, and which `packages/frontend/public/_redirects` had already dropped.

`demos/` was deleted entirely. All eleven HTML files its `index.html` linked to are listed in `.gitignore` and were never committed, so the directory shipped an index of dead links plus shared CSS/JS for files that do not exist. Its `README.md` was 241 lines of Chinese framing the demos as outreach material aimed at a named individual.

Repo went from 266 tracked files to 142.

## Chinese removal

Verification command from the task, run against the final tree:

```bash
git ls-files | while read f; do grep -lP '[\x{4e00}-\x{9fff}]' "$f"; done
```

Output: empty. 68 files matched before the pass (the task estimated 66). Filenames and directory names are ASCII throughout.

Note for re-running: the system `grep` on this machine is `ugrep 7.5.0`, which supports `-P`. BSD grep does not; use `rg` or `ggrep` if that command comes back silently empty.

How it was done, not by hand-translating:

1. **The English catalogue already existed.** `src/lib/i18n.js` held `STRINGS.en` alongside `STRINGS.zh`. The `zh` block was dropped and `en` promoted to the single table.
2. **1,251 bilingual call sites were rewritten by codemod.** The dominant pattern was `tx(<chinese>, <english>)` — an inline two-language helper taking both strings as arguments, 1,203 occurrences across 27 files. A Babel-parser-based codemod (`@babel/parser`, jsx plugin) rewrote every `tx(a, b)` call to its second argument, iterating to a fixed point so nested calls collapsed, and re-parsing after each file to fail loudly on invalid output. The same pass handled `lang === "en" ? a : b`, `String(lang) === "en" ? a : b`, and `isEn ? a : b`.
3. **518 JSX artifacts were unwrapped.** The rewrite left `{"Legend"}` where a two-argument `tx(...)` call had been. A second AST pass turned safe string literals back into raw JSX text and plain attribute values, so no file reads like a translation of something else.
4. **Bilingual data objects were flattened by hand.** `{ value, zh, en }` shapes in `App.jsx`, `MatterList.jsx`, `CreateMatterModal.jsx`, `MatterWorkspace.jsx`, and `LlmPanel.jsx` became `{ value, label }`, with `.en` references renamed to `.label`.
5. **The language dimension was removed, not hidden.** `LangToggle.jsx` deleted; `detectLang`, `normalizeLang`, `createTx`, `setLang`, the `?lang=` query parameter, the `cldemo_lang` localStorage key, and the `cldemo:lang` postMessage channel between the demo deck and the workbench iframe are all gone. `<html lang="zh-CN">` is now `lang="en"` in both entry points. `i18n.js` is a flat copy table behind `t("a.b.c")`.
6. **`src/j2/main.js` got the same treatment.** Its private `I18N = { en, zh }` became a single `COPY` table; `applyLang`, `detectInitialLang`, `broadcastWorkbenchLang`, and the `#langToggle` handler were removed. Chinese keyword alternatives in the demo query parser — alternates inside the defendant, case-type, versus-separator, and top-N patterns — were dropped since no Chinese input can reach it.
7. **Non-UI Chinese was handled at the source.** Chinese regex alternatives in `packages/pipeline/pipeline/document_parse.py` (role, opposing counsel, budget, notes patterns) were removed along with the full-width colon class they carried. Generated summaries in `public/sample/mahari_insights.json` were rewritten in English with the numbers preserved. `packages/pipeline/ALGO_METRICS_RETRIEVAL.md` was replaced (see below).

`eslint` was used as the oracle for dead bindings after the codemod: `no-unused-vars` is configured as an error, and it surfaced every leftover `tx` import, dependency-array entry, and unused parameter.

Removal was verified in the running application, not only in the source. See *Verification*.

## Documentation

**`README.md` was rewritten from scratch.** The previous version was 346 lines of the register this repo is meant to avoid: five shields.io badges above the fold, "Next-Generation Litigation Analytics Platform", "cutting-edge", "unprecedented transparency", a ✅-per-row feature table, a "We welcome contributions" section on a solo portfolio repo, and a closing centered tagline. It also carried claims the code does not support — a project structure block describing `NetworkView.jsx` as "Force-directed graph (D3.js)" when it is Cytoscape, and "Handles 10,000+ litigation records smoothly" with nothing behind it.

The new one leads with a verified finding rather than adjectives. Every number in it was computed from the shipped sample data during this pass:

- 1,284 cases, 14,797 interaction rows, 1,966 firms, 2013–2018.
- Kirkland & Ellis ranks #878 on 55 cases; Morrison & Foerster #1541 on 36.
- Eight of the top ten ranked firms appear in exactly one case; top-20 median is 1.5 cases.
- Fitted valence probabilities land on 0.9999999 and 4e-41; `real_property` (6 cases) draws a privilege term of +3.94.
- Case-level outcomes are 79.6% plaintiff wins.
- The `Court` column is empty for all 14,797 rows, so the court filter has nothing to filter on.

The point of the rewrite is that the interesting thing here is not that a published ranking method got reimplemented — it is that the reimplementation, run honestly, produces a top-of-table that is a small-sample artifact, and the workbench is built to make that visible. Zero badges, no emoji headings, and a *Limits* section that states where the numbers stop and names the change that closes each gap.

**Register pass (second round, per the author's correction).** The first draft stacked preemptive concessions: a proof-of-concept line above the fold, a *Known limits* list phrased as a bug report against the author's own work, "not trustworthy", "currently wrong, and the code path is live", "treat as placeholder", and an apologetic attribution in the AHPI README. All of it is gone. Every technical fact survived — AUC 0.455, the small-sample effect, the missing prior, the 996 kB chunk — restated as findings the author made and knows the fix for, rather than warnings about the author's reliability. The distinction held throughout: accurate operational qualifications stayed (Node version, port numbers, in-memory state, mock-mode labels in the UI), self-devaluation went, and nothing was replaced with adjectives in the other direction.

The proof-of-concept sentence was deleted outright rather than kept — the author's correction supersedes the original brief on that point. A repo-wide sweep for the same class of phrasing (`proof of concept`, `not production ready`, `for demonstration purposes`, `rapid prototyping sprint`, `use at your own risk`, and the rest) returns clean across all tracked files.

Other documentation:

- **`packages/pipeline/ALGO_METRICS_RETRIEVAL.md` → `packages/pipeline/DESIGN.md`.** The original was 91 lines of Chinese written in a multi-agent coordination frame, naming an "Agent C" as owner of the directory and stating which sibling agents must not touch it — an internal process artifact. The technical content was worth keeping: two-stage candidate generation, evidence-tier retrieval, shrinkage, calibration metrics. Rewritten in English as a design note with an explicit split between what is implemented and what is not, so the plan cannot be misread as a description of finished work.
- **`packages/frontend/README.md`** was the same 345-line slop as the root README. Replaced with a package-level README: entry points, commands, environment variables, source layout, what each view does.
- **`api/README.md`** rewritten. The old one documented 8 endpoints; there are 25. It also gave an install order that cannot work (`pip install -e .` before the local packages it depends on) and a `docker build .` from `api/` that no longer matches the build context.
- **`packages/pipeline/README.md`** rewritten to cover `matter_signals` and `document_parse`, which were absent, and to correct the install path and the config table.
- **`packages/ahpi/README.md`** kept, with corrected install paths, a one-line provenance statement, and a *Behaviour on sparse data* section describing what an unregularized fit does at low n.

Every command and code example in every README was executed against a clean virtualenv or a clean `node_modules` before being committed. Two of them did not work and were fixed rather than reworded — see below.

## Verification

Run at the end of the pass, in this order.

| Check | Command | Result |
|-------|---------|--------|
| Chinese | `git ls-files \| while read f; do grep -lP '[\x{4e00}-\x{9fff}]' "$f"; done` | empty |
| Frontend lint | `pnpm -C packages/frontend lint` | clean, 0 errors 0 warnings |
| Frontend build | `pnpm -C packages/frontend build` | success, 1,776 modules, both entry points |
| AHPI tests | `pytest packages/ahpi/tests` | 18 passed |
| Pipeline tests | `pytest packages/pipeline/tests` | 11 passed |
| API tests | `pytest api/tests` | 14 passed |
| Clean install | `pip install -e packages/ahpi -e packages/pipeline -e api` in a fresh venv | success, all three import |
| API boot | `uvicorn app.main:app --app-dir api --port 8001` | `/api/health` returns ok |

Build output: `index.html` 75.5 kB, `workbench.html` 2.4 kB, `workbench-*.js` 995.8 kB (298 kB gzip), `workbench-*.css` 64.9 kB, `index-*.js` 77.7 kB, `parse-*.js` 22.3 kB. The 996 kB chunk exceeds Vite's 500 kB warning threshold; it is Cytoscape plus Recharts, it is pre-existing, and it is disclosed in the README rather than silenced.

**The application was driven, not just built.** With the dev server and the FastAPI backend both running:

- Demo deck (`/`) — intro typewriter, all four agent panels, matchup answer card with evidence chips. English throughout, including the hidden Interactions and Rankings modals.
- Workbench (`/workbench.html`) — Explore/Network rendered 3,815 rows, 100 firms, 1,531 edges in Cytoscape. Rankings, Report, and Advanced tabs all rendered.
- Report tab — QC panel, insights, top plaintiff/defendant tables, LLM prompt injection panel, all populated with real numbers.
- Matters tab — created a matter end to end through the API: sample document → one-click intake → parse job → matter `ACME, INC. v. BETA INC. — contract · N.D. Cal.` → recommended firms with lift, evidence counts, and "Why recommended?" expanders.
- Browser console: no errors. The only two 500s in the buffer are `/api/matters` calls made before the backend was started, and the failure state they produced is itself an English message.

No Chinese appeared anywhere in the running UI.

## Defects fixed

Found while verifying documented behaviour, not sought out.

1. **`api/pyproject.toml` could not build.** No `[tool.hatch.build.targets.wheel]`, so hatchling could not locate the `app` package and `pip install -e api` failed with `metadata-generation-failed`. The documented install path was broken for anyone cloning. Added `packages = ["app"]`.
2. **`packages/pipeline` was unimportable after a clean install.** `document_parse.py` imports `pdfplumber` at module scope and `pipeline/__init__.py` re-exports from it, but `pdfplumber` was not in the dependency list. Added `pdfplumber>=0.11.0`.
3. **`api/Dockerfile` could not have worked.** It ran `pip install .` from a build context of `./api` alone, while the package depends on `ahpi` and `legal-pipeline`, which live outside that context and are not on PyPI under those names. Rewrote it to build from the repository root and install all three from source; `docker-compose.yml` updated to `context: .` / `dockerfile: api/Dockerfile`.
4. **`packages/frontend/Dockerfile` shipped a build-process leak.** Its fallback branch emitted an HTML page reading "Waiting for Agent D to migrate the frontend." Replaced the whole conditional cascade with the one path that applies, and added the `/workbench` route nginx was missing.
5. **`packages/ahpi` had a failing test.** `test_stops_at_max_iterations` asserted `iteration <= 5` and got 6: `ConvergenceChecker.update` incremented `loop_number` before the cap check and reported the call that tripped the cap rather than the number of iterations that ran. The returned count is only used for logging in `model.py`, so capping the report changes no numerical behaviour. Fixed in `utils.py`; suite now 18/18.
6. **Documented API surface did not exist.** `packages/ahpi/README.md` documented `fit_ahpi` and `cross_validate`, neither of which was exported from `ahpi/__init__.py`. They are real, tested functions, so they were exported (along with `compute_ranking_stability`, `create_interaction_dataframe`, `sample_interactions`) rather than removed from the docs.

7. **Dead payload carrying a private solicitation.** `mockLlm.js` returned a `draftEmail` field holding a pre-written outreach message addressed to the paper's author by first name and signed `[Your Name]`, describing the project as "a small, shareable demo". Nothing in the frontend or API ever read the field. Removed — same class of artifact as the `demos/README.md` outreach plan, but shipping inside the application.

Also cleaned: `your-org/legal-intelligence-platform` placeholder URLs in three `pyproject.toml` files and `api/app/main.py` now point at `github.com/logxio/dockets`; `{name = "Legal Intelligence Platform Team"}` replaced with `Yan Su <hi@yansu.me>`.

## Identity

The forbidden strings — Puffy, nxsio, Nexus Studio, mine.ai, `y-su24@mails.tsinghua.edu.cn`, `susu-pro` — do not appear anywhere in the tree. Neither does `suapril`; the local absolute path that leaked through the sample JSON files went out with the root tree.

One item needs a decision that was not mine to make: **`packages/ahpi/pyproject.toml` listed the paper's authors as the package authors, with their institutional email addresses** (`alexandre.mojon@unisg.ch`, `rmahari@mit.edu`). Publishing two third parties' addresses in a public repo is a privacy exposure, and listing them as authors of an independent reimplementation misstates provenance in the other direction. Both were replaced with `Yan Su <hi@yansu.me>`, and the academic credit was strengthened where it belongs: the module docstring now says "This is an independent reimplementation of the method described in…", the package README states that the implementation is independent of the authors, and the citation stays in both.

## Deliberately not done

1. **The `PredDefWinProba` bug was documented, not fixed.** `pipeline.matter_signals.compute_candidate_outcome_signal` reads that column as P(defendant wins) and surfaces it in the Matters UI as a predicted win rate. On the sample it is not a probability of anything: mean 0.814 against an observed defendant win rate of 0.204, means of 0.817 and 0.800 split by actual outcome, and AUC 0.455 against the real `Winner` label — below chance. The hardcoded `baseline_defendant_win_rate_pct=83` is calibrated to the column's own mean rather than to outcomes, which makes the resulting lift look plausible instead of surfacing the mismatch. Fixing it properly means computing an empirical win rate from `Winner`, shrinking it toward the case-type base rate, and returning `unknown` below a sample-size floor — a modelling change, outside a publishability pass. It is documented precisely in `packages/pipeline/DESIGN.md` and flagged in the README's *Known limits*. **This is the one thing worth acting on before showing the repo to anyone who will click into Matters.**
2. **No shrinkage was added to the estimator.** Same reasoning. It is the largest correctness gap in the project and it is now stated plainly in three places instead of being invisible.
3. **`LICENSE` was left as `Copyright (c) 2026 Yan Su (Tsinghua University)`.** Naming an institution as copyright holder in an MIT header is legally muddy and unusual, but the copyright line is the author's own attribution decision and the Tsinghua affiliation is not on the forbidden list — the forbidden item was the email address specifically. Only trailing whitespace was stripped. Change it if the institutional attribution was not intended.
4. **The 996 kB workbench chunk was not split.** Real, pre-existing, and a behaviour change rather than a cleanup. Disclosed in the README.
5. **`api/` was not moved to `packages/api`.** It would be tidier alongside `packages/ahpi` and `packages/pipeline`, but it would churn Docker paths, imports, and the `sys.path` shim in `main.py` for cosmetics.
6. **No root `package.json` or pnpm workspace was added.** `packages/frontend` is self-contained with its own lockfile, which keeps `--frozen-lockfile` working on Netlify. Adding a workspace root would force a lockfile regeneration for no benefit at this size.
7. **The repository was left private.** Making it public is the author's call.
