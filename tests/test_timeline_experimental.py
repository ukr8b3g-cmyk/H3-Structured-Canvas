from __future__ import annotations

import json
import pathlib
import unittest

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])


class TimelineExperimentalTests(unittest.TestCase):
    def two_point_layout(self):
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
                "version": 2,
                "slots": ["a", "b", "c"],
                "duration_seconds": 5.0,
                "interpolation": "linear",
            },
        }

    def three_point_layout(self):
        raw = self.two_point_layout()
        raw["timeline_experimental"] = {
            "version": 3,
            "slots": ["a", "b", "c"],
            "duration_seconds": 5.0,
            "interpolation": "piecewise_linear",
            "mid_time": 0.5,
            "mid_boxes": [
                {"slot": "a", "bbox_2d": [350, 20, 650, 400]},
                {"slot": "b", "bbox_2d": [350, 450, 650, 850]},
            ],
        }
        return raw

    def config(self):
        config = schema.default_config()
        config["scene_description"] = "One continuous scene with three visible subjects."
        for slot, description in {"a": "Subject A.", "b": "Subject B.", "c": "Subject C."}.items():
            config["slots"][slot].update({"type": "subject", "description": description, "motion": "start_end"})
        config["slots"]["d"]["enabled"] = False
        config["slots"]["e"]["enabled"] = False
        return config

    def test_old_two_point_layout_keeps_existing_start_end_contract(self):
        layout, warnings = schema.sanitize_layout(self.two_point_layout())
        self.assertFalse(warnings)
        self.assertEqual([item["slot"] for item in layout["boxes"]], ["a", "b", "c"])
        self.assertEqual(layout["transition"]["end_boxes"][2]["bbox_2d"], [350, 700, 650, 950])
        self.assertNotIn("timeline_experimental", layout)

    def test_three_point_schema_preserves_only_explicit_mid_boxes(self):
        layout, warnings = schema.sanitize_layout(self.three_point_layout())
        self.assertFalse(warnings)
        timeline = layout["timeline_experimental"]
        self.assertEqual(timeline["version"], 3)
        self.assertEqual(timeline["interpolation"], "piecewise_linear")
        self.assertEqual(timeline["mid_time"], 0.5)
        mids = {item["slot"]: item["bbox_2d"] for item in timeline["mid_boxes"]}
        self.assertEqual(mids["a"], [350, 20, 650, 400])
        self.assertEqual(mids["b"], [350, 450, 650, 850])
        self.assertNotIn("c", mids)

    def test_compiler_emits_explicit_mid_semantic_keyframe_without_new_qwen_bbox_field(self):
        prompt, structure, _ = compiler.compile_h3_prompt(self.three_point_layout(), self.config())
        elements = {item["id"]: item for item in structure["model_structure"]["elements"]}
        trajectory = elements["subject_a"]["trajectory"]
        self.assertEqual(trajectory["interpolation"], "piecewise_linear")
        self.assertEqual(trajectory["mid_time"], 0.5)
        self.assertEqual(trajectory["mid_bbox"], [350, 20, 650, 400])
        self.assertEqual(trajectory["keyframes"][1]["name"], "mid")
        self.assertEqual(trajectory["keyframes"][1]["bbox"], [350, 20, 650, 400])
        self.assertIn("temporal midpoint", prompt)
        self.assertIn("do not shortcut directly from START to END", prompt)
        self.assertNotIn("mid_bbox_2d", elements["subject_a"])

    def test_slot_without_explicit_mid_stays_two_point_semantics(self):
        _, structure, _ = compiler.compile_h3_prompt(self.three_point_layout(), self.config())
        elements = {item["id"]: item for item in structure["model_structure"]["elements"]}
        self.assertNotIn("mid_bbox", elements["subject_c"]["trajectory"])
        self.assertNotIn("keyframes", elements["subject_c"]["trajectory"])

    def test_frontend_three_point_contract_is_present(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        source = (root / "web" / "zzzzz_h3sc_timeline_experimental.js").read_text(encoding="utf-8")
        for required in (
            'const VISIBLE_SLOTS = ["a", "b", "c"]',
            'const HIDDEN_SLOTS = ["d", "e"]',
            'const DURATION_SECONDS = 5.0',
            'const MID_TIME = 0.5',
            'Piecewise Linear · START → MID → END',
            'MID · EDIT',
            'mid_boxes',
            'midExplicit',
            'piecewise_linear',
            'Delete Selected',
            'PREVIEW ONLY',
            'motion = "start_end"',
        ):
            self.assertIn(required, source)
        self.assertNotIn("Auto Key", source)
        self.assertNotIn("Bezier", source)

    def test_serialized_timeline_metadata_is_json_safe_shape(self):
        metadata = {
            "version": 3,
            "slots": ["a", "b", "c"],
            "duration_seconds": 5.0,
            "interpolation": "piecewise_linear",
            "canonical_time": "normalized_0_1",
            "mid_time": 0.5,
            "mid_boxes": [{"slot": "a", "bbox_2d": [350, 20, 650, 400]}],
        }
        encoded = json.dumps(metadata)
        decoded = json.loads(encoded)
        self.assertEqual(decoded["slots"], ["a", "b", "c"])
        self.assertEqual(decoded["interpolation"], "piecewise_linear")
        self.assertEqual(decoded["mid_time"], 0.5)


if __name__ == "__main__":
    unittest.main()
