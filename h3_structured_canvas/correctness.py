"""Correctness hotfixes shared by the package entry point.

These wrappers preserve the public schemas while tightening validation and
natural-language compilation without changing saved workflow identifiers.
"""

from __future__ import annotations

import json
import math
from typing import Any


_SCALE_INCREASE = 1.15
_SCALE_DECREASE = 1 / _SCALE_INCREASE
_EDGE_ANCHOR_TOLERANCE = 45.0
_CENTER_ANCHOR_TOLERANCE = 55.0
_TRANSLATION_TOLERANCE = 70.0


def _bbox_geometry(bbox: Any) -> dict[str, Any] | None:
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return None
    try:
        x1, y1, x2, y2 = (float(value) for value in bbox)
    except (TypeError, ValueError):
        return None
    width = max(1.0, x2 - x1)
    height = max(1.0, y2 - y1)
    return {
        "center": [(x1 + x2) / 2.0, (y1 + y2) / 2.0],
        "size": [width, height],
        "area": width * height,
        "edges": [x1, y1, x2, y2],
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
        "coordinate_space": "normalized_0_1000",
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


def _trajectory_action(element_id: str, trajectory: dict[str, Any]) -> str:
    base = f"{element_id} transitions smoothly from its start_bbox to its end_bbox while preserving identity."
    interpretation = trajectory.get("semantic_interpretation")
    ratio = float(trajectory.get("visual_scale_ratio") or 1.0)
    if interpretation == "approach_camera":
        return (
            f"{base} It genuinely approaches the camera in depth and naturally becomes larger in frame "
            f"(about {ratio:.2f}x apparent scale); do not substitute a digital camera zoom."
        )
    if interpretation == "recede_camera":
        return (
            f"{base} It genuinely moves away from the camera in depth and naturally becomes smaller in frame "
            f"(about {ratio:.2f}x apparent scale); do not substitute a digital camera zoom."
        )
    if interpretation == "physical_growth":
        return f"{base} The element itself grows physically, reaching about {ratio:.2f}x apparent scale."
    if interpretation == "physical_shrink":
        return f"{base} The element itself shrinks physically, reaching about {ratio:.2f}x apparent scale."
    if trajectory.get("scale_change") == "increase":
        return f"{base} Its apparent on-screen scale increases to about {ratio:.2f}x from START to END."
    if trajectory.get("scale_change") == "decrease":
        return f"{base} Its apparent on-screen scale decreases to about {ratio:.2f}x from START to END."
    return base


def _trajectory_summary_lines(label: str, trajectory: dict[str, Any], reinforcement: str) -> list[str]:
    interpretation = trajectory.get("semantic_interpretation")
    scale_change = trajectory.get("scale_change")
    ratio = float(trajectory.get("visual_scale_ratio") or 1.0)
    screen_motion = trajectory.get("screen_motion")
    anchors = trajectory.get("stable_anchors") or []
    lines: list[str] = []

    if scale_change == "increase":
        lines.append(f"{label}'s apparent on-screen scale increases to about {ratio:.2f}x from START to END.")
    elif scale_change == "decrease":
        lines.append(f"{label}'s apparent on-screen scale decreases to about {ratio:.2f}x from START to END.")

    if interpretation == "approach_camera":
        lines.append(
            f"The description explicitly calls for depth approach: {label} moves genuinely toward the camera and "
            "naturally becomes larger in frame; this is subject motion through depth, not a digital camera zoom."
        )
    elif interpretation == "recede_camera":
        lines.append(
            f"The description explicitly calls for depth recession: {label} moves genuinely away from the camera "
            "and naturally becomes smaller in frame; this is subject motion through depth, not a digital camera zoom."
        )
    elif interpretation == "physical_growth":
        lines.append(f"Interpret the scale increase as physical growth of {label}, not camera zoom.")
    elif interpretation == "physical_shrink":
        lines.append(f"Interpret the scale decrease as physical shrinking of {label}, not camera zoom.")
    elif scale_change != "stable" and reinforcement != "compact":
        lines.append(
            f"Preserve this BBOX scale change for {label}; do not silently discard it or infer a camera zoom unless "
            "the prompt explicitly requests camera motion."
        )

    if screen_motion != "stable" and trajectory.get("dominant_change") != "scale":
        lines.append(f"{label}'s screen-space center also moves {screen_motion.replace('_', '-')} across the frame.")

    if reinforcement != "compact":
        anchor_labels = {
            "center_x": "horizontal center",
            "center_y": "vertical center",
            "left_edge": "left edge",
            "top_edge": "top edge",
            "right_edge": "right edge",
            "bottom_edge": "bottom edge",
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

        layout, warnings = original_layout(
            raw,
            width_override=width_override,
            height_override=height_override,
        )
        warnings = list(warnings)
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
                warnings.append(
                    f"Slot {slot.upper()} Value (%) was clamped to the supported 0-100 range."
                )
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
        trajectory_map: dict[str, dict[str, Any]] = {}

        for entry in layout_entries:
            if "start_bbox" not in entry or "end_bbox" not in entry:
                continue
            element = element_map.get(entry["slot"])
            if element is None:
                continue
            trajectory = _trajectory_semantics(entry["start_bbox"], entry["end_bbox"], element)
            if trajectory is None:
                continue
            element["trajectory"] = trajectory
            trajectory_map[entry["slot"]] = trajectory

        for item in sequence_items:
            trajectory = trajectory_map.get(item.get("id"))
            if trajectory is not None:
                item["action"] = _trajectory_action(item["id"], trajectory)

        return elements, layout_entries, sequence_items

    def resolved_summary(config, elements, layout_entries, sequence_items):
        lines = original_summary(config, elements, layout_entries, sequence_items)
        reinforcement = config["reinforcement"]
        element_map = {item["id"]: item for item in elements}

        descriptions: list[str] = []
        compact_positions: list[str] = []
        trajectory_lines: list[str] = []
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
                    compact_positions.append(
                        f"{label} moves from the {start_position} region to the {end_position} region over the clip."
                    )
            trajectory = element.get("trajectory")
            if isinstance(trajectory, dict):
                trajectory_lines.extend(_trajectory_summary_lines(label, trajectory, reinforcement))

        # Element identity/appearance must survive every natural-language
        # reinforcement level. Compact may omit redundancy, not semantics.
        insertion = [*descriptions, *compact_positions, *trajectory_lines]
        if insertion:
            prefix_count = 0 if reinforcement == "compact" else 1
            lines[prefix_count:prefix_count] = insertion
        return lines

    compiler_module._build_elements = build_elements
    compiler_module._resolved_summary = resolved_summary
    compiler_module._H3SC_CORRECTNESS_FIXES = True
