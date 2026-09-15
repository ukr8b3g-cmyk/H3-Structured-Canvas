const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.multikey";
const VISIBLE_SLOTS = ["a", "b", "c"];
const SLOT_LABELS = { a: "A", b: "B", c: "C" };
const SLOT_COLORS = { a: "#ef4444", b: "#3b82f6", c: "#facc15" };
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

function hasV4Timeline(rawValue) {
  const raw = parseObject(rawValue);
  const timeline = parseObject(raw.timeline_experimental);
  return Number(timeline.version) >= 4;
}

function bestMultiKeyRaw(controller, node, preferred = null) {
  const widgetRaw = controller?.stateWidget?.value;
  const savedRaw = node?.properties?.h3scMultiKeyState?.layout_json;
  for (const candidate of [preferred, widgetRaw, savedRaw]) {
    if (candidate != null && hasV4Timeline(candidate)) return candidate;
  }
  return preferred ?? widgetRaw ?? savedRaw;
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
  return {
    slot,
    ui_color: { a: "red", b: "blue", c: "yellow" }[slot] ?? "red",
    bbox_2d: [x1, y1, x2, y2].map(Math.round),
  };
}

function interpolateBox(a, b, t, slot) {
  if (!a && !b) return null;
  if (!a) return cloneBox(b);
  if (!b) return cloneBox(a);
  return normalizeBox(
    { bbox_2d: a.bbox_2d.map((value, index) => value + (b.bbox_2d[index] - value) * t) },
    slot,
  );
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
      const local = clamp((t - left.time) / Math.max(right.time - left.time, 1e-9), 0, 1);
      return interpolateBox(left.bbox, right.bbox, local, slot);
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

function atEndpoint(t) {
  return Number(t) <= EPS || Number(t) >= 1 - EPS;
}

function canEditTrack(track, t) {
  return Boolean(pointAt(track, t)) || (trackEmpty(track) && atEndpoint(t));
}

function keyTimes(track) {
  return (track?.keys ?? [])
    .map((key) => Number(key?.time))
    .filter((time) => Number.isFinite(time) && time > EPS && time < 1 - EPS)
    .sort((a, b) => a - b);
}

function syncLegacyMid(track) {
  if (!track) return;
  const mid = (track.keys ?? []).find((key) => Math.abs(Number(key.time) - 0.5) <= EPS);
  track.mid = mid ? cloneBox(mid.bbox) : null;
  track.midExplicit = Boolean(mid);
}

function importKeys(track, rawTimeline, slot, duration) {
  const rawKeys = Array.isArray(rawTimeline?.keyframes?.[slot]) ? rawTimeline.keyframes[slot] : [];
  const gap = MIN_KEY_GAP_SECONDS / Math.max(normalizeDuration(duration), 1e-9);
  const keys = [];
  for (const item of rawKeys) {
    const time = Number(item?.time ?? item?.t);
    const bbox = normalizeBox(item, slot);
    if (Number.isFinite(time) && time >= gap && time <= 1 - gap && bbox) keys.push({ time, bbox });
  }
  keys.sort((a, b) => a.time - b.time);
  const normalized = [];
  for (const key of keys) {
    const previous = normalized.at(-1);
    if (previous && Math.abs(previous.time - key.time) <= EPS) {
      normalized[normalized.length - 1] = key;
    } else if (previous && key.time - previous.time < gap) {
      continue;
    } else {
      normalized.push(key);
    }
  }
  if (!normalized.length && track?.midExplicit && track.mid) {
    normalized.push({ time: 0.5, bbox: cloneBox(track.mid) });
  }
  track.keys = normalized.slice(0, MAX_INTERMEDIATE_KEYS);
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
    importKeys(exp.tracks[slot], timeline, slot, exp.duration);
  }
}

