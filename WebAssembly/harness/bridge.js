const canvas = document.querySelector("#viewport");
const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: true,
  stencil: true,
  preserveDrawingBuffer: true,
});
const s3tc = gl ? gl.getExtension("WEBGL_compressed_texture_s3tc") : null;
const provokingVertex = gl ? gl.getExtension("WEBGL_provoking_vertex") : null;
const fallbackContext = gl ? null : canvas.getContext("2d", { alpha: false });
const stateNode = document.querySelector("#state");
const framesNode = document.querySelector("#frames");
let d3d8DrawProgram = null;
const d3d8Buffers = new Map();
const d3d8Textures = new Map();
const d3d8BoundTextures = new Map();
const D3DUSAGE_WRITEONLY = 0x00000008;
const D3DUSAGE_DYNAMIC = 0x00000200;
const D3DLOCK_DISCARD = 0x00002000;
const D3DLOCK_NOOVERWRITE = 0x00001000;
const D3DFMT_R8G8B8 = 20;
const D3DFMT_A8R8G8B8 = 21;
const D3DFMT_X8R8G8B8 = 22;
const D3DFMT_R5G6B5 = 23;
const D3DFMT_X1R5G5B5 = 24;
const D3DFMT_A1R5G5B5 = 25;
const D3DFMT_A4R4G4B4 = 26;
const D3DFMT_A8 = 28;
const D3DFMT_X4R4G4B4 = 30;
const D3DFMT_P8 = 41;
const D3DFMT_L8 = 50;
const D3DFMT_A8L8 = 51;
const D3DFMT_DXT1 = 0x31545844;
const D3DFMT_DXT2 = 0x32545844;
const D3DFMT_DXT3 = 0x33545844;
const D3DFMT_DXT4 = 0x34545844;
const D3DFMT_DXT5 = 0x35545844;
const GL_GREEN = 0x1904;
const D3DZB_FALSE = 0;
const D3DZB_TRUE = 1;
const D3DZB_USEW = 2;
const D3DBLEND_ZERO = 1;
const D3DBLEND_ONE = 2;
const D3DBLEND_SRCCOLOR = 3;
const D3DBLEND_INVSRCCOLOR = 4;
const D3DBLEND_SRCALPHA = 5;
const D3DBLEND_INVSRCALPHA = 6;
const D3DBLEND_DESTALPHA = 7;
const D3DBLEND_INVDESTALPHA = 8;
const D3DBLEND_DESTCOLOR = 9;
const D3DBLEND_INVDESTCOLOR = 10;
const D3DBLEND_SRCALPHASAT = 11;
const D3DBLEND_BOTHSRCALPHA = 12;
const D3DBLEND_BOTHINVSRCALPHA = 13;
const D3DBLENDOP_ADD = 1;
const D3DBLENDOP_SUBTRACT = 2;
const D3DBLENDOP_REVSUBTRACT = 3;
const D3DBLENDOP_MIN = 4;
const D3DBLENDOP_MAX = 5;
const D3DCMP_NEVER = 1;
const D3DCMP_LESS = 2;
const D3DCMP_EQUAL = 3;
const D3DCMP_LESSEQUAL = 4;
const D3DCMP_GREATER = 5;
const D3DCMP_NOTEQUAL = 6;
const D3DCMP_GREATEREQUAL = 7;
const D3DCMP_ALWAYS = 8;
const D3DCULL_NONE = 1;
const D3DCULL_CW = 2;
const D3DCULL_CCW = 3;
const D3DCOLORWRITEENABLE_RED = 1;
const D3DCOLORWRITEENABLE_GREEN = 2;
const D3DCOLORWRITEENABLE_BLUE = 4;
const D3DCOLORWRITEENABLE_ALPHA = 8;
const D3DMCS_MATERIAL = 0;
const D3DMCS_COLOR1 = 1;
const D3DMCS_COLOR2 = 2;
const D3DLIGHT_POINT = 1;
const D3DLIGHT_SPOT = 2;
const D3DLIGHT_DIRECTIONAL = 3;
const D3DFILL_POINT = 1;
const D3DFILL_WIREFRAME = 2;
const D3DFILL_SOLID = 3;
const D3DSHADE_FLAT = 1;
const D3DSHADE_GOURAUD = 2;
const D3DSHADE_PHONG = 3;
const D3DPT_POINTLIST = 1;
const D3DPT_LINELIST = 2;
const D3DPT_LINESTRIP = 3;
const D3DPT_TRIANGLELIST = 4;
const D3DPT_TRIANGLESTRIP = 5;
const D3DPT_TRIANGLEFAN = 6;
const D3DSTENCILOP_KEEP = 1;
const D3DSTENCILOP_ZERO = 2;
const D3DSTENCILOP_REPLACE = 3;
const D3DSTENCILOP_INCRSAT = 4;
const D3DSTENCILOP_DECRSAT = 5;
const D3DSTENCILOP_INVERT = 6;
const D3DSTENCILOP_INCR = 7;
const D3DSTENCILOP_DECR = 8;
const D3DFOG_LINEAR = 3;
const D3DTSS_COLOROP = 1;
const D3DTSS_COLORARG1 = 2;
const D3DTSS_COLORARG2 = 3;
const D3DTSS_ALPHAOP = 4;
const D3DTSS_ALPHAARG1 = 5;
const D3DTSS_ALPHAARG2 = 6;
const D3DTSS_TEXCOORDINDEX = 11;
const D3DTSS_ADDRESSU = 13;
const D3DTSS_ADDRESSV = 14;
const D3DTSS_MAGFILTER = 16;
const D3DTSS_MINFILTER = 17;
const D3DTSS_MIPFILTER = 18;
const D3DTSS_MIPMAPLODBIAS = 19;
const D3DTSS_MAXMIPLEVEL = 20;
const D3DTSS_TEXTURETRANSFORMFLAGS = 24;
const D3DTSS_ADDRESSW = 25;
const D3DTSS_COLORARG0 = 26;
const D3DTSS_ALPHAARG0 = 27;
const D3DTSS_RESULTARG = 28;
const D3DTOP_DISABLE = 1;
const D3DTOP_SELECTARG1 = 2;
const D3DTOP_SELECTARG2 = 3;
const D3DTOP_MODULATE = 4;
const D3DTOP_MODULATE2X = 5;
const D3DTOP_MODULATE4X = 6;
const D3DTOP_ADD = 7;
const D3DTOP_ADDSIGNED = 8;
const D3DTOP_ADDSIGNED2X = 9;
const D3DTOP_SUBTRACT = 10;
const D3DTOP_ADDSMOOTH = 11;
const D3DTOP_BLENDDIFFUSEALPHA = 12;
const D3DTOP_BLENDTEXTUREALPHA = 13;
const D3DTOP_BLENDFACTORALPHA = 14;
const D3DTOP_BLENDCURRENTALPHA = 16;
const D3DTOP_DOTPRODUCT3 = 24;
const D3DTOP_MULTIPLYADD = 25;
const D3DTOP_LERP = 26;
const D3DTA_SELECTMASK = 0x0000000f;
const D3DTA_DIFFUSE = 0;
const D3DTA_CURRENT = 1;
const D3DTA_TEXTURE = 2;
const D3DTA_TFACTOR = 3;
const D3DTA_TEMP = 5;
const D3DTA_COMPLEMENT = 0x00000010;
const D3DTA_ALPHAREPLICATE = 0x00000020;
const D3DTA_SUPPORTED_MODIFIERS = D3DTA_COMPLEMENT | D3DTA_ALPHAREPLICATE;
const D3D8_CLIP_PLANE_COUNT = 6;
const D3DTSS_TCI_PASSTHRU = 0x00000000;
const D3DTSS_TCI_CAMERASPACENORMAL = 0x00010000;
const D3DTSS_TCI_CAMERASPACEPOSITION = 0x00020000;
const D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR = 0x00030000;
const D3DTSS_TCI_COORDINDEX_MASK = 0x0000ffff;
const D3DTSS_TCI_MODE_MASK = 0xffff0000;
const D3DTADDRESS_WRAP = 1;
const D3DTADDRESS_MIRROR = 2;
const D3DTADDRESS_CLAMP = 3;
const D3DTADDRESS_BORDER = 4;
const D3DTADDRESS_MIRRORONCE = 5;
const D3DTEXF_NONE = 0;
const D3DTEXF_POINT = 1;
const D3DTEXF_LINEAR = 2;
const D3DTEXF_ANISOTROPIC = 3;
const D3DTTFF_DISABLE = 0;
const D3DTTFF_COUNT1 = 1;
const D3DTTFF_COUNT2 = 2;
const D3DTTFF_COUNT3 = 3;
const D3DTTFF_COUNT4 = 4;
const D3DTTFF_PROJECTED = 256;
const D3D8_TEXTURE_STAGE_COUNT = 8;
const D3D8_LIGHT_COUNT = 8;
const WW3D_ACTIVE_LIGHT_COUNT = 4;
const D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT = WW3D_ACTIVE_LIGHT_COUNT;
const D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT = WW3D_ACTIVE_LIGHT_COUNT;
const D3DFVF_XYZ = 0x002;
const D3DFVF_XYZRHW = 0x004;
const D3DFVF_XYZB4 = 0x008;
const D3DFVF_NORMAL = 0x010;
const D3DFVF_DIFFUSE = 0x040;
const D3DFVF_SPECULAR = 0x080;
const D3DFVF_TEX1 = 0x100;
const D3DFVF_TEX2 = 0x200;
const D3DFVF_TEXCOUNT_MASK = 0xf00;
const D3DFVF_TEXCOUNT_SHIFT = 8;
const D3D8_NORMAL_OFFSET = 12;
const D3D8_NORMAL_MIN_STRIDE = D3D8_NORMAL_OFFSET + 12;
const D3D8_DIFFUSE_OFFSET = 24;
const D3D8_DIFFUSE_MIN_STRIDE = D3D8_DIFFUSE_OFFSET + 4;
// Matches WW3D2/dx8fvf.h VertexFormatXYZNDUV1/2: XYZ, normal, diffuse, UV0/UV1.
const D3D8_XYZNDUV_TEXCOORD0_OFFSET = 28;
const D3D8_XYZNDUV_TEXCOORD_STRIDE = 8;
const D3D8_XYZNDUV_TEXCOORD_SETS = 2;
const D3D_FLOAT_ONE_BITS = 0x3f800000;
const d3d8FloatBits = new ArrayBuffer(4);
const d3d8FloatView = new DataView(d3d8FloatBits);
const d3d8BufferStats = {
  creates: 0,
  updates: 0,
  releases: 0,
  lastCreate: null,
  lastStaticCreate: null,
  lastDynamicCreate: null,
  lastUpdate: null,
  lastRelease: null,
};
let d3d8ViewportState = null;
const d3d8ViewportStats = {
  sets: 0,
  applications: 0,
};
const d3d8TextureStats = {
  creates: 0,
  updates: 0,
  releases: 0,
  binds: 0,
  unbinds: 0,
  releaseUnbinds: 0,
  missingBinds: 0,
  unsupportedUpdates: 0,
  samplerApplications: 0,
  live: 0,
  legacyUploads: [],
  lastCreate: null,
  lastUpdate: null,
  lastSubrectUpdate: null,
  lastRelease: null,
  lastBind: null,
  lastReleaseUnbind: null,
  lastMissingBind: null,
  lastUnsupported: null,
  lastSampler: null,
};

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
  browserRuntimeAssets: null,
  startupSingletons: null,
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
      await context.resume();
    }
    if (context.state === "running") {
      browserAudioRuntime.resumeSuccesses += 1;
      browserAudioRuntime.lastResumeError = null;
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

function readMssSampleWaveBytes(payload, heapu8) {
  const dataPtr = Number(payload?.dataPtr ?? 0) >>> 0;
  if (!dataPtr || !(heapu8 instanceof Uint8Array)) {
    throw new Error("MSS sample payload pointer is unavailable");
  }
  if (dataPtr + 12 > heapu8.byteLength) {
    throw new Error(`MSS sample payload pointer is outside wasm memory: ${dataPtr}`);
  }
  const riffSize = readU32LE(heapu8, dataPtr + 4) + 8;
  if (riffSize < 44 || riffSize > 1024 * 1024 || dataPtr + riffSize > heapu8.byteLength) {
    throw new Error(`MSS sample RIFF size is invalid: ${riffSize}`);
  }
  return heapu8.slice(dataPtr, dataPtr + riffSize);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
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
    const bytes = readMssSampleWaveBytes(payload, heapu8);
    const decoded = decodeAudioWavPayload(bytes);
    const decodedFrames = Math.floor(decoded.samples.length / decoded.info.channels);
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
    source.buffer = createWebAudioBufferFromDecoded(context, {
      info: decoded.info,
      samples: decoded.samples,
      decodedFrames,
    });
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
        codec: decoded.info.codec,
        bytes: bytes.byteLength,
        dataBytes: decoded.info.dataBytes,
        frames: decodedFrames,
        sampleRate: decoded.info.samplesPerSec,
        channels: decoded.info.channels,
        bitsPerSample: decoded.info.bitsPerSample,
      },
      sample: {
        volume,
        panFloat,
        stereoPan: pan,
        playbackRate: Number(payload.playbackRate ?? decoded.info.samplesPerSec),
        loopCount: Number(payload.loopCount ?? 1),
        msPosition: Number(payload.msPosition ?? 0),
      },
      startSeconds: Number(context.currentTime.toFixed(6)),
      durationSeconds: Number(source.buffer.duration.toFixed(6)),
      nodeGraph: panner
        ? ["AudioBufferSourceNode", "GainNode", "StereoPannerNode", "soundGainNode", "AudioDestinationNode"]
        : ["AudioBufferSourceNode", "GainNode", "soundGainNode", "AudioDestinationNode"],
    };

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
        browserMssSamplePlaybackRuntime.activeSources.delete(handle);
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
        resolve(ended);
      };
    });

    browserMssSamplePlaybackRuntime.started += 1;
    browserMssSamplePlaybackRuntime.eventLog.push(
      { handle, phase: "AIL_start_sample", node: "AudioBufferSourceNode" },
      { handle, phase: "webAudioStart", volume, stereoPan: pan },
    );
    browserMssSamplePlaybackRuntime.lastEvent = event;
    browserMssSamplePlaybackRuntime.activeSources.set(handle, { source, gain, panner });
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
    restoreFullCanvasViewport();
  }
  refreshCanvasState(displaySize);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function currentDrawingBufferSize() {
  return {
    width: gl ? gl.drawingBufferWidth : canvas.width,
    height: gl ? gl.drawingBufferHeight : canvas.height,
  };
}

function restoreFullCanvasViewport() {
  if (!gl) {
    return;
  }
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.disable(gl.SCISSOR_TEST);
  gl.depthRange(0, 1);
}

function defaultD3D8Viewport() {
  const drawingBuffer = currentDrawingBufferSize();
  return {
    x: 0,
    y: 0,
    width: drawingBuffer.width,
    height: drawingBuffer.height,
    minZ: 0,
    maxZ: 1,
  };
}

function normalizeD3D8Viewport(payload = {}) {
  const drawingBuffer = currentDrawingBufferSize();
  const bufferWidth = Math.max(0, drawingBuffer.width);
  const bufferHeight = Math.max(0, drawingBuffer.height);
  const requested = {
    x: Math.trunc(finiteNumber(payload.x, 0)),
    y: Math.trunc(finiteNumber(payload.y, 0)),
    width: Math.trunc(finiteNumber(payload.width, bufferWidth)),
    height: Math.trunc(finiteNumber(payload.height, bufferHeight)),
    minZ: finiteNumber(payload.minZ, 0),
    maxZ: finiteNumber(payload.maxZ, 1),
    targetWidth: Math.trunc(finiteNumber(payload.targetWidth, payload.width ?? bufferWidth)),
    targetHeight: Math.trunc(finiteNumber(payload.targetHeight, payload.height ?? bufferHeight)),
  };
  const targetWidth = Math.max(1, requested.targetWidth);
  const targetHeight = Math.max(1, requested.targetHeight);
  const x = Math.max(0, Math.min(targetWidth, requested.x));
  const y = Math.max(0, Math.min(targetHeight, requested.y));
  const width = Math.max(0, Math.min(Math.max(0, requested.width), targetWidth - x));
  const height = Math.max(0, Math.min(Math.max(0, requested.height), targetHeight - y));
  const minZ = clampNumber(requested.minZ, 0, 1, 0);
  const maxZ = Math.max(minZ, clampNumber(requested.maxZ, 0, 1, 1));
  const d3d = { x, y, width, height, minZ, maxZ };
  const scaleX = bufferWidth / targetWidth;
  const scaleY = bufferHeight / targetHeight;
  const glX = Math.round(x * scaleX);
  const glTop = Math.round(y * scaleY);
  const glWidth = Math.round(width * scaleX);
  const glHeight = Math.round(height * scaleY);
  const glViewport = {
    x: glX,
    y: Math.max(0, bufferHeight - glTop - glHeight),
    width: glWidth,
    height: glHeight,
    minZ,
    maxZ,
  };
  return {
    requested,
    d3d,
    gl: glViewport,
    renderTarget: {
      width: targetWidth,
      height: targetHeight,
      scaleX,
      scaleY,
    },
    drawingBuffer,
    clipped: requested.x !== x ||
      requested.y !== y ||
      requested.width !== width ||
      requested.height !== height ||
      requested.minZ !== minZ ||
      requested.maxZ !== maxZ,
  };
}

function viewportArraysEqual(left, right, tolerance = 0) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((component, index) => Math.abs(component - right[index]) <= tolerance);
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

function applyD3D8Viewport(reason = "draw") {
  const viewport = normalizeD3D8Viewport(d3d8ViewportState ?? defaultD3D8Viewport());
  d3d8ViewportStats.applications += 1;
  if (!gl) {
    const probe = {
      ok: false,
      source: "browser_d3d8_viewport",
      api: harnessState.graphics?.api ?? "2d-fallback",
      reason,
      sets: d3d8ViewportStats.sets,
      applications: d3d8ViewportStats.applications,
      requested: viewport.requested,
      d3d: viewport.d3d,
      gl: viewport.gl,
      renderTarget: viewport.renderTarget,
      drawingBuffer: viewport.drawingBuffer,
      scissorEnabled: false,
    };
    harnessState.graphics = {
      ...harnessState.graphics,
      d3d8Viewport: probe,
    };
    return probe;
  }

  gl.viewport(viewport.gl.x, viewport.gl.y, viewport.gl.width, viewport.gl.height);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(viewport.gl.x, viewport.gl.y, viewport.gl.width, viewport.gl.height);
  gl.depthRange(viewport.gl.minZ, viewport.gl.maxZ);

  const actualViewport = Array.from(gl.getParameter(gl.VIEWPORT));
  const actualScissor = Array.from(gl.getParameter(gl.SCISSOR_BOX));
  const actualDepthRange = Array.from(gl.getParameter(gl.DEPTH_RANGE));
  const expectedBox = [viewport.gl.x, viewport.gl.y, viewport.gl.width, viewport.gl.height];
  const expectedDepth = [viewport.gl.minZ, viewport.gl.maxZ];
  const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
  const probe = {
    ok: viewportArraysEqual(actualViewport, expectedBox) &&
      viewportArraysEqual(actualScissor, expectedBox) &&
      viewportArraysEqual(actualDepthRange, expectedDepth, 0.00001) &&
      scissorEnabled,
    source: "browser_d3d8_viewport",
    api: harnessState.graphics?.api ?? "webgl2",
    reason,
    sets: d3d8ViewportStats.sets,
    applications: d3d8ViewportStats.applications,
    requested: viewport.requested,
    d3d: viewport.d3d,
    gl: viewport.gl,
    renderTarget: viewport.renderTarget,
    actual: {
      viewport: actualViewport,
      scissor: actualScissor,
      depthRange: actualDepthRange,
    },
    drawingBuffer: viewport.drawingBuffer,
    clipped: viewport.clipped,
    scissorEnabled,
  };
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8Viewport: probe,
  };
  return probe;
}

function setD3D8Viewport(payload = {}) {
  d3d8ViewportStats.sets += 1;
  d3d8ViewportState = {
    x: Number(payload.x ?? 0) >>> 0,
    y: Number(payload.y ?? 0) >>> 0,
    width: Number(payload.width ?? 0) >>> 0,
    height: Number(payload.height ?? 0) >>> 0,
    minZ: finiteNumber(payload.minZ, 0),
    maxZ: finiteNumber(payload.maxZ, 1),
    targetWidth: Number(payload.targetWidth ?? payload.width ?? 0) >>> 0,
    targetHeight: Number(payload.targetHeight ?? payload.height ?? 0) >>> 0,
  };
  return applyD3D8Viewport("set");
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

function d3dColorFromRgba(rgba) {
  return (((rgba[3] << 24) >>> 0) | (rgba[0] << 16) | (rgba[1] << 8) | rgba[2]) >>> 0;
}

function d3d8BufferKindName(kind) {
  switch (Number(kind) >>> 0) {
    case 1:
      return "vertex";
    case 2:
      return "index";
    default:
      return "unknown";
  }
}

function d3d8BufferKey(kind, id) {
  return `${d3d8BufferKindName(kind)}:${Number(id) >>> 0}`;
}

function d3d8BufferTarget(kind) {
  if (!gl) {
    return 0;
  }
  return d3d8BufferKindName(kind) === "index" ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
}

function d3d8BufferUsageInfo(usage) {
  const d3dUsage = Number(usage ?? 0) >>> 0;
  const dynamic = Boolean(d3dUsage & D3DUSAGE_DYNAMIC);
  const writeOnly = Boolean(d3dUsage & D3DUSAGE_WRITEONLY);
  const glUsage = dynamic ? gl.STREAM_DRAW : writeOnly ? gl.STATIC_DRAW : gl.DYNAMIC_DRAW;
  const glUsageName = dynamic ? "streamDraw" : writeOnly ? "staticDraw" : "dynamicDraw";
  return {
    d3dUsage,
    dynamic,
    writeOnly,
    glUsage,
    glUsageName,
  };
}

function updateD3D8BufferSummary() {
  let liveVertex = 0;
  let liveIndex = 0;
  for (const resource of d3d8Buffers.values()) {
    if (resource.kindName === "vertex") {
      liveVertex += 1;
    } else if (resource.kindName === "index") {
      liveIndex += 1;
    }
  }
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8Buffers: {
      creates: d3d8BufferStats.creates,
      updates: d3d8BufferStats.updates,
      releases: d3d8BufferStats.releases,
      liveVertex,
      liveIndex,
      lastCreate: d3d8BufferStats.lastCreate,
      lastStaticCreate: d3d8BufferStats.lastStaticCreate,
      lastDynamicCreate: d3d8BufferStats.lastDynamicCreate,
      lastUpdate: d3d8BufferStats.lastUpdate,
      lastRelease: d3d8BufferStats.lastRelease,
    },
  };
}

function createD3D8Buffer(payload = {}) {
  if (!gl) {
    return 0;
  }
  const kind = Number(payload.kind ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const byteSize = Number(payload.byteSize ?? 0) >>> 0;
  const usageInfo = d3d8BufferUsageInfo(payload.usage);
  const target = d3d8BufferTarget(kind);
  if (id === 0 || byteSize === 0 || target === 0 || d3d8BufferKindName(kind) === "unknown") {
    return 0;
  }

  const key = d3d8BufferKey(kind, id);
  const existing = d3d8Buffers.get(key);
  if (existing) {
    gl.deleteBuffer(existing.buffer);
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, byteSize, usageInfo.glUsage);
  const record = {
    id,
    kind,
    kindName: d3d8BufferKindName(kind),
    byteSize,
    target,
    buffer,
    bytes: new Uint8Array(byteSize),
    d3dUsage: usageInfo.d3dUsage,
    dynamic: usageInfo.dynamic,
    writeOnly: usageInfo.writeOnly,
    glUsage: usageInfo.glUsage,
    glUsageName: usageInfo.glUsageName,
    uploads: 0,
  };
  d3d8Buffers.set(key, record);
  d3d8BufferStats.creates += 1;
  d3d8BufferStats.lastCreate = {
    id,
    kind: record.kindName,
    byteSize,
    d3dUsage: record.d3dUsage,
    dynamic: record.dynamic,
    writeOnly: record.writeOnly,
    glUsage: record.glUsageName,
  };
  if (record.dynamic) {
    d3d8BufferStats.lastDynamicCreate = d3d8BufferStats.lastCreate;
  } else if (record.writeOnly) {
    d3d8BufferStats.lastStaticCreate = d3d8BufferStats.lastCreate;
  }
  updateD3D8BufferSummary();
  return 1;
}

function updateD3D8Buffer(payload = {}) {
  if (!gl || !(payload.bytes instanceof Uint8Array)) {
    return 0;
  }
  const kind = Number(payload.kind ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const bytes = payload.bytes;
  const byteOffset = Number(payload.byteOffset ?? 0) >>> 0;
  const lockFlags = Number(payload.lockFlags ?? 0) >>> 0;
  const requiredByteSize = byteOffset + bytes.byteLength;
  const key = d3d8BufferKey(kind, id);
  let resource = d3d8Buffers.get(key);
  if (!resource) {
    if (!createD3D8Buffer({ kind, id, byteSize: requiredByteSize, usage: payload.usage })) {
      return 0;
    }
    resource = d3d8Buffers.get(key);
  }
  if (!resource || bytes.byteLength === 0) {
    return 0;
  }

  gl.bindBuffer(resource.target, resource.buffer);
  let resized = false;
  let orphaned = false;
  if (requiredByteSize > resource.byteSize) {
    gl.bufferData(resource.target, requiredByteSize, resource.glUsage);
    resource.byteSize = requiredByteSize;
    resized = true;
  } else if (resource.dynamic && (lockFlags & D3DLOCK_DISCARD)) {
    gl.bufferData(resource.target, resource.byteSize, resource.glUsage);
    orphaned = true;
  }
  if (!(resource.bytes instanceof Uint8Array)) {
    resource.bytes = new Uint8Array(resource.byteSize);
  } else if (resource.bytes.byteLength < resource.byteSize) {
    const mirror = new Uint8Array(resource.byteSize);
    mirror.set(resource.bytes.subarray(0, Math.min(resource.bytes.byteLength, mirror.byteLength)));
    resource.bytes = mirror;
  }
  if (resource.dynamic && (lockFlags & D3DLOCK_DISCARD)) {
    resource.bytes.fill(0);
  }
  resource.bytes.set(bytes, byteOffset);
  gl.bufferSubData(resource.target, byteOffset, bytes);
  resource.uploads += 1;
  d3d8BufferStats.updates += 1;
  d3d8BufferStats.lastUpdate = {
    id,
    kind: resource.kindName,
    byteOffset,
    byteSize: bytes.byteLength,
    d3dUsage: resource.d3dUsage,
    glUsage: resource.glUsageName,
    lockFlags,
    discard: Boolean(lockFlags & D3DLOCK_DISCARD),
    noOverwrite: Boolean(lockFlags & D3DLOCK_NOOVERWRITE),
    orphaned,
    resized,
    uploads: resource.uploads,
  };
  updateD3D8BufferSummary();
  return 1;
}

function releaseD3D8Buffer(payload = {}) {
  if (!gl) {
    return 0;
  }
  const kind = Number(payload.kind ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const key = d3d8BufferKey(kind, id);
  const resource = d3d8Buffers.get(key);
  if (!resource) {
    return 0;
  }
  gl.deleteBuffer(resource.buffer);
  d3d8Buffers.delete(key);
  d3d8BufferStats.releases += 1;
  d3d8BufferStats.lastRelease = { id, kind: resource.kindName };
  updateD3D8BufferSummary();
  return 1;
}

function d3d8TextureLevelSize(resource, level) {
  let width = resource.width;
  let height = resource.height;
  let depth = resource.depth ?? 1;
  for (let index = 0; index < level; ++index) {
    width = Math.max(1, width >> 1);
    height = Math.max(1, height >> 1);
    depth = Math.max(1, depth >> 1);
  }
  return { width, height, depth };
}

function scale5(value) {
  return (value << 3) | (value >> 2);
}

function scale4(value) {
  return (value << 4) | value;
}

function d3d8TextureFormatInfo(format) {
  const d3dFormat = Number(format ?? 0) >>> 0;
  switch (d3dFormat) {
    case D3DFMT_R8G8B8:
    case D3DFMT_A8R8G8B8:
    case D3DFMT_X8R8G8B8:
    case D3DFMT_A1R5G5B5:
    case D3DFMT_A4R4G4B4:
    case D3DFMT_X1R5G5B5:
    case D3DFMT_X4R4G4B4:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        storage: "rgba8",
      };
    case D3DFMT_R5G6B5:
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.RGB565,
        format: gl.RGB,
        type: gl.UNSIGNED_SHORT_5_6_5,
        storage: "rgb565",
      };
    case D3DFMT_A8:
      // D3D8 fixed-function sampler contract for A8: RGB = 0, A = alpha.
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.R8,
        format: gl.RED,
        type: gl.UNSIGNED_BYTE,
        storage: "r8-alpha",
        swizzle: { r: gl.ZERO, g: gl.ZERO, b: gl.ZERO, a: gl.RED },
        semantic: "alpha",
      };
    case D3DFMT_L8:
      // D3D8 fixed-function sampler contract for L8: RGB = luminance, A = 1.
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.R8,
        format: gl.RED,
        type: gl.UNSIGNED_BYTE,
        storage: "r8-luminance",
        swizzle: { r: gl.RED, g: gl.RED, b: gl.RED, a: gl.ONE },
        semantic: "luminance",
      };
    case D3DFMT_A8L8:
      // D3D8 fixed-function sampler contract for A8L8: RGB = luminance, A = alpha.
      return {
        d3dFormat,
        supported: true,
        internalFormat: gl.RG8,
        format: gl.RG,
        type: gl.UNSIGNED_BYTE,
        storage: "rg8-luminance-alpha",
        swizzle: { r: gl.RED, g: gl.RED, b: gl.RED, a: GL_GREEN },
        semantic: "luminanceAlpha",
      };
    case D3DFMT_DXT1:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGB_S3TC_DXT1_EXT,
        format: 0,
        type: 0,
        storage: "dxt1",
        blockBytes: 8,
      } : {
        d3dFormat,
        supported: false,
        reason: "WEBGL_compressed_texture_s3tc is unavailable for DXT1 upload",
      };
    case D3DFMT_DXT2:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT,
        format: 0,
        type: 0,
        storage: "dxt2",
        aliasedStorage: "dxt3",
        premultipliedAlpha: true,
        blockBytes: 16,
      } : {
        d3dFormat,
        supported: false,
        reason: "WEBGL_compressed_texture_s3tc is unavailable for DXT2 upload",
      };
    case D3DFMT_DXT3:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT,
        format: 0,
        type: 0,
        storage: "dxt3",
        blockBytes: 16,
      } : {
        d3dFormat,
        supported: false,
        reason: "WEBGL_compressed_texture_s3tc is unavailable for DXT3 upload",
      };
    case D3DFMT_DXT4:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
        format: 0,
        type: 0,
        storage: "dxt4",
        aliasedStorage: "dxt5",
        premultipliedAlpha: true,
        blockBytes: 16,
      } : {
        d3dFormat,
        supported: false,
        reason: "WEBGL_compressed_texture_s3tc is unavailable for DXT4 upload",
      };
    case D3DFMT_DXT5:
      return s3tc ? {
        d3dFormat,
        supported: true,
        compressed: true,
        internalFormat: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
        format: 0,
        type: 0,
        storage: "dxt5",
        blockBytes: 16,
      } : {
        d3dFormat,
        supported: false,
        reason: "WEBGL_compressed_texture_s3tc is unavailable for DXT5 upload",
      };
    case D3DFMT_P8:
      return {
        d3dFormat,
        supported: false,
        reason: "P8 needs the engine palette before WebGL upload",
      };
    default:
      return {
        d3dFormat,
        supported: false,
        reason: "format is not implemented by the initial uncompressed texture bridge",
      };
  }
}

