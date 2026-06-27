const canvas = document.querySelector("#viewport");
const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: true,
  stencil: false,
  preserveDrawingBuffer: true,
});
const fallbackContext = gl ? null : canvas.getContext("2d", { alpha: false });
const stateNode = document.querySelector("#state");
const framesNode = document.querySelector("#frames");

const harnessState = {
  booted: false,
  frame: 0,
  runtime: "js-stub",
  wasm: null,
  mainLoop: {
    running: false,
    fps: 0,
    ticks: 0,
  },
  timing: null,
  win32Timing: null,
  browserInput: null,
  canvas: {
    width: canvas.width,
    height: canvas.height,
    cssWidth: canvas.width,
    cssHeight: canvas.height,
    devicePixelRatio: 1,
  },
  graphics: {
    api: gl ? "webgl2" : "2d-fallback",
    ok: Boolean(gl),
    contextLost: false,
    drawingBufferWidth: canvas.width,
    drawingBufferHeight: canvas.height,
  },
  originalEngineLinked: false,
  originalCoreProbe: null,
  globalDataProbe: null,
  commandLineProbe: null,
  cdManagerProbe: null,
  fileSystemProbe: null,
  gameNetworkProbe: null,
  debugProbe: null,
  commonDebugLog: null,
  assetProbe: null,
  archiveMount: null,
  startupAssets: null,
  dataSummary: null,
  originalEngineStartup: null,
  originalWndProcInput: null,
  mountedArchives: [],
  logs: [],
};

const wasmModulePromise = loadWasmModule();

function getCanvasDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const devicePixelRatio = window.devicePixelRatio || 1;
  const cssWidth = rect.width || canvas.width;
  const cssHeight = rect.height || canvas.height;

  return {
    width: Math.max(1, Math.round(cssWidth * devicePixelRatio)),
    height: Math.max(1, Math.round(cssHeight * devicePixelRatio)),
    cssWidth,
    cssHeight,
    devicePixelRatio,
  };
}

function refreshCanvasState(displaySize = getCanvasDisplaySize()) {
  const previousGraphics = harnessState.graphics ?? {};
  harnessState.canvas = {
    width: canvas.width,
    height: canvas.height,
    cssWidth: Math.round(displaySize.cssWidth),
    cssHeight: Math.round(displaySize.cssHeight),
    devicePixelRatio: displaySize.devicePixelRatio,
  };
  harnessState.graphics = {
    ...previousGraphics,
    api: gl ? "webgl2" : "2d-fallback",
    ok: Boolean(gl),
    contextLost: gl ? gl.isContextLost() : false,
    drawingBufferWidth: gl ? gl.drawingBufferWidth : canvas.width,
    drawingBufferHeight: gl ? gl.drawingBufferHeight : canvas.height,
  };
}

function syncCanvasSize() {
  const displaySize = getCanvasDisplaySize();
  if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
  }
  if (gl) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  refreshCanvasState(displaySize);
}

function clampColorByte(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(255, Math.round(number)));
}

function normalizeRgba(payload = {}, fallback = [0, 0, 0, 255]) {
  const source = Array.isArray(payload.rgba)
    ? payload.rgba
    : [payload.r, payload.g, payload.b, payload.a];

  return [
    clampColorByte(source[0], fallback[0]),
    clampColorByte(source[1], fallback[1]),
    clampColorByte(source[2], fallback[2]),
    clampColorByte(source[3], fallback[3]),
  ];
}

function sampleCanvasPixel(x = 0, y = 0) {
  const pixels = new Uint8Array(4);
  if (gl) {
    const readX = Math.max(0, Math.min(gl.drawingBufferWidth - 1, Math.trunc(x)));
    const readY = Math.max(0, Math.min(gl.drawingBufferHeight - 1, Math.trunc(y)));
    gl.readPixels(readX, gl.drawingBufferHeight - 1 - readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  } else if (fallbackContext) {
    const readX = Math.max(0, Math.min(canvas.width - 1, Math.trunc(x)));
    const readY = Math.max(0, Math.min(canvas.height - 1, Math.trunc(y)));
    pixels.set(fallbackContext.getImageData(readX, readY, 1, 1).data);
  }
  return Array.from(pixels);
}

function pixelsApproximatelyEqual(left, right, tolerance = 1) {
  return left.length === right.length
    && left.every((component, index) => Math.abs(component - right[index]) <= tolerance);
}

function paintCanvasRgba(rgba) {
  syncCanvasSize();
  if (gl) {
    gl.clearColor(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] / 255);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  } else if (fallbackContext) {
    fallbackContext.fillStyle = `rgb(${rgba[0]} ${rgba[1]} ${rgba[2]})`;
    fallbackContext.fillRect(0, 0, canvas.width, canvas.height);
  }
  refreshCanvasState();
  return sampleCanvasPixel(0, 0);
}

