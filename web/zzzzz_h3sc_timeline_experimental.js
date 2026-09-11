const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.consolidated";
const VISIBLE_SLOTS = ["a", "b", "c"];
const HIDDEN_SLOTS = ["d", "e"];
const SLOT_COLORS = { a: "#ef4444", b: "#3b82f6", c: "#facc15" };
const SLOT_LABELS = { a: "A", b: "B", c: "C" };
const DURATION_SECONDS = 5.0;
const MID_TIME = 0.5;
const EDIT_EPSILON = 0.0005;
const VIEW_MIN = -100;
const VIEW_MAX = 1100;
const VIEW_SPAN = VIEW_MAX - VIEW_MIN;
const INTERNAL_MIN = -1000;
const INTERNAL_MAX = 2000;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function findWidget(node, name) {
  return node?.widgets?.find((widget) => widget?.name === name) ?? null;
}

function setWidgetSerialized(widget) {
  if (!widget) return;
  widget.serialize = true;
  widget.options = widget.options || {};
  widget.options.serialize = true;
}

function setWidgetValue(widget, value, node) {
  if (!widget) return;
  widget.value = value;
  setWidgetSerialized(widget);
  widget.callback?.(value, app?.canvas, node, [0, 0], null);
  node?.setDirtyCanvas?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
}

function simplifiedAspect(width, height) {
  const w = Math.max(1, Math.round(Number(width) || 1));
  const h = Math.max(1, Math.round(Number(height) || 1));
  const ratio = w / h;
  const canonical = [[1, 1], [16, 9], [9, 16], [4, 3], [3, 4], [3, 2], [2, 3], [21, 9], [9, 21]];
  let best = canonical[0];
  let bestError = Infinity;
  for (const candidate of canonical) {
    const target = candidate[0] / candidate[1];
    const error = Math.abs(ratio - target) / target;
    if (error < bestError) {
      best = candidate;
      bestError = error;
    }
  }
  if (bestError <= 0.025) return `${best[0]}:${best[1]}`;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}

function normalizeBox(raw, slot) {
  if (!raw || typeof raw !== "object") return null;
  const source = raw.bbox_2d ?? raw.bbox;
  if (!Array.isArray(source) || source.length !== 4) return null;
  let values = source.map(Number);
  if (!values.every(Number.isFinite)) return null;
  if (Math.max(...values.map(Math.abs)) <= 1.000001) values = values.map((value) => value * 1000);
  let [x1, y1, x2, y2] = values.map((value) => clamp(value, INTERNAL_MIN, INTERNAL_MAX));
  [x1, x2] = x1 <= x2 ? [x1, x2] : [x2, x1];
  [y1, y2] = y1 <= y2 ? [y1, y2] : [y2, y1];
  if (x2 - x1 < 1 || y2 - y1 < 1) return null;
  return {
    slot,
    ui_color: { a: "red", b: "blue", c: "yellow", d: "green", e: "magenta" }[slot] ?? "red",
    bbox_2d: [x1, y1, x2, y2].map((value) => Math.round(value)),
  };
}

function boxMap(items) {
  const result = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const slot = String(item?.slot ?? "").trim().toLowerCase();
    if (![...VISIBLE_SLOTS, ...HIDDEN_SLOTS].includes(slot)) continue;
    const box = normalizeBox(item, slot);
    if (box) result.set(slot, box);
  }
  return result;
}

function cloneBox(box) {
  return box ? { ...box, bbox_2d: [...box.bbox_2d] } : null;
}

function interpolateBox(start, end, t, slot) {
  if (!start && !end) return null;
  if (!start) return cloneBox(end);
  if (!end) return cloneBox(start);
  return normalizeBox({
    bbox_2d: start.bbox_2d.map((value, index) => value + (end.bbox_2d[index] - value) * t),
  }, slot);
}

function editPointName(t) {
  const value = Number(t);
  if (value <= EDIT_EPSILON) return "start";
  if (Math.abs(value - MID_TIME) <= EDIT_EPSILON) return "mid";
  if (value >= 1 - EDIT_EPSILON) return "end";
  return null;
}

function isEditPoint(t) {
  return editPointName(t) !== null;
}

function trackIsEmpty(track) {
  return !track?.start && !track?.mid && !track?.end;
}

function effectiveMid(track, slot) {
  if (!track) return null;
  if (track.midExplicit && track.mid) return cloneBox(track.mid);
  return interpolateBox(track.start, track.end, MID_TIME, slot);
}

function previewBox(track, t, slot) {
  if (!track) return null;
  const mid = effectiveMid(track, slot);
  if (t <= MID_TIME) return interpolateBox(track.start, mid, t / MID_TIME, slot);
  return interpolateBox(mid, track.end, (t - MID_TIME) / (1 - MID_TIME), slot);
}

function buildExperimentState(controller, rawValue) {
  const raw = parseObject(rawValue);
  const timeline = parseObject(raw.timeline_experimental);
  const starts = boxMap(raw.boxes ?? raw.layout?.boxes ?? controller.state?.boxes ?? []);
  const ends = boxMap(raw.transition?.end_boxes ?? []);
  const mids = boxMap(timeline.mid_boxes ?? []);
  const tracks = {};
  for (const slot of VISIBLE_SLOTS) {
    const start = starts.get(slot) ?? null;
    const end = ends.get(slot) ?? start;
    const mid = mids.get(slot) ?? null;
    tracks[slot] = {
      start: cloneBox(start ?? end),
      mid: cloneBox(mid),
      end: cloneBox(end ?? start),
      midExplicit: Boolean(mid),
    };
  }
  const hiddenTracks = {};
  for (const slot of HIDDEN_SLOTS) {
    const start = starts.get(slot) ?? null;
    const end = ends.get(slot) ?? start;
    hiddenTracks[slot] = { start: cloneBox(start ?? end), end: cloneBox(end ?? start) };
  }
  return {
    version: 3,
    duration: Number(timeline.duration_seconds) || DURATION_SECONDS,
    t: 0,
    tracks,
    hiddenTracks,
    playing: false,
    raf: 0,
    ui: null,
    selectedSlot: null,
  };
}

