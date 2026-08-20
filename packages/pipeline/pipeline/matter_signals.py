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


# Prior strength for shrinking a firm's observed win rate toward its
# (role, case type) baseline, expressed in pseudo-observations.
#
# Derived, not tuned. Method-of-moments empirical Bayes on the shipped snapshot
# fits a Beta-Binomial prior of k = 13.5 for plaintiff-side records and k = 15.9
# for defendant-side; 15 sits between them. Leave-one-out AUC moves by less than
# 0.004 across k in [5, 30], so nothing here hinges on the exact value.
# DESIGN.md carries the evaluation.
WIN_RATE_PRIOR_STRENGTH = 15.0

# Below this many observed cases the firm's own record carries under an eighth of
# the posterior (2/(2+15) = 12%), so a reported rate would be the baseline wearing
# the firm's name. Report `unknown` instead.
MIN_CASES_FOR_WIN_RATE = 3

# A (role, case type) cell needs this much support before it is trusted as a
# baseline; thinner cells fall back to the role's overall rate.
MIN_CASES_FOR_CASE_TYPE_BASELINE = 30


def _confidence_from_n(n: int) -> Literal["high", "medium", "low", "unknown"]:
    if n <= 0:
        return "unknown"
    if n >= 50:
        return "high"
    if n >= 10:
        return "medium"
    return "low"


