"""Safe preset persistence used by the browser UI and unit tests."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

ALLOWED_KINDS = {"canvas", "prompter"}
MAX_PRESETS = 100
MAX_NAME_LENGTH = 80
MAX_SERIALIZED_BYTES = 256_000
_REPLACE_RETRIES = 8
_REPLACE_RETRY_SECONDS = 0.025
_WRITE_LOCK = threading.RLock()


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


def _replace_with_retry(temporary: Path, path: Path) -> None:
    last_error: OSError | None = None
    for attempt in range(_REPLACE_RETRIES):
        try:
            os.replace(temporary, path)
            return
        except PermissionError as exc:
            last_error = exc
            if attempt + 1 >= _REPLACE_RETRIES:
                break
            time.sleep(_REPLACE_RETRY_SECONDS * (attempt + 1))
    if last_error is not None:
        raise last_error


def write_presets(root: Path, kind: str, presets: list[dict[str, Any]]) -> None:
    path = _preset_path(root, kind)
    path.parent.mkdir(parents=True, exist_ok=True)
    clean = presets[:MAX_PRESETS]
    payload = json.dumps(clean, ensure_ascii=False, indent=2) + "\n"
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
            temporary = Path(handle.name)
        _replace_with_retry(temporary, path)
        temporary = None
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def save_preset(root: Path, kind: str, name: Any, data: Any) -> list[dict[str, Any]]:
    clean_name = _clean_name(name)
    clean_data = _clean_data(data)
    with _WRITE_LOCK:
        presets = [item for item in load_presets(root, kind) if item["name"].casefold() != clean_name.casefold()]
        presets.append({"name": clean_name, "data": clean_data})
        presets.sort(key=lambda item: item["name"].casefold())
        if len(presets) > MAX_PRESETS:
            raise ValueError(f"A maximum of {MAX_PRESETS} presets is supported")
        write_presets(root, kind, presets)
        return presets


def delete_preset(root: Path, kind: str, name: Any) -> list[dict[str, Any]]:
    clean_name = _clean_name(name)
    with _WRITE_LOCK:
        presets = [item for item in load_presets(root, kind) if item["name"].casefold() != clean_name.casefold()]
        write_presets(root, kind, presets)
        return presets