function serializedLayout(controller) {
  const exp = controller.__h3scTimelineExp;
  const canvas = {
    ...(controller.state?.canvas ?? {}),
    width: clamp(Math.round(Number(controller.state?.canvas?.width) || 1024), 64, 16384),
    height: clamp(Math.round(Number(controller.state?.canvas?.height) || 1024), 64, 16384),
    show_boxes: true,
  };
  canvas.aspect_ratio = simplifiedAspect(canvas.width, canvas.height);
  if (!VISIBLE_SLOTS.includes(canvas.active_slot)) canvas.active_slot = "a";

  const startBoxes = [];
  const midBoxes = [];
  const endBoxes = [];
  for (const slot of VISIBLE_SLOTS) {
    const track = exp.tracks[slot];
    if (track?.start) startBoxes.push(cloneBox(track.start));
    if (track?.midExplicit && track.mid) midBoxes.push(cloneBox(track.mid));
    if (track?.end) endBoxes.push(cloneBox(track.end));
  }
  for (const slot of HIDDEN_SLOTS) {
    const track = exp.hiddenTracks?.[slot];
    if (track?.start) startBoxes.push(cloneBox(track.start));
    if (track?.end) endBoxes.push(cloneBox(track.end));
  }
  return {
    schema: controller.state?.schema ?? "h3_structured_canvas/0.9",
    canvas,
    boxes: startBoxes,
    transition: { end_canvas: clone(canvas), end_boxes: endBoxes },
    timeline_experimental: {
      version: 3,
      slots: ["a", "b", "c"],
      duration_seconds: exp.duration,
      interpolation: "piecewise_linear",
      canonical_time: "normalized_0_1",
      mid_time: MID_TIME,
      mid_boxes: midBoxes,
      coordinate_space: "normalized_0_1000_with_offscreen_overscan",
    },
  };
}

function applyPreview(controller, draw = true) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  const preview = [];
  for (const slot of VISIBLE_SLOTS) {
    const box = previewBox(exp.tracks[slot], exp.t, slot);
    if (box) preview.push(box);
  }
  controller.state.canvas.show_boxes = true;
  controller.state.boxes = preview;
  updateTimelineUI(controller);
  if (draw) controller.fitAndDraw?.();
}

function writeExperimentalState(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  controller.state.canvas.width = clamp(Math.round(Number(controller.state.canvas.width) || 1024), 64, 16384);
  controller.state.canvas.height = clamp(Math.round(Number(controller.state.canvas.height) || 1024), 64, 16384);
  controller.state.canvas.aspect_ratio = simplifiedAspect(controller.state.canvas.width, controller.state.canvas.height);
  controller.state.canvas.show_boxes = true;
  if (!VISIBLE_SLOTS.includes(controller.state.canvas.active_slot)) controller.state.canvas.active_slot = "a";
  setWidgetValue(controller.widthWidget, controller.state.canvas.width, controller.node);
  setWidgetValue(controller.heightWidget, controller.state.canvas.height, controller.node);
  setWidgetValue(controller.stateWidget, JSON.stringify(serializedLayout(controller)), controller.node);
  controller.updateControls?.();
  applyPreview(controller);
}

function setEditPointBox(controller, slot, rawBox) {
  const exp = controller.__h3scTimelineExp;
  const point = editPointName(exp?.t);
  const box = normalizeBox({ bbox_2d: rawBox }, slot);
  if (!exp || !point || !box || !VISIBLE_SLOTS.includes(slot)) return false;
  const track = exp.tracks[slot] ?? (exp.tracks[slot] = { start: null, mid: null, end: null, midExplicit: false });
  const creatingNewTrack = controller.drag?.mode === "draw" && controller.drag?.creatingNewTrack;

  // A new slot is initialized identically at START/MID/END regardless of which
  // edit point created it. During a brand-new draw, every pointermove updates the shared initial geometry;
  // pointerup supplies the authoritative final rectangle. After creation all three points are independent.
  if (creatingNewTrack || trackIsEmpty(track)) {
    track.start = cloneBox(box);
    track.mid = null;
    track.end = cloneBox(box);
    track.midExplicit = false;
  } else if (point === "start") {
    track.start = cloneBox(box);
  } else if (point === "mid") {
    track.mid = cloneBox(box);
    track.midExplicit = true;
  } else {
    track.end = cloneBox(box);
  }

  exp.selectedSlot = slot;
  controller.state.canvas.active_slot = slot;
  applyPreview(controller);
  return true;
}

function removeSlot(controller, slot) {
  const exp = controller.__h3scTimelineExp;
  if (!exp || !VISIBLE_SLOTS.includes(slot)) return;
  exp.tracks[slot] = { start: null, mid: null, end: null, midExplicit: false };
  exp.selectedSlot = null;
  applyPreview(controller, false);
  writeExperimentalState(controller);
}

function stopPlayback(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  exp.playing = false;
  if (exp.raf) cancelAnimationFrame(exp.raf);
  exp.raf = 0;
  updateTimelineUI(controller);
}

