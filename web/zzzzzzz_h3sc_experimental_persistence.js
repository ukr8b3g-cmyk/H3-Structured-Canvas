const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;
const apiModule = window.comfyAPI?.api;
const comfyApi = apiModule?.api ?? apiModule;

const CANVAS_NODE = "H3StructuredCanvas";
const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.timeline.experimental.persistence";
const UUID_BYTES = new Uint8Array([0x6f,0x0c,0x2d,0x2f,0x1f,0xdc,0x4f,0x2e,0x9d,0xba,0x48,0xa2,0x3b,0x3f,0x46,0xaf]);
const MP4_TAIL_LIMIT = 12 * 1024 * 1024 + 4096;
const PRESERVED_PROMPT_KEYS = ["description", "exact_text", "custom_behavior"];
const SLOT_IDS = ["a", "b", "c"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameUuid(bytes, offset) {
  if (offset < 0 || offset + UUID_BYTES.length > bytes.length) return false;
  for (let i = 0; i < UUID_BYTES.length; i += 1) {
    if (bytes[offset + i] !== UUID_BYTES[i]) return false;
  }
  return true;
}

function snapshotTracks(controller) {
  const exp = controller?.__h3scTimelineExp;
  if (!exp?.tracks) return null;
  return {
    tracks: clone(exp.tracks),
    t: Number(exp.t) || 0,
    editState: exp.__h3scEndpointEditState ? clone(exp.__h3scEndpointEditState) : null,
  };
}

function restoreTracks(controller, snapshot) {
  const exp = controller?.__h3scTimelineExp;
  if (!exp || !snapshot) return;
  exp.tracks = clone(snapshot.tracks);
  exp.t = snapshot.t;
  if (snapshot.editState) exp.__h3scEndpointEditState = clone(snapshot.editState);
}

function drawNormalizedAxes(controller) {
  const canvas = controller?.canvas;
  const ctx = canvas?.getContext?.("2d");
  if (!canvas || !ctx) return;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  if (width < 120 || height < 120) return;

  const ticks = [0, 250, 500, 750, 1000];
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "9px ui-monospace, SFMono-Regular, Consolas, monospace";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.fillStyle = "rgba(238,244,244,.78)";

  ctx.beginPath();
  ctx.moveTo(0.5, height - 0.5);
  ctx.lineTo(width - 0.5, height - 0.5);
  ctx.moveTo(0.5, 0.5);
  ctx.lineTo(0.5, height - 0.5);
  ctx.stroke();

  for (const tick of ticks) {
    const x = tick / 1000 * width;
    const y = tick / 1000 * height;
    ctx.beginPath();
    ctx.moveTo(x, height - 5);
    ctx.lineTo(x, height);
    ctx.moveTo(0, y);
    ctx.lineTo(5, y);
    ctx.stroke();

    ctx.textBaseline = "bottom";
    ctx.textAlign = tick === 0 ? "left" : tick === 1000 ? "right" : "center";
    ctx.fillText(String(tick), Math.max(2, Math.min(width - 2, x)), height - 7);

    ctx.textBaseline = tick === 0 ? "top" : tick === 1000 ? "bottom" : "middle";
    ctx.textAlign = "left";
    ctx.fillText(String(tick), 7, Math.max(2, Math.min(height - 2, y)));
  }
  ctx.restore();
}

function installCanvasPersistence(node) {
  const controller = node?.__h3scController;
  if (!controller?.__h3scTimelineExp || node.__h3scExperimentalPersistenceInstalled) return false;
  node.__h3scExperimentalPersistenceInstalled = true;

  const originalSync = controller.sync.bind(controller);
  const originalDraw = controller.draw.bind(controller);
  let lastWidth = Number(controller.state?.canvas?.width) || 1024;
  let lastHeight = Number(controller.state?.canvas?.height) || 1024;

  controller.sync = () => {
    const nextWidth = Number(controller.state?.canvas?.width) || lastWidth;
    const nextHeight = Number(controller.state?.canvas?.height) || lastHeight;
    const sizeChanged = nextWidth !== lastWidth || nextHeight !== lastHeight;
    const saved = sizeChanged ? snapshotTracks(controller) : null;

    originalSync();

    if (sizeChanged && saved) {
      restoreTracks(controller, saved);
      originalSync();
    }

    lastWidth = Number(controller.state?.canvas?.width) || nextWidth;
    lastHeight = Number(controller.state?.canvas?.height) || nextHeight;
  };

  controller.draw = () => {
    originalDraw();
    drawNormalizedAxes(controller);
  };
  controller.fitAndDraw?.();
  return true;
}

function snapshotPromptDraft(controller) {
  const slots = {};
  for (const slot of SLOT_IDS) {
    const current = controller?.state?.slots?.[slot];
    if (!current) continue;
    slots[slot] = {};
    for (const key of PRESERVED_PROMPT_KEYS) slots[slot][key] = current[key];
    slots[slot].type = current.type;
    slots[slot].enabled = current.enabled;
    slots[slot].order = current.order;
    slots[slot].value = current.value;
  }
  return slots;
}

function restoreLostPromptDraft(controller, draft) {
  if (!controller?.state?.slots || !draft) return;
  for (const slot of SLOT_IDS) {
    const current = controller.state.slots[slot];
    const previous = draft[slot];
    if (!current || !previous) continue;
    for (const key of PRESERVED_PROMPT_KEYS) {
      if ((current[key] === "" || current[key] == null) && previous[key] !== "" && previous[key] != null) {
        current[key] = previous[key];
      }
    }
    if (!current.type && previous.type) current.type = previous.type;
    if (current.enabled == null && previous.enabled != null) current.enabled = previous.enabled;
    if (!Number.isFinite(Number(current.order)) && Number.isFinite(Number(previous.order))) current.order = previous.order;
    if (current.value === undefined && previous.value !== undefined) current.value = previous.value;
    current.motion = "start_end";
  }
}

function installPrompterPersistence(node) {
  const controller = node?.__h3scController;
  if (!controller?.state || node.__h3scExperimentalPromptDraftInstalled) return false;
  node.__h3scExperimentalPromptDraftInstalled = true;
  let draft = snapshotPromptDraft(controller);

  const originalRender = controller.render.bind(controller);
  controller.render = () => {
    restoreLostPromptDraft(controller, draft);
    originalRender();
    draft = snapshotPromptDraft(controller);
  };

  const refreshDraft = () => queueMicrotask(() => {
    draft = snapshotPromptDraft(controller);
  });
  controller.root?.addEventListener("input", refreshDraft, true);
  controller.root?.addEventListener("change", refreshDraft, true);
  return true;
}

function patchNodeWhenReady(node, nodeName, attempts = 16) {
  const ready = nodeName === CANVAS_NODE
    ? installCanvasPersistence(node)
    : installPrompterPersistence(node);
  if (ready || attempts <= 0) return;
  queueMicrotask(() => patchNodeWhenReady(node, nodeName, attempts - 1));
}

function wrapNodeType(nodeType, nodeData) {
  if (nodeType.prototype.__h3scExperimentalPersistenceWrapped) return;
  nodeType.prototype.__h3scExperimentalPersistenceWrapped = true;

  const previousCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    previousCreated?.apply(this, arguments);
    queueMicrotask(() => patchNodeWhenReady(this, nodeData.name));
  };

  const previousConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function () {
    previousConfigure?.apply(this, arguments);
    queueMicrotask(() => patchNodeWhenReady(this, nodeData.name));
  };
}

