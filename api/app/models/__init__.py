"""
Data models for the Legal Intelligence API.
"""

from .schemas import (
    # Enums
    OutputFormat,
    FitMode,
    # Interaction
    InteractionInput,
    InteractionBatch,
    # Fit
    FitRequest,
    FitResponse,
    FirmRanking,
    CaseTypeParams,
    # Predict
    PredictRequest,
    PredictResponse,
    # Counterfactual
    CounterfactualRequest,
    CounterfactualResponse,
    # Health
    HealthResponse,
    ErrorResponse,
    # Matter (Phase 1)
    Matter,
    MatterBrief,
    MatterConstraints,
    CreateMatterRequest,
    UpdateMatterRequest,
    CandidateFirm,
    CandidateList,
    EvidenceItem,
    EvidenceList,
    DecisionPack,
    DecisionPackList,
    CreatePackRequest,
    CreatePackJobAccepted,
    IntakeJobAccepted,
    Job,
    AuditEvent,
    AuditList,
    ParseDocumentResponse,
)

__all__ = [
    "OutputFormat",
    "FitMode",
    "InteractionInput",
    "InteractionBatch",
    "FitRequest",
    "FitResponse",
    "FirmRanking",
    "CaseTypeParams",
    "PredictRequest",
    "PredictResponse",
    "CounterfactualRequest",
    "CounterfactualResponse",
    "HealthResponse",
    "ErrorResponse",
    "Matter",
    "MatterBrief",
    "MatterConstraints",
    "CreateMatterRequest",
    "UpdateMatterRequest",
    "CandidateFirm",
    "CandidateList",
    "EvidenceItem",
    "EvidenceList",
    "DecisionPack",
    "DecisionPackList",
    "CreatePackRequest",
    "CreatePackJobAccepted",
    "IntakeJobAccepted",
    "Job",
    "AuditEvent",
    "AuditList",
    "ParseDocumentResponse",
]