function setPlayhead(controller, value, { stop = true } = {}) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  if (stop) stopPlayback(controller);
  exp.t = clamp(Number(value) || 0, 0, 1);
  exp.selectedSlot = null;
  applyPreview(controller);
}

function startPlayback(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  if (exp.playing) { stopPlayback(controller); return; }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) { setPlayhead(controller, 1); return; }
  if (exp.t >= 1 - EDIT_EPSILON) exp.t = 0;
  exp.playing = true;
  const startT = exp.t;
  const startTime = performance.now();
  const tick = (now) => {
    if (!exp.playing) return;
    exp.t = clamp(startT + Math.max(0, now - startTime) / 1000 / exp.duration, 0, 1);
    applyPreview(controller);
    if (exp.t >= 1) { exp.playing = false; exp.raf = 0; updateTimelineUI(controller); return; }
    exp.raf = requestAnimationFrame(tick);
  };
  updateTimelineUI(controller);
  exp.raf = requestAnimationFrame(tick);
}

function ensureStyles() {
  if (document.getElementById("h3sc-timeline-consolidated-styles")) return;
  const style = document.createElement("style");
  style.id = "h3sc-timeline-consolidated-styles";
  style.textContent = `
.h3sc-exp-size-panel{background:#181a1b;border:1px solid #343738;border-radius:8px;padding:7px 8px}
.h3sc-exp-size-panel>.h3sc-section-title{margin-bottom:5px}
.h3sc-size-inline{display:grid;grid-template-columns:minmax(210px,1.7fr) minmax(88px,.5fr) minmax(88px,.5fr) auto;gap:8px;align-items:end}
.h3sc-size-inline .h3sc-field{min-width:0!important;margin:0!important}.h3sc-size-inline .h3sc-field-label{white-space:nowrap}.h3sc-size-inline .h3sc-btn{height:30px}
.h3sc-timeline-exp{background:#111314;border:1px solid #343738;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:7px;flex:0 0 auto}
.h3sc-timeline-exp-head{display:flex;align-items:center;gap:7px}.h3sc-timeline-exp-title{font-size:10.5px;font-weight:800;color:#48d5cf;text-transform:uppercase}.h3sc-timeline-exp-badge{font-size:9.5px;padding:2px 6px;border:1px solid #765e28;border-radius:999px;color:#e4b548;background:#211d13}.h3sc-timeline-exp-spacer{flex:1}.h3sc-timeline-exp-state{font-size:10px;color:#9ba1a2}
.h3sc-timeline-exp-controls{display:grid;grid-template-columns:auto 72px 84px minmax(150px,1fr) auto;gap:8px;align-items:center}.h3sc-timeline-exp-play{min-width:40px;height:30px}.h3sc-timeline-exp-time{font:800 16px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:#f0f6f6;text-align:right}.h3sc-timeline-time-input{width:84px;height:30px;background:#101213;color:#eee;border:1px solid #4b4f50;border-radius:5px;padding:4px 7px;font:700 13px/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-align:right}.h3sc-timeline-time-input:focus{outline:none;border-color:#48d5cf}.h3sc-timeline-exp-range{width:100%;accent-color:#48d5cf}.h3sc-timeline-exp-end{font:10.5px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:#8f9697}.h3sc-timeline-exp-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.h3sc-timeline-exp-slot{display:inline-flex;align-items:center;gap:4px;color:#cfd2d3;font-size:10px}.h3sc-timeline-exp-dot{width:9px;height:9px;border-radius:2px}.h3sc-timeline-exp-note{font-size:10px;color:#8f9697;margin-left:auto}.h3sc-timeline-exp-note.warning{color:#e4b548}.h3sc-timeline-preview-only{cursor:not-allowed!important}.h3sc-exp-prompter-note{font-size:10px;color:#e4b548;margin-left:auto}.h3sc-exp-motion-locked{opacity:.72}
@media(max-width:760px){.h3sc-size-inline{grid-template-columns:1fr 1fr}.h3sc-size-inline .h3sc-field:first-child{grid-column:1/-1}.h3sc-timeline-exp-controls{grid-template-columns:auto 64px 74px minmax(90px,1fr) auto}.h3sc-timeline-time-input{width:74px}}
`;
  document.head.append(style);
}

function toPixel(value, size) { return (value - VIEW_MIN) / VIEW_SPAN * size; }
function fromPixel(value, size) { return VIEW_MIN + value / Math.max(size, 1) * VIEW_SPAN; }

