"""
AHPI (Asymmetric Heterogeneous Pairwise Interactions)

A generalized Bradley-Terry model for ranking entities from pairwise comparison data.
Particularly suited for legal outcome analysis where plaintiff-defendant asymmetry exists.

This is an independent reimplementation of the method described in:
    Mahari et al. (2025). "Data-Driven Law Firm Rankings to Reduce Information Asymmetry
    in Legal Disputes." Nature Computational Science.
    arXiv: https://arxiv.org/abs/2408.16863v2
"""

from .model import AHPI, AHPIResult, fit_ahpi
from .preprocessing import (
    convert_to_interactions,
    q_factor_filter,
    balance_dataframe,
    normalize_firm_names,
    create_interaction_dataframe,
    sample_interactions,
)
from .evaluation import prediction_accuracy, cross_validate, compute_ranking_stability
from .utils import ConvergenceChecker

__version__ = "2.0.0"
__author__ = "Yan Su"

__all__ = [
    # Core algorithm
    "AHPI",
    "AHPIResult",
    "fit_ahpi",
    # Preprocessing
    "convert_to_interactions",
    "q_factor_filter",
    "balance_dataframe",
    "normalize_firm_names",
    "create_interaction_dataframe",
    "sample_interactions",
    # Evaluation
    "prediction_accuracy",
    "cross_validate",
    "compute_ranking_stability",
    # Utilities
    "ConvergenceChecker",
]
