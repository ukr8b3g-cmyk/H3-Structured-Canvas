"""ComfyUI node definitions for H3 Structured Canvas."""

from __future__ import annotations

from typing import Any

from .compiler import compile_h3_prompt
from .schema import (
    DEFAULT_CONFIG_JSON,
    DEFAULT_LAYOUT_JSON,
    dumps_pretty,
    sanitize_layout,
    seconds_to_h3_length,
)

CATEGORY = "MiniMax H3/Structured Prompt"


class H3StructuredCanvas:
    """Interactive 0..1000 BBOX canvas.

    The browser extension updates the hidden widgets. Optional width/height
    sockets override the saved Canvas size at execution, allowing connection to
    ComfyUI Resolution Selector style nodes.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "canvas_width": (
                    "INT",
                    {"default": 1024, "min": 64, "max": 16384, "step": 8},
                ),
                "canvas_height": (
                    "INT",
                    {"default": 1024, "min": 64, "max": 16384, "step": 8},
                ),
                "layout_json": (
                    "STRING",
                    {
                        "default": DEFAULT_LAYOUT_JSON,
                        "multiline": True,
                        "dynamicPrompts": False,
                    },
                ),
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
    DESCRIPTION = (
        "Draws normalized 0–1000 bounding boxes. The output is semantic layout "
        "data for H3 Structured Prompter, not a hard latent-space mask."
    )

    def build(
        self,
        canvas_width: int,
        canvas_height: int,
        layout_json: str,
        width: int | None = None,
        height: int | None = None,
    ) -> tuple[dict[str, Any], str, int, int]:
        layout, warnings = sanitize_layout(
            layout_json,
            width_override=width if width is not None else canvas_width,
            height_override=height if height is not None else canvas_height,
        )
        if warnings:
            layout = dict(layout)
            layout["warnings"] = warnings
        return (
            layout,
            dumps_pretty(layout),
            int(layout["canvas"]["width"]),
            int(layout["canvas"]["height"]),
        )


class H3StructuredPrompter:
    """Compiles Canvas layout and semantic element data into an H3 prompt."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "layout": ("H3_LAYOUT", {"forceInput": True}),
                "config_json": (
                    "STRING",
                    {
                        "default": DEFAULT_CONFIG_JSON,
                        "multiline": True,
                        "dynamicPrompts": False,
                    },
                ),
            },
            "optional": {
                "end_layout": ("H3_LAYOUT", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("STRING", "H3_STRUCTURE", "STRING", "INT")
    RETURN_NAMES = ("h3_prompt", "h3_structure", "json_debug", "length")
    FUNCTION = "compile"
    CATEGORY = CATEGORY
    DESCRIPTION = (
        "Combines semantic element descriptions, normalized BBOX layout, motion "
        "presets, exact text constraints, and camera instructions into a Hybrid "
        "Structured Prompt for MiniMax H3."
    )

    def compile(
        self,
        layout: Any,
        config_json: str,
        end_layout: Any = None,
    ) -> tuple[str, dict[str, Any], str, int]:
        prompt, structure, debug = compile_h3_prompt(layout, config_json, end_layout)
        length = seconds_to_h3_length(
            structure.get("config", {}).get("duration_seconds", 5.0)
        )
        return prompt, structure, debug, length


NODE_CLASS_MAPPINGS = {
    "H3StructuredCanvas": H3StructuredCanvas,
    "H3StructuredPrompter": H3StructuredPrompter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3StructuredCanvas": "🧭 H3 Structured Canvas",
    "H3StructuredPrompter": "🧩 H3 Structured Prompter",
}
