from __future__ import annotations

import json
import unittest

from _load_package import load_package

pkg = load_package()
nodes = __import__(f"{pkg.__name__}.nodes", fromlist=["*"])
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])


class NodeTests(unittest.TestCase):
    def test_canvas_node_outputs_only_layout_and_size(self):
        node = nodes.H3StructuredCanvas()
        layout_raw = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}],
        }
        layout, width, height = node.build(640, 640, json.dumps(layout_raw), width=768, height=1344)
        self.assertEqual((width, height), (768, 1344))
        self.assertEqual(layout["canvas"]["aspect_ratio"], "9:16")
        self.assertEqual(nodes.H3StructuredCanvas.RETURN_NAMES, ("layout", "width", "height"))
        self.assertNotIn("_h3_slot_images", layout)

    def test_canvas_exposes_optional_abc_image_inputs(self):
        optional = nodes.H3StructuredCanvas.INPUT_TYPES()["optional"]
        self.assertEqual(optional["A"][0], "IMAGE")
        self.assertEqual(optional["B"][0], "IMAGE")
        self.assertEqual(optional["C"][0], "IMAGE")
        self.assertNotIn("D", optional)
        self.assertNotIn("E", optional)

    def test_canvas_slot_images_are_runtime_only_and_disconnected_inputs_bypass(self):
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

    def test_prompter_ignores_runtime_slot_images(self):
        layout = {"canvas": {"width": 640, "height": 640}, "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}]}
        config = schema.default_config()
        config["slots"]["a"].update({"type": "object", "description": "A wooden box."})
        prompt_base = nodes.H3StructuredPrompter().compile(layout, json.dumps(config))[0]
        layout_with_image = dict(layout)
        layout_with_image["_h3_slot_images"] = {"a": object()}
        prompt_image = nodes.H3StructuredPrompter().compile(layout_with_image, json.dumps(config))[0]
        self.assertEqual(prompt_image, prompt_base)

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
