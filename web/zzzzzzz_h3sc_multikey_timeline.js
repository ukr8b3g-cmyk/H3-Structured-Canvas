const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.multikey";
const VISIBLE_SLOTS = ["a", "b", "c"];
const SLOT_LABELS = { a: "A", b: "B", c: "C" };
const DURATION_MIN = 5.0;
const DURATION_MAX = 15.0;
const DURATION_STEP = 0.5;
const MAX_INTERMEDIATE_KEYS = 7;
const MIN_KEY_GAP_SECONDS = 0.05;
const EPS = 0.0005;
const INTERNAL_MIN = -1000;
const INTERNAL_MAX = 2000;
const VIEW_MIN = -100;
const VIEW_MAX = 1100;
const VIEW_SPAN = VIEW_MAX - VIEW_MIN;

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function parseObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeDuration(value) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 5;
  return clamp(Math.round(safe / DURATION_STEP) * DURATION_STEP, DURATION_MIN, DURATION_MAX);
}

function cloneBox(box) {
  return box ? { ...box, bbox_2d: [...box.bbox_2d] } : null;
}

function normalizeBox(raw, slot) {
  const source = raw?.bbox_2d ?? raw?.bbox;
  if (!Array.isArray(source) || source.length !== 4) return null;
  let values = source.map(Number);
  if (!values.every(Number.isFinite)) return null;
  if (Math.max(...values.map(Math.abs)) <= 1.000001) values = values.map((value) => value * 1000);
  let [x1, y1, x2, y2] = values.map((value) => clamp(value, INTERNAL_MIN, INTERNAL_MAX));
  [x1, x2] = x1 <= x2 ? [x1, x2] : [x2, x1];
  [y1, y2] = y1 <= y2 ? [y1, y2] : [y2, y1];
  if (x2 - x1 < 1 || y2 - y1 < 1) return null;
  return { slot, ui_color: { a: "red", b: "blue", c: "yellow" }[slot] ?? "red", bbox_2d: [x1, y1, x2, y2].map(Math.round) };
}

function interpolateBox(a, b, t, slot) {
  if (!a && !b) return null;
  if (!a) return cloneBox(b);
  if (!b) return cloneBox(a);
  return normalizeBox({ bbox_2d: a.bbox_2d.map((value, index) => value + (b.bbox_2d[index] - value) * t) }, slot);
}

function orderedPoints(track) {
  if (!track) return [];
  const points = [];
  if (track.start) points.push({ kind: "start", time: 0, bbox: track.start });
  for (const [index, key] of (track.keys ?? []).entries()) {
    if (key?.bbox) points.push({ kind: "key", index, time: Number(key.time), bbox: key.bbox });
  }
  if (track.end) points.push({ kind: "end", time: 1, bbox: track.end });
  return points.sort((a, b) => a.time - b.time);
}

function previewBox(track, t, slot) {
  const points = orderedPoints(track);
  if (!points.length) return null;
  if (t <= points[0].time + EPS) return cloneBox(points[0].bbox);
  if (t >= points.at(-1).time - EPS) return cloneBox(points.at(-1).bbox);
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (t >= left.time - EPS && t <= right.time + EPS) {
      return interpolateBox(left.bbox, right.bbox, clamp((t - left.time) / Math.max(right.time - left.time, 1e-9), 0, 1), slot);
    }
  }
  return cloneBox(points.at(-1).bbox);
}

function pointAt(track, t) {
  if (!track) return null;
  if (t <= EPS && track.start) return { kind: "start", time: 0 };
  if (t >= 1 - EPS && track.end) return { kind: "end", time: 1 };
  for (let index = 0; index < (track.keys?.length ?? 0); index += 1) {
    const time = Number(track.keys[index].time);
    if (Math.abs(time - t) <= EPS) return { kind: "key", index, time };
  }
  return null;
}

function trackEmpty(track) {
  return !track?.start && !track?.end && !(track?.keys?.length);
}

function syncLegacyMid(track) {
  if (!track) return;
  const mid = (track.keys ?? []).find((key) => Math.abs(Number(key.time) - 0.5) <= EPS);
  track.mid = mid ? cloneBox(mid.bbox) : null;
  track.midExplicit = Boolean(mid);
}

