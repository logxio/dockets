from pathlib import Path

import pytest

from pipeline.matter_signals import (
    MIN_CASES_FOR_WIN_RATE,
    WIN_RATE_PRIOR_STRENGTH,
    OfflineKB,
    compute_candidate_outcome_signal,
    list_evidence,
    recommend_candidates,
)


def _sample_dir() -> Path:
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "packages" / "frontend" / "public" / "sample"


@pytest.fixture(scope="module")
def kb() -> OfflineKB:
    return OfflineKB(sample_dir=_sample_dir())


def _firm_with_n_cases(kb: OfflineKB, n: int) -> tuple[str, str] | None:
    for (firm, role), (_wins, cases) in kb.outcomes().by_firm.items():
        if cases == n:
            return firm, role
    return None


def test_recommend_candidates_smoke(kb):
    items = recommend_candidates(kb, case_type="contract", role="defendant", limit=10)
    assert len(items) > 0
    assert all("firm" in x and "firm_key" in x for x in items)


def test_outcome_signal_smoke(kb):
    sig = compute_candidate_outcome_signal(
        kb,
        firm="quinn emanuel urquhart oliver & hedges",
        role="plaintiff",
        case_type="contract",
        opponent_firm="covington & burling",
    )
    assert "baselineWinRatePct" in sig
    assert "predictedWinRatePct" in sig
    assert "confidence" in sig
    assert sig["meta"]["priorStrength"] == WIN_RATE_PRIOR_STRENGTH


def test_list_evidence_smoke(kb):
    ev = list_evidence(
        kb,
        case_type="contract",
        firm="quinn emanuel urquhart oliver & hedges",
        role="plaintiff",
        opponent_firm="covington & burling",
        limit=20,
    )
    assert len(ev) > 0
    assert all("case_id" in x for x in ev)


def test_win_rate_is_unknown_below_the_floor(kb):
    """A firm the snapshot barely saw must not get a number attached to its name."""
    found = _firm_with_n_cases(kb, 1)
    assert found is not None, "snapshot should contain single-case firms"
    firm, role = found
    sig = compute_candidate_outcome_signal(kb, firm=firm, role=role)
    assert sig["predictedWinRatePct"] is None
    assert sig["confidence"] == "unknown"
    assert any("fewer than" in x for x in sig["limitations"])


def test_small_samples_never_produce_extremes(kb):
    """
    The failure the shrinkage exists to prevent: n=1 firms reporting 0% or 100%.
    Checks every thin firm-role in the snapshot, not a sampled few.
    """
    checked = 0
    for (firm, role), (_wins, cases) in kb.outcomes().by_firm.items():
        if not 1 <= cases <= 3:
            continue
        checked += 1
        pct = compute_candidate_outcome_signal(
            kb, firm=firm, role=role, min_cases=1
        )["predictedWinRatePct"]
        assert pct is not None
        assert 0 < pct < 100, f"{firm} ({role}, n={cases}) reported {pct}%"
    assert checked > 100, "expected many thin firm-roles in the snapshot"


def test_estimate_sits_between_the_raw_rate_and_the_baseline(kb):
    idx = kb.outcomes()
    checked = 0
    for (firm, role), (wins, cases) in idx.by_firm.items():
        if cases < MIN_CASES_FOR_WIN_RATE or cases > 60:
            continue
        sig = compute_candidate_outcome_signal(kb, firm=firm, role=role)
        pct = sig["predictedWinRatePct"]
        if pct is None:
            continue
        checked += 1
        raw = 100.0 * wins / cases
        base = float(sig["baselineWinRatePct"])
        lo, hi = sorted((raw, base))
        assert lo - 1 <= pct <= hi + 1, f"{firm}: {pct} outside [{lo}, {hi}]"
    assert checked > 50


def test_a_stronger_prior_pulls_the_estimate_toward_the_baseline(kb):
    firm, role = "glancy binkow & goldberg", "plaintiff"
    weak = compute_candidate_outcome_signal(kb, firm=firm, role=role, prior_strength=1.0)
    strong = compute_candidate_outcome_signal(kb, firm=firm, role=role, prior_strength=200.0)
    base = weak["baselineWinRatePct"]
    assert abs(strong["predictedWinRatePct"] - base) < abs(weak["predictedWinRatePct"] - base)
    assert strong["meta"]["evidenceWeightPct"] < weak["meta"]["evidenceWeightPct"]


def test_evidence_weight_reports_how_much_is_the_firms_own_record(kb):
    found = _firm_with_n_cases(kb, 5)
    assert found is not None
    firm, role = found
    meta = compute_candidate_outcome_signal(kb, firm=firm, role=role)["meta"]
    expected = round(100 * 5 / (5 + WIN_RATE_PRIOR_STRENGTH))
    assert meta["evidenceWeightPct"] == expected
    assert meta["nEvidenceCases"] == 5


def test_estimator_separates_outcomes_better_than_the_baseline(kb):
    """
    Guard on the headline claim in DESIGN.md: the firm's record has to add
    ranking power over knowing only the role and case type. Leave-one-out, so
    the held-out case never feeds its own prediction.
    """
    idx = kb.outcomes()
    win_by_case = {
        int(cid): int(w)
        for cid, w in zip(kb.cases()["CaseId"], kb.cases()["Winner"])
    }
    labels: list[int] = []
    shrunk: list[float] = []
    baseline: list[float] = []
    seen: set[tuple[int, str, str]] = set()

    for r in kb.interactions().itertuples(index=False):
        cid = int(r.CaseId)
        winner = win_by_case.get(cid)
        if winner is None:
            continue
        for firm, role in ((r.PlaintiffFirmKey, "plaintiff"), (r.DefendantFirmKey, "defendant")):
            if not firm or (cid, firm, role) in seen:
                continue
            seen.add((cid, firm, role))
            won = 1 if (winner == 1) == (role == "defendant") else 0

            b_wins, b_n = idx.role_base[role]
            base = (b_wins - won) / (b_n - 1)
            f_wins, f_n = idx.by_firm[(firm, role)]
            f_wins, f_n = f_wins - won, f_n - 1
            if f_n < MIN_CASES_FOR_WIN_RATE:
                continue
            labels.append(won)
            shrunk.append((f_wins + WIN_RATE_PRIOR_STRENGTH * base) / (f_n + WIN_RATE_PRIOR_STRENGTH))
            baseline.append(base)

    def auc(y: list[int], p: list[float]) -> float:
        pairs = sorted(zip(p, y))
        pos = sum(y)
        neg = len(y) - pos
        i = 0
        total = 0.0
        while i < len(pairs):
            j = i
            while j < len(pairs) and pairs[j][0] == pairs[i][0]:
                j += 1
            avg_rank = (i + j + 1) / 2  # 1-indexed average rank over the tie group
            total += sum(avg_rank for _, label in pairs[i:j] if label == 1)
            i = j
        return (total - pos * (pos + 1) / 2) / (pos * neg)

    assert len(labels) > 3000
    assert auc(labels, shrunk) > 0.83
    assert auc(labels, shrunk) - auc(labels, baseline) > 0.05