function serializeLayout(controller) {
  const exp = controller.__h3scTimelineExp;
  const current = parseObject(controller.stateWidget?.value);
  const canvas = {
    ...clone(current.canvas ?? {}),
    ...clone(controller.state?.canvas ?? {}),
  };
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
    if (keys.length) {
      keyframes[slot] = keys.map((key) => ({
        time: Number(key.time.toFixed(6)),
        bbox_2d: [...key.bbox.bbox_2d],
      }));
    }
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

function refreshPreviewState(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  controller.state.canvas.show_boxes = true;
  controller.state.boxes = VISIBLE_SLOTS
    .map((slot) => previewBox(exp.tracks[slot], exp.t, slot))
    .filter(Boolean);
}

function drawPreview(controller) {
  refreshPreviewState(controller);
  controller.draw?.();
}

function assignBox(controller, slot, rawBox, creating = false) {
  const exp = controller.__h3scTimelineExp;
  const track = exp?.tracks?.[slot];
  const box = normalizeBox({ bbox_2d: rawBox }, slot);
  if (!track || !box) return false;

  const point = pointAt(track, exp.t);
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
  controller.state.canvas.active_slot = slot;
  return true;
}

function saveState(controller) {
  const raw = JSON.stringify(serializeLayout(controller));
  const widget = controller.stateWidget;
  if (widget) {
    widget.value = raw;
    widget.serialize = true;
    widget.options = widget.options || {};
    widget.options.serialize = true;
    widget.callback?.(raw, app?.canvas, controller.node, [0, 0], null);
  }
  const node = controller.node;
  if (node) {
    node.properties = node.properties || {};
    node.properties.h3scMultiKeyState = { version: 4, layout_json: raw };
    const widgetIndex = node.widgets?.indexOf(widget) ?? -1;
    if (Array.isArray(node.widgets_values) && widgetIndex >= 0) node.widgets_values[widgetIndex] = raw;
  }
  controller.node?.setDirtyCanvas?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
  refreshAll(controller, true);
}

function setPlayhead(controller, value) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  stopPlayback(controller);
  exp.t = clamp(Number(value) || 0, 0, 1);
  exp.selectedSlot = null;
  refreshAll(controller, true);
}

function setPlayheadSeconds(controller, seconds) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  setPlayhead(controller, clamp(Number(seconds) || 0, 0, exp.duration) / Math.max(exp.duration, 1e-9));
}

function selectKey(controller, slot, time) {
  const exp = controller.__h3scTimelineExp;
  if (!exp?.tracks?.[slot]) return;
  stopPlayback(controller);
  controller.state.canvas.active_slot = slot;
  exp.t = clamp(Number(time) || 0, 0, 1);
  exp.selectedSlot = slot;
  controller.updateControls?.();
  refreshAll(controller, true);
  controller.canvas?.focus?.();
}

function setDuration(controller, value) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  exp.duration = normalizeDuration(value);
  saveState(controller);
}

function addKey(controller) {
  const exp = controller.__h3scTimelineExp;
  const slot = controller.activeSlot;
  const track = exp?.tracks?.[slot];
  if (!track || trackEmpty(track) || exp.t <= EPS || exp.t >= 1 - EPS) return;
  if (pointAt(track, exp.t) || track.keys.length >= MAX_INTERMEDIATE_KEYS) return;
  const gap = MIN_KEY_GAP_SECONDS / exp.duration;
  if ([0, ...track.keys.map((key) => key.time), 1].some((time) => Math.abs(time - exp.t) < gap)) return;
  const bbox = previewBox(track, exp.t, slot);
  if (!bbox) return;
  const key = { time: exp.t, bbox };
  track.keys.push(key);
  track.keys.sort((a, b) => a.time - b.time);
  exp.t = key.time;
  exp.selectedSlot = slot;
  syncLegacyMid(track);
  saveState(controller);
}

function deleteKey(controller) {
  const exp = controller.__h3scTimelineExp;
  const slot = controller.activeSlot;
  const track = exp?.tracks?.[slot];
  const point = pointAt(track, exp?.t);
  if (point?.kind !== "key") return;
  track.keys.splice(point.index, 1);
  syncLegacyMid(track);
  exp.selectedSlot = slot;
  saveState(controller);
}

function jumpKey(controller, direction) {
  const exp = controller.__h3scTimelineExp;
  const track = exp?.tracks?.[controller.activeSlot];
  const times = keyTimes(track);
  if (!times.length) return;
  const target = direction < 0
    ? [...times].reverse().find((time) => time < exp.t - EPS) ?? times[0]
    : times.find((time) => time > exp.t + EPS) ?? times.at(-1);
  selectKey(controller, controller.activeSlot, target);
}

function stopPlayback(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  exp.playing = false;
  if (exp.__multiRaf) cancelAnimationFrame(exp.__multiRaf);
  exp.__multiRaf = 0;
  updateUI(controller, false);
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
    drawPreview(controller);
    updateUI(controller, false);
    if (exp.t >= 1) return stopPlayback(controller);
    exp.__multiRaf = requestAnimationFrame(tick);
  };
  exp.__multiRaf = requestAnimationFrame(tick);
  updateUI(controller, false);
}

