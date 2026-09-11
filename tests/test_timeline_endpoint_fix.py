from __future__ import annotations

import copy
import unittest
from pathlib import Path

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])

ROOT = Path(__file__).resolve().parents[1]
TIMELINE_JS = ROOT / "web" / "zzzzz_h3sc_timeline_experimental.js"


class TimelineEndpointFixTests(unittest.TestCase):
    def test_linked_start_end_and_provisional_draw_are_single_state_machine(self):
        source = TIMELINE_JS.read_text(encoding="utf-8")
        self.assertIn("editState[slot]", source)
        self.assertIn("linked:", source)
        self.assertIn("provisional:", source)
        self.assertIn("track.start = cloneBox(box)", source)
        self.assertIn("track.end = cloneBox(box)", source)
        self.assertIn("if (state.linked && !sameBox(track.start, box)) state.linked = false", source)

    def test_delete_and_backspace_remove_selected_bbox_without_node_delete(self):
        source = TIMELINE_JS.read_text(encoding="utf-8")
        self.assertIn('event.key !== "Delete" && event.key !== "Backspace"', source)
        self.assertIn("event.preventDefault()", source)
        self.assertIn("event.stopPropagation()", source)
        self.assertIn("event.stopImmediatePropagation", source)
        self.assertIn("removeSlot(controller, exp.selectedSlot)", source)

    def test_prompt_content_is_independent_from_canvas_deletion(self):
        config = schema.default_config()
        config["slots"]["a"]["description"] = "Keep this prompt when box A is deleted."
        config["slots"]["a"]["exact_text"] = "KEEP"
        original = copy.deepcopy(config)
        compiler.compile_h3_prompt({"canvas": {"width": 640, "height": 640}, "boxes": []}, config)
        self.assertEqual(config, original)
        self.assertEqual(config["slots"]["a"]["description"], "Keep this prompt when box A is deleted.")
        self.assertEqual(config["slots"]["a"]["exact_text"], "KEEP")

    def test_existing_prompt_state_survives_sanitize(self):
        config = schema.default_config()
        config["scene_description"] = "Existing scene"
        config["slots"]["a"].update({"description": "Existing A prompt", "exact_text": "A TEXT"})
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
