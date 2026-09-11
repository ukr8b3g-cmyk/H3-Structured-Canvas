from __future__ import annotations

import pathlib
import unittest

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])


def offscreen_layout():
    return {
        "schema": "h3_structured_canvas/0.9",
        "canvas": {"width": 1024, "height": 1024},
        "boxes": [
            {"slot": "a", "bbox_2d": [200, 80, 800, 1000]},
            {"slot": "b", "bbox_2d": [430, 430, 620, 650]},
        ],
        "transition": {
            "end_canvas": {"width": 1024, "height": 1024},
            "end_boxes": [
                {"slot": "a", "bbox_2d": [200, 80, 800, 1000]},
                {"slot": "b", "bbox_2d": [1120, 560, 1320, 780]},
            ],
        },
        "timeline_experimental": {
            "version": 1,
            "slots": ["a", "b", "c"],
            "duration_seconds": 5.0,
            "interpolation": "linear",
            "canonical_time": "normalized_0_1",
        },
    }


class ExperimentalV2Tests(unittest.TestCase):
    def test_experimental_schema_preserves_offscreen_end_box(self):
        layout, warnings = schema.sanitize_layout(offscreen_layout())
        end_boxes = {item["slot"]: item["bbox_2d"] for item in layout["transition"]["end_boxes"]}
        self.assertEqual(end_boxes["b"], [1120, 560, 1320, 780])
        self.assertTrue(any("offscreen BBOX coordinates were preserved" in item for item in warnings))

    def test_compiler_emits_exit_frame_semantics(self):
        config = schema.default_config()
        config["scene_description"] = "A woman releases a cat in one continuous shot."
        config["slots"]["a"].update({
            "type": "subject",
            "description": "A woman remains standing in place.",
            "motion": "start_end",
        })
        config["slots"]["b"].update({
            "type": "subject",
            "description": "A cat runs quickly to the right and leaves the frame.",
            "motion": "start_end",
        })
        for slot in ("c", "d", "e"):
            config["slots"][slot]["enabled"] = False

        prompt, structure, _ = compiler.compile_h3_prompt(offscreen_layout(), config)
        elements = {item["id"]: item for item in structure["model_structure"]["elements"]}
        trajectory = elements["subject_b"]["trajectory"]
        self.assertEqual(trajectory["exit_frame"], "right")
        self.assertEqual(trajectory["end_visibility"], "offscreen_right")
        self.assertIn("continues completely beyond the right edge", prompt)
        self.assertIn("canvas boundary is not a stopping point", prompt)

    def test_overlap_relation_separates_without_inventing_holding(self):
        config = schema.default_config()
        config["scene_description"] = "A woman and a cat are visible."
        config["slots"]["a"].update({
            "type": "subject",
            "description": "A woman stays in place.",
            "motion": "start_end",
        })
        config["slots"]["b"].update({
            "type": "subject",
            "description": "A cat runs independently to the right and exits the frame.",
            "motion": "start_end",
        })
        for slot in ("c", "d", "e"):
            config["slots"][slot]["enabled"] = False

        prompt, structure, _ = compiler.compile_h3_prompt(offscreen_layout(), config)
        elements = {item["id"]: item for item in structure["model_structure"]["elements"]}
        relations = elements["subject_b"]["relations"]
        self.assertEqual(relations[0]["target"], "subject_a")
        self.assertEqual(relations[0]["change"], "separates_from")
        self.assertGreaterEqual(relations[0]["start_subject_containment_ratio"], 0.60)
        self.assertLessEqual(relations[0]["end_subject_containment_ratio"], 0.08)
        self.assertIn("separates from it", prompt)
        self.assertIn("geometry alone does not imply holding", prompt)
        self.assertNotIn("is held by", prompt)

    def test_non_experimental_layout_keeps_production_clamp(self):
        raw = {
            "canvas": {"width": 1024, "height": 1024},
            "boxes": [{"slot": "a", "bbox_2d": [-200, 100, 300, 900]}],
        }
        layout, _ = schema.sanitize_layout(raw)
        self.assertEqual(layout["boxes"][0]["bbox_2d"][0], 0)

    def test_frontend_v2_contract_covers_persistence_and_offscreen_editing(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        source = (root / "web" / "zzzzzzzzz_h3sc_experimental_v2.js").read_text(encoding="utf-8")
        for required in (
            "OFFSCREEN_MIN = -1000",
            "OFFSCREEN_MAX = 2000",
            "drawOffscreenMarkers",
            "offscreenMarkerHit",
            "h3scPromptState",
            "beforeunload",
            "visibilitychange",
            "graphToPrompt",
            "queuePrompt",
            "node.onSerialize",
            "node.serialize",
            "restoreConfiguredPrompt",
            "previousConfigure",
        ):
            self.assertIn(required, source)

    def test_overscan_editor_preserves_box_size_and_captures_delete(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        source = (root / "web" / "zzzzzzzzzz_h3sc_overscan_delete_fix.js").read_text(encoding="utf-8")
        for required in (
            "VIEW_MIN = -300",
            "VIEW_MAX = 1300",
            "OFFSCREEN",
            "const boxWidth = ox2 - ox1",
            "const boxHeight = oy2 - oy1",
            "box = [x1, y1, x1 + boxWidth, y1 + boxHeight]",
            "window.addEventListener(\"keydown\", handler, true)",
            "event.stopImmediatePropagation",
            "controller.removeBox",
        ):
            self.assertIn(required, source)

    def test_final_ui_polish_separates_view_from_internal_trajectory(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        source = (root / "web" / "zzzzzzzzzzz_h3sc_ui_polish.js").read_text(encoding="utf-8")
        for required in (
            "VIEW_MIN = -180",
            "VIEW_MAX = 1180",
            "INTERNAL_MIN = -1000",
            "INTERNAL_MAX = 2000",
            "const boxWidth = ox2 - ox1",
            "const boxHeight = oy2 - oy1",
            "box = [x1, y1, x1 + boxWidth, y1 + boxHeight]",
            "h3sc-size-inline",
            "h3sc-timeline-time-input",
            "ui.range.dispatchEvent(new Event(\"input\"",
            "__h3scBoxSelectionActive",
            "event.stopImmediatePropagation",
            "controller.removeBox",
        ):
            self.assertIn(required, source)


if __name__ == "__main__":
    unittest.main()
