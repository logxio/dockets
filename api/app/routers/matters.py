"""
Matter Workspace endpoints (Phase 1).
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import HTMLResponse

from ..models import (
    AuditList,
    CandidateList,
    CreateMatterRequest,
    IntakeJobAccepted,
    CreatePackJobAccepted,
    CreatePackRequest,
    DecisionPack,
    DecisionPackList,
    EvidenceList,
    Job,
    Matter,
    ParseDocumentResponse,
    UpdateMatterRequest,
)
from ..services import (
    enrich_candidates_with_signals,
    list_evidence,
    matter_store,
    recommend_candidates,
    render_pack_html,
    sample_data,
)
from ..services.matter_service import _brief_hash, _estimator_assumptions, _now_iso

try:
    from pipeline.document_parse import extract_text_from_pdf_bytes, parse_text_to_brief
except Exception:  # pragma: no cover
    extract_text_from_pdf_bytes = None  # type: ignore[assignment]
    parse_text_to_brief = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/matters", tags=["matters"])


def _suggest_matter_name_from_parsed_brief(brief: dict) -> str:
    extracted = brief.get("extracted") if isinstance(brief.get("extracted"), dict) else {}
    caption = str(extracted.get("caption") or "").strip()
    if caption:
        court = str(brief.get("court") or "").strip()
        case_type = str(brief.get("caseType") or "").strip()
        suffix = " · ".join([x for x in [case_type, court] if x])
        return f"{caption} — {suffix}" if suffix else caption
    p = str(extracted.get("plaintiff") or "").strip()
    d = str(extracted.get("defendant") or "").strip()
    if p and d:
        return f"{p} v. {d}"
    return "New Matter"


def _run_intake_job(job_id: str, *, file_bytes: bytes | None, text: str | None) -> None:
    """
    Black-box intake pipeline:
    input (PDF/text) -> brief -> matter -> candidates -> decision pack.
    """
    job = matter_store.update_job(job_id, status="running", progress=0.02, result={"stage": "extract"})
    if not job:
        return

    if parse_text_to_brief is None:
        matter_store.update_job(job_id, status="failed", progress=1.0, error="Document parsing not available in this runtime")
        return

    raw_text = ""
    warnings: list[str] = []
    meta: dict = {}
    if file_bytes is not None:
        try:
            from pipeline.document_parse import extract_text_from_pdf_bytes_with_meta  # type: ignore
        except Exception:
            extract_text_from_pdf_bytes_with_meta = None  # type: ignore
        if extract_text_from_pdf_bytes_with_meta:
            raw_text, warnings, meta = extract_text_from_pdf_bytes_with_meta(file_bytes, max_pages=30)
        elif extract_text_from_pdf_bytes is not None:
            raw_text = extract_text_from_pdf_bytes(file_bytes, max_pages=30)
        else:
            matter_store.update_job(job_id, status="failed", progress=1.0, error="PDF extraction not available in this runtime")
            return
    else:
        raw_text = str(text or "")

    try:
        from pipeline.document_parse import normalize_input_text  # type: ignore
    except Exception:
        normalize_input_text = None  # type: ignore
    text_preview = (normalize_input_text(raw_text) if normalize_input_text else raw_text).strip()
    text_preview = text_preview[:900] if text_preview else ""

    matter_store.update_job(job_id, progress=0.18, result={"stage": "parse", "warnings": warnings, "textPreview": text_preview, "meta": meta})
    parsed = parse_text_to_brief(raw_text)
    all_warnings = [*warnings, *(parsed.warnings or [])]

    # Convert parsed brief into our storage schema (snake_case keys).
    try:
        from ..models import MatterBrief
    except Exception:  # pragma: no cover
        MatterBrief = None  # type: ignore
    brief_dict: dict = {}
    if MatterBrief:
        try:
            brief_dict = MatterBrief(**(parsed.brief or {})).model_dump()
        except Exception:
            brief_dict = {}

    name = _suggest_matter_name_from_parsed_brief(parsed.brief or {})
    matter_store.update_job(job_id, progress=0.32, result={"stage": "create_matter", "warnings": all_warnings, "textPreview": text_preview, "meta": meta})
    matter = matter_store.create_matter(name=name, brief=brief_dict)
    matter_id = str(matter.get("id"))

    brief = matter.get("brief") or {}
    case_type = brief.get("case_type") or None
    role = brief.get("role") or None
    opponent_firm = brief.get("opponent_counsel") or None

    matter_store.update_job(job_id, progress=0.42, result={"stage": "recommend", "matterId": matter_id, "warnings": all_warnings})
    candidates = recommend_candidates(sample_data, limit=20, case_type=case_type, role=role, opponent_firm=opponent_firm)
    stored = matter_store.set_candidates(matter_id, candidates)
    candidates = stored or candidates

    top_firm = str(candidates[0].get("firm") or "").strip() if candidates else None
    if top_firm == "":
        top_firm = None

    matter_store.update_job(job_id, progress=0.62, result={"stage": "evidence", "matterId": matter_id, "warnings": all_warnings})
    evidence = list_evidence(
        sample_data,
        case_type=case_type,
        firm=top_firm,
        role=role,
        opponent_firm=opponent_firm,
        limit=50,
    )

    # Ensure any CaseIds cited in explainability are present in the evidence list,
    # so the exported report can render stable, clickable citations.
    cited_ids: list[int] = []
    seen: set[int] = set()
    for c in candidates[:3]:
        ex = c.get("explain")
        if not isinstance(ex, dict):
            continue
        reasons = ex.get("reasons")
        if not isinstance(reasons, list):
            continue
        for r in reasons:
            if not isinstance(r, dict):
                continue
            cits = r.get("citations")
            if not isinstance(cits, list):
                continue
            for cit in cits:
                if not isinstance(cit, dict):
                    continue
                try:
                    cid = int(cit.get("case_id"))
                except Exception:
                    continue
                if cid <= 0 or cid in seen:
                    continue
                seen.add(cid)
                cited_ids.append(cid)

    if cited_ids:
        cited_evidence: list[dict] = []
        for cid in cited_ids[:25]:
            try:
                items = list_evidence(sample_data, case_id=cid, limit=1)
            except Exception:
                items = []
            if items:
                cited_evidence.append(items[0])

        if cited_evidence:
            merged: list[dict] = []
            merged_seen: set[int] = set()

            def _add(xs: list[dict]) -> None:
                for it in xs:
                    if not isinstance(it, dict):
                        continue
                    try:
                        c_id = int(it.get("case_id"))
                    except Exception:
                        continue
                    if c_id <= 0 or c_id in merged_seen:
                        continue
                    merged_seen.add(c_id)
                    merged.append(it)

            _add(cited_evidence)
            _add(evidence)
            evidence = merged[:80]

    packs = matter_store.list_packs(matter_id) or []
    next_version = (max([p.get("version", 0) for p in packs]) + 1) if packs else 1
    pack_id = f"pack_{job_id.split('_', 1)[-1]}"

    created_at = _now_iso()
    export = {
        "html_url": f"/api/matters/{matter_id}/packs/{pack_id}/export.html",
        "pdf_url": None,
        "share_url": None,
    }

    def _reason_bullets(c: dict) -> list[str]:
        signals = c.get("signals") if isinstance(c.get("signals"), dict) else {}
        bullets: list[str] = []
        lift = signals.get("outcome_lift_pct")
        ev_count = signals.get("evidence_count")
        conf = signals.get("confidence")
        if isinstance(lift, int):
            bullets.append(f"Outcome signal: {lift:+d}% win-rate lift vs baseline")
        if isinstance(ev_count, int) and ev_count > 0:
            bullets.append(f"Evidence: {ev_count} comparable matters in snapshot")
        if isinstance(conf, str) and conf:
            bullets.append(f"Confidence: {conf}")
        if opponent_firm:
            bullets.append("Includes opponent-counsel head-to-head when available")
        return bullets[:4]

    pack = {
        "id": pack_id,
        "matter_id": matter_id,
        "version": int(next_version),
        "created_at": created_at,
        "created_by": {"id": "usr_demo", "name": "Demo User"},
        "inputs": {
            "briefHash": _brief_hash(brief),
            "candidateFirms": [c.get("firm") for c in candidates if c.get("firm")],
            "assumptions": _estimator_assumptions(),
        },
        "summary": {
            "recommended": [
                {
                    "firm": str(c.get("firm") or "—"),
                    "reason_bullets": _reason_bullets(c),
                    "confidence": ((c.get("signals") or {}).get("confidence") if isinstance(c.get("signals"), dict) else "unknown") or "unknown",
                }
                for c in candidates[:3]
            ]
            or [{"firm": "—", "reason_bullets": ["No candidates available"], "confidence": "unknown"}],
            "risks": ["settlements not observed", "snapshot evidence only"],
        },
        "export": export,
    }

    matter_store.update_job(job_id, progress=0.82, result={"stage": "pack", "matterId": matter_id, "warnings": all_warnings})
    html_doc = render_pack_html(matter=matter, candidates=candidates, evidence=evidence, pack=pack)
    matter_store.store_pack(matter_id, pack, html_doc)

    matter_store.update_job(
        job_id,
        status="succeeded",
        progress=1.0,
        result={"stage": "done", "matterId": matter_id, "packId": pack_id, "warnings": all_warnings, "textPreview": text_preview, "meta": meta},
    )


@router.post("/parse-document", response_model=ParseDocumentResponse)
async def parse_document(
    file: Annotated[UploadFile | None, File(description="PDF (OCR optional; scanned PDFs supported if OCR fallback is installed)")] = None,
    text: Annotated[str | None, Form(description="Optional raw text (testing / fallback)")] = None,
) -> ParseDocumentResponse:
    """
    Parse an uploaded document (or provided text) into a suggested Matter Brief.

    Phase 1 is offline-friendly: no external calls, heuristic extraction.
    """
    if parse_text_to_brief is None:
        raise HTTPException(status_code=500, detail="Document parsing not available in this runtime")

    if file is None and not text:
        raise HTTPException(status_code=400, detail="Provide `file` or `text`")

    raw_text = ""
    warnings: list[str] = []
    meta: dict = {}
    if file is not None:
        data = await file.read()
        if extract_text_from_pdf_bytes is None:
            raise HTTPException(status_code=500, detail="PDF extraction not available in this runtime")
        try:
            from pipeline.document_parse import extract_text_from_pdf_bytes_with_warnings  # type: ignore
        except Exception:
            extract_text_from_pdf_bytes_with_warnings = None  # type: ignore
        try:
            from pipeline.document_parse import extract_text_from_pdf_bytes_with_meta  # type: ignore
        except Exception:
            extract_text_from_pdf_bytes_with_meta = None  # type: ignore
        if extract_text_from_pdf_bytes_with_warnings:
            if extract_text_from_pdf_bytes_with_meta:
                raw_text, warnings, meta = extract_text_from_pdf_bytes_with_meta(data, max_pages=30)
            else:
                raw_text, warnings = extract_text_from_pdf_bytes_with_warnings(data, max_pages=30)
        else:
            raw_text = extract_text_from_pdf_bytes(data, max_pages=30)
    else:
        raw_text = str(text or "")

    # Provide a lightweight preview for UX/debugging (without dumping full documents).
    preview: str | None = None
    try:
        from pipeline.document_parse import normalize_input_text  # type: ignore
    except Exception:
        normalize_input_text = None  # type: ignore
    if normalize_input_text:
        preview = normalize_input_text(raw_text)[:900].strip() or None
    else:
        preview = raw_text[:900].strip() or None

    parsed = parse_text_to_brief(raw_text)
    all_warnings = [*warnings, *parsed.warnings]
    if preview and not parsed.fields:
        all_warnings.append(
            "We extracted text, but could not confidently map it into fields; review the text preview and fill missing items manually."
        )
    if not preview and file is not None:
        all_warnings.append("No readable text extracted from the PDF; try an OCR'd PDF or paste text instead.")

    return ParseDocumentResponse(brief=parsed.brief, fields=parsed.fields, warnings=all_warnings, text_preview=preview, meta=meta or {})


@router.post("/intake", response_model=IntakeJobAccepted, status_code=202)
async def intake_matter(
    background: BackgroundTasks,
    file: Annotated[UploadFile | None, File(description="PDF (OCR optional; scanned PDFs supported if OCR fallback is installed)")] = None,
    text: Annotated[str | None, Form(description="Optional raw text (testing / fallback)")] = None,
) -> IntakeJobAccepted:
    """
    Black-box pipeline: upload a PDF/text and get a fully populated Matter + candidates + initial Decision Pack.

    Returns an async job; poll `/api/jobs/{jobId}` for progress.
    """
    if file is None and not text:
        raise HTTPException(status_code=400, detail="Provide `file` or `text`")

    file_bytes: bytes | None = None
    if file is not None:
        file_bytes = await file.read()
    job = matter_store.create_job("matter_intake")
    background.add_task(_run_intake_job, job.id, file_bytes=file_bytes, text=text)
    return IntakeJobAccepted(job_id=job.id, status_url=f"/api/jobs/{job.id}")


@router.post("", response_model=Matter, status_code=201)
async def create_matter(req: CreateMatterRequest) -> Matter:
    matter = matter_store.create_matter(name=req.name, brief=(req.brief.model_dump() if req.brief else None))
    return Matter(**matter)


@router.get("", response_model=dict)
async def list_matters(
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    cursor: Annotated[str | None, Query()] = None,
) -> dict:
    # Phase 1: cursor is ignored; kept for forward-compat with contract.
    items = matter_store.list_matters()[:limit]
    return {"items": [Matter(**m).model_dump(by_alias=True) for m in items], "nextCursor": None}


@router.get("/{matter_id}", response_model=Matter)
async def get_matter(matter_id: str) -> Matter:
    matter = matter_store.get_matter(matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return Matter(**matter)


@router.patch("/{matter_id}", response_model=Matter)
async def update_matter(matter_id: str, req: UpdateMatterRequest) -> Matter:
    patch = req.model_dump(exclude_none=True)
    if "brief" in patch and patch["brief"] is not None:
        patch["brief"] = req.brief.model_dump() if req.brief else None
    matter = matter_store.update_matter(matter_id, patch)
    if not matter:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return Matter(**matter)

@router.delete("/{matter_id}", status_code=204)
async def delete_matter(matter_id: str) -> Response:
    ok = matter_store.delete_matter(matter_id)
    if not ok:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return Response(status_code=204)


@router.post("/{matter_id}/candidates:recommend", response_model=CandidateList)
async def recommend_candidates_for_matter(matter_id: str, payload: dict | None = None) -> CandidateList:
    matter = matter_store.get_matter(matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    limit = 20
    if isinstance(payload, dict) and payload.get("limit") is not None:
        try:
            limit = int(payload["limit"])
        except Exception:
            limit = 20
    brief = matter.get("brief") or {}
    opponent_firm = brief.get("opponent_counsel") or None
    items = recommend_candidates(
        sample_data,
        limit=max(1, min(200, limit)),
        case_type=brief.get("case_type") or None,
        role=brief.get("role") or None,
        opponent_firm=opponent_firm,
    )
    return CandidateList(items=items)


@router.put("/{matter_id}/candidates", response_model=CandidateList)
async def set_candidates_for_matter(matter_id: str, req: CandidateList) -> CandidateList:
    items = matter_store.set_candidates(matter_id, [c.model_dump() for c in req.items])
    if items is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return CandidateList(items=items)


@router.get("/{matter_id}/candidates", response_model=CandidateList)
async def get_candidates_for_matter(matter_id: str) -> CandidateList:
    matter = matter_store.get_matter(matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    items = matter_store.get_candidates(matter_id) or []
    brief = matter.get("brief") or {}
    items = enrich_candidates_with_signals(
        items,
        case_type=brief.get("case_type") or None,
        role=brief.get("role") or None,
        opponent_firm=brief.get("opponent_counsel") or None,
    )
    return CandidateList(items=items)


@router.get("/{matter_id}/evidence", response_model=EvidenceList)
async def list_matter_evidence(
    matter_id: str,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    case_id: Annotated[int | None, Query(alias="caseId", ge=1)] = None,
) -> EvidenceList:
    matter = matter_store.get_matter(matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    brief = matter.get("brief") or {}
    case_type = brief.get("case_type") or None
    role = brief.get("role") or None
    opponent_firm = brief.get("opponent_counsel") or None
    candidates = matter_store.get_candidates(matter_id) or []
    top_firm = str(candidates[0].get("firm") or "").strip() if candidates else None
    if top_firm == "":
        top_firm = None

    if case_id is not None:
        items = list_evidence(sample_data, case_id=case_id, limit=limit)
    else:
        items = list_evidence(
            sample_data,
            case_type=case_type,
            firm=top_firm,
            role=role,
            opponent_firm=opponent_firm,
            limit=limit,
        )
    return EvidenceList(items=items)


def _generate_pack_job(job_id: str, matter_id: str) -> None:
    job = matter_store.update_job(job_id, status="running", progress=0.15, result={})
    if not job:
        return

    matter = matter_store.get_matter(matter_id)
    if not matter:
        matter_store.update_job(job_id, status="failed", progress=1.0, error="Matter not found")
        return

    brief = matter.get("brief") or {}
    case_type = brief.get("case_type") or None
    role = brief.get("role") or None
    opponent_firm = brief.get("opponent_counsel") or None

    candidates = matter_store.get_candidates(matter_id) or []
    if not candidates:
        matter_store.update_job(job_id, progress=0.25)
        candidates = recommend_candidates(
            sample_data,
            limit=20,
            case_type=case_type,
            role=role,
            opponent_firm=opponent_firm,
        )
        # Persist recommendations so the workspace remains self-contained.
        stored = matter_store.set_candidates(matter_id, candidates)
        candidates = stored or candidates
    else:
        candidates = enrich_candidates_with_signals(candidates, case_type=case_type, role=role, opponent_firm=opponent_firm)

    top_firm = str(candidates[0].get("firm") or "").strip() if candidates else None
    if top_firm == "":
        top_firm = None

    matter_store.update_job(job_id, progress=0.4)
    evidence = list_evidence(
        sample_data,
        case_type=case_type,
        firm=top_firm,
        role=role,
        opponent_firm=opponent_firm,
        limit=50,
    )

    packs = matter_store.list_packs(matter_id) or []
    next_version = (max([p.get("version", 0) for p in packs]) + 1) if packs else 1
    pack_id = f"pack_{job_id.split('_', 1)[-1]}"

    created_at = _now_iso()
    export = {
        "html_url": f"/api/matters/{matter_id}/packs/{pack_id}/export.html",
        "pdf_url": None,
        "share_url": None,
    }

    def _reason_bullets(c: dict) -> list[str]:
        signals = c.get("signals") if isinstance(c.get("signals"), dict) else {}
        bullets: list[str] = []
        lift = signals.get("outcome_lift_pct")
        ev_count = signals.get("evidence_count")
        conf = signals.get("confidence")
        if isinstance(lift, int):
            bullets.append(f"Outcome signal: {lift:+d}% win-rate lift vs baseline")
        if isinstance(ev_count, int) and ev_count > 0:
            bullets.append(f"Evidence: {ev_count} comparable matters in snapshot")
        if isinstance(conf, str) and conf:
            bullets.append(f"Confidence: {conf}")
        if opponent_firm:
            bullets.append("Includes opponent-counsel head-to-head when available")
        return bullets[:4]

    pack = {
        "id": pack_id,
        "matter_id": matter_id,
        "version": int(next_version),
        "created_at": created_at,
        "created_by": {"id": "usr_demo", "name": "Demo User"},
        "inputs": {
            "briefHash": _brief_hash(brief),
            "candidateFirms": [c.get("firm") for c in candidates if c.get("firm")],
            "assumptions": _estimator_assumptions(),
        },
        "summary": {
            "recommended": [
                {
                    "firm": str(c.get("firm") or "—"),
                    "reason_bullets": _reason_bullets(c),
                    "confidence": ((c.get("signals") or {}).get("confidence") if isinstance(c.get("signals"), dict) else "unknown") or "unknown",
                }
                for c in candidates[:3]
            ] or [{"firm": "—", "reason_bullets": ["No candidates available"], "confidence": "unknown"}],
            "risks": ["settlements not observed", "snapshot evidence only"],
        },
        "export": export,
    }

    matter_store.update_job(job_id, progress=0.75)
    html_doc = render_pack_html(matter=matter, candidates=candidates, evidence=evidence, pack=pack)
    matter_store.store_pack(matter_id, pack, html_doc)

    matter_store.update_job(job_id, status="succeeded", progress=1.0, result={"packId": pack_id})


@router.post("/{matter_id}/packs", response_model=CreatePackJobAccepted, status_code=202)
async def create_pack(matter_id: str, req: CreatePackRequest, background: BackgroundTasks) -> CreatePackJobAccepted:
    matter = matter_store.get_matter(matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    job = matter_store.create_job("pack_generate")
    background.add_task(_generate_pack_job, job.id, matter_id)
    return CreatePackJobAccepted(job_id=job.id, status_url=f"/api/jobs/{job.id}")


@router.get("/{matter_id}/packs", response_model=DecisionPackList)
async def list_packs(matter_id: str, limit: Annotated[int, Query(ge=1, le=100)] = 20) -> DecisionPackList:
    items = matter_store.list_packs(matter_id)
    if items is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    packs = [DecisionPack(**p) for p in items[:limit]]
    return DecisionPackList(items=packs)


@router.get("/{matter_id}/packs/{pack_id}", response_model=DecisionPack)
async def get_pack(matter_id: str, pack_id: str) -> DecisionPack:
    p = matter_store.get_pack(matter_id, pack_id)
    if not p:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return DecisionPack(**p)


@router.get("/{matter_id}/packs/{pack_id}/export.html", response_class=HTMLResponse)
async def export_pack_html(matter_id: str, pack_id: str) -> HTMLResponse:
    html_doc = matter_store.get_pack_html(matter_id, pack_id)
    if html_doc is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return HTMLResponse(content=html_doc, status_code=200)


@router.get("/{matter_id}/audit", response_model=AuditList)
async def list_audit(matter_id: str, limit: Annotated[int, Query(ge=1, le=200)] = 100) -> AuditList:
    items = matter_store.list_audit(matter_id)
    if items is None:
        raise HTTPException(status_code=404, detail="NOT_FOUND")
    return AuditList(items=items[:limit])
