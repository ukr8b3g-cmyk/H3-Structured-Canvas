const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.experimental.v2";
const OFFSCREEN_MIN = -1000;
const OFFSCREEN_MAX = 2000;
const ENDPOINT_EPSILON = 0.0005;
const VISIBLE_SLOTS = ["a", "b", "c"];
const SLOT_COLORS = { a: "#ef4444", b: "#3b82f6", c: "#facc15" };
const SLOT_LABELS = { a: "A", b: "B", c: "C" };

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function findWidget(node, name) {
  return node?.widgets?.find((widget) => widget.name === name) ?? null;
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

function normalizeLooseBox(raw, slot) {
  if (!raw || typeof raw !== "object") return null;
  const source = raw.bbox_2d ?? raw.bbox;
  if (!Array.isArray(source) || source.length !== 4) return null;
  let values = source.map(Number);
  if (!values.every(Number.isFinite)) return null;
  if (Math.max(...values.map(Math.abs)) <= 1.000001) values = values.map((value) => value * 1000);
  let [x1, y1, x2, y2] = values.map((value) => clamp(value, OFFSCREEN_MIN, OFFSCREEN_MAX));
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
    if (!["a", "b", "c", "d", "e"].includes(slot)) continue;
    const box = normalizeLooseBox(item, slot);
    if (box) result.set(slot, box);
  }
  return result;
}

function cloneBox(box) {
  return box ? { ...box, bbox_2d: [...box.bbox_2d] } : null;
}

function endpointName(t) {
  if (Number(t) <= ENDPOINT_EPSILON) return "start";
  if (Number(t) >= 1 - ENDPOINT_EPSILON) return "end";
  return null;
}

function interpolateLooseBox(start, end, t, slot) {
  if (!start && !end) return null;
  if (!start) return cloneBox(end);
  if (!end) return cloneBox(start);
  return normalizeLooseBox({
    bbox_2d: start.bbox_2d.map(
      (value, index) => value + (end.bbox_2d[index] - value) * t,
    ),
  }, slot);
}

function rawTimelineTracks(node) {
  const widget = findWidget(node, "layout_json");
  const raw = parseObject(widget?.value) ?? {};
  const starts = boxMap(raw.boxes ?? raw.layout?.boxes ?? []);
  const ends = boxMap(raw.transition?.end_boxes ?? []);
  const tracks = {};
  for (const slot of VISIBLE_SLOTS) {
    const start = starts.get(slot) ?? null;
    const end = ends.get(slot) ?? start;
    tracks[slot] = {
      start: cloneBox(start ?? end),
      end: cloneBox(end ?? start),
    };
  }
  return tracks;
}

function mergeRawTracks(controller) {
  const exp = controller?.__h3scTimelineExp;
  if (!exp?.tracks) return;
  const raw = rawTimelineTracks(controller.node);
  for (const slot of VISIBLE_SLOTS) {
    if (raw[slot]?.start || raw[slot]?.end) exp.tracks[slot] = raw[slot];
  }
}

function setLoosePreviewState(controller) {
  const exp = controller?.__h3scTimelineExp;
  if (!exp?.tracks) return;
  const preview = [];
  for (const slot of VISIBLE_SLOTS) {
    const track = exp.tracks[slot];
    const box = interpolateLooseBox(track?.start, track?.end, Number(exp.t) || 0, slot);
    if (box) preview.push(box);
  }
  controller.state.boxes = preview;
}

function captureLooseEndpoint(controller) {
  const exp = controller?.__h3scTimelineExp;
  const endpoint = endpointName(exp?.t);
  if (!exp?.tracks || !endpoint) return;
  const current = boxMap(controller.state?.boxes ?? []);
  for (const slot of VISIBLE_SLOTS) {
    const box = current.get(slot) ?? null;
    exp.tracks[slot] = exp.tracks[slot] || { start: null, end: null };
    exp.tracks[slot][endpoint] = cloneBox(box);
    const other = endpoint === "start" ? "end" : "start";
    if (!exp.tracks[slot][other] && box) exp.tracks[slot][other] = cloneBox(box);
  }
}

