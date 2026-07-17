import "./analytics.mjs";

// Human-driveable boot for the real cnc-port engine: replays the same RPC
// sequence the startup-vertical harness uses (mount whole-file archive set ->
// realEngineInit -> realEngineFrame loop). Mouse/keyboard/touch input already
// flows through bridge.js canvas listeners into the engine's Win32 queue.

import "./launcher-archive-specs.js";
import {
  forgetAgentBridgeToken,
  loadAgentBridgeSettings,
  normalizeAgentBridgeConfiguration,
  saveAgentBridgeSettings,
} from "./agent-bridge-config.mjs";
import { createIssueRecorder } from "./issue-recorder.mjs";
import {
  loadCameraZoomHeight,
  normalizeCameraZoomHeight,
  saveCameraZoomHeight,
} from "./camera-zoom-config.mjs";
import { loadCursorStyle, saveCursorStyle } from "./cursor-style-config.mjs";
import {
  clampResolution,
  dynamicResolutionForBox,
  isIOSLikeNavigator,
  isIPadLikeNavigator,
} from "./display-resolution.mjs";
import { resolveShaderTier } from "./shader-tier-config.mjs";
import {
  runRuntimeShutdownSequence,
  runtimeShutdownWarning,
} from "./runtime-shutdown-sequence.mjs";
import {
  generateCommanderName,
  loadOrCreateNetworkSettings,
  normalizeCommanderName,
  saveNetworkSettings as persistNetworkSettings,
} from "./multiplayer_identity.mjs";
import {
  registerP2pBestEffort,
  shouldAutoConnectP2p,
} from "./multiplayer_launch_policy.mjs";
import {
  activeModMountPlan,
  deriveMultiplayerRoom,
  loadActiveModContext,
  vanillaModContext,
} from "./mod-context.mjs";

const analytics = window.ZeroHAnalytics;
const track = (name, params) => analytics?.track(name, params);

const archiveSpecs = Object.freeze(window.ZeroHArchiveSpecs.map((spec) => Object.freeze(
  spec.artifactSourceName === spec.name
    ? { name: spec.name }
    : { name: spec.name, sourceName: spec.artifactSourceName },
)));

const overlay = document.querySelector("#launchOverlay");
const startButton = document.querySelector("#start");
const progressNode = document.querySelector("#launchStatus");
const progressSentinel = document.querySelector("#progress");
const bootSentinel = document.querySelector("#overlay");
const queryParams = new URLSearchParams(window.location.search);
let networkStorage = null;
try {
  networkStorage = window.localStorage;
} catch {
  // Privacy settings can make the localStorage property itself throw.
}

function publicAgentBridgeEndpoint(value) {
  try {
    const endpoint = new URL(String(value));
    endpoint.username = "";
    endpoint.password = "";
    endpoint.search = "";
    endpoint.hash = "";
    return endpoint.href;
  } catch {
    return "invalid agent bridge URL";
  }
}

function diagnosticPageParams() {
  const params = Object.fromEntries(queryParams);
  if (Object.hasOwn(params, "agentBridge")) {
    params.agentBridge = publicAgentBridgeEndpoint(params.agentBridge);
  }
  return params;
}

const hostAgentBridgeConfiguration = window.CnCPortPlayConfig?.agentBridge;
const rememberedAgentBridgeSettings = loadAgentBridgeSettings(networkStorage);
let agentBridgeConfigurationError = "";

function initialAgentBridgeConfiguration() {
  const candidate = hostAgentBridgeConfiguration
    ?? (rememberedAgentBridgeSettings.enabled && rememberedAgentBridgeSettings.token
      ? rememberedAgentBridgeSettings : null);
  if (candidate == null) return null;
  try {
    return normalizeAgentBridgeConfiguration(candidate);
  } catch (error) {
    agentBridgeConfigurationError = error?.message ?? String(error);
    return null;
  }
}
let agentBridgeConfiguration = initialAgentBridgeConfiguration();
const activeModContext = (() => {
  try {
    return loadActiveModContext(window.localStorage);
  } catch {
    return vanillaModContext();
  }
})();
const performanceOverlayNode = document.querySelector("#performanceOverlay");
const performanceGraphNode = document.querySelector("#performanceGraph");
const performanceClientFpsNode = document.querySelector("#performanceClientFps");
const performanceLogicFpsNode = document.querySelector("#performanceLogicFps");
const performanceEngineMsNode = document.querySelector("#performanceEngineMs");
const performanceFrameMsNode = document.querySelector("#performanceFrameMs");
const performanceP95MsNode = document.querySelector("#performanceP95Ms");
const performanceMaxMsNode = document.querySelector("#performanceMaxMs");
const networkRoomNode = document.querySelector("#networkRoom");
const networkNameNode = document.querySelector("#networkName");
const networkStunNode = document.querySelector("#networkStun");
const networkIceUsernameNode = document.querySelector("#networkIceUsername");
const networkIceCredentialNode = document.querySelector("#networkIceCredential");
const networkStatusNode = document.querySelector("#networkStatus");
const networkDiagnosticsToggleNode = document.querySelector("#networkDiagnosticsToggle");
const binkPreparationOverlay = document.querySelector("#binkPreparationOverlay");
const binkPreparationName = document.querySelector("#binkPreparationName");
const binkPreparationProgress = document.querySelector("#binkPreparationProgress");
const binkPreparationFill = document.querySelector("#binkPreparationFill");
const binkPreparationDetail = document.querySelector("#binkPreparationDetail");
const binkPreparationCancel = document.querySelector("#binkPreparationCancel");
const NETWORK_DIAGNOSTICS_SETTINGS_KEY = "cncPortNetworkDiagnosticsEnabled.v1";
let cursorStyle = loadCursorStyle(networkStorage);

function binkPreparationPercent(detail) {
  const progress = Number.isFinite(Number(detail?.progress))
    ? Math.max(0, Math.min(1, Number(detail.progress))) : 0;
  if (detail?.phase === "runtime") return 5 + progress * 20;
  if (detail?.phase === "video") return 25 + progress * 60;
  if (detail?.phase === "audio") return 85 + progress * 14;
  if (detail?.phase === "ready") return 100;
  return 2;
}

function updateBinkPreparation(event) {
  if (!binkPreparationOverlay) return;
  const detail = event.detail ?? {};
  const terminal = detail.phase === "ready" || detail.phase === "cancelled";
  if (terminal) {
    binkPreparationOverlay.hidden = true;
    return;
  }
  binkPreparationOverlay.hidden = false;
  const sourceName = String(detail.sourcePath ?? "").replaceAll("\\", "/").split("/").pop();
  if (sourceName && binkPreparationName) binkPreparationName.textContent = sourceName;
  const percent = Math.round(binkPreparationPercent(detail));
  if (binkPreparationFill) binkPreparationFill.style.width = `${percent}%`;
  binkPreparationProgress?.setAttribute("aria-valuenow", String(percent));
  if (binkPreparationDetail) {
    binkPreparationDetail.textContent = detail.phase === "error"
      ? `Could not prepare this movie: ${detail.error || "unknown error"}`
      : detail.detail || "Preparing this movie locally. Nothing is uploaded.";
  }
  if (binkPreparationCancel) {
    binkPreparationCancel.disabled = false;
    binkPreparationCancel.textContent = detail.phase === "error" ? "Dismiss" : "Skip movie";
    binkPreparationCancel.dataset.action = detail.phase === "error" ? "dismiss" : "cancel";
  }
}

window.addEventListener("cncport:binkprepare", updateBinkPreparation);
binkPreparationCancel?.addEventListener("click", () => {
  if (binkPreparationCancel.dataset.action === "dismiss") {
    binkPreparationOverlay.hidden = true;
    return;
  }
  const cancelled = window.CnCPort?.cancelBinkPreparation?.() === true;
  if (cancelled) {
    binkPreparationCancel.disabled = true;
    binkPreparationCancel.textContent = "Skipping…";
  }
});

