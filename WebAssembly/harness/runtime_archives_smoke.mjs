import { access, stat } from "node:fs/promises";
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

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const archiveRoot = resolve(wasmRoot, process.argv[2] ?? defaultArchiveRoot);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function assertGameTextProbe(assetProbe, context) {
  const gameText = assetProbe?.gameText;
  if (!gameText?.attempted
      || !gameText.ok
      || !gameText.generalsCsf
      || !gameText.titleLabel
      || !gameText.controlBarLabel
      || gameText.controlBarLabels <= 20) {
    throw new Error(`${context} did not load real GameText CSF labels: ${JSON.stringify(assetProbe)}`);
  }
}

function assertGameDataProbe(assetProbe, context) {
  const gameData = assetProbe?.gameData;
  if (!assetProbe?.inizh?.gameDataIni
      || !gameData?.attempted
      || !gameData.ok
      || gameData.source !== "GameEngine/Common/INI.cpp::load"
      || !gameData.loadedArchives
      || !gameData.fileExists
      || !gameData.originalIniLoad
      || gameData.parsedFields !== 8
      || gameData.shellMapName !== "Maps\\ShellMapMD\\ShellMapMD.map"
      || gameData.useFpsLimit !== true
      || gameData.framesPerSecondLimit !== 30
      || gameData.maxShellScreens !== 8
      || gameData.useCloudMap !== true
      || Math.abs(gameData.defaultStructureRubbleHeight - 10.0) > 0.001
      || Math.abs(gameData.groupSelectVolumeBase - 0.5) > 0.001
      || gameData.maxParticleCount !== 2500) {
    throw new Error(`${context} did not parse expected GameData.ini scalars: ${JSON.stringify(assetProbe)}`);
  }
}

