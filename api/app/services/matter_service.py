"""
Matter Workspace service (Phase 1).

Phase 1 intentionally uses in-memory storage (single-process friendly)
to unblock the Pilot. Phase 2 can swap this with a real DB.
"""

from __future__ import annotations

import hashlib
import html
import json
import threading
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd

try:
    from pipeline.matter_signals import (
        OfflineKB,
        compute_candidate_outcome_signal as kb_compute_candidate_outcome_signal,
        list_evidence as kb_list_evidence,
        recommend_candidates as kb_recommend_candidates,
    )
except Exception:  # pragma: no cover
    OfflineKB = None  # type: ignore[assignment]
    kb_compute_candidate_outcome_signal = None  # type: ignore[assignment]
    kb_list_evidence = None  # type: ignore[assignment]
    kb_recommend_candidates = None  # type: ignore[assignment]


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _normalize_firm_key(s: str) -> str:
    return " ".join(str(s or "").strip().lower().split())

def _normalize_outcome(s: Any) -> str | None:
    raw = _normalize_firm_key(str(s or ""))
    if not raw:
        return None
    if raw in ("defendantwin", "defendant_win", "def win", "defendant won", "defendant"):
        return "defendant_win"
    if raw in ("plaintiffwin", "plaintiff_win", "plt win", "plaintiff won", "plaintiff"):
        return "plaintiff_win"
    return str(s)


def _repo_root() -> Path:
    # api/app/services -> app -> api -> repo_root
    return Path(__file__).resolve().parents[3]


def _default_sample_dir() -> Path:
    return _repo_root() / "packages" / "frontend" / "public" / "sample"


def _safe_int(v: Any) -> int | None:
    try:
        n = int(v)
        return n
    except Exception:
        return None


