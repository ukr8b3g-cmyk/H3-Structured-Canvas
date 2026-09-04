from __future__ import annotations

import concurrent.futures
import tempfile
import unittest
from pathlib import Path

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])
presets = __import__(f"{pkg.__name__}.presets", fromlist=["*"])


def two_box_layout(left_a: bool = True):
    a = [80, 120, 420, 940] if left_a else [600, 120, 920, 940]
    b = [600, 120, 920, 940] if left_a else [80, 120, 420, 940]
    return {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox_2d": a}, {"slot": "b", "bbox_2d": b}]}


class CorrectnessCleanupTests(unittest.TestCase):
    def test_natural_language_balanced_keeps_descriptions(self):
        config = schema.default_config(); config["compiler_mode"] = "natural_language"; config["reinforcement"] = "balanced"
        config["slots"]["a"].update({"type": "subject", "description": "A woman wearing a blue coat."})
        config["slots"]["b"].update({"type": "subject", "description": "A man wearing a black jacket."})
        prompt, _, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        self.assertIn("A woman wearing a blue coat.", prompt); self.assertIn("A man wearing a black jacket.", prompt)
        self.assertIn("subject_a occupies the left region", prompt)

    def test_natural_language_compact_keeps_descriptions_and_layout(self):
        config = schema.default_config(); config["compiler_mode"] = "natural_language"; config["reinforcement"] = "compact"
        config["slots"]["a"].update({"type": "subject", "description": "A woman wearing a blue coat."})
        config["slots"]["b"].update({"type": "subject", "description": "A man wearing a black jacket."})
        left_prompt, _, _ = compiler.compile_h3_prompt(two_box_layout(True), config)
        right_prompt, _, _ = compiler.compile_h3_prompt(two_box_layout(False), config)
        self.assertIn("A woman wearing a blue coat.", left_prompt)
        self.assertIn("subject_a occupies the left region", left_prompt)
        self.assertIn("subject_a occupies the right region", right_prompt)
        self.assertNotEqual(left_prompt, right_prompt)

    def test_value_percent_is_clamped(self):
        config = schema.default_config()
        config["slots"]["a"].update({"type": "graphic", "description": "A progress ring.", "motion": "radial_fill", "value": 250})
        config["slots"]["b"]["enabled"] = False
        _, structure, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        element = structure["model_structure"]["elements"][0]
        self.assertEqual(element["value"], 100); self.assertEqual(element["animation"]["value"], 100)
        self.assertTrue(any("clamped" in item for item in structure["warnings"]))

    def test_malformed_and_empty_layout_warn(self):
        _, malformed = schema.sanitize_layout("{not-json")
        _, empty = schema.sanitize_layout({})
        self.assertTrue(any("could not be restored" in item for item in malformed))
        self.assertTrue(any("No active BBOX" in item for item in empty))

    def test_parallel_preset_saves_do_not_raise_or_lose_updates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            def save(index: int):
                return presets.save_preset(root, "canvas", f"preset-{index}", {"index": index})
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(save, range(80)))
            self.assertEqual(len(results), 80)
            loaded = presets.load_presets(root, "canvas")
            self.assertEqual(len(loaded), 80)
            self.assertEqual({item["data"]["index"] for item in loaded}, set(range(80)))


if __name__ == "__main__":
    unittest.main()
