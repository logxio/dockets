"""
AHPI model fitting endpoint.
"""

from __future__ import annotations

import io
import logging
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
import pandas as pd

from ..models import (
    FitRequest,
    FitResponse,
    FirmRanking,
    CaseTypeParams,
    ErrorResponse,
    FitMode,
)
from ..services import ahpi_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fit", tags=["fitting"])


@router.post(
    "",
    response_model=FitResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid input"},
        500: {"model": ErrorResponse, "description": "Fitting failed"},
    },
    summary="Fit AHPI model",
    description="""
    Fit the AHPI (Asymmetric Heterogeneous Pairwise Interactions) model on litigation data.

    The model estimates:
    - **Firm strength scores**: Based on win/loss records
    - **Valence probabilities**: Probability the favored side wins
    - **Privilege parameters**: Defendant advantage by case type

    **Modes:**
    - `full`: Most accurate, slower (~5 min for 10k interactions)
    - `demo`: Balanced (recommended, ~30s)
    - `quick`: Fastest, less accurate (~5s)
    """,
)
async def fit_model(request: FitRequest) -> FitResponse:
    """
    Fit AHPI model on interaction data.

    Takes a list of plaintiff-defendant interactions and returns:
    - Firm rankings with scores
    - Case type parameters (valence, privilege)
    - Fit statistics
    - A fit_id for subsequent predictions
    """
    try:
        # Convert Pydantic models to dicts
        interactions = [
            {
                "plaintiff_firm": i.plaintiff_firm,
                "defendant_firm": i.defendant_firm,
                "outcome": i.outcome,
                "case_type": i.case_type,
                "weight": i.weight,
            }
            for i in request.interactions
        ]

        # Run fitting
        result = ahpi_service.fit(
            interactions=interactions,
            mode=request.mode.value,
            q_factor=request.q_factor,
        )

        # Get rankings and params
        rankings = ahpi_service.get_rankings(result.fit_id, top_n=request.top_n)
        case_params = ahpi_service.get_case_type_params(result.fit_id)

        return FitResponse(
            success=True,
            message=f"Successfully fitted {result.n_interactions} interactions",
            rankings=[FirmRanking(**r) for r in rankings],
            case_type_params=[CaseTypeParams(**p) for p in case_params],
            statistics={
                "n_interactions": result.n_interactions,
                "n_firms": result.n_firms,
                "n_case_types": result.n_case_types,
                "fit_time_seconds": round(result.fit_time, 2),
            },
            fit_id=result.fit_id,
        )

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Fitting failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Fitting failed: {str(e)}")


@router.post(
    "/csv",
    response_model=FitResponse,
    summary="Fit from CSV file",
    description="""
    Upload a CSV file with litigation data and fit the AHPI model.

    **Required columns:**
    - `PlaintiffFirm` or `plaintiff_firm`: Plaintiff's law firm
    - `DefendantFirm` or `defendant_firm`: Defendant's law firm
    - `Outcome` or `outcome`: 0 = defendant won, 1 = plaintiff won

    **Optional columns:**
    - `CaseType` or `case_type`: Type of case (default: "default")
    - `Weight` or `weight`: Interaction weight (default: 1.0)
    """,
)
async def fit_from_csv(
    file: Annotated[UploadFile, File(description="CSV file with litigation data")],
    mode: Annotated[FitMode, Query(description="Fitting mode")] = FitMode.DEMO,
    top_n: Annotated[int, Query(ge=10, le=1000, description="Top N firms")] = 100,
    q_factor: Annotated[float, Query(ge=1.0, description="Q-factor")] = 10.0,
) -> FitResponse:
    """Fit AHPI model from uploaded CSV file."""
    try:
        # Read CSV
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))

        # Normalize column names
        col_map = {
            'PlaintiffFirm': 'plaintiff_firm',
            'Plaintiff firm': 'plaintiff_firm',
            'plaintiff': 'plaintiff_firm',
            'DefendantFirm': 'defendant_firm',
            'Defendant firm': 'defendant_firm',
            'defendant': 'defendant_firm',
            'Outcome': 'outcome',
            'Winner': 'outcome',
            'winner': 'outcome',
            'CaseType': 'case_type',
            'Case type': 'case_type',
            'label': 'case_type',
            'Weight': 'weight',
        }

        df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

        # Validate required columns
        required = {'plaintiff_firm', 'defendant_firm', 'outcome'}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"Missing required columns: {missing}")

        # Fill defaults
        if 'case_type' not in df.columns:
            df['case_type'] = 'default'
        if 'weight' not in df.columns:
            df['weight'] = 1.0

        # Convert to interactions
        interactions = df.to_dict('records')

        # Run fitting
        result = ahpi_service.fit(
            interactions=interactions,
            mode=mode.value,
            q_factor=q_factor,
        )

        rankings = ahpi_service.get_rankings(result.fit_id, top_n=top_n)
        case_params = ahpi_service.get_case_type_params(result.fit_id)

        return FitResponse(
            success=True,
            message=f"Successfully fitted {result.n_interactions} interactions from {file.filename}",
            rankings=[FirmRanking(**r) for r in rankings],
            case_type_params=[CaseTypeParams(**p) for p in case_params],
            statistics={
                "n_interactions": result.n_interactions,
                "n_firms": result.n_firms,
                "n_case_types": result.n_case_types,
                "fit_time_seconds": round(result.fit_time, 2),
                "source_file": file.filename,
            },
            fit_id=result.fit_id,
        )

    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"CSV fitting failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Fitting failed: {str(e)}")


@router.get(
    "/{fit_id}/rankings",
    summary="Get rankings from a fit",
    description="Retrieve firm rankings from a previous fit by ID",
)
async def get_rankings(
    fit_id: str,
    top_n: Annotated[int, Query(ge=1, le=1000)] = 100,
    format: Annotated[str, Query(description="Output format: json or csv")] = "json",
):
    """Get rankings from a cached fit."""
    try:
        rankings = ahpi_service.get_rankings(fit_id, top_n=top_n)

        if format == "csv":
            df = pd.DataFrame(rankings)
            output = io.StringIO()
            df.to_csv(output, index=False)
            output.seek(0)

            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={"Content-Disposition": f"attachment; filename=rankings_{fit_id}.csv"},
            )

        return {"fit_id": fit_id, "rankings": rankings}

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get(
    "/{fit_id}/params",
    summary="Get case type parameters",
    description="Retrieve valence and privilege parameters by case type",
)
async def get_case_params(fit_id: str):
    """Get case type parameters from a cached fit."""
    try:
        params = ahpi_service.get_case_type_params(fit_id)
        return {"fit_id": fit_id, "case_type_params": params}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
