"""
Data transformation utilities for legal pipeline.
"""

from __future__ import annotations

import logging
from collections import Counter, defaultdict
from typing import Any

import numpy as np
import pandas as pd

from .config import PipelineConfig

logger = logging.getLogger(__name__)


def cases_to_interactions(
    cases_df: pd.DataFrame,
    config: PipelineConfig | None = None,
) -> list[tuple[str, str, int, str, str]]:
    """
    Convert case-level data to pairwise firm interactions.

    Parameters
    ----------
    cases_df : pd.DataFrame
        Cases with extracted_roles, extracted_firms, predict_proba, label
    config : PipelineConfig, optional
        Pipeline configuration for Q-factor filtering

    Returns
    -------
    list[tuple]
        List of (defendant, plaintiff, win_index, case_type, case_type)
    """
    interactions = []

    for i in range(len(cases_df)):
        roles = cases_df['extracted_roles'].iloc[i]
        firms = cases_df['extracted_firms'].iloc[i]

        def_firms, pla_firms = [], []
        for j, role in enumerate(roles):
            if role == 'plaintiff':
                pla_firms.extend(firms[j])
            elif role == 'defendant':
                def_firms.extend(firms[j])

        if def_firms and pla_firms:
            proba = round(cases_df['predict_proba'].iloc[i])
            label = cases_df['label'].iloc[i]

            for def_firm in def_firms:
                for pla_firm in pla_firms:
                    interactions.append((def_firm, pla_firm, proba, label, label))

    logger.info(f"Created {len(interactions)} pairwise interactions")

    # Apply Q-factor filtering if configured
    if config and config.q_factor > 0:
        from ahpi import q_factor_filter
        try:
            interactions = q_factor_filter(interactions, q=config.q_factor)
            logger.info(f"After Q-factor filtering: {len(interactions)} interactions")
        except Exception as e:
            logger.warning(f"Q-factor filtering failed: {e}")

    return interactions


def compute_rankings(
    interactions: list[tuple] | pd.DataFrame,
    config: PipelineConfig | None = None,
) -> tuple[pd.DataFrame, dict[str, float], dict[str, float]]:
    """
    Compute firm rankings using AHPI algorithm.

    Parameters
    ----------
    interactions : list or pd.DataFrame
        Interaction data
    config : PipelineConfig, optional
        Pipeline configuration with AHPI parameters

    Returns
    -------
    tuple
        (rankings_df, valence_probs, privileges)
        - rankings_df: DataFrame with columns [firm, score, rank]
        - valence_probs: Dict of case_type -> probability
        - privileges: Dict of case_type -> privilege value
    """
    from ahpi import AHPI

    if isinstance(interactions, list):
        df = pd.DataFrame(
            interactions,
            columns=['priv', 'unpriv', 'win_index', 'val_type', 'priv_type']
        )
    else:
        df = interactions

    # Get AHPI parameters
    ahpi_params = config.ahpi_params if config else {}

    logger.info(f"Running AHPI with params: {ahpi_params}")
    scores, valence_probs, privileges = AHPI(df, **ahpi_params)

    # Create rankings DataFrame
    rankings_df = pd.DataFrame([
        {'firm': k, 'score': v}
        for k, v in scores.items()
    ])
    rankings_df = rankings_df.sort_values('score', ascending=False)
    rankings_df['rank'] = range(1, len(rankings_df) + 1)
    rankings_df = rankings_df.reset_index(drop=True)

    logger.info(f"Computed rankings for {len(rankings_df)} firms")

    return rankings_df, valence_probs, privileges


