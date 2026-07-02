#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
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

// Real shipped IMA ADPCM payloads (mono and stereo) exercised through the
// original AudioFileCache::openFile -> AIL_WAV_info -> AIL_decompress_ADPCM
// branch and cross-checked sample-exactly against independent decoders.
const adpcmTargets = [
  { label: "mono", archive: "AudioZH.big", path: "Data\\Audio\\Sounds\\bairatta.wav", channels: 1 },
  { label: "stereo", archive: "AudioZH.big", path: "Data\\Audio\\Sounds\\cleftria.wav", channels: 2 },
];

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

function runOriginalMilesManagerSmoke(adpcmInputPath = null, adpcmDumpPath = null) {
  const executable = resolve(wasmRoot, "dist/miles-audio-play-sample-smoke.cjs");
  const args = [executable];
  if (adpcmInputPath) {
    args.push("--adpcm", adpcmInputPath, "--adpcm-dump", adpcmDumpPath);
  }
  const result = spawnSync(process.execPath, args, {
    cwd: wasmRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`miles-audio-play-sample-smoke failed: ${result.stderr || result.stdout}`);
  }
  const payload = extractJson(result.stdout, "miles-audio-play-sample-smoke");
  const expectedReleases = adpcmInputPath ? 2 : 1;
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
      && payload.manager?.audioEventReleases === expectedReleases
      && (adpcmInputPath ? payload.adpcm !== null : payload.adpcm === null),
    "original MilesAudioManager sample leg mismatch", payload);
  return payload;
}

// ---------------------------------------------------------------------------
// Real IMA ADPCM payload extraction + independent reference decoding
// ---------------------------------------------------------------------------

async function readBigRange(file, position, length, context) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  expect(bytesRead === length, `${context}: short BIG read`, { position, length, bytesRead });
  return buffer;
}

async function extractBigEntry(archivePath, entryPath) {
  const file = await open(archivePath, "r");
  try {
    const fileStat = await file.stat();
    const header = await readBigRange(file, 0, 16, archivePath);
    expect(header.toString("ascii", 0, 4) === "BIGF", "not a BIGF archive", { archivePath });
    const entryCount = header.readUInt32BE(8);
    let directory = Buffer.alloc(0);
    async function ensureDirectory(required) {
      while (directory.length < required) {
        const start = 0x10 + directory.length;
        const length = Math.min(64 * 1024, fileStat.size - start);
        expect(length > 0, "BIG directory ended early", { archivePath });
        directory = Buffer.concat([directory, await readBigRange(file, start, length, archivePath)]);
      }
    }
    let cursor = 0;
    const wanted = entryPath.toLowerCase();
    for (let index = 0; index < entryCount; ++index) {
      await ensureDirectory(cursor + 9);
      const offset = directory.readUInt32BE(cursor);
      const size = directory.readUInt32BE(cursor + 4);
      let end = directory.indexOf(0, cursor + 8);
      while (end < 0) {
        await ensureDirectory(directory.length + 1);
        end = directory.indexOf(0, cursor + 8);
      }
      const path = directory.toString("ascii", cursor + 8, end);
      if (path.toLowerCase() === wanted) {
        return readBigRange(file, offset, size, `${archivePath}|${entryPath}`);
      }
      cursor = end + 1;
    }
    throw new Error(`entry ${entryPath} not found in ${archivePath}`);
  } finally {
    await file.close();
  }
}

function parseWavChunks(bytes) {
  expect(bytes.length >= 12
      && bytes.toString("ascii", 0, 4) === "RIFF"
      && bytes.toString("ascii", 8, 12) === "WAVE",
    "payload is not a RIFF/WAVE file", { length: bytes.length });
  const chunks = {};
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    chunks[id] = { offset: offset + 8, size };
    offset += 8 + size + (size & 1);
  }
  const fmt = chunks["fmt "];
  expect(Boolean(fmt) && Boolean(chunks.data), "WAV is missing fmt/data chunks", { chunks: Object.keys(chunks) });
  return {
    wFormatTag: bytes.readUInt16LE(fmt.offset),
    channels: bytes.readUInt16LE(fmt.offset + 2),
    rate: bytes.readUInt32LE(fmt.offset + 4),
    blockAlign: bytes.readUInt16LE(fmt.offset + 12),
    bits: bytes.readUInt16LE(fmt.offset + 14),
    factSamples: chunks.fact && chunks.fact.size >= 4 ? bytes.readUInt32LE(chunks.fact.offset) : null,
    dataOffset: chunks.data.offset,
    dataBytes: chunks.data.size,
  };
}