function ensureStyles() {
  if (document.getElementById("h3sc-multikey-styles")) return;
  const style = document.createElement("style");
  style.id = "h3sc-multikey-styles";
  style.textContent = `
.h3sc-mk{background:#111314;border:1px solid #343738;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:7px}
.h3sc-mk-head,.h3sc-mk-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.h3sc-mk-title{font-size:10.5px;font-weight:800;color:#48d5cf}
.h3sc-mk-badge{font-size:9.5px;padding:2px 6px;border:1px solid #765e28;border-radius:999px;color:#e4b548;background:#211d13}
.h3sc-mk-state{margin-left:auto;font-size:10px;color:#9ba1a2}
.h3sc-mk-time{font:800 16px/1 ui-monospace,Consolas,monospace;min-width:65px;text-align:right}
.h3sc-mk-current,.h3sc-mk-num{height:28px;background:#101213;color:#eee;border:1px solid #4b4f50;border-radius:5px;padding:3px 6px;text-align:right}
.h3sc-mk-current{width:64px}.h3sc-mk-num{width:68px}
.h3sc-mk-range-wrap{position:relative;flex:1;min-width:180px;height:54px;overflow:visible}
.h3sc-mk-range{position:absolute;left:0;right:0;top:0;width:100%;z-index:1;accent-color:#a7afb1}
.h3sc-mk-layer{position:absolute;left:9px;right:9px;top:25px;height:28px;pointer-events:none;z-index:4;overflow:visible}
.h3sc-mk-marker{position:absolute;top:0;transform:translate(-50%,-50%);min-width:22px;height:16px;padding:0 3px;border:1px solid rgba(0,0,0,.9);border-radius:4px;background:#777;color:#fff;font:800 9px/14px ui-monospace,Consolas,monospace;text-align:center;pointer-events:auto;cursor:ew-resize;z-index:6;box-shadow:0 1px 3px rgba(0,0,0,.75);user-select:none}
.h3sc-mk-marker:hover{filter:brightness(1.15);z-index:8}
.h3sc-mk-marker.active{outline:2px solid #fff;outline-offset:2px;z-index:9}
.h3sc-mk-marker.endpoint{min-width:16px;width:16px;height:16px;padding:0;border-radius:50%;background:#d8dddd;color:#151515;cursor:pointer;font-size:8px}
.h3sc-mk-marker.slot-c{color:#151515}
.h3sc-mk-note{font-size:10px;color:#8f9697}
.h3sc-mk-note.warn{color:#e4b548}
.h3sc-mk-count{margin-left:auto;font:10px/1 ui-monospace,Consolas,monospace;color:#8f9697}
`;
  document.head.append(style);
}

function buildUI(controller) {
  ensureStyles();
  const monitor = controller.root?.querySelector(".h3sc-monitor");
  if (!monitor) return null;
  controller.root.querySelector(".h3sc-timeline-exp")?.remove();
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
    if (event.key !== "Enter") return;
    event.preventDefault();
    setPlayheadSeconds(controller, current.value);
    current.blur();
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
  const ui = { section, play, time, current, range, layer, duration, add, del, prev, next, count, state, note, wrap };
  monitor.after(section);
  return ui;
}

function syncMarkerSelection(controller) {
  const exp = controller.__h3scTimelineExp;
  const ui = controller.__h3scMultiUI;
  if (!exp || !ui?.layer) return;
  const activeSlot = controller.activeSlot;
  for (const marker of ui.layer.querySelectorAll(".h3sc-mk-marker.key")) {
    const time = Number(marker.dataset.time);
    const selected = marker.dataset.slot === activeSlot && Number.isFinite(time) && Math.abs(time - exp.t) <= EPS;
    marker.classList.toggle("active", selected);
  }
}

function expectedMarkerSignature(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return "";
  const parts = [];
  for (const slot of VISIBLE_SLOTS) {
    const keys = (exp.tracks?.[slot]?.keys ?? []).slice().sort((a, b) => a.time - b.time);
    keys.forEach((key, index) => parts.push(`${slot}:${index}:${Number(key.time).toFixed(6)}`));
  }
  return parts.join("|");
}