function convertD3D8TextureBytes(format, bytes, width, height, depth = 1) {
  const d3dFormat = Number(format ?? 0) >>> 0;
  const pixelCount = width * height * depth;
  if (d3dFormat === D3DFMT_A8R8G8B8 || d3dFormat === D3DFMT_X8R8G8B8) {
    const output = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; ++pixel) {
      const source = pixel * 4;
      const target = pixel * 4;
      output[target] = bytes[source + 2];
      output[target + 1] = bytes[source + 1];
      output[target + 2] = bytes[source];
      output[target + 3] = d3dFormat === D3DFMT_X8R8G8B8 ? 255 : bytes[source + 3];
    }
    return output;
  }
  if (d3dFormat === D3DFMT_R8G8B8) {
    const output = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; ++pixel) {
      const source = pixel * 3;
      const target = pixel * 4;
      output[target] = bytes[source + 2];
      output[target + 1] = bytes[source + 1];
      output[target + 2] = bytes[source];
      output[target + 3] = 255;
    }
    return output;
  }
  if (d3dFormat === D3DFMT_A1R5G5B5 || d3dFormat === D3DFMT_X1R5G5B5) {
    const output = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; ++pixel) {
      const source = pixel * 2;
      const value = bytes[source] | (bytes[source + 1] << 8);
      const target = pixel * 4;
      output[target] = scale5((value >> 10) & 0x1f);
      output[target + 1] = scale5((value >> 5) & 0x1f);
      output[target + 2] = scale5(value & 0x1f);
      output[target + 3] = d3dFormat === D3DFMT_X1R5G5B5 ? 255 : (value & 0x8000) ? 255 : 0;
    }
    return output;
  }
  if (d3dFormat === D3DFMT_A4R4G4B4 || d3dFormat === D3DFMT_X4R4G4B4) {
    const output = new Uint8Array(pixelCount * 4);
    for (let pixel = 0; pixel < pixelCount; ++pixel) {
      const source = pixel * 2;
      const value = bytes[source] | (bytes[source + 1] << 8);
      const target = pixel * 4;
      output[target] = scale4((value >> 8) & 0x0f);
      output[target + 1] = scale4((value >> 4) & 0x0f);
      output[target + 2] = scale4(value & 0x0f);
      output[target + 3] = d3dFormat === D3DFMT_X4R4G4B4 ? 255 : scale4((value >> 12) & 0x0f);
    }
    return output;
  }
  return bytes;
}

function d3d8TextureUploadView(info, bytes) {
  if (info.type !== gl.UNSIGNED_SHORT_5_6_5) {
    return bytes;
  }
  const copy = new Uint8Array(bytes);
  return new Uint16Array(copy.buffer);
}

function applyD3D8TextureSwizzleIfChanged(resource, info) {
  if (!resource || !info?.swizzle) {
    return null;
  }
  if (resource.swizzleStorage === info.storage) {
    return resource.swizzleApplied || null;
  }
  // Keep the raw R/RG texture storage stable; the draw shader reconstructs
  // D3D8 legacy sampler semantics before the fixed-function combiner runs.
  resource.swizzleStorage = info.storage;
  resource.swizzleSemantic = info.semantic;
  resource.swizzleApplied = {
    r: info.swizzle.r,
    g: info.swizzle.g,
    b: info.swizzle.b,
    a: info.swizzle.a,
    semantic: info.semantic,
    storage: info.storage,
    appliedBy: "shader",
  };
  return resource.swizzleApplied;
}

function decodeLegacyD3D8PixelFromRgba(rgba, semantic) {
  if (!Array.isArray(rgba) || rgba.length < 4) {
    return null;
  }
  switch (semantic) {
    case "alpha":
    case "luminance":
      return [rgba[0]];
    case "luminanceAlpha":
      return [rgba[0], rgba[1]];
    default:
      return null;
  }
}

function d3dTextureAddressToGl(address) {
  switch (Number(address) >>> 0) {
    case D3DTADDRESS_WRAP:
      return { value: gl.REPEAT, supported: true, name: "repeat" };
    case D3DTADDRESS_MIRROR:
      return { value: gl.MIRRORED_REPEAT, supported: true, name: "mirroredRepeat" };
    case D3DTADDRESS_CLAMP:
      return { value: gl.CLAMP_TO_EDGE, supported: true, name: "clampToEdge" };
    case D3DTADDRESS_BORDER:
      return { value: gl.CLAMP_TO_EDGE, supported: false, name: "borderFallbackClamp" };
    case D3DTADDRESS_MIRRORONCE:
      return { value: gl.MIRRORED_REPEAT, supported: false, name: "mirrorOnceFallbackMirror" };
    default:
      return { value: gl.CLAMP_TO_EDGE, supported: false, name: "unknownFallbackClamp" };
  }
}

function d3dTextureMagFilterToGl(filter) {
  switch (Number(filter) >>> 0) {
    case D3DTEXF_POINT:
      return { value: gl.NEAREST, supported: true, name: "nearest" };
    case D3DTEXF_LINEAR:
    case D3DTEXF_ANISOTROPIC:
      return { value: gl.LINEAR, supported: true, name: "linear" };
    default:
      return { value: gl.NEAREST, supported: false, name: "unknownFallbackNearest" };
  }
}

function d3dTextureMinFilterToGl(minFilter, mipFilter, hasCompleteMipChain) {
  const min = Number(minFilter) >>> 0;
  const mip = Number(mipFilter) >>> 0;
  const linearMin = min === D3DTEXF_LINEAR || min === D3DTEXF_ANISOTROPIC;
  const base = linearMin ? gl.LINEAR : gl.NEAREST;
  const supportedMin = min === D3DTEXF_POINT || min === D3DTEXF_LINEAR || min === D3DTEXF_ANISOTROPIC;
  if (mip === D3DTEXF_NONE || !hasCompleteMipChain) {
    return {
      value: base,
      supported: supportedMin && (mip === D3DTEXF_NONE || mip === D3DTEXF_POINT || mip === D3DTEXF_LINEAR),
      name: base === gl.LINEAR ? "linear" : "nearest",
      usedMipmaps: false,
      requestedMipmaps: mip !== D3DTEXF_NONE,
      fallbackReason: mip !== D3DTEXF_NONE && !hasCompleteMipChain ? "incomplete mip chain" : null,
    };
  }
  if (mip === D3DTEXF_POINT) {
    return {
      value: linearMin ? gl.LINEAR_MIPMAP_NEAREST : gl.NEAREST_MIPMAP_NEAREST,
      supported: supportedMin,
      name: linearMin ? "linearMipmapNearest" : "nearestMipmapNearest",
      usedMipmaps: true,
      requestedMipmaps: true,
      fallbackReason: null,
    };
  }
  if (mip === D3DTEXF_LINEAR) {
    return {
      value: linearMin ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_LINEAR,
      supported: supportedMin,
      name: linearMin ? "linearMipmapLinear" : "nearestMipmapLinear",
      usedMipmaps: true,
      requestedMipmaps: true,
      fallbackReason: null,
    };
  }
  return {
    value: base,
    supported: false,
    name: base === gl.LINEAR ? "unknownMipFallbackLinear" : "unknownMipFallbackNearest",
    usedMipmaps: false,
    requestedMipmaps: true,
    fallbackReason: "unsupported mip filter",
  };
}

function d3dDwordToFloat(value) {
  d3d8FloatView.setUint32(0, Number(value) >>> 0, true);
  const decoded = d3d8FloatView.getFloat32(0, true);
  return Number.isFinite(decoded) ? decoded : 0.0;
}

function d3dColorToNormalizedRgba(value) {
  const color = Number(value) >>> 0;
  return [
    ((color >>> 16) & 0xff) / 255,
    ((color >>> 8) & 0xff) / 255,
    (color & 0xff) / 255,
    ((color >>> 24) & 0xff) / 255,
  ];
}

const DEFAULT_D3D8_MATERIAL = {
  diffuse: [1, 1, 1, 1],
  ambient: [1, 1, 1, 1],
  specular: [0, 0, 0, 0],
  emissive: [0, 0, 0, 0],
  power: 1,
};

function normalizeD3D8ColorValue(value, fallback) {
  const source = Array.isArray(value)
    ? value
    : [value?.r, value?.g, value?.b, value?.a];
  return [0, 1, 2, 3].map((index) => {
    const component = Number(source[index] ?? fallback[index]);
    return Number.isFinite(component) ? component : fallback[index];
  });
}

function normalizeD3D8Material(material = {}) {
  const source = material ?? {};
  const power = Number(source.power ?? DEFAULT_D3D8_MATERIAL.power);
  return {
    diffuse: normalizeD3D8ColorValue(source.diffuse, DEFAULT_D3D8_MATERIAL.diffuse),
    ambient: normalizeD3D8ColorValue(source.ambient, DEFAULT_D3D8_MATERIAL.ambient),
    specular: normalizeD3D8ColorValue(source.specular, DEFAULT_D3D8_MATERIAL.specular),
    emissive: normalizeD3D8ColorValue(source.emissive, DEFAULT_D3D8_MATERIAL.emissive),
    power: Number.isFinite(power) ? power : DEFAULT_D3D8_MATERIAL.power,
  };
}

function normalizeD3D8Vector3(value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value)
    ? value
    : [value?.x, value?.y, value?.z];
  return [0, 1, 2].map((index) => {
    const component = Number(source[index] ?? fallback[index]);
    return Number.isFinite(component) ? component : fallback[index];
  });
}

function normalizeD3D8Light(light = {}, index = 0) {
  return {
    index: Number(light?.index ?? index) >>> 0,
    type: Number(light?.type ?? 0) >>> 0,
    enabled: Number(light?.enabled ?? 0) !== 0,
    diffuse: normalizeD3D8ColorValue(light?.diffuse, [0, 0, 0, 1]),
    specular: normalizeD3D8ColorValue(light?.specular, [0, 0, 0, 1]),
    ambient: normalizeD3D8ColorValue(light?.ambient, [0, 0, 0, 1]),
    position: normalizeD3D8Vector3(light?.position),
    direction: normalizeD3D8Vector3(light?.direction, [0, 0, 1]),
    range: finiteNumber(light?.range, 0),
    falloff: finiteNumber(light?.falloff, 0),
    attenuation0: finiteNumber(light?.attenuation0, 0),
    attenuation1: finiteNumber(light?.attenuation1, 0),
    attenuation2: finiteNumber(light?.attenuation2, 0),
    theta: finiteNumber(light?.theta, 0),
    phi: finiteNumber(light?.phi, 0),
  };
}

function normalizeD3D8Lights(lights) {
  return Array.from({ length: D3D8_LIGHT_COUNT }, (_, index) =>
    normalizeD3D8Light(Array.isArray(lights) ? lights[index] : null, index));
}

function d3d8DirectionalLights(lights) {
  return lights
    .filter((light) => light.enabled && light.type === D3DLIGHT_DIRECTIONAL)
    .slice(0, D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT);
}

function d3d8FixedFunctionLights(lights) {
  return lights
    .filter((light) => light.enabled
      && (light.type === D3DLIGHT_POINT
        || light.type === D3DLIGHT_SPOT
        || light.type === D3DLIGHT_DIRECTIONAL))
    .slice(0, D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT);
}

function flattenD3D8LightType(lights) {
  const values = [];
  for (let index = 0; index < D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT; ++index) {
    values.push(lights[index]?.type ?? 0);
  }
  return new Int32Array(values);
}

function flattenD3D8LightColor(lights, field, count = D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT) {
  const values = [];
  for (let index = 0; index < count; ++index) {
    values.push(...(lights[index]?.[field] ?? [0, 0, 0, 1]));
  }
  return new Float32Array(values);
}

function flattenD3D8LightVector(lights, field, fallback, count = D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT) {
  const values = [];
  for (let index = 0; index < count; ++index) {
    values.push(...(lights[index]?.[field] ?? fallback));
  }
  return new Float32Array(values);
}

function flattenD3D8LightDirection(lights, count = D3D8_DIRECTIONAL_LIGHT_UNIFORM_COUNT) {
  return flattenD3D8LightVector(lights, "direction", [0, 0, 1], count);
}

function flattenD3D8LightRangeAttenuation(lights) {
  const values = [];
  for (let index = 0; index < D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT; ++index) {
    const light = lights[index] ?? {};
    values.push(
      finiteNumber(light.range, 0),
      finiteNumber(light.attenuation0, 0),
      finiteNumber(light.attenuation1, 0),
      finiteNumber(light.attenuation2, 0),
    );
  }
  return new Float32Array(values);
}

function flattenD3D8LightSpot(lights) {
  const values = [];
  for (let index = 0; index < D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT; ++index) {
    const light = lights[index] ?? {};
    values.push(
      finiteNumber(light.theta, 0),
      finiteNumber(light.phi, 0),
      finiteNumber(light.falloff, 0),
    );
  }
  return new Float32Array(values);
}

function textureHasCompleteMipChain(resource) {
  if (!resource || resource.levels <= 1) {
    return false;
  }
  for (let level = 0; level < resource.levels; ++level) {
    if (!resource.initializedLevels.has(String(level))) {
      return false;
    }
  }
  return true;
}

function applyD3D8TextureSamplerToBoundTexture(stage, textureStage, resource) {
  if (!gl || !resource?.texture || !textureStage) {
    return null;
  }
  const completeMipChain = textureHasCompleteMipChain(resource);
  const min = d3dTextureMinFilterToGl(textureStage.minFilter, textureStage.mipFilter, completeMipChain);
  const mag = d3dTextureMagFilterToGl(textureStage.magFilter);
  const wrapS = d3dTextureAddressToGl(textureStage.addressU);
  const wrapT = d3dTextureAddressToGl(textureStage.addressV);
  const levelCount = Math.max(1, Number(resource.levels ?? 1) >>> 0);
  const highestLevel = levelCount - 1;
  const requestedMaxMipLevel = Number(textureStage.maxMipLevel ?? 0) >>> 0;
  const baseLevel = completeMipChain ? Math.min(requestedMaxMipLevel, highestLevel) : 0;
  const maxLevel = completeMipChain ? Math.max(baseLevel, highestLevel) : 0;
  const lodBiasBits = Number(textureStage.mipMapLodBias ?? 0) >>> 0;
  const lodBias = d3dDwordToFloat(lodBiasBits);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min.value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag.value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS.value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT.value);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, baseLevel);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, maxLevel);

  const applied = {
    stage,
    textureId: resource.id,
    d3d: {
      minFilter: Number(textureStage.minFilter) >>> 0,
      magFilter: Number(textureStage.magFilter) >>> 0,
      mipFilter: Number(textureStage.mipFilter) >>> 0,
      addressU: Number(textureStage.addressU) >>> 0,
      addressV: Number(textureStage.addressV) >>> 0,
      maxMipLevel: requestedMaxMipLevel,
      mipMapLodBiasBits: lodBiasBits,
      mipMapLodBias: lodBias,
    },
    gl: {
      minFilter: min.value,
      magFilter: mag.value,
      wrapS: wrapS.value,
      wrapT: wrapT.value,
      baseLevel,
      maxLevel,
      lodBias,
      lodBiasSource: "shader",
    },
    names: {
      minFilter: min.name,
      magFilter: mag.name,
      wrapS: wrapS.name,
      wrapT: wrapT.name,
    },
    completeMipChain,
    maxMipLevelClamped: requestedMaxMipLevel !== baseLevel,
    usedMipmaps: min.usedMipmaps,
    requestedMipmaps: min.requestedMipmaps,
    fallbackReason: min.fallbackReason,
    supported: min.supported && mag.supported && wrapS.supported && wrapT.supported,
  };
  resource.samplerState = applied;
  d3d8TextureStats.samplerApplications += 1;
  d3d8TextureStats.lastSampler = applied;
  updateD3D8TextureSummary();
  return applied;
}

function d3dTextureCombinerOpName(op) {
  switch (Number(op) >>> 0) {
    case D3DTOP_DISABLE:
      return "disable";
    case D3DTOP_SELECTARG1:
      return "selectArg1";
    case D3DTOP_SELECTARG2:
      return "selectArg2";
    case D3DTOP_MODULATE:
      return "modulate";
    case D3DTOP_MODULATE2X:
      return "modulate2X";
    case D3DTOP_MODULATE4X:
      return "modulate4X";
    case D3DTOP_ADD:
      return "add";
    case D3DTOP_ADDSIGNED:
      return "addSigned";
    case D3DTOP_ADDSIGNED2X:
      return "addSigned2X";
    case D3DTOP_SUBTRACT:
      return "subtract";
    case D3DTOP_ADDSMOOTH:
      return "addSmooth";
    case D3DTOP_BLENDDIFFUSEALPHA:
      return "blendDiffuseAlpha";
    case D3DTOP_BLENDTEXTUREALPHA:
      return "blendTextureAlpha";
    case D3DTOP_BLENDFACTORALPHA:
      return "blendFactorAlpha";
    case D3DTOP_BLENDCURRENTALPHA:
      return "blendCurrentAlpha";
    case D3DTOP_DOTPRODUCT3:
      return "dotProduct3";
    case D3DTOP_MULTIPLYADD:
      return "multiplyAdd";
    case D3DTOP_LERP:
      return "lerp";
    default:
      return "unsupported";
  }
}

function d3dTextureCombinerOpSupported(op) {
  switch (Number(op) >>> 0) {
    case D3DTOP_DISABLE:
    case D3DTOP_SELECTARG1:
    case D3DTOP_SELECTARG2:
    case D3DTOP_MODULATE:
    case D3DTOP_MODULATE2X:
    case D3DTOP_MODULATE4X:
    case D3DTOP_ADD:
    case D3DTOP_ADDSIGNED:
    case D3DTOP_ADDSIGNED2X:
    case D3DTOP_SUBTRACT:
    case D3DTOP_ADDSMOOTH:
    case D3DTOP_BLENDDIFFUSEALPHA:
    case D3DTOP_BLENDTEXTUREALPHA:
    case D3DTOP_BLENDFACTORALPHA:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_DOTPRODUCT3:
    case D3DTOP_MULTIPLYADD:
    case D3DTOP_LERP:
      return true;
    default:
      return false;
  }
}

function d3dTextureCombinerOpUsesArg0(op) {
  const normalized = Number(op) >>> 0;
  return normalized === D3DTOP_MULTIPLYADD || normalized === D3DTOP_LERP;
}

function d3dTextureCombinerOpUsesArg1(op) {
  switch (Number(op) >>> 0) {
    case D3DTOP_SELECTARG1:
    case D3DTOP_MODULATE:
    case D3DTOP_MODULATE2X:
    case D3DTOP_MODULATE4X:
    case D3DTOP_ADD:
    case D3DTOP_ADDSIGNED:
    case D3DTOP_ADDSIGNED2X:
    case D3DTOP_SUBTRACT:
    case D3DTOP_ADDSMOOTH:
    case D3DTOP_BLENDDIFFUSEALPHA:
    case D3DTOP_BLENDTEXTUREALPHA:
    case D3DTOP_BLENDFACTORALPHA:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_DOTPRODUCT3:
    case D3DTOP_MULTIPLYADD:
    case D3DTOP_LERP:
      return true;
    default:
      return false;
  }
}

function d3dTextureCombinerOpUsesArg2(op) {
  switch (Number(op) >>> 0) {
    case D3DTOP_SELECTARG2:
    case D3DTOP_MODULATE:
    case D3DTOP_MODULATE2X:
    case D3DTOP_MODULATE4X:
    case D3DTOP_ADD:
    case D3DTOP_ADDSIGNED:
    case D3DTOP_ADDSIGNED2X:
    case D3DTOP_SUBTRACT:
    case D3DTOP_ADDSMOOTH:
    case D3DTOP_BLENDDIFFUSEALPHA:
    case D3DTOP_BLENDTEXTUREALPHA:
    case D3DTOP_BLENDFACTORALPHA:
    case D3DTOP_BLENDCURRENTALPHA:
    case D3DTOP_DOTPRODUCT3:
    case D3DTOP_MULTIPLYADD:
    case D3DTOP_LERP:
      return true;
    default:
      return false;
  }
}

function d3dTextureCombinerArgBaseName(arg) {
  switch ((Number(arg) >>> 0) & D3DTA_SELECTMASK) {
    case D3DTA_DIFFUSE:
      return "diffuse";
    case D3DTA_CURRENT:
      return "current";
    case D3DTA_TEXTURE:
      return "texture";
    case D3DTA_TFACTOR:
      return "textureFactor";
    case D3DTA_TEMP:
      return "temp";
    default:
      return "unsupported";
  }
}

function d3dTextureCombinerArgSupported(arg) {
  const normalized = Number(arg) >>> 0;
  const baseName = d3dTextureCombinerArgBaseName(normalized);
  const modifiers = normalized & ~D3DTA_SELECTMASK;
  return baseName !== "unsupported" && (modifiers & ~D3DTA_SUPPORTED_MODIFIERS) === 0;
}

function d3dTextureCombinerResultArgSupported(arg) {
  const normalized = Number(arg) >>> 0;
  return normalized === D3DTA_CURRENT || normalized === D3DTA_TEMP;
}

function d3dTextureCombinerArgName(arg) {
  const normalized = Number(arg) >>> 0;
  if (!d3dTextureCombinerArgSupported(normalized)) {
    return "unsupported";
  }
  let name = d3dTextureCombinerArgBaseName(normalized);
  if (normalized & D3DTA_ALPHAREPLICATE) {
    name += "AlphaReplicate";
  }
  if (normalized & D3DTA_COMPLEMENT) {
    name += "Complement";
  }
  return name;
}

function d3dTextureCoordinateModeName(mode) {
  switch (Number(mode) >>> 0) {
    case D3DTSS_TCI_PASSTHRU:
      return "passthru";
    case D3DTSS_TCI_CAMERASPACENORMAL:
      return "cameraSpaceNormal";
    case D3DTSS_TCI_CAMERASPACEPOSITION:
      return "cameraSpacePosition";
    case D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR:
      return "cameraSpaceReflectionVector";
    default:
      return "unsupported";
  }
}

function d3dTextureTransformFlagsName(flags) {
  const normalizedFlags = Number(flags) >>> 0;
  if (normalizedFlags === D3DTTFF_DISABLE) {
    return "disable";
  }
  const projected = (normalizedFlags & D3DTTFF_PROJECTED) !== 0;
  const count = normalizedFlags & ~D3DTTFF_PROJECTED;
  const suffix = projected ? "Projected" : "";
  switch (count) {
    case D3DTTFF_COUNT1:
      return `count1${suffix}`;
    case D3DTTFF_COUNT2:
      return `count2${suffix}`;
    case D3DTTFF_COUNT3:
      return `count3${suffix}`;
    case D3DTTFF_COUNT4:
      return `count4${suffix}`;
    default:
      return "unsupported";
  }
}

function d3dTextureTransformFlagsInfo(flags) {
  const normalizedFlags = Number(flags) >>> 0;
  const projected = (normalizedFlags & D3DTTFF_PROJECTED) !== 0;
  const count = normalizedFlags & ~D3DTTFF_PROJECTED;
  let componentCount = 0;
  switch (count) {
    case D3DTTFF_COUNT1:
    case D3DTTFF_COUNT2:
    case D3DTTFF_COUNT3:
    case D3DTTFF_COUNT4:
      componentCount = count;
      break;
    default:
      componentCount = 0;
      break;
  }
  const twoDSamplerSupported = normalizedFlags === D3DTTFF_DISABLE ||
    (!projected && componentCount >= 2 && componentCount <= 4) ||
    (projected && componentCount === 3);
  return {
    modeName: d3dTextureTransformFlagsName(normalizedFlags),
    componentCount,
    projected,
    twoDSamplerSupported,
  };
}

function d3d8TexCoordComponentCount(fvf, coordSet) {
  const encoded = (Number(fvf) >>> (16 + coordSet * 2)) & 0x3;
  switch (encoded) {
    case 1:
      return 3;
    case 2:
      return 4;
    case 3:
      return 1;
    case 0:
    default:
      return 2;
  }
}

function d3d8LegacyVertexLayoutInfo(vertexStride) {
  const stride = Number(vertexStride) >>> 0;
  return {
    source: "legacy-xyzn-duv",
    fvf: 0,
    stride,
    positionOffset: 0,
    positionComponents: 3,
    normalOffset: stride >= D3D8_NORMAL_MIN_STRIDE ? D3D8_NORMAL_OFFSET : null,
    diffuseOffset: stride >= D3D8_DIFFUSE_MIN_STRIDE ? D3D8_DIFFUSE_OFFSET : null,
    specularOffset: null,
    texCoords: Array.from({ length: D3D8_XYZNDUV_TEXCOORD_SETS }, (_, coordSet) => {
      const offset = D3D8_XYZNDUV_TEXCOORD0_OFFSET +
        (coordSet * D3D8_XYZNDUV_TEXCOORD_STRIDE);
      return {
        coordSet,
        offset,
        components: 2,
        available: stride >= offset + D3D8_XYZNDUV_TEXCOORD_STRIDE,
      };
    }),
  };
}

function d3d8VertexLayoutInfo(fvf, vertexStride) {
  const normalizedFvf = Number(fvf ?? 0) >>> 0;
  const stride = Number(vertexStride) >>> 0;
  if (normalizedFvf === 0) {
    return d3d8LegacyVertexLayoutInfo(stride);
  }

  let offset = 0;
  let positionComponents = 0;
  if ((normalizedFvf & D3DFVF_XYZRHW) === D3DFVF_XYZRHW) {
    positionComponents = 4;
    offset += 4 * 4;
  } else if ((normalizedFvf & D3DFVF_XYZB4) === D3DFVF_XYZB4) {
    positionComponents = 7;
    offset += 7 * 4;
  } else if ((normalizedFvf & D3DFVF_XYZ) === D3DFVF_XYZ) {
    positionComponents = 3;
    offset += 3 * 4;
  }

  const normalOffset = (normalizedFvf & D3DFVF_NORMAL) === D3DFVF_NORMAL
    ? offset
    : null;
  if ((normalizedFvf & D3DFVF_NORMAL) === D3DFVF_NORMAL) {
    offset += 3 * 4;
  }

  const diffuseOffset = (normalizedFvf & D3DFVF_DIFFUSE) === D3DFVF_DIFFUSE
    ? offset
    : null;
  if (diffuseOffset !== null) {
    offset += 4;
  }

  const specularOffset = (normalizedFvf & D3DFVF_SPECULAR) === D3DFVF_SPECULAR
    ? offset
    : null;
  if (specularOffset !== null) {
    offset += 4;
  }

  const texCoordCount = (normalizedFvf & D3DFVF_TEXCOUNT_MASK) >>> D3DFVF_TEXCOUNT_SHIFT;
  const texCoords = [];
  for (let coordSet = 0; coordSet < texCoordCount; ++coordSet) {
    const components = d3d8TexCoordComponentCount(normalizedFvf, coordSet);
    texCoords.push({
      coordSet,
      offset,
      components,
      available: components >= 2 && stride >= offset + 2 * 4,
    });
    offset += components * 4;
  }

  return {
    source: "fvf",
    fvf: normalizedFvf,
    stride,
    positionOffset: 0,
    positionComponents,
    normalOffset: normalOffset !== null && stride >= normalOffset + 3 * 4 ? normalOffset : null,
    diffuseOffset: diffuseOffset !== null && stride >= diffuseOffset + 4 ? diffuseOffset : null,
    specularOffset: specularOffset !== null && stride >= specularOffset + 4 ? specularOffset : null,
    texCoords,
    computedStride: offset,
  };
}

function textureStageCoordinateInfo(textureStage, stage, vertexStride, vertexLayout, textureTransform = null) {
  const texCoordIndex = Number(textureStage?.texCoordIndex ?? 0) >>> 0;
  const mode = texCoordIndex & D3DTSS_TCI_MODE_MASK;
  const coordSet = texCoordIndex & D3DTSS_TCI_COORDINDEX_MASK;
  const textureTransformFlags = Number(textureStage?.textureTransformFlags ?? D3DTTFF_DISABLE) >>> 0;
  const layout = vertexLayout ?? d3d8LegacyVertexLayoutInfo(vertexStride);
  const texCoord = Array.isArray(layout.texCoords) ? layout.texCoords[coordSet] : null;
  const texCoordOffset = Number(texCoord?.offset ?? 0) >>> 0;
  const passthru = mode === D3DTSS_TCI_PASSTHRU;
  const generated = mode === D3DTSS_TCI_CAMERASPACENORMAL ||
    mode === D3DTSS_TCI_CAMERASPACEPOSITION ||
    mode === D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR;
  const coordSetAvailable = Boolean(texCoord?.available);
  const transformInfo = d3dTextureTransformFlagsInfo(textureTransformFlags);
  const transformApplied = textureTransformFlags !== D3DTTFF_DISABLE &&
    textureTransform !== null &&
    transformInfo.twoDSamplerSupported;
  const transformSupported = textureTransformFlags === D3DTTFF_DISABLE || transformApplied;
  const coordinateSupported = (passthru && coordSetAvailable) || generated;
  return {
    stage,
    texCoordIndex,
    mode,
    modeName: d3dTextureCoordinateModeName(mode),
    coordSet,
    layoutSource: layout.source,
    offset: passthru && coordSetAvailable ? texCoordOffset : null,
    components: passthru && coordSetAvailable ? texCoord.components : generated ? 3 : 0,
    generated,
    usesVertexTexCoord: passthru,
    textureTransformFlags,
    textureTransformModeName: transformInfo.modeName,
    textureTransformComponentCount: transformInfo.componentCount,
    textureTransformProjected: transformInfo.projected,
    transformSupported,
    transformApplied,
    supported: coordinateSupported && transformSupported,
  };
}