function assertMapCacheProbe(assetProbe, context) {
  const mapCache = assetProbe?.mapCache;
  if (!assetProbe?.maps?.mapCacheIni
      || !mapCache?.attempted
      || !mapCache.ok
      || mapCache.source !== "GameEngine/Common/INI.cpp::load + INIMapCache.cpp"
      || !mapCache.loadedArchives
      || !mapCache.fileExists
      || !mapCache.gameTextLoaded
      || !mapCache.nameKeyGeneratorLoaded
      || !mapCache.originalIniLoad
      || mapCache.maps <= 80
      || mapCache.multiplayerMaps <= 20
      || mapCache.officialMaps <= 20
      || !mapCache.shellMapMD
      || !mapCache.tournamentDesert
      || !mapCache.tournamentDesertDisplayName
      || mapCache.tournamentDesertPlayers < 2) {
    throw new Error(`${context} did not load expected MapCache.ini metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertStartupAssets(state, context, expectedStatus, expectedOk) {
  const startupAssets = state.startupAssets;
  if (startupAssets?.ok !== expectedOk || startupAssets.status !== expectedStatus) {
    throw new Error(`${context} startup asset state mismatch: ${JSON.stringify(startupAssets)}`);
  }

  if (expectedStatus === "ready"
      && (!startupAssets.archiveSetRegistered
        || !startupAssets.bootProbeAttempted
        || !startupAssets.bootProbeOk
        || !startupAssets.required?.inizh
        || !startupAssets.required?.gameData
        || !startupAssets.required?.gameText
        || !startupAssets.required?.mapCache)) {
    throw new Error(`${context} startup asset requirements incomplete: ${JSON.stringify(startupAssets)}`);
  }
}

if (!isInside(wasmRoot, archiveRoot)) {
  throw new Error(`archive root must be inside ${wasmRoot}: ${archiveRoot}`);
}

const archives = [];
for (const name of runtimeArchives) {
  const path = resolve(archiveRoot, name);
  if (!isInside(archiveRoot, path)) {
    throw new Error(`archive path escaped ${archiveRoot}: ${path}`);
  }

  await access(path);
  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error(`archive is not a readable file: ${path}`);
  }

  archives.push({
    name,
    bytes: fileStat.size,
    urlPath: relative(wasmRoot, path).split(sep).join("/"),
  });
}

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const archiveInputs = archives.map((archive) => ({
    name: archive.name,
    bytes: archive.bytes,
    expectedBytes: archive.bytes,
    url: new URL(archive.urlPath, server.url).href,
  }));

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const mountResult = await page.evaluate((archives) => window.CnCPort.rpc("mountArchives", {
    path: "/assets/runtime",
    archives,
  }), archiveInputs);
  if (!mountResult.ok) {
    throw new Error(`cnc-port runtime archive set preload failed: ${JSON.stringify(mountResult)}`);
  }
  if (mountResult.state.booted) {
    throw new Error(`runtime archives should preload before bootstrap boot: ${JSON.stringify(mountResult.state)}`);
  }

  const archiveSet = mountResult.archiveSet;
  if (archiveSet.archiveCount !== runtimeArchives.length
      || archiveSet.probes.length !== runtimeArchives.length) {
    throw new Error(`archive set count mismatch: ${JSON.stringify(archiveSet)}`);
  }

  const failed = archiveSet.archives.filter((archive) =>
    !archive.bytesMatch || !archiveSet.probes.some((probe) => probe.path === archive.path && probe.ok));
  if (failed.length > 0) {
    throw new Error(`browser runtime archive smoke failed: ${JSON.stringify(failed)}`);
  }

  const assetProbe = mountResult.state?.assetProbe;
  if (!assetProbe?.ok || !assetProbe.inizh?.armorIni
      || !assetProbe.inizh?.commandButtonIni
      || !assetProbe.inizh?.weaponIni) {
    throw new Error(`aggregate runtime archive probe missed required INIZH files: ${JSON.stringify(assetProbe)}`);
  }
  assertGameTextProbe(assetProbe, "aggregate runtime archive probe");
  assertGameDataProbe(assetProbe, "aggregate runtime archive probe");
  assertMapCacheProbe(assetProbe, "aggregate runtime archive probe");

  if (mountResult.state.mountedArchives?.length !== runtimeArchives.length) {
    throw new Error(`mounted archive state count mismatch: ${JSON.stringify(mountResult.state.mountedArchives)}`);
  }

  const archiveMount = mountResult.state.archiveMount;
  if (!archiveMount?.registered
      || archiveMount.directory !== "/assets/runtime/"
      || archiveMount.fileMask !== "*.big"
      || archiveMount.archiveCount !== runtimeArchives.length
      || archiveMount.totalBytes !== archiveSet.totalBytes) {
    throw new Error(`wasm archive mount state mismatch: ${JSON.stringify(archiveMount)}`);
  }
  if (archiveMount.bootProbe?.attempted || archiveMount.bootProbe?.ok) {
    throw new Error(`boot archive probe should not run before boot: ${JSON.stringify(archiveMount.bootProbe)}`);
  }
  assertStartupAssets(mountResult.state, "runtime archive preload", "pending_boot_probe", false);

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "runtime archive browser smoke after archive preload",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded" || !bootResult.state.booted) {
    throw new Error(`cnc-port boot failed after archive preload: ${JSON.stringify(bootResult)}`);
  }
  const bootArchiveMount = bootResult.state.archiveMount;
  if (bootArchiveMount?.registered !== archiveMount.registered
      || bootArchiveMount.directory !== archiveMount.directory
      || bootArchiveMount.fileMask !== archiveMount.fileMask
      || bootArchiveMount.archiveCount !== archiveMount.archiveCount
      || bootArchiveMount.totalBytes !== archiveMount.totalBytes) {
    throw new Error(`archive mount state changed across boot: ${JSON.stringify({
      beforeBoot: archiveMount,
      afterBoot: bootArchiveMount,
    })}`);
  }
  if (!bootArchiveMount.bootProbe?.attempted
      || !bootArchiveMount.bootProbe.ok
      || bootArchiveMount.bootProbe.indexedFiles !== assetProbe.indexedFiles) {
    throw new Error(`boot archive probe did not consume registered archive set: ${JSON.stringify(bootArchiveMount)}`);
  }
  if (!bootResult.state.assetProbe?.ok
      || bootResult.state.assetProbe.archive !== archiveSet.probePath
      || bootResult.state.assetProbe.indexedFiles !== assetProbe.indexedFiles) {
    throw new Error(`boot asset probe mismatch: ${JSON.stringify(bootResult.state.assetProbe)}`);
  }
  assertGameTextProbe(bootResult.state.assetProbe, "boot asset probe");
  assertGameDataProbe(bootResult.state.assetProbe, "boot asset probe");
  assertMapCacheProbe(bootResult.state.assetProbe, "boot asset probe");
  assertStartupAssets(bootResult.state, "runtime archive boot", "ready", true);

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archives: archiveSet.archives,
    probes: archiveSet.probes,
    archiveCount: archiveSet.archiveCount,
    totalBytes: archiveSet.totalBytes,
    aggregateProbe: assetProbe,
    archiveMount,
    bootArchiveMount,
    startupAssets: bootResult.state.startupAssets,
    bootFrame: bootResult.state.frame,
    reader: "Win32BIGFileSystem",
    filesystem: "Emscripten MEMFS",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
