from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = ROOT / "web" / "zzzzzzz_h3sc_experimental_persistence.js"


class ExperimentalPersistenceContractTests(unittest.TestCase):
    def test_prompter_draft_guard_preserves_slot_fields(self):
        source = JS.read_text(encoding="utf-8")
        self.assertIn('"description", "exact_text", "custom_behavior"', source)
        self.assertIn("restoreLostPromptDraft", source)
        self.assertIn('current.motion = "start_end"', source)

    def test_resize_preserves_timeline_tracks_in_normalized_space(self):
        source = JS.read_text(encoding="utf-8")
        self.assertIn("snapshotTracks", source)
        self.assertIn("restoreTracks", source)
        self.assertIn("sizeChanged", source)

    def test_experimental_axis_is_normalized_0_1000(self):
        source = JS.read_text(encoding="utf-8")
        self.assertIn("const ticks = [0, 250, 500, 750, 1000]", source)
        self.assertIn("tick / 1000 * width", source)
        self.assertIn("tick / 1000 * height", source)

    def test_mp4_workflow_round_trip_hooks_exist(self):
        source = JS.read_text(encoding="utf-8")
        self.assertIn("/h3_structured_canvas/embed_mp4_metadata", source)
        self.assertIn("execution_start", source)
        self.assertIn("collectMp4Outputs", source)
        self.assertIn("extractMetadataFromMp4", source)
        self.assertIn("loadGraphData(metadata.workflow)", source)


if __name__ == "__main__":
    unittest.main()
