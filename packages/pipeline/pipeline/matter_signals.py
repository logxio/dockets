"""
Matter-level signals & retrieval for the offline demo KB (Phase 1).

This module intentionally avoids external network access and can operate on
the repository's exported "sample" snapshots:
- mahari_exp_scores.csv
- mahari_fig2_moesm4_interactions.csv
- mahari_fig2_moesm4_cases.csv
- mahari_case_type_params.csv
- mahari_case_type_privileges.csv
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import pandas as pd


Role = Literal["plaintiff", "defendant"]


def normalize_label(s: Any) -> str:
    return " ".join(str(s or "").strip().lower().split())


def _safe_int(v: Any) -> int | None:
    try:
        n = int(v)
    except Exception:
        return None
    return n


def _safe_float(v: Any) -> float | None:
    try:
        n = float(v)
    except Exception:
        return None
    if n != n:  # NaN
        return None
    return n


def _clamp01(x: float | None) -> float | None:
    if x is None:
        return None
    if x < 0:
        return 0.0
    if x > 1:
        return 1.0
    return x


def _confidence_from_n(n: int) -> Literal["high", "medium", "low", "unknown"]:
    if n <= 0:
        return "unknown"
    if n >= 50:
        return "high"
    if n >= 10:
        return "medium"
    return "low"


@dataclass(frozen=True)
class OfflineKBPaths:
    sample_dir: Path

    @property
    def exp_scores_csv(self) -> Path:
        return self.sample_dir / "mahari_exp_scores.csv"

    @property
    def interactions_csv(self) -> Path:
        return self.sample_dir / "mahari_fig2_moesm4_interactions.csv"

    @property
    def cases_csv(self) -> Path:
        return self.sample_dir / "mahari_fig2_moesm4_cases.csv"

    @property
    def case_type_params_csv(self) -> Path:
        return self.sample_dir / "mahari_case_type_params.csv"

    @property
    def case_type_privileges_csv(self) -> Path:
        return self.sample_dir / "mahari_case_type_privileges.csv"


class OfflineKB:
    """
    Offline KB wrapper with light indexing for product signals.

    Notes:
    - Interactions are expanded (multiple firms per side), so counts should use unique CaseId.
    - PredDefWinProba is a predicted probability for a *defendant win* (as exported).
    """

    def __init__(self, *, sample_dir: str | Path):
        self.paths = OfflineKBPaths(Path(sample_dir))
        self._exp_scores: pd.DataFrame | None = None
        self._interactions: pd.DataFrame | None = None
        self._cases: pd.DataFrame | None = None
        self._firm_case_counts: dict[tuple[str, str, str], int] | None = None  # (firmKey, role, caseType) -> unique CaseId count

    def exp_scores(self) -> pd.DataFrame:
        if self._exp_scores is not None:
            return self._exp_scores
        df = pd.read_csv(self.paths.exp_scores_csv)
        df["FirmKey"] = df["Firm"].map(normalize_label)
        self._exp_scores = df
        return df

    def interactions(self) -> pd.DataFrame:
        if self._interactions is not None:
            return self._interactions
        df = pd.read_csv(self.paths.interactions_csv)
        df["PlaintiffFirmKey"] = df["PlaintiffFirm"].map(normalize_label)
        df["DefendantFirmKey"] = df["DefendantFirm"].map(normalize_label)
        df["CaseTypeKey"] = df["CaseType"].map(normalize_label)
        self._interactions = df
        return df

    def cases(self) -> pd.DataFrame:
        if self._cases is not None:
            return self._cases
        df = pd.read_csv(self.paths.cases_csv)
        df["CaseTypeKey"] = df["CaseType"].map(normalize_label)
        self._cases = df
        return df

    def firm_case_counts(self) -> dict[tuple[str, str, str], int]:
        if self._firm_case_counts is not None:
            return self._firm_case_counts
        df = self.interactions()
        counts: dict[tuple[str, str, str], set[int]] = {}
        for _, r in df.iterrows():
            cid = _safe_int(r.get("CaseId"))
            if cid is None:
                continue
            ct = normalize_label(r.get("CaseType"))
            pk = normalize_label(r.get("PlaintiffFirm"))
            dk = normalize_label(r.get("DefendantFirm"))
            if pk:
                counts.setdefault((pk, "plaintiff", ct), set()).add(cid)
            if dk:
                counts.setdefault((dk, "defendant", ct), set()).add(cid)
        self._firm_case_counts = {k: len(v) for k, v in counts.items()}
        return self._firm_case_counts


def recommend_candidates(
    kb: OfflineKB,
    *,
    case_type: str | None = None,
    role: Role | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """
    Recommend firms from global exp_scores, then annotate with evidence counts.
    """
    ct = normalize_label(case_type) if case_type else ""
    limit = max(1, min(200, int(limit)))

    scores = kb.exp_scores().sort_values("Rank").head(2000).copy()
    counts = kb.firm_case_counts()

    def ev_count(firm_key: str) -> int:
        if not ct or not role:
            # fallback: sum across all case types for requested role if any
            if role:
                return sum(v for (fk, r, _), v in counts.items() if fk == firm_key and r == role)
            return sum(v for (fk, _, _), v in counts.items() if fk == firm_key)
        return counts.get((firm_key, role, ct), 0)

    scores["EvidenceCount"] = scores["FirmKey"].map(lambda k: ev_count(str(k)))

    # Product-friendly: prefer firms with more evidence within the (case_type, role) slice,
    # but keep global rank as a stable tiebreak.
    ranked = scores.sort_values(["EvidenceCount", "Rank"], ascending=[False, True]).head(limit)

    out: list[dict[str, Any]] = []
    for _, row in ranked.iterrows():
        firm = str(row.get("Firm") or "").strip()
        firm_key = str(row.get("FirmKey") or "").strip()
        if not firm or not firm_key:
            continue
        out.append(
            {
                "firm": firm,
                "firm_key": firm_key,
                "tier": "recommended",
                "signals": {"outcome_lift_pct": None, "confidence": _confidence_from_n(int(row.get("EvidenceCount") or 0)), "evidence_count": int(row.get("EvidenceCount") or 0)},
                "cost": {"hourly_rate_usd": None, "alt_fee": None, "source": "unknown"},
                "notes": None,
            }
        )
    return out


def compute_candidate_outcome_signal(
    kb: OfflineKB,
    *,
    firm: str,
    role: Role,
    case_type: str | None = None,
    opponent_firm: str | None = None,
    baseline_defendant_win_rate_pct: int = 83,
) -> dict[str, Any]:
    """
    Compute a product-facing outcome signal using snapshot predictions.

    Strategy:
    - Use PredDefWinProba from interactions:
      - If role == defendant: winProb := mean(PredDefWinProba)
      - If role == plaintiff: winProb := 1 - mean(PredDefWinProba)
    - Prefer head-to-head interactions vs opponent if present; else fall back to all interactions for that firm.
    """
    fk = normalize_label(firm)
    ok = normalize_label(opponent_firm) if opponent_firm else ""
    ct = normalize_label(case_type) if case_type else ""

    df = kb.interactions()
    if role == "defendant":
        view = df[df["DefendantFirmKey"] == fk]
        if ok:
            head = view[view["PlaintiffFirmKey"] == ok]
        else:
            head = view.iloc[0:0]
    else:
        view = df[df["PlaintiffFirmKey"] == fk]
        if ok:
            head = view[view["DefendantFirmKey"] == ok]
        else:
            head = view.iloc[0:0]

    if ct:
        view = view[view["CaseTypeKey"] == ct]
        if not head.empty:
            head = head[head["CaseTypeKey"] == ct]

    used = head if not head.empty else view
    n_cases = int(used["CaseId"].nunique()) if not used.empty else 0

    probs = used["PredDefWinProba"].map(_safe_float).dropna() if not used.empty else pd.Series([], dtype="float64")
    p_def = _clamp01(float(probs.mean())) if len(probs) else None

    if p_def is None:
        predicted = None
    else:
        predicted = p_def if role == "defendant" else 1.0 - p_def

    predicted_pct = int(round(predicted * 100)) if predicted is not None else None

    baseline_def = max(0, min(100, int(baseline_defendant_win_rate_pct)))
    baseline_pct = baseline_def if role == "defendant" else 100 - baseline_def
    lift = (predicted_pct - baseline_pct) if predicted_pct is not None else None

    drivers: list[str] = []
    if ct:
        drivers.append("case-type fit")
    if ok and not head.empty:
        drivers.append("head-to-head evidence")
    if n_cases:
        drivers.append("sample size")

    limitations = ["offline snapshot evidence", "settlements not observed"]

    return {
        "baselineDefendantWinRatePct": baseline_def,
        "predictedWinRatePct": predicted_pct,
        "winRateLiftPct": lift,
        "confidence": _confidence_from_n(n_cases),
        "drivers": drivers,
        "limitations": limitations,
        "meta": {"nEvidenceCases": n_cases, "usedHeadToHead": bool(ok and not head.empty)},
    }


def list_evidence(
    kb: OfflineKB,
    *,
    case_type: str | None = None,
    firm: str | None = None,
    role: Role | None = None,
    opponent_firm: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """
    Return comparable matters from the snapshot.

    Priority:
    1) Head-to-head cases (firm vs opponent)
    2) Firm-involved cases
    3) Case-type-only cases
    """
    limit = max(1, min(200, int(limit)))
    ct = normalize_label(case_type) if case_type else ""
    fk = normalize_label(firm) if firm else ""
    ok = normalize_label(opponent_firm) if opponent_firm else ""

    inter = kb.interactions()
    if ct:
        inter = inter[inter["CaseTypeKey"] == ct]

    head = inter.iloc[0:0]
    firm_view = inter.iloc[0:0]
    if fk and role:
        if role == "defendant":
            firm_view = inter[inter["DefendantFirmKey"] == fk]
            if ok:
                head = firm_view[firm_view["PlaintiffFirmKey"] == ok]
        else:
            firm_view = inter[inter["PlaintiffFirmKey"] == fk]
            if ok:
                head = firm_view[firm_view["DefendantFirmKey"] == ok]

    def to_case_rows(df: pd.DataFrame, why: list[str], similarity: float) -> dict[int, dict[str, Any]]:
        out: dict[int, dict[str, Any]] = {}
        for _, r in df.iterrows():
            cid = _safe_int(r.get("CaseId"))
            if cid is None:
                continue
            if cid in out:
                continue
            out[cid] = {
                "case_id": cid,
                "caption": None,
                "court": None,
                "year": _safe_int(r.get("Year")),
                "case_type": str(r.get("CaseType") or "") or None,
                "outcome": str(r.get("Outcome") or "") or None,
                "similarity": similarity,
                "why_relevant": why,
                "source": {"provider": "CAP", "url": None, "snapshot": kb.paths.cases_csv.name},
            }
        return out

    items: dict[int, dict[str, Any]] = {}
    if not head.empty:
        items.update(to_case_rows(head, ["head-to-head", "same case type" if ct else "case type"], 0.9))
    if fk and role and not firm_view.empty:
        why = ["firm involved"]
        if ct:
            why.append("same case type")
        items.update({k: v for k, v in to_case_rows(firm_view, why, 0.75).items() if k not in items})
    # fallback: case-type-only
    items.update({k: v for k, v in to_case_rows(inter, ["same case type" if ct else "sample dataset"], 0.5).items() if k not in items})

    # Enrich with case-level table if present (for year/case_type)
    cases = kb.cases()
    case_by_id = {int(r["CaseId"]): r for _, r in cases.iterrows() if _safe_int(r.get("CaseId")) is not None}
    for cid, ev in list(items.items()):
        row = case_by_id.get(cid)
        if row is None:
            continue
        ev["year"] = _safe_int(row.get("Year")) or ev.get("year")
        ev["case_type"] = str(row.get("CaseType") or "") or ev.get("case_type")
        # Winner column is MOESM4: 0=plaintiff win, 1=defendant win (see export script)
        w = _safe_int(row.get("Winner"))
        if w in (0, 1):
            ev["outcome"] = "defendant_win" if w == 1 else "plaintiff_win"
        else:
            # Best-effort normalization for older snapshots.
            raw = normalize_label(ev.get("outcome"))
            if raw in ("defendantwin", "defendant_win", "def_win", "defendant won", "defendant"):
                ev["outcome"] = "defendant_win"
            elif raw in ("plaintiffwin", "plaintiff_win", "plt_win", "plaintiff won", "plaintiff"):
                ev["outcome"] = "plaintiff_win"

    # Sort: head-to-head first (similarity desc), then recency
    def sort_key(ev: dict[str, Any]) -> tuple:
        sim = _safe_float(ev.get("similarity")) or 0.0
        year = _safe_int(ev.get("year")) or 0
        return (-sim, -year, ev.get("case_id", 0))

    out_list = sorted(items.values(), key=sort_key)[:limit]
    return out_list
