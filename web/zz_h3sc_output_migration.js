const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.legacy_output_migration.v2";

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

function allLinksReady(outputs) {
  const ids = outputs.flatMap(outputLinks);
  return ids.every((id) => graphLink(id));
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

function remapOriginSlots(node, dropSlots, slotMap) {
  const links = app?.graph?.links;
  if (!links) return;
  const values = links instanceof Map ? [...links.values()] : Object.values(links);
  const drops = new Set(dropSlots);
  for (const link of values) {
    if (!link || link.origin_id !== node.id) continue;
    if (drops.has(link.origin_slot)) {
      removeLink(link.id ?? link[0]);
      continue;
    }
    if (Object.hasOwn(slotMap, link.origin_slot)) link.origin_slot = slotMap[link.origin_slot];
  }
}

function publicOutput(output, name, type, links) {
  // Never spread modern ComfyUI slot objects here. Newer slot instances carry
  // internal references such as `_node`, which must not leak into workflow JSON.
  // Keep the live node output descriptor intentionally minimal and serialisable.
  return {
    name,
    type,
    links: links.filter((id) => graphLink(id)),
  };
}

function migrateLegacyCanvasOutputs(node) {
  const outputs = node?.outputs;
  if (!isLegacyCanvas(outputs)) return false;
  if (!allLinksReady(outputs)) return false;

  const [layout, legacyJson, width, height] = outputs;
  const layoutLinks = outputLinks(layout);
  const widthLinks = outputLinks(width);
  const heightLinks = outputLinks(height);

  remapOriginSlots(node, [1], { 2: 1, 3: 2 });

  node.outputs = [
    publicOutput(layout, "layout", "H3_LAYOUT", layoutLinks),
    publicOutput(width, "width", "INT", widthLinks),
    publicOutput(height, "height", "INT", heightLinks),
  ];
  node.setDirtyCanvas?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
  app?.graph?.change?.();
  return true;
}

function migrateLegacyPrompterOutputs(node) {
  const outputs = node?.outputs;
  if (!isLegacyPrompter(outputs)) return false;
  if (!allLinksReady(outputs)) return false;

  const prompt = outputs[0];
  const promptLinks = outputLinks(prompt);
  remapOriginSlots(node, [1, 2, 3], {});

  node.outputs = [publicOutput(prompt, "prompt", "STRING", promptLinks)];
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
  setTimeout(run, 1000);
}

if (app?.registerExtension) {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (![CANVAS_NODE, PROMPTER_NODE].includes(nodeData.name)) return;
      if (nodeType.prototype.__h3scLegacyOutputsV2) return;
      nodeType.prototype.__h3scLegacyOutputsV2 = true;

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
      nodeType.prototype.onSerialize = function () {
        // Ensure a legacy graph is migrated before the next save/queue, but do
        // not write live output slot objects into the serialized workflow.
        migrateLegacyOutputs(this, nodeData.name);
        oldSerialize?.apply(this, arguments);
      };
    },
  });
}