def _brief_hash(brief: dict[str, Any]) -> str:
    blob = json.dumps(brief or {}, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(blob).hexdigest()


@dataclass
class JobRecord:
    id: str
    type: str
    status: str
    progress: float
    result: dict[str, Any]
    error: str | None = None


class MatterStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._matters: dict[str, dict[str, Any]] = {}
        self._candidates: dict[str, list[dict[str, Any]]] = {}
        self._packs: dict[str, list[dict[str, Any]]] = {}
        self._pack_html: dict[tuple[str, str], str] = {}  # (matterId, packId) -> html
        self._jobs: dict[str, JobRecord] = {}
        self._audit: dict[str, list[dict[str, Any]]] = {}

    def _audit_add(self, matter_id: str, action: str, meta: dict[str, Any] | None = None) -> None:
        evt = {
            "id": _new_id("aud"),
            "at": _now_iso(),
            "actor": {"id": "usr_demo", "name": "Demo User"},
            "action": action,
            "meta": meta or {},
        }
        self._audit.setdefault(matter_id, []).insert(0, evt)

    def create_matter(self, name: str, brief: dict[str, Any] | None = None) -> dict[str, Any]:
        with self._lock:
            mid = _new_id("mat")
            now = _now_iso()
            m = {
                "id": mid,
                "name": name,
                "status": "draft",
                "created_at": now,
                "updated_at": now,
                "brief": brief or {},
            }
            self._matters[mid] = m
            self._candidates[mid] = []
            self._packs[mid] = []
            self._audit[mid] = []
            self._audit_add(mid, "matter_created", {"name": name})
            return m

    def list_matters(self) -> list[dict[str, Any]]:
        with self._lock:
            return sorted(self._matters.values(), key=lambda x: x.get("updated_at", ""), reverse=True)

    def get_matter(self, matter_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._matters.get(matter_id)

    def update_matter(self, matter_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            m = self._matters.get(matter_id)
            if not m:
                return None
            changed = {}
            if "name" in patch and patch["name"] is not None:
                m["name"] = patch["name"]
                changed["name"] = patch["name"]
            if "status" in patch and patch["status"] is not None:
                m["status"] = patch["status"]
                changed["status"] = patch["status"]
            if "brief" in patch and patch["brief"] is not None:
                m["brief"] = patch["brief"]
                changed["briefHash"] = _brief_hash(patch["brief"])
            m["updated_at"] = _now_iso()
            if changed:
                self._audit_add(matter_id, "matter_updated", changed)
            return m

    def delete_matter(self, matter_id: str) -> bool:
        with self._lock:
            if matter_id not in self._matters:
                return False
            del self._matters[matter_id]
            self._candidates.pop(matter_id, None)
            self._packs.pop(matter_id, None)
            self._audit.pop(matter_id, None)
            # Remove any stored HTML exports for this matter.
            for key in [k for k in self._pack_html.keys() if k[0] == matter_id]:
                self._pack_html.pop(key, None)
            return True

    def set_candidates(self, matter_id: str, items: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
        with self._lock:
            if matter_id not in self._matters:
                return None
            self._candidates[matter_id] = items
            self._audit_add(matter_id, "candidates_set", {"count": len(items)})
            return items

    def get_candidates(self, matter_id: str) -> list[dict[str, Any]] | None:
        with self._lock:
            if matter_id not in self._matters:
                return None
            return list(self._candidates.get(matter_id) or [])

    def create_job(self, job_type: str) -> JobRecord:
        with self._lock:
            jid = _new_id("job")
            job = JobRecord(id=jid, type=job_type, status="queued", progress=0.0, result={})
            self._jobs[jid] = job
            return job

    def update_job(self, job_id: str, *, status: str | None = None, progress: float | None = None, result: dict[str, Any] | None = None, error: str | None = None) -> JobRecord | None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = progress
            if result is not None:
                job.result = result
            job.error = error
            return job

    def get_job(self, job_id: str) -> JobRecord | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list_audit(self, matter_id: str) -> list[dict[str, Any]] | None:
        with self._lock:
            if matter_id not in self._matters:
                return None
            return list(self._audit.get(matter_id) or [])

    def list_packs(self, matter_id: str) -> list[dict[str, Any]] | None:
        with self._lock:
            if matter_id not in self._matters:
                return None
            return list(self._packs.get(matter_id) or [])

    def get_pack(self, matter_id: str, pack_id: str) -> dict[str, Any] | None:
        with self._lock:
            for p in self._packs.get(matter_id) or []:
                if p.get("id") == pack_id:
                    return p
            return None

    def get_pack_html(self, matter_id: str, pack_id: str) -> str | None:
        with self._lock:
            return self._pack_html.get((matter_id, pack_id))

    def _next_pack_version(self, matter_id: str) -> int:
        packs = self._packs.get(matter_id) or []
        if not packs:
            return 1
        return max(int(p.get("version") or 0) for p in packs) + 1

    def store_pack(self, matter_id: str, pack: dict[str, Any], html_doc: str) -> dict[str, Any]:
        with self._lock:
            self._packs.setdefault(matter_id, []).insert(0, pack)
            self._pack_html[(matter_id, pack["id"])] = html_doc
            self._audit_add(matter_id, "pack_generated", {"packId": pack["id"], "version": pack["version"]})
            return pack


class SampleData:
    def __init__(self, sample_dir: Path | None = None) -> None:
        self._sample_dir = sample_dir or _default_sample_dir()
        self._lock = threading.Lock()
        self._rankings: pd.DataFrame | None = None
        self._cases: pd.DataFrame | None = None

    def _load_csv(self, path: Path) -> pd.DataFrame:
        return pd.read_csv(path)

    def rankings(self) -> pd.DataFrame:
        with self._lock:
            if self._rankings is not None:
                return self._rankings
            path = self._sample_dir / "mahari_exp_scores.csv"
            if not path.exists():
                self._rankings = pd.DataFrame(columns=["Rank", "Firm", "Score", "ExpScore"])
                return self._rankings
            self._rankings = self._load_csv(path)
            return self._rankings

    def cases(self) -> pd.DataFrame:
        with self._lock:
            if self._cases is not None:
                return self._cases
            path = self._sample_dir / "mahari_fig2_moesm4_cases.csv"
            if not path.exists():
                self._cases = pd.DataFrame(columns=["CaseId", "CaseType", "Court", "Year", "Outcome"])
                return self._cases
            self._cases = self._load_csv(path)
            return self._cases


def _enrich_candidates_with_signals(
    items: list[dict[str, Any]],
    *,
    case_type: str | None,
    role: str | None,
    opponent_firm: str | None,
) -> list[dict[str, Any]]:
    if not items:
        return items
    if not (offline_kb and kb_compute_candidate_outcome_signal):
        return items
    if role not in ("plaintiff", "defendant"):
        return items

    snapshot_files: list[str] = []
    try:
        snapshot_files = [
            offline_kb.paths.exp_scores_csv.name,
            offline_kb.paths.interactions_csv.name,
            offline_kb.paths.cases_csv.name,
        ]
    except Exception:
        snapshot_files = []

    for c in items:
        firm = str(c.get("firm") or "").strip()
        if not firm:
            continue
        try:
            sig = kb_compute_candidate_outcome_signal(
                offline_kb,
                firm=firm,
                role=role,  # type: ignore[arg-type]
                case_type=case_type,
                opponent_firm=opponent_firm,
                baseline_defendant_win_rate_pct=83,
            )
        except Exception:
            continue

        signals = c.setdefault("signals", {})
        if isinstance(sig, dict):
            lift = sig.get("winRateLiftPct")
            confidence = sig.get("confidence")
            meta = sig.get("meta") if isinstance(sig.get("meta"), dict) else {}
            n_ev = meta.get("nEvidenceCases") if isinstance(meta, dict) else None
            used_h2h = bool(meta.get("usedHeadToHead")) if isinstance(meta, dict) else False

            if isinstance(lift, int):
                signals["outcome_lift_pct"] = lift
            if isinstance(confidence, str) and confidence:
                signals["confidence"] = confidence
            if isinstance(n_ev, int):
                # Prefer case-level unique count when available.
                try:
                    prev = int(signals.get("evidence_count") or 0)
                except Exception:
                    prev = 0
                signals["evidence_count"] = max(prev, n_ev)

            # Explainability (white-box): stable reason codes + citations to CaseId.
            citations: list[dict[str, Any]] = []
            if offline_kb and kb_list_evidence:
                try:
                    ev_items = kb_list_evidence(
                        offline_kb,
                        case_type=case_type,
                        firm=firm,
                        role=role,  # type: ignore[arg-type]
                        opponent_firm=opponent_firm,
                        limit=3,
                    )
                    for e in ev_items or []:
                        cid = _safe_int(e.get("case_id"))
                        if cid is None:
                            continue
                        why = e.get("why_relevant")
                        why_str = "; ".join([str(x) for x in why]) if isinstance(why, list) else (str(why) if why else None)
                        citations.append(
                            {
                                "case_id": cid,
                                "why": why_str,
                                "similarity": e.get("similarity"),
                            }
                        )
                except Exception:
                    citations = []

            predicted = sig.get("predictedWinRatePct")
            baseline_def = sig.get("baselineDefendantWinRatePct")
            summary_parts: list[str] = []
            if isinstance(predicted, int):
                summary_parts.append(f"Predicted win rate: {predicted}%")
            if isinstance(lift, int):
                summary_parts.append(f"Lift vs baseline: {lift:+d}%")
            if isinstance(baseline_def, int):
                summary_parts.append(f"Baseline(defendant): {baseline_def}%")
            if isinstance(confidence, str) and confidence:
                summary_parts.append(f"Confidence: {confidence}")
            outcome_summary = " · ".join(summary_parts) if summary_parts else "Outcome signal unavailable"

            reasons: list[dict[str, Any]] = [
                {
                    "code": "outcome_signal",
                    "title": "Outcome Signal",
                    "summary": outcome_summary,
                    "citations": citations,
                }
            ]
            if isinstance(n_ev, int) and n_ev > 0:
                reasons.append(
                    {
                        "code": "evidence_coverage",
                        "title": "Evidence Coverage",
                        "summary": f"{n_ev} comparable matters in offline snapshot (case-type slice).",
                        "citations": citations,
                    }
                )
            if opponent_firm and used_h2h:
                reasons.append(
                    {
                        "code": "head_to_head",
                        "title": "Opponent Matchup",
                        "summary": "Head-to-head evidence available vs opponent counsel (when present in snapshot).",
                        "citations": citations,
                    }
                )

            c["explain"] = {
                "reasons": reasons[:4],
                "confidence": {
                    "level": confidence if isinstance(confidence, str) and confidence else "unknown",
                    "n_evidence_cases": int(n_ev) if isinstance(n_ev, int) and n_ev >= 0 else 0,
                    "used_head_to_head": bool(used_h2h),
                },
                "limitations": [str(x) for x in (sig.get("limitations") or [])] if isinstance(sig.get("limitations"), list) else ["offline snapshot evidence"],
                "snapshot": {"files": snapshot_files},
            }

    return items


def enrich_candidates_with_signals(
    items: list[dict[str, Any]],
    *,
    case_type: str | None,
    role: str | None,
    opponent_firm: str | None,
) -> list[dict[str, Any]]:
    """
    Best-effort enrichment for CandidateFirm objects already stored/constructed.

    This is intentionally offline-friendly and only activates when the snapshot KB is available.
    """
    return _enrich_candidates_with_signals(items, case_type=case_type, role=role, opponent_firm=opponent_firm)


def recommend_candidates(
    sample: SampleData,
    *,
    limit: int = 20,
    case_type: str | None = None,
    role: str | None = None,
    opponent_firm: str | None = None,
) -> list[dict[str, Any]]:
    if offline_kb and kb_recommend_candidates:
        items = kb_recommend_candidates(offline_kb, case_type=case_type, role=role, limit=limit)
        return _enrich_candidates_with_signals(items, case_type=case_type, role=role, opponent_firm=opponent_firm)

    df = sample.rankings()
    if df.empty:
        return []
    out: list[dict[str, Any]] = []
    for _, row in df.sort_values("Rank").head(max(1, min(2000, limit))).iterrows():
        firm = str(row.get("Firm") or "").strip()
        if not firm:
            continue
        firm_key = _normalize_firm_key(firm)
        out.append(
            {
                "firm": firm,
                "firm_key": firm_key,
                "tier": "recommended",
                "signals": {"outcome_lift_pct": None, "confidence": "unknown", "evidence_count": 0},
                "cost": {"hourly_rate_usd": None, "alt_fee": None, "source": "unknown"},
                "notes": None,
            }
        )
    return _enrich_candidates_with_signals(out, case_type=case_type, role=role, opponent_firm=opponent_firm)


def list_evidence(
    sample: SampleData,
    *,
    case_type: str | None = None,
    firm: str | None = None,
    role: str | None = None,
    opponent_firm: str | None = None,
    case_id: int | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    if offline_kb and kb_list_evidence:
        if case_id is not None:
            try:
                cid = int(case_id)
            except Exception:
                return []
            try:
                cases = offline_kb.cases()
                row = cases[cases["CaseId"].astype(str) == str(cid)].head(1)
                if row.empty:
                    return []
                r = row.iloc[0]
                winner = _safe_int(r.get("Winner"))
                outcome = "unknown"
                if winner == 1:
                    outcome = "defendant_win"
                elif winner == 0:
                    outcome = "plaintiff_win"
                return [
                    {
                        "case_id": cid,
                        "caption": None,
                        "court": str(r.get("Court") or "") or None,
                        "year": _safe_int(r.get("Year")),
                        "case_type": str(r.get("CaseType") or "") or None,
                        "outcome": outcome,
                        "similarity": 1.0,
                        "why_relevant": ["filtered by CaseId"],
                        "source": {"provider": "CAP", "url": None, "snapshot": offline_kb.paths.cases_csv.name},
                    }
                ]
            except Exception:
                return []

        return kb_list_evidence(
            offline_kb,
            case_type=case_type,
            firm=firm,
            role=role,
            opponent_firm=opponent_firm,
            limit=max(1, min(200, limit)),
        )

    df = sample.cases()
    if df.empty:
        return []
    view = df
    if case_id is not None:
        view = view[view["CaseId"].astype(str) == str(case_id)]
    if case_type:
        # CAP labels in snapshot may vary; do a forgiving match.
        view = view[view["CaseType"].astype(str).str.lower().str.contains(str(case_type).lower(), na=False)]
    view = view.head(max(1, min(500, limit)))
    out: list[dict[str, Any]] = []
    for _, row in view.iterrows():
        cid = _safe_int(row.get("CaseId"))
        if cid is None:
            continue
        out.append(
            {
                "case_id": cid,
                "caption": None,
                "court": str(row.get("Court") or "") or None,
                "year": _safe_int(row.get("Year")),
                "case_type": str(row.get("CaseType") or "") or None,
                "outcome": _normalize_outcome(row.get("Outcome")),
                "similarity": None,
                "why_relevant": ["sample dataset"],
                "source": {"provider": "CAP", "url": None, "snapshot": "mahari_fig2_moesm4_cases.csv"},
            }
        )
    return out


def render_pack_html(*, matter: dict[str, Any], candidates: list[dict[str, Any]], evidence: list[dict[str, Any]], pack: dict[str, Any]) -> str:
    """
    High-signal, executive-style Decision Pack export (Phase 1, offline-friendly).

    Design goals:
    - Lead with a clear recommendation (saves user time)
    - Keep explainability evidence-driven (CaseId citations)
    - Make it printable / shareable (report-like, not an app page)
    """
    matter_name = matter.get("name") or matter.get("id") or "Matter"
    title = f"Decision Pack — {matter_name}"
    brief = matter.get("brief") or {}
    top = candidates[:3]
    primary = top[0] if top else None

    def esc(s: Any) -> str:
        return html.escape("" if s is None else str(s))

    def get_signal(c: dict[str, Any] | None, key: str, default: Any = None) -> Any:
        if not isinstance(c, dict):
            return default
        sig = c.get("signals")
        if not isinstance(sig, dict):
            return default
        return sig.get(key, default)

    def _as_int(v: Any) -> int | None:
        try:
            return int(v)
        except Exception:
            return None

    def fmt_signed_pct(v: Any) -> str:
        n = _as_int(v)
        if n is None:
            return "—"
        return f"{n:+d}%"

    def fmt_conf(v: Any) -> str:
        s = str(v or "unknown")
        return s if s in ("high", "medium", "low", "unknown") else "unknown"

    # Build a stable reference map for CaseId citations.
    ref_order: list[int] = []
    for e in evidence or []:
        cid = _as_int(e.get("case_id") if isinstance(e, dict) else None)
        if cid is None or cid <= 0:
            continue
        if cid not in ref_order:
            ref_order.append(cid)
    ref_index = {cid: i + 1 for i, cid in enumerate(ref_order)}

    def render_citation_links(cits: Any) -> str:
        if not isinstance(cits, list) or not cits:
            return ""
        links: list[str] = []
        for cit in cits[:6]:
            if not isinstance(cit, dict):
                continue
            cid = _as_int(cit.get("case_id"))
            if cid is None or cid <= 0:
                continue
            idx = ref_index.get(cid)
            label = f"[{idx}]" if idx is not None else f"[CaseId {cid}]"
            links.append(f"<a class=\"ref\" href=\"#case-{cid}\">{esc(label)}</a>")
        return "".join(links)

    def render_reason_block(r: dict[str, Any]) -> str:
        title = str(r.get("title") or r.get("code") or "Reason")
        summary = str(r.get("summary") or "")
        refs = render_citation_links(r.get("citations"))
        refs_html = f"<div class=\"refs\">{refs}</div>" if refs else ""
        return f"""
          <div class="reason">
            <div class="reason-title">{esc(title)}</div>
            <div class="reason-summary">{esc(summary)}</div>
            {refs_html}
          </div>
        """

    def render_explain_section(c: dict[str, Any]) -> str:
        ex = c.get("explain") if isinstance(c.get("explain"), dict) else {}
        reasons = ex.get("reasons") if isinstance(ex.get("reasons"), list) else []
        conf = ex.get("confidence") if isinstance(ex.get("confidence"), dict) else {}
        limitations = ex.get("limitations") if isinstance(ex.get("limitations"), list) else []
        snapshot = ex.get("snapshot") if isinstance(ex.get("snapshot"), dict) else {}
        files = snapshot.get("files") if isinstance(snapshot.get("files"), list) else []

        conf_level = fmt_conf(conf.get("level"))
        n_cases = _as_int(conf.get("n_evidence_cases")) or 0
        used_h2h = bool(conf.get("used_head_to_head"))

        reason_html = "".join(render_reason_block(r) for r in reasons[:3] if isinstance(r, dict)) or "<div class=\"muted\">No reasons available.</div>"
        lim_html = "".join(f"<li>{esc(x)}</li>" for x in limitations[:6]) or "<li class=\"muted\">None</li>"
        files_html = ", ".join([esc(f) for f in files]) if files else "—"

        return f"""
          <div class="explain">
            <div class="meta-row">
              <div class="pill">confidence: <strong>{esc(conf_level)}</strong></div>
              <div class="pill">evidence: <strong>n={esc(n_cases)}</strong></div>
              <div class="pill">head-to-head: <strong>{esc('yes' if used_h2h else 'no')}</strong></div>
            </div>
            <div class="reason-list">
              {reason_html}
            </div>
            <details class="details">
              <summary>Risks & Limitations</summary>
              <ul class="ul">{lim_html}</ul>
            </details>
            <div class="muted small">Snapshot files: {files_html}</div>
          </div>
        """

    # Executive summary content
    primary_firm = str(primary.get("firm") or "—") if isinstance(primary, dict) else "—"
    primary_lift = fmt_signed_pct(get_signal(primary, "outcome_lift_pct"))
    primary_conf = fmt_conf(get_signal(primary, "confidence"))
    primary_ev = _as_int(get_signal(primary, "evidence_count")) or 0
    court = brief.get("court") or "—"
    case_type = brief.get("case_type") or "—"
    role = brief.get("role") or "—"
    opponent = brief.get("opponent_name") or brief.get("opponent_counsel") or "—"

    alternatives_rows = "\n".join(
        f"""
        <tr>
          <td class="rank">{i+1}</td>
          <td class="firm">{esc(str(c.get('firm') or '—'))}</td>
          <td class="num">{esc(fmt_signed_pct(get_signal(c, 'outcome_lift_pct')))}</td>
          <td class="num">{esc(_as_int(get_signal(c, 'evidence_count')) or 0)}</td>
          <td><span class="badge {esc(fmt_conf(get_signal(c, 'confidence')))}">{esc(fmt_conf(get_signal(c, 'confidence')))}</span></td>
        </tr>
        """
        for i, c in enumerate(top)
        if isinstance(c, dict)
    )
    if not alternatives_rows:
        alternatives_rows = '<tr><td colspan="5" class="muted">No candidates available.</td></tr>'

    evidence_rows = "\n".join(
        f"""
        <tr id="case-{esc(_as_int(e.get('case_id')) or 0)}">
          <td class="num">{esc(ref_index.get(_as_int(e.get('case_id')) or 0) or '—')}</td>
          <td class="num"><code>CaseId {esc(e.get('case_id'))}</code></td>
          <td>{esc(e.get('court') or '—')}</td>
          <td class="num">{esc(e.get('year') or '—')}</td>
          <td>{esc(e.get('case_type') or '—')}</td>
          <td>{esc(e.get('outcome') or 'unknown')}</td>
          <td class="muted">{esc('; '.join(e.get('why_relevant') or []) if isinstance(e.get('why_relevant'), list) else (e.get('why_relevant') or ''))}</td>
        </tr>
        """
        for e in (evidence or [])[:80]
        if isinstance(e, dict)
    )
    if not evidence_rows:
        evidence_rows = '<tr><td colspan="7" class="muted">No evidence available.</td></tr>'

    pack_id = pack.get("id") or "—"
    pack_version = pack.get("version") or "—"
    created_at = pack.get("created_at") or "—"
    brief_hash = None
    try:
        inputs = pack.get("inputs") if isinstance(pack.get("inputs"), dict) else {}
        brief_hash = inputs.get("briefHash")
    except Exception:
        brief_hash = None

    primary_explain_html = render_explain_section(primary) if isinstance(primary, dict) else ""

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{esc(title)}</title>
  <style>
    :root {{
      --bg: #f8fafc;
      --card: #ffffff;
      --border: rgba(15, 23, 42, 0.12);
      --muted: rgba(15, 23, 42, 0.62);
      --text: rgba(15, 23, 42, 0.96);
      --accent: rgba(8, 145, 178, 1);
      --success: rgba(16, 185, 129, 1);
      --danger: rgba(220, 38, 38, 1);
      --radius: 16px;
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      line-height: 1.35;
    }}
    .page {{
      max-width: 980px;
      margin: 28px auto;
      padding: 0 18px 42px;
    }}
    .header {{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: linear-gradient(135deg, rgba(8,145,178,0.10), rgba(16,185,129,0.06));
    }}
    .h-title {{
      margin: 0;
      font-size: 18px;
      font-weight: 860;
      letter-spacing: -0.01em;
    }}
    .h-sub {{
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
    }}
    .meta {{
      text-align: right;
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }}
    .section {{
      margin-top: 14px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card);
    }}
    .section-title {{
      margin: 0 0 10px;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(15, 23, 42, 0.78);
    }}
    .row {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }}
    .pill {{
      display: inline-flex;
      gap: 6px;
      align-items: center;
      padding: 7px 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(15, 23, 42, 0.03);
      font-size: 12px;
      color: rgba(15, 23, 42, 0.72);
    }}
    .pill strong {{ color: rgba(15, 23, 42, 0.92); }}
    .hero {{
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      align-items: stretch;
      justify-content: space-between;
    }}
    .hero-left {{ min-width: 280px; flex: 1; }}
    .hero-right {{ min-width: 260px; width: 320px; }}
    .rec {{
      font-size: 16px;
      font-weight: 900;
      letter-spacing: -0.01em;
    }}
    .kpi {{
      margin-top: 10px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }}
    .kpi .box {{
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 10px 12px;
      background: rgba(255,255,255,0.7);
    }}
    .kpi .k {{ font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }}
    .kpi .v {{ margin-top: 6px; font-size: 14px; font-weight: 900; }}
    .badge {{
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      border: 1px solid var(--border);
      background: rgba(15,23,42,0.03);
      color: rgba(15,23,42,0.74);
    }}
    .badge.high {{ border-color: rgba(16,185,129,0.32); background: rgba(16,185,129,0.10); color: rgba(6,95,70,0.96); }}
    .badge.medium {{ border-color: rgba(245,158,11,0.28); background: rgba(245,158,11,0.12); color: rgba(180,83,9,0.96); }}
    .badge.low {{ border-color: rgba(15,23,42,0.12); }}
    .badge.unknown {{ border-color: rgba(15,23,42,0.12); }}
    .callout {{
      border: 1px solid rgba(8,145,178,0.22);
      background: rgba(8,145,178,0.06);
      border-radius: 14px;
      padding: 12px 12px;
      color: rgba(6,95,70,0.96);
      font-size: 12px;
    }}
    .ul {{ margin: 10px 0 0 18px; padding: 0; }}
    .ul li {{ margin: 6px 0; color: rgba(15, 23, 42, 0.86); font-size: 12px; }}
    .muted {{ color: var(--muted); }}
    .small {{ font-size: 12px; }}
    .explain .meta-row {{ margin-bottom: 10px; }}
    .reason-list {{ display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }}
    .reason {{ border-top: 1px dashed rgba(15,23,42,0.14); padding-top: 10px; }}
    .reason:first-child {{ border-top: none; padding-top: 0; }}
    .reason-title {{ font-weight: 900; font-size: 12px; }}
    .reason-summary {{ margin-top: 6px; font-size: 12px; color: rgba(15,23,42,0.78); }}
    .refs {{ margin-top: 8px; }}
    .ref {{
      display: inline-block;
      margin-right: 6px;
      font-size: 12px;
      font-weight: 900;
      color: var(--accent);
      text-decoration: none;
    }}
    .ref:hover {{ text-decoration: underline; }}
    .details summary {{
      margin-top: 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 800;
      color: rgba(15,23,42,0.78);
    }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border-bottom: 1px solid rgba(15,23,42,0.10); padding: 10px 10px; font-size: 12px; vertical-align: top; }}
    th {{ text-transform: uppercase; letter-spacing: .06em; font-size: 11px; color: var(--muted); background: rgba(15,23,42,0.02); text-align: left; }}
    td.num {{ font-variant-numeric: tabular-nums; white-space: nowrap; }}
    td.rank {{ color: var(--muted); width: 42px; }}
    td.firm {{ font-weight: 800; }}
    code {{ background: rgba(15,23,42,0.06); padding: 1px 6px; border-radius: 8px; }}
    .footer {{
      margin-top: 14px;
      color: var(--muted);
      font-size: 11px;
      text-align: center;
    }}

    .fab {{
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: 42px;
      height: 42px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(15, 23, 42, 0.14);
      background: rgba(255, 255, 255, 0.72);
      color: rgba(15, 23, 42, 0.92);
      text-decoration: none;
      box-shadow: 0 8px 26px rgba(15, 23, 42, 0.10);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
      opacity: 0.0;
      pointer-events: none;
    }}
    .fab:hover {{
      transform: translateY(-2px);
      border-color: rgba(8, 145, 178, 0.28);
      box-shadow: 0 12px 34px rgba(15, 23, 42, 0.14);
    }}
    .fab:active {{
      transform: translateY(0);
    }}
    .fab-visible {{
      opacity: 1.0;
      pointer-events: auto;
    }}
    .fab svg {{ width: 18px; height: 18px; }}
    @media print {{
      body {{ background: #fff; }}
      .page {{ margin: 0; max-width: none; }}
      .header {{ background: #fff; }}
      .section {{ break-inside: avoid; }}
      a.ref {{ color: #000; text-decoration: none; }}
      .fab {{ display: none !important; }}
    }}
  </style>
</head>
<body>
  <div id="top" class="page">
    <div class="header">
      <div>
        <h1 class="h-title">{esc(title)}</h1>
        <div class="h-sub">Clear recommendation · Evidence-backed citations · Shareable report</div>
      </div>
      <div class="meta">
        <div>Pack {esc(pack_id)} · v{esc(pack_version)}</div>
        <div>{esc(created_at)}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Executive Summary</div>
      <div class="hero">
        <div class="hero-left">
          <div class="rec">Recommendation: <span style="color: rgba(15,23,42,0.98);">{esc(primary_firm)}</span></div>
          <div class="row" style="margin-top: 10px;">
            <span class="pill">win-rate lift <strong>{esc(primary_lift)}</strong></span>
            <span class="pill">evidence <strong>n={esc(primary_ev)}</strong></span>
            <span class="badge {esc(primary_conf)}">{esc(primary_conf)}</span>
          </div>
          <div class="callout" style="margin-top: 12px;">
            This pack replaces manual steps: ranking scan → comparable-case search → memo drafting.
            It gives a ready-to-send conclusion with citations.
          </div>
        </div>
        <div class="hero-right">
          <div class="kpi">
            <div class="box">
              <div class="k">Court</div>
              <div class="v">{esc(court)}</div>
            </div>
            <div class="box">
              <div class="k">Case Type</div>
              <div class="v">{esc(case_type)}</div>
            </div>
            <div class="box">
              <div class="k">Role</div>
              <div class="v">{esc(role)}</div>
            </div>
          </div>
          <div style="margin-top: 10px;" class="pill">Opponent / Counsel: <strong>{esc(opponent)}</strong></div>
        </div>
      </div>
      <ul class="ul">
        <li><strong>Clear conclusion:</strong> pick {esc(primary_firm)} as primary outside counsel; keep #2 as backup.</li>
        <li><strong>Next steps (5 minutes):</strong> send shortlist, ask for conflicts check + fee proposal, schedule intro call.</li>
      </ul>
    </div>

    <div class="section">
      <div class="section-title">Why This Recommendation (Evidence-Driven)</div>
      {primary_explain_html or '<div class="muted">No explainability available.</div>'}
    </div>

    <div class="section">
      <div class="section-title">Shortlist</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Firm</th>
            <th>Win-Rate Lift</th>
            <th>Evidence (n)</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {alternatives_rows}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Evidence & Citations</div>
      <div class="muted small">Click a citation like <code>[1]</code> above to jump here. CaseId entries are the audit trail for the key claims.</div>
      <table style="margin-top: 10px;">
        <thead>
          <tr>
            <th>#</th>
            <th>Case</th>
            <th>Court</th>
            <th>Year</th>
            <th>Type</th>
            <th>Outcome</th>
            <th>Why Relevant</th>
          </tr>
        </thead>
        <tbody>
          {evidence_rows}
        </tbody>
      </table>
      <div class="muted small" style="margin-top: 10px;">Phase 1 uses offline snapshot evidence; settlement outcomes are not observed.</div>
    </div>

    <div class="section">
      <div class="section-title">Limitations</div>
      <ul class="ul">
        <li>Decision support only; not legal advice.</li>
        <li>Snapshot-based: results depend on dataset coverage and labeling.</li>
        <li>Some outcomes (e.g., settlements) may not be observed in the underlying data.</li>
      </ul>
      <div class="muted small" style="margin-top: 10px;">Brief hash: {esc(brief_hash or '—')}</div>
    </div>

    <div class="footer">
      Generated by Matter Decision Pack · {esc(created_at)} · Keep confidential
    </div>
  </div>

  <a id="fabTop" class="fab" href="#top" aria-label="Back to top" title="Back to top">
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5l-7 7m7-7l7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M12 5v14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  </a>

  <script>
    (function() {{
      var fab = document.getElementById('fabTop');
      if (!fab) return;
      var ticking = false;
      var update = function() {{
        ticking = false;
        var y = window.scrollY || document.documentElement.scrollTop || 0;
        if (y > 260) fab.classList.add('fab-visible');
        else fab.classList.remove('fab-visible');
      }};
      var onScroll = function() {{
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(update);
      }};
      window.addEventListener('scroll', onScroll, {{ passive: true }});
      update();
    }})();
  </script>
</body>
</html>"""


matter_store = MatterStore()
sample_data = SampleData()
offline_kb = OfflineKB(sample_dir=_default_sample_dir()) if OfflineKB else None
