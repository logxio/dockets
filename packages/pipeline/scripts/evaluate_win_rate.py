"""
Evaluate the win-rate estimator that `pipeline.matter_signals` ships.

Regenerates every number quoted in DESIGN.md. Run it after touching the
estimator or the snapshot:

    python packages/pipeline/scripts/evaluate_win_rate.py

Estimates are leave-one-out: the held-out case is subtracted from the firm's
counts and from the baseline before predicting it. Anything else scores the
estimator on data it already saw.
"""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "packages" / "pipeline"))

from pipeline.matter_signals import (  # noqa: E402
    MIN_CASES_FOR_CASE_TYPE_BASELINE,
    MIN_CASES_FOR_WIN_RATE,
    WIN_RATE_PRIOR_STRENGTH,
    OfflineKB,
    normalize_label,
)

SAMPLE_DIR = REPO_ROOT / "packages" / "frontend" / "public" / "sample"


# --------------------------------------------------------------------- metrics
def auc(y: list[int], p: list[float]) -> float:
    """Rank-based AUC with tie handling."""
    y_arr = np.asarray(y, dtype=int)
    p_arr = np.asarray(p, dtype=float)
    n_pos, n_neg = int(y_arr.sum()), int((1 - y_arr).sum())
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    order = np.argsort(p_arr, kind="mergesort")
    ranks = np.empty(len(p_arr), dtype=float)
    ranks[order] = np.arange(1, len(p_arr) + 1)
    ranks = pd.DataFrame({"p": p_arr, "r": ranks}).groupby("p")["r"].transform("mean").to_numpy()
    return float((ranks[y_arr == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def brier(y: list[int], p: list[float]) -> float:
    return float(np.mean((np.asarray(p, dtype=float) - np.asarray(y, dtype=float)) ** 2))


def ece(y: list[int], p: list[float], bins: int = 10) -> float:
    """Expected calibration error."""
    y_arr = np.asarray(y, dtype=float)
    p_arr = np.asarray(p, dtype=float)
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = 0.0
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        mask = (p_arr >= lo) & (p_arr < hi) if i < bins - 1 else (p_arr >= lo) & (p_arr <= hi)
        if not mask.any():
            continue
        total += (mask.sum() / len(y_arr)) * abs(y_arr[mask].mean() - p_arr[mask].mean())
    return float(total)


# ---------------------------------------------------------------- observations
def build_observations(kb: OfflineKB) -> pd.DataFrame:
    """One row per (case, firm, role), matching how `OfflineKB.outcomes` counts."""
    win_by_case = {
        int(cid): int(w)
        for cid, w in zip(kb.cases()["CaseId"], kb.cases()["Winner"])
        if pd.notna(cid) and pd.notna(w)
    }
    pdw_by_case = dict(zip(kb.cases()["CaseId"], kb.cases()["PredDefWinProba"]))

    rows: list[dict] = []
    seen: set[tuple[int, str, str]] = set()
    for r in kb.interactions().itertuples(index=False):
        cid = int(r.CaseId) if pd.notna(r.CaseId) else None
        if cid is None or cid not in win_by_case:
            continue
        winner = win_by_case[cid]
        for firm, role in ((r.PlaintiffFirmKey, "plaintiff"), (r.DefendantFirmKey, "defendant")):
            if not firm or (cid, firm, role) in seen:
                continue
            seen.add((cid, firm, role))
            rows.append(
                {
                    "case_id": cid,
                    "firm": firm,
                    "role": role,
                    "case_type": r.CaseTypeKey,
                    "won": 1 if (winner == 1) == (role == "defendant") else 0,
                    "pred_def_win_proba": pdw_by_case.get(cid),
                }
            )
    return pd.DataFrame(rows)


class LeaveOneOut:
    """The shipped counts, with one observation removable at a time."""

    def __init__(self, kb: OfflineKB, obs: pd.DataFrame):
        idx = kb.outcomes()
        self.by_firm = {k: list(v) for k, v in idx.by_firm.items()}
        self.by_slice = {k: list(v) for k, v in idx.by_slice.items()}
        self.case_type_base = {k: list(v) for k, v in idx.case_type_base.items()}
        self.role_base = {k: list(v) for k, v in idx.role_base.items()}
        self.obs = obs

    def baseline(self, role: str, case_type: str, won: int) -> float:
        wins, n = self.case_type_base.get((role, case_type), [0, 0])
        wins, n = wins - won, n - 1
        if n >= MIN_CASES_FOR_CASE_TYPE_BASELINE:
            return wins / n
        wins, n = self.role_base.get(role, [0, 0])
        wins, n = wins - won, n - 1
        return wins / n if n > 0 else 0.5

    def firm_record(self, firm: str, role: str, won: int) -> tuple[int, int]:
        wins, n = self.by_firm.get((firm, role), [0, 0])
        return wins - won, n - 1

    def slice_record(self, firm: str, role: str, case_type: str, won: int) -> tuple[int, int]:
        wins, n = self.by_slice.get((firm, role, case_type), [0, 0])
        return wins - won, n - 1


def shrink(wins: int, n: int, baseline: float, k: float) -> float:
    return (wins + k * baseline) / (n + k) if (n + k) > 0 else baseline


# ------------------------------------------------------------------- reporting
def main() -> None:
    kb = OfflineKB(sample_dir=SAMPLE_DIR)
    obs = build_observations(kb)
    loo = LeaveOneOut(kb, obs)
    records = list(obs.itertuples(index=False))

    print(f"snapshot   : {SAMPLE_DIR}")
    print(f"shipped    : k={WIN_RATE_PRIOR_STRENGTH:g}  floor={MIN_CASES_FOR_WIN_RATE}  "
          f"case-type baseline needs n>={MIN_CASES_FOR_CASE_TYPE_BASELINE}")
    print(f"observations: {len(obs)} over {obs.case_id.nunique()} cases, {obs.firm.nunique()} firms")
    by_role = obs.groupby("role")["won"].agg(["mean", "count"])
    for role, row in by_role.iterrows():
        print(f"  {role:<10} win rate {row['mean']:.3f} over {int(row['count'])} observations")

    def predictions(k: float, floor: int = 0, use_slice: bool = False):
        y: list[int] = []
        p: list[float] = []
        base: list[float] = []
        for r in records:
            b = loo.baseline(r.role, r.case_type, r.won)
            if use_slice:
                wins, n = loo.slice_record(r.firm, r.role, r.case_type, r.won)
            else:
                wins, n = loo.firm_record(r.firm, r.role, r.won)
            if n < floor:
                continue
            y.append(r.won)
            p.append(shrink(wins, n, b, k))
            base.append(b)
        return y, p, base

    print()
    print("=" * 80)
    print("WHAT REPLACED WHAT")
    print("=" * 80)
    print(f"{'estimator':<52}{'AUC':>8}{'Brier':>9}{'ECE':>9}")

    # The estimator that shipped before: mean PredDefWinProba over the firm's rows.
    pdw_sum: dict[tuple[str, str], float] = defaultdict(float)
    pdw_cnt: dict[tuple[str, str], int] = defaultdict(int)
    for r in records:
        if pd.notna(r.pred_def_win_proba):
            pdw_sum[(r.firm, r.role)] += float(r.pred_def_win_proba)
            pdw_cnt[(r.firm, r.role)] += 1
    y, p = [], []
    for r in records:
        if pd.isna(r.pred_def_win_proba):
            continue
        n = pdw_cnt[(r.firm, r.role)] - 1
        if n <= 0:
            continue
        p_def = (pdw_sum[(r.firm, r.role)] - float(r.pred_def_win_proba)) / n
        y.append(r.won)
        p.append(p_def if r.role == "defendant" else 1.0 - p_def)
    print(f"{'was: mean(PredDefWinProba) over firm rows':<52}{auc(y,p):>8.4f}{brier(y,p):>9.4f}{ece(y,p):>9.4f}")

    y, _, base = predictions(WIN_RATE_PRIOR_STRENGTH)
    print(f"{'null: (role, case type) baseline, no firm data':<52}"
          f"{auc(y,base):>8.4f}{brier(y,base):>9.4f}{ece(y,base):>9.4f}")

    y, p, _ = predictions(WIN_RATE_PRIOR_STRENGTH)
    print(f"{f'now: shrunk empirical rate, k={WIN_RATE_PRIOR_STRENGTH:g}, all firms':<52}"
          f"{auc(y,p):>8.4f}{brier(y,p):>9.4f}{ece(y,p):>9.4f}")

    y, p, base = predictions(WIN_RATE_PRIOR_STRENGTH, floor=MIN_CASES_FOR_WIN_RATE)
    print(f"{f'now: as shipped, floor n>={MIN_CASES_FOR_WIN_RATE} (what users see)':<52}"
          f"{auc(y,p):>8.4f}{brier(y,p):>9.4f}{ece(y,p):>9.4f}")
    print(f"{'  of which the baseline alone explains':<52}{auc(y,base):>8.4f}{brier(y,base):>9.4f}{ece(y,base):>9.4f}")
    print(f"{'  lift attributable to the firm record':<52}{auc(y,p)-auc(y,base):>+8.4f}")
    print(f"\nshown to users: {len(y)} of {len(obs)} observations ({100*len(y)/len(obs):.1f}%)")

    print()
    print("=" * 80)
    print("SENSITIVITY TO THE PRIOR STRENGTH k")
    print("=" * 80)
    print(f"{'k':<8}{'AUC':>9}{'Brier':>9}{'ECE':>9}")
    for k in (0, 2, 5, 8, 10, 15, 20, 30, 50):
        y, p, _ = predictions(float(k))
        print(f"{k:<8}{auc(y,p):>9.4f}{brier(y,p):>9.4f}{ece(y,p):>9.4f}")

    print()
    print("=" * 80)
    print("WHERE THE FIRM'S OWN RECORD STARTS PAYING")
    print("=" * 80)
    print(f"{'prior cases n':<16}{'obs':>7}{'AUC':>10}{'AUC baseline':>14}{'lift':>9}{'firm weight':>13}")
    for lo, hi, label in [(0, 0, "0"), (1, 1, "1"), (2, 2, "2"), (3, 4, "3-4"), (5, 9, "5-9"), (10, 10**9, "10+")]:
        ys, ps, bs = [], [], []
        for r in records:
            wins, n = loo.firm_record(r.firm, r.role, r.won)
            if not (lo <= n <= hi):
                continue
            b = loo.baseline(r.role, r.case_type, r.won)
            ys.append(r.won)
            ps.append(shrink(wins, n, b, WIN_RATE_PRIOR_STRENGTH))
            bs.append(b)
        if len(set(ys)) < 2:
            continue
        n_mid = lo if lo == hi else (20 if hi > 10**8 else (lo + hi) / 2)
        weight = n_mid / (n_mid + WIN_RATE_PRIOR_STRENGTH)
        print(f"{label:<16}{len(ys):>7}{auc(ys,ps):>10.4f}{auc(ys,bs):>14.4f}"
              f"{auc(ys,ps)-auc(ys,bs):>+9.4f}{weight:>12.0%}")

    print()
    print("=" * 80)
    print(f"CALIBRATION BY CASE TYPE  (floor n>={MIN_CASES_FOR_WIN_RATE})")
    print("=" * 80)
    print(f"{'case type':<22}{'obs':>7}{'predicted':>12}{'observed':>11}{'gap':>9}{'AUC':>9}")
    for case_type in sorted(obs.case_type.unique()):
        ys, ps = [], []
        for r in records:
            if r.case_type != case_type:
                continue
            wins, n = loo.firm_record(r.firm, r.role, r.won)
            if n < MIN_CASES_FOR_WIN_RATE:
                continue
            b = loo.baseline(r.role, r.case_type, r.won)
            ys.append(r.won)
            ps.append(shrink(wins, n, b, WIN_RATE_PRIOR_STRENGTH))
        if len(ys) < 20 or len(set(ys)) < 2:
            print(f"{case_type:<22}{len(ys):>7}{'too few to score':>28}")
            continue
        print(f"{case_type:<22}{len(ys):>7}{np.mean(ps):>12.3f}{np.mean(ys):>11.3f}"
              f"{np.mean(ps)-np.mean(ys):>+9.3f}{auc(ys,ps):>9.4f}")

    print()
    print("=" * 80)
    print("THE TOP 10 OF THE AHPI RANKING, UNDER THE NEW SIGNAL")
    print("=" * 80)
    print(f"{'rank':<6}{'firm':<42}{'role':<11}{'cases':>6}{'raw':>7}{'shrunk':>8}{'shown':>9}")
    idx = kb.outcomes()
    for row in kb.exp_scores().sort_values("Rank").head(10).itertuples(index=False):
        firm_key = normalize_label(row.Firm)
        best = max(
            (("plaintiff", idx.by_firm.get((firm_key, "plaintiff"), (0, 0))),
             ("defendant", idx.by_firm.get((firm_key, "defendant"), (0, 0)))),
            key=lambda kv: kv[1][1],
        )
        role, (wins, n) = best
        if n == 0:
            print(f"{row.Rank:<6}{row.Firm[:41]:<42}{'-':<11}{0:>6}{'-':>7}{'-':>8}{'unknown':>9}")
            continue
        base = idx.baseline(role, "")
        shrunk = shrink(wins, n, base, WIN_RATE_PRIOR_STRENGTH)
        shown = "yes" if n >= MIN_CASES_FOR_WIN_RATE else "unknown"
        print(f"{row.Rank:<6}{row.Firm[:41]:<42}{role:<11}{n:>6}{wins/n:>7.2f}{shrunk:>8.2f}{shown:>9}")

    suppressed = sum(1 for n in (v[1] for v in idx.by_firm.values()) if n < MIN_CASES_FOR_WIN_RATE)
    print(f"\nfirm-roles returning unknown: {suppressed} of {len(idx.by_firm)} "
          f"({100*suppressed/len(idx.by_firm):.1f}%)")


if __name__ == "__main__":
    main()
