#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const distRoot = resolve(wasmRoot, "dist");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function expect(condition, message, payload) {
  if (!condition) {
    fail(`${message}: ${JSON.stringify(payload)}`);
  }
}

function iniLayoutMatches(layout) {
  return layout?.source === "terrain-probe-tu-vs-real-ini-runtime"
    && layout?.matches === true
    && layout?.probe?.sizeofINI === layout?.runtime?.sizeofINI
    && layout?.probe?.offsets?.m_seps === layout?.runtime?.offsets?.m_seps
    && layout?.probe?.offsets?.m_sepsPercent === layout?.runtime?.offsets?.m_sepsPercent
    && layout?.probe?.offsets?.m_sepsColon === layout?.runtime?.offsets?.m_sepsColon
    && layout?.probe?.offsets?.m_sepsQuote === layout?.runtime?.offsets?.m_sepsQuote
    && layout?.probe?.separators?.seps === layout?.runtime?.separators?.seps
    && layout?.probe?.separators?.sepsPercent === layout?.runtime?.separators?.sepsPercent
    && layout?.probe?.separators?.sepsColon === layout?.runtime?.separators?.sepsColon
    && layout?.probe?.separators?.sepsQuote === layout?.runtime?.separators?.sepsQuote;
}

function extractJson(stdout, label) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; --index) {
    const line = lines[index].trim();
    if (!line.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(lines.slice(index).join("\n"));
    } catch {
      // Continue scanning upward; most browser smokes emit pretty JSON.
    }
  }
  fail(`${label} did not emit a JSON result`);
}

