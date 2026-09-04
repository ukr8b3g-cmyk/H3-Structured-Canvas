from __future__ import annotations

import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
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

    def test_concurrent_saves_do_not_share_temp_files_or_lose_presets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def writer(index: int) -> None:
                name = f"Layout {index}"
                for iteration in range(20):
                    presets.save_preset(root, "canvas", name, {"iteration": iteration})

            with ThreadPoolExecutor(max_workers=8) as executor:
                list(executor.map(writer, range(8)))

            result = presets.load_presets(root, "canvas")
            self.assertEqual({item["name"] for item in result}, {f"Layout {index}" for index in range(8)})
            self.assertEqual([path.name for path in root.glob("*.tmp")], [])
            self.assertEqual([path.name for path in root.glob(".*.tmp")], [])


if __name__ == "__main__":
    unittest.main()
