from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "web" / "zz_h3sc_output_migration.js").read_text(encoding="utf-8")


class LegacyOutputMigrationContractTests(unittest.TestCase):
    def test_canvas_legacy_four_output_signature_is_detected(self):
        self.assertIn('outputs.length >= 4', SOURCE)
        self.assertIn('outputs[1]?.type === "STRING"', SOURCE)
        self.assertIn('outputs[2]?.type === "INT"', SOURCE)
        self.assertIn('outputs[3]?.type === "INT"', SOURCE)

    def test_canvas_width_and_height_links_are_remapped(self):
        self.assertIn('{ 2: 1, 3: 2 }', SOURCE)
        self.assertIn('publicOutput(width, "width", "INT"', SOURCE)
        self.assertIn('publicOutput(height, "height", "INT"', SOURCE)

    def test_legacy_debug_outputs_are_removed(self):
        self.assertIn('removeLink', SOURCE)
        self.assertIn('migrateLegacyPrompterOutputs', SOURCE)
        self.assertIn('publicOutput(prompt, "prompt", "STRING"', SOURCE)

    def test_migration_runs_after_configure_and_connections(self):
        self.assertIn('scheduleMigration(this, nodeData.name)', SOURCE)
        self.assertIn('onConfigure', SOURCE)
        self.assertIn('onConnectionsChange', SOURCE)

    def test_live_output_slots_are_never_written_into_serialized_workflow(self):
        self.assertIn('function publicOutput(', SOURCE)
        self.assertIn('return {', SOURCE)
        self.assertIn('name,', SOURCE)
        self.assertIn('type,', SOURCE)
        self.assertIn('links: links.filter', SOURCE)
        self.assertNotIn('info.outputs = this.outputs.map', SOURCE)
        self.assertNotIn('{ ...output', SOURCE)


if __name__ == "__main__":
    unittest.main()
