from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from _load_package import load_package

pkg = load_package()
presets = __import__(f"{pkg.__name__}.presets", fromlist=["*"])


class PresetTests(unittest.TestCase):
    def test_save_replace_delete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = presets.save_preset(root, "canvas", "Layout A", {"boxes": []})
            self.assertEqual(len(result), 1)
            result = presets.save_preset(root, "canvas", "layout a", {"boxes": [1]})
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["data"]["boxes"], [1])
            result = presets.delete_preset(root, "canvas", "LAYOUT A")
            self.assertEqual(result, [])

    def test_corrupt_preset_file_loads_safely(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            root.mkdir(parents=True, exist_ok=True)
            (root / "canvas_presets.json").write_text("not-json", encoding="utf-8")
            self.assertEqual(presets.load_presets(root, "canvas"), [])

    def test_rejects_invalid_kind_and_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ValueError):
                presets.save_preset(root, "unknown", "x", {})
            with self.assertRaises(ValueError):
                presets.save_preset(root, "canvas", "x", [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
