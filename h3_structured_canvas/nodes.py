"""ComfyUI node definitions for H3 Structured Canvas."""

from __future__ import annotations

import copy
import logging
from typing import Any

from .compiler import compile_h3_prompt
from .schema import DEFAULT_CONFIG_JSON, DEFAULT_LAYOUT_JSON, sanitize_layout

CATEGORY = "MiniMax H3/Structured Prompt"
LOG = logging.getLogger("h3_structured_canvas")


def _log_warnings(context: str, warnings: Any) -> None:
    if not isinstance(warnings, list):
        return
    for item in warnings:
        text = str(item or "").strip()
        if text:
            LOG.warning("%s: %s", context, text)


class H3StructuredCanvas:
    """Interactive 0..1000 BBOX canvas."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "canvas_width": ("INT", {"default": 1024, "min": 64, "max": 16384, "step": 8}),
                "canvas_height": ("INT", {"default": 1024, "min": 64, "max": 16384, "step": 8}),
                "layout_json": ("STRING", {"default": DEFAULT_LAYOUT_JSON, "multiline": True, "dynamicPrompts": False}),
            },
            "optional": {
                "width": ("INT", {"forceInput": True}),
                "height": ("INT", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("H3_LAYOUT", "INT", "INT")
    RETURN_NAMES = ("layout", "width", "height")
    FUNCTION = "build"
    CATEGORY = CATEGORY
    DESCRIPTION = "Draw normalized 0–1000 semantic BBOX layout for H3 Structured Prompter."

    def build(self, canvas_width: int, canvas_height: int, layout_json: str, width: int | None = None, height: int | None = None) -> tuple[dict[str, Any], int, int]:
        layout, warnings = sanitize_layout(
            layout_json,
            width_override=width if width is not None else canvas_width,
            height_override=height if height is not None else canvas_height,
        )
        if warnings:
            layout = dict(layout)
            layout["warnings"] = warnings
            _log_warnings("H3 Structured Canvas", warnings)
        return layout, int(layout["canvas"]["width"]), int(layout["canvas"]["height"])


class H3LayoutTransition:
    """Combine two Canvas layouts into Start/End soft trajectory anchors."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "start_layout": ("H3_LAYOUT", {"forceInput": True}),
                "end_layout": ("H3_LAYOUT", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("H3_LAYOUT",)
    RETURN_NAMES = ("layout",)
    FUNCTION = "combine"
    CATEGORY = CATEGORY
    DESCRIPTION = "Optional helper for Start → End motion. Insert between two Canvas nodes and the Prompter."

    def combine(self, start_layout: Any, end_layout: Any) -> tuple[dict[str, Any]]:
        start, start_warnings = sanitize_layout(start_layout)
        end, end_warnings = sanitize_layout(end_layout)
        result = copy.deepcopy(start)
        result["transition"] = {
            "end_canvas": copy.deepcopy(end["canvas"]),
            "end_boxes": copy.deepcopy(end["boxes"]),
        }
        warnings = [*start_warnings, *(f"End layout: {item}" for item in end_warnings)]
        if start["canvas"]["aspect_ratio"] != end["canvas"]["aspect_ratio"]:
            warnings.append("Start and End Canvas aspect ratios differ; trajectory reliability may decrease.")
        warnings = list(dict.fromkeys(str(item) for item in warnings if str(item).strip()))
        if warnings:
            result["warnings"] = warnings
            _log_warnings("H3 Layout Transition", warnings)
        return (result,)


class H3StructuredPrompter:
    """Compile Canvas layout and semantic element data into an H3 prompt."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "layout": ("H3_LAYOUT", {"forceInput": True}),
                "config_json": ("STRING", {"default": DEFAULT_CONFIG_JSON, "multiline": True, "dynamicPrompts": False}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "compile"
    CATEGORY = CATEGORY
    DESCRIPTION = "Compile normalized BBOX layout, semantic elements, motion presets and camera instructions into a MiniMax H3 prompt."

    def compile(self, layout: Any, config_json: str) -> tuple[str]:
        prompt, structure, _debug = compile_h3_prompt(layout, config_json)
        _log_warnings("H3 Structured Prompter", structure.get("warnings"))
        return (prompt,)


NODE_CLASS_MAPPINGS = {
    "H3StructuredCanvas": H3StructuredCanvas,
    "H3LayoutTransition": H3LayoutTransition,
    "H3StructuredPrompter": H3StructuredPrompter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3StructuredCanvas": "🧭 H3 Structured Canvas",
    "H3LayoutTransition": "↔ H3 Layout Transition",
    "H3StructuredPrompter": "🧩 H3 Structured Prompter",
}