// Independent reference IMA ADPCM decoder, written separately from the
// Mss.H shim implementation: per-channel deque decode, then interleave.
// Uses the full-precision (2*delta+1)*step/8 nibble expansion (Microsoft ACM
// IMA behavior; ffmpeg-adpcm_ima_wav-exact).
const referenceImaStepTable = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
];
const referenceImaIndexTable = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

function referenceDecodeImaAdpcm(bytes) {
  const info = parseWavChunks(bytes);
  expect(info.wFormatTag === 17 && info.bits === 4, "reference decoder expects IMA ADPCM", info);
  const channels = info.channels;
  const headerBytes = channels * 4;
  const framesPerFullBlock = Math.floor(((info.blockAlign - headerBytes) * 2) / channels) + 1;

  let capacity = 0;
  for (let pos = 0; pos + headerBytes <= info.dataBytes; pos += info.blockAlign) {
    const avail = Math.min(info.blockAlign, info.dataBytes - pos);
    capacity += Math.floor(((avail - headerBytes) * 2) / channels) + 1;
    if (avail < info.blockAlign) {
      break;
    }
  }
  const totalFrames = info.factSamples !== null ? Math.min(info.factSamples, capacity) : capacity;
  const interleaved = new Int16Array(totalFrames * channels);

  let framesDone = 0;
  for (let pos = 0; pos + headerBytes <= info.dataBytes && framesDone < totalFrames;
    pos += info.blockAlign) {
    const avail = Math.min(info.blockAlign, info.dataBytes - pos);
    const base = info.dataOffset + pos;
    const perChannel = [];
    const state = [];
    for (let channel = 0; channel < channels; ++channel) {
      const predictor = bytes.readInt16LE(base + channel * 4);
      const index = Math.min(88, Math.max(0, bytes[base + channel * 4 + 2]));
      state.push({ predictor, index });
      perChannel.push([predictor]);
    }
    let cursor = base + headerBytes;
    const blockEnd = base + avail;
    while (cursor < blockEnd) {
      for (let channel = 0; channel < channels && cursor < blockEnd; ++channel) {
        for (let i = 0; i < 4 && cursor < blockEnd; ++i, ++cursor) {
          const byte = bytes[cursor];
          for (const nibble of [byte & 0x0f, byte >> 4]) {
            const channelState = state[channel];
            const step = referenceImaStepTable[channelState.index];
            const diff = ((2 * (nibble & 7) + 1) * step) >> 3;
            channelState.predictor = Math.min(32767, Math.max(-32768,
              channelState.predictor + ((nibble & 8) !== 0 ? -diff : diff)));
            channelState.index = Math.min(88, Math.max(0,
              channelState.index + referenceImaIndexTable[nibble]));
            perChannel[channel].push(channelState.predictor);
          }
        }
      }
    }
    const blockFrames = Math.min(framesPerFullBlock,
      Math.floor(((avail - headerBytes) * 2) / channels) + 1,
      totalFrames - framesDone);
    for (let frame = 0; frame < blockFrames; ++frame) {
      for (let channel = 0; channel < channels; ++channel) {
        interleaved[(framesDone + frame) * channels + channel] = perChannel[channel][frame];
      }
    }
    framesDone += blockFrames;
  }
  return { info, samples: interleaved, frames: totalFrames };
}

function readPcm16WavSamples(bytes) {
  const info = parseWavChunks(bytes);
  expect(info.wFormatTag === 1 && info.bits === 16, "expected a 16-bit PCM WAV", info);
  const samples = new Int16Array(Math.floor(info.dataBytes / 2));
  for (let i = 0; i < samples.length; ++i) {
    samples[i] = bytes.readInt16LE(info.dataOffset + i * 2);
  }
  return { info, samples };
}

function compareSamples(actual, reference, label) {
  expect(actual.length === reference.length, `${label}: decoded sample count mismatch`, {
    actual: actual.length,
    reference: reference.length,
  });
  let diffCount = 0;
  let maxAbsDiff = 0;
  let firstDiffIndex = -1;
  for (let i = 0; i < actual.length; ++i) {
    const diff = Math.abs(actual[i] - reference[i]);
    if (diff > 0) {
      diffCount += 1;
      if (firstDiffIndex < 0) {
        firstDiffIndex = i;
      }
      if (diff > maxAbsDiff) {
        maxAbsDiff = diff;
      }
    }
  }
  return { compared: actual.length, diffCount, maxAbsDiff, firstDiffIndex };
}

