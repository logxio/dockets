"""
Evaluation utilities for AHPI model.

Functions for computing prediction accuracy and model performance metrics.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

from .preprocessing import balance_dataframe

logger = logging.getLogger(__name__)


def prediction_accuracy(
    test_interactions: pd.DataFrame,
    scores: pd.Series | dict[str, float],
    privileges: dict[Any, float],
    valence: dict[Any, float],
    balancing: bool = False,
    included_intervals: list[tuple[float, float]] | None = None,
    aggregate_by_case: bool = False,
    case_id_col: str = "id_number",
) -> dict[str, float]:
    """
    Compute prediction accuracy of fitted AHPI parameters on test data.

    Uses the generalized Bradley-Terry model to predict outcomes:
    1. Shift defendant score by privilege (based on case type)
    2. Apply logistic function to score difference
    3. Weight by valence probability

    Parameters
    ----------
    test_interactions : pd.DataFrame
        Test data with columns: 'def', 'pla', 'case_type', 'winner' (0=def won, 1=pla won)
    scores : pd.Series or dict
        Fitted entity scores (index/key = entity name, value = score)
    privileges : dict
        Case type -> privilege value mapping
    valence : dict
        Case type -> valence probability mapping
    balancing : bool
        Whether to balance test data (equal win rates)
    included_intervals : list[tuple], optional
        Only evaluate predictions within these probability intervals
    aggregate_by_case : bool
        If True, average predictions per case before computing accuracy
    case_id_col : str
        Column name for case identifier (used when aggregate_by_case=True)

    Returns
    -------
    dict[str, float]
        Dictionary containing:
        - accuracy: Overall prediction accuracy
        - excess_accuracy: Accuracy improvement over baseline
        - defendant_win_rate: Baseline win rate for defendants
        - n_test_cases: Number of test cases used
        - interval_win_rate: Win rate within specified intervals

    Examples
    --------
    >>> scores = pd.Series({'FirmA': 1.5, 'FirmB': 0.8, 'FirmC': 1.2})
    >>> priv = {'civil': 0.1}
    >>> val = {'civil': 0.55}
    >>> test = pd.DataFrame({
    ...     'def': ['FirmA', 'FirmB'],
    ...     'pla': ['FirmB', 'FirmC'],
    ...     'case_type': ['civil', 'civil'],
    ...     'winner': [0, 1]
    ... })
    >>> results = prediction_accuracy(test, scores, priv, val)
    >>> print(f"Accuracy: {results['accuracy']:.2%}")
    """
    if included_intervals is None:
        included_intervals = [(0.0, 1.0)]

    # Convert scores to Series if dict
    if isinstance(scores, dict):
        scores = pd.Series(scores)

    test_df = test_interactions.copy()

    def compute_winning_proba(row: pd.Series) -> float:
        """Compute predicted winning probability for defendant."""
        firm_def = row['def']
        firm_pla = row['pla']
        case_type = row['case_type']

        if firm_def not in scores.index or firm_pla not in scores.index:
            return np.nan

        score_def = scores.loc[firm_def]
        score_pla = scores.loc[firm_pla]
        privilege = privileges.get(case_type, 0.0)
        q = valence.get(case_type, 0.5)

        # Score difference with privilege adjustment
        diff = (score_def + privilege) - score_pla

        # Probability defendant is favored (logistic)
        prob_favoured = 1 / (1 + np.exp(-diff))

        # Full winning probability accounting for valence
        full_winning_prob = prob_favoured * q + (1 - prob_favoured) * (1 - q)

        return full_winning_prob

    # Compute predictions
    test_df['predict_proba'] = test_df.apply(compute_winning_proba, axis=1)
    logger.info(f"Computed predictions for {len(test_df)} test interactions")

    # Compute baseline defendant win rate
    if aggregate_by_case and case_id_col in test_df.columns:
        defendant_win_rate = (
            test_df.groupby(case_id_col)['winner'].mean() == 0
        ).mean()
    elif balancing:
        defendant_win_rate = 0.5
    else:
        defendant_win_rate = (test_df['winner'] == 0).mean()

    # Remove rows without predictions
    test_df = test_df.dropna(subset=['predict_proba'])

    if len(test_df) == 0:
        logger.warning("No valid predictions after filtering")
        return {
            'accuracy': np.nan,
            'excess_accuracy': np.nan,
            'defendant_win_rate': defendant_win_rate,
            'n_test_cases': 0,
            'interval_win_rate': np.nan,
        }

    # Aggregate by case if requested
    if aggregate_by_case and case_id_col in test_df.columns:
        test_df = test_df.groupby(case_id_col, as_index=False)[
            ['predict_proba', 'winner']
        ].mean()

    # Balance if requested
    if balancing:
        test_df = balance_dataframe(test_df, 'winner')

    # Filter to included intervals
    def is_in_intervals(x: float) -> bool:
        return any(lower <= x <= upper for lower, upper in included_intervals)

    filtered_df = test_df[test_df['predict_proba'].apply(is_in_intervals)].copy()

    if len(filtered_df) == 0:
        logger.warning(f"No predictions in intervals {included_intervals}")
        return {
            'accuracy': np.nan,
            'excess_accuracy': np.nan,
            'defendant_win_rate': defendant_win_rate,
            'n_test_cases': 0,
            'interval_win_rate': np.nan,
        }

    # Compute metrics
    filtered_df['predicted_winner'] = (filtered_df['predict_proba'] >= 0.5).astype(int)

    # Accuracy: predicted_winner matches actual (0=def won)
    # predicted_winner=1 means we predict plaintiff wins (defendant loses)
    # winner=0 means defendant won, winner=1 means plaintiff won
    # So correct when predicted_winner == winner (both are 1=plaintiff or 0=defendant)
    # But the code says predicted_winner == (1 - winner) for correctness
    # This means: predict 0 (def wins) and winner=0 (def won) -> correct
    #            predict 1 (pla wins) and winner=1 (pla won) -> correct
    correct = (filtered_df['predicted_winner'] == (1 - filtered_df['winner']))
    accuracy = correct.mean()

    # Excess accuracy over baseline
    excess_accuracy = (
        correct.astype(float)
        - defendant_win_rate * (filtered_df['predicted_winner'] == 1).astype(float)
        + (defendant_win_rate - 1) * (filtered_df['predicted_winner'] == 0).astype(float)
    ).mean()

    # Win rate within interval
    interval_win_rate = 1 - filtered_df['winner'].mean()

    return {
        'accuracy': accuracy,
        'excess_accuracy': excess_accuracy,
        'defendant_win_rate': defendant_win_rate,
        'n_test_cases': len(filtered_df),
        'interval_win_rate': interval_win_rate,
    }


def cross_validate(
    interactions: pd.DataFrame,
    n_folds: int = 5,
    random_state: int = 42,
    **ahpi_kwargs,
) -> dict[str, list[float]]:
    """
    Perform k-fold cross-validation for AHPI model.

    Parameters
    ----------
    interactions : pd.DataFrame
        Full interaction data
    n_folds : int
        Number of cross-validation folds
    random_state : int
        Random seed for fold splitting
    **ahpi_kwargs
        Additional arguments passed to AHPI

    Returns
    -------
    dict[str, list[float]]
        Lists of metrics for each fold
    """
    from sklearn.model_selection import KFold
    from .model import AHPI

    kf = KFold(n_splits=n_folds, shuffle=True, random_state=random_state)

    results = {
        'accuracy': [],
        'excess_accuracy': [],
        'n_test': [],
    }

    for fold, (train_idx, test_idx) in enumerate(kf.split(interactions)):
        train_df = interactions.iloc[train_idx]
        test_df = interactions.iloc[test_idx]

        # Fit on training data
        scores, val_probs, privileges = AHPI(train_df, **ahpi_kwargs)

        # Convert scores to Series
        scores_series = pd.Series(scores)

        # Prepare test data
        test_eval = test_df.copy()
        test_eval = test_eval.rename(columns={
            'priv': 'def',
            'unpriv': 'pla',
            'val_type': 'case_type',
            'win_index': 'winner',
        })

        # Evaluate
        metrics = prediction_accuracy(
            test_eval,
            scores_series,
            privileges,
            val_probs,
        )

        results['accuracy'].append(metrics['accuracy'])
        results['excess_accuracy'].append(metrics['excess_accuracy'])
        results['n_test'].append(metrics['n_test_cases'])

        logger.info(
            f"Fold {fold + 1}/{n_folds}: "
            f"accuracy={metrics['accuracy']:.3f}, "
            f"excess={metrics['excess_accuracy']:.3f}"
        )

    return results


def compute_ranking_stability(
    interactions: pd.DataFrame,
    n_bootstrap: int = 100,
    sample_frac: float = 0.8,
    random_state: int = 42,
    **ahpi_kwargs,
) -> pd.DataFrame:
    """
    Compute ranking stability via bootstrap resampling.

    Parameters
    ----------
    interactions : pd.DataFrame
        Interaction data
    n_bootstrap : int
        Number of bootstrap samples
    sample_frac : float
        Fraction of data to sample each iteration
    random_state : int
        Random seed
    **ahpi_kwargs
        Arguments passed to AHPI

    Returns
    -------
    pd.DataFrame
        DataFrame with mean rank, std, and confidence intervals per entity
    """
    from .model import AHPI

    np.random.seed(random_state)
    all_rankings = []

    for i in range(n_bootstrap):
        # Bootstrap sample
        sample = interactions.sample(frac=sample_frac, replace=True)

        try:
            scores, _, _ = AHPI(sample, **ahpi_kwargs)
            ranking = pd.Series(scores).rank(ascending=False)
            all_rankings.append(ranking)
        except Exception as e:
            logger.warning(f"Bootstrap {i} failed: {e}")
            continue

    if not all_rankings:
        raise ValueError("All bootstrap samples failed")

    # Combine rankings
    rankings_df = pd.DataFrame(all_rankings)

    # Compute statistics
    stability = pd.DataFrame({
        'mean_rank': rankings_df.mean(),
        'std_rank': rankings_df.std(),
        'rank_5pct': rankings_df.quantile(0.05),
        'rank_95pct': rankings_df.quantile(0.95),
    })

    stability = stability.sort_values('mean_rank')
    stability['stability_score'] = 1 / (1 + stability['std_rank'])

    return stability
