# 3-Slot Timeline Experimental V1

This branch is an experimental UI/conditioning gate for H3 Structured Canvas.
It does not replace the production UI on `main`.

## Scope

- Visible Canvas slots: A (red), B (blue), C (yellow)
- D/E remain schema-compatible but are hidden from the experiment UI
- One global seek bar controls all three visible slots
- Duration: fixed 5.0 seconds
- Time domain: normalized 0.0–1.0
- Interpolation: linear only
- Editable points: Start (0.00s) and End (5.00s)
- Intermediate playhead positions are preview-only
- Play/stop preview runs only in the frontend; it does not execute ComfyUI sampling

## Canvas UI reductions

- Canvas Size moves above the Canvas
- Canvas Preset is hidden
- Show Boxes is removed; boxes are always visible
- Reset Canvas is hidden in this experiment
- Draw Box becomes an explicit Draw / Move mode
- Delete Active is renamed Delete Selected
- D/E slot buttons are hidden

## Prompter UI reductions

Only Scene / Background and slots A/B/C are shown.

Hidden for the experiment:

- Prompt Preset
- D/E cards
- Camera
- Audio / Optional
- More Prompt Options
- Developer / Experimental controls

A/B/C motion is locked to Start → End so the embedded Canvas transition is consumed by the existing compiler path. D/E are disabled in the prompt configuration. Hidden camera/audio/more-prompt values are neutralized for test isolation.

## Serialization

The frontend stores the experiment as a normal H3 layout plus the already-supported transition payload:

- `boxes` = Start boxes
- `transition.end_boxes` = End boxes
- `timeline_experimental` = frontend-only metadata

The Python schema intentionally ignores `timeline_experimental`; the existing transition contract remains authoritative for H3 prompt compilation.

## First GPU/behavior gate

Use three independent trajectories:

- A: left → right
- B: right → left
- C: top → bottom

Check the Canvas at 0%, 25%, 50%, 75%, and 100% and verify that all three boxes share the same playhead while remaining independent.

PASS requires:

1. Manual seek and Play preview produce the same coordinates at equivalent times.
2. Editing A at an endpoint does not mutate B/C endpoint data.
3. Intermediate positions cannot mutate Start/End data.
4. A/B/C compile through the existing `start_bbox` / `end_bbox` path.
5. D/E and hidden prompt controls do not affect the experimental prompt.

## Explicitly out of scope

- Multi-keyframe editing
- Auto Key
- Bezier/easing curves
- Per-track time ranges
- Camera/audio timelines
- 5-slot timeline UI
- Production promotion
