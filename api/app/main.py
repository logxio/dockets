"""
Legal Intelligence API - FastAPI Application

A RESTful API for law firm ranking and litigation outcome prediction
using the AHPI (Asymmetric Heterogeneous Pairwise Interactions) algorithm.

Reference:
    Mahari et al. (2025). "Data-Driven Law Firm Rankings to Reduce Information
    Asymmetry in Legal Disputes." Nature Computational Science.
"""

from contextlib import asynccontextmanager
import importlib.util
import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

# Monorepo dev convenience:
# allow `api` to import local workspace packages (e.g., `packages/pipeline`) without an install step.
_HERE = Path(__file__).resolve()
_REPO_ROOT = _HERE.parents[2]
_PIPELINE_DIR = _REPO_ROOT / "packages" / "pipeline"
if importlib.util.find_spec("pipeline") is None and _PIPELINE_DIR.exists():
    sys.path.insert(0, str(_PIPELINE_DIR))

from .routers import health_router, fit_router, predict_router, matters_router, jobs_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    logger.info("Starting Legal Intelligence API...")

    # Startup: preload AHPI if available
    try:
        import ahpi
        logger.info(f"AHPI package loaded: v{ahpi.__version__}")
    except ImportError:
        logger.warning("AHPI package not installed - using mock mode")

    yield

    # Shutdown
    logger.info("Shutting down Legal Intelligence API...")


# Create FastAPI application
app = FastAPI(
    title="Legal Intelligence API",
    description="""
## Overview

A RESTful API for law firm ranking and litigation outcome prediction
using the AHPI (Asymmetric Heterogeneous Pairwise Interactions) algorithm.

## Features

- **Fit**: Train AHPI model on litigation data
- **Predict**: Predict case outcomes based on firm matchups
- **Counterfactual**: What-if analysis for alternative scenarios

## Endpoints

### Fitting
- `POST /api/fit` - Fit model on JSON interaction data
- `POST /api/fit/csv` - Fit model from uploaded CSV file
- `GET /api/fit/{fit_id}/rankings` - Get rankings from a fit
- `GET /api/fit/{fit_id}/params` - Get case type parameters

### Prediction
- `POST /api/predict` - Predict case outcome
- `POST /api/predict/counterfactual` - What-if analysis
- `GET /api/predict/compare` - Compare two firms

### Health
- `GET /api/health` - Health check

## Reference

Based on the methodology from:

> Mahari et al. (2025). "Data-Driven Law Firm Rankings to Reduce Information
> Asymmetry in Legal Disputes." *Nature Computational Science*.
> [arXiv:2408.16863](https://arxiv.org/abs/2408.16863v2)
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
    contact={
        "name": "Legal Intelligence Workbench",
        "url": "https://github.com/logxio/dockets",
    },
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(health_router, prefix="/api")
app.include_router(fit_router, prefix="/api")
app.include_router(predict_router, prefix="/api")
app.include_router(matters_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")


@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to docs."""
    return RedirectResponse(url="/docs")


def run():
    """Run the API server (for development)."""
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "true").lower() == "true"

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    run()