function importKeys(track, rawTimeline, slot) {
  const raw = rawTimeline?.keyframes?.[slot];
  const keys = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const time = Number(item?.time ?? item?.t);
    const bbox = normalizeBox(item, slot);
    if (Number.isFinite(time) && time > 0 && time < 1 && bbox) keys.push({ time, bbox });
  }
  if (!keys.length && track?.midExplicit && track.mid) keys.push({ time: 0.5, bbox: cloneBox(track.mid) });
  keys.sort((a, b) => a.time - b.time);
  track.keys = keys.slice(0, MAX_INTERMEDIATE_KEYS);
  syncLegacyMid(track);
}

function upgradeState(controller, rawValue) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  const raw = parseObject(rawValue ?? controller.stateWidget?.value);
  const timeline = parseObject(raw.timeline_experimental);
  exp.version = 4;
  exp.duration = normalizeDuration(timeline.duration_seconds ?? exp.duration ?? 5);
  exp.tracks ??= {};
  for (const slot of VISIBLE_SLOTS) {
    exp.tracks[slot] ??= { start: null, mid: null, end: null, midExplicit: false, keys: [] };
    importKeys(exp.tracks[slot], timeline, slot);
  }
}

function serializeLayout(controller) {
  const exp = controller.__h3scTimelineExp;
  const current = parseObject(controller.stateWidget?.value);
  const canvas = clone(current.canvas ?? controller.state?.canvas ?? {});
  const starts = [];
  const ends = [];
  const keyframes = {};
  const mids = [];

  for (const slot of VISIBLE_SLOTS) {
    const track = exp.tracks[slot];
    syncLegacyMid(track);
    if (track?.start) starts.push(cloneBox(track.start));
    if (track?.end) ends.push(cloneBox(track.end));
    const keys = (track?.keys ?? []).slice().sort((a, b) => a.time - b.time).slice(0, MAX_INTERMEDIATE_KEYS);
    if (keys.length) keyframes[slot] = keys.map((key) => ({ time: Number(key.time.toFixed(6)), bbox_2d: [...key.bbox.bbox_2d] }));
    const mid = keys.find((key) => Math.abs(key.time - 0.5) <= EPS);
    if (mid) mids.push(cloneBox(mid.bbox));
  }

  for (const slot of ["d", "e"]) {
    const track = exp.hiddenTracks?.[slot];
    if (track?.start) starts.push(cloneBox(track.start));
    if (track?.end) ends.push(cloneBox(track.end));
  }

  return {
    schema: current.schema ?? controller.state?.schema ?? "h3_structured_canvas/0.9",
    canvas,
    boxes: starts,
    transition: { end_canvas: clone(canvas), end_boxes: ends },
    timeline_experimental: {
      version: 4,
      slots: VISIBLE_SLOTS,
      duration_seconds: exp.duration,
      interpolation: "piecewise_linear",
      canonical_time: "normalized_0_1",
      max_intermediate_keys: MAX_INTERMEDIATE_KEYS,
      keyframes,
      mid_time: 0.5,
      mid_boxes: mids,
      coordinate_space: "normalized_0_1000_with_offscreen_overscan",
    },
  };
}

function saveState(controller) {
  const widget = controller.stateWidget;
  const raw = JSON.stringify(serializeLayout(controller));
  if (widget) {
    widget.value = raw;
    widget.serialize = true;
    widget.options = widget.options || {};
    widget.options.serialize = true;
    widget.callback?.(raw, app?.canvas, controller.node, [0, 0], null);
  }
  controller.node?.setDirtyCanvas?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
  applyPreview(controller);
}

function applyPreview(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  controller.state.boxes = VISIBLE_SLOTS.map((slot) => previewBox(exp.tracks[slot], exp.t, slot)).filter(Boolean);
  updateUI(controller);
  controller.fitAndDraw?.();
}

function setBox(controller, slot, rawBox) {
  const exp = controller.__h3scTimelineExp;
  const track = exp?.tracks?.[slot];
  const box = normalizeBox({ bbox_2d: rawBox }, slot);
  if (!track || !box) return false;

  const point = pointAt(track, exp.t);
  const creating = controller.__h3scMultiDrag?.creating;
  if (creating || trackEmpty(track)) {
    track.start = cloneBox(box);
    track.end = cloneBox(box);
    track.keys = [];
  } else if (point?.kind === "start") {
    track.start = cloneBox(box);
  } else if (point?.kind === "end") {
    track.end = cloneBox(box);
  } else if (point?.kind === "key") {
    track.keys[point.index].bbox = cloneBox(box);
  } else {
    return false;
  }

  syncLegacyMid(track);
  exp.selectedSlot = slot;
  controller.activeSlot = slot;
  controller.state.canvas.active_slot = slot;
  applyPreview(controller);
  return true;
}

