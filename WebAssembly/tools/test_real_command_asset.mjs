import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const commandWasmPath = resolve(wasmDir, "dist/generals_command.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, commandWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(commandWasmPath),
  readFile(archivePath),
]);
const [bigModule, commandModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(commandWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const commandExports = commandModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const commandMemory = new Uint8Array(commandExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function bigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function commandString(ptr, size) {
  return ptr ? textDecoder.decode(commandMemory.slice(ptr, ptr + size)) : "";
}

function entryBytes(name) {
  for (let index = 0; index < fileCount; ++index) {
    const entryName = bigString(
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

function buttonString(prefix, index) {
  return commandString(
    commandExports[`generals_command_button_${prefix}_ptr`](index),
    commandExports[`generals_command_button_${prefix}_size`](index)
  );
}

function setName(index) {
  return commandString(
    commandExports.generals_command_set_name_ptr(index),
    commandExports.generals_command_set_name_size(index)
  );
}

function entryButton(index) {
  return commandString(
    commandExports.generals_command_set_entry_button_ptr(index),
    commandExports.generals_command_set_entry_button_size(index)
  );
}

function parseCommandPayload(bytes) {
  if (bytes.length > commandExports.generals_command_input_capacity()) {
    throw new Error(`command payload exceeds ${commandExports.generals_command_input_capacity()} byte wasm buffer`);
  }

  commandMemory.set(bytes, commandExports.generals_command_input_ptr());
  const parsedCount = commandExports.generals_command_parse(bytes.length);
  if (parsedCount < 0 || commandExports.generals_command_error_count() !== 0) {
    throw new Error(`command parse failed: parsed=${parsedCount}, errors=${commandExports.generals_command_error_count()}`);
  }

  return parsedCount;
}

function findButton(name) {
  for (let index = 0; index < commandExports.generals_command_button_count(); ++index) {
    if (buttonString("name", index) === name) {
      return {
        index,
        name,
        command: buttonString("command", index),
        object: buttonString("object", index),
        options: buttonString("options", index),
        textLabel: buttonString("text_label", index),
        buttonImage: buttonString("button_image", index),
        border: buttonString("button_border_type", index),
        description: buttonString("descript_label", index),
        fields: commandExports.generals_command_button_field_count_at(index),
        line: commandExports.generals_command_button_line(index),
      };
    }
  }

  return null;
}

function findCommandSet(name) {
  for (let index = 0; index < commandExports.generals_command_set_count(); ++index) {
    if (setName(index) === name) {
      const firstEntry = commandExports.generals_command_set_first_entry(index);
      const entryCount = commandExports.generals_command_set_entry_count_at(index);
      const entries = [];
      for (let offset = 0; offset < entryCount; ++offset) {
        const entryIndex = firstEntry + offset;
        entries.push({
          slot: commandExports.generals_command_set_entry_slot(entryIndex),
          button: entryButton(entryIndex),
        });
      }

      return {
        index,
        name,
        line: commandExports.generals_command_set_line(index),
        entries,
      };
    }
  }

  return null;
}

const commandButtonBytes = entryBytes("data/ini/commandbutton.ini");
const commandSetBytes = entryBytes("data/ini/commandset.ini");

parseCommandPayload(commandButtonBytes);
const firstButton = findButton("Command_PlaceBeacon");
const buildPowerPlant = findButton("Command_ConstructAmericaPowerPlant");
const buttonSummary = {
  buttonCount: commandExports.generals_command_button_count(),
  buttonFieldCount: commandExports.generals_command_button_field_count(),
  firstButton,
  buildPowerPlant,
};

parseCommandPayload(commandSetBytes);
const humveeSet = findCommandSet("AmericaVehicleHumveeCommandSet");
const americaDozerSet = findCommandSet("AmericaDozerCommandSet");
const setSummary = {
  commandSetCount: commandExports.generals_command_set_count(),
  commandSetEntryCount: commandExports.generals_command_set_entry_count(),
  humveeSet,
  americaDozerSet,
};

if (buttonSummary.buttonCount !== 816 || buttonSummary.buttonFieldCount !== 5219) {
  throw new Error(`unexpected command button counts: ${JSON.stringify(buttonSummary)}`);
}

if (!firstButton ||
    firstButton.command !== "PLACE_BEACON" ||
    firstButton.options !== "NEED_TARGET_POS" ||
    firstButton.fields !== 4) {
  throw new Error(`unexpected first command button: ${JSON.stringify(firstButton)}`);
}

if (!buildPowerPlant ||
    buildPowerPlant.command !== "DOZER_CONSTRUCT" ||
    buildPowerPlant.object !== "AmericaPowerPlant" ||
    buildPowerPlant.textLabel !== "CONTROLBAR:ConstructAmericaPowerPlant" ||
    buildPowerPlant.buttonImage !== "SAPowerPlant" ||
    buildPowerPlant.border !== "BUILD" ||
    buildPowerPlant.description !== "CONTROLBAR:ToolTipUSABuildPowerPlant" ||
    buildPowerPlant.fields !== 6) {
  throw new Error(`unexpected America power plant button: ${JSON.stringify(buildPowerPlant)}`);
}

if (setSummary.commandSetCount !== 471 || setSummary.commandSetEntryCount !== 3095) {
  throw new Error(`unexpected command set counts: ${JSON.stringify(setSummary)}`);
}

if (!humveeSet ||
    humveeSet.entries.length !== 12 ||
    humveeSet.entries[0].slot !== 1 ||
    humveeSet.entries[0].button !== "Command_ConstructAmericaVehicleBattleDrone" ||
    humveeSet.entries.at(-1).slot !== 14 ||
    humveeSet.entries.at(-1).button !== "Command_Stop") {
  throw new Error(`unexpected Humvee command set: ${JSON.stringify(humveeSet)}`);
}

if (!americaDozerSet ||
    americaDozerSet.entries.length !== 12 ||
    americaDozerSet.entries[0].slot !== 1 ||
    americaDozerSet.entries[0].button !== "Command_ConstructAmericaPowerPlant" ||
    americaDozerSet.entries.at(-1).slot !== 14 ||
    americaDozerSet.entries.at(-1).button !== "Command_DisarmMinesAtPosition") {
  throw new Error(`unexpected America dozer command set: ${JSON.stringify(americaDozerSet)}`);
}

console.log(JSON.stringify({
  archive: archivePath,
  commandButtonBytes: commandButtonBytes.length,
  commandSetBytes: commandSetBytes.length,
  ...buttonSummary,
  ...setSummary,
}, null, 2));
