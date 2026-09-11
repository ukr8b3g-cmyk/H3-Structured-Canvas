const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.v1";
const VISIBLE_SLOTS = ["a", "b", "c"];
const SLOT_COLORS = { a: "#ef4444", b: "#3b82f6", c: "#facc15" };
const SLOT_LABELS = { a: "A", b: "B", c: "C" };
const DURATION_SECONDS = 5.0;
const ENDPOINT_EPSILON = 0.0005;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizedBox(raw, slot) {
  if (!raw || typeof raw !== "object") return null;
  const source = raw.bbox_2d ?? raw.bbox;
  if (!Array.isArray(source) || source.length !== 4) return null;
  const values = source.map(Number);
  if (!values.every(Number.isFinite)) return null;
  let [x1, y1, x2, y2] = values.map((value) => clamp(value, 0, 1000));
  if (Math.max(...values.map(Math.abs)) <= 1.000001) {
    [x1, y1, x2, y2] = values.map((value) => clamp(value * 1000, 0, 1000));
  }
  [x1, x2] = x1 <= x2 ? [x1, x2] : [x2, x1];
  [y1, y2] = y1 <= y2 ? [y1, y2] : [y2, y1];
  if (x2 - x1 < 1 || y2 - y1 < 1) return null;
  return {
    slot,
    ui_color: { a: "red", b: "blue", c: "yellow", d: "green", e: "magenta" }[slot] ?? "red",
    bbox_2d: [x1, y1, x2, y2].map((value) => Math.round(value)),
  };
}

function mapBoxes(items) {
  const result = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const slot = String(item?.slot ?? "").trim().toLowerCase();
    if (!["a", "b", "c", "d", "e"].includes(slot)) continue;
    const box = normalizedBox(item, slot);
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
  const bbox = start.bbox_2d.map((value, index) => Math.round(value + (end.bbox_2d[index] - value) * t));
  return normalizedBox({ bbox_2d: bbox }, slot);
}

function isEndpoint(t) {
  return t <= ENDPOINT_EPSILON || t >= 1 - ENDPOINT_EPSILON;
}

function endpointName(t) {
  if (t <= ENDPOINT_EPSILON) return "start";
  if (t >= 1 - ENDPOINT_EPSILON) return "end";
  return null;
}

