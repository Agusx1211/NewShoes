import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const archivePath = resolve(wasmRoot, process.argv[2] ?? defaultArchivePath);

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
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const archiveUrl = new URL(archiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "object INI browser smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before archive mount: ${JSON.stringify(bootResult)}`);
  }

  const mountResult = await page.evaluate((url) => window.CnCPort.rpc("mountArchive", {
    url,
    name: "INIZH.big",
  }), archiveUrl);
  if (!mountResult.ok || !mountResult.state?.assetProbe?.ok) {
    throw new Error(`cnc-port archive mount failed: ${JSON.stringify(mountResult)}`);
  }

  const probeResult = await page.evaluate(() => window.CnCPort.rpc("probeObjectIni", {
    path: "/assets/INIZH.big",
  }));
  if (!probeResult.ok) {
    throw new Error(`object INI probe rpc failed: ${JSON.stringify(probeResult)}`);
  }
  assertObjectIniProbe(probeResult.probe, "cnc-port object INI probe");

  if (pageErrors.length > 0) {
    throw new Error(`page errors during object INI smoke: ${JSON.stringify(pageErrors)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archive: archiveRelativePath,
    templateCount: probeResult.probe.templateCount,
    objectIniFileCount: probeResult.probe.objectIniFileCount,
    xferCRC: probeResult.probe.xferCRC,
    gameTextCsfLoaded: probeResult.probe.gameTextCsfLoaded,
    lookups: probeResult.probe.lookups,
    source: probeResult.probe.source,
    reader: "Win32BIGFileSystem",
    filesystem: "Emscripten MEMFS",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
