#!/usr/bin/env node
// transcode_bink_video_payloads.mjs
//
// Converts every extracted user-owned Bink payload into a browser-decodable
// WebM sidecar. The original `.bik` files remain the source of truth, and the
// generated manifest records the BIK header facts consumed by the browser
// runtime while original BinkVideoPlayer retains stream ownership.

import { spawn } from "node:child_process";
import { mkdir, open, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");

const DEFAULT_ASSETS_DIR = resolve(wasmRoot, "artifacts/real-assets");
const DEFAULT_OUTPUT_DIR = resolve(wasmRoot, "artifacts/browser-video/bink");
const MANIFEST_FILE = "bink-browser-video-manifest.json";

const HEADER_LENGTH = 48;
const BIK_MAGIC = "BIK";

const PINNED_FACTS = {
  "GC_Background.bik": {
    fileSize: 149700,
    version: "i",
    frameCount: 180,
    width: 800,
    height: 600,
    fpsNum: 30,
    fpsDen: 1,
    durationSeconds: 6,
    sourceAudioStreams: 1,
  },
  "VS_small.bik": {
    fileSize: 310128,
    version: "i",
    frameCount: 71,
    width: 96,
    height: 120,
    fpsNum: 30,
    fpsDen: 1,
    durationSeconds: 71 / 30,
    sourceAudioStreams: 0,
  },
  "EA_LOGO.BIK": {
    fileSize: 1596884,
    version: "i",
    frameCount: 96,
    width: 720,
    height: 486,
    fpsNum: 143856,
    fpsDen: 4795,
    durationSeconds: 96 * 4795 / 143856,
    sourceAudioStreams: 1,
  },
  "EA_LOGO640.BIK": {
    fileSize: 839924,
    version: "i",
    frameCount: 96,
    width: 640,
    height: 480,
    fpsNum: 30,
    fpsDen: 1,
    durationSeconds: 3.2,
    sourceAudioStreams: 1,
  },
  "sizzle_review.bik": {
    fileSize: 23891876,
    version: "i",
    frameCount: 1961,
    width: 800,
    height: 600,
    fpsNum: 30,
    fpsDen: 1,
    durationSeconds: 1961 / 30,
    sourceAudioStreams: 1,
  },
  "sizzle_review640.bik": {
    fileSize: 17220424,
    version: "i",
    frameCount: 1961,
    width: 640,
    height: 480,
    fpsNum: 30,
    fpsDen: 1,
    durationSeconds: 1961 / 30,
    sourceAudioStreams: 1,
  },
};

function usage() {
  return [
    "usage: node tools/transcode_bink_video_payloads.mjs [assets-dir] [output-dir]",
    "                  [--expect-current-zh]",
    "",
    "Transcodes the shipped loose Bink payloads, including the EA logo and",
    "sizzle startup movies, from the assets dir into VP9/Opus WebM sidecars",
    "and writes a manifest.",
    "The original BIK files remain the source of truth. Requires ffmpeg and",
    "ffprobe on PATH. Does not wire runtime playback.",
    "",
    "  --expect-current-zh     Self-check source BIK facts and output stream",
    "                          metadata against the current shipped payloads.",
  ].join("\n");
}

async function discoverPayloadFiles(assetsDir) {
  return (await readdir(assetsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.bik$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
}

function parseArgs(argv) {
  let assetsDir = null;
  let outputDir = null;
  let expectCurrentZh = false;

  for (const arg of argv) {
    if (arg === "--expect-current-zh") {
      expectCurrentZh = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (assetsDir === null) {
      assetsDir = arg;
    } else if (outputDir === null) {
      outputDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return {
    assetsDir: assetsDir === null ? DEFAULT_ASSETS_DIR : resolve(process.cwd(), assetsDir),
    outputDir: outputDir === null ? DEFAULT_OUTPUT_DIR : resolve(process.cwd(), outputDir),
    expectCurrentZh,
  };
}

function runTool(command, args, options = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      rejectCommand(new Error(`${command} failed to start: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      if (code !== 0) {
        rejectCommand(new Error(
          `${command} ${args.join(" ")} failed with ${signal ?? `exit ${code}`}: ${stderr.trim()}`,
        ));
        return;
      }
      resolveCommand({ stdout, stderr });
    });
  });
}

async function readExact(file, position, length, label) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error(`${label}: expected ${length} bytes at ${position}, read ${bytesRead}`);
  }
  return buffer;
}

async function parseBinkHeader(path) {
  const file = await open(path, "r");
  try {
    const fileStat = await file.stat();
    const header = await readExact(file, 0, HEADER_LENGTH, basename(path));
    const magic = header.toString("ascii", 0, 3);
    const version = String.fromCharCode(header[3]);
    return {
      fileSize: fileStat.size,
      headerLength: HEADER_LENGTH,
      headerHex: header.toString("hex").toUpperCase(),
      magic,
      version,
      signature: `${magic}${version}`,
      sizeField: header.readUInt32LE(4),
      frameCount: header.readUInt32LE(8),
      largestFrame: header.readUInt32LE(12),
      frameCountDup: header.readUInt32LE(16),
      width: header.readUInt32LE(20),
      height: header.readUInt32LE(24),
      fpsNum: header.readUInt32LE(28),
      fpsDen: header.readUInt32LE(32),
      flags: header.readUInt32LE(36),
      expectedSizeField: fileStat.size - 8,
    };
  } finally {
    await file.close();
  }
}

async function probeMedia(path, countFrames = false) {
  const args = [
    "-v", "error",
  ];
  if (countFrames) {
    args.push("-count_frames");
  }
  args.push("-show_format", "-show_streams", "-of", "json", path);
  const { stdout } = await runTool("ffprobe", args);
  return JSON.parse(stdout);
}

async function transcodeToWebm(sourcePath, outputPath) {
  await runTool("ffmpeg", [
    "-nostdin",
    "-y",
    "-v", "error",
    "-i", sourcePath,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuv420p",
    "-row-mt", "1",
    "-deadline", "good",
    "-cpu-used", "4",
    "-b:v", "0",
    "-crf", "32",
    "-c:a", "libopus",
    "-b:a", "96k",
    outputPath,
  ]);
}

function videoStream(probe) {
  return probe.streams?.find((stream) => stream.codec_type === "video") ?? null;
}

function audioStreams(probe) {
  return probe.streams?.filter((stream) => stream.codec_type === "audio") ?? [];
}

function parseRate(rate) {
  const [numText, denText] = String(rate ?? "").split("/");
  const num = Number(numText);
  const den = Number(denText);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return null;
  }
  return { num, den };
}

function durationFromHeader(header) {
  if (header.fpsNum <= 0 || header.fpsDen <= 0) {
    return null;
  }
  return header.frameCount * header.fpsDen / header.fpsNum;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nearlyEqual(left, right, epsilon = 0.03) {
  return Math.abs(left - right) <= epsilon;
}

function assertPinnedSource(fileName, header, sourceProbe, errors) {
  const pinned = PINNED_FACTS[fileName];
  if (!pinned) {
    return;
  }

  const sourceVideo = videoStream(sourceProbe);
  const sourceAudioCount = audioStreams(sourceProbe).length;
  const checks = [
    ["fileSize", header.fileSize, pinned.fileSize],
    ["version", header.version, pinned.version],
    ["frameCount", header.frameCount, pinned.frameCount],
    ["width", header.width, pinned.width],
    ["height", header.height, pinned.height],
    ["fpsNum", header.fpsNum, pinned.fpsNum],
    ["fpsDen", header.fpsDen, pinned.fpsDen],
    ["sourceAudioStreams", sourceAudioCount, pinned.sourceAudioStreams],
  ];

  for (const [name, actual, expected] of checks) {
    if (actual !== expected) {
      errors.push(`${fileName}: ${name} ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    }
  }

  const sourceDuration = numberOrNull(sourceVideo?.duration ?? sourceProbe.format?.duration);
  if (sourceDuration !== null && !nearlyEqual(sourceDuration, pinned.durationSeconds)) {
    errors.push(`${fileName}: source duration ${sourceDuration} !== ${pinned.durationSeconds}`);
  }
}

function validateHeader(fileName, header, errors) {
  if (header.magic !== BIK_MAGIC) {
    errors.push(`${fileName}: expected classic BIK magic, got ${JSON.stringify(header.magic)}`);
  }
  if (header.sizeField !== header.expectedSizeField) {
    errors.push(`${fileName}: size field ${header.sizeField} !== file size - 8 (${header.expectedSizeField})`);
  }
  if (header.frameCount !== header.frameCountDup) {
    errors.push(`${fileName}: frame count ${header.frameCount} !== repeated frame count ${header.frameCountDup}`);
  }
  if (header.width <= 0 || header.height <= 0) {
    errors.push(`${fileName}: invalid dimensions ${header.width}x${header.height}`);
  }
  if (header.fpsNum <= 0 || header.fpsDen <= 0) {
    errors.push(`${fileName}: invalid fps ${header.fpsNum}/${header.fpsDen}`);
  }
}

function validateSourceProbe(fileName, header, sourceProbe, errors) {
  const sourceVideo = videoStream(sourceProbe);
  if (!sourceVideo) {
    errors.push(`${fileName}: ffprobe found no source video stream`);
    return;
  }
  if (sourceProbe.format?.format_name !== "bink") {
    errors.push(`${fileName}: source format ${sourceProbe.format?.format_name} !== bink`);
  }
  if (sourceVideo.codec_name !== "binkvideo") {
    errors.push(`${fileName}: source video codec ${sourceVideo.codec_name} !== binkvideo`);
  }
  if (sourceVideo.width !== header.width || sourceVideo.height !== header.height) {
    errors.push(
      `${fileName}: source video dimensions ${sourceVideo.width}x${sourceVideo.height} !== ` +
      `${header.width}x${header.height}`,
    );
  }

  const rate = parseRate(sourceVideo.avg_frame_rate) ?? parseRate(sourceVideo.r_frame_rate);
  if (!rate || rate.num !== header.fpsNum || rate.den !== header.fpsDen) {
    errors.push(`${fileName}: source frame rate ${sourceVideo.avg_frame_rate ?? sourceVideo.r_frame_rate} !== ${header.fpsNum}/${header.fpsDen}`);
  }
}

function validateOutputProbe(fileName, header, sourceProbe, outputProbe, errors) {
  const outputVideo = videoStream(outputProbe);
  const outputAudio = audioStreams(outputProbe);
  const sourceAudioCount = audioStreams(sourceProbe).length;

  if (!outputVideo) {
    errors.push(`${fileName}: ffprobe found no output video stream`);
    return;
  }
  if (!String(outputProbe.format?.format_name ?? "").includes("webm")) {
    errors.push(`${fileName}: output format ${outputProbe.format?.format_name} does not include webm`);
  }
  if (outputVideo.codec_name !== "vp9") {
    errors.push(`${fileName}: output video codec ${outputVideo.codec_name} !== vp9`);
  }
  if (outputVideo.width !== header.width || outputVideo.height !== header.height) {
    errors.push(
      `${fileName}: output video dimensions ${outputVideo.width}x${outputVideo.height} !== ` +
      `${header.width}x${header.height}`,
    );
  }
  const rate = parseRate(outputVideo.avg_frame_rate) ?? parseRate(outputVideo.r_frame_rate);
  const sourceFps = header.fpsNum / header.fpsDen;
  const outputFps = rate ? rate.num / rate.den : NaN;
  // WebM's millisecond time base can represent the original Bink cadence as
  // an equivalent nearby rational (EA_LOGO is 143856/4795 rather than an
  // integer 30 fps). Preserve the cadence, not the unreduced fraction.
  if (!rate || !nearlyEqual(outputFps, sourceFps, 0.01)) {
    errors.push(`${fileName}: output frame rate ${outputVideo.avg_frame_rate ?? outputVideo.r_frame_rate} !== ${header.fpsNum}/${header.fpsDen}`);
  }
  const outputFrames = Number(outputVideo.nb_read_frames);
  if (!Number.isFinite(outputFrames) || outputFrames !== header.frameCount) {
    errors.push(`${fileName}: output video frame count ${outputVideo.nb_read_frames} !== ${header.frameCount}`);
  }
  if (sourceAudioCount > 0) {
    if (outputAudio.length === 0) {
      errors.push(`${fileName}: source has audio but output has none`);
    } else if (!outputAudio.every((stream) => stream.codec_name === "opus")) {
      errors.push(`${fileName}: expected opus output audio streams, got ${outputAudio.map((stream) => stream.codec_name).join(", ")}`);
    }
  } else if (outputAudio.length !== 0) {
    errors.push(`${fileName}: source has no audio but output has ${outputAudio.length} audio stream(s)`);
  }
}

async function transcodePayload(assetsDir, outputDir, fileName, options, errors) {
  const sourcePath = resolve(assetsDir, fileName);
  const outputFile = fileName.replace(/\.bik$/i, ".webm");
  const outputPath = resolve(outputDir, outputFile);

  const sourceStat = await stat(sourcePath);
  const header = await parseBinkHeader(sourcePath);
  validateHeader(fileName, header, errors);

  const sourceProbe = await probeMedia(sourcePath, false);
  validateSourceProbe(fileName, header, sourceProbe, errors);
  if (options.expectCurrentZh) {
    assertPinnedSource(fileName, header, sourceProbe, errors);
  }

  let outputStat = await stat(outputPath).catch(() => null);
  let outputProbe = null;
  if (outputStat?.size > 0 && outputStat.mtimeMs >= sourceStat.mtimeMs) {
    outputProbe = await probeMedia(outputPath, true).catch(() => null);
  }
  const cachedVideo = videoStream(outputProbe);
  const cachedAudio = audioStreams(outputProbe);
  const cachedOutputMatches = cachedVideo?.codec_name === "vp9"
    && cachedVideo.width === header.width
    && cachedVideo.height === header.height
    && Number(cachedVideo.nb_read_frames) === header.frameCount
    && cachedAudio.length === audioStreams(sourceProbe).length;
  if (!cachedOutputMatches) {
    await transcodeToWebm(sourcePath, outputPath);
    outputStat = await stat(outputPath);
    outputProbe = await probeMedia(outputPath, true);
  }
  validateOutputProbe(fileName, header, sourceProbe, outputProbe, errors);

  const sourceVideo = videoStream(sourceProbe);
  const sourceAudio = audioStreams(sourceProbe);
  const outputVideo = videoStream(outputProbe);
  const outputAudio = audioStreams(outputProbe);

  return {
    name: fileName.replace(/\.bik$/i, ""),
    sourceFile: fileName,
    sourcePath,
    sourceSize: header.fileSize,
    sourceSignature: header.signature,
    sourceFormat: sourceProbe.format?.format_name ?? null,
    sourceVideoCodec: sourceVideo?.codec_name ?? null,
    sourceAudioCodecs: sourceAudio.map((stream) => stream.codec_name),
    frames: header.frameCount,
    width: header.width,
    height: header.height,
    fpsNum: header.fpsNum,
    fpsDen: header.fpsDen,
    sourceDurationSeconds: durationFromHeader(header),
    outputFile,
    outputPath,
    outputSize: outputStat.size,
    outputFormat: outputProbe.format?.format_name ?? null,
    outputVideoCodec: outputVideo?.codec_name ?? null,
    outputAudioCodecs: outputAudio.map((stream) => stream.codec_name),
    outputFrameCount: Number(outputVideo?.nb_read_frames ?? NaN),
    outputDurationSeconds: numberOrNull(outputProbe.format?.duration),
    browserDecode: {
      container: "webm",
      videoCodec: "vp9",
      audioCodec: sourceAudio.length > 0 ? "opus" : null,
      intendedRuntime: "HTMLVideoElement/WebCodecs sidecar",
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.outputDir, { recursive: true });

  // Fail early with actionable diagnostics if the host tools are missing.
  await runTool("ffmpeg", ["-version"]);
  await runTool("ffprobe", ["-version"]);

  const errors = [];
  const payloads = [];
  const payloadFiles = await discoverPayloadFiles(options.assetsDir);
  if (payloadFiles.length === 0) {
    throw new Error(`No loose Bink payloads found in ${options.assetsDir}`);
  }
  const jobs = Math.max(1, Math.min(8, Number(process.env.BINK_TRANSCODE_JOBS ?? 3) || 3));
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, payloadFiles.length) }, async () => {
    while (cursor < payloadFiles.length) {
      const index = cursor++;
      const fileName = payloadFiles[index];
      try {
        payloads[index] = await transcodePayload(
          options.assetsDir,
          options.outputDir,
          fileName,
          options,
          errors,
        );
      } catch (error) {
        errors.push(`${fileName}: ${error?.message ?? error}`);
      }
    }
  }));

  const manifest = {
    ok: errors.length === 0,
    schema: "cnc-zh-bink-browser-video-manifest/v1",
    source: "WebAssembly/tools/transcode_bink_video_payloads.mjs",
    assetsDir: options.assetsDir,
    outputDir: options.outputDir,
    manifestPath: resolve(options.outputDir, MANIFEST_FILE),
    payloads,
    errors,
    note:
      "Browser-decodable sidecars generated from user-supplied Bink payloads. " +
      "BinkCopyToBuffer remains a synchronous browser-frame copy boundary; " +
      "the provider does not decode Bink frames itself.",
  };

  await writeFile(manifest.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