function textureStageCombinerInfo(textureStage, stage, canSampleTexture) {
  if (!textureStage) {
    return null;
  }
  const colorOp = Number(textureStage.colorOp) >>> 0;
  const colorArg0 = Number(textureStage.colorArg0) >>> 0;
  const colorArg1 = Number(textureStage.colorArg1) >>> 0;
  const colorArg2 = Number(textureStage.colorArg2) >>> 0;
  const resultArg = Number(textureStage.resultArg) >>> 0;
  const colorArg0Base = colorArg0 & D3DTA_SELECTMASK;
  const colorArg1Base = colorArg1 & D3DTA_SELECTMASK;
  const colorArg2Base = colorArg2 & D3DTA_SELECTMASK;
  const colorNeedsArg0 = d3dTextureCombinerOpUsesArg0(colorOp);
  const colorNeedsArg1 = d3dTextureCombinerOpUsesArg1(colorOp);
  const colorNeedsArg2 = d3dTextureCombinerOpUsesArg2(colorOp);
  const supportedOp = d3dTextureCombinerOpSupported(colorOp);
  const supportedArg0 = !colorNeedsArg0 || d3dTextureCombinerArgSupported(colorArg0);
  const supportedArg1 = !colorNeedsArg1 || d3dTextureCombinerArgSupported(colorArg1);
  const supportedArg2 = !colorNeedsArg2 || d3dTextureCombinerArgSupported(colorArg2);
  const supportedResultArg = d3dTextureCombinerResultArgSupported(resultArg);
  const needsTexture = (colorNeedsArg0 && colorArg0Base === D3DTA_TEXTURE)
    || (colorNeedsArg1 && colorArg1Base === D3DTA_TEXTURE)
    || (colorNeedsArg2 && colorArg2Base === D3DTA_TEXTURE);
  const alphaOp = Number(textureStage.alphaOp) >>> 0;
  const alphaArg0 = Number(textureStage.alphaArg0) >>> 0;
  const alphaArg1 = Number(textureStage.alphaArg1) >>> 0;
  const alphaArg2 = Number(textureStage.alphaArg2) >>> 0;
  const alphaArg0Base = alphaArg0 & D3DTA_SELECTMASK;
  const alphaArg1Base = alphaArg1 & D3DTA_SELECTMASK;
  const alphaArg2Base = alphaArg2 & D3DTA_SELECTMASK;
  const stageAlphaPassesCurrent = alphaOp === D3DTOP_SELECTARG2 && alphaArg2Base === D3DTA_CURRENT;
  const alphaNeedsArg0 = d3dTextureCombinerOpUsesArg0(alphaOp);
  const alphaNeedsArg1 = d3dTextureCombinerOpUsesArg1(alphaOp);
  const alphaNeedsArg2 = d3dTextureCombinerOpUsesArg2(alphaOp);
  const supportedAlphaOp = stage <= 1
    ? d3dTextureCombinerOpSupported(alphaOp)
    : alphaOp === D3DTOP_DISABLE || stageAlphaPassesCurrent;
  const supportedAlphaArg0 = !alphaNeedsArg0 || d3dTextureCombinerArgSupported(alphaArg0);
  const supportedAlphaArg1 = !alphaNeedsArg1 || d3dTextureCombinerArgSupported(alphaArg1);
  const supportedAlphaArg2 = !alphaNeedsArg2 || d3dTextureCombinerArgSupported(alphaArg2);
  const needsTextureAlpha = (alphaNeedsArg0 && alphaArg0Base === D3DTA_TEXTURE)
    || (alphaNeedsArg1 && alphaArg1Base === D3DTA_TEXTURE)
    || (alphaNeedsArg2 && alphaArg2Base === D3DTA_TEXTURE);
  return {
    stage,
    colorOp,
    colorArg0,
    colorArg1,
    colorArg2,
    resultArg,
    alphaOp,
    alphaArg0,
    alphaArg1,
    alphaArg2,
    opName: d3dTextureCombinerOpName(colorOp),
    arg0Name: d3dTextureCombinerArgName(colorArg0),
    arg1Name: d3dTextureCombinerArgName(colorArg1),
    arg2Name: d3dTextureCombinerArgName(colorArg2),
    resultArgName: d3dTextureCombinerArgName(resultArg),
    alphaOpName: d3dTextureCombinerOpName(alphaOp),
    alphaArg0Name: d3dTextureCombinerArgName(alphaArg0),
    alphaArg1Name: d3dTextureCombinerArgName(alphaArg1),
    alphaArg2Name: d3dTextureCombinerArgName(alphaArg2),
    supportsColorOp: supportedOp,
    supportsColorArgs: supportedArg0 && supportedArg1 && supportedArg2,
    supportsResultArg: supportedResultArg,
    supportsAlphaOp: supportedAlphaOp,
    supportsAlphaArgs: supportedAlphaArg0 && supportedAlphaArg1 && supportedAlphaArg2,
    textureAvailable: Boolean(canSampleTexture),
    supported: supportedOp && supportedArg0 && supportedArg1 && supportedArg2 && supportedResultArg
      && supportedAlphaOp && supportedAlphaArg0 && supportedAlphaArg1 && supportedAlphaArg2
      && (!needsTexture || canSampleTexture)
      && (!needsTextureAlpha || canSampleTexture),
  };
}

function d3d8TextureSemanticMode(resource) {
  switch (resource?.semantic) {
    case "alpha":
      return 1;
    case "luminance":
      return 2;
    case "luminanceAlpha":
      return 3;
    default:
      return 0;
  }
}

function withPreservedD3D8TextureBinding(target, callback) {
  if (!gl) {
    return null;
  }
  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0);
  const binding = target === gl.TEXTURE_3D ? gl.TEXTURE_BINDING_3D : gl.TEXTURE_BINDING_2D;
  const previousTexture = gl.getParameter(binding);
  try {
    return callback();
  } finally {
    gl.bindTexture(target, previousTexture);
    gl.activeTexture(previousActiveTexture);
  }
}

function withPreservedD3D8TextureUnit(callback) {
  if (!gl) {
    return null;
  }
  return withPreservedD3D8TextureBinding(gl.TEXTURE_2D, callback);
}

function sampleD3D8TexturePixel(resource, x, y) {
  if (!gl || !resource?.texture || (resource.target ?? gl.TEXTURE_2D) !== gl.TEXTURE_2D) {
    return null;
  }
  const framebuffer = gl.createFramebuffer();
  const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resource.texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  let pixel = null;
  if (status === gl.FRAMEBUFFER_COMPLETE) {
    const readX = Math.max(0, Math.min(resource.width - 1, Math.trunc(x)));
    const readY = Math.max(0, Math.min(resource.height - 1, Math.trunc(y)));
    const pixels = new Uint8Array(4);
    gl.readPixels(readX, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    pixel = Array.from(pixels);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  gl.deleteFramebuffer(framebuffer);
  return pixel;
}

function sampleD3D8TextureProbe(resource) {
  if (!resource?.width || !resource?.height) {
    return null;
  }
  return {
    topLeft: sampleD3D8TexturePixel(resource, 0, 0),
    center: sampleD3D8TexturePixel(
      resource,
      Math.floor(resource.width / 2),
      Math.floor(resource.height / 2),
    ),
    bottomRight: sampleD3D8TexturePixel(resource, resource.width - 1, resource.height - 1),
  };
}

function updateD3D8TextureSummary() {
  d3d8TextureStats.live = d3d8Textures.size;
  const boundTextures = {};
  for (const [stage, textureId] of d3d8BoundTextures.entries()) {
    boundTextures[String(stage)] = textureId;
  }
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8Textures: {
      creates: d3d8TextureStats.creates,
      updates: d3d8TextureStats.updates,
      releases: d3d8TextureStats.releases,
      binds: d3d8TextureStats.binds,
      unbinds: d3d8TextureStats.unbinds,
      releaseUnbinds: d3d8TextureStats.releaseUnbinds,
      missingBinds: d3d8TextureStats.missingBinds,
      unsupportedUpdates: d3d8TextureStats.unsupportedUpdates,
      samplerApplications: d3d8TextureStats.samplerApplications,
      live: d3d8TextureStats.live,
      legacyUploads: d3d8TextureStats.legacyUploads,
      boundTextures,
      lastCreate: d3d8TextureStats.lastCreate,
      lastUpdate: d3d8TextureStats.lastUpdate,
      lastSubrectUpdate: d3d8TextureStats.lastSubrectUpdate,
      lastRelease: d3d8TextureStats.lastRelease,
      lastBind: d3d8TextureStats.lastBind,
      lastReleaseUnbind: d3d8TextureStats.lastReleaseUnbind,
      lastMissingBind: d3d8TextureStats.lastMissingBind,
      lastUnsupported: d3d8TextureStats.lastUnsupported,
      lastSampler: d3d8TextureStats.lastSampler,
    },
  };
}

function createD3D8Texture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  const levels = Math.max(1, Number(payload.levels ?? 1) >>> 0);
  const format = Number(payload.format ?? 0) >>> 0;
  if (id === 0 || width === 0 || height === 0) {
    return 0;
  }

  const existing = d3d8Textures.get(id);
  if (existing) {
    gl.deleteTexture(existing.texture);
  }

  const texture = gl.createTexture();
  withPreservedD3D8TextureUnit(() => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  });
  const resource = {
    id,
    width,
    height,
    levels,
    format,
    usage: Number(payload.usage ?? 0) >>> 0,
    pool: Number(payload.pool ?? 0) >>> 0,
    texture,
    target: gl.TEXTURE_2D,
    type: "2d",
    depth: 1,
    initializedLevels: new Set(),
    levelFormats: new Map(),
    uploads: 0,
    samplerState: null,
  };
  d3d8Textures.set(id, resource);
  d3d8TextureStats.creates += 1;
  d3d8TextureStats.lastCreate = {
    id,
    width,
    height,
    depth: resource.depth,
    levels,
    format,
    type: resource.type,
    usage: resource.usage,
    pool: resource.pool,
  };
  updateD3D8TextureSummary();
  return 1;
}

function createD3D8VolumeTexture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  const depth = Number(payload.depth ?? 0) >>> 0;
  const levels = Math.max(1, Number(payload.levels ?? 1) >>> 0);
  const format = Number(payload.format ?? 0) >>> 0;
  if (id === 0 || width === 0 || height === 0 || depth === 0) {
    return 0;
  }

  const existing = d3d8Textures.get(id);
  if (existing) {
    gl.deleteTexture(existing.texture);
  }

  const texture = gl.createTexture();
  withPreservedD3D8TextureBinding(gl.TEXTURE_3D, () => {
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  });
  const resource = {
    id,
    width,
    height,
    depth,
    levels,
    format,
    usage: Number(payload.usage ?? 0) >>> 0,
    pool: Number(payload.pool ?? 0) >>> 0,
    texture,
    target: gl.TEXTURE_3D,
    type: "volume",
    initializedLevels: new Set(),
    levelFormats: new Map(),
    uploads: 0,
    samplerState: null,
  };
  d3d8Textures.set(id, resource);
  d3d8TextureStats.creates += 1;
  d3d8TextureStats.lastCreate = {
    id,
    width,
    height,
    depth,
    levels,
    format,
    type: resource.type,
    usage: resource.usage,
    pool: resource.pool,
  };
  updateD3D8TextureSummary();
  return 1;
}

function updateD3D8Texture(payload = {}) {
  if (!gl || !(payload.bytes instanceof Uint8Array)) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const level = Number(payload.level ?? 0) >>> 0;
  const x = Number(payload.x ?? 0) >>> 0;
  const y = Number(payload.y ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  const format = Number(payload.format ?? 0) >>> 0;
  let resource = d3d8Textures.get(id);
  if (!resource) {
    if (!createD3D8Texture({ id, width, height, levels: level + 1, format, usage: payload.usage })) {
      return 0;
    }
    resource = d3d8Textures.get(id);
  }
  if (!resource || (resource.target ?? gl.TEXTURE_2D) !== gl.TEXTURE_2D ||
      width === 0 || height === 0 || level >= resource.levels) {
    return 0;
  }

  const info = d3d8TextureFormatInfo(format);
  if (!info.supported) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      reason: info.reason,
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const levelSize = d3d8TextureLevelSize(resource, level);
  if (x + width > levelSize.width || y + height > levelSize.height) {
    return 0;
  }

  if (info.compressed && (x !== 0 || y !== 0 || width !== levelSize.width || height !== levelSize.height)) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      reason: "compressed DXT sub-rectangle updates are not implemented",
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const convertedBytes = info.compressed
    ? payload.bytes
    : convertD3D8TextureBytes(format, payload.bytes, width, height);
  const uploadBytes = info.compressed ? convertedBytes : d3d8TextureUploadView(info, convertedBytes);
  resource.storage = info.storage;
  resource.semantic = info.semantic || null;
  const levelKey = String(level);
  const levelInitialized = resource.initializedLevels.has(levelKey);
  const levelFormat = resource.levelFormats.get(levelKey);
  let swizzleApplied = resource.swizzleApplied || null;
  withPreservedD3D8TextureUnit(() => {
    gl.bindTexture(gl.TEXTURE_2D, resource.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!levelInitialized || levelFormat !== info.storage) {
      if (info.compressed) {
        gl.compressedTexImage2D(gl.TEXTURE_2D, level, info.internalFormat, width, height, 0, uploadBytes);
      } else if (x === 0 && y === 0 && width === levelSize.width && height === levelSize.height) {
        gl.texImage2D(gl.TEXTURE_2D, level, info.internalFormat, width, height, 0,
          info.format, info.type, uploadBytes);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, level, info.internalFormat, levelSize.width, levelSize.height, 0,
          info.format, info.type, null);
        gl.texSubImage2D(gl.TEXTURE_2D, level, x, y, width, height, info.format, info.type, uploadBytes);
      }
      resource.initializedLevels.add(levelKey);
      resource.levelFormats.set(levelKey, info.storage);
    } else {
      if (info.compressed) {
        gl.compressedTexImage2D(gl.TEXTURE_2D, level, info.internalFormat, width, height, 0, uploadBytes);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, level, x, y, width, height, info.format, info.type, uploadBytes);
      }
    }
    swizzleApplied = applyD3D8TextureSwizzleIfChanged(resource, info);
  });

  resource.uploads += 1;
  d3d8TextureStats.updates += 1;
  let samplePixel = null;
  let legacySamplePixel = null;
  if (level === 0 && !info.compressed) {
    samplePixel = sampleD3D8TexturePixel(resource, x, y);
    if (samplePixel && info.semantic) {
      legacySamplePixel = decodeLegacyD3D8PixelFromRgba(samplePixel, info.semantic);
    }
  }
  d3d8TextureStats.lastUpdate = {
    id,
    level,
    x,
    y,
    width,
    height,
    format,
    storage: info.storage,
    aliasedStorage: info.aliasedStorage || null,
    premultipliedAlpha: Boolean(info.premultipliedAlpha),
    compressed: Boolean(info.compressed),
    blockBytes: Number(info.blockBytes ?? 0) >>> 0,
    semantic: info.semantic || null,
    swizzle: swizzleApplied,
    pitch: Number(payload.pitch ?? 0) >>> 0,
    rowBytes: Number(payload.rowBytes ?? 0) >>> 0,
    byteSize: payload.bytes.byteLength,
    convertedByteSize: convertedBytes.byteLength,
    usage: Number(payload.usage ?? 0) >>> 0,
    lockFlags: Number(payload.lockFlags ?? 0) >>> 0,
    uploads: resource.uploads,
    samplePixel,
    legacySamplePixel: level === 0 && info.semantic ? legacySamplePixel : null,
  };
  if (level === 0 && info.semantic) {
    d3d8TextureStats.legacyUploads.push({
      id,
      format,
      storage: info.storage,
      semantic: info.semantic,
      swizzle: swizzleApplied,
      width,
      height,
      samplePixel,
      legacySamplePixel,
    });
    if (d3d8TextureStats.legacyUploads.length > 64) {
      d3d8TextureStats.legacyUploads.shift();
    }
  }
  if (x !== 0 || y !== 0 || width !== levelSize.width || height !== levelSize.height) {
    d3d8TextureStats.lastSubrectUpdate = d3d8TextureStats.lastUpdate;
  }
  updateD3D8TextureSummary();
  return 1;
}

function updateD3D8VolumeTexture(payload = {}) {
  if (!gl || !(payload.bytes instanceof Uint8Array)) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const level = Number(payload.level ?? 0) >>> 0;
  const x = Number(payload.x ?? 0) >>> 0;
  const y = Number(payload.y ?? 0) >>> 0;
  const z = Number(payload.z ?? 0) >>> 0;
  const width = Number(payload.width ?? 0) >>> 0;
  const height = Number(payload.height ?? 0) >>> 0;
  const depth = Number(payload.depth ?? 0) >>> 0;
  const format = Number(payload.format ?? 0) >>> 0;
  let resource = d3d8Textures.get(id);
  if (!resource) {
    if (!createD3D8VolumeTexture({
      id,
      width,
      height,
      depth,
      levels: level + 1,
      format,
      usage: payload.usage,
    })) {
      return 0;
    }
    resource = d3d8Textures.get(id);
  }
  if (!resource || resource.target !== gl.TEXTURE_3D ||
      width === 0 || height === 0 || depth === 0 || level >= resource.levels) {
    return 0;
  }

  const info = d3d8TextureFormatInfo(format);
  if (!info.supported) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      type: resource.type,
      reason: info.reason,
    };
    updateD3D8TextureSummary();
    return 0;
  }
  if (info.compressed) {
    d3d8TextureStats.unsupportedUpdates += 1;
    d3d8TextureStats.lastUnsupported = {
      id,
      level,
      format,
      type: resource.type,
      reason: "compressed volume texture updates are not implemented",
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const levelSize = d3d8TextureLevelSize(resource, level);
  if (x + width > levelSize.width || y + height > levelSize.height || z + depth > levelSize.depth) {
    return 0;
  }

  const convertedBytes = convertD3D8TextureBytes(format, payload.bytes, width, height, depth);
  const uploadBytes = d3d8TextureUploadView(info, convertedBytes);
  resource.storage = info.storage;
  resource.semantic = info.semantic || null;
  const levelKey = String(level);
  const levelInitialized = resource.initializedLevels.has(levelKey);
  const levelFormat = resource.levelFormats.get(levelKey);
  let swizzleApplied = resource.swizzleApplied || null;
  withPreservedD3D8TextureBinding(gl.TEXTURE_3D, () => {
    gl.bindTexture(gl.TEXTURE_3D, resource.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!levelInitialized || levelFormat !== info.storage) {
      if (x === 0 && y === 0 && z === 0 &&
          width === levelSize.width && height === levelSize.height && depth === levelSize.depth) {
        gl.texImage3D(gl.TEXTURE_3D, level, info.internalFormat, width, height, depth, 0,
          info.format, info.type, uploadBytes);
      } else {
        gl.texImage3D(gl.TEXTURE_3D, level, info.internalFormat,
          levelSize.width, levelSize.height, levelSize.depth, 0, info.format, info.type, null);
        gl.texSubImage3D(gl.TEXTURE_3D, level, x, y, z, width, height, depth,
          info.format, info.type, uploadBytes);
      }
      resource.initializedLevels.add(levelKey);
      resource.levelFormats.set(levelKey, info.storage);
    } else {
      gl.texSubImage3D(gl.TEXTURE_3D, level, x, y, z, width, height, depth,
        info.format, info.type, uploadBytes);
    }
    swizzleApplied = applyD3D8TextureSwizzleIfChanged(resource, info);
  });

  resource.uploads += 1;
  d3d8TextureStats.updates += 1;
  d3d8TextureStats.lastUpdate = {
    id,
    level,
    x,
    y,
    z,
    width,
    height,
    depth,
    format,
    storage: info.storage,
    type: resource.type,
    compressed: false,
    blockBytes: 0,
    semantic: info.semantic || null,
    swizzle: swizzleApplied,
    pitch: Number(payload.rowPitch ?? 0) >>> 0,
    rowPitch: Number(payload.rowPitch ?? 0) >>> 0,
    rowBytes: Number(payload.rowBytes ?? 0) >>> 0,
    slicePitch: Number(payload.slicePitch ?? 0) >>> 0,
    byteSize: payload.bytes.byteLength,
    convertedByteSize: convertedBytes.byteLength,
    usage: Number(payload.usage ?? 0) >>> 0,
    lockFlags: Number(payload.lockFlags ?? 0) >>> 0,
    uploads: resource.uploads,
    samplePixel: null,
    legacySamplePixel: null,
  };
  if (x !== 0 || y !== 0 || z !== 0 ||
      width !== levelSize.width || height !== levelSize.height || depth !== levelSize.depth) {
    d3d8TextureStats.lastSubrectUpdate = d3d8TextureStats.lastUpdate;
  }
  updateD3D8TextureSummary();
  return 1;
}

function releaseD3D8Texture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const id = Number(payload.id ?? 0) >>> 0;
  const resource = d3d8Textures.get(id);
  if (!resource) {
    return 0;
  }
  const target = resource.target ?? gl.TEXTURE_2D;
  const releasedBindings = [];
  for (const [stage, textureId] of d3d8BoundTextures.entries()) {
    if (textureId === id) {
      const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE0 + stage);
      gl.bindTexture(target, null);
      gl.activeTexture(previousActiveTexture);
      d3d8BoundTextures.delete(stage);
      releasedBindings.push(stage);
    }
  }
  gl.deleteTexture(resource.texture);
  d3d8Textures.delete(id);
  d3d8TextureStats.releases += 1;
  if (releasedBindings.length > 0) {
    d3d8TextureStats.releaseUnbinds += releasedBindings.length;
    d3d8TextureStats.lastReleaseUnbind = { id, stages: releasedBindings };
  }
  d3d8TextureStats.lastRelease = { id, type: resource.type || "2d", depth: resource.depth ?? 1, releasedBindings };
  updateD3D8TextureSummary();
  return 1;
}

function bindD3D8Texture(payload = {}) {
  if (!gl) {
    return 0;
  }
  const stage = Number(payload.stage ?? 0) >>> 0;
  const id = Number(payload.id ?? 0) >>> 0;
  const maxTextureUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
  if (stage >= maxTextureUnits) {
    d3d8TextureStats.missingBinds += 1;
    d3d8TextureStats.lastMissingBind = {
      stage,
      id,
      reason: "stage exceeds WebGL texture units",
      maxTextureUnits,
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0 + stage);
  if (id === 0) {
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindTexture(gl.TEXTURE_3D, null);
    gl.activeTexture(previousActiveTexture);
    d3d8BoundTextures.delete(stage);
    d3d8TextureStats.unbinds += 1;
    d3d8TextureStats.lastBind = {
      stage,
      id,
      ok: true,
      nullBind: true,
      boundTexture: null,
    };
    updateD3D8TextureSummary();
    return 1;
  }

  const resource = d3d8Textures.get(id);
  if (!resource) {
    gl.activeTexture(previousActiveTexture);
    d3d8TextureStats.missingBinds += 1;
    d3d8TextureStats.lastMissingBind = {
      stage,
      id,
      reason: "texture id is not live",
    };
    updateD3D8TextureSummary();
    return 0;
  }

  const target = resource.target ?? gl.TEXTURE_2D;
  if (target === gl.TEXTURE_3D) {
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindTexture(gl.TEXTURE_3D, resource.texture);
  } else {
    gl.bindTexture(gl.TEXTURE_3D, null);
    gl.bindTexture(gl.TEXTURE_2D, resource.texture);
  }
  gl.activeTexture(previousActiveTexture);
  d3d8BoundTextures.set(stage, id);
  d3d8TextureStats.binds += 1;
  d3d8TextureStats.lastBind = {
    stage,
    id,
    ok: true,
    nullBind: false,
    width: resource.width,
    height: resource.height,
    depth: resource.depth ?? 1,
    levels: resource.levels,
    format: resource.format,
    type: resource.type || "2d",
    uploads: resource.uploads,
  };
  updateD3D8TextureSummary();
  return 1;
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

function sampleVirtualCanvasPixel(x = 0, y = 0, virtualWidth = 800, virtualHeight = 600) {
  syncCanvasSize();
  const canvasWidth = gl ? gl.drawingBufferWidth : canvas.width;
  const canvasHeight = gl ? gl.drawingBufferHeight : canvas.height;
  return sampleCanvasPixel(
    Math.floor((Number(x) / virtualWidth) * canvasWidth),
    Math.floor((Number(y) / virtualHeight) * canvasHeight),
  );
}

function sampleCanvasRegion(rect = {}, threshold = 8) {
  syncCanvasSize();
  const canvasWidth = gl ? gl.drawingBufferWidth : canvas.width;
  const canvasHeight = gl ? gl.drawingBufferHeight : canvas.height;
  const left = Math.max(0, Math.min(canvasWidth, Math.floor(Number(rect.left ?? rect.x ?? 0))));
  const top = Math.max(0, Math.min(canvasHeight, Math.floor(Number(rect.top ?? rect.y ?? 0))));
  const right = Math.max(left, Math.min(canvasWidth, Math.ceil(Number(rect.right ?? (left + (rect.width ?? 0))))));
  const bottom = Math.max(top, Math.min(canvasHeight, Math.ceil(Number(rect.bottom ?? (top + (rect.height ?? 0))))));
  const width = right - left;
  const height = bottom - top;
  const result = {
    left,
    top,
    right,
    bottom,
    width,
    height,
    pixelCount: width * height,
    coloredPixelCount: 0,
    maxComponent: 0,
    brightestPixel: [0, 0, 0, 0],
  };
  if (width <= 0 || height <= 0) {
    return result;
  }

  let data = null;
  if (gl) {
    data = new Uint8Array(width * height * 4);
    const readY = Math.max(0, gl.drawingBufferHeight - bottom);
    gl.readPixels(left, readY, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  } else if (fallbackContext) {
    data = fallbackContext.getImageData(left, top, width, height).data;
  } else {
    return result;
  }

  for (let offset = 0; offset < data.length; offset += 4) {
    const pixel = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
    const maxComponent = Math.max(pixel[0], pixel[1], pixel[2]);
    if (maxComponent > result.maxComponent) {
      result.maxComponent = maxComponent;
      result.brightestPixel = pixel;
    }
    if (maxComponent > threshold && pixel[3] > 0) {
      result.coloredPixelCount += 1;
    }
  }
  result.coverageRatio = result.pixelCount > 0
    ? result.coloredPixelCount / result.pixelCount
    : 0;
  return result;
}

function pixelsApproximatelyEqual(left, right, tolerance = 1) {
  return left.length === right.length
    && left.every((component, index) => Math.abs(component - right[index]) <= tolerance);
}

function floatVectorApproximatelyEqual(left, right, tolerance = 0.00001) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
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

function paintD3D8Clear(flags, red, green, blue, alpha, z, stencil) {
  const clearFlags = flags >>> 0;
  const rgba = [
    clampColorByte(red, 0),
    clampColorByte(green, 0),
    clampColorByte(blue, 0),
    clampColorByte(alpha, 255),
  ];
  syncCanvasSize();
  if (gl) {
    let clearBits = 0;
    if ((clearFlags & 0x1) !== 0) {
      gl.clearColor(rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] / 255);
      clearBits |= gl.COLOR_BUFFER_BIT;
    }
    if ((clearFlags & 0x2) !== 0) {
      gl.clearDepth(Number(z));
      clearBits |= gl.DEPTH_BUFFER_BIT;
    }
    if ((clearFlags & 0x4) !== 0 && gl.getContextAttributes()?.stencil) {
      gl.stencilMask(0xffffffff);
      gl.clearStencil(stencil >>> 0);
      clearBits |= gl.STENCIL_BUFFER_BIT;
    }
    if (clearBits !== 0) {
      gl.clear(clearBits);
    }
  } else if (fallbackContext && (clearFlags & 0x1) !== 0) {
    fallbackContext.fillStyle = `rgb(${rgba[0]} ${rgba[1]} ${rgba[2]})`;
    fallbackContext.fillRect(0, 0, canvas.width, canvas.height);
  }
  refreshCanvasState();
  const pixel = sampleCanvasPixel(0, 0);
  const colorOk = (clearFlags & 0x1) === 0 || pixelsApproximatelyEqual(pixel, rgba);
  const probe = {
    ok: colorOk,
    source: "browser_d3d8_clear",
    api: harnessState.graphics.api,
    flags: clearFlags,
    clearColor: rgba,
    topLeftPixel: pixel,
    z: Number(z),
    stencil: stencil >>> 0,
  };
  harnessState.graphics = {
    ...harnessState.graphics,
    lastD3D8Clear: probe,
    lastClearColor: rgba,
    lastClearPixel: pixel,
    lastClearOk: colorOk,
  };
  return colorOk ? 1 : 0;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`D3D8 bridge shader compile failed: ${info}`);
  }
  return shader;
}

