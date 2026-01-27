"""
AHPI service layer - handles model fitting and prediction.
"""

from __future__ import annotations

import hashlib
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class FitResult:
    """Container for fit results."""
    fit_id: str
    scores: dict[str, float]
    valence_probs: dict[str, float]
    privileges: dict[str, float]
    n_interactions: int
    n_firms: int
    n_case_types: int
    fit_time: float
    created_at: float = field(default_factory=time.time)


class AHPIService:
    """
    Service for AHPI model fitting and prediction.

    Maintains a cache of fit results for subsequent predictions.
    """

    def __init__(self, max_cache_size: int = 100):
        self._cache: dict[str, FitResult] = {}
        self._max_cache_size = max_cache_size

    def fit(
        self,
        interactions: list[dict[str, Any]],
        mode: str = "demo",
        q_factor: float = 10.0,
    ) -> FitResult:
        """
        Fit AHPI model on interaction data.

        Parameters
        ----------
        interactions : list[dict]
            List of interaction dicts with keys:
            plaintiff_firm, defendant_firm, outcome, case_type, weight
        mode : str
            Fitting mode: "full", "demo", or "quick"
        q_factor : float
            Q-factor for filtering

        Returns
        -------
        FitResult
            Fit results including scores, parameters, and statistics
        """
        start_time = time.time()

        # Convert to DataFrame
        df = pd.DataFrame([
            {
                'priv': i['defendant_firm'],
                'unpriv': i['plaintiff_firm'],
                'win_index': i['outcome'],
                'val_type': i.get('case_type', 'default'),
                'priv_type': i.get('case_type', 'default'),
            }
            for i in interactions
        ])

        logger.info(f"Fitting AHPI on {len(df)} interactions, mode={mode}")

        # Set parameters based on mode
        ahpi_params = self._get_ahpi_params(mode)

        # Apply Q-factor filtering only when we have enough interactions to make it stable.
        # On small samples (e.g., unit tests), aggressive filtering can drop firms and break predictions.
        if q_factor > 1 and len(df) >= 200:
            try:
                df = self._apply_q_filter(df, q_factor)
            except Exception as e:
                logger.warning(f"Q-factor filtering failed: {e}")

        # Import and run AHPI
        try:
            from ahpi import AHPI
            scores, valence_probs, privileges = AHPI(df, **ahpi_params)
        except ImportError:
            # Fallback mock for development
            logger.warning("AHPI package not available, using mock")
            scores, valence_probs, privileges = self._mock_ahpi(df)

        fit_time = time.time() - start_time

        # Generate fit ID
        fit_id = self._generate_fit_id(interactions)

        # Create result
        result = FitResult(
            fit_id=fit_id,
            scores=scores,
            valence_probs=valence_probs,
            privileges=privileges,
            n_interactions=len(df),
            n_firms=len(scores),
            n_case_types=len(valence_probs),
            fit_time=fit_time,
        )

        # Cache the result
        self._cache_result(result)

        logger.info(
            f"Fit complete: {len(scores)} firms, {len(valence_probs)} case types, "
            f"{fit_time:.2f}s"
        )

        return result

    def predict(
        self,
        fit_id: str,
        plaintiff_firm: str,
        defendant_firm: str,
        case_type: str = "default",
    ) -> dict[str, Any]:
        """
        Predict outcome using a fitted model.

        Parameters
        ----------
        fit_id : str
            ID of the fit to use
        plaintiff_firm : str
            Plaintiff's law firm
        defendant_firm : str
            Defendant's law firm
        case_type : str
            Type of case

        Returns
        -------
        dict
            Prediction results including probabilities
        """
        # Get cached fit
        fit_result = self._cache.get(fit_id)
        if not fit_result:
            raise ValueError(f"Fit ID not found: {fit_id}")

        scores = fit_result.scores
        valence = fit_result.valence_probs
        privileges = fit_result.privileges

        # Check if firms exist
        pla_score = scores.get(plaintiff_firm)
        def_score = scores.get(defendant_firm)

        if pla_score is None or def_score is None:
            missing = []
            if pla_score is None:
                missing.append(plaintiff_firm)
            if def_score is None:
                missing.append(defendant_firm)

            return {
                "success": False,
                "error": f"Firm(s) not found in training data: {missing}",
                "confidence": "unknown",
            }

        # Get case type parameters
        q = valence.get(case_type, 0.5)
        eps = privileges.get(case_type, 0.0)

        # Compute probability using Bradley-Terry model
        # P(defendant wins) = q * σ(log(λ_def) + ε - log(λ_pla)) + (1-q) * σ(log(λ_pla) - log(λ_def) - ε)
        log_diff = np.log(def_score) + eps - np.log(pla_score)
        prob_favored = 1 / (1 + np.exp(-log_diff))
        def_win_prob = q * prob_favored + (1 - q) * (1 - prob_favored)

        # Determine confidence based on data availability
        confidence = self._compute_confidence(
            fit_result, plaintiff_firm, defendant_firm
        )

        return {
            "success": True,
            "plaintiff_firm": plaintiff_firm,
            "defendant_firm": defendant_firm,
            "case_type": case_type,
            "defendant_win_probability": float(def_win_prob),
            "plaintiff_win_probability": float(1 - def_win_prob),
            "plaintiff_score": float(pla_score),
            "defendant_score": float(def_score),
            "confidence": confidence,
            "evidence": {
                "valence_probability": float(q),
                "privilege": float(eps),
            },
        }

    def counterfactual(
        self,
        fit_id: str,
        original_plaintiff: str,
        original_defendant: str,
        case_type: str = "default",
        alternative_plaintiff: str | None = None,
        alternative_defendant: str | None = None,
    ) -> dict[str, Any]:
        """
        Compute counterfactual what-if analysis.
        """
        original = self.predict(fit_id, original_plaintiff, original_defendant, case_type)

        alt_pla = alternative_plaintiff or original_plaintiff
        alt_def = alternative_defendant or original_defendant

        alternative = self.predict(fit_id, alt_pla, alt_def, case_type)

        if original.get("success") and alternative.get("success"):
            prob_change = (
                alternative["defendant_win_probability"] -
                original["defendant_win_probability"]
            )
        else:
            prob_change = 0.0

        return {
            "success": True,
            "original": original,
            "alternative": alternative,
            "probability_change": prob_change,
        }

    def get_rankings(
        self,
        fit_id: str,
        top_n: int = 100,
    ) -> list[dict[str, Any]]:
        """Get ranked list of firms from a fit."""
        fit_result = self._cache.get(fit_id)
        if not fit_result:
            raise ValueError(f"Fit ID not found: {fit_id}")

        # Sort by score
        sorted_firms = sorted(
            fit_result.scores.items(),
            key=lambda x: x[1],
            reverse=True
        )[:top_n]

        return [
            {"firm": firm, "score": score, "rank": i + 1}
            for i, (firm, score) in enumerate(sorted_firms)
        ]

    def get_case_type_params(self, fit_id: str) -> list[dict[str, Any]]:
        """Get case type parameters from a fit."""
        fit_result = self._cache.get(fit_id)
        if not fit_result:
            raise ValueError(f"Fit ID not found: {fit_id}")

        case_types = set(fit_result.valence_probs.keys()) | set(fit_result.privileges.keys())

        return [
            {
                "case_type": ct,
                "valence_probability": fit_result.valence_probs.get(ct, 0.5),
                "privilege": fit_result.privileges.get(ct, 0.0),
            }
            for ct in case_types
        ]

    def get_active_fits(self) -> int:
        """Return number of cached fits."""
        return len(self._cache)

    # -------------------------------------------------------------------------
    # Private methods
    # -------------------------------------------------------------------------

    def _get_ahpi_params(self, mode: str) -> dict[str, Any]:
        """Get AHPI parameters based on mode."""
        if mode == "quick":
            return {"MII": 10, "MIO": 10, "minimum_iterations": 3}
        elif mode == "demo":
            return {"MII": 20, "MIO": 20, "minimum_iterations": 5}
        else:  # full
            return {"MII": 50, "MIO": 50, "minimum_iterations": 10}

    def _apply_q_filter(self, df: pd.DataFrame, q: float) -> pd.DataFrame:
        """Apply Q-factor filtering."""
        from collections import Counter

        all_firms = df[['priv', 'unpriv']].values.flatten()
        freq = Counter(all_firms)
        curr_q = len(df) / len(set(all_firms))

        if curr_q >= q:
            return df

        # Remove lowest frequency firms
        min_freq = min(freq.values())
        low_freq_firms = {f for f, c in freq.items() if c == min_freq}

        filtered = df[~df[['priv', 'unpriv']].isin(low_freq_firms).any(axis=1)]

        if len(filtered) == 0:
            return df

        return self._apply_q_filter(filtered, q)

    def _generate_fit_id(self, interactions: list[dict]) -> str:
        """Generate unique fit ID."""
        # Create hash from interaction data
        data_str = str(sorted([
            (i.get('plaintiff_firm', ''), i.get('defendant_firm', ''))
            for i in interactions[:100]  # Sample for speed
        ]))
        data_hash = hashlib.md5(data_str.encode()).hexdigest()[:8]

        return f"fit_{data_hash}_{uuid.uuid4().hex[:4]}"

    def _cache_result(self, result: FitResult) -> None:
        """Cache fit result, evicting old entries if needed."""
        # Evict oldest if at capacity
        if len(self._cache) >= self._max_cache_size:
            oldest = min(self._cache.values(), key=lambda x: x.created_at)
            del self._cache[oldest.fit_id]

        self._cache[result.fit_id] = result

    def _compute_confidence(
        self,
        fit_result: FitResult,
        plaintiff: str,
        defendant: str,
    ) -> str:
        """Compute confidence level for prediction."""
        # Simple heuristic based on firm rankings
        scores = fit_result.scores

        pla_score = scores.get(plaintiff, 0)
        def_score = scores.get(defendant, 0)

        # Higher scores = more data = more confidence
        avg_score = (pla_score + def_score) / 2

        if avg_score > 1.5:
            return "high"
        elif avg_score > 1.0:
            return "medium"
        else:
            return "low"

    def _mock_ahpi(self, df: pd.DataFrame) -> tuple[dict, dict, dict]:
        """Mock AHPI for development when package not available."""
        firms = set(df['priv']) | set(df['unpriv'])
        case_types = set(df['val_type'])

        # Random scores
        np.random.seed(42)
        scores = {firm: np.random.uniform(0.5, 2.0) for firm in firms}
        valence = {ct: np.random.uniform(0.4, 0.6) for ct in case_types}
        privileges = {ct: np.random.uniform(-0.2, 0.2) for ct in case_types}

        return scores, valence, privileges


# Global service instance
ahpi_service = AHPIService()
