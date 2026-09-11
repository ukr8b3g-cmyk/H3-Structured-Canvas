"""MP4 workflow metadata helpers for the experimental Structured Canvas branch."""

from __future__ import annotations

import json
import os
import struct
from pathlib import Path
from typing import Any

H3SC_MP4_UUID = bytes.fromhex("6f0c2d2f1fdc4f2e9dba48a23b3f46af")
H3SC_MP4_SCHEMA = "h3_structured_canvas/mp4_metadata/1"
_MAX_METADATA_BYTES = 12 * 1024 * 1024


def _json_payload(metadata: dict[str, Any]) -> bytes:
    if not isinstance(metadata, dict):
        raise TypeError("metadata must be an object")
    payload = dict(metadata)
    payload.setdefault("schema", H3SC_MP4_SCHEMA)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(encoded) > _MAX_METADATA_BYTES:
        raise ValueError("metadata payload is too large")
    return encoded


def _uuid_box(payload: bytes) -> bytes:
    size = 8 + 16 + len(payload)
    if size >= 2**32:
        raise ValueError("metadata box is too large")
    return struct.pack(">I4s", size, b"uuid") + H3SC_MP4_UUID + payload


def _iter_top_level_boxes(path: Path):
    file_size = path.stat().st_size
    with path.open("rb") as handle:
        offset = 0
        while offset + 8 <= file_size:
            handle.seek(offset)
            header = handle.read(8)
            if len(header) != 8:
                return
            size32, box_type = struct.unpack(">I4s", header)
            header_size = 8
            if size32 == 1:
                extended = handle.read(8)
                if len(extended) != 8:
                    return
                size = struct.unpack(">Q", extended)[0]
                header_size = 16
            elif size32 == 0:
                size = file_size - offset
            else:
                size = size32
            if size < header_size or offset + size > file_size:
                return
            yield offset, size, box_type, header_size
            if size == 0:
                return
            offset += size


def read_metadata(path: str | os.PathLike[str]) -> dict[str, Any] | None:
    """Return the last H3 Structured Canvas UUID metadata box, if present."""
    file_path = Path(path)
    if not file_path.is_file():
        return None
    found: dict[str, Any] | None = None
    with file_path.open("rb") as handle:
        for offset, size, box_type, header_size in _iter_top_level_boxes(file_path):
            if box_type != b"uuid" or size < header_size + 16:
                continue
            handle.seek(offset + header_size)
            if handle.read(16) != H3SC_MP4_UUID:
                continue
            payload = handle.read(size - header_size - 16)
            try:
                decoded = json.loads(payload.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            if isinstance(decoded, dict):
                found = decoded
    return found


def embed_metadata(path: str | os.PathLike[str], metadata: dict[str, Any]) -> dict[str, int]:
    """Append or replace the trailing H3SC UUID box without re-encoding video."""
    file_path = Path(path)
    if file_path.suffix.lower() != ".mp4":
        raise ValueError("only .mp4 files are supported")
    if not file_path.is_file():
        raise FileNotFoundError(file_path)

    payload = _json_payload(metadata)
    box = _uuid_box(payload)
    file_size = file_path.stat().st_size
    trailing_offset: int | None = None

    for offset, size, box_type, header_size in _iter_top_level_boxes(file_path):
        if box_type != b"uuid" or offset + size != file_size or size < header_size + 16:
            continue
        with file_path.open("rb") as handle:
            handle.seek(offset + header_size)
            if handle.read(16) == H3SC_MP4_UUID:
                trailing_offset = offset

    with file_path.open("r+b") as handle:
        if trailing_offset is not None:
            handle.truncate(trailing_offset)
            handle.seek(trailing_offset)
        else:
            handle.seek(0, os.SEEK_END)
        handle.write(box)
        handle.flush()

    return {"metadata_bytes": len(payload), "box_bytes": len(box)}


def resolve_under_root(
    root: str | os.PathLike[str],
    filename: str,
    subfolder: str | None = None,
) -> Path:
    """Resolve a ComfyUI output path while preventing path traversal."""
    if not isinstance(filename, str) or not filename.strip():
        raise ValueError("filename is required")
    if Path(filename).name != filename:
        raise ValueError("filename must not contain a path")
    if not filename.lower().endswith(".mp4"):
        raise ValueError("only .mp4 files are supported")

    root_path = Path(root).resolve()
    relative = Path(subfolder or "") / filename
    candidate = (root_path / relative).resolve()
    if candidate != root_path and root_path not in candidate.parents:
        raise ValueError("invalid output path")
    return candidate