function renderedMarkerSignature(ui) {
  if (!ui?.layer) return "";
  return [...ui.layer.querySelectorAll(".h3sc-mk-marker.key")]
    .map((marker) => `${marker.dataset.slot}:${marker.dataset.index}:${Number(marker.dataset.time).toFixed(6)}`)
    .join("|");
}

function renderMarkers(controller) {
  const exp = controller.__h3scTimelineExp;
  const ui = controller.__h3scMultiUI;
  if (!ui?.layer || !exp) return;
  ui.layer.replaceChildren();

  const rowTop = { a: 0, b: 10, c: 20 };
  for (const slot of VISIBLE_SLOTS) {
    const track = exp.tracks?.[slot];
    const keys = (track?.keys ?? []).slice().sort((a, b) => a.time - b.time);
    keys.forEach((key, index) => {
      const marker = document.createElement("button");
      marker.className = `h3sc-mk-marker key slot-${slot}`;
      marker.dataset.slot = slot;
      marker.dataset.index = String(index);
      marker.dataset.time = String(key.time);
      marker.style.left = `${key.time * 100}%`;
      marker.style.top = `${rowTop[slot]}px`;
      marker.style.background = SLOT_COLORS[slot];
      marker.textContent = `${SLOT_LABELS[slot]}${index + 1}`;
      marker.setAttribute("aria-label", `${SLOT_LABELS[slot]} key ${index + 1}`);
      marker.title = `${SLOT_LABELS[slot]} Key ${index + 1} · ${(key.time * exp.duration).toFixed(2)}s`;
      marker.onpointerdown = (event) => startMarkerDrag(controller, slot, index, event);
      ui.layer.append(marker);
    });
  }

  const activeTrack = exp.tracks?.[controller.activeSlot];
  if (activeTrack && !trackEmpty(activeTrack)) {
    for (const [label, time] of [["S", 0], ["E", 1]]) {
      const marker = document.createElement("button");
      marker.className = "h3sc-mk-marker endpoint";
      marker.style.left = `${time * 100}%`;
      marker.style.top = "20px";
      marker.textContent = label;
      marker.setAttribute("aria-label", label === "S" ? "Start" : "End");
      marker.title = label === "S" ? "START 0.00s" : `END ${exp.duration.toFixed(2)}s`;
      marker.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPlayhead(controller, time);
      };
      ui.layer.append(marker);
    }
  }

  syncMarkerSelection(controller);
}

function startMarkerDrag(controller, slot, index, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const exp = controller.__h3scTimelineExp;
  const ui = controller.__h3scMultiUI;
  const ref = exp?.tracks?.[slot]?.keys?.[index];
  const marker = event.currentTarget;
  if (!ref || !ui?.layer) return;

  controller.state.canvas.active_slot = slot;
  exp.selectedSlot = slot;
  controller.updateControls?.();
  const rect = ui.layer.getBoundingClientRect();
  const pointerId = event.pointerId;
  const startX = event.clientX;
  let raf = 0;
  let pendingX = startX;
  let moved = false;

  const apply = () => {
    raf = 0;
    const live = exp.tracks[slot];
    if (!live?.keys?.includes(ref)) return;
    const gap = MIN_KEY_GAP_SECONDS / exp.duration;
    const ordered = live.keys.slice().sort((a, b) => a.time - b.time);
    const pos = ordered.indexOf(ref);
    const lo = pos > 0 ? ordered[pos - 1].time + gap : gap;
    const hi = pos < ordered.length - 1 ? ordered[pos + 1].time - gap : 1 - gap;
    ref.time = clamp((pendingX - rect.left) / Math.max(rect.width, 1), lo, hi);
    live.keys.sort((a, b) => a.time - b.time);
    syncLegacyMid(live);
    exp.t = ref.time;
    exp.selectedSlot = slot;
    if (marker?.style) {
      marker.style.left = `${ref.time * 100}%`;
      marker.dataset.time = String(ref.time);
    }
    drawPreview(controller);
    updateUI(controller, false);
  };

  const move = (moveEvent) => {
    if (moveEvent.pointerId !== pointerId) return;
    pendingX = moveEvent.clientX;
    if (Math.abs(pendingX - startX) >= 2) moved = true;
    if (moved && !raf) raf = requestAnimationFrame(apply);
  };

  const cleanup = () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
  };

  const up = (upEvent) => {
    if (upEvent.pointerId !== pointerId) return;
    cleanup();
    if (raf) cancelAnimationFrame(raf);
    if (moved) {
      apply();
      saveState(controller);
    } else {
      selectKey(controller, slot, ref.time);
    }
  };

  const cancel = (cancelEvent) => {
    if (cancelEvent.pointerId !== pointerId) return;
    cleanup();
    if (raf) cancelAnimationFrame(raf);
    selectKey(controller, slot, ref.time);
  };

  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
}

