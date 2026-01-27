"""
Async job status endpoints (Phase 1).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..models import Job
from ..services import matter_store

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=Job)
async def get_job(job_id: str) -> Job:
    job = matter_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return Job(
        id=job.id,
        type=job.type,
        status=job.status,  # type: ignore[arg-type]
        progress=job.progress,
        result=job.result,
        error=job.error,
    )

