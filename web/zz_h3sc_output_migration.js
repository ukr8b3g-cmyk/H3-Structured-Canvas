const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.legacy_output_migration.v1";

function graphLink(id) {
  const links = app?.graph?.links;
  if (!links || id == null) return null;
  if (links instanceof Map) return links.get(id) ?? null;
  return links[id] ?? links[String(id)] ?? null;
}

function removeLink(id) {
  if (id == null) return;
  try { app?.graph?.removeLink?.(id); } catch { /* best-effort migration */ }
}

function outputLinks(output) {
  return Array.isArray(output?.links) ? [...output.links] : [];
}

function isLegacyCanvas(outputs) {
  return Array.isArray(outputs)
    && outputs.length >= 4
    && outputs[0]?.type === "H3_LAYOUT"
    && outputs[1]?.type === "STRING"
    && outputs[2]?.type === "INT"
    && outputs[3]?.type === "INT";
}

function isLegacyPrompter(outputs) {
  return Array.isArray(outputs)
    && outputs.length >= 3
    && outputs[0]?.type === "STRING"
    && (outputs[1]?.type === "H3_STRUCTURE" || outputs[1]?.name === "h3_structure")
    && outputs[2]?.type === "STRING";
}

function remapOriginSlots(node, dropSlot, slotMap) {
  const links = app?.graph?.links;
  if (!links) return;
  const values = links instanceof Map ? [...links.values()] : Object.values(links);
  for (const link of values) {
    if (!link || link.origin_id !== node.id) continue;
    if (link.origin_slot === dropSlot) {
      removeLink(link.id ?? link[0]);
      continue;
    }
    if (Object.hasOwn(slotMap, link.origin_slot)) link.origin_slot = slotMap[link.origin_slot];
  }
}

function migrateLegacyCanvasOutputs(node) {
  const outputs = node?.outputs;
  if (!isLegacyCanvas(outputs)) return false;

  const [layout, legacyJson, width, height] = outputs;
  const staleLinks = outputLinks(legacyJson);
  const widthLinks = outputLinks(width);
  const heightLinks = outputLinks(height);

  for (const id of staleLinks) removeLink(id);
  for (const id of widthLinks) { const link = graphLink(id); if (link) link.origin_slot = 1; }
  for (const id of heightLinks) { const link = graphLink(id); if (link) link.origin_slot = 2; }
  remapOriginSlots(node, 1, { 2: 1, 3: 2 });

  node.outputs = [
    { ...layout, name: "layout", type: "H3_LAYOUT", links: outputLinks(layout) },
    { ...width, name: "width", type: "INT", links: widthLinks.filter((id) => graphLink(id)) },
    { ...height, name: "height", type: "INT", links: heightLinks.filter((id) => graphLink(id)) },
  ];
  node.setDirtyCanvas?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
  app?.graph?.change?.();
  return true;
}

function migrateLegacyPrompterOutputs(node) {
  const outputs = node?.outputs;
  if (!isLegacyPrompter(outputs)) return false;

  const prompt = outputs[0];
  for (const output of outputs.slice(1)) for (const id of outputLinks(output)) removeLink(id);
  remapOriginSlots(node, 1, {});
  remapOriginSlots(node, 2, {});
  remapOriginSlots(node, 3, {});

  node.outputs = [{ ...prompt, name: "prompt", type: "STRING", links: outputLinks(prompt) }];
  node.setDirtyCanvas?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
  app?.graph?.change?.();
  return true;
}

function migrateLegacyOutputs(node, nodeName) {
  if (nodeName === CANVAS_NODE) return migrateLegacyCanvasOutputs(node);
  if (nodeName === PROMPTER_NODE) return migrateLegacyPrompterOutputs(node);
  return false;
}

function scheduleMigration(node, nodeName) {
  const run = () => migrateLegacyOutputs(node, nodeName);
  queueMicrotask(run);
  setTimeout(run, 0);
  setTimeout(run, 100);
  setTimeout(run, 400);
}

if (app?.registerExtension) {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (![CANVAS_NODE, PROMPTER_NODE].includes(nodeData.name)) return;
      if (nodeType.prototype.__h3scLegacyOutputsV1) return;
      nodeType.prototype.__h3scLegacyOutputsV1 = true;

      const oldCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () {
        oldCreated?.apply(this, arguments);
        scheduleMigration(this, nodeData.name);
      };

      const oldConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function () {
        oldConfigure?.apply(this, arguments);
        scheduleMigration(this, nodeData.name);
      };

      const oldConnections = nodeType.prototype.onConnectionsChange;
      nodeType.prototype.onConnectionsChange = function () {
        oldConnections?.apply(this, arguments);
        scheduleMigration(this, nodeData.name);
      };

      const oldSerialize = nodeType.prototype.onSerialize;
      nodeType.prototype.onSerialize = function (info) {
        migrateLegacyOutputs(this, nodeData.name);
        oldSerialize?.apply(this, arguments);
        if (info && Array.isArray(this.outputs)) info.outputs = this.outputs.map((output) => ({ ...output, links: outputLinks(output) }));
      };
    },
  });
}
