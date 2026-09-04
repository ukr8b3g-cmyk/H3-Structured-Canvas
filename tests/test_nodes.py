from __future__ import annotations

import json
import unittest

from _load_package import load_package

pkg = load_package()
nodes = __import__(f"{pkg.__name__}.nodes", fromlist=["*"])
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])


class NodeTests(unittest.TestCase):
    def test_canvas_node_outputs(self):
        node = nodes.H3StructuredCanvas()
        layout_raw = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}],
        }
        layout, debug, width, height = node.build(640, 640, json.dumps(layout_raw), width=768, height=1344)
        self.assertEqual((width, height), (768, 1344))
        self.assertEqual(layout["canvas"]["aspect_ratio"], "9:16")
        self.assertEqual(json.loads(debug)["boxes"][0]["slot"], "a")

    def test_prompter_node_outputs(self):
        layout = {
            "canvas": {"width": 640, "height": 640},
            "boxes": [{"slot": "a", "bbox": [100, 100, 900, 900]}],
        }
        config = schema.default_config()
        config["slots"]["a"].update({"type": "object", "description": "A wooden box."})
        node = nodes.H3StructuredPrompter()
        prompt, structure, debug, length = node.compile(layout, json.dumps(config))
        self.assertIn("A wooden box", prompt)
        self.assertEqual(structure["schema"], schema.STRUCTURE_SCHEMA)
        self.assertEqual(json.loads(debug)["schema"], schema.STRUCTURE_SCHEMA)
        self.assertEqual(length, 124)


if __name__ == "__main__":
    unittest.main()
