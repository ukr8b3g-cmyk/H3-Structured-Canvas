"""Validation and normalization for H3 Structured Canvas data.

The public node surface intentionally exchanges plain dictionaries so it remains
independent from MiniMax H3, ComfyUI-H3-Continuum, and any text encoder node.
"""

from __future__ import annotations

import copy
import json
import math
import re
from typing import Any, Iterable

PACKAGE_VERSION = "0.9.2-beta.3"
LAYOUT_SCHEMA = "h3_structured_canvas/0.9"
CONFIG_SCHEMA = "h3_structured_prompt_config/0.9"
STRUCTURE_SCHEMA = "h3_structured_prompt/0.9"

SLOTS = ("a", "b", "c", "d", "e")
UI_COLORS = {"a": "red", "b": "blue", "c": "yellow", "d": "green", "e": "magenta"}

MAX_CANVAS_SIZE = 16384
MIN_CANVAS_SIZE = 64
MAX_SCENE_LENGTH = 6000
MAX_DESCRIPTION_LENGTH = 4000
MAX_EXACT_TEXT_LENGTH = 512
MAX_CUSTOM_INSTRUCTION_LENGTH = 6000
MAX_JSON_LENGTH = 512_000

_ALLOWED_TYPES = {"auto", "subject", "object", "text", "graphic"}
_ALLOWED_MOTIONS = {
    "none",
    "hold",
    "start_end",
    "move_left_right",
    "move_right_left",
    "move_top_bottom",
    "move_bottom_top",
    "fade_in",
    "fade_out",
    "slide_in_left",
    "slide_in_right",
    "slide_in_top",
    "slide_in_bottom",
    "scale_up",
    "scale_down",
    "pop_in",
    "grow_up",
    "grow_down",
    "grow_left",
    "grow_right",
    "radial_fill",
    "progress_fill",
    "reveal",
}
_LEGACY_MOTION_MAP = {
    "static": "none",
    "slide_up": "slide_in_bottom",
    "slide_down": "slide_in_top",
}
_ALLOWED_COMPILER_MODES = {"hybrid", "json_only", "natural_language"}
_ALLOWED_OUTPUT_FORMATS = {"direct", "h3_envelope"}
_ALLOWED_REINFORCEMENT = {"compact", "balanced", "strong"}
_ALLOWED_SCHEMA_PROFILES = {"verified_split_bbox", "qwen_unified_bbox2d"}
_ALLOWED_CAMERA_MOTIONS = {
    "Static Shot", "Push In", "Pull Out", "Pan Left", "Pan Right",
    "Truck Left", "Truck Right", "Tilt Up", "Tilt Down", "Pedestal Up",
    "Pedestal Down", "Arc Shot", "Tracking Shot", "POV",
    "Roll Clockwise", "Roll Counterclockwise",
}
_ALLOWED_SPEEDS = {"auto", "slow", "medium", "fast"}
_ALLOWED_AMPLITUDES = {"auto", "small", "medium", "large"}
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _clean_text(value: Any, limit: int) -> str:
    text = "" if value is None else str(value)
    return _CONTROL_CHARS.sub("", text).strip()[:limit]


def _coerce_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        if isinstance(value, bool):
            raise ValueError
        parsed = int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        return default
    return max(minimum, min(maximum, parsed))


def _coerce_float(value: Any, default: float | None = None, minimum: float | None = None, maximum: float | None = None) -> float | None:
    try:
        if isinstance(value, bool):
            raise ValueError
        parsed = float(value)
        if not math.isfinite(parsed):
            raise ValueError
    except (TypeError, ValueError, OverflowError):
        return default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off", ""}:
            return False
    return default


def _normalize_slot(value: Any, fallback_index: int | None = None) -> str | None:
    slot = str(value or "").strip().lower()
    reverse_colors = {color: key for key, color in UI_COLORS.items()}
    slot = reverse_colors.get(slot, slot)
    match = re.fullmatch(r"(?:slot|element|subject|object|text|graphic)[_-]?([a-e])", slot)
    if match:
        return match.group(1)
    if slot in SLOTS:
        return slot
    if slot in {"1", "2", "3", "4", "5"}:
        return SLOTS[int(slot) - 1]
    if fallback_index is not None and 0 <= fallback_index < len(SLOTS):
        return SLOTS[fallback_index]
    return None


