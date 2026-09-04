from __future__ import annotations

import json
import unittest

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])


class SchemaTests(unittest.TestCase):
    def test_external_size_override_and_color_compatibility(self):
        raw = {"canvas": {"width": 640, "height": 640, "grid": "cross"}, "boxes": [{"slot": "red", "bbox": [0.08, 0.12, 0.42, 0.94]}, {"slot": "blue", "bbox_2d": [600, 120, 920, 940]}]}
        layout, warnings = schema.sanitize_layout(raw, width_override=1344, height_override=768)
        self.assertEqual((layout["canvas"]["width"], layout["canvas"]["height"]), (1344, 768))
        self.assertEqual(layout["canvas"]["aspect_ratio"], "16:9")
        self.assertEqual(layout["boxes"][0]["bbox_2d"], [80, 120, 420, 940])
        self.assertEqual(layout["boxes"][1]["slot"], "b")
        self.assertEqual(warnings, [])

    def test_invalid_boxes_are_dropped(self):
        layout, _ = schema.sanitize_layout({"boxes": [{"slot": "a", "bbox": [1, 1, 1, 1]}, {"slot": "b", "bbox": [900, 900, 100, 100]}, {"slot": "invalid", "bbox": [0, 0, 100, 100]}]})
        self.assertEqual(len(layout["boxes"]), 2)
        self.assertEqual(layout["boxes"][0]["slot"], "b")
        self.assertEqual(layout["boxes"][0]["bbox_2d"], [100, 100, 900, 900])
        self.assertEqual(layout["boxes"][1]["slot"], "c")

    def test_model_id_slot_compatibility_and_string_booleans(self):
        layout, _ = schema.sanitize_layout({"canvas": {"show_boxes": "false"}, "boxes": [{"slot": "subject_b", "bbox": [600, 100, 900, 900]}, {"id": "graphic_d", "bbox": [100, 100, 300, 300]}]})
        self.assertFalse(layout["canvas"]["show_boxes"])
        self.assertEqual([item["slot"] for item in layout["boxes"]], ["b", "d"])
        config, _ = schema.sanitize_config({"exact_text_safety": "false", "allow_additional_text": "true", "slots": {"a": {"enabled": "false"}}})
        self.assertFalse(config["exact_text_safety"]); self.assertTrue(config["allow_additional_text"]); self.assertFalse(config["slots"]["a"]["enabled"])

    def test_duplicate_slots_last_value_wins_with_warning(self):
        layout, warnings = schema.sanitize_layout({"boxes": [{"slot": "a", "bbox": [0, 0, 100, 100]}, {"slot": "a", "bbox": [200, 200, 800, 800]}]})
        self.assertEqual(layout["boxes"][0]["bbox_2d"], [200, 200, 800, 800])
        self.assertTrue(any("Duplicate box" in item for item in warnings))

    def test_aspect_ratio_canonicalization(self):
        self.assertEqual(schema.simplified_aspect_ratio(1344, 768), "16:9")
        self.assertEqual(schema.simplified_aspect_ratio(768, 1344), "9:16")
        self.assertEqual(schema.simplified_aspect_ratio(1000, 700), "10:7")

    def test_config_migrates_auto_static_phase_and_drops_duration(self):
        config, _ = schema.sanitize_config({
            "duration_seconds": 5,
            "slots": {"a": {"type": "auto", "motion": "static", "phase": 999}},
        })
        self.assertNotIn("duration_seconds", config)
        self.assertEqual(config["slots"]["a"]["type"], "subject")
        self.assertEqual(config["slots"]["a"]["motion"], "none")
        self.assertEqual(config["slots"]["a"]["order"], 99)
        json.dumps(config)

    def test_legacy_slide_names_migrate(self):
        config, _ = schema.sanitize_config({"slots": {"a": {"motion": "slide_up"}, "b": {"motion": "slide_down"}}})
        self.assertEqual(config["slots"]["a"]["motion"], "slide_in_bottom")
        self.assertEqual(config["slots"]["b"]["motion"], "slide_in_top")

    def test_transition_data_survives_sanitize(self):
        raw = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [{"slot": "a", "bbox": [100, 100, 300, 900]}],
            "transition": {"end_canvas": {"width": 640, "height": 640}, "end_boxes": [{"slot": "a", "bbox": [700, 100, 900, 900]}]},
        }
        layout, warnings = schema.sanitize_layout(raw)
        self.assertEqual(warnings, [])
        self.assertEqual(layout["transition"]["end_boxes"][0]["bbox_2d"], [700, 100, 900, 900])


if __name__ == "__main__":
    unittest.main()
