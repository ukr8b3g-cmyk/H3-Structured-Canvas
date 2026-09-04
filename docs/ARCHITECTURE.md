# Architecture

## Responsibility split

```text
Canvas UI
  -> H3_LAYOUT
  -> optional H3 Layout Transition
  -> Structured Prompter
  -> STRING prompt
  -> MiniMax H3 / Continuum
```

The package does not patch H3 attention, latent tensors, or the text encoder.

## Canvas

The browser UI stores its state in a hidden `layout_json` widget. That widget is internal only and is removed from the visible node surface. The backend sanitizes it into `H3_LAYOUT` with normalized 0–1000 `xyxy` boxes.

## Transition

`H3 Layout Transition` combines two ordinary Canvas layouts. The output remains type `H3_LAYOUT` and contains a sanitized `transition.end_boxes` payload. This keeps the ordinary Prompter input simple: one `layout` socket whether the workflow is static or Start/End.

## Prompter

The browser UI stores semantic authoring state in a hidden `config_json` widget. The backend compiles:

- scene description;
- stable element IDs;
- Subject/Object/Text/Graphic authoring categories;
- BBOX spatial hints;
- semantic animation;
- exact visible text safeguards;
- camera and optional audio instructions.

Subject and Object are authoring categories only. The verified model-facing structured block maps both to `type:"obj"`.

## Public sockets

Canvas:

```text
layout: H3_LAYOUT
width: INT
height: INT
```

Transition:

```text
start_layout + end_layout -> layout: H3_LAYOUT
```

Prompter:

```text
layout -> prompt: STRING
```

Debug/config JSON remains internal to avoid ambiguous sockets with no normal downstream consumer.
