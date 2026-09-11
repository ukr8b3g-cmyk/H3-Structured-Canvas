from __future__ import annotations

import copy
import unittest
from pathlib import Path

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])

ROOT = Path(__file__).resolve().parents[1]
FIX_JS = ROOT / "web" / "zzzzzz_h3sc_timeline_fix.js"
BASE_JS = ROOT / "web" / "h3_structured_canvas.js"


class TimelineEndpointFixTests(unittest.TestCase):
    def test_fix_guards_against_seed_box_endpoint_shrink(self):
        source = FIX_JS.read_text(encoding="utf-8")
        self.assertIn("provisional", source)
        self.assertIn("track.start = cloneBox(box)", source)
        self.assertIn("track.end = cloneBox(box)", source)
        self.assertIn("persist the final full-size", source)

    def test_delete_and_backspace_are_supported_for_selected_box(self):
        base = BASE_JS.read_text(encoding="utf-8")
        self.assertIn('event.key === "Delete"', base)
        self.assertIn('event.key === "Backspace"', base)
        self.assertIn("this.removeBox(this.activeSlot)", base)

    def test_prompt_content_is_independent_from_canvas_deletion(self):
        config = schema.default_config()
        config["slots"]["a"]["description"] = "Keep this prompt when box A is deleted."
        config["slots"]["a"]["exact_text"] = "KEEP"
        original = copy.deepcopy(config)

        empty_layout = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [],
        }
        compiler.compile_h3_prompt(empty_layout, config)

        self.assertEqual(config, original)
        self.assertEqual(config["slots"]["a"]["description"], "Keep this prompt when box A is deleted.")
        self.assertEqual(config["slots"]["a"]["exact_text"], "KEEP")

    def test_existing_prompt_state_survives_sanitize(self):
        config = schema.default_config()
        config["scene_description"] = "Existing scene"
        config["slots"]["a"].update({
            "description": "Existing A prompt",
            "exact_text": "A TEXT",
        })
        sanitized, _warnings = schema.sanitize_config(config)
        self.assertEqual(sanitized["scene_description"], "Existing scene")
        self.assertEqual(sanitized["slots"]["a"]["description"], "Existing A prompt")
        self.assertEqual(sanitized["slots"]["a"]["exact_text"], "A TEXT")

    def test_brand_new_prompter_state_is_blank(self):
        config = schema.default_config()
        self.assertEqual(config["scene_description"], "")
        for slot in ("a", "b", "c"):
            self.assertEqual(config["slots"][slot]["description"], "")
            self.assertEqual(config["slots"][slot]["exact_text"], "")


if __name__ == "__main__":
    unittest.main()
