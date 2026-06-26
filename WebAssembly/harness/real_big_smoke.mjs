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
      || !assetProbe.inizh?.damageFXIni
      || !assetProbe.inizh?.fxListIni
      || !assetProbe.inizh?.objectCreationListIni
      || !assetProbe.inizh?.commandButtonIni
      || !assetProbe.inizh?.commandSetIni
      || !assetProbe.inizh?.controlBarSchemeIni
      || !assetProbe.inizh?.defaultControlBarSchemeIni
      || !assetProbe.inizh?.crateIni
      || !assetProbe.inizh?.playerTemplateIni
      || !assetProbe.inizh?.multiplayerIni
      || !assetProbe.inizh?.scienceIni
      || !assetProbe.inizh?.specialPowerIni
      || !assetProbe.inizh?.terrainIni
      || !assetProbe.inizh?.roadsIni
      || !assetProbe.inizh?.upgradeIni
      || !assetProbe.inizh?.defaultAIDataIni
      || !assetProbe.inizh?.locomotorIni
      || !assetProbe.inizh?.weaponIni
      || !assetProbe.inizh?.particleSystemIni) {
    throw new Error(`cnc-port INIZH probe missed required files: ${JSON.stringify(assetProbe)}`);
  }
  assertGameDataProbe(assetProbe, "cnc-port INIZH probe");
  assertArmorProbe(assetProbe, "cnc-port INIZH probe");
  assertDamageFXProbe(assetProbe, "cnc-port INIZH probe");
  assertFXListProbe(assetProbe, "cnc-port INIZH probe");
  assertObjectCreationListProbe(assetProbe, "cnc-port INIZH probe");
  assertWeaponProbe(assetProbe, "cnc-port INIZH probe");
  assertAIDataProbe(assetProbe, "cnc-port INIZH probe");
  assertLocomotorProbe(assetProbe, "cnc-port INIZH probe");
  assertUpgradeProbe(assetProbe, "cnc-port INIZH probe");
  assertCommandButtonProbe(assetProbe, "cnc-port INIZH probe");
  assertCommandSetProbe(assetProbe, "cnc-port INIZH probe");
  assertControlBarSchemeProbe(assetProbe, "cnc-port INIZH probe");
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