function addKey(controller) {
  const exp = controller.__h3scTimelineExp;
  const slot = controller.activeSlot;
  const track = exp?.tracks?.[slot];
  if (!track || trackEmpty(track) || exp.t <= EPS || exp.t >= 1 - EPS || pointAt(track, exp.t) || track.keys.length >= MAX_INTERMEDIATE_KEYS) return;
  const gap = MIN_KEY_GAP_SECONDS / exp.duration;
  const times = [0, ...track.keys.map((key) => key.time), 1];
  if (times.some((time) => Math.abs(time - exp.t) < gap)) return;
  const bbox = previewBox(track, exp.t, slot);
  if (!bbox) return;
  track.keys.push({ time: exp.t, bbox });
  track.keys.sort((a, b) => a.time - b.time);
  syncLegacyMid(track);
  saveState(controller);
}

function deleteKey(controller) {
  const exp = controller.__h3scTimelineExp;
  const track = exp?.tracks?.[controller.activeSlot];
  const point = pointAt(track, exp?.t);
  if (point?.kind !== "key") return;
  track.keys.splice(point.index, 1);
  syncLegacyMid(track);
  exp.selectedSlot = null;
  saveState(controller);
}

function jumpKey(controller, direction) {
  const exp = controller.__h3scTimelineExp;
  const track = exp?.tracks?.[controller.activeSlot];
  if (!track) return;
  const times = orderedPoints(track).map((point) => point.time);
  const target = direction < 0
    ? [...times].reverse().find((time) => time < exp.t - EPS)
    : times.find((time) => time > exp.t + EPS);
  setPlayhead(controller, target ?? (direction < 0 ? times[0] : times.at(-1)));
}

function setPlayhead(controller, t) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  stopPlayback(controller);
  exp.t = clamp(Number(t) || 0, 0, 1);
  exp.selectedSlot = null;
  applyPreview(controller);
}

function setPlayheadSeconds(controller, seconds) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  setPlayhead(controller, clamp(Number(seconds) || 0, 0, exp.duration) / Math.max(exp.duration, 1e-9));
}

function setDuration(controller, value) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  exp.duration = normalizeDuration(value);
  saveState(controller);
}

function stopPlayback(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  exp.playing = false;
  if (exp.__multiRaf) cancelAnimationFrame(exp.__multiRaf);
  exp.__multiRaf = 0;
  updateUI(controller);
}

function startPlayback(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  if (exp.playing) return stopPlayback(controller);
  if (exp.t >= 1 - EPS) exp.t = 0;
  exp.playing = true;
  const startT = exp.t;
  const started = performance.now();
  const tick = (now) => {
    if (!exp.playing) return;
    exp.t = clamp(startT + (now - started) / 1000 / exp.duration, 0, 1);
    applyPreview(controller);
    if (exp.t >= 1) return stopPlayback(controller);
    exp.__multiRaf = requestAnimationFrame(tick);
  };
  exp.__multiRaf = requestAnimationFrame(tick);
  updateUI(controller);
}

function ensureStyles() {
  if (document.getElementById("h3sc-multikey-styles")) return;
  const style = document.createElement("style");
  style.id = "h3sc-multikey-styles";
  style.textContent = `
.h3sc-mk{background:#111314;border:1px solid #343738;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:7px}.h3sc-mk-head,.h3sc-mk-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.h3sc-mk-title{font-size:10.5px;font-weight:800;color:#48d5cf}.h3sc-mk-badge{font-size:9.5px;padding:2px 6px;border:1px solid #765e28;border-radius:999px;color:#e4b548;background:#211d13}.h3sc-mk-state{margin-left:auto;font-size:10px;color:#9ba1a2}.h3sc-mk-time{font:800 16px/1 ui-monospace,Consolas,monospace;min-width:65px;text-align:right}.h3sc-mk-current,.h3sc-mk-num{height:28px;background:#101213;color:#eee;border:1px solid #4b4f50;border-radius:5px;padding:3px 6px;text-align:right}.h3sc-mk-current{width:64px}.h3sc-mk-num{width:68px}.h3sc-mk-range-wrap{position:relative;flex:1;min-width:150px}.h3sc-mk-range{width:100%;accent-color:#48d5cf}.h3sc-mk-layer{position:absolute;left:8px;right:8px;top:50%;height:0;pointer-events:none}.h3sc-mk-marker{position:absolute;transform:translate(-50%,-50%) rotate(45deg);width:10px;height:10px;padding:0;border:1px solid #111;background:#48d5cf;pointer-events:auto;cursor:ew-resize}.h3sc-mk-marker.end{width:8px;height:8px;background:#ddd;cursor:pointer}.h3sc-mk-marker.active{outline:2px solid white;outline-offset:2px}.h3sc-mk-note{font-size:10px;color:#8f9697}.h3sc-mk-note.warn{color:#e4b548}.h3sc-mk-count{margin-left:auto;font:10px/1 ui-monospace,Consolas,monospace;color:#8f9697}`;
  document.head.append(style);
}

