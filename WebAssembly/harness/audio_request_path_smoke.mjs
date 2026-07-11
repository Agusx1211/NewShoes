#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const runtimeArchives = [
  "INIZH.big",
  "W3DZH.big",
  "W3DEnglishZH.big",
  "TexturesZH.big",
  "TerrainZH.big",
  "WindowZH.big",
  "ShadersZH.big",
  "MapsZH.big",
  "AudioZH.big",
  "AudioEnglishZH.big",
  "SpeechZH.big",
  "SpeechEnglishZH.big",
  "MusicZH.big",
  "Music.big",
  "EnglishZH.big",
  "GensecZH.big",
  "Gensec.big",
];

const optionalBaseRuntimeArchives = [
  { sourceName: "INI.big", mountName: "ZZBase_INI.big" },
  { sourceName: "English.big", mountName: "ZZBase_English.big" },
];

const requestPathTargets = [
  {
    cacheKey: "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav",
    eventName: "CIAAgentVoiceAttack",
    audioType: "AT_SoundEffect",
    requestManager: "SoundManager::addAudioEvent",
    queueFunction: "SoundManager::addAudioEvent",
    deviceStart: "playSample",
    playingType: "PAT_Sample",
    bus: "sound",
    releasePath: "processPlayingList -> releasePlayingAudio",
  },
  {
    cacheKey: "AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav",
    eventName: "ArtilleryBarrageIncomingWhistle",
    audioType: "AT_SoundEffect",
    requestManager: "SoundManager::addAudioEvent",
    queueFunction: "SoundManager::addAudioEvent",
    deviceStart: "playSample3D",
    playingType: "PAT_3DSample",
    bus: "sound3D",
    releasePath: "processPlayingList -> releasePlayingAudio",
  },
  {
    cacheKey: "SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav",
    eventName: "Taunts_AirTrafficControl01",
    audioType: "AT_Streaming",
    requestManager: "SoundManager::addAudioEvent",
    queueFunction: "SoundManager::addAudioEvent",
    deviceStart: "playStream",
    playingType: "PAT_Stream",
    bus: "speech",
    releasePath: "processStoppedList -> releasePlayingAudio",
  },
];

const expectedMixerGains = {
  music: 0.2,
  sound: 0.3,
  sound3D: 0.375,
  speech: 0.36,
};

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const archiveRoot = resolve(wasmRoot, process.argv[2] ?? defaultArchiveRoot);

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function toUrlPath(path) {
  return relative(wasmRoot, path).split(sep).join("/");
}

async function archiveInputFor(path, name, sourceName = name) {
  expect(isInside(wasmRoot, path), `${name} must be inside the wasm root`, { path, wasmRoot });
  const fileStat = await stat(path);
  expect(fileStat.isFile() && fileStat.size > 0, `${name} is not a readable archive`, {
    path,
    size: fileStat.size,
  });
  return {
    name,
    sourceName,
    bytes: fileStat.size,
    expectedBytes: fileStat.size,
    urlPath: toUrlPath(path),
  };
}