function drawFrame(ctx, width, height, grid) {
  const left = toPixel(0, width), top = toPixel(0, height), right = toPixel(1000, width), bottom = toPixel(1000, height);
  ctx.save();
  ctx.fillStyle = "#202526"; ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = "rgba(238,244,244,.78)"; ctx.lineWidth = 1.5; ctx.strokeRect(left + .5, top + .5, right - left - 1, bottom - top - 1);
  if (grid !== "none") {
    ctx.strokeStyle = "rgba(230,240,240,.20)"; ctx.lineWidth = 1;
    const values = grid === "quarters" ? [250, 500, 750] : grid === "cross" ? [500] : [1000 / 3, 2000 / 3];
    for (const value of values) {
      const x = toPixel(value, width), y = toPixel(value, height);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
  }
  ctx.font = "9px ui-monospace,SFMono-Regular,Consolas,monospace"; ctx.fillStyle = "rgba(238,244,244,.72)";
  for (const tick of [0, 250, 500, 750, 1000]) {
    const x = toPixel(tick, width), y = toPixel(tick, height);
    ctx.textAlign = tick === 0 ? "left" : tick === 1000 ? "right" : "center"; ctx.textBaseline = "top"; ctx.fillText(String(tick), x, bottom + 4);
    ctx.textAlign = "right"; ctx.textBaseline = tick === 0 ? "top" : tick === 1000 ? "bottom" : "middle"; ctx.fillText(String(tick), left - 5, y);
  }
  ctx.fillStyle = "rgba(170,178,180,.50)"; ctx.font = "700 8px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("OFFSCREEN", left / 2, height / 2); ctx.fillText("OFFSCREEN", (right + width) / 2, height / 2);
  ctx.restore();
}

function boxOutsideView(box) {
  const b = box?.bbox_2d; if (!Array.isArray(b)) return null;
  if (b[2] < VIEW_MIN) return "left"; if (b[0] > VIEW_MAX) return "right"; if (b[3] < VIEW_MIN) return "top"; if (b[1] > VIEW_MAX) return "bottom"; return null;
}

function markerPoint(box, side) {
  const [x1, y1, x2, y2] = box.bbox_2d;
  const cx = clamp((x1 + x2) / 2, VIEW_MIN + 40, VIEW_MAX - 40);
  const cy = clamp((y1 + y2) / 2, VIEW_MIN + 30, VIEW_MAX - 30);
  if (side === "left") return [VIEW_MIN + 15, cy]; if (side === "right") return [VIEW_MAX - 15, cy];
  if (side === "top") return [cx, VIEW_MIN + 15]; return [cx, VIEW_MAX - 15];
}

function drawBox(ctx, box, width, height, active) {
  const outside = boxOutsideView(box);
  const color = SLOT_COLORS[box.slot] ?? "#ddd";
  if (outside) {
    const [mx, my] = markerPoint(box, outside); const px = toPixel(mx, width), py = toPixel(my, height); const label = `${SLOT_LABELS[box.slot]} ${outside.toUpperCase()} OFF`;
    ctx.save(); ctx.font = "700 9px system-ui"; const w = Math.max(58, ctx.measureText(label).width + 12), h = 18; const l = clamp(px - w / 2, 2, width - w - 2), t = clamp(py - h / 2, 2, height - h - 2); ctx.fillStyle = "#111"; ctx.fillRect(l, t, w, h); ctx.strokeStyle = color; ctx.strokeRect(l, t, w, h); ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, l + w / 2, t + h / 2); ctx.restore(); return;
  }
  const [x1, y1, x2, y2] = box.bbox_2d; const left = toPixel(x1, width), top = toPixel(y1, height), right = toPixel(x2, width), bottom = toPixel(y2, height);
  ctx.save(); ctx.fillStyle = `${color}22`; ctx.fillRect(left, top, right - left, bottom - top); ctx.strokeStyle = color; ctx.lineWidth = active ? 2.5 : 1.6; ctx.strokeRect(left, top, right - left, bottom - top);
  const lx = clamp(left, 0, Math.max(0, width - 28)), ly = clamp(top - 24, 0, Math.max(0, height - 24)); ctx.fillStyle = color; ctx.fillRect(lx, ly, 28, 24); ctx.fillStyle = box.slot === "c" ? "#151515" : "#fff"; ctx.font = "700 14px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(SLOT_LABELS[box.slot], lx + 14, ly + 12);
  if (active) { const size = 7; for (const [x, y] of [[left, top], [right, top], [right, bottom], [left, bottom]]) { if (x < -size || y < -size || x > width + size || y > height + size) continue; ctx.fillStyle = color; ctx.fillRect(x - size / 2, y - size / 2, size, size); ctx.strokeStyle = "#fff"; ctx.strokeRect(x - size / 2, y - size / 2, size, size); } }
  ctx.restore();
}

function drawCanvas(controller) {
  const canvas = controller?.canvas, ctx = canvas?.getContext?.("2d"); if (!canvas || !ctx) return;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)), width = canvas.width / dpr, height = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#101314"; ctx.fillRect(0, 0, width, height); drawFrame(ctx, width, height, controller.state?.canvas?.grid ?? "thirds");
  for (const box of controller.state?.boxes ?? []) drawBox(ctx, box, width, height, box.slot === controller.__h3scTimelineExp?.selectedSlot);
}

function hitTest(controller, point) {
  const exp = controller.__h3scTimelineExp;
  const tx = 12 / Math.max(point.rect.width, 1) * VIEW_SPAN, ty = 12 / Math.max(point.rect.height, 1) * VIEW_SPAN;
  const ordered = [...(controller.state?.boxes ?? [])].sort((a, b) => (a.slot === exp.selectedSlot ? 1 : 0) - (b.slot === exp.selectedSlot ? 1 : 0)).reverse();
  for (const box of ordered) {
    const outside = boxOutsideView(box);
    if (outside) { const [mx, my] = markerPoint(box, outside); if (Math.abs(point.x - mx) <= tx * 5 && Math.abs(point.y - my) <= ty * 4) return { box, mode: "move", handle: null }; continue; }
    const [x1, y1, x2, y2] = box.bbox_2d; const corners = { nw: [x1, y1], ne: [x2, y1], se: [x2, y2], sw: [x1, y2] };
    for (const [handle, [x, y]] of Object.entries(corners)) if (Math.abs(point.x - x) <= tx && Math.abs(point.y - y) <= ty) return { box, mode: "resize", handle };
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) return { box, mode: "move", handle: null };
  }
  return null;
}

