import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const archivePath = resolve(wasmRoot, process.argv[2] ?? defaultArchivePath);

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

function assertUpgradeProbe(assetProbe, context) {
  const upgrade = assetProbe?.upgrade;
  const flashBang = upgrade?.flashBang;
  const captureBuilding = upgrade?.captureBuilding;
  const laserMissiles = upgrade?.laserMissiles;
  const chinaMines = upgrade?.chinaMines;
  const americaRadar = upgrade?.americaRadar;
  if (!assetProbe?.inizh?.upgradeIni
      || !upgrade?.attempted
      || !upgrade.ok
      || upgrade.source !== "GameEngine/Common/INI.cpp::load + INIUpgrade.cpp + Upgrade.cpp"
      || !upgrade.loadedArchives
      || !upgrade.fileExists
      || !upgrade.nameKeyGeneratorLoaded
      || !upgrade.originalIniLoad
      || upgrade.bytes <= 5000
      || upgrade.parsedFields !== 34
      || upgrade.upgrades !== 83
      || !upgrade.veterancy?.veteran
      || !upgrade.veterancy.elite
      || !upgrade.veterancy.heroic
      || !flashBang?.found
      || flashBang.displayName !== "UPGRADE:RangerFlashBangGrenade"
      || flashBang.type !== 0
      || flashBang.buildFrames !== 900
      || flashBang.cost !== 800
      || flashBang.researchSound !== "RangerVoiceUpgradeFlashBangGrenades"
      || !captureBuilding?.found
      || captureBuilding.displayName !== "UPGRADE:RangerCaptureBuilding"
      || captureBuilding.type !== 0
      || captureBuilding.buildFrames !== 900
      || captureBuilding.cost !== 1000
      || !laserMissiles?.found
      || laserMissiles.displayName !== "UPGRADE:AmericaLaserMissiles"
      || laserMissiles.type !== 0
      || laserMissiles.buildFrames !== 1200
      || laserMissiles.cost !== 1500
      || laserMissiles.researchSound !== "RaptorVoiceUpgradeLaserGuidedMissiles"
      || !chinaMines?.found
      || chinaMines.displayName !== "UPGRADE:Mines"
      || chinaMines.type !== 1
      || chinaMines.buildFrames !== 600
      || chinaMines.cost !== 600
      || chinaMines.researchSound !== "MineFieldPlaced"
      || !americaRadar?.found
      || americaRadar.displayName !== "UPGRADE:Radar"
      || americaRadar.type !== 1
      || americaRadar.buildFrames !== 300
      || americaRadar.cost !== 500
      || americaRadar.researchSound !== ""
      || americaRadar.academyClassification !== 1) {
    throw new Error(`${context} did not parse expected Upgrade.ini metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertCommandButtonProbe(assetProbe, context) {
  const commandButton = assetProbe?.commandButton;
  const flashBangUpgrade = commandButton?.flashBangUpgrade;
  const rangerCapture = commandButton?.rangerCapture;
  const flashBangSwitch = commandButton?.flashBangSwitch;
  if (!assetProbe?.inizh?.commandButtonIni
      || !commandButton?.attempted
      || !commandButton.ok
      || commandButton.source !== "GameEngine/Common/INI.cpp::load + INICommandButton.cpp + ControlBar.cpp field table + Upgrade.cpp + SpecialPower.cpp"
      || !commandButton.loadedArchives
      || !commandButton.fileExists
      || !commandButton.scienceFileExists
      || !commandButton.specialPowerFileExists
      || !commandButton.upgradeFileExists
      || !commandButton.nameKeyGeneratorLoaded
      || commandButton.scienceOriginalIniLoad !== false
      || !commandButton.specialPowerOriginalIniLoad
      || !commandButton.upgradeOriginalIniLoad
      || !commandButton.originalIniLoad
      || !commandButton.filteredFromShipped
      || commandButton.bytes <= 100000
      || commandButton.specialPowerBytes <= 5000
      || commandButton.upgradeBytes <= 5000
      || commandButton.filteredBytes <= 500
      || commandButton.filteredBlocks !== 3
      || commandButton.parsedFields !== 34
      || commandButton.buttons !== 3
      || !commandButton.specialPowerOptionPairingValid
      || !flashBangUpgrade?.found
      || flashBangUpgrade.command !== 5
      || flashBangUpgrade.border !== 2
      || flashBangUpgrade.upgrade !== "Upgrade_AmericaRangerFlashBangGrenade"
      || flashBangUpgrade.textLabel !== "CONTROLBAR:UpgradeAmericaFlashBangGrenade"
      || flashBangUpgrade.description !== "CONTROLBAR:TooltipUSAUpgradeFlashBangGrenades"
      || !rangerCapture?.found
      || rangerCapture.command !== 21
      || rangerCapture.border !== 3
      || rangerCapture.upgrade !== "Upgrade_InfantryCaptureBuilding"
      || rangerCapture.specialPower !== "SpecialAbilityRangerCaptureBuilding"
      || rangerCapture.textLabel !== "CONTROLBAR:CaptureBuilding"
      || rangerCapture.description !== "CONTROLBAR:ToolTipUSARangerCaptureBuilding"
      || rangerCapture.cursor !== "CaptureBuilding"
      || rangerCapture.invalidCursor !== "GenericInvalid"
      || !rangerCapture.hasEnemyTarget
      || !rangerCapture.hasNeutralTarget
      || !rangerCapture.hasMultiSelect
      || !rangerCapture.hasNeedUpgrade
      || !rangerCapture.hasNeedSpecialPowerScience
      || !flashBangSwitch?.found
      || flashBangSwitch.command !== 26
      || flashBangSwitch.weaponSlot !== 1
      || flashBangSwitch.border !== 3
      || flashBangSwitch.upgrade !== "Upgrade_AmericaRangerFlashBangGrenade"
      || flashBangSwitch.textLabel !== "CONTROLBAR:FlashBangGrenadeMode"
      || flashBangSwitch.description !== "CONTROLBAR:ToolTipSwitchToUSAFlashBang"
      || !flashBangSwitch.hasCheckLike
      || !flashBangSwitch.hasMultiSelect
      || !flashBangSwitch.hasNeedUpgrade) {
    throw new Error(`${context} did not parse expected CommandButton.ini entries: ${JSON.stringify(assetProbe)}`);
  }
}

function assertCommandSetProbe(assetProbe, context) {
  const commandSet = assetProbe?.commandSet;
  const ranger = commandSet?.ranger;
  if (!assetProbe?.inizh?.commandSetIni
      || !commandSet?.attempted
      || !commandSet.ok
      || commandSet.source !== "GameEngine/Common/INI.cpp::load + INICommandSet.cpp + ControlBar.cpp CommandSet parser"
      || !commandSet.loadedArchives
      || !commandSet.fileExists
      || !commandSet.commandButtonFileExists
      || !commandSet.specialPowerFileExists
      || !commandSet.upgradeFileExists
      || !commandSet.nameKeyGeneratorLoaded
      || !commandSet.specialPowerOriginalIniLoad
      || !commandSet.upgradeOriginalIniLoad
      || !commandSet.commandButtonOriginalIniLoad
      || !commandSet.originalIniLoad
      || !commandSet.filteredFromShipped
      || commandSet.bytes <= 50000
      || commandSet.commandButtonBytes <= 100000
      || commandSet.specialPowerBytes <= 5000
      || commandSet.upgradeBytes <= 5000
      || commandSet.filteredCommandButtonBytes <= 1000
      || commandSet.filteredCommandButtonBlocks !== 6
      || commandSet.filteredCommandSetBytes <= 200
      || commandSet.filteredCommandSetBlocks !== 1
      || commandSet.parsedFields !== 23
      || commandSet.commandButtons !== 6
      || commandSet.commandSets !== 1
      || !ranger?.found
      || ranger.slot1?.name !== "Command_AmericaRangerCaptureBuilding"
      || ranger.slot1.command !== 21
      || ranger.slot1.specialPower !== "SpecialAbilityRangerCaptureBuilding"
      || ranger.slot1.upgrade !== "Upgrade_InfantryCaptureBuilding"
      || ranger.slot2?.name !== "Command_AmericaRangerSwitchToMachineGun"
      || ranger.slot2.command !== 26
      || ranger.slot2.weaponSlot !== 0
      || ranger.slot4?.name !== "Command_AmericaRangerSwitchToFlagBangGrenades"
      || ranger.slot4.command !== 26
      || ranger.slot4.weaponSlot !== 1
      || ranger.slot4.upgrade !== "Upgrade_AmericaRangerFlashBangGrenade"
      || ranger.slot11?.name !== "Command_AttackMove"
      || ranger.slot11.command !== 8
      || ranger.slot13?.name !== "Command_Guard"
      || ranger.slot13.command !== 9
      || ranger.slot14?.name !== "Command_Stop"
      || ranger.slot14.command !== 12) {
    throw new Error(`${context} did not parse expected CommandSet.ini entries: ${JSON.stringify(assetProbe)}`);
  }
}

function assertCrateProbe(assetProbe, context) {
  const crate = assetProbe?.crate;
  const salvage = crate?.salvage;
  const elite = crate?.elite;
  const heroic = crate?.heroic;
  const gla02 = crate?.gla02;
  if (!assetProbe?.inizh?.crateIni
      || !crate?.attempted
      || !crate.ok
      || crate.source !== "GameEngine/Common/INI.cpp::load + INICrate.cpp + CrateSystem.cpp + Science.cpp"
      || !crate.loadedArchives
      || !crate.fileExists
      || !crate.scienceFileExists
      || !crate.nameKeyGeneratorLoaded
      || !crate.scienceOriginalIniLoad
      || !crate.originalIniLoad
      || !crate.filteredFromShipped
      || crate.bytes <= 10000
      || crate.scienceBytes <= 10000
      || crate.filteredBytes <= 500
      || crate.filteredBlocks !== 7
      || crate.parsedFields !== 34
      || crate.templates !== 7
      || !salvage?.found
      || Math.abs(salvage.creationChance - 1.0) > 0.001
      || !salvage.salvagerKindOf
      || !salvage.killerScienceValid
      || salvage.objects !== 1
      || salvage.object !== "SalvageCrate"
      || Math.abs(salvage.objectChance - 1.0) > 0.001
      || !elite?.found
      || Math.abs(elite.creationChance - 0.75) > 0.001
      || elite.veterancyLevel !== 2
      || elite.objects !== 2
      || elite.firstObject !== "1000DollarCrate"
      || Math.abs(elite.firstChance - 0.75) > 0.001
      || elite.secondObject !== "SmallLevelUpCrate"
      || Math.abs(elite.secondChance - 0.25) > 0.001
      || !heroic?.found
      || Math.abs(heroic.creationChance - 1.0) > 0.001
      || heroic.veterancyLevel !== 3
      || heroic.objects !== 3
      || heroic.firstObject !== "2500DollarCrate"
      || Math.abs(heroic.firstChance - 0.5) > 0.001
      || heroic.thirdObject !== "2FreeCrusadersCrate"
      || Math.abs(heroic.thirdChance - 0.25) > 0.001
      || !gla02?.hundred?.found
      || !gla02.hundred.ownedByMaker
      || gla02.hundred.object !== "100DollarCrate"
      || Math.abs(gla02.hundred.chance - 1.0) > 0.001
      || !gla02.twentyFiveHundred?.found
      || !gla02.twentyFiveHundred.ownedByMaker
      || gla02.twentyFiveHundred.object !== "2500DollarCrate"
      || Math.abs(gla02.twentyFiveHundred.chance - 1.0) > 0.001) {
    throw new Error(`${context} did not parse expected Crate.ini CrateData entries: ${JSON.stringify(assetProbe)}`);
  }
}

function assertDrawGroupInfoProbeAbsent(assetProbe, context) {
  const drawGroupInfo = assetProbe?.drawGroupInfo;
  if (assetProbe?.inizh?.drawGroupInfoIni !== false
      || drawGroupInfo?.attempted !== false
      || drawGroupInfo.ok !== false
      || drawGroupInfo.fileExists !== false
      || drawGroupInfo.originalIniLoad !== false
      || drawGroupInfo.parsedFields !== 0) {
    throw new Error(`${context} should report no shipped DrawGroupInfo.ini: ${JSON.stringify(assetProbe)}`);
  }
}

function assertMappedImageProbe(assetProbe, context) {
  const mappedImages = assetProbe?.mappedImages;
  const saChinook = mappedImages?.saChinook;
  const watermarkChina = mappedImages?.watermarkChina;
  if (!mappedImages?.attempted
      || !mappedImages.ok
      || mappedImages.source !== "GameEngine/Common/INI.cpp::loadDirectory + INIMappedImage.cpp + GameClient/Image.cpp"
      || !mappedImages.loadedArchives
      || !mappedImages.fileExists
      || !mappedImages.nameKeyGeneratorLoaded
      || !mappedImages.originalIniLoad
      || mappedImages.parsedFields !== 18
      || mappedImages.files !== 14
      || mappedImages.images !== 1186
      || !saChinook?.found
      || saChinook.texture !== "SAUserInterface512_001.tga"
      || saChinook.textureWidth !== 512
      || saChinook.textureHeight !== 512
      || saChinook.width !== 120
      || saChinook.height !== 96
      || saChinook.status !== 0
      || Math.abs(saChinook.uv.loX - (367 / 512)) > 0.0001
      || Math.abs(saChinook.uv.loY - (393 / 512)) > 0.0001
      || Math.abs(saChinook.uv.hiX - (487 / 512)) > 0.0001
      || Math.abs(saChinook.uv.hiY - (489 / 512)) > 0.0001
      || !watermarkChina?.found
      || watermarkChina.texture !== "SCShellUserInterface512_001.tga"
      || watermarkChina.width !== 160
      || watermarkChina.height !== 96
      || watermarkChina.status !== 1
      || watermarkChina.rotated !== true) {
    throw new Error(`${context} did not parse expected mapped-image metadata: ${JSON.stringify(assetProbe)}`);
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

function assertStartupAssetsMissing(state, context) {
  const startupAssets = state.startupAssets;
  if (startupAssets?.ok !== false || startupAssets.status !== "missing_runtime_archives") {
    throw new Error(`${context} should report missing runtime archives: ${JSON.stringify(startupAssets)}`);
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
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const moduleUrl = new URL("dist/gameengine-real-big-browser-smoke.js", server.url).href;
  const archiveUrl = new URL(archiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "real BIG browser smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before archive mount: ${JSON.stringify(bootResult)}`);
  }
  assertStartupAssetsMissing(bootResult.state, "cnc-port boot before archive mount");

  const mountResult = await page.evaluate((archiveUrl) => window.CnCPort.rpc("mountArchive", {
    url: archiveUrl,
    name: "INIZH.big",
  }), archiveUrl);
  const assetProbe = mountResult.state?.assetProbe;
  if (!mountResult.ok || !assetProbe?.ok) {
    throw new Error(`cnc-port archive mount failed: ${JSON.stringify(mountResult)}`);
  }
  if (!assetProbe.inizh?.armorIni
      || !assetProbe.inizh?.commandButtonIni
      || !assetProbe.inizh?.commandSetIni
      || !assetProbe.inizh?.crateIni
      || !assetProbe.inizh?.playerTemplateIni
      || !assetProbe.inizh?.multiplayerIni
      || !assetProbe.inizh?.scienceIni
      || !assetProbe.inizh?.specialPowerIni
      || !assetProbe.inizh?.terrainIni
      || !assetProbe.inizh?.roadsIni
      || !assetProbe.inizh?.upgradeIni
      || !assetProbe.inizh?.weaponIni) {
    throw new Error(`cnc-port INIZH probe missed required files: ${JSON.stringify(assetProbe)}`);
  }
  assertGameDataProbe(assetProbe, "cnc-port INIZH probe");
  assertArmorProbe(assetProbe, "cnc-port INIZH probe");
  assertUpgradeProbe(assetProbe, "cnc-port INIZH probe");
  assertCommandButtonProbe(assetProbe, "cnc-port INIZH probe");
  assertCommandSetProbe(assetProbe, "cnc-port INIZH probe");
  assertCrateProbe(assetProbe, "cnc-port INIZH probe");
  assertDrawGroupInfoProbeAbsent(assetProbe, "cnc-port INIZH probe");
  assertMappedImageProbe(assetProbe, "cnc-port INIZH probe");
  assertWaterProbe(assetProbe, "cnc-port INIZH probe");
  assertWeatherProbe(assetProbe, "cnc-port INIZH probe");
  assertVideoProbe(assetProbe, "cnc-port INIZH probe");
  assertMultiplayerProbe(assetProbe, "cnc-port INIZH probe");
  assertTerrainProbe(assetProbe, "cnc-port INIZH probe");
  assertTerrainRoadsProbe(assetProbe, "cnc-port INIZH probe");
  assertStartupAssetsMissing(mountResult.state, "single INIZH mount");

  const result = await page.evaluate(async ({ moduleUrl, archiveUrl }) => {
    const moduleExports = await import(moduleUrl);
    const createModule =
      moduleExports.default ?? moduleExports.createGameEngineRealBigBrowserSmokeModule;
    const distUrl = new URL("../dist/", window.location.href).href;
    const module = await createModule({
      locateFile: (path) => new URL(path, distUrl).href,
    });

    const response = await fetch(archiveUrl);
    if (!response.ok) {
      throw new Error(`archive fetch failed: ${response.status} ${response.statusText}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    module.FS.mkdir("/assets");
    module.FS.writeFile("/assets/INIZH.big", bytes);

    const status = module.ccall(
      "run_real_big_smoke",
      "number",
      ["string"],
      ["/assets/INIZH.big"],
    );

    return {
      ok: status === 0,
      status,
      bytes: bytes.byteLength,
    };
  }, { moduleUrl, archiveUrl });

  if (!result.ok) {
    throw new Error(`browser real BIG smoke failed: ${JSON.stringify(result)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archive: archiveRelativePath,
    bytes: result.bytes,
    cncPortAssetProbe: assetProbe,
    startupAssets: mountResult.state.startupAssets,
    reader: "Win32BIGFileSystem",
    filesystem: "Emscripten MEMFS",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
