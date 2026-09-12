const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.multikey.ui_gate_fix";
const VISIBLE_SLOTS = ["a", "b", "c"];
const EPS = 0.0005;
const INTERNAL_MIN = -1000;
const INTERNAL_MAX = 2000;
const VIEW_MIN = -100;
const VIEW_MAX = 1100;
const VIEW_SPAN = VIEW_MAX - VIEW_MIN;
const CLICK_DRAW_MOVE_EPS = 4;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function normalizeTrack(track) { if (!track) return null; track.keys = Array.isArray(track.keys) ? track.keys : []; return track; }
function trackEmpty(track) { const safe = normalizeTrack(track); return !safe?.start && !safe?.end && !safe.keys.length; }
function pointAt(track, t) {
  const safe = normalizeTrack(track);
  if (!safe) return null;
  if (t <= EPS && safe.start) return { kind: "start", time: 0 };
  if (t >= 1 - EPS && safe.end) return { kind: "end", time: 1 };
  for (let index = 0; index < safe.keys.length; index += 1) {
    if (Math.abs(Number(safe.keys[index].time) - t) <= EPS) return { kind: "key", index, time: Number(safe.keys[index].time) };
  }
  return null;
}
function currentSlot(controller) {
  const slot = controller?.activeSlot ?? controller?.state?.canvas?.active_slot ?? "a";
  return VISIBLE_SLOTS.includes(slot) ? slot : "a";
}
function currentTrack(controller, slot = currentSlot(controller)) {
  return normalizeTrack(controller?.__h3scTimelineExp?.tracks?.[slot]);
}
function canEdit(controller, slot = currentSlot(controller)) {
  const exp = controller?.__h3scTimelineExp, track = currentTrack(controller, slot);
  return Boolean(exp && pointAt(track, exp.t));
}
function forceMultiKeyEditState(controller) {
  const exp = controller?.__h3scTimelineExp;
  if (!exp) return;
  const slot = currentSlot(controller), track = currentTrack(controller, slot);
  const point = pointAt(track, exp.t);
  const editable = Boolean(point);
  if (controller.drawButton) controller.drawButton.disabled = !editable && !trackEmpty(track);
  controller.canvas?.classList.toggle("h3sc-timeline-preview-only", !editable);
  const danger = controller.root?.querySelector(".h3sc-toolbar .h3sc-btn.danger");
  if (danger) danger.disabled = !editable;
  const ui = controller.__h3scMultiUI;
  if (ui?.state && ui?.note && point?.kind === "key") {
    ui.state.textContent = `KEY ${point.index + 1} · EDIT`;
    ui.note.textContent = `Intermediate key at ${(Number(exp.t) * Number(exp.duration || 5)).toFixed(2)}s is editable.`;
    ui.note.classList.remove("warn", "warning");
  }
}
function eventPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(VIEW_MIN + (event.clientX - rect.left) / Math.max(rect.width, 1) * VIEW_SPAN, INTERNAL_MIN, INTERNAL_MAX),
    y: clamp(VIEW_MIN + (event.clientY - rect.top) / Math.max(rect.height, 1) * VIEW_SPAN, INTERNAL_MIN, INTERNAL_MAX),
    px: event.clientX - rect.left,
    py: event.clientY - rect.top,
    rect,
  };
}
function pointDistance(a, b) { if (!a || !b) return Infinity; return Math.hypot(Number(a.px) - Number(b.px), Number(a.py) - Number(b.py)); }
function rectFromPoints(a, b) { return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]; }
function validFinalBox(box, minSize = 12) { return Array.isArray(box) && box[2] - box[0] >= minSize && box[3] - box[1] >= minSize; }
function hitTest(controller, point) {
  const boxes = [...(controller.state?.boxes ?? [])].reverse();
  const tx = 12 / Math.max(point.rect.width, 1) * VIEW_SPAN;
  const ty = 12 / Math.max(point.rect.height, 1) * VIEW_SPAN;
  for (const box of boxes) {
    if (!VISIBLE_SLOTS.includes(box?.slot) || !Array.isArray(box?.bbox_2d)) continue;
    const [x1, y1, x2, y2] = box.bbox_2d;
    const corners = { nw: [x1, y1], ne: [x2, y1], se: [x2, y2], sw: [x1, y2] };
    for (const [handle, [x, y]] of Object.entries(corners)) {
      if (Math.abs(point.x - x) <= tx && Math.abs(point.y - y) <= ty) return { box, mode: "resize", handle };
    }
    if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) return { box, mode: "move", handle: null };
  }
  return null;
}
function cancelPendingDraw(controller) { controller.__h3scMultiKeyGateFixPendingDraw = null; }
function startPendingDraw(controller, point, slot) { controller.__h3scMultiKeyGateFixPendingDraw = { start: point, last: point, slot }; }
function previewPendingDraw(controller, point) {
  const pending = controller.__h3scMultiKeyGateFixPendingDraw;
  if (!pending || typeof controller.upsertBox !== "function") return false;
  pending.last = point;
  const box = rectFromPoints(pending.start, point);
  if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) { controller.upsertBox(pending.slot, box); return true; }
  return false;
}
function finishPendingDraw(controller, point) {
  const pending = controller.__h3scMultiKeyGateFixPendingDraw;
  if (!pending || typeof controller.upsertBox !== "function") return false;
  const box = rectFromPoints(pending.start, point);
  cancelPendingDraw(controller);
  if (validFinalBox(box)) { controller.upsertBox(pending.slot, box); controller.sync?.(); return true; }
  forceMultiKeyEditState(controller);
  return false;
}
function installCanvasGateFix(controller) {
  const canvas = controller?.canvas;
  if (!canvas || canvas.__h3scMultiKeyGateFixEvents) return;
  canvas.__h3scMultiKeyGateFixEvents = true;

  const begin = (event) => {
    if (event.button !== 0) return;
    const exp = controller.__h3scTimelineExp;
    if (!exp || typeof controller.upsertBox !== "function") return;
    const point = eventPoint(canvas, event);
    const pending = controller.__h3scMultiKeyGateFixPendingDraw;
    if (pending) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
      finishPendingDraw(controller, point); forceMultiKeyEditState(controller); return;
    }
    const hit = hitTest(controller, point);
    let slot = hit?.box?.slot ?? currentSlot(controller);
    if (!VISIBLE_SLOTS.includes(slot)) slot = "a";
    const track = currentTrack(controller, slot);
    const editable = canEdit(controller, slot);
    const canCreateAtEndpoint = trackEmpty(track) && (exp.t <= EPS || exp.t >= 1 - EPS);
    if (hit && editable) {
      cancelPendingDraw(controller);
      controller.__h3scMultiKeyGateFixDrag = { pointerId: event.pointerId, mode: hit.mode, handle: hit.handle, start: point, original: [...hit.box.bbox_2d], slot, moved: false };
    } else if (!hit && controller.drawMode && (editable || canCreateAtEndpoint)) {
      startPendingDraw(controller, point, slot);
      controller.__h3scMultiKeyGateFixDrag = { pointerId: event.pointerId, mode: "draw", start: point, original: null, slot, moved: false };
    } else {
      forceMultiKeyEditState(controller); return;
    }
    exp.selectedSlot = slot; controller.activeSlot = slot; controller.state.canvas.active_slot = slot;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    canvas.setPointerCapture?.(event.pointerId); forceMultiKeyEditState(controller);
  };

  const move = (event) => {
    const drag = controller.__h3scMultiKeyGateFixDrag;
    const pending = controller.__h3scMultiKeyGateFixPendingDraw;
    if (!drag && pending) { const point = eventPoint(canvas, event); previewPendingDraw(controller, point); forceMultiKeyEditState(controller); return; }
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    const point = eventPoint(canvas, event);
    drag.moved = drag.moved || pointDistance(drag.start, point) >= CLICK_DRAW_MOVE_EPS;
    let box;
    if (drag.mode === "draw") {
      box = rectFromPoints(drag.start, point);
      if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) previewPendingDraw(controller, point);
      forceMultiKeyEditState(controller); return;
    } else if (drag.mode === "move") {
      const [x1, y1, x2, y2] = drag.original, width = x2 - x1, height = y2 - y1;
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
    if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) controller.upsertBox(drag.slot, box);
    forceMultiKeyEditState(controller);
  };

  const finish = (event) => {
    const drag = controller.__h3scMultiKeyGateFixDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
    if (drag.mode === "draw") {
      const point = eventPoint(canvas, event);
      const box = rectFromPoints(drag.start, point);
      if (validFinalBox(box) && drag.moved) finishPendingDraw(controller, point);
      else startPendingDraw(controller, drag.start, drag.slot);
    } else {
      controller.sync?.(); cancelPendingDraw(controller);
    }
    controller.__h3scMultiKeyGateFixDrag = null; forceMultiKeyEditState(controller);
  };

  const cancel = (event) => {
    const drag = controller.__h3scMultiKeyGateFixDrag;
    if (drag && drag.pointerId === event.pointerId) controller.__h3scMultiKeyGateFixDrag = null;
    cancelPendingDraw(controller); forceMultiKeyEditState(controller);
  };

  canvas.addEventListener("pointerdown", begin, true);
  canvas.addEventListener("pointermove", move, true);
  canvas.addEventListener("pointerup", finish, true);
  canvas.addEventListener("pointercancel", cancel, true);
  controller.__h3scMultiKeyGateFixCleanup = () => {
    canvas.removeEventListener("pointerdown", begin, true);
    canvas.removeEventListener("pointermove", move, true);
    canvas.removeEventListener("pointerup", finish, true);
    canvas.removeEventListener("pointercancel", cancel, true);
    canvas.__h3scMultiKeyGateFixEvents = false;
    cancelPendingDraw(controller);
  };
}
function install(node) {
  const controller = node?.__h3scController;
  if (!controller || !node.__h3scMultiKeyInstalled || node.__h3scMultiKeyGateFixInstalled) return false;
  node.__h3scMultiKeyGateFixInstalled = true;
  const previousRender = controller.render?.bind(controller);
  const previousUpdate = controller.updateControls?.bind(controller);
  const previousReload = controller.reloadFromWidgets?.bind(controller);
  const previousDestroy = controller.destroy?.bind(controller);
  if (previousRender) controller.render = () => { previousRender(); installCanvasGateFix(controller); forceMultiKeyEditState(controller); };
  if (previousUpdate) controller.updateControls = () => { previousUpdate(); installCanvasGateFix(controller); forceMultiKeyEditState(controller); };
  if (previousReload) controller.reloadFromWidgets = () => { previousReload(); installCanvasGateFix(controller); forceMultiKeyEditState(controller); };
  controller.destroy = () => { controller.__h3scMultiKeyGateFixCleanup?.(); previousDestroy?.(); };
  installCanvasGateFix(controller); forceMultiKeyEditState(controller); return true;
}
function patchWhenReady(node, attempts = 96) {
  if (install(node) || attempts <= 0) return;
  queueMicrotask(() => patchWhenReady(node, attempts - 1));
}
function wrapNodeType(nodeType, nodeData) {
  if (nodeType.prototype.__h3scMultiKeyGateFixWrapped) return;
  nodeType.prototype.__h3scMultiKeyGateFixWrapped = true;
  const created = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () { created?.apply(this, arguments); queueMicrotask(() => patchWhenReady(this)); };
  const configured = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function () { const result = configured?.apply(this, arguments); queueMicrotask(() => patchWhenReady(this)); return result; };
}
if (app?.registerExtension) {
  app.registerExtension({ name: EXTENSION_NAME, beforeRegisterNodeDef(nodeType, nodeData) { if (nodeData.name === CANVAS_NODE) wrapNodeType(nodeType, nodeData); } });
}
