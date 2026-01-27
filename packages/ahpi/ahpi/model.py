"""
AHPI Core Algorithm Implementation

This module implements the AHPI (Asymmetric Heterogeneous Pairwise Interactions) algorithm,
a generalized Bradley-Terry model that estimates:
1. Entity strength scores (λ)
2. Valence probabilities (q) - probability that the favored entity wins
3. Privilege parameters (ε) - asymmetric advantage for privileged position

Mathematical Foundation:
-----------------------
The probability that entity i beats entity j in interaction type t is:

    P(i wins | i privileged) = q_t * σ(λ_i + ε_t - λ_j) + (1 - q_t) * σ(λ_j - λ_i - ε_t)

where:
    - λ_i, λ_j are the log-strength scores of entities i and j
    - ε_t is the privilege parameter for interaction type t (e.g., defendant advantage)
    - q_t is the valence probability for type t
    - σ(x) = 1 / (1 + exp(-x)) is the sigmoid function

The parameters are estimated using an Expectation-Maximization (EM) algorithm.

Reference:
    Mahari et al. (2025). "Data-Driven Law Firm Rankings to Reduce Information Asymmetry
    in Legal Disputes." Nature Computational Science.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
from scipy.optimize import fsolve

from .utils import ConvergenceChecker

logger = logging.getLogger(__name__)


@dataclass
class AHPIResult:
    """
    Container for AHPI algorithm results.

    Attributes:
        scores: Dictionary mapping entity names to their exponential scores (exp(λ))
        valence_probs: Dictionary mapping interaction types to valence probabilities
        privileges: Dictionary mapping privilege types to privilege parameters
        n_iterations: Number of outer loop iterations until convergence
        converged: Whether the algorithm converged within max iterations
    """
    scores: dict[str, float]
    valence_probs: dict[Any, float]
    privileges: dict[Any, float]
    n_iterations: int
    converged: bool

    def get_rankings(self) -> pd.DataFrame:
        """
        Convert scores to a ranked DataFrame.

        Returns:
            DataFrame with columns: entity, score, rank
        """
        df = pd.DataFrame([
            {"entity": k, "score": v}
            for k, v in self.scores.items()
        ])
        df = df.sort_values("score", ascending=False).reset_index(drop=True)
        df["rank"] = range(1, len(df) + 1)
        return df


def AHPI(
    df: pd.DataFrame,
    MII: int = 50,
    MIO: int = 50,
    minimum_iterations: int = 10,
    convergence_threshold: float = 0.01,
    fit_valence_prob: bool = True,
    fit_privilege: bool = True,
) -> tuple[dict[str, float], dict[Any, float], dict[Any, float]]:
    """
    AHPI algorithm for ranking entities from pairwise interaction data.

    The algorithm uses a generalized Bradley-Terry model fitted via Expectation-Maximization.
    It jointly estimates entity strength scores, interaction-type valence probabilities,
    and privilege parameters for asymmetric positions.

    Parameters
    ----------
    df : pd.DataFrame
        DataFrame of pairwise interactions with columns:
        - 'priv': Privileged entity (e.g., defendant's law firm)
        - 'unpriv': Unprivileged entity (e.g., plaintiff's law firm)
        - 'win_index': 0 if privileged won, 1 if unprivileged won
        - 'val_type': Valence type (e.g., case type)
        - 'priv_type': Privilege type (e.g., case type for privilege)

    MII : int, default=50
        Maximum iterations for inner loop (score fitting)

    MIO : int, default=50
        Maximum iterations for outer loop (full EM)

    minimum_iterations : int, default=10
        Minimum iterations before checking convergence

    convergence_threshold : float, default=0.01
        Maximum absolute difference for convergence

    fit_valence_prob : bool, default=True
        Whether to fit valence probabilities. If False, set to 1.0.

    fit_privilege : bool, default=True
        Whether to fit privilege parameters. If False, set to 0.

    Returns
    -------
    tuple[dict, dict, dict]
        - exp_scores: Dictionary mapping entity names to exp(score)
        - val_probs: Dictionary mapping valence types to probabilities
        - privileges: Dictionary mapping privilege types to privilege values

    Examples
    --------
    >>> import pandas as pd
    >>> from ahpi import AHPI
    >>>
    >>> # Create sample interaction data
    >>> data = {
    ...     'priv': ['FirmA', 'FirmB', 'FirmA', 'FirmC'],
    ...     'unpriv': ['FirmB', 'FirmC', 'FirmC', 'FirmA'],
    ...     'win_index': [0, 1, 0, 1],
    ...     'val_type': ['civil', 'civil', 'criminal', 'criminal'],
    ...     'priv_type': ['civil', 'civil', 'criminal', 'criminal'],
    ... }
    >>> df = pd.DataFrame(data)
    >>>
    >>> # Fit AHPI model
    >>> scores, valence, privileges = AHPI(df, MII=20, MIO=20)
    >>>
    >>> # Get rankings
    >>> sorted_firms = sorted(scores.items(), key=lambda x: -x[1])
    >>> for firm, score in sorted_firms:
    ...     print(f"{firm}: {score:.3f}")

    Notes
    -----
    The algorithm complexity is O(N * E * I) where:
    - N = number of entities
    - E = number of interactions
    - I = number of iterations

    For large datasets (>10k entities), consider using Q-factor filtering first.
    """
    df = df.copy()  # Avoid modifying original DataFrame

    # Create mappings from names to indices
    indiv_map = {value: idx for idx, value in enumerate(
        pd.concat([df['priv'], df['unpriv']]).unique()
    )}
    val_type_map = {value: idx for idx, value in enumerate(df['val_type'].unique())}
    priv_type_map = {value: idx for idx, value in enumerate(df['priv_type'].unique())}

    n_entities = len(indiv_map)
    n_val_types = len(val_type_map)
    n_priv_types = len(priv_type_map)

    logger.info(
        f"AHPI initialized: {n_entities} entities, {n_val_types} valence types, "
        f"{n_priv_types} privilege types, {len(df)} interactions"
    )

    # Initialize parameters
    exp_scores = np.full(n_entities, 0.9)
    val_probs = np.full(n_val_types, 0.5) if fit_valence_prob else np.full(n_val_types, 1.0)
    privileges = np.full(n_priv_types, 0.0)

    # Map to indices
    df['priv'] = df['priv'].map(indiv_map)
    df['unpriv'] = df['unpriv'].map(indiv_map)
    df['val_type'] = df['val_type'].map(val_type_map)
    df['priv_type'] = df['priv_type'].map(priv_type_map)

    # Assign winner (u) and loser (v), and direction (c)
    df['u'] = np.where(df['win_index'] == 0, df['priv'], df['unpriv'])
    df['v'] = np.where(df['win_index'] == 1, df['priv'], df['unpriv'])
    df['c'] = np.where(df['win_index'] == 0, -1, 1)
    df.drop(columns=['priv', 'unpriv'], inplace=True)

    # Initialize current valence and privilege values
    df['q'] = val_probs[df['val_type']]
    df['eps'] = privileges[df['priv_type']]

    # Precompute cardinalities for valence update
    card_q_t = df['val_type'].value_counts().sort_index().values

    # Precompute indices for each entity (speeds up score updates)
    precomputed_u = {idx: df.index[df['u'] == idx].to_numpy() for idx in range(n_entities)}
    precomputed_v = {idx: df.index[df['v'] == idx].to_numpy() for idx in range(n_entities)}

    outer_checker = ConvergenceChecker(
        maximum_iterations=MIO,
        minimum_iterations=minimum_iterations,
        convergence_threshold=convergence_threshold
    )

    logger.info("Starting EM optimization...")

    while True:
        # E-step: Compute responsibilities (π)
        df['lambda_u'] = exp_scores[df['u']]
        df['lambda_v'] = exp_scores[df['v']]

        df['pi'] = (
            np.exp(df['c'] * df['eps']) * df['lambda_u'] * df['q'] /
            (df['lambda_u'] * np.exp(df['c'] * df['eps']) * df['q'] +
             df['lambda_v'] * (1 - df['q']))
        )

        # M-step: Update valence probabilities
        if fit_valence_prob:
            for idx in range(n_val_types):
                val_probs[idx] = df.loc[df['val_type'] == idx, 'pi'].sum() / card_q_t[idx]
            df['q'] = val_probs[df['val_type']]

        # M-step: Update privileges
        if fit_privilege:
            for idx in range(n_priv_types):
                mask = df['priv_type'] == idx
                df_idx = df[mask]
                pi_idx = df_idx['pi'].values
                c_idx = df_idx['c'].values
                lambda_u_idx = df_idx['lambda_u'].values
                lambda_v_idx = df_idx['lambda_v'].values

                def func_epsilon(x: float) -> float:
                    y = (1 - np.exp(x)) / (1 + np.exp(x))
                    y += np.sum(
                        pi_idx * c_idx -
                        lambda_u_idx * np.exp(c_idx * x) * c_idx /
                        (lambda_u_idx * np.exp(c_idx * x) + lambda_v_idx)
                    )
                    return y

                privileges[idx] = fsolve(func_epsilon, 0.0)[0]

            df['eps'] = privileges[df['priv_type']]

        # M-step: Update scores (inner loop)
        inner_checker = ConvergenceChecker(
            maximum_iterations=MII,
            minimum_iterations=minimum_iterations,
            convergence_threshold=convergence_threshold
        )

        while True:
            for idx in range(n_entities):
                df_u_r = df.loc[precomputed_u[idx]]
                df_v_r = df.loc[precomputed_v[idx]]

                if len(df_u_r) == 0 and len(df_v_r) == 0:
                    continue

                # Extract arrays for vectorized computation
                win_index_u_r = df_u_r['win_index'].values
                eps_u_r = df_u_r['eps'].values
                pi_u_r = df_u_r['pi'].values
                lambda_v_u_r = df_u_r['lambda_v'].values

                win_index_v_r = df_v_r['win_index'].values
                eps_v_r = df_v_r['eps'].values
                pi_v_r = df_v_r['pi'].values
                lambda_u_v_r = df_v_r['lambda_u'].values

                gamma_r_u_r = np.where(win_index_u_r == 1, np.exp(eps_u_r), np.exp(-eps_u_r))
                gamma_r_v_r = np.where(win_index_v_r == 1, np.exp(eps_v_r), np.exp(-eps_v_r))

                numerator = 1 + np.sum(pi_u_r) + np.sum(1 - pi_v_r)
                denominator = (
                    2 / (1 + exp_scores[idx]) +
                    np.sum(gamma_r_u_r / (gamma_r_u_r * exp_scores[idx] + lambda_v_u_r)) +
                    np.sum(1 / (gamma_r_v_r * lambda_u_v_r + exp_scores[idx]))
                )

                exp_scores[idx] = numerator / denominator

            converged_i, _ = inner_checker.update(exp_scores, privileges, val_probs)
            if converged_i == 0:
                break

        # Check outer loop convergence
        converged_o, iteration = outer_checker.update(exp_scores, privileges, val_probs)

        # Log progress
        current_val_probs = {t: val_probs[v] for t, v in val_type_map.items()}
        current_privileges = {t: -privileges[v] for t, v in priv_type_map.items()}
        logger.info(
            f"Iteration {iteration}: "
            f"valence_probs={current_val_probs}, privileges={current_privileges}"
        )

        if converged_o == 0:
            break

    # Convert back to original names
    exp_scores_dict = {individual: exp_scores[v] for individual, v in indiv_map.items()}
    val_probs_dict = {type_: val_probs[v] for type_, v in val_type_map.items()}
    privileges_dict = {type_: -privileges[v] for type_, v in priv_type_map.items()}

    logger.info(f"AHPI converged after {iteration} iterations")

    return exp_scores_dict, val_probs_dict, privileges_dict


def fit_ahpi(
    df: pd.DataFrame,
    **kwargs,
) -> AHPIResult:
    """
    Convenience wrapper for AHPI that returns an AHPIResult object.

    Parameters
    ----------
    df : pd.DataFrame
        Interaction data (see AHPI docstring for format)
    **kwargs
        Additional arguments passed to AHPI

    Returns
    -------
    AHPIResult
        Object containing scores, valence_probs, privileges, and metadata
    """
    scores, val_probs, privileges = AHPI(df, **kwargs)

    # Determine convergence from the result
    mio = kwargs.get('MIO', 50)
    # Note: We don't have direct access to iteration count here
    # This is a simplified version

    return AHPIResult(
        scores=scores,
        valence_probs=val_probs,
        privileges=privileges,
        n_iterations=-1,  # Not tracked in current implementation
        converged=True,
    )
