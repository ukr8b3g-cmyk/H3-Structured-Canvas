"""Experimental multi-key timeline overlay.

Installed only on the experimental multi-key branch after the consolidated
correctness layer. It extends v3 START/MID/END semantics to v4 arbitrary
intermediate keyframes while preserving old workflow behavior.
"""
from __future__ import annotations

import copy
from typing import Any

from . import correctness as _base

MAX_INTERMEDIATE_KEYS = 7
DURATION_MIN = 5.0
DURATION_MAX = 15.0
EPS = 0.0005


def _duration(value: Any) -> float:
    try:
        value = float(value)
    except (TypeError, ValueError, OverflowError):
        value = 5.0
    return max(DURATION_MIN, min(DURATION_MAX, value))


def _parse_keyframes(schema_module: Any, timeline: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    raw = timeline.get("keyframes")
    if not isinstance(raw, dict):
        return result
    for slot in schema_module.SLOTS:
        items = raw.get(slot)
        if not isinstance(items, list):
            continue
        parsed: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            try:
                time = float(item.get("time", item.get("t")))
            except (TypeError, ValueError, OverflowError):
                continue
            bbox = _base._loose_bbox(item)
            if bbox is None or not 0.0 < time < 1.0:
                continue
            parsed.append({"time": time, "bbox_2d": bbox})
        parsed.sort(key=lambda item: item["time"])
        unique: list[dict[str, Any]] = []
        for item in parsed:
            if unique and abs(unique[-1]["time"] - item["time"]) <= EPS:
                unique[-1] = item
            else:
                unique.append(item)
        if unique:
            result[slot] = unique[:MAX_INTERMEDIATE_KEYS]
    return result


def _keyframes_from_layout(layout: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    timeline = layout.get("timeline_experimental")
    if not isinstance(timeline, dict) or int(timeline.get("version") or 0) < 4:
        return {}
    result: dict[str, list[dict[str, Any]]] = {}
    raw = timeline.get("keyframes")
    if not isinstance(raw, dict):
        return result
    for slot, items in raw.items():
        if not isinstance(items, list):
            continue
        valid = []
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("bbox_2d"), list):
                continue
            try:
                time = float(item.get("time"))
            except (TypeError, ValueError, OverflowError):
                continue
            if 0.0 < time < 1.0:
                valid.append({"time": time, "bbox_2d": list(item["bbox_2d"])})
        valid.sort(key=lambda item: item["time"])
        if valid:
            result[str(slot)] = valid[:MAX_INTERMEDIATE_KEYS]
    return result


def _action(element_id: str, trajectory: dict[str, Any]) -> str:
    frames = trajectory.get("keyframes")
    if not isinstance(frames, list) or len(frames) <= 3:
        return _base._trajectory_action(element_id, trajectory)
    intermediate = frames[1:-1]
    markers = ", ".join(f"t={float(item['t']):.3f} bbox={item['bbox']}" for item in intermediate)
    base = (
        f"{element_id} follows a piecewise-linear multi-key trajectory while preserving identity. "
        f"It must pass through all {len(intermediate)} intermediate spatial markers in chronological order "
        f"({markers}); do not shortcut directly from START to END or skip an intermediate key."
    )
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
    return base


def install_multikey_fixes(schema_module: Any, compiler_module: Any) -> None:
    if getattr(schema_module, "_H3SC_MULTIKEY_V1", False):
        return

    previous_layout = schema_module.sanitize_layout

    def sanitize_layout(raw: Any, *, width_override: Any = None, height_override: Any = None):
        layout, warnings = previous_layout(raw, width_override=width_override, height_override=height_override)
        source = _base._parse_source(raw)
        timeline = source.get("timeline_experimental") if isinstance(source.get("timeline_experimental"), dict) else None
        if not timeline or int(timeline.get("version") or 0) < 4:
            return layout, warnings
        keyframes = _parse_keyframes(schema_module, timeline)
        mids = []
        for slot, items in keyframes.items():
            mid = next((item for item in items if abs(item["time"] - 0.5) <= EPS), None)
            if mid:
                mids.append({"slot": slot, "ui_color": schema_module.UI_COLORS.get(slot, "red"), "bbox_2d": list(mid["bbox_2d"])})
        layout["timeline_experimental"] = {
            "version": 4,
            "duration_seconds": _duration(timeline.get("duration_seconds")),
            "interpolation": "piecewise_linear",
            "canonical_time": "normalized_0_1",
            "max_intermediate_keys": MAX_INTERMEDIATE_KEYS,
            "keyframes": {
                slot: [{"time": round(item["time"], 6), "bbox_2d": list(item["bbox_2d"])} for item in items]
                for slot, items in keyframes.items()
            },
            "mid_time": 0.5,
            "mid_boxes": mids,
            "coordinate_space": "normalized_0_1000_with_offscreen_overscan",
        }
        if any(_base._is_offscreen_bbox(item["bbox_2d"]) for items in keyframes.values() for item in items):
            message = "Experimental timeline offscreen BBOX coordinates were preserved within the -1000..2000 overscan range."
            if message not in warnings:
                warnings.append(message)
        return layout, warnings

    schema_module.sanitize_layout = sanitize_layout
    # compiler.py imports sanitize_layout directly, so refresh that bound reference too.
    compiler_module.sanitize_layout = sanitize_layout

    previous_build = compiler_module._build_elements
    previous_summary = compiler_module._resolved_summary

    def build_elements(layout, config, warnings):
        elements, layout_entries, sequence_items = previous_build(layout, config, warnings)
        keys_by_slot = _keyframes_from_layout(layout)
        if not keys_by_slot:
            return elements, layout_entries, sequence_items
        element_map = {item["id"]: item for item in elements}
        id_to_slot = {item.get("id"): item.get("slot") for item in sequence_items}
        entry_map = {entry["slot"]: entry for entry in layout_entries}
        for element_id, entry in entry_map.items():
            raw_slot = id_to_slot.get(element_id)
            keys = keys_by_slot.get(str(raw_slot), [])
            if not keys and isinstance(element_id, str):
                candidate = element_id.rsplit("_", 1)[-1]
                keys = keys_by_slot.get(candidate, [])
            element = element_map.get(element_id)
            if not keys or element is None or "start_bbox" not in entry or "end_bbox" not in entry:
                continue
            trajectory = _base._trajectory_semantics(entry["start_bbox"], entry["end_bbox"], element) or {}
            trajectory.update(_base._offscreen_semantics(entry["start_bbox"], entry["end_bbox"]))
            frames = [{"name": "start", "t": 0.0, "bbox": list(entry["start_bbox"])}]
            frames.extend({"name": f"key_{index}", "t": item["time"], "bbox": list(item["bbox_2d"])} for index, item in enumerate(keys, start=1))
            frames.append({"name": "end", "t": 1.0, "bbox": list(entry["end_bbox"])})
            frames.sort(key=lambda item: item["t"])
            segments = []
            for left, right in zip(frames, frames[1:]):
                semantics = _base._trajectory_semantics(left["bbox"], right["bbox"], element)
                if isinstance(semantics, dict):
                    semantics.update(_base._offscreen_semantics(left["bbox"], right["bbox"]))
                segments.append({"from": left["name"], "to": right["name"], "from_t": left["t"], "to_t": right["t"], "semantics": semantics})
            trajectory.update({"interpolation": "piecewise_linear", "keyframes": frames, "segments": segments})
            if len(keys) == 1 and abs(keys[0]["time"] - 0.5) <= EPS:
                trajectory.update({"mid_time": 0.5, "mid_bbox": list(keys[0]["bbox_2d"]), "mid_visibility": _base._visibility(keys[0]["bbox_2d"]), "segment_start_mid": segments[0]["semantics"], "segment_mid_end": segments[1]["semantics"]})
            element["trajectory"] = trajectory
            for item in sequence_items:
                if item.get("id") == element_id:
                    item["action"] = _action(element_id, trajectory)
        return elements, layout_entries, sequence_items

    def resolved_summary(config, elements, layout_entries, sequence_items):
        lines = previous_summary(config, elements, layout_entries, sequence_items)
        additions = []
        for element in elements:
            trajectory = element.get("trajectory")
            frames = trajectory.get("keyframes") if isinstance(trajectory, dict) else None
            if not isinstance(frames, list) or len(frames) <= 3:
                continue
            label = compiler_module._label_for(element)
            markers = "; ".join(f"t={float(item['t']):.3f} BBOX {item['bbox']}" for item in frames[1:-1])
            additions.append(f"{label} must pass through every intermediate spatial marker in chronological order ({markers}); do not skip a key or shortcut directly from START to END.")
            for index, segment in enumerate(trajectory.get("segments", []), start=1):
                semantics = segment.get("semantics") if isinstance(segment, dict) else None
                if isinstance(semantics, dict):
                    additions.append(f"{label} segment {index} t={segment['from_t']:.3f}→{segment['to_t']:.3f}: screen motion={semantics.get('screen_motion','stable')}, scale change={semantics.get('scale_change','stable')}.")
        if additions:
            lines[1:1] = additions
        return lines

    compiler_module._build_elements = build_elements
    compiler_module._resolved_summary = resolved_summary
    schema_module._H3SC_MULTIKEY_V1 = True
    compiler_module._H3SC_MULTIKEY_V1 = True
