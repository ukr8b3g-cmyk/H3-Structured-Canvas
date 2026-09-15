"""Reference Assignment V1 metadata contract for H3 Structured Canvas.

V1 intentionally carries assignment metadata only. It does not introduce media
sockets, load reference assets, or alter the deterministic H3 prompt/model
structure. References are associated with visible slots A/B/C or the scene and
are exposed in the structured debug output for future adapters.
"""
from __future__ import annotations

import copy
import re
from typing import Any

MAX_REFERENCE_ASSIGNMENTS = 8
REFERENCE_KINDS = ("image", "video")
REFERENCE_TARGETS = ("a", "b", "c", "scene")
REFERENCE_ROLES = ("identity", "appearance", "composition", "motion")
_REFERENCE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")


def sanitize_reference_assignments(value: Any) -> tuple[list[dict[str, str]], list[str]]:
    """Normalize V1 assignment metadata without inventing missing values."""
    warnings: list[str] = []
    if value is None:
        return [], warnings
    if not isinstance(value, list):
        return [], ["Reference assignments were not a list; the value was ignored."]

    result: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    limit_reported = False
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            warnings.append(f"Reference assignment {index} was not an object and was ignored.")
            continue

        reference_id = str(item.get("id") or "").strip()
        kind = str(item.get("kind") or "").strip().lower()
        target = str(item.get("target") or "").strip().lower()
        role = str(item.get("role") or "").strip().lower()

        if not _REFERENCE_ID.fullmatch(reference_id):
            warnings.append(f"Reference assignment {index} has an invalid id and was ignored.")
            continue
        folded_id = reference_id.casefold()
        if folded_id in seen_ids:
            warnings.append(f"Duplicate reference id {reference_id!r} was ignored.")
            continue
        if kind not in REFERENCE_KINDS:
            warnings.append(f"Reference {reference_id!r} has unsupported kind {kind!r} and was ignored.")
            continue
        if target not in REFERENCE_TARGETS:
            warnings.append(f"Reference {reference_id!r} has unsupported target {target!r} and was ignored.")
            continue
        if role not in REFERENCE_ROLES:
            warnings.append(f"Reference {reference_id!r} has unsupported role {role!r} and was ignored.")
            continue
        if len(result) >= MAX_REFERENCE_ASSIGNMENTS:
            if not limit_reported:
                warnings.append(f"Reference assignments are limited to {MAX_REFERENCE_ASSIGNMENTS}; extra entries were ignored.")
                limit_reported = True
            continue

        seen_ids.add(folded_id)
        result.append({"id": reference_id, "kind": kind, "target": target, "role": role})

    return result, warnings


def install_reference_assignment_fixes(schema_module: Any, compiler_module: Any) -> None:
    """Install the V1 contract after the branch's existing correctness layers."""
    if getattr(schema_module, "_H3SC_REFERENCE_ASSIGNMENT_V1", False):
        return

    previous_layout = schema_module.sanitize_layout

    def sanitize_layout(raw: Any, *, width_override: Any = None, height_override: Any = None):
        layout, warnings = previous_layout(raw, width_override=width_override, height_override=height_override)
        source = schema_module.safe_json_loads(raw, {})
        if not isinstance(source, dict):
            source = {}
        assignments, assignment_warnings = sanitize_reference_assignments(source.get("reference_assignments"))
        if "reference_assignments" in source or assignments:
            layout["reference_assignments"] = assignments
        warnings.extend(assignment_warnings)
        return layout, warnings

    schema_module.sanitize_layout = sanitize_layout
    # compiler.py binds sanitize_layout at import time; keep the runtime binding aligned.
    compiler_module.sanitize_layout = sanitize_layout

    previous_compile = compiler_module.compile_h3_prompt

    def compile_h3_prompt(layout_raw: Any, config_raw: Any):
        prompt, structure, _debug = previous_compile(layout_raw, config_raw)
        assignments = copy.deepcopy(structure.get("layout", {}).get("reference_assignments", []))
        structure["reference_assignments"] = assignments
        return prompt, structure, compiler_module.dumps_pretty(structure)

    compiler_module.compile_h3_prompt = compile_h3_prompt
    schema_module._H3SC_REFERENCE_ASSIGNMENT_V1 = True
    compiler_module._H3SC_REFERENCE_ASSIGNMENT_V1 = True
