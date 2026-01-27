"""
Data export utilities for frontend consumption.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import pandas as pd

from .config import PipelineConfig

logger = logging.getLogger(__name__)


def export_for_frontend(
    interactions_df: pd.DataFrame,
    rankings_df: pd.DataFrame,
    valence_probs: dict[str, float],
    privileges: dict[str, float],
    config: PipelineConfig | None = None,
    output_dir: str | Path | None = None,
    prefix: str = "mahari_",
) -> dict[str, Path]:
    """
    Export all data files needed by the frontend.

    Parameters
    ----------
    interactions_df : pd.DataFrame
        Interaction data
    rankings_df : pd.DataFrame
        Firm rankings
    valence_probs : dict
        Case type -> valence probability
    privileges : dict
        Case type -> privilege value
    config : PipelineConfig, optional
        Pipeline configuration
    output_dir : str or Path, optional
        Output directory
    prefix : str
        Filename prefix

    Returns
    -------
    dict[str, Path]
        Mapping from data type to output file path
    """
    if output_dir is None:
        if config:
            output_dir = Path(config.output_dir)
        else:
            output_dir = Path("output/")

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    outputs = {}

    # 1. Interactions CSV (for network visualization)
    interactions_path = output_dir / f"{prefix}interactions.csv"
    export_interactions_csv(interactions_df, interactions_path)
    outputs['interactions'] = interactions_path

    # 2. Rankings CSV
    rankings_path = output_dir / f"{prefix}exp_scores.csv"
    export_rankings_csv(rankings_df, rankings_path)
    outputs['rankings'] = rankings_path

    # 3. Case type parameters
    params_path = output_dir / f"{prefix}case_type_params.csv"
    export_case_type_params(valence_probs, privileges, params_path)
    outputs['case_type_params'] = params_path

    # 4. Top 50/100 subgraphs
    from .transform import filter_top_n_subgraph

    for n in [50, 100]:
        filtered = filter_top_n_subgraph(interactions_df, rankings_df, top_n=n)
        subgraph_path = output_dir / f"{prefix}top{n}_interactions.csv"
        export_interactions_csv(filtered, subgraph_path)
        outputs[f'top{n}_interactions'] = subgraph_path

    logger.info(f"Exported {len(outputs)} files to {output_dir}")
    return outputs


def export_interactions_csv(
    df: pd.DataFrame,
    path: str | Path,
) -> None:
    """
    Export interactions to frontend-compatible CSV.

    Parameters
    ----------
    df : pd.DataFrame
        Interaction data
    path : str or Path
        Output path
    """
    # Rename columns for frontend compatibility
    export_df = df.copy()
    column_map = {
        'priv': 'DefendantFirm',
        'unpriv': 'PlaintiffFirm',
        'win_index': 'Outcome',
        'val_type': 'CaseType',
    }

    for old, new in column_map.items():
        if old in export_df.columns:
            export_df = export_df.rename(columns={old: new})

    # Add row IDs for citation verification
    export_df['RowId'] = range(1, len(export_df) + 1)

    # Reorder columns
    cols = ['RowId', 'PlaintiffFirm', 'DefendantFirm', 'CaseType', 'Outcome']
    cols = [c for c in cols if c in export_df.columns]
    other_cols = [c for c in export_df.columns if c not in cols]
    export_df = export_df[cols + other_cols]

    export_df.to_csv(path, index=False)
    logger.info(f"Exported {len(export_df)} interactions to {path}")


def export_rankings_csv(
    rankings_df: pd.DataFrame,
    path: str | Path,
) -> None:
    """
    Export rankings to CSV.

    Parameters
    ----------
    rankings_df : pd.DataFrame
        Rankings with columns [firm, score, rank]
    path : str or Path
        Output path
    """
    export_df = rankings_df.copy()
    export_df = export_df.rename(columns={
        'firm': 'Firm',
        'score': 'Score',
        'rank': 'Rank',
    })

    export_df.to_csv(path, index=False)
    logger.info(f"Exported rankings for {len(export_df)} firms to {path}")


def export_case_type_params(
    valence_probs: dict[str, float],
    privileges: dict[str, float],
    path: str | Path,
) -> None:
    """
    Export case type parameters to CSV.

    Parameters
    ----------
    valence_probs : dict
        Case type -> valence probability
    privileges : dict
        Case type -> privilege value
    path : str or Path
        Output path
    """
    rows = []
    case_types = set(valence_probs.keys()) | set(privileges.keys())

    for ct in case_types:
        rows.append({
            'CaseType': ct,
            'ValenceProbability': valence_probs.get(ct, 0.5),
            'Privilege': privileges.get(ct, 0.0),
        })

    df = pd.DataFrame(rows)
    df.to_csv(path, index=False)
    logger.info(f"Exported parameters for {len(df)} case types to {path}")


def export_insights_json(
    insights: list[dict[str, Any]],
    path: str | Path,
) -> None:
    """
    Export insights to JSON for Research Assistant.

    Parameters
    ----------
    insights : list[dict]
        List of insight objects
    path : str or Path
        Output path
    """
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(insights, f, indent=2, ensure_ascii=False)
    logger.info(f"Exported {len(insights)} insights to {path}")


def export_firm_profiles_json(
    profiles: dict[str, dict[str, Any]],
    path: str | Path,
) -> None:
    """
    Export firm profiles to JSON.

    Parameters
    ----------
    profiles : dict
        Mapping from firm name to profile dict
    path : str or Path
        Output path
    """
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(profiles, f, indent=2, ensure_ascii=False)
    logger.info(f"Exported {len(profiles)} firm profiles to {path}")


def export_timeline_json(
    interactions_df: pd.DataFrame,
    path: str | Path,
    year_col: str = 'Year',
) -> None:
    """
    Export timeline data for year-based filtering.

    Parameters
    ----------
    interactions_df : pd.DataFrame
        Interaction data with Year column
    path : str or Path
        Output path
    year_col : str
        Name of the year column
    """
    if year_col not in interactions_df.columns:
        logger.warning(f"No {year_col} column found, skipping timeline export")
        return

    timeline = interactions_df.groupby(year_col).agg({
        'priv': 'count',  # Total interactions
    }).reset_index()

    timeline = timeline.rename(columns={
        year_col: 'year',
        'priv': 'count',
    })

    data = {
        'min_year': int(timeline['year'].min()),
        'max_year': int(timeline['year'].max()),
        'counts_by_year': timeline.to_dict('records'),
    }

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    logger.info(f"Exported timeline data to {path}")


def export_research_assistant_data(
    interactions_df: pd.DataFrame,
    rankings_df: pd.DataFrame,
    output_dir: str | Path,
    prefix: str = "mahari_",
) -> dict[str, Path]:
    """
    Export all Research Assistant data files.

    Parameters
    ----------
    interactions_df : pd.DataFrame
        Interaction data
    rankings_df : pd.DataFrame
        Firm rankings
    output_dir : str or Path
        Output directory
    prefix : str
        Filename prefix

    Returns
    -------
    dict[str, Path]
        Mapping from data type to file path
    """
    from .transform import generate_insights, generate_firm_profiles

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    outputs = {}

    # Generate insights
    insights = generate_insights(interactions_df, rankings_df)
    insights_path = output_dir / f"{prefix}insights.json"
    export_insights_json(insights, insights_path)
    outputs['insights'] = insights_path

    # Generate firm profiles
    profiles = generate_firm_profiles(interactions_df, rankings_df)
    profiles_path = output_dir / f"{prefix}firm_profiles.json"
    export_firm_profiles_json(profiles, profiles_path)
    outputs['firm_profiles'] = profiles_path

    # Export timeline if available
    if 'Year' in interactions_df.columns:
        timeline_path = output_dir / f"{prefix}timeline.json"
        export_timeline_json(interactions_df, timeline_path)
        outputs['timeline'] = timeline_path

    logger.info(f"Exported Research Assistant data to {output_dir}")
    return outputs
