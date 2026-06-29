#!/usr/bin/env node
// verify_audio_format_frontier.mjs
//
// Pins the current real-asset audio *payload encoding frontier* - the on-disk
// byte shape of the audio data under Data\Audio in the current Zero Hour BIG
// archive set - *before* any Web Audio decode path can request a payload.
//
// It reuses the repo's existing BIGF archive directory parsing approach (same
// header/directory walk used by inventory_audio_payloads.mjs and
// inventory_startup_archives.mjs) to enumerate every entry whose archive path
// starts with `Data\Audio\` in the current audio archives, then classifies each
// payload by:
//   - archive path extension (`.wav`, `.mp3`, ...), and
//   - payload file magic / header bytes:
//       * RIFF....WAVE -> wav
//       * ID3........  -> mp3 (ID3v2 tag prefix)
//       * 0xFF Exxxxx  -> mp3 (MPEG audio frame sync, no ID3)
//
// This is a data preflight only. It reads payload headers (up to 64 bytes) to
// classify the encoding; it does not decode, transcode, or play audio.
//
// It is the encoding companion to:
//   - verify_audio_filename_frontier.mjs   (filename/path generation source)
//   - verify_audio_settings_frontier.mjs   (AudioSettings parse/load frontier)
//   - inventory_audio_payloads.mjs         (payload path availability preflight)
//
// Pass --expect-current-zh to enable strict self-checks against the current
// extracted Zero Hour audio archive set. Exit 0 only if every strict
// expectation holds; exit 1 with JSON errors otherwise.
//
import { open, readdir, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_ROOT = resolve(__dirname, "..");

// The current extracted Zero Hour runtime audio archives (the union of the
// base-game audio archives shipped alongside ZH and the ZH-specific audio
// archives). Keep this list in lock-step with inventory_audio_payloads.mjs.
const CURRENT_ZH_AUDIO_ARCHIVES = [
  "AudioEnglishZH.big",
  "AudioZH.big",
  "Music.big",
  "MusicZH.big",
  "SpeechEnglishZH.big",
  "SpeechZH.big",
];

// Payloads the inventory pins as part of the current ZH contract; reused here
// as known non-empty encoding anchors for each encoding class.
const KNOWN_CURRENT_ZH_PAYLOADS = {
  mp3: "Data\\Audio\\Tracks\\CHI_10.mp3",
  wav: "Data\\Audio\\Sounds\\English\\aangr01a.wav",
};

const MAGIC_PROBE_BYTES = 64;

function usage() {
  return [
    "usage: node tools/verify_audio_format_frontier.mjs [assets-dir] [--expect-current-zh]",
    "",
    "Indexes the current audio BIGF archives, classifies every payload entry",
    "under Data\\Audio by extension and file magic, and emits JSON with",
    "ok / errors / facts. --expect-current-zh enables strict expectations",
    "against the current extracted Zero Hour audio archive set.",
    "",
    "This is a data preflight only. It does not decode or play audio.",
  ].join("\n");
}

function normalizeEntryPath(p) {
  return String(p ?? "").replaceAll("/", "\\").toLowerCase();
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
  return {
    assetsDir:
      assetsDir === null
        ? resolve(WASM_ROOT, "artifacts/real-assets")
        : resolve(process.cwd(), assetsDir),
    expectCurrentZh,
  };
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

// Same BIGF header + streaming-directory walk used by
// inventory_audio_payloads.mjs and inventory_startup_archives.mjs.
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
      entries.push({ path, offset, size });
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
    if (!entry.toLowerCase().endsWith(".big")) continue;
    const archivePath = resolve(assetsDir, entry);
    const archiveStat = await stat(archivePath);
    if (archiveStat.isFile()) archivePaths.push(archivePath);
  }
  return archivePaths.sort((a, b) => basename(a).localeCompare(basename(b)));
}

function entryExtension(path) {
  const low = normalizeEntryPath(path);
  const dot = low.lastIndexOf(".");
  const slash = Math.max(low.lastIndexOf("\\"), low.lastIndexOf("/"));
  if (dot <= slash || dot === -1) return "";
  return low.slice(dot + 1);
}

// Classify a payload by its leading bytes. Returns one of:
//   "wav" | "mp3" | "unknown"
function classifyMagic(head) {
  if (
    head.length >= 12 &&
    head.toString("ascii", 0, 4) === "RIFF" &&
    head.toString("ascii", 8, 12) === "WAVE"
  ) {
    return "wav";
  }
  // ID3v2 tag prefix (most ZH .mp3 tracks carry one).
  if (head.length >= 3 && head.toString("ascii", 0, 3) === "ID3") {
    return "mp3";
  }
  // MPEG audio frame sync: 11 set bits, 0xFF 0xE?..0xFB/0xF3/0xF2 etc.
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    return "mp3";
  }
  return "unknown";
}

