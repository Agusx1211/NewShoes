#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { startBinaryWebSocketRelayServer } from "./websocket-binary-relay-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot });
const relayServer = await startBinaryWebSocketRelayServer();

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function relayedBytes(relayResult) {
  return relayResult.receiveResult.messages.reduce((total, message) => total + message.bytes, 0);
}

async function createClient(browser, harnessUrl, label, browserEvents) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("console", (message) => {
    browserEvents.push({ client: label, type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ client: label, type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ client: label, type: "crash" });
  });

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  const boot = await page.evaluate((source) => window.CnCPort.rpc("boot", { source }), label);
  expect(boot.ok === true && boot.state?.wasm === "loaded",
    `${label} browser context did not boot the wasm harness`, boot);
  return { context, page, boot };
}

async function receiveBinaryMessages(page, webSocketUrl, expectedMessages, label) {
  return page.evaluate(({ webSocketUrl: url, expectedMessages: count, label: receiverLabel }) =>
    new Promise((resolveResult, rejectResult) => {
      const socket = new WebSocket(url);
      const messages = [];
      const timeout = setTimeout(() => {
        socket.close();
        rejectResult(new Error(`${receiverLabel} timed out waiting for ${count} WebSocket message(s)`));
      }, 5000);
      socket.binaryType = "arraybuffer";
      socket.onerror = () => {
        clearTimeout(timeout);
        rejectResult(new Error(`${receiverLabel} WebSocket error`));
      };
      socket.onmessage = (event) => {
        const bytes = new Uint8Array(event.data);
        messages.push({
          bytes: bytes.length,
          hex: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
        });
        if (messages.length >= count) {
          clearTimeout(timeout);
          socket.close();
          resolveResult({
            ok: true,
            binaryType: socket.binaryType,
            messages,
          });
        }
      };
    }), { webSocketUrl, expectedMessages, label });
}

async function sendBinaryMessages(page, webSocketUrl, hexMessages, label) {
  return page.evaluate(({ webSocketUrl: url, hexMessages: packets, label: senderLabel }) =>
    new Promise((resolveResult, rejectResult) => {
      const socket = new WebSocket(url);
      const timeout = setTimeout(() => {
        socket.close();
        rejectResult(new Error(`${senderLabel} timed out sending WebSocket message(s)`));
      }, 5000);
      socket.binaryType = "arraybuffer";
      socket.onerror = () => {
        clearTimeout(timeout);
        rejectResult(new Error(`${senderLabel} WebSocket error`));
      };
      socket.onopen = () => {
        let sentBytes = 0;
        for (const packetHex of packets) {
          const bytePairs = packetHex.match(/../g) ?? [];
          const bytes = new Uint8Array(bytePairs.map((pair) => Number.parseInt(pair, 16)));
          sentBytes += bytes.length;
          socket.send(bytes);
        }
        setTimeout(() => {
          clearTimeout(timeout);
          socket.close();
          resolveResult({
            ok: true,
            binaryType: socket.binaryType,
            messages: packets.length,
            sentBytes,
          });
        }, 50);
      };
    }), { webSocketUrl, hexMessages, label });
}

async function relayHexMessages({
  sourcePage,
  destinationPage,
  hexMessages,
  expectedMessages = hexMessages.length,
  label,
}) {
  const receivePromise = receiveBinaryMessages(destinationPage, relayServer.url, expectedMessages, `${label} receiver`);
  await relayServer.waitForConnections(1);
  const sendResult = await sendBinaryMessages(sourcePage, relayServer.url, hexMessages, `${label} sender`);
  const receiveResult = await receivePromise;
  expect(sendResult.ok === true
      && sendResult.messages === hexMessages.length
      && receiveResult.ok === true
      && receiveResult.messages.length === expectedMessages
      && receiveResult.binaryType === "arraybuffer"
      && receiveResult.messages.every((message, index) => message.hex === hexMessages[index]),
    `${label} did not relay the expected WebSocket binary message(s)`, { sendResult, receiveResult });
  return { sendResult, receiveResult };
}

function assertAnnounceBuild(buildProbe) {
  const packet = buildProbe?.packet;
  expect(buildProbe?.ok === true
      && buildProbe.originalMessage === "LANMessage::MSG_GAME_ANNOUNCE"
      && buildProbe.originalSerializer === "LANMessage struct byte payload"
      && packet?.messageType === "MSG_GAME_ANNOUNCE"
      && packet.remoteIp === 0x7f000002
      && packet.localIp === 0x7f000001
      && packet.port === 8086
      && packet.gameName === "Browser LAN Game"
      && packet.parsedMap === "Maps/TournamentDesert/TournamentDesert.map"
      && packet.bytes > 0
      && packet.hex.length === packet.bytes * 2,
    "LANAPI announce build mismatch", buildProbe);
}

