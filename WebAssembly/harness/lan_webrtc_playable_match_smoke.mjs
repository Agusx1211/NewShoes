#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { attachWebRtcSignalingServer } from "./webrtc-signaling-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const artifactRoot = resolve(wasmRoot, "artifacts/networking");
const GAME_LAN = 1;

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

async function bothFrames(host, guest, frames = 1) {
  // Keep each peer's synchronous engine+present call separate. This returns
  // to the browser between peers (letting RTCDataChannel events drain) and
  // avoids asking a single Metal GPU process to service two blocking presents
  // concurrently.
  const hostFrame = await frame(host, frames);
  const guestFrame = await frame(guest, frames);
  return [hostFrame, guestFrame];
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

async function pumpLobby(host, guest) {
  await Promise.all([
    lanCommand(host, "update"),
    lanCommand(guest, "update"),
  ]);
  await bothFrames(host, guest, 1);
}

async function clickWindow(client, windowName) {
  const clicked = await rpc(client, "clickWindowByName", { name: windowName });
  expect(clicked.ok === true && clicked.result?.clicked === true,
    `${client.label} could not click ${windowName}`, clicked.result);
}

async function enterLanLobby(client) {
  await waitFor(`${client.label} main menu`, async () => fullFrame(client, 1),
    (result) => result.clientState?.shell?.topIsMainMenu === true
      && result.clientState?.mainMenu?.buttonMultiplayer?.found === true,
  60000, 0);
  await clickWindow(client, "MainMenu.wnd:ButtonMultiplayer");
  await waitFor(`${client.label} multiplayer menu`, async () => fullFrame(client, 1),
    (result) => result.clientState?.mainMenu?.buttonNetwork?.clickable === true
      && result.clientState?.mainMenu?.debug?.dontAllowTransitions === 0
      && result.clientState?.transition?.finished === true,
  30000, 0);
  await clickWindow(client, "MainMenu.wnd:ButtonNetwork");
  return waitFor(`${client.label} real LAN lobby`, async () => {
    await frame(client, 1);
    return lanState(client);
  }, (state) => state.lanReady === true && state.localIp !== 0, 30000, 0);
}

async function createClient(browser, serverUrl, signalingUrl, room, label, peerId) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const client = { context, page, label, errors: [] };
  page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);
  page.on("pageerror", (error) => client.errors.push(error?.message ?? String(error)));
  page.on("crash", () => client.errors.push("page crashed"));
  page.on("console", (message) => {
    if (message.type() === "error") client.errors.push(message.text());
  });

  await page.goto(new URL("harness/index.html", serverUrl).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

  const mount = await rpc(client, "mountArchives", {
    path: `/assets/lan-${peerId}`,
    verifyEach: false,
    archives: archives(serverUrl),
  });
  expect(mount.ok === true && mount.archiveSet?.archiveCount === archiveSpecs.length,
    `${label} failed to mount real game archives`, mount.archiveSet ?? mount);
  console.error(`[lan-webrtc] ${label} archives mounted`);

  const connected = await rpc(client, "browserWebRtcEndpointConnect", {
    signalingUrl,
    room,
    peerId,
    displayName: label,
    iceServers: [],
  });
  expect(connected.ok === true, `${label} failed to connect WebRTC`, connected);

  const init = await rpc(client, "realEngineInit", {
    runDirectory: `/assets/lan-${peerId}`,
    // The shell map is a full background match and makes two simultaneous
    // SwiftShader clients needlessly expensive before the LAN test begins.
    shellMap: false,
  });
  expect(init.ok === true && init.aborted === false && init.frontier?.initReturned === true,
    `${label} real engine init failed`, init.frontier ?? init);
  console.error(`[lan-webrtc] ${label} real engine initialized`);
  return client;
}

let server;
let signaling;
let browser;
let host;
let guest;

