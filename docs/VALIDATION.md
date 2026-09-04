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
- Duration: converted to H3 `17k+5` frame grid at 24fps

## Warnings in JSON_DEBUG

Warnings include missing descriptions, Text without Exact Text, missing End Canvas, aspect mismatch, empty compiled layouts, and very small boxes.

## Model-side limitations

- BBOX is not a pixel-exact constraint
- Vertical placement may be overridden by natural scene composition
- Crossing trajectories depend on aspect ratio, spacing and scene complexity
- Semantic animation order is more reliable than exact timestamps
- Numeric depth is intentionally excluded
- Full-frame / no-letterbox is prompt reinforcement, not a hard decoder crop

## Package validation status

Validated for v0.9.1-beta.2:

- Python bytecode compilation: PASS
- Python unit tests: 21 PASS
- Semantic-motion subtests: 15 PASS
- JavaScript syntax: PASS
- Example/workflow JSON parsing: PASS

The first live check after `git pull` should confirm DOM rendering, workflow save/reload, Canvas-to-Prompter connection, `length` connection to Core H3, and user-preset persistence.