function loadNetworkDiagnosticsEnabled() {
  const queryValue = queryParams.get("networkDiagnostics");
  if (queryValue === "1" || queryValue === "true" || queryValue === "on") return true;
  if (queryValue === "0" || queryValue === "false" || queryValue === "off") return false;
  try {
    return window.localStorage?.getItem(NETWORK_DIAGNOSTICS_SETTINGS_KEY) === "true";
  } catch {
    return false;
  }
}

let networkDiagnosticsEnabled = loadNetworkDiagnosticsEnabled();

function setNetworkDiagnosticsEnabled(enabled, reason = "settings") {
  networkDiagnosticsEnabled = enabled === true;
  if (networkDiagnosticsToggleNode) networkDiagnosticsToggleNode.checked = networkDiagnosticsEnabled;
  try {
    window.localStorage?.setItem(NETWORK_DIAGNOSTICS_SETTINGS_KEY,
      networkDiagnosticsEnabled ? "true" : "false");
  } catch {
    // Storage is optional; the setting still applies to this page.
  }
  window.__cncSetNetworkDiagnostics?.(networkDiagnosticsEnabled, {
    reset: networkDiagnosticsEnabled,
    reason,
  });
  return networkDiagnosticsEnabled;
}

function loadNetworkSettings() {
  const stored = loadOrCreateNetworkSettings({
    storage: networkStorage,
    queryParams,
  });
  return {
    ...stored,
    iceCredential: "",
  };
}

function networkSettingsFromInputs() {
  const name = normalizeCommanderName(networkNameNode?.value) || generateCommanderName();
  if (networkNameNode && networkNameNode.value !== name) networkNameNode.value = name;
  return {
    room: networkRoomNode?.value.trim() ?? "",
    name,
    iceServerUrl: networkStunNode?.value.trim() ?? "",
    iceUsername: networkIceUsernameNode?.value ?? "",
    iceCredential: networkIceCredentialNode?.value ?? "",
  };
}

function initializeNetworkSettings() {
  const settings = loadNetworkSettings();
  if (networkRoomNode) networkRoomNode.value = settings.room;
  if (networkNameNode) networkNameNode.value = settings.name;
  if (networkStunNode) networkStunNode.value = settings.iceServerUrl;
  if (networkIceUsernameNode) networkIceUsernameNode.value = settings.iceUsername;
  if (networkIceCredentialNode) networkIceCredentialNode.value = settings.iceCredential;
}

function updateNetworkDraftStatus() {
  if (!networkStatusNode) return;
  const room = networkRoomNode?.value.trim();
  networkStatusNode.textContent = room
    ? `Ready to join ${room} when Zero Hour launches.`
    : "Offline. Enter a shared room to enable WebRTC multiplayer.";
}

function saveNetworkSettings(settings) {
  persistNetworkSettings(networkStorage, settings);
}

initializeNetworkSettings();
setNetworkDiagnosticsEnabled(networkDiagnosticsEnabled, "settings-load");
[networkRoomNode, networkNameNode, networkStunNode, networkIceUsernameNode]
  .filter(Boolean)
  .forEach((input) => input.addEventListener("change", () => saveNetworkSettings(networkSettingsFromInputs())));
networkRoomNode?.addEventListener("input", updateNetworkDraftStatus);
networkDiagnosticsToggleNode?.addEventListener("change", (event) => {
  setNetworkDiagnosticsEnabled(event.currentTarget.checked, "settings-toggle");
  track("setting_changed", {
    category: "diagnostics",
    setting: "multiplayer_packet_capture",
    value: event.currentTarget.checked ? "enabled" : "disabled",
  });
});
updateNetworkDraftStatus();
// Engine-thread mode: the engine runs on a pthread in the threaded build and
// bridge.js moves the frame loop into the worker realm; this page only
// observes (status events drive optional host diagnostics). The play page is THREADED-ONLY
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
let cameraZoomHeight = window.CnCPortPlayConfig?.maxCameraHeight === undefined
  ? loadCameraZoomHeight(networkStorage)
  : normalizeCameraZoomHeight(window.CnCPortPlayConfig.maxCameraHeight);

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

const defaultPerformanceOverlayConfig = {
  enabled: false,
  historySeconds: 5,
  graphMaxMs: 50,
};
const PERFORMANCE_OVERLAY_SETTINGS_KEY = "cncPortPerformanceOverlay.v1";

function loadPerformanceOverlayConfig() {
  try {
    const stored = JSON.parse(
      window.localStorage?.getItem(PERFORMANCE_OVERLAY_SETTINGS_KEY) ?? "null",
    );
    return normalizePerformanceOverlayConfig(stored);
  } catch {
    return { ...defaultPerformanceOverlayConfig };
  }
}

function normalizePerformanceOverlayConfig(value, previous = defaultPerformanceOverlayConfig) {
  const update = typeof value === "boolean" ? { enabled: value }
    : value && typeof value === "object" ? value : {};
  const historySeconds = Number(update.historySeconds ?? previous.historySeconds);
  const graphMaxMs = Number(update.graphMaxMs ?? previous.graphMaxMs);
  return {
    enabled: update.enabled === undefined ? previous.enabled : update.enabled === true,
    historySeconds: Number.isFinite(historySeconds)
      ? Math.max(1, Math.min(10, historySeconds)) : previous.historySeconds,
    graphMaxMs: Number.isFinite(graphMaxMs)
      ? Math.max(8, Math.min(250, graphMaxMs)) : previous.graphMaxMs,
  };
}

let performanceOverlayConfig = normalizePerformanceOverlayConfig(
  window.CnCPortPlayConfig?.performanceOverlay ?? loadPerformanceOverlayConfig(),
);
let performanceOverlaySnapshot = null;
let gameRunning = false;

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

let configuredDiagLevel = "lite";

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
    captureOverlay: document.querySelector("#captureOverlay"),
    captureTitle: document.querySelector("#captureOverlayTitle"),
    captureStats: document.querySelector("#captureOverlayStats"),
    captureStatus: document.querySelector("#captureOverlayStatus"),
    captureToggle: document.querySelector("#captureOverlayToggle"),
    captureIssue: document.querySelector("#captureOverlayIssue"),
    captureDownload: document.querySelector("#captureOverlayDownload"),
    captureDismiss: document.querySelector("#captureOverlayDismiss"),
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

function showRuntimeCrash(failure) {
  gameRunning = false;
  renderPerformanceOverlay();
  void import("./crash-diagnostics.mjs")
    .then(({ showCrashDiagnostics }) => showCrashDiagnostics(issueRecorder, failure))
    .catch((error) => console.error("[play] crash diagnostics unavailable", error));
}

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

function fail(message, detail, {
  kind = runtimeStarted ? "runtime-failure" : "launch-failure",
  stage = issueRecorder.session?.phase ?? null,
  error = null,
} = {}) {
  console.error("[play]", message, detail ?? "");
  issueRecorder.noteFailure(message, detail);
  showRuntimeCrash({ kind, stage, message, detail, error });
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

function launchFailure(message, detail) {
  const error = new Error(message);
  error.launchDetail = detail;
  return error;
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
      url: new URL(`../artifacts/real-assets/${sourceName}`, document.baseURI).href,
    };
  });
}

function percentile(values, fraction) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function formatPerformanceValue(value, digits = 1) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
}

