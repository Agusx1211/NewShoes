import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { assertBrowserRuntimeFileSystem } from "./browser_runtime_filesystem_assertions.mjs";
import { assertWin32GameEngineProbe } from "./win32_gameengine_assertions.mjs";

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

const optionalBaseRuntimeArchives = [
  {
    sourceName: "INI.big",
    mountName: "ZZBase_INI.big",
    description: "base Generals default/startup INI data",
  },
  {
    sourceName: "English.big",
    mountName: "ZZBase_English.big",
    description: "base Generals English localization data",
  },
];

const baseAudioStartupFiles = [
  "Data\\INI\\AudioSettings.ini",
  "Data\\INI\\Default\\Music.ini",
  "Data\\INI\\Default\\Speech.ini",
  "Data\\INI\\Default\\Voice.ini",
];

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const archiveRoot = resolve(wasmRoot, process.argv[2] ?? defaultArchiveRoot);
const expectedGameTextLanguage = "english";
const expectedGameTextCsfPath = "Data\\english\\Generals.csf";

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function assertGameTextProbe(assetProbe, context) {
  const gameText = assetProbe?.gameText;
  if (!gameText?.attempted
      || !gameText.ok
      || !gameText.generalsCsf
      || gameText.language !== expectedGameTextLanguage
      || gameText.csfPath !== expectedGameTextCsfPath
      || !gameText.selectedCsf
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

function assertDamageFXProbe(assetProbe, context) {
  const damageFX = assetProbe?.damageFX;
  if (!assetProbe?.inizh?.damageFXIni
      || !damageFX?.attempted
      || !damageFX.ok
      || damageFX.source !== "GameEngine/Common/INI.cpp::load + INIDamageFX.cpp + DamageFX.cpp + focused FXList lookup"
      || !damageFX.loadedArchives
      || !damageFX.fileExists
      || !damageFX.nameKeyGeneratorLoaded
      || !damageFX.fxListStoreLoaded
      || !damageFX.damageFXStoreLoaded
      || !damageFX.originalIniLoad
      || damageFX.parsedFields !== 10
      || !damageFX.found?.default
      || !damageFX.found?.tank
      || !damageFX.found?.smallTank
      || !damageFX.found?.structure
      || !damageFX.found?.infantry
      || damageFX.throttle?.defaultExplosion !== 9
      || damageFX.throttle?.tankSmallArms !== 3
      || damageFX.throttle?.smallTankComanche !== 3
      || damageFX.throttle?.structureFlame !== 9
      || damageFX.throttle?.infantrySniper !== 3) {
    throw new Error(`${context} did not parse expected DamageFX.ini definitions: ${JSON.stringify(assetProbe)}`);
  }
}

function assertFXListProbe(assetProbe, context) {
  const fxList = assetProbe?.fxList;
  if (!assetProbe?.inizh?.fxListIni
      || !fxList?.attempted
      || !fxList.ok
      || fxList.source !== "GameEngine/Common/INI.cpp::load + GameClient/FXList.cpp"
      || !fxList.loadedArchives
      || !fxList.fileExists
      || !fxList.nameKeyGeneratorLoaded
      || !fxList.fxListStoreLoaded
      || !fxList.originalIniLoad
      || fxList.bytes <= 100000
      || fxList.parsedFields !== 11
      || fxList.lists !== 428
      || !fxList.samples?.toxinShell?.found
      || fxList.samples.toxinShell.nuggets !== 1
      || !fxList.samples?.carCrusher?.found
      || fxList.samples.carCrusher.nuggets !== 1
      || !fxList.samples?.damageTankStruck?.found
      || fxList.samples.damageTankStruck.nuggets !== 6
      || !fxList.samples?.moabBlast?.found
      || fxList.samples.moabBlast.nuggets !== 10
      || !fxList.samples?.bunkerBuster?.found
      || fxList.samples.bunkerBuster.nuggets !== 8) {
    throw new Error(`${context} did not parse expected FXList.ini metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertObjectCreationListProbe(assetProbe, context) {
  const objectCreationList = assetProbe?.objectCreationList;
  const samples = objectCreationList?.samples;
  if (!assetProbe?.inizh?.objectCreationListIni
      || !objectCreationList?.attempted
      || !objectCreationList.ok
      || objectCreationList.source !== "GameEngine/Common/INI.cpp::load + ObjectCreationList.cpp metadata"
      || !objectCreationList.loadedArchives
      || !objectCreationList.fileExists
      || !objectCreationList.fxListFileExists
      || !objectCreationList.weaponFileExists
      || !objectCreationList.particleFileExists
      || !objectCreationList.nameKeyGeneratorLoaded
      || !objectCreationList.fxListStoreLoaded
      || !objectCreationList.particleSystemManagerLoaded
      || !objectCreationList.weaponStoreLoaded
      || !objectCreationList.objectCreationListStoreLoaded
      || !objectCreationList.fxListOriginalIniLoad
      || !objectCreationList.particleOriginalIniLoad
      || !objectCreationList.weaponOriginalIniLoad
      || !objectCreationList.originalIniLoad
      || objectCreationList.bytes <= 100000
      || objectCreationList.fxListBytes <= 100000
      || objectCreationList.weaponBytes <= 100000
      || objectCreationList.particleBytes <= 100000
      || objectCreationList.parsedFields !== 12
      || objectCreationList.lists !== 281
      || objectCreationList.nuggets !== 704
      || !samples?.fireWallSegment?.found
      || samples.fireWallSegment.nuggets <= 0
      || !samples?.technicalCrush?.found
      || samples.technicalCrush.nuggets <= 0
      || !samples?.daisyCutter?.found
      || samples.daisyCutter.nuggets <= 0
      || !samples?.scudStorm?.found
      || samples.scudStorm.nuggets <= 0
      || !samples?.sneakAttackTunnel?.found
      || samples.sneakAttackTunnel.nuggets <= 0) {
    throw new Error(`${context} did not parse expected ObjectCreationList.ini metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertWeaponProbe(assetProbe, context) {
  const weapon = assetProbe?.weapon;
  const ranger = weapon?.ranger;
  const crusader = weapon?.crusader;
  const tomahawk = weapon?.tomahawk;
  if (!assetProbe?.inizh?.weaponIni
      || !assetProbe.inizh.particleSystemIni
      || !weapon?.attempted
      || !weapon.ok
      || weapon.source !== "GameEngine/Common/INI.cpp::load + INIParticleSys.cpp + INIWeapon.cpp + Weapon.cpp"
      || !weapon.loadedArchives
      || !weapon.fileExists
      || !weapon.particleFileExists
      || !weapon.nameKeyGeneratorLoaded
      || !weapon.fxListStoreLoaded
      || !weapon.particleSystemManagerLoaded
      || !weapon.weaponStoreLoaded
      || !weapon.particleOriginalIniLoad
      || !weapon.originalIniLoad
      || weapon.bytes <= 100000
      || weapon.particleBytes <= 100000
      || weapon.particleTemplates <= 100
      || weapon.parsedFields !== 37
      || !weapon.particleTemplatesFound?.tomahawkExhaust
      || !weapon.particleTemplatesFound?.heroicTomahawkExhaust
      || !ranger?.found
      || Math.abs(ranger.primaryDamage - 5.0) > 0.001
      || Math.abs(ranger.attackRange - 100.0) > 0.001
      || ranger.delayFrames !== 3
      || ranger.clipSize !== 3
      || ranger.clipReloadFrames !== 21
      || ranger.damageType !== 3
      || ranger.deathType !== 0
      || ranger.fireSound !== "RangerWeapon"
      || !crusader?.found
      || Math.abs(crusader.primaryDamage - 60.0) > 0.001
      || Math.abs(crusader.primaryDamageRadius - 5.0) > 0.001
      || Math.abs(crusader.attackRange - 150.0) > 0.001
      || crusader.delayFrames !== 60
      || crusader.clipSize !== 0
      || crusader.damageType !== 2
      || crusader.deathType !== 0
      || crusader.fireSound !== "CrusaderTankWeapon"
      || !tomahawk?.found
      || Math.abs(tomahawk.primaryDamage - 150.0) > 0.001
      || Math.abs(tomahawk.primaryDamageRadius - 10.0) > 0.001
      || Math.abs(tomahawk.secondaryDamage - 50.0) > 0.001
      || Math.abs(tomahawk.secondaryDamageRadius - 25.0) > 0.001
      || Math.abs(tomahawk.attackRange - 350.0) > 0.001
      || Math.abs(tomahawk.minimumAttackRange - 97.5) > 0.001
      || tomahawk.preAttackDelayFrames !== 8
      || tomahawk.delayFrames !== 1
      || tomahawk.clipSize !== 1
      || tomahawk.clipReloadFrames !== 210
      || tomahawk.damageType !== 0
      || tomahawk.deathType !== 4
      || tomahawk.fireSound !== "TomahawkWeapon"
      || !tomahawk.projectileExhaustLoaded
      || !tomahawk.heroicProjectileExhaustLoaded) {
    throw new Error(`${context} did not parse expected Weapon.ini metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertAIDataProbe(assetProbe, context) {
  const aiData = assetProbe?.aiData;
  if (!assetProbe?.inizh?.defaultAIDataIni
      || !assetProbe.inizh.scienceIni
      || !aiData?.attempted
      || !aiData.ok
      || aiData.source !== "GameEngine/Common/INI.cpp::load + INIAiData.cpp + AI.cpp + SidesList.cpp"
      || !aiData.loadedArchives
      || !aiData.defaultFileExists
      || !aiData.scienceFileExists
      || !aiData.scienceStoreLoaded
      || !aiData.aiLoaded
      || !aiData.scienceOriginalIniLoad
      || !aiData.defaultOriginalIniLoad
      || aiData.overrideOriginalIniLoad !== aiData.overrideFileExists
      || aiData.bytes <= 20000
      || aiData.scienceBytes <= 20000
      || aiData.parsedFields !== 50
      || Math.abs(aiData.timing?.structureSeconds - 0.0) > 0.001
      || Math.abs(aiData.timing?.teamSeconds - 10.0) > 0.001
      || aiData.timing?.forceIdleFrames !== 3
      || aiData.timing?.guardChaseUnitFrames !== 300
      || aiData.timing?.guardEnemyScanFrames !== 15
      || aiData.timing?.guardEnemyReturnScanFrames !== 30
      || aiData.resources?.wealthy !== 7000
      || aiData.resources?.poor !== 2000
      || Math.abs(aiData.resources?.teamResourcesToStart - 0.1) > 0.001
      || Math.abs(aiData.rates?.structuresWealthy - 2.0) > 0.001
      || Math.abs(aiData.rates?.teamsWealthy - 2.0) > 0.001
      || Math.abs(aiData.rates?.structuresPoor - 0.6) > 0.001
      || Math.abs(aiData.rates?.teamsPoor - 0.6) > 0.001
      || Math.abs(aiData.guard?.innerAI - 1.1) > 0.001
      || Math.abs(aiData.guard?.outerAI - 1.333) > 0.001
      || Math.abs(aiData.guard?.innerHuman - 1.8) > 0.001
      || Math.abs(aiData.guard?.outerHuman - 2.2) > 0.001
      || Math.abs(aiData.combat?.attackPriorityDistanceModifier - 100.0) > 0.001
      || Math.abs(aiData.combat?.maxRecruitRadius - 500.0) > 0.001
      || Math.abs(aiData.combat?.skirmishBaseDefenseExtraDistance - 150.0) > 0.001
      || Math.abs(aiData.combat?.wallHeight - 43.0) > 0.001
      || aiData.combat?.attackUsesLineOfSight !== true
      || aiData.combat?.attackIgnoreInsignificantBuildings !== true
      || aiData.combat?.enableRepulsors !== true
      || aiData.combat?.aiCrushesInfantry !== true
      || Math.abs(aiData.combat?.supplyCenterSafeRadius - 300.0) > 0.001
      || aiData.combat?.rebuildDelaySeconds !== 30
      || aiData.groupPathing?.minInfantryForGroup !== 3
      || aiData.groupPathing?.minVehiclesForGroup !== 3
      || Math.abs(aiData.groupPathing?.minDistanceForGroup - 100.0) > 0.001
      || Math.abs(aiData.groupPathing?.distanceRequiresGroup - 500.0) > 0.001
      || aiData.counts?.sideInfo !== 12
      || aiData.counts?.buildLists !== 12
      || !aiData.america?.found
      || aiData.america.resourceGatherersEasy !== 2
      || aiData.america.resourceGatherersNormal !== 2
      || aiData.america.resourceGatherersHard !== 2
      || aiData.america.baseDefenseStructure !== "AmericaPatriotBattery"
      || aiData.america.skillSet1Count !== 7
      || aiData.america.skillSet1FirstScience !== "SCIENCE_PaladinTank"
      || !aiData.gla?.found
      || aiData.gla.resourceGatherersEasy !== 5
      || aiData.gla.baseDefenseStructure !== "GLAStingerSite"
      || !aiData.americaBuildList?.found
      || aiData.americaBuildList.structures <= 10
      || aiData.americaBuildList.firstTemplate !== "AmericaCommandCenter"
      || Math.abs(aiData.americaBuildList.firstX - 501.22) > 0.01
      || Math.abs(aiData.americaBuildList.firstY - 546.25) > 0.01
      || Math.abs(aiData.americaBuildList.firstAngle - (-135.0 * Math.PI / 180.0)) > 0.001
      || aiData.americaBuildList.firstAutomaticallyBuild !== true) {
    throw new Error(`${context} did not parse expected AIData.ini metadata: ${JSON.stringify(assetProbe)}`);
  }
}

function assertLocomotorProbe(assetProbe, context) {
  const locomotor = assetProbe?.locomotor;
  if (!assetProbe?.inizh?.locomotorIni
      || !locomotor?.attempted
      || !locomotor.ok
      || locomotor.source !== "GameEngine/Common/INI.cpp::load + GameLogic/Object/Locomotor.cpp"
      || !locomotor.loadedArchives
      || !locomotor.fileExists
      || !locomotor.nameKeyGeneratorLoaded
      || !locomotor.locomotorStoreLoaded
      || !locomotor.originalIniLoad
      || locomotor.bytes <= 100000
      || locomotor.parsedFields !== 48
      || locomotor.templates !== 182
      || !locomotor.basicHuman?.found
      || Math.abs(locomotor.basicHuman.speed - (20.0 / 30.0)) > 0.001
      || Math.abs(locomotor.basicHuman.speedDamaged - (10.0 / 30.0)) > 0.001
      || Math.abs(locomotor.basicHuman.turnRate - (500.0 * Math.PI / 180.0 / 30.0)) > 0.001
      || Math.abs(locomotor.basicHuman.acceleration - (100.0 / 900.0)) > 0.001
      || Math.abs(locomotor.basicHuman.braking - (100.0 / 900.0)) > 0.001
      || locomotor.basicHuman.surfaces !== 17
      || locomotor.basicHuman.appearance !== 0
      || locomotor.basicHuman.zBehavior !== 0
      || locomotor.basicHuman.movePriority !== 2
      || locomotor.basicHuman.stickToGround !== true
      || !locomotor.missileDefender?.found
      || Math.abs(locomotor.missileDefender.speed - (20.0 / 30.0)) > 0.001
      || locomotor.missileDefender.movePriority !== 1
      || !locomotor.humvee?.found
      || Math.abs(locomotor.humvee.speed - (60.0 / 30.0)) > 0.001
      || Math.abs(locomotor.humvee.speedDamaged - (30.0 / 30.0)) > 0.001
      || Math.abs(locomotor.humvee.turnRate - (180.0 * Math.PI / 180.0 / 30.0)) > 0.001
      || Math.abs(locomotor.humvee.acceleration - (1000.0 / 900.0)) > 0.001
      || Math.abs(locomotor.humvee.braking - (1000.0 / 900.0)) > 0.001
      || Math.abs(locomotor.humvee.minTurnSpeed - (20.0 / 30.0)) > 0.001
      || Math.abs(locomotor.humvee.turnPivotOffset - (-0.33)) > 0.001
      || Math.abs(locomotor.humvee.wheelTurnAngle - (22.0 * Math.PI / 180.0)) > 0.001
      || Math.abs(locomotor.humvee.maxWheelExtension - (-1.0)) > 0.001
      || Math.abs(locomotor.humvee.maxWheelCompression - 0.5) > 0.001
      || locomotor.humvee.surfaces !== 1
      || locomotor.humvee.appearance !== 1
      || locomotor.humvee.zBehavior !== 0
      || locomotor.humvee.stickToGround !== false
      || locomotor.humvee.hasSuspension !== true
      || locomotor.humvee.canMoveBackward !== true
      || !locomotor.comanche?.found
      || Math.abs(locomotor.comanche.speed - (120.0 / 30.0)) > 0.001
      || Math.abs(locomotor.comanche.speedDamaged - (120.0 / 30.0)) > 0.001
      || Math.abs(locomotor.comanche.turnRate - (180.0 * Math.PI / 180.0 / 30.0)) > 0.001
      || Math.abs(locomotor.comanche.acceleration - (60.0 / 900.0)) > 0.001
      || Math.abs(locomotor.comanche.lift - (120.0 / 900.0)) > 0.001
      || Math.abs(locomotor.comanche.liftDamaged - (80.0 / 900.0)) > 0.001
      || Math.abs(locomotor.comanche.braking - (240.0 / 900.0)) > 0.001
      || Math.abs(locomotor.comanche.preferredHeight - 100.0) > 0.001
      || locomotor.comanche.surfaces !== 8
      || locomotor.comanche.appearance !== 3
      || locomotor.comanche.zBehavior !== 2
      || locomotor.comanche.airborneTargetingHeight !== 30
      || locomotor.comanche.allowAirborneMotiveForce !== true
      || locomotor.comanche.apply2DFrictionWhenAirborne !== true
      || locomotor.comanche.locomotorWorksWhenDead !== true) {
    throw new Error(`${context} did not parse expected Locomotor.ini metadata: ${JSON.stringify(assetProbe)}`);
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

function assertControlBarSchemeProbe(assetProbe, context) {
  const scheme = assetProbe?.controlBarScheme;
  const defaultScheme = scheme?.default;
  const america = scheme?.america;
  const gla = scheme?.gla;
  const china = scheme?.china;
  if (!assetProbe?.inizh?.controlBarSchemeIni
      || !assetProbe.inizh.defaultControlBarSchemeIni
      || !scheme?.attempted
      || !scheme.ok
      || scheme.source !== "GameEngine/Common/INI.cpp::load + INIControlBarScheme.cpp + ControlBarScheme.cpp + Image.cpp"
      || !scheme.loadedArchives
      || !scheme.fileExists
      || !scheme.defaultFileExists
      || !scheme.nameKeyGeneratorLoaded
      || !scheme.mappedImagesLoaded
      || !scheme.controlBarLoaded
      || !scheme.originalDefaultIniLoad
      || !scheme.originalIniLoad
      || scheme.bytes <= 10000
      || scheme.defaultBytes <= 1000
      || scheme.parsedFields !== 34
      || scheme.mappedImages !== 1186
      || !defaultScheme?.found
      || defaultScheme.queueImage !== ""
      || defaultScheme.rightHUDImage !== ""
      || defaultScheme.baseImage !== "InGameUIAmericaBase"
      || defaultScheme.baseLayer !== 4
      || defaultScheme.baseWidth !== 800
      || defaultScheme.baseHeight !== 191
      || !america?.found
      || america.side !== "America"
      || america.queueImage !== ""
      || america.rightHUDImage !== ""
      || america.commandMarkerImage !== "SAEmptyFrame"
      || america.powerPurchaseImage !== "GeneralsPowerWindow_American"
      || america.baseImage !== "InGameUIAmericaBase"
      || america.screenX !== 800
      || america.screenY !== 600
      || america.baseLayer !== 4
      || america.baseX !== 0
      || america.baseY !== 408
      || america.baseWidth !== 800
      || america.baseHeight !== 191
      || !gla?.found
      || gla.side !== "GLA"
      || gla.rightHUDImage !== ""
      || gla.commandMarkerImage !== "SUEmptyFrame"
      || gla.powerPurchaseImage !== "GeneralsPowerWindow_GLA"
      || gla.baseImage !== "InGameUIGLABase"
      || !china?.found
      || china.side !== "China"
      || china.rightHUDImage !== ""
      || china.commandMarkerImage !== "SNEmptyFrame"
      || china.powerPurchaseImage !== "GeneralsPowerMenu_China"
      || china.genArrowImage !== ""
      || china.baseImage !== "InGameUIChinaBase") {
    throw new Error(`${context} did not parse expected ControlBarScheme.ini metadata: ${JSON.stringify(assetProbe)}`);
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

function assertPlayerTemplateProbe(assetProbe, context) {
  const playerTemplate = assetProbe?.playerTemplate;
  const found = playerTemplate?.found;
  const america = playerTemplate?.america;
  const observer = playerTemplate?.observer;
  const airForce = playerTemplate?.airForce;
  const boss = playerTemplate?.boss;
  if (!assetProbe?.inizh?.playerTemplateIni
      || !playerTemplate?.attempted
      || !playerTemplate.ok
      || playerTemplate.source !== "GameEngine/Common/INI.cpp::load + PlayerTemplate.cpp + Science.cpp"
      || !playerTemplate.loadedArchives
      || !playerTemplate.fileExists
      || !playerTemplate.scienceFileExists
      || !playerTemplate.gameTextLoaded
      || !playerTemplate.nameKeyGeneratorLoaded
      || !playerTemplate.scienceOriginalIniLoad
      || !playerTemplate.originalIniLoad
      || playerTemplate.bytes <= 10000
      || playerTemplate.scienceBytes <= 20000
      || playerTemplate.parsedFields !== 50
      || playerTemplate.templates !== 15
      || playerTemplate.sides !== 15
      || !found?.america
      || !found.china
      || !found.gla
      || !found.observer
      || !found.airForce
      || !found.boss
      || !america?.displayNameLoaded
      || america.side !== "America"
      || america.baseSide !== "USA"
      || america.playable !== true
      || america.oldFaction !== true
      || america.startMoney !== 0
      || america.intrinsicScienceCount !== 1
      || america.intrinsicScienceValid !== true
      || america.startingBuilding !== "AmericaCommandCenter"
      || america.startingUnit0 !== "AmericaVehicleDozer"
      || america.shortcutCommandSet !== "SpecialPowerShortcutUSA"
      || america.shortcutWinName !== "GenPowersShortcutBarUS.wnd"
      || america.shortcutButtonCount !== 10
      || america.loadScreen !== "SAFactionLogoPage_US"
      || america.scoreScreen !== "America_ScoreScreen"
      || america.loadMusic !== "Load_USA"
      || america.scoreMusic !== "Score_USA"
      || america.beacon !== "MultiplayerBeacon"
      || observer?.observer !== true
      || observer.playable !== false
      || observer.side !== "Observer"
      || observer.loadScreen !== "Mp_Load"
      || observer.beacon !== "MultiplayerBeacon"
      || airForce?.side !== "AmericaAirForceGeneral"
      || airForce.baseSide !== "USA"
      || airForce.playable !== true
      || airForce.oldFaction !== false
      || airForce.startingBuilding !== "AirF_AmericaCommandCenter"
      || airForce.startingUnit0 !== "AirF_AmericaVehicleDozer"
      || airForce.shortcutCommandSet !== "AirF_SpecialPowerShortcutUSA"
      || airForce.shortcutButtonCount !== 11
      || boss?.side !== "Boss"
      || boss.baseSide !== "China"
      || boss.playable !== true
      || boss.oldFaction !== false
      || boss.intrinsicScienceCount !== 3
      || boss.intrinsicSciencesValid !== true
      || boss.startingBuilding !== "Boss_CommandCenter"
      || boss.startingUnit0 !== "Boss_VehicleDozer"
      || boss.shortcutCommandSet !== "SpecialPowerShortcutBoss"
      || boss.shortcutWinName !== "GenPowersShortcutBarChina.wnd"
      || boss.shortcutButtonCount !== 9) {
    throw new Error(`${context} did not parse expected PlayerTemplate.ini metadata: ${JSON.stringify(assetProbe)}`);
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

function assertChallengeModeProbe(assetProbe, context) {
  const challengeMode = assetProbe?.challengeMode;
  const airForce = challengeMode?.airForce;
  const toxin = challengeMode?.toxin;
  const disabledSlot = challengeMode?.disabledSlot;
  if (!assetProbe?.inizh?.challengeModeIni
      || !challengeMode?.attempted
      || !challengeMode.ok
      || challengeMode.source !== "GameEngine/Common/INI.cpp::load + GameClient/GUI/ChallengeGenerals.cpp + mapped images"
      || !challengeMode.loadedArchives
      || !challengeMode.fileExists
      || !challengeMode.nameKeyGeneratorLoaded
      || !challengeMode.mappedImagesLoaded
      || !challengeMode.challengeGeneralsLoaded
      || !challengeMode.originalIniLoad
      || challengeMode.bytes <= 10000
      || challengeMode.parsedFields !== 28
      || challengeMode.mappedImages !== 1186
      || challengeMode.personas !== 12
      || challengeMode.enabledPersonas !== 9
      || challengeMode.playerTemplates !== 10
      || !airForce?.found
      || airForce.startsEnabled !== true
      || airForce.playerTemplate !== "FactionAmericaAirForceGeneral"
      || airForce.bioName !== "GUI:BioNameEntry_Pos0"
      || airForce.campaign !== "CHALLENGE_0"
      || airForce.portraitLeft !== "PortraitAirGenLeft"
      || airForce.portraitRight !== "PortraitAirGenRight"
      || airForce.selectionSound !== "Taunts_Grainger009"
      || airForce.previewSound !== "Taunts_GCAnnouncer07"
      || airForce.nameSound !== "Taunts_GCAnnouncer14"
      || airForce.smallPortrait !== true
      || airForce.largePortrait !== true
      || airForce.defeatedImage !== true
      || airForce.victoriousImage !== true
      || !toxin?.found
      || toxin.startsEnabled !== true
      || toxin.playerTemplate !== "FactionGLAToxinGeneral"
      || toxin.campaign !== "CHALLENGE_1"
      || toxin.selectionSound !== "Taunts_Toxin015"
      || !disabledSlot?.found
      || disabledSlot.startsDisabled !== true
      || disabledSlot.campaign !== "unimplemented"
      || disabledSlot.selectionSound !== "none"
      || disabledSlot.smallPortrait !== true) {
    throw new Error(`${context} did not parse expected ChallengeMode.ini personas: ${JSON.stringify(assetProbe)}`);
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
        || !startupAssets.required?.damageFX
        || !startupAssets.required?.fxList
        || !startupAssets.required?.science
        || !startupAssets.required?.weapon
        || !startupAssets.required?.particleSystem
        || !startupAssets.required?.aiData
        || !startupAssets.required?.locomotor
        || !startupAssets.required?.upgrade
        || !startupAssets.required?.commandButton
        || !startupAssets.required?.commandSet
        || !startupAssets.required?.controlBarScheme
        || !startupAssets.required?.crate
        || !startupAssets.required?.specialPower
        || !startupAssets.required?.playerTemplate
        || !startupAssets.required?.multiplayer
        || !startupAssets.required?.terrain
        || !startupAssets.required?.terrainRoads
        || !startupAssets.required?.gameData
        || !startupAssets.required?.gameLOD
        || !startupAssets.required?.water
        || !startupAssets.required?.weather
        || !startupAssets.required?.video
        || !startupAssets.required?.gameText
        || !startupAssets.required?.mapCache)) {
    throw new Error(`${context} startup asset requirements incomplete: ${JSON.stringify(startupAssets)}`);
  }
}

function assertStartupSingletons(state, context, expectedReady) {
  const probe = state.startupSingletons;
  const commonReady = probe
    && probe.attempted === true
    && probe.runtimeArchiveRegistered === true
    && probe.runtimeGlobalsInstalled === true
    && probe.heapAllocated === true
    && probe.globalDataOwned === true
    && probe.subsystemListOwned === true
    && probe.gameLOD?.owned === true
    && probe.mapCache?.owned === true
    && probe.mapCache?.loaded === false
    && probe.mapCache?.updateCacheRuntimeReady === false;
  if (!commonReady) {
    throw new Error(`${context} startup singleton ownership mismatch: ${JSON.stringify(probe)}`);
  }

  if (expectedReady
      && (probe.ok !== true
        || probe.status !== "ready"
        || probe.nextRequired !== "createAudioManager"
        || probe.subsystemInitShutdownOk !== true
        || probe.subsystemShutdownDeferred !== true
        || probe.subsystemInitCount !== 1
        || probe.subsystemShutdownCount !== 0
        || probe.gameLOD?.filesReady !== true
        || probe.gameLOD?.initialized !== true
        || probe.mapCache?.loaded !== false
        || probe.mapCache?.updateCacheRuntimeReady !== false
        || probe.gameLOD?.textureReduction < 0
        || probe.gameLOD?.memoryPassed !== true)) {
    throw new Error(`${context} startup singleton readiness mismatch: ${JSON.stringify(probe)}`);
  }

  if (!expectedReady
      && (probe.ok !== false
        || probe.status !== "missing_game_lod_files"
        || probe.nextRequired !== "GameLODStartupFiles"
        || probe.subsystemInitShutdownOk !== false
        || probe.subsystemShutdownDeferred !== false
        || probe.subsystemInitCount !== 0
        || probe.subsystemShutdownCount !== 0
        || probe.gameLOD?.filesReady !== false
        || probe.gameLOD?.initialized !== false)) {
    throw new Error(`${context} startup singleton ownership mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertAudioRuntimeAssets(state, context) {
  const audioAssets = state.audioRuntimeAssets;
  if (!audioAssets
      || audioAssets.source !== "runtime BIG archive manifest"
      || audioAssets.ready !== true
      || audioAssets.browserAudioDevice !== false
      || audioAssets.webAudioRuntime !== false
      || audioAssets.nextRequired !== "browserAudioDevice") {
    throw new Error(`${context} audio runtime asset state mismatch: ${JSON.stringify(audioAssets)}`);
  }

  for (const key of [
    "audioZH",
    "audioEnglishZH",
    "speechZH",
    "speechEnglishZH",
    "musicZH",
    "music",
  ]) {
    if (audioAssets.required?.[key] !== true) {
      throw new Error(`${context} audio runtime archive ${key} missing: ${JSON.stringify(audioAssets)}`);
    }
  }
}

function assertMssStartupProbe(probe, context) {
  if (!probe
      || probe.ok !== true
      || probe.source !== "Mss.H browser startup handle contract probe"
      || probe.runtimeReady !== false
      || probe.startupBoundaryReady !== true
      || probe.playbackReady !== false
      || probe.nextRequired !== "webAudioPlaybackBackend"
      || probe.calls?.AIL_set_redist_directory !== true
      || probe.calls?.AIL_startup !== true
      || probe.calls?.AIL_quick_startup !== true
      || probe.calls?.AIL_quick_handles !== true
      || probe.calls?.AIL_enumerate_3D_providers !== 2
      || probe.calls?.AIL_open_3D_provider !== true
      || probe.calls?.AIL_open_3D_listener !== true
      || probe.calls?.AIL_allocate_sample_handle !== true
      || probe.calls?.AIL_allocate_3D_sample_handle !== true
      || probe.calls?.AIL_set_file_callbacks !== true
      || probe.calls?.AIL_enumerate_filters !== 2
      || probe.calls?.AIL_shutdown !== true
      || probe.quickStartup?.result !== 1
      || probe.quickStartup?.useDigital !== 1
      || probe.quickStartup?.outputRate !== 44100
      || probe.quickStartup?.outputBits !== 16
      || probe.quickStartup?.outputChannels !== 2
      || probe.digitalHandle?.nonNull !== true
      || probe.digitalHandle?.emulatedDirectSound !== true
      || probe.provider?.preferredName !== "Miles Fast 2D Positional Audio"
      || probe.provider?.openResult !== 0
      || probe.filter?.count !== 2
      || probe.filter?.monoDelayName !== "Mono Delay Filter"
      || probe.filter?.monoDelayHandle !== 0x6001
      || !Number.isFinite(probe.handles?.listener)
      || !Number.isFinite(probe.handles?.sample2D)
      || !Number.isFinite(probe.handles?.sample3D)
      || probe.shutdown?.called !== true
      || probe.shutdown?.quickStartupActive !== false) {
    throw new Error(`${context} MSS startup probe mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertMssSampleLifecycleProbe(probe, context) {
  if (!probe
      || probe.ok !== true
      || probe.source !== "Mss.H browser 2D sample lifecycle contract probe"
      || probe.runtimeReady !== false
      || probe.sampleLifecycleReady !== true
      || probe.playbackReady !== false
      || probe.nextRequired !== "webAudioPlaybackBackend"
      || probe.quickStartup?.result !== 1
      || probe.quickStartup?.digitalHandle !== true
      || probe.calls?.AIL_allocate_sample_handle !== true
      || probe.calls?.AIL_init_sample !== true
      || probe.calls?.AIL_set_sample_user_data !== true
      || probe.calls?.AIL_sample_user_data !== 77
      || probe.calls?.AIL_set_sample_file !== true
      || probe.calls?.AIL_register_EOS_callback !== true
      || probe.calls?.AIL_set_sample_volume !== 96
      || probe.calls?.AIL_set_sample_pan !== 32
      || Math.abs((probe.calls?.AIL_set_sample_volume_pan?.volume ?? 0) - 0.625) > 0.001
      || Math.abs((probe.calls?.AIL_set_sample_volume_pan?.pan ?? 0) - 0.25) > 0.001
      || probe.calls?.AIL_set_sample_playback_rate !== 22050
      || probe.calls?.AIL_set_sample_loop_count !== 3
      || probe.calls?.AIL_set_sample_ms_position !== 125
      || probe.calls?.AIL_start_sample !== 2
      || probe.calls?.AIL_stop_sample !== 4
      || probe.calls?.AIL_resume_sample !== 2
      || probe.calls?.AIL_end_sample !== 1
      || probe.calls?.AIL_release_sample_handle !== true
      || probe.callback?.count !== 1
      || !Number.isFinite(probe.callback?.lastHandle)
      || !Number.isFinite(probe.handle?.sample2D)
      || probe.handle?.validBeforeRelease !== true
      || probe.handle?.released !== true
      || probe.handle?.statusAfterRelease !== 1
      || probe.handle?.userDataAfterRelease !== 0) {
    throw new Error(`${context} MSS sample lifecycle probe mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertMssStreamLifecycleProbe(probe, context) {
  if (!probe
      || probe.ok !== true
      || probe.source !== "Mss.H browser stream lifecycle contract probe"
      || probe.runtimeReady !== false
      || probe.streamLifecycleReady !== true
      || probe.playbackReady !== false
      || probe.nextRequired !== "webAudioPlaybackBackend"
      || probe.quickStartup?.result !== 1
      || probe.quickStartup?.digitalHandle !== true
      || probe.calls?.AIL_open_stream !== true
      || probe.calls?.AIL_open_stream_by_sample !== true
      || probe.calls?.AIL_register_stream_callback !== true
      || probe.calls?.AIL_set_stream_volume !== 88
      || probe.calls?.AIL_set_stream_pan !== 48
      || Math.abs((probe.calls?.AIL_set_stream_volume_pan?.volume ?? 0) - 0.75) > 0.001
      || Math.abs((probe.calls?.AIL_set_stream_volume_pan?.pan ?? 0) - 0.375) > 0.001
      || probe.calls?.AIL_set_stream_playback_rate !== 32000
      || probe.calls?.AIL_set_stream_loop_block?.start !== 5
      || probe.calls?.AIL_set_stream_loop_block?.end !== 125
      || probe.calls?.AIL_set_stream_loop_count !== 2
      || probe.calls?.AIL_set_stream_ms_position !== 250
      || probe.calls?.AIL_start_stream !== 2
      || probe.calls?.AIL_pause_stream_stop !== 4
      || probe.calls?.AIL_pause_stream_resume !== 2
      || probe.calls?.AIL_close_stream !== true
      || probe.callback?.count !== 0
      || probe.callback?.lastHandle !== 0
      || !Number.isFinite(probe.handle?.stream)
      || !Number.isFinite(probe.handle?.bySampleStream)
      || probe.handle?.validBeforeClose !== true
      || probe.handle?.closed !== true
      || probe.handle?.bySampleClosed !== true
      || probe.handle?.statusAfterClose !== 1
      || probe.handle?.panAfterClose !== 0) {
    throw new Error(`${context} MSS stream lifecycle probe mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertMss3DSampleLifecycleProbe(probe, context) {
  if (!probe
      || probe.ok !== true
      || probe.source !== "Mss.H browser 3D sample lifecycle contract probe"
      || probe.runtimeReady !== false
      || probe.sample3DLifecycleReady !== true
      || probe.playbackReady !== false
      || probe.nextRequired !== "webAudioPlaybackBackend"
      || probe.provider?.enumerated !== true
      || probe.provider?.id !== 1
      || probe.provider?.opened !== true
      || probe.provider?.speakerType !== 4
      || probe.provider?.closed !== true
      || !Number.isFinite(probe.listener?.handle)
      || probe.listener?.opened !== true
      || probe.listener?.position?.x !== 10
      || probe.listener?.position?.y !== 20
      || probe.listener?.position?.z !== 30
      || probe.listener?.orientation?.frontY !== 1
      || probe.listener?.orientation?.upZ !== -1
      || probe.listener?.closed !== true
      || probe.calls?.AIL_allocate_3D_sample_handle !== true
      || probe.calls?.AIL_set_3D_user_data !== 7
      || probe.calls?.AIL_set_3D_object_user_data !== 99
      || probe.calls?.AIL_set_3D_sample_file !== 1
      || probe.calls?.AIL_register_3D_EOS_callback !== true
      || Math.abs((probe.calls?.AIL_set_3D_sample_distances?.min ?? 0) - 12) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_sample_distances?.max ?? 0) - 345) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_position?.x ?? 0) - 100) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_position?.y ?? 0) - 200) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_position?.z ?? 0) - 300) > 0.001
      || probe.calls?.AIL_set_3D_sample_volume !== 66
      || probe.calls?.AIL_set_3D_sample_loop_count !== 3
      || probe.calls?.AIL_set_3D_sample_offset !== 17
      || probe.calls?.AIL_set_3D_sample_playback_rate !== 22050
      || Math.abs((probe.calls?.AIL_set_3D_sample_occlusion ?? 0) - 0.25) > 0.001
      || Math.abs((probe.calls?.AIL_set_3D_sample_effects_level ?? 0) - 0.5) > 0.001
      || probe.calls?.AIL_start_3D_sample !== 2
      || probe.calls?.AIL_stop_3D_sample !== 4
      || probe.calls?.AIL_resume_3D_sample !== 2
      || probe.calls?.AIL_end_3D_sample !== 1
      || probe.calls?.AIL_release_3D_sample_handle !== true
      || probe.callback?.count !== 1
      || probe.callback?.lastHandle !== probe.handle?.sample
      || !Number.isFinite(probe.handle?.sample)
      || probe.handle?.validBeforeRelease !== true
      || probe.handle?.released !== true
      || probe.handle?.statusAfterRelease !== 1) {
    throw new Error(`${context} MSS 3D sample lifecycle probe mismatch: ${JSON.stringify(probe)}`);
  }
}

function assertBrowserAudioRuntime(runtime, context, expected = {}) {
  if (!runtime
      || runtime.source !== "browser Web Audio runtime user-gesture proof"
      || runtime.available !== true
      || runtime.resumeSupported !== true
      || runtime.userGestureResumeHooked !== true
      || runtime.runtimePlayback !== false
      || runtime.engineDriven !== false
      || runtime.nextRequired !== "engineDrivenBrowserAudioDevice") {
    throw new Error(`${context} browser audio runtime state mismatch: ${JSON.stringify(runtime)}`);
  }

  if (Object.prototype.hasOwnProperty.call(expected, "created") && runtime.created !== expected.created) {
    throw new Error(`${context} browser audio runtime created mismatch: ${JSON.stringify(runtime)}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "resumeAttempts") && runtime.resumeAttempts !== expected.resumeAttempts) {
    throw new Error(`${context} browser audio runtime resume attempts mismatch: ${JSON.stringify(runtime)}`);
  }
  if (expected.afterGesture) {
    if (runtime.created !== true
        || runtime.resumeAttempts < 1
        || runtime.resumeSuccesses < 1
        || runtime.lastResumeTrigger !== "canvas.pointerdown"
        || runtime.contextState !== "running"
        || runtime.lastResumeError !== null) {
      throw new Error(`${context} browser audio gesture resume mismatch: ${JSON.stringify(runtime)}`);
    }
  }
}

function assertNumberClose(actual, expected, context, epsilon = 0.000001) {
  if (typeof actual !== "number" || Math.abs(actual - expected) > epsilon) {
    throw new Error(`${context} expected ${expected} but got ${actual}`);
  }
}

function assertBrowserAudioMixerRuntime(mixer, context, expected = {}) {
  if (!mixer
      || mixer.source !== "browser Web Audio runtime mixer GainNode proof"
      || mixer.available !== true
      || mixer.runtimePlayback !== false
      || mixer.engineDriven !== false
      || mixer.nextRequired !== "engineOptionsAudioVolumeBinding"
      || !Array.isArray(mixer.sourceFrontiers)
      || !mixer.sourceFrontiers.includes("verify:audio-options-volume-frontier")
      || !mixer.sourceFrontiers.includes("verify:miles-audio-volume-frontier")) {
    throw new Error(`${context} browser audio mixer runtime state mismatch: ${JSON.stringify(mixer)}`);
  }

  if (Object.prototype.hasOwnProperty.call(expected, "created") && mixer.created !== expected.created) {
    throw new Error(`${context} browser audio mixer created mismatch: ${JSON.stringify(mixer)}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "updates") && mixer.updates !== expected.updates) {
    throw new Error(`${context} browser audio mixer updates mismatch: ${JSON.stringify(mixer)}`);
  }
  if (expected.afterVolumeUpdate) {
    if (mixer.created !== true
        || mixer.contextCreated !== true
        || mixer.contextState !== "running"
        || mixer.updates < 1
        || mixer.lastError !== null
        || mixer.lastUpdate?.source !== "AudioManager::setVolume script/system volume split") {
      throw new Error(`${context} browser audio mixer update mismatch: ${JSON.stringify(mixer)}`);
    }
    for (const [bus, gain] of Object.entries(expected.busGains ?? {})) {
      assertNumberClose(mixer.busGains?.[bus], gain, `${context} ${bus} busGain`);
      assertNumberClose(mixer.buses?.[bus]?.gain, gain, `${context} ${bus} GainNode.gain`);
      if (mixer.buses?.[bus]?.connected !== true || mixer.buses?.[bus]?.node !== "GainNode") {
        throw new Error(`${context} ${bus} GainNode metadata mismatch: ${JSON.stringify(mixer.buses?.[bus])}`);
      }
    }
  }
}

function assertBrowserAudioLiveEventRuntime(live, context, expected = {}) {
  if (!live
      || live.source !== "browser requested audio live AudioBufferSourceNode lifecycle proof"
      || live.engineDriven !== false
      || live.nextRequired !== "engineAudioEventScheduling"
      || !Array.isArray(live.sourceFrontiers)
      || !live.sourceFrontiers.includes("verify:audio-event-request-frontier")
      || !live.sourceFrontiers.includes("verify:audio-sample-start-frontier")
      || !live.sourceFrontiers.includes("verify:audio-completion-frontier")) {
    throw new Error(`${context} browser audio live event runtime state mismatch: ${JSON.stringify(live)}`);
  }

  if (Object.prototype.hasOwnProperty.call(expected, "ready") && live.ready !== expected.ready) {
    throw new Error(`${context} browser audio live event ready mismatch: ${JSON.stringify(live)}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "cacheEntries") && live.cacheEntries !== expected.cacheEntries) {
    throw new Error(`${context} browser audio live event cache mismatch: ${JSON.stringify(live)}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "completed") && live.completed !== expected.completed) {
    throw new Error(`${context} browser audio live event completion count mismatch: ${JSON.stringify(live)}`);
  }
  if (expected.afterPlayback) {
    const event = live.lastEvent;
    if (live.ready !== true
        || live.runtimePlayback !== true
        || live.started < 1
        || live.completed < 1
        || live.released < 1
        || live.lastError !== null
        || event?.cacheKey !== expected.cacheKey
        || event?.eventName !== expected.eventName
        || event?.request?.type !== "AR_Play"
        || event?.start?.playingType !== expected.playingType
        || event?.start?.webAudioNode !== "AudioBufferSourceNode"
        || event?.start?.bus !== expected.bus
        || event?.callback?.observed !== true
        || event?.callback?.completionCall !== "notifyOfAudioCompletion"
        || event?.completion?.statusAfterCallback !== "PS_Stopped"
        || event?.completion?.releasePath !== expected.releasePath
        || event?.completion?.releaseAudioEventRTS !== true) {
      throw new Error(`${context} browser audio live event playback mismatch: ${JSON.stringify(live)}`);
    }
    const phases = (live.eventLog ?? []).slice(-5).map((entry) => entry.phase);
    if (phases.join("|") !== "request|start|ended|completion|release") {
      throw new Error(`${context} browser audio live event log phases mismatch: ${JSON.stringify(live.eventLog)}`);
    }
  }
}

function assertBrowserAudioRequestPathRuntime(requestPath, context, expected = {}) {
  if (!requestPath
      || requestPath.source !== "browser source-shaped audio request queue live playback proof"
      || requestPath.engineDriven !== false
      || requestPath.sourcePathDriven !== true
      || requestPath.nextRequired !== "realMilesAudioManagerWebAudioBackend"
      || !Array.isArray(requestPath.sourceFrontiers)
      || !requestPath.sourceFrontiers.includes("verify:audio-event-request-frontier")
      || !requestPath.sourceFrontiers.includes("verify:audio-request-update-frontier")
      || !requestPath.sourceFrontiers.includes("verify:audio-sample-start-frontier")
      || !requestPath.sourceFrontiers.includes("verify:audio-playing-event-state-frontier")
      || !requestPath.sourceFrontiers.includes("verify:audio-completion-frontier")
      || !requestPath.sourceFrontiers.includes("verify:audio-browser-bridge-contract-frontier")) {
    throw new Error(`${context} browser audio request path runtime state mismatch: ${JSON.stringify(requestPath)}`);
  }

  if (Object.prototype.hasOwnProperty.call(expected, "ready") && requestPath.ready !== expected.ready) {
    throw new Error(`${context} browser audio request path ready mismatch: ${JSON.stringify(requestPath)}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "cacheEntries")
      && requestPath.cacheEntries !== expected.cacheEntries) {
    throw new Error(`${context} browser audio request path cache mismatch: ${JSON.stringify(requestPath)}`);
  }
  if (Object.prototype.hasOwnProperty.call(expected, "completed")
      && requestPath.completed !== expected.completed) {
    throw new Error(`${context} browser audio request path completion count mismatch: ${JSON.stringify(requestPath)}`);
  }
  for (const counter of ["enqueued", "drained", "dispatched", "started", "released"]) {
    if (Object.prototype.hasOwnProperty.call(expected, counter) && requestPath[counter] !== expected[counter]) {
      throw new Error(`${context} browser audio request path ${counter} count mismatch: ${JSON.stringify(requestPath)}`);
    }
  }
  if (expected.coveredPlayingTypes) {
    assertArrayPrefix(
      requestPath.coveredPlayingTypes,
      expected.coveredPlayingTypes,
      `${context} browser audio request path playing-type coverage`,
    );
  }
  if (expected.coveredDeviceStarts) {
    assertArrayPrefix(
      requestPath.coveredDeviceStarts,
      expected.coveredDeviceStarts,
      `${context} browser audio request path device-start coverage`,
    );
  }
  if (expected.coveredAudioTypes) {
    assertArrayPrefix(
      requestPath.coveredAudioTypes,
      expected.coveredAudioTypes,
      `${context} browser audio request path audio-type coverage`,
    );
  }
  if (expected.coveredBuses) {
    assertArrayPrefix(
      requestPath.coveredBuses,
      expected.coveredBuses,
      `${context} browser audio request path bus coverage`,
    );
  }
  if (expected.afterPlayback) {
    const event = requestPath.lastEvent;
    if (requestPath.ready !== true
        || requestPath.runtimePlayback !== true
        || requestPath.enqueued < 1
        || requestPath.drained < 1
        || requestPath.dispatched < 1
        || requestPath.started < 1
        || requestPath.completed < 1
        || requestPath.released < 1
        || requestPath.lastError !== null
        || event?.cacheKey !== expected.cacheKey
        || event?.eventName !== expected.eventName
        || event?.common?.function !== "AudioManager::addAudioEvent"
        || event?.common?.handleAllocator !== "allocateNewHandle"
        || event?.common?.filenameStep !== "AudioEventRTS::generateFilename"
        || event?.common?.playInfoStep !== "AudioEventRTS::generatePlayInfo"
        || event?.common?.audioType !== expected.audioType
        || event?.request?.manager !== expected.requestManager
        || event?.request?.queueFunction !== expected.queueFunction
        || event?.request?.request !== "AR_Play"
        || event?.request?.usePendingEvent !== true
        || event?.drain?.requestList !== "MilesAudioManager::processRequestList"
        || event?.drain?.dispatch !== "MilesAudioManager::processRequest"
        || event?.drain?.playRoute !== "AR_Play -> playAudioEvent(req->m_pendingEvent)"
        || event?.playback?.deviceStart !== expected.deviceStart
        || event?.playback?.playingType !== expected.playingType
        || event?.playback?.bus !== expected.bus
        || event?.playback?.webAudioNode !== "AudioBufferSourceNode"
        || event?.callback?.observed !== true
        || event?.callback?.completionCall !== "notifyOfAudioCompletion"
        || event?.completion?.statusAfterCallback !== "PS_Stopped"
        || event?.completion?.releasePath !== expected.releasePath
        || event?.completion?.releaseAudioEventRTS !== true) {
      throw new Error(`${context} browser audio request path playback mismatch: ${JSON.stringify(requestPath)}`);
    }
    const phases = (requestPath.eventLog ?? []).slice(-11).map((entry) => entry.phase);
    const expectedPhases = [
      "addAudioEvent",
      "generate",
      "route",
      "queue",
      "drain",
      "dispatch",
      "playAudioEvent",
      "start",
      "ended",
      "completion",
      "release",
    ];
    if (phases.join("|") !== expectedPhases.join("|")) {
      throw new Error(`${context} browser audio request path log phases mismatch: ${JSON.stringify(requestPath.eventLog)}`);
    }
  }
}

function assertSectionSummary(section, expected, context, name) {
  const summary = section?.summary;
  for (const [key, value] of Object.entries(expected)) {
    if (summary?.[key] !== value) {
      throw new Error(`${context} audio payload ${name}.${key} mismatch: ${JSON.stringify(section)}`);
    }
  }
}

function assertArchiveReferenceCounts(section, expected, context, name) {
  const archives = section?.summary?.archives ?? {};
  for (const [archive, count] of Object.entries(expected)) {
    if (archives[archive] !== count) {
      throw new Error(`${context} audio payload ${name} archive ${archive} mismatch: ${JSON.stringify(section)}`);
    }
  }
}

function assertAudioPayloadFormats(payloads, context) {
  const formats = payloads.payloadFormats;
  if (!formats
      || formats.source !== "mounted BIG Data\\Audio entry headers"
      || formats.entryCount !== 3530
      || formats.webAudioContainerCandidates !== 3530
      || formats.webAudioDecodeCandidates !== 958
      || formats.requiresTranscode !== 2572
      || formats.unsupported !== 0
      || formats.webAudioDecodeCandidateReady !== false
      || formats.runtimeDecoded !== false
      || formats.nextRequired !== "requestedPayloadDecodeCache"
      || formats.extensions?.wav !== 3523
      || formats.extensions?.mp3 !== 7
      || formats.magic?.["riff-wave"] !== 3523
      || formats.magic?.["mp3-id3"] !== 7
      || formats.wavCodec?.["1"] !== 951
      || formats.wavCodec?.["17"] !== 2572
      || formats.wavFmt?.["1ch_44100Hz_4bit"] !== 2521
      || formats.wavFmt?.["1ch_22050Hz_16bit"] !== 904) {
    throw new Error(`${context} audio payload format inventory mismatch: ${JSON.stringify(formats)}`);
  }

  const expectedArchives = {
    "AudioEnglishZH.big": { entries: 794, wav: 794, riffWave: 794, decode: 762, transcode: 32 },
    "AudioZH.big": { entries: 287, wav: 287, riffWave: 287, decode: 138, transcode: 149 },
    "MusicZH.big": { entries: 7, mp3: 7, mp3Id3: 7, decode: 7, transcode: 0 },
    "SpeechEnglishZH.big": { entries: 2430, wav: 2430, riffWave: 2430, decode: 43, transcode: 2387 },
    "SpeechZH.big": { entries: 12, wav: 12, riffWave: 12, decode: 8, transcode: 4 },
  };
  for (const [archive, expected] of Object.entries(expectedArchives)) {
    const archiveFormats = formats.archives?.[archive];
    if (!archiveFormats
        || archiveFormats.entryCount !== expected.entries
        || archiveFormats.unsupported !== 0
        || archiveFormats.webAudioDecodeCandidates !== expected.decode
        || archiveFormats.requiresTranscode !== expected.transcode
        || (expected.wav !== undefined && archiveFormats.extensions?.wav !== expected.wav)
        || (expected.mp3 !== undefined && archiveFormats.extensions?.mp3 !== expected.mp3)
        || (expected.riffWave !== undefined && archiveFormats.magic?.["riff-wave"] !== expected.riffWave)
        || (expected.mp3Id3 !== undefined && archiveFormats.magic?.["mp3-id3"] !== expected.mp3Id3)) {
      throw new Error(`${context} audio payload format archive ${archive} mismatch: ${JSON.stringify(archiveFormats)}`);
    }
  }

  const known = payloads.knownPayloadFormats ?? {};
  for (const path of [
    "Data\\Audio\\Tracks\\USA_10.mp3",
    "Data\\Audio\\Tracks\\CHI_10.mp3",
  ]) {
    if (known[path]?.extension !== "mp3" || known[path]?.magic !== "mp3-id3") {
      throw new Error(`${context} known MP3 payload format mismatch for ${path}: ${JSON.stringify(known[path])}`);
    }
  }
  for (const path of [
    "Data\\Audio\\Sounds\\addnwi1a.wav",
    "Data\\Audio\\Sounds\\English\\aangr01a.wav",
    "Data\\Audio\\Speech\\English\\dxxoc001.wav",
  ]) {
    if (known[path]?.extension !== "wav" || known[path]?.magic !== "riff-wave") {
      throw new Error(`${context} known WAV payload format mismatch for ${path}: ${JSON.stringify(known[path])}`);
    }
  }
  if (known["Data\\Audio\\Sounds\\English\\aangr01a.wav"]?.wavFmt?.wFormatTag !== 1
      || known["Data\\Audio\\Speech\\English\\dxxoc001.wav"]?.wavFmt?.wFormatTag !== 17) {
    throw new Error(`${context} known WAV codec anchors mismatch: ${JSON.stringify(known)}`);
  }
}

function assertArrayPrefix(actual, expected, context) {
  if (!Array.isArray(actual) || actual.length < expected.length) {
    throw new Error(`${context} array missing/short: ${JSON.stringify(actual)}`);
  }
  for (let index = 0; index < expected.length; ++index) {
    if (actual[index] !== expected[index]) {
      throw new Error(`${context} array mismatch at ${index}: ${JSON.stringify(actual)}`);
    }
  }
}

function assertValueMatches(actual, expected, context) {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      throw new Error(`${context} object mismatch: ${JSON.stringify(actual)}`);
    }
    for (const [key, value] of Object.entries(expected)) {
      assertValueMatches(actual[key], value, `${context}.${key}`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`${context} array mismatch: ${JSON.stringify(actual)}`);
    }
    for (let index = 0; index < expected.length; ++index) {
      assertValueMatches(actual[index], expected[index], `${context}[${index}]`);
    }
    return;
  }
  if (!Object.is(actual, expected)) {
    throw new Error(`${context} value mismatch: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

function assertAudioDecodeProofs(payloads, context) {
  const decode = payloads.decodeProofs;
  if (!decode
      || decode.source !== "browser mounted BIG WAV decoder proof"
      || decode.ready !== true
      || decode.runtimePlayback !== false
      || decode.nextRequired !== "webAudioBufferUpload"
      || !Array.isArray(decode.errors)
      || decode.errors.length !== 0
      || !Array.isArray(decode.proofs)
      || decode.proofs.length !== 2) {
    throw new Error(`${context} audio decode proof state mismatch: ${JSON.stringify(decode)}`);
  }

  const byPath = new Map(decode.proofs.map((proof) => [proof.path, proof]));
  const pcm = byPath.get("Data\\Audio\\Sounds\\English\\aangr01a.wav");
  if (!pcm
      || pcm.archive !== "AudioEnglishZH.big"
      || pcm.codec !== "PCM"
      || pcm.wFormatTag !== 1
      || pcm.channels !== 1
      || pcm.samplesPerSec !== 22050
      || pcm.bitsPerSample !== 16
      || pcm.dataBytes !== 118784
      || pcm.decodedFrames !== 59392
      || pcm.decodedSamples !== 59392
      || pcm.durationSeconds !== 2.693515
      || pcm.minSample !== -21922
      || pcm.maxSample !== 22092
      || pcm.nonZeroSamples !== 59382
      || pcm.sumAbs !== 249600043) {
    throw new Error(`${context} PCM decode proof mismatch: ${JSON.stringify(pcm)}`);
  }
  assertArrayPrefix(pcm.firstSamples, [
    123, 803, 1942, 3148, 3907, 4515, 5600, 6659,
    6221, 3568, 663, -2267, -4777, -5564, -5407, -7287,
  ], `${context} PCM first samples`);

  const adpcm = byPath.get("Data\\Audio\\Speech\\English\\dxxoc001.wav");
  if (!adpcm
      || adpcm.archive !== "SpeechEnglishZH.big"
      || adpcm.codec !== "IMA_ADPCM"
      || adpcm.wFormatTag !== 17
      || adpcm.channels !== 1
      || adpcm.samplesPerSec !== 44100
      || adpcm.bitsPerSample !== 4
      || adpcm.blockAlign !== 1024
      || adpcm.samplesPerBlock !== 2041
      || adpcm.factSamples !== 753874
      || adpcm.dataBytes !== 378880
      || adpcm.decodedFrames !== 753874
      || adpcm.decodedSamples !== 753874
      || adpcm.durationSeconds !== 17.094649
      || adpcm.minSample !== -32091
      || adpcm.maxSample !== 27567
      || adpcm.nonZeroSamples !== 753561
      || adpcm.sumAbs !== 2300028998) {
    throw new Error(`${context} IMA ADPCM decode proof mismatch: ${JSON.stringify(adpcm)}`);
  }
  assertArrayPrefix(adpcm.firstSamples, [
    -232, -228, -224, -220, -217, -214, -213, -212,
    -211, -210, -203, -200, -197, -193, -189, -185,
  ], `${context} IMA ADPCM first samples`);
}

function assertAudioBufferProofs(payloads, context) {
  const upload = payloads.webAudioBufferProofs;
  if (!upload
      || upload.source !== "browser Web Audio AudioBuffer upload proof"
      || upload.ready !== true
      || upload.runtimePlayback !== false
      || upload.nextRequired !== "requestedPayloadDecodeCache"
      || !Array.isArray(upload.errors)
      || upload.errors.length !== 0
      || !Array.isArray(upload.proofs)
      || upload.proofs.length !== 2) {
    throw new Error(`${context} Web Audio buffer proof state mismatch: ${JSON.stringify(upload)}`);
  }

  const byPath = new Map(upload.proofs.map((proof) => [proof.path, proof]));
  const pcm = byPath.get("Data\\Audio\\Sounds\\English\\aangr01a.wav");
  if (!pcm
      || pcm.archive !== "AudioEnglishZH.big"
      || pcm.codec !== "PCM"
      || pcm.runtimePlayback !== false
      || pcm.numberOfChannels !== 1
      || pcm.length !== 59392
      || pcm.sampleRate !== 22050
      || pcm.durationSeconds !== 2.693515
      || pcm.minFloat !== -0.669006
      || pcm.maxFloat !== 0.674215
      || pcm.maxAbsFloat !== 0.674215
      || pcm.nonZeroFrames !== 59382) {
    throw new Error(`${context} PCM Web Audio buffer proof mismatch: ${JSON.stringify(pcm)}`);
  }
  assertArrayPrefix(pcm.firstChannelFirstSamples, [
    0.003754, 0.024506, 0.059267, 0.096072,
    0.119236, 0.137791, 0.170904, 0.203223,
    0.189856, 0.10889, 0.020234, -0.069183,
    -0.145782, -0.1698, -0.165009, -0.222382,
  ], `${context} PCM Web Audio first samples`);

  const adpcm = byPath.get("Data\\Audio\\Speech\\English\\dxxoc001.wav");
  if (!adpcm
      || adpcm.archive !== "SpeechEnglishZH.big"
      || adpcm.codec !== "IMA_ADPCM"
      || adpcm.runtimePlayback !== false
      || adpcm.numberOfChannels !== 1
      || adpcm.length !== 753874
      || adpcm.sampleRate !== 44100
      || adpcm.durationSeconds !== 17.094649
      || adpcm.minFloat !== -0.97934
      || adpcm.maxFloat !== 0.841304
      || adpcm.maxAbsFloat !== 0.97934
      || adpcm.nonZeroFrames !== 753561) {
    throw new Error(`${context} IMA ADPCM Web Audio buffer proof mismatch: ${JSON.stringify(adpcm)}`);
  }
  assertArrayPrefix(adpcm.firstChannelFirstSamples, [
    -0.00708, -0.006958, -0.006836, -0.006714,
    -0.006622, -0.006531, -0.0065, -0.00647,
    -0.006439, -0.006409, -0.006195, -0.006104,
    -0.006012, -0.00589, -0.005768, -0.005646,
  ], `${context} IMA ADPCM Web Audio first samples`);
}

function assertRequestedCacheBucket(bucket, expected, context) {
  for (const [key, value] of Object.entries(expected)) {
    if (bucket?.[key] !== value) {
      throw new Error(`${context} requested audio cache ${key} mismatch: ${JSON.stringify(bucket)}`);
    }
  }
}

function assertRequestedCacheArchive(bucket, archive, expected, context) {
  const actual = bucket?.archives?.[archive];
  if (!actual) {
    throw new Error(`${context} requested audio cache missing archive ${archive}: ${JSON.stringify(bucket)}`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`${context} requested audio cache archive ${archive}.${key} mismatch: ${JSON.stringify(actual)}`);
    }
  }
}

function assertAudioRequestedPayloadCachePlan(payloads, context) {
  const plan = payloads.requestedPayloadCachePlan;
  if (!plan
      || plan.source !== "shipped audio INI resolved payload cache plan"
      || plan.ready !== true
      || plan.metadataOnly !== true
      || plan.runtimeDecoded !== false
      || plan.runtimeScheduled !== false
      || plan.nextRequired !== "decodeResolvedImaAdpcmPayloads") {
    throw new Error(`${context} requested audio payload cache plan state mismatch: ${JSON.stringify(plan)}`);
  }

  assertRequestedCacheBucket(plan, {
    references: 7933,
    resolvedReferences: 3469,
    missingReferences: 4464,
    uniquePayloads: 3335,
    totalBytes: 360615268,
    webAudioDecodeCandidates: 779,
    requiresTranscode: 2556,
    unsupported: 0,
  }, context);
  if (plan.extensions?.mp3 !== 7
      || plan.extensions?.wav !== 3328
      || plan.wavCodec?.["1"] !== 772
      || plan.wavCodec?.["17"] !== 2556) {
    throw new Error(`${context} requested audio cache format counts mismatch: ${JSON.stringify(plan)}`);
  }
  assertRequestedCacheArchive(plan, "MusicZH.big", {
    references: 8,
    uniquePayloads: 7,
    totalBytes: 33954918,
  }, context);
  assertRequestedCacheArchive(plan, "AudioZH.big", {
    references: 305,
    uniquePayloads: 273,
    totalBytes: 23399124,
  }, context);
  assertRequestedCacheArchive(plan, "AudioEnglishZH.big", {
    references: 721,
    uniquePayloads: 626,
    totalBytes: 44969350,
  }, context);
  assertRequestedCacheArchive(plan, "SpeechEnglishZH.big", {
    references: 2424,
    uniquePayloads: 2419,
    totalBytes: 253178132,
  }, context);
  assertRequestedCacheArchive(plan, "SpeechZH.big", {
    references: 11,
    uniquePayloads: 10,
    totalBytes: 5113744,
  }, context);

  assertRequestedCacheBucket(plan.sections?.music, {
    references: 67,
    resolvedReferences: 8,
    missingReferences: 59,
    uniquePayloads: 7,
    totalBytes: 33954918,
    webAudioDecodeCandidates: 7,
    requiresTranscode: 0,
    unsupported: 0,
  }, `${context} music`);
  assertRequestedCacheBucket(plan.sections?.soundEffects, {
    references: 2290,
    resolvedReferences: 628,
    missingReferences: 1662,
    uniquePayloads: 522,
    totalBytes: 44137194,
    webAudioDecodeCandidates: 353,
    requiresTranscode: 169,
    unsupported: 0,
  }, `${context} soundEffects`);
  assertRequestedCacheBucket(plan.sections?.voices, {
    references: 3008,
    resolvedReferences: 398,
    missingReferences: 2610,
    uniquePayloads: 377,
    totalBytes: 24231280,
    webAudioDecodeCandidates: 377,
    requiresTranscode: 0,
    unsupported: 0,
  }, `${context} voices`);
  assertRequestedCacheBucket(plan.sections?.speech, {
    references: 2568,
    resolvedReferences: 2435,
    missingReferences: 133,
    uniquePayloads: 2429,
    totalBytes: 258291876,
    webAudioDecodeCandidates: 42,
    requiresTranscode: 2387,
    unsupported: 0,
  }, `${context} speech`);

  const firstCache = plan.cacheKeyExamples?.[0];
  if (!firstCache
      || firstCache.cacheKey !== "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav"
      || firstCache.refCount !== 4
      || firstCache.codec !== "PCM"
      || firstCache.webAudioDecodeCandidate !== true
      || firstCache.requiresTranscode !== false) {
    throw new Error(`${context} requested audio cache key example mismatch: ${JSON.stringify(firstCache)}`);
  }
  const firstTranscode = plan.transcodeExamples?.[0];
  if (!firstTranscode
      || firstTranscode.cacheKey !== "AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav"
      || firstTranscode.refCount !== 4
      || firstTranscode.codec !== "IMA_ADPCM"
      || firstTranscode.webAudioDecodeCandidate !== false
      || firstTranscode.requiresTranscode !== true) {
    throw new Error(`${context} requested audio transcode example mismatch: ${JSON.stringify(firstTranscode)}`);
  }
  const firstLargest = plan.largestEntries?.[0];
  if (!firstLargest
      || firstLargest.cacheKey !== "MusicZH.big|Data\\Audio\\Tracks\\Chi_11.mp3"
      || firstLargest.size !== 5954563
      || firstLargest.codec !== "mp3-id3"
      || firstLargest.webAudioDecodeCandidate !== true) {
    throw new Error(`${context} requested audio largest example mismatch: ${JSON.stringify(firstLargest)}`);
  }

  const targetKeys = (plan.decodeCacheProofTargets ?? []).map((target) => target.cacheKey);
  assertArrayPrefix(targetKeys, [
    "MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3",
    "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav",
    "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav",
    "AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav",
    "SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav",
  ], `${context} requested audio decode-cache target keys`);
}

function assertRequestedDecodeCacheEntry(entry, expected, context) {
  for (const [key, value] of Object.entries(expected)) {
    if (key === "firstSamples" || key === "firstChannelFirstSamples") {
      assertArrayPrefix(entry?.[key], value, `${context} ${key}`);
    } else if (entry?.[key] !== value) {
      throw new Error(`${context} requested decode-cache entry ${key} mismatch: ${JSON.stringify(entry)}`);
    }
  }
}

function assertRequestedAudioBufferCacheEntry(entry, expected, context) {
  for (const [key, value] of Object.entries(expected)) {
    if (key === "firstChannelFirstSamples" || key === "firstSamples") {
      assertArrayPrefix(entry?.[key], value, `${context} ${key}`);
    } else if (entry?.[key] !== value) {
      throw new Error(`${context} requested AudioBuffer cache entry ${key} mismatch: ${JSON.stringify(entry)}`);
    }
  }
}

function assertRequestedAudioLifecycleEvent(events, expected, context) {
  const event = events.get(expected.cacheKey);
  if (!event) {
    throw new Error(`${context} lifecycle event missing: ${expected.cacheKey}`);
  }
  assertValueMatches(event, expected, context);
}

function assertAudioRequestedPayloadDecodeCacheProof(payloads, context) {
  const proof = payloads.requestedPayloadDecodeCacheProof;
  if (!proof
      || proof.source !== "browser requested audio decoded payload cache proof"
      || proof.ready !== true
      || proof.metadataOnly !== false
      || proof.runtimeDecoded !== true
      || proof.runtimeScheduled !== true
      || proof.runtimePlayback !== false
      || proof.coverage !== "representative requested MP3/WAV payloads from the shipped INI cache plan"
      || proof.nextRequired !== "engineAudioEventScheduling"
      || proof.requestedPlanReferences !== 7933
      || proof.requestedPlanUniquePayloads !== 3335
      || proof.cacheEntriesCreated !== 5
      || proof.decodedPcmBytes !== 1096144
      || proof.decodedFloatBytes !== 36744192
      || proof.decodedAudioBytes !== 37840336
      || !Array.isArray(proof.errors)
      || proof.errors.length !== 0
      || !Array.isArray(proof.entries)
      || proof.entries.length !== 5) {
    throw new Error(`${context} requested audio decode-cache proof state mismatch: ${JSON.stringify(proof)}`);
  }

  const entries = new Map(proof.entries.map((entry) => [entry.cacheKey, entry]));
  assertRequestedDecodeCacheEntry(entries.get("MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3"), {
    reason: "direct requested MP3 from music",
    codec: "mp3-id3",
    archive: "MusicZH.big",
    refCount: 1,
    firstEvent: "Cin_XChina01",
    firstSource: "Data\\INI\\Music.ini:294",
    size: 2500757,
    extension: "mp3",
    channels: 2,
    samplesPerSec: 44100,
    decodedBy: "WebAudio.decodeAudioData",
    decodedFrames: 4593024,
    decodedSamples: 9186048,
    decodedPcmBytes: 0,
    decodedFloatBytes: 36744192,
    durationSeconds: 104.150204,
    storage: "AudioBuffer decoded by Web Audio decodeAudioData",
    minFloat: -1,
    maxFloat: 0.995727,
    maxAbsFloat: 1,
    nonZeroFrames: 4591257,
    firstChannelFirstSamples: [
      0, -0.000031, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  }, `${context} requested music MP3`);
  assertRequestedDecodeCacheEntry(entries.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav"), {
    reason: "direct requested PCM WAV from SFX",
    codec: "PCM",
    archive: "AudioEnglishZH.big",
    refCount: 4,
    firstEvent: "Amb_DesertMarketWallaLoop3",
    firstSource: "Data\\INI\\SoundEffects.ini:5587",
    size: 62312,
    extension: "wav",
    wFormatTag: 1,
    samplesPerSec: 22050,
    bitsPerSample: 16,
    dataBytes: 62108,
    decodedBy: "harnessWavDecoder",
    decodedFrames: 31054,
    decodedSamples: 31054,
    decodedPcmBytes: 62108,
    decodedFloatBytes: 0,
    durationSeconds: 1.408345,
    minSample: -32767,
    maxSample: 30611,
    nonZeroSamples: 31034,
    sumAbs: 171353033,
    firstSamples: [
      -4187, -8447, -7064, -4447, -6186, -5450, -5389, -4080,
      -509, -481, -2235, -262, 2235, 6193, 7994, 7317,
    ],
  }, `${context} requested SFX PCM`);
  assertRequestedDecodeCacheEntry(entries.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav"), {
    reason: "direct requested PCM WAV from voice",
    codec: "PCM",
    archive: "AudioEnglishZH.big",
    refCount: 3,
    firstEvent: "CIAAgentVoiceAttack",
    firstSource: "Data\\INI\\Voice.ini:4500",
    size: 53146,
    extension: "wav",
    wFormatTag: 1,
    samplesPerSec: 22050,
    bitsPerSample: 16,
    dataBytes: 52916,
    decodedBy: "harnessWavDecoder",
    decodedFrames: 26458,
    decodedSamples: 26458,
    decodedPcmBytes: 52916,
    decodedFloatBytes: 0,
    durationSeconds: 1.199909,
    minSample: -23154,
    maxSample: 32767,
    nonZeroSamples: 26349,
    sumAbs: 76480220,
    firstSamples: [
      5, -15, -56, -94, -110, -106, -99, -94,
      -97, -112, -135, -153, -160, -145, -115, -80,
    ],
  }, `${context} requested voice PCM`);
  assertRequestedDecodeCacheEntry(entries.get("AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav"), {
    reason: "requested IMA ADPCM WAV transcode from SFX",
    codec: "IMA_ADPCM",
    archive: "AudioZH.big",
    refCount: 4,
    firstEvent: "ArtilleryBarrageIncomingWhistle",
    firstSource: "Data\\INI\\SoundEffects.ini:3571",
    size: 48282,
    extension: "wav",
    wFormatTag: 17,
    samplesPerSec: 44100,
    bitsPerSample: 4,
    blockAlign: 1024,
    samplesPerBlock: 2041,
    factSamples: 95744,
    dataBytes: 48128,
    decodedBy: "harnessWavDecoder",
    decodedFrames: 95744,
    decodedSamples: 95744,
    decodedPcmBytes: 191488,
    decodedFloatBytes: 0,
    durationSeconds: 2.171066,
    minSample: -31572,
    maxSample: 32723,
    nonZeroSamples: 94765,
    sumAbs: 192168585,
    firstSamples: [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
  }, `${context} requested SFX IMA ADPCM`);
  assertRequestedDecodeCacheEntry(entries.get("SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav"), {
    reason: "requested IMA ADPCM WAV transcode from speech",
    codec: "IMA_ADPCM",
    archive: "SpeechEnglishZH.big",
    refCount: 2,
    firstEvent: "Taunts_AirTrafficControl01",
    firstSource: "Data\\INI\\Speech.ini:933",
    size: 198902,
    extension: "wav",
    wFormatTag: 17,
    samplesPerSec: 44100,
    bitsPerSample: 4,
    blockAlign: 1024,
    samplesPerBlock: 2041,
    factSamples: 394816,
    dataBytes: 198656,
    decodedBy: "harnessWavDecoder",
    decodedFrames: 394816,
    decodedSamples: 394816,
    decodedPcmBytes: 789632,
    decodedFloatBytes: 0,
    durationSeconds: 8.952744,
    minSample: -30982,
    maxSample: 32271,
    nonZeroSamples: 393306,
    sumAbs: 1307119860,
    firstSamples: [
      28, 39, 69, 115, 121, 126, 111, 98,
      86, 61, 44, 29, 22, 10, 4, -2,
    ],
  }, `${context} requested speech IMA ADPCM`);

  const bufferCache = proof.webAudioBufferCache;
  if (!bufferCache
      || bufferCache.source !== "browser requested audio AudioBuffer cache proof"
      || bufferCache.ready !== true
      || bufferCache.runtimePlayback !== false
      || bufferCache.nextRequired !== "audioEventScheduling"
      || !Array.isArray(bufferCache.errors)
      || bufferCache.errors.length !== 0
      || !Array.isArray(bufferCache.proofs)
      || bufferCache.proofs.length !== 5) {
    throw new Error(`${context} requested AudioBuffer cache state mismatch: ${JSON.stringify(bufferCache)}`);
  }

  const buffers = new Map(bufferCache.proofs.map((entry) => [entry.cacheKey, entry]));
  assertRequestedAudioBufferCacheEntry(buffers.get("MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3"), {
    codec: "mp3-id3",
    decodedBy: "WebAudio.decodeAudioData",
    numberOfChannels: 2,
    length: 4593024,
    sampleRate: 44100,
    durationSeconds: 104.150204,
    decodedFloatBytes: 36744192,
    minFloat: -1,
    maxFloat: 0.995727,
    maxAbsFloat: 1,
    nonZeroFrames: 4591257,
    firstChannelFirstSamples: [
      0, -0.000031, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  }, `${context} requested music MP3 AudioBuffer`);
  assertRequestedAudioBufferCacheEntry(buffers.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav"), {
    codec: "PCM",
    decodedBy: "harnessWavDecoder",
    length: 31054,
    sampleRate: 22050,
    durationSeconds: 1.408345,
    minFloat: -0.999969,
    maxFloat: 0.934202,
    maxAbsFloat: 0.999969,
    nonZeroFrames: 31034,
    firstChannelFirstSamples: [
      -0.127777, -0.257782, -0.215576, -0.135712,
      -0.188782, -0.166321, -0.164459, -0.124512,
      -0.015533, -0.014679, -0.068207, -0.007996,
      0.068209, 0.189001, 0.243965, 0.223304,
    ],
  }, `${context} requested SFX PCM AudioBuffer`);
  assertRequestedAudioBufferCacheEntry(buffers.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav"), {
    codec: "PCM",
    decodedBy: "harnessWavDecoder",
    length: 26458,
    sampleRate: 22050,
    durationSeconds: 1.199909,
    minFloat: -0.706604,
    maxFloat: 1,
    maxAbsFloat: 1,
    nonZeroFrames: 26349,
    firstChannelFirstSamples: [
      0.000153, -0.000458, -0.001709, -0.002869,
      -0.003357, -0.003235, -0.003021, -0.002869,
      -0.00296, -0.003418, -0.00412, -0.004669,
      -0.004883, -0.004425, -0.00351, -0.002441,
    ],
  }, `${context} requested voice PCM AudioBuffer`);
  assertRequestedAudioBufferCacheEntry(buffers.get("AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav"), {
    codec: "IMA_ADPCM",
    decodedBy: "harnessWavDecoder",
    length: 95744,
    sampleRate: 44100,
    durationSeconds: 2.171066,
    minFloat: -0.963501,
    maxFloat: 0.998657,
    maxAbsFloat: 0.998657,
    nonZeroFrames: 94765,
    firstChannelFirstSamples: [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
  }, `${context} requested SFX IMA AudioBuffer`);
  assertRequestedAudioBufferCacheEntry(buffers.get("SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav"), {
    codec: "IMA_ADPCM",
    decodedBy: "harnessWavDecoder",
    length: 394816,
    sampleRate: 44100,
    durationSeconds: 8.952744,
    minFloat: -0.945496,
    maxFloat: 0.984863,
    maxAbsFloat: 0.984863,
    nonZeroFrames: 393306,
    firstChannelFirstSamples: [
      0.000855, 0.00119, 0.002106, 0.00351,
      0.003693, 0.003845, 0.003388, 0.002991,
      0.002625, 0.001862, 0.001343, 0.000885,
      0.000671, 0.000305, 0.000122, -0.000061,
    ],
  }, `${context} requested speech IMA AudioBuffer`);

  const schedule = proof.webAudioScheduleProof;
  if (!schedule
      || schedule.source !== "browser requested audio OfflineAudioContext scheduling proof"
      || schedule.ready !== true
      || schedule.runtimePlayback !== false
      || schedule.offlineRendered !== true
      || schedule.nextRequired !== "engineAudioEventScheduling"
      || schedule.scheduledSources !== 5
      || schedule.endedCallbacksObserved !== 5
      || schedule.renderSampleRate !== 44100
      || schedule.renderLength !== 1055404
      || schedule.renderDurationSeconds !== 23.932063
      || schedule.gapSeconds !== 0.02
      || !Array.isArray(schedule.errors)
      || schedule.errors.length !== 0
      || !Array.isArray(schedule.scheduled)
      || schedule.scheduled.length !== 5
      || !Array.isArray(schedule.endedCallbacks)
      || schedule.endedCallbacks.length !== 5
      || !Array.isArray(schedule.renderedWindows)
      || schedule.renderedWindows.length !== 5) {
    throw new Error(`${context} requested audio schedule proof state mismatch: ${JSON.stringify(schedule)}`);
  }
  assertArrayPrefix(schedule.endedCallbacks.map((entry) => entry.cacheKey), [
    "MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3",
    "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav",
    "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav",
    "AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav",
    "SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav",
  ], `${context} requested audio ended callback order`);

  assertRequestedAudioBufferCacheEntry(schedule.renderSummary, {
    frames: 1055404,
    minFloat: -0.999969,
    maxFloat: 0.999017,
    maxAbsFloat: 0.999969,
    nonZeroFrames: 1045047,
    firstSamples: [
      0, -0.000015, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  }, `${context} requested schedule render summary`);

  const scheduled = new Map(schedule.scheduled.map((entry) => [entry.cacheKey, entry]));
  assertRequestedAudioBufferCacheEntry(scheduled.get("MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3"), {
    firstEvent: "Cin_XChina01",
    firstSource: "Data\\INI\\Music.ini:294",
    startSeconds: 0,
    durationSeconds: 10,
    fullDurationSeconds: 104.150204,
    scheduledPreview: true,
    endSeconds: 10,
    sourceSampleRate: 44100,
    sourceFrames: 4593024,
  }, `${context} requested music MP3 schedule`);
  assertRequestedAudioBufferCacheEntry(scheduled.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav"), {
    firstEvent: "Amb_DesertMarketWallaLoop3",
    firstSource: "Data\\INI\\SoundEffects.ini:5587",
    startSeconds: 10.02,
    durationSeconds: 1.408345,
    fullDurationSeconds: 1.408345,
    scheduledPreview: false,
    endSeconds: 11.428345,
    sourceSampleRate: 22050,
    sourceFrames: 31054,
  }, `${context} requested SFX PCM schedule`);
  assertRequestedAudioBufferCacheEntry(scheduled.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav"), {
    firstEvent: "CIAAgentVoiceAttack",
    firstSource: "Data\\INI\\Voice.ini:4500",
    startSeconds: 11.448345,
    durationSeconds: 1.199909,
    fullDurationSeconds: 1.199909,
    scheduledPreview: false,
    endSeconds: 12.648254,
    sourceSampleRate: 22050,
    sourceFrames: 26458,
  }, `${context} requested voice PCM schedule`);
  assertRequestedAudioBufferCacheEntry(scheduled.get("AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav"), {
    firstEvent: "ArtilleryBarrageIncomingWhistle",
    firstSource: "Data\\INI\\SoundEffects.ini:3571",
    startSeconds: 12.668254,
    durationSeconds: 2.171066,
    fullDurationSeconds: 2.171066,
    scheduledPreview: false,
    endSeconds: 14.83932,
    sourceSampleRate: 44100,
    sourceFrames: 95744,
  }, `${context} requested SFX IMA schedule`);
  assertRequestedAudioBufferCacheEntry(scheduled.get("SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav"), {
    firstEvent: "Taunts_AirTrafficControl01",
    firstSource: "Data\\INI\\Speech.ini:933",
    startSeconds: 14.85932,
    durationSeconds: 8.952744,
    fullDurationSeconds: 8.952744,
    scheduledPreview: false,
    endSeconds: 23.812063,
    sourceSampleRate: 44100,
    sourceFrames: 394816,
  }, `${context} requested speech IMA schedule`);

  const windows = new Map(schedule.renderedWindows.map((entry) => [entry.cacheKey, entry]));
  assertRequestedAudioBufferCacheEntry(windows.get("MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3"), {
    startFrame: 0,
    endFrame: 441000,
    frames: 441000,
    minFloat: -0.838638,
    maxFloat: 0.831523,
    maxAbsFloat: 0.838638,
    nonZeroFrames: 440737,
    firstSamples: [
      0, -0.000015, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  }, `${context} requested music MP3 scheduled render`);
  assertRequestedAudioBufferCacheEntry(windows.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav"), {
    startFrame: 441882,
    endFrame: 503991,
    frames: 62109,
    minFloat: -0.999969,
    maxFloat: 0.934202,
    maxAbsFloat: 0.999969,
    nonZeroFrames: 62088,
    firstSamples: [
      -0.127777, -0.19278, -0.257782, -0.236679,
      -0.215576, -0.175644, -0.135712, -0.162247,
      -0.188782, -0.177551, -0.166321, -0.16539,
      -0.164459, -0.144485, -0.124512, -0.070023,
    ],
  }, `${context} requested SFX PCM scheduled render`);
  assertRequestedAudioBufferCacheEntry(windows.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav"), {
    startFrame: 504872,
    endFrame: 557789,
    frames: 52917,
    minFloat: -0.705687,
    maxFloat: 0.999017,
    maxAbsFloat: 0.999017,
    nonZeroFrames: 52858,
    firstSamples: [
      0, -0.000148, -0.000453, -0.001074,
      -0.0017, -0.00228, -0.00286, -0.003109,
      -0.003353, -0.003297, -0.003236, -0.00313,
      -0.003023, -0.002946, -0.00287, -0.002914,
    ],
  }, `${context} requested voice PCM scheduled render`);
  assertRequestedAudioBufferCacheEntry(windows.get("AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav"), {
    startFrame: 558670,
    endFrame: 654415,
    frames: 95745,
    minFloat: -0.963397,
    maxFloat: 0.998629,
    maxAbsFloat: 0.998629,
    nonZeroFrames: 94848,
    firstSamples: [
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
  }, `${context} requested SFX IMA scheduled render`);
  assertRequestedAudioBufferCacheEntry(windows.get("SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav"), {
    startFrame: 655296,
    endFrame: 1050112,
    frames: 394816,
    minFloat: -0.945251,
    maxFloat: 0.983941,
    maxAbsFloat: 0.983941,
    nonZeroFrames: 394515,
    firstSamples: [
      0, 0.001186, 0.002095, 0.003493,
      0.003691, 0.003844, 0.003393, 0.002996,
      0.002629, 0.001871, 0.001349, 0.000891,
      0.000674, 0.00031, 0.000124, -0.000059,
    ],
  }, `${context} requested speech IMA scheduled render`);

  const lifecycle = proof.browserAudioEventLifecycleProof;
  if (!lifecycle
      || lifecycle.source !== "browser requested audio event lifecycle proof"
      || lifecycle.ready !== true
      || lifecycle.runtimePlayback !== false
      || lifecycle.engineDriven !== false
      || lifecycle.nextRequired !== "replaceMilesSampleStartWithBrowserAudioDevice"
      || lifecycle.eventsStarted !== 5
      || lifecycle.completionCallbacksObserved !== 5
      || lifecycle.handlesUnique !== true
      || lifecycle.callbacksInScheduledOrder !== true
      || !Array.isArray(lifecycle.errors)
      || lifecycle.errors.length !== 0
      || !Array.isArray(lifecycle.sourceFrontiers)
      || lifecycle.sourceFrontiers.length !== 4
      || !Array.isArray(lifecycle.events)
      || lifecycle.events.length !== 5
      || !Array.isArray(lifecycle.eventLog)
      || lifecycle.eventLog.length !== 25) {
    throw new Error(`${context} requested audio lifecycle proof state mismatch: ${JSON.stringify(lifecycle)}`);
  }
  assertArrayPrefix(lifecycle.sourceFrontiers, [
    "verify:audio-event-request-frontier",
    "verify:audio-request-update-frontier",
    "verify:audio-sample-start-frontier",
    "verify:audio-completion-frontier",
  ], `${context} requested audio lifecycle source frontiers`);

  const lifecycleEvents = new Map(lifecycle.events.map((entry) => [entry.cacheKey, entry]));
  const expectedLifecycleEvents = [
    {
      handle: 9001,
      cacheKey: "MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3",
      eventName: "Cin_XChina01",
      firstSource: "Data\\INI\\Music.ini:294",
      archive: "MusicZH.big",
      path: "Data\\Audio\\Tracks\\C_Chix01.mp3",
      sections: { music: 1 },
      request: { type: "AR_Play", queued: true, usePendingEvent: true },
      start: {
        playingType: "PAT_Stream",
        statusBeforeStart: "PS_Playing",
        webAudioNode: "AudioBufferSourceNode",
        startSeconds: 0,
        endSeconds: 10,
        sourceSampleRate: 44100,
        sourceFrames: 4593024,
      },
      callback: {
        observed: true,
        order: 1,
        completionCall: "notifyOfAudioCompletion",
        completionType: "PAT_Stream",
      },
      completion: {
        statusAfterCallback: "PS_Stopped",
        releasePath: "processStoppedList -> releasePlayingAudio",
        releaseAudioEventRTS: true,
      },
    },
    {
      handle: 9002,
      cacheKey: "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav",
      eventName: "Amb_DesertMarketWallaLoop3",
      firstSource: "Data\\INI\\SoundEffects.ini:5587",
      archive: "AudioEnglishZH.big",
      path: "Data\\Audio\\Sounds\\English\\amarke2e.wav",
      sections: { soundEffects: 4 },
      request: { type: "AR_Play", queued: true, usePendingEvent: true },
      start: {
        playingType: "PAT_Sample",
        statusBeforeStart: "PS_Playing",
        webAudioNode: "AudioBufferSourceNode",
        startSeconds: 10.02,
        endSeconds: 11.428345,
        sourceSampleRate: 22050,
        sourceFrames: 31054,
      },
      callback: {
        observed: true,
        order: 2,
        completionCall: "notifyOfAudioCompletion",
        completionType: "PAT_Sample",
      },
      completion: {
        statusAfterCallback: "PS_Stopped",
        releasePath: "processPlayingList -> releasePlayingAudio",
        releaseAudioEventRTS: true,
      },
    },
    {
      handle: 9003,
      cacheKey: "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav",
      eventName: "CIAAgentVoiceAttack",
      firstSource: "Data\\INI\\Voice.ini:4500",
      archive: "AudioEnglishZH.big",
      path: "Data\\Audio\\Sounds\\English\\iciaatd.wav",
      sections: { voices: 3 },
      request: { type: "AR_Play", queued: true, usePendingEvent: true },
      start: {
        playingType: "PAT_Sample",
        statusBeforeStart: "PS_Playing",
        webAudioNode: "AudioBufferSourceNode",
        startSeconds: 11.448345,
        endSeconds: 12.648254,
        sourceSampleRate: 22050,
        sourceFrames: 26458,
      },
      callback: {
        observed: true,
        order: 3,
        completionCall: "notifyOfAudioCompletion",
        completionType: "PAT_Sample",
      },
      completion: {
        statusAfterCallback: "PS_Stopped",
        releasePath: "processPlayingList -> releasePlayingAudio",
        releaseAudioEventRTS: true,
      },
    },
    {
      handle: 9004,
      cacheKey: "AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav",
      eventName: "ArtilleryBarrageIncomingWhistle",
      firstSource: "Data\\INI\\SoundEffects.ini:3571",
      archive: "AudioZH.big",
      path: "Data\\Audio\\Sounds\\gshescre.wav",
      sections: { soundEffects: 4 },
      request: { type: "AR_Play", queued: true, usePendingEvent: true },
      start: {
        playingType: "PAT_Sample",
        statusBeforeStart: "PS_Playing",
        webAudioNode: "AudioBufferSourceNode",
        startSeconds: 12.668254,
        endSeconds: 14.83932,
        sourceSampleRate: 44100,
        sourceFrames: 95744,
      },
      callback: {
        observed: true,
        order: 4,
        completionCall: "notifyOfAudioCompletion",
        completionType: "PAT_Sample",
      },
      completion: {
        statusAfterCallback: "PS_Stopped",
        releasePath: "processPlayingList -> releasePlayingAudio",
        releaseAudioEventRTS: true,
      },
    },
    {
      handle: 9005,
      cacheKey: "SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav",
      eventName: "Taunts_AirTrafficControl01",
      firstSource: "Data\\INI\\Speech.ini:933",
      archive: "SpeechEnglishZH.big",
      path: "Data\\Audio\\Speech\\English\\tairf066.wav",
      sections: { speech: 2 },
      request: { type: "AR_Play", queued: true, usePendingEvent: true },
      start: {
        playingType: "PAT_Stream",
        statusBeforeStart: "PS_Playing",
        webAudioNode: "AudioBufferSourceNode",
        startSeconds: 14.85932,
        endSeconds: 23.812063,
        sourceSampleRate: 44100,
        sourceFrames: 394816,
      },
      callback: {
        observed: true,
        order: 5,
        completionCall: "notifyOfAudioCompletion",
        completionType: "PAT_Stream",
      },
      completion: {
        statusAfterCallback: "PS_Stopped",
        releasePath: "processStoppedList -> releasePlayingAudio",
        releaseAudioEventRTS: true,
      },
    },
  ];
  for (const event of expectedLifecycleEvents) {
    assertRequestedAudioLifecycleEvent(lifecycleEvents, event, `${context} requested audio lifecycle ${event.eventName}`);
  }

  let logIndex = 0;
  for (const event of expectedLifecycleEvents) {
    assertValueMatches(lifecycle.eventLog[logIndex++], {
      handle: event.handle,
      eventName: event.eventName,
      phase: "request",
      request: "AR_Play",
    }, `${context} requested audio lifecycle request log`);
    assertValueMatches(lifecycle.eventLog[logIndex++], {
      handle: event.handle,
      eventName: event.eventName,
      phase: "start",
      playingType: event.start.playingType,
      node: "AudioBufferSourceNode",
    }, `${context} requested audio lifecycle start log`);
    assertValueMatches(lifecycle.eventLog[logIndex++], {
      handle: event.handle,
      eventName: event.eventName,
      phase: "ended",
      observed: true,
      order: event.callback.order,
    }, `${context} requested audio lifecycle ended log`);
    assertValueMatches(lifecycle.eventLog[logIndex++], {
      handle: event.handle,
      eventName: event.eventName,
      phase: "completion",
      call: "notifyOfAudioCompletion",
      status: "PS_Stopped",
    }, `${context} requested audio lifecycle completion log`);
    assertValueMatches(lifecycle.eventLog[logIndex++], {
      handle: event.handle,
      eventName: event.eventName,
      phase: "release",
      path: event.completion.releasePath,
    }, `${context} requested audio lifecycle release log`);
  }

  const mixer = proof.browserAudioMixerBusProof;
  if (!mixer
      || mixer.source !== "browser requested audio Web Audio mixer bus proof"
      || mixer.ready !== true
      || mixer.runtimePlayback !== false
      || mixer.engineDriven !== false
      || mixer.offlineRendered !== true
      || mixer.nextRequired !== "engineDrivenWebAudioMixerBinding"
      || mixer.constructor !== "OfflineAudioContext"
      || mixer.scheduledSources !== 5
      || mixer.endedCallbacksObserved !== 5
      || mixer.renderSampleRate !== 44100
      || mixer.renderLength !== 185220
      || mixer.renderDurationSeconds !== 4.2
      || mixer.gapSeconds !== 0.02
      || !Array.isArray(mixer.sourceFrontiers)
      || mixer.sourceFrontiers.length !== 3
      || !Array.isArray(mixer.errors)
      || mixer.errors.length !== 0
      || !Array.isArray(mixer.scheduled)
      || mixer.scheduled.length !== 5
      || !Array.isArray(mixer.endedCallbacks)
      || mixer.endedCallbacks.length !== 5
      || !Array.isArray(mixer.renderedWindows)
      || mixer.renderedWindows.length !== 5) {
    throw new Error(`${context} requested audio mixer proof state mismatch: ${JSON.stringify(mixer)}`);
  }
  assertArrayPrefix(mixer.sourceFrontiers, [
    "verify:miles-audio-volume-frontier",
    "verify:audio-music-manager-frontier",
    "verify:audio-3d-position-frontier",
  ], `${context} requested audio mixer source frontiers`);
  assertValueMatches(mixer.mixerDefaults, {
    source: "GameAudio.cpp:269-282",
    formula: "busVolume = scriptVolume * systemVolume; sound3DVolume = zoomVolume * scriptSound3DVolume * systemSound3DVolume",
    scriptVolumes: {
      music: 1,
      sound: 1,
      sound3D: 1,
      speech: 1,
    },
    systemVolumes: {
      music: 0.55,
      sound: 0.75,
      sound3D: 0.75,
      speech: 0.55,
    },
    zoomVolume: 1,
    busGains: {
      music: 0.55,
      sound: 0.75,
      sound3D: 0.75,
      speech: 0.55,
    },
  }, `${context} requested audio mixer defaults`);
  assertValueMatches(mixer.scheduledByBus, {
    music: 1,
    sound: 2,
    sound3D: 1,
    speech: 1,
  }, `${context} requested audio mixer bus counts`);
  assertArrayPrefix(mixer.endedCallbacks.map((entry) => `${entry.bus}:${entry.cacheKey}`), [
    "music:MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3",
    "sound:AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav",
    "sound:AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav",
    "sound3D:AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav",
    "speech:SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav",
  ], `${context} requested audio mixer callback order`);

  const mixerScheduled = new Map(mixer.scheduled.map((entry) => [entry.cacheKey, entry]));
  assertValueMatches(mixerScheduled.get("MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3"), {
    firstEvent: "Cin_XChina01",
    firstSource: "Data\\INI\\Music.ini:294",
    sections: { music: 1 },
    bus: "music",
    sourceRoute: "AT_Music stream -> m_musicVolume",
    playingType: "PAT_Stream",
    busGain: 0.55,
    nodeGraph: ["AudioBufferSourceNode", "musicGainNode", "AudioDestinationNode"],
    startSeconds: 0,
    durationSeconds: 1,
    fullDurationSeconds: 104.150204,
    scheduledPreview: true,
    endSeconds: 1,
    sourceSampleRate: 44100,
    sourceFrames: 4593024,
  }, `${context} requested mixer music schedule`);
  assertValueMatches(mixerScheduled.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav"), {
    firstEvent: "Amb_DesertMarketWallaLoop3",
    firstSource: "Data\\INI\\SoundEffects.ini:5587",
    sections: { soundEffects: 4 },
    bus: "sound",
    sourceRoute: "2D sample -> m_soundVolume",
    playingType: "PAT_Sample",
    busGain: 0.75,
    nodeGraph: ["AudioBufferSourceNode", "soundGainNode", "AudioDestinationNode"],
    startSeconds: 1.02,
    durationSeconds: 0.75,
    fullDurationSeconds: 1.408345,
    scheduledPreview: true,
    endSeconds: 1.77,
    sourceSampleRate: 22050,
    sourceFrames: 31054,
  }, `${context} requested mixer SFX schedule`);
  assertValueMatches(mixerScheduled.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav"), {
    firstEvent: "CIAAgentVoiceAttack",
    firstSource: "Data\\INI\\Voice.ini:4500",
    sections: { voices: 3 },
    bus: "sound",
    sourceRoute: "2D sample -> m_soundVolume",
    playingType: "PAT_Sample",
    busGain: 0.75,
    nodeGraph: ["AudioBufferSourceNode", "soundGainNode", "AudioDestinationNode"],
    startSeconds: 1.79,
    durationSeconds: 0.75,
    fullDurationSeconds: 1.199909,
    scheduledPreview: true,
    endSeconds: 2.54,
    sourceSampleRate: 22050,
    sourceFrames: 26458,
  }, `${context} requested mixer voice schedule`);
  assertValueMatches(mixerScheduled.get("AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav"), {
    firstEvent: "ArtilleryBarrageIncomingWhistle",
    firstSource: "Data\\INI\\SoundEffects.ini:3571",
    sections: { soundEffects: 4 },
    bus: "sound3D",
    sourceRoute: "world SFX 3D sample -> m_sound3DVolume",
    playingType: "PAT_3DSample",
    busGain: 0.75,
    nodeGraph: ["AudioBufferSourceNode", "sound3DGainNode", "AudioDestinationNode"],
    startSeconds: 2.56,
    durationSeconds: 0.75,
    fullDurationSeconds: 2.171066,
    scheduledPreview: true,
    endSeconds: 3.31,
    sourceSampleRate: 44100,
    sourceFrames: 95744,
  }, `${context} requested mixer 3D SFX schedule`);
  assertValueMatches(mixerScheduled.get("SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav"), {
    firstEvent: "Taunts_AirTrafficControl01",
    firstSource: "Data\\INI\\Speech.ini:933",
    sections: { speech: 2 },
    bus: "speech",
    sourceRoute: "AT_Streaming stream -> m_speechVolume",
    playingType: "PAT_Stream",
    busGain: 0.55,
    nodeGraph: ["AudioBufferSourceNode", "speechGainNode", "AudioDestinationNode"],
    startSeconds: 3.33,
    durationSeconds: 0.75,
    fullDurationSeconds: 8.952744,
    scheduledPreview: true,
    endSeconds: 4.08,
    sourceSampleRate: 44100,
    sourceFrames: 394816,
  }, `${context} requested mixer speech schedule`);

  assertValueMatches(mixer.renderSummary, {
    frames: 185220,
    minFloat: -0.749977,
    maxFloat: 0.75,
    maxAbsFloat: 0.75,
    nonZeroFrames: 175031,
    firstSamples: [
      0, -0.000008, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  }, `${context} requested mixer render summary`);

  const mixerWindows = new Map(mixer.renderedWindows.map((entry) => [entry.cacheKey, entry]));
  assertValueMatches(mixerWindows.get("MusicZH.big|Data\\Audio\\Tracks\\C_Chix01.mp3"), {
    bus: "music",
    busGain: 0.55,
    startFrame: 0,
    endFrame: 44100,
    frames: 44100,
    minFloat: -0.207022,
    maxFloat: 0.318155,
    maxAbsFloat: 0.318155,
    nonZeroFrames: 43837,
    firstSamples: [
      0, -0.000008, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  }, `${context} requested mixer music render`);
  assertValueMatches(mixerWindows.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\amarke2e.wav"), {
    bus: "sound",
    busGain: 0.75,
    startFrame: 44982,
    endFrame: 78057,
    frames: 33075,
    minFloat: -0.749977,
    maxFloat: 0.700652,
    maxAbsFloat: 0.749977,
    nonZeroFrames: 33069,
    firstSamples: [
      -0.095833, -0.144585, -0.193336, -0.177509,
      -0.161682, -0.131733, -0.101784, -0.121685,
      -0.141586, -0.133163, -0.124741, -0.124043,
      -0.123344, -0.108364, -0.093384, -0.052517,
    ],
  }, `${context} requested mixer SFX render`);
  assertValueMatches(mixerWindows.get("AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav"), {
    bus: "sound",
    busGain: 0.75,
    startFrame: 78939,
    endFrame: 112014,
    frames: 33075,
    minFloat: -0.529953,
    maxFloat: 0.75,
    maxAbsFloat: 0.75,
    nonZeroFrames: 33056,
    firstSamples: [
      0.000114, -0.000114, -0.000343, -0.000813,
      -0.001282, -0.001717, -0.002151, -0.002335,
      -0.002518, -0.002472, -0.002426, -0.002346,
      -0.002266, -0.002209, -0.002151, -0.002186,
    ],
  }, `${context} requested mixer voice render`);
  assertValueMatches(mixerWindows.get("AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav"), {
    bus: "sound3D",
    busGain: 0.75,
    startFrame: 112896,
    endFrame: 145971,
    frames: 33075,
    minFloat: -0.574036,
    maxFloat: 0.619785,
    maxAbsFloat: 0.619785,
    nonZeroFrames: 32155,
    firstSamples: [
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ],
  }, `${context} requested mixer 3D SFX render`);
  assertValueMatches(mixerWindows.get("SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav"), {
    bus: "speech",
    busGain: 0.55,
    startFrame: 146853,
    endFrame: 179928,
    frames: 33075,
    minFloat: -0.415588,
    maxFloat: 0.538217,
    maxAbsFloat: 0.538217,
    nonZeroFrames: 32912,
    firstSamples: [
      0.00047, 0.000655, 0.001158, 0.00193,
      0.002031, 0.002115, 0.001863, 0.001645,
      0.001444, 0.001024, 0.000739, 0.000487,
      0.000369, 0.000168, 0.000067, -0.000034,
    ],
  }, `${context} requested mixer speech render`);

  const positioning = proof.browserAudio3DPositioningProof;
  if (!positioning
      || positioning.source !== "browser requested audio PannerNode 3D positioning proof"
      || positioning.ready !== true
      || positioning.runtimePlayback !== false
      || positioning.engineDriven !== false
      || positioning.nextRequired !== "engineDrivenWebAudioPannerBinding"
      || !Array.isArray(positioning.sourceFrontiers)
      || positioning.sourceFrontiers.length !== 3
      || !Array.isArray(positioning.errors)
      || positioning.errors.length !== 0
      || !Array.isArray(positioning.events)
      || positioning.events.length !== 1) {
    throw new Error(`${context} requested audio 3D positioning proof state mismatch: ${JSON.stringify(positioning)}`);
  }
  assertArrayPrefix(positioning.sourceFrontiers, [
    "verify:audio-3d-position-frontier",
    "verify:audio-sample-start-frontier",
    "verify:miles-audio-volume-frontier",
  ], `${context} requested audio 3D positioning source frontiers`);
  assertValueMatches(positioning.events[0], {
    cacheKey: "AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav",
    archive: "AudioZH.big",
    path: "Data\\Audio\\Sounds\\gshescre.wav",
    eventName: "ArtilleryBarrageIncomingWhistle",
    firstSource: "Data\\INI\\SoundEffects.ini:3571",
    sections: { soundEffects: 4 },
    sourceEvent: {
      name: "ArtilleryBarrageIncomingWhistle",
      source: "Data\\INI\\SoundEffects.ini:3570",
      soundsSource: "Data\\INI\\SoundEffects.ini:3571",
      type: "world everyone",
      minRange: 300,
      maxRange: 2000,
      volume: 70,
      volumeShift: -20,
      limit: 4,
      priority: "normal",
    },
    nodeGraph: ["AudioBufferSourceNode", "PannerNode", "AudioDestinationNode"],
    pannerConfig: {
      panningModel: "equalpower",
      distanceModel: "linear",
      refDistance: 300,
      maxDistance: 2000,
      rolloffFactor: 1,
    },
    listenerPosition: { x: 0, y: 0, z: 0 },
    listenerOrientation: {
      forwardX: 0,
      forwardY: 0,
      forwardZ: -1,
      upX: 0,
      upY: 1,
      upZ: 0,
    },
    sourcePosition: { x: 600, y: 0, z: -600 },
    render: {
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 11025,
      durationSeconds: 0.25,
      left: {
        startFrame: 0,
        endFrame: 11025,
        frames: 11025,
        minFloat: -0.034315,
        maxFloat: 0.043603,
        maxAbsFloat: 0.043603,
        nonZeroFrames: 10107,
        firstSamples: [
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
        ],
      },
      right: {
        startFrame: 0,
        endFrame: 11025,
        frames: 11025,
        minFloat: -0.082844,
        maxFloat: 0.105267,
        maxAbsFloat: 0.105267,
        nonZeroFrames: 10107,
        firstSamples: [
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
          0, 0, 0, 0,
        ],
      },
      leftRms: 0.008197,
      rightRms: 0.019789,
      rightMinusLeftRms: 0.011592,
    },
  }, `${context} requested audio 3D positioning event`);
}

function assertAudioPayloadInventory(state, context, hasBaseIniArchive) {
  const payloads = state.audioPayloadInventory;
  if (!payloads
      || payloads.source !== "browser mounted BIG directory + shipped audio INI parser"
      || payloads.ok !== true
      || payloads.ready !== true
      || payloads.runtimeReady !== false) {
    throw new Error(`${context} audio payload inventory mismatch: ${JSON.stringify(payloads)}`);
  }

  for (const archive of [
    "AudioEnglishZH.big",
    "AudioZH.big",
    "Music.big",
    "MusicZH.big",
    "SpeechEnglishZH.big",
    "SpeechZH.big",
  ]) {
    if (payloads.requiredArchives?.[archive] !== true) {
      throw new Error(`${context} audio payload archive ${archive} missing: ${JSON.stringify(payloads)}`);
    }
  }

  for (const path of [
    "Data\\Audio\\Tracks\\USA_10.mp3",
    "Data\\Audio\\Tracks\\CHI_10.mp3",
    "Data\\Audio\\Sounds\\addnwi1a.wav",
    "Data\\Audio\\Sounds\\English\\aangr01a.wav",
    "Data\\Audio\\Speech\\English\\dxxoc001.wav",
  ]) {
    if (payloads.knownPayloads?.[path] !== true) {
      throw new Error(`${context} known audio payload ${path} missing: ${JSON.stringify(payloads)}`);
    }
  }

  assertAudioPayloadFormats(payloads, context);
  assertAudioDecodeProofs(payloads, context);
  assertAudioBufferProofs(payloads, context);
  assertAudioRequestedPayloadCachePlan(payloads, context);
  assertAudioRequestedPayloadDecodeCacheProof(payloads, context);

  const startupContract = payloads.audioStartupArchiveContract;
  if (!startupContract
      || startupContract.source !== "GameAudio.cpp::AudioManager::init audio INI startup archive contract"
      || startupContract.runtimeReady !== false
      || startupContract.requireCommand !== "npm run inventory:startup-archives -- --require-audio-startup"
      || !Array.isArray(startupContract.files)
      || startupContract.files.length !== 10
      || !Array.isArray(startupContract.optionalBaseArchives)
      || startupContract.optionalBaseArchives[0]?.name !== "INI.big") {
    throw new Error(`${context} audio startup archive contract mismatch: ${JSON.stringify(startupContract)}`);
  }

  if (hasBaseIniArchive) {
    if (payloads.audioSettings?.present !== true
        || payloads.nextRequired !== "browserAudioDevice"
        || startupContract.ready !== true
        || startupContract.nextRequired !== "browserAudioDevice"
        || startupContract.optionalBaseArchives[0]?.mounted !== true
        || startupContract.optionalBaseArchives[0]?.mountName !== "ZZBase_INI.big"
        || startupContract.optionalBaseArchives[0]?.sourceName !== "INI.big"
        || (startupContract.missing?.length ?? -1) !== 0
        || startupContract.missingByReason?.optionalBaseArchiveAbsent !== 0
        || startupContract.missingByReason?.missingFromBaseArchive !== 0
        || startupContract.missingByReason?.missing !== 0) {
      throw new Error(`${context} base INI audio startup state mismatch: ${JSON.stringify({
        audioSettings: payloads.audioSettings,
        startupContract,
      })}`);
    }
    return;
  }

  const expectedMissingAudioStartup = [
    "Data\\INI\\AudioSettings.ini",
    "Data\\INI\\Default\\Music.ini",
    "Data\\INI\\Default\\Speech.ini",
    "Data\\INI\\Default\\Voice.ini",
  ];
  if (payloads.audioSettings?.present !== false
      || payloads.nextRequired !== "audioStartupArchives"
      || startupContract.ready !== false
      || startupContract.nextRequired !== "audioStartupArchives"
      || startupContract.optionalBaseArchives[0]?.mounted !== false
      || startupContract.optionalBaseArchives[0]?.mountName !== null
      || startupContract.optionalBaseArchives[0]?.sourceName !== null
      || JSON.stringify(startupContract.missing) !== JSON.stringify(expectedMissingAudioStartup)
      || startupContract.missingByReason?.optionalBaseArchiveAbsent !== expectedMissingAudioStartup.length
      || startupContract.missingByReason?.missingFromBaseArchive !== 0
      || startupContract.missingByReason?.missing !== 0
      || startupContract.missingDetails.some((entry) =>
        entry.optionalBase !== true ||
        entry.expectedSource !== "INI.big" ||
        entry.reason !== "optionalBaseArchiveAbsent")) {
    throw new Error(`${context} Zero Hour-only audio startup state mismatch: ${JSON.stringify({
      audioSettings: payloads.audioSettings,
      startupContract,
    })}`);
  }

  assertSectionSummary(payloads.sections?.music, {
    references: 67,
    resolved: 8,
    missing: 59,
  }, context, "music");
  assertSectionSummary(payloads.sections?.soundEffects, {
    references: 2290,
    resolved: 628,
    missing: 1662,
  }, context, "soundEffects");
  assertSectionSummary(payloads.sections?.voices, {
    references: 3008,
    resolved: 398,
    missing: 2610,
  }, context, "voices");
  assertSectionSummary(payloads.sections?.speech, {
    references: 2568,
    resolved: 2435,
    missing: 133,
  }, context, "speech");

  assertArchiveReferenceCounts(payloads.sections?.music, {
    "MusicZH.big": 8,
  }, context, "music");
  assertArchiveReferenceCounts(payloads.sections?.soundEffects, {
    "AudioEnglishZH.big": 323,
    "AudioZH.big": 305,
  }, context, "soundEffects");
  assertArchiveReferenceCounts(payloads.sections?.voices, {
    "AudioEnglishZH.big": 398,
  }, context, "voices");
  assertArchiveReferenceCounts(payloads.sections?.speech, {
    "SpeechEnglishZH.big": 2424,
    "SpeechZH.big": 11,
  }, context, "speech");

  if (payloads.sections?.music?.summary?.formats?.mp3 !== 8
      || payloads.sections?.soundEffects?.summary?.formats?.wav !== 628
      || payloads.sections?.voices?.summary?.formats?.wav !== 398
      || payloads.sections?.speech?.summary?.formats?.wav !== 2435) {
    throw new Error(`${context} audio payload resolved format summary mismatch: ${JSON.stringify(payloads.sections)}`);
  }
}

function assertFileSystemProbe(state, context) {
  const probe = state.fileSystemProbe;
  if (!probe?.ok || probe.source !== "GameEngine/Common/System/FileSystem.cpp") {
    throw new Error(`${context} FileSystem probe missing: ${JSON.stringify(probe)}`);
  }

  if (!probe.local?.ok
      || probe.local.path !== "cnc-port-fs-probe/local-file.txt"
      || probe.local.bytes <= 0
      || !probe.local.directory
      || !probe.local.write
      || !probe.local.exists
      || !probe.local.cache
      || !probe.local.info
      || probe.local.infoSize !== probe.local.bytes
      || !probe.local.list
      || !probe.local.read
      || !probe.local.missingCache) {
    throw new Error(`${context} FileSystem local facade incomplete: ${JSON.stringify(probe.local)}`);
  }

  if (!probe.archive?.attempted
      || !probe.archive.loaded
      || !probe.archive.ok
      || probe.archive.path !== "Data\\INI\\Armor.ini"
      || !String(probe.archive.owner ?? "").includes("INIZH.big")
      || probe.archive.indexedFiles !== state.assetProbe?.indexedFiles
      || !probe.archive.exists
      || !probe.archive.info
      || probe.archive.infoSize <= 50000
      || !probe.archive.list
      || !probe.archive.read
      || probe.archive.bytes !== 16
      || !probe.archive.ownerLookup) {
    throw new Error(`${context} FileSystem archive facade incomplete: ${JSON.stringify(probe.archive)}`);
  }
}

function assertDataSummary(state, context, expectedStartupReady) {
  const summary = state.dataSummary;
  const assetProbe = state.assetProbe;
  if (!summary?.ok
      || summary.startupReady !== expectedStartupReady
      || summary.source !== "assetProbe"
      || summary.archives?.indexedFiles !== assetProbe?.indexedFiles
      || summary.archives?.sampleBytes !== assetProbe?.sampleBytes) {
    throw new Error(`${context} data summary header mismatch: ${JSON.stringify(summary)}`);
  }

  for (const parser of [
    "armor",
    "damageFX",
    "fxList",
    "objectCreationList",
    "weapon",
    "aiData",
    "locomotor",
    "science",
    "upgrade",
    "commandButton",
    "commandSet",
    "controlBarScheme",
    "crate",
    "mappedImages",
    "challengeMode",
    "specialPower",
    "playerTemplate",
    "multiplayer",
    "terrain",
    "terrainRoads",
    "gameData",
    "water",
    "weather",
    "video",
    "gameText",
    "mapCache",
  ]) {
    if (summary.parsers?.[parser] !== true) {
      throw new Error(`${context} data summary parser ${parser} not ready: ${JSON.stringify(summary.parsers)}`);
    }
  }

  if (summary.parsers.drawGroupInfo !== false) {
    throw new Error(`${context} should report absent shipped DrawGroupInfo.ini: ${JSON.stringify(summary.parsers)}`);
  }

  const expectedParsedFields = {
    armor: 11,
    damageFX: 10,
    fxList: 11,
    objectCreationList: 12,
    weapon: 37,
    aiData: 50,
    locomotor: 48,
    science: 10,
    upgrade: 34,
    commandButton: 34,
    commandSet: 23,
    controlBarScheme: 34,
    crate: 34,
    drawGroupInfo: 0,
    mappedImages: 18,
    challengeMode: 28,
    specialPower: 38,
    playerTemplate: 50,
    multiplayer: 22,
    terrain: 18,
    terrainRoads: 30,
    gameData: 8,
    water: 18,
    weather: 13,
    video: 5,
  };
  for (const [field, expected] of Object.entries(expectedParsedFields)) {
    if (summary.parsedFields?.[field] !== expected) {
      throw new Error(`${context} data summary parsed field ${field} mismatch: ${JSON.stringify(summary.parsedFields)}`);
    }
  }

  const expectedTemplateCounts = {
    fxLists: 428,
    objectCreationLists: 281,
    objectCreationNuggets: 704,
    particleSystems: 1084,
    locomotors: 182,
    sciences: 95,
    upgrades: 83,
    focusedCommandButtons: 3,
    focusedCommandSets: 1,
    commandSetButtons: 6,
    controlBarImages: 1186,
    mappedImageFiles: 14,
    mappedImages: 1186,
    crates: 7,
    challengeGenerals: 12,
    specialPowers: 79,
    playerTemplates: 15,
    playerSides: 15,
    multiplayerColors: 8,
    terrains: 247,
    roads: 63,
    bridges: 27,
    waterSets: 4,
    videos: 41,
  };
  for (const [field, expected] of Object.entries(expectedTemplateCounts)) {
    if (summary.templates?.[field] !== expected) {
      throw new Error(`${context} data summary template count ${field} mismatch: ${JSON.stringify(summary.templates)}`);
    }
  }

  const expectedMapCounts = {
    mapCacheEntries: 103,
    multiplayer: 47,
    official: 103,
  };
  for (const [field, expected] of Object.entries(expectedMapCounts)) {
    if (summary.maps?.[field] !== expected) {
      throw new Error(`${context} data summary map count ${field} mismatch: ${JSON.stringify(summary.maps)}`);
    }
  }

  if (!summary.strings?.generalsCsf
      || summary.strings.language !== expectedGameTextLanguage
      || summary.strings.csfPath !== expectedGameTextCsfPath
      || !summary.strings.selectedCsf
      || summary.strings.controlBarLabels !== 754) {
    throw new Error(`${context} data summary string coverage mismatch: ${JSON.stringify(summary.strings)}`);
  }
}

function assertOriginalEngineStartup(
  state,
  context,
  expectedStatus,
  expectedStartupAssetsReady,
  expectedFileSystemReadiness = { local: false, archive: false },
  expectedSetupReady = false,
  expectedCoreSetupReady = expectedSetupReady,
) {
  const startup = state.originalEngineStartup;
  if (!startup
      || startup.ok !== false
      || startup.initAttempted !== false
      || startup.source !== "GameEngine/Common/GameEngine.cpp::init"
      || startup.status !== expectedStatus
      || startup.startupAssetsReady !== expectedStartupAssetsReady) {
    throw new Error(`${context} original engine startup header mismatch: ${JSON.stringify(startup)}`);
  }

  const expectedNextRequired = expectedStatus === "browser_device_layer_pending"
    ? (expectedSetupReady ? "originalGameEngineInitOwnership" : "originalSetupResidency")
    : expectedStatus === "missing_startup_files"
      ? "startupFiles"
      : "startupAssets";
  const frontier = startup.deviceFactoryFrontier;
  const entries = frontier?.entries ?? [];
  const byFactory = new Map(entries.map((entry) => [entry.factory, entry]));
  const audioFiles = frontier?.audioStartupFiles;
  const milesAudio = frontier?.milesAudioDeviceFrontier;
  const milesCalls = milesAudio?.openDeviceCalls ?? [];
  const expectedAudioStartupReady =
    expectedStatus === "browser_device_layer_pending" && expectedSetupReady;
  const expectedAudioMissing = expectedAudioStartupReady ? [] : baseAudioStartupFiles;
  const audioMissing = new Set(audioFiles?.missing ?? []);
  const expectedMilesNextRequired = audioFiles?.ready ? "webAudioPlaybackBackend" : "audioStartupFiles";
  const expectedStartupSingletonsReady = state.startupSingletons?.ok === true;
  const expectedSubsystemListReady = state.startupSingletons?.subsystemListOwned === true;
  const expectedGameLODReady = state.startupSingletons?.gameLOD?.initialized === true;
  const expectedMapCacheReady = state.startupSingletons?.mapCache?.loaded === true;
  if (!frontier
      || frontier.probeOnly !== true
      || frontier.ready !== false
      || frontier.nextRequired !== expectedNextRequired
      || frontier.firstUnownedInitFactory !== "createAudioManager"
      || frontier.firstUnownedInitLine !== 434
      || audioFiles?.source !== "GameAudio.cpp::AudioManager::init"
      || audioFiles?.ready !== expectedAudioStartupReady
      || audioFiles?.audioSettingsIni !== expectedAudioStartupReady
      || audioFiles?.defaultMusicIni !== expectedAudioStartupReady
      || audioFiles?.musicIni !== true
      || audioFiles?.defaultSoundEffectsIni !== true
      || audioFiles?.soundEffectsIni !== true
      || audioFiles?.defaultSpeechIni !== expectedAudioStartupReady
      || audioFiles?.speechIni !== true
      || audioFiles?.defaultVoiceIni !== expectedAudioStartupReady
      || audioFiles?.voiceIni !== true
      || audioFiles?.miscAudioIni !== true
      || audioMissing.size !== expectedAudioMissing.length
      || expectedAudioMissing.some((path) => !audioMissing.has(path))
      || milesAudio?.source !== "MilesAudioManager.cpp::init/openDevice + Mss.H"
      || milesAudio?.ready !== false
      || milesAudio?.runtimeReady !== false
      || milesAudio?.compileOnly !== false
      || milesAudio?.probeOnly !== true
      || milesAudio?.startupBoundaryReady !== true
      || milesAudio?.playbackReady !== false
      || milesAudio?.browserTarget !== "Web Audio"
      || milesAudio?.nextRequired !== expectedMilesNextRequired
      || milesAudio?.startupProbeCommand !== "mssStartupProbe"
      || milesAudio?.initLine !== 444
      || milesAudio?.audioManagerInitLine !== 446
      || milesAudio?.openDeviceCallLine !== 454
      || milesAudio?.fileCallbacksLine !== 458
      || milesAudio?.openDeviceLine !== 1444
      || milesAudio?.mssShim?.compileOnly !== false
      || milesAudio?.mssShim?.startupBoundaryReady !== true
      || milesAudio?.mssShim?.playbackReady !== false
      || milesAudio?.mssShim?.AIL_startup !== "stateful"
      || milesAudio?.mssShim?.AIL_shutdown !== "stateful"
      || milesAudio?.mssShim?.AIL_quick_startup !== "stateful"
      || milesAudio?.mssShim?.AIL_quick_handles !== "stateful"
      || milesAudio?.mssShim?.AIL_set_file_callbacks !== "stateful"
      || milesAudio?.mssShim?.AIL_enumerate_3D_providers !== "stateful"
      || milesAudio?.mssShim?.AIL_open_3D_provider !== "stateful"
      || milesAudio?.mssShim?.AIL_open_3D_listener !== "stateful"
      || milesAudio?.mssShim?.AIL_allocate_sample_handle !== "stateful"
      || milesAudio?.mssShim?.AIL_allocate_3D_sample_handle !== "stateful"
      || milesAudio?.mssShim?.AIL_enumerate_filters !== "stateful"
      || milesCalls.length !== 8
      || milesCalls[0]?.call !== "AIL_set_redist_directory"
      || milesCalls[0]?.line !== 1450
      || milesCalls[0]?.ready !== true
      || milesCalls[1]?.call !== "AIL_startup"
      || milesCalls[1]?.line !== 1451
      || milesCalls[1]?.ready !== true
      || milesCalls[2]?.call !== "AIL_quick_startup"
      || milesCalls[2]?.line !== 1458
      || milesCalls[2]?.ready !== true
      || milesCalls[3]?.call !== "AIL_quick_handles"
      || milesCalls[3]?.line !== 1461
      || milesCalls[3]?.ready !== true
      || milesCalls[4]?.call !== "buildProviderList"
      || milesCalls[4]?.line !== 1464
      || milesCalls[4]?.ready !== true
      || milesCalls[5]?.call !== "selectProvider"
      || milesCalls[5]?.line !== 1470
      || milesCalls[5]?.ready !== true
      || milesCalls[6]?.call !== "refreshCachedVariables"
      || milesCalls[6]?.line !== 1473
      || milesCalls[6]?.ready !== false
      || milesCalls[7]?.call !== "initDelayFilter"
      || milesCalls[7]?.line !== 1479
      || milesCalls[7]?.ready !== true
      || frontier.fileSystemReady !== (expectedFileSystemReadiness.local && expectedFileSystemReadiness.archive)
      || frontier.startupFilesReady !== (expectedStatus === "browser_device_layer_pending")
      || frontier.startupSingletonsReady !== expectedStartupSingletonsReady
      || frontier.setupReady !== expectedSetupReady
      || frontier.factoryMappings?.CreateGameEngine !== "Win32GameEngine"
      || frontier.factoryMappings?.createAudioManager !== "MilesAudioManager"
      || frontier.factoryMappings?.createGameClient !== "W3DGameClient"
      || frontier.factoryMappings?.createLocalFileSystem !== "Win32LocalFileSystem"
      || frontier.factoryMappings?.createArchiveFileSystem !== "Win32BIGFileSystem"
      || byFactory.get("CreateGameEngine")?.line !== 1122
      || byFactory.get("CreateGameEngine")?.ready !== true
      || byFactory.get("createLocalFileSystem")?.line !== 342
      || byFactory.get("createArchiveFileSystem")?.line !== 353
      || byFactory.get("SubsystemInterfaceList")?.line !== 297
      || byFactory.get("SubsystemInterfaceList")?.ready !== expectedSubsystemListReady
      || byFactory.get("GameLODManager")?.line !== 384
      || byFactory.get("GameLODManager")?.ready !== expectedGameLODReady
      || byFactory.get("MapCache")?.line !== 606
      || byFactory.get("MapCache")?.ready !== expectedMapCacheReady
      || byFactory.get("createAudioManager")?.line !== 434
      || byFactory.get("createAudioManager")?.ready !== false
      || byFactory.get("createThingFactory")?.line !== 482
      || byFactory.get("createGameClient")?.line !== 493
      || byFactory.get("createGameLogic")?.line !== 505
      || byFactory.get("createRadar")?.line !== 510
      || byFactory.get("createWebBrowser")?.called !== false) {
    throw new Error(`${context} device factory frontier mismatch: ${JSON.stringify(frontier)}`);
  }

  if (startup.browserDeviceLayer?.ready !== false
      || startup.browserDeviceLayer?.createGameEngine !== true
      || startup.browserDeviceLayer?.browserGameEngine !== true
      || startup.originalSetup?.probeOnly !== true
      || startup.originalSetup?.runtimeOwned !== false
      || startup.originalSetup?.globalData !== expectedCoreSetupReady
      || startup.originalSetup?.commandLine !== expectedCoreSetupReady
      || startup.originalSetup?.cdManager !== expectedCoreSetupReady
      || startup.originalSetup?.startupSingletons !== expectedStartupSingletonsReady
      || startup.originalSetup?.subsystemList !== expectedSubsystemListReady
      || startup.originalSetup?.gameLODManager !== expectedGameLODReady
      || startup.originalSetup?.mapCache !== expectedMapCacheReady
      || startup.browserDeviceLayer?.cdManager !== expectedCoreSetupReady
      || startup.browserDeviceLayer?.localFileSystem !== expectedFileSystemReadiness.local
      || startup.browserDeviceLayer?.archiveFileSystem !== expectedFileSystemReadiness.archive
      || startup.browserDeviceLayer?.startupSingletons !== expectedStartupSingletonsReady
      || startup.browserDeviceLayer?.gameClient !== false
      || startup.browserDeviceLayer?.audioManager !== false
      || startup.browserDeviceLayer?.display !== false
      || startup.browserDeviceLayer?.input !== false) {
    throw new Error(`${context} should report browser device layer as not runtime-ready: ${JSON.stringify(startup.browserDeviceLayer)}`);
  }
}

function assertOriginalEngineStartupMissingFiles(state, context) {
  assertOriginalEngineStartup(
    state,
    context,
    "missing_startup_files",
    true,
    { local: true, archive: true },
    false,
    true,
  );
  const files = state.originalEngineStartup.startupFiles;
  const missing = new Set(files?.missing ?? []);
  const expectedMissing = [
    "Data\\INI\\Default\\GameData.ini",
    "Data\\INI\\GameLODPresets.ini",
    "Data\\INI\\Default\\Water.ini",
    "Data\\INI\\Default\\Science.ini",
    "Data\\INI\\Default\\Multiplayer.ini",
    "Data\\INI\\Default\\Terrain.ini",
    "Data\\INI\\Default\\Roads.ini",
    "Data\\INI\\Rank.ini",
    "Data\\INI\\Default\\PlayerTemplate.ini",
    "Data\\INI\\Default\\FXList.ini",
    "Data\\INI\\Default\\ObjectCreationList.ini",
    "Data\\INI\\Default\\SpecialPower.ini",
    "Data\\INI\\Default\\Upgrade.ini",
    "Data\\INI\\Default\\Crate.ini",
    "Data\\INI\\CommandMap.ini",
    "Data\\INI\\Default\\Video.ini",
  ];

  if (files?.ready !== false
      || files.defaultGameDataIni !== false
      || files.defaultWaterIni !== false
      || files.defaultWeatherIni !== true
      || files.defaultScienceIni !== false
      || files.defaultMultiplayerIni !== false
      || files.defaultTerrainIni !== false
      || files.defaultRoadsIni !== false
      || files.rankIni !== false
      || files.defaultPlayerTemplateIni !== false
      || files.defaultFXListIni !== false
      || files.defaultObjectCreationListIni !== false
      || files.defaultSpecialPowerIni !== false
      || files.defaultUpgradeIni !== false
      || files.defaultCrateIni !== false
      || files.commandMapIni !== false
      || files.englishCommandMapIni !== true
      || files.defaultVideoIni !== false
      || files.gameDataIni !== true
      || files.gameLODIni !== true
      || files.gameLODPresetsIni !== false
      || files.waterIni !== true
      || files.weatherIni !== true
      || files.scienceIni !== true
      || files.multiplayerIni !== true
      || files.terrainIni !== true
      || files.roadsIni !== true
      || files.playerTemplateIni !== true
      || files.fxListIni !== true
      || files.objectCreationListIni !== true
      || files.specialPowerIni !== true
      || files.upgradeIni !== true
      || files.crateIni !== true
      || files.videoIni !== true
      || !Number.isInteger(files.objectIniFiles)
      || files.objectIniFiles !== 43) {
    throw new Error(`${context} startup file readiness mismatch: ${JSON.stringify(files)}`);
  }

  if (missing.size !== expectedMissing.length) {
    throw new Error(`${context} missing startup path count mismatch: ${JSON.stringify(files?.missing)}`);
  }
  for (const path of expectedMissing) {
    if (!missing.has(path)) {
      throw new Error(`${context} missing startup path not reported: ${path} in ${JSON.stringify(files?.missing)}`);
    }
  }

  const baseIniArchive = files?.baseIniArchive;
  const baseMissing = new Set(baseIniArchive?.missing ?? []);
  if (baseIniArchive?.ready !== false
      || baseIniArchive.archive !== "INI.big"
      || baseIniArchive.source !== "Base Generals Data1.cab"
      || baseIniArchive.mounted !== false
      || baseIniArchive.mountName !== null
      || baseIniArchive.sourceName !== null
      || !baseIniArchive.message?.includes("base Generals INI.big")
      || baseMissing.size !== expectedMissing.length) {
    throw new Error(`${context} base INI startup diagnostic mismatch: ${JSON.stringify(baseIniArchive)}`);
  }
  for (const path of expectedMissing) {
    if (!baseMissing.has(path)) {
      throw new Error(`${context} base INI missing startup path not reported: ${path} in ${JSON.stringify(baseIniArchive)}`);
    }
  }
}

function assertOriginalEngineStartupWithBaseIni(state, context) {
  assertOriginalEngineStartup(
    state,
    context,
    "browser_device_layer_pending",
    true,
    { local: true, archive: true },
    true,
    true,
  );
  const files = state.originalEngineStartup.startupFiles;
  if (files?.ready !== true
      || files.defaultGameDataIni !== true
      || files.defaultWaterIni !== true
      || files.defaultWeatherIni !== true
      || files.defaultScienceIni !== true
      || files.defaultMultiplayerIni !== true
      || files.defaultTerrainIni !== true
      || files.defaultRoadsIni !== true
      || files.rankIni !== true
      || files.defaultPlayerTemplateIni !== true
      || files.defaultFXListIni !== true
      || files.defaultObjectCreationListIni !== true
      || files.defaultSpecialPowerIni !== true
      || files.defaultUpgradeIni !== true
      || files.defaultCrateIni !== true
      || files.commandMapIni !== true
      || files.englishCommandMapIni !== true
      || files.defaultVideoIni !== true
      || files.gameLODIni !== true
      || files.gameLODPresetsIni !== true
      || files.gameDataIni !== true
      || files.waterIni !== true
      || files.weatherIni !== true
      || files.scienceIni !== true
      || files.multiplayerIni !== true
      || files.terrainIni !== true
      || files.roadsIni !== true
      || files.playerTemplateIni !== true
      || files.fxListIni !== true
      || files.objectCreationListIni !== true
      || files.specialPowerIni !== true
      || files.upgradeIni !== true
      || files.crateIni !== true
      || files.videoIni !== true
      || !Number.isInteger(files.objectIniFiles)
      || files.objectIniFiles <= 0
      || (files.missing?.length ?? 0) !== 0) {
    throw new Error(`${context} base INI archive did not complete startup file readiness: ${JSON.stringify(files)}`);
  }

  const baseIniArchive = files.baseIniArchive;
  if (baseIniArchive?.ready !== true
      || baseIniArchive.archive !== "INI.big"
      || baseIniArchive.source !== "Base Generals Data1.cab"
      || baseIniArchive.mounted !== true
      || baseIniArchive.mountName !== "ZZBase_INI.big"
      || baseIniArchive.sourceName !== "INI.big"
      || (baseIniArchive.missing?.length ?? -1) !== 0
      || !baseIniArchive.message?.includes("base INI startup files are visible")) {
    throw new Error(`${context} base INI startup diagnostic should be clear: ${JSON.stringify(baseIniArchive)}`);
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

const availableOptionalBaseArchives = [];
for (const optionalArchive of optionalBaseRuntimeArchives) {
  const path = resolve(archiveRoot, optionalArchive.sourceName);
  if (!isInside(archiveRoot, path)) {
    throw new Error(`optional archive path escaped ${archiveRoot}: ${path}`);
  }

  try {
    await access(path);
  } catch {
    continue;
  }

  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error(`optional archive is not a readable file: ${path}`);
  }

  const archive = {
    name: optionalArchive.mountName,
    sourceName: optionalArchive.sourceName,
    description: optionalArchive.description,
    bytes: fileStat.size,
    urlPath: relative(wasmRoot, path).split(sep).join("/"),
  };
  archives.push(archive);
  availableOptionalBaseArchives.push(archive);
}

const hasBaseIniArchive = availableOptionalBaseArchives.some((archive) =>
  archive.sourceName === "INI.big");
const expectedArchiveCount = runtimeArchives.length + availableOptionalBaseArchives.length;

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const archiveInputs = archives.map((archive) => ({
    name: archive.name,
    sourceName: archive.sourceName ?? archive.name,
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
  if (archiveSet.archiveCount !== expectedArchiveCount
      || archiveSet.probes.length !== expectedArchiveCount) {
    throw new Error(`archive set count mismatch: ${JSON.stringify(archiveSet)}`);
  }

  const failed = archiveSet.archives.filter((archive) =>
    !archive.bytesMatch || !archiveSet.probes.some((probe) => probe.path === archive.path && probe.ok));
  if (failed.length > 0) {
    throw new Error(`browser runtime archive smoke failed: ${JSON.stringify(failed)}`);
  }

  const assetProbe = mountResult.state?.assetProbe;
  if (!assetProbe?.ok || !assetProbe.inizh?.armorIni
      || !assetProbe.inizh?.damageFXIni
      || !assetProbe.inizh?.fxListIni
      || !assetProbe.inizh?.objectCreationListIni
      || !assetProbe.inizh?.commandButtonIni
      || !assetProbe.inizh?.commandSetIni
      || !assetProbe.inizh?.challengeModeIni
      || !assetProbe.inizh?.controlBarSchemeIni
      || !assetProbe.inizh?.defaultControlBarSchemeIni
      || !assetProbe.inizh?.crateIni
      || !assetProbe.inizh?.multiplayerIni
      || !assetProbe.inizh?.scienceIni
      || !assetProbe.inizh?.upgradeIni
      || !assetProbe.inizh?.specialPowerIni
      || !assetProbe.inizh?.playerTemplateIni
      || !assetProbe.inizh?.terrainIni
      || !assetProbe.inizh?.roadsIni
      || !assetProbe.inizh?.defaultAIDataIni
      || !assetProbe.inizh?.locomotorIni
      || !assetProbe.inizh?.weaponIni
      || !assetProbe.inizh?.gameLODIni
      || !assetProbe.inizh?.particleSystemIni) {
    throw new Error(`aggregate runtime archive probe missed required INIZH files: ${JSON.stringify(assetProbe)}`);
  }
  assertGameTextProbe(assetProbe, "aggregate runtime archive probe");
  assertArmorProbe(assetProbe, "aggregate runtime archive probe");
  assertDamageFXProbe(assetProbe, "aggregate runtime archive probe");
  assertFXListProbe(assetProbe, "aggregate runtime archive probe");
  assertObjectCreationListProbe(assetProbe, "aggregate runtime archive probe");
  assertWeaponProbe(assetProbe, "aggregate runtime archive probe");
  assertAIDataProbe(assetProbe, "aggregate runtime archive probe");
  assertLocomotorProbe(assetProbe, "aggregate runtime archive probe");
  assertScienceProbe(assetProbe, "aggregate runtime archive probe");
  assertUpgradeProbe(assetProbe, "aggregate runtime archive probe");
  assertCommandButtonProbe(assetProbe, "aggregate runtime archive probe");
  assertCommandSetProbe(assetProbe, "aggregate runtime archive probe");
  assertControlBarSchemeProbe(assetProbe, "aggregate runtime archive probe");
  assertCrateProbe(assetProbe, "aggregate runtime archive probe");
  assertDrawGroupInfoProbeAbsent(assetProbe, "aggregate runtime archive probe");
  assertMappedImageProbe(assetProbe, "aggregate runtime archive probe");
  assertChallengeModeProbe(assetProbe, "aggregate runtime archive probe");
  assertSpecialPowerProbe(assetProbe, "aggregate runtime archive probe");
  assertPlayerTemplateProbe(assetProbe, "aggregate runtime archive probe");
  assertMultiplayerProbe(assetProbe, "aggregate runtime archive probe");
  assertTerrainProbe(assetProbe, "aggregate runtime archive probe");
  assertTerrainRoadsProbe(assetProbe, "aggregate runtime archive probe");
  assertGameDataProbe(assetProbe, "aggregate runtime archive probe");
  assertWaterProbe(assetProbe, "aggregate runtime archive probe");
  assertWeatherProbe(assetProbe, "aggregate runtime archive probe");
  assertVideoProbe(assetProbe, "aggregate runtime archive probe");
  assertMapCacheProbe(assetProbe, "aggregate runtime archive probe");
  assertDataSummary(mountResult.state, "aggregate runtime archive probe", false);
  assertAudioRuntimeAssets(mountResult.state, "runtime archive preload");
  assertAudioPayloadInventory(mountResult.state, "runtime archive preload", hasBaseIniArchive);
  assertBrowserRuntimeFileSystem(mountResult.state, "runtime archive preload", {
    directory: "/assets/runtime/",
    indexedFiles: assetProbe.indexedFiles,
  });
  assertOriginalEngineStartup(mountResult.state, "runtime archive preload", "pending_boot_probe", false);

  if (mountResult.state.mountedArchives?.length !== archives.length) {
    throw new Error(`mounted archive state count mismatch: ${JSON.stringify(mountResult.state.mountedArchives)}`);
  }

  const archiveMount = mountResult.state.archiveMount;
  if (!archiveMount?.registered
      || archiveMount.directory !== "/assets/runtime/"
      || archiveMount.fileMask !== "*.big"
      || archiveMount.archiveCount !== archives.length
      || archiveMount.totalBytes !== archiveSet.totalBytes
      || archiveMount.archives?.length !== archives.length
      || archiveMount.sourceArchives?.length !== archives.length) {
    throw new Error(`wasm archive mount state mismatch: ${JSON.stringify(archiveMount)}`);
  }
  const archiveMountNames = new Set(archiveMount.archives);
  const archiveMountSourceNames = new Set(archiveMount.sourceArchives);
  for (const archive of archives) {
    if (!archiveMountNames.has(archive.name)
        || !archiveMountSourceNames.has(archive.sourceName ?? archive.name)) {
      throw new Error(`wasm archive mount manifest missed ${archive.name}: ${JSON.stringify(archiveMount)}`);
    }
  }
  if (hasBaseIniArchive) {
    if (!archiveMountNames.has("ZZBase_INI.big") || !archiveMountSourceNames.has("INI.big")) {
      throw new Error(`wasm archive mount manifest missed base INI archive: ${JSON.stringify(archiveMount)}`);
    }
  } else if (archiveMountNames.has("ZZBase_INI.big") || archiveMountSourceNames.has("INI.big")) {
    throw new Error(`wasm archive mount manifest unexpectedly reports base INI archive: ${JSON.stringify(archiveMount)}`);
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
      || bootArchiveMount.totalBytes !== archiveMount.totalBytes
      || JSON.stringify(bootArchiveMount.archives) !== JSON.stringify(archiveMount.archives)
      || JSON.stringify(bootArchiveMount.sourceArchives) !== JSON.stringify(archiveMount.sourceArchives)) {
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
  assertDamageFXProbe(bootResult.state.assetProbe, "boot asset probe");
  assertFXListProbe(bootResult.state.assetProbe, "boot asset probe");
  assertObjectCreationListProbe(bootResult.state.assetProbe, "boot asset probe");
  assertWeaponProbe(bootResult.state.assetProbe, "boot asset probe");
  assertAIDataProbe(bootResult.state.assetProbe, "boot asset probe");
  assertLocomotorProbe(bootResult.state.assetProbe, "boot asset probe");
  assertScienceProbe(bootResult.state.assetProbe, "boot asset probe");
  assertUpgradeProbe(bootResult.state.assetProbe, "boot asset probe");
  assertCommandButtonProbe(bootResult.state.assetProbe, "boot asset probe");
  assertCommandSetProbe(bootResult.state.assetProbe, "boot asset probe");
  assertControlBarSchemeProbe(bootResult.state.assetProbe, "boot asset probe");
  assertCrateProbe(bootResult.state.assetProbe, "boot asset probe");
  assertDrawGroupInfoProbeAbsent(bootResult.state.assetProbe, "boot asset probe");
  assertMappedImageProbe(bootResult.state.assetProbe, "boot asset probe");
  assertChallengeModeProbe(bootResult.state.assetProbe, "boot asset probe");
  assertSpecialPowerProbe(bootResult.state.assetProbe, "boot asset probe");
  assertPlayerTemplateProbe(bootResult.state.assetProbe, "boot asset probe");
  assertMultiplayerProbe(bootResult.state.assetProbe, "boot asset probe");
  assertTerrainProbe(bootResult.state.assetProbe, "boot asset probe");
  assertTerrainRoadsProbe(bootResult.state.assetProbe, "boot asset probe");
  assertGameDataProbe(bootResult.state.assetProbe, "boot asset probe");
  assertWaterProbe(bootResult.state.assetProbe, "boot asset probe");
  assertWeatherProbe(bootResult.state.assetProbe, "boot asset probe");
  assertVideoProbe(bootResult.state.assetProbe, "boot asset probe");
  assertMapCacheProbe(bootResult.state.assetProbe, "boot asset probe");
  assertStartupAssets(bootResult.state, "runtime archive boot", "ready", true);
  assertAudioRuntimeAssets(bootResult.state, "runtime archive boot");
  assertBrowserAudioRuntime(bootResult.state.browserAudioRuntime, "runtime archive boot before gesture", {
    created: false,
    resumeAttempts: 0,
  });
  assertBrowserAudioMixerRuntime(bootResult.state.browserAudioMixerRuntime, "runtime archive boot before gesture", {
    created: false,
    updates: 0,
  });
  assertBrowserAudioLiveEventRuntime(bootResult.state.browserAudioLiveEventRuntime, "runtime archive boot before gesture", {
    ready: false,
    cacheEntries: 5,
    completed: 0,
  });
  assertBrowserAudioRequestPathRuntime(
    bootResult.state.browserAudioRequestPathRuntime,
    "runtime archive boot before gesture",
    {
      ready: false,
      cacheEntries: 5,
      completed: 0,
    },
  );
  assertAudioPayloadInventory(bootResult.state, "runtime archive boot", hasBaseIniArchive);
  assertFileSystemProbe(bootResult.state, "runtime archive boot");
  assertBrowserRuntimeFileSystem(bootResult.state, "runtime archive boot", {
    directory: "/assets/runtime/",
    indexedFiles: bootResult.state.assetProbe.indexedFiles,
  });
  assertStartupSingletons(bootResult.state, "runtime archive boot", false);
  assertDataSummary(bootResult.state, "runtime archive boot", true);
  if (hasBaseIniArchive) {
    assertOriginalEngineStartupWithBaseIni(bootResult.state, "runtime archive boot");
  } else {
    assertOriginalEngineStartupMissingFiles(bootResult.state, "runtime archive boot");
  }
  const win32GameEngineResult = await page.evaluate(() => window.CnCPort.rpc("win32GameEngineProbe"));
  if (!win32GameEngineResult.ok) {
    throw new Error(`Win32GameEngine probe RPC failed: ${JSON.stringify(win32GameEngineResult)}`);
  }
  assertWin32GameEngineProbe(win32GameEngineResult.probe, "runtime archive boot");
  const mssStartupResult = await page.evaluate(() => window.CnCPort.rpc("mssStartupProbe"));
  if (!mssStartupResult.ok) {
    throw new Error(`MSS startup probe RPC failed: ${JSON.stringify(mssStartupResult)}`);
  }
  assertMssStartupProbe(mssStartupResult.probe, "runtime archive boot");
  const mssSampleLifecycleResult = await page.evaluate(() => window.CnCPort.rpc("mssSampleLifecycleProbe"));
  if (!mssSampleLifecycleResult.ok) {
    throw new Error(`MSS sample lifecycle probe RPC failed: ${JSON.stringify(mssSampleLifecycleResult)}`);
  }
  assertMssSampleLifecycleProbe(mssSampleLifecycleResult.probe, "runtime archive boot");
  const mssStreamLifecycleResult = await page.evaluate(() => window.CnCPort.rpc("mssStreamLifecycleProbe"));
  if (!mssStreamLifecycleResult.ok) {
    throw new Error(`MSS stream lifecycle probe RPC failed: ${JSON.stringify(mssStreamLifecycleResult)}`);
  }
  assertMssStreamLifecycleProbe(mssStreamLifecycleResult.probe, "runtime archive boot");
  const mss3DSampleLifecycleResult = await page.evaluate(() => window.CnCPort.rpc("mss3DSampleLifecycleProbe"));
  if (!mss3DSampleLifecycleResult.ok) {
    throw new Error(`MSS 3D sample lifecycle probe RPC failed: ${JSON.stringify(mss3DSampleLifecycleResult)}`);
  }
  assertMss3DSampleLifecycleProbe(mss3DSampleLifecycleResult.probe, "runtime archive boot");

  const audioGesturePoint = await page.evaluate(() => {
    const target = document.querySelector("#viewport");
    const rect = target.getBoundingClientRect();
    return {
      x: rect.left + Math.max(1, Math.min(rect.width - 1, rect.width / 2)),
      y: rect.top + Math.max(1, Math.min(rect.height - 1, rect.height / 2)),
    };
  });
  await page.mouse.click(audioGesturePoint.x, audioGesturePoint.y);
  await page.waitForFunction(async () => {
    const result = await window.CnCPort.rpc("browserAudioRuntime");
    const runtime = result.browserAudioRuntime;
    return runtime?.resumeAttempts >= 1
      && runtime?.resumeSuccesses >= 1
      && runtime?.contextState === "running"
      && runtime?.lastResumeTrigger === "canvas.pointerdown";
  }, null, { timeout: 5000 });
  const audioGestureResult = await page.evaluate(() => window.CnCPort.rpc("browserAudioRuntime"));
  if (!audioGestureResult.ok) {
    throw new Error(`browser audio runtime RPC failed after gesture: ${JSON.stringify(audioGestureResult)}`);
  }
  assertBrowserAudioRuntime(
    audioGestureResult.browserAudioRuntime,
    "runtime archive boot after audio gesture",
    { afterGesture: true },
  );
  assertBrowserAudioRuntime(
    audioGestureResult.state.browserAudioRuntime,
    "runtime archive state after audio gesture",
    { afterGesture: true },
  );
  assertAudioRuntimeAssets(audioGestureResult.state, "runtime archive boot after audio gesture");
  assertBrowserAudioMixerRuntime(
    audioGestureResult.state.browserAudioMixerRuntime,
    "runtime archive state before mixer volume update",
    { created: false, updates: 0 },
  );

  const mixerVolumePayload = {
    trigger: "runtime_archives_smoke.mjs source-shaped mixer volume update",
    scriptVolumes: {
      music: 0.8,
      sound: 0.6,
      sound3D: 0.5,
      speech: 0.9,
    },
    systemVolumes: {
      music: 0.25,
      sound: 0.5,
      sound3D: 0.75,
      speech: 0.4,
    },
    zoomVolume: 1,
  };
  const expectedMixerGains = {
    music: 0.2,
    sound: 0.3,
    sound3D: 0.375,
    speech: 0.36,
  };
  const mixerVolumeResult = await page.evaluate(
    (payload) => window.CnCPort.rpc("setBrowserAudioMixerVolumes", payload),
    mixerVolumePayload,
  );
  if (!mixerVolumeResult.ok) {
    throw new Error(`browser audio mixer volume RPC failed: ${JSON.stringify(mixerVolumeResult)}`);
  }
  assertBrowserAudioMixerRuntime(
    mixerVolumeResult.browserAudioMixerRuntime,
    "runtime archive mixer volume update",
    { afterVolumeUpdate: true, busGains: expectedMixerGains },
  );
  assertBrowserAudioMixerRuntime(
    mixerVolumeResult.state.browserAudioMixerRuntime,
    "runtime archive state after mixer volume update",
    { afterVolumeUpdate: true, busGains: expectedMixerGains },
  );
  assertBrowserAudioLiveEventRuntime(
    mixerVolumeResult.state.browserAudioLiveEventRuntime,
    "runtime archive state before live event playback",
    { ready: true, cacheEntries: 5, completed: 0 },
  );
  assertBrowserAudioRequestPathRuntime(
    mixerVolumeResult.state.browserAudioRequestPathRuntime,
    "runtime archive state before request path playback",
    { ready: true, cacheEntries: 5, completed: 0 },
  );
  const liveEventTarget = {
    cacheKey: "AudioEnglishZH.big|Data\\Audio\\Sounds\\English\\iciaatd.wav",
    eventName: "CIAAgentVoiceAttack",
    audioType: "AT_SoundEffect",
    requestManager: "SoundManager::addAudioEvent",
    queueFunction: "SoundManager::addAudioEvent",
    deviceStart: "playSample",
    playingType: "PAT_Sample",
    bus: "sound",
    releasePath: "processPlayingList -> releasePlayingAudio",
  };
  const requestPathTargets = [
    liveEventTarget,
    {
      cacheKey: "AudioZH.big|Data\\Audio\\Sounds\\gshescre.wav",
      eventName: "ArtilleryBarrageIncomingWhistle",
      audioType: "AT_SoundEffect",
      requestManager: "SoundManager::addAudioEvent",
      queueFunction: "SoundManager::addAudioEvent",
      deviceStart: "playSample3D",
      playingType: "PAT_3DSample",
      bus: "sound3D",
      releasePath: "processPlayingList -> releasePlayingAudio",
    },
    {
      cacheKey: "SpeechEnglishZH.big|Data\\Audio\\Speech\\English\\tairf066.wav",
      eventName: "Taunts_AirTrafficControl01",
      audioType: "AT_Streaming",
      requestManager: "SoundManager::addAudioEvent",
      queueFunction: "SoundManager::addAudioEvent",
      deviceStart: "playStream",
      playingType: "PAT_Stream",
      bus: "speech",
      releasePath: "processStoppedList -> releasePlayingAudio",
    },
  ];
  const liveEventResult = await page.evaluate(
    (payload) => window.CnCPort.rpc("playBrowserAudioRequestedEvent", payload),
    {
      cacheKey: liveEventTarget.cacheKey,
      durationSeconds: 0.05,
    },
  );
  if (!liveEventResult.ok) {
    throw new Error(`browser audio live event RPC failed: ${JSON.stringify(liveEventResult)}`);
  }
  assertBrowserAudioLiveEventRuntime(
    liveEventResult.browserAudioLiveEventRuntime,
    "runtime archive live requested audio event",
    { afterPlayback: true, ...liveEventTarget },
  );
  assertBrowserAudioLiveEventRuntime(
    liveEventResult.state.browserAudioLiveEventRuntime,
    "runtime archive state after live requested audio event",
    { afterPlayback: true, ...liveEventTarget },
  );
  assertAudioRuntimeAssets(liveEventResult.state, "runtime archive boot after live requested audio event");
  assertBrowserAudioRequestPathRuntime(
    liveEventResult.state.browserAudioRequestPathRuntime,
    "runtime archive state before source-shaped request path playback",
    { ready: true, cacheEntries: 5, completed: 0 },
  );

  let requestPathResult = null;
  for (const requestPathTarget of requestPathTargets) {
    requestPathResult = await page.evaluate(
      (payload) => window.CnCPort.rpc("playBrowserAudioRequestPathEvent", payload),
      {
        cacheKey: requestPathTarget.cacheKey,
        durationSeconds: 0.05,
      },
    );
    if (!requestPathResult.ok) {
      throw new Error(`browser audio request path RPC failed: ${JSON.stringify(requestPathResult)}`);
    }
    assertBrowserAudioRequestPathRuntime(
      requestPathResult.browserAudioRequestPathRuntime,
      `runtime archive source-shaped audio request path ${requestPathTarget.eventName}`,
      { afterPlayback: true, ...requestPathTarget },
    );
    assertBrowserAudioRequestPathRuntime(
      requestPathResult.state.browserAudioRequestPathRuntime,
      `runtime archive state after source-shaped audio request path ${requestPathTarget.eventName}`,
      { afterPlayback: true, ...requestPathTarget },
    );
  }
  assertBrowserAudioRequestPathRuntime(
    requestPathResult.browserAudioRequestPathRuntime,
    "runtime archive source-shaped audio request path coverage",
    {
      ready: true,
      cacheEntries: 5,
      completed: requestPathTargets.length,
      enqueued: requestPathTargets.length,
      drained: requestPathTargets.length,
      dispatched: requestPathTargets.length,
      started: requestPathTargets.length,
      released: requestPathTargets.length,
      coveredPlayingTypes: ["PAT_Sample", "PAT_3DSample", "PAT_Stream"],
      coveredDeviceStarts: ["playSample", "playSample3D", "playStream"],
      coveredAudioTypes: ["AT_SoundEffect", "AT_Streaming"],
      coveredBuses: ["sound", "sound3D", "speech"],
    },
  );
  assertAudioRuntimeAssets(requestPathResult.state, "runtime archive boot after source-shaped audio request path");

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archives: archiveSet.archives,
    probes: archiveSet.probes,
    archiveCount: archiveSet.archiveCount,
    totalBytes: archiveSet.totalBytes,
    optionalBaseArchives: availableOptionalBaseArchives.map((archive) => ({
      sourceName: archive.sourceName,
      mountName: archive.name,
      bytes: archive.bytes,
      description: archive.description,
    })),
    aggregateProbe: assetProbe,
    archiveMount,
    bootArchiveMount,
    startupAssets: bootResult.state.startupAssets,
    audioRuntimeAssets: bootResult.state.audioRuntimeAssets,
    browserAudioRuntime: audioGestureResult.browserAudioRuntime,
    browserAudioMixerRuntime: mixerVolumeResult.browserAudioMixerRuntime,
    browserAudioLiveEventRuntime: liveEventResult.browserAudioLiveEventRuntime,
    browserAudioRequestPathRuntime: requestPathResult.browserAudioRequestPathRuntime,
    audioPayloadInventory: bootResult.state.audioPayloadInventory,
    dataSummary: bootResult.state.dataSummary,
    originalEngineStartup: bootResult.state.originalEngineStartup,
    win32GameEngineProbe: win32GameEngineResult.probe,
    bootFrame: bootResult.state.frame,
    reader: "Win32BIGFileSystem",
    filesystem: "Emscripten MEMFS",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
