# Install

## Git clone

From the ComfyUI custom nodes directory:

```bash
git clone https://github.com/ukr8b3g-cmyk/H3-Structured-Canvas.git ComfyUI-H3-Structured-Canvas
```

Restart ComfyUI completely.

## Update

```bash
cd ComfyUI/custom_nodes/ComfyUI-H3-Structured-Canvas
git pull
```

Restart ComfyUI after pulling updates.

## Nodes

```text
🧭 H3 Structured Canvas
↔ H3 Layout Transition
🧩 H3 Structured Prompter
```

The Transition node is optional and is needed only for Start → End spatial trajectory workflows.

## Basic workflow

```text
Canvas.layout → Prompter.layout
Canvas.width  → MiniMax H3 width
Canvas.height → MiniMax H3 height
Prompter.prompt → MiniMax H3 / Continuum prompt
```

Duration is intentionally not controlled by this package. Configure duration/length in the generation workflow or Continuum.
