const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;

const TARGET_NODES = new Set(["H3StructuredCanvas", "H3StructuredPrompter"]);
const EXTENSION_NAME = "h3.structured.canvas.correctness_cleanup.v1";

function parseStatus(value) {
  if (typeof value !== "string") return { malformed: false };
  const text = value.trim();
  if (!text) return { malformed: true };
  try {
    const parsed = JSON.parse(text);
    return { malformed: !parsed || typeof parsed !== "object" || Array.isArray(parsed) };
  } catch {
    return { malformed: true };
  }
}

function clampPercentInputs(root) {
  if (!root) return;
  for (const input of root.querySelectorAll('input[type="number"]')) {
    const field = input.closest(".h3sc-field");
    const label = field?.querySelector(".h3sc-field-label")?.textContent?.trim() ?? "";
    if (label !== "Value (%)" && label !== "値 (%)") continue;
    input.min = "0";
    input.max = "100";
    if (input.__h3scPercentClampInstalled) continue;
    input.__h3scPercentClampInstalled = true;
    input.addEventListener("input", () => {
      if (input.value === "") return;
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      input.value = String(Math.max(0, Math.min(100, value)));
    }, true);
  }
}

function renameDefaultProfile(root) {
  if (!root) return;
  for (const option of root.querySelectorAll('option[value="verified_split_bbox"]')) {
    option.textContent = "Split BBOX (Default)";
  }
}

function currentWarning(node) {
  const controller = node?.__h3scController;
  if (!controller) return "";
  const language = String(controller.language ?? "auto").toLowerCase().startsWith("ja")
    || String(navigator.language || "").toLowerCase().startsWith("ja");
  if (parseStatus(controller.stateWidget?.value).malformed) {
    return language ? "⚠ 内部JSONを復元できなかったため、初期値を使用しています。" : "⚠ Internal JSON could not be restored; defaults are being used.";
  }
  if (node.type === "H3StructuredCanvas" && Array.isArray(controller.state?.boxes) && controller.state.boxes.length === 0) {
    return language ? "⚠ 有効なBBOXがありません。空間レイアウト指示は生成されません。" : "⚠ No active BBOX elements. No spatial layout guidance will be emitted.";
  }
  return "";
}

function updateWarning(node) {
  const root = node?.__h3scRoot;
  if (!root) return;
  const shell = root.querySelector(".h3sc-shell");
  if (!shell) return;
  const existing = shell.querySelector(".h3sc-correctness-warning");
  const message = currentWarning(node);
  if (!message) { existing?.remove(); return; }
  const warning = existing ?? document.createElement("div");
  warning.className = "h3sc-correctness-warning h3sc-status warning";
  warning.textContent = message;
  warning.style.padding = "6px 8px";
  warning.style.border = "1px solid #7a6430";
  warning.style.borderRadius = "6px";
  warning.style.background = "#2a2415";
  if (!existing) {
    const footer = shell.querySelector(".h3sc-output-strip");
    if (footer) shell.insertBefore(warning, footer); else shell.append(warning);
  }
}

function decorate(node) {
  const root = node?.__h3scRoot;
  if (!root) return;
  clampPercentInputs(root);
  renameDefaultProfile(root);
  updateWarning(node);
}

function schedule(node) {
  const run = () => decorate(node);
  queueMicrotask(run);
  setTimeout(run, 0);
  setTimeout(run, 100);
  setTimeout(run, 500);
  const root = node?.__h3scRoot;
  if (root && !node.__h3scCorrectnessObserver) {
    const observer = new MutationObserver(() => queueMicrotask(run));
    observer.observe(root, { childList: true, subtree: true });
    node.__h3scCorrectnessObserver = observer;
  }
}

if (app?.registerExtension) {
  app.registerExtension({
    name: EXTENSION_NAME,
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (!TARGET_NODES.has(nodeData.name)) return;
      if (nodeType.prototype.__h3scCorrectnessCleanupV1) return;
      nodeType.prototype.__h3scCorrectnessCleanupV1 = true;
      const oldCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function () { oldCreated?.apply(this, arguments); schedule(this); };
      const oldConfigure = nodeType.prototype.onConfigure;
      nodeType.prototype.onConfigure = function () { oldConfigure?.apply(this, arguments); schedule(this); };
      const oldRemoved = nodeType.prototype.onRemoved;
      nodeType.prototype.onRemoved = function () {
        this.__h3scCorrectnessObserver?.disconnect();
        this.__h3scCorrectnessObserver = null;
        oldRemoved?.apply(this, arguments);
      };
    },
    nodeCreated(node) { if (TARGET_NODES.has(node?.type)) schedule(node); },
  });
}
