from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from _load_package import load_package

pkg = load_package()
nodes = __import__(f"{pkg.__name__}.nodes", fromlist=["*"])
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])


class NodeTests(unittest.TestCase):
    def test_canvas_outputs_layout_and_size_only(self):
        node = nodes.H3StructuredCanvas()
        layout_raw = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}],
        }
        layout, width, height = node.build(640, 640, json.dumps(layout_raw), width=768, height=1344)
        self.assertEqual((width, height), (768, 1344))
        self.assertEqual(layout["canvas"]["aspect_ratio"], "9:16")
        self.assertEqual(nodes.H3StructuredCanvas.RETURN_NAMES, ("layout", "width", "height"))
        self.assertEqual(nodes.H3StructuredCanvas.RETURN_TYPES, ("H3_LAYOUT", "INT", "INT"))
        self.assertNotIn("_h3_slot_images", layout)

    def test_canvas_exposes_optional_abc_image_inputs(self):
        optional = nodes.H3StructuredCanvas.INPUT_TYPES()["optional"]
        self.assertEqual(optional["A"][0], "IMAGE")
        self.assertEqual(optional["B"][0], "IMAGE")
        self.assertEqual(optional["C"][0], "IMAGE")
        self.assertNotIn("D", optional)
        self.assertNotIn("E", optional)
        self.assertEqual(nodes._PUBLIC_IMAGE_SLOTS, ("a", "b", "c"))
        self.assertEqual(nodes._INTERNAL_IMAGE_SLOTS, ("a", "b", "c", "d", "e"))

    def test_canvas_images_stay_in_runtime_layout_and_disconnected_inputs_bypass(self):
        node = nodes.H3StructuredCanvas()
        layout_raw = {"canvas": {"width": 640, "height": 640}, "boxes": []}
        image_a = object()
        image_c = object()
        layout, _width, _height = node.build(640, 640, json.dumps(layout_raw), A=image_a, C=image_c)
        self.assertEqual(set(layout["_h3_slot_images"]), {"a", "c"})
        self.assertIs(layout["_h3_slot_images"]["a"], image_a)
        self.assertIs(layout["_h3_slot_images"]["c"], image_c)
        self.assertNotIn("b", layout["_h3_slot_images"])
        clean, _warnings = schema.sanitize_layout(nodes._semantic_layout(layout))
        self.assertNotIn("_h3_slot_images", clean)

    def test_transition_preserves_runtime_slot_images_without_serializing_them(self):
        image_a = object()
        start = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [100, 100, 300, 900]}], "_h3_slot_images": {"a": image_a}}
        end = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [700, 100, 900, 900]}]}
        (layout,) = nodes.H3LayoutTransition().combine(start, end)
        self.assertIs(layout["_h3_slot_images"]["a"], image_a)
        self.assertEqual(layout["transition"]["end_boxes"][0]["bbox_2d"], [700, 100, 900, 900])

    def test_transition_node_combines_start_and_end(self):
        start = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [100, 100, 300, 900]}]}
        end = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [700, 100, 900, 900]}]}
        (layout,) = nodes.H3LayoutTransition().combine(start, end)
        self.assertIn("transition", layout)
        self.assertEqual(layout["transition"]["end_boxes"][0]["bbox_2d"], [700, 100, 900, 900])
        self.assertEqual(nodes.H3LayoutTransition.RETURN_NAMES, ("layout",))

    def test_prompter_without_images_keeps_existing_prompt_parity(self):
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}]}
        config = schema.default_config()
        config["slots"]["a"].update({"type": "object", "description": "A wooden box."})
        prompt_node = nodes.H3StructuredPrompter().compile(layout, json.dumps(config))[0]
        compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])
        prompt_base = compiler.compile_h3_prompt(layout, json.dumps(config))[0]
        self.assertEqual(prompt_node, prompt_base)
        self.assertNotIn("<Picture", prompt_node)

    def test_prompter_maps_connected_abc_images_to_compacted_picture_ordinals(self):
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [], "_h3_slot_images": {"a": object(), "c": object()}}
        config = schema.default_config()
        prompt = nodes.H3StructuredPrompter().compile(layout, json.dumps(config))[0]
        self.assertIn("<Picture 1> is the visual reference for Slot A.", prompt)
        self.assertIn("<Picture 2> is the visual reference for Slot C.", prompt)
        self.assertNotIn("Slot B", prompt)

    def test_prompter_picture_mapping_is_always_canonical_a_to_e_order(self):
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [], "_h3_slot_images": {"e": object(), "c": object(), "a": object(), "d": object(), "b": object()}}
        config = schema.default_config()
        prompt = nodes.H3StructuredPrompter().compile(layout, json.dumps(config))[0]
        positions = [prompt.index(f"<Picture {i}> is the visual reference for Slot {slot}.") for i, slot in enumerate("ABCDE", start=1)]
        self.assertEqual(positions, sorted(positions))

    def test_hidden_de_runtime_slots_are_future_ready_without_public_ui(self):
        image_d = object()
        image_e = object()
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [], "_h3_slot_images": {"e": image_e, "d": image_d}}
        connected = nodes._connected_slot_images(layout)
        self.assertEqual([slot for slot, _ in connected], ["d", "e"])
        self.assertIs(connected[0][1], image_d)
        self.assertIs(connected[1][1], image_e)
        optional = nodes.H3StructuredCanvas.INPUT_TYPES()["optional"]
        self.assertNotIn("D", optional)
        self.assertNotIn("E", optional)

    def test_prompter_node_outputs_prompt_only(self):
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}]}
        config = schema.default_config()
        config["slots"]["a"].update({"type": "object", "description": "A wooden box."})
        (prompt,) = nodes.H3StructuredPrompter().compile(layout, json.dumps(config))
        self.assertIn("A wooden box", prompt)
        self.assertEqual(nodes.H3StructuredPrompter.RETURN_NAMES, ("prompt",))
        self.assertNotIn("end_layout", nodes.H3StructuredPrompter.INPUT_TYPES().get("optional", {}))

    def test_structured_reference_node_has_minimal_native_contract(self):
        inputs = nodes.H3StructuredReferenceToVideo.INPUT_TYPES()["required"]
        self.assertEqual(inputs["clip"][0], "CLIP")
        self.assertEqual(inputs["vae"][0], "VAE")
        self.assertEqual(inputs["layout"][0], "H3_LAYOUT")
        self.assertEqual(inputs["prompt"][0], "STRING")
        self.assertEqual(nodes.H3StructuredReferenceToVideo.RETURN_NAMES, ("positive", "latent"))
        self.assertEqual(nodes.H3StructuredReferenceToVideo.RETURN_TYPES, ("CONDITIONING", "LATENT"))

    def test_structured_reference_node_compacts_abc_and_uses_canvas_timeline(self):
        image_a = object()
        image_c = object()
        layout = {"canvas": {"width": 736, "height": 416}, "boxes": [], "timeline_experimental": {"duration_seconds": 10.0}, "_h3_slot_images": {"c": image_c, "a": image_a}}
        captured = {}
        def fake_core(**kwargs):
            captured.update(kwargs)
            return ("positive", "latent")
        with patch.object(nodes, "_core_reference_to_video", side_effect=fake_core):
            result = nodes.H3StructuredReferenceToVideo().condition("clip", "vae", layout, "prompt")
        self.assertEqual(result, ("positive", "latent"))
        self.assertEqual(captured["length"], 243)
        self.assertEqual(list(captured["ref_images"]), ["ref_image_1", "ref_image_2"])
        self.assertIs(captured["ref_images"]["ref_image_1"], image_a)
        self.assertIs(captured["ref_images"]["ref_image_2"], image_c)

    def test_structured_reference_node_accepts_hidden_de_in_canonical_order(self):
        images = {slot: object() for slot in "abcde"}
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [], "_h3_slot_images": {slot: images[slot] for slot in reversed("abcde")}}
        captured = {}
        def fake_core(**kwargs):
            captured.update(kwargs)
            return ("positive", "latent")
        with patch.object(nodes, "_core_reference_to_video", side_effect=fake_core):
            nodes.H3StructuredReferenceToVideo().condition("clip", "vae", layout, "prompt")
        self.assertEqual(list(captured["ref_images"]), [f"ref_image_{i}" for i in range(1, 6)])
        for i, slot in enumerate("abcde", start=1):
            self.assertIs(captured["ref_images"][f"ref_image_{i}"], images[slot])

    def test_structured_reference_node_bypasses_images_cleanly(self):
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": []}
        captured = {}
        def fake_core(**kwargs):
            captured.update(kwargs)
            return ("positive", "latent")
        with patch.object(nodes, "_core_reference_to_video", side_effect=fake_core):
            nodes.H3StructuredReferenceToVideo().condition("clip", "vae", layout, "prompt")
        self.assertEqual(captured["ref_images"], {})
        self.assertEqual(captured["length"], 124)

    def test_h3_frame_count_matches_model_grid(self):
        self.assertEqual(nodes._h3_frame_count({"timeline_experimental": {"duration_seconds": 5}}), 124)
        self.assertEqual(nodes._h3_frame_count({"timeline_experimental": {"duration_seconds": 10}}), 243)
        self.assertEqual(nodes._h3_frame_count({"timeline_experimental": {"duration_seconds": 15}}), 362)

    def test_node_mappings_include_final_reference_node_and_exclude_binder(self):
        self.assertIn("H3StructuredCanvas", nodes.NODE_CLASS_MAPPINGS)
        self.assertIn("H3LayoutTransition", nodes.NODE_CLASS_MAPPINGS)
        self.assertIn("H3StructuredPrompter", nodes.NODE_CLASS_MAPPINGS)
        self.assertIn("H3StructuredReferenceToVideo", nodes.NODE_CLASS_MAPPINGS)
        self.assertNotIn("H3ReferenceBinder", nodes.NODE_CLASS_MAPPINGS)


if __name__ == "__main__":
    unittest.main()
