#!/usr/bin/env node
// verify_bink_payload_header_contract.mjs
//
// Bounded real-data verifier for the shipped loose Bink payload headers.
//
// It reads the actual loose `.bik` files that `extract_zh_runtime_archives.sh`
// drops into `WebAssembly/artifacts/real-assets` (`GC_Background.bik` and
// `VS_small.bik`), and parses only the source-grounded classic-BINK header
// fields that are visible in the real files and needed by the browser Bink
// provider front end (size / frame count / largest frame / width / height /
// fps). It does NOT decode, demux, or play Bink video, and it does not invent
// decode behavior.
//
// The classic BINK container header (the format these two payloads actually
// carry) is little-endian and begins:
//
//   offset 0  : 3-byte ASCII signature ("BIK")
//   offset 3  : 1-byte format/version code (e.g. 'i' for BIKi)
//   offset 4  : u32 size field (file size minus 8)
//   offset 8  : u32 frame count
//   offset 12 : u32 largest frame size
//   offset 16 : u32 frame count (repeated)
//   offset 20 : u32 width
//   offset 24 : u32 height
//   offset 28 : u32 fps numerator
//   offset 32 : u32 fps denominator
//   offset 36 : u32 video flags / etc. (reported but not interpreted)
//
// Output JSON shape:
//   { ok, errors, payloads, source }
//
// `--expect-current-zh` self-checks the parsed header facts against the values
// pinned from the actually shipped files. If the loose `.bik` files are
// absent, it prints a clear error telling the user to run
// `npm run extract:runtime-archives` first and exits nonzero.