function drawPerformanceSeries(context, values, maxMs, width, height, color) {
  if (values.length < 2) {
    return;
  }
  context.beginPath();
  for (let index = 0; index < values.length; index += 1) {
    const x = (index / (values.length - 1)) * width;
    const y = height - Math.min(1, Math.max(0, values[index] / maxMs)) * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = color;
  context.lineWidth = 1.25;
  context.stroke();
}

function renderPerformanceOverlay() {
  const visible = gameRunning && performanceOverlayConfig.enabled;
  performanceOverlayNode?.classList.toggle("hidden", !visible);
  if (!visible || !performanceOverlaySnapshot || !performanceGraphNode) {
    return;
  }

  const { clientFps, logicFps, engineFrameMs, presentationFrameMs } = performanceOverlaySnapshot;
  const historyCount = Math.max(2, Math.round(
    Math.max(clientFps || DEFAULT_CLIENT_FPS, 1) * performanceOverlayConfig.historySeconds,
  ));
  const engine = engineFrameMs.slice(-historyCount);
  const presentation = presentationFrameMs.slice(-historyCount);
  const engineCurrent = engine.at(-1);
  const presentationCurrent = presentation.at(-1);
  const engineP95 = percentile(engine, 0.95);
  const engineMax = engine.length > 0 ? Math.max(...engine) : null;

  if (performanceClientFpsNode) performanceClientFpsNode.textContent = formatPerformanceValue(clientFps, 1);
  if (performanceLogicFpsNode) performanceLogicFpsNode.textContent = formatPerformanceValue(logicFps, 1);
  if (performanceEngineMsNode) performanceEngineMsNode.textContent = `${formatPerformanceValue(engineCurrent)} ms`;
  if (performanceFrameMsNode) performanceFrameMsNode.textContent = `${formatPerformanceValue(presentationCurrent)} ms`;
  if (performanceP95MsNode) performanceP95MsNode.textContent = `${formatPerformanceValue(engineP95)} ms`;
  if (performanceMaxMsNode) performanceMaxMsNode.textContent = `${formatPerformanceValue(engineMax)} ms`;

  const cssWidth = 300;
  const cssHeight = 92;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const pixelWidth = Math.round(cssWidth * dpr);
  const pixelHeight = Math.round(cssHeight * dpr);
  if (performanceGraphNode.width !== pixelWidth || performanceGraphNode.height !== pixelHeight) {
    performanceGraphNode.width = pixelWidth;
    performanceGraphNode.height = pixelHeight;
  }
  const context = performanceGraphNode.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = "rgba(0, 0, 0, 0.25)";
  context.fillRect(0, 0, cssWidth, cssHeight);

  const maxMs = performanceOverlayConfig.graphMaxMs;
  for (const budget of [16.67, 33.33]) {
    if (budget >= maxMs) continue;
    const y = cssHeight - (budget / maxMs) * cssHeight;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(cssWidth, y);
    context.strokeStyle = "rgba(200, 218, 230, 0.16)";
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = "rgba(200, 218, 230, 0.5)";
    context.font = "9px ui-monospace, monospace";
    context.fillText(`${budget.toFixed(1)} ms`, 4, Math.max(9, y - 3));
  }
  drawPerformanceSeries(context, presentation, maxMs, cssWidth, cssHeight, "#58a6ff");
  drawPerformanceSeries(context, engine, maxMs, cssWidth, cssHeight, "#55d187");
  context.fillStyle = "#55d187";
  context.fillRect(cssWidth - 104, 6, 8, 2);
  context.fillStyle = "rgba(220, 236, 246, 0.72)";
  context.font = "9px ui-monospace, monospace";
  context.fillText("engine", cssWidth - 92, 10);
  context.fillStyle = "#58a6ff";
  context.fillRect(cssWidth - 51, 6, 8, 2);
  context.fillStyle = "rgba(220, 236, 246, 0.72)";
  context.fillText("frame", cssWidth - 39, 10);
}

function setPerformanceOverlay(value) {
  performanceOverlayConfig = normalizePerformanceOverlayConfig(value, performanceOverlayConfig);
  try {
    window.localStorage?.setItem(
      PERFORMANCE_OVERLAY_SETTINGS_KEY,
      JSON.stringify(performanceOverlayConfig),
    );
  } catch {
    // Persistence is optional; keep the current session configured.
  }
  if (desktopGameSettingsBound) syncDesktopGameSettings();
  renderPerformanceOverlay();
  return { ...performanceOverlayConfig };
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
  // renders the status feed into the opt-in performance overlay.
  return runThreadedFrameLoop(rpc, clientFps, logicFps);
}

// Threaded mode: the engine thread owns the frame loop; observe its 500ms
// status posts for the opt-in performance overlay and loop errors.
async function runThreadedFrameLoop(rpc, clientFps, logicFps) {
  const start = await rpc("threadedStartLoop", { clientFps, logicFps });
  if (start?.ok !== true) {
    throw launchFailure("threaded frame loop failed to start", start);
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
        performanceOverlaySnapshot = {
          clientFps: client,
          logicFps: logic,
          engineFrameMs: Array.isArray(status.timing?.engineFrameMs)
            ? status.timing.engineFrameMs.filter(Number.isFinite) : [],
          presentationFrameMs: Array.isArray(status.timing?.presentationFrameMs)
            ? status.timing.presentationFrameMs.filter(Number.isFinite) : [],
        };
        renderPerformanceOverlay();
      }
    }
    previous = { now: status.now, clientFrames: loop.clientFrames, logicFrames: loop.logicFrames };
  });
  window.addEventListener("cncport:threadedlooperror", (event) => {
    fail("engine thread frame loop failed", event.detail?.error ?? event.detail, {
      kind: "engine-loop",
      stage: issueRecorder.session?.phase ?? "running",
    });
  });
}

