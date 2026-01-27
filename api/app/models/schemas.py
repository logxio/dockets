"""
Pydantic schemas for API request/response validation.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, ConfigDict


def _to_camel(s: str) -> str:
    parts = s.split("_")
    if not parts:
        return s
    head = parts[0]
    tail = "".join(p[:1].upper() + p[1:] if p else "_" for p in parts[1:])
    return head + tail


class CamelModel(BaseModel):
    """
    For Matter Workspace (Phase 1) we use camelCase in the API contract.

    - Requests: accept both snake_case and camelCase
    - Responses: FastAPI uses `by_alias=True`, so we emit camelCase
    """

    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
        extra="ignore",
    )


# =============================================================================
# Enums
# =============================================================================

class OutputFormat(str, Enum):
    """Supported output formats."""
    JSON = "json"
    CSV = "csv"


class FitMode(str, Enum):
    """Fitting mode options."""
    FULL = "full"
    DEMO = "demo"
    QUICK = "quick"


# =============================================================================
# Interaction Schemas
# =============================================================================

class InteractionInput(BaseModel):
    """Single interaction record."""
    plaintiff_firm: str = Field(..., description="Law firm representing plaintiff")
    defendant_firm: str = Field(..., description="Law firm representing defendant")
    outcome: int = Field(..., ge=0, le=1, description="0 = defendant won, 1 = plaintiff won")
    case_type: str = Field(default="default", description="Type of case")
    weight: float = Field(default=1.0, ge=0, description="Interaction weight")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "plaintiff_firm": "Skadden Arps",
                "defendant_firm": "Kirkland Ellis",
                "outcome": 0,
                "case_type": "patent",
                "weight": 1.0,
            }
        }
    )


class InteractionBatch(BaseModel):
    """Batch of interactions for fitting."""
    interactions: list[InteractionInput] = Field(
        ...,
        min_length=10,
        description="List of pairwise interactions (minimum 10)",
    )


# =============================================================================
# Fit Request/Response
# =============================================================================

class FitRequest(BaseModel):
    """Request body for /api/fit endpoint."""
    interactions: list[InteractionInput] = Field(
        ...,
        min_length=10,
        description="List of pairwise interactions",
    )
    mode: FitMode = Field(
        default=FitMode.DEMO,
        description="Fitting mode: full (slower, more accurate), demo (faster), quick (fastest)",
    )
    top_n: int = Field(
        default=100,
        ge=10,
        le=1000,
        description="Number of top firms to include in rankings",
    )
    q_factor: float = Field(
        default=10.0,
        ge=1.0,
        description="Q-factor for filtering (interactions/entities ratio)",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "interactions": [
                    {"plaintiff_firm": "FirmA", "defendant_firm": "FirmB", "outcome": 0, "case_type": "civil"},
                    {"plaintiff_firm": "FirmB", "defendant_firm": "FirmC", "outcome": 1, "case_type": "civil"},
                ],
                "mode": "demo",
                "top_n": 50,
                "q_factor": 10.0,
            }
        }
    )


class FirmRanking(BaseModel):
    """Individual firm ranking result."""
    firm: str
    score: float
    rank: int


class CaseTypeParams(BaseModel):
    """Parameters for a case type."""
    case_type: str
    valence_probability: float = Field(..., ge=0, le=1)
    privilege: float


class FitResponse(BaseModel):
    """Response from /api/fit endpoint."""
    success: bool
    message: str
    rankings: list[FirmRanking] = Field(default_factory=list)
    case_type_params: list[CaseTypeParams] = Field(default_factory=list)
    statistics: dict[str, Any] = Field(default_factory=dict)
    fit_id: str = Field(..., description="Unique ID for this fit result (for prediction)")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "message": "Successfully fitted 1000 interactions",
                "rankings": [
                    {"firm": "Kirkland Ellis", "score": 1.85, "rank": 1},
                    {"firm": "Skadden Arps", "score": 1.72, "rank": 2},
                ],
                "case_type_params": [
                    {"case_type": "patent", "valence_probability": 0.52, "privilege": 0.15}
                ],
                "statistics": {
                    "n_interactions": 1000,
                    "n_firms": 150,
                    "n_case_types": 3,
                    "fit_time_seconds": 2.5,
                },
                "fit_id": "fit_abc123",
            }
        }
    )


# =============================================================================
# Predict Request/Response
# =============================================================================

class PredictRequest(BaseModel):
    """Request body for /api/predict endpoint."""
    fit_id: str = Field(..., description="Fit ID from previous /api/fit call")
    plaintiff_firm: str = Field(..., description="Plaintiff's law firm")
    defendant_firm: str = Field(..., description="Defendant's law firm")
    case_type: str = Field(default="default", description="Type of case")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "fit_id": "fit_abc123",
                "plaintiff_firm": "Skadden Arps",
                "defendant_firm": "Kirkland Ellis",
                "case_type": "patent",
            }
        }
    )


class PredictResponse(BaseModel):
    """Response from /api/predict endpoint."""
    success: bool
    plaintiff_firm: str
    defendant_firm: str
    case_type: str
    defendant_win_probability: float = Field(..., ge=0, le=1)
    plaintiff_win_probability: float = Field(..., ge=0, le=1)
    plaintiff_score: float | None = None
    defendant_score: float | None = None
    confidence: str = Field(
        default="medium",
        description="Confidence level: high, medium, low, unknown"
    )
    evidence: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "success": True,
                "plaintiff_firm": "Skadden Arps",
                "defendant_firm": "Kirkland Ellis",
                "case_type": "patent",
                "defendant_win_probability": 0.62,
                "plaintiff_win_probability": 0.38,
                "plaintiff_score": 1.72,
                "defendant_score": 1.85,
                "confidence": "high",
                "evidence": {
                    "head_to_head_count": 15,
                    "historical_defendant_wins": 9,
                },
            }
        }
    )


# =============================================================================
# Counterfactual/What-If
# =============================================================================

class CounterfactualRequest(BaseModel):
    """Request for what-if analysis."""
    fit_id: str
    original_plaintiff: str
    original_defendant: str
    alternative_plaintiff: str | None = None
    alternative_defendant: str | None = None
    case_type: str = "default"


class CounterfactualResponse(BaseModel):
    """Response for what-if analysis."""
    success: bool
    original: PredictResponse
    alternative: PredictResponse
    probability_change: float = Field(
        ...,
        description="Change in defendant win probability (alternative - original)"
    )


# =============================================================================
# Health & Status
# =============================================================================

class HealthResponse(BaseModel):
    """Health check response."""
    ok: bool = True
    status: str = "ok"
    version: str
    ahpi_version: str
    active_fits: int = 0


class ErrorResponse(BaseModel):
    """Standard error response."""
    success: bool = False
    error: str
    detail: str | None = None
    error_code: str | None = None


# =============================================================================
# Matter Workspace (Phase 1)
# =============================================================================

CaseType = Literal["civil_rights", "contract", "labor", "torts", "other"]
MatterStatus = Literal["draft", "ready", "archived"]
CandidateTier = Literal["recommended", "consider", "excluded"]
Confidence = Literal["high", "medium", "low", "unknown"]
JobStatus = Literal["queued", "running", "succeeded", "failed"]


class MatterConstraints(CamelModel):
    budget_usd: int | None = Field(default=None, ge=0)
    preferred_firms: list[str] = Field(default_factory=list)
    excluded_firms: list[str] = Field(default_factory=list)
    geo: list[str] = Field(default_factory=list)
    panel_only: bool = False


class MatterBrief(CamelModel):
    jurisdiction: str = "US"
    court: str | None = None
    judge: str | None = None
    case_type: CaseType | None = None
    role: Literal["plaintiff", "defendant"] | None = None
    opponent_name: str | None = None
    opponent_counsel: str | None = None
    notes: str | None = None
    constraints: MatterConstraints = Field(default_factory=MatterConstraints)


class Matter(CamelModel):
    id: str
    name: str
    status: MatterStatus = "draft"
    created_at: str
    updated_at: str
    brief: MatterBrief = Field(default_factory=MatterBrief)


class CreateMatterRequest(CamelModel):
    name: str = Field(..., min_length=1)
    brief: MatterBrief | None = None


class UpdateMatterRequest(CamelModel):
    name: str | None = None
    status: MatterStatus | None = None
    brief: MatterBrief | None = None


class OutcomeSignal(CamelModel):
    baseline_defendant_win_rate_pct: int = Field(default=83, ge=0, le=100)
    predicted_win_rate_pct: int | None = Field(default=None, ge=0, le=100)
    win_rate_lift_pct: int | None = Field(default=None, ge=-100, le=100)
    confidence: Confidence = "unknown"
    drivers: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)


class CandidateCost(CamelModel):
    hourly_rate_usd: int | None = Field(default=None, ge=0)
    alt_fee: str | None = None
    source: Literal["user", "unknown"] = "unknown"


class CandidateSignals(CamelModel):
    outcome_lift_pct: int | None = Field(default=None, ge=-100, le=100)
    confidence: Confidence = "unknown"
    evidence_count: int = Field(default=0, ge=0)

class ExplainabilityCitation(CamelModel):
    case_id: int
    why: str | None = None
    similarity: float | None = Field(default=None, ge=0, le=1)


class ExplainabilityReason(CamelModel):
    code: str
    title: str
    summary: str
    citations: list[ExplainabilityCitation] = Field(default_factory=list)


class ExplainabilityConfidence(CamelModel):
    level: Confidence = "unknown"
    n_evidence_cases: int = Field(default=0, ge=0)
    used_head_to_head: bool = False


class ExplainabilitySnapshot(CamelModel):
    files: list[str] = Field(default_factory=list)


class CandidateExplainability(CamelModel):
    reasons: list[ExplainabilityReason] = Field(default_factory=list)
    confidence: ExplainabilityConfidence = Field(default_factory=ExplainabilityConfidence)
    limitations: list[str] = Field(default_factory=list)
    snapshot: ExplainabilitySnapshot = Field(default_factory=ExplainabilitySnapshot)


class CandidateFirm(CamelModel):
    firm: str
    firm_key: str
    tier: CandidateTier = "consider"
    signals: CandidateSignals = Field(default_factory=CandidateSignals)
    cost: CandidateCost = Field(default_factory=CandidateCost)
    notes: str | None = None
    explain: CandidateExplainability | None = None


class CandidateList(CamelModel):
    items: list[CandidateFirm] = Field(default_factory=list)


class EvidenceSource(CamelModel):
    provider: str = "CAP"
    url: str | None = None
    snapshot: str | None = None


class EvidenceItem(CamelModel):
    case_id: int
    caption: str | None = None
    court: str | None = None
    year: int | None = None
    case_type: str | None = None
    outcome: str | None = None
    similarity: float | None = Field(default=None, ge=0, le=1)
    why_relevant: list[str] = Field(default_factory=list)
    source: EvidenceSource = Field(default_factory=EvidenceSource)


class EvidenceList(CamelModel):
    items: list[EvidenceItem] = Field(default_factory=list)


class PackExportLinks(CamelModel):
    html_url: str
    pdf_url: str | None = None
    share_url: str | None = None


class PackSummaryRecommendation(CamelModel):
    firm: str
    reason_bullets: list[str] = Field(default_factory=list)
    confidence: Confidence = "unknown"


class PackSummary(CamelModel):
    recommended: list[PackSummaryRecommendation] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class DecisionPack(CamelModel):
    id: str
    matter_id: str
    version: int
    created_at: str
    created_by: dict[str, Any] = Field(default_factory=dict)
    inputs: dict[str, Any] = Field(default_factory=dict)
    summary: PackSummary = Field(default_factory=PackSummary)
    export: PackExportLinks


class DecisionPackList(CamelModel):
    items: list[DecisionPack] = Field(default_factory=list)


class CreatePackRequest(CamelModel):
    format: Literal["html"] = "html"


class Job(CamelModel):
    id: str
    type: str
    status: JobStatus
    progress: float = Field(default=0.0, ge=0, le=1)
    result: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class CreatePackJobAccepted(CamelModel):
    job_id: str
    status_url: str


class IntakeJobAccepted(CamelModel):
    job_id: str
    status_url: str


class AuditActor(CamelModel):
    id: str
    name: str


class AuditEvent(CamelModel):
    id: str
    at: str
    actor: AuditActor
    action: str
    meta: dict[str, Any] = Field(default_factory=dict)


class AuditList(CamelModel):
    items: list[AuditEvent] = Field(default_factory=list)


# =============================================================================
# Document Parsing (Phase 1)
# =============================================================================

class ParseDocumentResponse(CamelModel):
    brief: dict[str, Any]
    fields: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    text_preview: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
