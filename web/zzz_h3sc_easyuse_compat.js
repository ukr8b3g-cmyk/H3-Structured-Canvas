const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const TARGET_NODES = new Set(["H3StructuredCanvas", "H3StructuredPrompter"]);
const EXTENSION_NAME = "h3.structured.canvas.easyuse_compat.v1";

function forcePrimitiveDomWidget(node) {
  const widgets = Array.isArray(node?.widgets) ? node.widgets : [];
  const index = widgets.findIndex((widget) => widget?.name === "h3sc_ui");
  if (index < 0) return;

  const widget = widgets[index];
  try {
    Object.defineProperty(widget, "value", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: "",
    });
  } catch {
    try { widget.value = ""; } catch { /* best effort */ }
  }

  if (Array.isArray(node.widgets_values) && index < node.widgets_values.length) {
    node.widgets_values[index] = "";
  }

  widget.serializeValue = () => "";
  widget.__h3scPrimitiveValue = true;
}

function schedule(node) {
  forcePrimitiveDomWidget(node);
  queueMicrotask(() => forcePrimitiveDomWidget(node));
  setTimeout(() => forcePrimitiveDomWidget(node), 0);
  setTimeout(() => forcePrimitiveDomWidget(node), 100);
}

if (app?.registerExtension) {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (!TARGET_NODES.has(nodeData.name)) return;
      if (nodeType.prototype.__h3scEasyUseCompatV1) return;
      nodeType.prototype.__h3scEasyUseCompatV1 = true;

      const oldCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        oldCreated?.apply(this, arguments);
        schedule(this);
      };

      const oldConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function () {
        oldConfigure?.apply(this, arguments);
        schedule(this);
      };

      const oldConnections = nodeType.prototype.onConnectionsChange;
      nodeType.prototype.onConnectionsChange = function () {
        oldConnections?.apply(this, arguments);
        schedule(this);
      };

      const oldSerialize = nodeType.prototype.onSerialize;
      nodeType.prototype.onSerialize = function () {
        forcePrimitiveDomWidget(this);
        oldSerialize?.apply(this, arguments);
        forcePrimitiveDomWidget(this);
      };
    },

    nodeCreated(node) {
      if (TARGET_NODES.has(node?.type)) schedule(node);
    },
  });
}
