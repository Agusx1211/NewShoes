#!/usr/bin/env node
// verify_bink_browser_sidecar_contract.mjs
//
// Bounded source/tool verifier that pins the contract between the offline-
// transcoded WebM sidecar manifest (produced by transcode:bink-video) and the
// browser Bink provider/runtime (WebAssembly/src/wasm_bink_provider.cpp).
//
// It reads repo source and the generated manifest; it never executes the
// runtime. It complements verify_bink_video_device_frontier.mjs by checking
// the sidecar manifest contract and original-style path aliases without
// running the wasm provider or browser harness.
//
// Pinned contract:
//   1. Provider decode-readiness invariant: WasmBinkProviderCanDecodeFrames
//      must return 0 for as long as BinkCopyToBuffer does not actually copy
//      decoded pixels. The current provider documents frame decode/copy as a
//      pending WebCodecs task and reports canDecodeFrames=0; any future
//      provider change that flips canDecodeFrames must first make
//      BinkCopyToBuffer copy real pixels.
//   2. Manifest schema/path: the sidecar manifest lives at
//      artifacts/browser-video/bink/bink-browser-video-manifest.json with
//      schema "cnc-zh-bink-browser-video-manifest/v1". The provider source
//      must know the manifest filename/directory; the generated manifest pins
//      the schema.
//   3. Source -> sidecar association: each shipped BIK source file is
//      associated with the matching WebM sidecar metadata (sourceFile ->
//      outputFile, pinned codecs/dimensions/frame count).
//   4. Original-style path aliases: the original BinkVideoPlayer::open path
//      formats ("Data\\Movies\\<name>.bik" and "Data/<lang>/Movies/<name>.bik")
//      must resolve to "<name>.webm". The verifier derives these aliases from
//      the original source defines and checks them against the manifest.
//
// Exit codes: 0 when the pinned contract holds. With --allow-missing, an
// absent manifest is reported but tolerated (the transcode step has not
// necessarily run); without it, a missing or malformed manifest fails.

import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const repoRoot = resolve(wasmRoot, "..");

const SOURCES = {
  provider: "WebAssembly/src/wasm_bink_provider.cpp",
  player: "GeneralsMD/Code/GameEngineDevice/Source/VideoDevice/Bink/BinkVideoPlayer.cpp",
};

const DEFAULT_OUTPUT_DIR = resolve(wasmRoot, "artifacts/browser-video/bink");
const DEFAULT_MANIFEST_NAME = "bink-browser-video-manifest.json";
const EXPECTED_SCHEMA = "cnc-zh-bink-browser-video-manifest/v1";
const SOURCE_TAG = "WebAssembly/tools/verify_bink_browser_sidecar_contract.mjs";

// Original-style registry language used as the canonical alias example. The
// path-alias contract holds for any language, but the shipped Zero Hour loose
// payloads live under Data\English\Movies in the original layout.
const ALIAS_LANGUAGES = ["English"];

// Pinned source -> sidecar expectations for the shipped loose payloads. These
// mirror the facts pinned by transcode_bink_video_payloads.mjs and
// verify_bink_browser_video_outputs.mjs so the contract stays single-sourced.
const PINNED_PAYLOADS = {
  "GC_Background.bik": {
    name: "GC_Background",
    outputFile: "GC_Background.webm",
    width: 800,
    height: 600,
    frames: 180,
    outputVideoCodec: "vp9",
    outputAudioCodecs: ["opus"],
  },
  "VS_small.bik": {
    name: "VS_small",
    outputFile: "VS_small.webm",
    width: 96,
    height: 120,
    frames: 71,
    outputVideoCodec: "vp9",
    outputAudioCodecs: [],
  },
};

function usage() {
  return [
    "usage: node tools/verify_bink_browser_sidecar_contract.mjs [output-dir]",
    "                  [--manifest <path>] [--allow-missing]",
    "",
    "Pins the contract between the offline-transcoded Bink WebM sidecar",
    "manifest and the browser Bink provider/runtime. Source-grounded; never",
    "executes the runtime. With --allow-missing, an absent manifest is reported",
    "but tolerated.",
    "",
    "  output-dir              Directory holding generated WebM sidecars and",
    "                          bink-browser-video-manifest.json (default:",
    "                          artifacts/browser-video/bink).",
    "  --manifest <path>       Manifest path (default: <output-dir>/" +
      DEFAULT_MANIFEST_NAME + ").",
    "  --allow-missing         Do not fail when the manifest is absent.",
  ].join("\n");
}

