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

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
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

async function streamRuntime(page) {
  const runtime = await rpc(page, "browserAudioRuntime");
  return runtime.state?.browserMssStreamPlaybackRuntime ?? null;
}

async function sampleRuntime(page, key) {
  const runtime = await rpc(page, "browserAudioRuntime");
  return runtime.state?.[key] ?? null;
}

async function waitForDecodedSample(page, key, expectedNode, before, timeoutMs = 10000) {
  const start = Date.now();
  const beforeStarted = before?.started ?? 0;
  while (Date.now() - start < timeoutMs) {
    const runtime = await sampleRuntime(page, key);
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
  throw new Error(`${key} did not decode and start within ${timeoutMs}ms`);
}

async function waitForDecodedMusicStream(page, filename, before, timeoutMs = 15000) {
  const start = Date.now();
  const beforeScheduled = before?.scheduled ?? 0;
  while (Date.now() - start < timeoutMs) {
    const runtime = await streamRuntime(page);
    const decoded = runtime?.eventLog?.some((event) =>
      event.phase === "webAudioDecode"
        && event.filename === filename
        && event.decodedBy === "WebAudio.decodeAudioData"
        && (event.decodedFrames ?? 0) > 0);
    const scheduled = runtime?.lastEvent?.phase === "scheduled"
      && runtime.lastEvent.filename === filename
      && runtime.scheduled > beforeScheduled;
    if (decoded && scheduled) {
      return runtime;
    }
    if (runtime?.lastError) {
      throw new Error(`${filename} stream decode failed: ${runtime.lastError}`);
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`${filename} stream did not decode and schedule within ${timeoutMs}ms`);
}

async function waitForMusicStreamStop(page, before, timeoutMs = 5000) {
  const start = Date.now();
  const beforeStopped = before?.stopped ?? 0;
  while (Date.now() - start < timeoutMs) {
    const runtime = await streamRuntime(page);
    if ((runtime?.stopped ?? 0) > beforeStopped) {
      return runtime;
    }
    await rpc(page, "realEngineFrameSummary", { frames: 1 });
    await page.waitForTimeout(50);
  }
  throw new Error(`music stream did not stop within ${timeoutMs}ms`);
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
      && music.result?.filename === expectedFilename,
    `${eventName} did not reach the original audio manager as music`, music);
  const musicStream = await waitForDecodedMusicStream(
    page,
    music.result.filename,
    musicBefore,
  );
  expect(musicStream.lastEvent?.archive === expectedArchive
      && musicStream.lastEvent?.path === music.result.filename
      && musicStream.lastEvent?.payload?.extension === "mp3"
      && musicStream.lastEvent?.payload?.decodedBy === "WebAudio.decodeAudioData"
      && (musicStream.lastEvent?.payload?.decodedFrames ?? 0) > 0
      && Array.isArray(musicStream.lastEvent?.nodeGraph)
      && musicStream.lastEvent.nodeGraph.includes("musicGainNode")
      && musicStream.activeSources > (musicBefore?.activeSources ?? 0)
      && musicStream.musicSourceActive === true
      && Number.isFinite(musicStream.lastEvent?.volume),
    `${eventName} did not schedule through the browser MSS stream backend`, musicStream);

  let stoppedMusicStream = null;
  if (stop) {
    const stopHandle = stop === "music" ? AHSV_STOP_THE_MUSIC : music.result.handle;
    const musicStop = await rpc(page, "realEngineStopAudioEvent", {
      handle: stopHandle,
      pumpFrames: 2,
    });
    expect(musicStop?.ok === true && musicStop.result?.handle === stopHandle,
      `${eventName} stop did not reach the original audio manager`, musicStop);
    stoppedMusicStream = await waitForMusicStreamStop(page, musicStream);
  }

  return { music, musicStream, stoppedMusicStream };
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

  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
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

  const worldSoundBefore = await sampleRuntime(page, "browserMss3DSamplePlaybackRuntime");
  const worldSound = await rpc(page, "realEnginePlayAudioEvent", {
    name: "ArtilleryBarrageIncomingWhistle",
    positional: true,
    useViewPosition: true,
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
  );
  assertDecodedSample(
    worldSoundRuntime,
    "ArtilleryBarrageIncomingWhistle",
    "sound3DGainNode",
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
  );
  assertDecodedSample(
    uiSoundRuntime,
    "CIAAgentVoiceAttack",
    "soundGainNode",
  );

  const zhMusic = await playAndMaybeStopMusicEvent(
    page,
    "Game_USA_10",
    "Data\\Audio\\Tracks\\USA_10.mp3",
    "MusicZH.big",
    { stop: "music" },
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
    },
    uiSound: {
      event: uiSound.result.requested,
      filename: uiSound.result.filename,
      handle: uiSound.result.handle,
      nodeGraph: uiSoundRuntime.lastEvent.nodeGraph,
      frames: uiSoundRuntime.lastEvent.payload.frames,
    },
    zhMusic: {
      event: zhMusic.music.result.requested,
      filename: zhMusic.music.result.filename,
      handle: zhMusic.music.result.handle,
      archive: zhMusic.musicStream.lastEvent.archive,
      decodedBy: zhMusic.musicStream.lastEvent.payload.decodedBy,
      decodedFrames: zhMusic.musicStream.lastEvent.payload.decodedFrames,
      durationSeconds: zhMusic.musicStream.lastEvent.durationSeconds,
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
