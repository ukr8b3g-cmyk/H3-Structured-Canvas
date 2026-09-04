"""Deterministic H3 structured-prompt compiler.

This compiler produces text conditioning only. Bounding boxes are semantic hints
interpreted by the H3 text encoder; they are not hard masks or latent-space
constraints.
"""

from __future__ import annotations

import copy
import json
from typing import Any

from .schema import (
    PACKAGE_VERSION,
    SLOTS,
    STRUCTURE_SCHEMA,
    dumps_compact,
    dumps_pretty,
    sanitize_config,
    sanitize_layout,
)

_TYPE_PREFIX = {
    "subject": "subject",
    "object": "object",
    "text": "text",
    "graphic": "graphic",
}

_MOTION_TEMPLATES = {
    "hold": ("hold", "The complete {label} remains fixed in its established region."),
    "fade_in": ("fade_in", "The complete {label} fades in and remains stable."),
    "fade_out": ("fade_out", "The complete {label} fades out smoothly."),
    "slide_in_left": ("slide_in", "The complete {label} slides in smoothly from the left and settles in its defined region."),
    "slide_in_right": ("slide_in", "The complete {label} slides in smoothly from the right and settles in its defined region."),
    "slide_in_top": ("slide_in", "The complete {label} slides in smoothly from the top and settles in its defined region."),
    "slide_in_bottom": ("slide_in", "The complete {label} slides in smoothly from the bottom and settles in its defined region."),
    "move_left_right": ("move", "The complete {label} moves smoothly from left to right across the frame while preserving identity and appearance."),
    "move_right_left": ("move", "The complete {label} moves smoothly from right to left across the frame while preserving identity and appearance."),
    "move_top_bottom": ("move", "The complete {label} moves smoothly from top to bottom across the frame while preserving identity and appearance."),
    "move_bottom_top": ("move", "The complete {label} moves smoothly from bottom to top across the frame while preserving identity and appearance."),
    "scale_up": ("scale_up", "The complete {label} grows smoothly from small scale to its defined size and remains stable."),
    "scale_down": ("scale_down", "The complete {label} shrinks smoothly to its defined size and remains stable."),
    "pop_in": ("pop_in", "The complete {label} pops into place and settles cleanly."),
    "grow_up": ("grow_up", "The complete {label} grows vertically upward from its baseline until it reaches its defined height."),
    "grow_down": ("grow_down", "The complete {label} grows vertically downward from its top edge until it reaches its defined height."),
    "grow_left": ("grow_left", "The complete {label} grows horizontally from right to left until it reaches its defined width."),
    "grow_right": ("grow_right", "The complete {label} grows horizontally from left to right until it reaches its defined width."),
    "radial_fill": ("radial_fill", "The complete {label} fills smoothly around its circle from zero to {value_text}."),
    "progress_fill": ("progress_fill", "The complete {label} fills smoothly from zero to {value_text}."),
    "reveal": ("reveal", "The complete {label} is revealed smoothly and remains stable."),
}

_DIRECTION_BY_MOTION = {
    "slide_in_left": "left",
    "slide_in_right": "right",
    "slide_in_top": "top",
    "slide_in_bottom": "bottom",
    "move_left_right": "left_to_right",
    "move_right_left": "right_to_left",
    "move_top_bottom": "top_to_bottom",
    "move_bottom_top": "bottom_to_top",
}


def _box_map_from_items(items: Any) -> dict[str, list[int]]:
    if not isinstance(items, list):
        return {}
    return {
        item["slot"]: list(item["bbox_2d"])
        for item in items
        if isinstance(item, dict) and item.get("slot") in SLOTS and isinstance(item.get("bbox_2d"), list)
    }


def _box_map(layout: dict[str, Any]) -> dict[str, list[int]]:
    return _box_map_from_items(layout.get("boxes", []))


def _transition_box_map(layout: dict[str, Any]) -> dict[str, list[int]]:
    transition = layout.get("transition")
    if not isinstance(transition, dict):
        return {}
    return _box_map_from_items(transition.get("end_boxes", []))


def _element_id(element_type: str, slot: str) -> str:
    return f"{_TYPE_PREFIX.get(element_type, 'element')}_{slot}"


