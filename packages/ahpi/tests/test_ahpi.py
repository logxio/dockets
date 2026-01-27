"""
Unit tests for AHPI package.
"""

import numpy as np
import pandas as pd
import pytest

from ahpi import AHPI, AHPIResult
from ahpi.preprocessing import (
    q_factor_filter,
    balance_dataframe,
    create_interaction_dataframe,
)
from ahpi.utils import ConvergenceChecker, sigmoid
from ahpi.evaluation import prediction_accuracy


class TestAHPI:
    """Tests for the core AHPI algorithm."""

    @pytest.fixture
    def sample_interactions(self) -> pd.DataFrame:
        """Create sample interaction data for testing."""
        data = {
            'priv': ['A', 'B', 'A', 'C', 'B', 'A', 'C', 'B', 'A', 'C'],
            'unpriv': ['B', 'C', 'C', 'A', 'A', 'B', 'B', 'C', 'C', 'A'],
            'win_index': [0, 1, 0, 1, 0, 0, 1, 0, 0, 1],
            'val_type': ['civil'] * 5 + ['criminal'] * 5,
            'priv_type': ['civil'] * 5 + ['criminal'] * 5,
        }
        return pd.DataFrame(data)

    def test_ahpi_returns_correct_types(self, sample_interactions):
        """Test that AHPI returns dictionaries with correct structure."""
        scores, valence, privileges = AHPI(
            sample_interactions,
            MII=10,
            MIO=10,
            minimum_iterations=3,
        )

        assert isinstance(scores, dict)
        assert isinstance(valence, dict)
        assert isinstance(privileges, dict)

        # Check all entities are in scores
        entities = set(sample_interactions['priv']) | set(sample_interactions['unpriv'])
        assert set(scores.keys()) == entities

    def test_ahpi_scores_positive(self, sample_interactions):
        """Test that exponential scores are positive."""
        scores, _, _ = AHPI(
            sample_interactions,
            MII=10,
            MIO=10,
            minimum_iterations=3,
        )

        for score in scores.values():
            assert score > 0

    def test_ahpi_valence_in_range(self, sample_interactions):
        """Test that valence probabilities are in [0, 1]."""
        _, valence, _ = AHPI(
            sample_interactions,
            MII=10,
            MIO=10,
            minimum_iterations=3,
        )

        for v in valence.values():
            assert 0 <= v <= 1

    def test_ahpi_no_valence_fitting(self, sample_interactions):
        """Test AHPI with valence fitting disabled."""
        _, valence, _ = AHPI(
            sample_interactions,
            MII=10,
            MIO=10,
            fit_valence_prob=False,
        )

        # All valence should be 1.0
        for v in valence.values():
            assert v == 1.0

    def test_ahpi_no_privilege_fitting(self, sample_interactions):
        """Test AHPI with privilege fitting disabled."""
        _, _, privileges = AHPI(
            sample_interactions,
            MII=10,
            MIO=10,
            fit_privilege=False,
        )

        # All privileges should be 0.0
        for p in privileges.values():
            assert p == 0.0

    def test_ahpi_deterministic(self, sample_interactions):
        """Test that AHPI gives consistent results."""
        result1 = AHPI(sample_interactions, MII=20, MIO=20)
        result2 = AHPI(sample_interactions, MII=20, MIO=20)

        for entity in result1[0]:
            assert np.isclose(result1[0][entity], result2[0][entity], rtol=1e-5)