async function start() {
  let analyticsStage = "launcher";
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
    throw launchFailure("engine-thread mode unavailable on this origin", detail);
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
    const discoveryRoom = deriveMultiplayerRoom(networkSettings.room, activeModContext);
    let networkRuntime = null;
    if (shouldAutoConnectP2p(discoveryRoom)) {
      networkRuntime = {
        status: "registering",
        room: networkSettings.room,
        discoveryRoom,
        modContextId: activeModContext.id,
      };
      if (networkStatusNode) {
        networkStatusNode.textContent = "Discovering peers in the background; game launch will continue offline until connected.";
      }
      const iceServers = networkSettings.iceServerUrl
        ? [{
          urls: networkSettings.iceServerUrl.split(",").map((entry) => entry.trim()).filter(Boolean),
          ...(networkSettings.iceUsername ? { username: networkSettings.iceUsername } : {}),
          ...(networkSettings.iceCredential ? { credential: networkSettings.iceCredential } : {}),
        }]
        : [];
      void registerP2pBestEffort({
        rpc,
        room: discoveryRoom,
        peerId: networkSettings.name || null,
        displayName: networkSettings.name || null,
        iceServers,
      }).then((registration) => {
        if (registration.ok) {
          networkRuntime = registration.runtime;
          networkRuntime.room = networkSettings.room;
          networkRuntime.discoveryRoom = discoveryRoom;
          networkRuntime.modContextId = activeModContext.id;
          const endpoint = networkRuntime?.endpoint;
          const virtualIp = endpoint?.localIp >>> 0;
          const ipText = [24, 16, 8, 0]
            .map((shift) => (virtualIp >>> shift) & 0xff).join(".");
          if (networkStatusNode) {
            networkStatusNode.textContent = `Joined ${networkSettings.room} as ${endpoint?.displayName ?? networkSettings.name} (${ipText}). Open Multiplayer → LAN.`;
            networkStatusNode.removeAttribute("title");
          }
          track("p2p_discovery", { result: "connected" });
        } else {
          networkRuntime = {
            status: "offline",
            room: networkSettings.room,
            discoveryRoom,
            modContextId: activeModContext.id,
            error: registration.error,
          };
          if (networkStatusNode) {
            networkStatusNode.textContent = "P2P unavailable. Game is running offline.";
            networkStatusNode.title = registration.error ?? "P2P registration did not complete";
          }
          console.warn("[play] P2P registration failed; continuing offline", registration.error);
          track("p2p_discovery", { result: "offline" });
        }
        issueRecorder.setSessionContext({ network: networkRuntime });
      }).catch((error) => {
        console.warn("[play] P2P registration status update failed; continuing offline", error);
      });
    } else if (networkStatusNode) {
      networkStatusNode.textContent = "Offline. Enter a shared room to enable WebRTC multiplayer.";
    }
    const startAudioRuntime = await rpc("resumeBrowserAudioRuntime", {
      trigger: "play.start",
    }).catch((error) => ({ ok: false, error: error?.message ?? String(error) }));
    const startAudioMixer = await rpc("setBrowserAudioMixerVolumes", {
      trigger: "play.start",
    }).catch((error) => ({ ok: false, error: error?.message ?? String(error) }));
    const audioState = startAudioRuntime?.browserAudioRuntime?.contextState
      ?? startAudioRuntime?.contextState;
    track("audio_activation", {
      trigger: "play_start",
      result: audioState === "running" ? "running" : audioState === "suspended" ? "suspended"
        : startAudioRuntime?.ok === false ? "failed" : "unavailable",
      recovery: false,
    });
    track("boot_milestone", { milestone: "audio" });

    // The human-playable page runs graphics diagnostics in "lite" mode: skip the
    // per-draw readPixels GPU syncs / probe objects / draw-history that the
    // regression harness needs but the player does not. Add ?diag=full to
    // restore full diagnostics for debugging.
    const diagParam = queryParams.get("diag");
    const hostDiag = window.CnCPortPlayConfig?.diagnostics;
    if (diagParam === "full" || diagParam === "lite") {
      setConfiguredDiagLevel(diagParam);
    } else if (hostDiag === "full" || hostDiag === "lite") {
      setConfiguredDiagLevel(hostDiag);
    } else {
      setConfiguredDiagLevel(configuredDiagLevel);
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
      pageParams: diagnosticPageParams(),
      audio: {
        runtime: startAudioRuntime?.browserAudioRuntime ?? startAudioRuntime,
        mixer: startAudioMixer?.browserAudioMixerRuntime ?? startAudioMixer,
      },
      network: networkRuntime,
    });

    const archives = buildArchives();
    analyticsStage = "archives";
    const preparedAssets = archives.every((archive) => typeof archive.opfsPath === "string");
    report(`${preparedAssets ? "mounting local" : "downloading + mounting"} ${archives.length} archives...`);
    beginBootProgress(archives.length);
    const mount = await rpc(preparedAssets ? "mountPreparedArchives" : "mountArchives", {
      path: "/assets/real-init",
      verifyEach: false,
      archives,
      videos: window.ZeroHAssetLibrary?.preparedVideos ?? [],
      includeVideos: queryParams.get("videos") === "1"
        || window.ZeroHAssetLibrary?.includeVideos === true,
      mods: activeModMountPlan(activeModContext),
    });
    if (mount?.archiveSet?.archiveCount !== archives.length) {
      throw launchFailure("archive mount failed", mount?.error ?? mount?.archiveSet);
    }
    track("boot_milestone", { milestone: "archives_mounted" });
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
    analyticsStage = "engine";
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
        commanderName: networkSettings.name,
        maxCameraHeight: cameraZoomHeight,
        bootWidth: bootResolution?.width,
        bootHeight: bootResolution?.height,
        modDirectory: mount.modDirectory ?? "",
      });
    } finally {
      window.removeEventListener("cncport:initprogress", onInitProgress);
    }
    console.log("[play] boot: realEngineInit resolved",
      { ok: init?.ok, initReturned: init?.frontier?.initReturned });
    if (init?.ok !== true || init?.frontier?.initReturned !== true) {
      throw launchFailure("real engine init failed", init);
    }
    track("boot_milestone", { milestone: "engine_initialized" });
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
    const launchFill = document.querySelector("#launchProgressFill");
    if (launchFill) launchFill.style.width = "100%";
    const engineStage = document.querySelector("#stageEngine");
    if (engineStage) {
      engineStage.textContent = "✓ Engine";
      engineStage.classList.add("is-done");
    }
    // From here onward the engine can be resumed without running init again,
    // even if display setup or the first paced-loop start needs a retry.
    runtimeStarted = true;
    syncAgentBridgeApp();
    gameRunning = true;
    renderPerformanceOverlay();
    issueRecorder.setSessionContext({ phase: "running" });
    viewportCanvas.focus();
    // The engine booted at the requested resolution (the boot resolutionchange
    // event recorded it); this apply is a no-op then, and covers the fallbacks:
    // a stale wasm without the boot export, or the window changing size during
    // the archive download. Keep engine-originated resolution persistence
    // disabled until this initial reconciliation finishes: a delayed threaded
    // status for the boot size must not turn a still-dynamic device layout into
    // a fixed 800x600 setting before the page can apply its live viewport.
    await applyDisplaySettings("boot");
    initDisplayRuntime();
    analyticsStage = "display";
    track("boot_milestone", { milestone: "first_frame" });
    track("game_launch", {
      state: "ready",
      stage: "display",
      duration: analytics?.bucketDuration(Date.now() - Number(window.__newShoesLaunchStartedAt || Date.now()), "launch") || "unknown",
    });
    if (new URLSearchParams(window.location.search).get("replay") === "1") {
      issueRecorder.setSessionContext({ phase: "replay-ready" });
      return;
    }
    await runFrameLoop(rpc);
    // A connected agent may issue input immediately. Wait until both original
    // initialization and the paced frame loop are live so its first request
    // cannot race archive mounting or pre-loop input setup.
    if (agentBridgeConfiguration) {
      const agentBridge = await window.CnCPort.connectAgentBridge(agentBridgeConfiguration);
      issueRecorder.setSessionContext({
        agentBridge: {
          configured: true,
          protocol: agentBridge.protocol,
          endpoint: agentBridge.endpoint,
          sessionId: agentBridge.sessionId,
          playMode: agentBridge.playMode,
        },
      });
    }
  } catch (error) {
    window.CnCPort.disconnectAgentBridge?.();
    track("game_launch", {
      state: "failed",
      stage: analyticsStage,
      duration: analytics?.bucketDuration(Date.now() - Number(window.__newShoesLaunchStartedAt || Date.now()), "launch") || "unknown",
    });
    fail(error?.message ?? String(error), error?.launchDetail ?? error, {
      kind: "launch-failure",
      stage: analyticsStage,
      error,
    });
    throw error;
  }
}

let runtimeStarted = false;
let runtimeStartPromise = null;
let runtimeClosed = false;
let runtimeClosing = false;
let runtimeShutdownPromise = null;

function retireRuntimeViewport() {
  if (!viewportCanvas.isConnected && !overlay.isConnected) return false;
  // transferControlToOffscreen promotes the placeholder into its own browser
  // compositor layer. Merely hiding an ancestor can leave that layer's final
  // terrain frame visible after its worker is terminated. Remove both the
  // exact transferred element and its promoted runtime subtree. Relaunch is a
  // fresh document because OffscreenCanvas transfer is one-shot anyway.
  viewportCanvas.hidden = true;
  viewportCanvas.remove();
  overlay.remove();
  return !viewportCanvas.isConnected && !overlay.isConnected;
}

function beginRuntimeStart() {
  if (runtimeStarted) return Promise.resolve();
  if (!runtimeStartPromise) {
    const attempt = start();
    runtimeStartPromise = attempt;
    void attempt.catch(() => {
      if (runtimeStartPromise === attempt) runtimeStartPromise = null;
    });
  }
  return runtimeStartPromise;
}

startButton.addEventListener("click", () => {
  void beginRuntimeStart().catch(() => {});
});

async function launchFromDesktop() {
  if (runtimeClosing && runtimeShutdownPromise) {
    await runtimeShutdownPromise;
  }
  if (runtimeClosed) {
    throw new Error("The closed game runtime must be restarted in a fresh page");
  }
  overlay.hidden = false;
  if (!runtimeStarted) {
    overlay.classList.remove("is-running");
    document.querySelector("#launchLoader")?.removeAttribute("hidden");
    viewportCanvas.hidden = true;
    return beginRuntimeStart();
  }
  overlay.classList.add("is-running");
  viewportCanvas.hidden = false;
  gameRunning = true;
  renderPerformanceOverlay();
  if (activeRpc) {
    const logicFps = Math.min(240, positiveNumberParam("logicFps", DEFAULT_LOGIC_FPS));
    const clientFps = Math.min(240, positiveNumberParam("clientFps", DEFAULT_CLIENT_FPS));
    await activeRpc("threadedStartLoop", { clientFps, logicFps });
  }
  viewportCanvas.focus();
}