function ffmpegAvailable() {
  return spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
}

async function ffmpegDecodeToPcm16(inputPath, rawPath) {
  const result = spawnSync("ffmpeg", [
    "-v", "error", "-y", "-i", inputPath, "-f", "s16le", "-acodec", "pcm_s16le", rawPath,
  ], { encoding: "utf8" });
  expect(result.status === 0, "ffmpeg reference decode failed", { stderr: result.stderr });
  const raw = await readFile(rawPath);
  return new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
}

async function runAdpcmDecodeLeg(target, scratchDir, useFfmpeg) {
  const sourcePath = resolve(scratchDir, `${target.label}-source.wav`);
  const dumpPath = resolve(scratchDir, `${target.label}-decoded.wav`);
  const sourceBytes = await extractBigEntry(resolve(archiveRoot, target.archive), target.path);
  await writeFile(sourcePath, sourceBytes);

  const sourceInfo = parseWavChunks(sourceBytes);
  expect(sourceInfo.wFormatTag === 17 && sourceInfo.channels === target.channels,
    `real payload shape mismatch for ${target.label}`, sourceInfo);

  // Engine path: original MilesAudioManager processRequest -> playAudioEvent ->
  // playSample over AudioFileCache::openFile's real ADPCM decode branch.
  const smoke = runOriginalMilesManagerSmoke(sourcePath, dumpPath);
  const adpcm = smoke.adpcm;
  const expectedDataBytes = sourceInfo.factSamples * sourceInfo.channels * 2;
  expect(adpcm?.source?.format === 17
      && adpcm.source.channels === target.channels
      && adpcm.source.rate === sourceInfo.rate
      && adpcm.source.blockSize === sourceInfo.blockAlign
      && adpcm.source.frames === sourceInfo.factSamples
      && adpcm.decoded?.format === 1
      && adpcm.decoded.bits === 16
      && adpcm.decoded.channels === target.channels
      && adpcm.decoded.rate === sourceInfo.rate
      && adpcm.decoded.frames === sourceInfo.factSamples
      && adpcm.decoded.dataBytes === expectedDataBytes
      && adpcm.decoded.expectedDataBytes === expectedDataBytes
      && adpcm.decoded.waveBytes === 44 + expectedDataBytes
      && adpcm.decoded.nonZeroSamples > 0
      && adpcm.decoded.dumped === true,
    `engine ADPCM decode leg mismatch for ${target.label}`, smoke);

  // Correctness: decoded PCM from the wasm Miles boundary must be
  // sample-exact against an independent reference decode.
  const decodedWav = readPcm16WavSamples(await readFile(dumpPath));
  expect(decodedWav.info.channels === target.channels
      && decodedWav.info.rate === sourceInfo.rate
      && decodedWav.samples.length === sourceInfo.factSamples * target.channels,
    `dumped decoded WAV shape mismatch for ${target.label}`, decodedWav.info);

  const reference = referenceDecodeImaAdpcm(sourceBytes);
  const referenceComparison = compareSamples(decodedWav.samples, reference.samples,
    `${target.label} vs JS reference`);
  expect(referenceComparison.diffCount === 0 && referenceComparison.maxAbsDiff === 0,
    `wasm ADPCM decode is not sample-exact vs the independent JS reference for ${target.label}`,
    referenceComparison);

  let ffmpegComparison = null;
  if (useFfmpeg) {
    const ffmpegSamples = await ffmpegDecodeToPcm16(sourcePath, resolve(scratchDir, `${target.label}-ffmpeg.raw`));
    // ffmpeg decodes the padded final block in full; the engine (like Miles)
    // clamps to the fact-chunk frame count, so compare the engine's frames.
    expect(ffmpegSamples.length >= decodedWav.samples.length,
      `ffmpeg decoded fewer samples than the engine for ${target.label}`, {
        ffmpeg: ffmpegSamples.length,
        engine: decodedWav.samples.length,
      });
    ffmpegComparison = compareSamples(decodedWav.samples,
      ffmpegSamples.subarray(0, decodedWav.samples.length), `${target.label} vs ffmpeg`);
    expect(ffmpegComparison.diffCount === 0 && ffmpegComparison.maxAbsDiff === 0,
      `wasm ADPCM decode is not sample-exact vs ffmpeg for ${target.label}`, ffmpegComparison);
  }

  return {
    label: target.label,
    archive: target.archive,
    path: target.path,
    source: {
      bytes: sourceBytes.length,
      wFormatTag: sourceInfo.wFormatTag,
      channels: sourceInfo.channels,
      rate: sourceInfo.rate,
      blockAlign: sourceInfo.blockAlign,
      factSamples: sourceInfo.factSamples,
      dataBytes: sourceInfo.dataBytes,
    },
    engine: adpcm,
    referenceComparison,
    ffmpegComparison,
  };
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

// Real IMA ADPCM decode legs: original engine decode branch over real
// payloads, then sample-exact comparison against independent references.
const adpcmScratchDir = resolve(wasmRoot, "dist", "adpcm-vertical-smoke");
await mkdir(adpcmScratchDir, { recursive: true });
const adpcmFfmpegAvailable = ffmpegAvailable();
const adpcmDecodeLegs = [];
for (const target of adpcmTargets) {
  adpcmDecodeLegs.push(await runAdpcmDecodeLeg(target, adpcmScratchDir, adpcmFfmpegAvailable));
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

  // Browser leg: the same real ADPCM payloads decoded by the wasm Miles
  // boundary (AIL_WAV_info -> AIL_decompress_ADPCM) inside cnc-port, with the
  // decoded PCM scheduled and completed on the Web Audio graph.
  const browserAdpcmPlayback = [];
  for (const target of adpcmTargets) {
    const probeResult = await page.evaluate((probeTarget) =>
      window.CnCPort.rpc("mssAdpcmSamplePlaybackProbe", probeTarget), {
      archive: target.archive,
      path: target.path,
    });
    const scheduled = probeResult.browserMssSamplePlaybackRuntime?.lastEvent?.payload;
    const leg = adpcmDecodeLegs.find((candidate) => candidate.label === target.label);
    expect(probeResult.ok === true
        && probeResult.startProbe?.ok === true
        && probeResult.startProbe.boundary
          === "AIL_WAV_info->AIL_decompress_ADPCM->AIL_set_sample_file->AIL_start_sample"
        && probeResult.startProbe.payload?.format === 17
        && probeResult.startProbe.payload.channels === target.channels
        && probeResult.startProbe.decoded?.sizeMatches === true
        && probeResult.startProbe.decoded.frames === leg.source.factSamples
        && probeResult.finishProbe?.ok === true
        && probeResult.browserMssSamplePlaybackRuntime?.completed === 1
        && probeResult.browserMssSamplePlaybackRuntime.ended === 1
        && probeResult.browserMssSamplePlaybackRuntime.released === 1
        && probeResult.browserMssSamplePlaybackRuntime.lastEvent?.webAudioNode === "AudioBufferSourceNode"
        && scheduled?.codec === "PCM"
        && scheduled.channels === target.channels
        && scheduled.frames === leg.source.factSamples
        && scheduled.stats?.nonZeroSamples > 0,
      `browser real ADPCM decode + Web Audio playback mismatch for ${target.label}`, probeResult);
    browserAdpcmPlayback.push({
      label: target.label,
      archive: target.archive,
      path: target.path,
      decodedFrames: probeResult.startProbe.decoded.frames,
      decodedDataBytes: probeResult.startProbe.decoded.dataBytes,
      scheduledCodec: scheduled.codec,
      nonZeroSamples: scheduled.stats.nonZeroSamples,
      webAudioNode: probeResult.browserMssSamplePlaybackRuntime.lastEvent.webAudioNode,
      completed: probeResult.browserMssSamplePlaybackRuntime.completed,
    });
  }

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
    adpcmDecode: {
      boundary: "AudioFileCache::openFile -> AIL_WAV_info -> AIL_decompress_ADPCM",
      ffmpegAvailable: adpcmFfmpegAvailable,
      legs: adpcmDecodeLegs.map((leg) => ({
        label: leg.label,
        archive: leg.archive,
        path: leg.path,
        source: leg.source,
        decoded: leg.engine?.decoded,
        referenceComparison: leg.referenceComparison,
        ffmpegComparison: leg.ffmpegComparison,
      })),
      browserPlayback: browserAdpcmPlayback,
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
