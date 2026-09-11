const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.prompt-tab-persistence";
const SLOT_IDS = ["a", "b", "c"];
const SLOT_STATE_KEYS = [
  "enabled",
  "type",
  "description",
  "exact_text",
  "value",
  "order",
  "custom_behavior",
];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function snapshotPromptSlots(controller) {
  const snapshot = {};
  for (const slot of SLOT_IDS) {
    const current = controller?.state?.slots?.[slot];
    if (!current) continue;
    snapshot[slot] = {};
    for (const key of SLOT_STATE_KEYS) snapshot[slot][key] = clone(current[key]);
  }
  return snapshot;
}

function restorePromptSlots(controller, snapshot) {
  if (!controller?.state?.slots || !snapshot) return;
  for (const slot of SLOT_IDS) {
    const current = controller.state.slots[slot];
    const saved = snapshot[slot];
    if (!current || !saved) continue;
    for (const key of SLOT_STATE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(saved, key)) current[key] = clone(saved[key]);
    }
    current.motion = "start_end";
  }
}

function promptSlotsEqual(a, b) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function isSlotSwitchTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input,textarea,select,button,label")) return false;
  return Boolean(target.closest(".h3sc-slot-head,.h3sc-slot-tab,[data-h3sc-slot-tab]"));
}

function installPromptTabPersistence(node) {
  const controller = node?.__h3scController;
  if (!controller?.state?.slots || node.__h3scPromptTabRoundTripInstalled) return false;
  node.__h3scPromptTabRoundTripInstalled = true;

  let sessionDraft = snapshotPromptSlots(controller);
  const originalRender = controller.render.bind(controller);
  const originalReload = controller.reloadFromWidgets?.bind(controller);

  controller.render = () => {
    const before = snapshotPromptSlots(controller);
    originalRender();
    const after = snapshotPromptSlots(controller);
    if (!promptSlotsEqual(before, after)) {
      restorePromptSlots(controller, before);
      originalRender();
    }
    sessionDraft = snapshotPromptSlots(controller);
  };

  if (originalReload) {
    controller.reloadFromWidgets = () => {
      // A workflow reload is authoritative. Never leak drafts from the previous
      // workflow/node state into newly loaded config_json.
      sessionDraft = null;
      originalReload();
      sessionDraft = snapshotPromptSlots(controller);
    };
  }

  const captureDraft = () => {
    sessionDraft = snapshotPromptSlots(controller);
  };

  controller.root?.addEventListener("input", captureDraft, true);
  controller.root?.addEventListener("change", captureDraft, true);
  controller.root?.addEventListener("pointerdown", (event) => {
    if (isSlotSwitchTarget(event.target)) captureDraft();
  }, true);
  controller.root?.addEventListener("click", (event) => {
    if (!isSlotSwitchTarget(event.target)) return;
    queueMicrotask(() => {
      const current = snapshotPromptSlots(controller);
      if (sessionDraft && !promptSlotsEqual(current, sessionDraft)) {
        restorePromptSlots(controller, sessionDraft);
        controller.sync?.();
        originalRender();
      }
      sessionDraft = snapshotPromptSlots(controller);
    });
  }, true);

  return true;
}

function patchWhenReady(node, attempts = 16) {
  if (installPromptTabPersistence(node) || attempts <= 0) return;
  queueMicrotask(() => patchWhenReady(node, attempts - 1));
}

function wrapNodeType(nodeType) {
  if (nodeType.prototype.__h3scPromptTabPersistenceWrapped) return;
  nodeType.prototype.__h3scPromptTabPersistenceWrapped = true;

  const previousCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    previousCreated?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this));
  };

  const previousConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function () {
    previousConfigure?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this));
  };
}

if (!app?.registerExtension) {
  console.error("[H3 Structured Canvas] ComfyUI app API was not found.");
} else {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === PROMPTER_NODE) wrapNodeType(nodeType);
    },
  });
  console.info("[H3 Structured Canvas] Prompt tab round-trip persistence loaded");
}
