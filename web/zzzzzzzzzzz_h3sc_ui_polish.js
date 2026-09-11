const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const EXTENSION_NAME = "h3.structured.canvas.experimental.ui-polish";
const VIEW_MIN = -180;
const VIEW_MAX = 1180;
const VIEW_SPAN = VIEW_MAX - VIEW_MIN;
const INTERNAL_MIN = -1000;
const INTERNAL_MAX = 2000;
const ENDPOINT_EPSILON = 0.0005;
const SLOT_COLORS = { a: "#ef4444", b: "#3b82f6", c: "#facc15" };
const SLOT_LABELS = { a: "A", b: "B", c: "C" };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function endpointEditable(controller) {
  const t = Number(controller?.__h3scTimelineExp?.t ?? 0);
  return t <= ENDPOINT_EPSILON || t >= 1 - ENDPOINT_EPSILON;
}

function toPixel(value, size) {
  return (value - VIEW_MIN) / VIEW_SPAN * size;
}

function fromPixel(value, size) {
  return VIEW_MIN + value / Math.max(size, 1) * VIEW_SPAN;
}

function ensureStyles() {
  if (document.getElementById("h3sc-experimental-ui-polish-style")) return;
  const style = document.createElement("style");
  style.id = "h3sc-experimental-ui-polish-style";
  style.textContent = `
.h3sc-exp-size-panel{padding:7px 8px!important}
.h3sc-exp-size-panel>.h3sc-section-title{margin-bottom:5px!important}
.h3sc-size-inline{display:grid;grid-template-columns:minmax(220px,1.8fr) minmax(88px,.55fr) minmax(88px,.55fr) auto;gap:8px;align-items:end}
.h3sc-size-inline .h3sc-field{min-width:0!important;margin:0!important}
.h3sc-size-inline .h3sc-field-label{white-space:nowrap}
.h3sc-size-inline .h3sc-btn{height:30px;align-self:end}
.h3sc-exp-size-panel>.h3sc-note{margin-top:4px}
.h3sc-timeline-exp-controls{grid-template-columns:auto auto 84px minmax(150px,1fr) auto!important}
.h3sc-timeline-exp-time{font-size:16px!important;font-weight:800!important;min-width:68px!important;color:#f0f6f6!important}
.h3sc-timeline-time-input{width:84px;height:30px;background:#101213;color:#eee;border:1px solid #4b4f50;border-radius:5px;padding:4px 7px;font:700 13px/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-align:right}
.h3sc-timeline-time-input:focus{outline:none;border-color:#48d5cf;box-shadow:0 0 0 1px rgba(72,213,207,.25)}
@media(max-width:760px){.h3sc-size-inline{grid-template-columns:1fr 1fr}.h3sc-size-inline .h3sc-field:first-child{grid-column:1/-1}.h3sc-timeline-exp-controls{grid-template-columns:auto auto 74px minmax(90px,1fr) auto!important}.h3sc-timeline-time-input{width:74px}}
`;
  document.head.append(style);
}

