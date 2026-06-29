#!/usr/bin/env node
import { open, readdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");
const repoRoot = resolve(wasmRoot, "..");

const audioIniPaths = [
  "Data\\INI\\AudioSettings.ini",
  "Data\\INI\\Default\\Music.ini",
  "Data\\INI\\Music.ini",
  "Data\\INI\\Default\\SoundEffects.ini",
  "Data\\INI\\SoundEffects.ini",
  "Data\\INI\\Default\\Speech.ini",
  "Data\\INI\\Speech.ini",
  "Data\\INI\\Default\\Voice.ini",
  "Data\\INI\\Voice.ini",
  "Data\\INI\\MiscAudio.ini",
];

const currentZhAudioArchives = [
  "AudioEnglishZH.big",
  "AudioZH.big",
  "Music.big",
  "MusicZH.big",
  "SpeechEnglishZH.big",
  "SpeechZH.big",
];

const knownCurrentZhPayloads = [
  "Data\\Audio\\Tracks\\USA_10.mp3",
  "Data\\Audio\\Tracks\\CHI_10.mp3",
  "Data\\Audio\\Sounds\\addnwi1a.wav",
  "Data\\Audio\\Sounds\\English\\aangr01a.wav",
  "Data\\Audio\\Speech\\English\\dxxoc001.wav",
];

const candidateSettings = {
  audioRoot: "Data\\Audio",
  soundsFolder: "Sounds",
  musicFolder: "Tracks",
  streamingFolder: "Speech",
  soundsExtension: "wav",
  language: "English",
  source:
    "candidate folder contract for current archive lookup; runtime AudioSettings.ini is absent in the current Zero Hour-only archive set",
};

const sourceFiles = {
  audioEventRTS:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/AudioEventRTS.cpp",
  iniAudioEventInfo:
    "GeneralsMD/Code/GameEngine/Source/Common/INI/INIAudioEventInfo.cpp",
  gameAudio:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
  gameMusic:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameMusic.cpp",
  gameSpeech:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameSpeech.cpp",
};

function usage() {
  return [
    "usage: node tools/inventory_audio_payloads.mjs [assets-dir] [--expect-current-zh]",
    "",
    "Indexes BIGF archives, reads shipped audio INIs, and reports which",
    "candidate audio payload paths resolve in the current archive set.",
    "",
    "This is a data preflight only. It does not decode or play audio.",
  ].join("\n");
}

function normalizeEntryPath(path) {
  return String(path ?? "").replaceAll("/", "\\").toLowerCase();
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
        ? resolve(wasmRoot, "artifacts/real-assets")
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
  return archivePaths.sort((left, right) => basename(left).localeCompare(basename(right)));
}

async function buildArchiveIndex(assetsDir) {
  const archivePaths = await findBigArchives(assetsDir);
  const archives = [];
  const byPath = new Map();

  for (const archivePath of archivePaths) {
    const directory = await readBigDirectory(archivePath);
    const archive = {
      name: basename(archivePath),
      path: archivePath,
      archiveSize: directory.archiveSize,
      entryCount: directory.entryCount,
    };
    archives.push(archive);

    for (const entry of directory.entries) {
      const record = {
        archive: archive.name,
        archivePath,
        path: entry.path,
        normalizedPath: entry.normalizedPath,
        offset: entry.offset,
        size: entry.size,
      };
      if (!byPath.has(entry.normalizedPath)) {
        byPath.set(entry.normalizedPath, []);
      }
      byPath.get(entry.normalizedPath).push(record);
    }
  }

  return { archives, byPath };
}

async function readIndexedEntry(record) {
  const file = await open(record.archivePath, "r");
  try {
    return await readExact(file, record.offset, record.size, record.path);
  } finally {
    await file.close();
  }
}

async function readIndexedText(index, path) {
  const records = index.byPath.get(normalizeEntryPath(path));
  if (!records || records.length === 0) {
    return null;
  }

  const buffer = await readIndexedEntry(records[0]);
  return {
    path,
    archive: records[0].archive,
    size: records[0].size,
    text: buffer.toString("latin1"),
  };
}

function stripComment(line) {
  const semicolon = line.indexOf(";");
  if (semicolon >= 0) {
    return line.slice(0, semicolon);
  }
  return line;
}

function parseBlocks(text, sourcePath, wantedKinds) {
  const wanted = new Set(wantedKinds);
  const allBlockStart = /^\s*([A-Za-z][A-Za-z0-9_]*)\s+([^\s;]+)/;
  const fieldLine = /^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;
  const blocks = [];
  let current = null;
  const lines = text.split(/\r?\n/);

  function finishCurrent() {
    if (current) {
      blocks.push(current);
      current = null;
    }
  }

  for (let index = 0; index < lines.length; ++index) {
    const lineNumber = index + 1;
    const raw = lines[index];
    const line = stripComment(raw).trimEnd();
    if (line.trim() === "") {
      continue;
    }

    const block = allBlockStart.exec(line);
    if (block && !line.includes("=")) {
      finishCurrent();
      if (wanted.has(block[1])) {
        current = {
          sourcePath,
          kind: block[1],
          name: block[2],
          line: lineNumber,
          fields: [],
        };
      }
      continue;
    }

    if (!current) {
      continue;
    }

    const field = fieldLine.exec(line);
    if (field) {
      current.fields.push({
        name: field[1],
        value: field[2].trim(),
        line: lineNumber,
      });
    }
  }
  finishCurrent();
  return blocks;
}

function parseTokenList(value) {
  return value
    .replaceAll(",", " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && token.toLowerCase() !== "none");
}

function soundLeaf(token) {
  return `${token}.${candidateSettings.soundsExtension}`;
}

function candidatePathsFor(kind, leaf) {
  let cleanLeaf = String(leaf ?? "").trim();
  if (cleanLeaf === "") {
    return [];
  }

  const paths = [];
  let folder = candidateSettings.soundsFolder;
  let file = cleanLeaf;
  if (kind === "music") {
    folder = candidateSettings.musicFolder;
  } else if (kind === "streaming") {
    folder = candidateSettings.streamingFolder;
    if (file.startsWith("$")) {
      file = file.slice(1);
    }
  } else {
    file = soundLeaf(file);
  }

  paths.push(
    `${candidateSettings.audioRoot}\\${folder}\\${candidateSettings.language}\\${file}`,
  );
  paths.push(`${candidateSettings.audioRoot}\\${folder}\\${file}`);
  return [...new Set(paths)];
}

function resolveCandidate(index, candidates) {
  for (const candidate of candidates) {
    const records = index.byPath.get(normalizeEntryPath(candidate));
    if (records && records.length > 0) {
      const record = records[0];
      return {
        archive: record.archive,
        path: record.path,
        size: record.size,
        offset: record.offset,
        matchedCandidate: candidate,
        localized:
          normalizeEntryPath(candidate).includes(
            `\\${candidateSettings.language.toLowerCase()}\\`,
          ),
      };
    }
  }
  return null;
}

function collectFieldValues(block, fieldNames, listMode) {
  const wanted = new Set(fieldNames.map((field) => field.toLowerCase()));
  const values = [];
  for (const field of block.fields) {
    if (!wanted.has(field.name.toLowerCase())) {
      continue;
    }
    const tokens = listMode ? parseTokenList(field.value) : [field.value.trim()];
    for (const token of tokens) {
      if (token !== "") {
        values.push({
          field: field.name,
          line: field.line,
          leaf: token,
        });
      }
    }
  }
  return values;
}

function makeReferences(index, blocks, kind, fieldNames, listMode) {
  const refs = [];
  for (const block of blocks) {
    for (const value of collectFieldValues(block, fieldNames, listMode)) {
      const candidates = candidatePathsFor(kind, value.leaf);
      refs.push({
        sourcePath: block.sourcePath,
        sourceLine: value.line,
        blockKind: block.kind,
        event: block.name,
        field: value.field,
        leaf: value.leaf,
        candidates,
        resolved: resolveCandidate(index, candidates),
      });
    }
  }
  return refs;
}

function summarizeReferences(refs) {
  const uniqueLeaves = new Set(refs.map((ref) => ref.leaf.toLowerCase()));
  const resolved = refs.filter((ref) => ref.resolved);
  const missing = refs.filter((ref) => !ref.resolved);
  const archives = new Map();
  for (const ref of resolved) {
    archives.set(ref.resolved.archive, (archives.get(ref.resolved.archive) ?? 0) + 1);
  }

  return {
    references: refs.length,
    uniqueLeaves: uniqueLeaves.size,
    resolved: resolved.length,
    localizedResolved: resolved.filter((ref) => ref.resolved.localized).length,
    missing: missing.length,
    archives: Object.fromEntries([...archives.entries()].sort()),
    resolvedExamples: resolved.slice(0, 8).map(exampleReference),
    missingExamples: missing.slice(0, 8).map(exampleReference),
  };
}

function exampleReference(ref) {
  return {
    event: ref.event,
    field: ref.field,
    leaf: ref.leaf,
    source: `${ref.sourcePath}:${ref.sourceLine}`,
    resolved: ref.resolved
      ? {
          archive: ref.resolved.archive,
          path: ref.resolved.path,
          size: ref.resolved.size,
          offset: ref.resolved.offset,
        }
      : null,
    firstCandidate: ref.candidates[0] ?? null,
  };
}

function readSourceAnchors() {
  const anchors = {};
  for (const [key, relPath] of Object.entries(sourceFiles)) {
    const abs = resolve(repoRoot, relPath);
    let lines;
    try {
      lines = readFileSync(abs, "utf8").split(/\r?\n/);
    } catch {
      anchors[key] = { path: relPath, missing: true };
      continue;
    }

    const findLine = (pattern) => {
      for (let index = 0; index < lines.length; ++index) {
        if (pattern.test(lines[index])) {
          return index + 1;
        }
      }
      return -1;
    };

    anchors[key] = { path: relPath };
    if (key === "audioEventRTS") {
      anchors[key].generateFilename = findLine(
        /void\s+AudioEventRTS\s*::\s*generateFilename\s*\(/,
      );
      anchors[key].generateFilenamePrefix = findLine(
        /AudioEventRTS\s*::\s*generateFilenamePrefix\s*\(/,
      );
      anchors[key].generateFilenameExtension = findLine(
        /AudioEventRTS\s*::\s*generateFilenameExtension\s*\(/,
      );
    } else if (key === "iniAudioEventInfo") {
      anchors[key].filenameField = findLine(/"\s*Filename\s*"/);
      anchors[key].soundsField = findLine(/"\s*Sounds\s*"/);
      anchors[key].attackField = findLine(/"\s*Attack\s*"/);
      anchors[key].decayField = findLine(/"\s*Decay\s*"/);
    } else if (key === "gameAudio") {
      anchors[key].audioRootMapping = findLine(/"\s*AudioRoot\s*"/);
      anchors[key].soundsFolderMapping = findLine(/"\s*SoundsFolder\s*"/);
      anchors[key].musicFolderMapping = findLine(/"\s*MusicFolder\s*"/);
      anchors[key].streamingFolderMapping = findLine(/"\s*StreamingFolder\s*"/);
      anchors[key].soundsExtensionMapping = findLine(/"\s*SoundsExtension\s*"/);
    } else if (key === "gameMusic") {
      anchors[key].musicPathDefine = findLine(/#define\s+MUSIC_PATH/);
      anchors[key].filenameField = findLine(/"\s*Filename\s*"/);
    } else if (key === "gameSpeech") {
      anchors[key].baseDlgDir = findLine(/#define\s+BASE_DLG_DIR/);
      anchors[key].baseDlgExt = findLine(/#define\s+BASE_DLG_EXT/);
    }
  }
  return anchors;
}

async function buildReport(options) {
  const index = await buildArchiveIndex(options.assetsDir);
  const archiveNames = new Set(index.archives.map((archive) => archive.name));
  const iniFiles = {};
  const iniTexts = {};

  for (const iniPath of audioIniPaths) {
    const textRecord = await readIndexedText(index, iniPath);
    iniFiles[iniPath] = textRecord
      ? { present: true, archive: textRecord.archive, size: textRecord.size }
      : { present: false };
    if (textRecord) {
      iniTexts[iniPath] = textRecord.text;
    }
  }

  const musicBlocks = iniTexts["Data\\INI\\Music.ini"]
    ? parseBlocks(iniTexts["Data\\INI\\Music.ini"], "Data\\INI\\Music.ini", [
        "MusicTrack",
      ])
    : [];
  const soundBlocks = [
    ...(iniTexts["Data\\INI\\Default\\SoundEffects.ini"]
      ? parseBlocks(
          iniTexts["Data\\INI\\Default\\SoundEffects.ini"],
          "Data\\INI\\Default\\SoundEffects.ini",
          ["AudioEvent"],
        )
      : []),
    ...(iniTexts["Data\\INI\\SoundEffects.ini"]
      ? parseBlocks(iniTexts["Data\\INI\\SoundEffects.ini"], "Data\\INI\\SoundEffects.ini", [
          "AudioEvent",
        ])
      : []),
  ];
  const voiceBlocks = iniTexts["Data\\INI\\Voice.ini"]
    ? parseBlocks(iniTexts["Data\\INI\\Voice.ini"], "Data\\INI\\Voice.ini", [
        "AudioEvent",
      ])
    : [];
  const speechBlocks = iniTexts["Data\\INI\\Speech.ini"]
    ? parseBlocks(iniTexts["Data\\INI\\Speech.ini"], "Data\\INI\\Speech.ini", [
        "DialogEvent",
      ])
    : [];

  const music = makeReferences(index, musicBlocks, "music", ["Filename"], false);
  const soundEffects = makeReferences(
    index,
    soundBlocks,
    "sound",
    ["Sounds", "SoundsNight", "SoundsEvening", "SoundsMorning", "Attack", "Decay"],
    true,
  );
  const voices = makeReferences(
    index,
    voiceBlocks,
    "sound",
    ["Sounds", "SoundsNight", "SoundsEvening", "SoundsMorning", "Attack", "Decay"],
    true,
  );
  const speech = makeReferences(index, speechBlocks, "streaming", ["Filename"], false);

  const expectedErrors = [];
  if (options.expectCurrentZh) {
    for (const archive of ["INIZH.big", ...currentZhAudioArchives]) {
      if (!archiveNames.has(archive)) {
        expectedErrors.push(`Expected current Zero Hour archive missing: ${archive}`);
      }
    }
    if (iniFiles["Data\\INI\\AudioSettings.ini"].present) {
      expectedErrors.push(
        "Current Zero Hour-only set unexpectedly contains Data\\INI\\AudioSettings.ini",
      );
    }
    for (const iniPath of [
      "Data\\INI\\Music.ini",
      "Data\\INI\\SoundEffects.ini",
      "Data\\INI\\Speech.ini",
      "Data\\INI\\Voice.ini",
    ]) {
      if (!iniFiles[iniPath].present) {
        expectedErrors.push(`Expected current Zero Hour audio INI missing: ${iniPath}`);
      }
    }
    for (const payload of knownCurrentZhPayloads) {
      if (!index.byPath.has(normalizeEntryPath(payload))) {
        expectedErrors.push(`Expected current Zero Hour audio payload missing: ${payload}`);
      }
    }
    for (const [name, refs] of [
      ["music", music],
      ["soundEffects", soundEffects],
      ["voices", voices],
      ["speech", speech],
    ]) {
      if (refs.filter((ref) => ref.resolved).length === 0) {
        expectedErrors.push(`Expected at least one resolved ${name} reference`);
      }
    }
  }

  const sections = {
    music: {
      sourceBlocks: musicBlocks.length,
      summary: summarizeReferences(music),
    },
    soundEffects: {
      sourceBlocks: soundBlocks.length,
      summary: summarizeReferences(soundEffects),
    },
    voices: {
      sourceBlocks: voiceBlocks.length,
      summary: summarizeReferences(voices),
    },
    speech: {
      sourceBlocks: speechBlocks.length,
      summary: summarizeReferences(speech),
    },
  };

  return {
    ok: expectedErrors.length === 0,
    errors: expectedErrors,
    assetsDir: options.assetsDir,
    archiveCount: index.archives.length,
    indexedEntryCount: [...index.byPath.values()].reduce(
      (count, records) => count + records.length,
      0,
    ),
    audioArchives: index.archives
      .filter((archive) => currentZhAudioArchives.includes(archive.name))
      .map((archive) => ({
        name: archive.name,
        entryCount: archive.entryCount,
        archiveSize: archive.archiveSize,
      })),
    audioSettings: {
      iniPath: "Data\\INI\\AudioSettings.ini",
      present: iniFiles["Data\\INI\\AudioSettings.ini"].present,
      candidateSettings,
    },
    iniFiles,
    sourceAnchors: readSourceAnchors(),
    sections,
    note:
      "Resolved means a candidate path exists in the indexed BIG directories; this does not decode, schedule, or play audio.",
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
