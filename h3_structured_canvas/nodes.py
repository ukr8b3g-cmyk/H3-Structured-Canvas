"""ComfyUI node definitions for H3 Structured Canvas."""

from __future__ import annotations

import copy
import math
from typing import Any

from .compiler import compile_h3_prompt
from .schema import DEFAULT_CONFIG_JSON, DEFAULT_LAYOUT_JSON, sanitize_layout

CATEGORY = "MiniMax H3/Structured Prompt"
_RUNTIME_SLOT_IMAGES = "_h3_slot_images"
_PUBLIC_IMAGE_SLOTS = ("a", "b", "c")
_INTERNAL_IMAGE_SLOTS = ("a", "b", "c", "d", "e")
_H3_FPS = 24


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


def _connected_slot_images(layout: Any) -> list[tuple[str, Any]]:
    """Return connected slot images in canonical A-E order.

    A/B/C are the V1 public Canvas sockets. D/E intentionally remain hidden,
    but the runtime contract already understands them so a future UI reveal
    does not require changing Picture numbering or the downstream node.
    """
    images = _runtime_slot_images(layout)
    return [(slot, images[slot]) for slot in _INTERNAL_IMAGE_SLOTS if images.get(slot) is not None]


def _picture_mapping_suffix(layout: Any) -> str:
    """Build deterministic <Picture n> mapping for connected slot images.

    MiniMax H3 Reference to Video numbers only connected reference images in
    input order. Mirror that compaction here. Public V1 is A/B/C; hidden D/E
    use the same canonical mapping if they are supplied by a future frontend.
    """
    connected = _connected_slot_images(layout)
    if not connected:
        return ""
    lines = ["Reference image mapping:"]
    for ordinal, (slot, _image) in enumerate(connected, start=1):
        lines.append(f"- <Picture {ordinal}> is the visual reference for Slot {slot.upper()}.")
    lines.append(
        "Preserve each mapped slot's identity and appearance from its assigned picture while following its Canvas layout and motion."
    )
    return "\n".join(lines)


def _h3_frame_count(layout: Any) -> int:
    """Convert the Canvas timeline duration to MiniMax H3's 17k+5 frame grid."""
    duration = 5.0
    if isinstance(layout, dict):
        timeline = layout.get("timeline_experimental")
        if isinstance(timeline, dict):
            try:
                parsed = float(timeline.get("duration_seconds", duration))
                if math.isfinite(parsed):
                    duration = max(5.0, min(15.0, parsed))
            except (TypeError, ValueError, OverflowError):
                pass
    frames = max(5, int(round(duration * _H3_FPS)))
    while frames % 17 != 5:
        frames += 1
    return frames


def _core_reference_to_video(
    *,
    clip: Any,
    vae: Any,
    prompt: str,
    width: int,
    height: int,
    length: int,
    ref_images: dict[str, Any],
) -> Any:
    """Call ComfyUI Core's MiniMax H3 reference-conditioning implementation."""
    try:
        from comfy_extras.nodes_minimax_h3 import MiniMaxH3ReferenceToVideo
    except (ImportError, AttributeError) as exc:
        raise RuntimeError(
            "MiniMax H3 Reference to Video is not available in this ComfyUI Core. "
            "Update ComfyUI to a version that includes MiniMaxH3ReferenceToVideo."
        ) from exc

    return MiniMaxH3ReferenceToVideo.execute(
        clip=clip,
        vae=vae,
        prompt=prompt,
        width=width,
        height=height,
        length=length,
        ref_image_size="match",
        ref_images=ref_images,
    )


class H3StructuredCanvas:
    """Interactive 0..1000 BBOX canvas with optional public A/B/C IMAGE inputs."""

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

    RETURN_TYPES = ("H3_LAYOUT", "INT", "INT")
    RETURN_NAMES = ("layout", "width", "height")
    FUNCTION = "build"
    CATEGORY = CATEGORY
    DESCRIPTION = "Draw normalized 0–1000 semantic BBOX layout. Optional A/B/C IMAGE inputs travel inside the runtime layout and bypass cleanly when disconnected. D/E remain reserved internally."

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
    ) -> tuple[dict[str, Any], int, int]:
        layout, warnings = sanitize_layout(
            layout_json,
            width_override=width if width is not None else canvas_width,
            height_override=height if height is not None else canvas_height,
        )
        if warnings:
            layout = dict(layout)
            layout["warnings"] = warnings

        public_images = (A, B, C)
        slot_images = {
            slot: image
            for slot, image in zip(_PUBLIC_IMAGE_SLOTS, public_images)
            if image is not None
        }
        if slot_images:
            layout = dict(layout)
            layout[_RUNTIME_SLOT_IMAGES] = slot_images

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
    DESCRIPTION = "Compile normalized BBOX layout, semantic elements, motion presets and camera instructions into a MiniMax H3 prompt. Connected Canvas images are mapped automatically to <Picture n>."

    def compile(self, layout: Any, config_json: str) -> tuple[str]:
        prompt, _structure, _debug = compile_h3_prompt(_semantic_layout(layout), config_json)
        picture_mapping = _picture_mapping_suffix(layout)
        if picture_mapping:
            prompt = f"{prompt}\n\n{picture_mapping}"
        return (prompt,)


class H3StructuredReferenceToVideo:
    """Turn a structured layout + prompt into native MiniMax H3 conditioning."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP", {"forceInput": True}),
                "vae": ("VAE", {"forceInput": True}),
                "layout": ("H3_LAYOUT", {"forceInput": True}),
                "prompt": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "LATENT")
    RETURN_NAMES = ("positive", "latent")
    FUNCTION = "condition"
    CATEGORY = CATEGORY
    EXPERIMENTAL = True
    DESCRIPTION = "Native MiniMax H3 Reference-to-Video conditioning for Structured Canvas. Public A/B/C and reserved D/E runtime images are mapped automatically; width, height and duration come from Canvas/Timeline."

    def condition(self, clip: Any, vae: Any, layout: Any, prompt: str) -> Any:
        semantic_layout, _warnings = sanitize_layout(_semantic_layout(layout))
        width = int(semantic_layout["canvas"]["width"])
        height = int(semantic_layout["canvas"]["height"])
        length = _h3_frame_count(_semantic_layout(layout))
        connected = _connected_slot_images(layout)
        ref_images = {
            f"ref_image_{ordinal}": image
            for ordinal, (_slot, image) in enumerate(connected, start=1)
        }
        return _core_reference_to_video(
            clip=clip,
            vae=vae,
            prompt=str(prompt),
            width=width,
            height=height,
            length=length,
            ref_images=ref_images,
        )


NODE_CLASS_MAPPINGS = {
    "H3StructuredCanvas": H3StructuredCanvas,
    "H3LayoutTransition": H3LayoutTransition,
    "H3StructuredPrompter": H3StructuredPrompter,
    "H3StructuredReferenceToVideo": H3StructuredReferenceToVideo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3StructuredCanvas": "🧭 H3 Structured Canvas",
    "H3LayoutTransition": "↔ H3 Layout Transition",
    "H3StructuredPrompter": "🧩 H3 Structured Prompter",
    "H3StructuredReferenceToVideo": "🎬 H3 Structured Reference to Video",
}
