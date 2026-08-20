# Legal Intelligence Workbench

Law firm rankings computed from case outcomes instead of reputation surveys, and the instrument for auditing them.

The model is a reimplementation of AHPI (Mahari et al., *Nature Computational Science*, 2025): treat every lawsuit as a pairwise contest between plaintiff counsel and defendant counsel, then fit firm strengths by EM alongside a per-case-type advantage for the defendant side. Run it on the paper's sample — 1,284 US federal civil cases, 1,966 firms, 2013–2018 — and the resulting order looks nothing like a Chambers table. Kirkland & Ellis lands at #878. Morrison & Foerster at #1541.

That reordering is the headline, and it does not survive contact with the evidence counts. Eight of the top ten firms appear in exactly one case; the median for the top 20 is 1.5. The estimator carries no prior, so a firm that wins its only lawsuit outscores every firm with a real track record. The fitted per-case-type parameters show the same thing from the other end: valence probabilities settle on 0.9999999 or 4e-41, and `real_property` — six cases — draws a privilege term of +3.94. Unregularized MLE walking to the boundary on sparse strata.

Which is why the workbench is the deliverable and the ranking is an input to it. Every score carries its evidence count, every claim drills to the case IDs behind it, and a null-control pass re-fits on randomized outcomes to show how much of a pattern is real. A ranking you can interrogate beats a ranking you have to trust.

<p align="center">
  <img src="./docs/demo1.GIF" alt="Network view: plaintiff-defendant graph with evidence drill-down" width="100%">
  <img src="./docs/demo2.GIF" alt="Rankings and report views" width="100%">
</p>

## The model

For firms *i* (privileged position) and *j* in a case of type *t*:

```
P(i wins) = q_t · σ(λ_i + ε_t − λ_j) + (1 − q_t) · σ(λ_j − λ_i − ε_t)
```

- `λ` — log-strength per firm, the thing that becomes the ranking
- `ε_t` — positional advantage for the defendant side, fitted per case type
- `q_t` — valence: how often the favored side actually wins in type *t*
- `σ` — logistic

Fitting is EM. The E-step computes responsibilities; the M-step updates `q` in closed form, solves `ε` with `fsolve`, and updates `λ` in an inner minorization loop. Convergence needs Kendall τ > 0.999 between consecutive iterations *and* max absolute parameter change under threshold, with a floor on minimum iterations so it cannot stop on an early plateau. See [`packages/ahpi/ahpi/model.py`](packages/ahpi/ahpi/model.py).

The mixture over `q_t` is what separates this from plain Bradley-Terry: a case type where the stronger firm wins 55% of the time and one where it wins 95% produce very different score spreads, and the model fits that rather than assuming it.

## Repo map

| Path | What it is |
|------|------------|
| [`packages/ahpi`](packages/ahpi) | The estimator. EM fit, cross-validation, prediction accuracy. No web dependencies. |
| [`packages/pipeline`](packages/pipeline) | ETL. Cases → pairwise interactions, Q-factor filtering, firm-name normalization, export to the formats the frontend reads. Also parses intake documents (PDF/Markdown) into a structured matter brief. |
| [`api`](api) | FastAPI. Fit, predict, counterfactual, and the matter workflow endpoints. |
| [`packages/frontend`](packages/frontend) | React 19 + Vite + Cytoscape. Two entry points: `workbench.html` is the analysis app, `index.html` is a scripted demo deck that hands off into it. |

## Running it

The workbench alone, on the bundled sample data — no backend needed:

```bash
pnpm -C packages/frontend install && pnpm -C packages/frontend dev
```

`http://127.0.0.1:5173/workbench.html` for the analysis app, `/` for the demo deck.

The matter workflow (document intake, firm recommendations, decision pack) needs the API:

```bash
pip install -e packages/ahpi -e packages/pipeline -e api
uvicorn app.main:app --app-dir api --port 8001
```

The Vite dev server proxies `/api` to port 8001, falling back to 8000. Set `VITE_API_PROXY_TARGET` to override.

Whole stack behind nginx:

```bash
docker compose up --build
```

### LLM panel

The report view can send filtered rows to an OpenAI-compatible endpoint and require every claim to cite a RowId. Point `VITE_LLM_API_URL` at your endpoint; leave it empty and it falls back to a deterministic mock that reads the same injected CSV, so the loop is demonstrable without a key. `VITE_LLM_FORCE_MOCK=true` pins mock mode.

## The dataset

`packages/frontend/public/sample/` ships the Fig. 2 extract from the paper: 14,797 interaction rows over 1,284 cases. Bring your own CSV/TSV through the import panel — the column mapper needs a plaintiff firm and a defendant firm, and will use case type, court, outcome, and weight if present.

Two things to know before reading anything off the sample. Outcomes are 79.6% plaintiff wins at the case level, so a global fit is largely fitting one class; the QC panel flags this and suggests stratifying. And the `Court` column is empty for every row, so the court filter has nothing to work with — court-level stratification needs a different extract.

## Limits

Where the numbers stop, and what closes each gap.

- **No prior in the fit.** One- and two-case firms reach extreme scores, which is what puts the top of the ranking where it is. Sorting by evidence count gives a usable table today; a Beta prior on `q` and an L2 penalty on `λ` fix it at the source.
- **Settlements are unobserved.** Every case in the data has a winner. Most litigation does not end that way, so the fit describes cases that reached judgment, not the market.
- **The Matters win rate is a passthrough.** It carries the source extract's `PredDefWinProba` column, which scores AUC 0.455 against the actual winner — that column is a selection weight, not a fitted prediction. The replacement, an empirical rate shrunk toward the case-type base, is specified in [`packages/pipeline/DESIGN.md`](packages/pipeline/DESIGN.md).
- **One 996 kB workbench chunk.** Cytoscape plus Recharts. Splitting it is build configuration, not a rewrite.
- **Matter state is in-process.** The API holds matters and fits in memory; there is no persistence layer, so a restart clears them.

## Reference

The method is Mahari et al.; this implementation is independent of the authors.

Mahari, R., et al. (2025). *Data-Driven Law Firm Rankings to Reduce Information Asymmetry in Legal Disputes.* Nature Computational Science. [arXiv:2408.16863](https://arxiv.org/abs/2408.16863v2)

## License

MIT. See [LICENSE](LICENSE).