function wireCanvasEvents(controller) {
  const canvas = controller.canvas, exp = controller.__h3scTimelineExp; if (!canvas || !exp) return;
  controller.eventPoint = (event) => { const rect = canvas.getBoundingClientRect(); return { x: clamp(fromPixel(event.clientX - rect.left, rect.width), INTERNAL_MIN, INTERNAL_MAX), y: clamp(fromPixel(event.clientY - rect.top, rect.height), INTERNAL_MIN, INTERNAL_MAX), px: event.clientX - rect.left, py: event.clientY - rect.top, rect }; };
  canvas.onpointerdown = (event) => {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); canvas.focus();
    if (!isEditPoint(exp.t)) { updateTimelineUI(controller); return; }
    canvas.setPointerCapture?.(event.pointerId); const point = controller.eventPoint(event), hit = hitTest(controller, point);
    if (hit) { controller.state.canvas.active_slot = hit.box.slot; exp.selectedSlot = hit.box.slot; controller.drag = { pointerId: event.pointerId, mode: hit.mode, handle: hit.handle, start: point, original: [...hit.box.bbox_2d], creatingNewTrack: false }; }
    else if (controller.drawMode) {
      exp.selectedSlot = controller.activeSlot;
      const creatingNewTrack = trackIsEmpty(exp.tracks[controller.activeSlot]);
      controller.drag = { pointerId: event.pointerId, mode: "draw", start: point, original: null, creatingNewTrack };
    }
    else { exp.selectedSlot = null; controller.drag = null; }
    controller.updateControls?.(); drawCanvas(controller);
  };
  canvas.onpointermove = (event) => {
    if (!controller.drag || event.pointerId !== controller.drag.pointerId) return; event.preventDefault(); event.stopPropagation(); const point = controller.eventPoint(event); let box;
    if (controller.drag.mode === "draw") box = [Math.min(controller.drag.start.x, point.x), Math.min(controller.drag.start.y, point.y), Math.max(controller.drag.start.x, point.x), Math.max(controller.drag.start.y, point.y)];
    else if (controller.drag.mode === "move") { const [ox1, oy1, ox2, oy2] = controller.drag.original; const width = ox2 - ox1, height = oy2 - oy1; const x1 = clamp(ox1 + point.x - controller.drag.start.x, INTERNAL_MIN, INTERNAL_MAX - width), y1 = clamp(oy1 + point.y - controller.drag.start.y, INTERNAL_MIN, INTERNAL_MAX - height); box = [x1, y1, x1 + width, y1 + height]; }
    else { let [x1, y1, x2, y2] = controller.drag.original; if (controller.drag.handle.includes("n")) y1 = point.y; if (controller.drag.handle.includes("s")) y2 = point.y; if (controller.drag.handle.includes("w")) x1 = point.x; if (controller.drag.handle.includes("e")) x2 = point.x; box = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]; }
    if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) setEditPointBox(controller, exp.selectedSlot ?? controller.activeSlot, box);
  };
  const finish = (event) => {
    if (!controller.drag || event.pointerId !== controller.drag.pointerId) return;
    const drag = controller.drag;
    const slot = exp.selectedSlot;
    if (drag.mode === "draw" && slot) {
      const point = controller.eventPoint(event);
      const finalBox = [Math.min(drag.start.x, point.x), Math.min(drag.start.y, point.y), Math.max(drag.start.x, point.x), Math.max(drag.start.y, point.y)];
      if (finalBox[2] - finalBox[0] >= 1 && finalBox[3] - finalBox[1] >= 1) setEditPointBox(controller, slot, finalBox);
    }
    const box = slot ? controller.state.boxes.find((item) => item.slot === slot) : null;
    const tooSmall = !box || box.bbox_2d[2] - box.bbox_2d[0] < 12 || box.bbox_2d[3] - box.bbox_2d[1] < 12;
    if (drag.mode === "draw" && tooSmall) removeSlot(controller, slot);
    controller.drag = null;
    writeExperimentalState(controller);
  };
  canvas.onpointerup = finish; canvas.onpointercancel = finish;
  canvas.onkeydown = (event) => { if ((event.key === "Delete" || event.key === "Backspace") && exp.selectedSlot && isEditPoint(exp.t)) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); removeSlot(controller, exp.selectedSlot); } };
}

