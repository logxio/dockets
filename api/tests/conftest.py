import sys
from pathlib import Path

# Ensure `import app` works when pytest collects from `api/tests`.
API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

