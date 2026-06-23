import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const controlbarWasmPath = resolve(wasmDir, "dist/generals_controlbar.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, controlbarWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(controlbarWasmPath),
  readFile(archivePath),
]);
const [bigModule, controlbarModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(controlbarWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const controlbarExports = controlbarModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const controlbarMemory = new Uint8Array(controlbarExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readControlbarString(ptr, size) {
  return ptr ? textDecoder.decode(controlbarMemory.slice(ptr, ptr + size)) : "";
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

const defaultBytes = entryBytes("data/ini/default/controlbarscheme.ini");
const mainBytes = entryBytes("data/ini/controlbarscheme.ini");
const combinedBytes = new Uint8Array(defaultBytes.length + 1 + mainBytes.length);
combinedBytes.set(defaultBytes, 0);
combinedBytes[defaultBytes.length] = 10;
combinedBytes.set(mainBytes, defaultBytes.length + 1);

if (combinedBytes.length > controlbarExports.generals_controlbar_input_capacity()) {
  throw new Error(`ControlBarScheme payload exceeds ${controlbarExports.generals_controlbar_input_capacity()} byte wasm buffer`);
}

controlbarMemory.set(combinedBytes, controlbarExports.generals_controlbar_input_ptr());
const parsedCount = controlbarExports.generals_controlbar_parse(combinedBytes.length);
if (parsedCount < 0 || controlbarExports.generals_controlbar_error_count() !== 0) {
  throw new Error(`ControlBarScheme parse failed: parsed=${parsedCount}, errors=${controlbarExports.generals_controlbar_error_count()}`);
}

function stringField(prefix, index) {
  return readControlbarString(
    controlbarExports[`generals_controlbar_scheme_${prefix}_ptr`](index),
    controlbarExports[`generals_controlbar_scheme_${prefix}_size`](index)
  );
}

function imageName(index) {
  return readControlbarString(
    controlbarExports.generals_controlbar_image_part_name_ptr(index),
    controlbarExports.generals_controlbar_image_part_name_size(index)
  );
}

function schemeSummary(index) {
  const firstImage = controlbarExports.generals_controlbar_scheme_first_image(index);
  return {
    index,
    name: stringField("name", index),
    side: stringField("side", index),
    queueButtonImage: stringField("queue_button_image", index),
    rightHudImage: stringField("right_hud_image", index),
    commandMarkerImage: stringField("command_marker_image", index),
    expBarForegroundImage: stringField("exp_bar_foreground_image", index),
    powerPurchaseImage: stringField("power_purchase_image", index),
    genArrowImage: stringField("gen_arrow_image", index),
    line: controlbarExports.generals_controlbar_scheme_line(index),
    fields: controlbarExports.generals_controlbar_scheme_field_count_at(index),
    screen: [
      controlbarExports.generals_controlbar_scheme_screen_creation_res_x(index),
      controlbarExports.generals_controlbar_scheme_screen_creation_res_y(index),
    ],
    commandBorder: [
      controlbarExports.generals_controlbar_scheme_command_bar_border_color_r(index),
      controlbarExports.generals_controlbar_scheme_command_bar_border_color_g(index),
      controlbarExports.generals_controlbar_scheme_command_bar_border_color_b(index),
      controlbarExports.generals_controlbar_scheme_command_bar_border_color_a(index),
    ],
    buildClock: [
      controlbarExports.generals_controlbar_scheme_build_up_clock_color_r(index),
      controlbarExports.generals_controlbar_scheme_build_up_clock_color_g(index),
      controlbarExports.generals_controlbar_scheme_build_up_clock_color_b(index),
      controlbarExports.generals_controlbar_scheme_build_up_clock_color_a(index),
    ],
    powerBarUl: [
      controlbarExports.generals_controlbar_scheme_power_bar_ul_x(index),
      controlbarExports.generals_controlbar_scheme_power_bar_ul_y(index),
    ],
    powerBarLr: [
      controlbarExports.generals_controlbar_scheme_power_bar_lr_x(index),
      controlbarExports.generals_controlbar_scheme_power_bar_lr_y(index),
    ],
    moneyUl: [
      controlbarExports.generals_controlbar_scheme_money_ul_x(index),
      controlbarExports.generals_controlbar_scheme_money_ul_y(index),
    ],
    moneyLr: [
      controlbarExports.generals_controlbar_scheme_money_lr_x(index),
      controlbarExports.generals_controlbar_scheme_money_lr_y(index),
    ],
    imageCount: controlbarExports.generals_controlbar_scheme_image_count_at(index),
    animationCount: controlbarExports.generals_controlbar_scheme_animation_count_at(index),
    firstImage,
    firstImageName: firstImage >= 0 ? imageName(firstImage) : "",
    firstImagePosition: firstImage >= 0 ? [
      controlbarExports.generals_controlbar_image_part_position_x(firstImage),
      controlbarExports.generals_controlbar_image_part_position_y(firstImage),
    ] : [0, 0],
    firstImageSize: firstImage >= 0 ? [
      controlbarExports.generals_controlbar_image_part_size_x(firstImage),
      controlbarExports.generals_controlbar_image_part_size_y(firstImage),
    ] : [0, 0],
    firstImageLayer: firstImage >= 0 ? controlbarExports.generals_controlbar_image_part_layer(firstImage) : -1,
  };
}

function findScheme(name) {
  for (let index = 0; index < controlbarExports.generals_controlbar_scheme_count(); ++index) {
    const scheme = schemeSummary(index);
    if (scheme.name === name) {
      return scheme;
    }
  }

  throw new Error(`ControlBarScheme not found: ${name}`);
}

const summary = {
  archive: archivePath,
  defaultBytes: defaultBytes.length,
  mainBytes: mainBytes.length,
  combinedBytes: combinedBytes.length,
  parsedCount,
  schemeCount: controlbarExports.generals_controlbar_scheme_count(),
  imagePartCount: controlbarExports.generals_controlbar_image_part_count(),
  animationCount: controlbarExports.generals_controlbar_animation_count(),
  fieldCount: controlbarExports.generals_controlbar_field_count(),
  lineCount: controlbarExports.generals_controlbar_line_count(),
  default: findScheme("Default"),
  america: findScheme("America8x6"),
  gla: findScheme("GLA8x6"),
  chinaBoss: findScheme("ChinaBossGeneral8x6"),
};

if (summary.defaultBytes !== 4592 ||
    summary.mainBytes !== 36637 ||
    summary.combinedBytes !== 41230 ||
    summary.parsedCount !== 30 ||
    summary.schemeCount !== 15 ||
    summary.imagePartCount !== 15 ||
    summary.animationCount !== 0 ||
    summary.fieldCount !== 1047 ||
    summary.lineCount !== 1474) {
  throw new Error(`unexpected ControlBarScheme aggregate parse: ${JSON.stringify(summary)}`);
}

if (summary.default.name !== "Default" ||
    summary.default.line !== 41 ||
    summary.default.fields !== 68 ||
    summary.default.side !== "" ||
    summary.default.queueButtonImage !== "SCBigButton" ||
    summary.default.rightHudImage !== "UnitBackgroundA" ||
    summary.default.commandBorder.join("/") !== "0/21/126/255" ||
    summary.default.buildClock.join("/") !== "0/0/0/160" ||
    summary.default.powerBarUl.join("/") !== "256/466" ||
    summary.default.powerBarLr.join("/") !== "542/481" ||
    summary.default.moneyUl.join("/") !== "360/437" ||
    summary.default.moneyLr.join("/") !== "439/456" ||
    summary.default.firstImageName !== "InGameUIAmericaBase" ||
    summary.default.firstImagePosition.join("/") !== "0/408" ||
    summary.default.firstImageSize.join("/") !== "800/191" ||
    summary.default.firstImageLayer !== 4) {
  throw new Error(`unexpected default ControlBarScheme parse: ${JSON.stringify(summary.default)}`);
}

if (summary.america.fields !== 70 ||
    summary.america.side !== "America" ||
    summary.america.rightHudImage !== "SALogo" ||
    summary.america.commandMarkerImage !== "SAEmptyFrame" ||
    summary.america.powerPurchaseImage !== "GeneralsPowerWindow_American" ||
    summary.america.genArrowImage !== "USLevelUP" ||
    summary.america.commandBorder.join("/") !== "0/21/126/255" ||
    summary.america.powerBarUl.join("/") !== "260/470" ||
    summary.america.powerBarLr.join("/") !== "538/476" ||
    summary.america.firstImageName !== "InGameUIAmericaBase" ||
    summary.america.firstImagePosition.join("/") !== "0/408" ||
    summary.america.firstImageSize.join("/") !== "800/191") {
  throw new Error(`unexpected America ControlBarScheme parse: ${JSON.stringify(summary.america)}`);
}

if (summary.gla.side !== "GLA" ||
    summary.gla.rightHudImage !== "SULogo" ||
    summary.gla.commandMarkerImage !== "SUEmptyFrame" ||
    summary.gla.powerPurchaseImage !== "GeneralsPowerWindow_GLA" ||
    summary.gla.firstImageName !== "InGameUIGLABase" ||
    summary.gla.firstImagePosition.join("/") !== "0/399") {
  throw new Error(`unexpected GLA ControlBarScheme parse: ${JSON.stringify(summary.gla)}`);
}

if (summary.chinaBoss.side !== "Boss" ||
    summary.chinaBoss.rightHudImage !== "SNLogo" ||
    summary.chinaBoss.commandMarkerImage !== "SNEmptyFrame" ||
    summary.chinaBoss.powerPurchaseImage !== "GeneralsPowerMenu_China" ||
    summary.chinaBoss.genArrowImage !== "CHINALevelUP" ||
    summary.chinaBoss.commandBorder.join("/") !== "90/125/2/255" ||
    summary.chinaBoss.powerBarUl.join("/") !== "260/469" ||
    summary.chinaBoss.powerBarLr.join("/") !== "538/475" ||
    summary.chinaBoss.firstImageName !== "InGameUIChinaBase" ||
    summary.chinaBoss.firstImagePosition.join("/") !== "0/414" ||
    summary.chinaBoss.firstImageSize.join("/") !== "800/184") {
  throw new Error(`unexpected Boss ControlBarScheme parse: ${JSON.stringify(summary.chinaBoss)}`);
}

console.log(JSON.stringify(summary, null, 2));
