#!/usr/bin/env node
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startNostrTestRelayServer } from "./nostr-test-relay-server.mjs";
import { startStaticServer } from "./static-server.mjs";
import {
  emulatedXrEyeSeparationMeters,
  installEmulatedWebXr,
} from "./webxr-emulator-init.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const artifactRoot = resolve(wasmRoot, "artifacts/networking");
const GAME_LAN = 1;
const playerCount = Number.parseInt(process.env.CNC_MATCH_PLAYERS ?? "2", 10);
const threadedTest = process.env.CNC_THREADED === "1";
const webXrHost = process.env.CNC_WEBXR_HOST === "1";
const allowWebGlContextLoss = process.env.CNC_ALLOW_WEBGL_CONTEXT_LOSS === "1";
const captureNetworkDiagnostics = process.env.CNC_NETWORK_DIAGNOSTICS === "1";
const soakMs = Number.parseInt(process.env.CNC_MATCH_SOAK_MS ?? "0", 10);
const minimumLogicFps = Number.parseFloat(process.env.CNC_MIN_LOGIC_FPS ?? "0");
const maximumLogicStallMs = Number.parseInt(process.env.CNC_MAX_LOGIC_STALL_MS ?? "0", 10);
// Autonomous threaded clients may use the stock 30-frame network run-ahead
// while their render loops start at slightly different times.
const maxAllowedLogicFrameSkew = threadedTest ? Math.max(30, playerCount - 1) : playerCount - 1;
const maxAllowedFinalLogicFrameSkew = maxAllowedLogicFrameSkew;
const activeSampleInterval = threadedTest ? 5 : 30;
const manualNetworkFrameIntervalMs = Math.ceil(1000 / 30);
const publicDiscovery = process.env.CNC_TRYSTERO_PUBLIC === "1";
const configuredRelayUrls = String(process.env.CNC_TRYSTERO_RELAYS ?? "")
  .split(",").map((url) => url.trim()).filter(Boolean);
let parallelClientFrames = false;

if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
  throw new Error(`CNC_MATCH_PLAYERS must be between 2 and 8, received ${process.env.CNC_MATCH_PLAYERS}`);
}
if (webXrHost && !threadedTest) {
  throw new Error("CNC_WEBXR_HOST requires CNC_THREADED=1 for Window-owned WebXR rendering");
}
if (!Number.isInteger(soakMs) || soakMs < 0
    || !Number.isFinite(minimumLogicFps) || minimumLogicFps < 0
    || !Number.isInteger(maximumLogicStallMs) || maximumLogicStallMs < 0) {
  throw new Error("invalid multiplayer soak configuration");
}

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

function expect(condition, message, payload = null) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(payload)}`);
}

function sameEnginePath(left, right) {
  return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
}

function isExpectedBrowserWarning(error) {
  if (/Trystero peer error: OperationError: User-Initiated Abort, reason=Close called/i
    .test(error)) return true;
  return allowWebGlContextLoss && /WebGL context (?:LOST|restored)/i.test(error);
}

function archives(baseUrl) {
  return archiveSpecs.map((spec) => ({
    name: spec.name,
    sourceName: spec.sourceName ?? spec.name,
    url: new URL(`artifacts/real-assets/${spec.sourceName ?? spec.name}`, baseUrl).href,
  }));
}

async function rpc(client, command, payload = {}) {
  return client.page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function browserRenderer(client) {
  if (threadedTest) {
    const result = await rpc(client, "threadedStatus");
    return {
      renderer: result.status?.graphics?.renderer ?? null,
      unmaskedRenderer: result.status?.graphics?.renderer ?? null,
    };
  }
  return client.page.evaluate(() => {
    const canvas = document.querySelector("#viewport");
    const gl = canvas?.getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: gl?.getParameter(gl.RENDERER) ?? null,
      unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
}

async function webXrState(client) {
  return client.page.evaluate(() => window.CnCPort?.getWebXrState?.() ?? null);
}

async function startWebXr(client) {
  const probe = await client.page.evaluate(() => window.CnCPort.probeWebXrSession());
  expect(probe?.support?.immersiveVrSupported === true,
    `${client.label} could not prepare an immersive session`, probe);
  await client.page.evaluate(() => window.CnCPort.startWebXrSession());
  return waitFor(`${client.label} immersive session`, () => webXrState(client),
    (state) => state?.phase === "running" && state.renderer?.active === true,
  30000, 50);
}

async function frame(client, frames = 1) {
  const result = await rpc(client, "realEngineFrameSummary", { frames });
  expect(result.ok === true && result.aborted === false,
    `${client.label} engine frame failed`, result);
  return result.frame;
}

async function fullFrame(client, frames = 1) {
  const result = await rpc(client, "realEngineFrame", { frames });
  expect(result.ok === true && result.aborted === false,
    `${client.label} full engine frame failed`, result);
  return result.frame;
}

async function allFrames(clients, frames = 1) {
  if (parallelClientFrames) {
    return Promise.all(clients.map((client) => frame(client, frames)));
  }
  // Keep each peer's synchronous engine+present call separate. This returns
  // to the browser between peers (letting RTCDataChannel events drain) and
  // avoids asking one browser GPU process to service several blocking presents
  // concurrently.
  const results = [];
  for (const client of clients) {
    results.push(await frame(client, frames));
  }
  return results;
}

async function lanState(client) {
  const result = await rpc(client, "realEngineLanState");
  expect(result.ok === true, `${client.label} LAN state query failed`, result);
  return result.lan;
}

async function lanCommand(client, action, value = "") {
  return rpc(client, "realEngineLanCommand", { action, value });
}

async function waitFor(label, read, predicate, timeoutMs = 30000, intervalMs = 220) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) return last;
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs));
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)}`);
}

function networkGrouping(state) {
  const network = state?.network;
  return network?.slots?.filter((slot) => slot.slot !== network.localPlayerId
    && slot.connectionQueue >= 0).map((slot) => slot.frameGroupingMs) ?? [];
}

