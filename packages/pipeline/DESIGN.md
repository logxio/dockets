# Matter signals: design notes

How `pipeline.matter_signals` turns a matter brief into a ranked shortlist of firms, and what it returns when the data cannot support an answer.

The target behaviour: a user uploads a complaint, confirms the extracted fields, and gets three recommended firms — each with one sentence of justification and an evidence list they can open. Anything the snapshot cannot support has to come back as `unknown` rather than a plausible-looking number.

## What the offline snapshot gives us

Phase 1 runs entirely off the exported sample, no external calls:

| File | Contents |
|------|----------|
| `mahari_exp_scores.csv` | Global firm ranking (`Rank`, `Firm`, `Score`, `ExpScore`) |
| `mahari_fig2_moesm4_interactions.csv` | Pairwise rows (`CaseId`, `PlaintiffFirm`, `DefendantFirm`, `CaseType`, `PredDefWinProba`, `Year`) |
| `mahari_fig2_moesm4_cases.csv` | Case-level table (`CaseId`, `CaseType`, `Year`, `Winner`; `0` = plaintiff win, `1` = defendant win) |

Two conventions hold throughout:

- `FirmKey` is `normalize_label(Firm)` — lowercased, trimmed, whitespace collapsed. It is the join key everywhere.
- Evidence counts are **unique `CaseId`**, never row counts. The interactions table expands one case into a row per firm pair, so counting rows inflates a four-firm case into six.

## Candidate generation

`recommend_candidates(kb, case_type=, role=, limit=)`

1. Take the top 2000 firms by global rank as the pool. Bounding it keeps the annotation step cheap and the output stable across runs.
2. Count evidence cases per `(FirmKey, role, caseType)`.
3. Sort by evidence count descending, global rank ascending as tiebreak.

Evidence-first ordering is deliberate. Global rank alone puts one-case firms at the top (see *Limits* in the root README), which is useless for someone actually choosing counsel.

Output is Top 3 expanded, Top 20 collapsed.

## Outcome signal

`compute_candidate_outcome_signal(kb, firm=, role=, case_type=, opponent_firm=)`

Prefers head-to-head rows against the named opponent, falls back to all rows for that firm, filters by case type when one is given. Returns predicted win rate, lift against a baseline, a confidence bucket derived from sample size, and the drivers and limitations behind the number.

**The signal reads `PredDefWinProba` as P(defendant wins). On this data, it is not that.**

- Mean `PredDefWinProba` is 0.814. The observed defendant win rate is 0.204.
- Split by actual outcome, the column barely moves: 0.817 mean on plaintiff wins, 0.800 on defendant wins.
- AUC against the real `Winner` label is 0.455 — below chance.

The column does not discriminate outcomes. It is a per-row weight from the source extract, not a calibrated prediction. The hardcoded `baseline_defendant_win_rate_pct=83` default lines up with the column's own mean rather than with observed outcomes, which hides the mismatch instead of surfacing it — the lift figure comes out small and plausible either way.

The replacement is specified: an empirical win rate from `Winner`, shrunk toward the case-type base rate, with `unknown` below a sample-size floor. Until it lands, the Matters UI is surfacing the upstream column, not a fitted prediction.

## Evidence retrieval

`list_evidence(kb, case_type=, firm=, role=, opponent_firm=, limit=)`

Three tiers, in order:

1. Head-to-head — this firm against this opponent
2. Firm-involved — same firm, comparable case type
3. Case-type only — the surrounding population, which is what a baseline claim needs

Each row carries `caseId`, `year`, `caseType`, `outcome`, and why it was pulled. The point is that the user's first screen is the five most relevant cases, not a filter UI.

## Metrics on the card

Three numbers and one label, no more:

- Predicted win rate — see the `PredDefWinProba` finding above
- Evidence cases — unique `CaseId` count
- Win rate lift — percentage points against baseline
- Confidence — `high` / `medium` / `low` / `unknown` from sample size, always shown

The decision pack expands this into drivers, limitations, and the full evidence table.

## Scoped, not built

- **Shrinkage.** No prior anywhere, so a firm at n=1 can report 0% or 100%. Highest-value change on this list.
- **Cost.** `cost` comes back `{hourly_rate_usd: None, alt_fee: None, source: "unknown"}`. The snapshot has no rate data and none is inferred.
- **Court and jurisdiction fit.** The `Court` column is empty for every row in the sample, so there is nothing to match on.
- **Rerank.** The signals are computed and displayed but not yet folded back into the ordering; ranking is evidence count then global rank.

## Evaluating this offline

Everything below runs against the snapshot with no network:

- Probability quality — Brier score, log loss, ECE for calibration. The `PredDefWinProba` problem above is exactly what a calibration check catches first.
- Ranking quality — NDCG@3 and Hit@3 against realized outcomes.
- Stability — Top 3 agreement across seeds and splits. A shortlist that reshuffles between runs is not a shortlist.

Regression tests worth keeping: `normalize_label` and `FirmKey` mapping stay stable; evidence counts stay on unique `CaseId`; once shrinkage exists, n ∈ {1, 2, 3} must never produce 0% or 100%.