function outsideSide(box) {
  if (!box?.bbox_2d) return null;
  const [x1, y1, x2, y2] = box.bbox_2d;
  if (x2 <= 0) return "left";
  if (x1 >= 1000) return "right";
  if (y2 <= 0) return "top";
  if (y1 >= 1000) return "bottom";
  return null;
}

function markerPoint(box) {
  const side = outsideSide(box);
  if (!side) return null;
  const [x1, y1, x2, y2] = box.bbox_2d;
  const cx = clamp((x1 + x2) / 2, 70, 930);
  const cy = clamp((y1 + y2) / 2, 45, 955);
  if (side === "left") return { side, x: 35, y: cy };
  if (side === "right") return { side, x: 965, y: cy };
  if (side === "top") return { side, x: cx, y: 25 };
  return { side, x: cx, y: 975 };
}

function drawOffscreenMarkers(controller) {
  const canvas = controller?.canvas;
  const ctx = canvas?.getContext?.("2d");
  if (!canvas || !ctx) return;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "700 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const box of controller.state?.boxes ?? []) {
    const marker = markerPoint(box);
    if (!marker) continue;
    const px = marker.x / 1000 * width;
    const py = marker.y / 1000 * height;
    const color = SLOT_COLORS[box.slot] ?? "#ddd";
    const label = `${SLOT_LABELS[box.slot] ?? String(box.slot).toUpperCase()} ${marker.side.toUpperCase()} OFF`;
    const markerWidth = Math.min(92, Math.max(62, ctx.measureText(label).width + 14));
    const markerHeight = 20;
    const left = clamp(px - markerWidth / 2, 2, width - markerWidth - 2);
    const top = clamp(py - markerHeight / 2, 2, height - markerHeight - 2);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "#111";
    ctx.fillRect(left, top, markerWidth, markerHeight);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left, top, markerWidth, markerHeight);
    ctx.fillStyle = color;
    ctx.fillText(label, left + markerWidth / 2, top + markerHeight / 2 + 0.5);
  }
  ctx.restore();
}

function offscreenMarkerHit(controller, point) {
  for (const box of controller.state?.boxes ?? []) {
    const marker = markerPoint(box);
    if (!marker) continue;
    if (Math.abs(point.x - marker.x) <= 85 && Math.abs(point.y - marker.y) <= 55) {
      return { box, mode: "move", handle: null };
    }
  }
  return null;
}

function patchCanvasPointerMove(controller) {
  const canvas = controller?.canvas;
  if (!canvas || canvas.__h3scExperimentalV2PointerMove) return;
  canvas.__h3scExperimentalV2PointerMove = true;
  canvas.onpointermove = (event) => {
    if (!controller.drag || event.pointerId !== controller.drag.pointerId) return;
    event.preventDefault();
    const point = controller.eventPoint(event);
    const [ox1, oy1, ox2, oy2] = controller.drag.original;
    let box;
    if (controller.drag.mode === "draw") {
      box = [
        Math.min(controller.drag.start.x, point.x),
        Math.min(controller.drag.start.y, point.y),
        Math.max(controller.drag.start.x, point.x),
        Math.max(controller.drag.start.y, point.y),
      ];
    } else if (controller.drag.mode === "move") {
      const dx = point.x - controller.drag.start.x;
      const dy = point.y - controller.drag.start.y;
      const width = ox2 - ox1;
      const height = oy2 - oy1;
      const x1 = clamp(ox1 + dx, OFFSCREEN_MIN, OFFSCREEN_MAX - width);
      const y1 = clamp(oy1 + dy, OFFSCREEN_MIN, OFFSCREEN_MAX - height);
      box = [x1, y1, x1 + width, y1 + height];
    } else {
      let [x1, y1, x2, y2] = [ox1, oy1, ox2, oy2];
      if (controller.drag.handle?.includes("n")) y1 = point.y;
      if (controller.drag.handle?.includes("s")) y2 = point.y;
      if (controller.drag.handle?.includes("w")) x1 = point.x;
      if (controller.drag.handle?.includes("e")) x2 = point.x;
      box = [
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.max(x1, x2),
        Math.max(y1, y2),
      ];
    }
    if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) controller.upsertBox(controller.activeSlot, box);
  };
}

