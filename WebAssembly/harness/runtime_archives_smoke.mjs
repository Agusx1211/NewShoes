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
        || !startupAssets.required?.water
        || !startupAssets.required?.weather
        || !startupAssets.required?.video
        || !startupAssets.required?.gameText
        || !startupAssets.required?.mapCache)) {
    throw new Error(`${context} startup asset requirements incomplete: ${JSON.stringify(startupAssets)}`);
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
  expectedOriginalSetupReady = false,
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
    ? "CreateGameEngine"
    : expectedStatus === "missing_startup_files"
      ? "startupFiles"
      : "startupAssets";
  const frontier = startup.deviceFactoryFrontier;
  const entries = frontier?.entries ?? [];
  const byFactory = new Map(entries.map((entry) => [entry.factory, entry]));
  const audioFiles = frontier?.audioStartupFiles;
  if (!frontier
      || frontier.probeOnly !== true
      || frontier.ready !== false
      || frontier.nextRequired !== expectedNextRequired
      || frontier.firstUnownedInitFactory !== "createAudioManager"
      || frontier.firstUnownedInitLine !== 434
      || audioFiles?.source !== "GameAudio.cpp::AudioManager::init"
      || audioFiles?.ready !== false
      || audioFiles?.audioSettingsIni !== false
      || audioFiles?.defaultMusicIni !== false
      || audioFiles?.musicIni !== true
      || audioFiles?.defaultSoundEffectsIni !== true
      || audioFiles?.soundEffectsIni !== true
      || audioFiles?.defaultSpeechIni !== false
      || audioFiles?.speechIni !== true
      || audioFiles?.defaultVoiceIni !== false
      || audioFiles?.voiceIni !== true
      || audioFiles?.miscAudioIni !== true
      || frontier.fileSystemReady !== (expectedFileSystemReadiness.local && expectedFileSystemReadiness.archive)
      || frontier.startupFilesReady !== (expectedStatus === "browser_device_layer_pending")
      || frontier.setupReady !== expectedOriginalSetupReady
      || frontier.factoryMappings?.CreateGameEngine !== "Win32GameEngine"
      || frontier.factoryMappings?.createAudioManager !== "MilesAudioManager"
      || frontier.factoryMappings?.createGameClient !== "W3DGameClient"
      || frontier.factoryMappings?.createLocalFileSystem !== "Win32LocalFileSystem"
      || frontier.factoryMappings?.createArchiveFileSystem !== "Win32BIGFileSystem"
      || byFactory.get("CreateGameEngine")?.line !== 1122
      || byFactory.get("createLocalFileSystem")?.line !== 342
      || byFactory.get("createArchiveFileSystem")?.line !== 353
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
      || startup.browserDeviceLayer?.createGameEngine !== false
      || startup.browserDeviceLayer?.browserGameEngine !== false
      || startup.originalSetup?.probeOnly !== true
      || startup.originalSetup?.runtimeOwned !== false
      || startup.originalSetup?.globalData !== expectedOriginalSetupReady
      || startup.originalSetup?.commandLine !== expectedOriginalSetupReady
      || startup.originalSetup?.cdManager !== expectedOriginalSetupReady
      || startup.browserDeviceLayer?.cdManager !== expectedOriginalSetupReady
      || startup.browserDeviceLayer?.localFileSystem !== expectedFileSystemReadiness.local
      || startup.browserDeviceLayer?.archiveFileSystem !== expectedFileSystemReadiness.archive
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
    true,
  );
  const files = state.originalEngineStartup.startupFiles;
  const missing = new Set(files?.missing ?? []);
  const expectedMissing = [
    "Data\\INI\\Default\\GameData.ini",
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
  assertFileSystemProbe(bootResult.state, "runtime archive boot");
  assertDataSummary(bootResult.state, "runtime archive boot", true);
  if (hasBaseIniArchive) {
    assertOriginalEngineStartupWithBaseIni(bootResult.state, "runtime archive boot");
  } else {
    assertOriginalEngineStartupMissingFiles(bootResult.state, "runtime archive boot");
  }

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
    dataSummary: bootResult.state.dataSummary,
    originalEngineStartup: bootResult.state.originalEngineStartup,
    bootFrame: bootResult.state.frame,
    reader: "Win32BIGFileSystem",
    filesystem: "Emscripten MEMFS",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
