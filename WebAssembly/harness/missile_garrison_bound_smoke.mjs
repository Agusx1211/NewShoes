#!/usr/bin/env node
import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const archiveSource = resolve(
  wasmRoot,
  process.argv[2] ?? "artifacts/real-assets/INIZH.big",
);
const runtimeArchivePath = "/assets/runtime-missile-garrison-bound";
const archiveName = "INIZH.big";
const archiveMemfsPath = `${runtimeArchivePath}/${archiveName}`;

const snippetText = String.raw`
Object CncPortMissileGarrisonProbeProjectile
  KindOf = PROJECTILE

  ArmorSet
    Conditions = None
    Armor = StructureArmor
    DamageFX = StructureDamageFX
  End

  Body = ActiveBody ModuleTag_Body
    MaxHealth = 1.0
    InitialHealth = 1.0
  End

  Behavior = MissileAIUpdate ModuleTag_Missile
    TryToFollowTarget = Yes
    FuelLifetime = 500
    InitialVelocity = 0
    IgnitionDelay = 0
    DistanceToTravelBeforeTurning = 0
    GarrisonHitKillRequiredKindOf = INFANTRY
    GarrisonHitKillForbiddenKindOf = NONE
    GarrisonHitKillCount = 2
  End

  Geometry = Sphere
  GeometryIsSmall = Yes
  GeometryMajorRadius = 1.0
End

Object CncPortMissileGarrisonProbeTarget
  KindOf = STRUCTURE IMMOBILE

  ArmorSet
    Conditions = None
    Armor = StructureArmor
    DamageFX = StructureDamageFX
  End

  Body = ActiveBody ModuleTag_Body
    MaxHealth = 100.0
    InitialHealth = 100.0
  End

  Behavior = GarrisonContain ModuleTag_Contain
    ContainMax = 5
    ImmuneToClearBuildingAttacks = No
    IsEnclosingContainer = No
  End

  Geometry = Box
  GeometryMajorRadius = 10.0
  GeometryMinorRadius = 10.0
  GeometryHeight = 10.0
End

Object CncPortMissileGarrisonProbeOccupant
  KindOf = INFANTRY

  ArmorSet
    Conditions = None
    Armor = StructureArmor
    DamageFX = StructureDamageFX
  End

  Body = ActiveBody ModuleTag_Body
    MaxHealth = 10.0
    InitialHealth = 10.0
  End

  Geometry = Sphere
  GeometryIsSmall = Yes
  GeometryMajorRadius = 1.0
End
`;

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

if (!isInside(wasmRoot, archiveSource)) {
  throw new Error(`${archiveName} must be inside ${wasmRoot}: ${archiveSource}`);
}
await access(archiveSource);
const archiveStat = await stat(archiveSource);
if (!archiveStat.isFile() || archiveStat.size <= 0) {
  throw new Error(`${archiveName} is not a readable file: ${archiveSource}`);
}
const archiveUrlPath = relative(wasmRoot, archiveSource).split(sep).join("/");

const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "MissileAIUpdate garrison iteration bound smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before missile probe: ${JSON.stringify(bootResult)}`);
  }

  const mountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountArchives", payload), {
      path: runtimeArchivePath,
      archives: [{
        url: new URL(archiveUrlPath, server.url).href,
        name: archiveName,
        expectedBytes: archiveStat.size,
      }],
    });
  if (!mountResult.ok
      || mountResult.archiveSet?.archiveCount !== 1
      || mountResult.archiveSet?.archives?.[0]?.bytesMatch !== true
      || mountResult.archiveSet?.probes?.[0]?.ok !== true) {
    throw new Error(`missile probe archive mount failed: ${JSON.stringify(mountResult)}`);
  }

  const preflightResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("probeMissileGarrisonBound", payload), {
      path: archiveMemfsPath,
      snippetText: snippetText.replace(
        "GarrisonHitKillCount = 2",
        "GarrisonHitKillCount = 1",
      ),
    });
  if (!preflightResult.ok
      || preflightResult.probe?.results?.collisionInvoked !== true
      || preflightResult.probe?.results?.collisionReturned !== true
      || preflightResult.probe?.results?.occupantKilled !== true
      || preflightResult.probe?.results?.cleanupComplete !== true) {
    throw new Error(
      `missile garrison one-kill preflight failed: ${JSON.stringify(preflightResult)}`,
    );
  }
  const probePayload = {
    path: archiveMemfsPath,
    snippetText,
  };
  await page.evaluate((payload) => {
    window.__cncPortMissileGarrisonProbe = { done: false, result: null, error: null };
    setTimeout(async () => {
      try {
        window.__cncPortMissileGarrisonProbe.result = await window.CnCPort.rpc(
          "probeMissileGarrisonBound",
          payload,
        );
      } catch (error) {
        window.__cncPortMissileGarrisonProbe.error = error?.message ?? String(error);
      } finally {
        window.__cncPortMissileGarrisonProbe.done = true;
      }
    }, 0);
  }, probePayload);
  try {
    await page.waitForFunction(
      () => window.__cncPortMissileGarrisonProbe?.done === true,
      null,
      { timeout: 10_000 },
    );
  } catch (error) {
    throw new Error(
      "missile garrison two-kill probe did not return after the one-kill "
      + `collision path completed: ${error}`,
    );
  }
  const probeState = await page.evaluate(() => window.__cncPortMissileGarrisonProbe);
  if (probeState.error) {
    throw new Error(`missile garrison probe threw: ${probeState.error}`);
  }
  const result = probeState.result;
  const probeResults = result.probe?.results;
  if (!result.ok
      || result.command !== "probeMissileGarrisonBound"
      || result.probe?.source !== "missile_garrison_bound_probe"
      || !result.probe?.path?.includes("MissileAIUpdate::projectileHandleCollision")
      || probeResults?.containedCountBeforeCollision !== 1
      || probeResults?.objectCountAfterCreate !== probeResults?.objectCountBefore + 3
      || probeResults?.projectileArmed !== true
      || probeResults?.collisionInvoked !== true
      || probeResults?.collisionReturned !== true
      || probeResults?.occupantKilled !== true
      || probeResults?.missileDestroyed !== true
      || probeResults?.cleanupComplete !== true
      || probeResults?.objectCountAfterCleanup !== probeResults?.objectCountBefore) {
    throw new Error(`missile garrison bound regression failed: ${JSON.stringify(result)}`);
  }

  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during missile probe: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-missile-garrison-bound",
    url: harnessUrl,
    probe: result.probe,
    browserEventCount: browserEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