def _human_value(value: float | None) -> str:
    if value is None:
        return "its defined value"
    if float(value).is_integer():
        return f"{int(value)} percent"
    return f"{value:g} percent"


def _label_for(element: dict[str, Any]) -> str:
    if element.get("type") == "text" and element.get("text"):
        return f'text block "{element["text"]}"'
    return element.get("id", "element")


def _animation_for(slot_config: dict[str, Any], element: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    motion = slot_config.get("motion", "none")
    if motion in {"none", "start_end"}:
        return None, None
    template = _MOTION_TEMPLATES.get(motion)
    if template is None:
        return None, None
    effect, behavior_template = template
    label = _label_for(element)
    value = slot_config.get("value")
    behavior = slot_config.get("custom_behavior") or behavior_template.format(label=label, value_text=_human_value(value))
    animation: dict[str, Any] = {"effect": effect}
    direction = _DIRECTION_BY_MOTION.get(motion)
    if direction:
        if motion.startswith("slide_in_"):
            animation["from"] = direction
        else:
            animation["direction"] = direction
    if value is not None and motion in {"radial_fill", "progress_fill"}:
        animation["value"] = int(value) if float(value).is_integer() else value
    animation["behavior"] = behavior
    return animation, behavior


def _position_name(bbox: list[int], include_vertical: bool = False) -> str:
    x1, y1, x2, y2 = bbox
    center_x = (x1 + x2) / 2
    center_y = (y1 + y2) / 2
    horizontal = "left" if center_x < 333 else "right" if center_x > 667 else "center"
    if not include_vertical:
        return horizontal
    vertical = "upper" if center_y < 333 else "lower" if center_y > 667 else "middle"
    return f"{vertical}-{horizontal}"


def _camera_sentence(camera: dict[str, Any]) -> str:
    motion = camera.get("motion", "Static Shot")
    if motion == "Static Shot":
        return "The camera holds a static shot."
    speed = camera.get("speed", "auto")
    amplitude = camera.get("amplitude", "auto")
    modifiers: list[str] = []
    if amplitude != "auto":
        modifiers.append(f"{amplitude} amplitude")
    if speed != "auto":
        modifiers.append(f"{speed} speed")
    suffix = f" with {' at '.join(modifiers)}" if modifiers else ""
    return f"The camera performs a {motion.lower()}{suffix}."


def _build_elements(layout: dict[str, Any], config: dict[str, Any], warnings: list[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    boxes = _box_map(layout)
    end_boxes = _transition_box_map(layout)
    elements: list[dict[str, Any]] = []
    layout_entries: list[dict[str, Any]] = []
    sequence_items: list[dict[str, Any]] = []

    for slot in SLOTS:
        bbox = boxes.get(slot)
        slot_config = config["slots"][slot]
        if bbox is None or not slot_config.get("enabled", True):
            continue
        element_type = slot_config.get("type", "object")
        description = slot_config.get("description", "")
        exact_text = slot_config.get("exact_text", "")
        if element_type == "text" and not exact_text:
            warnings.append(f"Slot {slot.upper()} is Text but Exact Text is empty; the slot was skipped.")
            continue
        if not description and element_type != "text":
            warnings.append(f"Slot {slot.upper()} has no description; the slot was skipped.")
            continue

        element_id = _element_id(element_type, slot)
        element: dict[str, Any] = {"id": element_id, "type": element_type}
        if description:
            element["desc"] = description
        if element_type == "text":
            element["text"] = exact_text
        value = slot_config.get("value")
        if element_type == "graphic" and value is not None:
            element["value"] = int(value) if float(value).is_integer() else value

        motion = slot_config.get("motion", "none")
        if motion == "start_end":
            end_bbox = end_boxes.get(slot)
            if end_bbox is None:
                warnings.append(f"Slot {slot.upper()} requests Start-End motion but no matching H3 Layout Transition box exists; the start bbox was used as a static anchor.")
                layout_entries.append({"slot": element_id, "bbox": bbox})
            else:
                layout_entries.append({"slot": element_id, "start_bbox": bbox, "end_bbox": end_bbox})
                sequence_items.append({
                    "order": slot_config.get("order", SLOTS.index(slot) + 1),
                    "slot": slot,
                    "id": element_id,
                    "action": f"{element_id} transitions smoothly from its start_bbox to its end_bbox while preserving identity.",
                })
        else:
            layout_entries.append({"slot": element_id, "bbox": bbox})
            animation, behavior = _animation_for(slot_config, element)
            if animation:
                element["animation"] = animation
            if behavior:
                sequence_items.append({
                    "order": slot_config.get("order", SLOTS.index(slot) + 1),
                    "slot": slot,
                    "id": element_id,
                    "action": behavior,
                })
        elements.append(element)

    sequence_items.sort(key=lambda item: (item["order"], SLOTS.index(item["slot"])))
    return elements, layout_entries, sequence_items


def _model_elements(elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map semantic UI categories to the model-facing schema used by H3 tests."""
    result: list[dict[str, Any]] = []
    for source in elements:
        item = copy.deepcopy(source)
        if item.get("type") in {"subject", "object"}:
            item["type"] = "obj"
        result.append(item)
    return result


def _convert_qwen_unified(base: dict[str, Any], layout_entries: list[dict[str, Any]], elements: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {item["id"]: item for item in _model_elements(elements)}
    for entry in layout_entries:
        element = by_id.get(entry["slot"])
        if element is None:
            continue
        if "bbox" in entry:
            element["bbox_2d"] = entry["bbox"]
        else:
            element["start_bbox_2d"] = entry["start_bbox"]
            element["end_bbox_2d"] = entry["end_bbox"]
    result: dict[str, Any] = {
        "canvas": {
            "aspect_ratio": base["aspect_ratio"],
            "coordinate_space": "normalized_0_1000",
            "bbox_format": "xyxy",
        },
        "scene": {"description": base["high_level_description"]},
        "elements": [by_id[item["id"]] for item in elements],
    }
    if base.get("motion"):
        result["motion"] = base["motion"]
    if base.get("constraints"):
        result["constraints"] = base["constraints"]
    return result


def _resolved_summary(config: dict[str, Any], elements: list[dict[str, Any]], layout_entries: list[dict[str, Any]], sequence_items: list[dict[str, Any]]) -> list[str]:
    reinforcement = config["reinforcement"]
    lines: list[str] = [] if reinforcement == "compact" else ["Treat every element ID as a stable identity and preserve its assigned spatial region."]
    element_map = {item["id"]: item for item in elements}
    include_vertical = reinforcement == "strong"
    for entry in layout_entries:
        element = element_map.get(entry["slot"])
        if element is None:
            continue
        label = _label_for(element)
        if "bbox" in entry:
            position = _position_name(entry["bbox"], include_vertical)
            if reinforcement != "compact":
                lines.append(f"{label} occupies the {position} region.")
            if reinforcement == "strong":
                lines.append(f"The normalized xyxy bounding box for {label} is {entry['bbox']}.")
        else:
            start_position = _position_name(entry["start_bbox"], include_vertical)
            end_position = _position_name(entry["end_bbox"], include_vertical)
            lines.append(f"{label} moves from the {start_position} region to the {end_position} region over the clip.")
            if reinforcement == "strong":
                lines.append(f"Its normalized start box is {entry['start_bbox']} and its normalized end box is {entry['end_bbox']}.")

    static_entries = [item for item in layout_entries if "bbox" in item]
    if reinforcement in {"balanced", "strong"} and len(static_entries) >= 2:
        areas = {item["slot"]: (item["bbox"][2] - item["bbox"][0]) * (item["bbox"][3] - item["bbox"][1]) for item in static_entries}
        smallest = min(areas, key=areas.get); largest = max(areas, key=areas.get)
        if areas[smallest] > 0 and areas[largest] / areas[smallest] >= 1.6:
            lines.append(f"{largest} appears substantially larger than {smallest}.")

    if sequence_items:
        lines.append("Motion order:")
        for index, item in enumerate(sequence_items, start=1):
            lines.append(f"{index}. {item['action']}")

    exact_texts = [item.get("text") for item in elements if item.get("type") == "text" and item.get("text")]
    if exact_texts and config.get("exact_text_safety", True):
        quoted = ", ".join(json.dumps(text, ensure_ascii=False) for text in exact_texts)
        lines.append(f"Preserve the exact visible text: {quoted}.")
        if not config.get("allow_additional_text", False):
            lines.append("Do not display element IDs, JSON keys, metadata, instructions, animation names, or any additional words on screen.")
    if config.get("full_frame", True):
        lines.append("Use the full canvas area. Do not add letterboxing, blank margins, an inset frame, or decorative borders.")
    lines.append(_camera_sentence(config["camera"]))
    if config.get("custom_instruction"):
        lines.append(config["custom_instruction"])
    return lines


def compile_h3_prompt(layout_raw: Any, config_raw: Any) -> tuple[str, dict[str, Any], str]:
    layout, layout_warnings = sanitize_layout(layout_raw)
    config, config_warnings = sanitize_config(config_raw)
    warnings = [*layout_warnings, *config_warnings]
    elements, layout_entries, sequence_items = _build_elements(layout, config, warnings)
    if not elements:
        warnings.append("No active element had both a Canvas box and usable prompt content.")

    scene = config.get("scene_description") or "A coherent scene containing the specified elements."
    motion: dict[str, Any] = {"camera": config["camera"]["motion"]}
    if sequence_items:
        motion["sequence"] = [item["action"] for item in sequence_items]
    if any("start_bbox" in entry for entry in layout_entries):
        motion["instruction"] = "Follow each element's start_bbox and end_bbox as soft spatial trajectory anchors. Transition smoothly while preserving identity and the overall composition."
    elif sequence_items:
        motion["instruction"] = "Animate complete elements according to their semantic animation settings and order. Keep completed elements stable in their defined layout regions."

    exact_texts = [item["text"] for item in elements if item.get("type") == "text" and item.get("text")]
    constraints: dict[str, Any] = {}
    if config.get("full_frame", True):
        constraints.update({"full_frame": True, "no_letterboxing": True, "no_blank_margins": True})
    if exact_texts and config.get("exact_text_safety", True):
        constraints["exact_visible_text"] = exact_texts
        constraints["allow_additional_text"] = bool(config.get("allow_additional_text", False))

    base_structure: dict[str, Any] = {
        "aspect_ratio": layout["canvas"]["aspect_ratio"],
        "high_level_description": scene,
        "layout": {"coordinate_space": "normalized_0_1000", "bbox_format": "xyxy", "boxes": layout_entries},
        "elements": _model_elements(elements),
        "motion": motion,
    }
    if constraints:
        base_structure["constraints"] = constraints
    model_structure = _convert_qwen_unified(base_structure, layout_entries, elements) if config["schema_profile"] == "qwen_unified_bbox2d" else base_structure

    summary_lines = _resolved_summary(config, elements, layout_entries, sequence_items)
    summary = "\n".join(summary_lines).strip()
    json_text = dumps_compact(model_structure)
    compiler_mode = config["compiler_mode"]
    if compiler_mode == "json_only":
        body = json_text
    elif compiler_mode == "natural_language":
        body = f"Scene: {scene}\n\nResolved layout and motion:\n{summary}"
    else:
        body = f"{json_text}\n\nResolved layout and motion:\n{summary}"

    if config["output_format"] == "h3_envelope":
        prompt = (
            f"integrated_multimodal_description: {body}\n\n"
            f"overall_soundscape: {config.get('soundscape') or 'N/A'}\n\n"
            f"non_diegetic_music: {config.get('music') or 'N/A'}"
        )
    else:
        audio_lines: list[str] = []
        if config.get("soundscape"):
            audio_lines.append(f"Soundscape: {config['soundscape']}")
        if config.get("music"):
            audio_lines.append(f"Non-diegetic music: {config['music']}")
        prompt = body if not audio_lines else f"{body}\n\n" + "\n".join(audio_lines)

    structure = {
        "schema": STRUCTURE_SCHEMA,
        "package_version": PACKAGE_VERSION,
        "layout": layout,
        "config": config,
        "model_structure": model_structure,
        "resolved_summary": summary_lines,
        "warnings": warnings,
        "prompt": prompt,
    }
    return prompt, structure, dumps_pretty(structure)
