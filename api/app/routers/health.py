"""
Health check endpoint.
"""

from fastapi import APIRouter

from ..models import HealthResponse
from ..services import ahpi_service

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Check API health status and version information",
)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.

    Returns:
        Service status, version info, and active fit count.
    """
    try:
        import ahpi
        ahpi_version = ahpi.__version__
    except (ImportError, AttributeError):
        ahpi_version = "not installed"

    return HealthResponse(
        status="ok",
        version="1.0.0",
        ahpi_version=ahpi_version,
        active_fits=ahpi_service.get_active_fits(),
    )


@router.get(
    "/",
    summary="API root",
    description="Welcome message and API info",
)
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Legal Intelligence API",
        "version": "1.0.0",
        "description": "AHPI-based law firm ranking and prediction API",
        "docs": "/docs",
        "health": "/api/health",
    }
