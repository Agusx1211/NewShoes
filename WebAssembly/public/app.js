import { createBigArchiveSample, createRefPackLiteralSample } from "./fixtures.js";

const compressedLiteralSample = createRefPackLiteralSample();
const bigArchiveSample = createBigArchiveSample();
const textDecoder = new TextDecoder();
let bigRuntime = null;
let iniRuntime = null;
let armorRuntime = null;

const elements = {
  status: document.querySelector("[data-status]"),
  module: document.querySelector("[data-module]"),
  compressed: document.querySelector("[data-compressed]"),
  decoded: document.querySelector("[data-decoded]"),
  consumed: document.querySelector("[data-consumed]"),
  bigFiles: document.querySelector("[data-big-files]"),
  bigBytes: document.querySelector("[data-big-bytes]"),
  bigFirst: document.querySelector("[data-big-first]"),
  bigFile: document.querySelector("[data-big-file]"),
  iniBlocks: document.querySelector("[data-ini-blocks]"),
  iniProps: document.querySelector("[data-ini-props]"),
  iniFirst: document.querySelector("[data-ini-first]"),
  armorTemplates: document.querySelector("[data-armor-templates]"),
  armorCoeffs: document.querySelector("[data-armor-coeffs]"),
  armorFirst: document.querySelector("[data-armor-first]"),
  bytes: document.querySelector("[data-bytes]"),
  bigListing: document.querySelector("[data-big-listing]"),
  iniListing: document.querySelector("[data-ini-listing]"),
  armorListing: document.querySelector("[data-armor-listing]"),
  output: document.querySelector("[data-output]"),
  canvas: document.querySelector("canvas"),
};

function setStatus(text, state) {
  elements.status.textContent = text;
  elements.status.dataset.state = state;
  document.body.dataset.validation = state;
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${bytes} bytes`;
}

function formatPercentX100(value) {
  const percent = value / 100;
  if (Number.isInteger(percent)) {
    return `${percent}%`;
  }

  return `${percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function drawByteBars(bytes) {
  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#111827";
  context.fillRect(0, 0, width, height);

  bytes.forEach((byte, index) => {
    const barWidth = width / bytes.length;
    const barHeight = Math.max(18, (byte / 255) * (height - 24));
    const x = index * barWidth;
    const y = height - barHeight;
    context.fillStyle = index < 5 ? "#38bdf8" : "#f59e0b";
    context.fillRect(x + 3, y, Math.max(4, barWidth - 6), barHeight);
  });
}

async function loadWasm(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`wasm fetch failed: ${response.status}`);
  }

  return WebAssembly.instantiateStreaming(response, {});
}

function parseBigArchive(archive, expectedFileCount = null) {
  const { exports, memory } = bigRuntime;
  const inputOffset = exports.generals_big_input_ptr();
  const capacity = exports.generals_big_input_capacity();

  if (archive.length > capacity) {
    throw new Error(`BIG archive exceeds ${capacity} byte wasm buffer`);
  }

  memory.set(archive, inputOffset);

  const isBig = exports.generals_big_is(archive.length);
  const fileCount = exports.generals_big_parse(archive.length);

  if (isBig !== 1 || fileCount < 0) {
    throw new Error("BIG archive validation failed");
  }

  if (expectedFileCount !== null && fileCount !== expectedFileCount) {
    throw new Error("BIG archive entry count validation failed");
  }

  const entries = [];
  for (let index = 0; index < fileCount; ++index) {
    const namePtr = exports.generals_big_entry_name_ptr(index);
    const nameSize = exports.generals_big_entry_name_size(index);
    const dataPtr = exports.generals_big_entry_data_ptr(index);
    const dataSize = exports.generals_big_entry_data_size(index);
    const name = textDecoder.decode(memory.slice(namePtr, namePtr + nameSize));
    entries.push({ name, dataPtr, dataSize });
  }

  return entries;
}

function renderBigArchive(archive, entries) {
  elements.bigFiles.textContent = `${entries.length} files`;
  elements.bigBytes.textContent = formatBytes(archive.length);
  elements.bigFirst.textContent = entries[0]?.name ?? "empty";
  elements.bigListing.textContent = entries
    .slice(0, 16)
    .map((entry) => `${entry.name} (${entry.dataSize} bytes)`)
    .join("\n");
}

