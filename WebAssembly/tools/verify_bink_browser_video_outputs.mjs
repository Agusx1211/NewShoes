#!/usr/bin/env node
// verify_bink_browser_video_outputs.mjs
//
// Bounded verifier for *future* browser-decodable Bink transcode outputs.
//
// The current browser Bink provider (`WebAssembly/src/wasm_bink_provider.cpp`)
// can open real loose `.bik` files and parse their classic-BINK headers, but
// cannot decode frames into browser-decodable video yet. A future transcode
// step (offline ffmpeg/ffprobe, or an in-browser decoder) will produce
// `.webm` / `.mp4` files for the two known real loose shipped BIK payloads
// (`GC_Background.bik`, `VS_small.bik`). This verifier checks that output
// directory now and after such a transcode exists, so it is useful both
// before and after the outputs are produced.
//
// It does NOT decode, demux, or play Bink video itself, and it does NOT
// invent decode readiness or mark runtime playback done. It only validates
// that produced browser-decodable files (or, when ffprobe/ffmpeg are absent,
// a tight source-grounded manifest emitted by a future transcode script)
// agree with the source `.bik` header facts already pinned by
// `verify_bink_payload_header_contract.mjs`.
//
// Behavior:
//   * For each of the two shipped payloads, look for a produced `.webm` or
//     `.mp4` (plus a manifest entry describing it).
//   * If outputs are present and `ffprobe` is available, verify the real
//     dimensions / duration / video stream codec against the manifest values.
//   * If outputs are present but `ffprobe` is absent, verify the manifest
//     schema and that the manifest's source-grounded fields match the pinned
//     source header facts; do not invent a codec/duration check it cannot
//     actually perform.
//   * If outputs are absent:
//       - with `--allow-missing`, report them missing in JSON and succeed
//         (exit 0); this is the "useful before outputs exist" mode.
//       - without `--allow-missing`, fail nonzero.
//
// Manifest schema (tight, source-grounded). A future transcode script emits
// `<output-dir>/bink-browser-outputs.json`:
//   {
//     "version": 1,
//     "generatedBy": "<string>",
//     "outputs": [
//       {
//         "sourceBik": "GC_Background.bik",          // required, pinned name
//         "sourceBikPath": "<string>",               // required
//         "sourceSize": 149700,                       // required, u32
//         "sourceSignature": "BIK",                   // required ("BIK"|"KB2")
//         "sourceVersion": "i",                       // required (1-char string)
//         "frames": 180,                              // required, u32
//         "width": 800,                               // required, u32
//         "height": 600,                              // required, u32
//         "fps": 30,                                  // required, number
//         "outputPath": "GC_Background.webm",         // required
//         "outputFormat": "webm",                     // required ("webm"|"mp4")
//         "outputCodec": "vp9",                       // required, ffprobe codec name
//         "durationSeconds": 6.0                      // required, number
//       },
//       ...
//     ]
//   }
//
// Output JSON shape:
//   { ok, source, outputDir, manifestPath, ffprobe, mode, payloads, errors, note }
//
// `--expect-current-zh` cross-checks each present manifest entry's
// source-grounded fields against the values pinned from the actually shipped
// files (mirrors `verify_bink_payload_header_contract.mjs`).

