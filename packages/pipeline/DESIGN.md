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

The firm's observed record, shrunk toward the baseline for its (role, case type):

```
p = (wins + k · baseline) / (cases + k)
```

Wins come from `Winner` in the case table, counted on unique `CaseId`. The baseline is the observed win rate for that role in that case type, falling back to the role's overall rate when the cell holds fewer than 30 cases. `k` is the prior's weight in pseudo-observations.

Head-to-head rows against the named opponent are reported as a driver but never estimated from — a single firm pair almost never clears three cases. `list_evidence` is where they surface.

### What this replaced

The previous implementation read `PredDefWinProba` as P(defendant wins). It is not that. It is a per-row weight from the source extract, and at the point of use it was not merely uninformative but inverted: the shipped code assigned high win probabilities to defendants, who win 19.9% of the time.

All figures below are leave-one-out — the held-out case is subtracted from the firm's counts and from the baseline before its own outcome is predicted. Reproduce with:

```bash
python packages/pipeline/scripts/evaluate_win_rate.py
```

| Estimator | AUC | Brier | ECE |
|---|---|---|---|
| was: `mean(PredDefWinProba)` over the firm's rows | 0.194 | 0.563 | 0.619 |
| null: (role, case type) baseline, no firm data | 0.759 | 0.158 | 0.001 |
| now: shrunk empirical rate, all firms | 0.839 | 0.155 | 0.013 |
| **now: as shipped, floor n ≥ 3 — what a user sees** | **0.846** | **0.148** | **0.014** |

Read the null row before the last one. Most of that 0.846 is role: plaintiffs win 79.6% of cases in this snapshot and defendants 19.9%, so knowing only which side a firm is on already scores 0.759. The firm's own record adds **+0.088 AUC** on top. That is a real and useful margin, and it is not the same claim as "this model predicts litigation outcomes."

### Choosing k

`k = 15`. Not tuned — estimated. Method-of-moments empirical Bayes on the snapshot fits a Beta-Binomial prior of k = 13.5 for plaintiff-side records and k = 15.9 for defendant-side; 15 sits between them.

The number barely matters, which is the more useful fact:

| k | 0 | 2 | 5 | 10 | 15 | 20 | 30 | 50 |
|---|---|---|---|---|---|---|---|---|
| AUC | 0.819 | 0.838 | 0.840 | 0.840 | 0.839 | 0.838 | 0.837 | 0.835 |
| ECE | 0.067 | 0.031 | 0.014 | 0.011 | 0.013 | 0.015 | 0.015 | 0.017 |

Anything in [5, 50] lands within 0.005 AUC of the best. Only k = 0 — no shrinkage at all — is clearly wrong, and it is wrong on calibration (ECE 0.067) more than on ranking.

### Choosing the floor

`min_cases = 3`, below which the signal returns `null` and `confidence: "unknown"`.

The floor is not about accuracy, it is about what the number means. At k = 15 a firm with two cases contributes 2/(2+15) = 12% of its own estimate; the other 88% is the baseline. Reporting that as "this firm's predicted win rate" attaches a population average to a name.

| prior cases | observations | AUC | AUC of baseline alone | lift | firm's weight |
|---|---|---|---|---|---|
| 0 | 1,442 | 0.755 | 0.755 | +0.000 | 0% |
| 1 | 646 | 0.827 | 0.755 | +0.072 | 6% |
| 2 | 444 | 0.789 | 0.750 | +0.040 | 12% |
| 3–4 | 626 | 0.856 | 0.779 | +0.077 | 19% |
| 5–9 | 865 | 0.836 | 0.739 | +0.097 | 32% |
| 10+ | 1,985 | 0.825 | 0.743 | +0.082 | 57% |

At n = 0 the lift is exactly zero by construction. The n = 1 and n = 2 rows are unstable against each other; from n = 3 the lift settles in the +0.08 range and stays there.

The cost is coverage: **77.7% of firm-roles return `unknown`**, and 57.9% of observations are the ones a user would actually be shown a number for. That is the honest shape of this snapshot, where the median firm-role appears in a single case.

### Calibration by case type

Floor applied, predicted mean against observed frequency:

| case type | observations | predicted | observed | gap | AUC |
|---|---|---|---|---|---|
| civil_rights | 383 | 0.466 | 0.470 | −0.004 | 0.776 |
| contract | 395 | 0.468 | 0.476 | −0.008 | 0.863 |
| labor | 163 | 0.443 | 0.448 | −0.004 | 0.760 |
| other | 2,249 | 0.476 | 0.476 | +0.001 | 0.830 |
| prisoner_petitions | 49 | 0.439 | 0.408 | +0.031 | 0.778 |
| torts | 220 | 0.364 | 0.341 | +0.023 | 0.986 |
| real_property | 17 | — | — | — | too few to score |

