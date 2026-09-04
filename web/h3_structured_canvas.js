const appModule = window.comfyAPI?.app;
const app = appModule?.app ?? appModule;
const comfyApi = window.comfyAPI?.api?.api ?? window.comfyAPI?.api;

const CANVAS_NODE = "H3StructuredCanvas";
const PROMPTER_NODE = "H3StructuredPrompter";
const EXTENSION_NAME = "h3.structured.canvas.v0_9_2";
const BUILD = "0.9.2-beta.3";
const SLOTS = ["a", "b", "c", "d", "e"];
const SLOT_COLORS = {
  a: "#ef4444",
  b: "#3b82f6",
  c: "#facc15",
  d: "#4caf50",
  e: "#c13cb7",
};
const SLOT_NAMES = { a: "A", b: "B", c: "C", d: "D", e: "E" };

const TEXT = {
  en: {
    canvas: "CANVAS",
    showBoxes: "Show Boxes",
    drawBox: "Draw Box",
    reset: "Reset Canvas",
    deleteActive: "Delete Active",
    grid: "Grid",
    none: "None",
    thirds: "Thirds",
    cross: "Cross",
    quarters: "Quarters",
    canvasSize: "CANVAS SIZE",
    resolutionPreset: "Resolution Preset",
    customSize: "Custom Size",
    width: "W",
    height: "H",
    apply: "Apply",
    externalOverride: "Connected width/height inputs override this size at execution.",
    canvasPreset: "CANVAS PRESET",
    savePreset: "Save",
    loadPreset: "Load",
    deletePreset: "Delete",
    presetName: "Preset name",
    confirmReset: "Clear all bounding boxes?",
    confirmDeletePreset: "Delete this preset?",
    emptyPreset: "No preset selected.",
    outputNote: "Output: normalized 0–1000 xyxy layout. UI colors are not sent to H3.",
    sceneBackground: "SCENE / BACKGROUND",
    scenePlaceholder: "Describe the overall scene and background. Leave blank if not needed.",
    scenePreset: "Prompt Preset",
    slot: "SLOT",
    enabled: "Enabled",
    type: "Type",
    description: "Description",
    descriptionPlaceholder: "Describe the subject, object, text style, or graphic.",
    exactText: "Exact Text",
    exactTextPlaceholder: "Visible text, preserved exactly",
    motion: "Motion",
    value: "Value (Optional)",
    phase: "Order",
    customBehavior: "Custom motion behavior",
    customBehaviorPlaceholder: "Optional natural-language motion override.",
    camera: "CAMERA",
    speed: "Speed",
    amplitude: "Amplitude",
    advanced: "ADVANCED OPTIONS",
    compilerMode: "Compiler Mode",
    outputFormat: "Output Format",
    schemaProfile: "Schema Profile",
    reinforcement: "Spatial Reinforcement",
    duration: "Duration",
    exactTextSafety: "Exact Text Safety",
    allowExtraText: "Allow additional visible text",
    customInstruction: "Additional Instruction",
    soundscape: "Overall Soundscape",
    music: "Non-diegetic Music",
    startEndHint: "Start-End uses H3 Layout Transition between two Canvas nodes.",
    endConnected: "Transition layout ready",
    endMissing: "Transition layout missing",
    prompterNote: "Hybrid mode emits structured JSON plus a resolved natural-language summary.",
    typeAuto: "Auto",
    typeSubject: "Subject",
    typeObject: "Object",
    typeText: "Text",
    typeGraphic: "Graphic",
    motionStatic: "None",
    motionStartEnd: "Start → End",
    motionFadeIn: "Fade In",
    motionFadeOut: "Fade Out",
    motionSlideInLeft: "Slide In from Left",
    motionSlideInRight: "Slide In from Right",
    motionSlideUp: "Slide Up",
    motionSlideDown: "Slide Down",
    motionScaleUp: "Scale Up",
    motionScaleDown: "Scale Down",
    motionPopIn: "Pop In",
    motionGrowUp: "Grow Up",
    motionGrowRight: "Grow Right",
    motionRadialFill: "Radial Fill",
    motionProgressFill: "Progress Fill",
    motionReveal: "Reveal",
    motionHold: "Hold",
    language: "UI",
    activeBoxHint: "Drag empty space to draw. Drag a box to move it; drag corner handles to resize.",
  },
  ja: {
    canvas: "キャンバス",
    showBoxes: "BOX表示",
    drawBox: "BOX描画",
    reset: "全消去",
    deleteActive: "選択BOX削除",
    grid: "グリッド",
    none: "なし",
    thirds: "三分割",
    cross: "中央線",
    quarters: "四分割",
    canvasSize: "キャンバスサイズ",
    resolutionPreset: "解像度プリセット",
    customSize: "カスタムサイズ",
    width: "幅",
    height: "高さ",
    apply: "適用",
    externalOverride: "接続された width / height は実行時にこのサイズを上書きします。",
    canvasPreset: "キャンバスプリセット",
    savePreset: "保存",
    loadPreset: "読込",
    deletePreset: "削除",
    presetName: "プリセット名",
    confirmReset: "すべてのBBOXを消去しますか？",
    confirmDeletePreset: "このプリセットを削除しますか？",
    emptyPreset: "プリセットが選択されていません。",
    outputNote: "出力: 0–1000正規化xyxyレイアウト。UI色はH3へ送信しません。",
    sceneBackground: "シーン / 背景",
    scenePlaceholder: "シーン全体と背景を記述します。不要なら空欄で構いません。",
    scenePreset: "プロンプトプリセット",
    slot: "スロット",
    enabled: "有効",
    type: "種類",
    description: "説明",
    descriptionPlaceholder: "人物、物体、文字スタイル、グラフィックを記述します。",
    exactText: "正確な表示文字",
    exactTextPlaceholder: "画面に表示する文字列",
    motion: "モーション",
    value: "数値（任意）",
    phase: "順番",
    customBehavior: "カスタム動作",
    customBehaviorPlaceholder: "任意の自然言語モーション補強。",
    camera: "カメラ",
    speed: "速度",
    amplitude: "振幅",
    advanced: "詳細設定",
    compilerMode: "コンパイラモード",
    outputFormat: "出力形式",
    schemaProfile: "スキーマ",
    reinforcement: "空間補強",
    duration: "目安時間（秒）",
    exactTextSafety: "正確な文字を保護",
    allowExtraText: "追加文字を許可",
    customInstruction: "追加指示",
    soundscape: "環境音",
    music: "非劇伴音楽",
    startEndHint: "Start → Endは2台のCanvasを H3 Layout Transition で結合します。",
    endConnected: "Transitionレイアウト準備済み",
    endMissing: "Transitionレイアウトなし",
    prompterNote: "Hybridは構造化JSONと解決済み自然言語要約を同時に出力します。",
    typeAuto: "自動",
    typeSubject: "人物・生物",
    typeObject: "物体",
    typeText: "文字",
    typeGraphic: "グラフィック",
    motionStatic: "なし",
    motionStartEnd: "Start → End",
    motionFadeIn: "フェードイン",
    motionFadeOut: "フェードアウト",
    motionSlideInLeft: "左からスライドイン",
    motionSlideInRight: "右からスライドイン",
    motionSlideUp: "下からスライド",
    motionSlideDown: "上からスライド",
    motionScaleUp: "拡大表示",
    motionScaleDown: "縮小表示",
    motionPopIn: "ポップイン",
    motionGrowUp: "上方向へ伸長",
    motionGrowRight: "右方向へ伸長",
    motionRadialFill: "円形フィル",
    motionProgressFill: "進捗フィル",
    motionReveal: "リビール",
    motionHold: "保持",
    language: "UI",
    activeBoxHint: "空所をドラッグして描画。BOX内部をドラッグして移動、四隅でサイズ変更します。",
  },
};

const RESOLUTION_PRESETS = [
  ["640 × 640 (1:1)", 640, 640],
  ["768 × 768 (1:1)", 768, 768],
  ["1024 × 1024 (1:1)", 1024, 1024],
  ["1344 × 768 (16:9)", 1344, 768],
  ["1280 × 720 (16:9)", 1280, 720],
  ["768 × 1344 (9:16)", 768, 1344],
  ["720 × 1280 (9:16)", 720, 1280],
  ["1024 × 768 (4:3)", 1024, 768],
  ["768 × 1024 (3:4)", 768, 1024],
];

