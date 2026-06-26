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
  assetProbe: null,
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
  harnessState.mainLoop = moduleState.mainLoop ?? harnessState.mainLoop;
  harnessState.timing = moduleState.timing ?? harnessState.timing;
  harnessState.originalEngineLinked = Boolean(moduleState.originalEngineLinked);
  harnessState.originalCoreProbe = moduleState.originalCoreProbe ?? null;
  harnessState.assetProbe = moduleState.assetProbe ?? null;
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
    mainLoop: harnessState.mainLoop,
    timing: harnessState.timing,
    canvas: harnessState.canvas,
    graphics: harnessState.graphics,
    originalEngineLinked: harnessState.originalEngineLinked,
    originalCoreProbe: harnessState.originalCoreProbe,
    assetProbe: harnessState.assetProbe,
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
    archiveSet: {
      path: baseDirectory,
      probePath,
      archiveCount: archives.length,
      totalBytes,
      archives,
      probes: archiveProbes,
    },
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

window.CnCPort = {
  rpc,
  state: harnessState,
};
