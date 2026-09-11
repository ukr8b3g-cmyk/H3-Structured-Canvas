# 3-Slot Timeline Experimental — Fixed 3-Point Gate

This branch is an experimental UI/conditioning gate for H3 Structured Canvas.
It does not replace the production UI on `main`.

## Scope

- Visible Canvas slots: A (red), B (blue), C (yellow)
- D/E remain schema-compatible but are hidden from the experiment UI
- One global seek bar controls all three visible slots
- Duration: fixed 5.0 seconds
- Time domain: normalized 0.0–1.0
- Editable key points:
  - START = 0.00s / t=0.0
  - MID = 2.50s / t=0.5
  - END = 5.00s / t=1.0
- Interpolation: piecewise linear only
  - START → MID
  - MID → END
- Intermediate playhead positions are preview-only
- Play/stop preview runs only in the frontend; it does not execute ComfyUI sampling

## Editing contract

A newly created slot is initialized with the same completed BBOX at START, MID, and END regardless of which edit point created it. After creation, START, MID, and END are independent.

MID has two states:

1. **Derived MID** — if the user has never edited MID, it is always calculated as the 50% interpolation between START and END. This preserves exact compatibility with the previous two-point linear timeline.
2. **Explicit MID** — after the user edits the BBOX at 2.50s, MID becomes an independent saved key point.

There is no linked/origin-endpoint state machine in the three-point implementation.

## Canvas UI reductions

- Canvas Size stays above the Canvas
- Show Boxes is removed; boxes are always visible
- Reset Canvas is hidden in this experiment
- Draw Box remains an explicit Draw / Move mode
- Delete Active is renamed Delete Selected
- D/E slot buttons are hidden
- The empty-BBOX warning is not rendered in the Experimental UI so node height remains stable while editing
- Malformed internal JSON warnings remain visible

## Prompter UI reductions

Only Scene / Background and slots A/B/C are shown.

Hidden for the experiment:

- Prompt Preset
- D/E cards
- Camera
- Audio / Optional
- More Prompt Options
- Developer / Experimental controls

A/B/C motion remains locked to Start → End so the existing transition compiler path remains authoritative. D/E are disabled in the prompt configuration. Hidden camera/audio/more-prompt values are neutralized for test isolation.

## Serialization

The existing public transition contract is preserved:

- `boxes` = START boxes
- `transition.end_boxes` = END boxes

The fixed midpoint is stored only in Experimental metadata:

- `timeline_experimental.version` = 3
- `timeline_experimental.interpolation` = `piecewise_linear`
- `timeline_experimental.mid_time` = 0.5
- `timeline_experimental.mid_boxes` = only explicitly edited MID boxes

If a slot has no entry in `mid_boxes`, MID remains derived from START and END and the result is identical to the previous two-point linear trajectory.

## Compiler contract

The existing model-facing `start_bbox` / `end_bbox` fields remain unchanged. The experiment does **not** invent an unverified `mid_bbox_2d` model field.

For an explicit MID, the compiler adds semantic trajectory information to the element:

- interpolation = piecewise_linear
- keyframes = START / MID / END
- mid_bbox and mid_time inside trajectory semantics
- separate START→MID and MID→END segment analysis
- natural-language reinforcement requiring the subject to pass through MID around the temporal midpoint and not shortcut directly from START to END

This remains semantic text conditioning, not hard spatial control.

## Compatibility

Older two-point Experimental workflows remain valid. If they contain START and END but no explicit MID metadata, the frontend derives MID at 50% and the backend keeps the original two-point semantics.

## First GPU gate

Use A only with a clearly non-linear path:

- START: lower-left
- MID: upper-center
- END: lower-right
- Camera: Static

PASS requires the generated subject to visibly travel through the upper-center region rather than shortcut directly from START to END.

A second gate should test scale:

- START: small
- MID: large
- END: small

## Explicitly out of scope

- Arbitrary keyframe times
- More than one MID keyframe
- Auto Key
- Bezier/easing curves
- Per-track time ranges
- Camera/audio timelines
- 5-slot timeline UI
- Production promotion