const BUILTIN_CANVAS_PRESETS = {
  two_subjects: {
    label: { en: "Two Subjects", ja: "2人構図" },
    boxes: [
      { slot: "a", ui_color: "red", bbox_2d: [80, 120, 420, 940] },
      { slot: "b", ui_color: "blue", bbox_2d: [600, 120, 920, 940] },
    ],
  },
  three_columns: {
    label: { en: "Three Columns", ja: "3列構図" },
    boxes: [
      { slot: "a", ui_color: "red", bbox_2d: [40, 180, 300, 900] },
      { slot: "b", ui_color: "blue", bbox_2d: [370, 180, 630, 900] },
      { slot: "c", ui_color: "yellow", bbox_2d: [700, 180, 960, 900] },
    ],
  },
  title_chart: {
    label: { en: "Title + Chart", ja: "タイトル＋グラフ" },
    boxes: [
      { slot: "a", ui_color: "red", bbox_2d: [150, 100, 850, 230] },
      { slot: "b", ui_color: "blue", bbox_2d: [200, 280, 800, 820] },
      { slot: "c", ui_color: "yellow", bbox_2d: [350, 450, 650, 620] },
      { slot: "d", ui_color: "green", bbox_2d: [250, 850, 750, 940] },
    ],
  },
  magazine_cover: {
    label: { en: "Magazine Cover", ja: "雑誌表紙" },
    boxes: [
      { slot: "a", ui_color: "red", bbox_2d: [80, 40, 920, 190] },
      { slot: "b", ui_color: "blue", bbox_2d: [540, 190, 950, 900] },
      { slot: "c", ui_color: "yellow", bbox_2d: [50, 260, 480, 420] },
      { slot: "d", ui_color: "green", bbox_2d: [50, 470, 480, 630] },
      { slot: "e", ui_color: "magenta", bbox_2d: [50, 690, 480, 870] },
    ],
  },
};

const TYPE_OPTIONS = [
  ["subject", "typeSubject"],
  ["object", "typeObject"],
  ["text", "typeText"],
  ["graphic", "typeGraphic"],
];

const MOTION_OPTIONS = {
  subject: ["none", "hold", "start_end", "move_left_right", "move_right_left", "move_top_bottom", "move_bottom_top", "slide_in_left", "slide_in_right", "slide_in_top", "slide_in_bottom", "fade_in", "scale_up"],
  object: ["none", "hold", "start_end", "move_left_right", "move_right_left", "move_top_bottom", "move_bottom_top", "slide_in_left", "slide_in_right", "slide_in_top", "slide_in_bottom", "fade_in", "scale_up"],
  text: ["none", "hold", "fade_in", "fade_out", "slide_in_left", "slide_in_right", "slide_in_top", "slide_in_bottom", "scale_up", "scale_down", "pop_in", "reveal"],
  graphic: ["none", "hold", "fade_in", "slide_in_left", "slide_in_right", "slide_in_top", "slide_in_bottom", "scale_up", "grow_up", "grow_down", "grow_left", "grow_right", "radial_fill", "progress_fill", "reveal"],
};

const ORDERED_MOTIONS = new Set(["start_end", "move_left_right", "move_right_left", "move_top_bottom", "move_bottom_top", "fade_in", "fade_out", "slide_in_left", "slide_in_right", "slide_in_top", "slide_in_bottom", "scale_up", "scale_down", "pop_in", "grow_up", "grow_down", "grow_left", "grow_right", "radial_fill", "progress_fill", "reveal"]);
const VALUE_MOTIONS = new Set(["radial_fill", "progress_fill"]);
const MOTION_LABELS = {
  none: {en:"None", ja:"なし"}, hold:{en:"Hold Position",ja:"位置を保持"}, start_end:{en:"Start → End Layout",ja:"Start → End レイアウト"},
  move_left_right:{en:"Move Left → Right",ja:"左 → 右へ移動"}, move_right_left:{en:"Move Right → Left",ja:"右 → 左へ移動"},
  move_top_bottom:{en:"Move Top → Bottom",ja:"上 → 下へ移動"}, move_bottom_top:{en:"Move Bottom → Top",ja:"下 → 上へ移動"},
  fade_in:{en:"Fade In",ja:"フェードイン"}, fade_out:{en:"Fade Out",ja:"フェードアウト"},
  slide_in_left:{en:"Slide In from Left",ja:"左からスライドイン"}, slide_in_right:{en:"Slide In from Right",ja:"右からスライドイン"},
  slide_in_top:{en:"Slide In from Top",ja:"上からスライドイン"}, slide_in_bottom:{en:"Slide In from Bottom",ja:"下からスライドイン"},
  scale_up:{en:"Scale Up",ja:"拡大表示"}, scale_down:{en:"Scale Down",ja:"縮小表示"}, pop_in:{en:"Pop In",ja:"ポップイン"},
  grow_up:{en:"Grow Up",ja:"上方向へ伸長"}, grow_down:{en:"Grow Down",ja:"下方向へ伸長"}, grow_left:{en:"Grow Left",ja:"左方向へ伸長"}, grow_right:{en:"Grow Right",ja:"右方向へ伸長"},
  radial_fill:{en:"Radial Fill",ja:"円形フィル"}, progress_fill:{en:"Progress Fill",ja:"進捗フィル"}, reveal:{en:"Reveal",ja:"リビール"},
};

const CAMERA_MOTIONS = [
  "Static Shot", "Push In", "Pull Out", "Pan Left", "Pan Right",
  "Truck Left", "Truck Right", "Tilt Up", "Tilt Down", "Pedestal Up",
  "Pedestal Down", "Arc Shot", "Tracking Shot", "POV",
  "Roll Clockwise", "Roll Counterclockwise",
];

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function autoLanguage(value = "auto") {
  if (value === "ja" || value === "en") return value;
  return String(navigator.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en";
}

function t(language, key) {
  return TEXT[autoLanguage(language)]?.[key] ?? TEXT.en[key] ?? key;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function simplifiedAspect(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const ratio = w / h;
  const canonical = [[1, 1], [16, 9], [9, 16], [4, 3], [3, 4], [3, 2], [2, 3], [21, 9], [9, 21]];
  let best = canonical[0];
  let bestError = Infinity;
  for (const item of canonical) {
    const target = item[0] / item[1];
    const error = Math.abs(ratio - target) / target;
    if (error < bestError) { best = item; bestError = error; }
  }
  if (bestError <= 0.025) return `${best[0]}:${best[1]}`;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}

function parseJSON(value, fallback) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : deepClone(fallback);
  } catch {
    return deepClone(fallback);
  }
}

function defaultCanvasState() {
  return {
    schema: "h3_structured_canvas/0.9",
    canvas: {
      width: 1024,
      height: 1024,
      aspect_ratio: "1:1",
      coordinate_space: "normalized_0_1000",
      bbox_format: "xyxy",
      grid: "thirds",
      show_boxes: true,
      active_slot: "a",
      ui_language: "auto",
    },
    boxes: [],
  };
}

function defaultSlot(slot) {
  return {
    slot, enabled: true, type: slot === "a" || slot === "b" ? "subject" : "object",
    description: "", exact_text: "", motion: "none", value: null,
    order: SLOTS.indexOf(slot) + 1, custom_behavior: "",
  };
}

function defaultPromptState() {
  return {
    schema: "h3_structured_prompt_config/0.9", ui_language: "auto", scene_description: "",
    compiler_mode: "hybrid", output_format: "direct", schema_profile: "verified_split_bbox", reinforcement: "balanced",
    exact_text_safety: true, allow_additional_text: false, full_frame: true,
    slots: Object.fromEntries(SLOTS.map((slot) => [slot, defaultSlot(slot)])),
    camera: { motion: "Static Shot", speed: "auto", amplitude: "auto" },
    soundscape: "", music: "", custom_instruction: "",
    _ui: { expanded: { a: true, b: false, c: false, d: false, e: false }, developer: false, audio: false, more: false },
  };
}

function normalizeBox(raw) {
  if (!raw || typeof raw !== "object") return null;
  const slotFromColor = { red: "a", blue: "b", yellow: "c", green: "d", magenta: "e" };
  let slot = String(raw.slot ?? raw.id ?? "").trim().toLowerCase();
  slot = slotFromColor[slot] ?? slot;
  const slotMatch = slot.match(/^(?:slot|element|subject|object|text|graphic)[_-]?([a-e])$/);
  if (slotMatch) slot = slotMatch[1];
  if (/^[1-5]$/.test(slot)) slot = SLOTS[Number(slot) - 1];
  if (!SLOTS.includes(slot)) return null;
  let box = raw.bbox_2d ?? raw.bbox;
  if (!Array.isArray(box) && [raw.x1, raw.y1, raw.x2, raw.y2].every((v) => Number.isFinite(Number(v)))) {
    box = [raw.x1, raw.y1, raw.x2, raw.y2];
  }
  if (!Array.isArray(box) || box.length !== 4) return null;
  let values = box.map(Number);
  if (!values.every(Number.isFinite)) return null;
  if (Math.max(...values.map(Math.abs)) <= 1.000001) values = values.map((v) => v * 1000);
  let [x1, y1, x2, y2] = values.map((v) => clamp(v, 0, 1000));
  [x1, x2] = x1 <= x2 ? [x1, x2] : [x2, x1];
  [y1, y2] = y1 <= y2 ? [y1, y2] : [y2, y1];
  if (x2 - x1 < 1 || y2 - y1 < 1) return null;
  return { slot, ui_color: { a: "red", b: "blue", c: "yellow", d: "green", e: "magenta" }[slot], bbox_2d: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)] };
}

