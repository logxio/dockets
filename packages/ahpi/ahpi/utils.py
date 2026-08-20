"""
Utility functions for AHPI algorithm.
"""

from __future__ import annotations

import numpy as np
import scipy.stats as stats


class ConvergenceChecker:
    """
    Monitors convergence of iterative optimization algorithms.

    Checks convergence based on:
    1. Maximum iterations reached
    2. Kendall correlation > 0.999 between consecutive iterations
    3. Maximum absolute difference < threshold for all parameters

    Parameters
    ----------
    maximum_iterations : int
        Maximum number of iterations before forced termination
    minimum_iterations : int
        Minimum iterations before convergence checking starts
    convergence_threshold : float
        Maximum allowed absolute difference for convergence

    Examples
    --------
    >>> checker = ConvergenceChecker(maximum_iterations=100, minimum_iterations=10)
    >>> for i in range(200):
    ...     # Update parameters...
    ...     converged, iteration = checker.update(scores, privileges, valence)
    ...     if converged == 0:
    ...         break
    """

    def __init__(
        self,
        maximum_iterations: int,
        minimum_iterations: int = 10,
        convergence_threshold: float = 0.01,
    ):
        self.maximum_iterations = maximum_iterations
        self.minimum_iterations = minimum_iterations
        self.convergence_threshold = convergence_threshold

        self.old_lambdas: list[np.ndarray] = []
        self.old_epsilons: list[np.ndarray] = []
        self.old_q_s: list[np.ndarray] = []
        self.loop_number: int = 0

    def reset(self) -> None:
        """Reset the checker state."""
        self.old_lambdas = []
        self.old_epsilons = []
        self.old_q_s = []
        self.loop_number = 0

    def update(
        self,
        current_lambda: np.ndarray,
        current_epsilon: np.ndarray,
        current_q: np.ndarray,
    ) -> tuple[int, int]:
        """
        Update with current parameter values and check convergence.

        Parameters
        ----------
        current_lambda : np.ndarray
            Current entity scores
        current_epsilon : np.ndarray
            Current privilege parameters
        current_q : np.ndarray
            Current valence probabilities

        Returns
        -------
        tuple[int, int]
            (continue_flag, iteration_number)
            - continue_flag: 1 to continue, 0 to stop
            - iteration_number: current iteration count
        """
        self.loop_number += 1

        # Check maximum iterations. Report the number of iterations that actually
        # ran, not the call that tripped the cap.
        if self.loop_number > self.maximum_iterations:
            return 0, self.maximum_iterations

        # Store history
        self.old_lambdas.append(np.copy(current_lambda))
        self.old_epsilons.append(np.copy(current_epsilon))
        self.old_q_s.append(np.copy(current_q))

        # Keep only last 3 values
        if len(self.old_lambdas) > 3:
            self.old_lambdas.pop(0)
            self.old_epsilons.pop(0)
            self.old_q_s.pop(0)

        # Check minimum iterations
        if self.loop_number < self.minimum_iterations:
            return 1, self.loop_number

        # Check convergence criteria
        if len(self.old_lambdas) >= 3:
            kendall_corr = stats.kendalltau(
                self.old_lambdas[-1],
                self.old_lambdas[-2]
            )[0]

            if kendall_corr > 0.999:
                max_abs_diff_lambda = np.max(np.abs(
                    self.old_lambdas[-1] - self.old_lambdas[-2]
                ))
                max_abs_diff_epsilon = np.max(np.abs(
                    self.old_epsilons[-1] - self.old_epsilons[-2]
                ))
                max_abs_diff_q = np.max(np.abs(
                    self.old_q_s[-1] - self.old_q_s[-2]
                ))

                if (
                    max_abs_diff_lambda < self.convergence_threshold
                    and max_abs_diff_epsilon < self.convergence_threshold
                    and max_abs_diff_q < self.convergence_threshold
                ):
                    return 0, self.loop_number

        return 1, self.loop_number


def sigmoid(x: np.ndarray | float) -> np.ndarray | float:
    """
    Numerically stable sigmoid function.

    Parameters
    ----------
    x : array-like or float
        Input value(s)

    Returns
    -------
    array-like or float
        Sigmoid of input: 1 / (1 + exp(-x))
    """
    return np.where(
        x >= 0,
        1 / (1 + np.exp(-x)),
        np.exp(x) / (1 + np.exp(x))
    )


def log_likelihood(
    scores: dict[str, float],
    privileges: dict[str, float],
    valence: dict[str, float],
    interactions: list[tuple],
) -> float:
    """
    Compute the log-likelihood of the data given the model parameters.

    This can be used for model comparison or convergence monitoring.

    Parameters
    ----------
    scores : dict
        Entity name -> exp(score) mapping
    privileges : dict
        Type -> privilege value mapping
    valence : dict
        Type -> valence probability mapping
    interactions : list[tuple]
        List of (priv, unpriv, winner, val_type, priv_type)

    Returns
    -------
    float
        Total log-likelihood
    """
    ll = 0.0

    for priv, unpriv, winner, val_type, priv_type in interactions:
        if priv not in scores or unpriv not in scores:
            continue

        lambda_priv = scores[priv]
        lambda_unpriv = scores[unpriv]
        eps = privileges.get(priv_type, 0.0)
        q = valence.get(val_type, 0.5)

        # Probability that privileged wins
        p_priv_wins = (
            q * sigmoid(np.log(lambda_priv) + eps - np.log(lambda_unpriv)) +
            (1 - q) * sigmoid(np.log(lambda_unpriv) - np.log(lambda_priv) - eps)
        )

        if winner == 0:  # Privileged won
            ll += np.log(p_priv_wins + 1e-10)
        else:  # Unprivileged won
            ll += np.log(1 - p_priv_wins + 1e-10)

    return ll
