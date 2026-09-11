"""Experimental V2 helpers for the 3-slot timeline branch.

This module is intentionally installed only by the experimental branch. It adds:
- bounded off-canvas trajectory coordinates for timeline START/END states,
- explicit enter/exit-frame semantics,
- overlap/containment relation changes between independently identified elements.

The public production schema remains unchanged.
"""

from __future__ import annotations

import copy
import json
import math
from typing import Any

OFFSCREEN_MIN = -1000.0
OFFSCREEN_MAX = 2000.0
_STRONG_OVERLAP = 0.60
_SEPARATE_OVERLAP = 0.08


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
    coords = [max(OFFSCREEN_MIN, min(OFFSCREEN_MAX, item)) for item in coords]
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


def _is_offscreen_bbox(bbox: list[int]) -> bool:
    return any(value < 0 or value > 1000 for value in bbox)


def _bbox_geometry(bbox: Any) -> dict[str, float] | None:
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return None
    try:
        x1, y1, x2, y2 = (float(value) for value in bbox)
    except (TypeError, ValueError):
        return None
    left, right = sorted((x1, x2))
    top, bottom = sorted((y1, y2))
    width = right - left
    height = bottom - top
    if width <= 0 or height <= 0:
        return None
    return {
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "width": width,
        "height": height,
        "area": width * height,
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
    start_visibility = _visibility(start_bbox)
    end_visibility = _visibility(end_bbox)
    result: dict[str, Any] = {
        "start_visibility": start_visibility,
        "end_visibility": end_visibility,
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


def install_experimental_v2(schema_module: Any, compiler_module: Any) -> None:
    """Install branch-local offscreen and overlap semantics once."""

    if not getattr(schema_module, "_H3SC_EXPERIMENTAL_V2", False):
        original_layout = schema_module.sanitize_layout

        def sanitize_layout(raw: Any, *, width_override: Any = None, height_override: Any = None):
            source = _parse_source(raw)
            layout, warnings = original_layout(
                raw,
                width_override=width_override,
                height_override=height_override,
            )
            if not isinstance(source.get("timeline_experimental"), dict):
                return layout, warnings

            raw_boxes = source.get("boxes")
            if not isinstance(raw_boxes, list):
                raw_boxes = source.get("layout", {}).get("boxes") if isinstance(source.get("layout"), dict) else []
            loose_start = _extract_box_map(schema_module, raw_boxes)
            transition = source.get("transition") if isinstance(source.get("transition"), dict) else {}
            loose_end = _extract_box_map(schema_module, transition.get("end_boxes"))

            if loose_start:
                layout["boxes"] = _merge_boxes(schema_module, layout.get("boxes"), loose_start)
            if loose_end:
                output_transition = layout.setdefault("transition", {})
                output_transition.setdefault("end_canvas", copy.deepcopy(layout.get("canvas", {})))
                output_transition["end_boxes"] = _merge_boxes(
                    schema_module,
                    output_transition.get("end_boxes"),
                    loose_end,
                )

            if any(_is_offscreen_bbox(box) for box in [*loose_start.values(), *loose_end.values()]):
                warnings = list(warnings)
                warnings.append(
                    "Experimental timeline offscreen BBOX coordinates were preserved within the -1000..2000 overscan range."
                )
            return layout, warnings

        schema_module.sanitize_layout = sanitize_layout
        schema_module._H3SC_EXPERIMENTAL_V2 = True

    if getattr(compiler_module, "_H3SC_EXPERIMENTAL_V2", False):
        return

    original_build_elements = compiler_module._build_elements
    original_summary = compiler_module._resolved_summary

    def build_elements(layout, config, warnings):
        elements, layout_entries, sequence_items = original_build_elements(layout, config, warnings)
        element_map = {item["id"]: item for item in elements}
        entry_map = {entry["slot"]: entry for entry in layout_entries}

        for element_id, element in element_map.items():
            entry = entry_map.get(element_id)
            if not entry or "start_bbox" not in entry or "end_bbox" not in entry:
                continue
            trajectory = element.get("trajectory")
            if not isinstance(trajectory, dict):
                trajectory = {}
                element["trajectory"] = trajectory
            trajectory.update(_offscreen_semantics(entry["start_bbox"], entry["end_bbox"]))

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
            if not element:
                continue
            clauses: list[str] = []
            trajectory = element.get("trajectory")
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
        additions: list[str] = []
        for element in elements:
            label = compiler_module._label_for(element)
            trajectory = element.get("trajectory")
            if isinstance(trajectory, dict):
                side = trajectory.get("exit_frame")
                if side:
                    additions.append(
                        f"{label} exits completely beyond the {side} edge by END and is no longer visible; "
                        "the visible canvas boundary is not a stopping point."
                    )
                side = trajectory.get("enter_frame")
                if side:
                    additions.append(
                        f"{label} starts offscreen beyond the {side} edge and enters the visible frame from that side."
                    )
            for relation in element.get("relations", []):
                target = relation.get("target", "the other element")
                change = relation.get("change")
                if change == "separates_from":
                    additions.append(
                        f"{label} begins strongly overlapping or geometrically contained within {target}, then "
                        "separates from it by END. Keep both identities distinct; geometry alone does not imply holding."
                    )
                elif change == "joins_or_overlaps":
                    additions.append(
                        f"{label} begins separate from {target}, then moves into strong overlap by END while remaining distinct."
                    )
                elif change == "strong_overlap_persists":
                    additions.append(
                        f"{label} remains strongly overlapping with {target}; preserve both identities without merging them."
                    )
        if additions:
            lines.extend(additions)
        return lines

    compiler_module._build_elements = build_elements
    compiler_module._resolved_summary = resolved_summary
    compiler_module._H3SC_EXPERIMENTAL_V2 = True
