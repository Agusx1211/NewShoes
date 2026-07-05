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
  assertDecodedSample(
    worldSound.browserMss3DSamplePlaybackRuntime,
    "ArtilleryBarrageIncomingWhistle",
    "sound3DGainNode",
  );

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
  assertDecodedSample(
    uiSound.browserMssSamplePlaybackRuntime,
    "CIAAgentVoiceAttack",
    "soundGainNode",
  );

  console.log(JSON.stringify({
    ok: true,
    worldSound: {
      event: worldSound.result.requested,
      filename: worldSound.result.filename,
      handle: worldSound.result.handle,
      nodeGraph: worldSound.browserMss3DSamplePlaybackRuntime.lastEvent.nodeGraph,
      frames: worldSound.browserMss3DSamplePlaybackRuntime.lastEvent.payload.frames,
    },
    uiSound: {
      event: uiSound.result.requested,
      filename: uiSound.result.filename,
      handle: uiSound.result.handle,
      nodeGraph: uiSound.browserMssSamplePlaybackRuntime.lastEvent.nodeGraph,
      frames: uiSound.browserMssSamplePlaybackRuntime.lastEvent.payload.frames,
    },
  }, null, 2));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
