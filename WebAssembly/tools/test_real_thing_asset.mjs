import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const thingWasmPath = resolve(wasmDir, "dist/generals_thing.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, thingWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(thingWasmPath),
  readFile(archivePath),
]);
const [bigModule, thingModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(thingWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const thingExports = thingModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const thingMemory = new Uint8Array(thingExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);
const objectEntries = [];

for (let index = 0; index < fileCount; ++index) {
  const namePtr = bigExports.generals_big_entry_name_ptr(index);
  const nameSize = bigExports.generals_big_entry_name_size(index);
  const name = textDecoder.decode(bigMemory.slice(namePtr, namePtr + nameSize));
  if (name === "data/ini/default/object.ini" || name.startsWith("data/ini/object/")) {
    objectEntries.push({
      name,
      dataPtr: bigExports.generals_big_entry_data_ptr(index),
      dataSize: bigExports.generals_big_entry_data_size(index),
    });
  }
}

function readThingString(ptr, size) {
  return ptr ? textDecoder.decode(thingMemory.slice(ptr, ptr + size)) : "";
}

function templateName(index) {
  return readThingString(
    thingExports.generals_thing_template_name_ptr(index),
    thingExports.generals_thing_template_name_size(index)
  );
}

function templateString(prefix, index) {
  return readThingString(
    thingExports[`generals_thing_template_${prefix}_ptr`](index),
    thingExports[`generals_thing_template_${prefix}_size`](index)
  );
}

function weaponSetString(prefix, index) {
  return readThingString(
    thingExports[`generals_thing_weapon_set_${prefix}_ptr`](index),
    thingExports[`generals_thing_weapon_set_${prefix}_size`](index)
  );
}

function armorSetString(prefix, index) {
  return readThingString(
    thingExports[`generals_thing_armor_set_${prefix}_ptr`](index),
    thingExports[`generals_thing_armor_set_${prefix}_size`](index)
  );
}

let totalTemplates = 0;
let totalFields = 0;
let totalArmorSets = 0;
let totalWeaponSets = 0;
let totalModules = 0;
let humvee = null;
const preview = [];

for (const entry of objectEntries) {
  if (entry.dataSize > thingExports.generals_thing_input_capacity()) {
    throw new Error(`${entry.name} exceeds thing wasm input capacity`);
  }

  thingMemory.set(bigMemory.slice(entry.dataPtr, entry.dataPtr + entry.dataSize), thingExports.generals_thing_input_ptr());
  const parsedCount = thingExports.generals_thing_parse(entry.dataSize);

  if (parsedCount < 0 || thingExports.generals_thing_error_count() !== 0) {
    throw new Error(`thing parse failed for ${entry.name}: templates=${parsedCount}, errors=${thingExports.generals_thing_error_count()}`);
  }

  totalTemplates += parsedCount;
  totalFields += thingExports.generals_thing_field_count();
  totalArmorSets += thingExports.generals_thing_armor_set_count();
  totalWeaponSets += thingExports.generals_thing_weapon_set_count();
  totalModules += thingExports.generals_thing_module_count();

  if (parsedCount > 0 && preview.length < 8) {
    preview.push({
      file: entry.name,
      first: templateName(0),
      templates: parsedCount,
      armorSets: thingExports.generals_thing_armor_set_count(),
      weaponSets: thingExports.generals_thing_weapon_set_count(),
    });
  }

  for (let index = 0; index < parsedCount; ++index) {
    if (templateName(index) === "AmericaVehicleHumvee") {
      const firstWeaponSet = thingExports.generals_thing_template_first_weapon_set(index);
      const firstArmorSet = thingExports.generals_thing_template_first_armor_set(index);
      humvee = {
        file: entry.name,
        index,
        displayName: templateString("display_name", index),
        side: templateString("side", index),
        editorSorting: templateString("editor_sorting", index),
        commandSet: templateString("command_set", index),
        buildCost: thingExports.generals_thing_template_build_cost(index),
        buildTime: thingExports.generals_thing_template_build_time_x100(index),
        visionRange: thingExports.generals_thing_template_vision_range_x100(index),
        shroudClearingRange: thingExports.generals_thing_template_shroud_clearing_range_x100(index),
        transportSlotCount: thingExports.generals_thing_template_transport_slot_count(index),
        kindFlags: thingExports.generals_thing_template_kind_flags(index),
        weaponSetCount: thingExports.generals_thing_template_weapon_set_count(index),
        armorSetCount: thingExports.generals_thing_template_armor_set_count(index),
        primaryWeapon: weaponSetString("primary", firstWeaponSet),
        upgradedSecondaryWeapon: weaponSetString("secondary", firstWeaponSet + 1),
        armor: armorSetString("armor", firstArmorSet),
      };
    }
  }
}

if (objectEntries.length !== 44) {
  throw new Error(`expected 44 object INI entries, got ${objectEntries.length}`);
}

if (totalTemplates !== 1864) {
  throw new Error(`expected 1864 thing templates, got ${totalTemplates}`);
}

if (totalFields !== 47261 ||
    totalArmorSets !== 1367 ||
    totalWeaponSets !== 861 ||
    totalModules !== 16436) {
  throw new Error(`unexpected thing aggregate counts: fields=${totalFields}, armorSets=${totalArmorSets}, weaponSets=${totalWeaponSets}, modules=${totalModules}`);
}

if (!humvee) {
  throw new Error("AmericaVehicleHumvee was not parsed");
}

if (humvee.displayName !== "OBJECT:Humvee" ||
    humvee.side !== "America" ||
    humvee.editorSorting !== "VEHICLE" ||
    humvee.commandSet !== "AmericaVehicleHumveeCommandSet" ||
    humvee.buildCost !== 700 ||
    humvee.buildTime !== 1000 ||
    humvee.visionRange !== 15000 ||
    humvee.shroudClearingRange !== 32000 ||
    humvee.transportSlotCount !== 3 ||
    humvee.weaponSetCount !== 2 ||
    humvee.armorSetCount !== 1 ||
    humvee.primaryWeapon !== "HumveeGun" ||
    humvee.upgradedSecondaryWeapon !== "HumveeMissileWeapon" ||
    humvee.armor !== "HumveeArmor") {
  throw new Error(`unexpected Humvee object parse: ${JSON.stringify(humvee)}`);
}

const requiredKindFlags = (1 << 0) | (1 << 1) | (1 << 4);
if ((humvee.kindFlags & requiredKindFlags) !== requiredKindFlags) {
  throw new Error(`Humvee is missing expected kind flags: ${humvee.kindFlags}`);
}

console.log(JSON.stringify({
  archive: archivePath,
  objectEntries: objectEntries.length,
  totalTemplates,
  totalFields,
  totalArmorSets,
  totalWeaponSets,
  totalModules,
  humvee,
  preview,
}, null, 2));
