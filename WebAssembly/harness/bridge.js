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
  harnessState.canvas = {
    width: canvas.width,
    height: canvas.height,
    cssWidth: Math.round(displaySize.cssWidth),
    cssHeight: Math.round(displaySize.cssHeight),
    devicePixelRatio: displaySize.devicePixelRatio,
  };
  harnessState.graphics = {
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

function paintBlackWindow() {
  syncCanvasSize();
  if (gl) {
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  } else if (fallbackContext) {
    fallbackContext.fillStyle = "#000";
    fallbackContext.fillRect(0, 0, canvas.width, canvas.height);
  }
  refreshCanvasState();
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
  harnessState.originalEngineLinked = Boolean(moduleState.originalEngineLinked);
  harnessState.originalCoreProbe = moduleState.originalCoreProbe ?? null;
}

async function loadWasmModule() {
  try {
    const moduleExports = await import("../dist/cnc-port.js");
    const createModule = moduleExports.default ?? moduleExports.createCncPortModule;
    const module = await createModule({
      locateFile: (path) => path.endsWith(".wasm") ? `../dist/${path}` : path,
    });

    return {
      boot: module.cwrap("cnc_port_boot", "string", []),
      frame: module.cwrap("cnc_port_frame", "string", []),
      state: module.cwrap("cnc_port_state", "string", []),
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
  const pixels = new Uint8Array(4);
  if (gl) {
    gl.readPixels(0, gl.drawingBufferHeight - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  } else if (fallbackContext) {
    pixels.set(fallbackContext.getImageData(0, 0, 1, 1).data);
  }
  return {
    width: canvas.width,
    height: canvas.height,
    topLeftPixel: Array.from(pixels),
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
    canvas: harnessState.canvas,
    graphics: harnessState.graphics,
    originalEngineLinked: harnessState.originalEngineLinked,
    originalCoreProbe: harnessState.originalCoreProbe,
    logCount: harnessState.logs.length,
  };
}

async function rpc(command, payload = {}) {
  switch (command) {
    case "boot":
      return { ok: true, command, state: await boot(payload) };
    case "frame":
      return { ok: true, command, state: await stepFrames(payload) };
    case "log":
      return { ok: true, command, entry: recordLog(payload.message ?? "", payload.data ?? null) };
    case "screenshot":
      return { ok: true, command, screenshot: snapshotCanvas() };
    case "state":
      {
        const wasmModule = await wasmModulePromise;
        if (wasmModule) {
          applyModuleState(parseModuleState(wasmModule.state()));
          harnessState.wasm = "loaded";
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

window.CnCPort = {
  rpc,
  state: harnessState,
};
