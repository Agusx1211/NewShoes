#!/usr/bin/env node
// verify_audio_startup_archive_contract.mjs
//
// Source-only verifier for the repo/tooling contract covering the remaining
// audio startup archive gap. The current Zero Hour-only runtime archive set
// lacks the base-Generals-owned audio startup INIs that AudioManager::init
// loads: Data\INI\AudioSettings.ini, Data\INI\Default\Music.ini,
// Data\INI\Default\Speech.ini, and Data\INI\Default\Voice.ini. They must come
// from a user-supplied base Generals INI.big / English.big or a verified
// archive mapping. This verifier invents no data: it pins, with line/ordered
// scans, the source and tooling facts that already describe that gap.
//
// Reads source/tool files only - no web, no asset bytes required. Emits a JSON
// report { ok, errors, sources, facts } and exits 0 only if every pinned fact
// is present.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  gameAudioCpp:
    "GeneralsMD/Code/GameEngine/Source/Common/Audio/GameAudio.cpp",
  inventoryStartupArchives:
    "WebAssembly/tools/inventory_startup_archives.mjs",
  extractZhRuntimeArchives:
    "WebAssembly/tools/extract_zh_runtime_archives.sh",
  runtimeArchivesSmoke:
    "WebAssembly/harness/runtime_archives_smoke.mjs",
};

function readSourceLines(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  const text = readFileSync(abs, "utf8");
  return { abs, text, lines: text.split(/\r?\n/) };
}

function lineNumber(lines, predicate) {
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i + 1;
  }
  return -1;
}

function findMemberDef(lines, signatureRegex) {
  return lineNumber(lines, (line) => signatureRegex.test(line));
}

// Returns { start, end } (1-based) of the brace-balanced function body that
// follows the given definition line, or null.
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

