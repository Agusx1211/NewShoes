import { createD3D8Executor } from "./d3d8_executor.mjs";
import { createGdiHooks } from "./gdi_executor.mjs";

// Engine-thread mode (plumbed like ?dist=): the REAL engine runs on a
// pthread in the single pool worker of the dist-threaded build, and the GL
// executor runs in THAT worker realm against an OffscreenCanvas transferred
// from #viewport. Every threaded divergence in this file branches on this
// flag. THE PLAY PAGE IS THREADED-ONLY (owner directive 2026-07-10,
// Metal-verified — notes/p1-engine-thread.md GATE D; the ?threads=0 legacy
// escape hatch was deleted after the owner confirmed the HTTPS threaded
// experience). Harness/smoke pages keep the non-threaded default and opt in
// via ?threads=1. Design + P1a/P1b mechanics: WebAssembly/notes/p1-engine-thread.md.
// The pthread build hard-requires SharedArrayBuffer, which Chrome only
// exposes to cross-origin-isolated pages — and COOP/COEP headers are IGNORED
// on untrustworthy origins (plain http:// over a LAN IP; only https:// and
// localhost qualify). Owner-facing regression 2026-07-10: the play page at
// http://192.168.x.x:8123 died with "FAILED: archive mount failed" because
// the threaded default tried to instantiate the pthread wasm without SAB
// ("ReferenceError: SharedArrayBuffer is not defined"). Owner directive
// 2026-07-10: NO legacy single-thread fallback. When threaded mode is
// requested but this origin cannot run it, the page REDIRECTS to the
// harness's HTTPS listener (a trustworthy origin where COOP/COEP are
// honored); when a redirect cannot fix it (already https with a rejected
// cert, or a localhost server not sending COOP/COEP) the boot is BLOCKED
// with the reason — never a silent degrade to the legacy build.
// play.mjs mirrors this check and renders the redirect/block state.
function cncPortThreadedRuntimeSupport() {
  const missing = [];
  if (typeof SharedArrayBuffer !== "function") {
    missing.push("SharedArrayBuffer");
  }
  if (globalThis.crossOriginIsolated !== true) {
    missing.push("crossOriginIsolated");
  }
  if (missing.length === 0) {
    return { supported: true, reason: null };
  }
  const origin = (() => {
    try {
      return globalThis.location?.origin ?? "";
    } catch (_error) {
      return "";
    }
  })();
  const insecure = globalThis.isSecureContext !== true;
  return {
    supported: false,
    reason: `engine-thread mode unavailable: missing ${missing.join(" + ")}`
      + (insecure
        ? ` — ${origin || "this origin"} is not a secure context (browsers ignore COOP/COEP on`
          + " plain http:// LAN addresses; use https:// or http://localhost)"
        : ""),
  };
}

// Must match harness/static-server.mjs DEFAULT_HTTPS_PORT — the baked
// fallback when the /__cnc_https_info announcement is unavailable (older
// server without the endpoint).
const CNC_PORT_DEFAULT_HTTPS_PORT = 8443;

function cncPortIsLocalhostName(hostnameValue) {
  const name = String(hostnameValue || "").toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]" || name === "::1"
    || name.endsWith(".localhost");
}

// Non-null when threaded mode was requested (or defaulted) but this origin
// cannot run it: { reason, action: "pending"|"redirect"|"blocked", target }.
// Mutated in place so harnessState always shows the resolved action.
let cncPortThreadedUnsupported = null;

async function cncPortResolveSecureOriginAction(unsupported) {
  const location = globalThis.location;
  if (!location || location.protocol !== "http:" || cncPortIsLocalhostName(location.hostname)) {
    // Already https (self-signed cert rejected / COI policy) or a localhost
    // origin whose server is not sending COOP/COEP: a redirect cannot fix
    // either — block with the reason. localhost origins are trustworthy, so
    // gates/probes on http://localhost never reach this path with a
    // COOP/COEP-sending harness server.
    unsupported.action = "blocked";
  } else {
    // Insecure non-localhost origin: redirect to the harness HTTPS listener.
    // Ask the current (http) origin where it lives; fall back to the baked
    // default port when the endpoint is missing (older server).
    let httpsEnabled = true;
    let httpsPort = CNC_PORT_DEFAULT_HTTPS_PORT;
    try {
      const response = await fetch("/__cnc_https_info", { cache: "no-store" });
      if (response.ok) {
        const info = await response.json();
        httpsEnabled = info?.httpsEnabled !== false;
        const announced = Number(info?.httpsPort);
        if (Number.isFinite(announced) && announced > 0) {
          httpsPort = announced;
        }
      }
    } catch (_error) {
      // No announcement — try the default port anyway.
    }
    if (!httpsEnabled) {
      unsupported.action = "blocked";
      unsupported.reason += " — and this server has no HTTPS listener"
        + " (restart harness/serve.mjs with HTTPS_PORT=8443, or open via http://localhost)";
    } else {
      unsupported.action = "redirect";
      unsupported.target = `https://${location.hostname}:${httpsPort}`
        + `${location.pathname}${location.search}${location.hash}`;
    }
  }
  try {
    globalThis.dispatchEvent(new CustomEvent("cnc-threaded-unsupported", {
      detail: { ...unsupported },
    }));
  } catch (_error) {
    // Non-DOM realm; state.threadedUnsupported still carries the result.
  }
  if (unsupported.action === "redirect") {
    console.warn(`[wasm-harness] ${unsupported.reason}; redirecting to the HTTPS origin `
      + `${unsupported.target} (owner directive: no single-thread fallback)`);
    globalThis.location.replace(unsupported.target);
  } else {
    console.error(`[wasm-harness] ${unsupported.reason}; boot BLOCKED `
      + "(owner directive: no single-thread fallback)");
  }
}

const cncPortThreadedMode = (() => {
  try {
    // The play page is THREADED-ONLY (owner directive 2026-07-10; the
    // ?threads=0 legacy escape hatch was deleted after the owner confirmed
    // the HTTPS threaded experience). Harness/index.html probe surfaces stay
    // non-threaded by default and opt in with ?threads=1.
    const threads = new URLSearchParams(globalThis.location?.search || "").get("threads");
    const requested = threads === "1"
      || (globalThis.location?.pathname || "").endsWith("/play.html");
    if (!requested) return false;
    const support = cncPortThreadedRuntimeSupport();
    if (!support.supported) {
      cncPortThreadedUnsupported = { reason: support.reason, action: "pending", target: null };
      void cncPortResolveSecureOriginAction(cncPortThreadedUnsupported);
      return false;
    }
    return true;
  } catch (_error) {
    return false;
  }
})();

const canvas = document.querySelector("#viewport");
// preserveDrawingBuffer forces the compositor to COPY the drawing buffer every
// frame instead of swapping it (an extra full-framebuffer blit per frame on
// tile-based GPUs like Apple Silicon). Harness pages need it so screenshots /
// pixel probes can read the canvas from any task; the play page renders every
// frame anyway, so captures re-render synchronously instead (snapshotCanvas).
const contextPreserveDrawingBuffer = (() => {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const explicit = params.get("preserveBuffer");
    if (explicit === "0" || explicit === "false" || explicit === "off") return false;
    if (explicit === "1" || explicit === "true" || explicit === "on") return true;
    return !(globalThis.location?.pathname || "").endsWith("/play.html");
  } catch (_error) {
    return true;
  }
})();
// Threaded mode: #viewport must stay CONTEXT-FREE so transferControlToOffscreen
// can hand it to the engine worker realm (a canvas with any context cannot be
// transferred). The main-realm executor below is constructed against an
// invisible scratch canvas instead, so the whole main-side diagnostics surface
// keeps existing — it just never receives real engine draws (those happen in
// the worker realm's executor).
const executorCanvas = cncPortThreadedMode ? document.createElement("canvas") : canvas;
const gl = cncPortThreadedMode ? null : canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: true,
  stencil: true,
  preserveDrawingBuffer: contextPreserveDrawingBuffer,
});
const s3tc = gl ? gl.getExtension("WEBGL_compressed_texture_s3tc") : null;

const fallbackContext = gl ? null : executorCanvas.getContext("2d", { alpha: false });
const stateNode = document.querySelector("#state");
const framesNode = document.querySelector("#frames");

function validCncPortDistDir(value) {
  return typeof value === "string" && /^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value);
}

function defaultCncPortDistDir() {
  try {
    if (cncPortThreadedMode) {
      // Threaded mode needs the pthread-enabled runtime (PTHREAD_POOL_SIZE=1
      // + realm stub). The play page serves the RELEASE threaded build
      // (dist-threaded is Debug: -O0/ASSERTIONS/JS-EH, several times slower
      // engine — the GATE D "worker GL deficit" was this build-flavor gap);
      // harness/smoke pages keep the Debug dist-threaded for gate parity
      // with dist. An explicit ?dist= still wins in selectedCncPortDistDir.
      if ((globalThis.location?.pathname || "").endsWith("/play.html")) {
        return "dist-threaded-release";
      }
      return "dist-threaded";
    }
    if (validCncPortDistDir(globalThis.__cncDefaultDistDir)) {
      return globalThis.__cncDefaultDistDir;
    }
    if ((globalThis.location?.pathname || "").endsWith("/play.html")) {
      return "dist-release";
    }
  } catch (_error) {
    // No browser location in some unit-test contexts.
  }
  return "dist";
}

function selectedCncPortDistDir() {
  const fallbackDistDir = defaultCncPortDistDir();
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const distDir = params.get("dist") || fallbackDistDir;
    if (validCncPortDistDir(distDir)) {
      return distDir;
    }
  } catch (_error) {
    // No browser location in some unit-test contexts.
  }
  return fallbackDistDir;
}

function browserAssetUrl(path, cacheToken = "") {
  try {
    const base = globalThis.location?.href
      ?? (typeof document !== "undefined" ? document.baseURI : undefined);
    const url = new URL(path, base);
    if (cacheToken) {
      url.searchParams.set("v", cacheToken);
    }
    return url.href;
  } catch (_error) {
    if (!cacheToken) {
      return path;
    }
    return `${path}${path.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheToken)}`;
  }
}

async function browserAssetVersion(path) {
  if (typeof fetch !== "function") {
    return "";
  }
  try {
    const response = await fetch(browserAssetUrl(path), { method: "HEAD", cache: "no-store" });
    if (!response.ok) {
      return "";
    }
    const modified = response.headers.get("last-modified");
    const length = response.headers.get("content-length");
    const modifiedMs = modified ? Date.parse(modified) : 0;
    const parts = [
      Number.isFinite(modifiedMs) && modifiedMs > 0 ? String(modifiedMs) : "",
      length || "",
    ].filter(Boolean);
    return parts.join("-");
  } catch (_error) {
    return "";
  }
}

async function cncPortRuntimeCacheToken(distDir) {
  const [jsVersion, wasmVersion] = await Promise.all([
    browserAssetVersion(`../${distDir}/cnc-port.js`),
    browserAssetVersion(`../${distDir}/cnc-port.wasm`),
  ]);
  const token = [jsVersion, wasmVersion].filter(Boolean).join(".");
  return token || String(Date.now());
}

let cncPortEmscriptenModule = null;
// Why loadWasmModule returned null (surfaced in mount errors).
let cncPortModuleLoadError = null;

const D3DCLEAR_TARGET = 0x00000001;

const D3DFVF_TEX2 = 0x200;

function defaultD3D8GammaState() {
  return {
    source: "d3d8_gamma_ramp_presentation",
    supported: true,
    applied: false,
    flags: 0,
    cssFilter: "",
    channels: null,
    samples: null,
    request: null,
  };
}

const harnessState = {
  booted: false,
  frame: 0,
  runtime: "js-stub",
  // Non-null when threaded mode was requested (or defaulted) but this origin
  // cannot run it (no SAB / not crossOriginIsolated). There is NO legacy
  // fallback (owner directive 2026-07-10): the action is "redirect" (to the
  // harness HTTPS listener) or "blocked" (boot refused with the reason).
  threadedUnsupported: cncPortThreadedUnsupported,
  wasm: null,
  mainLoop: {
    running: false,
    fps: 0,
    ticks: 0,
  },
  timing: null,
  win32Timing: null,
  browserInput: null,
  browserDirectInput: {
    source: "browser_directinput_keyboard_queue",
    lastCode: null,
    lastDown: null,
    queued: false,
    queuedKeyCount: 0,
  },
  browserCursor: {
    source: "browser_win32_cursor_css",
    cursorSet: null,
    css: canvas.style.cursor || "auto",
    visible: true,
  },
  browserPointerCapture: {
    source: "browser_dom_pointer_capture",
    supported: typeof canvas.setPointerCapture === "function"
      && typeof canvas.releasePointerCapture === "function",
    active: false,
    pointerId: null,
    claims: 0,
    releases: 0,
    gotEvents: 0,
    lostEvents: 0,
    lastEvent: null,
    lastError: null,
  },
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
    lastD3D8StateHash: 0,
    lastD3D8UniformKey: null,
    lastD3D8TextureUniformKey: null,
    lastD3D8AppliedRenderState: null,
    d3d8Gamma: defaultD3D8GammaState(),
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
  objectIniProbe: null,
  archiveMount: null,
  browserRuntimeAssets: null,
  startupSingletons: null,
  audioManagerRuntime: null,
  functionLexiconRuntime: null,
  moduleFactoryRuntime: null,
  particleSystemRuntime: null,
  audioRuntimeAssets: null,
  audioPayloadInventory: null,
  startupAssets: null,
  dataSummary: null,
  originalEngineStartup: null,
  originalWndProcInput: null,
  originalGuiMouseInput: null,
  originalKeyboardInput: null,
  originalKeyboardFrameTick: null,
  originalKeyboardFrameInput: null,
  originalMouseFrameInput: null,
  originalMouseFrameWindows: null,
  mountedArchives: [],
  logs: [],
};

// ---------------------------------------------------------------------------
// D3D8 -> WebGL2 executor (extracted to d3d8_executor.mjs for the engine-
// thread work; see notes/p1-engine-thread.md). Constructed exactly once with
// this page's canvas/GL context, harness log + state sinks and fresh-view
// wasm heap accessors. hooks = the 20 Module.cncPortD3D8* functions; diag =
// the executor-internal surface the harness RPC/diagnostics still read.
// Threaded mode: executorCanvas is an invisible scratch canvas (the REAL
// executor lives in the engine worker realm, harness/engine_realm_boot.mjs);
// this main-realm instance only keeps the diag surface alive.
const { hooks: d3d8Hooks, diag: d3d8Diag } = createD3D8Executor({
  canvas: executorCanvas,
  gl,
  s3tc,
  fallbackContext,
  log: recordLog,
  state: harnessState,
  getModule: () => cncPortEmscriptenModule,
  getHeapU8: () => cncPortEmscriptenModule?.HEAPU8 ?? null,
  getHeapU16: () => cncPortEmscriptenModule?.HEAPU16 ?? null,
  getHeapU32: () => cncPortEmscriptenModule?.HEAPU32 ?? null,
  getHeapF32: () => cncPortEmscriptenModule?.HEAPF32 ?? null,
  getHeapF64: () => cncPortEmscriptenModule?.HEAPF64 ?? null,
  dom: { stateNode, framesNode },
});
const {
  clampNumber,
  clearCanvas,
  finiteNumber,
  flushD3D8PendingDrawBatch,
  invalidateCanvasDisplaySizeCache,
  normalizeD3D8Light,
  normalizeD3D8Material,
  normalizeRgba,
  pixelHasColor,
  pixelsApproximatelyEqual,
  roundedD3D8GammaMetric,
  sampleCanvasPixel,
  sampleCanvasRegion,
  sampleD3D8TexturePixel,
  sampleVirtualCanvasPixel,
  syncCanvasSize,
  updateD3D8BufferSummary,
  viewportArraysEqual,
  updateD3D8TextureSummary,
  d3d8PerfSummary,
  applyD3D8BoundDrawDiagnosticsLevel,
  d3dColorToNormalizedRgba,
  d3dMaterialSourceName,
  paintCanvasRgba,
  setD3D8GammaRamp,
  onD3D8BackbufferResize,
  sampleD3D8TextureCenter,
  d3d8Textures,
  d3d8DiagLevelValue,
  D3D8_XYZNDUV_TEXCOORD0_OFFSET,
  D3D8_XYZNDUV_TEXCOORD_STRIDE,
  D3DBLEND_INVSRCALPHA,
  D3DBLEND_ONE,
  D3DBLEND_SRCALPHA,
  D3DBLEND_ZERO,
  D3DCMP_EQUAL,
  D3DCMP_LESS,
  D3DCOLORWRITEENABLE_BLUE,
  D3DCOLORWRITEENABLE_GREEN,
  D3DCOLORWRITEENABLE_RED,
  D3DCULL_CW,
  D3DFILL_WIREFRAME,
  D3DFMT_A4R4G4B4,
  D3DFMT_A8R8G8B8,
  D3DFMT_X8R8G8B8,
  D3DFOG_LINEAR,
  D3DFVF_DIFFUSE,
  D3DFVF_NORMAL,
  D3DFVF_SPECULAR,
  D3DFVF_TEX1,
  D3DFVF_XYZ,
  D3DLIGHT_DIRECTIONAL,
  D3DLIGHT_POINT,
  D3DLIGHT_SPOT,
  D3DMCS_COLOR1,
  D3DMCS_COLOR2,
  D3DMCS_MATERIAL,
  D3DPT_POINTLIST,
  D3DPT_TRIANGLELIST,
  D3DPT_TRIANGLESTRIP,
  D3DSHADE_FLAT,
  D3DTADDRESS_CLAMP,
  D3DTADDRESS_WRAP,
  D3DTA_ALPHAREPLICATE,
  D3DTA_CURRENT,
  D3DTA_DIFFUSE,
  D3DTA_TEXTURE,
  D3DTA_TFACTOR,
  D3DTEXF_LINEAR,
  D3DTEXF_NONE,
  D3DTEXF_POINT,
  D3DTOP_DISABLE,
  D3DTOP_DOTPRODUCT3,
  D3DTOP_MODULATE,
  D3DTOP_MULTIPLYADD,
  D3DTOP_SELECTARG1,
  D3DTSS_TCI_CAMERASPACENORMAL,
  D3DTSS_TCI_CAMERASPACEPOSITION,
  D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
  D3DTTFF_COUNT2,
  D3DTTFF_COUNT3,
  D3DTTFF_DISABLE,
  D3DTTFF_PROJECTED,
  D3DZB_TRUE,
  GL_GREEN,
} = d3d8Diag;

function buildD3D8GammaRampPayload(payload = {}) {
  const gamma = clampNumber(payload.gamma, 0.6, 6.0, 1.0);
  const bright = clampNumber(payload.bright ?? payload.brightness, -0.5, 0.5, 0.0);
  const contrast = clampNumber(payload.contrast, 0.5, 2.0, 1.0);
  const ooGamma = 1.0 / gamma;
  const ramp = [];
  for (let i = 0; i < 256; i++) {
    const input = i / 256.0;
    const output = clamp01(contrast * Math.pow(input, ooGamma) + bright);
    ramp.push(Math.trunc(output * 65535));
  }
  return {
    flags: Number(payload.flags ?? 0) >>> 0,
    red: ramp,
    green: ramp,
    blue: ramp,
    request: {
      gamma: roundedD3D8GammaMetric(gamma),
      bright: roundedD3D8GammaMetric(bright),
      contrast: roundedD3D8GammaMetric(contrast),
    },
  };
}

function buildOrUseD3D8GammaRampPayload(payload = {}) {
  const hasExplicitRamp = Array.isArray(payload.red) || ArrayBuffer.isView(payload.red)
    || Array.isArray(payload.green) || ArrayBuffer.isView(payload.green)
    || Array.isArray(payload.blue) || ArrayBuffer.isView(payload.blue);
  if (hasExplicitRamp) {
    return {
      flags: Number(payload.flags ?? 0) >>> 0,
      red: payload.red,
      green: payload.green ?? payload.red,
      blue: payload.blue ?? payload.red,
      request: payload.request ?? null,
    };
  }
  return buildD3D8GammaRampPayload(payload);
}

const browserAudioRuntime = {
  source: "browser Web Audio runtime user-gesture proof",
  context: null,
  created: false,
  resumeAttempts: 0,
  resumeSuccesses: 0,
  lastResumeTrigger: null,
  lastResumeError: null,
};

const browserAudioMixerBusNames = ["music", "sound", "sound3D", "speech"];
const browserAudioMixerRuntime = {
  source: "browser Web Audio runtime mixer GainNode proof",
  created: false,
  busNodes: null,
  scriptVolumes: null,
  systemVolumes: null,
  zoomVolume: 1,
  busGains: null,
  updates: 0,
  lastUpdate: null,
  lastError: null,
};

const browserAudioRequestedDecodedCache = new Map();
const browserAudioLiveEventRuntime = {
  source: "browser requested audio live AudioBufferSourceNode lifecycle proof",
  nextHandle: 12001,
  started: 0,
  completed: 0,
  released: 0,
  lastEvent: null,
  eventLog: [],
  lastError: null,
};

const browserAudioRequestPathRuntime = {
  source: "browser source-shaped audio request queue live playback proof",
  nextHandle: 22001,
  enqueued: 0,
  drained: 0,
  dispatched: 0,
  started: 0,
  completed: 0,
  released: 0,
  lastEvent: null,
  eventLog: [],
  lastError: null,
};

const browserNetworkRelayRuntime = {
  source: "GameNetwork browser relay NetPacket byte path proof",
  browserTransport: "harness relay queue",
  productionTransport: false,
  relayTransport: true,
  originalSerializer: "NetPacket::addCommand",
  originalParser: "NetPacket::ConstructNetCommandMsgFromRawData",
  nextRequired: "browserTransportReceiveIntoConnectionManager",
  clients: ["browser-client-0", "browser-client-1"],
  sent: 0,
  delivered: 0,
  received: 0,
  bytes: 0,
  packets: [],
  eventLog: [],
  lastEvent: null,
  lastError: null,
};

const browserNetworkTransportRuntime = {
  source: "GameNetwork browser Transport/FrameData frame sync proof",
  browserTransport: "harness relay queue",
  productionTransport: false,
  relayTransport: true,
  originalSerializer: "NetPacket::addCommand",
  originalTransport: "Transport::m_inBuffer",
  originalRelay: "ConnectionManager::doRelay",
  originalFrameData: "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady",
  nextRequired: "twoBrowserContextsOrLanApiRelay",
  clients: ["browser-client-0", "browser-client-1"],
  sent: 0,
  delivered: 0,
  received: 0,
  bytes: 0,
  packets: [],
  eventLog: [],
  lastEvent: null,
  lastError: null,
  transportInjected: false,
  connectionManagerDriven: false,
  frameDataReady: false,
};

const browserUdpEndpointRuntime = {
  source: "GameNetwork browser live UDP endpoint",
  browserTransport: "browser WebSocket live UDP endpoint",
  productionTransport: true,
  relayTransport: true,
  enabled: false,
  connected: false,
  client: null,
  url: null,
  socket: null,
  incoming: [],
  sent: 0,
  received: 0,
  delivered: 0,
  sentBytes: 0,
  receivedBytes: 0,
  deliveredBytes: 0,
  lastSent: null,
  lastReceived: null,
  lastDelivered: null,
  eventLog: [],
  lastError: null,
  defaultIncomingIp: 0x7f000001,
  defaultIncomingPort: 8088,
};

const browserLanApiRuntime = {
  source: "GameNetwork browser LANAPI announce discovery proof",
  browserTransport: "harness relay queue",
  productionTransport: false,
  relayTransport: true,
  originalSerializer: "LANMessage struct byte payload",
  originalTransport: "Transport::m_inBuffer",
  originalDispatch: "LANAPI::update",
  originalHandler: "LANAPI::handleGameAnnounce",
  originalParser: "ParseGameOptionsString",
  originalCallback: "LANAPI::OnGameList",
  nextRequired: "lanApiJoinOrProductionTransport",
  clients: ["browser-client-0", "browser-client-1"],
  sent: 0,
  delivered: 0,
  received: 0,
  bytes: 0,
  packets: [],
  eventLog: [],
  lastEvent: null,
  lastError: null,
  transportInjected: false,
  lanApiUpdated: false,
  gameListRecorded: false,
};

const browserMssSamplePlaybackRuntime = {
  source: "MSS 2D sample Web Audio backend proof",
  started: 0,
  completed: 0,
  stopped: 0,
  ended: 0,
  released: 0,
  resetGeneration: 0,
  activeSources: new Map(),
  pendingCompletions: new Map(),
  lastEvent: null,
  eventLog: [],
  lastError: null,
};

const wasmModulePromise = loadWasmModule();
// Synchronous handle for code that must act inside the current task (e.g.
// snapshotCanvas re-rendering before toDataURL when preserveDrawingBuffer is
// off — the drawing buffer is only valid until the task yields to compositing).
let resolvedWasmModule = null;
wasmModulePromise.then((wasmModule) => {
  resolvedWasmModule = wasmModule;
}).catch(() => {});

// ============================================================================
// P1c: threaded engine controller (?threads=1)
//
// Owns the main-realm side of the engine-thread architecture
// (notes/p1-engine-thread.md): prepares the single pool worker's realm BEFORE
// the engine pthread is spawned (connect a dedicated MessagePort, transfer the
// #viewport OffscreenCanvas, import harness/engine_realm_boot.mjs), then
// drives boot/go, forwards input/RPC over the port, and executes the MSS
// audio bodies main-side when the engine realm posts them over.
// ============================================================================

// Fresh main-realm heap view: with pthreads+ALLOW_MEMORY_GROWTH the ENGINE
// thread grows the shared memory and only ITS realm's Module.HEAP* views are
// refreshed synchronously; the main realm's cached view goes stale (it still
// aliases the same SharedArrayBuffer but misses the newly grown tail). The
// emscripten factory exposes Module.wasmMemory in every realm, so rebuild a
// view whenever the buffer identity changed (memory.grow returns a NEW SAB
// object).
let cncPortFreshHeapCache = null;
function freshMainHeapU8() {
  const module = cncPortEmscriptenModule;
  if (!module) {
    return null;
  }
  const memoryBuffer = module.wasmMemory?.buffer;
  if (memoryBuffer) {
    if (!cncPortFreshHeapCache || cncPortFreshHeapCache.buffer !== memoryBuffer) {
      cncPortFreshHeapCache = new Uint8Array(memoryBuffer);
    }
    return cncPortFreshHeapCache;
  }
  return module.HEAPU8 ?? null;
}

function threadedWorkerDiagLevel() {
  // The worker realm's URL carries no page params, so decide here with the
  // same defaults the pages use: explicit ?diag= wins; play.html defaults to
  // "lite"; harness/probe pages default to "full".
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const diag = params.get("diag");
    if (diag === "lite" || diag === "full") {
      return diag;
    }
    return (globalThis.location?.pathname || "").endsWith("/play.html") ? "lite" : "full";
  } catch (_error) {
    return "full";
  }
}

function threadedWorkerShaderTier() {
  // The executor samples the shader tier once at device create via
  // d3d8ShaderTierQuery (URL ?shaderTier= param, then localStorage
  // "cncPortShaderTier", default ff). The WORKER realm has neither the page
  // URL nor localStorage, so resolve the tier here with the same precedence
  // and hand it through the setup options (engine_realm_boot forces it via
  // globalThis.__cncD3D8ShaderTier before constructing the executor).
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const fromUrl = params.get("shaderTier");
    if (fromUrl === "ps11" || fromUrl === "ff") {
      return fromUrl;
    }
    const stored = globalThis.localStorage?.getItem("cncPortShaderTier");
    if (stored === "ps11" || stored === "ff") {
      return stored;
    }
  } catch (_error) {
    // Fall through to the executor default (ff).
  }
  return null;
}

function createThreadedEngineController() {
  const pending = new Map(); // id -> { resolve, reject, timer, resetTimer }
  let commandId = 0;
  let realmPort = null;
  let engineWorker = null;
  let prepPromise = null;
  let engineThreadStarted = false;
  let lastStatus = null;
  let lastLoopError = null;
  let mssHandlers = null;

  function threadedLog(message, data) {
    recordLog(`threaded ${message}`, data);
  }

  function mssHandlerMap() {
    if (!mssHandlers) {
      mssHandlers = {
        cncPortMssSampleStart,
        cncPortMssSampleStop,
        cncPortMssSampleEnd,
        cncPortMssSampleRelease,
        cncPortMss3DSampleStart,
        cncPortMss3DSamplePositionUpdate,
        cncPortMss3DListenerUpdate,
        cncPortMss3DSampleStop,
        cncPortMss3DSampleEnd,
        cncPortMss3DSampleRelease,
        cncPortMssStreamStart,
        cncPortMssStreamStop,
        cncPortMssStreamVolumePan,
      };
    }
    return mssHandlers;
  }

  function handleMssMessage(msg) {
    const handler = mssHandlerMap()[msg.hook];
    if (typeof handler !== "function") {
      threadedLog("mss hook unknown", { hook: msg.hook });
      return;
    }
    // Sample-start payloads arrive with a worker-side COPY of the RIFF bytes
    // (padded, dataPtr rewritten to 4 — see engine_realm_boot.mjs) on their
    // FIRST send per content key, then key-only (dedupe); everything else
    // reads nothing or reads the SHARED heap through a fresh view.
    const heap = msg.bytes instanceof Uint8Array ? msg.bytes : freshMainHeapU8();
    try {
      handler(msg.payload ?? {}, heap);
    } catch (error) {
      threadedLog("mss hook failed", { hook: msg.hook, error: error?.message ?? String(error) });
    }
    // Dedupe-correctness backstop: the worker marked this key "sent" when the
    // bytes shipped, but the start may have bailed before caching (suspended
    // AudioContext, missing mixer, decode failure). If the decoded cache does
    // not hold the key now, tell the worker to re-send bytes next start.
    const sentKey = typeof msg.payload?.cacheKey === "string" ? msg.payload.cacheKey : null;
    if (sentKey && msg.bytes instanceof Uint8Array && !cncPortDecodedSampleCache.has(sentKey)) {
      notifyMssCacheDrop([sentKey]);
    }
  }

  function applyThreadedStatus(status) {
    lastStatus = status;
    harnessState.threadedEngine = status;
    const size = status.engineDisplaySize;
    if (size && Number.isFinite(size.width) && size.width > 1
        && Number.isFinite(size.height) && size.height > 1) {
      const previous = harnessState.engineDisplaySize;
      if (!previous || previous.width !== size.width || previous.height !== size.height) {
        harnessState.engineDisplaySize = { width: size.width, height: size.height };
        try {
          window.dispatchEvent(new CustomEvent("cncport:resolutionchange", {
            detail: { width: size.width, height: size.height, source: "engine" },
          }));
        } catch (_error) {
          // no DOM event support — state still updated
        }
      }
    }
    try {
      window.dispatchEvent(new CustomEvent("cncport:threadedstatus", { detail: status }));
    } catch (_error) {
      // no DOM event support
    }
  }

  function publishPending() {
    harnessState.threadedPendingCommands = Array.from(pending.values())
      .map((entry) => entry.cmdName ?? "?");
  }

  function settlePending(id, settle) {
    const entry = pending.get(id);
    if (!entry) {
      return null;
    }
    pending.delete(id);
    publishPending();
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    return settle(entry);
  }

  function dispatchRealmMessage(msg) {
    if (!msg || typeof msg !== "object") {
      return;
    }
    switch (msg.cmd) {
      case "mss":
        handleMssMessage(msg);
        return;
      case "status":
        applyThreadedStatus(msg);
        return;
      case "live":
        threadedLog("engine thread live");
        return;
      case "engineInitProgress": {
        const entry = pending.get(msg.id);
        if (entry?.onProgress) {
          entry.onProgress(msg.step);
        }
        return;
      }
      case "loopError":
        lastLoopError = msg.error ?? "unknown";
        threadedLog("frame loop error", { error: msg.error, result: msg.result ?? null });
        try {
          window.dispatchEvent(new CustomEvent("cncport:threadedlooperror", { detail: msg }));
        } catch (_error) { /* no DOM event support */ }
        return;
      case "tickError":
        threadedLog("engine tick error", { error: msg.error });
        return;
      case "moduleCommandError":
        threadedLog("realm command error", { sourceCmd: msg.sourceCmd, error: msg.error });
        return;
      default: {
        // id-carrying replies (engineCallResult / engineInitDone /
        // startLoopResult / statusResult / ...) settle their pending entry.
        if (msg.id !== undefined && pending.has(msg.id)) {
          settlePending(msg.id, (entry) => entry.resolve(msg));
          return;
        }
        // pong / connected / setupDone during prep are awaited by matcher
        // callbacks registered in prepWaiters below.
        for (const waiter of prepWaiters) {
          if (!waiter.done && waiter.match(msg)) {
            waiter.done = true;
            waiter.resolve(msg);
            return;
          }
        }
      }
    }
  }

  const prepWaiters = [];
  function waitForRealmMessage(match, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve, done: false };
      prepWaiters.push(waiter);
      setTimeout(() => {
        if (!waiter.done) {
          waiter.done = true;
          reject(new Error(`threaded realm prep timed out waiting for ${label}`));
        }
      }, timeoutMs);
    });
  }

  async function prepare() {
    await wasmModulePromise;
    const module = cncPortEmscriptenModule;
    if (!module) {
      throw new Error("threaded mode: wasm module unavailable");
    }
    if (!(module.HEAP8?.buffer instanceof SharedArrayBuffer)) {
      throw new Error("threaded mode requires the pthread build (dist-threaded) + crossOriginIsolated");
    }
    const pt = module.PThread;
    engineWorker = (pt?.unusedWorkers && pt.unusedWorkers[0])
      || (pt?.runningWorkers && pt.runningWorkers[0]) || null;
    if (!engineWorker) {
      throw new Error("threaded mode: no pthread pool worker found");
    }
    // Coexists with PThread's worker.onmessage (property assignment).
    engineWorker.addEventListener("message", (event) => {
      const data = event?.data;
      if (data && typeof data === "object" && data.__cncRealm) {
        dispatchRealmMessage(data.__cncRealm);
      }
    });

    const pong = waitForRealmMessage((m) => m.cmd === "pong", 10000, "pong");
    engineWorker.postMessage({ target: "setimmediate", __cncRealm: { cmd: "ping" } });
    await pong;

    const channel = new MessageChannel();
    realmPort = channel.port1;
    realmPort.onmessage = (event) => {
      const data = event?.data;
      if (data && typeof data === "object" && data.__cncRealm) {
        dispatchRealmMessage(data.__cncRealm);
      }
    };
    const connected = waitForRealmMessage((m) => m.cmd === "connected", 10000, "connected");
    engineWorker.postMessage(
      { target: "setimmediate", __cncRealm: { cmd: "connect" } },
      [channel.port2],
    );
    await connected;
    // MSS dedupe handshake (see cncPortDecodedSampleCache): dropped decode
    // cache keys must reach the worker so it re-sends sample bytes.
    cncPortMssCacheDropNotifier = (keys) => sendPortCommand({ cmd: "mssCacheDrop", keys });

    const offscreen = canvas.transferControlToOffscreen();
    const moduleUrl = new URL("./engine_realm_boot.mjs", import.meta.url).href;
    const setupDone = waitForRealmMessage((m) => m.cmd === "setupDone", 30000, "setupDone");
    realmPort.postMessage({
      __cncRealm: {
        cmd: "setup",
        moduleUrl,
        canvas: offscreen,
        options: {
          diagLevel: threadedWorkerDiagLevel(),
          preserveDrawingBuffer: contextPreserveDrawingBuffer,
          shaderTier: threadedWorkerShaderTier(),
        },
      },
    }, [offscreen]);
    const setup = await setupDone;
    if (setup.ok !== true) {
      throw new Error(`threaded realm setup failed: ${setup.error ?? "unknown"}`);
    }
    threadedLog("realm setup complete", {
      hooksInstalled: setup.hooksInstalled?.length ?? 0,
      moduleCommandHandler: setup.moduleCommandHandler === true,
    });
    // Pin the standing worker->main channel inside the boot module (its
    // unsolicited posts — status/mss/loopError — ride this respond closure).
    sendPortCommand({ cmd: "attachMainPort" });
    harnessState.threadedMode = true;
  }

  function ensureReady() {
    if (!prepPromise) {
      prepPromise = prepare();
    }
    return prepPromise;
  }

  function sendPortCommand(payload, transfer) {
    if (!realmPort) {
      throw new Error("threaded realm port not connected");
    }
    realmPort.postMessage({ __cncRealm: payload }, transfer ?? []);
  }

  function sendCommand(payload, { timeoutMs = 300000, onProgress = null } = {}) {
    const id = ++commandId;
    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        onProgress: null,
        timer: null,
        cmdName: payload.cmd === "engineCall" ? `engineCall:${payload.name}` : payload.cmd,
      };
      const armTimer = () => {
        if (entry.timer) {
          clearTimeout(entry.timer);
        }
        entry.timer = setTimeout(() => {
          pending.delete(id);
          publishPending();
          reject(new Error(`threaded command ${entry.cmdName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      };
      // Progress messages prove the engine thread is alive — re-arm the
      // deadline instead of giving a long op a fixed budget.
      entry.onProgress = (step) => {
        armTimer();
        if (onProgress) {
          onProgress(step);
        }
      };
      pending.set(id, entry);
      publishPending();
      armTimer();
      try {
        sendPortCommand({ ...payload, id });
      } catch (error) {
        pending.delete(id);
        publishPending();
        clearTimeout(entry.timer);
        reject(error);
      }
    });
  }

  async function engineCall(name, returnType, argTypes, args, options = {}) {
    await ensureReady();
    const reply = await sendCommand({
      cmd: "engineCall",
      name,
      returnType,
      argTypes,
      args,
      parseJson: options.parseJson !== false,
    }, { timeoutMs: options.timeoutMs ?? 300000 });
    if (reply.ok !== true) {
      throw new Error(reply.error ?? `threaded engine call ${name} failed`);
    }
    return reply.value;
  }

  // ---- ordered input forwarding with pointermove coalescing ------------------
  // Entries flush once per task (microtask boundary); consecutive
  // pointermove-only entries collapse to the latest one, mirroring how the
  // Win32 message queue naturally coalesces WM_MOUSEMOVE.
  const inputOutbox = [];
  let inputFlushScheduled = false;
  const WM_MOUSEMOVE = 0x0200;

  function flushInputOutbox() {
    inputFlushScheduled = false;
    if (inputOutbox.length === 0 || !realmPort) {
      inputOutbox.length = 0;
      return;
    }
    const batch = inputOutbox.splice(0);
    try {
      sendPortCommand({ cmd: "input", batch });
    } catch (_error) {
      // Port gone (realm setup failed) — input is droppable.
    }
  }

  function forwardInput(entry) {
    const isMove = entry.win32?.message === WM_MOUSEMOVE
      && entry.virtualKey === undefined
      && (entry.directInputCode ?? -1) < 0
      && entry.reset !== true;
    const last = inputOutbox[inputOutbox.length - 1];
    if (isMove && last && last.__move === true) {
      inputOutbox[inputOutbox.length - 1] = { ...entry, __move: true };
    } else {
      inputOutbox.push(isMove ? { ...entry, __move: true } : entry);
    }
    if (!inputFlushScheduled) {
      inputFlushScheduled = true;
      queueMicrotask(flushInputOutbox);
    }
  }

  // ---- boot/go + real init orchestration -------------------------------------
  async function startEngineThread() {
    await ensureReady();
    if (engineThreadStarted) {
      return;
    }
    const module = cncPortEmscriptenModule;
    const rc = module._cnc_port_engine_thread_boot();
    if (rc !== 0) {
      throw new Error(`cnc_port_engine_thread_boot failed rc=${rc}`);
    }
    const deadline = performance.now() + 15000;
    while (module._cnc_port_engine_thread_boot_state() < 1) {
      if (performance.now() > deadline) {
        throw new Error("engine pthread did not reach its go-flag poll within 15s");
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    module._cnc_port_engine_thread_go();
    engineThreadStarted = true;
    threadedLog("engine pthread started (boot+go)");
  }

  async function engineInit(payload = {}) {
    await startEngineThread();
    const traceStart = harnessState.logs.length;
    const onProgress = (step) => {
      harnessState.realEngineInitProgress = step;
      try {
        window.dispatchEvent(new CustomEvent("cncport:initprogress", { detail: step }));
      } catch (_error) { /* no DOM */ }
    };
    let reply = null;
    let aborted = false;
    let abortMessage = null;
    try {
      reply = await sendCommand({
        cmd: "engineInit",
        runDirectory: String(payload.runDirectory ?? "/assets/runtime"),
        shellMap: payload.shellMap === true,
        stepped: payload.stepped !== false,
        bootWidth: payload.bootWidth,
        bootHeight: payload.bootHeight,
        stepBudgetMs: payload.stepBudgetMs,
      }, {
        // SwiftShader full boots take minutes; each init slice posts progress
        // which re-arms this deadline, so a genuine hang is what times out.
        timeoutMs: 600000,
        onProgress,
      });
    } catch (error) {
      aborted = true;
      abortMessage = error?.message ?? String(error);
    }
    const result = reply?.result ?? null;
    if (result?.aborted) {
      aborted = true;
      abortMessage = result.abortMessage ?? abortMessage ?? "unknown";
    }
    const frontier = result?.frontier ?? null;
    // Same stdout-trace digest the non-threaded path builds: pthread printf is
    // proxied to the main runtime's print handlers, so the subsystem trace
    // still lands in harnessState.logs.
    const traceLines = harnessState.logs
      .slice(traceStart)
      .map((entry) => entry?.data?.text)
      .filter((text) => typeof text === "string"
        && (text.startsWith("cnc-port: real-init") || text.startsWith("cnc-port: RELEASE_CRASH")));
    const releaseCrash = traceLines.find((text) => text.startsWith("cnc-port: RELEASE_CRASH")) ?? null;
    const completed = traceLines
      .filter((text) => text.startsWith("cnc-port: real-init subsystem-done "))
      .map((text) => text.slice("cnc-port: real-init subsystem-done ".length));
    recordLog("real engine init (threaded)", {
      aborted,
      abortMessage,
      releaseCrash,
      subsystemsCompleted: completed.length,
      initReturned: Boolean(frontier?.initReturned),
    });
    harnessState.realEngineInit = {
      attempted: true,
      threaded: true,
      runDirectory: String(payload.runDirectory ?? "/assets/runtime"),
      aborted,
      abortMessage,
      releaseCrash,
      trace: traceLines,
      subsystemsCompleted: completed,
      frontier,
    };
    return {
      ok: Boolean(frontier?.initReturned) && !aborted,
      command: "realEngineInit",
      threaded: true,
      runDirectory: String(payload.runDirectory ?? "/assets/runtime"),
      aborted,
      abortMessage,
      releaseCrash,
      trace: traceLines,
      subsystemsCompleted: completed,
      inFlightSubsystem: null,
      frontier,
      state: snapshotState(),
    };
  }

  async function startLoop(payload = {}) {
    await startEngineThread();
    const reply = await sendCommand({
      cmd: "startLoop",
      clientFps: payload.clientFps,
      logicFps: payload.logicFps,
      catchup: payload.catchup,
    }, { timeoutMs: 60000 });
    return reply;
  }

  // Fire-and-forget realm command (no id, no reply, no timeout entry) —
  // pagehide teardown must not allocate pending state on a dying page.
  function postCommand(payload) {
    try {
      sendPortCommand(payload);
      return true;
    } catch (_error) {
      return false;
    }
  }

  return {
    ensureReady,
    startEngineThread,
    engineCall,
    engineInit,
    startLoop,
    forwardInput,
    sendCommand,
    postCommand,
    get lastStatus() { return lastStatus; },
    get lastLoopError() { return lastLoopError; },
    get engineThreadStarted() { return engineThreadStarted; },
  };
}

const threadedEngine = cncPortThreadedMode ? createThreadedEngineController() : null;
if (threadedEngine) {
  // Prepare the worker realm as soon as the runtime is up — BEFORE any engine
  // start (P1a handshake rule: all realm prep must complete before boot/go
  // blocks the worker's event loop).
  threadedEngine.ensureReady().catch((error) => {
    recordLog("threaded realm prep failed", { error: error?.message ?? String(error) });
  });
}

// Redirect Web Audio completion callbacks into the engine realm in threaded
// mode (they call cnc_port_mss_complete_* which touches engine state and must
// run on the engine thread).
function notifyEngineAudioCompletedThreaded(fnName, handle) {
  const numericHandle = Number(handle) >>> 0;
  if (!numericHandle) {
    return true;
  }
  if (!threadedEngine) {
    return false;
  }
  threadedEngine.engineCall(fnName, null, ["number"], [numericHandle], { timeoutMs: 60000 })
    .catch((error) => {
      recordLog("threaded audio completion failed", {
        fnName,
        error: error?.message ?? String(error),
      });
    });
  return true;
}

// Threaded capture of the #viewport placeholder canvas: the transferred
// canvas commits frames from the worker; drawImage on the placeholder is the
// spec-supported way to read them back on main.
function snapshotThreadedViewport() {
  const scratch = document.createElement("canvas");
  const width = harnessState.engineDisplaySize?.width ?? canvas.width;
  const height = harnessState.engineDisplaySize?.height ?? canvas.height;
  scratch.width = Math.max(1, width);
  scratch.height = Math.max(1, height);
  const context = scratch.getContext("2d");
  try {
    context.drawImage(canvas, 0, 0, scratch.width, scratch.height);
    return scratch.toDataURL("image/png");
  } catch (error) {
    recordLog("threaded snapshot failed", { error: error?.message ?? String(error) });
    return null;
  }
}

// RPC routing gate for threaded mode. Returns undefined to fall through to
// the regular (main-side JS only) handler; anything else is the final RPC
// result. Commands that would call wasm exports from the MAIN thread while
// the engine runs on the pthread are either routed over the realm port or
// answered with an explicit unsupported error — never allowed through and
// never hung.
const THREADED_MAIN_SIDE_COMMANDS = new Set([
  // mountArchive/mountArchives are handled in the switch below: pre-boot they
  // fall through to the main-side pipeline (main still owns the wasm), post
  // boot they are refused (registerArchiveSet/probeArchive are main-thread
  // wasm calls).
  "resumeBrowserAudioRuntime",
  "setBrowserAudioMixerVolumes",
  "setD3D8GammaRamp",
  // Saves: IDBFS is mounted on the MAIN runtime (preRun) and the engine
  // thread's FS writes proxy to main, so persist (FS.syncfs) and the listing
  // are pure main-side JS in threaded mode too.
  "persistSaves",
  "listSaves",
]);

async function threadedRpc(command, payload = {}) {
  if (!threadedEngine) {
    return undefined;
  }
  if (THREADED_MAIN_SIDE_COMMANDS.has(command)) {
    return undefined; // pure main-side JS/FS/WebAudio — unchanged behavior
  }
  switch (command) {
    case "state": {
      // Parity with the non-threaded handler: fetch the wasm cnc_port_state
      // JSON ON the engine thread and merge it into harnessState via
      // applyModuleState, then return the main-side snapshot. Before the
      // engine pthread starts (or if the round trip fails) fall back to the
      // main-only snapshot — never a main-thread wasm call, never a hang.
      let wasmStateSource = "unavailable (engine thread not started)";
      if (threadedEngine.engineThreadStarted) {
        try {
          const moduleState = await threadedEngine.engineCall(
            "cnc_port_state", "string", [], [], { timeoutMs: 120000 });
          if (moduleState && typeof moduleState === "object") {
            applyModuleState(moduleState);
            harnessState.wasm = "loaded";
            wasmStateSource = "engine-thread";
          } else {
            wasmStateSource = "cnc_port_state returned a non-object payload";
          }
        } catch (error) {
          wasmStateSource = `cnc_port_state failed: ${error?.message ?? String(error)}`;
        }
      }
      return {
        ok: true,
        command,
        state: snapshotState(),
        logs: [...harnessState.logs],
        threaded: true,
        wasmStateSource,
        threadedEngine: threadedEngine.lastStatus,
      };
    }
    case "mountArchive":
    case "mountArchives": {
      if (threadedEngine.engineThreadStarted) {
        // The mount pipelines call registerArchiveSet/probeArchive wasm
        // exports on the MAIN thread — safe only before the engine pthread
        // runs (play boots mount-first). Refuse loudly instead of racing the
        // engine thread on the shared wasm.
        return {
          ok: false,
          command,
          threaded: true,
          error: "post-boot mounts are unsupported in threaded mode: the mount "
            + "pipeline calls registerArchiveSet/probeArchive wasm exports on the "
            + "main thread, which is only safe before the engine pthread starts. "
            + "Mount all archives before realEngineInit.",
        };
      }
      return undefined; // pre-boot: main still owns the wasm — unchanged pipeline
    }
    case "realEngineAnimReport": {
      try {
        const report = await threadedEngine.engineCall(
          "cnc_port_real_engine_anim_report", "string", ["number"],
          [Number(payload.maxEntries ?? 0)]);
        return { ok: report?.ok === true, command, report, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "querySelection": {
      try {
        const result = await threadedEngine.engineCall(
          "cnc_port_query_selection", "string", [], []);
        return {
          ok: Boolean(result?.ready),
          command,
          result,
          threaded: true,
          state: snapshotState(),
        };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "realEngineFrameSummary": {
      // Issue-recorder deep snapshots use this; the frames interleave with
      // the engine-thread paced loop exactly like they interleave with the
      // page-driven loop in non-threaded mode.
      try {
        const frames = Math.max(1, Math.min(600, Math.trunc(Number(payload.frames ?? 1))));
        if (payload.profile !== undefined) {
          await threadedEngine.engineCall(
            "cnc_port_real_engine_set_frame_profile", null, ["number"],
            [payload.profile === true ? 1 : 0]);
        }
        if (payload.playerDiagnostics !== undefined) {
          await threadedEngine.engineCall(
            "cnc_port_real_engine_set_player_diagnostics", null, ["number"],
            [payload.playerDiagnostics === true ? 1 : 0]);
        }
        const frame = await threadedEngine.engineCall(
          "cnc_port_real_engine_frame_summary", "string", ["number"], [frames]);
        return {
          ok: Boolean(frame?.framesCompleted > 0),
          command,
          aborted: false,
          frame,
          threaded: true,
          state: snapshotState(),
        };
      } catch (error) {
        return {
          ok: false, command, aborted: true,
          abortMessage: error?.message ?? String(error), threaded: true,
        };
      }
    }
    case "d3d8TextureInventory": {
      // The D3D8 executor (and its live-texture map) runs in the ENGINE realm
      // in threaded mode — the main-side executor is a blank scratch canvas.
      // Route the inventory to the worker realm (pure JS + GL reads there).
      try {
        await threadedEngine.ensureReady();
        const reply = await threadedEngine.sendCommand({
          cmd: "textureInventory",
          sizes: Array.isArray(payload.sizes) ? payload.sizes : undefined,
          sampleLimit: payload.sampleLimit,
        }, { timeoutMs: 120000 });
        return {
          ok: reply?.ok === true,
          command,
          inventory: reply?.inventory ?? {},
          liveCount: reply?.liveCount ?? 0,
          threaded: true,
          error: reply?.ok === true ? undefined : (reply?.error ?? "worker inventory failed"),
        };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "screenshot":
      return { ok: true, command, screenshot: snapshotThreadedViewport(), threaded: true };
    case "threadedStatus": {
      await threadedEngine.ensureReady();
      if (threadedEngine.engineThreadStarted) {
        // Long engine frames (shellmap load slices under SwiftShader) delay
        // port replies by tens of seconds — give the round trip real room.
        const reply = await threadedEngine.sendCommand({ cmd: "status" }, { timeoutMs: 120000 });
        return { ok: true, command, status: reply, threaded: true };
      }
      return { ok: true, command, status: threadedEngine.lastStatus, threaded: true };
    }
    case "threadedPacingSamples": {
      const reply = await threadedEngine.sendCommand({ cmd: "pacingSamples" }, { timeoutMs: 120000 });
      return { ok: true, command, samples: reply.samples ?? [], threaded: true };
    }
    case "threadedStartLoop": {
      try {
        const reply = await threadedEngine.startLoop(payload);
        return {
          ok: reply.ok === true,
          command,
          pacing: reply.pacing ?? null,
          clientFps: reply.clientFps,
          logicFps: reply.logicFps,
          error: reply.ok === true ? undefined : (reply.error ?? "startLoop failed"),
          threaded: true,
        };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "realEngineInit":
      try {
        return await threadedEngine.engineInit(payload);
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    case "realEngineFrame": {
      try {
        const frames = Math.max(1, Math.min(600, Math.trunc(Number(payload.frames ?? 1))));
        const frame = await threadedEngine.engineCall(
          "cnc_port_real_engine_frame", "string", ["number"], [frames]);
        return {
          ok: Boolean(frame?.framesCompleted > 0),
          command,
          aborted: false,
          frame,
          threaded: true,
          state: snapshotState(),
        };
      } catch (error) {
        return {
          ok: false, command, aborted: true,
          abortMessage: error?.message ?? String(error), threaded: true,
        };
      }
    }
    case "realEngineFramePaced": {
      try {
        const frame = await threadedEngine.engineCall(
          "cnc_port_real_engine_frame_paced", "string", ["number"],
          [payload.runLogic === false ? 0 : 1]);
        return { ok: frame?.tick === true, command, frame, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "realEngineSetClientPacing": {
      try {
        const pacing = await threadedEngine.engineCall(
          "cnc_port_real_engine_set_client_pacing", "string", ["number", "number"],
          [Number(payload.clientFps ?? 60), Number(payload.logicFps ?? 30)]);
        return { ok: pacing?.ok === true, command, ...pacing, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "realEngineSetLoadStepping": {
      try {
        const stepping = await threadedEngine.engineCall(
          "cnc_port_real_engine_set_load_stepping", "string", ["number", "number"],
          [payload.enabled === false ? 0 : 1, Number(payload.budgetMs ?? 0)]);
        return { ok: true, command, stepping, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "realEngineFrontier": {
      try {
        const frontier = await threadedEngine.engineCall(
          "cnc_port_real_engine_frontier", "string", [], []);
        return { ok: true, command, frontier, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "setEngineResolution": {
      const width = Math.max(1, Math.round(Number(payload.width ?? 0)));
      const height = Math.max(1, Math.round(Number(payload.height ?? 0)));
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
        return { ok: false, command, error: "invalid width/height", threaded: true };
      }
      try {
        const result = await threadedEngine.engineCall(
          "cnc_port_real_engine_set_resolution", "string", ["number", "number"],
          [width, height]);
        return {
          ok: result?.ok === true,
          command,
          requested: { width, height },
          applied: {
            width: Number.isFinite(result?.width) && result.width > 0 ? result.width : width,
            height: Number.isFinite(result?.height) && result.height > 0 ? result.height : height,
          },
          reflow: result?.reflow ?? null,
          error: result?.ok === true ? undefined : (result?.error ?? "resolution change refused"),
          threaded: true,
        };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "postMessage": {
      // Synthetic win32 message from the harness/pages: ride the ordered
      // input-forwarding path (applied on the engine thread between frames).
      await threadedEngine.ensureReady();
      threadedEngine.forwardInput({
        cursor: payload.point ?? null,
        win32: {
          message: Number(payload.message ?? 0),
          wParam: Number(payload.wParam ?? 0),
          lParam: Number(payload.lParam ?? 0),
          px: payload.point?.x ?? 0,
          py: payload.point?.y ?? 0,
        },
      });
      return { ok: true, command, forwarded: true, threaded: true, state: snapshotState() };
    }
    case "realEngineDumpWindows": {
      try {
        const windows = await threadedEngine.engineCall(
          "cnc_port_real_engine_dump_windows", "string", [], []);
        return { ok: true, command, windows, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "probeBrowserInput": {
      try {
        const probe = await threadedEngine.engineCall(
          "cnc_port_probe_browser_input", "string", [], []);
        return { ok: true, command, probe, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "queryDrawables": {
      try {
        const drawables = await threadedEngine.engineCall(
          "cnc_port_query_drawables", "string", [], []);
        return { ok: true, command, drawables, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "clickWindowByName": {
      try {
        const result = await threadedEngine.engineCall(
          "cnc_port_click_window_by_name", "string", ["string"],
          // payload.name matches the non-threaded handler's contract.
          [String(payload.name ?? payload.window ?? payload.windowName ?? "")]);
        // The export's JSON has no "ok" field — clicked is the success signal.
        return { ok: result?.clicked === true, command, result, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "realEngineSetSkirmishMap": {
      // Same export the non-threaded handler cwraps; executed on the engine
      // thread. Enables in-game (skirmish) drives/measurements in threaded
      // mode (P3 fixed-heap sizing used this first).
      try {
        const result = await threadedEngine.engineCall(
          "cnc_port_real_engine_set_skirmish_map", "string", ["string"],
          [String(payload.map ?? payload.mapName ?? "")]);
        return { ok: result?.ok === true, command, result, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    case "realEngineSetSkirmishLocalTemplate": {
      try {
        const result = await threadedEngine.engineCall(
          "cnc_port_real_engine_set_skirmish_local_template", "string", ["string"],
          [String(payload.templateName ?? payload.template ?? "")]);
        return { ok: result?.ok === true, command, result, threaded: true };
      } catch (error) {
        return { ok: false, command, error: error?.message ?? String(error), threaded: true };
      }
    }
    default:
      return {
        ok: false,
        command,
        error: "not yet supported in threaded mode",
        threaded: true,
      };
  }
}

function browserAudioContextCtor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function summarizeBrowserAudioRuntime() {
  const AudioContextCtor = browserAudioContextCtor();
  const context = browserAudioRuntime.context;
  return {
    source: browserAudioRuntime.source,
    available: typeof AudioContextCtor === "function",
    created: browserAudioRuntime.created,
    constructor: context?.constructor?.name
      ?? (typeof AudioContextCtor === "function" ? AudioContextCtor.name : null),
    contextState: context?.state ?? null,
    resumeSupported: typeof context?.resume === "function"
      || typeof AudioContextCtor?.prototype?.resume === "function",
    userGestureResumeHooked: true,
    resumeAttempts: browserAudioRuntime.resumeAttempts,
    resumeSuccesses: browserAudioRuntime.resumeSuccesses,
    lastResumeTrigger: browserAudioRuntime.lastResumeTrigger,
    lastResumeError: browserAudioRuntime.lastResumeError,
    runtimePlayback: false,
    engineDriven: false,
    nextRequired: "engineDrivenBrowserAudioDevice",
  };
}

function ensureBrowserAudioRuntimeContext(trigger) {
  if (browserAudioRuntime.context) {
    return browserAudioRuntime.context;
  }

  const AudioContextCtor = browserAudioContextCtor();
  if (typeof AudioContextCtor !== "function") {
    browserAudioRuntime.lastResumeTrigger = trigger;
    browserAudioRuntime.lastResumeError = "AudioContext is unavailable";
    return null;
  }

  try {
    browserAudioRuntime.context = new AudioContextCtor();
    browserAudioRuntime.created = true;
    browserAudioRuntime.lastResumeError = null;
    return browserAudioRuntime.context;
  } catch (error) {
    browserAudioRuntime.lastResumeTrigger = trigger;
    browserAudioRuntime.lastResumeError = error?.message ?? String(error);
    return null;
  }
}

async function resumeBrowserAudioRuntime(trigger = "rpc.resumeBrowserAudioRuntime") {
  browserAudioRuntime.resumeAttempts += 1;
  browserAudioRuntime.lastResumeTrigger = String(trigger);
  const context = ensureBrowserAudioRuntimeContext(browserAudioRuntime.lastResumeTrigger);
  if (!context) {
    return summarizeBrowserAudioRuntime();
  }

  try {
    if (typeof context.resume === "function" && context.state !== "running") {
      // Under the autoplay policy context.resume() stays PENDING (not
      // rejected) until a user gesture — a gesture-less boot (headless
      // ?autostart=1 probes) would hang forever on this await. Give it a
      // short window and move on; the window pointerdown/keydown listeners
      // re-resume on the first real gesture.
      await Promise.race([
        context.resume(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    if (context.state === "running") {
      browserAudioRuntime.resumeSuccesses += 1;
      browserAudioRuntime.lastResumeError = null;
      ensureBrowserAudioMixerRuntime();
    } else {
      browserAudioRuntime.lastResumeError = `AudioContext remained ${context.state}`;
    }
  } catch (error) {
    browserAudioRuntime.lastResumeError = error?.message ?? String(error);
  }
  return summarizeBrowserAudioRuntime();
}

function normalizeBrowserAudioMixerVolumes(defaults, overrides) {
  const volumes = {};
  for (const bus of browserAudioMixerBusNames) {
    const value = Number(overrides?.[bus] ?? defaults?.[bus] ?? 1);
    volumes[bus] = Number.isFinite(value) ? value : Number(defaults?.[bus] ?? 1);
  }
  return volumes;
}

function computeBrowserAudioMixerGains(scriptVolumes, systemVolumes, zoomVolume) {
  return {
    music: Number((scriptVolumes.music * systemVolumes.music).toFixed(6)),
    sound: Number((scriptVolumes.sound * systemVolumes.sound).toFixed(6)),
    sound3D: Number((zoomVolume * scriptVolumes.sound3D * systemVolumes.sound3D).toFixed(6)),
    speech: Number((scriptVolumes.speech * systemVolumes.speech).toFixed(6)),
  };
}

function ensureBrowserAudioMixerRuntime() {
  const context = browserAudioRuntime.context;
  if (!context) {
    browserAudioMixerRuntime.lastError = "AudioContext has not been created by a user gesture";
    return null;
  }
  if (context.state !== "running") {
    browserAudioMixerRuntime.lastError = `AudioContext is ${context.state}`;
    return null;
  }

  if (!browserAudioMixerRuntime.scriptVolumes || !browserAudioMixerRuntime.systemVolumes) {
    const defaults = buildBrowserAudioMixerDefaults();
    browserAudioMixerRuntime.scriptVolumes = { ...defaults.scriptVolumes };
    browserAudioMixerRuntime.systemVolumes = { ...defaults.systemVolumes };
    browserAudioMixerRuntime.zoomVolume = defaults.zoomVolume;
    browserAudioMixerRuntime.busGains = { ...defaults.busGains };
  }

  if (!browserAudioMixerRuntime.created) {
    browserAudioMixerRuntime.busNodes = {};
    for (const bus of browserAudioMixerBusNames) {
      const gain = context.createGain();
      gain.gain.value = browserAudioMixerRuntime.busGains[bus];
      gain.connect(context.destination);
      browserAudioMixerRuntime.busNodes[bus] = gain;
    }
    browserAudioMixerRuntime.created = true;
    browserAudioMixerRuntime.lastError = null;
  }

  return browserAudioMixerRuntime;
}

function summarizeBrowserAudioMixerRuntime() {
  const defaults = buildBrowserAudioMixerDefaults();
  const scriptVolumes = browserAudioMixerRuntime.scriptVolumes ?? defaults.scriptVolumes;
  const systemVolumes = browserAudioMixerRuntime.systemVolumes ?? defaults.systemVolumes;
  const zoomVolume = browserAudioMixerRuntime.zoomVolume ?? defaults.zoomVolume;
  const busGains = browserAudioMixerRuntime.busGains
    ?? computeBrowserAudioMixerGains(scriptVolumes, systemVolumes, zoomVolume);
  const context = browserAudioRuntime.context;
  const buses = Object.fromEntries(browserAudioMixerBusNames.map((bus) => [
    bus,
    {
      node: "GainNode",
      connected: browserAudioMixerRuntime.created === true,
      gain: Number((browserAudioMixerRuntime.busNodes?.[bus]?.gain?.value ?? busGains[bus]).toFixed(6)),
    },
  ]));
  return {
    source: browserAudioMixerRuntime.source,
    available: typeof browserAudioContextCtor() === "function",
    created: browserAudioMixerRuntime.created,
    contextCreated: browserAudioRuntime.created,
    contextState: context?.state ?? null,
    runtimePlayback: false,
    engineDriven: false,
    nextRequired: "engineOptionsAudioVolumeBinding",
    sourceFrontiers: [
      "verify:audio-options-volume-frontier",
      "verify:miles-audio-volume-frontier",
      "verify:audio-3d-zoom-volume-frontier",
    ],
    nodeGraph: ["GainNode", "AudioDestinationNode"],
    formula: defaults.formula,
    scriptVolumes,
    systemVolumes,
    zoomVolume,
    busGains,
    buses,
    updates: browserAudioMixerRuntime.updates,
    lastUpdate: browserAudioMixerRuntime.lastUpdate,
    lastError: browserAudioMixerRuntime.lastError,
  };
}

function setBrowserAudioMixerRuntimeVolumes(payload = {}) {
  const mixer = ensureBrowserAudioMixerRuntime();
  if (!mixer) {
    return summarizeBrowserAudioMixerRuntime();
  }

  mixer.scriptVolumes = normalizeBrowserAudioMixerVolumes(
    mixer.scriptVolumes,
    payload.scriptVolumes,
  );
  mixer.systemVolumes = normalizeBrowserAudioMixerVolumes(
    mixer.systemVolumes,
    payload.systemVolumes,
  );
  const zoomVolume = Number(payload.zoomVolume ?? mixer.zoomVolume ?? 1);
  mixer.zoomVolume = Number.isFinite(zoomVolume) ? zoomVolume : 1;
  mixer.busGains = computeBrowserAudioMixerGains(
    mixer.scriptVolumes,
    mixer.systemVolumes,
    mixer.zoomVolume,
  );

  for (const bus of browserAudioMixerBusNames) {
    mixer.busNodes[bus].gain.value = mixer.busGains[bus];
  }
  mixer.updates += 1;
  mixer.lastUpdate = {
    source: "AudioManager::setVolume script/system volume split",
    trigger: String(payload.trigger ?? "rpc.setBrowserAudioMixerVolumes"),
    scriptVolumes: { ...mixer.scriptVolumes },
    systemVolumes: { ...mixer.systemVolumes },
    zoomVolume: mixer.zoomVolume,
    busGains: { ...mixer.busGains },
  };
  mixer.lastError = null;
  return summarizeBrowserAudioMixerRuntime();
}

function rememberBrowserAudioRequestedDecodedCache(decodedCache) {
  browserAudioRequestedDecodedCache.clear();
  for (const [cacheKey, decoded] of decodedCache) {
    browserAudioRequestedDecodedCache.set(cacheKey, decoded);
  }
  browserAudioLiveEventRuntime.nextHandle = 12001;
  browserAudioLiveEventRuntime.started = 0;
  browserAudioLiveEventRuntime.completed = 0;
  browserAudioLiveEventRuntime.released = 0;
  browserAudioLiveEventRuntime.lastEvent = null;
  browserAudioLiveEventRuntime.eventLog = [];
  browserAudioLiveEventRuntime.lastError = null;
  browserAudioRequestPathRuntime.nextHandle = 22001;
  browserAudioRequestPathRuntime.enqueued = 0;
  browserAudioRequestPathRuntime.drained = 0;
  browserAudioRequestPathRuntime.dispatched = 0;
  browserAudioRequestPathRuntime.started = 0;
  browserAudioRequestPathRuntime.completed = 0;
  browserAudioRequestPathRuntime.released = 0;
  browserAudioRequestPathRuntime.lastEvent = null;
  browserAudioRequestPathRuntime.eventLog = [];
  browserAudioRequestPathRuntime.lastError = null;
}

function summarizeBrowserAudioLiveEventRuntime() {
  return {
    source: browserAudioLiveEventRuntime.source,
    ready:
      browserAudioRequestedDecodedCache.size > 0 &&
      browserAudioRuntime.context?.state === "running" &&
      browserAudioMixerRuntime.created === true,
    cacheEntries: browserAudioRequestedDecodedCache.size,
    cacheKeys: [...browserAudioRequestedDecodedCache.keys()],
    runtimePlayback: browserAudioLiveEventRuntime.completed > 0,
    engineDriven: false,
    nextRequired: "engineAudioEventScheduling",
    sourceFrontiers: [
      "verify:audio-event-request-frontier",
      "verify:audio-sample-start-frontier",
      "verify:audio-completion-frontier",
      "verify:audio-playing-event-state-frontier",
    ],
    started: browserAudioLiveEventRuntime.started,
    completed: browserAudioLiveEventRuntime.completed,
    released: browserAudioLiveEventRuntime.released,
    lastEvent: browserAudioLiveEventRuntime.lastEvent,
    eventLog: [...browserAudioLiveEventRuntime.eventLog],
    lastError: browserAudioLiveEventRuntime.lastError,
  };
}

function uniqueBrowserAudioRequestPathLogValues(phase, property) {
  return [
    ...new Set(
      browserAudioRequestPathRuntime.eventLog
        .filter((entry) => entry.phase === phase && entry[property])
        .map((entry) => entry[property]),
    ),
  ];
}

function summarizeBrowserAudioRequestPathRuntime() {
  return {
    source: browserAudioRequestPathRuntime.source,
    ready:
      browserAudioRequestedDecodedCache.size > 0 &&
      browserAudioRuntime.context?.state === "running" &&
      browserAudioMixerRuntime.created === true,
    cacheEntries: browserAudioRequestedDecodedCache.size,
    cacheKeys: [...browserAudioRequestedDecodedCache.keys()],
    runtimePlayback: browserAudioRequestPathRuntime.completed > 0,
    engineDriven: false,
    sourcePathDriven: true,
    nextRequired: "realMilesAudioManagerWebAudioBackend",
    sourceFrontiers: [
      "verify:audio-event-request-frontier",
      "verify:audio-request-update-frontier",
      "verify:audio-sample-start-frontier",
      "verify:audio-playing-event-state-frontier",
      "verify:audio-completion-frontier",
      "verify:audio-browser-bridge-contract-frontier",
    ],
    coveredPlayingTypes: uniqueBrowserAudioRequestPathLogValues("start", "playingType"),
    coveredDeviceStarts: uniqueBrowserAudioRequestPathLogValues("playAudioEvent", "deviceStart"),
    coveredAudioTypes: uniqueBrowserAudioRequestPathLogValues("route", "audioType"),
    coveredBuses: uniqueBrowserAudioRequestPathLogValues("route", "bus"),
    enqueued: browserAudioRequestPathRuntime.enqueued,
    drained: browserAudioRequestPathRuntime.drained,
    dispatched: browserAudioRequestPathRuntime.dispatched,
    started: browserAudioRequestPathRuntime.started,
    completed: browserAudioRequestPathRuntime.completed,
    released: browserAudioRequestPathRuntime.released,
    lastEvent: browserAudioRequestPathRuntime.lastEvent,
    eventLog: [...browserAudioRequestPathRuntime.eventLog],
    lastError: browserAudioRequestPathRuntime.lastError,
  };
}

function resetBrowserNetworkRelayRuntime() {
  browserNetworkRelayRuntime.sent = 0;
  browserNetworkRelayRuntime.delivered = 0;
  browserNetworkRelayRuntime.received = 0;
  browserNetworkRelayRuntime.bytes = 0;
  browserNetworkRelayRuntime.packets = [];
  browserNetworkRelayRuntime.eventLog = [];
  browserNetworkRelayRuntime.lastEvent = null;
  browserNetworkRelayRuntime.lastError = null;
}

function summarizeBrowserNetworkRelayRuntime() {
  return {
    source: browserNetworkRelayRuntime.source,
    ready: browserNetworkRelayRuntime.received > 0,
    browserTransport: browserNetworkRelayRuntime.browserTransport,
    productionTransport: browserNetworkRelayRuntime.productionTransport,
    relayTransport: browserNetworkRelayRuntime.relayTransport,
    originalSerializer: browserNetworkRelayRuntime.originalSerializer,
    originalParser: browserNetworkRelayRuntime.originalParser,
    nextRequired: browserNetworkRelayRuntime.nextRequired,
    clients: [...browserNetworkRelayRuntime.clients],
    sent: browserNetworkRelayRuntime.sent,
    delivered: browserNetworkRelayRuntime.delivered,
    received: browserNetworkRelayRuntime.received,
    bytes: browserNetworkRelayRuntime.bytes,
    packets: [...browserNetworkRelayRuntime.packets],
    eventLog: [...browserNetworkRelayRuntime.eventLog],
    lastEvent: browserNetworkRelayRuntime.lastEvent,
    lastError: browserNetworkRelayRuntime.lastError,
  };
}

function resetBrowserNetworkTransportRuntime() {
  browserNetworkTransportRuntime.sent = 0;
  browserNetworkTransportRuntime.delivered = 0;
  browserNetworkTransportRuntime.received = 0;
  browserNetworkTransportRuntime.bytes = 0;
  browserNetworkTransportRuntime.packets = [];
  browserNetworkTransportRuntime.eventLog = [];
  browserNetworkTransportRuntime.lastEvent = null;
  browserNetworkTransportRuntime.lastError = null;
  browserNetworkTransportRuntime.transportInjected = false;
  browserNetworkTransportRuntime.connectionManagerDriven = false;
  browserNetworkTransportRuntime.frameDataReady = false;
}

function summarizeBrowserNetworkTransportRuntime() {
  return {
    source: browserNetworkTransportRuntime.source,
    ready: browserNetworkTransportRuntime.received > 0 && browserNetworkTransportRuntime.frameDataReady,
    browserTransport: browserNetworkTransportRuntime.browserTransport,
    productionTransport: browserNetworkTransportRuntime.productionTransport,
    relayTransport: browserNetworkTransportRuntime.relayTransport,
    originalSerializer: browserNetworkTransportRuntime.originalSerializer,
    originalTransport: browserNetworkTransportRuntime.originalTransport,
    originalRelay: browserNetworkTransportRuntime.originalRelay,
    originalFrameData: browserNetworkTransportRuntime.originalFrameData,
    nextRequired: browserNetworkTransportRuntime.nextRequired,
    clients: [...browserNetworkTransportRuntime.clients],
    sent: browserNetworkTransportRuntime.sent,
    delivered: browserNetworkTransportRuntime.delivered,
    received: browserNetworkTransportRuntime.received,
    bytes: browserNetworkTransportRuntime.bytes,
    packets: [...browserNetworkTransportRuntime.packets],
    eventLog: [...browserNetworkTransportRuntime.eventLog],
    lastEvent: browserNetworkTransportRuntime.lastEvent,
    lastError: browserNetworkTransportRuntime.lastError,
    transportInjected: browserNetworkTransportRuntime.transportInjected,
    connectionManagerDriven: browserNetworkTransportRuntime.connectionManagerDriven,
    frameDataReady: browserNetworkTransportRuntime.frameDataReady,
  };
}

function resetBrowserUdpEndpointRuntime({ enabled = false } = {}) {
  if (browserUdpEndpointRuntime.socket) {
    try {
      browserUdpEndpointRuntime.socket.close();
    } catch {
      // Ignore close errors while resetting a test-owned endpoint.
    }
  }
  browserUdpEndpointRuntime.enabled = enabled;
  browserUdpEndpointRuntime.connected = false;
  browserUdpEndpointRuntime.client = null;
  browserUdpEndpointRuntime.url = null;
  browserUdpEndpointRuntime.socket = null;
  browserUdpEndpointRuntime.incoming = [];
  browserUdpEndpointRuntime.sent = 0;
  browserUdpEndpointRuntime.received = 0;
  browserUdpEndpointRuntime.delivered = 0;
  browserUdpEndpointRuntime.sentBytes = 0;
  browserUdpEndpointRuntime.receivedBytes = 0;
  browserUdpEndpointRuntime.deliveredBytes = 0;
  browserUdpEndpointRuntime.lastSent = null;
  browserUdpEndpointRuntime.lastReceived = null;
  browserUdpEndpointRuntime.lastDelivered = null;
  browserUdpEndpointRuntime.eventLog = [];
  browserUdpEndpointRuntime.lastError = null;
}

function summarizeBrowserUdpEndpointRuntime() {
  return {
    source: browserUdpEndpointRuntime.source,
    ready: browserUdpEndpointRuntime.enabled
      && browserUdpEndpointRuntime.connected
      && browserUdpEndpointRuntime.delivered > 0,
    browserTransport: browserUdpEndpointRuntime.browserTransport,
    productionTransport: browserUdpEndpointRuntime.productionTransport,
    relayTransport: browserUdpEndpointRuntime.relayTransport,
    enabled: browserUdpEndpointRuntime.enabled,
    connected: browserUdpEndpointRuntime.connected,
    client: browserUdpEndpointRuntime.client,
    url: browserUdpEndpointRuntime.url,
    queuedIncoming: browserUdpEndpointRuntime.incoming.length,
    sent: browserUdpEndpointRuntime.sent,
    received: browserUdpEndpointRuntime.received,
    delivered: browserUdpEndpointRuntime.delivered,
    sentBytes: browserUdpEndpointRuntime.sentBytes,
    receivedBytes: browserUdpEndpointRuntime.receivedBytes,
    deliveredBytes: browserUdpEndpointRuntime.deliveredBytes,
    lastSent: browserUdpEndpointRuntime.lastSent,
    lastReceived: browserUdpEndpointRuntime.lastReceived,
    lastDelivered: browserUdpEndpointRuntime.lastDelivered,
    eventLog: [...browserUdpEndpointRuntime.eventLog],
    lastError: browserUdpEndpointRuntime.lastError,
  };
}

function browserUdpWireSummary(bytes, ip, port) {
  return {
    bytes: bytes.byteLength,
    hexPrefix: hexPrefix(bytes),
    ip,
    port,
  };
}

function cncPortBrowserUdpSend({ bytes, ip, port }) {
  if (!browserUdpEndpointRuntime.enabled) {
    return 0;
  }
  const socket = browserUdpEndpointRuntime.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    browserUdpEndpointRuntime.lastError = "browser UDP WebSocket endpoint is not open";
    return -7;
  }
  const datagram = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  socket.send(datagram);
  browserUdpEndpointRuntime.sent += 1;
  browserUdpEndpointRuntime.sentBytes += datagram.byteLength;
  browserUdpEndpointRuntime.lastSent = browserUdpWireSummary(datagram, ip >>> 0, port & 0xffff);
  browserUdpEndpointRuntime.eventLog.push({
    phase: "udp-write-websocket-send",
    client: browserUdpEndpointRuntime.client,
    ...browserUdpEndpointRuntime.lastSent,
  });
  browserUdpEndpointRuntime.lastError = null;
  return datagram.byteLength;
}

function cncPortBrowserUdpRecv({ capacity }) {
  if (!browserUdpEndpointRuntime.enabled) {
    return null;
  }
  const datagram = browserUdpEndpointRuntime.incoming.shift();
  if (!datagram) {
    return null;
  }
  if (datagram.bytes.byteLength > capacity) {
    browserUdpEndpointRuntime.lastError = "browser UDP incoming datagram exceeds wasm receive capacity";
    return null;
  }
  browserUdpEndpointRuntime.delivered += 1;
  browserUdpEndpointRuntime.deliveredBytes += datagram.bytes.byteLength;
  browserUdpEndpointRuntime.lastDelivered = browserUdpWireSummary(datagram.bytes, datagram.ip, datagram.port);
  browserUdpEndpointRuntime.eventLog.push({
    phase: "udp-read-websocket-deliver",
    client: browserUdpEndpointRuntime.client,
    ...browserUdpEndpointRuntime.lastDelivered,
  });
  browserUdpEndpointRuntime.lastError = null;
  return datagram;
}

function connectBrowserUdpEndpoint({ webSocketUrl, client, incomingIp, incomingPort }) {
  if (typeof webSocketUrl !== "string" || webSocketUrl.length === 0) {
    throw new Error("browser UDP endpoint requires a WebSocket URL");
  }
  resetBrowserUdpEndpointRuntime({ enabled: true });
  browserUdpEndpointRuntime.client = client ?? "browser-udp-client";
  browserUdpEndpointRuntime.url = webSocketUrl;
  browserUdpEndpointRuntime.defaultIncomingIp = Number.isFinite(Number(incomingIp))
    ? Number(incomingIp) >>> 0
    : 0x7f000001;
  browserUdpEndpointRuntime.defaultIncomingPort = Number.isFinite(Number(incomingPort))
    ? Number(incomingPort) & 0xffff
    : 8088;

  return new Promise((resolveConnect, rejectConnect) => {
    const socket = new WebSocket(webSocketUrl);
    const timeout = setTimeout(() => {
      browserUdpEndpointRuntime.lastError = "timed out opening browser UDP WebSocket endpoint";
      socket.close();
      rejectConnect(new Error(browserUdpEndpointRuntime.lastError));
    }, 5000);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      clearTimeout(timeout);
      browserUdpEndpointRuntime.socket = socket;
      browserUdpEndpointRuntime.connected = true;
      browserUdpEndpointRuntime.eventLog.push({
        phase: "udp-websocket-open",
        client: browserUdpEndpointRuntime.client,
        url: webSocketUrl,
      });
      resolveConnect(summarizeBrowserUdpEndpointRuntime());
    };
    socket.onmessage = (event) => {
      const bytes = new Uint8Array(event.data);
      const datagram = {
        bytes,
        ip: browserUdpEndpointRuntime.defaultIncomingIp,
        port: browserUdpEndpointRuntime.defaultIncomingPort,
      };
      browserUdpEndpointRuntime.incoming.push(datagram);
      browserUdpEndpointRuntime.received += 1;
      browserUdpEndpointRuntime.receivedBytes += bytes.byteLength;
      browserUdpEndpointRuntime.lastReceived = browserUdpWireSummary(datagram.bytes, datagram.ip, datagram.port);
      browserUdpEndpointRuntime.eventLog.push({
        phase: "udp-websocket-receive",
        client: browserUdpEndpointRuntime.client,
        ...browserUdpEndpointRuntime.lastReceived,
      });
      browserUdpEndpointRuntime.lastError = null;
    };
    socket.onerror = () => {
      browserUdpEndpointRuntime.lastError = "browser UDP WebSocket endpoint error";
      clearTimeout(timeout);
      rejectConnect(new Error(browserUdpEndpointRuntime.lastError));
    };
    socket.onclose = () => {
      browserUdpEndpointRuntime.connected = false;
      browserUdpEndpointRuntime.eventLog.push({
        phase: "udp-websocket-close",
        client: browserUdpEndpointRuntime.client,
      });
    };
  });
}

function resetBrowserLanApiRuntime() {
  browserLanApiRuntime.sent = 0;
  browserLanApiRuntime.delivered = 0;
  browserLanApiRuntime.received = 0;
  browserLanApiRuntime.bytes = 0;
  browserLanApiRuntime.packets = [];
  browserLanApiRuntime.eventLog = [];
  browserLanApiRuntime.lastEvent = null;
  browserLanApiRuntime.lastError = null;
  browserLanApiRuntime.transportInjected = false;
  browserLanApiRuntime.lanApiUpdated = false;
  browserLanApiRuntime.gameListRecorded = false;
}

function summarizeBrowserLanApiRuntime() {
  return {
    source: browserLanApiRuntime.source,
    ready: browserLanApiRuntime.received > 0 && browserLanApiRuntime.gameListRecorded,
    browserTransport: browserLanApiRuntime.browserTransport,
    productionTransport: browserLanApiRuntime.productionTransport,
    relayTransport: browserLanApiRuntime.relayTransport,
    originalSerializer: browserLanApiRuntime.originalSerializer,
    originalTransport: browserLanApiRuntime.originalTransport,
    originalDispatch: browserLanApiRuntime.originalDispatch,
    originalHandler: browserLanApiRuntime.originalHandler,
    originalParser: browserLanApiRuntime.originalParser,
    originalCallback: browserLanApiRuntime.originalCallback,
    nextRequired: browserLanApiRuntime.nextRequired,
    clients: [...browserLanApiRuntime.clients],
    sent: browserLanApiRuntime.sent,
    delivered: browserLanApiRuntime.delivered,
    received: browserLanApiRuntime.received,
    bytes: browserLanApiRuntime.bytes,
    packets: [...browserLanApiRuntime.packets],
    eventLog: [...browserLanApiRuntime.eventLog],
    lastEvent: browserLanApiRuntime.lastEvent,
    lastError: browserLanApiRuntime.lastError,
    transportInjected: browserLanApiRuntime.transportInjected,
    lanApiUpdated: browserLanApiRuntime.lanApiUpdated,
    gameListRecorded: browserLanApiRuntime.gameListRecorded,
  };
}

function relayBrowserNetworkPacket(buildProbe, runtime = browserNetworkRelayRuntime) {
  const packet = buildProbe?.packet ?? {};
  const packetHex = String(packet.hex ?? "");
  const bytes = Number(packet.bytes ?? 0);
  if (!buildProbe?.ok || packetHex.length === 0 || bytes <= 0 || packetHex.length !== bytes * 2) {
    throw new Error(`original network build probe did not produce a relay payload: ${JSON.stringify(buildProbe)}`);
  }

  const event = {
    from: runtime.clients[0],
    to: runtime.clients[1],
    phase: "relay-deliver",
    packetHex,
    bytes,
    commands: packet.commands,
    commandType: packet.commandType,
    messageType: packet.messageType,
    relay: packet.relay,
    executionFrame: packet.executionFrame,
    playerId: packet.playerId,
    commandId: packet.commandId,
    frameCommandCount: packet.frameCommandCount,
    runAheadCommandId: packet.runAheadCommandId,
    runAhead: packet.runAhead,
    frameRate: packet.frameRate,
    gameName: packet.gameName,
    optionsLength: packet.optionsLength,
  };

  runtime.sent += 1;
  runtime.delivered += 1;
  runtime.bytes += bytes;
  runtime.packets.push({
    from: event.from,
    to: event.to,
    bytes,
    commands: event.commands,
    commandType: event.commandType,
    messageType: event.messageType,
    relay: event.relay,
    executionFrame: event.executionFrame,
    playerId: event.playerId,
    commandId: event.commandId,
    frameCommandCount: event.frameCommandCount,
    runAheadCommandId: event.runAheadCommandId,
    runAhead: event.runAhead,
    frameRate: event.frameRate,
    gameName: event.gameName,
    optionsLength: event.optionsLength,
  });
  runtime.eventLog.push(
    { phase: "wasm-build", client: event.from, serializer: buildProbe.originalSerializer, bytes },
    { phase: "relay-send", from: event.from, to: event.to, bytes },
    { phase: "relay-deliver", to: event.to, bytes },
  );
  runtime.lastEvent = event;
  return event;
}

function resetBrowserMssSamplePlaybackRuntime() {
  browserMssSamplePlaybackRuntime.resetGeneration += 1;
  for (const entry of browserMssSamplePlaybackRuntime.activeSources.values()) {
    try {
      entry.source.stop();
    } catch {
      // Already ended or never started; reset still owns cleanup.
    }
    try {
      entry.source.disconnect();
    } catch {
      // Some browsers disconnect completed source nodes automatically.
    }
  }
  browserMssSamplePlaybackRuntime.started = 0;
  browserMssSamplePlaybackRuntime.completed = 0;
  browserMssSamplePlaybackRuntime.stopped = 0;
  browserMssSamplePlaybackRuntime.ended = 0;
  browserMssSamplePlaybackRuntime.released = 0;
  browserMssSamplePlaybackRuntime.activeSources.clear();
  browserMssSamplePlaybackRuntime.pendingCompletions.clear();
  browserMssSamplePlaybackRuntime.lastEvent = null;
  browserMssSamplePlaybackRuntime.eventLog = [];
  browserMssSamplePlaybackRuntime.lastError = null;
}

function summarizeBrowserMssSamplePlaybackRuntime() {
  return {
    source: browserMssSamplePlaybackRuntime.source,
    decodedCache: summarizeDecodedSampleCache(),
    ready:
      browserAudioRuntime.context?.state === "running" &&
      browserAudioMixerRuntime.created === true,
    runtimePlayback: browserMssSamplePlaybackRuntime.completed > 0,
    engineDriven: false,
    mssDriven: true,
    nextRequired: "realMilesAudioManagerSamplePlayback",
    nodeGraph: [
      "AudioBufferSourceNode",
      "GainNode",
      "StereoPannerNode",
      "soundGainNode",
      "AudioDestinationNode",
    ],
    started: browserMssSamplePlaybackRuntime.started,
    completed: browserMssSamplePlaybackRuntime.completed,
    stopped: browserMssSamplePlaybackRuntime.stopped,
    ended: browserMssSamplePlaybackRuntime.ended,
    released: browserMssSamplePlaybackRuntime.released,
    activeSources: browserMssSamplePlaybackRuntime.activeSources.size,
    lastEvent: browserMssSamplePlaybackRuntime.lastEvent,
    eventLog: [...browserMssSamplePlaybackRuntime.eventLog],
    lastError: browserMssSamplePlaybackRuntime.lastError,
  };
}

function summarizeBrowserMss3DSamplePlaybackRuntime() {
  return {
    source: "MSS 3D sample Web Audio backend proof",
    ready:
      browserAudioRuntime.context?.state === "running" &&
      browserAudioMixerRuntime.created === true,
    runtimePlayback: browserMss3DSamplePlaybackRuntime.started > 0,
    engineDriven: false,
    mssDriven: true,
    nextRequired: "realMilesAudioManager3DSamplePlayback",
    nodeGraph: [
      "AudioBufferSourceNode",
      "GainNode",
      "PannerNode(HRTF)",
      "sound3DGainNode",
      "AudioDestinationNode",
    ],
    started: browserMss3DSamplePlaybackRuntime.started,
    stopped: browserMss3DSamplePlaybackRuntime.stopped,
    ended: browserMss3DSamplePlaybackRuntime.ended,
    released: browserMss3DSamplePlaybackRuntime.released,
    listenerUpdates: browserMss3DSamplePlaybackRuntime.listenerUpdates,
    listenerAppliedUpdates: browserMss3DSamplePlaybackRuntime.listenerAppliedUpdates,
    samplePositionUpdates: browserMss3DSamplePlaybackRuntime.samplePositionUpdates,
    samplePositionAppliedUpdates: browserMss3DSamplePlaybackRuntime.samplePositionAppliedUpdates,
    activeSources: browserMss3DSamplePlaybackRuntime.activeSources.size,
    lastListener: browserMss3DSamplePlaybackRuntime.lastListener,
    lastSamplePosition: browserMss3DSamplePlaybackRuntime.lastSamplePosition,
    lastIgnoredUpdate: browserMss3DSamplePlaybackRuntime.lastIgnoredUpdate,
    recentSamplePositions: [...browserMss3DSamplePlaybackRuntime.recentSamplePositions],
    lastEvent: browserMss3DSamplePlaybackRuntime.lastEvent,
    eventLog: [...browserMss3DSamplePlaybackRuntime.eventLog],
    lastError: browserMss3DSamplePlaybackRuntime.lastError,
  };
}

function summarizeBrowserMssStreamPlaybackRuntime() {
  return {
    source: browserMssStreamPlaybackRuntime.source,
    ready:
      browserAudioRuntime.context?.state === "running" &&
      browserAudioMixerRuntime.created === true,
    runtimePlayback: browserMssStreamPlaybackRuntime.scheduled > 0,
    engineDriven: false,
    mssDriven: true,
    nextRequired: "realMilesAudioManagerStreamPlayback",
    nodeGraph: [
      "AudioBufferSourceNode",
      "GainNode",
      "musicGainNode",
      "AudioDestinationNode",
    ],
    started: browserMssStreamPlaybackRuntime.started,
    decoded: browserMssStreamPlaybackRuntime.decoded,
    scheduled: browserMssStreamPlaybackRuntime.scheduled,
    stopped: browserMssStreamPlaybackRuntime.stopped,
    ended: browserMssStreamPlaybackRuntime.ended,
    volumeUpdates: browserMssStreamPlaybackRuntime.volumeUpdates,
    activeSources: browserMssStreamPlaybackRuntime.activeSources.size,
    activeStreamHandles: [...browserMssStreamPlaybackRuntime.activeSources.keys()],
    pendingStarts: browserMssStreamPlaybackRuntime.pendingStarts?.size ?? 0,
    musicSourceActive: browserMssStreamPlaybackRuntime.musicSourceActive ?? false,
    lastEvent: browserMssStreamPlaybackRuntime.lastEvent,
    lastVolumeUpdate: browserMssStreamPlaybackRuntime.lastVolumeUpdate,
    eventLog: [...browserMssStreamPlaybackRuntime.eventLog],
    lastError: browserMssStreamPlaybackRuntime.lastError,
    lastArchiveError: browserMssStreamPlaybackRuntime.lastArchiveError,
  };
}

function mssSampleWaveRange(payload, heapu8) {
  const dataPtr = Number(payload?.dataPtr ?? 0) >>> 0;
  if (!dataPtr || !(heapu8 instanceof Uint8Array)) {
    throw new Error("MSS sample payload pointer is unavailable");
  }
  if (dataPtr + 12 > heapu8.byteLength) {
    throw new Error(`MSS sample payload pointer is outside wasm memory: ${dataPtr}`);
  }
  const riffSize = readU32LE(heapu8, dataPtr + 4) + 8;
  // Decoded IMA ADPCM payloads expand ~4x, so allow multi-megabyte PCM WAVs.
  if (riffSize < 44 || riffSize > 64 * 1024 * 1024 || dataPtr + riffSize > heapu8.byteLength) {
    throw new Error(`MSS sample RIFF size is invalid: ${riffSize}`);
  }
  return { dataPtr, riffSize };
}

function readMssSampleWaveBytes(payload, heapu8) {
  const { dataPtr, riffSize } = mssSampleWaveRange(payload, heapu8);
  return heapu8.slice(dataPtr, dataPtr + riffSize);
}

// Decoded-sample cache: gameplay replays the same SFX payloads constantly
// (gunfire, unit voices, UI clicks). Re-running the JS WAV decode and
// int16->float conversion on every AIL_start_sample burned ~0.7MB of garbage
// plus main-thread CPU per start (measured on M4/Metal); AudioBuffers are
// immutable and safely shared across AudioBufferSourceNodes, so decode each
// payload once and reuse the buffer. The C++ Miles shim mallocs a FRESH
// PCM payload buffer per start (its ADPCM->PCM expansion), so the heap
// pointer cannot be part of the key; key on size + a strided content
// fingerprint instead. Head/tail-only hashing is not enough either — WAV
// payloads routinely start and end in silence (all zero bytes) — so sample
// 64 evenly spaced 4-byte windows across the whole payload.
const cncPortDecodedSampleCache = new Map();
let cncPortDecodedSampleCacheBytes = 0;
const CNC_PORT_DECODED_SAMPLE_CACHE_MAX_BYTES = 96 * 1024 * 1024;
const cncPortDecodedSampleCacheStats = { hits: 0, misses: 0, evictions: 0, dedupeMisses: 0 };

// Threaded-mode dedupe handshake: the ENGINE realm forwards sample-start
// payloads with a content cacheKey and skips the byte copy once main has the
// decoded entry. When main drops a key (LRU eviction, or a start that failed
// before caching), it must tell the worker so the next start re-sends bytes.
// Installed by the threaded controller; null (no-op) in non-threaded mode.
let cncPortMssCacheDropNotifier = null;
function notifyMssCacheDrop(keys) {
  if (cncPortMssCacheDropNotifier && keys.length > 0) {
    try {
      cncPortMssCacheDropNotifier(keys);
    } catch (_error) {
      // Port gone — the worker will simply keep sending key-only starts,
      // each of which re-notifies here.
    }
  }
}

function summarizeDecodedSampleCache() {
  return {
    entries: cncPortDecodedSampleCache.size,
    decodedFloatBytes: cncPortDecodedSampleCacheBytes,
    hits: cncPortDecodedSampleCacheStats.hits,
    misses: cncPortDecodedSampleCacheStats.misses,
    evictions: cncPortDecodedSampleCacheStats.evictions,
    dedupeMisses: cncPortDecodedSampleCacheStats.dedupeMisses,
  };
}

function mssSampleCacheKey(heapu8, dataPtr, riffSize) {
  let hash = 0x811c9dc5;
  const headEnd = dataPtr + Math.min(64, riffSize);
  for (let i = dataPtr; i < headEnd; i += 1) {
    hash = Math.imul(hash ^ heapu8[i], 0x01000193);
  }
  const windows = 64;
  const stride = Math.max(4, Math.floor(riffSize / windows));
  for (let offset = 64; offset + 4 <= riffSize; offset += stride) {
    const base = dataPtr + offset;
    hash = Math.imul(hash ^ heapu8[base], 0x01000193);
    hash = Math.imul(hash ^ heapu8[base + 1], 0x01000193);
    hash = Math.imul(hash ^ heapu8[base + 2], 0x01000193);
    hash = Math.imul(hash ^ heapu8[base + 3], 0x01000193);
  }
  return `${riffSize}:${hash >>> 0}`;
}

function getOrDecodeMssSampleBuffer(context, payload, heapu8) {
  // Threaded transport key: the engine realm computed the SAME content key
  // over the same bytes (engine_realm_boot.mjs) — trust it both for lookup
  // and as the insert key so the two sides can never diverge.
  const transportKey = typeof payload?.cacheKey === "string" ? payload.cacheKey : null;
  if (transportKey) {
    const cached = cncPortDecodedSampleCache.get(transportKey);
    if (cached) {
      cncPortDecodedSampleCache.delete(transportKey);
      cncPortDecodedSampleCache.set(transportKey, cached);
      cached.plays += 1;
      cncPortDecodedSampleCacheStats.hits += 1;
      return cached;
    }
    if (!Number(payload?.dataPtr ?? 0)) {
      // Key-only start (worker skipped the byte copy) after this side evicted
      // the entry: notify the drop so the next start re-sends bytes. This one
      // play is skipped — evictions target least-recently-used entries, so a
      // just-replayed sample is essentially never the victim.
      cncPortDecodedSampleCacheStats.dedupeMisses += 1;
      notifyMssCacheDrop([transportKey]);
      throw new Error(`MSS dedupe miss: decoded cache no longer holds ${transportKey}`);
    }
  }
  const { dataPtr, riffSize } = mssSampleWaveRange(payload, heapu8);
  const key = transportKey ?? mssSampleCacheKey(heapu8, dataPtr, riffSize);
  let entry = cncPortDecodedSampleCache.get(key);
  if (entry) {
    // Map preserves insertion order; re-insert to keep LRU eviction honest.
    cncPortDecodedSampleCache.delete(key);
    cncPortDecodedSampleCache.set(key, entry);
    entry.plays += 1;
    cncPortDecodedSampleCacheStats.hits += 1;
    return entry;
  }
  cncPortDecodedSampleCacheStats.misses += 1;
  const bytes = heapu8.slice(dataPtr, dataPtr + riffSize);
  const decoded = decodeAudioWavPayload(bytes);
  const decodedFrames = Math.floor(decoded.samples.length / decoded.info.channels);
  const audioBuffer = createWebAudioBufferFromDecoded(context, {
    info: decoded.info,
    samples: decoded.samples,
    decodedFrames,
  });
  entry = {
    audioBuffer,
    info: decoded.info,
    decodedFrames,
    payloadBytes: riffSize,
    decodedFloatBytes: audioBufferDecodedFloatBytes(audioBuffer),
    // The full-pass sample stats are diagnostics; computing them once at
    // decode time keeps repeated plays from paying the extra pass.
    stats: summarizeDecodedSamples(decoded.samples),
    plays: 1,
  };
  cncPortDecodedSampleCache.set(key, entry);
  cncPortDecodedSampleCacheBytes += entry.decodedFloatBytes;
  const evictedKeys = [];
  while (cncPortDecodedSampleCacheBytes > CNC_PORT_DECODED_SAMPLE_CACHE_MAX_BYTES
      && cncPortDecodedSampleCache.size > 1) {
    const oldest = cncPortDecodedSampleCache.entries().next().value;
    cncPortDecodedSampleCache.delete(oldest[0]);
    cncPortDecodedSampleCacheBytes -= oldest[1].decodedFloatBytes;
    cncPortDecodedSampleCacheStats.evictions += 1;
    evictedKeys.push(oldest[0]);
  }
  if (evictedKeys.length > 0) {
    notifyMssCacheDrop(evictedKeys);
  }
  return entry;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

// Route a Web Audio "playback finished" signal back into the C++ engine so the
// Miles end-of-sample / end-of-stream callback fires. The real MilesAudioManager
// relies on that callback to return the 2D/3D voice handle to the free pool,
// clear the disallow-speech latch, and advance/loop the event. Without this the
// sample pools exhaust after one use (SFX/unit voices stop mixing) and speech is
// permanently blocked. `fnName` is the exported completion entry point.
//
// Only `cwrap` (not `ccall`) is on the exported runtime methods list, so the
// wrappers are built via cwrap and cached per function name.
const cncPortAudioCompletionWrappers = new Map(); // fnName -> cwrapped fn
function notifyEngineAudioCompleted(fnName, handle) {
  if (cncPortThreadedMode) {
    // The completion export touches engine state — it must run on the engine
    // thread. Fire-and-forget through the realm-port engine-call primitive.
    notifyEngineAudioCompletedThreaded(fnName, handle);
    return;
  }
  const module = cncPortEmscriptenModule;
  if (!module || typeof module.cwrap !== "function") {
    return;
  }
  const numericHandle = Number(handle) >>> 0;
  if (!numericHandle) {
    return;
  }
  try {
    let wrapper = cncPortAudioCompletionWrappers.get(fnName);
    if (!wrapper) {
      wrapper = module.cwrap(fnName, null, ["number"]);
      cncPortAudioCompletionWrappers.set(fnName, wrapper);
    }
    wrapper(numericHandle);
  } catch (error) {
    console.error(`${fnName} failed`, error);
  }
}

function cncPortMssSampleStart(payload, heapu8) {
  const context = browserAudioRuntime.context;
  if (!context || context.state !== "running") {
    browserMssSamplePlaybackRuntime.lastError = "AudioContext is not running";
    return false;
  }
  const mixer = ensureBrowserAudioMixerRuntime();
  if (!mixer) {
    browserMssSamplePlaybackRuntime.lastError = browserAudioMixerRuntime.lastError;
    return false;
  }
  const busNode = mixer.busNodes?.sound ?? null;
  if (!busNode) {
    browserMssSamplePlaybackRuntime.lastError = "missing browser audio mixer sound bus";
    return false;
  }

  try {
    const sample = getOrDecodeMssSampleBuffer(context, payload, heapu8);
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = typeof context.createStereoPanner === "function"
      ? context.createStereoPanner()
      : null;
    const volume = clamp01(Number(payload.volumeFloat ?? 1));
    const panFloat = clamp01(Number(payload.panFloat ?? 0.5));
    const pan = Number(((panFloat * 2) - 1).toFixed(6));
    gain.gain.value = volume;
    if (panner) {
      panner.pan.value = pan;
    }
    source.buffer = sample.audioBuffer;
    source.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(busNode);
    } else {
      gain.connect(busNode);
    }

    const handle = Number(payload.handle ?? 0);
    const generation = browserMssSamplePlaybackRuntime.resetGeneration;
    const event = {
      handle,
      phase: "start",
      webAudioNode: "AudioBufferSourceNode",
      payload: {
        container: "RIFF/WAVE",
        codec: sample.info.codec,
        bytes: sample.payloadBytes,
        dataBytes: sample.info.dataBytes,
        frames: sample.decodedFrames,
        sampleRate: sample.info.samplesPerSec,
        channels: sample.info.channels,
        bitsPerSample: sample.info.bitsPerSample,
        stats: sample.stats,
      },
      sample: {
        volume,
        panFloat,
        stereoPan: pan,
        playbackRate: Number(payload.playbackRate ?? sample.info.samplesPerSec),
        loopCount: Number(payload.loopCount ?? 1),
        msPosition: Number(payload.msPosition ?? 0),
      },
      startSeconds: Number(context.currentTime.toFixed(6)),
      durationSeconds: Number(source.buffer.duration.toFixed(6)),
      nodeGraph: panner
        ? ["AudioBufferSourceNode", "GainNode", "StereoPannerNode", "soundGainNode", "AudioDestinationNode"]
        : ["AudioBufferSourceNode", "GainNode", "soundGainNode", "AudioDestinationNode"],
    };

    const activeEntry = { source, gain, panner, stoppedByEngine: false };
    const completion = new Promise((resolve) => {
      source.onended = () => {
        try {
          source.disconnect();
        } catch {
          // Source may already be disconnected.
        }
        if (generation !== browserMssSamplePlaybackRuntime.resetGeneration) {
          resolve({ handle, phase: "completed", ignoredAfterReset: true });
          return;
        }
        const engineStopped = activeEntry.stoppedByEngine;
        // Clean up this source's bookkeeping BEFORE notifying the engine. The
        // engine's completion path may synchronously re-play the same handle
        // (attack->sound->decay portions, looping sounds) which reinstalls a
        // fresh activeSources entry for this handle; deleting only when the
        // stored entry is still ours avoids clobbering that new playback.
        if (browserMssSamplePlaybackRuntime.activeSources.get(handle) === activeEntry) {
          browserMssSamplePlaybackRuntime.activeSources.delete(handle);
        }
        browserMssSamplePlaybackRuntime.pendingCompletions.delete(handle);
        browserMssSamplePlaybackRuntime.completed += 1;
        const ended = {
          handle,
          phase: "completed",
          callback: "AudioBufferSourceNode.onended",
          order: browserMssSamplePlaybackRuntime.completed,
        };
        browserMssSamplePlaybackRuntime.eventLog.push(ended);
        browserMssSamplePlaybackRuntime.lastEvent = { ...event, completion: ended };
        browserMssSamplePlaybackRuntime.lastError = null;
        // Natural end-of-buffer (not an engine-initiated stop/release): fire the
        // Miles EOS callback so the engine frees this 2D voice handle. Done last
        // so any re-play it triggers installs cleanly over the cleared entry.
        if (!engineStopped) {
          notifyEngineAudioCompleted("cnc_port_mss_complete_sample", handle);
        }
        resolve(ended);
      };
    });

    browserMssSamplePlaybackRuntime.started += 1;
    browserMssSamplePlaybackRuntime.eventLog.push(
      { handle, phase: "AIL_start_sample", node: "AudioBufferSourceNode" },
      { handle, phase: "webAudioStart", volume, stereoPan: pan },
    );
    browserMssSamplePlaybackRuntime.lastEvent = event;
    browserMssSamplePlaybackRuntime.activeSources.set(handle, activeEntry);
    browserMssSamplePlaybackRuntime.pendingCompletions.set(handle, completion);
    source.start(context.currentTime);
    return true;
  } catch (error) {
    browserMssSamplePlaybackRuntime.lastError = error?.message ?? String(error);
    return false;
  }
}

function cncPortMssSampleStop(payload) {
  const handle = Number(payload?.handle ?? 0);
  const entry = browserMssSamplePlaybackRuntime.activeSources.get(handle);
  if (!entry) {
    return false;
  }
  browserMssSamplePlaybackRuntime.stopped += 1;
  browserMssSamplePlaybackRuntime.eventLog.push({ handle, phase: "AIL_stop_sample" });
  // Engine-initiated stop: the engine already owns the completion of this voice,
  // so suppress the natural-end completion callback in onended.
  entry.stoppedByEngine = true;
  try {
    entry.source.stop();
  } catch {
    // Already ended; the C++ state machine still records the stop request.
  }
  return true;
}

function cncPortMssSampleEnd(payload) {
  const handle = Number(payload?.handle ?? 0);
  browserMssSamplePlaybackRuntime.ended += 1;
  browserMssSamplePlaybackRuntime.eventLog.push({ handle, phase: "AIL_end_sample" });
  return true;
}

function cncPortMssSampleRelease(payload) {
  const handle = Number(payload?.handle ?? 0);
  browserMssSamplePlaybackRuntime.released += 1;
  browserMssSamplePlaybackRuntime.eventLog.push({ handle, phase: "AIL_release_sample_handle" });
  return true;
}

// ---- 3D sample Web Audio handlers (positioned unit sounds) ----

function finiteAudioCoordinate(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function audioContextTime(context) {
  const value = Number(context?.currentTime ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function setWebAudioPosition(target, position, time = 0) {
  const next = {
    x: finiteAudioCoordinate(position?.x),
    y: finiteAudioCoordinate(position?.y),
    z: finiteAudioCoordinate(position?.z),
  };
  if (target?.positionX && target?.positionY && target?.positionZ) {
    setAudioParamValue(target, "positionX", next.x, time);
    setAudioParamValue(target, "positionY", next.y, time);
    setAudioParamValue(target, "positionZ", next.z, time);
  } else if (target && typeof target.setPosition === "function") {
    target.setPosition(next.x, next.y, next.z);
  }
  return next;
}

function setWebAudioListenerOrientation(listener, orientation, time = 0) {
  const next = {
    frontX: finiteAudioCoordinate(orientation?.frontX),
    frontY: finiteAudioCoordinate(orientation?.frontY, 1),
    frontZ: finiteAudioCoordinate(orientation?.frontZ),
    upX: finiteAudioCoordinate(orientation?.upX),
    upY: finiteAudioCoordinate(orientation?.upY),
    upZ: finiteAudioCoordinate(orientation?.upZ, -1),
  };
  if (listener?.forwardX && listener?.forwardY && listener?.forwardZ &&
      listener?.upX && listener?.upY && listener?.upZ) {
    setAudioParamValue(listener, "forwardX", next.frontX, time);
    setAudioParamValue(listener, "forwardY", next.frontY, time);
    setAudioParamValue(listener, "forwardZ", next.frontZ, time);
    setAudioParamValue(listener, "upX", next.upX, time);
    setAudioParamValue(listener, "upY", next.upY, time);
    setAudioParamValue(listener, "upZ", next.upZ, time);
  } else if (listener && typeof listener.setOrientation === "function") {
    listener.setOrientation(
      next.frontX,
      next.frontY,
      next.frontZ,
      next.upX,
      next.upY,
      next.upZ,
    );
  }
  return next;
}

const browserMss3DSamplePlaybackRuntime = {
  activeSources: new Map(), // handle -> { source, gain, panner }
  pendingCompletions: new Map(), // handle -> Promise
  resetGeneration: 0,
  started: 0,
  stopped: 0,
  ended: 0,
  released: 0,
  listenerUpdates: 0,
  listenerAppliedUpdates: 0,
  samplePositionUpdates: 0,
  samplePositionAppliedUpdates: 0,
  lastListener: null,
  lastSamplePosition: null,
  lastIgnoredUpdate: null,
  recentSamplePositions: [],
  eventLog: [],
  lastEvent: null,
  lastError: null,
};

function cncPortMss3DSampleStart(payload, heapu8) {
  const context = browserAudioRuntime.context;
  if (!context || context.state !== "running") {
    browserMss3DSamplePlaybackRuntime.lastError = "AudioContext is not running";
    return false;
  }
  const mixer = ensureBrowserAudioMixerRuntime();
  if (!mixer) {
    browserMss3DSamplePlaybackRuntime.lastError = browserAudioMixerRuntime.lastError;
    return false;
  }
  const busNode = mixer.busNodes?.sound3D ?? null;
  if (!busNode) {
    browserMss3DSamplePlaybackRuntime.lastError = "missing browser audio mixer sound3D bus";
    return false;
  }

  try {
    const sample = getOrDecodeMssSampleBuffer(context, payload, heapu8);
    const source = context.createBufferSource();
    const gain = context.createGain();
    // Use PannerNode for true 3D positioning
    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = Number(payload.minDistance ?? 1.0);
    panner.maxDistance = Math.max(payload.maxDistance ?? 10.0, 1.0);
    panner.rolloffFactor = 1.0;
    // Set 3D position from Miles coordinates
    const position = setWebAudioPosition(panner, {
      x: payload.x,
      y: payload.y,
      z: payload.z,
    }, audioContextTime(context));

    const volume = clamp01(Number(payload.volumeFloat ?? ((payload.volume ?? 127) / 127)));
    gain.gain.value = volume;

    source.buffer = sample.audioBuffer;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(busNode);

    const handle = Number(payload.handle ?? 0);
    const generation = browserMss3DSamplePlaybackRuntime.resetGeneration ?? 0;
    const event = {
      handle,
      phase: "start",
      webAudioNode: "AudioBufferSourceNode",
      payload: {
        container: "RIFF/WAVE",
        codec: sample.info.codec,
        bytes: sample.payloadBytes,
        frames: sample.decodedFrames,
        sampleRate: sample.info.samplesPerSec,
        channels: sample.info.channels,
      },
      sample3D: {
        volume,
        position,
        playbackRate: Number(payload.playbackRate ?? sample.info.samplesPerSec),
        loopCount: Number(payload.loopCount ?? 1),
        minDistance: Number(payload.minDistance ?? 0),
        maxDistance: Number(payload.maxDistance ?? 10),
      },
      startSeconds: Number(context.currentTime.toFixed(6)),
      durationSeconds: Number(source.buffer.duration.toFixed(6)),
      nodeGraph: [
        "AudioBufferSourceNode",
        "GainNode",
        "PannerNode(HRTF)",
        "sound3DGainNode",
        "AudioDestinationNode",
      ],
    };

    const activeEntry = { source, gain, panner, stoppedByEngine: false };
    const completion = new Promise((resolve) => {
      source.onended = () => {
        try {
          source.disconnect();
        } catch { /* already disconnected */ }
        if (generation !== (browserMss3DSamplePlaybackRuntime.resetGeneration ?? 0)) {
          resolve({ handle, phase: "completed", ignoredAfterReset: true });
          return;
        }
        const engineStopped = activeEntry.stoppedByEngine;
        // Clean up before notifying so a synchronous engine re-play of this
        // handle (multi-portion / looping sounds) is not clobbered.
        if (browserMss3DSamplePlaybackRuntime.activeSources.get(handle) === activeEntry) {
          browserMss3DSamplePlaybackRuntime.activeSources.delete(handle);
        }
        browserMss3DSamplePlaybackRuntime.pendingCompletions.delete(handle);
        browserMss3DSamplePlaybackRuntime.ended += 1;
        browserMss3DSamplePlaybackRuntime.eventLog.push({
          handle,
          phase: "completed",
          callback: "AudioBufferSourceNode.onended",
        });
        browserMss3DSamplePlaybackRuntime.lastEvent = { ...event, completion: { handle, phase: "completed" } };
        browserMss3DSamplePlaybackRuntime.lastError = null;
        // Natural end-of-buffer: fire the Miles 3D EOS callback so the engine
        // frees this positional voice handle (done last, after cleanup).
        if (!engineStopped) {
          notifyEngineAudioCompleted("cnc_port_mss_complete_3d_sample", handle);
        }
        resolve({ handle, phase: "completed" });
      };
    });

    browserMss3DSamplePlaybackRuntime.started += 1;
    browserMss3DSamplePlaybackRuntime.eventLog.push(
      { handle, phase: "AIL_start_3D_sample", node: "AudioBufferSourceNode" },
      { handle, phase: "webAudioStart3D", volume, position },
    );
    browserMss3DSamplePlaybackRuntime.lastEvent = event;
    browserMss3DSamplePlaybackRuntime.activeSources.set(handle, activeEntry);
    browserMss3DSamplePlaybackRuntime.pendingCompletions.set(handle, completion);
    source.start(context.currentTime);
    return true;
  } catch (error) {
    browserMss3DSamplePlaybackRuntime.lastError = error?.message ?? String(error);
    return false;
  }
}

function cncPortMss3DSamplePositionUpdate(payload) {
  const handle = Number(payload?.handle ?? 0);
  const position = {
    x: payload?.x,
    y: payload?.y,
    z: payload?.z,
  };
  browserMss3DSamplePlaybackRuntime.samplePositionUpdates += 1;
  const entry = browserMss3DSamplePlaybackRuntime.activeSources.get(handle);
  if (!entry?.panner) {
    browserMss3DSamplePlaybackRuntime.lastIgnoredUpdate = {
      phase: "AIL_set_3D_position",
      handle,
      reason: "inactive-sample",
    };
    return false;
  }
  const context = browserAudioRuntime.context;
  const appliedPosition = setWebAudioPosition(
    entry.panner,
    position,
    audioContextTime(context),
  );
  browserMss3DSamplePlaybackRuntime.samplePositionAppliedUpdates += 1;
  const update = {
    sequence: browserMss3DSamplePlaybackRuntime.samplePositionAppliedUpdates,
    handle,
    position: appliedPosition,
  };
  browserMss3DSamplePlaybackRuntime.lastSamplePosition = update;
  browserMss3DSamplePlaybackRuntime.recentSamplePositions.push(update);
  if (browserMss3DSamplePlaybackRuntime.recentSamplePositions.length > 128) {
    browserMss3DSamplePlaybackRuntime.recentSamplePositions.shift();
  }
  return true;
}

function cncPortMss3DListenerUpdate(payload) {
  browserMss3DSamplePlaybackRuntime.listenerUpdates += 1;
  const context = browserAudioRuntime.context;
  if (!context?.listener) {
    browserMss3DSamplePlaybackRuntime.lastIgnoredUpdate = {
      phase: "AIL_set_3D_listener",
      handle: Number(payload?.handle ?? 0),
      reason: "audio-listener-unavailable",
    };
    return false;
  }
  const time = audioContextTime(context);
  const position = setWebAudioPosition(context.listener, {
    x: payload?.x,
    y: payload?.y,
    z: payload?.z,
  }, time);
  const orientation = setWebAudioListenerOrientation(context.listener, {
    frontX: payload?.frontX,
    frontY: payload?.frontY,
    frontZ: payload?.frontZ,
    upX: payload?.upX,
    upY: payload?.upY,
    upZ: payload?.upZ,
  }, time);
  const velocity = {
    x: finiteAudioCoordinate(payload?.velocityX),
    y: finiteAudioCoordinate(payload?.velocityY),
    z: finiteAudioCoordinate(payload?.velocityZ),
  };
  browserMss3DSamplePlaybackRuntime.listenerAppliedUpdates += 1;
  browserMss3DSamplePlaybackRuntime.lastListener = {
    handle: Number(payload?.handle ?? 0),
    position,
    orientation,
    velocity,
  };
  browserMss3DSamplePlaybackRuntime.lastError = null;
  return true;
}

function cncPortMss3DSampleStop(payload) {
  const handle = Number(payload?.handle ?? 0);
  const entry = browserMss3DSamplePlaybackRuntime.activeSources.get(handle);
  if (!entry) {
    return false;
  }
  browserMss3DSamplePlaybackRuntime.stopped += 1;
  browserMss3DSamplePlaybackRuntime.eventLog.push({ handle, phase: "AIL_stop_3D_sample" });
  // Engine-initiated stop: suppress the natural-end completion callback.
  entry.stoppedByEngine = true;
  try {
    entry.source.stop();
  } catch { /* already ended */ }
  return true;
}

function cncPortMss3DSampleEnd(payload) {
  const handle = Number(payload?.handle ?? 0);
  browserMss3DSamplePlaybackRuntime.ended += 1;
  browserMss3DSamplePlaybackRuntime.eventLog.push({ handle, phase: "AIL_end_3D_sample" });
  return true;
}

function cncPortMss3DSampleRelease(payload) {
  const handle = Number(payload?.handle ?? 0);
  browserMss3DSamplePlaybackRuntime.released += 1;
  browserMss3DSamplePlaybackRuntime.eventLog.push({ handle, phase: "AIL_release_3D_sample_handle" });
  return true;
}

// ---- Stream Web Audio handlers (music) ----

const browserMssStreamPlaybackRuntime = {
  source: "MSS stream Web Audio backend proof",
  activeSources: new Map(), // handle -> { source, gain }
  pendingStarts: new Map(), // handle -> { cancelled: bool }
  started: 0,
  decoded: 0,
  scheduled: 0,
  stopped: 0,
  ended: 0,
  volumeUpdates: 0,
  eventLog: [],
  lastEvent: null,
  lastVolumeUpdate: null,
  lastError: null,
  lastArchiveError: null,
};

function resetBrowserMssStreamPlaybackRuntime() {
  for (const active of browserMssStreamPlaybackRuntime.activeSources.values()) {
    try {
      active.source.onended = null;
      active.source.stop();
      active.source.disconnect();
    } catch {
      // Already stopped or ended.
    }
  }
  browserMssStreamPlaybackRuntime.activeSources.clear();
  browserMssStreamPlaybackRuntime.pendingStarts.clear();
  browserMssStreamPlaybackRuntime.started = 0;
  browserMssStreamPlaybackRuntime.decoded = 0;
  browserMssStreamPlaybackRuntime.scheduled = 0;
  browserMssStreamPlaybackRuntime.stopped = 0;
  browserMssStreamPlaybackRuntime.ended = 0;
  browserMssStreamPlaybackRuntime.volumeUpdates = 0;
  browserMssStreamPlaybackRuntime.musicSourceActive = false;
  browserMssStreamPlaybackRuntime.eventLog = [];
  browserMssStreamPlaybackRuntime.lastEvent = null;
  browserMssStreamPlaybackRuntime.lastVolumeUpdate = null;
  browserMssStreamPlaybackRuntime.lastError = null;
}

function cncPortMssStreamStart(payload) {
  // Kick off async load; return true immediately to keep C++ state machine happy.
  _startMssStreamAsync(payload).catch((err) => {
    browserMssStreamPlaybackRuntime.lastError = err?.message ?? String(err);
  });
  return true;
}

function cncPortMssStreamVolumePan(payload) {
  const handle = Number(payload?.handle ?? 0);
  const volume = clamp01(Number(payload.volumeFloat ?? ((payload.volume ?? 127) / 127)));
  const pan = clamp01(Number(payload.panFloat ?? 0.5));
  const update = { handle, phase: "AIL_set_stream_volume_pan", volume, pan };
  browserMssStreamPlaybackRuntime.volumeUpdates += 1;
  browserMssStreamPlaybackRuntime.lastVolumeUpdate = update;
  browserMssStreamPlaybackRuntime.eventLog.push(update);
  const active = browserMssStreamPlaybackRuntime.activeSources.get(handle);
  if (active?.gain) {
    active.gain.gain.value = volume;
    active.volume = volume;
    active.pan = pan;
  }
  return true;
}

// ---- threaded OPFS archive reads for the MSS stream path -------------------
// In threaded mode the archive bytes live on OPFS (0-byte MEMFS markers only),
// so the stream-file hunt below cannot fs.readFile them. The staged
// FileSystemSyncAccessHandle objects live in the ENGINE realm; the
// "opfsReadRange" realm command (engine_realm_boot.mjs) reads ranges there
// and transfers the bytes back. The parsed BIG directory is cached per
// archive so each stream start costs exactly one range read for the payload.
const mssStreamArchiveDirectoryCache = new Map(); // archive memfs path -> entries[]

async function opfsRealmReadRange(path, offset, length) {
  if (!threadedEngine) {
    throw new Error("opfsReadRange requires threaded mode");
  }
  const reply = await threadedEngine.sendCommand(
    { cmd: "opfsReadRange", path, offset, length },
    { timeoutMs: 120000 },
  );
  if (reply?.ok !== true) {
    throw new Error(reply?.error ?? `opfsReadRange failed for ${path}`);
  }
  return reply; // { size, bytes }
}

async function openOpfsArchiveReader(path) {
  const stat = await opfsRealmReadRange(path, 0, 0);
  return {
    size: Number(stat.size ?? 0),
    async readAt(position, length) {
      const reply = await opfsRealmReadRange(path, position, length);
      return reply.bytes instanceof Uint8Array ? reply.bytes : new Uint8Array(0);
    },
    close() {},
  };
}

function normalizeBrowserAudioLookupPath(path) {
  return String(path ?? "").replace(/[\\/]+/g, "\\").toLowerCase();
}

function browserAudioStreamBusForFilename(filename) {
  const normalized = normalizeBrowserAudioLookupPath(filename);
  if (normalized.includes("\\speech\\")) {
    return "speech";
  }
  return "music";
}

async function _startMssStreamAsync(payload) {
  const context = browserAudioRuntime.context;
  if (!context || context.state !== "running") {
    browserMssStreamPlaybackRuntime.lastError = "AudioContext is not running";
    return;
  }
  const mixer = ensureBrowserAudioMixerRuntime();
  if (!mixer) {
    browserMssStreamPlaybackRuntime.lastError = browserAudioMixerRuntime.lastError;
    return;
  }
  const filename = String(payload?.filename ?? "");
  const busName = browserAudioStreamBusForFilename(filename);
  const busNode = mixer.busNodes?.[busName] ?? mixer.busNodes?.music ?? mixer.busNodes?.sound ?? null;
  if (!busNode) {
    browserMssStreamPlaybackRuntime.lastError = "missing browser audio mixer bus";
    return;
  }

  const handle = Number(payload?.handle ?? 0);
  const volume = clamp01(Number(payload.volumeFloat ?? ((payload.volume ?? 127) / 127)));
  const loopCount = Number(payload.loopCount ?? 1);

  // Register pending start for stop-before-start race guard.
  browserMssStreamPlaybackRuntime.pendingStarts.set(handle, { cancelled: false });

  browserMssStreamPlaybackRuntime.started += 1;
  browserMssStreamPlaybackRuntime.eventLog.push(
    { handle, phase: "AIL_start_stream", filename, volume },
  );
  browserMssStreamPlaybackRuntime.lastEvent = {
    handle,
    phase: "start",
    filename,
    volume,
    loopCount,
    playbackRate: Number(payload.playbackRate ?? 44100),
  };

  // Load stream bytes from mounted BIG archives.
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    browserMssStreamPlaybackRuntime.pendingStarts.delete(handle);
    browserMssStreamPlaybackRuntime.lastError = "WASM module not available";
    return;
  }

  // Race guard: stop was called before async archive access started.
  const pending = browserMssStreamPlaybackRuntime.pendingStarts.get(handle);
  if (pending?.cancelled) {
    browserMssStreamPlaybackRuntime.pendingStarts.delete(handle);
    return;
  }

  // Search mounted audio archives for the stream file.
  const normalizedFilename = normalizeBrowserAudioLookupPath(filename);
  const entryMatchesFilename = (candidate) => {
    const c = normalizeBrowserAudioLookupPath(candidate.normalizedPath);
    return (
      c === normalizedFilename ||
      c.endsWith("\\" + normalizedFilename)
    );
  };
  let archiveBytes = null;
  let opfsPayloadBytes = null;
  let entry = null;

  for (const mounted of harnessState.mountedArchives) {
    if (!isAudioPayloadRelevantArchive(mounted)) {
      continue;
    }
    try {
      if (mounted.opfsPath) {
        // Threaded OPFS mount: the bytes never entered MEMFS. Parse (and
        // cache) the BIG directory through realm-port range reads against the
        // staged sync-access handles, then read just the entry payload.
        let entries = mssStreamArchiveDirectoryCache.get(mounted.path);
        if (!entries) {
          const reader = await openOpfsArchiveReader(mounted.path);
          entries = await readBigDirectoryFromReader(reader, mounted.name);
          mssStreamArchiveDirectoryCache.set(mounted.path, entries);
        }
        entry = entries.find(entryMatchesFilename) ?? null;
        if (entry) {
          const range = await opfsRealmReadRange(mounted.path, entry.offset, entry.size);
          opfsPayloadBytes = range.bytes instanceof Uint8Array ? range.bytes : null;
          if (!opfsPayloadBytes || opfsPayloadBytes.byteLength !== entry.size) {
            throw new Error(`OPFS stream payload short read for ${entry.path}`);
          }
          break;
        }
      } else {
        archiveBytes = wasmModule.fs.readFile(mounted.path);
        const entries = readBigDirectoryFromBytes(archiveBytes, mounted.name);
        entry = entries.find(entryMatchesFilename) ?? null;
        if (entry) break;
      }
    } catch (archiveError) {
      // Skip unreadable archive, but keep the reason visible for diagnostics.
      browserMssStreamPlaybackRuntime.lastArchiveError = {
        archive: mounted.name,
        error: archiveError?.message ?? String(archiveError),
      };
      entry = null;
    }
  }

  if (!entry || (!archiveBytes && !opfsPayloadBytes)) {
    browserMssStreamPlaybackRuntime.pendingStarts.delete(handle);
    browserMssStreamPlaybackRuntime.lastError =
      `Stream file not found in any mounted archive: ${filename}`;
    return;
  }

  const payloadBytes = opfsPayloadBytes
    ?? archiveBytes.subarray(entry.offset, entry.offset + entry.size);

  let decoded;
  try {
    decoded = await decodeMssStreamPayload(context, payloadBytes, entry);
  } catch (err) {
    browserMssStreamPlaybackRuntime.pendingStarts.delete(handle);
    browserMssStreamPlaybackRuntime.lastError =
      `Failed to decode stream payload: ${err?.message ?? String(err)}`;
    return;
  }

  // Race guard: stop was called while archive lookup / MP3 decode was in flight.
  const pendingAfterDecode = browserMssStreamPlaybackRuntime.pendingStarts.get(handle);
  if (pendingAfterDecode?.cancelled) {
    browserMssStreamPlaybackRuntime.pendingStarts.delete(handle);
    return;
  }
  browserMssStreamPlaybackRuntime.pendingStarts.delete(handle);

  browserMssStreamPlaybackRuntime.decoded += 1;
  browserMssStreamPlaybackRuntime.eventLog.push({
    handle,
    phase: "webAudioDecode",
    filename,
    archive: entry.archive,
    path: entry.path,
    codec: decoded.info.codec,
    decodedBy: decoded.decodedBy,
    decodedFrames: decoded.decodedFrames,
  });

  // Build audio graph: source -> gain -> stream bus.
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = createWebAudioBufferFromDecoded(context, decoded);
  // Stream loops follow the Miles loop count.
  source.loop = loopCount < 0 || loopCount > 1;
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(busNode);
  source.start(context.currentTime);

  const streamEntry = { source, gain, volume, stoppedByEngine: false };
  // Mirror the sample path's onended cleanup so non-looping streams
  // are removed from activeSources and musicSourceActive is updated.
  source.onended = () => {
    try {
      source.disconnect();
    } catch { /* already disconnected */ }
    const engineStopped = streamEntry.stoppedByEngine;
    // Clean up before notifying so a synchronous engine re-play of this handle
    // does not get clobbered.
    if (browserMssStreamPlaybackRuntime.activeSources.get(handle) === streamEntry) {
      browserMssStreamPlaybackRuntime.activeSources.delete(handle);
    }
    browserMssStreamPlaybackRuntime.ended += 1;
    browserMssStreamPlaybackRuntime.musicSourceActive =
      browserMssStreamPlaybackRuntime.activeSources.size > 0;
    browserMssStreamPlaybackRuntime.eventLog.push({
      handle,
      phase: "completed",
      callback: "AudioBufferSourceNode.onended",
      order: browserMssStreamPlaybackRuntime.ended,
    });
    browserMssStreamPlaybackRuntime.lastError = null;
    // Natural end of a non-looping stream (speech / EVA / dialog). Fire the
    // Miles end-of-stream callback so the engine runs setStreamCompleted() ->
    // notifyOfAudioCompletion(): this clears the disallow-speech latch (so the
    // next speech line is not dropped) and releases the stream channel. Music
    // loops forever and never reaches this path.
    if (!engineStopped) {
      notifyEngineAudioCompleted("cnc_port_mss_complete_stream", handle);
    }
  };

  browserMssStreamPlaybackRuntime.activeSources.set(handle, streamEntry);
  browserMssStreamPlaybackRuntime.musicSourceActive = true;
  browserMssStreamPlaybackRuntime.scheduled += 1;
  browserMssStreamPlaybackRuntime.lastEvent = {
    handle,
    phase: "scheduled",
    filename,
    archive: entry.archive,
    path: entry.path,
    volume,
    loopCount,
    playbackRate: Number(payload.playbackRate ?? decoded.info.samplesPerSec),
    bus: busName,
    payload: {
      extension: audioPayloadExtension(entry.path),
      magic: audioPayloadMagic(payloadBytes.subarray(0, Math.min(64, payloadBytes.byteLength))),
      bytes: payloadBytes.byteLength,
      codec: decoded.info.codec,
      channels: decoded.info.channels,
      samplesPerSec: decoded.info.samplesPerSec,
      decodedBy: decoded.decodedBy,
      decodedFrames: decoded.decodedFrames,
      decodedFloatBytes: decoded.decodedFloatBytes ?? audioBufferDecodedFloatBytes(source.buffer),
    },
    startSeconds: Number(context.currentTime.toFixed(6)),
    durationSeconds: Number(source.buffer.duration.toFixed(6)),
    nodeGraph: ["AudioBufferSourceNode", "GainNode", `${busName}GainNode`, "AudioDestinationNode"],
  };
  browserMssStreamPlaybackRuntime.lastError = null;
}

function cncPortMssStreamStop(payload) {
  const handle = Number(payload?.handle ?? 0);
  browserMssStreamPlaybackRuntime.stopped += 1;
  browserMssStreamPlaybackRuntime.eventLog.push({ handle, phase: "AIL_close_stream" });
  // Cancel in-flight async start if this stop races ahead of it.
  const entry = browserMssStreamPlaybackRuntime.pendingStarts?.get(handle);
  if (entry) {
    entry.cancelled = true;
  }
  try {
    const active = browserMssStreamPlaybackRuntime.activeSources.get(handle);
    if (active) {
      // Engine-initiated close: suppress the natural-end completion callback so
      // we don't re-enter the engine's completion path for a stream it is
      // already tearing down.
      active.stoppedByEngine = true;
      active.source.stop();
      browserMssStreamPlaybackRuntime.activeSources.delete(handle);
    }
  } catch { /* already ended */ }
  if (browserMssStreamPlaybackRuntime.activeSources.size === 0) {
    browserMssStreamPlaybackRuntime.musicSourceActive = false;
  }
  return true;
}

async function decodeMssStreamPayload(context, bytes, entry) {
  const extension = audioPayloadExtension(entry.path);
  const magic = audioPayloadMagic(bytes.subarray(0, Math.min(64, bytes.byteLength)));
  if (extension === "mp3" && (magic === "mp3-id3" || magic === "mp3-frame")) {
    if (typeof context.decodeAudioData !== "function") {
      throw new Error("AudioContext.decodeAudioData is unavailable for MP3 stream");
    }
    const audioBuffer = await context.decodeAudioData(clonePayloadArrayBuffer(bytes));
    return {
      audioBuffer,
      info: {
        codec: magic,
        channels: audioBuffer.numberOfChannels,
        samplesPerSec: audioBuffer.sampleRate,
        webAudioDecoded: true,
      },
      decodedBy: "WebAudio.decodeAudioData",
      decodedFrames: audioBuffer.length,
      decodedFloatBytes: audioBufferDecodedFloatBytes(audioBuffer),
    };
  }

  if (extension === "wav" && magic === "riff-wave") {
    const decoded = decodeAudioWavPayload(bytes);
    return {
      ...decoded,
      decodedBy: "browser WAV decoder",
      decodedFrames: Math.floor(decoded.samples.length / decoded.info.channels),
    };
  }

  throw new Error(`unsupported stream payload ${entry.path} (${extension || "no-extension"}, ${magic})`);
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForBrowserMssStreamStart(handle, timeoutMs = 5000) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    if (browserMssStreamPlaybackRuntime.activeSources.has(Number(handle))) {
      return true;
    }
    if (browserMssStreamPlaybackRuntime.lastError) {
      throw new Error(browserMssStreamPlaybackRuntime.lastError);
    }
    await delay(25);
  }
  throw new Error(`MSS stream ${handle} Web Audio start timed out`);
}

async function waitForBrowserMssSamplePlayback(handle, timeoutMs = 2000) {
  const completion = browserMssSamplePlaybackRuntime.pendingCompletions.get(Number(handle));
  if (!completion) {
    throw new Error(`MSS sample ${handle} has no pending Web Audio completion`);
  }
  let timeoutId = null;
  try {
    return await Promise.race([
      completion,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`MSS sample ${handle} Web Audio completion timed out`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function selectBrowserAudioLiveEventTarget(cacheKey) {
  if (cacheKey) {
    return browserAudioRequestedDecodedCache.get(String(cacheKey)) ?? null;
  }
  for (const decoded of browserAudioRequestedDecodedCache.values()) {
    const route = requestedAudioMixerBusForDecoded(decoded);
    if (route.bus === "sound") {
      return decoded;
    }
  }
  return browserAudioRequestedDecodedCache.values().next().value ?? null;
}

function allocateBrowserAudioLiveEventHandle(handleOverride) {
  const requestedHandle = Number(handleOverride);
  if (Number.isInteger(requestedHandle) && requestedHandle > 0) {
    if (requestedHandle >= browserAudioLiveEventRuntime.nextHandle) {
      browserAudioLiveEventRuntime.nextHandle = requestedHandle + 1;
    }
    return requestedHandle;
  }
  return browserAudioLiveEventRuntime.nextHandle++;
}

async function playBrowserAudioRequestedLiveEvent(payload = {}) {
  const context = browserAudioRuntime.context;
  if (!context || context.state !== "running") {
    browserAudioLiveEventRuntime.lastError = "AudioContext is not running";
    return summarizeBrowserAudioLiveEventRuntime();
  }
  const mixer = ensureBrowserAudioMixerRuntime();
  if (!mixer) {
    browserAudioLiveEventRuntime.lastError = browserAudioMixerRuntime.lastError;
    return summarizeBrowserAudioLiveEventRuntime();
  }
  const decoded = selectBrowserAudioLiveEventTarget(payload.cacheKey);
  if (!decoded) {
    browserAudioLiveEventRuntime.lastError = "requested decoded audio cache is empty";
    return summarizeBrowserAudioLiveEventRuntime();
  }

  const route = requestedAudioMixerBusForDecoded(decoded);
  const busNode = mixer.busNodes?.[route.bus] ?? null;
  if (!busNode) {
    browserAudioLiveEventRuntime.lastError = `missing browser audio mixer bus: ${route.bus}`;
    return summarizeBrowserAudioLiveEventRuntime();
  }

  const fullDurationSeconds = decoded.decodedFrames / decoded.info.samplesPerSec;
  const requestedDuration = Number(payload.durationSeconds ?? 0.05);
  const durationSeconds = Math.max(
    0.01,
    Math.min(
      Number.isFinite(requestedDuration) ? requestedDuration : 0.05,
      0.25,
      fullDurationSeconds,
    ),
  );
  const handle = allocateBrowserAudioLiveEventHandle(payload.handle);
  const eventName = decoded.firstEvent ?? decoded.path;
  const event = {
    handle,
    cacheKey: decoded.cacheKey,
    eventName,
    firstSource: decoded.firstSource,
    archive: decoded.archive,
    path: decoded.path,
    sections: decoded.sections,
    request: {
      type: "AR_Play",
      queued: true,
      usePendingEvent: true,
    },
    start: {
      playingType: route.playingType,
      statusBeforeStart: "PS_Playing",
      webAudioNode: "AudioBufferSourceNode",
      bus: route.bus,
      busGain: mixer.busGains[route.bus],
      nodeGraph: ["AudioBufferSourceNode", `${route.bus}GainNode`, "AudioDestinationNode"],
      startSeconds: Number(context.currentTime.toFixed(6)),
      durationSeconds: Number(durationSeconds.toFixed(6)),
      fullDurationSeconds: Number(fullDurationSeconds.toFixed(6)),
      sourceSampleRate: decoded.info.samplesPerSec,
      sourceFrames: decoded.decodedFrames,
    },
    callback: {
      observed: false,
      order: null,
      completionCall: "notifyOfAudioCompletion",
      completionType: route.playingType,
    },
    completion: {
      statusAfterCallback: null,
      releasePath: requestedAudioCompletionDrainForType(route.playingType),
      releaseAudioEventRTS: false,
    },
  };

  browserAudioLiveEventRuntime.started += 1;
  browserAudioLiveEventRuntime.eventLog.push(
    { handle, eventName, phase: "request", request: "AR_Play" },
    { handle, eventName, phase: "start", playingType: route.playingType, node: "AudioBufferSourceNode" },
  );

  const source = context.createBufferSource();
  source.buffer = createWebAudioBufferFromDecoded(context, decoded);
  source.connect(busNode);

  try {
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error("AudioBufferSourceNode ended callback timed out"));
      }, 2000);
      source.onended = () => {
        window.clearTimeout(timeout);
        try {
          source.disconnect();
        } catch {
          // Source may already be disconnected by the browser; lifecycle proof is still complete.
        }
        event.callback.observed = true;
        event.callback.order = browserAudioLiveEventRuntime.completed + 1;
        event.completion.statusAfterCallback = "PS_Stopped";
        event.completion.releaseAudioEventRTS = true;
        browserAudioLiveEventRuntime.completed += 1;
        browserAudioLiveEventRuntime.released += 1;
        browserAudioLiveEventRuntime.eventLog.push(
          { handle, eventName, phase: "ended", observed: true, order: event.callback.order },
          { handle, eventName, phase: "completion", call: "notifyOfAudioCompletion", status: "PS_Stopped" },
          { handle, eventName, phase: "release", path: event.completion.releasePath },
        );
        browserAudioLiveEventRuntime.lastEvent = event;
        browserAudioLiveEventRuntime.lastError = null;
        resolve();
      };
      source.start(context.currentTime, 0, durationSeconds);
    });
  } catch (error) {
    browserAudioLiveEventRuntime.lastError = error?.message ?? String(error);
  }

  return summarizeBrowserAudioLiveEventRuntime();
}

function requestedAudioSourceRequestPathForDecoded(decoded) {
  const route = requestedAudioMixerBusForDecoded(decoded);
  if (route.bus === "music") {
    return {
      ...route,
      audioType: "AT_Music",
      commonRoute: "AudioManager::addAudioEvent -> m_music->addAudioEvent",
      requestManager: "MusicManager::addAudioEvent",
      queueFunction: "MusicManager::playTrack",
      deviceStart: "playStream",
      requestQueue: "m_audioRequests",
    };
  }
  if (route.bus === "speech") {
    return {
      ...route,
      audioType: "AT_Streaming",
      commonRoute: "AudioManager::addAudioEvent -> m_sound->addAudioEvent",
      requestManager: "SoundManager::addAudioEvent",
      queueFunction: "SoundManager::addAudioEvent",
      deviceStart: "playStream",
      requestQueue: "m_audioRequests",
    };
  }
  if (route.playingType === "PAT_3DSample") {
    return {
      ...route,
      audioType: "AT_SoundEffect",
      commonRoute: "AudioManager::addAudioEvent -> m_sound->addAudioEvent",
      requestManager: "SoundManager::addAudioEvent",
      queueFunction: "SoundManager::addAudioEvent",
      deviceStart: "playSample3D",
      requestQueue: "m_audioRequests",
    };
  }
  return {
    ...route,
    audioType: "AT_SoundEffect",
    commonRoute: "AudioManager::addAudioEvent -> m_sound->addAudioEvent",
    requestManager: "SoundManager::addAudioEvent",
    queueFunction: "SoundManager::addAudioEvent",
    deviceStart: "playSample",
    requestQueue: "m_audioRequests",
  };
}

async function playBrowserAudioRequestPathLiveEvent(payload = {}) {
  const context = browserAudioRuntime.context;
  if (!context || context.state !== "running") {
    browserAudioRequestPathRuntime.lastError = "AudioContext is not running";
    return summarizeBrowserAudioRequestPathRuntime();
  }
  const mixer = ensureBrowserAudioMixerRuntime();
  if (!mixer) {
    browserAudioRequestPathRuntime.lastError = browserAudioMixerRuntime.lastError;
    return summarizeBrowserAudioRequestPathRuntime();
  }
  const decoded = selectBrowserAudioLiveEventTarget(payload.cacheKey);
  if (!decoded) {
    browserAudioRequestPathRuntime.lastError = "requested decoded audio cache is empty";
    return summarizeBrowserAudioRequestPathRuntime();
  }

  const route = requestedAudioSourceRequestPathForDecoded(decoded);
  const handle = browserAudioRequestPathRuntime.nextHandle++;
  const eventName = decoded.firstEvent ?? decoded.path;
  const event = {
    handle,
    cacheKey: decoded.cacheKey,
    eventName,
    firstSource: decoded.firstSource,
    archive: decoded.archive,
    path: decoded.path,
    sections: decoded.sections,
    common: {
      function: "AudioManager::addAudioEvent",
      handleAllocator: "allocateNewHandle",
      filenameStep: "AudioEventRTS::generateFilename",
      playInfoStep: "AudioEventRTS::generatePlayInfo",
      audioType: route.audioType,
      route: route.commonRoute,
    },
    request: {
      manager: route.requestManager,
      queueFunction: route.queueFunction,
      requestQueue: route.requestQueue,
      request: "AR_Play",
      usePendingEvent: true,
      pendingEvent: eventName,
      canPlayNowGate: route.requestManager === "SoundManager::addAudioEvent",
    },
    drain: {
      update: "MilesAudioManager::update",
      requestList: "MilesAudioManager::processRequestList",
      dispatch: "MilesAudioManager::processRequest",
      playRoute: "AR_Play -> playAudioEvent(req->m_pendingEvent)",
    },
    playback: {
      playAudioEvent: "MilesAudioManager::playAudioEvent",
      deviceStart: route.deviceStart,
      playingType: route.playingType,
      bus: route.bus,
      webAudioNode: "AudioBufferSourceNode",
      sourceRoute: route.sourceRoute,
      liveHandle: null,
    },
    completion: null,
  };

  browserAudioRequestPathRuntime.enqueued += 1;
  browserAudioRequestPathRuntime.drained += 1;
  browserAudioRequestPathRuntime.dispatched += 1;
  browserAudioRequestPathRuntime.eventLog.push(
    { handle, eventName, phase: "addAudioEvent", function: "AudioManager::addAudioEvent" },
    { handle, eventName, phase: "generate", filename: true, playInfo: true },
    {
      handle,
      eventName,
      phase: "route",
      audioType: route.audioType,
      manager: route.requestManager,
      playingType: route.playingType,
      bus: route.bus,
    },
    { handle, eventName, phase: "queue", request: "AR_Play", queue: route.requestQueue },
    { handle, eventName, phase: "drain", function: "MilesAudioManager::processRequestList" },
    { handle, eventName, phase: "dispatch", function: "MilesAudioManager::processRequest" },
    { handle, eventName, phase: "playAudioEvent", deviceStart: route.deviceStart },
  );

  const liveBefore = browserAudioLiveEventRuntime.completed;
  const liveEvent = await playBrowserAudioRequestedLiveEvent({
    ...payload,
    cacheKey: decoded.cacheKey,
    handle,
  });
  const liveStarted = browserAudioLiveEventRuntime.lastEvent?.handle === handle;
  if (liveEvent.lastError || !liveStarted) {
    browserAudioRequestPathRuntime.lastError =
      liveEvent.lastError ?? "live playback did not report the request-path handle";
    browserAudioRequestPathRuntime.lastEvent = event;
    return summarizeBrowserAudioRequestPathRuntime();
  }

  const liveLastEvent = browserAudioLiveEventRuntime.lastEvent;
  event.playback.liveHandle = liveLastEvent.handle;
  event.playback.start = liveLastEvent.start;
  event.callback = liveLastEvent.callback;
  event.completion = liveLastEvent.completion;
  browserAudioRequestPathRuntime.started += 1;
  if (browserAudioLiveEventRuntime.completed > liveBefore) {
    browserAudioRequestPathRuntime.completed += 1;
    browserAudioRequestPathRuntime.released += 1;
  }
  browserAudioRequestPathRuntime.eventLog.push(
    { handle, eventName, phase: "start", playingType: route.playingType, bus: route.bus, node: "AudioBufferSourceNode" },
    { handle, eventName, phase: "ended", observed: liveLastEvent.callback?.observed === true },
    { handle, eventName, phase: "completion", call: "notifyOfAudioCompletion", status: "PS_Stopped" },
    { handle, eventName, phase: "release", path: liveLastEvent.completion?.releasePath ?? null },
  );
  browserAudioRequestPathRuntime.lastEvent = event;
  browserAudioRequestPathRuntime.lastError = null;
  return summarizeBrowserAudioRequestPathRuntime();
}

function expectedD3D8ViewportGlBox(d3dViewport = {}, renderTarget = {}, drawingBuffer = {}) {
  const targetWidth = Math.max(1, Math.trunc(finiteNumber(renderTarget.width, d3dViewport.width ?? 1)));
  const targetHeight = Math.max(1, Math.trunc(finiteNumber(renderTarget.height, d3dViewport.height ?? 1)));
  const bufferWidth = Math.max(0, Math.trunc(finiteNumber(drawingBuffer.width, 0)));
  const bufferHeight = Math.max(0, Math.trunc(finiteNumber(drawingBuffer.height, 0)));
  const scaleX = bufferWidth / targetWidth;
  const scaleY = bufferHeight / targetHeight;
  const x = Math.round(finiteNumber(d3dViewport.x, 0) * scaleX);
  const top = Math.round(finiteNumber(d3dViewport.y, 0) * scaleY);
  const width = Math.round(finiteNumber(d3dViewport.width, 0) * scaleX);
  const height = Math.round(finiteNumber(d3dViewport.height, 0) * scaleY);
  return [x, Math.max(0, bufferHeight - top - height), width, height];
}

function d3dColorFromRgba(rgba) {
  return (((rgba[3] << 24) >>> 0) | (rgba[0] << 16) | (rgba[1] << 8) | rgba[2]) >>> 0;
}

function floatVectorApproximatelyEqual(left, right, tolerance = 0.00001) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((component, index) => Math.abs(component - right[index]) <= tolerance);
}

function pixelLooksRed(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 180
    && pixel[1] <= 80
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function pixelLooksGreen(pixel) {
  return Array.isArray(pixel)
    && pixel[0] <= 80
    && pixel[1] >= 180
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function pixelLooksYellow(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 180
    && pixel[1] >= 180
    && pixel[2] <= 80
    && pixel[3] >= 200;
}

function pixelLooksBlack(pixel, threshold = 8) {
  return Array.isArray(pixel)
    && pixel[0] <= threshold
    && pixel[1] <= threshold
    && pixel[2] <= threshold
    && pixel[3] >= 200;
}

function pixelLooksBlueClear(pixel) {
  return Array.isArray(pixel)
    && pixel[0] <= 16
    && pixel[1] <= 16
    && pixel[2] >= 112
    && pixel[2] <= 144
    && pixel[3] >= 200;
}

function pixelLooksMessageBoxBlue(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 32
    && pixel[0] <= 72
    && pixel[1] >= 40
    && pixel[1] <= 80
    && pixel[2] >= 140
    && pixel[2] <= 200
    && pixel[3] >= 200;
}

function pixelLooksMessageBoxBlueTint(pixel) {
  return pixelLooksMessageBoxBlue(pixel)
    || (Array.isArray(pixel)
      && pixel[0] >= 16
      && pixel[0] <= 40
      && pixel[1] >= 20
      && pixel[1] <= 48
      && pixel[2] >= 72
      && pixel[2] <= 112
      && pixel[3] >= 200);
}

function paintBlackWindow() {
  clearCanvas({ rgba: [0, 0, 0, 255] });
}

function syncStatus(label = harnessState.booted ? "booted" : "idle") {
  stateNode.textContent = label;
  framesNode.textContent = String(harnessState.frame);
}

// The engine ticks 30x/s during play; writing #frames every tick invalidates
// layout, which the render path then repays as forced synchronous layouts.
// Nothing machine-reads #frames (harness asserts on rpc state), so a 250ms
// cadence is purely cosmetic.
let framesNodeThrottleLastUpdateMs = 0;
function setFramesNodeThrottled(framesCompleted) {
  const now = Date.now();
  if (now - framesNodeThrottleLastUpdateMs < 250) {
    return;
  }
  framesNodeThrottleLastUpdateMs = now;
  framesNode.textContent = String(framesCompleted);
}

function syncBrowserCursor(input = harnessState.browserInput) {
  if (!input) {
    const css = canvas.style.cursor || "auto";
    harnessState.browserCursor = {
      source: "browser_win32_cursor_css",
      cursorSet: null,
      css,
      visible: css !== "none",
    };
    return;
  }

  const cursorSet = Boolean(input.cursorSet);
  // The original game hides the Win32 cursor (SetCursor(NULL)) because it
  // draws its own W3D cursor - which the browser build does not render yet.
  // Hiding the CSS cursor too would leave a human player with no cursor at
  // all, so keep the native cursor visible as the "hardware cursor" stand-in
  // until W3DMouse rendering is ported (then honor cursorSet again).
  const css = "default";
  canvas.style.cursor = css;
  harnessState.browserCursor = {
    source: "browser_win32_cursor_css",
    cursorSet,
    css,
    visible: true,
  };
}

const HARNESS_LOG_LIMIT = 512;

function recordLog(message, data = null) {
  const entry = {
    frame: harnessState.frame,
    message: String(message),
    data,
    time: new Date().toISOString(),
  };
  harnessState.logs.push(entry);
  if (harnessState.logs.length > HARNESS_LOG_LIMIT) {
    harnessState.logs.splice(0, harnessState.logs.length - HARNESS_LOG_LIMIT);
  }
  // console.info is expensive when DevTools is open (the exact scenario in
  // which the user records traces): a burst of engine stdout during texture
  // loads showed up as ~160ms of recordLog inside one hitch. Keep the console
  // mirror for full diag only; the entries above stay queryable either way.
  if (d3d8DiagLevelValue() === "full") {
    console.info("[wasm-harness]", entry.message, entry.data ?? "");
  }
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
  syncBrowserCursor(harnessState.browserInput);
  harnessState.originalKeyboardFrameInput =
    moduleState.originalKeyboardFrameInput ?? harnessState.originalKeyboardFrameInput;
  harnessState.originalMouseFrameInput =
    moduleState.originalMouseFrameInput ?? harnessState.originalMouseFrameInput;
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
  harnessState.browserRuntimeAssets = moduleState.browserRuntimeAssets ?? harnessState.browserRuntimeAssets;
  harnessState.startupSingletons = moduleState.startupSingletons ?? harnessState.startupSingletons;
  harnessState.audioManagerRuntime = moduleState.audioManagerRuntime ?? harnessState.audioManagerRuntime;
  harnessState.functionLexiconRuntime =
    moduleState.functionLexiconRuntime ?? harnessState.functionLexiconRuntime;
  harnessState.moduleFactoryRuntime =
    moduleState.moduleFactoryRuntime ?? harnessState.moduleFactoryRuntime;
  harnessState.particleSystemRuntime =
    moduleState.particleSystemRuntime ?? harnessState.particleSystemRuntime;
  harnessState.audioRuntimeAssets = moduleState.audioRuntimeAssets ?? harnessState.audioRuntimeAssets;
  harnessState.startupAssets = moduleState.startupAssets ?? harnessState.startupAssets;
  harnessState.dataSummary = moduleState.dataSummary ?? harnessState.dataSummary;
  harnessState.originalEngineStartup = moduleState.originalEngineStartup ?? harnessState.originalEngineStartup;
}

// ---- Win32 GDI font/surface browser bridge ----------------------------------
// Backs the original WW3D FontCharsClass / Render2DSentenceClass text path.
// The C++ side (wasm_win32_gdi_browser.cpp) calls these synchronous hooks via
// EM_ASM; they rasterize glyphs through a Canvas 2D context and write BGR
// pixels back into the wasm DIB-section buffer. Extracted VERBATIM to
// harness/gdi_executor.mjs (P1c) so the engine worker realm can install the
// same rasterizer against an OffscreenCanvas in threaded mode.
const { cncGdiMeasure, cncGdiRasterizeGlyph } = createGdiHooks();

// ---------------------------------------------------------------------------
// Persistent save games (IDBFS)
//
// The real engine writes save games with the original GameState / XferSave
// code path: raw fopen/fwrite against a path built from
//   getPath_UserData()  ==  "$HOME/<UserDataLeafName>/"
// and getSaveDirectory() appends "Save/". In the browser build:
//   - HOME is pinned to CNC_PORT_USER_DATA_HOME (see preRun) so the path is
//     deterministic and stable across reloads.
//   - <UserDataLeafName> defaults to "Command and Conquer Generals Zero Hour
//     Data" (GlobalData.cpp, the registry lookup fails in the shim).
// We mount IDBFS on the whole user-data directory so the engine's own
// CreateDirectory("Save/") + fopen(".sav") calls land in IndexedDB-backed
// storage and survive a page reload. Nothing about the save FORMAT or the
// Xfer/Snapshot serialization changes — this only re-targets where the bytes
// physically live.
// ---------------------------------------------------------------------------
const CNC_PORT_USER_DATA_HOME = "/home/web_user";
const CNC_PORT_USER_DATA_LEAF = "Command and Conquer Generals Zero Hour Data";
const CNC_PORT_USER_DATA_DIR = `${CNC_PORT_USER_DATA_HOME}/${CNC_PORT_USER_DATA_LEAF}`;
const CNC_PORT_SAVE_DIR = `${CNC_PORT_USER_DATA_DIR}/Save`;

// Set once mountSaveFilesystem succeeds; guards persist/read calls.
let cncPortSaveFsMounted = false;

function cncPortMkdirTree(FS, dir) {
  const parts = String(dir).split("/").filter((p) => p.length > 0);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    try {
      FS.mkdir(current);
    } catch (e) {
      // EEXIST is fine; anything else is a real error.
      if (!e || e.errno === undefined) {
        // Some Emscripten builds throw plain errors; ignore if it now exists.
      }
    }
  }
}

// Mount IDBFS at the user-data directory during preRun and pull any previously
// persisted saves into MEMFS before the engine boots. Uses run dependencies so
// the async syncfs completes before main() runs.
function mountSaveFilesystem(m) {
  try {
    const FS = m.FS;
    if (!FS) {
      recordLog("saveFsMountError", { error: "Module.FS unavailable" });
      return;
    }
    // Emscripten registers IDBFS under FS.filesystems.IDBFS (populated by
    // FS.staticInit during preRun); it is not exposed as Module.IDBFS. Fall
    // back to Module.IDBFS in case a future build exports it directly.
    const IDBFS = (FS.filesystems && FS.filesystems.IDBFS) || m.IDBFS;
    if (!IDBFS) {
      // Built without -lidbfs.js: saves still work for the session but do not
      // persist. Fall back to a plain MEMFS directory so nothing crashes.
      cncPortMkdirTree(FS, CNC_PORT_SAVE_DIR);
      recordLog("saveFsMountError", {
        error: "Module.IDBFS unavailable (build without -lidbfs.js); saves are session-only",
      });
      return;
    }

    // Ensure the mount point exists, then mount IDBFS on it.
    cncPortMkdirTree(FS, CNC_PORT_USER_DATA_DIR);
    try {
      FS.mount(IDBFS, {}, CNC_PORT_USER_DATA_DIR);
    } catch (mountError) {
      // Already mounted (e.g. re-entrant module create) is acceptable.
      recordLog("saveFsMountRetry", { error: String(mountError) });
    }

    // Pull persisted data from IndexedDB into MEMFS before boot.
    if (typeof m.addRunDependency === "function") {
      m.addRunDependency("cnc-port-idbfs");
    }
    FS.syncfs(true, (err) => {
      try {
        // Make sure the Save/ leaf exists after the sync (first run has none).
        cncPortMkdirTree(FS, CNC_PORT_SAVE_DIR);
      } catch (mkdirError) {
        recordLog("saveFsMkdirError", { error: String(mkdirError) });
      }
      cncPortSaveFsMounted = !err;
      if (err) {
        recordLog("saveFsSyncInError", { error: String(err) });
      } else {
        recordLog("saveFsMounted", { path: CNC_PORT_SAVE_DIR });
      }
      if (typeof m.removeRunDependency === "function") {
        m.removeRunDependency("cnc-port-idbfs");
      }
    });
  } catch (error) {
    recordLog("saveFsMountError", { error: String(error) });
    if (typeof m.removeRunDependency === "function") {
      try {
        m.removeRunDependency("cnc-port-idbfs");
      } catch (removeError) {
        void removeError;
      }
    }
  }
}

// Flush MEMFS -> IndexedDB so newly written ".sav" files persist. Safe to call
// repeatedly; returns a promise that resolves once the flush completes.
function persistSaveFilesystem(reason = "manual") {
  return new Promise((resolve) => {
    const module = cncPortEmscriptenModule;
    if (!module || !module.FS || !cncPortSaveFsMounted) {
      resolve({ ok: false, reason, error: "save filesystem not mounted" });
      return;
    }
    try {
      module.FS.syncfs(false, (err) => {
        if (err) {
          recordLog("saveFsSyncOutError", { reason, error: String(err) });
          resolve({ ok: false, reason, error: String(err) });
        } else {
          recordLog("saveFsPersisted", { reason });
          resolve({ ok: true, reason });
        }
      });
    } catch (error) {
      recordLog("saveFsSyncOutError", { reason, error: String(error) });
      resolve({ ok: false, reason, error: String(error) });
    }
  });
}

// List persisted ".sav" files in the mounted save directory (harness/debug).
function listSaveFiles() {
  const module = cncPortEmscriptenModule;
  if (!module || !module.FS) {
    return { ok: false, error: "module/FS unavailable", files: [] };
  }
  const FS = module.FS;
  let entries = [];
  try {
    entries = FS.readdir(CNC_PORT_SAVE_DIR);
  } catch (error) {
    return { ok: false, error: String(error), files: [], dir: CNC_PORT_SAVE_DIR };
  }
  const files = [];
  for (const name of entries) {
    if (name === "." || name === "..") continue;
    if (!/\.sav$/i.test(name)) continue;
    const full = `${CNC_PORT_SAVE_DIR}/${name}`;
    let size = -1;
    try {
      size = FS.stat(full).size;
    } catch (statError) {
      void statError;
    }
    files.push({ name, size });
  }
  return { ok: true, files, dir: CNC_PORT_SAVE_DIR, mounted: cncPortSaveFsMounted };
}

async function loadWasmModule() {
  try {
    const distDir = selectedCncPortDistDir();
    const runtimeCacheToken = await cncPortRuntimeCacheToken(distDir);
    const moduleExports = await import(browserAssetUrl(`../${distDir}/cnc-port.js`, runtimeCacheToken));
    const createModule = moduleExports.default ?? moduleExports.createCncPortModule;
    const module = await createModule({
      // .wasm AND the pthread pool worker script (threaded build) live in the
      // dist directory; returning a bare relative path from locateFile makes
      // the browser resolve it against the DOCUMENT (harness/) and 404 — the
      // module factory then waits on its worker-pool run dependency forever.
      locateFile: (path) => (path.endsWith(".wasm") || path.endsWith(".js"))
        ? browserAssetUrl(`../${distDir}/${path}`, runtimeCacheToken)
        : path,
      print: (text) => recordLog("wasm stdout", { text: String(text) }),
      printErr: (text) => recordLog("wasm stderr", { text: String(text) }),
      // The 20 cncPortD3D8* hooks (see d3d8_executor.mjs).
      ...d3d8Hooks,
      cncPortMssSampleStart,
      cncPortMssSampleStop,
      cncPortMssSampleEnd,
      cncPortMssSampleRelease,
      cncPortMss3DSampleStart,
      cncPortMss3DSamplePositionUpdate,
      cncPortMss3DListenerUpdate,
      cncPortMss3DSampleStop,
      cncPortMss3DSampleEnd,
      cncPortMss3DSampleRelease,
      cncPortMssStreamStart,
      cncPortMssStreamStop,
      cncPortMssStreamVolumePan,
      cncPortBrowserUdpSend,
      cncPortBrowserUdpRecv,
      cncGdiMeasure,
      cncGdiRasterizeGlyph,
      // Persist the in-game save directory to IndexedDB via IDBFS so ".sav"
      // files written by the real GameState / XferSave path survive a reload.
      // HOME is pinned so getPath_UserData() ("$HOME/<leaf>/") is deterministic
      // JS-side; the real engine still creates the leaf/Save dirs itself.
      preRun: [
        (m) => {
          try {
            m.ENV = m.ENV || {};
            m.ENV.HOME = CNC_PORT_USER_DATA_HOME;
          } catch (envError) {
            recordLog("saveFsEnvError", { error: String(envError) });
          }
          mountSaveFilesystem(m);
        },
      ],
    });
    cncPortEmscriptenModule = module;
    harnessState.moduleDistDir = distDir;
    d3d8Diag.setBoundDrawDiagnosticsSetter(module.cwrap(
      "cnc_port_d3d8_set_bound_draw_diagnostics",
      null,
      ["number"],
    ));
    applyD3D8BoundDrawDiagnosticsLevel();

    return {
      boot: module.cwrap("cnc_port_boot", "string", []),
      frame: module.cwrap("cnc_port_frame", "string", []),
      startMainLoop: module.cwrap("cnc_port_start_main_loop", "string", []),
      stopMainLoop: module.cwrap("cnc_port_stop_main_loop", "string", []),
      probeArchive: module.cwrap("cnc_port_probe_archive", "string", ["string"]),
      probeObjectIni: module.cwrap("cnc_port_probe_object_ini", "string", ["string"]),
      probeObjectIniSnippet: module.cwrap(
        "cnc_port_probe_object_ini_snippet",
        "string",
        ["string", "string"],
      ),
      registerArchiveSet: module.cwrap(
        "cnc_port_register_archive_set",
        "string",
        ["string", "string", "number", "number", "string"],
      ),
      setBrowserInput: module.cwrap(
        "cnc_port_set_browser_input",
        "string",
        ["number", "number", "number", "number", "number"],
      ),
      setBrowserInputLite: typeof module._cnc_port_set_browser_input_lite === "function"
        ? module.cwrap(
          "cnc_port_set_browser_input_lite",
          "number",
          ["number", "number", "number", "number", "number"],
        )
        : null,
      resetBrowserInput: module.cwrap("cnc_port_reset_browser_input", "string", []),
      postBrowserMessage: module.cwrap(
        "cnc_port_post_browser_message",
        "string",
        ["number", "number", "number", "number", "number"],
      ),
      postBrowserMessageLite: typeof module._cnc_port_post_browser_message_lite === "function"
        ? module.cwrap(
          "cnc_port_post_browser_message_lite",
          "number",
          ["number", "number", "number", "number", "number"],
        )
        : null,
      dinputQueueKey: module.cwrap(
        "cnc_port_dinput_queue_key",
        "number",
        ["number", "number", "number"],
      ),
      dinputQueuedKeyCount: module.cwrap("cnc_port_dinput_queued_key_count", "number", []),
      probeBrowserMessageQueue: module.cwrap("cnc_port_probe_browser_message_queue", "string", []),
      probeBrowserInput: module.cwrap("cnc_port_probe_browser_input", "string", []),
      buildBrowserNetworkRelayPacket: module.cwrap(
        "cnc_port_build_browser_network_relay_packet",
        "string",
        [],
      ),
      acceptBrowserNetworkRelayPacket: module.cwrap(
        "cnc_port_accept_browser_network_relay_packet",
        "string",
        ["string"],
      ),
      buildBrowserNetworkTransportPacket: module.cwrap(
        "cnc_port_build_browser_network_transport_packet",
        "string",
        [],
      ),
      acceptBrowserNetworkTransportPacket: module.cwrap(
        "cnc_port_accept_browser_network_transport_packet",
        "string",
        ["string"],
      ),
      buildBrowserNetworkTransportWirePacket: module.cwrap(
        "cnc_port_build_browser_network_transport_wire_packet",
        "string",
        [],
      ),
      acceptBrowserNetworkTransportWirePacket: module.cwrap(
        "cnc_port_accept_browser_network_transport_wire_packet",
        "string",
        ["string"],
      ),
      probeBrowserNetworkTransportLiveSend: module.cwrap(
        "cnc_port_probe_browser_network_transport_live_send",
        "string",
        [],
      ),
      probeBrowserNetworkTransportLiveReceive: module.cwrap(
        "cnc_port_probe_browser_network_transport_live_receive",
        "string",
        [],
      ),
      buildBrowserLanApiAnnouncePacket: module.cwrap(
        "cnc_port_build_browser_lanapi_announce_packet",
        "string",
        [],
      ),
      acceptBrowserLanApiAnnouncePacket: module.cwrap(
        "cnc_port_accept_browser_lanapi_announce_packet",
        "string",
        ["string"],
      ),
      buildBrowserLanApiJoinRequestPacket: module.cwrap(
        "cnc_port_build_browser_lanapi_join_request_packet",
        "string",
        [],
      ),
      acceptBrowserLanApiJoinRequestPacket: module.cwrap(
        "cnc_port_accept_browser_lanapi_join_request_packet",
        "string",
        ["string"],
      ),
      acceptBrowserLanApiJoinAcceptPacket: module.cwrap(
        "cnc_port_accept_browser_lanapi_join_accept_packet",
        "string",
        ["string", "string"],
      ),
      buildBrowserLanApiGameStartPacket: module.cwrap(
        "cnc_port_build_browser_lanapi_game_start_packet",
        "string",
        [],
      ),
      acceptBrowserLanApiGameStartPacket: module.cwrap(
        "cnc_port_accept_browser_lanapi_game_start_packet",
        "string",
        ["string"],
      ),
      probeBrowserLanApiLiveGameStartSend: module.cwrap(
        "cnc_port_probe_browser_lanapi_live_game_start_send",
        "string",
        [],
      ),
      probeBrowserLanApiLiveGameStartReceive: module.cwrap(
        "cnc_port_probe_browser_lanapi_live_game_start_receive",
        "string",
        [],
      ),
      probeBrowserLanApiNetworkUpdate: module.cwrap(
        "cnc_port_probe_browser_lanapi_network_update",
        "string",
        [],
      ),
      probeBrowserNetworkMultiFrameLockstep: module.cwrap(
        "cnc_port_probe_browser_network_multiframe_lockstep",
        "string",
        [],
      ),
      probeWin32GameEngine: module.cwrap("cnc_port_probe_win32_gameengine", "string", []),
      realEngineInit: module.cwrap("cnc_port_real_engine_init", "string", ["string", "number"]),
      realEngineInitBegin: module.cwrap("cnc_port_real_engine_init_begin", "string", ["string", "number"]),
      realEngineInitStep: module.cwrap("cnc_port_real_engine_init_step", "string", ["number"]),
      realEngineFrontier: module.cwrap("cnc_port_real_engine_frontier", "string", []),
      mapCacheProbe: module.cwrap("cnc_port_map_cache_probe", "string", []),
      realEngineSetSkirmishMap: module.cwrap(
        "cnc_port_real_engine_set_skirmish_map",
        "string",
        ["string"],
      ),
      realEngineSetSkirmishLocalTemplate: module.cwrap(
        "cnc_port_real_engine_set_skirmish_local_template",
        "string",
        ["string"],
      ),
      realEngineFrame: module.cwrap("cnc_port_real_engine_frame", "string", ["number"]),
      realEngineFrameSummary: module.cwrap(
        "cnc_port_real_engine_frame_summary",
        "string",
        ["number"],
      ),
      realEngineFrameTick: module.cwrap(
        "cnc_port_real_engine_frame_tick",
        "string",
        ["number"],
      ),
      realEngineFramePaced: module.cwrap(
        "cnc_port_real_engine_frame_paced",
        "string",
        ["number"],
      ),
      realEngineSetClientPacing: module.cwrap(
        "cnc_port_real_engine_set_client_pacing",
        "string",
        ["number", "number"],
      ),
      realEngineAnimReport: module.cwrap(
        "cnc_port_real_engine_anim_report",
        "string",
        ["number"],
      ),
      realEngineSetLoadStepping: module.cwrap(
        "cnc_port_real_engine_set_load_stepping",
        "string",
        ["number", "number"],
      ),
      realEngineSetResolution: module.cwrap(
        "cnc_port_real_engine_set_resolution",
        "string",
        ["number", "number"],
      ),
      realEngineSetBootResolution: module.cwrap(
        "cnc_port_real_engine_set_boot_resolution",
        null,
        ["number", "number"],
      ),
      realEngineDumpWindows: module.cwrap(
        "cnc_port_real_engine_dump_windows",
        "string",
        [],
      ),
      realEngineSetFrameProfile: module.cwrap(
        "cnc_port_real_engine_set_frame_profile",
        null,
        ["number"],
      ),
      realEngineSetPlayerDiagnostics: module.cwrap(
        "cnc_port_real_engine_set_player_diagnostics",
        null,
        ["number"],
      ),
      realEngineDoFX: module.cwrap(
        "cnc_port_real_engine_do_fx",
        "string",
        ["string", "number", "number", "number", "number", "number"],
      ),
      realEngineSpawnLaser: module.cwrap(
        "cnc_port_real_engine_spawn_laser",
        "string",
        ["string", "number", "number", "number", "number", "number", "number", "number"],
      ),
      tacticalViewLookAt: module.cwrap(
        "cnc_port_tactical_view_look_at",
        "string",
        ["number", "number", "number"],
      ),
      revealLocalMap: module.cwrap(
        "cnc_port_reveal_local_map",
        "string",
        ["number"],
      ),
      realEngineDetonateWeapon: module.cwrap(
        "cnc_port_real_engine_detonate_weapon",
        "string",
        ["string", "number", "number", "number", "number", "number", "number", "number", "number"],
      ),
      realEnginePlayAudioEvent: module.cwrap(
        "cnc_port_real_engine_play_audio_event",
        "string",
        ["string", "number", "number", "number", "number", "number", "number", "number"],
      ),
      audioDeviceState: module.cwrap(
        "cnc_port_audio_device_state",
        "string",
        [],
      ),
      realEngineStopAudioEvent: module.cwrap(
        "cnc_port_real_engine_stop_audio_event",
        "string",
        ["number", "number"],
      ),
      queryDrawables: module.cwrap(
        "cnc_port_query_drawables",
        "string",
        [],
      ),
      querySelection: module.cwrap(
        "cnc_port_query_selection",
        "string",
        [],
      ),
      clickWindowByName: module.cwrap(
        "cnc_port_click_window_by_name",
        "string",
        ["string"],
      ),
      realEngineLastUpdateTarget: module.cwrap(
        "cnc_port_real_engine_last_update_target",
        "string",
        [],
      ),
      realEngineSetEngineUpdateBreakpoint: module.cwrap(
        "cnc_port_real_engine_set_engine_update_breakpoint",
        null,
        ["string"],
      ),
      realEngineSetGameLogicBreakpoint: module.cwrap(
        "cnc_port_real_engine_set_game_logic_breakpoint",
        null,
        ["string"],
      ),
      realEngineLastGameLogicStep: module.cwrap(
        "cnc_port_real_engine_last_game_logic_step",
        "string",
        [],
      ),
      probeMssStartup: module.cwrap("cnc_port_probe_mss_startup", "string", []),
      probeAudioManagerRuntime: module.cwrap("cnc_port_probe_audio_manager_runtime", "string", []),
      probeModuleFactoryRuntime: module.cwrap("cnc_port_probe_module_factory_runtime", "string", []),
      probeParticleSystemRuntime: module.cwrap("cnc_port_probe_particle_system_runtime", "string", []),
      probeMssSampleLifecycle: module.cwrap("cnc_port_probe_mss_sample_lifecycle", "string", []),
      probeMssSamplePlaybackStart: module.cwrap("cnc_port_probe_mss_sample_playback_start", "string", []),
      mssAdpcmPayloadBuffer: module.cwrap("cnc_port_mss_adpcm_payload_buffer", "number", ["number"]),
      probeMssAdpcmSamplePlaybackStart: module.cwrap(
        "cnc_port_probe_mss_adpcm_sample_playback_start", "string", ["number"]),
      probeMssSamplePlaybackFinish: module.cwrap("cnc_port_probe_mss_sample_playback_finish", "string", []),
      probeMssStreamLifecycle: module.cwrap("cnc_port_probe_mss_stream_lifecycle", "string", []),
      probeMss3DSampleLifecycle: module.cwrap("cnc_port_probe_mss_3d_sample_lifecycle", "string", []),
      probeD3D8Clear: module.cwrap("cnc_port_probe_d3d8_clear", "string", ["number"]),
      probeD3D8RenderTarget: module.cwrap("cnc_port_probe_d3d8_render_target", "string", []),
      probeD3D8DepthTextureRenderTarget: module.cwrap("cnc_port_probe_d3d8_depth_texture_render_target", "string", []),
      probeD3D8Viewport: module.cwrap("cnc_port_probe_d3d8_viewport", "string", []),
      probeD3D8BufferDirty: module.cwrap("cnc_port_probe_d3d8_buffer_dirty", "string", []),
      probeD3D8BufferHints: module.cwrap("cnc_port_probe_d3d8_buffer_hints", "string", []),
      probeD3D8TextureUpload: module.cwrap("cnc_port_probe_d3d8_texture_upload", "string", []),
      probeD3D8VolumeTextureUpload: module.cwrap("cnc_port_probe_d3d8_volume_texture_upload", "string", []),
      probeD3D8TextureBind: module.cwrap("cnc_port_probe_d3d8_texture_bind", "string", []),
      probeD3D8NonindexedDraw: module.cwrap("cnc_port_probe_d3d8_nonindexed_draw", "string", []),
      probeD3D8PointSpriteDraw: module.cwrap("cnc_port_probe_d3d8_point_sprite_draw", "string", []),
      probeD3D8UserPointerDraw: module.cwrap("cnc_port_probe_d3d8_user_pointer_draw", "string", []),
      probeD3D8TexturedQuad: module.cwrap("cnc_port_probe_d3d8_textured_quad", "string", []),
      probeD3D8TwoTextureQuad: module.cwrap("cnc_port_probe_d3d8_two_texture_quad", "string", []),
      probeD3D8TwoTextureAlphaQuad: module.cwrap("cnc_port_probe_d3d8_two_texture_alpha_quad", "string", []),
      probeD3D8TextureMipChainDraw: module.cwrap("cnc_port_probe_d3d8_texture_mip_chain_draw", "string", ["number"]),
      probeD3D8TextureCombiner: module.cwrap("cnc_port_probe_d3d8_texture_combiner", "string", ["number"]),
      probeD3D8TexCoordIndex: module.cwrap("cnc_port_probe_d3d8_texcoord_index", "string", ["number"]),
      probeD3D8FvfTexCoordSizes: module.cwrap("cnc_port_probe_d3d8_fvf_texcoord_sizes", "string", ["number"]),
      probeD3D8TextureTransform: module.cwrap("cnc_port_probe_d3d8_texture_transform", "string", ["number"]),
      probeD3D8Stage1TextureTransform: module.cwrap("cnc_port_probe_d3d8_stage1_texture_transform", "string", []),
      probeD3D8StencilState: module.cwrap("cnc_port_probe_d3d8_stencil_state", "string", []),
      probeD3D8FogState: module.cwrap("cnc_port_probe_d3d8_fog_state", "string", []),
      probeD3D8FillMode: module.cwrap("cnc_port_probe_d3d8_fill_mode", "string", []),
      probeD3D8ZBias: module.cwrap("cnc_port_probe_d3d8_z_bias", "string", []),
      probeD3D8ShadeMode: module.cwrap("cnc_port_probe_d3d8_shade_mode", "string", []),
      probeD3D8ClipPlane: module.cwrap("cnc_port_probe_d3d8_clip_plane", "string", []),
      probeD3D8LightingAmbient: module.cwrap("cnc_port_probe_d3d8_lighting_ambient", "string", []),
      probeD3D8DirectionalLight: module.cwrap("cnc_port_probe_d3d8_directional_light", "string", []),
      probeD3D8MultiDirectionalLight: module.cwrap("cnc_port_probe_d3d8_multi_directional_light", "string", []),
      probeD3D8SpecularLight: module.cwrap("cnc_port_probe_d3d8_specular_light", "string", []),
      probeD3D8SpecularOffAxisLight: module.cwrap(
        "cnc_port_probe_d3d8_specular_offaxis_light", "string", []),
      probeD3D8SpecularTransformedLight: module.cwrap(
        "cnc_port_probe_d3d8_specular_transformed_light", "string", []),
      probeD3D8NormalizeNormals: module.cwrap(
        "cnc_port_probe_d3d8_normalize_normals", "string", []),
      probeD3D8LocalViewer: module.cwrap(
        "cnc_port_probe_d3d8_local_viewer", "string", []),
      probeD3D8PointLight: module.cwrap("cnc_port_probe_d3d8_point_light", "string", []),
      probeD3D8PointQuadraticLight: module.cwrap("cnc_port_probe_d3d8_point_quadratic_light", "string", []),
      probeD3D8PointRangeLight: module.cwrap("cnc_port_probe_d3d8_point_range_light", "string", []),
      probeD3D8PointMixedLight: module.cwrap("cnc_port_probe_d3d8_point_mixed_light", "string", []),
      probeD3D8SpotLight: module.cwrap("cnc_port_probe_d3d8_spot_light", "string", []),
      probeD3D8SpotFalloff: module.cwrap("cnc_port_probe_d3d8_spot_falloff", "string", []),
      probeD3D8Material: module.cwrap("cnc_port_probe_d3d8_material", "string", []),
      probeD3D8MaterialSources: module.cwrap("cnc_port_probe_d3d8_material_sources", "string", []),
      probeD3D8LitMaterialSources: module.cwrap("cnc_port_probe_d3d8_lit_material_sources", "string", []),
      probeD3D8LitSpecularMaterialSource: module.cwrap(
        "cnc_port_probe_d3d8_lit_specular_material_source", "string", []),
      probeD3D8LitEmissiveColor1MaterialSource: module.cwrap(
        "cnc_port_probe_d3d8_lit_emissive_color1_material_source", "string", []),
      probeD3D8LitEmissiveColor2MaterialSource: module.cwrap(
        "cnc_port_probe_d3d8_lit_emissive_color2_material_source", "string", []),
      probeD3D8LegacyTextureUpload: module.cwrap("cnc_port_probe_d3d8_legacy_texture_upload", "string", []),
      probeD3D8LegacyTextureDraw: module.cwrap("cnc_port_probe_d3d8_legacy_texture_draw", "string", ["number"]),
      probeD3D8DxtTextureDraw: module.cwrap("cnc_port_probe_d3d8_dxt_texture_draw", "string", ["number"]),
      probeWW3DAABox: module.cwrap("cnc_port_probe_ww3d_aabox", "string", []),
      probeWW3DSceneCamera: module.cwrap("cnc_port_probe_ww3d_scene_camera", "string", []),
      probeWW3DRTSScene: module.cwrap("cnc_port_probe_ww3d_rts_scene", "string", []),
      probeWW3DRTSSceneClearLine: module.cwrap("cnc_port_probe_ww3d_rts_scene_clear_line", "string", []),
      probeWW3DDisplayScene: module.cwrap("cnc_port_probe_ww3d_display_scene", "string", []),
      probeWW3DRender2DTexturedQuad: module.cwrap(
        "cnc_port_probe_ww3d_render2d_textured_quad", "string", []),
      probeWW3DRender2DSentence: module.cwrap(
        "cnc_port_probe_ww3d_render2d_sentence", "string", []),
      probeWW3DDisplayString: module.cwrap(
        "cnc_port_probe_ww3d_display_string", "string", []),
      probeWW3DDisplayGameText: module.cwrap(
        "cnc_port_probe_ww3d_display_game_text", "string", ["string"]),
      probeWW3DDisplayDrawImage: module.cwrap(
        "cnc_port_probe_ww3d_display_drawimage", "string", []),
      probeWW3DDisplayVideoBuffer: module.cwrap(
        "cnc_port_probe_ww3d_display_video_buffer", "string", []),
      probeWW3DDisplayDrawImageAdditive: module.cwrap(
        "cnc_port_probe_ww3d_display_drawimage_additive", "string", []),
      probeWW3DDisplayDrawImageSolid: module.cwrap(
        "cnc_port_probe_ww3d_display_drawimage_solid", "string", []),
      probeWW3DDisplayDrawImageGrayscale: module.cwrap(
        "cnc_port_probe_ww3d_display_drawimage_grayscale", "string", []),
      probeWW3DDisplayDrawImageFile: module.cwrap(
        "cnc_port_probe_ww3d_display_drawimage_file", "string", ["string"]),
      probeWW3DDisplayMappedImage: module.cwrap(
        "cnc_port_probe_ww3d_display_mapped_image", "string", ["string", "string"]),
      probeWW3DDisplayMappedImageClip: module.cwrap(
        "cnc_port_probe_ww3d_display_mapped_image_clip", "string", ["string", "string"]),
      probeWW3DDisplayMappedImageUnrotated: module.cwrap(
        "cnc_port_probe_ww3d_display_mapped_image_unrotated", "string", ["string", "string"]),
      probeWW3DDisplayMainMenuRuler: module.cwrap(
        "cnc_port_probe_ww3d_display_main_menu_ruler", "string", ["string", "string"]),
      probeWW3DDisplayFillRect: module.cwrap(
        "cnc_port_probe_ww3d_display_fillrect", "string", []),
      probeWW3DWindowRepaint: module.cwrap(
        "cnc_port_probe_ww3d_window_repaint", "string", []),
      probeWW3DWindowLayoutRepaint: module.cwrap(
        "cnc_port_probe_ww3d_window_layout_repaint", "string", ["string"]),
      probeWW3DMainMenuLayoutRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_repaint", "string", ["string"]),
      probeWW3DMainMenuLayoutImageRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_image_repaint", "string", []),
      probeWW3DMainMenuLayoutDisabledButtonRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_disabled_button_repaint", "string", []),
      probeWW3DMainMenuLayoutHiliteButtonRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_hilite_button_repaint", "string", []),
      probeWW3DMainMenuLayoutPushedButtonRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_pushed_button_repaint", "string", []),
      probeWW3DMainMenuLayoutSinglePlayerRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_single_player_repaint", "string", []),
      probeWW3DMainMenuLayoutLoadReplayRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_load_replay_repaint", "string", []),
      probeWW3DMainMenuLayoutDifficultyRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_difficulty_repaint", "string", []),
      probeWW3DMainMenuLayoutStaticTextRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_static_text_repaint", "string", []),
      probeWW3DMainMenuLayoutFactionLogoRepaint: module.cwrap(
        "cnc_port_probe_ww3d_main_menu_layout_faction_logo_repaint", "string", []),
      probeWW3DDisplayLine: module.cwrap(
        "cnc_port_probe_ww3d_display_line", "string", []),
      probeWW3DDisplayLineGradient: module.cwrap(
        "cnc_port_probe_ww3d_display_line_gradient", "string", []),
      probeWW3DDisplayOpenRect: module.cwrap(
        "cnc_port_probe_ww3d_display_openrect", "string", []),
      probeWW3DDisplayRectClock: module.cwrap(
        "cnc_port_probe_ww3d_display_rectclock", "string", []),
      probeWW3DDisplayRemainingRectClock: module.cwrap(
        "cnc_port_probe_ww3d_display_remaining_rectclock", "string", []),
      probeWW3DTerrainTile: module.cwrap(
        "cnc_port_probe_ww3d_terrain_tile", "string", []),
      probeWW3DTerrainTileArchive: module.cwrap(
        "cnc_port_probe_ww3d_terrain_tile_archive", "string", ["string"]),
      probeWW3DTerrainTileArchiveScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_tile_archive_scene", "string", ["string"]),
      probeWW3DTerrainMapPatchScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_map_patch_scene", "string", ["string", "string", "string"]),
      probeWW3DTerrainShroudScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_shroud_scene", "string", ["string", "string", "string"]),
      probeWW3DTerrainVisualScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_visual_scene", "string", ["string", "string", "string"]),
      probeWW3DTerrainVisualShroudScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_visual_shroud_scene", "string", ["string", "string", "string"]),
      probeWW3DTerrainVisualShroudUpdateScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_visual_shroud_update_scene", "string", ["string", "string", "string"]),
      probeWW3DTerrainFullScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_full_scene", "string", ["string", "string", "string"]),
      probeWW3DTerrainFullSceneShroudUpdate: module.cwrap(
        "cnc_port_probe_ww3d_terrain_full_scene_shroud_update", "string", ["string", "string", "string"]),
      probeWW3DTerrainVisualLoadWindowScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_visual_load_window_scene", "string", ["string", "string", "string"]),
      probeWW3DTerrainVisualCameraPanScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_visual_camera_pan_scene", "string", ["string", "string", "string"]),
      probeWW3DTerrainBibBufferLifecycle: module.cwrap(
        "cnc_port_probe_ww3d_terrain_bib_buffer_lifecycle", "string", []),
      probeWW3DTerrainPropBufferRender: module.cwrap(
        "cnc_port_probe_ww3d_terrain_prop_buffer_render", "string", ["string", "string"]),
      probeWW3DTerrainPropBufferScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_prop_buffer_scene", "string", ["string", "string", "string", "string", "string"]),
      probeWW3DTerrainTreeBufferScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_tree_buffer_scene", "string", ["string", "string", "string", "string", "string"]),
      probeWW3DTerrainRoadBufferScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_road_buffer_scene", "string", ["string", "string", "string", "string", "string", "string"]),
      probeWW3DTerrainBridgeBufferScene: module.cwrap(
        "cnc_port_probe_ww3d_terrain_bridge_buffer_scene", "string", ["string", "string", "string", "string", "string", "string"]),
      probeWW3DShaderManager: module.cwrap(
        "cnc_port_probe_ww3d_shader_manager", "string", []),
      probeWW3DTexturedMesh: module.cwrap(
        "cnc_port_probe_ww3d_textured_mesh", "string", []),
      probeWW3DEmissiveColor2MaterialSource: module.cwrap(
        "cnc_port_probe_ww3d_emissive_color2_material_source", "string", []),
      probeWW3DShippedMesh: module.cwrap(
        "cnc_port_probe_ww3d_shipped_mesh", "string", ["string", "string"]),
      probeWW3DShippedMultiTextureMesh: module.cwrap(
        "cnc_port_probe_ww3d_shipped_multi_texture_mesh", "string", ["string", "string"]),
      probeWW3DSourceAssetLoad: module.cwrap(
        "cnc_port_probe_ww3d_source_asset_load", "string", []),
      probeWW3DFontChars: module.cwrap(
        "cnc_port_probe_ww3d_font_chars", "string", ["number", "string", "number"]),
      probeClassicEnvironmentMapperApply: module.cwrap(
        "cnc_port_probe_classic_environment_mapper_apply", "string", []),
      probeEdgeMapperApply: module.cwrap(
        "cnc_port_probe_edge_mapper_apply", "string", []),
      probeEnvironmentMapperApply: module.cwrap(
        "cnc_port_probe_environment_mapper_apply", "string", []),
      probeGridEnvironmentMapperApply: module.cwrap(
        "cnc_port_probe_grid_environment_mapper_apply", "string", []),
      probeGridWSEnvironmentMapperApply: module.cwrap(
        "cnc_port_probe_grid_ws_environment_mapper_apply", "string", []),
      probeMatrixMapperApply: module.cwrap(
        "cnc_port_probe_matrixmapper_apply", "string", []),
      probeProjectionStateApply: module.cwrap(
        "cnc_port_probe_projection_state_apply", "string", []),
      probeScreenMapperApply: module.cwrap(
        "cnc_port_probe_screen_mapper_apply", "string", []),
      probeWSEnvironmentMapperApply: module.cwrap(
        "cnc_port_probe_ws_environment_mapper_apply", "string", []),
      probeWWShadeCubeMapApply: module.cwrap(
        "cnc_port_probe_wwshade_cubemap_apply", "string", []),
      probeLaunchWebBrowser: module.cwrap(
        "cnc_port_probe_launch_web_browser", "string", []),
      probeURLLaunch: module.cwrap(
        "cnc_port_probe_url_launch", "string", []),
      initOriginalWndProcInput: module.cwrap(
        "cnc_port_init_original_wndproc_input",
        "string",
        ["number", "number"],
      ),
      pumpOriginalWndProcInput: module.cwrap("cnc_port_pump_original_wndproc_input", "string", []),
      probeOriginalWndProcInput: module.cwrap("cnc_port_probe_original_wndproc_input", "string", []),
      probeOriginalGuiMouseStream: module.cwrap(
        "cnc_port_probe_original_gui_mouse_stream", "string", []),
      probeOriginalCursorVisibility: module.cwrap(
        "cnc_port_probe_original_cursor_visibility", "string", ["number"]),
      setOriginalKeyboardFrameInput: module.cwrap(
        "cnc_port_set_original_keyboard_frame_input_enabled", "string", ["number"]),
      resetOriginalKeyboardFrameInput: module.cwrap(
        "cnc_port_reset_original_keyboard_frame_input", "string", []),
      probeOriginalKeyboardFrameInput: module.cwrap(
        "cnc_port_probe_original_keyboard_frame_input", "string", []),
      setOriginalMouseFrameInput: module.cwrap(
        "cnc_port_set_original_mouse_frame_input_enabled", "string", ["number"]),
      resetOriginalMouseFrameInput: module.cwrap(
        "cnc_port_reset_original_mouse_frame_input", "string", []),
      probeOriginalMouseFrameInput: module.cwrap(
        "cnc_port_probe_original_mouse_frame_input", "string", []),
      probeOriginalMouseFrameWindows: module.cwrap(
        "cnc_port_probe_original_mouse_frame_windows", "string", []),
      resolveOriginalMouseFrameWindowId: module.cwrap(
        "cnc_port_resolve_original_mouse_frame_window_id", "number", ["string"]),
      probeOriginalKeyboardInput: module.cwrap("cnc_port_probe_original_keyboard_input", "string", []),
      probeOriginalKeyboardFrameTick: module.cwrap(
        "cnc_port_probe_original_keyboard_frame_tick", "string", []),
      resetOriginalKeyboardInput: module.cwrap("cnc_port_reset_original_keyboard_input", "string", []),
      queueOriginalKeyboardFocusLost: module.cwrap(
        "cnc_port_queue_original_keyboard_focus_lost",
        "string",
        [],
      ),
      probeGdiFont: module.cwrap("cnc_port_probe_gdi_font", "string", ["number", "string"]),
      state: module.cwrap("cnc_port_state", "string", []),
      fs: module.FS,
      heapU8: () => module.HEAPU8,
    };
  } catch (error) {
    // Keep the underlying reason: getWasmModuleForArchives folds it into the
    // mount error so a failed page shows the ROOT CAUSE (e.g. "SharedArray-
    // Buffer is not defined" on an untrustworthy origin), not a bare
    // "Wasm module unavailable".
    cncPortModuleLoadError = String(error?.message ?? error);
    console.info("[wasm-harness] wasm module unavailable; using JS boot stub", error);
    return null;
  }
}

function d3d8BridgeCallbacks() {
  return { ...d3d8Hooks };
}

function parseModuleState(stateJson) {
  try {
    return JSON.parse(stateJson);
  } catch {
    throw new Error(`Invalid wasm state JSON: ${stateJson}`);
  }
}

function refreshBrowserDirectInputQueue(wasmModule) {
  if (wasmModule?.dinputQueuedKeyCount == null) {
    return;
  }
  harnessState.browserDirectInput = {
    ...harnessState.browserDirectInput,
    queuedKeyCount: wasmModule.dinputQueuedKeyCount(),
  };
}

function snapshotCanvas() {
  syncCanvasSize();
  if (!contextPreserveDrawingBuffer
      && typeof resolvedWasmModule?.realEngineFrameTick === "function"
      && harnessState.frame > 0) {
    // Without preserveDrawingBuffer the buffer is undefined once the task that
    // drew it yields to the compositor; render a fresh frame in THIS task so
    // toDataURL/readPixels below observe real content. Prefer a client-only
    // paced frame (runLogic=0) so taking a screenshot does not advance the sim.
    try {
      if (typeof resolvedWasmModule.realEngineFramePaced === "function") {
        resolvedWasmModule.realEngineFramePaced(0);
      } else {
        resolvedWasmModule.realEngineFrameTick(1);
      }
      flushD3D8PendingDrawBatch("snapshotCanvas");
    } catch (_error) {
      // Fall through: capture whatever is in the buffer.
    }
  }
  return {
    width: canvas.width,
    height: canvas.height,
    topLeftPixel: sampleCanvasPixel(0, 0),
    centerPixel: sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)),
    dataUrl: canvas.toDataURL("image/png"),
  };
}

function snapshotState() {
  syncCanvasSize();
  // Lite mode defers the per-op graphics summaries; RPC consumers still expect
  // point-in-time data, so rebuild them here where the cost is per-query.
  if (d3d8DiagLevelValue() !== "full") {
    updateD3D8TextureSummary(true);
    updateD3D8BufferSummary(true);
    harnessState.graphics = {
      ...harnessState.graphics,
      d3d8Perf: d3d8PerfSummary(),
    };
  }
  return {
    booted: harnessState.booted,
    frame: harnessState.frame,
    webglContextLost: d3d8Diag.webglContextLost(),
    webglContextLossAt: d3d8Diag.webglContextLossAt(),
    runtime: harnessState.runtime,
    wasm: harnessState.wasm,
    mainLoop: harnessState.mainLoop,
    timing: harnessState.timing,
    win32Timing: harnessState.win32Timing,
    canvas: harnessState.canvas,
    graphics: harnessState.graphics,
    browserInput: harnessState.browserInput,
    browserDirectInput: harnessState.browserDirectInput,
    browserCursor: harnessState.browserCursor,
    browserPointerCapture: harnessState.browserPointerCapture,
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
    browserRuntimeAssets: harnessState.browserRuntimeAssets,
    startupSingletons: harnessState.startupSingletons,
    audioManagerRuntime: harnessState.audioManagerRuntime,
    functionLexiconRuntime: harnessState.functionLexiconRuntime,
    moduleFactoryRuntime: harnessState.moduleFactoryRuntime,
    particleSystemRuntime: harnessState.particleSystemRuntime,
    audioRuntimeAssets: harnessState.audioRuntimeAssets,
    browserAudioRuntime: summarizeBrowserAudioRuntime(),
    browserAudioMixerRuntime: summarizeBrowserAudioMixerRuntime(),
    browserMssSamplePlaybackRuntime: summarizeBrowserMssSamplePlaybackRuntime(),
    browserMss3DSamplePlaybackRuntime: summarizeBrowserMss3DSamplePlaybackRuntime(),
    browserMssStreamPlaybackRuntime: summarizeBrowserMssStreamPlaybackRuntime(),
    browserAudioLiveEventRuntime: summarizeBrowserAudioLiveEventRuntime(),
    browserAudioRequestPathRuntime: summarizeBrowserAudioRequestPathRuntime(),
    browserNetworkRelayRuntime: summarizeBrowserNetworkRelayRuntime(),
    browserNetworkTransportRuntime: summarizeBrowserNetworkTransportRuntime(),
    browserUdpEndpointRuntime: summarizeBrowserUdpEndpointRuntime(),
    browserLanApiRuntime: summarizeBrowserLanApiRuntime(),
    audioPayloadInventory: harnessState.audioPayloadInventory,
    startupAssets: harnessState.startupAssets,
    dataSummary: harnessState.dataSummary,
    originalEngineStartup: harnessState.originalEngineStartup,
    originalWndProcInput: harnessState.originalWndProcInput,
    originalKeyboardInput: harnessState.originalKeyboardInput,
    originalKeyboardFrameTick: harnessState.originalKeyboardFrameTick,
    originalKeyboardFrameInput: harnessState.originalKeyboardFrameInput,
    originalMouseFrameInput: harnessState.originalMouseFrameInput,
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

const audioPayloadIniPaths = [
  "Data\\INI\\AudioSettings.ini",
  "Data\\INI\\Default\\Music.ini",
  "Data\\INI\\Music.ini",
  "Data\\INI\\Default\\SoundEffects.ini",
  "Data\\INI\\SoundEffects.ini",
  "Data\\INI\\Default\\Speech.ini",
  "Data\\INI\\Speech.ini",
  "Data\\INI\\Default\\Voice.ini",
  "Data\\INI\\Voice.ini",
  "Data\\INI\\MiscAudio.ini",
];

const audioPayloadArchiveNames = [
  "AudioEnglishZH.big",
  "AudioZH.big",
  "Music.big",
  "MusicZH.big",
  "SpeechEnglishZH.big",
  "SpeechZH.big",
];

const audioPayloadKnownPaths = [
  "Data\\Audio\\Tracks\\USA_10.mp3",
  "Data\\Audio\\Tracks\\CHI_10.mp3",
  "Data\\Audio\\Sounds\\addnwi1a.wav",
  "Data\\Audio\\Sounds\\English\\aangr01a.wav",
  "Data\\Audio\\Speech\\English\\dxxoc001.wav",
];

const audioDecodeProofTargets = [
  {
    path: "Data\\Audio\\Sounds\\English\\aangr01a.wav",
    expectedCodec: "PCM",
  },
  {
    path: "Data\\Audio\\Speech\\English\\dxxoc001.wav",
    expectedCodec: "IMA_ADPCM",
  },
];

const audioPayloadCandidateSettings = {
  audioRoot: "Data\\Audio",
  soundsFolder: "Sounds",
  musicFolder: "Tracks",
  streamingFolder: "Speech",
  soundsExtension: "wav",
  language: "English",
  source: "candidate folder contract for mounted archive lookup; AudioSettings.ini remains required for runtime path readiness",
};

function normalizeBigPath(path) {
  return String(path ?? "").replaceAll("/", "\\").toLowerCase();
}

function archiveNameLeaf(name) {
  const normalized = normalizeBigPath(name);
  const slash = normalized.lastIndexOf("\\");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

const optionalBaseAudioStartupPaths = new Set([
  "data\\ini\\audiosettings.ini",
  "data\\ini\\default\\music.ini",
  "data\\ini\\default\\soundeffects.ini",
  "data\\ini\\default\\speech.ini",
  "data\\ini\\default\\voice.ini",
]);

function isAudioPayloadRelevantArchive(archive) {
  const relevantNames = new Set(audioPayloadArchiveNames.map((name) => name.toLowerCase()));
  const names = [archive.name, archive.sourceName].filter(Boolean);
  return names.some((name) => {
    const normalized = normalizeBigPath(name);
    const leaf = archiveNameLeaf(name);
    return normalized === "inizh.big"
      || normalized === "ini.big"
      || relevantNames.has(normalized)
      || relevantNames.has(leaf);
  });
}

function buildAudioStartupArchiveContract(iniFiles, mountedArchives) {
  const baseIniArchive = mountedArchives.find((archive) =>
    archive.name === "INI.big" ||
    archive.sourceName === "INI.big" ||
    archive.name === "ZZBase_INI.big");
  const files = audioPayloadIniPaths.map((path) => {
    const ini = iniFiles[path] ?? { present: false };
    if (ini.present) {
      return {
        path,
        found: true,
        archives: [
          {
            archive: ini.archive,
            size: ini.size,
          },
        ],
      };
    }

    const normalized = normalizeBigPath(path);
    if (optionalBaseAudioStartupPaths.has(normalized)) {
      return {
        path,
        found: false,
        archives: [],
        optionalBase: true,
        expectedSource: "INI.big",
        reason: baseIniArchive ? "missingFromBaseArchive" : "optionalBaseArchiveAbsent",
      };
    }

    return {
      path,
      found: false,
      archives: [],
      optionalBase: false,
      expectedSource: null,
      reason: "missing",
    };
  });
  const missing = files.filter((entry) => !entry.found);
  const missingByReason = {
    optionalBaseArchiveAbsent: 0,
    missingFromBaseArchive: 0,
    missing: 0,
  };
  for (const entry of missing) {
    missingByReason[entry.reason] = (missingByReason[entry.reason] ?? 0) + 1;
  }

  return {
    source: "GameAudio.cpp::AudioManager::init audio INI startup archive contract",
    ready: missing.length === 0,
    runtimeReady: false,
    nextRequired: missing.length === 0 ? "browserAudioDevice" : "audioStartupArchives",
    requireCommand: "npm run inventory:startup-archives -- --require-audio-startup",
    optionalBaseArchives: [
      {
        name: "INI.big",
        mounted: Boolean(baseIniArchive),
        mountName: baseIniArchive?.name ?? null,
        sourceName: baseIniArchive?.sourceName ?? null,
      },
    ],
    files,
    missing: missing.map((entry) => entry.path),
    missingDetails: missing.map(({ path, optionalBase, expectedSource, reason }) => ({
      path,
      optionalBase: Boolean(optionalBase),
      expectedSource: expectedSource ?? null,
      reason,
    })),
    missingByReason,
  };
}

function readBigDirectoryFromBytes(bytes, archiveName) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 16) {
    throw new Error(`${archiveName} is too small to be a BIGF archive`);
  }
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== "BIGF") {
    throw new Error(`${archiveName} is not a BIGF archive`);
  }

  const entryCount = readBigUInt32BE(bytes, 8);
  if (entryCount > 1000000) {
    throw new Error(`${archiveName} has an invalid BIGF entry count: ${entryCount}`);
  }

  const decoder = new TextDecoder("ascii");
  const entries = [];
  let cursor = 0x10;
  for (let index = 0; index < entryCount; ++index) {
    if (cursor + 9 > bytes.byteLength) {
      throw new Error(`${archiveName} BIGF directory ended before entry ${index}`);
    }
    const offset = readBigUInt32BE(bytes, cursor);
    const size = readBigUInt32BE(bytes, cursor + 4);
    const pathStart = cursor + 8;
    let pathEnd = pathStart;
    while (pathEnd < bytes.byteLength && bytes[pathEnd] !== 0) {
      pathEnd += 1;
    }
    if (pathEnd >= bytes.byteLength) {
      throw new Error(`${archiveName} BIGF entry ${index} has no terminator`);
    }
    if (offset + size > bytes.byteLength) {
      throw new Error(`${archiveName} BIGF entry extends past archive end`);
    }

    const path = decoder.decode(bytes.subarray(pathStart, pathEnd));
    entries.push({
      archive: archiveName,
      path,
      normalizedPath: normalizeBigPath(path),
      offset,
      size,
    });
    cursor = pathEnd + 1;
  }
  return entries;
}

// Opens a mounted MEMFS file for bounded partial reads via the Emscripten FS
// stream API so callers never have to copy a whole archive out of MEMFS
// (FS.readFile) just to sample a few byte ranges from it.
function openMountedArchiveReader(fs, path) {
  const size = fs.stat(path).size;
  const stream = fs.open(path, "r");
  return {
    size,
    readAt(position, length) {
      const start = Math.max(0, Math.min(position, size));
      const wanted = Math.max(0, Math.min(length, size - start));
      const buffer = new Uint8Array(wanted);
      let total = 0;
      while (total < wanted) {
        const read = fs.read(stream, buffer, total, wanted - total, start + total);
        if (read <= 0) {
          break;
        }
        total += read;
      }
      return total === wanted ? buffer : buffer.subarray(0, total);
    },
    close() {
      try {
        fs.close(stream);
      } catch {
        // Stream already closed; nothing left to release.
      }
    },
  };
}

// Partial-read variant of readBigDirectoryFromBytes: parses the BIGF header +
// directory through bounded chunked reads instead of requiring the whole
// archive in memory. Semantics and error messages mirror
// readBigDirectoryFromBytes. Async so readers may be remote (the threaded
// OPFS realm reader awaits port round trips); MEMFS readers return plain
// values and are unaffected by the awaits.
async function readBigDirectoryFromReader(reader, archiveName) {
  if (reader.size < 16) {
    throw new Error(`${archiveName} is too small to be a BIGF archive`);
  }
  const header = await reader.readAt(0, 16);
  const magic = String.fromCharCode(...header.subarray(0, 4));
  if (magic !== "BIGF") {
    throw new Error(`${archiveName} is not a BIGF archive`);
  }

  const entryCount = readBigUInt32BE(header, 8);
  if (entryCount > 1000000) {
    throw new Error(`${archiveName} has an invalid BIGF entry count: ${entryCount}`);
  }

  const decoder = new TextDecoder("ascii");
  const entries = [];
  const directoryStart = 0x10;
  const chunkSize = 64 * 1024;
  const directoryCapacity = reader.size - directoryStart;
  let directoryBytes = new Uint8Array(0);

  const ensureDirectoryBytes = async (requiredLength, failureMessage) => {
    while (directoryBytes.byteLength < requiredLength) {
      if (directoryBytes.byteLength >= directoryCapacity) {
        throw new Error(failureMessage);
      }
      const start = directoryStart + directoryBytes.byteLength;
      const next = await reader.readAt(start, Math.min(chunkSize, reader.size - start));
      if (next.byteLength === 0) {
        throw new Error(failureMessage);
      }
      directoryBytes = appendBytes(directoryBytes, next);
    }
  };

  let cursor = 0;
  for (let index = 0; index < entryCount; ++index) {
    await ensureDirectoryBytes(cursor + 9, `${archiveName} BIGF directory ended before entry ${index}`);
    const offset = readBigUInt32BE(directoryBytes, cursor);
    const size = readBigUInt32BE(directoryBytes, cursor + 4);
    const pathStart = cursor + 8;
    let pathEnd = pathStart;
    for (;;) {
      while (pathEnd < directoryBytes.byteLength && directoryBytes[pathEnd] !== 0) {
        pathEnd += 1;
      }
      if (pathEnd < directoryBytes.byteLength) {
        break;
      }
      await ensureDirectoryBytes(
        directoryBytes.byteLength + 1,
        `${archiveName} BIGF entry ${index} has no terminator`,
      );
    }
    if (offset + size > reader.size) {
      throw new Error(`${archiveName} BIGF entry extends past archive end`);
    }

    const path = decoder.decode(directoryBytes.subarray(pathStart, pathEnd));
    entries.push({
      archive: archiveName,
      path,
      normalizedPath: normalizeBigPath(path),
      offset,
      size,
    });
    cursor = pathEnd + 1;
  }
  return entries;
}

function decodeMountedBigTextBytes(payloadBytes) {
  return new TextDecoder("windows-1252").decode(payloadBytes);
}

function stripIniComment(line) {
  const semicolon = line.indexOf(";");
  return semicolon >= 0 ? line.slice(0, semicolon) : line;
}

function parseAudioPayloadBlocks(text, sourcePath, wantedKinds) {
  const wanted = new Set(wantedKinds);
  const blockStart = /^\s*([A-Za-z][A-Za-z0-9_]*)\s+([^\s;]+)/;
  const fieldLine = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
  const blocks = [];
  let current = null;

  const finishCurrent = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; ++index) {
    const lineNumber = index + 1;
    const line = stripIniComment(lines[index]).trimEnd();
    if (line.trim() === "") {
      continue;
    }

    const block = blockStart.exec(line);
    if (block && !line.includes("=")) {
      finishCurrent();
      if (wanted.has(block[1])) {
        current = {
          sourcePath,
          kind: block[1],
          name: block[2],
          line: lineNumber,
          fields: [],
        };
      }
      continue;
    }

    if (!current) {
      continue;
    }
    const field = fieldLine.exec(line);
    if (field) {
      current.fields.push({
        name: field[1],
        value: field[2].trim(),
        line: lineNumber,
      });
    }
  }
  finishCurrent();
  return blocks;
}

function parseAudioTokenList(value) {
  return String(value ?? "")
    .replaceAll(",", " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && token.toLowerCase() !== "none");
}

function audioPayloadCandidatePaths(kind, leaf) {
  let file = String(leaf ?? "").trim();
  if (!file) {
    return [];
  }

  let folder = audioPayloadCandidateSettings.soundsFolder;
  if (kind === "music") {
    folder = audioPayloadCandidateSettings.musicFolder;
  } else if (kind === "streaming") {
    folder = audioPayloadCandidateSettings.streamingFolder;
    if (file.startsWith("$")) {
      file = file.slice(1);
    }
  } else {
    file = `${file}.${audioPayloadCandidateSettings.soundsExtension}`;
  }

  return [...new Set([
    `${audioPayloadCandidateSettings.audioRoot}\\${folder}\\${audioPayloadCandidateSettings.language}\\${file}`,
    `${audioPayloadCandidateSettings.audioRoot}\\${folder}\\${file}`,
  ])];
}

function audioPayloadExtension(path) {
  const normalized = String(path ?? "").replaceAll("/", "\\");
  const slash = normalized.lastIndexOf("\\");
  const dot = normalized.lastIndexOf(".");
  return dot > slash ? normalized.slice(dot + 1).toLowerCase() : "";
}

function audioPayloadMagic(header) {
  const ascii = (start, end) => String.fromCharCode(...header.subarray(start, end));
  if (header.byteLength >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") {
    return "riff-wave";
  }
  if (header.byteLength >= 3 && ascii(0, 3) === "ID3") {
    return "mp3-id3";
  }
  if (header.byteLength >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0) {
    return "mp3-frame";
  }
  return "unknown";
}

function hexPrefix(bytes, limit = 12) {
  return [...bytes.subarray(0, Math.min(limit, bytes.byteLength))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function readU16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readI16LE(bytes, offset) {
  const value = readU16LE(bytes, offset);
  return value & 0x8000 ? value - 0x10000 : value;
}

function readU32LE(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function audioWavCodecName(tag) {
  if (tag === 1) {
    return "PCM";
  }
  if (tag === 17) {
    return "IMA_ADPCM";
  }
  return `0x${tag.toString(16)}`;
}

function parseAudioWavFmt(header) {
  if (header.byteLength < 12 || audioPayloadMagic(header) !== "riff-wave") {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= header.byteLength) {
    const chunkId = String.fromCharCode(...header.subarray(offset, offset + 4));
    const chunkSize = readU32LE(header, offset + 4);
    if (chunkId === "fmt ") {
      if (offset + 24 > header.byteLength) {
        return null;
      }
      const wFormatTag = readU16LE(header, offset + 8);
      const channels = readU16LE(header, offset + 10);
      const samplesPerSec = readU32LE(header, offset + 12);
      const bitsPerSample = readU16LE(header, offset + 22);
      return {
        wFormatTag,
        codec: audioWavCodecName(wFormatTag),
        channels,
        samplesPerSec,
        bitsPerSample,
        layout: `${channels}ch_${samplesPerSec}Hz_${bitsPerSample}bit`,
      };
    }
    offset += 8 + chunkSize + (chunkSize & 1);
  }
  return null;
}

// Callers pass the payload's first audioPayloadHeaderSampleBytes bytes
// (clamped to the archive end), not the whole archive.
const audioPayloadHeaderSampleBytes = 64;

function classifyAudioPayloadFormat(header, entry) {
  const extension = audioPayloadExtension(entry.path);
  const magic = audioPayloadMagic(header);
  const wavFmt = magic === "riff-wave" ? parseAudioWavFmt(header) : null;
  const webAudioContainerCandidate =
    (extension === "wav" && magic === "riff-wave") ||
    (extension === "mp3" && (magic === "mp3-id3" || magic === "mp3-frame"));
  const webAudioDecodeCandidate =
    (extension === "wav" && magic === "riff-wave" && wavFmt?.wFormatTag === 1) ||
    (extension === "mp3" && (magic === "mp3-id3" || magic === "mp3-frame"));
  const requiresTranscode =
    extension === "wav" && magic === "riff-wave" && wavFmt?.wFormatTag !== 1;
  return {
    extension,
    magic,
    headerHex: hexPrefix(header),
    wavFmt,
    webAudioContainerCandidate,
    webAudioDecodeCandidate,
    requiresTranscode,
  };
}

function incrementCount(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function newAudioFormatSummary(source) {
  return {
    source,
    entryCount: 0,
    totalBytes: 0,
    extensions: {},
    magic: {},
    wavCodec: {},
    wavFmt: {},
    webAudioContainerCandidates: 0,
    webAudioDecodeCandidates: 0,
    requiresTranscode: 0,
    unsupported: 0,
    examples: [],
  };
}

function addAudioFormatSummaryEntry(summary, entry) {
  const format = entry.format;
  if (!format) {
    return;
  }
  summary.entryCount += 1;
  summary.totalBytes += entry.size;
  incrementCount(summary.extensions, format.extension || "none");
  incrementCount(summary.magic, format.magic || "unknown");
  if (format.wavFmt) {
    incrementCount(summary.wavCodec, String(format.wavFmt.wFormatTag));
    incrementCount(summary.wavFmt, format.wavFmt.layout);
  }
  if (format.webAudioContainerCandidate) {
    summary.webAudioContainerCandidates += 1;
  }
  if (format.webAudioDecodeCandidate) {
    summary.webAudioDecodeCandidates += 1;
  } else if (format.requiresTranscode) {
    summary.requiresTranscode += 1;
  } else {
    summary.unsupported += 1;
  }
  if (summary.examples.length < 6) {
    summary.examples.push({
      archive: entry.archive,
      path: entry.path,
      size: entry.size,
      offset: entry.offset,
      format,
    });
  }
}

const imaAdpcmStepTable = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
  19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
  130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
  337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
  2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
  5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
  15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

const imaAdpcmIndexTable = [
  -1, -1, -1, -1, 2, 4, 6, 8,
  -1, -1, -1, -1, 2, 4, 6, 8,
];

function clampAudioSample(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function decodeImaAdpcmNibble(nibble, state) {
  const step = imaAdpcmStepTable[state.index];
  let diff = step >> 3;
  if (nibble & 1) diff += step >> 2;
  if (nibble & 2) diff += step >> 1;
  if (nibble & 4) diff += step;
  state.predictor = clampAudioSample(
    state.predictor + ((nibble & 8) ? -diff : diff),
    -32768,
    32767,
  );
  state.index = clampAudioSample(state.index + imaAdpcmIndexTable[nibble], 0, 88);
  return state.predictor;
}

function findAudioWavChunks(bytes) {
  if (bytes.byteLength < 12 || audioPayloadMagic(bytes) !== "riff-wave") {
    throw new Error("payload is not a RIFF/WAVE file");
  }
  const chunks = {};
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = readU32LE(bytes, offset + 4);
    const bodyOffset = offset + 8;
    if (bodyOffset + size > bytes.byteLength) {
      throw new Error(`WAV chunk ${id} extends past payload end`);
    }
    chunks[id] = { id, offset: bodyOffset, size };
    offset = bodyOffset + size + (size & 1);
  }
  return chunks;
}

function parseAudioWavPayload(bytes) {
  const chunks = findAudioWavChunks(bytes);
  const fmt = chunks["fmt "];
  const data = chunks.data;
  if (!fmt || !data) {
    throw new Error("WAV payload is missing fmt or data chunk");
  }
  if (fmt.size < 16) {
    throw new Error("WAV fmt chunk is too small");
  }
  const info = {
    wFormatTag: readU16LE(bytes, fmt.offset),
    codec: null,
    channels: readU16LE(bytes, fmt.offset + 2),
    samplesPerSec: readU32LE(bytes, fmt.offset + 4),
    avgBytesPerSec: readU32LE(bytes, fmt.offset + 8),
    blockAlign: readU16LE(bytes, fmt.offset + 12),
    bitsPerSample: readU16LE(bytes, fmt.offset + 14),
    cbSize: fmt.size >= 18 ? readU16LE(bytes, fmt.offset + 16) : 0,
    samplesPerBlock: fmt.size >= 20 ? readU16LE(bytes, fmt.offset + 18) : 0,
    factSamples: chunks.fact && chunks.fact.size >= 4
      ? readU32LE(bytes, chunks.fact.offset)
      : null,
    dataOffset: data.offset,
    dataBytes: data.size,
  };
  info.codec = audioWavCodecName(info.wFormatTag);
  return info;
}

function decodePcm16Wav(bytes, info) {
  if (info.bitsPerSample !== 16) {
    throw new Error(`unsupported PCM bit depth: ${info.bitsPerSample}`);
  }
  const sampleCount = Math.floor(info.dataBytes / 2);
  const samples = new Int16Array(sampleCount);
  let cursor = info.dataOffset;
  for (let i = 0; i < sampleCount; ++i, cursor += 2) {
    samples[i] = readI16LE(bytes, cursor);
  }
  return samples;
}

function decodeImaAdpcmWav(bytes, info) {
  if (info.bitsPerSample !== 4) {
    throw new Error(`unsupported IMA ADPCM bit depth: ${info.bitsPerSample}`);
  }
  if (info.channels < 1 || info.blockAlign < info.channels * 4) {
    throw new Error(`invalid IMA ADPCM block layout: ${JSON.stringify(info)}`);
  }
  const blocks = Math.floor(info.dataBytes / info.blockAlign);
  const framesPerBlock = info.samplesPerBlock ||
    Math.floor(((info.blockAlign - 4 * info.channels) * 2) / info.channels) + 1;
  const expectedFrames = info.factSamples ?? (blocks * framesPerBlock);
  const samples = new Int16Array(expectedFrames * info.channels);
  let outputFrames = 0;

  for (let block = 0; block < blocks && outputFrames < expectedFrames; ++block) {
    const blockStart = info.dataOffset + block * info.blockAlign;
    const blockEnd = blockStart + info.blockAlign;
    let cursor = blockStart;
    const states = [];
    const channelSamples = [];

    for (let channel = 0; channel < info.channels; ++channel) {
      const predictor = readI16LE(bytes, cursor);
      const index = clampAudioSample(bytes[cursor + 2], 0, 88);
      states.push({ predictor, index });
      channelSamples.push([predictor]);
      cursor += 4;
    }

    while (cursor < blockEnd) {
      for (let channel = 0; channel < info.channels && cursor < blockEnd; ++channel) {
        for (let i = 0; i < 4 && cursor < blockEnd; ++i, ++cursor) {
          const value = bytes[cursor];
          channelSamples[channel].push(decodeImaAdpcmNibble(value & 0x0f, states[channel]));
          channelSamples[channel].push(decodeImaAdpcmNibble(value >> 4, states[channel]));
        }
      }
    }

    const decodedFrames = Math.min(
      framesPerBlock,
      ...channelSamples.map((values) => values.length),
      expectedFrames - outputFrames,
    );
    for (let frame = 0; frame < decodedFrames; ++frame) {
      for (let channel = 0; channel < info.channels; ++channel) {
        samples[(outputFrames + frame) * info.channels + channel] =
          channelSamples[channel][frame];
      }
    }
    outputFrames += decodedFrames;
  }

  return samples.subarray(0, outputFrames * info.channels);
}

function decodeAudioWavPayload(bytes) {
  const info = parseAudioWavPayload(bytes);
  if (info.wFormatTag === 1) {
    return { info, samples: decodePcm16Wav(bytes, info) };
  }
  if (info.wFormatTag === 17) {
    return { info, samples: decodeImaAdpcmWav(bytes, info) };
  }
  throw new Error(`unsupported WAV codec: ${info.wFormatTag}`);
}

function summarizeDecodedSamples(samples) {
  let minSample = 32767;
  let maxSample = -32768;
  let nonZeroSamples = 0;
  let sumAbs = 0;
  for (const sample of samples) {
    if (sample < minSample) minSample = sample;
    if (sample > maxSample) maxSample = sample;
    if (sample !== 0) nonZeroSamples += 1;
    sumAbs += Math.abs(sample);
  }
  return {
    minSample,
    maxSample,
    nonZeroSamples,
    sumAbs,
    firstSamples: [...samples.subarray(0, Math.min(16, samples.length))],
  };
}

function int16AudioSampleToFloat(sample) {
  return sample < 0 ? sample / 32768 : sample / 32767;
}

function summarizeAudioBuffer(buffer) {
  const firstChannel = buffer.getChannelData(0);
  let minFloat = 1;
  let maxFloat = -1;
  let nonZeroFrames = 0;
  let maxAbsFloat = 0;
  for (const sample of firstChannel) {
    if (sample < minFloat) minFloat = sample;
    if (sample > maxFloat) maxFloat = sample;
    if (sample !== 0) nonZeroFrames += 1;
    const abs = Math.abs(sample);
    if (abs > maxAbsFloat) maxAbsFloat = abs;
  }
  return {
    minFloat: Number(minFloat.toFixed(6)),
    maxFloat: Number(maxFloat.toFixed(6)),
    maxAbsFloat: Number(maxAbsFloat.toFixed(6)),
    nonZeroFrames,
    firstChannelFirstSamples: [...firstChannel.subarray(0, Math.min(16, firstChannel.length))]
      .map((sample) => Number(sample.toFixed(6))),
  };
}

function createWebAudioBufferFromDecoded(audioContext, decoded) {
  if (decoded.audioBuffer) {
    return decoded.audioBuffer;
  }
  const buffer = audioContext.createBuffer(
    decoded.info.channels,
    decoded.decodedFrames,
    decoded.info.samplesPerSec,
  );
  for (let channel = 0; channel < decoded.info.channels; ++channel) {
    const channelData = buffer.getChannelData(channel);
    for (let frame = 0; frame < decoded.decodedFrames; ++frame) {
      channelData[frame] = int16AudioSampleToFloat(
        decoded.samples[frame * decoded.info.channels + channel],
      );
    }
  }
  return buffer;
}

function audioBufferDecodedFloatBytes(buffer) {
  return buffer.numberOfChannels * buffer.length * Float32Array.BYTES_PER_ELEMENT;
}

function clonePayloadArrayBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function decodeWebAudioPayload(payloadBytes) {
  const OfflineAudioContextCtor =
    globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (typeof OfflineAudioContextCtor !== "function") {
    throw new Error("OfflineAudioContext is unavailable");
  }
  const audioContext = new OfflineAudioContextCtor(1, 1, 44100);
  const audioBuffer = await audioContext.decodeAudioData(clonePayloadArrayBuffer(payloadBytes));
  return {
    audioBuffer,
    info: {
      codec: "mp3-id3",
      channels: audioBuffer.numberOfChannels,
      samplesPerSec: audioBuffer.sampleRate,
      webAudioDecoded: true,
    },
    decodedFrames: audioBuffer.length,
    decodedFloatBytes: audioBufferDecodedFloatBytes(audioBuffer),
  };
}

function buildWebAudioBufferProofs(decodedPayloads) {
  const errors = [];
  const proofs = [];
  const OfflineAudioContextCtor =
    globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (typeof OfflineAudioContextCtor !== "function") {
    return {
      source: "browser Web Audio AudioBuffer upload proof",
      ready: false,
      runtimePlayback: false,
      nextRequired: "offlineAudioContext",
      errors: ["OfflineAudioContext is unavailable"],
      proofs,
    };
  }

  let audioContext;
  try {
    audioContext = new OfflineAudioContextCtor(1, 1, 8000);
  } catch (error) {
    return {
      source: "browser Web Audio AudioBuffer upload proof",
      ready: false,
      runtimePlayback: false,
      nextRequired: "offlineAudioContext",
      errors: [error?.message ?? String(error)],
      proofs,
    };
  }

  for (const decoded of decodedPayloads) {
    try {
      const buffer = createWebAudioBufferFromDecoded(audioContext, decoded);
      proofs.push({
        ...(decoded.cacheKey ? { cacheKey: decoded.cacheKey } : {}),
        path: decoded.path,
        archive: decoded.archive,
        ...(decoded.refCount ? { refCount: decoded.refCount } : {}),
        ...(decoded.sections ? { sections: decoded.sections } : {}),
        ...(decoded.firstEvent ? { firstEvent: decoded.firstEvent } : {}),
        ...(decoded.firstSource ? { firstSource: decoded.firstSource } : {}),
        codec: decoded.info.codec,
        decodedBy: decoded.decodedBy ?? "harnessWavDecoder",
        constructor: audioContext.constructor?.name ?? "OfflineAudioContext",
        runtimePlayback: false,
        numberOfChannels: buffer.numberOfChannels,
        length: buffer.length,
        sampleRate: buffer.sampleRate,
        durationSeconds: Number(buffer.duration.toFixed(6)),
        ...(decoded.decodedFloatBytes ? { decodedFloatBytes: decoded.decodedFloatBytes } : {}),
        ...summarizeAudioBuffer(buffer),
      });
    } catch (error) {
      errors.push(`${decoded.path}: ${error?.message ?? String(error)}`);
    }
  }

  return {
    source: "browser Web Audio AudioBuffer upload proof",
    ready: errors.length === 0 && proofs.length === decodedPayloads.length,
    runtimePlayback: false,
    nextRequired: "requestedPayloadDecodeCache",
    errors,
    proofs,
  };
}

function summarizeRenderedAudioWindow(channelData, startFrame, endFrame) {
  let minFloat = 1;
  let maxFloat = -1;
  let nonZeroFrames = 0;
  let maxAbsFloat = 0;
  const start = Math.max(0, startFrame);
  const end = Math.min(channelData.length, endFrame);
  for (let frame = start; frame < end; ++frame) {
    const sample = channelData[frame];
    if (sample < minFloat) minFloat = sample;
    if (sample > maxFloat) maxFloat = sample;
    if (sample !== 0) nonZeroFrames += 1;
    const abs = Math.abs(sample);
    if (abs > maxAbsFloat) maxAbsFloat = abs;
  }
  if (end <= start) {
    minFloat = 0;
    maxFloat = 0;
  }
  return {
    startFrame: start,
    endFrame: end,
    frames: Math.max(0, end - start),
    minFloat: Number(minFloat.toFixed(6)),
    maxFloat: Number(maxFloat.toFixed(6)),
    maxAbsFloat: Number(maxAbsFloat.toFixed(6)),
    nonZeroFrames,
    firstSamples: [...channelData.subarray(start, Math.min(start + 16, end))]
      .map((sample) => Number(sample.toFixed(6))),
  };
}

function setAudioParamValue(target, key, value, time = 0) {
  const param = target?.[key];
  if (param && typeof param.setValueAtTime === "function") {
    param.setValueAtTime(value, time);
  } else if (target) {
    target[key] = value;
  }
}

function summarizeStereoRenderedAudio(rendered, startFrame = 0, endFrame = rendered.length) {
  const left = summarizeRenderedAudioWindow(rendered.getChannelData(0), startFrame, endFrame);
  const right = summarizeRenderedAudioWindow(rendered.getChannelData(1), startFrame, endFrame);
  let leftSumSquares = 0;
  let rightSumSquares = 0;
  const start = Math.max(0, startFrame);
  const end = Math.min(rendered.length, endFrame);
  const leftData = rendered.getChannelData(0);
  const rightData = rendered.getChannelData(1);
  for (let frame = start; frame < end; ++frame) {
    leftSumSquares += leftData[frame] * leftData[frame];
    rightSumSquares += rightData[frame] * rightData[frame];
  }
  const frames = Math.max(1, end - start);
  const leftRms = Math.sqrt(leftSumSquares / frames);
  const rightRms = Math.sqrt(rightSumSquares / frames);
  return {
    numberOfChannels: rendered.numberOfChannels,
    sampleRate: rendered.sampleRate,
    length: rendered.length,
    durationSeconds: Number(rendered.duration.toFixed(6)),
    left,
    right,
    leftRms: Number(leftRms.toFixed(6)),
    rightRms: Number(rightRms.toFixed(6)),
    rightMinusLeftRms: Number((rightRms - leftRms).toFixed(6)),
  };
}

function requestedAudioSchedulePlaybackSeconds(decoded, durationSeconds) {
  if (decoded.sections?.music && durationSeconds > 10) {
    return 10;
  }
  return durationSeconds;
}

async function buildWebAudioScheduleProof(decodedPayloads) {
  const errors = [];
  const scheduled = [];
  const endedCallbacks = [];
  const OfflineAudioContextCtor =
    globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (typeof OfflineAudioContextCtor !== "function") {
    return {
      source: "browser requested audio OfflineAudioContext scheduling proof",
      ready: false,
      runtimePlayback: false,
      offlineRendered: false,
      nextRequired: "offlineAudioContext",
      errors: ["OfflineAudioContext is unavailable"],
      scheduled,
      endedCallbacks,
    };
  }

  const renderSampleRate = 44100;
  const gapSeconds = 0.02;
  const tailSeconds = 0.1;
  let cursorSeconds = 0;
  for (const decoded of decodedPayloads) {
    const durationSeconds = decoded.decodedFrames / decoded.info.samplesPerSec;
    const playbackSeconds = requestedAudioSchedulePlaybackSeconds(decoded, durationSeconds);
    scheduled.push({
      cacheKey: decoded.cacheKey,
      archive: decoded.archive,
      path: decoded.path,
      firstEvent: decoded.firstEvent,
      firstSource: decoded.firstSource,
      codec: decoded.info.codec,
      refCount: decoded.refCount,
      sections: decoded.sections,
      startSeconds: Number(cursorSeconds.toFixed(6)),
      durationSeconds: Number(playbackSeconds.toFixed(6)),
      fullDurationSeconds: Number(durationSeconds.toFixed(6)),
      scheduledPreview: playbackSeconds < durationSeconds,
      endSeconds: Number((cursorSeconds + playbackSeconds).toFixed(6)),
      sourceSampleRate: decoded.info.samplesPerSec,
      sourceFrames: decoded.decodedFrames,
    });
    cursorSeconds += playbackSeconds + gapSeconds;
  }

  const renderLength = Math.max(1, Math.ceil((cursorSeconds + tailSeconds) * renderSampleRate));
  let audioContext;
  try {
    audioContext = new OfflineAudioContextCtor(1, renderLength, renderSampleRate);
  } catch (error) {
    return {
      source: "browser requested audio OfflineAudioContext scheduling proof",
      ready: false,
      runtimePlayback: false,
      offlineRendered: false,
      nextRequired: "offlineAudioContext",
      errors: [error?.message ?? String(error)],
      scheduled,
      endedCallbacks,
    };
  }

  try {
    for (let index = 0; index < decodedPayloads.length; ++index) {
      const decoded = decodedPayloads[index];
      const schedule = scheduled[index];
      const source = audioContext.createBufferSource();
      source.buffer = createWebAudioBufferFromDecoded(audioContext, decoded);
      source.connect(audioContext.destination);
      source.onended = () => {
        endedCallbacks.push({
          cacheKey: decoded.cacheKey,
          firstEvent: decoded.firstEvent,
          order: endedCallbacks.length + 1,
        });
      };
      if (schedule.scheduledPreview) {
        source.start(schedule.startSeconds, 0, schedule.durationSeconds);
      } else {
        source.start(schedule.startSeconds);
      }
    }
    const rendered = await audioContext.startRendering();
    await Promise.resolve();
    const firstChannel = rendered.getChannelData(0);
    const renderSummary = summarizeRenderedAudioWindow(firstChannel, 0, firstChannel.length);
    const windows = scheduled.map((schedule) => ({
      cacheKey: schedule.cacheKey,
      ...summarizeRenderedAudioWindow(
        firstChannel,
        Math.floor(schedule.startSeconds * rendered.sampleRate),
        Math.min(
          Math.ceil(schedule.endSeconds * rendered.sampleRate),
          firstChannel.length,
        ),
      ),
    }));
    if (endedCallbacks.length !== scheduled.length) {
      errors.push(
        `expected ${scheduled.length} ended callbacks, observed ${endedCallbacks.length}`,
      );
    }
    if (renderSummary.nonZeroFrames <= 0 || renderSummary.maxAbsFloat <= 0) {
      errors.push("offline render was silent");
    }
    for (const window of windows) {
      if (window.nonZeroFrames <= 0 || window.maxAbsFloat <= 0) {
        errors.push(`${window.cacheKey}: rendered window was silent`);
      }
    }
    return {
      source: "browser requested audio OfflineAudioContext scheduling proof",
      ready: errors.length === 0,
      runtimePlayback: false,
      offlineRendered: true,
      nextRequired: "engineAudioEventScheduling",
      constructor: audioContext.constructor?.name ?? "OfflineAudioContext",
      scheduledSources: scheduled.length,
      endedCallbacksObserved: endedCallbacks.length,
      renderSampleRate: rendered.sampleRate,
      renderLength: rendered.length,
      renderDurationSeconds: Number(rendered.duration.toFixed(6)),
      gapSeconds,
      errors,
      scheduled,
      endedCallbacks,
      renderSummary,
      renderedWindows: windows,
    };
  } catch (error) {
    errors.push(error?.message ?? String(error));
    return {
      source: "browser requested audio OfflineAudioContext scheduling proof",
      ready: false,
      runtimePlayback: false,
      offlineRendered: false,
      nextRequired: "offlineAudioContextStartRendering",
      constructor: audioContext.constructor?.name ?? "OfflineAudioContext",
      scheduledSources: scheduled.length,
      endedCallbacksObserved: endedCallbacks.length,
      renderSampleRate,
      renderLength,
      gapSeconds,
      errors,
      scheduled,
      endedCallbacks,
    };
  }
}

function requestedAudioPlayingTypeForSections(sections) {
  if (sections?.music || sections?.speech) {
    return "PAT_Stream";
  }
  return "PAT_Sample";
}

function requestedAudioCompletionDrainForType(playingType) {
  if (playingType === "PAT_Stream") {
    return "processStoppedList -> releasePlayingAudio";
  }
  return "processPlayingList -> releasePlayingAudio";
}

function buildBrowserAudioEventLifecycleProof(decodedPayloads, scheduleProof) {
  const errors = [];
  const endedByCacheKey = new Map(
    (scheduleProof.endedCallbacks ?? []).map((entry) => [entry.cacheKey, entry]),
  );
  const scheduledByCacheKey = new Map(
    (scheduleProof.scheduled ?? []).map((entry) => [entry.cacheKey, entry]),
  );
  const events = [];
  const eventLog = [];
  let nextHandle = 9001;

  for (const decoded of decodedPayloads) {
    const schedule = scheduledByCacheKey.get(decoded.cacheKey);
    const ended = endedByCacheKey.get(decoded.cacheKey);
    const playingType = requestedAudioPlayingTypeForSections(decoded.sections);
    const handle = nextHandle++;
    const eventName = decoded.firstEvent ?? decoded.path;
    if (!schedule) {
      errors.push(`${decoded.cacheKey}: missing scheduled source`);
    }
    if (!ended) {
      errors.push(`${decoded.cacheKey}: missing ended callback`);
    }
    const event = {
      handle,
      cacheKey: decoded.cacheKey,
      eventName,
      firstSource: decoded.firstSource,
      archive: decoded.archive,
      path: decoded.path,
      sections: decoded.sections,
      request: {
        type: "AR_Play",
        queued: true,
        usePendingEvent: true,
      },
      start: {
        playingType,
        statusBeforeStart: "PS_Playing",
        webAudioNode: "AudioBufferSourceNode",
        startSeconds: schedule?.startSeconds ?? null,
        endSeconds: schedule?.endSeconds ?? null,
        sourceSampleRate: schedule?.sourceSampleRate ?? decoded.info.samplesPerSec,
        sourceFrames: schedule?.sourceFrames ?? decoded.decodedFrames,
      },
      callback: {
        observed: Boolean(ended),
        order: ended?.order ?? null,
        completionCall: "notifyOfAudioCompletion",
        completionType: playingType,
      },
      completion: {
        statusAfterCallback: "PS_Stopped",
        releasePath: requestedAudioCompletionDrainForType(playingType),
        releaseAudioEventRTS: true,
      },
    };
    events.push(event);
    eventLog.push(
      { handle, eventName, phase: "request", request: "AR_Play" },
      { handle, eventName, phase: "start", playingType, node: "AudioBufferSourceNode" },
      { handle, eventName, phase: "ended", observed: Boolean(ended), order: ended?.order ?? null },
      { handle, eventName, phase: "completion", call: "notifyOfAudioCompletion", status: "PS_Stopped" },
      { handle, eventName, phase: "release", path: event.completion.releasePath },
    );
  }

  const handles = events.map((event) => event.handle);
  const uniqueHandles = new Set(handles);
  const callbacksInOrder = [...(scheduleProof.endedCallbacks ?? [])]
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((entry) => entry.cacheKey);
  const expectedOrder = events.map((event) => event.cacheKey);
  if (uniqueHandles.size !== handles.length) {
    errors.push("synthetic audio handles are not unique");
  }
  if (callbacksInOrder.join("|") !== expectedOrder.join("|")) {
    errors.push("ended callback order does not match scheduled event order");
  }

  return {
    source: "browser requested audio event lifecycle proof",
    ready: errors.length === 0 && events.length === decodedPayloads.length,
    runtimePlayback: false,
    engineDriven: false,
    nextRequired: "replaceMilesSampleStartWithBrowserAudioDevice",
    sourceFrontiers: [
      "verify:audio-event-request-frontier",
      "verify:audio-request-update-frontier",
      "verify:audio-sample-start-frontier",
      "verify:audio-completion-frontier",
    ],
    eventsStarted: events.length,
    completionCallbacksObserved: scheduleProof.endedCallbacksObserved ?? 0,
    handlesUnique: uniqueHandles.size === handles.length,
    callbacksInScheduledOrder: callbacksInOrder.join("|") === expectedOrder.join("|"),
    errors,
    events,
    eventLog,
  };
}

function buildBrowserAudioMixerDefaults() {
  const scriptVolumes = {
    music: 1,
    sound: 1,
    sound3D: 1,
    speech: 1,
  };
  const systemVolumes = {
    music: 0.55,
    sound: 0.75,
    sound3D: 0.75,
    speech: 0.55,
  };
  const zoomVolume = 1;
  return {
    source: "GameAudio.cpp:269-282",
    formula: "busVolume = scriptVolume * systemVolume; sound3DVolume = zoomVolume * scriptSound3DVolume * systemSound3DVolume",
    scriptVolumes,
    systemVolumes,
    zoomVolume,
    busGains: computeBrowserAudioMixerGains(scriptVolumes, systemVolumes, zoomVolume),
  };
}

function requestedAudioMixerBusForDecoded(decoded) {
  if (decoded.sections?.music) {
    return {
      bus: "music",
      playingType: "PAT_Stream",
      sourceRoute: "AT_Music stream -> m_musicVolume",
    };
  }
  if (decoded.sections?.speech) {
    return {
      bus: "speech",
      playingType: "PAT_Stream",
      sourceRoute: "AT_Streaming stream -> m_speechVolume",
    };
  }
  if (decoded.firstEvent === "ArtilleryBarrageIncomingWhistle") {
    return {
      bus: "sound3D",
      playingType: "PAT_3DSample",
      sourceRoute: "world SFX 3D sample -> m_sound3DVolume",
    };
  }
  return {
    bus: "sound",
    playingType: "PAT_Sample",
    sourceRoute: "2D sample -> m_soundVolume",
  };
}

function requestedAudioMixerPreviewSeconds(decoded, durationSeconds) {
  if (decoded.sections?.music) {
    return Math.min(durationSeconds, 1);
  }
  return Math.min(durationSeconds, 0.75);
}

async function buildBrowserAudioMixerBusProof(decodedPayloads) {
  const errors = [];
  const OfflineAudioContextCtor =
    globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (typeof OfflineAudioContextCtor !== "function") {
    return {
      source: "browser requested audio Web Audio mixer bus proof",
      ready: false,
      runtimePlayback: false,
      engineDriven: false,
      nextRequired: "offlineAudioContext",
      errors: ["OfflineAudioContext is unavailable"],
      scheduled: [],
      endedCallbacks: [],
    };
  }

  const mixerDefaults = buildBrowserAudioMixerDefaults();
  const buses = Object.keys(mixerDefaults.busGains);
  const renderSampleRate = 44100;
  const gapSeconds = 0.02;
  const tailSeconds = 0.1;
  const scheduled = [];
  const scheduledByBus = Object.fromEntries(buses.map((bus) => [bus, 0]));
  let cursorSeconds = 0;

  for (const decoded of decodedPayloads) {
    const route = requestedAudioMixerBusForDecoded(decoded);
    const durationSeconds = decoded.decodedFrames / decoded.info.samplesPerSec;
    const playbackSeconds = requestedAudioMixerPreviewSeconds(decoded, durationSeconds);
    scheduledByBus[route.bus] = (scheduledByBus[route.bus] ?? 0) + 1;
    scheduled.push({
      cacheKey: decoded.cacheKey,
      archive: decoded.archive,
      path: decoded.path,
      firstEvent: decoded.firstEvent,
      firstSource: decoded.firstSource,
      sections: decoded.sections,
      bus: route.bus,
      sourceRoute: route.sourceRoute,
      playingType: route.playingType,
      busGain: mixerDefaults.busGains[route.bus],
      nodeGraph: [
        "AudioBufferSourceNode",
        `${route.bus}GainNode`,
        "AudioDestinationNode",
      ],
      startSeconds: Number(cursorSeconds.toFixed(6)),
      durationSeconds: Number(playbackSeconds.toFixed(6)),
      fullDurationSeconds: Number(durationSeconds.toFixed(6)),
      scheduledPreview: playbackSeconds < durationSeconds,
      endSeconds: Number((cursorSeconds + playbackSeconds).toFixed(6)),
      sourceSampleRate: decoded.info.samplesPerSec,
      sourceFrames: decoded.decodedFrames,
    });
    cursorSeconds += playbackSeconds + gapSeconds;
  }

  for (const bus of buses) {
    if (scheduledByBus[bus] <= 0) {
      errors.push(`no requested payload routed to ${bus} bus`);
    }
  }

  const renderLength = Math.max(1, Math.ceil((cursorSeconds + tailSeconds) * renderSampleRate));
  let audioContext;
  try {
    audioContext = new OfflineAudioContextCtor(1, renderLength, renderSampleRate);
  } catch (error) {
    return {
      source: "browser requested audio Web Audio mixer bus proof",
      ready: false,
      runtimePlayback: false,
      engineDriven: false,
      nextRequired: "offlineAudioContext",
      errors: [...errors, error?.message ?? String(error)],
      scheduled,
      endedCallbacks: [],
    };
  }

  const endedCallbacks = [];
  try {
    const busNodes = {};
    for (const bus of buses) {
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(mixerDefaults.busGains[bus], 0);
      gain.connect(audioContext.destination);
      busNodes[bus] = gain;
    }

    for (let index = 0; index < decodedPayloads.length; ++index) {
      const decoded = decodedPayloads[index];
      const schedule = scheduled[index];
      const source = audioContext.createBufferSource();
      source.buffer = createWebAudioBufferFromDecoded(audioContext, decoded);
      source.connect(busNodes[schedule.bus]);
      source.onended = () => {
        endedCallbacks.push({
          cacheKey: decoded.cacheKey,
          bus: schedule.bus,
          firstEvent: decoded.firstEvent,
          order: endedCallbacks.length + 1,
        });
      };
      if (schedule.scheduledPreview) {
        source.start(schedule.startSeconds, 0, schedule.durationSeconds);
      } else {
        source.start(schedule.startSeconds);
      }
    }

    const rendered = await audioContext.startRendering();
    await Promise.resolve();
    const firstChannel = rendered.getChannelData(0);
    const renderSummary = summarizeRenderedAudioWindow(firstChannel, 0, firstChannel.length);
    const renderedWindows = scheduled.map((schedule) => ({
      cacheKey: schedule.cacheKey,
      bus: schedule.bus,
      busGain: schedule.busGain,
      ...summarizeRenderedAudioWindow(
        firstChannel,
        Math.floor(schedule.startSeconds * rendered.sampleRate),
        Math.min(
          Math.ceil(schedule.endSeconds * rendered.sampleRate),
          firstChannel.length,
        ),
      ),
    }));
    if (endedCallbacks.length !== scheduled.length) {
      errors.push(
        `expected ${scheduled.length} mixer ended callbacks, observed ${endedCallbacks.length}`,
      );
    }
    if (renderSummary.nonZeroFrames <= 0 || renderSummary.maxAbsFloat <= 0) {
      errors.push("mixer bus offline render was silent");
    }
    for (const window of renderedWindows) {
      if (window.nonZeroFrames <= 0 || window.maxAbsFloat <= 0) {
        errors.push(`${window.cacheKey}: mixer bus rendered window was silent`);
      }
    }

    return {
      source: "browser requested audio Web Audio mixer bus proof",
      ready: errors.length === 0,
      runtimePlayback: false,
      engineDriven: false,
      offlineRendered: true,
      nextRequired: "engineDrivenWebAudioMixerBinding",
      sourceFrontiers: [
        "verify:miles-audio-volume-frontier",
        "verify:audio-music-manager-frontier",
        "verify:audio-3d-position-frontier",
      ],
      constructor: audioContext.constructor?.name ?? "OfflineAudioContext",
      mixerDefaults,
      scheduledSources: scheduled.length,
      scheduledByBus,
      endedCallbacksObserved: endedCallbacks.length,
      renderSampleRate: rendered.sampleRate,
      renderLength: rendered.length,
      renderDurationSeconds: Number(rendered.duration.toFixed(6)),
      gapSeconds,
      errors,
      scheduled,
      endedCallbacks,
      renderSummary,
      renderedWindows,
    };
  } catch (error) {
    errors.push(error?.message ?? String(error));
    return {
      source: "browser requested audio Web Audio mixer bus proof",
      ready: false,
      runtimePlayback: false,
      engineDriven: false,
      offlineRendered: false,
      nextRequired: "offlineAudioMixerRender",
      sourceFrontiers: [
        "verify:miles-audio-volume-frontier",
        "verify:audio-music-manager-frontier",
        "verify:audio-3d-position-frontier",
      ],
      constructor: audioContext.constructor?.name ?? "OfflineAudioContext",
      mixerDefaults,
      scheduledSources: scheduled.length,
      scheduledByBus,
      endedCallbacksObserved: endedCallbacks.length,
      renderSampleRate,
      renderLength,
      gapSeconds,
      errors,
      scheduled,
      endedCallbacks,
    };
  }
}

async function buildBrowserAudio3DPositioningProof(decodedPayloads) {
  const errors = [];
  const OfflineAudioContextCtor =
    globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (typeof OfflineAudioContextCtor !== "function") {
    return {
      source: "browser requested audio PannerNode 3D positioning proof",
      ready: false,
      runtimePlayback: false,
      engineDriven: false,
      nextRequired: "browserAudioDevicePannerBinding",
      errors: ["OfflineAudioContext is unavailable"],
      events: [],
    };
  }

  const target = decodedPayloads.find((decoded) =>
    decoded.firstEvent === "ArtilleryBarrageIncomingWhistle");
  if (!target) {
    return {
      source: "browser requested audio PannerNode 3D positioning proof",
      ready: false,
      runtimePlayback: false,
      engineDriven: false,
      nextRequired: "requestedWorldSfxDecodeTarget",
      errors: ["ArtilleryBarrageIncomingWhistle decode target is unavailable"],
      events: [],
    };
  }

  const renderSampleRate = 44100;
  const renderSeconds = 0.25;
  const renderLength = Math.ceil(renderSeconds * renderSampleRate);
  let audioContext;
  try {
    audioContext = new OfflineAudioContextCtor(2, renderLength, renderSampleRate);
  } catch (error) {
    return {
      source: "browser requested audio PannerNode 3D positioning proof",
      ready: false,
      runtimePlayback: false,
      engineDriven: false,
      nextRequired: "offlineAudioContext",
      errors: [error?.message ?? String(error)],
      events: [],
    };
  }

  const listenerPosition = { x: 0, y: 0, z: 0 };
  const listenerOrientation = {
    forwardX: 0,
    forwardY: 0,
    forwardZ: -1,
    upX: 0,
    upY: 1,
    upZ: 0,
  };
  const sourcePosition = { x: 600, y: 0, z: -600 };
  const sourceEvent = {
    name: target.firstEvent,
    source: "Data\\INI\\SoundEffects.ini:3570",
    soundsSource: target.firstSource,
    type: "world everyone",
    minRange: 300,
    maxRange: 2000,
    volume: 70,
    volumeShift: -20,
    limit: 4,
    priority: "normal",
  };
  const pannerConfig = {
    panningModel: "equalpower",
    distanceModel: "linear",
    refDistance: sourceEvent.minRange,
    maxDistance: sourceEvent.maxRange,
    rolloffFactor: 1,
  };

  try {
    const source = audioContext.createBufferSource();
    const panner = audioContext.createPanner();
    source.buffer = createWebAudioBufferFromDecoded(audioContext, target);
    panner.panningModel = pannerConfig.panningModel;
    panner.distanceModel = pannerConfig.distanceModel;
    panner.refDistance = pannerConfig.refDistance;
    panner.maxDistance = pannerConfig.maxDistance;
    panner.rolloffFactor = pannerConfig.rolloffFactor;
    for (const [key, value] of Object.entries(listenerPosition)) {
      setAudioParamValue(audioContext.listener, `position${key.toUpperCase()}`, value);
    }
    for (const [key, value] of Object.entries(listenerOrientation)) {
      setAudioParamValue(audioContext.listener, key, value);
    }
    for (const [key, value] of Object.entries(sourcePosition)) {
      setAudioParamValue(panner, `position${key.toUpperCase()}`, value);
    }
    source.connect(panner);
    panner.connect(audioContext.destination);
    source.start(0, 0, renderSeconds);
    const rendered = await audioContext.startRendering();
    await Promise.resolve();
    const render = summarizeStereoRenderedAudio(rendered, 0, rendered.length);
    if (render.left.nonZeroFrames <= 0 || render.right.nonZeroFrames <= 0) {
      errors.push("PannerNode render was silent");
    }
    if (Math.abs(render.rightMinusLeftRms) < 0.000001) {
      errors.push("PannerNode render did not produce observable stereo separation");
    }
    return {
      source: "browser requested audio PannerNode 3D positioning proof",
      ready: errors.length === 0,
      runtimePlayback: false,
      engineDriven: false,
      nextRequired: "engineDrivenWebAudioPannerBinding",
      sourceFrontiers: [
        "verify:audio-3d-position-frontier",
        "verify:audio-sample-start-frontier",
        "verify:miles-audio-volume-frontier",
      ],
      errors,
      events: [
        {
          cacheKey: target.cacheKey,
          archive: target.archive,
          path: target.path,
          eventName: target.firstEvent,
          firstSource: target.firstSource,
          sections: target.sections,
          sourceEvent,
          nodeGraph: ["AudioBufferSourceNode", "PannerNode", "AudioDestinationNode"],
          pannerConfig,
          listenerPosition,
          listenerOrientation,
          sourcePosition,
          render,
        },
      ],
    };
  } catch (error) {
    errors.push(error?.message ?? String(error));
    return {
      source: "browser requested audio PannerNode 3D positioning proof",
      ready: false,
      runtimePlayback: false,
      engineDriven: false,
      nextRequired: "offlinePannerRender",
      sourceFrontiers: [
        "verify:audio-3d-position-frontier",
        "verify:audio-sample-start-frontier",
        "verify:miles-audio-volume-frontier",
      ],
      errors,
      events: [],
    };
  }
}

function buildAudioDecodeAndBufferProofs(entryIndex, readEntryBytes) {
  const errors = [];
  const proofs = [];
  const decodedPayloads = [];
  for (const target of audioDecodeProofTargets) {
    const entry = entryIndex.get(normalizeBigPath(target.path));
    if (!entry) {
      errors.push(`decode proof payload not found: ${target.path}`);
      continue;
    }
    let payloadBytes;
    try {
      payloadBytes = readEntryBytes(entry.archive, entry);
    } catch (error) {
      errors.push(`${target.path}: ${error?.message ?? String(error)}`);
      continue;
    }
    if (!payloadBytes) {
      errors.push(`decode proof archive bytes not found: ${entry.archive}`);
      continue;
    }
    try {
      const decoded = decodeAudioWavPayload(payloadBytes);
      const decodedFrames = decoded.samples.length / decoded.info.channels;
      decodedPayloads.push({
        path: entry.path,
        archive: entry.archive,
        info: decoded.info,
        samples: decoded.samples,
        decodedFrames,
      });
      const proof = {
        path: entry.path,
        archive: entry.archive,
        size: entry.size,
        codec: decoded.info.codec,
        wFormatTag: decoded.info.wFormatTag,
        channels: decoded.info.channels,
        samplesPerSec: decoded.info.samplesPerSec,
        bitsPerSample: decoded.info.bitsPerSample,
        blockAlign: decoded.info.blockAlign,
        samplesPerBlock: decoded.info.samplesPerBlock,
        factSamples: decoded.info.factSamples,
        dataBytes: decoded.info.dataBytes,
        decodedFrames,
        decodedSamples: decoded.samples.length,
        durationSeconds: Number((decodedFrames / decoded.info.samplesPerSec).toFixed(6)),
        ...summarizeDecodedSamples(decoded.samples),
      };
      if (proof.codec !== target.expectedCodec) {
        errors.push(
          `${target.path} expected codec ${target.expectedCodec} but decoded ${proof.codec}`,
        );
      }
      if (proof.decodedSamples <= 0 || proof.nonZeroSamples <= 0) {
        errors.push(`${target.path} decoded to empty or silent PCM`);
      }
      proofs.push(proof);
    } catch (error) {
      errors.push(`${target.path}: ${error?.message ?? String(error)}`);
    }
  }

  return {
    decodeProofs: {
      source: "browser mounted BIG WAV decoder proof",
      ready: errors.length === 0 && proofs.length === audioDecodeProofTargets.length,
      runtimePlayback: false,
      nextRequired: "webAudioBufferUpload",
      errors,
      proofs,
    },
    webAudioBufferProofs: buildWebAudioBufferProofs(decodedPayloads),
  };
}

function selectRequestedDecodeCacheTargets(requestedPayloadCachePlan) {
  if (Array.isArray(requestedPayloadCachePlan.decodeCacheProofTargets)
      && requestedPayloadCachePlan.decodeCacheProofTargets.length > 0) {
    return requestedPayloadCachePlan.decodeCacheProofTargets;
  }
  return [
    ...(requestedPayloadCachePlan.directDecodeExamples ?? [])
      .filter((candidate) => candidate.extension === "wav" && candidate.codec === "PCM")
      .slice(0, 2)
      .map((entry) => ({ ...entry, reason: "direct requested PCM WAV" })),
    ...(requestedPayloadCachePlan.transcodeExamples ?? [])
      .filter((candidate) => candidate.extension === "wav" && candidate.codec === "IMA_ADPCM")
      .slice(0, 2)
      .map((entry) => ({ ...entry, reason: "requested IMA ADPCM WAV transcode" })),
  ];
}

async function buildRequestedAudioDecodeCacheProof(requestedPayloadCachePlan, entryIndex, readEntryBytes) {
  const errors = [];
  const entries = [];
  const decodedCache = new Map();
  const targets = selectRequestedDecodeCacheTargets(requestedPayloadCachePlan);
  if (targets.length < 5) {
    errors.push(`expected five requested MP3/WAV decode-cache targets, found ${targets.length}`);
  }

  for (const target of targets) {
    const entry = entryIndex.get(normalizeBigPath(target.path));
    if (!entry) {
      errors.push(`requested decode-cache target not found: ${target.cacheKey}`);
      continue;
    }
    if (entry.archive !== target.archive) {
      errors.push(
        `${target.cacheKey} resolved from ${entry.archive}, expected ${target.archive}`,
      );
      continue;
    }
    let payloadBytes;
    try {
      payloadBytes = readEntryBytes(target.archive, entry);
    } catch (error) {
      errors.push(`${target.cacheKey}: ${error?.message ?? String(error)}`);
      continue;
    }
    if (!payloadBytes) {
      errors.push(`requested decode-cache archive bytes not found: ${target.archive}`);
      continue;
    }

    try {
      if (target.extension === "mp3") {
        const decoded = await decodeWebAudioPayload(payloadBytes);
        const cacheEntry = {
          cacheKey: target.cacheKey,
          path: entry.path,
          archive: entry.archive,
          reason: target.reason,
          refCount: target.refCount,
          sections: target.sections,
          firstEvent: target.firstEvent,
          firstSource: target.firstSource,
          size: entry.size,
          extension: target.extension,
          codec: target.codec,
          channels: decoded.info.channels,
          samplesPerSec: decoded.info.samplesPerSec,
          decodedBy: "WebAudio.decodeAudioData",
          decodedFrames: decoded.decodedFrames,
          decodedSamples: decoded.decodedFrames * decoded.info.channels,
          decodedPcmBytes: 0,
          decodedFloatBytes: decoded.decodedFloatBytes,
          durationSeconds: Number((decoded.decodedFrames / decoded.info.samplesPerSec).toFixed(6)),
          storage: "AudioBuffer decoded by Web Audio decodeAudioData",
          ...summarizeAudioBuffer(decoded.audioBuffer),
        };
        decodedCache.set(target.cacheKey, {
          cacheKey: target.cacheKey,
          path: entry.path,
          archive: entry.archive,
          refCount: target.refCount,
          sections: target.sections,
          firstEvent: target.firstEvent,
          firstSource: target.firstSource,
          info: { ...decoded.info, codec: target.codec },
          audioBuffer: decoded.audioBuffer,
          decodedBy: "WebAudio.decodeAudioData",
          decodedFrames: decoded.decodedFrames,
          decodedFloatBytes: decoded.decodedFloatBytes,
        });
        entries.push(cacheEntry);
      } else if (target.extension === "wav") {
        const decoded = decodeAudioWavPayload(payloadBytes);
        const decodedFrames = decoded.samples.length / decoded.info.channels;
        const cacheEntry = {
          cacheKey: target.cacheKey,
          path: entry.path,
          archive: entry.archive,
          reason: target.reason,
          refCount: target.refCount,
          sections: target.sections,
          firstEvent: target.firstEvent,
          firstSource: target.firstSource,
          size: entry.size,
          extension: target.extension,
          codec: decoded.info.codec,
          wFormatTag: decoded.info.wFormatTag,
          channels: decoded.info.channels,
          samplesPerSec: decoded.info.samplesPerSec,
          bitsPerSample: decoded.info.bitsPerSample,
          blockAlign: decoded.info.blockAlign,
          samplesPerBlock: decoded.info.samplesPerBlock,
          factSamples: decoded.info.factSamples,
          dataBytes: decoded.info.dataBytes,
          decodedBy: "harnessWavDecoder",
          decodedFrames,
          decodedSamples: decoded.samples.length,
          decodedPcmBytes: decoded.samples.byteLength,
          decodedFloatBytes: 0,
          durationSeconds: Number((decodedFrames / decoded.info.samplesPerSec).toFixed(6)),
          storage: "Int16Array interleaved PCM cache entry",
          ...summarizeDecodedSamples(decoded.samples),
        };
        decodedCache.set(target.cacheKey, {
          cacheKey: target.cacheKey,
          path: entry.path,
          archive: entry.archive,
          refCount: target.refCount,
          sections: target.sections,
          firstEvent: target.firstEvent,
          firstSource: target.firstSource,
          info: decoded.info,
          samples: decoded.samples,
          decodedBy: "harnessWavDecoder",
          decodedFrames,
        });
        entries.push(cacheEntry);
      } else {
        errors.push(`${target.cacheKey}: unsupported requested decode extension ${target.extension}`);
      }
    } catch (error) {
      errors.push(`${target.cacheKey}: ${error?.message ?? String(error)}`);
    }
  }

  const webAudioBufferCache = buildWebAudioBufferProofs([...decodedCache.values()]);
  webAudioBufferCache.source = "browser requested audio AudioBuffer cache proof";
  webAudioBufferCache.nextRequired = "audioEventScheduling";
  const webAudioScheduleProof = await buildWebAudioScheduleProof([...decodedCache.values()]);
  const browserAudioEventLifecycleProof = buildBrowserAudioEventLifecycleProof(
    [...decodedCache.values()],
    webAudioScheduleProof,
  );
  const browserAudioMixerBusProof = await buildBrowserAudioMixerBusProof(
    [...decodedCache.values()],
  );
  const browserAudio3DPositioningProof = await buildBrowserAudio3DPositioningProof(
    [...decodedCache.values()],
  );
  rememberBrowserAudioRequestedDecodedCache(decodedCache);
  const decodedPcmBytes = entries.reduce((total, entry) => total + entry.decodedPcmBytes, 0);
  const decodedFloatBytes = entries.reduce((total, entry) => total + entry.decodedFloatBytes, 0);

  return {
    source: "browser requested audio decoded payload cache proof",
    ready:
      errors.length === 0 &&
      entries.length === targets.length &&
      webAudioBufferCache.ready === true &&
      webAudioScheduleProof.ready === true &&
      browserAudioEventLifecycleProof.ready === true &&
      browserAudioMixerBusProof.ready === true &&
      browserAudio3DPositioningProof.ready === true,
    metadataOnly: false,
    runtimeDecoded: true,
    runtimeScheduled: true,
    runtimePlayback: false,
    coverage: "representative requested MP3/WAV payloads from the shipped INI cache plan",
    nextRequired: "engineAudioEventScheduling",
    requestedPlanReferences: requestedPayloadCachePlan.references,
    requestedPlanUniquePayloads: requestedPayloadCachePlan.uniquePayloads,
    targets: targets.map((target) => ({
      cacheKey: target.cacheKey,
      reason: target.reason,
      refCount: target.refCount,
      sections: target.sections,
      firstEvent: target.firstEvent,
      firstSource: target.firstSource,
      codec: target.codec,
      extension: target.extension,
      size: target.size,
    })),
    cacheEntriesCreated: entries.length,
    decodedPcmBytes,
    decodedFloatBytes,
    decodedAudioBytes: decodedPcmBytes + decodedFloatBytes,
    errors,
    entries,
    webAudioBufferCache,
    webAudioScheduleProof,
    browserAudioEventLifecycleProof,
    browserAudioMixerBusProof,
    browserAudio3DPositioningProof,
  };
}

function resolveAudioPayloadCandidate(entryIndex, candidates) {
  for (const candidate of candidates) {
    const entry = entryIndex.get(normalizeBigPath(candidate));
    if (entry) {
      return {
        archive: entry.archive,
        path: entry.path,
        size: entry.size,
        offset: entry.offset,
        localized: normalizeBigPath(candidate).includes("\\english\\"),
        format: entry.format ?? null,
      };
    }
  }
  return null;
}

function collectAudioPayloadRefs(entryIndex, blocks, kind, fieldNames, listMode) {
  const wanted = new Set(fieldNames.map((field) => field.toLowerCase()));
  const refs = [];
  for (const block of blocks) {
    for (const field of block.fields) {
      if (!wanted.has(field.name.toLowerCase())) {
        continue;
      }
      const leaves = listMode ? parseAudioTokenList(field.value) : [field.value.trim()];
      for (const leaf of leaves) {
        if (!leaf) {
          continue;
        }
        const candidates = audioPayloadCandidatePaths(kind, leaf);
        refs.push({
          event: block.name,
          field: field.name,
          leaf,
          source: `${block.sourcePath}:${field.line}`,
          firstCandidate: candidates[0] ?? null,
          resolved: resolveAudioPayloadCandidate(entryIndex, candidates),
        });
      }
    }
  }
  return refs;
}

function summarizeAudioPayloadRefs(refs) {
  const resolved = refs.filter((ref) => ref.resolved);
  const missing = refs.filter((ref) => !ref.resolved);
  const uniqueLeaves = new Set(refs.map((ref) => ref.leaf.toLowerCase()));
  const archives = {};
  const formats = {};
  for (const ref of resolved) {
    archives[ref.resolved.archive] = (archives[ref.resolved.archive] ?? 0) + 1;
    const formatKey = ref.resolved.format?.extension ?? "unknown";
    incrementCount(formats, formatKey);
  }
  return {
    references: refs.length,
    uniqueLeaves: uniqueLeaves.size,
    resolved: resolved.length,
    localizedResolved: resolved.filter((ref) => ref.resolved.localized).length,
    missing: missing.length,
    archives,
    formats,
    resolvedExamples: resolved.slice(0, 5),
    missingExamples: missing.slice(0, 5),
  };
}

function newAudioRequestedCacheBucket() {
  return {
    references: 0,
    resolvedReferences: 0,
    missingReferences: 0,
    uniquePayloads: 0,
    totalBytes: 0,
    webAudioDecodeCandidates: 0,
    requiresTranscode: 0,
    unsupported: 0,
    extensions: {},
    wavCodec: {},
    archives: {},
  };
}

function addRequestedCacheUniquePayload(bucket, entry) {
  bucket.uniquePayloads += 1;
  bucket.totalBytes += entry.size;
  const extension = entry.format?.extension || "unknown";
  incrementCount(bucket.extensions, extension);
  if (entry.format?.wavFmt) {
    incrementCount(bucket.wavCodec, String(entry.format.wavFmt.wFormatTag));
  }
  if (entry.format?.webAudioDecodeCandidate) {
    bucket.webAudioDecodeCandidates += 1;
  } else if (entry.format?.requiresTranscode) {
    bucket.requiresTranscode += 1;
  } else {
    bucket.unsupported += 1;
  }
}

function addRequestedCacheArchiveRef(bucket, ref) {
  const archiveName = ref.resolved.archive;
  if (!bucket.archives[archiveName]) {
    bucket.archives[archiveName] = {
      references: 0,
      uniquePayloads: 0,
      totalBytes: 0,
    };
  }
  bucket.archives[archiveName].references += 1;
}

function addRequestedCacheArchivePayload(bucket, entry) {
  const archiveName = entry.archive;
  if (!bucket.archives[archiveName]) {
    bucket.archives[archiveName] = {
      references: 0,
      uniquePayloads: 0,
      totalBytes: 0,
    };
  }
  bucket.archives[archiveName].uniquePayloads += 1;
  bucket.archives[archiveName].totalBytes += entry.size;
}

function compactRequestedCacheEntry(entry) {
  return {
    cacheKey: `${entry.archive}|${entry.path}`,
    archive: entry.archive,
    path: entry.path,
    size: entry.size,
    refCount: entry.refCount,
    sections: entry.sections,
    firstEvent: entry.firstEvent,
    firstSource: entry.firstSource,
    extension: entry.format?.extension ?? "unknown",
    codec: entry.format?.wavFmt?.codec ?? entry.format?.magic ?? "unknown",
    webAudioDecodeCandidate: entry.format?.webAudioDecodeCandidate === true,
    requiresTranscode: entry.format?.requiresTranscode === true,
  };
}

function buildAudioRequestedPayloadCachePlan(refsBySection) {
  const summary = newAudioRequestedCacheBucket();
  const sections = {};
  const cacheEntries = new Map();

  for (const [sectionName, refs] of Object.entries(refsBySection)) {
    const section = newAudioRequestedCacheBucket();
    const sectionUniqueKeys = new Set();
    for (const ref of refs) {
      summary.references += 1;
      section.references += 1;
      if (!ref.resolved) {
        summary.missingReferences += 1;
        section.missingReferences += 1;
        continue;
      }

      summary.resolvedReferences += 1;
      section.resolvedReferences += 1;
      addRequestedCacheArchiveRef(summary, ref);
      addRequestedCacheArchiveRef(section, ref);

      const key = `${ref.resolved.archive}|${ref.resolved.path}`;
      let entry = cacheEntries.get(key);
      if (!entry) {
        entry = {
          archive: ref.resolved.archive,
          path: ref.resolved.path,
          size: ref.resolved.size,
          offset: ref.resolved.offset,
          localized: ref.resolved.localized,
          format: ref.resolved.format,
          refCount: 0,
          sections: {},
          firstEvent: ref.event,
          firstSource: ref.source,
        };
        cacheEntries.set(key, entry);
        addRequestedCacheUniquePayload(summary, entry);
        addRequestedCacheArchivePayload(summary, entry);
      }

      if (!sectionUniqueKeys.has(key)) {
        sectionUniqueKeys.add(key);
        addRequestedCacheUniquePayload(section, entry);
        addRequestedCacheArchivePayload(section, entry);
      }
      entry.refCount += 1;
      incrementCount(entry.sections, sectionName);
    }
    sections[sectionName] = section;
  }

  const sortedEntries = [...cacheEntries.values()]
    .sort((left, right) =>
      (right.refCount - left.refCount) ||
      (right.size - left.size) ||
      left.path.localeCompare(right.path));
  const largestEntries = [...cacheEntries.values()]
    .sort((left, right) => (right.size - left.size) || left.path.localeCompare(right.path))
    .slice(0, 6)
    .map(compactRequestedCacheEntry);
  const directDecodeExamples = sortedEntries
    .filter((entry) => entry.format?.webAudioDecodeCandidate)
    .slice(0, 6)
    .map(compactRequestedCacheEntry);
  const transcodeExamples = sortedEntries
    .filter((entry) => entry.format?.requiresTranscode)
    .slice(0, 6)
    .map(compactRequestedCacheEntry);
  const decodeCacheProofTargets = [];
  const decodeCacheProofTargetKeys = new Set();
  const addDecodeCacheProofEntry = (reason, found) => {
    if (!found) {
      return;
    }
    const compact = compactRequestedCacheEntry(found);
    if (decodeCacheProofTargetKeys.has(compact.cacheKey)) {
      return;
    }
    decodeCacheProofTargetKeys.add(compact.cacheKey);
    decodeCacheProofTargets.push({ ...compact, reason });
  };
  const addDecodeCacheProofTarget = (reason, predicate) => {
    addDecodeCacheProofEntry(reason, sortedEntries.find(predicate));
  };
  const musicMp3Targets = sortedEntries
    .filter((entry) => entry.sections.music && entry.format?.extension === "mp3")
    .sort((left, right) => (left.size - right.size) || left.path.localeCompare(right.path));
  addDecodeCacheProofEntry("direct requested MP3 from music", musicMp3Targets[0]);
  addDecodeCacheProofTarget(
    "direct requested PCM WAV from SFX",
    (entry) => entry.sections.soundEffects
      && entry.format?.wavFmt?.wFormatTag === 1,
  );
  addDecodeCacheProofTarget(
    "direct requested PCM WAV from voice",
    (entry) => entry.sections.voices
      && entry.format?.wavFmt?.wFormatTag === 1,
  );
  addDecodeCacheProofTarget(
    "requested IMA ADPCM WAV transcode from SFX",
    (entry) => entry.sections.soundEffects
      && entry.format?.wavFmt?.wFormatTag === 17,
  );
  addDecodeCacheProofTarget(
    "requested IMA ADPCM WAV transcode from speech",
    (entry) => entry.sections.speech
      && entry.format?.wavFmt?.wFormatTag === 17,
  );

  return {
    source: "shipped audio INI resolved payload cache plan",
    ready: summary.resolvedReferences > 0 && summary.uniquePayloads > 0,
    metadataOnly: true,
    runtimeDecoded: false,
    runtimeScheduled: false,
    nextRequired: summary.requiresTranscode > 0
      ? "decodeResolvedImaAdpcmPayloads"
      : "decodeResolvedPayloads",
    ...summary,
    sections,
    cacheKeyExamples: sortedEntries.slice(0, 8).map(compactRequestedCacheEntry),
    largestEntries,
    directDecodeExamples,
    transcodeExamples,
    decodeCacheProofTargets,
  };
}

async function buildAudioPayloadInventoryFromMountedArchives(wasmModule, archives) {
  // Readers stay open across the scan (directory, entry-header sampling, INI
  // text, decode/cache proofs) and always close on the way out, including the
  // early ok:false returns.
  const openArchiveReaders = [];
  try {
    return await buildAudioPayloadInventoryWithReaders(wasmModule, archives, openArchiveReaders);
  } finally {
    for (const reader of openArchiveReaders) {
      reader.close();
    }
  }
}

async function buildAudioPayloadInventoryWithReaders(wasmModule, archives, openArchiveReaders) {
  const mountedArchives = [];
  const entryIndex = new Map();
  const iniFiles = {};
  const iniTexts = {};
  const payloadFormats = newAudioFormatSummary("mounted BIG Data\\Audio entry headers");
  payloadFormats.archives = {};
  const archiveReadersByName = new Map();

  for (const archive of archives.filter(isAudioPayloadRelevantArchive)) {
    let reader;
    try {
      reader = openMountedArchiveReader(wasmModule.fs, archive.path);
    } catch (error) {
      return {
        ok: false,
        source: "browser mounted BIG directory + shipped audio INI parser",
        error: error?.message ?? String(error),
      };
    }
    openArchiveReaders.push(reader);
    archiveReadersByName.set(archive.name, reader);
    if (archive.sourceName) {
      archiveReadersByName.set(archive.sourceName, reader);
    }

    let entries;
    try {
      entries = await readBigDirectoryFromReader(reader, archive.name);
    } catch (error) {
      return {
        ok: false,
        source: "browser mounted BIG directory + shipped audio INI parser",
        error: error?.message ?? String(error),
      };
    }

    const archiveFormats = newAudioFormatSummary(`${archive.name} Data\\Audio entry headers`);
    for (const entry of entries) {
      if (entry.normalizedPath.startsWith("data\\audio\\")) {
        entry.format = classifyAudioPayloadFormat(
          reader.readAt(entry.offset, audioPayloadHeaderSampleBytes),
          entry,
        );
        addAudioFormatSummaryEntry(archiveFormats, entry);
        addAudioFormatSummaryEntry(payloadFormats, entry);
      }
      if (!entryIndex.has(entry.normalizedPath)) {
        entryIndex.set(entry.normalizedPath, entry);
      }
    }
    if (archiveFormats.entryCount > 0) {
      payloadFormats.archives[archive.name] = archiveFormats;
    }

    mountedArchives.push({
      name: archive.name,
      sourceName: archive.sourceName,
      entries: entries.length,
      audioPayloadEntries: archiveFormats.entryCount,
      bytes: archive.bytes,
    });

    for (const iniPath of audioPayloadIniPaths) {
      if (iniTexts[iniPath]) {
        continue;
      }
      const entry = entries.find((candidate) =>
        candidate.normalizedPath === normalizeBigPath(iniPath));
      if (entry) {
        iniTexts[iniPath] = decodeMountedBigTextBytes(reader.readAt(entry.offset, entry.size));
        iniFiles[iniPath] = {
          present: true,
          archive: archive.name,
          size: entry.size,
        };
      }
    }
  }

  for (const iniPath of audioPayloadIniPaths) {
    if (!iniFiles[iniPath]) {
      iniFiles[iniPath] = { present: false };
    }
  }

  const musicBlocks = iniTexts["Data\\INI\\Music.ini"]
    ? parseAudioPayloadBlocks(iniTexts["Data\\INI\\Music.ini"], "Data\\INI\\Music.ini", ["MusicTrack"])
    : [];
  const soundBlocks = [
    ...(iniTexts["Data\\INI\\Default\\SoundEffects.ini"]
      ? parseAudioPayloadBlocks(
        iniTexts["Data\\INI\\Default\\SoundEffects.ini"],
        "Data\\INI\\Default\\SoundEffects.ini",
        ["AudioEvent"],
      )
      : []),
    ...(iniTexts["Data\\INI\\SoundEffects.ini"]
      ? parseAudioPayloadBlocks(
        iniTexts["Data\\INI\\SoundEffects.ini"],
        "Data\\INI\\SoundEffects.ini",
        ["AudioEvent"],
      )
      : []),
  ];
  const voiceBlocks = iniTexts["Data\\INI\\Voice.ini"]
    ? parseAudioPayloadBlocks(iniTexts["Data\\INI\\Voice.ini"], "Data\\INI\\Voice.ini", ["AudioEvent"])
    : [];
  const speechBlocks = iniTexts["Data\\INI\\Speech.ini"]
    ? parseAudioPayloadBlocks(iniTexts["Data\\INI\\Speech.ini"], "Data\\INI\\Speech.ini", ["DialogEvent"])
    : [];

  const refsBySection = {
    music: collectAudioPayloadRefs(entryIndex, musicBlocks, "music", ["Filename"], false),
    soundEffects: collectAudioPayloadRefs(
      entryIndex,
      soundBlocks,
      "sound",
      ["Sounds", "SoundsNight", "SoundsEvening", "SoundsMorning", "Attack", "Decay"],
      true,
    ),
    voices: collectAudioPayloadRefs(
      entryIndex,
      voiceBlocks,
      "sound",
      ["Sounds", "SoundsNight", "SoundsEvening", "SoundsMorning", "Attack", "Decay"],
      true,
    ),
    speech: collectAudioPayloadRefs(entryIndex, speechBlocks, "streaming", ["Filename"], false),
  };
  const sections = {
    music: {
      sourceBlocks: musicBlocks.length,
      summary: summarizeAudioPayloadRefs(refsBySection.music),
    },
    soundEffects: {
      sourceBlocks: soundBlocks.length,
      summary: summarizeAudioPayloadRefs(refsBySection.soundEffects),
    },
    voices: {
      sourceBlocks: voiceBlocks.length,
      summary: summarizeAudioPayloadRefs(refsBySection.voices),
    },
    speech: {
      sourceBlocks: speechBlocks.length,
      summary: summarizeAudioPayloadRefs(refsBySection.speech),
    },
  };

  const requiredArchives = Object.fromEntries(
    audioPayloadArchiveNames.map((name) => [
      name,
      mountedArchives.some((archive) => archive.name === name || archive.sourceName === name),
    ]),
  );
  const knownPayloads = Object.fromEntries(
    audioPayloadKnownPaths.map((path) => [path, entryIndex.has(normalizeBigPath(path))]),
  );
  const knownPayloadFormats = Object.fromEntries(
    audioPayloadKnownPaths.map((path) => {
      const entry = entryIndex.get(normalizeBigPath(path));
      return [path, entry?.format ?? null];
    }),
  );
  const audioArchivesReady = Object.values(requiredArchives).every(Boolean);
  const knownPayloadsReady = Object.values(knownPayloads).every(Boolean);
  const referencedPayloadsReady = Object.values(sections)
    .every((section) => section.summary.resolved > 0);
  const audioSettingsPresent = Boolean(iniFiles["Data\\INI\\AudioSettings.ini"]?.present);
  const audioStartupArchiveContract = buildAudioStartupArchiveContract(iniFiles, mountedArchives);
  payloadFormats.webAudioDecodeCandidateReady =
    payloadFormats.entryCount > 0 &&
    payloadFormats.requiresTranscode === 0 &&
    payloadFormats.unsupported === 0;
  payloadFormats.runtimeDecoded = false;
  payloadFormats.nextRequired = payloadFormats.unsupported > 0
    ? "unsupportedAudioFormat"
    : payloadFormats.requiresTranscode > 0
      ? "imaAdpcmDecoder"
      : "decodeAudioDataHarness";
  // On-demand partial reads for the handful of proof payloads; returns null
  // when the archive is not part of the scanned reader set.
  const readEntryBytes = (archiveName, entry) => {
    const reader = archiveReadersByName.get(archiveName);
    if (!reader) {
      return null;
    }
    return reader.readAt(entry.offset, entry.size);
  };
  const audioProofs = buildAudioDecodeAndBufferProofs(entryIndex, readEntryBytes);
  const decodeProofs = audioProofs.decodeProofs;
  const webAudioBufferProofs = audioProofs.webAudioBufferProofs;
  const requestedPayloadCachePlan = buildAudioRequestedPayloadCachePlan(refsBySection);
  const requestedPayloadDecodeCacheProof = await buildRequestedAudioDecodeCacheProof(
    requestedPayloadCachePlan,
    entryIndex,
    readEntryBytes,
  );
  if (decodeProofs.ready && webAudioBufferProofs.ready && payloadFormats.nextRequired === "imaAdpcmDecoder") {
    payloadFormats.nextRequired = "requestedPayloadDecodeCache";
  } else if (decodeProofs.ready && payloadFormats.nextRequired === "imaAdpcmDecoder") {
    payloadFormats.nextRequired = "webAudioBufferUpload";
  }

  return {
    ok: audioArchivesReady && knownPayloadsReady && referencedPayloadsReady,
    ready: audioArchivesReady && knownPayloadsReady && referencedPayloadsReady,
    source: "browser mounted BIG directory + shipped audio INI parser",
    pathRulesSource: "AudioEventRTS.cpp + INIAudioEventInfo.cpp + GameAudio.cpp",
    runtimeReady: false,
    nextRequired: audioStartupArchiveContract.ready ? "browserAudioDevice" : "audioStartupArchives",
    audioSettings: {
      present: audioSettingsPresent,
      candidateSettings: audioPayloadCandidateSettings,
    },
    audioStartupArchiveContract,
    requiredArchives,
    knownPayloads,
    knownPayloadFormats,
    iniFiles,
    archiveCount: mountedArchives.length,
    indexedEntries: entryIndex.size,
    audioArchives: mountedArchives
      .filter((archive) => audioPayloadArchiveNames.includes(archive.name)),
    payloadFormats,
    decodeProofs,
    webAudioBufferProofs,
    requestedPayloadCachePlan,
    requestedPayloadDecodeCacheProof,
    sections,
    note: "Resolved means a candidate path exists in mounted BIG directories; payloadFormats sniffs container headers, decodeProofs decodes two WAV payloads to PCM metadata, webAudioBufferProofs uploads those decoded samples into Web Audio AudioBuffers, requestedPayloadCachePlan dedupes all resolved INI-requested payloads, and requestedPayloadDecodeCacheProof creates representative decoded MP3/WAV cache entries plus OfflineAudioContext preview scheduling, lifecycle, Web Audio mixer bus, and PannerNode 3D-positioning proofs for requested payload keys without audible runtime playback.",
  };
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

function ensureFixedMemfsDirectory(fs, path) {
  let current = "";
  for (const part of String(path).split("/").filter(Boolean)) {
    if (part === "." || part === "..") {
      throw new Error(`Invalid fixed MEMFS directory: ${path}`);
    }
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

// ---------------------------------------------------------------------------
// IO worker client.
//
// A dedicated module Web Worker (harness/io_worker.mjs) streams archive
// downloads straight into OPFS (fetchToOpfs) for the threaded mount path and
// garbage-collects per-boot OPFS namespaces. The MEMFS-era whole-buffer
// `fetchArchive` transfer command was deleted 2026-07-10 with the play-page
// legacy path; the surviving MEMFS mounts (harness/index.html legacy-boot
// surface) fetch inline on the main thread.
let ioWorkerInstance = null;
let ioWorkerNextId = 1;
let ioWorkerDisabled = false;
const ioWorkerPending = new Map();

function ioWorkerEnabled() {
  if (ioWorkerDisabled) {
    return false;
  }
  return typeof Worker === "function";
}

function ensureIoWorker() {
  if (ioWorkerInstance || !ioWorkerEnabled()) {
    return ioWorkerInstance;
  }
  try {
    const workerUrl = browserAssetUrl("./io_worker.mjs");
    const worker = new Worker(workerUrl, { type: "module" });
    worker.onmessage = (event) => {
      const message = event.data ?? {};
      const pending = ioWorkerPending.get(message.id);
      if (!pending) {
        return; // e.g. the initial { id: 0, kind: "ready" } announcement.
      }
      if (message.ok && message.kind === "progress") {
        // Interim streamed-fetch progress: notify without settling the request.
        try {
          pending.onProgress?.(message);
        } catch (_progressError) {
          // Progress observers are UI-only; they must never break the fetch.
        }
        return;
      }
      ioWorkerPending.delete(message.id);
      if (message.ok) {
        pending.resolve(message);
      } else {
        pending.reject(new Error(message.error ?? "IO worker error"));
      }
    };
    worker.onerror = (event) => {
      // A hard worker failure disables the worker path for the rest of the
      // session and rejects every in-flight request so callers fall back.
      ioWorkerDisabled = true;
      const error = new Error(event?.message ?? "IO worker crashed");
      for (const [, pending] of ioWorkerPending) {
        pending.reject(error);
      }
      ioWorkerPending.clear();
      try {
        worker.terminate();
      } catch (_terminateError) {
        // ignore
      }
      ioWorkerInstance = null;
    };
    ioWorkerInstance = worker;
  } catch (_error) {
    ioWorkerDisabled = true;
    ioWorkerInstance = null;
  }
  return ioWorkerInstance;
}

function ioWorkerRequest(request, transfer = [], onProgress = null) {
  const worker = ensureIoWorker();
  if (!worker) {
    return Promise.reject(new Error("IO worker unavailable"));
  }
  const id = ioWorkerNextId++;
  return new Promise((resolve, reject) => {
    ioWorkerPending.set(id, { resolve, reject, onProgress });
    try {
      worker.postMessage({ ...request, id }, transfer);
    } catch (error) {
      ioWorkerPending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// P2 "OPFS as the disk" (threaded mode): stream one archive straight into an
// OPFS file on the IO worker. The bytes are NEVER RAM-resident anywhere —
// each fetch chunk is written through a FileSystemSyncAccessHandle as it
// arrives — and the worker's streamed progress messages keep feeding the
// play UI exactly like fetchArchive. Resolves { bytesWritten, status }.
async function fetchArchiveToOpfsOffThread(url, opfsPath, onProgress = null) {
  const response = await ioWorkerRequest({ kind: "fetchToOpfs", url, opfsPath }, [], onProgress);
  return { bytesWritten: Number(response.bytesWritten), status: response.status };
}

// Release the OPFS exclusive locks (engine realm's staged handles + any
// in-flight IO-worker handles) as soon as the page starts going away —
// browsers reap a dead page's workers asynchronously, and until then those
// locks would collide with the NEXT boot's mount. Best-effort: delivery
// during teardown is not guaranteed (the per-boot namespace + GC in
// mountArchivesToOpfs is the hard guarantee; this just releases early in the
// common case).
if (cncPortThreadedMode && typeof window !== "undefined") {
  const releaseOpfsLocksOnPageHide = () => {
    try {
      threadedEngine?.postCommand({ cmd: "releaseOpfsHandles" });
    } catch (_error) {
      // realm port not connected yet
    }
    try {
      ioWorkerInstance?.postMessage({ kind: "releaseHandles" });
    } catch (_error) {
      // worker gone
    }
  };
  window.addEventListener("pagehide", releaseOpfsLocksOnPageHide);
}

// Archive mount progress -> page UI. The mount path publishes coarse
// per-archive progress (streamed fetch bytes, the blocking memfs write, and
// completion) as a DOM CustomEvent so play.html can render a real loading bar
// without touching the RPC surface. Dispatch is best-effort only: a missing
// DOM or a throwing listener must never affect the mount itself.
function emitArchiveProgress(detail) {
  try {
    globalThis.dispatchEvent?.(new CustomEvent("cnc-archive-progress", { detail }));
  } catch (_error) {
    // Progress UI is optional; ignore.
  }
}

function archiveFetchProgressReporter(archive, context = null) {
  return (progress) => {
    emitArchiveProgress({
      phase: "fetch",
      name: archive.name,
      url: archive.url,
      received: Number(progress?.received ?? 0),
      total: Number(progress?.total ?? 0),
      ...(context ?? {}),
    });
  };
}

// How many archives the OPFS mount downloads concurrently (io_worker
// fetchToOpfs streams). `window.__cncFetchParallel = false` (page:
// ?fetchpar=0) opts out to strictly sequential downloads.
const ARCHIVE_FETCH_PARALLELISM = 3;

function archiveFetchParallelism() {
  try {
    if (globalThis.__cncFetchParallel === false) {
      return 1;
    }
  } catch (_error) {
    // No override available; use the default below.
  }
  return ioWorkerEnabled() ? ARCHIVE_FETCH_PARALLELISM : 1;
}

// Download one archive's bytes with an inline main-thread fetch (MEMFS
// mounts are the non-threaded harness/index.html legacy-boot surface only;
// the threaded/OPFS mount path streams through the IO worker instead).
// Returns { bytes, reader } or { error } for an HTTP failure (network errors
// throw).
async function fetchArchiveBytesInline(archive, onProgress = null) {
  const response = await fetch(archive.url);
  if (!response.ok) {
    return {
      error: `${archive.name} fetch failed: ${response.status} ${response.statusText}`,
    };
  }
  const contentLength = Number(response.headers.get("content-length"));
  const total = Number.isSafeInteger(contentLength) && contentLength > 0 ? contentLength : 0;
  onProgress?.({ url: archive.url, received: 0, total });
  const bytes = new Uint8Array(await response.arrayBuffer());
  onProgress?.({ url: archive.url, received: bytes.byteLength, total: total || bytes.byteLength });
  return { bytes, reader: "main-thread fetch" };
}

async function writeArchiveToMemfs(wasmModule, payload, baseDirectory = "/assets", options = {}) {
  const archive = archivePathFromPayload(payload, baseDirectory);
  if (archive.error) {
    return archive;
  }
  const emitProgress = options.emitProgress !== false;
  const progressContext = options.progressContext ?? null;
  const reportPhase = (phase, byteLength) => {
    if (!emitProgress) {
      return;
    }
    emitArchiveProgress({
      phase,
      name: archive.name,
      url: archive.url,
      received: byteLength,
      total: byteLength,
      ...(progressContext ?? {}),
    });
  };

  const fetched = await fetchArchiveBytesInline(
    archive,
    emitProgress ? archiveFetchProgressReporter(archive, progressContext) : null,
  );
  if (fetched.error) {
    return { error: fetched.error };
  }
  const bytes = fetched.bytes;
  const reader = fetched.reader;

  reportPhase("write", bytes.byteLength);
  // Give the page a task boundary to paint the "mounting <name>" state before
  // the multi-hundred-MB synchronous FS.writeFile memcpy blocks the thread.
  await new Promise((resolveYield) => setTimeout(resolveYield, 0));

  ensureMemfsDirectory(wasmModule.fs, parentDirectory(archive.memfsPath));
  wasmModule.fs.writeFile(archive.memfsPath, bytes);
  reportPhase("done", bytes.byteLength);

  return {
    name: archive.name,
    sourceName: String(payload.sourceName ?? archive.name),
    path: archive.memfsPath,
    bytes: bytes.byteLength,
    reader,
  };
}

function probeObjectIni(wasmModule, archivePath) {
  const raw = wasmModule.probeObjectIni(archivePath);
  let probe = null;
  try {
    probe = JSON.parse(raw);
  } catch (error) {
    probe = { ok: false, error: `object INI probe returned invalid JSON: ${error}`, raw };
  }
  harnessState.objectIniProbe = probe;
  harnessState.wasm = "loaded";
  return probe;
}

function probeArchive(wasmModule, archivePath) {
  applyModuleState(parseModuleState(wasmModule.probeArchive(archivePath)));
  harnessState.wasm = "loaded";
  return harnessState.assetProbe;
}

function normalizedArchiveBaseName(name) {
  return String(name ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .pop()
    ?.toLowerCase() ?? "";
}

function isOptionalBaseArchive(archive) {
  const names = [
    normalizedArchiveBaseName(archive?.sourceName),
    normalizedArchiveBaseName(archive?.name),
  ];
  return names.some((name) =>
    name === "ini.big"
      || name === "english.big"
      || name === "window.big"
      || name === "terrain.big"
      || name === "textures.big"
      || name === "zzbase_ini.big"
      || name === "zzbase_english.big"
      || name === "zzbase_window.big"
      || name === "zzbase_terrain.big"
      || name === "zzbase_textures.big");
}

function archiveProbeOkForMount(assetProbe, archive) {
  if (assetProbe?.ok) {
    return true;
  }
  return isOptionalBaseArchive(archive)
    && assetProbe?.loaded === true
    && Number(assetProbe?.indexedFiles ?? 0) > 0
    && Number(assetProbe?.sampleBytes ?? 0) > 0;
}

function registerArchiveSet(wasmModule, archiveSet) {
  const directory = archiveSet.path.endsWith("/") ? archiveSet.path : `${archiveSet.path}/`;
  const fileMask = archiveSet.probePath.slice(archiveSet.probePath.lastIndexOf("/") + 1) || "*.big";
  const archiveManifest = archiveSet.archives
    .map((archive) => {
      const name = String(archive.name ?? "").replaceAll("\t", " ").replaceAll("\n", " ");
      const sourceName = String(archive.sourceName ?? archive.name ?? "")
        .replaceAll("\t", " ")
        .replaceAll("\n", " ");
      return `${name}\t${sourceName}`;
    })
    .join("\n");
  applyModuleState(parseModuleState(wasmModule.registerArchiveSet(
    directory,
    fileMask,
    archiveSet.archiveCount,
    archiveSet.totalBytes,
    archiveManifest,
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
    CapsLock: 0x14,
    Escape: 0x1b,
    Space: 0x20,
    PageUp: 0x21,
    PageDown: 0x22,
    End: 0x23,
    Home: 0x24,
    Insert: 0x2d,
    Delete: 0x2e,
    ArrowLeft: 0x25,
    ArrowUp: 0x26,
    ArrowRight: 0x27,
    ArrowDown: 0x28,
    Numpad0: 0x60,
    Numpad1: 0x61,
    Numpad2: 0x62,
    Numpad3: 0x63,
    Numpad4: 0x64,
    Numpad5: 0x65,
    Numpad6: 0x66,
    Numpad7: 0x67,
    Numpad8: 0x68,
    Numpad9: 0x69,
    NumpadMultiply: 0x6a,
    NumpadAdd: 0x6b,
    NumpadSubtract: 0x6d,
    NumpadDecimal: 0x6e,
    NumpadDivide: 0x6f,
    F1: 0x70,
    F2: 0x71,
    F3: 0x72,
    F4: 0x73,
    F5: 0x74,
    F6: 0x75,
    F7: 0x76,
    F8: 0x77,
    F9: 0x78,
    F10: 0x79,
    F11: 0x7a,
    F12: 0x7b,
    Semicolon: 0xba,
    Equal: 0xbb,
    Comma: 0xbc,
    Minus: 0xbd,
    Period: 0xbe,
    Slash: 0xbf,
    Backquote: 0xc0,
    BracketLeft: 0xdb,
    Backslash: 0xdc,
    BracketRight: 0xdd,
    Quote: 0xde,
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

function directInputScanCodeFromEvent(event) {
  const code = String(event.code ?? "");
  const scanCodes = {
    Escape: 0x01,
    Digit1: 0x02,
    Digit2: 0x03,
    Digit3: 0x04,
    Digit4: 0x05,
    Digit5: 0x06,
    Digit6: 0x07,
    Digit7: 0x08,
    Digit8: 0x09,
    Digit9: 0x0a,
    Digit0: 0x0b,
    Minus: 0x0c,
    Equal: 0x0d,
    Backspace: 0x0e,
    Tab: 0x0f,
    KeyQ: 0x10,
    KeyW: 0x11,
    KeyE: 0x12,
    KeyR: 0x13,
    KeyT: 0x14,
    KeyY: 0x15,
    KeyU: 0x16,
    KeyI: 0x17,
    KeyO: 0x18,
    KeyP: 0x19,
    BracketLeft: 0x1a,
    BracketRight: 0x1b,
    Enter: 0x1c,
    ControlLeft: 0x1d,
    KeyA: 0x1e,
    KeyS: 0x1f,
    KeyD: 0x20,
    KeyF: 0x21,
    KeyG: 0x22,
    KeyH: 0x23,
    KeyJ: 0x24,
    KeyK: 0x25,
    KeyL: 0x26,
    Semicolon: 0x27,
    Quote: 0x28,
    Backquote: 0x29,
    ShiftLeft: 0x2a,
    Backslash: 0x2b,
    KeyZ: 0x2c,
    KeyX: 0x2d,
    KeyC: 0x2e,
    KeyV: 0x2f,
    KeyB: 0x30,
    KeyN: 0x31,
    KeyM: 0x32,
    Comma: 0x33,
    Period: 0x34,
    Slash: 0x35,
    ShiftRight: 0x36,
    NumpadMultiply: 0x37,
    AltLeft: 0x38,
    Space: 0x39,
    CapsLock: 0x3a,
    F1: 0x3b,
    F2: 0x3c,
    F3: 0x3d,
    F4: 0x3e,
    F5: 0x3f,
    F6: 0x40,
    F7: 0x41,
    F8: 0x42,
    F9: 0x43,
    F10: 0x44,
    Numpad7: 0x47,
    Numpad8: 0x48,
    Numpad9: 0x49,
    NumpadSubtract: 0x4a,
    Numpad4: 0x4b,
    Numpad5: 0x4c,
    Numpad6: 0x4d,
    NumpadAdd: 0x4e,
    Numpad1: 0x4f,
    Numpad2: 0x50,
    Numpad3: 0x51,
    Numpad0: 0x52,
    NumpadDecimal: 0x53,
    F11: 0x57,
    F12: 0x58,
    NumpadEnter: 0x9c,
    ControlRight: 0x9d,
    NumpadDivide: 0xb5,
    AltRight: 0xb8,
    Home: 0xc7,
    ArrowUp: 0xc8,
    PageUp: 0xc9,
    ArrowLeft: 0xcb,
    ArrowRight: 0xcd,
    End: 0xcf,
    ArrowDown: 0xd0,
    PageDown: 0xd1,
    Insert: 0xd2,
    Delete: 0xd3,
  };
  return Object.prototype.hasOwnProperty.call(scanCodes, code) ? scanCodes[code] : -1;
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
  // Map into the engine's own client coordinate space (TheDisplay
  // resolution, cached from real frames) - the engine hit-tests menus and
  // units in that space, not in canvas pixels. Fall back to canvas size for
  // pre-real-init probe pages.
  const targetWidth = harnessState.engineDisplaySize?.width ?? canvas.width;
  const targetHeight = harnessState.engineDisplaySize?.height ?? canvas.height;

  let contentLeft = rect.left;
  let contentTop = rect.top;
  let contentWidth = rect.width;
  let contentHeight = rect.height;

  // The canvas is displayed with `object-fit: contain` in BOTH windowed and
  // fullscreen (see harness.css #viewport), so when the drawing-buffer aspect
  // does not match the element-box aspect (e.g. a 4:3 render in a 16:9 box) the
  // rendered content is CENTERED and LETTERBOXED inside the element rect -- the
  // game only occupies a sub-rectangle. Compute that content box from the buffer
  // aspect so clicks / building placement land on the right engine point instead
  // of being offset by the black letterbox bars. When the buffer aspect matches
  // the box (e.g. the dynamic "Native" option) this degenerates to the full rect.
  // Threaded mode: the placeholder's width/height attributes freeze at their
  // transfer-time values (the worker owns the real backing size), so use the
  // engine display size relayed through the worker status messages instead.
  const bufferWidth = cncPortThreadedMode ? targetWidth : canvas.width;
  const bufferHeight = cncPortThreadedMode ? targetHeight : canvas.height;
  if (rect.width > 0 && rect.height > 0
      && bufferWidth > 0 && bufferHeight > 0) {
    const scale = Math.min(rect.width / bufferWidth, rect.height / bufferHeight);
    contentWidth = bufferWidth * scale;
    contentHeight = bufferHeight * scale;
    contentLeft = rect.left + (rect.width - contentWidth) / 2;
    contentTop = rect.top + (rect.height - contentHeight) / 2;
  }

  const scaleX = contentWidth > 0 ? targetWidth / contentWidth : 1;
  const scaleY = contentHeight > 0 ? targetHeight / contentHeight : 1;
  const x = Math.max(0, Math.min(targetWidth - 1, Math.round((event.clientX - contentLeft) * scaleX)));
  const y = Math.max(0, Math.min(targetHeight - 1, Math.round((event.clientY - contentTop) * scaleY)));
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

function browserPointerCaptureSupported() {
  return typeof canvas.setPointerCapture === "function"
    && typeof canvas.releasePointerCapture === "function";
}

function recordBrowserPointerCaptureEvent(eventName, event, overrides = {}) {
  const pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
  harnessState.browserPointerCapture = {
    ...harnessState.browserPointerCapture,
    supported: browserPointerCaptureSupported(),
    lastEvent: {
      name: eventName,
      pointerId,
      clientX: Number.isFinite(event?.clientX) ? event.clientX : null,
      clientY: Number.isFinite(event?.clientY) ? event.clientY : null,
    },
    ...overrides,
  };
}

function claimBrowserPointerCapture(event) {
  if (!browserPointerCaptureSupported()) {
    recordBrowserPointerCaptureEvent("pointerdown-unsupported", event, {
      active: false,
      pointerId: null,
    });
    return;
  }

  try {
    canvas.setPointerCapture(event.pointerId);
    recordBrowserPointerCaptureEvent("pointerdown-claim", event, {
      active: true,
      pointerId: event.pointerId,
      claims: harnessState.browserPointerCapture.claims + 1,
      lastError: null,
    });
  } catch (error) {
    recordBrowserPointerCaptureEvent("pointerdown-claim-error", event, {
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

function releaseBrowserPointerCapture(event) {
  if (!browserPointerCaptureSupported()) {
    recordBrowserPointerCaptureEvent("pointerup-unsupported", event, {
      active: false,
      pointerId: null,
    });
    return;
  }

  const pointerId = harnessState.browserPointerCapture.pointerId ?? event.pointerId;
  try {
    if (Number.isFinite(pointerId) && canvas.hasPointerCapture?.(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    recordBrowserPointerCaptureEvent("pointerup-release", event, {
      active: false,
      pointerId: null,
      releases: harnessState.browserPointerCapture.releases + 1,
      lastError: null,
    });
  } catch (error) {
    recordBrowserPointerCaptureEvent("pointerup-release-error", event, {
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

function resetBrowserPointerCaptureState() {
  const pointerId = harnessState.browserPointerCapture.pointerId;
  if (browserPointerCaptureSupported()
      && Number.isFinite(pointerId)
      && canvas.hasPointerCapture?.(pointerId)) {
    try {
      canvas.releasePointerCapture(pointerId);
    } catch (error) {
      harnessState.browserPointerCapture.lastError =
        error instanceof Error ? error.message : String(error);
    }
  }

  harnessState.browserPointerCapture = {
    source: "browser_dom_pointer_capture",
    supported: browserPointerCaptureSupported(),
    active: false,
    pointerId: null,
    claims: 0,
    releases: 0,
    gotEvents: 0,
    lostEvents: 0,
    lastEvent: null,
    lastError: harnessState.browserPointerCapture.lastError,
  };
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
  directInputCode = -1,
  timestamp = 0,
  win32Message = null,
} = {}) {
  if (cncPortThreadedMode) {
    // Same forwarding as the lite path (the full-state JSON round trip is a
    // main-thread wasm call and cannot run while the engine thread owns wasm).
    await pushBrowserInputToWasmLite({
      cursor, virtualKey, keyDown, directInputCode, timestamp, win32Message,
    });
    return snapshotState();
  }
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
  if (directInputCode >= 0) {
    const queued = wasmModule.dinputQueueKey(
      directInputCode,
      keyDown ? 1 : 0,
      Math.max(0, Math.floor(timestamp || performance.now())),
    );
    harnessState.browserDirectInput = {
      source: "browser_directinput_keyboard_queue",
      lastCode: directInputCode,
      lastDown: Boolean(keyDown),
      queued: queued === 1,
      queuedKeyCount: wasmModule.dinputQueuedKeyCount(),
    };
  }
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
  refreshBrowserDirectInputQueue(wasmModule);
  harnessState.wasm = "loaded";
  return snapshotState();
}

// Hot input path for live DOM events (pointermove/keydown/wheel fire at
// device rate during play). Uses the "_lite" wasm entry points that apply
// the exact same input/queue semantics but skip the ~170KB full-state JSON
// build + JSON.parse + snapshotState that the probe-oriented path above pays
// per call — that per-event churn was measured as the main GC/jank driver.
// Harness RPCs keep the full-state path so state assertions stay possible;
// rpc("state") rebuilds fresh state on demand for anything that polls it.
async function pushBrowserInputToWasmLite({
  cursor = null,
  virtualKey = -1,
  keyDown = false,
  directInputCode = -1,
  timestamp = 0,
  win32Message = null,
} = {}) {
  if (cncPortThreadedMode) {
    // Forward the SAME lite numeric calls over the realm port; the engine
    // realm applies them in order between frames (engine_realm_boot.mjs).
    // Pure pointermoves omit the key fields so the outbox can coalesce them.
    try {
      await threadedEngine.ensureReady();
      const entry = {
        cursor,
        win32: win32Message ? {
          message: win32Message.message,
          wParam: win32Message.wParam ?? 0,
          lParam: win32Message.lParam ?? 0,
          px: win32Message.point?.x ?? cursor?.x ?? 0,
          py: win32Message.point?.y ?? cursor?.y ?? 0,
        } : null,
      };
      if (virtualKey >= 0 || keyDown) {
        entry.virtualKey = virtualKey;
        entry.keyDown = keyDown;
      }
      if (directInputCode >= 0) {
        entry.directInputCode = directInputCode;
        entry.timestamp = timestamp || performance.now();
        entry.keyDown = keyDown;
      }
      threadedEngine.forwardInput(entry);
    } catch (_error) {
      // Realm not ready yet (archive download phase) — input is droppable.
    }
    return null;
  }
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  if (!wasmModule.setBrowserInputLite || !wasmModule.postBrowserMessageLite) {
    // Older wasm build without the lite exports: fall back to the full path.
    return pushBrowserInputToWasm({
      cursor, virtualKey, keyDown, directInputCode, timestamp, win32Message,
    });
  }

  wasmModule.setBrowserInputLite(
    cursor?.x ?? 0,
    cursor?.y ?? 0,
    cursor ? 1 : 0,
    virtualKey,
    keyDown ? 1 : 0,
  );
  if (directInputCode >= 0) {
    wasmModule.dinputQueueKey(
      directInputCode,
      keyDown ? 1 : 0,
      Math.max(0, Math.floor(timestamp || performance.now())),
    );
  }
  if (win32Message) {
    wasmModule.postBrowserMessageLite(
      win32Message.message,
      win32Message.wParam ?? 0,
      win32Message.lParam ?? 0,
      win32Message.point?.x ?? cursor?.x ?? 0,
      win32Message.point?.y ?? cursor?.y ?? 0,
    );
  }
  return null;
}

async function postBrowserMessageToWasm({
  message,
  wParam = 0,
  lParam = 0,
  point = null,
} = {}) {
  if (cncPortThreadedMode) {
    try {
      await threadedEngine.ensureReady();
      threadedEngine.forwardInput({
        cursor: point,
        win32: {
          message: Number(message),
          wParam: Number(wParam),
          lParam: Number(lParam),
          px: point?.x ?? 0,
          py: point?.y ?? 0,
        },
      });
    } catch (_error) {
      // Realm not ready yet — droppable.
    }
    return snapshotState();
  }
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
  if (cncPortThreadedMode) {
    resetDoubleClickState();
    resetBrowserPointerCaptureState();
    try {
      await threadedEngine.ensureReady();
      threadedEngine.forwardInput({ reset: true });
    } catch (_error) {
      // Realm not ready yet — droppable.
    }
    return snapshotState();
  }
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  resetDoubleClickState();
  resetBrowserPointerCaptureState();
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
    const keyboardFocusLost = await queueOriginalKeyboardFocusLost();
    if (!keyboardFocusLost) {
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

async function probeWin32GameEngine() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }
  const probe = parseModuleState(wasmModule.probeWin32GameEngine());
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

async function probeOriginalGuiMouseStream() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalGuiMouseStream());
  harnessState.originalGuiMouseInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeOriginalCursorVisibility({ visible = true } = {}) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalCursorVisibility(visible ? 1 : 0));
  harnessState.originalWndProcInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeOriginalKeyboardInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalKeyboardInput());
  harnessState.originalKeyboardInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeOriginalKeyboardFrameTick() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalKeyboardFrameTick());
  harnessState.originalKeyboardFrameTick = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function setOriginalKeyboardFrameInputEnabled(enabled) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.setOriginalKeyboardFrameInput(enabled ? 1 : 0));
  harnessState.originalKeyboardFrameInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function resetOriginalKeyboardFrameInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.resetOriginalKeyboardFrameInput());
  harnessState.originalKeyboardFrameInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeOriginalKeyboardFrameInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalKeyboardFrameInput());
  harnessState.originalKeyboardFrameInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function setOriginalMouseFrameInputEnabled(enabled) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.setOriginalMouseFrameInput(enabled ? 1 : 0));
  harnessState.originalMouseFrameInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function resetOriginalMouseFrameInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.resetOriginalMouseFrameInput());
  harnessState.originalMouseFrameInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeOriginalMouseFrameInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalMouseFrameInput());
  harnessState.originalMouseFrameInput = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function probeOriginalMouseFrameWindows() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.probeOriginalMouseFrameWindows());
  harnessState.originalMouseFrameWindows = probe;
  applyModuleState(parseModuleState(wasmModule.state()));
  harnessState.wasm = "loaded";
  return probe;
}

async function resolveOriginalMouseFrameWindowId(name) {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  return wasmModule.resolveOriginalMouseFrameWindowId(String(name ?? ""));
}

function knownOriginalMouseFrameWidgets(windowProbe) {
  const windows = Array.isArray(windowProbe?.windows) ? windowProbe.windows : [];
  return windows
    .filter((window) => window?.name && window.clickable === true)
    .map((window) => window.name);
}

function originalMouseFrameWidgetFromWindows(windowProbe, name) {
  const windows = Array.isArray(windowProbe?.windows) ? windowProbe.windows : [];
  const knownWidgets = knownOriginalMouseFrameWidgets(windowProbe);
  const window = windows.find((candidate) => candidate?.name === name);
  if (!window) {
    return {
      error: `Unknown original mouse frame widget: ${name}`,
      knownWidgets,
    };
  }

  const id = Number(window.id);
  const nameKey = Number(window.nameKey);
  const x = Number(window.x);
  const y = Number(window.y);
  const width = Number(window.width);
  const height = Number(window.height);
  const clickX = Number(window.clickX);
  const clickY = Number(window.clickY);
  if (window.clickable !== true
      || window.kind !== "GadgetPushButton"
      || !Number.isFinite(id)
      || id <= 0
      || !Number.isFinite(nameKey)
      || nameKey !== id
      || !Number.isFinite(x)
      || !Number.isFinite(y)
      || !Number.isFinite(width)
      || !Number.isFinite(height)
      || !Number.isFinite(clickX)
      || !Number.isFinite(clickY)
      || width <= 0
      || height <= 0
      || window.clickInside !== true) {
    return {
      error: `Original mouse frame widget is not ready: ${name}`,
      knownWidgets,
    };
  }

  return {
    name,
    id,
    nameKey,
    kind: window.kind,
    rect: { x, y, width, height },
    point: {
      x: clickX,
      y: clickY,
    },
    window,
  };
}

async function clickOriginalMouseFrameWidget(payload = {}) {
  const name = String(payload.name ?? "frameMouseProbeButton");

  const windowProbe = await probeOriginalMouseFrameWindows();
  if (!windowProbe) {
    return {
      ok: false,
      command: "clickOriginalMouseFrameWidget",
      name,
      error: "Wasm module unavailable; original Mouse frame windows cannot be probed",
      state: snapshotState(),
    };
  }

  const widget = originalMouseFrameWidgetFromWindows(windowProbe, name);
  if (widget.error) {
    return {
      ok: false,
      command: "clickOriginalMouseFrameWidget",
      name,
      error: widget.error,
      knownWidgets: widget.knownWidgets,
      windowProbe,
      state: snapshotState(),
    };
  }

  let beforeProbe = await probeOriginalMouseFrameInput();
  if (!beforeProbe?.initialized || !beforeProbe?.gui?.buttonReady) {
    beforeProbe = await resetOriginalMouseFrameInput();
  }
  if (!beforeProbe) {
    return {
      ok: false,
      command: "clickOriginalMouseFrameWidget",
      name,
      error: "Wasm module unavailable; original Mouse frame input cannot be probed",
      state: snapshotState(),
    };
  }
  if (beforeProbe.enabled !== true) {
    beforeProbe = await setOriginalMouseFrameInputEnabled(true);
  }

  const point = widget.point;
  const lParam = win32PointLParam(point);
  const selectedBefore = Number(beforeProbe.gui?.buttonSelected ?? 0);

  const movePostState = await postBrowserMessageToWasm({
    message: win32Messages.mouseMove,
    lParam,
    point,
  });
  const downPostState = await postBrowserMessageToWasm({
    message: win32Messages.leftButtonDown,
    lParam,
    point,
  });
  if (!movePostState || !downPostState) {
    return {
      ok: false,
      command: "clickOriginalMouseFrameWidget",
      name,
      widget,
      error: "Wasm module unavailable; original Mouse frame button down cannot be queued",
      state: snapshotState(),
    };
  }

  await stepFrames({ count: 1 });
  const downProbe = await probeOriginalMouseFrameInput();
  const downFrameQueueCount = harnessState.browserInput?.messageQueue?.count ?? null;

  const upPostState = await postBrowserMessageToWasm({
    message: win32Messages.leftButtonUp,
    lParam,
    point,
  });
  if (!upPostState) {
    return {
      ok: false,
      command: "clickOriginalMouseFrameWidget",
      name,
      widget,
      error: "Wasm module unavailable; original Mouse frame button up cannot be queued",
      state: snapshotState(),
    };
  }

  await stepFrames({ count: 1 });
  const upProbe = await probeOriginalMouseFrameInput();
  const upFrameQueueCount = harnessState.browserInput?.messageQueue?.count ?? null;
  const windowProbeAfter = await probeOriginalMouseFrameWindows();
  const downMessages = downProbe?.stream?.messages ?? [];
  const upMessages = upProbe?.stream?.messages ?? [];
  const selectedAfter = Number(upProbe?.gui?.buttonSelected ?? 0);
  const targetWindowAfter = windowProbeAfter?.windows?.find(
    (window) => window?.name === "frameMouseProbeTarget",
  );
  const ok = Boolean(
    downProbe?.enabled === true
      && downProbe?.lastRan === true
      && downProbe?.commandList?.countAfterPropagate === 0
      && downProbe?.gui?.buttonGrabbed === true
      && downProbe?.gui?.buttonSelected === selectedBefore
      && downProbe?.gui?.targetHidden === true
      && downMessages.some((message) =>
        message.typeName === "MSG_RAW_MOUSE_LEFT_BUTTON_DOWN"
        && message.x === point.x
        && message.y === point.y)
      && upProbe?.enabled === true
      && upProbe?.lastRan === true
      && upProbe?.commandList?.countAfterPropagate === 0
      && upProbe?.gui?.buttonGrabbed === false
      && upProbe?.gui?.buttonSelectedSourceMatches === true
      && upProbe?.gui?.buttonSelectedX === point.x
      && upProbe?.gui?.buttonSelectedY === point.y
      && upProbe?.gui?.targetShownBySelection === true
      && upProbe?.gui?.targetShowCount === 1
      && upProbe?.gui?.targetHidden === false
      && targetWindowAfter?.hidden === false
      && targetWindowAfter?.noInput === true
      && selectedAfter === selectedBefore + 1
      && upMessages.some((message) =>
        message.typeName === "MSG_RAW_MOUSE_LEFT_BUTTON_UP"
        && message.x === point.x
        && message.y === point.y)
      && harnessState.browserInput?.messageQueue?.count === 0
  );

  return {
    ok,
    command: "clickOriginalMouseFrameWidget",
    name,
    widget,
    windowProbe,
    windowProbeAfter,
    targetWindowAfter,
    selectedBefore,
    selectedAfter,
    targetHiddenBefore: beforeProbe?.gui?.targetHidden ?? null,
    targetHiddenAfter: upProbe?.gui?.targetHidden ?? null,
    down: {
      postQueueCount: downPostState.browserInput?.messageQueue?.count ?? null,
      frameQueueCount: downFrameQueueCount,
      probe: downProbe,
    },
    up: {
      postQueueCount: upPostState.browserInput?.messageQueue?.count ?? null,
      frameQueueCount: upFrameQueueCount,
      probe: upProbe,
    },
    state: snapshotState(),
  };
}

async function resetOriginalKeyboardInput() {
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.resetOriginalKeyboardInput());
  harnessState.originalKeyboardInput = probe;
  harnessState.wasm = "loaded";
  return probe;
}

async function queueOriginalKeyboardFocusLost() {
  if (cncPortThreadedMode) {
    // Focus-lost queueing touches the engine's keyboard state — run it on the
    // engine thread; the probe JSON return is not needed for the focus path.
    try {
      await threadedEngine.engineCall(
        "cnc_port_queue_original_keyboard_focus_lost", "string", [], [],
        { timeoutMs: 30000, parseJson: true });
    } catch (error) {
      recordLog("threaded focus-lost queue failed", { error: error?.message ?? String(error) });
    }
    return snapshotState();
  }
  const wasmModule = await wasmModulePromise;
  if (!wasmModule) {
    return null;
  }

  const probe = parseModuleState(wasmModule.queueOriginalKeyboardFocusLost());
  harnessState.originalKeyboardInput = probe;
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
    const cause = cncPortModuleLoadError ? ` (${cncPortModuleLoadError})` : "";
    return { error: `Wasm module unavailable; archive cannot be mounted${cause}`, command };
  }
  return { wasmModule };
}

// Drives the REAL engine lifecycle: original CreateGameEngine() ->
// Win32GameEngine -> GameEngine::init(argc, argv) with -noshellmap -win.
// The frontier is computed from the actual run (SubsystemInterfaceList
// instrumentation + stdout trace); an abort inside init() (RELEASE_CRASH ->
// _exit) is caught here at the JS boundary and reported with the last
// in-flight subsystem.
async function realEngineInit(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("realEngineInit");
  if (moduleResult.error) {
    return { ok: false, command: "realEngineInit", error: moduleResult.error };
  }
  const wasmModule = moduleResult.wasmModule;
  const runDirectory = String(payload.runDirectory ?? "/assets/runtime");
  const useShellMap = payload.shellMap === true ? 1 : 0;
  const traceStart = harnessState.logs.length;
  let frontier = null;
  let aborted = false;
  let abortMessage = null;
  // Boot render resolution: hand the page's target (dynamic canvas-fit or the
  // persisted fixed setting) to the engine BEFORE init so GameEngine's
  // INIT_STEP_GLOBAL_DATA applies it and the device is created directly at the
  // target size (no 800x600-then-resize flash). Absent/invalid => stock boot.
  const bootWidth = Math.round(Number(payload.bootWidth ?? 0));
  const bootHeight = Math.round(Number(payload.bootHeight ?? 0));
  if (bootWidth >= 640 && bootHeight >= 480
      && typeof wasmModule.realEngineSetBootResolution === "function") {
    wasmModule.realEngineSetBootResolution(bootWidth, bootHeight);
  }
  const useStepped = payload.stepped === true
    && typeof wasmModule.realEngineInitBegin === "function"
    && typeof wasmModule.realEngineInitStep === "function";
  if (useStepped) {
    // Stepped init: GameEngine::init's body runs as an ordered step sequence
    // (see GameEngine.cpp runNextInitStep); each slice returns to the event
    // loop so the page can paint boot progress and the main thread never
    // blocks for the whole init. Progress is broadcast per slice as a
    // "cncport:initprogress" CustomEvent for the boot overlay.
    const stepBudgetMs = Number(payload.stepBudgetMs ?? 200);
    try {
      const begin = JSON.parse(wasmModule.realEngineInitBegin(runDirectory, useShellMap));
      if (begin?.ok !== true && begin?.initReturned !== true) {
        aborted = true;
        abortMessage = `init_begin failed: ${begin?.exception ?? "unknown"}`;
      }
      while (!aborted) {
        const step = JSON.parse(wasmModule.realEngineInitStep(stepBudgetMs));
        harnessState.realEngineInitProgress = step;
        try {
          window.dispatchEvent(new CustomEvent("cncport:initprogress", { detail: step }));
        } catch {
          // no DOM (worker context) — progress still visible via state RPC
        }
        if (step?.ok !== true) {
          aborted = true;
          abortMessage = `init_step failed: ${step?.exception ?? "unknown"}`;
          break;
        }
        if (step?.done === true) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      aborted = true;
      abortMessage = error?.message ?? String(error);
    }
    try {
      frontier = JSON.parse(wasmModule.realEngineFrontier());
    } catch {
      frontier = null; // runtime tore down before the frontier could be read
    }
  } else {
    try {
      frontier = JSON.parse(wasmModule.realEngineInit(runDirectory, useShellMap));
    } catch (error) {
      aborted = true;
      abortMessage = error?.message ?? String(error);
      try {
        frontier = JSON.parse(wasmModule.realEngineFrontier());
      } catch {
        frontier = null; // runtime tore down before the frontier could be read
      }
    }
  }
  const traceLines = harnessState.logs
    .slice(traceStart)
    .map((entry) => entry?.data?.text)
    .filter((text) => typeof text === "string"
      && (text.startsWith("cnc-port: real-init") || text.startsWith("cnc-port: RELEASE_CRASH")));
  const releaseCrash = traceLines.find((text) => text.startsWith("cnc-port: RELEASE_CRASH")) ?? null;
  const started = traceLines
    .filter((text) => text.startsWith("cnc-port: real-init subsystem-start "))
    .map((text) => text.slice("cnc-port: real-init subsystem-start ".length));
  const completed = traceLines
    .filter((text) => text.startsWith("cnc-port: real-init subsystem-done "))
    .map((text) => text.slice("cnc-port: real-init subsystem-done ".length));
  const pushed = traceLines
    .filter((text) => text.startsWith("cnc-port: real-init subsystem-push-after "))
    .map((text) => text.slice("cnc-port: real-init subsystem-push-after ".length));
  const lastStarted = started.length > 0 ? started[started.length - 1] : null;
  const inFlight = lastStarted !== null && !completed.includes(lastStarted) ? lastStarted : null;
  recordLog("real engine init", {
    runDirectory,
    aborted,
    abortMessage,
    releaseCrash,
    subsystemsCompleted: completed.length,
    inFlightSubsystem: inFlight,
    initReturned: Boolean(frontier?.initReturned),
  });
  harnessState.realEngineInit = {
    attempted: true,
    runDirectory,
    aborted,
    abortMessage,
    releaseCrash,
    trace: traceLines,
    subsystemsCompleted: completed,
    subsystemsPushed: pushed,
    inFlightSubsystem: inFlight,
    frontier,
  };
  return {
    ok: Boolean(frontier?.initReturned) && !aborted,
    command: "realEngineInit",
    runDirectory,
    aborted,
    abortMessage,
    releaseCrash,
    trace: traceLines,
    subsystemsCompleted: completed,
    subsystemsPushed: pushed,
    inFlightSubsystem: inFlight,
    frontier,
    state: snapshotState(),
  };
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

// ---------------------------------------------------------------------------
// P2 threaded mount path: archives live on OPFS, not MEMFS (design:
// notes/p1-engine-thread.md "P2-prep results"; IDEAS.md "the browser as a
// 2003 PC"). In threaded mode every archive is streamed fetch->OPFS on the
// IO worker (never RAM-resident), a 0-byte MEMFS MARKER file is created at
// the engine path (FindFirstFile's *.big enumeration walks MEMFS via
// readdir+stat; open() is then intercepted to OPFS by the shims/io.h seam in
// src/wasm_opfs_files.cpp), and the {enginePath -> opfsPath} map is staged
// in the ENGINE pthread's realm (opfs_realm_files.mjs pre-opens the sync
// access handles) BEFORE the engine pthread spawns — the async handle opens
// need the pool worker's free event loop (P1a ordering rule), which awaiting
// the staging round trip here guarantees: play.html only calls
// realEngineInit (boot+go) after the mount resolves.
//
// No cache/skip layer (owner rule): OPFS is the read disk, every boot
// re-streams the archive set into a fresh per-boot namespace directory and
// garbage-collects namespaces whose owner page is gone (Web Lock released),
// so disk usage stays bounded at one archive set per LIVE tab.
//
// The non-threaded MEMFS mount path below survives ONLY as the
// harness/index.html legacy-boot surface (the non-threaded probe/gate pages
// and A/B-debug boots of the non-threaded dist); the play page can no longer
// reach it (threaded/OPFS-only since 2026-07-10).
const OPFS_ARCHIVE_ROOT = "cnc-archives";
// Per-boot OPFS namespace (owner regression 2026-07-10 hardening): staged
// FileSystemSyncAccessHandles hold EXCLUSIVE per-file locks for the page
// lifetime, and a reloaded page's old engine worker is not reaped
// synchronously — so rewriting fixed paths every boot could collide with a
// stale holder (NoModificationAllowedError) and kill the whole mount. Every
// mount therefore writes into a fresh <root>/ns-<bootId>-<seq>/ directory
// (fresh names can never be lock-held), the page marks its namespaces as
// LIVE by holding a Web Lock named `${OPFS_NAMESPACE_LOCK_PREFIX}<bootId>`
// (auto-released on page death, unlike OPFS handles), and every mount first
// asks the IO worker to garbage-collect namespaces whose owner lock is gone.
// A second live tab keeps its lock -> its namespace survives -> both tabs
// work independently instead of one failing with a raw mount error.
const OPFS_NAMESPACE_LOCK_PREFIX = "cnc-port-opfs-ns:";
const opfsBootId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let opfsMountSequence = 0;
let opfsNamespaceLockPromise = null;

function acquireOpfsNamespaceLock() {
  if (opfsNamespaceLockPromise) {
    return opfsNamespaceLockPromise;
  }
  opfsNamespaceLockPromise = new Promise((resolve) => {
    try {
      if (!navigator.locks || typeof navigator.locks.request !== "function") {
        resolve(false);
        return;
      }
      navigator.locks.request(
        `${OPFS_NAMESPACE_LOCK_PREFIX}${opfsBootId}`,
        { mode: "exclusive", ifAvailable: true },
        (lock) => {
          resolve(lock !== null);
          // Hold the lock until the page dies (bootId is per-page random, so
          // nobody else ever waits on it).
          return lock === null ? null : new Promise(() => {});
        },
      ).catch(() => resolve(false));
    } catch (_error) {
      resolve(false);
    }
  });
  return opfsNamespaceLockPromise;
}
const opfsRegisteredPrefixes = new Set();

function opfsArchiveMountEnabled() {
  // Threaded mode mounts on OPFS, period (the ?opfsmount=0 MEMFS escape
  // hatch was deleted with the play-page legacy path, 2026-07-10). fetchToOpfs
  // needs the IO worker (sync access handles are worker-only); if the worker
  // cannot start, mountArchivesToOpfs fails LOUDLY instead of silently
  // degrading to a MEMFS mount the engine thread could not read.
  return cncPortThreadedMode && Boolean(threadedEngine);
}

function opfsPathForArchive(namespace, memfsPath) {
  return `${OPFS_ARCHIVE_ROOT}/${namespace}${memfsPath}`;
}

// Register the fd-intercept prefix (process-global wasm state). Pre-boot the
// main thread still owns the wasm (exactly like the MEMFS mount's FS
// writes); once the engine thread runs, the call routes through the engine
// realm instead — main never calls wasm exports in threaded mode after boot.
async function registerOpfsInterceptPrefix(prefix) {
  if (opfsRegisteredPrefixes.has(prefix)) {
    return { ok: true };
  }
  let rc;
  if (threadedEngine.engineThreadStarted) {
    rc = await threadedEngine.engineCall(
      "cnc_port_opfs_register_prefix", "number", ["string"], [prefix], { parseJson: false });
  } else {
    rc = cncPortEmscriptenModule.cwrap(
      "cnc_port_opfs_register_prefix", "number", ["string"])(prefix);
  }
  if (!(Number(rc) >= 1)) {
    return { ok: false, error: `cnc_port_opfs_register_prefix(${prefix}) rc=${rc}` };
  }
  opfsRegisteredPrefixes.add(prefix);
  return { ok: true };
}

async function mountArchivesToOpfs(wasmModule, payload, archiveInputs, baseDirectory) {
  const emitProgressEvents = payload.progressEvents !== false;
  const parsedArchives = archiveInputs.map((input) => archivePathFromPayload(input, baseDirectory));
  const parseError = parsedArchives.find((archive) => archive.error);
  if (parseError) {
    return { ok: false, command: "mountArchives", error: parseError.error };
  }

  // The staging command rides the realm port — realm prep must be complete.
  await threadedEngine.ensureReady();

  // Fresh per-mount namespace under the archive root; mark it live (Web
  // Lock) BEFORE collecting garbage so a concurrent tab's GC never deletes
  // files we are about to write, then reclaim dead namespaces (previous
  // boots) best-effort. GC failures are non-fatal by design: the fresh
  // namespace never collides with a stale lock holder.
  const namespace = `ns-${opfsBootId}-${++opfsMountSequence}`;
  const namespaceLockHeld = await acquireOpfsNamespaceLock();
  let namespaceGc = null;
  try {
    namespaceGc = await ioWorkerRequest({
      kind: "opfsCollectNamespaces",
      root: OPFS_ARCHIVE_ROOT,
      keep: [namespace],
      lockPrefix: OPFS_NAMESPACE_LOCK_PREFIX,
    });
    recordLog("opfs namespace gc", {
      namespace,
      lockHeld: namespaceLockHeld,
      removed: namespaceGc.removed,
      kept: namespaceGc.kept,
      failed: namespaceGc.failed,
    });
  } catch (error) {
    recordLog("opfs namespace gc failed", { namespace, error: error?.message ?? String(error) });
  }

  // Bounded-parallel streamed downloads (same fetch parallelism as the MEMFS
  // pipeline); there is no sequential write phase, so archives complete in
  // whatever order the network delivers while `results` keeps input order.
  const parallelism = Math.max(1, Math.min(archiveFetchParallelism(), parsedArchives.length));
  const results = new Array(parsedArchives.length).fill(null);
  let nextDownloadIndex = 0;
  const downloadWorker = async () => {
    for (;;) {
      const index = nextDownloadIndex++;
      if (index >= parsedArchives.length) {
        return;
      }
      const archive = parsedArchives[index];
      const progressContext = { index, count: parsedArchives.length };
      const onProgress = emitProgressEvents
        ? archiveFetchProgressReporter(archive, progressContext)
        : null;
      const opfsPath = opfsPathForArchive(namespace, archive.memfsPath);
      try {
        const { bytesWritten } = await fetchArchiveToOpfsOffThread(archive.url, opfsPath, onProgress);
        results[index] = { bytesWritten, opfsPath };
        if (emitProgressEvents) {
          emitArchiveProgress({
            phase: "done",
            name: archive.name,
            url: archive.url,
            received: bytesWritten,
            total: bytesWritten,
            ...progressContext,
          });
        }
      } catch (error) {
        results[index] = {
          error: `${archive.name} fetchToOpfs failed: ${error?.message ?? String(error)}`,
        };
      }
    }
  };
  await Promise.all(Array.from({ length: parallelism }, downloadWorker));

  const archives = [];
  const stageMap = {};
  for (let index = 0; index < parsedArchives.length; index += 1) {
    const parsed = parsedArchives[index];
    const result = results[index];
    if (!result || result.error) {
      return {
        ok: false,
        command: "mountArchives",
        error: result?.error ?? `${parsed.name} download did not complete`,
        archives,
        opfsNamespace: namespace,
        opfsNamespaceGc: namespaceGc,
      };
    }
    // 0-byte MEMFS marker at the engine path (directory-enumeration
    // contract, proven by probe:p2-opfs). Known caveat: stat/getFileInfo see
    // size 0 / mtime 0 — cover the stat path in the intercept if something
    // is proven to care.
    ensureMemfsDirectory(wasmModule.fs, parentDirectory(parsed.memfsPath));
    wasmModule.fs.writeFile(parsed.memfsPath, new Uint8Array(0));
    stageMap[parsed.memfsPath] = result.opfsPath;
    const input = archiveInputs[index];
    const expectedBytes = Number(input.expectedBytes ?? input.bytes ?? result.bytesWritten);
    archives.push({
      name: parsed.name,
      sourceName: String(input.sourceName ?? parsed.name),
      path: parsed.memfsPath,
      bytes: result.bytesWritten,
      reader: "io-worker fetchToOpfs",
      opfsPath: result.opfsPath,
      expectedBytes,
      bytesMatch: result.bytesWritten === expectedBytes,
    });
  }

  const prefix = baseDirectory.endsWith("/") ? baseDirectory : `${baseDirectory}/`;
  const registered = await registerOpfsInterceptPrefix(prefix);
  if (!registered.ok) {
    return { ok: false, command: "mountArchives", error: registered.error, archives };
  }

  let staging = null;
  try {
    staging = await threadedEngine.sendCommand(
      { cmd: "stageOpfsFiles", map: stageMap },
      { timeoutMs: 120000 },
    );
  } catch (error) {
    return {
      ok: false,
      command: "mountArchives",
      error: `OPFS realm staging failed: ${error?.message ?? String(error)}`,
      archives,
    };
  }
  if (staging?.ok !== true) {
    return {
      ok: false,
      command: "mountArchives",
      error: `OPFS realm staging failed: ${staging?.error ?? "unknown"}`,
      archives,
    };
  }

  rememberMountedArchives(archives);
  // The archive bytes never enter MEMFS, so the main-side audio payload
  // inventory scan (diagnostics consumed by state snapshots and the
  // non-threaded runtime-archives smoke) cannot read them here; mark it
  // skipped explicitly instead of failing it with a confusing read error.
  harnessState.audioPayloadInventory = {
    ok: false,
    skipped: true,
    source: "threaded OPFS mounts",
    error: "archive bytes live on OPFS in threaded mode; main-side inventory scan skipped",
  };

  // No probeArchive verification: the probe opens archives through the
  // engine's C++ path on the MAIN thread, whose realm has no staged OPFS
  // handles (it would read the 0-byte markers). Byte counts from the
  // streamed writes + the engine's own init (which opens every archive on
  // the engine thread) are the verification on this path.
  const ok = archives.every((archive) => archive.bytesMatch);
  const totalBytes = archives.reduce((sum, archive) => sum + archive.bytes, 0);
  const archiveSet = {
    path: baseDirectory,
    probePath: `${baseDirectory}/*.big`,
    archiveCount: archives.length,
    totalBytes,
    backing: "opfs",
    opfsNamespace: namespace,
    opfsNamespaceGc: namespaceGc,
    stagedPaths: staging.stagedPaths ?? [],
    archives,
    probes: [],
  };
  if (ok) {
    registerArchiveSet(wasmModule, archiveSet);
  }

  recordLog("archive set mounted (opfs)", {
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

  if (opfsArchiveMountEnabled()) {
    return mountArchivesToOpfs(moduleResult.wasmModule, payload, archiveInputs, baseDirectory);
  }

  // MEMFS mounts survive ONLY as the harness/index.html legacy-boot surface
  // (non-threaded probe/gate pages and A/B-debug boots of the non-threaded
  // dist). The play-page fetch-ahead pipeline that overlapped downloads with
  // the sequential writes was deleted with the play-page legacy path
  // (2026-07-10): archives fetch inline and mount strictly sequentially.
  const emitProgressEvents = payload.progressEvents !== false;

  const archives = [];
  const archiveProbes = [];
  for (let index = 0; index < archiveInputs.length; index += 1) {
    const input = archiveInputs[index];
    const archive = await writeArchiveToMemfs(moduleResult.wasmModule, input, baseDirectory, {
      emitProgress: emitProgressEvents,
      progressContext: { index, count: archiveInputs.length },
    });
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
      const probeOk = archiveProbeOkForMount(assetProbe, archive);
      archiveProbes.push({
        name: archive.name,
        sourceName: archive.sourceName,
        path: archive.path,
        ok: probeOk,
        strictOk: Boolean(assetProbe.ok),
        optionalBaseArchive: isOptionalBaseArchive(archive),
        loaded: Boolean(assetProbe.loaded),
        indexedFiles: assetProbe.indexedFiles,
        sampleBytes: assetProbe.sampleBytes,
      });
    }
  }

  const probePath = `${baseDirectory}/*.big`;
  const aggregateProbe = probeArchive(moduleResult.wasmModule, probePath);
  rememberMountedArchives(archives);
  harnessState.audioPayloadInventory = await buildAudioPayloadInventoryFromMountedArchives(
    moduleResult.wasmModule,
    harnessState.mountedArchives,
  );

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

function readBigUInt32BE(bytes, offset) {
  return bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3];
}

function appendBytes(left, right) {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

async function rpc(command, payload = {}) {
  // Owner directive 2026-07-10: never silently boot the legacy single-thread
  // path when threaded mode was requested but this origin cannot run it.
  // Refuse the boot-critical commands loudly (the page is redirecting to the
  // HTTPS origin, or blocked with instructions).
  if (cncPortThreadedUnsupported
      && (command === "boot" || command === "mountArchive"
        || command === "mountArchives" || command === "realEngineInit")) {
    return {
      ok: false,
      command,
      error: `${cncPortThreadedUnsupported.reason} — boot refused `
        + "(owner directive: no single-thread fallback; "
        + (cncPortThreadedUnsupported.action === "redirect"
          ? `redirecting to ${cncPortThreadedUnsupported.target})`
          : "serve over https:// or open via http://localhost)"),
      threadedUnsupported: { ...cncPortThreadedUnsupported },
    };
  }
  if (cncPortThreadedMode) {
    // Threaded routing choke point: engine-touching commands execute ON the
    // engine thread via the realm port; pure-JS commands fall through; the
    // rest answer with an explicit unsupported error (never a main-thread
    // wasm call, never a hang). See threadedRpc above.
    const routed = await threadedRpc(command, payload);
    if (routed !== undefined) {
      return routed;
    }
  }
  switch (command) {
    case "boot":
      return { ok: true, command, state: await boot(payload) };
    case "frame":
      return { ok: true, command, state: await stepFrames(payload) };
    case "mountArchive":
      return mountArchive(payload);
    case "probeObjectIniSnippet":
      {
        const moduleResult = await getWasmModuleForArchives("probeObjectIniSnippet");
        if (moduleResult.error) {
          return { ok: false, command, error: moduleResult.error };
        }
        const path = typeof payload.path === "string" && payload.path.length > 0
          ? payload.path
          : "/assets/INIZH.big";
        const snippetPath = "/assets/__object_ini_snippet.ini";
        moduleResult.wasmModule.fs.writeFile(snippetPath, String(payload.snippetText ?? ""));
        const raw = moduleResult.wasmModule.probeObjectIniSnippet(path, snippetPath);
        let probe = null;
        try {
          probe = JSON.parse(raw);
        } catch (error) {
          probe = { ok: false, error: `snippet probe returned invalid JSON: ${error}`, raw };
        }
        return { ok: Boolean(probe?.ok), command, probe, state: snapshotState() };
      }
    case "probeObjectIni":
      {
        const moduleResult = await getWasmModuleForArchives("probeObjectIni");
        if (moduleResult.error) {
          return { ok: false, command, error: moduleResult.error };
        }
        const path = typeof payload.path === "string" && payload.path.length > 0
          ? payload.path
          : "/assets/INIZH.big";
        const probe = probeObjectIni(moduleResult.wasmModule, path);
        recordLog("object INI probe", {
          path,
          ok: Boolean(probe?.ok),
          templateCount: probe?.templateCount ?? 0,
        });
        return { ok: Boolean(probe?.ok), command, probe, state: snapshotState() };
      }
    case "mountArchives":
      return mountArchives(payload);
    case "realEngineInit":
      return realEngineInit(payload);
    case "persistSaves":
      // Flush MEMFS -> IndexedDB so newly written ".sav" files survive a reload.
      // Call this after the in-game Save dialog reports success.
      {
        const result = await persistSaveFilesystem(String(payload.reason ?? "rpc"));
        return { ok: Boolean(result.ok), command, result };
      }
    case "listSaves":
      // Enumerate persisted save files in the mounted save directory.
      {
        const result = listSaveFiles();
        return { ok: Boolean(result.ok), command, ...result };
      }
    case "mapCacheProbe":
      {
        const moduleResult = await getWasmModuleForArchives("mapCacheProbe");
        if (moduleResult.error) {
          return { ok: false, command: "mapCacheProbe", error: moduleResult.error };
        }
        return {
          ok: true,
          command: "mapCacheProbe",
          probe: JSON.parse(moduleResult.wasmModule.mapCacheProbe()),
        };
      }
    case "setD3D8GammaRamp":
      {
        const gamma = setD3D8GammaRamp(buildOrUseD3D8GammaRampPayload(payload));
        return {
          ok: gamma.supported === true,
          command,
          gamma,
          state: snapshotState(),
        };
      }
    case "d3d8TextureInventory":
      {
        // ADD-ONLY Stage-1 diagnostic: enumerate every live D3D8 texture and,
        // for requested diagnostic sizes, sample the actual GL pixels to detect
        // a black/stub upload (silent 2D-texture-load failure). Read-only; no
        // wasm call.
        const requestedSizes = Array.isArray(payload.sizes)
          ? new Set(payload.sizes.map((size) => String(size)))
          : new Set(["1024x256"]);
        const sampleLimit = Math.max(0, Math.min(256, Number(payload.sampleLimit ?? 4) >>> 0));
        const inventory = {};
        for (const [texId, res] of d3d8Textures.entries()) {
          const key = `${res.width}x${res.height}`;
          if (!inventory[key]) {
            inventory[key] = { count: 0, samples: [] };
          }
          inventory[key].count += 1;
          if (requestedSizes.has(key) && inventory[key].samples.length < sampleLimit) {
            const ready = Boolean(res.initializedLevels?.has("0"));
            const centerX = Math.max(0, Math.min(res.width - 1, Math.floor(res.width / 2)));
            const centerY = Math.max(0, Math.min(res.height - 1, Math.floor(res.height / 2)));
            const cornerX = Math.max(0, Math.min(res.width - 1, 4));
            const cornerY = Math.max(0, Math.min(res.height - 1, 4));
            const lowerX = Math.max(0, Math.min(res.width - 1, Math.floor(res.width * 0.78)));
            const lowerY = Math.max(0, Math.min(res.height - 1, Math.floor(res.height * 0.62)));
            inventory[key].samples.push({
              id: texId,
              uploads: res.uploads ?? 0,
              ready,
              format: res.format,
              pool: res.pool,
              usage: res.usage,
              centerPixel: ready
                ? sampleD3D8TexturePixel(res, centerX, centerY)
                : null,
              cornerPixels: ready
                ? [sampleD3D8TexturePixel(res, cornerX, cornerY), sampleD3D8TexturePixel(res, lowerX, lowerY)]
                : null,
            });
          }
        }
        return { ok: true, command: "d3d8TextureInventory", inventory, liveCount: d3d8Textures.size };
      }
    case "realEngineSetSkirmishMap":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineSetSkirmishMap");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineSetSkirmishMap", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.realEngineSetSkirmishMap(
            String(payload.map ?? payload.mapName ?? ""),
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        recordLog("real engine set skirmish map", { aborted, abortMessage, result });
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "realEngineSetSkirmishMap",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "realEngineSetSkirmishLocalTemplate":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineSetSkirmishLocalTemplate");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineSetSkirmishLocalTemplate", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.realEngineSetSkirmishLocalTemplate(
            String(payload.templateName ?? payload.template ?? ""),
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        recordLog("real engine set skirmish local template", { aborted, abortMessage, result });
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "realEngineSetSkirmishLocalTemplate",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "realEngineUpdateBreakpoint":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineUpdateBreakpoint");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineUpdateBreakpoint", error: moduleResult.error };
        }
        const target = typeof payload.target === "string" ? payload.target : "";
        moduleResult.wasmModule.realEngineSetEngineUpdateBreakpoint(target);
        return {
          ok: true,
          command: "realEngineUpdateBreakpoint",
          target,
          state: snapshotState(),
        };
      }
    case "realEngineGameLogicBreakpoint":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineGameLogicBreakpoint");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineGameLogicBreakpoint", error: moduleResult.error };
        }
        const step = typeof payload.step === "string" ? payload.step : "";
        moduleResult.wasmModule.realEngineSetGameLogicBreakpoint(step);
        return {
          ok: true,
          command: "realEngineGameLogicBreakpoint",
          step,
          state: snapshotState(),
        };
      }
    case "realEngineFrame":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineFrame");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineFrame", error: moduleResult.error };
        }
        let frame = null;
        let aborted = false;
        let abortMessage = null;
        let abortStack = null;
        moduleResult.wasmModule.realEngineSetFrameProfile?.(payload.profile === true ? 1 : 0);
        moduleResult.wasmModule.realEngineSetPlayerDiagnostics?.(payload.playerDiagnostics === true ? 1 : 0);
        try {
          frame = JSON.parse(moduleResult.wasmModule.realEngineFrame(Number(payload.frames ?? 1)));
          // The engine renders at its own resolution (TheDisplay, e.g.
          // 800x600) while the canvas is display-sized; browser pointer
          // events must be mapped into ENGINE client coordinates or clicks
          // land off-target. Cache the authoritative size for
          // canvasInputPointFromEvent.
          const engineDisplay = frame?.clientState?.display;
          if (Number.isFinite(engineDisplay?.width) && engineDisplay.width > 0
              && Number.isFinite(engineDisplay?.height) && engineDisplay.height > 0) {
            const previousEngineDisplay = harnessState.engineDisplaySize;
            if (previousEngineDisplay?.width !== engineDisplay.width
                || previousEngineDisplay?.height !== engineDisplay.height) {
              invalidateCanvasDisplaySizeCache();
            }
            harnessState.engineDisplaySize = {
              width: engineDisplay.width,
              height: engineDisplay.height,
            };
          }
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
          abortStack = error?.stack ?? null;
        }
        flushD3D8PendingDrawBatch("realEngineFrame");
        let lastUpdateTarget = null;
        let lastGameLogicStep = null;
        try {
          lastUpdateTarget = moduleResult.wasmModule.realEngineLastUpdateTarget();
        } catch {
          lastUpdateTarget = null;
        }
        try {
          lastGameLogicStep = moduleResult.wasmModule.realEngineLastGameLogicStep();
        } catch {
          lastGameLogicStep = null;
        }
        refreshBrowserDirectInputQueue(moduleResult.wasmModule);
        recordLog("real engine frame", {
          aborted,
          abortMessage,
          lastUpdateTarget,
          lastGameLogicStep,
          frame,
        });
        return {
          ok: Boolean(frame?.framesCompleted > 0) && !aborted,
          command: "realEngineFrame",
          aborted,
          abortMessage,
          abortStack,
          lastUpdateTarget,
          lastGameLogicStep,
          frame,
          state: snapshotState(),
        };
      }
    case "setEngineResolution":
      {
        // Drive the SAME real display-resize path the in-game options screen
        // uses: cnc_port_real_engine_set_resolution ->
        //   TheDisplay->setDisplayMode -> WW3D::Set_Device_Resolution (backbuffer)
        //   + Render2DClass::Set_Screen_Resolution (2D projection)
        //   + Display::setDisplayMode (client width/height globals)
        //   + Header/Mouse resolution-change notifies + shell/control-bar reflow.
        // The engine renders at this logical resolution; the WebGL2 drawing
        // buffer is sized here so the two match 1:1 (native = sharp, no stretch).
        const moduleResult = await getWasmModuleForArchives("setEngineResolution");
        if (moduleResult.error) {
          return { ok: false, command: "setEngineResolution", error: moduleResult.error };
        }
        const setResolution = moduleResult.wasmModule.realEngineSetResolution;
        if (typeof setResolution !== "function") {
          return { ok: false, command: "setEngineResolution", error: "resolution hook not exported by this build" };
        }
        const width = Math.max(1, Math.round(Number(payload.width ?? 0)));
        const height = Math.max(1, Math.round(Number(payload.height ?? 0)));
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
          return { ok: false, command: "setEngineResolution", error: "invalid width/height" };
        }
        flushD3D8PendingDrawBatch("setEngineResolution");
        let result = null;
        try {
          result = JSON.parse(setResolution(width, height));
        } catch (error) {
          return {
            ok: false,
            command: "setEngineResolution",
            error: error?.message ?? String(error),
          };
        }
        const appliedWidth = Number.isFinite(result?.width) && result.width > 0 ? result.width : width;
        const appliedHeight = Number.isFinite(result?.height) && result.height > 0 ? result.height : height;
        if (result?.ok === true) {
          // The engine's device Reset already drove onD3D8BackbufferResize
          // (canvas pin + cache invalidation + resolutionchange event). Run it
          // again defensively — it is idempotent — to cover a stale wasm build
          // without the shim notify and the size-unchanged early-out path.
          onD3D8BackbufferResize(appliedWidth, appliedHeight, "rpc");
          recordLog("set engine resolution", {
            requested: { width, height },
            applied: { width: appliedWidth, height: appliedHeight },
            reflow: result?.reflow ?? null,
          });
        }
        return {
          ok: result?.ok === true,
          command: "setEngineResolution",
          requested: { width, height },
          applied: { width: appliedWidth, height: appliedHeight },
          // "shell" = full menu recreate; "in-place" = non-destructive mid-match
          // resize (game kept running). Lets the harness verify the branch taken.
          reflow: result?.reflow ?? null,
          error: result?.error ?? null,
          state: snapshotState(),
        };
      }
    case "realEngineFrameSummary":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineFrameSummary");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineFrameSummary", error: moduleResult.error };
        }
        let frame = null;
        let aborted = false;
        let abortMessage = null;
        let abortStack = null;
        let __rawSummary = null;
        moduleResult.wasmModule.realEngineSetFrameProfile?.(payload.profile === true ? 1 : 0);
        moduleResult.wasmModule.realEngineSetPlayerDiagnostics?.(payload.playerDiagnostics === true ? 1 : 0);
        try {
          __rawSummary = moduleResult.wasmModule.realEngineFrameSummary(Number(payload.frames ?? 1));
          frame = JSON.parse(__rawSummary);
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
          abortStack = error?.stack ?? null;
          // ADD-ONLY Stage-1 debug: capture the raw JSON region around the parse
          // failure so a malformed probe field can be located. Read-only.
          try {
            const pos = Number((error?.message?.match(/position (\d+)/) ?? [])[1] ?? -1);
            if (pos >= 0 && typeof __rawSummary === "string") {
              window.__lastBadJsonContext = { pos, snippet: __rawSummary.substring(Math.max(0, pos - 400), pos + 200) };
            }
          } catch {}
        }
        flushD3D8PendingDrawBatch("realEngineFrameSummary");
        let lastUpdateTarget = null;
        let lastGameLogicStep = null;
        try {
          lastUpdateTarget = moduleResult.wasmModule.realEngineLastUpdateTarget();
        } catch {
          lastUpdateTarget = null;
        }
        try {
          lastGameLogicStep = moduleResult.wasmModule.realEngineLastGameLogicStep();
        } catch {
          lastGameLogicStep = null;
        }
        refreshBrowserDirectInputQueue(moduleResult.wasmModule);
        recordLog("real engine frame summary", {
          aborted,
          abortMessage,
          lastUpdateTarget,
          lastGameLogicStep,
          frame,
        });
        return {
          ok: Boolean(frame?.framesCompleted > 0) && !aborted,
          command: "realEngineFrameSummary",
          aborted,
          abortMessage,
          abortStack,
          lastUpdateTarget,
          lastGameLogicStep,
          frame,
          state: snapshotState(),
        };
      }
    case "realEngineFrameTick":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineFrameTick");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineFrameTick", error: moduleResult.error };
        }
        let frame = null;
        let aborted = false;
        let abortMessage = null;
        let abortStack = null;
        moduleResult.wasmModule.realEngineSetFrameProfile?.(payload.profile === true ? 1 : 0);
        try {
          frame = JSON.parse(moduleResult.wasmModule.realEngineFrameTick(Number(payload.frames ?? 1)));
          const framesCompleted = Number(frame?.framesCompleted);
          if (Number.isFinite(framesCompleted)) {
            harnessState.frame = framesCompleted;
            setFramesNodeThrottled(framesCompleted);
          }
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
          abortStack = error?.stack ?? null;
        }
        flushD3D8PendingDrawBatch("realEngineFrameTick");
        return {
          ok: Boolean(frame?.initReturned === true
            && frame?.framesCompleted > 0
            && frame?.quitting !== true
            && frame?.exceptionCaught !== true) && !aborted,
          command: "realEngineFrameTick",
          aborted,
          abortMessage,
          abortStack,
          frame,
        };
      }
    case "realEngineSetClientPacing":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineSetClientPacing");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineSetClientPacing", error: moduleResult.error };
        }
        if (typeof moduleResult.wasmModule.realEngineSetClientPacing !== "function") {
          return { ok: false, command: "realEngineSetClientPacing", error: "export missing (stale wasm build)" };
        }
        const pacing = JSON.parse(moduleResult.wasmModule.realEngineSetClientPacing(
          Number(payload.clientFps ?? 0),
          Number(payload.logicFps ?? 0),
        ));
        recordLog("client pacing", pacing);
        return { ok: Boolean(pacing?.ok), command: "realEngineSetClientPacing", pacing };
      }
    case "realEngineDumpWindows":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineDumpWindows");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineDumpWindows", error: moduleResult.error };
        }
        if (typeof moduleResult.wasmModule.realEngineDumpWindows !== "function") {
          return { ok: false, command: "realEngineDumpWindows", error: "window dump not exported by this build" };
        }
        try {
          const dump = JSON.parse(moduleResult.wasmModule.realEngineDumpWindows());
          return { ok: dump?.ok === true, command: "realEngineDumpWindows", ...dump };
        } catch (error) {
          return { ok: false, command: "realEngineDumpWindows", error: error?.message ?? String(error) };
        }
      }
    case "realEngineSetLoadStepping":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineSetLoadStepping");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineSetLoadStepping", error: moduleResult.error };
        }
        if (typeof moduleResult.wasmModule.realEngineSetLoadStepping !== "function") {
          return { ok: false, command: "realEngineSetLoadStepping", error: "export missing (stale wasm build)" };
        }
        const stepping = JSON.parse(moduleResult.wasmModule.realEngineSetLoadStepping(
          payload.enabled === false ? 0 : 1,
          Number(payload.budgetMs ?? 0),
        ));
        recordLog("load stepping", stepping);
        return { ok: Boolean(stepping?.ok), command: "realEngineSetLoadStepping", stepping };
      }
    case "realEngineAnimReport":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineAnimReport");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineAnimReport", error: moduleResult.error };
        }
        if (typeof moduleResult.wasmModule.realEngineAnimReport !== "function") {
          return { ok: false, command: "realEngineAnimReport", error: "export missing (stale wasm build)" };
        }
        try {
          const report = JSON.parse(moduleResult.wasmModule.realEngineAnimReport(
            Number(payload.maxEntries ?? 0),
          ));
          return { ok: report?.ok === true, command: "realEngineAnimReport", report };
        } catch (error) {
          return {
            ok: false,
            command: "realEngineAnimReport",
            error: error?.message ?? String(error),
          };
        }
      }
    case "realEngineFramePaced":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineFramePaced");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineFramePaced", error: moduleResult.error };
        }
        if (typeof moduleResult.wasmModule.realEngineFramePaced !== "function") {
          return { ok: false, command: "realEngineFramePaced", error: "export missing (stale wasm build)" };
        }
        let frame = null;
        let aborted = false;
        let abortMessage = null;
        let abortStack = null;
        try {
          frame = JSON.parse(moduleResult.wasmModule.realEngineFramePaced(
            payload.runLogic === false ? 0 : 1,
          ));
          const framesCompleted = Number(frame?.framesCompleted);
          if (Number.isFinite(framesCompleted)) {
            harnessState.frame = framesCompleted;
            setFramesNodeThrottled(framesCompleted);
          }
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
          abortStack = error?.stack ?? null;
        }
        flushD3D8PendingDrawBatch("realEngineFramePaced");
        return {
          ok: Boolean(frame?.initReturned === true
            && frame?.framesCompleted > 0
            && frame?.quitting !== true
            && frame?.exceptionCaught !== true) && !aborted,
          command: "realEngineFramePaced",
          aborted,
          abortMessage,
          abortStack,
          frame,
        };
      }
    case "realEngineDoFX":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineDoFX");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineDoFX", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.realEngineDoFX(
            String(payload.name ?? "WeaponFX_MOAB_Blast"),
            Number(payload.x ?? 0),
            Number(payload.y ?? 0),
            Number(payload.z ?? 0),
            payload.useViewPosition === false ? 0 : 1,
            payload.clampToTerrain === false ? 0 : 1,
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        recordLog("real engine do fx", { aborted, abortMessage, result });
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "realEngineDoFX",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "realEngineSpawnLaser":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineSpawnLaser");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineSpawnLaser", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.realEngineSpawnLaser(
            String(payload.templateName ?? "LaserBeam"),
            Number(payload.x ?? 0),
            Number(payload.y ?? 0),
            Number(payload.z ?? 0),
            payload.useViewPosition === false ? 0 : 1,
            payload.clampToTerrain === false ? 0 : 1,
            Number(payload.length ?? 120),
            Number(payload.height ?? 35),
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        recordLog("real engine spawn laser", { aborted, abortMessage, result });
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "realEngineSpawnLaser",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "realEngineDetonateWeapon":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineDetonateWeapon");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineDetonateWeapon", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.realEngineDetonateWeapon(
            String(payload.name ?? "auto"),
            Number(payload.sourceObjectId ?? 0),
            Number(payload.x ?? 0),
            Number(payload.y ?? 0),
            Number(payload.z ?? 0),
            payload.useSourcePosition === true ? 1 : 0,
            payload.clampToTerrain === false ? 0 : 1,
            payload.inflictDamage === true ? 1 : 0,
            Number(payload.pumpFrames ?? 0),
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        recordLog("real engine detonate weapon", { aborted, abortMessage, result });
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "realEngineDetonateWeapon",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "audioDeviceState":
      {
        // Queryable snapshot of the real MilesAudioManager device state so the
        // harness can confirm, in a live skirmish, whether the Miles sample
        // pools were actually allocated (num2D/num3DSamples > 0) and a provider
        // is open.  If the pools are 0/0, SoundManager::canPlayNow() drops every
        // 2D/3D SFX/voice before AIL_start_sample(), which is the "music plays
        // but SFX/voices don't" symptom.  Paired with browserMssSamplePlayback-
        // Runtime.started climbing off 0 once the pools exist.
        const moduleResult = await getWasmModuleForArchives("audioDeviceState");
        if (moduleResult.error) {
          return { ok: false, command: "audioDeviceState", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.audioDeviceState());
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        recordLog("audio device state", { aborted, abortMessage, result });
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "audioDeviceState",
          aborted,
          abortMessage,
          result,
          browserMssSamplePlaybackRuntime: summarizeBrowserMssSamplePlaybackRuntime(),
          browserMss3DSamplePlaybackRuntime: summarizeBrowserMss3DSamplePlaybackRuntime(),
          browserMssStreamPlaybackRuntime: summarizeBrowserMssStreamPlaybackRuntime(),
        };
      }
    case "realEnginePlayAudioEvent":
      {
        const moduleResult = await getWasmModuleForArchives("realEnginePlayAudioEvent");
        if (moduleResult.error) {
          return { ok: false, command: "realEnginePlayAudioEvent", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.realEnginePlayAudioEvent(
            String(payload.name ?? "ArtilleryBarrageIncomingWhistle"),
            Number(payload.x ?? 0),
            Number(payload.y ?? 0),
            Number(payload.z ?? 0),
            payload.useViewPosition === false ? 0 : 1,
            payload.positional === false ? 0 : 1,
            payload.forceOn === false ? 0 : 1,
            Number(payload.pumpFrames ?? 2),
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        // Fold in the real audio-device state so a single play call surfaces
        // whether the sample pools exist and a provider is open -- the signal
        // that tells us why "started" is or isn't climbing.
        let audioDeviceState = null;
        try {
          audioDeviceState = JSON.parse(moduleResult.wasmModule.audioDeviceState());
        } catch (error) {
          audioDeviceState = { ok: false, error: error?.message ?? String(error) };
        }
        recordLog("real engine play audio event", { aborted, abortMessage, result });
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "realEnginePlayAudioEvent",
          aborted,
          abortMessage,
          result,
          audioDeviceState,
          browserMssSamplePlaybackRuntime: summarizeBrowserMssSamplePlaybackRuntime(),
          browserMss3DSamplePlaybackRuntime: summarizeBrowserMss3DSamplePlaybackRuntime(),
          browserMssStreamPlaybackRuntime: summarizeBrowserMssStreamPlaybackRuntime(),
          state: snapshotState(),
        };
      }
    case "realEngineStopAudioEvent":
      {
        const moduleResult = await getWasmModuleForArchives("realEngineStopAudioEvent");
        if (moduleResult.error) {
          return { ok: false, command: "realEngineStopAudioEvent", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.realEngineStopAudioEvent(
            Number(payload.handle ?? 0),
            Number(payload.pumpFrames ?? 2),
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        recordLog("real engine stop audio event", { aborted, abortMessage, result });
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "realEngineStopAudioEvent",
          aborted,
          abortMessage,
          result,
          browserMssSamplePlaybackRuntime: summarizeBrowserMssSamplePlaybackRuntime(),
          browserMss3DSamplePlaybackRuntime: summarizeBrowserMss3DSamplePlaybackRuntime(),
          browserMssStreamPlaybackRuntime: summarizeBrowserMssStreamPlaybackRuntime(),
          state: snapshotState(),
        };
      }
    case "queryDrawables":
      {
        const moduleResult = await getWasmModuleForArchives("queryDrawables");
        if (moduleResult.error) {
          return { ok: false, command: "queryDrawables", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.queryDrawables());
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        return {
          ok: Boolean(result?.ready) && !aborted,
          command: "queryDrawables",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "tacticalViewLookAt":
      {
        const moduleResult = await getWasmModuleForArchives("tacticalViewLookAt");
        if (moduleResult.error) {
          return { ok: false, command: "tacticalViewLookAt", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.tacticalViewLookAt(
            Number(payload.x ?? payload.worldPos?.x ?? 0),
            Number(payload.y ?? payload.worldPos?.y ?? 0),
            Number(payload.z ?? payload.worldPos?.z ?? 0),
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "tacticalViewLookAt",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "revealLocalMap":
      {
        const moduleResult = await getWasmModuleForArchives("revealLocalMap");
        if (moduleResult.error) {
          return { ok: false, command: "revealLocalMap", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.revealLocalMap(
            payload.permanent === false || payload.permanent === 0 || payload.permanent === "0" ? 0 : 1,
          ));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        return {
          ok: Boolean(result?.ok) && !aborted,
          command: "revealLocalMap",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "querySelection":
      {
        const moduleResult = await getWasmModuleForArchives("querySelection");
        if (moduleResult.error) {
          return { ok: false, command: "querySelection", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.querySelection());
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        return {
          ok: Boolean(result?.ready) && !aborted,
          command: "querySelection",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
    case "clickWindowByName":
      {
        const moduleResult = await getWasmModuleForArchives("clickWindowByName");
        if (moduleResult.error) {
          return { ok: false, command: "clickWindowByName", error: moduleResult.error };
        }
        let result = null;
        let aborted = false;
        let abortMessage = null;
        try {
          result = JSON.parse(moduleResult.wasmModule.clickWindowByName(String(payload.name ?? "")));
        } catch (error) {
          aborted = true;
          abortMessage = error?.message ?? String(error);
        }
        return {
          ok: Boolean(result?.ready) && result?.clicked === true && !aborted,
          command: "clickWindowByName",
          aborted,
          abortMessage,
          result,
          state: snapshotState(),
        };
      }
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
    case "win32GameEngineProbe":
      {
        const probe = await probeWin32GameEngine();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; Win32GameEngine cannot be probed" };
        }
        return { ok: Boolean(probe.ok), command, probe, state: snapshotState() };
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
    case "originalGuiMouseStreamProbe":
      {
        const probe = await probeOriginalGuiMouseStream();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original GUI mouse stream cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "originalCursorVisibilityProbe":
      {
        const probe = await probeOriginalCursorVisibility({
          visible: payload.visible !== false,
        });
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original cursor visibility cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "originalKeyboardInputProbe":
      {
        const probe = await probeOriginalKeyboardInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Keyboard input cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "originalKeyboardFrameTickProbe":
      {
        const probe = await probeOriginalKeyboardFrameTick();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Keyboard frame tick cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "setOriginalKeyboardFrameInput":
      {
        const probe = await setOriginalKeyboardFrameInputEnabled(payload.enabled !== false);
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Keyboard frame input cannot be configured" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "resetOriginalKeyboardFrameInput":
      {
        const probe = await resetOriginalKeyboardFrameInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Keyboard frame input cannot be reset" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "originalKeyboardFrameInputProbe":
      {
        const probe = await probeOriginalKeyboardFrameInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Keyboard frame input cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "setOriginalMouseFrameInput":
      {
        const probe = await setOriginalMouseFrameInputEnabled(payload.enabled !== false);
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Mouse frame input cannot be configured" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "resetOriginalMouseFrameInput":
      {
        const probe = await resetOriginalMouseFrameInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Mouse frame input cannot be reset" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "originalMouseFrameInputProbe":
      {
        const probe = await probeOriginalMouseFrameInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Mouse frame input cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "originalMouseFrameWindows":
      {
        const probe = await probeOriginalMouseFrameWindows();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Mouse frame windows cannot be probed" };
        }
        return { ok: true, command, probe, state: snapshotState() };
      }
    case "resolveOriginalMouseFrameWindowId":
      {
        const name = String(payload.name ?? "");
        const id = await resolveOriginalMouseFrameWindowId(name);
        if (id === null) {
          return { ok: false, command, name, error: "Wasm module unavailable; original Mouse frame window id cannot be resolved" };
        }
        return { ok: id > 0, command, name, id, state: snapshotState() };
      }
    case "clickOriginalMouseFrameWidget":
      return clickOriginalMouseFrameWidget(payload);
    case "resetOriginalKeyboardInputProbe":
      {
        const probe = await resetOriginalKeyboardInput();
        if (!probe) {
          return { ok: false, command, error: "Wasm module unavailable; original Keyboard input cannot be reset" };
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
    case "d3d8Clear":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 clear cannot run" };
        }
        const rgba = normalizeRgba(payload);
        const clearColor = d3dColorFromRgba(rgba);
        const probe = parseModuleState(wasmModule.probeD3D8Clear(clearColor));
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8Clear ?? null;
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe.clearColor?.join(",") === rgba.join(",")
          && screenshot.topLeftPixel.join(",") === rgba.join(",");
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          state: snapshotState(),
        };
      }
    case "d3d8RenderTarget":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 render target probe cannot run" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
        const beforeFboIncomplete = harnessState.graphics.browserFboIncompleteCount ?? 0;
        const probe = parseModuleState(wasmModule.probeD3D8RenderTarget());
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const afterFboIncomplete = harnessState.graphics.browserFboIncompleteCount ?? 0;
        const screenshot = snapshotCanvas();
        const expectedTextureCenter = probe?.expectedTextureCenter ?? [34, 85, 170, 255];
        const expectedBackbufferCenter = probe?.expectedBackbufferCenter ?? [16, 32, 48, 255];
        const textureDelta = {
          creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
          releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          live: textureProbe?.live ?? null,
          browserFboCount: textureProbe?.browserFboCount ?? null,
          fboIncomplete: afterFboIncomplete - beforeFboIncomplete,
        };
        const ok = Boolean(probe?.ok)
          && probe?.source === "browser_d3d8_render_target_probe"
          && probe?.textureId > 0
          && probe?.calls?.browserFboBind === 2
          && probe?.calls?.browserFboBindFailures === 0
          && probe?.calls?.browserTextureRelease === 1
          && probe?.lastBrowserFbo?.colorTextureId === 0
          && probe?.lastBrowserFbo?.depthTextureId === 0
          && pixelsApproximatelyEqual(probe?.textureSample, expectedTextureCenter, 1)
          && pixelsApproximatelyEqual(screenshot.centerPixel, expectedBackbufferCenter, 1)
          && textureDelta.creates === 1
          && textureDelta.releases === 1
          && textureDelta.live === 0
          && textureDelta.browserFboCount === 0
          && textureDelta.fboIncomplete === 0;
        return {
          ok,
          command,
          probe,
          textureProbe,
          textureDelta,
          screenshot,
          state: snapshotState(),
        };
      }
    case "d3d8DepthTextureRenderTarget":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 depth-texture render target probe cannot run" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
        const beforeFboIncomplete = harnessState.graphics.browserFboIncompleteCount ?? 0;
        const probe = parseModuleState(wasmModule.probeD3D8DepthTextureRenderTarget());
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const afterFboIncomplete = harnessState.graphics.browserFboIncompleteCount ?? 0;
        const screenshot = snapshotCanvas();
        const expectedTextureCenter = probe?.expectedTextureCenter ?? [68, 51, 34, 255];
        const expectedBackbufferCenter = probe?.expectedBackbufferCenter ?? [16, 32, 48, 255];
        const textureDelta = {
          creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
          releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          unsupportedUpdates: (textureProbe?.unsupportedUpdates ?? 0) - (beforeTextures.unsupportedUpdates ?? 0),
          live: textureProbe?.live ?? null,
          browserFboCount: textureProbe?.browserFboCount ?? null,
          fboIncomplete: afterFboIncomplete - beforeFboIncomplete,
        };
        const lastTextureDepthFboBind = textureProbe?.lastTextureDepthFboBind ?? null;
        const ok = Boolean(probe?.ok)
          && probe?.source === "browser_d3d8_depth_texture_render_target_probe"
          && probe?.renderTextureId > 0
          && probe?.depthTextureId > 0
          && probe?.calls?.browserFboBind === 2
          && probe?.calls?.browserFboBindFailures === 0
          && probe?.calls?.browserTextureCreate === 2
          && probe?.calls?.browserTextureRelease === 2
          && probe?.firstBrowserFbo?.colorTextureId === probe?.renderTextureId
          && probe?.firstBrowserFbo?.depthTextureId === probe?.depthTextureId
          && probe?.lastBrowserFbo?.colorTextureId === 0
          && probe?.lastBrowserFbo?.depthTextureId === 0
          && pixelsApproximatelyEqual(probe?.textureSample, expectedTextureCenter, 1)
          && pixelsApproximatelyEqual(screenshot.centerPixel, expectedBackbufferCenter, 1)
          && lastTextureDepthFboBind?.colorTextureId === probe?.renderTextureId
          && lastTextureDepthFboBind?.depthTextureId === probe?.depthTextureId
          && lastTextureDepthFboBind?.attachment === "texture"
          && lastTextureDepthFboBind?.storage === "depth24-stencil8"
          && textureDelta.creates === 2
          && textureDelta.releases === 2
          && textureDelta.unsupportedUpdates === 0
          && textureDelta.live === 0
          && textureDelta.browserFboCount === 0
          && textureDelta.fboIncomplete === 0;
        return {
          ok,
          command,
          probe,
          textureProbe,
          textureDelta,
          screenshot,
          state: snapshotState(),
        };
      }
    case "d3d8Viewport":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 viewport probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8Viewport());
        const browserProbe = harnessState.graphics.d3d8Viewport ?? null;
        const d3dViewport = probe.viewport ?? {};
        const expectedGlBox = expectedD3D8ViewportGlBox(
          d3dViewport,
          browserProbe?.renderTarget,
          browserProbe?.drawingBuffer,
        );
        const expectedDepth = [d3dViewport.minZ ?? 0, d3dViewport.maxZ ?? 1];
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_viewport"
          && browserProbe?.reason === "set"
          && browserProbe?.ok === true
          && browserProbe?.d3d?.x === d3dViewport.x
          && browserProbe?.d3d?.y === d3dViewport.y
          && browserProbe?.d3d?.width === d3dViewport.width
          && browserProbe?.d3d?.height === d3dViewport.height
          && Math.abs((browserProbe?.d3d?.minZ ?? -1) - expectedDepth[0]) < 0.00001
          && Math.abs((browserProbe?.d3d?.maxZ ?? -1) - expectedDepth[1]) < 0.00001
          && viewportArraysEqual(browserProbe?.actual?.viewport, expectedGlBox)
          && viewportArraysEqual(browserProbe?.actual?.scissor, expectedGlBox)
          && viewportArraysEqual(browserProbe?.actual?.depthRange, expectedDepth, 0.00001)
          && browserProbe?.scissorEnabled === true;
        return {
          ok,
          command,
          probe,
          browserProbe,
          state: snapshotState(),
        };
      }
    case "d3d8BufferDirty":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 buffer dirty probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8BufferDirty());
        updateD3D8BufferSummary(true);
        const browserProbe = harnessState.graphics.d3d8Buffers ?? null;
        const ok = Boolean(probe.ok)
          && browserProbe?.lastUpdate?.byteOffset === probe.indexUpdate?.offset
          && browserProbe?.lastUpdate?.byteSize === probe.indexUpdate?.bytes
          && browserProbe?.releases >= 2
          && browserProbe?.liveVertex === 0
          && browserProbe?.liveIndex === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          state: snapshotState(),
        };
      }
    case "d3d8BufferHints":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 buffer hint probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8BufferHints());
        updateD3D8BufferSummary(true);
        const browserProbe = harnessState.graphics.d3d8Buffers ?? null;
        const ok = Boolean(probe.ok)
          && browserProbe?.lastCreate?.dynamic === true
          && browserProbe?.lastCreate?.glUsage === "streamDraw"
          && browserProbe?.lastStaticCreate?.dynamic === false
          && browserProbe?.lastStaticCreate?.writeOnly === true
          && browserProbe?.lastStaticCreate?.glUsage === "staticDraw"
          && browserProbe?.lastDynamicCreate?.dynamic === true
          && browserProbe?.lastDynamicCreate?.glUsage === "streamDraw"
          && browserProbe?.lastUpdate?.glUsage === "streamDraw"
          && browserProbe?.lastUpdate?.discard === true
          && browserProbe?.lastUpdate?.noOverwrite === false
          && browserProbe?.lastUpdate?.orphaned === true
          && browserProbe?.lastUpdate?.byteOffset === probe.dynamicUpdate?.offset
          && browserProbe?.lastUpdate?.byteSize === probe.dynamicUpdate?.bytes
          && browserProbe?.lastUpdate?.d3dUsage === probe.dynamicUpdate?.usage
          && browserProbe?.lastUpdate?.lockFlags === probe.dynamicUpdate?.lockFlags
          && browserProbe?.releases >= 2
          && browserProbe?.liveVertex === 0
          && browserProbe?.liveIndex === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          state: snapshotState(),
        };
      }
    case "d3d8TextureUpload":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture upload probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8TextureUpload());
        const browserProbe = harnessState.graphics.d3d8Textures ?? null;
        const ok = Boolean(probe.ok)
          && browserProbe?.updates >= 3
          && browserProbe?.releases >= 2
          && browserProbe?.live === 0
          && browserProbe?.lastSubrectUpdate?.x === 1
          && browserProbe?.lastSubrectUpdate?.y === 2
          && browserProbe?.lastSubrectUpdate?.width === 1
          && browserProbe?.lastSubrectUpdate?.height === 1
          && browserProbe?.lastSubrectUpdate?.samplePixel?.join(",") === "48,32,16,64"
          && browserProbe?.lastUpdate?.format === 22
          && browserProbe?.lastUpdate?.samplePixel?.join(",") === "7,6,5,255";
        return {
          ok,
          command,
          probe,
          browserProbe,
          state: snapshotState(),
        };
      }
    case "d3d8VolumeTextureUpload":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 volume texture upload probe cannot run" };
        }
        const before = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8VolumeTextureUpload());
        const browserProbe = harnessState.graphics.d3d8Textures ?? null;
        const delta = {
          creates: (browserProbe?.creates ?? 0) - (before.creates ?? 0),
          updates: (browserProbe?.updates ?? 0) - (before.updates ?? 0),
          binds: (browserProbe?.binds ?? 0) - (before.binds ?? 0),
          unbinds: (browserProbe?.unbinds ?? 0) - (before.unbinds ?? 0),
          releaseUnbinds: (browserProbe?.releaseUnbinds ?? 0) - (before.releaseUnbinds ?? 0),
          releases: (browserProbe?.releases ?? 0) - (before.releases ?? 0),
          unsupportedUpdates: (browserProbe?.unsupportedUpdates ?? 0) - (before.unsupportedUpdates ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe.source === "browser_d3d8_volume_texture_upload_probe"
          && probe.calls?.createVolumeTexture === 1
          && probe.calls?.textureLockBox === 3
          && probe.calls?.textureUnlockBox === 3
          && probe.calls?.browserTextureCreate === 1
          && probe.calls?.browserTextureUpdate === 3
          && probe.calls?.browserTextureRelease === 1
          && probe.calls?.browserTextureBind === 2
          && delta.creates === 1
          && delta.updates === 3
          && delta.binds === 1
          && delta.unbinds === 1
          && delta.releaseUnbinds === 0
          && delta.releases === 1
          && delta.unsupportedUpdates === 0
          && browserProbe?.live === 0
          && browserProbe?.lastCreate?.type === "volume"
          && browserProbe?.lastCreate?.depth === 4
          && browserProbe?.lastSubrectUpdate?.type === "volume"
          && browserProbe?.lastSubrectUpdate?.x === 1
          && browserProbe?.lastSubrectUpdate?.y === 1
          && browserProbe?.lastSubrectUpdate?.z === 1
          && browserProbe?.lastSubrectUpdate?.width === 1
          && browserProbe?.lastSubrectUpdate?.height === 2
          && browserProbe?.lastSubrectUpdate?.depth === 2
          && browserProbe?.lastSubrectUpdate?.rowPitch === 16
          && browserProbe?.lastSubrectUpdate?.slicePitch === 64
          && browserProbe?.lastSubrectUpdate?.rowBytes === 4
          && browserProbe?.lastUpdate?.type === "volume"
          && browserProbe?.lastUpdate?.level === 1
          && browserProbe?.lastUpdate?.width === 2
          && browserProbe?.lastUpdate?.height === 2
          && browserProbe?.lastUpdate?.depth === 2
          && browserProbe?.lastUpdate?.rowPitch === 8
          && browserProbe?.lastUpdate?.slicePitch === 16
          && browserProbe?.lastUpdate?.byteSize === 32
          && browserProbe?.lastUpdate?.convertedByteSize === 32
          && browserProbe?.lastBind?.stage === 2
          && browserProbe?.lastBind?.id === 0
          && browserProbe?.lastBind?.nullBind === true
          && browserProbe?.lastRelease?.type === "volume";
        return {
          ok,
          command,
          probe,
          browserProbe,
          browserDelta: delta,
          state: snapshotState(),
        };
      }
    case "d3d8TextureBind":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture bind probe cannot run" };
        }
        const before = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8TextureBind());
        const browserProbe = harnessState.graphics.d3d8Textures ?? null;
        const delta = {
          binds: (browserProbe?.binds ?? 0) - (before.binds ?? 0),
          unbinds: (browserProbe?.unbinds ?? 0) - (before.unbinds ?? 0),
          releaseUnbinds: (browserProbe?.releaseUnbinds ?? 0) - (before.releaseUnbinds ?? 0),
          missingBinds: (browserProbe?.missingBinds ?? 0) - (before.missingBinds ?? 0),
          releases: (browserProbe?.releases ?? 0) - (before.releases ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe.calls?.setTexture === 3
          && probe.calls?.browserTextureBind === 3
          && delta.binds === 2
          && delta.unbinds === 1
          && delta.releaseUnbinds === 1
          && delta.missingBinds === 0
          && delta.releases === 1
          && browserProbe?.lastBind?.stage === 0
          && browserProbe?.lastBind?.id === 0
          && browserProbe?.lastBind?.nullBind === true
          && browserProbe?.lastReleaseUnbind?.id === probe.texture?.id
          && browserProbe?.lastReleaseUnbind?.stages?.join(",") === "1"
          && Object.keys(browserProbe?.boundTextures ?? {}).length === 0
          && browserProbe?.live === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          browserDelta: delta,
          state: snapshotState(),
        };
      }
    case "d3d8TexturedQuad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 textured quad probe cannot run" };
        }
        const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8TexturedQuad());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const textureDelta = {
          creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
          updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
          binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
          releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
          releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
        };
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setTextureStageState === 11
          && probe.draw?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MODULATE
          && probe.draw?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && probe.draw?.renderState?.textureStages?.[0]?.colorArg2 === D3DTA_DIFFUSE
          && probe.draw?.renderState?.textureStages?.[0]?.minFilter === D3DTEXF_LINEAR
          && probe.draw?.renderState?.textureStages?.[0]?.magFilter === D3DTEXF_POINT
          && probe.draw?.renderState?.textureStages?.[0]?.mipFilter === D3DTEXF_NONE
          && probe.draw?.renderState?.textureStages?.[0]?.addressU === D3DTADDRESS_CLAMP
          && probe.draw?.renderState?.textureStages?.[0]?.addressV === D3DTADDRESS_WRAP
          && probe.draw?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DISABLE
          && probe.draw?.renderState?.textureStages?.[1]?.texCoordIndex === 1
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MODULATE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg2 === D3DTA_DIFFUSE
          && browserProbe?.renderState?.textureStages?.[0]?.minFilter === D3DTEXF_LINEAR
          && browserProbe?.renderState?.textureStages?.[0]?.magFilter === D3DTEXF_POINT
          && browserProbe?.renderState?.textureStages?.[0]?.mipFilter === D3DTEXF_NONE
          && browserProbe?.renderState?.textureStages?.[0]?.addressU === D3DTADDRESS_CLAMP
          && browserProbe?.renderState?.textureStages?.[0]?.addressV === D3DTADDRESS_WRAP
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DISABLE
          && browserProbe?.renderState?.textureStages?.[1]?.texCoordIndex === 1
          && browserProbe?.texture0?.sampler?.d3d?.minFilter === D3DTEXF_LINEAR
          && browserProbe?.texture0?.sampler?.d3d?.magFilter === D3DTEXF_POINT
          && browserProbe?.texture0?.sampler?.d3d?.mipFilter === D3DTEXF_NONE
          && browserProbe?.texture0?.sampler?.d3d?.addressU === D3DTADDRESS_CLAMP
          && browserProbe?.texture0?.sampler?.d3d?.addressV === D3DTADDRESS_WRAP
          && browserProbe?.texture0?.sampler?.gl?.minFilter === gl.LINEAR
          && browserProbe?.texture0?.sampler?.gl?.magFilter === gl.NEAREST
          && browserProbe?.texture0?.sampler?.gl?.wrapS === gl.CLAMP_TO_EDGE
          && browserProbe?.texture0?.sampler?.gl?.wrapT === gl.REPEAT
          && browserProbe?.texture0?.sampler?.usedMipmaps === false
          && textureProbe?.lastSampler?.textureId === probe.texture?.id
          && browserProbe?.texture0?.combiner?.colorOp === D3DTOP_MODULATE
          && browserProbe?.texture0?.combiner?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.texture0?.combiner?.colorArg2 === D3DTA_DIFFUSE
          && browserProbe?.texture0?.combiner?.opName === "modulate"
          && browserProbe?.texture0?.combiner?.arg1Name === "texture"
          && browserProbe?.texture0?.combiner?.arg2Name === "diffuse"
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.texture0?.id === probe.texture?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordIndex === 0
          && browserProbe?.texture0?.texCoordModeName === "passthru"
          && browserProbe?.texture0?.texCoordSet === 0
          && browserProbe?.texture0?.texCoordOffset === D3D8_XYZNDUV_TEXCOORD0_OFFSET
          && browserProbe?.texture0?.textureTransformFlags === D3DTTFF_DISABLE
          && browserProbe?.texture0?.texCoordSupported === true
          && browserProbe?.texture0?.format === D3DFMT_A8R8G8B8
          && browserProbe?.boundTextures?.["0"] === probe.texture?.id
          && pixelLooksRed(browserProbe?.centerPixel)
          && textureDelta.creates === 1
          && textureDelta.updates === 1
          && textureDelta.binds === 1
          && textureDelta.releaseUnbinds === 1
          && textureDelta.releases === 1
          && textureProbe?.live === 0
          && Object.keys(textureProbe?.boundTextures ?? {}).length === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureProbe,
          textureDelta,
          state: snapshotState(),
        };
      }
    case "d3d8NonindexedDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 non-indexed draw probe cannot run",
          };
        }
        const beforeSequence = Number(harnessState.graphics.d3d8DrawIndexedSequence ?? 0) >>> 0;
        const probe = parseModuleState(wasmModule.probeD3D8NonindexedDraw());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const afterSequence = Number(harnessState.graphics.d3d8DrawIndexedSequence ?? 0) >>> 0;
        const centerPixelOk = pixelHasColor(browserProbe?.centerPixel ?? [0, 0, 0, 0]);
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && afterSequence - beforeSequence === 1
          && probe.calls?.createVertexBuffer === 1
          && probe.calls?.createIndexBuffer === 0
          && probe.calls?.browserBufferCreate === 2
          && probe.calls?.browserBufferUpdate === 2
          && probe.calls?.browserBufferRelease === 2
          && probe.calls?.setStreamSource === 1
          && probe.calls?.setIndices === 0
          && probe.calls?.drawPrimitive === 1
          && probe.calls?.drawIndexed === 0
          && probe.draw?.primitiveType === D3DPT_TRIANGLESTRIP
          && probe.draw?.startVertex === 0
          && probe.draw?.vertexCount === 4
          && probe.draw?.primitiveCount === 2
          && probe.draw?.vertexStride === 16
          && probe.draw?.vertexShaderFvf === (D3DFVF_XYZ | D3DFVF_DIFFUSE)
          && probe.draw?.vertexBufferId !== 0
          && probe.draw?.indexBufferId !== 0
          && probe.draw?.vertexBytes === 64
          && probe.draw?.indexBytes === 8
          && browserProbe?.primitiveType === D3DPT_TRIANGLESTRIP
          && browserProbe?.baseVertexIndex === 0
          && browserProbe?.minVertexIndex === 0
          && browserProbe?.firstIndex === 0
          && browserProbe?.vertexCount === 4
          && browserProbe?.indexCount === 4
          && browserProbe?.vertexStride === 16
          && browserProbe?.vertexShaderFvf === (D3DFVF_XYZ | D3DFVF_DIFFUSE)
          && browserProbe?.vertexLayout?.diffuseOffset === 12
          && browserProbe?.renderState?.lighting === 0
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_DIFFUSE
          && browserProbe?.renderState?.textureStages?.[0]?.alphaOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.alphaArg1 === D3DTA_DIFFUSE
          && centerPixelOk;
        return {
          ok,
          command,
          probe,
          browserProbe,
          sequenceDelta: afterSequence - beforeSequence,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8PointSpriteDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 point-sprite draw probe cannot run",
          };
        }
        const beforeSequence = Number(harnessState.graphics.d3d8DrawIndexedSequence ?? 0) >>> 0;
        const probe = parseModuleState(wasmModule.probeD3D8PointSpriteDraw());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const afterSequence = Number(harnessState.graphics.d3d8DrawIndexedSequence ?? 0) >>> 0;
        const offsetPixel = sampleCanvasPixel(
          Math.floor(canvas.width / 2) + 12,
          Math.floor(canvas.height / 2),
        );
        const centerPixelOk = pixelLooksRed(browserProbe?.centerPixel ?? [0, 0, 0, 0]);
        const pointSizeOk = pixelLooksRed(offsetPixel);
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && afterSequence - beforeSequence === 1
          && probe.calls?.createTexture === 1
          && probe.calls?.browserTextureCreate === 1
          && probe.calls?.browserTextureUpdate === 1
          && probe.calls?.browserTextureBind === 1
          && probe.calls?.browserTextureRelease === 1
          && probe.calls?.createVertexBuffer === 1
          && probe.calls?.createIndexBuffer === 0
          && probe.calls?.browserBufferCreate === 2
          && probe.calls?.browserBufferUpdate === 2
          && probe.calls?.browserBufferRelease === 2
          && probe.calls?.setTexture === 1
          && probe.calls?.setStreamSource === 1
          && probe.calls?.setIndices === 0
          && probe.calls?.drawPrimitive === 1
          && probe.calls?.drawIndexed === 0
          && probe.draw?.primitiveType === D3DPT_POINTLIST
          && probe.draw?.vertexCount === 1
          && probe.draw?.primitiveCount === 1
          && probe.draw?.vertexStride === 12
          && probe.draw?.vertexShaderFvf === D3DFVF_XYZ
          && probe.draw?.renderState?.pointSpriteEnable === 1
          && probe.draw?.renderState?.pointScaleEnable === 0
          && browserProbe?.primitiveType === D3DPT_POINTLIST
          && browserProbe?.vertexCount === 1
          && browserProbe?.indexCount === 1
          && browserProbe?.vertexStride === 12
          && browserProbe?.vertexShaderFvf === D3DFVF_XYZ
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordSupported === false
          && browserProbe?.pointSprite?.drawingPoints === true
          && browserProbe?.pointSprite?.spriteEnable === true
          && browserProbe?.pointSprite?.scaleEnable === false
          && Math.abs((browserProbe?.pointSprite?.pointSize ?? 0) - 32) < 0.001
          && centerPixelOk
          && pointSizeOk;
        return {
          ok,
          command,
          probe,
          browserProbe,
          sequenceDelta: afterSequence - beforeSequence,
          centerPixelOk,
          pointSizeOk,
          pointPixels: {
            center: browserProbe?.centerPixel ?? null,
            offset: offsetPixel,
          },
          state: snapshotState(),
        };
      }
    case "d3d8UserPointerDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 user-pointer draw probe cannot run",
          };
        }
        const beforeSequence = Number(harnessState.graphics.d3d8DrawIndexedSequence ?? 0) >>> 0;
        const probe = parseModuleState(wasmModule.probeD3D8UserPointerDraw());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const afterSequence = Number(harnessState.graphics.d3d8DrawIndexedSequence ?? 0) >>> 0;
        const centerPixelOk = pixelHasColor(browserProbe?.centerPixel ?? [0, 0, 0, 0]);
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && afterSequence - beforeSequence === 2
          && probe.calls?.createVertexBuffer === 0
          && probe.calls?.createIndexBuffer === 0
          && probe.calls?.browserBufferCreate === 2
          && probe.calls?.browserBufferUpdate === 4
          && probe.calls?.browserBufferRelease === 2
          && probe.calls?.setStreamSource === 0
          && probe.calls?.setIndices === 0
          && probe.calls?.drawPrimitive === 1
          && probe.calls?.drawIndexed === 1
          && probe.primitiveDraw?.vertexBufferId !== 0
          && probe.primitiveDraw?.indexBufferId !== 0
          && probe.primitiveDraw?.vertexBytes === 64
          && probe.primitiveDraw?.indexBytes === 8
          && probe.draw?.primitiveType === D3DPT_TRIANGLELIST
          && probe.draw?.vertexCount === 4
          && probe.draw?.primitiveCount === 2
          && probe.draw?.vertexStride === 16
          && probe.draw?.vertexShaderFvf === (D3DFVF_XYZ | D3DFVF_DIFFUSE)
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 4
          && browserProbe?.indexCount === 6
          && browserProbe?.vertexStride === 16
          && browserProbe?.vertexShaderFvf === (D3DFVF_XYZ | D3DFVF_DIFFUSE)
          && browserProbe?.vertexLayout?.diffuseOffset === 12
          && browserProbe?.renderState?.lighting === 0
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_DIFFUSE
          && browserProbe?.renderState?.textureStages?.[0]?.alphaOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.alphaArg1 === D3DTA_DIFFUSE
          && centerPixelOk;
        return {
          ok,
          command,
          probe,
          browserProbe,
          sequenceDelta: afterSequence - beforeSequence,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8TwoTextureQuad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 two-texture quad probe cannot run" };
        }
        const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8TwoTextureQuad());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const textureDelta = {
          creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
          updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
          binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
          releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
          releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          samplerApplications: (textureProbe?.samplerApplications ?? 0) -
            (beforeTextures.samplerApplications ?? 0),
        };
        const expectedCenter = probe.textures?.stage1?.expectedCenter ?? [0, 0, 255, 255];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel) &&
          pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.createTexture === 2
          && probe.calls?.browserTextureUpdate === 2
          && probe.calls?.browserTextureBind === 2
          && probe.calls?.setTexture === 2
          && probe.calls?.setTextureStageState === 18
          && probe.calls?.drawIndexed === 1
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.texCoordIndex === 0
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[1]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[1]?.texCoordIndex === 1
          && browserProbe?.texture0?.id === probe.textures?.stage0?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordSet === 0
          && browserProbe?.texture0?.texCoordOffset === D3D8_XYZNDUV_TEXCOORD0_OFFSET
          && browserProbe?.texture0?.sampler?.gl?.minFilter === gl.NEAREST
          && browserProbe?.texture0?.sampler?.gl?.magFilter === gl.NEAREST
          && browserProbe?.texture1?.id === probe.textures?.stage1?.id
          && browserProbe?.texture1?.ready === true
          && browserProbe?.texture1?.sampled === true
          && browserProbe?.texture1?.texCoordSet === 1
          && browserProbe?.texture1?.texCoordOffset ===
            D3D8_XYZNDUV_TEXCOORD0_OFFSET + D3D8_XYZNDUV_TEXCOORD_STRIDE
          && browserProbe?.texture1?.combiner?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.texture1?.combiner?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.texture1?.combiner?.supported === true
          && browserProbe?.stage1Combiner?.textureAvailable === true
          && browserProbe?.stage1Combiner?.supported === true
          && browserProbe?.texture1?.sampler?.gl?.minFilter === gl.NEAREST
          && browserProbe?.texture1?.sampler?.gl?.magFilter === gl.NEAREST
          && browserProbe?.boundTextures?.["0"] === probe.textures?.stage0?.id
          && browserProbe?.boundTextures?.["1"] === probe.textures?.stage1?.id
          && centerPixelOk
          && textureDelta.creates === 2
          && textureDelta.updates === 2
          && textureDelta.binds === 2
          && textureDelta.releaseUnbinds === 2
          && textureDelta.releases === 2
          && textureDelta.samplerApplications === 2
          && textureProbe?.live === 0
          && Object.keys(textureProbe?.boundTextures ?? {}).length === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureProbe,
          textureDelta,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8TwoTextureAlphaQuad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 two-texture alpha quad probe cannot run" };
        }
        const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8TwoTextureAlphaQuad());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const textureDelta = {
          creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
          updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
          binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
          releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
          releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          samplerApplications: (textureProbe?.samplerApplications ?? 0) -
            (beforeTextures.samplerApplications ?? 0),
        };
        const expectedCenter = probe.textures?.stage1?.expectedCenter ?? [128, 0, 0, 255];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel) &&
          pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 3);
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState === 7
          && probe.calls?.createTexture === 2
          && probe.calls?.browserTextureUpdate === 2
          && probe.calls?.browserTextureBind === 2
          && probe.calls?.setTexture === 2
          && probe.calls?.setTextureStageState === 21
          && probe.calls?.drawIndexed === 1
          && probe.draw?.renderState?.alphaBlendEnable === 1
          && probe.draw?.renderState?.srcBlend === D3DBLEND_SRCALPHA
          && probe.draw?.renderState?.destBlend === D3DBLEND_INVSRCALPHA
          && browserProbe?.renderState?.alphaBlendEnable === 1
          && browserProbe?.renderState?.srcBlend === D3DBLEND_SRCALPHA
          && browserProbe?.renderState?.destBlend === D3DBLEND_INVSRCALPHA
          && browserProbe?.appliedRenderState?.blend?.enabled === true
          && browserProbe?.appliedRenderState?.blend?.src === gl.SRC_ALPHA
          && browserProbe?.appliedRenderState?.blend?.dest === gl.ONE_MINUS_SRC_ALPHA
          && browserProbe?.appliedRenderState?.blend?.equation === gl.FUNC_ADD
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.alphaOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.alphaArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.texCoordIndex === 0
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_MODULATE
          && browserProbe?.renderState?.textureStages?.[1]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[1]?.colorArg2 === D3DTA_CURRENT
          && browserProbe?.renderState?.textureStages?.[1]?.alphaOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[1]?.alphaArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[1]?.texCoordIndex === 1
          && browserProbe?.texture0?.id === probe.textures?.stage0?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordSet === 0
          && browserProbe?.texture0?.texCoordOffset === D3D8_XYZNDUV_TEXCOORD0_OFFSET
          && browserProbe?.texture0?.combiner?.alphaOp === D3DTOP_SELECTARG1
          && browserProbe?.texture0?.combiner?.alphaArg1 === D3DTA_TEXTURE
          && browserProbe?.texture0?.sampler?.gl?.minFilter === gl.NEAREST
          && browserProbe?.texture0?.sampler?.gl?.magFilter === gl.NEAREST
          && browserProbe?.texture1?.id === probe.textures?.stage1?.id
          && browserProbe?.texture1?.ready === true
          && browserProbe?.texture1?.sampled === true
          && browserProbe?.texture1?.texCoordSet === 1
          && browserProbe?.texture1?.texCoordOffset ===
            D3D8_XYZNDUV_TEXCOORD0_OFFSET + D3D8_XYZNDUV_TEXCOORD_STRIDE
          && browserProbe?.texture1?.combiner?.colorOp === D3DTOP_MODULATE
          && browserProbe?.texture1?.combiner?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.texture1?.combiner?.colorArg2 === D3DTA_CURRENT
          && browserProbe?.texture1?.combiner?.alphaOp === D3DTOP_SELECTARG1
          && browserProbe?.texture1?.combiner?.alphaArg1 === D3DTA_TEXTURE
          && browserProbe?.texture1?.combiner?.textureAvailable === true
          && browserProbe?.texture1?.combiner?.supported === true
          && browserProbe?.stage1Combiner?.textureAvailable === true
          && browserProbe?.stage1Combiner?.supported === true
          && browserProbe?.texture1?.sampler?.gl?.minFilter === gl.NEAREST
          && browserProbe?.texture1?.sampler?.gl?.magFilter === gl.NEAREST
          && browserProbe?.boundTextures?.["0"] === probe.textures?.stage0?.id
          && browserProbe?.boundTextures?.["1"] === probe.textures?.stage1?.id
          && centerPixelOk
          && textureDelta.creates === 2
          && textureDelta.updates === 2
          && textureDelta.binds === 2
          && textureDelta.releaseUnbinds === 2
          && textureDelta.releases === 2
          && textureDelta.samplerApplications === 2
          && textureProbe?.live === 0
          && Object.keys(textureProbe?.boundTextures ?? {}).length === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureProbe,
          textureDelta,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8TextureMipChainDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture mip-chain probe cannot run" };
        }
        const cases = [];
        for (const caseId of [0, 1, 2, 3]) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8TextureMipChainDraw(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
            samplerApplications: (textureProbe?.samplerApplications ?? 0) -
              (beforeTextures.samplerApplications ?? 0),
          };
          const expectedCenter = Array.isArray(probe.expectedCenter)
            ? probe.expectedCenter
            : [0, 0, 0, 255];
          const expectedUploads = Number(probe.texture?.uploadedLevels ?? 0) >>> 0;
          const expectedComplete = Boolean(probe.texture?.completeMipChain);
          const expectedMipFilter = Number(probe.texture?.mipFilter ?? 0) >>> 0;
          const expectedRequestedMipmaps = expectedMipFilter !== D3DTEXF_NONE;
          const expectedUsedMipmaps = expectedComplete && expectedRequestedMipmaps;
          const expectedGlMin = expectedUsedMipmaps ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST;
          const expectedFallback = expectedRequestedMipmaps && !expectedComplete
            ? "incomplete mip chain"
            : null;
          const expectedMaxMipLevel = Number(probe.texture?.maxMipLevel ?? 0) >>> 0;
          const expectedBaseLevel = expectedComplete ? Math.min(expectedMaxMipLevel, 2) : 0;
          const expectedMaxLevel = expectedComplete ? 2 : 0;
          const expectedLodBias = Number(probe.texture?.mipMapLodBias ?? 0);
          const sampler = browserProbe?.texture0?.sampler ?? {};
          const centerPixelOk = browserProbe?.centerPixel
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 8);
          const caseOk = Boolean(probe.ok)
            && probe.source === "browser_d3d8_texture_mip_chain_draw_probe"
            && probe.calls?.createTexture === 1
            && probe.calls?.textureLockRect === expectedUploads
            && probe.calls?.textureUnlockRect === expectedUploads
            && probe.calls?.browserTextureUpdate === expectedUploads
            && probe.calls?.browserTextureBind === 1
            && probe.calls?.browserTextureRelease === 1
            && probe.calls?.setTextureStageState === 16
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.ok === true
            && browserProbe?.texture0?.id === probe.texture?.id
            && browserProbe?.texture0?.format === D3DFMT_A8R8G8B8
            && browserProbe?.texture0?.sampled === true
            && browserProbe?.texture0?.levels === 3
            && browserProbe?.texture0?.uploads === expectedUploads
            && browserProbe?.texture0?.initializedLevels?.join(",") ===
              probe.texture?.initializedLevels?.join(",")
            && browserProbe?.texture0?.completeMipChain === expectedComplete
            && sampler.d3d?.minFilter === D3DTEXF_POINT
            && sampler.d3d?.magFilter === D3DTEXF_POINT
            && sampler.d3d?.mipFilter === expectedMipFilter
            && sampler.d3d?.maxMipLevel === expectedMaxMipLevel
            && sampler.d3d?.mipMapLodBiasBits === (Number(probe.texture?.mipMapLodBiasBits ?? 0) >>> 0)
            && Math.abs((sampler.d3d?.mipMapLodBias ?? 0) - expectedLodBias) < 0.001
            && sampler.completeMipChain === expectedComplete
            && sampler.requestedMipmaps === expectedRequestedMipmaps
            && sampler.usedMipmaps === expectedUsedMipmaps
            && sampler.fallbackReason === expectedFallback
            && sampler.gl?.minFilter === expectedGlMin
            && sampler.gl?.baseLevel === expectedBaseLevel
            && sampler.gl?.maxLevel === expectedMaxLevel
            && Math.abs((sampler.gl?.lodBias ?? 0) - expectedLodBias) < 0.001
            && sampler.gl?.lodBiasSource === "shader"
            && browserProbe?.texture0?.combiner?.opName === "selectArg1"
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === expectedUploads
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureDelta.samplerApplications === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureProbe,
            textureDelta,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8TextureCombiner":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture combiner probe cannot run" };
        }
        const cases = [];
        for (let caseId = 0; caseId < 41; ++caseId) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8TextureCombiner(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          };
          const expectedCenter = probe.expectedCenter ?? [];
          const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
            && expectedCenter.length === 4
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const combiner = browserProbe?.texture0?.combiner ?? {};
          const stage1Combiner = browserProbe?.stage1Combiner ?? {};
          const expectedStageStateCalls = Number(probe.expectedStageStateCalls ?? 14);
          const caseOk = Boolean(probe.ok)
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.usedPersistentBuffers === true
            && browserProbe?.texture0?.sampled === true
            && browserProbe?.texture0?.id === probe.texture?.id
            && browserProbe?.texture0?.sampler?.gl?.minFilter === gl.NEAREST
            && browserProbe?.texture0?.sampler?.gl?.magFilter === gl.NEAREST
            && combiner.colorOp === probe.combiner?.colorOp
            && combiner.colorArg0 === probe.combiner?.colorArg0
            && combiner.colorArg1 === probe.combiner?.colorArg1
            && combiner.colorArg2 === probe.combiner?.colorArg2
            && combiner.resultArg === probe.combiner?.resultArg
            && combiner.alphaOp === probe.combiner?.alphaOp
            && combiner.alphaArg0 === probe.combiner?.alphaArg0
            && combiner.alphaArg1 === probe.combiner?.alphaArg1
            && combiner.alphaArg2 === probe.combiner?.alphaArg2
            && stage1Combiner.colorOp === probe.stage1Combiner?.colorOp
            && stage1Combiner.colorArg0 === probe.stage1Combiner?.colorArg0
            && stage1Combiner.colorArg1 === probe.stage1Combiner?.colorArg1
            && stage1Combiner.colorArg2 === probe.stage1Combiner?.colorArg2
            && stage1Combiner.alphaOp === probe.stage1Combiner?.alphaOp
            && stage1Combiner.alphaArg0 === probe.stage1Combiner?.alphaArg0
            && stage1Combiner.alphaArg1 === probe.stage1Combiner?.alphaArg1
            && stage1Combiner.alphaArg2 === probe.stage1Combiner?.alphaArg2
            && browserProbe?.renderState?.textureFactor === probe.textureFactor
            && browserProbe?.textureFactor === probe.textureFactor
            && combiner.supported === true
            && stage1Combiner.supported === true
            && Number(probe.calls?.setTextureStageState ?? 0) === expectedStageStateCalls
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8TexCoordIndex":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texcoord index probe cannot run" };
        }
        const cases = [];
        for (let caseId = 0; caseId < 6; ++caseId) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8TexCoordIndex(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          };
          const expectedCenter = probe.expectedCenter ?? [];
          const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
            && expectedCenter.length === 4
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const texture0 = browserProbe?.texture0 ?? {};
          const expectedGenerated = Boolean(probe.texcoord?.generated);
          const texCoordOffsetOk = expectedGenerated
            ? texture0.texCoordOffset === null
            : texture0.texCoordOffset === probe.texcoord?.expectedOffset;
          const caseOk = Boolean(probe.ok)
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.usedPersistentBuffers === true
            && browserProbe?.texture0?.sampled === true
            && texture0.id === probe.texture?.id
            && texture0.texCoordIndex === probe.texcoord?.index
            && texture0.texCoordModeName === probe.texcoord?.modeName
            && texture0.texCoordSet === probe.texcoord?.set
            && texture0.texCoordGenerated === expectedGenerated
            && texture0.texCoordUsesVertex === !expectedGenerated
            && texCoordOffsetOk
            && texture0.textureTransformFlags === probe.texcoord?.textureTransformFlags
            && texture0.textureTransformModeName === probe.transform?.modeName
            && texture0.textureTransformComponentCount === probe.transform?.componentCount
            && texture0.textureTransformProjected === Boolean(probe.transform?.projected)
            && texture0.textureTransformSupported === true
            && texture0.textureTransformApplied === Boolean(probe.transform?.applied)
            && texture0.texCoordSupported === true
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            centerPixelOk,
            texCoordOffsetOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8FvfTexCoordSizes":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 FVF texcoord-size probe cannot run" };
        }
        const cases = [];
        for (let caseId = 0; caseId < 2; ++caseId) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8FvfTexCoordSizes(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          };
          const expectedCenter = probe.expectedCenter ?? [];
          const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
            && expectedCenter.length === 4
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const texture0 = browserProbe?.texture0 ?? {};
          const vertexLayout = browserProbe?.vertexLayout ?? {};
          const selectedTexCoord = Array.isArray(vertexLayout.texCoords)
            ? vertexLayout.texCoords[probe.texcoord?.set]
            : null;
          const caseOk = Boolean(probe.ok)
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.usedPersistentBuffers === true
            && browserProbe?.vertexShaderFvf === probe.fvf?.vertexShaderFvf
            && vertexLayout.source === "fvf"
            && vertexLayout.computedStride === probe.fvf?.expectedVertexSize
            && vertexLayout.stride === probe.fvf?.vertexStride
            && vertexLayout.texCoords?.length === probe.fvf?.expectedTexCoordCount
            && selectedTexCoord?.offset === probe.texcoord?.expectedOffset
            && selectedTexCoord?.components === probe.texcoord?.expectedComponents
            && selectedTexCoord?.available === true
            && texture0.sampled === true
            && texture0.id === probe.texture?.id
            && texture0.texCoordIndex === probe.texcoord?.index
            && texture0.texCoordModeName === "passthru"
            && texture0.texCoordSet === probe.texcoord?.set
            && texture0.texCoordOffset === probe.texcoord?.expectedOffset
            && texture0.texCoordComponents === probe.texcoord?.expectedComponents
            && texture0.textureTransformFlags === probe.texcoord?.textureTransformFlags
            && texture0.textureTransformModeName === "disable"
            && texture0.textureTransformSupported === true
            && texture0.textureTransformApplied === false
            && texture0.texCoordSupported === true
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8TextureTransform":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 texture transform probe cannot run" };
        }
        const cases = [];
        for (let caseId = 0; caseId < 5; ++caseId) {
          const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8TextureTransform(caseId));
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          };
          const expectedCenter = probe.expectedCenter ?? [];
          const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
            && expectedCenter.length === 4
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const texture0 = browserProbe?.texture0 ?? {};
          const expectedApplied = Boolean(probe.transform?.applied);
          const caseOk = Boolean(probe.ok)
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.usedPersistentBuffers === true
            && texture0.sampled === true
            && texture0.id === probe.texture?.id
            && texture0.texCoordIndex === probe.texcoord?.index
            && texture0.texCoordModeName === "passthru"
            && texture0.texCoordSet === probe.texcoord?.set
            && texture0.texCoordOffset === probe.texcoord?.expectedOffset
            && texture0.textureTransformFlags === probe.texcoord?.textureTransformFlags
            && texture0.textureTransformModeName === probe.transform?.modeName
            && texture0.textureTransformComponentCount === probe.transform?.componentCount
            && texture0.textureTransformProjected === Boolean(probe.transform?.projected)
            && texture0.textureTransformSupported === true
            && texture0.textureTransformApplied === expectedApplied
            && texture0.texCoordSupported === true
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8Stage1TextureTransform":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 stage-1 texture transform probe cannot run" };
        }
        const beforeTextures = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8Stage1TextureTransform());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const textureDelta = {
          creates: (textureProbe?.creates ?? 0) - (beforeTextures.creates ?? 0),
          updates: (textureProbe?.updates ?? 0) - (beforeTextures.updates ?? 0),
          binds: (textureProbe?.binds ?? 0) - (beforeTextures.binds ?? 0),
          releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (beforeTextures.releaseUnbinds ?? 0),
          releases: (textureProbe?.releases ?? 0) - (beforeTextures.releases ?? 0),
          samplerApplications: (textureProbe?.samplerApplications ?? 0) -
            (beforeTextures.samplerApplications ?? 0),
        };
        const expectedCenter = probe.expectedCenter ?? [0, 0, 255, 255];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const texture0 = browserProbe?.texture0 ?? {};
        const texture1 = browserProbe?.texture1 ?? {};
        const texture1Matrix = Array.isArray(texture1.textureTransformMatrix)
          ? texture1.textureTransformMatrix
          : [];
        const texture1TranslationOk = Math.abs(
          Number(texture1Matrix[12] ?? 0) - Number(probe.transform?.expectedTranslationU ?? 0),
        ) <= 0.0001;
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.createTexture === 2
          && probe.calls?.browserTextureUpdate === 2
          && probe.calls?.browserTextureBind === 2
          && probe.calls?.setTexture === 2
          && probe.calls?.setTransform === 1
          && probe.calls?.setTextureStageState === 22
          && probe.calls?.drawIndexed === 1
          && probe.transform?.mask === probe.transform?.expectedMask
          && probe.transform?.expectedMask === 2
          && Math.abs((probe.transform?.translationU ?? 0) -
            (probe.transform?.expectedTranslationU ?? 0)) <= 0.0001
          && browserProbe?.renderState?.textureStages?.[0]?.textureTransformFlags === D3DTTFF_DISABLE
          && browserProbe?.renderState?.textureStages?.[1]?.textureTransformFlags === D3DTTFF_COUNT2
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_SELECTARG1
          && browserProbe?.renderState?.textureStages?.[1]?.colorArg1 === D3DTA_TEXTURE
          && texture0.id === probe.textures?.stage0?.id
          && texture0.ready === true
          && texture0.sampled === true
          && texture0.texCoordIndex === probe.texcoord?.stage0?.index
          && texture0.texCoordModeName === "passthru"
          && texture0.texCoordSet === probe.texcoord?.stage0?.set
          && texture0.texCoordOffset === probe.texcoord?.stage0?.expectedOffset
          && texture0.textureTransformFlags === probe.texcoord?.stage0?.textureTransformFlags
          && texture0.textureTransformModeName === "disable"
          && texture0.textureTransformSupported === true
          && texture0.textureTransformApplied === false
          && texture0.texCoordSupported === true
          && texture1.id === probe.textures?.stage1?.id
          && texture1.ready === true
          && texture1.sampled === true
          && texture1.texCoordIndex === probe.texcoord?.stage1?.index
          && texture1.texCoordModeName === "passthru"
          && texture1.texCoordSet === probe.texcoord?.stage1?.set
          && texture1.texCoordOffset === probe.texcoord?.stage1?.expectedOffset
          && texture1.textureTransformFlags === probe.texcoord?.stage1?.textureTransformFlags
          && texture1.textureTransformModeName === probe.transform?.modeName
          && texture1.textureTransformSupported === true
          && texture1.textureTransformApplied === true
          && texture1.texCoordSupported === true
          && texture1TranslationOk
          && browserProbe?.stage1Combiner?.textureAvailable === true
          && browserProbe?.stage1Combiner?.supported === true
          && centerPixelOk
          && textureDelta.creates === 2
          && textureDelta.updates === 2
          && textureDelta.binds === 2
          && textureDelta.releaseUnbinds === 2
          && textureDelta.releases === 2
          && textureDelta.samplerApplications === 2
          && textureProbe?.live === 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe,
          centerPixelOk,
          texture1TranslationOk,
          state: snapshotState(),
        };
      }
    case "d3d8StencilState":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 stencil-state probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8StencilState());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const cornerPixel = sampleCanvasPixel(16, 16);
        const expectedCenter = probe.expectedCenter ?? [];
        const expectedCorner = probe.expectedCorner ?? [];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && expectedCenter.length === 4
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const cornerPixelOk = Array.isArray(cornerPixel)
          && expectedCorner.length === 4
          && pixelsApproximatelyEqual(cornerPixel, expectedCorner, 2);
        const stencil = browserProbe?.appliedRenderState?.stencil ?? {};
        const caseOk = Boolean(probe.ok)
          && gl?.getContextAttributes()?.stencil === true
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.renderState?.stencilEnable === probe.stencil?.enable
          && browserProbe?.renderState?.stencilFunc === probe.stencil?.func
          && browserProbe?.renderState?.stencilRef === probe.stencil?.ref
          && browserProbe?.renderState?.stencilMask === probe.stencil?.mask
          && browserProbe?.renderState?.stencilWriteMask === probe.stencil?.writeMask
          && browserProbe?.renderState?.stencilPass === probe.stencil?.pass
          && stencil.available === true
          && stencil.enabled === true
          && stencil.func === gl.EQUAL
          && stencil.pass === gl.KEEP
          && stencil.ref === probe.stencil?.ref
          && stencil.mask === probe.stencil?.mask
          && stencil.writeMask === probe.stencil?.writeMask
          && centerPixelOk
          && cornerPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          cornerPixel,
          centerPixelOk,
          cornerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8FogState":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 fog-state probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8FogState());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedCenter = probe.expectedCenter ?? [];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && expectedCenter.length === 4
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const fog = browserProbe?.appliedRenderState?.fog ?? {};
        const renderState = browserProbe?.renderState ?? {};
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && renderState.fogEnable === probe.fog?.enable
          && renderState.fogColor === probe.fog?.color
          && renderState.fogStart === probe.fog?.startBits
          && renderState.fogEnd === probe.fog?.endBits
          && renderState.fogVertexMode === probe.fog?.vertexMode
          && renderState.rangeFogEnable === probe.fog?.rangeEnabled
          && fog.enabled === true
          && fog.vertexMode === D3DFOG_LINEAR
          && fog.rangeEnabled === false
          && Math.abs((fog.start ?? -1) - (probe.fog?.start ?? -1)) < 0.00001
          && Math.abs((fog.end ?? -1) - (probe.fog?.end ?? -1)) < 0.00001
          && centerPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8FillMode":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 fill-mode probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8FillMode());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedCenter = probe.expectedCenter ?? [];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && expectedCenter.length === 4
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const appliedFillMode = browserProbe?.appliedRenderState?.fillMode ?? {};
        const fillMode = browserProbe?.fillMode ?? {};
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.indexCount === 6
          && browserProbe?.transformMask === 7
          && browserProbe?.renderState?.fillMode === D3DFILL_WIREFRAME
          && browserProbe?.renderState?.cullMode === D3DCULL_CW
          && appliedFillMode.mode === D3DFILL_WIREFRAME
          && appliedFillMode.name === "wireframe"
          && browserProbe?.appliedRenderState?.cull?.enabled === true
          && fillMode.mode === D3DFILL_WIREFRAME
          && fillMode.modeName === "wireframe"
          && fillMode.supported === true
          && fillMode.wireframe === true
          && fillMode.temporaryIndexBuffer === true
          && fillMode.glPrimitiveName === "lines"
          && fillMode.generatedIndexCount === 6
          && fillMode.sourceTriangleCount === 2
          && fillMode.emittedTriangleCount === 1
          && fillMode.culledTriangleCount === 1
          && fillMode.cwTriangleCount === 1
          && fillMode.ccwTriangleCount === 1
          && fillMode.cullMode === D3DCULL_CW
          && fillMode.cullingRequested === true
          && fillMode.cullingApplied === true
          && fillMode.drawIndexCount === 6
          && fillMode.drawIndexByteOffset === 0
          && centerPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8ZBias":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 z-bias probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8ZBias());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedCenter = probe.expectedCenter ?? [];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && expectedCenter.length === 4
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const renderState = browserProbe?.renderState ?? {};
        const depth = browserProbe?.appliedRenderState?.depth ?? {};
        const depthBias = depth.bias ?? {};
        const appliedFillMode = browserProbe?.appliedRenderState?.fillMode ?? {};
        const fillMode = browserProbe?.fillMode ?? {};
        const caseOk = Boolean(probe.ok)
          && gl?.getContextAttributes()?.depth === true
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.drawIndexed === 2
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.indexCount === 6
          && renderState.zBias === probe.zBias?.biased
          && renderState.fillMode === D3DFILL_WIREFRAME
          && renderState.zFunc === D3DCMP_LESS
          && renderState.zEnable === D3DZB_TRUE
          && renderState.zWriteEnable === 1
          && depth.enabled === true
          && depth.mask === true
          && depth.func === gl.LESS
          && depthBias.raw === probe.zBias?.biased
          && depthBias.clamped === probe.zBias?.biased
          && typeof depthBias.ndc === "number"
          && depthBias.ndc > 0
          && appliedFillMode.mode === D3DFILL_WIREFRAME
          && appliedFillMode.name === "wireframe"
          && fillMode.mode === D3DFILL_WIREFRAME
          && fillMode.modeName === "wireframe"
          && fillMode.supported === true
          && fillMode.wireframe === true
          && fillMode.temporaryIndexBuffer === true
          && fillMode.glPrimitiveName === "lines"
          && fillMode.generatedIndexCount === 12
          && fillMode.sourceTriangleCount === 2
          && fillMode.emittedTriangleCount === 2
          && fillMode.culledTriangleCount === 0
          && fillMode.drawIndexCount === 12
          && centerPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8ShadeMode":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 shade-mode probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8ShadeMode());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedCenter = probe.expectedCenter ?? [];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && expectedCenter.length === 4
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2)
          && pixelLooksRed(browserProbe.centerPixel);
        const renderState = browserProbe?.renderState ?? {};
        const appliedShadeMode = browserProbe?.appliedRenderState?.shadeMode ?? {};
        const shadeMode = browserProbe?.shadeMode ?? {};
        const firstVertexFlatPath = shadeMode.usesFirstVertexConvention === true ||
          (shadeMode.rotatedIndexBuffer === true && shadeMode.temporaryIndexBuffer === true);
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.indexCount === 3
          && renderState.shadeMode === D3DSHADE_FLAT
          && appliedShadeMode.mode === D3DSHADE_FLAT
          && appliedShadeMode.name === "flat"
          && appliedShadeMode.flat === true
          && shadeMode.mode === D3DSHADE_FLAT
          && shadeMode.modeName === "flat"
          && shadeMode.flat === true
          && shadeMode.usesFlatShader === true
          && shadeMode.supported === true
          && shadeMode.glPrimitiveName === "triangles"
          && shadeMode.drawIndexCount === 3
          && shadeMode.drawIndexByteOffset === 0
          && firstVertexFlatPath
          && centerPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          centerPixelOk,
          firstVertexFlatPath,
          state: snapshotState(),
        };
      }
    case "d3d8ClipPlane":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 clip-plane probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8ClipPlane());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const clipPlane = probe.clipPlane?.plane ?? [1, 0, 0, 0];
        const browserClipPlane = browserProbe?.clipPlanes?.[0] ?? null;
        const appliedClipPlane = browserProbe?.appliedRenderState?.clipPlanes?.planes?.[0] ?? null;
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const expectedLeft = probe.expectedLeft ?? [0, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [0, 255, 0, 255];
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setClipPlane === 1
          && probe.calls?.drawIndexed === 1
          && probe.draw?.renderState?.clipping === 1
          && probe.draw?.renderState?.clipPlaneEnable === 1
          && floatVectorApproximatelyEqual(probe.draw?.capturedPlane, clipPlane)
          && browserProbe?.renderState?.clipping === 1
          && browserProbe?.renderState?.clipPlaneEnable === 1
          && browserProbe?.appliedRenderState?.clipPlanes?.enabled === true
          && browserProbe?.appliedRenderState?.clipPlanes?.mask === 1
          && browserProbe?.appliedRenderState?.clipPlanes?.enabledIndices?.join(",") === "0"
          && floatVectorApproximatelyEqual(browserClipPlane, clipPlane)
          && floatVectorApproximatelyEqual(appliedClipPlane, clipPlane)
          && pixelsApproximatelyEqual(leftPixel, expectedLeft, 2)
          && pixelsApproximatelyEqual(rightPixel, expectedRight, 2);
        return {
          ok,
          command,
          probe,
          browserProbe,
          clipPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk: pixelsApproximatelyEqual(leftPixel, expectedLeft, 2),
          rightPixelOk: pixelsApproximatelyEqual(rightPixel, expectedRight, 2),
          state: snapshotState(),
        };
      }
    case "d3d8LightingAmbient":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 lighting/ambient probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8LightingAmbient());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedCenter = probe.expectedCenter ?? [];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && expectedCenter.length === 4
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const renderState = browserProbe?.renderState ?? {};
        const lighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const ambient = browserProbe?.appliedRenderState?.ambient ?? {};
        const ambientRgba = ambient.rgba ?? [];
        const expectedAmbient = probe.lightingAmbient?.ambient ?? 0xff405060;
        const expectedAmbientRgba = d3dColorToNormalizedRgba(expectedAmbient);
        const ambientRgbaOk = Array.isArray(ambientRgba)
          && ambientRgba.length === 4
          && ambientRgba.every((component, index) =>
            Math.abs(component - expectedAmbientRgba[index]) < 0.00001);
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.indexCount === 6
          && renderState.lighting === 0
          && renderState.ambient === expectedAmbient
          && lighting.enabled === false
          && ambient.color === expectedAmbient
          && ambientRgbaOk
          && centerPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          centerPixelOk,
          ambientRgbaOk,
          state: snapshotState(),
        };
      }
    case "d3d8DirectionalLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 directional-light probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8DirectionalLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [0, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [0, 255, 0, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 2);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 2);
        const capturedLight = browserProbe?.lights?.[0] ?? {};
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const expectedLight = probe.light ?? {};
        const lightDirectionOk = floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const lightDiffuseOk = floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse);
        const material = normalizeD3D8Material(browserProbe?.material);
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const materialOk =
          floatVectorApproximatelyEqual(material.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(material.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(material.emissive, expectedMaterial.emissive);
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.directionalLights?.[0]?.index === 0
          && appliedLighting.firstDirectionalLight?.index === 0
          && capturedLight.enabled === true
          && capturedLight.type === D3DLIGHT_DIRECTIONAL
          && lightDiffuseOk
          && lightDirectionOk
          && materialOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          lightDiffuseOk,
          lightDirectionOk,
          materialOk,
          lightPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8MultiDirectionalLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 multi-directional-light probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8MultiDirectionalLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [0, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [255, 0, 255, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 2);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 2);
        const expectedRedLight = probe.lights?.[0] ?? {};
        const expectedBlueLight = probe.lights?.[1] ?? {};
        const capturedRedLight = browserProbe?.lights?.[0] ?? {};
        const capturedBlueLight = browserProbe?.lights?.[3] ?? {};
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLights = appliedLighting.directionalLights ?? [];
        const redLightOk = capturedRedLight.enabled === true
          && capturedRedLight.type === D3DLIGHT_DIRECTIONAL
          && floatVectorApproximatelyEqual(capturedRedLight.diffuse, expectedRedLight.diffuse)
          && floatVectorApproximatelyEqual(capturedRedLight.direction, expectedRedLight.direction);
        const blueLightOk = capturedBlueLight.enabled === true
          && capturedBlueLight.type === D3DLIGHT_DIRECTIONAL
          && floatVectorApproximatelyEqual(capturedBlueLight.diffuse, expectedBlueLight.diffuse)
          && floatVectorApproximatelyEqual(capturedBlueLight.direction, expectedBlueLight.direction);
        const selectedLightsOk = selectedLights.length === 2
          && selectedLights[0]?.index === 0
          && selectedLights[1]?.index === 3
          && floatVectorApproximatelyEqual(selectedLights[0]?.diffuse, expectedRedLight.diffuse)
          && floatVectorApproximatelyEqual(selectedLights[1]?.diffuse, expectedBlueLight.diffuse);
        const material = normalizeD3D8Material(browserProbe?.material);
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const materialOk =
          floatVectorApproximatelyEqual(material.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(material.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(material.emissive, expectedMaterial.emissive);
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setLight === 2
          && probe.calls?.lightEnable === 2
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && browserProbe?.lights?.[1]?.enabled === false
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 2
          && appliedLighting.firstDirectionalLight?.index === 0
          && selectedLightsOk
          && redLightOk
          && blueLightOk
          && materialOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          redLightOk,
          blueLightOk,
          selectedLightsOk,
          materialOk,
          lightPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8SpecularLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 specular-light probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8SpecularLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [0, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [255, 255, 255, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 2);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 2);
        const expectedLight = probe.light ?? {};
        const capturedLight = browserProbe?.lights?.[0] ?? {};
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.directionalLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const appliedSpecular = appliedLighting.specular ?? {};
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const lightSpecularOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const selectedLightOk =
          selectedLight.index === 0 &&
          floatVectorApproximatelyEqual(selectedLight.specular, expectedLight.specular);
        const appliedSpecularOk =
          appliedSpecular.enabled === true &&
          appliedSpecular.source === 0 &&
          appliedSpecular.sourceName === "material" &&
          floatVectorApproximatelyEqual(appliedSpecular.material, expectedMaterial.specular) &&
          Math.abs((appliedSpecular.power ?? 0) - expectedMaterial.power) < 0.00001;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState >= 13
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.specularEnable === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && browserProbe?.renderState?.specularMaterialSource === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.firstDirectionalLight?.index === 0
          && selectedLightOk
          && appliedSpecularOk
          && materialOk
          && lightSpecularOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightSpecularOk,
          selectedLightOk,
          appliedSpecularOk,
          specularPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8SpecularOffAxisLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 off-axis specular-light probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8SpecularOffAxisLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [0, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [255, 255, 255, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 2);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 3);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.directionalLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const appliedSpecular = appliedLighting.specular ?? {};
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const lightSpecularOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction) &&
          floatVectorApproximatelyEqual(expectedLight.direction, [-0.8, 0, -0.6]);
        const selectedLightOk =
          selectedLight.index === 0 &&
          floatVectorApproximatelyEqual(selectedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction);
        const appliedSpecularOk =
          appliedSpecular.enabled === true &&
          appliedSpecular.source === 0 &&
          appliedSpecular.sourceName === "material" &&
          floatVectorApproximatelyEqual(appliedSpecular.material, expectedMaterial.specular) &&
          Math.abs((appliedSpecular.power ?? 0) - expectedMaterial.power) < 0.00001;
        const offAxisShapeOk = pixelLooksBlack(leftPixel, 5)
          && Array.isArray(rightPixel)
          && rightPixel[0] >= 240
          && rightPixel[1] >= 240
          && rightPixel[2] >= 240
          && rightPixel[3] >= 200;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState >= 13
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.specularEnable === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && browserProbe?.renderState?.specularMaterialSource === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.firstDirectionalLight?.index === 0
          && selectedLightOk
          && appliedSpecularOk
          && materialOk
          && lightSpecularOk
          && offAxisShapeOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightSpecularOk,
          selectedLightOk,
          appliedSpecularOk,
          offAxisShapeOk,
          specularOffAxisPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8SpecularTransformedLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 transformed specular-light probe cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeD3D8SpecularTransformedLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [0, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [255, 255, 255, 255];
        const sampleNdcPixel = (point) => {
          const x = point?.[0] ?? 0;
          const y = point?.[1] ?? 0;
          return sampleCanvasPixel(
            Math.floor(canvas.width * ((x + 1) * 0.5)),
            Math.floor(canvas.height * (1 - ((y + 1) * 0.5))));
        };
        const leftPixel = sampleNdcPixel(probe.sampleNdc?.left);
        const rightPixel = sampleNdcPixel(probe.sampleNdc?.right);
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 2);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 8);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.directionalLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const appliedSpecular = appliedLighting.specular ?? {};
        const normalTransform = appliedLighting.normalTransform ?? {};
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const lightSpecularOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const selectedLightOk =
          selectedLight.index === 0 &&
          floatVectorApproximatelyEqual(selectedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction);
        const appliedSpecularOk =
          appliedSpecular.enabled === true &&
          appliedSpecular.source === 0 &&
          appliedSpecular.sourceName === "material" &&
          floatVectorApproximatelyEqual(appliedSpecular.material, expectedMaterial.specular) &&
          Math.abs((appliedSpecular.power ?? 0) - expectedMaterial.power) < 0.00001;
        const transformOk =
          browserProbe?.transformMask === 7 &&
          browserProbe?.usedTransforms === true &&
          probe.calls?.setTransform === 3 &&
          probe.transforms?.mask === 7 &&
          Math.abs((probe.transforms?.worldScaleX ?? 0) - 2.0) < 0.00001;
        const normalTransformOk =
          normalTransform.source === "inverseTransposeWorld" &&
          normalTransform.inverseTransposeWorld === true &&
          normalTransform.normalizeNormals === true;
        const transformedShapeOk = pixelLooksBlack(leftPixel, 5)
          && Array.isArray(rightPixel)
          && rightPixel[0] >= 240
          && rightPixel[1] >= 240
          && rightPixel[2] >= 240
          && rightPixel[3] >= 200;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState >= 13
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.specularEnable === 1
          && browserProbe?.renderState?.normalizeNormals === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && browserProbe?.renderState?.specularMaterialSource === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.firstDirectionalLight?.index === 0
          && selectedLightOk
          && appliedSpecularOk
          && materialOk
          && lightSpecularOk
          && transformOk
          && normalTransformOk
          && transformedShapeOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightSpecularOk,
          selectedLightOk,
          appliedSpecularOk,
          transformOk,
          normalTransformOk,
          transformedShapeOk,
          specularTransformedPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8NormalizeNormals":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 normalize-normals probe cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeD3D8NormalizeNormals());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [128, 128, 128, 255];
        const expectedRight = probe.expectedRight ?? [255, 255, 255, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 8);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 3);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.directionalLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const normalTransform = appliedLighting.normalTransform ?? {};
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const lightDiffuseOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const selectedLightOk =
          selectedLight.index === 0 &&
          floatVectorApproximatelyEqual(selectedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction);
        const transformOk =
          browserProbe?.transformMask === 7 &&
          browserProbe?.usedTransforms === true &&
          probe.calls?.setTransform === 3 &&
          probe.transforms?.mask === 7 &&
          Math.abs((probe.transforms?.worldScaleZ ?? 0) - 2.0) < 0.00001;
        const normalStatesOk =
          probe.normalStates?.falseDraw === 0 &&
          probe.normalStates?.trueDraw === 1;
        const normalTransformOk =
          normalTransform.source === "inverseTransposeWorld" &&
          normalTransform.inverseTransposeWorld === true &&
          normalTransform.normalizeNormals === true;
        const normalizedShapeOk = Array.isArray(leftPixel)
          && Array.isArray(rightPixel)
          && leftPixel[0] >= 112
          && leftPixel[0] <= 144
          && leftPixel[1] >= 112
          && leftPixel[1] <= 144
          && leftPixel[2] >= 112
          && leftPixel[2] <= 144
          && leftPixel[3] >= 200
          && rightPixel[0] >= 240
          && rightPixel[1] >= 240
          && rightPixel[2] >= 240
          && rightPixel[3] >= 200;
        const caseOk = Boolean(probe.ok)
          && probe.source === "browser_d3d8_normalize_normals_probe"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState >= 15
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 2
          && probe.draw?.vertexCount === 4
          && probe.draw?.primitiveCount === 2
          && probe.draw?.normalizeNormals === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 6
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.normalizeNormals === 1
          && browserProbe?.renderState?.specularEnable === 0
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && browserProbe?.renderState?.diffuseMaterialSource === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.normalizeNormals?.enabled === true
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.firstDirectionalLight?.index === 0
          && selectedLightOk
          && materialOk
          && lightDiffuseOk
          && transformOk
          && normalStatesOk
          && normalTransformOk
          && normalizedShapeOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightDiffuseOk,
          selectedLightOk,
          transformOk,
          normalStatesOk,
          normalTransformOk,
          normalizedShapeOk,
          normalizeNormalPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8LocalViewer":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 local-viewer probe cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeD3D8LocalViewer());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [0, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [255, 255, 255, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 5);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 4);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.directionalLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const normalTransform = appliedLighting.normalTransform ?? {};
        const viewDirection = appliedLighting.viewDirection ?? {};
        const appliedSpecular = appliedLighting.specular ?? {};
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const lightSpecularOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const selectedLightOk =
          selectedLight.index === 0 &&
          floatVectorApproximatelyEqual(selectedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction);
        const appliedSpecularOk =
          appliedSpecular.enabled === true &&
          appliedSpecular.source === 0 &&
          appliedSpecular.sourceName === "material" &&
          floatVectorApproximatelyEqual(appliedSpecular.material, expectedMaterial.specular) &&
          Math.abs((appliedSpecular.power ?? 0) - expectedMaterial.power) < 0.00001;
        const transformOk =
          browserProbe?.transformMask === 7 &&
          browserProbe?.usedTransforms === true &&
          probe.calls?.setTransform === 3 &&
          probe.transforms?.mask === 7;
        const localViewerStatesOk =
          probe.localViewerStates?.trueDraw === 1 &&
          probe.localViewerStates?.falseDraw === 0;
        const normalTransformOk =
          normalTransform.source === "inverseTransposeWorld" &&
          normalTransform.inverseTransposeWorld === true &&
          normalTransform.normalizeNormals === true;
        const localViewerOk =
          browserProbe?.renderState?.localViewer === 0 &&
          appliedLighting.localViewer?.enabled === false &&
          viewDirection.localViewer === false &&
          viewDirection.source === "orthogonal";
        const localViewerShapeOk = pixelLooksBlack(leftPixel, 5)
          && Array.isArray(rightPixel)
          && rightPixel[0] >= 240
          && rightPixel[1] >= 240
          && rightPixel[2] >= 240
          && rightPixel[3] >= 200;
        const caseOk = Boolean(probe.ok)
          && probe.source === "browser_d3d8_local_viewer_probe"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState >= 16
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 2
          && probe.draw?.vertexCount === 4
          && probe.draw?.primitiveCount === 2
          && probe.draw?.localViewer === 0
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 6
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.specularEnable === 1
          && browserProbe?.renderState?.normalizeNormals === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && browserProbe?.renderState?.specularMaterialSource === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.normalizeNormals?.enabled === true
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.firstDirectionalLight?.index === 0
          && selectedLightOk
          && appliedSpecularOk
          && materialOk
          && lightSpecularOk
          && transformOk
          && localViewerStatesOk
          && normalTransformOk
          && localViewerOk
          && localViewerShapeOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightSpecularOk,
          selectedLightOk,
          appliedSpecularOk,
          transformOk,
          localViewerStatesOk,
          normalTransformOk,
          localViewerOk,
          localViewerShapeOk,
          localViewerPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8PointLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 point-light probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8PointLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [128, 128, 128, 255];
        const expectedRight = probe.expectedRight ?? [254, 254, 254, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 10);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 3);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive);
        const lightAttenuationOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_POINT &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.position, expectedLight.position) &&
          Math.abs(capturedLight.range - expectedLight.range) < 0.00001 &&
          Math.abs(capturedLight.attenuation0 - expectedLight.attenuation0) < 0.00001 &&
          Math.abs(capturedLight.attenuation1 - expectedLight.attenuation1) < 0.00001 &&
          Math.abs(capturedLight.attenuation2 - expectedLight.attenuation2) < 0.00001;
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_POINT &&
          floatVectorApproximatelyEqual(selectedLight.position, expectedLight.position) &&
          Math.abs((selectedLight.attenuation1 ?? 0) - expectedLight.attenuation1) < 0.00001;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === false
          && appliedLighting.directionalLightCount === 0
          && selectedLightOk
          && materialOk
          && lightAttenuationOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightAttenuationOk,
          selectedLightOk,
          pointLightPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8PointQuadraticLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 quadratic point-light probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8PointQuadraticLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [90, 90, 90, 255];
        const expectedRight = probe.expectedRight ?? [253, 253, 253, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 8);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 4);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive);
        const lightAttenuationOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_POINT &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.position, expectedLight.position) &&
          Math.abs(capturedLight.range - expectedLight.range) < 0.00001 &&
          Math.abs(capturedLight.attenuation0 - expectedLight.attenuation0) < 0.00001 &&
          Math.abs(capturedLight.attenuation1 - expectedLight.attenuation1) < 0.00001 &&
          Math.abs(capturedLight.attenuation2 - expectedLight.attenuation2) < 0.00001 &&
          Math.abs(capturedLight.attenuation0) < 0.00001 &&
          Math.abs(capturedLight.attenuation1) < 0.00001 &&
          Math.abs(capturedLight.attenuation2 - 1) < 0.00001;
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_POINT &&
          floatVectorApproximatelyEqual(selectedLight.position, expectedLight.position) &&
          Math.abs((selectedLight.range ?? 0) - expectedLight.range) < 0.00001 &&
          Math.abs((selectedLight.attenuation0 ?? 0) - expectedLight.attenuation0) < 0.00001 &&
          Math.abs((selectedLight.attenuation1 ?? 0) - expectedLight.attenuation1) < 0.00001 &&
          Math.abs((selectedLight.attenuation2 ?? 0) - expectedLight.attenuation2) < 0.00001;
        const quadraticShapeOk =
          leftPixel[0] < 120 &&
          leftPixel[1] < 120 &&
          leftPixel[2] < 120 &&
          rightPixel[0] > 240 &&
          rightPixel[1] > 240 &&
          rightPixel[2] > 240;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === false
          && appliedLighting.directionalLightCount === 0
          && selectedLightOk
          && materialOk
          && lightAttenuationOk
          && leftPixelOk
          && rightPixelOk
          && quadraticShapeOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightAttenuationOk,
          selectedLightOk,
          quadraticShapeOk,
          pointQuadraticLightPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8PointRangeLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 point-light range probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8PointRangeLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [0, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [254, 254, 254, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 2);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 4);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive);
        const lightAttenuationOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_POINT &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.position, expectedLight.position) &&
          Math.abs(capturedLight.range - expectedLight.range) < 0.00001 &&
          Math.abs(capturedLight.attenuation0 - expectedLight.attenuation0) < 0.00001 &&
          Math.abs(capturedLight.attenuation1 - expectedLight.attenuation1) < 0.00001 &&
          Math.abs(capturedLight.attenuation2 - expectedLight.attenuation2) < 0.00001 &&
          Math.abs(capturedLight.range - 1.25) < 0.00001 &&
          Math.abs(capturedLight.attenuation0 - 1) < 0.00001 &&
          Math.abs(capturedLight.attenuation1) < 0.00001 &&
          Math.abs(capturedLight.attenuation2) < 0.00001;
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_POINT &&
          floatVectorApproximatelyEqual(selectedLight.position, expectedLight.position) &&
          Math.abs((selectedLight.range ?? 0) - expectedLight.range) < 0.00001 &&
          Math.abs((selectedLight.attenuation0 ?? 0) - expectedLight.attenuation0) < 0.00001 &&
          Math.abs((selectedLight.attenuation1 ?? 0) - expectedLight.attenuation1) < 0.00001 &&
          Math.abs((selectedLight.attenuation2 ?? 0) - expectedLight.attenuation2) < 0.00001;
        const rangeShapeOk =
          leftPixel[0] < 5 &&
          leftPixel[1] < 5 &&
          leftPixel[2] < 5 &&
          rightPixel[0] > 240 &&
          rightPixel[1] > 240 &&
          rightPixel[2] > 240;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === false
          && appliedLighting.directionalLightCount === 0
          && selectedLightOk
          && materialOk
          && lightAttenuationOk
          && leftPixelOk
          && rightPixelOk
          && rangeShapeOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightAttenuationOk,
          selectedLightOk,
          rangeShapeOk,
          pointRangeLightPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8PointMixedLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 mixed point-light probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8PointMixedLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [101, 101, 101, 255];
        const expectedRight = probe.expectedRight ?? [254, 254, 254, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 8);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 4);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive);
        const lightAttenuationOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_POINT &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.position, expectedLight.position) &&
          Math.abs(capturedLight.range - expectedLight.range) < 0.00001 &&
          Math.abs(capturedLight.attenuation0 - expectedLight.attenuation0) < 0.00001 &&
          Math.abs(capturedLight.attenuation1 - expectedLight.attenuation1) < 0.00001 &&
          Math.abs(capturedLight.attenuation2 - expectedLight.attenuation2) < 0.00001 &&
          Math.abs(capturedLight.range - 10) < 0.00001 &&
          Math.abs(capturedLight.attenuation0 - 0.1) < 0.00001 &&
          Math.abs(capturedLight.attenuation1 - 0.2) < 0.00001 &&
          Math.abs(capturedLight.attenuation2 - 0.7) < 0.00001;
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_POINT &&
          floatVectorApproximatelyEqual(selectedLight.position, expectedLight.position) &&
          Math.abs((selectedLight.range ?? 0) - expectedLight.range) < 0.00001 &&
          Math.abs((selectedLight.attenuation0 ?? 0) - expectedLight.attenuation0) < 0.00001 &&
          Math.abs((selectedLight.attenuation1 ?? 0) - expectedLight.attenuation1) < 0.00001 &&
          Math.abs((selectedLight.attenuation2 ?? 0) - expectedLight.attenuation2) < 0.00001;
        const mixedShapeOk =
          leftPixel[0] > 70 &&
          leftPixel[0] < 130 &&
          leftPixel[1] > 70 &&
          leftPixel[1] < 130 &&
          leftPixel[2] > 70 &&
          leftPixel[2] < 130 &&
          rightPixel[0] > 240 &&
          rightPixel[1] > 240 &&
          rightPixel[2] > 240;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === false
          && appliedLighting.directionalLightCount === 0
          && selectedLightOk
          && materialOk
          && lightAttenuationOk
          && leftPixelOk
          && rightPixelOk
          && mixedShapeOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightAttenuationOk,
          selectedLightOk,
          mixedShapeOk,
          pointMixedLightPixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8SpotLight":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 spot-light probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8SpotLight());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedOutside = probe.expectedOutside ?? [0, 0, 0, 255];
        const expectedInside = probe.expectedInside ?? [255, 255, 255, 255];
        const outsidePixel = sampleCanvasPixel(Math.floor(canvas.width * 0.85), Math.floor(canvas.height / 2));
        const insidePixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const outsidePixelOk = pixelsApproximatelyEqual(outsidePixel, expectedOutside, 2);
        const insidePixelOk = pixelsApproximatelyEqual(insidePixel, expectedInside, 3);
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive);
        const lightConeOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_SPOT &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.position, expectedLight.position) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction) &&
          Math.abs(capturedLight.range - expectedLight.range) < 0.00001 &&
          Math.abs(capturedLight.falloff - expectedLight.falloff) < 0.00001 &&
          Math.abs(capturedLight.attenuation0 - expectedLight.attenuation0) < 0.00001 &&
          Math.abs(capturedLight.attenuation1 - expectedLight.attenuation1) < 0.00001 &&
          Math.abs(capturedLight.attenuation2 - expectedLight.attenuation2) < 0.00001 &&
          Math.abs(capturedLight.theta - expectedLight.theta) < 0.00001 &&
          Math.abs(capturedLight.phi - expectedLight.phi) < 0.00001 &&
          Math.abs(capturedLight.theta - capturedLight.phi) < 0.00001;
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_SPOT &&
          floatVectorApproximatelyEqual(selectedLight.position, expectedLight.position) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction) &&
          Math.abs((selectedLight.range ?? 0) - expectedLight.range) < 0.00001 &&
          Math.abs((selectedLight.falloff ?? 0) - expectedLight.falloff) < 0.00001 &&
          Math.abs((selectedLight.attenuation0 ?? 0) - expectedLight.attenuation0) < 0.00001 &&
          Math.abs((selectedLight.attenuation1 ?? 0) - expectedLight.attenuation1) < 0.00001 &&
          Math.abs((selectedLight.attenuation2 ?? 0) - expectedLight.attenuation2) < 0.00001 &&
          Math.abs((selectedLight.theta ?? 0) - expectedLight.theta) < 0.00001 &&
          Math.abs((selectedLight.phi ?? 0) - expectedLight.phi) < 0.00001;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === false
          && appliedLighting.directionalLightCount === 0
          && selectedLightOk
          && materialOk
          && lightConeOk
          && outsidePixelOk
          && insidePixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightConeOk,
          selectedLightOk,
          spotLightPixels: {
            outside: outsidePixel,
            inside: insidePixel,
          },
          outsidePixelOk,
          insidePixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8SpotFalloff":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 spot falloff probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8SpotFalloff());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedInside = probe.expectedInside ?? [255, 255, 255, 255];
        const expectedPenumbra = probe.expectedPenumbra ?? [61, 61, 61, 255];
        const expectedOutside = probe.expectedOutside ?? [0, 0, 0, 255];
        const sampleNdcPixel = (point) => {
          const x = point?.[0] ?? 0;
          const y = point?.[1] ?? 0;
          return sampleCanvasPixel(
            Math.floor(canvas.width * ((x + 1) * 0.5)),
            Math.floor(canvas.height * (1 - ((y + 1) * 0.5))));
        };
        const insidePixel = sampleNdcPixel(probe.sampleNdc?.inside);
        const penumbraPixel = sampleNdcPixel(probe.sampleNdc?.penumbra);
        const outsidePixel = sampleNdcPixel(probe.sampleNdc?.outside);
        const insidePixelOk = pixelsApproximatelyEqual(insidePixel, expectedInside, 3);
        const penumbraPixelOk = pixelsApproximatelyEqual(penumbraPixel, expectedPenumbra, 16);
        const outsidePixelOk = pixelsApproximatelyEqual(outsidePixel, expectedOutside, 2);
        const penumbraSeparatedOk =
          penumbraPixel[0] > outsidePixel[0] + 30 &&
          penumbraPixel[1] > outsidePixel[1] + 30 &&
          penumbraPixel[2] > outsidePixel[2] + 30 &&
          penumbraPixel[0] < insidePixel[0] - 120 &&
          penumbraPixel[1] < insidePixel[1] - 120 &&
          penumbraPixel[2] < insidePixel[2] - 120;
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive);
        const lightFalloffOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_SPOT &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.position, expectedLight.position) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction) &&
          Math.abs(capturedLight.range - expectedLight.range) < 0.00001 &&
          Math.abs(capturedLight.falloff - expectedLight.falloff) < 0.00001 &&
          Math.abs(capturedLight.attenuation0 - expectedLight.attenuation0) < 0.00001 &&
          Math.abs(capturedLight.attenuation1 - expectedLight.attenuation1) < 0.00001 &&
          Math.abs(capturedLight.attenuation2 - expectedLight.attenuation2) < 0.00001 &&
          Math.abs(capturedLight.theta - expectedLight.theta) < 0.00001 &&
          Math.abs(capturedLight.phi - expectedLight.phi) < 0.00001 &&
          capturedLight.theta < capturedLight.phi &&
          Math.abs(capturedLight.falloff - 2) < 0.00001;
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_SPOT &&
          floatVectorApproximatelyEqual(selectedLight.position, expectedLight.position) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction) &&
          Math.abs((selectedLight.range ?? 0) - expectedLight.range) < 0.00001 &&
          Math.abs((selectedLight.falloff ?? 0) - expectedLight.falloff) < 0.00001 &&
          Math.abs((selectedLight.attenuation0 ?? 0) - expectedLight.attenuation0) < 0.00001 &&
          Math.abs((selectedLight.attenuation1 ?? 0) - expectedLight.attenuation1) < 0.00001 &&
          Math.abs((selectedLight.attenuation2 ?? 0) - expectedLight.attenuation2) < 0.00001 &&
          Math.abs((selectedLight.theta ?? 0) - expectedLight.theta) < 0.00001 &&
          Math.abs((selectedLight.phi ?? 0) - expectedLight.phi) < 0.00001 &&
          selectedLight.theta < selectedLight.phi;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 12
          && browserProbe?.indexCount === 18
          && browserProbe?.vertexLayout?.normalOffset === 12
          && browserProbe?.renderState?.lighting === 1
          && browserProbe?.renderState?.ambient === 0
          && browserProbe?.renderState?.colorVertex === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === false
          && appliedLighting.directionalLightCount === 0
          && selectedLightOk
          && materialOk
          && lightFalloffOk
          && insidePixelOk
          && penumbraPixelOk
          && outsidePixelOk
          && penumbraSeparatedOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          lightFalloffOk,
          selectedLightOk,
          spotFalloffPixels: {
            inside: insidePixel,
            penumbra: penumbraPixel,
            outside: outsidePixel,
          },
          insidePixelOk,
          penumbraPixelOk,
          outsidePixelOk,
          penumbraSeparatedOk,
          state: snapshotState(),
        };
      }
    case "d3d8Material":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 material probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8Material());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedCenter = probe.expectedCenter ?? [];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && expectedCenter.length === 4
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const appliedMaterial = normalizeD3D8Material(browserProbe?.appliedMaterial);
        const vectorOk = (left, right) => Array.isArray(left)
          && Array.isArray(right)
          && left.length === right.length
          && left.every((component, index) => Math.abs(component - right[index]) < 0.00001);
        const materialOk =
          vectorOk(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          vectorOk(browserMaterial.ambient, expectedMaterial.ambient) &&
          vectorOk(browserMaterial.specular, expectedMaterial.specular) &&
          vectorOk(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const appliedMaterialOk =
          vectorOk(appliedMaterial.diffuse, expectedMaterial.diffuse) &&
          vectorOk(appliedMaterial.ambient, expectedMaterial.ambient) &&
          vectorOk(appliedMaterial.specular, expectedMaterial.specular) &&
          vectorOk(appliedMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(appliedMaterial.power - expectedMaterial.power) < 0.00001;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setMaterial === 1
          && probe.calls?.getMaterial === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.indexCount === 6
          && browserProbe?.renderState?.lighting === 0
          && materialOk
          && appliedMaterialOk
          && centerPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          materialOk,
          appliedMaterialOk,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8MaterialSources":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 material-source probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8MaterialSources());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedCenter = probe.expectedCenter ?? [];
        const centerPixelOk = Array.isArray(browserProbe?.centerPixel)
          && expectedCenter.length === 4
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
        const expectedSources = probe.materialSources ?? {};
        const renderState = browserProbe?.renderState ?? {};
        const appliedSources = browserProbe?.appliedRenderState?.materialSources ?? {};
        const sourceValueOk =
          renderState.colorVertex === expectedSources.colorVertex &&
          renderState.diffuseMaterialSource === expectedSources.diffuse &&
          renderState.specularMaterialSource === expectedSources.specular &&
          renderState.ambientMaterialSource === expectedSources.ambient &&
          renderState.emissiveMaterialSource === expectedSources.emissive;
        const appliedSourcesOk =
          appliedSources.colorVertex?.enabled === (expectedSources.colorVertex !== 0) &&
          appliedSources.colorVertex?.value === expectedSources.colorVertex &&
          appliedSources.diffuse?.source === expectedSources.diffuse &&
          appliedSources.diffuse?.name === d3dMaterialSourceName(expectedSources.diffuse) &&
          appliedSources.specular?.source === expectedSources.specular &&
          appliedSources.specular?.name === d3dMaterialSourceName(expectedSources.specular) &&
          appliedSources.ambient?.source === expectedSources.ambient &&
          appliedSources.ambient?.name === d3dMaterialSourceName(expectedSources.ambient) &&
          appliedSources.emissive?.source === expectedSources.emissive &&
          appliedSources.emissive?.name === d3dMaterialSourceName(expectedSources.emissive);
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState === 11
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.indexCount === 6
          && renderState.lighting === 0
          && sourceValueOk
          && appliedSourcesOk
          && centerPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          sourceValueOk,
          appliedSourcesOk,
          centerPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8LitMaterialSources":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 lit material-source probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeD3D8LitMaterialSources());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [192, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [0, 192, 0, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 3);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 3);
        const expectedSources = probe.materialSources ?? {};
        const renderState = browserProbe?.renderState ?? {};
        const appliedSources = browserProbe?.appliedRenderState?.materialSources ?? {};
        const sourceValueOk =
          renderState.colorVertex === expectedSources.colorVertex &&
          renderState.diffuseMaterialSource === expectedSources.diffuse &&
          renderState.specularMaterialSource === expectedSources.specular &&
          renderState.ambientMaterialSource === expectedSources.ambient &&
          renderState.emissiveMaterialSource === expectedSources.emissive;
        const appliedSourcesOk =
          appliedSources.colorVertex?.enabled === (expectedSources.colorVertex !== 0) &&
          appliedSources.colorVertex?.value === expectedSources.colorVertex &&
          appliedSources.diffuse?.source === expectedSources.diffuse &&
          appliedSources.diffuse?.name === d3dMaterialSourceName(expectedSources.diffuse) &&
          appliedSources.specular?.source === expectedSources.specular &&
          appliedSources.specular?.name === d3dMaterialSourceName(expectedSources.specular) &&
          appliedSources.ambient?.source === expectedSources.ambient &&
          appliedSources.ambient?.name === d3dMaterialSourceName(expectedSources.ambient) &&
          appliedSources.emissive?.source === expectedSources.emissive &&
          appliedSources.emissive?.name === d3dMaterialSourceName(expectedSources.emissive);
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const lightOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(selectedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(selectedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction);
        const litColor1ShapeOk =
          Array.isArray(leftPixel) &&
          Array.isArray(rightPixel) &&
          leftPixel[0] >= 180 &&
          leftPixel[1] <= 20 &&
          leftPixel[2] <= 20 &&
          rightPixel[0] <= 20 &&
          rightPixel[1] >= 180 &&
          rightPixel[2] <= 20 &&
          leftPixel[3] >= 200 &&
          rightPixel[3] >= 200;
        const caseOk = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState === 13
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && renderState.lighting === 1
          && renderState.ambient === probe.sceneAmbient
          && renderState.specularEnable === 0
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.directionalLights?.[0]?.index === 0
          && sourceValueOk
          && appliedSourcesOk
          && materialOk
          && lightOk
          && selectedLightOk
          && litColor1ShapeOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          sourceValueOk,
          appliedSourcesOk,
          materialOk,
          lightOk,
          selectedLightOk,
          litColor1ShapeOk,
          litMaterialSourcePixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8LitSpecularMaterialSource":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 lit specular material-source probe cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeD3D8LitSpecularMaterialSource());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [255, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [0, 255, 0, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 4);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 4);
        const expectedSources = probe.materialSources ?? {};
        const renderState = browserProbe?.renderState ?? {};
        const appliedSources = browserProbe?.appliedRenderState?.materialSources ?? {};
        const sourceValueOk =
          renderState.colorVertex === expectedSources.colorVertex &&
          renderState.diffuseMaterialSource === expectedSources.diffuse &&
          renderState.specularMaterialSource === expectedSources.specular &&
          renderState.ambientMaterialSource === expectedSources.ambient &&
          renderState.emissiveMaterialSource === expectedSources.emissive;
        const appliedSourcesOk =
          appliedSources.colorVertex?.enabled === (expectedSources.colorVertex !== 0) &&
          appliedSources.colorVertex?.value === expectedSources.colorVertex &&
          appliedSources.diffuse?.source === expectedSources.diffuse &&
          appliedSources.diffuse?.name === d3dMaterialSourceName(expectedSources.diffuse) &&
          appliedSources.specular?.source === expectedSources.specular &&
          appliedSources.specular?.name === d3dMaterialSourceName(expectedSources.specular) &&
          appliedSources.ambient?.source === expectedSources.ambient &&
          appliedSources.ambient?.name === d3dMaterialSourceName(expectedSources.ambient) &&
          appliedSources.emissive?.source === expectedSources.emissive &&
          appliedSources.emissive?.name === d3dMaterialSourceName(expectedSources.emissive);
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const appliedSpecular = appliedLighting.specular ?? {};
        const lightOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(selectedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(selectedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(selectedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction);
        const appliedSpecularOk =
          appliedSpecular.enabled === true &&
          appliedSpecular.source === expectedSources.specular &&
          appliedSpecular.sourceName === d3dMaterialSourceName(expectedSources.specular) &&
          floatVectorApproximatelyEqual(appliedSpecular.material, expectedMaterial.specular) &&
          Math.abs((appliedSpecular.power ?? 0) - expectedMaterial.power) < 0.00001;
        const litSpecularSourceShapeOk =
          Array.isArray(leftPixel) &&
          Array.isArray(rightPixel) &&
          leftPixel[0] >= 240 &&
          leftPixel[1] <= 15 &&
          leftPixel[2] <= 15 &&
          rightPixel[0] <= 15 &&
          rightPixel[1] >= 240 &&
          rightPixel[2] <= 15 &&
          leftPixel[3] >= 200 &&
          rightPixel[3] >= 200;
        const caseOk = Boolean(probe.ok)
          && probe.source === "browser_d3d8_lit_specular_material_source_probe"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState === 13
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexLayout?.normalOffset === 12
          && renderState.lighting === 1
          && renderState.ambient === probe.sceneAmbient
          && renderState.specularEnable === 1
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.directionalLights?.[0]?.index === 0
          && sourceValueOk
          && appliedSourcesOk
          && materialOk
          && lightOk
          && selectedLightOk
          && appliedSpecularOk
          && litSpecularSourceShapeOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          sourceValueOk,
          appliedSourcesOk,
          materialOk,
          lightOk,
          selectedLightOk,
          appliedSpecularOk,
          litSpecularSourceShapeOk,
          litSpecularMaterialSourcePixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8LitEmissiveColor1MaterialSource":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 lit emissive COLOR1 material-source probe cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeD3D8LitEmissiveColor1MaterialSource());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [255, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [0, 255, 0, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 4);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 4);
        const expectedSources = probe.materialSources ?? {};
        const renderState = browserProbe?.renderState ?? {};
        const appliedSources = browserProbe?.appliedRenderState?.materialSources ?? {};
        const expectedFvf = probe.draw?.vertexShaderFvf ??
          (D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_DIFFUSE | D3DFVF_TEX2);
        const sourceValueOk =
          renderState.colorVertex === expectedSources.colorVertex &&
          renderState.diffuseMaterialSource === expectedSources.diffuse &&
          renderState.specularMaterialSource === expectedSources.specular &&
          renderState.ambientMaterialSource === expectedSources.ambient &&
          renderState.emissiveMaterialSource === expectedSources.emissive;
        const appliedSourcesOk =
          appliedSources.colorVertex?.enabled === (expectedSources.colorVertex !== 0) &&
          appliedSources.colorVertex?.value === expectedSources.colorVertex &&
          appliedSources.diffuse?.source === expectedSources.diffuse &&
          appliedSources.diffuse?.name === d3dMaterialSourceName(expectedSources.diffuse) &&
          appliedSources.specular?.source === expectedSources.specular &&
          appliedSources.specular?.name === d3dMaterialSourceName(expectedSources.specular) &&
          appliedSources.ambient?.source === expectedSources.ambient &&
          appliedSources.ambient?.name === d3dMaterialSourceName(expectedSources.ambient) &&
          appliedSources.emissive?.source === expectedSources.emissive &&
          appliedSources.emissive?.name === d3dMaterialSourceName(expectedSources.emissive);
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const vertexLayout = browserProbe?.vertexLayout ?? {};
        const lightOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(selectedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(selectedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(selectedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction);
        const vertexLayoutOk =
          browserProbe?.vertexShaderFvf === expectedFvf &&
          (browserProbe?.vertexShaderFvf & D3DFVF_SPECULAR) === 0 &&
          vertexLayout.source === "fvf" &&
          vertexLayout.fvf === expectedFvf &&
          vertexLayout.stride === 44 &&
          vertexLayout.computedStride === 44 &&
          vertexLayout.normalOffset === 12 &&
          vertexLayout.diffuseOffset === 24 &&
          vertexLayout.specularOffset === null &&
          vertexLayout.texCoords?.[0]?.offset === 28 &&
          vertexLayout.texCoords?.[1]?.offset === 36;
        const emissiveColor1ShapeOk =
          Array.isArray(leftPixel) &&
          Array.isArray(rightPixel) &&
          leftPixel[0] >= 240 &&
          leftPixel[1] <= 15 &&
          leftPixel[2] <= 15 &&
          rightPixel[0] <= 15 &&
          rightPixel[1] >= 240 &&
          rightPixel[2] <= 15 &&
          leftPixel[3] >= 200 &&
          rightPixel[3] >= 200;
        const caseOk = Boolean(probe.ok)
          && probe.source === "browser_d3d8_lit_emissive_color1_material_source_probe"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState === 13
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.setVertexShader === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexStride === 44
          && renderState.lighting === 1
          && renderState.ambient === probe.sceneAmbient
          && renderState.specularEnable === 0
          && expectedSources.emissive === D3DMCS_COLOR1
          && appliedSources.emissive?.name === "color1"
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.directionalLights?.[0]?.index === 0
          && sourceValueOk
          && appliedSourcesOk
          && materialOk
          && lightOk
          && selectedLightOk
          && vertexLayoutOk
          && emissiveColor1ShapeOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          sourceValueOk,
          appliedSourcesOk,
          materialOk,
          lightOk,
          selectedLightOk,
          vertexLayoutOk,
          emissiveColor1ShapeOk,
          litEmissiveColor1MaterialSourcePixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8LitEmissiveColor2MaterialSource":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; D3D8 lit emissive COLOR2 material-source probe cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeD3D8LitEmissiveColor2MaterialSource());
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedLeft = probe.expectedLeft ?? [255, 0, 0, 255];
        const expectedRight = probe.expectedRight ?? [0, 0, 255, 255];
        const leftPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.25), Math.floor(canvas.height / 2));
        const rightPixel = sampleCanvasPixel(Math.floor(canvas.width * 0.75), Math.floor(canvas.height / 2));
        const leftPixelOk = pixelsApproximatelyEqual(leftPixel, expectedLeft, 4);
        const rightPixelOk = pixelsApproximatelyEqual(rightPixel, expectedRight, 4);
        const expectedSources = probe.materialSources ?? {};
        const renderState = browserProbe?.renderState ?? {};
        const appliedSources = browserProbe?.appliedRenderState?.materialSources ?? {};
        const expectedFvf = probe.draw?.vertexShaderFvf ??
          (D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_DIFFUSE | D3DFVF_SPECULAR | D3DFVF_TEX2);
        const sourceValueOk =
          renderState.colorVertex === expectedSources.colorVertex &&
          renderState.diffuseMaterialSource === expectedSources.diffuse &&
          renderState.specularMaterialSource === expectedSources.specular &&
          renderState.ambientMaterialSource === expectedSources.ambient &&
          renderState.emissiveMaterialSource === expectedSources.emissive;
        const appliedSourcesOk =
          appliedSources.colorVertex?.enabled === (expectedSources.colorVertex !== 0) &&
          appliedSources.colorVertex?.value === expectedSources.colorVertex &&
          appliedSources.diffuse?.source === expectedSources.diffuse &&
          appliedSources.diffuse?.name === d3dMaterialSourceName(expectedSources.diffuse) &&
          appliedSources.specular?.source === expectedSources.specular &&
          appliedSources.specular?.name === d3dMaterialSourceName(expectedSources.specular) &&
          appliedSources.ambient?.source === expectedSources.ambient &&
          appliedSources.ambient?.name === d3dMaterialSourceName(expectedSources.ambient) &&
          appliedSources.emissive?.source === expectedSources.emissive &&
          appliedSources.emissive?.name === d3dMaterialSourceName(expectedSources.emissive);
        const expectedMaterial = normalizeD3D8Material(probe.material);
        const browserMaterial = normalizeD3D8Material(browserProbe?.material);
        const materialOk =
          floatVectorApproximatelyEqual(browserMaterial.diffuse, expectedMaterial.diffuse) &&
          floatVectorApproximatelyEqual(browserMaterial.ambient, expectedMaterial.ambient) &&
          floatVectorApproximatelyEqual(browserMaterial.specular, expectedMaterial.specular) &&
          floatVectorApproximatelyEqual(browserMaterial.emissive, expectedMaterial.emissive) &&
          Math.abs(browserMaterial.power - expectedMaterial.power) < 0.00001;
        const expectedLight = normalizeD3D8Light(probe.light, 0);
        const capturedLight = normalizeD3D8Light(browserProbe?.lights?.[0], 0);
        const appliedLighting = browserProbe?.appliedRenderState?.lighting ?? {};
        const selectedLight = appliedLighting.fixedFunctionLights?.[0] ?? {};
        const vertexLayout = browserProbe?.vertexLayout ?? {};
        const lightOk =
          capturedLight.enabled === true &&
          capturedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(capturedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(capturedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(capturedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(capturedLight.direction, expectedLight.direction);
        const selectedLightOk =
          selectedLight.index === 0 &&
          selectedLight.type === D3DLIGHT_DIRECTIONAL &&
          floatVectorApproximatelyEqual(selectedLight.diffuse, expectedLight.diffuse) &&
          floatVectorApproximatelyEqual(selectedLight.ambient, expectedLight.ambient) &&
          floatVectorApproximatelyEqual(selectedLight.specular, expectedLight.specular) &&
          floatVectorApproximatelyEqual(selectedLight.direction, expectedLight.direction);
        const vertexLayoutOk =
          browserProbe?.vertexShaderFvf === expectedFvf &&
          (browserProbe?.vertexShaderFvf & D3DFVF_SPECULAR) === D3DFVF_SPECULAR &&
          vertexLayout.source === "fvf" &&
          vertexLayout.fvf === expectedFvf &&
          vertexLayout.stride === 48 &&
          vertexLayout.computedStride === 48 &&
          vertexLayout.normalOffset === 12 &&
          vertexLayout.diffuseOffset === 24 &&
          vertexLayout.specularOffset === 28 &&
          vertexLayout.texCoords?.[0]?.offset === 32 &&
          vertexLayout.texCoords?.[1]?.offset === 40;
        const emissiveColor2ShapeOk =
          Array.isArray(leftPixel) &&
          Array.isArray(rightPixel) &&
          leftPixel[0] >= 240 &&
          leftPixel[1] <= 15 &&
          leftPixel[2] <= 15 &&
          rightPixel[0] <= 15 &&
          rightPixel[1] <= 15 &&
          rightPixel[2] >= 240 &&
          leftPixel[3] >= 200 &&
          rightPixel[3] >= 200;
        const caseOk = Boolean(probe.ok)
          && probe.source === "browser_d3d8_lit_emissive_color2_material_source_probe"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.setRenderState === 13
          && probe.calls?.setMaterial === 1
          && probe.calls?.setLight === 1
          && probe.calls?.lightEnable === 1
          && probe.calls?.setVertexShader === 1
          && probe.calls?.drawIndexed === 1
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.vertexCount === 8
          && browserProbe?.indexCount === 12
          && browserProbe?.vertexStride === 48
          && renderState.lighting === 1
          && renderState.ambient === probe.sceneAmbient
          && renderState.specularEnable === 0
          && expectedSources.emissive === D3DMCS_COLOR2
          && appliedSources.emissive?.name === "color2"
          && appliedLighting.enabled === true
          && appliedLighting.shaderEnabled === true
          && appliedLighting.fixedFunctionLightSupported === true
          && appliedLighting.fixedFunctionLightCount === 1
          && appliedLighting.directionalLightSupported === true
          && appliedLighting.directionalLightCount === 1
          && appliedLighting.directionalLights?.[0]?.index === 0
          && sourceValueOk
          && appliedSourcesOk
          && materialOk
          && lightOk
          && selectedLightOk
          && vertexLayoutOk
          && emissiveColor2ShapeOk
          && leftPixelOk
          && rightPixelOk;
        return {
          ok: caseOk,
          command,
          probe,
          browserProbe,
          sourceValueOk,
          appliedSourcesOk,
          materialOk,
          lightOk,
          selectedLightOk,
          vertexLayoutOk,
          emissiveColor2ShapeOk,
          litEmissiveColor2MaterialSourcePixels: {
            left: leftPixel,
            right: rightPixel,
          },
          leftPixelOk,
          rightPixelOk,
          state: snapshotState(),
        };
      }
    case "d3d8LegacyTextureUpload":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 legacy texture upload probe cannot run" };
        }
        const before = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeD3D8LegacyTextureUpload());
        const textureProbe = harnessState.graphics.d3d8Textures ?? null;
        const delta = {
          creates: (textureProbe?.creates ?? 0) - (before.creates ?? 0),
          updates: (textureProbe?.updates ?? 0) - (before.updates ?? 0),
          releases: (textureProbe?.releases ?? 0) - (before.releases ?? 0),
        };
        const probeFormats = Array.isArray(probe.formats) ? probe.formats : [];
        const legacyUploads = Array.isArray(textureProbe?.legacyUploads)
          ? textureProbe.legacyUploads.slice(-probeFormats.length)
          : [];
        const legacyByName = new Map(
          legacyUploads.map((entry) => {
            const name = entry.storage === "rg8-luminance-alpha" ? "A8L8"
              : entry.storage === "r8-luminance" ? "L8"
              : entry.storage === "r8-alpha" ? "A8"
              : null;
            return name ? [name, entry] : null;
          }).filter(Boolean),
        );
        const perFormat = probeFormats.map((entry) => {
          const browser = legacyByName.get(entry.name) ?? null;
          const expectedSwizzle = entry.name === "A8L8"
            ? { r: gl.RED, g: gl.RED, b: gl.RED, a: GL_GREEN, semantic: "luminanceAlpha" }
            : entry.name === "L8"
              ? { r: gl.RED, g: gl.RED, b: gl.RED, a: gl.ONE, semantic: "luminance" }
              : entry.name === "A8"
                ? { r: gl.ZERO, g: gl.ZERO, b: gl.ZERO, a: gl.RED, semantic: "alpha" }
                : null;
          const swizzle = browser?.swizzle ?? {};
          const swizzleOk = expectedSwizzle !== null
            && swizzle.r === expectedSwizzle.r
            && swizzle.g === expectedSwizzle.g
            && swizzle.b === expectedSwizzle.b
            && swizzle.a === expectedSwizzle.a
            && swizzle.semantic === expectedSwizzle.semantic;
          const samplePixelOk = Array.isArray(browser?.samplePixel)
            && browser.samplePixel.join(",") === (entry.expectedSampleRgba ?? []).join(",");
          const legacySampleOk = Array.isArray(browser?.legacySamplePixel)
            && browser.legacySamplePixel.slice(0, entry.expectedLegacySampleLen ?? 0).join(",")
              === (entry.expectedLegacySample ?? []).slice(0, entry.expectedLegacySampleLen ?? 0).join(",");
          return {
            name: entry.name,
            d3dFormat: entry.d3dFormat,
            pitch: entry.pitch,
            rowBytes: entry.rowBytes,
            bytesPerPixel: entry.bytesPerPixel,
            nativeOk: entry.create === 0
              && entry.lock === 0
              && entry.unlock === 0
              && entry.pitch === 2 * entry.bytesPerPixel
              && entry.rowBytes === 2 * entry.bytesPerPixel,
            browser,
            expectedSampleRgba: entry.expectedSampleRgba,
            expectedLegacySample: entry.expectedLegacySample,
            swizzleOk,
            samplePixelOk,
            legacySampleOk,
          };
        });
        const ok = Boolean(probe.ok)
          && probe.calls?.createTexture === 3
          && probe.calls?.textureLockRect === 3
          && probe.calls?.textureUnlockRect === 3
          && probe.calls?.browserTextureCreate === 3
          && probe.calls?.browserTextureUpdate === 3
          && probe.calls?.browserTextureRelease === 3
          && delta.creates === 3
          && delta.updates === 3
          && delta.releases === 3
          && textureProbe?.live === 0
          && perFormat.length === 3
          && perFormat.every((entry) => entry.nativeOk && entry.swizzleOk
            && entry.samplePixelOk && entry.legacySampleOk);
        return {
          ok,
          command,
          probe,
          browserProbe: textureProbe,
          browserDelta: delta,
          perFormat,
          state: snapshotState(),
        };
      }
    case "d3d8LegacyTextureDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 legacy texture draw probe cannot run" };
        }
        const cases = [];
        for (const caseId of [0, 1, 2]) {
          clearCanvas({ rgba: [0, 0, 0, 255] });
          harnessState.graphics = {
            ...harnessState.graphics,
            lastD3D8DrawIndexed: null,
          };
          const before = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8LegacyTextureDraw(caseId));
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (before.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (before.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (before.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (before.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (before.releases ?? 0),
            samplerApplications: (textureProbe?.samplerApplications ?? 0) - (before.samplerApplications ?? 0),
          };
          const expectedCenter = Array.isArray(probe.expectedCenter)
            ? probe.expectedCenter
            : [0, 0, 0, 255];
          const centerPixelOk = browserProbe?.centerPixel
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const legacyUpload = Array.isArray(textureProbe?.legacyUploads)
            ? textureProbe.legacyUploads[textureProbe.legacyUploads.length - 1] ?? null
            : null;
          const expectedSwizzle = probe.texture?.semantic === "luminanceAlpha"
            ? { r: gl.RED, g: gl.RED, b: gl.RED, a: GL_GREEN, semantic: "luminanceAlpha" }
            : probe.texture?.semantic === "luminance"
              ? { r: gl.RED, g: gl.RED, b: gl.RED, a: gl.ONE, semantic: "luminance" }
              : probe.texture?.semantic === "alpha"
                ? { r: gl.ZERO, g: gl.ZERO, b: gl.ZERO, a: gl.RED, semantic: "alpha" }
                : null;
          const swizzle = legacyUpload?.swizzle ?? {};
          const swizzleOk = expectedSwizzle !== null
            && swizzle.r === expectedSwizzle.r
            && swizzle.g === expectedSwizzle.g
            && swizzle.b === expectedSwizzle.b
            && swizzle.a === expectedSwizzle.a
            && swizzle.semantic === expectedSwizzle.semantic;
          const texelBytes = Array.isArray(probe.texture?.texelBytes) ? probe.texture.texelBytes : [];
          const expectedRawSample = [
            Number(texelBytes[0] ?? 0) >>> 0,
            (Number(probe.texture?.bytesPerPixel ?? 0) >>> 0) > 1
              ? Number(texelBytes[1] ?? 0) >>> 0
              : 0,
            0,
            255,
          ];
          const rawSampleOk = Array.isArray(legacyUpload?.samplePixel)
            && legacyUpload.samplePixel.join(",") === expectedRawSample.join(",");
          const caseOk = Boolean(probe.ok)
            && probe.source === "browser_d3d8_legacy_texture_draw_probe"
            && probe.calls?.createTexture === 1
            && probe.calls?.textureLockRect === 1
            && probe.calls?.textureUnlockRect === 1
            && probe.calls?.browserTextureUpdate === 1
            && probe.calls?.browserTextureBind === 1
            && probe.calls?.browserTextureRelease === 1
            && probe.calls?.setTextureStageState === 14
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.ok === true
            && browserProbe?.texture0?.id === probe.texture?.id
            && browserProbe?.texture0?.format === probe.texture?.format
            && browserProbe?.texture0?.sampled === true
            && browserProbe?.texture0?.combiner?.supported === true
            && browserProbe?.texture0?.sampler?.supported === true
            && centerPixelOk
            && legacyUpload?.format === probe.texture?.format
            && legacyUpload?.semantic === probe.texture?.semantic
            && swizzleOk
            && rawSampleOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureDelta.samplerApplications === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            legacyUpload,
            expectedRawSample,
            centerPixelOk,
            swizzleOk,
            rawSampleOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          state: snapshotState(),
        };
      }
    case "d3d8DxtTextureDraw":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; D3D8 DXT texture draw probe cannot run" };
        }
        const cases = [];
        const expectedStorage = ["dxt1", "dxt3", "dxt5", "dxt2", "dxt4"];
        const expectedAliasedStorage = [null, null, null, "dxt3", "dxt5"];
        const expectedPremultipliedAlpha = [false, false, false, true, true];
        for (const caseId of [0, 1, 2, 3, 4]) {
          clearCanvas({ rgba: [0, 0, 0, 255] });
          harnessState.graphics = {
            ...harnessState.graphics,
            lastD3D8DrawIndexed: null,
          };
          const before = harnessState.graphics.d3d8Textures ?? {};
          const probe = parseModuleState(wasmModule.probeD3D8DxtTextureDraw(caseId));
          const textureProbe = harnessState.graphics.d3d8Textures ?? null;
          const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
          const textureDelta = {
            creates: (textureProbe?.creates ?? 0) - (before.creates ?? 0),
            updates: (textureProbe?.updates ?? 0) - (before.updates ?? 0),
            binds: (textureProbe?.binds ?? 0) - (before.binds ?? 0),
            releaseUnbinds: (textureProbe?.releaseUnbinds ?? 0) - (before.releaseUnbinds ?? 0),
            releases: (textureProbe?.releases ?? 0) - (before.releases ?? 0),
            unsupportedUpdates: (textureProbe?.unsupportedUpdates ?? 0) - (before.unsupportedUpdates ?? 0),
            samplerApplications: (textureProbe?.samplerApplications ?? 0) - (before.samplerApplications ?? 0),
          };
          const expectedCenter = Array.isArray(probe.expectedCenter)
            ? probe.expectedCenter
            : [0, 0, 0, 255];
          const centerPixelOk = browserProbe?.centerPixel
            && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2);
          const lastUpdate = textureProbe?.lastUpdate ?? null;
          const caseOk = Boolean(probe.ok)
            && probe.source === "browser_d3d8_dxt_texture_draw_probe"
            && probe.calls?.createTexture === 1
            && probe.calls?.textureLockRect === 2
            && probe.calls?.textureUnlockRect === 1
            && probe.results?.partialLock !== 0
            && probe.calls?.browserTextureUpdate === 1
            && probe.calls?.browserTextureBind === 1
            && probe.calls?.browserTextureRelease === 1
            && probe.calls?.setTextureStageState === 14
            && lastUpdate?.compressed === true
            && lastUpdate?.storage === expectedStorage[caseId]
            && (lastUpdate?.aliasedStorage ?? null) === expectedAliasedStorage[caseId]
            && lastUpdate?.premultipliedAlpha === expectedPremultipliedAlpha[caseId]
            && lastUpdate?.blockBytes === probe.texture?.blockBytes
            && lastUpdate?.byteSize === probe.texture?.byteSize
            && lastUpdate?.convertedByteSize === probe.texture?.byteSize
            && browserProbe?.source === "browser_d3d8_draw_indexed"
            && browserProbe?.ok === true
            && browserProbe?.texture0?.id === probe.texture?.id
            && browserProbe?.texture0?.format === probe.texture?.format
            && browserProbe?.texture0?.sampled === true
            && browserProbe?.texture0?.combiner?.supported === true
            && browserProbe?.texture0?.sampler?.supported === true
            && centerPixelOk
            && textureDelta.creates === 1
            && textureDelta.updates === 1
            && textureDelta.binds === 1
            && textureDelta.releaseUnbinds === 1
            && textureDelta.releases === 1
            && textureDelta.unsupportedUpdates === 0
            && textureDelta.samplerApplications === 1
            && textureProbe?.live === 0;
          cases.push({
            ok: caseOk,
            probe,
            browserProbe,
            textureDelta,
            lastUpdate,
            centerPixelOk,
          });
        }
        return {
          ok: cases.every((entry) => entry.ok),
          command,
          cases,
          s3tc: Boolean(s3tc),
          state: snapshotState(),
        };
      }
    case "ww3dAABox":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D AABox cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DAABox());
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && pixelHasColor(browserProbe.centerPixel)
          && pixelHasColor(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dSceneCamera":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D scene/camera cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DSceneCamera());
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const cameraViewport = probe.viewport ?? {};
        const drawViewport = browserProbe?.viewport ?? null;
        const expectedViewportBox = expectedD3D8ViewportGlBox(
          cameraViewport,
          drawViewport?.renderTarget,
          drawViewport?.drawingBuffer,
        );
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 36
          && (probe.calls?.setViewport ?? 0) >= 1
          && cameraViewport.x === 0
          && cameraViewport.y === 0
          && cameraViewport.width > 0
          && cameraViewport.height > 0
          && Math.abs((cameraViewport.minZ ?? -1) - 0) < 0.00001
          && Math.abs((cameraViewport.maxZ ?? -1) - 1) < 0.00001
          && drawViewport?.source === "browser_d3d8_viewport"
          && drawViewport?.reason === "draw"
          && drawViewport?.ok === true
          && drawViewport?.d3d?.x === cameraViewport.x
          && drawViewport?.d3d?.y === cameraViewport.y
          && drawViewport?.d3d?.width === cameraViewport.width
          && drawViewport?.d3d?.height === cameraViewport.height
          && viewportArraysEqual(drawViewport?.actual?.viewport, expectedViewportBox)
          && viewportArraysEqual(drawViewport?.actual?.scissor, expectedViewportBox)
          && viewportArraysEqual(drawViewport?.actual?.depthRange, [0, 1], 0.00001)
          && pixelHasColor(browserProbe.centerPixel)
          && pixelHasColor(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dRTSScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D RTS scene cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DRTSScene());
        const screenshot = snapshotCanvas();
        const coverage = sampleCanvasRegion({
          left: 0,
          top: 0,
          width: canvas.width,
          height: canvas.height,
        });
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const renderState = browserProbe?.renderState ?? {};
        const fillMode = browserProbe?.fillMode ?? {};
        const depthBias = browserProbe?.appliedRenderState?.depth?.bias ?? {};
        const ok = Boolean(probe.ok)
          && probe?.scene?.type === "RTS3DScene"
          && probe?.scene?.extraPassMode === 1
          && probe?.scene?.extraPassName === "EXTRA_PASS_LINE"
          && probe?.draw?.renderState?.fillMode === D3DFILL_WIREFRAME
          && probe?.draw?.renderState?.zBias === 7
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 36
          && renderState.fillMode === D3DFILL_WIREFRAME
          && renderState.zBias === 7
          && renderState.colorWriteEnable === (
            D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN | D3DCOLORWRITEENABLE_BLUE)
          && depthBias.raw === 7
          && depthBias.clamped === 7
          && typeof depthBias.ndc === "number"
          && depthBias.ndc > 0
          && fillMode.mode === D3DFILL_WIREFRAME
          && fillMode.wireframe === true
          && fillMode.temporaryIndexBuffer === true
          && fillMode.glPrimitiveName === "lines"
          && fillMode.generatedIndexCount === 24
          && fillMode.sourceTriangleCount === 12
          && fillMode.emittedTriangleCount === 4
          && fillMode.culledTriangleCount === 8
          && fillMode.cullingApplied === true
          && coverage.coloredPixelCount > 0
          && pixelHasColor(coverage.brightestPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          coverage,
          state: snapshotState(),
        };
      }
    case "ww3dRTSSceneClearLine":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D RTS clear-line scene cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DRTSSceneClearLine());
        const screenshot = snapshotCanvas();
        const coverage = sampleCanvasRegion({
          left: 0,
          top: 0,
          width: canvas.width,
          height: canvas.height,
        });
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const renderState = browserProbe?.renderState ?? {};
        const fillMode = browserProbe?.fillMode ?? {};
        const depthBias = browserProbe?.appliedRenderState?.depth?.bias ?? {};
        const drawViewport = browserProbe?.viewport ?? {};
        const drawDepthRange = drawViewport?.actual?.depthRange ?? [];
        const expectedOverlayMaxZ = 0.9999;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_rts_scene_clear_line_probe"
          && probe?.scene?.type === "RTS3DScene"
          && probe?.scene?.extraPassMode === 2
          && probe?.scene?.extraPassName === "EXTRA_PASS_CLEAR_LINE"
          && probe?.calls?.drawIndexed >= 2
          && probe?.calls?.clear >= 2
          && probe?.calls?.setViewport >= 3
          && probe?.clear?.flags === D3DCLEAR_TARGET
          && (probe?.clear?.color & 0x00ffffff) === 0
          && Math.abs((probe?.clear?.z ?? -1) - 1) < 0.00001
          && Math.abs((probe?.viewport?.maxZ ?? -1) - 1) < 0.00001
          && probe?.draw?.renderState?.fillMode === D3DFILL_WIREFRAME
          && probe?.draw?.renderState?.zBias === 0
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 36
          && renderState.fillMode === D3DFILL_WIREFRAME
          && renderState.zBias === 0
          && renderState.colorWriteEnable === (
            D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN | D3DCOLORWRITEENABLE_BLUE)
          && depthBias.raw === 0
          && depthBias.clamped === 0
          && depthBias.ndc === 0
          && drawViewport?.source === "browser_d3d8_viewport"
          && drawViewport?.reason === "draw"
          && Math.abs((drawViewport?.d3d?.minZ ?? -1) - 0) < 0.00001
          && Math.abs((drawViewport?.d3d?.maxZ ?? -1) - expectedOverlayMaxZ) < 0.00001
          && viewportArraysEqual(drawDepthRange, [0, expectedOverlayMaxZ], 0.00001)
          && fillMode.mode === D3DFILL_WIREFRAME
          && fillMode.wireframe === true
          && fillMode.temporaryIndexBuffer === true
          && fillMode.glPrimitiveName === "lines"
          && fillMode.generatedIndexCount === 24
          && fillMode.sourceTriangleCount === 12
          && fillMode.emittedTriangleCount === 4
          && fillMode.culledTriangleCount === 8
          && fillMode.cullingApplied === true
          && coverage.coloredPixelCount > 0
          && pixelHasColor(coverage.brightestPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          coverage,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay scene cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DDisplayScene());
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_scene_probe"
          && probe?.display?.path === "W3DDisplay::m_3DScene"
          && probe?.scene?.type === "RTS3DScene"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 36
          && pixelHasColor(browserProbe.centerPixel)
          && pixelHasColor(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dRender2DTexturedQuad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D Render2D cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DRender2DTexturedQuad());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dRender2DSentence":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D Render2DSentence cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DRender2DSentence());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const virtualDrawRect = probe?.extents?.draw ?? {};
        const scaleX = screenshot.width / 800;
        const scaleY = screenshot.height / 600;
        const drawRect = {
          left: (virtualDrawRect.left ?? 0) * scaleX,
          top: (virtualDrawRect.top ?? 0) * scaleY,
          right: (virtualDrawRect.right ?? 0) * scaleX,
          bottom: (virtualDrawRect.bottom ?? 0) * scaleY,
        };
        const textRegion = sampleCanvasRegion(drawRect, 8);
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.copyRects?.uploadedTextureId
          && browserProbe?.texture0?.format === D3DFMT_A4R4G4B4
          && (textRegion.coloredPixelCount ?? 0) > 16
          && (textRegion.maxComponent ?? 0) > 32;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textRegion,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayString":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplayString cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayString());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const virtualDrawRect = probe?.drawRegion ?? {};
        const scaleX = screenshot.width / 800;
        const scaleY = screenshot.height / 600;
        const drawRect = {
          left: (virtualDrawRect.left ?? 0) * scaleX,
          top: (virtualDrawRect.top ?? 0) * scaleY,
          right: (virtualDrawRect.right ?? 0) * scaleX,
          bottom: (virtualDrawRect.bottom ?? 0) * scaleY,
        };
        const textRegion = sampleCanvasRegion(drawRect, 8);
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.copyRects?.uploadedTextureId
          && browserProbe?.texture0?.format === D3DFMT_A4R4G4B4
          && (textRegion.coloredPixelCount ?? 0) > 16
          && (textRegion.maxComponent ?? 0) > 32;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textRegion,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayGameText":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; GameText-backed WW3DDisplayString cannot render" };
        }
        const englishArchivePath = String(payload.englishArchivePath ?? "/assets/runtime-game-text/EnglishZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayGameText(englishArchivePath));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const virtualDrawRect = probe?.drawRegion ?? {};
        const scaleX = screenshot.width / 800;
        const scaleY = screenshot.height / 600;
        const drawRect = {
          left: (virtualDrawRect.left ?? 0) * scaleX,
          top: (virtualDrawRect.top ?? 0) * scaleY,
          right: (virtualDrawRect.right ?? 0) * scaleX,
          bottom: (virtualDrawRect.bottom ?? 0) * scaleY,
        };
        const textRegion = sampleCanvasRegion(drawRect, 8);
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_game_text_probe"
          && probe?.archives?.english === englishArchivePath
          && probe?.gameText?.csfPath === "Data\\English\\Generals.csf"
          && probe?.gameText?.label === "GUI:Command&ConquerGenerals"
          && probe?.gameText?.created === true
          && probe?.gameText?.initialized === true
          && probe?.gameText?.labelExists === true
          && probe?.gameText?.nonEmpty === true
          && typeof probe?.gameText?.ascii === "string"
          && probe.gameText.ascii.length > 0
          && probe?.runtimeAssets?.installed === true
          && probe?.runtimeAssets?.archiveLoaded === true
          && probe?.runtimeAssets?.w3dFileSystemInstalled === true
          && probe?.results?.runtimeAssetSystemInstalled === true
          && probe?.results?.csfExists === true
          && probe?.results?.displayStringAllocated === true
          && probe?.results?.fontSet === true
          && probe?.results?.textSet === true
          && probe?.results?.sizeComputed === true
          && probe?.results?.drawCalled === true
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.copyRects?.uploadedTextureId
          && browserProbe?.texture0?.format === D3DFMT_A4R4G4B4
          && (textRegion.coloredPixelCount ?? 0) > 16
          && (textRegion.maxComponent ?? 0) > 32
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && textureDelta.binds >= 1;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textRegion,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayShellComposite":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D shell composite cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "/assets/runtime-shell-composite/INIZH.big");
        const englishArchivePath = String(payload.englishArchivePath ?? "/assets/runtime-shell-composite/EnglishZH.big");
        const cloneState = (value) => value == null ? null : JSON.parse(JSON.stringify(value));
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };

        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const sceneProbe = parseModuleState(wasmModule.probeWW3DDisplayScene());
        const sceneBrowserProbe = cloneState(harnessState.graphics.lastD3D8DrawIndexed ?? null);
        const sceneCenterPixel = sampleVirtualCanvasPixel(400, 300);

        const mappedProbe = parseModuleState(wasmModule.probeWW3DDisplayMappedImage(
          iniArchivePath,
          englishArchivePath,
        ));
        const mappedBrowserProbe = cloneState(harnessState.graphics.lastD3D8DrawIndexed ?? null);
        const mappedRect = mappedProbe?.draw?.screenRect ?? {};
        const mappedCenter = {
          x: Math.floor(((mappedRect.left ?? 300) + (mappedRect.right ?? 500)) / 2),
          y: Math.floor(((mappedRect.top ?? 220) + (mappedRect.bottom ?? 380)) / 2),
        };
        const mappedCenterPixel = sampleVirtualCanvasPixel(mappedCenter.x, mappedCenter.y);

        const gameTextProbe = parseModuleState(wasmModule.probeWW3DDisplayGameText(englishArchivePath));
        const textBrowserProbe = cloneState(harnessState.graphics.lastD3D8DrawIndexed ?? null);
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const virtualDrawRect = gameTextProbe?.drawRegion ?? {};
        const scaleX = screenshot.width / 800;
        const scaleY = screenshot.height / 600;
        const textRect = {
          left: (virtualDrawRect.left ?? 0) * scaleX,
          top: (virtualDrawRect.top ?? 0) * scaleY,
          right: (virtualDrawRect.right ?? 0) * scaleX,
          bottom: (virtualDrawRect.bottom ?? 0) * scaleY,
        };
        const textRegion = sampleCanvasRegion(textRect, 8);
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const sceneOk = Boolean(sceneProbe?.ok)
          && sceneProbe?.source === "ww3d_display_scene_probe"
          && sceneProbe?.display?.path === "W3DDisplay::m_3DScene"
          && sceneProbe?.scene?.type === "RTS3DScene"
          && sceneBrowserProbe?.source === "browser_d3d8_draw_indexed"
          && sceneBrowserProbe?.ok === true
          && sceneBrowserProbe?.usedTransforms === true
          && pixelHasColor(sceneCenterPixel);
        const mappedOk = Boolean(mappedProbe?.ok)
          && mappedProbe?.source === "ww3d_display_mapped_image_probe"
          && mappedProbe?.image?.name === "WatermarkChina"
          && mappedProbe?.results?.mappedCollectionLoaded === true
          && mappedProbe?.results?.drawImageCalled === true
          && mappedBrowserProbe?.source === "browser_d3d8_draw_indexed"
          && mappedBrowserProbe?.texture0?.sampled === true
          && pixelHasColor(mappedCenterPixel, 8);
        const textOk = Boolean(gameTextProbe?.ok)
          && gameTextProbe?.source === "ww3d_display_game_text_probe"
          && gameTextProbe?.gameText?.label === "GUI:Command&ConquerGenerals"
          && gameTextProbe?.results?.drawCalled === true
          && textBrowserProbe?.source === "browser_d3d8_draw_indexed"
          && textBrowserProbe?.texture0?.sampled === true
          && (textRegion.coloredPixelCount ?? 0) > 16
          && (textRegion.maxComponent ?? 0) > 32;
        const ok = sceneOk
          && mappedOk
          && textOk
          && pixelHasColor(screenshot.centerPixel, 8)
          && textureDelta.creates >= 2
          && textureDelta.updates >= 2
          && textureDelta.binds >= 2;
        return {
          ok,
          command,
          source: "ww3d_display_shell_composite",
          browserTransport: "Playwright WebGL2 screenshot",
          originalPaths: [
            "W3DDisplay::m_3DScene -> WW3D::Render",
            "ImageCollection::load(512) -> INI::loadDirectory -> W3DDisplay::drawImage",
            "GameText::fetch -> W3DDisplayString::draw",
          ],
          archives: {
            ini: iniArchivePath,
            english: englishArchivePath,
          },
          checks: {
            sceneOk,
            mappedOk,
            textOk,
          },
          scene: {
            probe: sceneProbe,
            browserProbe: sceneBrowserProbe,
            centerPixel: sceneCenterPixel,
          },
          mappedImage: {
            probe: mappedProbe,
            browserProbe: mappedBrowserProbe,
            center: mappedCenter,
            centerPixel: mappedCenterPixel,
          },
          gameText: {
            probe: gameTextProbe,
            browserProbe: textBrowserProbe,
            textRegion,
          },
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayDrawImage":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay drawImage cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayDrawImage());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && probe?.image?.rawTexture === true
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayVideoBuffer":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay video buffer cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayVideoBuffer());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const videoPixels = {
          center: sampleVirtualCanvasPixel(400, 300),
          outside: sampleVirtualCanvasPixel(250, 200),
        };
        const screenshot = {
          ...snapshotCanvas(),
          videoPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const stage0 = probe?.draw?.renderState?.textureStages?.[0];
        const stage1 = probe?.draw?.renderState?.textureStages?.[1];
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && probe?.source === "ww3d_display_video_buffer_probe"
          && probe?.display?.path === "W3DDisplay::drawVideoBuffer"
          && probe?.results?.drawVideoBufferCalled === true
          && probe?.videoBuffer?.type === 2
          && probe?.videoBuffer?.format === D3DFMT_X8R8G8B8
          && probe?.videoBuffer?.textureId !== 0
          && probe?.videoBuffer?.visibleWidth === 128
          && probe?.videoBuffer?.visibleHeight === 128
          && probe?.videoBuffer?.textureWidth === 128
          && probe?.videoBuffer?.textureHeight === 128
          && probe?.videoBuffer?.pitch === 512
          && probe?.videoBuffer?.uploadChecksum !== 0
          && probe?.draw?.primitiveType === D3DPT_TRIANGLELIST
          && probe?.draw?.vertexCount === 4
          && probe?.draw?.primitiveCount === 2
          && probe?.draw?.vertexStride === 44
          && probe?.draw?.vertexBufferId !== 0
          && probe?.draw?.indexBufferId !== 0
          && (probe?.draw?.transformMask & 7) === 7
          && probe?.draw?.renderState?.alphaBlendEnable === 1
          && probe?.draw?.renderState?.srcBlend === D3DBLEND_SRCALPHA
          && probe?.draw?.renderState?.destBlend === D3DBLEND_INVSRCALPHA
          && stage0?.colorOp === D3DTOP_MODULATE
          && stage0?.colorArg1 === D3DTA_TEXTURE
          && stage0?.colorArg2 === D3DTA_DIFFUSE
          && stage1?.colorOp === D3DTOP_DISABLE
          && probe?.calls?.drawIndexed >= 1
          && probe?.calls?.browserTextureCreate >= 1
          && probe?.calls?.browserTextureUpdate >= 2
          && probe?.calls?.browserTextureBind >= 1
          && probe?.calls?.browserTextureRelease >= 1
          && probe?.calls?.browserBufferCreate >= 2
          && probe?.calls?.browserBufferUpdate >= 2
          && probe?.calls?.setTexture >= 1
          && probe?.calls?.setTransform >= 3
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.texture0?.id === probe?.videoBuffer?.textureId
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.storage === "rgba8"
          && browserProbe?.texture0?.format === D3DFMT_X8R8G8B8
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.texture0?.combiner?.colorOp === D3DTOP_MODULATE
          && browserProbe?.texture0?.combiner?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.texture0?.combiner?.colorArg2 === D3DTA_DIFFUSE
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(videoPixels.center)
          && pixelLooksRed(screenshot.centerPixel)
          && pixelLooksBlack(videoPixels.outside)
          && textureDelta.creates >= 1
          && textureDelta.updates >= 2
          && textureDelta.binds >= 1
          && textureDelta.releases >= 1;
        return {
          ok,
          command,
          probe,
          browserProbe,
          videoPixels,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayDrawImageAdditive":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; additive WW3DDisplay drawImage cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayDrawImageAdditive());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const additivePixels = {
          center: sampleVirtualCanvasPixel(400, 300),
          outside: sampleVirtualCanvasPixel(250, 200),
        };
        const screenshot = {
          ...snapshotCanvas(),
          additivePixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && probe?.source === "ww3d_display_drawimage_additive_probe"
          && probe?.display?.path === "W3DDisplay::drawImage"
          && probe?.display?.mode === "DRAW_IMAGE_ADDITIVE"
          && probe?.draw?.renderState?.srcBlend === D3DBLEND_ONE
          && probe?.draw?.renderState?.destBlend === D3DBLEND_ONE
          && browserProbe?.renderState?.srcBlend === D3DBLEND_ONE
          && browserProbe?.renderState?.destBlend === D3DBLEND_ONE
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && probe?.image?.rawTexture === true
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(additivePixels.center)
          && pixelLooksBlack(additivePixels.outside);
        return {
          ok,
          command,
          probe,
          browserProbe,
          additivePixels,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayDrawImageSolid":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; solid WW3DDisplay drawImage cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 128, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayDrawImageSolid());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const solidPixels = {
          center: sampleVirtualCanvasPixel(400, 300),
          outside: sampleVirtualCanvasPixel(250, 200),
        };
        const screenshot = {
          ...snapshotCanvas(),
          solidPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && probe?.source === "ww3d_display_drawimage_solid_probe"
          && probe?.display?.path === "W3DDisplay::drawImage"
          && probe?.display?.mode === "DRAW_IMAGE_SOLID"
          && probe?.draw?.renderState?.alphaBlendEnable === 0
          && probe?.draw?.renderState?.srcBlend === D3DBLEND_ONE
          && probe?.draw?.renderState?.destBlend === D3DBLEND_ZERO
          && browserProbe?.renderState?.alphaBlendEnable === 0
          && browserProbe?.renderState?.srcBlend === D3DBLEND_ONE
          && browserProbe?.renderState?.destBlend === D3DBLEND_ZERO
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && probe?.image?.rawTexture === true
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(solidPixels.center)
          && pixelLooksBlueClear(solidPixels.outside);
        return {
          ok,
          command,
          probe,
          browserProbe,
          solidPixels,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayDrawImageGrayscale":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; grayscale WW3DDisplay drawImage cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayDrawImageGrayscale());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const grayscalePixels = {
          center: sampleVirtualCanvasPixel(400, 300),
          outside: sampleVirtualCanvasPixel(250, 200),
        };
        const screenshot = {
          ...snapshotCanvas(),
          grayscalePixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const expectedCenter = [117, 117, 117, 255];
        const grayscaleFactor = 0x80a5ca8e;
        const grayscaleAlphaFactor = D3DTA_TFACTOR | D3DTA_ALPHAREPLICATE;
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && probe?.source === "ww3d_display_drawimage_grayscale_probe"
          && probe?.display?.path === "W3DDisplay::drawImage"
          && probe?.display?.mode === "DRAW_IMAGE_GRAYSCALE"
          && probe?.draw?.renderState?.alphaBlendEnable === 0
          && probe?.draw?.renderState?.srcBlend === D3DBLEND_ONE
          && probe?.draw?.renderState?.destBlend === D3DBLEND_ZERO
          && probe?.draw?.renderState?.textureFactor === grayscaleFactor
          && probe?.draw?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MULTIPLYADD
          && probe?.draw?.renderState?.textureStages?.[0]?.colorArg0 === grayscaleAlphaFactor
          && probe?.draw?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && probe?.draw?.renderState?.textureStages?.[0]?.colorArg2 === grayscaleAlphaFactor
          && probe?.draw?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DOTPRODUCT3
          && probe?.draw?.renderState?.textureStages?.[1]?.colorArg1 === D3DTA_CURRENT
          && probe?.draw?.renderState?.textureStages?.[1]?.colorArg2 === D3DTA_TFACTOR
          && browserProbe?.renderState?.alphaBlendEnable === 0
          && browserProbe?.renderState?.srcBlend === D3DBLEND_ONE
          && browserProbe?.renderState?.destBlend === D3DBLEND_ZERO
          && browserProbe?.renderState?.textureFactor === grayscaleFactor
          && browserProbe?.textureFactor === grayscaleFactor
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && browserProbe?.texture0?.combiner?.colorOp === D3DTOP_MULTIPLYADD
          && browserProbe?.texture0?.combiner?.colorArg0 === grayscaleAlphaFactor
          && browserProbe?.texture0?.combiner?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.texture0?.combiner?.colorArg2 === grayscaleAlphaFactor
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.stage1Combiner?.colorOp === D3DTOP_DOTPRODUCT3
          && browserProbe?.stage1Combiner?.colorArg1 === D3DTA_CURRENT
          && browserProbe?.stage1Combiner?.colorArg2 === D3DTA_TFACTOR
          && browserProbe?.stage1Combiner?.supported === true
          && probe?.image?.rawTexture === true
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 2)
          && pixelsApproximatelyEqual(grayscalePixels.center, expectedCenter, 2)
          && pixelLooksBlack(grayscalePixels.outside);
        return {
          ok,
          command,
          probe,
          browserProbe,
          grayscalePixels,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayDrawImageFile":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; filename-backed WW3DDisplay drawImage cannot render" };
        }
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime-display-drawimage-file/TexturesZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayDrawImageFile(textureArchivePath));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && probe?.source === "ww3d_display_drawimage_file_probe"
          && probe?.image?.rawTexture === false
          && probe?.image?.filename === "cine_moon.tga"
          && probe?.results?.texturePreloaded === true
          && probe?.results?.textureDDSLoaded === true
          && probe?.results?.textureResolved === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && pixelHasColor(browserProbe.centerPixel, 8)
          && pixelHasColor(screenshot.centerPixel, 8)
          && !pixelLooksRed(browserProbe.centerPixel)
          && !pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayMappedImage":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; mapped-image WW3DDisplay drawImage cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "/assets/runtime-mapped-image/INIZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime-mapped-image/EnglishZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayMappedImage(
          iniArchivePath,
          textureArchivePath,
        ));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && probe?.source === "ww3d_display_mapped_image_probe"
          && probe?.image?.name === "WatermarkChina"
          && probe?.image?.filename === "SCShellUserInterface512_001.tga"
          && probe?.image?.rawTexture === false
          && probe?.image?.status === 1
          && probe?.image?.rotated === true
          && probe?.image?.textureWidth === 512
          && probe?.image?.textureHeight === 512
          && probe?.image?.width === 160
          && probe?.image?.height === 96
          && probe?.results?.mappedCollectionLoaded === true
          && probe?.results?.mappedImages === 1186
          && probe?.results?.texturePreloaded === true
          && probe?.results?.textureLoaded === true
          && probe?.results?.textureResolved === true
          && probe?.results?.textureHasD3DSurface === true
          && String(probe?.texture?.name ?? "").toLowerCase() ===
            String(probe?.image?.filename ?? "").toLowerCase()
          && probe?.texture?.archiveEntry === "Data\\English\\Art\\Textures\\SCShellUserInterface512_001.tga"
          && probe?.texture?.width === 512
          && probe?.texture?.height === 512
          && probe?.texture?.levels > 0
          && probe?.texture?.uploadedLevels === probe?.texture?.levels
          && probe?.runtimeAssets?.installed === true
          && probe?.runtimeAssets?.archiveLoaded === true
          && probe?.runtimeAssets?.w3dFileSystemInstalled === true
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.primitiveType === 4
          && browserProbe?.texture0?.id === probe?.texture?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.texture0?.combiner?.colorOp === D3DTOP_MODULATE
          && browserProbe?.texture0?.sampler?.supported === true
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MODULATE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg2 === D3DTA_DIFFUSE
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DISABLE
          && pixelHasColor(browserProbe.centerPixel, 8)
          && pixelHasColor(screenshot.centerPixel, 8)
          && textureDelta.creates >= 1
          && textureDelta.updates >= probe?.texture?.levels
          && textureDelta.binds >= 1;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayMappedImageClip":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; clipped mapped-image WW3DDisplay drawImage cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "/assets/runtime-mapped-image-clip/INIZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime-mapped-image-clip/EnglishZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayMappedImageClip(
          iniArchivePath,
          textureArchivePath,
        ));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const clipPixels = {
          center: sampleVirtualCanvasPixel(400, 300),
          outsideLeft: sampleVirtualCanvasPixel(340, 300),
          outsideTop: sampleVirtualCanvasPixel(400, 264),
        };
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const expectedUv = probe?.draw?.clip?.expectedRotatedUV ?? {};
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && probe?.source === "ww3d_display_mapped_image_clip_probe"
          && probe?.image?.name === "WatermarkChina"
          && probe?.image?.filename === "SCShellUserInterface512_001.tga"
          && probe?.image?.rawTexture === false
          && probe?.image?.status === 1
          && probe?.image?.rotated === true
          && probe?.image?.textureWidth === 512
          && probe?.image?.textureHeight === 512
          && probe?.image?.width === 160
          && probe?.image?.height === 96
          && probe?.results?.mappedCollectionLoaded === true
          && probe?.results?.mappedImages === 1186
          && probe?.results?.texturePreloaded === true
          && probe?.results?.textureLoaded === true
          && probe?.results?.textureResolved === true
          && probe?.results?.textureHasD3DSurface === true
          && probe?.results?.clipRegionSet === true
          && probe?.results?.clipEnabledBeforeDraw === true
          && probe?.results?.clipDisabledAfterDraw === true
          && String(probe?.texture?.name ?? "").toLowerCase() ===
            String(probe?.image?.filename ?? "").toLowerCase()
          && probe?.texture?.archiveEntry === "Data\\English\\Art\\Textures\\SCShellUserInterface512_001.tga"
          && probe?.texture?.width === 512
          && probe?.texture?.height === 512
          && probe?.texture?.levels > 0
          && probe?.texture?.uploadedLevels === probe?.texture?.levels
          && probe?.runtimeAssets?.installed === true
          && probe?.runtimeAssets?.archiveLoaded === true
          && probe?.runtimeAssets?.w3dFileSystemInstalled === true
          && probe?.draw?.primitiveType === 4
          && probe?.draw?.vertexCount === 6
          && probe?.draw?.primitiveCount === 2
          && probe?.draw?.screenRect?.left === 320
          && probe?.draw?.screenRect?.top === 252
          && probe?.draw?.screenRect?.right === 480
          && probe?.draw?.screenRect?.bottom === 348
          && probe?.draw?.clip?.enabled === true
          && probe?.draw?.clip?.set === true
          && probe?.draw?.clip?.enabledBeforeDraw === true
          && probe?.draw?.clip?.disabledAfterDraw === true
          && probe?.draw?.clip?.rect?.left === 360
          && probe?.draw?.clip?.rect?.top === 276
          && probe?.draw?.clip?.rect?.right === 440
          && probe?.draw?.clip?.rect?.bottom === 324
          && probe?.draw?.clip?.width === 80
          && probe?.draw?.clip?.height === 48
          && Math.abs((expectedUv.left ?? 0) - (415 / 512)) < 0.00001
          && Math.abs((expectedUv.top ?? 0) - (41 / 512)) < 0.00001
          && Math.abs((expectedUv.right ?? 0) - (463 / 512)) < 0.00001
          && Math.abs((expectedUv.bottom ?? 0) - (121 / 512)) < 0.00001
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.primitiveType === 4
          && browserProbe?.texture0?.id === probe?.texture?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MODULATE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg2 === D3DTA_DIFFUSE
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DISABLE
          && pixelHasColor(clipPixels.center, 8)
          && !pixelHasColor(clipPixels.outsideLeft, 8)
          && !pixelHasColor(clipPixels.outsideTop, 8)
          && pixelHasColor(screenshot.centerPixel, 8)
          && textureDelta.creates >= 1
          && textureDelta.updates >= probe?.texture?.levels
          && textureDelta.binds >= 1;
        return {
          ok,
          command,
          probe,
          browserProbe,
          clipPixels,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayMappedImageUnrotated":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; non-rotated mapped-image WW3DDisplay drawImage cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "/assets/runtime-mapped-image-unrotated/INIZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime-mapped-image-unrotated/EnglishZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayMappedImageUnrotated(
          iniArchivePath,
          textureArchivePath,
        ));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && probe?.source === "ww3d_display_mapped_image_unrotated_probe"
          && probe?.image?.name === "SAChinook_L"
          && probe?.image?.filename === "SAUserInterface512_001.tga"
          && probe?.image?.rawTexture === false
          && probe?.image?.status === 0
          && probe?.image?.rotated === false
          && probe?.image?.textureWidth === 512
          && probe?.image?.textureHeight === 512
          && probe?.image?.width === 120
          && probe?.image?.height === 96
          && Math.abs((probe?.image?.uvLoX ?? 0) - (367 / 512)) < 0.00001
          && Math.abs((probe?.image?.uvLoY ?? 0) - (393 / 512)) < 0.00001
          && Math.abs((probe?.image?.uvHiX ?? 0) - (487 / 512)) < 0.00001
          && Math.abs((probe?.image?.uvHiY ?? 0) - (489 / 512)) < 0.00001
          && probe?.results?.mappedCollectionLoaded === true
          && probe?.results?.mappedImages === 1186
          && probe?.results?.texturePreloaded === true
          && probe?.results?.textureLoaded === true
          && probe?.results?.textureResolved === true
          && probe?.results?.textureHasD3DSurface === true
          && String(probe?.texture?.name ?? "").toLowerCase() ===
            String(probe?.image?.filename ?? "").toLowerCase()
          && probe?.texture?.archiveEntry === "Data\\English\\Art\\Textures\\SAUserInterface512_001.tga"
          && probe?.texture?.width === 512
          && probe?.texture?.height === 512
          && probe?.texture?.levels > 0
          && probe?.texture?.uploadedLevels === probe?.texture?.levels
          && probe?.runtimeAssets?.installed === true
          && probe?.runtimeAssets?.archiveLoaded === true
          && probe?.runtimeAssets?.w3dFileSystemInstalled === true
          && probe?.draw?.primitiveType === 4
          && probe?.draw?.vertexCount === 4
          && probe?.draw?.primitiveCount === 2
          && probe?.draw?.screenRect?.left === 340
          && probe?.draw?.screenRect?.top === 252
          && probe?.draw?.screenRect?.right === 460
          && probe?.draw?.screenRect?.bottom === 348
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.primitiveType === 4
          && browserProbe?.texture0?.id === probe?.texture?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MODULATE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg2 === D3DTA_DIFFUSE
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DISABLE
          && pixelHasColor(browserProbe.centerPixel, 8)
          && pixelHasColor(screenshot.centerPixel, 8)
          && textureDelta.creates >= 1
          && textureDelta.updates >= probe?.texture?.levels
          && textureDelta.binds >= 1;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayMainMenuRuler":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; MainMenuRuler W3DDisplay drawImage cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "/assets/runtime-main-menu-ruler-mapped-image/INIZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime-main-menu-ruler-mapped-image/TexturesZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DDisplayMainMenuRuler(
          iniArchivePath,
          textureArchivePath,
        ));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const rulerPixels = {
          center: sampleVirtualCanvasPixel(400, 300),
          topLeft: sampleVirtualCanvasPixel(20, 20),
          topMiddle: sampleVirtualCanvasPixel(400, 4),
          topRight: sampleVirtualCanvasPixel(780, 20),
          bottomLeft: sampleVirtualCanvasPixel(20, 580),
          bottomMiddle: sampleVirtualCanvasPixel(400, 596),
          bottomRight: sampleVirtualCanvasPixel(780, 580),
        };
        const coloredRulerPixels = Object.values(rulerPixels)
          .filter((pixel) => pixelHasColor(pixel, 10));
        const screenshot = {
          ...snapshotCanvas(),
          rulerPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_main_menu_ruler_probe"
          && probe?.archives?.ini === iniArchivePath
          && probe?.archives?.texture === textureArchivePath
          && probe?.results?.runtimeAssetSystemInstalled === true
          && probe?.results?.mappedIniExists === true
          && probe?.results?.textureArchiveLoaded === true
          && probe?.results?.textureFileExists === true
          && probe?.results?.textureFileFactoryInstalled === true
          && probe?.results?.mappedCollectionAllocated === true
          && probe?.results?.mappedCollectionLoaded === true
          && probe?.results?.mappedImages === 1186
          && probe?.results?.mappedImageFound === true
          && probe?.results?.mappedImageRotated === false
          && probe?.results?.texturePreloaded === true
          && probe?.results?.textureRegistered === true
          && probe?.results?.textureResolved === true
          && probe?.results?.textureLoaded === true
          && probe?.results?.textureHasD3DSurface === true
          && String(probe?.texture?.name ?? "").toLowerCase() === "mainmenuruleruserinterface.tga"
          && probe?.texture?.archiveEntry === "Art\\Textures\\mainmenuruleruserinterface.tga"
          && probe?.texture?.width === 1024
          && probe?.texture?.height === 1024
          && probe?.texture?.levels > 0
          && probe?.texture?.uploadedLevels === probe?.texture?.levels
          && probe?.runtimeAssets?.installed === true
          && probe?.runtimeAssets?.archiveLoaded === true
          && probe?.runtimeAssets?.w3dFileSystemInstalled === true
          && probe?.image?.name === "MainMenuRuler"
          && probe?.image?.filename === "MainMenuRuleruserinterface.tga"
          && probe?.image?.rawTexture === false
          && probe?.image?.status === 0
          && probe?.image?.rotated === false
          && probe?.image?.textureWidth === 1024
          && probe?.image?.textureHeight === 1024
          && probe?.image?.width === 800
          && probe?.image?.height === 600
          && probe?.draw?.primitiveType === 4
          && probe?.draw?.vertexCount === 4
          && probe?.draw?.primitiveCount === 2
          && probe?.draw?.screenRect?.left === 0
          && probe?.draw?.screenRect?.top === 0
          && probe?.draw?.screenRect?.right === 800
          && probe?.draw?.screenRect?.bottom === 600
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.fillMode?.supported === true
          && browserProbe?.shadeMode?.supported === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.primitiveType === 4
          && browserProbe?.texture0?.id === probe?.texture?.id
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.renderState?.textureStages?.[0]?.colorOp === D3DTOP_MODULATE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg1 === D3DTA_TEXTURE
          && browserProbe?.renderState?.textureStages?.[0]?.colorArg2 === D3DTA_DIFFUSE
          && browserProbe?.renderState?.textureStages?.[1]?.colorOp === D3DTOP_DISABLE
          && coloredRulerPixels.length >= 4
          && pixelLooksBlack(rulerPixels.center)
          && textureDelta.creates >= 1
          && textureDelta.updates >= probe?.texture?.levels
          && textureDelta.binds >= 1;
        return {
          ok,
          command,
          probe,
          browserProbe,
          rulerPixels,
          coloredRulerPixelCount: coloredRulerPixels.length,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayFillRect":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay fill rect cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DDisplayFillRect());
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_fillrect_probe"
          && probe?.display?.path === "W3DDisplay::drawFillRect"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 6
          && browserProbe?.texture0?.sampled === false
          && pixelLooksGreen(browserProbe.centerPixel)
          && pixelLooksGreen(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dWindowRepaint":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D window repaint cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DWindowRepaint());
        const button = probe?.window?.button ?? {};
        const left = button.x ?? 300;
        const top = button.y ?? 220;
        const right = left + (button.width ?? 200);
        const bottom = top + (button.height ?? 160);
        const repaintPixels = {
          center: sampleVirtualCanvasPixel(Math.floor((left + right) / 2), Math.floor((top + bottom) / 2)),
          interior: sampleVirtualCanvasPixel(left + 12, top + 12),
          borderTop: sampleVirtualCanvasPixel(Math.floor((left + right) / 2), top),
          borderLeft: sampleVirtualCanvasPixel(left, Math.floor((top + bottom) / 2)),
          outside: sampleVirtualCanvasPixel(left - 16, top - 16),
        };
        const screenshot = {
          ...snapshotCanvas(),
          repaintPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_window_repaint_probe"
          && probe?.display?.path === "GameWindowManager::winRepaint -> Display adapter -> W3DDisplay"
          && probe?.window?.manager === "W3DGameWindowManager"
          && probe?.window?.button?.drawFunc === "W3DGadgetPushButtonDraw"
          && probe?.window?.button?.inputFunc === "GadgetPushButtonInput"
          && probe?.calls?.drawIndexed >= 2
          && probe?.calls?.displayOpenRect >= 1
          && probe?.calls?.displayFillRect >= 1
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 4
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 6
          && browserProbe?.texture0?.sampled !== true
          && pixelLooksGreen(browserProbe.centerPixel)
          && pixelLooksGreen(repaintPixels.center)
          && pixelLooksGreen(repaintPixels.interior)
          && pixelLooksBlack(repaintPixels.outside);
        return {
          ok,
          command,
          probe,
          browserProbe,
          repaintPixels,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dWindowLayoutRepaint":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D window layout repaint cannot render" };
        }
        const archivePath = String(payload.windowArchivePath ?? payload.archivePath ?? "");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DWindowLayoutRepaint(archivePath));
        const parent = probe?.layout?.parent ?? {};
        const left = parent.x ?? 252;
        const top = parent.y ?? 100;
        const width = parent.width ?? 300;
        const height = parent.height ?? 328;
        const right = left + width;
        const bottom = top + height;
        const layoutPixels = {
          parentBorderTop: sampleVirtualCanvasPixel(Math.floor((left + right) / 2), top),
          parentBorderLeft: sampleVirtualCanvasPixel(left, Math.floor((top + bottom) / 2)),
          parentInterior: sampleVirtualCanvasPixel(left + 24, top + 24),
          outside: sampleVirtualCanvasPixel(left - 24, top - 24),
        };
        const screenshot = {
          ...snapshotCanvas(),
          layoutPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_window_layout_repaint_probe"
          && probe?.display?.path === "WindowLayout::load -> GameWindowManager::winRepaint -> Display adapter -> W3DDisplay"
          && probe?.archive?.exists === true
          && probe?.layout?.path === "Menus/Defeat.wnd"
          && probe?.layout?.root?.systemFunc === "GameWinDefaultSystem"
          && probe?.layout?.root?.drawFunc === "W3DGameWinDefaultDraw"
          && probe?.layout?.parent?.systemFunc === "GameWinDefaultSystem"
          && probe?.layout?.parent?.drawFunc === "W3DGameWinDefaultDraw"
          && probe?.layout?.parent?.borderColor?.[2] === 168
          && probe?.calls?.drawIndexed >= 2
          && probe?.calls?.displayOpenRect >= 1
          && probe?.calls?.displayFillRect >= 1
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 4
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 6
          && browserProbe?.texture0?.sampled !== true
          && pixelLooksMessageBoxBlue(layoutPixels.parentInterior)
          && pixelLooksBlack(layoutPixels.outside, 8);
        return {
          ok,
          command,
          probe,
          browserProbe,
          layoutPixels,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dMainMenuLayoutRepaint":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D MainMenu layout repaint cannot render" };
        }
        const archivePath = String(payload.windowArchivePath ?? payload.archivePath ?? "");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DMainMenuLayoutRepaint(archivePath));
        const parent = probe?.layout?.parent ?? {};
        const left = parent.x ?? 532;
        const top = parent.y ?? 108;
        const width = parent.width ?? 224;
        const height = parent.height ?? 212;
        const right = left + width;
        const bottom = top + height;
        const layoutPixels = {
          parentBorderCorner: sampleVirtualCanvasPixel(left + 1, top + 1),
          parentBorderTop: sampleVirtualCanvasPixel(Math.floor((left + right) / 2), top + 1),
          parentBorderLeft: sampleVirtualCanvasPixel(left + 1, Math.floor((top + bottom) / 2)),
          parentInterior: sampleVirtualCanvasPixel(left + 24, top + 24),
          outside: sampleVirtualCanvasPixel(left - 24, top - 24),
        };
        const screenshot = {
          ...snapshotCanvas(),
          layoutPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_main_menu_layout_repaint_probe"
          && probe?.display?.path === "WindowLayout::load -> GameWindowManager::winRepaint -> Display adapter -> W3DDisplay"
          && probe?.archive?.exists === true
          && probe?.layout?.path === "Menus/MainMenu.wnd"
          && probe?.layout?.root?.name === "MainMenu.wnd:MainMenuParent"
          && probe?.layout?.root?.systemFunc === "MainMenuSystem"
          && probe?.layout?.root?.drawFunc === "W3DNoDraw"
          && probe?.layout?.parent?.name === "MainMenu.wnd:MapBorder4"
          && probe?.layout?.parent?.systemFunc === "PassSelectedButtonsToParentSystem"
          && probe?.layout?.parent?.drawFunc === "W3DGameWinDefaultDraw"
          && probe?.layout?.parent?.x === 532
          && probe?.layout?.parent?.y === 108
          && probe?.layout?.parent?.width === 224
          && probe?.layout?.parent?.height === 212
          && probe?.layout?.parent?.fillColor?.[3] === 126
          && probe?.layout?.parent?.borderColor?.[2] === 168
          && probe?.layout?.prunedChildren >= 1
          && probe?.calls?.drawIndexed >= 2
          && probe?.calls?.displayOpenRect >= 1
          && probe?.calls?.displayFillRect >= 1
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 4
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 6
          && browserProbe?.texture0?.sampled !== true
          && pixelLooksMessageBoxBlue(layoutPixels.parentBorderCorner)
          && pixelLooksMessageBoxBlueTint(layoutPixels.parentBorderTop)
          && pixelLooksMessageBoxBlueTint(layoutPixels.parentBorderLeft)
          && pixelLooksBlack(layoutPixels.parentInterior, 8)
          && pixelLooksBlack(layoutPixels.outside, 8);
        return {
          ok,
          command,
          probe,
          browserProbe,
          layoutPixels,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dMainMenuLayoutImageRepaint":
    case "ww3dMainMenuLayoutDisabledButtonRepaint":
    case "ww3dMainMenuLayoutHiliteButtonRepaint":
    case "ww3dMainMenuLayoutPushedButtonRepaint":
    case "ww3dMainMenuLayoutSinglePlayerRepaint":
    case "ww3dMainMenuLayoutLoadReplayRepaint":
    case "ww3dMainMenuLayoutDifficultyRepaint":
    case "ww3dMainMenuLayoutStaticTextRepaint":
    case "ww3dMainMenuLayoutFactionLogoRepaint":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D MainMenu layout image repaint cannot render" };
        }
        const staticTextMode = command === "ww3dMainMenuLayoutStaticTextRepaint";
        const disabledButtonMode = command === "ww3dMainMenuLayoutDisabledButtonRepaint";
        const hiliteButtonMode = command === "ww3dMainMenuLayoutHiliteButtonRepaint";
        const pushedButtonMode = command === "ww3dMainMenuLayoutPushedButtonRepaint";
        const singlePlayerMode = command === "ww3dMainMenuLayoutSinglePlayerRepaint";
        const loadReplayMode = command === "ww3dMainMenuLayoutLoadReplayRepaint";
        const difficultyMode = command === "ww3dMainMenuLayoutDifficultyRepaint";
        const factionLogoMode = command === "ww3dMainMenuLayoutFactionLogoRepaint";
        const probeMode = staticTextMode
          ? "staticTextSelectDifficulty"
          : (disabledButtonMode
              ? "disabledButtonSinglePlayer"
              : (hiliteButtonMode
                  ? "hiliteButtonSinglePlayer"
                  : (pushedButtonMode
                      ? "pushedButtonSinglePlayer"
                      : (singlePlayerMode
                          ? "singlePlayerDropdown"
                          : (difficultyMode
                              ? "difficultyDropdown"
                              : (factionLogoMode
                                  ? "factionLogoStrip"
                                  : (loadReplayMode ? "loadReplayDropdown" : "buttonSinglePlayer")))))));
        const archiveDirectoryPath = String(payload.archiveDirectoryPath ?? payload.runtimeArchivePath ?? "");
        const directoryPrefix = archiveDirectoryPath.endsWith("/") ? archiveDirectoryPath : `${archiveDirectoryPath}/`;
        const windowArchivePath = String(payload.windowArchivePath ?? `${directoryPrefix}WindowZH.big`);
        const iniArchivePath = String(payload.iniArchivePath ?? `${directoryPrefix}INIZH.big`);
        const textureArchivePath = String(payload.textureArchivePath ?? `${directoryPrefix}EnglishZH.big`);
        const rulerTextureArchivePath = String(payload.rulerTextureArchivePath ?? `${directoryPrefix}TexturesZH.big`);
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = snapshotState().graphics?.textures ?? {};
        const probe = parseModuleState(staticTextMode
          ? wasmModule.probeWW3DMainMenuLayoutStaticTextRepaint()
          : (disabledButtonMode
              ? wasmModule.probeWW3DMainMenuLayoutDisabledButtonRepaint()
              : (hiliteButtonMode
                  ? wasmModule.probeWW3DMainMenuLayoutHiliteButtonRepaint()
                  : (pushedButtonMode
                      ? wasmModule.probeWW3DMainMenuLayoutPushedButtonRepaint()
                      : (singlePlayerMode
                          ? wasmModule.probeWW3DMainMenuLayoutSinglePlayerRepaint()
                          : (loadReplayMode
                              ? wasmModule.probeWW3DMainMenuLayoutLoadReplayRepaint()
                              : (difficultyMode
                                  ? wasmModule.probeWW3DMainMenuLayoutDifficultyRepaint()
                                  : (factionLogoMode
                                      ? wasmModule.probeWW3DMainMenuLayoutFactionLogoRepaint()
                                      : wasmModule.probeWW3DMainMenuLayoutImageRepaint()))))))));
        const target = probe?.layout?.target ?? {};
        const left = target.x ?? 504;
        const top = target.y ?? 16;
        const width = target.width ?? 287;
        const height = target.height ?? 94;
        const right = left + width;
        const bottom = top + height;
        const logoPixels = {
          center: sampleVirtualCanvasPixel(Math.floor((left + right) / 2), Math.floor((top + bottom) / 2)),
          upperLeft: sampleVirtualCanvasPixel(left + 24, top + 20),
          upperMiddle: sampleVirtualCanvasPixel(Math.floor((left + right) / 2), top + 20),
          lowerMiddle: sampleVirtualCanvasPixel(Math.floor((left + right) / 2), bottom - 20),
          rightMiddle: sampleVirtualCanvasPixel(right - 24, Math.floor((top + bottom) / 2)),
          outside: sampleVirtualCanvasPixel(left - 24, top + 24),
        };
        const rulerPixels = {
          center: sampleVirtualCanvasPixel(400, 300),
          topLeft: sampleVirtualCanvasPixel(20, 20),
          topMiddle: sampleVirtualCanvasPixel(400, 4),
          topRight: sampleVirtualCanvasPixel(780, 20),
          bottomLeft: sampleVirtualCanvasPixel(20, 580),
          bottomMiddle: sampleVirtualCanvasPixel(400, 596),
          bottomRight: sampleVirtualCanvasPixel(780, 580),
          behindLogoOutside: logoPixels.outside,
        };
        const button = probe?.layout?.button ?? {};
        const buttonLeft = button.x ?? 540;
        const buttonTop = button.y ?? 116;
        const buttonWidth = button.width ?? 208;
        const buttonHeight = button.height ?? 36;
        const buttonRight = buttonLeft + buttonWidth;
        const buttonBottom = buttonTop + buttonHeight;
        const buttonPixels = {
          left: sampleVirtualCanvasPixel(buttonLeft + 6, Math.floor((buttonTop + buttonBottom) / 2)),
          middle: sampleVirtualCanvasPixel(Math.floor((buttonLeft + buttonRight) / 2), Math.floor((buttonTop + buttonBottom) / 2)),
          right: sampleVirtualCanvasPixel(buttonRight - 6, Math.floor((buttonTop + buttonBottom) / 2)),
          topMiddle: sampleVirtualCanvasPixel(Math.floor((buttonLeft + buttonRight) / 2), buttonTop + 4),
          outsideLeft: sampleVirtualCanvasPixel(buttonLeft - 6, Math.floor((buttonTop + buttonBottom) / 2)),
        };
        const coloredLogoPixels = [
          logoPixels.center,
          logoPixels.upperLeft,
          logoPixels.upperMiddle,
          logoPixels.lowerMiddle,
          logoPixels.rightMiddle,
        ].filter((pixel) => pixelHasColor(pixel, 10));
        const coloredRulerPixels = Object.values(rulerPixels)
          .filter((pixel) => pixelHasColor(pixel, 10));
        const coloredButtonPixels = [
          buttonPixels.left,
          buttonPixels.middle,
          buttonPixels.right,
          buttonPixels.topMiddle,
        ].filter((pixel) => pixelHasColor(pixel, 10));
        const textureAfter = snapshotState().graphics?.textures ?? {};
        const canvasSnapshot = snapshotCanvas();
        const virtualScaleX = canvasSnapshot.width / 800;
        const virtualScaleY = canvasSnapshot.height / 600;
        const buttonRegion = sampleCanvasRegion({
          left: Math.floor(buttonLeft * virtualScaleX),
          top: Math.floor(buttonTop * virtualScaleY),
          right: Math.ceil(buttonRight * virtualScaleX),
          bottom: Math.ceil(buttonBottom * virtualScaleY),
        }, 10);
        const buttonText = button.text ?? {};
        const buttonTextWidth = Number(buttonText.width ?? 96);
        const buttonTextHeight = Number(buttonText.height ?? 18);
        const buttonTextLeft = buttonLeft + Math.floor((buttonWidth - buttonTextWidth) / 2);
        const buttonTextTop = buttonTop + Math.floor((buttonHeight - buttonTextHeight) / 2);
        const buttonTextRegion = sampleCanvasRegion({
          left: Math.floor(buttonTextLeft * virtualScaleX),
          top: Math.floor(buttonTextTop * virtualScaleY),
          right: Math.ceil((buttonTextLeft + buttonTextWidth) * virtualScaleX),
          bottom: Math.ceil((buttonTextTop + buttonTextHeight) * virtualScaleY),
        }, 10);
        const extraButtons = Array.isArray(probe?.layout?.extraButtons)
          ? probe.layout.extraButtons
          : [];
        const sampleButtonRegions = (buttonInfo) => {
          const x = Number(buttonInfo?.x ?? 0);
          const y = Number(buttonInfo?.y ?? 0);
          const w = Number(buttonInfo?.width ?? 0);
          const h = Number(buttonInfo?.height ?? 0);
          const text = buttonInfo?.text ?? {};
          const textWidth = Number(text.width ?? 0);
          const textHeight = Number(text.height ?? 0);
          const textLeft = x + Math.floor((w - textWidth) / 2);
          const textTop = y + Math.floor((h - textHeight) / 2);
          return {
            name: buttonInfo?.name ?? null,
            label: text.label ?? null,
            region: sampleCanvasRegion({
              left: Math.floor(x * virtualScaleX),
              top: Math.floor(y * virtualScaleY),
              right: Math.ceil((x + w) * virtualScaleX),
              bottom: Math.ceil((y + h) * virtualScaleY),
            }, 10),
            textRegion: sampleCanvasRegion({
              left: Math.floor(textLeft * virtualScaleX),
              top: Math.floor(textTop * virtualScaleY),
              right: Math.ceil((textLeft + textWidth) * virtualScaleX),
              bottom: Math.ceil((textTop + textHeight) * virtualScaleY),
            }, 10),
          };
        };
        const extraButtonRegions = extraButtons.map(sampleButtonRegions);
        const singlePlayerButtons = Array.isArray(probe?.layout?.singlePlayerButtons)
          ? probe.layout.singlePlayerButtons
          : [];
        const singlePlayerButtonRegions = singlePlayerButtons.map(sampleButtonRegions);
        const loadReplayButtons = Array.isArray(probe?.layout?.loadReplayButtons)
          ? probe.layout.loadReplayButtons
          : [];
        const loadReplayButtonRegions = loadReplayButtons.map(sampleButtonRegions);
        const difficultyButtons = Array.isArray(probe?.layout?.difficultyButtons)
          ? probe.layout.difficultyButtons
          : [];
        const difficultyButtonRegions = difficultyButtons.map(sampleButtonRegions);
        const factionLogos = Array.isArray(probe?.layout?.factionLogos)
          ? probe.layout.factionLogos
          : [];
        const factionLogoRegions = factionLogos.map((logo) => {
          const x = Number(logo?.x ?? 0);
          const y = Number(logo?.y ?? 0);
          const w = Number(logo?.width ?? 0);
          const h = Number(logo?.height ?? 0);
          return {
            name: logo?.name ?? null,
            image: logo?.image ?? null,
            region: sampleCanvasRegion({
              left: Math.floor(x * virtualScaleX),
              top: Math.floor(y * virtualScaleY),
              right: Math.ceil((x + w) * virtualScaleX),
              bottom: Math.ceil((y + h) * virtualScaleY),
            }, 10),
          };
        });
        const staticText = probe?.layout?.staticText ?? {};
        const staticTextLeft = staticText.x ?? 540;
        const staticTextTop = staticText.y ?? 116;
        const staticTextWidth = staticText.width ?? 216;
        const staticTextHeight = staticText.height ?? 36;
        const staticTextMetrics = staticText.text ?? {};
        const staticTextTextWidth = Number(staticTextMetrics.width ?? 150);
        const staticTextTextHeight = Number(staticTextMetrics.height ?? 18);
        const staticTextMarginLeft = Number(staticText.leftMargin ?? 7);
        const staticTextTextLeft = staticText.centered
          ? staticTextLeft + Math.floor((staticTextWidth - staticTextTextWidth) / 2)
          : staticTextLeft + staticTextMarginLeft;
        const staticTextTextTop = staticText.centeredVertically
          ? staticTextTop + Math.floor((staticTextHeight - staticTextTextHeight) / 2)
          : staticTextTop + Number(staticText.topMargin ?? 7);
        const staticTextRegion = sampleCanvasRegion({
          left: Math.floor(staticTextTextLeft * virtualScaleX),
          top: Math.floor(staticTextTextTop * virtualScaleY),
          right: Math.ceil((staticTextTextLeft + staticTextTextWidth) * virtualScaleX),
          bottom: Math.ceil((staticTextTextTop + staticTextTextHeight) * virtualScaleY),
        }, 10);
        const screenshot = {
          ...canvasSnapshot,
          logoPixels,
          rulerPixels,
          buttonPixels,
          buttonRegion,
          buttonTextRegion,
          extraButtonRegions,
          singlePlayerButtonRegions,
          loadReplayButtonRegions,
          difficultyButtonRegions,
          factionLogoRegions,
          staticTextRegion,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const expectedDisplayImageDraws = staticTextMode
          ? 2
          : (singlePlayerMode ? 8 : (difficultyMode ? 6 : (factionLogoMode ? 7 : (loadReplayMode ? 5 : 6))));
        const expectedDrawIndexed = staticTextMode
          ? 3
          : (singlePlayerMode ? 8 : (difficultyMode ? 7 : (factionLogoMode ? 7 : (loadReplayMode ? 5 : 6))));
        const staticTextProbeOk = !(staticTextMode || difficultyMode)
          || (probe?.results?.staticTextLabelExists === true
            && probe?.results?.staticTextNonEmpty === true
            && probe?.results?.staticTextFound === true
            && probe?.results?.staticTextCallbackBound === true
            && probe?.results?.staticTextUserDataBound === true
            && probe?.results?.staticTextDisplayStringBound === true
            && probe?.results?.staticTextSizeComputed === true
            && probe?.layout?.staticText?.name === "MainMenu.wnd:StaticTextSelectDifficulty"
            && probe?.layout?.staticText?.drawFunc === "W3DGadgetStaticTextDraw"
            && probe?.layout?.staticText?.systemFunc === "GadgetStaticTextSystem"
            && probe?.layout?.staticText?.inputFunc === "GadgetStaticTextInput"
            && probe?.layout?.staticText?.x === 540
            && probe?.layout?.staticText?.y === 116
            && probe?.layout?.staticText?.width === 216
            && probe?.layout?.staticText?.height === 36
            && probe?.layout?.staticText?.initialHidden === true
            && probe?.layout?.staticText?.hidden === false
            && probe?.layout?.staticText?.visibilityFocused === true
            && probe?.layout?.staticText?.centered === false
            && probe?.layout?.staticText?.centeredVertically === true
            && probe?.layout?.staticText?.leftMargin === 7
            && probe?.layout?.staticText?.topMargin === 7
            && probe?.layout?.staticText?.text?.label === "GUI:SelectDifficulty"
            && typeof probe?.layout?.staticText?.text?.ascii === "string"
            && probe.layout.staticText.text.ascii.length > 0
            && probe?.layout?.staticText?.text?.length > 0
            && probe?.layout?.staticText?.text?.width > 0
            && probe?.layout?.staticText?.text?.height > 0
            && probe?.gameText?.staticTextLabelExists === true
            && probe?.gameText?.staticTextNonEmpty === true);
        const buttonTextProbeOk = staticTextMode || singlePlayerMode || loadReplayMode || difficultyMode || factionLogoMode
          || (probe?.layout?.button?.text?.width > 0
            && probe?.layout?.button?.text?.height > 0
            && probe?.results?.buttonTextDisplayStringBound === true
            && probe?.results?.buttonTextSizeComputed === true);
        const expectedButtonImages = disabledButtonMode
          ? ["Buttons-Disabled-Left", "Buttons-Disabled-Middle", "Buttons-Disabled-Right"]
          : (hiliteButtonMode
              ? ["Buttons-HiLite-Left", "Buttons-HiLite-Middle", "Buttons-HiLite-Right"]
              : (pushedButtonMode
                  ? ["Buttons-Pushed-Left", "Buttons-Pushed-Middle", "Buttons-Pushed-Right"]
                  : ["Buttons-Left", "Buttons-Middle", "Buttons-Right"]));
        const disabledButtonProbeOk = !disabledButtonMode
          || (probe?.layout?.button?.renderState === "disabled"
            && probe?.layout?.button?.enabled === false
            && probe?.layout?.button?.disabledStateRequested === true
            && probe?.layout?.button?.disabledImagesBound === true
            && probe?.results?.buttonDisabledMappedImagesFound === true
            && probe?.results?.buttonDisabledImagesBound === true
            && probe?.results?.buttonDisabledStateRequested === true
            && probe?.results?.buttonEnabledBeforeStateChange === true
            && probe?.results?.buttonEnabledAfterStateChange === false
            && probe?.results?.buttonRenderedDisabledState === true
            && probe?.disabledButtonImages?.left?.name === "Buttons-Disabled-Left"
            && probe?.disabledButtonImages?.middle?.name === "Buttons-Disabled-Middle"
            && probe?.disabledButtonImages?.right?.name === "Buttons-Disabled-Right"
            && probe?.disabledButtonImages?.left?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.disabledButtonImages?.middle?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.disabledButtonImages?.right?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.disabledButtonImages?.left?.width > 0
            && probe?.disabledButtonImages?.middle?.width > 0
            && probe?.disabledButtonImages?.right?.width > 0
            && Array.isArray(probe?.display?.imageDrawNames)
            && probe.display.imageDrawNames.includes("Buttons-Disabled-Left")
            && probe.display.imageDrawNames.includes("Buttons-Disabled-Middle")
            && probe.display.imageDrawNames.includes("Buttons-Disabled-Right")
            && probe?.originalPaths?.includes(
              "MainMenu.wnd:ButtonSinglePlayer disabled -> W3DGadgetPushButtonImageDraw disabled image triplet"));
        const hiliteButtonProbeOk = !hiliteButtonMode
          || (probe?.layout?.button?.renderState === "hilite"
            && probe?.layout?.button?.enabled === true
            && probe?.layout?.button?.hiliteStateRequested === true
            && probe?.layout?.button?.hilited === true
            && probe?.layout?.button?.hiliteImagesBound === true
            && probe?.results?.buttonHiliteMappedImagesFound === true
            && probe?.results?.buttonHiliteImagesBound === true
            && probe?.results?.buttonHiliteStateRequested === true
            && probe?.results?.buttonHilitedBeforeStateChange === false
            && probe?.results?.buttonHilitedAfterStateChange === true
            && probe?.results?.buttonRenderedHiliteState === true
            && probe?.hiliteButtonImages?.left?.name === "Buttons-HiLite-Left"
            && probe?.hiliteButtonImages?.middle?.name === "Buttons-HiLite-Middle"
            && probe?.hiliteButtonImages?.right?.name === "Buttons-HiLite-Right"
            && probe?.hiliteButtonImages?.left?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.hiliteButtonImages?.middle?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.hiliteButtonImages?.right?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.hiliteButtonImages?.left?.width > 0
            && probe?.hiliteButtonImages?.middle?.width > 0
            && probe?.hiliteButtonImages?.right?.width > 0
            && Array.isArray(probe?.display?.imageDrawNames)
            && probe.display.imageDrawNames.includes("Buttons-HiLite-Left")
            && probe.display.imageDrawNames.includes("Buttons-HiLite-Middle")
            && probe.display.imageDrawNames.includes("Buttons-HiLite-Right")
            && probe?.originalPaths?.includes(
              "MainMenu.wnd:ButtonSinglePlayer hilite -> W3DGadgetPushButtonImageDraw hilite image triplet"));
        const pushedButtonProbeOk = !pushedButtonMode
          || (probe?.layout?.button?.renderState === "pushed"
            && probe?.layout?.button?.enabled === true
            && probe?.layout?.button?.pushedStateRequested === true
            && probe?.layout?.button?.hilited === true
            && probe?.layout?.button?.selected === true
            && probe?.layout?.button?.pushedImagesBound === true
            && probe?.results?.buttonPushedMappedImagesFound === true
            && probe?.results?.buttonPushedImagesBound === true
            && probe?.results?.buttonPushedStateRequested === true
            && probe?.results?.buttonHilitedBeforeStateChange === false
            && probe?.results?.buttonSelectedBeforeStateChange === false
            && probe?.results?.buttonHilitedAfterStateChange === true
            && probe?.results?.buttonSelectedAfterStateChange === true
            && probe?.results?.buttonRenderedPushedState === true
            && probe?.pushedButtonImages?.left?.name === "Buttons-Pushed-Left"
            && probe?.pushedButtonImages?.middle?.name === "Buttons-Pushed-Middle"
            && probe?.pushedButtonImages?.right?.name === "Buttons-Pushed-Right"
            && probe?.pushedButtonImages?.left?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.pushedButtonImages?.middle?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.pushedButtonImages?.right?.filename === "SCSmShellUserInterface512_001.tga"
            && probe?.pushedButtonImages?.left?.width > 0
            && probe?.pushedButtonImages?.middle?.width > 0
            && probe?.pushedButtonImages?.right?.width > 0
            && Array.isArray(probe?.display?.imageDrawNames)
            && probe.display.imageDrawNames.includes("Buttons-Pushed-Left")
            && probe.display.imageDrawNames.includes("Buttons-Pushed-Middle")
            && probe.display.imageDrawNames.includes("Buttons-Pushed-Right")
            && probe?.originalPaths?.includes(
              "MainMenu.wnd:ButtonSinglePlayer pushed -> W3DGadgetPushButtonImageDraw hilite-selected image triplet"));
        const expectedExtraButtons = [
          ["MainMenu.wnd:ButtonMultiplayer", "GUI:Multiplayer", 156, 36],
          ["MainMenu.wnd:ButtonLoadReplay", "GUI:ReplayMenu", 196, 35],
          ["MainMenu.wnd:ButtonOptions", "GUI:Options", 236, 36],
          ["MainMenu.wnd:ButtonCredits", "GUI:Credits", 276, 36],
          ["MainMenu.wnd:ButtonExit", "GUI:Exit", 316, 36],
        ];
        const extraButtonsProbeOk = staticTextMode || singlePlayerMode || loadReplayMode || difficultyMode || factionLogoMode
          || (probe?.results?.extraButtonLabelsExist === true
            && probe?.results?.extraButtonTextNonEmpty === true
            && probe?.results?.extraButtonsFound === true
            && probe?.results?.extraButtonsCallbackBound === true
            && probe?.results?.extraButtonsImagesBound === true
            && probe?.results?.extraButtonsTextDisplayStringBound === true
            && probe?.results?.extraButtonsTextSizeComputed === true
            && probe?.results?.extraButtonsVisible === true
            && probe?.gameText?.extraButtonLabelsExist === true
            && probe?.gameText?.extraButtonTextNonEmpty === true
            && extraButtons.length === expectedExtraButtons.length
            && expectedExtraButtons.every(([name, label, y, height], index) => {
              const extraButton = extraButtons[index];
              return extraButton?.name === name
                && extraButton?.x === 540
                && extraButton?.y === y
                && extraButton?.width === 208
                && extraButton?.height === height
                && extraButton?.drawFunc === "W3DGadgetPushButtonImageDraw"
                && extraButton?.systemFunc === "GadgetPushButtonSystem"
                && extraButton?.inputFunc === "GadgetPushButtonInput"
                && extraButton?.hidden === false
                && extraButton?.labelExists === true
                && extraButton?.textNonEmpty === true
                && extraButton?.imagesBound === true
                && extraButton?.images?.[0] === "Buttons-Left"
                && extraButton?.images?.[1] === "Buttons-Middle"
                && extraButton?.images?.[2] === "Buttons-Right"
                && extraButton?.text?.label === label
                && typeof extraButton?.text?.ascii === "string"
                && extraButton.text.ascii.length > 0
                && extraButton?.text?.length > 0
                && extraButton?.text?.width > 0
                && extraButton?.text?.height > 0;
            }));
        const extraButtonsPixelOk = staticTextMode || singlePlayerMode || loadReplayMode || difficultyMode || factionLogoMode
          || (extraButtonRegions.length === expectedExtraButtons.length
            && extraButtonRegions.every((entry) =>
              entry.region.coloredPixelCount >= 20
              && entry.textRegion.coloredPixelCount >= 20
              && entry.textRegion.maxComponent >= 180));
        const expectedSinglePlayerButtons = [
          ["MainMenu.wnd:ButtonUSA", "GUI:USA", 116, 36],
          ["MainMenu.wnd:ButtonGLA", "GUI:GLA", 156, 36],
          ["MainMenu.wnd:ButtonChina", "GUI:CHINA_Caps", 196, 35],
          ["MainMenu.wnd:ButtonChallenge", "GUI:Generals_Challenge", 236, 36],
          ["MainMenu.wnd:ButtonSkirmish", "GUI:Skirmish", 276, 36],
          ["MainMenu.wnd:ButtonSingleBack", "GUI:Back", 316, 35],
        ];
        const singlePlayerButtonsProbeOk = !singlePlayerMode
          || (probe?.results?.singlePlayerButtonLabelsExist === true
            && probe?.results?.singlePlayerButtonTextNonEmpty === true
            && probe?.results?.singlePlayerDropdownFound === true
            && probe?.results?.singlePlayerDropdownCallbackBound === true
            && probe?.results?.singlePlayerEarthMapFound === true
            && probe?.results?.singlePlayerEarthMapCallbackBound === true
            && probe?.results?.singlePlayerButtonsFound === true
            && probe?.results?.singlePlayerButtonsCallbackBound === true
            && probe?.results?.singlePlayerButtonsImagesBound === true
            && probe?.results?.singlePlayerButtonsTextDisplayStringBound === true
            && probe?.results?.singlePlayerButtonsTextSizeComputed === true
            && probe?.results?.singlePlayerDropdownHidden === false
            && probe?.results?.singlePlayerEarthMapHidden === false
            && probe?.results?.singlePlayerButtonsVisible === true
            && probe?.layout?.singlePlayerDropdown?.name === "MainMenu.wnd:MapBorder"
            && probe?.layout?.singlePlayerDropdown?.x === 532
            && probe?.layout?.singlePlayerDropdown?.y === 108
            && probe?.layout?.singlePlayerDropdown?.width === 224
            && probe?.layout?.singlePlayerDropdown?.height === 252
            && probe?.layout?.singlePlayerDropdown?.systemFunc === "PassSelectedButtonsToParentSystem"
            && probe?.layout?.singlePlayerDropdown?.hidden === false
            && probe?.layout?.singlePlayerEarthMap?.name === "MainMenu.wnd:EarthMap"
            && probe?.layout?.singlePlayerEarthMap?.x === 532
            && probe?.layout?.singlePlayerEarthMap?.y === 108
            && probe?.layout?.singlePlayerEarthMap?.width === 224
            && probe?.layout?.singlePlayerEarthMap?.height === 244
            && probe?.layout?.singlePlayerEarthMap?.systemFunc === "PassSelectedButtonsToParentSystem"
            && probe?.layout?.singlePlayerEarthMap?.drawFunc === "W3DGameWinDefaultDraw"
            && probe?.layout?.singlePlayerEarthMap?.hidden === false
            && probe?.gameText?.singlePlayerButtonLabelsExist === true
            && probe?.gameText?.singlePlayerButtonTextNonEmpty === true
            && singlePlayerButtons.length === expectedSinglePlayerButtons.length
            && expectedSinglePlayerButtons.every(([name, label, y, height], index) => {
              const singlePlayerButton = singlePlayerButtons[index];
              return singlePlayerButton?.name === name
                && singlePlayerButton?.x === 540
                && singlePlayerButton?.y === y
                && singlePlayerButton?.width === 208
                && singlePlayerButton?.height === height
                && singlePlayerButton?.drawFunc === "W3DGadgetPushButtonImageDraw"
                && singlePlayerButton?.systemFunc === "GadgetPushButtonSystem"
                && singlePlayerButton?.inputFunc === "GadgetPushButtonInput"
                && singlePlayerButton?.hidden === false
                && singlePlayerButton?.labelExists === true
                && singlePlayerButton?.textNonEmpty === true
                && singlePlayerButton?.imagesBound === true
                && singlePlayerButton?.images?.[0] === "Buttons-Left"
                && singlePlayerButton?.images?.[1] === "Buttons-Middle"
                && singlePlayerButton?.images?.[2] === "Buttons-Right"
                && singlePlayerButton?.text?.label === label
                && typeof singlePlayerButton?.text?.ascii === "string"
                && singlePlayerButton.text.ascii.length > 0
                && singlePlayerButton?.text?.length > 0
                && singlePlayerButton?.text?.width > 0
                && singlePlayerButton?.text?.height > 0;
            }));
        const singlePlayerButtonsPixelOk = !singlePlayerMode
          || (singlePlayerButtonRegions.length === expectedSinglePlayerButtons.length
            && singlePlayerButtonRegions.every((entry) =>
              entry.region.coloredPixelCount >= 20
              && entry.textRegion.coloredPixelCount >= 20
              && entry.textRegion.maxComponent >= 180));
        const expectedLoadReplayButtons = [
          ["MainMenu.wnd:ButtonLoadGame", "GUI:MainMenuLoadGame", 116, 35],
          ["MainMenu.wnd:ButtonReplay", "GUI:MainMenuLoadReplay", 156, 35],
          ["MainMenu.wnd:ButtonLoadReplayBack", "GUI:Back", 196, 36],
        ];
        const loadReplayButtonsProbeOk = !loadReplayMode
          || (probe?.results?.loadReplayButtonLabelsExist === true
            && probe?.results?.loadReplayButtonTextNonEmpty === true
            && probe?.results?.loadReplayDropdownFound === true
            && probe?.results?.loadReplayDropdownCallbackBound === true
            && probe?.results?.loadReplayButtonsFound === true
            && probe?.results?.loadReplayButtonsCallbackBound === true
            && probe?.results?.loadReplayButtonsImagesBound === true
            && probe?.results?.loadReplayButtonsTextDisplayStringBound === true
            && probe?.results?.loadReplayButtonsTextSizeComputed === true
            && probe?.results?.loadReplayDropdownHidden === false
            && probe?.results?.loadReplayButtonsVisible === true
            && probe?.layout?.loadReplayDropdown?.name === "MainMenu.wnd:MapBorder3"
            && probe?.layout?.loadReplayDropdown?.x === 532
            && probe?.layout?.loadReplayDropdown?.y === 108
            && probe?.layout?.loadReplayDropdown?.width === 224
            && probe?.layout?.loadReplayDropdown?.height === 132
            && probe?.layout?.loadReplayDropdown?.systemFunc === "PassSelectedButtonsToParentSystem"
            && probe?.layout?.loadReplayDropdown?.hidden === false
            && probe?.gameText?.loadReplayButtonLabelsExist === true
            && probe?.gameText?.loadReplayButtonTextNonEmpty === true
            && loadReplayButtons.length === expectedLoadReplayButtons.length
            && expectedLoadReplayButtons.every(([name, label, y, height], index) => {
              const loadReplayButton = loadReplayButtons[index];
              return loadReplayButton?.name === name
                && loadReplayButton?.x === 540
                && loadReplayButton?.y === y
                && loadReplayButton?.width === 208
                && loadReplayButton?.height === height
                && loadReplayButton?.drawFunc === "W3DGadgetPushButtonImageDraw"
                && loadReplayButton?.systemFunc === "GadgetPushButtonSystem"
                && loadReplayButton?.inputFunc === "GadgetPushButtonInput"
                && loadReplayButton?.hidden === false
                && loadReplayButton?.labelExists === true
                && loadReplayButton?.textNonEmpty === true
                && loadReplayButton?.imagesBound === true
                && loadReplayButton?.images?.[0] === "Buttons-Left"
                && loadReplayButton?.images?.[1] === "Buttons-Middle"
                && loadReplayButton?.images?.[2] === "Buttons-Right"
                && loadReplayButton?.text?.label === label
                && typeof loadReplayButton?.text?.ascii === "string"
                && loadReplayButton.text.ascii.length > 0
                && loadReplayButton?.text?.length > 0
                && loadReplayButton?.text?.width > 0
                && loadReplayButton?.text?.height > 0;
            }));
        const loadReplayButtonsPixelOk = !loadReplayMode
          || (loadReplayButtonRegions.length === expectedLoadReplayButtons.length
            && loadReplayButtonRegions.every((entry) =>
              entry.region.coloredPixelCount >= 20
              && entry.textRegion.coloredPixelCount >= 20
              && entry.textRegion.maxComponent >= 180));
        const expectedDifficultyButtons = [
          ["MainMenu.wnd:ButtonEasy", "GUI:EasyCaps", 156, 35],
          ["MainMenu.wnd:ButtonMedium", "GUI:MediumDifficultyCaps", 196, 35],
          ["MainMenu.wnd:ButtonHard", "GUI:HardCaps", 236, 36],
          ["MainMenu.wnd:ButtonDiffBack", "GUI:Back", 276, 36],
        ];
        const difficultyButtonsProbeOk = !difficultyMode
          || (probe?.results?.difficultyButtonLabelsExist === true
            && probe?.results?.difficultyButtonTextNonEmpty === true
            && probe?.results?.difficultyDropdownFound === true
            && probe?.results?.difficultyDropdownCallbackBound === true
            && probe?.results?.difficultyEarthMapFound === true
            && probe?.results?.difficultyEarthMapCallbackBound === true
            && probe?.results?.difficultyButtonsFound === true
            && probe?.results?.difficultyButtonsCallbackBound === true
            && probe?.results?.difficultyButtonsImagesBound === true
            && probe?.results?.difficultyButtonsTextDisplayStringBound === true
            && probe?.results?.difficultyButtonsTextSizeComputed === true
            && probe?.results?.difficultyDropdownHidden === false
            && probe?.results?.difficultyEarthMapHidden === false
            && probe?.results?.difficultyButtonsVisible === true
            && probe?.layout?.difficultyDropdown?.name === "MainMenu.wnd:MapBorder4"
            && probe?.layout?.difficultyDropdown?.x === 532
            && probe?.layout?.difficultyDropdown?.y === 108
            && probe?.layout?.difficultyDropdown?.width === 224
            && probe?.layout?.difficultyDropdown?.height === 212
            && probe?.layout?.difficultyDropdown?.systemFunc === "PassSelectedButtonsToParentSystem"
            && probe?.layout?.difficultyDropdown?.hidden === false
            && probe?.layout?.difficultyEarthMap?.name === "MainMenu.wnd:EarthMap4"
            && probe?.layout?.difficultyEarthMap?.x === 532
            && probe?.layout?.difficultyEarthMap?.y === 108
            && probe?.layout?.difficultyEarthMap?.width === 224
            && probe?.layout?.difficultyEarthMap?.height === 212
            && probe?.layout?.difficultyEarthMap?.systemFunc === "PassSelectedButtonsToParentSystem"
            && probe?.layout?.difficultyEarthMap?.drawFunc === "W3DGameWinDefaultDraw"
            && probe?.layout?.difficultyEarthMap?.hidden === false
            && probe?.gameText?.difficultyButtonLabelsExist === true
            && probe?.gameText?.difficultyButtonTextNonEmpty === true
            && difficultyButtons.length === expectedDifficultyButtons.length
            && expectedDifficultyButtons.every(([name, label, y, height], index) => {
              const difficultyButton = difficultyButtons[index];
              return difficultyButton?.name === name
                && difficultyButton?.x === 540
                && difficultyButton?.y === y
                && difficultyButton?.width === 208
                && difficultyButton?.height === height
                && difficultyButton?.drawFunc === "W3DGadgetPushButtonImageDraw"
                && difficultyButton?.systemFunc === "GadgetPushButtonSystem"
                && difficultyButton?.inputFunc === "GadgetPushButtonInput"
                && difficultyButton?.hidden === false
                && difficultyButton?.labelExists === true
                && difficultyButton?.textNonEmpty === true
                && difficultyButton?.imagesBound === true
                && difficultyButton?.images?.[0] === "Buttons-Left"
                && difficultyButton?.images?.[1] === "Buttons-Middle"
                && difficultyButton?.images?.[2] === "Buttons-Right"
                && difficultyButton?.text?.label === label
                && typeof difficultyButton?.text?.ascii === "string"
                && difficultyButton.text.ascii.length > 0
                && difficultyButton?.text?.length > 0
                && difficultyButton?.text?.width > 0
                && difficultyButton?.text?.height > 0;
            }));
        const difficultyButtonsPixelOk = !difficultyMode
          || (difficultyButtonRegions.length === expectedDifficultyButtons.length
            && difficultyButtonRegions.every((entry) =>
              entry.region.coloredPixelCount >= 20
              && entry.textRegion.coloredPixelCount >= 20
              && entry.textRegion.maxComponent >= 180));
        const expectedFactionLogos = [
          ["MainMenu.wnd:WinFactionUS", "SAFactionLogo96_US", 67, 423, 96, 96],
          ["MainMenu.wnd:WinFactionGLA", "SUFactionLogo96_GLA", 211, 423, 96, 96],
          ["MainMenu.wnd:WinFactionChina", "SNFactionLogo96_China", 352, 423, 96, 96],
          ["MainMenu.wnd:WinFactionTraining", "Training96", 497, 423, 93, 84],
          ["MainMenu.wnd:WinFactionSkirmish", "Skirmish96", 640, 423, 96, 96],
        ];
        const factionLogosProbeOk = !factionLogoMode
          || (probe?.results?.factionLogoMappedIniExists === true
            && probe?.results?.factionLogoTextureFileExists === true
            && probe?.results?.factionLogoMappedImagesFound === true
            && probe?.results?.factionLogoWindowsFound === true
            && probe?.results?.factionLogoWindowsCallbackBound === true
            && probe?.results?.factionLogoImagesBound === true
            && probe?.results?.factionLogosVisible === true
            && probe?.archives?.factionLogoMappedImageEntry ===
              "Data\\INI\\MappedImages\\TextureSize_512\\SCLogosUserInterface512.INI"
            && probe?.archives?.factionLogoTextureEntry ===
              "Art\\Textures\\sclogosuserinterface512_001.tga"
            && factionLogos.length === expectedFactionLogos.length
            && expectedFactionLogos.every(([name, image, x, y, imageWidth, imageHeight], index) => {
              const logo = factionLogos[index];
              return logo?.name === name
                && logo?.image === image
                && logo?.filename === "SCLogosUserInterface512_001.tga"
                && logo?.x === x
                && logo?.y === y
                && logo?.width === 96
                && logo?.height === 96
                && logo?.drawFunc === "W3DGameWinDefaultDraw"
                && logo?.systemFunc === "GameWinDefaultSystem"
                && logo?.initialHidden === true
                && logo?.hidden === false
                && logo?.imageWidth === imageWidth
                && logo?.imageHeight === imageHeight
                && logo?.found === true
                && logo?.callbackBound === true
                && logo?.mappedImageFound === true
                && logo?.imageBound === true;
            }));
        const factionLogosPixelOk = !factionLogoMode
          || (factionLogoRegions.length === expectedFactionLogos.length
            && factionLogoRegions.every((entry) =>
              entry.region.coloredPixelCount >= 20
              && entry.region.maxComponent >= 64));
        const focusedPixelOk = staticTextMode
          ? (staticTextRegion.coloredPixelCount >= 20
            && staticTextRegion.maxComponent >= 180)
          : (singlePlayerMode
              ? singlePlayerButtonsPixelOk
              : (difficultyMode
                  ? (difficultyButtonsPixelOk
                    && staticTextRegion.coloredPixelCount >= 20
                    && staticTextRegion.maxComponent >= 180)
                  : (factionLogoMode
                      ? factionLogosPixelOk
                      : (loadReplayMode
                        ? loadReplayButtonsPixelOk
                        : (buttonRegion.coloredPixelCount >= 20
                          && buttonTextRegion.coloredPixelCount >= 20
                          && buttonTextRegion.maxComponent >= (disabledButtonMode ? 64 : 180)
                          && extraButtonsPixelOk)))));
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_main_menu_layout_image_repaint_probe"
          && probe?.mode === probeMode
          && probe?.display?.path === "WindowLayout::load -> GameWindowManager::winRepaint -> Display adapter -> W3DDisplay::drawImage"
          && probe?.archives?.window === windowArchivePath
          && probe?.archives?.ini === iniArchivePath
          && probe?.archives?.texture === textureArchivePath
          && probe?.archives?.rulerTexture === rulerTextureArchivePath
          && probe?.layout?.path === "Menus/MainMenu.wnd"
          && probe?.layout?.root?.name === "MainMenu.wnd:MainMenuParent"
          && probe?.layout?.root?.drawFunc === "W3DNoDraw"
          && probe?.layout?.ruler?.name === "MainMenu.wnd:MainMenuRuler"
          && probe?.layout?.ruler?.drawFunc === "W3DGameWinDefaultDraw"
          && probe?.layout?.ruler?.image === "MainMenuRuler"
          && probe?.layout?.ruler?.x === 0
          && probe?.layout?.ruler?.y === 0
          && probe?.layout?.ruler?.width === 800
          && probe?.layout?.ruler?.height === 600
          && probe?.layout?.target?.name === "MainMenu.wnd:Logo"
          && probe?.layout?.target?.drawFunc === "W3DGameWinDefaultDraw"
          && probe?.layout?.target?.image === "GeneralsLogo"
          && probe?.layout?.button?.name === "MainMenu.wnd:ButtonSinglePlayer"
          && probe?.layout?.button?.drawFunc === "W3DGadgetPushButtonImageDraw"
          && probe?.layout?.button?.systemFunc === "GadgetPushButtonSystem"
          && probe?.layout?.button?.inputFunc === "GadgetPushButtonInput"
          && probe?.layout?.button?.x === 540
          && probe?.layout?.button?.y === 116
          && probe?.layout?.button?.width === 208
          && probe?.layout?.button?.height === 36
          && probe?.layout?.button?.images?.[0] === expectedButtonImages[0]
          && probe?.layout?.button?.images?.[1] === expectedButtonImages[1]
          && probe?.layout?.button?.images?.[2] === expectedButtonImages[2]
          && probe?.layout?.button?.text?.label === "GUI:SinglePlayer"
          && typeof probe?.layout?.button?.text?.ascii === "string"
          && probe.layout.button.text.ascii.length > 0
          && probe?.layout?.button?.text?.length > 0
          && probe?.image?.name === "GeneralsLogo"
          && probe?.image?.filename === "SCSmShellUserInterface512_001.tga"
          && probe?.image?.width === 370
          && probe?.image?.height === 120
          && probe?.rulerImage?.name === "MainMenuRuler"
          && probe?.rulerImage?.filename === "MainMenuRuleruserinterface.tga"
          && probe?.rulerImage?.width === 800
          && probe?.rulerImage?.height === 600
          && probe?.buttonImages?.left?.name === "Buttons-Left"
          && probe?.buttonImages?.left?.filename === "SCSmShellUserInterface512_001.tga"
          && probe?.buttonImages?.middle?.name === "Buttons-Middle"
          && probe?.buttonImages?.middle?.filename === "SCSmShellUserInterface512_001.tga"
          && probe?.buttonImages?.right?.name === "Buttons-Right"
          && probe?.buttonImages?.right?.filename === "SCSmShellUserInterface512_001.tga"
          && probe?.rulerTexture?.name?.toLowerCase?.() === "mainmenuruleruserinterface.tga"
          && probe?.rulerTexture?.width === 1024
          && probe?.rulerTexture?.height === 1024
          && probe?.texture?.name?.toLowerCase?.() === "scsmshelluserinterface512_001.tga"
          && probe?.texture?.width === 512
          && probe?.texture?.height === 512
          && probe?.results?.targetImageBound === true
          && probe?.results?.rulerImageBound === true
          && probe?.results?.buttonImagesBound === true
          && probe?.results?.gameTextCsfExists === true
          && probe?.results?.gameTextCreated === true
          && probe?.results?.gameTextInitialized === true
          && probe?.results?.buttonTextLabelExists === true
          && probe?.results?.buttonTextNonEmpty === true
          && probe?.gameText?.csfPath === "data\\english\\generals.csf"
          && probe?.gameText?.created === true
          && probe?.gameText?.initialized === true
          && probe?.gameText?.buttonLabelExists === true
          && probe?.gameText?.buttonTextNonEmpty === true
          && buttonTextProbeOk
          && disabledButtonProbeOk
          && hiliteButtonProbeOk
          && pushedButtonProbeOk
          && extraButtonsProbeOk
          && singlePlayerButtonsProbeOk
          && loadReplayButtonsProbeOk
          && difficultyButtonsProbeOk
          && factionLogosProbeOk
          && staticTextProbeOk
          && probe?.calls?.displayImageDraws >= expectedDisplayImageDraws
          && probe?.calls?.drawIndexed >= expectedDrawIndexed
          && probe?.calls?.browserTextureCreate >= (factionLogoMode ? 3 : 2)
          && probe?.calls?.browserTextureUpdate >= (factionLogoMode ? 3 : 2)
          && probe?.calls?.browserTextureBind >= (factionLogoMode ? 3 : 2)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 4
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 6
          && browserProbe?.texture0?.sampled === true
          && coloredLogoPixels.length >= 1
          && coloredRulerPixels.length >= 4
          && focusedPixelOk;
        return {
          ok,
          command,
          probe,
          bridgeInputPaths: {
            directory: archiveDirectoryPath,
            window: windowArchivePath,
            ini: iniArchivePath,
            texture: textureArchivePath,
            rulerTexture: rulerTextureArchivePath,
          },
          browserProbe,
          logoPixels,
          rulerPixels,
          buttonPixels,
          buttonRegion,
          buttonTextRegion,
          extraButtonRegions,
          singlePlayerButtonRegions,
          loadReplayButtonRegions,
          difficultyButtonRegions,
          factionLogoRegions,
          staticTextRegion,
          coloredLogoPixelCount: coloredLogoPixels.length,
          coloredRulerPixelCount: coloredRulerPixels.length,
          coloredButtonPixelCount: coloredButtonPixels.length,
          textureBefore,
          textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayLine":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay line cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DDisplayLine());
        const linePixels = {
          center: sampleVirtualCanvasPixel(400, 300),
          above: sampleVirtualCanvasPixel(400, 284),
          below: sampleVirtualCanvasPixel(400, 316),
          leftOutside: sampleVirtualCanvasPixel(200, 300),
          rightOutside: sampleVirtualCanvasPixel(600, 300),
        };
        const screenshot = {
          ...snapshotCanvas(),
          linePixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_line_probe"
          && probe?.display?.path === "W3DDisplay::drawLine"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 4
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 6
          && browserProbe?.texture0?.sampled !== true
          && pixelLooksGreen(browserProbe.centerPixel)
          && pixelLooksGreen(screenshot.centerPixel)
          && pixelLooksGreen(linePixels.center)
          && pixelLooksBlack(linePixels.above)
          && pixelLooksBlack(linePixels.below)
          && pixelLooksBlack(linePixels.leftOutside)
          && pixelLooksBlack(linePixels.rightOutside);
        return {
          ok,
          command,
          probe,
          browserProbe,
          linePixels,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayLineGradient":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay gradient line cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DDisplayLineGradient());
        const expectedLeft = probe?.draw?.expectedLeft ?? [241, 0, 14, 255];
        const expectedCenter = probe?.draw?.expectedCenter ?? [128, 0, 128, 255];
        const expectedRight = probe?.draw?.expectedRight ?? [14, 0, 241, 255];
        const gradientPixels = {
          left: sampleVirtualCanvasPixel(240, 300),
          center: sampleVirtualCanvasPixel(400, 300),
          right: sampleVirtualCanvasPixel(560, 300),
          above: sampleVirtualCanvasPixel(400, 284),
          below: sampleVirtualCanvasPixel(400, 316),
          leftOutside: sampleVirtualCanvasPixel(200, 300),
          rightOutside: sampleVirtualCanvasPixel(600, 300),
        };
        const screenshot = {
          ...snapshotCanvas(),
          gradientPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_line_gradient_probe"
          && probe?.display?.path === "W3DDisplay::drawLine(two-color)"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 4
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 6
          && browserProbe?.texture0?.sampled !== true
          && pixelsApproximatelyEqual(browserProbe.centerPixel, expectedCenter, 16)
          && pixelsApproximatelyEqual(screenshot.centerPixel, expectedCenter, 16)
          && pixelsApproximatelyEqual(gradientPixels.left, expectedLeft, 16)
          && pixelsApproximatelyEqual(gradientPixels.center, expectedCenter, 16)
          && pixelsApproximatelyEqual(gradientPixels.right, expectedRight, 16)
          && pixelLooksBlack(gradientPixels.above)
          && pixelLooksBlack(gradientPixels.below)
          && pixelLooksBlack(gradientPixels.leftOutside)
          && pixelLooksBlack(gradientPixels.rightOutside);
        return {
          ok,
          command,
          probe,
          browserProbe,
          gradientPixels,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayOpenRect":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay open rect cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DDisplayOpenRect());
        const borderPixels = {
          left: sampleVirtualCanvasPixel(301, 300),
          top: sampleVirtualCanvasPixel(400, 221),
          right: sampleVirtualCanvasPixel(500, 300),
          bottom: sampleVirtualCanvasPixel(400, 380),
          center: sampleVirtualCanvasPixel(400, 300),
        };
        const screenshot = {
          ...snapshotCanvas(),
          borderPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_openrect_probe"
          && probe?.display?.path === "W3DDisplay::drawOpenRect"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 16
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 24
          && browserProbe?.texture0?.sampled !== true
          && pixelLooksYellow(borderPixels.left)
          && pixelLooksYellow(borderPixels.top)
          && pixelLooksYellow(borderPixels.right)
          && pixelLooksYellow(borderPixels.bottom)
          && pixelLooksBlack(borderPixels.center)
          && pixelLooksBlack(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          borderPixels,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayRectClock":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay rect clock cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DDisplayRectClock());
        const clockPixels = {
          rightHalf: sampleVirtualCanvasPixel(450, 250),
          bottomLeft: sampleVirtualCanvasPixel(350, 350),
          topLeftTriangle: sampleVirtualCanvasPixel(330, 280),
          topLeftGap: sampleVirtualCanvasPixel(360, 250),
          outsideLeft: sampleVirtualCanvasPixel(290, 300),
          outsideBottom: sampleVirtualCanvasPixel(400, 390),
        };
        const screenshot = {
          ...snapshotCanvas(),
          clockPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_rectclock_probe"
          && probe?.display?.path === "W3DDisplay::drawRectClock"
          && probe?.display?.clock?.percent === 88
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 14
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 18
          && browserProbe?.texture0?.sampled !== true
          && pixelLooksGreen(clockPixels.rightHalf)
          && pixelLooksGreen(clockPixels.bottomLeft)
          && pixelLooksGreen(clockPixels.topLeftTriangle)
          && pixelLooksBlack(clockPixels.topLeftGap)
          && pixelLooksBlack(clockPixels.outsideLeft)
          && pixelLooksBlack(clockPixels.outsideBottom);
        return {
          ok,
          command,
          probe,
          browserProbe,
          clockPixels,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dDisplayRemainingRectClock":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3DDisplay remaining rect clock cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const probe = parseModuleState(wasmModule.probeWW3DDisplayRemainingRectClock());
        const remainingClockPixels = {
          topLeft: sampleVirtualCanvasPixel(350, 290),
          bottomLeft: sampleVirtualCanvasPixel(350, 340),
          leftSeam: sampleVirtualCanvasPixel(399, 300),
          topRight: sampleVirtualCanvasPixel(450, 290),
          bottomRight: sampleVirtualCanvasPixel(450, 340),
          rightSeam: sampleVirtualCanvasPixel(401, 300),
          outsideLeft: sampleVirtualCanvasPixel(290, 300),
        };
        const screenshot = {
          ...snapshotCanvas(),
          remainingClockPixels,
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_display_remaining_rectclock_probe"
          && probe?.display?.path === "W3DDisplay::drawRemainingRectClock"
          && probe?.display?.clock?.percent === 50
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.usedIdentityClipSpace === true
          && browserProbe?.vertexCount === 10
          && browserProbe?.vertexStride === 44
          && browserProbe?.indexCount === 12
          && browserProbe?.texture0?.sampled !== true
          && pixelLooksRed(remainingClockPixels.topLeft)
          && pixelLooksRed(remainingClockPixels.bottomLeft)
          && pixelLooksRed(remainingClockPixels.leftSeam)
          && pixelLooksBlack(remainingClockPixels.topRight)
          && pixelLooksBlack(remainingClockPixels.bottomRight)
          && pixelLooksBlack(remainingClockPixels.rightSeam)
          && pixelLooksBlack(remainingClockPixels.outsideLeft);
        return {
          ok,
          command,
          probe,
          browserProbe,
          remainingClockPixels,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTexturedMesh":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D mesh cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTexturedMesh());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && pixelLooksRed(browserProbe.centerPixel)
          && pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dEmissiveColor2MaterialSource":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; WW3D emissive COLOR2 material-source probe cannot render",
          };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        updateD3D8BufferSummary(true);
        const bufferBefore = harnessState.graphics.d3d8Buffers ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DEmissiveColor2MaterialSource());
        updateD3D8BufferSummary(true);
        const bufferAfter = harnessState.graphics.d3d8Buffers ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const bufferDelta = {
          creates: (bufferAfter?.creates ?? 0) - (bufferBefore.creates ?? 0),
          updates: (bufferAfter?.updates ?? 0) - (bufferBefore.updates ?? 0),
          releases: (bufferAfter?.releases ?? 0) - (bufferBefore.releases ?? 0),
        };
        const vertexLayout = browserProbe?.vertexLayout ?? {};
        const renderState = browserProbe?.renderState ?? {};
        const appliedSources = browserProbe?.appliedRenderState?.materialSources ?? {};
        const expectedSources = probe?.materialSources ?? {};
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_emissive_color2_material_source_probe"
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf
          && (browserProbe?.vertexShaderFvf & D3DFVF_SPECULAR) === D3DFVF_SPECULAR
          && vertexLayout.source === "fvf"
          && vertexLayout.normalOffset === 12
          && vertexLayout.diffuseOffset === 24
          && vertexLayout.specularOffset === 28
          && vertexLayout.computedStride === probe?.draw?.vertexStride
          && renderState.lighting === 1
          && renderState.colorVertex === 1
          && renderState.diffuseMaterialSource === D3DMCS_MATERIAL
          && renderState.ambientMaterialSource === D3DMCS_MATERIAL
          && renderState.emissiveMaterialSource === D3DMCS_COLOR2
          && appliedSources.emissive?.source === D3DMCS_COLOR2
          && appliedSources.emissive?.name === "color2"
          && expectedSources.emissive === D3DMCS_COLOR2
          && browserProbe?.appliedRenderState?.lighting?.shaderEnabled === true
          && browserProbe?.appliedRenderState?.lighting?.fixedFunctionLightSupported === true
          && browserProbe?.texture0?.sampled !== true
          && browserProbe?.texture1?.sampled !== true
          && pixelLooksGreen(browserProbe.centerPixel)
          && pixelLooksGreen(screenshot.centerPixel)
          && bufferDelta.creates >= 2
          && bufferDelta.updates >= 2;
        return {
          ok,
          command,
          probe,
          browserProbe,
          bufferDelta,
          bufferProbe: bufferAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dShaderManager":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D shader manager cannot initialize" };
        }
        const probe = parseModuleState(wasmModule.probeWW3DShaderManager());
        const ok = Boolean(probe.ok)
          && probe.source === "ww3d_shader_manager_probe"
          && probe.adapter?.vendorId === 0x121a
          && probe.adapter?.deviceId === 0x0009
          && probe.caps?.pixelShaderVersion === 0
          && probe.chipsetAfter === probe.expectedChipset
          && probe.canRenderToTexture === true
          && (probe.shaderPasses?.terrainBase ?? 0) > 0
          && (probe.shaderPasses?.terrainNoise12 ?? 0) > 0
          && probe.calls?.createTexture >= 1
          && probe.calls?.createPixelShaderUnavailable === true;
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainTile":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D terrain tile cannot render" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainTile());
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 32
          && browserProbe?.vertexLayout?.source === "fvf"
          && browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf
          && browserProbe?.vertexShaderFvf !== 0
          && (browserProbe?.vertexCount ?? 0) > 0
          && (browserProbe?.indexCount ?? 0) > 0
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && pixelHasColor(browserProbe?.centerPixel, 8)
          && pixelHasColor(screenshot?.centerPixel, 8);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainTileArchive":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; archive-backed WW3D terrain tile cannot render" };
        }
        const terrainArchivePath = String(payload.terrainArchivePath ?? payload.archivePath ?? "");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainTileArchive(terrainArchivePath));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_terrain_tile_archive_probe"
          && probe?.terrain?.tileSource === "archive-tga"
          && probe?.archive?.loaded === true
          && probe?.archive?.entryExists === true
          && probe?.archive?.entryOpenable === true
          && probe?.archive?.countTilesOk === true
          && probe?.archive?.readTilesOk === true
          && probe?.archive?.tileChecksum > 0
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 32
          && browserProbe?.vertexLayout?.source === "fvf"
          && browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf
          && browserProbe?.texture1?.sampled === true
          && browserProbe?.boundTextures?.["1"] === probe?.texture?.id
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && textureDelta.binds >= 1
          && textureDelta.samplerApplications >= 1
          && pixelHasColor(browserProbe?.centerPixel, 8)
          && pixelHasColor(screenshot?.centerPixel, 8);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainTileArchiveScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; archive-backed WW3D terrain scene cannot render" };
        }
        const terrainArchivePath = String(payload.terrainArchivePath ?? payload.archivePath ?? "");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainTileArchiveScene(terrainArchivePath));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_terrain_tile_archive_scene_probe"
          && probe?.scene?.renderPath?.includes("RTS3DScene::Customized_Render")
          && probe?.scene?.created === true
          && probe?.scene?.objectAdded === true
          && probe?.scene?.terrainClassId === 4
          && probe?.terrain?.tileSource === "archive-tga"
          && probe?.archive?.loaded === true
          && probe?.archive?.entryExists === true
          && probe?.archive?.entryOpenable === true
          && probe?.archive?.countTilesOk === true
          && probe?.archive?.readTilesOk === true
          && probe?.archive?.tileChecksum > 0
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 32
          && browserProbe?.vertexLayout?.source === "fvf"
          && browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf
          && browserProbe?.texture1?.sampled === true
          && browserProbe?.boundTextures?.["1"] === probe?.texture?.id
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && textureDelta.binds >= 1
          && textureDelta.samplerApplications >= 1
          && pixelHasColor(browserProbe?.centerPixel, 8)
          && pixelHasColor(screenshot?.centerPixel, 8);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainMapPatchScene":
    case "ww3dTerrainShroudScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; real-map WW3D terrain scene cannot render" };
        }
        const shroudMode = command === "ww3dTerrainShroudScene";
        const iniArchivePath = String(payload.iniArchivePath ?? "");
        const mapsArchivePath = String(payload.mapsArchivePath ?? payload.mapArchivePath ?? "");
        const terrainArchivePath = String(payload.terrainArchivePath ?? "");
        const mapEntry = String(payload.mapEntry ?? "Maps\\MD_GLA03\\MD_GLA03.map");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          d3d8DrawHistory: [],
          d3d8DrawIndexedSequence: 0,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(
          (shroudMode
            ? wasmModule.probeWW3DTerrainShroudScene
            : wasmModule.probeWW3DTerrainMapPatchScene)(
            iniArchivePath,
            mapsArchivePath,
            terrainArchivePath,
          ),
        );
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = {
          ...snapshotCanvas(),
          coverage: sampleCanvasRegion({ left: 0, top: 0, right: canvas.width, bottom: canvas.height }, 8),
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const drawHistory = Array.isArray(harnessState.graphics.d3d8DrawHistory)
          ? harnessState.graphics.d3d8DrawHistory
          : [];
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const terrainStage0 = (draw) =>
          draw?.renderState?.textureStage0 ?? draw?.renderState?.textureStages?.[0];
        const isBaseTerrainPass = (draw) => {
          const stage0 = terrainStage0(draw);
          return draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 0
            && stage0?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        };
        const isBlendTerrainPass = (draw) => {
          const stage0 = terrainStage0(draw);
          return draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 1
            && stage0?.texCoordIndex === 1
            && draw?.texture0?.sampled === true;
        };
        const isShroudTerrainPass = (draw) => {
          const stage0 = terrainStage0(draw);
          return draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.zFunc === D3DCMP_EQUAL
            && stage0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
            && stage0?.textureTransformFlags === D3DTTFF_COUNT2
            && draw?.texture0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
            && draw?.texture0?.textureTransformFlags === D3DTTFF_COUNT2;
        };
        const baseTerrainIndex = drawHistory.findIndex(isBaseTerrainPass);
        const blendTerrainIndex = drawHistory.findIndex(isBlendTerrainPass);
        const shroudTerrainIndex = drawHistory.findIndex(isShroudTerrainPass);
        const shroudAfterTerrain = baseTerrainIndex >= 0
          && blendTerrainIndex >= 0
          && shroudTerrainIndex > baseTerrainIndex
          && shroudTerrainIndex > blendTerrainIndex;
        const ok = Boolean(probe.ok)
          && probe?.source === (shroudMode
            ? "ww3d_terrain_shroud_scene_probe"
            : "ww3d_terrain_map_patch_scene_probe")
          && probe?.ini?.loaded === true
          && probe?.ini?.entryExists === true
          && probe?.ini?.parsed === true
          && probe?.ini?.parser === "GameEngine/Common/INI.cpp::load + INITerrain.cpp"
          && probe?.ini?.originalIniParser === true
          && (probe?.ini?.terrainTypeCount ?? 0) > 0
          && probe?.archives?.maps?.loaded === true
          && probe?.archives?.terrain?.loaded === true
          && probe?.map?.entry === mapEntry
          && probe?.map?.entryExists === true
          && probe?.map?.entryOpenable === true
          && probe?.map?.streamOpen === true
          && probe?.map?.parsed === true
          && (probe?.map?.bytes ?? 0) > 0
          && (probe?.map?.width ?? 0) > 16
          && (probe?.map?.height ?? 0) > 16
          && (probe?.map?.heightChecksum ?? 0) > 0
          && probe?.scene?.renderPath?.includes("RTS3DScene::Customized_Render")
          && probe?.scene?.created === true
          && probe?.scene?.objectAdded === true
          && probe?.scene?.terrainClassId === 4
          && probe?.terrain?.tileSource === "shipped-map-heightmap"
          && probe?.terrain?.renderObject === (shroudMode
            ? "ProbeHeightMapRenderObjWithShroud"
            : "HeightMapRenderObjClass")
          && probe?.terrain?.verticesPerSide === 33
          && probe?.terrain?.cellsPerSide === 32
          && (probe?.terrain?.tileDiagnostics?.sourceTilesLoaded ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.sourceTilesPositioned ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.patchCellsWithSource ?? 0) > 0
          && (probe?.terrain?.patchHeightChecksum ?? 0) > 0
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexStride === 32
          && browserProbe?.vertexLayout?.source === "fvf"
          && browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf
          && (!shroudMode || isShroudTerrainPass(browserProbe))
          && (shroudMode || browserProbe?.texture0?.sampled === true)
          && Array.isArray(drawHistory)
          && drawHistory.length >= 2
          && baseTerrainIndex >= 0
          && blendTerrainIndex >= 0
          && (!shroudMode ||
            (probe?.scene?.renderPath?.includes("W3DShroudMaterialPassClass") === true
              && probe?.shroud?.requested === true
              && probe?.shroud?.installed === true
              && probe?.shroud?.initialized === true
              && probe?.shroud?.fillInvoked === true
              && probe?.shroud?.renderInvoked === true
              && probe?.shroud?.textureReady === true
              && probe?.shroud?.terrainRenderInvoked === true
              && probe?.shroud?.terrainRenderSawShroud === true
              && (probe?.shroud?.terrainAdditionalPassCount ?? 0) > 0
              && probe?.shroud?.terrainOriginalDrawSeen === true
              && probe?.shroud?.terrainFinalDrawSeen === true
              && probe?.shroud?.terrainFallbackInvoked === false
              && (probe?.shroud?.cellsX ?? 0) > 0
              && (probe?.shroud?.cellsY ?? 0) > 0
              && (probe?.shroud?.textureWidth ?? 0) > 0
              && (probe?.shroud?.textureHeight ?? 0) > 0
              && (probe?.shroud?.sampleLevel ?? -1) >= 0
              && drawHistory.length >= 3
              && shroudTerrainIndex >= 0
              && shroudAfterTerrain
              && browserProbe?.renderState?.zFunc === D3DCMP_EQUAL
              && browserProbe?.texture0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
              && browserProbe?.texture0?.textureTransformFlags === D3DTTFF_COUNT2))
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && textureDelta.binds >= 1
          && textureDelta.samplerApplications >= 1
          && (screenshot?.coverage?.coloredPixelCount ?? 0) > 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          drawHistory,
          drawSequence: {
            baseTerrainIndex,
            blendTerrainIndex,
            shroudTerrainIndex,
            shroudAfterTerrain,
          },
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainVisualScene":
    case "ww3dTerrainVisualShroudScene":
    case "ww3dTerrainVisualShroudUpdateScene":
    case "ww3dTerrainFullScene":
    case "ww3dTerrainFullSceneShroudUpdate":
    case "ww3dTerrainVisualLoadWindowScene":
    case "ww3dTerrainVisualCameraPanScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; visual-owned WW3D terrain scene cannot render" };
        }
        const fullInitShroudUpdateMode = command === "ww3dTerrainFullSceneShroudUpdate";
        const fullInitMode = command === "ww3dTerrainFullScene" || fullInitShroudUpdateMode;
        const visualShroudUpdateMode = command === "ww3dTerrainVisualShroudUpdateScene";
        const visualShroudMode = command === "ww3dTerrainVisualShroudScene" || visualShroudUpdateMode;
        const loadWindowMode = command === "ww3dTerrainVisualLoadWindowScene";
        const cameraPanMode = command === "ww3dTerrainVisualCameraPanScene";
        const expectedSource = fullInitMode
          ? (fullInitShroudUpdateMode
            ? "ww3d_terrain_full_scene_shroud_update_probe"
            : "ww3d_terrain_full_scene_probe")
          : (loadWindowMode
          ? "ww3d_terrain_visual_load_window_scene_probe"
          : (cameraPanMode
              ? "ww3d_terrain_visual_camera_pan_scene_probe"
              : (visualShroudMode
                ? (visualShroudUpdateMode
                  ? "ww3d_terrain_visual_shroud_update_scene_probe"
                  : "ww3d_terrain_visual_shroud_scene_probe")
                : "ww3d_terrain_visual_scene_probe")));
        const expectedRenderMode = fullInitMode
          ? (fullInitShroudUpdateMode
            ? "full-init-shroud-display-and-partition-refresh-source-patch"
            : "full-init-source-patch")
          : (loadWindowMode
          ? "visual-load-window"
          : (cameraPanMode
            ? "selected-source-patch-camera-pan"
              : (visualShroudMode
                ? (visualShroudUpdateMode
                  ? "visual-owned-shroud-display-and-partition-refresh-source-patch"
                  : "visual-owned-shroud-source-patch")
              : "selected-source-patch")));
        const expectedVerticesPerSide = loadWindowMode ? 129 : 33;
        const expectedCellsPerSide = loadWindowMode ? 128 : 32;
        const iniArchivePath = String(payload.iniArchivePath ?? "");
        const mapsArchivePath = String(payload.mapsArchivePath ?? payload.mapArchivePath ?? "");
        const terrainArchivePath = String(payload.terrainArchivePath ?? "");
        const mapEntry = String(payload.mapEntry ?? "Maps\\MD_GLA03\\MD_GLA03.map");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          d3d8DrawHistory: [],
          d3d8DrawIndexedSequence: 0,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(
          (fullInitShroudUpdateMode
            ? wasmModule.probeWW3DTerrainFullSceneShroudUpdate
            : (fullInitMode
            ? wasmModule.probeWW3DTerrainFullScene
            : (loadWindowMode
            ? wasmModule.probeWW3DTerrainVisualLoadWindowScene
            : (cameraPanMode
                ? wasmModule.probeWW3DTerrainVisualCameraPanScene
                : (visualShroudMode
                  ? (visualShroudUpdateMode
                    ? wasmModule.probeWW3DTerrainVisualShroudUpdateScene
                    : wasmModule.probeWW3DTerrainVisualShroudScene)
                  : wasmModule.probeWW3DTerrainVisualScene)))))(
            iniArchivePath,
            mapsArchivePath,
            terrainArchivePath,
          ),
        );
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = {
          ...snapshotCanvas(),
          coverage: sampleCanvasRegion({ left: 0, top: 0, right: canvas.width, bottom: canvas.height }, 8),
        };
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const drawHistory = Array.isArray(harnessState.graphics.d3d8DrawHistory)
          ? harnessState.graphics.d3d8DrawHistory
          : [];
        const fullSceneMissingWaterAssets =
          fullInitMode && probe?.results?.fullInitBlockedByMissingWaterAssets === true;
        const fullSceneWaterInitialized = fullInitMode && !fullSceneMissingWaterAssets;
        const renderModeMatches = fullInitShroudUpdateMode
          ? probe?.renderMode === expectedRenderMode
          : (fullInitMode
          ? ["full-init-source-patch", "full-init-missing-water-assets-frontier"].includes(probe?.renderMode)
          : probe?.renderMode === expectedRenderMode);
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const hasBaseTerrainPass = loadWindowMode || fullInitMode || visualShroudMode
          ? drawHistory.some((draw) =>
            draw?.renderState?.alphaBlendEnable === 0
              && draw?.renderState?.textureStage0?.texCoordIndex === 0
              && draw?.texture0?.sampled === true)
          : drawHistory[0]?.renderState?.alphaBlendEnable === 0
            && drawHistory[0]?.renderState?.textureStage0?.texCoordIndex === 0
            && drawHistory[0]?.texture0?.sampled === true;
        const hasBlendTerrainPass = loadWindowMode || fullInitMode || visualShroudMode
          ? drawHistory.some((draw) =>
            draw?.renderState?.alphaBlendEnable === 1
              && draw?.renderState?.textureStage0?.texCoordIndex === 1
              && draw?.texture0?.sampled === true)
          : drawHistory[1]?.renderState?.alphaBlendEnable === 1
            && drawHistory[1]?.renderState?.textureStage0?.texCoordIndex === 1
            && drawHistory[1]?.texture0?.sampled === true;
        const isBaseTerrainPass = (draw) =>
          draw?.renderState?.alphaBlendEnable === 0
            && draw?.renderState?.textureStage0?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        const isBlendTerrainPass = (draw) =>
          draw?.renderState?.alphaBlendEnable === 1
            && draw?.renderState?.textureStage0?.texCoordIndex === 1
            && draw?.texture0?.sampled === true;
        const terrainStage0 = (draw) =>
          draw?.renderState?.textureStage0 ?? draw?.renderState?.textureStages?.[0];
        const isShroudTerrainPass = (draw) => {
          const stage0 = terrainStage0(draw);
          return draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.zFunc === D3DCMP_EQUAL
            && stage0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
            && stage0?.textureTransformFlags === D3DTTFF_COUNT2
            && draw?.texture0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
            && draw?.texture0?.textureTransformFlags === D3DTTFF_COUNT2;
        };
        const baseTerrainIndex = drawHistory.findIndex(isBaseTerrainPass);
        const blendTerrainIndex = drawHistory.findIndex(isBlendTerrainPass);
        const shroudTerrainIndex = drawHistory.findIndex(isShroudTerrainPass);
        const baseTerrainIndices = drawHistory
          .map((draw, index) => (isBaseTerrainPass(draw) ? index : -1))
          .filter((index) => index >= 0);
        const blendTerrainIndices = drawHistory
          .map((draw, index) => (isBlendTerrainPass(draw) ? index : -1))
          .filter((index) => index >= 0);
        const shroudTerrainIndices = drawHistory
          .map((draw, index) => (isShroudTerrainPass(draw) ? index : -1))
          .filter((index) => index >= 0);
        const shroudAfterTerrain = baseTerrainIndex >= 0
          && blendTerrainIndex >= 0
          && shroudTerrainIndex > baseTerrainIndex
          && shroudTerrainIndex > blendTerrainIndex;
        const secondShroudAfterSecondTerrain = baseTerrainIndices.length >= 2
          && blendTerrainIndices.length >= 2
          && shroudTerrainIndices.length >= 2
          && shroudTerrainIndices[1] > baseTerrainIndices[1]
          && shroudTerrainIndices[1] > blendTerrainIndices[1]
          && baseTerrainIndices[1] > shroudTerrainIndices[0]
          && blendTerrainIndices[1] > shroudTerrainIndices[0];
        const thirdShroudAfterThirdTerrain = baseTerrainIndices.length >= 3
          && blendTerrainIndices.length >= 3
          && shroudTerrainIndices.length >= 3
          && shroudTerrainIndices[2] > baseTerrainIndices[2]
          && shroudTerrainIndices[2] > blendTerrainIndices[2]
          && baseTerrainIndices[2] > shroudTerrainIndices[1]
          && blendTerrainIndices[2] > shroudTerrainIndices[1];
        const cameraPanProbeOk = !cameraPanMode
          || (probe?.results?.cameraConfigured === true
            && probe?.results?.cameraPanRequested === true
            && probe?.results?.cameraPanMoved === true
            && probe?.results?.cameraPanBeginRender === 0
            && probe?.results?.cameraPanRender === 0
            && probe?.results?.cameraPanEndRender === 0
            && probe?.renderFrames?.count === 2
            && probe?.renderFrames?.firstDrawIndexed >= 2
            && probe?.renderFrames?.secondDrawIndexed >= 4
            && probe?.renderFrames?.firstClear >= 1
            && probe?.renderFrames?.secondClear >= 2
            && probe?.calls?.clear >= 2
            && probe?.calls?.drawIndexed >= 4
            && probe?.camera?.pan?.targetX > probe?.camera?.primary?.targetX
            && probe?.camera?.pan?.targetY < probe?.camera?.primary?.targetY
            && probe?.camera?.pan?.eyeX > probe?.camera?.primary?.eyeX
            && drawHistory.length >= 4
            && drawHistory.slice(2).some(isBaseTerrainPass)
            && drawHistory.slice(2).some(isBlendTerrainPass));
        const visualShroudProbeOk = !visualShroudMode
          || (probe?.scene?.renderPath?.includes("W3DShroudMaterialPassClass") === true
            && (probe?.results?.visualShroudRequested === true
              || (visualShroudUpdateMode && probe?.results?.shroudUpdateRequested === true))
            && probe?.visual?.shroudRenderObject === true
            && probe?.shroud?.requested === true
            && probe?.shroud?.installed === true
            && probe?.shroud?.initialized === true
            && probe?.shroud?.fillInvoked === true
            && probe?.shroud?.renderInvoked === true
            && probe?.shroud?.textureReady === true
            && probe?.shroud?.terrainRenderInvoked === true
            && probe?.shroud?.terrainRenderSawShroud === true
            && probe?.shroud?.terrainRenderSawShroudAfter === true
            && (probe?.shroud?.terrainAdditionalPassCount ?? 0) > 0
            && probe?.shroud?.terrainOriginalInstallZFuncEqualSeen === true
            && probe?.shroud?.terrainOriginalInstallCameraSpaceSeen === true
            && probe?.shroud?.terrainOriginalInstallCount2Seen === true
            && probe?.shroud?.terrainOriginalDrawSeen === true
            && probe?.shroud?.terrainFinalDrawSeen === true
            && probe?.shroud?.terrainFallbackInvoked === false
            && (probe?.shroud?.cellsX ?? 0) > 0
            && (probe?.shroud?.cellsY ?? 0) > 0
            && (probe?.shroud?.textureWidth ?? 0) > 0
            && (probe?.shroud?.textureHeight ?? 0) > 0
            && (probe?.shroud?.sampleLevel ?? -1) >= 0
            && drawHistory.length >= 3
            && shroudTerrainIndex >= 0
            && shroudAfterTerrain
            && isShroudTerrainPass(browserProbe));
        const visualShroudUpdateProbeOk = !visualShroudUpdateMode
          || (probe?.results?.shroudUpdateRequested === true
            && probe?.results?.partitionRefreshRequested === true
            && probe?.shroudUpdate?.requested === true
            && probe?.shroudUpdate?.setInvoked === true
            && probe?.shroudUpdate?.displayInvoked === true
            && probe?.shroudUpdate?.notifyInvoked === true
            && probe?.shroudUpdate?.renderInvoked === true
            && probe?.shroudUpdate?.sampleChanged === true
            && probe?.shroudUpdate?.status === 0
            && probe?.shroudUpdate?.expectedLevel === probe?.shroudUpdate?.sampleAfter
            && (probe?.shroudUpdate?.sampleX ?? -1) >= 0
            && (probe?.shroudUpdate?.sampleY ?? -1) >= 0
            && (probe?.shroudUpdate?.sampleAfter ?? 0) > (probe?.shroudUpdate?.sampleBefore ?? 0)
            && (probe?.shroudUpdate?.cellsChanged ?? 0) > 0
            && probe?.shroudUpdate?.beginRender === 0
            && probe?.shroudUpdate?.render === 0
            && probe?.shroudUpdate?.endRender === 0
            && probe?.renderFrames?.count === 3
            && probe?.renderFrames?.firstDrawIndexed >= 3
            && probe?.renderFrames?.shroudUpdateDrawIndexed >= 6
            && probe?.renderFrames?.partitionRefreshDrawIndexed >= 9
            && probe?.renderFrames?.firstClear >= 1
            && probe?.renderFrames?.shroudUpdateClear >= 2
            && probe?.renderFrames?.partitionRefreshClear >= 3
            && probe?.renderFrames?.shroudUpdateTextureUpdate > probe?.renderFrames?.firstTextureUpdate
            && probe?.renderFrames?.partitionRefreshTextureUpdate > probe?.renderFrames?.shroudUpdateTextureUpdate
            && probe?.partitionRefresh?.requested === true
            && probe?.partitionRefresh?.terrainLogicInstalled === true
            && probe?.partitionRefresh?.partitionCreated === true
            && probe?.partitionRefresh?.partitionInstalled === true
            && probe?.partitionRefresh?.partitionInitInvoked === true
            && probe?.partitionRefresh?.partitionCellsReady === true
            && probe?.partitionRefresh?.displayInstalled === true
            && probe?.partitionRefresh?.radarInstalled === true
            && probe?.partitionRefresh?.playerListInstalled === true
            && probe?.partitionRefresh?.revealInvoked === true
            && probe?.partitionRefresh?.refreshInvoked === true
            && probe?.partitionRefresh?.samplePrepared === true
            && probe?.partitionRefresh?.sampleChanged === true
            && probe?.partitionRefresh?.displaySampleTouched === true
            && probe?.partitionRefresh?.radarSampleTouched === true
            && probe?.partitionRefresh?.renderInvoked === true
            && probe?.partitionRefresh?.status === 1
            && probe?.partitionRefresh?.expectedLevel === probe?.partitionRefresh?.sampleAfter
            && (probe?.partitionRefresh?.sampleAfter ?? 0) > (probe?.partitionRefresh?.sampleBefore ?? 0)
            && probe?.partitionRefresh?.logicalTerrainExtentSourceApplied === true
            && probe?.partitionRefresh?.expectedCellCountX === probe?.partitionRefresh?.cellCountX
            && probe?.partitionRefresh?.expectedCellCountY === probe?.partitionRefresh?.cellCountY
            && probe?.partitionRefresh?.fullCellCountX === 381
            && probe?.partitionRefresh?.fullCellCountY === 381
            && probe?.partitionRefresh?.cellCountX === 48
            && probe?.partitionRefresh?.cellCountY === 48
            && probe?.partitionRefresh?.partitionCellSize === 10
            && probe?.partitionRefresh?.sourcePartitionCellSize === 10
            && probe?.partitionRefresh?.terrainExtentHiX === (probe?.partitionRefresh?.cellCountX - 1) * probe?.partitionRefresh?.partitionCellSize
            && probe?.partitionRefresh?.terrainExtentHiY === (probe?.partitionRefresh?.cellCountY - 1) * probe?.partitionRefresh?.partitionCellSize
            && probe?.partitionRefresh?.fullTerrainExtentHiX === probe?.logicalTerrain?.extentHiX
            && probe?.partitionRefresh?.fullTerrainExtentHiY === probe?.logicalTerrain?.extentHiY
            && (probe?.partitionRefresh?.totalCells ?? 0) > 0
            && (probe?.partitionRefresh?.displaySetCalls ?? 0) >= (probe?.partitionRefresh?.totalCells ?? 1)
            && (probe?.partitionRefresh?.radarSetCalls ?? 0) >= (probe?.partitionRefresh?.totalCells ?? 1)
            && (probe?.partitionRefresh?.displayFoggedSetCalls ?? 0) > 0
            && (probe?.partitionRefresh?.radarFoggedSetCalls ?? 0) > 0
            && probe?.partitionRefresh?.displayClearCalls === 1
            && probe?.partitionRefresh?.radarClearCalls === 1
            && probe?.partitionRefresh?.beginRender === 0
            && probe?.partitionRefresh?.render === 0
            && probe?.partitionRefresh?.endRender === 0
            && drawHistory.length >= 9
            && baseTerrainIndices.length >= 3
            && blendTerrainIndices.length >= 3
            && shroudTerrainIndices.length >= 3
            && secondShroudAfterSecondTerrain
            && thirdShroudAfterThirdTerrain);
        const fullInitShroudUpdateProbeOk = !fullInitShroudUpdateMode
          || (probe?.results?.visualShroudRequested === true
            && probe?.results?.shroudUpdateRequested === true
            && probe?.results?.partitionRefreshRequested === true
            && probe?.visual?.fullInit === true
            && probe?.visual?.waterRenderObjectNull === false
            && probe?.visual?.shroudRenderObject === true
            && probe?.scene?.renderPath?.includes("W3DShroudMaterialPassClass") === true
            && probe?.shroud?.requested === true
            && probe?.shroud?.installed === true
            && probe?.shroud?.initialized === true
            && probe?.shroud?.fillInvoked === true
            && probe?.shroud?.renderInvoked === true
            && probe?.shroud?.textureReady === true
            && (probe?.shroud?.cellsX ?? 0) > 0
            && (probe?.shroud?.cellsY ?? 0) > 0
            && (probe?.shroud?.textureWidth ?? 0) > 0
            && (probe?.shroud?.textureHeight ?? 0) > 0
            && (probe?.shroud?.sampleLevel ?? -1) >= 0
            && probe?.shroudUpdate?.requested === true
            && probe?.shroudUpdate?.setInvoked === true
            && probe?.shroudUpdate?.displayInvoked === true
            && probe?.shroudUpdate?.notifyInvoked === true
            && probe?.shroudUpdate?.renderInvoked === true
            && probe?.shroudUpdate?.sampleChanged === true
            && probe?.shroudUpdate?.status === 0
            && probe?.shroudUpdate?.expectedLevel === probe?.shroudUpdate?.sampleAfter
            && (probe?.shroudUpdate?.sampleAfter ?? 0) > (probe?.shroudUpdate?.sampleBefore ?? 0)
            && (probe?.shroudUpdate?.cellsChanged ?? 0) > 0
            && probe?.shroudUpdate?.beginRender === 0
            && probe?.shroudUpdate?.render === 0
            && probe?.shroudUpdate?.endRender === 0
            && probe?.partitionRefresh?.requested === true
            && probe?.partitionRefresh?.terrainLogicInstalled === true
            && probe?.partitionRefresh?.partitionCreated === true
            && probe?.partitionRefresh?.partitionInstalled === true
            && probe?.partitionRefresh?.partitionInitInvoked === true
            && probe?.partitionRefresh?.partitionCellsReady === true
            && probe?.partitionRefresh?.displayInstalled === true
            && probe?.partitionRefresh?.radarInstalled === true
            && probe?.partitionRefresh?.playerListInstalled === true
            && probe?.partitionRefresh?.revealInvoked === true
            && probe?.partitionRefresh?.refreshInvoked === true
            && probe?.partitionRefresh?.samplePrepared === true
            && probe?.partitionRefresh?.sampleChanged === true
            && probe?.partitionRefresh?.displaySampleTouched === true
            && probe?.partitionRefresh?.radarSampleTouched === true
            && probe?.partitionRefresh?.renderInvoked === true
            && probe?.partitionRefresh?.status === 1
            && probe?.partitionRefresh?.expectedLevel === probe?.partitionRefresh?.sampleAfter
            && (probe?.partitionRefresh?.sampleAfter ?? 0) > (probe?.partitionRefresh?.sampleBefore ?? 0)
            && probe?.partitionRefresh?.logicalTerrainExtentSourceApplied === true
            && probe?.partitionRefresh?.expectedCellCountX === probe?.partitionRefresh?.cellCountX
            && probe?.partitionRefresh?.expectedCellCountY === probe?.partitionRefresh?.cellCountY
            && probe?.partitionRefresh?.fullCellCountX === 381
            && probe?.partitionRefresh?.fullCellCountY === 381
            && probe?.partitionRefresh?.cellCountX === 48
            && probe?.partitionRefresh?.cellCountY === 48
            && probe?.partitionRefresh?.partitionCellSize === 10
            && probe?.partitionRefresh?.sourcePartitionCellSize === 10
            && probe?.partitionRefresh?.terrainExtentHiX === (probe?.partitionRefresh?.cellCountX - 1) * probe?.partitionRefresh?.partitionCellSize
            && probe?.partitionRefresh?.terrainExtentHiY === (probe?.partitionRefresh?.cellCountY - 1) * probe?.partitionRefresh?.partitionCellSize
            && probe?.partitionRefresh?.fullTerrainExtentHiX === probe?.logicalTerrain?.extentHiX
            && probe?.partitionRefresh?.fullTerrainExtentHiY === probe?.logicalTerrain?.extentHiY
            && (probe?.partitionRefresh?.totalCells ?? 0) > 0
            && (probe?.partitionRefresh?.displaySetCalls ?? 0) >= (probe?.partitionRefresh?.totalCells ?? 1)
            && (probe?.partitionRefresh?.radarSetCalls ?? 0) >= (probe?.partitionRefresh?.totalCells ?? 1)
            && (probe?.partitionRefresh?.displayFoggedSetCalls ?? 0) > 0
            && (probe?.partitionRefresh?.radarFoggedSetCalls ?? 0) > 0
            && probe?.partitionRefresh?.displayClearCalls === 1
            && probe?.partitionRefresh?.radarClearCalls === 1
            && probe?.partitionRefresh?.beginRender === 0
            && probe?.partitionRefresh?.render === 0
            && probe?.partitionRefresh?.endRender === 0
            && probe?.renderFrames?.count === 3
            && probe?.renderFrames?.firstDrawIndexed >= 3
            && probe?.renderFrames?.shroudUpdateDrawIndexed >= 6
            && probe?.renderFrames?.partitionRefreshDrawIndexed >= 9
            && probe?.renderFrames?.firstClear >= 1
            && probe?.renderFrames?.shroudUpdateClear >= 2
            && probe?.renderFrames?.partitionRefreshClear >= 3
            && probe?.renderFrames?.shroudUpdateTextureUpdate > probe?.renderFrames?.firstTextureUpdate
            && probe?.renderFrames?.partitionRefreshTextureUpdate > probe?.renderFrames?.shroudUpdateTextureUpdate
            && drawHistory.length >= 9
            && baseTerrainIndices.length >= 3
            && blendTerrainIndices.length >= 3
            && shroudTerrainIndices.length >= 3
            && secondShroudAfterSecondTerrain
            && thirdShroudAfterThirdTerrain
            && isShroudTerrainPass(browserProbe));
        const ok = Boolean(probe.ok)
          && probe?.source === expectedSource
          && renderModeMatches
          && probe?.visual?.class === "W3DTerrainVisual"
          && probe?.visual?.loadPath?.includes("W3DTerrainVisual::load")
          && probe?.visual?.fullInit === fullInitMode
          && probe?.visual?.ownedTerrainRenderObject === true
          && probe?.visual?.waterRenderObjectNull === (fullInitMode ? fullSceneMissingWaterAssets : true)
          && (!fullInitMode
            || (probe?.results?.fullInitAttempted === fullSceneWaterInitialized
              && probe?.results?.visualInitCompleted === fullSceneWaterInitialized
              && probe?.results?.visualInitException === false
              && probe?.water?.iniEntry === "Data\\INI\\Water.ini"
              && probe?.water?.iniLoaded === true
              && probe?.water?.iniException === false
              && probe?.water?.waterSettingCount === 4
              && probe?.water?.assetsReady === fullSceneWaterInitialized
              && (fullSceneMissingWaterAssets
                ? ((probe?.water?.missingTextureCount ?? 0) > 0
                  && Boolean(probe?.water?.firstMissingTexture))
                : (probe?.water?.missingTextureCount === 0
                  && probe?.water?.renderObjectCreated === true
                  && probe?.water?.globalPointerMatches === true
                  && probe?.water?.sceneObjectAdded === true))))
          && probe?.results?.loadWindowRenderSelected === loadWindowMode
          && probe?.results?.patchReinitialized === !loadWindowMode
          && probe?.results?.cameraConfigured === true
          && probe?.results?.cameraPanRequested === cameraPanMode
          && probe?.ini?.loaded === true
          && probe?.ini?.entryExists === true
          && probe?.ini?.parsed === true
          && probe?.ini?.parser === "GameEngine/Common/INI.cpp::load + INITerrain.cpp"
          && probe?.ini?.originalIniParser === true
          && (probe?.ini?.terrainTypeCount ?? 0) > 0
          && probe?.archives?.maps?.loaded === true
          && probe?.archives?.terrain?.loaded === true
          && probe?.map?.entry === mapEntry
          && probe?.map?.entryExists === true
          && probe?.map?.entryOpenable === true
          && probe?.map?.streamOpen === true
          && probe?.map?.parsed === true
          && (probe?.map?.bytes ?? 0) > 0
          && (probe?.map?.width ?? 0) > 16
          && (probe?.map?.height ?? 0) > 16
          && (probe?.map?.heightChecksum ?? 0) > 0
          && probe?.scene?.renderPath?.includes("W3DDisplay::m_3DScene")
          && probe?.scene?.created === true
          && probe?.scene?.objectAddedByVisualLoad === true
          && probe?.scene?.path === "W3DDisplay::m_3DScene"
          && probe?.scene?.terrainClassId === 4
          && probe?.terrain?.tileSource === "shipped-map-heightmap"
          && probe?.terrain?.renderObject === (visualShroudMode
            ? "ProbeHeightMapRenderObjWithShroud"
            : "HeightMapRenderObjClass")
          && probe?.terrain?.verticesPerSide === expectedVerticesPerSide
          && probe?.terrain?.cellsPerSide === expectedCellsPerSide
          && (!loadWindowMode
            || (probe?.terrain?.renderWindowWidth === probe?.visual?.loadDrawWidth
              && probe?.terrain?.renderWindowHeight === probe?.visual?.loadDrawHeight
              && probe?.terrain?.renderOriginX === probe?.visual?.loadDrawOriginX
              && probe?.terrain?.renderOriginY === probe?.visual?.loadDrawOriginY))
          && (probe?.terrain?.tileDiagnostics?.sourceTilesLoaded ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.sourceTilesPositioned ?? 0) > 0
          && (!loadWindowMode
            ? (probe?.terrain?.tileDiagnostics?.patchCellsWithSource ?? 0) > 0
            : ((probe?.terrain?.tileDiagnostics?.patchCells ?? 0) === 16384
              && probe?.terrain?.tileDiagnostics?.patchCellsWithSource === 16384
              && probe?.terrain?.tileDiagnostics?.patchCellsMissingSource === 0))
          && (probe?.terrain?.patchHeightChecksum ?? 0) > 0
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && (!fullInitMode || (probe?.water?.polygonTriggerCount ?? 0) >= 0)
          && (fullInitMode || browserProbe?.usedPersistentBuffers === true)
          && (fullInitMode || browserProbe?.usedTransforms === true)
          && (fullInitMode || browserProbe?.vertexStride === 32)
          && (fullInitMode || browserProbe?.vertexLayout?.source === "fvf")
          && (fullInitMode || browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf)
          && (fullInitMode || (visualShroudMode ? isShroudTerrainPass(browserProbe) : browserProbe?.texture0?.sampled === true))
          && Array.isArray(drawHistory)
          && drawHistory.length >= 2
          && hasBaseTerrainPass
          && hasBlendTerrainPass
          && cameraPanProbeOk
          && visualShroudProbeOk
          && visualShroudUpdateProbeOk
          && fullInitShroudUpdateProbeOk
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && textureDelta.binds >= 1
          && textureDelta.samplerApplications >= 1
          && (screenshot?.coverage?.coloredPixelCount ?? 0) > 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          drawHistory,
          drawSequence: {
            baseTerrainIndex,
            blendTerrainIndex,
            shroudTerrainIndex,
            baseTerrainIndices,
            blendTerrainIndices,
            shroudTerrainIndices,
            shroudAfterTerrain,
            secondShroudAfterSecondTerrain,
            thirdShroudAfterThirdTerrain,
          },
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainBibBufferLifecycle":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D bib buffer lifecycle cannot run" };
        }
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const bufferBefore = harnessState.graphics.d3d8Buffers ?? {};
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainBibBufferLifecycle());
        const bufferAfter = harnessState.graphics.d3d8Buffers ?? {};
        const textureAfter = harnessState.graphics.d3d8Textures ?? {};
        const bufferDelta = {
          creates: (bufferAfter?.creates ?? 0) - (bufferBefore.creates ?? 0),
          updates: (bufferAfter?.updates ?? 0) - (bufferBefore.updates ?? 0),
          releases: (bufferAfter?.releases ?? 0) - (bufferBefore.releases ?? 0),
        };
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_terrain_bib_buffer_lifecycle_probe"
          && probe?.results?.globalDataReady === true
          && probe?.results?.init === 0
          && probe?.results?.setRenderDevice === 0
          && probe?.results?.bufferCreated === true
          && probe?.results?.initialized === true
          && probe?.results?.vertexBufferAllocated === true
          && probe?.results?.indexBufferAllocated === true
          && probe?.results?.normalTextureCreated === true
          && probe?.results?.highlightTextureCreated === true
          && probe?.results?.addBibInvoked === true
          && probe?.results?.removeHighlightingInvoked === true
          && probe?.results?.removeBibInvoked === true
          && probe?.results?.clearBibsInvoked === true
          && probe?.results?.freeBuffersInvoked === true
          && probe?.results?.vertexBufferReleased === true
          && probe?.results?.indexBufferReleased === true
          && probe?.bibs?.afterAdd === 1
          && probe?.bibs?.afterRemove === 1
          && probe?.bibs?.afterClear === 0
          && probe?.bibs?.changedAfterAdd === true
          && probe?.calls?.createVertexBuffer >= 1
          && probe?.calls?.createIndexBuffer >= 1
          && bufferDelta.creates >= 2
          && bufferDelta.releases >= 2
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && textureDelta.releases >= 1;
        return {
          ok,
          command,
          probe,
          bufferDelta,
          textureDelta,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainPropBufferRender":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D prop buffer render cannot run" };
        }
        const archivePath = String(payload.archivePath ?? "/assets/runtime/W3DZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime/TexturesZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          d3d8DrawHistory: [],
          lastD3D8DrawIndexed: null,
        };
        const bufferBefore = harnessState.graphics.d3d8Buffers ?? {};
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainPropBufferRender(
          archivePath,
          textureArchivePath,
        ));
        const bufferAfter = harnessState.graphics.d3d8Buffers ?? {};
        const textureAfter = harnessState.graphics.d3d8Textures ?? {};
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const screenshot = {
          ...snapshotCanvas(),
          coverage: sampleCanvasRegion({ left: 0, top: 0, right: canvas.width, bottom: canvas.height }, 8),
        };
        const bufferDelta = {
          creates: (bufferAfter?.creates ?? 0) - (bufferBefore.creates ?? 0),
          updates: (bufferAfter?.updates ?? 0) - (bufferBefore.updates ?? 0),
          releases: (bufferAfter?.releases ?? 0) - (bufferBefore.releases ?? 0),
        };
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_terrain_prop_buffer_render_probe"
          && probe?.results?.runtimeAssetSystemInstalled === true
          && probe?.results?.meshFileExists === true
          && probe?.results?.textureFileExists === true
          && probe?.results?.propRenderObjectCreated === true
          && probe?.results?.propRenderObjectClassId === 0
          && probe?.results?.propMeshNormalized === true
          && probe?.results?.propVisibleForCamera === true
          && probe?.props?.afterAdd === 1
          && probe?.props?.typesAfterAdd === 1
          && probe?.props?.afterClear === 0
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.usedPersistentBuffers === true
          && bufferDelta.creates >= 2
          && bufferDelta.updates >= 2
          && textureDelta.creates >= 1
          && textureDelta.updates >= 1
          && textureDelta.binds >= 1
          && (screenshot?.coverage?.coloredPixelCount ?? 0) > 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          bufferDelta,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainPropBufferScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D prop buffer scene cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "");
        const mapsArchivePath = String(payload.mapsArchivePath ?? payload.mapArchivePath ?? "");
        const terrainArchivePath = String(payload.terrainArchivePath ?? "");
        const mapEntry = String(payload.mapEntry ?? "Maps\\MD_GLA03\\MD_GLA03.map");
        const archivePath = String(payload.archivePath ?? "/assets/runtime/W3DZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime/TexturesZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          d3d8DrawHistory: [],
          d3d8DrawIndexedSequence: 0,
          lastD3D8DrawIndexed: null,
        };
        const bufferBefore = harnessState.graphics.d3d8Buffers ?? {};
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainPropBufferScene(
          iniArchivePath,
          mapsArchivePath,
          terrainArchivePath,
          archivePath,
          textureArchivePath,
        ));
        const bufferAfter = harnessState.graphics.d3d8Buffers ?? {};
        const textureAfter = harnessState.graphics.d3d8Textures ?? {};
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const drawHistory = Array.isArray(harnessState.graphics.d3d8DrawHistory)
          ? harnessState.graphics.d3d8DrawHistory
          : [];
        const screenshot = {
          ...snapshotCanvas(),
          coverage: sampleCanvasRegion({ left: 0, top: 0, right: canvas.width, bottom: canvas.height }, 8),
        };
        const bufferDelta = {
          creates: (bufferAfter?.creates ?? 0) - (bufferBefore.creates ?? 0),
          updates: (bufferAfter?.updates ?? 0) - (bufferBefore.updates ?? 0),
          releases: (bufferAfter?.releases ?? 0) - (bufferBefore.releases ?? 0),
        };
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const isBaseTerrainPass = (draw) =>
          draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 0
            && draw?.renderState?.textureStage0?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        const isBlendTerrainPass = (draw) =>
          draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 1
            && draw?.renderState?.textureStage0?.texCoordIndex === 1
            && draw?.texture0?.sampled === true;
        const isPropMeshPass = (draw) =>
          draw?.vertexShaderFvf === 594
            && draw?.vertexStride === 44
            && draw?.texture0?.sampled === true
            && draw?.renderState?.textureStage0?.colorOp === 4
            && draw?.renderState?.textureStage1?.colorOp === 1;
        const baseTerrainIndex = drawHistory.findIndex(isBaseTerrainPass);
        const blendTerrainIndex = drawHistory.findIndex(isBlendTerrainPass);
        const propMeshIndex = drawHistory.findIndex(isPropMeshPass);
        const propAfterTerrain = baseTerrainIndex >= 0
          && blendTerrainIndex >= 0
          && propMeshIndex > baseTerrainIndex
          && propMeshIndex > blendTerrainIndex;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_terrain_prop_buffer_scene_probe"
          && probe?.path?.includes("W3DPropBuffer::drawProps")
          && probe?.path?.includes("RTS3DScene::Flush")
          && probe?.asset?.model === "CINE_MOON"
          && probe?.results?.runtimeAssetSystemInstalled === true
          && probe?.results?.textureFileFactoryInstalled === true
          && probe?.results?.meshFileExists === true
          && probe?.results?.textureFileExists === true
          && probe?.results?.renderObjectInitialized === true
          && probe?.results?.propBufferInstalled === true
          && probe?.results?.propBufferInitialized === true
          && probe?.results?.addPropInvoked === true
          && probe?.results?.updateCenterInvoked === true
          && probe?.results?.propTypeCreated === true
          && probe?.results?.propRenderObjectCreated === true
          && probe?.results?.propRenderObjectClassId === 0
          && probe?.results?.propMeshNormalized === true
          && probe?.results?.sceneCreated === true
          && probe?.results?.sceneObjectAdded === true
          && probe?.results?.propVisibleAfterScene === true
          && probe?.results?.propSceneDrawFlushed === true
          && probe?.ini?.parsed === true
          && probe?.ini?.originalIniParser === true
          && (probe?.ini?.terrainTypeCount ?? 0) > 0
          && probe?.map?.entry === mapEntry
          && probe?.map?.parsed === true
          && (probe?.map?.bytes ?? 0) > 0
          && (probe?.map?.width ?? 0) > 16
          && (probe?.map?.height ?? 0) > 16
          && probe?.terrain?.tileSource === "shipped-map-heightmap"
          && probe?.terrain?.renderObject === "ProbeHeightMapRenderObjWithPropBuffer"
          && probe?.terrain?.verticesPerSide === 33
          && probe?.terrain?.cellsPerSide === 32
          && (probe?.terrain?.tileDiagnostics?.sourceTilesLoaded ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.sourceTilesPositioned ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.patchCellsWithSource ?? 0) > 0
          && probe?.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
          && probe?.scene?.renderPath?.includes("W3DPropBuffer::drawProps")
          && probe?.scene?.created === true
          && probe?.scene?.objectAdded === true
          && probe?.scene?.terrainClassId === 4
          && probe?.props?.afterAdd === 1
          && probe?.props?.typesAfterAdd === 1
          && probe?.props?.afterClear === 0
          && probe?.calls?.drawIndexed >= 3
          && probe?.draw?.vertexShaderFvf === 594
          && probe?.draw?.vertexStride === 44
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.ok === true
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexShaderFvf === 594
          && browserProbe?.vertexStride === 44
          && browserProbe?.texture0?.sampled === true
          && Array.isArray(drawHistory)
          && drawHistory.length >= 3
          && propAfterTerrain
          && bufferDelta.creates >= 4
          && bufferDelta.updates >= 4
          && textureDelta.creates >= 2
          && textureDelta.updates >= 2
          && textureDelta.binds >= 1
          && textureDelta.samplerApplications >= 1
          && (screenshot?.coverage?.coloredPixelCount ?? 0) > 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          drawHistory,
          drawSequence: {
            baseTerrainIndex,
            blendTerrainIndex,
            propMeshIndex,
            propAfterTerrain,
          },
          bufferDelta,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainTreeBufferScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D tree buffer scene cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "");
        const mapsArchivePath = String(payload.mapsArchivePath ?? payload.mapArchivePath ?? "");
        const terrainArchivePath = String(payload.terrainArchivePath ?? "");
        const runtimeArchiveDirectory = String(payload.runtimeArchiveDirectory ?? "/assets/runtime");
        const runtimeArchiveMask = String(payload.runtimeArchiveMask ?? "*.big");
        const mapEntry = String(payload.mapEntry ?? "Maps\\MD_GLA03\\MD_GLA03.map");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          d3d8DrawHistory: [],
          d3d8DrawIndexedSequence: 0,
          lastD3D8DrawIndexed: null,
        };
        const bufferBefore = harnessState.graphics.d3d8Buffers ?? {};
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainTreeBufferScene(
          iniArchivePath,
          mapsArchivePath,
          terrainArchivePath,
          runtimeArchiveDirectory,
          runtimeArchiveMask,
        ));
        const bufferAfter = harnessState.graphics.d3d8Buffers ?? {};
        const textureAfter = harnessState.graphics.d3d8Textures ?? {};
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const drawHistory = Array.isArray(harnessState.graphics.d3d8DrawHistory)
          ? harnessState.graphics.d3d8DrawHistory
          : [];
        const screenshot = {
          ...snapshotCanvas(),
          coverage: sampleCanvasRegion({ left: 0, top: 0, right: canvas.width, bottom: canvas.height }, 8),
        };
        const bufferDelta = {
          creates: (bufferAfter?.creates ?? 0) - (bufferBefore.creates ?? 0),
          updates: (bufferAfter?.updates ?? 0) - (bufferBefore.updates ?? 0),
          releases: (bufferAfter?.releases ?? 0) - (bufferBefore.releases ?? 0),
        };
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const treeFvf = D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_DIFFUSE | D3DFVF_TEX1;
        const isBaseTerrainPass = (draw) =>
          draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 0
            && draw?.renderState?.textureStage0?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        const isBlendTerrainPass = (draw) =>
          draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 1
            && draw?.renderState?.textureStage0?.texCoordIndex === 1
            && draw?.texture0?.sampled === true;
        const isTreePass = (draw) =>
          draw?.vertexShaderFvf === treeFvf
            && draw?.vertexStride === 36
            && draw?.renderState?.textureStage0?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        const baseTerrainIndex = drawHistory.findIndex(isBaseTerrainPass);
        const blendTerrainIndex = drawHistory.findIndex(isBlendTerrainPass);
        const treeIndex = drawHistory.findIndex(isTreePass);
        const treeAfterTerrain = baseTerrainIndex >= 0
          && blendTerrainIndex >= 0
          && treeIndex > baseTerrainIndex
          && treeIndex > blendTerrainIndex;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_terrain_tree_buffer_scene_probe"
          && probe?.path?.includes("W3DTreeBuffer::drawTrees")
          && probe?.path?.includes("DoTrees")
          && probe?.asset?.model === "PTDogwod01_S"
          && probe?.asset?.texture === "PTDogwod01_S.tga"
          && probe?.results?.runtimeAssetSystemInstalled === true
          && probe?.results?.textureFileFactoryInstalled === true
          && probe?.results?.modelsFileExists === true
          && probe?.results?.meshFileExists === true
          && probe?.results?.treeTextureFileExists === true
          && probe?.results?.materialTextureFileExists === true
          && probe?.results?.renderObjectInitialized === true
          && probe?.results?.treeBufferInstalled === true
          && probe?.results?.treeDataConfigured === true
          && probe?.results?.addTreeInvoked === true
          && probe?.results?.updateTreeInvoked === true
          && probe?.results?.updateCenterInvoked === true
          && probe?.results?.scriptEngineReady === true
          && probe?.results?.sceneCreated === true
          && probe?.results?.sceneObjectAdded === true
          && probe?.results?.treeSceneDrawFlushed === true
          && probe?.results?.treeNeedToDrawAfterScene === false
          && probe?.tree?.tilesAfterScene > 0
          && probe?.ini?.parsed === true
          && probe?.ini?.originalIniParser === true
          && (probe?.ini?.terrainTypeCount ?? 0) > 0
          && probe?.map?.entry === mapEntry
          && probe?.map?.parsed === true
          && (probe?.map?.bytes ?? 0) > 0
          && (probe?.map?.width ?? 0) > 16
          && (probe?.map?.height ?? 0) > 16
          && probe?.terrain?.tileSource === "shipped-map-heightmap"
          && probe?.terrain?.renderObject === "ProbeHeightMapRenderObjWithTreeBuffer"
          && probe?.terrain?.verticesPerSide === 33
          && probe?.terrain?.cellsPerSide === 32
          && (probe?.terrain?.tileDiagnostics?.sourceTilesLoaded ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.sourceTilesPositioned ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.patchCellsWithSource ?? 0) > 0
          && probe?.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
          && probe?.scene?.renderPath?.includes("W3DTreeBuffer::drawTrees")
          && probe?.scene?.renderPath?.includes("RTS3DScene::Flush")
          && probe?.scene?.created === true
          && probe?.scene?.objectAdded === true
          && probe?.scene?.terrainClassId === 4
          && probe?.calls?.drawIndexed >= 3
          && probe?.draw?.vertexShaderFvf === treeFvf
          && probe?.draw?.vertexStride === 36
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && (browserProbe?.vertexDiagnostics?.projected?.visible ?? 0) > 0
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexShaderFvf === treeFvf
          && browserProbe?.vertexStride === 36
          && browserProbe?.texture0?.sampled === true
          && Array.isArray(drawHistory)
          && drawHistory.length >= 3
          && treeAfterTerrain
          && bufferDelta.creates >= 4
          && bufferDelta.updates >= 4
          && textureDelta.creates >= 2
          && textureDelta.updates >= 2
          && textureDelta.binds >= 1
          && textureDelta.samplerApplications >= 1
          && (screenshot?.coverage?.coloredPixelCount ?? 0) > 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          drawHistory,
          drawSequence: {
            baseTerrainIndex,
            blendTerrainIndex,
            treeIndex,
            treeAfterTerrain,
          },
          bufferDelta,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainRoadBufferScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D road buffer scene cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "");
        const mapsArchivePath = String(payload.mapsArchivePath ?? payload.mapArchivePath ?? "");
        const terrainArchivePath = String(payload.terrainArchivePath ?? "");
        const runtimeArchiveDirectory = String(payload.runtimeArchiveDirectory ?? "/assets/runtime");
        const runtimeArchiveMask = String(payload.runtimeArchiveMask ?? "*.big");
        const mapEntry = String(payload.mapEntry ?? "Maps\\MD_CHI01\\MD_CHI01.map");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          d3d8DrawHistory: [],
          d3d8DrawIndexedSequence: 0,
          lastD3D8DrawIndexed: null,
        };
        const bufferBefore = harnessState.graphics.d3d8Buffers ?? {};
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainRoadBufferScene(
          iniArchivePath,
          mapsArchivePath,
          terrainArchivePath,
          runtimeArchiveDirectory,
          runtimeArchiveMask,
          mapEntry,
        ));
        const bufferAfter = harnessState.graphics.d3d8Buffers ?? {};
        const textureAfter = harnessState.graphics.d3d8Textures ?? {};
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const drawHistory = Array.isArray(harnessState.graphics.d3d8DrawHistory)
          ? harnessState.graphics.d3d8DrawHistory
          : [];
        const screenshot = {
          ...snapshotCanvas(),
          coverage: sampleCanvasRegion({ left: 0, top: 0, right: canvas.width, bottom: canvas.height }, 8),
        };
        const bufferDelta = {
          creates: (bufferAfter?.creates ?? 0) - (bufferBefore.creates ?? 0),
          updates: (bufferAfter?.updates ?? 0) - (bufferBefore.updates ?? 0),
          releases: (bufferAfter?.releases ?? 0) - (bufferBefore.releases ?? 0),
        };
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const roadFvf = D3DFVF_XYZ | D3DFVF_DIFFUSE | D3DFVF_TEX1;
        const isBaseTerrainPass = (draw) =>
          draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 0
            && draw?.renderState?.textureStage0?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        const isBlendTerrainPass = (draw) =>
          draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 1
            && draw?.renderState?.textureStage0?.texCoordIndex === 1
            && draw?.texture0?.sampled === true;
        const isRoadPass = (draw) =>
          draw?.vertexShaderFvf === roadFvf
            && draw?.vertexStride === 24
            && draw?.renderState?.textureStage0?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        const baseTerrainIndex = drawHistory.findIndex(isBaseTerrainPass);
        const blendTerrainIndex = drawHistory.findIndex(isBlendTerrainPass);
        const roadIndex = drawHistory.findIndex(isRoadPass);
        const roadAfterTerrain = baseTerrainIndex >= 0
          && blendTerrainIndex >= 0
          && roadIndex > baseTerrainIndex
          && roadIndex > blendTerrainIndex;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_terrain_road_buffer_scene_probe"
          && probe?.path?.includes("W3DRoadBuffer::drawRoads")
          && probe?.results?.runtimeAssetSystemInstalled === true
          && probe?.results?.textureFileFactoryInstalled === true
          && probe?.results?.renderObjectInitialized === true
          && probe?.results?.roadBufferInstalled === true
          && probe?.results?.roadBufferInitialized === true
          && probe?.results?.loadRoadsInvoked === true
          && probe?.results?.updateCenterInvoked === true
          && probe?.results?.sceneCreated === true
          && probe?.results?.sceneObjectAdded === true
          && probe?.results?.roadDrawInvoked === true
          && probe?.results?.roadSceneDrawFlushed === true
          && probe?.ini?.roadsParsed === true
          && probe?.ini?.originalIniParser === true
          && (probe?.ini?.roadCount ?? 0) > 0
          && probe?.map?.entry === mapEntry
          && probe?.map?.parsed === true
          && (probe?.map?.bytes ?? 0) > 0
          && probe?.terrain?.tileSource === "shipped-map-heightmap"
          && probe?.terrain?.renderObject === "ProbeHeightMapRenderObjWithRoadBuffer"
          && probe?.terrain?.verticesPerSide === 33
          && probe?.terrain?.cellsPerSide === 32
          && (probe?.terrain?.tileDiagnostics?.sourceTilesLoaded ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.sourceTilesPositioned ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.patchCellsWithSource ?? 0) > 0
          && probe?.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
          && probe?.scene?.renderPath?.includes("W3DRoadBuffer::drawRoads")
          && probe?.scene?.created === true
          && probe?.scene?.objectAdded === true
          && probe?.scene?.terrainClassId === 4
          && (probe?.roadObjects?.pairs ?? 0) > 0
          && (probe?.roadObjects?.pairsWithRoadType ?? 0) > 0
          && (probe?.roads?.afterLoad ?? 0) > 0
          && (probe?.roads?.segmentsWithVertices ?? 0) > 0
          && (probe?.roads?.typesWithDrawData ?? 0) > 0
          && (probe?.calls?.drawIndexed ?? 0) >= 3
          && probe?.draw?.vertexShaderFvf === roadFvf
          && probe?.draw?.vertexStride === 24
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && (browserProbe?.vertexDiagnostics?.projected?.visible ?? 0) > 0
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexShaderFvf === roadFvf
          && browserProbe?.vertexStride === 24
          && browserProbe?.texture0?.sampled === true
          && Array.isArray(drawHistory)
          && drawHistory.length >= 3
          && roadAfterTerrain
          && bufferDelta.creates >= 4
          && bufferDelta.updates >= 4
          && textureDelta.binds >= 1
          && textureDelta.samplerApplications >= 1
          && (screenshot?.coverage?.coloredPixelCount ?? 0) > 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          drawHistory,
          drawSequence: {
            baseTerrainIndex,
            blendTerrainIndex,
            roadIndex,
            roadAfterTerrain,
          },
          bufferDelta,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dTerrainBridgeBufferScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; W3D bridge buffer scene cannot render" };
        }
        const iniArchivePath = String(payload.iniArchivePath ?? "");
        const mapsArchivePath = String(payload.mapsArchivePath ?? payload.mapArchivePath ?? "");
        const terrainArchivePath = String(payload.terrainArchivePath ?? "");
        const runtimeArchiveDirectory = String(payload.runtimeArchiveDirectory ?? "/assets/runtime");
        const runtimeArchiveMask = String(payload.runtimeArchiveMask ?? "*.big");
        const mapEntry = String(payload.mapEntry ?? "Maps\\MD_CHI01\\MD_CHI01.map");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          d3d8DrawHistory: [],
          d3d8DrawIndexedSequence: 0,
          lastD3D8DrawIndexed: null,
        };
        const bufferBefore = harnessState.graphics.d3d8Buffers ?? {};
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DTerrainBridgeBufferScene(
          iniArchivePath,
          mapsArchivePath,
          terrainArchivePath,
          runtimeArchiveDirectory,
          runtimeArchiveMask,
          mapEntry,
        ));
        const bufferAfter = harnessState.graphics.d3d8Buffers ?? {};
        const textureAfter = harnessState.graphics.d3d8Textures ?? {};
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const drawHistory = Array.isArray(harnessState.graphics.d3d8DrawHistory)
          ? harnessState.graphics.d3d8DrawHistory
          : [];
        const screenshot = {
          ...snapshotCanvas(),
          coverage: sampleCanvasRegion({ left: 0, top: 0, right: canvas.width, bottom: canvas.height }, 8),
        };
        const bufferDelta = {
          creates: (bufferAfter?.creates ?? 0) - (bufferBefore.creates ?? 0),
          updates: (bufferAfter?.updates ?? 0) - (bufferBefore.updates ?? 0),
          releases: (bufferAfter?.releases ?? 0) - (bufferBefore.releases ?? 0),
        };
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const bridgeFvf = D3DFVF_XYZ | D3DFVF_NORMAL | D3DFVF_DIFFUSE | D3DFVF_TEX1;
        const roadFvf = D3DFVF_XYZ | D3DFVF_DIFFUSE | D3DFVF_TEX1;
        const textureStage0 = (draw) =>
          draw?.renderState?.textureStage0 ?? draw?.renderState?.textureStages?.[0] ?? {};
        const isBaseTerrainPass = (draw) =>
          draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 0
            && textureStage0(draw)?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        const isBlendTerrainPass = (draw) =>
          draw?.vertexShaderFvf === 578
            && draw?.vertexStride === 32
            && draw?.renderState?.alphaBlendEnable === 1
            && textureStage0(draw)?.texCoordIndex === 1
            && draw?.texture0?.sampled === true;
        const isBridgeBasePass = (draw) =>
          draw?.vertexShaderFvf === bridgeFvf
            && draw?.vertexStride === 36
            && textureStage0(draw)?.texCoordIndex === 0
            && draw?.texture0?.sampled === true;
        const isBridgeShroudPass = (draw) => {
          const stage0 = textureStage0(draw);
          return draw?.vertexShaderFvf === bridgeFvf
            && draw?.vertexStride === 36
            && draw?.renderState?.zFunc === D3DCMP_EQUAL
            && (stage0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
              || draw?.texture0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION)
            && (stage0?.textureTransformFlags === D3DTTFF_COUNT2
              || draw?.texture0?.textureTransformFlags === D3DTTFF_COUNT2)
            && draw?.texture0?.sampled === true;
        };
        const isRoadPass = (draw) =>
          draw?.vertexShaderFvf === roadFvf
            && draw?.vertexStride === 24
            && draw?.texture0?.sampled === true;
        const baseTerrainIndex = drawHistory.findIndex(isBaseTerrainPass);
        const blendTerrainIndex = drawHistory.findIndex(isBlendTerrainPass);
        const roadIndex = drawHistory.findIndex(isRoadPass);
        const bridgeIndex = drawHistory.findIndex(isBridgeBasePass);
        const bridgeShroudIndex = drawHistory.findIndex(isBridgeShroudPass);
        const roadAfterTerrain = baseTerrainIndex >= 0
          && blendTerrainIndex >= 0
          && roadIndex > baseTerrainIndex
          && roadIndex > blendTerrainIndex;
        const bridgeAfterTerrain = baseTerrainIndex >= 0
          && blendTerrainIndex >= 0
          && bridgeIndex > baseTerrainIndex
          && bridgeIndex > blendTerrainIndex;
        const bridgeShroudAfterBridge = bridgeAfterTerrain
          && bridgeShroudIndex > bridgeIndex;
        const ok = Boolean(probe.ok)
          && probe?.source === "ww3d_terrain_bridge_buffer_scene_probe"
          && probe?.path?.includes("W3DBridgeBuffer::")
          && probe?.results?.runtimeAssetSystemInstalled === true
          && probe?.results?.textureFileFactoryInstalled === true
          && probe?.results?.modelsFileExists === true
          && probe?.results?.meshFileExists === true
          && probe?.results?.treeTextureFileExists === true
          && probe?.results?.materialTextureFileExists === true
          && probe?.results?.renderObjectInitialized === true
          && probe?.results?.roadBufferInstalled === true
          && probe?.results?.roadBufferInitialized === true
          && probe?.results?.loadRoadsInvoked === true
          && probe?.results?.roadDrawInvoked === true
          && (probe?.results?.roadDrawCallDelta ?? 0) > 0
          && probe?.results?.roadSceneDrawFlushed === true
          && probe?.results?.treeBufferInstalled === true
          && probe?.results?.treeDataConfigured === true
          && probe?.results?.addTreeInvoked === true
          && probe?.results?.updateTreeInvoked === true
          && probe?.results?.treeNeedToDrawAfterScene === false
          && probe?.results?.treeDrawInvoked === true
          && (probe?.results?.treeDrawCallDelta ?? 0) > 0
          && probe?.results?.treeSceneDrawFlushed === true
          && probe?.results?.scriptEngineReady === true
          && probe?.results?.bridgeBufferInstalled === true
          && probe?.results?.bridgeBufferInitialized === true
          && probe?.results?.loadBridgesInvoked === true
          && probe?.results?.updateCenterInvoked === true
          && probe?.results?.terrainLogicInstalledForDraw === true
          && probe?.results?.terrainLogicRetainedForDraw === true
          && probe?.results?.bridgeLogicSeedInfoAvailable === true
          && probe?.results?.bridgeLogicSeededForDraw === true
          && (probe?.results?.bridgeLogicCountAfterSeed ?? 0) > 0
          && probe?.results?.bridgeLogicFirstIndexAfterSeed === 0
          && probe?.results?.bridgeLogicAiPathfinderAvailable === true
          && probe?.results?.bridgeLogicFirstLayerAfterSeed === 2
          && probe?.logicalTerrain?.selectedTemplateSubstitutedInLogicalList === false
          && (probe?.results?.bridgeDrawTerrainLogicBridgeCount ?? 0) > 0
          && (probe?.results?.bridgeDrawEnabledBridgeCount ?? 0) > 0
          && probe?.results?.sceneCreated === true
          && probe?.results?.sceneObjectAdded === true
          && probe?.results?.bridgeDrawWrapperInvoked === true
          && probe?.results?.bridgeDrawWrapperWireframe === false
          && probe?.results?.bridgeTerrainRenderObjectPinned === true
          && probe?.results?.bridgeShroudOverlaySuppressed === false
          && probe?.results?.bridgeShroudTextureReady === true
          && probe?.results?.bridgeShroudDrawSeen === true
          && (probe?.results?.bridgeDrawCallDelta ?? 0) >= 2
          && probe?.results?.bridgeSceneDrawFlushed === true
          && probe?.ini?.roadsParsed === true
          && probe?.ini?.originalIniParser === true
          && (probe?.ini?.bridgeCount ?? 0) > 0
          && probe?.map?.entry === mapEntry
          && probe?.map?.parsed === true
          && (probe?.map?.bytes ?? 0) > 0
          && probe?.terrain?.tileSource === "shipped-map-heightmap"
          && probe?.terrain?.renderObject === "ProbeHeightMapRenderObjWithBridgeBuffer"
          && probe?.terrain?.verticesPerSide === 33
          && probe?.terrain?.cellsPerSide === 32
          && (probe?.terrain?.tileDiagnostics?.sourceTilesLoaded ?? 0) > 0
          && (probe?.terrain?.tileDiagnostics?.sourceTilesPositioned ?? 0) > 0
          && probe?.terrain?.tileDiagnostics?.patchCells === 1024
          && probe?.terrain?.tileDiagnostics?.patchCellsWithSource === 1024
          && probe?.terrain?.tileDiagnostics?.patchCellsMissingSource === 0
          && probe?.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
          && probe?.scene?.renderPath?.includes("W3DRoadBuffer::drawRoads")
          && probe?.scene?.renderPath?.includes("BaseHeightMapRenderObjClass::renderTrees")
          && probe?.scene?.renderPath?.includes("W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic)")
          && probe?.scene?.renderPath?.includes("W3DBridge::renderBridge")
          && probe?.scene?.created === true
          && probe?.scene?.objectAdded === true
          && probe?.scene?.terrainClassId === 4
          && (probe?.bridgeObjects?.pairs ?? 0) > 0
          && (probe?.bridgeObjects?.pairsWithBridgeType ?? 0) > 0
          && probe?.bridgeObjects?.templateSubstitutedForAvailableAssets === false
          && probe?.bridgeObjects?.selectedTemplateSubstitutedInLogicalList === false
          && probe?.bridgeObjects?.selectedOriginalName === probe?.bridgeObjects?.selectedInstalledName
          && (probe?.bridgeObjects?.candidatesWithAssetsAndSource ?? 0) > 0
          && probe?.bridgeObjects?.selectedPatchSourceCells === 1024
          && probe?.bridgeObjects?.selectedModelAvailable === true
          && probe?.bridgeObjects?.selectedTextureAvailable === true
          && (probe?.bridges?.afterLoad ?? 0) > 0
          && (probe?.bridges?.verticesAfterUpdate ?? 0) > 0
          && (probe?.bridges?.indicesAfterUpdate ?? 0) > 0
          && (probe?.roads?.afterLoad ?? 0) > 0
          && (probe?.roads?.segmentsWithVertices ?? 0) > 0
          && (probe?.roads?.typesWithDrawData ?? 0) > 0
          && (probe?.roads?.totalTypeVertices ?? 0) > 0
          && (probe?.roads?.totalTypeIndices ?? 0) > 0
          && probe?.tree?.model === "PTDogwod01_S"
          && probe?.tree?.texture === "PTDogwod01_S.tga"
          && (probe?.tree?.tilesAfterScene ?? 0) > 0
          && (probe?.calls?.drawIndexed ?? 0) >= 3
          && probe?.draw?.vertexShaderFvf === bridgeFvf
          && probe?.draw?.vertexStride === 36
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && (browserProbe?.vertexDiagnostics?.projected?.visible ?? 0) > 0
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexShaderFvf === bridgeFvf
          && browserProbe?.vertexStride === 36
          && isBridgeShroudPass(browserProbe)
          && Array.isArray(drawHistory)
          && drawHistory.length >= 4
          && roadAfterTerrain
          && bridgeAfterTerrain
          && bridgeShroudAfterBridge
          && bufferDelta.creates >= 4
          && bufferDelta.updates >= 4
          && textureDelta.binds >= 1
          && textureDelta.samplerApplications >= 1
          && (screenshot?.coverage?.coloredPixelCount ?? 0) > 0;
        return {
          ok,
          command,
          probe,
          browserProbe,
          drawHistory,
          drawSequence: {
            baseTerrainIndex,
            blendTerrainIndex,
            roadIndex,
            bridgeIndex,
            bridgeShroudIndex,
            roadAfterTerrain,
            bridgeAfterTerrain,
            bridgeShroudAfterBridge,
          },
          bufferDelta,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dShippedMesh":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; shipped WW3D mesh cannot render" };
        }
        const archivePath = String(payload.archivePath ?? "/assets/runtime/W3DZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime/TexturesZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DShippedMesh(
          archivePath,
          textureArchivePath,
        ));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.id === probe?.texture?.id
          && pixelHasColor(browserProbe.centerPixel, 16)
          && pixelHasColor(screenshot.centerPixel, 16)
          && !pixelLooksRed(browserProbe.centerPixel)
          && !pixelLooksRed(screenshot.centerPixel);
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dShippedMultiTextureMesh":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; shipped WW3D multi-texture mesh cannot render" };
        }
        const archivePath = String(payload.archivePath ?? "/assets/runtime/W3DZH.big");
        const textureArchivePath = String(payload.textureArchivePath ?? "/assets/runtime/TexturesZH.big");
        clearCanvas({ rgba: [0, 0, 0, 255] });
        harnessState.graphics = {
          ...harnessState.graphics,
          lastD3D8DrawIndexed: null,
        };
        const textureBefore = harnessState.graphics.d3d8Textures ?? {};
        const probe = parseModuleState(wasmModule.probeWW3DShippedMultiTextureMesh(
          archivePath,
          textureArchivePath,
        ));
        const textureAfter = harnessState.graphics.d3d8Textures ?? null;
        const screenshot = snapshotCanvas();
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const textureDelta = {
          creates: (textureAfter?.creates ?? 0) - (textureBefore.creates ?? 0),
          updates: (textureAfter?.updates ?? 0) - (textureBefore.updates ?? 0),
          binds: (textureAfter?.binds ?? 0) - (textureBefore.binds ?? 0),
          releaseUnbinds: (textureAfter?.releaseUnbinds ?? 0) - (textureBefore.releaseUnbinds ?? 0),
          releases: (textureAfter?.releases ?? 0) - (textureBefore.releases ?? 0),
          samplerApplications: (textureAfter?.samplerApplications ?? 0) -
            (textureBefore.samplerApplications ?? 0),
        };
        const boundTexture0 = Number(browserProbe?.boundTextures?.["0"] ?? 0) >>> 0;
        const boundTexture1 = Number(browserProbe?.boundTextures?.["1"] ?? 0) >>> 0;
        const ok = Boolean(probe.ok)
          && Boolean(browserProbe?.ok)
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && browserProbe?.usedTransforms === true
          && browserProbe?.vertexShaderFvf === probe?.draw?.vertexShaderFvf
          && browserProbe?.vertexShaderFvf !== 0
          && browserProbe?.vertexLayout?.source === "fvf"
          && browserProbe?.texture0?.ready === true
          && browserProbe?.texture0?.sampled === true
          && browserProbe?.texture0?.texCoordSet === 0
          && browserProbe?.texture0?.texCoordSupported === true
          && browserProbe?.texture0?.combiner?.textureAvailable === true
          && browserProbe?.texture0?.combiner?.supported === true
          && browserProbe?.texture1?.ready === true
          && browserProbe?.texture1?.sampled === true
          && browserProbe?.texture1?.texCoordSet === 1
          && browserProbe?.texture1?.texCoordSupported === true
          && browserProbe?.texture1?.combiner?.textureAvailable === true
          && browserProbe?.texture1?.combiner?.supported === true
          && browserProbe?.stage1Combiner?.textureAvailable === true
          && browserProbe?.stage1Combiner?.supported === true
          && boundTexture0 !== 0
          && boundTexture1 !== 0
          && boundTexture0 !== boundTexture1
          && pixelHasColor(browserProbe.centerPixel, 8)
          && pixelHasColor(screenshot.centerPixel, 8)
          && textureDelta.creates >= 2
          && textureDelta.updates >=
            ((probe?.textures?.[0]?.levels ?? 0) + (probe?.textures?.[1]?.levels ?? 0))
          && textureDelta.binds >= 2;
        return {
          ok,
          command,
          probe,
          browserProbe,
          textureDelta,
          textureProbe: textureAfter,
          screenshot,
          state: snapshotState(),
        };
      }
    case "ww3dSourceAssetLoad":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D source asset cannot load" };
        }
        const probe = parseModuleState(wasmModule.probeWW3DSourceAssetLoad());
        return {
          ok: Boolean(probe.ok),
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "wwshadeCubeMapApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WWShade cubemap apply cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeWWShadeCubeMapApply());
        const ok = Boolean(probe.ok)
          && probe?.source === "wwshade_cubemap_apply_probe"
          && probe?.textureStages?.stage0?.texCoordIndex === D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR
          && probe?.textureStages?.stage0?.colorArg1 === D3DTA_TEXTURE
          && probe?.textureStages?.stage0?.colorOp === D3DTOP_MODULATE
          && probe?.textureStages?.stage0?.colorArg2 === D3DTA_DIFFUSE
          && probe?.textureStages?.stage0?.alphaOp === D3DTOP_MODULATE
          && probe?.textureStages?.stage1?.colorOp === D3DTOP_DISABLE
          && probe?.textureStages?.stage1?.alphaOp === D3DTOP_DISABLE
          && probe?.renderState?.lighting === 1
          && probe?.renderState?.specularEnable === 1
          && probe?.renderState?.ambientMaterialSource === D3DMCS_MATERIAL
          && probe?.renderState?.diffuseMaterialSource === D3DMCS_MATERIAL
          && probe?.renderState?.specularMaterialSource === D3DMCS_MATERIAL
          && probe?.renderState?.emissiveMaterialSource === D3DMCS_MATERIAL
          && probe?.vertexShader?.fvf === probe?.vertexShader?.expected
          && probe?.material?.ok === true
          && (probe?.callDeltas?.textureStageState ?? 0) >= 7
          && (probe?.callDeltas?.renderState ?? 0) >= 6
          && probe?.callDeltas?.vertexShader === 1
          && probe?.callDeltas?.material === 1;
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "launchWebBrowserProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; LaunchWebBrowser bridge cannot run" };
        }
        const before = window.__cncLaunchWebBrowserLast ?? null;
        const probe = parseModuleState(wasmModule.probeLaunchWebBrowser());
        const last = window.__cncLaunchWebBrowserLast ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "GeneralsMD original WWLib LaunchWeb.cpp"
          && probe?.bridge === "window.open"
          && probe?.nullUrl === false
          && probe?.emptyUrl === false
          && probe?.browserLaunch === true
          && last?.url === probe.browserUrl
          && last?.target === "_blank"
          && last?.features === "noopener"
          && last?.opened === true;
        return {
          ok,
          command,
          probe,
          launchWeb: { before, last },
          state: snapshotState(),
        };
      }
    case "urlLaunchProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; URLLaunch bridge cannot run" };
        }
        const before = window.__cncURLLaunchLast ?? null;
        const probe = parseModuleState(wasmModule.probeURLLaunch());
        const last = window.__cncURLLaunchLast ?? null;
        const ok = Boolean(probe.ok)
          && probe?.source === "GeneralsMD original Common/Audio/urllaunch.cpp"
          && probe?.bridge === "window.open"
          && probe?.escaped === true
          && probe?.nullLaunchFailed === true
          && probe?.browserLaunch === true
          && last?.url === probe.browserURL
          && last?.target === "_blank"
          && last?.features === "noopener"
          && last?.opened === true;
        return {
          ok,
          command,
          probe,
          urlLaunch: { before, last },
          state: snapshotState(),
        };
      }
    case "matrixMapperApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; MatrixMapper apply cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeMatrixMapperApply());
        const ok = Boolean(probe.ok)
          && probe?.source === "matrixmapper_apply_probe"
          && probe?.results?.applyCalled === true
          && probe?.results?.stage === 1
          && probe?.textureStage?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
          && probe?.textureStage?.textureTransformFlags === (D3DTTFF_PROJECTED | D3DTTFF_COUNT3)
          && probe?.transform?.state === probe?.transform?.expectedState
          && probe?.transform?.perspectiveRowsOk === true
          && probe?.transform?.row0Ok === true
          && probe?.transform?.row1Ok === true
          && probe?.transform?.row2FromRow3Ok === true
          && probe?.callDeltas?.transform === 1
          && probe?.callDeltas?.textureStageState === 2;
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "classicEnvironmentMapperApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; ClassicEnvironmentMapper apply cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeClassicEnvironmentMapperApply());
        const ok = Boolean(probe.ok)
          && probe?.source === "classic_environment_mapper_apply_probe"
          && probe?.results?.applyCalled === true
          && probe?.results?.stage === 1
          && probe?.textureStage?.texCoordIndex === D3DTSS_TCI_CAMERASPACENORMAL
          && probe?.textureStage?.textureTransformFlags === D3DTTFF_COUNT2
          && probe?.transform?.state === probe?.transform?.expectedState
          && probe?.transform?.rowsOk === true
          && probe?.transform?.row0Ok === true
          && probe?.transform?.row1Ok === true
          && probe?.transform?.row2Ok === true
          && probe?.transform?.row3Ok === true
          && probe?.callDeltas?.transform === 1
          && probe?.callDeltas?.textureStageState === 2;
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "edgeMapperApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; EdgeMapper apply cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeEdgeMapperApply());
        const normal = probe?.cases?.normal;
        const reflect = probe?.cases?.reflect;
        const caseOk = (edgeCase, expectedStage, expectedTexCoord) =>
          edgeCase?.ok === true
          && edgeCase?.stage === expectedStage
          && edgeCase?.mapperCreated === true
          && edgeCase?.mapperIdOk === true
          && edgeCase?.needsNormalsOk === true
          && edgeCase?.timeVariantOk === true
          && edgeCase?.applyCalled === true
          && edgeCase?.texCoordIndex === expectedTexCoord
          && edgeCase?.textureTransformFlags === D3DTTFF_COUNT2
          && edgeCase?.transform?.state === edgeCase?.transform?.expectedState
          && edgeCase?.transform?.rowsOk === true
          && edgeCase?.transform?.row0Ok === true
          && edgeCase?.transform?.row1Ok === true
          && edgeCase?.transform?.row2Ok === true
          && edgeCase?.transform?.row3Ok === true
          && edgeCase?.callDeltas?.transform === 1
          && edgeCase?.callDeltas?.textureStageState === 2;
        const ok = Boolean(probe.ok)
          && probe?.source === "edge_mapper_apply_probe"
          && caseOk(normal, 1, D3DTSS_TCI_CAMERASPACENORMAL)
          && caseOk(reflect, 1, D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR);
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "environmentMapperApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; EnvironmentMapper apply cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeEnvironmentMapperApply());
        const ok = Boolean(probe.ok)
          && probe?.source === "environment_mapper_apply_probe"
          && probe?.results?.applyCalled === true
          && probe?.results?.stage === 1
          && probe?.textureStage?.texCoordIndex === D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR
          && probe?.textureStage?.textureTransformFlags === D3DTTFF_COUNT2
          && probe?.transform?.state === probe?.transform?.expectedState
          && probe?.transform?.rowsOk === true
          && probe?.transform?.row0Ok === true
          && probe?.transform?.row1Ok === true
          && probe?.transform?.row2Ok === true
          && probe?.transform?.row3Ok === true
          && probe?.callDeltas?.transform === 1
          && probe?.callDeltas?.textureStageState === 2;
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "screenMapperApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; ScreenMapper apply cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeScreenMapperApply());
        const ok = Boolean(probe.ok)
          && probe?.source === "screen_mapper_apply_probe"
          && probe?.results?.applyCalled === true
          && probe?.results?.stage === 1
          && probe?.results?.mapperIdOk === true
          && probe?.textureStage?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
          && probe?.textureStage?.textureTransformFlags === (D3DTTFF_PROJECTED | D3DTTFF_COUNT3)
          && probe?.transform?.state === probe?.transform?.expectedState
          && probe?.transform?.rowsOk === true
          && probe?.transform?.row0Ok === true
          && probe?.transform?.row1Ok === true
          && probe?.transform?.row2Ok === true
          && probe?.transform?.row3Ok === true
          && probe?.callDeltas?.transform === 1
          && probe?.callDeltas?.textureStageState === 2;
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "projectionStateApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; projection state apply cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeProjectionStateApply());
        const terrain = probe?.cases?.terrain;
        const water = probe?.cases?.water;
        const caseOk = (projectionCase, expectedStage, expectedState) =>
          projectionCase?.ok === true
          && projectionCase?.stage === expectedStage
          && projectionCase?.texCoordIndex === D3DTSS_TCI_CAMERASPACEPOSITION
          && projectionCase?.textureTransformFlags === D3DTTFF_COUNT2
          && projectionCase?.addressU === D3DTADDRESS_WRAP
          && projectionCase?.addressV === D3DTADDRESS_WRAP
          && projectionCase?.transform?.state === expectedState
          && projectionCase?.transform?.state === projectionCase?.transform?.expectedState
          && projectionCase?.transform?.rowsOk === true
          && projectionCase?.transform?.row0Ok === true
          && projectionCase?.transform?.row1Ok === true
          && projectionCase?.transform?.row2Ok === true
          && projectionCase?.transform?.row3Ok === true
          && projectionCase?.callDeltas?.transform === 1
          && projectionCase?.callDeltas?.textureStageState === 4;
        const ok = Boolean(probe.ok)
          && probe?.source === "projection_state_apply_probe"
          && caseOk(terrain, 0, 16)
          && caseOk(water, 2, 18);
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "gridEnvironmentMapperApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; grid environment mapper apply cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeGridEnvironmentMapperApply());
        const classic = probe?.cases?.classic;
        const reflection = probe?.cases?.reflection;
        const caseOk = (
          gridCase,
          expectedClass,
          expectedStage,
          expectedOffset,
          expectedTexCoord,
        ) =>
          gridCase?.ok === true
          && gridCase?.class === expectedClass
          && gridCase?.stage === expectedStage
          && gridCase?.gridWidthLog2 === 2
          && gridCase?.lastFrame === 16
          && gridCase?.offset === expectedOffset
          && gridCase?.mapperCreated === true
          && gridCase?.mapperIdOk === true
          && gridCase?.needsNormalsOk === true
          && gridCase?.timeVariantOk === true
          && gridCase?.stageOk === true
          && gridCase?.applyCalled === true
          && gridCase?.texCoordIndex === expectedTexCoord
          && gridCase?.textureTransformFlags === D3DTTFF_COUNT2
          && gridCase?.transform?.state === gridCase?.transform?.expectedState
          && gridCase?.transform?.rowsOk === true
          && gridCase?.transform?.row0Ok === true
          && gridCase?.transform?.row1Ok === true
          && gridCase?.transform?.row2Ok === true
          && gridCase?.transform?.row3Ok === true
          && gridCase?.callDeltas?.transform === 1
          && gridCase?.callDeltas?.textureStageState === 2;
        const ok = Boolean(probe.ok)
          && probe?.source === "grid_environment_mapper_apply_probe"
          && caseOk(
            classic,
            "GridClassicEnvironmentMapperClass",
            1,
            5,
            D3DTSS_TCI_CAMERASPACENORMAL,
          )
          && caseOk(
            reflection,
            "GridEnvironmentMapperClass",
            1,
            10,
            D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
          );
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "gridWSEnvironmentMapperApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; grid WS environment mapper apply cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeGridWSEnvironmentMapperApply());
        const classic = probe?.cases?.classic;
        const reflection = probe?.cases?.reflection;
        const caseOk = (
          gridWsCase,
          expectedClass,
          expectedAxis,
          expectedStage,
          expectedOffset,
          expectedTexCoord,
        ) =>
          gridWsCase?.ok === true
          && gridWsCase?.class === expectedClass
          && gridWsCase?.axis === expectedAxis
          && gridWsCase?.stage === expectedStage
          && gridWsCase?.gridWidthLog2 === 2
          && gridWsCase?.lastFrame === 16
          && gridWsCase?.offset === expectedOffset
          && gridWsCase?.mapperCreated === true
          && gridWsCase?.mapperIdOk === true
          && gridWsCase?.needsNormalsOk === true
          && gridWsCase?.timeVariantOk === true
          && gridWsCase?.stageOk === true
          && gridWsCase?.viewInfluencedOk === true
          && gridWsCase?.applyCalled === true
          && gridWsCase?.texCoordIndex === expectedTexCoord
          && gridWsCase?.textureTransformFlags === D3DTTFF_COUNT2
          && gridWsCase?.transform?.state === gridWsCase?.transform?.expectedState
          && gridWsCase?.transform?.rowsOk === true
          && gridWsCase?.transform?.row0Ok === true
          && gridWsCase?.transform?.row1Ok === true
          && gridWsCase?.transform?.row2Ok === true
          && gridWsCase?.transform?.row3Ok === true
          && gridWsCase?.callDeltas?.transform === 1
          && gridWsCase?.callDeltas?.textureStageState === 2;
        const ok = Boolean(probe.ok)
          && probe?.source === "grid_ws_environment_mapper_apply_probe"
          && caseOk(
            classic,
            "GridWSClassicEnvironmentMapperClass",
            "X",
            1,
            5,
            D3DTSS_TCI_CAMERASPACENORMAL,
          )
          && caseOk(
            reflection,
            "GridWSEnvironmentMapperClass",
            "Y",
            1,
            10,
            D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR,
          );
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "wsEnvironmentMapperApply":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return {
            ok: false,
            command,
            error: "Wasm module unavailable; WS environment mapper apply cannot run",
          };
        }
        const probe = parseModuleState(wasmModule.probeWSEnvironmentMapperApply());
        const classic = probe?.cases?.classic;
        const reflection = probe?.cases?.reflection;
        const caseOk = (wsCase, expectedStage, expectedTexCoord) =>
          wsCase?.ok === true
          && wsCase?.stage === expectedStage
          && wsCase?.mapperCreated === true
          && wsCase?.mapperIdOk === true
          && wsCase?.needsNormalsOk === true
          && wsCase?.timeVariantOk === true
          && wsCase?.stageOk === true
          && wsCase?.viewInfluencedOk === true
          && wsCase?.applyCalled === true
          && wsCase?.texCoordIndex === expectedTexCoord
          && wsCase?.textureTransformFlags === D3DTTFF_COUNT2
          && wsCase?.transform?.state === wsCase?.transform?.expectedState
          && wsCase?.transform?.rowsOk === true
          && wsCase?.transform?.row0Ok === true
          && wsCase?.transform?.row1Ok === true
          && wsCase?.transform?.row2Ok === true
          && wsCase?.transform?.row3Ok === true
          && wsCase?.callDeltas?.transform === 1
          && wsCase?.callDeltas?.textureStageState === 2;
        const ok = Boolean(probe.ok)
          && probe?.source === "ws_environment_mapper_apply_probe"
          && classic?.class === "WSClassicEnvironmentMapperClass"
          && classic?.axis === "X"
          && reflection?.class === "WSEnvironmentMapperClass"
          && reflection?.axis === "Y"
          && caseOk(classic, 1, D3DTSS_TCI_CAMERASPACENORMAL)
          && caseOk(reflection, 1, D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR);
        return {
          ok,
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "screenshot":
      return { ok: true, command, screenshot: snapshotCanvas() };
    case "browserNetworkRelayProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser network relay cannot run" };
        }
        resetBrowserNetworkRelayRuntime();
        let buildProbe = null;
        let relayEvent = null;
        let receiveProbe = null;
        try {
          buildProbe = parseModuleState(wasmModule.buildBrowserNetworkRelayPacket());
          relayEvent = relayBrowserNetworkPacket(buildProbe);
          receiveProbe = parseModuleState(wasmModule.acceptBrowserNetworkRelayPacket(relayEvent.packetHex));
          if (receiveProbe?.ok) {
            browserNetworkRelayRuntime.received += 1;
            browserNetworkRelayRuntime.eventLog.push({
              phase: "wasm-receive",
              client: relayEvent.to,
              parser: receiveProbe.originalParser,
              bytes: receiveProbe.packet?.bytes,
            });
            browserNetworkRelayRuntime.lastError = null;
          } else {
            browserNetworkRelayRuntime.lastError = "original NetPacket receive probe failed";
          }
        } catch (error) {
          browserNetworkRelayRuntime.lastError = error?.message ?? String(error);
        }
        const runtime = summarizeBrowserNetworkRelayRuntime();
        const buildPacket = buildProbe?.packet ?? {};
        const receivePacket = receiveProbe?.packet ?? {};
        const packetMatches = Boolean(buildProbe?.ok)
          && Boolean(receiveProbe?.ok)
          && runtime.sent === 1
          && runtime.delivered === 1
          && runtime.received === 1
          && runtime.bytes === buildPacket.bytes
          && buildPacket.bytes === receivePacket.bytes
          && buildPacket.commandType === "NETCOMMANDTYPE_FRAMEINFO"
          && receivePacket.commandType === buildPacket.commandType
          && receivePacket.relay === buildPacket.relay
          && receivePacket.executionFrame === buildPacket.executionFrame
          && receivePacket.playerId === buildPacket.playerId
          && receivePacket.commandId === buildPacket.commandId
          && receivePacket.frameCommandCount === buildPacket.frameCommandCount;
        return {
          ok: packetMatches,
          command,
          buildProbe,
          relayEvent,
          receiveProbe,
          browserNetworkRelayRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "browserNetworkTransportRelayProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser network transport relay cannot run" };
        }
        resetBrowserNetworkTransportRuntime();
        let buildProbe = null;
        let relayEvent = null;
        let receiveProbe = null;
        try {
          buildProbe = parseModuleState(wasmModule.buildBrowserNetworkTransportPacket());
          relayEvent = relayBrowserNetworkPacket(buildProbe, browserNetworkTransportRuntime);
          receiveProbe = parseModuleState(wasmModule.acceptBrowserNetworkTransportPacket(relayEvent.packetHex));
          if (receiveProbe?.ok) {
            browserNetworkTransportRuntime.received += 1;
            browserNetworkTransportRuntime.transportInjected = receiveProbe.transport?.injected === true;
            browserNetworkTransportRuntime.connectionManagerDriven =
              receiveProbe.connectionManager?.doRelayDriven === true;
            browserNetworkTransportRuntime.frameDataReady = receiveProbe.frameData?.ready === true
              && receiveProbe.frameData?.managerReady === true;
            browserNetworkTransportRuntime.eventLog.push(
              {
                phase: "wasm-transport-inject",
                client: relayEvent.to,
                transport: receiveProbe.originalTransport,
                bytes: receiveProbe.packet?.bytes,
              },
              {
                phase: "connection-manager-relay",
                relay: receiveProbe.originalRelay,
                frame: receiveProbe.packet?.executionFrame,
              },
              {
                phase: "frame-data-ready",
                frameData: receiveProbe.originalFrameData,
                readyState: receiveProbe.frameData?.readyState,
                commandCount: receiveProbe.frameData?.commandCount,
              },
            );
            browserNetworkTransportRuntime.lastError = null;
          } else {
            browserNetworkTransportRuntime.lastError = "original Transport/FrameData receive probe failed";
          }
        } catch (error) {
          browserNetworkTransportRuntime.lastError = error?.message ?? String(error);
        }
        const runtime = summarizeBrowserNetworkTransportRuntime();
        const buildPacket = buildProbe?.packet ?? {};
        const receivePacket = receiveProbe?.packet ?? {};
        const packetMatches = Boolean(buildProbe?.ok)
          && Boolean(receiveProbe?.ok)
          && runtime.sent === 1
          && runtime.delivered === 1
          && runtime.received === 1
          && runtime.transportInjected === true
          && runtime.connectionManagerDriven === true
          && runtime.frameDataReady === true
          && runtime.bytes === buildPacket.bytes
          && buildPacket.bytes === receivePacket.bytes
          && buildPacket.commands === 2
          && receivePacket.commands === buildPacket.commands
          && receivePacket.commandType === buildPacket.commandType
          && receivePacket.relay === buildPacket.relay
          && receivePacket.executionFrame === buildPacket.executionFrame
          && receivePacket.playerId === buildPacket.playerId
          && receivePacket.commandId === buildPacket.commandId
          && receivePacket.frameCommandCount === buildPacket.frameCommandCount
          && receivePacket.runAheadCommandId === buildPacket.runAheadCommandId
          && receivePacket.runAhead === buildPacket.runAhead
          && receivePacket.frameRate === buildPacket.frameRate
          && receiveProbe.frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD"
          && receiveProbe.frameData?.storedCommandId === buildPacket.runAheadCommandId
          && receiveProbe.frameData?.readyState === 2;
        return {
          ok: packetMatches,
          command,
          buildProbe,
          relayEvent,
          receiveProbe,
          browserNetworkTransportRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "browserNetworkTransportBuildPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser network transport packet build cannot run" };
        }
        const buildProbe = parseModuleState(wasmModule.buildBrowserNetworkTransportPacket());
        return {
          ok: Boolean(buildProbe?.ok),
          command,
          buildProbe,
          state: snapshotState(),
        };
      }
    case "browserNetworkTransportAcceptPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser network transport packet accept cannot run" };
        }
        const packetHex = String(payload?.packetHex ?? "");
        const receiveProbe = parseModuleState(wasmModule.acceptBrowserNetworkTransportPacket(packetHex));
        return {
          ok: Boolean(receiveProbe?.ok),
          command,
          receiveProbe,
          state: snapshotState(),
        };
      }
    case "browserNetworkTransportBuildWirePacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser network transport wire build cannot run" };
        }
        const buildProbe = parseModuleState(wasmModule.buildBrowserNetworkTransportWirePacket());
        return {
          ok: Boolean(buildProbe?.ok),
          command,
          buildProbe,
          state: snapshotState(),
        };
      }
    case "browserNetworkTransportAcceptWirePacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser network transport wire accept cannot run" };
        }
        const wireHex = String(payload?.wireHex ?? "");
        const receiveProbe = parseModuleState(wasmModule.acceptBrowserNetworkTransportWirePacket(wireHex));
        return {
          ok: Boolean(receiveProbe?.ok),
          command,
          receiveProbe,
          state: snapshotState(),
        };
      }
    case "browserUdpEndpointConnect":
      {
        try {
          const runtime = await connectBrowserUdpEndpoint({
            webSocketUrl: String(payload?.webSocketUrl ?? ""),
            client: String(payload?.client ?? "browser-udp-client"),
            incomingIp: payload?.incomingIp,
            incomingPort: payload?.incomingPort,
          });
          return {
            ok: runtime.enabled === true && runtime.connected === true,
            command,
            runtime,
            state: snapshotState(),
          };
        } catch (error) {
          browserUdpEndpointRuntime.lastError = error?.message ?? String(error);
          return {
            ok: false,
            command,
            error: browserUdpEndpointRuntime.lastError,
            runtime: summarizeBrowserUdpEndpointRuntime(),
            state: snapshotState(),
          };
        }
      }
    case "browserUdpEndpointState":
      {
        return {
          ok: true,
          command,
          runtime: summarizeBrowserUdpEndpointRuntime(),
          state: snapshotState(),
        };
      }
    case "browserNetworkTransportLiveSendProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser network live send cannot run" };
        }
        const sendProbe = parseModuleState(wasmModule.probeBrowserNetworkTransportLiveSend());
        const runtime = summarizeBrowserUdpEndpointRuntime();
        return {
          ok: Boolean(sendProbe?.ok)
            && runtime.enabled === true
            && runtime.connected === true
            && runtime.sent === 1
            && runtime.sentBytes > 0
            && runtime.lastSent?.bytes === runtime.sentBytes,
          command,
          sendProbe,
          browserUdpEndpointRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "browserNetworkTransportLiveReceiveProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser network live receive cannot run" };
        }
        const receiveProbe = parseModuleState(wasmModule.probeBrowserNetworkTransportLiveReceive());
        const runtime = summarizeBrowserUdpEndpointRuntime();
        return {
          ok: Boolean(receiveProbe?.ok)
            && runtime.enabled === true
            && runtime.delivered === 1
            && runtime.received >= 1
            && runtime.deliveredBytes === receiveProbe.packet?.bytes + 6,
          command,
          receiveProbe,
          browserUdpEndpointRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "browserLanApiAnnounceRelayProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI announce relay cannot run" };
        }
        resetBrowserLanApiRuntime();
        let buildProbe = null;
        let relayEvent = null;
        let receiveProbe = null;
        try {
          buildProbe = parseModuleState(wasmModule.buildBrowserLanApiAnnouncePacket());
          relayEvent = relayBrowserNetworkPacket(buildProbe, browserLanApiRuntime);
          receiveProbe = parseModuleState(wasmModule.acceptBrowserLanApiAnnouncePacket(relayEvent.packetHex));
          if (receiveProbe?.ok) {
            browserLanApiRuntime.received += 1;
            browserLanApiRuntime.transportInjected = receiveProbe.transport?.injected === true;
            browserLanApiRuntime.lanApiUpdated = receiveProbe.lanApi?.updateDriven === true;
            browserLanApiRuntime.gameListRecorded = receiveProbe.game?.recorded === true
              && receiveProbe.lanApi?.handleGameAnnounceRecorded === true;
            browserLanApiRuntime.eventLog.push(
              {
                phase: "wasm-lanapi-transport-inject",
                client: relayEvent.to,
                transport: receiveProbe.originalTransport,
                bytes: receiveProbe.packet?.bytes,
              },
              {
                phase: "lanapi-update",
                dispatch: receiveProbe.originalDispatch,
                handler: receiveProbe.originalHandler,
                gamesSeen: receiveProbe.lanApi?.gamesSeen,
              },
              {
                phase: "lanapi-game-list",
                parser: receiveProbe.originalParser,
                callback: receiveProbe.originalCallback,
                gameName: receiveProbe.game?.gameName,
              },
            );
            browserLanApiRuntime.lastError = null;
          } else {
            browserLanApiRuntime.lastError = "original LANAPI announce receive probe failed";
          }
        } catch (error) {
          browserLanApiRuntime.lastError = error?.message ?? String(error);
        }
        const runtime = summarizeBrowserLanApiRuntime();
        const buildPacket = buildProbe?.packet ?? {};
        const receivePacket = receiveProbe?.packet ?? {};
        const packetMatches = Boolean(buildProbe?.ok)
          && Boolean(receiveProbe?.ok)
          && runtime.sent === 1
          && runtime.delivered === 1
          && runtime.received === 1
          && runtime.transportInjected === true
          && runtime.lanApiUpdated === true
          && runtime.gameListRecorded === true
          && runtime.bytes === buildPacket.bytes
          && buildPacket.bytes === receivePacket.bytes
          && buildPacket.messageType === "MSG_GAME_ANNOUNCE"
          && receivePacket.messageType === buildPacket.messageType
          && receivePacket.remoteIp === buildPacket.remoteIp
          && receivePacket.localIp === buildPacket.localIp
          && receivePacket.port === buildPacket.port
          && receiveProbe.originalDispatch === "LANAPI::update"
          && receiveProbe.originalHandler === "LANAPI::handleGameAnnounce"
          && receiveProbe.originalParser === "ParseGameOptionsString"
          && receiveProbe.originalCallback === "LANAPI::OnGameList"
          && receiveProbe.game?.recorded === true
          && receiveProbe.game?.mapOk === true
          && receiveProbe.game?.seed === buildPacket.seed
          && receiveProbe.game?.mapCRC === buildPacket.mapCRC
          && receiveProbe.game?.mapSize === buildPacket.mapSize
          && receiveProbe.game?.crcInterval === buildPacket.crcInterval
          && receiveProbe.game?.startingCash === buildPacket.startingCash
          && receiveProbe.game?.slotsClosed === true;
        return {
          ok: packetMatches,
          command,
          buildProbe,
          relayEvent,
          receiveProbe,
          browserLanApiRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "browserLanApiAnnounceBuildPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI announce packet build cannot run" };
        }
        const buildProbe = parseModuleState(wasmModule.buildBrowserLanApiAnnouncePacket());
        return {
          ok: Boolean(buildProbe?.ok),
          command,
          buildProbe,
          state: snapshotState(),
        };
      }
    case "browserLanApiAnnounceAcceptPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI announce packet accept cannot run" };
        }
        const packetHex = String(payload?.packetHex ?? "");
        const receiveProbe = parseModuleState(wasmModule.acceptBrowserLanApiAnnouncePacket(packetHex));
        return {
          ok: Boolean(receiveProbe?.ok),
          command,
          receiveProbe,
          state: snapshotState(),
        };
      }
    case "browserLanApiJoinRequestBuildPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI join request build cannot run" };
        }
        const buildProbe = parseModuleState(wasmModule.buildBrowserLanApiJoinRequestPacket());
        return {
          ok: Boolean(buildProbe?.ok),
          command,
          buildProbe,
          state: snapshotState(),
        };
      }
    case "browserLanApiJoinRequestAcceptPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI join request accept cannot run" };
        }
        const packetHex = String(payload?.packetHex ?? "");
        const hostProbe = parseModuleState(wasmModule.acceptBrowserLanApiJoinRequestPacket(packetHex));
        return {
          ok: Boolean(hostProbe?.ok),
          command,
          hostProbe,
          state: snapshotState(),
        };
      }
    case "browserLanApiJoinAcceptAcceptPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI join accept/options accept cannot run" };
        }
        const joinAcceptHex = String(payload?.joinAcceptHex ?? "");
        const gameOptionsHex = String(payload?.gameOptionsHex ?? "");
        const joinerProbe = parseModuleState(wasmModule.acceptBrowserLanApiJoinAcceptPacket(joinAcceptHex, gameOptionsHex));
        return {
          ok: Boolean(joinerProbe?.ok),
          command,
          joinerProbe,
          state: snapshotState(),
        };
      }
    case "browserLanApiGameStartBuildPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI game-start build cannot run" };
        }
        const buildProbe = parseModuleState(wasmModule.buildBrowserLanApiGameStartPacket());
        return {
          ok: Boolean(buildProbe?.ok),
          command,
          buildProbe,
          state: snapshotState(),
        };
      }
    case "browserLanApiGameStartAcceptPacket":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI game-start accept cannot run" };
        }
        const packetHex = String(payload?.packetHex ?? "");
        const clientProbe = parseModuleState(wasmModule.acceptBrowserLanApiGameStartPacket(packetHex));
        return {
          ok: Boolean(clientProbe?.ok),
          command,
          clientProbe,
          state: snapshotState(),
        };
      }
    case "browserLanApiLiveGameStartSendProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI live game-start send cannot run" };
        }
        const sendProbe = parseModuleState(wasmModule.probeBrowserLanApiLiveGameStartSend());
        const runtime = summarizeBrowserUdpEndpointRuntime();
        return {
          ok: Boolean(sendProbe?.ok)
            && runtime.enabled === true
            && runtime.connected === true
            && runtime.sent === 1
            && runtime.sentBytes === sendProbe.packet?.wireBytes
            && runtime.lastSent?.bytes === runtime.sentBytes
            && runtime.lastSent?.ip === sendProbe.packet?.remoteIp
            && runtime.lastSent?.port === sendProbe.packet?.port,
          command,
          sendProbe,
          browserUdpEndpointRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "browserLanApiLiveGameStartReceiveProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI live game-start receive cannot run" };
        }
        const receiveProbe = parseModuleState(wasmModule.probeBrowserLanApiLiveGameStartReceive());
        const runtime = summarizeBrowserUdpEndpointRuntime();
        return {
          ok: Boolean(receiveProbe?.ok)
            && runtime.enabled === true
            && runtime.received >= 1
            && runtime.delivered === 1
            && runtime.deliveredBytes === receiveProbe.packet?.wireBytes,
          command,
          receiveProbe,
          browserUdpEndpointRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "browserLanApiNetworkUpdateProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser LANAPI Network::update probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeBrowserLanApiNetworkUpdate());
        return {
          ok: Boolean(probe?.ok),
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "browserNetworkMultiFrameLockstepProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; browser multi-frame Network::update probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeBrowserNetworkMultiFrameLockstep());
        return {
          ok: Boolean(probe?.ok),
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "browserAudioRuntime":
      return {
        ok: true,
        command,
        browserAudioRuntime: summarizeBrowserAudioRuntime(),
        state: snapshotState(),
      };
    case "browserAudioMixerRuntime":
      return {
        ok: true,
        command,
        browserAudioMixerRuntime: summarizeBrowserAudioMixerRuntime(),
        state: snapshotState(),
      };
    case "browserAudioLiveEventRuntime":
      return {
        ok: true,
        command,
        browserAudioLiveEventRuntime: summarizeBrowserAudioLiveEventRuntime(),
        state: snapshotState(),
      };
    case "browserAudioRequestPathRuntime":
      return {
        ok: true,
        command,
        browserAudioRequestPathRuntime: summarizeBrowserAudioRequestPathRuntime(),
        state: snapshotState(),
      };
    case "browserMss3DSamplePlaybackRuntime":
      return {
        ok: true,
        command,
        browserMss3DSamplePlaybackRuntime: summarizeBrowserMss3DSamplePlaybackRuntime(),
        state: snapshotState(),
      };
    case "runtimeFileText":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable" };
        }
        try {
          const bytes = wasmModule.fs.readFile(String(payload.path ?? ""));
          const start = Math.max(0, bytes.length - Number(payload.tailBytes ?? 65536));
          let text = "";
          for (let i = start; i < bytes.length; ++i) text += String.fromCharCode(bytes[i]);
          return { ok: true, command, path: payload.path, size: bytes.length, text };
        } catch (error) {
          return { ok: false, command, path: payload.path, error: String(error?.message ?? error) };
        }
      }
    case "runtimeFileDigest":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; runtime file digest cannot run" };
        }
        try {
          let bytes = wasmModule.fs.readFile(String(payload.path ?? ""));
          let entryName = null;
          if (payload.entry) {
            const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const count = dv.getUint32(8, false);
            let cursor = 16;
            let hit = null;
            for (let index = 0; index < count; ++index) {
              const off = dv.getUint32(cursor, false);
              const size = dv.getUint32(cursor + 4, false);
              cursor += 8;
              let end = cursor;
              while (bytes[end] !== 0) ++end;
              const name = String.fromCharCode(...bytes.subarray(cursor, end));
              cursor = end + 1;
              if (name.toLowerCase() === String(payload.entry).toLowerCase()) {
                hit = { off, size, name };
              }
            }
            if (!hit) {
              return { ok: false, command, path: payload.path, error: `entry not found: ${payload.entry}` };
            }
            entryName = hit.name;
            bytes = bytes.subarray(hit.off, hit.off + hit.size);
          }
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const sha256 = Array.from(new Uint8Array(digest))
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
          return { ok: true, command, path: payload.path, entry: entryName, size: bytes.length, sha256 };
        } catch (error) {
          return { ok: false, command, path: payload.path, error: String(error?.message ?? error) };
        }
      }
    case "audioManagerRuntimeProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; audio manager runtime probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeAudioManagerRuntime());
        return {
          ok: Boolean(probe.attempted),
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "moduleFactoryRuntimeProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; module factory runtime probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeModuleFactoryRuntime());
        return {
          ok: Boolean(probe.attempted),
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "particleSystemRuntimeProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; particle system runtime probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeParticleSystemRuntime());
        return {
          ok: Boolean(probe.attempted),
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "mssStartupProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; MSS startup probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeMssStartup());
        return {
          ok: Boolean(probe.ok)
            && probe.source === "Mss.H browser startup handle contract probe"
            && probe.startupBoundaryReady === true
            && probe.playbackReady === false
            && probe.nextRequired === "webAudioPlaybackBackend",
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "mssSampleLifecycleProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; MSS sample lifecycle probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeMssSampleLifecycle());
        return {
          ok: Boolean(probe.ok)
            && probe.source === "Mss.H browser 2D sample lifecycle contract probe"
            && probe.sampleLifecycleReady === true
            && probe.playbackReady === false
            && probe.nextRequired === "webAudioPlaybackBackend",
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "mssSamplePlaybackProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; MSS sample playback probe cannot run" };
        }
        resetBrowserMssSamplePlaybackRuntime();
        const startProbe = parseModuleState(wasmModule.probeMssSamplePlaybackStart());
        let completion = null;
        let completionError = null;
        if (startProbe.ok && Number.isFinite(startProbe.sample?.handle)) {
          try {
            completion = await waitForBrowserMssSamplePlayback(startProbe.sample.handle);
          } catch (error) {
            completionError = error?.message ?? String(error);
            browserMssSamplePlaybackRuntime.lastError = completionError;
          }
        }
        const finishProbe = parseModuleState(wasmModule.probeMssSamplePlaybackFinish());
        const runtime = summarizeBrowserMssSamplePlaybackRuntime();
        return {
          ok: Boolean(startProbe.ok)
            && Boolean(finishProbe.ok)
            && completionError === null
            && runtime.runtimePlayback === true
            && runtime.completed === 1
            && runtime.ended === 1
            && runtime.released === 1,
          command,
          startProbe,
          completion,
          finishProbe,
          browserMssSamplePlaybackRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "mssAdpcmSamplePlaybackProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; MSS ADPCM sample playback probe cannot run" };
        }
        const archiveName = String(payload.archive ?? "AudioZH.big");
        const entryPath = String(payload.path ?? "Data\\Audio\\Sounds\\cleftria.wav");
        const mounted = harnessState.mountedArchives.find((archive) =>
          archive.name === archiveName || archive.sourceName === archiveName);
        if (!mounted) {
          return { ok: false, command, error: `archive ${archiveName} is not mounted` };
        }
        let payloadBytes;
        let payloadInfo;
        try {
          const archiveBytes = wasmModule.fs.readFile(mounted.path);
          const entries = readBigDirectoryFromBytes(archiveBytes, archiveName);
          const entry = entries.find((candidate) =>
            candidate.normalizedPath === normalizeBigPath(entryPath));
          if (!entry) {
            return { ok: false, command, error: `entry ${entryPath} not found in ${archiveName}` };
          }
          payloadBytes = archiveBytes.slice(entry.offset, entry.offset + entry.size);
          payloadInfo = parseAudioWavPayload(payloadBytes);
        } catch (error) {
          return { ok: false, command, error: error?.message ?? String(error) };
        }
        if (payloadInfo.wFormatTag !== 17) {
          return {
            ok: false,
            command,
            error: `entry ${entryPath} is not IMA ADPCM (wFormatTag ${payloadInfo.wFormatTag})`,
          };
        }
        resetBrowserMssSamplePlaybackRuntime();
        const stagingPtr = wasmModule.mssAdpcmPayloadBuffer(payloadBytes.byteLength);
        if (!stagingPtr) {
          return { ok: false, command, error: "wasm ADPCM staging buffer allocation failed" };
        }
        wasmModule.heapU8().set(payloadBytes, stagingPtr);
        const startProbe = parseModuleState(
          wasmModule.probeMssAdpcmSamplePlaybackStart(payloadBytes.byteLength));
        let completion = null;
        let completionError = null;
        if (startProbe.ok && Number.isFinite(startProbe.sample?.handle)) {
          const decodedFrames = Number(startProbe.decoded?.frames ?? 0);
          const decodedRate = Number(startProbe.decoded?.rate ?? 44100);
          const playbackMs = decodedRate > 0
            ? Math.ceil((decodedFrames / decodedRate) * 1000)
            : 0;
          try {
            completion = await waitForBrowserMssSamplePlayback(
              startProbe.sample.handle, playbackMs + 3000);
          } catch (error) {
            completionError = error?.message ?? String(error);
            browserMssSamplePlaybackRuntime.lastError = completionError;
          }
        }
        const finishProbe = parseModuleState(wasmModule.probeMssSamplePlaybackFinish());
        const runtime = summarizeBrowserMssSamplePlaybackRuntime();
        const scheduledPayload = runtime.lastEvent?.payload ?? null;
        return {
          ok: Boolean(startProbe.ok)
            && Boolean(finishProbe.ok)
            && completionError === null
            && runtime.runtimePlayback === true
            && runtime.completed === 1
            && runtime.ended === 1
            && runtime.released === 1
            && scheduledPayload?.codec === "PCM"
            && (scheduledPayload?.stats?.nonZeroSamples ?? 0) > 0,
          command,
          archive: archiveName,
          path: entryPath,
          sourcePayload: {
            bytes: payloadBytes.byteLength,
            wFormatTag: payloadInfo.wFormatTag,
            codec: payloadInfo.codec,
            channels: payloadInfo.channels,
            samplesPerSec: payloadInfo.samplesPerSec,
            blockAlign: payloadInfo.blockAlign,
            factSamples: payloadInfo.factSamples,
            dataBytes: payloadInfo.dataBytes,
          },
          startProbe,
          completion,
          finishProbe,
          browserMssSamplePlaybackRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "mssStreamLifecycleProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; MSS stream lifecycle probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeMssStreamLifecycle());
        return {
          ok: Boolean(probe.ok)
            && probe.source === "Mss.H browser stream lifecycle contract probe"
            && probe.streamLifecycleReady === true
            && probe.playbackReady === false
            && probe.nextRequired === "webAudioPlaybackBackend",
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "mssStreamPlaybackProbe":
      {
        const archiveName = String(payload.archive ?? "Music.big");
        const entryPath = String(payload.path ?? "Data\\Audio\\Tracks\\USA_01.mp3");
        const mounted = harnessState.mountedArchives.find((archive) =>
          archive.name === archiveName || archive.sourceName === archiveName);
        if (!mounted) {
          return { ok: false, command, error: `archive ${archiveName} is not mounted` };
        }
        if (browserAudioRuntime.context?.state !== "running") {
          return { ok: false, command, error: "AudioContext is not running" };
        }
        resetBrowserMssStreamPlaybackRuntime();
        const handle = Number(payload.handle ?? 33001);
        const started = cncPortMssStreamStart({
          handle,
          filename: entryPath,
          volume: Number(payload.volume ?? 96),
          loopCount: Number(payload.loopCount ?? 1),
          playbackRate: Number(payload.playbackRate ?? 44100),
        });
        let startError = null;
        try {
          await waitForBrowserMssStreamStart(handle, Number(payload.timeoutMs ?? 8000));
        } catch (error) {
          startError = error?.message ?? String(error);
          browserMssStreamPlaybackRuntime.lastError = startError;
        }
        const afterStart = summarizeBrowserMssStreamPlaybackRuntime();
        const stopAfterStart = payload.stopAfterStart !== false;
        let afterStop = null;
        if (stopAfterStart) {
          cncPortMssStreamStop({ handle });
          await delay(50);
          afterStop = summarizeBrowserMssStreamPlaybackRuntime();
        }
        const scheduledPayload = afterStart.lastEvent?.payload ?? null;
        const ok = started === true
          && startError === null
          && afterStart.ready === true
          && afterStart.runtimePlayback === true
          && afterStart.decoded === 1
          && afterStart.scheduled === 1
          && afterStart.activeSources === 1
          && afterStart.musicSourceActive === true
          && afterStart.lastError === null
          && afterStart.lastEvent?.path === entryPath
          && scheduledPayload?.extension === "mp3"
          && (scheduledPayload?.magic === "mp3-id3" || scheduledPayload?.magic === "mp3-frame")
          && scheduledPayload?.decodedBy === "WebAudio.decodeAudioData"
          && (scheduledPayload?.decodedFrames ?? 0) > 0
          && (!stopAfterStart
            || (afterStop?.activeSources === 0
              && afterStop?.musicSourceActive === false
              && afterStop?.stopped === 1));
        return {
          ok,
          command,
          archive: archiveName,
          path: entryPath,
          startError,
          afterStart,
          afterStop,
          state: snapshotState(),
        };
      }
    case "mss3DSampleLifecycleProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; MSS 3D sample lifecycle probe cannot run" };
        }
        const probe = parseModuleState(wasmModule.probeMss3DSampleLifecycle());
        return {
          ok: Boolean(probe.ok)
            && probe.source === "Mss.H browser 3D sample lifecycle contract probe"
            && probe.sample3DLifecycleReady === true
            && probe.playbackReady === false
            && probe.nextRequired === "webAudioPlaybackBackend",
          command,
          probe,
          state: snapshotState(),
        };
      }
    case "resumeBrowserAudioRuntime":
      {
        const runtime = await resumeBrowserAudioRuntime(payload.trigger ?? "rpc.resumeBrowserAudioRuntime");
        return {
          ok: runtime.available === true,
          command,
          browserAudioRuntime: runtime,
          state: snapshotState(),
        };
      }
    case "setBrowserAudioMixerVolumes":
      {
        const mixer = setBrowserAudioMixerRuntimeVolumes(payload);
        return {
          ok: mixer.available === true && mixer.created === true && mixer.lastError === null,
          command,
          browserAudioMixerRuntime: mixer,
          state: snapshotState(),
        };
      }
    case "playBrowserAudioRequestedEvent":
      {
        const liveEvent = await playBrowserAudioRequestedLiveEvent(payload);
        return {
          ok: liveEvent.ready === true && liveEvent.lastError === null && liveEvent.completed > 0,
          command,
          browserAudioLiveEventRuntime: liveEvent,
          state: snapshotState(),
        };
      }
    case "playBrowserAudioRequestPathEvent":
      {
        const requestPath = await playBrowserAudioRequestPathLiveEvent(payload);
        return {
          ok: requestPath.ready === true && requestPath.lastError === null && requestPath.completed > 0,
          command,
          browserAudioRequestPathRuntime: requestPath,
          state: snapshotState(),
        };
      }
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
    case "gdiFontProbe":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; GDI font bridge cannot run" };
        }
        const pointSize = Math.max(8, Math.min(72, Number(payload.pointSize ?? 16)));
        const face = String(payload.face ?? "Arial");
        const probe = parseModuleState(wasmModule.probeGdiFont(pointSize, face));
        const ok = Boolean(probe.ok)
          && probe.rasterizerInstalled === true
          && probe.rasterized === true
          && probe.metricsReported === true
          && probe.measureReported === true
          && (probe.glyphCoverage ?? 0) > 0
          && (probe.fontHeight ?? 0) > 0;
        return { ok, command, probe, state: snapshotState() };
      }
    case "ww3dFontChars":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; WW3D FontChars cannot run" };
        }
        const pointSize = Math.max(8, Math.min(72, Number(payload.pointSize ?? 24)));
        const face = String(payload.face ?? "Arial");
        const bold = payload.bold ? 1 : 0;
        const probe = parseModuleState(wasmModule.probeWW3DFontChars(pointSize, face, bold));
        const ok = Boolean(probe.ok)
          && probe.source === "ww3d_font_chars_probe"
          && probe.assetManagerCreated === true
          && probe.fontCreated === true
          && (probe.charHeight ?? 0) > 0
          && probe.positiveWidths === probe.glyphCount
          && probe.charsWithCoverage === probe.glyphCount
          && (probe.blitCoverage ?? 0) > 0;
        return { ok, command, probe, state: snapshotState() };
      }
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

function suppressCanvasNativeSelection(event) {
  event.preventDefault();
}

function suppressCanvasNativeTouchDefault(event) {
  if (event.cancelable) {
    event.preventDefault();
  }
}

canvas.addEventListener("selectstart", suppressCanvasNativeSelection);
canvas.addEventListener("dragstart", suppressCanvasNativeSelection);
canvas.addEventListener("touchstart", suppressCanvasNativeTouchDefault, { passive: false });
canvas.addEventListener("touchmove", suppressCanvasNativeTouchDefault, { passive: false });

window.addEventListener("pointerdown", () => {
  void resumeBrowserAudioRuntime("window.pointerdown");
}, { capture: true });

canvas.addEventListener("pointermove", (event) => {
  const point = canvasInputPointFromEvent(event);
  void pushBrowserInputToWasmLite({
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
  claimBrowserPointerCapture(event);
  event.preventDefault();
  void pushBrowserInputToWasmLite({
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
  releaseBrowserPointerCapture(event);
  event.preventDefault();
  void pushBrowserInputToWasmLite({
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
  void pushBrowserInputToWasmLite({
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
canvas.addEventListener("gotpointercapture", (event) => {
  recordBrowserPointerCaptureEvent("gotpointercapture", event, {
    active: true,
    pointerId: event.pointerId,
    gotEvents: harnessState.browserPointerCapture.gotEvents + 1,
  });
});
canvas.addEventListener("lostpointercapture", (event) => {
  recordBrowserPointerCaptureEvent("lostpointercapture", event, {
    active: false,
    pointerId: null,
    lostEvents: harnessState.browserPointerCapture.lostEvents + 1,
  });
});

function browserKeyboardEventBelongsToDomUi(event) {
  if (document.querySelector("#issueModal:not(.hidden)")) {
    return true;
  }
  if (document.querySelector("#overlay:not(.hidden)")) {
    return true;
  }

  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const nodes = path.length > 0 ? path : [event.target, document.activeElement];
  return nodes.some((node) => {
    if (!(node instanceof Element)) {
      return false;
    }
    return node.isContentEditable ||
      Boolean(node.closest("input, textarea, select, button, [contenteditable=''], [contenteditable='true']"));
  });
}

window.addEventListener("keydown", (event) => {
  if (browserKeyboardEventBelongsToDomUi(event)) {
    return;
  }
  void resumeBrowserAudioRuntime("window.keydown");
  const virtualKey = virtualKeyFromEvent(event);
  if (virtualKey < 0) {
    return;
  }
  event.preventDefault();
  const charCode = win32CharCodeFromEvent(event);
  void (async () => {
    await pushBrowserInputToWasmLite({
      virtualKey,
      keyDown: true,
      directInputCode: directInputScanCodeFromEvent(event),
      timestamp: eventTimestampMs(event),
      win32Message: {
        message: win32Messages.keyDown,
        wParam: virtualKey,
      },
    });
    if (charCode >= 0) {
      await pushBrowserInputToWasmLite({
        win32Message: {
          message: win32Messages.char,
          wParam: charCode,
        },
      });
    }
  })();
});
window.addEventListener("keyup", (event) => {
  if (browserKeyboardEventBelongsToDomUi(event)) {
    return;
  }
  const virtualKey = virtualKeyFromEvent(event);
  if (virtualKey < 0) {
    return;
  }
  event.preventDefault();
  void pushBrowserInputToWasmLite({
    virtualKey,
    keyDown: false,
    directInputCode: directInputScanCodeFromEvent(event),
    timestamp: eventTimestampMs(event),
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

// Auto-persist save games to IndexedDB. The engine writes ".sav" files with
// its own GameState / XferSave path into the IDBFS-mounted save directory; we
// flush MEMFS -> IndexedDB on the events that precede losing the page so a
// reload can read them back. A slow periodic flush is the reliable guarantee
// (beforeunload cannot await the async syncfs), and it only touches disk when
// the save filesystem is actually mounted.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void persistSaveFilesystem("visibilitychange");
    }
  });
}
window.addEventListener("pagehide", () => {
  void persistSaveFilesystem("pagehide");
});
window.addEventListener("beforeunload", () => {
  // Best-effort: fires the async syncfs; IndexedDB writes are queued even if
  // the callback never runs before navigation completes.
  void persistSaveFilesystem("beforeunload");
});
// Periodic safety flush (every 5s) so an in-game save persists even if the tab
// is closed without a clean unload event. No-op until the FS is mounted.
setInterval(() => {
  if (cncPortSaveFsMounted) {
    void persistSaveFilesystem("interval");
  }
}, 5000);

window.CnCPort = {
  rpc,
  state: harnessState,
  d3d8BridgeCallbacks,
  persistSaves: persistSaveFilesystem,
  listSaves: listSaveFiles,
  // Raw emscripten Module accessor for harness diagnostics (threaded mode:
  // lets a probe read atomic counters / last-step markers FROM THE MAIN
  // THREAD while the engine thread is busy inside a long wasm call and the
  // realm port cannot answer).
  engineModule: () => cncPortEmscriptenModule,
};