import { open, stat, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");

const DEFAULT_OUTPUT_DIR = resolve(wasmRoot, "artifacts/bink-browser-outputs");
const DEFAULT_MANIFEST_NAME = "bink-browser-outputs.json";
const SOURCE_ASSETS_DIR = resolve(wasmRoot, "artifacts/real-assets");

// The two known real loose shipped BIK payloads. The verifier validates an
// output for each of these, by these exact pinned names.
const PAYLOAD_FILES = ["GC_Background.bik", "VS_small.bik"];

// Output container formats this verifier accepts as browser-decodable.
const ACCEPTED_OUTPUT_FORMATS = new Set(["webm", "mp4"]);

// Source-grounded facts pinned from the actually shipped files (same values
// as verify_bink_payload_header_contract.mjs). These are the contract every
// manifest entry's source-* fields must match under --expect-current-zh, and
// the contract ffprobe dimensions are compared against.
const PINNED_SOURCE_FACTS = {
  "GC_Background.bik": {
    sourceSize: 149700,
    sourceSignature: "BIK",
    sourceVersion: "i",
    frames: 180,
    width: 800,
    height: 600,
    fps: 30,
    durationSeconds: 180 / 30, // 6.0
  },
  "VS_small.bik": {
    sourceSize: 310128,
    sourceSignature: "BIK",
    sourceVersion: "i",
    frames: 71,
    width: 96,
    height: 120,
    fps: 30,
    durationSeconds: 71 / 30, // ~2.3667
  },
};

const MANIFEST_VERSION = 1;

const SOURCE_TAG = "WebAssembly/tools/verify_bink_browser_video_outputs.mjs";

function usage() {
  return [
    "usage: node tools/verify_bink_browser_video_outputs.mjs [output-dir]",
    "                  [--manifest <path>] [--allow-missing]",
    "                  [--expect-current-zh]",
    "",
    "Verifies a future browser-decodable Bink transcode output directory for",
    "the two known real loose shipped BIK payloads (GC_Background.bik,",
    "VS_small.bik). With --allow-missing, reports missing outputs in JSON and",
    "succeeds even before any outputs exist. Without --allow-missing, fails",
    "nonzero if outputs are absent or metadata mismatches.",
    "",
    "  output-dir              Directory holding produced .webm/.mp4 outputs",
    "                          and the manifest (default:",
    "                          artifacts/bink-browser-outputs).",
    "  --manifest <path>       Manifest path (default: <output-dir>/" +
      DEFAULT_MANIFEST_NAME + ").",
    "  --allow-missing         Do not fail when outputs are absent; report",
    "                          them missing in JSON and exit 0.",
    "  --expect-current-zh     Cross-check present manifest entries against",
    "                          values pinned from the actually shipped files.",
  ].join("\n");
}

function parseArgs(argv) {
  let outputDir = null;
  let manifestPath = null;
  let allowMissing = false;
  let expectCurrentZh = false;
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    if (arg === "--allow-missing") {
      allowMissing = true;
    } else if (arg === "--expect-current-zh") {
      expectCurrentZh = true;
    } else if (arg === "--manifest") {
      manifestPath = argv[++i];
      if (!manifestPath) {
        throw new Error("--manifest requires a path argument");
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (outputDir === null) {
      outputDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  const resolvedOutputDir = outputDir === null
    ? DEFAULT_OUTPUT_DIR
    : resolve(process.cwd(), outputDir);
  const resolvedManifestPath = manifestPath === null
    ? resolve(resolvedOutputDir, DEFAULT_MANIFEST_NAME)
    : resolve(process.cwd(), manifestPath);
  return {
    outputDir: resolvedOutputDir,
    manifestPath: resolvedManifestPath,
    allowMissing,
    expectCurrentZh,
  };
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function isFile(path) {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

// Detect whether ffprobe is usable. We never require it; absence just narrows
// the verification to the manifest schema + pinned source facts.
function probeFfprobe() {
  return new Promise((resolveProbe) => {
    const child = spawn("ffprobe", ["-version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.on("error", () => resolveProbe(false));
    child.on("exit", (code) => resolveProbe(code === 0));
  });
}

function runFfprobe(mediaPath) {
  return new Promise((resolveProbe, reject) => {
    const args = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries",
      "stream=codec_name,width,height:format=duration",
      "-of", "json",
      mediaPath,
    ];
    const child = spawn("ffprobe", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        resolveProbe(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`ffprobe produced non-JSON output: ${error.message}`));
      }
    });
  });
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

// Validate one manifest entry's schema. Returns a list of error strings
// (empty if valid). Keeps the schema tight and source-grounded.
function validateEntrySchema(entry) {
  const errors = [];
  const label = isNonEmptyString(entry?.sourceBik)
    ? entry.sourceBik
    : "<unnamed entry>";

  const requireString = (key) => {
    if (!isNonEmptyString(entry?.[key])) {
      errors.push(`${label}: missing or non-string ${key}`);
    }
  };
  const requirePositiveInt = (key) => {
    if (!isPositiveInteger(entry?.[key])) {
      errors.push(`${label}: ${key} must be a positive integer, got ${JSON.stringify(entry?.[key])}`);
    }
  };
  const requirePositiveNumber = (key) => {
    if (!isFiniteNumber(entry?.[key]) || entry[key] <= 0) {
      errors.push(`${label}: ${key} must be a positive number, got ${JSON.stringify(entry?.[key])}`);
    }
  };

  requireString("sourceBik");
  requireString("sourceBikPath");
  if (!isNonNegativeInteger(entry?.sourceSize)) {
    errors.push(`${label}: sourceSize must be a non-negative integer, got ${JSON.stringify(entry?.sourceSize)}`);
  }
  if (!["BIK", "KB2"].includes(entry?.sourceSignature)) {
    errors.push(`${label}: sourceSignature must be "BIK" or "KB2", got ${JSON.stringify(entry?.sourceSignature)}`);
  }
  if (!(typeof entry?.sourceVersion === "string" && entry.sourceVersion.length === 1)) {
    errors.push(`${label}: sourceVersion must be a single-character string, got ${JSON.stringify(entry?.sourceVersion)}`);
  }
  requirePositiveInt("frames");
  requirePositiveInt("width");
  requirePositiveInt("height");
  requirePositiveNumber("fps");
  requireString("outputPath");
  if (!ACCEPTED_OUTPUT_FORMATS.has(entry?.outputFormat)) {
    errors.push(`${label}: outputFormat must be one of ${[...ACCEPTED_OUTPUT_FORMATS].join(", ")}, got ${JSON.stringify(entry?.outputFormat)}`);
  }
  requireString("outputCodec");
  requirePositiveNumber("durationSeconds");

  return errors;
}

function assertPinnedSourceFacts(entry, failures) {
  const pinned = PINNED_SOURCE_FACTS[entry.sourceBik];
  if (!pinned) {
    failures.push(`${entry.sourceBik}: no pinned source facts registered`);
    return;
  }
  const checks = [
    ["sourceSize", entry.sourceSize, pinned.sourceSize],
    ["sourceSignature", entry.sourceSignature, pinned.sourceSignature],
    ["sourceVersion", entry.sourceVersion, pinned.sourceVersion],
    ["frames", entry.frames, pinned.frames],
    ["width", entry.width, pinned.width],
    ["height", entry.height, pinned.height],
    ["fps", entry.fps, pinned.fps],
  ];
  for (const [name, actual, expected] of checks) {
    if (actual !== expected) {
      failures.push(`${entry.sourceBik}: pinned ${name} ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    }
  }
  // Duration: the source-grounded contract is frames / fps. Allow a small
  // floating-point epsilon because the manifest may carry a rounded value.
  const expectedDuration = pinned.frames / pinned.fps;
  if (
    !isFiniteNumber(entry.durationSeconds) ||
    Math.abs(entry.durationSeconds - expectedDuration) > 0.05
  ) {
    failures.push(
      `${entry.sourceBik}: durationSeconds ${JSON.stringify(entry.durationSeconds)} not within 0.05s of source-grounded ${expectedDuration.toFixed(6)} (frames/fps)`,
    );
  }
}

// Cross-check the manifest's source-grounded fields against the actual source
// `.bik` file on disk, when that source file is present. This catches a
// manifest that drifts from the real source without inventing decode state.
async function assertManifestMatchesSourceBik(entry, errors) {
  const sourcePath = resolve(SOURCE_ASSETS_DIR, entry.sourceBik);
  const exists = await isFile(sourcePath);
  if (!exists) {
    // The source file may legitimately be absent in a fresh checkout before
    // `npm run extract:runtime-archives` has run; do not fail on that, the
    // pinned-facts check covers correctness.
    return;
  }
  const s = await stat(sourcePath);
  if (s.size !== entry.sourceSize) {
    errors.push(
      `${entry.sourceBik}: manifest sourceSize ${entry.sourceSize} !== actual source file size ${s.size}`,
    );
  }
  // Sniff the leading BIK/KB2 signature + version byte.
  const file = await open(sourcePath, "r");
  try {
    const buf = Buffer.alloc(4);
    const { bytesRead } = await file.read(buf, 0, 4, 0);
    if (bytesRead === 4) {
      let signature = "";
      if (buf[0] === 0x42 && buf[1] === 0x49 && buf[2] === 0x4b) {
        signature = "BIK";
      } else if (buf[0] === 0x4b && buf[1] === 0x42 && buf[2] === 0x32) {
        signature = "KB2";
      }
      if (signature && signature !== entry.sourceSignature) {
        errors.push(
          `${entry.sourceBik}: manifest sourceSignature ${JSON.stringify(entry.sourceSignature)} !== actual source signature ${JSON.stringify(signature)}`,
        );
      }
      const version = String.fromCharCode(buf[3]);
      if (signature === "BIK" && version !== entry.sourceVersion) {
        errors.push(
          `${entry.sourceBik}: manifest sourceVersion ${JSON.stringify(entry.sourceVersion)} !== actual source version ${JSON.stringify(version)}`,
        );
      }
    }
  } finally {
    await file.close();
  }
}

// Read & validate the manifest file. Returns { manifest, errors }.
async function loadManifest(manifestPath) {
  const errors = [];
  if (!(await isFile(manifestPath))) {
    return { manifest: null, errors };
  }
  let raw;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    errors.push(`cannot read manifest ${manifestPath}: ${error.message}`);
    return { manifest: null, errors };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    errors.push(`manifest ${manifestPath} is not valid JSON: ${error.message}`);
    return { manifest: null, errors };
  }
  if (typeof parsed !== "object" || parsed === null) {
    errors.push("manifest root must be an object");
    return { manifest: null, errors };
  }
  if (parsed.version !== MANIFEST_VERSION) {
    errors.push(
      `manifest version must be ${MANIFEST_VERSION}, got ${JSON.stringify(parsed.version)}`,
    );
    return { manifest: null, errors };
  }
  if (!Array.isArray(parsed.outputs)) {
    errors.push("manifest.outputs must be an array");
    return { manifest: null, errors };
  }
  return { manifest: parsed, errors };
}

function findEntryBySourceBik(manifest, sourceBik) {
  if (!manifest) return null;
  const matches = manifest.outputs.filter((e) => e?.sourceBik === sourceBik);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    return { duplicate: true };
  }
  return matches[0];
}

async function verifyOutputMedia(entry, outputPath, ffprobeAvailable, errors) {
  if (!ffprobeAvailable) {
    // Cannot verify real dimensions/duration/codec without ffprobe. The
    // manifest schema + pinned source facts checks still apply; we record
    // that the media itself was not inspected.
    return { ffprobeVerified: false };
  }
  let probe;
  try {
    probe = await runFfprobe(outputPath);
  } catch (error) {
    errors.push(`${entry.sourceBik}: ffprobe failed on ${basename(outputPath)}: ${error.message}`);
    return { ffprobeVerified: false };
  }
  const stream = probe?.streams?.[0];
  const formatDuration = probe?.format?.duration;
  const result = { ffprobeVerified: true, stream: null };
  if (!stream) {
    errors.push(`${entry.sourceBik}: ffprobe found no video stream in ${basename(outputPath)}`);
    return result;
  }
  result.stream = {
    codecName: stream.codec_name ?? null,
    width: stream.width ?? null,
    height: stream.height ?? null,
    duration: formatDuration != null ? Number(formatDuration) : null,
  };
  if (stream.codec_name !== entry.outputCodec) {
    errors.push(
      `${entry.sourceBik}: ffprobe video codec ${JSON.stringify(stream.codec_name)} !== manifest outputCodec ${JSON.stringify(entry.outputCodec)}`,
    );
  }
  if (isPositiveInteger(stream.width) && stream.width !== entry.width) {
    errors.push(
      `${entry.sourceBik}: ffprobe width ${stream.width} !== manifest width ${entry.width}`,
    );
  }
  if (isPositiveInteger(stream.height) && stream.height !== entry.height) {
    errors.push(
      `${entry.sourceBik}: ffprobe height ${stream.height} !== manifest height ${entry.height}`,
    );
  }
  if (formatDuration != null) {
    const duration = Number(formatDuration);
    if (Number.isFinite(duration)) {
      // Container duration tolerance: Bink frame-rate transcode can drift a
      // little; allow up to 0.25s or ~2% of the manifest duration, whichever
      // is larger.
      const tolerance = Math.max(0.25, Math.abs(entry.durationSeconds) * 0.02);
      if (Math.abs(duration - entry.durationSeconds) > tolerance) {
        errors.push(
          `${entry.sourceBik}: ffprobe duration ${duration.toFixed(6)}s outside tolerance of manifest durationSeconds ${entry.durationSeconds}s (±${tolerance.toFixed(6)}s)`,
        );
      }
    }
  }
  return result;
}

async function buildPayloadReport(payloadFile, options, manifest, ffprobeAvailable, errors) {
  const pinned = PINNED_SOURCE_FACTS[payloadFile];
  const entry = findEntryBySourceBik(manifest, payloadFile);

  const report = {
    sourceBik: payloadFile,
    expected: { ...pinned },
    present: false,
    duplicateEntry: false,
    entryErrors: [],
    output: null,
    note: null,
  };

  if (entry && entry.duplicate) {
    report.duplicateEntry = true;
    errors.push(`${payloadFile}: manifest contains more than one entry for this source`);
    return report;
  }

  if (!entry) {
    report.note = "no manifest entry";
    return report;
  }

  // Schema-validate the entry.
  report.entryErrors = validateEntrySchema(entry);
  for (const e of report.entryErrors) {
    errors.push(e);
  }
  if (report.entryErrors.length > 0) {
    return report;
  }

  // Cross-check the manifest's source-grounded fields against pinned facts.
  if (options.expectCurrentZh) {
    const failures = [];
    assertPinnedSourceFacts(entry, failures);
    for (const f of failures) {
      errors.push(f);
    }
  }

  // Cross-check manifest source fields against the actual source file, when
  // present.
  await assertManifestMatchesSourceBik(entry, errors);

  // Resolve and check the produced output file.
  const outputPath = resolve(options.outputDir, basename(entry.outputPath));
  const outputExists = await isFile(outputPath);

  if (!outputExists) {
    report.note = `manifest entry present but output file ${JSON.stringify(basename(entry.outputPath))} absent`;
    return report;
  }

  const outputStat = await stat(outputPath);
  report.present = true;
  report.output = {
    path: outputPath,
    name: basename(entry.outputPath),
    format: entry.outputFormat,
    codec: entry.outputCodec,
    size: outputStat.size,
    durationSeconds: entry.durationSeconds,
  };

  const media = await verifyOutputMedia(entry, outputPath, ffprobeAvailable, errors);
  report.output.ffprobe = media;

  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const errors = [];
  const ffprobeAvailable = await probeFfprobe();

  const outputDirExists = await pathExists(options.outputDir);

  let manifest = null;
  if (outputDirExists) {
    const loaded = await loadManifest(options.manifestPath);
    manifest = loaded.manifest;
    for (const e of loaded.errors) {
      errors.push(e);
    }
  }

  const payloads = [];
  for (const payloadFile of PAYLOAD_FILES) {
    payloads.push(
      await buildPayloadReport(
        payloadFile,
        options,
        manifest,
        ffprobeAvailable,
        errors,
      ),
    );
  }

  const anyPresent = payloads.some((p) => p.present);
  const missingPayloads = payloads
    .filter((p) => !p.present)
    .map((p) => p.sourceBik);

  // Determine success/failure.
  //
  // Strict (no --allow-missing): any missing output OR any error fails.
  // Allow-missing: only metadata-mismatch errors fail; absent outputs are
  //   reported but tolerated (useful before transcode outputs exist).
  let ok;
  if (options.allowMissing) {
    ok = errors.length === 0;
  } else {
    ok = errors.length === 0 && missingPayloads.length === 0;
  }

  const report = {
    ok,
    source: SOURCE_TAG,
    outputDir: options.outputDir,
    outputDirExists,
    manifestPath: options.manifestPath,
    manifestPresent: manifest !== null,
    ffprobe: {
      available: ffprobeAvailable,
      used: ffprobeAvailable && anyPresent,
    },
    mode: options.allowMissing ? "allow-missing" : "strict",
    payloads,
    missingPayloads,
    errors,
    note:
      "Verifies future browser-decodable Bink transcode outputs for the two " +
      "shipped loose BIK payloads. With --allow-missing, absent outputs are " +
      "reported but tolerated; metadata mismatches still fail. Without " +
      "--allow-missing, absent outputs fail. Does not decode Bink video or " +
      "claim runtime playback.",
  };

  console.log(JSON.stringify(report, null, 2));
  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
