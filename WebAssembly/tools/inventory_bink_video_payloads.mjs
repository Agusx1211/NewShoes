#!/usr/bin/env node
// inventory_bink_video_payloads.mjs
//
// Indexes the current BIGF runtime archive set plus any loose `.bik` files
// already present under the assets directory, and reports a source/data
// inventory of shipped Bink video payloads. It reuses the existing BIGF
// directory-reading style from `inventory_startup_archives.mjs` /
// `inventory_audio_payloads.mjs` rather than inventing a new archive format.
//
// This is a data preflight only. It sniffs a small header prefix from each
// entry and classifies the leading signature; it does NOT decode, demux, or
// play Bink video.
//
// Output JSON shape:
//   { ok, source, assetsDir, archiveCount, videoEntryCount, byArchive, entries,
//     looseBikFiles, looseBikCount, dataCabPresent, looseBikExtractionRequired,
//     errors, note }
//
// `--expect-current-zh` self-checks the JSON shape against the current Zero
// Hour runtime asset set. The expectation reflects the data actually observed:
// the current runtime BIG set contains no `.bik` entries, and the assets dir
// is in one of two honest loose-file states for the disc cabinet (Data1.cab)
// Bink files (GC_Background.bik / VS_small.bik): either not extracted yet
// (zero loose `.bik`) or extracted (exactly those two loose `.bik` files with
// BIK/KB2 signatures). This does not invent entries.

import { open, readdir, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");

// Disc installer cabinet that ships the loose top-level Bink files for Zero
// Hour. Its presence is reported so the inventory can distinguish "no loose
// Bink extracted yet" from "loose Bink extraction already done but empty".
const DISC_CAB_NAME = "Data1.cab";

// Top-level loose Bink filenames known to ship inside Data1.cab for the
// current Zero Hour disc. Reported only as a "what to expect after cabinet
// extraction" hint; the inventory never invents them as present entries.
const EXPECTED_LOOSE_CAB_BIKS = ["GC_Background.bik", "VS_small.bik"];

function usage() {
  return [
    "usage: node tools/inventory_bink_video_payloads.mjs [assets-dir]",
    "                  [--expect-current-zh]",
    "",
    "Indexes BIGF archives and the assets dir for shipped Bink video payloads",
    "(`.bik`, case-insensitive). Sniffs a small header prefix from each entry",
    "and classifies the leading signature. Does not decode video.",
    "",
    "  --expect-current-zh     Self-check the JSON shape against the current",
    "                          Zero Hour runtime asset set. The expectation",
    "                          reflects the data actually observed: the current",
    "                          runtime BIG set has no `.bik` entries, and the",
    "                          assets dir is in one of two honest loose-file",
    "                          states for the disc cabinet (Data1.cab) Bink",
    "                          files (GC_Background.bik / VS_small.bik): either",
    "                          not extracted yet (zero loose `.bik`) or",
    "                          extracted (exactly those two loose `.bik` files",
    "                          with BIK/KB2 signatures).",
  ].join("\n");
}

function normalizeEntryPath(path) {
  return String(path ?? "").replaceAll("/", "\\").toLowerCase();
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
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
    ? resolve(wasmRoot, "artifacts/real-assets")
    : resolve(process.cwd(), assetsDir);
  return { assetsDir: resolvedAssetsDir, expectCurrentZh };
}

async function readExact(file, position, length, context) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error(
      `${context}: expected ${length} bytes at ${position}, read ${bytesRead}`,
    );
  }
  return buffer;
}