function drawFrame(ctx, width, height, grid) {
  const left = toPixel(0, width);
  const top = toPixel(0, height);
  const right = toPixel(1000, width);
  const bottom = toPixel(1000, height);

  ctx.save();
  ctx.fillStyle = "#202526";
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = "rgba(238,244,244,.78)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, bottom - top - 1);

  if (grid !== "none") {
    ctx.strokeStyle = "rgba(230,240,240,.20)";
    ctx.lineWidth = 1;
    const values = grid === "quarters" ? [250, 500, 750] : grid === "cross" ? [500] : [1000 / 3, 2000 / 3];
    for (const value of values) {
      const x = toPixel(value, width);
      const y = toPixel(value, height);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
  }

  ctx.font = "9px ui-monospace,SFMono-Regular,Consolas,monospace";
  ctx.fillStyle = "rgba(238,244,244,.72)";
  for (const tick of [0, 250, 500, 750, 1000]) {
    const x = toPixel(tick, width);
    const y = toPixel(tick, height);
    ctx.textAlign = tick === 0 ? "left" : tick === 1000 ? "right" : "center";
    ctx.textBaseline = "top";
    ctx.fillText(String(tick), x, bottom + 4);
    ctx.textAlign = "right";
    ctx.textBaseline = tick === 0 ? "top" : tick === 1000 ? "bottom" : "middle";
    ctx.fillText(String(tick), left - 5, y);
  }

  ctx.fillStyle = "rgba(170,178,180,.55)";
  ctx.font = "700 8px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("OFFSCREEN", left / 2, height / 2);
  ctx.fillText("OFFSCREEN", (right + width) / 2, height / 2);
  ctx.restore();
}

function boxOutsideView(box) {
  if (!Array.isArray(box?.bbox_2d)) return null;
  const [x1, y1, x2, y2] = box.bbox_2d.map(Number);
  if (x2 < VIEW_MIN) return "left";
  if (x1 > VIEW_MAX) return "right";
  if (y2 < VIEW_MIN) return "top";
  if (y1 > VIEW_MAX) return "bottom";
  return null;
}

function drawOutsideMarker(ctx, box, width, height, side) {
  const color = SLOT_COLORS[box.slot] ?? "#ddd";
  const [x1, y1, x2, y2] = box.bbox_2d.map(Number);
  const cx = toPixel(clamp((x1 + x2) / 2, VIEW_MIN, VIEW_MAX), width);
  const cy = toPixel(clamp((y1 + y2) / 2, VIEW_MIN, VIEW_MAX), height);
  const x = side === "left" ? 8 : side === "right" ? width - 8 : clamp(cx, 38, width - 38);
  const y = side === "top" ? 8 : side === "bottom" ? height - 8 : clamp(cy, 14, height - 14);
  const label = `${SLOT_LABELS[box.slot] ?? String(box.slot).toUpperCase()} ${side.toUpperCase()} OFF`;
  ctx.save();
  ctx.font = "700 9px system-ui";
  const w = Math.max(58, ctx.measureText(label).width + 12);
  const h = 18;
  const left = clamp(x - w / 2, 2, width - w - 2);
  const top = clamp(y - h / 2, 2, height - h - 2);
  ctx.fillStyle = "#111";
  ctx.fillRect(left, top, w, h);
  ctx.strokeStyle = color;
  ctx.strokeRect(left, top, w, h);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, left + w / 2, top + h / 2);
  ctx.restore();
}

function drawBox(ctx, box, width, height, active) {
  if (!Array.isArray(box?.bbox_2d) || box.bbox_2d.length !== 4) return;
  const outside = boxOutsideView(box);
  if (outside) {
    drawOutsideMarker(ctx, box, width, height, outside);
    return;
  }
  const [x1, y1, x2, y2] = box.bbox_2d.map(Number);
  const left = toPixel(x1, width);
  const top = toPixel(y1, height);
  const right = toPixel(x2, width);
  const bottom = toPixel(y2, height);
  const color = SLOT_COLORS[box.slot] ?? "#ddd";
  ctx.save();
  ctx.fillStyle = `${color}22`;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = color;
  ctx.lineWidth = active ? 2.5 : 1.6;
  ctx.strokeRect(left, top, right - left, bottom - top);
  const labelX = clamp(left, 0, Math.max(0, width - 28));
  const labelY = clamp(top - 24, 0, Math.max(0, height - 24));
  ctx.fillStyle = color;
  ctx.fillRect(labelX, labelY, 28, 24);
  ctx.fillStyle = box.slot === "c" ? "#151515" : "#fff";
  ctx.font = "700 14px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(SLOT_LABELS[box.slot] ?? String(box.slot).toUpperCase(), labelX + 14, labelY + 12);
  if (active) {
    const size = 7;
    for (const [x, y] of [[left, top], [right, top], [right, bottom], [left, bottom]]) {
      if (x < -size || y < -size || x > width + size || y > height + size) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - size / 2, y - size / 2, size, size);
    }
  }
  ctx.restore();
}

function drawCanvas(controller) {
  const canvas = controller?.canvas;
  const ctx = canvas?.getContext?.("2d");
  if (!canvas || !ctx) return;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#101314";
  ctx.fillRect(0, 0, width, height);
  drawFrame(ctx, width, height, controller.state?.canvas?.grid ?? "thirds");
  if (controller.state?.canvas?.show_boxes === false) return;
  for (const box of controller.state?.boxes ?? []) drawBox(ctx, box, width, height, box.slot === controller.activeSlot);
}