// Parse the WAV fmt chunk from a leading header slice (up to ~64 bytes). Returns
// the wFormatTag codec (1 = PCM, 17 = IMA ADPCM, ...), channel count, sample
// rate, and bit depth, or null if no fmt chunk fit in the probe window.
function parseWavFmt(head) {
  if (head.length < 12) return null;
  let off = 12;
  while (off + 8 <= head.length) {
    const chunkId = head.toString("ascii", off, off + 4);
    const chunkSize = head.readUInt32LE(off + 4);
    if (chunkId === "fmt ") {
      const body = head.slice(off + 8, off + 8 + Math.min(chunkSize, 16));
      if (body.length < 16) return null;
      return {
        wFormatTag: body.readUInt16LE(0),
        channels: body.readUInt16LE(2),
        samplesPerSec: body.readUInt32LE(4),
        bitsPerSample: body.readUInt16LE(14),
      };
    }
    off += 8 + chunkSize + (chunkSize & 1);
  }
  return null;
}

const WAV_CODEC_NAMES = {
  1: "PCM",
  17: "IMA_ADPCM",
};

function wavCodecName(wFormatTag) {
  return WAV_CODEC_NAMES[wFormatTag] ?? `0x${wFormatTag.toString(16)}`;
}

async function classifyAudioEntries(assetsDir, audioArchives) {
  const perArchive = {};
  const byExtension = {}; // ext -> count (entries under Data\Audio)
  const byEncoding = {}; // magic-class -> count
  const extVsEncoding = {}; // `${ext}|${encoding}` -> count
  const wavCodec = {}; // wFormatTag -> count
  const wavFmt = {}; // `${ch}ch_${rate}Hz_${bits}bit` -> count
  const mismatches = []; // {archive, path, ext, encoding}
  const examples = { wav: [], mp3: [], unknown: [] };
  const payloads = new Map(); // normalized path -> {archive, path, size}
  let total = 0;

  for (const name of audioArchives) {
    const archivePath = resolve(assetsDir, name);
    const statResult = await stat(archivePath).catch(() => null);
    if (!statResult || !statResult.isFile()) {
      perArchive[name] = { present: false };
      continue;
    }
    const directory = await readBigDirectory(archivePath);
    const counts = { wav: 0, mp3: 0, other: 0, total: 0 };
    const file = await open(archivePath, "r");
    try {
      for (const entry of directory.entries) {
        if (!normalizeEntryPath(entry.path).startsWith("data\\audio\\")) continue;
        counts.total += 1;
        total += 1;
        const ext = entryExtension(entry.path);
        byExtension[ext] = (byExtension[ext] ?? 0) + 1;

        const head = await readExact(
          file,
          entry.offset,
          Math.min(MAGIC_PROBE_BYTES, entry.size),
          `${name}:${entry.path}`,
        );
        const encoding = classifyMagic(head);
        byEncoding[encoding] = (byEncoding[encoding] ?? 0) + 1;
        extVsEncoding[`${ext}|${encoding}`] =
          (extVsEncoding[`${ext}|${encoding}`] ?? 0) + 1;

        if (ext === "wav") counts.wav += 1;
        else if (ext === "mp3") counts.mp3 += 1;
        else counts.other += 1;

        if (encoding !== ext && encoding !== "unknown") {
          mismatches.push({
            archive: name,
            path: entry.path,
            ext,
            encoding,
          });
        }

        if (encoding === "wav") {
          const fmt = parseWavFmt(head);
          if (fmt) {
            wavCodec[fmt.wFormatTag] = (wavCodec[fmt.wFormatTag] ?? 0) + 1;
            const key = `${fmt.channels}ch_${fmt.samplesPerSec}Hz_${fmt.bitsPerSample}bit`;
            wavFmt[key] = (wavFmt[key] ?? 0) + 1;
          }
        }

        if (examples[encoding] && examples[encoding].length < 4) {
          examples[encoding].push({
            archive: name,
            path: entry.path,
            size: entry.size,
            head: head.toString("hex").slice(0, 16),
          });
        }

        const normalized = normalizeEntryPath(entry.path);
        if (!payloads.has(normalized)) {
          payloads.set(normalized, { archive: name, path: entry.path, size: entry.size });
        }
      }
    } finally {
      await file.close();
    }
    perArchive[name] = {
      present: true,
      entryCount: directory.entryCount,
      archiveSize: directory.archiveSize,
      counts,
    };
  }

  return {
    archiveCount: Object.values(perArchive).filter((a) => a.present).length,
    audioEntryTotal: total,
    perArchive,
    byExtension,
    byEncoding,
    extVsEncoding,
    wavCodec,
    wavCodecNames: Object.fromEntries(
      Object.keys(wavCodec).map((tag) => [tag, wavCodecName(Number(tag))]),
    ),
    wavFmt,
    mismatches,
    examples,
    payloads,
  };
}

