"""
API Routers.
"""

from .health import router as health_router
from .fit import router as fit_router
from .predict import router as predict_router
from .matters import router as matters_router
from .jobs import router as jobs_router

__all__ = ["health_router", "fit_router", "predict_router", "matters_router", "jobs_router"]