function clearCanvas(payload = {}) {
  const rgba = normalizeRgba(payload);
  const pixel = paintCanvasRgba(rgba);
  const ok = pixelsApproximatelyEqual(pixel, rgba);
  harnessState.graphics = {
    ...harnessState.graphics,
    lastClearColor: rgba,
    lastClearPixel: pixel,
    lastClearOk: ok,
  };

  return {
    ok,
    source: gl ? "browser_webgl2_clear" : "browser_2d_clear",
    api: harnessState.graphics.api,
    clearColor: rgba,
    topLeftPixel: pixel,
  };
}

function paintBlackWindow() {
  clearCanvas({ rgba: [0, 0, 0, 255] });
}

function syncStatus(label = harnessState.booted ? "booted" : "idle") {
  stateNode.textContent = label;
  framesNode.textContent = String(harnessState.frame);
}

function recordLog(message, data = null) {
  const entry = {
    frame: harnessState.frame,
    message: String(message),
    data,
    time: new Date().toISOString(),
  };
  harnessState.logs.push(entry);
  console.info("[wasm-harness]", entry.message, entry.data ?? "");
  return entry;
}

async function boot(payload = {}) {
  const wasmModule = await wasmModulePromise;
  if (wasmModule) {
    applyModuleState(parseModuleState(wasmModule.boot()));
    harnessState.wasm = "loaded";
  } else {
    harnessState.booted = true;
    harnessState.frame += 1;
    harnessState.wasm = "missing";
  }

  paintBlackWindow();
  syncStatus(`booted (${harnessState.runtime})`);
  recordLog("boot", payload);

  return snapshotState();
}

async function stepFrames(payload = {}) {
  const wasmModule = await wasmModulePromise;
  const requestedCount = Number(payload.count ?? 1);
  const count = Number.isFinite(requestedCount)
    ? Math.max(0, Math.min(600, Math.trunc(requestedCount)))
    : 1;

  for (let i = 0; i < count; ++i) {
    if (wasmModule) {
      applyModuleState(parseModuleState(wasmModule.frame()));
      harnessState.wasm = "loaded";
    } else if (harnessState.booted) {
      harnessState.frame += 1;
      harnessState.wasm = "missing";
    }
  }

  syncStatus(harnessState.booted ? `booted (${harnessState.runtime})` : "idle");
  return snapshotState();
}

function applyModuleState(moduleState) {
  harnessState.booted = Boolean(moduleState.booted);
  harnessState.frame = Number(moduleState.frame ?? harnessState.frame);
  harnessState.runtime = moduleState.module ?? "wasm";
  harnessState.mainLoop = moduleState.mainLoop ?? harnessState.mainLoop;
  harnessState.timing = moduleState.timing ?? harnessState.timing;
  harnessState.win32Timing = moduleState.win32Timing ?? harnessState.win32Timing;
  harnessState.browserInput = moduleState.browserInput ?? harnessState.browserInput;
  harnessState.originalEngineLinked = Boolean(moduleState.originalEngineLinked);
  harnessState.originalCoreProbe = moduleState.originalCoreProbe ?? null;
  harnessState.globalDataProbe = moduleState.globalDataProbe ?? null;
  harnessState.commandLineProbe = moduleState.commandLineProbe ?? null;
  harnessState.cdManagerProbe = moduleState.cdManagerProbe ?? null;
  harnessState.fileSystemProbe = moduleState.fileSystemProbe ?? null;
  harnessState.gameNetworkProbe = moduleState.gameNetworkProbe ?? null;
  harnessState.debugProbe = moduleState.debugProbe ?? null;
  harnessState.commonDebugLog = moduleState.commonDebugLog ?? null;
  harnessState.assetProbe = moduleState.assetProbe ?? null;
  harnessState.archiveMount = moduleState.archiveMount ?? harnessState.archiveMount;
  harnessState.startupAssets = moduleState.startupAssets ?? harnessState.startupAssets;
  harnessState.dataSummary = moduleState.dataSummary ?? harnessState.dataSummary;
  harnessState.originalEngineStartup = moduleState.originalEngineStartup ?? harnessState.originalEngineStartup;
}

