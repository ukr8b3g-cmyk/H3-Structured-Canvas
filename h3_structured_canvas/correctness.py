"""Correctness hotfixes shared by the package entry point.

These wrappers preserve the public schemas while tightening validation and
natural-language compilation without changing saved workflow identifiers.
"""

from __future__ import annotations

import json
from typing import Any


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

    original_summary = compiler_module._resolved_summary

    def resolved_summary(config, elements, layout_entries, sequence_items):
        lines = original_summary(config, elements, layout_entries, sequence_items)
        reinforcement = config["reinforcement"]
        element_map = {item["id"]: item for item in elements}

        descriptions: list[str] = []
        compact_positions: list[str] = []
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

        # Element identity/appearance must survive every natural-language
        # reinforcement level. Compact may omit redundancy, not semantics.
        insertion = [*descriptions, *compact_positions]
        if insertion:
            prefix_count = 0 if reinforcement == "compact" else 1
            lines[prefix_count:prefix_count] = insertion
        return lines

    compiler_module._resolved_summary = resolved_summary
    compiler_module._H3SC_CORRECTNESS_FIXES = True
