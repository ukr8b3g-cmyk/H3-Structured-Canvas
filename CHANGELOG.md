# Changelog

## 0.9.1-beta.2

- Added real H3 `length` output derived from Duration (`17k + 5` frame grid at 24fps)
- Model-facing Subject/Object now serialize as verified `type: "obj"`
- Auto fallback treats A/B as Subject and C-E as Object for old saved workflows
- Added full-frame / no-letterbox prompt reinforcement
- Compact conditional Prompter UI: Exact Text, Value and Phase appear only when relevant
- Removed Auto from the normal Type selector while retaining backward compatibility
- Canonical GitHub repository is now the update source

## 0.9.0-beta.1

- Initial standalone package
- Interactive five-slot normalized BBOX Canvas
- Canvas draw/move/resize/delete operations
- Resolution, grid, built-in and custom presets
- Optional external width/height override
- Structured Prompter for Subject/Object/Text/Graphic
- Exact Text guard and additional-text suppression
- Static, Start-End, semantic text and infographic motion modes
- Ordered motion phases and H3 camera presets
- Direct and H3 Context Envelope output formats
- Verified `bbox` and Experimental Qwen `bbox_2d` schema profiles
- Hybrid JSON + resolved natural-language compiler
- JSON debug and typed structure outputs
- Atomic server-side preset storage with localStorage fallback
- Python input validation, length limits, coordinate clamping, warnings
- 20 unit tests, 15 motion subtests, JavaScript syntax validation, frontend registration smoke validation, and ComfyUI import smoke validation
