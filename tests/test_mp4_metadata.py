from __future__ import annotations

import struct
import tempfile
import unittest
from pathlib import Path

from _load_package import load_package

pkg = load_package()
mp4 = __import__(f"{pkg.__name__}.mp4_metadata", fromlist=["*"])


def box(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I4s", 8 + len(payload), kind) + payload


class Mp4MetadataTests(unittest.TestCase):
    def test_embed_and_read_round_trip_without_touching_existing_boxes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.mp4"
            original = box(b"ftyp", b"isom0000") + box(b"mdat", b"video-bytes")
            path.write_bytes(original)

            metadata = {
                "workflow": {"nodes": [{"type": "H3StructuredCanvas"}]},
                "prompt": {"1": {"class_type": "H3StructuredPrompter"}},
            }
            mp4.embed_metadata(path, metadata)

            self.assertTrue(path.read_bytes().startswith(original))
            restored = mp4.read_metadata(path)
            self.assertEqual(restored["workflow"], metadata["workflow"])
            self.assertEqual(restored["prompt"], metadata["prompt"])
            self.assertEqual(restored["schema"], mp4.H3SC_MP4_SCHEMA)

    def test_reembedding_replaces_trailing_h3sc_box(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.mp4"
            path.write_bytes(box(b"ftyp", b"isom0000") + box(b"mdat", b"x"))
            mp4.embed_metadata(path, {"workflow": {"version": 1}})
            first_size = path.stat().st_size
            mp4.embed_metadata(path, {"workflow": {"version": 2}})
            self.assertLessEqual(path.stat().st_size, first_size + 32)
            self.assertEqual(mp4.read_metadata(path)["workflow"]["version"], 2)

    def test_resolve_under_root_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            good = mp4.resolve_under_root(root, "result.mp4", "clips")
            self.assertEqual(good, (root / "clips" / "result.mp4").resolve())
            with self.assertRaises(ValueError):
                mp4.resolve_under_root(root, "../escape.mp4", "")
            with self.assertRaises(ValueError):
                mp4.resolve_under_root(root, "result.mp4", "../outside")


if __name__ == "__main__":
    unittest.main()
