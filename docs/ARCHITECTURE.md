# Architecture

```text
Browser Canvas UI
  ↓ hidden layout_json widget
H3StructuredCanvas (Python)
  ↓ sanitized H3_LAYOUT dictionary
H3StructuredPrompter (Python)
  ├─ verified_split_bbox serializer
  ├─ qwen_unified_bbox2d serializer
  ├─ resolved semantic summary
  └─ validation warnings
  ↓
H3_PROMPT (STRING)
```

## Design boundaries

The package does not modify MiniMax H3 attention, position IDs, conditioning tensors, samplers, or latent data. BBOX values remain prompt tokens and therefore act as soft semantic hints.

Frontend state is persisted through ordinary ComfyUI widgets (`layout_json`, `config_json`). The visible DOM widgets are presentation layers only. This keeps workflow serialization and API execution deterministic.

## IDs

UI colors map to internal slots only:

```text
Red → A
Blue → B
Yellow → C
Green → D
Magenta → E
```

The compiler emits semantic model IDs such as `subject_a`, `object_b`, `text_c`, and `graphic_d`. Color names are not included in the model prompt.

## Presets

Preset routes accept only `canvas` or `prompter`, enforce JSON-object payloads and size limits, and write through a temporary file followed by an atomic replace.