function runNodeStep(step, root = wasmRoot) {
  const executable = resolve(root, step.file);
  console.log(`\n== ${step.name} ==`);
  const result = spawnSync(process.execPath, [executable, ...(step.args ?? [])], {
    cwd: wasmRoot,
    env: { ...process.env, ...(step.env ?? {}) },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
      if (!result.stdout.endsWith("\n")) {
        process.stdout.write("\n");
      }
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    fail(`${step.name} failed with exit code ${result.status}`);
  }

  const payload = extractJson(result.stdout, step.name);
  step.validate(payload);
  console.log(`${step.name}: ok`);
  return {
    name: step.name,
    file: step.file,
  };
}

function assertDeviceFrontier(payload, label) {
  const frontier = payload.originalEngineStartup?.deviceFactoryFrontier;
  expect(frontier?.firstUnownedInitFactory === "createAudioManager",
    `${label} did not preserve createAudioManager as the first unowned factory`, frontier);
  expect(frontier.firstUnownedInitLine === 434,
    `${label} did not preserve the createAudioManager line`, frontier);
  expect(frontier.factoryMappings?.CreateGameEngine === "Win32GameEngine",
    `${label} did not preserve the Win32GameEngine mapping`, frontier);
  expect((frontier.entries ?? []).find((entry) => entry.factory === "CreateGameEngine")?.ready === true,
    `${label} did not preserve browser CreateGameEngine construction readiness`, frontier);
  expect(frontier.factoryMappings?.createArchiveFileSystem === "Win32BIGFileSystem",
    `${label} did not preserve the archive filesystem mapping`, frontier);
  expect(frontier.factoryMappings?.createAudioManager === "MilesAudioManager",
    `${label} did not preserve the Miles audio mapping`, frontier);
}

function hasBaseIniArchive(payload) {
  return (payload.optionalBaseArchives ?? []).some((archive) =>
    archive.sourceName === "INI.big" && archive.mountName === "ZZBase_INI.big");
}

function assertStartupSingletonFrontier(payload, label) {
  const startup = payload.originalEngineStartup;
  const frontier = startup?.deviceFactoryFrontier;
  const entries = frontier?.entries ?? [];
  const byFactory = new Map(entries.map((entry) => [entry.factory, entry]));
  const baseIniMounted = hasBaseIniArchive(payload);
  const expectedSingletonReady = baseIniMounted;

  expect(startup?.originalSetup?.subsystemList === true,
    `${label} did not preserve browser-owned SubsystemInterfaceList setup`, startup?.originalSetup);
  expect(startup.originalSetup?.startupSingletons === expectedSingletonReady,
    `${label} startup singleton readiness did not match base INI availability`, startup?.originalSetup);
  expect(startup.browserDeviceLayer?.startupSingletons === expectedSingletonReady,
    `${label} browser device layer startup singleton readiness mismatch`, startup?.browserDeviceLayer);
  expect(frontier.startupSingletonsReady === expectedSingletonReady,
    `${label} device frontier startup singleton readiness mismatch`, frontier);
  expect(byFactory.get("SubsystemInterfaceList")?.ready === true,
    `${label} did not mark SubsystemInterfaceList ready at the GameEngine.cpp line`, frontier);
  expect(byFactory.get("GameLODManager")?.ready === expectedSingletonReady,
    `${label} GameLODManager readiness did not track base GameLODPresets.ini availability`, frontier);
  expect(byFactory.get("MapCache")?.ready === false,
    `${label} should keep MapCache::updateCache deferred until the post-audio GameEngine.cpp point`, frontier);

  if (baseIniMounted) {
    expect(startup.status === "browser_device_layer_pending",
      `${label} with base INI mounted should advance to browser device layer pending`, startup);
    expect(frontier.nextRequired === "originalGameEngineInitOwnership" && frontier.setupReady === true,
      `${label} with base INI mounted should be ready for original GameEngine init ownership`, frontier);
  } else {
    expect(startup.status === "missing_startup_files",
      `${label} without base INI should report missing startup files`, startup);
    expect(frontier.nextRequired === "startupFiles" && frontier.setupReady === false,
      `${label} without base INI should keep startup files as next required`, frontier);
    expect(startup.startupFiles?.baseIniArchive?.missing?.includes("Data\\INI\\GameLODPresets.ini"),
      `${label} should name base GameLODPresets.ini as the GameLOD blocker`, startup.startupFiles);
  }
}

const steps = [
  {
    name: "startup-vertical",
    file: "tools/run_startup_vertical_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "startup vertical smoke did not report ok", payload);
      expect(payload.path === "startup-vertical",
        "startup vertical smoke emitted the wrong path", payload);
      expect(payload.covered?.includes("browser wasm original GameEngine.cpp startup frontier"),
        "startup vertical smoke did not cover the browser GameEngine.cpp startup frontier", payload);
      expect(payload.covered?.includes("original GameEngine.cpp constructor/destructor lifetime with global TheGameEngine ownership"),
        "startup vertical smoke did not cover original GameEngine.cpp lifetime ownership", payload);
      expect(payload.covered?.includes("original MilesAudioManager openDevice"),
        "startup vertical smoke did not cover original MilesAudioManager openDevice", payload);
      expect(payload.covered?.includes("original W3DGameWindowManager window and gadget ownership"),
        "startup vertical smoke did not cover original W3DGameWindowManager ownership", payload);
      expect(payload.covered?.includes("runtime original GameLogic::processCommandList dispatch of MSG_NEW_GAME through prepareNewGame, original GlobalData TheWritableGlobalData, original PlayerList::getNthPlayer neutral-player ownership, original ScriptEngine::setGlobalDifficulty, original Shell::hideShell, and first-call startNewGame(FALSE) deferral"),
        "startup vertical smoke did not cover runtime original GameLogic MSG_NEW_GAME dispatch through original GlobalData/PlayerList/ScriptEngine/Shell", payload);
      expect(payload.sourceChecks?.includes("gameengine-startup-order")
          && payload.sourceChecks?.includes("w3d-module-factory-frontier")
          && payload.sourceChecks?.includes("gamelogic-new-game-dispatch-frontier"),
        "startup vertical smoke did not include the expected source frontier checks", payload);
      expect(payload.browserChecks?.includes("startup-browser-frontier"),
        "startup vertical smoke did not include the browser startup frontier check", payload);
      expect(payload.smokes?.includes("win32-gameengine-original-lifetime")
          && payload.smokes?.includes("miles-audio-open-device")
          && payload.smokes?.includes("w3d-window-layout-script")
          && payload.smokes?.includes("gamelogic-new-game-dispatch"),
        "startup vertical smoke did not include the expected original lifetime/audio/W3D/GameLogic smokes", payload);
    },
  },
  {
    name: "runtime-archives-startup-data",
    file: "harness/runtime_archives_smoke.mjs",
    args: ["artifacts/real-assets"],
    validate(payload) {
      expect(payload.ok === true, "runtime archive smoke did not report ok", payload);
      expect(payload.reader === "Win32BIGFileSystem",
        "runtime archive smoke did not use the original BIG reader", payload);
      expect(payload.filesystem === "Emscripten MEMFS",
        "runtime archive smoke did not preload through MEMFS", payload);
      expect(payload.archiveCount >= 17,
        "runtime archive smoke did not mount the expected runtime archive set", payload);
      expect(payload.startupAssets?.status === "ready" && payload.startupAssets?.ok === true,
        "runtime archive smoke did not reach startup asset readiness", payload.startupAssets);
      expect(payload.aggregateProbe?.gameData?.ok === true,
        "runtime archive smoke did not parse GameData through the original INI path", payload.aggregateProbe);
      expect(payload.aggregateProbe?.gameText?.ok === true,
        "runtime archive smoke did not load real GameText", payload.aggregateProbe);
      expect(payload.aggregateProbe?.mapCache?.ok === true,
        "runtime archive smoke did not load real MapCache metadata", payload.aggregateProbe);
      expect(payload.browserMssSamplePlaybackRuntime?.runtimePlayback === true
          && payload.browserMssSamplePlaybackRuntime?.mssDriven === true
          && payload.browserMssSamplePlaybackRuntime?.lastEvent?.webAudioNode === "AudioBufferSourceNode",
        "runtime archive smoke did not prove MSS 2D sample playback through Web Audio", payload.browserMssSamplePlaybackRuntime);
      assertDeviceFrontier(payload, "runtime archive smoke");
      assertStartupSingletonFrontier(payload, "runtime archive smoke");
    },
  },
  {
    name: "browser-network-relay",
    file: "harness/smoke.mjs",
    env: { EXPECT_WASM: "1" },
    validate(payload) {
      expect(payload.ok === true, "browser network relay smoke did not report ok", payload);
      const relay = payload.state?.browserNetworkRelayRuntime;
      expect(relay?.ready === true
          && relay?.source === "GameNetwork browser relay NetPacket byte path proof"
          && relay?.sent === 1
          && relay?.delivered === 1
          && relay?.received === 1
          && relay?.packets?.[0]?.commandType === "NETCOMMANDTYPE_FRAMEINFO"
          && relay?.packets?.[0]?.executionFrame === 2468
          && relay?.packets?.[0]?.playerId === 2
          && relay?.packets?.[0]?.commandId === 314,
        "browser network relay smoke did not prove original NetPacket bytes through the relay", relay);
      const transport = payload.state?.browserNetworkTransportRuntime;
      expect(transport?.ready === true
          && transport?.source === "GameNetwork browser Transport/FrameData frame sync proof"
          && transport?.transportInjected === true
          && transport?.connectionManagerDriven === true
          && transport?.frameDataReady === true
          && transport?.sent === 1
          && transport?.delivered === 1
          && transport?.received === 1
          && transport?.packets?.[0]?.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
          && transport?.packets?.[0]?.commands === 2
          && transport?.packets?.[0]?.executionFrame === 2470
          && transport?.packets?.[0]?.playerId === 2
          && transport?.packets?.[0]?.commandId === 315
          && transport?.packets?.[0]?.runAheadCommandId === 316,
        "browser network relay smoke did not drive original Transport/FrameData frame readiness", transport);
    },
  },
  {
    name: "browser-audio-request-path",
    file: "harness/audio_request_path_smoke.mjs",
    args: ["artifacts/real-assets"],
    validate(payload) {
      expect(payload.ok === true, "browser audio request path smoke did not report ok", payload);
      expect(payload.path === "browser-audio-request-path"
          && payload.archiveCount >= 17
          && payload.audioContext?.state === "running"
          && payload.audioContext?.resumeTrigger === "canvas.pointerdown"
          && payload.mixer?.source === "browser Web Audio runtime mixer GainNode proof"
          && payload.mixer?.nodeGraph?.includes("GainNode")
          && payload.mixer?.nodeGraph?.includes("AudioDestinationNode")
          && payload.requestPath?.source === "browser source-shaped audio request queue live playback proof"
          && payload.requestPath?.sourcePathDriven === true
          && payload.requestPath?.engineDriven === false
          && payload.requestPath?.nextRequired === "realMilesAudioManagerWebAudioBackend"
          && payload.requestPath?.cacheEntries === 5
          && payload.requestPath?.completed === 3
          && payload.requestPath?.enqueued === 3
          && payload.requestPath?.drained === 3
          && payload.requestPath?.dispatched === 3
          && payload.requestPath?.started === 3
          && payload.requestPath?.released === 3
          && payload.requestPath?.coveredPlayingTypes?.includes("PAT_Sample")
          && payload.requestPath?.coveredPlayingTypes?.includes("PAT_3DSample")
          && payload.requestPath?.coveredPlayingTypes?.includes("PAT_Stream")
          && payload.requestPath?.coveredDeviceStarts?.includes("playSample")
          && payload.requestPath?.coveredDeviceStarts?.includes("playSample3D")
          && payload.requestPath?.coveredDeviceStarts?.includes("playStream")
          && payload.requestPath?.coveredAudioTypes?.includes("AT_SoundEffect")
          && payload.requestPath?.coveredAudioTypes?.includes("AT_Streaming")
          && payload.requestPath?.coveredBuses?.includes("sound")
          && payload.requestPath?.coveredBuses?.includes("sound3D")
          && payload.requestPath?.coveredBuses?.includes("speech")
          && payload.liveEventRuntime?.completed >= 3
          && payload.liveEventRuntime?.released >= 3,
        "browser audio request path smoke did not prove source-shaped audio request queue playback coverage", payload);
    },
  },
  {
    name: "miles-audio-play-sample",
    file: "miles-audio-play-sample-smoke.cjs",
    root: distRoot,
    validate(payload) {
      expect(payload.ok === true, "MilesAudioManager play-sample smoke did not report ok", payload);
      expect(payload.path === "MilesAudioManager::processRequest->playAudioEvent->playSample"
          && payload.request === "AR_Play"
          && payload.event === "PortSmoke2D"
          && payload.filename === "Data\\Audio\\Sounds\\PortSmoke.wav"
          && payload.sample?.statusAfterStart === 2
          && payload.sample?.statusAfterEnd === 1
          && payload.sample?.volume > 0.499
          && payload.sample?.volume < 0.501
          && payload.sample?.pan > 0.499
          && payload.sample?.pan < 0.501
          && payload.wav?.format === "PCM"
          && payload.wav?.rate === 44100
          && payload.wav?.channels === 2
          && payload.wav?.bits === 16
          && payload.manager?.samples2D === 2
          && payload.manager?.available2DAfterRelease === 2
          && payload.manager?.playingSoundsAfterRelease === 0
          && payload.manager?.audioEventReleases === 1,
        "MilesAudioManager play-sample smoke did not prove original processRequest/playAudioEvent/playSample lifecycle", payload);
    },
  },
  {
    name: "browser-audio-miles-webaudio-vertical",
    file: "harness/audio_miles_webaudio_vertical_smoke.mjs",
    args: ["artifacts/real-assets"],
    validate(payload) {
      expect(payload.ok === true, "paired Miles/Web Audio vertical did not report ok", payload);
      expect(payload.path === "browser-audio-miles-webaudio-vertical"
          && payload.archiveCount >= 17
          && payload.originalMilesManager?.path === "MilesAudioManager::processRequest->playAudioEvent->playSample"
          && payload.originalMilesManager?.event === "PortSmoke2D"
          && payload.originalMilesManager?.filename === "Data\\Audio\\Sounds\\PortSmoke.wav"
          && payload.originalMilesManager?.sample?.browserPlaybackRequested === false
          && payload.originalMilesManager?.sample?.statusAfterStart === 2
          && payload.originalMilesManager?.sample?.statusAfterEnd === 1
          && payload.originalMilesManager?.wav?.format === "PCM"
          && payload.originalMilesManager?.wav?.rate === 44100
          && payload.originalMilesManager?.wav?.channels === 2
          && payload.originalMilesManager?.wav?.bits === 16
          && payload.originalMilesManager?.manager?.audioEventReleases === 1
          && payload.browserMssSamplePlayback?.runtimePlayback === true
          && payload.browserMssSamplePlayback?.completed === 1
          && payload.browserMssSamplePlayback?.released === 1
          && payload.browserMssSamplePlayback?.webAudioNode === "AudioBufferSourceNode"
          && payload.browserMssSamplePlayback?.completionCallback === "AudioBufferSourceNode.onended"
          && payload.requestPath?.sourcePathDriven === true
          && payload.requestPath?.engineDriven === false
          && payload.requestPath?.completed === 1
          && payload.requestPath?.released === 1
          && payload.requestPath?.eventName === "CIAAgentVoiceAttack"
          && payload.requestPath?.audioType === "AT_SoundEffect"
          && payload.requestPath?.deviceStart === "playSample"
          && payload.requestPath?.playingType === "PAT_Sample"
          && payload.requestPath?.bus === "sound"
          && payload.nextRequired === "sameRuntimeMilesAudioManagerWebAudioBackend",
        "paired Miles/Web Audio vertical did not prove the original-manager leg beside browser Web Audio completion", payload);
    },
  },
  {
    name: "browser-network-two-contexts",
    file: "harness/network_two_contexts_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser two-context network smoke did not report ok", payload);
      expect(payload.path === "browser-network-two-contexts"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.productionTransport === false
          && payload.source?.client === "browser-client-0"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalSerializer === "NetPacket::addCommand"
          && payload.source?.packet?.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
          && payload.source?.packet?.commands === 2
          && payload.source?.packet?.executionFrame === 2470
          && payload.source?.packet?.playerId === 2
          && payload.source?.packet?.runAheadCommandId === 316
          && payload.destination?.client === "browser-client-1"
          && payload.destination?.wasm === "loaded"
          && payload.destination?.originalTransport === "Transport::m_inBuffer"
          && payload.destination?.originalRelay === "ConnectionManager::doRelay"
          && payload.destination?.originalFrameData === "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady"
          && payload.destination?.transport?.injected === true
          && payload.destination?.connectionManager?.doRelayDriven === true
          && payload.destination?.frameData?.ready === true
          && payload.destination?.frameData?.managerReady === true
          && payload.destination?.frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD",
        "browser two-context network smoke did not prove isolated wasm packet relay into original frame data", payload);
    },
  },
  {
    name: "browser-network-websocket-transport",
    file: "harness/network_websocket_transport_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser WebSocket transport smoke did not report ok", payload);
      expect(payload.path === "browser-network-websocket-transport"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.browserTransport === "browser WebSocket binary relay"
          && payload.relay?.serverTransport === "Node WebSocket relay server"
          && payload.relay?.productionTransport === true
          && payload.relay?.productionTransportWire === true
          && payload.relay?.hexHandoff === false
          && payload.relay?.binaryFrames === 1
          && payload.source?.client === "websocket-source"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalSerializer === "Transport::queueSend"
          && payload.source?.originalWireSend === "Transport::doSend -> browser UDP adapter Write"
          && payload.source?.transport?.initialized === true
          && payload.source?.transport?.queued === true
          && payload.source?.transport?.doSendDriven === true
          && payload.source?.transport?.adapterWrites === 1
          && payload.source?.transport?.outgoingBeforePop === 1
          && payload.source?.transport?.outgoingAfterPop === 0
          && payload.source?.websocket?.binaryType === "arraybuffer"
          && payload.source?.websocket?.sentBytes === payload.source?.wire?.bytes
          && payload.source?.wire?.bytes === payload.source?.packet?.bytes + payload.source?.wire?.headerBytes
          && payload.source?.wire?.headerBytes === 6
          && payload.source?.wire?.encrypted === true
          && payload.source?.wire?.crcValidAfterDecrypt === true
          && payload.source?.packet?.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
          && payload.source?.packet?.commands === 2
          && payload.source?.packet?.executionFrame === 2470
          && payload.source?.packet?.playerId === 2
          && payload.source?.packet?.runAheadCommandId === 316
          && payload.destination?.client === "websocket-destination"
          && payload.destination?.wasm === "loaded"
          && payload.destination?.websocket?.binaryType === "arraybuffer"
          && payload.destination?.websocket?.receivedBytes === payload.source?.wire?.bytes
          && payload.destination?.originalWireReceive === "browser UDP adapter Read -> Transport::doRecv decryptBuf/isGeneralsPacket"
          && payload.destination?.wire?.bytes === payload.source?.wire?.bytes
          && payload.destination?.wire?.pushResult === payload.source?.wire?.bytes
          && payload.destination?.wire?.incomingBeforeRecv === 1
          && payload.destination?.wire?.incomingAfterRecv === 0
          && payload.destination?.wire?.adapterReads === 1
          && payload.destination?.wire?.doRecvDriven === true
          && payload.destination?.wire?.crcValid === true
          && payload.destination?.packet?.bytes === payload.source?.packet?.bytes
          && payload.destination?.originalTransport === "Transport::m_inBuffer"
          && payload.destination?.originalRelay === "ConnectionManager::doRelay"
          && payload.destination?.originalFrameData === "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady"
          && payload.destination?.transport?.initialized === true
          && payload.destination?.transport?.buffered === true
          && payload.destination?.transport?.bufferedSlot === 0
          && payload.destination?.transport?.cleared === true
          && payload.destination?.connectionManager?.doRelayDriven === true
          && payload.destination?.frameData?.ready === true
          && payload.destination?.frameData?.managerReady === true
          && payload.destination?.frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD"
          && payload.relayStats?.receivedFrames === 1
          && payload.relayStats?.forwardedFrames === 1
          && payload.relayStats?.receivedBytes === payload.source?.wire?.bytes
          && payload.relayStats?.forwardedBytes === payload.source?.wire?.bytes,
        "browser WebSocket transport smoke did not carry encrypted original Transport wire bytes into original frame-data readiness", payload);
    },
  },
  {
    name: "browser-network-websocket-live-transport",
    file: "harness/network_websocket_live_transport_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser live WebSocket transport smoke did not report ok", payload);
      expect(payload.path === "browser-network-websocket-live-transport"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.browserTransport === "browser WebSocket live UDP endpoint"
          && payload.relay?.serverTransport === "Node WebSocket relay server"
          && payload.relay?.productionTransport === true
          && payload.relay?.productionTransportWire === true
          && payload.relay?.binaryFrames === 1
          && payload.relay?.hexHandoff === false
          && payload.source?.client === "live-websocket-source"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalSerializer === "Transport::queueSend"
          && payload.source?.originalWireSend === "Transport::doSend -> Module.cncPortBrowserUdpSend"
          && payload.source?.transport?.initialized === true
          && payload.source?.transport?.queued === true
          && payload.source?.transport?.doSendDriven === true
          && payload.source?.transport?.outBufferCleared === true
          && payload.source?.transport?.adapterWrites === 1
          && payload.source?.transport?.fallbackOutgoing === 0
          && payload.source?.endpoint?.sent === 1
          && payload.source?.endpoint?.sentBytes === payload.source?.packet?.bytes + 6
          && payload.source?.endpoint?.lastSent?.ip === 2130706434
          && payload.source?.endpoint?.lastSent?.port === 8088
          && payload.destination?.client === "live-websocket-destination"
          && payload.destination?.wasm === "loaded"
          && payload.destination?.originalWireReceive === "Module.cncPortBrowserUdpRecv -> Transport::doRecv decryptBuf/isGeneralsPacket"
          && payload.destination?.originalTransport === "Transport::m_inBuffer"
          && payload.destination?.originalRelay === "ConnectionManager::doRelay"
          && payload.destination?.originalFrameData === "NetPacket::getCommandList -> FrameDataManager::addNetCommandMsg/allCommandsReady"
          && payload.destination?.endpointBeforeRecv?.received === 1
          && payload.destination?.endpoint?.received === 1
          && payload.destination?.endpoint?.delivered === 1
          && payload.destination?.endpoint?.queuedIncoming === 0
          && payload.destination?.endpoint?.receivedBytes === payload.source?.endpoint?.sentBytes
          && payload.destination?.endpoint?.deliveredBytes === payload.source?.endpoint?.sentBytes
          && payload.destination?.packet?.bytes === payload.source?.packet?.bytes
          && payload.destination?.packet?.hex === payload.source?.packet?.hex
          && payload.destination?.transport?.initialized === true
          && payload.destination?.transport?.doRecvDriven === true
          && payload.destination?.transport?.buffered === true
          && payload.destination?.transport?.bufferedSlot === 0
          && payload.destination?.transport?.cleared === true
          && payload.destination?.transport?.adapterReads === 1
          && payload.destination?.transport?.fallbackIncoming === 0
          && payload.destination?.transport?.crcValid === true
          && payload.destination?.connectionManager?.doRelayDriven === true
          && payload.destination?.frameData?.ready === true
          && payload.destination?.frameData?.managerReady === true
          && payload.destination?.frameData?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD"
          && payload.relayStats?.receivedFrames === 1
          && payload.relayStats?.forwardedFrames === 1
          && payload.relayStats?.receivedBytes === payload.source?.endpoint?.sentBytes,
        "browser live WebSocket transport smoke did not use the JS endpoint to pump original Transport doSend/doRecv bytes", payload);
    },
  },
  {
    name: "browser-lanapi-announce-two-contexts",
    file: "harness/lanapi_announce_two_contexts_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI announce smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-announce-two-contexts"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.productionTransport === false
          && payload.source?.client === "browser-client-0"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalSerializer === "LANMessage struct byte payload"
          && payload.source?.packet?.messageType === "MSG_GAME_ANNOUNCE"
          && payload.source?.packet?.remoteIp === 0x7f000002
          && payload.source?.packet?.localIp === 0x7f000001
          && payload.source?.packet?.port === 8086
          && payload.source?.packet?.gameName === "Browser LAN Game"
          && payload.destination?.client === "browser-client-1"
          && payload.destination?.wasm === "loaded"
          && payload.destination?.originalTransport === "Transport::m_inBuffer"
          && payload.destination?.originalDispatch === "LANAPI::update"
          && payload.destination?.originalHandler === "LANAPI::handleGameAnnounce"
          && payload.destination?.originalParser === "ParseGameOptionsString"
          && payload.destination?.originalCallback === "LANAPI::OnGameList"
          && payload.destination?.transport?.injected === true
          && payload.destination?.lanApi?.updateDriven === true
          && payload.destination?.lanApi?.handleGameAnnounceRecorded === true
          && payload.destination?.game?.recorded === true
          && payload.destination?.game?.mapOk === true
          && payload.destination?.game?.slotsClosed === true,
        "browser LANAPI announce smoke did not prove isolated LANMessage relay into original LANAPI game discovery", payload);
    },
  },
  {
    name: "browser-lanapi-join-options-two-contexts",
    file: "harness/lanapi_join_options_two_contexts_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI join/options smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-join-options-two-contexts"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.productionTransport === false
          && payload.source?.client === "browser-client-1"
          && payload.source?.wasm === "loaded"
          && payload.source?.originalRequest === "LANAPI::RequestGameJoin"
          && payload.source?.originalTransport === "Transport::queueSend"
          && payload.source?.packet?.messageType === "MSG_REQUEST_JOIN"
          && payload.source?.packet?.remoteIp === 0x7f000002
          && payload.source?.packet?.localIp === 0x7f000003
          && payload.source?.packet?.gameIP === 0x7f000002
          && payload.host?.client === "browser-client-0"
          && payload.host?.wasm === "loaded"
          && payload.host?.originalTransport === "Transport::m_inBuffer"
          && payload.host?.originalDispatch === "LANAPI::update"
          && payload.host?.originalHandler === "LANAPI::handleRequestJoin"
          && payload.host?.originalCallback === "LANAPI::OnPlayerJoin"
          && payload.host?.originalReply === "LANAPI::RequestGameOptions"
          && payload.host?.transport?.injected === true
          && payload.host?.lanApi?.updateDriven === true
          && payload.host?.game?.joinerAdded === true
          && payload.host?.reply?.joinAcceptType === "MSG_JOIN_ACCEPT"
          && payload.host?.reply?.gameOptionsType === "MSG_GAME_OPTIONS"
          && payload.host?.reply?.optionsLength > 0
          && payload.joiner?.client === "browser-client-1"
          && payload.joiner?.wasm === "loaded"
          && payload.joiner?.originalTransport === "Transport::m_inBuffer"
          && payload.joiner?.originalDispatch === "LANAPI::update"
          && payload.joiner?.originalHandlers === "LANAPI::handleJoinAccept+LANAPI::handleGameOptions"
          && payload.joiner?.originalParser === "GameInfoToAsciiString -> ParseAsciiStringToGameInfo"
          && payload.joiner?.originalCallbacks === "LANAPI::OnGameJoin+LANAPI::OnGameOptions"
          && payload.joiner?.transport?.joinAcceptInjected === true
          && payload.joiner?.transport?.gameOptionsInjected === true
          && payload.joiner?.lanApi?.inLobby === false
          && payload.joiner?.lanApi?.onGameJoinCalls === 1
          && payload.joiner?.lanApi?.onGameOptionsCalls >= 1
          && payload.joiner?.game?.joinRecorded === true
          && payload.joiner?.game?.optionsParsed === true
          && payload.joiner?.game?.localSlot === 1,
        "browser LANAPI join/options smoke did not prove isolated join/options relay into original LANAPI", payload);
    },
  },
  {
    name: "browser-lanapi-game-start-two-contexts",
    file: "harness/lanapi_game_start_two_contexts_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI game-start smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-game-start-two-contexts"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.productionTransport === false
          && payload.host?.client === "browser-client-0"
          && payload.host?.wasm === "loaded"
          && payload.host?.originalRequest === "LANAPI::RequestGameStart"
          && payload.host?.originalTransport === "Transport::queueSend"
          && payload.host?.originalCallback === "LANAPI::OnGameStart"
          && payload.host?.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.host?.packet?.messageType === "MSG_GAME_START"
          && payload.host?.packet?.activeBytes > 0
          && payload.host?.packet?.activeBytes <= 476
          && payload.host?.lanApi?.hostGameReady === true
          && payload.host?.lanApi?.onGameStartCalls === 1
          && payload.host?.network?.setupReady === true
          && payload.host?.network?.localSlot === 0
          && payload.host?.network?.numPlayers === 2
          && payload.host?.callback?.sideEffectsReady === true
          && payload.host?.callback?.messageArgument === 1
          && payload.joiner?.client === "browser-client-1"
          && payload.joiner?.wasm === "loaded"
          && payload.joiner?.originalTransport === "Transport::m_inBuffer"
          && payload.joiner?.originalDispatch === "LANAPI::update"
          && payload.joiner?.originalHandler === "LANAPI::handleGameStart"
          && payload.joiner?.originalCallback === "LANAPI::OnGameStart"
          && payload.joiner?.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.joiner?.transport?.injected === true
          && payload.joiner?.transport?.cleared === true
          && payload.joiner?.lanApi?.updateDriven === true
          && payload.joiner?.lanApi?.onGameStartCalls === 1
          && payload.joiner?.network?.setupReady === true
          && payload.joiner?.network?.localSlot === 1
          && payload.joiner?.network?.numPlayers === 2
          && payload.joiner?.callback?.sideEffectsReady === true
          && payload.joiner?.callback?.messageArgument === 1,
        "browser LANAPI game-start smoke did not prove isolated game-start relay into original NetworkInterface", payload);
    },
  },
  {
    name: "browser-lanapi-websocket-flow",
    file: "harness/lanapi_websocket_flow_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI WebSocket flow smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-websocket-flow"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.browserTransport === "browser WebSocket binary LANAPI relay"
          && payload.relay?.serverTransport === "Node WebSocket relay server"
          && payload.relay?.productionTransport === false
          && payload.relay?.hexHandoff === false
          && payload.relay?.binaryFrames === 5
          && payload.announce?.originalSerializer === "LANMessage struct byte payload"
          && payload.announce?.originalDispatch === "LANAPI::update"
          && payload.announce?.originalHandler === "LANAPI::handleGameAnnounce"
          && payload.announce?.originalParser === "ParseGameOptionsString"
          && payload.announce?.originalCallback === "LANAPI::OnGameList"
          && payload.announce?.packet?.messageType === "MSG_GAME_ANNOUNCE"
          && payload.announce?.transport?.injected === true
          && payload.announce?.lanApi?.updateDriven === true
          && payload.announce?.game?.recorded === true
          && payload.announce?.game?.slotsClosed === true
          && payload.join?.originalRequest === "LANAPI::RequestGameJoin"
          && payload.join?.originalHostHandler === "LANAPI::handleRequestJoin"
          && payload.join?.originalReply === "LANAPI::RequestGameOptions"
          && payload.join?.originalJoinerHandlers === "LANAPI::handleJoinAccept+LANAPI::handleGameOptions"
          && payload.join?.originalJoinerCallbacks === "LANAPI::OnGameJoin+LANAPI::OnGameOptions"
          && payload.join?.request?.messageType === "MSG_REQUEST_JOIN"
          && payload.join?.reply?.joinAcceptType === "MSG_JOIN_ACCEPT"
          && payload.join?.reply?.gameOptionsType === "MSG_GAME_OPTIONS"
          && payload.join?.host?.transport?.injected === true
          && payload.join?.host?.lanApi?.onPlayerJoinCalls === 1
          && payload.join?.joiner?.transport?.joinAcceptInjected === true
          && payload.join?.joiner?.transport?.gameOptionsInjected === true
          && payload.join?.joiner?.game?.localSlot === 1
          && payload.gameStart?.originalRequest === "LANAPI::RequestGameStart"
          && payload.gameStart?.originalHostNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.gameStart?.originalJoinerHandler === "LANAPI::handleGameStart"
          && payload.gameStart?.originalJoinerNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.gameStart?.packet?.messageType === "MSG_GAME_START"
          && payload.gameStart?.packet?.activeBytes > 0
          && payload.gameStart?.packet?.activeBytes <= 476
          && payload.gameStart?.host?.lanApi?.onGameStartCalls === 1
          && payload.gameStart?.host?.network?.setupReady === true
          && payload.gameStart?.joiner?.transport?.injected === true
          && payload.gameStart?.joiner?.lanApi?.onGameStartCalls === 1
          && payload.gameStart?.joiner?.network?.setupReady === true
          && payload.gameStart?.joiner?.callback?.sideEffectsReady === true
          && payload.relayStats?.receivedFrames === 5
          && payload.relayStats?.forwardedFrames === 5
          && payload.relayStats?.receivedBytes > 0
          && payload.relayStats?.forwardedBytes === payload.relayStats?.receivedBytes,
        "browser LANAPI WebSocket flow smoke did not carry discovery/join/start through WebSocket binary frames into original LANAPI", payload);
    },
  },
  {
    name: "browser-lanapi-live-game-start",
    file: "harness/lanapi_live_game_start_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI live game-start smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-live-game-start"
          && payload.browserContexts === 2
          && payload.isolatedContexts === true
          && payload.relay?.browserTransport === "browser WebSocket live UDP endpoint"
          && payload.relay?.serverTransport === "Node WebSocket relay server"
          && payload.relay?.productionTransport === true
          && payload.relay?.productionTransportWire === true
          && payload.relay?.hexHandoff === false
          && payload.relay?.binaryFrames === 1
          && payload.host?.client === "lanapi-live-host"
          && payload.host?.wasm === "loaded"
          && payload.host?.originalRequest === "LANAPI::RequestGameStart"
          && payload.host?.originalSerializer === "LANAPI::sendMessage -> Transport::queueSend"
          && payload.host?.originalTransport === "Transport::update"
          && payload.host?.originalWireSend === "Transport::doSend -> Module.cncPortBrowserUdpSend"
          && payload.host?.originalCallback === "LANAPI::OnGameStart"
          && payload.host?.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.host?.packet?.messageType === "MSG_GAME_START"
          && payload.host?.packet?.activeBytes > 0
          && payload.host?.packet?.wireBytes === payload.host?.packet?.activeBytes + 6
          && payload.host?.endpoint?.sent === 1
          && payload.host?.endpoint?.sentBytes === payload.host?.packet?.wireBytes
          && payload.host?.transport?.initialized === true
          && payload.host?.transport?.outBufferCleared === true
          && payload.host?.transport?.adapterWrites === 1
          && payload.host?.transport?.fallbackOutgoing === 0
          && payload.host?.network?.setupReady === true
          && payload.host?.callback?.sideEffectsReady === true
          && payload.joiner?.client === "lanapi-live-joiner"
          && payload.joiner?.wasm === "loaded"
          && payload.joiner?.originalWireReceive === "Module.cncPortBrowserUdpRecv -> Transport::doRecv decryptBuf/isGeneralsPacket"
          && payload.joiner?.originalTransport === "Transport::m_inBuffer"
          && payload.joiner?.originalDispatch === "LANAPI::update"
          && payload.joiner?.originalHandler === "LANAPI::handleGameStart"
          && payload.joiner?.originalCallback === "LANAPI::OnGameStart"
          && payload.joiner?.originalNetwork === "NetworkInterface::createNetwork -> Network::init/initTransport/parseUserList"
          && payload.joiner?.endpointBeforeRecv?.received === 1
          && payload.joiner?.endpoint?.received === 1
          && payload.joiner?.endpoint?.delivered === 1
          && payload.joiner?.endpoint?.queuedIncoming === 0
          && payload.joiner?.endpoint?.receivedBytes === payload.host?.endpoint?.sentBytes
          && payload.joiner?.endpoint?.deliveredBytes === payload.host?.endpoint?.sentBytes
          && payload.joiner?.packet?.messageType === payload.host?.packet?.messageType
          && payload.joiner?.packet?.activeBytes === payload.host?.packet?.activeBytes
          && payload.joiner?.packet?.wireBytes === payload.host?.packet?.wireBytes
          && payload.joiner?.transport?.initialized === true
          && payload.joiner?.transport?.updateDriven === true
          && payload.joiner?.transport?.cleared === true
          && payload.joiner?.transport?.adapterReads === 1
          && payload.joiner?.transport?.fallbackIncoming === 0
          && payload.joiner?.network?.setupReady === true
          && payload.joiner?.network?.localSlot === 1
          && payload.joiner?.callback?.sideEffectsReady === true
          && payload.relayStats?.receivedFrames === 1
          && payload.relayStats?.forwardedFrames === 1
          && payload.relayStats?.receivedBytes === payload.host?.endpoint?.sentBytes,
        "browser LANAPI live game-start smoke did not carry original LANAPI start through the JS UDP endpoint", payload);
    },
  },
  {
    name: "browser-lanapi-network-update",
    file: "harness/lanapi_network_update_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser LANAPI Network::update smoke did not report ok", payload);
      expect(payload.path === "browser-lanapi-network-update"
          && payload.relay?.productionTransport === false
          && payload.originalSetup === "LANAPI::RequestGameStart -> LANAPI::OnGameStart"
          && payload.originalUpdate === "Network::update"
          && payload.originalCommandPath === "Network::GetCommandsFromCommandList -> Network::processCommand"
          && payload.originalFrameReadiness === "Network::AllCommandsReady -> ConnectionManager::allCommandsReady -> FrameDataManager::allCommandsReady"
          && payload.originalTiming === "Network::timeForNewFrame"
          && payload.originalRelay === "Network::RelayCommandsToCommandList"
          && payload.lanApi?.hostGameReady === true
          && payload.lanApi?.onGameStartCalls === 1
          && payload.lanApi?.gameStartMessageDecoded === true
          && payload.before?.network?.setupReady === true
          && payload.before?.network?.localSlot === 0
          && payload.before?.network?.frameDataReady === false
          && payload.before?.callback?.sideEffectsReady === true
          && payload.update?.commandListInjected === true
          && payload.update?.updateDriven === true
          && payload.update?.logicFrameBefore === 0
          && payload.update?.logicFrameForUpdate === 1
          && payload.update?.tickMessageType === 1
          && payload.update?.commandListCountBefore === 1
          && payload.update?.commandListCountAfter === 1
          && payload.update?.localConnectedBefore === false
          && payload.update?.localConnectedAfter === true
          && payload.update?.beforeFrameDataReady === false
          && payload.update?.afterFrameDataReady === true
          && payload.update?.readinessTransition === true
          && payload.update?.inGamePromoted === true
          && payload.after?.network?.setupReady === true
          && payload.after?.network?.frameDataReady === true
          && payload.after?.callback?.sideEffectsReady === true,
        "browser LANAPI Network::update smoke did not prove first-frame readiness through the original network loop", payload);
    },
  },
  {
    name: "browser-network-multiframe-lockstep",
    file: "harness/network_multiframe_lockstep_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser multi-frame lockstep smoke did not report ok", payload);
      expect(payload.path === "browser-network-multiframe-lockstep"
          && payload.relay?.productionTransport === false
          && payload.originalSetup === "LANAPI::RequestGameStart -> LANAPI::OnGameStart"
          && payload.originalUpdate === "Network::update"
          && payload.originalCommandPath === "Network::GetCommandsFromCommandList -> Network::processCommand"
          && payload.originalFrameReadiness === "Network::AllCommandsReady -> ConnectionManager::allCommandsReady -> FrameDataManager::allCommandsReady"
          && payload.originalTiming === "Network::timeForNewFrame"
          && payload.originalRelay === "Network::RelayCommandsToCommandList"
          && payload.originalDesync === "FrameData::allCommandsReady FRAMEDATA_NOTREADY/FRAMEDATA_RESEND"
          && payload.lanApi?.hostGameReady === true
          && payload.lanApi?.onGameStartCalls === 1
          && payload.before?.network?.setupReady === true
          && payload.before?.network?.frameDataReady === false
          && payload.before?.callback?.sideEffectsReady === true
          && Array.isArray(payload.frames)
          && payload.frames.length === 3
          && payload.frames.every((frame, index) =>
            frame.ready === true
            && frame.frame === index + 1
            && frame.commandListResetBefore === true
            && frame.commandListInjected === true
            && frame.updateDriven === true
            && frame.logicFrameBefore === index
            && frame.logicFrameForUpdate === index + 1
            && frame.tickMessageType === 1
            && frame.commandListCountBefore === 1
            && frame.commandListCountAfter === 1
            && frame.localConnectedAfter === true)
          && payload.frames[0]?.beforeFrameDataReady === false
          && payload.frames[0]?.afterFrameDataReady === true
          && payload.frames[0]?.readinessTransition === true
          && payload.frames[0]?.inGamePromoted === true
          && payload.frames[1]?.localConnectedBefore === true
          && payload.frames[2]?.localConnectedBefore === true
          && payload.after?.network?.setupReady === true
          && payload.after?.callback?.sideEffectsReady === true
          && payload.desync?.ok === true
          && payload.desync?.notReady?.result === 0
          && payload.desync?.notReady?.commandCount === 0
          && payload.desync?.notReady?.frameCommandCount === 1
          && payload.desync?.resend?.result === 1
          && payload.desync?.resend?.commandType === "NETCOMMANDTYPE_RUNAHEAD"
          && payload.desync?.resend?.commandCountBefore === 1
          && payload.desync?.resend?.frameCommandCountBefore === 0
          && payload.desync?.resend?.commandCountAfter === 0,
        "browser multi-frame lockstep smoke did not prove multi-frame update progression plus original FrameData desync states", payload);
    },
  },
  {
    name: "range-backed-startup-archives",
    file: "harness/startup_range_backed_archives_smoke.mjs",
    args: ["artifacts/real-assets"],
    validate(payload) {
      expect(payload.ok === true, "range-backed startup archive smoke did not report ok", payload);
      expect(payload.storage === "range-backed-subset-big",
        "range-backed startup archive smoke used the wrong storage mode", payload);
      expect(payload.reader === "browser fetch Range -> synthesized BIG -> Win32BIGFileSystem",
        "range-backed startup archive smoke did not route through the original BIG reader", payload);
      expect(payload.startupAssets?.status === "ready" && payload.startupAssets?.ok === true,
        "range-backed startup archive smoke did not reach startup asset readiness", payload.startupAssets);
      assertDeviceFrontier(payload, "range-backed startup archive smoke");
      assertStartupSingletonFrontier(payload, "range-backed startup archive smoke");
    },
  },
  {
    name: "main-menu-layout-callbacks",
    file: "w3d-window-layout-script-smoke.cjs",
    root: distRoot,
    validate(payload) {
      expect(payload.ok === true, "W3D window layout script smoke did not report ok", payload);
      expect(payload.archiveLayouts?.includes("Menus/MainMenu.wnd"),
        "W3D window layout script smoke did not load MainMenu.wnd from WindowZH.big", payload);
      expect(payload.archiveLayouts?.includes("Menus/CreditsMenu.wnd"),
        "W3D window layout script smoke did not load CreditsMenu.wnd from WindowZH.big", payload);
      expect(payload.archiveLayouts?.includes("Menus/SkirmishGameOptionsMenu.wnd"),
        "W3D window layout script smoke did not load SkirmishGameOptionsMenu.wnd from WindowZH.big", payload);
      expect(payload.assetArchives?.includes("INIZH.big"),
        "W3D window layout script smoke did not mount INIZH.big for the CreditsMenu vertical", payload);
      expect(payload.callbackPaths?.includes("W3DMainMenuInit->original MainMenuInit"),
        "W3D window layout script smoke did not execute original MainMenuInit", payload);
      expect(payload.callbackPaths?.includes("MainMenuUpdate(first idle frame)"),
        "W3D window layout script smoke did not execute MainMenuUpdate", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonSinglePlayer click->MainMenuSystem dropdown transition"),
        "W3D window layout script smoke did not execute real MainMenu button input/navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonSingleBack click->MainMenuSystem dropdown return"),
        "W3D window layout script smoke did not execute real MainMenu dropdown return navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonUSA click->MainMenuSystem faction difficulty transition"),
        "W3D window layout script smoke did not execute real ButtonUSA faction difficulty navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonDiffBack click->MainMenuSystem difficulty return"),
        "W3D window layout script smoke did not execute real ButtonDiffBack difficulty return navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonLoadReplay click->MainMenuSystem dropdown transition"),
        "W3D window layout script smoke did not execute real ButtonLoadReplay dropdown navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonLoadReplayBack click->MainMenuSystem dropdown return"),
        "W3D window layout script smoke did not execute real ButtonLoadReplayBack return navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonSkirmish click->MainMenuSystem pending Shell::push SkirmishGameOptionsMenu"),
        "W3D window layout script smoke did not execute real ButtonSkirmish submenu navigation", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonCredits click->MainMenuSystem pending Shell::push CreditsMenu"),
        "W3D window layout script smoke did not execute real ButtonCredits submenu navigation", payload);
      expect(payload.callbackPaths?.includes("MainMenuUpdate shutdownComplete->SkirmishGameOptionsMenu.wnd"),
        "W3D window layout script smoke did not complete the SkirmishGameOptionsMenu Shell::push", payload);
      expect(payload.callbackPaths?.includes("MainMenuUpdate shutdownComplete->original SkirmishGameOptionsMenuInit"),
        "W3D window layout script smoke did not execute original SkirmishGameOptionsMenuInit through Shell::push", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonBack click->SkirmishGameOptionsMenuSystem pending Shell::pop"),
        "W3D window layout script smoke did not execute real Skirmish ButtonBack navigation", payload);
      expect(payload.callbackPaths?.includes("SkirmishGameOptionsMenuShutdown real callback"),
        "W3D window layout script smoke did not execute original SkirmishGameOptionsMenuShutdown", payload);
      expect(payload.callbackPaths?.includes("SkirmishGameOptionsMenuUpdate shutdownComplete->MainMenu.wnd"),
        "W3D window layout script smoke did not complete the Skirmish ButtonBack Shell::pop", payload);
      expect(payload.callbackPaths?.includes("GadgetPushButton ButtonStart click->SkirmishGameOptionsMenuSystem MSG_NEW_GAME"),
        "W3D window layout script smoke did not execute real Skirmish ButtonStart game-start queueing", payload);
      expect(payload.callbackPaths?.includes("MessageStream::propagateMessages->CommandList MSG_NEW_GAME"),
        "W3D window layout script smoke did not propagate Skirmish MSG_NEW_GAME to the command list", payload);
      expect(payload.covered?.includes("MessageStream MSG_NEW_GAME argument queueing"),
        "W3D window layout script smoke did not report real Skirmish ButtonStart MessageStream coverage", payload);
      expect(payload.covered?.includes("MessageStream::propagateMessages handoff to CommandList"),
        "W3D window layout script smoke did not report real MessageStream-to-CommandList coverage", payload);
      expect(payload.callbackPaths?.includes("MainMenuUpdate shutdownComplete->original CreditsMenuInit"),
        "W3D window layout script smoke did not execute original CreditsMenuInit through Shell::push", payload);
      expect(payload.callbackPaths?.includes("CreditsMenuUpdate real callback"),
        "W3D window layout script smoke did not execute original CreditsMenuUpdate", payload);
    },
  },
  {
    name: "w3d-window-repaint",
    file: "harness/window_repaint_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "W3D window repaint smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-window-repaint",
        "W3D window repaint smoke emitted the wrong path", payload);
      expect(payload.originalPaths?.includes("W3DGameWindowManager::gogoGadgetPushButton"),
        "W3D window repaint smoke did not include the original button creation path", payload.originalPaths);
      expect(payload.originalPaths?.includes("GameWindowManager::winRepaint -> W3DGadgetPushButtonDraw"),
        "W3D window repaint smoke did not include the original repaint callback path", payload.originalPaths);
      expect(payload.originalPaths?.includes("GameWindowManager::winOpenRect/winFillRect -> TheDisplay virtual dispatch"),
        "W3D window repaint smoke did not include the original Display dispatch path", payload.originalPaths);
      expect(payload.originalPaths?.includes("ProbeForwardingW3DDisplay -> W3DDisplay::drawOpenRect/drawFillRect"),
        "W3D window repaint smoke did not include the W3DDisplay draw path", payload.originalPaths);
      expect(payload.window?.manager === "W3DGameWindowManager"
          && payload.window?.button?.drawFunc === "W3DGadgetPushButtonDraw"
          && payload.window?.button?.inputFunc === "GadgetPushButtonInput",
        "W3D window repaint smoke did not bind the expected W3D window/gadget callbacks", payload.window);
      expect(payload.calls?.drawIndexed >= 2,
        "W3D window repaint smoke did not issue both repaint draw calls", payload.calls);
      expect(payload.calls?.displayOpenRect >= 1 && payload.calls?.displayFillRect >= 1,
        "W3D window repaint smoke did not issue both Display repaint calls", payload.calls);
      expect(payload.repaintPixels?.center?.[1] >= 160,
        "W3D window repaint smoke did not produce a green button center pixel", payload.repaintPixels);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-window-repaint-canvas.png"),
        "W3D window repaint smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "mapped-image-display",
    file: "harness/display_mapped_image_smoke.mjs",
    args: ["artifacts/real-assets/INIZH.big", "artifacts/real-assets/EnglishZH.big"],
    validate(payload) {
      expect(payload.ok === true, "mapped-image display smoke did not report ok", payload);
      expect(payload.reader === "browser Range subset BIG loaded by runtime-owned Win32BIGFileSystem",
        "mapped-image display smoke did not use range-backed BIG assets", payload);
      expect(payload.probe?.results?.mappedImages >= 1
          && payload.probe?.image?.name === "WatermarkChina"
          && payload.probe?.image?.filename === "SCShellUserInterface512_001.tga",
        "mapped-image display smoke did not load the expected exact mapped-image block", payload.probe);
      expect(payload.probe?.texture?.width === 512
          && payload.probe?.texture?.height === 512,
        "mapped-image display smoke did not upload the expected 512x512 atlas texture", payload.probe?.texture);
      expect(payload.probe?.results?.drawImageCalled === true,
        "mapped-image display smoke did not exercise W3DDisplay::drawImage", payload.probe);
      expect(payload.browserProbe?.source === "browser_d3d8_draw_indexed",
        "mapped-image display smoke did not reach the browser D3D8/WebGL draw path", payload.browserProbe);
    },
  },
  {
    name: "main-menu-layout-image-repaint",
    file: "harness/main_menu_layout_image_repaint_smoke.mjs",
    args: [
      "artifacts/real-assets/WindowZH.big",
      "artifacts/real-assets/INIZH.big",
      "artifacts/real-assets/EnglishZH.big",
      "artifacts/real-assets/TexturesZH.big",
    ],
    validate(payload) {
      expect(payload.ok === true, "MainMenu layout image repaint smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-main-menu-layout-image-repaint",
        "MainMenu layout image repaint smoke emitted the wrong path", payload);
      expect(payload.originalPaths?.includes("WindowLayout::load -> GameWindowManager::winCreateFromScript"),
        "MainMenu layout image repaint smoke did not use the original WindowLayout load path", payload.originalPaths);
      expect(payload.originalPaths?.includes("parseDrawData IMAGE -> TheMappedImageCollection->findImageByName"),
        "MainMenu layout image repaint smoke did not bind image draw data through parsed mapped images", payload.originalPaths);
      expect(payload.originalPaths?.includes("MainMenu.wnd:Logo -> W3DGameWinDefaultDraw"),
        "MainMenu layout image repaint smoke did not target the real MainMenu Logo child", payload.originalPaths);
      expect(payload.originalPaths?.includes("MainMenu.wnd:MainMenuRuler -> W3DGameWinDefaultDraw"),
        "MainMenu layout image repaint smoke did not target the real MainMenuRuler child", payload.originalPaths);
      expect(payload.originalPaths?.includes("MainMenu.wnd:ButtonSinglePlayer -> W3DGadgetPushButtonImageDraw"),
        "MainMenu layout image repaint smoke did not target the real ButtonSinglePlayer image-state child", payload.originalPaths);
      expect(payload.originalPaths?.includes("GameText::fetch(GUI:SinglePlayer) -> W3DDisplayString::draw button label"),
        "MainMenu layout image repaint smoke did not render the real ButtonSinglePlayer text label", payload.originalPaths);
      expect(payload.originalPaths?.includes("MainMenu.wnd:ButtonMultiplayer -> W3DGadgetPushButtonImageDraw")
          && payload.originalPaths?.includes("MainMenu.wnd:ButtonLoadReplay -> W3DGadgetPushButtonImageDraw")
          && payload.originalPaths?.includes("MainMenu.wnd:ButtonOptions -> W3DGadgetPushButtonImageDraw")
          && payload.originalPaths?.includes("MainMenu.wnd:ButtonCredits -> W3DGadgetPushButtonImageDraw")
          && payload.originalPaths?.includes("MainMenu.wnd:ButtonExit -> W3DGadgetPushButtonImageDraw")
          && payload.originalPaths?.includes("GameText::fetch(main visible button labels) -> W3DDisplayString::draw button labels"),
        "MainMenu layout image repaint smoke did not render the other real visible main buttons", payload.originalPaths);
      expect(payload.originalPaths?.includes("MainMenu.wnd:StaticTextSelectDifficulty -> W3DGadgetStaticTextDraw")
          && payload.originalPaths?.includes("GameText::fetch(GUI:SelectDifficulty) -> W3DDisplayString::draw static text"),
        "MainMenu layout image repaint smoke did not render the real hidden static text child", payload.originalPaths);
      expect(payload.loadReplayOriginalPaths?.includes("MainMenu.wnd:MapBorder3 -> PassSelectedButtonsToParentSystem")
          && payload.loadReplayOriginalPaths?.includes("MainMenu.wnd:ButtonLoadGame -> W3DGadgetPushButtonImageDraw")
          && payload.loadReplayOriginalPaths?.includes("MainMenu.wnd:ButtonReplay -> W3DGadgetPushButtonImageDraw")
          && payload.loadReplayOriginalPaths?.includes("MainMenu.wnd:ButtonLoadReplayBack -> W3DGadgetPushButtonImageDraw")
          && payload.loadReplayOriginalPaths?.includes("GameText::fetch(load-replay dropdown button labels) -> W3DDisplayString::draw button labels"),
        "MainMenu layout image repaint smoke did not render the real Load Replay dropdown controls", payload.loadReplayOriginalPaths);
      expect(payload.singlePlayerOriginalPaths?.includes("MainMenu.wnd:MapBorder -> PassSelectedButtonsToParentSystem")
          && payload.singlePlayerOriginalPaths?.includes("MainMenu.wnd:EarthMap -> PassSelectedButtonsToParentSystem")
          && payload.singlePlayerOriginalPaths?.includes("MainMenu.wnd:ButtonUSA -> W3DGadgetPushButtonImageDraw")
          && payload.singlePlayerOriginalPaths?.includes("MainMenu.wnd:ButtonGLA -> W3DGadgetPushButtonImageDraw")
          && payload.singlePlayerOriginalPaths?.includes("MainMenu.wnd:ButtonChina -> W3DGadgetPushButtonImageDraw")
          && payload.singlePlayerOriginalPaths?.includes("MainMenu.wnd:ButtonChallenge -> W3DGadgetPushButtonImageDraw")
          && payload.singlePlayerOriginalPaths?.includes("MainMenu.wnd:ButtonSkirmish -> W3DGadgetPushButtonImageDraw")
          && payload.singlePlayerOriginalPaths?.includes("MainMenu.wnd:ButtonSingleBack -> W3DGadgetPushButtonImageDraw")
          && payload.singlePlayerOriginalPaths?.includes("GameText::fetch(single-player dropdown button labels) -> W3DDisplayString::draw button labels"),
        "MainMenu layout image repaint smoke did not render the real Single Player dropdown controls", payload.singlePlayerOriginalPaths);
      expect(payload.difficultyOriginalPaths?.includes("MainMenu.wnd:MapBorder4 -> PassSelectedButtonsToParentSystem")
          && payload.difficultyOriginalPaths?.includes("MainMenu.wnd:EarthMap4 -> PassSelectedButtonsToParentSystem")
          && payload.difficultyOriginalPaths?.includes("MainMenu.wnd:ButtonEasy -> W3DGadgetPushButtonImageDraw")
          && payload.difficultyOriginalPaths?.includes("MainMenu.wnd:ButtonMedium -> W3DGadgetPushButtonImageDraw")
          && payload.difficultyOriginalPaths?.includes("MainMenu.wnd:ButtonHard -> W3DGadgetPushButtonImageDraw")
          && payload.difficultyOriginalPaths?.includes("MainMenu.wnd:ButtonDiffBack -> W3DGadgetPushButtonImageDraw")
          && payload.difficultyOriginalPaths?.includes("GameText::fetch(difficulty dropdown button labels) -> W3DDisplayString::draw button labels"),
        "MainMenu layout image repaint smoke did not render the real Difficulty dropdown controls", payload.difficultyOriginalPaths);
      expect(payload.layout?.target?.name === "MainMenu.wnd:Logo"
          && payload.layout?.target?.image === "GeneralsLogo"
          && payload.image?.filename === "SCSmShellUserInterface512_001.tga",
        "MainMenu layout image repaint smoke did not report the expected real WND image binding", payload);
      expect(payload.layout?.ruler?.name === "MainMenu.wnd:MainMenuRuler"
          && payload.layout?.ruler?.image === "MainMenuRuler"
          && payload.rulerImage?.filename === "MainMenuRuleruserinterface.tga"
          && payload.rulerTexture?.archiveEntry === "Art\\Textures\\mainmenuruleruserinterface.tga",
        "MainMenu layout image repaint smoke did not report the expected real ruler WND image binding", payload);
      expect(payload.layout?.button?.name === "MainMenu.wnd:ButtonSinglePlayer"
          && payload.layout?.button?.drawFunc === "W3DGadgetPushButtonImageDraw"
          && payload.layout?.button?.images?.[0] === "Buttons-Left"
          && payload.layout?.button?.images?.[1] === "Buttons-Middle"
          && payload.layout?.button?.images?.[2] === "Buttons-Right"
          && payload.layout?.button?.text?.label === "GUI:SinglePlayer"
          && payload.layout?.button?.text?.length > 0
          && payload.layout?.button?.text?.width > 0
          && payload.layout?.button?.text?.height > 0
          && payload.buttonImages?.left?.filename === "SCSmShellUserInterface512_001.tga"
          && payload.buttonImages?.middle?.filename === "SCSmShellUserInterface512_001.tga"
          && payload.buttonImages?.right?.filename === "SCSmShellUserInterface512_001.tga",
        "MainMenu layout image repaint smoke did not report the expected real ButtonSinglePlayer image/text binding", payload);
      expect(payload.gameText?.csfPath === "data\\english\\generals.csf"
          && payload.gameText?.created === true
          && payload.gameText?.initialized === true
          && payload.gameText?.buttonLabelExists === true
          && payload.gameText?.buttonTextNonEmpty === true
          && payload.gameText?.extraButtonLabelsExist === true
          && payload.gameText?.extraButtonTextNonEmpty === true
          && payload.gameText?.staticTextLabelExists === true
          && payload.gameText?.staticTextNonEmpty === true,
        "MainMenu layout image repaint smoke did not resolve button/static text through real GameText", payload);
      expect(payload.difficultyGameText?.difficultyButtonLabelsExist === true
          && payload.difficultyGameText?.difficultyButtonTextNonEmpty === true
          && payload.difficultyGameText?.staticTextLabelExists === true
          && payload.difficultyGameText?.staticTextNonEmpty === true,
        "MainMenu layout image repaint smoke did not resolve Difficulty labels through real GameText", payload);
      const expectedExtraButtons = [
        ["MainMenu.wnd:ButtonMultiplayer", "GUI:Multiplayer", 156, 36],
        ["MainMenu.wnd:ButtonLoadReplay", "GUI:ReplayMenu", 196, 35],
        ["MainMenu.wnd:ButtonOptions", "GUI:Options", 236, 36],
        ["MainMenu.wnd:ButtonCredits", "GUI:Credits", 276, 36],
        ["MainMenu.wnd:ButtonExit", "GUI:Exit", 316, 36],
      ];
      expect(Array.isArray(payload.extraButtons)
          && payload.extraButtons.length === expectedExtraButtons.length
          && expectedExtraButtons.every(([name, label, y, height], index) => {
            const button = payload.extraButtons[index];
            const proof = payload.extraButtonRegions?.[index];
            return button?.name === name
              && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
              && button?.x === 540
              && button?.y === y
              && button?.width === 208
              && button?.height === height
              && button?.hidden === false
              && button?.imagesBound === true
              && button?.text?.label === label
              && button?.text?.length > 0
              && button?.text?.width > 0
              && button?.text?.height > 0
              && proof?.region?.coloredPixelCount >= 20
              && proof?.textRegion?.coloredPixelCount >= 20
              && proof?.textRegion?.maxComponent >= 180;
          }),
        "MainMenu layout image repaint smoke did not report/pixel-prove the other visible main buttons", payload);
      const expectedLoadReplayButtons = [
        ["MainMenu.wnd:ButtonLoadGame", "GUI:MainMenuLoadGame", 116, 35],
        ["MainMenu.wnd:ButtonReplay", "GUI:MainMenuLoadReplay", 156, 35],
        ["MainMenu.wnd:ButtonLoadReplayBack", "GUI:Back", 196, 36],
      ];
      expect(payload.loadReplayDropdown?.name === "MainMenu.wnd:MapBorder3"
          && payload.loadReplayDropdown?.x === 532
          && payload.loadReplayDropdown?.y === 108
          && payload.loadReplayDropdown?.width === 224
          && payload.loadReplayDropdown?.height === 132
          && payload.loadReplayDropdown?.systemFunc === "PassSelectedButtonsToParentSystem"
          && payload.loadReplayDropdown?.hidden === false
          && Array.isArray(payload.loadReplayButtons)
          && payload.loadReplayButtons.length === expectedLoadReplayButtons.length
          && expectedLoadReplayButtons.every(([name, label, y, height], index) => {
            const button = payload.loadReplayButtons[index];
            const proof = payload.loadReplayButtonRegions?.[index];
            return button?.name === name
              && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
              && button?.x === 540
              && button?.y === y
              && button?.width === 208
              && button?.height === height
              && button?.hidden === false
              && button?.imagesBound === true
              && button?.text?.label === label
              && button?.text?.length > 0
              && button?.text?.width > 0
              && button?.text?.height > 0
              && proof?.region?.coloredPixelCount >= 20
              && proof?.textRegion?.coloredPixelCount >= 20
              && proof?.textRegion?.maxComponent >= 180;
          }),
        "MainMenu layout image repaint smoke did not report/pixel-prove the real Load Replay dropdown buttons", payload);
      const expectedSinglePlayerButtons = [
        ["MainMenu.wnd:ButtonUSA", "GUI:USA", 116, 36],
        ["MainMenu.wnd:ButtonGLA", "GUI:GLA", 156, 36],
        ["MainMenu.wnd:ButtonChina", "GUI:CHINA_Caps", 196, 35],
        ["MainMenu.wnd:ButtonChallenge", "GUI:Generals_Challenge", 236, 36],
        ["MainMenu.wnd:ButtonSkirmish", "GUI:Skirmish", 276, 36],
        ["MainMenu.wnd:ButtonSingleBack", "GUI:Back", 316, 35],
      ];
      expect(payload.singlePlayerDropdown?.name === "MainMenu.wnd:MapBorder"
          && payload.singlePlayerDropdown?.x === 532
          && payload.singlePlayerDropdown?.y === 108
          && payload.singlePlayerDropdown?.width === 224
          && payload.singlePlayerDropdown?.height === 252
          && payload.singlePlayerDropdown?.systemFunc === "PassSelectedButtonsToParentSystem"
          && payload.singlePlayerDropdown?.hidden === false
          && payload.singlePlayerEarthMap?.name === "MainMenu.wnd:EarthMap"
          && payload.singlePlayerEarthMap?.x === 532
          && payload.singlePlayerEarthMap?.y === 108
          && payload.singlePlayerEarthMap?.width === 224
          && payload.singlePlayerEarthMap?.height === 244
          && payload.singlePlayerEarthMap?.systemFunc === "PassSelectedButtonsToParentSystem"
          && payload.singlePlayerEarthMap?.drawFunc === "W3DGameWinDefaultDraw"
          && payload.singlePlayerEarthMap?.hidden === false
          && Array.isArray(payload.singlePlayerButtons)
          && payload.singlePlayerButtons.length === expectedSinglePlayerButtons.length
          && expectedSinglePlayerButtons.every(([name, label, y, height], index) => {
            const button = payload.singlePlayerButtons[index];
            const proof = payload.singlePlayerButtonRegions?.[index];
            return button?.name === name
              && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
              && button?.x === 540
              && button?.y === y
              && button?.width === 208
              && button?.height === height
              && button?.hidden === false
              && button?.imagesBound === true
              && button?.text?.label === label
              && button?.text?.length > 0
              && button?.text?.width > 0
              && button?.text?.height > 0
              && proof?.region?.coloredPixelCount >= 20
              && proof?.textRegion?.coloredPixelCount >= 20
              && proof?.textRegion?.maxComponent >= 180;
          }),
        "MainMenu layout image repaint smoke did not report/pixel-prove the real Single Player dropdown buttons", payload);
      const expectedDifficultyButtons = [
        ["MainMenu.wnd:ButtonEasy", "GUI:EasyCaps", 156, 35],
        ["MainMenu.wnd:ButtonMedium", "GUI:MediumDifficultyCaps", 196, 35],
        ["MainMenu.wnd:ButtonHard", "GUI:HardCaps", 236, 36],
        ["MainMenu.wnd:ButtonDiffBack", "GUI:Back", 276, 36],
      ];
      expect(payload.difficultyDropdown?.name === "MainMenu.wnd:MapBorder4"
          && payload.difficultyDropdown?.x === 532
          && payload.difficultyDropdown?.y === 108
          && payload.difficultyDropdown?.width === 224
          && payload.difficultyDropdown?.height === 212
          && payload.difficultyDropdown?.systemFunc === "PassSelectedButtonsToParentSystem"
          && payload.difficultyDropdown?.hidden === false
          && payload.difficultyEarthMap?.name === "MainMenu.wnd:EarthMap4"
          && payload.difficultyEarthMap?.x === 532
          && payload.difficultyEarthMap?.y === 108
          && payload.difficultyEarthMap?.width === 224
          && payload.difficultyEarthMap?.height === 212
          && payload.difficultyEarthMap?.systemFunc === "PassSelectedButtonsToParentSystem"
          && payload.difficultyEarthMap?.drawFunc === "W3DGameWinDefaultDraw"
          && payload.difficultyEarthMap?.hidden === false
          && Array.isArray(payload.difficultyButtons)
          && payload.difficultyButtons.length === expectedDifficultyButtons.length
          && expectedDifficultyButtons.every(([name, label, y, height], index) => {
            const button = payload.difficultyButtons[index];
            const proof = payload.difficultyButtonRegions?.[index];
            return button?.name === name
              && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
              && button?.x === 540
              && button?.y === y
              && button?.width === 208
              && button?.height === height
              && button?.hidden === false
              && button?.imagesBound === true
              && button?.text?.label === label
              && button?.text?.length > 0
              && button?.text?.width > 0
              && button?.text?.height > 0
              && proof?.region?.coloredPixelCount >= 20
              && proof?.textRegion?.coloredPixelCount >= 20
              && proof?.textRegion?.maxComponent >= 180;
          }),
        "MainMenu layout image repaint smoke did not report/pixel-prove the real Difficulty dropdown buttons", payload);
      expect(payload.staticText?.name === "MainMenu.wnd:StaticTextSelectDifficulty"
          && payload.staticText?.drawFunc === "W3DGadgetStaticTextDraw"
          && payload.staticText?.initialHidden === true
          && payload.staticText?.hidden === false
          && payload.staticText?.visibilityFocused === true
          && payload.staticText?.text?.label === "GUI:SelectDifficulty"
          && payload.staticText?.text?.length > 0
          && payload.staticText?.text?.width > 0
          && payload.staticText?.text?.height > 0,
        "MainMenu layout image repaint smoke did not report the real hidden static text binding", payload);
      expect(payload.difficultyStaticText?.name === "MainMenu.wnd:StaticTextSelectDifficulty"
          && payload.difficultyStaticText?.hidden === false
          && payload.difficultyStaticText?.visibilityFocused === true
          && payload.difficultyStaticText?.text?.label === "GUI:SelectDifficulty"
          && payload.difficultyStaticText?.text?.length > 0
          && payload.difficultyStaticTextRegion?.coloredPixelCount >= 20
          && payload.difficultyStaticTextRegion?.maxComponent >= 180,
        "MainMenu layout image repaint smoke did not capture the Difficulty dropdown title text pixels", payload);
      expect(payload.calls?.displayImageDraws >= 6
          && payload.calls?.drawIndexed >= 6
          && payload.draw?.screenRect?.left === 504
          && payload.draw?.screenRect?.bottom === 110,
        "MainMenu layout image repaint smoke did not reach the W3DDisplay/WebGL draw path", payload);
      expect(payload.coloredLogoPixelCount >= 1
          && payload.coloredRulerPixelCount >= 4
          && payload.buttonRegion?.coloredPixelCount >= 20,
        "MainMenu layout image repaint smoke did not capture logo, ruler, and button pixels", payload);
      expect(payload.buttonTextRegion?.coloredPixelCount >= 20
          && payload.buttonTextRegion?.maxComponent >= 180,
        "MainMenu layout image repaint smoke did not capture the real button text pixels", payload);
      expect(payload.staticTextRegion?.coloredPixelCount >= 20
          && payload.staticTextRegion?.maxComponent >= 180,
        "MainMenu layout image repaint smoke did not capture the real static text pixels", payload);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-main-menu-layout-image-repaint-canvas.png"),
        "MainMenu layout image repaint smoke did not capture the expected screenshot", payload);
      expect(payload.staticTextScreenshot?.endsWith("harness-smoke-ww3d-main-menu-layout-static-text-repaint-canvas.png"),
        "MainMenu layout image repaint smoke did not capture the expected static text screenshot", payload);
      expect(payload.singlePlayerScreenshot?.endsWith("harness-smoke-ww3d-main-menu-layout-single-player-repaint-canvas.png"),
        "MainMenu layout image repaint smoke did not capture the expected Single Player dropdown screenshot", payload);
      expect(payload.loadReplayScreenshot?.endsWith("harness-smoke-ww3d-main-menu-layout-load-replay-repaint-canvas.png"),
        "MainMenu layout image repaint smoke did not capture the expected Load Replay dropdown screenshot", payload);
      expect(payload.difficultyScreenshot?.endsWith("harness-smoke-ww3d-main-menu-layout-difficulty-repaint-canvas.png"),
        "MainMenu layout image repaint smoke did not capture the expected Difficulty dropdown screenshot", payload);
    },
  },
  {
    name: "display-main-menu-ruler",
    file: "harness/display_main_menu_ruler_smoke.mjs",
    args: [
      "artifacts/real-assets/INIZH.big",
      "artifacts/real-assets/TexturesZH.big",
    ],
    validate(payload) {
      expect(payload.ok === true, "MainMenuRuler display smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-display-main-menu-ruler",
        "MainMenuRuler display smoke emitted the wrong path", payload);
      expect(payload.originalPaths?.includes("HandCreatedMappedImages.INI -> ImageCollection::findImageByName(MainMenuRuler)"),
        "MainMenuRuler display smoke did not use the HandCreated mapped-image route", payload.originalPaths);
      expect(payload.originalPaths?.includes("W3DDisplay::drawImage -> TextureClass::Init(MainMenuRuleruserinterface.tga)"),
        "MainMenuRuler display smoke did not use the W3DDisplay image draw path", payload.originalPaths);
      expect(payload.probe?.image?.name === "MainMenuRuler"
          && payload.probe?.image?.filename === "MainMenuRuleruserinterface.tga"
          && payload.probe?.image?.textureWidth === 1024
          && payload.probe?.texture?.archiveEntry === "Art\\Textures\\mainmenuruleruserinterface.tga",
        "MainMenuRuler display smoke did not report the expected real mapped image binding", payload);
      expect(payload.probe?.calls?.drawIndexed >= 1
          && payload.probe?.draw?.screenRect?.left === 0
          && payload.probe?.draw?.screenRect?.right === 800
          && payload.probe?.draw?.screenRect?.bottom === 600
          && payload.browserProbe?.source === "browser_d3d8_draw_indexed",
        "MainMenuRuler display smoke did not reach the full-screen W3DDisplay/WebGL draw path", payload);
      expect(payload.coloredRulerPixelCount >= 4,
        "MainMenuRuler display smoke did not produce enough colored browser pixels", payload.rulerPixels);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-display-main-menu-ruler-canvas.png"),
        "MainMenuRuler display smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "shell-composite-render",
    file: "harness/display_shell_composite_smoke.mjs",
    args: ["artifacts/real-assets/INIZH.big", "artifacts/real-assets/EnglishZH.big"],
    validate(payload) {
      expect(payload.ok === true, "shell composite render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-display-shell-composite",
        "shell composite render smoke emitted the wrong path", payload);
      expect(payload.reader === "browser Range subset BIG loaded by runtime-owned Win32BIGFileSystem",
        "shell composite render smoke did not use range-backed BIG assets", payload);
      expect(payload.originalPaths?.includes("W3DDisplay::m_3DScene -> WW3D::Render"),
        "shell composite render smoke did not include the W3DDisplay scene path", payload.originalPaths);
      expect(payload.originalPaths?.includes(
        "ImageCollection::load(512) -> INI::loadDirectory -> W3DDisplay::drawImage"),
        "shell composite render smoke did not include the mapped-image draw path", payload.originalPaths);
      expect(payload.originalPaths?.includes("GameText::fetch -> W3DDisplayString::draw"),
        "shell composite render smoke did not include the GameText draw path", payload.originalPaths);
      expect(payload.checks?.sceneOk === true
          && payload.checks?.mappedOk === true
          && payload.checks?.textOk === true,
        "shell composite render smoke did not pass all composed rendering checks", payload.checks);
      expect(payload.mappedImage?.image?.name === "WatermarkChina"
          && payload.gameText?.label === "GUI:Command&ConquerGenerals",
        "shell composite render smoke did not draw the expected shell UI art/text", payload);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-display-shell-composite-canvas.png"),
        "shell composite render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-tile-archive-render",
    file: "harness/terrain_tile_archive_smoke.mjs",
    args: ["artifacts/real-assets/TerrainZH.big"],
    validate(payload) {
      expect(payload.ok === true, "terrain tile archive render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-tile-archive",
        "terrain tile archive render smoke emitted the wrong path", payload);
      expect(payload.archive?.entry === "Art\\Terrain\\PTBlossom01.tga"
          && payload.archive?.countedTiles >= 1
          && payload.archive?.tileChecksum > 0,
        "terrain tile archive render smoke did not consume the expected real TerrainZH tile", payload.archive);
      expect(payload.terrain?.tileSource === "archive-tga"
          && payload.terrain?.verticesPerSide === 17
          && payload.terrain?.cellsPerSide === 16,
        "terrain tile archive render smoke did not report the expected original terrain tile geometry", payload.terrain);
      expect(payload.calls?.browserTextureCreate >= 1
          && payload.calls?.browserTextureUpdate >= 1
          && payload.calls?.drawIndexed >= 1,
        "terrain tile archive render smoke did not reach texture upload and indexed draw", payload.calls);
      expect(payload.draw?.vertexShaderFvf === 578
          && payload.draw?.vertexStride === 32,
        "terrain tile archive render smoke did not use the expected W3D terrain FVF draw", payload.draw);
      expect((payload.centerPixel ?? []).some((component, index) => index < 3 && component > 8),
        "terrain tile archive render smoke did not produce colored browser pixels", payload.centerPixel);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-tile-archive-canvas.png"),
        "terrain tile archive render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-tile-archive-scene-render",
    file: "harness/terrain_tile_archive_scene_smoke.mjs",
    args: ["artifacts/real-assets/TerrainZH.big"],
    validate(payload) {
      expect(payload.ok === true, "terrain tile archive scene render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-tile-archive-scene",
        "terrain tile archive scene render smoke emitted the wrong path", payload);
      expect(payload.archive?.entry === "Art\\Terrain\\PTBlossom01.tga"
          && payload.archive?.countedTiles >= 1
          && payload.archive?.tileChecksum > 0,
        "terrain tile archive scene render smoke did not consume the expected real TerrainZH tile", payload.archive);
      expect(payload.scene?.renderPath?.includes("RTS3DScene::Customized_Render")
          && payload.scene?.created === true
          && payload.scene?.objectAdded === true
          && payload.scene?.terrainClassId === 4,
        "terrain tile archive scene render smoke did not use the RTS3DScene terrain-object path", payload.scene);
      expect(payload.terrain?.tileSource === "archive-tga"
          && payload.terrain?.verticesPerSide === 17
          && payload.terrain?.cellsPerSide === 16,
        "terrain tile archive scene render smoke did not report the expected original terrain tile geometry", payload.terrain);
      expect(payload.calls?.browserTextureCreate >= 1
          && payload.calls?.browserTextureUpdate >= 1
          && payload.calls?.drawIndexed >= 1,
        "terrain tile archive scene render smoke did not reach texture upload and indexed draw", payload.calls);
      expect(payload.draw?.vertexShaderFvf === 578
          && payload.draw?.vertexStride === 32,
        "terrain tile archive scene render smoke did not use the expected W3D terrain FVF draw", payload.draw);
      expect((payload.centerPixel ?? []).some((component, index) => index < 3 && component > 8),
        "terrain tile archive scene render smoke did not produce colored browser pixels", payload.centerPixel);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-tile-archive-scene-canvas.png"),
        "terrain tile archive scene render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-map-patch-scene-render",
    file: "harness/terrain_map_patch_scene_smoke.mjs",
    args: [
      "artifacts/real-assets/INIZH.big",
      "artifacts/real-assets/MapsZH.big",
      "artifacts/real-assets/TerrainZH.big",
      "artifacts/real-assets/Terrain.big",
    ],
    validate(payload) {
      expect(payload.ok === true, "terrain map patch scene render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-map-patch-scene",
        "terrain map patch scene render smoke emitted the wrong path", payload);
      expect(payload.archives?.ini?.entry === "Data\\INI\\Terrain.ini"
          && payload.archives?.ini?.parser === "GameEngine/Common/INI.cpp::load + INITerrain.cpp"
          && payload.archives?.ini?.originalIniParser === true
          && payload.archives?.ini?.terrainTypeCount > 0
          && iniLayoutMatches(payload.archives?.ini?.layout),
        "terrain map patch scene render smoke did not read real Terrain.ini texture mappings", payload.archives?.ini);
      expect(payload.archives?.maps?.entry === "Maps\\MD_GLA03\\MD_GLA03.map"
          && payload.map?.parsed === true
          && payload.map?.bytes > 0
          && payload.map?.width > 16
          && payload.map?.height > 16
          && payload.map?.heightChecksum > 0,
        "terrain map patch scene render smoke did not parse the shipped MD_GLA03 map", payload.map);
      expect(payload.scene?.renderPath?.includes("RTS3DScene::Customized_Render")
          && payload.scene?.created === true
          && payload.scene?.objectAdded === true
          && payload.scene?.terrainClassId === 4,
        "terrain map patch scene render smoke did not use the RTS3DScene terrain-object path", payload.scene);
      expect(payload.terrain?.tileSource === "shipped-map-heightmap"
          && payload.terrain?.renderObject === "HeightMapRenderObjClass"
          && payload.terrain?.verticesPerSide === 33
          && payload.terrain?.cellsPerSide === 32
          && payload.terrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.terrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.terrain?.tileDiagnostics?.patchCellsWithSource > 0
          && payload.terrain?.patchHeightChecksum > 0,
        "terrain map patch scene render smoke did not report real map patch geometry", payload.terrain);
      expect(payload.calls?.browserTextureCreate >= 1
          && payload.calls?.browserTextureUpdate >= 1
          && payload.calls?.drawIndexed >= 1,
        "terrain map patch scene render smoke did not reach texture upload and indexed draw", payload.calls);
      expect(payload.draw?.vertexShaderFvf === 578
          && payload.draw?.vertexStride === 32,
        "terrain map patch scene render smoke did not use the expected W3D terrain FVF draw", payload.draw);
      expect(payload.coverage?.coloredPixelCount > 0,
        "terrain map patch scene render smoke did not produce colored browser pixels", payload.coverage);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-map-patch-scene-canvas.png"),
        "terrain map patch scene render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-visual-scene-render",
    file: "harness/terrain_visual_scene_smoke.mjs",
    args: [
      "artifacts/real-assets/INIZH.big",
      "artifacts/real-assets/MapsZH.big",
      "artifacts/real-assets/TerrainZH.big",
      "artifacts/real-assets/Terrain.big",
    ],
    validate(payload) {
      expect(payload.ok === true, "terrain visual scene render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-visual-scene",
        "terrain visual scene render smoke emitted the wrong path", payload);
      expect(payload.archives?.ini?.entry === "Data\\INI\\Terrain.ini"
          && payload.archives?.ini?.parser === "GameEngine/Common/INI.cpp::load + INITerrain.cpp"
          && payload.archives?.ini?.originalIniParser === true
          && payload.archives?.ini?.terrainTypeCount > 0
          && iniLayoutMatches(payload.archives?.ini?.layout),
        "terrain visual scene render smoke did not read real Terrain.ini texture mappings", payload.archives?.ini);
      expect(payload.archives?.maps?.entry === "Maps\\MD_GLA03\\MD_GLA03.map"
          && payload.map?.parsed === true
          && payload.map?.bytes > 0
          && payload.map?.width > 16
          && payload.map?.height > 16
          && payload.map?.heightChecksum > 0,
        "terrain visual scene render smoke did not parse the shipped MD_GLA03 map", payload.map);
      expect(payload.visual?.class === "W3DTerrainVisual"
          && payload.visual?.loadPath?.includes("W3DTerrainVisual::load")
          && payload.visual?.ownedTerrainRenderObject === true
          && payload.visual?.waterRenderObjectNull === true,
        "terrain visual scene render smoke did not prove original W3DTerrainVisual ownership", payload.visual);
      expect(payload.scene?.renderPath?.includes("W3DDisplay::m_3DScene")
          && payload.scene?.created === true
          && payload.scene?.objectAddedByVisualLoad === true
          && payload.scene?.path === "W3DDisplay::m_3DScene"
          && payload.scene?.terrainClassId === 4,
        "terrain visual scene render smoke did not attach the visual-owned terrain object to W3DDisplay::m_3DScene", payload.scene);
      expect(payload.terrain?.tileSource === "shipped-map-heightmap"
          && payload.terrain?.renderObject === "HeightMapRenderObjClass"
          && payload.terrain?.verticesPerSide === 33
          && payload.terrain?.cellsPerSide === 32
          && payload.terrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.terrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.terrain?.tileDiagnostics?.patchCellsWithSource > 0
          && payload.terrain?.patchHeightChecksum > 0,
        "terrain visual scene render smoke did not report real visual-owned map patch geometry", payload.terrain);
      expect(payload.calls?.browserTextureCreate >= 1
          && payload.calls?.browserTextureUpdate >= 1
          && payload.calls?.drawIndexed >= 1,
        "terrain visual scene render smoke did not reach texture upload and indexed draw", payload.calls);
      expect(payload.draw?.vertexShaderFvf === 578
          && payload.draw?.vertexStride === 32,
        "terrain visual scene render smoke did not use the expected W3D terrain FVF draw", payload.draw);
      expect(payload.coverage?.coloredPixelCount > 0,
        "terrain visual scene render smoke did not produce colored browser pixels", payload.coverage);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-visual-scene-canvas.png"),
        "terrain visual scene render smoke did not capture the expected screenshot", payload);
      expect(payload.visualShroudVisual?.class === "W3DTerrainVisual"
          && payload.visualShroudVisual?.loadPath?.includes("W3DTerrainVisual::load")
          && payload.visualShroudVisual?.ownedTerrainRenderObject === true
          && payload.visualShroudVisual?.waterRenderObjectNull === true
          && payload.visualShroudVisual?.shroudRenderObject === true,
        "terrain visual shroud smoke did not keep shroud under W3DTerrainVisual ownership", payload.visualShroudVisual);
      expect(payload.visualShroudScene?.renderPath?.includes("W3DDisplay::m_3DScene")
          && payload.visualShroudScene?.renderPath?.includes("W3DShroudMaterialPassClass")
          && payload.visualShroudScene?.created === true
          && payload.visualShroudScene?.objectAddedByVisualLoad === true
          && payload.visualShroudScene?.path === "W3DDisplay::m_3DScene"
          && payload.visualShroudScene?.terrainClassId === 4,
        "terrain visual shroud smoke did not render through the visual-owned shroud scene path", payload.visualShroudScene);
      expect(payload.visualShroudTerrain?.tileSource === "shipped-map-heightmap"
          && payload.visualShroudTerrain?.renderObject === "ProbeHeightMapRenderObjWithShroud"
          && payload.visualShroudTerrain?.verticesPerSide === 33
          && payload.visualShroudTerrain?.cellsPerSide === 32
          && payload.visualShroudTerrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.visualShroudTerrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.visualShroudTerrain?.tileDiagnostics?.patchCellsWithSource > 0
          && payload.visualShroudTerrain?.patchHeightChecksum > 0,
        "terrain visual shroud smoke did not report source-backed visual terrain geometry", payload.visualShroudTerrain);
      expect(payload.visualShroudShroud?.requested === true
          && payload.visualShroudShroud?.installed === true
          && payload.visualShroudShroud?.initialized === true
          && payload.visualShroudShroud?.fillInvoked === true
          && payload.visualShroudShroud?.renderInvoked === true
          && payload.visualShroudShroud?.textureReady === true
          && payload.visualShroudShroud?.terrainRenderInvoked === true
          && payload.visualShroudShroud?.terrainRenderSawShroud === true
          && payload.visualShroudShroud?.terrainOriginalDrawSeen === true
          && payload.visualShroudShroud?.terrainFinalDrawSeen === true
          && payload.visualShroudShroud?.terrainFallbackInvoked === false
          && payload.visualShroudShroud?.terrainAdditionalPassCount > 0
          && payload.visualShroudShroud?.cellsX > 0
          && payload.visualShroudShroud?.cellsY > 0
          && payload.visualShroudShroud?.textureWidth > 0
          && payload.visualShroudShroud?.textureHeight > 0,
        "terrain visual shroud smoke did not drive original W3DShroud through the terrain render object", payload.visualShroudShroud);
      expect(payload.visualShroudDrawSequence?.shroudAfterTerrain === true,
        "terrain visual shroud smoke did not draw the shroud pass after base/blend terrain", payload.visualShroudDrawSequence);
      expect(payload.visualShroudCalls?.browserTextureCreate >= 1
          && payload.visualShroudCalls?.browserTextureUpdate >= 1
          && payload.visualShroudCalls?.drawIndexed >= 3,
        "terrain visual shroud smoke did not reach texture upload and shroud indexed draw", payload.visualShroudCalls);
      expect(payload.visualShroudDraw?.vertexShaderFvf === 578
          && payload.visualShroudDraw?.vertexStride === 32,
        "terrain visual shroud smoke did not use the expected W3D terrain FVF draw", payload.visualShroudDraw);
      expect(payload.visualShroudCoverage?.coloredPixelCount > 0,
        "terrain visual shroud smoke did not produce colored browser pixels", payload.visualShroudCoverage);
      expect(payload.visualShroudScreenshot?.endsWith("harness-smoke-ww3d-terrain-visual-shroud-scene-canvas.png"),
        "terrain visual shroud smoke did not capture the expected screenshot", payload);
      expect(payload.visualShroudUpdateVisual?.class === "W3DTerrainVisual"
          && payload.visualShroudUpdateVisual?.ownedTerrainRenderObject === true
          && payload.visualShroudUpdateVisual?.waterRenderObjectNull === true
          && payload.visualShroudUpdateVisual?.shroudRenderObject === true,
        "terrain visual shroud update smoke did not keep shroud update under W3DTerrainVisual ownership", payload.visualShroudUpdateVisual);
      expect(payload.visualShroudUpdateScene?.renderPath?.includes("W3DDisplay::m_3DScene")
          && payload.visualShroudUpdateScene?.renderPath?.includes("W3DShroudMaterialPassClass")
          && payload.visualShroudUpdateScene?.created === true
          && payload.visualShroudUpdateScene?.objectAddedByVisualLoad === true,
        "terrain visual shroud update smoke did not render through the visual-owned shroud scene path", payload.visualShroudUpdateScene);
      expect(payload.visualShroudUpdateTerrain?.tileSource === "shipped-map-heightmap"
          && payload.visualShroudUpdateTerrain?.renderObject === "ProbeHeightMapRenderObjWithShroud"
          && payload.visualShroudUpdateTerrain?.verticesPerSide === 33
          && payload.visualShroudUpdateTerrain?.cellsPerSide === 32
          && payload.visualShroudUpdateTerrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.visualShroudUpdateTerrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.visualShroudUpdateTerrain?.tileDiagnostics?.patchCellsWithSource > 0,
        "terrain visual shroud update smoke did not report source-backed visual terrain geometry", payload.visualShroudUpdateTerrain);
      expect(payload.visualShroudUpdate?.requested === true
          && payload.visualShroudUpdate?.setInvoked === true
          && payload.visualShroudUpdate?.displayInvoked === true
          && payload.visualShroudUpdate?.notifyInvoked === true
          && payload.visualShroudUpdate?.renderInvoked === true
          && payload.visualShroudUpdate?.sampleChanged === true
          && payload.visualShroudUpdate?.status === 0
          && payload.visualShroudUpdate?.expectedLevel === payload.visualShroudUpdate?.sampleAfter
          && payload.visualShroudUpdate?.sampleAfter > payload.visualShroudUpdate?.sampleBefore
          && payload.visualShroudUpdate?.cellsChanged > 0
          && payload.visualShroudUpdate?.beginRender === 0
          && payload.visualShroudUpdate?.render === 0
          && payload.visualShroudUpdate?.endRender === 0,
        "terrain visual shroud update smoke did not mutate and render original W3DShroud data", payload.visualShroudUpdate);
      expect(payload.visualShroudPartitionRefresh?.requested === true
          && payload.visualShroudPartitionRefresh?.terrainLogicInstalled === true
          && payload.visualShroudPartitionRefresh?.partitionCreated === true
          && payload.visualShroudPartitionRefresh?.partitionInstalled === true
          && payload.visualShroudPartitionRefresh?.partitionCellsReady === true
          && payload.visualShroudPartitionRefresh?.displayInstalled === true
          && payload.visualShroudPartitionRefresh?.radarInstalled === true
          && payload.visualShroudPartitionRefresh?.playerListInstalled === true
          && payload.visualShroudPartitionRefresh?.revealInvoked === true
          && payload.visualShroudPartitionRefresh?.refreshInvoked === true
          && payload.visualShroudPartitionRefresh?.sampleChanged === true
          && payload.visualShroudPartitionRefresh?.displaySampleTouched === true
          && payload.visualShroudPartitionRefresh?.radarSampleTouched === true
          && payload.visualShroudPartitionRefresh?.status === 1
          && payload.visualShroudPartitionRefresh?.expectedLevel === payload.visualShroudPartitionRefresh?.sampleAfter
          && payload.visualShroudPartitionRefresh?.sampleAfter > payload.visualShroudPartitionRefresh?.sampleBefore
          && payload.visualShroudPartitionRefresh?.displaySetCalls >= payload.visualShroudPartitionRefresh?.totalCells
          && payload.visualShroudPartitionRefresh?.radarSetCalls >= payload.visualShroudPartitionRefresh?.totalCells
          && payload.visualShroudPartitionRefresh?.displayFoggedSetCalls > 0
          && payload.visualShroudPartitionRefresh?.radarFoggedSetCalls > 0
          && payload.visualShroudPartitionRefresh?.beginRender === 0
          && payload.visualShroudPartitionRefresh?.render === 0
          && payload.visualShroudPartitionRefresh?.endRender === 0,
        "terrain visual shroud update smoke did not refresh through original PartitionManager state", payload.visualShroudPartitionRefresh);
      expect(payload.visualShroudUpdateFrames?.count === 3
          && payload.visualShroudUpdateFrames?.firstDrawIndexed >= 3
          && payload.visualShroudUpdateFrames?.shroudUpdateDrawIndexed >= 6
          && payload.visualShroudUpdateFrames?.partitionRefreshDrawIndexed >= 9
          && payload.visualShroudUpdateFrames?.shroudUpdateTextureUpdate > payload.visualShroudUpdateFrames?.firstTextureUpdate
          && payload.visualShroudUpdateFrames?.partitionRefreshTextureUpdate > payload.visualShroudUpdateFrames?.shroudUpdateTextureUpdate,
        "terrain visual shroud update smoke did not prove direct and partition texture-uploaded shroud frames", payload.visualShroudUpdateFrames);
      expect(payload.visualShroudUpdateDrawSequence?.shroudAfterTerrain === true
          && payload.visualShroudUpdateDrawSequence?.secondShroudAfterSecondTerrain === true
          && payload.visualShroudUpdateDrawSequence?.thirdShroudAfterThirdTerrain === true
          && payload.visualShroudUpdateDrawSequence?.shroudTerrainIndices?.length >= 3,
        "terrain visual shroud update smoke did not draw three ordered shroud passes", payload.visualShroudUpdateDrawSequence);
      expect(payload.visualShroudUpdateCalls?.drawIndexed >= 9,
        "terrain visual shroud update smoke did not reach three terrain/shroud frame draw batches", payload.visualShroudUpdateCalls);
      expect(payload.visualShroudUpdateCoverage?.coloredPixelCount > 0,
        "terrain visual shroud update smoke did not produce colored browser pixels", payload.visualShroudUpdateCoverage);
      expect(payload.visualShroudUpdateScreenshot?.endsWith("harness-smoke-ww3d-terrain-visual-shroud-update-scene-canvas.png"),
        "terrain visual shroud update smoke did not capture the expected screenshot", payload);
      expect(payload.archives?.textures?.optionalBasePresent === true
          && payload.archives?.textures?.entryCount >= 10,
        "terrain full-scene smoke did not mount base water texture archives", payload.archives?.textures);
      expect(payload.fullSceneVisual?.class === "W3DTerrainVisual"
          && payload.fullSceneVisual?.fullInit === true
          && payload.fullSceneVisual?.ownedTerrainRenderObject === true
          && payload.fullSceneVisual?.waterRenderObjectNull === false,
        "terrain full-scene smoke did not complete original W3DTerrainVisual full init", payload.fullSceneVisual);
      expect(payload.fullSceneWater?.iniEntry === "Data\\INI\\Water.ini"
          && payload.fullSceneWater?.iniEntryExists === true
          && payload.fullSceneWater?.iniLoaded === true
          && payload.fullSceneWater?.iniException === false
          && payload.fullSceneWater?.waterSettingCount === 4
          && payload.fullSceneWater?.assetsReady === true
          && payload.fullSceneWater?.requiredTextureCount >= 10
          && payload.fullSceneWater?.availableTextureCount >= payload.fullSceneWater?.requiredTextureCount
          && payload.fullSceneWater?.missingTextureCount === 0
          && payload.fullSceneWater?.renderObjectCreated === true
          && payload.fullSceneWater?.globalPointerMatches === true
          && payload.fullSceneWater?.sceneObjectAdded === true,
        "terrain full-scene smoke did not initialize original water rendering from shipped assets", payload.fullSceneWater);
      expect(payload.fullSceneScene?.renderPath?.includes("W3DDisplay::m_3DScene")
          && payload.fullSceneScene?.created === true
          && payload.fullSceneScene?.objectAddedByVisualLoad === true
          && payload.fullSceneScene?.path === "W3DDisplay::m_3DScene"
          && payload.fullSceneScene?.terrainClassId === 4,
        "terrain full-scene smoke did not render through the visual-owned W3DDisplay scene", payload.fullSceneScene);
      expect(payload.fullSceneTerrain?.tileSource === "shipped-map-heightmap"
          && payload.fullSceneTerrain?.renderObject === "HeightMapRenderObjClass"
          && payload.fullSceneTerrain?.verticesPerSide === 33
          && payload.fullSceneTerrain?.cellsPerSide === 32
          && payload.fullSceneTerrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.fullSceneTerrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.fullSceneTerrain?.tileDiagnostics?.patchCellsWithSource > 0
          && payload.fullSceneTerrain?.patchHeightChecksum > 0,
        "terrain full-scene smoke did not report source-backed visual terrain geometry", payload.fullSceneTerrain);
      expect(payload.fullSceneCalls?.browserTextureCreate >= 1
          && payload.fullSceneCalls?.browserTextureUpdate >= 1
          && payload.fullSceneCalls?.drawIndexed >= 2,
        "terrain full-scene smoke did not reach texture upload and indexed terrain draws", payload.fullSceneCalls);
      expect(payload.fullSceneDraw?.vertexShaderFvf === 578
          && payload.fullSceneDraw?.vertexStride === 32,
        "terrain full-scene smoke did not use the expected W3D terrain FVF draw", payload.fullSceneDraw);
      expect(payload.fullSceneCoverage?.coloredPixelCount > 0,
        "terrain full-scene smoke did not produce colored browser pixels", payload.fullSceneCoverage);
      expect(payload.fullSceneScreenshot?.endsWith("harness-smoke-ww3d-terrain-full-scene-canvas.png"),
        "terrain full-scene smoke did not capture the expected screenshot", payload);
      expect(payload.fullSceneShroudUpdateVisual?.class === "W3DTerrainVisual"
          && payload.fullSceneShroudUpdateVisual?.fullInit === true
          && payload.fullSceneShroudUpdateVisual?.ownedTerrainRenderObject === true
          && payload.fullSceneShroudUpdateVisual?.waterRenderObjectNull === false
          && payload.fullSceneShroudUpdateVisual?.shroudRenderObject === true,
        "terrain full-scene shroud update smoke did not keep shroud under full W3DTerrainVisual::init ownership", payload.fullSceneShroudUpdateVisual);
      expect(payload.fullSceneShroudUpdateWater?.assetsReady === true
          && payload.fullSceneShroudUpdateWater?.missingTextureCount === 0
          && payload.fullSceneShroudUpdateWater?.renderObjectCreated === true
          && payload.fullSceneShroudUpdateWater?.globalPointerMatches === true
          && payload.fullSceneShroudUpdateWater?.sceneObjectAdded === true,
        "terrain full-scene shroud update smoke did not preserve water ownership", payload.fullSceneShroudUpdateWater);
      expect(payload.fullSceneShroudUpdateScene?.renderPath?.includes("W3DDisplay::m_3DScene")
          && payload.fullSceneShroudUpdateScene?.renderPath?.includes("W3DShroudMaterialPassClass")
          && payload.fullSceneShroudUpdateScene?.created === true
          && payload.fullSceneShroudUpdateScene?.objectAddedByVisualLoad === true,
        "terrain full-scene shroud update smoke did not render through the full-init shroud scene path", payload.fullSceneShroudUpdateScene);
      expect(payload.fullSceneShroudUpdateTerrain?.tileSource === "shipped-map-heightmap"
          && payload.fullSceneShroudUpdateTerrain?.renderObject === "HeightMapRenderObjClass"
          && payload.fullSceneShroudUpdateTerrain?.verticesPerSide === 33
          && payload.fullSceneShroudUpdateTerrain?.cellsPerSide === 32
          && payload.fullSceneShroudUpdateTerrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.fullSceneShroudUpdateTerrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.fullSceneShroudUpdateTerrain?.tileDiagnostics?.patchCellsWithSource > 0,
        "terrain full-scene shroud update smoke did not report source-backed full-init terrain geometry", payload.fullSceneShroudUpdateTerrain);
      expect(payload.fullSceneShroudUpdateShroud?.requested === true
          && payload.fullSceneShroudUpdateShroud?.installed === true
          && payload.fullSceneShroudUpdateShroud?.initialized === true
          && payload.fullSceneShroudUpdateShroud?.fillInvoked === true
          && payload.fullSceneShroudUpdateShroud?.renderInvoked === true
          && payload.fullSceneShroudUpdateShroud?.textureReady === true
          && payload.fullSceneShroudUpdateShroud?.cellsX > 0
          && payload.fullSceneShroudUpdateShroud?.cellsY > 0
          && payload.fullSceneShroudUpdateShroud?.textureWidth > 0
          && payload.fullSceneShroudUpdateShroud?.textureHeight > 0,
        "terrain full-scene shroud update smoke did not initialize the original heightmap shroud", payload.fullSceneShroudUpdateShroud);
      expect(payload.fullSceneShroudUpdate?.requested === true
          && payload.fullSceneShroudUpdate?.setInvoked === true
          && payload.fullSceneShroudUpdate?.displayInvoked === true
          && payload.fullSceneShroudUpdate?.notifyInvoked === true
          && payload.fullSceneShroudUpdate?.renderInvoked === true
          && payload.fullSceneShroudUpdate?.sampleChanged === true
          && payload.fullSceneShroudUpdate?.expectedLevel === payload.fullSceneShroudUpdate?.sampleAfter
          && payload.fullSceneShroudUpdate?.sampleAfter > payload.fullSceneShroudUpdate?.sampleBefore
          && payload.fullSceneShroudUpdate?.cellsChanged > 0,
        "terrain full-scene shroud update smoke did not mutate the full-init shroud data", payload.fullSceneShroudUpdate);
      expect(payload.fullSceneShroudPartitionRefresh?.requested === true
          && payload.fullSceneShroudPartitionRefresh?.terrainLogicInstalled === true
          && payload.fullSceneShroudPartitionRefresh?.partitionCreated === true
          && payload.fullSceneShroudPartitionRefresh?.partitionInstalled === true
          && payload.fullSceneShroudPartitionRefresh?.partitionCellsReady === true
          && payload.fullSceneShroudPartitionRefresh?.displayInstalled === true
          && payload.fullSceneShroudPartitionRefresh?.radarInstalled === true
          && payload.fullSceneShroudPartitionRefresh?.playerListInstalled === true
          && payload.fullSceneShroudPartitionRefresh?.refreshInvoked === true
          && payload.fullSceneShroudPartitionRefresh?.sampleChanged === true
          && payload.fullSceneShroudPartitionRefresh?.displaySampleTouched === true
          && payload.fullSceneShroudPartitionRefresh?.radarSampleTouched === true
          && payload.fullSceneShroudPartitionRefresh?.expectedLevel === payload.fullSceneShroudPartitionRefresh?.sampleAfter
          && payload.fullSceneShroudPartitionRefresh?.sampleAfter > payload.fullSceneShroudPartitionRefresh?.sampleBefore,
        "terrain full-scene shroud update smoke did not refresh through original PartitionManager state", payload.fullSceneShroudPartitionRefresh);
      expect(payload.fullSceneShroudUpdateFrames?.count === 3
          && payload.fullSceneShroudUpdateFrames?.firstDrawIndexed >= 3
          && payload.fullSceneShroudUpdateFrames?.shroudUpdateDrawIndexed >= 6
          && payload.fullSceneShroudUpdateFrames?.partitionRefreshDrawIndexed >= 9
          && payload.fullSceneShroudUpdateFrames?.shroudUpdateTextureUpdate > payload.fullSceneShroudUpdateFrames?.firstTextureUpdate
          && payload.fullSceneShroudUpdateFrames?.partitionRefreshTextureUpdate > payload.fullSceneShroudUpdateFrames?.shroudUpdateTextureUpdate,
        "terrain full-scene shroud update smoke did not prove three texture-uploaded shroud frames", payload.fullSceneShroudUpdateFrames);
      expect(payload.fullSceneShroudUpdateDrawSequence?.shroudAfterTerrain === true
          && payload.fullSceneShroudUpdateDrawSequence?.secondShroudAfterSecondTerrain === true
          && payload.fullSceneShroudUpdateDrawSequence?.thirdShroudAfterThirdTerrain === true
          && payload.fullSceneShroudUpdateDrawSequence?.shroudTerrainIndices?.length >= 3,
        "terrain full-scene shroud update smoke did not draw ordered full-init shroud passes", payload.fullSceneShroudUpdateDrawSequence);
      expect(payload.fullSceneShroudUpdateCalls?.drawIndexed >= 9,
        "terrain full-scene shroud update smoke did not reach three terrain/shroud frame draw batches", payload.fullSceneShroudUpdateCalls);
      expect(payload.fullSceneShroudUpdateCoverage?.coloredPixelCount > 0,
        "terrain full-scene shroud update smoke did not produce colored browser pixels", payload.fullSceneShroudUpdateCoverage);
      expect(payload.fullSceneShroudUpdateScreenshot?.endsWith("harness-smoke-ww3d-terrain-full-scene-shroud-update-canvas.png"),
        "terrain full-scene shroud update smoke did not capture the expected screenshot", payload);
      expect(payload.cameraPanTerrain?.tileSource === "shipped-map-heightmap"
          && payload.cameraPanTerrain?.renderObject === "HeightMapRenderObjClass"
          && payload.cameraPanTerrain?.verticesPerSide === 33
          && payload.cameraPanTerrain?.cellsPerSide === 32
          && payload.cameraPanTerrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.cameraPanTerrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.cameraPanTerrain?.tileDiagnostics?.patchCellsWithSource > 0
          && payload.cameraPanTerrain?.patchHeightChecksum > 0,
        "terrain visual camera-pan smoke did not keep source-backed visual terrain geometry", payload.cameraPanTerrain);
      expect(payload.cameraPanScene?.renderPath?.includes("W3DDisplay::m_3DScene")
          && payload.cameraPanScene?.created === true
          && payload.cameraPanScene?.objectAddedByVisualLoad === true
          && payload.cameraPanScene?.path === "W3DDisplay::m_3DScene"
          && payload.cameraPanScene?.terrainClassId === 4,
        "terrain visual camera-pan smoke did not render through the visual-owned W3DDisplay scene", payload.cameraPanScene);
      expect(payload.cameraPanFrames?.count === 2
          && payload.cameraPanFrames?.firstDrawIndexed >= 2
          && payload.cameraPanFrames?.secondDrawIndexed >= 4
          && payload.cameraPanFrames?.firstClear >= 1
          && payload.cameraPanFrames?.secondClear >= 2,
        "terrain visual camera-pan smoke did not prove two rendered camera frames", payload.cameraPanFrames);
      expect(payload.cameraPanCamera?.pan?.targetX > payload.cameraPanCamera?.primary?.targetX
          && payload.cameraPanCamera?.pan?.targetY < payload.cameraPanCamera?.primary?.targetY
          && payload.cameraPanCamera?.pan?.eyeX > payload.cameraPanCamera?.primary?.eyeX,
        "terrain visual camera-pan smoke did not report a moved gameplay-style camera target", payload.cameraPanCamera);
      expect(payload.cameraPanCalls?.browserTextureCreate >= 1
          && payload.cameraPanCalls?.browserTextureUpdate >= 1
          && payload.cameraPanCalls?.drawIndexed >= 4
          && payload.cameraPanCalls?.clear >= 2,
        "terrain visual camera-pan smoke did not reach two texture-backed indexed terrain renders", payload.cameraPanCalls);
      expect(payload.cameraPanDraw?.vertexShaderFvf === 578
          && payload.cameraPanDraw?.vertexStride === 32,
        "terrain visual camera-pan smoke did not use the expected W3D terrain FVF draw", payload.cameraPanDraw);
      expect(payload.cameraPanCoverage?.coloredPixelCount > 0,
        "terrain visual camera-pan smoke did not produce colored browser pixels", payload.cameraPanCoverage);
      expect(payload.cameraPanScreenshot?.endsWith("harness-smoke-ww3d-terrain-visual-camera-pan-scene-canvas.png"),
        "terrain visual camera-pan smoke did not capture the expected screenshot", payload);
      expect(payload.loadWindowVisual?.class === "W3DTerrainVisual"
          && payload.loadWindowVisual?.loadPath?.includes("W3DTerrainVisual::load")
          && payload.loadWindowVisual?.ownedTerrainRenderObject === true
          && payload.loadWindowVisual?.waterRenderObjectNull === true
          && payload.loadWindowVisual?.loadDrawWidth === 129
          && payload.loadWindowVisual?.loadDrawHeight === 129
          && payload.loadWindowVisual?.loadDrawOriginX === 0
          && payload.loadWindowVisual?.loadDrawOriginY === 0,
        "terrain visual load-window smoke did not keep the original W3DTerrainVisual::load draw window", payload.loadWindowVisual);
      expect(payload.loadWindowScene?.renderPath?.includes("W3DDisplay::m_3DScene")
          && payload.loadWindowScene?.created === true
          && payload.loadWindowScene?.objectAddedByVisualLoad === true
          && payload.loadWindowScene?.path === "W3DDisplay::m_3DScene"
          && payload.loadWindowScene?.terrainClassId === 4,
        "terrain visual load-window smoke did not render through the visual-owned W3DDisplay scene", payload.loadWindowScene);
      expect(payload.loadWindowTerrain?.tileSource === "shipped-map-heightmap"
          && payload.loadWindowTerrain?.renderObject === "HeightMapRenderObjClass"
          && payload.loadWindowTerrain?.verticesPerSide === 129
          && payload.loadWindowTerrain?.cellsPerSide === 128
          && payload.loadWindowTerrain?.renderWindowWidth === payload.loadWindowVisual?.loadDrawWidth
          && payload.loadWindowTerrain?.renderWindowHeight === payload.loadWindowVisual?.loadDrawHeight
          && payload.loadWindowTerrain?.renderOriginX === payload.loadWindowVisual?.loadDrawOriginX
          && payload.loadWindowTerrain?.renderOriginY === payload.loadWindowVisual?.loadDrawOriginY
          && payload.loadWindowTerrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.loadWindowTerrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.loadWindowTerrain?.tileDiagnostics?.patchCells === 16384
          && payload.loadWindowTerrain?.tileDiagnostics?.patchCellsWithSource === 16384
          && payload.loadWindowTerrain?.tileDiagnostics?.patchCellsMissingSource === 0
          && payload.loadWindowTerrain?.patchHeightChecksum > 0,
        "terrain visual load-window smoke did not report the expected no-reinit 129x129 terrain window", payload.loadWindowTerrain);
      expect(payload.loadWindowCalls?.browserTextureCreate >= 1
          && payload.loadWindowCalls?.browserTextureUpdate >= 1
          && payload.loadWindowCalls?.drawIndexed >= 1,
        "terrain visual load-window smoke did not reach texture upload and indexed draws", payload.loadWindowCalls);
      expect(payload.loadWindowDraw?.vertexShaderFvf === 578
          && payload.loadWindowDraw?.vertexStride === 32,
        "terrain visual load-window smoke did not use the expected W3D terrain FVF draw", payload.loadWindowDraw);
      expect(payload.loadWindowCoverage?.coloredPixelCount > 0,
        "terrain visual load-window smoke did not produce colored browser pixels", payload.loadWindowCoverage);
      expect(iniLayoutMatches(payload.loadWindowIniLayout),
        "terrain visual load-window smoke did not preserve the terrain INI layout contract", payload.loadWindowIniLayout);
      expect(payload.loadWindowScreenshot?.endsWith("harness-smoke-ww3d-terrain-visual-load-window-scene-canvas.png"),
        "terrain visual load-window smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-bib-buffer-lifecycle",
    file: "harness/terrain_bib_buffer_lifecycle_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "terrain bib-buffer lifecycle smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-bib-buffer-lifecycle",
        "terrain bib-buffer lifecycle smoke emitted the wrong path", payload);
      expect(payload.probe?.source === "ww3d_terrain_bib_buffer_lifecycle_probe"
          && payload.probe?.path?.includes("W3DBibBuffer constructor")
          && payload.probe?.results?.bufferCreated === true
          && payload.probe?.results?.initialized === true
          && payload.probe?.results?.vertexBufferAllocated === true
          && payload.probe?.results?.indexBufferAllocated === true
          && payload.probe?.results?.normalTextureCreated === true
          && payload.probe?.results?.highlightTextureCreated === true,
        "terrain bib-buffer lifecycle smoke did not construct original W3DBibBuffer resources", payload.probe);
      expect(payload.probe?.results?.addBibInvoked === true
          && payload.probe?.results?.removeHighlightingInvoked === true
          && payload.probe?.results?.removeBibInvoked === true
          && payload.probe?.results?.clearBibsInvoked === true
          && payload.probe?.bibs?.afterAdd === 1
          && payload.probe?.bibs?.afterRemove === 1
          && payload.probe?.bibs?.afterClear === 0,
        "terrain bib-buffer lifecycle smoke did not drive the original bib mutation path", payload.probe?.bibs);
      expect(payload.probe?.results?.freeBuffersInvoked === true
          && payload.probe?.results?.vertexBufferReleased === true
          && payload.probe?.results?.indexBufferReleased === true
          && payload.bufferDelta?.creates >= 2
          && payload.bufferDelta?.releases >= 2
          && payload.textureDelta?.creates >= 1
          && payload.textureDelta?.updates >= 1
          && payload.textureDelta?.releases >= 1,
        "terrain bib-buffer lifecycle smoke did not release browser-backed D3D8 resources", {
          bufferDelta: payload.bufferDelta,
          textureDelta: payload.textureDelta,
        });
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-bib-buffer-lifecycle-canvas.png"),
        "terrain bib-buffer lifecycle smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-prop-buffer-render",
    file: "harness/terrain_prop_buffer_render_smoke.mjs",
    args: ["artifacts/real-assets/W3DZH.big", "artifacts/real-assets/TexturesZH.big"],
    validate(payload) {
      expect(payload.ok === true, "terrain prop-buffer render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-prop-buffer-render",
        "terrain prop-buffer render smoke emitted the wrong path", payload);
      expect(payload.probe?.source === "ww3d_terrain_prop_buffer_render_probe"
          && payload.probe?.path?.includes("W3DPropBuffer addProp")
          && payload.probe?.asset?.model === "CINE_MOON"
          && payload.probe?.results?.runtimeAssetSystemInstalled === true
          && payload.probe?.results?.textureFileFactoryInstalled === true
          && payload.probe?.results?.meshFileExists === true
          && payload.probe?.results?.textureFileExists === true,
        "terrain prop-buffer render smoke did not use shipped W3D/texture assets", payload.probe);
      expect(payload.probe?.results?.initialized === true
          && payload.probe?.results?.propTypeCreated === true
          && payload.probe?.results?.propRenderObjectCreated === true
          && payload.probe?.results?.propRenderObjectClassId === 0
          && payload.probe?.results?.propMeshNormalized === true
          && payload.probe?.props?.afterAdd === 1
          && payload.probe?.props?.typesAfterAdd === 1,
        "terrain prop-buffer render smoke did not create an original W3DPropBuffer prop", payload.probe?.props);
      expect(payload.probe?.results?.propVisibleForCamera === true
          && payload.probe?.calls?.drawIndexed >= 1
          && payload.browserProbe?.ok === true
          && payload.browserProbe?.texture0?.sampled === true
          && payload.browserProbe?.usedPersistentBuffers === true
          && payload.coverage?.coloredPixelCount > 0,
        "terrain prop-buffer render smoke did not draw browser-visible prop pixels", {
          calls: payload.probe?.calls,
          browserProbe: payload.browserProbe,
          coverage: payload.coverage,
        });
      expect(payload.probe?.results?.removePropInvoked === true
          && payload.probe?.results?.propRemoved === true
          && payload.probe?.results?.clearPropsInvoked === true
          && payload.probe?.props?.afterClear === 0,
        "terrain prop-buffer render smoke did not clean up original prop state", payload.probe?.results);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-prop-buffer-render-canvas.png"),
        "terrain prop-buffer render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-prop-buffer-scene-render",
    file: "harness/terrain_prop_buffer_scene_smoke.mjs",
    args: [
      "artifacts/real-assets/INIZH.big",
      "artifacts/real-assets/MapsZH.big",
      "artifacts/real-assets/TerrainZH.big",
      "artifacts/real-assets/W3DZH.big",
      "artifacts/real-assets/TexturesZH.big",
    ],
    validate(payload) {
      expect(payload.ok === true, "terrain prop-buffer scene render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-prop-buffer-scene",
        "terrain prop-buffer scene render smoke emitted the wrong path", payload);
      expect(payload.archives?.ini?.entry === "Data\\INI\\Terrain.ini"
          && payload.archives?.ini?.parser === "GameEngine/Common/INI.cpp::load + INITerrain.cpp"
          && payload.archives?.ini?.originalIniParser === true
          && payload.archives?.ini?.terrainTypeCount > 0
          && iniLayoutMatches(payload.archives?.ini?.layout),
        "terrain prop-buffer scene render smoke did not read real Terrain.ini texture mappings", payload.archives?.ini);
      expect(payload.archives?.maps?.entry === "Maps\\MD_GLA03\\MD_GLA03.map"
          && payload.map?.parsed === true
          && payload.map?.bytes > 0
          && payload.map?.width > 16
          && payload.map?.height > 16,
        "terrain prop-buffer scene render smoke did not parse the shipped MD_GLA03 map", payload.map);
      expect(payload.terrain?.tileSource === "shipped-map-heightmap"
          && payload.terrain?.renderObject === "ProbeHeightMapRenderObjWithPropBuffer"
          && payload.terrain?.verticesPerSide === 33
          && payload.terrain?.cellsPerSide === 32
          && payload.terrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.terrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.terrain?.tileDiagnostics?.patchCellsWithSource > 0,
        "terrain prop-buffer scene render smoke did not keep source-backed terrain geometry", payload.terrain);
      expect(payload.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
          && payload.scene?.renderPath?.includes("W3DPropBuffer::drawProps")
          && payload.scene?.renderPath?.includes("RTS3DScene::Flush")
          && payload.scene?.created === true
          && payload.scene?.objectAdded === true
          && payload.scene?.terrainClassId === 4,
        "terrain prop-buffer scene render smoke did not use the scene drawProps/flush path", payload.scene);
      expect(payload.props?.afterAdd === 1
          && payload.props?.typesAfterAdd === 1
          && payload.props?.afterClear === 0,
        "terrain prop-buffer scene render smoke did not drive original prop state", payload.props);
      expect(payload.calls?.browserTextureCreate >= 2
          && payload.calls?.browserTextureUpdate >= 2
          && payload.calls?.drawIndexed >= 3,
        "terrain prop-buffer scene render smoke did not reach terrain plus prop indexed draws", payload.calls);
      expect(payload.draw?.vertexShaderFvf === 594
          && payload.draw?.vertexStride === 44,
        "terrain prop-buffer scene render smoke did not finish on the expected prop mesh FVF draw", payload.draw);
      expect(payload.browserProbe?.vertexShaderFvf === 594
          && payload.browserProbe?.vertexStride === 44
          && payload.browserProbe?.texture0?.sampled === true
          && payload.drawSequence?.propAfterTerrain === true,
        "terrain prop-buffer scene render smoke did not flush a browser-visible prop mesh after terrain", {
          browserProbe: payload.browserProbe,
          drawSequence: payload.drawSequence,
        });
      expect(payload.coverage?.coloredPixelCount > 0,
        "terrain prop-buffer scene render smoke did not produce colored browser pixels", payload.coverage);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-prop-buffer-scene-canvas.png"),
        "terrain prop-buffer scene render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-tree-buffer-scene-render",
    file: "harness/terrain_tree_buffer_scene_smoke.mjs",
    args: [
      "artifacts/real-assets/INIZH.big",
      "artifacts/real-assets/MapsZH.big",
      "artifacts/real-assets/TerrainZH.big",
      "artifacts/real-assets/Terrain.big",
      "artifacts/real-assets/W3DZH.big",
      "artifacts/real-assets/W3D.big",
      "artifacts/real-assets/TexturesZH.big",
      "artifacts/real-assets/Textures.big",
    ],
    validate(payload) {
      expect(payload.ok === true, "terrain tree-buffer scene render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-tree-buffer-scene",
        "terrain tree-buffer scene render smoke emitted the wrong path", payload);
      expect(payload.archives?.ini?.entry === "Data\\INI\\Terrain.ini"
          && payload.archives?.ini?.parser === "GameEngine/Common/INI.cpp::load + INITerrain.cpp"
          && payload.archives?.ini?.originalIniParser === true
          && payload.archives?.ini?.terrainTypeCount > 0
          && iniLayoutMatches(payload.archives?.ini?.layout),
        "terrain tree-buffer scene render smoke did not read real Terrain.ini texture mappings", payload.archives?.ini);
      expect(payload.archives?.maps?.entry === "Maps\\MD_GLA03\\MD_GLA03.map"
          && payload.map?.parsed === true
          && payload.map?.bytes > 0
          && payload.map?.width > 16
          && payload.map?.height > 16,
        "terrain tree-buffer scene render smoke did not parse the shipped MD_GLA03 map", payload.map);
      expect(payload.archives?.w3d?.meshEntry === "Art\\W3D\\PTDogwod01_S.W3D"
          && payload.archives?.terrain?.treeTextureEntry === "Art\\Terrain\\PTDogwod01_S.tga"
          && payload.archives?.textures?.materialTextureEntry === "Art\\Textures\\ptdogwod01_s.dds"
          && payload.probe?.asset?.model === "PTDogwod01_S"
          && payload.probe?.asset?.texture === "PTDogwod01_S.tga",
        "terrain tree-buffer scene render smoke did not use the expected shipped tree assets", payload.archives);
      expect(payload.probe?.results?.runtimeAssetSystemInstalled === true
          && payload.probe?.results?.textureFileFactoryInstalled === true
          && payload.probe?.results?.modelsFileExists === true
          && payload.probe?.results?.meshFileExists === true
          && payload.probe?.results?.treeTextureFileExists === true
          && payload.probe?.results?.materialTextureFileExists === true,
        "terrain tree-buffer scene render smoke did not install the runtime W3D/tree asset system", payload.probe?.results);
      expect(payload.terrain?.tileSource === "shipped-map-heightmap"
          && payload.terrain?.renderObject === "ProbeHeightMapRenderObjWithTreeBuffer"
          && payload.terrain?.verticesPerSide === 33
          && payload.terrain?.cellsPerSide === 32
          && payload.terrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.terrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.terrain?.tileDiagnostics?.patchCellsWithSource > 0,
        "terrain tree-buffer scene render smoke did not keep source-backed terrain geometry", payload.terrain);
      expect(payload.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
          && payload.scene?.renderPath?.includes("W3DTreeBuffer::drawTrees")
          && payload.scene?.renderPath?.includes("RTS3DScene::Flush")
          && payload.scene?.created === true
          && payload.scene?.objectAdded === true
          && payload.scene?.terrainClassId === 4,
        "terrain tree-buffer scene render smoke did not use the scene drawTrees/flush path", payload.scene);
      expect(payload.probe?.results?.treeBufferInstalled === true
          && payload.probe?.results?.addTreeInvoked === true
          && payload.probe?.results?.updateTreeInvoked === true
          && payload.probe?.results?.updateCenterInvoked === true
          && payload.probe?.results?.treeSceneDrawFlushed === true
          && payload.probe?.results?.treeNeedToDrawAfterScene === false
          && payload.tree?.afterAdd === true
          && payload.tree?.afterUpdate === true
          && payload.tree?.tilesAfterScene > 0,
        "terrain tree-buffer scene render smoke did not drive original tree-buffer state", {
          results: payload.probe?.results,
          tree: payload.tree,
        });
      expect(payload.calls?.browserTextureCreate >= 2
          && payload.calls?.browserTextureUpdate >= 2
          && payload.calls?.drawIndexed >= 3,
        "terrain tree-buffer scene render smoke did not reach terrain plus tree indexed draws", payload.calls);
      expect(payload.draw?.vertexShaderFvf === 338
          && payload.draw?.vertexStride === 36
          && payload.browserProbe?.vertexShaderFvf === 338
          && payload.browserProbe?.vertexStride === 36
          && payload.browserProbe?.texture0?.sampled === true
          && payload.browserProbe?.vertexDiagnostics?.projected?.visible > 0
          && payload.drawSequence?.treeAfterTerrain === true,
        "terrain tree-buffer scene render smoke did not flush browser-visible tree geometry after terrain", {
          browserProbe: payload.browserProbe,
          drawSequence: payload.drawSequence,
        });
      expect(payload.coverage?.coloredPixelCount > 0,
        "terrain tree-buffer scene render smoke did not produce colored browser pixels", payload.coverage);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-tree-buffer-scene-canvas.png"),
        "terrain tree-buffer scene render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-road-buffer-scene-render",
    file: "harness/terrain_road_buffer_scene_smoke.mjs",
    args: [
      "artifacts/real-assets/INIZH.big",
      "artifacts/real-assets/MapsZH.big",
      "artifacts/real-assets/TerrainZH.big",
      "artifacts/real-assets/TexturesZH.big",
    ],
    validate(payload) {
      expect(payload.ok === true, "terrain road-buffer scene render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-road-buffer-scene",
        "terrain road-buffer scene render smoke emitted the wrong path", payload);
      expect(payload.archives?.ini?.roadsEntry === "Data\\INI\\Roads.ini"
          && payload.archives?.ini?.parser?.includes("INITerrainRoad.cpp")
          && payload.archives?.ini?.originalIniParser === true
          && payload.archives?.ini?.roadCount > 0
          && iniLayoutMatches(payload.archives?.ini?.layout),
        "terrain road-buffer scene render smoke did not read real Roads.ini road definitions", payload.archives?.ini);
      expect(payload.map?.entry === "Maps\\MD_CHI01\\MD_CHI01.map"
          && payload.map?.parsed === true
          && payload.map?.bytes > 0
          && payload.map?.width > 16
          && payload.map?.height > 16,
        "terrain road-buffer scene render smoke did not parse the shipped MD_CHI01 map", payload.map);
      expect(payload.logicalTerrain?.loadReturned === true
          && payload.logicalTerrain?.loadException === false
          && payload.logicalTerrain?.sourceFilenameMatches === true
          && payload.logicalTerrain?.mapObjectsPresentAfterLoad === true
          && payload.logicalTerrain?.mapObjectsUsed === true
          && payload.logicalTerrain?.roadPairsWithRoadType > 0
          && payload.logicalTerrain?.timeOfDayNotified === true
          && payload.logicalTerrain?.notifiedTimeOfDay === payload.logicalTerrain?.mapTimeOfDay
          && payload.probe?.results?.roadPairMapObjectsInstalled === false,
        "terrain road-buffer scene render smoke did not consume the original logical map-object list", {
          logicalTerrain: payload.logicalTerrain,
          results: payload.probe?.results,
        });
      expect(payload.terrain?.tileSource === "shipped-map-heightmap"
          && payload.terrain?.renderObject === "ProbeHeightMapRenderObjWithRoadBuffer"
          && payload.terrain?.verticesPerSide === 33
          && payload.terrain?.cellsPerSide === 32
          && payload.terrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.terrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.terrain?.tileDiagnostics?.patchCellsWithSource > 0,
        "terrain road-buffer scene render smoke did not keep source-backed terrain geometry", payload.terrain);
      expect(payload.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
          && payload.scene?.renderPath?.includes("W3DRoadBuffer::drawRoads")
          && payload.scene?.created === true
          && payload.scene?.objectAdded === true
          && payload.scene?.terrainClassId === 4,
        "terrain road-buffer scene render smoke did not use the scene road draw path", payload.scene);
      expect(payload.roadObjects?.pairs > 0
          && payload.roadObjects?.pairsWithRoadType > 0
          && payload.roads?.afterLoad > 0
          && payload.roads?.segmentsWithVertices > 0
          && payload.roads?.typesWithDrawData > 0,
        "terrain road-buffer scene render smoke did not drive original road map-object state", {
          roadObjects: payload.roadObjects,
          roads: payload.roads,
        });
      expect(payload.calls?.browserBufferCreate >= 4
          && payload.calls?.browserBufferUpdate >= 4
          && payload.calls?.drawIndexed >= 3,
        "terrain road-buffer scene render smoke did not reach terrain plus road indexed draws", payload.calls);
      expect(payload.draw?.vertexShaderFvf === 322
          && payload.draw?.vertexStride === 24
          && payload.browserProbe?.vertexShaderFvf === 322
          && payload.browserProbe?.vertexStride === 24
          && payload.browserProbe?.texture0?.sampled === true
          && payload.browserProbe?.vertexDiagnostics?.projected?.visible > 0
          && payload.drawSequence?.roadAfterTerrain === true,
        "terrain road-buffer scene render smoke did not flush browser-visible road geometry after terrain", {
          browserProbe: payload.browserProbe,
          drawSequence: payload.drawSequence,
        });
      expect(payload.coverage?.coloredPixelCount > 0,
        "terrain road-buffer scene render smoke did not produce colored browser pixels", payload.coverage);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-road-buffer-scene-canvas.png"),
        "terrain road-buffer scene render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "terrain-bridge-buffer-scene-render",
    file: "harness/terrain_bridge_buffer_scene_smoke.mjs",
    args: [
      "artifacts/real-assets/INIZH.big",
      "artifacts/real-assets/MapsZH.big",
      "artifacts/real-assets/TerrainZH.big",
      "artifacts/real-assets/Terrain.big",
      "artifacts/real-assets/W3DZH.big",
      "artifacts/real-assets/W3D.big",
      "artifacts/real-assets/TexturesZH.big",
      "artifacts/real-assets/Textures.big",
    ],
    validate(payload) {
      expect(payload.ok === true, "terrain bridge-buffer scene render smoke did not report ok", payload);
      expect(payload.path === "browser-ww3d-terrain-bridge-buffer-scene",
        "terrain bridge-buffer scene render smoke emitted the wrong path", payload);
      expect(payload.archives?.ini?.roadsEntry === "Data\\INI\\Roads.ini"
          && payload.archives?.ini?.parser?.includes("INITerrainBridge.cpp")
          && payload.archives?.ini?.originalIniParser === true
          && payload.archives?.ini?.bridgeCount > 0
          && payload.archives?.terrain?.optionalBasePresent === true
          && payload.archives?.w3d?.optionalBasePresent === true
          && payload.archives?.textures?.optionalBasePresent === true
          && iniLayoutMatches(payload.archives?.ini?.layout),
        "terrain bridge-buffer scene render smoke did not read real Roads.ini bridge definitions and base archive sidecars", payload.archives);
      expect(payload.map?.entry === "Maps\\MD_CHI01\\MD_CHI01.map"
          && payload.map?.parsed === true
          && payload.map?.bytes > 0
          && payload.map?.width > 16
          && payload.map?.height > 16,
        "terrain bridge-buffer scene render smoke did not parse the shipped MD_CHI01 map", payload.map);
      expect(payload.logicalTerrain?.loadReturned === true
          && payload.logicalTerrain?.loadException === false
          && payload.logicalTerrain?.sourceFilenameMatches === true
          && payload.logicalTerrain?.mapObjectsPresentAfterLoad === true
          && payload.logicalTerrain?.mapObjectsUsed === true
          && payload.logicalTerrain?.bridgePairsWithBridgeType > 0
          && payload.logicalTerrain?.timeOfDayNotified === true
          && payload.logicalTerrain?.notifiedTimeOfDay === payload.logicalTerrain?.mapTimeOfDay
          && payload.probe?.results?.bridgePairMapObjectsInstalled === false
          && payload.probe?.results?.terrainLogicInstalledForDraw === true
          && payload.probe?.results?.terrainLogicRetainedForDraw === true
          && payload.probe?.results?.bridgeLogicSeedInfoAvailable === true
          && payload.probe?.results?.bridgeLogicSeededForDraw === true
          && payload.probe?.results?.bridgeLogicCountAfterSeed > 0
          && payload.probe?.results?.bridgeLogicFirstIndexAfterSeed === 0
          && payload.logicalTerrain?.selectedTemplateSubstitutedInLogicalList === false
          && payload.bridgeObjects?.templateSubstitutedForAvailableAssets === false
          && payload.bridgeObjects?.selectedTemplateSubstitutedInLogicalList === false
          && payload.bridgeObjects?.selectedOriginalName === payload.bridgeObjects?.selectedInstalledName,
        "terrain bridge-buffer scene render smoke did not consume the original logical bridge map-object list", {
          logicalTerrain: payload.logicalTerrain,
          bridgeObjects: payload.bridgeObjects,
          results: payload.probe?.results,
        });
      expect(payload.terrain?.tileSource === "shipped-map-heightmap"
          && payload.terrain?.renderObject === "ProbeHeightMapRenderObjWithBridgeBuffer"
          && payload.terrain?.verticesPerSide === 33
          && payload.terrain?.cellsPerSide === 32
          && payload.terrain?.tileDiagnostics?.sourceTilesLoaded > 0
          && payload.terrain?.tileDiagnostics?.sourceTilesPositioned > 0
          && payload.terrain?.tileDiagnostics?.patchCells === 1024
          && payload.terrain?.tileDiagnostics?.patchCellsWithSource === 1024
          && payload.terrain?.tileDiagnostics?.patchCellsMissingSource === 0,
        "terrain bridge-buffer scene render smoke did not keep source-backed terrain geometry", payload.terrain);
      expect(payload.scene?.renderPath?.includes("HeightMapRenderObjClass::Render")
          && payload.scene?.renderPath?.includes("W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic)")
          && payload.scene?.renderPath?.includes("W3DBridge::renderBridge")
          && payload.probe?.results?.bridgeDrawTerrainLogicBridgeCount > 0
          && payload.probe?.results?.bridgeDrawEnabledBridgeCount > 0
          && payload.scene?.created === true
          && payload.scene?.objectAdded === true
          && payload.scene?.terrainClassId === 4,
        "terrain bridge-buffer scene render smoke did not use the scene bridge draw path", payload.scene);
      expect(payload.bridgeObjects?.pairs > 0
          && payload.bridgeObjects?.pairsWithBridgeType > 0
          && payload.bridgeObjects?.candidatesWithAssetsAndSource > 0
          && payload.bridgeObjects?.selectedPatchSourceCells === 1024
          && payload.bridgeObjects?.selectedModelAvailable === true
          && payload.bridgeObjects?.selectedTextureAvailable === true
          && payload.bridges?.afterLoad > 0
          && payload.bridges?.verticesAfterUpdate > 0
          && payload.bridges?.indicesAfterUpdate > 0,
        "terrain bridge-buffer scene render smoke did not drive original bridge map-object state", {
          bridgeObjects: payload.bridgeObjects,
          bridges: payload.bridges,
        });
      expect(payload.calls?.browserBufferCreate >= 4
          && payload.calls?.browserBufferUpdate >= 4
          && payload.calls?.drawIndexed >= 3,
        "terrain bridge-buffer scene render smoke did not reach terrain plus bridge indexed draws", payload.calls);
      expect(payload.draw?.vertexShaderFvf === 338
          && payload.draw?.vertexStride === 36
          && payload.browserProbe?.vertexShaderFvf === 338
          && payload.browserProbe?.vertexStride === 36
          && payload.browserProbe?.texture0?.sampled === true
          && payload.browserProbe?.vertexDiagnostics?.projected?.visible > 0
          && payload.drawSequence?.bridgeAfterTerrain === true
          && payload.drawSequence?.bridgeShroudAfterBridge === true,
        "terrain bridge-buffer scene render smoke did not flush browser-visible bridge geometry after terrain", {
          browserProbe: payload.browserProbe,
          drawSequence: payload.drawSequence,
        });
      expect(payload.coverage?.coloredPixelCount > 0,
        "terrain bridge-buffer scene render smoke did not produce colored browser pixels", payload.coverage);
      expect(payload.screenshot?.endsWith("harness-smoke-ww3d-terrain-bridge-buffer-scene-canvas.png"),
        "terrain bridge-buffer scene render smoke did not capture the expected screenshot", payload);
    },
  },
  {
    name: "shipped-mesh-render",
    file: "harness/shipped_mesh_render_smoke.mjs",
    args: ["artifacts/real-assets/W3DZH.big", "artifacts/real-assets/TexturesZH.big"],
    validate(payload) {
      expect(payload.ok === true, "shipped mesh render smoke did not report ok", payload);
      expect(payload.reader === "browser Range subset BIGs registered through runtime-owned Win32BIGFileSystem",
        "shipped mesh render smoke did not use range-backed BIG assets", payload);
      expect(payload.probe?.mesh?.name === "CINE_MOON",
        "shipped mesh render smoke did not load the expected shipped W3D mesh", payload.probe);
      expect(payload.probe?.results?.textureDDSLoaded === true,
        "shipped mesh render smoke did not load DDS texture data", payload.probe);
      expect(payload.browserProbe?.source === "browser_d3d8_draw_indexed",
        "shipped mesh render smoke did not reach the browser D3D8/WebGL draw path", payload.browserProbe);
      expect(payload.multiTextureProbe?.ok === true
          && payload.multiTextureProbe?.results?.meshLoaded === true
          && payload.multiTextureProbe?.mesh?.passCount === 1
          && payload.multiTextureProbe?.mesh?.uvArrayCount === 2,
        "shipped mesh render smoke did not exercise same-pass multi-texture rendering", payload.multiTextureProbe);
    },
  },
  {
    name: "bink-w3d-video-presentation",
    file: "harness/bink_w3d_video_buffer_upload_smoke.mjs",
    args: [
      "artifacts/real-assets/GC_Background.bik",
      "artifacts/real-assets/VS_small.bik",
      "artifacts/browser-video/bink/bink-browser-video-manifest.json",
    ],
    validate(payload) {
      expect(payload.ok === true, "Bink W3D video presentation smoke did not report ok", payload);
      expect(payload.source === "WebAssembly/harness/bink_w3d_video_buffer_upload_smoke.mjs",
        "Bink W3D video presentation smoke reported the wrong source", payload);
      expect(payload.screenshotPath?.endsWith("harness-smoke-bink-w3d-video-buffer-upload.png"),
        "Bink W3D video presentation smoke did not capture the expected screenshot", payload);
      expect(payload.counts?.binkOpen === 12
          && payload.counts?.binkClose === 12
          && payload.counts?.binkCopyComplete === 766
          && payload.counts?.copyEvents === 766
          && payload.counts?.drawEvents >= 766
          && payload.counts?.textureCreates === 13
          && payload.counts?.textureUpdates === 779
          && payload.counts?.textureReleases === 12
          && payload.counts?.liveTextureCount === 1,
        "Bink W3D video presentation smoke did not prove the expected original video lifecycle counts", payload.counts);
      expect(payload.lastDraw?.source === "browser_d3d8_draw_indexed"
          && payload.lastDraw?.primitiveType === 4
          && payload.lastDraw?.vertexCount === 4
          && payload.lastDraw?.indexCount === 6
          && payload.lastDraw?.vertexStride === 44
          && payload.lastDraw?.texture0?.format === 22
          && payload.lastDraw?.texture0?.storage === "rgba8"
          && payload.lastDraw?.texture0?.ready === true
          && payload.lastDraw?.texture0?.sampled === true
          && Array.isArray(payload.lastDraw?.centerPixel)
          && payload.lastDraw.centerPixel.some((channel, index) => index < 3 && channel > 0),
        "Bink W3D video presentation smoke did not reach browser D3D8/WebGL textured draw presentation", payload.lastDraw);
      expect((payload.copyChecksums ?? []).some((event) =>
            event.videoPath === "artifacts/browser-video/bink/GC_Background.webm"
            && event.copyWidth === 800
            && event.copyHeight === 600
            && event.bytesWritten > 0
            && event.checksum > 0)
          && (payload.copyChecksums ?? []).some((event) =>
            event.videoPath === "artifacts/browser-video/bink/VS_small.webm"
            && event.copyWidth === 96
            && event.copyHeight === 120
            && event.bytesWritten > 0
            && event.checksum > 0),
        "Bink W3D video presentation smoke did not copy decoded shipped sidecar frames", payload.copyChecksums?.slice?.(0, 8));
    },
  },
];

const results = steps.map((step) => runNodeStep(step, step.root ?? wasmRoot));

console.log(JSON.stringify({
  ok: true,
  path: "vertical-integrations",
  covered: [
    "aggregate startup vertical covering browser GameEngine.cpp startup frontier, original GameEngine lifetime, original Miles openDevice, W3D window/layout ownership, source-pinned GameLogic MSG_NEW_GAME dispatch frontier, and runtime original GameLogic::processCommandList first-call deferral through original GlobalData TheWritableGlobalData, PlayerList::getNthPlayer, ScriptEngine::setGlobalDifficulty, and Shell::hideShell",
    "runtime archive preload, boot-time startup asset consumption, MSS 2D Web Audio sample playback, and startup singleton pre-audio frontier diagnostics",
    "browser Web Audio request-path playback for source-shaped AudioManager/SoundManager/MilesAudioManager 2D sample, 3D sample, and speech stream events",
    "original MilesAudioManager processRequest/playAudioEvent/playSample 2D sample playback through AudioFileCache, AIL_WAV_info, and MSS sample completion/release",
    "paired audio vertical proving the original MilesAudioManager 2D sample leg beside browser MSS AudioBufferSourceNode completion/release in one Playwright-owned gate",
    "browser relay-shaped networking path carrying original GameNetwork NetPacket bytes into Transport::m_inBuffer, ConnectionManager::doRelay, and FrameDataManager readiness",
    "two isolated Playwright browser contexts carrying original GameNetwork transport bytes from one wasm instance into another",
    "two isolated Playwright browser contexts carrying encrypted original Transport::queueSend/doSend wire bytes through a browser WebSocket binary relay into Transport::doRecv, ConnectionManager::doRelay, and frame-data readiness",
    "two isolated Playwright browser contexts using Module.cncPortBrowserUdpSend/Recv as a live WebSocket endpoint for original Transport::doSend/doRecv datagrams",
    "two isolated Playwright browser contexts carrying a LANMessage MSG_GAME_ANNOUNCE into original LANAPI::update, handleGameAnnounce, ParseGameOptionsString, and OnGameList",
    "two isolated Playwright browser contexts carrying original LANAPI RequestGameJoin, handleRequestJoin, handleJoinAccept, and handleGameOptions through queued Transport bytes",
    "two isolated Playwright browser contexts carrying original LANAPI RequestGameStart and handleGameStart into OnGameStart, Network::init/initTransport/parseUserList, and MSG_NEW_GAME setup",
    "two isolated Playwright browser contexts carrying LANAPI announce, join/options, and game-start messages through browser WebSocket binary frames into original LANAPI handlers",
    "two isolated Playwright browser contexts carrying original LANAPI RequestGameStart through Module.cncPortBrowserUdpSend/Recv into LANAPI::update, handleGameStart, and Network::initTransport/parseUserList",
    "original LANAPI game-start state driven through Network::update, GetCommandsFromCommandList, processCommand, ConnectionManager::allCommandsReady, timeForNewFrame, RelayCommandsToCommandList, and frameDataReady transition",
    "original LANAPI game-start state driven through three Network::update frames plus original FrameData FRAMEDATA_NOTREADY and FRAMEDATA_RESEND desync states",
    "browser Range archive delivery through synthesized BIG files, original Win32BIGFileSystem, and base INI blocker reporting",
    "WindowZH/INIZH-backed Shell MainMenu Load Replay dropdown/back, USA difficulty transition/back, SkirmishGameOptionsMenu init/ButtonBack/ButtonStart/MessageStream-to-CommandList/shutdown ownership, and CreditsMenu callback execution through real input navigation",
    "synthetic W3DGameWindowManager winRepaint dispatch into W3DGadgetPushButtonDraw, a vtable-safe Display adapter, and real W3DDisplay/WebGL2 button pixels",
    "mapped-image W3DDisplay drawImage over real INIZH/EnglishZH assets",
    "real WindowZH MainMenu.wnd image child repaint through parseDrawData, W3DGameWinDefaultDraw, W3DDisplay::drawImage, GameText-backed visible main-button labels plus Single Player, Load Replay, and Difficulty dropdown controls, and browser WebGL2 pixels",
    "real MainMenuRuler HandCreated mapped image through TexturesZH.big, W3DDisplay::drawImage, and browser WebGL2 pixels",
    "composed W3DDisplay shell render frame layering W3DDisplay::m_3DScene, real mapped shell UI art, and GameText-backed W3DDisplayString text in one browser screenshot",
    "real TerrainZH.big terrain tile data through WorldHeightMap::readTiles, W3DTerrainBackground stage-1 texture sampling, and browser WebGL2 pixels",
    "real TerrainZH.big terrain tile data through RTS3DScene::Customized_Render CLASSID_TILEMAP dispatch and browser WebGL2 pixels",
    "real INIZH.big Terrain.ini texture mappings plus MapsZH.big MD_GLA03 height/blend data through WorldHeightMap, RTS3DScene::Customized_Render, HeightMapRenderObjClass, and browser WebGL2 pixels",
    "real W3DTerrainVisual::load ownership of WorldHeightMap and HeightMapRenderObjClass through W3DDisplay::m_3DScene, including full W3DTerrainVisual::init water/smudge initialization from shipped Water.ini and base Textures.big, full-init HeightMapRenderObjClass shroud updates through W3DDisplay::setShroudLevel and PartitionManager::refreshShroudForLocalPlayer, the original 129x129 load window with all 16,384 cells source-backed by mounted base Terrain.big, and browser WebGL2 pixels",
    "original W3DTreeBuffer::drawTrees reached through RTS3DScene::Flush/DoTrees with shipped PTDogwod01_S W3D and terrain/tree textures in browser WebGL2",
    "original W3DTerrainLogic::loadMap(query=true) map-object list feeding W3DRoadBuffer::loadRoads and browser-visible road geometry",
    "original W3DTerrainLogic::loadMap(query=true) map-object list feeding W3DBridgeBuffer::loadBridges, W3DBridge::renderBridge, and bridge shroud browser-visible geometry",
    "shipped W3D mesh and DDS texture rendering through the browser D3D8/WebGL bridge",
    "shipped Bink sidecar frames copied by original BinkVideoPlayer into real W3DVideoBuffer textures and presented through original W3DDisplay::drawVideoBuffer",
  ],
  nextRequired: [
    "advance MainMenu WindowLayout repaint from curated target visibility to unpruned production shell composition and display-owned font/image/archive lifetime",
    "thread mounted base Generals INI.big/English.big startup coverage through production original GameEngine.cpp init ownership",
    "replace the focused runtime BlankWindow layout adapter with archive-backed WindowLayout::load from mounted base Window.big",
    "broaden W3DTerrainVisual terrain ownership from the probe-mounted source-backed load window into production gameplay map-load, shroud, partition, and terrain logic ownership",
    "advance full production video ownership beyond focused Bink/load-screen/score-screen harness hooks into the normal InGameUI/campaign shell path",
    "move original MilesAudioManager 2D sample playback into the same browser cnc-port runtime/Web Audio backend instead of a paired standalone/browser gate",
    "replace focused browser GameEngine lifetime with production original GameEngine.cpp init/createAudioManager ownership",
    "deferred networking-last item: extend the live WebSocket UDP endpoint from LANAPI game-start into Network::update two-client match-sync coverage",
  ],
  steps: results.map((result) => result.name),
}));