function setWidgetValue(widget, value, node) {
  if (!widget) return;
  widget.value = value;
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

function ensureExperimentalStyles() {
  if (document.getElementById("h3sc-timeline-exp-v1-styles")) return;
  const style = document.createElement("style");
  style.id = "h3sc-timeline-exp-v1-styles";
  style.textContent = `
.h3sc-exp-size-panel{background:#181a1b;border:1px solid #343738;border-radius:8px;padding:8px}
.h3sc-exp-size-panel .h3sc-section-title{margin-bottom:5px}
.h3sc-timeline-exp{background:#111314;border:1px solid #343738;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:7px;flex:0 0 auto}
.h3sc-timeline-exp-head{display:flex;align-items:center;gap:7px;min-width:0}
.h3sc-timeline-exp-title{font-size:10.5px;font-weight:800;color:#48d5cf;letter-spacing:.04em;text-transform:uppercase}
.h3sc-timeline-exp-badge{font-size:9.5px;padding:2px 6px;border:1px solid #765e28;border-radius:999px;color:#e4b548;background:#211d13}
.h3sc-timeline-exp-spacer{flex:1 1 auto}
.h3sc-timeline-exp-state{font-size:10px;color:#9ba1a2;white-space:nowrap}
.h3sc-timeline-exp-controls{display:grid;grid-template-columns:auto auto minmax(140px,1fr) auto;gap:8px;align-items:center}
.h3sc-timeline-exp-play{min-width:40px;height:30px;padding:0 9px}
.h3sc-timeline-exp-time{font:11px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:#d7dddd;min-width:46px;text-align:right}
.h3sc-timeline-exp-range{width:100%;accent-color:#48d5cf;cursor:pointer}
.h3sc-timeline-exp-range:focus{outline:1px solid #48d5cf;outline-offset:2px}
.h3sc-timeline-exp-end{font:10.5px/1 ui-monospace,SFMono-Regular,Consolas,monospace;color:#8f9697}
.h3sc-timeline-exp-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.h3sc-timeline-exp-slot{display:inline-flex;align-items:center;gap:4px;color:#cfd2d3;font-size:10px}
.h3sc-timeline-exp-dot{width:9px;height:9px;border-radius:2px;border:1px solid rgba(255,255,255,.35)}
.h3sc-timeline-exp-note{font-size:10px;color:#8f9697;margin-left:auto}
.h3sc-timeline-exp-note.warning{color:#e4b548}
.h3sc-timeline-preview-only{cursor:not-allowed!important}
.h3sc-exp-prompter-note{font-size:10px;color:#e4b548;margin-left:auto;align-self:center}
.h3sc-exp-motion-locked{opacity:.72}
@media(max-width:700px){.h3sc-timeline-exp-controls{grid-template-columns:auto auto minmax(100px,1fr) auto}.h3sc-timeline-exp-note{width:100%;margin-left:0}}
`;
  document.head.append(style);
}

function buildExperimentState(controller, rawPayload) {
  const raw = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const starts = mapBoxes(raw.boxes ?? raw.layout?.boxes ?? controller.state?.boxes ?? []);
  const ends = mapBoxes(raw.transition?.end_boxes ?? []);
  const hidden = new Map();
  for (const slot of ["d", "e"]) {
    const box = starts.get(slot);
    if (box) hidden.set(slot, cloneBox(box));
  }
  const tracks = {};
  for (const slot of VISIBLE_SLOTS) {
    const start = starts.get(slot) ?? null;
    const end = ends.get(slot) ?? start;
    tracks[slot] = {
      start: cloneBox(start ?? end),
      end: cloneBox(end ?? start),
    };
  }
  return {
    version: 1,
    duration: DURATION_SECONDS,
    interpolation: "linear",
    t: 0,
    tracks,
    hiddenBoxes: hidden,
    playing: false,
    raf: 0,
    suppressCapture: false,
    ui: null,
  };
}

function captureEndpoint(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp || exp.suppressCapture) return;
  const endpoint = endpointName(exp.t);
  if (!endpoint) return;
  const current = mapBoxes(controller.state?.boxes ?? []);
  for (const slot of VISIBLE_SLOTS) {
    const box = current.get(slot);
    if (box) {
      exp.tracks[slot][endpoint] = cloneBox(box);
      const other = endpoint === "start" ? "end" : "start";
      if (!exp.tracks[slot][other]) exp.tracks[slot][other] = cloneBox(box);
    } else {
      exp.tracks[slot][endpoint] = null;
    }
  }
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
  const endBoxes = [];
  for (const slot of VISIBLE_SLOTS) {
    const track = exp.tracks[slot];
    if (track?.start) startBoxes.push(cloneBox(track.start));
    if (track?.end) endBoxes.push(cloneBox(track.end));
  }
  for (const slot of ["d", "e"]) {
    const hidden = exp.hiddenBoxes.get(slot);
    if (hidden) {
      startBoxes.push(cloneBox(hidden));
      endBoxes.push(cloneBox(hidden));
    }
  }

  return {
    schema: controller.state?.schema ?? "h3_structured_canvas/0.9",
    canvas,
    boxes: startBoxes,
    transition: {
      end_canvas: deepClone(canvas),
      end_boxes: endBoxes,
    },
    timeline_experimental: {
      version: 1,
      slots: ["a", "b", "c"],
      duration_seconds: exp.duration,
      interpolation: "linear",
      canonical_time: "normalized_0_1",
    },
  };
}

