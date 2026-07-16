// engine_realm_boot.mjs — P1c engine-realm boot module (design:
// WebAssembly/notes/p1-engine-thread.md, lane P1c).
//
// Imported dynamically INTO THE PTHREAD WORKER REALM by the realm stub
// (src/threads_realm_stub.pre.js `setup` command) BEFORE the engine pthread
// is spawned. It owns everything that must live in the engine realm:
//
//   - the realm-agnostic D3D8->WebGL2 executor (harness/d3d8_executor.mjs)
//     constructed against the transferred OffscreenCanvas; its 20
//     Module.cncPortD3D8* hooks are spread onto the WORKER-realm Module
//     (EM_JS bodies resolve Module in the calling thread's realm),
//   - the GDI text rasterizer hooks (harness/gdi_executor.mjs, OffscreenCanvas
//     2D in this realm — the engine consumes their return values
//     synchronously so they cannot be forwarded),
//   - engine-realm AUDIO FORWARDERS for the 13 Module.cncPortMss* hooks:
//     payloads post to the main realm where the existing Web Audio bodies in
//     bridge.js execute them; sample-start payloads carry a worker-side COPY
//     of the RIFF bytes (the C++ Miles shim mallocs a fresh PCM buffer per
//     start and may free it before main handles the async message, so the
//     shared-heap pointer cannot be read main-side later),
//   - UDP hook stubs matching bridge.js's disabled-endpoint behavior
//     (send -> 0, recv -> null),
//   - the ENGINE-THREAD TICK CONTROLLER (Module.cncPortEngineThreadTick,
//     called by src/wasm_engine_thread_boot.cpp's rAF main loop ON the
//     pthread): stepped real GameEngine::init, then the paced client/logic
//     frame loop ported from play.mjs runPacedFrameLoop (client ~display
//     rate, logic gated to an absolute drift-free 30Hz schedule, catchup<=2),
//   - the async engine-call primitive ({cmd:"engineCall", name, returnType,
//     argTypes, args} -> Module.cwrap(...)(...) executed in this realm on the
//     engine thread) that bridge.js's threaded RPC routing builds on, and the
//     ordered input-forwarding sink (lite input exports applied between
//     frames).
//
// HARD RULE (see notes/p1-engine-thread.md): NO wasm export may be called in
// this realm before the engine pthread runs on this worker (an idle pool
// worker has wasm instantiated but no thread stack/TLS established — calls
// would scribble over the main thread's stack). Everything wasm-touching is
// queued until the first main-loop tick arrives ("live").

import { createD3D8Executor } from "./d3d8_executor.mjs";
import { createGdiHooks } from "./gdi_executor.mjs";
import {
  SHARED_MULTIPLAYER_NETWORK_STATE,
  readSharedMultiplayerNetworkStatus,
} from "./multiplayer-network-status.mjs";
import {
  clearSharedUdpRing,
  createSharedUdpPortDemultiplexer,
  enqueueSharedUdpDatagram,
} from "./udp_realm_bridge.mjs";

const DEFAULT_CATCHUP_FRAMES = 2;
const STATUS_INTERVAL_MS = 500;
const LOG_LIMIT = 400;
const PREBOOT_QUEUE_LIMIT = 4096;