def generate_insights(
    interactions_df: pd.DataFrame,
    rankings_df: pd.DataFrame,
    top_n: int = 5,
) -> list[dict[str, Any]]:
    """
    Generate top insights for the Research Assistant.

    Identifies:
    - Top rivalries (most head-to-head matchups)
    - Defendant advantages by case type
    - Case type heterogeneity

    Parameters
    ----------
    interactions_df : pd.DataFrame
        Interaction data
    rankings_df : pd.DataFrame
        Firm rankings
    top_n : int
        Number of insights to generate

    Returns
    -------
    list[dict]
        List of insight objects with type, title, description, evidence
    """
    insights = []

    # 1. Top rivalries
    rivalry_counts = interactions_df.groupby(['priv', 'unpriv']).size()
    top_rivalries = rivalry_counts.nlargest(top_n)

    for (firm1, firm2), count in top_rivalries.items():
        # Get win rates
        matchups = interactions_df[
            (interactions_df['priv'] == firm1) & (interactions_df['unpriv'] == firm2)
        ]
        def_win_rate = (matchups['win_index'] == 0).mean()

        insights.append({
            'type': 'rivalry',
            'title': f'{firm1} vs {firm2}',
            'description': f'{count} head-to-head cases. Defendant win rate: {def_win_rate:.1%}',
            'evidence': matchups.index.tolist()[:10],
            'priority': count,
        })

    # 2. Defendant advantage by case type
    if 'val_type' in interactions_df.columns:
        for case_type in interactions_df['val_type'].unique():
            subset = interactions_df[interactions_df['val_type'] == case_type]
            def_win_rate = (subset['win_index'] == 0).mean()

            if def_win_rate > 0.55 or def_win_rate < 0.45:
                insights.append({
                    'type': 'defendant_advantage',
                    'title': f'Defendant {"Advantage" if def_win_rate > 0.5 else "Disadvantage"} in {case_type}',
                    'description': f'Defendants win {def_win_rate:.1%} of {case_type} cases ({len(subset)} cases)',
                    'evidence': subset.index.tolist()[:10],
                    'priority': abs(def_win_rate - 0.5) * len(subset),
                })

    # 3. Top firm performance
    top_firms = rankings_df.head(5)
    for _, row in top_firms.iterrows():
        firm = row['firm']
        rank = row['rank']
        score = row['score']

        # Count appearances
        n_def = (interactions_df['priv'] == firm).sum()
        n_pla = (interactions_df['unpriv'] == firm).sum()

        insights.append({
            'type': 'top_performer',
            'title': f'#{rank}: {firm}',
            'description': f'Score: {score:.2f}. Appeared as defendant {n_def}x, plaintiff {n_pla}x',
            'evidence': [],
            'priority': score,
        })

    # Sort by priority and return top N
    insights.sort(key=lambda x: x['priority'], reverse=True)
    return insights[:top_n * 2]


def generate_firm_profiles(
    interactions_df: pd.DataFrame,
    rankings_df: pd.DataFrame,
    top_n: int = 100,
) -> dict[str, dict[str, Any]]:
    """
    Generate detailed profiles for top firms.

    Parameters
    ----------
    interactions_df : pd.DataFrame
        Interaction data
    rankings_df : pd.DataFrame
        Firm rankings
    top_n : int
        Number of top firms to profile

    Returns
    -------
    dict
        Mapping from firm name to profile dict
    """
    profiles = {}
    top_firms = set(rankings_df.head(top_n)['firm'])

    for firm in top_firms:
        # Get firm's ranking info
        firm_row = rankings_df[rankings_df['firm'] == firm].iloc[0]

        # Get interactions as defendant
        as_def = interactions_df[interactions_df['priv'] == firm]
        # Get interactions as plaintiff
        as_pla = interactions_df[interactions_df['unpriv'] == firm]

        # Top opponents
        opponents_def = as_def['unpriv'].value_counts().head(5).to_dict()
        opponents_pla = as_pla['priv'].value_counts().head(5).to_dict()

        # Win rates by case type
        case_type_stats = {}
        if 'val_type' in interactions_df.columns:
            for case_type in interactions_df['val_type'].unique():
                ct_def = as_def[as_def['val_type'] == case_type]
                ct_pla = as_pla[as_pla['val_type'] == case_type]

                if len(ct_def) + len(ct_pla) > 0:
                    def_wins = (ct_def['win_index'] == 0).sum()
                    pla_wins = (ct_pla['win_index'] == 1).sum()
                    total = len(ct_def) + len(ct_pla)
                    wins = def_wins + pla_wins

                    case_type_stats[case_type] = {
                        'total': total,
                        'wins': int(wins),
                        'win_rate': wins / total if total > 0 else 0,
                    }

        profiles[firm] = {
            'firm': firm,
            'rank': int(firm_row['rank']),
            'score': float(firm_row['score']),
            'as_defendant': len(as_def),
            'as_plaintiff': len(as_pla),
            'total_cases': len(as_def) + len(as_pla),
            'top_opponents_as_defendant': opponents_def,
            'top_opponents_as_plaintiff': opponents_pla,
            'case_type_stats': case_type_stats,
        }

    logger.info(f"Generated profiles for {len(profiles)} firms")
    return profiles


def filter_top_n_subgraph(
    interactions_df: pd.DataFrame,
    rankings_df: pd.DataFrame,
    top_n: int = 100,
) -> pd.DataFrame:
    """
    Filter interactions to only include top N firms.

    Parameters
    ----------
    interactions_df : pd.DataFrame
        Full interaction data
    rankings_df : pd.DataFrame
        Firm rankings
    top_n : int
        Number of top firms to include

    Returns
    -------
    pd.DataFrame
        Filtered interactions
    """
    top_firms = set(rankings_df.head(top_n)['firm'])

    filtered = interactions_df[
        (interactions_df['priv'].isin(top_firms)) &
        (interactions_df['unpriv'].isin(top_firms))
    ].copy()

    logger.info(
        f"Filtered to top {top_n} firms: "
        f"{len(filtered)} interactions (from {len(interactions_df)})"
    )

    return filtered
