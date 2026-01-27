"""
Data preprocessing utilities for AHPI.

Functions for converting raw litigation data into pairwise interaction format,
filtering by Q-factor, and normalizing entity names.
"""

from __future__ import annotations

import ast
import logging
from collections import Counter
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def convert_to_interactions(
    cases_df: pd.DataFrame,
    role_col: str = "extracted_roles",
    firm_col: str = "extracted_firms",
    proba_col: str = "predict_proba",
    label_col: str = "label",
    parse_literals: bool = True,
) -> list[tuple[str, str, int, Any, Any]]:
    """
    Convert case-level data to pairwise firm interactions.

    For each case, creates all pairwise combinations of plaintiff and defendant
    firms as interactions suitable for AHPI fitting.

    Parameters
    ----------
    cases_df : pd.DataFrame
        DataFrame with case-level information
    role_col : str
        Column containing list of roles (e.g., ['plaintiff', 'defendant'])
    firm_col : str
        Column containing list of firms per role
    proba_col : str
        Column with win probability (0 or 1)
    label_col : str
        Column with case type label
    parse_literals : bool
        Whether to parse string representations of lists

    Returns
    -------
    list[tuple]
        List of (defendant_firm, plaintiff_firm, win_index, val_type, priv_type)

    Examples
    --------
    >>> import pandas as pd
    >>> cases = pd.DataFrame({
    ...     'extracted_roles': [['plaintiff', 'defendant']],
    ...     'extracted_firms': [[['FirmA'], ['FirmB']]],
    ...     'predict_proba': [1],
    ...     'label': ['civil']
    ... })
    >>> interactions = convert_to_interactions(cases, parse_literals=False)
    >>> len(interactions)
    1
    """
    if parse_literals:
        cases_df = cases_df.copy()
        cases_df[role_col] = cases_df[role_col].apply(
            lambda x: ast.literal_eval(x) if isinstance(x, str) else x
        )
        cases_df[firm_col] = cases_df[firm_col].apply(
            lambda x: ast.literal_eval(x) if isinstance(x, str) else x
        )

    interactions = []

    for i in range(len(cases_df)):
        roles = cases_df[role_col].iloc[i]
        firms = cases_df[firm_col].iloc[i]

        # Extract plaintiff and defendant firms
        def_firms, pla_firms = [], []
        for j, role in enumerate(roles):
            if role == "plaintiff":
                pla_firms.extend(firms[j])
            elif role == "defendant":
                def_firms.extend(firms[j])

        # Create pairwise interactions
        if def_firms and pla_firms:
            proba = round(cases_df[proba_col].iloc[i])
            label = cases_df[label_col].iloc[i]

            for def_firm in def_firms:
                for pla_firm in pla_firms:
                    interactions.append((def_firm, pla_firm, proba, label, label))

    logger.info(f"Created {len(interactions)} pairwise interactions from {len(cases_df)} cases")
    return interactions


def q_factor_filter(
    interactions: list[tuple] | pd.DataFrame,
    q: float = 1.0,
    verbose: bool = False,
) -> list[tuple]:
    """
    Filter interactions to achieve a target Q-factor.

    Q-factor = number of interactions / number of unique entities.
    Higher Q-factor means more data per entity, improving estimation accuracy.

    Iteratively removes entities with the lowest interaction count until
    the target Q-factor is achieved.

    Parameters
    ----------
    interactions : list[tuple] or pd.DataFrame
        Interaction data. If list, assumed to be [(priv, unpriv, ...)]
    q : float
        Target Q-factor to achieve
    verbose : bool
        Whether to print progress

    Returns
    -------
    list[tuple]
        Filtered interactions achieving the target Q-factor

    Raises
    ------
    ValueError
        If Q-factor cannot be achieved (empty result)

    Examples
    --------
    >>> interactions = [
    ...     ('A', 'B', 0, 'type1', 'type1'),
    ...     ('B', 'C', 1, 'type1', 'type1'),
    ...     ('A', 'C', 0, 'type1', 'type1'),
    ... ]
    >>> filtered = q_factor_filter(interactions, q=1.0)
    >>> len(filtered)
    3
    """
    if isinstance(interactions, pd.DataFrame):
        df = interactions.copy()
    else:
        if not interactions:
            raise ValueError(f"Cannot achieve Q-factor of {q}: empty interaction list")
        df = pd.DataFrame(interactions)

    def_col, pla_col = df.columns[0], df.columns[1]

    # Get all unique firms
    all_firms = df[[def_col, pla_col]].values.flatten()
    firm_frequency = Counter(all_firms)

    # Check current Q-factor
    curr_q = len(df) / len(set(all_firms))

    if curr_q >= q:
        return df.values.tolist()

    # Find and remove firms with minimum frequency
    min_freq = min(firm_frequency.values())
    firms_low_frequency = {
        firm for firm, freq in firm_frequency.items()
        if freq == min_freq
    }

    df_filtered = df[~df[[def_col, pla_col]].isin(firms_low_frequency).any(axis=1)]

    if verbose:
        logger.info(
            f"Q-factor iteration: removed {len(firms_low_frequency)} firms "
            f"with {min_freq} interactions, {len(df_filtered)} remaining"
        )

    if len(df_filtered) == 0:
        raise ValueError(
            f"Cannot achieve Q-factor of {q}: all interactions removed"
        )

    # Recursive call
    return q_factor_filter(df_filtered.values.tolist(), q=q, verbose=verbose)


