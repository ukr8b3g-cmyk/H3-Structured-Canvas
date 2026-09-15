from __future__ import annotations

import copy
import pathlib
import unittest

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])
reference_assignment = __import__(f"{pkg.__name__}.reference_assignment", fromlist=["*"])
ROOT = pathlib.Path(__file__).resolve().parents[1]
MULTIKEY_JS = ROOT / "web" / "zzzzzzz_h3sc_multikey_timeline.js"


def layout_with_subject() -> dict:
    layout = schema.default_layout()
    layout["boxes"] = [{"slot": "a", "bbox_2d": [100, 100, 450, 900]}]
    return layout


def config_with_subject() -> dict:
    config = schema.default_config()
    config["slots"]["a"].update({"type": "subject", "description": "A woman standing in frame."})
    for slot in ("b", "c", "d", "e"):
        config["slots"][slot]["enabled"] = False
    return config


class ReferenceAssignmentV1Tests(unittest.TestCase):
    def test_valid_assignments_are_preserved_in_order(self):
        layout = layout_with_subject()
        layout["reference_assignments"] = [
            {"id": "ref_person", "kind": "image", "target": "a", "role": "identity"},
            {"id": "ref_scene", "kind": "image", "target": "scene", "role": "composition"},
            {"id": "ref_motion", "kind": "video", "target": "a", "role": "motion"},
        ]
        clean, warnings = schema.sanitize_layout(layout)
        self.assertFalse(warnings)
        self.assertEqual(clean["reference_assignments"], layout["reference_assignments"])

    def test_invalid_and_duplicate_assignments_are_rejected_deterministically(self):
        layout = layout_with_subject()
        layout["reference_assignments"] = [
            {"id": "ref_1", "kind": "image", "target": "a", "role": "identity"},
            {"id": "REF_1", "kind": "video", "target": "b", "role": "motion"},
            {"id": "bad id", "kind": "image", "target": "a", "role": "identity"},
            {"id": "ref_audio", "kind": "audio", "target": "scene", "role": "composition"},
            {"id": "ref_d", "kind": "image", "target": "d", "role": "identity"},
            {"id": "ref_unknown", "kind": "image", "target": "a", "role": "lighting"},
        ]
        clean, warnings = schema.sanitize_layout(layout)
        self.assertEqual(clean["reference_assignments"], [
            {"id": "ref_1", "kind": "image", "target": "a", "role": "identity"},
        ])
        self.assertGreaterEqual(len(warnings), 5)

    def test_assignment_count_is_capped_at_eight(self):
        source = [
            {"id": f"ref_{index}", "kind": "image", "target": "scene", "role": "composition"}
            for index in range(1, 11)
        ]
        clean, warnings = reference_assignment.sanitize_reference_assignments(source)
        self.assertEqual(len(clean), 8)
        self.assertEqual([item["id"] for item in clean], [f"ref_{index}" for index in range(1, 9)])
        self.assertTrue(any("limited to 8" in warning for warning in warnings))

    def test_assignments_survive_sanitize_round_trip_and_transition(self):
        start = layout_with_subject()
        start["reference_assignments"] = [
            {"id": "ref_person", "kind": "image", "target": "a", "role": "appearance"},
        ]
        end = copy.deepcopy(start)
        end["boxes"] = [{"slot": "a", "bbox_2d": [550, 100, 900, 900]}]
        start["transition"] = {"end_canvas": end["canvas"], "end_boxes": end["boxes"]}
        first, _ = schema.sanitize_layout(start)
        second, _ = schema.sanitize_layout(first)
        self.assertEqual(second["reference_assignments"], start["reference_assignments"])
        self.assertIn("transition", second)

    def test_compiler_exposes_metadata_without_changing_prompt_or_model_structure(self):
        base_layout = layout_with_subject()
        referenced_layout = copy.deepcopy(base_layout)
        referenced_layout["reference_assignments"] = [
            {"id": "ref_person", "kind": "image", "target": "a", "role": "identity"},
            {"id": "ref_scene", "kind": "image", "target": "scene", "role": "composition"},
        ]
        config = config_with_subject()
        prompt_base, structure_base, _ = compiler.compile_h3_prompt(base_layout, config)
        prompt_refs, structure_refs, debug_refs = compiler.compile_h3_prompt(referenced_layout, config)
        self.assertEqual(prompt_refs, prompt_base)
        self.assertEqual(structure_refs["model_structure"], structure_base["model_structure"])
        self.assertEqual(structure_refs["resolved_summary"], structure_base["resolved_summary"])
        self.assertEqual(structure_refs["reference_assignments"], referenced_layout["reference_assignments"])
        self.assertIn('"reference_assignments"', debug_refs)
        self.assertNotIn("ref_person", prompt_refs)
        self.assertNotIn("ref_scene", prompt_refs)

    def test_multikey_frontend_preserves_and_edits_reference_assignment_contract(self):
        source = MULTIKEY_JS.read_text(encoding="utf-8")
        for required in (
            "MAX_REFERENCE_ASSIGNMENTS = 8",
            "function sanitizeReferenceAssignments",
            'reference_assignments: clone(controller.state?.reference_assignments ?? [])',
            'controller.state.reference_assignments = sanitizeReferenceAssignments(raw.reference_assignments)',
            'referenceTitle.textContent = "REFERENCE ASSIGNMENT"',
            'addReference.textContent = "+ Reference"',
            '["image", "video"]',
            '["a", "b", "c", "scene"]',
            '["identity", "appearance", "composition", "motion"]',
        ):
            self.assertIn(required, source)


if __name__ == "__main__":
    unittest.main()
