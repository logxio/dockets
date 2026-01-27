"""
Tests for legal pipeline package.
"""

import pandas as pd
import pytest
import tempfile
from pathlib import Path

from pipeline import PipelineConfig
from pipeline.transform import (
    cases_to_interactions,
    generate_insights,
    filter_top_n_subgraph,
)
from pipeline.export import (
    export_interactions_csv,
    export_rankings_csv,
)


class TestPipelineConfig:
    """Tests for pipeline configuration."""

    def test_default_config(self):
        """Test default configuration values."""
        config = PipelineConfig()
        assert config.data_dir == "data/"
        assert config.demo_mode is False
        assert config.q_factor == 60

    def test_demo_mode_config(self):
        """Test demo mode configuration."""
        config = PipelineConfig(demo_mode=True, demo_n_cases=500)
        assert config.demo_mode is True
        assert config.demo_n_cases == 500

    def test_json_roundtrip(self):
        """Test config serialization."""
        config = PipelineConfig(demo_mode=True, top_n_firms=50)

        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
            config.to_json(f.name)
            loaded = PipelineConfig.from_json(f.name)

        assert loaded.demo_mode == config.demo_mode
        assert loaded.top_n_firms == config.top_n_firms


class TestTransform:
    """Tests for transform functions."""

    @pytest.fixture
    def sample_interactions(self) -> pd.DataFrame:
        """Create sample interaction data."""
        return pd.DataFrame({
            'priv': ['A', 'B', 'A', 'C', 'B'],
            'unpriv': ['B', 'C', 'C', 'A', 'A'],
            'win_index': [0, 1, 0, 1, 0],
            'val_type': ['civil', 'civil', 'criminal', 'criminal', 'civil'],
            'priv_type': ['civil', 'civil', 'criminal', 'criminal', 'civil'],
        })

    @pytest.fixture
    def sample_rankings(self) -> pd.DataFrame:
        """Create sample rankings."""
        return pd.DataFrame({
            'firm': ['A', 'B', 'C'],
            'score': [1.5, 1.2, 0.8],
            'rank': [1, 2, 3],
        })

    def test_generate_insights(self, sample_interactions, sample_rankings):
        """Test insight generation."""
        insights = generate_insights(sample_interactions, sample_rankings, top_n=3)

        assert len(insights) > 0
        assert all('type' in i for i in insights)
        assert all('title' in i for i in insights)

    def test_filter_top_n_subgraph(self, sample_interactions, sample_rankings):
        """Test subgraph filtering."""
        filtered = filter_top_n_subgraph(
            sample_interactions,
            sample_rankings,
            top_n=2  # Only A and B
        )

        # Should only have interactions between A and B
        assert all(filtered['priv'].isin(['A', 'B']))
        assert all(filtered['unpriv'].isin(['A', 'B']))


class TestExport:
    """Tests for export functions."""

    @pytest.fixture
    def sample_df(self) -> pd.DataFrame:
        """Create sample DataFrame for export."""
        return pd.DataFrame({
            'priv': ['FirmA', 'FirmB'],
            'unpriv': ['FirmB', 'FirmC'],
            'win_index': [0, 1],
            'val_type': ['civil', 'criminal'],
        })

    def test_export_interactions_csv(self, sample_df):
        """Test interactions CSV export."""
        with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as f:
            export_interactions_csv(sample_df, f.name)
            loaded = pd.read_csv(f.name)

        assert 'RowId' in loaded.columns
        assert 'PlaintiffFirm' in loaded.columns
        assert 'DefendantFirm' in loaded.columns
        assert len(loaded) == 2

    def test_export_rankings_csv(self):
        """Test rankings CSV export."""
        rankings = pd.DataFrame({
            'firm': ['A', 'B', 'C'],
            'score': [1.5, 1.2, 0.8],
            'rank': [1, 2, 3],
        })

        with tempfile.NamedTemporaryFile(suffix='.csv', delete=False) as f:
            export_rankings_csv(rankings, f.name)
            loaded = pd.read_csv(f.name)

        assert 'Firm' in loaded.columns
        assert 'Score' in loaded.columns
        assert 'Rank' in loaded.columns


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
