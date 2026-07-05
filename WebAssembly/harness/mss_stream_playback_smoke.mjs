#!/usr/bin/env node
import { stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(wasmRoot, process.argv[2] ?? "artifacts/real-assets");
const musicArchive = resolve(archiveRoot, "base-generals/Music.big");
const musicTrack = "Data\\Audio\\Tracks\\USA_01.mp3";

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
  }
}

function toUrlPath(path) {
  return relative(wasmRoot, path).split(sep).join("/");
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

const server = await startStaticServer({ root: wasmRoot });
let browser;
try {
  const archiveStat = await stat(musicArchive);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.setDefaultTimeout(120000);
  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.CnCPort?.rpc);

  const mount = await rpc(page, "mountArchives", {
    path: "/assets/mss-stream",
    verifyEach: false,
    archives: [{
      name: "Music.big",
      sourceName: "base-generals/Music.big",
      url: new URL(toUrlPath(musicArchive), server.url).href,
      expectedBytes: archiveStat.size,
    }],
  });
  expect(mount.ok === true && mount.archiveSet?.archiveCount === 1,
    "Music.big archive mount failed", mount);

  await resumeAudio(page);
  const mixer = await rpc(page, "setBrowserAudioMixerVolumes", {
    scriptVolumes: { music: 0.5, sound: 0.5, sound3D: 0.5, speech: 0.5 },
    systemVolumes: { music: 0.5, sound: 0.5, sound3D: 0.5, speech: 0.5 },
    zoomVolume: 1,
    trigger: "mss_stream_playback_smoke",
  });
  expect(mixer.browserAudioMixerRuntime?.created === true
      && mixer.browserAudioMixerRuntime?.contextState === "running",
    "Web Audio mixer was not created", mixer);

  const playback = await rpc(page, "mssStreamPlaybackProbe", {
    archive: "Music.big",
    path: musicTrack,
    stopAfterStart: true,
  });
  expect(playback.ok === true, "MSS stream playback probe failed", playback);
  expect(playback.afterStart?.lastEvent?.payload?.decodedBy === "WebAudio.decodeAudioData"
      && playback.afterStart?.lastEvent?.payload?.extension === "mp3"
      && playback.afterStart?.lastEvent?.payload?.decodedFrames > 0
      && playback.afterStart?.activeSources === 1
      && playback.afterStop?.activeSources === 0,
    "MSS stream playback proof did not schedule and stop MP3 stream", playback);

  console.log(JSON.stringify({
    ok: true,
    archive: "Music.big",
    path: musicTrack,
    decodedBy: playback.afterStart.lastEvent.payload.decodedBy,
    codec: playback.afterStart.lastEvent.payload.codec,
    decodedFrames: playback.afterStart.lastEvent.payload.decodedFrames,
    durationSeconds: playback.afterStart.lastEvent.durationSeconds,
    stopped: playback.afterStop.stopped,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