function applyPreview(controller, { draw = true } = {}) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  const preview = [];
  for (const slot of VISIBLE_SLOTS) {
    const track = exp.tracks[slot];
    const box = interpolateBox(track?.start, track?.end, exp.t, slot);
    if (box) preview.push(box);
  }
  exp.suppressCapture = true;
  controller.state.canvas.show_boxes = true;
  if (!VISIBLE_SLOTS.includes(controller.state.canvas.active_slot)) controller.state.canvas.active_slot = "a";
  controller.state.boxes = preview;
  exp.suppressCapture = false;
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

  if (isEndpoint(exp.t)) captureEndpoint(controller);

  setWidgetValue(controller.widthWidget, controller.state.canvas.width, controller.node);
  setWidgetValue(controller.heightWidget, controller.state.canvas.height, controller.node);
  setWidgetValue(controller.stateWidget, JSON.stringify(serializedLayout(controller)), controller.node);
  controller.updateControls?.();
  applyPreview(controller);
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
  applyPreview(controller);
}

function startPlayback(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp) return;
  if (exp.playing) {
    stopPlayback(controller);
    return;
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    setPlayhead(controller, 1);
    return;
  }
  if (exp.t >= 1 - ENDPOINT_EPSILON) exp.t = 0;
  exp.playing = true;
  const startT = exp.t;
  const startTime = performance.now();
  updateTimelineUI(controller);
  const tick = (now) => {
    if (!exp.playing) return;
    const elapsed = Math.max(0, now - startTime) / 1000;
    exp.t = clamp(startT + elapsed / exp.duration, 0, 1);
    applyPreview(controller);
    if (exp.t >= 1) {
      exp.playing = false;
      exp.raf = 0;
      updateTimelineUI(controller);
      return;
    }
    exp.raf = requestAnimationFrame(tick);
  };
  exp.raf = requestAnimationFrame(tick);
}

function updateTimelineUI(controller) {
  const exp = controller.__h3scTimelineExp;
  if (!exp?.ui) return;
  const seconds = exp.t * exp.duration;
  exp.ui.range.value = String(Math.round(exp.t * 1000));
  exp.ui.time.textContent = `${seconds.toFixed(2)}s`;
  exp.ui.play.textContent = exp.playing ? "■" : "▶";
  exp.ui.play.title = exp.playing ? "Stop preview" : "Play preview";
  const endpoint = endpointName(exp.t);
  if (endpoint === "start") {
    exp.ui.state.textContent = "START · EDIT";
    exp.ui.note.textContent = "Start position is editable.";
    exp.ui.note.classList.remove("warning");
  } else if (endpoint === "end") {
    exp.ui.state.textContent = "END · EDIT";
    exp.ui.note.textContent = "End position is editable.";
    exp.ui.note.classList.remove("warning");
  } else {
    exp.ui.state.textContent = "PREVIEW ONLY";
    exp.ui.note.textContent = "Move playhead to 0.00s or 5.00s to edit.";
    exp.ui.note.classList.add("warning");
  }
  if (controller.drawButton) controller.drawButton.disabled = !endpoint;
  const deleteButton = controller.root?.querySelector(".h3sc-toolbar .h3sc-btn.danger");
  if (deleteButton) deleteButton.disabled = !endpoint;
  if (controller.canvas) controller.canvas.classList.toggle("h3sc-timeline-preview-only", !endpoint);
}

