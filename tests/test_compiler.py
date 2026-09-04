from __future__ import annotations

import json
import unittest

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])


def two_box_layout():
    return {
        "canvas": {"width": 640, "height": 640},
        "boxes": [
            {"slot": "a", "bbox_2d": [80, 120, 420, 940]},
            {"slot": "b", "bbox_2d": [600, 120, 920, 940]},
        ],
    }


def transition_layout():
    return {
        **two_box_layout(),
        "transition": {
            "end_canvas": {"width": 640, "height": 640},
            "end_boxes": [
                {"slot": "a", "bbox": [620, 120, 940, 940]},
                {"slot": "b", "bbox": [80, 120, 400, 940]},
            ],
        },
    }


class CompilerTests(unittest.TestCase):
    def test_verified_hybrid_subjects_use_model_obj_type(self):
        config = schema.default_config()
        config["scene_description"] = "A realistic park scene."
        config["slots"]["a"].update({"type": "subject", "description": "A woman."})
        config["slots"]["b"].update({"type": "subject", "description": "A man."})
        prompt, structure, debug = compiler.compile_h3_prompt(two_box_layout(), config)
        self.assertIn('"slot":"subject_a","bbox":[80,120,420,940]', prompt)
        self.assertIn('"id":"subject_b","type":"obj","desc":"A man."', prompt)
        self.assertIn("subject_a occupies the left region", prompt)
        self.assertEqual(structure["model_structure"]["layout"]["bbox_format"], "xyxy")
        self.assertEqual(json.loads(debug)["package_version"], schema.PACKAGE_VERSION)

    def test_none_motion_does_not_add_animation_or_sequence(self):
        config = schema.default_config()
        config["slots"]["a"].update({"type": "subject", "description": "A woman.", "motion": "none"})
        config["slots"]["b"]["enabled"] = False
        _, structure, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        element = structure["model_structure"]["elements"][0]
        self.assertNotIn("animation", element)
        self.assertNotIn("sequence", structure["model_structure"]["motion"])
        self.assertNotIn("instruction", structure["model_structure"]["motion"])

    def test_hold_motion_is_explicit(self):
        config = schema.default_config()
        config["slots"]["a"].update({"type": "subject", "description": "A woman.", "motion": "hold"})
        config["slots"]["b"]["enabled"] = False
        prompt, structure, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        self.assertEqual(structure["model_structure"]["elements"][0]["animation"]["effect"], "hold")
        self.assertIn("remains fixed", prompt)

    def test_start_end_trajectory_uses_transition_layout(self):
        config = schema.default_config()
        config["slots"]["a"].update({"type": "subject", "description": "A woman walking.", "motion": "start_end"})
        config["slots"]["b"]["enabled"] = False
        prompt, structure, _ = compiler.compile_h3_prompt(transition_layout(), config)
        entry = structure["model_structure"]["layout"]["boxes"][0]
        self.assertEqual(entry["start_bbox"], [80, 120, 420, 940])
        self.assertEqual(entry["end_bbox"], [620, 120, 940, 940])
        self.assertIn("moves from the left region to the right region", prompt)

    def test_start_end_without_transition_warns_and_falls_back(self):
        config = schema.default_config()
        config["slots"]["a"].update({"type": "subject", "description": "A woman walking.", "motion": "start_end"})
        config["slots"]["b"]["enabled"] = False
        _, structure, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        self.assertTrue(any("H3 Layout Transition" in item for item in structure["warnings"]))
        self.assertIn("bbox", structure["model_structure"]["layout"]["boxes"][0])

    def test_motion_graphics_and_exact_text_guard(self):
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [150, 100, 850, 230]}, {"slot": "b", "bbox": [200, 280, 800, 820]}]}
        config = schema.default_config(); config["scene_description"] = "A clean animated infographic."
        config["slots"]["a"].update({"type": "text", "exact_text": "PROJECT COMPLETE", "description": "Bold title.", "motion": "fade_in", "order": 1})
        config["slots"]["b"].update({"type": "graphic", "description": "A circular progress chart.", "motion": "radial_fill", "value": 75, "order": 2})
        prompt, structure, _ = compiler.compile_h3_prompt(layout, config)
        self.assertIn('"text":"PROJECT COMPLETE"', prompt)
        self.assertIn('"effect":"radial_fill","value":75', prompt)
        self.assertIn("Do not display element IDs", prompt)
        self.assertEqual(structure["model_structure"]["constraints"]["exact_visible_text"], ["PROJECT COMPLETE"])

    def test_qwen_unified_profile(self):
        config = schema.default_config(); config["schema_profile"] = "qwen_unified_bbox2d"
        config["slots"]["a"].update({"type": "object", "description": "A suitcase."}); config["slots"]["b"]["enabled"] = False
        _, structure, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        element = structure["model_structure"]["elements"][0]
        self.assertEqual(element["bbox_2d"], [80, 120, 420, 940]); self.assertNotIn("layout", structure["model_structure"])

    def test_h3_envelope_output(self):
        config = schema.default_config(); config["output_format"] = "h3_envelope"; config["soundscape"] = "Soft interface tones."; config["music"] = "N/A"
        config["slots"]["a"].update({"type": "object", "description": "A wooden crate."}); config["slots"]["b"]["enabled"] = False
        prompt, _, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        self.assertTrue(prompt.startswith("integrated_multimodal_description:")); self.assertIn("overall_soundscape: Soft interface tones.", prompt); self.assertIn("non_diegetic_music: N/A", prompt)

    def test_direct_output_includes_optional_audio_when_present(self):
        config = schema.default_config(); config["soundscape"] = "Wind in trees."; config["music"] = "Soft piano."
        config["slots"]["a"].update({"type": "object", "description": "A wooden crate."}); config["slots"]["b"]["enabled"] = False
        prompt, _, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        self.assertIn("Soundscape: Wind in trees.", prompt); self.assertIn("Non-diegetic music: Soft piano.", prompt)

    def test_natural_language_mode_is_self_contained(self):
        config = schema.default_config(); config["compiler_mode"] = "natural_language"
        config["slots"]["a"].update({"type": "subject", "description": "A woman wearing a blue coat."}); config["slots"]["b"]["enabled"] = False
        prompt, _, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        self.assertTrue(prompt.startswith("Scene:"))
        self.assertNotIn('"layout":', prompt)
        self.assertIn("A woman wearing a blue coat.", prompt)
        self.assertIn("subject_a occupies the left region", prompt)

    def test_natural_language_compact_preserves_description_and_bbox_direction(self):
        config = schema.default_config()
        config["compiler_mode"] = "natural_language"
        config["reinforcement"] = "compact"
        config["slots"]["a"].update({"type": "subject", "description": "A woman wearing a blue coat."})
        config["slots"]["b"].update({"type": "subject", "description": "A man wearing a black jacket."})

        prompt_left, _, _ = compiler.compile_h3_prompt(two_box_layout(), config)
        swapped = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [
                {"slot": "a", "bbox_2d": [600, 120, 920, 940]},
                {"slot": "b", "bbox_2d": [80, 120, 420, 940]},
            ],
        }
        prompt_right, _, _ = compiler.compile_h3_prompt(swapped, config)

        self.assertIn("A woman wearing a blue coat.", prompt_left)
        self.assertIn("A man wearing a black jacket.", prompt_left)
        self.assertIn("subject_a occupies the left region", prompt_left)
        self.assertIn("subject_a occupies the right region", prompt_right)
        self.assertNotEqual(prompt_left, prompt_right)

    def test_directional_motion_templates(self):
        motions = ["move_left_right","move_right_left","move_top_bottom","move_bottom_top","slide_in_left","slide_in_right","slide_in_top","slide_in_bottom"]
        for motion in motions:
            with self.subTest(motion=motion):
                config=schema.default_config(); config["slots"]["a"].update({"type":"object","description":"A test element.","motion":motion}); config["slots"]["b"]["enabled"]=False
                prompt, structure, _ = compiler.compile_h3_prompt(two_box_layout(), config)
                self.assertIn("animation", structure["model_structure"]["elements"][0]); self.assertIsInstance(prompt,str)

    def test_graphic_motion_templates(self):
        motions=["grow_up","grow_down","grow_left","grow_right","radial_fill","progress_fill","reveal"]
        for motion in motions:
            with self.subTest(motion=motion):
                config=schema.default_config(); config["slots"]["a"].update({"type":"graphic","description":"A chart element.","motion":motion,"value":75}); config["slots"]["b"]["enabled"]=False
                _, structure, _ = compiler.compile_h3_prompt(two_box_layout(), config)
                self.assertIn("animation", structure["model_structure"]["elements"][0])

    def test_transition_aspect_warning_is_preserved(self):
        layout=transition_layout(); layout["transition"]["end_canvas"]={"width":360,"height":640}
        config=schema.default_config(); config["slots"]["a"].update({"type":"subject","description":"A woman.","motion":"start_end"}); config["slots"]["b"]["enabled"]=False
        _, structure, _ = compiler.compile_h3_prompt(layout, config)
        self.assertTrue(any("aspect ratios differ" in item for item in structure["warnings"]))

    def test_no_duration_instruction_is_emitted(self):
        config=schema.default_config(); config["slots"]["a"].update({"type":"object","description":"A crate."}); config["slots"]["b"]["enabled"]=False
        prompt, structure, _=compiler.compile_h3_prompt(two_box_layout(), config)
        self.assertNotIn("second clip", prompt); self.assertNotIn("duration_seconds", structure["config"])

    def test_missing_content_produces_warning_not_exception(self):
        prompt, structure, _=compiler.compile_h3_prompt({}, "not-json")
        self.assertIsInstance(prompt,str)
        self.assertTrue(any("No active element" in item for item in structure["warnings"]))
        self.assertTrue(any("could not be parsed" in item for item in structure["warnings"]))


if __name__ == "__main__":
    unittest.main()