function updateUI(controller, markers = true) {
  const exp = controller.__h3scTimelineExp;
  const ui = controller.__h3scMultiUI;
  if (!exp || !ui) return;

  const slot = controller.activeSlot;
  const track = exp.tracks?.[slot];
  const point = pointAt(track, exp.t);
  const seconds = exp.t * exp.duration;
  const count = track?.keys?.length ?? 0;
  const canCreate = trackEmpty(track) && atEndpoint(exp.t);
  const editable = Boolean(point) || canCreate;

  ui.time.textContent = `${seconds.toFixed(2)}s`;
  if (document.activeElement !== ui.current) {
    ui.current.max = exp.duration.toFixed(2);
    ui.current.value = seconds.toFixed(2);
  }
  ui.range.value = String(Math.round(exp.t * 1000));
  ui.duration.value = exp.duration.toFixed(1);
  ui.play.textContent = exp.playing ? "■" : "▶";
  ui.count.textContent = VISIBLE_SLOTS
    .map((item) => `${SLOT_LABELS[item]}:${exp.tracks?.[item]?.keys?.length ?? 0}`)
    .join(" · ");
  ui.del.disabled = point?.kind !== "key";
  ui.add.disabled = !track || trackEmpty(track) || Boolean(point) || exp.t <= EPS || exp.t >= 1 - EPS || count >= MAX_INTERMEDIATE_KEYS;
  ui.prev.disabled = count === 0;
  ui.next.disabled = count === 0;

  if (controller.drawButton) controller.drawButton.disabled = !editable;
  controller.canvas?.classList.remove("h3sc-timeline-preview-only");
  if (controller.canvas) controller.canvas.style.cursor = editable && controller.drawMode ? "crosshair" : "default";
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
    ui.state.textContent = `${SLOT_LABELS[slot]} KEY ${point.index + 1} · EDIT`;
    ui.note.textContent = `${SLOT_LABELS[slot]}${point.index + 1} at ${seconds.toFixed(2)}s is editable. Drag its colored marker to retime.`;
    ui.note.classList.remove("warn");
  } else if (canCreate) {
    ui.state.textContent = exp.t <= EPS ? "START · DRAW" : "END · DRAW";
    ui.note.textContent = `Slot ${SLOT_LABELS[slot] ?? slot.toUpperCase()} is empty. Draw a new box here.`;
    ui.note.classList.remove("warn");
  } else {
    ui.state.textContent = "PREVIEW ONLY";
    ui.note.textContent = "Use + Key to make the current time editable for the active slot.";
    ui.note.classList.add("warn");
  }

  if (markers) renderMarkers(controller);
  else syncMarkerSelection(controller);
}

function refreshAll(controller, markers = true) {
  refreshPreviewState(controller);
  updateUI(controller, markers);
  controller.draw?.();
}

function hitTest(controller, point) {
  const activeSlot = controller.activeSlot;
  const boxes = [...(controller.state?.boxes ?? [])].filter((box) => VISIBLE_SLOTS.includes(box?.slot));
  boxes.sort((a, b) => {
    if (a.slot === activeSlot && b.slot !== activeSlot) return -1;
    if (b.slot === activeSlot && a.slot !== activeSlot) return 1;
    return 0;
  });

  const tx = 12 / Math.max(point.rect.width, 1) * VIEW_SPAN;
  const ty = 12 / Math.max(point.rect.height, 1) * VIEW_SPAN;
  for (const box of boxes) {
    const [x1, y1, x2, y2] = box.bbox_2d;
    const corners = { nw: [x1, y1], ne: [x2, y1], se: [x2, y2], sw: [x1, y2] };
    for (const [handle, [x, y]] of Object.entries(corners)) {
      if (Math.abs(point.x - x) <= tx && Math.abs(point.y - y) <= ty) return { box, mode: "resize", handle };
    }
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) return { box, mode: "move", handle: null };
  }
  return null;
}

function eventPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(VIEW_MIN + (event.clientX - rect.left) / Math.max(rect.width, 1) * VIEW_SPAN, INTERNAL_MIN, INTERNAL_MAX),
    y: clamp(VIEW_MIN + (event.clientY - rect.top) / Math.max(rect.height, 1) * VIEW_SPAN, INTERNAL_MIN, INTERNAL_MAX),
    rect,
  };
}

function rectFromPoints(a, b) {
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
}

function bindCanvas(controller) {
  const canvas = controller.canvas;
  const exp = controller.__h3scTimelineExp;
  if (!canvas || !exp) return;
  controller.__h3scMultiCanvasCleanup?.();

  let drag = null;

  const begin = (event) => {
    if (event.button !== 0) return;
    const point = eventPoint(canvas, event);
    const activeSlot = controller.activeSlot;
    const activeTrack = exp.tracks?.[activeSlot];
    const activeCanCreate = controller.drawMode && trackEmpty(activeTrack) && atEndpoint(exp.t);

    let slot = activeSlot;
    let mode = null;
    let handle = null;
    let original = null;
    let creating = false;

    if (activeCanCreate) {
      mode = "draw";
      creating = true;
    } else {
      const hit = hitTest(controller, point);
      if (hit) {
        slot = hit.box.slot;
        if (!pointAt(exp.tracks[slot], exp.t)) {
          updateUI(controller, false);
          return;
        }
        mode = hit.mode;
        handle = hit.handle;
        original = [...hit.box.bbox_2d];
      } else if (controller.drawMode && canEditTrack(activeTrack, exp.t)) {
        mode = "draw";
        creating = trackEmpty(activeTrack);
      } else {
        return;
      }
    }

    controller.state.canvas.active_slot = slot;
    exp.selectedSlot = slot;
    drag = {
      pointerId: event.pointerId,
      slot,
      mode,
      handle,
      start: point,
      original,
      creating,
      pending: null,
      raf: 0,
    };

    event.preventDefault();
    event.stopPropagation();
    canvas.focus?.();
    canvas.setPointerCapture?.(event.pointerId);
  };

  const computeBox = (point) => {
    if (!drag) return null;
    if (drag.mode === "draw") return rectFromPoints(drag.start, point);
    if (drag.mode === "move") {
      const [x1, y1, x2, y2] = drag.original;
      const width = x2 - x1;
      const height = y2 - y1;
      const nx = clamp(x1 + point.x - drag.start.x, INTERNAL_MIN, INTERNAL_MAX - width);
      const ny = clamp(y1 + point.y - drag.start.y, INTERNAL_MIN, INTERNAL_MAX - height);
      return [nx, ny, nx + width, ny + height];
    }

    let [x1, y1, x2, y2] = drag.original;
    if (drag.handle.includes("n")) y1 = point.y;
    if (drag.handle.includes("s")) y2 = point.y;
    if (drag.handle.includes("w")) x1 = point.x;
    if (drag.handle.includes("e")) x2 = point.x;
    return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
  };

  const flushLive = () => {
    if (!drag) return;
    drag.raf = 0;
    const box = drag.pending;
    if (!box || box[2] - box[0] < 1 || box[3] - box[1] < 1) return;
    if (assignBox(controller, drag.slot, box, drag.creating)) drawPreview(controller);
  };

  const move = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.pending = computeBox(eventPoint(canvas, event));
    if (!drag.raf) drag.raf = requestAnimationFrame(flushLive);
  };

  const finish = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();

    if (drag.raf) cancelAnimationFrame(drag.raf);
    const box = computeBox(eventPoint(canvas, event));
    const minSize = drag.mode === "draw" ? 12 : 1;
    if (box && box[2] - box[0] >= minSize && box[3] - box[1] >= minSize) {
      assignBox(controller, drag.slot, box, drag.creating);
    }

    const pointerId = drag.pointerId;
    drag = null;
    try { canvas.releasePointerCapture?.(pointerId); } catch {}
    saveState(controller);
  };

  const cancel = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.raf) cancelAnimationFrame(drag.raf);
    const pointerId = drag.pointerId;
    drag = null;
    try { canvas.releasePointerCapture?.(pointerId); } catch {}
    refreshAll(controller, true);
  };

  canvas.onpointerdown = begin;
  canvas.onpointermove = move;
  canvas.onpointerup = finish;
  canvas.onpointercancel = cancel;
  canvas.style.touchAction = "none";

  controller.__h3scMultiCanvas = canvas;
  controller.__h3scMultiCanvasCleanup = () => {
    if (canvas.onpointerdown === begin) canvas.onpointerdown = null;
    if (canvas.onpointermove === move) canvas.onpointermove = null;
    if (canvas.onpointerup === finish) canvas.onpointerup = null;
    if (canvas.onpointercancel === cancel) canvas.onpointercancel = null;
    if (controller.__h3scMultiCanvas === canvas) controller.__h3scMultiCanvas = null;
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
  controller.upsertBox = (slot, bbox) => {
    if (assignBox(controller, slot, bbox, false)) saveState(controller);
  };
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
    upgradeState(controller, bestMultiKeyRaw(controller, node));
    controller.__h3scMultiUI = buildUI(controller);
    bindCanvas(controller);
    refreshAll(controller, true);
  };

  controller.updateControls = () => {
    previousUpdate();
    const ui = controller.__h3scMultiUI;
    const liveUI = Boolean(ui?.section?.isConnected && ui?.layer?.isConnected && controller.root?.contains(ui.section));
    if (!liveUI) {
      controller.__h3scMultiUI = buildUI(controller);
      bindCanvas(controller);
      updateUI(controller, true);
      return;
    }
    updateUI(controller, expectedMarkerSignature(controller) !== renderedMarkerSignature(ui));
  };

  if (previousReload) {
    controller.reloadFromWidgets = () => {
      const raw = bestMultiKeyRaw(controller, node);
      previousReload();
      upgradeState(controller, raw);
      controller.__h3scMultiUI = buildUI(controller);
      bindCanvas(controller);
      saveState(controller);
    };
  }

  const keyHandler = (event) => {
    const target = event.target;
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (target instanceof Element && target.closest("input,textarea,select,[contenteditable='true']")) return;
    const exp = controller.__h3scTimelineExp;
    const slot = controller.activeSlot;
    const point = pointAt(exp?.tracks?.[slot], exp?.t);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    if (point.kind === "key") {
      deleteKey(controller);
    } else {
      controller.removeBox(slot);
    }
  };

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