async function loadWasmModule() {
  try {
    const moduleExports = await import("../dist/cnc-port.js");
    const createModule = moduleExports.default ?? moduleExports.createCncPortModule;
    const module = await createModule({
      locateFile: (path) => path.endsWith(".wasm") ? `../dist/${path}` : path,
      print: (text) => recordLog("wasm stdout", { text: String(text) }),
      printErr: (text) => recordLog("wasm stderr", { text: String(text) }),
    });

    return {
      boot: module.cwrap("cnc_port_boot", "string", []),
      frame: module.cwrap("cnc_port_frame", "string", []),
      startMainLoop: module.cwrap("cnc_port_start_main_loop", "string", []),
      stopMainLoop: module.cwrap("cnc_port_stop_main_loop", "string", []),
      probeArchive: module.cwrap("cnc_port_probe_archive", "string", ["string"]),
      registerArchiveSet: module.cwrap(
        "cnc_port_register_archive_set",
        "string",
        ["string", "string", "number", "number"],
      ),
      setBrowserInput: module.cwrap(
        "cnc_port_set_browser_input",
        "string",
        ["number", "number", "number", "number", "number"],
      ),
      resetBrowserInput: module.cwrap("cnc_port_reset_browser_input", "string", []),
      postBrowserMessage: module.cwrap(
        "cnc_port_post_browser_message",
        "string",
        ["number", "number", "number", "number", "number"],
      ),
      probeBrowserMessageQueue: module.cwrap("cnc_port_probe_browser_message_queue", "string", []),
      probeBrowserInput: module.cwrap("cnc_port_probe_browser_input", "string", []),
      initOriginalWndProcInput: module.cwrap(
        "cnc_port_init_original_wndproc_input",
        "string",
        ["number", "number"],
      ),
      pumpOriginalWndProcInput: module.cwrap("cnc_port_pump_original_wndproc_input", "string", []),
      probeOriginalWndProcInput: module.cwrap("cnc_port_probe_original_wndproc_input", "string", []),
      state: module.cwrap("cnc_port_state", "string", []),
      fs: module.FS,
    };
  } catch (error) {
    console.info("[wasm-harness] wasm module unavailable; using JS boot stub", error);
    return null;
  }
}

function parseModuleState(stateJson) {
  try {
    return JSON.parse(stateJson);
  } catch {
    throw new Error(`Invalid wasm state JSON: ${stateJson}`);
  }
}

function snapshotCanvas() {
  syncCanvasSize();
  return {
    width: canvas.width,
    height: canvas.height,
    topLeftPixel: sampleCanvasPixel(0, 0),
    dataUrl: canvas.toDataURL("image/png"),
  };
}

function snapshotState() {
  syncCanvasSize();
  return {
    booted: harnessState.booted,
    frame: harnessState.frame,
    runtime: harnessState.runtime,
    wasm: harnessState.wasm,
    mainLoop: harnessState.mainLoop,
    timing: harnessState.timing,
    win32Timing: harnessState.win32Timing,
    canvas: harnessState.canvas,
    graphics: harnessState.graphics,
    browserInput: harnessState.browserInput,
    originalEngineLinked: harnessState.originalEngineLinked,
    originalCoreProbe: harnessState.originalCoreProbe,
    globalDataProbe: harnessState.globalDataProbe,
    commandLineProbe: harnessState.commandLineProbe,
    cdManagerProbe: harnessState.cdManagerProbe,
    fileSystemProbe: harnessState.fileSystemProbe,
    gameNetworkProbe: harnessState.gameNetworkProbe,
    debugProbe: harnessState.debugProbe,
    commonDebugLog: harnessState.commonDebugLog,
    assetProbe: harnessState.assetProbe,
    archiveMount: harnessState.archiveMount,
    startupAssets: harnessState.startupAssets,
    dataSummary: harnessState.dataSummary,
    originalEngineStartup: harnessState.originalEngineStartup,
    originalWndProcInput: harnessState.originalWndProcInput,
    mountedArchives: harnessState.mountedArchives,
    logCount: harnessState.logs.length,
  };
}

function normalizeAssetParts(path) {
  const rawPath = String(path);
  const parts = [];
  for (const part of rawPath.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      return null;
    }
    parts.push(part);
  }

  return rawPath.startsWith("/assets")
    && parts[0] === "assets"
    ? parts
    : null;
}

function normalizeAssetDirectory(path) {
  const parts = normalizeAssetParts(path);
  return parts && parts.length >= 1 ? `/${parts.join("/")}` : null;
}

function normalizeAssetPath(path) {
  const parts = normalizeAssetParts(path);
  return parts && parts[0] === "assets" && parts.length > 1 ? `/${parts.join("/")}` : null;
}