import { open, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");

const DEFAULT_ASSETS_DIR = resolve(wasmRoot, "artifacts/real-assets");

// Loose Bink payloads shipped inside Data1.cab and extracted into the assets
// dir by extract_zh_runtime_archives.sh.
const PAYLOAD_FILES = ["GC_Background.bik", "VS_small.bik"];

// Classic BINK header layout (little-endian). Only fields visible in the real
// files and needed by the browser Bink provider front end are parsed.
const HEADER_LENGTH = 48; // covers through the fields we read
const MAGIC_OFFSET = 0;
const MAGIC_LENGTH = 3;
const VERSION_OFFSET = 3;
const SIZE_FIELD_OFFSET = 4;
const FRAME_COUNT_OFFSET = 8;
const LARGEST_FRAME_OFFSET = 12;
const FRAME_COUNT_DUP_OFFSET = 16;
const WIDTH_OFFSET = 20;
const HEIGHT_OFFSET = 24;
const FPS_NUM_OFFSET = 28;
const FPS_DEN_OFFSET = 32;
const FLAGS_OFFSET = 36;

const BIK_MAGIC = "BIK";

// Pinned facts for the two shipped payloads, measured from the real extracted
// files. These are the contract this verifier enforces under
// `--expect-current-zh`.
const PINNED_FACTS = {
  "GC_Background.bik": {
    fileSize: 149700,
    version: "i",
    sizeField: 149692,
    frameCount: 180,
    largestFrame: 26460,
    frameCountDup: 180,
    width: 800,
    height: 600,
    fpsNum: 30,
    fpsDen: 1,
  },
  "VS_small.bik": {
    fileSize: 310128,
    version: "i",
    sizeField: 310120,
    frameCount: 71,
    largestFrame: 9880,
    frameCountDup: 71,
    width: 96,
    height: 120,
    fpsNum: 30,
    fpsDen: 1,
  },
};

function usage() {
  return [
    "usage: node tools/verify_bink_payload_header_contract.mjs [assets-dir]",
    "                  [--expect-current-zh]",
    "",
    "Parses the shipped loose Bink payload headers (GC_Background.bik,",
    "VS_small.bik) from the assets dir and verifies the source-grounded",
    "classic-BINK header fields. Does not decode video.",
    "",
    "  --expect-current-zh     Self-check the parsed header facts against the",
    "                          values pinned from the actually shipped files.",
  ].join("\n");
}

function parseArgs(argv) {
  let assetsDir = null;
  let expectCurrentZh = false;
  for (const arg of argv) {
    if (arg === "--expect-current-zh") {
      expectCurrentZh = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (assetsDir === null) {
      assetsDir = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  const resolvedAssetsDir = assetsDir === null
    ? DEFAULT_ASSETS_DIR
    : resolve(process.cwd(), assetsDir);
  return { assetsDir: resolvedAssetsDir, expectCurrentZh };
}

async function fileExists(path) {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function readExact(file, position, length, label) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error(
      `${label}: expected ${length} bytes at offset ${position}, read ${bytesRead}`,
    );
  }
  return buffer;
}

function readClassicBinkHeader(header, fileSize) {
  const magic = header.toString("ascii", MAGIC_OFFSET, MAGIC_OFFSET + MAGIC_LENGTH);
  const version = String.fromCharCode(header[VERSION_OFFSET]);
  return {
    magic,
    version,
    signature: `${BIK_MAGIC}${version}`,
    sizeField: header.readUInt32LE(SIZE_FIELD_OFFSET),
    frameCount: header.readUInt32LE(FRAME_COUNT_OFFSET),
    largestFrame: header.readUInt32LE(LARGEST_FRAME_OFFSET),
    frameCountDup: header.readUInt32LE(FRAME_COUNT_DUP_OFFSET),
    width: header.readUInt32LE(WIDTH_OFFSET),
    height: header.readUInt32LE(HEIGHT_OFFSET),
    fpsNum: header.readUInt32LE(FPS_NUM_OFFSET),
    fpsDen: header.readUInt32LE(FPS_DEN_OFFSET),
    flags: header.readUInt32LE(FLAGS_OFFSET),
    expectedSizeField: fileSize - 8,
  };
}

async function parsePayload(assetsDir, fileName, errors) {
  const filePath = resolve(assetsDir, fileName);
  const file = await open(filePath, "r");
  try {
    const fileStat = await file.stat();
    const fileSize = fileStat.size;
    const header = await readExact(file, 0, HEADER_LENGTH, fileName);
    const parsed = readClassicBinkHeader(header, fileSize);

    const headerErrors = [];

    if (parsed.magic !== BIK_MAGIC) {
      headerErrors.push(
        `magic bytes ${JSON.stringify(parsed.magic)} !== ${JSON.stringify(BIK_MAGIC)}`,
      );
    }

    // The size field is documented as file size minus 8 (the 3-byte magic +
    // 1-byte version + the 4-byte size field itself).
    if (parsed.sizeField !== parsed.expectedSizeField) {
      headerErrors.push(
        `size field ${parsed.sizeField} !== file size - 8 (${parsed.expectedSizeField})`,
      );
    }

    return {
      file: fileName,
      path: filePath,
      fileSize,
      headerLength: header.length,
      headerHex: header.toString("hex").toUpperCase(),
      fields: parsed,
      errors: headerErrors,
    };
  } finally {
    await file.close();
  }
}

function assertPinnedFacts(payload, pinned, failures) {
  const f = payload.fields;
  const checks = [
    ["fileSize", payload.fileSize, pinned.fileSize],
    ["version", f.version, pinned.version],
    ["sizeField", f.sizeField, pinned.sizeField],
    ["frameCount", f.frameCount, pinned.frameCount],
    ["largestFrame", f.largestFrame, pinned.largestFrame],
    ["frameCountDup", f.frameCountDup, pinned.frameCountDup],
    ["width", f.width, pinned.width],
    ["height", f.height, pinned.height],
    ["fpsNum", f.fpsNum, pinned.fpsNum],
    ["fpsDen", f.fpsDen, pinned.fpsDen],
  ];
  for (const [name, actual, expected] of checks) {
    if (actual !== expected) {
      failures.push(
        `${payload.file}: pinned ${name} ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`,
      );
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // If the loose payloads are absent, print a clear error and exit nonzero.
  const missing = [];
  for (const fileName of PAYLOAD_FILES) {
    if (!(await fileExists(resolve(options.assetsDir, fileName)))) {
      missing.push(fileName);
    }
  }
  if (missing.length > 0) {
    const message =
      `Missing loose Bink payload(s) under ${options.assetsDir}: ${missing.join(", ")}.\n` +
      `Run \`npm run extract:runtime-archives\` first to extract them from the disc cabinet (Data1.cab).`;
    console.error(message);
    console.log(
      JSON.stringify(
        {
          ok: false,
          errors: [message],
          payloads: [],
          source:
            "WebAssembly/tools/verify_bink_payload_header_contract.mjs",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const errors = [];
  const payloads = [];

  for (const fileName of PAYLOAD_FILES) {
    try {
      payloads.push(await parsePayload(options.assetsDir, fileName, errors));
    } catch (error) {
      errors.push(`${fileName}: ${error?.message ?? error}`);
    }
  }

  // Surface per-payload header errors into the top-level error list.
  for (const payload of payloads) {
    for (const headerError of payload.errors) {
      errors.push(`${payload.file}: ${headerError}`);
    }
  }

  if (options.expectCurrentZh) {
    const failures = [];
    for (const payload of payloads) {
      const pinned = PINNED_FACTS[payload.file];
      if (!pinned) {
        failures.push(`${payload.file}: no pinned facts registered`);
        continue;
      }
      assertPinnedFacts(payload, pinned, failures);
    }
    for (const failure of failures) {
      errors.push(failure);
    }
  }

  const report = {
    ok: errors.length === 0,
    errors,
    payloads,
    source: "WebAssembly/tools/verify_bink_payload_header_contract.mjs",
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
});
