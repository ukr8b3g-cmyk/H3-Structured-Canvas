from __future__ import annotations

import json
import unittest

from _load_package import load_package

pkg = load_package()
nodes = __import__(f"{pkg.__name__}.nodes", fromlist=["*"])
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])


class NodeTests(unittest.TestCase):
    def test_canvas_outputs_layout_size_and_abc_images(self):
        node = nodes.H3StructuredCanvas()
        layout_raw = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}],
        }
        layout, width, height, image_a, image_b, image_c = node.build(
            640, 640, json.dumps(layout_raw), width=768, height=1344
        )
        self.assertEqual((width, height), (768, 1344))
        self.assertEqual(layout["canvas"]["aspect_ratio"], "9:16")
        self.assertEqual(nodes.H3StructuredCanvas.RETURN_NAMES, ("layout", "width", "height", "A", "B", "C"))
        self.assertEqual(nodes.H3StructuredCanvas.RETURN_TYPES, ("H3_LAYOUT", "INT", "INT", "IMAGE", "IMAGE", "IMAGE"))
        self.assertIsNone(image_a)
        self.assertIsNone(image_b)
        self.assertIsNone(image_c)
        self.assertNotIn("_h3_slot_images", layout)

    def test_canvas_exposes_optional_abc_image_inputs(self):
        optional = nodes.H3StructuredCanvas.INPUT_TYPES()["optional"]
        self.assertEqual(optional["A"][0], "IMAGE")
        self.assertEqual(optional["B"][0], "IMAGE")
        self.assertEqual(optional["C"][0], "IMAGE")
        self.assertNotIn("D", optional)
        self.assertNotIn("E", optional)

    def test_canvas_images_pass_through_and_disconnected_inputs_bypass(self):
        node = nodes.H3StructuredCanvas()
        layout_raw = {"canvas": {"width": 640, "height": 640}, "boxes": []}
        image_a = object()
        image_c = object()
        layout, _width, _height, out_a, out_b, out_c = node.build(
            640, 640, json.dumps(layout_raw), A=image_a, C=image_c
        )
        self.assertEqual(set(layout["_h3_slot_images"]), {"a", "c"})
        self.assertIs(layout["_h3_slot_images"]["a"], image_a)
        self.assertIs(layout["_h3_slot_images"]["c"], image_c)
        self.assertNotIn("b", layout["_h3_slot_images"])
        self.assertIs(out_a, image_a)
        self.assertIsNone(out_b)
        self.assertIs(out_c, image_c)

        clean, _warnings = schema.sanitize_layout(nodes._semantic_layout(layout))
        self.assertNotIn("_h3_slot_images", clean)

    def test_transition_preserves_runtime_slot_images_without_serializing_them(self):
        image_a = object()
        start = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [{"slot": "a", "bbox": [100, 100, 300, 900]}],
            "_h3_slot_images": {"a": image_a},
        }
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
        layout = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [
                {"slot": "a", "bbox": [50, 100, 300, 900]},
                {"slot": "c", "bbox": [700, 100, 950, 900]},
            ],
            "_h3_slot_images": {"a": object(), "c": object()},
        }
        config = schema.default_config()
        config["slots"]["a"].update({"type": "subject", "description": "Person A."})
        config["slots"]["c"].update({"type": "object", "description": "Object C."})
        config["slots"]["b"]["enabled"] = False
        prompt = nodes.H3StructuredPrompter().compile(layout, json.dumps(config))[0]
        self.assertIn("Reference image mapping:", prompt)
        self.assertIn("<Picture 1> is the visual reference for Slot A.", prompt)
        self.assertIn("<Picture 2> is the visual reference for Slot C.", prompt)
        self.assertNotIn("Slot B", prompt)
        self.assertNotIn("<Picture 3>", prompt)

    def test_prompter_picture_mapping_is_always_abc_order(self):
        layout = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [],
            "_h3_slot_images": {"c": object(), "a": object(), "b": object()},
        }
        config = schema.default_config()
        prompt = nodes.H3StructuredPrompter().compile(layout, json.dumps(config))[0]
        a = prompt.index("<Picture 1> is the visual reference for Slot A.")
        b = prompt.index("<Picture 2> is the visual reference for Slot B.")
        c = prompt.index("<Picture 3> is the visual reference for Slot C.")
        self.assertLess(a, b)
        self.assertLess(b, c)

    def test_prompter_node_outputs_prompt_only(self):
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}]}
        config = schema.default_config()
        config["slots"]["a"].update({"type": "object", "description": "A wooden box."})
        (prompt,) = nodes.H3StructuredPrompter().compile(layout, json.dumps(config))
        self.assertIn("A wooden box", prompt)
        self.assertEqual(nodes.H3StructuredPrompter.RETURN_NAMES, ("prompt",))
        self.assertNotIn("end_layout", nodes.H3StructuredPrompter.INPUT_TYPES().get("optional", {}))

    def test_node_mappings_exclude_reference_binder(self):
        self.assertIn("H3StructuredCanvas", nodes.NODE_CLASS_MAPPINGS)
        self.assertIn("H3LayoutTransition", nodes.NODE_CLASS_MAPPINGS)
        self.assertIn("H3StructuredPrompter", nodes.NODE_CLASS_MAPPINGS)
        self.assertNotIn("H3ReferenceBinder", nodes.NODE_CLASS_MAPPINGS)


if __name__ == "__main__":
    unittest.main()