function assertAnnounceReceive(receiveProbe, buildPacket) {
  expect(receiveProbe?.ok === true
      && receiveProbe.originalDispatch === "LANAPI::update"
      && receiveProbe.originalHandler === "LANAPI::handleGameAnnounce"
      && receiveProbe.originalParser === "ParseGameOptionsString"
      && receiveProbe.originalCallback === "LANAPI::OnGameList"
      && receiveProbe.packet?.decoded === true
      && receiveProbe.packet?.bytes === buildPacket.bytes
      && receiveProbe.packet?.messageType === buildPacket.messageType
      && receiveProbe.transport?.injected === true
      && receiveProbe.transport?.cleared === true
      && receiveProbe.lanApi?.updateDriven === true
      && receiveProbe.lanApi?.handleGameAnnounceRecorded === true
      && receiveProbe.game?.recorded === true
      && receiveProbe.game?.gameName === buildPacket.gameName
      && receiveProbe.game?.map === buildPacket.parsedMap
      && receiveProbe.game?.slotsClosed === true,
    "LANAPI announce receive mismatch", receiveProbe);
}

function assertJoinRequestBuild(buildProbe) {
  const packet = buildProbe?.packet;
  expect(buildProbe?.ok === true
      && buildProbe.originalRequest === "LANAPI::RequestGameJoin"
      && buildProbe.originalTransport === "Transport::queueSend"
      && packet?.messageType === "MSG_REQUEST_JOIN"
      && packet.remoteIp === 0x7f000002
      && packet.localIp === 0x7f000003
      && packet.gameIP === 0x7f000002
      && packet.bytes > 0
      && packet.hex.length === packet.bytes * 2,
    "LANAPI join request build mismatch", buildProbe);
}

function assertHostJoinRequest(hostProbe, requestPacket) {
  const reply = hostProbe?.reply;
  expect(hostProbe?.ok === true
      && hostProbe.originalDispatch === "LANAPI::update"
      && hostProbe.originalHandler === "LANAPI::handleRequestJoin"
      && hostProbe.originalCallback === "LANAPI::OnPlayerJoin"
      && hostProbe.originalReply === "LANAPI::RequestGameOptions"
      && hostProbe.packet?.decoded === true
      && hostProbe.packet?.bytes === requestPacket.bytes
      && hostProbe.packet?.messageType === requestPacket.messageType
      && hostProbe.transport?.injected === true
      && hostProbe.transport?.cleared === true
      && hostProbe.lanApi?.updateDriven === true
      && hostProbe.lanApi?.onPlayerJoinCalls === 1
      && hostProbe.game?.joinerAdded === true
      && reply?.joinAcceptType === "MSG_JOIN_ACCEPT"
      && reply?.gameOptionsType === "MSG_GAME_OPTIONS"
      && typeof reply.joinAcceptHex === "string"
      && reply.joinAcceptHex.length > 0
      && typeof reply.gameOptionsHex === "string"
      && reply.gameOptionsHex.length > 0,
    "LANAPI host join request mismatch", hostProbe);
}

function assertJoinerAcceptOptions(joinerProbe) {
  expect(joinerProbe?.ok === true
      && joinerProbe.originalDispatch === "LANAPI::update"
      && joinerProbe.originalHandlers === "LANAPI::handleJoinAccept+LANAPI::handleGameOptions"
      && joinerProbe.originalParser === "GameInfoToAsciiString -> ParseAsciiStringToGameInfo"
      && joinerProbe.originalCallbacks === "LANAPI::OnGameJoin+LANAPI::OnGameOptions"
      && joinerProbe.packets?.joinAcceptDecoded === true
      && joinerProbe.packets?.gameOptionsDecoded === true
      && joinerProbe.transport?.joinAcceptInjected === true
      && joinerProbe.transport?.gameOptionsInjected === true
      && joinerProbe.lanApi?.onGameJoinCalls === 1
      && joinerProbe.lanApi?.onGameOptionsCalls >= 1
      && joinerProbe.game?.joinRecorded === true
      && joinerProbe.game?.optionsParsed === true
      && joinerProbe.game?.localSlot === 1,
    "LANAPI joiner accept/options mismatch", joinerProbe);
}