async function exitToDesktop() {
  if (runtimeShutdownPromise) return runtimeShutdownPromise;
  if (!activeRpc || !runtimeStarted) return null;

  runtimeClosing = true;
  const runtimeRpc = activeRpc;
  const shutdown = (async () => {
    let viewportRetired = false;
    try {
      progressNode.textContent = "Closing Zero Hour…";
      gameRunning = false;
      renderPerformanceOverlay();
      viewportRetired = retireRuntimeViewport();
      overlay.hidden = true;
      overlay.classList.remove("is-running");

      const sequence = await runRuntimeShutdownSequence({
        stopSaveScheduling: () => window.CnCPort.stopSavePersistenceScheduling(),
        stopLoop: () => runtimeRpc("threadedStopLoop", { timeoutMs: 5000 }),
        persistFinalSave: () => window.CnCPort.persistFinalSaves("launcher-exit-final"),
        gracefulShutdown: () => runtimeRpc("shutdownRuntime", {}),
        forceShutdown: () => window.CnCPort.rpc("forceShutdownRuntime", {}),
      });
      const result = {
        ...sequence.result,
        close: { viewportRetired, ...sequence.close },
      };
      const warning = runtimeShutdownWarning(result);
      if (warning) window.ZeroHDesktop?.showToast(warning.title, warning.message, "warning");
      track("game_exit", { kind: "game_to_desktop", result: result.ok === false ? "failed" : "success" });
      return result;
    } catch (error) {
      const result = {
        ok: false,
        error: error?.message ?? String(error),
        close: { viewportRetired, finalSaveFresh: false },
      };
      const warning = runtimeShutdownWarning(result);
      window.ZeroHDesktop?.showToast(warning.title, warning.message, "warning");
      track("game_exit", { kind: "game_to_desktop", result: "failed" });
      return result;
    } finally {
      window.CnCPort.disconnectAgentBridge?.();
      gameRunning = false;
      renderPerformanceOverlay();
      overlay.hidden = true;
      overlay.classList.remove("is-running");
      runtimeStarted = false;
      syncAgentBridgeApp();
      runtimeClosed = true;
      runtimeClosing = false;
      activeRpc = null;
      window.dispatchEvent(new CustomEvent("cncport:runtimeclosed"));
    }
  })();
  runtimeShutdownPromise = shutdown;
  return shutdown;
}

window.ZeroHRuntime = {
  launch: launchFromDesktop,
  exit: exitToDesktop,
  get started() { return runtimeStarted; },
  get closed() { return runtimeClosed; },
  get closing() { return runtimeClosing; },
};

window.addEventListener("cncport:runtimequit", () => {
  if (!runtimeStarted || runtimeClosing || runtimeClosed) return;
  void exitToDesktop();
});

window.addEventListener("keydown", (event) => {
  if (!gameRunning || !event.ctrlKey || !event.altKey || event.key !== "Escape") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void exitToDesktop();
}, { capture: true });

if (queryParams.get("autostart") === "1") {
  void beginRuntimeStart().catch(() => {});
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
      headLastModifiedMs(new URL(`../${selectedDistDir}/cnc-port.wasm`, document.baseURI)),
      headLastModifiedMs(new URL("./bridge.js", document.baseURI)),
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

function setConsoleVisible(show) {
  consolePanel.classList.toggle("hidden", !show);
  if (show) {
    renderConsole();
    consolePanel.scrollTop = consolePanel.scrollHeight;
    consoleTimer = setInterval(renderConsole, 1000);
  } else if (consoleTimer) {
    clearInterval(consoleTimer);
    consoleTimer = null;
  }
  return show;
}

function toggleConsole() {
  return setConsoleVisible(consolePanel.classList.contains("hidden"));
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

consoleToggle?.addEventListener("click", toggleConsole);
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
//   * Engine-initiated changes (the original in-game Options screen) are
//     mirrored into persisted host intent — one source of truth.
let activeRpc = null;
let displayRuntimeReady = false;
const fullscreenTarget = document.querySelector("#desktop") || document.body;
const fullscreenCanvasTarget = document.querySelector(".shell") || document.body;

// The menus are authored for >= 800x600; the engine-side hook additionally
// clamps at 640x480..7680x4320. Dynamic sizing clamps to the authored minimum
// so tiny windows scale the render down via CSS instead of breaking layouts.
// Dynamic iPad rendering uses its CSS pixel grid rather than DPR 2-3. The
// original 800x600 path worked on these devices; multiplying the whole game
// framebuffer (including depth/stencil) by DPR consumed enough GPU memory for
// Safari to lose or corrupt the context. iPhone keeps the existing 2.4MP cap,
// desktop keeps the 4K-equivalent cap, and explicit fixed/custom choices stay
// uncapped by the automatic policy.
const IS_IPAD_LIKE = isIPadLikeNavigator(navigator);
const IS_IOS_LIKE = isIOSLikeNavigator(navigator);

function normalizeDisplaySettings(settings) {
  if (settings?.mode === "fixed") {
    const width = Number(settings.width);
    const height = Number(settings.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new TypeError("fixed display mode requires finite width and height");
    }
    return { mode: "fixed", ...clampResolution(width, height) };
  }
  if (settings?.mode === "dynamic") {
    return { mode: "dynamic" };
  }
  throw new TypeError('display mode must be {mode:"dynamic"} or {mode:"fixed", width, height}');
}

let displaySettings = window.CnCPortPlayConfig?.display
  ? normalizeDisplaySettings(window.CnCPortPlayConfig.display)
  : loadDisplaySettings();
let lastAppliedResolution = null; // {width,height} last reported by the engine

// The canvas CSS box x devicePixelRatio: the display's real pixel grid, so
// rendering at this size is 1:1 sharp (no upscale blur). iPad is the deliberate
// exception described above. Returns null during degenerate layouts
// (mid-fullscreen-transition, hidden canvas) so callers skip instead of pushing
// a broken size into the engine.
function dynamicTargetResolution() {
  const rect = viewportCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = rect.width || window.innerWidth || 0;
  const cssHeight = rect.height || window.innerHeight || 0;
  return dynamicResolutionForBox({
    cssWidth,
    cssHeight,
    devicePixelRatio: dpr,
    iosLike: IS_IOS_LIKE,
    ipadLike: IS_IPAD_LIKE,
  });
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

function setDisplaySettings(next, reason = "host") {
  displaySettings = normalizeDisplaySettings(next);
  saveDisplaySettings(displaySettings);
  if (desktopGameSettingsBound) syncDesktopGameSettings();
  return applyDisplaySettings(reason).then(() => ({ ...displaySettings }));
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
  if (source !== "engine" || !displayRuntimeReady) {
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
  if (desktopGameSettingsBound) syncDesktopGameSettings();
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
  // Toggle the CSS fullscreen state (chrome hidden, canvas scaled to the
  // screen, letterboxed on black via object-fit: contain), then treat the
  // enter/exit as a viewport geometry change: in Dynamic mode the engine
  // resolution follows the new canvas box (debounced + rAF-deferred +
  // degenerate-size-guarded in the geometry handler, so the mid-transition
  // rects that used to break the render target are skipped) — fullscreen is
  // 1:1 sharp. In fixed mode the engine keeps its resolution and only the CSS
  // scale changes. Input stays correct either way: canvasInputPointFromEvent
  // maps through the letterboxed content box to the engine display size.
  fullscreenCanvasTarget.classList.toggle("is-fullscreen", active);
  const fullscreenButton = document.querySelector("#fullscreenButton");
  if (fullscreenButton) {
    fullscreenButton.textContent = active ? "Exit fullscreen" : "Enter fullscreen";
  }
  onViewportGeometryChange();
}

// --- live tracking of tab size / DPR / fullscreen -----------------------------
let resizeSettleTimer = null;
function onViewportGeometryChange() {
  if (document.documentElement.classList.contains("touch-keyboard-open")) {
    if (resizeSettleTimer) {
      clearTimeout(resizeSettleTimer);
      resizeSettleTimer = null;
    }
    return;
  }
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
      void applyDisplaySettings("geometry");
    });
  }, 350);
}