function ensureMemfsDirectory(fs, path) {
  const directory = normalizeAssetDirectory(path);
  if (!directory) {
    throw new Error(`MEMFS directory must stay under /assets: ${path}`);
  }

  let current = "";
  for (const part of directory.split("/").filter(Boolean)) {
    current += `/${part}`;
    try {
      fs.mkdir(current);
    } catch {
      // Existing directories are fine; a later write/probe will surface real failures.
    }
  }
}

function archiveNameFromUrl(url) {
  const parsed = new URL(url, window.location.href);
  const parts = parsed.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "archive.big";
}

function parentDirectory(path) {
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash) : "/";
}

function archivePathFromPayload(payload, baseDirectory = "/assets") {
  const url = String(payload.url ?? "");
  if (!url) {
    return { error: "Missing archive URL" };
  }

  const name = String(payload.name ?? archiveNameFromUrl(url));
  const requestedMemfsPath = String(payload.path ?? `${baseDirectory}/${name}`);
  const memfsPath = normalizeAssetPath(requestedMemfsPath);
  if (!memfsPath) {
    return { error: `Archive path must stay under /assets/: ${requestedMemfsPath}` };
  }

  return { url, name, memfsPath };
}

async function writeArchiveToMemfs(wasmModule, payload, baseDirectory = "/assets") {
  const archive = archivePathFromPayload(payload, baseDirectory);
  if (archive.error) {
    return archive;
  }

  const response = await fetch(archive.url);
  if (!response.ok) {
    return {
      error: `${archive.name} fetch failed: ${response.status} ${response.statusText}`,
    };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  ensureMemfsDirectory(wasmModule.fs, parentDirectory(archive.memfsPath));
  wasmModule.fs.writeFile(archive.memfsPath, bytes);

  return {
    name: archive.name,
    path: archive.memfsPath,
    bytes: bytes.byteLength,
  };
}

function probeArchive(wasmModule, archivePath) {
  applyModuleState(parseModuleState(wasmModule.probeArchive(archivePath)));
  harnessState.wasm = "loaded";
  return harnessState.assetProbe;
}

function registerArchiveSet(wasmModule, archiveSet) {
  const directory = archiveSet.path.endsWith("/") ? archiveSet.path : `${archiveSet.path}/`;
  const fileMask = archiveSet.probePath.slice(archiveSet.probePath.lastIndexOf("/") + 1) || "*.big";
  applyModuleState(parseModuleState(wasmModule.registerArchiveSet(
    directory,
    fileMask,
    archiveSet.archiveCount,
    archiveSet.totalBytes,
  )));
  harnessState.wasm = "loaded";
  return harnessState.archiveMount;
}

function virtualKeyFromEvent(event) {
  const code = String(event.code ?? "");
  const namedKeys = {
    Backspace: 0x08,
    Tab: 0x09,
    Enter: 0x0d,
    ShiftLeft: 0x10,
    ShiftRight: 0x10,
    ControlLeft: 0x11,
    ControlRight: 0x11,
    AltLeft: 0x12,
    AltRight: 0x12,
    Escape: 0x1b,
    Space: 0x20,
    Insert: 0x2d,
    Delete: 0x2e,
    ArrowLeft: 0x25,
    ArrowUp: 0x26,
    ArrowRight: 0x27,
    ArrowDown: 0x28,
    F5: 0x74,
    F6: 0x75,
    F7: 0x76,
    F8: 0x77,
    F9: 0x78,
    F10: 0x79,
    F11: 0x7a,
    F12: 0x7b,
  };
  if (Object.prototype.hasOwnProperty.call(namedKeys, code)) {
    return namedKeys[code];
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.charCodeAt(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.charCodeAt(5);
  }
  return -1;
}

const win32Messages = Object.freeze({
  activate: 0x0006,
  setFocus: 0x0007,
  killFocus: 0x0008,
  activateApp: 0x001c,
  keyDown: 0x0100,
  keyUp: 0x0101,
  char: 0x0102,
  imeStartComposition: 0x010d,
  imeEndComposition: 0x010e,
  imeComposition: 0x010f,
  mouseMove: 0x0200,
  leftButtonDown: 0x0201,
  leftButtonUp: 0x0202,
  leftButtonDoubleClick: 0x0203,
  rightButtonDown: 0x0204,
  rightButtonUp: 0x0205,
  rightButtonDoubleClick: 0x0206,
  middleButtonDown: 0x0207,
  middleButtonUp: 0x0208,
  middleButtonDoubleClick: 0x0209,
  mouseWheel: 0x020a,
});

const win32ActivateStates = Object.freeze({
  inactive: 0,
  active: 1,
});

const win32ImeCompositionFlags = Object.freeze({
  compositionString: 0x0008,
  resultString: 0x0800,
});

const doubleClickPolicy = Object.freeze({
  timeMs: 500,
  maxDistance: 4,
});

const doubleClickButtons = new Map([
  [0, {
    down: win32Messages.leftButtonDown,
    up: win32Messages.leftButtonUp,
    doubleClick: win32Messages.leftButtonDoubleClick,
  }],
  [1, {
    down: win32Messages.middleButtonDown,
    up: win32Messages.middleButtonUp,
    doubleClick: win32Messages.middleButtonDoubleClick,
  }],
  [2, {
    down: win32Messages.rightButtonDown,
    up: win32Messages.rightButtonUp,
    doubleClick: win32Messages.rightButtonDoubleClick,
  }],
]);

const doubleClickStateByButton = new Map();
let browserWin32Focused = false;

function canvasInputPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round((event.clientX - rect.left) * scaleX)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round((event.clientY - rect.top) * scaleY)));
  return { x, y };
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