No case type is off by more than 3.1 points. `torts` at AUC 0.986 is 220 observations and should be read as a small-sample artefact, not as the model being near-perfect on torts.

### What the top of the AHPI ranking does now

The eight single-case firms that sit in the ranking's top ten return `unknown` instead of a number:

| rank | firm | role | cases | raw | shrunk | shown |
|---|---|---|---|---|---|---|
| 1 | thornton & naumes | plaintiff | 3 | 0.33 | 0.72 | yes |
| 2 | campbell & levine | plaintiff | 1 | 0.00 | 0.75 | unknown |
| 3 | edward t. joyce & associates | plaintiff | 1 | 0.00 | 0.75 | unknown |
| 4 | baldridge venable | defendant | 1 | 1.00 | 0.25 | unknown |
| 5 | hopgood, calimafde, kalil, blaustein & judlowe | defendant | 1 | 1.00 | 0.25 | unknown |
| 6 | minerva law | defendant | 1 | 1.00 | 0.25 | unknown |
| 7 | hamilton brook smith & reynolds | defendant | 5 | 0.80 | 0.35 | yes |
| 8 | corrie yackulic law firm | plaintiff | 1 | 0.00 | 0.75 | unknown |
| 9 | perdue kidd & vickery | plaintiff | 1 | 0.00 | 0.75 | unknown |
| 10 | vickery & waldner | plaintiff | 1 | 0.00 | 0.75 | unknown |

Note what this does and does not fix. The Matters view no longer attaches invented win rates to firms it has barely seen. **Their position in the ranking table is unchanged** — that comes from the AHPI estimator, which is separately unregularized, and adding a prior there is a different change against a different model.

### What the caller gets back

`predictedWinRatePct` is `null` below the floor. `winRateLiftPct` is in percentage points against `baselineWinRatePct`, not against a constant. `meta.evidenceWeightPct` reports how much of the estimate is the firm's own record, so a number resting mostly on the baseline says so rather than looking the same as one resting on 50 cases. Both `limitations` entries — "estimate is mostly baseline, not this firm's record" and "fewer than 3 observed cases" — are emitted by the estimator, not written into the UI.

### What is still confounded

The firm effect is predictive, not causal. Plaintiff-side class-action firms select cases they expect to win, so part of what the estimator picks up is case selection rather than advocacy. It answers "how have matters like this, with this firm on this side, resolved" — not "what does hiring this firm do to my odds." Nothing in this snapshot can separate those.

## Evidence retrieval

`list_evidence(kb, case_type=, firm=, role=, opponent_firm=, limit=)`

Three tiers, in order:

1. Head-to-head — this firm against this opponent
2. Firm-involved — same firm, comparable case type
3. Case-type only — the surrounding population, which is what a baseline claim needs

Each row carries `caseId`, `year`, `caseType`, `outcome`, and why it was pulled. The point is that the user's first screen is the five most relevant cases, not a filter UI.

## Metrics on the card

Three numbers and one label, no more:

- Predicted win rate — `null` below the floor, never a raw 0% or 100%
- Evidence cases — unique `CaseId` count
- Win rate lift — percentage points against baseline
- Confidence — `high` / `medium` / `low` / `unknown` from sample size, always shown

The decision pack expands this into drivers, limitations, and the full evidence table.

## Scoped, not built

- **Shrinkage in the AHPI fit.** The win-rate signal now shrinks; the ranking estimator does not, which is why single-case firms still hold the top of the table.
- **Cost.** `cost` comes back `{hourly_rate_usd: None, alt_fee: None, source: "unknown"}`. The snapshot has no rate data and none is inferred.
- **Court and jurisdiction fit.** The `Court` column is empty for every row in the sample, so there is nothing to match on.
- **Rerank.** The signals are computed and displayed but not yet folded back into the ordering; ranking is evidence count then global rank.

## Evaluating this offline

Everything runs against the snapshot, no network:

```bash
python packages/pipeline/scripts/evaluate_win_rate.py   # regenerates every table above
pytest packages/pipeline/tests                          # the guards below
```

`tests/test_matter_signals.py` holds the regressions that matter: every firm-role with 1–3 cases must produce a rate strictly between 0% and 100%; the estimate must sit between the raw rate and the baseline; a stronger prior must move it toward the baseline; and the leave-one-out AUC must stay above 0.83 and beat the baseline-only null by more than 0.05. That last one fails loudly if the estimator quietly stops using the firm's record.

Still worth adding: NDCG@3 and Hit@3 on the shortlist itself rather than on the win-rate signal, and Top-3 stability across seeds and splits — a shortlist that reshuffles between runs is not a shortlist.