async function apiFetch(path, options = {}) {
  if (comfyApi?.fetchApi) return comfyApi.fetchApi(path, options);
  return fetch(path, options);
}

async function captureWorkflowMetadata(promptId = null) {
  let bundle = null;
  try {
    bundle = await app?.graphToPrompt?.();
  } catch {
    bundle = null;
  }
  const workflow = bundle?.workflow ?? app?.graph?.serialize?.() ?? null;
  const prompt = bundle?.output ?? bundle?.prompt ?? null;
  if (!workflow) return null;
  return {
    schema: "h3_structured_canvas/mp4_metadata/1",
    prompt_id: promptId,
    workflow,
    prompt,
  };
}

function collectMp4Outputs(value, found = new Map()) {
  if (Array.isArray(value)) {
    for (const item of value) collectMp4Outputs(item, found);
    return found;
  }
  if (!value || typeof value !== "object") return found;
  if (typeof value.filename === "string" && value.filename.toLowerCase().endsWith(".mp4")) {
    const item = {
      filename: value.filename,
      subfolder: typeof value.subfolder === "string" ? value.subfolder : "",
      type: value.type === "temp" ? "temp" : "output",
    };
    found.set(`${item.type}|${item.subfolder}|${item.filename}`, item);
  }
  for (const child of Object.values(value)) collectMp4Outputs(child, found);
  return found;
}

