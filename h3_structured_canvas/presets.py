"""Safe preset persistence used by the browser UI and unit tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ALLOWED_KINDS = {"canvas", "prompter"}
MAX_PRESETS = 100
MAX_NAME_LENGTH = 80
MAX_SERIALIZED_BYTES = 256_000


def _validate_kind(kind: str) -> str:
    normalized = str(kind or "").strip().lower()
    if normalized not in ALLOWED_KINDS:
        raise ValueError("Unsupported preset kind")
    return normalized


def _preset_path(root: Path, kind: str) -> Path:
    normalized = _validate_kind(kind)
    return root / f"{normalized}_presets.json"


def _clean_name(name: Any) -> str:
    value = str(name or "").strip()[:MAX_NAME_LENGTH]
    if not value:
        raise ValueError("Preset name is required")
    return value


def _clean_data(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("Preset data must be a JSON object")
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(serialized.encode("utf-8")) > MAX_SERIALIZED_BYTES:
        raise ValueError("Preset data is too large")
    # Round-trip removes non-JSON Python objects if called from tests or plugins.
    return json.loads(serialized)


def load_presets(root: Path, kind: str) -> list[dict[str, Any]]:
    path = _preset_path(root, kind)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(raw, list):
        return []
    result: list[dict[str, Any]] = []
    for item in raw[:MAX_PRESETS]:
        if not isinstance(item, dict):
            continue
        try:
            name = _clean_name(item.get("name"))
            data = _clean_data(item.get("data"))
        except ValueError:
            continue
        result.append({"name": name, "data": data})
    result.sort(key=lambda item: item["name"].casefold())
    return result


def write_presets(root: Path, kind: str, presets: list[dict[str, Any]]) -> None:
    path = _preset_path(root, kind)
    path.parent.mkdir(parents=True, exist_ok=True)
    clean = presets[:MAX_PRESETS]
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(clean, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def save_preset(root: Path, kind: str, name: Any, data: Any) -> list[dict[str, Any]]:
    clean_name = _clean_name(name)
    clean_data = _clean_data(data)
    presets = [
        item for item in load_presets(root, kind)
        if item["name"].casefold() != clean_name.casefold()
    ]
    presets.append({"name": clean_name, "data": clean_data})
    presets.sort(key=lambda item: item["name"].casefold())
    if len(presets) > MAX_PRESETS:
        raise ValueError(f"A maximum of {MAX_PRESETS} presets is supported")
    write_presets(root, kind, presets)
    return presets


def delete_preset(root: Path, kind: str, name: Any) -> list[dict[str, Any]]:
    clean_name = _clean_name(name)
    presets = [
        item for item in load_presets(root, kind)
        if item["name"].casefold() != clean_name.casefold()
    ]
    write_presets(root, kind, presets)
    return presets
