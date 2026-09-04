"""ComfyUI custom-node entry point."""

from __future__ import annotations

try:
    from .h3_structured_canvas import (
        NODE_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS,
        __version__,
    )
except ImportError:  # Allows direct test collection from a hyphenated repo folder.
    from h3_structured_canvas import (  # type: ignore[no-redef]
        NODE_CLASS_MAPPINGS,
        NODE_DISPLAY_NAME_MAPPINGS,
        __version__,
    )

WEB_DIRECTORY = "./web"

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
    "__version__",
]
