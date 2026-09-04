from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / "web" / "h3_structured_canvas.js").read_text(encoding="utf-8")


class FrontendContractTests(unittest.TestCase):
    def test_duration_is_not_part_of_prompter_state(self):
        self.assertNotIn("duration_seconds:", JS)

    def test_raw_native_widgets_are_dom_hidden(self):
        self.assertIn('node.style.display = "none"', JS)
        self.assertIn('node.style.pointerEvents = "none"', JS)

    def test_motion_default_and_vertical_directions_exist(self):
        self.assertIn('motion: "none"', JS)
        self.assertIn('"move_top_bottom"', JS)
        self.assertIn('"move_bottom_top"', JS)
        self.assertIn('"slide_in_top"', JS)
        self.assertIn('"slide_in_bottom"', JS)

    def test_prompter_public_footer_is_prompt_only(self):
        self.assertIn('make("span","h3sc-pill","PROMPT")', JS)
        self.assertNotIn('make("span", "h3sc-pill", "H3_STRUCTURE")', JS)
        self.assertNotIn('make("span", "h3sc-pill", "JSON_DEBUG")', JS)


if __name__ == "__main__":
    unittest.main()
