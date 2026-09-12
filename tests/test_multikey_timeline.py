from __future__ import annotations

import pathlib
import unittest

from _load_package import load_package

pkg = load_package()
schema = __import__(f"{pkg.__name__}.schema", fromlist=["*"])
compiler = __import__(f"{pkg.__name__}.compiler", fromlist=["*"])
ROOT = pathlib.Path(__file__).resolve().parents[1]
MULTIKEY_JS = ROOT / "web" / "zzzzzzz_h3sc_multikey_timeline.js"


def multikey_layout(duration=12.0):
    return {
        "schema": "h3_structured_canvas/0.9",
        "canvas": {"width": 768, "height": 768},
        "boxes": [{"slot": "a", "bbox_2d": [80, 500, 300, 980]}],
        "transition": {
            "end_canvas": {"width": 768, "height": 768},
            "end_boxes": [{"slot": "a", "bbox_2d": [700, 500, 920, 980]}],
        },
        "timeline_experimental": {
            "version": 4,
            "slots": ["a", "b", "c"],
            "duration_seconds": duration,
            "interpolation": "piecewise_linear",
            "canonical_time": "normalized_0_1",
            "max_intermediate_keys": 7,
            "keyframes": {
                "a": [
                    {"time": 0.20, "bbox_2d": [160, 120, 380, 620]},
                    {"time": 0.50, "bbox_2d": [390, 40, 610, 560]},
                    {"time": 0.80, "bbox_2d": [620, 120, 840, 620]},
                ]
            },
            "mid_time": 0.5,
            "mid_boxes": [{"slot": "a", "bbox_2d": [390, 40, 610, 560]}],
        },
    }


def config():
    value = schema.default_config()
    value["slots"]["a"].update({"type": "subject", "description": "A woman walks through the marked route.", "motion": "start_end"})
    for slot in ("b", "c", "d", "e"):
        value["slots"][slot]["enabled"] = False
    return value


class MultiKeyTimelineTests(unittest.TestCase):
    def test_v4_schema_preserves_duration_and_keys(self):
        layout, warnings = schema.sanitize_layout(multikey_layout())
        self.assertFalse(warnings)
        timeline = layout["timeline_experimental"]
        self.assertEqual(timeline["version"], 4)
        self.assertEqual(timeline["duration_seconds"], 12.0)
        self.assertEqual(timeline["max_intermediate_keys"], 7)
        self.assertEqual([item["time"] for item in timeline["keyframes"]["a"]], [0.2, 0.5, 0.8])

    def test_duration_clamps_to_five_to_fifteen_seconds(self):
        low, _ = schema.sanitize_layout(multikey_layout(1.0))
        high, _ = schema.sanitize_layout(multikey_layout(99.0))
        self.assertEqual(low["timeline_experimental"]["duration_seconds"], 5.0)
        self.assertEqual(high["timeline_experimental"]["duration_seconds"], 15.0)

    def test_compiler_emits_all_intermediate_keys_and_segments(self):
        prompt, structure, _ = compiler.compile_h3_prompt(multikey_layout(), config())
        trajectory = structure["model_structure"]["elements"][0]["trajectory"]
        self.assertEqual(len(trajectory["keyframes"]), 5)
        self.assertEqual(len(trajectory["segments"]), 4)
        self.assertEqual([item["t"] for item in trajectory["keyframes"]], [0.0, 0.2, 0.5, 0.8, 1.0])
        self.assertIn("all 3 intermediate spatial markers", prompt)
        self.assertIn("skip an intermediate key", prompt)
        self.assertNotIn("mid_bbox_2d", structure["model_structure"]["elements"][0])

    def test_frontend_contract_has_duration_input_and_max_seven_keys(self):
        source = MULTIKEY_JS.read_text(encoding="utf-8")
        for required in (
            "DURATION_MIN = 5.0",
            "DURATION_MAX = 15.0",
            "DURATION_STEP = 0.5",
            "MAX_INTERMEDIATE_KEYS = 7",
            'badge.textContent = "MULTI-KEY EXPERIMENTAL"',
            'add.textContent = "+ Key"',
            'del.textContent = "Delete Key"',
            'duration.type = "number"',
            'version: 4',
            'keyframes',
        ):
            self.assertIn(required, source)

    def test_frontend_uses_normalized_key_time_and_piecewise_preview(self):
        source = MULTIKEY_JS.read_text(encoding="utf-8")
        self.assertIn("return points.sort((a, b) => a.time - b.time)", source)
        self.assertIn("interpolateBox(left.bbox, right.bbox", source)
        self.assertIn("canonical_time: \"normalized_0_1\"", source)
        self.assertIn("MIN_KEY_GAP_SECONDS / exp.duration", source)

    def test_frontend_canvas_interaction_engine_avoids_known_regressions(self):
        source = MULTIKEY_JS.read_text(encoding="utf-8")
        self.assertNotIn("controller.activeSlot =", source)
        self.assertNotIn("fitAndDraw", source)
        self.assertNotIn('canvas.addEventListener("pointerdown"', source)
        self.assertIn("canvas.onpointerdown = begin", source)
        self.assertIn("canvas.onpointermove = move", source)
        self.assertIn("requestAnimationFrame(flushLive)", source)
        self.assertIn('controller.canvas?.classList.remove("h3sc-timeline-preview-only")', source)
        self.assertIn("canEditTrack", source)

    def test_frontend_key_controls_are_intermediate_key_only(self):
        source = MULTIKEY_JS.read_text(encoding="utf-8")
        self.assertIn("function keyTimes(track)", source)
        self.assertIn("const times = keyTimes(track);", source)
        self.assertIn("exp.selectedSlot = slot;", source)
        self.assertIn("ui.prev.disabled = count === 0", source)
        self.assertIn("ui.next.disabled = count === 0", source)
        self.assertIn('if (point.kind === "key") {', source)
        self.assertIn("marker.onpointerdown = (event) => startMarkerDrag", source)
        self.assertIn("selectKey(controller, slot, ref.time)", source)
        self.assertIn('if (point.kind === "key") {\n      deleteKey(controller);', source)

    def test_key_marker_drag_prevents_stale_click_and_respects_neighbors(self):
        source = MULTIKEY_JS.read_text(encoding="utf-8")
        self.assertIn("const marker = event.currentTarget", source)
        self.assertIn("const rect = ui.layer.getBoundingClientRect()", source)
        self.assertIn("if (Math.abs(pendingX - startX) >= 2) moved = true", source)
        self.assertIn("marker.style.left = `${ref.time * 100}%`", source)
        self.assertIn("const lo = pos > 0 ? ordered[pos - 1].time + gap : gap", source)
        self.assertIn("const hi = pos < ordered.length - 1 ? ordered[pos + 1].time - gap : 1 - gap", source)


if __name__ == "__main__":
    unittest.main()