function ensureD3D8DrawProgram() {
  if (!gl) {
    return null;
  }
  if (d3d8DrawProgram) {
    return d3d8DrawProgram;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, `#version 300 es
    in vec3 aPosition;
    in vec3 aNormal;
    in vec4 aDiffuseBgra;
    in vec4 aSpecularBgra;
    in vec2 aTexCoord0;
    in vec2 aTexCoord1;
    uniform float uScale;
    uniform bool uUseTransforms;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProjection;
    uniform float uDepthBias;
    uniform int uTexture0CoordinateMode;
    uniform bool uUseTexture0Transform;
    uniform mat4 uTexture0Transform;
    uniform int uTexture0TransformComponentCount;
    uniform bool uTexture0TransformProjected;
    uniform int uTexture1CoordinateMode;
    uniform bool uUseTexture1Transform;
    uniform mat4 uTexture1Transform;
    uniform int uTexture1TransformComponentCount;
    uniform bool uTexture1TransformProjected;
    uniform bool uLightingEnabled;
    uniform bool uSpecularEnabled;
    uniform bool uNormalizeNormals;
    uniform bool uLocalViewer;
    uniform bool uColorVertexEnabled;
    uniform vec4 uSceneAmbient;
    uniform vec4 uMaterialDiffuse;
    uniform vec4 uMaterialAmbient;
    uniform vec4 uMaterialSpecular;
    uniform vec4 uMaterialEmissive;
    uniform float uMaterialPower;
    uniform int uDiffuseMaterialSource;
    uniform int uSpecularMaterialSource;
    uniform int uAmbientMaterialSource;
    uniform int uEmissiveMaterialSource;
    uniform int uFixedLightCount;
    uniform int uFixedLightType[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightDiffuse[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightSpecular[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightAmbient[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightPosition[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightDirection[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec4 uFixedLightRangeAttenuation[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    uniform vec3 uFixedLightSpot[${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}];
    out vec4 vColor;
    flat out vec4 vFlatColor;
    out vec2 vTexCoord0;
    out vec2 vTexCoord1;
    out vec4 vClipPosition;
    out float vFogDepth;
    out float vFogRangeDistance;
    vec4 d3dMaterialSourceColor(int source, vec4 materialColor, vec4 color1, vec4 color2) {
      if (!uColorVertexEnabled) {
        return materialColor;
      }
      if (source == 1) {
        return color1;
      }
      if (source == 2) {
        return color2;
      }
      return materialColor;
    }
    float d3dLightAttenuation(int index, float distanceToLight) {
      vec4 rangeAttenuation = uFixedLightRangeAttenuation[index];
      float range = rangeAttenuation.x;
      if (range > 0.0 && distanceToLight > range) {
        return 0.0;
      }
      float denominator =
        rangeAttenuation.y +
        rangeAttenuation.z * distanceToLight +
        rangeAttenuation.w * distanceToLight * distanceToLight;
      if (denominator <= 0.000001) {
        return 1.0;
      }
      return 1.0 / denominator;
    }
    float d3dSpotEffect(int index, vec3 lightDirection) {
      if (uFixedLightType[index] != 2) {
        return 1.0;
      }
      vec3 spotDirectionSource = uFixedLightDirection[index];
      vec3 spotDirection = length(spotDirectionSource) > 0.000001
        ? normalize(spotDirectionSource)
        : vec3(0.0, 0.0, -1.0);
      float rho = dot(spotDirection, -lightDirection);
      vec3 spot = uFixedLightSpot[index];
      float cosTheta = cos(max(spot.x, 0.0) * 0.5);
      float cosPhi = cos(max(spot.y, spot.x) * 0.5);
      if (rho <= cosPhi) {
        return 0.0;
      }
      if (rho >= cosTheta || abs(cosTheta - cosPhi) < 0.000001) {
        return 1.0;
      }
      float coneAmount = clamp((rho - cosPhi) / (cosTheta - cosPhi), 0.0, 1.0);
      float falloff = max(spot.z, 0.0);
      return falloff == 0.0 ? 1.0 : pow(coneAmount, falloff);
    }
    vec4 d3dApplyLighting(vec4 color1, vec4 color2, vec3 worldPosition, vec3 normal, vec3 viewDirection) {
      vec4 diffuseMaterial = d3dMaterialSourceColor(uDiffuseMaterialSource, uMaterialDiffuse, color1, color2);
      vec4 specularMaterial = d3dMaterialSourceColor(uSpecularMaterialSource, uMaterialSpecular, color1, color2);
      vec4 ambientMaterial = d3dMaterialSourceColor(uAmbientMaterialSource, uMaterialAmbient, color1, color2);
      vec4 emissiveMaterial = d3dMaterialSourceColor(uEmissiveMaterialSource, uMaterialEmissive, color1, color2);
      vec3 litRgb = emissiveMaterial.rgb + ambientMaterial.rgb * uSceneAmbient.rgb;
      vec3 effectiveNormal = uNormalizeNormals
        ? (length(normal) > 0.000001 ? normalize(normal) : vec3(0.0, 0.0, 1.0))
        : normal;
      if (length(effectiveNormal) <= 0.000001) {
        effectiveNormal = vec3(0.0, 0.0, 1.0);
      }
      vec3 unitViewDirection = length(viewDirection) > 0.000001
        ? normalize(viewDirection)
        : vec3(0.0, 0.0, 1.0);
      for (int index = 0; index < ${D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT}; ++index) {
        if (index >= uFixedLightCount) {
          break;
        }
        vec3 lightVector = uFixedLightType[index] == 3
          ? -uFixedLightDirection[index]
          : uFixedLightPosition[index] - worldPosition;
        float distanceToLight = length(lightVector);
        vec3 lightDirection = distanceToLight > 0.000001 ? normalize(lightVector) : effectiveNormal;
        float attenuation = uFixedLightType[index] == 3
          ? 1.0
          : d3dLightAttenuation(index, distanceToLight) * d3dSpotEffect(index, lightDirection);
        float diffuseAmount = max(dot(effectiveNormal, lightDirection), 0.0);
        litRgb += ambientMaterial.rgb * uFixedLightAmbient[index].rgb * attenuation;
        litRgb += diffuseMaterial.rgb * uFixedLightDiffuse[index].rgb * diffuseAmount * attenuation;
        if (uSpecularEnabled && diffuseAmount > 0.0 && attenuation > 0.0) {
          vec3 halfSource = lightDirection + unitViewDirection;
          vec3 halfVector = length(halfSource) > 0.000001 ? normalize(halfSource) : effectiveNormal;
          float specularDot = max(dot(effectiveNormal, halfVector), 0.0);
          float specularPower = max(uMaterialPower, 0.0);
          float specularAmount = specularPower == 0.0 ? 1.0 : pow(specularDot, specularPower);
          litRgb += specularMaterial.rgb * uFixedLightSpecular[index].rgb * specularAmount * attenuation;
        }
      }
      return vec4(clamp(litRgb, 0.0, 1.0), diffuseMaterial.a);
    }
    vec4 d3dTextureCoordinateSource(
      vec2 texCoord,
      int coordinateMode,
      vec3 cameraSpacePosition,
      vec3 cameraSpaceNormal) {
      if (coordinateMode == ${D3DTSS_TCI_CAMERASPACENORMAL}) {
        vec3 normal = length(cameraSpaceNormal) > 0.000001
          ? normalize(cameraSpaceNormal)
          : vec3(0.0, 0.0, 1.0);
        return vec4(normal, 1.0);
      }
      if (coordinateMode == ${D3DTSS_TCI_CAMERASPACEPOSITION}) {
        return vec4(cameraSpacePosition, 1.0);
      }
      if (coordinateMode == ${D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR}) {
        vec3 normal = length(cameraSpaceNormal) > 0.000001
          ? normalize(cameraSpaceNormal)
          : vec3(0.0, 0.0, 1.0);
        vec3 incident = length(cameraSpacePosition) > 0.000001
          ? normalize(cameraSpacePosition)
          : vec3(0.0, 0.0, 1.0);
        return vec4(reflect(incident, normal), 1.0);
      }
      return vec4(texCoord, 0.0, 1.0);
    }
    vec2 d3dApplyTextureTransform(vec4 texCoord, mat4 transformMatrix, int componentCount, bool projected) {
      vec4 transformed = transformMatrix * texCoord;
      if (projected) {
        float divisor = componentCount == 4 ? transformed.w : transformed.z;
        if (abs(divisor) > 0.000001) {
          return transformed.xy / divisor;
        }
      }
      return transformed.xy;
    }
    void main() {
      vec4 worldPosition = vec4(aPosition, 1.0);
      vec4 viewPosition = worldPosition;
      vec3 worldNormal = aNormal;
      vec3 cameraSpaceNormal = aNormal;
      vec3 viewDirection = vec3(0.0, 0.0, 1.0);
      if (uUseTransforms) {
        worldPosition = uWorld * vec4(aPosition, 1.0);
        mat3 worldNormalMatrix = transpose(inverse(mat3(uWorld)));
        worldNormal = worldNormalMatrix * aNormal;
        viewPosition = uView * worldPosition;
        cameraSpaceNormal = mat3(uView) * worldNormal;
        vec4 cameraWorld = inverse(uView) * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 cameraPosition = cameraWorld.xyz / max(abs(cameraWorld.w), 0.000001);
        vec4 cameraForwardWorld = inverse(uView) * vec4(0.0, 0.0, 1.0, 0.0);
        vec3 orthogonalViewDirection = length(cameraForwardWorld.xyz) > 0.000001
          ? normalize(cameraForwardWorld.xyz)
          : viewDirection;
        vec3 worldToCamera = cameraPosition - worldPosition.xyz;
        vec3 localViewDirection = length(worldToCamera) > 0.000001
          ? normalize(worldToCamera)
          : orthogonalViewDirection;
        viewDirection = uLocalViewer ? localViewDirection : orthogonalViewDirection;
        vec4 d3dClip = uProjection * viewPosition;
        gl_Position = vec4(d3dClip.x, d3dClip.y, d3dClip.z * 2.0 - d3dClip.w, d3dClip.w);
        vFogDepth = max(viewPosition.z, 0.0);
        vFogRangeDistance = length(viewPosition.xyz);
      } else {
        gl_Position = vec4(aPosition.x / uScale, aPosition.y / uScale, 0.0, 1.0);
        vFogDepth = 0.0;
        vFogRangeDistance = 0.0;
      }
      gl_Position.z -= uDepthBias * gl_Position.w;
      vClipPosition = worldPosition;
      vec4 color1 = vec4(aDiffuseBgra.b, aDiffuseBgra.g, aDiffuseBgra.r, aDiffuseBgra.a);
      vec4 color2 = vec4(aSpecularBgra.b, aSpecularBgra.g, aSpecularBgra.r, aSpecularBgra.a);
      vColor = uLightingEnabled ? d3dApplyLighting(color1, color2, worldPosition.xyz, worldNormal, viewDirection) : color1;
      vFlatColor = vColor;
      vec4 texture0Coordinate = d3dTextureCoordinateSource(
        aTexCoord0,
        uTexture0CoordinateMode,
        viewPosition.xyz,
        cameraSpaceNormal);
      if (uUseTexture0Transform) {
        vTexCoord0 = d3dApplyTextureTransform(
          texture0Coordinate,
          uTexture0Transform,
          uTexture0TransformComponentCount,
          uTexture0TransformProjected);
      } else {
        vTexCoord0 = texture0Coordinate.xy;
      }
      vec4 texture1Coordinate = d3dTextureCoordinateSource(
        aTexCoord1,
        uTexture1CoordinateMode,
        viewPosition.xyz,
        cameraSpaceNormal);
      if (uUseTexture1Transform) {
        vTexCoord1 = d3dApplyTextureTransform(
          texture1Coordinate,
          uTexture1Transform,
          uTexture1TransformComponentCount,
          uTexture1TransformProjected);
      } else {
        vTexCoord1 = texture1Coordinate.xy;
      }
    }
  `);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    in vec4 vColor;
    flat in vec4 vFlatColor;
    in vec2 vTexCoord0;
    in vec2 vTexCoord1;
    in vec4 vClipPosition;
    in float vFogDepth;
    in float vFogRangeDistance;
    uniform int uClipPlaneMask;
    uniform vec4 uClipPlanes[6];
    uniform bool uUseFlatShade;
    uniform bool uUseTexture0;
    uniform sampler2D uTexture0;
    uniform float uTexture0LodBias;
    uniform int uTexture0Semantic;
    uniform bool uUseTexture1;
    uniform sampler2D uTexture1;
    uniform float uTexture1LodBias;
    uniform int uTexture1Semantic;
    uniform vec4 uTextureFactor;
    uniform int uStage0ColorOp;
    uniform int uStage0ColorArg0;
    uniform int uStage0ColorArg1;
    uniform int uStage0ColorArg2;
    uniform int uStage0AlphaOp;
    uniform int uStage0AlphaArg0;
    uniform int uStage0AlphaArg1;
    uniform int uStage0AlphaArg2;
    uniform int uStage0ResultArg;
    uniform int uStage1ColorOp;
    uniform int uStage1ColorArg0;
    uniform int uStage1ColorArg1;
    uniform int uStage1ColorArg2;
    uniform int uStage1AlphaOp;
    uniform int uStage1AlphaArg0;
    uniform int uStage1AlphaArg1;
    uniform int uStage1AlphaArg2;
    uniform bool uAlphaTestEnabled;
    uniform int uAlphaFunc;
    uniform float uAlphaRef;
    uniform bool uFogEnabled;
    uniform bool uFogRangeEnabled;
    uniform vec3 uFogColor;
    uniform float uFogStart;
    uniform float uFogEnd;
    out vec4 fragColor;
    bool d3dAlphaCompare(float value, float reference) {
      if (uAlphaFunc == 1) {
        return false;
      }
      if (uAlphaFunc == 2) {
        return value < reference;
      }
      if (uAlphaFunc == 3) {
        return value == reference;
      }
      if (uAlphaFunc == 4) {
        return value <= reference;
      }
      if (uAlphaFunc == 5) {
        return value > reference;
      }
      if (uAlphaFunc == 6) {
        return value != reference;
      }
      if (uAlphaFunc == 7) {
        return value >= reference;
      }
      return true;
    }
    vec4 d3dTextureSample(vec4 rawSample, int semantic) {
      if (semantic == 1) {
        return vec4(0.0, 0.0, 0.0, rawSample.r);
      }
      if (semantic == 2) {
        return vec4(rawSample.r, rawSample.r, rawSample.r, 1.0);
      }
      if (semantic == 3) {
        return vec4(rawSample.r, rawSample.r, rawSample.r, rawSample.g);
      }
      return rawSample;
    }
    // D3DTA_DIFFUSE == 0, D3DTA_CURRENT == 1, D3DTA_TEXTURE == 2,
    // D3DTA_TFACTOR == 3, D3DTA_TEMP == 5.
    // D3DTA_COMPLEMENT == 0x10, D3DTA_ALPHAREPLICATE == 0x20.
    vec4 d3dCombinerSource(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor, vec4 tempColor) {
      int source = arg & 15;
      if (source == 0) {
        return diffuseColor;
      }
      if (source == 1) {
        return currentColor;
      }
      if (source == 2) {
        return textureColor;
      }
      if (source == 3) {
        return uTextureFactor;
      }
      if (source == 5) {
        return tempColor;
      }
      return currentColor;
    }
    vec3 d3dCombinerColorArg(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor, vec4 tempColor) {
      vec4 source = d3dCombinerSource(arg, textureColor, currentColor, diffuseColor, tempColor);
      vec3 value = (arg & 32) != 0 ? vec3(source.a) : source.rgb;
      if ((arg & 16) != 0) {
        value = vec3(1.0) - value;
      }
      return value;
    }
    vec3 d3dDotProduct3(vec3 arg1, vec3 arg2) {
      return vec3(clamp(dot(arg1 * 2.0 - 1.0, arg2 * 2.0 - 1.0), 0.0, 1.0));
    }
    float d3dCombinerBlendFactor(int op, vec4 textureColor, vec4 currentColor, vec4 diffuseColor) {
      if (op == 12) {
        return diffuseColor.a;
      }
      if (op == 13) {
        return textureColor.a;
      }
      if (op == 14) {
        return uTextureFactor.a;
      }
      if (op == 16) {
        return currentColor.a;
      }
      return 0.0;
    }
    vec3 d3dApplyColorOp(int op, vec3 arg0, vec3 arg1, vec3 arg2,
        vec4 textureColor, vec4 currentColor, vec4 diffuseColor) {
      if (op == 2) {
        return arg1;
      }
      if (op == 3) {
        return arg2;
      }
      if (op == 4) {
        return arg1 * arg2;
      }
      if (op == 5) {
        return clamp(arg1 * arg2 * 2.0, 0.0, 1.0);
      }
      if (op == 6) {
        return clamp(arg1 * arg2 * 4.0, 0.0, 1.0);
      }
      if (op == 7) {
        return clamp(arg1 + arg2, 0.0, 1.0);
      }
      if (op == 8) {
        return clamp(arg1 + arg2 - vec3(0.5), 0.0, 1.0);
      }
      if (op == 9) {
        return clamp((arg1 + arg2 - vec3(0.5)) * 2.0, 0.0, 1.0);
      }
      if (op == 10) {
        return clamp(arg1 - arg2, 0.0, 1.0);
      }
      if (op == 11) {
        return clamp(arg1 + arg2 - arg1 * arg2, 0.0, 1.0);
      }
      if (op == 12 || op == 13 || op == 14 || op == 16) {
        float factor = d3dCombinerBlendFactor(op, textureColor, currentColor, diffuseColor);
        return mix(arg2, arg1, factor);
      }
      if (op == 24) {
        return d3dDotProduct3(arg1, arg2);
      }
      if (op == 25) {
        return clamp(arg0 + arg1 * arg2, 0.0, 1.0);
      }
      if (op == 26) {
        return clamp(arg0 * arg1 + (vec3(1.0) - arg0) * arg2, 0.0, 1.0);
      }
      return currentColor.rgb;
    }
    float d3dApplyAlphaOp(int op, float arg0, float arg1, float arg2,
        vec4 textureColor, vec4 currentColor, vec4 diffuseColor) {
      if (op == 2) {
        return arg1;
      }
      if (op == 3) {
        return arg2;
      }
      if (op == 4) {
        return arg1 * arg2;
      }
      if (op == 5) {
        return clamp(arg1 * arg2 * 2.0, 0.0, 1.0);
      }
      if (op == 6) {
        return clamp(arg1 * arg2 * 4.0, 0.0, 1.0);
      }
      if (op == 7) {
        return clamp(arg1 + arg2, 0.0, 1.0);
      }
      if (op == 8) {
        return clamp(arg1 + arg2 - 0.5, 0.0, 1.0);
      }
      if (op == 9) {
        return clamp((arg1 + arg2 - 0.5) * 2.0, 0.0, 1.0);
      }
      if (op == 10) {
        return clamp(arg1 - arg2, 0.0, 1.0);
      }
      if (op == 11) {
        return clamp(arg1 + arg2 - arg1 * arg2, 0.0, 1.0);
      }
      if (op == 12 || op == 13 || op == 14 || op == 16) {
        float factor = d3dCombinerBlendFactor(op, textureColor, currentColor, diffuseColor);
        return mix(arg2, arg1, factor);
      }
      if (op == 25) {
        return clamp(arg0 + arg1 * arg2, 0.0, 1.0);
      }
      if (op == 26) {
        return clamp(arg0 * arg1 + (1.0 - arg0) * arg2, 0.0, 1.0);
      }
      return currentColor.a;
    }
    vec3 d3dStage0Color(vec4 diffuseColor, vec4 textureColor, vec4 tempColor) {
      if (uStage0ColorOp == 1) {
        return diffuseColor.rgb;
      }
      vec3 arg0 = d3dCombinerColorArg(uStage0ColorArg0, textureColor, diffuseColor, diffuseColor, tempColor);
      vec3 arg1 = d3dCombinerColorArg(uStage0ColorArg1, textureColor, diffuseColor, diffuseColor, tempColor);
      vec3 arg2 = d3dCombinerColorArg(uStage0ColorArg2, textureColor, diffuseColor, diffuseColor, tempColor);
      return d3dApplyColorOp(uStage0ColorOp, arg0, arg1, arg2, textureColor, diffuseColor, diffuseColor);
    }
    float d3dCombinerAlphaArg(int arg, vec4 textureColor, vec4 currentColor, vec4 diffuseColor, vec4 tempColor) {
      vec4 source = d3dCombinerSource(arg, textureColor, currentColor, diffuseColor, tempColor);
      float value = source.a;
      if ((arg & 16) != 0) {
        value = 1.0 - value;
      }
      return value;
    }
    float d3dStage0Alpha(vec4 diffuseColor, vec4 textureColor, vec4 tempColor) {
      if (uStage0AlphaOp == 1) {
        return diffuseColor.a;
      }
      float arg0 = d3dCombinerAlphaArg(uStage0AlphaArg0, textureColor, diffuseColor, diffuseColor, tempColor);
      float arg1 = d3dCombinerAlphaArg(uStage0AlphaArg1, textureColor, diffuseColor, diffuseColor, tempColor);
      float arg2 = d3dCombinerAlphaArg(uStage0AlphaArg2, textureColor, diffuseColor, diffuseColor, tempColor);
      if (uStage0AlphaOp == 24) {
        vec3 colorArg1 = d3dCombinerColorArg(uStage0AlphaArg1, textureColor, diffuseColor, diffuseColor, tempColor);
        vec3 colorArg2 = d3dCombinerColorArg(uStage0AlphaArg2, textureColor, diffuseColor, diffuseColor, tempColor);
        return d3dDotProduct3(colorArg1, colorArg2).r;
      }
      return d3dApplyAlphaOp(uStage0AlphaOp, arg0, arg1, arg2, textureColor, diffuseColor, diffuseColor);
    }
    vec3 d3dStage1Color(vec4 diffuseColor, vec4 textureColor, vec4 currentColor, vec4 tempColor) {
      if (uStage1ColorOp == 1) {
        return currentColor.rgb;
      }
      vec3 arg0 = d3dCombinerColorArg(uStage1ColorArg0, textureColor, currentColor, diffuseColor, tempColor);
      vec3 arg1 = d3dCombinerColorArg(uStage1ColorArg1, textureColor, currentColor, diffuseColor, tempColor);
      vec3 arg2 = d3dCombinerColorArg(uStage1ColorArg2, textureColor, currentColor, diffuseColor, tempColor);
      return d3dApplyColorOp(uStage1ColorOp, arg0, arg1, arg2, textureColor, currentColor, diffuseColor);
    }
    float d3dStage1Alpha(vec4 diffuseColor, vec4 textureColor, vec4 currentColor, vec4 tempColor) {
      if (uStage1AlphaOp == 1) {
        return currentColor.a;
      }
      float arg0 = d3dCombinerAlphaArg(uStage1AlphaArg0, textureColor, currentColor, diffuseColor, tempColor);
      float arg1 = d3dCombinerAlphaArg(uStage1AlphaArg1, textureColor, currentColor, diffuseColor, tempColor);
      float arg2 = d3dCombinerAlphaArg(uStage1AlphaArg2, textureColor, currentColor, diffuseColor, tempColor);
      if (uStage1AlphaOp == 24) {
        vec3 colorArg1 = d3dCombinerColorArg(uStage1AlphaArg1, textureColor, currentColor, diffuseColor, tempColor);
        vec3 colorArg2 = d3dCombinerColorArg(uStage1AlphaArg2, textureColor, currentColor, diffuseColor, tempColor);
        return d3dDotProduct3(colorArg1, colorArg2).r;
      }
      return d3dApplyAlphaOp(uStage1AlphaOp, arg0, arg1, arg2, textureColor, currentColor, diffuseColor);
    }
    void main() {
      for (int index = 0; index < 6; ++index) {
        if ((uClipPlaneMask & (1 << index)) != 0 && dot(uClipPlanes[index], vClipPosition) < 0.0) {
          discard;
        }
      }
      vec4 texture0Color = uUseTexture0
        ? d3dTextureSample(texture(uTexture0, vTexCoord0, uTexture0LodBias), uTexture0Semantic)
        : vec4(1.0);
      vec4 texture1Color = uUseTexture1
        ? d3dTextureSample(texture(uTexture1, vTexCoord1, uTexture1LodBias), uTexture1Semantic)
        : vec4(1.0);
      vec4 diffuseColor = uUseFlatShade ? vFlatColor : vColor;
      vec4 stage0ComputedColor = vec4(
        d3dStage0Color(diffuseColor, texture0Color, vec4(0.0)),
        d3dStage0Alpha(diffuseColor, texture0Color, vec4(0.0))
      );
      vec4 stage0CurrentColor = uStage0ResultArg == 5 ? diffuseColor : stage0ComputedColor;
      vec4 stage0TempColor = uStage0ResultArg == 5 ? stage0ComputedColor : vec4(0.0);
      vec4 color = vec4(
        d3dStage1Color(diffuseColor, texture1Color, stage0CurrentColor, stage0TempColor),
        d3dStage1Alpha(diffuseColor, texture1Color, stage0CurrentColor, stage0TempColor)
      );
      if (uAlphaTestEnabled && !d3dAlphaCompare(color.a, uAlphaRef)) {
        discard;
      }
      if (uFogEnabled) {
        float fogDistance = uFogRangeEnabled ? vFogRangeDistance : vFogDepth;
        float fogAmount = clamp((fogDistance - uFogStart) / max(uFogEnd - uFogStart, 0.000001), 0.0, 1.0);
        color.rgb = mix(color.rgb, uFogColor, fogAmount);
      }
      fragColor = color;
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`D3D8 bridge program link failed: ${info}`);
  }

  d3d8DrawProgram = {
    program,
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    diffuse: gl.getAttribLocation(program, "aDiffuseBgra"),
    specular: gl.getAttribLocation(program, "aSpecularBgra"),
    texCoord0: gl.getAttribLocation(program, "aTexCoord0"),
    texCoord1: gl.getAttribLocation(program, "aTexCoord1"),
    scale: gl.getUniformLocation(program, "uScale"),
    useTransforms: gl.getUniformLocation(program, "uUseTransforms"),
    world: gl.getUniformLocation(program, "uWorld"),
    view: gl.getUniformLocation(program, "uView"),
    projection: gl.getUniformLocation(program, "uProjection"),
    depthBias: gl.getUniformLocation(program, "uDepthBias"),
    clipPlaneMask: gl.getUniformLocation(program, "uClipPlaneMask"),
    clipPlanes: gl.getUniformLocation(program, "uClipPlanes[0]"),
    useFlatShade: gl.getUniformLocation(program, "uUseFlatShade"),
    texture0CoordinateMode: gl.getUniformLocation(program, "uTexture0CoordinateMode"),
    useTexture0Transform: gl.getUniformLocation(program, "uUseTexture0Transform"),
    texture0Transform: gl.getUniformLocation(program, "uTexture0Transform"),
    texture0TransformComponentCount: gl.getUniformLocation(program, "uTexture0TransformComponentCount"),
    texture0TransformProjected: gl.getUniformLocation(program, "uTexture0TransformProjected"),
    texture1CoordinateMode: gl.getUniformLocation(program, "uTexture1CoordinateMode"),
    useTexture1Transform: gl.getUniformLocation(program, "uUseTexture1Transform"),
    texture1Transform: gl.getUniformLocation(program, "uTexture1Transform"),
    texture1TransformComponentCount: gl.getUniformLocation(program, "uTexture1TransformComponentCount"),
    texture1TransformProjected: gl.getUniformLocation(program, "uTexture1TransformProjected"),
    lightingEnabled: gl.getUniformLocation(program, "uLightingEnabled"),
    specularEnabled: gl.getUniformLocation(program, "uSpecularEnabled"),
    normalizeNormals: gl.getUniformLocation(program, "uNormalizeNormals"),
    localViewer: gl.getUniformLocation(program, "uLocalViewer"),
    colorVertexEnabled: gl.getUniformLocation(program, "uColorVertexEnabled"),
    sceneAmbient: gl.getUniformLocation(program, "uSceneAmbient"),
    materialDiffuse: gl.getUniformLocation(program, "uMaterialDiffuse"),
    materialAmbient: gl.getUniformLocation(program, "uMaterialAmbient"),
    materialSpecular: gl.getUniformLocation(program, "uMaterialSpecular"),
    materialEmissive: gl.getUniformLocation(program, "uMaterialEmissive"),
    materialPower: gl.getUniformLocation(program, "uMaterialPower"),
    diffuseMaterialSource: gl.getUniformLocation(program, "uDiffuseMaterialSource"),
    specularMaterialSource: gl.getUniformLocation(program, "uSpecularMaterialSource"),
    ambientMaterialSource: gl.getUniformLocation(program, "uAmbientMaterialSource"),
    emissiveMaterialSource: gl.getUniformLocation(program, "uEmissiveMaterialSource"),
    fixedLightCount: gl.getUniformLocation(program, "uFixedLightCount"),
    fixedLightType: gl.getUniformLocation(program, "uFixedLightType[0]"),
    fixedLightDiffuse: gl.getUniformLocation(program, "uFixedLightDiffuse[0]"),
    fixedLightSpecular: gl.getUniformLocation(program, "uFixedLightSpecular[0]"),
    fixedLightAmbient: gl.getUniformLocation(program, "uFixedLightAmbient[0]"),
    fixedLightPosition: gl.getUniformLocation(program, "uFixedLightPosition[0]"),
    fixedLightDirection: gl.getUniformLocation(program, "uFixedLightDirection[0]"),
    fixedLightRangeAttenuation: gl.getUniformLocation(program, "uFixedLightRangeAttenuation[0]"),
    fixedLightSpot: gl.getUniformLocation(program, "uFixedLightSpot[0]"),
    useTexture0: gl.getUniformLocation(program, "uUseTexture0"),
    texture0: gl.getUniformLocation(program, "uTexture0"),
    texture0LodBias: gl.getUniformLocation(program, "uTexture0LodBias"),
    texture0Semantic: gl.getUniformLocation(program, "uTexture0Semantic"),
    useTexture1: gl.getUniformLocation(program, "uUseTexture1"),
    texture1: gl.getUniformLocation(program, "uTexture1"),
    texture1LodBias: gl.getUniformLocation(program, "uTexture1LodBias"),
    texture1Semantic: gl.getUniformLocation(program, "uTexture1Semantic"),
    textureFactor: gl.getUniformLocation(program, "uTextureFactor"),
    stage0ColorOp: gl.getUniformLocation(program, "uStage0ColorOp"),
    stage0ColorArg0: gl.getUniformLocation(program, "uStage0ColorArg0"),
    stage0ColorArg1: gl.getUniformLocation(program, "uStage0ColorArg1"),
    stage0ColorArg2: gl.getUniformLocation(program, "uStage0ColorArg2"),
    stage0AlphaOp: gl.getUniformLocation(program, "uStage0AlphaOp"),
    stage0AlphaArg0: gl.getUniformLocation(program, "uStage0AlphaArg0"),
    stage0AlphaArg1: gl.getUniformLocation(program, "uStage0AlphaArg1"),
    stage0AlphaArg2: gl.getUniformLocation(program, "uStage0AlphaArg2"),
    stage0ResultArg: gl.getUniformLocation(program, "uStage0ResultArg"),
    stage1ColorOp: gl.getUniformLocation(program, "uStage1ColorOp"),
    stage1ColorArg0: gl.getUniformLocation(program, "uStage1ColorArg0"),
    stage1ColorArg1: gl.getUniformLocation(program, "uStage1ColorArg1"),
    stage1ColorArg2: gl.getUniformLocation(program, "uStage1ColorArg2"),
    stage1AlphaOp: gl.getUniformLocation(program, "uStage1AlphaOp"),
    stage1AlphaArg0: gl.getUniformLocation(program, "uStage1AlphaArg0"),
    stage1AlphaArg1: gl.getUniformLocation(program, "uStage1AlphaArg1"),
    stage1AlphaArg2: gl.getUniformLocation(program, "uStage1AlphaArg2"),
    alphaTestEnabled: gl.getUniformLocation(program, "uAlphaTestEnabled"),
    alphaFunc: gl.getUniformLocation(program, "uAlphaFunc"),
    alphaRef: gl.getUniformLocation(program, "uAlphaRef"),
    fogEnabled: gl.getUniformLocation(program, "uFogEnabled"),
    fogRangeEnabled: gl.getUniformLocation(program, "uFogRangeEnabled"),
    fogColor: gl.getUniformLocation(program, "uFogColor"),
    fogStart: gl.getUniformLocation(program, "uFogStart"),
    fogEnd: gl.getUniformLocation(program, "uFogEnd"),
  };
  return d3d8DrawProgram;
}