def safe_json_loads(value: Any, fallback: Any) -> Any:
    """Compatibility helper that returns a deep-copied fallback on invalid JSON."""
    if isinstance(value, (dict, list)):
        return copy.deepcopy(value)
    if not isinstance(value, str) or not value.strip() or len(value) > MAX_JSON_LENGTH:
        return copy.deepcopy(fallback)
    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return copy.deepcopy(fallback)


def _load_json_source(value: Any, fallback: Any, label: str, warnings: list[str]) -> Any:
    """Parse user-controlled JSON while making fallback behavior observable."""
    if isinstance(value, (dict, list)):
        return copy.deepcopy(value)
    if not isinstance(value, str):
        warnings.append(f"{label} was not JSON-compatible; defaults were used.")
        return copy.deepcopy(fallback)
    if not value.strip():
        warnings.append(f"{label} was empty; defaults were used.")
        return copy.deepcopy(fallback)
    if len(value) > MAX_JSON_LENGTH:
        warnings.append(f"{label} exceeded the maximum size; defaults were used.")
        return copy.deepcopy(fallback)
    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        warnings.append(f"{label} could not be parsed; defaults were used.")
        return copy.deepcopy(fallback)


def _dedupe_warnings(warnings: Iterable[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in warnings:
        text = _clean_text(item, 1000)
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def dumps_compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def dumps_pretty(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def simplified_aspect_ratio(width: int, height: int) -> str:
    width = max(1, int(width)); height = max(1, int(height)); ratio = width / height
    canonical = ((1, 1), (16, 9), (9, 16), (4, 3), (3, 4), (3, 2), (2, 3), (21, 9), (9, 21))
    best = min(canonical, key=lambda item: abs(ratio - item[0] / item[1]) / (item[0] / item[1]))
    relative_error = abs(ratio - best[0] / best[1]) / (best[0] / best[1])
    if relative_error <= 0.025:
        return f"{best[0]}:{best[1]}"
    divisor = math.gcd(width, height)
    return f"{width // divisor}:{height // divisor}"


def normalize_bbox(value: Any) -> list[int] | None:
    if isinstance(value, dict):
        if "bbox_2d" in value:
            value = value.get("bbox_2d")
        elif "bbox" in value:
            value = value.get("bbox")
        else:
            value = [value.get("x1"), value.get("y1"), value.get("x2"), value.get("y2")]
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        return None
    coords: list[float] = []
    for item in value:
        parsed = _coerce_float(item)
        if parsed is None:
            return None
        coords.append(parsed)
    if max(abs(item) for item in coords) <= 1.000001:
        coords = [item * 1000.0 for item in coords]
    x1, y1, x2, y2 = (max(0.0, min(1000.0, item)) for item in coords)
    left, right = sorted((x1, x2)); top, bottom = sorted((y1, y2))
    if right - left < 1.0 or bottom - top < 1.0:
        return None
    return [int(round(left)), int(round(top)), int(round(right)), int(round(bottom))]


def default_layout() -> dict[str, Any]:
    return {
        "schema": LAYOUT_SCHEMA,
        "canvas": {
            "width": 1024, "height": 1024, "aspect_ratio": "1:1",
            "coordinate_space": "normalized_0_1000", "bbox_format": "xyxy",
            "grid": "thirds", "show_boxes": True, "active_slot": "a",
        },
        "boxes": [],
    }


def default_slot_config(slot: str) -> dict[str, Any]:
    return {
        "slot": slot,
        "enabled": True,
        "type": "subject" if slot in {"a", "b"} else "object",
        "description": "",
        "exact_text": "",
        "motion": "none",
        "value": None,
        "order": SLOTS.index(slot) + 1,
        "custom_behavior": "",
    }


def default_config() -> dict[str, Any]:
    return {
        "schema": CONFIG_SCHEMA,
        "ui_language": "auto",
        "scene_description": "",
        "compiler_mode": "hybrid",
        "output_format": "direct",
        "schema_profile": "verified_split_bbox",
        "reinforcement": "balanced",
        "exact_text_safety": True,
        "allow_additional_text": False,
        "full_frame": True,
        "slots": {slot: default_slot_config(slot) for slot in SLOTS},
        "camera": {"motion": "Static Shot", "speed": "auto", "amplitude": "auto"},
        "soundscape": "",
        "music": "",
        "custom_instruction": "",
    }


def _extract_boxes(raw: dict[str, Any]) -> Iterable[Any]:
    boxes = raw.get("boxes")
    if isinstance(boxes, list):
        return boxes
    layout = raw.get("layout")
    if isinstance(layout, dict) and isinstance(layout.get("boxes"), list):
        return layout["boxes"]
    canvas = raw.get("canvas")
    if isinstance(canvas, dict) and isinstance(canvas.get("boxes"), list):
        return canvas["boxes"]
    return []


def sanitize_layout(raw: Any, *, width_override: Any = None, height_override: Any = None) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    source = _load_json_source(raw, default_layout(), "Layout JSON", warnings)
    if not isinstance(source, dict):
        source = default_layout()
        warnings.append("Layout data was not an object; defaults were used.")

    inherited_warnings = source.get("warnings")
    if isinstance(inherited_warnings, list):
        warnings.extend(inherited_warnings)

    canvas = source.get("canvas") if isinstance(source.get("canvas"), dict) else {}
    base_width = source.get("width", canvas.get("width", 1024)); base_height = source.get("height", canvas.get("height", 1024))
    width = _coerce_int(width_override if width_override is not None else base_width, 1024, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE)
    height = _coerce_int(height_override if height_override is not None else base_height, 1024, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE)
    grid = str(canvas.get("grid", source.get("grid", "thirds"))).lower()
    if grid not in {"none", "thirds", "cross", "quarters"}: grid = "thirds"
    active_slot = str(canvas.get("active_slot", source.get("active_slot", "a"))).lower()
    if active_slot not in SLOTS: active_slot = "a"

    by_slot: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(_extract_boxes(source)):
        if not isinstance(item, dict): continue
        slot = _normalize_slot(item.get("slot") or item.get("id"), index)
        if slot is None: continue
        active = _coerce_bool(item.get("active", item.get("enabled", True)), True)
        bbox = normalize_bbox(item)
        if not active or bbox is None: continue
        if slot in by_slot: warnings.append(f"Duplicate box for slot {slot.upper()} was replaced by the last value.")
        by_slot[slot] = {"slot": slot, "ui_color": UI_COLORS[slot], "bbox_2d": bbox}
    boxes = [by_slot[slot] for slot in SLOTS if slot in by_slot]
    for item in boxes:
        x1, y1, x2, y2 = item["bbox_2d"]
        if x2 - x1 < 20 or y2 - y1 < 20:
            warnings.append(f"Slot {item['slot'].upper()} has a very small bounding box.")
    if not boxes:
        warnings.append("No active BBOX elements are present; no spatial layout guidance will be emitted.")

    layout: dict[str, Any] = {
        "schema": LAYOUT_SCHEMA,
        "canvas": {
            "width": width, "height": height, "aspect_ratio": simplified_aspect_ratio(width, height),
            "coordinate_space": "normalized_0_1000", "bbox_format": "xyxy", "grid": grid,
            "show_boxes": _coerce_bool(canvas.get("show_boxes", source.get("show_boxes", True)), True),
            "active_slot": active_slot,
        },
        "boxes": boxes,
    }

    transition = source.get("transition")
    if isinstance(transition, dict):
        end_source = {
            "canvas": transition.get("end_canvas") if isinstance(transition.get("end_canvas"), dict) else canvas,
            "boxes": transition.get("end_boxes") if isinstance(transition.get("end_boxes"), list) else [],
        }
        end_layout, end_warnings = sanitize_layout(end_source)
        warnings.extend(f"End layout: {warning}" for warning in end_warnings)
        if end_layout["canvas"]["aspect_ratio"] != layout["canvas"]["aspect_ratio"]:
            warnings.append("Start and End Canvas aspect ratios differ; trajectory reliability may decrease.")
        layout["transition"] = {
            "end_canvas": end_layout["canvas"],
            "end_boxes": end_layout["boxes"],
        }
    return layout, _dedupe_warnings(warnings)


def _choice(value: Any, allowed: set[str], default: str) -> str:
    text = str(value or "").strip()
    return text if text in allowed else default


def sanitize_config(raw: Any) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    source = _load_json_source(raw, default_config(), "Prompt configuration JSON", warnings)
    if not isinstance(source, dict):
        source = default_config()
        warnings.append("Prompt configuration was not an object; defaults were used.")
    result = default_config()
    result["ui_language"] = str(source.get("ui_language", "auto")).lower()
    if result["ui_language"] not in {"auto", "en", "ja"}: result["ui_language"] = "auto"
    result["scene_description"] = _clean_text(source.get("scene_description"), MAX_SCENE_LENGTH)
    result["compiler_mode"] = _choice(source.get("compiler_mode"), _ALLOWED_COMPILER_MODES, "hybrid")
    result["output_format"] = _choice(source.get("output_format"), _ALLOWED_OUTPUT_FORMATS, "direct")
    result["schema_profile"] = _choice(source.get("schema_profile"), _ALLOWED_SCHEMA_PROFILES, "verified_split_bbox")
    result["reinforcement"] = _choice(source.get("reinforcement"), _ALLOWED_REINFORCEMENT, "balanced")
    result["exact_text_safety"] = _coerce_bool(source.get("exact_text_safety", True), True)
    result["allow_additional_text"] = _coerce_bool(source.get("allow_additional_text", False), False)
    result["full_frame"] = _coerce_bool(source.get("full_frame", True), True)
    result["soundscape"] = _clean_text(source.get("soundscape"), MAX_DESCRIPTION_LENGTH)
    result["music"] = _clean_text(source.get("music"), MAX_DESCRIPTION_LENGTH)
    result["custom_instruction"] = _clean_text(source.get("custom_instruction"), MAX_CUSTOM_INSTRUCTION_LENGTH)

    source_slots = source.get("slots")
    if isinstance(source_slots, list):
        source_slots = {str(item.get("slot", "")).lower(): item for item in source_slots if isinstance(item, dict)}
    if not isinstance(source_slots, dict): source_slots = {}
    clean_slots: dict[str, dict[str, Any]] = {}
    for slot in SLOTS:
        item = source_slots.get(slot, {})
        if not isinstance(item, dict): item = {}
        clean = default_slot_config(slot)
        clean["enabled"] = _coerce_bool(item.get("enabled", True), True)
        declared_type = _choice(item.get("type"), _ALLOWED_TYPES, clean["type"])
        clean["type"] = ("subject" if slot in {"a", "b"} else "object") if declared_type == "auto" else declared_type
        clean["description"] = _clean_text(item.get("description"), MAX_DESCRIPTION_LENGTH)
        clean["exact_text"] = _clean_text(item.get("exact_text"), MAX_EXACT_TEXT_LENGTH)
        motion_raw = str(item.get("motion", "none") or "none").strip()
        motion_raw = _LEGACY_MOTION_MAP.get(motion_raw, motion_raw)
        clean["motion"] = motion_raw if motion_raw in _ALLOWED_MOTIONS else "none"

        raw_value = _coerce_float(item.get("value"), None)
        clean["value"] = None if raw_value is None else max(0.0, min(100.0, raw_value))
        if raw_value is not None and clean["value"] != raw_value:
            warnings.append(f"Slot {slot.upper()} Value (%) was clamped to the supported 0–100 range.")

        clean["order"] = _coerce_int(item.get("order", item.get("phase")), SLOTS.index(slot) + 1, 1, 99)
        clean["custom_behavior"] = _clean_text(item.get("custom_behavior"), MAX_DESCRIPTION_LENGTH)
        clean_slots[slot] = clean
    result["slots"] = clean_slots

    camera_source = source.get("camera") if isinstance(source.get("camera"), dict) else {}
    motion = str(camera_source.get("motion", "Static Shot")).strip()
    if motion not in _ALLOWED_CAMERA_MOTIONS: motion = "Static Shot"
    speed = str(camera_source.get("speed", "auto")).strip().lower(); amplitude = str(camera_source.get("amplitude", "auto")).strip().lower()
    result["camera"] = {
        "motion": motion,
        "speed": speed if speed in _ALLOWED_SPEEDS else "auto",
        "amplitude": amplitude if amplitude in _ALLOWED_AMPLITUDES else "auto",
    }
    return result, _dedupe_warnings(warnings)


DEFAULT_LAYOUT_JSON = dumps_compact(default_layout())
DEFAULT_CONFIG_JSON = dumps_compact(default_config())