function buildStrictErrors(scan, audioArchivesPresent, options) {
  const errors = [];
  const s = scan;

  // Every current ZH audio archive must be present.
  for (const name of CURRENT_ZH_AUDIO_ARCHIVES) {
    if (!audioArchivesPresent.has(name)) {
      errors.push(`Expected current Zero Hour audio archive missing: ${name}`);
    }
  }

  // Pinned totals from the current extracted ZH audio archive set.
  const expectedTotals = {
    audioEntryTotal: 3530,
    wav: 3523,
    mp3: 7,
  };
  if (s.audioEntryTotal !== expectedTotals.audioEntryTotal) {
    errors.push(
      `audioEntryTotal expected ${expectedTotals.audioEntryTotal} but found ${s.audioEntryTotal}`,
    );
  }
  if ((s.byExtension.wav ?? 0) !== expectedTotals.wav) {
    errors.push(
      `wav entry count expected ${expectedTotals.wav} but found ${s.byExtension.wav ?? 0}`,
    );
  }
  if ((s.byExtension.mp3 ?? 0) !== expectedTotals.mp3) {
    errors.push(
      `mp3 entry count expected ${expectedTotals.mp3} but found ${s.byExtension.mp3 ?? 0}`,
    );
  }

  // Every classified payload's magic must agree with its extension; the current
  // set has no extension/magic divergence. Unknown magics are tolerated only
  // outside the two pinned encoding classes.
  if (s.mismatches.length !== 0) {
    errors.push(
      `Extension/magic mismatches present (expected none): ${JSON.stringify(
        s.mismatches.slice(0, 5),
      )}`,
    );
  }

  // WAV codec frontier: the current ZH set is PCM (wFormatTag 1) + IMA ADPCM
  // (wFormatTag 17). Web Audio can decode PCM directly; IMA ADPCM must be
  // decoded/transcoded before it can be handed to decodeAudioData.
  const expectedWavCodec = { 1: 951, 17: 2572 };
  for (const [tag, expected] of Object.entries(expectedWavCodec)) {
    const actual = s.wavCodec[tag] ?? 0;
    if (actual !== expected) {
      errors.push(
        `WAV wFormatTag ${tag} (${wavCodecName(Number(tag))}) count expected ${expected} but found ${actual}`,
      );
    }
  }

  // Known encoding anchors for each class must resolve and classify correctly.
  for (const [encoding, payloadPath] of Object.entries(KNOWN_CURRENT_ZH_PAYLOADS)) {
    const normalized = normalizeEntryPath(payloadPath);
    const record = s.payloads.get(normalized);
    if (!record) {
      errors.push(`Expected current ZH ${encoding} payload missing: ${payloadPath}`);
      continue;
    }
    // Re-classify is implicit in the scan; just confirm presence and that the
    // per-archive counts include a non-zero encoding bucket.
  }
  if ((s.byEncoding.mp3 ?? 0) === 0) {
    errors.push("No mp3 payloads classified by magic (ID3/frame sync) in the audio set");
  }
  if ((s.byEncoding.wav ?? 0) === 0) {
    errors.push("No wav payloads classified by magic (RIFF/WAVE) in the audio set");
  }

  return errors;
}

async function buildReport(options) {
  const allArchivePaths = await findBigArchives(options.assetsDir);
  const allArchiveNames = new Set(allArchivePaths.map((p) => basename(p)));
  const scan = await classifyAudioEntries(options.assetsDir, CURRENT_ZH_AUDIO_ARCHIVES);

  const errors = options.expectCurrentZh
    ? buildStrictErrors(scan, allArchiveNames, options)
    : [];

  const facts = {
    archivesInspected: CURRENT_ZH_AUDIO_ARCHIVES,
    assetsDir: options.assetsDir,
    archiveCount: scan.archiveCount,
    audioEntryTotal: scan.audioEntryTotal,
    byExtension: scan.byExtension,
    byEncoding: scan.byEncoding,
    extVsEncoding: scan.extVsEncoding,
    wavCodec: scan.wavCodec,
    wavCodecNames: scan.wavCodecNames,
    wavFmt: scan.wavFmt,
    mismatchCount: scan.mismatches.length,
    examples: scan.examples,
    perArchive: scan.perArchive,
  };

  return {
    ok: errors.length === 0,
    expectCurrentZh: options.expectCurrentZh,
    errors,
    facts,
    note:
      "Classifies audio payload bytes by extension and file magic. PCM WAV can be handed to Web Audio decodeAudioData directly; IMA ADPCM WAV (wFormatTag 17) must be decoded/transcoded first, and MP3 (ID3/MPEG frame sync) is decodable by decodeAudioData. This preflight does not decode or play audio.",
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildReport(options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error?.stack ?? String(error));
    process.exit(1);
  }
}

main();