function sanitizeCanvasState(raw, widthWidget, heightWidget) {
  const base = defaultCanvasState();
  const source = raw && typeof raw === "object" ? raw : {};
  const canvas = source.canvas && typeof source.canvas === "object" ? source.canvas : {};
  base.canvas.width = clamp(Math.round(Number(canvas.width ?? source.width ?? widthWidget?.value ?? 1024)) || 1024, 64, 16384);
  base.canvas.height = clamp(Math.round(Number(canvas.height ?? source.height ?? heightWidget?.value ?? 1024)) || 1024, 64, 16384);
  base.canvas.grid = ["none", "thirds", "cross", "quarters"].includes(canvas.grid) ? canvas.grid : "thirds";
  base.canvas.show_boxes = canvas.show_boxes !== false;
  base.canvas.active_slot = SLOTS.includes(canvas.active_slot) ? canvas.active_slot : "a";
  base.canvas.ui_language = ["auto", "en", "ja"].includes(canvas.ui_language) ? canvas.ui_language : "auto";
  const boxes = Array.isArray(source.boxes) ? source.boxes : Array.isArray(source.layout?.boxes) ? source.layout.boxes : [];
  const bySlot = new Map();
  for (const item of boxes) {
    const box = normalizeBox(item);
    if (box) bySlot.set(box.slot, box);
  }
  base.boxes = SLOTS.filter((slot) => bySlot.has(slot)).map((slot) => bySlot.get(slot));
  return base;
}

function sanitizePromptState(raw) {
  const base = defaultPromptState();
  const source = raw && typeof raw === "object" ? raw : {};
  for (const key of ["ui_language","scene_description","compiler_mode","output_format","schema_profile","reinforcement","exact_text_safety","allow_additional_text","full_frame","soundscape","music","custom_instruction"]) {
    if (key in source) base[key] = source[key];
  }
  base.ui_language = ["auto", "en", "ja"].includes(base.ui_language) ? base.ui_language : "auto";
  base.slots = {};
  for (const slot of SLOTS) {
    const legacy = source.slots?.[slot] ?? {};
    const q = { ...defaultSlot(slot), ...legacy };
    if (q.type === "auto" || !TYPE_OPTIONS.some(([v]) => v === q.type)) q.type = slot === "a" || slot === "b" ? "subject" : "object";
    const motionMap = { static:"none", slide_up:"slide_in_bottom", slide_down:"slide_in_top" };
    q.motion = motionMap[q.motion] ?? q.motion ?? "none";
    if (!(MOTION_OPTIONS[q.type] ?? []).includes(q.motion)) q.motion = "none";
    q.order = Math.max(1, Math.min(99, Math.round(Number(q.order ?? q.phase ?? SLOTS.indexOf(slot)+1)) || 1));
    delete q.phase;
    base.slots[slot] = q;
  }
  base.camera = { motion: "Static Shot", speed: "auto", amplitude: "auto", ...(source.camera ?? {}) };
  base._ui = {
    expanded: { a:true,b:false,c:false,d:false,e:false, ...(source._ui?.expanded ?? {}) },
    developer: Boolean(source._ui?.developer ?? source._ui?.advanced),
    audio: Boolean(source._ui?.audio),
    more: Boolean(source._ui?.more),
  };
  return base;
}

function findWidget(node, name) {
  return node.widgets?.find((widget) => widget.name === name);
}

function hideNativeWidget(widget) {
  if (!widget || widget.__h3scHidden) return;
  widget.__h3scHidden = true;
  widget.__h3scComputeSize = widget.computeSize;
  widget.computeSize = () => [0, -4];
  widget.draw = () => {};
  widget.hidden = true;
  for (const node of [widget.inputEl, widget.element, widget.container]) {
    if (node?.style) { node.style.display = "none"; node.style.height = "0"; node.style.maxHeight = "0"; node.style.pointerEvents = "none"; node.style.opacity = "0"; }
  }
}

function markNodeDirty(node) {
  node.setDirtyCanvas?.(true, true);
  app?.graph?.setDirtyCanvas?.(true, true);
}

