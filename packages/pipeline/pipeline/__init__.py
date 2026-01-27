"""
Legal Pipeline - Data processing for litigation analytics.

This package provides ETL utilities for processing litigation data
and preparing it for AHPI-based ranking analysis.
"""

from .extract import (
    load_cases_df,
    load_moesm4_data,
)
from .transform import (
    cases_to_interactions,
    compute_rankings,
    generate_insights,
    generate_firm_profiles,
)
from .export import (
    export_for_frontend,
    export_rankings_csv,
    export_insights_json,
    export_firm_profiles_json,
)
from .config import PipelineConfig
from .matter_signals import OfflineKB, recommend_candidates, compute_candidate_outcome_signal, list_evidence
from .document_parse import extract_text_from_pdf_bytes, parse_text_to_brief

__version__ = "1.0.0"

__all__ = [
    # Extract
    "load_cases_df",
    "load_moesm4_data",
    # Transform
    "cases_to_interactions",
    "compute_rankings",
    "generate_insights",
    "generate_firm_profiles",
    # Export
    "export_for_frontend",
    "export_rankings_csv",
    "export_insights_json",
    "export_firm_profiles_json",
    # Config
    "PipelineConfig",
    # Matter signals (Phase 1)
    "OfflineKB",
    "recommend_candidates",
    "compute_candidate_outcome_signal",
    "list_evidence",
    # Document parse (Phase 1)
    "extract_text_from_pdf_bytes",
    "parse_text_to_brief",
]