function timelineElement(controller) {
  const exp = controller.__h3scTimelineExp, section = document.createElement("section"); section.className = "h3sc-timeline-exp";
  const head = document.createElement("div"); head.className = "h3sc-timeline-exp-head"; const title = document.createElement("span"); title.className = "h3sc-timeline-exp-title"; title.textContent = "3-Slot Timeline"; const badge = document.createElement("span"); badge.className = "h3sc-timeline-exp-badge"; badge.textContent = "3-POINT EXPERIMENTAL"; const spacer = document.createElement("span"); spacer.className = "h3sc-timeline-exp-spacer"; const state = document.createElement("span"); state.className = "h3sc-timeline-exp-state"; head.append(title, badge, spacer, state);
  const controls = document.createElement("div"); controls.className = "h3sc-timeline-exp-controls"; const play = document.createElement("button"); play.type = "button"; play.className = "h3sc-btn h3sc-timeline-exp-play"; play.textContent = "▶"; play.addEventListener("click", () => startPlayback(controller)); const time = document.createElement("span"); time.className = "h3sc-timeline-exp-time"; const number = document.createElement("input"); number.type = "number"; number.className = "h3sc-timeline-time-input"; number.min = "0"; number.max = String(exp.duration); number.step = "0.01"; number.setAttribute("aria-label", "Current timeline time in seconds"); const applyNumber = () => { const seconds = clamp(Number(number.value) || 0, 0, exp.duration); setPlayhead(controller, seconds / exp.duration); }; number.addEventListener("change", applyNumber); number.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); applyNumber(); number.blur(); } }); const range = document.createElement("input"); range.type = "range"; range.className = "h3sc-timeline-exp-range"; range.min = "0"; range.max = "1000"; range.step = "1"; range.addEventListener("input", () => setPlayhead(controller, Number(range.value) / 1000)); const end = document.createElement("span"); end.className = "h3sc-timeline-exp-end"; end.textContent = `${exp.duration.toFixed(2)}s`; controls.append(play, time, number, range, end);
  const meta = document.createElement("div"); meta.className = "h3sc-timeline-exp-meta"; for (const slot of VISIBLE_SLOTS) { const item = document.createElement("span"); item.className = "h3sc-timeline-exp-slot"; const dot = document.createElement("span"); dot.className = "h3sc-timeline-exp-dot"; dot.style.background = SLOT_COLORS[slot]; item.append(dot, document.createTextNode(SLOT_LABELS[slot])); meta.append(item); } const linear = document.createElement("span"); linear.className = "h3sc-timeline-exp-slot"; linear.textContent = "Piecewise Linear · START → MID → END"; const note = document.createElement("span"); note.className = "h3sc-timeline-exp-note"; meta.append(linear, note); section.append(head, controls, meta); exp.ui = { section, play, time, number, range, state, note }; return section;
}

function updateTimelineUI(controller) {
  const exp = controller.__h3scTimelineExp; if (!exp?.ui) return; const seconds = exp.t * exp.duration; exp.ui.range.value = String(Math.round(exp.t * 1000)); exp.ui.time.textContent = `${seconds.toFixed(2)}s`; if (document.activeElement !== exp.ui.number) exp.ui.number.value = seconds.toFixed(2); exp.ui.play.textContent = exp.playing ? "■" : "▶"; const point = editPointName(exp.t);
  if (point === "start") { exp.ui.state.textContent = "START · EDIT"; exp.ui.note.textContent = "Start position is editable."; exp.ui.note.classList.remove("warning"); }
  else if (point === "mid") { exp.ui.state.textContent = "MID · EDIT"; exp.ui.note.textContent = "Mid position at 2.50s is editable."; exp.ui.note.classList.remove("warning"); }
  else if (point === "end") { exp.ui.state.textContent = "END · EDIT"; exp.ui.note.textContent = "End position is editable."; exp.ui.note.classList.remove("warning"); }
  else { exp.ui.state.textContent = "PREVIEW ONLY"; exp.ui.note.textContent = "Move playhead to 0.00s, 2.50s, or 5.00s to edit."; exp.ui.note.classList.add("warning"); }
  if (controller.drawButton) controller.drawButton.disabled = !point; const del = controller.root?.querySelector(".h3sc-toolbar .h3sc-btn.danger"); if (del) del.disabled = !point; controller.canvas?.classList.toggle("h3sc-timeline-preview-only", !point);
}

function applyCanvasDOM(controller) {
  ensureStyles(); const shell = controller.root?.querySelector(".h3sc-shell"); if (!shell) return;
  const toolbar = shell.querySelector(".h3sc-toolbar"); if (toolbar) { controller.showButton?.remove(); const buttons = [...toolbar.querySelectorAll(":scope > button.h3sc-btn")]; const del = buttons.find((button) => button.classList.contains("danger")); for (const button of buttons) if (button !== controller.drawButton && button !== del) button.remove(); if (del) del.textContent = "Delete Selected"; toolbar.querySelectorAll(".h3sc-slot-button").forEach((button) => { if (!VISIBLE_SLOTS.includes(button.dataset.slot)) button.remove(); }); }
  const panels = shell.querySelector(".h3sc-panels"); if (panels) { const sizePanel = panels.firstElementChild; if (sizePanel) { sizePanel.classList.add("h3sc-exp-size-panel"); const presetField = controller.resolutionSelect?.closest(".h3sc-field"), widthField = controller.widthInput?.closest(".h3sc-field"), heightField = controller.heightInput?.closest(".h3sc-field"), sizeRow = controller.widthInput?.closest(".h3sc-row"), apply = sizeRow?.querySelector("button"); if (presetField && widthField && heightField && apply) { const row = document.createElement("div"); row.className = "h3sc-size-inline"; row.append(presetField, widthField, heightField, apply); sizePanel.querySelector(":scope > .h3sc-section-title")?.after(row); sizeRow.remove(); } const toolbarNode = shell.querySelector(".h3sc-toolbar"); shell.insertBefore(sizePanel, toolbarNode ?? shell.firstChild); } panels.remove(); }
  const monitor = shell.querySelector(".h3sc-monitor"); if (monitor && !shell.querySelector(".h3sc-timeline-exp")) monitor.after(timelineElement(controller)); for (const hint of [...shell.querySelectorAll(":scope > .h3sc-note")]) hint.remove(); updateTimelineUI(controller);
}

