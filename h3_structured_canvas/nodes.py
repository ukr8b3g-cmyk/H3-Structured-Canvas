"""ComfyUI node definitions for H3 Structured Canvas."""

from __future__ import annotations

from typing import Any

from .compiler import compile_h3_prompt
from .schema import DEFAULT_CONFIG_JSON, DEFAULT_LAYOUT_JSON, dumps_pretty, sanitize_layout

CATEGORY = "MiniMax H3/Structured Prompt"


class H3StructuredCanvas:
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

    RETURN_TYPES = ("H3_LAYOUT", "STRING", "INT", "INT")
    RETURN_NAMES = ("layout", "layout_json", "width", "height")
    FUNCTION = "build"
    CATEGORY = CATEGORY
    DESCRIPTION = "Draws normalized 0–1000 bounding boxes for H3 semantic layout control."

    def build(self, canvas_width: int, canvas_height: int, layout_json: str, width: int | None = None, height: int | None = None):
        layout, warnings = sanitize_layout(
            layout_json,
            width_override=width if width is not None else canvas_width,
            height_override=height if height is not None else canvas_height,
        )
        if warnings:
            layout = dict(layout)
            layout["warnings"] = warnings
        return layout, dumps_pretty(layout), int(layout["canvas"]["width"]), int(layout["canvas"]["height"])


class H3StructuredPrompter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "layout": ("H3_LAYOUT", {"forceInput": True}),
                "config_json": ("STRING", {"default": DEFAULT_CONFIG_JSON, "multiline": True, "dynamicPrompts": False}),
            },
            "optional": {"end_layout": ("H3_LAYOUT", {"forceInput": True})},
        }

    RETURN_TYPES = ("STRING", "H3_STRUCTURE", "STRING")
    RETURN_NAMES = ("h3_prompt", "h3_structure", "json_debug")
    FUNCTION = "compile"
    CATEGORY = CATEGORY
    DESCRIPTION = "Compiles H3 layout and semantic element data into a Hybrid Structured Prompt."

    def compile(self, layout: Any, config_json: str, end_layout: Any = None):
        return compile_h3_prompt(layout, config_json, end_layout)


NODE_CLASS_MAPPINGS = {
    "H3StructuredCanvas": H3StructuredCanvas,
    "H3StructuredPrompter": H3StructuredPrompter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3StructuredCanvas": "🧭 H3 Structured Canvas",
    "H3StructuredPrompter": "🧩 H3 Structured Prompter",
}
