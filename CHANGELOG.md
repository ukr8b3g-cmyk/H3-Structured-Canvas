# Changelog

## 0.9.2-beta.3

- Removed Duration/length control from Structured Prompter. Generation duration now belongs to Core H3 / Continuum.
- Simplified public sockets:
  - Canvas: `layout / width / height`
  - Prompter: `prompt`
- Removed public `layout_json / H3_STRUCTURE / JSON_DEBUG` sockets.
- Moved Start/End handling into new `H3 Layout Transition` helper node.
- Motion default changed from `Static` to `None`.
- Added explicit `Hold Position` separate from no motion instruction.
- Added semantic movement in four directions and top/bottom slide-in options.
- Renamed UI `Phase` to `Order`; shown only when an ordered animation needs it.
- Exact Text is shown only for Text elements.
- Value is shown only for value-driven Graphic effects.
- Description box expanded and Type/Motion/Order moved into a compact adjacent row.
- Split optional audio, extra prompt options, and developer/experimental controls into clear collapsed sections.
- Hardened hidden native widget handling to prevent raw JSON text bleeding through the custom UI.
- Made DOM widget height track node resize to prevent the UI from extending below the node body.
- Preserved legacy workflow migration for `Auto`, `Static`, `Phase`, `slide_up`, and `slide_down`.
- Subject/Object authoring categories continue to compile to model-facing `type:"obj"`.

## 0.9.1-beta.2

- Added model-facing Subject/Object compatibility mapping to `type:"obj"`.
- Added full-frame/no-letterbox reinforcement.
- Added initial length conversion experiment (removed again in 0.9.2 for Continuum compatibility).

## 0.9.0-beta.1

- Initial test release.
