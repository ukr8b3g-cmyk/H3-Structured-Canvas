const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const CANVAS_NODE = "H3StructuredCanvas";
const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.v1.endpoint-fix";
const VISIBLE_SLOTS = ["a", "b", "c"];
const ENDPOINT_EPSILON = 0.0005;

function cloneBox(box) {
  return box ? { ...box, bbox_2d: [...box.bbox_2d] } : null;
}

function bboxFrom(item) {
  const box = item?.bbox_2d;
  if (!Array.isArray(box) || box.length !== 4) return null;
  const values = box.map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function sameBox(a, b) {
  const aa = bboxFrom(a);
  const bb = bboxFrom(b);
  if (!aa || !bb) return !aa && !bb;
  return aa.every((value, index) => Math.round(value) === Math.round(bb[index]));
}

function boxMap(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const slot = String(item?.slot ?? "").toLowerCase();
    if (!VISIBLE_SLOTS.includes(slot) || !bboxFrom(item)) continue;
    map.set(slot, item);
  }
  return map;
}

function endpointName(t) {
  if (Number(t) <= ENDPOINT_EPSILON) return "start";
  if (Number(t) >= 1 - ENDPOINT_EPSILON) return "end";
  return null;
}

function ensureTrackEditState(controller) {
  const exp = controller?.__h3scTimelineExp;
  if (!exp?.tracks) return null;
  if (!exp.__h3scEndpointEditState) {
    exp.__h3scEndpointEditState = {};
    for (const slot of VISIBLE_SLOTS) {
      const start = exp.tracks[slot]?.start ?? null;
      const end = exp.tracks[slot]?.end ?? null;
      exp.__h3scEndpointEditState[slot] = {
        linked: !start || !end || sameBox(start, end),
        provisional: !start && !end,
      };
    }
  }
  return exp.__h3scEndpointEditState;
}

function prepareEndpointSync(controller) {
  const exp = controller?.__h3scTimelineExp;
  const editState = ensureTrackEditState(controller);
  const endpoint = endpointName(exp?.t);
  if (!exp || !editState || !endpoint) return;

  const current = boxMap(controller.state?.boxes);
  for (const slot of VISIBLE_SLOTS) {
    const track = exp.tracks?.[slot];
    const state = editState[slot];
    if (!track || !state) continue;

    const box = current.get(slot) ?? null;
    const previous = track[endpoint] ?? null;
    if (sameBox(box, previous)) continue;

    if (!box) {
      if (state.provisional || state.linked) {
        const other = endpoint === "start" ? "end" : "start";
        track[other] = null;
      }
      continue;
    }

    if (endpoint === "start") {
      if (state.provisional || state.linked) {
        track.end = cloneBox(box);
      }
    } else if (state.provisional) {
      track.start = cloneBox(box);
    } else if (state.linked) {
      // Editing END is the explicit point where a previously linked Start/End
      // pair becomes an independent trajectory.
      state.linked = false;
    }
  }
}

function finalizeProvisionalTracks(controller) {
  const exp = controller?.__h3scTimelineExp;
  const editState = ensureTrackEditState(controller);
  const endpoint = endpointName(exp?.t);
  if (!exp || !editState || !endpoint || controller.drag) return;

  const current = boxMap(controller.state?.boxes);
  for (const slot of VISIBLE_SLOTS) {
    const state = editState[slot];
    const box = current.get(slot) ?? null;
    if (!state?.provisional || !box) continue;
    const track = exp.tracks?.[slot];
    if (!track) continue;
    track.start = cloneBox(box);
    track.end = cloneBox(box);
    state.provisional = false;
    state.linked = true;
  }
}

function patchCanvasController(node) {
  const controller = node?.__h3scController;
  const exp = controller?.__h3scTimelineExp;
  if (!controller || !exp || node.__h3scTimelineEndpointFixInstalled) return false;
  node.__h3scTimelineEndpointFixInstalled = true;

  ensureTrackEditState(controller);

  const originalSync = controller.sync.bind(controller);
  controller.sync = () => {
    prepareEndpointSync(controller);
    originalSync();
    finalizeProvisionalTracks(controller);

    // If a provisional draw finished on this sync, persist the final full-size
    // box once more so the opposite endpoint cannot retain the 1x1 seed box.
    const editState = ensureTrackEditState(controller);
    if (!controller.drag && endpointName(exp.t)) {
      const current = boxMap(controller.state?.boxes);
      let needsFlush = false;
      for (const slot of VISIBLE_SLOTS) {
        const state = editState?.[slot];
        const box = current.get(slot) ?? null;
        const track = exp.tracks?.[slot];
        if (!state || !box || !track || state.provisional) continue;
        if (state.linked && (!sameBox(track.start, box) || !sameBox(track.end, box))) {
          track.start = cloneBox(box);
          track.end = cloneBox(box);
          needsFlush = true;
        }
      }
      if (needsFlush) originalSync();
    }
  };

  const originalRemoveBox = controller.removeBox.bind(controller);
  controller.removeBox = (slot) => {
    originalRemoveBox(slot);
    if (!VISIBLE_SLOTS.includes(slot)) return;
    const state = ensureTrackEditState(controller);
    if (state) state[slot] = { linked: true, provisional: true };
  };

  return true;
}

function patchPrompterController(node) {
  const controller = node?.__h3scController;
  if (!controller || node.__h3scTimelinePromptPersistenceGuardInstalled) return false;
  node.__h3scTimelinePromptPersistenceGuardInstalled = true;

  // Prompt text belongs to the Prompter node's config_json. Canvas deletion
  // must never clear it. Do not mirror Canvas presence into slot descriptions.
  // Existing configured nodes keep their serialized text; brand-new nodes keep
  // the base default blank descriptions.
  return true;
}

function patchWhenReady(node, nodeName, attempts = 12) {
  const ready = nodeName === CANVAS_NODE
    ? patchCanvasController(node)
    : patchPrompterController(node);
  if (ready || attempts <= 0) return;
  queueMicrotask(() => patchWhenReady(node, nodeName, attempts - 1));
}

function wrapNodeType(nodeType, nodeData) {
  if (nodeType.prototype.__h3scTimelineEndpointFixWrapped) return;
  nodeType.prototype.__h3scTimelineEndpointFixWrapped = true;

  const previousCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    previousCreated?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this, nodeData.name));
  };

  const previousConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function () {
    previousConfigure?.apply(this, arguments);
    queueMicrotask(() => patchWhenReady(this, nodeData.name));
  };
}

if (!app?.registerExtension) {
  console.error("[H3 Structured Canvas Timeline Fix] ComfyUI app API was not found.");
} else {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === CANVAS_NODE || nodeData.name === PROMPTER_NODE) {
        wrapNodeType(nodeType, nodeData);
      }
    },
  });
  console.info("[H3 Structured Canvas] Timeline endpoint/prompt persistence fix loaded");
}