function buildUI(controller) {
  ensureStyles();
  const old = controller.root?.querySelector(".h3sc-timeline-exp");
  const monitor = controller.root?.querySelector(".h3sc-monitor");
  if (!monitor) return null;
  old?.remove();
  controller.root.querySelector(".h3sc-mk")?.remove();

  const section = document.createElement("section");
  section.className = "h3sc-mk";
  const head = document.createElement("div");
  head.className = "h3sc-mk-head";
  const title = document.createElement("span");
  title.className = "h3sc-mk-title";
  title.textContent = "3-Slot Timeline";
  const badge = document.createElement("span");
  badge.className = "h3sc-mk-badge";
  badge.textContent = "MULTI-KEY EXPERIMENTAL";
  const state = document.createElement("span");
  state.className = "h3sc-mk-state";
  head.append(title, badge, state);

  const row = document.createElement("div");
  row.className = "h3sc-mk-row";
  const play = document.createElement("button");
  play.className = "h3sc-btn";
  play.textContent = "▶";
  play.onclick = () => startPlayback(controller);
  const time = document.createElement("span");
  time.className = "h3sc-mk-time";
  const current = document.createElement("input");
  current.type = "number";
  current.className = "h3sc-mk-current";
  current.min = "0";
  current.step = "0.01";
  current.title = "Current time in seconds";
  current.onchange = () => setPlayheadSeconds(controller, current.value);
  current.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      setPlayheadSeconds(controller, current.value);
      current.blur();
    }
  };
  const wrap = document.createElement("div");
  wrap.className = "h3sc-mk-range-wrap";
  const range = document.createElement("input");
  range.type = "range";
  range.className = "h3sc-mk-range";
  range.min = "0";
  range.max = "1000";
  range.step = "1";
  range.oninput = () => setPlayhead(controller, Number(range.value) / 1000);
  const layer = document.createElement("div");
  layer.className = "h3sc-mk-layer";
  wrap.append(range, layer);
  row.append(play, time, current, wrap);

  const keys = document.createElement("div");
  keys.className = "h3sc-mk-row";
  const endLabel = document.createElement("label");
  endLabel.append(document.createTextNode("END "));
  const duration = document.createElement("input");
  duration.type = "number";
  duration.className = "h3sc-mk-num";
  duration.min = "5";
  duration.max = "15";
  duration.step = "0.5";
  duration.onchange = () => setDuration(controller, duration.value);
  endLabel.append(duration, document.createTextNode(" s"));
  const add = document.createElement("button");
  add.className = "h3sc-btn";
  add.textContent = "+ Key";
  add.onclick = () => addKey(controller);
  const del = document.createElement("button");
  del.className = "h3sc-btn";
  del.textContent = "Delete Key";
  del.onclick = () => deleteKey(controller);
  const prev = document.createElement("button");
  prev.className = "h3sc-btn";
  prev.textContent = "◀ Key";
  prev.onclick = () => jumpKey(controller, -1);
  const next = document.createElement("button");
  next.className = "h3sc-btn";
  next.textContent = "Key ▶";
  next.onclick = () => jumpKey(controller, 1);
  const count = document.createElement("span");
  count.className = "h3sc-mk-count";
  keys.append(endLabel, add, del, prev, next, count);

  const note = document.createElement("div");
  note.className = "h3sc-mk-note";
  section.append(head, row, keys, note);
  monitor.after(section);
  return { section, play, time, current, range, layer, duration, add, del, count, state, note, wrap };
}