export default async function setupEngineRealm({ canvas, Module, realm, options }) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new Error("engine_realm_boot: no OffscreenCanvas transferred");
  }
  if (!Module || typeof Module !== "object" || typeof Module.cwrap !== "function") {
    throw new Error("engine_realm_boot: worker-realm Module (with cwrap) required");
  }
  const opts = options && typeof options === "object" ? options : {};

  // ---- realm-local log ring (drained into status posts) --------------------
  const logs = [];
  function recordLog(message, data) {
    logs.push({ time: new Date().toISOString(), message, data: data ?? null });
    if (logs.length > LOG_LIMIT) {
      logs.splice(0, logs.length - LOG_LIMIT);
    }
  }

  // ---- unsolicited worker->main channel -------------------------------------
  // The stub hands us a respond() per command; the first command from main
  // ("attachMainPort", sent right after setupDone) pins it as the standing
  // post channel. Until then fall back to the default worker channel tagged
  // for emscripten's silent 'setimmediate' branch.
  let postToMain = (payload, transfer) => {
    try {
      self.postMessage({ target: "setimmediate", __cncRealm: payload }, transfer ?? []);
    } catch (_error) {
      // Nothing useful to do from the worker realm.
    }
  };

  // ---- D3D8 executor in this realm ------------------------------------------
  // Shader tier: the executor's d3d8ShaderTierQuery reads the page URL and
  // localStorage — neither exists in this realm — so bridge.js resolves the
  // tier main-side (threadedWorkerShaderTier) and passes it through the setup
  // options; the forced global wins over the query's URL/localStorage checks.
  // Must be set BEFORE the executor is constructed (the tier is sampled once
  // at D3D8 device create).
  if (opts.shaderTier === "ps11" || opts.shaderTier === "ff") {
    globalThis.__cncD3D8ShaderTier = opts.shaderTier;
  }
  const realmState = {
    canvas: { width: canvas.width, height: canvas.height },
    graphics: {},
    logs,
  };
  const { hooks: d3d8Hooks, diag: d3d8Diag } = createD3D8Executor({
    canvas,
    // env.gl omitted -> executor creates the WebGL2 context on the
    // OffscreenCanvas itself (worker path).
    log: recordLog,
    state: realmState,
    getModule: () => Module,
    // Fresh-view accessors: Module.HEAP* are reassigned by
    // updateGlobalBufferAndViews IN THIS REALM whenever this thread grows the
    // memory (the engine thread is the only wasm-running thread), so reading
    // them per call is growth-safe here.
    getHeapU8: () => Module.HEAPU8 ?? null,
    getHeapU16: () => Module.HEAPU16 ?? null,
    getHeapU32: () => Module.HEAPU32 ?? null,
    getHeapF32: () => Module.HEAPF32 ?? null,
    getHeapF64: () => Module.HEAPF64 ?? null,
    preserveDrawingBuffer: opts.preserveDrawingBuffer === true,
  });
  for (const [name, hook] of Object.entries(d3d8Hooks)) {
    Module[name] = hook;
  }
  // Record the worker context's real renderer string once (GATE D evidence:
  // this is the context the engine actually draws with — Metal vs SwiftShader
  // must be provable from the status feed, not inferred from a separate
  // probe context).
  try {
    const glCtx = typeof d3d8Diag.gl === "function" ? d3d8Diag.gl() : null;
    if (glCtx) {
      const ext = glCtx.getExtension("WEBGL_debug_renderer_info");
      realmState.graphics.webglRenderer = ext
        ? glCtx.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : glCtx.getParameter(glCtx.RENDERER);
    }
  } catch (error) {
    recordLog("worker renderer query failed", { error: String(error) });
  }
  // Graphics diagnostics level: the worker realm's URL has no ?diag= param,
  // so apply the page's choice (play.html runs "lite") explicitly. The
  // executor installed __cncSetDiagLevel on THIS realm's globalThis.
  if ((opts.diagLevel === "lite" || opts.diagLevel === "full")
      && typeof globalThis.__cncSetDiagLevel === "function") {
    globalThis.__cncSetDiagLevel(opts.diagLevel);
  }
  if (typeof opts.perfCounters === "boolean") {
    globalThis.__cncSetD3D8PerfCounters?.(opts.perfCounters);
  }

  // ---- GDI text hooks (synchronous returns -> must live in this realm) ------
  const gdiHooks = createGdiHooks();
  Module.cncGdiMeasure = gdiHooks.cncGdiMeasure;
  Module.cncGdiRasterizeGlyph = gdiHooks.cncGdiRasterizeGlyph;

  // ---- MSS audio forwarders --------------------------------------------------
  // bridge.js executes the real Web Audio bodies main-side; completion
  // callbacks come back through the engineCall primitive
  // (cnc_port_mss_complete_*). Forwarders return 1 ("playback requested") —
  // the C++ side records it as browser_playback_requested, and failures are
  // still surfaced main-side through the audio runtime state.
  const MSS_HOOKS = [
    "cncPortMssSampleStart",
    "cncPortMssSampleStop",
    "cncPortMssSampleEnd",
    "cncPortMssSampleRelease",
    "cncPortMss3DSampleStart",
    "cncPortMss3DSamplePositionUpdate",
    "cncPortMss3DListenerUpdate",
    "cncPortMss3DSampleStop",
    "cncPortMss3DSampleEnd",
    "cncPortMss3DSampleRelease",
    "cncPortMssStreamStart",
    "cncPortMssStreamStop",
    "cncPortMssStreamVolumePan",
  ];
  const MSS_SAMPLE_DATA_HOOKS = new Set(["cncPortMssSampleStart", "cncPortMss3DSampleStart"]);

  function sampleWaveRange(payload) {
    // Mirror bridge.js mssSampleWaveRange validation against the (fresh, this
    // realm grows its own views) wasm heap.
    const heapu8 = Module.HEAPU8;
    const dataPtr = Number(payload?.dataPtr ?? 0) >>> 0;
    if (!dataPtr || !(heapu8 instanceof Uint8Array) || dataPtr + 12 > heapu8.byteLength) {
      return null;
    }
    const riffSize = (heapu8[dataPtr + 4]
      | (heapu8[dataPtr + 5] << 8)
      | (heapu8[dataPtr + 6] << 16)
      | (heapu8[dataPtr + 7] << 24)) + 8;
    if (riffSize < 44 || riffSize > 64 * 1024 * 1024 || dataPtr + riffSize > heapu8.byteLength) {
      return null;
    }
    return { heapu8, dataPtr, riffSize };
  }

  // Content-key dedupe for the per-start RIFF copies (P1c follow-up (g)):
  // gameplay replays the same payloads constantly and main-side keeps a
  // content-keyed decoded AudioBuffer cache (bridge.js
  // cncPortDecodedSampleCache), so after the first send the key alone is
  // enough. SAME algorithm as bridge.js mssSampleCacheKey so both sides
  // derive identical keys from identical bytes. Main notifies decode-cache
  // evictions (and failed caches) back via {cmd:"mssCacheDrop", keys}; a
  // dropped key re-sends bytes on its next start.
  const mssSentKeys = new Set();
  const mssForwardStats = { starts: 0, copies: 0, bytesCopied: 0, dedupeSkips: 0 };

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

  for (const hook of MSS_HOOKS) {
    Module[hook] = (payload /* , heapu8 */) => {
      const message = { cmd: "mss", hook, payload: payload ?? null };
      let transfer;
      if (MSS_SAMPLE_DATA_HOOKS.has(hook)) {
        mssForwardStats.starts += 1;
        const range = sampleWaveRange(payload);
        if (range) {
          const key = mssSampleCacheKey(range.heapu8, range.dataPtr, range.riffSize);
          if (mssSentKeys.has(key)) {
            // Key-only start: main's decoded cache already holds this
            // payload. dataPtr 0 marks "no bytes on purpose" (main falls back
            // to a drop-notify + one skipped play if it evicted the entry).
            message.payload = { ...payload, dataPtr: 0, cacheKey: key };
            mssForwardStats.dedupeSkips += 1;
          } else {
            // First send: copy the RIFF out of the heap (the C++ Miles shim
            // mallocs a fresh PCM buffer per start and may free it before
            // main handles the async message). The copy is PADDED with 4
            // lead bytes and dataPtr rewritten to 4 so the main-side body's
            // `!dataPtr` guard and dataPtr-relative reads keep working
            // unchanged against the small transferred buffer.
            const copy = new Uint8Array(4 + range.riffSize);
            copy.set(range.heapu8.subarray(range.dataPtr, range.dataPtr + range.riffSize), 4);
            message.payload = { ...payload, dataPtr: 4, cacheKey: key };
            message.bytes = copy;
            transfer = [copy.buffer];
            mssSentKeys.add(key);
            mssForwardStats.copies += 1;
            mssForwardStats.bytesCopied += copy.byteLength;
          }
        }
        // On range-validation failure keep the original pointer: main will
        // attempt the shared-heap read and surface the same validation error
        // the non-threaded path would.
      }
      try {
        postToMain(message, transfer);
      } catch (_error) {
        return 0;
      }
      return 1;
    };
  }

  // ---- Bink video bridge ----------------------------------------------------
  // HTMLVideoElement/WebM demuxing lives on the main realm. Decoded RGBA
  // frames arrive asynchronously and are cached here so BinkCopyToBuffer can
  // remain a synchronous call from the original engine.
  const binkFrames = new Map();
  const closedBinkHandles = new Set();
  const binkStats = {
    opens: 0,
    closes: 0,
    framesReceived: 0,
    copies: 0,
    copyMisses: 0,
    bytesReceived: 0,
    bytesCopied: 0,
    lastCopy: null,
    openedSourcePaths: [],
  };

  Module.cncPortBinkVideoOpen = (payload) => {
    const handle = Number(payload?.handle ?? 0) >>> 0;
    closedBinkHandles.delete(handle);
    if (handle) binkFrames.set(handle, { frameNum: 0, width: 0, height: 0, bytes: null });
    binkStats.opens += 1;
    const sourcePath = String(payload?.sourcePath ?? "");
    if (sourcePath) binkStats.openedSourcePaths = [...binkStats.openedSourcePaths, sourcePath].slice(-16);
    postToMain({ cmd: "bink", hook: "open", payload: payload ?? null });
  };
  Module.cncPortBinkVideoEvent = (payload) => {
    postToMain({ cmd: "bink", hook: "event", payload: payload ?? null });
  };
  Module.cncPortBinkVideoClose = (payload) => {
    const handle = Number(payload?.handle ?? 0) >>> 0;
    binkFrames.delete(handle);
    closedBinkHandles.add(handle);
    binkStats.closes += 1;
    postToMain({ cmd: "bink", hook: "close", payload: payload ?? null });
  };
  Module.cncPortBinkVideoCurrentFrame = (payload) => {
    const handle = Number(payload?.handle ?? payload ?? 0) >>> 0;
    return Number(binkFrames.get(handle)?.frameNum ?? 0) >>> 0;
  };
  Module.cncPortBinkCopyToBuffer = (payload) => {
    const handle = Number(payload?.handle ?? 0) >>> 0;
    const decoded = binkFrames.get(handle);
    const heap = Module.HEAPU8;
    const flags = Number(payload?.flags) >>> 0;
    const bytesPerPixel = flags === 1 ? 3 : flags === 3 ? 4 : (flags === 5 || flags === 6) ? 2 : 0;
    if (!decoded?.bytes || !(heap instanceof Uint8Array) || bytesPerPixel === 0) {
      binkStats.copyMisses += 1;
      binkStats.lastCopy = {
        ok: false,
        reason: !decoded?.bytes
          ? "no decoded frame"
          : !(heap instanceof Uint8Array) ? "no wasm heap" : "unsupported surface flags",
        handle,
        flags,
        hasDecodedBytes: Boolean(decoded?.bytes),
        heapBytes: heap?.byteLength ?? 0,
      };
      return false;
    }

    const dest = Number(payload.dest ?? 0) >>> 0;
    const destPitch = Number(payload.destPitch ?? 0) >>> 0;
    const destHeight = Number(payload.destHeight ?? 0) >>> 0;
    const destX = Number(payload.destX ?? 0) >>> 0;
    const destY = Number(payload.destY ?? 0) >>> 0;
    const rowStart = destX * bytesPerPixel;
    const rowCapacity = destPitch > rowStart ? destPitch - rowStart : 0;
    const copyWidth = Math.min(
      decoded.width,
      Number(payload.width ?? 0) >>> 0,
      Math.floor(rowCapacity / bytesPerPixel),
    );
    const copyHeight = Math.min(
      decoded.height,
      Number(payload.height ?? 0) >>> 0,
      destHeight > destY ? destHeight - destY : 0,
    );
    const finalByte = dest + (destY + copyHeight - 1) * destPitch
      + rowStart + copyWidth * bytesPerPixel;
    if (!dest || copyWidth <= 0 || copyHeight <= 0 || finalByte > heap.byteLength) {
      binkStats.copyMisses += 1;
      binkStats.lastCopy = {
        ok: false,
        reason: "invalid destination geometry",
        handle,
        dest,
        destPitch,
        destHeight,
        destX,
        destY,
        copyWidth,
        copyHeight,
        finalByte,
        heapBytes: heap.byteLength,
        decodedWidth: decoded.width,
        decodedHeight: decoded.height,
      };
      return false;
    }

    const rowBytes = copyWidth * bytesPerPixel;
    for (let y = 0; y < copyHeight; y += 1) {
      const source = y * decoded.width * 4;
      const target = dest + (destY + y) * destPitch + rowStart;
      if (flags === 3) {
        heap.set(decoded.bytes.subarray(source, source + rowBytes), target);
        continue;
      }
      for (let x = 0; x < copyWidth; x += 1) {
        const sourcePixel = source + x * 4;
        const blue = decoded.bytes[sourcePixel];
        const green = decoded.bytes[sourcePixel + 1];
        const red = decoded.bytes[sourcePixel + 2];
        const targetPixel = target + x * bytesPerPixel;
        if (flags === 1) {
          heap[targetPixel] = blue;
          heap[targetPixel + 1] = green;
          heap[targetPixel + 2] = red;
        } else {
          const packed = flags === 6
            ? ((red >>> 3) << 11) | ((green >>> 2) << 5) | (blue >>> 3)
            : ((red >>> 3) << 10) | ((green >>> 3) << 5) | (blue >>> 3);
          heap[targetPixel] = packed & 0xff;
          heap[targetPixel + 1] = packed >>> 8;
        }
      }
    }
    binkStats.copies += 1;
    binkStats.bytesCopied += rowBytes * copyHeight;
    binkStats.lastCopy = {
      ok: true,
      handle,
      dest,
      destPitch,
      flags,
      copyWidth,
      copyHeight,
      bytesCopied: rowBytes * copyHeight,
      sourceCenterBgra: Array.from(decoded.bytes.subarray(
        (Math.floor(copyHeight / 2) * decoded.width + Math.floor(copyWidth / 2)) * 4,
        (Math.floor(copyHeight / 2) * decoded.width + Math.floor(copyWidth / 2)) * 4 + 4,
      )),
    };
    return true;
  };

  // ---- UDP hooks: synchronous worker side of the main-realm WebRTC bridge ---
  // The original UDP adapter calls these synchronously from the engine pthread.
  // RTCDataChannel remains main-realm owned; fixed SharedArrayBuffer rings carry
  // datagrams between realms without blocking the browser event loop.
  const udpBridge = opts.udpBridge;
  const udpBridgeState = udpBridge ? new Int32Array(udpBridge.state) : null;
  let udpOutgoingSequence = 0;
  const networkDiagnosticsEnabled = () => udpBridgeState
    ? Atomics.load(udpBridgeState, 1) === 1
    : false;
  const epochMicroseconds = () => Math.round((performance.timeOrigin + performance.now()) * 1000);
  const udpIncoming = udpBridge ? createSharedUdpPortDemultiplexer(udpBridge.incoming, {
    onEvent: (type, detail) => {
      if (!networkDiagnosticsEnabled()) return;
      postToMain({ cmd: "networkDiagnostic", event: { kind: "event", type, detail } });
    },
  }) : null;
  Module.cncPortBrowserUdpClear = () => {
    if (!udpBridge) return 0;
    clearSharedUdpRing(udpBridge.incoming);
    udpIncoming.clear();
    return 1;
  };
  Module.cncPortBrowserUdpSend = (datagram) => {
    const bytes = datagram?.bytes instanceof Uint8Array
      ? datagram.bytes
      : new Uint8Array(datagram?.bytes ?? 0);
    const queued = {
      ...datagram,
      bridgeSequence: ++udpOutgoingSequence,
      bridgeQueuedAtUs: epochMicroseconds(),
    };
    if (!udpBridge || !enqueueSharedUdpDatagram(udpBridge.outgoing, queued)) {
      return -5;
    }
    postToMain({ cmd: "udpFlush" });
    return bytes.byteLength;
  };
  Module.cncPortBrowserUdpRecv = ({ capacity, port } = {}) => {
    const datagram = udpIncoming?.receive({ capacity, port }) ?? null;
    if (datagram && networkDiagnosticsEnabled()) {
      const dequeuedAtUs = epochMicroseconds();
      postToMain({
        cmd: "networkDiagnostic",
        event: {
          kind: "event",
          type: "bridge.incoming.dequeued-by-engine",
          detail: {
            traceId: `in-${datagram.bridgeSequence ?? 0}`,
            byteLength: datagram.bytes.byteLength,
            destinationPort: datagram.destinationPort,
            queuedAtUs: datagram.bridgeQueuedAtUs ?? null,
            dequeuedAtUs,
            queueDelayUs: datagram.bridgeQueuedAtUs
              ? dequeuedAtUs - datagram.bridgeQueuedAtUs
              : null,
          },
        },
      });
    }
    return datagram;
  };
  Module.cncPortBrowserNetworkVirtualIp = () => udpBridge
    ? Atomics.load(new Int32Array(udpBridge.state),
      SHARED_MULTIPLAYER_NETWORK_STATE.VIRTUAL_IP) >>> 0
    : 0;
  Module.cncPortBrowserNetworkStatus = () => udpBridge?.networkStatus
    ? readSharedMultiplayerNetworkStatus(udpBridge.networkStatus)
    : "Discovery status unavailable";
  Module.cncPortBrowserNetworkState = (index) => {
    const field = Number(index) | 0;
    return udpBridge && field >= 0 && field < SHARED_MULTIPLAYER_NETWORK_STATE.WORDS
      ? Atomics.load(new Int32Array(udpBridge.state), field)
      : 0;
  };
  Module.cncPortBrowserNetworkReconnect = () => {
    if (!udpBridge) return 0;
    postToMain({ cmd: "networkReconnect" });
    return 1;
  };

  // ---- wasm call plumbing (all deferred until the pthread ticks) -------------
  let live = false; // first tick seen -> wasm calls are safe in this realm
  const prebootQueue = []; // functions to run on first tick, in arrival order
  const cwrapCache = new Map();
  function cwrapFor(name, returnType, argTypes) {
    const key = `${name} ${returnType} ${(argTypes ?? []).join(",")}`;
    let fn = cwrapCache.get(key);
    if (!fn) {
      fn = Module.cwrap(name, returnType === "void" || returnType === null ? null : returnType, argTypes ?? []);
      cwrapCache.set(key, fn);
    }
    return fn;
  }

  function runOrQueue(task) {
    if (live) {
      task();
      return;
    }
    if (prebootQueue.length < PREBOOT_QUEUE_LIMIT) {
      prebootQueue.push(task);
    }
  }

  function parseMaybeJson(value) {
    if (typeof value !== "string") {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (_error) {
      return value;
    }
  }

  function execEngineCall(msg, respond) {
    const reply = { cmd: "engineCallResult", id: msg.id };
    try {
      const fn = cwrapFor(String(msg.name), msg.returnType ?? null, msg.argTypes ?? []);
      const value = fn(...(Array.isArray(msg.args) ? msg.args : []));
      reply.ok = true;
      reply.value = msg.parseJson === false ? value : parseMaybeJson(value);
    } catch (error) {
      reply.ok = false;
      reply.error = String((error && error.stack) || error);
    }
    respond(reply);
  }

  // ---- input forwarding sink --------------------------------------------------
  // Entries mirror bridge.js pushBrowserInputToWasmLite exactly; applied in
  // arrival order on this thread (between frames: port messages and rAF ticks
  // interleave on the worker event loop, never mid-frame).
  function applyInputEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return;
    }
    if (entry.reset === true) {
      Module._cnc_port_reset_browser_input();
      return;
    }
    const cursor = entry.cursor ?? null;
    Module._cnc_port_set_browser_input_lite(
      cursor?.x ?? 0,
      cursor?.y ?? 0,
      cursor ? 1 : 0,
      entry.virtualKey ?? -1,
      entry.keyDown ? 1 : 0,
    );
    if ((entry.directInputCode ?? -1) >= 0) {
      Module._cnc_port_dinput_queue_key(
        entry.directInputCode,
        entry.keyDown ? 1 : 0,
        Math.max(0, Math.floor(entry.timestamp || 0)),
      );
    }
    const win32 = entry.win32 ?? null;
    if (win32) {
      Module._cnc_port_post_browser_message_lite(
        win32.message ?? 0,
        win32.wParam ?? 0,
        win32.lParam ?? 0,
        win32.px ?? cursor?.x ?? 0,
        win32.py ?? cursor?.y ?? 0,
      );
    }
  }

  // ---- stepped real init state machine ---------------------------------------
  // States: idle -> pending -> stepping -> done/error. Driven one slice per
  // main-loop tick so the worker yields between slices (the real LoadScreen
  // presents at task boundaries — the design's whole point).
  const init = {
    state: "idle",
    request: null,
    respond: null,
    aborted: false,
    abortMessage: null,
    lastStep: null,
  };

  function finishInit() {
    let frontier = null;
    try {
      frontier = parseMaybeJson(cwrapFor("cnc_port_real_engine_frontier", "string", [])());
    } catch (error) {
      frontier = null;
      if (!init.aborted) {
        init.aborted = true;
        init.abortMessage = `frontier read failed: ${error}`;
      }
    }
    init.state = init.aborted ? "error" : "done";
    const respond = init.respond;
    init.respond = null;
    if (respond) {
      respond({
        cmd: "engineInitDone",
        id: init.request?.id,
        result: {
          aborted: init.aborted,
          abortMessage: init.abortMessage,
          frontier,
          stepped: init.request?.stepped !== false,
          lastStep: init.lastStep,
        },
      });
    }
  }

  function pumpInit() {
    if (init.state === "pending") {
      const request = init.request;
      try {
        const bootWidth = Math.round(Number(request.bootWidth ?? 0));
        const bootHeight = Math.round(Number(request.bootHeight ?? 0));
        if (bootWidth >= 640 && bootHeight >= 480
            && typeof Module._cnc_port_real_engine_set_boot_resolution === "function") {
          Module._cnc_port_real_engine_set_boot_resolution(bootWidth, bootHeight);
        }
        if (request.maxCameraHeight !== undefined) {
          const maxCameraHeight = Number(request.maxCameraHeight);
          if (!Number.isFinite(maxCameraHeight)
              || maxCameraHeight < 310 || maxCameraHeight > 500) {
            throw new Error("invalid camera zoom setting");
          }
          const accepted = cwrapFor(
            "cnc_port_real_engine_set_max_camera_height", "number", ["number"],
          )(maxCameraHeight);
          if (accepted !== 1) {
            throw new Error("camera zoom setting rejected");
          }
        }
        const commanderName = String(request.commanderName ?? "");
        if (commanderName) {
          const identity = parseMaybeJson(cwrapFor(
            "cnc_port_real_engine_set_commander_name", "string", ["string"],
          )(commanderName));
          if (identity?.ok !== true) {
            throw new Error("commander identity rejected");
          }
        }
        const userDataHome = String(request.userDataHome ?? "");
        const homeAccepted = cwrapFor(
          "cnc_port_real_engine_set_user_data_home", "number", ["string"],
        )(userDataHome);
        if (homeAccepted !== 1) {
          throw new Error("user-data home rejected");
        }
        const modDirectory = String(request.modDirectory ?? "");
        const modAccepted = cwrapFor(
          "cnc_port_real_engine_set_mod_directory", "number", ["string"],
        )(modDirectory);
        if (modAccepted !== 1) {
          throw new Error("mod directory rejected");
        }
        if (request.stepped === false) {
          // ?initstep=0 fallback: the monolithic init call — blocks this
          // worker (not the page) for the whole init.
          const monolithic = parseMaybeJson(cwrapFor(
            "cnc_port_real_engine_init", "string", ["string", "number"],
          )(request.runDirectory, request.shellMap ? 1 : 0));
          if (monolithic?.initReturned !== true) {
            init.aborted = true;
            init.abortMessage = `init failed: ${monolithic?.exception ?? "unknown"}`;
          }
          finishInit();
          return;
        }
        const begin = parseMaybeJson(cwrapFor(
          "cnc_port_real_engine_init_begin", "string", ["string", "number"],
        )(request.runDirectory, request.shellMap ? 1 : 0));
        if (begin?.ok !== true && begin?.initReturned !== true) {
          init.aborted = true;
          init.abortMessage = `init_begin failed: ${begin?.exception ?? "unknown"}`;
          finishInit();
          return;
        }
        init.state = "stepping";
      } catch (error) {
        init.aborted = true;
        init.abortMessage = String((error && error.stack) || error);
        finishInit();
      }
      return;
    }
    if (init.state === "stepping") {
      try {
        const step = parseMaybeJson(cwrapFor(
          "cnc_port_real_engine_init_step", "string", ["number"],
        )(Number(init.request?.stepBudgetMs ?? 200)));
        init.lastStep = step;
        postToMain({ cmd: "engineInitProgress", id: init.request?.id, step });
        if (step?.ok !== true) {
          init.aborted = true;
          init.abortMessage = `init_step failed: ${step?.exception ?? "unknown"}`;
          finishInit();
          return;
        }
        if (step?.done === true) {
          finishInit();
        }
      } catch (error) {
        init.aborted = true;
        init.abortMessage = String((error && error.stack) || error);
        finishInit();
      }
    }
  }

  // ---- paced frame loop (ported from play.mjs runPacedFrameLoop) --------------
  const loop = {
    active: false,
    error: null,
    clientFps: 60,
    logicFps: 30,
    catchup: DEFAULT_CATCHUP_FRAMES,
    clientPeriod: 1000 / 60,
    logicPeriod: 1000 / 30,
    rafDeltas: [],
    refreshMs: 1000 / 60,
    lastStamp: null,
    nextClientDue: null,
    nextLogicDue: null,
    clientFrames: 0, // cumulative paced client frames run
    logicFrames: 0, // cumulative logic frames run
    startedAt: null,
    lastResult: null,
    lastClientFrameStamp: null,
    engineFrameTimes: [], // rolling real-engine update durations (ms)
    presentationFrameTimes: [], // rolling intervals between presented client frames (ms)
    pacingSamples: [], // last ~900 {t, logic} for pacing-evenness probes
    quitRequested: false,
  };
  let framePacedFn = null;
  let lastBrowserCursorKey = null;

  function runPacedFrame(runLogic) {
    try {
      return parseMaybeJson(framePacedFn(runLogic ? 1 : 0));
    } finally {
      // Lite rendering may defer the final indexed draw so it can be merged
      // with an adjacent range.  The main-realm frame RPCs flush that draw
      // after every engine frame; the autonomous worker loop must preserve
      // the same frame boundary or the next frame's clear discards it.
      d3d8Diag.flushD3D8PendingDrawBatch("threadedFramePaced");
    }
  }

  function startLoop(msg, respond) {
    const clientFps = Math.max(1, Math.min(240, Number(msg.clientFps ?? 60)));
    const logicFps = Math.max(1, Math.min(240, Number(msg.logicFps ?? 30)));
    let pacing = null;
    try {
      pacing = parseMaybeJson(cwrapFor(
        "cnc_port_real_engine_set_client_pacing", "string", ["number", "number"],
      )(clientFps, logicFps));
    } catch (error) {
      respond({ cmd: "startLoopResult", id: msg.id, ok: false, error: String(error) });
      return;
    }
    framePacedFn = cwrapFor("cnc_port_real_engine_frame_paced", "string", ["number"]);
    loop.active = true;
    loop.error = null;
    loop.clientFps = clientFps;
    loop.logicFps = logicFps;
    loop.catchup = Math.max(1, Math.min(8, Number(msg.catchup ?? DEFAULT_CATCHUP_FRAMES)));
    loop.clientPeriod = 1000 / clientFps;
    loop.logicPeriod = 1000 / logicFps;
    loop.rafDeltas.length = 0;
    loop.lastStamp = null;
    loop.nextClientDue = null;
    loop.nextLogicDue = null;
    loop.clientFrames = 0;
    loop.logicFrames = 0;
    loop.startedAt = performance.now();
    loop.lastClientFrameStamp = null;
    loop.engineFrameTimes.length = 0;
    loop.presentationFrameTimes.length = 0;
    loop.pacingSamples.length = 0;
    loop.quitRequested = false;
    respond({ cmd: "startLoopResult", id: msg.id, ok: true, pacing, clientFps, logicFps });
  }

  function pumpLoop(stamp) {
    if (!loop.active) {
      return;
    }
    if (loop.lastStamp !== null) {
      const delta = stamp - loop.lastStamp;
      if (delta > 1 && delta < 100) {
        loop.rafDeltas.push(delta);
        if (loop.rafDeltas.length > 20) {
          loop.rafDeltas.shift();
        }
        const sorted = [...loop.rafDeltas].sort((a, b) => a - b);
        loop.refreshMs = sorted[Math.floor(sorted.length / 2)];
      }
    }
    loop.lastStamp = stamp;
    const halfTick = loop.refreshMs / 2;
    if (loop.nextClientDue === null) {
      loop.nextClientDue = stamp;
      loop.nextLogicDue = stamp;
    }
    if (stamp < loop.nextClientDue - halfTick) {
      return; // display refresh outruns clientFps: skip this tick
    }
    loop.nextClientDue += loop.clientPeriod;
    if (stamp - loop.nextClientDue > 4 * loop.clientPeriod) {
      loop.nextClientDue = stamp + loop.clientPeriod;
    }
    let logicToRun = 0;
    while (stamp >= loop.nextLogicDue - halfTick && logicToRun < loop.catchup) {
      logicToRun += 1;
      loop.nextLogicDue += loop.logicPeriod;
    }
    if (stamp - loop.nextLogicDue > 4 * loop.logicPeriod) {
      loop.nextLogicDue = stamp + loop.logicPeriod;
    }

    let result = null;
    try {
      if (logicToRun === 0) {
        result = runPacedFrame(false);
      } else {
        for (let i = 0; i < logicToRun; i += 1) {
          result = runPacedFrame(true);
          loop.logicFrames += 1;
          if (result?.quitting === true) {
            break;
          }
        }
      }
    } catch (error) {
      loop.active = false;
      loop.error = String((error && error.stack) || error);
      recordLog("threaded frame loop threw", { error: loop.error });
      postToMain({ cmd: "loopError", error: loop.error });
      return;
    }
    if (result?.tick !== true || result?.exceptionCaught === true) {
      loop.active = false;
      loop.error = result?.exception || "engine frame failed";
      recordLog("threaded frame loop failed", { result });
      postToMain({ cmd: "loopError", error: loop.error, result });
      return;
    }
    if (loop.lastClientFrameStamp !== null) {
      loop.presentationFrameTimes.push(stamp - loop.lastClientFrameStamp);
      if (loop.presentationFrameTimes.length > 600) {
        loop.presentationFrameTimes.shift();
      }
    }
    loop.lastClientFrameStamp = stamp;
    const engineFrameMs = Number(result.lastFrameMs);
    if (Number.isFinite(engineFrameMs) && engineFrameMs >= 0) {
      loop.engineFrameTimes.push(engineFrameMs);
      if (loop.engineFrameTimes.length > 600) {
        loop.engineFrameTimes.shift();
      }
    }
    loop.clientFrames += 1;
    loop.lastResult = result;
    const browserCursor = result.browserCursor;
    if (browserCursor && typeof browserCursor === "object") {
      const cursorSet = browserCursor.cursorSet === true;
      const cursorFile = typeof browserCursor.cursorFile === "string"
        ? browserCursor.cursorFile : null;
      const cursorKey = `${cursorSet ? 1 : 0}\u0000${cursorFile ?? ""}`;
      if (cursorKey !== lastBrowserCursorKey) {
        lastBrowserCursorKey = cursorKey;
        postToMain({ cmd: "browserCursor", cursorSet, cursorFile });
      }
    }
    loop.pacingSamples.push({ t: stamp, logic: logicToRun });
    if (loop.pacingSamples.length > 900) {
      loop.pacingSamples.splice(0, loop.pacingSamples.length - 900);
    }
    if (result.quitting === true) {
      loop.active = false;
      if (!loop.quitRequested) {
        loop.quitRequested = true;
        recordLog("original engine requested runtime exit", {
          logicFrame: result.logicFrame,
          clientFrame: result.clientFrame,
        });
        postToMain({
          cmd: "quitRequested",
          logicFrame: result.logicFrame,
          clientFrame: result.clientFrame,
        });
      }
    }
  }

  // ---- periodic status --------------------------------------------------------
  let lastStatusAt = 0;
  let statusSeq = 0;
  function buildStatus() {
    const result = loop.lastResult;
    let networkDiagnostics = null;
    let touchUi = null;
    if (live) {
      try {
        touchUi = parseMaybeJson(cwrapFor("cnc_port_touch_ui_state", "string", [])());
      } catch (error) {
        touchUi = { ok: false, error: String(error), entries: [] };
      }
    }
    if (live && networkDiagnosticsEnabled()) {
      try {
        networkDiagnostics = parseMaybeJson(cwrapFor(
          "cnc_port_real_engine_lan_state", "string", [],
        )());
      } catch (error) {
        networkDiagnostics = { ok: false, error: String(error) };
      }
    }
    return {
      cmd: "status",
      seq: ++statusSeq,
      now: performance.now(),
      live,
      initState: init.state,
      loop: {
        active: loop.active,
        error: loop.error,
        clientFps: loop.clientFps,
        logicFps: loop.logicFps,
        startedAt: loop.startedAt,
        clientFrames: loop.clientFrames,
        logicFrames: loop.logicFrames,
        quitRequested: loop.quitRequested,
      },
      timing: {
        engineFrameMs: loop.engineFrameTimes.slice(),
        presentationFrameMs: loop.presentationFrameTimes.slice(),
      },
      frame: result ? {
        logicFrame: result.logicFrame,
        clientFrame: result.clientFrame,
        framesCompleted: result.framesCompleted,
        loadSessionActive: result.loadSessionActive,
        loadProgress: result.loadProgress,
        lastFrameMs: result.lastFrameMs,
        quitting: result.quitting,
      } : null,
      networkDiagnostics,
      touchUi,
      engineDisplaySize: realmState.engineDisplaySize ?? null,
      canvas: { width: canvas.width, height: canvas.height },
      contextLost: typeof d3d8Diag?.webglContextLost === "function"
        ? d3d8Diag.webglContextLost() === true
        : false,
      shaderTier: realmState.graphics?.d3d8ShaderTier ?? null,
      // GATE D perf evidence: the worker executor's renderer string and live
      // draw/cache counters (same summary the legacy path serves from
      // snapshotState) — without these, threaded GL perf is unobservable
      // from the main realm.
      graphics: {
        renderer: realmState.graphics?.webglRenderer ?? null,
        d3d8Perf: typeof d3d8Diag?.d3d8PerfSummary === "function"
          ? d3d8Diag.d3d8PerfSummary()
          : null,
      },
      mssForward: { ...mssForwardStats },
      bink: {
        ...binkStats,
        activeHandles: binkFrames.size,
        frames: [...binkFrames.entries()].map(([handle, frame]) => ({
          handle,
          frameNum: frame.frameNum,
          width: frame.width,
          height: frame.height,
          byteLength: frame.bytes?.byteLength ?? 0,
        })),
      },
      recentLogs: logs.slice(-5),
    };
  }

  function maybePostStatus(stamp) {
    if (stamp - lastStatusAt < STATUS_INTERVAL_MS) {
      return;
    }
    lastStatusAt = stamp;
    postToMain(buildStatus());
  }

  // ---- the engine-thread tick (called by wasm_engine_thread_boot.cpp) --------
  let tickErrorLogged = false;
  Module.cncPortEngineThreadTick = () => {
    try {
      const stamp = performance.now();
      if (!live) {
        live = true;
        recordLog("engine thread live (first main-loop tick)");
        // Bound-draw diagnostics cwrap is a wasm call — wire it only now.
        try {
          if (typeof d3d8Diag.setBoundDrawDiagnosticsSetter === "function"
              && typeof Module._cnc_port_d3d8_set_bound_draw_diagnostics === "function") {
            d3d8Diag.setBoundDrawDiagnosticsSetter(
              Module.cwrap("cnc_port_d3d8_set_bound_draw_diagnostics", null, ["number"]));
            if (typeof d3d8Diag.applyD3D8BoundDrawDiagnosticsLevel === "function") {
              d3d8Diag.applyD3D8BoundDrawDiagnosticsLevel();
            }
          }
        } catch (error) {
          recordLog("bound-draw diagnostics wiring failed", { error: String(error) });
        }
        while (prebootQueue.length > 0) {
          prebootQueue.shift()();
        }
        postToMain({ cmd: "live" });
      }
      pumpInit();
      pumpLoop(stamp);
      maybePostStatus(stamp);
    } catch (error) {
      if (!tickErrorLogged) {
        tickErrorLogged = true;
        recordLog("engine thread tick failed", { error: String((error && error.stack) || error) });
        postToMain({ cmd: "tickError", error: String((error && error.stack) || error) });
      }
    }
  };

  // ---- command handler (stub forwards unknown cmds here) ----------------------
  // NOTE: default-channel echoes (emscripten's 'setimmediate' bounce) also land
  // here — silently ignore anything outside the known command set.
  function handleCommand(msg, respond) {
    const cmd = msg?.cmd;
    switch (cmd) {
      case "attachMainPort":
        postToMain = (payload, transfer) => {
          try {
            respond(payload, transfer);
          } catch (_error) {
            // channel gone
          }
        };
        respond({ cmd: "mainPortAttached" });
        return;
      case "engineInit": {
        if (init.state !== "idle") {
          respond({
            cmd: "engineInitDone",
            id: msg.id,
            result: { aborted: true, abortMessage: `init already ${init.state}`, frontier: null },
          });
          return;
        }
        init.state = "pending";
        init.request = {
          id: msg.id,
          runDirectory: String(msg.runDirectory ?? "/assets/runtime"),
          shellMap: msg.shellMap === true,
          stepped: msg.stepped !== false,
          bootWidth: msg.bootWidth,
          bootHeight: msg.bootHeight,
          maxCameraHeight: msg.maxCameraHeight,
          stepBudgetMs: msg.stepBudgetMs,
          commanderName: String(msg.commanderName ?? ""),
          modDirectory: String(msg.modDirectory ?? ""),
          userDataHome: String(msg.userDataHome ?? ""),
        };
        init.respond = respond;
        return;
      }
      case "engineCall":
        runOrQueue(() => execEngineCall(msg, respond));
        return;
      case "input": {
        const batch = Array.isArray(msg.batch) ? msg.batch : [];
        runOrQueue(() => {
          for (const entry of batch) {
            try {
              applyInputEntry(entry);
            } catch (error) {
              recordLog("threaded input apply failed", { error: String(error) });
            }
          }
        });
        return;
      }
      case "stageOpfsFiles": {
        // P2 OPFS-as-disk staging: pre-open FileSystemSyncAccessHandle
        // objects in THIS realm for an {enginePath -> opfsPath} map so the
        // fd intercept in src/wasm_opfs_files.cpp can serve engine reads
        // from OPFS. Pure JS + OPFS (no wasm calls), so it is safe before
        // the engine pthread runs — and it MUST complete before boot/go
        // (async handle opens need this worker's free event loop; see
        // notes/p1-engine-thread.md "P2-prep results"). Pass the map as data,
        // not in the module URL: a complete optional-video library has enough
        // paths to exceed Chromium's dynamic-import URL limit.
        const map = msg.map && typeof msg.map === "object" ? msg.map : {};
        const moduleUrl = new URL("./opfs_realm_files.mjs", import.meta.url);
        import(moduleUrl.href)
          .then((opfsModule) => opfsModule.default({ Module, map }))
          .then((result) => {
            recordLog("opfs archive handles staged", {
              staged: result?.stagedPaths?.length ?? 0,
            });
            respond({
              cmd: "stageOpfsFilesResult",
              id: msg.id,
              ok: true,
              stagedPaths: result?.stagedPaths ?? [],
            });
          })
          .catch((error) => {
            recordLog("opfs staging failed", { error: String(error) });
            respond({
              cmd: "stageOpfsFilesResult",
              id: msg.id,
              ok: false,
              error: String((error && error.stack) || error),
            });
          });
        return;
      }
      case "releaseOpfsHandles": {
        // Pagehide teardown: drop the exclusive OPFS locks NOW instead of
        // when the browser reaps this worker. Engine reads after this fail
        // (-1 from the fd intercept) — acceptable, the page is going away.
        let closed = 0;
        try {
          const registry = globalThis.__cncOpfsRegistry;
          if (registry && typeof registry.closeAll === "function") {
            closed = registry.closeAll();
          }
        } catch (error) {
          recordLog("releaseOpfsHandles failed", { error: String(error) });
        }
        if (msg.id !== undefined) {
          respond({ cmd: "releaseOpfsHandlesResult", id: msg.id, ok: true, closed });
        }
        return;
      }
      case "mssCacheDrop": {
        // Main-side decoded-sample cache dropped these keys (LRU eviction or
        // a start that failed to cache) — re-send bytes on their next start.
        for (const key of Array.isArray(msg.keys) ? msg.keys : []) {
          mssSentKeys.delete(key);
        }
        return; // fire-and-forget (no id)
      }
      case "textureInventory": {
        // Mirror of bridge.js's non-threaded d3d8TextureInventory handler —
        // the executor's live-texture map exists only in THIS realm in
        // threaded mode. Read-only JS + GL sampling; no wasm calls, so it is
        // safe whether or not the pthread is live yet.
        try {
          const requestedSizes = Array.isArray(msg.sizes)
            ? new Set(msg.sizes.map((size) => String(size)))
            : new Set(["1024x256"]);
          const sampleLimit = Math.max(0, Math.min(256, Number(msg.sampleLimit ?? 4) >>> 0));
          const inventory = {};
          for (const [texId, res] of d3d8Diag.d3d8Textures.entries()) {
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
                  ? d3d8Diag.sampleD3D8TexturePixel(res, centerX, centerY)
                  : null,
                cornerPixels: ready
                  ? [
                    d3d8Diag.sampleD3D8TexturePixel(res, cornerX, cornerY),
                    d3d8Diag.sampleD3D8TexturePixel(res, lowerX, lowerY),
                  ]
                  : null,
              });
            }
          }
          respond({
            cmd: "textureInventoryResult",
            id: msg.id,
            ok: true,
            inventory,
            liveCount: d3d8Diag.d3d8Textures.size,
          });
        } catch (error) {
          respond({
            cmd: "textureInventoryResult",
            id: msg.id,
            ok: false,
            error: String((error && error.stack) || error),
          });
        }
        return;
      }
      case "binkFrame": {
        const handle = Number(msg.handle ?? 0) >>> 0;
        const bytes = msg.bytes instanceof Uint8Array ? msg.bytes : null;
        const width = Number(msg.width ?? 0) >>> 0;
        const height = Number(msg.height ?? 0) >>> 0;
        if (handle && !closedBinkHandles.has(handle)
            && bytes && width > 0 && height > 0 && bytes.byteLength >= width * height * 4) {
          binkFrames.set(handle, {
            frameNum: Number(msg.frameNum ?? 0) >>> 0,
            width,
            height,
            bytes,
          });
          binkStats.framesReceived += 1;
          binkStats.bytesReceived += bytes.byteLength;
        }
        return;
      }
      case "sm1ShaderAudit": {
        try {
          const enabled = typeof msg.enable === "boolean"
            ? d3d8Diag.setD3D8SM1ShaderAuditEnabled(msg.enable)
            : undefined;
          respond({
            cmd: "sm1ShaderAuditResult",
            id: msg.id,
            ok: true,
            enabled,
            audit: d3d8Diag.d3d8SM1ShaderAuditSummary(),
          });
        } catch (error) {
          respond({
            cmd: "sm1ShaderAuditResult",
            id: msg.id,
            ok: false,
            error: String((error && error.stack) || error),
          });
        }
        return;
      }
      case "opfsReadRange": {
        // Read [offset, offset+length) of a staged OPFS archive in THIS realm
        // — the sync access handles live here and reads are stateless {at}.
        // Serves bridge.js's MSS stream path (music/speech): in threaded mode
        // the archive bytes are on OPFS, not MEMFS. length 0 = stat (size
        // only). Pure JS + OPFS, safe before the pthread is live.
        try {
          const registry = globalThis.__cncOpfsRegistry;
          const entry = registry?.files?.get(String(msg.path ?? ""));
          if (!entry) {
            respond({
              cmd: "opfsReadRangeResult",
              id: msg.id,
              ok: false,
              error: `no staged OPFS handle for ${msg.path}`,
            });
            return;
          }
          const offset = Math.max(0, Math.floor(Number(msg.offset ?? 0)));
          const length = Math.max(0, Math.floor(Number(msg.length ?? 0)));
          const wanted = Math.max(0, Math.min(length, entry.size - offset));
          const bytes = new Uint8Array(wanted);
          const read = wanted > 0 ? entry.handle.read(bytes, { at: offset }) : 0;
          respond({
            cmd: "opfsReadRangeResult",
            id: msg.id,
            ok: true,
            size: entry.size,
            bytes: read === wanted ? bytes : bytes.subarray(0, read),
          }, [bytes.buffer]);
        } catch (error) {
          respond({
            cmd: "opfsReadRangeResult",
            id: msg.id,
            ok: false,
            error: String((error && error.stack) || error),
          });
        }
        return;
      }
      case "startLoop":
        runOrQueue(() => startLoop(msg, respond));
        return;
      case "stopLoop":
        loop.active = false;
        respond({ cmd: "stopLoopResult", id: msg.id, ok: true });
        return;
      case "setDiagLevel":
        if (typeof globalThis.__cncSetDiagLevel === "function") {
          respond({
            cmd: "setDiagLevelResult",
            id: msg.id,
            level: globalThis.__cncSetDiagLevel(msg.level),
          });
        } else {
          respond({ cmd: "setDiagLevelResult", id: msg.id, level: null });
        }
        return;
      case "status":
        respond({ ...buildStatus(), id: msg.id, cmd: "statusResult" });
        return;
      case "pacingSamples":
        respond({ cmd: "pacingSamplesResult", id: msg.id, samples: loop.pacingSamples.slice() });
        return;
      default:
        // Not ours (or a bounced reply) — ignore silently.
    }
  }

  recordLog("engine realm boot module installed", {
    realm,
    diagLevel: opts.diagLevel ?? null,
    preserveDrawingBuffer: opts.preserveDrawingBuffer === true,
  });

  return {
    hooksInstalled: [
      ...Object.keys(d3d8Hooks),
      "cncGdiMeasure",
      "cncGdiRasterizeGlyph",
      ...MSS_HOOKS,
      "cncPortBinkVideoOpen",
      "cncPortBinkVideoEvent",
      "cncPortBinkVideoClose",
      "cncPortBinkVideoCurrentFrame",
      "cncPortBinkCopyToBuffer",
      "cncPortBrowserUdpSend",
      "cncPortBrowserUdpRecv",
      "cncPortBrowserUdpClear",
      "cncPortBrowserNetworkVirtualIp",
      "cncPortBrowserNetworkStatus",
      "cncPortBrowserNetworkState",
      "cncPortBrowserNetworkReconnect",
      "cncPortEngineThreadTick",
    ],
    handleCommand,
  };
}
