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

function assertScienceProbe(assetProbe, context) {
  const science = assetProbe?.science;
  if (!assetProbe?.inizh?.scienceIni
      || !science?.attempted
      || !science.ok
      || science.source !== "GameEngine/Common/INI.cpp::load + Common/RTS/Science.cpp"
      || !science.loadedArchives
      || !science.fileExists
      || !science.gameTextLoaded
      || !science.nameKeyGeneratorLoaded
      || !science.originalIniLoad
      || science.parsedFields !== 10
      || science.sciences !== 95
      || !science.america
      || !science.rank3
      || !science.paladinTank
      || !science.paladinNameLoaded
      || !science.paladinDescriptionLoaded
      || science.americaPurchaseCost !== 0
      || science.paladinPurchaseCost !== 1
      || science.americaGrantable !== false
      || science.paladinGrantable !== true) {
    throw new Error(`${context} did not parse expected Science.ini metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertSpecialPowerProbe(assetProbe, context) {
  const specialPower = assetProbe?.specialPower;
  const daisyCutter = specialPower?.daisyCutter;
  const carpetBomb = specialPower?.carpetBomb;
  const crateDrop = specialPower?.crateDrop;
  const neutronMissile = specialPower?.neutronMissile;
  const scudStorm = specialPower?.scudStorm;
  if (!assetProbe?.inizh?.specialPowerIni
      || !specialPower?.attempted
      || !specialPower.ok
      || specialPower.source !== "GameEngine/Common/INI.cpp::load + INISpecialPower.cpp + SpecialPower.cpp + AcademyStats.cpp"
      || !specialPower.loadedArchives
      || !specialPower.fileExists
      || !specialPower.scienceFileExists
      || !specialPower.gameTextLoaded
      || !specialPower.nameKeyGeneratorLoaded
      || specialPower.audioManagerLoaded !== false
      || !specialPower.scienceOriginalIniLoad
      || !specialPower.originalIniLoad
      || specialPower.bytes <= 30000
      || specialPower.scienceBytes <= 20000
      || specialPower.parsedFields !== 38
      || specialPower.powers !== 79
      || !daisyCutter?.found
      || daisyCutter.enum !== 1
      || daisyCutter.reloadFrames !== 10800
      || !daisyCutter.requiredScienceValid
      || daisyCutter.requiredScience !== "SCIENCE_DaisyCutter"
      || daisyCutter.publicTimer !== false
      || daisyCutter.sharedSyncedTimer !== true
      || daisyCutter.viewObjectDurationFrames !== 900
      || Math.abs(daisyCutter.viewObjectRange - 250.0) > 0.001
      || Math.abs(daisyCutter.radiusCursorRadius - 170.0) > 0.001
      || daisyCutter.shortcutPower !== true
      || daisyCutter.academyClassification !== 2
      || !carpetBomb?.found
      || carpetBomb.enum !== 3
      || carpetBomb.reloadFrames !== 4500
      || carpetBomb.publicTimer !== true
      || carpetBomb.sharedSyncedTimer !== true
      || carpetBomb.viewObjectDurationFrames !== 1200
      || Math.abs(carpetBomb.viewObjectRange - 250.0) > 0.001
      || Math.abs(carpetBomb.radiusCursorRadius - 100.0) > 0.001
      || carpetBomb.shortcutPower !== true
      || carpetBomb.academyClassification !== 2
      || !crateDrop?.found
      || crateDrop.enum !== 17
      || crateDrop.reloadFrames !== 18000
      || !crateDrop.requiredScienceValid
      || crateDrop.requiredScience !== "SCIENCE_CrateDrop"
      || crateDrop.publicTimer !== true
      || crateDrop.sharedSyncedTimer !== false
      || crateDrop.viewObjectDurationFrames !== 900
      || Math.abs(crateDrop.viewObjectRange - 250.0) > 0.001
      || Math.abs(crateDrop.radiusCursorRadius - 100.0) > 0.001
      || crateDrop.shortcutPower !== true
      || !neutronMissile?.found
      || neutronMissile.initiateAtLocationSound !== "AirRaidSiren"
      || !scudStorm?.found
      || scudStorm.initiateSound !== "ScudStormInitiated") {
    throw new Error(`${context} did not parse expected SpecialPower.ini metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertWaterProbe(assetProbe, context) {
  const water = assetProbe?.water;
  if (!assetProbe?.inizh?.waterIni
      || !water?.attempted
      || !water.ok
      || water.source !== "GameEngine/Common/INI.cpp::load + INIWater.cpp + GameClient/Water.cpp"
      || !water.loadedArchives
      || !water.fileExists
      || !water.originalIniLoad
      || water.parsedFields !== 18
      || water.waterSets !== 4
      || !water.transparencyLoaded
      || water.morningSkyTexture !== "TSCloudWis.tga"
      || water.morningWaterTexture !== "TSWater.tga"
      || water.nightSkyTexture !== "TSStarFeld.tga"
      || water.nightWaterTexture !== "TSWater.tga"
      || water.standingWaterTexture !== "TWWater01.tga"
      || water.morningRepeatCount !== 32
      || water.nightRepeatCount !== 32
      || Math.abs(water.morningSkyTexelsPerUnit - 0.8) > 0.001
      || Math.abs(water.nightSkyTexelsPerUnit - 1.6) > 0.001
      || Math.abs(water.morningUScrollPerMS - 0.002) > 0.0001
      || Math.abs(water.morningVScrollPerMS - 0.002) > 0.0001
      || Math.abs(water.nightUScrollPerMS - 0.0) > 0.0001
      || Math.abs(water.nightVScrollPerMS - 0.0) > 0.0001
      || Math.abs(water.transparentWaterDepth - 3.0) > 0.001
      || Math.abs(water.transparentWaterMinOpacity - 1.0) > 0.001
      || water.additiveBlending !== false) {
    throw new Error(`${context} did not parse expected Water.ini values: ${JSON.stringify(assetProbe)}`);
  }
}

function assertWeatherProbe(assetProbe, context) {
  const weather = assetProbe?.weather;
  if (!assetProbe?.inizh?.weatherIni
      || !weather?.attempted
      || !weather.ok
      || weather.source !== "GameEngine/Common/INI.cpp::load + GameClient/Snow.cpp"
      || !weather.loadedArchives
      || !weather.fileExists
      || !weather.originalIniLoad
      || weather.parsedFields !== 13
      || weather.snowTexture !== "ExSnowFlake.tga"
      || weather.snowEnabled !== false
      || weather.pointSprites !== true
      || Math.abs(weather.snowBoxDimensions - 200.0) > 0.001
      || Math.abs(weather.snowBoxDensity - 1.0) > 0.001
      || Math.abs(weather.snowFrequencyScaleX - 0.0533) > 0.0001
      || Math.abs(weather.snowFrequencyScaleY - 0.0275) > 0.0001
      || Math.abs(weather.snowAmplitude - 5.0) > 0.001
      || Math.abs(weather.snowVelocity - 4.0) > 0.001
      || Math.abs(weather.snowPointSize - 1.0) > 0.001
      || Math.abs(weather.snowQuadSize - 0.5) > 0.001
      || Math.abs(weather.snowMaxPointSize - 64.0) > 0.001
      || Math.abs(weather.snowMinPointSize - 0.0) > 0.001) {
    throw new Error(`${context} did not parse expected Weather.ini values: ${JSON.stringify(assetProbe)}`);
  }
}

function assertVideoProbe(assetProbe, context) {
  const video = assetProbe?.video;
  if (!assetProbe?.inizh?.videoIni
      || assetProbe.inizh.defaultVideoIni !== false
      || !video?.attempted
      || !video.ok
      || video.source !== "GameEngine/Common/INI.cpp::load + INIVideo.cpp + GameClient/VideoPlayer.cpp"
      || !video.loadedArchives
      || !video.fileExists
      || video.defaultFileExists !== false
      || !video.originalIniLoad
      || video.defaultOriginalIniLoad !== false
      || !video.shippedOriginalIniLoad
      || video.parsedFields !== 5
      || video.videos !== 41
      || video.firstInternalName !== "Sizzle"
      || video.firstFilename !== "sizzle_review"
      || video.sampleInternalName !== "Sizzle"
      || video.sampleFilename !== "sizzle_review") {
    throw new Error(`${context} did not parse expected Video.ini registry metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertMultiplayerProbe(assetProbe, context) {
  const multiplayer = assetProbe?.multiplayer;
  if (!assetProbe?.inizh?.multiplayerIni
      || !multiplayer?.attempted
      || !multiplayer.ok
      || multiplayer.source !== "GameEngine/Common/INI.cpp::load + INIMultiplayer.cpp + MultiplayerSettings.cpp + GameSpy/Chat.cpp"
      || !multiplayer.loadedArchives
      || !multiplayer.fileExists
      || !multiplayer.originalIniLoad
      || multiplayer.parsedFields !== 22
      || multiplayer.colors !== 8
      || multiplayer.startingMoneyChoices !== 4
      || multiplayer.startCountdownSeconds !== 5
      || multiplayer.maxBeaconsPerPlayer !== 3
      || multiplayer.useShroud !== false
      || multiplayer.showRandomPlayerTemplate !== true
      || multiplayer.showRandomStartPos !== true
      || multiplayer.showRandomColor !== true
      || !multiplayer.goldColorFound
      || !multiplayer.purpleColorFound
      || multiplayer.goldColor !== 0xffdde20d
      || multiplayer.purpleNightColor !== 0xffdf009c
      || multiplayer.chatDefaultColor !== 0xffffffff
      || multiplayer.chatGameColor !== 0xffffffff
      || multiplayer.chatPlayerNormalColor !== 0xffff0000
      || multiplayer.chatSelfColor !== 0xffff8000
      || multiplayer.chatMapSelectedColor !== 0xffffff00
      || multiplayer.defaultStartingMoney !== 10000
      || JSON.stringify(multiplayer.startingMoney) !== JSON.stringify([5000, 10000, 20000, 50000])) {
    throw new Error(`${context} did not parse expected Multiplayer.ini settings: ${JSON.stringify(assetProbe)}`);
  }
}

function assertTerrainProbe(assetProbe, context) {
  const terrain = assetProbe?.terrain;
  if (!assetProbe?.inizh?.terrainIni
      || !terrain?.attempted
      || !terrain.ok
      || terrain.source !== "GameEngine/Common/INI.cpp::load + INITerrain.cpp + TerrainTypes.cpp"
      || !terrain.loadedArchives
      || !terrain.fileExists
      || !terrain.originalIniLoad
      || terrain.parsedFields !== 18
      || terrain.terrains !== 247
      || !terrain.transition
      || !terrain.asphalt
      || !terrain.desertDry
      || !terrain.beachTropical
      || !terrain.snowFlat
      || terrain.transitionTexture !== "TTGrasRock01a.tga"
      || terrain.asphaltTexture !== "TXAsph01a.tga"
      || terrain.desertDryTexture !== "TMDirt07e.tga"
      || terrain.beachTropicalTexture !== "TMSand13h.tga"
      || terrain.snowFlatTexture !== "TXSnow01a.tga"
      || terrain.transitionClass !== 15
      || terrain.asphaltClass !== 33
      || terrain.desertDryClass !== 22
      || terrain.beachTropicalClass !== 24
      || terrain.snowFlatClass !== 31
      || terrain.asphaltBlendEdges !== false
      || terrain.asphaltRestrictConstruction !== false) {
    throw new Error(`${context} did not parse expected Terrain.ini entries: ${JSON.stringify(assetProbe)}`);
  }
}

function assertTerrainRoadsProbe(assetProbe, context) {
  const terrainRoads = assetProbe?.terrainRoads;
  const expectedRadar = 192 / 255;
  if (!assetProbe?.inizh?.roadsIni
      || !terrainRoads?.attempted
      || !terrainRoads.ok
      || terrainRoads.source !== "GameEngine/Common/INI.cpp::load + INITerrainRoad.cpp + INITerrainBridge.cpp + TerrainRoads.cpp"
      || !terrainRoads.loadedArchives
      || !terrainRoads.fileExists
      || !terrainRoads.originalIniLoad
      || terrainRoads.parsedFields !== 30
      || terrainRoads.roads !== 63
      || terrainRoads.bridges !== 27
      || !terrainRoads.twoLane
      || !terrainRoads.fourLane
      || !terrainRoads.dirtRoad
      || !terrainRoads.concreteBridge
      || terrainRoads.twoLaneTexture !== "TRTwoLane.tga"
      || terrainRoads.fourLaneTexture !== "TRFourLane.tga"
      || terrainRoads.dirtRoadTexture !== "TRDirtRoad.tga"
      || terrainRoads.concreteBridgeTexture !== "CBBridgeSt.tga"
      || terrainRoads.concreteBridgeModel !== "CBBridgeSt"
      || terrainRoads.concreteBridgeDamagedTexture !== "CBBridgeSt_d.tga"
      || terrainRoads.concreteBridgeScaffold !== "BridgeScaffold01"
      || terrainRoads.concreteBridgeTowerLeft !== "BridgeTowerConcreteLeft01"
      || terrainRoads.concreteBridgeDamageSound !== "BridgeDamaged"
      || terrainRoads.concreteBridgeRepairedSound !== "BridgeRepaired"
      || terrainRoads.concreteBridgeDamageOCL !== "OCL_BridgeDamaged01"
      || terrainRoads.concreteBridgeDamageFX !== "FX_BridgeDamaged01"
      || terrainRoads.concreteBridgeRepairFX !== "FX_BridgeRepaired01"
      || Math.abs(terrainRoads.twoLaneWidth - 35.0) > 0.001
      || Math.abs(terrainRoads.twoLaneWidthInTexture - 0.9) > 0.001
      || Math.abs(terrainRoads.fourLaneWidth - 60.0) > 0.001
      || Math.abs(terrainRoads.dirtRoadWidth - 52.0) > 0.001
      || Math.abs(terrainRoads.dirtRoadWidthInTexture - 0.95) > 0.001
      || Math.abs(terrainRoads.concreteBridgeScale - 0.85) > 0.001
      || Math.abs(terrainRoads.concreteBridgeRadarRed - expectedRadar) > 0.001
      || Math.abs(terrainRoads.concreteBridgeRadarGreen - expectedRadar) > 0.001
      || Math.abs(terrainRoads.concreteBridgeRadarBlue - expectedRadar) > 0.001
      || Math.abs(terrainRoads.concreteBridgeTransitionEffectsHeight - 0.0) > 0.001
      || terrainRoads.concreteBridgeNumFXPerType !== 32) {
    throw new Error(`${context} did not parse expected Roads.ini road and bridge entries: ${JSON.stringify(assetProbe)}`);
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
        || !startupAssets.required?.armor
        || !startupAssets.required?.science
        || !startupAssets.required?.specialPower
        || !startupAssets.required?.multiplayer
        || !startupAssets.required?.terrain
        || !startupAssets.required?.terrainRoads
        || !startupAssets.required?.gameData
        || !startupAssets.required?.water
        || !startupAssets.required?.weather
        || !startupAssets.required?.video
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
      || !assetProbe.inizh?.multiplayerIni
      || !assetProbe.inizh?.scienceIni
      || !assetProbe.inizh?.specialPowerIni
      || !assetProbe.inizh?.terrainIni
      || !assetProbe.inizh?.roadsIni
      || !assetProbe.inizh?.weaponIni) {
    throw new Error(`aggregate runtime archive probe missed required INIZH files: ${JSON.stringify(assetProbe)}`);
  }
  assertGameTextProbe(assetProbe, "aggregate runtime archive probe");
  assertArmorProbe(assetProbe, "aggregate runtime archive probe");
  assertScienceProbe(assetProbe, "aggregate runtime archive probe");
  assertSpecialPowerProbe(assetProbe, "aggregate runtime archive probe");
  assertMultiplayerProbe(assetProbe, "aggregate runtime archive probe");
  assertTerrainProbe(assetProbe, "aggregate runtime archive probe");
  assertTerrainRoadsProbe(assetProbe, "aggregate runtime archive probe");
  assertGameDataProbe(assetProbe, "aggregate runtime archive probe");
  assertWaterProbe(assetProbe, "aggregate runtime archive probe");
  assertWeatherProbe(assetProbe, "aggregate runtime archive probe");
  assertVideoProbe(assetProbe, "aggregate runtime archive probe");
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
  assertArmorProbe(bootResult.state.assetProbe, "boot asset probe");
  assertScienceProbe(bootResult.state.assetProbe, "boot asset probe");
  assertSpecialPowerProbe(bootResult.state.assetProbe, "boot asset probe");
  assertMultiplayerProbe(bootResult.state.assetProbe, "boot asset probe");
  assertTerrainProbe(bootResult.state.assetProbe, "boot asset probe");
  assertTerrainRoadsProbe(bootResult.state.assetProbe, "boot asset probe");
  assertGameDataProbe(bootResult.state.assetProbe, "boot asset probe");
  assertWaterProbe(bootResult.state.assetProbe, "boot asset probe");
  assertWeatherProbe(bootResult.state.assetProbe, "boot asset probe");
  assertVideoProbe(bootResult.state.assetProbe, "boot asset probe");
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