function eventTimestampMs(event) {
  return Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
}

function doubleClickStateForButton(button) {
  let state = doubleClickStateByButton.get(button);
  if (!state) {
    state = {
      lastUpTimeMs: Number.NEGATIVE_INFINITY,
      lastPoint: null,
      currentDownWasDoubleClick: false,
    };
    doubleClickStateByButton.set(button, state);
  }
  return state;
}

function isDoubleClickPointerDown(event, point) {
  if (!doubleClickButtons.has(event.button)) {
    return false;
  }
  const state = doubleClickStateForButton(event.button);
  if (!state.lastPoint) {
    return false;
  }
  const elapsedMs = eventTimestampMs(event) - state.lastUpTimeMs;
  const deltaX = point.x - state.lastPoint.x;
  const deltaY = point.y - state.lastPoint.y;
  return elapsedMs >= 0
    && elapsedMs <= doubleClickPolicy.timeMs
    && Math.abs(deltaX) <= doubleClickPolicy.maxDistance
    && Math.abs(deltaY) <= doubleClickPolicy.maxDistance;
}

function mouseButtonMessage(event, isDown, point) {
  const messages = doubleClickButtons.get(event.button);
  if (!messages) {
    return -1;
  }
  if (!isDown) {
    return messages.up;
  }

  const state = doubleClickStateForButton(event.button);
  state.currentDownWasDoubleClick = isDoubleClickPointerDown(event, point);
  return state.currentDownWasDoubleClick ? messages.doubleClick : messages.down;
}

function rememberPointerUpForDoubleClick(event, point) {
  if (!doubleClickButtons.has(event.button)) {
    return;
  }

  const state = doubleClickStateForButton(event.button);
  if (state.currentDownWasDoubleClick) {
    state.lastUpTimeMs = Number.NEGATIVE_INFINITY;
    state.lastPoint = null;
    state.currentDownWasDoubleClick = false;
    return;
  }

  state.lastUpTimeMs = eventTimestampMs(event);
  state.lastPoint = { x: point.x, y: point.y };
}

function resetDoubleClickState() {
  doubleClickStateByButton.clear();
}

function wheelWParam(event) {
  const delta = event.deltaY > 0 ? -120 : 120;
  return (delta & 0xffff) << 16;
}

function win32CharCodeFromEvent(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return -1;
  }
  if (typeof event.key !== "string" || event.key.length !== 1) {
    return -1;
  }
  return event.key.charCodeAt(0);
}

function lastUtf16CodeUnit(text) {
  if (typeof text !== "string" || text.length === 0) {
    return 0;
  }
  return text.charCodeAt(text.length - 1);
}

async function pushBrowserInputToWasm({
  cursor = null,
  virtualKey = -1,
  keyDown = false,
  win32Message = null,
} = {}) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const cursorAvailable = cursor ? 1 : 0;
  let stateJson = wasmModule.setBrowserInput(
    cursor?.x ?? 0,
    cursor?.y ?? 0,
    cursorAvailable,
    virtualKey,
    keyDown ? 1 : 0,
  );
  if (win32Message) {
    stateJson = wasmModule.postBrowserMessage(
      win32Message.message,
      win32Message.wParam ?? 0,
      win32Message.lParam ?? 0,
      win32Message.point?.x ?? cursor?.x ?? 0,
      win32Message.point?.y ?? cursor?.y ?? 0,
    );
  }
  applyModuleState(parseModuleState(stateJson));
  harnessState.wasm = "loaded";
  return snapshotState();
}

