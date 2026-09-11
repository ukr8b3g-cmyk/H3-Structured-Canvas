from __future__ import annotations

import unittest

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])


def scale_only_layout():
    return {
        "canvas": {"width": 1024, "height": 1024},
        "boxes": [{"slot": "a", "bbox_2d": [381, 407, 641, 1000]}],
        "transition": {
            "end_canvas": {"width": 1024, "height": 1024},
            "end_boxes": [{"slot": "a", "bbox_2d": [255, 6, 732, 1000]}],
        },
    }


def translation_layout():
    return {
        "canvas": {"width": 1024, "height": 1024},
        "boxes": [{"slot": "a", "bbox_2d": [100, 200, 300, 800]}],
        "transition": {
            "end_canvas": {"width": 1024, "height": 1024},
            "end_boxes": [{"slot": "a", "bbox_2d": [600, 200, 800, 800]}],
        },
    }


class TrajectorySemanticsTests(unittest.TestCase):
    def config(self, description: str):
        config = schema.default_config()
        config["scene_description"] = "A simple street scene."
        config["slots"]["a"].update({
            "type": "subject",
            "description": description,
            "motion": "start_end",
        })
        for slot in ("b", "c", "d", "e"):
            config["slots"][slot]["enabled"] = False
        return config

    def test_depth_approach_uses_bbox_scale_and_prompt_intent(self):
        prompt, structure, _ = compiler.compile_h3_prompt(
            scale_only_layout(),
            self.config("A woman walks naturally from the far background toward the camera."),
        )
        element = structure["model_structure"]["elements"][0]
        trajectory = element["trajectory"]
        self.assertEqual(trajectory["scale_change"], "increase")
        self.assertEqual(trajectory["semantic_interpretation"], "approach_camera")
        self.assertEqual(trajectory["dominant_change"], "scale")
        self.assertIn("center_x", trajectory["stable_anchors"])
        self.assertIn("bottom_edge", trajectory["stable_anchors"])
        self.assertGreater(trajectory["visual_scale_ratio"], 1.5)
        self.assertIn("moves genuinely toward the camera", prompt)
        self.assertIn("not a digital camera zoom", prompt)

    def test_scale_change_without_depth_words_stays_cause_agnostic(self):
        prompt, structure, _ = compiler.compile_h3_prompt(
            scale_only_layout(),
            self.config("A woman wearing a red jacket stands in the scene."),
        )
        trajectory = structure["model_structure"]["elements"][0]["trajectory"]
        self.assertEqual(trajectory["semantic_interpretation"], "apparent_scale_change")
        self.assertIn("apparent on-screen scale increases", prompt)
        self.assertNotIn("moves genuinely toward the camera", prompt)

    def test_translation_is_kept_separate_from_scale(self):
        prompt, structure, _ = compiler.compile_h3_prompt(
            translation_layout(),
            self.config("A woman walks across the frame."),
        )
        trajectory = structure["model_structure"]["elements"][0]["trajectory"]
        self.assertEqual(trajectory["scale_change"], "stable")
        self.assertEqual(trajectory["dominant_change"], "translation")
        self.assertEqual(trajectory["screen_motion"], "right")
        self.assertIn("screen-space center also moves right", prompt)

    def test_qwen_unified_profile_keeps_trajectory_semantics(self):
        config = self.config("A woman walks toward the camera.")
        config["schema_profile"] = "qwen_unified_bbox2d"
        _, structure, _ = compiler.compile_h3_prompt(scale_only_layout(), config)
        element = structure["model_structure"]["elements"][0]
        self.assertEqual(element["start_bbox_2d"], [381, 407, 641, 1000])
        self.assertEqual(element["end_bbox_2d"], [255, 6, 732, 1000])
        self.assertEqual(element["trajectory"]["semantic_interpretation"], "approach_camera")


if __name__ == "__main__":
    unittest.main()