function parseIniPayload(bytes) {
  const { exports, memory } = iniRuntime;
  const inputOffset = exports.generals_ini_input_ptr();

  if (bytes.length > exports.generals_ini_input_capacity()) {
    throw new Error(`INI payload exceeds ${exports.generals_ini_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const blockCount = exports.generals_ini_parse(bytes.length);

  if (blockCount < 0 || exports.generals_ini_error_count() !== 0) {
    throw new Error(`INI parse failed with ${exports.generals_ini_error_count()} errors`);
  }

  const blocks = [];
  for (let index = 0; index < blockCount; ++index) {
    const typePtr = exports.generals_ini_block_type_ptr(index);
    const typeSize = exports.generals_ini_block_type_size(index);
    const namePtr = exports.generals_ini_block_name_ptr(index);
    const nameSize = exports.generals_ini_block_name_size(index);
    const type = textDecoder.decode(memory.slice(typePtr, typePtr + typeSize));
    const name = namePtr ? textDecoder.decode(memory.slice(namePtr, namePtr + nameSize)) : "";
    blocks.push({
      type,
      name,
      properties: exports.generals_ini_block_property_count(index),
      line: exports.generals_ini_block_line(index),
    });
  }

  return {
    blockCount,
    propertyCount: exports.generals_ini_property_count(),
    lineCount: exports.generals_ini_line_count(),
    blocks,
  };
}

function renderIniParse(entry, result) {
  elements.iniBlocks.textContent = `${result.blockCount} blocks`;
  elements.iniProps.textContent = `${result.propertyCount} fields`;
  const firstBlock = result.blocks[0];
  elements.iniFirst.textContent = firstBlock
    ? `${entry.name}: ${firstBlock.type}${firstBlock.name ? ` ${firstBlock.name}` : ""}`
    : `${entry.name}: empty`;
  elements.iniListing.textContent = result.blocks
    .slice(0, 16)
    .map((block) => `${block.type}${block.name ? ` ${block.name}` : ""} (${block.properties} fields)`)
    .join("\n");
}

function renderArmorEmpty(reason) {
  elements.armorTemplates.textContent = "0 templates";
  elements.armorCoeffs.textContent = "0 coeffs";
  elements.armorFirst.textContent = reason;
  elements.armorListing.textContent = reason;
}

function parseArmorPayload(bytes) {
  const { exports, memory } = armorRuntime;
  const inputOffset = exports.generals_armor_input_ptr();

  if (bytes.length > exports.generals_armor_input_capacity()) {
    throw new Error(`Armor payload exceeds ${exports.generals_armor_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const templateCount = exports.generals_armor_parse(bytes.length);

  if (templateCount < 0 || exports.generals_armor_error_count() !== 0) {
    throw new Error(`Armor parse failed with ${exports.generals_armor_error_count()} errors`);
  }

  const templates = [];
  for (let index = 0; index < templateCount; ++index) {
    const namePtr = exports.generals_armor_template_name_ptr(index);
    const nameSize = exports.generals_armor_template_name_size(index);
    templates.push({
      name: textDecoder.decode(memory.slice(namePtr, namePtr + nameSize)),
      assignments: exports.generals_armor_template_assignment_count(index),
      line: exports.generals_armor_template_line(index),
      crush: exports.generals_armor_template_damage_percent_x100(index, 1),
      flame: exports.generals_armor_template_damage_percent_x100(index, 6),
      microwave: exports.generals_armor_template_damage_percent_x100(index, 35),
    });
  }

  return {
    templateCount,
    resolvedCoefficientCount: exports.generals_armor_resolved_coefficient_count(),
    templates,
  };
}

function renderArmorParse(entry, result) {
  elements.armorTemplates.textContent = `${result.templateCount} templates`;
  elements.armorCoeffs.textContent = `${result.resolvedCoefficientCount} coeffs`;
  const firstTemplate = result.templates[0];
  elements.armorFirst.textContent = firstTemplate
    ? `${entry.name}: ${firstTemplate.name} (${firstTemplate.assignments} assignments)`
    : `${entry.name}: empty`;
  elements.armorListing.textContent = result.templates
    .slice(0, 12)
    .map((template) => {
      const crush = formatPercentX100(template.crush);
      const flame = formatPercentX100(template.flame);
      const microwave = formatPercentX100(template.microwave);
      return `${template.name} (${template.assignments} fields, line ${template.line}) CRUSH ${crush}, FLAME ${flame}, MICROWAVE ${microwave}`;
    })
    .join("\n");
}

function parseFirstIniEntry(entries, memory) {
  const entry = entries.find((candidate) => candidate.name.endsWith(".ini"));
  if (!entry) {
    renderIniParse({ name: "no ini" }, { blockCount: 0, propertyCount: 0, blocks: [] });
    renderArmorEmpty("no armor data");
    return;
  }

  const bytes = memory.slice(entry.dataPtr, entry.dataPtr + entry.dataSize);
  const iniResult = parseIniPayload(bytes);
  renderIniParse(entry, iniResult);

  if (entry.name.endsWith("armor.ini") || iniResult.blocks[0]?.type === "Armor") {
    renderArmorParse(entry, parseArmorPayload(bytes));
  } else {
    renderArmorEmpty("no armor data");
  }
}

async function boot() {
  setStatus("loading", "loading");

  const refpackModule = await loadWasm("../dist/generals_refpack.wasm");
  const refpackExports = refpackModule.instance.exports;
  const refpackMemory = new Uint8Array(refpackExports.memory.buffer);
  const inputOffset = refpackExports.generals_refpack_input_ptr();
  const outputOffset = refpackExports.generals_refpack_output_ptr();

  refpackMemory.set(compressedLiteralSample, inputOffset);

  const isRefPack = refpackExports.generals_refpack_is(0);
  const expectedSize = refpackExports.generals_refpack_size(0);
  const decodedSize = refpackExports.generals_refpack_decode(0, 0);
  const consumedSize = refpackExports.generals_refpack_last_consumed_size();
  const decodedBytes = refpackMemory.slice(outputOffset, outputOffset + decodedSize);
  const decodedText = textDecoder.decode(decodedBytes);

  if (isRefPack !== 1 || expectedSize !== 3 || decodedSize !== 3 || decodedText !== "ABC") {
    throw new Error("RefPack decode validation failed");
  }

  const bigModule = await loadWasm("../dist/generals_big.wasm");
  const bigExports = bigModule.instance.exports;
  bigRuntime = {
    exports: bigExports,
    memory: new Uint8Array(bigExports.memory.buffer),
  };
  const iniModule = await loadWasm("../dist/generals_ini.wasm");
  iniRuntime = {
    exports: iniModule.instance.exports,
    memory: new Uint8Array(iniModule.instance.exports.memory.buffer),
  };
  const armorModule = await loadWasm("../dist/generals_armor.wasm");
  armorRuntime = {
    exports: armorModule.instance.exports,
    memory: new Uint8Array(armorModule.instance.exports.memory.buffer),
  };
  const bigEntries = parseBigArchive(bigArchiveSample.archive, bigArchiveSample.files.length);

  if (bigEntries[0]?.name !== "data/ini/gamedata.ini" || bigEntries[0]?.dataSize !== 15) {
    throw new Error("BIG archive entry validation failed");
  }

  elements.module.textContent = `${refpackExports.generals_refpack_input_capacity() / 1024} KiB / ${refpackExports.generals_refpack_output_capacity() / 1024} KiB`;
  elements.compressed.textContent = `${compressedLiteralSample.length} bytes`;
  elements.decoded.textContent = `${decodedSize} bytes`;
  elements.consumed.textContent = `${consumedSize} bytes`;
  elements.bytes.textContent = hex(compressedLiteralSample);
  elements.output.textContent = decodedText;
  renderBigArchive(bigArchiveSample.archive, bigEntries);
  parseFirstIniEntry(bigEntries, bigRuntime.memory);
  drawByteBars(compressedLiteralSample);
  setStatus("pass", "pass");
}

elements.bigFile.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file || !bigRuntime || !iniRuntime || !armorRuntime) {
    return;
  }

  try {
    setStatus("loading", "loading");
    const archive = new Uint8Array(await file.arrayBuffer());
    const entries = parseBigArchive(archive);
    renderBigArchive(archive, entries);
    parseFirstIniEntry(entries, bigRuntime.memory);
    setStatus("pass", "pass");
  } catch (error) {
    console.error(error);
    elements.bigListing.textContent = error.message;
    elements.iniListing.textContent = error.message;
    setStatus("fail", "fail");
  }
});

boot().catch((error) => {
  console.error(error);
  elements.output.textContent = error.message;
  setStatus("fail", "fail");
});
