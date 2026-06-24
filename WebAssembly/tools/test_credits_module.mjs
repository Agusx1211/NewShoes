import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmPath = resolve(wasmDir, "dist/generals_credits.wasm");
const wasmBytes = await readFile(wasmPath);
const { instance } = await WebAssembly.instantiate(wasmBytes, {});
const exports = instance.exports;
const memory = new Uint8Array(exports.memory.buffer);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const source = `
Credits
  ScrollRate = 2
  ScrollRateEveryFrames = 1
  ScrollDown = NO
  TitleColor = R:161 G:179 B:255 A:255
  MinorTitleColor = R:161 G:179 B:255 A:255
  NormalColor = R:209 G:218 B:255 A:255

  Style = MINORTITLE
  Text = CREDITS:DevelopmentTitle
  Blank

  Style = NORMAL
  Text = "Mark Skaggs"
  Text = CREDITS:SeniorProducer
End
`;

const bytes = textEncoder.encode(source);
if (bytes.length > exports.generals_credits_input_capacity()) {
  throw new Error(`fixture exceeds ${exports.generals_credits_input_capacity()} byte wasm buffer`);
}

memory.set(bytes, exports.generals_credits_input_ptr());
const count = exports.generals_credits_parse(bytes.length);
if (count < 0 || exports.generals_credits_error_count() !== 0) {
  throw new Error(`Credits parse failed: parsed=${count}, errors=${exports.generals_credits_error_count()}`);
}

function readString(ptr, size) {
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function lineText(index) {
  return readString(exports.generals_credits_line_text_ptr(index), exports.generals_credits_line_text_size(index));
}

function lineStyleName(index) {
  return readString(exports.generals_credits_line_style_name_ptr(index), exports.generals_credits_line_style_name_size(index));
}

if (count !== 4 ||
    exports.generals_credits_line_total() !== 4 ||
    exports.generals_credits_has_block() !== 1 ||
    exports.generals_credits_text_count() !== 3 ||
    exports.generals_credits_blank_count() !== 1 ||
    exports.generals_credits_style_decl_count() !== 2 ||
    exports.generals_credits_settings_field_count() !== 6 ||
    exports.generals_credits_field_count() !== 12) {
  throw new Error("unexpected Credits aggregate parse");
}

if (exports.generals_credits_scroll_rate() !== 2 ||
    exports.generals_credits_scroll_rate_every_frames() !== 1 ||
    exports.generals_credits_scroll_down() !== 0 ||
    exports.generals_credits_title_color_r() !== 161 ||
    exports.generals_credits_title_color_g() !== 179 ||
    exports.generals_credits_title_color_b() !== 255 ||
    exports.generals_credits_title_color_a() !== 255 ||
    exports.generals_credits_normal_color_r() !== 209) {
  throw new Error("unexpected Credits settings");
}

// First text picks up MINORTITLE (style 1); after the second Style switch the
// quoted "Mark Skaggs" line is NORMAL (style 2). The Blank line is BLANK (4).
if (exports.generals_credits_line_type(0) !== 0 ||
    exports.generals_credits_line_style(0) !== 1 ||
    lineStyleName(0) !== "MINORTITLE" ||
    lineText(0) !== "CREDITS:DevelopmentTitle" ||
    exports.generals_credits_line_type(1) !== 1 ||
    exports.generals_credits_line_style(1) !== 4 ||
    lineStyleName(1) !== "BLANK" ||
    exports.generals_credits_line_type(2) !== 0 ||
    exports.generals_credits_line_style(2) !== 2 ||
    lineText(2) !== "Mark Skaggs" ||
    lineText(3) !== "CREDITS:SeniorProducer") {
  throw new Error("unexpected Credits line parse");
}

console.log(JSON.stringify({
  module: wasmPath,
  lines: exports.generals_credits_line_total(),
  text: exports.generals_credits_text_count(),
  blank: exports.generals_credits_blank_count(),
  fields: exports.generals_credits_field_count(),
  quoted: lineText(2),
}, null, 2));