async function embedOutputMetadata(descriptor, metadata) {
  if (!metadata) return;
  try {
    const response = await apiFetch("/h3_structured_canvas/embed_mp4_metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...descriptor, metadata }),
    });
    if (!response?.ok) console.warn("[H3 Structured Canvas] MP4 metadata embed failed", response?.status);
  } catch (error) {
    console.warn("[H3 Structured Canvas] MP4 metadata embed failed", error);
  }
}

function installExecutionMetadataHook() {
  if (!comfyApi?.addEventListener || installExecutionMetadataHook.installed) return;
  installExecutionMetadataHook.installed = true;
  const byPrompt = new Map();
  let latest = null;

  comfyApi.addEventListener("execution_start", (event) => {
    const promptId = event?.detail?.prompt_id ?? event?.detail?.promptId ?? null;
    const promise = captureWorkflowMetadata(promptId);
    latest = promise;
    if (promptId != null) byPrompt.set(String(promptId), promise);
  });

  comfyApi.addEventListener("executed", async (event) => {
    const outputs = [...collectMp4Outputs(event?.detail?.output ?? event?.detail ?? {}).values()];
    if (!outputs.length) return;
    const promptId = event?.detail?.prompt_id ?? event?.detail?.promptId ?? null;
    let metadataPromise = promptId != null ? byPrompt.get(String(promptId)) : latest;
    if (!metadataPromise) metadataPromise = captureWorkflowMetadata(promptId);
    const metadata = await metadataPromise;
    await Promise.all(outputs.map((item) => embedOutputMetadata(item, metadata)));
  });
}

async function extractMetadataFromMp4(file) {
  if (!file || !String(file.name || "").toLowerCase().endsWith(".mp4")) return null;
  const start = Math.max(0, file.size - MP4_TAIL_LIMIT);
  const bytes = new Uint8Array(await file.slice(start).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let found = null;

  for (let i = 4; i + 20 <= bytes.length; i += 1) {
    if (bytes[i] !== 0x75 || bytes[i + 1] !== 0x75 || bytes[i + 2] !== 0x69 || bytes[i + 3] !== 0x64) continue;
    if (!sameUuid(bytes, i + 4)) continue;
    const boxStart = i - 4;
    const boxSize = view.getUint32(boxStart, false);
    const payloadStart = i + 4 + 16;
    const boxEnd = boxStart + boxSize;
    if (boxSize < 24 || boxEnd > bytes.length || payloadStart > boxEnd) continue;
    try {
      const text = new TextDecoder().decode(bytes.subarray(payloadStart, boxEnd));
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") found = parsed;
    } catch {
      // Keep scanning in case an older malformed box precedes a valid one.
    }
  }
  return found;
}

async function loadEmbeddedWorkflow(file) {
  const metadata = await extractMetadataFromMp4(file);
  if (!metadata?.workflow || !app?.loadGraphData) return false;
  await app.loadGraphData(metadata.workflow);
  return true;
}

function installMp4DropRestore() {
  if (installMp4DropRestore.installed) return;
  installMp4DropRestore.installed = true;

  if (typeof app?.handleFile === "function" && !app.__h3scOriginalHandleFile) {
    const original = app.handleFile.bind(app);
    app.__h3scOriginalHandleFile = original;
    app.handleFile = async function (file) {
      try {
        if (await loadEmbeddedWorkflow(file)) return;
      } catch (error) {
        console.warn("[H3 Structured Canvas] MP4 workflow restore failed", error);
      }
      return original(...arguments);
    };
    return;
  }

  window.addEventListener("drop", (event) => {
    const files = [...(event.dataTransfer?.files ?? [])];
    const mp4 = files.find((file) => String(file.name || "").toLowerCase().endsWith(".mp4"));
    if (!mp4) return;
    loadEmbeddedWorkflow(mp4).catch((error) => {
      console.warn("[H3 Structured Canvas] MP4 workflow restore failed", error);
    });
  }, true);
}

if (!app?.registerExtension) {
  console.error("[H3 Structured Canvas] ComfyUI app API was not found.");
} else {
  app.registerExtension({
    name: EXTENSION_NAME,
    setup() {
      installExecutionMetadataHook();
      installMp4DropRestore();
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (nodeData.name === CANVAS_NODE || nodeData.name === PROMPTER_NODE) {
        wrapNodeType(nodeType, nodeData);
      }
    },
  });
  console.info("[H3 Structured Canvas] Experimental persistence/MP4 metadata loaded");
}
