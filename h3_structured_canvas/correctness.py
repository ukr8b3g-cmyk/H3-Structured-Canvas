"""Correctness and experimental timeline semantics for H3 Structured Canvas.

This module installs one schema wrapper and one compiler wrapper. Experimental
START/MID/END offscreen coordinates, trajectory semantics, and overlap relations
are handled in those same wrappers so behavior stays deterministic and does not
regress into stacked monkey patches.
"""

from __future__ import annotations

import copy
import json
import math
from typing import Any


_SCALE_INCREASE = 1.15
_SCALE_DECREASE = 1 / _SCALE_INCREASE
_EDGE_ANCHOR_TOLERANCE = 45.0
_CENTER_ANCHOR_TOLERANCE = 55.0
_TRANSLATION_TOLERANCE = 70.0
_OFFSCREEN_MIN = -1000.0
_OFFSCREEN_MAX = 2000.0
_STRONG_OVERLAP = 0.60
_SEPARATE_OVERLAP = 0.08
_MID_TIME = 0.5


def _parse_source(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return copy.deepcopy(raw)
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _slot(schema_module: Any, item: Any, index: int | None = None) -> str | None:
    if not isinstance(item, dict):
        return None
    normalizer = getattr(schema_module, "_normalize_slot", None)
    if callable(normalizer):
        return normalizer(item.get("slot", item.get("id")), index)
    value = str(item.get("slot", item.get("id", ""))).strip().lower()
    return value if value in getattr(schema_module, "SLOTS", ()) else None


def _loose_bbox(value: Any) -> list[int] | None:
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
        try:
            parsed = float(item)
        except (TypeError, ValueError, OverflowError):
            return None
        if not math.isfinite(parsed):
            return None
        coords.append(parsed)
    if max(abs(item) for item in coords) <= 1.000001:
        coords = [item * 1000.0 for item in coords]
    coords = [max(_OFFSCREEN_MIN, min(_OFFSCREEN_MAX, item)) for item in coords]
    x1, y1, x2, y2 = coords
    left, right = sorted((x1, x2))
    top, bottom = sorted((y1, y2))
    if right - left < 1.0 or bottom - top < 1.0:
        return None
    return [int(round(left)), int(round(top)), int(round(right)), int(round(bottom))]


def _extract_box_map(schema_module: Any, items: Any) -> dict[str, list[int]]:
    result: dict[str, list[int]] = {}
    if not isinstance(items, list):
        return result
    for index, item in enumerate(items):
        slot = _slot(schema_module, item, index)
        bbox = _loose_bbox(item)
        if slot and bbox:
            result[slot] = bbox
    return result


def _merge_boxes(schema_module: Any, current: Any, loose: dict[str, list[int]]) -> list[dict[str, Any]]:
    by_slot: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(current if isinstance(current, list) else []):
        if not isinstance(item, dict):
            continue
        slot = _slot(schema_module, item, index)
        if slot:
            by_slot[slot] = copy.deepcopy(item)
    for slot, bbox in loose.items():
        item = by_slot.get(slot, {"slot": slot, "ui_color": schema_module.UI_COLORS.get(slot, "red")})
        item["slot"] = slot
        item["ui_color"] = schema_module.UI_COLORS.get(slot, item.get("ui_color", "red"))
        item["bbox_2d"] = list(bbox)
        item.pop("bbox", None)
        by_slot[slot] = item
    return [by_slot[slot] for slot in schema_module.SLOTS if slot in by_slot]


def _serialized_boxes(schema_module: Any, box_map: dict[str, list[int]]) -> list[dict[str, Any]]:
    return [
        {
            "slot": slot,
            "ui_color": schema_module.UI_COLORS.get(slot, "red"),
            "bbox_2d": list(box_map[slot]),
        }
        for slot in schema_module.SLOTS
        if slot in box_map
    ]


def _is_offscreen_bbox(bbox: list[int]) -> bool:
    return any(value < 0 or value > 1000 for value in bbox)


def _bbox_geometry(bbox: Any) -> dict[str, Any] | None:
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return None
    try:
        x1, y1, x2, y2 = (float(value) for value in bbox)
    except (TypeError, ValueError):
        return None
    left, right = sorted((x1, x2))
    top, bottom = sorted((y1, y2))
    width = max(1.0, right - left)
    height = max(1.0, bottom - top)
    return {
        "center": [(left + right) / 2.0, (top + bottom) / 2.0],
        "size": [width, height],
        "area": width * height,
        "edges": [left, top, right, bottom],
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
    }


def _description_intent(description: Any) -> str:
    text = str(description or "").strip().lower()
    toward = (
        "toward the camera", "towards the camera", "toward camera", "towards camera",
        "approach the camera", "approaches the camera", "approaching the camera",
        "walks forward", "walk forward", "comes closer", "move closer",
        "奥から手前", "手前に歩", "カメラに近", "カメラへ近",
    )
    away = (
        "away from the camera", "away from camera", "recede", "recedes", "receding",
        "into the background", "moves farther", "move farther", "walks away",
        "手前から奥", "奥へ歩", "カメラから離",
    )
    grow = (
        "becomes larger", "become larger", "grows larger", "grow larger", "grows", "grow",
        "giant", "gigantic", "巨大", "大きくなる", "巨大化",
    )
    shrink = (
        "becomes smaller", "become smaller", "shrinks", "shrink", "smaller",
        "小さくなる", "縮小",
    )
    if any(token in text for token in toward):
        return "approach_camera"
    if any(token in text for token in away):
        return "recede_camera"
    if any(token in text for token in grow):
        return "physical_growth"
    if any(token in text for token in shrink):
        return "physical_shrink"
    return "unspecified"


def _trajectory_semantics(start_bbox: Any, end_bbox: Any, element: dict[str, Any]) -> dict[str, Any] | None:
    start = _bbox_geometry(start_bbox)
    end = _bbox_geometry(end_bbox)
    if start is None or end is None:
        return None

    start_center = start["center"]
    end_center = end["center"]
    start_size = start["size"]
    end_size = end["size"]
    dx = end_center[0] - start_center[0]
    dy = end_center[1] - start_center[1]
    width_ratio = end_size[0] / start_size[0]
    height_ratio = end_size[1] / start_size[1]
    area_ratio = end["area"] / start["area"]
    visual_scale_ratio = math.sqrt(area_ratio)

    if visual_scale_ratio >= _SCALE_INCREASE:
        scale_change = "increase"
    elif visual_scale_ratio <= _SCALE_DECREASE:
        scale_change = "decrease"
    else:
        scale_change = "stable"

    stable_anchors: list[str] = []
    if abs(dx) <= _CENTER_ANCHOR_TOLERANCE:
        stable_anchors.append("center_x")
    if abs(dy) <= _CENTER_ANCHOR_TOLERANCE:
        stable_anchors.append("center_y")
    for name, start_edge, end_edge in zip(
        ("left_edge", "top_edge", "right_edge", "bottom_edge"),
        start["edges"],
        end["edges"],
    ):
        if abs(end_edge - start_edge) <= _EDGE_ANCHOR_TOLERANCE:
            stable_anchors.append(name)

    horizontal = ""
    vertical = ""
    if abs(dx) >= _TRANSLATION_TOLERANCE:
        horizontal = "right" if dx > 0 else "left"
    if abs(dy) >= _TRANSLATION_TOLERANCE:
        vertical = "down" if dy > 0 else "up"
    screen_motion = "_".join(part for part in (vertical, horizontal) if part) or "stable"

    has_scale_anchor = scale_change != "stable" and (
        "center_x" in stable_anchors
        or "center_y" in stable_anchors
        or any(name in stable_anchors for name in ("left_edge", "top_edge", "right_edge", "bottom_edge"))
    )
    if scale_change != "stable" and has_scale_anchor:
        dominant_change = "scale"
    elif scale_change != "stable" and screen_motion != "stable":
        dominant_change = "translation_and_scale"
    elif scale_change != "stable":
        dominant_change = "scale"
    elif screen_motion != "stable":
        dominant_change = "translation"
    else:
        dominant_change = "stable"

    requested_intent = _description_intent(element.get("desc"))
    if scale_change == "increase" and requested_intent == "approach_camera":
        interpretation = "approach_camera"
    elif scale_change == "decrease" and requested_intent == "recede_camera":
        interpretation = "recede_camera"
    elif scale_change == "increase" and requested_intent == "physical_growth":
        interpretation = "physical_growth"
    elif scale_change == "decrease" and requested_intent == "physical_shrink":
        interpretation = "physical_shrink"
    elif scale_change != "stable":
        interpretation = "apparent_scale_change"
    elif requested_intent in {"approach_camera", "recede_camera"}:
        interpretation = "depth_motion_without_scale_change"
    else:
        interpretation = "screen_translation" if screen_motion != "stable" else "stable"

    return {
        "coordinate_space": "normalized_0_1000_with_offscreen_overscan",
        "time": {"start": 0.0, "end": 1.0},
        "start_center": [round(value, 3) for value in start_center],
        "end_center": [round(value, 3) for value in end_center],
        "center_delta": [round(dx, 3), round(dy, 3)],
        "start_size": [round(value, 3) for value in start_size],
        "end_size": [round(value, 3) for value in end_size],
        "width_ratio": round(width_ratio, 4),
        "height_ratio": round(height_ratio, 4),
        "area_ratio": round(area_ratio, 4),
        "visual_scale_ratio": round(visual_scale_ratio, 4),
        "scale_change": scale_change,
        "screen_motion": screen_motion,
        "stable_anchors": stable_anchors,
        "dominant_change": dominant_change,
        "semantic_interpretation": interpretation,
    }


def _outside_side(bbox: Any) -> str | None:
    box = _bbox_geometry(bbox)
    if box is None:
        return None
    if box["right"] <= 0:
        return "left"
    if box["left"] >= 1000:
        return "right"
    if box["bottom"] <= 0:
        return "top"
    if box["top"] >= 1000:
        return "bottom"
    return None


def _visibility(bbox: Any) -> str:
    box = _bbox_geometry(bbox)
    if box is None:
        return "unknown"
    side = _outside_side(bbox)
    if side:
        return f"offscreen_{side}"
    if box["left"] < 0 or box["top"] < 0 or box["right"] > 1000 or box["bottom"] > 1000:
        return "partially_visible"
    return "inside_frame"


def _offscreen_semantics(start_bbox: Any, end_bbox: Any) -> dict[str, Any]:
    start_side = _outside_side(start_bbox)
    end_side = _outside_side(end_bbox)
    result: dict[str, Any] = {
        "start_visibility": _visibility(start_bbox),
        "end_visibility": _visibility(end_bbox),
    }
    if end_side and not start_side:
        result["exit_frame"] = end_side
    if start_side and not end_side:
        result["enter_frame"] = start_side
    return result


def _intersection_metrics(a_bbox: Any, b_bbox: Any) -> dict[str, float] | None:
    a = _bbox_geometry(a_bbox)
    b = _bbox_geometry(b_bbox)
    if a is None or b is None:
        return None
    left = max(a["left"], b["left"])
    top = max(a["top"], b["top"])
    right = min(a["right"], b["right"])
    bottom = min(a["bottom"], b["bottom"])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    return {
        "intersection": intersection,
        "coverage_a": intersection / a["area"],
        "coverage_b": intersection / b["area"],
        "smaller_overlap": intersection / min(a["area"], b["area"]),
        "area_a": a["area"],
        "area_b": b["area"],
    }


def _entry_bbox(entry: dict[str, Any], endpoint: str) -> Any:
    if endpoint == "start":
        return entry.get("start_bbox", entry.get("bbox"))
    return entry.get("end_bbox", entry.get("bbox"))


def _relation_for_pair(a_id: str, a_entry: dict[str, Any], b_id: str, b_entry: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    start = _intersection_metrics(_entry_bbox(a_entry, "start"), _entry_bbox(b_entry, "start"))
    end = _intersection_metrics(_entry_bbox(a_entry, "end"), _entry_bbox(b_entry, "end"))
    if start is None or end is None:
        return None

    if start["area_a"] <= start["area_b"]:
        subject_id, target_id = a_id, b_id
        start_containment = start["coverage_a"]
        end_containment = end["coverage_a"]
    else:
        subject_id, target_id = b_id, a_id
        start_containment = start["coverage_b"]
        end_containment = end["coverage_b"]

    start_strong = start["smaller_overlap"] >= _STRONG_OVERLAP
    end_strong = end["smaller_overlap"] >= _STRONG_OVERLAP
    start_separate = start["smaller_overlap"] <= _SEPARATE_OVERLAP
    end_separate = end["smaller_overlap"] <= _SEPARATE_OVERLAP

    if start_strong and end_separate:
        change = "separates_from"
    elif start_separate and end_strong:
        change = "joins_or_overlaps"
    elif start_strong and end_strong:
        change = "strong_overlap_persists"
    else:
        return None

    return subject_id, {
        "target": target_id,
        "change": change,
        "start_smaller_overlap_ratio": round(start["smaller_overlap"], 4),
        "end_smaller_overlap_ratio": round(end["smaller_overlap"], 4),
        "start_subject_containment_ratio": round(start_containment, 4),
        "end_subject_containment_ratio": round(end_containment, 4),
        "semantic_note": "Geometric overlap only; do not infer holding, attachment, or occlusion order unless the prompt states it.",
    }


def _offscreen_clause(element_id: str, trajectory: dict[str, Any]) -> str:
    side = trajectory.get("exit_frame")
    if side:
        return (
            f"{element_id} continues completely beyond the {side} edge of the frame until it is no longer visible; "
            "do not stop it at the canvas boundary."
        )
    side = trajectory.get("enter_frame")
    if side:
        return (
            f"{element_id} begins outside the {side} edge of the frame and enters into view from that side; "
            "do not clamp its starting trajectory to the visible canvas."
        )
    return ""


def _relation_clause(element_id: str, relation: dict[str, Any]) -> str:
    target = relation.get("target", "the other element")
    change = relation.get("change")
    if change == "separates_from":
        return (
            f"{element_id} starts strongly overlapping or geometrically contained within {target}, then separates "
            "from it and moves independently. Treat them as distinct identities."
        )
    if change == "joins_or_overlaps":
        return (
            f"{element_id} starts separate from {target}, then moves into strong overlap with it while remaining "
            "a distinct identity."
        )
    if change == "strong_overlap_persists":
        return (
            f"{element_id} remains strongly overlapping with {target} across the trajectory; preserve both distinct "
            "identities and do not merge them."
        )
    return ""


def _trajectory_action(element_id: str, trajectory: dict[str, Any]) -> str:
    if trajectory.get("mid_bbox") is not None:
        base = (
            f"{element_id} follows a two-stage piecewise-linear START to MID to END trajectory while preserving identity. "
            "During the first half it moves from start_bbox to mid_bbox. During the second half it moves from mid_bbox "
            "to end_bbox. It must pass through mid_bbox around the temporal midpoint; do not shortcut directly from "
            "START to END."
        )
    else:
        base = f"{element_id} transitions smoothly from its start_bbox to its end_bbox while preserving identity."

    interpretation = trajectory.get("semantic_interpretation")
    ratio = float(trajectory.get("visual_scale_ratio") or 1.0)
    if interpretation == "approach_camera":
        return f"{base} It genuinely approaches the camera in depth and naturally becomes larger in frame (about {ratio:.2f}x apparent scale); do not substitute a digital camera zoom."
    if interpretation == "recede_camera":
        return f"{base} It genuinely moves away from the camera in depth and naturally becomes smaller in frame (about {ratio:.2f}x apparent scale); do not substitute a digital camera zoom."
    if interpretation == "physical_growth":
        return f"{base} The element itself grows physically, reaching about {ratio:.2f}x apparent scale."
    if interpretation == "physical_shrink":
        return f"{base} The element itself shrinks physically, reaching about {ratio:.2f}x apparent scale."
    if trajectory.get("scale_change") == "increase":
        return f"{base} Its apparent on-screen scale increases to about {ratio:.2f}x from START to END."
    if trajectory.get("scale_change") == "decrease":
        return f"{base} Its apparent on-screen scale decreases to about {ratio:.2f}x from START to END."
    return base


def _segment_summary(label: str, name: str, segment: dict[str, Any] | None) -> str | None:
    if not isinstance(segment, dict):
        return None
    motion = segment.get("screen_motion", "stable")
    scale = segment.get("scale_change", "stable")
    return f"{label} {name}: screen motion={motion}, scale change={scale}."


def _trajectory_summary_lines(label: str, trajectory: dict[str, Any], reinforcement: str) -> list[str]:
    interpretation = trajectory.get("semantic_interpretation")
    scale_change = trajectory.get("scale_change")
    ratio = float(trajectory.get("visual_scale_ratio") or 1.0)
    screen_motion = trajectory.get("screen_motion")
    anchors = trajectory.get("stable_anchors") or []
    lines: list[str] = []

    if trajectory.get("mid_bbox") is not None:
        lines.append(
            f"{label} follows a two-stage piecewise-linear START → MID → END trajectory and must pass through its "
            f"explicit midpoint BBOX {trajectory['mid_bbox']} around t={trajectory.get('mid_time', _MID_TIME):.2f}; "
            "do not shortcut directly from START to END."
        )
        first = _segment_summary(label, "first half START→MID", trajectory.get("segment_start_mid"))
        second = _segment_summary(label, "second half MID→END", trajectory.get("segment_mid_end"))
        if first:
            lines.append(first)
        if second:
            lines.append(second)

    if scale_change == "increase":
        lines.append(f"{label}'s apparent on-screen scale increases to about {ratio:.2f}x from START to END.")
    elif scale_change == "decrease":
        lines.append(f"{label}'s apparent on-screen scale decreases to about {ratio:.2f}x from START to END.")

    if interpretation == "approach_camera":
        lines.append(f"The description explicitly calls for depth approach: {label} moves genuinely toward the camera and naturally becomes larger in frame; this is subject motion through depth, not a digital camera zoom.")
    elif interpretation == "recede_camera":
        lines.append(f"The description explicitly calls for depth recession: {label} moves genuinely away from the camera and naturally becomes smaller in frame; this is subject motion through depth, not a digital camera zoom.")
    elif interpretation == "physical_growth":
        lines.append(f"Interpret the scale increase as physical growth of {label}, not camera zoom.")
    elif interpretation == "physical_shrink":
        lines.append(f"Interpret the scale decrease as physical shrinking of {label}, not camera zoom.")
    elif scale_change != "stable" and reinforcement != "compact":
        lines.append(f"Preserve this BBOX scale change for {label}; do not silently discard it or infer a camera zoom unless the prompt explicitly requests camera motion.")

    if screen_motion != "stable" and trajectory.get("dominant_change") != "scale":
        lines.append(f"{label}'s screen-space center also moves {screen_motion.replace('_', '-')} across the frame.")

    side = trajectory.get("exit_frame")
    if side:
        lines.append(f"{label} exits completely beyond the {side} edge by END and is no longer visible; the visible canvas boundary is not a stopping point.")
    side = trajectory.get("enter_frame")
    if side:
        lines.append(f"{label} starts offscreen beyond the {side} edge and enters the visible frame from that side.")

    if reinforcement != "compact":
        anchor_labels = {
            "center_x": "horizontal center", "center_y": "vertical center", "left_edge": "left edge",
            "top_edge": "top edge", "right_edge": "right edge", "bottom_edge": "bottom edge",
        }
        named = [anchor_labels[item] for item in anchors if item in anchor_labels]
        if named and scale_change != "stable":
            lines.append(f"Keep the following framing anchors approximately stable during the scale change: {', '.join(named)}.")

    if reinforcement == "strong":
        lines.append(
            f"Trajectory metrics for {label}: start_size={trajectory['start_size']}, end_size={trajectory['end_size']}, "
            f"center_delta={trajectory['center_delta']}, width_ratio={trajectory['width_ratio']}, "
            f"height_ratio={trajectory['height_ratio']}."
        )
    return lines


def install_schema_fixes(schema_module: Any) -> None:
    if getattr(schema_module, "_H3SC_CORRECTNESS_FIXES", False):
        return

    original_layout = schema_module.sanitize_layout
    original_config = schema_module.sanitize_config

    def sanitize_layout(raw: Any, *, width_override: Any = None, height_override: Any = None):
        source = _parse_source(raw)
        malformed = False
        if isinstance(raw, str):
            text = raw.strip()
            if not text or len(text) > schema_module.MAX_JSON_LENGTH:
                malformed = True
            else:
                try:
                    parsed = json.loads(text)
                    malformed = not isinstance(parsed, dict)
                except (TypeError, ValueError, json.JSONDecodeError):
                    malformed = True
        elif raw is not None and not isinstance(raw, dict):
            malformed = True

        layout, warnings = original_layout(raw, width_override=width_override, height_override=height_override)
        warnings = list(warnings)

        timeline = source.get("timeline_experimental") if isinstance(source.get("timeline_experimental"), dict) else None
        if timeline is not None:
            raw_boxes = source.get("boxes")
            if not isinstance(raw_boxes, list):
                raw_boxes = source.get("layout", {}).get("boxes") if isinstance(source.get("layout"), dict) else []
            loose_start = _extract_box_map(schema_module, raw_boxes)
            transition = source.get("transition") if isinstance(source.get("transition"), dict) else {}
            loose_end = _extract_box_map(schema_module, transition.get("end_boxes"))
            loose_mid = _extract_box_map(schema_module, timeline.get("mid_boxes"))

            if loose_start:
                layout["boxes"] = _merge_boxes(schema_module, layout.get("boxes"), loose_start)
            if loose_end:
                output_transition = layout.setdefault("transition", {})
                output_transition.setdefault("end_canvas", copy.deepcopy(layout.get("canvas", {})))
                output_transition["end_boxes"] = _merge_boxes(schema_module, output_transition.get("end_boxes"), loose_end)
            if loose_mid:
                layout["timeline_experimental"] = {
                    "version": 3,
                    "duration_seconds": float(timeline.get("duration_seconds") or 5.0),
                    "interpolation": "piecewise_linear",
                    "mid_time": _MID_TIME,
                    "mid_boxes": _serialized_boxes(schema_module, loose_mid),
                    "coordinate_space": "normalized_0_1000_with_offscreen_overscan",
                }
            if any(_is_offscreen_bbox(box) for box in [*loose_start.values(), *loose_mid.values(), *loose_end.values()]):
                warnings.append("Experimental timeline offscreen BBOX coordinates were preserved within the -1000..2000 overscan range.")

        if malformed:
            warnings.insert(0, "Layout JSON could not be restored; defaults were loaded.")
        if not layout.get("boxes"):
            warnings.append("No active BBOX elements are present; no spatial layout guidance will be emitted.")
        return layout, warnings

    def sanitize_config(raw: Any):
        config, warnings = original_config(raw)
        warnings = list(warnings)
        for slot, item in config.get("slots", {}).items():
            value = item.get("value")
            if value is None:
                continue
            clamped = max(0.0, min(100.0, float(value)))
            if clamped != float(value):
                warnings.append(f"Slot {slot.upper()} Value (%) was clamped to the supported 0-100 range.")
            item["value"] = clamped
        return config, warnings

    schema_module.sanitize_layout = sanitize_layout
    schema_module.sanitize_config = sanitize_config
    schema_module._H3SC_CORRECTNESS_FIXES = True


def install_compiler_fixes(compiler_module: Any) -> None:
    if getattr(compiler_module, "_H3SC_CORRECTNESS_FIXES", False):
        return

    original_build_elements = compiler_module._build_elements
    original_summary = compiler_module._resolved_summary

    def build_elements(layout, config, warnings):
        elements, layout_entries, sequence_items = original_build_elements(layout, config, warnings)
        element_map = {item["id"]: item for item in elements}
        entry_map = {entry["slot"]: entry for entry in layout_entries}
        trajectory_map: dict[str, dict[str, Any]] = {}
        timeline = layout.get("timeline_experimental") if isinstance(layout.get("timeline_experimental"), dict) else {}
        mid_by_slot = {
            item["slot"]: item["bbox_2d"]
            for item in timeline.get("mid_boxes", [])
            if isinstance(item, dict) and isinstance(item.get("bbox_2d"), list)
        }
        id_to_slot = {item.get("id"): item.get("slot") for item in sequence_items}

        for entry in layout_entries:
            if "start_bbox" not in entry or "end_bbox" not in entry:
                continue
            element = element_map.get(entry["slot"])
            if element is None:
                continue
            trajectory = _trajectory_semantics(entry["start_bbox"], entry["end_bbox"], element)
            if trajectory is None:
                continue
            trajectory.update(_offscreen_semantics(entry["start_bbox"], entry["end_bbox"]))

            raw_slot = id_to_slot.get(entry["slot"])
            mid_bbox = mid_by_slot.get(raw_slot)
            if mid_bbox is not None:
                start_mid = _trajectory_semantics(entry["start_bbox"], mid_bbox, element)
                mid_end = _trajectory_semantics(mid_bbox, entry["end_bbox"], element)
                if isinstance(start_mid, dict):
                    start_mid.update(_offscreen_semantics(entry["start_bbox"], mid_bbox))
                if isinstance(mid_end, dict):
                    mid_end.update(_offscreen_semantics(mid_bbox, entry["end_bbox"]))
                trajectory.update({
                    "interpolation": "piecewise_linear",
                    "mid_time": _MID_TIME,
                    "mid_bbox": list(mid_bbox),
                    "mid_visibility": _visibility(mid_bbox),
                    "keyframes": [
                        {"name": "start", "t": 0.0, "bbox": list(entry["start_bbox"])},
                        {"name": "mid", "t": _MID_TIME, "bbox": list(mid_bbox)},
                        {"name": "end", "t": 1.0, "bbox": list(entry["end_bbox"])},
                    ],
                    "segment_start_mid": start_mid,
                    "segment_mid_end": mid_end,
                })

            element["trajectory"] = trajectory
            trajectory_map[entry["slot"]] = trajectory

        ids = [element_id for element_id in entry_map if element_id in element_map]
        relation_by_subject: dict[str, list[dict[str, Any]]] = {}
        for index, a_id in enumerate(ids):
            for b_id in ids[index + 1:]:
                result = _relation_for_pair(a_id, entry_map[a_id], b_id, entry_map[b_id])
                if result is None:
                    continue
                subject_id, relation = result
                relation_by_subject.setdefault(subject_id, []).append(relation)
        for subject_id, relations in relation_by_subject.items():
            element_map[subject_id]["relations"] = copy.deepcopy(relations)

        for item in sequence_items:
            element = element_map.get(item.get("id"))
            if element is None:
                continue
            trajectory = trajectory_map.get(item.get("id"))
            if trajectory is not None:
                item["action"] = _trajectory_action(item["id"], trajectory)
            clauses: list[str] = []
            if isinstance(trajectory, dict):
                clause = _offscreen_clause(item["id"], trajectory)
                if clause:
                    clauses.append(clause)
            for relation in element.get("relations", []):
                clause = _relation_clause(item["id"], relation)
                if clause:
                    clauses.append(clause)
            if clauses:
                item["action"] = f"{item['action']} {' '.join(clauses)}"

        return elements, layout_entries, sequence_items

    def resolved_summary(config, elements, layout_entries, sequence_items):
        lines = original_summary(config, elements, layout_entries, sequence_items)
        reinforcement = config["reinforcement"]
        element_map = {item["id"]: item for item in elements}

        descriptions: list[str] = []
        compact_positions: list[str] = []
        trajectory_lines: list[str] = []
        relation_lines: list[str] = []
        include_vertical = reinforcement == "strong"

        for entry in layout_entries:
            element = element_map.get(entry["slot"])
            if element is None:
                continue
            label = compiler_module._label_for(element)
            description = str(element.get("desc") or "").strip()
            if description:
                descriptions.append(f"{label}: {description}")
            if reinforcement == "compact":
                if "bbox" in entry:
                    position = compiler_module._position_name(entry["bbox"], include_vertical)
                    compact_positions.append(f"{label} occupies the {position} region.")
                else:
                    start_position = compiler_module._position_name(entry["start_bbox"], include_vertical)
                    end_position = compiler_module._position_name(entry["end_bbox"], include_vertical)
                    compact_positions.append(f"{label} moves from the {start_position} region to the {end_position} region over the clip.")
            trajectory = element.get("trajectory")
            if isinstance(trajectory, dict):
                trajectory_lines.extend(_trajectory_summary_lines(label, trajectory, reinforcement))
            for relation in element.get("relations", []):
                target = relation.get("target", "the other element")
                change = relation.get("change")
                if change == "separates_from":
                    relation_lines.append(f"{label} begins strongly overlapping or geometrically contained within {target}, then separates from it by END. Keep both identities distinct; geometry alone does not imply holding.")
                elif change == "joins_or_overlaps":
                    relation_lines.append(f"{label} begins separate from {target}, then moves into strong overlap by END while remaining distinct.")
                elif change == "strong_overlap_persists":
                    relation_lines.append(f"{label} remains strongly overlapping with {target}; preserve both identities without merging them.")

        insertion = [*descriptions, *compact_positions, *trajectory_lines, *relation_lines]
        if insertion:
            prefix_count = 0 if reinforcement == "compact" else 1
            lines[prefix_count:prefix_count] = insertion
        return lines

    compiler_module._build_elements = build_elements
    compiler_module._resolved_summary = resolved_summary
    compiler_module._H3SC_CORRECTNESS_FIXES = True