// Same BIGF directory reader contract used by inventory_startup_archives.mjs
// and inventory_audio_payloads.mjs: mixed-endian header (little-endian archive
// size, big-endian entry count and per-entry offset/size), NUL-terminated
// ASCII path names, streamed directory read.
async function readBigDirectory(bigPath) {
  const file = await open(bigPath, "r");
  try {
    const fileStat = await file.stat();
    const header = await readExact(file, 0, 16, bigPath);
    if (header.toString("ascii", 0, 4) !== "BIGF") {
      throw new Error(`Not a BIGF archive: ${bigPath}`);
    }

    const archiveSize = header.readUInt32LE(4);
    const entryCount = header.readUInt32BE(8);
    if (archiveSize > fileStat.size) {
      throw new Error(
        `BIGF header size exceeds file size for ${bigPath}: ${archiveSize} > ${fileStat.size}`,
      );
    }
    if (entryCount > 1000000) {
      throw new Error(`Unreasonable BIGF entry count in ${bigPath}: ${entryCount}`);
    }

    const entries = [];
    const chunkSize = 64 * 1024;
    let directory = Buffer.alloc(0);
    let cursor = 0;

    async function ensureDirectoryBytes(requiredLength) {
      while (directory.length < requiredLength) {
        const start = 0x10 + directory.length;
        const remaining = fileStat.size - start;
        if (remaining <= 0) {
          throw new Error(`BIGF directory ended early in ${bigPath}`);
        }
        const length = Math.min(chunkSize, remaining);
        const next = await readExact(file, start, length, bigPath);
        directory = Buffer.concat([directory, next]);
      }
    }

    for (let index = 0; index < entryCount; ++index) {
      await ensureDirectoryBytes(cursor + 9);
      const offset = directory.readUInt32BE(cursor);
      const size = directory.readUInt32BE(cursor + 4);
      const pathStart = cursor + 8;
      let pathEnd = directory.indexOf(0, pathStart);
      while (pathEnd < 0) {
        await ensureDirectoryBytes(directory.length + 1);
        pathEnd = directory.indexOf(0, pathStart);
      }

      const path = directory.toString("ascii", pathStart, pathEnd);
      if (offset + size > fileStat.size) {
        throw new Error(`BIGF entry extends past archive end in ${bigPath}: ${path}`);
      }
      entries.push({
        path,
        normalizedPath: normalizeEntryPath(path),
        offset,
        size,
      });
      cursor = pathEnd + 1;
    }

    return { archiveSize, entryCount, entries };
  } finally {
    await file.close();
  }
}

async function findBigArchives(assetsDir) {
  const dirStat = await stat(assetsDir);
  if (!dirStat.isDirectory()) {
    throw new Error(`Assets path is not a directory: ${assetsDir}`);
  }

  const entries = await readdir(assetsDir);
  const archivePaths = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith(".big")) {
      continue;
    }
    const archivePath = resolve(assetsDir, entry);
    const archiveStat = await stat(archivePath);
    if (archiveStat.isFile()) {
      archivePaths.push(archivePath);
    }
  }
  return archivePaths.sort((left, right) =>
    basename(left).localeCompare(basename(right)));
}

function entryExtension(path) {
  const normalized = normalizeEntryPath(path);
  const dot = normalized.lastIndexOf(".");
  return dot >= 0 ? normalized.slice(dot + 1) : "";
}

function isBikEntry(path) {
  return entryExtension(path) === "bik";
}

// Sniff a small header prefix from an entry. BIG entries are read at their
// archive offset; loose files are read at offset 0.
async function readHeaderPrefix(sourceDescriptor, length) {
  const file = await open(sourceDescriptor.path, "r");
  try {
    const safeLength = Math.min(length, sourceDescriptor.size);
    if (safeLength <= 0) {
      return Buffer.alloc(0);
    }
    return await readExact(
      file,
      sourceDescriptor.offset,
      safeLength,
      sourceDescriptor.label,
    );
  } finally {
    await file.close();
  }
}

// Bink files begin with a 3-byte ASCII signature followed by a 1-byte
// format/version code. Classic Bink is "BIK" (0x42 0x49 0x4b) plus a version
// byte (e.g. 'b', 'i', '2', '3', '4'); Bink 2 / newer files use "KB2"
// (0x4b 0x42 0x32). Bytes 4..7 carry header flags / implied size. We classify
// on the leading signature only and do not parse the full container.
function classifySignature(buffer) {
  if (buffer.length >= 3 &&
      buffer[0] === 0x42 && buffer[1] === 0x49 && buffer[2] === 0x4b) {
    const version = buffer.length >= 4 ? String.fromCharCode(buffer[3]) : "";
    return { signature: "BIK", classification: `bink-${version || "unknown"}`, bink: true };
  }
  if (buffer.length >= 3 &&
      buffer[0] === 0x4b && buffer[1] === 0x42 && buffer[2] === 0x32) {
    return { signature: "KB2", classification: "bink2", bink: true };
  }
  return { signature: "", classification: "nonBink", bink: false };
}

