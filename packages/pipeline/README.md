# Pipeline

ETL between raw litigation data and everything downstream of it: the AHPI estimator, the API, and the frontend's sample files. Also parses intake documents into a structured matter brief.

Design notes for the recommendation side, including a live correctness bug worth knowing about, are in [DESIGN.md](DESIGN.md).

## Install

From the repository root:

```bash
pip install -e packages/ahpi -e packages/pipeline
```

`ahpi` first — this package depends on it.

## Ranking export

```python
import pandas as pd
from pipeline import (
    PipelineConfig,
    load_cases_df,
    cases_to_interactions,
    compute_rankings,
    export_for_frontend,
)

config = PipelineConfig(data_dir="data/", output_dir="output/", demo_mode=True)

cases_df = load_cases_df(config)
interactions = cases_to_interactions(cases_df, config)
rankings_df, valence, privileges = compute_rankings(interactions, config)

export_for_frontend(
    interactions_df=pd.DataFrame(
        interactions,
        columns=["priv", "unpriv", "win_index", "val_type", "priv_type"],
    ),
    rankings_df=rankings_df,
    valence_probs=valence,
    privileges=privileges,
    output_dir="packages/frontend/public/sample/",
)
```

Written to `output_dir`, all prefixed `mahari_` by default:

| File | |
|------|--|
| `mahari_interactions.csv` | Full pairwise interactions |
| `mahari_exp_scores.csv` | Firm rankings with scores |
| `mahari_case_type_params.csv` | Fitted valence probability per case type |
| `mahari_top50_interactions.csv` | Subgraph, top 50 firms |
| `mahari_top100_interactions.csv` | Subgraph, top 100 firms |
| `mahari_insights.json` | Precomputed insights |
| `mahari_firm_profiles.json` | Per-firm opponents, case types, evidence |

## Matter signals

Everything here reads the exported snapshot; no network calls.

```python
from pipeline import OfflineKB, recommend_candidates, list_evidence

kb = OfflineKB(sample_dir="packages/frontend/public/sample/")

firms = recommend_candidates(kb, case_type="contract", role="defendant", limit=20)
cases = list_evidence(kb, case_type="contract", firm=firms[0]["firm"], role="defendant")
```

`recommend_candidates` orders by evidence count within the `(case_type, role)` slice, with global rank as tiebreak. `list_evidence` returns head-to-head cases first, then firm-involved, then case-type-only.

## Document parsing

```python
from pipeline import parse_text_to_brief, extract_text_from_pdf_bytes

brief = parse_text_to_brief(open("complaint.md").read())
# or
brief = parse_text_to_brief(extract_text_from_pdf_bytes(open("complaint.pdf", "rb").read()))
```

Pulls court, case type, party role, opposing counsel, budget, and notes out of a complaint or intake email, and returns a `ParsedBrief` dataclass with a `warnings` list for anything it could not resolve. Scanned PDFs fall back to an OCR pass. Every field is confirmed by the user in the UI before it is used — the parser is a prefill, not an authority.

## Configuration

`PipelineConfig` fields:

| Field | Env | Default |
|-------|-----|---------|
| `data_dir` | `DATA_DIR` | `data/` |
| `output_dir` | `OUTPUT_DIR` | `output/` |
| `demo_mode` | `DEMO_MODE` | `false` |
| `demo_n_cases` | `DEMO_N_CASES` | `1000` |
| `q_factor` | `Q_FACTOR` | `60`, or `10` in demo mode |
| `top_n_firms` | `TOP_N_FIRMS` | `100` |
| `ahpi_params.MII` | `DEMO_MII` | `50`, `20` in demo mode |
| `ahpi_params.MIO` | `DEMO_MIO` | `50`, `20` in demo mode |

Environment variables are read by `PipelineConfig.from_env()`; the constructor defaults ignore them. `from_json(path)` and `to_json(path)` round-trip the same fields.

## Tests

```bash
pytest packages/pipeline/tests
```
