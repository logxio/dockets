# AHPI - Asymmetric Heterogeneous Pairwise Interactions

An independent Python implementation of the AHPI algorithm for ranking entities from pairwise comparison data, particularly suited for legal outcome analysis. The method is from Mahari et al. (2025), cited below; this code is not theirs and is not affiliated with them.

## Overview

AHPI extends the classic Bradley-Terry model to handle:
- **Asymmetric positions**: Different roles (e.g., plaintiff vs defendant) with position-specific advantages
- **Heterogeneous interactions**: Multiple interaction types (e.g., case types) with different dynamics
- **Valence probabilities**: Probability that the "favored" entity actually wins

## Installation

From the repository root:

```bash
pip install -e packages/ahpi

# with test dependencies
pip install -e "packages/ahpi[dev]"
```

## Quick Start

```python
import pandas as pd
from ahpi import AHPI, AHPIResult

# Create interaction data
data = pd.DataFrame({
    'priv': ['FirmA', 'FirmB', 'FirmA', 'FirmC'],      # Privileged position (defendant)
    'unpriv': ['FirmB', 'FirmC', 'FirmC', 'FirmA'],    # Unprivileged position (plaintiff)
    'win_index': [0, 1, 0, 1],                          # 0 = priv won, 1 = unpriv won
    'val_type': ['civil', 'civil', 'criminal', 'criminal'],
    'priv_type': ['civil', 'civil', 'criminal', 'criminal'],
})

# Fit the model
scores, valence_probs, privileges = AHPI(data, MII=50, MIO=50)

# Get rankings
rankings = sorted(scores.items(), key=lambda x: -x[1])
for rank, (firm, score) in enumerate(rankings, 1):
    print(f"{rank}. {firm}: {score:.3f}")
```

## Mathematical Foundation

The probability that entity $i$ (in privileged position) beats entity $j$ is:

$$P(i \text{ wins}) = q_t \cdot \sigma(\lambda_i + \varepsilon_t - \lambda_j) + (1-q_t) \cdot \sigma(\lambda_j - \lambda_i - \varepsilon_t)$$

Where:
- $\lambda_i, \lambda_j$ are log-strength scores
- $\varepsilon_t$ is the privilege parameter for interaction type $t$
- $q_t$ is the valence probability
- $\sigma(x) = 1/(1+e^{-x})$ is the sigmoid function

## API Reference

### Core Functions

#### `AHPI(df, MII=50, MIO=50, ...)`
Main algorithm function. Returns `(scores, valence_probs, privileges)`.

#### `fit_ahpi(df, **kwargs)`
Convenience wrapper returning an `AHPIResult` — same numbers, plus `n_iterations` and `converged` so you can tell a converged fit from one that hit the iteration ceiling.

### Preprocessing

#### `convert_to_interactions(cases_df, ...)`
Convert case-level data to pairwise interactions.

#### `q_factor_filter(interactions, q=1.0)`
Filter interactions to achieve target Q-factor.

#### `normalize_firm_names(names, threshold=0.85)`
Fuzzy-match and normalize entity names.

### Evaluation

#### `prediction_accuracy(test_df, scores, privileges, valence)`
Compute prediction accuracy on held-out data.

#### `cross_validate(interactions, n_folds=5, ...)`
K-fold cross-validation.

## Caveats

There is no regularization. Entities with one or two observations reach extreme scores, and `fsolve` on a sparse interaction type will walk `ε` toward the boundary. Filter by observation count, or add a prior, before treating the top of a ranking as meaningful.

## Reference

```
Mahari et al. (2025). "Data-Driven Law Firm Rankings to Reduce Information Asymmetry
in Legal Disputes." Nature Computational Science.
arXiv: https://arxiv.org/abs/2408.16863v2
```

## License

MIT License