function assertGameStartBuild(buildProbe) {
  const packet = buildProbe?.packet;
  expect(buildProbe?.ok === true
      && buildProbe.originalRequest === "LANAPI::RequestGameStart"
      && buildProbe.originalTransport === "Transport::queueSend"
      && buildProbe.originalCallback === "LANAPI::OnGameStart"
      && buildProbe.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
      && packet?.messageType === "MSG_GAME_START"
      && packet.activeBytes > 0
      && packet.activeBytes <= 476
      && buildProbe.lanApi?.hostGameReady === true
      && buildProbe.lanApi?.onGameStartCalls === 1
      && buildProbe.network?.setupReady === true
      && buildProbe.network?.localSlot === 0,
    "LANAPI game-start build mismatch", buildProbe);
}

function assertGameStartAccept(clientProbe) {
  expect(clientProbe?.ok === true
      && clientProbe.originalDispatch === "LANAPI::update"
      && clientProbe.originalHandler === "LANAPI::handleGameStart"
      && clientProbe.originalCallback === "LANAPI::OnGameStart"
      && clientProbe.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
      && clientProbe.packet?.decoded === true
      && clientProbe.packet?.messageType === "MSG_GAME_START"
      && clientProbe.transport?.injected === true
      && clientProbe.transport?.cleared === true
      && clientProbe.lanApi?.updateDriven === true
      && clientProbe.lanApi?.onGameStartCalls === 1
      && clientProbe.network?.setupReady === true
      && clientProbe.network?.localSlot === 1
      && clientProbe.callback?.sideEffectsReady === true,
    "LANAPI game-start accept mismatch", clientProbe);
}