function loadCanvasFromRaw(controller, rawValue) {
  const raw = parseObject(rawValue); const canvasRaw = raw.canvas ?? raw.layout?.canvas ?? {};
  controller.state.canvas = { ...controller.state.canvas, ...canvasRaw, width: clamp(Math.round(Number(canvasRaw.width ?? controller.widthWidget?.value ?? controller.state.canvas.width) || 1024), 64, 16384), height: clamp(Math.round(Number(canvasRaw.height ?? controller.heightWidget?.value ?? controller.state.canvas.height) || 1024), 64, 16384), show_boxes: true };
  controller.state.canvas.aspect_ratio = simplifiedAspect(controller.state.canvas.width, controller.state.canvas.height); if (!VISIBLE_SLOTS.includes(controller.state.canvas.active_slot)) controller.state.canvas.active_slot = "a";
  controller.__h3scTimelineExp = buildExperimentState(controller, raw); controller.render(); writeExperimentalState(controller);
}

function installCanvas(node, configuredRaw = null) {
  const controller = node?.__h3scController; if (!controller || node.__h3scTimelineConsolidatedInstalled) return false; node.__h3scTimelineConsolidatedInstalled = true;
  const originalRender = controller.render.bind(controller), originalUpdateControls = controller.updateControls.bind(controller), originalDestroy = controller.destroy?.bind(controller);
  [controller.widthWidget, controller.heightWidget, controller.stateWidget].forEach(setWidgetSerialized);
  controller.__h3scTimelineExp = buildExperimentState(controller, configuredRaw ?? controller.stateWidget?.value);
  controller.sync = () => writeExperimentalState(controller);
  controller.updateControls = () => { originalUpdateControls(); if (controller.drawButton) controller.drawButton.textContent = controller.drawMode ? "Draw" : "Move"; updateTimelineUI(controller); };
  controller.upsertBox = (slot, bbox) => { if (setEditPointBox(controller, slot, bbox)) writeExperimentalState(controller); };
  controller.removeBox = (slot) => removeSlot(controller, slot);
  controller.draw = () => drawCanvas(controller);
  controller.render = () => { originalRender(); applyCanvasDOM(controller); applyPreview(controller, false); wireCanvasEvents(controller); controller.fitAndDraw?.(); };
  controller.reloadFromWidgets = () => loadCanvasFromRaw(controller, controller.stateWidget?.value);
  controller.destroy = () => { stopPlayback(controller); if (controller.__h3scDeleteHandler) window.removeEventListener("keydown", controller.__h3scDeleteHandler, true); originalDestroy?.(); };
  const deleteHandler = (event) => { const target = event.target; if (event.key !== "Delete" && event.key !== "Backspace") return; if (target instanceof Element && target.closest("input,textarea,select,[contenteditable='true']")) return; const exp = controller.__h3scTimelineExp; if (!exp?.selectedSlot || !isEditPoint(exp.t)) return; event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); removeSlot(controller, exp.selectedSlot); };
  controller.__h3scDeleteHandler = deleteHandler; window.addEventListener("keydown", deleteHandler, true);
  loadCanvasFromRaw(controller, configuredRaw ?? controller.stateWidget?.value); return true;
}

function applyPrompterState(controller) {
  if (!controller?.state) return; for (const slot of VISIBLE_SLOTS) if (controller.state.slots?.[slot]) controller.state.slots[slot].motion = "start_end"; for (const slot of HIDDEN_SLOTS) if (controller.state.slots?.[slot]) controller.state.slots[slot].enabled = false; controller.state.camera = { motion: "Static Shot", speed: "auto", amplitude: "auto" }; controller.state.soundscape = ""; controller.state.music = ""; controller.state.custom_instruction = "";
}

function applyPrompterDOM(controller) {
  ensureStyles(); const scroll = controller.root?.querySelector(".h3sc-scroll"); if (!scroll) return; const topbar = scroll.querySelector(":scope > .h3sc-topbar"); if (topbar) { const fields = [...topbar.querySelectorAll(":scope > .h3sc-field")]; fields.slice(1).forEach((field) => field.remove()); [...topbar.querySelectorAll(":scope > button")].forEach((button) => button.remove()); if (!topbar.querySelector(".h3sc-exp-prompter-note")) { const note = document.createElement("span"); note.className = "h3sc-exp-prompter-note"; note.textContent = "3-Slot Timeline Experimental · A/B/C START → MID → END"; topbar.append(note); } }
  scroll.querySelectorAll(":scope > .h3sc-slot-card").forEach((card) => { const slot = card.querySelector(".h3sc-slot-chip")?.textContent?.trim()?.toLowerCase(); if (HIDDEN_SLOTS.includes(slot)) { card.remove(); return; } if (VISIBLE_SLOTS.includes(slot)) { const motion = card.querySelectorAll(".h3sc-slot-controls select")[1]; if (motion) { motion.value = "start_end"; motion.disabled = true; motion.classList.add("h3sc-exp-motion-locked"); } } }); scroll.querySelectorAll(":scope > .h3sc-card, :scope > details.h3sc-details").forEach((element) => element.remove());
}

function validConfig(value) { const parsed = parseObject(value); return parsed?.slots && typeof parsed.slots === "object"; }

function snapshotPromptNode(node, markDirty = false) {
  const controller = node?.__h3scController, widget = findWidget(node, "config_json"); if (!controller || !widget) return null; applyPrompterState(controller); const raw = JSON.stringify(controller.state); if (!validConfig(raw)) return null; setWidgetSerialized(widget); widget.value = raw; node.properties = node.properties || {}; node.properties.h3scPromptState = { version: "h3sc_prompt_persistence_v3", config_json: raw, saved_at: Date.now() }; const index = node.widgets?.indexOf(widget) ?? -1; if (Array.isArray(node.widgets_values) && index >= 0) node.widgets_values[index] = raw; if (markDirty) { node.setDirtyCanvas?.(true, true); app?.graph?.setDirtyCanvas?.(true, true); } return raw;
}

