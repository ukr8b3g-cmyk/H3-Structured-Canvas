"""Runtime reference media binding for H3 Structured Canvas.

R5 keeps media payloads separate from layout JSON and prompt text. A binding
bundle is a runtime-only object that pairs Reference Assignment metadata with
an IMAGE or VIDEO payload for a later H3 adapter.
"""
from __future__ import annotations

from typing import Any

REFERENCE_BINDINGS_SCHEMA = "h3_reference_bindings/1"


def empty_reference_bindings() -> dict[str, Any]:
    return {"schema": REFERENCE_BINDINGS_SCHEMA, "entries": []}


def _assignment_map(layout: dict[str, Any]) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for item in layout.get("reference_assignments", []):
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            result[item["id"].casefold()] = item
    return result


def _normalize_previous_bindings(value: Any, assignments: dict[str, dict[str, str]]) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, dict) or value.get("schema") != REFERENCE_BINDINGS_SCHEMA:
        raise ValueError("Previous references are not a valid H3_REFERENCE_BINDINGS bundle.")
    raw_entries = value.get("entries")
    if not isinstance(raw_entries, list):
        raise ValueError("Previous references contain an invalid entries list.")

    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, item in enumerate(raw_entries, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Reference binding {index} is not an object.")
        reference_id = str(item.get("id") or "").strip()
        folded = reference_id.casefold()
        if not reference_id or folded in seen:
            raise ValueError(f"Reference binding {index} has a missing or duplicate id.")
        assignment = assignments.get(folded)
        if assignment is None:
            raise ValueError(f"Reference binding {reference_id!r} is not declared by the current layout.")
        for key in ("kind", "target", "role"):
            if item.get(key) != assignment.get(key):
                raise ValueError(f"Reference binding {reference_id!r} no longer matches its assignment metadata.")
        if item.get("media") is None:
            raise ValueError(f"Reference binding {reference_id!r} has no media payload.")
        seen.add(folded)
        result.append({
            "id": assignment["id"],
            "kind": assignment["kind"],
            "target": assignment["target"],
            "role": assignment["role"],
            "media": item["media"],
        })
    return result


def bind_reference(
    layout_raw: Any,
    reference_id: Any,
    *,
    sanitize_layout,
    previous_references: Any = None,
    image: Any = None,
    video: Any = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Bind one IMAGE or VIDEO payload to a declared Reference Assignment."""
    layout, _warnings = sanitize_layout(layout_raw)
    assignments = _assignment_map(layout)
    requested = str(reference_id or "").strip()
    assignment = assignments.get(requested.casefold())
    if assignment is None:
        raise ValueError(f"Reference id {requested!r} is not declared in Reference Assignment.")

    has_image = image is not None
    has_video = video is not None
    if has_image == has_video:
        raise ValueError("Connect exactly one media input: IMAGE or VIDEO.")
    if assignment["kind"] == "image" and not has_image:
        raise ValueError(f"Reference {assignment['id']!r} expects an IMAGE input.")
    if assignment["kind"] == "video" and not has_video:
        raise ValueError(f"Reference {assignment['id']!r} expects a VIDEO input.")

    entries = _normalize_previous_bindings(previous_references, assignments)
    folded_ids = {item["id"].casefold() for item in entries}
    if assignment["id"].casefold() in folded_ids:
        raise ValueError(f"Reference {assignment['id']!r} is already bound in previous_references.")

    entries.append({
        "id": assignment["id"],
        "kind": assignment["kind"],
        "target": assignment["target"],
        "role": assignment["role"],
        "media": image if has_image else video,
    })
    return layout, {"schema": REFERENCE_BINDINGS_SCHEMA, "entries": entries}