function initDisplayRuntime() {
  if (displayRuntimeReady) {
    return;
  }
  displayRuntimeReady = true;

  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  window.addEventListener("resize", onViewportGeometryChange);
  window.addEventListener("cncport:virtualkeyboardchange", (event) => {
    if (event.detail?.open === false) onViewportGeometryChange();
  });
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

let desktopGameSettingsBound = false;

function syncDesktopGameSettings() {
  const resolutionSelect = document.querySelector("#resolutionSelectLive");
  const customRow = document.querySelector("#customResolutionRow");
  const customWidth = document.querySelector("#customResolutionWidth");
  const customHeight = document.querySelector("#customResolutionHeight");
  if (resolutionSelect) {
    if (displaySettings.mode === "dynamic") {
      resolutionSelect.value = "dynamic";
      customRow?.setAttribute("hidden", "");
    } else {
      const fixedValue = `${displaySettings.width}x${displaySettings.height}`;
      const hasPreset = Boolean(resolutionSelect.querySelector(`option[value="${fixedValue}"]`));
      resolutionSelect.value = hasPreset ? fixedValue : "custom";
      customRow?.toggleAttribute("hidden", hasPreset);
      if (customWidth) customWidth.value = String(displaySettings.width);
      if (customHeight) customHeight.value = String(displaySettings.height);
    }
  }
  const performanceToggle = document.querySelector("#performanceOverlayToggle");
  if (performanceToggle) performanceToggle.checked = performanceOverlayConfig.enabled;
  const historySelect = document.querySelector("#performanceHistorySelect");
  if (historySelect) historySelect.value = String(performanceOverlayConfig.historySeconds);
  const graphMaxSelect = document.querySelector("#performanceGraphMaxSelect");
  if (graphMaxSelect) graphMaxSelect.value = String(performanceOverlayConfig.graphMaxMs);
  const diagnosticsSelect = document.querySelector("#diagnosticsSelect");
  if (diagnosticsSelect) diagnosticsSelect.value = configuredDiagLevel;
  const shaderTierSelect = document.querySelector("#shaderTierSelect");
  if (shaderTierSelect) shaderTierSelect.value = effectiveShaderTier();
  const cameraZoomInput = document.querySelector("#cameraZoomHeight");
  const cameraZoomOutput = document.querySelector("#cameraZoomHeightValue");
  if (cameraZoomInput) cameraZoomInput.value = String(cameraZoomHeight);
  if (cameraZoomOutput) cameraZoomOutput.value = String(cameraZoomHeight);
  const gameCursorToggle = document.querySelector("#gameCursorToggle");
  if (gameCursorToggle) gameCursorToggle.checked = cursorStyle === "game";
  const fullscreenButton = document.querySelector("#fullscreenButton");
  if (fullscreenButton) {
    fullscreenButton.hidden = !fullscreenSupported();
    fullscreenButton.textContent = fullscreenElement() ? "Exit fullscreen" : "Enter fullscreen";
  }
}

function bindDesktopGameSettings() {
  if (desktopGameSettingsBound) return;
  desktopGameSettingsBound = true;
  const resolutionSelect = document.querySelector("#resolutionSelectLive");
  resolutionSelect?.addEventListener("change", () => {
    const value = resolutionSelect.value;
    const customRow = document.querySelector("#customResolutionRow");
    if (value === "dynamic") {
      customRow?.setAttribute("hidden", "");
      void setDisplaySettings({ mode: "dynamic" }, "desktop-settings");
      track("setting_changed", { category: "display", setting: "resolution_mode", value: "dynamic" });
      return;
    }
    if (value === "custom") {
      customRow?.removeAttribute("hidden");
      const seed = lastAppliedResolution ?? targetResolutionForSettings();
      if (seed) {
        document.querySelector("#customResolutionWidth").value = String(seed.width);
        document.querySelector("#customResolutionHeight").value = String(seed.height);
      }
      return;
    }
    const match = /^(\d+)x(\d+)$/.exec(value);
    if (match) {
      customRow?.setAttribute("hidden", "");
      void setDisplaySettings({
        mode: "fixed",
        width: Number(match[1]),
        height: Number(match[2]),
      }, "desktop-settings");
      track("setting_changed", { category: "display", setting: "resolution_mode", value: "fixed" });
    }
  });
  document.querySelector("#customResolutionApply")?.addEventListener("click", () => {
    const width = Number(document.querySelector("#customResolutionWidth")?.value);
    const height = Number(document.querySelector("#customResolutionHeight")?.value);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    void setDisplaySettings({ mode: "fixed", width, height }, "desktop-settings-custom");
    track("setting_changed", { category: "display", setting: "resolution_mode", value: "fixed" });
  });
  document.querySelector("#fullscreenButton")?.addEventListener("click", () => {
    track("setting_changed", { category: "display", setting: "fullscreen", value: fullscreenElement() ? "disabled" : "enabled" });
    void (fullscreenElement() ? exitFullscreen() : enterFullscreen());
  });
  document.querySelector("#shaderTierSelect")?.addEventListener("change", (event) => {
    setShaderTier(event.currentTarget.value);
    track("setting_changed", { category: "shader", setting: "shader_tier", value: event.currentTarget.value === "ff" ? "classic" : "enhanced" });
  });
  const cameraZoomInput = document.querySelector("#cameraZoomHeight");
  const updateCameraZoomOutput = () => {
    const height = normalizeCameraZoomHeight(cameraZoomInput?.value);
    const output = document.querySelector("#cameraZoomHeightValue");
    if (output) output.value = String(height);
  };
  cameraZoomInput?.addEventListener("input", updateCameraZoomOutput);
  cameraZoomInput?.addEventListener("change", (event) => {
    cameraZoomHeight = saveCameraZoomHeight(networkStorage, event.currentTarget.value);
    syncDesktopGameSettings();
    track("setting_changed", { category: "gameplay", setting: "camera_zoom", value: String(cameraZoomHeight) });
  });
  document.querySelector("#gameCursorToggle")?.addEventListener("change", (event) => {
    cursorStyle = saveCursorStyle(networkStorage, event.currentTarget.checked ? "game" : "system");
    window.dispatchEvent(new CustomEvent("cncport:cursorstylechange", {
      detail: { style: cursorStyle },
    }));
    track("setting_changed", {
      category: "display",
      setting: "cursor_style",
      value: cursorStyle === "game" ? "original" : "system",
    });
  });
  document.querySelector("#performanceOverlayToggle")?.addEventListener("change", (event) => {
    setPerformanceOverlay({ enabled: event.currentTarget.checked });
    track("setting_changed", { category: "performance", setting: "performance_overlay", value: event.currentTarget.checked ? "enabled" : "disabled" });
  });
  const updateGraphSettings = () => {
    const history = Number(document.querySelector("#performanceHistorySelect")?.value);
    setPerformanceOverlay({
      historySeconds: history,
      graphMaxMs: Number(document.querySelector("#performanceGraphMaxSelect")?.value),
    });
    track("setting_changed", { category: "performance", setting: "performance_window", value: history <= 3 ? "short" : history <= 6 ? "medium" : "long" });
  };
  document.querySelector("#performanceHistorySelect")?.addEventListener("change", updateGraphSettings);
  document.querySelector("#performanceGraphMaxSelect")?.addEventListener("change", updateGraphSettings);
  document.querySelector("#diagnosticsSelect")?.addEventListener("change", (event) => {
    setConfiguredDiagLevel(event.currentTarget.value);
    track("setting_changed", { category: "diagnostics", setting: "diagnostics_level", value: event.currentTarget.value });
  });
  syncDesktopGameSettings();
}

function effectiveShaderTier() {
  let storedTier = null;
  try {
    storedTier = window.localStorage?.getItem("cncPortShaderTier") ?? null;
  } catch {
    // Storage is optional; URL and default selection still apply.
  }
  return resolveShaderTier({ search: queryParams, storedTier }).tier;
}

function setShaderTier(tier, { reload = false } = {}) {
  if (tier !== "ff" && tier !== "ps11") {
    throw new TypeError('shader tier must be "ff" or "ps11"');
  }
  try {
    window.localStorage?.setItem("cncPortShaderTier", tier);
  } catch {
    // Storage is optional. The host can retain CnCPortPlayConfig itself.
  }
  if (reload) {
    const reloadUrl = new URL(window.location.href);
    reloadUrl.searchParams.delete("shaderTier");
    window.location.href = reloadUrl.href;
  }
  return {
    tier,
    requiresReload: gameRunning,
    overriddenByUrl: queryParams.has("shaderTier"),
  };
}

let agentBridgeApp = null;

function syncAgentBridgeTokenHelp() {
  if (!agentBridgeApp) return;
  agentBridgeApp.tokenHelp.textContent = agentBridgeApp.rememberToken.checked
    ? "Stored on this browser profile until you turn remembering off or clear site data."
    : "Kept only in memory until this page closes.";
}

function populateAgentBridgeForm(config, { rememberToken } = {}) {
  if (!agentBridgeApp) return;
  agentBridgeApp.url.value = String(config?.url ?? "webrtc://relay.newshoes.gg/agent");
  agentBridgeApp.token.value = String(config?.token ?? "");
  agentBridgeApp.session.value = String(config?.sessionId ?? "game-1") || "game-1";
  const mode = String(config?.playMode ?? "global");
  agentBridgeApp.mode.value = mode === "camera" ? "camera" : "global";
  if (rememberToken !== undefined) {
    agentBridgeApp.rememberToken.checked = rememberToken === true;
  }
  agentBridgeApp.token.type = "password";
  agentBridgeApp.reveal.textContent = "Show";
  agentBridgeApp.reveal.setAttribute("aria-pressed", "false");
  syncAgentBridgeTokenHelp();
}

function agentBridgeFormConfiguration() {
  return {
    url: agentBridgeApp.url.value.trim(),
    token: agentBridgeApp.token.value,
    sessionId: agentBridgeApp.session.value.trim(),
    playMode: agentBridgeApp.mode.value,
  };
}

function agentBridgeStatusPresentation() {
  const enabled = agentBridgeApp?.enabled.checked === true;
  if (agentBridgeApp?.testState === "testing") {
    return {
      state: "connecting",
      title: "Testing the bridge connection",
      detail: "Establishing the peer connection and authenticating with the browser token…",
    };
  }
  if (agentBridgeApp?.testState === "success") {
    return {
      state: "connected",
      title: "Bridge connection verified",
      detail: agentBridgeApp.testDetail,
    };
  }
  if (agentBridgeApp?.testState === "error") {
    return {
      state: "error",
      title: "Connection test failed",
      detail: agentBridgeApp.testDetail,
    };
  }
  if (agentBridgeApp?.error) {
    return {
      state: "error",
      title: "Configuration needs attention",
      detail: agentBridgeApp.error,
    };
  }
  if (!runtimeStarted) {
    if (!enabled) {
      return {
        state: "disabled",
        title: "Remote Agent is disabled",
        detail: agentBridgeApp?.dirty
          ? "Apply to keep the next launch free of agent bridge activity."
          : "Enable it and apply a connection before launching the game.",
      };
    }
    if (agentBridgeApp?.dirty || !agentBridgeConfiguration) {
      return {
        state: "ready",
        title: "Connection details are not applied yet",
        detail: "Apply this configuration before launching Zero Hour.",
      };
    }
    return {
      state: "ready",
      title: "Ready for the next launch",
      detail: `${publicAgentBridgeEndpoint(agentBridgeConfiguration.url)} · ${agentBridgeConfiguration.playMode} mode · ${agentBridgeConfiguration.sessionId}`,
    };
  }
  if (!agentBridgeConfiguration) {
    return {
      state: "disabled",
      title: "This game started without a remote agent",
      detail: "No agent bridge module, socket, polling, or reconnect timer is active.",
    };
  }
  const state = window.CnCPort?.getAgentBridgeState?.() ?? { phase: "disabled" };
  if (state.phase === "connected" && state.connected === true) {
    return {
      state: "connected",
      title: "Remote agent connected",
      detail: `${state.endpoint ?? publicAgentBridgeEndpoint(agentBridgeConfiguration.url)} · ${state.playMode ?? agentBridgeConfiguration.playMode} mode · ${state.sessionId ?? agentBridgeConfiguration.sessionId}`,
    };
  }
  if (state.phase === "reconnecting" || state.phase === "disconnected") {
    return {
      state: "error",
      title: "Remote agent disconnected",
      detail: "The browser is retrying. Check that the bridge process is running and its browser token matches.",
    };
  }
  if (state.phase === "stopped") {
    return {
      state: "error",
      title: "Remote agent connection stopped",
      detail: "Reload the page before starting another connected game.",
    };
  }
  const title = state.phase === "authenticating"
    ? "Authenticating with the bridge"
    : state.phase === "connecting"
      ? "Connecting to the bridge"
      : "Waiting for engine initialization";
  return {
    state: "connecting",
    title,
    detail: "The authenticated connection becomes available after the real engine frame loop starts.",
  };
}

function syncAgentBridgeApp({ configurationChanged = false } = {}) {
  if (!agentBridgeApp) return;
  if (configurationChanged) {
    agentBridgeApp.enabled.checked = Boolean(agentBridgeConfiguration);
    populateAgentBridgeForm(agentBridgeConfiguration);
    agentBridgeApp.dirty = false;
    agentBridgeApp.error = "";
  }
  const enabled = agentBridgeApp.enabled.checked;
  const testing = agentBridgeApp.testState === "testing";
  agentBridgeApp.enabled.disabled = runtimeStarted || testing;
  agentBridgeApp.fields.disabled = runtimeStarted || !enabled || testing;
  agentBridgeApp.test.disabled = runtimeStarted || !enabled || testing;
  agentBridgeApp.apply.disabled = runtimeStarted || testing;
  agentBridgeApp.lock.hidden = !runtimeStarted;
  agentBridgeApp.errorNode.hidden = !agentBridgeApp.error;
  agentBridgeApp.errorNode.textContent = agentBridgeApp.error;
  const presentation = agentBridgeStatusPresentation();
  agentBridgeApp.status.dataset.state = presentation.state;
  agentBridgeApp.status.querySelector("strong").textContent = presentation.title;
  agentBridgeApp.status.querySelector("small").textContent = presentation.detail;
  agentBridgeApp.form.dataset.configured = agentBridgeConfiguration ? "true" : "false";
}

function bindAgentBridgeApp() {
  if (agentBridgeApp) return;
  const form = document.querySelector("#agentBridgeForm");
  if (!form) return;
  agentBridgeApp = {
    form,
    enabled: document.querySelector("#agentBridgeEnabled"),
    fields: document.querySelector("#agentBridgeFields"),
    url: document.querySelector("#agentBridgeUrl"),
    token: document.querySelector("#agentBridgeToken"),
    tokenHelp: document.querySelector("#agentBridgeTokenHelp"),
    reveal: document.querySelector("#agentBridgeTokenReveal"),
    rememberToken: document.querySelector("#agentBridgeRememberToken"),
    session: document.querySelector("#agentBridgeSession"),
    mode: document.querySelector("#agentBridgeMode"),
    errorNode: document.querySelector("#agentBridgeError"),
    status: document.querySelector("#agentBridgeStatus"),
    lock: document.querySelector("#agentBridgeLockNotice"),
    test: document.querySelector("#agentBridgeTest"),
    apply: document.querySelector("#agentBridgeApply"),
    dirty: false,
    error: agentBridgeConfigurationError,
    testState: "idle",
    testDetail: "",
  };
  const hostDraft = hostAgentBridgeConfiguration && typeof hostAgentBridgeConfiguration === "object"
    ? hostAgentBridgeConfiguration : null;
  const initialDraft = agentBridgeConfiguration ?? hostDraft ?? rememberedAgentBridgeSettings;
  agentBridgeApp.enabled.checked = hostAgentBridgeConfiguration == null
    ? rememberedAgentBridgeSettings.enabled : Boolean(hostDraft);
  populateAgentBridgeForm(initialDraft, {
    rememberToken: hostAgentBridgeConfiguration == null
      && rememberedAgentBridgeSettings.rememberToken,
  });
  const markDirty = () => {
    if (runtimeStarted) return;
    agentBridgeApp.dirty = true;
    agentBridgeApp.error = "";
    agentBridgeApp.testState = "idle";
    agentBridgeApp.testDetail = "";
    syncAgentBridgeApp();
  };
  agentBridgeApp.enabled.addEventListener("change", markDirty);
  agentBridgeApp.fields.addEventListener("input", markDirty);
  agentBridgeApp.fields.addEventListener("change", markDirty);
  agentBridgeApp.rememberToken.addEventListener("change", () => {
    if (!agentBridgeApp.rememberToken.checked) forgetAgentBridgeToken(networkStorage);
    syncAgentBridgeTokenHelp();
  });
  agentBridgeApp.reveal.addEventListener("click", () => {
    const reveal = agentBridgeApp.token.type === "password";
    agentBridgeApp.token.type = reveal ? "text" : "password";
    agentBridgeApp.reveal.textContent = reveal ? "Hide" : "Show";
    agentBridgeApp.reveal.setAttribute("aria-pressed", String(reveal));
  });
  agentBridgeApp.test.addEventListener("click", async () => {
    agentBridgeApp.error = "";
    agentBridgeApp.testState = "testing";
    agentBridgeApp.testDetail = "";
    syncAgentBridgeApp();
    try {
      const config = normalizeAgentBridgeConfiguration(agentBridgeFormConfiguration());
      const { probeAgentBridgeConnection } = await import("./agent_bridge.mjs");
      const result = await probeAgentBridgeConnection({ config });
      agentBridgeApp.testState = "success";
      agentBridgeApp.testDetail = `${result.endpoint} · authenticated ${result.protocol}; apply these settings for the next launch.`;
    } catch (error) {
      agentBridgeApp.testState = "error";
      agentBridgeApp.testDetail = error?.message ?? String(error);
    }
    syncAgentBridgeApp();
  });
  agentBridgeApp.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    agentBridgeApp.error = "";
    try {
      const enabled = agentBridgeApp.enabled.checked;
      const config = agentBridgeFormConfiguration();
      const rememberToken = agentBridgeApp.rememberToken.checked;
      await configurePlay({
        agentBridge: enabled ? config : null,
      });
      saveAgentBridgeSettings(networkStorage, {
        enabled,
        ...config,
        rememberToken,
      });
      agentBridgeApp.enabled.checked = enabled;
      populateAgentBridgeForm(config, { rememberToken });
      agentBridgeApp.dirty = false;
      agentBridgeApp.testState = "idle";
      agentBridgeApp.testDetail = "";
      syncAgentBridgeApp();
      track("setting_changed", {
        category: "agent_bridge",
        setting: "enabled",
        value: enabled ? agentBridgeApp.mode.value : "disabled",
      });
    } catch (error) {
      agentBridgeApp.error = error?.message ?? String(error);
      syncAgentBridgeApp();
    }
  });
  window.addEventListener("cncport:agentbridge", () => syncAgentBridgeApp());
  syncAgentBridgeApp();
}

