from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIMELINE = ROOT / "web" / "zzzzz_h3sc_timeline_experimental.js"
TEST = ROOT / "tests" / "test_experimental_persistence.py"
MANIFEST = ROOT / "PACKAGE_MANIFEST.sha256"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old in text:
        if text.count(old) != 1:
            raise RuntimeError(f"{label}: expected exactly one source anchor")
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise RuntimeError(f"{label}: source anchor not found")


def canonical_sha(path: Path) -> str:
    data = path.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(data).hexdigest()


def update_manifest(paths: list[str]) -> None:
    hashes = {path: canonical_sha(ROOT / path) for path in paths}
    lines = MANIFEST.read_text(encoding="utf-8").splitlines()
    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        if not line.strip():
            output.append(line)
            continue
        _digest, relative = line.split("  ", 1)
        if relative in hashes:
            output.append(f"{hashes[relative]}  {relative}")
            seen.add(relative)
        else:
            output.append(line)
    missing = set(paths) - seen
    if missing:
        raise RuntimeError(f"manifest entries missing: {sorted(missing)}")
    MANIFEST.write_text("\n".join(output) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    source = TIMELINE.read_text(encoding="utf-8")

    old_state = 'controller.state.camera = { motion: "Static Shot", speed: "auto", amplitude: "auto" }; controller.state.soundscape = ""; controller.state.music = ""; controller.state.custom_instruction = "";'
    new_state = 'controller.state.camera = { motion: "Static Shot", speed: "auto", amplitude: "auto" }; controller.state.custom_instruction = "";'
    source = replace_once(source, old_state, new_state, "audio state preservation")

    old_dom = 'scroll.querySelectorAll(":scope > .h3sc-card, :scope > details.h3sc-details").forEach((element) => element.remove());'
    new_dom = '''scroll.querySelectorAll(":scope > .h3sc-card").forEach((element) => element.remove());
  scroll.querySelectorAll(":scope > details.h3sc-details").forEach((element) => {
    const title = element.querySelector(":scope > summary")?.textContent?.trim();
    if (title !== "AUDIO / OPTIONAL" && title !== "音声 / 任意") element.remove();
  });'''
    source = replace_once(source, old_dom, new_dom, "audio details visibility")
    TIMELINE.write_text(source, encoding="utf-8", newline="\n")

    tests = TEST.read_text(encoding="utf-8")
    method = '''    def test_audio_optional_is_restored_and_persisted(self):
        source = TIMELINE_JS.read_text(encoding="utf-8")
        self.assertNotIn('controller.state.soundscape = "";', source)
        self.assertNotIn('controller.state.music = "";', source)
        self.assertIn('title !== "AUDIO / OPTIONAL" && title !== "音声 / 任意"', source)
        self.assertIn('controller.state.custom_instruction = "";', source)
        self.assertIn('controller.state.camera = { motion: "Static Shot", speed: "auto", amplitude: "auto" }', source)
        self.assertIn('scroll.querySelectorAll(":scope > .h3sc-card")', source)

'''
    if "def test_audio_optional_is_restored_and_persisted" not in tests:
        anchor = "    def test_workflow_reload_is_authoritative_for_prompt_and_layout(self):\n"
        if anchor not in tests:
            raise RuntimeError("test insertion anchor not found")
        tests = tests.replace(anchor, method + anchor, 1)
        TEST.write_text(tests, encoding="utf-8", newline="\n")

    update_manifest([
        "web/zzzzz_h3sc_timeline_experimental.js",
        "tests/test_experimental_persistence.py",
    ])


if __name__ == "__main__":
    main()
