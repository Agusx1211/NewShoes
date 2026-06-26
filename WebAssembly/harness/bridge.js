const canvas = document.querySelector("#viewport");
const context = canvas.getContext("2d", { alpha: false });
const stateNode = document.querySelector("#state");
const framesNode = document.querySelector("#frames");

const harnessState = {
  booted: false,
  frame: 0,
  runtime: "js-stub",
  wasm: null,
  logs: [],
};

const wasmModulePromise = loadWasmModule();

function paintBlackWindow() {
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
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
  const pixels = context.getImageData(0, 0, 1, 1).data;
  return {
    width: canvas.width,
    height: canvas.height,
    topLeftPixel: Array.from(pixels),
    dataUrl: canvas.toDataURL("image/png"),
  };
}

function snapshotState() {
  return {
    booted: harnessState.booted,
    frame: harnessState.frame,
    runtime: harnessState.runtime,
    wasm: harnessState.wasm,
    logCount: harnessState.logs.length,
    canvas: {
      width: canvas.width,
      height: canvas.height,
    },
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

window.CnCPort = {
  rpc,
  state: harnessState,
};
