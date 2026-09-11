const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;
const apiModule = window.comfyAPI?.api;
const comfyApi = apiModule?.api ?? apiModule;

const EXTENSION_NAME = "h3.structured.canvas.mp4_metadata";
const UUID_BYTES = new Uint8Array([0x6f,0x0c,0x2d,0x2f,0x1f,0xdc,0x4f,0x2e,0x9d,0xba,0x48,0xa2,0x3b,0x3f,0x46,0xaf]);
const MP4_TAIL_LIMIT = 12 * 1024 * 1024 + 4096;

function sameUuid(bytes, offset) {
  if (offset < 0 || offset + UUID_BYTES.length > bytes.length) return false;
  for (let i = 0; i < UUID_BYTES.length; i += 1) if (bytes[offset + i] !== UUID_BYTES[i]) return false;
  return true;
}

async function apiFetch(path, options = {}) {
  if (comfyApi?.fetchApi) return comfyApi.fetchApi(path, options);
  return fetch(path, options);
}

async function captureWorkflowMetadata(promptId = null) {
  let bundle = null;
  try { bundle = await app?.graphToPrompt?.(); } catch { bundle = null; }
  const workflow = bundle?.workflow ?? app?.graph?.serialize?.() ?? null;
  const prompt = bundle?.output ?? bundle?.prompt ?? null;
  if (!workflow) return null;
  return { schema: "h3_structured_canvas/mp4_metadata/1", prompt_id: promptId, workflow, prompt };
}

function collectMp4Outputs(value, found = new Map()) {
  if (Array.isArray(value)) { for (const item of value) collectMp4Outputs(item, found); return found; }
  if (!value || typeof value !== "object") return found;
  if (typeof value.filename === "string" && value.filename.toLowerCase().endsWith(".mp4")) {
    const item = { filename: value.filename, subfolder: typeof value.subfolder === "string" ? value.subfolder : "", type: value.type === "temp" ? "temp" : "output" };
    found.set(`${item.type}|${item.subfolder}|${item.filename}`, item);
  }
  for (const child of Object.values(value)) collectMp4Outputs(child, found);
  return found;
}

async function embedOutputMetadata(descriptor, metadata) {
  if (!metadata) return;
  try {
    const response = await apiFetch("/h3_structured_canvas/embed_mp4_metadata", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...descriptor, metadata }) });
    if (!response?.ok) console.warn("[H3 Structured Canvas] MP4 metadata embed failed", response?.status);
  } catch (error) { console.warn("[H3 Structured Canvas] MP4 metadata embed failed", error); }
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
    const boxStart = i - 4, boxSize = view.getUint32(boxStart, false), payloadStart = i + 20, boxEnd = boxStart + boxSize;
    if (boxSize < 24 || boxEnd > bytes.length || payloadStart > boxEnd) continue;
    try { const parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(payloadStart, boxEnd))); if (parsed && typeof parsed === "object") found = parsed; } catch {}
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
      try { if (await loadEmbeddedWorkflow(file)) return; } catch (error) { console.warn("[H3 Structured Canvas] MP4 workflow restore failed", error); }
      return original(...arguments);
    };
    return;
  }
  window.addEventListener("drop", (event) => {
    const mp4 = [...(event.dataTransfer?.files ?? [])].find((file) => String(file.name || "").toLowerCase().endsWith(".mp4"));
    if (mp4) loadEmbeddedWorkflow(mp4).catch((error) => console.warn("[H3 Structured Canvas] MP4 workflow restore failed", error));
  }, true);
}

if (app?.registerExtension) {
  app.registerExtension({ name: EXTENSION_NAME, setup() { installExecutionMetadataHook(); installMp4DropRestore(); } });
  console.info("[H3 Structured Canvas] MP4 metadata frontend loaded");
}
