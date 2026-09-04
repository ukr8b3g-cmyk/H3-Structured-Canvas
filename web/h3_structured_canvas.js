import { app, CANVAS_NODE, PROMPTER_NODE, EXTENSION_NAME, BUILD, ensureStyles, make } from "./h3sc_shared.js";
import { CanvasController } from "./h3sc_canvas.js";
import { PrompterController } from "./h3sc_prompter.js";

function installNodeUI(nodeType, nodeData) {
  if (nodeType.prototype.__h3scInstalled) return;
  nodeType.prototype.__h3scInstalled = true;
  const oldCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    oldCreated?.apply(this, arguments);
    ensureStyles();
    this.serialize_widgets = true;
    const root = make("div", "h3sc-root");
    const widget = this.addDOMWidget?.("h3sc_ui", "h3sc_ui", root, { serialize: false, hideOnZoom: false });
    if (!widget) return;
    const isCanvas = nodeData.name === CANVAS_NODE;
    widget.computeSize = (width) => [width, isCanvas ? 820 : 860];
    this.__h3scController = isCanvas ? new CanvasController(this, root) : new PrompterController(this, root);
    const target = isCanvas ? [760, 900] : [650, 920];
    const current = this.size || [0, 0];
    if (current[0] < target[0] || current[1] < target[1]) this.setSize?.([Math.max(current[0], target[0]), Math.max(current[1], target[1])]);
  };

  const oldConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function (info) {
    oldConfigure?.apply(this, arguments);
    queueMicrotask(() => this.__h3scController?.reloadFromWidgets());
  };

  const oldConnections = nodeType.prototype.onConnectionsChange;
  nodeType.prototype.onConnectionsChange = function () {
    oldConnections?.apply(this, arguments);
    queueMicrotask(() => this.__h3scController?.onConnectionsChanged());
  };

  const oldResize = nodeType.prototype.onResize;
  nodeType.prototype.onResize = function () {
    oldResize?.apply(this, arguments);
    this.__h3scController?.onResize();
  };

  const oldRemoved = nodeType.prototype.onRemoved;
  nodeType.prototype.onRemoved = function () {
    this.__h3scController?.destroy();
    oldRemoved?.apply(this, arguments);
  };

  const oldSerialize = nodeType.prototype.onSerialize;
  nodeType.prototype.onSerialize = function (info) {
    this.__h3scController?.sync?.();
    oldSerialize?.apply(this, arguments);
  };
}

if (!app?.registerExtension) {
  console.error("[H3 Structured Canvas] ComfyUI app API was not found.");
} else {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === CANVAS_NODE || nodeData.name === PROMPTER_NODE) installNodeUI(nodeType, nodeData);
    },
  });
  console.info(`[H3 Structured Canvas] frontend ${BUILD} loaded`);
}
