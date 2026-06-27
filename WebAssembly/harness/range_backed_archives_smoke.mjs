import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const archivePath = resolve(wasmRoot, process.argv[2] ?? defaultArchivePath);
const runtimeArchivePath = "/assets/range-runtime";
const sourceEntries = [
  "Data\\INI\\GameData.ini",
  "Data\\INI\\Armor.ini",
];

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
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

function assertArmorProbe(assetProbe, context) {
  const armor = assetProbe?.armor;
  if (!assetProbe?.inizh?.armorIni
      || !armor?.attempted
      || !armor.ok
      || armor.source !== "GameEngine/Common/INI.cpp::load + GameLogic/Object/Armor.cpp"
      || !armor.loadedArchives
      || !armor.fileExists
      || !armor.nameKeyGeneratorLoaded
      || !armor.originalIniLoad
      || armor.parsedFields !== 11
      || !armor.noArmor
      || !armor.humanArmor
      || !armor.tankArmor
      || Math.abs(armor.noArmorExplosionDamage - 100.0) > 0.001
      || Math.abs(armor.noArmorHazardCleanupDamage - 0.0) > 0.001
      || Math.abs(armor.humanCrushDamage - 200.0) > 0.001
      || Math.abs(armor.humanArmorPiercingDamage - 10.0) > 0.001
      || Math.abs(armor.humanFlameDamage - 150.0) > 0.001
      || Math.abs(armor.tankSmallArmsDamage - 25.0) > 0.001
      || Math.abs(armor.tankRadiationDamage - 50.0) > 0.001
      || Math.abs(armor.tankMicrowaveDamage - 0.0) > 0.001) {
    throw new Error(`${context} did not parse expected Armor.ini coefficients: ${JSON.stringify(assetProbe)}`);
  }
}

if (!isInside(wasmRoot, archivePath)) {
  throw new Error(`archive must be inside ${wasmRoot}: ${archivePath}`);
}

await access(archivePath);
const archiveStat = await stat(archivePath);
if (!archiveStat.isFile() || archiveStat.size <= 0) {
  throw new Error(`archive is not a readable file: ${archivePath}`);
}

const archiveRelativePath = relative(wasmRoot, archivePath).split(sep).join("/");
const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const archiveUrl = new URL(archiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const mountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
    path: runtimeArchivePath,
    archives: [
      {
        url: archiveUrl,
        name: "INIZH.big",
        expectedSourceBytes: archiveStat.size,
        sourceArchive: archivePath,
        entries: sourceEntries,
      },
    ],
  });
  if (!mountResult.ok) {
    throw new Error(`range-backed INIZH archive set mount failed: ${JSON.stringify(mountResult)}`);
  }

  const archiveSet = mountResult.archiveSet;
  const rangeArchive = archiveSet?.archives?.[0];
  const gameDataEntry = rangeArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === sourceEntries[0].toLowerCase());
  const armorEntry = rangeArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === sourceEntries[1].toLowerCase());
  if (archiveSet?.path !== runtimeArchivePath
      || archiveSet?.archiveCount !== 1
      || archiveSet?.storage !== "range-backed-subset-big"
      || archiveSet?.reader !== "browser fetch Range -> synthesized BIG -> Win32BIGFileSystem"
      || archiveSet?.sourceTotalBytes !== archiveStat.size
      || archiveSet?.totalBytes >= archiveSet?.sourceTotalBytes
      || archiveSet?.probes?.length !== 1
      || archiveSet.probes[0]?.ok !== true
      || rangeArchive?.path !== `${runtimeArchivePath}/INIZH.big`
      || rangeArchive?.sourceBytes !== archiveStat.size
      || rangeArchive?.entryCount !== sourceEntries.length
      || rangeArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeArchive?.storage !== "range-backed-subset-big"
      || gameDataEntry?.bytes <= 0
      || gameDataEntry?.reader !== "browser fetch Range"
      || gameDataEntry?.sourceArchive !== archivePath
      || armorEntry?.bytes <= 0
      || armorEntry?.reader !== "browser fetch Range"
      || armorEntry?.sourceArchive !== archivePath) {
    throw new Error(`range-backed INIZH archive metadata mismatch: ${JSON.stringify(archiveSet)}`);
  }

  const assetProbe = mountResult.state?.assetProbe;
  if (!assetProbe?.ok
      || assetProbe.archive !== `${runtimeArchivePath}/*.big`
      || assetProbe.indexedFiles !== sourceEntries.length
      || assetProbe.sampleBytes <= 0) {
    throw new Error(`range-backed INIZH aggregate probe failed: ${JSON.stringify(assetProbe)}`);
  }
  assertGameDataProbe(assetProbe, "range-backed INIZH subset probe");
  assertArmorProbe(assetProbe, "range-backed INIZH subset probe");

  const archiveMount = mountResult.state?.archiveMount;
  if (!archiveMount?.registered
      || archiveMount.directory !== `${runtimeArchivePath}/`
      || archiveMount.fileMask !== "*.big"
      || archiveMount.archiveCount !== 1
      || archiveMount.totalBytes !== archiveSet.totalBytes) {
    throw new Error(`range-backed runtime archive registration mismatch: ${JSON.stringify(archiveMount)}`);
  }
  if (archiveMount.bootProbe?.attempted || archiveMount.bootProbe?.ok) {
    throw new Error(`range-backed archive boot probe should wait for boot: ${JSON.stringify(archiveMount.bootProbe)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archive: archiveRelativePath,
    sourceBytes: archiveStat.size,
    subsetBytes: archiveSet.totalBytes,
    entries: rangeArchive.entries,
    indexedFiles: assetProbe.indexedFiles,
    parserChecks: {
      gameData: assetProbe.gameData,
      armor: assetProbe.armor,
    },
    reader: archiveSet.reader,
    storage: archiveSet.storage,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