@dataclass(frozen=True)
class _OutcomeIndex:
    """Wins and case counts, keyed for the shrinkage estimator."""

    by_slice: dict[tuple[str, str, str], tuple[int, int]]  # (firm, role, caseType)
    by_firm: dict[tuple[str, str], tuple[int, int]]        # (firm, role)
    case_type_base: dict[tuple[str, str], tuple[int, int]]  # (role, caseType)
    role_base: dict[str, tuple[int, int]]

    def baseline(self, role: str, case_type: str) -> float:
        """Win rate for the role, narrowed to the case type where support allows."""
        wins, n = self.case_type_base.get((role, case_type), (0, 0))
        if n >= MIN_CASES_FOR_CASE_TYPE_BASELINE:
            return wins / n
        wins, n = self.role_base.get(role, (0, 0))
        return wins / n if n else 0.5

    def record(self, firm_key: str, role: str, case_type: str) -> tuple[int, int, bool]:
        """(wins, cases, narrowed_to_case_type) for the firm, widening if thin."""
        if case_type:
            wins, n = self.by_slice.get((firm_key, role, case_type), (0, 0))
            if n >= MIN_CASES_FOR_WIN_RATE:
                return wins, n, True
        wins, n = self.by_firm.get((firm_key, role), (0, 0))
        return wins, n, False


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
        self._outcomes: _OutcomeIndex | None = None

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

    def outcomes(self) -> "_OutcomeIndex":
        """Win/loss tallies per firm, role and case type, plus the baselines."""
        if self._outcomes is not None:
            return self._outcomes

        win_by_case: dict[int, int] = {}
        for cid, winner in zip(self.cases()["CaseId"], self.cases()["Winner"]):
            c = _safe_int(cid)
            w = _safe_int(winner)
            if c is not None and w is not None:
                win_by_case[c] = w

        slice_tally: dict[tuple[str, str, str], list[int]] = {}
        firm_tally: dict[tuple[str, str], list[int]] = {}
        case_type_base: dict[tuple[str, str], list[int]] = {}
        role_base: dict[str, list[int]] = {}
        # A case lists one row per firm pair, so the same firm shows up several
        # times in one case. Count each (case, firm, role) once.
        seen: set[tuple[int, str, str]] = set()

        for r in self.interactions().itertuples(index=False):
            cid = _safe_int(getattr(r, "CaseId", None))
            if cid is None:
                continue
            winner = win_by_case.get(cid)
            if winner is None:
                continue
            ct = str(getattr(r, "CaseTypeKey", "") or "")
            pairs = (
                (str(getattr(r, "PlaintiffFirmKey", "") or ""), "plaintiff"),
                (str(getattr(r, "DefendantFirmKey", "") or ""), "defendant"),
            )
            for firm_key, role in pairs:
                if not firm_key or (cid, firm_key, role) in seen:
                    continue
                seen.add((cid, firm_key, role))
                # Winner: 0 = plaintiff win, 1 = defendant win.
                won = 1 if (winner == 1) == (role == "defendant") else 0
                for bucket, key in (
                    (slice_tally, (firm_key, role, ct)),
                    (firm_tally, (firm_key, role)),
                    (case_type_base, (role, ct)),
                ):
                    cell = bucket.setdefault(key, [0, 0])
                    cell[0] += won
                    cell[1] += 1
                cell = role_base.setdefault(role, [0, 0])
                cell[0] += won
                cell[1] += 1

        self._outcomes = _OutcomeIndex(
            by_slice={k: (v[0], v[1]) for k, v in slice_tally.items()},
            by_firm={k: (v[0], v[1]) for k, v in firm_tally.items()},
            case_type_base={k: (v[0], v[1]) for k, v in case_type_base.items()},
            role_base={k: (v[0], v[1]) for k, v in role_base.items()},
        )
        return self._outcomes


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
    prior_strength: float = WIN_RATE_PRIOR_STRENGTH,
    min_cases: int = MIN_CASES_FOR_WIN_RATE,
) -> dict[str, Any]:
    """
    Win rate for a firm in a role, estimated from observed case outcomes.

    The estimate is the firm's own record shrunk toward the baseline for its
    (role, case type):

        p = (wins + k * baseline) / (cases + k)

    with k in pseudo-observations. Most firms in the snapshot appear in one or
    two cases, where a raw rate is 0% or 100% and means nothing; shrinkage pulls
    those to the baseline and `min_cases` suppresses them outright.

    Head-to-head rows are reported as a driver but are not estimated from: a
    single firm pair rarely clears three cases. `list_evidence` surfaces them.
    """
    fk = normalize_label(firm)
    ok = normalize_label(opponent_firm) if opponent_firm else ""
    ct = normalize_label(case_type) if case_type else ""

    idx = kb.outcomes()
    wins, n_cases, narrowed = idx.record(fk, role, ct)
    baseline = idx.baseline(role, ct if narrowed else "")
    baseline_pct = int(round(baseline * 100))

    k = max(0.0, float(prior_strength))
    if n_cases >= max(1, int(min_cases)) and (n_cases + k) > 0:
        predicted = _clamp01((wins + k * baseline) / (n_cases + k))
        predicted_pct = int(round((predicted or 0.0) * 100))
        lift = predicted_pct - baseline_pct
        # Share of the estimate carried by the firm's own record.
        evidence_weight_pct = int(round(100 * n_cases / (n_cases + k)))
    else:
        predicted_pct = None
        lift = None
        evidence_weight_pct = 0

    has_head_to_head = False
    if ok:
        df = kb.interactions()
        if role == "defendant":
            head = df[(df["DefendantFirmKey"] == fk) & (df["PlaintiffFirmKey"] == ok)]
        else:
            head = df[(df["PlaintiffFirmKey"] == fk) & (df["DefendantFirmKey"] == ok)]
        if ct and not head.empty:
            head = head[head["CaseTypeKey"] == ct]
        has_head_to_head = not head.empty

    drivers: list[str] = []
    if narrowed:
        drivers.append("case-type fit")
    if has_head_to_head:
        drivers.append("head-to-head evidence")
    if n_cases:
        drivers.append("sample size")

    limitations = ["offline snapshot evidence", "settlements not observed"]
    if predicted_pct is None:
        limitations.append(f"fewer than {int(min_cases)} observed cases")
    elif evidence_weight_pct < 50:
        limitations.append("estimate is mostly baseline, not this firm's record")
    if not narrowed and ct:
        limitations.append("too few case-type matches; pooled across case types")

    return {
        "baselineWinRatePct": baseline_pct,
        "predictedWinRatePct": predicted_pct,
        "winRateLiftPct": lift,
        "confidence": _confidence_from_n(n_cases) if predicted_pct is not None else "unknown",
        "drivers": drivers,
        "limitations": limitations,
        "meta": {
            "nEvidenceCases": n_cases,
            "nWins": wins,
            "usedHeadToHead": has_head_to_head,
            "narrowedToCaseType": narrowed,
            "evidenceWeightPct": evidence_weight_pct,
            "priorStrength": k,
        },
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