function timelineElement(controller) {
  const exp = controller.__h3scTimelineExp;
  const section = document.createElement("section");
  section.className = "h3sc-timeline-exp";

  const head = document.createElement("div");
  head.className = "h3sc-timeline-exp-head";
  const title = document.createElement("span");
  title.className = "h3sc-timeline-exp-title";
  title.textContent = "3-Slot Timeline";
  const badge = document.createElement("span");
  badge.className = "h3sc-timeline-exp-badge";
  badge.textContent = "EXPERIMENTAL V1";
  const spacer = document.createElement("span");
  spacer.className = "h3sc-timeline-exp-spacer";
  const state = document.createElement("span");
  state.className = "h3sc-timeline-exp-state";
  head.append(title, badge, spacer, state);

  const controls = document.createElement("div");
  controls.className = "h3sc-timeline-exp-controls";
  const play = document.createElement("button");
  play.type = "button";
  play.className = "h3sc-btn h3sc-timeline-exp-play";
  play.textContent = "▶";
  play.addEventListener("click", () => startPlayback(controller));
  const time = document.createElement("span");
  time.className = "h3sc-timeline-exp-time";
  const range = document.createElement("input");
  range.type = "range";
  range.className = "h3sc-timeline-exp-range";
  range.min = "0";
  range.max = "1000";
  range.step = "1";
  range.setAttribute("aria-label", "Timeline playhead");
  range.addEventListener("input", () => setPlayhead(controller, Number(range.value) / 1000));
  const end = document.createElement("span");
  end.className = "h3sc-timeline-exp-end";
  end.textContent = `${exp.duration.toFixed(2)}s`;
  controls.append(play, time, range, end);

  const meta = document.createElement("div");
  meta.className = "h3sc-timeline-exp-meta";
  for (const slot of VISIBLE_SLOTS) {
    const item = document.createElement("span");
    item.className = "h3sc-timeline-exp-slot";
    const dot = document.createElement("span");
    dot.className = "h3sc-timeline-exp-dot";
    dot.style.background = SLOT_COLORS[slot];
    item.append(dot, document.createTextNode(SLOT_LABELS[slot]));
    meta.append(item);
  }
  const linear = document.createElement("span");
  linear.className = "h3sc-timeline-exp-slot";
  linear.textContent = "Linear Start → End";
  meta.append(linear);
  const note = document.createElement("span");
  note.className = "h3sc-timeline-exp-note";
  meta.append(note);

  section.append(head, controls, meta);
  exp.ui = { section, play, time, range, state, note };
  return section;
}

