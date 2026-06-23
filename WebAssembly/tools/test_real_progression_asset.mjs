import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const progressionWasmPath = resolve(wasmDir, "dist/generals_progression.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, progressionWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(progressionWasmPath),
  readFile(archivePath),
]);
const [bigModule, progressionModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(progressionWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const progressionExports = progressionModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const progressionMemory = new Uint8Array(progressionExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readProgressionString(ptr, size) {
  return ptr ? textDecoder.decode(progressionMemory.slice(ptr, ptr + size)) : "";
}

function entryBytes(name) {
  for (let index = 0; index < fileCount; ++index) {
    const entryName = readBigString(
      bigExports.generals_big_entry_name_ptr(index),
      bigExports.generals_big_entry_name_size(index)
    );
    if (entryName === name) {
      const dataPtr = bigExports.generals_big_entry_data_ptr(index);
      const dataSize = bigExports.generals_big_entry_data_size(index);
      return bigMemory.slice(dataPtr, dataPtr + dataSize);
    }
  }

  throw new Error(`${name} not found in ${archivePath}`);
}

function parseProgressionPayload(bytes) {
  if (bytes.length > progressionExports.generals_progression_input_capacity()) {
    throw new Error(`progression payload exceeds ${progressionExports.generals_progression_input_capacity()} byte wasm buffer`);
  }

  progressionMemory.set(bytes, progressionExports.generals_progression_input_ptr());
  const parsedCount = progressionExports.generals_progression_parse(bytes.length);
  if (parsedCount < 0 || progressionExports.generals_progression_error_count() !== 0) {
    throw new Error(`progression parse failed: parsed=${parsedCount}, errors=${progressionExports.generals_progression_error_count()}`);
  }

  return parsedCount;
}

function recordString(kind, prefix, index) {
  return readProgressionString(
    progressionExports[`generals_progression_${kind}_${prefix}_ptr`](index),
    progressionExports[`generals_progression_${kind}_${prefix}_size`](index)
  );
}

function findUpgrade(name) {
  for (let index = 0; index < progressionExports.generals_progression_upgrade_count(); ++index) {
    if (recordString("upgrade", "name", index) === name) {
      return {
        index,
        name,
        displayName: recordString("upgrade", "display_name", index),
        type: recordString("upgrade", "type", index),
        buttonImage: recordString("upgrade", "button_image", index),
        researchSound: recordString("upgrade", "research_sound", index),
        academy: recordString("upgrade", "academy", index),
        buildTime: progressionExports.generals_progression_upgrade_build_time_x100(index),
        buildCost: progressionExports.generals_progression_upgrade_build_cost(index),
        fields: progressionExports.generals_progression_upgrade_field_count_at(index),
        line: progressionExports.generals_progression_upgrade_line(index),
      };
    }
  }
  return null;
}

function findSpecialPower(name) {
  for (let index = 0; index < progressionExports.generals_progression_special_power_count(); ++index) {
    if (recordString("special_power", "name", index) === name) {
      return {
        index,
        name,
        enumName: recordString("special_power", "enum", index),
        requiredScience: recordString("special_power", "required_science", index),
        academy: recordString("special_power", "academy", index),
        reloadTime: progressionExports.generals_progression_special_power_reload_time_ms(index),
        publicTimer: progressionExports.generals_progression_special_power_public_timer(index),
        sharedSyncedTimer: progressionExports.generals_progression_special_power_shared_synced_timer(index),
        viewObjectDuration: progressionExports.generals_progression_special_power_view_object_duration_ms(index),
        viewObjectRange: progressionExports.generals_progression_special_power_view_object_range_x100(index),
        radiusCursorRadius: progressionExports.generals_progression_special_power_radius_cursor_radius_x100(index),
        shortcutPower: progressionExports.generals_progression_special_power_shortcut_power(index),
        fields: progressionExports.generals_progression_special_power_field_count_at(index),
        line: progressionExports.generals_progression_special_power_line(index),
      };
    }
  }
  return null;
}

function findScience(name) {
  for (let index = 0; index < progressionExports.generals_progression_science_count(); ++index) {
    if (recordString("science", "name", index) === name) {
      return {
        index,
        name,
        prerequisites: recordString("science", "prerequisite_sciences", index),
        displayName: recordString("science", "display_name", index),
        description: recordString("science", "description", index),
        cost: progressionExports.generals_progression_science_purchase_point_cost(index),
        grantable: progressionExports.generals_progression_science_is_grantable(index),
        fields: progressionExports.generals_progression_science_field_count_at(index),
        line: progressionExports.generals_progression_science_line(index),
      };
    }
  }
  return null;
}

const upgradeBytes = entryBytes("data/ini/upgrade.ini");
const specialPowerBytes = entryBytes("data/ini/specialpower.ini");
const scienceBytes = entryBytes("data/ini/science.ini");

parseProgressionPayload(upgradeBytes);
const upgradeSummary = {
  upgradeCount: progressionExports.generals_progression_upgrade_count(),
  upgradeFieldCount: progressionExports.generals_progression_upgrade_field_count(),
  americaRadar: findUpgrade("Upgrade_AmericaRadar"),
};

parseProgressionPayload(specialPowerBytes);
const specialPowerSummary = {
  specialPowerCount: progressionExports.generals_progression_special_power_count(),
  specialPowerFieldCount: progressionExports.generals_progression_special_power_field_count(),
  daisyCutter: findSpecialPower("SuperweaponDaisyCutter"),
};

parseProgressionPayload(scienceBytes);
const scienceSummary = {
  scienceCount: progressionExports.generals_progression_science_count(),
  scienceFieldCount: progressionExports.generals_progression_science_field_count(),
  daisyCutterScience: findScience("SCIENCE_DaisyCutter"),
};

if (upgradeSummary.upgradeCount !== 81 ||
    upgradeSummary.upgradeFieldCount !== 422 ||
    !upgradeSummary.americaRadar ||
    upgradeSummary.americaRadar.displayName !== "UPGRADE:Radar" ||
    upgradeSummary.americaRadar.type !== "OBJECT" ||
    upgradeSummary.americaRadar.buildTime !== 1000 ||
    upgradeSummary.americaRadar.buildCost !== 500 ||
    upgradeSummary.americaRadar.buttonImage !== "SARadarUpgrade" ||
    upgradeSummary.americaRadar.researchSound !== "NoSound" ||
    upgradeSummary.americaRadar.academy !== "ACT_UPGRADE_RADAR" ||
    upgradeSummary.americaRadar.fields !== 7) {
  throw new Error(`unexpected upgrade parse: ${JSON.stringify(upgradeSummary)}`);
}

if (specialPowerSummary.specialPowerCount !== 79 ||
    specialPowerSummary.specialPowerFieldCount !== 538 ||
    !specialPowerSummary.daisyCutter ||
    specialPowerSummary.daisyCutter.enumName !== "SPECIAL_DAISY_CUTTER" ||
    specialPowerSummary.daisyCutter.requiredScience !== "SCIENCE_DaisyCutter" ||
    specialPowerSummary.daisyCutter.reloadTime !== 360000 ||
    specialPowerSummary.daisyCutter.publicTimer !== 0 ||
    specialPowerSummary.daisyCutter.sharedSyncedTimer !== 1 ||
    specialPowerSummary.daisyCutter.viewObjectDuration !== 30000 ||
    specialPowerSummary.daisyCutter.viewObjectRange !== 25000 ||
    specialPowerSummary.daisyCutter.radiusCursorRadius !== 17000 ||
    specialPowerSummary.daisyCutter.shortcutPower !== 1 ||
    specialPowerSummary.daisyCutter.academy !== "ACT_SUPERPOWER" ||
    specialPowerSummary.daisyCutter.fields !== 10) {
  throw new Error(`unexpected special power parse: ${JSON.stringify(specialPowerSummary)}`);
}

if (scienceSummary.scienceCount !== 95 ||
    scienceSummary.scienceFieldCount !== 451 ||
    !scienceSummary.daisyCutterScience ||
    scienceSummary.daisyCutterScience.prerequisites !== "SCIENCE_AMERICA SCIENCE_Rank5" ||
    scienceSummary.daisyCutterScience.cost !== 1 ||
    scienceSummary.daisyCutterScience.grantable !== 1 ||
    scienceSummary.daisyCutterScience.displayName !== "SCIENCE:USADaisyCutter" ||
    scienceSummary.daisyCutterScience.description !== "CONTROLBAR:ToolTipUSAScienceDaisyCutter" ||
    scienceSummary.daisyCutterScience.fields !== 5) {
  throw new Error(`unexpected science parse: ${JSON.stringify(scienceSummary)}`);
}

console.log(JSON.stringify({
  archive: archivePath,
  upgradeBytes: upgradeBytes.length,
  specialPowerBytes: specialPowerBytes.length,
  scienceBytes: scienceBytes.length,
  ...upgradeSummary,
  ...specialPowerSummary,
  ...scienceSummary,
}, null, 2));