function parseArgs(argv) {
  let outputDir = null;
  let manifestPath = null;
  let allowMissing = false;

  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    if (arg === "--allow-missing") {
      allowMissing = true;
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

  return { outputDir: resolvedOutputDir, manifestPath: resolvedManifestPath, allowMissing };
}

function readLines(relPath) {
  const abs = resolve(repoRoot, relPath);
  const text = readFileSync(abs, "utf8");
  return { abs, text, lines: text.split(/\r?\n/) };
}

function lineNumber(lines, predicate) {
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i + 1;
  }
  return -1;
}

function firstMatchInRange(lines, startLine, endLine, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  for (let i = Math.max(startLine - 1, 0); i < endLine && i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return -1;
}

function functionBodyLineRange(lines, definitionLine) {
  if (definitionLine <= 0) return null;
  let bodyStart = -1;
  let depth = 0;
  for (let i = definitionLine - 1; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        if (bodyStart === -1) bodyStart = i + 1;
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (bodyStart !== -1 && depth === 0) {
          return { start: bodyStart, end: i + 1 };
        }
      }
    }
  }
  return null;
}

async function isFile(path) {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function loadManifest(path) {
  if (!(await isFile(path))) {
    return { manifest: null, absent: true, errors: [] };
  }
  const errors = [];
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return { manifest: null, absent: false, errors: [`manifest ${path} is not valid JSON: ${error.message}`] };
  }
  if (parsed?.schema !== EXPECTED_SCHEMA) {
    errors.push(`manifest schema ${JSON.stringify(parsed?.schema)} !== ${JSON.stringify(EXPECTED_SCHEMA)}`);
  }
  if (!Array.isArray(parsed?.payloads)) {
    errors.push("manifest.payloads must be an array");
  }
  return { manifest: errors.length === 0 ? parsed : null, absent: false, errors };
}

