from __future__ import annotations

import sys
from pathlib import Path


def load_package():
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    import h3_structured_canvas
    return h3_structured_canvas
