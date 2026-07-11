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
  { name: "ZZBase_Shaders.big", sourceName: "Shaders.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "ZZBase_Audio.big", sourceName: "base-generals/Audio.big" },
  { name: "ZZBase_AudioEnglish.big", sourceName: "base-generals/AudioEnglish.big" },
  { name: "ZZBase_Speech.big", sourceName: "base-generals/Speech.big" },
  { name: "ZZBase_SpeechEnglish.big", sourceName: "base-generals/SpeechEnglish.big" },
  { name: "ZZBase_Maps.big", sourceName: "base-generals/Maps.big" },
  { name: "Gensec.big" },
];

const overlay = document.querySelector("#launchOverlay");
const startButton = document.querySelector("#start");
const progressNode = document.querySelector("#launchStatus");
const progressSentinel = document.querySelector("#progress");
const bootSentinel = document.querySelector("#overlay");
const fpsNode = document.querySelector("#fps");
const hudNode = document.querySelector("#hud");
const gearButton = document.querySelector("#gearButton");
const queryParams = new URLSearchParams(window.location.search);
const networkRoomNode = document.querySelector("#networkRoom");
const networkNameNode = document.querySelector("#networkName");
const networkSignalingNode = document.querySelector("#networkSignaling");
const networkStunNode = document.querySelector("#networkStun");
const networkIceUsernameNode = document.querySelector("#networkIceUsername");
const networkIceCredentialNode = document.querySelector("#networkIceCredential");
const networkStatusNode = document.querySelector("#networkStatus");
const NETWORK_SETTINGS_KEY = "cncPortNetworkSettings.v1";

