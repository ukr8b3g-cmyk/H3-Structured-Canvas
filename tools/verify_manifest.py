#!/usr/bin/env python3
"""Cross-platform verifier for PACKAGE_MANIFEST.sha256.

Manifest hashes are canonical LF bytes. On Windows, a checkout created with
core.autocrlf may contain CRLF; text files are normalized to LF before hashing.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "PACKAGE_MANIFEST.sha256"
TEXT_SUFFIXES = {".py", ".js", ".mjs", ".ts", ".json", ".md", ".toml", ".txt", ".sha256"}
TEXT_NAMES = {".gitattributes", ".gitignore"}


def canonical_bytes(path: Path) -> bytes:
    data = path.read_bytes()
    if path.suffix.lower() in TEXT_SUFFIXES or path.name in TEXT_NAMES:
        data = data.replace(b"\r\n", b"\n")
    return data


def main() -> int:
    failures: list[str] = []
    checked = 0
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, relative = line.split("  ", 1)
        path = ROOT / relative
        if not path.is_file():
            failures.append(f"MISSING  {relative}")
            continue
        actual = hashlib.sha256(canonical_bytes(path)).hexdigest()
        checked += 1
        if actual.lower() != expected.lower():
            failures.append(f"MISMATCH {relative}")
    if failures:
        print("\n".join(failures))
        print(f"Manifest FAIL: {len(failures)} problem(s), {checked} file(s) checked")
        return 1
    print(f"Manifest PASS: {checked}/{checked} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