try {
  await mkdir(artifactRoot, { recursive: true });
  server = await startStaticServer({ root: wasmRoot });
  signaling = attachWebRtcSignalingServer({ server: server.server });
  const signalingUrl = new URL("/webrtc", server.url);
  signalingUrl.protocol = "ws:";
  const room = `playable-match-${Date.now()}`;

  const launchOptions = {};
  if (process.env.CNC_BROWSER_EXECUTABLE) {
    launchOptions.executablePath = process.env.CNC_BROWSER_EXECUTABLE;
  }
  if (process.env.CNC_BROWSER_ARGS) {
    launchOptions.args = process.env.CNC_BROWSER_ARGS.split(/\s+/).filter(Boolean);
  }
  browser = await chromium.launch(launchOptions);
  host = await createClient(browser, server.url, signalingUrl.href, room, "WebRTC Host", "host");
  guest = await createClient(browser, server.url, signalingUrl.href, room, "WebRTC Guest", "guest");
  await signaling.waitForPeers(2);
  await Promise.all([
    rpc(host, "browserWebRtcEndpointWaitForPeers", { count: 1, timeoutMs: 15000 }),
    rpc(guest, "browserWebRtcEndpointWaitForPeers", { count: 1, timeoutMs: 15000 }),
  ]);

  const [hostLobby, guestLobby] = await Promise.all([
    enterLanLobby(host),
    enterLanLobby(guest),
  ]);
  console.error("[lan-webrtc] both original LAN lobbies entered");
  expect(hostLobby.localIp !== guestLobby.localIp,
    "LAN clients received the same virtual IP", { hostLobby, guestLobby });
  await Promise.all([
    lanCommand(host, "setName", "WebRTC Host"),
    lanCommand(guest, "setName", "WebRTC Guest"),
  ]);

  const hostCreate = await lanCommand(host, "host", "Browser Match");
  expect(hostCreate.ok === true, "original LANAPI did not create the host game", hostCreate);
  await frame(host, 90);
  const mapCache = await rpc(host, "mapCacheProbe");
  const map = mapCache.probe?.firstOfficialMultiplayerMap;
  expect(typeof map === "string" && map.length > 0,
    "host did not expose a real multiplayer map", mapCache.probe);
  const setMap = await lanCommand(host, "setMap", map);
  expect(setMap.ok === true, "host could not configure the real LAN map", setMap);
  console.error(`[lan-webrtc] host game created on ${map}`);

  const discovered = await waitFor("guest LAN game discovery", async () => {
    await pumpLobby(host, guest);
    return lanState(guest);
  }, (state) => state.discoveredGames >= 1, 30000);
  expect(discovered.game.present === false,
    "guest unexpectedly entered a game before joining", discovered);
  console.error("[lan-webrtc] guest discovered host over WebRTC broadcast");

  const join = await lanCommand(guest, "joinFirst");
  expect(join.ok === true, "guest could not request the discovered game", join);
  const joined = await waitFor("two-player original LAN lobby", async () => {
    await pumpLobby(host, guest);
    return Promise.all([lanState(host), lanState(guest)]);
  }, ([hostState, guestState]) => hostState.game?.numPlayers === 2
      && guestState.game?.numPlayers === 2
      && hostState.game?.map === guestState.game?.map,
  30000);
  console.error("[lan-webrtc] guest joined original LAN game");

  await Promise.all([
    lanCommand(host, "ready"),
    lanCommand(guest, "ready"),
  ]);
  const ready = await waitFor("guest ready propagation", async () => {
    await pumpLobby(host, guest);
    return Promise.all([lanState(host), lanState(guest)]);
  }, ([hostState]) => hostState.game?.slots?.filter((slot) => slot.human)
    .every((slot) => slot.accepted && slot.hasMap), 30000);
  console.error("[lan-webrtc] all human slots accepted with the map");

  const start = await lanCommand(host, "start");
  expect(start.ok === true && start.result?.state?.network?.ready === true,
    "host did not initialize the original Network on game start", start);
  const guestNetwork = await waitFor("guest original Network start", async () => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 220));
    await lanCommand(guest, "update");
    await frame(guest, 1);
    return lanState(guest);
  }, (state) => state.network?.ready === true, 30000);
  console.error("[lan-webrtc] both original Network instances started");

  const samples = [];
  let active = null;
  for (let tick = 0; tick < 4800; ++tick) {
    const [hostFrame, guestFrame] = await bothFrames(host, guest, 1);
    if (tick % 30 === 0) {
      const [hostNet, guestNet] = await Promise.all([lanState(host), lanState(guest)]);
      const sample = {
        tick,
        hostLogicFrame: hostFrame.gameplay?.logicFrame,
        guestLogicFrame: guestFrame.gameplay?.logicFrame,
        hostObjects: hostFrame.gameplay?.objectCount,
        guestObjects: guestFrame.gameplay?.objectCount,
        hostNetwork: hostNet.network,
        guestNetwork: guestNet.network,
      };
      samples.push(sample);
      console.error(`[lan-webrtc] tick=${tick} host=${sample.hostLogicFrame}/${sample.hostObjects} guest=${sample.guestLogicFrame}/${sample.guestObjects}`);
      if (hostFrame.gameplay?.gameMode === GAME_LAN
          && guestFrame.gameplay?.gameMode === GAME_LAN
          && hostFrame.gameplay?.inGame === true
          && guestFrame.gameplay?.inGame === true
          && hostFrame.gameplay?.loadingMap === false
          && guestFrame.gameplay?.loadingMap === false
          && hostFrame.gameplay?.inputEnabled === true
          && guestFrame.gameplay?.inputEnabled === true
          && hostFrame.gameplay?.objectCount > 0
          && guestFrame.gameplay?.objectCount > 0
          && hostNet.network?.crcMismatch === false
          && guestNet.network?.crcMismatch === false) {
        active = { tick, hostFrame, guestFrame, hostNet, guestNet };
        break;
      }
    }
  }
  expect(active != null, "two-client LAN match did not become playable", samples.slice(-12));

  let postActiveFrames = null;
  for (let tick = 0; tick < 10; ++tick) {
    postActiveFrames = await bothFrames(host, guest, 1);
  }
  const [finalHost, finalGuest] = await Promise.all([lanState(host), lanState(guest)]);
  expect(finalHost.network?.crcMismatch === false
      && finalGuest.network?.crcMismatch === false
      && postActiveFrames?.[0]?.gameplay?.logicFrame > active.hostFrame.gameplay.logicFrame
      && postActiveFrames?.[1]?.gameplay?.logicFrame > active.guestFrame.gameplay.logicFrame
      && postActiveFrames?.[0]?.gameplay?.logicFrame === postActiveFrames?.[1]?.gameplay?.logicFrame,
    "original lockstep simulation did not survive post-active frames",
    { finalHost, finalGuest, active, postActiveFrames });

  const hostScreenshot = resolve(artifactRoot, "lan-webrtc-host.png");
  const guestScreenshot = resolve(artifactRoot, "lan-webrtc-guest.png");
  await Promise.all([
    host.page.locator("#viewport").screenshot({ path: hostScreenshot }),
    guest.page.locator("#viewport").screenshot({ path: guestScreenshot }),
  ]);

  const [hostGpu, guestGpu] = await Promise.all([
    browserRenderer(host),
    browserRenderer(guest),
  ]);
  const expectedRenderer = String(process.env.CNC_EXPECT_RENDERER ?? "").trim();
  if (expectedRenderer) {
    expect(hostGpu.unmaskedRenderer?.includes(expectedRenderer)
        && guestGpu.unmaskedRenderer?.includes(expectedRenderer),
      "browser did not use the expected GPU renderer", { expectedRenderer, hostGpu, guestGpu });
  }

  const result = {
    ok: true,
    path: "real-lan-lobby-to-playable-webrtc-match",
    map,
    room,
    lobby: { host: joined[0], guest: joined[1], ready },
    start: { host: start.result.state.network, guest: guestNetwork.network },
    active,
    postActiveFrames,
    final: { host: finalHost, guest: finalGuest },
    signaling: signaling.stats(),
    screenshots: { host: hostScreenshot, guest: guestScreenshot },
    gpu: { host: hostGpu, guest: guestGpu },
    browserErrors: { host: host.errors, guest: guest.errors },
  };
  expect(result.signaling.gamePayloadBytes === 0,
    "signaling server relayed game payload bytes", result.signaling);
  expect(host.errors.length === 0 && guest.errors.length === 0,
    "browser failed during playable LAN match", result.browserErrors);
  await writeFile(resolve(artifactRoot, "lan-webrtc-playable-match.json"),
    `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally {
  await host?.context.close();
  await guest?.context.close();
  await browser?.close();
  signaling?.close();
  await server?.close();
}