function patchPointerMove(controller) {
  const canvas = controller?.canvas;
  if (!canvas) return;
  canvas.onpointermove = (event) => {
    if (!controller.drag || event.pointerId !== controller.drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
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
      const boxWidth = ox2 - ox1;
      const boxHeight = oy2 - oy1;
      const x1 = clamp(ox1 + dx, INTERNAL_MIN, INTERNAL_MAX - boxWidth);
      const y1 = clamp(oy1 + dy, INTERNAL_MIN, INTERNAL_MAX - boxHeight);
      box = [x1, y1, x1 + boxWidth, y1 + boxHeight];
    } else {
      let [x1, y1, x2, y2] = [ox1, oy1, ox2, oy2];
      if (controller.drag.handle?.includes("n")) y1 = point.y;
      if (controller.drag.handle?.includes("s")) y2 = point.y;
      if (controller.drag.handle?.includes("w")) x1 = point.x;
      if (controller.drag.handle?.includes("e")) x2 = point.x;
      box = [
        clamp(Math.min(x1, x2), INTERNAL_MIN, INTERNAL_MAX),
        clamp(Math.min(y1, y2), INTERNAL_MIN, INTERNAL_MAX),
        clamp(Math.max(x1, x2), INTERNAL_MIN, INTERNAL_MAX),
        clamp(Math.max(y1, y2), INTERNAL_MIN, INTERNAL_MAX),
      ];
    }
    if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) controller.upsertBox(controller.activeSlot, box);
  };
}

function patchSelection(controller) {
  const canvas = controller?.canvas;
  if (!canvas || canvas.__h3scSelectionPatched) return;
  canvas.__h3scSelectionPatched = true;
  const previousPointerDown = canvas.onpointerdown;
  canvas.onpointerdown = function (event) {
    previousPointerDown?.call(this, event);
    controller.__h3scBoxSelectionActive = Boolean(controller.drag && controller.drag.mode !== "draw");
    controller.__h3scSelectedSlot = controller.__h3scBoxSelectionActive ? controller.activeSlot : null;
    if (controller.__h3scBoxSelectionActive) canvas.focus();
  };
}

function installSafeDelete(controller) {
  if (controller.__h3scPolishedDeleteHandler) return;
  const handler = (event) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const target = event.target;
    if (target instanceof Element && target.closest("input,textarea,select,[contenteditable='true']")) return;
    if (!controller.__h3scBoxSelectionActive || !endpointEditable(controller)) return;
    const slot = controller.__h3scSelectedSlot || controller.activeSlot;
    if (!controller.boxFor?.(slot)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    controller.removeBox?.(slot);
    controller.__h3scBoxSelectionActive = false;
    controller.__h3scSelectedSlot = null;
    controller.canvas?.focus?.();
  };
  const clearSelection = (event) => {
    if (event.target === controller.canvas) return;
    if (event.target instanceof Element && event.target.closest(".h3sc-btn.danger")) return;
    controller.__h3scBoxSelectionActive = false;
    controller.__h3scSelectedSlot = null;
  };
  controller.__h3scPolishedDeleteHandler = handler;
  controller.__h3scPolishedClearSelection = clearSelection;
  window.addEventListener("keydown", handler, true);
  document.addEventListener("pointerdown", clearSelection, true);
}

function polishCanvasSize(controller) {
  const panel = controller.root?.querySelector?.(".h3sc-exp-size-panel");
  if (!panel || panel.querySelector(".h3sc-size-inline")) return;
  const presetField = controller.resolutionSelect?.closest?.(".h3sc-field");
  const widthField = controller.widthInput?.closest?.(".h3sc-field");
  const heightField = controller.heightInput?.closest?.(".h3sc-field");
  const sizeRow = controller.widthInput?.closest?.(".h3sc-row");
  const apply = sizeRow?.querySelector?.("button");
  if (!presetField || !widthField || !heightField || !apply) return;
  const row = document.createElement("div");
  row.className = "h3sc-size-inline";
  row.append(presetField, widthField, heightField, apply);
  const title = panel.querySelector(":scope > .h3sc-section-title");
  if (title) title.after(row); else panel.prepend(row);
  sizeRow?.remove();
}