function playConfiguration() {
  return {
    performanceOverlay: { ...performanceOverlayConfig },
    display: { ...displaySettings },
    diagnostics: configuredDiagLevel,
    shaderTier: effectiveShaderTier(),
    cursorStyle,
    maxCameraHeight: cameraZoomHeight,
    agentBridge: agentBridgeConfiguration ? {
      configured: true,
      url: publicAgentBridgeEndpoint(agentBridgeConfiguration.url),
      sessionId: agentBridgeConfiguration.sessionId || null,
      playMode: agentBridgeConfiguration.playMode,
    } : { configured: false },
    consoleVisible: !consolePanel.classList.contains("hidden"),
    fullscreen: Boolean(fullscreenElement()),
  };
}

async function configurePlay(options = {}) {
  if (Object.hasOwn(options, "performanceOverlay")) {
    setPerformanceOverlay(options.performanceOverlay);
  }
  if (options.display) {
    await setDisplaySettings(options.display, "host-configure");
  }
  if (options.diagnostics === "full" || options.diagnostics === "lite") {
    setConfiguredDiagLevel(options.diagnostics);
  }
  if (options.shaderTier === "ff" || options.shaderTier === "ps11") {
    setShaderTier(options.shaderTier);
  }
  if (Object.hasOwn(options, "maxCameraHeight")) {
    cameraZoomHeight = saveCameraZoomHeight(networkStorage, options.maxCameraHeight);
  }
  if (Object.hasOwn(options, "agentBridge")) {
    if (runtimeStarted) {
      throw new Error("agent bridge configuration must be set before launching the game");
    }
    agentBridgeConfiguration = options.agentBridge == null
      ? null
      : normalizeAgentBridgeConfiguration(options.agentBridge);
    agentBridgeConfigurationError = "";
    syncAgentBridgeApp({ configurationChanged: true });
  }
  if (typeof options.consoleVisible === "boolean") {
    setConsoleVisible(options.consoleVisible);
  }
  if (typeof options.fullscreen === "boolean") {
    if (options.fullscreen && !fullscreenElement()) await enterFullscreen();
    if (!options.fullscreen && fullscreenElement()) await exitFullscreen();
  }
  if (desktopGameSettingsBound) syncDesktopGameSettings();
  return playConfiguration();
}

