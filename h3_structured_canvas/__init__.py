"""Implementation package for ComfyUI-H3-Structured-Canvas."""

from __future__ import annotations

from pathlib import Path

# Install correctness wrappers before nodes import compiler/schema functions.
from . import schema as _schema
from .correctness import install_compiler_fixes, install_schema_fixes

install_schema_fixes(_schema)

from . import compiler as _compiler

install_compiler_fixes(_compiler)

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .schema import PACKAGE_VERSION

__version__ = PACKAGE_VERSION
_PRESET_ROOT = Path(__file__).resolve().parents[1] / "user_presets"

# Route registration is optional so the package can be imported by unit tests
# without a running ComfyUI server.
try:
    from aiohttp import web
    from server import PromptServer

    from .presets import delete_preset, load_presets, save_preset

    @PromptServer.instance.routes.get("/h3_structured_canvas/presets/{kind}")
    async def h3sc_get_presets(request):
        kind = request.match_info.get("kind", "")
        try:
            presets = load_presets(_PRESET_ROOT, kind)
        except ValueError as exc:
            return web.json_response({"error": str(exc)}, status=400)
        return web.json_response({"presets": presets})

    @PromptServer.instance.routes.post("/h3_structured_canvas/presets/{kind}")
    async def h3sc_save_preset(request):
        kind = request.match_info.get("kind", "")
        try:
            body = await request.json()
            presets = save_preset(
                _PRESET_ROOT,
                kind,
                body.get("name"),
                body.get("data"),
            )
        except (ValueError, TypeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)
        except Exception:
            return web.json_response({"error": "Unable to save preset"}, status=500)
        return web.json_response({"presets": presets})

    @PromptServer.instance.routes.post("/h3_structured_canvas/presets/{kind}/delete")
    async def h3sc_delete_preset(request):
        kind = request.match_info.get("kind", "")
        try:
            body = await request.json()
            presets = delete_preset(_PRESET_ROOT, kind, body.get("name"))
        except (ValueError, TypeError) as exc:
            return web.json_response({"error": str(exc)}, status=400)
        except Exception:
            return web.json_response({"error": "Unable to delete preset"}, status=500)
        return web.json_response({"presets": presets})
except Exception:
    pass


__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "__version__",
]
