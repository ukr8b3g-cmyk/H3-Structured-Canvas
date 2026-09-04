# Validation and known limitations

## Backend validation

- Canvas width/height: `64–16384`
- BBOX coordinates are clamped to `0–1000`
- BBOX order is normalized to `x1 < x2`, `y1 < y2`
- duplicate slots use the final value with a warning
- legacy UI colors and model-style IDs are normalized to A–E slots
- Text without Exact Text is skipped with a warning
- empty non-Text descriptions are skipped with a warning
- Start → End without a Transition layout falls back to the start BBOX with a warning
- mismatched Start/End aspect ratios emit a warning

## Backward compatibility

Saved beta workflows are migrated as follows:

- `Auto` -> Subject for A/B, Object for C/D/E
- `Static` -> `None`
- `Phase` -> `Order`
- `slide_up` -> Slide In from Bottom
- `slide_down` -> Slide In from Top
- obsolete `duration_seconds` is ignored

## Frontend safeguards

- internal `layout_json` / `config_json` native widgets are visually hidden at the DOM level
- node UI uses its own scroll region
- DOM widget height follows node resizing
- Exact Text / Value / Order are conditionally shown only when relevant

## Model limitations

Structured BBOX is soft text-conditioning guidance, not a hard spatial mask.

Observed behavior to date:

- horizontal placement can be strong
- relative size can be strong
- vertical placement can be weaker
- Start/End trajectory can work but is composition-dependent
- semantic text/graphic animation can work well
- numeric `depth`/`z` has not been validated
- exact frame-by-frame interpolation is not guaranteed