function installPlayHostApi() {
  if (!window.CnCPort) {
    setTimeout(installPlayHostApi, 0);
    return;
  }
  window.CnCPort.play = {
    configure: configurePlay,
    getConfiguration: playConfiguration,
    setPerformanceOverlay,
    getPerformanceSnapshot: () => performanceOverlaySnapshot
      ? {
          ...performanceOverlaySnapshot,
          engineFrameMs: [...performanceOverlaySnapshot.engineFrameMs],
          presentationFrameMs: [...performanceOverlaySnapshot.presentationFrameMs],
        }
      : null,
    setDisplayMode: (settings) => setDisplaySettings(settings, "host"),
    getDisplayMode: () => ({ ...displaySettings }),
    enterFullscreen,
    exitFullscreen,
    fullscreenSupported,
    setShaderTier,
    getShaderTier: effectiveShaderTier,
    setMaxCameraHeight: (height) => {
      cameraZoomHeight = saveCameraZoomHeight(networkStorage, height);
      if (desktopGameSettingsBound) syncDesktopGameSettings();
      return cameraZoomHeight;
    },
    getMaxCameraHeight: () => cameraZoomHeight,
    setDiagnosticsLevel: setConfiguredDiagLevel,
    setNetworkDiagnostics: setNetworkDiagnosticsEnabled,
    getNetworkDiagnostics: () => window.__cncNetworkDiagnosticsSnapshot?.() ?? null,
    getAgentBridgeState: () => window.CnCPort.getAgentBridgeState(),
    setConsoleVisible,
    issues: {
      startRecording: (...args) => issueRecorder.startRecording(...args),
      stopRecording: (...args) => issueRecorder.stopRecording(...args),
      report: (...args) => issueRecorder.openIssueDialog(...args),
      download: (...args) => issueRecorder.downloadDump(...args),
      upload: (...args) => issueRecorder.uploadDump(...args),
    },
  };
}

if (window.CnCPortPlayConfig?.shaderTier === "ff"
    || window.CnCPortPlayConfig?.shaderTier === "ps11") {
  setShaderTier(window.CnCPortPlayConfig.shaderTier);
}
initDisplayRuntime();
bindDesktopGameSettings();
bindAgentBridgeApp();
installPlayHostApi();
