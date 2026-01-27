"""
Data extraction utilities for legal pipeline.
"""

from __future__ import annotations

import ast
import logging
from pathlib import Path
from typing import Any

import pandas as pd

from .config import PipelineConfig

logger = logging.getLogger(__name__)


def load_cases_df(
    config: PipelineConfig | None = None,
    path: str | Path | None = None,
) -> pd.DataFrame:
    """
    Load the main cases DataFrame.

    Parameters
    ----------
    config : PipelineConfig, optional
        Pipeline configuration. If provided, uses config.data_dir.
    path : str or Path, optional
        Direct path to the CSV file. Overrides config.

    Returns
    -------
    pd.DataFrame
        Cases DataFrame with parsed list columns.
    """
    if path is None:
        if config is None:
            config = PipelineConfig.from_env()
        path = config.get_cases_path()

    logger.info(f"Loading cases from {path}")

    df = pd.read_csv(path, compression='gzip')

    # Parse literal columns
    if 'extracted_roles' in df.columns:
        df['extracted_roles'] = df['extracted_roles'].apply(
            lambda x: ast.literal_eval(x) if isinstance(x, str) else x
        )
    if 'extracted_firms' in df.columns:
        df['extracted_firms'] = df['extracted_firms'].apply(
            lambda x: ast.literal_eval(x) if isinstance(x, str) else x
        )

    logger.info(f"Loaded {len(df)} cases")

    # Apply demo mode sampling
    if config and config.demo_mode:
        n = min(config.demo_n_cases, len(df))
        df = df.sample(n=n, random_state=42).reset_index(drop=True)
        logger.info(f"[DEMO_MODE] Sampled {n} cases")

    return df


def load_moesm4_data(path: str | Path) -> pd.DataFrame:
    """
    Load the MOESM4 supplementary data from the paper.

    This contains case-level predictions for Fig.2 visualization.

    Parameters
    ----------
    path : str or Path
        Path to the MOESM4 CSV file.

    Returns
    -------
    pd.DataFrame
        MOESM4 data with columns: winner, predict_proba, id_number
    """
    logger.info(f"Loading MOESM4 data from {path}")
    df = pd.read_csv(path)
    logger.info(f"Loaded {len(df)} records from MOESM4")
    return df


def load_exp_scores(
    config: PipelineConfig | None = None,
    path: str | Path | None = None,
) -> pd.DataFrame:
    """
    Load pre-computed exponential scores.

    Parameters
    ----------
    config : PipelineConfig, optional
        Pipeline configuration.
    path : str or Path, optional
        Direct path to the scores file.

    Returns
    -------
    pd.DataFrame
        DataFrame with firm scores.
    """
    if path is None:
        if config is None:
            config = PipelineConfig.from_env()
        path = Path(config.data_dir) / "exp_scores.csv.gz"

    logger.info(f"Loading scores from {path}")
    df = pd.read_csv(path, compression='gzip')
    logger.info(f"Loaded scores for {len(df)} firms")
    return df


def extract_unique_firms(cases_df: pd.DataFrame) -> set[str]:
    """
    Extract all unique firm names from cases.

    Parameters
    ----------
    cases_df : pd.DataFrame
        Cases DataFrame with extracted_firms column.

    Returns
    -------
    set[str]
        Set of unique firm names.
    """
    firms = set()

    for firms_list in cases_df['extracted_firms']:
        for role_firms in firms_list:
            firms.update(role_firms)

    logger.info(f"Extracted {len(firms)} unique firms")
    return firms


def extract_case_types(cases_df: pd.DataFrame) -> list[str]:
    """
    Extract unique case types.

    Parameters
    ----------
    cases_df : pd.DataFrame
        Cases DataFrame with label column.

    Returns
    -------
    list[str]
        List of unique case types.
    """
    types = cases_df['label'].unique().tolist()
    logger.info(f"Found {len(types)} case types: {types}")
    return types