function installOffscreenCanvas(node) {
  const controller = node?.__h3scController;
  const exp = controller?.__h3scTimelineExp;
  if (!controller || !exp?.tracks || node.__h3scExperimentalV2CanvasInstalled) return false;
  node.__h3scExperimentalV2CanvasInstalled = true;

  mergeRawTracks(controller);

  const previousSync = controller.sync.bind(controller);
  const previousRender = controller.render.bind(controller);
  const previousReload = controller.reloadFromWidgets?.bind(controller);
  const previousRemoveBox = controller.removeBox.bind(controller);
  const previousDraw = controller.draw.bind(controller);
  const previousHitTest = controller.hitTest.bind(controller);

  controller.eventPoint = (event) => {
    const rect = controller.canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / Math.max(rect.width, 1) * 1000, OFFSCREEN_MIN, OFFSCREEN_MAX),
      y: clamp((event.clientY - rect.top) / Math.max(rect.height, 1) * 1000, OFFSCREEN_MIN, OFFSCREEN_MAX),
      px: event.clientX - rect.left,
      py: event.clientY - rect.top,
      rect,
    };
  };

  controller.hitTest = (point) => previousHitTest(point) ?? offscreenMarkerHit(controller, point);

  controller.upsertBox = (slot, bbox) => {
    const next = normalizeLooseBox({ bbox_2d: bbox }, slot);
    if (!next) return;
    const index = controller.state.boxes.findIndex((box) => box.slot === slot);
    if (index >= 0) controller.state.boxes[index] = next;
    else controller.state.boxes.push(next);
    controller.state.boxes.sort((a, b) => VISIBLE_SLOTS.indexOf(a.slot) - VISIBLE_SLOTS.indexOf(b.slot));
    controller.sync();
  };

  controller.sync = () => {
    captureLooseEndpoint(controller);
    const savedTracks = clone(exp.tracks);
    const previousSuppress = exp.suppressCapture;
    exp.suppressCapture = true;
    try {
      previousSync();
    } finally {
      exp.suppressCapture = previousSuppress;
      exp.tracks = savedTracks;
      setLoosePreviewState(controller);
    }
    controller.fitAndDraw?.();
  };

  controller.render = () => {
    previousRender();
    setLoosePreviewState(controller);
    patchCanvasPointerMove(controller);
    controller.fitAndDraw?.();
  };

  if (previousReload) {
    controller.reloadFromWidgets = () => {
      const rawTracks = rawTimelineTracks(node);
      previousReload();
      const nextExp = controller.__h3scTimelineExp;
      if (nextExp?.tracks) {
        for (const slot of VISIBLE_SLOTS) {
          if (rawTracks[slot]?.start || rawTracks[slot]?.end) nextExp.tracks[slot] = rawTracks[slot];
        }
      }
      setLoosePreviewState(controller);
      patchCanvasPointerMove(controller);
      controller.fitAndDraw?.();
    };
  }

  controller.removeBox = (slot) => {
    previousRemoveBox(slot);
    setLoosePreviewState(controller);
    controller.fitAndDraw?.();
  };

  controller.draw = () => {
    setLoosePreviewState(controller);
    previousDraw();
    drawOffscreenMarkers(controller);
  };

  patchCanvasPointerMove(controller);
  setLoosePreviewState(controller);
  controller.fitAndDraw?.();
  return true;
}

