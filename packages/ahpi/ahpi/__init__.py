"""
AHPI (Asymmetric Heterogeneous Pairwise Interactions)

A generalized Bradley-Terry model for ranking entities from pairwise comparison data.
Particularly suited for legal outcome analysis where plaintiff-defendant asymmetry exists.

Reference:
    Mahari et al. (2025). "Data-Driven Law Firm Rankings to Reduce Information Asymmetry
    in Legal Disputes." Nature Computational Science.
    arXiv: https://arxiv.org/abs/2408.16863v2
"""

from .model import AHPI, AHPIResult
from .preprocessing import (
    convert_to_interactions,
    q_factor_filter,
    balance_dataframe,
    normalize_firm_names,
)
from .evaluation import prediction_accuracy
from .utils import ConvergenceChecker

__version__ = "2.0.0"
__author__ = "Alexandre Mojon, Robert Mahari"

__all__ = [
    # Core algorithm
    "AHPI",
    "AHPIResult",
    # Preprocessing
    "convert_to_interactions",
    "q_factor_filter",
    "balance_dataframe",
    "normalize_firm_names",
    # Evaluation
    "prediction_accuracy",
    # Utilities
    "ConvergenceChecker",
]
