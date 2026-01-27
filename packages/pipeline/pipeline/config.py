"""
Pipeline configuration management.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class PipelineConfig:
    """
    Configuration for the legal data processing pipeline.

    Attributes:
        data_dir: Directory containing source data files
        output_dir: Directory for output files
        demo_mode: Whether to use reduced dataset for faster processing
        demo_n_cases: Number of cases to sample in demo mode
        q_factor: Target Q-factor for interaction filtering
        top_n_firms: Number of top firms to include in exports
    """
    data_dir: str = "data/"
    output_dir: str = "output/"
    demo_mode: bool = False
    demo_n_cases: int = 1000
    q_factor: int = 60
    top_n_firms: int = 100
    ahpi_params: dict[str, Any] = field(default_factory=lambda: {
        "MII": 50,
        "MIO": 50,
        "minimum_iterations": 10,
    })

    @classmethod
    def from_json(cls, path: str | Path) -> "PipelineConfig":
        """Load configuration from JSON file."""
        with open(path, 'r') as f:
            data = json.load(f)
        return cls(**data)

    @classmethod
    def from_env(cls) -> "PipelineConfig":
        """Load configuration from environment variables."""
        demo_mode = os.getenv("DEMO_MODE", "").lower() in ("1", "true", "yes")

        config = cls(
            data_dir=os.getenv("DATA_DIR", "data/"),
            output_dir=os.getenv("OUTPUT_DIR", "output/"),
            demo_mode=demo_mode,
            demo_n_cases=int(os.getenv("DEMO_N_CASES", "1000")),
            q_factor=int(os.getenv("Q_FACTOR", "60" if not demo_mode else "10")),
            top_n_firms=int(os.getenv("TOP_N_FIRMS", "100")),
        )

        if demo_mode:
            config.ahpi_params = {
                "MII": int(os.getenv("DEMO_MII", "20")),
                "MIO": int(os.getenv("DEMO_MIO", "20")),
                "minimum_iterations": int(os.getenv("DEMO_MIN_ITERS", "5")),
            }

        return config

    def to_json(self, path: str | Path) -> None:
        """Save configuration to JSON file."""
        with open(path, 'w') as f:
            json.dump(self.__dict__, f, indent=2)

    def get_cases_path(self) -> Path:
        """Get path to cases_df.csv.gz."""
        return Path(self.data_dir) / "cases_df.csv.gz"

    def get_output_path(self, filename: str) -> Path:
        """Get path for an output file."""
        output_dir = Path(self.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir / filename