async function postBrowserMessageToWasm({
  message,
  wParam = 0,
  lParam = 0,
  point = null,
} = {}) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  applyModuleState(parseModuleState(wasmModule.postBrowserMessage(
    Number(message),
    Number(wParam),
    Number(lParam),
    point?.x ?? 0,
    point?.y ?? 0,
  )));
  harnessState.wasm = "loaded";
  return snapshotState();
}

async function postBrowserTextToWasm(text) {
  if (typeof text !== "string" || text.length === 0) {
    return snapshotState();
  }

  let state = null;
  for (let index = 0; index < text.length; ++index) {
    state = await postBrowserMessageToWasm({
      message: win32Messages.char,
      wParam: text.charCodeAt(index),
    });
    if (!state) {
      return null;
    }
  }
  return state;
}

async function resetBrowserInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  resetDoubleClickState();
  applyModuleState(parseModuleState(wasmModule.resetBrowserInput()));
  harnessState.wasm = "loaded";
  return snapshotState();
}

async function setBrowserWin32Focus(active) {
  if (browserWin32Focused === active) {
    return snapshotState();
  }

  browserWin32Focused = active;
  if (!active) {
    const resetState = await resetBrowserInput();
    if (!resetState) {
      return null;
    }
  }

  const messages = active ? [
    { message: win32Messages.activateApp, wParam: 1 },
    { message: win32Messages.activate, wParam: win32ActivateStates.active },
    { message: win32Messages.setFocus },
  ] : [
    { message: win32Messages.killFocus },
    { message: win32Messages.activate, wParam: win32ActivateStates.inactive },
    { message: win32Messages.activateApp, wParam: 0 },
  ];

  let state = null;
  for (const message of messages) {
    state = await postBrowserMessageToWasm(message);
    if (!state) {
      return null;
    }
  }
  return state;
}

async function probeBrowserMessageQueue() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  const probe = parseModuleState(wasmModule.probeBrowserMessageQueue());
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeBrowserInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  const probe = parseModuleState(wasmModule.probeBrowserInput());
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function initOriginalWndProcInput(payload = {}) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const width = Number(payload.width ?? canvas.width);
  const height = Number(payload.height ?? canvas.height);
  const probe = parseModuleState(wasmModule.initOriginalWndProcInput(width, height));
  harnessState.originalWndProcInput = probe;
  harnessState.wasm = "loaded";
  return probe;
}

async function pumpOriginalWndProcInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.pumpOriginalWndProcInput());
  harnessState.originalWndProcInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeOriginalWndProcInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalWndProcInput());
  harnessState.originalWndProcInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

function rememberMountedArchives(archives) {
  const byPath = new Map(harnessState.mountedArchives.map((archive) => [archive.path, archive]));
  for (const archive of archives) {
    byPath.set(archive.path, archive);
  }
  harnessState.mountedArchives = Array.from(byPath.values()).sort((left, right) =>
    left.path.localeCompare(right.path));
}

async function getWasmModuleForArchives(command) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return { error: "Wasm module unavailable; archive cannot be mounted", command };
  }
  return { wasmModule };
}

async function mountArchive(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountArchive");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  const archive = await writeArchiveToMemfs(moduleResult.wasmModule, payload);
  if (archive.error) {
    return { ok: false, command: "mountArchive", error: archive.error };
  }

  probeArchive(moduleResult.wasmModule, archive.path);
  rememberMountedArchives([archive]);
  recordLog("archive mounted", {
    path: archive.path,
    bytes: archive.bytes,
    ok: Boolean(harnessState.assetProbe?.ok),
  });

  return {
    ok: Boolean(harnessState.assetProbe?.ok),
    command: "mountArchive",
    state: snapshotState(),
    archive,
  };
}