function renderMarkers(controller) {
  const exp = controller.__h3scTimelineExp;
  const ui = controller.__h3scMultiUI;
  const slot = controller.activeSlot;
  const track = exp?.tracks?.[slot];
  if (!ui?.layer || !track) return;
  ui.layer.replaceChildren();
  for (const point of orderedPoints(track)) {
    const marker = document.createElement("button");
    marker.className = `h3sc-mk-marker ${point.kind === "key" ? "" : "end"}`;
    marker.style.left = `${point.time * 100}%`;
    if (Math.abs(point.time - exp.t) <= EPS) marker.classList.add("active");
    marker.title = `${point.kind.toUpperCase()} ${(point.time * exp.duration).toFixed(2)}s`;
    marker.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPlayhead(controller, point.time);
    };
    if (point.kind === "key") {
      marker.onpointerdown = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const ref = track.keys[point.index];
        const rect = ui.wrap.getBoundingClientRect();
        const move = (e) => {
          const live = exp.tracks[slot];
          const index = live.keys.indexOf(ref);
          if (index < 0) return;
          const gap = MIN_KEY_GAP_SECONDS / exp.duration;
          const ordered = live.keys.slice().sort((a, b) => a.time - b.time);
          const pos = ordered.indexOf(ref);
          const lo = pos > 0 ? ordered[pos - 1].time + gap : gap;
          const hi = pos < ordered.length - 1 ? ordered[pos + 1].time - gap : 1 - gap;
          ref.time = clamp((e.clientX - rect.left) / Math.max(rect.width, 1), lo, hi);
          live.keys.sort((a, b) => a.time - b.time);
          syncLegacyMid(live);
          exp.t = ref.time;
          applyPreview(controller);
        };
        const up = () => {
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", up, true);
          saveState(controller);
        };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
      };
    }
    ui.layer.append(marker);
  }
}

function updateUI(controller) {
  const exp = controller.__h3scTimelineExp;
  const ui = controller.__h3scMultiUI;
  if (!exp || !ui) return;
  const slot = controller.activeSlot;
  const track = exp.tracks?.[slot];
  const point = pointAt(track, exp.t);
  const seconds = exp.t * exp.duration;
  const count = track?.keys?.length ?? 0;
  ui.time.textContent = `${seconds.toFixed(2)}s`;
  if (ui.current && document.activeElement !== ui.current) {
    ui.current.max = exp.duration.toFixed(2);
    ui.current.value = seconds.toFixed(2);
  }
  ui.range.value = String(Math.round(exp.t * 1000));
  ui.duration.value = exp.duration.toFixed(1);
  ui.play.textContent = exp.playing ? "■" : "▶";
  ui.count.textContent = `${SLOT_LABELS[slot] ?? "?"}: ${count}/${MAX_INTERMEDIATE_KEYS} keys`;
  ui.del.disabled = point?.kind !== "key";
  ui.add.disabled = !track || trackEmpty(track) || Boolean(point) || exp.t <= EPS || exp.t >= 1 - EPS || count >= MAX_INTERMEDIATE_KEYS;
  if (controller.drawButton) controller.drawButton.disabled = !point && !trackEmpty(track);
  controller.canvas?.classList.toggle("h3sc-timeline-preview-only", !point);
  const danger = controller.root?.querySelector(".h3sc-toolbar .h3sc-btn.danger");
  if (danger) danger.disabled = !point;

  if (point?.kind === "start") {
    ui.state.textContent = "START · EDIT";
    ui.note.textContent = "Start position is editable.";
    ui.note.classList.remove("warn");
  } else if (point?.kind === "end") {
    ui.state.textContent = "END · EDIT";
    ui.note.textContent = `End position at ${exp.duration.toFixed(2)}s is editable.`;
    ui.note.classList.remove("warn");
  } else if (point?.kind === "key") {
    ui.state.textContent = `KEY ${point.index + 1} · EDIT`;
    ui.note.textContent = `Intermediate key at ${seconds.toFixed(2)}s is editable.`;
    ui.note.classList.remove("warn");
  } else {
    ui.state.textContent = "PREVIEW ONLY";
    ui.note.textContent = "Use + Key to make the current time editable for the active slot.";
    ui.note.classList.add("warn");
  }
  renderMarkers(controller);
}

