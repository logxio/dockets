from pathlib import Path

from pipeline.matter_signals import (
    OfflineKB,
    compute_candidate_outcome_signal,
    list_evidence,
    recommend_candidates,
)


def _sample_dir() -> Path:
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / "packages" / "frontend" / "public" / "sample"


def test_recommend_candidates_smoke():
    kb = OfflineKB(sample_dir=_sample_dir())
    items = recommend_candidates(kb, case_type="contract", role="defendant", limit=10)
    assert len(items) > 0
    assert all("firm" in x and "firm_key" in x for x in items)


def test_outcome_signal_smoke():
    kb = OfflineKB(sample_dir=_sample_dir())
    sig = compute_candidate_outcome_signal(
        kb,
        firm="quinn emanuel urquhart oliver & hedges",
        role="plaintiff",
        case_type="contract",
        opponent_firm="covington & burling",
    )
    assert "baselineDefendantWinRatePct" in sig
    assert "predictedWinRatePct" in sig
    assert "confidence" in sig


def test_list_evidence_smoke():
    kb = OfflineKB(sample_dir=_sample_dir())
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