function bridgePacketAccounting(diagnostics) {
  const received = diagnostics?.packets?.filter((packet) => packet.direction === "receive"
    && packet.destinationPort === 8088 && packet.outcome === "queued-for-engine") ?? [];
  const dequeued = new Set((diagnostics?.events ?? [])
    .filter((event) => event.type === "bridge.incoming.dequeued-by-engine")
    .map((event) => event.detail?.traceId));
  const explicitDrops = (diagnostics?.events ?? []).filter((event) =>
    (event.type === "bridge.incoming.deferred-overflow"
      || event.type === "bridge.incoming.deferred-expired"
      || event.type === "bridge.incoming.capacity-drop"
      || event.type === "bridge.incoming.dropped")
      && event.detail?.destinationPort === 8088);
  return {
    received: received.length,
    dequeued: received.filter((packet) => dequeued.has(packet.traceId)).length,
    missing: received.filter((packet) => !dequeued.has(packet.traceId)).map((packet) => packet.traceId),
    explicitDrops,
  };
}

async function pumpLobby(clients) {
  await Promise.all(clients.map((client) => lanCommand(client, "update")));
  await allFrames(clients, 1);
}

async function clickWindow(client, windowName) {
  const clicked = await rpc(client, "clickWindowByName", { name: windowName });
  expect(clicked.ok === true && clicked.result?.clicked === true,
    `${client.label} could not click ${windowName}`, clicked.result);
}

async function aimWebXrAtEnginePoint(client, point, label) {
  expect(Number.isFinite(point?.x) && Number.isFinite(point?.y),
    `${label} has no engine coordinates`, point);
  let diagnostic = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const spatial = await client.page.evaluate(() => ({
      comfort: window.CnCPort.getWebXrState()?.renderer?.comfort,
      displaySize: window.CnCPort?.state?.engineDisplaySize,
    }));
    const width = Number(spatial.displaySize?.width);
    const height = Number(spatial.displaySize?.height);
    expect(Number(spatial.comfort?.panelWidthMeters) > 0 && width > 1 && height > 1,
      `${label} has no floating-panel geometry`, spatial);
    await client.page.evaluate(([x, y, targetWidth, targetHeight, panelWidth]) =>
      window.__emulatedXrPointAtEnginePixel(x, y, targetWidth, targetHeight, panelWidth), [
      point.x, point.y, width, height, spatial.comfort.panelWidthMeters,
    ]);
    const pointer = await waitFor(`${label} tracked pointer`, () => client.page.evaluate(() =>
      window.CnCPort.getWebXrState()?.renderer?.controllerPointer ?? null),
    (candidate) => candidate?.target === "ui"
      && Math.abs(candidate.point?.x - point.x) <= 2
      && Math.abs(candidate.point?.y - point.y) <= 2,
    2500, 50).catch((error) => {
      diagnostic = { point, width, height, error: error.message };
      return null;
    });
    if (pointer) return pointer;
    await fullFrame(client, 1);
  }
  throw new Error(`${label} controller ray missed the floating panel: ${JSON.stringify(
    diagnostic)}`);
}

async function tapWebXrButton(client, index, { betweenFrames = false } = {}) {
  if (betweenFrames) {
    await client.page.evaluate((buttonIndex) =>
      window.__emulatedXrButtonTap(buttonIndex), index);
    return;
  }
  await client.page.evaluate((buttonIndex) =>
    window.__emulatedXrButton(buttonIndex, true), index);
  await client.page.waitForTimeout(80);
  await fullFrame(client, 1);
  await client.page.evaluate((buttonIndex) =>
    window.__emulatedXrButton(buttonIndex, false), index);
  await client.page.waitForTimeout(80);
  await fullFrame(client, 1);
}

async function selectionState(client) {
  const response = await rpc(client, "querySelection");
  expect(response?.ok === true, `${client.label} selection query failed`, response);
  return response.result;
}

async function clearBattlefieldPoint(client, displaySize) {
  const response = await rpc(client, "queryDrawables");
  expect(response?.ok === true, `${client.label} drawable query failed`, response);
  const drawables = response.result?.allDrawables ?? response.result?.drawables ?? [];
  const occupied = drawables.filter((drawable) => drawable?.onScreen === true
      && Number.isFinite(drawable.screenPos?.x) && Number.isFinite(drawable.screenPos?.y))
    .map((drawable) => drawable.screenPos);
  const candidates = Array.from({ length: 24 }, (_, index) => ({
    x: Math.round(displaySize.width * (0.15 + (index % 6) * 0.14)),
    y: Math.round(displaySize.height * (0.12 + Math.floor(index / 6) * 0.12)),
  }));
  return candidates.map((point) => ({
    ...point,
    clearance: occupied.reduce((nearest, drawable) => Math.min(nearest,
      Math.hypot(point.x - drawable.x, point.y - drawable.y)), Number.POSITIVE_INFINITY),
  })).sort((left, right) => right.clearance - left.clearance)[0];
}

