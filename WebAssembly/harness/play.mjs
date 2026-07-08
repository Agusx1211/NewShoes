// Human-driveable boot for the real cnc-port engine: replays the same RPC
// sequence the startup-vertical harness uses (mount whole-file archive set ->
// realEngineInit -> realEngineFrame loop). Mouse/keyboard/touch input already
// flows through bridge.js canvas listeners into the engine's Win32 queue.

import { createIssueRecorder } from "./issue-recorder.mjs";

const archiveSpecs = [
  { name: "INIZH.big" },
  { name: "EnglishZH.big" },
  { name: "WindowZH.big" },
  { name: "MapsZH.big" },
  { name: "MusicZH.big" },
  { name: "GensecZH.big" },
  { name: "TerrainZH.big" },
  { name: "TexturesZH.big" },
  { name: "W3DZH.big" },
  { name: "W3DEnglishZH.big" },
  { name: "SpeechZH.big" },
  { name: "SpeechEnglishZH.big" },
  { name: "AudioZH.big" },
  { name: "AudioEnglishZH.big" },
  { name: "ShadersZH.big" },
  { name: "ZZBase_INI.big", sourceName: "INI.big" },
  { name: "LooseScripts.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "ZZBase_Audio.big", sourceName: "base-generals/Audio.big" },
  { name: "ZZBase_AudioEnglish.big", sourceName: "base-generals/AudioEnglish.big" },
  { name: "ZZBase_Speech.big", sourceName: "base-generals/Speech.big" },
  { name: "ZZBase_SpeechEnglish.big", sourceName: "base-generals/SpeechEnglish.big" },
  { name: "ZZBase_Maps.big", sourceName: "base-generals/Maps.big" },
  { name: "Gensec.big" },
];

const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start");
const progressNode = document.querySelector("#progress");
const fpsNode = document.querySelector("#fps");
const hudNode = document.querySelector("#hud");
const gearButton = document.querySelector("#gearButton");
const queryParams = new URLSearchParams(window.location.search);
const viewportCanvas = document.querySelector("#viewport");
const selectedDistDir = selectedCncPortDistDir();

// Persisted launcher settings (chosen before the game boots and re-applied on
// every load). localStorage may be unavailable (privacy mode) so all access is
// guarded and silently degrades to in-memory defaults.
const LAUNCHER_SETTINGS_KEY = "cncPortLauncherSettings.v1";

function loadLauncherSettings() {
  try {
    const raw = window.localStorage?.getItem(LAUNCHER_SETTINGS_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLauncherSettings(patch) {
  try {
    const next = { ...loadLauncherSettings(), ...patch };
    window.localStorage?.setItem(LAUNCHER_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Persistence unavailable; keep going with in-memory selection only.
  }
}

const DEFAULT_LOGIC_FPS = 30;
const DEFAULT_CATCHUP_FRAMES = 2;

function positiveNumberParam(name, fallback) {
  const value = Number(queryParams.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function validCncPortDistDir(value) {
  return typeof value === "string" && /^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value);
}

function selectedCncPortDistDir() {
  const value = queryParams.get("dist") || "dist-release";
  return validCncPortDistDir(value) ? value : "dist-release";
}

let configuredDiagLevel = "full";

function setConfiguredDiagLevel(level, { updateBridge = true } = {}) {
  if (level !== "full" && level !== "lite") {
    return configuredDiagLevel;
  }
  configuredDiagLevel = level;
  if (updateBridge && typeof window.__cncSetDiagLevel === "function") {
    window.__cncSetDiagLevel(level);
  }
  return configuredDiagLevel;
}

const issueRecorder = createIssueRecorder({
  canvas: viewportCanvas,
  archiveSpecs,
  buildArchives,
  statusNode: document.querySelector("#dumpStatus"),
  getConfiguredDiagLevel: () => configuredDiagLevel,
  setConfiguredDiagLevel,
  controls: {
    recordToggle: document.querySelector("#recordToggle"),
    issueButton: document.querySelector("#issueButton"),
    saveDumpButton: document.querySelector("#saveDump"),
    uploadDumpButton: document.querySelector("#uploadDump"),
    detailToggle: document.querySelector("#deepCapture"),
    videoToggle: document.querySelector("#videoCapture"),
    issueModal: document.querySelector("#issueModal"),
    issueTitle: document.querySelector("#issueTitle"),
    issueComment: document.querySelector("#issueComment"),
    issueCancel: document.querySelector("#issueCancel"),
    issueSave: document.querySelector("#issueSave"),
    issueClear: document.querySelector("#issueClear"),
    issueColor: document.querySelector("#issueColor"),
    issueStroke: document.querySelector("#issueStroke"),
    screenshotCanvas: document.querySelector("#issueScreenshotCanvas"),
    annotationCanvas: document.querySelector("#issueAnnotationCanvas"),
  },
});
const recorderReady = issueRecorder.init();
window.CnCIssueRecorder = issueRecorder;

function report(message) {
  progressNode.textContent = message;
  progressNode.classList.remove("error");
}

function fail(message, detail) {
  console.error("[play]", message, detail ?? "");
  issueRecorder.noteFailure(message, detail);
  progressNode.textContent = `FAILED: ${message}`;
  progressNode.classList.add("error");
  startButton.disabled = false;
}

async function waitForRpc() {
  for (let i = 0; i < 600; i += 1) {
    if (window.CnCPort?.rpc) {
      return window.CnCPort.rpc.bind(window.CnCPort);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("bridge RPC surface never appeared");
}

function buildArchives() {
  return archiveSpecs.map((spec) => {
    const sourceName = spec.sourceName ?? spec.name;
    return {
      name: spec.name,
      sourceName,
      url: new URL(`../artifacts/real-assets/${sourceName}`, window.location.href).href,
    };
  });
}

async function runFrameLoop(rpc) {
  const logicFps = Math.min(240, positiveNumberParam("logicFps", DEFAULT_LOGIC_FPS));
  const logicFrameMs = 1000 / logicFps;
  const maxCatchupFrames = Math.max(
    1,
    Math.min(8, Math.floor(positiveNumberParam("catchup", DEFAULT_CATCHUP_FRAMES))),
  );
  const maxAccumulatedMs = logicFrameMs * maxCatchupFrames;
  let lastAnimationStamp = null;
  let lastTickStamp = performance.now();
  let lastFramesCompleted = null;
  let lastEngineFrameMs = 0;
  let accumulatedMs = logicFrameMs;
  let smoothedFps = 0;
  let running = true;

  const step = async (animationStamp) => {
    if (!running) {
      return;
    }
    const stamp = Number.isFinite(animationStamp) ? animationStamp : performance.now();
    const elapsedMs = lastAnimationStamp === null ? 0 : Math.max(0, stamp - lastAnimationStamp);
    lastAnimationStamp = stamp;
    accumulatedMs = Math.min(accumulatedMs + elapsedMs, maxAccumulatedMs);

    const dueFrames = Math.floor(accumulatedMs / logicFrameMs);
    const catchupLimit = lastEngineFrameMs > logicFrameMs ? 1 : maxCatchupFrames;
    const framesToRun = Math.min(catchupLimit, dueFrames);
    if (framesToRun <= 0) {
      requestAnimationFrame(step);
      return;
    }
    accumulatedMs -= framesToRun * logicFrameMs;

    let result = null;
    try {
      // The original execute loop caps update cadence at the INI FPS limit.
      // RPC stepping bypasses that limiter, so pace the human page here until
      // the runtime owns a browser main loop; the recorder can occasionally
      // swap in the richer frame-summary RPC for issue evidence.
      const command = issueRecorder.frameCommand();
      const payload = { frames: framesToRun };
      const startedAt = performance.now();
      result = await rpc(command, payload);
      issueRecorder.noteFrame(command, payload, result, performance.now() - startedAt);
      if (result?.ok !== true) {
        running = false;
        fail("engine frame failed", result);
        return;
      }
    } catch (error) {
      running = false;
      fail("engine frame threw", error);
      return;
    }

    const now = performance.now();
    const reportedFrameMs = Number(result?.frame?.lastFrameMs);
    lastEngineFrameMs = Number.isFinite(reportedFrameMs)
      ? reportedFrameMs
      : (now - lastTickStamp) / Math.max(1, framesToRun);
    const framesCompleted = Number(result?.frame?.framesCompleted);
    let completedDelta = framesToRun;
    if (Number.isFinite(framesCompleted)) {
      if (lastFramesCompleted !== null && framesCompleted >= lastFramesCompleted) {
        completedDelta = framesCompleted - lastFramesCompleted;
      }
      lastFramesCompleted = framesCompleted;
    }
    if (completedDelta > 0) {
      const instant = (completedDelta * 1000) / Math.max(1, now - lastTickStamp);
      smoothedFps = smoothedFps === 0 ? instant : smoothedFps * 0.9 + instant * 0.1;
      fpsNode.textContent = smoothedFps.toFixed(1);
    }
    lastTickStamp = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function start() {
  startButton.disabled = true;
  try {
    await recorderReady;
    report("waiting for wasm bridge...");
    const rawRpc = await waitForRpc();
    const rpc = issueRecorder.setRpc(rawRpc);
    activeRpc = rpc;
    const startAudioRuntime = await rpc("resumeBrowserAudioRuntime", {
      trigger: "play.start",
    }).catch((error) => ({ ok: false, error: error?.message ?? String(error) }));
    const startAudioMixer = await rpc("setBrowserAudioMixerVolumes", {
      trigger: "play.start",
    }).catch((error) => ({ ok: false, error: error?.message ?? String(error) }));

    // The human-playable page runs graphics diagnostics in "lite" mode: skip the
    // per-draw readPixels GPU syncs / probe objects / draw-history that the
    // regression harness needs but the player does not. Add ?diag=full to
    // restore full diagnostics for debugging.
    const diagParam = queryParams.get("diag");
    if (diagParam !== "full") {
      setConfiguredDiagLevel("lite");
    } else {
      setConfiguredDiagLevel("full");
    }
    issueRecorder.setSessionContext({
      phase: "starting",
      diagLevel: configuredDiagLevel,
      distDir: selectedDistDir,
      pageParams: Object.fromEntries(queryParams),
      audio: {
        runtime: startAudioRuntime?.browserAudioRuntime ?? startAudioRuntime,
        mixer: startAudioMixer?.browserAudioMixerRuntime ?? startAudioMixer,
      },
    });

    report(`downloading + mounting ${archiveSpecs.length} archives (~1.6 GB, be patient)...`);
    const mount = await rpc("mountArchives", {
      path: "/assets/real-init",
      verifyEach: false,
      archives: buildArchives(),
    });
    if (mount?.archiveSet?.archiveCount !== archiveSpecs.length) {
      fail("archive mount failed", mount?.error ?? mount?.archiveSet);
      return;
    }
    issueRecorder.setSessionContext({
      phase: "archives-mounted",
      archiveMount: {
        path: mount.path ?? "/assets/real-init",
        archiveCount: mount.archiveSet?.archiveCount,
        bytes: mount.archiveSet?.bytes,
        names: mount.archiveSet?.archives?.map((archive) => archive.name),
      },
    });

    const shellMap = queryParams.get("shellmap") !== "0";
    issueRecorder.setSessionContext({ shellMap });
    report(`running real GameEngine::init() (~10-30s, shell map ${shellMap ? "on" : "off"})...`);
    const init = await rpc("realEngineInit", { runDirectory: "/assets/real-init", shellMap });
    if (init?.ok !== true || init?.frontier?.initReturned !== true) {
      fail("real engine init failed", init);
      return;
    }
    issueRecorder.setSessionContext({
      phase: "engine-initialized",
      init: {
        ok: init.ok,
        initReturned: init.frontier?.initReturned,
        subsystemCount: init.frontier?.subsystemsCompleted,
      },
    });

    // The original menu waits for mouse movement before finishing its
    // first-run reveal transition; post two synthetic moves so the buttons
    // appear without the player having to wiggle the cursor first.
    for (const point of [{ x: 32, y: 32 }, { x: 96, y: 96 }]) {
      await rpc("postMessage", {
        message: 0x0200,
        lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
        point,
      });
      await rpc("realEngineFrame", { frames: 2 });
    }

    report("");
    overlay.classList.add("hidden");
    hudNode?.classList.remove("hidden");
    gearButton?.classList.remove("hidden");
    issueRecorder.setSessionContext({ phase: "running" });
    viewportCanvas.focus();
    initDisplayControls();
    // Apply the resolution / fullscreen the player chose on the launcher before
    // booting. The live in-game select already carries the persisted value
    // (initDisplayControls seeds it), so drive the EXISTING apply path; do not
    // reimplement the resize logic here.
    await applyLauncherIntentOnBoot();
    if (new URLSearchParams(window.location.search).get("replay") === "1") {
      issueRecorder.setSessionContext({ phase: "replay-ready" });
      return;
    }
    await runFrameLoop(rpc);
  } catch (error) {
    fail(error?.message ?? String(error), error);
  }
}

startButton.addEventListener("click", () => {
  void start();
});

if (queryParams.get("autostart") === "1") {
  void start();
}

// --- "Build: N min ago" indicator -------------------------------------------
// Polls both wasm and bridge.js Last-Modified values via HEAD so a glance
// tells whether Codex shipped something new since this page loaded.
const buildAgeNode = document.querySelector("#buildAge");
let firstSeenBuildMs = null;

function relativeAge(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) {
    return `${s}s ago`;
  }
  if (s < 3600) {
    return `${Math.round(s / 60)} min ago`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  return `${Math.round(s / 86400)}d ago`;
}

async function headLastModifiedMs(url) {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    const lastModified = head.headers.get("last-modified");
    return lastModified ? Date.parse(lastModified) : null;
  } catch {
    return null;
  }
}

async function refreshBuildAge() {
  try {
    const [wasmBuiltMs, bridgeBuiltMs] = await Promise.all([
      headLastModifiedMs(new URL(`../${selectedDistDir}/cnc-port.wasm`, window.location.href)),
      headLastModifiedMs(new URL("./bridge.js", window.location.href)),
    ]);
    const builtMs = Math.max(wasmBuiltMs ?? 0, bridgeBuiltMs ?? 0);
    if (builtMs === 0) {
      buildAgeNode.textContent = "?";
      return;
    }
    if (firstSeenBuildMs === null) {
      firstSeenBuildMs = builtMs;
    }
    buildAgeNode.title = `${selectedDistDir}/cnc-port.wasm, bridge.js\n${new Date(builtMs).toLocaleString()}`;
    if (builtMs > firstSeenBuildMs) {
      buildAgeNode.textContent = `${relativeAge(Date.now() - builtMs)} — NEW, reload`;
      buildAgeNode.classList.add("fresh");
    } else {
      buildAgeNode.textContent = relativeAge(Date.now() - builtMs);
    }
  } catch {
    buildAgeNode.textContent = "?";
  }
}
void refreshBuildAge();
setInterval(refreshBuildAge, 30_000);

// --- built-in console --------------------------------------------------------
// Renders the tail of the live harness log (window.CnCPort.state.logs, which
// includes wasm stdout lines like "cnc-port: ...") in an overlay panel.
const consolePanel = document.querySelector("#consolePanel");
const consoleToggle = document.querySelector("#consoleToggle");
let consoleTimer = null;

function formatLogEntry(entry) {
  const time = typeof entry.time === "string" ? entry.time.slice(11, 19) : "";
  let data = "";
  if (entry.data != null) {
    if (typeof entry.data.text === "string") {
      data = ` ${entry.data.text}`;
    } else {
      try {
        data = ` ${JSON.stringify(entry.data)}`;
        if (data.length > 240) {
          data = `${data.slice(0, 240)}…`;
        }
      } catch {
        data = "";
      }
    }
  }
  return `${time} ${entry.message}${data}`;
}

function renderConsole() {
  const logs = window.CnCPort?.state?.logs ?? [];
  const tail = logs.slice(-250);
  const atBottom = consolePanel.scrollHeight - consolePanel.scrollTop - consolePanel.clientHeight < 24;
  consolePanel.textContent = tail.map(formatLogEntry).join("\n") || "(no log entries yet)";
  if (atBottom) {
    consolePanel.scrollTop = consolePanel.scrollHeight;
  }
}

function toggleConsole() {
  const show = consolePanel.classList.contains("hidden");
  consolePanel.classList.toggle("hidden", !show);
  if (show) {
    renderConsole();
    consolePanel.scrollTop = consolePanel.scrollHeight;
    consoleTimer = setInterval(renderConsole, 1000);
  } else if (consoleTimer) {
    clearInterval(consoleTimer);
    consoleTimer = null;
  }
}

function keyboardEventBelongsToEditableTarget(event) {
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

consoleToggle.addEventListener("click", toggleConsole);
window.addEventListener("keydown", (event) => {
  if (keyboardEventBelongsToEditableTarget(event)) {
    return;
  }
  if (event.key === "`" && !event.repeat) {
    toggleConsole();
  }
});

// --- resolution selector + fullscreen ---------------------------------------
// The engine renders at a logical resolution (TheDisplay, default 800x600);
// bridge.js's "setEngineResolution" RPC drives the real display-mode-change
// path (W3DDisplay::setDisplayMode -> WW3D::Set_Device_Resolution + 2D
// projection + GUI reflow) and resizes the WebGL2 backing store to match. This
// selector exposes the stock 800x600 plus a live-updating "Native" entry that
// tracks the tab's real pixel size (CSS px x devicePixelRatio) so the game can
// render at the display's native resolution instead of one fixed default.
let activeRpc = null;
let displayControlsReady = false;
let applyingResolution = false;
// Selection to restore when leaving fullscreen (fullscreen auto-applies a
// screen-matched native resolution, so we remember what the player had picked).
let preFullscreenSelectValue = null;

// The in-game (live) select is the canonical resolution control the existing
// apply path reads. The launcher select is a pre-game mirror that seeds this
// one before boot; both are populated with the same option ladder and kept in
// sync so a change in one reflects in the other.
const resolutionSelect = document.querySelector("#resolutionSelectLive");
const launcherResolutionSelect = document.querySelector("#resolutionSelect");
const fullscreenToggle = document.querySelector("#fullscreenToggle");
const fullscreenButton = document.querySelector("#fullscreenButton");
const fullscreenTarget = document.querySelector(".shell") || document.body;

// Stock preset resolutions the original game ships (Display.cpp populates the
// same 4:3/widescreen ladder). Kept modest so the default entry is the real
// engine default. "Native" is generated separately and always first-class.
const PRESET_RESOLUTIONS = [
  { width: 800, height: 600, label: "800 x 600 (default)" },
  { width: 1024, height: 768, label: "1024 x 768" },
  { width: 1280, height: 720, label: "1280 x 720" },
  { width: 1280, height: 1024, label: "1280 x 1024" },
  { width: 1600, height: 900, label: "1600 x 900" },
  { width: 1920, height: 1080, label: "1920 x 1080" },
];

function nativePixelSize() {
  // CSS pixels the canvas actually occupies x devicePixelRatio => the display's
  // real pixel grid, so rendering at this size is 1:1 sharp (no upscale blur).
  const rect = viewportCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = rect.width || window.innerWidth || 800;
  const cssHeight = rect.height || window.innerHeight || 600;
  return {
    width: Math.max(640, Math.round(cssWidth * dpr)),
    height: Math.max(480, Math.round(cssHeight * dpr)),
  };
}

function fullscreenPixelSize() {
  // The real fullscreen display resolution. Prefer the fullscreen element's own
  // client box (matches what the canvas actually occupies once CSS applies);
  // fall back to screen.* which is reliable the instant fullscreenchange fires,
  // before layout settles. Both x devicePixelRatio for the true pixel grid.
  const dpr = window.devicePixelRatio || 1;
  const el = fullscreenElement() || fullscreenTarget;
  const cssWidth = (el && el.clientWidth) || window.screen?.width || window.innerWidth || 800;
  const cssHeight = (el && el.clientHeight) || window.screen?.height || window.innerHeight || 600;
  return {
    width: Math.max(640, Math.round(cssWidth * dpr)),
    height: Math.max(480, Math.round(cssHeight * dpr)),
  };
}

// Apply a specific pixel size directly (used by the fullscreen auto-native path,
// which must not depend on the hidden selector's current value).
async function applyResolutionSize(width, height) {
  if (!activeRpc || applyingResolution) {
    return;
  }
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  if (w < 1 || h < 1) {
    return;
  }
  applyingResolution = true;
  try {
    const result = await activeRpc("setEngineResolution", { width: w, height: h });
    if (result?.ok !== true) {
      console.warn("[play] setEngineResolution (fullscreen) failed", result?.error ?? result);
    }
  } catch (error) {
    console.warn("[play] setEngineResolution (fullscreen) threw", error);
  } finally {
    applyingResolution = false;
  }
}

// Every resolution <select> on the page (the in-game live one + the launcher
// mirror) shares the same option ladder and a live-updating Native entry.
function resolutionSelects() {
  return [resolutionSelect, launcherResolutionSelect].filter(Boolean);
}

function refreshNativeOptionFor(select) {
  if (!select) {
    return;
  }
  const native = nativePixelSize();
  const option = select.querySelector('option[data-native="1"]');
  if (option) {
    option.value = `native:${native.width}x${native.height}`;
    option.textContent = `Native (${native.width} x ${native.height})`;
  }
}

function refreshNativeOption() {
  for (const select of resolutionSelects()) {
    refreshNativeOptionFor(select);
  }
}

function populateResolutionOptionsInto(select, preferredValue) {
  if (!select) {
    return;
  }
  select.textContent = "";
  const native = nativePixelSize();
  const nativeOption = document.createElement("option");
  nativeOption.dataset.native = "1";
  nativeOption.value = `native:${native.width}x${native.height}`;
  nativeOption.textContent = `Native (${native.width} x ${native.height})`;
  select.appendChild(nativeOption);
  for (const preset of PRESET_RESOLUTIONS) {
    const option = document.createElement("option");
    option.value = `${preset.width}x${preset.height}`;
    option.textContent = preset.label;
    select.appendChild(option);
  }
  applySelectValue(select, preferredValue ?? "800x600");
}

// Set a select's value tolerating the live "native:WxH" string (whose numeric
// suffix changes with the tab size): a stored "native" intent maps onto the
// current Native option regardless of its live value.
function applySelectValue(select, value) {
  if (!select) {
    return;
  }
  if (value === "native") {
    const nativeOption = select.querySelector('option[data-native="1"]');
    if (nativeOption) {
      select.value = nativeOption.value;
      return;
    }
  }
  const hasOption = Array.from(select.options).some((option) => option.value === value);
  select.value = hasOption ? value : "800x600";
}

// Canonical, storage-safe representation of a select's current choice: "native"
// for the live-sizing native option, else the plain "WxH" preset string.
function selectStorageValue(select) {
  if (!select) {
    return "800x600";
  }
  const value = select.value || "";
  return value.startsWith("native:") ? "native" : value;
}

function populateResolutionOptions() {
  const stored = loadLauncherSettings();
  const preferred = typeof stored.resolution === "string" ? stored.resolution : "800x600";
  populateResolutionOptionsInto(resolutionSelect, preferred);
  populateResolutionOptionsInto(launcherResolutionSelect, preferred);
}

function selectedResolution() {
  const value = resolutionSelect ? resolutionSelect.value : "";
  if (typeof value !== "string") {
    return null;
  }
  const raw = value.startsWith("native:") ? value.slice("native:".length) : value;
  const match = /^(\d+)x(\d+)$/.exec(raw);
  if (!match) {
    return null;
  }
  return { width: Number(match[1]), height: Number(match[2]), isNative: value.startsWith("native:") };
}

async function applySelectedResolution() {
  if (!activeRpc || applyingResolution) {
    return;
  }
  const target = selectedResolution();
  if (!target) {
    return;
  }
  applyingResolution = true;
  try {
    const result = await activeRpc("setEngineResolution", {
      width: target.width,
      height: target.height,
    });
    if (result?.ok !== true) {
      console.warn("[play] setEngineResolution failed", result?.error ?? result);
    }
  } catch (error) {
    console.warn("[play] setEngineResolution threw", error);
  } finally {
    applyingResolution = false;
  }
}

// --- fullscreen -------------------------------------------------------------
function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function fullscreenSupported() {
  return Boolean(
    fullscreenTarget.requestFullscreen ||
    fullscreenTarget.webkitRequestFullscreen ||
    viewportCanvas.webkitRequestFullscreen,
  );
}

async function enterFullscreen() {
  // Prefer the standard API; fall back to the webkit-prefixed path for older
  // Safari. iPad Safari only exposes element.webkitRequestFullscreen on <video>
  // (not arbitrary elements), so this may reject there -> handled by hiding the
  // button when unsupported.
  const el = fullscreenTarget;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (viewportCanvas.webkitRequestFullscreen) {
      viewportCanvas.webkitRequestFullscreen();
    }
  } catch (error) {
    console.warn("[play] requestFullscreen failed", error);
  }
}

async function exitFullscreen() {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  } catch (error) {
    console.warn("[play] exitFullscreen failed", error);
  }
}

function onFullscreenChange() {
  const active = Boolean(fullscreenElement());
  if (fullscreenButton) {
    fullscreenButton.classList.toggle("active", active);
    fullscreenButton.textContent = active ? "exit full" : "fullscreen";
  }
  // Toggle an explicit class alongside the :fullscreen selector so the chrome
  // (toolbar / borders) is dropped and the canvas fills the screen on black.
  // Belt-and-suspenders for browsers that scope :fullscreen to the element only.
  fullscreenTarget.classList.toggle("is-fullscreen", active);
  refreshNativeOption();

  if (active) {
    // Entering fullscreen: remember the player's selection, then auto-apply a
    // native resolution matched to the real fullscreen display size so the
    // engine renders at full-screen resolution and the game fills the display
    // at correct aspect (no upscale blur, no letterbox-in-gray).
    if (preFullscreenSelectValue === null && resolutionSelect) {
      // Store the native option by its stable prefix, not its live "native:WxH"
      // value (that string changes as the size updates).
      preFullscreenSelectValue = selectedResolution()?.isNative
        ? "native"
        : resolutionSelect.value;
    }
    const size = fullscreenPixelSize();
    void applyResolutionSize(size.width, size.height);
  } else {
    // Exiting fullscreen: restore the previously-selected resolution so the
    // windowed layout returns to exactly what the player had.
    const restore = preFullscreenSelectValue;
    preFullscreenSelectValue = null;
    // Refresh Native to the windowed size first so its value is current.
    refreshNativeOption();
    if (restore !== null && resolutionSelect) {
      if (restore === "native") {
        const nativeOption = resolutionSelect.querySelector('option[data-native="1"]');
        if (nativeOption) {
          resolutionSelect.value = nativeOption.value;
        }
      } else {
        resolutionSelect.value = restore;
      }
    }
    void applySelectedResolution();
  }
}

// --- live tracking of tab size / DPR ----------------------------------------
let resizeSettleTimer = null;
function onViewportGeometryChange() {
  refreshNativeOption();
  if (resizeSettleTimer) {
    clearTimeout(resizeSettleTimer);
  }
  // Debounce: only push a new engine resolution once the resize settles, so a
  // window drag does not spam display-mode changes (each recreates the shell).
  resizeSettleTimer = setTimeout(() => {
    resizeSettleTimer = null;
    if (selectedResolution()?.isNative) {
      void applySelectedResolution();
    }
  }, 350);
}

function initDisplayControls() {
  if (displayControlsReady || !resolutionSelect) {
    return;
  }
  displayControlsReady = true;
  populateResolutionOptions();

  resolutionSelect.addEventListener("change", () => {
    // Mirror the choice onto the launcher select + persist, then drive the
    // existing live-apply path.
    applySelectValue(launcherResolutionSelect, selectStorageValue(resolutionSelect));
    saveLauncherSettings({ resolution: selectStorageValue(resolutionSelect) });
    void applySelectedResolution();
  });

  if (fullscreenButton) {
    if (!fullscreenSupported()) {
      // Degrade gracefully: hide the button where fullscreen is unavailable
      // (e.g. iPad Safari for non-video elements) so desktop keeps it.
      fullscreenButton.classList.add("hidden");
    } else {
      fullscreenButton.addEventListener("click", () => {
        if (fullscreenElement()) {
          void exitFullscreen();
        } else {
          void enterFullscreen();
        }
      });
    }
  }

  // In-fullscreen exit affordance (no permanent bar): the button is revealed by
  // CSS on hover near the top; clicking it exits. Esc still exits too.
  const fullscreenExit = document.querySelector("#fullscreenExit");
  if (fullscreenExit) {
    fullscreenExit.addEventListener("click", () => {
      void exitFullscreen();
    });
    // Reveal the exit control when the pointer nears the top edge while
    // fullscreen, then auto-hide shortly after, so it is discoverable without
    // sitting on screen permanently.
    let revealTimer = null;
    window.addEventListener("pointermove", (event) => {
      if (!fullscreenElement()) {
        return;
      }
      if (event.clientY <= 64) {
        fullscreenTarget.classList.add("reveal-exit");
        if (revealTimer) {
          clearTimeout(revealTimer);
        }
        revealTimer = setTimeout(() => {
          fullscreenTarget.classList.remove("reveal-exit");
        }, 2000);
      }
    });
  }

  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  window.addEventListener("resize", onViewportGeometryChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onViewportGeometryChange);
  }
  // devicePixelRatio can change without a resize event (e.g. moving the window
  // to a display with a different DPR, or browser zoom). Re-arm a matchMedia
  // resolution query against the current DPR each time it fires so subsequent
  // DPR changes are still caught.
  const watchDprChange = () => {
    try {
      const dpr = window.devicePixelRatio || 1;
      const dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
      if (dprQuery && typeof dprQuery.addEventListener === "function") {
        dprQuery.addEventListener("change", () => {
          onViewportGeometryChange();
          watchDprChange();
        }, { once: true });
      }
    } catch {
      // matchMedia resolution queries unsupported; the resize / visualViewport
      // listeners still cover the common cases.
    }
  };
  watchDprChange();
}

// --- launcher (pre-game) settings + in-game settings overlay ----------------
// The launcher exposes the same display controls BEFORE the game boots. It
// stores the player's intent (resolution + start-in-fullscreen) in localStorage
// and, on boot, seeds the live select and drives the EXISTING apply path so the
// game starts at the chosen resolution (and enters fullscreen if requested).
let launcherControlsReady = false;

function initLauncherControls() {
  if (launcherControlsReady) {
    return;
  }
  launcherControlsReady = true;

  const stored = loadLauncherSettings();
  // Seed the launcher select ladder + Native entry so it is usable pre-boot.
  populateResolutionOptionsInto(
    launcherResolutionSelect,
    typeof stored.resolution === "string" ? stored.resolution : "800x600",
  );
  if (fullscreenToggle) {
    fullscreenToggle.checked = Boolean(stored.startFullscreen);
    // iPad Safari can't fullscreen arbitrary elements; hide the toggle where
    // fullscreen isn't available so it never sets an intent that can't apply.
    if (!fullscreenSupported()) {
      const row = fullscreenToggle.closest(".settingRow");
      (row ?? fullscreenToggle).classList.add("hidden");
    }
  }

  launcherResolutionSelect?.addEventListener("change", () => {
    const value = selectStorageValue(launcherResolutionSelect);
    saveLauncherSettings({ resolution: value });
    // Keep the live in-game select in step (it may already exist / be seeded).
    applySelectValue(resolutionSelect, value);
  });

  fullscreenToggle?.addEventListener("change", () => {
    saveLauncherSettings({ startFullscreen: fullscreenToggle.checked });
  });

  // Refresh the launcher Native option to the current tab size while it's shown
  // so its label reflects the real pixel grid before the player starts.
  refreshNativeOptionFor(launcherResolutionSelect);
  window.addEventListener("resize", () => {
    if (!launcherControlsReady) {
      return;
    }
    refreshNativeOptionFor(launcherResolutionSelect);
  });
}

async function applyLauncherIntentOnBoot() {
  const stored = loadLauncherSettings();
  // Seed the live select from the persisted choice, then drive the existing
  // apply path (unless it's the stock default, which needs no display change).
  if (typeof stored.resolution === "string" && resolutionSelect) {
    applySelectValue(resolutionSelect, stored.resolution);
    applySelectValue(launcherResolutionSelect, stored.resolution);
  }
  if (selectStorageValue(resolutionSelect) !== "800x600") {
    await applySelectedResolution();
  }
  // Enter fullscreen if the player asked for it. onFullscreenChange (owned by
  // the resize logic) then auto-applies the screen-matched native resolution.
  if (stored.startFullscreen && fullscreenSupported() && !fullscreenElement()) {
    await enterFullscreen();
  }
}

// --- in-game settings overlay (opened by the gear) --------------------------
const settingsOverlay = document.querySelector("#settingsOverlay");
const settingsClose = document.querySelector("#settingsClose");

function openSettings() {
  if (!settingsOverlay) {
    return;
  }
  refreshNativeOption();
  settingsOverlay.classList.remove("hidden");
  settingsOverlay.setAttribute("aria-hidden", "false");
}

function closeSettings() {
  if (!settingsOverlay) {
    return;
  }
  settingsOverlay.classList.add("hidden");
  settingsOverlay.setAttribute("aria-hidden", "true");
}

gearButton?.addEventListener("click", openSettings);
settingsClose?.addEventListener("click", closeSettings);
settingsOverlay?.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("[data-close-settings]")) {
    closeSettings();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && settingsOverlay && !settingsOverlay.classList.contains("hidden")) {
    // Only when the overlay is the topmost thing; the issue modal manages its
    // own Escape, and fullscreen Esc is handled by the browser.
    if (!fullscreenElement()) {
      closeSettings();
    }
  }
});

initLauncherControls();