function toHex(buffer) {
  return buffer.length === 0 ? "" : buffer.toString("hex").toUpperCase();
}

async function buildEntryRecord(sourceDescriptor, path) {
  const headerLength = 16;
  const header = await readHeaderPrefix(sourceDescriptor, headerLength);
  const { signature, classification, bink } = classifySignature(header);
  return {
    source: sourceDescriptor.source,
    archive: sourceDescriptor.archive ?? null,
    path,
    extension: entryExtension(path),
    offset: sourceDescriptor.offset,
    size: sourceDescriptor.size,
    headerLength: header.length,
    headerHex: toHex(header),
    signature,
    classification,
    bink,
  };
}

async function buildInventory(assetsDir, options) {
  const errors = [];

  // --- BIG archives ---
  const archivePaths = await findBigArchives(assetsDir);
  const archives = [];
  const bigEntries = []; // all BIG entries (video only kept)
  const videoEntries = [];
  const byArchive = {};

  for (const archivePath of archivePaths) {
    let directory;
    try {
      directory = await readBigDirectory(archivePath);
    } catch (error) {
      errors.push(`Failed to read archive ${basename(archivePath)}: ${error.message}`);
      continue;
    }
    const archive = {
      name: basename(archivePath),
      path: archivePath,
      size: directory.archiveSize,
      entryCount: directory.entryCount,
      videoEntryCount: 0,
    };
    archives.push(archive);
    byArchive[archive.name] = { videoEntryCount: 0, entries: [] };

    for (const entry of directory.entries) {
      bigEntries.push(entry);
      if (!isBikEntry(entry.path)) {
        continue;
      }
      const record = await buildEntryRecord(
        {
          source: "big",
          archive: archive.name,
          path: archivePath,
          offset: entry.offset,
          size: entry.size,
          label: `${archive.name}!${entry.path}`,
        },
        entry.path,
      );
      videoEntries.push(record);
      archive.videoEntryCount += 1;
      byArchive[archive.name].videoEntryCount += 1;
      byArchive[archive.name].entries.push(record);
    }
  }

  // --- Loose `.bik` files directly under the assets dir ---
  // The current Zero Hour disc ships top-level Bink files inside the
  // `Data1.cab` installer cabinet (e.g. GC_Background.bik, VS_small.bik) rather
  // than inside BIG archives. Loose files only appear once that cabinet has
  // been extracted into the assets dir, so we report both the loose scan and
  // the cabinet presence so the runtime can tell "not yet extracted" apart
  // from "extracted but empty".
  const looseBikFiles = [];
  let dataCabPresent = false;
  let dataCabSize = null;

  const dirEntries = await readdir(assetsDir);
  for (const entry of dirEntries) {
    const lower = entry.toLowerCase();
    const entryPath = resolve(assetsDir, entry);
    let entryStat;
    try {
      entryStat = await stat(entryPath);
    } catch {
      continue;
    }
    if (!entryStat.isFile()) {
      continue;
    }
    if (lower === DISC_CAB_NAME.toLowerCase()) {
      dataCabPresent = true;
      dataCabSize = entryStat.size;
      continue;
    }
    if (!lower.endsWith(".bik")) {
      continue;
    }
    const record = await buildEntryRecord(
      {
        source: "loose",
        archive: null,
        path: entryPath,
        offset: 0,
        size: entryStat.size,
        label: entry,
      },
      entry,
    );
    looseBikFiles.push(record);
  }

  looseBikFiles.sort((left, right) => left.path.localeCompare(right.path));

  // Loose extraction is required when no loose `.bik` is present yet. This is
  // informational; it is not a tool failure.
  const looseBikExtractionRequired = looseBikFiles.length === 0;

  const entries = [
    ...videoEntries,
    ...looseBikFiles.map((record) => ({ ...record })),
  ];

  const report = {
    ok: errors.length === 0,
    source: "WebAssembly/tools/inventory_bink_video_payloads.mjs",
    assetsDir,
    archiveCount: archives.length,
    bigEntryCount: bigEntries.length,
    videoEntryCount: entries.length,
    bikInBigCount: videoEntries.length,
    looseBikCount: looseBikFiles.length,
    byArchive,
    entries,
    looseBikFiles,
    dataCab: {
      name: DISC_CAB_NAME,
      present: dataCabPresent,
      size: dataCabSize,
      expectedLooseBiks: EXPECTED_LOOSE_CAB_BIKS,
    },
    looseBikExtractionRequired,
    archives: archives.map((archive) => ({
      name: archive.name,
      size: archive.size,
      entryCount: archive.entryCount,
      videoEntryCount: archive.videoEntryCount,
    })),
    errors,
    note:
      "Bink video payload source/data inventory. Sniffs a small header prefix " +
      "and classifies the leading signature only; it does not decode, demux, " +
      "or play Bink video. Loose `.bik` files are only present once the disc " +
      "installer cabinet (Data1.cab) has been extracted into the assets dir.",
  };

  if (options.expectCurrentZh) {
    assertShapeForCurrentZh(report);
  }

  return report;
}

