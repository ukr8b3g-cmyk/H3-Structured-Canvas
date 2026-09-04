const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const TARGET_NODES = new Set(["H3StructuredCanvas", "H3StructuredPrompter"]);
const EXTENSION_NAME = "h3.structured.canvas.easyuse_compat.v2";

function hardenDomWidget(node) {
  const widgets = Array.isArray(node?.widgets) ? node.widgets : [];
  const index = widgets.findIndex((widget) => widget?.name === "h3sc_ui");
  if (index < 0) return;

  const widget = widgets[index];

  // ComfyUI's LGraphNode serializer checks widget.serialize directly.
  // options.serialize alone does not exclude a widget from widgets_values.
  widget.serialize = false;
  if (widget.options && typeof widget.options === "object") {
    widget.options.serialize = false;
  }

  // Keep the live value primitive as an extra compatibility guard for
  // extensions such as Easy-Use that inspect node.widgets directly.
  try { widget.value = ""; } catch { /* best effort */ }
  widget.serializeValue = () => "";

  if (Array.isArray(node.widgets_values) && index < node.widgets_values.length) {
    node.widgets_values[index] = "";
  }

  widget.__h3scNoSerialize = true;
}

function schedule(node) {
  hardenDomWidget(node);
  queueMicrotask(() => hardenDomWidget(node));
  setTimeout(() => hardenDomWidget(node), 0);
  setTimeout(() => hardenDomWidget(node), 100);
  setTimeout(() => hardenDomWidget(node), 500);
}

if (app?.registerExtension) {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (!TARGET_NODES.has(nodeData.name)) return;
      if (nodeType.prototype.__h3scEasyUseCompatV2) return;
      nodeType.prototype.__h3scEasyUseCompatV2 = true;

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
        hardenDomWidget(this);
        oldSerialize?.apply(this, arguments);
        hardenDomWidget(this);
      };
    },

    nodeCreated(node) {
      if (TARGET_NODES.has(node?.type)) schedule(node);
    },
  });
}
