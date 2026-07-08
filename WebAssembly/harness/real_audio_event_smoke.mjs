#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

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
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];
const AHSV_STOP_THE_MUSIC = 4;
const AHSV_STOP_THE_MUSIC_FADE = 5;

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function normalizeAudioPath(path) {
  return String(path ?? "").replace(/[\\/]+/g, "\\").toLowerCase();
}

function buildArchives(baseUrl) {
  return archiveSpecs.map((spec) => {
    const sourceName = spec.sourceName ?? spec.name;
    return {
      name: spec.name,
      sourceName,
      url: new URL(`artifacts/real-assets/${sourceName}`, baseUrl).href,
    };
  });
}

function validCncPortDistDir(value) {
  return typeof value === "string" && /^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(value);
}

function smokePagePath() {
  const distDir = process.env.REAL_AUDIO_DIST_DIR;
  if (distDir == null || distDir === "") {
    return "harness/index.html";
  }
  expect(validCncPortDistDir(distDir), "invalid REAL_AUDIO_DIST_DIR", { distDir });
  return `harness/index.html?dist=${encodeURIComponent(distDir)}`;
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, args]) => window.CnCPort.rpc(name, args), [command, payload]);
}

async function resumeAudio(page) {
  const point = await page.evaluate(() => {
    const target = document.querySelector("#viewport");
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + Math.max(1, Math.min(rect.width - 1, rect.width / 2)),
      y: rect.top + Math.max(1, Math.min(rect.height - 1, rect.height / 2)),
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(async () => {
    const result = await window.CnCPort.rpc("browserAudioRuntime");
    return result.browserAudioRuntime?.contextState === "running"
      && result.browserAudioRuntime?.resumeSuccesses >= 1;
  });
}

function assertDecodedSample(runtime, eventName, expectedNode) {
  expect(runtime?.lastError === null, `${eventName} Web Audio runtime reported an error`, runtime);
  expect(runtime?.started > 0, `${eventName} did not start an MSS sample`, runtime);
  const last = runtime.lastEvent;
  expect(last?.payload?.container === "RIFF/WAVE"
      && last.payload.frames > 0
      && Array.isArray(last.nodeGraph)
      && last.nodeGraph.includes(expectedNode),
    `${eventName} did not schedule a decoded Web Audio buffer on ${expectedNode}`, last);
}

function assertAudibleVolume(value, eventName, payload) {
  expect(Number.isFinite(value) && value > 0,
    `${eventName} scheduled decoded audio with a silent or invalid volume`, payload);
}

async function streamRuntime(page) {
  const runtime = await rpc(page, "browserAudioRuntime");
  return runtime.state?.browserMssStreamPlaybackRuntime ?? null;
}

async function sampleRuntime(page, key) {
  const runtime = await rpc(page, "browserAudioRuntime");
  return runtime.state?.[key] ?? null;
}

async function waitForDecodedSample(page, key, expectedNode, before, timeoutMs = 15000, context = {}) {
  const start = Date.now();
  const beforeStarted = before?.started ?? 0;
  let lastRuntime = null;
  while (Date.now() - start < timeoutMs) {
    const runtime = await sampleRuntime(page, key);
    lastRuntime = runtime;
    const last = runtime?.lastEvent;
    if ((runtime?.started ?? 0) > beforeStarted
        && last?.payload?.container === "RIFF/WAVE"
        && last.payload.frames > 0
        && Array.isArray(last.nodeGraph)
        && last.nodeGraph.includes(expectedNode)) {
      return runtime;
    }
    if (runtime?.lastError) {
      throw new Error(`${key} sample decode failed: ${runtime.lastError}`);
    }
    await rpc(page, "realEngineFrameSummary", { frames: 1 });
    await page.waitForTimeout(25);
  }
  throw new Error(`${key} did not decode and start within ${timeoutMs}ms: ${JSON.stringify({
    beforeStarted,
    context,
    runtime: lastRuntime,
  })}`);
}

function assertFinitePosition(position, label, payload) {
  expect(Number.isFinite(position?.x)
      && Number.isFinite(position?.y)
      && Number.isFinite(position?.z),
    `${label} did not report a finite 3D position`, payload);
}

async function waitFor3DSpatialUpdates(page, handle, before, timeoutMs = 15000) {
  const start = Date.now();
  const beforeListener = before?.listenerAppliedUpdates ?? 0;
  const beforeSample = before?.samplePositionAppliedUpdates ?? 0;
  const sampleHandle = Number(handle);
  let lastRuntime = null;
  while (Date.now() - start < timeoutMs) {
    await rpc(page, "realEngineFrameSummary", { frames: 1 });
    const runtime = await sampleRuntime(page, "browserMss3DSamplePlaybackRuntime");
    lastRuntime = runtime;
    const listenerAdvanced = (runtime?.listenerAppliedUpdates ?? 0) > beforeListener;
    const targetSampleUpdate = (runtime?.recentSamplePositions ?? []).find((update) =>
      Number(update?.handle) === sampleHandle &&
        Number(update?.sequence ?? 0) > beforeSample);
    if (listenerAdvanced && targetSampleUpdate != null) {
      assertFinitePosition(runtime.lastListener?.position, "Miles listener update", runtime);
      assertFinitePosition(targetSampleUpdate.position, "Miles 3D sample update", runtime);
      return { ...runtime, targetSampleUpdate };
    }
    if (runtime?.lastError) {
      throw new Error(`3D spatial update failed: ${runtime.lastError}`);
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`3D spatial listener/sample updates did not arrive: ${JSON.stringify({
    handle: sampleHandle,
    beforeListener,
    beforeSample,
    runtime: lastRuntime,
  })}`);
}

async function waitFor3DListener(page, timeoutMs = 10000) {
  const start = Date.now();
  let lastRuntime = null;
  while (Date.now() - start < timeoutMs) {
    const runtime = await sampleRuntime(page, "browserMss3DSamplePlaybackRuntime");
    lastRuntime = runtime;
    if ((runtime?.listenerAppliedUpdates ?? 0) > 0) {
      assertFinitePosition(runtime.lastListener?.position, "Miles listener", runtime);
      return runtime;
    }
    await rpc(page, "realEngineFrameSummary", { frames: 1 });
    await page.waitForTimeout(25);
  }
  throw new Error(`3D listener did not update: ${JSON.stringify(lastRuntime)}`);
}

async function waitForDecodedStream(page, filename, before, label = "stream", timeoutMs = 15000) {
  const start = Date.now();
  const beforeScheduled = before?.scheduled ?? 0;
  const normalizedFilename = normalizeAudioPath(filename);
  while (Date.now() - start < timeoutMs) {
    const runtime = await streamRuntime(page);
    const decoded = runtime?.eventLog?.some((event) =>
      event.phase === "webAudioDecode"
        && normalizeAudioPath(event.filename) === normalizedFilename
        && (event.decodedFrames ?? 0) > 0);
    const scheduled = runtime?.lastEvent?.phase === "scheduled"
      && normalizeAudioPath(runtime.lastEvent.filename) === normalizedFilename
      && runtime.scheduled > beforeScheduled;
    if (decoded && scheduled) {
      return runtime;
    }
    if (runtime?.lastError) {
      throw new Error(`${filename} stream decode failed: ${runtime.lastError}`);
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`${label} ${filename} stream did not decode and schedule within ${timeoutMs}ms`);
}

function countStreamCloseEvents(runtime, handle) {
  return (runtime?.eventLog ?? []).filter((event) =>
    event.phase === "AIL_close_stream"
      && (handle == null || Number(event.handle) === Number(handle))).length;
}

async function waitForStreamStop(page, before, label = "stream", timeoutMs = 5000, handle = null) {
  const start = Date.now();
  const beforeStopped = before?.stopped ?? 0;
  const beforeHandleClosed = countStreamCloseEvents(before, handle);
  let lastRuntime = null;
  while (Date.now() - start < timeoutMs) {
    const runtime = await streamRuntime(page);
    lastRuntime = runtime;
    const stopped = handle == null
      ? (runtime?.stopped ?? 0) > beforeStopped
      : countStreamCloseEvents(runtime, handle) > beforeHandleClosed;
    if (stopped) {
      return runtime;
    }
    await rpc(page, "realEngineFrameSummary", { frames: 4 });
    await page.waitForTimeout(25);
  }
  throw new Error(`${label} did not stop within ${timeoutMs}ms: ${JSON.stringify({
    handle,
    beforeStopped,
    beforeHandleClosed,
    runtime: lastRuntime,
  })}`);
}

async function waitForStreamVolumeDrop(page, handle, before, startVolume, label = "stream", timeoutMs = 15000) {
  const start = Date.now();
  const beforeUpdates = before?.volumeUpdates ?? 0;
  const streamHandle = Number(handle);
  let lastRuntime = null;
  while (Date.now() - start < timeoutMs) {
    const runtime = await streamRuntime(page);
    lastRuntime = runtime;
    const update = runtime?.lastVolumeUpdate;
    if ((runtime?.volumeUpdates ?? 0) > beforeUpdates
        && Number(update?.handle) === streamHandle
        && Number.isFinite(update?.volume)
        && update.volume >= 0
        && update.volume < startVolume) {
      return runtime;
    }
    const targetClosed = runtime?.eventLog?.some((event) =>
      event.phase === "AIL_close_stream" && Number(event.handle) === streamHandle);
    if (targetClosed) {
      throw new Error(`${label} stream stopped before any fade volume update: ${JSON.stringify({
        handle: streamHandle,
        beforeUpdates,
        startVolume,
        runtime,
      })}`);
    }
    if (runtime?.lastError) {
      throw new Error(`${label} stream volume fade failed: ${runtime.lastError}`);
    }
    await rpc(page, "realEngineFrameSummary", { frames: 4 });
    await page.waitForTimeout(25);
  }
  throw new Error(`${label} stream volume did not fade within ${timeoutMs}ms: ${JSON.stringify({
    handle: streamHandle,
    beforeUpdates,
    startVolume,
    runtime: lastRuntime,
  })}`);
}

async function playAndMaybeStopMusicEvent(
  page,
  eventName,
  expectedFilename,
  expectedArchive,
  { stop = true } = {},
) {
  const musicBefore = await streamRuntime(page);
  const music = await rpc(page, "realEnginePlayAudioEvent", {
    name: eventName,
    positional: false,
    useViewPosition: false,
    pumpFrames: 2,
  });
  expect(music?.ok === true
      && music.result?.handleAccepted === true
      && music.result?.audioType === "AT_Music"
      && normalizeAudioPath(music.result?.filename) === normalizeAudioPath(expectedFilename),
    `${eventName} did not reach the original audio manager as music`, music);
  const musicStream = await waitForDecodedStream(
    page,
    music.result.filename,
    musicBefore,
    eventName,
  );
  expect(musicStream.lastEvent?.archive === expectedArchive
      && normalizeAudioPath(musicStream.lastEvent?.path) === normalizeAudioPath(music.result.filename)
      && musicStream.lastEvent?.payload?.extension === "mp3"
      && musicStream.lastEvent?.payload?.decodedBy === "WebAudio.decodeAudioData"
      && (musicStream.lastEvent?.payload?.decodedFrames ?? 0) > 0
      && Array.isArray(musicStream.lastEvent?.nodeGraph)
      && musicStream.lastEvent.nodeGraph.includes("musicGainNode")
      && musicStream.activeStreamHandles?.includes(musicStream.lastEvent.handle)
      && musicStream.musicSourceActive === true
      && Number.isFinite(musicStream.lastEvent?.volume)
      && musicStream.lastEvent.volume > 0,
    `${eventName} did not schedule through the browser MSS stream backend`, musicStream);

  let stoppedMusicStream = null;
  let fadedMusicStream = null;
  if (stop) {
    const stopHandle = stop === "music"
      ? AHSV_STOP_THE_MUSIC
      : stop === "musicFade"
        ? AHSV_STOP_THE_MUSIC_FADE
        : music.result.handle;
    const stopBefore = await streamRuntime(page);
    const musicStop = await rpc(page, "realEngineStopAudioEvent", {
      handle: stopHandle,
      pumpFrames: 2,
    });
    expect(musicStop?.ok === true && musicStop.result?.handle === stopHandle,
      `${eventName} stop did not reach the original audio manager`, musicStop);
    if (stop === "musicFade") {
      fadedMusicStream = await waitForStreamVolumeDrop(
        page,
        musicStream.lastEvent.handle,
        stopBefore,
        musicStream.lastEvent.volume,
        eventName,
      );
    }
    stoppedMusicStream = await waitForStreamStop(
      page,
      stopBefore,
      eventName,
      30000,
      musicStream.lastEvent.handle,
    );
  }

  return { music, musicStream, fadedMusicStream, stoppedMusicStream };
}

async function playAndStopSpeechEvent(page, eventName, expectedFilename, expectedArchive) {
  const speechBefore = await streamRuntime(page);
  const speech = await rpc(page, "realEnginePlayAudioEvent", {
    name: eventName,
    positional: false,
    useViewPosition: false,
    pumpFrames: 2,
  });
  expect(speech?.ok === true
      && speech.result?.handleAccepted === true
      && speech.result?.audioType === "AT_Streaming"
      && normalizeAudioPath(speech.result?.filename) === normalizeAudioPath(expectedFilename),
    `${eventName} did not reach the original audio manager as streaming speech`, speech);
  const speechStream = await waitForDecodedStream(
    page,
    speech.result.filename,
    speechBefore,
    eventName,
  );
  expect(speechStream.lastEvent?.archive === expectedArchive
      && normalizeAudioPath(speechStream.lastEvent?.path) === normalizeAudioPath(speech.result.filename)
      && speechStream.lastEvent?.bus === "speech"
      && speechStream.lastEvent?.payload?.extension === "wav"
      && (speechStream.lastEvent?.payload?.decodedFrames ?? 0) > 0
      && Array.isArray(speechStream.lastEvent?.nodeGraph)
      && speechStream.lastEvent.nodeGraph.includes("speechGainNode")
      && speechStream.activeSources > (speechBefore?.activeSources ?? 0)
      && Number.isFinite(speechStream.lastEvent?.volume)
      && speechStream.lastEvent.volume > 0,
    `${eventName} did not schedule through the browser MSS speech stream backend`, speechStream);

  const speechStop = await rpc(page, "realEngineStopAudioEvent", {
    handle: speech.result.handle,
    pumpFrames: 2,
  });
  expect(speechStop?.ok === true && speechStop.result?.handle === speech.result.handle,
    `${eventName} stop did not reach the original audio manager`, speechStop);
  const stoppedSpeechStream = await waitForStreamStop(
    page,
    speechStream,
    eventName,
    5000,
    speechStream.lastEvent.handle,
  );
  return { speech, speechStream, stoppedSpeechStream };
}

const server = await startStaticServer({ root: wasmRoot });
let browser;
try {
  const launchOptions = { headless: true };
  const executablePath = process.env.REAL_AUDIO_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  if (process.env.REAL_AUDIO_BROWSER_ARGS) {
    launchOptions.args = process.env.REAL_AUDIO_BROWSER_ARGS.split(/\s+/).filter(Boolean);
  }
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240000);
  page.setDefaultNavigationTimeout(240000);

  await page.goto(new URL(smokePagePath(), server.url).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

  await resumeAudio(page);
  const mixer = await rpc(page, "setBrowserAudioMixerVolumes", {
    scriptVolumes: { music: 0.4, sound: 0.6, sound3D: 0.7, speech: 0.5 },
    systemVolumes: { music: 0.4, sound: 0.6, sound3D: 0.7, speech: 0.5 },
    zoomVolume: 1,
    trigger: "real_audio_event_smoke",
  });
  expect(mixer.browserAudioMixerRuntime?.created === true
      && mixer.browserAudioMixerRuntime?.contextState === "running",
    "Web Audio mixer was not ready", mixer);

  const mount = await rpc(page, "mountArchives", {
    path: "/assets/real-audio-event",
    verifyEach: false,
    archives: buildArchives(server.url),
  });
  expect(mount?.archiveSet?.archiveCount === archiveSpecs.length,
    "real audio event smoke failed to mount runtime archives", mount?.archiveSet ?? mount);

  const init = await rpc(page, "realEngineInit", {
    runDirectory: "/assets/real-audio-event",
    shellMap: true,
  });
  expect(init?.ok === true && init?.frontier?.initReturned === true,
    "real audio event smoke failed real engine init", init?.frontier ?? init);

  await rpc(page, "realEngineFrameSummary", { frames: 2 });

  await rpc(page, "realEngineFrameSummary", { frames: 60 });
  const worldSoundBefore = await waitFor3DListener(page);
  const worldSoundPosition = worldSoundBefore.lastListener.position;
  const worldSound = await rpc(page, "realEnginePlayAudioEvent", {
    name: "ArtilleryBarrageIncomingWhistle",
    positional: true,
    useViewPosition: false,
    x: worldSoundPosition.x,
    y: worldSoundPosition.y,
    z: worldSoundPosition.z,
    pumpFrames: 2,
  });
  expect(worldSound?.ok === true
      && worldSound.result?.handleAccepted === true
      && worldSound.result?.positional === true,
    "real positional audio event did not reach the original audio manager", worldSound);
  const worldSoundRuntime = await waitForDecodedSample(
    page,
    "browserMss3DSamplePlaybackRuntime",
    "sound3DGainNode",
    worldSoundBefore,
    15000,
    { event: worldSound.result },
  );
  assertDecodedSample(
    worldSoundRuntime,
    "ArtilleryBarrageIncomingWhistle",
    "sound3DGainNode",
  );
  assertAudibleVolume(
    worldSoundRuntime.lastEvent?.sample3D?.volume,
    "ArtilleryBarrageIncomingWhistle",
    { event: worldSound.result, playback: worldSoundRuntime.lastEvent },
  );
  const worldSoundSpatial = await waitFor3DSpatialUpdates(
    page,
    worldSoundRuntime.lastEvent?.handle,
    worldSoundBefore,
  );

  const uiSoundBefore = await sampleRuntime(page, "browserMssSamplePlaybackRuntime");
  const uiSound = await rpc(page, "realEnginePlayAudioEvent", {
    name: "CIAAgentVoiceAttack",
    positional: false,
    useViewPosition: false,
    pumpFrames: 2,
  });
  expect(uiSound?.ok === true
      && uiSound.result?.handleAccepted === true
      && uiSound.result?.positional === false,
    "real 2D audio event did not reach the original audio manager", uiSound);
  const uiSoundRuntime = await waitForDecodedSample(
    page,
    "browserMssSamplePlaybackRuntime",
    "soundGainNode",
    uiSoundBefore,
    15000,
    { event: uiSound.result },
  );
  assertDecodedSample(
    uiSoundRuntime,
    "CIAAgentVoiceAttack",
    "soundGainNode",
  );
  assertAudibleVolume(
    uiSoundRuntime.lastEvent?.sample?.volume,
    "CIAAgentVoiceAttack",
    { event: uiSound.result, playback: uiSoundRuntime.lastEvent },
  );

  const speech = await playAndStopSpeechEvent(
    page,
    "MisGLA01Scorpion105",
    "Data\\Audio\\Speech\\English\\mg1sc105.wav",
    "SpeechEnglishZH.big",
  );

  const zhMusic = await playAndMaybeStopMusicEvent(
    page,
    "Game_USA_10",
    "Data\\Audio\\Tracks\\USA_10.mp3",
    "MusicZH.big",
    { stop: "musicFade" },
  );
  const baseMusic = await playAndMaybeStopMusicEvent(
    page,
    "Game_USA_01",
    "Data\\Audio\\Tracks\\USA_01.mp3",
    "ZZBase_Music.big",
    { stop: false },
  );

  console.log(JSON.stringify({
    ok: true,
    worldSound: {
      event: worldSound.result.requested,
      filename: worldSound.result.filename,
      handle: worldSound.result.handle,
      nodeGraph: worldSoundRuntime.lastEvent.nodeGraph,
      frames: worldSoundRuntime.lastEvent.payload.frames,
      volume: worldSoundRuntime.lastEvent.sample3D.volume,
      listenerAppliedUpdates: worldSoundSpatial.listenerAppliedUpdates,
      samplePositionAppliedUpdates: worldSoundSpatial.samplePositionAppliedUpdates,
      listenerPosition: worldSoundSpatial.lastListener?.position ?? null,
      samplePosition: worldSoundSpatial.targetSampleUpdate?.position ?? null,
    },
    uiSound: {
      event: uiSound.result.requested,
      filename: uiSound.result.filename,
      handle: uiSound.result.handle,
      nodeGraph: uiSoundRuntime.lastEvent.nodeGraph,
      frames: uiSoundRuntime.lastEvent.payload.frames,
      volume: uiSoundRuntime.lastEvent.sample.volume,
    },
    speech: {
      event: speech.speech.result.requested,
      filename: speech.speech.result.filename,
      handle: speech.speech.result.handle,
      archive: speech.speechStream.lastEvent.archive,
      bus: speech.speechStream.lastEvent.bus,
      decodedBy: speech.speechStream.lastEvent.payload.decodedBy,
      decodedFrames: speech.speechStream.lastEvent.payload.decodedFrames,
      durationSeconds: speech.speechStream.lastEvent.durationSeconds,
      volume: speech.speechStream.lastEvent.volume,
      nodeGraph: speech.speechStream.lastEvent.nodeGraph,
      stopped: speech.stoppedSpeechStream?.stopped ?? null,
      activeSourcesAfterStop: speech.stoppedSpeechStream?.activeSources ?? null,
    },
    zhMusic: {
      event: zhMusic.music.result.requested,
      filename: zhMusic.music.result.filename,
      handle: zhMusic.music.result.handle,
      archive: zhMusic.musicStream.lastEvent.archive,
      decodedBy: zhMusic.musicStream.lastEvent.payload.decodedBy,
      decodedFrames: zhMusic.musicStream.lastEvent.payload.decodedFrames,
      durationSeconds: zhMusic.musicStream.lastEvent.durationSeconds,
      volume: zhMusic.musicStream.lastEvent.volume,
      fadedVolume: zhMusic.fadedMusicStream?.lastVolumeUpdate?.volume ?? null,
      volumeUpdates: zhMusic.fadedMusicStream?.volumeUpdates ?? null,
      nodeGraph: zhMusic.musicStream.lastEvent.nodeGraph,
      stopped: zhMusic.stoppedMusicStream?.stopped ?? null,
      activeSourcesAfterStop: zhMusic.stoppedMusicStream?.activeSources ?? null,
    },
    baseMusic: {
      event: baseMusic.music.result.requested,
      filename: baseMusic.music.result.filename,
      handle: baseMusic.music.result.handle,
      archive: baseMusic.musicStream.lastEvent.archive,
      decodedBy: baseMusic.musicStream.lastEvent.payload.decodedBy,
      decodedFrames: baseMusic.musicStream.lastEvent.payload.decodedFrames,
      durationSeconds: baseMusic.musicStream.lastEvent.durationSeconds,
      volume: baseMusic.musicStream.lastEvent.volume,
      nodeGraph: baseMusic.musicStream.lastEvent.nodeGraph,
      stopped: baseMusic.stoppedMusicStream?.stopped ?? null,
      activeSourcesAfterStop: baseMusic.stoppedMusicStream?.activeSources ?? null,
    },
  }, null, 2));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