function validConfigJson(value) {
  const parsed = parseObject(value);
  return parsed && typeof parsed === "object" && parsed.slots && typeof parsed.slots === "object";
}

function snapshotPromptNode(node, markDirty = false) {
  const controller = node?.__h3scController;
  const widget = findWidget(node, "config_json");
  if (!controller || !widget) return null;
  try { controller.sync?.(); } catch {}
  let raw = typeof widget.value === "string" ? widget.value : "";
  if (!validConfigJson(raw) && controller.state) raw = JSON.stringify(controller.state);
  if (!validConfigJson(raw)) return null;
  setWidgetSerialized(widget);
  widget.value = raw;
  node.properties = node.properties || {};
  const state = {
    version: "h3sc_prompt_persistence_v1",
    config_json: raw,
    saved_at: Date.now(),
  };
  node.properties.h3scPromptState = state;
  if (Array.isArray(node.widgets_values)) {
    const index = node.widgets?.indexOf(widget) ?? -1;
    if (index >= 0) node.widgets_values[index] = raw;
  }
  if (markDirty) {
    node.setDirtyCanvas?.(true, true);
    app?.graph?.setDirtyCanvas?.(true, true);
  }
  return state;
}

function snapshotAllPromptNodes(markDirty = false) {
  for (const node of app?.graph?._nodes ?? []) {
    if (node?.type === PROMPTER_NODE || node?.comfyClass === PROMPTER_NODE) {
      try { node.__h3scPromptLifecycleSnapshot?.(markDirty); } catch {}
    }
  }
}

function installPromptLifecycleHooks() {
  if (window.__h3scPromptLifecycleHooksV1) return;
  window.__h3scPromptLifecycleHooksV1 = true;
  const snapshot = () => snapshotAllPromptNodes(true);

  window.addEventListener("pagehide", snapshot, true);
  window.addEventListener("beforeunload", snapshot, true);
  window.addEventListener("blur", snapshot, true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) snapshot(); }, true);
  document.addEventListener("pointerdown", snapshot, true);
  document.addEventListener("mouseup", snapshot, true);
  document.addEventListener("keyup", snapshot, true);
  document.addEventListener("focusout", snapshot, true);

  if (app && !app.__h3scPromptGraphToPromptV1 && typeof app.graphToPrompt === "function") {
    const original = app.graphToPrompt.bind(app);
    app.graphToPrompt = function () {
      snapshotAllPromptNodes(false);
      return original(...arguments);
    };
    app.__h3scPromptGraphToPromptV1 = true;
  }

  if (app && !app.__h3scPromptQueuePromptV1 && typeof app.queuePrompt === "function") {
    const original = app.queuePrompt.bind(app);
    app.queuePrompt = function () {
      snapshotAllPromptNodes(false);
      return original(...arguments);
    };
    app.__h3scPromptQueuePromptV1 = true;
  }
}

