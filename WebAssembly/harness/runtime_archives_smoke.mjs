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
        || !startupAssets.required?.science
        || !startupAssets.required?.weapon
        || !startupAssets.required?.particleSystem
        || !startupAssets.required?.aiData
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
      || !assetProbe.inizh?.damageFXIni
      || !assetProbe.inizh?.commandButtonIni
      || !assetProbe.inizh?.commandSetIni
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
      || !assetProbe.inizh?.weaponIni
      || !assetProbe.inizh?.particleSystemIni) {
    throw new Error(`aggregate runtime archive probe missed required INIZH files: ${JSON.stringify(assetProbe)}`);
  }
  assertGameTextProbe(assetProbe, "aggregate runtime archive probe");
  assertArmorProbe(assetProbe, "aggregate runtime archive probe");
  assertDamageFXProbe(assetProbe, "aggregate runtime archive probe");
  assertWeaponProbe(assetProbe, "aggregate runtime archive probe");
  assertAIDataProbe(assetProbe, "aggregate runtime archive probe");
  assertScienceProbe(assetProbe, "aggregate runtime archive probe");
  assertUpgradeProbe(assetProbe, "aggregate runtime archive probe");
  assertCommandButtonProbe(assetProbe, "aggregate runtime archive probe");
  assertCommandSetProbe(assetProbe, "aggregate runtime archive probe");
  assertControlBarSchemeProbe(assetProbe, "aggregate runtime archive probe");
  assertCrateProbe(assetProbe, "aggregate runtime archive probe");
  assertDrawGroupInfoProbeAbsent(assetProbe, "aggregate runtime archive probe");
  assertMappedImageProbe(assetProbe, "aggregate runtime archive probe");
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
  assertDamageFXProbe(bootResult.state.assetProbe, "boot asset probe");
  assertWeaponProbe(bootResult.state.assetProbe, "boot asset probe");
  assertAIDataProbe(bootResult.state.assetProbe, "boot asset probe");
  assertScienceProbe(bootResult.state.assetProbe, "boot asset probe");
  assertUpgradeProbe(bootResult.state.assetProbe, "boot asset probe");
  assertCommandButtonProbe(bootResult.state.assetProbe, "boot asset probe");
  assertCommandSetProbe(bootResult.state.assetProbe, "boot asset probe");
  assertControlBarSchemeProbe(bootResult.state.assetProbe, "boot asset probe");
  assertCrateProbe(bootResult.state.assetProbe, "boot asset probe");
  assertDrawGroupInfoProbeAbsent(bootResult.state.assetProbe, "boot asset probe");
  assertMappedImageProbe(bootResult.state.assetProbe, "boot asset probe");
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