class TestPreprocessing:
    """Tests for preprocessing functions."""

    def test_q_factor_filter_basic(self):
        """Test Q-factor filtering."""
        interactions = [
            ('A', 'B', 0, 't1', 't1'),
            ('B', 'C', 1, 't1', 't1'),
            ('A', 'C', 0, 't1', 't1'),
            ('C', 'A', 1, 't1', 't1'),
            ('B', 'A', 0, 't1', 't1'),
        ]

        filtered = q_factor_filter(interactions, q=1.0)
        assert len(filtered) > 0

    def test_q_factor_filter_empty_raises(self):
        """Test that empty input raises ValueError."""
        with pytest.raises(ValueError):
            q_factor_filter([], q=1.0)

    def test_balance_dataframe(self):
        """Test DataFrame balancing."""
        df = pd.DataFrame({
            'class': ['A', 'A', 'A', 'A', 'B', 'B'],
            'value': [1, 2, 3, 4, 5, 6],
        })

        balanced = balance_dataframe(df, 'class')
        counts = balanced['class'].value_counts()

        assert counts['A'] == counts['B']

    def test_create_interaction_dataframe(self):
        """Test interaction DataFrame creation."""
        interactions = [
            ('A', 'B', 0, 'type1', 'type1'),
            ('B', 'C', 1, 'type1', 'type1'),
        ]

        df = create_interaction_dataframe(interactions)

        assert len(df) == 2
        assert list(df.columns) == ['priv', 'unpriv', 'win_index', 'val_type', 'priv_type']


class TestConvergenceChecker:
    """Tests for ConvergenceChecker utility."""

    def test_stops_at_max_iterations(self):
        """Test that checker stops at maximum iterations."""
        checker = ConvergenceChecker(maximum_iterations=5, minimum_iterations=1)

        for i in range(10):
            random_vals = np.random.rand(10)
            status, iteration = checker.update(random_vals, random_vals, random_vals)

            if status == 0:
                assert iteration <= 5
                break
        else:
            pytest.fail("Should have stopped by max iterations")

    def test_respects_minimum_iterations(self):
        """Test that checker respects minimum iterations."""
        checker = ConvergenceChecker(
            maximum_iterations=100,
            minimum_iterations=5,
        )

        constant = np.ones(10)

        for i in range(10):
            status, iteration = checker.update(constant, constant, constant)

            if iteration < 5:
                assert status == 1  # Should continue

    def test_reset(self):
        """Test reset functionality."""
        checker = ConvergenceChecker(maximum_iterations=10)

        # Run a few iterations
        for _ in range(3):
            checker.update(np.ones(5), np.ones(5), np.ones(5))

        assert checker.loop_number == 3

        checker.reset()
        assert checker.loop_number == 0
        assert len(checker.old_lambdas) == 0


class TestUtils:
    """Tests for utility functions."""

    def test_sigmoid_at_zero(self):
        """Test sigmoid(0) = 0.5."""
        assert np.isclose(sigmoid(0), 0.5)

    def test_sigmoid_limits(self):
        """Test sigmoid limits."""
        assert np.isclose(sigmoid(100), 1.0, atol=1e-10)
        assert np.isclose(sigmoid(-100), 0.0, atol=1e-10)

    def test_sigmoid_symmetry(self):
        """Test sigmoid(-x) = 1 - sigmoid(x)."""
        x = np.array([-2, -1, 0, 1, 2])
        assert np.allclose(sigmoid(-x), 1 - sigmoid(x))


class TestEvaluation:
    """Tests for evaluation functions."""

    def test_prediction_accuracy_basic(self):
        """Test basic prediction accuracy computation."""
        test_df = pd.DataFrame({
            'def': ['A', 'B', 'A'],
            'pla': ['B', 'A', 'C'],
            'case_type': ['civil', 'civil', 'civil'],
            'winner': [0, 1, 0],  # A wins both against B, B wins against A
        })

        scores = pd.Series({'A': 2.0, 'B': 1.0, 'C': 0.5})
        privileges = {'civil': 0.0}
        valence = {'civil': 0.5}

        result = prediction_accuracy(test_df, scores, privileges, valence)

        assert 'accuracy' in result
        assert 'excess_accuracy' in result
        assert 'defendant_win_rate' in result
        assert result['n_test_cases'] == 3

    def test_prediction_accuracy_missing_entity(self):
        """Test handling of missing entities in scores."""
        test_df = pd.DataFrame({
            'def': ['A', 'X'],  # X not in scores
            'pla': ['B', 'Y'],  # Y not in scores
            'case_type': ['civil', 'civil'],
            'winner': [0, 1],
        })

        scores = pd.Series({'A': 2.0, 'B': 1.0})
        privileges = {'civil': 0.0}
        valence = {'civil': 0.5}

        result = prediction_accuracy(test_df, scores, privileges, valence)

        # Only one valid prediction
        assert result['n_test_cases'] == 1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
