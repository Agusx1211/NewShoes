#!/usr/bin/env node
// Objective verification for the SFX/speech "leaked voice handle" fix: play a
// non-looping sound far more times than the sample pool size and confirm the
// pool recycles (completed/ended tracks started, activeSources stays bounded)
// instead of exhausting after the first pool-full of plays.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const EVENT = process.env.AUDIO_POOL_EVENT ?? "ArtilleryBarrageIncomingWhistle";
const PLAYS = Number(process.env.AUDIO_POOL_PLAYS ?? 48);

const archiveSpecs = [
  "INIZH.big","EnglishZH.big","WindowZH.big","MapsZH.big","MusicZH.big","GensecZH.big",
  "TerrainZH.big","TexturesZH.big","W3DZH.big","W3DEnglishZH.big","SpeechZH.big",
  "SpeechEnglishZH.big","AudioZH.big","AudioEnglishZH.big","ShadersZH.big",
].map((name) => ({ name })).concat([
  { name: "ZZBase_INI.big", sourceName: "INI.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "ZZBase_Audio.big", sourceName: "base-generals/Audio.big" },
  { name: "ZZBase_AudioEnglish.big", sourceName: "base-generals/AudioEnglish.big" },
  { name: "ZZBase_Speech.big", sourceName: "base-generals/Speech.big" },
  { name: "ZZBase_SpeechEnglish.big", sourceName: "base-generals/SpeechEnglish.big" },
  { name: "Gensec.big" },
]);

function buildArchives(baseUrl) {
  return archiveSpecs.map((spec) => ({
    name: spec.name,
    sourceName: spec.sourceName ?? spec.name,
    url: new URL(`artifacts/real-assets/${spec.sourceName ?? spec.name}`, baseUrl).href,
  }));
}
async function rpc(page, command, payload = {}) {
  return page.evaluate(([n, a]) => window.CnCPort.rpc(n, a), [command, payload]);
}

const server = await startStaticServer({ root: wasmRoot });
let browser;
try {
  const launchOptions = { headless: true };
  if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
  if (process.env.AUDIO_POOL_BROWSER_ARGS) launchOptions.args = process.env.AUDIO_POOL_BROWSER_ARGS.split(/\s+/).filter(Boolean);
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  page.setDefaultTimeout(240000);
  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
  await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));

  const mount = await rpc(page, "mountArchives", { path: "/assets/audio-pool", verifyEach: false, archives: buildArchives(server.url) });
  if (mount?.archiveSet?.archiveCount !== archiveSpecs.length) throw new Error("mount failed: " + JSON.stringify(mount?.archiveSet ?? mount));
  const init = await rpc(page, "realEngineInit", { runDirectory: "/assets/audio-pool", shellMap: true });
  if (!(init?.ok && init?.frontier?.initReturned)) throw new Error("init failed: " + JSON.stringify(init?.frontier ?? init));
  await rpc(page, "realEngineFrameSummary", { frames: 8 });
  // Best-effort resume of the Web Audio context so buffer sources actually run + end.
  await page.evaluate(() => { try { window.CnCPort?.resumeAudio?.(); (window.__cncAudioContext||window.audioContext)?.resume?.(); } catch (_e) {} });

  let last = null;
  const samples = [];
  for (let i = 0; i < PLAYS; i++) {
    last = await rpc(page, "realEnginePlayAudioEvent", { name: EVENT, forceOn: true, positional: false, pumpFrames: 3 });
    const s = last?.browserMssSamplePlaybackRuntime ?? {};
    if (i % 8 === 0 || i === PLAYS - 1) samples.push({ i, started: s.started, completed: s.completed, ended: s.ended, active: (s.activeSources ?? s.active ?? null) });
  }
  const s2d = last?.browserMssSamplePlaybackRuntime ?? {};
  const s3d = last?.browserMss3DSamplePlaybackRuntime ?? {};
  const dev = last?.audioDeviceState?.result ?? last?.audioDeviceState ?? null;
  let deviceState = null;
  try { deviceState = JSON.parse((await rpc(page, "audioDeviceState"))?.result ?? "null") ?? dev; } catch (_e) { deviceState = dev; }
  const out = {
    event: EVENT, plays: PLAYS,
    deviceState: deviceState ? {
      poolsAllocated: deviceState.poolsAllocated, num2DSamples: deviceState.num2DSamples, num3DSamples: deviceState.num3DSamples,
      providerOpen: deviceState.providerOpen, selectedProviderName: deviceState.selectedProviderName,
      playPath: deviceState.playPath ?? null,
    } : "unavailable",
    sample2D: { started: s2d.started, completed: s2d.completed, ended: s2d.ended, stopped: s2d.stopped, released: s2d.released, active: s2d.activeSources ?? s2d.active },
    sample3D: { started: s3d.started, completed: s3d.completed, ended: s3d.ended, active: s3d.activeSources ?? s3d.active },
    progression: samples,
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}