function installPromptPersistence(node) {
  const controller = node?.__h3scController;
  const widget = findWidget(node, "config_json");
  if (!controller || !widget || node.__h3scPromptLifecyclePersistenceV1) return false;
  node.__h3scPromptLifecyclePersistenceV1 = true;
  setWidgetSerialized(widget);

  node.__h3scPromptLifecycleSnapshot = (markDirty = false) => snapshotPromptNode(node, markDirty);

  const previousOnSerialize = node.onSerialize;
  node.onSerialize = function (data) {
    const result = previousOnSerialize?.apply(this, arguments);
    const state = snapshotPromptNode(this, false);
    if (data && state) {
      data.properties = { ...(data.properties || {}), ...(this.properties || {}) };
      const index = this.widgets?.indexOf(findWidget(this, "config_json")) ?? -1;
      if (index >= 0 && Array.isArray(data.widgets_values)) data.widgets_values[index] = state.config_json;
    }
    return result;
  };

  if (typeof node.serialize === "function" && !node.__h3scPromptSerializePatchedV1) {
    const originalSerialize = node.serialize.bind(node);
    node.serialize = function () {
      snapshotPromptNode(this, false);
      const data = originalSerialize(...arguments);
      if (data) {
        data.properties = { ...(data.properties || {}), ...(this.properties || {}) };
        const index = this.widgets?.indexOf(findWidget(this, "config_json")) ?? -1;
        const state = this.properties?.h3scPromptState;
        if (index >= 0 && Array.isArray(data.widgets_values) && validConfigJson(state?.config_json)) {
          data.widgets_values[index] = state.config_json;
        }
      }
      return data;
    };
    node.__h3scPromptSerializePatchedV1 = true;
  }

  const refresh = () => queueMicrotask(() => snapshotPromptNode(node, false));
  controller.root?.addEventListener("input", refresh, true);
  controller.root?.addEventListener("change", refresh, true);
  controller.root?.addEventListener("compositionend", refresh, true);
  snapshotPromptNode(node, false);
  return true;
}

function restoreConfiguredPrompt(node) {
  const configured = node.__h3scConfiguredPromptPersistenceV1;
  node.__h3scConfiguredPromptPersistenceV1 = null;
  if (!configured) return;
  const widget = findWidget(node, "config_json");
  const controller = node?.__h3scController;
  if (!widget || !controller) return;

  const raw = validConfigJson(configured.widgetValue)
    ? configured.widgetValue
    : validConfigJson(configured.propertyValue)
      ? configured.propertyValue
      : null;
  if (!raw) return;

  widget.value = raw;
  setWidgetSerialized(widget);
  controller.reloadFromWidgets?.();
  snapshotPromptNode(node, false);
}

function patchWhenReady(node, nodeName, attempts = 24) {
  const ready = nodeName === CANVAS_NODE
    ? installOffscreenCanvas(node)
    : installPromptPersistence(node);
  if (ready || attempts <= 0) return;
  queueMicrotask(() => patchWhenReady(node, nodeName, attempts - 1));
}

function wrapNodeType(nodeType, nodeData) {
  if (nodeType.prototype.__h3scExperimentalV2Wrapped) return;
  nodeType.prototype.__h3scExperimentalV2Wrapped = true;

  const previousCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    previousCreated?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this, nodeData.name));
  };

  const previousConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function (info) {
    if (nodeData.name === PROMPTER_NODE) {
      const configWidgetIndex = this.widgets?.findIndex((widget) => widget.name === "config_json") ?? -1;
      this.__h3scConfiguredPromptPersistenceV1 = {
        widgetValue: configWidgetIndex >= 0 && Array.isArray(info?.widgets_values)
          ? info.widgets_values[configWidgetIndex]
          : null,
        propertyValue: info?.properties?.h3scPromptState?.config_json ?? null,
      };
    }
    const result = previousConfigure?.apply(this, arguments);
    queueMicrotask(() => {
      patchWhenReady(this, nodeData.name);
      if (nodeData.name === PROMPTER_NODE) restoreConfiguredPrompt(this);
      if (nodeData.name === CANVAS_NODE) {
        mergeRawTracks(this.__h3scController);
        setLoosePreviewState(this.__h3scController);
        patchCanvasPointerMove(this.__h3scController);
        this.__h3scController?.fitAndDraw?.();
      }
    });
    return result;
  };
}

if (!app?.registerExtension) {
  console.error("[H3 Structured Canvas] ComfyUI app API was not found.");
} else {
  app.registerExtension({
    name: EXTENSION_NAME,
    setup() {
      installPromptLifecycleHooks();
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === CANVAS_NODE || nodeData.name === PROMPTER_NODE) {
        wrapNodeType(nodeType, nodeData);
      }
    },
  });
  console.info("[H3 Structured Canvas] Experimental V2 offscreen/overlap/prompt persistence loaded");
}
