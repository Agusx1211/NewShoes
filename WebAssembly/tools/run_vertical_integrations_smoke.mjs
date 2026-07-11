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
  const audioManagerReady = frontier?.audioManagerRuntime?.ready === true;
  const functionLexiconReady = frontier?.functionLexiconRuntime?.ready === true;
  const moduleFactoryReady = frontier?.moduleFactoryRuntime?.ready === true;
  const particleSystemReady = frontier?.particleSystemRuntime?.ready === true;
  const expectedFirstUnownedFactory = !audioManagerReady
    ? "createAudioManager"
    : !functionLexiconReady
      ? "createFunctionLexicon"
      : !moduleFactoryReady
        ? "createModuleFactory"
        : !particleSystemReady
          ? "createParticleSystemManager"
          : "createThingFactory";
  const expectedFirstUnownedLine = !audioManagerReady
    ? 434
    : !functionLexiconReady
      ? 446
      : !moduleFactoryReady
        ? 447
        : !particleSystemReady
          ? 453
          : 482;
  expect(frontier?.firstUnownedInitFactory === expectedFirstUnownedFactory,
    `${label} did not report the expected first unowned device factory`, frontier);
  expect(frontier.firstUnownedInitLine === expectedFirstUnownedLine,
    `${label} did not report the expected first unowned device factory line`, frontier);
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
    const audioManagerReady = frontier?.audioManagerRuntime?.ready === true;
    const functionLexiconReady = frontier?.functionLexiconRuntime?.ready === true;
    const moduleFactoryReady = frontier?.moduleFactoryRuntime?.ready === true;
    const particleSystemReady = frontier?.particleSystemRuntime?.ready === true;
    const expectedNextRequired = !audioManagerReady
      ? "createAudioManager"
      : !functionLexiconReady
        ? "createFunctionLexicon"
        : !moduleFactoryReady
          ? "createModuleFactory"
          : !particleSystemReady
            ? "createParticleSystemManager"
            : "createThingFactory";
    expect(startup.status === "browser_device_layer_pending",
      `${label} with base INI mounted should advance to browser device layer pending`, startup);
    expect(frontier.nextRequired === expectedNextRequired && frontier.setupReady === true,
      `${label} with base INI mounted reported the wrong next device factory frontier`, frontier);
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
      expect(payload.covered?.includes("runtime original GameLogic::processCommandList dispatch of MSG_NEW_GAME through prepareNewGame, base Window.big archive-backed BlankWindow parsing, original GlobalData TheWritableGlobalData, original PlayerList::getNthPlayer neutral-player ownership, original ScriptEngine::setGlobalDifficulty, original Shell::hideShell, first-call startNewGame(FALSE) deferral, MapsZH.big MD_GLA03 promotion, INIZH/INI startup data plus default and Zero Hour GameData.ini parsing, original W3DTerrainLogic::loadMap(false), WorldHeightMap object/waypoint/sides parsing, SidesList::validateSides, AIPlayer construction, TeamFactory::initFromSides, PlayerList::newGame, ScriptEngine::newMap, Radar::newMap, GameLogic width/height copying, PartitionManager::init/refreshShroudForLocalPlayer, GhostObjectManager local-player index/reset, TerrainRoadCollection/TerrainTypeCollection render-map setup, original W3DTerrainLogic::newMap road-buffer and W3DBridgeBuffer::loadBridges handoff, TerrainLogic waypoint/water setup, the ordered post-terrain bridge-like map-object no-candidate scan, Radar::refreshTerrain, and original Pathfinder::newMap grid allocation/classification"),
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
          && payload.audioContext?.resumeTrigger === "window.click"
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
    name: "browser-network-webrtc-live-transport",
    file: "harness/network_webrtc_live_transport_smoke.mjs",
    validate(payload) {
      expect(payload.ok === true, "browser live WebRTC transport smoke did not report ok", payload);
      expect(payload.path === "browser-network-webrtc-live-transport"
          && payload.browserContexts === 2
          && payload.p2p === true
          && payload.reliable === true
          && payload.ordered === true
          && payload.gameBytesRelayedByServer === 0
          && payload.source?.browserTransport === "WebRTC RTCDataChannel peer mesh"
          && payload.source?.relayTransport === false
          && payload.source?.openPeers === 1
          && payload.destination?.openPeers === 1
          && payload.packet?.commandType === "NETCOMMANDTYPE_FRAMEINFO+NETCOMMANDTYPE_RUNAHEAD"
          && payload.receive?.ready === true
          && payload.receive?.managerReady === true
          && payload.receive?.storedCommandType === "NETCOMMANDTYPE_RUNAHEAD"
          && payload.signaling?.relayedSignals > 0
          && payload.signaling?.binaryFramesRejected === 0
          && payload.signaling?.gamePayloadBytes === 0,
        "browser live WebRTC transport smoke did not carry original Transport bytes directly between peers", payload);
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
    "aggregate startup vertical covering browser GameEngine.cpp startup frontier, original GameEngine lifetime, original Miles openDevice, W3D window/layout ownership, source-pinned GameLogic MSG_NEW_GAME dispatch frontier, and runtime original GameLogic::processCommandList first-call deferral through base Window.big archive-backed BlankWindow parsing, original GlobalData TheWritableGlobalData, PlayerList::getNthPlayer, ScriptEngine::setGlobalDifficulty, Shell::hideShell, INIZH/INI startup data parsing, W3DTerrainLogic::loadMap(false), side/player/team/script population, PlayerList::newGame, ScriptEngine::newMap, Radar::newMap, PartitionManager/GhostObjectManager handoff, original W3DTerrainLogic::newMap road/bridge buffer handoff, TerrainLogic waypoint/water setup, ordered post-terrain bridge-like map-object no-candidate scan, Radar::refreshTerrain, and original Pathfinder::newMap grid allocation/classification",
    "runtime archive preload, boot-time startup asset consumption, MSS 2D Web Audio sample playback, and startup singleton pre-audio frontier diagnostics",
    "browser Web Audio request-path playback for source-shaped AudioManager/SoundManager/MilesAudioManager 2D sample, 3D sample, and speech stream events",
    "original MilesAudioManager processRequest/playAudioEvent/playSample 2D sample playback through AudioFileCache, AIL_WAV_info, and MSS sample completion/release",
    "paired audio vertical proving the original MilesAudioManager 2D sample leg beside browser MSS AudioBufferSourceNode completion/release in one Playwright-owned gate",
    "browser relay-shaped networking path carrying original GameNetwork NetPacket bytes into Transport::m_inBuffer, ConnectionManager::doRelay, and FrameDataManager readiness",
    "two isolated Playwright browser contexts carrying original GameNetwork transport bytes from one wasm instance into another",
    "two isolated Playwright browser contexts carrying encrypted original Transport::queueSend/doSend wire bytes through a browser WebSocket binary relay into Transport::doRecv, ConnectionManager::doRelay, and frame-data readiness",
    "two isolated Playwright browser contexts using Module.cncPortBrowserUdpSend/Recv as a live WebSocket endpoint for original Transport::doSend/doRecv datagrams",
    "two isolated Playwright browser contexts routing encrypted original Transport datagrams over a direct reliable ordered WebRTC DataChannel mesh while WebSocket carries signaling only",
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
    "load real object templates into gamelogic-new-game-dispatch-smoke and promote the bridge-like map-object creation branch when a map supplies bridge or walk-on-wall templates, then continue the original ordered startNewGame sequence beyond Pathfinder::newMap",
    "broaden W3DTerrainVisual terrain ownership from the probe-mounted source-backed load window into production gameplay map-load, shroud, partition, and terrain logic ownership",
    "advance full production video ownership beyond focused Bink/load-screen/score-screen harness hooks into the normal InGameUI/campaign shell path",
    "move original MilesAudioManager 2D sample playback into the same browser cnc-port runtime/Web Audio backend instead of a paired standalone/browser gate",
    "replace focused browser GameEngine lifetime with production original GameEngine.cpp init/createAudioManager ownership",
    "extend the live WebRTC P2P endpoint through LANAPI game-start and Network::update two-client match-sync coverage after repairing the current-head LANAPI send-probe hang",
  ],
  steps: results.map((result) => result.name),
}));