function guardCanvasEditing(controller) {
  const canvas = controller.canvas;
  if (!canvas || canvas.__h3scTimelineExpGuarded) return;
  canvas.__h3scTimelineExpGuarded = true;
  const pointerDown = canvas.onpointerdown;
  const keyDown = canvas.onkeydown;
  canvas.onpointerdown = (event) => {
    if (!isEndpoint(controller.__h3scTimelineExp?.t ?? 0)) {
      event.preventDefault();
      event.stopPropagation();
      controller.__h3scTimelineExp?.ui?.note?.classList.add("warning");
      return;
    }
    pointerDown?.call(canvas, event);
  };
  canvas.onkeydown = (event) => {
    if (!isEndpoint(controller.__h3scTimelineExp?.t ?? 0) && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    keyDown?.call(canvas, event);
  };
}

function applyCanvasExperimentalDOM(controller) {
  ensureExperimentalStyles();
  const root = controller.root;
  const shell = root?.querySelector(".h3sc-shell");
  if (!shell) return;

  controller.state.canvas.show_boxes = true;
  if (!VISIBLE_SLOTS.includes(controller.state.canvas.active_slot)) controller.state.canvas.active_slot = "a";

  const toolbar = shell.querySelector(".h3sc-toolbar");
  if (toolbar) {
    controller.showButton?.remove();
    const ordinaryButtons = [...toolbar.querySelectorAll(":scope > button.h3sc-btn")];
    const deleteButton = ordinaryButtons.find((button) => button.classList.contains("danger"));
    for (const button of ordinaryButtons) {
      if (button === controller.drawButton || button === deleteButton) continue;
      button.remove();
    }
    if (controller.drawButton) controller.drawButton.textContent = controller.drawMode ? "Draw" : "Move";
    if (deleteButton) deleteButton.textContent = "Delete Selected";
    toolbar.querySelectorAll(".h3sc-slot-button").forEach((button) => {
      if (!VISIBLE_SLOTS.includes(button.dataset.slot)) button.remove();
    });
  }

  const panels = shell.querySelector(".h3sc-panels");
  if (panels) {
    const sizePanel = panels.firstElementChild;
    if (sizePanel) {
      sizePanel.classList.add("h3sc-exp-size-panel");
      const toolbarNode = shell.querySelector(".h3sc-toolbar");
      shell.insertBefore(sizePanel, toolbarNode ?? shell.firstChild);
    }
    panels.remove();
  }

  const monitor = shell.querySelector(".h3sc-monitor");
  if (monitor && !shell.querySelector(".h3sc-timeline-exp")) monitor.after(timelineElement(controller));

  const hints = [...shell.querySelectorAll(":scope > .h3sc-note")];
  for (const hint of hints) hint.remove();

  guardCanvasEditing(controller);
  updateTimelineUI(controller);
}

function installCanvasExperimental(node) {
  const controller = node?.__h3scController;
  if (!controller || node.__h3scTimelineExperimentalInstalled) return;
  node.__h3scTimelineExperimentalInstalled = true;
  ensureExperimentalStyles();

  const raw = parseObject(controller.stateWidget?.value);
  controller.__h3scTimelineExp = buildExperimentState(controller, raw);
  controller.state.canvas.show_boxes = true;
  controller.state.canvas.active_slot = VISIBLE_SLOTS.includes(controller.state.canvas.active_slot) ? controller.state.canvas.active_slot : "a";

  const originalRender = controller.render.bind(controller);
  const originalReload = controller.reloadFromWidgets.bind(controller);
  const originalUpdateControls = controller.updateControls.bind(controller);
  const originalRemoveBox = controller.removeBox.bind(controller);
  const originalDestroy = controller.destroy.bind(controller);

  controller.sync = () => writeExperimentalState(controller);
  controller.updateControls = () => {
    originalUpdateControls();
    if (controller.drawButton) controller.drawButton.textContent = controller.drawMode ? "Draw" : "Move";
    updateTimelineUI(controller);
  };
  controller.removeBox = (slot) => {
    if (!VISIBLE_SLOTS.includes(slot)) return;
    const exp = controller.__h3scTimelineExp;
    exp.tracks[slot].start = null;
    exp.tracks[slot].end = null;
    exp.suppressCapture = true;
    controller.state.boxes = controller.state.boxes.filter((box) => box.slot !== slot);
    exp.suppressCapture = false;
    writeExperimentalState(controller);
  };
  controller.render = () => {
    originalRender();
    applyCanvasExperimentalDOM(controller);
    applyPreview(controller);
  };
  controller.reloadFromWidgets = () => {
    const nextRaw = parseObject(controller.stateWidget?.value);
    controller.__h3scTimelineExp = buildExperimentState(controller, nextRaw);
    originalReload();
    controller.state.canvas.show_boxes = true;
    applyPreview(controller);
  };
  controller.destroy = () => {
    stopPlayback(controller);
    originalDestroy();
  };

  controller.__h3scTimelineOriginalRemoveBox = originalRemoveBox;

  controller.render();
  writeExperimentalState(controller);
}

function applyPrompterExperimentalState(controller) {
  if (!controller?.state) return;
  for (const slot of VISIBLE_SLOTS) {
    if (controller.state.slots?.[slot]) controller.state.slots[slot].motion = "start_end";
  }
  for (const slot of ["d", "e"]) {
    if (controller.state.slots?.[slot]) controller.state.slots[slot].enabled = false;
  }
  controller.state.camera = { motion: "Static Shot", speed: "auto", amplitude: "auto" };
  controller.state.soundscape = "";
  controller.state.music = "";
  controller.state.custom_instruction = "";
}

function applyPrompterExperimentalDOM(controller) {
  ensureExperimentalStyles();
  const root = controller.root;
  const scroll = root?.querySelector(".h3sc-scroll");
  if (!scroll) return;

  const topbar = scroll.querySelector(":scope > .h3sc-topbar");
  if (topbar) {
    const fields = [...topbar.querySelectorAll(":scope > .h3sc-field")];
    fields.slice(1).forEach((field) => field.remove());
    [...topbar.querySelectorAll(":scope > button")].forEach((button) => button.remove());
    if (!topbar.querySelector(".h3sc-exp-prompter-note")) {
      const note = document.createElement("span");
      note.className = "h3sc-exp-prompter-note";
      note.textContent = "3-Slot Timeline Experimental · A/B/C Start → End";
      topbar.append(note);
    }
  }

  scroll.querySelectorAll(":scope > .h3sc-slot-card").forEach((card) => {
    const slot = card.querySelector(".h3sc-slot-chip")?.textContent?.trim()?.toLowerCase();
    if (slot === "d" || slot === "e") {
      card.remove();
      return;
    }
    if (slot === "a" || slot === "b" || slot === "c") {
      const selects = card.querySelectorAll(".h3sc-slot-controls select");
      const motion = selects[1];
      if (motion) {
        motion.value = "start_end";
        motion.disabled = true;
        motion.classList.add("h3sc-exp-motion-locked");
        motion.title = "Controlled by 3-Slot Timeline Experimental";
      }
    }
  });

  scroll.querySelectorAll(":scope > .h3sc-card, :scope > details.h3sc-details").forEach((element) => element.remove());
}

function installPrompterExperimental(node) {
  const controller = node?.__h3scController;
  if (!controller || node.__h3scPrompterExperimentalInstalled) return;
  node.__h3scPrompterExperimentalInstalled = true;
  ensureExperimentalStyles();

  const originalRender = controller.render.bind(controller);
  const originalSync = controller.sync.bind(controller);
  const originalReload = controller.reloadFromWidgets?.bind(controller);

  controller.sync = () => {
    applyPrompterExperimentalState(controller);
    originalSync();
  };
  controller.render = () => {
    applyPrompterExperimentalState(controller);
    originalRender();
    applyPrompterExperimentalDOM(controller);
  };
  if (originalReload) {
    controller.reloadFromWidgets = () => {
      originalReload();
      applyPrompterExperimentalState(controller);
      controller.render();
      controller.sync();
    };
  }

  applyPrompterExperimentalState(controller);
  controller.render();
  controller.sync();
}

function wrapNodeType(nodeType, nodeData) {
  if (nodeType.prototype.__h3scTimelineExperimentalWrapped) return;
  nodeType.prototype.__h3scTimelineExperimentalWrapped = true;

  const previousCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    previousCreated?.apply(this, arguments);
    queueMicrotask(() => {
      if (nodeData.name === CANVAS_NODE) installCanvasExperimental(this);
      if (nodeData.name === PROMPTER_NODE) installPrompterExperimental(this);
    });
  };

  const previousConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function () {
    previousConfigure?.apply(this, arguments);
    queueMicrotask(() => {
      if (nodeData.name === CANVAS_NODE) {
        if (!this.__h3scTimelineExperimentalInstalled) installCanvasExperimental(this);
        else this.__h3scController?.reloadFromWidgets?.();
      }
      if (nodeData.name === PROMPTER_NODE) {
        if (!this.__h3scPrompterExperimentalInstalled) installPrompterExperimental(this);
        else {
          applyPrompterExperimentalState(this.__h3scController);
          this.__h3scController?.render?.();
          this.__h3scController?.sync?.();
        }
      }
    });
  };
}

if (!app?.registerExtension) {
  console.error("[H3 Structured Canvas Timeline Experimental] ComfyUI app API was not found.");
} else {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === CANVAS_NODE || nodeData.name === PROMPTER_NODE) wrapNodeType(nodeType, nodeData);
    },
  });
  console.info("[H3 Structured Canvas] 3-Slot Timeline Experimental V1 loaded");
}