function d3dPrimitiveToGl(primitiveType) {
  if (!gl) {
    return 0;
  }
  switch (Number(primitiveType)) {
    case D3DPT_POINTLIST:
      return gl.POINTS;
    case D3DPT_LINELIST:
      return gl.LINES;
    case D3DPT_LINESTRIP:
      return gl.LINE_STRIP;
    case D3DPT_TRIANGLELIST:
      return gl.TRIANGLES;
    case D3DPT_TRIANGLESTRIP:
      return gl.TRIANGLE_STRIP;
    case D3DPT_TRIANGLEFAN:
      return gl.TRIANGLE_FAN;
    default:
      return 0;
  }
}

function glPrimitiveName(primitive) {
  if (!gl) {
    return "unknown";
  }
  switch (primitive) {
    case gl.POINTS:
      return "points";
    case gl.LINES:
      return "lines";
    case gl.LINE_STRIP:
      return "lineStrip";
    case gl.TRIANGLES:
      return "triangles";
    case gl.TRIANGLE_STRIP:
      return "triangleStrip";
    case gl.TRIANGLE_FAN:
      return "triangleFan";
    default:
      return "unknown";
  }
}

function d3dFillModeName(fillMode) {
  switch (Number(fillMode) >>> 0) {
    case D3DFILL_POINT:
      return "point";
    case D3DFILL_WIREFRAME:
      return "wireframe";
    case D3DFILL_SOLID:
      return "solid";
    default:
      return "unknown";
  }
}

function d3dShadeModeName(shadeMode) {
  switch (Number(shadeMode) >>> 0) {
    case D3DSHADE_FLAT:
      return "flat";
    case D3DSHADE_GOURAUD:
      return "gouraud";
    case D3DSHADE_PHONG:
      return "phong";
    default:
      return "unknown";
  }
}

function d3dMaterialSourceName(source) {
  switch (Number(source) >>> 0) {
    case D3DMCS_MATERIAL:
      return "material";
    case D3DMCS_COLOR1:
      return "color1";
    case D3DMCS_COLOR2:
      return "color2";
    default:
      return "unknown";
  }
}

function d3d8DepthBiasInfo(zBias) {
  const raw = Number(zBias ?? 0) >>> 0;
  const clamped = Math.max(0, Math.min(15, raw));
  return {
    raw,
    clamped,
    ndc: clamped / 65536.0,
  };
}

function d3dPrimitiveIsTriangle(primitiveType) {
  const type = Number(primitiveType) >>> 0;
  return type === D3DPT_TRIANGLELIST || type === D3DPT_TRIANGLESTRIP || type === D3DPT_TRIANGLEFAN;
}

function readD3D8Index(indexBytes, byteOffset, index, indexSize) {
  const absolute = byteOffset + index * indexSize;
  if (!(indexBytes instanceof Uint8Array) || absolute + indexSize > indexBytes.byteLength) {
    return null;
  }
  if (indexSize === 2) {
    return indexBytes[absolute] | (indexBytes[absolute + 1] << 8);
  }
  if (indexSize === 4) {
    return (indexBytes[absolute] |
      (indexBytes[absolute + 1] << 8) |
      (indexBytes[absolute + 2] << 16) |
      (indexBytes[absolute + 3] << 24)) >>> 0;
  }
  return null;
}

function projectD3D8VertexToNdc(vertexBytes, vertexByteOffset, vertexStride, transforms, vertexIndex) {
  if (!(vertexBytes instanceof Uint8Array) || !transforms || vertexStride < 12 || vertexIndex === null) {
    return null;
  }
  const base = vertexByteOffset + vertexIndex * vertexStride;
  if (base < 0 || base + 12 > vertexBytes.byteLength) {
    return null;
  }
  const view = new DataView(vertexBytes.buffer, vertexBytes.byteOffset, vertexBytes.byteLength);
  const position = [
    readD3D8Float32(view, base),
    readD3D8Float32(view, base + 4),
    readD3D8Float32(view, base + 8),
  ];
  const worldPosition = multiplyD3D8ColumnMatrixVector(transforms.world, [...position, 1]);
  const viewPosition = multiplyD3D8ColumnMatrixVector(transforms.view, worldPosition);
  const d3dClip = multiplyD3D8ColumnMatrixVector(transforms.projection, viewPosition);
  const glClip = [d3dClip[0], d3dClip[1], d3dClip[2] * 2.0 - d3dClip[3], d3dClip[3]];
  if (Math.abs(glClip[3]) <= 0.000001) {
    return null;
  }
  return [
    glClip[0] / glClip[3],
    glClip[1] / glClip[3],
    glClip[2] / glClip[3],
  ];
}

function d3d8ProjectedTriangleArea(a, b, c) {
  if (!a || !b || !c) {
    return null;
  }
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function d3d8TriangleCullInfo(area, cullMode) {
  if (!Number.isFinite(area)) {
    return { winding: "unknown", culled: false, degenerate: false };
  }
  if (Math.abs(area) <= 0.0000001) {
    return { winding: "degenerate", culled: false, degenerate: true };
  }
  const winding = area < 0 ? "cw" : "ccw";
  return {
    winding,
    culled: (cullMode === D3DCULL_CW && winding === "cw") ||
      (cullMode === D3DCULL_CCW && winding === "ccw"),
    degenerate: false,
  };
}

function buildD3D8FlatShadeIndices(indexResource, indexByteOffset, indexCount, indexSize, primitiveType) {
  const indexBytes = indexResource?.bytes;
  const requiredByteSize = indexByteOffset + indexCount * indexSize;
  if (!(indexBytes instanceof Uint8Array)) {
    return { supported: false, reason: "missingIndexMirror" };
  }
  if (requiredByteSize > indexBytes.byteLength) {
    return { supported: false, reason: "indexRangeOutOfBounds" };
  }

  const triangles = [];
  let sourceTriangleCount = 0;
  const addTriangle = (a, b, c, first) => {
    if (a === null || b === null || c === null || a === b || b === c || c === a) {
      return;
    }
    if (first === a) {
      triangles.push(b, c, a);
    } else if (first === b) {
      triangles.push(c, a, b);
    } else {
      triangles.push(a, b, c);
    }
    sourceTriangleCount += 1;
  };
  const readIndex = (index) => readD3D8Index(indexBytes, indexByteOffset, index, indexSize);
  switch (Number(primitiveType) >>> 0) {
    case D3DPT_TRIANGLELIST:
      for (let index = 0; index + 2 < indexCount; index += 3) {
        const a = readIndex(index);
        const b = readIndex(index + 1);
        const c = readIndex(index + 2);
        addTriangle(a, b, c, a);
      }
      break;
    case D3DPT_TRIANGLESTRIP:
      for (let index = 0; index + 2 < indexCount; ++index) {
        const a = readIndex(index);
        const b = readIndex(index + 1);
        const c = readIndex(index + 2);
        if ((index & 1) === 0) {
          addTriangle(a, b, c, a);
        } else {
          addTriangle(b, a, c, a);
        }
      }
      break;
    case D3DPT_TRIANGLEFAN:
      for (let index = 1; index + 1 < indexCount; ++index) {
        const a = readIndex(0);
        const b = readIndex(index);
        const c = readIndex(index + 1);
        addTriangle(a, b, c, b);
      }
      break;
    default:
      return { supported: false, reason: "nonTrianglePrimitive" };
  }

  if (triangles.length === 0) {
    return { supported: false, reason: "emptyFlatShadeTriangles" };
  }
  const IndexArray = indexSize === 4 ? Uint32Array : Uint16Array;
  return {
    supported: true,
    triangleIndices: new IndexArray(triangles),
    generatedIndexCount: triangles.length,
    sourceTriangleCount,
    indexTypeName: indexSize === 4 ? "uint32" : "uint16",
  };
}

function buildD3D8WireframeIndices(
  indexResource,
  indexByteOffset,
  indexCount,
  indexSize,
  primitiveType,
  options = {},
) {
  const indexBytes = indexResource?.bytes;
  const requiredByteSize = indexByteOffset + indexCount * indexSize;
  if (!(indexBytes instanceof Uint8Array)) {
    return { supported: false, reason: "missingIndexMirror" };
  }
  if (requiredByteSize > indexBytes.byteLength) {
    return { supported: false, reason: "indexRangeOutOfBounds" };
  }

  const vertexBytes = options.vertexResource?.bytes;
  const vertexByteOffset = Number(options.vertexByteOffset ?? 0) >>> 0;
  const vertexStride = Number(options.vertexStride ?? 0) >>> 0;
  const cullMode = Number(options.cullMode ?? D3DCULL_NONE) >>> 0;
  const cullRequested = cullMode === D3DCULL_CW || cullMode === D3DCULL_CCW;
  const cullingAvailable = Boolean(cullRequested &&
    vertexBytes instanceof Uint8Array &&
    options.transforms &&
    vertexStride >= 12);
  const projectedVertex = (vertexIndex) =>
    projectD3D8VertexToNdc(vertexBytes, vertexByteOffset, vertexStride, options.transforms, vertexIndex);
  const edges = [];
  let sourceTriangleCount = 0;
  let emittedTriangleCount = 0;
  let culledTriangleCount = 0;
  let degenerateTriangleCount = 0;
  let cwTriangleCount = 0;
  let ccwTriangleCount = 0;
  const addTriangle = (a, b, c) => {
    if (a === null || b === null || c === null || a === b || b === c || c === a) {
      degenerateTriangleCount += 1;
      return;
    }
    sourceTriangleCount += 1;
    if (cullingAvailable) {
      const area = d3d8ProjectedTriangleArea(
        projectedVertex(a),
        projectedVertex(b),
        projectedVertex(c),
      );
      const cullInfo = d3d8TriangleCullInfo(area, cullMode);
      if (cullInfo.degenerate) {
        degenerateTriangleCount += 1;
        return;
      }
      if (cullInfo.winding === "cw") {
        cwTriangleCount += 1;
      } else if (cullInfo.winding === "ccw") {
        ccwTriangleCount += 1;
      }
      if (cullInfo.culled) {
        culledTriangleCount += 1;
        return;
      }
    }
    edges.push(a, b, b, c, c, a);
    emittedTriangleCount += 1;
  };
  const readIndex = (index) => readD3D8Index(indexBytes, indexByteOffset, index, indexSize);
  switch (Number(primitiveType) >>> 0) {
    case D3DPT_TRIANGLELIST:
      for (let index = 0; index + 2 < indexCount; index += 3) {
        addTriangle(readIndex(index), readIndex(index + 1), readIndex(index + 2));
      }
      break;
    case D3DPT_TRIANGLESTRIP:
      for (let index = 0; index + 2 < indexCount; ++index) {
        const a = readIndex(index);
        const b = readIndex(index + 1);
        const c = readIndex(index + 2);
        if ((index & 1) === 0) {
          addTriangle(a, b, c);
        } else {
          addTriangle(b, a, c);
        }
      }
      break;
    case D3DPT_TRIANGLEFAN:
      for (let index = 1; index + 1 < indexCount; ++index) {
        addTriangle(readIndex(0), readIndex(index), readIndex(index + 1));
      }
      break;
    default:
      return { supported: false, reason: "nonTrianglePrimitive" };
  }

  const IndexArray = indexSize === 4 ? Uint32Array : Uint16Array;
  if (edges.length === 0 && !(cullingAvailable && sourceTriangleCount > 0 && culledTriangleCount > 0)) {
    return { supported: false, reason: "emptyWireframe" };
  }
  return {
    supported: true,
    lineIndices: new IndexArray(edges),
    generatedIndexCount: edges.length,
    sourceTriangleCount,
    indexTypeName: indexSize === 4 ? "uint32" : "uint16",
    cullMode,
    cullingRequested: cullRequested,
    cullingApplied: cullingAvailable,
    emittedTriangleCount,
    culledTriangleCount,
    degenerateTriangleCount,
    cwTriangleCount,
    ccwTriangleCount,
  };
}

function createD3D8FillModeDrawInfo(
  renderState,
  primitiveType,
  indexResource,
  indexByteOffset,
  indexCount,
  indexSize,
  options = {},
) {
  const mode = Number(renderState.fillMode ?? D3DFILL_SOLID) >>> 0;
  const baseGlPrimitive = d3dPrimitiveToGl(primitiveType);
  const info = {
    mode,
    modeName: d3dFillModeName(mode),
    requestedPrimitiveType: Number(primitiveType ?? 0) >>> 0,
    originalPrimitiveName: glPrimitiveName(baseGlPrimitive),
    glPrimitive: baseGlPrimitive,
    glPrimitiveName: glPrimitiveName(baseGlPrimitive),
    drawIndexCount: indexCount,
    drawIndexByteOffset: indexByteOffset,
    generatedIndexCount: 0,
    sourceTriangleCount: 0,
    emittedTriangleCount: 0,
    culledTriangleCount: 0,
    degenerateTriangleCount: 0,
    cwTriangleCount: 0,
    ccwTriangleCount: 0,
    cullMode: Number(renderState.cullMode ?? D3DCULL_NONE) >>> 0,
    cullingRequested: false,
    cullingApplied: false,
    indexTypeName: indexSize === 4 ? "uint32" : "uint16",
    temporaryIndexBuffer: false,
    pointFill: false,
    wireframe: false,
    supported: baseGlPrimitive !== 0,
    fallbackReason: baseGlPrimitive !== 0 ? null : "unsupportedPrimitive",
  };

  if (!info.supported) {
    return info;
  }
  if (mode === D3DFILL_POINT) {
    info.pointFill = true;
    info.glPrimitive = gl.POINTS;
    info.glPrimitiveName = glPrimitiveName(info.glPrimitive);
    return info;
  }
  if (mode !== D3DFILL_WIREFRAME) {
    return info;
  }
  if (!d3dPrimitiveIsTriangle(primitiveType)) {
    return info;
  }

  const wireframe = buildD3D8WireframeIndices(
    indexResource,
    indexByteOffset,
    indexCount,
    indexSize,
    primitiveType,
    {
      ...options,
      cullMode: info.cullMode,
    },
  );
  info.wireframe = true;
  info.supported = wireframe.supported;
  info.fallbackReason = wireframe.supported ? null : wireframe.reason;
  info.generatedIndexCount = wireframe.generatedIndexCount ?? 0;
  info.sourceTriangleCount = wireframe.sourceTriangleCount ?? 0;
  info.emittedTriangleCount = wireframe.emittedTriangleCount ?? 0;
  info.culledTriangleCount = wireframe.culledTriangleCount ?? 0;
  info.degenerateTriangleCount = wireframe.degenerateTriangleCount ?? 0;
  info.cwTriangleCount = wireframe.cwTriangleCount ?? 0;
  info.ccwTriangleCount = wireframe.ccwTriangleCount ?? 0;
  info.cullingRequested = wireframe.cullingRequested === true;
  info.cullingApplied = wireframe.cullingApplied === true;
  info.indexTypeName = wireframe.indexTypeName ?? info.indexTypeName;
  if (wireframe.supported) {
    info.glPrimitive = gl.LINES;
    info.glPrimitiveName = glPrimitiveName(info.glPrimitive);
    info.drawIndexCount = wireframe.generatedIndexCount;
    info.drawIndexByteOffset = 0;
    info.lineIndices = wireframe.lineIndices;
    info.temporaryIndexBuffer = true;
  }
  return info;
}

function hasD3D8FirstVertexConventionExtension() {
  return Boolean(provokingVertex &&
      typeof provokingVertex.provokingVertexWEBGL === "function" &&
      typeof provokingVertex.FIRST_VERTEX_CONVENTION_WEBGL === "number" &&
      typeof provokingVertex.LAST_VERTEX_CONVENTION_WEBGL === "number");
}

function setD3D8FirstVertexConvention(enabled) {
  if (!hasD3D8FirstVertexConventionExtension()) {
    return false;
  }
  if (enabled) {
    provokingVertex.provokingVertexWEBGL(provokingVertex.FIRST_VERTEX_CONVENTION_WEBGL);
  } else {
    provokingVertex.provokingVertexWEBGL(provokingVertex.LAST_VERTEX_CONVENTION_WEBGL);
  }
  return true;
}

function createD3D8ShadeModeDrawInfo(
  renderState,
  primitiveType,
  indexResource,
  indexByteOffset,
  indexCount,
  indexSize,
  fillModeDraw,
) {
  const mode = Number(renderState.shadeMode ?? D3DSHADE_GOURAUD) >>> 0;
  const flat = mode === D3DSHADE_FLAT;
  const info = {
    mode,
    modeName: d3dShadeModeName(mode),
    flat,
    gouraud: mode === D3DSHADE_GOURAUD,
    phongRequested: mode === D3DSHADE_PHONG,
    usesFlatShader: flat,
    usesFirstVertexConvention: false,
    rotatedIndexBuffer: false,
    temporaryIndexBuffer: false,
    glPrimitive: fillModeDraw.glPrimitive,
    glPrimitiveName: fillModeDraw.glPrimitiveName,
    drawIndexCount: fillModeDraw.drawIndexCount,
    drawIndexByteOffset: fillModeDraw.drawIndexByteOffset,
    generatedIndexCount: 0,
    sourceTriangleCount: 0,
    indexTypeName: indexSize === 4 ? "uint32" : "uint16",
    supported: fillModeDraw.supported,
    fallbackReason: fillModeDraw.fallbackReason,
  };

  if (!info.supported || !flat) {
    return info;
  }

  if (fillModeDraw.temporaryIndexBuffer || !d3dPrimitiveIsTriangle(primitiveType)) {
    return info;
  }

  if (hasD3D8FirstVertexConventionExtension()) {
    info.usesFirstVertexConvention = true;
    return info;
  }

  const flatShade = buildD3D8FlatShadeIndices(
    indexResource,
    indexByteOffset,
    indexCount,
    indexSize,
    primitiveType,
  );
  info.supported = flatShade.supported;
  info.fallbackReason = flatShade.supported ? null : flatShade.reason;
  info.generatedIndexCount = flatShade.generatedIndexCount ?? 0;
  info.sourceTriangleCount = flatShade.sourceTriangleCount ?? 0;
  info.indexTypeName = flatShade.indexTypeName ?? info.indexTypeName;
  if (flatShade.supported) {
    info.glPrimitive = gl.TRIANGLES;
    info.glPrimitiveName = glPrimitiveName(info.glPrimitive);
    info.drawIndexCount = flatShade.generatedIndexCount;
    info.drawIndexByteOffset = 0;
    info.triangleIndices = flatShade.triangleIndices;
    info.rotatedIndexBuffer = true;
    info.temporaryIndexBuffer = true;
  }
  return info;
}

function d3d8FillModeProbeInfo(fillModeDraw) {
  if (!fillModeDraw) {
    return null;
  }
  return {
    mode: fillModeDraw.mode,
    modeName: fillModeDraw.modeName,
    requestedPrimitiveType: fillModeDraw.requestedPrimitiveType,
    originalPrimitiveName: fillModeDraw.originalPrimitiveName,
    glPrimitiveName: fillModeDraw.glPrimitiveName,
    drawIndexCount: fillModeDraw.drawIndexCount,
    drawIndexByteOffset: fillModeDraw.drawIndexByteOffset,
    generatedIndexCount: fillModeDraw.generatedIndexCount,
    sourceTriangleCount: fillModeDraw.sourceTriangleCount,
    emittedTriangleCount: fillModeDraw.emittedTriangleCount,
    culledTriangleCount: fillModeDraw.culledTriangleCount,
    degenerateTriangleCount: fillModeDraw.degenerateTriangleCount,
    cwTriangleCount: fillModeDraw.cwTriangleCount,
    ccwTriangleCount: fillModeDraw.ccwTriangleCount,
    cullMode: fillModeDraw.cullMode,
    cullingRequested: fillModeDraw.cullingRequested,
    cullingApplied: fillModeDraw.cullingApplied,
    indexTypeName: fillModeDraw.indexTypeName,
    temporaryIndexBuffer: fillModeDraw.temporaryIndexBuffer,
    pointFill: fillModeDraw.pointFill,
    wireframe: fillModeDraw.wireframe,
    supported: fillModeDraw.supported,
    fallbackReason: fillModeDraw.fallbackReason,
  };
}

function d3d8ShadeModeProbeInfo(shadeModeDraw) {
  if (!shadeModeDraw) {
    return null;
  }
  return {
    mode: shadeModeDraw.mode,
    modeName: shadeModeDraw.modeName,
    flat: shadeModeDraw.flat,
    gouraud: shadeModeDraw.gouraud,
    phongRequested: shadeModeDraw.phongRequested,
    usesFlatShader: shadeModeDraw.usesFlatShader,
    usesFirstVertexConvention: shadeModeDraw.usesFirstVertexConvention,
    rotatedIndexBuffer: shadeModeDraw.rotatedIndexBuffer,
    temporaryIndexBuffer: shadeModeDraw.temporaryIndexBuffer,
    glPrimitiveName: shadeModeDraw.glPrimitiveName,
    drawIndexCount: shadeModeDraw.drawIndexCount,
    drawIndexByteOffset: shadeModeDraw.drawIndexByteOffset,
    generatedIndexCount: shadeModeDraw.generatedIndexCount,
    sourceTriangleCount: shadeModeDraw.sourceTriangleCount,
    indexTypeName: shadeModeDraw.indexTypeName,
    supported: shadeModeDraw.supported,
    fallbackReason: shadeModeDraw.fallbackReason,
  };
}

function pixelHasColor(pixel, threshold = 8) {
  return Array.isArray(pixel) && pixel.slice(0, 3).some((component) => component > threshold);
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

function normalizeD3DMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 16) {
    return null;
  }
  if (!matrix.every(Number.isFinite)) {
    return null;
  }
  return new Float32Array(matrix);
}

function isIdentityD3DMatrix(matrix) {
  if (!matrix || matrix.length !== 16) {
    return false;
  }
  for (let index = 0; index < 16; ++index) {
    const expected = index % 5 === 0 ? 1 : 0;
    if (Math.abs(matrix[index] - expected) > 0.000001) {
      return false;
    }
  }
  return true;
}

function multiplyD3D8ColumnMatrixVector(matrix, vector) {
  if (!matrix || matrix.length !== 16) {
    return vector.slice();
  }
  const [x, y, z, w] = vector;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] * w,
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] * w,
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] * w,
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15] * w,
  ];
}

function readD3D8Float32(view, offset) {
  if (!view || offset < 0 || offset + 4 > view.byteLength) {
    return 0;
  }
  const value = view.getFloat32(offset, true);
  return Number.isFinite(value) ? value : 0;
}

function d3d8DiffuseRgbaFromBytes(bytes, offset) {
  if (!(bytes instanceof Uint8Array) || offset < 0 || offset + 4 > bytes.byteLength) {
    return null;
  }
  return [
    bytes[offset + 2],
    bytes[offset + 1],
    bytes[offset],
    bytes[offset + 3],
  ];
}

function inspectD3D8DrawVertices(resource, byteOffset, vertexStride, vertexCount, vertexLayout,
    transforms, viewport) {
  const bytes = resource?.bytes;
  if (!(bytes instanceof Uint8Array) || vertexStride < 12 || vertexCount === 0) {
    return null;
  }
  const availableVertices = Math.min(
    vertexCount,
    Math.floor(Math.max(0, bytes.byteLength - byteOffset) / vertexStride),
  );
  if (availableVertices <= 0) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
  const diffuse = {
    available: vertexLayout?.diffuseOffset !== null,
    sampleCount: 0,
    nonBlackRgb: 0,
    min: [255, 255, 255, 255],
    max: [0, 0, 0, 0],
    average: [0, 0, 0, 0],
  };
  const projected = transforms ? {
    sampleCount: 0,
    visible: 0,
    behindOrInvalidW: 0,
    ndcMin: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ndcMax: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    screenMin: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    screenMax: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    clipWMin: Number.POSITIVE_INFINITY,
    clipWMax: Number.NEGATIVE_INFINITY,
  } : null;
  const samples = [];
  const sampleIndices = new Set(Array.from({ length: Math.min(8, availableVertices) }, (_, index) =>
    Math.min(availableVertices - 1, Math.floor((index * (availableVertices - 1)) / 7))));

  for (let vertexIndex = 0; vertexIndex < availableVertices; ++vertexIndex) {
    const base = byteOffset + vertexIndex * vertexStride;
    const position = [
      readD3D8Float32(view, base),
      readD3D8Float32(view, base + 4),
      readD3D8Float32(view, base + 8),
    ];
    for (let axis = 0; axis < 3; ++axis) {
      bounds.min[axis] = Math.min(bounds.min[axis], position[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], position[axis]);
    }

    const diffuseOffset = vertexLayout?.diffuseOffset;
    const rgba = diffuse.available
      ? d3d8DiffuseRgbaFromBytes(bytes, base + diffuseOffset)
      : null;
    if (rgba) {
      diffuse.sampleCount += 1;
      if (rgba[0] > 0 || rgba[1] > 0 || rgba[2] > 0) {
        diffuse.nonBlackRgb += 1;
      }
      for (let component = 0; component < 4; ++component) {
        diffuse.min[component] = Math.min(diffuse.min[component], rgba[component]);
        diffuse.max[component] = Math.max(diffuse.max[component], rgba[component]);
        diffuse.average[component] += rgba[component];
      }
    }

    if (projected) {
      const worldPosition = multiplyD3D8ColumnMatrixVector(transforms.world, [...position, 1]);
      const viewPosition = multiplyD3D8ColumnMatrixVector(transforms.view, worldPosition);
      const d3dClip = multiplyD3D8ColumnMatrixVector(transforms.projection, viewPosition);
      const glClip = [d3dClip[0], d3dClip[1], d3dClip[2] * 2.0 - d3dClip[3], d3dClip[3]];
      projected.sampleCount += 1;
      projected.clipWMin = Math.min(projected.clipWMin, glClip[3]);
      projected.clipWMax = Math.max(projected.clipWMax, glClip[3]);
      if (Math.abs(glClip[3]) <= 0.000001) {
        projected.behindOrInvalidW += 1;
      } else {
        const ndc = [glClip[0] / glClip[3], glClip[1] / glClip[3], glClip[2] / glClip[3]];
        for (let axis = 0; axis < 3; ++axis) {
          projected.ndcMin[axis] = Math.min(projected.ndcMin[axis], ndc[axis]);
          projected.ndcMax[axis] = Math.max(projected.ndcMax[axis], ndc[axis]);
        }
        if (ndc[0] >= -1 && ndc[0] <= 1 && ndc[1] >= -1 && ndc[1] <= 1 && ndc[2] >= -1 && ndc[2] <= 1) {
          projected.visible += 1;
        }
        if (viewport?.gl) {
          const screenX = viewport.gl.x + (ndc[0] * 0.5 + 0.5) * viewport.gl.width;
          const screenY = viewport.gl.y + (1.0 - (ndc[1] * 0.5 + 0.5)) * viewport.gl.height;
          projected.screenMin[0] = Math.min(projected.screenMin[0], screenX);
          projected.screenMin[1] = Math.min(projected.screenMin[1], screenY);
          projected.screenMax[0] = Math.max(projected.screenMax[0], screenX);
          projected.screenMax[1] = Math.max(projected.screenMax[1], screenY);
        }
      }
    }

    if (sampleIndices.has(vertexIndex)) {
      const texCoords = [];
      for (const texCoord of vertexLayout?.texCoords ?? []) {
        if (texCoord.available) {
          const coordBase = base + texCoord.offset;
          texCoords.push({
            coordSet: texCoord.coordSet,
            uv: [
              readD3D8Float32(view, coordBase),
              readD3D8Float32(view, coordBase + 4),
            ],
          });
        }
      }
      samples.push({
        index: vertexIndex,
        position,
        diffuse: rgba,
        texCoords,
      });
    }
  }

  if (diffuse.sampleCount > 0) {
    for (let component = 0; component < 4; ++component) {
      diffuse.average[component] = Number((diffuse.average[component] / diffuse.sampleCount).toFixed(3));
    }
  } else {
    diffuse.min = null;
    diffuse.max = null;
    diffuse.average = null;
  }

  return {
    availableVertices,
    positionBounds: bounds,
    diffuse,
    projected,
    samples,
  };
}

function inspectD3D8IndexedTriangles(vertexResource, vertexByteOffset, vertexStride,
    indexResource, indexByteOffset, indexCount, indexSize, primitiveType, transforms) {
  const vertexBytes = vertexResource?.bytes;
  const indexBytes = indexResource?.bytes;
  if (!(vertexBytes instanceof Uint8Array) ||
      !(indexBytes instanceof Uint8Array) ||
      vertexStride < 12 ||
      !transforms ||
      indexCount < 3 ||
      (indexSize !== 2 && indexSize !== 4)) {
    return null;
  }

  const readProjected = (vertexIndex) => {
    return projectD3D8VertexToNdc(vertexBytes, vertexByteOffset, vertexStride, transforms, vertexIndex);
  };
  const areaFor = (ia, ib, ic) => {
    return d3d8ProjectedTriangleArea(readProjected(ia), readProjected(ib), readProjected(ic));
  };
  const readIndex = (index) => readD3D8Index(indexBytes, indexByteOffset, index, indexSize);
  const result = {
    primitiveType,
    inspected: 0,
    cw: 0,
    ccw: 0,
    degenerate: 0,
    samples: [],
  };
  const recordTriangle = (triangleIndex, ia, ib, ic) => {
    if (ia < 0 || ib < 0 || ic < 0) {
      return;
    }
    const area = areaFor(ia, ib, ic);
    if (!Number.isFinite(area)) {
      return;
    }
    result.inspected += 1;
    if (Math.abs(area) <= 0.0000001) {
      result.degenerate += 1;
    } else if (area < 0) {
      result.cw += 1;
    } else {
      result.ccw += 1;
    }
    if (result.samples.length < 8) {
      result.samples.push({
        triangleIndex,
        indices: [ia, ib, ic],
        ndcSignedArea: Number(area.toFixed(8)),
        winding: Math.abs(area) <= 0.0000001 ? "degenerate" : (area < 0 ? "cw" : "ccw"),
      });
    }
  };

  if (primitiveType === D3DPT_TRIANGLELIST) {
    const triangleCount = Math.floor(indexCount / 3);
    for (let triangleIndex = 0; triangleIndex < triangleCount; ++triangleIndex) {
      const index = triangleIndex * 3;
      recordTriangle(triangleIndex, readIndex(index), readIndex(index + 1), readIndex(index + 2));
    }
  } else if (primitiveType === D3DPT_TRIANGLESTRIP) {
    for (let triangleIndex = 0; triangleIndex < indexCount - 2; ++triangleIndex) {
      const ia = readIndex(triangleIndex);
      const ib = readIndex(triangleIndex + 1);
      const ic = readIndex(triangleIndex + 2);
      if (ia === ib || ib === ic || ia === ic) {
        result.degenerate += 1;
        continue;
      }
      if (triangleIndex % 2 === 0) {
        recordTriangle(triangleIndex, ia, ib, ic);
      } else {
        recordTriangle(triangleIndex, ib, ia, ic);
      }
    }
  }

  return result.inspected > 0 ? result : null;
}