function hitTest(controller, point) {
  const boxes = [...(controller.state?.boxes ?? [])].reverse();
  const tx = 12 / Math.max(point.rect.width, 1) * VIEW_SPAN;
  const ty = 12 / Math.max(point.rect.height, 1) * VIEW_SPAN;
  for (const box of boxes) {
    const [x1, y1, x2, y2] = box.bbox_2d;
    const corners = { nw: [x1, y1], ne: [x2, y1], se: [x2, y2], sw: [x1, y2] };
    for (const [handle, [x, y]] of Object.entries(corners)) {
      if (Math.abs(point.x - x) <= tx && Math.abs(point.y - y) <= ty) return { box, mode: "resize", handle };
    }
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) return { box, mode: "move" };
  }
  return null;
}

function wireCanvas(controller) {
  const canvas = controller.canvas;
  const exp = controller.__h3scTimelineExp;
  if (!canvas || !exp) return;
  if (canvas.__h3scMultiCanvasEvents) return;
  controller.__h3scMultiCanvasCleanup?.();
  canvas.__h3scMultiCanvasEvents = true;

  const eventPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(VIEW_MIN + (event.clientX - rect.left) / Math.max(rect.width, 1) * VIEW_SPAN, INTERNAL_MIN, INTERNAL_MAX),
      y: clamp(VIEW_MIN + (event.clientY - rect.top) / Math.max(rect.height, 1) * VIEW_SPAN, INTERNAL_MIN, INTERNAL_MAX),
      rect,
    };
  };
  const consume = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const begin = (event) => {
    if (event.button !== 0) return;
    controller.__h3scMultiDrag = null;
    const point = eventPoint(event);
    const hit = hitTest(controller, point);

    if (hit) {
      const slot = hit.box.slot;
      controller.activeSlot = slot;
      controller.state.canvas.active_slot = slot;
      exp.selectedSlot = slot;
      if (!pointAt(exp.tracks[slot], exp.t)) {
        consume(event);
        updateUI(controller);
        return;
      }
      controller.__h3scMultiDrag = {
        pointerId: event.pointerId,
        mode: hit.mode,
        handle: hit.handle,
        start: point,
        original: [...hit.box.bbox_2d],
        creating: false,
        slot,
      };
    } else if (controller.drawMode) {
      const slot = controller.activeSlot;
      const track = exp.tracks[slot];
      const creating = trackEmpty(track);
      if (!pointAt(track, exp.t) && !(creating && (exp.t <= EPS || exp.t >= 1 - EPS))) {
        consume(event);
        updateUI(controller);
        return;
      }
      exp.selectedSlot = slot;
      controller.__h3scMultiDrag = { pointerId: event.pointerId, mode: "draw", start: point, creating, slot };
    } else {
      return;
    }

    consume(event);
    canvas.focus?.();
    canvas.setPointerCapture?.(event.pointerId);
  };

  const move = (event) => {
    const drag = controller.__h3scMultiDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    consume(event);
    const point = eventPoint(event);
    let box;

    if (drag.mode === "draw") {
      box = [Math.min(drag.start.x, point.x), Math.min(drag.start.y, point.y), Math.max(drag.start.x, point.x), Math.max(drag.start.y, point.y)];
    } else if (drag.mode === "move") {
      const [x1, y1, x2, y2] = drag.original;
      const width = x2 - x1;
      const height = y2 - y1;
      const nx = clamp(x1 + point.x - drag.start.x, INTERNAL_MIN, INTERNAL_MAX - width);
      const ny = clamp(y1 + point.y - drag.start.y, INTERNAL_MIN, INTERNAL_MAX - height);
      box = [nx, ny, nx + width, ny + height];
    } else {
      let [x1, y1, x2, y2] = drag.original;
      if (drag.handle.includes("n")) y1 = point.y;
      if (drag.handle.includes("s")) y2 = point.y;
      if (drag.handle.includes("w")) x1 = point.x;
      if (drag.handle.includes("e")) x2 = point.x;
      box = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
    }

    if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) setBox(controller, drag.slot, box);
  };

  const finish = (event) => {
    const drag = controller.__h3scMultiDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    consume(event);
    if (drag.mode === "draw") {
      const point = eventPoint(event);
      const box = [Math.min(drag.start.x, point.x), Math.min(drag.start.y, point.y), Math.max(drag.start.x, point.x), Math.max(drag.start.y, point.y)];
      if (box[2] - box[0] >= 12 && box[3] - box[1] >= 12) setBox(controller, drag.slot, box);
    }
    controller.__h3scMultiDrag = null;
    try { canvas.releasePointerCapture?.(event.pointerId); } catch {}
    saveState(controller);
  };

  const cancel = (event) => {
    const drag = controller.__h3scMultiDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    consume(event);
    controller.__h3scMultiDrag = null;
    try { canvas.releasePointerCapture?.(event.pointerId); } catch {}
    applyPreview(controller);
  };

  canvas.addEventListener("pointerdown", begin, true);
  canvas.addEventListener("pointermove", move, true);
  canvas.addEventListener("pointerup", finish, true);
  canvas.addEventListener("pointercancel", cancel, true);

  controller.__h3scMultiCanvasCleanup = () => {
    canvas.removeEventListener("pointerdown", begin, true);
    canvas.removeEventListener("pointermove", move, true);
    canvas.removeEventListener("pointerup", finish, true);
    canvas.removeEventListener("pointercancel", cancel, true);
    canvas.__h3scMultiCanvasEvents = false;
  };
}

