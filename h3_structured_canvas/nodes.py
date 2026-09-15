"""ComfyUI node definitions for H3 Structured Canvas."""

from __future__ import annotations

import copy
from typing import Any

from .compiler import compile_h3_prompt
from .schema import DEFAULT_CONFIG_JSON, DEFAULT_LAYOUT_JSON, sanitize_layout

CATEGORY = "MiniMax H3/Structured Prompt"
_RUNTIME_SLOT_IMAGES = "_h3_slot_images"
_VISIBLE_IMAGE_SLOTS = ("a", "b", "c")


def _semantic_layout(layout: Any) -> Any:
    """Return layout data without runtime IMAGE payloads.

    IMAGE tensors are execution-time sidecars. They must never enter schema
    sanitization, layout JSON, compiler model structure, or debug JSON.
    """
    if not isinstance(layout, dict) or _RUNTIME_SLOT_IMAGES not in layout:
        return layout
    return {key: value for key, value in layout.items() if key != _RUNTIME_SLOT_IMAGES}


def _runtime_slot_images(layout: Any) -> dict[str, Any]:
    if not isinstance(layout, dict):
        return {}
    images = layout.get(_RUNTIME_SLOT_IMAGES)
    return images if isinstance(images, dict) else {}


def _picture_mapping_suffix(layout: Any) -> str:
    """Build deterministic <Picture n> mapping for connected A/B/C images.

    MiniMax H3 Reference to Video numbers only the connected reference images,
    in input order. Mirror that compaction here so A/C becomes Picture 1/2 when
    B is disconnected.
    """
    images = _runtime_slot_images(layout)
    connected = [slot for slot in _VISIBLE_IMAGE_SLOTS if images.get(slot) is not None]
    if not connected:
        return ""
    lines = ["Reference image mapping:"]
    for ordinal, slot in enumerate(connected, start=1):
        lines.append(f"- <Picture {ordinal}> is the visual reference for Slot {slot.upper()}.")
    lines.append(
        "Preserve each mapped slot's identity and appearance from its assigned picture while following its Canvas layout and motion."
    )
    return "\n".join(lines)


class H3StructuredCanvas:
    """Interactive 0..1000 BBOX canvas with optional A/B/C IMAGE inputs."""

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
                "A": ("IMAGE", {"forceInput": True}),
                "B": ("IMAGE", {"forceInput": True}),
                "C": ("IMAGE", {"forceInput": True}),
            },
        }

    RETURN_TYPES = ("H3_LAYOUT", "INT", "INT", "IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("layout", "width", "height", "A", "B", "C")
    FUNCTION = "build"
    CATEGORY = CATEGORY
    DESCRIPTION = "Draw normalized 0–1000 semantic BBOX layout. Optional A/B/C IMAGE inputs pass through for MiniMax H3 Reference to Video and bypass cleanly when disconnected."

    def build(
        self,
        canvas_width: int,
        canvas_height: int,
        layout_json: str,
        width: int | None = None,
        height: int | None = None,
        A: Any = None,
        B: Any = None,
        C: Any = None,
    ) -> tuple[dict[str, Any], int, int, Any, Any, Any]:
        layout, warnings = sanitize_layout(
            layout_json,
            width_override=width if width is not None else canvas_width,
            height_override=height if height is not None else canvas_height,
        )
        if warnings:
            layout = dict(layout)
            layout["warnings"] = warnings

        slot_images = {slot: image for slot, image in (("a", A), ("b", B), ("c", C)) if image is not None}
        if slot_images:
            layout = dict(layout)
            layout[_RUNTIME_SLOT_IMAGES] = slot_images

        return layout, int(layout["canvas"]["width"]), int(layout["canvas"]["height"]), A, B, C


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
        start_images = _runtime_slot_images(start_layout)
        end_images = _runtime_slot_images(end_layout)
        start, start_warnings = sanitize_layout(_semantic_layout(start_layout))
        end, end_warnings = sanitize_layout(_semantic_layout(end_layout))
        result = copy.deepcopy(start)
        result["transition"] = {
            "end_canvas": copy.deepcopy(end["canvas"]),
            "end_boxes": copy.deepcopy(end["boxes"]),
        }
        warnings = [*start_warnings, *(f"End layout: {item}" for item in end_warnings)]
        if start["canvas"]["aspect_ratio"] != end["canvas"]["aspect_ratio"]:
            warnings.append("Start and End Canvas aspect ratios differ; trajectory reliability may decrease.")
        if warnings:
            result["warnings"] = warnings

        slot_images = dict(end_images)
        slot_images.update(start_images)
        if slot_images:
            result[_RUNTIME_SLOT_IMAGES] = slot_images
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
    DESCRIPTION = "Compile normalized BBOX layout, semantic elements, motion presets and camera instructions into a MiniMax H3 prompt. Connected Canvas A/B/C images are mapped automatically to <Picture n>."

    def compile(self, layout: Any, config_json: str) -> tuple[str]:
        prompt, _structure, _debug = compile_h3_prompt(_semantic_layout(layout), config_json)
        picture_mapping = _picture_mapping_suffix(layout)
        if picture_mapping:
            prompt = f"{prompt}\n\n{picture_mapping}"
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