def balance_dataframe(
    df: pd.DataFrame,
    column: str,
    random_state: int = 42,
) -> pd.DataFrame:
    """
    Balance a DataFrame by downsampling majority classes.

    Ensures equal representation of all values in the specified column
    by sampling the minimum count from each group.

    Parameters
    ----------
    df : pd.DataFrame
        DataFrame to balance
    column : str
        Column to balance on
    random_state : int
        Random seed for reproducibility

    Returns
    -------
    pd.DataFrame
        Balanced DataFrame with equal counts per class

    Examples
    --------
    >>> df = pd.DataFrame({'class': ['A', 'A', 'A', 'B'], 'value': [1, 2, 3, 4]})
    >>> balanced = balance_dataframe(df, 'class')
    >>> balanced['class'].value_counts().tolist()
    [1, 1]
    """
    value_counts = df[column].value_counts()
    min_count = value_counts.min()

    balanced_parts = []
    for value in value_counts.index:
        subset = df[df[column] == value]
        sampled = subset.sample(n=min_count, random_state=random_state)
        balanced_parts.append(sampled)

    balanced_df = pd.concat(balanced_parts)
    balanced_df = balanced_df.sample(frac=1, random_state=random_state).reset_index(drop=True)

    return balanced_df


def normalize_firm_names(
    names: list[str],
    threshold: float = 0.85,
) -> dict[str, str]:
    """
    Normalize firm names using fuzzy matching.

    Groups similar firm names and maps them to a canonical form.
    Useful for handling OCR errors and naming inconsistencies.

    Parameters
    ----------
    names : list[str]
        List of firm names to normalize
    threshold : float
        Similarity threshold (0-1) for grouping names

    Returns
    -------
    dict[str, str]
        Mapping from original names to canonical forms

    Notes
    -----
    Requires `rapidfuzz` package for fuzzy matching.
    If not installed, returns identity mapping.

    Examples
    --------
    >>> names = ["Smith & Associates", "Smith and Associates", "Jones LLP"]
    >>> mapping = normalize_firm_names(names, threshold=0.9)
    >>> mapping.get("Smith and Associates")  # Might map to "Smith & Associates"
    """
    try:
        from rapidfuzz import fuzz, process
    except ImportError:
        logger.warning(
            "rapidfuzz not installed. Firm name normalization disabled. "
            "Install with: pip install rapidfuzz"
        )
        return {name: name for name in names}

    unique_names = list(set(names))
    canonical_map = {}
    processed = set()

    for name in unique_names:
        if name in processed:
            continue

        # Find similar names
        matches = process.extract(
            name,
            unique_names,
            scorer=fuzz.token_sort_ratio,
            score_cutoff=threshold * 100,
        )

        # Use the most common or first as canonical
        group = [m[0] for m in matches]
        canonical = min(group, key=len)  # Shortest as canonical

        for member in group:
            canonical_map[member] = canonical
            processed.add(member)

    return canonical_map


def create_interaction_dataframe(
    interactions: list[tuple],
    columns: list[str] | None = None,
) -> pd.DataFrame:
    """
    Convert interaction list to DataFrame with standard columns.

    Parameters
    ----------
    interactions : list[tuple]
        List of interaction tuples
    columns : list[str], optional
        Column names. Default: ['priv', 'unpriv', 'win_index', 'val_type', 'priv_type']

    Returns
    -------
    pd.DataFrame
        DataFrame ready for AHPI fitting
    """
    if columns is None:
        columns = ['priv', 'unpriv', 'win_index', 'val_type', 'priv_type']

    return pd.DataFrame(interactions, columns=columns)


def sample_interactions(
    df: pd.DataFrame,
    n: int = 1000,
    random_state: int = 42,
    stratify_by: str | None = None,
) -> pd.DataFrame:
    """
    Sample interactions for faster development/testing.

    Parameters
    ----------
    df : pd.DataFrame
        Full interaction DataFrame
    n : int
        Number of samples to take
    random_state : int
        Random seed
    stratify_by : str, optional
        Column to stratify sampling by

    Returns
    -------
    pd.DataFrame
        Sampled DataFrame
    """
    if len(df) <= n:
        return df

    if stratify_by and stratify_by in df.columns:
        # Stratified sampling
        from sklearn.model_selection import train_test_split
        _, sample = train_test_split(
            df,
            test_size=n / len(df),
            stratify=df[stratify_by],
            random_state=random_state,
        )
        return sample.reset_index(drop=True)

    return df.sample(n=n, random_state=random_state).reset_index(drop=True)