async function buildArchiveInputs() {
  const archives = [];
  for (const name of runtimeArchives) {
    archives.push(await archiveInputFor(resolve(archiveRoot, name), name));
  }

  for (const optional of optionalBaseRuntimeArchives) {
    try {
      archives.push(await archiveInputFor(
        resolve(archiveRoot, optional.sourceName),
        optional.mountName,
        optional.sourceName,
      ));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return archives;
}

function assertArrayHasAll(actual, expected, context) {
  for (const value of expected) {
    if (!Array.isArray(actual) || !actual.includes(value)) {
      throw new Error(`${context} missing ${value}: ${JSON.stringify(actual)}`);
    }
  }
}

function assertBrowserAudioRuntime(runtime, context) {
  expect(runtime?.available === true
      && runtime.created === true
      && runtime.contextState === "running"
      && runtime.resumeAttempts >= 1
      && runtime.resumeSuccesses >= 1
      && runtime.lastResumeTrigger === "window.click"
      && runtime.lastResumeError === null,
    `${context} did not resume Web Audio`, runtime);
}

function assertBrowserAudioMixerRuntime(mixer, context) {
  expect(mixer?.created === true
      && mixer.contextCreated === true
      && mixer.contextState === "running"
      && mixer.lastError === null
      && mixer.lastUpdate?.source === "AudioManager::setVolume script/system volume split",
    `${context} did not create the Web Audio mixer runtime`, mixer);
  for (const [bus, gain] of Object.entries(expectedMixerGains)) {
    expect(Math.abs((mixer.busGains?.[bus] ?? 0) - gain) < 0.000001
        && Math.abs((mixer.buses?.[bus]?.gain ?? 0) - gain) < 0.000001
        && mixer.buses?.[bus]?.connected === true
        && mixer.buses?.[bus]?.node === "GainNode",
      `${context} ${bus} mixer bus mismatch`, mixer);
  }
}

function assertRequestPathRuntime(requestPath, expected, context) {
  expect(requestPath?.source === "browser source-shaped audio request queue live playback proof"
      && requestPath.ready === true
      && requestPath.runtimePlayback === true
      && requestPath.engineDriven === false
      && requestPath.sourcePathDriven === true
      && requestPath.nextRequired === "realMilesAudioManagerWebAudioBackend"
      && requestPath.lastError === null
      && requestPath.cacheEntries === 5,
    `${context} request path runtime state mismatch`, requestPath);
  assertArrayHasAll(requestPath.sourceFrontiers, [
    "verify:audio-event-request-frontier",
    "verify:audio-request-update-frontier",
    "verify:audio-sample-start-frontier",
    "verify:audio-playing-event-state-frontier",
    "verify:audio-completion-frontier",
    "verify:audio-browser-bridge-contract-frontier",
  ], `${context} source frontiers`);

  const event = requestPath.lastEvent;
  expect(event?.cacheKey === expected.cacheKey
      && event.eventName === expected.eventName
      && event.common?.function === "AudioManager::addAudioEvent"
      && event.common?.handleAllocator === "allocateNewHandle"
      && event.common?.filenameStep === "AudioEventRTS::generateFilename"
      && event.common?.playInfoStep === "AudioEventRTS::generatePlayInfo"
      && event.common?.audioType === expected.audioType
      && event.request?.manager === expected.requestManager
      && event.request?.queueFunction === expected.queueFunction
      && event.request?.request === "AR_Play"
      && event.request?.usePendingEvent === true
      && event.drain?.requestList === "MilesAudioManager::processRequestList"
      && event.drain?.dispatch === "MilesAudioManager::processRequest"
      && event.drain?.playRoute === "AR_Play -> playAudioEvent(req->m_pendingEvent)"
      && event.playback?.deviceStart === expected.deviceStart
      && event.playback?.playingType === expected.playingType
      && event.playback?.bus === expected.bus
      && event.playback?.webAudioNode === "AudioBufferSourceNode"
      && event.callback?.observed === true
      && event.callback?.completionCall === "notifyOfAudioCompletion"
      && event.completion?.statusAfterCallback === "PS_Stopped"
      && event.completion?.releasePath === expected.releasePath
      && event.completion?.releaseAudioEventRTS === true,
    `${context} request path event mismatch`, requestPath);

  const phases = (requestPath.eventLog ?? []).slice(-11).map((entry) => entry.phase);
  expect(phases.join("|") === [
    "addAudioEvent",
    "generate",
    "route",
    "queue",
    "drain",
    "dispatch",
    "playAudioEvent",
    "start",
    "ended",
    "completion",
    "release",
  ].join("|"), `${context} request path event order mismatch`, requestPath.eventLog);
}

function assertFinalRequestPathCoverage(requestPath) {
  const count = requestPathTargets.length;
  expect(requestPath.completed === count
      && requestPath.enqueued === count
      && requestPath.drained === count
      && requestPath.dispatched === count
      && requestPath.started === count
      && requestPath.released === count,
    "audio request path coverage counters mismatch", requestPath);
  assertArrayHasAll(requestPath.coveredPlayingTypes, ["PAT_Sample", "PAT_3DSample", "PAT_Stream"],
    "audio request path playing-type coverage");
  assertArrayHasAll(requestPath.coveredDeviceStarts, ["playSample", "playSample3D", "playStream"],
    "audio request path device-start coverage");
  assertArrayHasAll(requestPath.coveredAudioTypes, ["AT_SoundEffect", "AT_Streaming"],
    "audio request path audio-type coverage");
  assertArrayHasAll(requestPath.coveredBuses, ["sound", "sound3D", "speech"],
    "audio request path bus coverage");
}

const archives = await buildArchiveInputs();
const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const archiveInputs = archives.map((archive) => ({
    name: archive.name,
    sourceName: archive.sourceName,
    bytes: archive.bytes,
    expectedBytes: archive.expectedBytes,
    url: new URL(archive.urlPath, server.url).href,
  }));
  const mountResult = await page.evaluate((archivesForMount) => window.CnCPort.rpc("mountArchives", {
    path: "/assets/runtime",
    archives: archivesForMount,
  }), archiveInputs);
  expect(mountResult.ok === true
      && mountResult.archiveSet?.archiveCount === archives.length
      && mountResult.state?.audioRuntimeAssets?.ready === true,
    "audio request path smoke did not mount runtime archives", mountResult);

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "audio request path browser smoke",
  }));
  expect(bootResult.ok === true
      && bootResult.state?.wasm === "loaded"
      && bootResult.state?.booted === true
      && bootResult.state?.browserAudioRequestPathRuntime?.cacheEntries === 5
      && bootResult.state.browserAudioRequestPathRuntime.ready === false,
    "audio request path smoke did not boot to the pre-gesture audio state", bootResult);

  const audioGesturePoint = await page.evaluate(() => {
    const target = document.querySelector("#viewport");
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + Math.max(1, Math.min(rect.width - 1, rect.width / 2)),
      y: rect.top + Math.max(1, Math.min(rect.height - 1, rect.height / 2)),
    };
  });
  await page.mouse.click(audioGesturePoint.x, audioGesturePoint.y);
  await page.waitForFunction(async () => {
    const result = await window.CnCPort.rpc("browserAudioRuntime");
    const runtime = result.browserAudioRuntime;
    return runtime?.resumeAttempts >= 1
      && runtime?.resumeSuccesses >= 1
      && runtime?.contextState === "running"
      && runtime?.lastResumeTrigger === "window.click";
  }, null, { timeout: 5000 });
  const audioGestureResult = await page.evaluate(() => window.CnCPort.rpc("browserAudioRuntime"));
  expect(audioGestureResult.ok === true, "browser audio runtime RPC failed after gesture", audioGestureResult);
  assertBrowserAudioRuntime(audioGestureResult.browserAudioRuntime, "audio request path smoke");

  const mixerVolumeResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("setBrowserAudioMixerVolumes", payload), {
    trigger: "audio_request_path_smoke.mjs mixer setup",
    scriptVolumes: {
      music: 0.8,
      sound: 0.6,
      sound3D: 0.5,
      speech: 0.9,
    },
    systemVolumes: {
      music: 0.25,
      sound: 0.5,
      sound3D: 0.75,
      speech: 0.4,
    },
    zoomVolume: 1,
  });
  expect(mixerVolumeResult.ok === true, "browser audio mixer volume RPC failed", mixerVolumeResult);
  assertBrowserAudioMixerRuntime(mixerVolumeResult.browserAudioMixerRuntime, "audio request path smoke");

  let requestPathResult = null;
  for (const target of requestPathTargets) {
    requestPathResult = await page.evaluate((payload) =>
      window.CnCPort.rpc("playBrowserAudioRequestPathEvent", payload), {
      cacheKey: target.cacheKey,
      durationSeconds: 0.05,
    });
    expect(requestPathResult.ok === true, `browser audio request path RPC failed for ${target.eventName}`,
      requestPathResult);
    assertRequestPathRuntime(requestPathResult.browserAudioRequestPathRuntime, target,
      `audio request path ${target.eventName}`);
  }

  const runtime = requestPathResult.browserAudioRequestPathRuntime;
  assertFinalRequestPathCoverage(runtime);
  expect((requestPathResult.state?.browserAudioLiveEventRuntime?.completed ?? 0) >= requestPathTargets.length,
    "audio request path did not complete the underlying live Web Audio events",
    requestPathResult.state?.browserAudioLiveEventRuntime);
  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser emitted an error during the audio request path smoke", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-audio-request-path",
    harnessUrl,
    archiveCount: archives.length,
    audioContext: {
      state: audioGestureResult.browserAudioRuntime.contextState,
      resumeTrigger: audioGestureResult.browserAudioRuntime.lastResumeTrigger,
    },
    mixer: {
      source: mixerVolumeResult.browserAudioMixerRuntime.source,
      nodeGraph: mixerVolumeResult.browserAudioMixerRuntime.nodeGraph,
      busGains: mixerVolumeResult.browserAudioMixerRuntime.busGains,
    },
    requestPath: {
      source: runtime.source,
      sourcePathDriven: runtime.sourcePathDriven,
      engineDriven: runtime.engineDriven,
      nextRequired: runtime.nextRequired,
      cacheEntries: runtime.cacheEntries,
      completed: runtime.completed,
      enqueued: runtime.enqueued,
      drained: runtime.drained,
      dispatched: runtime.dispatched,
      started: runtime.started,
      released: runtime.released,
      coveredPlayingTypes: runtime.coveredPlayingTypes,
      coveredDeviceStarts: runtime.coveredDeviceStarts,
      coveredAudioTypes: runtime.coveredAudioTypes,
      coveredBuses: runtime.coveredBuses,
      sourceFrontiers: runtime.sourceFrontiers,
      events: requestPathTargets.map((target) => ({
        eventName: target.eventName,
        cacheKey: target.cacheKey,
        audioType: target.audioType,
        deviceStart: target.deviceStart,
        playingType: target.playingType,
        bus: target.bus,
      })),
    },
    liveEventRuntime: {
      completed: requestPathResult.state.browserAudioLiveEventRuntime.completed,
      released: requestPathResult.state.browserAudioLiveEventRuntime.released,
    },
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await browser?.close();
  await server.close();
}