function polishTimeline(controller) {
  const exp = controller?.__h3scTimelineExp;
  const ui = exp?.ui;
  if (!ui?.range || !ui?.time || !ui?.section) return;
  let input = ui.section.querySelector(".h3sc-timeline-time-input");
  if (!input) {
    input = document.createElement("input");
    input.type = "number";
    input.className = "h3sc-timeline-time-input";
    input.min = "0";
    input.max = String(Number(exp.duration) || 5);
    input.step = "0.01";
    input.setAttribute("aria-label", "Current timeline time in seconds");
    ui.time.after(input);
    const apply = () => {
      const duration = Number(exp.duration) || 5;
      const seconds = clamp(Number(input.value) || 0, 0, duration);
      input.value = seconds.toFixed(2);
      ui.range.value = String(Math.round(seconds / duration * 1000));
      ui.range.dispatchEvent(new Event("input", { bubbles: true }));
    };
    input.addEventListener("change", apply);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); apply(); input.blur(); }
    });
    ui.range.addEventListener("input", () => {
      const duration = Number(exp.duration) || 5;
      input.value = (Number(ui.range.value) / 1000 * duration).toFixed(2);
    });
    const observer = new MutationObserver(() => {
      const match = String(ui.time.textContent || "").match(/([0-9]+(?:\.[0-9]+)?)/);
      if (match && document.activeElement !== input) input.value = Number(match[1]).toFixed(2);
    });
    observer.observe(ui.time, { childList: true, characterData: true, subtree: true });
    controller.__h3scTimelineTimeObserver = observer;
  }
  input.value = ((Number(exp.t) || 0) * (Number(exp.duration) || 5)).toFixed(2);
}

function polishDom(controller) {
  ensureStyles();
  polishCanvasSize(controller);
  polishTimeline(controller);
}

function patchController(node) {
  const controller = node?.__h3scController;
  if (!controller?.__h3scTimelineExp || node.__h3scUiPolishInstalled) return false;
  node.__h3scUiPolishInstalled = true;
  ensureStyles();

  controller.eventPoint = (event) => {
    const rect = controller.canvas.getBoundingClientRect();
    return {
      x: clamp(fromPixel(event.clientX - rect.left, rect.width), INTERNAL_MIN, INTERNAL_MAX),
      y: clamp(fromPixel(event.clientY - rect.top, rect.height), INTERNAL_MIN, INTERNAL_MAX),
      px: event.clientX - rect.left,
      py: event.clientY - rect.top,
      rect,
    };
  };
  controller.draw = () => drawCanvas(controller);

  const previousRender = controller.render.bind(controller);
  controller.render = () => {
    previousRender();
    patchPointerMove(controller);
    patchSelection(controller);
    installSafeDelete(controller);
    polishDom(controller);
    controller.fitAndDraw?.();
  };

  const previousReload = controller.reloadFromWidgets?.bind(controller);
  if (previousReload) {
    controller.reloadFromWidgets = () => {
      previousReload();
      patchPointerMove(controller);
      patchSelection(controller);
      installSafeDelete(controller);
      polishDom(controller);
      controller.fitAndDraw?.();
    };
  }

  const previousDestroy = controller.destroy?.bind(controller);
  controller.destroy = () => {
    if (controller.__h3scPolishedDeleteHandler) window.removeEventListener("keydown", controller.__h3scPolishedDeleteHandler, true);
    if (controller.__h3scPolishedClearSelection) document.removeEventListener("pointerdown", controller.__h3scPolishedClearSelection, true);
    controller.__h3scTimelineTimeObserver?.disconnect?.();
    previousDestroy?.();
  };

  patchPointerMove(controller);
  patchSelection(controller);
  installSafeDelete(controller);
  polishDom(controller);
  controller.fitAndDraw?.();
  return true;
}

function patchWhenReady(node, attempts = 32) {
  if (patchController(node) || attempts <= 0) return;
  queueMicrotask(() => patchWhenReady(node, attempts - 1));
}

function wrapNodeType(nodeType) {
  if (nodeType.prototype.__h3scUiPolishWrapped) return;
  nodeType.prototype.__h3scUiPolishWrapped = true;
  const previousCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    previousCreated?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this));
  };
  const previousConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function () {
    const result = previousConfigure?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this));
    return result;
  };
}

if (!app?.registerExtension) {
  console.error("[H3 Structured Canvas] ComfyUI app API was not found.");
} else {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === CANVAS_NODE) wrapNodeType(nodeType);
    },
  });
  console.info("[H3 Structured Canvas] Experimental UI polish loaded");
}
