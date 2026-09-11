from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIMELINE_JS = ROOT / "web" / "zzzzz_h3sc_timeline_experimental.js"
MP4_JS = ROOT / "web" / "zzzzzz_h3sc_mp4_metadata.js"


class ExperimentalPersistenceContractTests(unittest.TestCase):
    def test_prompter_uses_native_config_json_lifecycle_persistence(self):
        source = TIMELINE_JS.read_text(encoding="utf-8")
        for required in (
            'findWidget(node, "config_json")',
            "setWidgetSerialized(widget)",
            "h3scPromptState",
            "node.serialize",
            'document.addEventListener("pointerdown", snapshot, true)',
            'window.addEventListener("beforeunload", snapshot, true)',
            'document.addEventListener("visibilitychange"',
            "graphToPrompt",
            "queuePrompt",
        ):
            self.assertIn(required, source)

    def test_workflow_reload_is_authoritative_for_prompt_and_layout(self):
        source = TIMELINE_JS.read_text(encoding="utf-8")
        self.assertIn("configuredRaw", source)
        self.assertIn("loadCanvasFromRaw", source)
        self.assertIn("controller.reloadFromWidgets", source)
        self.assertIn("widget.value = configuredRaw", source)

    def test_resize_keeps_normalized_tracks_as_authoritative_state(self):
        source = TIMELINE_JS.read_text(encoding="utf-8")
        self.assertIn("serializedLayout(controller)", source)
        self.assertIn("exp.tracks[slot]", source)
        self.assertIn("controller.state.canvas.width", source)
        self.assertIn("controller.state.canvas.height", source)
        self.assertNotIn("snapshotTracks", source)
        self.assertNotIn("restoreTracks", source)

    def test_experimental_axis_keeps_visible_frame_0_1000(self):
        source = TIMELINE_JS.read_text(encoding="utf-8")
        self.assertIn("[0, 250, 500, 750, 1000]", source)
        self.assertIn("toPixel(0, width)", source)
        self.assertIn("toPixel(1000, width)", source)

    def test_mp4_workflow_round_trip_is_isolated(self):
        source = MP4_JS.read_text(encoding="utf-8")
        self.assertIn("/h3_structured_canvas/embed_mp4_metadata", source)
        self.assertIn("execution_start", source)
        self.assertIn("collectMp4Outputs", source)
        self.assertIn("extractMetadataFromMp4", source)
        self.assertIn("loadGraphData(metadata.workflow)", source)
        self.assertNotIn("CANVAS_NODE", source)
        self.assertNotIn("PROMPTER_NODE", source)


if __name__ == "__main__":
    unittest.main()
