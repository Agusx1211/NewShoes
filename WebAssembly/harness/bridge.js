const canvas = document.querySelector("#viewport");
const context = canvas.getContext("2d", { alpha: false });
const stateNode = document.querySelector("#state");
const framesNode = document.querySelector("#frames");

const harnessState = {
  booted: false,
  frame: 0,
  logs: [],
};

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
  harnessState.booted = true;
  harnessState.frame += 1;
  paintBlackWindow();
  syncStatus("booted");
  recordLog("boot", payload);

  return snapshotState();
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
    case "log":
      return { ok: true, command, entry: recordLog(payload.message ?? "", payload.data ?? null) };
    case "screenshot":
      return { ok: true, command, screenshot: snapshotCanvas() };
    case "state":
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