function install(node, configuredRaw = null) {
  const controller = node?.__h3scController;
  if (!controller || !node.__h3scTimelineConsolidatedInstalled || node.__h3scMultiKeyInstalled) return false;
  node.__h3scMultiKeyInstalled = true;

  upgradeState(controller, configuredRaw ?? controller.stateWidget?.value);
  if (controller.__h3scDeleteHandler) window.removeEventListener("keydown", controller.__h3scDeleteHandler, true);

  const previousRender = controller.render.bind(controller);
  const previousUpdate = controller.updateControls.bind(controller);
  const previousReload = controller.reloadFromWidgets?.bind(controller);
  const previousDestroy = controller.destroy?.bind(controller);

  controller.sync = () => saveState(controller);
  controller.upsertBox = (slot, bbox) => { if (setBox(controller, slot, bbox)) saveState(controller); };
  controller.removeBox = (slot) => {
    const track = controller.__h3scTimelineExp?.tracks?.[slot];
    if (!track) return;
    track.start = null;
    track.end = null;
    track.keys = [];
    syncLegacyMid(track);
    saveState(controller);
  };

  controller.render = () => {
    previousRender();
    upgradeState(controller, controller.stateWidget?.value);
    controller.__h3scMultiUI = buildUI(controller);
    wireCanvas(controller);
    applyPreview(controller);
  };

  controller.updateControls = () => {
    previousUpdate();
    updateUI(controller);
  };

  if (previousReload) {
    controller.reloadFromWidgets = () => {
      previousReload();
      upgradeState(controller, controller.stateWidget?.value);
      controller.__h3scMultiUI = buildUI(controller);
      wireCanvas(controller);
      applyPreview(controller);
    };
  }

  const keyHandler = (event) => {
    const target = event.target;
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (target instanceof Element && target.closest("input,textarea,select,[contenteditable='true']")) return;
    const exp = controller.__h3scTimelineExp;
    const slot = exp?.selectedSlot;
    if (!slot || !pointAt(exp.tracks[slot], exp.t)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    controller.removeBox(slot);
  };

  controller.__h3scMultiKeyHandler = keyHandler;
  window.addEventListener("keydown", keyHandler, true);
  controller.destroy = () => {
    stopPlayback(controller);
    controller.__h3scMultiCanvasCleanup?.();
    window.removeEventListener("keydown", keyHandler, true);
    previousDestroy?.();
  };

  controller.render();
  return true;
}

function patchWhenReady(node, raw, attempts = 64) {
  if (install(node, raw) || attempts <= 0) return;
  queueMicrotask(() => patchWhenReady(node, raw, attempts - 1));
}

function wrapNodeType(nodeType, nodeData) {
  if (nodeType.prototype.__h3scMultiKeyWrapped) return;
  nodeType.prototype.__h3scMultiKeyWrapped = true;
  const created = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    created?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this, null));
  };
  const configured = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function (info) {
    const index = this.widgets?.findIndex((w) => w.name === "layout_json") ?? -1;
    const raw = index >= 0 && Array.isArray(info?.widgets_values) ? info.widgets_values[index] : null;
    const result = configured?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this, raw));
    return result;
  };
}

if (app?.registerExtension) {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === CANVAS_NODE) wrapNodeType(nodeType, nodeData);
    },
  });
}