function d3d8TextureStageDrawSummary(textureStage = {}) {
  return {
    colorOp: textureStage.colorOp,
    colorArg0: textureStage.colorArg0,
    colorArg1: textureStage.colorArg1,
    colorArg2: textureStage.colorArg2,
    alphaOp: textureStage.alphaOp,
    alphaArg0: textureStage.alphaArg0,
    alphaArg1: textureStage.alphaArg1,
    alphaArg2: textureStage.alphaArg2,
    texCoordIndex: textureStage.texCoordIndex,
    addressU: textureStage.addressU,
    addressV: textureStage.addressV,
    minFilter: textureStage.minFilter,
    magFilter: textureStage.magFilter,
    mipFilter: textureStage.mipFilter,
    textureTransformFlags: textureStage.textureTransformFlags,
  };
}

function d3d8DrawVertexSummary(vertexDiagnostics) {
  if (!vertexDiagnostics) {
    return null;
  }
  return {
    availableVertices: vertexDiagnostics.availableVertices,
    positionBounds: vertexDiagnostics.positionBounds,
    diffuse: vertexDiagnostics.diffuse,
    projected: vertexDiagnostics.projected,
    triangles: vertexDiagnostics.triangles,
    samples: vertexDiagnostics.samples,
  };
}

function sampleD3D8TextureAtVertexSamples(resource, vertexDiagnostics, coordSet) {
  if (!resource?.width || !resource?.height || !Array.isArray(vertexDiagnostics?.samples)) {
    return [];
  }
  const samples = [];
  for (const sample of vertexDiagnostics.samples) {
    const texCoord = sample.texCoords?.find((coord) => coord.coordSet === coordSet);
    if (!texCoord) {
      continue;
    }
    const u = Number(texCoord.uv?.[0] ?? 0);
    const v = Number(texCoord.uv?.[1] ?? 0);
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      continue;
    }
    const x = Math.max(0, Math.min(resource.width - 1, Math.floor(u * resource.width)));
    const y = Math.max(0, Math.min(resource.height - 1, Math.floor(v * resource.height)));
    samples.push({
      vertexIndex: sample.index,
      uv: [u, v],
      xy: [x, y],
      pixel: sampleD3D8TexturePixel(resource, x, y),
    });
  }
  return samples;
}

function defaultD3D8TextureStageValue(stage, state) {
  switch (Number(state) >>> 0) {
    case D3DTSS_COLOROP:
      return stage === 0 ? D3DTOP_MODULATE : D3DTOP_DISABLE;
    case D3DTSS_COLORARG1:
      return D3DTA_TEXTURE;
    case D3DTSS_COLORARG2:
      return D3DTA_CURRENT;
    case D3DTSS_ALPHAOP:
      return stage === 0 ? D3DTOP_SELECTARG1 : D3DTOP_DISABLE;
    case D3DTSS_ALPHAARG1:
      return D3DTA_TEXTURE;
    case D3DTSS_ALPHAARG2:
      return D3DTA_CURRENT;
    case D3DTSS_TEXCOORDINDEX:
      return stage;
    case D3DTSS_ADDRESSU:
    case D3DTSS_ADDRESSV:
    case D3DTSS_ADDRESSW:
      return D3DTADDRESS_WRAP;
    case D3DTSS_MAGFILTER:
    case D3DTSS_MINFILTER:
      return D3DTEXF_POINT;
    case D3DTSS_MIPFILTER:
      return D3DTEXF_NONE;
    case D3DTSS_MIPMAPLODBIAS:
    case D3DTSS_MAXMIPLEVEL:
      return 0;
    case D3DTSS_TEXTURETRANSFORMFLAGS:
      return D3DTTFF_DISABLE;
    case D3DTSS_COLORARG0:
    case D3DTSS_ALPHAARG0:
    case D3DTSS_RESULTARG:
      return D3DTA_CURRENT;
    default:
      return 0;
  }
}

function normalizeD3D8TextureStageState(textureStage = {}, stageIndex = 0) {
  const stage = Number(textureStage?.stage ?? stageIndex) >>> 0;
  const value = (key, state) =>
    Number(textureStage?.[key] ?? defaultD3D8TextureStageValue(stage, state)) >>> 0;
  return {
    stage,
    colorOp: value("colorOp", D3DTSS_COLOROP),
    colorArg1: value("colorArg1", D3DTSS_COLORARG1),
    colorArg2: value("colorArg2", D3DTSS_COLORARG2),
    alphaOp: value("alphaOp", D3DTSS_ALPHAOP),
    alphaArg1: value("alphaArg1", D3DTSS_ALPHAARG1),
    alphaArg2: value("alphaArg2", D3DTSS_ALPHAARG2),
    texCoordIndex: value("texCoordIndex", D3DTSS_TEXCOORDINDEX),
    addressU: value("addressU", D3DTSS_ADDRESSU),
    addressV: value("addressV", D3DTSS_ADDRESSV),
    magFilter: value("magFilter", D3DTSS_MAGFILTER),
    minFilter: value("minFilter", D3DTSS_MINFILTER),
    mipFilter: value("mipFilter", D3DTSS_MIPFILTER),
    textureTransformFlags: value("textureTransformFlags", D3DTSS_TEXTURETRANSFORMFLAGS),
    addressW: value("addressW", D3DTSS_ADDRESSW),
    colorArg0: value("colorArg0", D3DTSS_COLORARG0),
    alphaArg0: value("alphaArg0", D3DTSS_ALPHAARG0),
    resultArg: value("resultArg", D3DTSS_RESULTARG),
    borderColor: Number(textureStage?.borderColor ?? 0) >>> 0,
    maxMipLevel: value("maxMipLevel", D3DTSS_MAXMIPLEVEL),
    maxAnisotropy: Number(textureStage?.maxAnisotropy ?? 1) >>> 0,
    mipMapLodBias: value("mipMapLodBias", D3DTSS_MIPMAPLODBIAS),
    bumpEnvMat00: Number(textureStage?.bumpEnvMat00 ?? 0) >>> 0,
    bumpEnvMat01: Number(textureStage?.bumpEnvMat01 ?? 0) >>> 0,
    bumpEnvMat10: Number(textureStage?.bumpEnvMat10 ?? 0) >>> 0,
    bumpEnvMat11: Number(textureStage?.bumpEnvMat11 ?? 0) >>> 0,
    bumpEnvLScale: Number(textureStage?.bumpEnvLScale ?? 0) >>> 0,
    bumpEnvLOffset: Number(textureStage?.bumpEnvLOffset ?? 0) >>> 0,
  };
}

function normalizeD3D8TextureStages(textureStages) {
  return Array.from({ length: D3D8_TEXTURE_STAGE_COUNT }, (_, stage) =>
    normalizeD3D8TextureStageState(Array.isArray(textureStages) ? textureStages[stage] : null, stage));
}

function normalizeD3D8ClipPlanes(clipPlanes) {
  return Array.from({ length: D3D8_CLIP_PLANE_COUNT }, (_, planeIndex) => {
    const source = Array.isArray(clipPlanes) ? clipPlanes[planeIndex] : null;
    return Array.from({ length: 4 }, (_, component) => {
      const value = Number(Array.isArray(source) ? source[component] : 0);
      return Number.isFinite(value) ? value : 0;
    });
  });
}

function flattenD3D8ClipPlanes(clipPlanes) {
  const flat = new Float32Array(D3D8_CLIP_PLANE_COUNT * 4);
  for (let planeIndex = 0; planeIndex < D3D8_CLIP_PLANE_COUNT; ++planeIndex) {
    for (let component = 0; component < 4; ++component) {
      flat[planeIndex * 4 + component] = clipPlanes[planeIndex]?.[component] ?? 0;
    }
  }
  return flat;
}

function d3d8ClipPlaneMask(renderState) {
  return renderState.clipping !== 0
    ? (renderState.clipPlaneEnable & ((1 << D3D8_CLIP_PLANE_COUNT) - 1))
    : 0;
}

function d3d8ClipPlaneInfo(renderState, clipPlanes) {
  const mask = d3d8ClipPlaneMask(renderState);
  return {
    enabled: mask !== 0,
    clipping: renderState.clipping,
    mask,
    enabledIndices: Array.from({ length: D3D8_CLIP_PLANE_COUNT }, (_, index) => index)
      .filter((index) => (mask & (1 << index)) !== 0),
    planes: clipPlanes.map((plane) => plane.slice()),
  };
}

function normalizeD3D8RenderState(renderState = {}) {
  return {
    cullMode: Number(renderState.cullMode ?? D3DCULL_CW) >>> 0,
    zEnable: Number(renderState.zEnable ?? D3DZB_TRUE) >>> 0,
    zWriteEnable: Number(renderState.zWriteEnable ?? 1) >>> 0,
    zFunc: Number(renderState.zFunc ?? D3DCMP_LESSEQUAL) >>> 0,
    alphaBlendEnable: Number(renderState.alphaBlendEnable ?? 0) >>> 0,
    srcBlend: Number(renderState.srcBlend ?? D3DBLEND_ONE) >>> 0,
    destBlend: Number(renderState.destBlend ?? D3DBLEND_ZERO) >>> 0,
    blendOp: Number(renderState.blendOp ?? D3DBLENDOP_ADD) >>> 0,
    alphaTestEnable: Number(renderState.alphaTestEnable ?? 0) >>> 0,
    alphaFunc: Number(renderState.alphaFunc ?? D3DCMP_LESSEQUAL) >>> 0,
    alphaRef: Number(renderState.alphaRef ?? 0) >>> 0,
    colorWriteEnable: Number(renderState.colorWriteEnable ??
      (D3DCOLORWRITEENABLE_RED | D3DCOLORWRITEENABLE_GREEN |
        D3DCOLORWRITEENABLE_BLUE | D3DCOLORWRITEENABLE_ALPHA)) >>> 0,
    textureFactor: Number(renderState.textureFactor ?? 0) >>> 0,
    stencilEnable: Number(renderState.stencilEnable ?? 0) >>> 0,
    stencilFail: Number(renderState.stencilFail ?? D3DSTENCILOP_KEEP) >>> 0,
    stencilZFail: Number(renderState.stencilZFail ?? D3DSTENCILOP_KEEP) >>> 0,
    stencilPass: Number(renderState.stencilPass ?? D3DSTENCILOP_KEEP) >>> 0,
    stencilFunc: Number(renderState.stencilFunc ?? D3DCMP_ALWAYS) >>> 0,
    stencilRef: Number(renderState.stencilRef ?? 0) >>> 0,
    stencilMask: Number(renderState.stencilMask ?? 0xffffffff) >>> 0,
    stencilWriteMask: Number(renderState.stencilWriteMask ?? 0xffffffff) >>> 0,
    fogEnable: Number(renderState.fogEnable ?? 0) >>> 0,
    fogColor: Number(renderState.fogColor ?? 0) >>> 0,
    fogStart: Number(renderState.fogStart ?? 0) >>> 0,
    fogEnd: Number(renderState.fogEnd ?? D3D_FLOAT_ONE_BITS) >>> 0,
    fogVertexMode: Number(renderState.fogVertexMode ?? D3DFOG_LINEAR) >>> 0,
    rangeFogEnable: Number(renderState.rangeFogEnable ?? 0) >>> 0,
    fillMode: Number(renderState.fillMode ?? D3DFILL_SOLID) >>> 0,
    zBias: Number(renderState.zBias ?? 0) >>> 0,
    shadeMode: Number(renderState.shadeMode ?? D3DSHADE_GOURAUD) >>> 0,
    lighting: Number(renderState.lighting ?? 1) >>> 0,
    specularEnable: Number(renderState.specularEnable ?? 0) >>> 0,
    normalizeNormals: Number(renderState.normalizeNormals ?? 0) >>> 0,
    localViewer: Number(renderState.localViewer ?? 1) >>> 0,
    ambient: Number(renderState.ambient ?? 0) >>> 0,
    colorVertex: Number(renderState.colorVertex ?? 1) >>> 0,
    diffuseMaterialSource: Number(renderState.diffuseMaterialSource ?? D3DMCS_COLOR1) >>> 0,
    specularMaterialSource: Number(renderState.specularMaterialSource ?? D3DMCS_COLOR2) >>> 0,
    ambientMaterialSource: Number(renderState.ambientMaterialSource ?? D3DMCS_MATERIAL) >>> 0,
    emissiveMaterialSource: Number(renderState.emissiveMaterialSource ?? D3DMCS_MATERIAL) >>> 0,
    clipping: Number(renderState.clipping ?? 1) >>> 0,
    clipPlaneEnable: Number(renderState.clipPlaneEnable ?? 0) >>> 0,
    textureStages: normalizeD3D8TextureStages(renderState.textureStages),
  };
}

function d3dCmpToGl(compareFunc) {
  switch (Number(compareFunc) >>> 0) {
    case D3DCMP_NEVER:
      return gl.NEVER;
    case D3DCMP_LESS:
      return gl.LESS;
    case D3DCMP_EQUAL:
      return gl.EQUAL;
    case D3DCMP_LESSEQUAL:
      return gl.LEQUAL;
    case D3DCMP_GREATER:
      return gl.GREATER;
    case D3DCMP_NOTEQUAL:
      return gl.NOTEQUAL;
    case D3DCMP_GREATEREQUAL:
      return gl.GEQUAL;
    case D3DCMP_ALWAYS:
    default:
      return gl.ALWAYS;
  }
}

function d3dBlendFactorToGl(blendFactor) {
  switch (Number(blendFactor) >>> 0) {
    case D3DBLEND_ZERO:
      return gl.ZERO;
    case D3DBLEND_ONE:
      return gl.ONE;
    case D3DBLEND_SRCCOLOR:
      return gl.SRC_COLOR;
    case D3DBLEND_INVSRCCOLOR:
      return gl.ONE_MINUS_SRC_COLOR;
    case D3DBLEND_SRCALPHA:
    case D3DBLEND_BOTHSRCALPHA:
      return gl.SRC_ALPHA;
    case D3DBLEND_INVSRCALPHA:
    case D3DBLEND_BOTHINVSRCALPHA:
      return gl.ONE_MINUS_SRC_ALPHA;
    case D3DBLEND_DESTALPHA:
      return gl.DST_ALPHA;
    case D3DBLEND_INVDESTALPHA:
      return gl.ONE_MINUS_DST_ALPHA;
    case D3DBLEND_DESTCOLOR:
      return gl.DST_COLOR;
    case D3DBLEND_INVDESTCOLOR:
      return gl.ONE_MINUS_DST_COLOR;
    case D3DBLEND_SRCALPHASAT:
      return gl.SRC_ALPHA_SATURATE;
    default:
      return gl.ONE;
  }
}

function d3dBlendOpToGl(blendOp) {
  switch (Number(blendOp) >>> 0) {
    case D3DBLENDOP_SUBTRACT:
      return gl.FUNC_SUBTRACT;
    case D3DBLENDOP_REVSUBTRACT:
      return gl.FUNC_REVERSE_SUBTRACT;
    case D3DBLENDOP_MIN:
      return gl.MIN;
    case D3DBLENDOP_MAX:
      return gl.MAX;
    case D3DBLENDOP_ADD:
    default:
      return gl.FUNC_ADD;
  }
}

function d3dStencilOpToGl(stencilOp) {
  switch (Number(stencilOp) >>> 0) {
    case D3DSTENCILOP_ZERO:
      return gl.ZERO;
    case D3DSTENCILOP_REPLACE:
      return gl.REPLACE;
    case D3DSTENCILOP_INCRSAT:
      return gl.INCR;
    case D3DSTENCILOP_DECRSAT:
      return gl.DECR;
    case D3DSTENCILOP_INVERT:
      return gl.INVERT;
    case D3DSTENCILOP_INCR:
      return gl.INCR_WRAP;
    case D3DSTENCILOP_DECR:
      return gl.DECR_WRAP;
    case D3DSTENCILOP_KEEP:
    default:
      return gl.KEEP;
  }
}

function applyD3D8RenderState(renderState, options = {}) {
  const state = normalizeD3D8RenderState(renderState);
  const cullEnabled = state.cullMode === D3DCULL_CW || state.cullMode === D3DCULL_CCW;
  const cullFace = options.invertCullWinding
    ? (state.cullMode === D3DCULL_CW ? gl.FRONT : gl.BACK)
    : (state.cullMode === D3DCULL_CCW ? gl.FRONT : gl.BACK);
  const depthEnabled = state.zEnable === D3DZB_TRUE || state.zEnable === D3DZB_USEW;
  const depthFunc = d3dCmpToGl(state.zFunc);
  const blendEnabled = state.alphaBlendEnable !== 0;
  const srcBlend = d3dBlendFactorToGl(state.srcBlend);
  const destBlend = d3dBlendFactorToGl(state.destBlend);
  const blendEquation = d3dBlendOpToGl(state.blendOp);
  const stencilAvailable = Boolean(gl.getContextAttributes()?.stencil);
  const stencilEnabled = stencilAvailable && state.stencilEnable !== 0;
  const stencilFunc = d3dCmpToGl(state.stencilFunc);
  const stencilFail = d3dStencilOpToGl(state.stencilFail);
  const stencilZFail = d3dStencilOpToGl(state.stencilZFail);
  const stencilPass = d3dStencilOpToGl(state.stencilPass);
  const fogStart = d3dDwordToFloat(state.fogStart);
  const fogEnd = d3dDwordToFloat(state.fogEnd);
  const fogEnabled = state.fogEnable !== 0 &&
    state.fogVertexMode === D3DFOG_LINEAR &&
    Number.isFinite(fogStart) &&
    Number.isFinite(fogEnd) &&
    fogEnd > fogStart;
  const fogColor = d3dColorToNormalizedRgba(state.fogColor).slice(0, 3);
  const depthBias = d3d8DepthBiasInfo(state.zBias);
  const colorMask = {
    r: Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_RED),
    g: Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_GREEN),
    b: Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_BLUE),
    a: Boolean(state.colorWriteEnable & D3DCOLORWRITEENABLE_ALPHA),
  };

  gl.frontFace(gl.CCW);
  if (cullEnabled) {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(cullFace);
  } else {
    gl.disable(gl.CULL_FACE);
  }

  if (depthEnabled) {
    gl.enable(gl.DEPTH_TEST);
  } else {
    gl.disable(gl.DEPTH_TEST);
  }
  gl.depthMask(state.zWriteEnable !== 0);
  gl.depthFunc(depthFunc);

  if (blendEnabled) {
    gl.enable(gl.BLEND);
  } else {
    gl.disable(gl.BLEND);
  }
  gl.blendFunc(srcBlend, destBlend);
  gl.blendEquation(blendEquation);
  gl.colorMask(colorMask.r, colorMask.g, colorMask.b, colorMask.a);
  if (stencilEnabled) {
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(stencilFunc, state.stencilRef, state.stencilMask);
    gl.stencilOp(stencilFail, stencilZFail, stencilPass);
    gl.stencilMask(state.stencilWriteMask);
  } else {
    gl.disable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.ALWAYS, 0, 0xffffffff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.stencilMask(0xffffffff);
  }

  return {
    d3d: state,
    cull: {
      enabled: cullEnabled,
      frontFace: gl.CCW,
      cullFace: cullEnabled ? cullFace : gl.BACK,
      invertWinding: Boolean(options.invertCullWinding),
    },
    depth: {
      enabled: depthEnabled,
      mask: state.zWriteEnable !== 0,
      func: depthFunc,
      bias: depthBias,
    },
    blend: {
      enabled: blendEnabled,
      src: srcBlend,
      dest: destBlend,
      equation: blendEquation,
    },
    stencil: {
      available: stencilAvailable,
      enabled: stencilEnabled,
      func: stencilFunc,
      fail: stencilFail,
      zFail: stencilZFail,
      pass: stencilPass,
      ref: state.stencilRef,
      mask: state.stencilMask,
      writeMask: state.stencilWriteMask,
    },
    alphaTest: {
      enabled: state.alphaTestEnable !== 0,
      func: d3dCmpToGl(state.alphaFunc),
      ref: (state.alphaRef & 0xff) / 255,
    },
    fog: {
      enabled: fogEnabled,
      color: fogColor,
      start: fogStart,
      end: fogEnd,
      vertexMode: state.fogVertexMode,
      rangeEnabled: state.rangeFogEnable !== 0,
    },
    fillMode: {
      mode: state.fillMode,
      name: d3dFillModeName(state.fillMode),
    },
    shadeMode: {
      mode: state.shadeMode,
      name: d3dShadeModeName(state.shadeMode),
      flat: state.shadeMode === D3DSHADE_FLAT,
      gouraud: state.shadeMode === D3DSHADE_GOURAUD,
      phongRequested: state.shadeMode === D3DSHADE_PHONG,
    },
    lighting: {
      enabled: state.lighting !== 0,
      normalizeNormals: {
        enabled: state.normalizeNormals !== 0,
        value: state.normalizeNormals,
      },
      localViewer: {
        enabled: state.localViewer !== 0,
        value: state.localViewer,
      },
    },
    ambient: {
      color: state.ambient,
      rgba: d3dColorToNormalizedRgba(state.ambient),
    },
    materialSources: {
      colorVertex: {
        enabled: state.colorVertex !== 0,
        value: state.colorVertex,
      },
      diffuse: {
        source: state.diffuseMaterialSource,
        name: d3dMaterialSourceName(state.diffuseMaterialSource),
      },
      specular: {
        source: state.specularMaterialSource,
        name: d3dMaterialSourceName(state.specularMaterialSource),
      },
      ambient: {
        source: state.ambientMaterialSource,
        name: d3dMaterialSourceName(state.ambientMaterialSource),
      },
      emissive: {
        source: state.emissiveMaterialSource,
        name: d3dMaterialSourceName(state.emissiveMaterialSource),
      },
    },
    colorWrite: colorMask,
  };
}