function main() {
  const errors = [];
  const facts = {};

  const gameAudio = readSourceLines(SOURCES.gameAudioCpp);
  const inventory = readSourceLines(SOURCES.inventoryStartupArchives);
  const extract = readSourceLines(SOURCES.extractZhRuntimeArchives);
  const smoke = readSourceLines(SOURCES.runtimeArchivesSmoke);

  // ========================================================================
  // 1) GameAudio.cpp::AudioManager::init audio INI load sequence.
  // ------------------------------------------------------------------------
  // Pin AudioManager::init and the startup ini.load(...) calls in source
  // order: AudioSettings.ini, Default/Music.ini + Music.ini,
  // Default/SoundEffects.ini + SoundEffects.ini, Default/Speech.ini +
  // Speech.ini, Default/Voice.ini + Voice.ini, then MiscAudio.ini last. The
  // base-owned AudioSettings/Default/Music/Speech/Voice entries are the gap.
  // Raw file text contains two backslashes per Windows path separator.
  // ========================================================================
  const initDefLine = findMemberDef(
    gameAudio.lines,
    /void\s+AudioManager\s*::\s*init\s*\(/,
  );
  facts.audioManagerInitDefLine = { expectedLine: 216, line: initDefLine };
  if (initDefLine !== 216) {
    errors.push(
      `AudioManager::init expected at line 216 but found at ${initDefLine}`,
    );
  }
  const initRange =
    initDefLine > 0 ? functionBodyLineRange(gameAudio.lines, initDefLine) : null;
  if (initDefLine > 0 && !initRange) {
    errors.push("AudioManager::init: function body not found");
  }

  const loadSequence = [
    { key: "AudioSettings.ini", line: 219, path: /Data\\\\INI\\\\AudioSettings\.ini/ },
    { key: "Default/Music.ini", line: 221, path: /Data\\\\INI\\\\Default\\\\Music\.ini/ },
    { key: "Music.ini", line: 222, path: /Data\\\\INI\\\\Music\.ini/ },
    {
      key: "Default/SoundEffects.ini",
      line: 224,
      path: /Data\\\\INI\\\\Default\\\\SoundEffects\.ini/,
    },
    {
      key: "SoundEffects.ini",
      line: 225,
      path: /Data\\\\INI\\\\SoundEffects\.ini/,
    },
    {
      key: "Default/Speech.ini",
      line: 227,
      path: /Data\\\\INI\\\\Default\\\\Speech\.ini/,
    },
    { key: "Speech.ini", line: 228, path: /Data\\\\INI\\\\Speech\.ini/ },
    {
      key: "Default/Voice.ini",
      line: 230,
      path: /Data\\\\INI\\\\Default\\\\Voice\.ini/,
    },
    { key: "Voice.ini", line: 231, path: /Data\\\\INI\\\\Voice\.ini/ },
    { key: "MiscAudio.ini", line: 234, path: /Data\\\\INI\\\\MiscAudio\.ini/ },
  ];
  const loadFacts = {};
  let prevLoadLine = -1;
  let prevLoadKey = null;
  for (const { key, line, path } of loadSequence) {
    const actual = lineNumber(gameAudio.lines, (candidate) =>
      /\.load\s*\([^)]*/.test(candidate) && path.test(candidate),
    );
    loadFacts[key] = { expectedLine: line, line: actual };
    if (actual !== line) {
      errors.push(
        `AudioManager::init load ${key} expected at line ${line} but found at ${actual}`,
      );
    } else if (prevLoadLine !== -1 && !(prevLoadLine < actual)) {
      errors.push(
        `AudioManager::init load ${key} (line ${actual}) must come after ${prevLoadKey} (line ${prevLoadLine})`,
      );
    } else if (initRange && !(initRange.start <= actual && actual <= initRange.end)) {
      errors.push(
        `AudioManager::init load ${key} (line ${actual}) is outside init() body [${initRange.start},${initRange.end}]`,
      );
    }
    prevLoadLine = actual;
    prevLoadKey = key;
  }
  facts.audioManagerInitLoadOrder = loadFacts;

  // ========================================================================
  // 2) inventory_startup_archives.mjs tracks audio startup paths and exposes
  //    --require-audio-startup. Pin the audioStartupPaths array, the flag
  //    definition + its handling, and the audioStartupSource anchor.
  // ========================================================================
  const audioPathsDefLine = lineNumber(inventory.lines, (line) =>
    /^const\s+audioStartupPaths\s*=\s*\[/.test(line),
  );
  facts.inventoryAudioStartupPathsDefLine = {
    expectedLine: 53,
    line: audioPathsDefLine,
  };
  if (audioPathsDefLine !== 53) {
    errors.push(
      `inventory audioStartupPaths array expected at line 53 but found at ${audioPathsDefLine}`,
    );
  }

  // Every AudioManager::init startup INI must be tracked in audioStartupPaths,
  // in the same source order.
  // The inventory source writes these JS string literals with two backslashes
  // per Windows path separator (e.g. "Data\\INI\\..."); match that raw text.
  const inventoryAudioPaths = [
    "Data\\\\INI\\\\AudioSettings.ini",
    "Data\\\\INI\\\\Default\\\\Music.ini",
    "Data\\\\INI\\\\Music.ini",
    "Data\\\\INI\\\\Default\\\\SoundEffects.ini",
    "Data\\\\INI\\\\SoundEffects.ini",
    "Data\\\\INI\\\\Default\\\\Speech.ini",
    "Data\\\\INI\\\\Speech.ini",
    "Data\\\\INI\\\\Default\\\\Voice.ini",
    "Data\\\\INI\\\\Voice.ini",
    "Data\\\\INI\\\\MiscAudio.ini",
  ];
  const inventoryPathFacts = {};
  let prevInvLine = -1;
  let prevInvKey = null;
  inventoryAudioPaths.forEach((rawPath, idx) => {
    const actual = lineNumber(inventory.lines, (candidate) =>
      candidate.includes(`"${rawPath}"`),
    );
    const key = `audioStartupPaths[${idx}]`;
    inventoryPathFacts[key] = { line: actual };
    if (actual === -1) {
      errors.push(`inventory audioStartupPaths missing ${rawPath}`);
    } else if (prevInvLine !== -1 && !(prevInvLine < actual)) {
      errors.push(
        `inventory ${key} (line ${actual}) must come after ${prevInvKey} (line ${prevInvLine})`,
      );
    }
    prevInvLine = actual;
    prevInvKey = key;
  });
  facts.inventoryAudioStartupPaths = inventoryPathFacts;

  // baseArchiveAudioStartupPaths: the base-owned AudioSettings/Default audio
  // INIs that the gap is about, classified as optional INI.big content.
  const baseAudioPathsDefLine = lineNumber(inventory.lines, (line) =>
    /^const\s+baseArchiveAudioStartupPaths\s*=\s*new\s+Set\s*\(\s*\[/.test(line),
  );
  facts.inventoryBaseArchiveAudioStartupPathsDefLine = {
    expectedLine: 293,
    line: baseAudioPathsDefLine,
  };
  if (baseAudioPathsDefLine !== 293) {
    errors.push(
      `inventory baseArchiveAudioStartupPaths expected at line 293 but found at ${baseAudioPathsDefLine}`,
    );
  }
  // These normalized (lowercased) paths also appear as doubled-backslash JS
  // string literals in the inventory source.
  const baseAudioPaths = [
    "data\\\\ini\\\\audiosettings.ini",
    "data\\\\ini\\\\default\\\\music.ini",
    "data\\\\ini\\\\default\\\\soundeffects.ini",
    "data\\\\ini\\\\default\\\\speech.ini",
    "data\\\\ini\\\\default\\\\voice.ini",
  ];
  const baseAudioFacts = {};
  baseAudioPaths.forEach((rawPath) => {
    const actual = lineNumber(inventory.lines, (candidate) =>
      candidate.includes(`"${rawPath}"`),
    );
    baseAudioFacts[rawPath] = { line: actual };
    if (actual === -1) {
      errors.push(`inventory baseArchiveAudioStartupPaths missing ${rawPath}`);
    }
  });
  facts.inventoryBaseArchiveAudioStartupPaths = baseAudioFacts;

  // --require-audio-startup flag: arg parsing, destructuring, and the bounded
  // verification branch that fails when audio startup INIs are absent.
  const requireAudioStartupArgLine = lineNumber(inventory.lines, (line) =>
    /arg\s*===\s*"--require-audio-startup"/.test(line),
  );
  facts.inventoryRequireAudioStartupArgLine = {
    expectedLine: 134,
    line: requireAudioStartupArgLine,
  };
  if (requireAudioStartupArgLine !== 134) {
    errors.push(
      `inventory --require-audio-startup arg branch expected at line 134 but found at ${requireAudioStartupArgLine}`,
    );
  }
  const requireAudioStartupDestructureLine = lineNumber(inventory.lines, (line) =>
    /^\s*requireAudioStartup,/.test(line),
  );
  facts.inventoryRequireAudioStartupDestructureLine = {
    expectedLine: 156,
    line: requireAudioStartupDestructureLine,
  };
  if (requireAudioStartupDestructureLine !== 156) {
    errors.push(
      `inventory requireAudioStartup destructure expected at line 156 but found at ${requireAudioStartupDestructureLine}`,
    );
  }
  const requireAudioStartupCheckLine = lineNumber(inventory.lines, (line) =>
    /requireAudioStartup\s*&&\s*!inventory\.audioStartupReady/.test(line),
  );
  facts.inventoryRequireAudioStartupCheckLine = {
    expectedLine: 738,
    line: requireAudioStartupCheckLine,
  };
  if (requireAudioStartupCheckLine !== 738) {
    errors.push(
      `inventory requireAudioStartup check expected at line 738 but found at ${requireAudioStartupCheckLine}`,
    );
  }
  const audioStartupSourceLine = lineNumber(inventory.lines, (line) =>
    /audioStartupSource:\s*"GameAudio\.cpp::AudioManager::init"/.test(line),
  );
  facts.inventoryAudioStartupSourceLine = {
    expectedLine: 507,
    line: audioStartupSourceLine,
  };
  if (audioStartupSourceLine !== 507) {
    errors.push(
      `inventory audioStartupSource anchor expected at line 507 but found at ${audioStartupSourceLine}`,
    );
  }

  // ========================================================================
  // 3) extract_zh_runtime_archives.sh recognizes optional base Generals
  //    inputs. Pin the aggregate base archive list, the cabinet-specific
  //    archive lists, the raw-disc and extracted-cabinet discovery helpers,
  //    the optional base extraction function, and the optional-base missing
  //    messages.
  // ========================================================================
  const baseDataArchivesLine = lineNumber(extract.lines, (line) =>
    /^base_data_archives=\(/.test(line),
  );
  facts.extractBaseDataArchivesLine = {
    line: baseDataArchivesLine,
  };
  if (baseDataArchivesLine === -1) {
    errors.push("extract base_data_archives declaration not found");
  }
  const iniBigLine = lineNumber(extract.lines, (line) => /^\s*INI\.big\s*$/.test(line));
  facts.extractIniBigEntryLine = { line: iniBigLine };
  if (iniBigLine === -1) {
    errors.push("extract INI.big entry not found");
  }
  const terrainBigLine = lineNumber(extract.lines, (line) => /^\s*Terrain\.big\s*$/.test(line));
  facts.extractTerrainBigEntryLine = { line: terrainBigLine };
  if (terrainBigLine === -1) {
    errors.push("extract Terrain.big entry not found");
  }
  const texturesBigLine = lineNumber(extract.lines, (line) => /^\s*Textures\.big\s*$/.test(line));
  facts.extractTexturesBigEntryLine = { line: texturesBigLine };
  if (texturesBigLine === -1) {
    errors.push("extract Textures.big entry not found");
  }
  const windowBigLine = lineNumber(extract.lines, (line) => /^\s*Window\.big\s*$/.test(line));
  facts.extractWindowBigEntryLine = { line: windowBigLine };
  if (windowBigLine === -1) {
    errors.push("extract Window.big entry not found");
  }
  const baseDisc1DataArchivesLine = lineNumber(extract.lines, (line) =>
    /^base_disc1_data_archives=\(/.test(line),
  );
  facts.extractBaseDisc1DataArchivesLine = { line: baseDisc1DataArchivesLine };
  if (baseDisc1DataArchivesLine === -1) {
    errors.push("extract base_disc1_data_archives declaration not found");
  }
  const baseDisc2DataArchivesLine = lineNumber(extract.lines, (line) =>
    /^base_disc2_data_archives=\(/.test(line),
  );
  facts.extractBaseDisc2DataArchivesLine = { line: baseDisc2DataArchivesLine };
  if (baseDisc2DataArchivesLine === -1) {
    errors.push("extract base_disc2_data_archives declaration not found");
  }
  const baseLanguageArchivesLine = lineNumber(extract.lines, (line) =>
    /^base_language_archives=\(/.test(line),
  );
  facts.extractBaseLanguageArchivesLine = {
    line: baseLanguageArchivesLine,
  };
  if (baseLanguageArchivesLine === -1) {
    errors.push("extract base_language_archives declaration not found");
  }
  const englishBigLine = lineNumber(extract.lines, (line) =>
    /^\s*English\.big\s*$/.test(line),
  );
  facts.extractEnglishBigEntryLine = { line: englishBigLine };
  if (englishBigLine === -1) {
    errors.push("extract English.big entry not found");
  }
  const findOptionalBaseDiscLine = lineNumber(extract.lines, (line) =>
    /^find_optional_base_disc\(\)/.test(line),
  );
  facts.extractFindOptionalBaseDiscLine = {
    line: findOptionalBaseDiscLine,
  };
  if (findOptionalBaseDiscLine === -1) {
    errors.push("extract find_optional_base_disc helper not found");
  }
  const findOptionalBaseCabLine = lineNumber(extract.lines, (line) =>
    /^find_optional_base_cab\(\)/.test(line),
  );
  facts.extractFindOptionalBaseCabLine = { line: findOptionalBaseCabLine };
  if (findOptionalBaseCabLine === -1) {
    errors.push("extract find_optional_base_cab helper not found");
  }
  const extractBaseCabFromDiscLine = lineNumber(extract.lines, (line) =>
    /^extract_base_cab_from_disc\(\)/.test(line),
  );
  facts.extractBaseCabFromDiscLine = { line: extractBaseCabFromDiscLine };
  if (extractBaseCabFromDiscLine === -1) {
    errors.push("extract extract_base_cab_from_disc helper not found");
  }
  const extractOptionalBaseLine = lineNumber(extract.lines, (line) =>
    /^extract_optional_base_startup_archives\(\)/.test(line),
  );
  facts.extractOptionalBaseStartupArchivesLine = {
    line: extractOptionalBaseLine,
  };
  if (extractOptionalBaseLine === -1) {
    errors.push("extract extract_optional_base_startup_archives helper not found");
  }
  const data1CabLine = lineNumber(extract.lines, (line) =>
    /"Data1\.cab"/.test(line),
  );
  facts.extractData1CabReferenceLine = { line: data1CabLine };
  if (data1CabLine === -1) {
    errors.push("extract Data1.cab reference not found");
  }
  const data2CabLine = lineNumber(extract.lines, (line) =>
    /"Data2\.cab"/.test(line),
  );
  facts.extractData2CabReferenceLine = { line: data2CabLine };
  if (data2CabLine === -1) {
    errors.push("extract Data2.cab reference not found");
  }
  const languageCabLine = lineNumber(extract.lines, (line) =>
    /"Language\.cab"/.test(line),
  );
  facts.extractLanguageCabReferenceLine = { line: languageCabLine };
  if (languageCabLine === -1) {
    errors.push("extract Language.cab reference not found");
  }
  // Optional base missing/skip messages - the script either extracts/copies
  // base INI.big/English.big or emits these messages.
  const skipBothLine = lineNumber(
    extract.lines,
    (line) => /Optional base Generals disc images not found; skipping base Generals BIG extraction/.test(line),
  );
  facts.extractSkipBothMessageLine = { line: skipBothLine };
  if (skipBothLine === -1) {
    errors.push(
      "extract optional-base BIG skip message not found",
    );
  }
  const skipSourceLine = lineNumber(
    extract.lines,
    (line) => /Optional base Generals \$\{source_label\} source not found; \$\{archive\} was not extracted/.test(line),
  );
  facts.extractSkipBaseCabSourceMessageLine = { line: skipSourceLine };
  if (skipSourceLine === -1) {
    errors.push("extract optional-base cabinet-source missing message not found");
  }

  // ========================================================================
  // 4) runtime_archives_smoke.mjs declares optional base runtime archives for
  //    INI.big, English.big, and Window.big with mount names ZZBase_INI.big /
  //    ZZBase_English.big / ZZBase_Window.big, and asserts startup behavior
  //    differs when base INI is mounted. Pin the declaration entries and the
  //    startup-behavior branch.
  // ========================================================================
  const optionalBaseDeclLine = lineNumber(smoke.lines, (line) =>
    /^const\s+optionalBaseRuntimeArchives\s*=\s*\[/.test(line),
  );
  facts.smokeOptionalBaseRuntimeArchivesDeclLine = {
    expectedLine: 29,
    line: optionalBaseDeclLine,
  };
  if (optionalBaseDeclLine !== 29) {
    errors.push(
      `smoke optionalBaseRuntimeArchives expected at line 29 but found at ${optionalBaseDeclLine}`,
    );
  }
  const iniMountSourceLine = lineNumber(smoke.lines, (line) =>
    /^\s*sourceName:\s*"INI\.big",/.test(line),
  );
  facts.smokeIniMountSourceLine = {
    expectedLine: 31,
    line: iniMountSourceLine,
  };
  if (iniMountSourceLine !== 31) {
    errors.push(
      `smoke INI.big sourceName expected at line 31 but found at ${iniMountSourceLine}`,
    );
  }
  const iniMountNameLine = lineNumber(smoke.lines, (line) =>
    /^\s*mountName:\s*"ZZBase_INI\.big",/.test(line),
  );
  facts.smokeIniMountNameLine = {
    expectedLine: 32,
    line: iniMountNameLine,
  };
  if (iniMountNameLine !== 32) {
    errors.push(
      `smoke ZZBase_INI.big mountName expected at line 32 but found at ${iniMountNameLine}`,
    );
  }
  const englishMountSourceLine = lineNumber(smoke.lines, (line) =>
    /^\s*sourceName:\s*"English\.big",/.test(line),
  );
  facts.smokeEnglishMountSourceLine = {
    expectedLine: 36,
    line: englishMountSourceLine,
  };
  if (englishMountSourceLine !== 36) {
    errors.push(
      `smoke English.big sourceName expected at line 36 but found at ${englishMountSourceLine}`,
    );
  }
  const englishMountNameLine = lineNumber(smoke.lines, (line) =>
    /^\s*mountName:\s*"ZZBase_English\.big",/.test(line),
  );
  facts.smokeEnglishMountNameLine = {
    expectedLine: 37,
    line: englishMountNameLine,
  };
  if (englishMountNameLine !== 37) {
    errors.push(
      `smoke ZZBase_English.big mountName expected at line 37 but found at ${englishMountNameLine}`,
    );
  }
  const windowMountSourceLine = lineNumber(smoke.lines, (line) =>
    /^\s*sourceName:\s*"Window\.big",/.test(line),
  );
  facts.smokeWindowMountSourceLine = {
    expectedLine: 41,
    line: windowMountSourceLine,
  };
  if (windowMountSourceLine !== 41) {
    errors.push(
      `smoke Window.big sourceName expected at line 41 but found at ${windowMountSourceLine}`,
    );
  }
  const windowMountNameLine = lineNumber(smoke.lines, (line) =>
    /^\s*mountName:\s*"ZZBase_Window\.big",/.test(line),
  );
  facts.smokeWindowMountNameLine = {
    expectedLine: 42,
    line: windowMountNameLine,
  };
  if (windowMountNameLine !== 42) {
    errors.push(
      `smoke ZZBase_Window.big mountName expected at line 42 but found at ${windowMountNameLine}`,
    );
  }

  // hasBaseIniArchive predicate + the boot-time startup-behavior branch that
  // differs when base INI is mounted (with-base vs missing-files assertions).
  const hasBaseIniArchiveLine = lineNumber(smoke.lines, (line) =>
    /^const\s+hasBaseIniArchive\s*=/.test(line),
  );
  facts.smokeHasBaseIniArchiveLine = { line: hasBaseIniArchiveLine };
  if (hasBaseIniArchiveLine === -1) {
    errors.push("smoke hasBaseIniArchive predicate not found");
  }
  // The boot-time startup-behavior branch is the `if (hasBaseIniArchive)` in
  // the main flow immediately followed by assertOriginalEngineStartupWithBaseIni
  // (there are other hasBaseIniArchive branches for archive-mount and payload
  // inventory checks that do not assert startup behavior).
  let startupBranchCheckLine = -1;
  for (let i = 0; i < smoke.lines.length; i++) {
    if (/if\s*\(\s*hasBaseIniArchive\s*\)/.test(smoke.lines[i])) {
      const next = smoke.lines.slice(i + 1, i + 4).join("\n");
      if (next.includes("assertOriginalEngineStartupWithBaseIni")) {
        startupBranchCheckLine = i + 1;
        break;
      }
    }
  }
  facts.smokeStartupBranchCheckLine = { line: startupBranchCheckLine };
  if (startupBranchCheckLine === -1) {
    errors.push("smoke hasBaseIniArchive startup branch not found");
  }
  // The two distinct startup assertion paths must exist, with the base-INI
  // (with) assertion after the missing-files assertion.
  const missingFilesAssertLine = lineNumber(smoke.lines, (line) =>
    /^function\s+assertOriginalEngineStartupMissingFiles\s*\(/.test(line),
  );
  facts.smokeAssertOriginalEngineStartupMissingFilesLine = { line: missingFilesAssertLine };
  if (missingFilesAssertLine === -1) {
    errors.push("smoke assertOriginalEngineStartupMissingFiles helper not found");
  }
  const withBaseIniAssertLine = lineNumber(smoke.lines, (line) =>
    /^function\s+assertOriginalEngineStartupWithBaseIni\s*\(/.test(line),
  );
  facts.smokeAssertOriginalEngineStartupWithBaseIniLine = { line: withBaseIniAssertLine };
  if (withBaseIniAssertLine === -1) {
    errors.push("smoke assertOriginalEngineStartupWithBaseIni helper not found");
  }
  if (
    missingFilesAssertLine > 0 &&
    withBaseIniAssertLine > 0 &&
    !(missingFilesAssertLine < withBaseIniAssertLine)
  ) {
    errors.push(
      `smoke assertOriginalEngineStartupWithBaseIni (line ${withBaseIniAssertLine}) must come after assertOriginalEngineStartupMissingFiles (line ${missingFilesAssertLine})`,
    );
  }
  // The with-base-INI assertion must check the ZZBase_INI.big mount name and
  // ready=true, proving startup behavior differs when base INI is mounted.
  const withBaseIniMountNameLine = lineNumber(smoke.lines, (line) =>
    /baseIniArchive\.mountName\s*!==\s*"ZZBase_INI\.big"/.test(line),
  );
  facts.smokeWithBaseIniMountNameCheckLine = { line: withBaseIniMountNameLine };
  if (withBaseIniMountNameLine === -1) {
    errors.push(
      "smoke with-base-INI assertion does not check ZZBase_INI.big mount name",
    );
  }
  const withBaseIniReadyLine = lineNumber(smoke.lines, (line) =>
    /baseIniArchive\?\.ready\s*!==\s*true/.test(line),
  );
  facts.smokeWithBaseIniReadyCheckLine = { line: withBaseIniReadyLine };
  if (withBaseIniReadyLine === -1) {
    errors.push(
      "smoke with-base-INI assertion does not check baseIniArchive ready=true",
    );
  }

  const report = {
    ok: errors.length === 0,
    errors,
    sources: SOURCES,
    facts,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(report.ok ? 0 : 1);
}

main();