async function driveWebXrMultiplayerOrder(client) {
  const hud = await waitFor(`${client.label} idle-worker control`, () => fullFrame(client, 1),
    (candidate) => candidate?.clientState?.gameplay?.fade === 0
      && candidate?.clientState?.controlBarWindows?.buttonIdleWorker?.clickable === true,
  30000, 50);
  const idleWorker = hud.clientState.controlBarWindows.buttonIdleWorker;
  await aimWebXrAtEnginePoint(client,
    { x: idleWorker.centerX, y: idleWorker.centerY }, "multiplayer Idle Worker button");
  await waitFor(`${client.label} idle-worker hover`, async () => {
    const response = await rpc(client, "agentUiSnapshot");
    return response?.result?.windows?.find((window) =>
      window.name === "ControlBar.wnd:ButtonIdleWorker") ?? null;
  }, (window) => window?.visible === true && window?.interactive === true
      && window?.hilited === true,
  10000, 50);
  await tapWebXrButton(client, 0);
  const selected = await waitFor(`${client.label} tracked worker selection`, async () => {
    await fullFrame(client, 1);
    return selectionState(client);
  }, (state) => state?.selectedControllable === true
      && state.selected?.some((entry) => entry.locallyControlled === true
        && (entry.kindOf?.dozer === true || entry.ai?.ready === true)),
  30000, 50);
  const unit = selected.selected.find((entry) => entry.locallyControlled === true
    && (entry.kindOf?.dozer === true || entry.ai?.ready === true));
  const displaySize = await client.page.evaluate(() => window.CnCPort.state.engineDisplaySize);
  const target = await clearBattlefieldPoint(client, displaySize);
  await aimWebXrAtEnginePoint(client, target, "multiplayer contextual-order target");
  await tapWebXrButton(client, 1, { betweenFrames: true });
  const dispatched = await waitFor(`${client.label} multiplayer move dispatch`, async () => {
    await fullFrame(client, 1);
    return selectionState(client);
  }, (state) => state.commandPath?.dispatchMoveCommandCount
        > selected.commandPath.dispatchMoveCommandCount
      && state.commandPath?.dispatchLastMoveCommandTypeName === "MSG_DO_MOVETO"
      && state.commandPath?.dispatchLastMoveHadGroup === 1
      && state.commandPath?.rightClickIsClick === 1,
  30000, 50);
  const changed = await waitFor(`${client.label} multiplayer move reaction`, async () => {
    await fullFrame(client, 1);
    return selectionState(client);
  }, (state) => {
    const current = state.selected?.find((entry) => entry.id === unit.id);
    if (!current) return false;
    return Math.hypot(current.worldPos.x - unit.worldPos.x,
      current.worldPos.y - unit.worldPos.y) > 0.05
      || current.ai?.moving === true || current.ai?.waitingForPath === true;
  }, 30000, 50);
  const changedUnit = changed.selected.find((entry) => entry.id === unit.id);
  return {
    selectedTemplate: unit.templateName,
    selectedObjectId: unit.id,
    targetPoint: { x: target.x, y: target.y },
    commandType: dispatched.commandPath.dispatchLastMoveCommandTypeName,
    dispatchedWithGroup: dispatched.commandPath.dispatchLastMoveHadGroup === 1,
    rightClickAccepted: dispatched.commandPath.rightClickIsClick === 1,
    aiMoving: changedUnit.ai.moving,
    aiWaitingForPath: changedUnit.ai.waitingForPath,
    worldDistance: Math.hypot(changedUnit.worldPos.x - unit.worldPos.x,
      changedUnit.worldPos.y - unit.worldPos.y),
  };
}

async function enterLanLobby(client, { verifyRanked = false } = {}) {
  await waitFor(`${client.label} main menu`, async () => fullFrame(client, 1),
    (result) => result.clientState?.shell?.topIsMainMenu === true
      && result.clientState?.mainMenu?.buttonMultiplayer?.found === true,
  60000, 0);
  await clickWindow(client, "MainMenu.wnd:ButtonMultiplayer");
  const multiplayerMenu = await waitFor(`${client.label} multiplayer menu`,
    async () => fullFrame(client, 1),
    (result) => result.clientState?.mainMenu?.buttonNetwork?.clickable === true
      && result.clientState?.mainMenu?.debug?.dontAllowTransitions === 0
      && result.clientState?.transition?.finished === true,
  30000, 0);
  expect(multiplayerMenu.clientState?.mainMenu?.buttonNetwork?.text === "Anonymous"
      && multiplayerMenu.clientState?.mainMenu?.buttonOnline?.text === "Ranked",
  `${client.label} did not expose the native Anonymous and Ranked buttons`,
  multiplayerMenu.clientState?.mainMenu);
  if (verifyRanked) {
    await client.page.locator("#viewport").screenshot({
      path: resolve(artifactRoot, "multiplayer-anonymous-ranked-menu.png"),
    });
    await clickWindow(client, "MainMenu.wnd:ButtonOnline");
    const rankedMessage = await waitFor("native Ranked coming-soon message",
      async () => fullFrame(client, 1),
      (result) => result.clientState?.messageBox?.parent?.found === true
        && result.clientState?.messageBox?.parent?.managerHidden === false,
      10000, 0);
    await client.page.locator("#viewport").screenshot({
      path: resolve(artifactRoot, "multiplayer-ranked-coming-soon.png"),
    });
    expect(rankedMessage.clientState.messageBox.title?.text === "Ranked"
        && rankedMessage.clientState.messageBox.message?.text
          === "Ranked is coming soon. Please try Anonymous in the meantime."
        && rankedMessage.clientState.messageBox.buttonOk?.found === true,
    "Ranked notice did not use the expected original native message box",
    rankedMessage.clientState.messageBox);
    await clickWindow(client, "MessageBox.wnd:ButtonOk");
    await fullFrame(client, 1);
  }
  await clickWindow(client, "MainMenu.wnd:ButtonNetwork");
  return waitFor(`${client.label} real LAN lobby`, async () => {
    await frame(client, 1);
    return lanState(client);
  }, (state) => state.lanReady === true && state.localIp !== 0, 30000, 0);
}

async function createClient(browserOrContext, serverUrl, relayUrls, room, label, peerId,
  existingContext = false, webXr = false) {
  const context = existingContext
    ? browserOrContext
    : await browserOrContext.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: process.env.CNC_IGNORE_HTTPS_ERRORS === "1",
    });
  if (webXr) await context.addInitScript(installEmulatedWebXr);
  const page = await context.newPage();
  const commanderName = peerId === "host" ? "SmokeHost" : `SmokeGuest${peerId.split("-").at(-1)}`;
  const client = { context, page, label, peerId, commanderName, errors: [] };
  page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);
  page.on("pageerror", (error) => client.errors.push(error?.message ?? String(error)));
  page.on("crash", () => client.errors.push("page crashed"));
  page.on("console", (message) => {
    if (message.type() === "error") client.errors.push(message.text());
  });

  const pageUrl = new URL("harness/index.html", serverUrl);
  if (threadedTest) {
    pageUrl.searchParams.set("threads", "1");
    pageUrl.searchParams.set("dist", process.env.CNC_THREADED_DIST ?? "dist-threaded-release");
    pageUrl.searchParams.set("diag", "lite");
  }
  if (webXr) pageUrl.searchParams.set("vr", "1");
  await page.goto(pageUrl.href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
  if (captureNetworkDiagnostics) {
    await page.evaluate(() => window.__cncSetNetworkDiagnostics?.(true, {
      reset: true,
      reason: "lan-webrtc-playable-match-smoke",
    }));
  }

  const mount = await rpc(client, "mountArchives", {
    path: `/assets/lan-${peerId}`,
    verifyEach: false,
    archives: archives(serverUrl),
  });
  expect(mount.ok === true && mount.archiveSet?.archiveCount === archiveSpecs.length,
    `${label} failed to mount real game archives`, mount.archiveSet ?? mount);
  console.error(`[lan-webrtc] ${label} archives mounted`);

  const connected = await rpc(client, "browserWebRtcEndpointConnect", {
    room,
    peerId,
    displayName: commanderName,
    iceServers: [],
    relayUrls: relayUrls.length ? relayUrls : null,
    timeoutMs: 30000,
  });
  expect(connected.ok === true, `${label} failed to connect WebRTC`, connected);

  const init = await rpc(client, "realEngineInit", {
    runDirectory: `/assets/lan-${peerId}`,
    // The shell map is a full background match and makes two simultaneous
    // SwiftShader clients needlessly expensive before the LAN test begins.
    shellMap: false,
    commanderName,
  });
  expect(init.ok === true && init.aborted === false && init.frontier?.initReturned === true,
    `${label} real engine init failed`, init.frontier ?? init);
  console.error(`[lan-webrtc] ${label} real engine initialized`);
  return client;
}

