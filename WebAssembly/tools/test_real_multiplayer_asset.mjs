import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const multiplayerWasmPath = resolve(wasmDir, "dist/generals_multiplayer.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, multiplayerWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(multiplayerWasmPath),
  readFile(archivePath),
]);
const [bigModule, multiplayerModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(multiplayerWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const multiplayerExports = multiplayerModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const multiplayerMemory = new Uint8Array(multiplayerExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readMultiplayerString(ptr, size) {
  return ptr ? textDecoder.decode(multiplayerMemory.slice(ptr, ptr + size)) : "";
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

const multiplayerBytes = entryBytes("data/ini/multiplayer.ini");
if (multiplayerBytes.length > multiplayerExports.generals_multiplayer_input_capacity()) {
  throw new Error(`Multiplayer payload exceeds ${multiplayerExports.generals_multiplayer_input_capacity()} byte wasm buffer`);
}

multiplayerMemory.set(multiplayerBytes, multiplayerExports.generals_multiplayer_input_ptr());
const parsedCount = multiplayerExports.generals_multiplayer_parse(multiplayerBytes.length);
if (parsedCount < 0 || multiplayerExports.generals_multiplayer_error_count() !== 0) {
  throw new Error(`Multiplayer parse failed: parsed=${parsedCount}, errors=${multiplayerExports.generals_multiplayer_error_count()}`);
}

function chatColorSummary(index) {
  return {
    index,
    name: readMultiplayerString(
      multiplayerExports.generals_multiplayer_chat_color_name_ptr(index),
      multiplayerExports.generals_multiplayer_chat_color_name_size(index)
    ),
    color: [
      multiplayerExports.generals_multiplayer_chat_color_r(index),
      multiplayerExports.generals_multiplayer_chat_color_g(index),
      multiplayerExports.generals_multiplayer_chat_color_b(index),
    ],
    line: multiplayerExports.generals_multiplayer_chat_color_line(index),
  };
}

function colorSummary(index) {
  return {
    index,
    name: readMultiplayerString(
      multiplayerExports.generals_multiplayer_color_name_ptr(index),
      multiplayerExports.generals_multiplayer_color_name_size(index)
    ),
    tooltip: readMultiplayerString(
      multiplayerExports.generals_multiplayer_color_tooltip_ptr(index),
      multiplayerExports.generals_multiplayer_color_tooltip_size(index)
    ),
    color: [
      multiplayerExports.generals_multiplayer_color_r(index),
      multiplayerExports.generals_multiplayer_color_g(index),
      multiplayerExports.generals_multiplayer_color_b(index),
    ],
    nightColor: [
      multiplayerExports.generals_multiplayer_color_night_r(index),
      multiplayerExports.generals_multiplayer_color_night_g(index),
      multiplayerExports.generals_multiplayer_color_night_b(index),
    ],
    line: multiplayerExports.generals_multiplayer_color_line(index),
    fields: multiplayerExports.generals_multiplayer_color_field_count_at(index),
  };
}

function moneySummary(index) {
  return {
    index,
    value: multiplayerExports.generals_multiplayer_money_value(index),
    default: multiplayerExports.generals_multiplayer_money_is_default(index),
    line: multiplayerExports.generals_multiplayer_money_line(index),
    fields: multiplayerExports.generals_multiplayer_money_field_count_at(index),
  };
}

function findChatColor(name) {
  for (let index = 0; index < multiplayerExports.generals_multiplayer_chat_color_count(); ++index) {
    const color = chatColorSummary(index);
    if (color.name === name) {
      return color;
    }
  }

  throw new Error(`chat color not found: ${name}`);
}

function findColor(name) {
  for (let index = 0; index < multiplayerExports.generals_multiplayer_color_count(); ++index) {
    const color = colorSummary(index);
    if (color.name === name) {
      return color;
    }
  }

  throw new Error(`multiplayer color not found: ${name}`);
}

const moneyChoices = [];
for (let index = 0; index < multiplayerExports.generals_multiplayer_money_choice_count(); ++index) {
  moneyChoices.push(moneySummary(index));
}

const summary = {
  archive: archivePath,
  multiplayerBytes: multiplayerBytes.length,
  parsedCount,
  fieldCount: multiplayerExports.generals_multiplayer_field_count(),
  lineCount: multiplayerExports.generals_multiplayer_line_count(),
  settings: {
    fields: multiplayerExports.generals_multiplayer_settings_field_count(),
    startCountdownTimer: multiplayerExports.generals_multiplayer_start_countdown_timer(),
    maxBeaconsPerPlayer: multiplayerExports.generals_multiplayer_max_beacons_per_player(),
    useShroud: multiplayerExports.generals_multiplayer_use_shroud(),
    showRandomPlayerTemplate: multiplayerExports.generals_multiplayer_show_random_player_template(),
    showRandomStartPos: multiplayerExports.generals_multiplayer_show_random_start_pos(),
    showRandomColor: multiplayerExports.generals_multiplayer_show_random_color(),
  },
  chatColorCount: multiplayerExports.generals_multiplayer_chat_color_count(),
  colorCount: multiplayerExports.generals_multiplayer_color_count(),
  moneyChoiceCount: multiplayerExports.generals_multiplayer_money_choice_count(),
  defaultStartingMoney: multiplayerExports.generals_multiplayer_default_starting_money(),
  chatDefault: findChatColor("Default"),
  chatSelf: findChatColor("ChatSelf"),
  mapSelected: findChatColor("MapSelected"),
  gold: findColor("ColorGold"),
  purple: findColor("ColorPurple"),
  pink: findColor("ColorPink"),
  moneyChoices,
};

if (summary.multiplayerBytes !== 2638 ||
    summary.parsedCount !== 14 ||
    summary.fieldCount !== 62 ||
    summary.lineCount !== 108 ||
    summary.settings.fields !== 6 ||
    summary.chatColorCount !== 27 ||
    summary.colorCount !== 8 ||
    summary.moneyChoiceCount !== 4 ||
    summary.defaultStartingMoney !== 10000) {
  throw new Error(`unexpected Multiplayer aggregate parse: ${JSON.stringify(summary)}`);
}

if (summary.settings.startCountdownTimer !== 5 ||
    summary.settings.maxBeaconsPerPlayer !== 3 ||
    summary.settings.useShroud !== 0 ||
    summary.settings.showRandomPlayerTemplate !== 1 ||
    summary.settings.showRandomStartPos !== 1 ||
    summary.settings.showRandomColor !== 1) {
  throw new Error(`unexpected Multiplayer settings parse: ${JSON.stringify(summary)}`);
}

if (summary.chatDefault.line !== 6 ||
    summary.chatDefault.color.join("/") !== "255/255/255" ||
    summary.chatSelf.color.join("/") !== "255/128/0" ||
    summary.mapSelected.color.join("/") !== "255/255/0" ||
    summary.gold.tooltip !== "Color:Gold" ||
    summary.gold.color.join("/") !== "221/226/13" ||
    summary.gold.nightColor.join("/") !== "221/226/13" ||
    summary.gold.line !== 44 ||
    summary.purple.tooltip !== "Color:Purple" ||
    summary.purple.color.join("/") !== "150/0/200" ||
    summary.purple.nightColor.join("/") !== "223/0/156" ||
    summary.purple.line !== 80 ||
    summary.pink.color.join("/") !== "255/150/255" ||
    summary.pink.nightColor.join("/") !== "255/130/248" ||
    summary.pink.line !== 86) {
  throw new Error(`unexpected Multiplayer color parse: ${JSON.stringify(summary)}`);
}

if (summary.moneyChoices.length !== 4 ||
    summary.moneyChoices[0].value !== 5000 ||
    summary.moneyChoices[0].default !== 0 ||
    summary.moneyChoices[0].fields !== 1 ||
    summary.moneyChoices[1].value !== 10000 ||
    summary.moneyChoices[1].default !== 1 ||
    summary.moneyChoices[1].fields !== 2 ||
    summary.moneyChoices[2].value !== 20000 ||
    summary.moneyChoices[3].value !== 50000) {
  throw new Error(`unexpected Multiplayer money parse: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary, null, 2));