function installPrompter(node, configuredRaw = null) {
  const controller = node?.__h3scController, widget = findWidget(node, "config_json"); if (!controller || !widget || node.__h3scPrompterConsolidatedInstalled) return false; node.__h3scPrompterConsolidatedInstalled = true; setWidgetSerialized(widget);
  const originalRender = controller.render.bind(controller), originalSync = controller.sync.bind(controller), originalReload = controller.reloadFromWidgets?.bind(controller);
  controller.sync = () => { applyPrompterState(controller); originalSync(); snapshotPromptNode(node, false); };
  controller.render = () => { applyPrompterState(controller); originalRender(); applyPrompterDOM(controller); };
  if (originalReload) controller.reloadFromWidgets = () => { originalReload(); applyPrompterState(controller); snapshotPromptNode(node, false); };
  if (typeof node.serialize === "function" && !node.__h3scPromptSerializeConsolidated) { const originalSerialize = node.serialize.bind(node); node.serialize = function () { snapshotPromptNode(this, false); return originalSerialize(...arguments); }; node.__h3scPromptSerializeConsolidated = true; }
  node.__h3scPromptLifecycleSnapshot = (markDirty = false) => snapshotPromptNode(node, markDirty);
  if (!controller.root.__h3scPromptInputPersistence) { controller.root.__h3scPromptInputPersistence = true; const save = () => queueMicrotask(() => snapshotPromptNode(node, false)); controller.root.addEventListener("input", save, true); controller.root.addEventListener("change", save, true); controller.root.addEventListener("compositionend", save, true); }
  const raw = validConfig(configuredRaw) ? configuredRaw : validConfig(node.properties?.h3scPromptState?.config_json) ? node.properties.h3scPromptState.config_json : null; if (raw) { widget.value = raw; originalReload?.(); }
  applyPrompterState(controller); controller.render(); controller.sync(); return true;
}

function snapshotAllPrompters(markDirty = false) { for (const node of app?.graph?._nodes ?? []) if (node?.type === PROMPTER_NODE || node?.comfyClass === PROMPTER_NODE) try { node.__h3scPromptLifecycleSnapshot?.(markDirty); } catch {} }

function installPromptLifecycleHooks() {
  if (window.__h3scConsolidatedPromptHooks) return; window.__h3scConsolidatedPromptHooks = true; const snapshot = () => snapshotAllPrompters(true); document.addEventListener("pointerdown", snapshot, true); window.addEventListener("pagehide", snapshot, true); window.addEventListener("beforeunload", snapshot, true); document.addEventListener("visibilitychange", () => { if (document.hidden) snapshot(); }, true);
  if (app && !app.__h3scConsolidatedGraphToPrompt && typeof app.graphToPrompt === "function") { const original = app.graphToPrompt.bind(app); app.graphToPrompt = function () { snapshotAllPrompters(false); return original(...arguments); }; app.__h3scConsolidatedGraphToPrompt = true; }
  if (app && !app.__h3scConsolidatedQueuePrompt && typeof app.queuePrompt === "function") { const original = app.queuePrompt.bind(app); app.queuePrompt = function () { snapshotAllPrompters(false); return original(...arguments); }; app.__h3scConsolidatedQueuePrompt = true; }
}

function patchWhenReady(node, nodeName, configuredRaw, attempts = 32) {
  const ready = nodeName === CANVAS_NODE ? installCanvas(node, configuredRaw) : installPrompter(node, configuredRaw); if (ready || attempts <= 0) return; queueMicrotask(() => patchWhenReady(node, nodeName, configuredRaw, attempts - 1));
}

function wrapNodeType(nodeType, nodeData) {
  if (nodeType.prototype.__h3scTimelineConsolidatedWrapped) return; nodeType.prototype.__h3scTimelineConsolidatedWrapped = true;
  const previousCreated = nodeType.prototype.onNodeCreated; nodeType.prototype.onNodeCreated = function () { previousCreated?.apply(this, arguments); queueMicrotask(() => patchWhenReady(this, nodeData.name, null)); };
  const previousConfigure = nodeType.prototype.onConfigure; nodeType.prototype.onConfigure = function (info) { const widgetName = nodeData.name === CANVAS_NODE ? "layout_json" : "config_json"; const index = this.widgets?.findIndex((widget) => widget.name === widgetName) ?? -1; const configuredRaw = index >= 0 && Array.isArray(info?.widgets_values) ? info.widgets_values[index] : null; const result = previousConfigure?.apply(this, arguments); queueMicrotask(() => { patchWhenReady(this, nodeData.name, configuredRaw); if (nodeData.name === CANVAS_NODE && this.__h3scTimelineConsolidatedInstalled && configuredRaw) loadCanvasFromRaw(this.__h3scController, configuredRaw); if (nodeData.name === PROMPTER_NODE && this.__h3scPrompterConsolidatedInstalled && validConfig(configuredRaw)) { const widget = findWidget(this, "config_json"); if (widget) widget.value = configuredRaw; this.__h3scController?.reloadFromWidgets?.(); } }); return result; };
}

if (!app?.registerExtension) {
  console.error("[H3 Structured Canvas] ComfyUI app API was not found.");
} else {
  app.registerExtension({
    name: EXTENSION_NAME,
    setup() { installPromptLifecycleHooks(); },
    beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData.name === CANVAS_NODE || nodeData.name === PROMPTER_NODE) wrapNodeType(nodeType, nodeData); },
  });
  console.info("[H3 Structured Canvas] Consolidated 3-Point Timeline Experimental loaded");
}
