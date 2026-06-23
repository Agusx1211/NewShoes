import { createBigArchiveSample, createRefPackLiteralSample } from "./fixtures.js";

const compressedLiteralSample = createRefPackLiteralSample();
const bigArchiveSample = createBigArchiveSample();
const textDecoder = new TextDecoder();
let bigRuntime = null;
let iniRuntime = null;
let armorRuntime = null;
let weaponRuntime = null;
let thingRuntime = null;
let commandRuntime = null;
let progressionRuntime = null;
let playerRuntime = null;

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
  weaponTemplates: document.querySelector("[data-weapon-templates]"),
  weaponFields: document.querySelector("[data-weapon-fields]"),
  weaponFirst: document.querySelector("[data-weapon-first]"),
  thingFiles: document.querySelector("[data-thing-files]"),
  thingTemplates: document.querySelector("[data-thing-templates]"),
  thingArmorLinks: document.querySelector("[data-thing-armor-links]"),
  thingWeaponLinks: document.querySelector("[data-thing-weapon-links]"),
  thingPrereqLinks: document.querySelector("[data-thing-prereq-links]"),
  thingObjectPrereqs: document.querySelector("[data-thing-object-prereqs]"),
  thingSciencePrereqs: document.querySelector("[data-thing-science-prereqs]"),
  thingModules: document.querySelector("[data-thing-modules]"),
  thingFirst: document.querySelector("[data-thing-first]"),
  commandButtons: document.querySelector("[data-command-buttons]"),
  commandFields: document.querySelector("[data-command-fields]"),
  commandSets: document.querySelector("[data-command-sets]"),
  commandSlots: document.querySelector("[data-command-slots]"),
  commandFirst: document.querySelector("[data-command-first]"),
  progressionUpgrades: document.querySelector("[data-progression-upgrades]"),
  progressionSpecialPowers: document.querySelector("[data-progression-special-powers]"),
  progressionSciences: document.querySelector("[data-progression-sciences]"),
  progressionFields: document.querySelector("[data-progression-fields]"),
  progressionFirst: document.querySelector("[data-progression-first]"),
  playerTemplates: document.querySelector("[data-player-templates]"),
  playerPlayable: document.querySelector("[data-player-playable]"),
  playerSciences: document.querySelector("[data-player-sciences]"),
  playerCommandSets: document.querySelector("[data-player-command-sets]"),
  playerFirst: document.querySelector("[data-player-first]"),
  bytes: document.querySelector("[data-bytes]"),
  bigListing: document.querySelector("[data-big-listing]"),
  iniListing: document.querySelector("[data-ini-listing]"),
  armorListing: document.querySelector("[data-armor-listing]"),
  weaponListing: document.querySelector("[data-weapon-listing]"),
  thingListing: document.querySelector("[data-thing-listing]"),
  commandListing: document.querySelector("[data-command-listing]"),
  progressionListing: document.querySelector("[data-progression-listing]"),
  playerListing: document.querySelector("[data-player-listing]"),
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