function setWidgetValue(widget, value, node) {
  if (!widget) return;
  widget.value = value;
  widget.callback?.(value, app?.canvas, node, [0, 0], null);
  markNodeDirty(node);
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function labeledField(labelText, control, className = "") {
  const wrap = make("label", `h3sc-field ${className}`.trim());
  wrap.append(make("span", "h3sc-field-label", labelText), control);
  return wrap;
}

function stopGraphEvents(root) {
  if (!root || root.__h3scStopEventsInstalled) return;
  root.__h3scStopEventsInstalled = true;
  const stop = (event) => {
    if (event.target.closest("button,input,textarea,select,canvas,summary,details")) event.stopPropagation();
  };
  root.addEventListener("pointerdown", stop);
  root.addEventListener("mousedown", stop);
  root.addEventListener("wheel", (event) => {
    if (event.target.closest("textarea,.h3sc-scroll")) event.stopPropagation();
  }, { passive: true });
}

function inputConnected(node, inputName) {
  return Boolean(node.inputs?.find((input) => input.name === inputName)?.link != null);
}

async function apiFetch(path, options = {}) {
  if (comfyApi?.fetchApi) return comfyApi.fetchApi(path, options);
  return fetch(path, options);
}

function localPresetKey(kind) {
  return `h3_structured_canvas:${kind}:presets:v1`;
}

function loadLocalPresets(kind) {
  try {
    const value = JSON.parse(localStorage.getItem(localPresetKey(kind)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveLocalPresets(kind, presets) {
  try { localStorage.setItem(localPresetKey(kind), JSON.stringify(presets)); } catch { /* ignore */ }
}

async function loadPresets(kind) {
  try {
    const response = await apiFetch(`/h3_structured_canvas/presets/${kind}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return Array.isArray(body.presets) ? body.presets : [];
  } catch {
    return loadLocalPresets(kind);
  }
}

async function savePreset(kind, name, data) {
  try {
    const response = await apiFetch(`/h3_structured_canvas/presets/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return Array.isArray(body.presets) ? body.presets : [];
  } catch {
    const current = loadLocalPresets(kind).filter((item) => String(item.name).toLowerCase() !== name.toLowerCase());
    current.push({ name, data });
    current.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    saveLocalPresets(kind, current);
    return current;
  }
}

async function deletePreset(kind, name) {
  try {
    const response = await apiFetch(`/h3_structured_canvas/presets/${kind}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    return Array.isArray(body.presets) ? body.presets : [];
  } catch {
    const current = loadLocalPresets(kind).filter((item) => String(item.name).toLowerCase() !== name.toLowerCase());
    saveLocalPresets(kind, current);
    return current;
  }
}

function ensureStyles() {
  if (document.getElementById("h3sc-styles-v09")) return;
  const style = document.createElement("style");
  style.id = "h3sc-styles-v09";
  style.textContent = `
.h3sc-root{font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#ddd;box-sizing:border-box;width:100%;height:100%;min-height:0}
.h3sc-root *{box-sizing:border-box}.h3sc-shell{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0;padding:3px;overflow:hidden}
.h3sc-scroll{overflow:auto;scrollbar-width:thin;scrollbar-color:#555 #202020;padding-right:2px;flex:1 1 auto;min-height:0}.h3sc-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.h3sc-spacer{flex:1 1 auto}
.h3sc-toolbar,.h3sc-card,.h3sc-panel,.h3sc-scene{background:#181a1b;border:1px solid #343738;border-radius:8px;padding:8px}
.h3sc-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.h3sc-section-title{color:#48d5cf;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;margin:0 0 6px}
.h3sc-btn{border:1px solid #555;background:#2a2d2e;color:#e7e7e7;border-radius:5px;padding:5px 9px;cursor:pointer;white-space:nowrap}.h3sc-btn:hover{border-color:#8a8a8a;background:#343839}.h3sc-btn.active,.h3sc-btn.primary{border-color:#48d5cf;background:#176f73;color:#fff}.h3sc-btn.danger{border-color:#7b3434}.h3sc-btn:disabled{opacity:.38;cursor:not-allowed}
.h3sc-slot-button{width:30px;height:30px;padding:0;border-radius:5px;font-weight:800;color:#fff;text-shadow:0 1px 2px #000;border:2px solid transparent;cursor:pointer}.h3sc-slot-button.active{border-color:#fff;box-shadow:0 0 0 2px rgba(72,213,207,.32)}
.h3sc-select,.h3sc-input,.h3sc-textarea{background:#101213;color:#eee;border:1px solid #4b4f50;border-radius:5px;padding:5px 7px;min-width:0}.h3sc-select:focus,.h3sc-input:focus,.h3sc-textarea:focus{outline:none;border-color:#48d5cf;box-shadow:0 0 0 1px rgba(72,213,207,.25)}
.h3sc-textarea{resize:vertical;min-height:66px;width:100%;font:inherit}.h3sc-input{width:100%}.h3sc-number{width:92px}.h3sc-field{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 140px}.h3sc-field-label{font-size:10.5px;color:#aeb4b5}.h3sc-check{display:inline-flex;gap:6px;align-items:center;color:#cfd2d3;cursor:pointer}.h3sc-check input{accent-color:#48d5cf}
.h3sc-monitor{background:#090a0a;border:1px solid #2b2e2f;border-radius:9px;height:clamp(370px,48vh,590px);min-height:320px;display:flex;align-items:center;justify-content:center;padding:10px;overflow:hidden;flex:1 1 auto}
.h3sc-stage{position:relative;background:#202526;border:1px solid #3a3f40;border-radius:7px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}.h3sc-stage canvas{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;outline:none}
.h3sc-panels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.h3sc-preset-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.h3sc-note{font-size:10.5px;color:#92999a;line-height:1.35}.h3sc-status{font-size:10.5px;color:#48d5cf}.h3sc-status.warning{color:#e5b94f}
.h3sc-prompter-shell{overflow:hidden}.h3sc-topbar{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.h3sc-topbar .h3sc-field{flex:0 1 200px}.h3sc-scene .h3sc-textarea{min-height:86px}
.h3sc-slot-card{background:#17191a;border:1px solid #343738;border-radius:8px;overflow:hidden;margin-bottom:7px}.h3sc-slot-head{display:flex;gap:8px;align-items:center;padding:7px 8px;cursor:pointer;user-select:none}.h3sc-slot-chip{width:28px;height:28px;display:grid;place-items:center;border-radius:5px;color:white;font-weight:800;text-shadow:0 1px 2px #000}.h3sc-slot-title{font-weight:800}.h3sc-slot-head .h3sc-check{margin-left:auto}.h3sc-chevron{width:16px;text-align:center;color:#aaa}.h3sc-slot-body{border-top:1px solid #303334;padding:8px;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(180px,.8fr);gap:10px}.h3sc-slot-main,.h3sc-slot-side{display:flex;flex-direction:column;gap:7px;min-width:0}.h3sc-slot-card.disabled{opacity:.55}.h3sc-inline-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.h3sc-hidden{display:none!important}
.h3sc-camera-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px}.h3sc-advanced-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.h3sc-details{background:#17191a;border:1px solid #343738;border-radius:8px;padding:0}.h3sc-details>summary{padding:8px;color:#48d5cf;font-weight:800;cursor:pointer;user-select:none}.h3sc-details-body{padding:0 8px 8px}.h3sc-output-strip{display:flex;gap:8px;align-items:center;background:#151718;border:1px solid #343738;border-radius:7px;padding:6px 8px;color:#9ba1a2;font-size:10.5px}.h3sc-pill{border:1px solid #337f7c;color:#48d5cf;border-radius:999px;padding:2px 7px;font-weight:700}
@media(max-width:700px){.h3sc-panels,.h3sc-slot-body,.h3sc-camera-grid,.h3sc-advanced-grid{grid-template-columns:1fr}.h3sc-monitor{height:400px}}
.h3sc-root{overflow:hidden}.h3sc-prompter-shell{height:100%;overflow:hidden}.h3sc-slot-body{display:block}.h3sc-slot-main{display:block}.h3sc-slot-main .h3sc-textarea{min-height:158px}.h3sc-slot-controls{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(180px,1.25fr) minmax(70px,.45fr);gap:8px;align-items:end;margin-top:8px}.h3sc-slot-extra{margin-top:8px}.h3sc-scene .h3sc-textarea{min-height:104px}.h3sc-details.compact>summary{padding:7px 8px}.h3sc-footer-note{display:flex;align-items:center;gap:7px;background:#151718;border:1px solid #343738;border-radius:7px;padding:6px 8px;color:#9ba1a2;font-size:10.5px}.h3sc-output-strip{flex:0 0 auto}.h3sc-developer-json{white-space:pre-wrap;overflow:auto;max-height:180px;background:#0d0f10;border:1px solid #333;border-radius:5px;padding:6px;font:10px/1.35 ui-monospace,monospace;color:#9da3a4}.h3sc-inline-note{font-size:10px;color:#8f9697;margin-top:4px}.h3sc-transition-hint{font-size:10px;color:#e4b548;margin-top:5px}.h3sc-more-grid{display:grid;grid-template-columns:1fr;gap:7px}@media(max-width:700px){.h3sc-slot-controls{grid-template-columns:1fr}.h3sc-slot-main .h3sc-textarea{min-height:130px}}
`;
  document.head.append(style);
}

class CanvasController {
  constructor(node, root) {
    this.node = node;
    this.root = root;
    this.widthWidget = findWidget(node, "canvas_width");
    this.heightWidget = findWidget(node, "canvas_height");
    this.stateWidget = findWidget(node, "layout_json");
    [this.widthWidget, this.heightWidget, this.stateWidget].forEach(hideNativeWidget);
    this.state = sanitizeCanvasState(parseJSON(this.stateWidget?.value, defaultCanvasState()), this.widthWidget, this.heightWidget);
    this.drawMode = true;
    this.userPresets = [];
    this.drag = null;
    this.resizeObserver = null;
    this.render();
    this.loadPresetList();
  }

  get language() { return this.state.canvas.ui_language; }
  get activeSlot() { return this.state.canvas.active_slot; }

  boxFor(slot) { return this.state.boxes.find((box) => box.slot === slot); }

  upsertBox(slot, bbox) {
    const next = { slot, ui_color: { a: "red", b: "blue", c: "yellow", d: "green", e: "magenta" }[slot], bbox_2d: bbox.map((v) => Math.round(clamp(v, 0, 1000))) };
    const index = this.state.boxes.findIndex((box) => box.slot === slot);
    if (index >= 0) this.state.boxes[index] = next;
    else this.state.boxes.push(next);
    this.state.boxes.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
    this.sync();
  }

  removeBox(slot) {
    this.state.boxes = this.state.boxes.filter((box) => box.slot !== slot);
    this.sync();
  }

  sync() {
    this.state.canvas.width = clamp(Math.round(Number(this.state.canvas.width)) || 1024, 64, 16384);
    this.state.canvas.height = clamp(Math.round(Number(this.state.canvas.height)) || 1024, 64, 16384);
    this.state.canvas.aspect_ratio = simplifiedAspect(this.state.canvas.width, this.state.canvas.height);
    setWidgetValue(this.widthWidget, this.state.canvas.width, this.node);
    setWidgetValue(this.heightWidget, this.state.canvas.height, this.node);
    setWidgetValue(this.stateWidget, JSON.stringify(this.state), this.node);
    this.updateControls();
    this.fitAndDraw();
  }

  reloadFromWidgets() {
    this.state = sanitizeCanvasState(parseJSON(this.stateWidget?.value, defaultCanvasState()), this.widthWidget, this.heightWidget);
    this.render();
    this.loadPresetList();
  }

  async loadPresetList() {
    this.userPresets = await loadPresets("canvas");
    this.refreshPresetOptions();
  }

  refreshPresetOptions() {
    if (!this.presetSelect) return;
    const selected = this.presetSelect.value;
    this.presetSelect.replaceChildren(option("", t(this.language, "none")));
    const builtGroup = document.createElement("optgroup");
    builtGroup.label = this.language === "ja" ? "標準" : "Built-in";
    for (const [key, preset] of Object.entries(BUILTIN_CANVAS_PRESETS)) builtGroup.append(option(`builtin:${key}`, preset.label[autoLanguage(this.language)]));
    this.presetSelect.append(builtGroup);
    if (this.userPresets.length) {
      const userGroup = document.createElement("optgroup");
      userGroup.label = this.language === "ja" ? "ユーザー" : "User";
      for (const preset of this.userPresets) userGroup.append(option(`user:${preset.name}`, preset.name));
      this.presetSelect.append(userGroup);
    }
    if ([...this.presetSelect.options].some((item) => item.value === selected)) this.presetSelect.value = selected;
  }

  selectedPresetData() {
    const value = this.presetSelect?.value || "";
    if (value.startsWith("builtin:")) return deepClone(BUILTIN_CANVAS_PRESETS[value.slice(8)]);
    if (value.startsWith("user:")) return deepClone(this.userPresets.find((item) => item.name === value.slice(5))?.data);
    return null;
  }

  applyPreset() {
    const data = this.selectedPresetData();
    if (!data) { alert(t(this.language, "emptyPreset")); return; }
    if (Array.isArray(data.boxes)) this.state.boxes = data.boxes.map(normalizeBox).filter(Boolean);
    if (data.canvas) {
      this.state.canvas.width = Number(data.canvas.width ?? this.state.canvas.width);
      this.state.canvas.height = Number(data.canvas.height ?? this.state.canvas.height);
      this.state.canvas.grid = data.canvas.grid ?? this.state.canvas.grid;
      this.state.canvas.show_boxes = data.canvas.show_boxes ?? this.state.canvas.show_boxes;
    }
    this.sync();
  }

  async saveCurrentPreset() {
    const name = window.prompt(t(this.language, "presetName"));
    if (!name?.trim()) return;
    const data = { canvas: { ...this.state.canvas }, boxes: deepClone(this.state.boxes) };
    this.userPresets = await savePreset("canvas", name.trim(), data);
    this.refreshPresetOptions();
    this.presetSelect.value = `user:${name.trim()}`;
  }

  async deleteCurrentPreset() {
    const value = this.presetSelect?.value || "";
    if (!value.startsWith("user:")) return;
    if (!window.confirm(t(this.language, "confirmDeletePreset"))) return;
    const name = value.slice(5);
    this.userPresets = await deletePreset("canvas", name);
    this.refreshPresetOptions();
    this.presetSelect.value = "";
  }

  render() {
    this.resizeObserver?.disconnect();
    this.root.replaceChildren();
    this.root.className = "h3sc-root";
    const shell = make("div", "h3sc-shell");
    this.root.append(shell);
    stopGraphEvents(this.root);

    const toolbar = make("div", "h3sc-toolbar");
    this.showButton = make("button", "h3sc-btn", t(this.language, "showBoxes"));
    this.showButton.onclick = () => { this.state.canvas.show_boxes = !this.state.canvas.show_boxes; this.sync(); };
    this.drawButton = make("button", "h3sc-btn", t(this.language, "drawBox"));
    this.drawButton.onclick = () => { this.drawMode = !this.drawMode; this.updateControls(); };
    const resetButton = make("button", "h3sc-btn", t(this.language, "reset"));
    resetButton.onclick = () => { if (window.confirm(t(this.language, "confirmReset"))) { this.state.boxes = []; this.sync(); } };
    const deleteButton = make("button", "h3sc-btn danger", t(this.language, "deleteActive"));
    deleteButton.onclick = () => this.removeBox(this.activeSlot);
    toolbar.append(this.showButton, this.drawButton, resetButton, deleteButton);

    for (const slot of SLOTS) {
      const button = make("button", "h3sc-slot-button", SLOT_NAMES[slot]);
      button.style.background = SLOT_COLORS[slot];
      button.dataset.slot = slot;
      button.onclick = () => { this.state.canvas.active_slot = slot; this.sync(); this.canvas.focus(); };
      toolbar.append(button);
    }

    const spacer = make("span", "h3sc-spacer");
    toolbar.append(spacer);
    this.gridSelect = make("select", "h3sc-select");
    for (const [value, key] of [["none", "none"], ["thirds", "thirds"], ["cross", "cross"], ["quarters", "quarters"]]) this.gridSelect.append(option(value, t(this.language, key)));
    this.gridSelect.value = this.state.canvas.grid;
    this.gridSelect.onchange = () => { this.state.canvas.grid = this.gridSelect.value; this.sync(); };
    toolbar.append(labeledField(t(this.language, "grid"), this.gridSelect));
    const language = make("select", "h3sc-select");
    language.append(option("auto", "Auto"), option("en", "English"), option("ja", "日本語"));
    language.value = this.state.canvas.ui_language;
    language.onchange = () => { this.state.canvas.ui_language = language.value; this.sync(); this.render(); this.loadPresetList(); };
    toolbar.append(labeledField(t(this.language, "language"), language));
    shell.append(toolbar);

    this.monitor = make("div", "h3sc-monitor");
    this.stage = make("div", "h3sc-stage");
    this.canvas = document.createElement("canvas");
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "H3 normalized bounding box canvas");
    this.stage.append(this.canvas);
    this.monitor.append(this.stage);
    shell.append(this.monitor);
    this.installCanvasEvents();

    const panels = make("div", "h3sc-panels");
    const sizePanel = make("section", "h3sc-panel");
    sizePanel.append(make("h4", "h3sc-section-title", t(this.language, "canvasSize")));
    this.resolutionSelect = make("select", "h3sc-select");
    this.resolutionSelect.append(option("custom", this.language === "ja" ? "カスタム" : "Custom"));
    for (const [label, width, height] of RESOLUTION_PRESETS) this.resolutionSelect.append(option(`${width}x${height}`, label));
    this.resolutionSelect.onchange = () => {
      if (this.resolutionSelect.value === "custom") return;
      const [width, height] = this.resolutionSelect.value.split("x").map(Number);
      this.state.canvas.width = width; this.state.canvas.height = height; this.sync();
    };
    sizePanel.append(labeledField(t(this.language, "resolutionPreset"), this.resolutionSelect));
    const sizeRow = make("div", "h3sc-row");
    this.widthInput = make("input", "h3sc-input h3sc-number");
    this.widthInput.type = "number"; this.widthInput.min = "64"; this.widthInput.max = "16384"; this.widthInput.step = "8";
    this.heightInput = make("input", "h3sc-input h3sc-number");
    this.heightInput.type = "number"; this.heightInput.min = "64"; this.heightInput.max = "16384"; this.heightInput.step = "8";
    const applySize = make("button", "h3sc-btn primary", t(this.language, "apply"));
    applySize.onclick = () => { this.state.canvas.width = Number(this.widthInput.value); this.state.canvas.height = Number(this.heightInput.value); this.resolutionSelect.value = "custom"; this.sync(); };
    sizeRow.append(labeledField(t(this.language, "width"), this.widthInput), labeledField(t(this.language, "height"), this.heightInput), applySize);
    sizePanel.append(sizeRow, make("div", "h3sc-note", t(this.language, "externalOverride")));

    const presetPanel = make("section", "h3sc-panel");
    presetPanel.append(make("h4", "h3sc-section-title", t(this.language, "canvasPreset")));
    this.presetSelect = make("select", "h3sc-select");
    presetPanel.append(this.presetSelect);
    const actions = make("div", "h3sc-preset-actions");
    const save = make("button", "h3sc-btn", t(this.language, "savePreset")); save.onclick = () => this.saveCurrentPreset();
    const load = make("button", "h3sc-btn primary", t(this.language, "loadPreset")); load.onclick = () => this.applyPreset();
    const del = make("button", "h3sc-btn danger", t(this.language, "deletePreset")); del.onclick = () => this.deleteCurrentPreset();
    actions.append(save, load, del); presetPanel.append(actions);
    panels.append(sizePanel, presetPanel);
    shell.append(panels);
    shell.append(make("div", "h3sc-note", t(this.language, "activeBoxHint")));
    const output = make("div", "h3sc-output-strip");
    output.append(make("span", "h3sc-pill", "H3_LAYOUT"), make("span", "", t(this.language, "outputNote")));
    shell.append(output);

    this.resizeObserver = new ResizeObserver(() => this.fitAndDraw());
    this.resizeObserver.observe(this.monitor);
    this.updateControls();
    queueMicrotask(() => this.fitAndDraw());
  }

  updateControls() {
    if (!this.root.isConnected && !this.root.children.length) return;
    if (this.showButton) this.showButton.classList.toggle("active", this.state.canvas.show_boxes);
    if (this.drawButton) this.drawButton.classList.toggle("active", this.drawMode);
    this.root.querySelectorAll(".h3sc-slot-button").forEach((button) => button.classList.toggle("active", button.dataset.slot === this.activeSlot));
    if (this.widthInput) this.widthInput.value = String(this.state.canvas.width);
    if (this.heightInput) this.heightInput.value = String(this.state.canvas.height);
    if (this.gridSelect) this.gridSelect.value = this.state.canvas.grid;
    if (this.resolutionSelect) {
      const key = `${this.state.canvas.width}x${this.state.canvas.height}`;
      this.resolutionSelect.value = [...this.resolutionSelect.options].some((item) => item.value === key) ? key : "custom";
    }
  }

  fitAndDraw() {
    if (!this.monitor || !this.canvas || !this.stage) return;
    const availableWidth = Math.max(100, this.monitor.clientWidth - 20);
    const availableHeight = Math.max(100, this.monitor.clientHeight - 20);
    const ratio = this.state.canvas.width / this.state.canvas.height;
    let cssWidth = availableWidth;
    let cssHeight = cssWidth / ratio;
    if (cssHeight > availableHeight) { cssHeight = availableHeight; cssWidth = cssHeight * ratio; }
    this.stage.style.width = `${Math.floor(cssWidth)}px`;
    this.stage.style.height = `${Math.floor(cssHeight)}px`;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) { this.canvas.width = pixelWidth; this.canvas.height = pixelHeight; }
    this.draw();
  }

  draw() {
    const ctx = this.canvas?.getContext("2d");
    if (!ctx) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#202526"; ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx, width, height);
    if (!this.state.canvas.show_boxes) return;
    for (const box of this.state.boxes) this.drawBox(ctx, box, width, height, box.slot === this.activeSlot);
  }

  drawGrid(ctx, width, height) {
    const grid = this.state.canvas.grid;
    if (grid === "none") return;
    ctx.save(); ctx.strokeStyle = "rgba(230,240,240,.22)"; ctx.lineWidth = 1;
    const lines = [];
    if (grid === "thirds") { lines.push([width / 3, 0, width / 3, height], [2 * width / 3, 0, 2 * width / 3, height], [0, height / 3, width, height / 3], [0, 2 * height / 3, width, 2 * height / 3]); }
    if (grid === "cross") { lines.push([width / 2, 0, width / 2, height], [0, height / 2, width, height / 2]); }
    if (grid === "quarters") { for (let i = 1; i < 4; i += 1) lines.push([i * width / 4, 0, i * width / 4, height], [0, i * height / 4, width, i * height / 4]); }
    for (const [x1, y1, x2, y2] of lines) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    ctx.restore();
  }

  drawBox(ctx, box, width, height, active) {
    const [x1, y1, x2, y2] = box.bbox_2d;
    const left = x1 / 1000 * width, top = y1 / 1000 * height, right = x2 / 1000 * width, bottom = y2 / 1000 * height;
    const color = SLOT_COLORS[box.slot];
    ctx.save();
    ctx.fillStyle = `${color}22`; ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = color; ctx.lineWidth = active ? 2.5 : 1.6; ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.fillStyle = color; ctx.fillRect(left, Math.max(0, top - 24), 28, 24);
    ctx.fillStyle = box.slot === "c" ? "#151515" : "white"; ctx.font = "700 14px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(SLOT_NAMES[box.slot], left + 14, Math.max(12, top - 12));
    if (active) {
      const size = 7;
      for (const [x, y] of [[left, top], [right, top], [right, bottom], [left, bottom]]) { ctx.fillStyle = color; ctx.fillRect(x - size / 2, y - size / 2, size, size); ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.strokeRect(x - size / 2, y - size / 2, size, size); }
    }
    ctx.restore();
  }

  eventPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width * 1000, 0, 1000), y: clamp((event.clientY - rect.top) / rect.height * 1000, 0, 1000), px: event.clientX - rect.left, py: event.clientY - rect.top, rect };
  }

  hitTest(point) {
    const thresholdX = 12 / point.rect.width * 1000;
    const thresholdY = 12 / point.rect.height * 1000;
    const ordered = [...this.state.boxes].sort((a, b) => (a.slot === this.activeSlot ? 1 : 0) - (b.slot === this.activeSlot ? 1 : 0)).reverse();
    for (const box of ordered) {
      const [x1, y1, x2, y2] = box.bbox_2d;
      const corners = { nw: [x1, y1], ne: [x2, y1], se: [x2, y2], sw: [x1, y2] };
      for (const [handle, [x, y]] of Object.entries(corners)) if (Math.abs(point.x - x) <= thresholdX && Math.abs(point.y - y) <= thresholdY) return { box, mode: "resize", handle };
      if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) return { box, mode: "move" };
    }
    return null;
  }

  installCanvasEvents() {
    this.canvas.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); this.canvas.focus(); this.canvas.setPointerCapture(event.pointerId);
      const point = this.eventPoint(event); const hit = this.hitTest(point);
      if (hit) {
        this.state.canvas.active_slot = hit.box.slot;
        this.drag = { pointerId: event.pointerId, mode: hit.mode, handle: hit.handle, start: point, original: [...hit.box.bbox_2d] };
      } else if (this.drawMode) {
        this.drag = { pointerId: event.pointerId, mode: "draw", start: point, original: [point.x, point.y, point.x, point.y] };
        this.upsertBox(this.activeSlot, [point.x, point.y, point.x + 1, point.y + 1]);
      }
      this.updateControls(); this.draw();
    };
    this.canvas.onpointermove = (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      event.preventDefault(); const point = this.eventPoint(event); const [ox1, oy1, ox2, oy2] = this.drag.original;
      let box;
      if (this.drag.mode === "draw") box = [Math.min(this.drag.start.x, point.x), Math.min(this.drag.start.y, point.y), Math.max(this.drag.start.x, point.x), Math.max(this.drag.start.y, point.y)];
      else if (this.drag.mode === "move") {
        const dx = point.x - this.drag.start.x, dy = point.y - this.drag.start.y;
        const width = ox2 - ox1, height = oy2 - oy1;
        const x1 = clamp(ox1 + dx, 0, 1000 - width), y1 = clamp(oy1 + dy, 0, 1000 - height);
        box = [x1, y1, x1 + width, y1 + height];
      } else {
        let [x1, y1, x2, y2] = [ox1, oy1, ox2, oy2];
        if (this.drag.handle.includes("n")) y1 = point.y;
        if (this.drag.handle.includes("s")) y2 = point.y;
        if (this.drag.handle.includes("w")) x1 = point.x;
        if (this.drag.handle.includes("e")) x2 = point.x;
        box = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
      }
      if (box[2] - box[0] >= 1 && box[3] - box[1] >= 1) this.upsertBox(this.activeSlot, box);
    };
    const finish = (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointerId) return;
      const box = this.boxFor(this.activeSlot);
      if (box && (box.bbox_2d[2] - box.bbox_2d[0] < 12 || box.bbox_2d[3] - box.bbox_2d[1] < 12)) this.removeBox(this.activeSlot);
      this.drag = null; this.sync();
    };
    this.canvas.onpointerup = finish; this.canvas.onpointercancel = finish;
    this.canvas.onkeydown = (event) => { if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); this.removeBox(this.activeSlot); } };
  }

  onConnectionsChanged() { this.updateControls(); }
  onResize() { this.fitAndDraw(); }
  destroy() { this.resizeObserver?.disconnect(); }
}

const BUILTIN_PROMPT_PRESETS = {
  two_subjects: {
    label: { en: "Two Subjects", ja: "2人構図" },
    scene_description: "A realistic cinematic scene with two young adults visible separately in the same frame, natural light.",
    slots: {
      a: { type: "subject", description: "A young adult woman with long dark hair, full-body view, standing naturally and facing the camera.", motion: "none", order: 1 },
      b: { type: "subject", description: "A young adult man with short dark hair, full-body view, standing naturally and facing the camera.", motion: "none", order: 2 },
    },
  },
  motion_graphics: {
    label: { en: "Motion Graphics · 75%", ja: "モーショングラフィック・75%" },
    scene_description: "A clean modern motion graphics composition on a simple light background with bold editorial typography.",
    slots: {
      a: { type: "text", exact_text: "CREATIVE GROWTH", description: "Bold uppercase sans-serif headline.", motion: "slide_in_left", order: 1 },
      b: { type: "text", exact_text: "75%", description: "Very large bold percentage value.", motion: "scale_up", order: 2 },
      c: { type: "text", exact_text: "YEARLY INCREASE", description: "Clean medium-weight uppercase caption.", motion: "fade_in", order: 3 },
    },
  },
  progress_ring: {
    label: { en: "Infographic · Progress Ring", ja: "インフォグラフィック・円形ゲージ" },
    scene_description: "A clean minimal animated infographic on a plain light background.",
    slots: {
      a: { type: "text", exact_text: "PROJECT COMPLETE", description: "Bold uppercase infographic title.", motion: "fade_in", order: 1 },
      b: { type: "graphic", description: "A clean circular progress chart showing seventy-five percent completion.", motion: "radial_fill", value: 75, order: 2 },
      c: { type: "text", exact_text: "75%", description: "Very large bold percentage value centered inside the chart.", motion: "scale_up", order: 3 },
      d: { type: "text", exact_text: "COMPLETED", description: "Clean bold uppercase label.", motion: "fade_in", order: 4 },
    },
  },
};

class PrompterController {
  constructor(node, root) {
    this.node = node; this.root = root;
    this.stateWidget = findWidget(node, "config_json"); hideNativeWidget(this.stateWidget);
    this.state = sanitizePromptState(parseJSON(this.stateWidget?.value, defaultPromptState()));
    this.userPresets = [];
    this.render(); this.loadPresetList();
  }
  get language() { return this.state.ui_language; }
  sync() { setWidgetValue(this.stateWidget, JSON.stringify(this.state), this.node); }
  reloadFromWidgets() { this.state = sanitizePromptState(parseJSON(this.stateWidget?.value, defaultPromptState())); this.render(); this.loadPresetList(); }

  async loadPresetList() { this.userPresets = await loadPresets("prompter"); this.refreshPresetOptions(); }
  refreshPresetOptions() {
    if (!this.presetSelect) return;
    const selected = this.presetSelect.value;
    this.presetSelect.replaceChildren(option("", t(this.language, "none")));
    const builtGroup = document.createElement("optgroup"); builtGroup.label = this.language === "ja" ? "標準" : "Built-in";
    for (const [key, preset] of Object.entries(BUILTIN_PROMPT_PRESETS)) builtGroup.append(option(`builtin:${key}`, preset.label[autoLanguage(this.language)]));
    this.presetSelect.append(builtGroup);
    if (this.userPresets.length) { const group = document.createElement("optgroup"); group.label = this.language === "ja" ? "ユーザー" : "User"; for (const preset of this.userPresets) group.append(option(`user:${preset.name}`, preset.name)); this.presetSelect.append(group); }
    if ([...this.presetSelect.options].some((item) => item.value === selected)) this.presetSelect.value = selected;
  }
  applyPreset() {
    const value = this.presetSelect?.value || ""; let data;
    if (value.startsWith("builtin:")) data = deepClone(BUILTIN_PROMPT_PRESETS[value.slice(8)]);
    else if (value.startsWith("user:")) data = deepClone(this.userPresets.find((item) => item.name === value.slice(5))?.data);
    if (!data) { alert(t(this.language, "emptyPreset")); return; }
    const language = this.state.ui_language; const ui = this.state._ui;
    const next = defaultPromptState(); Object.assign(next, data);
    next.slots = Object.fromEntries(SLOTS.map((slot) => [slot, { ...defaultSlot(slot), ...(data.slots?.[slot] ?? {}) }]));
    next.ui_language = language; next._ui = ui;
    this.state = sanitizePromptState(next); this.sync(); this.render(); this.loadPresetList();
  }
  async saveCurrentPreset() {
    const name = window.prompt(t(this.language, "presetName")); if (!name?.trim()) return;
    const data = deepClone(this.state); delete data._ui;
    this.userPresets = await savePreset("prompter", name.trim(), data); this.refreshPresetOptions(); this.presetSelect.value = `user:${name.trim()}`;
  }
  async deleteCurrentPreset() {
    const value = this.presetSelect?.value || ""; if (!value.startsWith("user:")) return;
    if (!window.confirm(t(this.language, "confirmDeletePreset"))) return;
    this.userPresets = await deletePreset("prompter", value.slice(5)); this.refreshPresetOptions(); this.presetSelect.value = "";
  }

  motionLabel(value) { return MOTION_LABELS[value]?.[autoLanguage(this.language)] ?? value; }
  selectControl(items, value, onChange) {
    const select = make("select", "h3sc-select"); for (const [key, label] of items) select.append(option(key, label)); select.value = value;
    select.onchange = () => { onChange(select.value); this.sync(); }; return select;
  }
  simpleDetails(title, openKey) {
    const d = make("details", "h3sc-details compact"); d.open = Boolean(this.state._ui[openKey]);
    d.ontoggle = () => { this.state._ui[openKey] = d.open; this.sync(); };
    d.append(make("summary", "", title)); return d;
  }

  render() {
    this.root.replaceChildren(); this.root.className = "h3sc-root"; stopGraphEvents(this.root);
    const shell = make("div", "h3sc-shell h3sc-prompter-shell"); this.root.append(shell);
    const scroll = make("div", "h3sc-scroll"); shell.append(scroll);

    const topbar = make("div", "h3sc-toolbar h3sc-topbar");
    const language = make("select", "h3sc-select"); language.append(option("auto", "Auto"), option("en", "English"), option("ja", "日本語")); language.value = this.state.ui_language;
    language.onchange = () => { this.state.ui_language = language.value; this.sync(); this.render(); this.loadPresetList(); };
    topbar.append(labeledField(t(this.language, "language"), language));
    this.presetSelect = make("select", "h3sc-select"); topbar.append(labeledField(t(this.language, "scenePreset"), this.presetSelect));
    const save = make("button", "h3sc-btn", t(this.language, "savePreset")); save.onclick = () => this.saveCurrentPreset();
    const load = make("button", "h3sc-btn primary", t(this.language, "loadPreset")); load.onclick = () => this.applyPreset();
    const del = make("button", "h3sc-btn danger", t(this.language, "deletePreset")); del.onclick = () => this.deleteCurrentPreset();
    topbar.append(save, load, del); scroll.append(topbar);

    const scene = make("section", "h3sc-scene"); scene.append(make("h4", "h3sc-section-title", t(this.language, "sceneBackground")));
    const sceneText = make("textarea", "h3sc-textarea"); sceneText.placeholder = t(this.language, "scenePlaceholder"); sceneText.value = this.state.scene_description;
    sceneText.oninput = () => { this.state.scene_description = sceneText.value; this.sync(); }; scene.append(sceneText); scroll.append(scene);

    for (const slot of SLOTS) scroll.append(this.renderSlotCard(slot));

    const camera = make("section", "h3sc-card"); camera.append(make("h4", "h3sc-section-title", t(this.language, "camera")));
    const cameraGrid = make("div", "h3sc-camera-grid");
    const motion = make("select", "h3sc-select"); for (const item of CAMERA_MOTIONS) motion.append(option(item, item)); motion.value = this.state.camera.motion; motion.onchange = () => { this.state.camera.motion = motion.value; this.sync(); };
    const speed = make("select", "h3sc-select"); for (const item of ["auto","slow","medium","fast"]) speed.append(option(item, item[0].toUpperCase()+item.slice(1))); speed.value=this.state.camera.speed; speed.onchange=()=>{this.state.camera.speed=speed.value;this.sync();};
    const amplitude = make("select", "h3sc-select"); for (const item of ["auto","small","medium","large"]) amplitude.append(option(item, item[0].toUpperCase()+item.slice(1))); amplitude.value=this.state.camera.amplitude; amplitude.onchange=()=>{this.state.camera.amplitude=amplitude.value;this.sync();};
    cameraGrid.append(labeledField(t(this.language,"motion"),motion),labeledField(t(this.language,"speed"),speed),labeledField(t(this.language,"amplitude"),amplitude)); camera.append(cameraGrid); scroll.append(camera);

    const audioTitle = this.language === "ja" ? "音声 / 任意" : "AUDIO / OPTIONAL";
    const audio = this.simpleDetails(audioTitle, "audio"); const audioBody=make("div","h3sc-details-body h3sc-more-grid");
    for (const [key,labelKey] of [["soundscape","soundscape"],["music","music"]]) { const a=make("textarea","h3sc-textarea"); a.rows=2; a.value=this.state[key]||""; a.oninput=()=>{this.state[key]=a.value;this.sync();}; audioBody.append(labeledField(t(this.language,labelKey),a)); }
    audio.append(audioBody); scroll.append(audio);

    const moreTitle = this.language === "ja" ? "追加プロンプトオプション" : "MORE PROMPT OPTIONS";
    const more = this.simpleDetails(moreTitle, "more"); const moreBody=make("div","h3sc-details-body"); const instruction=make("textarea","h3sc-textarea"); instruction.rows=3; instruction.value=this.state.custom_instruction||""; instruction.oninput=()=>{this.state.custom_instruction=instruction.value;this.sync();}; moreBody.append(labeledField(t(this.language,"customInstruction"),instruction)); more.append(moreBody); scroll.append(more);

    const devTitle = this.language === "ja" ? "開発者 / 実験設定" : "DEVELOPER / EXPERIMENTAL";
    const dev = this.simpleDetails(devTitle, "developer"); const devBody=make("div","h3sc-details-body"); const grid=make("div","h3sc-advanced-grid");
    const compiler=this.selectControl([["hybrid","Hybrid"],["json_only","JSON Only"],["natural_language","Natural Language"]],this.state.compiler_mode,v=>this.state.compiler_mode=v);
    const outputFormat=this.selectControl([["direct","Direct Prompt"],["h3_envelope","H3 Context Envelope"]],this.state.output_format,v=>this.state.output_format=v);
    const schema=this.selectControl([["verified_split_bbox","Verified bbox"],["qwen_unified_bbox2d","bbox_2d Experimental"]],this.state.schema_profile,v=>this.state.schema_profile=v);
    const reinforcement=this.selectControl([["compact","Compact"],["balanced","Balanced"],["strong","Strong"]],this.state.reinforcement,v=>this.state.reinforcement=v);
    grid.append(labeledField(t(this.language,"compilerMode"),compiler),labeledField(t(this.language,"outputFormat"),outputFormat),labeledField(t(this.language,"schemaProfile"),schema),labeledField(t(this.language,"reinforcement"),reinforcement)); devBody.append(grid);
    const checks=make("div","h3sc-row");
    for (const [key,label] of [["full_frame",this.language==="ja"?"全画面・レターボックス禁止":"Full frame / no letterbox"],["exact_text_safety",t(this.language,"exactTextSafety")],["allow_additional_text",t(this.language,"allowExtraText")]]) { const i=make("input");i.type="checkbox";i.checked=Boolean(this.state[key]);i.onchange=()=>{this.state[key]=i.checked;this.sync();};const l=make("label","h3sc-check");l.append(i,document.createTextNode(label));checks.append(l); }
    devBody.append(checks);
    const cfg=make("details","h3sc-details compact");cfg.append(make("summary","",this.language==="ja"?"内部設定JSON":"Internal config JSON"));const pre=make("pre","h3sc-developer-json");pre.textContent=JSON.stringify(this.state,null,2);cfg.append(pre);devBody.append(cfg); dev.append(devBody);scroll.append(dev);

    const status = make("div", "h3sc-output-strip"); status.append(make("span","h3sc-pill","PROMPT"),make("span","",this.language==="ja"?"MiniMax H3 / Continuum の prompt 入力へ接続":"Connect directly to the MiniMax H3 / Continuum prompt input")); shell.append(status);
  }

  renderSlotCard(slot) {
    const config=this.state.slots[slot]; const card=make("section","h3sc-slot-card");card.classList.toggle("disabled",!config.enabled);
    const head=make("div","h3sc-slot-head");const chip=make("span","h3sc-slot-chip",SLOT_NAMES[slot]);chip.style.background=SLOT_COLORS[slot];const title=make("span","h3sc-slot-title",`${t(this.language,"slot")} ${SLOT_NAMES[slot]}`);
    const enabledInput=make("input");enabledInput.type="checkbox";enabledInput.checked=config.enabled;enabledInput.onchange=(event)=>{event.stopPropagation();config.enabled=enabledInput.checked;this.sync();card.classList.toggle("disabled",!config.enabled);};const enabledLabel=make("label","h3sc-check");enabledLabel.onclick=(event)=>event.stopPropagation();enabledLabel.append(enabledInput,document.createTextNode(t(this.language,"enabled")));
    const chevron=make("span","h3sc-chevron",this.state._ui.expanded[slot]?"⌃":"⌄");head.append(chip,title,enabledLabel,chevron);
    const body=make("div","h3sc-slot-body");body.classList.toggle("h3sc-hidden",!this.state._ui.expanded[slot]);head.onclick=()=>{this.state._ui.expanded[slot]=!this.state._ui.expanded[slot];this.sync();body.classList.toggle("h3sc-hidden",!this.state._ui.expanded[slot]);chevron.textContent=this.state._ui.expanded[slot]?"⌃":"⌄";};card.append(head,body);

    const main=make("div","h3sc-slot-main");const description=make("textarea","h3sc-textarea");description.placeholder=t(this.language,"descriptionPlaceholder");description.value=config.description;description.oninput=()=>{config.description=description.value;this.sync();};main.append(labeledField(t(this.language,"description"),description));body.append(main);

    const controls=make("div","h3sc-slot-controls");
    const type=make("select","h3sc-select");for(const [value,key] of TYPE_OPTIONS)type.append(option(value,t(this.language,key)));type.value=config.type;
    const motion=make("select","h3sc-select");
    const order=make("input","h3sc-input h3sc-number");order.type="number";order.min="1";order.max="99";order.step="1";order.value=String(config.order);
    const orderWrap=labeledField(this.language==="ja"?"順番":"Order",order);order.oninput=()=>{config.order=clamp(Math.round(Number(order.value))||1,1,99);this.sync();};
    const refreshMotion=()=>{const current=config.motion;motion.replaceChildren();for(const value of MOTION_OPTIONS[config.type]??["none"])motion.append(option(value,this.motionLabel(value)));if([...motion.options].some(o=>o.value===current))motion.value=current;else{config.motion="none";motion.value="none";}orderWrap.classList.toggle("h3sc-hidden",!ORDERED_MOTIONS.has(config.motion));};
    type.onchange=()=>{config.type=type.value;if(!(MOTION_OPTIONS[config.type]??[]).includes(config.motion))config.motion="none";this.sync();this.render();};
    motion.onchange=()=>{config.motion=motion.value;this.sync();this.render();};refreshMotion();controls.append(labeledField(t(this.language,"type"),type),labeledField(t(this.language,"motion"),motion),orderWrap);body.append(controls);

    const extra=make("div","h3sc-slot-extra");
    if(config.type==="text"){const exact=make("input","h3sc-input");exact.type="text";exact.placeholder=t(this.language,"exactTextPlaceholder");exact.value=config.exact_text;exact.oninput=()=>{config.exact_text=exact.value;this.sync();};extra.append(labeledField(t(this.language,"exactText"),exact));}
    if(config.type==="graphic"&&VALUE_MOTIONS.has(config.motion)){const value=make("input","h3sc-input h3sc-number");value.type="number";value.step="0.1";value.value=config.value??"";value.oninput=()=>{config.value=value.value===""?null:Number(value.value);this.sync();};extra.append(labeledField(this.language==="ja"?"値 (%)":"Value (%)",value));}
    if(config.motion!=="none"){const custom=make("details","h3sc-details compact");custom.append(make("summary","",t(this.language,"customBehavior")));const cb=make("div","h3sc-details-body");const area=make("textarea","h3sc-textarea");area.rows=2;area.placeholder=t(this.language,"customBehaviorPlaceholder");area.value=config.custom_behavior;area.oninput=()=>{config.custom_behavior=area.value;this.sync();};cb.append(area);if(config.motion==="start_end")cb.append(make("div","h3sc-transition-hint",this.language==="ja"?"2台のCanvasを H3 Layout Transition へ接続し、その出力をPrompterへ接続します。":"Connect two Canvas nodes to H3 Layout Transition, then connect its output to this Prompter."));custom.append(cb);extra.append(custom);}
    if(extra.children.length)body.append(extra);return card;
  }
  onConnectionsChanged() {}
  onResize() {}
  destroy() {}
}

function installNodeUI(nodeType, nodeData) {
  if (nodeType.prototype.__h3scInstalledV092) return;
  nodeType.prototype.__h3scInstalledV092 = true;
  const oldCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    oldCreated?.apply(this, arguments);
    ensureStyles(); this.serialize_widgets = true;
    const root = make("div", "h3sc-root");
    const domWidget = this.addDOMWidget?.("h3sc_ui", "h3sc_ui", root, { serialize:false, hideOnZoom:false });
    if (!domWidget) return;
    const isCanvas = nodeData.name === CANVAS_NODE;
    const target = isCanvas ? [760, 900] : [650, 880];
    domWidget.computeSize = (width) => [width, Math.max(300, (this.size?.[1] ?? target[1]) - 105)];
    this.__h3scDomWidget = domWidget; this.__h3scRoot = root;
    this.__h3scController = isCanvas ? new CanvasController(this, root) : new PrompterController(this, root);
    const current=this.size||[0,0]; if(current[0]<target[0]||current[1]<target[1])this.setSize?.([Math.max(current[0],target[0]),Math.max(current[1],target[1])]);
    queueMicrotask(()=>this.__h3scController?.onResize());
  };
  const oldConfigure=nodeType.prototype.onConfigure;nodeType.prototype.onConfigure=function(){oldConfigure?.apply(this,arguments);queueMicrotask(()=>this.__h3scController?.reloadFromWidgets());};
  const oldConnections=nodeType.prototype.onConnectionsChange;nodeType.prototype.onConnectionsChange=function(){oldConnections?.apply(this,arguments);queueMicrotask(()=>this.__h3scController?.onConnectionsChanged());};
  const oldResize=nodeType.prototype.onResize;nodeType.prototype.onResize=function(){oldResize?.apply(this,arguments);if(this.__h3scRoot){const h=Math.max(280,(this.size?.[1]??880)-105);this.__h3scRoot.style.height=`${h}px`;this.__h3scRoot.style.maxHeight=`${h}px`;}this.__h3scController?.onResize();};
  const oldRemoved=nodeType.prototype.onRemoved;nodeType.prototype.onRemoved=function(){this.__h3scController?.destroy();oldRemoved?.apply(this,arguments);};
  const oldSerialize=nodeType.prototype.onSerialize;nodeType.prototype.onSerialize=function(info){this.__h3scController?.sync?.();oldSerialize?.apply(this,arguments);};
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
