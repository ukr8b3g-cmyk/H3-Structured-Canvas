# Validation and known limitations

## Backend validation

- Canvas width/height: `64–16384`
- Coordinates: clamped to `0–1000`
- Format: normalized `xyxy`
- Reversed coordinates: reordered safely
- Degenerate boxes: discarded
- Duplicate slots: last value wins with warning
- Text and description length limits
- Enum allowlists for Type, Motion, Camera and compiler options
- Invalid JSON: safe defaults, no code execution

## Warnings in JSON_DEBUG

Warnings include missing descriptions, Text without Exact Text, missing End Canvas, aspect mismatch, empty compiled layouts, and very small boxes.

## Model-side limitations

- BBOX is not a pixel-exact constraint
- Vertical placement may be overridden by natural scene composition
- Crossing trajectories depend on aspect ratio, spacing and scene complexity
- Semantic animation order is more reliable than exact timestamps
- Numeric depth is intentionally excluded


## Package validation status

Validated for this archive:

- Python bytecode compilation: PASS
- Python unit tests: 20 PASS
- Semantic-motion subtests: 15 PASS
- JavaScript syntax (`node --check`): PASS
- Frontend extension registration smoke test: PASS
- ComfyUI-style package import with node mappings and preset-route registration: PASS
- Example and workflow JSON parsing: PASS

A full interactive browser session inside a real ComfyUI installation was not available in the packaging environment. The first live check should therefore confirm DOM rendering, workflow save/reload, Canvas-to-Prompter connection, and user-preset persistence before public release.
