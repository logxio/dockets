"""
Prediction and counterfactual analysis endpoints.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from ..models import (
    PredictRequest,
    PredictResponse,
    CounterfactualRequest,
    CounterfactualResponse,
    ErrorResponse,
)
from ..services import ahpi_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/predict", tags=["prediction"])


@router.post(
    "",
    response_model=PredictResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid input"},
        404: {"model": ErrorResponse, "description": "Fit not found"},
    },
    summary="Predict case outcome",
    description="""
    Predict the outcome of a case given the plaintiff and defendant law firms.

    Uses a previously fitted AHPI model (identified by `fit_id`) to compute:
    - **Defendant win probability**: P(defendant wins)
    - **Plaintiff win probability**: P(plaintiff wins) = 1 - P(defendant wins)
    - **Confidence level**: Based on data availability for both firms

    The prediction uses the Bradley-Terry model with:
    - Firm strength scores from the fitted model
    - Case-type specific valence and privilege parameters
    """,
)
async def predict_outcome(request: PredictRequest) -> PredictResponse:
    """
    Predict case outcome.

    Returns probabilities for defendant and plaintiff winning,
    along with confidence level and supporting evidence.
    """
    try:
        result = ahpi_service.predict(
            fit_id=request.fit_id,
            plaintiff_firm=request.plaintiff_firm,
            defendant_firm=request.defendant_firm,
            case_type=request.case_type,
        )

        if not result.get("success", False):
            raise HTTPException(status_code=404, detail=result.get("error", "Unknown error"))

        return PredictResponse(**result)

    except ValueError as e:
        logger.error(f"Prediction error: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post(
    "/counterfactual",
    response_model=CounterfactualResponse,
    summary="What-if analysis",
    description="""
    Perform counterfactual analysis: what if we changed the plaintiff or defendant?

    Compares:
    - **Original scenario**: Current plaintiff vs defendant
    - **Alternative scenario**: With substituted plaintiff/defendant

    Returns the change in defendant win probability.

    **Use cases:**
    - "How would our chances change if we hired Firm X instead?"
    - "What if the opposing counsel was Firm Y?"
    """,
)
async def counterfactual_analysis(request: CounterfactualRequest) -> CounterfactualResponse:
    """
    What-if counterfactual analysis.

    Compare predicted outcomes between original and alternative scenarios.
    """
    try:
        result = ahpi_service.counterfactual(
            fit_id=request.fit_id,
            original_plaintiff=request.original_plaintiff,
            original_defendant=request.original_defendant,
            case_type=request.case_type,
            alternative_plaintiff=request.alternative_plaintiff,
            alternative_defendant=request.alternative_defendant,
        )

        # Convert nested dicts to Pydantic models
        return CounterfactualResponse(
            success=result["success"],
            original=PredictResponse(**result["original"]),
            alternative=PredictResponse(**result["alternative"]),
            probability_change=result["probability_change"],
        )

    except ValueError as e:
        logger.error(f"Counterfactual error: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Counterfactual failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get(
    "/compare",
    summary="Compare two firms",
    description="Quick comparison of two firms' relative strength",
)
async def compare_firms(
    fit_id: str,
    firm_a: str,
    firm_b: str,
    case_type: str = "default",
):
    """
    Compare relative strength of two firms.

    Returns predicted outcomes for:
    - A as plaintiff, B as defendant
    - B as plaintiff, A as defendant
    """
    try:
        # A vs B (A plaintiff, B defendant)
        a_vs_b = ahpi_service.predict(
            fit_id=fit_id,
            plaintiff_firm=firm_a,
            defendant_firm=firm_b,
            case_type=case_type,
        )

        # B vs A (B plaintiff, A defendant)
        b_vs_a = ahpi_service.predict(
            fit_id=fit_id,
            plaintiff_firm=firm_b,
            defendant_firm=firm_a,
            case_type=case_type,
        )

        return {
            "fit_id": fit_id,
            "case_type": case_type,
            "firm_a": firm_a,
            "firm_b": firm_b,
            "scenarios": {
                "a_plaintiff_b_defendant": {
                    "a_win_probability": a_vs_b.get("plaintiff_win_probability"),
                    "b_win_probability": a_vs_b.get("defendant_win_probability"),
                },
                "b_plaintiff_a_defendant": {
                    "b_win_probability": b_vs_a.get("plaintiff_win_probability"),
                    "a_win_probability": b_vs_a.get("defendant_win_probability"),
                },
            },
            "scores": {
                "firm_a": a_vs_b.get("plaintiff_score"),
                "firm_b": a_vs_b.get("defendant_score"),
            },
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
