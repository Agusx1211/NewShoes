import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const archivePath = resolve(wasmRoot, process.argv[2] ?? defaultArchivePath);
const runtimeArchivePath = "/assets/object-ini";
const sourceEntries = [
  "Data\\INI\\Armor.ini",
  "Data\\INI\\DamageFX.ini",
  "Data\\INI\\FXList.ini",
  "Data\\INI\\GameData.ini",
  "Data\\INI\\Locomotor.ini",
  "Data\\INI\\ObjectCreationList.ini",
  "Data\\INI\\ParticleSystem.ini",
  "Data\\INI\\Science.ini",
  "Data\\INI\\SpecialPower.ini",
  "Data\\INI\\Weapon.ini",
  "Data\\INI\\Default\\Object.ini",
  "Data\\INI\\Object\\AirforceGeneral.ini",
  "Data\\INI\\Object\\AmericaAir.ini",
  "Data\\INI\\Object\\AmericaCINEUnit.ini",
  "Data\\INI\\Object\\AmericaInfantry.ini",
  "Data\\INI\\Object\\AmericaMiscUnit.ini",
  "Data\\INI\\Object\\AmericaVehicle.ini",
  "Data\\INI\\Object\\BossGeneral.ini",
  "Data\\INI\\Object\\ChemicalGeneral.ini",
  "Data\\INI\\Object\\ChinaAir.ini",
  "Data\\INI\\Object\\ChinaCINEUnit.ini",
  "Data\\INI\\Object\\ChinaInfantry.ini",
  "Data\\INI\\Object\\ChinaMiscUnit.ini",
  "Data\\INI\\Object\\ChinaVehicle.ini",
  "Data\\INI\\Object\\CivilianBuilding.ini",
  "Data\\INI\\Object\\CivilianProp.ini",
  "Data\\INI\\Object\\CivilianUnit.ini",
  "Data\\INI\\Object\\DemoGeneral.ini",
  "Data\\INI\\Object\\FactionBuilding.ini",
  "Data\\INI\\Object\\FactionUnit.ini",
  "Data\\INI\\Object\\GC_Chem_GLABuildings.ini",
  "Data\\INI\\Object\\GC_Chem_GLASystem.ini",
  "Data\\INI\\Object\\GC_Chem_GLAUnits.ini",
  "Data\\INI\\Object\\GC_Slth_GLABuildings.ini",
  "Data\\INI\\Object\\GC_Slth_GLASystem.ini",
  "Data\\INI\\Object\\GC_Slth_GLAUnits.ini",
  "Data\\INI\\Object\\GLAAir.ini",
  "Data\\INI\\Object\\GLACINEUnit.ini",
  "Data\\INI\\Object\\GLAInfantry.ini",
  "Data\\INI\\Object\\GLAMiscUnit.ini",
  "Data\\INI\\Object\\GLAVehicle.ini",
  "Data\\INI\\Object\\Hulk.ini",
  "Data\\INI\\Object\\InfantryGeneral.ini",
  "Data\\INI\\Object\\LaserGeneral.ini",
  "Data\\INI\\Object\\NatureProp.ini",
  "Data\\INI\\Object\\NatureUnit.ini",
  "Data\\INI\\Object\\NukeGeneral.ini",
  "Data\\INI\\Object\\SpecialPowerObjects.ini",
  "Data\\INI\\Object\\StealthGeneral.ini",
  "Data\\INI\\Object\\SuperWeaponGeneral.ini",
  "Data\\INI\\Object\\System.ini",
  "Data\\INI\\Object\\TankGeneral.ini",
  "Data\\INI\\Object\\TechBuildings.ini",
  "Data\\INI\\Object\\WeaponObjects.ini",
];

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

const stepTimeoutMs = positiveIntegerEnv("CNC_PORT_OBJECT_INI_STEP_TIMEOUT_MS", 30000);
const probeTimeoutMs = positiveIntegerEnv("CNC_PORT_OBJECT_INI_PROBE_TIMEOUT_MS", 120000);

