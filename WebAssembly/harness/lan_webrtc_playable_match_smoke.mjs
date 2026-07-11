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
const playerCount = Number.parseInt(process.env.CNC_MATCH_PLAYERS ?? "2", 10);
let parallelClientFrames = false;

if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
  throw new Error(`CNC_MATCH_PLAYERS must be between 2 and 8, received ${process.env.CNC_MATCH_PLAYERS}`);
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

async function pumpLobby(clients) {
  await Promise.all(clients.map((client) => lanCommand(client, "update")));
  await allFrames(clients, 1);
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
  const client = { context, page, label, peerId, errors: [] };
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
const browsers = [];
const clients = [];

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
  const separateBrowsers = playerCount >= 4 || process.env.CNC_BROWSER_PER_PLAYER === "1";
  parallelClientFrames = separateBrowsers;
  for (let index = 0; index < playerCount; ++index) {
    if (separateBrowsers || browsers.length === 0) {
      browsers.push(await chromium.launch(launchOptions));
    }
    const host = index === 0;
    const label = host ? "WebRTC Host" : `WebRTC Guest ${index}`;
    const peerId = host ? "host" : `guest-${index}`;
    const clientBrowser = separateBrowsers ? browsers[index] : browsers[0];
    clients.push(await createClient(clientBrowser,
      server.url, signalingUrl.href, room, label, peerId));
  }
  const [host, ...guests] = clients;
  await signaling.waitForPeers(playerCount, 30000);
  const peerConnections = await Promise.all(clients.map((client) =>
    rpc(client, "browserWebRtcEndpointWaitForPeers", {
      count: playerCount - 1,
      timeoutMs: 30000,
    })));
  expect(peerConnections.every((result) => result.ok === true
      && result.runtime?.endpoint?.openPeers === playerCount - 1),
  "WebRTC clients did not form a complete peer mesh", peerConnections);

  const lobbies = [];
  for (const client of clients) {
    lobbies.push(await enterLanLobby(client));
  }
  console.error(`[lan-webrtc] ${playerCount} original LAN lobbies entered`);
  expect(new Set(lobbies.map((lobby) => lobby.localIp)).size === playerCount,
    "LAN clients did not receive unique virtual IPs", lobbies);
  await Promise.all(clients.map((client, index) =>
    lanCommand(client, "setName", `P${index + 1} WebRTC`)));

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
      state.game?.numPlayers === expectedPlayers && state.game?.map === map), 45000);
    console.error(`[lan-webrtc] ${guest.label} joined (${expectedPlayers}/${playerCount})`);
  }
  expect(joined?.every((state) => state.game?.numPlayers === playerCount
      && state.game?.map === map),
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

  const start = await lanCommand(host, "start");
  expect(start.ok === true && start.result?.state?.network?.ready === true,
    "host did not initialize the original Network on game start", start);
  const guestNetworks = await waitFor("guest original Network start", async () => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 220));
    await Promise.all(guests.map((guest) => lanCommand(guest, "update")));
    await allFrames(guests, 1);
    return Promise.all(guests.map((guest) => lanState(guest)));
  }, (states) => states.every((state) => state.network?.ready === true
      && state.network?.numPlayers === playerCount), 45000);
  console.error(`[lan-webrtc] all ${playerCount} original Network instances started`);

  const samples = [];
  let active = null;
  for (let tick = 0; tick < 4800; ++tick) {
    const frames = await allFrames(clients, 1);
    if (tick % 30 === 0) {
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
      if (frames.every((clientFrame) => clientFrame.gameplay?.gameMode === GAME_LAN
          && clientFrame.gameplay?.inGame === true
          && clientFrame.gameplay?.loadingMap === false
          && clientFrame.gameplay?.inputEnabled === true
          && clientFrame.gameplay?.logicFrame > 0
          && clientFrame.gameplay?.objectCount > 0)
          && states.every((state) => state.network?.crcMismatch === false
            && state.network?.numPlayers === playerCount)
          && logicFrameSkew <= playerCount - 1
          && new Set(objectCounts).size === 1
          && new Set(playerIds).size === playerCount) {
        active = { tick, logicFrameSkew, frames, states };
        break;
      }
    }
  }
  expect(active != null, `${playerCount}-client LAN match did not become playable`, samples.slice(-12));

  const requiredPostActiveLogicFrames = playerCount >= 4 ? 3 : 10;
  let postActiveFrames = null;
  let postActiveStates = null;
  let postActiveDriverTicks = 0;
  for (; postActiveDriverTicks < 600; ++postActiveDriverTicks) {
    postActiveFrames = await allFrames(clients, 1);
    postActiveStates = await Promise.all(clients.map((client) => lanState(client)));
    expect(postActiveStates.every((state) => state.network?.numPlayers === playerCount
        && state.network?.crcMismatch === false),
    "network membership changed during the post-active drive",
    postActiveStates.map((state) => state.network));
    const advanced = postActiveFrames.every((clientFrame, index) =>
      clientFrame.gameplay?.logicFrame >= active.frames[index].gameplay.logicFrame
        + requiredPostActiveLogicFrames);
    if (advanced) {
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
      && finalLogicFrameSkew <= playerCount - 1,
    "original lockstep simulation did not survive post-active frames",
    {
      activeLogicFrames: active.frames.map((clientFrame) => clientFrame.gameplay?.logicFrame),
      finalLogicFrames,
      finalLogicFrameSkew,
      postActiveDriverTicks,
      requiredPostActiveLogicFrames,
      networks: finalStates.map((state) => state.network),
    });

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

  const result = {
    ok: true,
    path: "real-lan-lobby-to-playable-webrtc-match",
    playerCount,
    map,
    mapPlayers: selectedMap.players,
    room,
    lobby: { joined, ready },
    start: [start.result.state.network, ...guestNetworks.map((state) => state.network)],
    active,
    postActiveFrames,
    postActiveDriverTicks,
    requiredPostActiveLogicFrames,
    finalLogicFrameSkew,
    final: finalStates,
    endpoints: endpointStates.map((state) => state.runtime.endpoint),
    signaling: signaling.stats(),
    screenshots,
    gpu,
    browserErrors: clients.map((client) => ({ peerId: client.peerId, errors: client.errors })),
  };
  expect(result.signaling.gamePayloadBytes === 0
      && result.signaling.rooms?.some((activeRoom) => activeRoom.peers.length === playerCount),
  "signaling server relayed game payload bytes or lost room members", result.signaling);
  expect(clients.every((client) => client.errors.length === 0),
    "browser failed during playable LAN match", result.browserErrors);
  const resultName = playerCount === 2
    ? "lan-webrtc-playable-match.json"
    : `lan-webrtc-${playerCount}p-playable-match.json`;
  await writeFile(resolve(artifactRoot, resultName),
    `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} finally {
  for (const client of clients) {
    await client.context.close();
  }
  for (const activeBrowser of browsers) {
    await activeBrowser.close();
  }
  signaling?.close();
  await server?.close();
}