function paintD3D8DrawIndexed(payload = {}) {
  const drawSequence = (Number(harnessState.graphics.d3d8DrawIndexedSequence ?? 0) >>> 0) + 1;
  const vertexByteSize = Number(payload.vertexBytes ?? 0) >>> 0;
  const indexByteSize = Number(payload.indexBytes ?? 0) >>> 0;
  const vertexBufferId = Number(payload.vertexBufferId ?? 0) >>> 0;
  const indexBufferId = Number(payload.indexBufferId ?? 0) >>> 0;
  const vertexByteOffset = Number(payload.vertexByteOffset ?? 0) >>> 0;
  const indexByteOffset = Number(payload.indexByteOffset ?? 0) >>> 0;
  const vertexStride = Number(payload.vertexStride ?? 0) >>> 0;
  const vertexShaderFvf = Number(payload.vertexShaderFvf ?? 0) >>> 0;
  const vertexCount = Number(payload.vertexCount ?? 0) >>> 0;
  const indexSize = Number(payload.indexSize ?? 0) >>> 0;
  const indexCount = Number(payload.indexCount ?? 0) >>> 0;
  const baseGlPrimitive = d3dPrimitiveToGl(payload.primitiveType);
  const vertexResource = d3d8Buffers.get(d3d8BufferKey(1, vertexBufferId));
  const indexResource = d3d8Buffers.get(d3d8BufferKey(2, indexBufferId));
  const usePersistentBuffers = Boolean(vertexResource && indexResource);
  const world = normalizeD3DMatrix(payload.transforms?.world);
  const view = normalizeD3DMatrix(payload.transforms?.view);
  const projection = normalizeD3DMatrix(payload.transforms?.projection);
  const texture0Transform = normalizeD3DMatrix(payload.transforms?.texture0);
  const texture1Transform = normalizeD3DMatrix(payload.transforms?.texture1);
  const transformMask = Number(payload.transformMask ?? 0) >>> 0;
  const useTransforms = transformMask === 7 && world !== null && view !== null && projection !== null;
  const usesIdentityClipSpace =
    useTransforms &&
    isIdentityD3DMatrix(world) &&
    isIdentityD3DMatrix(view) &&
    isIdentityD3DMatrix(projection);
  const renderState = normalizeD3D8RenderState(payload.renderState);
  const clipPlanes = normalizeD3D8ClipPlanes(payload.clipPlanes);
  const material = normalizeD3D8Material(payload.material);
  const lights = normalizeD3D8Lights(payload.lights);
  const fixedFunctionLights = d3d8FixedFunctionLights(lights);
  const directionalLights = d3d8DirectionalLights(lights);
  const firstDirectionalLight = directionalLights[0] ?? null;
  const vertexLayout = d3d8VertexLayoutInfo(vertexShaderFvf, vertexStride);
  const texture0Id = Number(d3d8BoundTextures.get(0) ?? 0) >>> 0;
  const texture0Resource = texture0Id !== 0 ? d3d8Textures.get(texture0Id) : null;
  const texture0Ready = Boolean(
    (texture0Resource?.target ?? gl?.TEXTURE_2D) === gl?.TEXTURE_2D &&
    texture0Resource?.initializedLevels?.has("0"));
  const texture1Id = Number(d3d8BoundTextures.get(1) ?? 0) >>> 0;
  const texture1Resource = texture1Id !== 0 ? d3d8Textures.get(texture1Id) : null;
  const texture1Ready = Boolean(
    (texture1Resource?.target ?? gl?.TEXTURE_2D) === gl?.TEXTURE_2D &&
    texture1Resource?.initializedLevels?.has("0"));
  const texture0Coordinates = textureStageCoordinateInfo(
    renderState.textureStages[0],
    0,
    vertexStride,
    vertexLayout,
    texture0Transform,
  );
  const texture1Coordinates = textureStageCoordinateInfo(
    renderState.textureStages[1],
    1,
    vertexStride,
    vertexLayout,
    texture1Transform,
  );
  const canSampleTexture0 = Boolean(texture0Ready && texture0Coordinates.supported);
  const canSampleTexture1 = Boolean(texture1Ready && texture1Coordinates.supported);
  const texture0SemanticMode = canSampleTexture0 ? d3d8TextureSemanticMode(texture0Resource) : 0;
  const texture1SemanticMode = canSampleTexture1 ? d3d8TextureSemanticMode(texture1Resource) : 0;
  const appliedTexture0Combiner = textureStageCombinerInfo(renderState.textureStages[0], 0, canSampleTexture0);
  const appliedStage1Combiner = textureStageCombinerInfo(renderState.textureStages[1], 1, canSampleTexture1);
  let appliedViewport = null;
  let appliedRenderState = null;
  let appliedTexture0Sampler = null;
  let appliedTexture1Sampler = null;
  let appliedFillMode = null;
  let appliedShadeMode = null;
  let vertexDiagnostics = null;
  let drawOk = false;
  syncCanvasSize();
  appliedViewport = applyD3D8Viewport("draw");
  vertexDiagnostics = inspectD3D8DrawVertices(
    vertexResource,
    vertexByteOffset,
    vertexStride,
    vertexCount,
    vertexLayout,
    useTransforms ? { world, view, projection } : null,
    appliedViewport,
  );
  if (vertexDiagnostics) {
    vertexDiagnostics.triangles = inspectD3D8IndexedTriangles(
      vertexResource,
      vertexByteOffset,
      vertexStride,
      indexResource,
      indexByteOffset,
      indexCount,
      indexSize,
      payload.primitiveType,
      useTransforms ? { world, view, projection } : null,
    );
  }
  const preDrawCenterPixel = sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
  let centerPixel = preDrawCenterPixel;

  if (gl && baseGlPrimitive && usePersistentBuffers && vertexByteSize > 0 && indexByteSize > 0 &&
      vertexStride >= 12 && indexCount > 0 && (indexSize === 2 || indexSize === 4)) {
    const bridgeProgram = ensureD3D8DrawProgram();
    gl.useProgram(bridgeProgram.program);
    appliedRenderState = applyD3D8RenderState(renderState, {
      invertCullWinding: false,
    });
    appliedRenderState.clipPlanes = d3d8ClipPlaneInfo(renderState, clipPlanes);
    appliedRenderState.lighting = {
      ...appliedRenderState.lighting,
      shaderEnabled: appliedRenderState.lighting.enabled && fixedFunctionLights.length > 0,
      normalTransform: {
        source: useTransforms ? "inverseTransposeWorld" : "attribute",
        inverseTransposeWorld: Boolean(useTransforms),
        normalizeNormals: renderState.normalizeNormals !== 0,
      },
      viewDirection: {
        source: renderState.localViewer !== 0 ? "cameraRelative" : "orthogonal",
        localViewer: renderState.localViewer !== 0,
      },
      specular: {
        enabled: renderState.specularEnable !== 0,
        material: material.specular.slice(),
        power: material.power,
        source: renderState.specularMaterialSource,
        sourceName: d3dMaterialSourceName(renderState.specularMaterialSource),
      },
      fixedFunctionLightSupported: fixedFunctionLights.length > 0,
      fixedFunctionLightCount: fixedFunctionLights.length,
      fixedFunctionLights,
      directionalLightSupported: directionalLights.length > 0,
      directionalLightCount: directionalLights.length,
      directionalLights,
      firstDirectionalLight,
    };
    const fillModeDraw = createD3D8FillModeDrawInfo(
      renderState,
      payload.primitiveType,
      indexResource,
      indexByteOffset,
      indexCount,
      indexSize,
      {
        vertexResource,
        vertexByteOffset,
        vertexStride,
        transforms: useTransforms ? { world, view, projection } : null,
      },
    );
    const shadeModeDraw = createD3D8ShadeModeDrawInfo(
      renderState,
      payload.primitiveType,
      indexResource,
      indexByteOffset,
      indexCount,
      indexSize,
      fillModeDraw,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexResource.buffer);
    gl.enableVertexAttribArray(bridgeProgram.position);
    gl.vertexAttribPointer(bridgeProgram.position, 3, gl.FLOAT, false, vertexStride, vertexByteOffset);
    if (bridgeProgram.normal >= 0 && vertexLayout.normalOffset !== null) {
      gl.enableVertexAttribArray(bridgeProgram.normal);
      gl.vertexAttribPointer(bridgeProgram.normal, 3, gl.FLOAT, false,
        vertexStride, vertexByteOffset + vertexLayout.normalOffset);
    } else if (bridgeProgram.normal >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.normal);
      gl.vertexAttrib3f(bridgeProgram.normal, 0, 0, 1);
    }
    if (bridgeProgram.diffuse >= 0 && vertexLayout.diffuseOffset !== null) {
      gl.enableVertexAttribArray(bridgeProgram.diffuse);
      gl.vertexAttribPointer(bridgeProgram.diffuse, 4, gl.UNSIGNED_BYTE, true,
        vertexStride, vertexByteOffset + vertexLayout.diffuseOffset);
    } else if (bridgeProgram.diffuse >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.diffuse);
      gl.vertexAttrib4f(bridgeProgram.diffuse, 1, 1, 1, 1);
    }
    if (bridgeProgram.specular >= 0 && vertexLayout.specularOffset !== null) {
      gl.enableVertexAttribArray(bridgeProgram.specular);
      gl.vertexAttribPointer(bridgeProgram.specular, 4, gl.UNSIGNED_BYTE, true,
        vertexStride, vertexByteOffset + vertexLayout.specularOffset);
    } else if (bridgeProgram.specular >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.specular);
      gl.vertexAttrib4f(bridgeProgram.specular, 0, 0, 0, 1);
    }
    if (bridgeProgram.texCoord0 >= 0 && canSampleTexture0 && texture0Coordinates.usesVertexTexCoord) {
      gl.enableVertexAttribArray(bridgeProgram.texCoord0);
      gl.vertexAttribPointer(bridgeProgram.texCoord0, 2, gl.FLOAT, false,
        vertexStride, vertexByteOffset + texture0Coordinates.offset);
    } else if (bridgeProgram.texCoord0 >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.texCoord0);
      gl.vertexAttrib2f(bridgeProgram.texCoord0, 0, 0);
    }
    if (bridgeProgram.texCoord1 >= 0 && canSampleTexture1 && texture1Coordinates.usesVertexTexCoord) {
      gl.enableVertexAttribArray(bridgeProgram.texCoord1);
      gl.vertexAttribPointer(bridgeProgram.texCoord1, 2, gl.FLOAT, false,
        vertexStride, vertexByteOffset + texture1Coordinates.offset);
    } else if (bridgeProgram.texCoord1 >= 0) {
      gl.disableVertexAttribArray(bridgeProgram.texCoord1);
      gl.vertexAttrib2f(bridgeProgram.texCoord1, 0, 0);
    }
    gl.uniform1f(bridgeProgram.scale, 1.0);
    gl.uniform1i(bridgeProgram.useTransforms, useTransforms ? 1 : 0);
    if (bridgeProgram.depthBias) {
      gl.uniform1f(bridgeProgram.depthBias, appliedRenderState.depth.bias.ndc);
    }
    if (bridgeProgram.clipPlaneMask) {
      gl.uniform1i(bridgeProgram.clipPlaneMask, appliedRenderState.clipPlanes.mask);
    }
    if (bridgeProgram.clipPlanes) {
      gl.uniform4fv(bridgeProgram.clipPlanes, flattenD3D8ClipPlanes(clipPlanes));
    }
    if (bridgeProgram.useFlatShade) {
      gl.uniform1i(bridgeProgram.useFlatShade, shadeModeDraw.usesFlatShader ? 1 : 0);
    }
    if (useTransforms) {
      // Direct3D stores row-vector matrices row-major; WebGL interprets this
      // memory as column-major, giving the transpose needed for GLSL
      // column-vector multiplication.
      gl.uniformMatrix4fv(bridgeProgram.world, false, world);
      gl.uniformMatrix4fv(bridgeProgram.view, false, view);
      gl.uniformMatrix4fv(bridgeProgram.projection, false, projection);
    }
    if (bridgeProgram.texture0CoordinateMode) {
      gl.uniform1i(bridgeProgram.texture0CoordinateMode,
        canSampleTexture0 ? texture0Coordinates.mode : D3DTSS_TCI_PASSTHRU);
    }
    if (bridgeProgram.useTexture0Transform) {
      gl.uniform1i(bridgeProgram.useTexture0Transform,
        canSampleTexture0 && texture0Coordinates.transformApplied ? 1 : 0);
    }
    if (bridgeProgram.texture0TransformComponentCount) {
      gl.uniform1i(bridgeProgram.texture0TransformComponentCount,
        canSampleTexture0 && texture0Coordinates.transformApplied
          ? texture0Coordinates.textureTransformComponentCount
          : 0);
    }
    if (bridgeProgram.texture0TransformProjected) {
      gl.uniform1i(bridgeProgram.texture0TransformProjected,
        canSampleTexture0 &&
          texture0Coordinates.transformApplied &&
          texture0Coordinates.textureTransformProjected
          ? 1
          : 0);
    }
    if (bridgeProgram.texture0Transform && canSampleTexture0 && texture0Coordinates.transformApplied) {
      gl.uniformMatrix4fv(bridgeProgram.texture0Transform, false, texture0Transform);
    }
    if (bridgeProgram.texture1CoordinateMode) {
      gl.uniform1i(bridgeProgram.texture1CoordinateMode,
        canSampleTexture1 ? texture1Coordinates.mode : D3DTSS_TCI_PASSTHRU);
    }
    if (bridgeProgram.useTexture1Transform) {
      gl.uniform1i(bridgeProgram.useTexture1Transform,
        canSampleTexture1 && texture1Coordinates.transformApplied ? 1 : 0);
    }
    if (bridgeProgram.texture1TransformComponentCount) {
      gl.uniform1i(bridgeProgram.texture1TransformComponentCount,
        canSampleTexture1 && texture1Coordinates.transformApplied
          ? texture1Coordinates.textureTransformComponentCount
          : 0);
    }
    if (bridgeProgram.texture1TransformProjected) {
      gl.uniform1i(bridgeProgram.texture1TransformProjected,
        canSampleTexture1 &&
          texture1Coordinates.transformApplied &&
          texture1Coordinates.textureTransformProjected
          ? 1
          : 0);
    }
    if (bridgeProgram.texture1Transform && canSampleTexture1 && texture1Coordinates.transformApplied) {
      gl.uniformMatrix4fv(bridgeProgram.texture1Transform, false, texture1Transform);
    }
    if (bridgeProgram.lightingEnabled) {
      gl.uniform1i(bridgeProgram.lightingEnabled, appliedRenderState.lighting.shaderEnabled ? 1 : 0);
    }
    if (bridgeProgram.specularEnabled) {
      gl.uniform1i(bridgeProgram.specularEnabled,
        appliedRenderState.lighting.specular.enabled ? 1 : 0);
    }
    if (bridgeProgram.normalizeNormals) {
      gl.uniform1i(bridgeProgram.normalizeNormals,
        appliedRenderState.lighting.normalizeNormals.enabled ? 1 : 0);
    }
    if (bridgeProgram.localViewer) {
      gl.uniform1i(bridgeProgram.localViewer,
        appliedRenderState.lighting.localViewer.enabled ? 1 : 0);
    }
    if (bridgeProgram.colorVertexEnabled) {
      gl.uniform1i(bridgeProgram.colorVertexEnabled,
        appliedRenderState.materialSources.colorVertex.enabled ? 1 : 0);
    }
    if (bridgeProgram.sceneAmbient) {
      gl.uniform4fv(bridgeProgram.sceneAmbient, new Float32Array(appliedRenderState.ambient.rgba));
    }
    if (bridgeProgram.materialDiffuse) {
      gl.uniform4fv(bridgeProgram.materialDiffuse, new Float32Array(material.diffuse));
    }
    if (bridgeProgram.materialAmbient) {
      gl.uniform4fv(bridgeProgram.materialAmbient, new Float32Array(material.ambient));
    }
    if (bridgeProgram.materialSpecular) {
      gl.uniform4fv(bridgeProgram.materialSpecular, new Float32Array(material.specular));
    }
    if (bridgeProgram.materialEmissive) {
      gl.uniform4fv(bridgeProgram.materialEmissive, new Float32Array(material.emissive));
    }
    if (bridgeProgram.materialPower) {
      gl.uniform1f(bridgeProgram.materialPower, material.power);
    }
    if (bridgeProgram.diffuseMaterialSource) {
      gl.uniform1i(bridgeProgram.diffuseMaterialSource, renderState.diffuseMaterialSource);
    }
    if (bridgeProgram.specularMaterialSource) {
      gl.uniform1i(bridgeProgram.specularMaterialSource, renderState.specularMaterialSource);
    }
    if (bridgeProgram.ambientMaterialSource) {
      gl.uniform1i(bridgeProgram.ambientMaterialSource, renderState.ambientMaterialSource);
    }
    if (bridgeProgram.emissiveMaterialSource) {
      gl.uniform1i(bridgeProgram.emissiveMaterialSource, renderState.emissiveMaterialSource);
    }
    if (bridgeProgram.fixedLightCount) {
      gl.uniform1i(bridgeProgram.fixedLightCount, fixedFunctionLights.length);
    }
    if (bridgeProgram.fixedLightType) {
      gl.uniform1iv(bridgeProgram.fixedLightType, flattenD3D8LightType(fixedFunctionLights));
    }
    if (bridgeProgram.fixedLightDiffuse) {
      gl.uniform4fv(bridgeProgram.fixedLightDiffuse,
        flattenD3D8LightColor(fixedFunctionLights, "diffuse", D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
    }
    if (bridgeProgram.fixedLightSpecular) {
      gl.uniform4fv(bridgeProgram.fixedLightSpecular,
        flattenD3D8LightColor(fixedFunctionLights, "specular", D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
    }
    if (bridgeProgram.fixedLightAmbient) {
      gl.uniform4fv(bridgeProgram.fixedLightAmbient,
        flattenD3D8LightColor(fixedFunctionLights, "ambient", D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
    }
    if (bridgeProgram.fixedLightPosition) {
      gl.uniform3fv(bridgeProgram.fixedLightPosition,
        flattenD3D8LightVector(fixedFunctionLights, "position", [0, 0, 0],
          D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
    }
    if (bridgeProgram.fixedLightDirection) {
      gl.uniform3fv(bridgeProgram.fixedLightDirection,
        flattenD3D8LightDirection(fixedFunctionLights, D3D8_FIXED_FUNCTION_LIGHT_UNIFORM_COUNT));
    }
    if (bridgeProgram.fixedLightRangeAttenuation) {
      gl.uniform4fv(bridgeProgram.fixedLightRangeAttenuation,
        flattenD3D8LightRangeAttenuation(fixedFunctionLights));
    }
    if (bridgeProgram.fixedLightSpot) {
      gl.uniform3fv(bridgeProgram.fixedLightSpot, flattenD3D8LightSpot(fixedFunctionLights));
    }
    if (bridgeProgram.useTexture0) {
      gl.uniform1i(bridgeProgram.useTexture0, canSampleTexture0 ? 1 : 0);
    }
    if (bridgeProgram.texture0) {
      gl.uniform1i(bridgeProgram.texture0, 0);
    }
    if (bridgeProgram.texture0LodBias) {
      const texture0LodBias = canSampleTexture0
        ? d3dDwordToFloat(renderState.textureStages[0].mipMapLodBias)
        : 0.0;
      gl.uniform1f(bridgeProgram.texture0LodBias, texture0LodBias);
    }
    if (bridgeProgram.texture0Semantic) {
      gl.uniform1i(bridgeProgram.texture0Semantic, texture0SemanticMode);
    }
    if (bridgeProgram.useTexture1) {
      gl.uniform1i(bridgeProgram.useTexture1, canSampleTexture1 ? 1 : 0);
    }
    if (bridgeProgram.texture1) {
      gl.uniform1i(bridgeProgram.texture1, 1);
    }
    if (bridgeProgram.texture1LodBias) {
      const texture1LodBias = canSampleTexture1
        ? d3dDwordToFloat(renderState.textureStages[1].mipMapLodBias)
        : 0.0;
      gl.uniform1f(bridgeProgram.texture1LodBias, texture1LodBias);
    }
    if (bridgeProgram.texture1Semantic) {
      gl.uniform1i(bridgeProgram.texture1Semantic, texture1SemanticMode);
    }
    if (bridgeProgram.textureFactor) {
      gl.uniform4fv(bridgeProgram.textureFactor,
        new Float32Array(d3dColorToNormalizedRgba(renderState.textureFactor)));
    }
    if (bridgeProgram.stage0ColorOp) {
      gl.uniform1i(bridgeProgram.stage0ColorOp, renderState.textureStages[0].colorOp);
    }
    if (bridgeProgram.stage0ColorArg0) {
      gl.uniform1i(bridgeProgram.stage0ColorArg0, renderState.textureStages[0].colorArg0);
    }
    if (bridgeProgram.stage0ColorArg1) {
      gl.uniform1i(bridgeProgram.stage0ColorArg1, renderState.textureStages[0].colorArg1);
    }
    if (bridgeProgram.stage0ColorArg2) {
      gl.uniform1i(bridgeProgram.stage0ColorArg2, renderState.textureStages[0].colorArg2);
    }
    if (bridgeProgram.stage0AlphaOp) {
      gl.uniform1i(bridgeProgram.stage0AlphaOp, renderState.textureStages[0].alphaOp);
    }
    if (bridgeProgram.stage0AlphaArg0) {
      gl.uniform1i(bridgeProgram.stage0AlphaArg0, renderState.textureStages[0].alphaArg0);
    }
    if (bridgeProgram.stage0AlphaArg1) {
      gl.uniform1i(bridgeProgram.stage0AlphaArg1, renderState.textureStages[0].alphaArg1);
    }
    if (bridgeProgram.stage0AlphaArg2) {
      gl.uniform1i(bridgeProgram.stage0AlphaArg2, renderState.textureStages[0].alphaArg2);
    }
    if (bridgeProgram.stage0ResultArg) {
      gl.uniform1i(bridgeProgram.stage0ResultArg, renderState.textureStages[0].resultArg);
    }
    if (bridgeProgram.stage1ColorOp) {
      gl.uniform1i(bridgeProgram.stage1ColorOp, renderState.textureStages[1].colorOp);
    }
    if (bridgeProgram.stage1ColorArg0) {
      gl.uniform1i(bridgeProgram.stage1ColorArg0, renderState.textureStages[1].colorArg0);
    }
    if (bridgeProgram.stage1ColorArg1) {
      gl.uniform1i(bridgeProgram.stage1ColorArg1, renderState.textureStages[1].colorArg1);
    }
    if (bridgeProgram.stage1ColorArg2) {
      gl.uniform1i(bridgeProgram.stage1ColorArg2, renderState.textureStages[1].colorArg2);
    }
    if (bridgeProgram.stage1AlphaOp) {
      gl.uniform1i(bridgeProgram.stage1AlphaOp, renderState.textureStages[1].alphaOp);
    }
    if (bridgeProgram.stage1AlphaArg0) {
      gl.uniform1i(bridgeProgram.stage1AlphaArg0, renderState.textureStages[1].alphaArg0);
    }
    if (bridgeProgram.stage1AlphaArg1) {
      gl.uniform1i(bridgeProgram.stage1AlphaArg1, renderState.textureStages[1].alphaArg1);
    }
    if (bridgeProgram.stage1AlphaArg2) {
      gl.uniform1i(bridgeProgram.stage1AlphaArg2, renderState.textureStages[1].alphaArg2);
    }
    if (canSampleTexture0) {
      const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture0Resource.texture);
      appliedTexture0Sampler = applyD3D8TextureSamplerToBoundTexture(
        0,
        renderState.textureStages[0],
        texture0Resource,
      );
      gl.activeTexture(previousActiveTexture);
    }
    if (canSampleTexture1) {
      const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texture1Resource.texture);
      appliedTexture1Sampler = applyD3D8TextureSamplerToBoundTexture(
        1,
        renderState.textureStages[1],
        texture1Resource,
      );
      gl.activeTexture(previousActiveTexture);
    }
    if (bridgeProgram.alphaTestEnabled) {
      gl.uniform1i(bridgeProgram.alphaTestEnabled, appliedRenderState.alphaTest.enabled ? 1 : 0);
    }
    if (bridgeProgram.alphaFunc) {
      gl.uniform1i(bridgeProgram.alphaFunc, renderState.alphaFunc);
    }
    if (bridgeProgram.alphaRef) {
      gl.uniform1f(bridgeProgram.alphaRef, appliedRenderState.alphaTest.ref);
    }
    if (bridgeProgram.fogEnabled) {
      gl.uniform1i(bridgeProgram.fogEnabled, appliedRenderState.fog.enabled ? 1 : 0);
    }
    if (bridgeProgram.fogRangeEnabled) {
      gl.uniform1i(bridgeProgram.fogRangeEnabled, appliedRenderState.fog.rangeEnabled ? 1 : 0);
    }
    if (bridgeProgram.fogColor) {
      gl.uniform3fv(bridgeProgram.fogColor, new Float32Array(appliedRenderState.fog.color));
    }
    if (bridgeProgram.fogStart) {
      gl.uniform1f(bridgeProgram.fogStart, appliedRenderState.fog.start);
    }
    if (bridgeProgram.fogEnd) {
      gl.uniform1f(bridgeProgram.fogEnd, appliedRenderState.fog.end);
    }
    const temporaryIndices = fillModeDraw.lineIndices ?? shadeModeDraw.triangleIndices ?? null;
    let temporaryIndexBuffer = null;
    let restoreProvokingVertex = false;
    try {
      if (shadeModeDraw.usesFirstVertexConvention) {
        restoreProvokingVertex = setD3D8FirstVertexConvention(true);
      }
      if (shadeModeDraw.supported &&
          (temporaryIndices instanceof Uint16Array || temporaryIndices instanceof Uint32Array)) {
        temporaryIndexBuffer = gl.createBuffer();
        if (temporaryIndexBuffer) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, temporaryIndexBuffer);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, temporaryIndices, gl.STREAM_DRAW);
        } else {
          shadeModeDraw.supported = false;
          shadeModeDraw.fallbackReason = "temporaryIndexBufferCreateFailed";
        }
      } else {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexResource.buffer);
      }
      appliedFillMode = d3d8FillModeProbeInfo(fillModeDraw);
      appliedShadeMode = d3d8ShadeModeProbeInfo(shadeModeDraw);
      if (fillModeDraw.supported && shadeModeDraw.supported) {
        gl.drawElements(
          shadeModeDraw.glPrimitive,
          shadeModeDraw.drawIndexCount,
          indexSize === 4 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
          shadeModeDraw.drawIndexByteOffset,
        );
      }
    } finally {
      if (restoreProvokingVertex) {
        setD3D8FirstVertexConvention(false);
      }
      if (temporaryIndexBuffer) {
        gl.deleteBuffer(temporaryIndexBuffer);
      }
    }
    refreshCanvasState();
    centerPixel = sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2));
    drawOk = fillModeDraw.supported && shadeModeDraw.supported && pixelHasColor(centerPixel);
  }

  const probe = {
    ok: drawOk,
    source: "browser_d3d8_draw_indexed",
    drawSequence,
    api: harnessState.graphics.api,
    viewport: appliedViewport,
    primitiveType: Number(payload.primitiveType ?? 0),
    vertexBufferId,
    vertexByteOffset,
    vertexBytes: vertexByteSize,
    vertexCount,
    vertexStride,
    vertexShaderFvf,
    vertexLayout,
    vertexDiagnostics,
    indexBufferId,
    indexByteOffset,
    indexBytes: indexByteSize,
    indexCount,
    indexSize,
    usedPersistentBuffers: usePersistentBuffers,
    transformMask,
    usedTransforms: Boolean(useTransforms),
    usedIdentityClipSpace: Boolean(usesIdentityClipSpace),
    renderState,
    clipPlanes,
    lights,
    material,
    appliedRenderState,
    appliedMaterial: material,
    fillMode: appliedFillMode,
    shadeMode: appliedShadeMode,
    boundTextures: Object.fromEntries(d3d8BoundTextures),
    texture0: {
      id: texture0Id,
      ready: texture0Ready,
      sampled: canSampleTexture0,
      levels: texture0Resource?.levels ?? 0,
      initializedLevels: texture0Resource
        ? Array.from(texture0Resource.initializedLevels).map((level) => Number(level)).sort((a, b) => a - b)
        : [],
      completeMipChain: textureHasCompleteMipChain(texture0Resource),
      texCoordIndex: texture0Coordinates.texCoordIndex,
      texCoordMode: texture0Coordinates.mode,
      texCoordModeName: texture0Coordinates.modeName,
      texCoordSet: texture0Coordinates.coordSet,
      texCoordOffset: canSampleTexture0 ? texture0Coordinates.offset : null,
      texCoordComponents: texture0Coordinates.components,
      texCoordGenerated: texture0Coordinates.generated,
      texCoordUsesVertex: texture0Coordinates.usesVertexTexCoord,
      textureTransformFlags: texture0Coordinates.textureTransformFlags,
      textureTransformModeName: texture0Coordinates.textureTransformModeName,
      textureTransformComponentCount: texture0Coordinates.textureTransformComponentCount,
      textureTransformProjected: texture0Coordinates.textureTransformProjected,
      textureTransformSupported: texture0Coordinates.transformSupported,
      textureTransformApplied: Boolean(canSampleTexture0 && texture0Coordinates.transformApplied),
      textureTransformMatrix: texture0Transform !== null ? Array.from(texture0Transform) : null,
      texCoordSupported: texture0Coordinates.supported,
      width: texture0Resource?.width ?? 0,
      height: texture0Resource?.height ?? 0,
      format: texture0Resource?.format ?? 0,
      storage: texture0Resource?.storage ?? null,
      semantic: texture0Resource?.semantic ?? null,
      semanticMode: texture0SemanticMode,
      uploads: texture0Resource?.uploads ?? 0,
      samplePixels: sampleD3D8TextureProbe(texture0Resource),
      sampleVertexPixels: sampleD3D8TextureAtVertexSamples(
        texture0Resource,
        vertexDiagnostics,
        texture0Coordinates.coordSet,
      ),
      sampler: appliedTexture0Sampler ?? texture0Resource?.samplerState ?? null,
      combiner: appliedTexture0Combiner,
    },
    texture1: {
      id: texture1Id,
      ready: texture1Ready,
      sampled: canSampleTexture1,
      levels: texture1Resource?.levels ?? 0,
      initializedLevels: texture1Resource
        ? Array.from(texture1Resource.initializedLevels).map((level) => Number(level)).sort((a, b) => a - b)
        : [],
      completeMipChain: textureHasCompleteMipChain(texture1Resource),
      texCoordIndex: texture1Coordinates.texCoordIndex,
      texCoordMode: texture1Coordinates.mode,
      texCoordModeName: texture1Coordinates.modeName,
      texCoordSet: texture1Coordinates.coordSet,
      texCoordOffset: canSampleTexture1 ? texture1Coordinates.offset : null,
      texCoordComponents: texture1Coordinates.components,
      texCoordGenerated: texture1Coordinates.generated,
      texCoordUsesVertex: texture1Coordinates.usesVertexTexCoord,
      textureTransformFlags: texture1Coordinates.textureTransformFlags,
      textureTransformModeName: texture1Coordinates.textureTransformModeName,
      textureTransformComponentCount: texture1Coordinates.textureTransformComponentCount,
      textureTransformProjected: texture1Coordinates.textureTransformProjected,
      textureTransformSupported: texture1Coordinates.transformSupported,
      textureTransformApplied: Boolean(canSampleTexture1 && texture1Coordinates.transformApplied),
      textureTransformMatrix: texture1Transform !== null ? Array.from(texture1Transform) : null,
      texCoordSupported: texture1Coordinates.supported,
      width: texture1Resource?.width ?? 0,
      height: texture1Resource?.height ?? 0,
      format: texture1Resource?.format ?? 0,
      storage: texture1Resource?.storage ?? null,
      semantic: texture1Resource?.semantic ?? null,
      semanticMode: texture1SemanticMode,
      uploads: texture1Resource?.uploads ?? 0,
      samplePixels: sampleD3D8TextureProbe(texture1Resource),
      sampleVertexPixels: sampleD3D8TextureAtVertexSamples(
        texture1Resource,
        vertexDiagnostics,
        texture1Coordinates.coordSet,
      ),
      sampler: appliedTexture1Sampler ?? texture1Resource?.samplerState ?? null,
      combiner: appliedStage1Combiner,
    },
    stage1Combiner: appliedStage1Combiner,
    textureFactor: renderState.textureFactor,
    preDrawCenterPixel,
    centerPixel,
  };
  const drawHistory = [
    ...(Array.isArray(harnessState.graphics.d3d8DrawHistory)
      ? harnessState.graphics.d3d8DrawHistory
      : []),
    {
      ok: probe.ok,
      drawSequence: probe.drawSequence,
      primitiveType: probe.primitiveType,
      vertexBufferId: probe.vertexBufferId,
      vertexCount: probe.vertexCount,
      vertexStride: probe.vertexStride,
      vertexShaderFvf: probe.vertexShaderFvf,
      indexBufferId: probe.indexBufferId,
      indexCount: probe.indexCount,
      renderState: {
        cullMode: renderState.cullMode,
        zEnable: renderState.zEnable,
        zWriteEnable: renderState.zWriteEnable,
        zFunc: renderState.zFunc,
        alphaBlendEnable: renderState.alphaBlendEnable,
        srcBlend: renderState.srcBlend,
        destBlend: renderState.destBlend,
        colorWriteEnable: renderState.colorWriteEnable,
        lighting: renderState.lighting,
        textureStage0: d3d8TextureStageDrawSummary(renderState.textureStages[0]),
        textureStage1: d3d8TextureStageDrawSummary(renderState.textureStages[1]),
      },
      appliedRenderState: {
        cull: appliedRenderState?.cull ?? null,
        depth: appliedRenderState?.depth ?? null,
        blend: appliedRenderState?.blend ?? null,
        colorWrite: appliedRenderState?.colorWrite ?? null,
      },
      boundTextures: probe.boundTextures,
      texture0: {
        id: probe.texture0.id,
        sampled: probe.texture0.sampled,
        texCoordIndex: probe.texture0.texCoordIndex,
        texCoordSet: probe.texture0.texCoordSet,
        textureTransformFlags: probe.texture0.textureTransformFlags,
        samplePixels: probe.texture0.samplePixels,
        sampleVertexPixels: probe.texture0.sampleVertexPixels,
        combiner: probe.texture0.combiner,
      },
      texture1: {
        id: probe.texture1.id,
        sampled: probe.texture1.sampled,
        texCoordIndex: probe.texture1.texCoordIndex,
        texCoordSet: probe.texture1.texCoordSet,
        textureTransformFlags: probe.texture1.textureTransformFlags,
        samplePixels: probe.texture1.samplePixels,
        sampleVertexPixels: probe.texture1.sampleVertexPixels,
        combiner: probe.texture1.combiner,
      },
      vertexSummary: d3d8DrawVertexSummary(vertexDiagnostics),
      preDrawCenterPixel,
      centerPixel,
    },
  ].slice(-64);
  harnessState.graphics = {
    ...harnessState.graphics,
    d3d8DrawIndexedSequence: drawSequence,
    d3d8DrawHistory: drawHistory,
    lastD3D8DrawIndexed: probe,
  };
  return drawOk ? 1 : 0;
}

function paintBlackWindow() {
  clearCanvas({ rgba: [0, 0, 0, 255] });
}

function syncStatus(label = harnessState.booted ? "booted" : "idle") {
  stateNode.textContent = label;
  framesNode.textContent = String(harnessState.frame);
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
  const css = cursorSet ? "default" : "none";
  canvas.style.cursor = css;
  harnessState.browserCursor = {
    source: "browser_win32_cursor_css",
    cursorSet,
    css,
    visible: cursorSet,
  };
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
  harnessState.audioRuntimeAssets = moduleState.audioRuntimeAssets ?? harnessState.audioRuntimeAssets;
  harnessState.startupAssets = moduleState.startupAssets ?? harnessState.startupAssets;
  harnessState.dataSummary = moduleState.dataSummary ?? harnessState.dataSummary;
  harnessState.originalEngineStartup = moduleState.originalEngineStartup ?? harnessState.originalEngineStartup;
}

// ---- Win32 GDI font/surface browser bridge ----------------------------------
// Backs the original WW3D FontCharsClass / Render2DSentenceClass text path.
// The C++ side (wasm_win32_gdi_browser.cpp) calls these synchronous hooks via
// EM_ASM; they rasterize glyphs through a Canvas 2D context and write BGR
// pixels back into the wasm DIB-section buffer.
let gdiCanvas = null;
let gdiCtx = null;

function gdiEnsureContext() {
  if (gdiCtx) {
    return gdiCtx;
  }
  gdiCanvas = document.createElement("canvas");
  gdiCtx = gdiCanvas.getContext("2d", { willReadFrequently: true });
  return gdiCtx;
}

function gdiFontCss(face, logicalHeight, weight, italic) {
  const px = Math.max(1, Math.abs((logicalHeight | 0) || 16));
  const wght = weight || 400;
  const ital = italic ? "italic " : "";
  const family = face && face.length ? JSON.stringify(String(face)) : "Arial";
  return `${ital}${wght} ${px}px ${family}`;
}

function gdiCssColor(rgb) {
  const v = rgb >>> 0;
  const r = v & 0xff;
  const g = (v >> 8) & 0xff;
  const b = (v >> 16) & 0xff;
  return `rgb(${r},${g},${b})`;
}

// Measure: synchronous canvas.measureText + fontBoundingBox metrics.  Returns
// {width,height,ascent,overhang} in device pixels.  overhang is left at 0
// because canvas TextMetrics exposes no direct equivalent; the original
// FontCharsClass zeroes overhang for the Generals/Arial path regardless.
function cncGdiMeasure(face, logicalHeight, weight, italic, str) {
  const ctx = gdiEnsureContext();
  if (!ctx || typeof str !== "string" || str.length === 0) {
    return null;
  }
  ctx.font = gdiFontCss(face, logicalHeight, weight, italic);
  const m = ctx.measureText(str);
  const px = Math.max(1, Math.abs((logicalHeight | 0) || 16));
  const ascent = Math.ceil(m.fontBoundingBoxAscent || (px * 0.8));
  const descent = Math.ceil(m.fontBoundingBoxDescent || (px * 0.2));
  const width = Math.ceil(m.width);
  return { width, height: ascent + descent, ascent, overhang: 0 };
}

// Rasterize one UTF-16 code unit at (x,y) honoring ETO_OPAQUE.  Writes 24bpp
// BGR, DWORD-padded stride, top-down into the wasm heap at bitsPtr.
function cncGdiRasterizeGlyph(
  face,
  logicalHeight,
  weight,
  italic,
  code,
  x,
  y,
  bitsPtr,
  bmpW,
  bmpH,
  stride,
  textColorRgb,
  bkColorRgb,
  opaque,
  heapu8,
) {
  const ctx = gdiEnsureContext();
  if (!ctx || bmpW <= 0 || bmpH <= 0 || stride < bmpW * 3) {
    return false;
  }
  if (!(heapu8 instanceof Uint8Array)) {
    return false;
  }
  if (gdiCanvas.width !== bmpW) {
    gdiCanvas.width = bmpW;
  }
  if (gdiCanvas.height !== bmpH) {
    gdiCanvas.height = bmpH;
  }
  ctx.font = gdiFontCss(face, logicalHeight, weight, italic);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  if (opaque) {
    ctx.fillStyle = gdiCssColor(bkColorRgb);
    ctx.fillRect(0, 0, bmpW, bmpH);
  }
  ctx.fillStyle = gdiCssColor(textColorRgb);
  ctx.fillText(String.fromCharCode(code), x, y);
  const img = ctx.getImageData(0, 0, bmpW, bmpH).data;
  for (let row = 0; row < bmpH; row++) {
    let dst = (bitsPtr | 0) + row * stride;
    const srcRow = row * bmpW * 4;
    for (let col = 0; col < bmpW; col++) {
      const s = srcRow + col * 4;
      heapu8[dst++] = img[s + 2]; // B
      heapu8[dst++] = img[s + 1]; // G
      heapu8[dst++] = img[s + 0]; // R
    }
  }
  return true;
}

