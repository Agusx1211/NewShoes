#!/usr/bin/env node
import { spawnSync } from "node:child_process";
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

const requestTarget = {
  cacheKey: "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav",
  eventName: "CIAAgentVoiceAttack",
  audioType: "AT_SoundEffect",
  deviceStart: "playSample",
  playingType: "PAT_Sample",
  bus: "sound",
};

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveRoot = resolve(wasmRoot, process.argv[2] ?? "artifacts/real-assets");

function expect(condition, message, payload) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(payload)}`);
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
      // Continue scanning upward; build/test output can contain earlier JSON.
    }
  }
  throw new Error(`${label} did not emit a JSON result`);
}

function runOriginalMilesManagerSmoke() {
  const executable = resolve(wasmRoot, "dist/miles-audio-play-sample-smoke.cjs");
  const result = spawnSync(process.execPath, [executable], {
    cwd: wasmRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`miles-audio-play-sample-smoke failed: ${result.stderr || result.stdout}`);
  }
  const payload = extractJson(result.stdout, "miles-audio-play-sample-smoke");
  expect(payload.ok === true
      && payload.path === "MilesAudioManager::processRequest->playAudioEvent->playSample"
      && payload.request === "AR_Play"
      && payload.event === "PortSmoke2D"
      && payload.filename === "Data\\Audio\\Sounds\\PortSmoke.wav"
      && payload.sample?.statusAfterStart === 2
      && payload.sample?.statusAfterEnd === 1
      && payload.sample?.browserPlaybackRequested === false
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
    "original MilesAudioManager sample leg mismatch", payload);
  return payload;
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function toUrlPath(path) {
  return relative(wasmRoot, path).split(sep).join("/");
}

async function archiveInputFor(path, name) {
  expect(isInside(wasmRoot, path), `${name} must be inside the wasm root`, { path, wasmRoot });
  const fileStat = await stat(path);
  expect(fileStat.isFile() && fileStat.size > 0, `${name} is not a readable archive`, {
    path,
    size: fileStat.size,
  });
  return {
    name,
    sourceName: name,
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
  return archives;
}

async function resumeAudio(page) {
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
      && runtime?.lastResumeTrigger === "canvas.pointerdown";
  }, null, { timeout: 5000 });
}

function assertBrowserMssPlayback(result) {
  const runtime = result.browserMssSamplePlaybackRuntime;
  expect(result.ok === true
      && result.startProbe?.source === "Mss.H browser 2D sample Web Audio playback start probe"
      && result.startProbe?.sample?.browserStartRequested === true
      && result.startProbe?.payload?.codec === "PCM"
      && result.startProbe?.payload?.sampleRate === 44100
      && result.startProbe?.payload?.channels === 2
      && result.finishProbe?.source === "Mss.H browser 2D sample Web Audio playback finish probe"
      && result.finishProbe?.sample?.browserEndRequested === true
      && result.finishProbe?.sample?.browserReleaseRequested === true
      && runtime?.runtimePlayback === true
      && runtime.mssDriven === true
      && runtime.completed === 1
      && runtime.ended === 1
      && runtime.released === 1
      && runtime.lastEvent?.webAudioNode === "AudioBufferSourceNode"
      && runtime.lastEvent?.completion?.callback === "AudioBufferSourceNode.onended",
    "browser MSS Web Audio playback mismatch", result);
}

function assertRequestPath(result) {
  const requestPath = result.browserAudioRequestPathRuntime;
  const event = requestPath?.lastEvent;
  expect(result.ok === true
      && requestPath?.ready === true
      && requestPath.runtimePlayback === true
      && requestPath.sourcePathDriven === true
      && requestPath.engineDriven === false
      && requestPath.completed === 1
      && requestPath.released === 1
      && event?.cacheKey === requestTarget.cacheKey
      && event.eventName === requestTarget.eventName
      && event.common?.function === "AudioManager::addAudioEvent"
      && event.request?.request === "AR_Play"
      && event.drain?.requestList === "MilesAudioManager::processRequestList"
      && event.drain?.dispatch === "MilesAudioManager::processRequest"
      && event.playback?.deviceStart === requestTarget.deviceStart
      && event.playback?.playingType === requestTarget.playingType
      && event.playback?.bus === requestTarget.bus
      && event.playback?.webAudioNode === "AudioBufferSourceNode"
      && event.callback?.completionCall === "notifyOfAudioCompletion"
      && event.completion?.releaseAudioEventRTS === true,
    "browser source-shaped audio request path mismatch", result);
}

const originalMilesManager = runOriginalMilesManagerSmoke();
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
    "combined audio smoke did not mount runtime archives", mountResult);

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "browser audio Miles/WebAudio vertical smoke",
  }));
  expect(bootResult.ok === true
      && bootResult.state?.wasm === "loaded"
      && bootResult.state?.booted === true
      && bootResult.state?.browserAudioRequestPathRuntime?.cacheEntries === 5,
    "combined audio smoke did not boot with requested audio cache", bootResult);

  await resumeAudio(page);

  const browserMssPlayback = await page.evaluate(() =>
    window.CnCPort.rpc("mssSamplePlaybackProbe"));
  assertBrowserMssPlayback(browserMssPlayback);

  const requestPathResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("playBrowserAudioRequestPathEvent", payload), {
    cacheKey: requestTarget.cacheKey,
    durationSeconds: 0.05,
  });
  assertRequestPath(requestPathResult);

  const browserFailures = browserEvents.filter((event) => event.type === "pageerror" || event.type === "crash");
  expect(browserFailures.length === 0, "browser emitted an error during combined audio smoke", browserFailures);

  console.log(JSON.stringify({
    ok: true,
    path: "browser-audio-miles-webaudio-vertical",
    harnessUrl,
    archiveCount: archives.length,
    originalMilesManager: {
      path: originalMilesManager.path,
      event: originalMilesManager.event,
      filename: originalMilesManager.filename,
      sample: originalMilesManager.sample,
      wav: originalMilesManager.wav,
      manager: originalMilesManager.manager,
    },
    browserMssSamplePlayback: {
      source: browserMssPlayback.startProbe.source,
      runtimePlayback: browserMssPlayback.browserMssSamplePlaybackRuntime.runtimePlayback,
      completed: browserMssPlayback.browserMssSamplePlaybackRuntime.completed,
      released: browserMssPlayback.browserMssSamplePlaybackRuntime.released,
      webAudioNode: browserMssPlayback.browserMssSamplePlaybackRuntime.lastEvent?.webAudioNode,
      completionCallback: browserMssPlayback.browserMssSamplePlaybackRuntime.lastEvent?.completion?.callback,
    },
    requestPath: {
      source: requestPathResult.browserAudioRequestPathRuntime.source,
      sourcePathDriven: requestPathResult.browserAudioRequestPathRuntime.sourcePathDriven,
      engineDriven: requestPathResult.browserAudioRequestPathRuntime.engineDriven,
      completed: requestPathResult.browserAudioRequestPathRuntime.completed,
      released: requestPathResult.browserAudioRequestPathRuntime.released,
      eventName: requestTarget.eventName,
      cacheKey: requestTarget.cacheKey,
      audioType: requestTarget.audioType,
      deviceStart: requestTarget.deviceStart,
      playingType: requestTarget.playingType,
      bus: requestTarget.bus,
    },
    nextRequired: "sameRuntimeMilesAudioManagerWebAudioBackend",
    browserEventCount: browserEvents.length,
    browserFailures,
  }));
} finally {
  await browser?.close();
  await server.close();
}
