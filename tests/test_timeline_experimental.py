from __future__ import annotations

import json
import pathlib
import unittest

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])


class TimelineExperimentalTests(unittest.TestCase):
    def three_slot_layout(self):
        return {
            "schema": "h3_structured_canvas/0.9",
            "canvas": {"width": 640, "height": 640},
            "boxes": [
                {"slot": "a", "bbox_2d": [50, 150, 300, 900]},
                {"slot": "b", "bbox_2d": [700, 150, 950, 900]},
                {"slot": "c", "bbox_2d": [350, 50, 650, 300]},
            ],
            "transition": {
                "end_canvas": {"width": 640, "height": 640},
                "end_boxes": [
                    {"slot": "a", "bbox_2d": [700, 150, 950, 900]},
                    {"slot": "b", "bbox_2d": [50, 150, 300, 900]},
                    {"slot": "c", "bbox_2d": [350, 700, 650, 950]},
                ],
            },
            "timeline_experimental": {
                "version": 1,
                "slots": ["a", "b", "c"],
                "duration_seconds": 5.0,
                "interpolation": "linear",
            },
        }

    def test_schema_keeps_start_end_transition_for_three_slots(self):
        layout, warnings = schema.sanitize_layout(self.three_slot_layout())
        self.assertFalse(warnings)
        self.assertEqual([item["slot"] for item in layout["boxes"]], ["a", "b", "c"])
        self.assertEqual(
            layout["transition"]["end_boxes"][2]["bbox_2d"],
            [350, 700, 650, 950],
        )
        self.assertNotIn("timeline_experimental", layout)

    def test_compiler_emits_three_independent_start_end_trajectories(self):
        config = schema.default_config()
        config["scene_description"] = "One continuous scene with three visible subjects."
        for slot, description in {
            "a": "Subject A.",
            "b": "Subject B.",
            "c": "Subject C.",
        }.items():
            config["slots"][slot].update(
                {"type": "subject", "description": description, "motion": "start_end"}
            )
        config["slots"]["d"]["enabled"] = False
        config["slots"]["e"]["enabled"] = False

        prompt, structure, _ = compiler.compile_h3_prompt(self.three_slot_layout(), config)
        boxes = structure["model_structure"]["layout"]["boxes"]
        self.assertEqual(len(boxes), 3)
        self.assertEqual(boxes[0]["start_bbox"], [50, 150, 300, 900])
        self.assertEqual(boxes[0]["end_bbox"], [700, 150, 950, 900])
        self.assertEqual(boxes[1]["start_bbox"], [700, 150, 950, 900])
        self.assertEqual(boxes[1]["end_bbox"], [50, 150, 300, 900])
        self.assertEqual(boxes[2]["start_bbox"], [350, 50, 650, 300])
        self.assertEqual(boxes[2]["end_bbox"], [350, 700, 650, 950])
        self.assertIn("subject_a", prompt)
        self.assertIn("subject_b", prompt)
        self.assertIn("subject_c", prompt)

    def test_frontend_experiment_contract_is_present(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        source = (root / "web" / "zzzzz_h3sc_timeline_experimental.js").read_text(encoding="utf-8")
        for required in (
            'const VISIBLE_SLOTS = ["a", "b", "c"]',
            'const DURATION_SECONDS = 5.0',
            'Linear Start → End',
            'Delete Selected',
            'PREVIEW ONLY',
            'motion = "start_end"',
            'slot === "d" || slot === "e"',
            'timeline_experimental',
        ):
            self.assertIn(required, source)
        self.assertNotIn("Auto Key", source)
        self.assertNotIn("Bezier", source)

    def test_serialized_timeline_metadata_is_json_safe_shape(self):
        metadata = {
            "version": 1,
            "slots": ["a", "b", "c"],
            "duration_seconds": 5.0,
            "interpolation": "linear",
            "canonical_time": "normalized_0_1",
        }
        encoded = json.dumps(metadata)
        decoded = json.loads(encoded)
        self.assertEqual(decoded["slots"], ["a", "b", "c"])
        self.assertEqual(decoded["interpolation"], "linear")


if __name__ == "__main__":
    unittest.main()
