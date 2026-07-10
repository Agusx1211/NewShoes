const DEFAULT_LIMITS = {
  events: 20_000,
  preRecordEvents: 2_000,
  frameSamples: 1_500,
  logs: 4_000,
  issues: 100,
  videoBytes: 24 * 1024 * 1024,
  videoChunks: 90,
};

const SUMMARY_INTERVAL_FRAMES = 60;
const STORAGE_DB = "cnc_issue_dumps";
const STORAGE_VERSION = 1;
const STORAGE_STORE = "dumps";

const POINTER_MESSAGES = new Map([
  [0, { down: 0x0201, up: 0x0202, doubleClick: 0x0203 }],
  [1, { down: 0x0207, up: 0x0208, doubleClick: 0x0209 }],
  [2, { down: 0x0204, up: 0x0205, doubleClick: 0x0206 }],
]);

function nowIso() {
  return new Date().toISOString();
}

function stableNowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function pushBounded(list, value, limit) {
  list.push(value);
  if (list.length > limit) {
    list.splice(0, list.length - limit);
  }
}

function safeJsonSize(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return null;
  }
}

function truncateString(value, max = 512) {
  if (typeof value !== "string" || value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...(+${value.length - max} chars)`;
}

export function redactLarge(value, depth = 0) {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.startsWith("data:image/") || value.startsWith("data:video/")) {
      return {
        redactedDataUrl: true,
        mime: value.slice(5, value.indexOf(";")),
        bytesApprox: dataUrlSizeBytes(value),
      };
    }
    return truncateString(value);
  }
  if (depth >= 5) {
    return Array.isArray(value)
      ? { redactedArray: true, length: value.length }
      : { redactedObject: true, keys: Object.keys(value).slice(0, 16) };
  }
  if (Array.isArray(value)) {
    const values = value.slice(0, 24).map((entry) => redactLarge(entry, depth + 1));
    if (value.length > values.length) {
      values.push({ truncated: value.length - values.length });
    }
    return values;
  }
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = redactLarge(entry, depth + 1);
  }
  return output;
}

function compactCanvas(canvas) {
  if (!canvas) {
    return null;
  }
  const rect = typeof canvas.getBoundingClientRect === "function"
    ? canvas.getBoundingClientRect()
    : { left: 0, top: 0, width: canvas.width, height: canvas.height };
  return {
    width: canvas.width,
    height: canvas.height,
    clientWidth: Math.round(rect.width ?? 0),
    clientHeight: Math.round(rect.height ?? 0),
    clientLeft: Math.round(rect.left ?? 0),
    clientTop: Math.round(rect.top ?? 0),
  };
}

function numericFrame(value) {
  const frame = Number(value);
  return Number.isFinite(frame) && frame >= 0 ? frame : null;
}

function compactGameplay(gameplay) {
  if (!gameplay) {
    return null;
  }
  return {
    inGame: gameplay.inGame,
    gameMode: gameplay.gameMode,
    logicFrame: gameplay.logicFrame,
    objectCount: gameplay.objectCount,
    loadingMap: gameplay.loadingMap,
    clientFrame: gameplay.clientFrame,
    drawableCount: gameplay.drawableCount,
    renderedObjectCount: gameplay.renderedObjectCount,
    inputEnabled: gameplay.inputEnabled,
    selectCount: gameplay.selectCount,
    fade: gameplay.fade,
    fadeValue: gameplay.fadeValue,
    localPlayer: gameplay.localPlayer,
  };
}

function compactFrame(frame) {
  if (!frame) {
    return null;
  }
  const gameplay = frame.gameplay ?? frame.clientState?.gameplay ?? null;
  return {
    tick: frame.tick === true,
    summary: frame.summary === true,
    initReturned: frame.initReturned,
    framesAttempted: frame.framesAttempted,
    framesCompleted: frame.framesCompleted,
    lastFrameMs: frame.lastFrameMs,
    exceptionCaught: frame.exceptionCaught,
    exception: frame.exception,
    quitting: frame.quitting,
    lastUpdateTarget: frame.lastUpdateTarget,
    lastGameLogicStep: frame.lastGameLogicStep,
    // W3D animation clock + frame counters (frozen-animation debugging: if
    // w3dSyncTimeMs stops advancing while clientFrame moves, every HAnim/
    // particle/muzzle-flash timeline is frozen — owner-reported symptom).
    logicFrame: frame.logicFrame,
    clientFrame: frame.clientFrame,
    w3dSyncTimeMs: frame.w3dSyncTimeMs,
    w3dFrameTimeMs: frame.w3dFrameTimeMs,
    timeMultiplier: frame.timeMultiplier,
    // W3DDisplay::draw exit-branch counters: name the branch that skips the
    // scene render when visible canvas updates lag the 60Hz engine tick.
    w3dDrawEntries: frame.w3dDrawEntries,
    w3dDrawExitIconic: frame.w3dDrawExitIconic,
    w3dDrawExitTimeFast: frame.w3dDrawExitTimeFast,
    w3dDrawExitMultiplier: frame.w3dDrawExitMultiplier,
    w3dDrawSceneRenders: frame.w3dDrawSceneRenders,
    w3dDrawViewDraws: frame.w3dDrawViewDraws,
    w3dModelDrawCalls: frame.w3dModelDrawCalls,
    w3dRecoilCalls: frame.w3dRecoilCalls,
    w3dRecoilBarrelUpdates: frame.w3dRecoilBarrelUpdates,
    w3dAnimProgressCalls: frame.w3dAnimProgressCalls,
    w3dAnimFrameAdvances: frame.w3dAnimFrameAdvances,
    textureDiagnostics: frame.textureDiagnostics,
    missingApplies: frame.missingApplies,
    missingBailouts: frame.missingBailouts,
    gameplay: compactGameplay(gameplay),
    display: frame.display ?? frame.clientState?.display ?? null,
    view: frame.view ?? frame.clientState?.view ?? null,
    playerControl: frame.playerControl ?? null,
    particles: frame.particles ?? null,
    controlBar: frame.controlBar ?? null,
  };
}

function compactState(state) {
  if (!state) {
    return null;
  }
  return {
    booted: state.booted,
    frame: state.frame,
    runtime: state.runtime,
    wasm: state.wasm,
    canvas: state.canvas,
    graphics: {
      api: state.graphics?.api,
      // Active D3D8 shader tier ("ps11"/"ff") — sampled once per session in
      // bridge.js; dumps must carry it so tier-attribution is never guessed.
      d3d8ShaderTier: state.graphics?.d3d8ShaderTier,
      d3d8DrawIndexedSequence: state.graphics?.d3d8DrawIndexedSequence,
      d3d8Perf: state.graphics?.d3d8Perf,
      lastD3D8DrawIndexed: state.graphics?.lastD3D8DrawIndexed
        ? redactLarge(state.graphics.lastD3D8DrawIndexed, 1)
        : null,
      d3d8DrawHistoryCount: Array.isArray(state.graphics?.d3d8DrawHistory)
        ? state.graphics.d3d8DrawHistory.length
        : 0,
      d3d8SceneDrawHistoryCount: Array.isArray(state.graphics?.d3d8SceneDrawHistory)
        ? state.graphics.d3d8SceneDrawHistory.length
        : 0,
    },
    browserInput: state.browserInput,
    browserDirectInput: state.browserDirectInput,
    browserCursor: state.browserCursor,
    mountedArchives: state.mountedArchives,
    archiveMount: state.archiveMount
      ? {
          path: state.archiveMount.path,
          archiveCount: state.archiveMount.archiveSet?.archiveCount,
          bytes: state.archiveMount.archiveSet?.bytes,
          names: state.archiveMount.archiveSet?.archives?.map((archive) => archive.name),
        }
      : null,
    logCount: state.logCount,
  };
}

export function compactRpcResult(command, result) {
  if (!result || typeof result !== "object") {
    return result;
  }
  const base = {
    ok: result.ok,
    command,
    aborted: result.aborted,
    abortMessage: truncateString(result.abortMessage ?? ""),
    error: truncateString(result.error ?? ""),
  };
  if (result.frame) {
    base.frame = compactFrame(result.frame);
  }
  if (result.frontier) {
    base.frontier = redactLarge(result.frontier);
  }
  if (result.archiveSet) {
    base.archiveSet = {
      archiveCount: result.archiveSet.archiveCount,
      bytes: result.archiveSet.bytes,
      path: result.archiveSet.path,
      names: result.archiveSet.archives?.map((archive) => archive.name),
    };
  }
  if (result.state) {
    base.state = compactState(result.state);
  }
  if (command === "screenshot" && result.screenshot) {
    base.screenshot = redactLarge(result.screenshot);
  }
  return base;
}

function summarizePayload(payload) {
  return redactLarge(payload ?? {});
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

function enginePointFromEvent(event, canvas) {
  if (!canvas) {
    return null;
  }
  const rect = canvas.getBoundingClientRect();
  const targetWidth = window.CnCPort?.state?.engineDisplaySize?.width
    ?? window.CnCPort?.state?.canvas?.width
    ?? canvas.width;
  const targetHeight = window.CnCPort?.state?.engineDisplaySize?.height
    ?? window.CnCPort?.state?.canvas?.height
    ?? canvas.height;
  const scaleX = rect.width > 0 ? targetWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? targetHeight / rect.height : 1;
  return {
    x: Math.max(0, Math.min(targetWidth - 1, Math.round((event.clientX - rect.left) * scaleX))),
    y: Math.max(0, Math.min(targetHeight - 1, Math.round((event.clientY - rect.top) * scaleY))),
    targetWidth,
    targetHeight,
  };
}

function wheelWParam(event) {
  const delta = event.deltaY > 0 ? -120 : 120;
  return (delta & 0xffff) << 16;
}

function pointerWin32Message(event) {
  const messages = POINTER_MESSAGES.get(event.button);
  if (!messages) {
    return null;
  }
  if (event.type === "pointerdown") {
    return messages.down;
  }
  if (event.type === "pointerup") {
    return messages.up;
  }
  if (event.type === "dblclick") {
    return messages.doubleClick;
  }
  return null;
}

function dataUrlFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlSizeBytes(dataUrl) {
  if (typeof dataUrl !== "string") {
    return 0;
  }
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    return dataUrl.length;
  }
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

function canvasToDataUrl(canvas) {
  if (!canvas) {
    return null;
  }
  try {
    return canvas.toDataURL("image/png");
  } catch (error) {
    return null;
  }
}

function parseDataUrlMime(dataUrl) {
  const match = /^data:([^;,]+)/.exec(String(dataUrl ?? ""));
  return match?.[1] ?? "application/octet-stream";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20_000);
}

export function sanitizeDumpFileName(value) {
  return String(value ?? "cnc-issue-dump")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "cnc-issue-dump";
}

export function makeDumpId(date = new Date()) {
  return `cnc-${date.toISOString().replace(/[:.]/g, "-")}`;
}

function openStore() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB, STORAGE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORAGE_STORE)) {
        db.createObjectStore(STORAGE_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function putStoredDump(record) {
  const db = await openStore();
  if (!db) {
    return { ok: false, reason: "IndexedDB unavailable" };
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORAGE_STORE, "readwrite");
    tx.objectStore(STORAGE_STORE).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve({ ok: true });
    };
    tx.onerror = () => {
      const error = tx.error ?? new Error("IndexedDB put failed");
      db.close();
      reject(error);
    };
  });
}

async function queryAssetMetadata(url) {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    return {
      url: String(url),
      ok: head.ok,
      status: head.status,
      lastModified: head.headers.get("last-modified"),
      etag: head.headers.get("etag"),
      contentLength: Number(head.headers.get("content-length") ?? 0) || null,
      contentType: head.headers.get("content-type"),
    };
  } catch (error) {
    return {
      url: String(url),
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function queryServerBuildInfo() {
  try {
    const response = await fetch(new URL("/__cnc_build_info", window.location.href), {
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
      };
    }
    return {
      ok: true,
      ...(await response.json()),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function collectBuildAssets() {
  const base = window.location.href;
  const selectedDistDir = selectedCncPortDistDir();
  const urls = [
    `../${selectedDistDir}/cnc-port.wasm`,
    `../${selectedDistDir}/cnc-port.js`,
    "./bridge.js",
    "./play.mjs",
    "./issue-recorder.mjs",
    "./play.html",
    "./harness.css",
  ].map((path) => new URL(path, base).href);
  const [assets, server] = await Promise.all([
    Promise.all(urls.map(queryAssetMetadata)),
    queryServerBuildInfo(),
  ]);
  const latestMs = assets.reduce((latest, asset) => {
    const ms = asset.lastModified ? Date.parse(asset.lastModified) : 0;
    return Number.isFinite(ms) ? Math.max(latest, ms) : latest;
  }, 0);
  return {
    distDir: selectedDistDir,
    assets,
    server,
    latestLastModified: latestMs > 0 ? new Date(latestMs).toISOString() : null,
  };
}

function validCncPortDistDir(value) {
  return typeof value === "string" && /^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value);
}

function selectedCncPortDistDir() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fallback = window.location.pathname.endsWith("/play.html") ? "dist-release" : "dist";
    const value = params.get("dist") || fallback;
    return validCncPortDistDir(value) ? value : fallback;
  } catch {
    return "dist-release";
  }
}

function collectBrowserMetadata(canvas) {
  let renderer = null;
  let vendor = null;
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
  } catch {}

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: Array.from(navigator.languages ?? []),
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    maxTouchPoints: navigator.maxTouchPoints ?? null,
    cookieEnabled: navigator.cookieEnabled,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    pageUrl: window.location.href,
    referrer: document.referrer || null,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      devicePixelRatio: window.devicePixelRatio,
    },
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
    },
    canvas: compactCanvas(canvas),
    webgl: { vendor, renderer },
  };
}

function eventBase(type) {
  return {
    type,
    at: nowIso(),
    t: Math.round(stableNowMs()),
    frame: window.CnCPort?.state?.frame ?? null,
  };
}

function compactLogEntry(entry) {
  return {
    time: entry?.time ?? null,
    message: truncateString(entry?.message ?? ""),
    data: redactLarge(entry?.data ?? null),
  };
}

function encodeStrokes(strokes) {
  return strokes.map((stroke) => ({
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((point) => [
      Number(point.x.toFixed(1)),
      Number(point.y.toFixed(1)),
    ]),
  }));
}

function drawStrokes(ctx, strokes) {
  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length < 1) {
      continue;
    }
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
}

async function makeAnnotatedImage(screenshotDataUrl, strokes, width, height) {
  if (!screenshotDataUrl) {
    return null;
  }
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("Could not load screenshot for annotation"));
    image.src = screenshotDataUrl;
  });
  const output = document.createElement("canvas");
  output.width = width || image.naturalWidth || image.width;
  output.height = height || image.naturalHeight || image.height;
  const ctx = output.getContext("2d");
  ctx.drawImage(image, 0, 0, output.width, output.height);
  drawStrokes(ctx, strokes);
  return output.toDataURL("image/png");
}

export function createIssueRecorder(options = {}) {
  return new IssueRecorder(options);
}

class IssueRecorder {
  constructor({
    canvas,
    controls,
    archiveSpecs = [],
    buildArchives = null,
    statusNode = null,
    getConfiguredDiagLevel = null,
    setConfiguredDiagLevel = null,
  } = {}) {
    this.canvas = canvas;
    this.controls = controls ?? {};
    this.archiveSpecs = archiveSpecs;
    this.buildArchives = buildArchives;
    this.statusNode = statusNode;
    this.getConfiguredDiagLevel = getConfiguredDiagLevel;
    this.setConfiguredDiagLevel = setConfiguredDiagLevel;
    this.id = makeDumpId();
    this.startedAt = nowIso();
    this.recording = false;
    this.rpc = null;
    this.events = [];
    this.frameSamples = [];
    this.issues = [];
    this.session = {};
    this.build = null;
    this.lastPersist = null;
    this.sequence = 0;
    this.frameCounter = 0;
    this.lastFrameMarker = null;
    this.deepIssueCapture = true;
    this.includeVideo = true;
    this.mediaRecorder = null;
    this.videoChunks = [];
    this.videoBytes = 0;
    this.videoMime = null;
    this.currentIssue = null;
    this.strokes = [];
    this.activeStroke = null;
    this.bound = false;
    this.wrappedRpc = null;
    this.animReportTimer = null;
    this.animReportSamples = [];
    this.setStatus("idle");
  }

  async init() {
    this.build = await collectBuildAssets();
    this.record("session.init", {
      browser: collectBrowserMetadata(this.canvas),
      build: this.build,
      archiveSpecs: this.archiveSpecs,
    }, { force: true });
    this.bindControls();
    this.bindInputCapture();
    this.bindErrorCapture();
    await this.persistDraft("init");
    return this;
  }

  setRpc(rpc) {
    this.rpc = rpc;
    this.wrappedRpc = async (command, payload = {}) => {
      const startedAt = stableNowMs();
      this.record("rpc.start", {
        command,
        payload: summarizePayload(payload),
      });
      try {
        const result = await rpc(command, payload);
        const wallMs = stableNowMs() - startedAt;
        this.record("rpc.result", {
          command,
          wallMs: Number(wallMs.toFixed(1)),
          result: compactRpcResult(command, result),
          jsonBytes: safeJsonSize(result),
        });
        return result;
      } catch (error) {
        const wallMs = stableNowMs() - startedAt;
        this.record("rpc.error", {
          command,
          wallMs: Number(wallMs.toFixed(1)),
          error: error instanceof Error ? error.stack ?? error.message : String(error),
        }, { force: true });
        throw error;
      }
    };
    return this.wrappedRpc;
  }

  setSessionContext(patch) {
    this.session = {
      ...this.session,
      ...patch,
      updatedAt: nowIso(),
    };
    this.record("session.context", patch, { force: true });
    void this.persistDraft("session-context");
  }

  noteFailure(message, detail) {
    this.record("session.failure", { message, detail: redactLarge(detail) }, { force: true });
    this.setStatus("failure captured");
    void this.persistDraft("failure");
  }

  shouldUseSummaryFrame() {
    if (!this.recording) {
      return false;
    }
    this.frameCounter += 1;
    return this.frameCounter % SUMMARY_INTERVAL_FRAMES === 0;
  }

  frameCommand() {
    return this.shouldUseSummaryFrame() ? "realEngineFrameSummary" : "realEngineFrameTick";
  }

  noteFrame(command, payload, result, wallMs) {
    const sample = {
      at: nowIso(),
      t: Math.round(stableNowMs()),
      command,
      payload: summarizePayload(payload),
      wallMs: Number(wallMs.toFixed(1)),
      ok: result?.ok === true,
      aborted: result?.aborted === true,
      frame: compactFrame(result?.frame),
      state: compactState(result?.state),
    };
    this.noteEngineFrame(sample.frame?.framesCompleted ?? sample.state?.frame);
    pushBounded(this.frameSamples, sample, DEFAULT_LIMITS.frameSamples);
    this.record("frame.sample", sample);
  }

  bindControls() {
    if (this.bound) {
      return;
    }
    this.bound = true;
    this.controls.recordToggle?.addEventListener("click", () => {
      if (this.recording) {
        void this.stopRecording("manual");
      } else {
        void this.startRecording("manual");
      }
    });
    this.controls.issueButton?.addEventListener("click", () => {
      void this.openIssueDialog();
    });
    this.controls.saveDumpButton?.addEventListener("click", () => {
      void this.downloadDump("manual");
    });
    this.controls.uploadDumpButton?.addEventListener("click", () => {
      void this.uploadDump("manual");
    });
    this.controls.issueCancel?.addEventListener("click", () => {
      this.closeIssueDialog();
    });
    this.controls.issueSave?.addEventListener("click", () => {
      void this.saveIssueFromDialog();
    });
    this.controls.issueClear?.addEventListener("click", () => {
      this.clearAnnotation();
    });
    this.controls.detailToggle?.addEventListener("change", () => {
      this.deepIssueCapture = this.controls.detailToggle.checked;
      this.record("ui.deep-toggle", { enabled: this.deepIssueCapture }, { force: true });
    });
    this.controls.videoToggle?.addEventListener("change", () => {
      this.includeVideo = this.controls.videoToggle.checked;
      this.record("ui.video-toggle", { enabled: this.includeVideo }, { force: true });
      if (!this.includeVideo && this.mediaRecorder) {
        void this.stopVideo();
      }
    });
    this.bindAnnotationCanvas();
  }

  bindInputCapture() {
    const target = this.canvas ?? document;
    const capturePointer = (event) => {
      const point = enginePointFromEvent(event, this.canvas);
      const message = event.type === "pointermove" ? 0x0200 : pointerWin32Message(event);
      this.record("input.pointer", {
        eventType: event.type,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: event.button,
        buttons: event.buttons,
        client: { x: Math.round(event.clientX), y: Math.round(event.clientY) },
        enginePoint: point,
        win32Message: message == null || !point
          ? null
          : {
              message,
              wParam: 0,
              lParam: win32PointLParam(point),
              point: { x: point.x, y: point.y },
            },
      });
    };
    for (const type of ["pointermove", "pointerdown", "pointerup", "pointercancel", "dblclick"]) {
      target.addEventListener(type, capturePointer, { capture: true, passive: true });
    }
    target.addEventListener("wheel", (event) => {
      const point = enginePointFromEvent(event, this.canvas);
      this.record("input.wheel", {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        enginePoint: point,
        win32Message: point
          ? {
              message: 0x020A,
              wParam: wheelWParam(event),
              lParam: win32PointLParam(point),
              point: { x: point.x, y: point.y },
            }
          : null,
      });
    }, { capture: true, passive: true });
    window.addEventListener("keydown", (event) => {
      this.record("input.key", {
        eventType: "keydown",
        key: event.key,
        code: event.code,
        location: event.location,
        repeat: event.repeat,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
      });
    }, { capture: true });
    window.addEventListener("keyup", (event) => {
      this.record("input.key", {
        eventType: "keyup",
        key: event.key,
        code: event.code,
        location: event.location,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
      });
    }, { capture: true });
    window.addEventListener("blur", () => this.record("window.blur", {}, { force: true }));
    window.addEventListener("focus", () => this.record("window.focus", {}, { force: true }));
    window.addEventListener("resize", () => {
      this.record("window.resize", {
        viewport: collectBrowserMetadata(this.canvas).viewport,
        canvas: compactCanvas(this.canvas),
      }, { force: true });
    });
  }

  bindErrorCapture() {
    window.addEventListener("error", (event) => {
      this.record("window.error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack ?? event.error?.message ?? null,
      }, { force: true });
    });
    window.addEventListener("unhandledrejection", (event) => {
      this.record("window.unhandledrejection", {
        reason: event.reason?.stack ?? event.reason?.message ?? String(event.reason),
      }, { force: true });
    });
  }

  bindAnnotationCanvas() {
    const canvas = this.controls.annotationCanvas;
    if (!canvas) {
      return;
    }
    const pointerPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * scaleY)),
      };
    };
    const repaint = () => this.repaintAnnotation();
    canvas.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      this.activeStroke = {
        color: this.controls.issueColor?.value ?? "#ff3b30",
        width: Number(this.controls.issueStroke?.value ?? 4),
        points: [pointerPoint(event)],
      };
      this.strokes.push(this.activeStroke);
      repaint();
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this.activeStroke) {
        return;
      }
      event.preventDefault();
      this.activeStroke.points.push(pointerPoint(event));
      repaint();
    });
    const finish = (event) => {
      if (!this.activeStroke) {
        return;
      }
      event.preventDefault();
      this.activeStroke.points.push(pointerPoint(event));
      this.activeStroke = null;
      repaint();
    };
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
  }

  record(type, data = {}, { force = false } = {}) {
    if (!this.recording && !force && this.events.length >= DEFAULT_LIMITS.preRecordEvents) {
      this.events.shift();
    }
    const base = eventBase(type);
    const event = {
      seq: ++this.sequence,
      ...base,
      frame: this.currentEngineFrame(base.frame),
      data: redactLarge(data),
    };
    pushBounded(this.events, event, this.recording ? DEFAULT_LIMITS.events : DEFAULT_LIMITS.preRecordEvents);
    this.refreshStatus();
    return event;
  }

  noteEngineFrame(value) {
    const frame = numericFrame(value);
    if (frame == null) {
      return;
    }
    this.lastFrameMarker = Math.max(this.lastFrameMarker ?? 0, frame);
  }

  currentEngineFrame(fallback = null) {
    const liveFrame = numericFrame(fallback ?? window.CnCPort?.state?.frame);
    if (liveFrame != null) {
      this.noteEngineFrame(liveFrame);
    }
    return this.lastFrameMarker ?? liveFrame;
  }

  async startRecording(reason = "manual") {
    this.recording = true;
    this.record("recording.start", {
      reason,
      browser: collectBrowserMetadata(this.canvas),
      diagLevel: this.getConfiguredDiagLevel?.() ?? null,
    }, { force: true });
    this.controls.recordToggle?.classList.add("active");
    if (this.controls.recordToggle) {
      this.controls.recordToggle.textContent = "stop";
    }
    if (this.includeVideo) {
      await this.startVideo();
    }
    // Sample the anim/ghost report once per second while recording so the
    // bundle carries per-unit state for the exact moments the video shows a
    // problem (the 3 dump-time reports only cover the instant of the dump,
    // when the camera has usually moved off the broken units).
    if (this.rpc && !this.animReportTimer) {
      this.animReportTimer = setInterval(() => {
        if (!this.recording || !this.rpc) {
          return;
        }
        void this.rpc("realEngineAnimReport", { maxEntries: 40 })
          .then((result) => {
            const report = result?.report ?? result ?? null;
            // Full-fidelity copy for the bundle: the timeline event path
            // depth-redacts nested objects (turrets/barrels/anim would be
            // stripped) and caps arrays at 24 entries.
            if (report) {
              pushBounded(this.animReportSamples, {
                t: stableNowMs(),
                frame: this.lastFrameMarker,
                report,
              }, 240);
            }
            this.record("animReport.sample", {
              entries: report?.drawables?.length ?? 0,
            });
          })
          .catch(() => {});
      }, 1000);
    }
    this.setStatus("recording");
    await this.persistDraft("recording-start");
  }

  async stopRecording(reason = "manual") {
    this.record("recording.stop", { reason }, { force: true });
    this.recording = false;
    if (this.animReportTimer) {
      clearInterval(this.animReportTimer);
      this.animReportTimer = null;
    }
    this.controls.recordToggle?.classList.remove("active");
    if (this.controls.recordToggle) {
      this.controls.recordToggle.textContent = "record";
    }
    await this.stopVideo();
    this.setStatus("stopped");
    await this.persistDraft("recording-stop");
  }

  async startVideo() {
    if (!this.canvas || typeof MediaRecorder === "undefined" || typeof this.canvas.captureStream !== "function") {
      this.record("video.unavailable", {
        mediaRecorder: typeof MediaRecorder !== "undefined",
        captureStream: typeof this.canvas?.captureStream === "function",
      }, { force: true });
      return;
    }
    if (this.mediaRecorder) {
      return;
    }
    try {
      const stream = this.canvas.captureStream(5);
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
          ? "video/webm;codecs=vp8"
          : "video/webm";
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 350_000,
      });
      this.videoMime = mime;
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size <= 0) {
          return;
        }
        this.videoChunks.push(event.data);
        this.videoBytes += event.data.size;
        while (
          this.videoChunks.length > DEFAULT_LIMITS.videoChunks ||
          this.videoBytes > DEFAULT_LIMITS.videoBytes
        ) {
          const removed = this.videoChunks.shift();
          this.videoBytes -= removed?.size ?? 0;
        }
        this.record("video.chunk", {
          size: event.data.size,
          chunks: this.videoChunks.length,
          bytes: this.videoBytes,
        });
      };
      recorder.onerror = (event) => {
        this.record("video.error", { error: event.error?.message ?? String(event.error) }, { force: true });
      };
      recorder.start(4_000);
      this.mediaRecorder = recorder;
      this.record("video.start", { mime }, { force: true });
    } catch (error) {
      this.record("video.start-error", {
        error: error instanceof Error ? error.message : String(error),
      }, { force: true });
    }
  }

  async stopVideo() {
    const recorder = this.mediaRecorder;
    if (!recorder) {
      return;
    }
    await new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
      try {
        if (recorder.state !== "inactive") {
          recorder.requestData();
          recorder.stop();
        } else {
          resolve();
        }
      } catch {
        resolve();
      }
    });
    for (const track of recorder.stream?.getTracks?.() ?? []) {
      track.stop();
    }
    this.mediaRecorder = null;
    this.record("video.stop", { chunks: this.videoChunks.length, bytes: this.videoBytes }, { force: true });
  }

  async openIssueDialog() {
    if (!this.rpc) {
      this.setStatus("no rpc");
      return;
    }
    this.setStatus("capturing issue");
    const issueId = `issue-${String(this.issues.length + 1).padStart(3, "0")}`;
    const screenshot = await this.safeRpc("screenshot", {});
    const state = await this.safeRpc("state", {});
    const dataUrl = screenshot?.screenshot?.dataUrl ?? canvasToDataUrl(this.canvas);
    this.currentIssue = {
      id: issueId,
      createdAt: nowIso(),
      markerFrame: this.currentEngineFrame(),
      screenshot: {
        dataUrl,
        width: screenshot?.screenshot?.width ?? this.canvas?.width ?? null,
        height: screenshot?.screenshot?.height ?? this.canvas?.height ?? null,
        centerPixel: screenshot?.screenshot?.centerPixel ?? null,
        topLeftPixel: screenshot?.screenshot?.topLeftPixel ?? null,
      },
      shallowState: {
        screenshot: compactRpcResult("screenshot", screenshot),
        state: compactRpcResult("state", state),
      },
    };
    this.prepareIssueCanvas(this.currentIssue.screenshot);
    this.controls.issueTitle && (this.controls.issueTitle.value = "");
    this.controls.issueComment && (this.controls.issueComment.value = "");
    this.controls.issueModal?.classList.remove("hidden");
    this.controls.issueComment?.focus();
    this.record("issue.dialog-open", {
      issueId,
      frame: this.currentIssue.markerFrame,
      screenshotBytes: dataUrlSizeBytes(dataUrl),
    }, { force: true });
    this.setStatus("issue ready");
  }

  closeIssueDialog() {
    this.controls.issueModal?.classList.add("hidden");
    this.currentIssue = null;
    this.strokes = [];
    this.activeStroke = null;
    this.repaintAnnotation();
    this.setStatus(this.recording ? "recording" : "idle");
  }

  prepareIssueCanvas(screenshot) {
    const screenshotCanvas = this.controls.screenshotCanvas;
    const annotationCanvas = this.controls.annotationCanvas;
    if (!screenshotCanvas || !annotationCanvas) {
      return;
    }
    const width = screenshot?.width ?? this.canvas?.width ?? 1280;
    const height = screenshot?.height ?? this.canvas?.height ?? 720;
    screenshotCanvas.width = width;
    screenshotCanvas.height = height;
    annotationCanvas.width = width;
    annotationCanvas.height = height;
    const ctx = screenshotCanvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);
    if (screenshot?.dataUrl) {
      const image = new Image();
      image.onload = () => {
        ctx.drawImage(image, 0, 0, width, height);
      };
      image.src = screenshot.dataUrl;
    }
    this.strokes = [];
    this.repaintAnnotation();
  }

  repaintAnnotation() {
    const canvas = this.controls.annotationCanvas;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStrokes(ctx, this.strokes);
  }

  clearAnnotation() {
    this.strokes = [];
    this.activeStroke = null;
    this.repaintAnnotation();
  }

  async saveIssueFromDialog() {
    if (!this.currentIssue) {
      return;
    }
    this.setStatus("saving issue");
    const title = this.controls.issueTitle?.value?.trim() || this.currentIssue.id;
    const comment = this.controls.issueComment?.value?.trim() || "";
    const strokes = encodeStrokes(this.strokes);
    const annotatedDataUrl = await makeAnnotatedImage(
      this.currentIssue.screenshot.dataUrl,
      this.strokes,
      this.currentIssue.screenshot.width,
      this.currentIssue.screenshot.height,
    );
    const deepSnapshot = this.deepIssueCapture
      ? await this.captureDeepSnapshot(this.currentIssue.id)
      : null;
    const issue = {
      ...this.currentIssue,
      title,
      comment,
      annotation: {
        strokes,
        strokeCount: strokes.length,
        annotatedDataUrl,
        annotatedMime: annotatedDataUrl ? parseDataUrlMime(annotatedDataUrl) : null,
      },
      deepSnapshot,
      timelineWindow: this.timelineWindow(this.currentIssue.markerFrame),
      logsTail: this.collectLogsTail(),
    };
    pushBounded(this.issues, issue, DEFAULT_LIMITS.issues);
    this.record("issue.saved", {
      issueId: issue.id,
      title,
      frame: issue.markerFrame,
      hasComment: comment.length > 0,
      strokeCount: strokes.length,
      deep: deepSnapshot != null,
    }, { force: true });
    this.closeIssueDialog();
    await this.persistDraft("issue-saved");
    this.setStatus(`saved ${issue.id}`);
  }

  async captureDeepSnapshot(issueId) {
    const previousDiag = this.getConfiguredDiagLevel?.() ?? "lite";
    const snapshot = {
      issueId,
      startedAt: nowIso(),
      previousDiag,
      diagnostics: {},
    };
    try {
      if (typeof window.__cncSetD3D8SceneDrawHistoryLimit === "function") {
        window.__cncSetD3D8SceneDrawHistoryLimit(2048);
      }
      if (typeof window.__cncSetDiagLevel === "function") {
        window.__cncSetDiagLevel("full");
      }
      this.setConfiguredDiagLevel?.("full", { updateBridge: false });
      snapshot.summaryAfterFullDiag = await this.safeRpc("realEngineFrameSummary", { frames: 2 });
      snapshot.state = await this.safeRpc("state", {});
      snapshot.queryDrawables = await this.safeRpc("queryDrawables", {});
      snapshot.querySelection = await this.safeRpc("querySelection", {});
      snapshot.d3d8TextureInventory = await this.safeRpc("d3d8TextureInventory", {});
      snapshot.screenshotAfterDeepFrames = await this.safeRpc("screenshot", {});
      snapshot.d3d8Perf = typeof window.__cncD3D8PerfSummary === "function"
        ? window.__cncD3D8PerfSummary()
        : null;
    } finally {
      if (typeof window.__cncSetDiagLevel === "function") {
        window.__cncSetDiagLevel(previousDiag);
      }
      this.setConfiguredDiagLevel?.(previousDiag, { updateBridge: false });
      snapshot.finishedAt = nowIso();
    }
    return snapshot;
  }

  async safeRpc(command, payload = {}) {
    if (!this.rpc) {
      return { ok: false, command, error: "RPC unavailable" };
    }
    const startedAt = stableNowMs();
    try {
      const result = await this.rpc(command, payload);
      this.record("issue.rpc", {
        command,
        wallMs: Number((stableNowMs() - startedAt).toFixed(1)),
        result: compactRpcResult(command, result),
      });
      return result;
    } catch (error) {
      const result = {
        ok: false,
        command,
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      };
      this.record("issue.rpc-error", result, { force: true });
      return result;
    }
  }

  timelineWindow(frame, radius = 600) {
    if (!Number.isFinite(Number(frame))) {
      return this.events.slice(-1_000);
    }
    const target = Number(frame);
    return this.events.filter((event) => {
      const eventFrame = Number(event.frame);
      return Number.isFinite(eventFrame) && Math.abs(eventFrame - target) <= radius;
    }).slice(-2_000);
  }

  collectLogsTail() {
    const logs = window.CnCPort?.state?.logs ?? [];
    return logs.slice(-DEFAULT_LIMITS.logs).map(compactLogEntry);
  }

  async videoDataUrl() {
    if (this.mediaRecorder) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 250);
        const done = () => {
          clearTimeout(timer);
          resolve();
        };
        try {
          this.mediaRecorder.addEventListener("dataavailable", done, { once: true });
          this.mediaRecorder.requestData();
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
    }
    if (this.videoChunks.length === 0) {
      return null;
    }
    const blob = new Blob(this.videoChunks, { type: this.videoMime ?? "video/webm" });
    return dataUrlFromBlob(blob);
  }

  async buildBundle(reason = "manual") {
    const generatedAt = nowIso();
    const logs = this.collectLogsTail();
    const videoDataUrl = await this.videoDataUrl();
    const build = this.build ?? await collectBuildAssets();
    // Frozen-animation debugging: capture per-drawable HAnim + muzzle-flash
    // truth (recoil state + the flash subobject's actual Is_Hidden flag)
    // three times ~400ms apart, so a dump shows whether flashes TOGGLE.
    let animReports = null;
    try {
      const rpc = window.CnCPort?.rpc;
      if (typeof rpc === "function") {
        animReports = [];
        for (let i = 0; i < 3; i += 1) {
          const res = await Promise.race([
            rpc("realEngineAnimReport", { maxEntries: 40 }),
            new Promise((resolve) => setTimeout(() => resolve(null), 3_000)),
          ]);
          animReports.push({ t: Date.now(), report: res?.report ?? res ?? null });
          if (i < 2) {
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
        }
      }
    } catch (error) {
      animReports = { error: error instanceof Error ? error.message : String(error) };
    }
    const bundle = {
      schema: "cnc.issue-dump.v1",
      id: this.id,
      reason,
      generatedAt,
      manifest: {
        id: this.id,
        createdAt: this.startedAt,
        generatedAt,
        wallClock: {
          generatedAt,
          localString: new Date().toString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        },
        build,
        browser: collectBrowserMetadata(this.canvas),
        session: {
          ...this.session,
          recordingActive: this.recording,
          pageUrl: window.location.href,
          query: Object.fromEntries(new URLSearchParams(window.location.search)),
          archiveSpecs: this.archiveSpecs,
          archives: typeof this.buildArchives === "function" ? this.buildArchives() : null,
          configuredDiagLevel: this.getConfiguredDiagLevel?.() ?? null,
        },
        counts: {
          events: this.events.length,
          frameSamples: this.frameSamples.length,
          issues: this.issues.length,
          logs: logs.length,
          videoBytes: this.videoBytes,
        },
      },
      replay: {
        kind: "input-event-replay",
        pageUrl: window.location.href,
        shellMap: this.session.shellMap,
        diagLevel: this.session.diagLevel,
        archiveSpecs: this.archiveSpecs,
        startFrame: this.frameSamples[0]?.frame?.framesCompleted ?? 0,
        issueFrames: this.issues.map((issue) => ({
          id: issue.id,
          frame: issue.markerFrame,
          title: issue.title,
        })),
        note: "Replay helper reboots the harness and replays captured input events by engine frame. Exact deterministic state still depends on the original engine replay/save ownership.",
      },
      timeline: this.events,
      frameSamples: this.frameSamples,
      animReports,
      animReportSamples: this.animReportSamples,
      issues: this.issues,
      logs,
      media: {
        video: videoDataUrl
          ? {
              mime: parseDataUrlMime(videoDataUrl),
              bytesApprox: dataUrlSizeBytes(videoDataUrl),
              dataUrl: videoDataUrl,
            }
          : null,
      },
    };
    return bundle;
  }

  async persistDraft(reason = "draft") {
    try {
      const bundle = await this.buildBundle(reason);
      const record = {
        id: this.id,
        updatedAt: nowIso(),
        reason,
        issueCount: this.issues.length,
        eventCount: this.events.length,
        bundle,
      };
      const result = await putStoredDump(record);
      this.lastPersist = result.ok ? record.updatedAt : null;
      if (result.ok) {
        this.record("storage.persisted", {
          reason,
          issueCount: this.issues.length,
        });
      }
    } catch (error) {
      this.record("storage.error", {
        reason,
        error: error instanceof Error ? error.message : String(error),
      }, { force: true });
    }
  }

  async downloadDump(reason = "manual") {
    this.setStatus("building dump");
    const bundle = await this.buildBundle(reason);
    const text = JSON.stringify(bundle, null, 2);
    const filename = `${sanitizeDumpFileName(`${this.id}-${reason}`)}.cncdump.json`;
    downloadBlob(new Blob([text], { type: "application/json" }), filename);
    this.record("dump.download", {
      reason,
      filename,
      bytes: text.length,
    }, { force: true });
    await this.persistDraft("download");
    this.setStatus(`downloaded ${filename}`);
  }

  async uploadDump(reason = "manual") {
    this.setStatus("uploading dump");
    const bundle = await this.buildBundle(reason);
    const text = JSON.stringify(bundle, null, 2);
    const filename = `${sanitizeDumpFileName(`${this.id}-${reason}`)}.cncdump.json`;
    try {
      const response = await fetch("/__cnc_issue_dump", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cnc-dump-name": filename,
        },
        body: text,
      });
      const result = await response.json().catch(() => ({ ok: response.ok }));
      this.record("dump.upload", {
        ok: response.ok,
        status: response.status,
        filename,
        result,
      }, { force: true });
      this.setStatus(response.ok ? `uploaded ${result.path ?? filename}` : `upload failed ${response.status}`);
    } catch (error) {
      this.record("dump.upload-error", {
        filename,
        error: error instanceof Error ? error.message : String(error),
      }, { force: true });
      this.setStatus("upload unavailable");
    }
  }

  refreshStatus() {
    if (!this.statusNode) {
      return;
    }
    const label = this.recording ? "rec" : "idle";
    this.statusNode.textContent = `${label} ${this.events.length}e ${this.issues.length}i`;
  }

  setStatus(text) {
    if (this.statusNode) {
      this.statusNode.textContent = text;
    }
  }
}