function repairMultiKeyUI(controller) {
  if (!controller?.root || !controller.__h3scTimelineExp) return;
  const ui = controller.__h3scMultiUI;
  const liveUI = Boolean(ui?.section?.isConnected && ui?.layer?.isConnected && controller.root.contains(ui.section));
  if (!liveUI) {
    controller.__h3scMultiUI = buildUI(controller);
    bindCanvas(controller);
    refreshAll(controller, true);
    return;
  }
  if (expectedMarkerSignature(controller) !== renderedMarkerSignature(ui)) renderMarkers(controller);
  else syncMarkerSelection(controller);
}

function restoreInstalled(node, raw = null) {
  const controller = node?.__h3scController;
  if (!controller || !node.__h3scMultiKeyInstalled) return false;
  const source = bestMultiKeyRaw(controller, node, raw);
  if (source != null) upgradeState(controller, source);
  repairMultiKeyUI(controller);
  saveState(controller);
  return true;
}

function repairVisibleMultiKeyNodes() {
  for (const node of app?.graph?._nodes ?? []) {
    if (!node?.__h3scMultiKeyInstalled) continue;
    const controller = node.__h3scController;
    if (!controller?.root?.isConnected) continue;
    repairMultiKeyUI(controller);
  }
}

function installLifecycleRepairHooks() {
  if (window.__h3scMultiKeyLifecycleRepair) return;
  window.__h3scMultiKeyLifecycleRepair = true;
  const repair = () => requestAnimationFrame(() => repairVisibleMultiKeyNodes());
  window.addEventListener("focus", repair, true);
  window.addEventListener("pageshow", repair, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) repair();
  }, true);
}

function patchWhenReady(node, raw, attempts = 64) {
  if (node?.__h3scMultiKeyInstalled) return restoreInstalled(node, raw);
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
    const index = this.widgets?.findIndex((widget) => widget.name === "layout_json") ?? -1;
    const raw = index >= 0 && Array.isArray(info?.widgets_values) ? info.widgets_values[index] : null;
    const result = configured?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this, raw));
    return result;
  };
}

if (app?.registerExtension) {
  app.registerExtension({
    name: EXTENSION_NAME,
    setup() {
      installLifecycleRepairHooks();
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === CANVAS_NODE) wrapNodeType(nodeType, nodeData);
    },
  });
}
