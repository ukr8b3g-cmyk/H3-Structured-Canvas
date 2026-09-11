const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const EXTENSION_NAME = "h3.structured.canvas.experimental.overscan-delete-fix";
const VIEW_MIN = -300;
const VIEW_MAX = 1300;
const VIEW_SPAN = VIEW_MAX - VIEW_MIN;
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

function drawFrameGrid(ctx, width, height, grid) {
  const left = toPixel(0, width);
  const top = toPixel(0, height);
  const right = toPixel(1000, width);
  const bottom = toPixel(1000, height);

  ctx.save();
  ctx.fillStyle = "#202526";
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.strokeStyle = "rgba(238,244,244,.72)";
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

  ctx.font = "9px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.fillStyle = "rgba(238,244,244,.72)";
  for (const tick of [0, 250, 500, 750, 1000]) {
    const x = toPixel(tick, width);
    const y = toPixel(tick, height);
    ctx.textAlign = tick === 0 ? "left" : tick === 1000 ? "right" : "center";
    ctx.textBaseline = "top";
    ctx.fillText(String(tick), x, bottom + 5);
    ctx.textAlign = "right";
    ctx.textBaseline = tick === 0 ? "top" : tick === 1000 ? "bottom" : "middle";
    ctx.fillText(String(tick), left - 6, y);
  }

  ctx.fillStyle = "rgba(180,188,190,.65)";
  ctx.font = "700 9px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("OFFSCREEN", left / 2, height / 2);
  ctx.fillText("OFFSCREEN", (right + width) / 2, height / 2);
  ctx.save();
  ctx.translate(width / 2, top / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("OFFSCREEN", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(width / 2, (bottom + height) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("OFFSCREEN", 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawBox(ctx, box, width, height, active) {
  if (!Array.isArray(box?.bbox_2d) || box.bbox_2d.length !== 4) return;
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

function drawOverscan(controller) {
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
  drawFrameGrid(ctx, width, height, controller.state?.canvas?.grid ?? "thirds");
  if (controller.state?.canvas?.show_boxes === false) return;
  for (const box of controller.state?.boxes ?? []) {
    drawBox(ctx, box, width, height, box.slot === controller.activeSlot);
  }
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
      const x1 = clamp(ox1 + dx, VIEW_MIN, VIEW_MAX - boxWidth);
      const y1 = clamp(oy1 + dy, VIEW_MIN, VIEW_MAX - boxHeight);
      box = [x1, y1, x1 + boxWidth, y1 + boxHeight];
    } else {
      let [x1, y1, x2, y2] = [ox1, oy1, ox2, oy2];
      if (controller.drag.handle?.includes("n")) y1 = point.y;
      if (controller.drag.handle?.includes("s")) y2 = point.y;
      if (controller.drag.handle?.includes("w")) x1 = point.x;
      if (controller.drag.handle?.includes("e")) x2 = point.x;
      box = [
        clamp(Math.min(x1, x2), VIEW_MIN, VIEW_MAX),
        clamp(Math.min(y1, y2), VIEW_MIN, VIEW_MAX),
        clamp(Math.max(x1, x2), VIEW_MIN, VIEW_MAX),
        clamp(Math.max(y1, y2), VIEW_MIN, VIEW_MAX),
      ];
    }

    if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) controller.upsertBox(controller.activeSlot, box);
  };
}

function installSafeDelete(controller) {
  const canvas = controller?.canvas;
  if (!canvas || controller.__h3scOverscanDeleteHandler) return;
  const handler = (event) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    if (document.activeElement !== canvas) return;
    if (!endpointEditable(controller)) return;
    const box = controller.boxFor?.(controller.activeSlot);
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    controller.removeBox?.(controller.activeSlot);
    canvas.focus();
  };
  controller.__h3scOverscanDeleteHandler = handler;
  window.addEventListener("keydown", handler, true);
}

function patchController(node) {
  const controller = node?.__h3scController;
  if (!controller?.__h3scTimelineExp || node.__h3scOverscanDeleteFixInstalled) return false;
  node.__h3scOverscanDeleteFixInstalled = true;

  controller.eventPoint = (event) => {
    const rect = controller.canvas.getBoundingClientRect();
    return {
      x: clamp(fromPixel(event.clientX - rect.left, rect.width), VIEW_MIN, VIEW_MAX),
      y: clamp(fromPixel(event.clientY - rect.top, rect.height), VIEW_MIN, VIEW_MAX),
      px: event.clientX - rect.left,
      py: event.clientY - rect.top,
      rect,
    };
  };

  controller.draw = () => drawOverscan(controller);

  const previousRender = controller.render.bind(controller);
  controller.render = () => {
    previousRender();
    patchPointerMove(controller);
    installSafeDelete(controller);
    controller.fitAndDraw?.();
  };

  const previousReload = controller.reloadFromWidgets?.bind(controller);
  if (previousReload) {
    controller.reloadFromWidgets = () => {
      previousReload();
      patchPointerMove(controller);
      installSafeDelete(controller);
      controller.fitAndDraw?.();
    };
  }

  const previousDestroy = controller.destroy?.bind(controller);
  controller.destroy = () => {
    if (controller.__h3scOverscanDeleteHandler) {
      window.removeEventListener("keydown", controller.__h3scOverscanDeleteHandler, true);
      controller.__h3scOverscanDeleteHandler = null;
    }
    previousDestroy?.();
  };

  patchPointerMove(controller);
  installSafeDelete(controller);
  controller.fitAndDraw?.();
  return true;
}

function patchWhenReady(node, attempts = 24) {
  if (patchController(node) || attempts <= 0) return;
  queueMicrotask(() => patchWhenReady(node, attempts - 1));
}

function wrapNodeType(nodeType) {
  if (nodeType.prototype.__h3scOverscanDeleteWrapped) return;
  nodeType.prototype.__h3scOverscanDeleteWrapped = true;

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
  console.info("[H3 Structured Canvas] Experimental overscan editor / safe Delete loaded");
}