let server;
let testRelay;
const browsers = [];
const clients = [];
const profileDirs = [];

try {
  await mkdir(artifactRoot, { recursive: true });
  server = await startStaticServer({ root: wasmRoot });
  if (!publicDiscovery && configuredRelayUrls.length === 0) {
    testRelay = await startNostrTestRelayServer();
  }
  const relayUrls = testRelay ? [testRelay.url] : configuredRelayUrls;
  const room = `playable-match-${Date.now()}`;

  const launchOptions = {};
  if (process.env.CNC_IGNORE_HTTPS_ERRORS === "1") {
    launchOptions.ignoreHTTPSErrors = true;
  }
  if (process.env.CNC_BROWSER_EXECUTABLE) {
    launchOptions.executablePath = process.env.CNC_BROWSER_EXECUTABLE;
  }
  if (process.env.CNC_BROWSER_ARGS) {
    launchOptions.args = process.env.CNC_BROWSER_ARGS.split(/\s+/).filter(Boolean);
  }
  // Real multiplayer peers have independent browser schedulers. Keep sharing
  // one browser available for low-resource diagnostics, but do not serialize
  // the default product evidence through a single renderer/event loop.
  const separateBrowsers = process.env.CNC_SHARED_BROWSER !== "1"
    || process.env.CNC_BROWSER_PER_PLAYER === "1";
  parallelClientFrames = process.env.CNC_SERIAL_CLIENT_FRAMES !== "1"
    && (threadedTest || separateBrowsers);
  for (let index = 0; index < playerCount; ++index) {
    if (threadedTest) {
      const profileDir = resolve(wasmRoot, "artifacts/pw-profiles",
        `lan-webrtc-${playerCount}p-${index + 1}`);
      await rm(profileDir, { recursive: true, force: true });
      await mkdir(profileDir, { recursive: true });
      profileDirs.push(profileDir);
      const context = await chromium.launchPersistentContext(profileDir, {
        ...launchOptions,
        viewport: { width: 1280, height: 720 },
      });
      const host = index === 0;
      const label = host ? "WebRTC Host" : `WebRTC Guest ${index}`;
      const peerId = host ? "host" : `guest-${index}`;
      clients.push(await createClient(context,
        server.url, relayUrls, room, label, peerId, true, webXrHost && host));
      continue;
    }
    if (separateBrowsers || browsers.length === 0) {
      browsers.push(await chromium.launch(launchOptions));
    }
    const host = index === 0;
    const label = host ? "WebRTC Host" : `WebRTC Guest ${index}`;
    const peerId = host ? "host" : `guest-${index}`;
    const clientBrowser = separateBrowsers ? browsers[index] : browsers[0];
    clients.push(await createClient(clientBrowser,
      server.url, relayUrls, room, label, peerId));
  }
  const [host, ...guests] = clients;
  const peerConnections = await Promise.all(clients.map((client) =>
    rpc(client, "browserWebRtcEndpointWaitForPeers", {
      count: playerCount - 1,
      timeoutMs: 60000,
    })));
  expect(peerConnections.every((result) => result.ok === true
      && result.runtime?.endpoint?.openPeers === playerCount - 1),
  "WebRTC clients did not form a complete peer mesh", peerConnections);

  if (webXrHost) {
    await startWebXr(host);
    console.error("[lan-webrtc] host entered the native WebXR render lane");
  }

  const lobbies = [];
  for (let index = 0; index < clients.length; ++index) {
    lobbies.push(await enterLanLobby(clients[index], { verifyRanked: index === 0 }));
  }
  console.error(`[lan-webrtc] ${playerCount} original LAN lobbies entered`);
  expect(new Set(lobbies.map((lobby) => lobby.localIp)).size === playerCount,
    "LAN clients did not receive unique virtual IPs", lobbies);
  expect(lobbies.every((lobby, index) => lobby.localName === clients[index].commanderName),
    "persisted browser commander identity did not reach the original LAN lobby", lobbies);

  const nativeLobbyFrames = await waitFor("native LAN recovery controls visible", async () =>
    Promise.all(clients.map((client) => fullFrame(client, 1))),
  (frames) => frames.every((result) =>
    result.clientState?.shell?.animFinished === true
      && result.clientState?.lanLobby?.parent?.managerHidden === false
      && result.clientState?.lanLobby?.networkStatus?.managerHidden === false
      && result.clientState?.lanLobby?.buttonReconnect?.text === "Reconnect"
      && result.clientState?.lanLobby?.networkStatus?.text?.includes("Network: online")),
  30000, 0);
  expect(nativeLobbyFrames.every((result) =>
    result.clientState?.lanLobby?.buttonReconnect?.text === "Reconnect"
      && result.clientState?.lanLobby?.networkStatus?.text?.includes("Network:")
      && result.clientState?.lanLobby?.networkStatus?.text?.includes("Relay:")),
  "native LAN recovery controls did not expose discovery and relay state",
  nativeLobbyFrames.map((result) => result.clientState?.lanLobby));
  await fullFrame(host, 1);
  await host.page.waitForTimeout(250);
  await host.page.locator("#viewport").screenshot({
    path: resolve(artifactRoot, "lan-native-network-status.png"),
  });

  // Exercise the same original GameWindow action a player clicks. Recovery
  // must rebuild discovery and then make both LANAPI instances immediately
  // re-announce, without recreating either game runtime.
  const reconnectingClient = guests[0];
  await clickWindow(reconnectingClient, "LanLobbyMenu.wnd:ButtonDirectConnect");
  const recoveredEndpoints = await waitFor("native LAN reconnect peer mesh", async () => {
    await allFrames(clients, 1);
    return Promise.all(clients.map((client) => rpc(client, "browserWebRtcEndpointState")));
  }, (states) => states.every((state) => state.ok === true
      && state.runtime?.endpoint?.openPeers === playerCount - 1)
      && states[clients.indexOf(reconnectingClient)].runtime?.reconnectCount >= 1,
  60000, 100);
  const recoveredLobbyFrames = await waitFor("native LAN reconnect player visibility", async () => {
    await pumpLobby(clients);
    return Promise.all(clients.map((client) => fullFrame(client, 1)));
  }, (frames) => frames.every((result) =>
    result.clientState?.lanLobby?.players?.listBox?.entryCount === playerCount
      && result.clientState?.lanLobby?.networkStatus?.text?.includes("Network: online")),
  45000, 100);
  expect(recoveredEndpoints.every((state) => state.runtime.nativeStatus.includes("Relay:")),
    "recovered endpoint state did not retain native relay diagnostics", recoveredEndpoints);
  console.error(`[lan-webrtc] native reconnect restored ${playerCount} visible LAN players`);

  const hostCreate = await lanCommand(host, "host", "Browser Match");
  expect(hostCreate.ok === true, "original LANAPI did not create the host game", hostCreate);
  await frame(host, 90);
  const mapCache = await rpc(host, "mapCacheProbe");
  const officialMaps = mapCache.probe?.officialMultiplayerMaps ?? [];
  const selectedMap = officialMaps.find((candidate) => candidate.players === playerCount)
    ?? officialMaps.find((candidate) => candidate.players >= playerCount);
  const map = selectedMap?.key;
  expect(typeof map === "string" && map.length > 0 && selectedMap.players >= playerCount,
    `host did not expose an official map for ${playerCount} players`, mapCache.probe);
  const setMap = await lanCommand(host, "setMap", map);
  expect(setMap.ok === true, "host could not configure the real LAN map", setMap);
  console.error(`[lan-webrtc] host game created on ${map} (${selectedMap.players} spawns)`);
  // Hosting announces the default map before setMap publishes the selected
  // options. Give every LANAPI enough update turns to replace that first
  // discovery entry before joinFirst consumes it (fast headless clients can
  // otherwise join the stale default-map snapshot).
  for (let update = 0; update < 12; ++update) {
    await pumpLobby(clients);
  }

  const discovered = await waitFor("guest LAN game discovery", async () => {
    await pumpLobby(clients);
    return Promise.all(guests.map((guest) => lanState(guest)));
  }, (states) => states.every((state) => state.discoveredGames >= 1), 45000);
  expect(discovered.every((state) => state.game.present === false),
    "a guest unexpectedly entered a game before joining", discovered);
  console.error(`[lan-webrtc] ${guests.length} guests discovered the host over WebRTC broadcast`);

  let joined = null;
  for (let index = 0; index < guests.length; ++index) {
    const guest = guests[index];
    const join = await lanCommand(guest, "joinFirst");
    expect(join.ok === true, `${guest.label} could not request the discovered game`, join);
    const expectedPlayers = index + 2;
    joined = await waitFor(`${expectedPlayers}-player original LAN lobby`, async () => {
      await pumpLobby(clients);
      return Promise.all(clients.map((client) => lanState(client)));
    }, (states) => states.slice(0, expectedPlayers).every((state) =>
      state.game?.numPlayers === expectedPlayers), 45000);
    console.error(`[lan-webrtc] ${guest.label} joined (${expectedPlayers}/${playerCount})`);
    const republishedMap = await lanCommand(host, "setMap", map);
    expect(republishedMap.ok === true,
      `host could not republish the map after ${guest.label} joined`, republishedMap);
    for (let update = 0; update < 4; ++update) {
      await pumpLobby(clients);
    }
  }
  // A fast guest can join from the host's first (default-map) announcement.
  // The host remains authoritative: republish the chosen map after membership
  // is complete, exactly as changing maps in the original lobby UI does.
  const finalMap = await lanCommand(host, "setMap", map);
  expect(finalMap.ok === true, "host could not republish the final LAN map", finalMap);
  joined = await waitFor("final LAN map propagation", async () => {
    await pumpLobby(clients);
    return Promise.all(clients.map((client) => lanState(client)));
  }, (states) => states.every((state) =>
    state.game?.numPlayers === playerCount && sameEnginePath(state.game?.map, map)), 45000);
  expect(joined?.every((state) => state.game?.numPlayers === playerCount
      && sameEnginePath(state.game?.map, map)),
  "LAN game state did not converge after every guest joined", joined);

  await Promise.all(clients.map((client) => lanCommand(client, "ready")));
  const ready = await waitFor("ready propagation", async () => {
    await pumpLobby(clients);
    return Promise.all(clients.map((client) => lanState(client)));
  }, (states) => states.every((state) => {
    const humans = state.game?.slots?.filter((slot) => slot.human) ?? [];
    return state.game?.numPlayers === playerCount
      && humans.length === playerCount
      && humans.every((slot) => slot.accepted && slot.hasMap);
  }), 45000);
  console.error("[lan-webrtc] all human slots accepted with the map");

  const hostWebXrBeforeMatch = webXrHost ? await webXrState(host) : null;
  const start = await lanCommand(host, "start");
  expect(start.ok === true && start.result?.state?.network?.ready === true,
    "host did not initialize the original Network on game start", start);
  const guestNetworks = await waitFor("guest original Network start", async () => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 220));
    await Promise.all(guests.map((guest) => lanCommand(guest, "update")));
    // Consume the host's game-start packet and prove every original Network
    // exists before entering a threaded frame. A worker frame is synchronous;
    // advancing the host early can wait for a guest the driver has not started.
    return Promise.all(guests.map((guest) => lanState(guest)));
  }, (states) => states.every((state) => state.network?.ready === true
      && state.network?.numPlayers === playerCount), 45000);
  console.error(`[lan-webrtc] all ${playerCount} original Network instances started`);
  const pregameNetworks = [start.result.state, ...guestNetworks].map((state) => state.network);
  expect(pregameNetworks.every((network) => network.executionFrame === network.runAhead - 1),
    "LAN observer changed the pregame execution frame",
    pregameNetworks);

  const clearedLobbyDatagrams = await Promise.all(clients.map((client) =>
    rpc(client, "browserWebRtcEndpointClearDatagrams")));
  expect(clearedLobbyDatagrams.every((result) => result.ok === true),
    "stale LAN datagrams could not be cleared at the game-transport handoff",
    clearedLobbyDatagrams);

  let threadedLoops = [];
  // The manual-frame verifier intentionally serializes expensive engine +
  // SwiftShader work across browser clients. Keep the original disconnect
  // logic enabled, but prevent wall-clock verifier stalls from looking like a
  // network failure; the shipping autonomous loop does not have this delay.
  const verifierTimeouts = await Promise.all(clients.map((client) =>
    rpc(client, "realEngineSetNetworkTimeouts", {
      disconnectMs: 900000,
      playerTimeoutMs: 900000,
    })));
  expect(verifierTimeouts.every((result) => result.ok === true),
    "verifier network timeouts could not be extended", verifierTimeouts);
  if (threadedTest) {
    const loadStepping = await Promise.all(clients.map((client) =>
      rpc(client, "realEngineSetLoadStepping", { enabled: true, budgetMs: 5 })));
    expect(loadStepping.every((result) => result.ok === true),
      "threaded load stepping could not be configured", loadStepping);
    // Match the shipping play page's autonomous engine-thread ownership. The
    // tighter load slice keeps the slow SwiftShader verifier observable; the
    // 30/30 gate avoids presentation-only frames while preserving simulation.
    threadedLoops = await Promise.all(clients.map((client) =>
      rpc(client, "threadedStartLoop", { clientFps: 30, logicFps: 30 })));
    expect(threadedLoops.every((loop) => loop.ok === true),
      "threaded match loops did not start", threadedLoops);
    console.error(`[lan-webrtc] all ${playerCount} threaded play loops started`);
  }

  const samples = [];
  let active = null;
  for (let tick = 0; tick < 4800; ++tick) {
    const frameRead = allFrames(clients, 1);
    if (threadedTest && tick === 0) {
      const firstReadSettled = await Promise.race([
        frameRead.then(() => true),
        new Promise((resolveWait) => setTimeout(() => resolveWait(false), 15000)),
      ]);
      if (!firstReadSettled) {
        const transports = await Promise.all(clients.map((client) =>
          rpc(client, "browserWebRtcEndpointState")));
        console.error("[lan-webrtc] first threaded match-frame transport",
          JSON.stringify(transports.map((transport) => ({
            peerId: transport.runtime?.endpoint?.peerId,
            sent: transport.runtime?.endpoint?.sent,
            received: transport.runtime?.endpoint?.received,
            bridge: transport.runtime?.threadedBridge,
            error: transport.runtime?.lastError,
          }))));
      }
    }
    const frames = await frameRead;
    if (tick % activeSampleInterval === 0) {
      const states = await Promise.all(clients.map((client) => lanState(client)));
      const sample = {
        tick,
        clients: clients.map((client, index) => ({
          peerId: client.peerId,
          logicFrame: frames[index].gameplay?.logicFrame,
          objects: frames[index].gameplay?.objectCount,
          network: states[index].network,
        })),
      };
      samples.push(sample);
      console.error(`[lan-webrtc] tick=${tick} ${sample.clients
        .map((client) => `${client.peerId}=${client.logicFrame}/${client.objects}`).join(" ")}`);
      const logicFrames = frames.map((clientFrame) => clientFrame.gameplay?.logicFrame);
      const objectCounts = frames.map((clientFrame) => clientFrame.gameplay?.objectCount);
      const playerIds = states.map((state) => state.network?.localPlayerId);
      const logicFrameSkew = Math.max(...logicFrames) - Math.min(...logicFrames);
      expect(states.every((state) => state.network?.crcMismatch === false),
        "multiplayer CRC mismatch while waiting for active play",
        states.map((state) => state.network));
      if (frames.every((clientFrame) => clientFrame.gameplay?.gameMode === GAME_LAN
          && clientFrame.gameplay?.inGame === true
          && clientFrame.gameplay?.loadingMap === false
          && clientFrame.gameplay?.inputEnabled === true
          && clientFrame.gameplay?.logicFrame > 0
          && clientFrame.gameplay?.objectCount > 0)
          && states.every((state) => state.network?.crcMismatch === false
            && state.network?.numPlayers === playerCount)
          && logicFrameSkew <= maxAllowedLogicFrameSkew
          && new Set(objectCounts).size === 1
          && new Set(playerIds).size === playerCount) {
        active = { tick, logicFrameSkew, frames, states };
        break;
      }
    }
  }
  expect(active != null, `${playerCount}-client LAN match did not become playable`, samples.slice(-12));

  const hostWebXrPlayable = webXrHost ? await waitFor(
    "host WebXR compositor over playable LAN match",
    () => webXrState(host),
    (state) => state?.phase === "running"
      && state.viewCount === 2
      && state.inputSourceCount === 1
      && state.renderer?.active === true
      && state.renderer?.enginePickRayReady === true
      && Number(state.renderer?.frames ?? 0)
        > Number(hostWebXrBeforeMatch?.renderer?.frames ?? 0),
    30000,
    50,
  ) : null;
  const hostEyeSeparationMeters = hostWebXrPlayable
    ? emulatedXrEyeSeparationMeters(await host.page.evaluate(() => window.__emulatedXrStereo))
    : null;
  expect(hostEyeSeparationMeters == null
      || Math.abs(hostEyeSeparationMeters - 0.064) < 0.000001,
  "host WebXR compositor did not supply distinct eye transforms", hostEyeSeparationMeters);
  if (hostWebXrPlayable) {
    console.error(`[lan-webrtc] host WebXR rendered the playable match with ${
      hostEyeSeparationMeters}m eye separation at frame ${hostWebXrPlayable.renderer.frames}`);
  }
  const hostWebXrOrder = webXrHost ? await driveWebXrMultiplayerOrder(host) : null;
  if (hostWebXrOrder) {
    console.error(`[lan-webrtc] host WebXR dispatched ${hostWebXrOrder.commandType} for ${
      hostWebXrOrder.selectedTemplate}`);
  }

  const requiredPostActiveLogicFrames = threadedTest || playerCount >= 4 ? 3 : 10;
  let postActiveFrames = null;
  let postActiveStates = null;
  let postActiveDriverTicks = 0;
  for (; postActiveDriverTicks < 600; ++postActiveDriverTicks) {
    // The ordinary browser loop is wall-clock paced, and the original
    // Network/Connection send gates use the same 30 Hz interval. A tight
    // manual verifier loop can otherwise exhaust every attempt while waiting
    // for frame-info and ACK traffic before another send becomes eligible.
    if (!threadedTest) {
      await new Promise((resolveWait) => setTimeout(resolveWait, manualNetworkFrameIntervalMs));
    }
    postActiveFrames = await allFrames(clients, 1);
    postActiveStates = await Promise.all(clients.map((client) => lanState(client)));
    expect(postActiveStates.every((state) => state.network?.numPlayers === playerCount
        && state.network?.crcMismatch === false),
    "network membership changed during the post-active drive",
    postActiveStates.map((state) => state.network));
    const advanced = postActiveFrames.every((clientFrame, index) =>
      clientFrame.gameplay?.logicFrame >= active.frames[index].gameplay.logicFrame
        + requiredPostActiveLogicFrames);
    const logicFrames = postActiveFrames.map((clientFrame) => clientFrame.gameplay?.logicFrame);
    const logicFrameSkew = Math.max(...logicFrames) - Math.min(...logicFrames);
    if (advanced && logicFrameSkew <= maxAllowedFinalLogicFrameSkew) {
      break;
    }
  }
  const finalStates = await Promise.all(clients.map((client) => lanState(client)));
  const finalLogicFrames = postActiveFrames?.map((clientFrame) => clientFrame.gameplay?.logicFrame) ?? [];
  const finalLogicFrameSkew = Math.max(...finalLogicFrames) - Math.min(...finalLogicFrames);
  expect(finalStates.every((state) => state.network?.crcMismatch === false
      && state.network?.numPlayers === playerCount)
      && postActiveFrames?.every((clientFrame, index) =>
        clientFrame.gameplay?.logicFrame >= active.frames[index].gameplay.logicFrame
          + requiredPostActiveLogicFrames)
      && finalLogicFrameSkew <= maxAllowedFinalLogicFrameSkew,
    "original lockstep simulation did not survive post-active frames",
    {
      activeLogicFrames: active.frames.map((clientFrame) => clientFrame.gameplay?.logicFrame),
      finalLogicFrames,
      finalLogicFrameSkew,
      postActiveDriverTicks,
      requiredPostActiveLogicFrames,
      networks: finalStates.map((state) => state.network),
    });

  let soak = null;
  if (threadedTest && soakMs > 0) {
    const startedAt = performance.now();
    const initialStates = await Promise.all(clients.map((client) => lanState(client)));
    const initialFrames = initialStates.map((state) => state.network?.logicFrame ?? 0);
    const lastFrames = [...initialFrames];
    const lastProgressAt = initialFrames.map(() => startedAt);
    let peakStallMs = 0;
    let soakStates = initialStates;
    while (performance.now() - startedAt < soakMs) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
      soakStates = await Promise.all(clients.map((client) => lanState(client)));
      const now = performance.now();
      soakStates.forEach((state, index) => {
        const logicFrame = state.network?.logicFrame ?? lastFrames[index];
        peakStallMs = Math.max(peakStallMs, now - lastProgressAt[index]);
        if (logicFrame > lastFrames[index]) {
          lastFrames[index] = logicFrame;
          lastProgressAt[index] = now;
        }
      });
    }
    const elapsedMs = performance.now() - startedAt;
    const finalFrames = soakStates.map((state) => state.network?.logicFrame ?? 0);
    const logicFps = finalFrames.map((logicFrame, index) =>
      (logicFrame - initialFrames[index]) * 1000 / elapsedMs);
    const grouping = soakStates.map(networkGrouping);
    soak = { elapsedMs, initialFrames, finalFrames, logicFps, peakStallMs, grouping };
    expect(soakStates.every((state) => state.network?.crcMismatch === false)
        && logicFps.every((fps) => fps >= minimumLogicFps)
        && (maximumLogicStallMs === 0 || peakStallMs <= maximumLogicStallMs)
        && grouping.every((values) => values.length === playerCount - 1
          && values.every((value) => value >= 1 && value <= 33)),
    "threaded multiplayer soak missed its logic-rate, stall, grouping, or CRC gate", soak);
    console.error(`[lan-webrtc] soak ${elapsedMs.toFixed(0)}ms logic FPS=${logicFps
      .map((fps) => fps.toFixed(2)).join(",")} peak stall=${peakStallMs.toFixed(0)}ms`);
  }

  if (threadedTest) {
    if (captureNetworkDiagnostics) {
      await Promise.all(clients.map((client) => waitFor(
        `${client.label} game packet bridge drain`,
        () => client.page.evaluate(() => window.__cncNetworkDiagnosticsSnapshot?.()),
        (diagnostics) => {
          const accounting = bridgePacketAccounting(diagnostics);
          return accounting.received > 0 && accounting.missing.length === 0;
        },
        5000,
        100,
      )));
    }
    const stopped = await Promise.all(clients.map((client) => rpc(client, "threadedStopLoop")));
    expect(stopped.every((result) => result.ok === true),
      "threaded match loops did not stop cleanly", stopped);
  }

  const artifactStem = playerCount === 2 ? "lan-webrtc" : `lan-webrtc-${playerCount}p`;
  const screenshots = [];
  for (let index = 0; index < clients.length; ++index) {
    const suffix = playerCount === 2 ? (index === 0 ? "host" : "guest") : `player-${index + 1}`;
    const screenshot = resolve(artifactRoot, `${artifactStem}-${suffix}.png`);
    await clients[index].page.locator("#viewport").screenshot({ path: screenshot });
    screenshots.push(screenshot);
  }

  const gpu = await Promise.all(clients.map((client) => browserRenderer(client)));
  const expectedRenderer = String(process.env.CNC_EXPECT_RENDERER ?? "").trim();
  if (expectedRenderer) {
    expect(gpu.every((renderer) => renderer.unmaskedRenderer?.includes(expectedRenderer)),
      "browser did not use the expected GPU renderer", { expectedRenderer, gpu });
  }

  const endpointStates = await Promise.all(clients.map((client) =>
    rpc(client, "browserWebRtcEndpointState")));
  expect(endpointStates.every((state) => state.ok === true
      && state.runtime?.endpoint?.openPeers === playerCount - 1),
  "complete WebRTC peer mesh did not survive the match", endpointStates);
  const networkDiagnostics = captureNetworkDiagnostics
    ? await Promise.all(clients.map((client) => client.page.evaluate(() =>
      window.__cncNetworkDiagnosticsSnapshot?.())))
    : null;
  if (captureNetworkDiagnostics) {
    const bridgeAccounting = networkDiagnostics.map(bridgePacketAccounting);
    expect(networkDiagnostics.every((diagnostics) => diagnostics?.packets?.length > 0
        && diagnostics?.engineSamples?.some((sample) => sample.network?.network?.ready === true)
        && diagnostics?.rtcSamples?.length > 0
        && diagnostics.complete === true)
        && bridgeAccounting.every((accounting) => accounting.received > 0
          && accounting.missing.length === 0
          && accounting.explicitDrops.length === 0),
    "threaded match diagnostics did not capture packets, RTC, and engine lockstep state",
    networkDiagnostics.map((diagnostics) => ({
      retained: diagnostics?.retained,
      complete: diagnostics?.complete,
      lastEngineSample: diagnostics?.engineSamples?.at(-1),
      bridgeAccounting: bridgePacketAccounting(diagnostics),
    })));
  }

  const result = {
    ok: true,
    path: "real-lan-lobby-to-playable-webrtc-match",
    threaded: threadedTest,
    webXrHost,
    playerCount,
    map,
    mapPlayers: selectedMap.players,
    room,
    lobby: { joined, ready },
    start: [start.result.state.network, ...guestNetworks.map((state) => state.network)],
    threadedLoops,
    hostWebXr: hostWebXrPlayable ? {
      sessionCount: await host.page.evaluate(() => window.__emulatedXrSessionCount),
      runtimeFrames: hostWebXrPlayable.frames,
      viewCount: hostWebXrPlayable.viewCount,
      inputSourceCount: hostWebXrPlayable.inputSourceCount,
      rendererFramesBeforeMatch: hostWebXrBeforeMatch?.renderer?.frames ?? 0,
      rendererFramesPlayable: hostWebXrPlayable.renderer.frames,
      eyeSeparationMeters: hostEyeSeparationMeters,
      enginePickRayReady: hostWebXrPlayable.renderer.enginePickRayReady,
      order: hostWebXrOrder,
    } : null,
    active,
    postActiveFrames,
    postActiveDriverTicks,
    requiredPostActiveLogicFrames,
    finalLogicFrameSkew,
    soak,
    final: finalStates,
    endpoints: endpointStates.map((state) => state.runtime.endpoint),
    networkDiagnostics: networkDiagnostics?.map((diagnostics) => ({
      retained: diagnostics.retained,
      totals: diagnostics.totals,
      complete: diagnostics.complete,
    })) ?? null,
    discovery: {
      strategy: "trystero-nostr",
      configuredRelays: relayUrls,
      testRelay: testRelay?.stats() ?? null,
      nativeReconnect: {
        reconnectCount: recoveredEndpoints[clients.indexOf(reconnectingClient)]
          .runtime.reconnectCount,
        playerCounts: recoveredLobbyFrames.map((result) =>
          result.clientState.lanLobby.players.listBox.entryCount),
      },
    },
    screenshots,
    gpu,
    browserErrors: clients.map((client) => ({ peerId: client.peerId, errors: client.errors })),
  };
  expect(result.endpoints.every((endpoint) => endpoint.discoveryStrategy === "trystero-nostr"
      && endpoint.openPeers === playerCount - 1)
      && (!result.discovery.testRelay
        || (result.discovery.testRelay.activeConnections === playerCount
          && result.discovery.testRelay.binaryMessagesRejected === 0)),
  "Trystero discovery lost room members or carried a binary game payload", {
    endpoints: result.endpoints,
    discovery: result.discovery,
  });
  const unexpectedBrowserErrors = result.browserErrors.flatMap(({ peerId, errors }) =>
    errors.filter((error) => !isExpectedBrowserWarning(error))
      .map((error) => ({ peerId, error })));
  result.visualOk = unexpectedBrowserErrors.length === 0
    && result.gpu.every((renderer) => Boolean(renderer.unmaskedRenderer));
  result.visualWarningsAllowed = allowWebGlContextLoss;
  result.unexpectedBrowserErrors = unexpectedBrowserErrors;
  const resultName = playerCount === 2
    ? "lan-webrtc-playable-match.json"
    : `lan-webrtc-${playerCount}p-playable-match.json`;
  await writeFile(resolve(artifactRoot, resultName),
    `${JSON.stringify(result, null, 2)}\n`);
  expect(unexpectedBrowserErrors.length === 0,
    "browser failed during playable LAN match", result.browserErrors);
  console.log(JSON.stringify(result));
} finally {
  for (const client of clients) {
    await client.context.close().catch(() => {});
  }
  for (const activeBrowser of browsers) {
    await activeBrowser.close().catch(() => {});
  }
  for (const profileDir of profileDirs) {
    await rm(profileDir, { recursive: true, force: true });
  }
  await testRelay?.close().catch(() => {});
  await server?.close();
}
