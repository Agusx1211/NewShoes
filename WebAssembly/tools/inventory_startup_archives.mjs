import { open, readdir, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(toolDir, "..");

const requiredStartupPaths = [
  "Data\\INI\\Default\\GameData.ini",
  "Data\\INI\\GameData.ini",
  "Data\\INI\\Default\\Water.ini",
  "Data\\INI\\Water.ini",
  "Data\\INI\\Default\\Weather.ini",
  "Data\\INI\\Weather.ini",
  "Data\\English\\Generals.csf",
  "Data\\INI\\GameLOD.ini",
  "Data\\INI\\GameLODPresets.ini",
  "Data\\INI\\Default\\Science.ini",
  "Data\\INI\\Science.ini",
  "Data\\INI\\Default\\Multiplayer.ini",
  "Data\\INI\\multiplayer.ini",
  "Data\\INI\\Default\\Terrain.ini",
  "Data\\INI\\Terrain.ini",
  "Data\\INI\\Default\\Roads.ini",
  "Data\\INI\\Roads.ini",
  "Data\\INI\\Rank.ini",
  "Data\\INI\\Default\\PlayerTemplate.ini",
  "Data\\INI\\PlayerTemplate.ini",
  "Data\\INI\\Default\\FXList.ini",
  "Data\\INI\\FXList.ini",
  "Data\\INI\\Weapon.ini",
  "Data\\INI\\Default\\ObjectCreationList.ini",
  "Data\\INI\\ObjectCreationList.ini",
  "Data\\INI\\Locomotor.ini",
  "Data\\INI\\Default\\SpecialPower.ini",
  "Data\\INI\\SpecialPower.ini",
  "Data\\INI\\DamageFX.ini",
  "Data\\INI\\Armor.ini",
  "Data\\INI\\Default\\Object.ini",
  "Data\\INI\\Object\\*.ini",
  "Data\\INI\\Default\\Upgrade.ini",
  "Data\\INI\\Upgrade.ini",
  "Data\\INI\\Default\\AIData.ini",
  "Data\\INI\\Default\\Crate.ini",
  "Data\\INI\\Crate.ini",
  "Data\\English\\CommandMap.ini",
  "Data\\INI\\CommandMap.ini",
  "Maps\\MapCache.ini",
  "Data\\INI\\Default\\Video.ini",
  "Data\\INI\\Video.ini",
];

const audioStartupPaths = [
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

function usage() {
  return [
    "usage: node tools/inventory_startup_archives.mjs [assets-dir]",
    "                  [--expect-current-zh] [--strict]",
    "                  [--require-base-startup] [--require-audio-startup]",
    "",
    "Indexes BIGF archives and reports original startup file coverage.",
    "",
    "  --expect-current-zh     Self-check the JSON shape against the current Zero",
    "                          Hour runtime archive set.",
    "  --strict                Fail (nonzero exit, ok=false) when any required",
    "                          startup file is missing for a reason other than an",
    "                          optional base Generals archive (INI.big/English.big)",
    "                          being absent. Missing files solely because those",
    "                          optional archives are absent are tolerated, so the",
    "                          current Zero Hour-only set (no INI.big) stays green",
    "                          under --strict.",
    "  --require-base-startup  Bounded verification mode that proves the current",
    "                          startup-file blocker when the optional base Generals",
    "                          startup archives are supplied. Fails nonzero",
    "                          (ok=false) when any optional base startup archive is",
    "                          absent or incomplete, i.e. when the base startup INI",
    "                          files (Data\\INI\\Default\\*.ini, Rank.ini,",
    "                          CommandMap.ini) are not all available. Use this to",
    "                          verify a base-Generals asset set instead of the",
    "                          Zero Hour-only set. Current Zero Hour-only assets",
    "                          fail under this mode by design.",
    "  --require-audio-startup Bounded verification mode for the",
    "                          AudioManager::init audio INI preflight. Fails",
    "                          nonzero (ok=false) when any audio startup INI is",
    "                          absent, reporting the expected source archive for",
    "                          base-owned audio settings/default INIs. Current",
    "                          Zero Hour-only assets fail under this mode by",
    "                          design.",
    "  --require-blank-window-layout",
    "                          Bounded verification mode for the original",
    "                          Menus\\BlankWindow.wnd gameplay/loading layout.",
    "                          Fails nonzero (ok=false) unless a mounted archive",
    "                          supplies Window\\Menus\\BlankWindow.wnd. Current",
    "                          Zero Hour-only assets fail under this mode by",
    "                          design.",
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
  let strict = false;
  let requireBaseStartup = false;
  let requireAudioStartup = false;
  let requireBlankWindowLayout = false;

  for (const arg of argv) {
    if (arg === "--expect-current-zh") {
      expectCurrentZh = true;
    } else if (arg === "--strict") {
      strict = true;
    } else if (arg === "--require-base-startup") {
      requireBaseStartup = true;
    } else if (arg === "--require-audio-startup") {
      requireAudioStartup = true;
    } else if (arg === "--require-blank-window-layout") {
      requireBlankWindowLayout = true;
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
  return {
    assetsDir: resolvedAssetsDir,
    expectCurrentZh,
    strict,
    requireBaseStartup,
    requireAudioStartup,
    requireBlankWindowLayout,
  };
}

async function readExact(file, position, length, context) {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  if (bytesRead !== length) {
    throw new Error(`${context}: expected ${length} bytes at ${position}, read ${bytesRead}`);
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

    // Original Win32BIGFileSystem reads this size directly into an Int on
    // little-endian x86, then byte-swaps only the file count and directory
    // entry offset/size fields.
    const archiveSize = header.readUInt32LE(4);
    const entryCount = header.readUInt32BE(8);
    if (archiveSize > fileStat.size) {
      throw new Error(`BIGF header size exceeds file size for ${bigPath}: ${archiveSize} > ${fileStat.size}`);
    }
    if (entryCount > 1000000) {
      throw new Error(`Unreasonable BIGF entry count in ${bigPath}: ${entryCount}`);
    }

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

    const entries = [];
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
      entries.push({ path, normalizedPath: normalizeEntryPath(path), size, offset });
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

function archiveRecord(archive, entry) {
  return {
    archive: archive.name,
    path: entry.path,
    size: entry.size,
    offset: entry.offset,
  };
}

const optionalBaseArchives = ["INI.big", "English.big"];
const optionalBaseLayoutArchives = ["Window.big"];
const blankWindowLayoutPath = "Window\\Menus\\BlankWindow.wnd";
const blankWindowRequestedPath = "Menus\\BlankWindow.wnd";

const baseArchiveStartupPaths = new Set([
  "data\\ini\\default\\gamedata.ini",
  "data\\ini\\gamelodpresets.ini",
  "data\\ini\\default\\water.ini",
  "data\\ini\\default\\weather.ini",
  "data\\ini\\default\\science.ini",
  "data\\ini\\default\\multiplayer.ini",
  "data\\ini\\default\\terrain.ini",
  "data\\ini\\default\\roads.ini",
  "data\\ini\\default\\playertemplate.ini",
  "data\\ini\\default\\fxlist.ini",
  "data\\ini\\default\\objectcreationlist.ini",
  "data\\ini\\default\\specialpower.ini",
  "data\\ini\\default\\upgrade.ini",
  "data\\ini\\default\\aidata.ini",
  "data\\ini\\default\\crate.ini",
  "data\\ini\\default\\video.ini",
  "data\\ini\\default\\object.ini",
  "data\\ini\\rank.ini",
  "data\\ini\\commandmap.ini",
  "data\\english\\commandmap.ini",
]);

const baseArchiveAudioStartupPaths = new Set([
  "data\\ini\\audiosettings.ini",
  "data\\ini\\default\\music.ini",
  "data\\ini\\default\\soundeffects.ini",
  "data\\ini\\default\\speech.ini",
  "data\\ini\\default\\voice.ini",
]);

const baseArchiveReadinessPaths = new Set([
  ...baseArchiveStartupPaths,
  ...baseArchiveAudioStartupPaths,
]);

function expectedBaseArchiveForPath(normalizedPath) {
  return normalizedPath === "data\\english\\commandmap.ini"
    ? "English.big"
    : "INI.big";
}

function pathExistsInArchive(byPath, normalizedPath, archiveName) {
  return (byPath.get(normalizedPath) ?? []).some((entry) => entry.archive === archiveName);
}

function classifyMissingPath(path, presentBaseArchiveNames) {
  const normalizedPath = normalizeEntryPath(path);
  if (baseArchiveReadinessPaths.has(normalizedPath)) {
    const expectedSource = expectedBaseArchiveForPath(normalizedPath);
    return {
      optionalBase: true,
      expectedSource,
      reason: presentBaseArchiveNames.has(expectedSource)
        ? "missingFromBaseArchive"
        : "optionalBaseArchiveAbsent",
    };
  }
  return { optionalBase: false, expectedSource: null, reason: "missing" };
}

function buildInventory(assetsDir, archives) {
  const byPath = new Map();
  const objectIniEntries = [];
  let indexedFiles = 0;

  for (const archive of archives) {
    indexedFiles += archive.entries.length;
    for (const entry of archive.entries) {
      if (!byPath.has(entry.normalizedPath)) {
        byPath.set(entry.normalizedPath, []);
      }
      byPath.get(entry.normalizedPath).push(archiveRecord(archive, entry));
      if (entry.normalizedPath.startsWith("data\\ini\\object\\") &&
          entry.normalizedPath.endsWith(".ini")) {
        objectIniEntries.push(archiveRecord(archive, entry));
      }
    }
  }

  objectIniEntries.sort((left, right) =>
    left.archive.localeCompare(right.archive) || left.path.localeCompare(right.path));

  const presentArchiveNames = new Set(archives.map((archive) => archive.name));
  const optionalBaseArchiveState = optionalBaseArchives.map((name) => ({
    name,
    present: presentArchiveNames.has(name),
  }));
  const optionalBaseLayoutArchiveState = optionalBaseLayoutArchives.map((name) => ({
    name,
    present: presentArchiveNames.has(name),
  }));
  const presentBaseArchiveNames = new Set(optionalBaseArchiveState
    .filter((archive) => archive.present)
    .map((archive) => archive.name));

  const candidateArchives = new Set();
  const missing = [];
  const missingDetails = [];
  const missingByReason = {
    optionalBaseArchiveAbsent: 0,
    missingFromBaseArchive: 0,
    missing: 0,
  };
  const requiredFiles = requiredStartupPaths.map((path) => {
    let archivesForPath = [];
    if (path === "Data\\INI\\Object\\*.ini") {
      archivesForPath = objectIniEntries.slice(0, 20);
    } else {
      archivesForPath = byPath.get(normalizeEntryPath(path)) ?? [];
    }

    const found = archivesForPath.length > 0;
    if (found) {
      for (const archive of archivesForPath) {
        candidateArchives.add(archive.archive);
      }
    } else {
      const classification = classifyMissingPath(path, presentBaseArchiveNames);
      missing.push(path);
      missingDetails.push({ path, ...classification });
      ++missingByReason[classification.reason];
      return { path, found, archives: archivesForPath, ...classification };
    }

    return { path, found, archives: archivesForPath };
  });

  const sortedCandidateArchives = [...candidateArchives].sort();

  // Base Generals startup-archive readiness: each optional base archive must
  // be present and leave every base startup file available in the mounted set.
  // This lets a CI bounded-verification mode prove the current startup-file
  // blocker when INI.big/English.big are supplied, separately from the
  // Zero Hour-only --strict contract.
  const baseArchiveReadiness = optionalBaseArchives.map((name) => {
    const expectedFiles = [...baseArchiveReadinessPaths]
      .filter((path) => expectedBaseArchiveForPath(path) === name)
      .sort();
    const present = presentArchiveNames.has(name);
    const missingStartupFiles = present
      ? expectedFiles.filter((path) => (byPath.get(path) ?? []).length === 0)
      : expectedFiles.slice();
    return {
      name,
      present,
      expectedStartupFileCount: expectedFiles.length,
      foundStartupFileCount: expectedFiles.length - missingStartupFiles.length,
      missingStartupFiles,
      complete: present && missingStartupFiles.length === 0,
    };
  });

  const baseArchiveStartupReady = baseArchiveReadiness.every(
    (archive) => archive.complete,
  );
  const missingBaseFiles = baseArchiveReadiness.flatMap((archive) => {
    const reason = archive.present
      ? "missingFromBaseArchive"
      : "optionalBaseArchiveAbsent";
    return archive.missingStartupFiles.map((path) => ({
      path,
      expectedSource: archive.name,
      reason,
      sourceAbsent: !archive.present,
    }));
  });
  const audioStartupFiles = audioStartupPaths.map((path) => {
    const archivesForPath = byPath.get(normalizeEntryPath(path)) ?? [];
    const found = archivesForPath.length > 0;
    const classification = found
      ? {}
      : classifyMissingPath(path, presentBaseArchiveNames);
    return {
      path,
      found,
      archives: archivesForPath,
      ...classification,
    };
  });
  const missingAudioStartupFiles = audioStartupFiles
    .filter((entry) => !entry.found)
    .map((entry) => entry.path);
  const missingAudioStartupDetails = audioStartupFiles
    .filter((entry) => !entry.found)
    .map(({ path, optionalBase, expectedSource, reason }) => ({
      path,
      optionalBase: Boolean(optionalBase),
      expectedSource: expectedSource ?? null,
      reason: reason ?? "missing",
    }));
  const missingAudioByReason = {
    optionalBaseArchiveAbsent: 0,
    missingFromBaseArchive: 0,
    missing: 0,
  };
  for (const detail of missingAudioStartupDetails) {
    ++missingAudioByReason[detail.reason];
  }
  const audioStartupReady = missingAudioStartupFiles.length === 0;
  const blankWindowEntries = byPath.get(normalizeEntryPath(blankWindowLayoutPath)) ?? [];
  const blankWindowReady = blankWindowEntries.length > 0;
  const baseWindowArchivePresent = presentArchiveNames.has("Window.big");
  const blankWindowLayout = {
    source:
      "GameLogicDispatch.cpp::prepareNewGame / GameEngine.cpp / Shell.cpp / ScoreScreen.cpp",
    requestedPath: blankWindowRequestedPath,
    archivePath: blankWindowLayoutPath,
    ready: blankWindowReady,
    archives: blankWindowEntries,
    optionalBase: true,
    expectedSource: "Window.big",
    reason: blankWindowReady
      ? null
      : baseWindowArchivePresent ? "missingFromBaseArchive" : "optionalBaseArchiveAbsent",
    mountName: baseWindowArchivePresent ? "ZZBase_Window.big" : null,
    note:
      "Zero Hour WindowZH.big does not ship this layout in the current asset set; original Win32BIGFileSystem also mounts base Generals *.big archives from the installed base game.",
  };

  return {
    ok: true,
    allRequiredFound: missing.length === 0,
    assetsDir,
    archiveCount: archives.length,
    indexedFiles,
    archives: archives.map((archive) => ({
      name: archive.name,
      size: archive.size,
      entryCount: archive.entryCount,
    })),
    optionalBaseArchives: optionalBaseArchiveState,
    optionalBaseLayoutArchives: optionalBaseLayoutArchiveState,
    blankWindowLayout,
    baseArchiveReadiness,
    baseArchiveStartupReady,
    missingBaseFiles,
    audioStartupSource: "GameAudio.cpp::AudioManager::init",
    audioStartupReady,
    audioStartupFiles,
    missingAudioStartupFiles,
    missingAudioStartupDetails,
    missingAudioByReason,
    requiredFiles,
    objectIniFiles: {
      count: objectIniEntries.length,
      examples: objectIniEntries.slice(0, 20),
    },
    missing,
    missingDetails,
    missingByReason,
    candidateArchives: sortedCandidateArchives,
    candidateArchiveCount: sortedCandidateArchives.length,
  };
}

function assertShapeForCurrentZh(inventory) {
  const requiredByPath = new Map(inventory.requiredFiles.map((entry) => [entry.path, entry]));
  const gameData = requiredByPath.get("Data\\INI\\GameData.ini");
  const armor = requiredByPath.get("Data\\INI\\Armor.ini");
  const defaultGameData = requiredByPath.get("Data\\INI\\Default\\GameData.ini");
  const rank = requiredByPath.get("Data\\INI\\Rank.ini");

  const failures = [];
  if (inventory.archiveCount <= 0) {
    failures.push("expected at least one BIG archive");
  }
  if (inventory.indexedFiles <= 0) {
    failures.push("expected indexed BIG entries");
  }
  if (!inventory.candidateArchives.includes("INIZH.big")) {
    failures.push("expected INIZH.big to be a candidate startup archive");
  }
  if (!gameData?.found || !gameData.archives.some((entry) => entry.archive === "INIZH.big")) {
    failures.push("expected Data\\INI\\GameData.ini in INIZH.big");
  }
  if (!armor?.found || !armor.archives.some((entry) => entry.archive === "INIZH.big")) {
    failures.push("expected Data\\INI\\Armor.ini in INIZH.big");
  }
  if (defaultGameData && !defaultGameData.found &&
      !inventory.missing.includes("Data\\INI\\Default\\GameData.ini")) {
    failures.push("missing default GameData.ini was not reported");
  }
  if (rank && !rank.found && !inventory.missing.includes("Data\\INI\\Rank.ini")) {
    failures.push("missing Rank.ini was not reported");
  }
  if (inventory.optionalBaseArchives?.some((archive) => archive.present)) {
    failures.push("current Zero Hour-only inventory should not include optional base archives");
  }
  if (!Array.isArray(inventory.optionalBaseLayoutArchives) ||
      inventory.optionalBaseLayoutArchives.length !== optionalBaseLayoutArchives.length ||
      inventory.optionalBaseLayoutArchives[0]?.name !== "Window.big" ||
      inventory.optionalBaseLayoutArchives[0]?.present !== false) {
    failures.push("current Zero Hour-only inventory should report absent optional base Window.big");
  }
  if (inventory.blankWindowLayout?.ready !== false ||
      inventory.blankWindowLayout?.requestedPath !== blankWindowRequestedPath ||
      inventory.blankWindowLayout?.archivePath !== blankWindowLayoutPath ||
      inventory.blankWindowLayout?.expectedSource !== "Window.big" ||
      inventory.blankWindowLayout?.reason !== "optionalBaseArchiveAbsent" ||
      inventory.blankWindowLayout?.mountName !== null ||
      inventory.blankWindowLayout?.archives?.length !== 0) {
    failures.push("current Zero Hour-only inventory should classify BlankWindow as an absent optional base Window.big layout");
  }
  if (inventory.missingByReason?.optionalBaseArchiveAbsent !== 16 ||
      inventory.missingByReason?.missingFromBaseArchive !== 0 ||
      inventory.missingByReason?.missing !== 0 ||
      inventory.missingDetails?.length !== 16 ||
      inventory.missingDetails.some((entry) => entry.reason !== "optionalBaseArchiveAbsent")) {
    failures.push("current Zero Hour-only missing startup files should all be optional base archive gaps");
  }
  if (!Array.isArray(inventory.baseArchiveReadiness) ||
      inventory.baseArchiveReadiness.length !== optionalBaseArchives.length) {
    failures.push("baseArchiveReadiness must cover every optional base archive");
  } else {
    for (const readiness of inventory.baseArchiveReadiness) {
      if (readiness.present) {
        failures.push(`current Zero Hour-only inventory should not mount ${readiness.name}`);
      }
      if (readiness.complete) {
        failures.push(`current Zero Hour-only ${readiness.name} should not be complete`);
      }
      if (readiness.expectedStartupFileCount !== readiness.missingStartupFiles.length ||
          readiness.foundStartupFileCount !== 0) {
        failures.push(`absent ${readiness.name} should report zero found startup files`);
      }
    }
  }
  if (inventory.baseArchiveStartupReady !== false) {
    failures.push("baseArchiveStartupReady must be false on the current Zero Hour-only set");
  }
  const missingBaseFileCount = inventory.baseArchiveReadiness
    .reduce((sum, readiness) => sum + readiness.missingStartupFiles.length, 0);
  if (inventory.missingBaseFiles?.length !== missingBaseFileCount) {
    failures.push("missingBaseFiles should mirror every base archive readiness gap");
  }
  const expectedCurrentAudioPresence = new Map([
    ["Data\\INI\\AudioSettings.ini", false],
    ["Data\\INI\\Default\\Music.ini", false],
    ["Data\\INI\\Music.ini", true],
    ["Data\\INI\\Default\\SoundEffects.ini", true],
    ["Data\\INI\\SoundEffects.ini", true],
    ["Data\\INI\\Default\\Speech.ini", false],
    ["Data\\INI\\Speech.ini", true],
    ["Data\\INI\\Default\\Voice.ini", false],
    ["Data\\INI\\Voice.ini", true],
    ["Data\\INI\\MiscAudio.ini", true],
  ]);
  if (inventory.audioStartupSource !== "GameAudio.cpp::AudioManager::init") {
    failures.push("audioStartupSource should anchor AudioManager::init");
  }
  if (inventory.audioStartupReady !== false) {
    failures.push("audioStartupReady must be false on the current Zero Hour-only set");
  }
  if (!Array.isArray(inventory.audioStartupFiles) ||
      inventory.audioStartupFiles.length !== expectedCurrentAudioPresence.size) {
    failures.push("audioStartupFiles must cover every AudioManager::init startup INI");
  } else {
    for (const [path, expectedFound] of expectedCurrentAudioPresence.entries()) {
      const entry = inventory.audioStartupFiles.find((candidate) => candidate.path === path);
      if (!entry) {
        failures.push(`audioStartupFiles missing ${path}`);
      } else if (entry.found !== expectedFound) {
        failures.push(`audio startup ${path} expected found=${expectedFound} but got ${entry.found}`);
      } else if (expectedFound && !entry.archives.some((archive) => archive.archive === "INIZH.big")) {
        failures.push(`audio startup ${path} should come from INIZH.big in the current set`);
      }
    }
  }
  const expectedMissingAudio = [...expectedCurrentAudioPresence.entries()]
    .filter(([, found]) => !found)
    .map(([path]) => path);
  if (JSON.stringify(inventory.missingAudioStartupFiles) !== JSON.stringify(expectedMissingAudio)) {
    failures.push("missingAudioStartupFiles should report the current absent audio startup INIs in source order");
  }
  if (inventory.missingAudioStartupDetails?.length !== expectedMissingAudio.length ||
      inventory.missingAudioStartupDetails.some((entry) =>
        entry.expectedSource !== "INI.big" ||
        entry.reason !== "optionalBaseArchiveAbsent" ||
        entry.optionalBase !== true)) {
    failures.push("missing audio startup details should classify current gaps as absent optional INI.big files");
  }
  if (inventory.missingAudioByReason?.optionalBaseArchiveAbsent !== expectedMissingAudio.length ||
      inventory.missingAudioByReason?.missingFromBaseArchive !== 0 ||
      inventory.missingAudioByReason?.missing !== 0) {
    failures.push("missingAudioByReason should summarize the current absent optional INI.big audio gaps");
  }

  if (failures.length > 0) {
    throw new Error(`Current Zero Hour asset inventory self-check failed: ${failures.join("; ")}`);
  }
}

async function main() {
  const {
    assetsDir,
    expectCurrentZh,
    strict,
    requireBaseStartup,
    requireAudioStartup,
    requireBlankWindowLayout,
  } = parseArgs(process.argv.slice(2));
  const archivePaths = await findBigArchives(assetsDir);
  const archives = [];

  for (const archivePath of archivePaths) {
    const directory = await readBigDirectory(archivePath);
    archives.push({
      name: basename(archivePath),
      path: archivePath,
      size: directory.archiveSize,
      entryCount: directory.entryCount,
      entries: directory.entries,
    });
  }

  const inventory = buildInventory(assetsDir, archives);
  if (expectCurrentZh) {
    assertShapeForCurrentZh(inventory);
  }
  if (strict) {
    const realGaps = inventory.missingDetails.filter(
      (entry) => entry.reason !== "optionalBaseArchiveAbsent",
    );
    if (realGaps.length > 0) {
      inventory.ok = false;
      inventory.strictFailures = realGaps;
      fail(
        `Strict startup-archive inventory failed: ${realGaps.length} required ` +
        `startup file(s) missing despite their source archives being present: ` +
        realGaps.map((entry) => entry.path).join(", "),
      );
    }
  }
  if (requireBaseStartup) {
    // Bounded verification: prove the current base-startup blocker. Fail when
    // any optional base startup archive is absent or incomplete, so a supplied
    // base Generals asset set must actually satisfy every base startup file.
    const absent = inventory.baseArchiveReadiness
      .filter((archive) => !archive.present)
      .map((archive) => archive.name);
    const incomplete = inventory.baseArchiveReadiness
      .filter((archive) => archive.present && !archive.complete)
      .flatMap((archive) =>
        archive.missingStartupFiles.map((path) => ({ archive: archive.name, path })));
    if (!inventory.baseArchiveStartupReady) {
      inventory.ok = false;
      inventory.requireBaseStartupFailures = {
        absent,
        incomplete,
      };
      const parts = [];
      if (absent.length > 0) {
        parts.push(
          `absent base startup archive(s): ${absent.join(", ")}`,
        );
      }
      if (incomplete.length > 0) {
        parts.push(
          `incomplete base startup archive(s) missing ` +
          `${incomplete.map((entry) => entry.path).join(", ")}`,
        );
      }
      fail(
        `Required base startup-archive verification failed: ${parts.join("; ")}`,
      );
    }
  }
  if (requireAudioStartup && !inventory.audioStartupReady) {
    inventory.ok = false;
    inventory.requireAudioStartupFailures = inventory.missingAudioStartupDetails;
    fail(
      `Required audio startup-archive verification failed: missing ` +
      `${inventory.missingAudioStartupFiles.join(", ")}`,
    );
  }
  if (requireBlankWindowLayout && !inventory.blankWindowLayout.ready) {
    inventory.ok = false;
    inventory.blankWindowLayoutFailure = inventory.blankWindowLayout;
    fail(
      `BlankWindow layout archive inventory failed: ` +
      `${inventory.blankWindowLayout.archivePath} is not available from ` +
      `${inventory.blankWindowLayout.expectedSource} (${inventory.blankWindowLayout.reason})`,
    );
  }
  console.log(JSON.stringify(inventory, null, 2));
}

try {
  await main();
} catch (error) {
  fail(error?.stack ?? error?.message ?? String(error));
}