function assertShapeForCurrentZh(report) {
  const failures = [];

  if (report.archiveCount <= 0) {
    failures.push("expected at least one BIG archive");
  }

  // The current Zero Hour runtime BIG set contains no `.bik` entries. We pin
  // this honest observation rather than inventing entries.
  if (report.bikInBigCount !== 0) {
    failures.push(
      `expected zero \`.bik\` entries inside BIG archives on the current Zero Hour runtime set, found ${report.bikInBigCount}`,
    );
  }
  for (const archive of report.archives) {
    if (archive.videoEntryCount !== 0) {
      failures.push(
        `expected archive ${archive.name} to have zero video entries, found ${archive.videoEntryCount}`,
      );
    }
  }

  // The disc installer cabinet (Data1.cab) ships the loose top-level Bink
  // files (GC_Background.bik, VS_small.bik). The assets dir may legitimately
  // be in either of two honest states, depending on whether main has run the
  // loose extraction yet:
  //   1. not extracted yet: zero loose `.bik`, looseBikExtractionRequired true
  //      (and Data1.cab may or may not be present in the assets dir); or
  //   2. extracted: exactly GC_Background.bik and VS_small.bik as loose
  //      `.bik` files, each with a BIK or KB2 Bink signature.
  const expectedLooseNames = EXPECTED_LOOSE_CAB_BIKS.slice().sort();
  const actualLooseNames = report.looseBikFiles
    .map((entry) => entry.path)
    .sort();

  const extracted = actualLooseNames.length > 0;
  if (extracted) {
    if (actualLooseNames.length !== expectedLooseNames.length) {
      failures.push(
        `expected zero or exactly ${expectedLooseNames.length} loose \`.bik\` files on the current Zero Hour assets dir, found ${actualLooseNames.length}: ${actualLooseNames.join(", ")}`,
      );
    } else {
      for (let i = 0; i < expectedLooseNames.length; ++i) {
        if (actualLooseNames[i] !== expectedLooseNames[i]) {
          failures.push(
            `expected loose \`.bik\` set ${JSON.stringify(expectedLooseNames)} but found ${JSON.stringify(actualLooseNames)}`,
          );
          break;
        }
      }
    }
    for (const entry of report.looseBikFiles) {
      if (!entry.bink) {
        failures.push(
          `expected loose ${entry.path} to carry a BIK/KB2 Bink signature, found signature=${JSON.stringify(entry.signature)} classification=${entry.classification}`,
        );
      }
    }
    if (report.looseBikExtractionRequired) {
      failures.push(
        "expected looseBikExtractionRequired to be false when loose `.bik` files are present",
      );
    }
  } else {
    if (!report.looseBikExtractionRequired) {
      failures.push(
        "expected looseBikExtractionRequired to be true when no loose `.bik` files are present",
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Current Zero Hour Bink video payload inventory self-check failed: ${failures.join("; ")}`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const report = await buildInventory(options.assetsDir, options);
    if (!report.ok) {
      fail(
        `Bink video payload inventory failed: ${report.errors.join("; ")}`,
      );
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    fail(error?.stack ?? error?.message ?? String(error));
  }
}

main();