async function mountArchives(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountArchives");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  const archiveInputs = Array.isArray(payload.archives) ? payload.archives : [];
  if (archiveInputs.length === 0) {
    return { ok: false, command: "mountArchives", error: "Missing archive list" };
  }

  const baseDirectory = normalizeAssetDirectory(String(payload.path ?? "/assets/runtime"));
  if (!baseDirectory) {
    return { ok: false, command: "mountArchives", error: `Archive directory must stay under /assets/: ${payload.path}` };
  }

  const archives = [];
  const archiveProbes = [];
  for (const input of archiveInputs) {
    const archive = await writeArchiveToMemfs(moduleResult.wasmModule, input, baseDirectory);
    if (archive.error) {
      return { ok: false, command: "mountArchives", error: archive.error, archives };
    }

    const expectedBytes = Number(input.expectedBytes ?? input.bytes ?? archive.bytes);
    const assetProbe = payload.verifyEach === false
      ? null
      : probeArchive(moduleResult.wasmModule, archive.path);
    archives.push({
      ...archive,
      expectedBytes,
      bytesMatch: archive.bytes === expectedBytes,
    });
    if (assetProbe) {
      archiveProbes.push({
        name: archive.name,
        path: archive.path,
        ok: Boolean(assetProbe.ok),
        indexedFiles: assetProbe.indexedFiles,
        sampleBytes: assetProbe.sampleBytes,
      });
    }
  }

  const probePath = `${baseDirectory}/*.big`;
  const aggregateProbe = probeArchive(moduleResult.wasmModule, probePath);
  rememberMountedArchives(archives);

  const allArchiveBytesMatch = archives.every((archive) => archive.bytesMatch);
  const allArchiveProbesOk = archiveProbes.every((archive) => archive.ok);
  const ok = Boolean(aggregateProbe?.ok) && allArchiveBytesMatch && allArchiveProbesOk;
  const totalBytes = archives.reduce((sum, archive) => sum + archive.bytes, 0);
  const archiveSet = {
    path: baseDirectory,
    probePath,
    archiveCount: archives.length,
    totalBytes,
    archives,
    probes: archiveProbes,
  };
  if (ok) {
    registerArchiveSet(moduleResult.wasmModule, archiveSet);
  }

  recordLog("archive set mounted", {
    path: baseDirectory,
    archiveCount: archives.length,
    totalBytes,
    ok,
  });

  return {
    ok,
    command: "mountArchives",
    state: snapshotState(),
    archiveSet,
  };
}