let browser;
let hostClient;
let joinerClient;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  hostClient = await createClient(browser, harnessUrl, "websocket-lan-host", browserEvents);
  joinerClient = await createClient(browser, harnessUrl, "websocket-lan-joiner", browserEvents);
  expect(hostClient.context !== joinerClient.context,
    "LANAPI WebSocket flow smoke did not create isolated browser contexts", {});

  const announceBuild = await hostClient.page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiAnnounceBuildPacket"));
  assertAnnounceBuild(announceBuild.buildProbe);
  const announceRelay = await relayHexMessages({
    sourcePage: hostClient.page,
    destinationPage: joinerClient.page,
    hexMessages: [announceBuild.buildProbe.packet.hex],
    label: "LANAPI announce",
  });
  const announceReceive = await joinerClient.page.evaluate((packetHex) =>
    window.CnCPort.rpc("browserLanApiAnnounceAcceptPacket", { packetHex }),
    announceRelay.receiveResult.messages[0].hex);
  assertAnnounceReceive(announceReceive.receiveProbe, announceBuild.buildProbe.packet);

  const joinBuild = await joinerClient.page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiJoinRequestBuildPacket"));
  assertJoinRequestBuild(joinBuild.buildProbe);
  const joinRequestRelay = await relayHexMessages({
    sourcePage: joinerClient.page,
    destinationPage: hostClient.page,
    hexMessages: [joinBuild.buildProbe.packet.hex],
    label: "LANAPI join request",
  });
  const hostJoin = await hostClient.page.evaluate((packetHex) =>
    window.CnCPort.rpc("browserLanApiJoinRequestAcceptPacket", { packetHex }),
    joinRequestRelay.receiveResult.messages[0].hex);
  assertHostJoinRequest(hostJoin.hostProbe, joinBuild.buildProbe.packet);

  const replyHexMessages = [
    hostJoin.hostProbe.reply.joinAcceptHex,
    hostJoin.hostProbe.reply.gameOptionsHex,
  ];
  const joinReplyRelay = await relayHexMessages({
    sourcePage: hostClient.page,
    destinationPage: joinerClient.page,
    hexMessages: replyHexMessages,
    expectedMessages: 2,
    label: "LANAPI join replies",
  });
  const joinerAccept = await joinerClient.page.evaluate((payload) =>
    window.CnCPort.rpc("browserLanApiJoinAcceptAcceptPacket", payload), {
    joinAcceptHex: joinReplyRelay.receiveResult.messages[0].hex,
    gameOptionsHex: joinReplyRelay.receiveResult.messages[1].hex,
  });
  assertJoinerAcceptOptions(joinerAccept.joinerProbe);

  const gameStartBuild = await hostClient.page.evaluate(() =>
    window.CnCPort.rpc("browserLanApiGameStartBuildPacket"));
  assertGameStartBuild(gameStartBuild.buildProbe);
  const gameStartRelay = await relayHexMessages({
    sourcePage: hostClient.page,
    destinationPage: joinerClient.page,
    hexMessages: [gameStartBuild.buildProbe.packet.hex],
    label: "LANAPI game start",
  });
  const gameStartAccept = await joinerClient.page.evaluate((packetHex) =>
    window.CnCPort.rpc("browserLanApiGameStartAcceptPacket", { packetHex }),
    gameStartRelay.receiveResult.messages[0].hex);
  assertGameStartAccept(gameStartAccept.clientProbe);

  const relayStats = relayServer.stats();
  const expectedFrames = 5;
  const expectedBytes =
    relayedBytes(announceRelay) +
    relayedBytes(joinRequestRelay) +
    relayedBytes(joinReplyRelay) +
    relayedBytes(gameStartRelay);
  expect(relayStats.receivedFrames === expectedFrames
      && relayStats.forwardedFrames === expectedFrames
      && relayStats.receivedBytes === expectedBytes
      && relayStats.forwardedBytes === expectedBytes,
    "LANAPI WebSocket relay stats mismatch", { relayStats, expectedFrames, expectedBytes });

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser context emitted an error during LANAPI WebSocket flow", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-lanapi-websocket-flow",
    harnessUrl,
    browserContexts: 2,
    isolatedContexts: true,
    relay: {
      browserTransport: "browser WebSocket binary LANAPI relay",
      serverTransport: "Node WebSocket relay server",
      productionTransport: false,
      hexHandoff: false,
      binaryFrames: relayStats.forwardedFrames,
      nextRequired: "wireLANAPITransportToProductionWebSocketTransport",
    },
    announce: {
      sourceClient: "websocket-lan-host",
      destinationClient: "websocket-lan-joiner",
      originalSerializer: announceBuild.buildProbe.originalSerializer,
      originalDispatch: announceReceive.receiveProbe.originalDispatch,
      originalHandler: announceReceive.receiveProbe.originalHandler,
      originalParser: announceReceive.receiveProbe.originalParser,
      originalCallback: announceReceive.receiveProbe.originalCallback,
      packet: {
        bytes: announceBuild.buildProbe.packet.bytes,
        messageType: announceBuild.buildProbe.packet.messageType,
        gameName: announceBuild.buildProbe.packet.gameName,
        map: announceBuild.buildProbe.packet.map,
      },
      transport: announceReceive.receiveProbe.transport,
      lanApi: announceReceive.receiveProbe.lanApi,
      game: announceReceive.receiveProbe.game,
    },
    join: {
      requestClient: "websocket-lan-joiner",
      hostClient: "websocket-lan-host",
      originalRequest: joinBuild.buildProbe.originalRequest,
      originalHostHandler: hostJoin.hostProbe.originalHandler,
      originalReply: hostJoin.hostProbe.originalReply,
      originalJoinerHandlers: joinerAccept.joinerProbe.originalHandlers,
      originalJoinerCallbacks: joinerAccept.joinerProbe.originalCallbacks,
      request: {
        bytes: joinBuild.buildProbe.packet.bytes,
        messageType: joinBuild.buildProbe.packet.messageType,
        gameIP: joinBuild.buildProbe.packet.gameIP,
      },
      reply: {
        joinAcceptBytes: joinReplyRelay.receiveResult.messages[0].bytes,
        gameOptionsBytes: joinReplyRelay.receiveResult.messages[1].bytes,
        joinAcceptType: hostJoin.hostProbe.reply.joinAcceptType,
        gameOptionsType: hostJoin.hostProbe.reply.gameOptionsType,
      },
      host: {
        transport: hostJoin.hostProbe.transport,
        lanApi: hostJoin.hostProbe.lanApi,
        game: hostJoin.hostProbe.game,
      },
      joiner: {
        transport: joinerAccept.joinerProbe.transport,
        lanApi: joinerAccept.joinerProbe.lanApi,
        game: joinerAccept.joinerProbe.game,
      },
    },
    gameStart: {
      hostClient: "websocket-lan-host",
      joinerClient: "websocket-lan-joiner",
      originalRequest: gameStartBuild.buildProbe.originalRequest,
      originalHostNetwork: gameStartBuild.buildProbe.originalNetwork,
      originalJoinerHandler: gameStartAccept.clientProbe.originalHandler,
      originalJoinerNetwork: gameStartAccept.clientProbe.originalNetwork,
      packet: {
        bytes: gameStartBuild.buildProbe.packet.bytes,
        activeBytes: gameStartBuild.buildProbe.packet.activeBytes,
        messageType: gameStartBuild.buildProbe.packet.messageType,
      },
      host: {
        lanApi: gameStartBuild.buildProbe.lanApi,
        network: gameStartBuild.buildProbe.network,
        callback: gameStartBuild.buildProbe.callback,
      },
      joiner: {
        transport: gameStartAccept.clientProbe.transport,
        lanApi: gameStartAccept.clientProbe.lanApi,
        network: gameStartAccept.clientProbe.network,
        callback: gameStartAccept.clientProbe.callback,
      },
    },
    relayStats,
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await hostClient?.context.close();
  await joinerClient?.context.close();
  await browser?.close();
  await relayServer.close();
  await server.close();
}