function formatRealX100(value) {
  const real = value / 100;
  if (Number.isInteger(real)) {
    return `${real}`;
  }

  return real.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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

function renderWeaponEmpty(reason) {
  elements.weaponTemplates.textContent = "0 templates";
  elements.weaponFields.textContent = "0 fields";
  elements.weaponFirst.textContent = reason;
  elements.weaponListing.textContent = reason;
}

function readWeaponDamageTypeName(exports, memory, index) {
  const namePtr = exports.generals_weapon_damage_type_name_ptr(index);
  const nameSize = exports.generals_weapon_damage_type_name_size(index);
  return namePtr ? textDecoder.decode(memory.slice(namePtr, namePtr + nameSize)) : "UNKNOWN";
}

function parseWeaponPayload(bytes) {
  const { exports, memory } = weaponRuntime;
  const inputOffset = exports.generals_weapon_input_ptr();

  if (bytes.length > exports.generals_weapon_input_capacity()) {
    throw new Error(`Weapon payload exceeds ${exports.generals_weapon_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const templateCount = exports.generals_weapon_parse(bytes.length);

  if (templateCount < 0 || exports.generals_weapon_error_count() !== 0) {
    throw new Error(`Weapon parse failed with ${exports.generals_weapon_error_count()} errors`);
  }

  const templates = [];
  for (let index = 0; index < templateCount; ++index) {
    const namePtr = exports.generals_weapon_template_name_ptr(index);
    const nameSize = exports.generals_weapon_template_name_size(index);
    const projectilePtr = exports.generals_weapon_template_projectile_name_ptr(index);
    const projectileSize = exports.generals_weapon_template_projectile_name_size(index);
    const damageType = exports.generals_weapon_template_damage_type(index);
    templates.push({
      name: textDecoder.decode(memory.slice(namePtr, namePtr + nameSize)),
      fields: exports.generals_weapon_template_field_count(index),
      line: exports.generals_weapon_template_line(index),
      primaryDamage: exports.generals_weapon_template_primary_damage_x100(index),
      attackRange: exports.generals_weapon_template_attack_range_x100(index),
      damageType: readWeaponDamageTypeName(exports, memory, damageType),
      projectile: projectilePtr ? textDecoder.decode(memory.slice(projectilePtr, projectilePtr + projectileSize)) : "",
    });
  }

  return {
    templateCount,
    fieldCount: exports.generals_weapon_field_count(),
    templates,
  };
}

function renderWeaponParse(entry, result) {
  elements.weaponTemplates.textContent = `${result.templateCount} templates`;
  elements.weaponFields.textContent = `${result.fieldCount} fields`;
  const firstTemplate = result.templates[0];
  elements.weaponFirst.textContent = firstTemplate
    ? `${entry.name}: ${firstTemplate.name} (${firstTemplate.damageType})`
    : `${entry.name}: empty`;
  elements.weaponListing.textContent = result.templates
    .slice(0, 12)
    .map((template) => {
      const projectile = template.projectile ? `, projectile ${template.projectile}` : "";
      return `${template.name} (${template.fields} fields, line ${template.line}) damage ${formatRealX100(template.primaryDamage)}, range ${formatRealX100(template.attackRange)}, ${template.damageType}${projectile}`;
    })
    .join("\n");
}

function renderThingEmpty(reason) {
  elements.thingFiles.textContent = "0 files";
  elements.thingTemplates.textContent = "0 objects";
  elements.thingArmorLinks.textContent = "0 links";
  elements.thingWeaponLinks.textContent = "0 links";
  elements.thingPrereqLinks.textContent = "0 links";
  elements.thingObjectPrereqs.textContent = "0 links";
  elements.thingSciencePrereqs.textContent = "0 links";
  elements.thingModules.textContent = "0 modules";
  elements.thingFirst.textContent = reason;
  elements.thingListing.textContent = reason;
}

function entryBytes(entry, memory) {
  return memory.slice(entry.dataPtr, entry.dataPtr + entry.dataSize);
}

function findEntry(entries, name) {
  return entries.find((candidate) => candidate.name === name);
}

function isObjectEntry(entry) {
  return entry.name === "data/ini/default/object.ini" || entry.name.startsWith("data/ini/object/");
}

function readThingString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readThingTemplateString(exports, memory, prefix, index) {
  return readThingString(
    exports,
    memory,
    `generals_thing_template_${prefix}_ptr`,
    `generals_thing_template_${prefix}_size`,
    index
  );
}

function readThingWeaponSetString(exports, memory, prefix, index) {
  return readThingString(
    exports,
    memory,
    `generals_thing_weapon_set_${prefix}_ptr`,
    `generals_thing_weapon_set_${prefix}_size`,
    index
  );
}

function readThingArmorSetString(exports, memory, prefix, index) {
  return readThingString(
    exports,
    memory,
    `generals_thing_armor_set_${prefix}_ptr`,
    `generals_thing_armor_set_${prefix}_size`,
    index
  );
}

function readThingPrerequisiteString(exports, memory, index) {
  return readThingString(
    exports,
    memory,
    "generals_thing_prerequisite_value_ptr",
    "generals_thing_prerequisite_value_size",
    index
  );
}

function parseThingEntries(entries, archiveMemory) {
  const objectEntries = entries.filter(isObjectEntry);
  if (objectEntries.length === 0) {
    return null;
  }

  const { exports, memory } = thingRuntime;
  const inputOffset = exports.generals_thing_input_ptr();
  const capacity = exports.generals_thing_input_capacity();
  const preview = [];
  let featured = null;
  let templateCount = 0;
  let armorSetCount = 0;
  let weaponSetCount = 0;
  let prerequisiteCount = 0;
  let objectPrerequisiteCount = 0;
  let sciencePrerequisiteCount = 0;
  let moduleCount = 0;

  for (const entry of objectEntries) {
    const bytes = entryBytes(entry, archiveMemory);
    if (bytes.length > capacity) {
      throw new Error(`${entry.name} exceeds ${capacity} byte thing wasm buffer`);
    }

    memory.set(bytes, inputOffset);
    const parsedCount = exports.generals_thing_parse(bytes.length);

    if (parsedCount < 0 || exports.generals_thing_error_count() !== 0) {
      throw new Error(`Thing parse failed for ${entry.name} with ${exports.generals_thing_error_count()} errors`);
    }

    templateCount += parsedCount;
    armorSetCount += exports.generals_thing_armor_set_count();
    weaponSetCount += exports.generals_thing_weapon_set_count();
    prerequisiteCount += exports.generals_thing_prerequisite_count();
    moduleCount += exports.generals_thing_module_count();

    for (let prerequisiteIndex = 0; prerequisiteIndex < exports.generals_thing_prerequisite_count(); ++prerequisiteIndex) {
      const kind = exports.generals_thing_prerequisite_kind(prerequisiteIndex);
      if (kind === 1) {
        objectPrerequisiteCount += 1;
      } else if (kind === 2) {
        sciencePrerequisiteCount += 1;
      }
    }

    if (parsedCount > 0 && preview.length < 10) {
      const firstName = readThingTemplateString(exports, memory, "name", 0);
      preview.push({
        file: entry.name,
        firstName,
        templates: parsedCount,
        armorSets: exports.generals_thing_armor_set_count(),
        weaponSets: exports.generals_thing_weapon_set_count(),
        prerequisites: exports.generals_thing_prerequisite_count(),
      });
    }

    for (let index = 0; index < parsedCount; ++index) {
      const name = readThingTemplateString(exports, memory, "name", index);
      if (name === "AmericaVehicleHumvee") {
        const firstWeaponSet = exports.generals_thing_template_first_weapon_set(index);
        const firstArmorSet = exports.generals_thing_template_first_armor_set(index);
        const firstPrerequisite = exports.generals_thing_template_first_prerequisite(index);
        const objectPrerequisite = exports.generals_thing_template_prerequisite_count(index) > 0
          ? readThingPrerequisiteString(exports, memory, firstPrerequisite)
          : "";
        featured = {
          file: entry.name,
          name,
          displayName: readThingTemplateString(exports, memory, "display_name", index),
          side: readThingTemplateString(exports, memory, "side", index),
          buildCost: exports.generals_thing_template_build_cost(index),
          buildTime: exports.generals_thing_template_build_time_x100(index),
          visionRange: exports.generals_thing_template_vision_range_x100(index),
          commandSet: readThingTemplateString(exports, memory, "command_set", index),
          primaryWeapon: readThingWeaponSetString(exports, memory, "primary", firstWeaponSet),
          secondaryWeapon: readThingWeaponSetString(exports, memory, "secondary", firstWeaponSet + 1),
          armor: readThingArmorSetString(exports, memory, "armor", firstArmorSet),
          prerequisite: objectPrerequisite,
        };
      }
    }
  }

  return {
    fileCount: objectEntries.length,
    templateCount,
    armorSetCount,
    weaponSetCount,
    prerequisiteCount,
    objectPrerequisiteCount,
    sciencePrerequisiteCount,
    moduleCount,
    preview,
    featured,
  };
}

function renderThingParse(result) {
  if (!result) {
    renderThingEmpty("no object data");
    return;
  }

  elements.thingFiles.textContent = `${result.fileCount} files`;
  elements.thingTemplates.textContent = `${result.templateCount} objects`;
  elements.thingArmorLinks.textContent = `${result.armorSetCount} links`;
  elements.thingWeaponLinks.textContent = `${result.weaponSetCount} links`;
  elements.thingPrereqLinks.textContent = `${result.prerequisiteCount} links`;
  elements.thingObjectPrereqs.textContent = `${result.objectPrerequisiteCount} links`;
  elements.thingSciencePrereqs.textContent = `${result.sciencePrerequisiteCount} links`;
  elements.thingModules.textContent = `${result.moduleCount} modules`;

  if (result.featured) {
    const prerequisite = result.featured.prerequisite ? `, needs ${result.featured.prerequisite}` : "";
    elements.thingFirst.textContent = `${result.featured.file}: ${result.featured.name} -> ${result.featured.primaryWeapon} / ${result.featured.armor}${prerequisite}`;
  } else {
    const first = result.preview[0];
    elements.thingFirst.textContent = first ? `${first.file}: ${first.firstName}` : "no object data";
  }

  const featuredLines = result.featured ? [
    `${result.featured.name}: ${result.featured.displayName}, side ${result.featured.side}`,
    `cost ${result.featured.buildCost}, build ${formatRealX100(result.featured.buildTime)}s, vision ${formatRealX100(result.featured.visionRange)}`,
    `command ${result.featured.commandSet}`,
    result.featured.prerequisite ? `prerequisite ${result.featured.prerequisite}` : "",
    `weapons ${result.featured.primaryWeapon}${result.featured.secondaryWeapon ? ` / ${result.featured.secondaryWeapon}` : ""}, armor ${result.featured.armor}`,
    "",
  ].filter((line) => line !== "") : [];

  elements.thingListing.textContent = [
    ...featuredLines,
    ...result.preview.map((entry) => {
      return `${entry.file}: ${entry.templates} objects, ${entry.weaponSets} weapon sets, ${entry.armorSets} armor sets, ${entry.prerequisites} prereqs`;
    }),
  ].join("\n");
}

function renderCommandEmpty(reason) {
  elements.commandButtons.textContent = "0 buttons";
  elements.commandFields.textContent = "0 fields";
  elements.commandSets.textContent = "0 sets";
  elements.commandSlots.textContent = "0 slots";
  elements.commandFirst.textContent = reason;
  elements.commandListing.textContent = reason;
}

function readCommandString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readCommandButtonString(exports, memory, prefix, index) {
  return readCommandString(
    exports,
    memory,
    `generals_command_button_${prefix}_ptr`,
    `generals_command_button_${prefix}_size`,
    index
  );
}

function readCommandSetName(exports, memory, index) {
  return readCommandString(
    exports,
    memory,
    "generals_command_set_name_ptr",
    "generals_command_set_name_size",
    index
  );
}

function readCommandSetEntryButton(exports, memory, index) {
  return readCommandString(
    exports,
    memory,
    "generals_command_set_entry_button_ptr",
    "generals_command_set_entry_button_size",
    index
  );
}

function parseCommandPayload(bytes) {
  const { exports, memory } = commandRuntime;
  const inputOffset = exports.generals_command_input_ptr();

  if (bytes.length > exports.generals_command_input_capacity()) {
    throw new Error(`Command payload exceeds ${exports.generals_command_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const parsedCount = exports.generals_command_parse(bytes.length);

  if (parsedCount < 0 || exports.generals_command_error_count() !== 0) {
    throw new Error(`Command parse failed with ${exports.generals_command_error_count()} errors`);
  }

  return parsedCount;
}

function readCommandButtons(entry, archiveMemory) {
  const { exports, memory } = commandRuntime;
  parseCommandPayload(entryBytes(entry, archiveMemory));

  const buttonsByName = new Map();

  for (let index = 0; index < exports.generals_command_button_count(); ++index) {
    const button = {
      name: readCommandButtonString(exports, memory, "name", index),
      command: readCommandButtonString(exports, memory, "command", index),
      object: readCommandButtonString(exports, memory, "object", index),
      upgrade: readCommandButtonString(exports, memory, "upgrade", index),
      specialPower: readCommandButtonString(exports, memory, "special_power", index),
      science: readCommandButtonString(exports, memory, "science", index),
      options: readCommandButtonString(exports, memory, "options", index),
      textLabel: readCommandButtonString(exports, memory, "text_label", index),
      buttonImage: readCommandButtonString(exports, memory, "button_image", index),
      border: readCommandButtonString(exports, memory, "button_border_type", index),
      fields: exports.generals_command_button_field_count_at(index),
      line: exports.generals_command_button_line(index),
    };
    buttonsByName.set(button.name, button);
  }

  return {
    buttonCount: exports.generals_command_button_count(),
    buttonFieldCount: exports.generals_command_button_field_count(),
    buttonsByName,
  };
}

function readCommandSets(entry, archiveMemory, buttonsByName) {
  const { exports, memory } = commandRuntime;
  parseCommandPayload(entryBytes(entry, archiveMemory));

  const commandSetPreview = [];
  let featuredSet = null;

  for (let index = 0; index < exports.generals_command_set_count(); ++index) {
    const firstEntry = exports.generals_command_set_first_entry(index);
    const entryCount = exports.generals_command_set_entry_count_at(index);
    const commandSet = {
      name: readCommandSetName(exports, memory, index),
      line: exports.generals_command_set_line(index),
      entries: [],
    };

    for (let offset = 0; offset < entryCount; ++offset) {
      const entryIndex = firstEntry + offset;
      const buttonName = readCommandSetEntryButton(exports, memory, entryIndex);
      commandSet.entries.push({
        slot: exports.generals_command_set_entry_slot(entryIndex),
        button: buttonName,
        target: buttonsByName.get(buttonName)?.object ?? "",
        command: buttonsByName.get(buttonName)?.command ?? "",
      });
    }

    if (commandSetPreview.length < 8) {
      commandSetPreview.push(commandSet);
    }
    if (commandSet.name === "AmericaDozerCommandSet") {
      featuredSet = commandSet;
    }
  }

  return {
    commandSetCount: exports.generals_command_set_count(),
    commandSetEntryCount: exports.generals_command_set_entry_count(),
    commandSetPreview,
    featuredSet,
  };
}

function parseCommandEntries(entries, archiveMemory) {
  const buttonEntry = findEntry(entries, "data/ini/commandbutton.ini");
  const setEntry = findEntry(entries, "data/ini/commandset.ini");

  if (!buttonEntry && !setEntry) {
    return null;
  }

  const buttonResult = buttonEntry
    ? readCommandButtons(buttonEntry, archiveMemory)
    : { buttonCount: 0, buttonFieldCount: 0, buttonsByName: new Map() };
  const setResult = setEntry
    ? readCommandSets(setEntry, archiveMemory, buttonResult.buttonsByName)
    : { commandSetCount: 0, commandSetEntryCount: 0, commandSetPreview: [], featuredSet: null };

  return {
    ...buttonResult,
    ...setResult,
  };
}

function renderCommandParse(result) {
  if (!result) {
    renderCommandEmpty("no command data");
    return;
  }

  elements.commandButtons.textContent = `${result.buttonCount} buttons`;
  elements.commandFields.textContent = `${result.buttonFieldCount} fields`;
  elements.commandSets.textContent = `${result.commandSetCount} sets`;
  elements.commandSlots.textContent = `${result.commandSetEntryCount} slots`;

  const firstFeaturedEntry = result.featuredSet?.entries[0] ?? null;
  if (result.featuredSet && firstFeaturedEntry) {
    const target = firstFeaturedEntry.target ? ` -> ${firstFeaturedEntry.target}` : "";
    elements.commandFirst.textContent = `${result.featuredSet.name}: ${firstFeaturedEntry.slot} ${firstFeaturedEntry.button}${target}`;
  } else if (result.featuredSet) {
    elements.commandFirst.textContent = `${result.featuredSet.name}: empty`;
  } else {
    const first = result.commandSetPreview[0];
    elements.commandFirst.textContent = first ? `${first.name}: ${first.entries.length} slots` : "no command data";
  }

  const featuredLines = [];
  if (result.featuredSet) {
    featuredLines.push(`${result.featuredSet.name} line ${result.featuredSet.line}`);
    featuredLines.push(...result.featuredSet.entries.map((entry) => {
      const target = entry.target ? ` -> ${entry.target}` : "";
      return `${entry.slot}: ${entry.button} (${entry.command || "UNKNOWN"})${target}`;
    }));
    featuredLines.push("");
  }
  if (result.featured) {
    const featuredButton = result.buttonsByName.get("Command_ConstructAmericaPowerPlant");
    if (featuredButton) {
      featuredLines.push(`${featuredButton.name}: ${featuredButton.command} ${featuredButton.object}`);
      featuredLines.push(`${featuredButton.textLabel}, image ${featuredButton.buttonImage}, border ${featuredButton.border}`);
      featuredLines.push("");
    }
  }

  elements.commandListing.textContent = [
    ...featuredLines,
    ...result.commandSetPreview.map((commandSet) => `${commandSet.name}: ${commandSet.entries.length} slots`),
  ].join("\n");
}

function renderProgressionEmpty(reason) {
  elements.progressionUpgrades.textContent = "0 upgrades";
  elements.progressionSpecialPowers.textContent = "0 powers";
  elements.progressionSciences.textContent = "0 sciences";
  elements.progressionFields.textContent = "0 fields";
  elements.progressionFirst.textContent = reason;
  elements.progressionListing.textContent = reason;
}

function readProgressionString(exports, memory, kind, prefix, index) {
  const ptr = exports[`generals_progression_${kind}_${prefix}_ptr`](index);
  const size = exports[`generals_progression_${kind}_${prefix}_size`](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function parseProgressionPayload(bytes) {
  const { exports, memory } = progressionRuntime;
  const inputOffset = exports.generals_progression_input_ptr();

  if (bytes.length > exports.generals_progression_input_capacity()) {
    throw new Error(`Progression payload exceeds ${exports.generals_progression_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const parsedCount = exports.generals_progression_parse(bytes.length);

  if (parsedCount < 0 || exports.generals_progression_error_count() !== 0) {
    throw new Error(`Progression parse failed with ${exports.generals_progression_error_count()} errors`);
  }

  return parsedCount;
}

function readProgressionUpgrades(entry, archiveMemory) {
  const { exports, memory } = progressionRuntime;
  parseProgressionPayload(entryBytes(entry, archiveMemory));

  const upgradesByName = new Map();
  for (let index = 0; index < exports.generals_progression_upgrade_count(); ++index) {
    const upgrade = {
      name: readProgressionString(exports, memory, "upgrade", "name", index),
      displayName: readProgressionString(exports, memory, "upgrade", "display_name", index),
      type: readProgressionString(exports, memory, "upgrade", "type", index) || "PLAYER",
      buttonImage: readProgressionString(exports, memory, "upgrade", "button_image", index),
      academy: readProgressionString(exports, memory, "upgrade", "academy", index),
      buildTime: exports.generals_progression_upgrade_build_time_x100(index),
      buildCost: exports.generals_progression_upgrade_build_cost(index),
      fields: exports.generals_progression_upgrade_field_count_at(index),
      line: exports.generals_progression_upgrade_line(index),
    };
    upgradesByName.set(upgrade.name, upgrade);
  }

  return {
    upgradeCount: exports.generals_progression_upgrade_count(),
    upgradeFieldCount: exports.generals_progression_upgrade_field_count(),
    upgradesByName,
  };
}

function readProgressionSpecialPowers(entry, archiveMemory) {
  const { exports, memory } = progressionRuntime;
  parseProgressionPayload(entryBytes(entry, archiveMemory));

  const specialPowersByName = new Map();
  for (let index = 0; index < exports.generals_progression_special_power_count(); ++index) {
    const specialPower = {
      name: readProgressionString(exports, memory, "special_power", "name", index),
      enumName: readProgressionString(exports, memory, "special_power", "enum", index),
      requiredScience: readProgressionString(exports, memory, "special_power", "required_science", index),
      academy: readProgressionString(exports, memory, "special_power", "academy", index),
      reloadTime: exports.generals_progression_special_power_reload_time_ms(index),
      radiusCursorRadius: exports.generals_progression_special_power_radius_cursor_radius_x100(index),
      shortcutPower: exports.generals_progression_special_power_shortcut_power(index),
      fields: exports.generals_progression_special_power_field_count_at(index),
      line: exports.generals_progression_special_power_line(index),
    };
    specialPowersByName.set(specialPower.name, specialPower);
  }

  return {
    specialPowerCount: exports.generals_progression_special_power_count(),
    specialPowerFieldCount: exports.generals_progression_special_power_field_count(),
    specialPowersByName,
  };
}

function readProgressionSciences(entry, archiveMemory) {
  const { exports, memory } = progressionRuntime;
  parseProgressionPayload(entryBytes(entry, archiveMemory));

  const sciencesByName = new Map();
  for (let index = 0; index < exports.generals_progression_science_count(); ++index) {
    const science = {
      name: readProgressionString(exports, memory, "science", "name", index),
      prerequisites: readProgressionString(exports, memory, "science", "prerequisite_sciences", index),
      displayName: readProgressionString(exports, memory, "science", "display_name", index),
      description: readProgressionString(exports, memory, "science", "description", index),
      cost: exports.generals_progression_science_purchase_point_cost(index),
      grantable: exports.generals_progression_science_is_grantable(index),
      fields: exports.generals_progression_science_field_count_at(index),
      line: exports.generals_progression_science_line(index),
    };
    sciencesByName.set(science.name, science);
  }

  return {
    scienceCount: exports.generals_progression_science_count(),
    scienceFieldCount: exports.generals_progression_science_field_count(),
    sciencesByName,
  };
}

function parseProgressionEntries(entries, archiveMemory) {
  const upgradeEntry = findEntry(entries, "data/ini/upgrade.ini");
  const specialPowerEntry = findEntry(entries, "data/ini/specialpower.ini");
  const scienceEntry = findEntry(entries, "data/ini/science.ini");

  if (!upgradeEntry && !specialPowerEntry && !scienceEntry) {
    return null;
  }

  const upgradeResult = upgradeEntry
    ? readProgressionUpgrades(upgradeEntry, archiveMemory)
    : { upgradeCount: 0, upgradeFieldCount: 0, upgradesByName: new Map() };
  const specialPowerResult = specialPowerEntry
    ? readProgressionSpecialPowers(specialPowerEntry, archiveMemory)
    : { specialPowerCount: 0, specialPowerFieldCount: 0, specialPowersByName: new Map() };
  const scienceResult = scienceEntry
    ? readProgressionSciences(scienceEntry, archiveMemory)
    : { scienceCount: 0, scienceFieldCount: 0, sciencesByName: new Map() };

  return {
    ...upgradeResult,
    ...specialPowerResult,
    ...scienceResult,
    daisyCutter: specialPowerResult.specialPowersByName.get("SuperweaponDaisyCutter") ?? null,
    daisyCutterScience: scienceResult.sciencesByName.get("SCIENCE_DaisyCutter") ?? null,
    americaRadar: upgradeResult.upgradesByName.get("Upgrade_AmericaRadar") ?? null,
  };
}

function renderProgressionParse(result) {
  if (!result) {
    renderProgressionEmpty("no progression data");
    return;
  }

  const fieldCount = result.upgradeFieldCount + result.specialPowerFieldCount + result.scienceFieldCount;
  elements.progressionUpgrades.textContent = `${result.upgradeCount} upgrades`;
  elements.progressionSpecialPowers.textContent = `${result.specialPowerCount} powers`;
  elements.progressionSciences.textContent = `${result.scienceCount} sciences`;
  elements.progressionFields.textContent = `${fieldCount} fields`;

  if (result.daisyCutter && result.daisyCutterScience) {
    elements.progressionFirst.textContent = `${result.daisyCutter.name} -> ${result.daisyCutter.requiredScience} (${result.daisyCutterScience.cost} point)`;
  } else {
    elements.progressionFirst.textContent = "progression data parsed";
  }

  const lines = [];
  if (result.daisyCutter) {
    lines.push(`${result.daisyCutter.name}: ${result.daisyCutter.enumName}, reload ${result.daisyCutter.reloadTime} ms`);
    lines.push(`requires ${result.daisyCutter.requiredScience}, radius ${formatRealX100(result.daisyCutter.radiusCursorRadius)}`);
  }
  if (result.daisyCutterScience) {
    lines.push(`${result.daisyCutterScience.name}: cost ${result.daisyCutterScience.cost}, prereqs ${result.daisyCutterScience.prerequisites}`);
    lines.push(`${result.daisyCutterScience.displayName}, ${result.daisyCutterScience.description}`);
  }
  if (result.americaRadar) {
    lines.push("");
    lines.push(`${result.americaRadar.name}: ${result.americaRadar.type}, cost ${result.americaRadar.buildCost}, build ${formatRealX100(result.americaRadar.buildTime)}s`);
    lines.push(`${result.americaRadar.displayName}, image ${result.americaRadar.buttonImage}, ${result.americaRadar.academy}`);
  }

  elements.progressionListing.textContent = lines.join("\n") || "progression data parsed";
}

function renderPlayerEmpty(reason) {
  elements.playerTemplates.textContent = "0 templates";
  elements.playerPlayable.textContent = "0 playable";
  elements.playerSciences.textContent = "0 sciences";
  elements.playerCommandSets.textContent = "0 sets";
  elements.playerFirst.textContent = reason;
  elements.playerListing.textContent = reason;
}

function readPlayerString(exports, memory, prefix, index) {
  const ptr = exports[`generals_player_template_${prefix}_ptr`](index);
  const size = exports[`generals_player_template_${prefix}_size`](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readPlayerStartingUnit(exports, memory, index, slot) {
  const ptr = exports.generals_player_template_starting_unit_ptr(index, slot);
  const size = exports.generals_player_template_starting_unit_size(index, slot);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function parsePlayerPayload(bytes) {
  const { exports, memory } = playerRuntime;
  const inputOffset = exports.generals_player_input_ptr();

  if (bytes.length > exports.generals_player_input_capacity()) {
    throw new Error(`Player payload exceeds ${exports.generals_player_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const parsedCount = exports.generals_player_parse(bytes.length);

  if (parsedCount < 0 || exports.generals_player_error_count() !== 0) {
    throw new Error(`Player parse failed with ${exports.generals_player_error_count()} errors`);
  }

  return parsedCount;
}

function parsePlayerEntries(entries, archiveMemory) {
  const playerEntry = findEntry(entries, "data/ini/playertemplate.ini");
  if (!playerEntry) {
    return null;
  }

  const { exports, memory } = playerRuntime;
  parsePlayerPayload(entryBytes(playerEntry, archiveMemory));

  const preview = [];
  let america = null;
  let observer = null;
  let boss = null;

  for (let index = 0; index < exports.generals_player_template_count(); ++index) {
    const template = {
      name: readPlayerString(exports, memory, "name", index),
      side: readPlayerString(exports, memory, "side", index),
      baseSide: readPlayerString(exports, memory, "base_side", index),
      displayName: readPlayerString(exports, memory, "display_name", index),
      intrinsicSciences: readPlayerString(exports, memory, "intrinsic_sciences", index),
      rank1: readPlayerString(exports, memory, "purchase_science_command_set_rank1", index),
      rank3: readPlayerString(exports, memory, "purchase_science_command_set_rank3", index),
      rank8: readPlayerString(exports, memory, "purchase_science_command_set_rank8", index),
      shortcutCommandSet: readPlayerString(exports, memory, "special_power_shortcut_command_set", index),
      startingBuilding: readPlayerString(exports, memory, "starting_building", index),
      startingUnit0: readPlayerStartingUnit(exports, memory, index, 0),
      sideIconImage: readPlayerString(exports, memory, "side_icon_image", index),
      observer: exports.generals_player_template_observer(index),
      oldFaction: exports.generals_player_template_old_faction(index),
      fields: exports.generals_player_template_field_count_at(index),
      purchaseCommandSets: exports.generals_player_template_purchase_science_command_set_count(index),
      shortcutButtons: exports.generals_player_template_special_power_shortcut_button_count(index),
      color: [
        exports.generals_player_template_preferred_color_r(index),
        exports.generals_player_template_preferred_color_g(index),
        exports.generals_player_template_preferred_color_b(index),
      ],
    };

    if (preview.length < 8) {
      preview.push(template);
    }
    if (template.name === "FactionAmerica") {
      america = template;
    } else if (template.name === "FactionObserver") {
      observer = template;
    } else if (template.name === "FactionBossGeneral") {
      boss = template;
    }
  }

  return {
    templateCount: exports.generals_player_template_count(),
    playableCount: exports.generals_player_playable_count(),
    intrinsicScienceCount: exports.generals_player_intrinsic_science_count(),
    purchaseScienceCommandSetCount: exports.generals_player_purchase_science_command_set_count(),
    preview,
    america,
    observer,
    boss,
  };
}

function renderPlayerParse(result) {
  if (!result) {
    renderPlayerEmpty("no player data");
    return;
  }

  elements.playerTemplates.textContent = `${result.templateCount} templates`;
  elements.playerPlayable.textContent = `${result.playableCount} playable`;
  elements.playerSciences.textContent = `${result.intrinsicScienceCount} sciences`;
  elements.playerCommandSets.textContent = `${result.purchaseScienceCommandSetCount} sets`;

  if (result.america) {
    elements.playerFirst.textContent = `${result.america.name}: ${result.america.side}/${result.america.baseSide}, starts ${result.america.startingBuilding} + ${result.america.startingUnit0}`;
  } else {
    const first = result.preview[0];
    elements.playerFirst.textContent = first ? `${first.name}: ${first.side}` : "no player data";
  }

  const lines = [];
  if (result.america) {
    lines.push(`${result.america.name}: ${result.america.displayName}, color ${result.america.color.join("/")}`);
    lines.push(`sciences ${result.america.intrinsicSciences}; ranks ${result.america.rank1}, ${result.america.rank3}, ${result.america.rank8}`);
    lines.push(`starts ${result.america.startingBuilding} + ${result.america.startingUnit0}; shortcut ${result.america.shortcutCommandSet} (${result.america.shortcutButtons})`);
    lines.push(`icon ${result.america.sideIconImage}; old faction ${result.america.oldFaction ? "yes" : "no"}`);
    lines.push("");
  }
  if (result.observer) {
    lines.push(`${result.observer.name}: observer ${result.observer.observer ? "yes" : "no"}, icon ${result.observer.sideIconImage}`);
  }
  if (result.boss) {
    lines.push(`${result.boss.name}: ${result.boss.intrinsicSciences}, ${result.boss.purchaseCommandSets} science sets`);
    lines.push("");
  }
  lines.push(...result.preview.map((template) => `${template.name}: ${template.side}, ${template.fields} fields`));

  elements.playerListing.textContent = lines.join("\n") || "player data parsed";
}

function parseArchiveIni(entries, memory) {
  const entry = entries.find((candidate) => candidate.name.endsWith(".ini"));
  if (!entry) {
    renderIniParse({ name: "no ini" }, { blockCount: 0, propertyCount: 0, blocks: [] });
    renderArmorEmpty("no armor data");
    renderWeaponEmpty("no weapon data");
    renderThingEmpty("no object data");
    renderCommandEmpty("no command data");
    renderProgressionEmpty("no progression data");
    renderPlayerEmpty("no player data");
    return;
  }

  const bytes = entryBytes(entry, memory);
  const iniResult = parseIniPayload(bytes);
  renderIniParse(entry, iniResult);

  const armorEntry = findEntry(entries, "data/ini/armor.ini") ?? (iniResult.blocks[0]?.type === "Armor" ? entry : null);
  if (armorEntry) {
    renderArmorParse(armorEntry, parseArmorPayload(entryBytes(armorEntry, memory)));
  } else {
    renderArmorEmpty("no armor data");
  }

  const weaponEntry = findEntry(entries, "data/ini/weapon.ini") ?? (iniResult.blocks[0]?.type === "Weapon" ? entry : null);
  if (weaponEntry) {
    renderWeaponParse(weaponEntry, parseWeaponPayload(entryBytes(weaponEntry, memory)));
  } else {
    renderWeaponEmpty("no weapon data");
  }

  renderThingParse(parseThingEntries(entries, memory));
  renderCommandParse(parseCommandEntries(entries, memory));
  renderProgressionParse(parseProgressionEntries(entries, memory));
  renderPlayerParse(parsePlayerEntries(entries, memory));
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
  const weaponModule = await loadWasm("../dist/generals_weapon.wasm");
  weaponRuntime = {
    exports: weaponModule.instance.exports,
    memory: new Uint8Array(weaponModule.instance.exports.memory.buffer),
  };
  const thingModule = await loadWasm("../dist/generals_thing.wasm");
  thingRuntime = {
    exports: thingModule.instance.exports,
    memory: new Uint8Array(thingModule.instance.exports.memory.buffer),
  };
  const commandModule = await loadWasm("../dist/generals_command.wasm");
  commandRuntime = {
    exports: commandModule.instance.exports,
    memory: new Uint8Array(commandModule.instance.exports.memory.buffer),
  };
  const progressionModule = await loadWasm("../dist/generals_progression.wasm");
  progressionRuntime = {
    exports: progressionModule.instance.exports,
    memory: new Uint8Array(progressionModule.instance.exports.memory.buffer),
  };
  const playerModule = await loadWasm("../dist/generals_player.wasm");
  playerRuntime = {
    exports: playerModule.instance.exports,
    memory: new Uint8Array(playerModule.instance.exports.memory.buffer),
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
  parseArchiveIni(bigEntries, bigRuntime.memory);
  drawByteBars(compressedLiteralSample);
  setStatus("pass", "pass");
}

elements.bigFile.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file || !bigRuntime || !iniRuntime || !armorRuntime || !weaponRuntime || !thingRuntime || !commandRuntime || !progressionRuntime || !playerRuntime) {
    return;
  }

  try {
    setStatus("loading", "loading");
    const archive = new Uint8Array(await file.arrayBuffer());
    const entries = parseBigArchive(archive);
    renderBigArchive(archive, entries);
    parseArchiveIni(entries, bigRuntime.memory);
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
