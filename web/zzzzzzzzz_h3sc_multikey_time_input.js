const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.multikey.time_input";
const VISIBLE_SLOTS = ["a", "b", "c"];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function findWidget(node, name) {
  return node?.widgets?.find((widget) => widget?.name === name) ?? null;
}

function parseObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function installTimeInput(controller) {
  const ui = controller?.__h3scMultiUI;
  const exp = controller?.__h3scTimelineExp;
  if (!ui?.time || !ui?.range || !exp || ui.timeInput) return;

  const input = document.createElement("input");
  input.type = "number";
  input.className = "h3sc-mk-num h3sc-mk-time-input";
  input.min = "0";
  input.step = "0.01";
  input.title = "Current time in seconds";
  input.setAttribute("aria-label", "Current timeline time in seconds");

  const label = document.createElement("label");
  label.className = "h3sc-mk-time-field";
  label.append(document.createTextNode("Time "));
  label.append(input);
  label.append(document.createTextNode(" s"));

  ui.time.after(label);
  ui.timeInput = input;
  ui.timeLabel = label;

  const apply = () => {
    const duration = Math.max(0.001, Number(exp.duration) || 5);
    const seconds = clamp(Number(input.value) || 0, 0, duration);
    exp.t = seconds / duration;
    exp.selectedSlot = null;
    if (ui.range) ui.range.value = String(Math.round(exp.t * 1000));
    controller.sync?.();
    controller.updateControls?.();
    controller.fitAndDraw?.();
  };

  input.addEventListener("change", apply);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
      input.blur();
    }
  });
}

function updateTimeInput(controller) {
  const ui = controller?.__h3scMultiUI;
  const exp = controller?.__h3scTimelineExp;
  if (!ui || !exp) return;
  installTimeInput(controller);
  const input = ui.timeInput;
  if (!input || document.activeElement === input) return;
  const duration = Math.max(0.001, Number(exp.duration) || 5);
  input.max = String(duration);
  input.value = (clamp(Number(exp.t) || 0, 0, 1) * duration).toFixed(2);
}

function install(node) {
  const controller = node?.__h3scController;
  if (!controller || !node.__h3scMultiKeyInstalled || node.__h3scMultiKeyTimeInputInstalled) return false;
  node.__h3scMultiKeyTimeInputInstalled = true;

  const previousRender = controller.render?.bind(controller);
  const previousUpdate = controller.updateControls?.bind(controller);
  const previousReload = controller.reloadFromWidgets?.bind(controller);

  if (previousRender) controller.render = () => { previousRender(); updateTimeInput(controller); };
  if (previousUpdate) controller.updateControls = () => { previousUpdate(); updateTimeInput(controller); };
  if (previousReload) controller.reloadFromWidgets = () => { previousReload(); updateTimeInput(controller); };

  updateTimeInput(controller);
  return true;
}

function patchWhenReady(node, attempts = 96) {
  if (install(node) || attempts <= 0) return;
  queueMicrotask(() => patchWhenReady(node, attempts - 1));
}

function wrapNodeType(nodeType, nodeData) {
  if (nodeType.prototype.__h3scMultiKeyTimeInputWrapped) return;
  nodeType.prototype.__h3scMultiKeyTimeInputWrapped = true;

  const created = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    created?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this));
  };

  const configured = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function () {
    const result = configured?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this));
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