async function rpc(command, payload = {}) {
  switch (command) {
    case "boot":
      return { ok: true, command, state: await boot(payload) };
    case "frame":
      return { ok: true, command, state: await stepFrames(payload) };
    case "mountArchive":
      return mountArchive(payload);
    case "mountArchives":
      return mountArchives(payload);
    case "startMainLoop":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; Emscripten main loop cannot start" };
        }
        applyModuleState(parseModuleState(wasmModule.startMainLoop()));
        harnessState.wasm = "loaded";
        syncStatus(`booted (${harnessState.runtime})`);
        return { ok: true, command, state: snapshotState() };
      }
    case "stopMainLoop":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; Emscripten main loop cannot stop" };
        }
        applyModuleState(parseModuleState(wasmModule.stopMainLoop()));
        harnessState.wasm = "loaded";
        syncStatus(`booted (${harnessState.runtime})`);
        return { ok: true, command, state: snapshotState() };
      }
    case "setInput":
      {
        const state = await pushBrowserInputToWasm({
          cursor: payload.cursor ?? null,
          virtualKey: Number.isFinite(Number(payload.virtualKey)) ? Number(payload.virtualKey) : -1,
          keyDown: Boolean(payload.keyDown),
        });
        if (!state) {
          return { ok: false, command, error: "Wasm module unavailable; browser input cannot be updated" };
        }
        return { ok: true, command, state };
      }
    case "resetInput":
      {
        const state = await resetBrowserInput();
        if (!state) {
          return { ok: false, command, error: "Wasm module unavailable; browser input cannot be reset" };
        }
        return { ok: true, command, state };
      }
    case "postMessage":
      {
        const state = await postBrowserMessageToWasm({
          message: Number(payload.message),
          wParam: Number(payload.wParam ?? 0),
          lParam: Number(payload.lParam ?? 0),
          point: payload.point ?? null,
        });
        if (!state) {
          return { ok: false, command, error: "Wasm module unavailable; browser message cannot be posted" };
        }
        return { ok: true, command, state };
      }
    case "messageQueueProbe":
      {
        const probe = await probeBrowserMessageQueue();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; browser message queue cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "inputProbe":
      {
        const probe = await probeBrowserInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; browser input cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "initOriginalWndProcInput":
      {
        const probe = await initOriginalWndProcInput(payload);
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original WndProc input cannot initialize" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "pumpOriginalWndProcInput":
      {
        const probe = await pumpOriginalWndProcInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original WndProc input cannot pump" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "originalWndProcInputProbe":
      {
        const probe = await probeOriginalWndProcInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original WndProc input cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "log":
      return { ok: true, command, entry: recordLog(payload.message ?? "", payload.data ?? null) };
    case "clearCanvas":
      {
        const probe = clearCanvas(payload);
        return { ok: probe.ok, command, probe, state: snapshotState() };
      }
    case "screenshot":
      return { ok: true, command, screenshot: snapshotCanvas() };
    case "state":
      {
        const wasmModule = await wasmModulePromise;
        if (wasmModule) {
          applyModuleState(parseModuleState(wasmModule.state()));
          harnessState.wasm = "loaded";
          syncStatus(harnessState.booted ? `booted (${harnessState.runtime})` : "idle");
        }
      }
      return { ok: true, command, state: snapshotState(), logs: [...harnessState.logs] };
    default:
      return { ok: false, command, error: `Unknown harness command: ${command}` };
  }
}

paintBlackWindow();
syncStatus();

if (window.ResizeObserver) {
  const resizeObserver = new ResizeObserver(() => paintBlackWindow());
  resizeObserver.observe(canvas);
} else {
  window.addEventListener("resize", () => paintBlackWindow());
}

canvas.tabIndex = 0;
canvas.addEventListener("focus", () => {
  void setBrowserWin32Focus(true);
});
canvas.addEventListener("blur", () => {
  void setBrowserWin32Focus(false);
});
canvas.addEventListener("compositionstart", () => {
  void postBrowserMessageToWasm({
    message: win32Messages.imeStartComposition,
  });
});
canvas.addEventListener("compositionupdate", (event) => {
  void postBrowserMessageToWasm({
    message: win32Messages.imeComposition,
    wParam: lastUtf16CodeUnit(event.data),
    lParam: win32ImeCompositionFlags.compositionString,
  });
});
canvas.addEventListener("compositionend", async (event) => {
  const text = typeof event.data === "string" ? event.data : "";
  if (text.length > 0) {
    const compositionState = await postBrowserMessageToWasm({
      message: win32Messages.imeComposition,
      wParam: lastUtf16CodeUnit(text),
      lParam: win32ImeCompositionFlags.resultString,
    });
    if (!compositionState) {
      return;
    }
  }

  const endState = await postBrowserMessageToWasm({
    message: win32Messages.imeEndComposition,
  });
  if (!endState) {
    return;
  }

  await postBrowserTextToWasm(text);
});
canvas.addEventListener("pointermove", (event) => {
  const point = canvasInputPointFromEvent(event);
  void pushBrowserInputToWasm({
    cursor: point,
    win32Message: {
      message: win32Messages.mouseMove,
      lParam: win32PointLParam(point),
      point,
    },
  });
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.focus();
  const point = canvasInputPointFromEvent(event);
  const message = mouseButtonMessage(event, true, point);
  event.preventDefault();
  void pushBrowserInputToWasm({
    cursor: point,
    win32Message: message >= 0 ? {
      message,
      lParam: win32PointLParam(point),
      point,
    } : null,
  });
});
canvas.addEventListener("pointerup", (event) => {
  const point = canvasInputPointFromEvent(event);
  const message = mouseButtonMessage(event, false, point);
  rememberPointerUpForDoubleClick(event, point);
  event.preventDefault();
  void pushBrowserInputToWasm({
    cursor: point,
    win32Message: message >= 0 ? {
      message,
      lParam: win32PointLParam(point),
      point,
    } : null,
  });
});
canvas.addEventListener("wheel", (event) => {
  const point = canvasInputPointFromEvent(event);
  event.preventDefault();
  void pushBrowserInputToWasm({
    cursor: point,
    win32Message: {
      message: win32Messages.mouseWheel,
      wParam: wheelWParam(event),
      lParam: win32PointLParam(point),
      point,
    },
  });
}, { passive: false });
canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
window.addEventListener("keydown", (event) => {
  const virtualKey = virtualKeyFromEvent(event);
  if (virtualKey < 0) {
    return;
  }
  event.preventDefault();
  const charCode = win32CharCodeFromEvent(event);
  void (async () => {
    await pushBrowserInputToWasm({
      virtualKey,
      keyDown: true,
      win32Message: {
        message: win32Messages.keyDown,
        wParam: virtualKey,
      },
    });
    if (charCode >= 0) {
      await pushBrowserInputToWasm({
        win32Message: {
          message: win32Messages.char,
          wParam: charCode,
        },
      });
    }
  })();
});
window.addEventListener("keyup", (event) => {
  const virtualKey = virtualKeyFromEvent(event);
  if (virtualKey < 0) {
    return;
  }
  event.preventDefault();
  void pushBrowserInputToWasm({
    virtualKey,
    keyDown: false,
    win32Message: {
      message: win32Messages.keyUp,
      wParam: virtualKey,
    },
  });
});
window.addEventListener("blur", () => {
  if (browserWin32Focused) {
    void setBrowserWin32Focus(false);
  } else {
    void resetBrowserInput();
  }
});

window.CnCPort = {
  rpc,
  state: harnessState,
};