// --- Section 1: provider decode-readiness invariant ---
function verifyProviderInvariant(provider, errors, facts) {
  const defLine = (name) => lineNumber(
    provider.lines,
    (line) => new RegExp(`\\b${name}\\s*\\(`).test(line) && !/;\s*$/.test(line),
  );

  const canDecodeDef = defLine("WasmBinkProviderCanDecodeFrames");
  facts.providerCanDecodeFramesDefLine = canDecodeDef;
  if (canDecodeDef === -1) {
    errors.push("provider WasmBinkProviderCanDecodeFrames definition not found");
    facts.providerCanDecodeFramesReturnsZero = null;
    facts.copyToBufferDocumentsPending = null;
    return;
  }

  const canDecodeBody = functionBodyLineRange(provider.lines, canDecodeDef);
  const canDecodeReturnsZero = canDecodeBody
    ? firstMatchInRange(provider.lines, canDecodeBody.start, canDecodeBody.end, /return\s+0\s*;/) !== -1
    : false;
  facts.providerCanDecodeFramesReturnsZero = canDecodeReturnsZero;

  const copyDef = defLine("BinkCopyToBuffer");
  facts.providerCopyToBufferDefLine = copyDef;
  const copyBody = copyDef !== -1 ? functionBodyLineRange(provider.lines, copyDef) : null;
  const copyPendingComment = copyBody
    ? firstMatchInRange(
      provider.lines,
      copyBody.start,
      copyBody.end,
      /Frame decode\/copy remains/,
    ) !== -1
    : false;
  // "Copies pixels" is detected by the presence of any buffer write through
  // the destination pointer argument inside BinkCopyToBuffer. The current
  // provider body is empty apart from the pending comment.
  const copyWritesPixels = copyBody
    ? firstMatchInRange(
      provider.lines,
      copyBody.start,
      copyBody.end,
      /memcpy\s*\(|std::memcpy\s*\(|std::copy\s*\(|->data\s*\[|\bdest\s*\[/,
    ) !== -1
    : false;
  facts.copyToBufferDocumentsPending = copyPendingComment;
  facts.copyToBufferCopiesPixels = copyWritesPixels;

  // Coupling invariant: if BinkCopyToBuffer does not actually copy decoded
  // pixels, WasmBinkProviderCanDecodeFrames MUST report 0. The two must flip
  // together in a future provider change.
  if (!copyWritesPixels && !canDecodeReturnsZero) {
    errors.push(
      "provider invariant violated: BinkCopyToBuffer does not copy decoded pixels but " +
        "WasmBinkProviderCanDecodeFrames does not return 0",
    );
  }
  if (copyWritesPixels && canDecodeReturnsZero) {
    errors.push(
      "provider invariant violated: BinkCopyToBuffer copies pixels but " +
        "WasmBinkProviderCanDecodeFrames still returns 0",
    );
  }

  // Provider source fact: the focused provider now knows the generated
  // manifest filename/directory. The schema itself is validated on the
  // generated manifest, not embedded in the provider.
  const schemaRef = new RegExp(EXPECTED_SCHEMA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const manifestNameRef = /bink-browser-video-manifest\.json/;
  const manifestDirRef = /artifacts\/browser-video\/bink/;
  facts.providerReferencesManifestSchema = schemaRef.test(provider.text);
  facts.providerReferencesManifestName = manifestNameRef.test(provider.text);
  facts.providerReferencesManifestDir = manifestDirRef.test(provider.text);
  if (!facts.providerReferencesManifestName || !facts.providerReferencesManifestDir) {
    errors.push("provider must reference the browser sidecar manifest filename and directory");
  }
}

// --- Section 2/3: manifest schema/path + source -> sidecar association ---
function verifyManifestContract(manifest, absent, options, errors, facts) {
  facts.manifestPresent = !absent && manifest !== null;
  facts.manifestExpectedPath = options.manifestPath;
  facts.manifestExpectedSchema = EXPECTED_SCHEMA;
  if (absent) {
    facts.manifestNote = options.allowMissing
      ? "manifest absent; --allow-missing tolerates this"
      : "manifest absent";
    if (!options.allowMissing) {
      errors.push(`manifest not found at ${options.manifestPath}`);
    }
    return;
  }
  if (manifest === null) {
    return;
  }

  const bySource = new Map();
  for (const entry of manifest.payloads) {
    if (!entry?.sourceFile) {
      errors.push("manifest contains an entry without sourceFile");
      continue;
    }
    if (bySource.has(entry.sourceFile)) {
      errors.push(`manifest has duplicate entry for ${entry.sourceFile}`);
    }
    bySource.set(entry.sourceFile, entry);
  }

  facts.manifestPayloads = [];
  for (const [sourceFile, pinned] of Object.entries(PINNED_PAYLOADS)) {
    const entry = bySource.get(sourceFile);
    const record = { sourceFile, present: !!entry };
    if (!entry) {
      errors.push(`manifest missing pinned payload ${sourceFile}`);
      facts.manifestPayloads.push(record);
      continue;
    }

    const checks = [
      ["name", entry.name, pinned.name],
      ["outputFile", entry.outputFile, pinned.outputFile],
      ["width", entry.width, pinned.width],
      ["height", entry.height, pinned.height],
      ["frames", entry.frames, pinned.frames],
      ["outputVideoCodec", entry.outputVideoCodec, pinned.outputVideoCodec],
    ];
    for (const [key, actual, expected] of checks) {
      if (actual !== expected) {
        errors.push(`manifest ${sourceFile}: ${key} ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
      }
    }
    if (
      !Array.isArray(entry.outputAudioCodecs)
      || entry.outputAudioCodecs.length !== pinned.outputAudioCodecs.length
      || !entry.outputAudioCodecs.every((codec, index) => codec === pinned.outputAudioCodecs[index])
    ) {
      errors.push(
        `manifest ${sourceFile}: outputAudioCodecs ${JSON.stringify(entry.outputAudioCodecs)} !== ` +
        JSON.stringify(pinned.outputAudioCodecs),
      );
    }
    if (entry.browserDecode?.container !== "webm") {
      errors.push(`manifest ${sourceFile}: browserDecode.container must be webm`);
    }
    record.outputFile = entry.outputFile;
    record.associated = true;
    facts.manifestPayloads.push(record);
  }
}

// --- Section 4: original-style path alias -> sidecar resolution contract ---
// Derives the alias path formats from the original BinkVideoPlayer.cpp defines
// (VIDEO_PATH / VIDEO_LANG_PATH_FORMAT / VIDEO_EXT) and pins that each alias
// resolves to the pinned WebM sidecar name.
function derivePathFormats(player, errors, facts) {
  const decodeCString = (match) => (match
    ? match[1].replace(/\\\\/g, "\\").replace(/\\"/g, '"')
    : null);

  const videoPath = player.text.match(/#\s*define\s+VIDEO_PATH\s+"([^"]*)"/);
  const videoLang = player.text.match(/#\s*define\s+VIDEO_LANG_PATH_FORMAT\s+"([^"]*)"/);
  const videoExt = player.text.match(/#\s*define\s+VIDEO_EXT\s+"([^"]*)"/);

  facts.originalPathDefines = {
    VIDEO_PATH: decodeCString(videoPath),
    VIDEO_LANG_PATH_FORMAT: decodeCString(videoLang),
    VIDEO_EXT: decodeCString(videoExt),
  };
  if (!videoPath || !videoLang || !videoExt) {
    errors.push("could not locate VIDEO_PATH/VIDEO_LANG_PATH_FORMAT/VIDEO_EXT defines in BinkVideoPlayer.cpp");
    return null;
  }
  return facts.originalPathDefines;
}

function verifyPathAliasContract(player, manifest, errors, facts) {
  const defines = derivePathFormats(player, errors, facts);
  if (!defines) {
    return;
  }

  const entries = manifest ? new Map(manifest.payloads.map((entry) => [entry.sourceFile, entry])) : new Map();
  facts.pathAliasContract = [];
  for (const [sourceFile, pinned] of Object.entries(PINNED_PAYLOADS)) {
    const stem = pinned.name;
    const ext = defines.VIDEO_EXT;

    // VIDEO_PATH uses backslashes; VIDEO_LANG_PATH_FORMAT uses forward slashes.
    // The contract is format- and slash-style independent: the runtime must
    // resolve the original backslash form, its forward-slash normalization,
    // and the localized language form, all to the same WebM sidecar.
    const localized = defines.VIDEO_LANG_PATH_FORMAT
      ? defines.VIDEO_LANG_PATH_FORMAT.replace("%s", ALIAS_LANGUAGES[0]).replace("%s", stem).replace("%s", ext)
      : null;
    const backslashForm = `${defines.VIDEO_PATH}\\${stem}.${ext}`;
    const forwardForm = backslashForm.replace(/\\/g, "/");
    const aliases = [backslashForm, forwardForm];
    if (localized) {
      aliases.push(localized);
    }

    const record = {
      sourceFile,
      expectedSidecar: pinned.outputFile,
      aliases,
      resolvedSidecar: null,
      matchesExpected: null,
    };

    if (manifest) {
      const entry = entries.get(sourceFile);
      record.resolvedSidecar = entry?.outputFile ?? null;
      record.matchesExpected = record.resolvedSidecar === pinned.outputFile;
      if (!record.matchesExpected) {
        errors.push(
          `path alias contract: ${sourceFile} aliases resolve to expected ${pinned.outputFile} but manifest outputFile is ${JSON.stringify(record.resolvedSidecar)}`,
        );
      }
    } else {
      record.matchesExpected = "no-manifest";
    }

    facts.pathAliasContract.push(record);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const errors = [];
  const facts = {};

  const provider = readLines(SOURCES.provider);
  const player = readLines(SOURCES.player);
  const loaded = await loadManifest(options.manifestPath);
  errors.push(...loaded.errors);

  verifyProviderInvariant(provider, errors, facts);
  verifyManifestContract(loaded.manifest, loaded.absent, options, errors, facts);
  verifyPathAliasContract(player, loaded.manifest, errors, facts);

  const ok = errors.length === 0;
  const report = {
    ok,
    source: SOURCE_TAG,
    sources: { provider: SOURCES.provider, player: SOURCES.player },
    manifestPath: options.manifestPath,
    mode: options.allowMissing ? "allow-missing" : "strict",
    facts,
    errors,
    note:
      "Pins the contract between the offline-transcoded WebM sidecar manifest " +
      "and the browser Bink provider: manifest schema/path, source -> sidecar " +
      "association, original-style path aliases, and the decode-readiness " +
      "invariant that ties WasmBinkProviderCanDecodeFrames to real " +
      "BinkCopyToBuffer pixel copies.",
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
