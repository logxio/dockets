# Legal Pipeline

Data processing pipeline for litigation analytics, designed to work with the AHPI ranking algorithm.

## Overview

This package provides ETL (Extract, Transform, Load) utilities for:
- Loading litigation case data
- Converting to pairwise interactions
- Running AHPI ranking algorithm
- Exporting data for frontend visualization

## Installation

```bash
# From the packages directory
pip install -e packages/pipeline

# Requires ahpi package
pip install -e packages/ahpi
```

## Quick Start

```python
from pipeline import (
    PipelineConfig,
    load_cases_df,
    cases_to_interactions,
    compute_rankings,
    export_for_frontend,
)

# Configure pipeline
config = PipelineConfig(
    data_dir="data/",
    output_dir="output/",
    demo_mode=True,  # Use smaller sample
)

# Load and process data
cases_df = load_cases_df(config)
interactions = cases_to_interactions(cases_df, config)
rankings_df, valence, privileges = compute_rankings(interactions, config)

# Export for frontend
export_for_frontend(
    interactions_df=pd.DataFrame(interactions, columns=['priv', 'unpriv', 'win_index', 'val_type', 'priv_type']),
    rankings_df=rankings_df,
    valence_probs=valence,
    privileges=privileges,
    output_dir="public/sample/",
)
```

## Configuration

### Environment Variables

```bash
# Enable demo mode (faster, smaller dataset)
export DEMO_MODE=true
export DEMO_N_CASES=1000

# Directory paths
export DATA_DIR=data/
export OUTPUT_DIR=output/

# AHPI parameters
export DEMO_MII=20
export DEMO_MIO=20
```

### Config File

```json
{
  "data_dir": "data/",
  "output_dir": "output/",
  "demo_mode": false,
  "q_factor": 60,
  "top_n_firms": 100
}
```

## Output Files

| File | Description |
|------|-------------|
| `mahari_interactions.csv` | Full pairwise interaction data |
| `mahari_exp_scores.csv` | Firm rankings with scores |
| `mahari_top50_interactions.csv` | Subgraph with top 50 firms |
| `mahari_top100_interactions.csv` | Subgraph with top 100 firms |
| `mahari_insights.json` | Pre-computed insights for Research Assistant |
| `mahari_firm_profiles.json` | Detailed firm profiles |

## License

MIT License
