from __future__ import annotations

import copy
import unittest

from _load_package import load_package

pkg = load_package()
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])
nodes = __import__(f"{pkg.__name__}.nodes", fromlist=["*"])
reference_binding = __import__(f"{pkg.__name__}.reference_binding", fromlist=["*"])
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])


def layout_with_assignments() -> dict:
    layout = schema.default_layout()
    layout["boxes"] = [{"slot": "a", "bbox_2d": [100, 100, 450, 900]}]
    layout["reference_assignments"] = [
        {"id": "ref_image", "kind": "image", "target": "a", "role": "identity"},
        {"id": "ref_video", "kind": "video", "target": "a", "role": "motion"},
    ]
    return layout


def config_with_subject() -> dict:
    config = schema.default_config()
    config["slots"]["a"].update({"type": "subject", "description": "A woman standing in frame."})
    for slot in ("b", "c", "d", "e"):
        config["slots"][slot]["enabled"] = False
    return config


class ReferenceBindingR5Tests(unittest.TestCase):
    def test_node_contract_exposes_native_image_video_and_chain_input(self):
        inputs = nodes.H3ReferenceBinder.INPUT_TYPES()
        self.assertEqual(inputs["required"]["layout"][0], "H3_LAYOUT")
        self.assertEqual(inputs["required"]["reference_id"][0], "STRING")
        self.assertEqual(inputs["optional"]["previous_references"][0], "H3_REFERENCE_BINDINGS")
        self.assertEqual(inputs["optional"]["image"][0], "IMAGE")
        self.assertEqual(inputs["optional"]["video"][0], "VIDEO")
        self.assertEqual(nodes.H3ReferenceBinder.RETURN_TYPES, ("H3_LAYOUT", "H3_REFERENCE_BINDINGS"))

    def test_image_binding_keeps_media_out_of_layout(self):
        image = object()
        clean_layout, bundle = nodes.H3ReferenceBinder().bind(layout_with_assignments(), "ref_image", image=image)
        self.assertEqual(bundle["schema"], reference_binding.REFERENCE_BINDINGS_SCHEMA)
        self.assertEqual(len(bundle["entries"]), 1)
        entry = bundle["entries"][0]
        self.assertEqual({key: entry[key] for key in ("id", "kind", "target", "role")}, {
            "id": "ref_image", "kind": "image", "target": "a", "role": "identity",
        })
        self.assertIs(entry["media"], image)
        self.assertNotIn("reference_bindings", clean_layout)
        self.assertEqual(clean_layout["reference_assignments"], layout_with_assignments()["reference_assignments"])

    def test_video_binding_can_chain_after_image_binding(self):
        image = object()
        video = object()
        layout, first = nodes.H3ReferenceBinder().bind(layout_with_assignments(), "ref_image", image=image)
        layout, second = nodes.H3ReferenceBinder().bind(
            layout,
            "REF_VIDEO",
            previous_references=first,
            video=video,
        )
        self.assertEqual([item["id"] for item in second["entries"]], ["ref_image", "ref_video"])
        self.assertIs(second["entries"][0]["media"], image)
        self.assertIs(second["entries"][1]["media"], video)

    def test_undeclared_reference_id_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "not declared"):
            nodes.H3ReferenceBinder().bind(layout_with_assignments(), "missing_ref", image=object())

    def test_exactly_one_media_socket_must_be_connected(self):
        binder = nodes.H3ReferenceBinder()
        with self.assertRaisesRegex(ValueError, "exactly one"):
            binder.bind(layout_with_assignments(), "ref_image")
        with self.assertRaisesRegex(ValueError, "exactly one"):
            binder.bind(layout_with_assignments(), "ref_image", image=object(), video=object())

    def test_assignment_kind_must_match_connected_socket(self):
        binder = nodes.H3ReferenceBinder()
        with self.assertRaisesRegex(ValueError, "expects an IMAGE"):
            binder.bind(layout_with_assignments(), "ref_image", video=object())
        with self.assertRaisesRegex(ValueError, "expects a VIDEO"):
            binder.bind(layout_with_assignments(), "ref_video", image=object())

    def test_duplicate_binding_is_rejected(self):
        layout, first = nodes.H3ReferenceBinder().bind(layout_with_assignments(), "ref_image", image=object())
        with self.assertRaisesRegex(ValueError, "already bound"):
            nodes.H3ReferenceBinder().bind(
                layout,
                "ref_image",
                previous_references=first,
                image=object(),
            )

    def test_previous_bundle_must_match_current_assignment_contract(self):
        layout = layout_with_assignments()
        stale = {
            "schema": reference_binding.REFERENCE_BINDINGS_SCHEMA,
            "entries": [{
                "id": "ref_image",
                "kind": "image",
                "target": "scene",
                "role": "identity",
                "media": object(),
            }],
        }
        with self.assertRaisesRegex(ValueError, "no longer matches"):
            nodes.H3ReferenceBinder().bind(
                layout,
                "ref_video",
                previous_references=stale,
                video=object(),
            )

    def test_binding_does_not_change_prompt_or_model_structure(self):
        base = layout_with_assignments()
        bound_layout, bundle = nodes.H3ReferenceBinder().bind(base, "ref_image", image=object())
        config = config_with_subject()
        prompt_base, structure_base, _ = compiler.compile_h3_prompt(copy.deepcopy(base), config)
        prompt_bound, structure_bound, debug_bound = compiler.compile_h3_prompt(bound_layout, config)
        self.assertEqual(prompt_bound, prompt_base)
        self.assertEqual(structure_bound["model_structure"], structure_base["model_structure"])
        self.assertNotIn("H3_REFERENCE_BINDINGS", debug_bound)
        self.assertNotIn("media", debug_bound)
        self.assertEqual(len(bundle["entries"]), 1)


if __name__ == "__main__":
    unittest.main()