async function withTimeout(label, promise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function runStep(label, promise, timeoutMs = stepTimeoutMs, context = null) {
  console.error(`[object-ini] ${label}...`);
  try {
    const result = await withTimeout(label, promise, timeoutMs);
    console.error(`[object-ini] ${label} ok`);
    return result;
  } catch (error) {
    if (context) {
      throw new Error(`${error?.message ?? error}; context=${JSON.stringify(context())}`);
    }
    throw error;
  }
}

function assertObjectIniProbe(probe, context) {
  if (!probe?.attempted
      || probe.error !== ""
      || !probe.ok
      || probe.source !== "GameEngine.cpp::init initSubsystem(TheThingFactory) + "
        + "W3DModuleFactory::init + ThingFactory::parseObjectDefinition + INI.cpp::load/loadDirectory"
      || probe.stage !== "done") {
    throw new Error(`${context} object INI probe did not finish cleanly: ${JSON.stringify(probe)}`);
  }

  if (!probe.loadedArchives
      || !probe.defaultObjectIniExists
      || probe.defaultObjectIniBytes !== 5530
      || !probe.defaultObjectIniLoaded
      || !probe.objectDirectoryLoaded
      || probe.objectIniFileCount !== 43
      || probe.objectIniFilesLoaded !== 43) {
    throw new Error(`${context} object INI load surface mismatch: ${JSON.stringify(probe)}`);
  }

  if (!probe.gameDataLoaded
      || !probe.scienceLoaded
      || !probe.particleSystemLoaded
      || !probe.fxListLoaded
      || !probe.weaponLoaded
      || !probe.objectCreationListLoaded
      || !probe.locomotorLoaded
      || !probe.specialPowerLoaded
      || !probe.damageFXLoaded
      || !probe.armorLoaded) {
    throw new Error(`${context} prerequisite subsystem INIs did not load: ${JSON.stringify(probe)}`);
  }

  if (!probe.moduleFactoryInitialized
      || !probe.moduleFactoryIsW3D
      || !probe.hasW3DDefaultDraw
      || !probe.hasW3DModelDraw
      || !probe.hasDestroyDie
      || !probe.hasInactiveBody
      || !probe.hasAIUpdateInterface
      || !probe.hasGarrisonContain
      || !probe.thingFactoryIsW3D) {
    throw new Error(`${context} W3DModuleFactory registration checks failed: ${JSON.stringify(probe)}`);
  }

  // 1863 Object blocks in the 43 shipped Data\INI\Object files, plus
  // DefaultThingTemplate and the ObjectReskin-generated templates.
  if (!Number.isInteger(probe.templateCount) || probe.templateCount < 1800) {
    throw new Error(`${context} template count too low: ${JSON.stringify(probe)}`);
  }

  const byName = new Map((probe.lookups ?? []).map((entry) => [entry.name, entry]));
  const defaultTemplate = byName.get("DefaultThingTemplate");
  const humvee = byName.get("AmericaVehicleHumvee");
  const rebel = byName.get("GLAInfantryRebel");
  const raptor = byName.get("AmericaJetRaptor");
  const overlord = byName.get("ChinaTankOverlord");

  if (!defaultTemplate?.found) {
    throw new Error(`${context} DefaultThingTemplate missing: ${JSON.stringify(probe.lookups)}`);
  }
  if (!humvee?.found
      || humvee.side !== "America"
      || humvee.buildCost !== 700
      || humvee.transportSlotCount !== 3
      || humvee.isVehicle !== true
      || humvee.isInfantry !== false
      || humvee.isSelectable !== true) {
    throw new Error(`${context} AmericaVehicleHumvee fields mismatch: ${JSON.stringify(humvee)}`);
  }
  if (!rebel?.found
      || rebel.side !== "GLA"
      || rebel.buildCost !== 150
      || rebel.transportSlotCount !== 1
      || rebel.isVehicle !== false
      || rebel.isInfantry !== true
      || rebel.isSelectable !== true) {
    throw new Error(`${context} GLAInfantryRebel fields mismatch: ${JSON.stringify(rebel)}`);
  }
  if (!raptor?.found || !overlord?.found) {
    throw new Error(`${context} expected templates missing: ${JSON.stringify(probe.lookups)}`);
  }

  const ids = new Set();
  for (const entry of probe.lookups) {
    if (!entry.found) continue;
    if (ids.has(entry.templateID)) {
      throw new Error(`${context} duplicate template ids: ${JSON.stringify(probe.lookups)}`);
    }
    ids.add(entry.templateID);
  }
}

function assertRangeBackedArchiveSet(archiveSet, archiveStat, sourceArchivePath) {
  const rangeArchive = archiveSet?.archives?.[0];
  if (archiveSet?.path !== runtimeArchivePath
      || archiveSet?.archiveCount !== 1
      || archiveSet?.storage !== "range-backed-subset-big"
      || archiveSet?.reader !== "browser fetch Range -> synthesized BIG -> Win32BIGFileSystem"
      || archiveSet?.sourceTotalBytes !== archiveStat.size
      || archiveSet?.totalBytes >= archiveSet?.sourceTotalBytes
      || rangeArchive?.path !== `${runtimeArchivePath}/INIZH.big`
      || rangeArchive?.sourceBytes !== archiveStat.size
      || rangeArchive?.entryCount !== sourceEntries.length
      || rangeArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeArchive?.storage !== "range-backed-subset-big") {
    throw new Error(`range-backed object INI archive metadata mismatch: ${JSON.stringify(archiveSet)}`);
  }

  const entries = new Map((rangeArchive.entries ?? []).map((entry) => [
    String(entry.path ?? "").toLowerCase(),
    entry,
  ]));
  for (const sourceEntry of sourceEntries) {
    const entry = entries.get(sourceEntry.toLowerCase());
    if (!entry
        || entry.bytes <= 0
        || entry.reader !== "browser fetch Range"
        || entry.sourceArchive !== sourceArchivePath) {
      throw new Error(`range-backed object INI entry mismatch for ${sourceEntry}: ${JSON.stringify(entry)}`);
    }
  }
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
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
  const pageErrors = [];
  const pageConsole = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    pageConsole.push(`${message.type()}: ${message.text()}`);
    if (pageConsole.length > 40) {
      pageConsole.shift();
    }
  });
  const pageContext = () => ({ pageErrors, pageConsole });
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const archiveUrl = new URL(archiveRelativePath, server.url).href;

  await runStep("load harness page",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    stepTimeoutMs,
    pageContext);
  await runStep("wait for cnc-port RPC",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    stepTimeoutMs,
    pageContext);

  const bootResult = await runStep("boot cnc-port",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "object INI browser smoke",
    })),
    stepTimeoutMs,
    pageContext);
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before archive mount: ${JSON.stringify(bootResult)}`);
  }

  const mountResult = await runStep("mount range-backed object INI subset",
    page.evaluate((payload) => window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
      path: runtimeArchivePath,
      verifyEach: false,
      archives: [
        {
          url: archiveUrl,
          name: "INIZH.big",
          expectedSourceBytes: archiveStat.size,
          sourceArchive: archivePath,
          entries: sourceEntries,
        },
      ],
    }),
    stepTimeoutMs,
    pageContext);
  if (!mountResult.ok) {
    throw new Error(`cnc-port range-backed object INI archive mount failed: ${JSON.stringify(mountResult)}`);
  }
  assertRangeBackedArchiveSet(mountResult.archiveSet, archiveStat, archivePath);
  const archiveMount = mountResult.state?.archiveMount;
  if (!archiveMount?.registered
      || archiveMount.directory !== `${runtimeArchivePath}/`
      || archiveMount.fileMask !== "*.big"
      || archiveMount.archiveCount !== 1
      || archiveMount.totalBytes !== mountResult.archiveSet.totalBytes) {
    throw new Error(`range-backed object INI archive registration mismatch: ${JSON.stringify(archiveMount)}`);
  }

  const probeResult = await runStep("probe object INI runtime",
    page.evaluate((path) => window.CnCPort.rpc("probeObjectIni", {
      path,
    }), `${runtimeArchivePath}/INIZH.big`),
    probeTimeoutMs,
    pageContext);
  if (!probeResult.ok) {
    throw new Error(`object INI probe rpc failed: ${JSON.stringify(probeResult)}`);
  }
  assertObjectIniProbe(probeResult.probe, "cnc-port object INI probe");

  if (pageErrors.length > 0) {
    throw new Error(`page errors during object INI smoke: ${JSON.stringify({
      pageErrors,
      pageConsole,
    })}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archive: archiveRelativePath,
    sourceBytes: archiveStat.size,
    subsetBytes: mountResult.archiveSet.totalBytes,
    sourceEntryCount: sourceEntries.length,
    templateCount: probeResult.probe.templateCount,
    objectIniFileCount: probeResult.probe.objectIniFileCount,
    xferCRC: probeResult.probe.xferCRC,
    gameTextCsfLoaded: probeResult.probe.gameTextCsfLoaded,
    lookups: probeResult.probe.lookups,
    source: probeResult.probe.source,
    reader: mountResult.archiveSet.reader,
    filesystem: "Emscripten MEMFS",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