async function loadWasmModule() {
  try {
    const moduleExports = await import("../dist/cnc-port.js");
    const createModule = moduleExports.default ?? moduleExports.createCncPortModule;
    const module = await createModule({
      locateFile: (path) => path.endsWith(".wasm") ? `../dist/${path}` : path,
      print: (text) => recordLog("wasm stdout", { text: String(text) }),
      printErr: (text) => recordLog("wasm stderr", { text: String(text) }),
      cncPortD3D8Clear: paintD3D8Clear,
      cncPortD3D8SetViewport: setD3D8Viewport,
      cncPortD3D8BufferCreate: createD3D8Buffer,
      cncPortD3D8BufferUpdate: updateD3D8Buffer,
      cncPortD3D8BufferRelease: releaseD3D8Buffer,
      cncPortD3D8TextureCreate: createD3D8Texture,
      cncPortD3D8TextureUpdate: updateD3D8Texture,
      cncPortD3D8VolumeTextureCreate: createD3D8VolumeTexture,
      cncPortD3D8VolumeTextureUpdate: updateD3D8VolumeTexture,
      cncPortD3D8TextureRelease: releaseD3D8Texture,
      cncPortD3D8TextureBind: bindD3D8Texture,
      cncPortD3D8DrawIndexed: paintD3D8DrawIndexed,
      cncPortMssSampleStart,
      cncPortMssSampleStop,
      cncPortMssSampleEnd,
      cncPortMssSampleRelease,
      cncPortBrowserUdpSend,
      cncPortBrowserUdpRecv,
      cncGdiMeasure,
      cncGdiRasterizeGlyph,
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
        ["string", "string", "number", "number", "string"],
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
      probeMssStartup: module.cwrap("cnc_port_probe_mss_startup", "string", []),
      probeMssSampleLifecycle: module.cwrap("cnc_port_probe_mss_sample_lifecycle", "string", []),
      probeMssSamplePlaybackStart: module.cwrap("cnc_port_probe_mss_sample_playback_start", "string", []),
      probeMssSamplePlaybackFinish: module.cwrap("cnc_port_probe_mss_sample_playback_finish", "string", []),
      probeMssStreamLifecycle: module.cwrap("cnc_port_probe_mss_stream_lifecycle", "string", []),
      probeMss3DSampleLifecycle: module.cwrap("cnc_port_probe_mss_3d_sample_lifecycle", "string", []),
      probeD3D8Clear: module.cwrap("cnc_port_probe_d3d8_clear", "string", ["number"]),
      probeD3D8Viewport: module.cwrap("cnc_port_probe_d3d8_viewport", "string", []),
      probeD3D8BufferDirty: module.cwrap("cnc_port_probe_d3d8_buffer_dirty", "string", []),
      probeD3D8BufferHints: module.cwrap("cnc_port_probe_d3d8_buffer_hints", "string", []),
      probeD3D8TextureUpload: module.cwrap("cnc_port_probe_d3d8_texture_upload", "string", []),
      probeD3D8VolumeTextureUpload: module.cwrap("cnc_port_probe_d3d8_volume_texture_upload", "string", []),
      probeD3D8TextureBind: module.cwrap("cnc_port_probe_d3d8_texture_bind", "string", []),
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
      probeWW3DTexturedMesh: module.cwrap(
        "cnc_port_probe_ww3d_textured_mesh", "string", []),
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
    };
  } catch (error) {
    console.info("[wasm-harness] wasm module unavailable; using JS boot stub", error);
    return null;
  }
}

function d3d8BridgeCallbacks() {
  return {
    cncPortD3D8Clear: paintD3D8Clear,
    cncPortD3D8SetViewport: setD3D8Viewport,
    cncPortD3D8BufferCreate: createD3D8Buffer,
    cncPortD3D8BufferUpdate: updateD3D8Buffer,
    cncPortD3D8BufferRelease: releaseD3D8Buffer,
    cncPortD3D8TextureCreate: createD3D8Texture,
    cncPortD3D8TextureUpdate: updateD3D8Texture,
    cncPortD3D8VolumeTextureCreate: createD3D8VolumeTexture,
    cncPortD3D8VolumeTextureUpdate: updateD3D8VolumeTexture,
    cncPortD3D8TextureRelease: releaseD3D8Texture,
    cncPortD3D8TextureBind: bindD3D8Texture,
    cncPortD3D8DrawIndexed: paintD3D8DrawIndexed,
  };
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
    centerPixel: sampleCanvasPixel(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2)),
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
    audioRuntimeAssets: harnessState.audioRuntimeAssets,
    browserAudioRuntime: summarizeBrowserAudioRuntime(),
    browserAudioMixerRuntime: summarizeBrowserAudioMixerRuntime(),
    browserMssSamplePlaybackRuntime: summarizeBrowserMssSamplePlaybackRuntime(),
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

const optionalBaseAudioStartupPaths = new Set([
  "data\\ini\\audiosettings.ini",
  "data\\ini\\default\\music.ini",
  "data\\ini\\default\\soundeffects.ini",
  "data\\ini\\default\\speech.ini",
  "data\\ini\\default\\voice.ini",
]);

function isAudioPayloadRelevantArchive(archive) {
  const names = [archive.name, archive.sourceName].filter(Boolean);
  return names.some((name) =>
    name === "INIZH.big" || name === "INI.big" || audioPayloadArchiveNames.includes(name));
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

function readMountedBigText(archiveBytes, entry) {
  const bytes = archiveBytes.subarray(entry.offset, entry.offset + entry.size);
  return new TextDecoder("windows-1252").decode(bytes);
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

function classifyAudioPayloadFormat(archiveBytes, entry) {
  const header = archiveBytes.subarray(entry.offset, Math.min(entry.offset + 64, archiveBytes.byteLength));
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

function setAudioParamValue(target, key, value) {
  const param = target?.[key];
  if (param && typeof param.setValueAtTime === "function") {
    param.setValueAtTime(value, 0);
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

function buildAudioDecodeAndBufferProofs(entryIndex, archiveBytesByName) {
  const errors = [];
  const proofs = [];
  const decodedPayloads = [];
  for (const target of audioDecodeProofTargets) {
    const entry = entryIndex.get(normalizeBigPath(target.path));
    if (!entry) {
      errors.push(`decode proof payload not found: ${target.path}`);
      continue;
    }
    const archiveBytes = archiveBytesByName.get(entry.archive);
    if (!archiveBytes) {
      errors.push(`decode proof archive bytes not found: ${entry.archive}`);
      continue;
    }
    try {
      const payloadBytes = archiveBytes.subarray(entry.offset, entry.offset + entry.size);
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

async function buildRequestedAudioDecodeCacheProof(requestedPayloadCachePlan, entryIndex, archiveBytesByName) {
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
    const archiveBytes = archiveBytesByName.get(target.archive);
    if (!archiveBytes) {
      errors.push(`requested decode-cache archive bytes not found: ${target.archive}`);
      continue;
    }

    try {
      const payloadBytes = archiveBytes.subarray(entry.offset, entry.offset + entry.size);
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
  const mountedArchives = [];
  const entryIndex = new Map();
  const iniFiles = {};
  const iniTexts = {};
  const payloadFormats = newAudioFormatSummary("mounted BIG Data\\Audio entry headers");
  payloadFormats.archives = {};
  const archiveBytesByName = new Map();

  for (const archive of archives.filter(isAudioPayloadRelevantArchive)) {
    let archiveBytes;
    try {
      archiveBytes = wasmModule.fs.readFile(archive.path);
    } catch (error) {
      return {
        ok: false,
        source: "browser mounted BIG directory + shipped audio INI parser",
        error: error?.message ?? String(error),
      };
    }
    archiveBytesByName.set(archive.name, archiveBytes);
    if (archive.sourceName) {
      archiveBytesByName.set(archive.sourceName, archiveBytes);
    }

    let entries;
    try {
      entries = readBigDirectoryFromBytes(archiveBytes, archive.name);
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
        entry.format = classifyAudioPayloadFormat(archiveBytes, entry);
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
        iniTexts[iniPath] = readMountedBigText(archiveBytes, entry);
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
  const audioProofs = buildAudioDecodeAndBufferProofs(entryIndex, archiveBytesByName);
  const decodeProofs = audioProofs.decodeProofs;
  const webAudioBufferProofs = audioProofs.webAudioBufferProofs;
  const requestedPayloadCachePlan = buildAudioRequestedPayloadCachePlan(refsBySection);
  const requestedPayloadDecodeCacheProof = await buildRequestedAudioDecodeCacheProof(
    requestedPayloadCachePlan,
    entryIndex,
    archiveBytesByName,
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
    sourceName: String(payload.sourceName ?? archive.name),
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

function writeBigUInt32BE(bytes, offset, value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`BIG archive integer out of range: ${value}`);
  }

  bytes[offset] = Math.floor(value / 0x1000000) & 0xff;
  bytes[offset + 1] = Math.floor(value / 0x10000) & 0xff;
  bytes[offset + 2] = Math.floor(value / 0x100) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function appendBytes(left, right) {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

async function fetchByteRange(url, start, end) {
  const response = await fetch(url, {
    headers: {
      Range: `bytes=${start}-${end}`,
    },
  });
  if (response.status !== 206) {
    throw new Error(`Range fetch failed for ${url} ${start}-${end}: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const expectedLength = end - start + 1;
  if (bytes.byteLength !== expectedLength) {
    throw new Error(`Range fetch length mismatch for ${url} ${start}-${end}: ${bytes.byteLength} != ${expectedLength}`);
  }

  return bytes;
}

async function extractBigEntryFromUrl(url, entryName) {
  const wanted = String(entryName ?? "").replaceAll("/", "\\").toLowerCase();
  if (!wanted) {
    throw new Error("Missing BIG archive entry name");
  }

  const header = await fetchByteRange(url, 0, 15);
  const magic = String.fromCharCode(...header.subarray(0, 4));
  if (magic !== "BIGF") {
    throw new Error(`${url} is not a BIGF archive`);
  }

  const count = readBigUInt32BE(header, 8);
  if (count === 0 || count > 1000000) {
    throw new Error(`${url} has an invalid BIGF entry count: ${count}`);
  }

  const decoder = new TextDecoder("ascii");
  const directoryStart = 0x10;
  const chunkSize = 64 * 1024;
  let directoryBytes = new Uint8Array(0);
  let cursor = 0;

  const ensureDirectoryBytes = async (requiredLength) => {
    while (directoryBytes.byteLength < requiredLength) {
      const start = directoryStart + directoryBytes.byteLength;
      const next = await fetchByteRange(url, start, start + chunkSize - 1);
      if (next.byteLength === 0) {
        throw new Error(`${url} ended before BIGF directory entry ${entryName}`);
      }
      directoryBytes = appendBytes(directoryBytes, next);
    }
  };

  for (let index = 0; index < count; ++index) {
    await ensureDirectoryBytes(cursor + 9);
    const offset = readBigUInt32BE(directoryBytes, cursor);
    const size = readBigUInt32BE(directoryBytes, cursor + 4);
    const pathStart = cursor + 8;
    let pathEnd = -1;
    while (pathEnd < 0) {
      for (let scan = pathStart; scan < directoryBytes.byteLength; ++scan) {
        if (directoryBytes[scan] === 0) {
          pathEnd = scan;
          break;
        }
      }
      if (pathEnd < 0) {
        await ensureDirectoryBytes(directoryBytes.byteLength + 1);
      }
    }

    const path = decoder.decode(directoryBytes.subarray(pathStart, pathEnd));
    cursor = pathEnd + 1;
    if (path.replaceAll("/", "\\").toLowerCase() === wanted) {
      const bytes = await fetchByteRange(url, offset, offset + size - 1);
      return {
        path,
        offset,
        size,
        bytes,
        directoryBytes: directoryBytes.byteLength,
        indexedEntries: index + 1,
      };
    }
  }

  throw new Error(`${entryName} was not found in ${url}`);
}

async function indexBigArchiveUrl(url) {
  const header = await fetchByteRange(url, 0, 15);
  const magic = String.fromCharCode(...header.subarray(0, 4));
  if (magic !== "BIGF") {
    throw new Error(`${url} is not a BIGF archive`);
  }

  const count = readBigUInt32BE(header, 8);
  if (count === 0 || count > 1000000) {
    throw new Error(`${url} has an invalid BIGF entry count: ${count}`);
  }

  const decoder = new TextDecoder("ascii");
  const directoryStart = 0x10;
  const chunkSize = 64 * 1024;
  let directoryBytes = new Uint8Array(0);
  let cursor = 0;
  const entries = new Map();

  const ensureDirectoryBytes = async (requiredLength) => {
    while (directoryBytes.byteLength < requiredLength) {
      const start = directoryStart + directoryBytes.byteLength;
      const next = await fetchByteRange(url, start, start + chunkSize - 1);
      if (next.byteLength === 0) {
        throw new Error(`${url} ended before BIGF directory entry ${entries.size + 1}`);
      }
      directoryBytes = appendBytes(directoryBytes, next);
    }
  };

  for (let index = 0; index < count; ++index) {
    await ensureDirectoryBytes(cursor + 9);
    const offset = readBigUInt32BE(directoryBytes, cursor);
    const size = readBigUInt32BE(directoryBytes, cursor + 4);
    const pathStart = cursor + 8;
    let pathEnd = -1;
    while (pathEnd < 0) {
      for (let scan = pathStart; scan < directoryBytes.byteLength; ++scan) {
        if (directoryBytes[scan] === 0) {
          pathEnd = scan;
          break;
        }
      }
      if (pathEnd < 0) {
        await ensureDirectoryBytes(directoryBytes.byteLength + 1);
      }
    }

    const path = decoder.decode(directoryBytes.subarray(pathStart, pathEnd));
    cursor = pathEnd + 1;
    entries.set(path.replaceAll("/", "\\").toLowerCase(), {
      path,
      offset,
      size,
      indexedEntries: index + 1,
    });
  }

  return {
    entries,
    directoryBytes: directoryBytes.byteLength,
    indexedEntries: count,
  };
}

async function extractBigEntriesFromUrl(url, entryNames) {
  const requestedEntries = entryNames.map((entryName, index) => {
    const wanted = String(entryName ?? "").replaceAll("/", "\\").toLowerCase();
    if (!wanted) {
      throw new Error("Missing BIG archive entry name");
    }
    return { wanted, entryName, index };
  });

  const archiveIndex = await indexBigArchiveUrl(url);
  const matchedEntries = requestedEntries.map((request) => {
    const entry = archiveIndex.entries.get(request.wanted);
    if (!entry) {
      throw new Error(`${request.entryName} was not found in ${url}`);
    }
    return {
      ...entry,
      requestIndex: request.index,
    };
  });

  const coalesceGapBytes = 64 * 1024;
  const groups = [];
  for (const entry of [...matchedEntries].sort((left, right) => left.offset - right.offset)) {
    const endExclusive = entry.offset + entry.size;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && entry.offset <= lastGroup.endExclusive + coalesceGapBytes) {
      lastGroup.endExclusive = Math.max(lastGroup.endExclusive, endExclusive);
      lastGroup.entries.push(entry);
    } else {
      groups.push({
        start: entry.offset,
        endExclusive,
        entries: [entry],
      });
    }
  }

  const extractedEntries = new Array(matchedEntries.length);
  for (const group of groups) {
    const groupBytes = await fetchByteRange(url, group.start, group.endExclusive - 1);
    for (const entry of group.entries) {
      const start = entry.offset - group.start;
      const bytes = groupBytes.subarray(start, start + entry.size);
      extractedEntries[entry.requestIndex] = {
        path: entry.path,
        offset: entry.offset,
        size: entry.size,
        bytes,
        directoryBytes: archiveIndex.directoryBytes,
        indexedEntries: archiveIndex.indexedEntries,
      };
    }
  }

  return extractedEntries;
}

function buildBigArchive(entries) {
  const encoder = new TextEncoder();
  const normalizedEntries = entries.map((entry) => {
    const path = String(entry.path ?? "").replaceAll("/", "\\");
    if (!path || path.includes("\0")) {
      throw new Error(`Invalid BIG archive entry path: ${path}`);
    }

    const pathBytes = encoder.encode(path);
    const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes ?? []);
    return {
      ...entry,
      path,
      pathBytes,
      bytes,
    };
  });

  const directoryBytes = normalizedEntries.reduce(
    (sum, entry) => sum + 8 + entry.pathBytes.byteLength + 1,
    0,
  );
  const dataStart = 0x10 + directoryBytes;
  const totalBytes = dataStart + normalizedEntries.reduce(
    (sum, entry) => sum + entry.bytes.byteLength,
    0,
  );
  if (totalBytes > 0xffffffff) {
    throw new Error(`Synthesized BIG archive is too large: ${totalBytes}`);
  }

  const archiveBytes = new Uint8Array(totalBytes);
  archiveBytes.set([0x42, 0x49, 0x47, 0x46], 0); // BIGF
  writeBigUInt32BE(archiveBytes, 4, totalBytes);
  writeBigUInt32BE(archiveBytes, 8, normalizedEntries.length);
  writeBigUInt32BE(archiveBytes, 12, 0);

  let directoryCursor = 0x10;
  let dataCursor = dataStart;
  const manifest = [];
  for (const entry of normalizedEntries) {
    writeBigUInt32BE(archiveBytes, directoryCursor, dataCursor);
    writeBigUInt32BE(archiveBytes, directoryCursor + 4, entry.bytes.byteLength);
    archiveBytes.set(entry.pathBytes, directoryCursor + 8);
    archiveBytes[directoryCursor + 8 + entry.pathBytes.byteLength] = 0;
    archiveBytes.set(entry.bytes, dataCursor);
    manifest.push({
      path: entry.path,
      bytes: entry.bytes.byteLength,
      offset: dataCursor,
      sourceOffset: entry.offset,
      sourceArchive: entry.sourceArchive,
      sourceIndexedEntries: entry.indexedEntries,
      sourceDirectoryBytes: entry.directoryBytes,
      reader: "browser fetch Range",
    });
    directoryCursor += 8 + entry.pathBytes.byteLength + 1;
    dataCursor += entry.bytes.byteLength;
  }

  return {
    bytes: archiveBytes,
    entries: manifest,
    directoryBytes,
    dataStart,
  };
}

async function mountRangeBackedArchiveSet(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountRangeBackedArchiveSet");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  const archiveInputs = Array.isArray(payload.archives) ? payload.archives : [];
  if (archiveInputs.length === 0) {
    return { ok: false, command: "mountRangeBackedArchiveSet", error: "Missing archive list" };
  }

  const baseDirectory = normalizeAssetDirectory(String(payload.path ?? "/assets/runtime"));
  if (!baseDirectory) {
    return {
      ok: false,
      command: "mountRangeBackedArchiveSet",
      error: `Archive directory must stay under /assets/: ${payload.path}`,
    };
  }

  const archives = [];
  const archiveProbes = [];
  const shouldRegister = payload.register !== false;
  for (const input of archiveInputs) {
    const archive = archivePathFromPayload(input, baseDirectory);
    if (archive.error) {
      return { ok: false, command: "mountRangeBackedArchiveSet", error: archive.error, archives };
    }

    const entryNames = Array.isArray(input.entries) ? input.entries : [];
    if (entryNames.length === 0) {
      return {
        ok: false,
        command: "mountRangeBackedArchiveSet",
        error: `Missing range-backed entries for ${archive.name}`,
        archives,
      };
    }

    const entries = [];
    try {
      const extractedEntries = await extractBigEntriesFromUrl(archive.url, entryNames);
      entries.push(...extractedEntries.map((entry) => ({
        ...entry,
        sourceArchive: String(input.sourceArchive ?? archive.url),
      })));
    } catch (error) {
      return {
        ok: false,
        command: "mountRangeBackedArchiveSet",
        error: error?.message ?? String(error),
        archives,
      };
    }

    let generated;
    try {
      generated = buildBigArchive(entries);
      ensureMemfsDirectory(moduleResult.wasmModule.fs, parentDirectory(archive.memfsPath));
      moduleResult.wasmModule.fs.writeFile(archive.memfsPath, generated.bytes);
    } catch (error) {
      return {
        ok: false,
        command: "mountRangeBackedArchiveSet",
        error: error?.message ?? String(error),
        archives,
      };
    }

    const assetProbe = !shouldRegister || payload.verifyEach === false
      ? null
      : probeArchive(moduleResult.wasmModule, archive.memfsPath);
    const mountedArchive = {
      name: archive.name,
      sourceName: String(input.sourceName ?? input.sourceArchive ?? archive.name),
      path: archive.memfsPath,
      bytes: generated.bytes.byteLength,
      sourceBytes: Number(input.expectedSourceBytes ?? input.sourceBytes ?? 0),
      directoryBytes: generated.directoryBytes,
      dataStart: generated.dataStart,
      entries: generated.entries,
      entryCount: generated.entries.length,
      reader: "browser fetch Range -> synthesized BIG",
      storage: "range-backed-subset-big",
    };
    archives.push(mountedArchive);
    if (assetProbe) {
      archiveProbes.push({
        name: archive.name,
        path: archive.memfsPath,
        ok: Boolean(assetProbe.ok),
        indexedFiles: assetProbe.indexedFiles,
        sampleBytes: assetProbe.sampleBytes,
      });
    }
  }

  const probePath = `${baseDirectory}/*.big`;
  const aggregateProbe = shouldRegister
    ? probeArchive(moduleResult.wasmModule, probePath)
    : { ok: true };
  rememberMountedArchives(archives);

  const allArchiveProbesOk = archiveProbes.every((archive) => archive.ok);
  const ok = Boolean(aggregateProbe?.ok) && allArchiveProbesOk;
  const totalBytes = archives.reduce((sum, archive) => sum + archive.bytes, 0);
  const sourceTotalBytes = archives.reduce((sum, archive) => sum + archive.sourceBytes, 0);
  const archiveSet = {
    path: baseDirectory,
    probePath,
    archiveCount: archives.length,
    totalBytes,
    sourceTotalBytes,
    archives,
    probes: archiveProbes,
    reader: shouldRegister
      ? "browser fetch Range -> synthesized BIG -> Win32BIGFileSystem"
      : "browser fetch Range -> synthesized BIG",
    storage: "range-backed-subset-big",
    registered: shouldRegister && ok,
  };
  if (ok && shouldRegister) {
    registerArchiveSet(moduleResult.wasmModule, archiveSet);
  }

  recordLog("range-backed archive set mounted", {
    path: baseDirectory,
    archiveCount: archives.length,
    totalBytes,
    sourceTotalBytes,
    ok,
  });

  return {
    ok,
    command: "mountRangeBackedArchiveSet",
    state: snapshotState(),
    archiveSet,
  };
}

async function mountBigArchiveEntry(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountBigArchiveEntry");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  try {
    const url = String(payload.url ?? "");
    const mountPath = String(payload.path ?? "").replaceAll("\\", "/");
    if (!url) {
      throw new Error("Missing archive URL");
    }
    if (!mountPath.startsWith("/") ||
        mountPath.split("/").some((part) => part === "." || part === "..")) {
      throw new Error(`Invalid MEMFS mount path: ${mountPath}`);
    }

    const entry = await extractBigEntryFromUrl(url, payload.entry);
    ensureFixedMemfsDirectory(moduleResult.wasmModule.fs, parentDirectory(mountPath));
    moduleResult.wasmModule.fs.writeFile(mountPath, entry.bytes);
    recordLog("BIG archive entry mounted", {
      path: mountPath,
      bytes: entry.size,
      offset: entry.offset,
      archiveEntry: entry.path,
      sourceArchive: String(payload.sourceArchive ?? url),
    });

    return {
      ok: true,
      command: "mountBigArchiveEntry",
      asset: {
        path: mountPath,
        sourceArchive: String(payload.sourceArchive ?? url),
        archiveUrl: url,
        archiveEntry: entry.path,
        offset: entry.offset,
        bytes: entry.size,
        directoryBytes: entry.directoryBytes,
        indexedEntries: entry.indexedEntries,
        reader: "browser fetch Range",
      },
      state: snapshotState(),
    };
  } catch (error) {
    return {
      ok: false,
      command: "mountBigArchiveEntry",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function mountShippedMeshAsset(payload = {}) {
  const moduleResult = await getWasmModuleForArchives("mountShippedMeshAsset");
  if (moduleResult.error) {
    return { ok: false, command: moduleResult.command, error: moduleResult.error };
  }

  const requestedPath = String(payload.path ?? "").replaceAll("\\", "/");
  const mountPaths = new Map([
    ["Art/W3D/CINE_Moon.W3D", "/Art/W3D/CINE_Moon.W3D"],
    ["Art/Textures/cine_moon.dds", "/art/textures/cine_moon.dds"],
  ]);
  const path = mountPaths.get(requestedPath);
  if (!path) {
    return {
      ok: false,
      command: "mountShippedMeshAsset",
      error: `Unsupported shipped mesh asset path: ${requestedPath}`,
    };
  }

  const rawBytes = payload.bytes;
  const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes ?? []);
  if (bytes.byteLength === 0) {
    return { ok: false, command: "mountShippedMeshAsset", error: "Missing asset bytes" };
  }

  ensureFixedMemfsDirectory(moduleResult.wasmModule.fs, parentDirectory(path));
  moduleResult.wasmModule.fs.writeFile(path, bytes);
  recordLog("shipped mesh asset mounted", {
    path,
    bytes: bytes.byteLength,
    sourceArchive: String(payload.sourceArchive ?? ""),
  });

  return {
    ok: true,
    command: "mountShippedMeshAsset",
    asset: {
      path,
      sourceArchive: String(payload.sourceArchive ?? ""),
      archiveEntry: requestedPath,
      bytes: bytes.byteLength,
    },
    state: snapshotState(),
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
    case "mountRangeBackedArchiveSet":
      return mountRangeBackedArchiveSet(payload);
    case "mountBigArchiveEntry":
      return mountBigArchiveEntry(payload);
    case "mountShippedMeshAsset":
      return mountShippedMeshAsset(payload);
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
        for (let caseId = 0; caseId < 36; ++caseId) {
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
        const caseOk = Boolean(probe.ok)
          && gl?.getContextAttributes()?.depth === true
          && browserProbe?.source === "browser_d3d8_draw_indexed"
          && browserProbe?.usedPersistentBuffers === true
          && probe.calls?.drawIndexed === 2
          && browserProbe?.primitiveType === D3DPT_TRIANGLELIST
          && browserProbe?.indexCount === 6
          && renderState.zBias === probe.zBias?.biased
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
        const browserProbe = harnessState.graphics.lastD3D8DrawIndexed ?? null;
        const ok = Boolean(probe.ok)
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
        const singlePlayerMode = command === "ww3dMainMenuLayoutSinglePlayerRepaint";
        const loadReplayMode = command === "ww3dMainMenuLayoutLoadReplayRepaint";
        const difficultyMode = command === "ww3dMainMenuLayoutDifficultyRepaint";
        const factionLogoMode = command === "ww3dMainMenuLayoutFactionLogoRepaint";
        const probeMode = staticTextMode
          ? "staticTextSelectDifficulty"
          : (singlePlayerMode
              ? "singlePlayerDropdown"
              : (difficultyMode
                  ? "difficultyDropdown"
                  : (factionLogoMode
                      ? "factionLogoStrip"
                      : (loadReplayMode ? "loadReplayDropdown" : "buttonSinglePlayer"))));
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
          : (singlePlayerMode
              ? wasmModule.probeWW3DMainMenuLayoutSinglePlayerRepaint()
              : (loadReplayMode
                  ? wasmModule.probeWW3DMainMenuLayoutLoadReplayRepaint()
                  : (difficultyMode
                      ? wasmModule.probeWW3DMainMenuLayoutDifficultyRepaint()
                      : (factionLogoMode
                          ? wasmModule.probeWW3DMainMenuLayoutFactionLogoRepaint()
                          : wasmModule.probeWW3DMainMenuLayoutImageRepaint())))));
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
                        && buttonTextRegion.maxComponent >= 180
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
          && probe?.layout?.button?.images?.[0] === "Buttons-Left"
          && probe?.layout?.button?.images?.[1] === "Buttons-Middle"
          && probe?.layout?.button?.images?.[2] === "Buttons-Right"
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
    case "ww3dTerrainVisualLoadWindowScene":
    case "ww3dTerrainVisualCameraPanScene":
      {
        const wasmModule = await wasmModulePromise;
        if (!wasmModule) {
          return { ok: false, command, error: "Wasm module unavailable; visual-owned WW3D terrain scene cannot render" };
        }
        const fullInitMode = command === "ww3dTerrainFullScene";
        const visualShroudUpdateMode = command === "ww3dTerrainVisualShroudUpdateScene";
        const visualShroudMode = command === "ww3dTerrainVisualShroudScene" || visualShroudUpdateMode;
        const loadWindowMode = command === "ww3dTerrainVisualLoadWindowScene";
        const cameraPanMode = command === "ww3dTerrainVisualCameraPanScene";
        const expectedSource = fullInitMode
          ? "ww3d_terrain_full_scene_probe"
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
          ? "full-init-source-patch"
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
          (fullInitMode
            ? wasmModule.probeWW3DTerrainFullScene
            : (loadWindowMode
            ? wasmModule.probeWW3DTerrainVisualLoadWindowScene
            : (cameraPanMode
                ? wasmModule.probeWW3DTerrainVisualCameraPanScene
                : (visualShroudMode
                  ? (visualShroudUpdateMode
                    ? wasmModule.probeWW3DTerrainVisualShroudUpdateScene
                    : wasmModule.probeWW3DTerrainVisualShroudScene)
                  : wasmModule.probeWW3DTerrainVisualScene))))(
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
        const renderModeMatches = fullInitMode
          ? ["full-init-source-patch", "full-init-missing-water-assets-frontier"].includes(probe?.renderMode)
          : probe?.renderMode === expectedRenderMode;
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
              && (probe?.terrain?.tileDiagnostics?.patchCellsWithSource ?? 0)
                + (probe?.terrain?.tileDiagnostics?.patchCellsMissingSource ?? 0) === 16384))
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
  void resumeBrowserAudioRuntime("canvas.pointerdown");
  canvas.focus();
  const point = canvasInputPointFromEvent(event);
  const message = mouseButtonMessage(event, true, point);
  claimBrowserPointerCapture(event);
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
  releaseBrowserPointerCapture(event);
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
window.addEventListener("keydown", (event) => {
  void resumeBrowserAudioRuntime("window.keydown");
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
  d3d8BridgeCallbacks,
};