function defaultSignalingUrl() {
  const url = new URL("/webrtc", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

function loadNetworkSettings() {
  let stored = {};
  try {
    stored = JSON.parse(window.localStorage?.getItem(NETWORK_SETTINGS_KEY) ?? "{}") ?? {};
  } catch {
    stored = {};
  }
  return {
    room: queryParams.get("room") ?? stored.room ?? "",
    name: queryParams.get("peer") ?? stored.name ?? "",
    signalingUrl: queryParams.get("signal") ?? stored.signalingUrl ?? defaultSignalingUrl(),
    iceServerUrl: queryParams.get("ice") ?? stored.iceServerUrl ?? "",
    iceUsername: queryParams.get("iceUser") ?? stored.iceUsername ?? "",
    iceCredential: "",
  };
}

function networkSettingsFromInputs() {
  return {
    room: networkRoomNode?.value.trim() ?? "",
    name: networkNameNode?.value.trim() ?? "",
    signalingUrl: networkSignalingNode?.value.trim() || defaultSignalingUrl(),
    iceServerUrl: networkStunNode?.value.trim() ?? "",
    iceUsername: networkIceUsernameNode?.value ?? "",
    iceCredential: networkIceCredentialNode?.value ?? "",
  };
}

function initializeNetworkSettings() {
  const settings = loadNetworkSettings();
  if (networkRoomNode) networkRoomNode.value = settings.room;
  if (networkNameNode) networkNameNode.value = settings.name;
  if (networkSignalingNode) networkSignalingNode.value = settings.signalingUrl;
  if (networkStunNode) networkStunNode.value = settings.iceServerUrl;
  if (networkIceUsernameNode) networkIceUsernameNode.value = settings.iceUsername;
  if (networkIceCredentialNode) networkIceCredentialNode.value = settings.iceCredential;
}

function saveNetworkSettings(settings) {
  try {
    const { iceCredential: _ephemeralCredential, ...persisted } = settings;
    window.localStorage?.setItem(NETWORK_SETTINGS_KEY, JSON.stringify(persisted));
  } catch {
    // Storage is optional; the current launch still uses the entered values.
  }
}

initializeNetworkSettings();
// Engine-thread mode: the engine runs on a pthread in the threaded build and
// bridge.js moves the frame loop into the worker realm; this page only
// observes (status events drive the HUD). The play page is THREADED-ONLY
// (owner directive 2026-07-10; the ?threads=0 legacy escape hatch was
// deleted after the owner confirmed the HTTPS threaded experience). Must
// match bridge.js's cncPortThreadedMode / defaultCncPortDistDir logic.
// Declared before the selectedCncPortDistDir() call below (TDZ).
//
// The pthread build needs SharedArrayBuffer, which only exists on
// cross-origin-isolated pages — and COOP/COEP are IGNORED on untrustworthy
// origins (plain http:// over a LAN IP; only https:// and localhost count).
// NO legacy single-thread fallback: when the threaded page cannot run here,
// bridge.js redirects to the harness HTTPS listener (a trustworthy origin);
// when a redirect cannot fix it, the boot is blocked with the reason (see
// threadedUnavailable below).
// Must match bridge.js's cncPortThreadedRuntimeSupport()/cncPortThreadedMode:
// both realms decide from the same synchronous globals, so they always agree.
const threadedSupported = typeof SharedArrayBuffer === "function"
  && window.crossOriginIsolated === true;
const threadedMode = threadedSupported;
const threadedUnavailable = !threadedSupported;
const viewportCanvas = document.querySelector("#viewport");
const selectedDistDir = selectedCncPortDistDir();

// Persisted display settings (v2) — the ONE source of resolution intent:
//   { mode: "dynamic" }                     follow the window (default)
//   { mode: "fixed", width: W, height: H }  explicit resolution
// localStorage may be unavailable (privacy mode) so all access is guarded and
// silently degrades to in-memory defaults. Legacy v1 launcher settings (the
// removed launcher resolution select) migrate: an explicit non-default "WxH"
// becomes fixed; "native"/default/absent becomes dynamic.
const DISPLAY_SETTINGS_KEY = "cncPortDisplaySettings.v2";
const LEGACY_LAUNCHER_SETTINGS_KEY = "cncPortLauncherSettings.v1";

function saveDisplaySettings(settings) {
  try {
    window.localStorage?.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Persistence unavailable; keep going with the in-memory selection only.
  }
}

function loadDisplaySettings() {
  try {
    const raw = window.localStorage?.getItem(DISPLAY_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.mode === "fixed"
          && Number.isFinite(Number(parsed.width)) && Number.isFinite(Number(parsed.height))
          && Number(parsed.width) >= 2 && Number(parsed.height) >= 2) {
        return { mode: "fixed", width: Math.round(Number(parsed.width)), height: Math.round(Number(parsed.height)) };
      }
      if (parsed?.mode === "dynamic") {
        return { mode: "dynamic" };
      }
    }
    const legacyRaw = window.localStorage?.getItem(LEGACY_LAUNCHER_SETTINGS_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const match = /^(\d+)x(\d+)$/.exec(typeof legacy?.resolution === "string" ? legacy.resolution : "");
      // The v1 default was "800x600" for everyone who never touched the
      // selector; only a non-default explicit size migrates as fixed intent.
      if (match && `${match[1]}x${match[2]}` !== "800x600") {
        const migrated = { mode: "fixed", width: Number(match[1]), height: Number(match[2]) };
        saveDisplaySettings(migrated);
        return migrated;
      }
    }
  } catch {
    // Corrupt/unavailable storage: fall through to the default.
  }
  return { mode: "dynamic" };
}

const DEFAULT_LOGIC_FPS = 30;
// Display-rate client over the authentic 30Hz sim (GameEngine::update paced
// mode, run by the engine-thread loop in engine_realm_boot.mjs).
const DEFAULT_CLIENT_FPS = 60;

function positiveNumberParam(name, fallback) {
  const value = Number(queryParams.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function validCncPortDistDir(value) {
  return typeof value === "string" && /^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value);
}

function selectedCncPortDistDir() {
  // The play page serves the RELEASE threaded build: dist-threaded is a
  // Debug build (-O0, ASSERTIONS=1, JS-EH) that runs the engine several times
  // slower — comparing it against a release build is what produced the
  // phantom "worker GL throughput regression" in notes/p1-engine-thread.md
  // GATE D. An explicit ?dist= (e.g. dist-threaded for a Debug run) wins.
  const fallback = "dist-threaded-release";
  const value = queryParams.get("dist") || fallback;
  return validCncPortDistDir(value) ? value : fallback;
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
  if (progressSentinel) progressSentinel.textContent = message;
  progressNode.classList.remove("error");
  const fill = document.querySelector("#launchProgressFill");
  const mountStage = document.querySelector("#stageMount");
  const engineStage = document.querySelector("#stageEngine");
  if (/mounting/i.test(message)) {
    if (fill) fill.style.width = "38%";
    if (mountStage) mountStage.textContent = "◌ Mount";
  }
  if (/GameEngine::init/i.test(message)) {
    if (fill) fill.style.width = "74%";
    if (mountStage) {
      mountStage.textContent = "✓ Mount";
      mountStage.classList.add("is-done");
    }
    if (engineStage) engineStage.textContent = "◌ Engine";
  }
}

// --- boot progress UI (archive download/mount bar + engine-init pulse) ------
// bridge.js's mountArchives path emits "cnc-archive-progress" CustomEvents:
// { phase: "fetch"|"write"|"done", name, url, received, total, index, count }.
// Archive sizes are only known as each Content-Length arrives, so the overall
// total is shown as an estimate ("~") until every size is known. If the events
// never arrive (older bridge, worker failure) the bar simply stays empty and
// the existing #progress status text still tells the story.
const bootProgressNode = document.querySelector("#bootProgress");
const bootBarFillNode = document.querySelector("#bootBarFill");
const bootBytesNode = document.querySelector("#bootBytes");
const bootRateNode = document.querySelector("#bootRate");
const bootDetailNode = document.querySelector("#bootDetail");

const bootProgressState = {
  active: false,
  archiveCount: archiveSpecs.length,
  perArchive: new Map(), // name -> { received, total }
  rateSamples: [], // { t, bytes } sliding window for the MB/s readout
};

function beginBootProgress(archiveCount) {
  bootProgressState.active = true;
  bootProgressState.archiveCount = archiveCount;
  bootProgressState.perArchive.clear();
  bootProgressState.rateSamples.length = 0;
  if (bootBarFillNode) {
    bootBarFillNode.style.width = "0%";
  }
  if (bootBytesNode) {
    bootBytesNode.textContent = "";
  }
  if (bootRateNode) {
    bootRateNode.textContent = "";
  }
  if (bootDetailNode) {
    bootDetailNode.textContent = "";
  }
  bootProgressNode?.classList.remove("indeterminate", "hidden");
}

function bootProgressEnginePhase() {
  // Archives are all in MEMFS; GameEngine::init() has no byte counter, so
  // pulse the full bar instead of pretending a percentage.
  if (bootBarFillNode) {
    bootBarFillNode.style.width = "100%";
  }
  if (bootRateNode) {
    bootRateNode.textContent = "";
  }
  if (bootDetailNode) {
    bootDetailNode.textContent = "";
  }
  bootProgressNode?.classList.add("indeterminate");
}

function endBootProgress() {
  bootProgressState.active = false;
  bootProgressNode?.classList.add("hidden");
  bootProgressNode?.classList.remove("indeterminate");
}

function formatGb(bytes) {
  return (bytes / (1024 ** 3)).toFixed(2);
}

function bootRateBytesPerSec(receivedNow) {
  const now = performance.now();
  const samples = bootProgressState.rateSamples;
  samples.push({ t: now, bytes: receivedNow });
  while (samples.length > 2 && now - samples[0].t > 3000) {
    samples.shift();
  }
  const first = samples[0];
  const seconds = (now - first.t) / 1000;
  if (seconds < 0.3 || receivedNow < first.bytes) {
    return null;
  }
  return (receivedNow - first.bytes) / seconds;
}

function renderBootProgress(detail) {
  const name = String(detail.name ?? detail.url ?? "archive");
  const phase = String(detail.phase ?? "fetch");
  const count = Number(detail.count ?? bootProgressState.archiveCount) || bootProgressState.archiveCount;
  const ordinal = Number.isInteger(detail.index) ? `${detail.index + 1}/${count}` : "";
  const entry = bootProgressState.perArchive.get(name) ?? { received: 0, total: 0 };
  entry.received = Math.max(entry.received, Number(detail.received ?? 0) || 0);
  entry.total = Math.max(entry.total, Number(detail.total ?? 0) || 0);
  bootProgressState.perArchive.set(name, entry);

  // Overall byte totals. Archives whose Content-Length has not arrived yet
  // (or was missing) are estimated at the average known archive size, so the
  // denominator is honest-but-approximate until all sizes are in.
  let received = 0;
  let knownTotal = 0;
  let knownCount = 0;
  let unknownReceived = 0;
  let unknownCount = 0;
  for (const archive of bootProgressState.perArchive.values()) {
    received += archive.received;
    if (archive.total > 0) {
      knownTotal += archive.total;
      knownCount += 1;
    } else {
      unknownReceived += archive.received;
      unknownCount += 1;
    }
  }
  const unseenCount = Math.max(0, count - bootProgressState.perArchive.size);
  const averageKnown = knownCount > 0 ? knownTotal / knownCount : 0;
  const estimatedTotal = knownTotal
    + Math.max(unknownReceived, unknownCount * averageKnown)
    + unseenCount * averageKnown;
  const allTotalsKnown = unseenCount === 0 && unknownCount === 0;

  if (bootBarFillNode && estimatedTotal > 0) {
    const fraction = Math.max(0, Math.min(1, received / estimatedTotal));
    bootBarFillNode.style.width = `${(fraction * 100).toFixed(1)}%`;
  }
  if (bootBytesNode) {
    bootBytesNode.textContent = estimatedTotal > 0
      ? `${formatGb(received)} / ${allTotalsKnown ? "" : "~"}${formatGb(estimatedTotal)} GB`
      : "";
  }
  if (bootRateNode) {
    const rate = bootRateBytesPerSec(received);
    if (rate !== null) {
      bootRateNode.textContent = `${(rate / (1024 ** 2)).toFixed(1)} MB/s`;
    }
  }
  if (bootDetailNode) {
    if (phase === "write") {
      bootDetailNode.textContent = `mounting ${name}...`;
    } else if (phase === "done") {
      bootDetailNode.textContent = ordinal ? `mounted ${name} (${ordinal})` : `mounted ${name}`;
    } else {
      bootDetailNode.textContent = ordinal ? `downloading ${name} (${ordinal})` : `downloading ${name}`;
    }
  }
}

window.addEventListener("cnc-archive-progress", (event) => {
  if (!bootProgressState.active) {
    return;
  }
  renderBootProgress(event.detail ?? {});
});

// Owner directive 2026-07-10: the play page NEVER falls back to the legacy
// single-threaded build. When the threaded default cannot run on this origin
// (no SAB / not COI), bridge.js — which evaluates first — resolves the fix:
// redirect to the harness HTTPS listener (insecure LAN origin) or block the
// boot with instructions (https with a rejected cert / localhost without
// COOP/COEP). This block renders that state on the page and keeps start()
// from ever booting; a silent mode change is how phantom perf reports start.
function threadedBlockedMessage(detail) {
  if (window.location.protocol === "https:") {
    return "engine-thread mode is unavailable on this HTTPS origin: SharedArrayBuffer is still"
      + " missing, which usually means the harness's self-signed certificate was rejected."
      + " Click through the browser warning (Advanced → Proceed) or trust the certificate"
      + " (WebAssembly/harness/.certs/cert.pem on the server), then reload."
      + " There is no single-thread fallback.";
  }
  return `${detail?.reason ?? "engine-thread mode unavailable on this origin"}`
    + " — boot blocked; there is no single-thread fallback.";
}

if (threadedUnavailable) {
  startButton.disabled = true;
  try {
    const note = document.createElement("p");
    note.id = "threadedRedirectNote";
    note.className = "launcherProgress";
    note.style.color = "#e0b050";
    note.textContent = "engine-thread mode unavailable on this origin —"
      + " resolving the HTTPS redirect...";
    progressNode?.parentElement?.insertBefore(note, progressNode);
    const renderUnsupported = (detail) => {
      if (detail?.action === "redirect") {
        note.textContent = `redirecting to ${detail.target}`
          + " (the engine thread needs a secure origin for SharedArrayBuffer)..."
          + " Accept the self-signed certificate once if the browser warns.";
      } else if (detail?.action === "blocked") {
        note.style.color = "#e05050";
        note.textContent = threadedBlockedMessage(detail);
      }
    };
    window.addEventListener("cnc-threaded-unsupported", (event) => renderUnsupported(event.detail));
    const current = window.CnCPort?.state?.threadedUnsupported;
    if (current && current.action !== "pending") {
      renderUnsupported(current);
    }
  } catch {
    // Best-effort; bridge.js's console error/redirect still tells the story.
  }
}

function fail(message, detail) {
  console.error("[play]", message, detail ?? "");
  issueRecorder.noteFailure(message, detail);
  let detailText = "";
  try {
    detailText = typeof detail === "string" ? detail
      : detail?.error ? String(detail.error)
        : detail !== undefined && detail !== null ? JSON.stringify(detail) : "";
  } catch {
    detailText = String(detail);
  }
  if (detailText.length > 600) {
    detailText = `${detailText.slice(0, 600)}…`;
  }
  progressNode.textContent = `FAILED: ${message}${detailText ? ` — ${detailText}` : ""}`;
  if (progressSentinel) progressSentinel.textContent = progressNode.textContent;
  progressNode.classList.add("error");
  bootProgressNode?.classList.remove("indeterminate");
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
  const prepared = window.ZeroHAssetLibrary?.preparedArchives;
  if (Array.isArray(prepared) && prepared.length) {
    return prepared.map((archive) => ({ ...archive }));
  }
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
  // Stepped map loads are on by default in the wasm (startNewGame spreads its
  // steps across frames so the real load screen presents and the tab never
  // blocks). ?loadstep=0 restores the legacy synchronous load for A/B;
  // ?loadBudgetMs=N tunes the per-frame load slice budget (default 50ms).
  const params = new URLSearchParams(window.location.search);
  const loadStepParam = params.get("loadstep");
  const loadBudgetMs = Number(params.get("loadBudgetMs") ?? 0);
  if (loadStepParam === "0" || loadBudgetMs > 0) {
    try {
      const stepping = await rpc("realEngineSetLoadStepping", {
        enabled: loadStepParam !== "0",
        budgetMs: loadBudgetMs,
      });
      console.log("[play] load stepping", stepping?.stepping ?? stepping);
    } catch (error) {
      console.warn("[play] load stepping setup threw (stale build?)", error);
    }
  }

  const logicFps = Math.min(240, positiveNumberParam("logicFps", DEFAULT_LOGIC_FPS));
  const clientFps = Math.min(240, positiveNumberParam("clientFps", DEFAULT_CLIENT_FPS));
  // The paced loop runs IN the engine worker realm (engine_realm_boot.mjs,
  // driven by the pthread's rAF main loop); this page only starts it and
  // renders the status feed into the HUD.
  return runThreadedFrameLoop(rpc, clientFps, logicFps);
}

// Threaded mode: the engine thread owns the frame loop; observe its 500ms
// status posts for the client/logic HUD counter and surface loop errors.
async function runThreadedFrameLoop(rpc, clientFps, logicFps) {
  const start = await rpc("threadedStartLoop", { clientFps, logicFps });
  if (start?.ok !== true) {
    fail("threaded frame loop failed to start", start);
    return;
  }
  console.log("[play] threaded frame loop started", start.pacing ?? start);
  let previous = null;
  window.addEventListener("cncport:threadedstatus", (event) => {
    const status = event.detail;
    const loop = status?.loop;
    if (!loop) {
      return;
    }
    if (previous && loop.clientFrames >= previous.clientFrames && status.now > previous.now) {
      const seconds = (status.now - previous.now) / 1000;
      if (seconds > 0.2) {
        const client = (loop.clientFrames - previous.clientFrames) / seconds;
        const logic = (loop.logicFrames - previous.logicFrames) / seconds;
        fpsNode.textContent = `${client.toFixed(0)}/${logic.toFixed(0)}`;
      }
    }
    previous = { now: status.now, clientFrames: loop.clientFrames, logicFrames: loop.logicFrames };
  });
  window.addEventListener("cncport:threadedlooperror", (event) => {
    fail("engine thread frame loop failed", event.detail?.error ?? event.detail);
  });
}

async function start() {
  // Owner directive 2026-07-10: no legacy single-thread fallback — when the
  // threaded default cannot run on this origin the page redirects/blocks
  // (see the threadedUnavailable block above); it must never boot legacy.
  if (threadedUnavailable) {
    const detail = window.CnCPort?.state?.threadedUnsupported;
    fail("engine-thread mode unavailable on this origin",
      detail?.action === "redirect"
        ? `redirecting to ${detail.target}`
        : threadedBlockedMessage(detail));
    startButton.disabled = true;
    return;
  }
  startButton.disabled = true;
  try {
    await recorderReady;
    report("waiting for wasm bridge...");
    const rawRpc = await waitForRpc();
    const rpc = issueRecorder.setRpc(rawRpc);
    activeRpc = rpc;
    const networkSettings = networkSettingsFromInputs();
    saveNetworkSettings(networkSettings);
    let networkRuntime = null;
    if (networkSettings.room) {
      report(`joining P2P room ${networkSettings.room}...`);
      if (networkStatusNode) networkStatusNode.textContent = "Connecting signaling and WebRTC ICE...";
      const iceServers = networkSettings.iceServerUrl
        ? [{
          urls: networkSettings.iceServerUrl.split(",").map((entry) => entry.trim()).filter(Boolean),
          ...(networkSettings.iceUsername ? { username: networkSettings.iceUsername } : {}),
          ...(networkSettings.iceCredential ? { credential: networkSettings.iceCredential } : {}),
        }]
        : [];
      const networkConnect = await rpc("browserWebRtcEndpointConnect", {
        signalingUrl: networkSettings.signalingUrl,
        room: networkSettings.room,
        peerId: networkSettings.name || null,
        displayName: networkSettings.name || null,
        iceServers,
      });
      if (networkConnect?.ok !== true) {
        throw new Error(networkConnect?.error ?? "P2P room connection failed");
      }
      networkRuntime = networkConnect.runtime;
      const virtualIp = networkRuntime?.endpoint?.localIp >>> 0;
      const ipText = [24, 16, 8, 0].map((shift) => (virtualIp >>> shift) & 0xff).join(".");
      if (networkStatusNode) {
        networkStatusNode.textContent = `Joined ${networkSettings.room} as ${networkRuntime.endpoint.peerId} (${ipText}). Open Multiplayer → LAN.`;
      }
    } else if (networkStatusNode) {
      networkStatusNode.textContent = "Offline. Enter a shared room to enable WebRTC multiplayer.";
    }
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
    // Archive downloads overlap (bounded parallel streamed fetch->OPFS on
    // the IO worker). Add ?fetchpar=0 to force strictly sequential downloads
    // for debugging or regression comparison.
    if (queryParams.get("fetchpar") === "0") {
      window.__cncFetchParallel = false;
    }

    issueRecorder.setSessionContext({
      phase: "starting",
      diagLevel: configuredDiagLevel,
      distDir: selectedDistDir,
      threaded: {
        requested: true,
        supported: threadedSupported,
        mode: threadedMode,
      },
      pageParams: Object.fromEntries(queryParams),
      audio: {
        runtime: startAudioRuntime?.browserAudioRuntime ?? startAudioRuntime,
        mixer: startAudioMixer?.browserAudioMixerRuntime ?? startAudioMixer,
      },
      network: networkRuntime,
    });

    const archives = buildArchives();
    const preparedAssets = archives.every((archive) => typeof archive.opfsPath === "string");
    report(`${preparedAssets ? "mounting local" : "downloading + mounting"} ${archives.length} archives...`);
    beginBootProgress(archives.length);
    const mount = await rpc(preparedAssets ? "mountPreparedArchives" : "mountArchives", {
      path: "/assets/real-init",
      verifyEach: false,
      archives,
    });
    if (mount?.archiveSet?.archiveCount !== archives.length) {
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
    bootProgressEnginePhase();
    report(`running real GameEngine::init() (shell map ${shellMap ? "on" : "off"})...`);
    // Stepped init: GameEngine::init runs as budgeted slices that return to
    // the event loop between steps, so the overlay can paint real progress
    // (per-slice cncport:initprogress events from bridge.js) and the main
    // thread never blocks for the whole init. ?initstep=0 restores the
    // monolithic call.
    const steppedInit = queryParams.get("initstep") !== "0";
    const onInitProgress = (event) => {
      const step = event.detail ?? {};
      if (typeof step.stepIndex === "number" && typeof step.stepCount === "number") {
        const subsystems = typeof step.subsystemsCompleted === "number"
          ? `, ${step.subsystemsCompleted} subsystems`
          : "";
        report(`running real GameEngine::init() (step ${Math.min(step.stepIndex + 1, step.stepCount)}/${step.stepCount}${subsystems}, shell map ${shellMap ? "on" : "off"})...`);
      }
    };
    if (steppedInit) {
      window.addEventListener("cncport:initprogress", onInitProgress);
    }
    // Boot render resolution: the engine boots directly at the page's intent
    // (dynamic canvas-fit or the persisted fixed size) instead of 800x600 —
    // no post-boot resize, sharp from the first frame. Computed here (not at
    // page load) so a window resize during the archive download still counts.
    const bootResolution = targetResolutionForSettings();
    let init;
    try {
      init = await rpc("realEngineInit", {
        runDirectory: "/assets/real-init",
        shellMap,
        stepped: steppedInit,
        bootWidth: bootResolution?.width,
        bootHeight: bootResolution?.height,
      });
    } finally {
      window.removeEventListener("cncport:initprogress", onInitProgress);
    }
    console.log("[play] boot: realEngineInit resolved",
      { ok: init?.ok, initReturned: init?.frontier?.initReturned });
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
    // No reveal-pump frames needed: the engine-thread paced loop starts
    // right below and supplies frames continuously.
    for (const point of [{ x: 32, y: 32 }, { x: 96, y: 96 }]) {
      await rpc("postMessage", {
        message: 0x0200,
        lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
        point,
      });
    }
    console.log("[play] boot: menu reveal moves posted");

    report("");
    endBootProgress();
    document.querySelector("#launchLoader")?.setAttribute("hidden", "");
    viewportCanvas.hidden = false;
    overlay.hidden = false;
    overlay.classList.add("is-running");
    bootSentinel?.classList.add("hidden");
    hudNode?.classList.remove("hidden");
    gearButton?.classList.remove("hidden");
    document.querySelector("#exitRuntimeButton")?.removeAttribute("hidden");
    const launchFill = document.querySelector("#launchProgressFill");
    if (launchFill) launchFill.style.width = "100%";
    const engineStage = document.querySelector("#stageEngine");
    if (engineStage) {
      engineStage.textContent = "✓ Engine";
      engineStage.classList.add("is-done");
    }
    runtimeStarted = true;
    issueRecorder.setSessionContext({ phase: "running" });
    viewportCanvas.focus();
    initDisplayControls();
    // The engine booted at the requested resolution (the boot resolutionchange
    // event recorded it); this apply is a no-op then, and covers the fallbacks:
    // a stale wasm without the boot export, or the window changing size during
    // the archive download.
    await applyDisplaySettings("boot");
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

let runtimeStarted = false;

async function launchFromDesktop() {
  overlay.hidden = false;
  if (!runtimeStarted) {
    overlay.classList.remove("is-running");
    document.querySelector("#launchLoader")?.removeAttribute("hidden");
    viewportCanvas.hidden = true;
    if (!startButton.disabled) startButton.click();
    return;
  }
  overlay.classList.add("is-running");
  viewportCanvas.hidden = false;
  hudNode?.classList.remove("hidden");
  gearButton?.classList.remove("hidden");
  document.querySelector("#exitRuntimeButton")?.removeAttribute("hidden");
  if (activeRpc) {
    const logicFps = Math.min(240, positiveNumberParam("logicFps", DEFAULT_LOGIC_FPS));
    const clientFps = Math.min(240, positiveNumberParam("clientFps", DEFAULT_CLIENT_FPS));
    await activeRpc("threadedStartLoop", { clientFps, logicFps });
  }
  viewportCanvas.focus();
}

async function exitToDesktop() {
  if (activeRpc && runtimeStarted) {
    await activeRpc("threadedStopLoop", {}).catch(() => {});
    await activeRpc("persistSaves", { reason: "launcher-exit" }).catch(() => {});
  }
  overlay.hidden = true;
  overlay.classList.remove("is-running");
  hudNode?.classList.add("hidden");
  gearButton?.classList.add("hidden");
  closeSettings();
}

window.ZeroHRuntime = {
  launch: launchFromDesktop,
  exit: exitToDesktop,
  get started() { return runtimeStarted; },
};

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

// --- resolution + fullscreen (engine-owned, page-driven) ---------------------
// The ENGINE owns the render resolution (TheDisplay). The page expresses
// intent through the setEngineResolution RPC (the real display-mode-change
// path: W3DDisplay::setDisplayMode -> WW3D::Set_Device_Resolution + 2D
// projection + GUI reflow); the D3D8 shim reports every applied backbuffer
// size back to the page (bridge "cncport:resolutionchange" events) and
// bridge.js pins the WebGL2 backing store to it, so buffer == render target
// 1:1 in every mode. This block implements:
//   * Dynamic (default): the engine resolution follows the canvas CSS box x
//     devicePixelRatio — window resizes, DPR changes and fullscreen re-apply
//     it (debounced, degenerate-size-guarded, rAF-deferred) so the render is
//     always 1:1 sharp with no letterbox.
//   * Fixed: preset ladder or custom W x H; CSS letterboxes (object-fit:
//     contain) so aspect is always preserved, windowed and fullscreen alike.
//   * Engine-initiated changes (the in-game options screen) are mirrored back
//     into the select and the persisted intent — one source of truth.
let activeRpc = null;
let displayControlsReady = false;

const resolutionSelect = document.querySelector("#resolutionSelectLive");
const customResolutionRow = document.querySelector("#customResolutionRow");
const customResolutionWidth = document.querySelector("#customResolutionWidth");
const customResolutionHeight = document.querySelector("#customResolutionHeight");
const customResolutionApply = document.querySelector("#customResolutionApply");
const fullscreenButton = document.querySelector("#fullscreenButton");
const fullscreenTarget = document.querySelector(".shell") || document.body;

const PRESET_RESOLUTIONS = [
  { width: 800, height: 600, label: "800 x 600 (original)" },
  { width: 1024, height: 768, label: "1024 x 768" },
  { width: 1280, height: 720, label: "1280 x 720" },
  { width: 1280, height: 1024, label: "1280 x 1024" },
  { width: 1600, height: 900, label: "1600 x 900" },
  { width: 1600, height: 1200, label: "1600 x 1200" },
  { width: 1920, height: 1080, label: "1920 x 1080" },
  { width: 2560, height: 1440, label: "2560 x 1440" },
];

// The menus are authored for >= 800x600; the engine-side hook additionally
// clamps at 640x480..7680x4320. Dynamic sizing clamps to the authored minimum
// so tiny windows scale the render down via CSS instead of breaking layouts.
const ENGINE_MIN = { width: 800, height: 600 };
const ENGINE_MAX = { width: 7680, height: 4320 };

// Total-pixel budget for DYNAMIC sizing. iPads report devicePixelRatio 2-3;
// a full-DPR canvas there means a ~16MP render target and WebGL context loss
// ("browser reclaimed the GPU"), so mobile Safari gets a tighter budget (the
// render is CSS-upscaled from a still-sharp ~2.4MP). Desktop allows up to 4K.
// Explicit fixed/custom selections are NOT capped — only the automatic mode.
const IS_IOS_LIKE = /iP(ad|hone|od)/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const MAX_DYNAMIC_PIXELS = IS_IOS_LIKE ? 2_400_000 : 8_500_000;

let displaySettings = loadDisplaySettings();
let lastAppliedResolution = null; // {width,height} last reported by the engine

function clampResolution(width, height) {
  return {
    width: Math.min(ENGINE_MAX.width, Math.max(ENGINE_MIN.width, Math.round(width))),
    height: Math.min(ENGINE_MAX.height, Math.max(ENGINE_MIN.height, Math.round(height))),
  };
}

// The canvas CSS box x devicePixelRatio: the display's real pixel grid, so
// rendering at this size is 1:1 sharp (no upscale blur). Returns null during
// degenerate layouts (mid-fullscreen-transition, hidden canvas) so callers
// skip instead of pushing a broken size into the engine.
function dynamicTargetResolution() {
  const rect = viewportCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = rect.width || window.innerWidth || 0;
  const cssHeight = rect.height || window.innerHeight || 0;
  if (cssWidth < 64 || cssHeight < 64) {
    return null;
  }
  let width = cssWidth * dpr;
  let height = cssHeight * dpr;
  const pixels = width * height;
  if (pixels > MAX_DYNAMIC_PIXELS) {
    const scale = Math.sqrt(MAX_DYNAMIC_PIXELS / pixels);
    width *= scale;
    height *= scale;
  }
  return clampResolution(width, height);
}

function targetResolutionForSettings() {
  if (displaySettings.mode === "fixed") {
    return clampResolution(displaySettings.width, displaySettings.height);
  }
  return dynamicTargetResolution();
}

// --- applying ---------------------------------------------------------------
let applyingResolution = false;
let applyQueued = false;
let busyRetryTimer = null;
let busyRetryCount = 0;

function scheduleBusyRetry(reason) {
  if (busyRetryTimer || busyRetryCount >= 90) {
    return;
  }
  busyRetryTimer = setTimeout(() => {
    busyRetryTimer = null;
    busyRetryCount += 1;
    void applyDisplaySettings(`${reason}:retry`);
  }, 1000);
}

async function applyDisplaySettings(reason = "settings") {
  if (!activeRpc) {
    return;
  }
  const target = targetResolutionForSettings();
  if (!target) {
    return;
  }
  if (lastAppliedResolution
      && lastAppliedResolution.width === target.width
      && lastAppliedResolution.height === target.height) {
    return;
  }
  if (applyingResolution) {
    applyQueued = true;
    return;
  }
  applyingResolution = true;
  try {
    const result = await activeRpc("setEngineResolution", {
      width: target.width,
      height: target.height,
    });
    if (result?.ok === true) {
      busyRetryCount = 0;
      lastAppliedResolution = {
        width: result.applied?.width ?? target.width,
        height: result.applied?.height ?? target.height,
      };
    } else if (result?.error === "busy-loading") {
      // A map/save load is in flight; the engine refuses resolution changes
      // until it drains. Retry on a timer instead of dropping the intent.
      scheduleBusyRetry(reason);
    } else {
      console.warn("[play] setEngineResolution failed", result?.error ?? result);
    }
  } catch (error) {
    console.warn("[play] setEngineResolution threw", error);
  } finally {
    applyingResolution = false;
    if (applyQueued) {
      applyQueued = false;
      void applyDisplaySettings(reason);
    }
  }
}

// --- select UI ----------------------------------------------------------------
function presetValue(width, height) {
  return `${width}x${height}`;
}

function dynamicOptionLabel() {
  const size = dynamicTargetResolution();
  return size
    ? `Dynamic — fits window (${size.width} x ${size.height})`
    : "Dynamic — fits window";
}

function populateResolutionSelect() {
  if (!resolutionSelect) {
    return;
  }
  resolutionSelect.textContent = "";
  const dynamicOption = document.createElement("option");
  dynamicOption.value = "dynamic";
  dynamicOption.textContent = dynamicOptionLabel();
  resolutionSelect.appendChild(dynamicOption);
  for (const preset of PRESET_RESOLUTIONS) {
    const option = document.createElement("option");
    option.value = presetValue(preset.width, preset.height);
    option.textContent = preset.label;
    resolutionSelect.appendChild(option);
  }
  const customOption = document.createElement("option");
  customOption.value = "custom";
  customOption.textContent = "Custom…";
  resolutionSelect.appendChild(customOption);
}

function refreshDynamicOptionLabel() {
  const option = resolutionSelect?.querySelector('option[value="dynamic"]');
  if (option) {
    option.textContent = dynamicOptionLabel();
  }
}

function syncSelectToSettings() {
  if (!resolutionSelect) {
    return;
  }
  refreshDynamicOptionLabel();
  let showCustom = false;
  if (displaySettings.mode === "dynamic") {
    resolutionSelect.value = "dynamic";
  } else {
    const value = presetValue(displaySettings.width, displaySettings.height);
    const isPreset = PRESET_RESOLUTIONS.some(
      (preset) => presetValue(preset.width, preset.height) === value);
    resolutionSelect.value = isPreset ? value : "custom";
    showCustom = !isPreset;
    if (customResolutionWidth && customResolutionHeight) {
      customResolutionWidth.value = String(displaySettings.width);
      customResolutionHeight.value = String(displaySettings.height);
    }
  }
  customResolutionRow?.classList.toggle("hidden", !showCustom && resolutionSelect.value !== "custom");
}

function setDisplaySettings(next, reason) {
  displaySettings = next;
  saveDisplaySettings(displaySettings);
  syncSelectToSettings();
  void applyDisplaySettings(reason);
}

// Engine-side resolution reports: device create at boot, every RPC apply, and
// engine-initiated changes (the in-game options screen). The engine is the
// source of truth — an unexpected size becomes the new persisted fixed intent.
window.addEventListener("cncport:resolutionchange", (event) => {
  const width = Math.round(Number(event.detail?.width ?? 0));
  const height = Math.round(Number(event.detail?.height ?? 0));
  const source = String(event.detail?.source ?? "engine");
  if (width < 2 || height < 2) {
    return;
  }
  lastAppliedResolution = { width, height };
  refreshDynamicOptionLabel();
  if (source !== "engine" || !displayControlsReady) {
    return;
  }
  const expected = targetResolutionForSettings();
  if (expected
      && Math.abs(expected.width - width) <= 2
      && Math.abs(expected.height - height) <= 2) {
    return; // our own change (or boot) landing — intent already matches
  }
  displaySettings = { mode: "fixed", width, height };
  saveDisplaySettings(displaySettings);
  syncSelectToSettings();
});

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

// Keyboard Lock keeps Esc reaching the game while fullscreen. Without it the
// browser eats the Esc keydown to exit fullscreen (a security behaviour that
// preventDefault() cannot override), so the in-game Esc menu (KEY_ESC ->
// MetaEventTranslator -> MSG_META_OPTIONS -> ToggleQuitMenu) never fires and Esc
// is dead in-game. navigator.keyboard.lock(['Escape']) only takes effect while
// fullscreen: Esc keydowns are delivered to the page (bridge.js forwards them to
// the engine); the user holds Esc to exit fullscreen instead. Chromium/Edge
// support this; Safari/Firefox lack it and fall back to native Esc-exits.
let keyboardEscLocked = false;

async function lockEscapeKey() {
  if (keyboardEscLocked) {
    return;
  }
  const keyboard = navigator.keyboard;
  if (!keyboard || typeof keyboard.lock !== "function") {
    return; // Unsupported (Safari/Firefox): native Esc still exits fullscreen.
  }
  try {
    await keyboard.lock(["Escape"]);
    keyboardEscLocked = true;
  } catch (error) {
    // lock() rejects when not in fullscreen or when the API is disallowed; the
    // game just keeps the native Esc-exit behaviour in that case.
    console.warn("[play] keyboard.lock(Escape) failed", error);
  }
}

function unlockEscapeKey() {
  if (!keyboardEscLocked) {
    return;
  }
  keyboardEscLocked = false;
  const keyboard = navigator.keyboard;
  if (keyboard && typeof keyboard.unlock === "function") {
    try {
      keyboard.unlock();
    } catch (error) {
      console.warn("[play] keyboard.unlock failed", error);
    }
  }
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
  // Grab/release the Esc keyboard lock alongside the fullscreen state so Esc
  // opens the in-game menu instead of exiting fullscreen. This covers every
  // entry path (the fullscreen button, boot-time "start in fullscreen", and any
  // programmatic request) since they all funnel through this change handler.
  if (active) {
    void lockEscapeKey();
  } else {
    unlockEscapeKey();
  }
  if (fullscreenButton) {
    fullscreenButton.classList.toggle("active", active);
    fullscreenButton.textContent = active ? "exit full" : "fullscreen";
  }
  // Toggle the CSS fullscreen state (chrome hidden, canvas scaled to the
  // screen, letterboxed on black via object-fit: contain), then treat the
  // enter/exit as a viewport geometry change: in Dynamic mode the engine
  // resolution follows the new canvas box (debounced + rAF-deferred +
  // degenerate-size-guarded in the geometry handler, so the mid-transition
  // rects that used to break the render target are skipped) — fullscreen is
  // 1:1 sharp. In fixed mode the engine keeps its resolution and only the CSS
  // scale changes. Input stays correct either way: canvasInputPointFromEvent
  // maps through the letterboxed content box to the engine display size.
  fullscreenTarget.classList.toggle("is-fullscreen", active);
  onViewportGeometryChange();
}

// --- live tracking of tab size / DPR / fullscreen -----------------------------
let resizeSettleTimer = null;
function onViewportGeometryChange() {
  refreshDynamicOptionLabel();
  if (displaySettings.mode !== "dynamic") {
    return;
  }
  if (resizeSettleTimer) {
    clearTimeout(resizeSettleTimer);
  }
  // Debounce: only push a new engine resolution once the resize settles, so a
  // window drag does not spam display-mode changes (each reflows the GUI), and
  // defer to rAF so fullscreen enter/exit applies after layout stabilizes.
  resizeSettleTimer = setTimeout(() => {
    resizeSettleTimer = null;
    requestAnimationFrame(() => {
      refreshDynamicOptionLabel();
      void applyDisplaySettings("geometry");
    });
  }, 350);
}

function initDisplayControls() {
  if (displayControlsReady || !resolutionSelect) {
    return;
  }
  displayControlsReady = true;
  populateResolutionSelect();
  syncSelectToSettings();

  resolutionSelect.addEventListener("change", () => {
    const value = resolutionSelect.value;
    if (value === "dynamic") {
      setDisplaySettings({ mode: "dynamic" }, "select");
      return;
    }
    if (value === "custom") {
      // Show the inputs seeded with the current size; nothing applies until
      // the player hits Apply.
      customResolutionRow?.classList.remove("hidden");
      const seed = lastAppliedResolution ?? targetResolutionForSettings();
      if (seed && customResolutionWidth && customResolutionHeight) {
        customResolutionWidth.value = String(seed.width);
        customResolutionHeight.value = String(seed.height);
      }
      return;
    }
    const match = /^(\d+)x(\d+)$/.exec(value);
    if (match) {
      setDisplaySettings(
        { mode: "fixed", width: Number(match[1]), height: Number(match[2]) },
        "select");
    }
  });

  customResolutionApply?.addEventListener("click", () => {
    const width = Math.round(Number(customResolutionWidth?.value ?? 0));
    const height = Math.round(Number(customResolutionHeight?.value ?? 0));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
      return;
    }
    const clamped = clampResolution(width, height);
    if (customResolutionWidth && customResolutionHeight) {
      customResolutionWidth.value = String(clamped.width);
      customResolutionHeight.value = String(clamped.height);
    }
    setDisplaySettings({ mode: "fixed", width: clamped.width, height: clamped.height }, "custom");
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

  // Shader tier (Classic fixed-function vs Enhanced ps.1.1). The engine
  // samples GPU capabilities once at device create, so a change applies on the
  // next boot: persist the choice and reload. A URL ?shaderTier= param wins
  // over the stored choice (bridge.js d3d8ShaderTierQuery order), keeping
  // probes deterministic.
  const shaderTierSelect = document.querySelector("#shaderTierSelect");
  if (shaderTierSelect) {
    let storedTier = null;
    try {
      storedTier = window.localStorage?.getItem("cncPortShaderTier");
    } catch { /* storage unavailable */ }
    const urlTier = new URLSearchParams(window.location.search).get("shaderTier");
    // Mirror bridge.js d3d8ShaderTierQuery: url > stored > default ff.
    const effectiveTier = urlTier === "ps11" || urlTier === "ff"
      ? urlTier
      : (storedTier === "ps11" || storedTier === "ff" ? storedTier : "ff");
    shaderTierSelect.value = effectiveTier;
    shaderTierSelect.addEventListener("change", () => {
      try {
        window.localStorage?.setItem("cncPortShaderTier", shaderTierSelect.value);
      } catch { /* storage unavailable */ }
      if (window.confirm("Shader tier applies on the next boot. Reload now?")) {
        const reloadUrl = new URL(window.location.href);
        reloadUrl.searchParams.delete("shaderTier");
        window.location.href = reloadUrl.href;
      }
    });
  }

  // In-fullscreen exit affordance (no permanent bar): the button is revealed by
  // CSS on hover near the top; clicking it exits. With the Esc keyboard lock a
  // single Esc opens the in-game menu, so the exit affordances are this button
  // and holding Esc (the browser surfaces "hold Esc to exit" automatically).
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

// --- in-game settings overlay (opened by the gear) --------------------------
const settingsOverlay = document.querySelector("#settingsOverlay");
const settingsClose = document.querySelector("#settingsClose");

function openSettings() {
  if (!settingsOverlay) {
    return;
  }
  if (displayControlsReady) {
    syncSelectToSettings();
  }
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
