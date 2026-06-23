import { createBigArchiveSample, createRefPackLiteralSample } from "./fixtures.js";

const compressedLiteralSample = createRefPackLiteralSample();
const bigArchiveSample = createBigArchiveSample();
const textDecoder = new TextDecoder();
let bigRuntime = null;
let iniRuntime = null;
let gameDataRuntime = null;
let aiDataRuntime = null;
let mappedImageRuntime = null;
let environmentRuntime = null;
let videoRuntime = null;
let armorRuntime = null;
let weaponRuntime = null;
let locomotorRuntime = null;
let fxlistRuntime = null;
let particleRuntime = null;
let audioRuntime = null;
let miscAudioRuntime = null;
let damageFxRuntime = null;
let crateRuntime = null;
let oclRuntime = null;
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
  gameDataFields: document.querySelector("[data-gamedata-fields]"),
  gameDataCash: document.querySelector("[data-gamedata-cash]"),
  gameDataBonuses: document.querySelector("[data-gamedata-bonuses]"),
  gameDataBones: document.querySelector("[data-gamedata-bones]"),
  gameDataFirst: document.querySelector("[data-gamedata-first]"),
  aiDataFields: document.querySelector("[data-aidata-fields]"),
  aiDataSides: document.querySelector("[data-aidata-sides]"),
  aiDataBuildLists: document.querySelector("[data-aidata-build-lists]"),
  aiDataStructures: document.querySelector("[data-aidata-structures]"),
  aiDataFirst: document.querySelector("[data-aidata-first]"),
  mappedImageImages: document.querySelector("[data-mappedimage-images]"),
  mappedImagePages: document.querySelector("[data-mappedimage-pages]"),
  mappedImageRotated: document.querySelector("[data-mappedimage-rotated]"),
  mappedImageArea: document.querySelector("[data-mappedimage-area]"),
  mappedImageFirst: document.querySelector("[data-mappedimage-first]"),
  environmentWaterSets: document.querySelector("[data-environment-water-sets]"),
  environmentTransparency: document.querySelector("[data-environment-transparency]"),
  environmentWeather: document.querySelector("[data-environment-weather]"),
  environmentFields: document.querySelector("[data-environment-fields]"),
  environmentFirst: document.querySelector("[data-environment-first]"),
  videoCount: document.querySelector("[data-video-count]"),
  videoFields: document.querySelector("[data-video-fields]"),
  videoLines: document.querySelector("[data-video-lines]"),
  videoComments: document.querySelector("[data-video-comments]"),
  videoFirst: document.querySelector("[data-video-first]"),
  armorTemplates: document.querySelector("[data-armor-templates]"),
  armorCoeffs: document.querySelector("[data-armor-coeffs]"),
  armorFirst: document.querySelector("[data-armor-first]"),
  weaponTemplates: document.querySelector("[data-weapon-templates]"),
  weaponFields: document.querySelector("[data-weapon-fields]"),
  weaponFirst: document.querySelector("[data-weapon-first]"),
  locomotorTemplates: document.querySelector("[data-locomotor-templates]"),
  locomotorFields: document.querySelector("[data-locomotor-fields]"),
  locomotorGround: document.querySelector("[data-locomotor-ground]"),
  locomotorAir: document.querySelector("[data-locomotor-air]"),
  locomotorFirst: document.querySelector("[data-locomotor-first]"),
  fxlistLists: document.querySelector("[data-fxlist-lists]"),
  fxlistNuggets: document.querySelector("[data-fxlist-nuggets]"),
  fxlistParticles: document.querySelector("[data-fxlist-particles]"),
  fxlistSounds: document.querySelector("[data-fxlist-sounds]"),
  fxlistFirst: document.querySelector("[data-fxlist-first]"),
  particleTemplates: document.querySelector("[data-particle-templates]"),
  particleFields: document.querySelector("[data-particle-fields]"),
  particleTextures: document.querySelector("[data-particle-textures]"),
  particleCritical: document.querySelector("[data-particle-critical]"),
  particleFirst: document.querySelector("[data-particle-first]"),
  audioEvents: document.querySelector("[data-audio-events]"),
  audioFields: document.querySelector("[data-audio-fields]"),
  audioSounds: document.querySelector("[data-audio-sounds]"),
  audioDialog: document.querySelector("[data-audio-dialog]"),
  audioFirst: document.querySelector("[data-audio-first]"),
  miscAudioSlots: document.querySelector("[data-miscaudio-slots]"),
  miscAudioEvents: document.querySelector("[data-miscaudio-events]"),
  miscAudioNoSound: document.querySelector("[data-miscaudio-nosound]"),
  miscAudioMissing: document.querySelector("[data-miscaudio-missing]"),
  miscAudioFirst: document.querySelector("[data-miscaudio-first]"),
  damageFxTemplates: document.querySelector("[data-damagefx-templates]"),
  damageFxAssignments: document.querySelector("[data-damagefx-assignments]"),
  damageFxMajor: document.querySelector("[data-damagefx-major]"),
  damageFxThrottle: document.querySelector("[data-damagefx-throttle]"),
  damageFxFirst: document.querySelector("[data-damagefx-first]"),
  crateTemplates: document.querySelector("[data-crate-templates]"),
  crateObjects: document.querySelector("[data-crate-objects]"),
  crateOwned: document.querySelector("[data-crate-owned]"),
  crateFields: document.querySelector("[data-crate-fields]"),
  crateFirst: document.querySelector("[data-crate-first]"),
  oclLists: document.querySelector("[data-ocl-lists]"),
  oclNuggets: document.querySelector("[data-ocl-nuggets]"),
  oclDebris: document.querySelector("[data-ocl-debris]"),
  oclPayloads: document.querySelector("[data-ocl-payloads]"),
  oclFirst: document.querySelector("[data-ocl-first]"),
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
  gameDataListing: document.querySelector("[data-gamedata-listing]"),
  aiDataListing: document.querySelector("[data-aidata-listing]"),
  mappedImageListing: document.querySelector("[data-mappedimage-listing]"),
  environmentListing: document.querySelector("[data-environment-listing]"),
  videoListing: document.querySelector("[data-video-listing]"),
  armorListing: document.querySelector("[data-armor-listing]"),
  weaponListing: document.querySelector("[data-weapon-listing]"),
  locomotorListing: document.querySelector("[data-locomotor-listing]"),
  fxlistListing: document.querySelector("[data-fxlist-listing]"),
  particleListing: document.querySelector("[data-particle-listing]"),
  audioListing: document.querySelector("[data-audio-listing]"),
  miscAudioListing: document.querySelector("[data-miscaudio-listing]"),
  damageFxListing: document.querySelector("[data-damagefx-listing]"),
  crateListing: document.querySelector("[data-crate-listing]"),
  oclListing: document.querySelector("[data-ocl-listing]"),
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

function formatRealX10000(value) {
  const real = value / 10000;
  if (Number.isInteger(real)) {
    return `${real}`;
  }

  return real.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
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

function renderLocomotorEmpty(reason) {
  elements.locomotorTemplates.textContent = "0 templates";
  elements.locomotorFields.textContent = "0 fields";
  elements.locomotorGround.textContent = "0 ground";
  elements.locomotorAir.textContent = "0 air";
  elements.locomotorFirst.textContent = reason;
  elements.locomotorListing.textContent = reason;
}

function readLocomotorString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readLocomotorTemplateString(exports, memory, prefix, index) {
  return readLocomotorString(
    exports,
    memory,
    `generals_locomotor_template_${prefix}_ptr`,
    `generals_locomotor_template_${prefix}_size`,
    index
  );
}

function readLocomotorEnumString(exports, memory, kind, index) {
  return readLocomotorString(
    exports,
    memory,
    `generals_locomotor_${kind}_name_ptr`,
    `generals_locomotor_${kind}_name_size`,
    index
  );
}

function parseLocomotorPayload(bytes) {
  const { exports, memory } = locomotorRuntime;
  const inputOffset = exports.generals_locomotor_input_ptr();

  if (bytes.length > exports.generals_locomotor_input_capacity()) {
    throw new Error(`Locomotor payload exceeds ${exports.generals_locomotor_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const templateCount = exports.generals_locomotor_parse(bytes.length);

  if (templateCount < 0 || exports.generals_locomotor_error_count() !== 0) {
    throw new Error(`Locomotor parse failed with ${exports.generals_locomotor_error_count()} errors`);
  }

  return templateCount;
}

function parseLocomotorEntries(entries, archiveMemory) {
  const locomotorEntry = findEntry(entries, "data/ini/locomotor.ini");
  if (!locomotorEntry) {
    return null;
  }

  const { exports, memory } = locomotorRuntime;
  const templateCount = parseLocomotorPayload(entryBytes(locomotorEntry, archiveMemory));
  const preview = [];
  let basicHuman = null;
  let rocketBuggy = null;
  let comanche = null;
  let aurora = null;

  for (let index = 0; index < templateCount; ++index) {
    const appearance = exports.generals_locomotor_template_appearance(index);
    const behaviorZ = exports.generals_locomotor_template_behavior_z(index);
    const priority = exports.generals_locomotor_template_move_priority(index);
    const template = {
      name: readLocomotorTemplateString(exports, memory, "name", index),
      surfaces: readLocomotorTemplateString(exports, memory, "surfaces", index),
      fields: exports.generals_locomotor_template_field_count(index),
      line: exports.generals_locomotor_template_line(index),
      speed: exports.generals_locomotor_template_speed_x100(index),
      speedDamaged: exports.generals_locomotor_template_speed_damaged_x100(index),
      minSpeed: exports.generals_locomotor_template_min_speed_x100(index),
      acceleration: exports.generals_locomotor_template_acceleration_x100(index),
      braking: exports.generals_locomotor_template_braking_x100(index),
      preferredHeight: exports.generals_locomotor_template_preferred_height_x100(index),
      appearance: readLocomotorEnumString(exports, memory, "appearance", appearance),
      behaviorZ: readLocomotorEnumString(exports, memory, "behavior_z", behaviorZ),
      priority: readLocomotorEnumString(exports, memory, "priority", priority),
      canMoveBackwards: exports.generals_locomotor_template_can_move_backwards(index),
      allowAirborneMotiveForce: exports.generals_locomotor_template_allow_airborne_motive_force(index),
    };

    if (preview.length < 12) {
      preview.push(template);
    }
    if (template.name === "BasicHumanLocomotor") {
      basicHuman = template;
    } else if (template.name === "RocketBuggyLocomotor") {
      rocketBuggy = template;
    } else if (template.name === "ComancheLocomotor") {
      comanche = template;
    } else if (template.name === "AuroraJetLocomotor") {
      aurora = template;
    }
  }

  return {
    file: locomotorEntry.name,
    templateCount,
    fieldCount: exports.generals_locomotor_field_count(),
    groundCount: exports.generals_locomotor_ground_template_count(),
    airCount: exports.generals_locomotor_air_template_count(),
    waterCount: exports.generals_locomotor_water_template_count(),
    cliffCount: exports.generals_locomotor_cliff_template_count(),
    preview,
    basicHuman,
    rocketBuggy,
    comanche,
    aurora,
  };
}

function renderLocomotorParse(result) {
  if (!result) {
    renderLocomotorEmpty("no locomotor data");
    return;
  }

  elements.locomotorTemplates.textContent = `${result.templateCount} templates`;
  elements.locomotorFields.textContent = `${result.fieldCount} fields`;
  elements.locomotorGround.textContent = `${result.groundCount} ground`;
  elements.locomotorAir.textContent = `${result.airCount} air`;

  if (result.basicHuman) {
    elements.locomotorFirst.textContent = `${result.file}: ${result.basicHuman.name} ${result.basicHuman.surfaces}, speed ${formatRealX100(result.basicHuman.speed)}, ${result.basicHuman.appearance}`;
  } else {
    const first = result.preview[0];
    elements.locomotorFirst.textContent = first ? `${result.file}: ${first.name}` : "no locomotor data";
  }

  const lines = [
    `${result.templateCount} templates, ${result.fieldCount} fields`,
    `surfaces ground ${result.groundCount}, air ${result.airCount}, water ${result.waterCount}, cliff ${result.cliffCount}`,
  ];

  if (result.basicHuman) {
    lines.push(`${result.basicHuman.name}: ${result.basicHuman.surfaces}, ${result.basicHuman.appearance}, speed ${formatRealX100(result.basicHuman.speed)} / damaged ${formatRealX100(result.basicHuman.speedDamaged)}, accel ${formatRealX100(result.basicHuman.acceleration)}, ${result.basicHuman.priority}`);
  }
  if (result.rocketBuggy) {
    lines.push(`${result.rocketBuggy.name}: ${result.rocketBuggy.surfaces}, speed ${formatRealX100(result.rocketBuggy.speed)}, braking ${formatRealX100(result.rocketBuggy.braking)}, backwards ${result.rocketBuggy.canMoveBackwards ? "yes" : "no"}`);
  }
  if (result.comanche) {
    lines.push(`${result.comanche.name}: ${result.comanche.appearance}, ${result.comanche.behaviorZ}, height ${formatRealX100(result.comanche.preferredHeight)}, airborne force ${result.comanche.allowAirborneMotiveForce ? "yes" : "no"}`);
  }
  if (result.aurora) {
    lines.push(`${result.aurora.name}: ${result.aurora.appearance}, speed ${formatRealX100(result.aurora.speed)}, min ${formatRealX100(result.aurora.minSpeed)}`);
  }

  lines.push("");
  lines.push(...result.preview.map((template) => `${template.name}: ${template.surfaces}, ${template.appearance}, ${template.fields} fields, line ${template.line}`));
  elements.locomotorListing.textContent = lines.join("\n");
}

function renderFxListEmpty(reason) {
  elements.fxlistLists.textContent = "0 lists";
  elements.fxlistNuggets.textContent = "0 nuggets";
  elements.fxlistParticles.textContent = "0 particles";
  elements.fxlistSounds.textContent = "0 sounds";
  elements.fxlistFirst.textContent = reason;
  elements.fxlistListing.textContent = reason;
}

function readFxListString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readFxListName(exports, memory, index) {
  return readFxListString(
    exports,
    memory,
    "generals_fxlist_list_name_ptr",
    "generals_fxlist_list_name_size",
    index
  );
}

function readFxListTypeName(exports, memory, type) {
  return readFxListString(
    exports,
    memory,
    "generals_fxlist_type_name_ptr",
    "generals_fxlist_type_name_size",
    type
  );
}

function readFxListNuggetString(exports, memory, prefix, index) {
  return readFxListString(
    exports,
    memory,
    `generals_fxlist_nugget_${prefix}_ptr`,
    `generals_fxlist_nugget_${prefix}_size`,
    index
  );
}

function parseFxListPayload(bytes) {
  const { exports, memory } = fxlistRuntime;
  const inputOffset = exports.generals_fxlist_input_ptr();

  if (bytes.length > exports.generals_fxlist_input_capacity()) {
    throw new Error(`FXList payload exceeds ${exports.generals_fxlist_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const listCount = exports.generals_fxlist_parse(bytes.length);

  if (listCount < 0 || exports.generals_fxlist_error_count() !== 0) {
    throw new Error(`FXList parse failed with ${exports.generals_fxlist_error_count()} errors`);
  }

  return listCount;
}

function readFxListNugget(exports, memory, index) {
  if (index < 0) {
    return null;
  }

  const type = exports.generals_fxlist_nugget_type(index);
  return {
    type: readFxListTypeName(exports, memory, type),
    line: exports.generals_fxlist_nugget_line(index),
    fields: exports.generals_fxlist_nugget_field_count(index),
    target: readFxListNuggetString(exports, memory, "target", index),
    secondary: readFxListNuggetString(exports, memory, "secondary", index),
    count: exports.generals_fxlist_nugget_count_value(index),
    radius: exports.generals_fxlist_nugget_radius_x100(index),
  };
}

function formatFxListNugget(nugget) {
  if (!nugget) {
    return "empty";
  }

  const target = nugget.target ? ` ${nugget.target}` : "";
  const secondary = nugget.secondary ? ` @ ${nugget.secondary}` : "";
  const count = nugget.count !== 1 ? ` x${nugget.count}` : "";
  const radius = nugget.radius ? ` radius ${formatRealX100(nugget.radius)}` : "";
  return `${nugget.type}${target}${secondary}${count}${radius}`;
}

function parseFxListEntries(entries, archiveMemory) {
  const fxlistEntry = findEntry(entries, "data/ini/fxlist.ini");
  if (!fxlistEntry) {
    return null;
  }

  const { exports, memory } = fxlistRuntime;
  const listCount = parseFxListPayload(entryBytes(fxlistEntry, archiveMemory));
  const preview = [];
  let toxinShell = null;
  let crushedCar = null;
  let emptyDie = null;
  let tankExplosion = null;
  let nuke = null;

  for (let index = 0; index < listCount; ++index) {
    const firstNugget = exports.generals_fxlist_list_first_nugget(index);
    const nuggetCount = exports.generals_fxlist_list_nugget_count(index);
    const list = {
      name: readFxListName(exports, memory, index),
      line: exports.generals_fxlist_list_line(index),
      nuggets: nuggetCount,
      first: nuggetCount > 0 ? readFxListNugget(exports, memory, firstNugget) : null,
    };

    if (preview.length < 12) {
      preview.push(list);
    }
    if (list.name === "WeaponFX_ToxinShellWeapon") {
      toxinShell = list;
    } else if (list.name === "FX_CarOverlappedByCrusher") {
      crushedCar = list;
    } else if (list.name === "FX_GIDie") {
      emptyDie = list;
    } else if (list.name === "FX_GenericTankDeathExplosion") {
      tankExplosion = list;
    } else if (list.name === "FX_Nuke") {
      nuke = list;
    }
  }

  return {
    file: fxlistEntry.name,
    listCount,
    nuggetCount: exports.generals_fxlist_nugget_count(),
    fieldCount: exports.generals_fxlist_field_count(),
    soundCount: exports.generals_fxlist_type_count(0),
    rayEffectCount: exports.generals_fxlist_type_count(1),
    tracerCount: exports.generals_fxlist_type_count(2),
    lightPulseCount: exports.generals_fxlist_type_count(3),
    viewShakeCount: exports.generals_fxlist_type_count(4),
    terrainScorchCount: exports.generals_fxlist_type_count(5),
    particleSystemCount: exports.generals_fxlist_type_count(6),
    atBoneCount: exports.generals_fxlist_type_count(7),
    preview,
    toxinShell,
    crushedCar,
    emptyDie,
    tankExplosion,
    nuke,
  };
}

function renderFxListParse(result) {
  if (!result) {
    renderFxListEmpty("no FX list data");
    return;
  }

  elements.fxlistLists.textContent = `${result.listCount} lists`;
  elements.fxlistNuggets.textContent = `${result.nuggetCount} nuggets`;
  elements.fxlistParticles.textContent = `${result.particleSystemCount} particles`;
  elements.fxlistSounds.textContent = `${result.soundCount} sounds`;

  if (result.toxinShell) {
    elements.fxlistFirst.textContent = `${result.file}: ${result.toxinShell.name} -> ${formatFxListNugget(result.toxinShell.first)}`;
  } else {
    const first = result.preview[0];
    elements.fxlistFirst.textContent = first ? `${result.file}: ${first.name}` : "no FX list data";
  }

  const lines = [
    `${result.listCount} lists, ${result.nuggetCount} nuggets, ${result.fieldCount} fields`,
    `types sound ${result.soundCount}, tracer ${result.tracerCount}, light ${result.lightPulseCount}, shake ${result.viewShakeCount}, scorch ${result.terrainScorchCount}, particle ${result.particleSystemCount}, bone ${result.atBoneCount}`,
  ];

  if (result.toxinShell) {
    lines.push(`${result.toxinShell.name}: ${formatFxListNugget(result.toxinShell.first)}`);
  }
  if (result.crushedCar) {
    lines.push(`${result.crushedCar.name}: ${formatFxListNugget(result.crushedCar.first)}`);
  }
  if (result.emptyDie) {
    lines.push(`${result.emptyDie.name}: ${result.emptyDie.nuggets} nuggets`);
  }
  if (result.tankExplosion) {
    lines.push(`${result.tankExplosion.name}: ${result.tankExplosion.nuggets} nuggets, first ${formatFxListNugget(result.tankExplosion.first)}`);
  }
  if (result.nuke) {
    lines.push(`${result.nuke.name}: ${result.nuke.nuggets} nuggets, first ${formatFxListNugget(result.nuke.first)}`);
  }

  lines.push("");
  lines.push(...result.preview.map((list) => `${list.name}: ${list.nuggets} nuggets, ${formatFxListNugget(list.first)}, line ${list.line}`));
  elements.fxlistListing.textContent = lines.join("\n");
}

function renderParticleEmpty(reason) {
  elements.particleTemplates.textContent = "0 systems";
  elements.particleFields.textContent = "0 fields";
  elements.particleTextures.textContent = "0 sprites";
  elements.particleCritical.textContent = "0 critical";
  elements.particleFirst.textContent = reason;
  elements.particleListing.textContent = reason;
}

function readParticleString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readParticleTemplateString(exports, memory, prefix, index) {
  return readParticleString(
    exports,
    memory,
    `generals_particle_template_${prefix}_ptr`,
    `generals_particle_template_${prefix}_size`,
    index
  );
}

function readParticleEnumString(exports, memory, kind, index) {
  return readParticleString(
    exports,
    memory,
    `generals_particle_${kind}_name_ptr`,
    `generals_particle_${kind}_name_size`,
    index
  );
}

function parseParticlePayload(bytes) {
  const { exports, memory } = particleRuntime;
  const inputOffset = exports.generals_particle_input_ptr();

  if (bytes.length > exports.generals_particle_input_capacity()) {
    throw new Error(`ParticleSystem payload exceeds ${exports.generals_particle_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const templateCount = exports.generals_particle_parse(bytes.length);

  if (templateCount < 0 || exports.generals_particle_error_count() !== 0) {
    throw new Error(`ParticleSystem parse failed with ${exports.generals_particle_error_count()} errors`);
  }

  return templateCount;
}

function readParticleTemplate(exports, memory, index) {
  const priority = exports.generals_particle_template_priority(index);
  const shader = exports.generals_particle_template_shader(index);
  const type = exports.generals_particle_template_type(index);
  const velocity = exports.generals_particle_template_velocity_type(index);
  const volume = exports.generals_particle_template_volume_type(index);
  return {
    name: readParticleTemplateString(exports, memory, "name", index),
    particleName: readParticleTemplateString(exports, memory, "particle_name", index),
    slaveSystem: readParticleTemplateString(exports, memory, "slave_system", index),
    attachedSystem: readParticleTemplateString(exports, memory, "attached_system", index),
    line: exports.generals_particle_template_line(index),
    fields: exports.generals_particle_template_field_count_at(index),
    priority: readParticleEnumString(exports, memory, "priority", priority),
    shader: readParticleEnumString(exports, memory, "shader", shader),
    type: readParticleEnumString(exports, memory, "type", type),
    velocity: readParticleEnumString(exports, memory, "velocity", velocity),
    volume: readParticleEnumString(exports, memory, "volume", volume),
    lifetimeLow: exports.generals_particle_template_lifetime_low_x100(index),
    lifetimeHigh: exports.generals_particle_template_lifetime_high_x100(index),
    sizeLow: exports.generals_particle_template_size_low_x100(index),
    sizeHigh: exports.generals_particle_template_size_high_x100(index),
    burstDelayLow: exports.generals_particle_template_burst_delay_low_x100(index),
    burstDelayHigh: exports.generals_particle_template_burst_delay_high_x100(index),
    burstCountLow: exports.generals_particle_template_burst_count_low_x100(index),
    burstCountHigh: exports.generals_particle_template_burst_count_high_x100(index),
    volumeRadius: exports.generals_particle_template_volume_radius_x100(index),
    volumeLength: exports.generals_particle_template_volume_length_x100(index),
    isHollow: exports.generals_particle_template_is_hollow(index),
    isEmitAboveGroundOnly: exports.generals_particle_template_is_emit_above_ground_only(index),
  };
}

function formatRangeX100(low, high) {
  return low === high ? formatRealX100(low) : `${formatRealX100(low)}-${formatRealX100(high)}`;
}

function formatParticleTemplate(template) {
  const texture = template.particleName ? ` -> ${template.particleName}` : "";
  const slave = template.slaveSystem ? `, slave ${template.slaveSystem}` : "";
  const attached = template.attachedSystem ? `, attached ${template.attachedSystem}` : "";
  const radius = template.volumeRadius ? ` radius ${formatRealX100(template.volumeRadius)}` : "";
  const length = template.volumeLength ? ` length ${formatRealX100(template.volumeLength)}` : "";
  const flags = [
    template.isHollow ? "hollow" : "",
    template.isEmitAboveGroundOnly ? "above ground" : "",
  ].filter(Boolean).join(", ");
  const flagText = flags ? `, ${flags}` : "";
  const burst = `, burst ${formatRangeX100(template.burstCountLow, template.burstCountHigh)} every ${formatRangeX100(template.burstDelayLow, template.burstDelayHigh)}`;
  return `${template.name}${texture}, ${template.shader}/${template.type}, ${template.priority}, life ${formatRangeX100(template.lifetimeLow, template.lifetimeHigh)}, size ${formatRangeX100(template.sizeLow, template.sizeHigh)}, ${template.velocity}/${template.volume}${radius}${length}${burst}${slave}${attached}${flagText}`;
}

function parseParticleEntries(entries, archiveMemory) {
  const particleEntry = findEntry(entries, "data/ini/particlesystem.ini");
  if (!particleEntry) {
    return null;
  }

  const { exports, memory } = particleRuntime;
  const templateCount = parseParticlePayload(entryBytes(particleEntry, archiveMemory));
  const preview = [];
  const textureNames = new Set();
  let first = null;
  let jetContrailThin = null;
  let smallTankStruckSmoke = null;
  let nukeMushroomExplosion = null;
  let toxicShellExplosion = null;

  for (let index = 0; index < templateCount; ++index) {
    const template = readParticleTemplate(exports, memory, index);
    if (template.particleName) {
      textureNames.add(template.particleName);
    }
    if (index === 0) {
      first = template;
    }
    if (preview.length < 12) {
      preview.push(template);
    }
    if (template.name === "JetContrailThin") {
      jetContrailThin = template;
    } else if (template.name === "SmallTankStruckSmoke") {
      smallTankStruckSmoke = template;
    } else if (template.name === "NukeMushroomExplosion") {
      nukeMushroomExplosion = template;
    } else if (template.name === "ToxicShellExplosion") {
      toxicShellExplosion = template;
    }
  }

  return {
    file: particleEntry.name,
    templateCount,
    fieldCount: exports.generals_particle_field_count(),
    shaderAdditiveCount: exports.generals_particle_shader_count(1),
    shaderAlphaCount: exports.generals_particle_shader_count(2),
    shaderAlphaTestCount: exports.generals_particle_shader_count(3),
    shaderMultiplyCount: exports.generals_particle_shader_count(4),
    typeParticleCount: exports.generals_particle_type_count(1),
    typeDrawableCount: exports.generals_particle_type_count(2),
    typeStreakCount: exports.generals_particle_type_count(3),
    typeVolumeParticleCount: exports.generals_particle_type_count(4),
    velocityOutwardCount: exports.generals_particle_velocity_count(5),
    volumePointCount: exports.generals_particle_volume_count(1),
    volumeLineCount: exports.generals_particle_volume_count(2),
    volumeBoxCount: exports.generals_particle_volume_count(3),
    volumeSphereCount: exports.generals_particle_volume_count(4),
    volumeCylinderCount: exports.generals_particle_volume_count(5),
    priorityWeaponExplosionCount: exports.generals_particle_priority_count(1),
    priorityWeaponTrailCount: exports.generals_particle_priority_count(10),
    priorityCriticalCount: exports.generals_particle_priority_count(12),
    textureCount: textureNames.size,
    preview,
    first,
    jetContrailThin,
    smallTankStruckSmoke,
    nukeMushroomExplosion,
    toxicShellExplosion,
  };
}

function renderParticleParse(result) {
  if (!result) {
    renderParticleEmpty("no particle system data");
    return;
  }

  elements.particleTemplates.textContent = `${result.templateCount} systems`;
  elements.particleFields.textContent = `${result.fieldCount} fields`;
  elements.particleTextures.textContent = `${result.textureCount} sprites`;
  elements.particleCritical.textContent = `${result.priorityCriticalCount} critical`;

  if (result.first) {
    elements.particleFirst.textContent = `${result.file}: ${result.first.name} -> ${result.first.particleName}, ${result.first.shader}/${result.first.type}`;
  } else {
    elements.particleFirst.textContent = "no particle system data";
  }

  const lines = [
    `${result.templateCount} systems, ${result.fieldCount} fields, ${result.textureCount} referenced sprites`,
    `shader additive ${result.shaderAdditiveCount}, alpha ${result.shaderAlphaCount}, alpha test ${result.shaderAlphaTestCount}, multiply ${result.shaderMultiplyCount}`,
    `types particle ${result.typeParticleCount}, streak ${result.typeStreakCount}, volume ${result.typeVolumeParticleCount}, drawable ${result.typeDrawableCount}`,
    `velocity outward ${result.velocityOutwardCount}; volumes point ${result.volumePointCount}, line ${result.volumeLineCount}, box ${result.volumeBoxCount}, sphere ${result.volumeSphereCount}, cylinder ${result.volumeCylinderCount}`,
    `priority weapon explosion ${result.priorityWeaponExplosionCount}, weapon trail ${result.priorityWeaponTrailCount}, critical ${result.priorityCriticalCount}`,
  ];

  if (result.first) {
    lines.push(formatParticleTemplate(result.first));
  }
  if (result.jetContrailThin) {
    lines.push(formatParticleTemplate(result.jetContrailThin));
  }
  if (result.smallTankStruckSmoke) {
    lines.push(formatParticleTemplate(result.smallTankStruckSmoke));
  }
  if (result.nukeMushroomExplosion) {
    lines.push(formatParticleTemplate(result.nukeMushroomExplosion));
  }
  if (result.toxicShellExplosion) {
    lines.push(formatParticleTemplate(result.toxicShellExplosion));
  }

  lines.push("");
  lines.push(...result.preview.map((template) => `${template.name}: ${template.particleName || "no sprite"}, ${template.shader}/${template.type}, ${template.fields} fields, line ${template.line}`));
  elements.particleListing.textContent = lines.join("\n");
}

function renderAudioEmpty(reason) {
  elements.audioEvents.textContent = "0 events";
  elements.audioFields.textContent = "0 fields";
  elements.audioSounds.textContent = "0 refs";
  elements.audioDialog.textContent = "0 dialogs";
  elements.audioFirst.textContent = reason;
  elements.audioListing.textContent = reason;
}

function readAudioString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readAudioEventString(exports, memory, prefix, index) {
  return readAudioString(
    exports,
    memory,
    `generals_audio_event_${prefix}_ptr`,
    `generals_audio_event_${prefix}_size`,
    index
  );
}

function readAudioEnumString(exports, memory, kind, index) {
  return readAudioString(
    exports,
    memory,
    `generals_audio_${kind}_name_ptr`,
    `generals_audio_${kind}_name_size`,
    index
  );
}

function parseAudioPayload(bytes) {
  const { exports, memory } = audioRuntime;
  const inputOffset = exports.generals_audio_input_ptr();

  if (bytes.length > exports.generals_audio_input_capacity()) {
    throw new Error(`AudioEvent payload exceeds ${exports.generals_audio_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const eventCount = exports.generals_audio_parse(bytes.length);

  if (eventCount < 0 || exports.generals_audio_error_count() !== 0) {
    throw new Error(`AudioEvent parse failed with ${exports.generals_audio_error_count()} errors`);
  }

  return eventCount;
}

function readAudioEvent(exports, memory, index, file) {
  const category = exports.generals_audio_event_category(index);
  const priority = exports.generals_audio_event_priority(index);
  return {
    file,
    name: readAudioEventString(exports, memory, "name", index),
    filename: readAudioEventString(exports, memory, "filename", index),
    sounds: readAudioEventString(exports, memory, "sounds", index),
    attack: readAudioEventString(exports, memory, "attack", index),
    decay: readAudioEventString(exports, memory, "decay", index),
    category: readAudioEnumString(exports, memory, "category", category),
    priority: readAudioEnumString(exports, memory, "priority", priority),
    fields: exports.generals_audio_event_field_count_at(index),
    line: exports.generals_audio_event_line(index),
    typeMask: exports.generals_audio_event_type_mask(index),
    controlMask: exports.generals_audio_event_control_mask(index),
    volume: exports.generals_audio_event_volume_x100(index),
    volumeShift: exports.generals_audio_event_volume_shift_x100(index),
    pitchMin: exports.generals_audio_event_pitch_shift_min_x100(index),
    pitchMax: exports.generals_audio_event_pitch_shift_max_x100(index),
    limit: exports.generals_audio_event_limit(index),
    minRange: exports.generals_audio_event_min_range_x100(index),
    maxRange: exports.generals_audio_event_max_range_x100(index),
    soundTokens: exports.generals_audio_event_sound_token_count(index),
  };
}

function audioFlagNames(exports, memory, kind, count, mask) {
  const names = [];
  for (let index = 0; index < count; ++index) {
    if (mask & (1 << index)) {
      names.push(readAudioEnumString(exports, memory, kind, index));
    }
  }
  return names.join(" ") || "none";
}

function formatAudioEvent(event, exports, memory) {
  const source = event.filename || event.sounds || "no source";
  const type = audioFlagNames(exports, memory, "type", 9, event.typeMask);
  const control = audioFlagNames(exports, memory, "control", 5, event.controlMask);
  const attack = event.attack ? `, attack ${event.attack}` : "";
  const decay = event.decay ? `, decay ${event.decay}` : "";
  const range = event.maxRange ? `, range ${formatRealX100(event.minRange)}-${formatRealX100(event.maxRange)}` : "";
  return `${event.category} ${event.name}: ${source}, ${event.priority}, volume ${formatRealX100(event.volume)}, ${type}, ${control}${attack}${decay}${range}`;
}

function parseAudioEntries(entries, archiveMemory) {
  const audioFiles = [
    "data/ini/default/soundeffects.ini",
    "data/ini/music.ini",
    "data/ini/soundeffects.ini",
    "data/ini/speech.ini",
    "data/ini/voice.ini",
  ];
  const presentEntries = audioFiles
    .map((name) => findEntry(entries, name))
    .filter(Boolean);

  if (presentEntries.length === 0) {
    return null;
  }

  const { exports, memory } = audioRuntime;
  const preview = [];
  let eventCount = 0;
  let fieldCount = 0;
  let soundReferenceCount = 0;
  let audioEventCount = 0;
  let musicTrackCount = 0;
  let dialogEventCount = 0;
  let uiCount = 0;
  let worldCount = 0;
  let voiceCount = 0;
  let globalCount = 0;
  let randomCount = 0;
  let loopCount = 0;
  let defaultSoundEffect = null;
  let track1 = null;
  let genericTankMoveLoop = null;
  let explosion = null;
  let evaUnderAttack = null;
  let rangerVoiceSelect = null;

  for (const entry of presentEntries) {
    const parsedCount = parseAudioPayload(entryBytes(entry, archiveMemory));
    eventCount += parsedCount;
    fieldCount += exports.generals_audio_field_count();
    soundReferenceCount += exports.generals_audio_sound_reference_count();
    audioEventCount += exports.generals_audio_category_count(0);
    musicTrackCount += exports.generals_audio_category_count(1);
    dialogEventCount += exports.generals_audio_category_count(2);
    uiCount += exports.generals_audio_type_flag_count(0);
    worldCount += exports.generals_audio_type_flag_count(1);
    globalCount += exports.generals_audio_type_flag_count(3);
    voiceCount += exports.generals_audio_type_flag_count(4);
    loopCount += exports.generals_audio_control_flag_count(0);
    randomCount += exports.generals_audio_control_flag_count(1);

    for (let index = 0; index < parsedCount; ++index) {
      const event = readAudioEvent(exports, memory, index, entry.name);
      if (preview.length < 12) {
        preview.push(event);
      }
      if (event.name === "DefaultSoundEffect") {
        defaultSoundEffect = event;
      } else if (event.name === "Track1") {
        track1 = event;
      } else if (event.name === "GenericTankMoveLoop") {
        genericTankMoveLoop = event;
      } else if (event.name === "Explosion") {
        explosion = event;
      } else if (event.name === "EvaGLA_AllyUnderAttack") {
        evaUnderAttack = event;
      } else if (event.name === "RangerVoiceSelect") {
        rangerVoiceSelect = event;
      }
    }
  }

  return {
    eventCount,
    fieldCount,
    soundReferenceCount,
    audioEventCount,
    musicTrackCount,
    dialogEventCount,
    uiCount,
    worldCount,
    voiceCount,
    globalCount,
    loopCount,
    randomCount,
    preview,
    defaultSoundEffect,
    track1,
    genericTankMoveLoop,
    explosion,
    evaUnderAttack,
    rangerVoiceSelect,
  };
}

function renderAudioParse(result) {
  if (!result) {
    renderAudioEmpty("no audio data");
    return;
  }

  const { exports, memory } = audioRuntime;
  elements.audioEvents.textContent = `${result.eventCount} events`;
  elements.audioFields.textContent = `${result.fieldCount} fields`;
  elements.audioSounds.textContent = `${result.soundReferenceCount} refs`;
  elements.audioDialog.textContent = `${result.dialogEventCount} dialogs`;

  if (result.genericTankMoveLoop) {
    elements.audioFirst.textContent = `Audio: ${result.genericTankMoveLoop.name} -> ${result.genericTankMoveLoop.sounds}, ${result.genericTankMoveLoop.priority}`;
  } else {
    const first = result.preview[0];
    elements.audioFirst.textContent = first ? `Audio: ${first.name}` : "no audio data";
  }

  const lines = [
    `${result.eventCount} events, ${result.fieldCount} fields, ${result.soundReferenceCount} sound refs`,
    `categories audio ${result.audioEventCount}, music ${result.musicTrackCount}, dialog ${result.dialogEventCount}`,
    `type flags ui ${result.uiCount}, world ${result.worldCount}, voice ${result.voiceCount}, global ${result.globalCount}`,
    `control flags random ${result.randomCount}, loop ${result.loopCount}`,
  ];

  for (const event of [
    result.defaultSoundEffect,
    result.track1,
    result.genericTankMoveLoop,
    result.explosion,
    result.evaUnderAttack,
    result.rangerVoiceSelect,
  ]) {
    if (event) {
      lines.push(formatAudioEvent(event, exports, memory));
    }
  }

  lines.push("");
  lines.push(...result.preview.map((event) => `${event.file}: ${event.name}, ${event.category}, ${event.fields} fields, line ${event.line}`));
  elements.audioListing.textContent = lines.join("\n");
}

function renderMiscAudioEmpty(reason) {
  elements.miscAudioSlots.textContent = "0 slots";
  elements.miscAudioEvents.textContent = "0 hooks";
  elements.miscAudioNoSound.textContent = "0 NoSound";
  elements.miscAudioMissing.textContent = "0 unset";
  elements.miscAudioFirst.textContent = reason;
  elements.miscAudioListing.textContent = reason;
}

function readMiscAudioString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readMiscAudioSlot(exports, memory, index) {
  return {
    index,
    field: readMiscAudioString(
      exports,
      memory,
      "generals_miscaudio_slot_field_ptr",
      "generals_miscaudio_slot_field_size",
      index
    ),
    event: readMiscAudioString(
      exports,
      memory,
      "generals_miscaudio_slot_event_ptr",
      "generals_miscaudio_slot_event_size",
      index
    ),
    line: exports.generals_miscaudio_slot_line(index),
    assigned: exports.generals_miscaudio_slot_assigned(index),
    hasEvent: exports.generals_miscaudio_slot_has_event(index),
    noSound: exports.generals_miscaudio_slot_no_sound(index),
  };
}

function parseMiscAudioPayload(bytes) {
  const { exports, memory } = miscAudioRuntime;
  const inputOffset = exports.generals_miscaudio_input_ptr();

  if (bytes.length > exports.generals_miscaudio_input_capacity()) {
    throw new Error(`MiscAudio payload exceeds ${exports.generals_miscaudio_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const eventCount = exports.generals_miscaudio_parse(bytes.length);

  if (eventCount < 0 || exports.generals_miscaudio_error_count() !== 0) {
    throw new Error(`MiscAudio parse failed with ${exports.generals_miscaudio_error_count()} errors`);
  }

  return eventCount;
}

function formatMiscAudioSlot(slot) {
  if (slot.hasEvent) {
    return `${slot.field}: ${slot.event}, line ${slot.line}`;
  }
  if (slot.noSound) {
    return `${slot.field}: NoSound, line ${slot.line}`;
  }
  return `${slot.field}: unset`;
}

function parseMiscAudioEntries(entries, archiveMemory) {
  const entry = findEntry(entries, "data/ini/miscaudio.ini");
  if (!entry) {
    return null;
  }

  const { exports, memory } = miscAudioRuntime;
  parseMiscAudioPayload(entryBytes(entry, archiveMemory));

  const preview = [];
  let radarUnitUnderAttack = null;
  let radarInfiltration = null;
  let defectorDing = null;
  let crateSalvage = null;
  let sabotagePower = null;
  let sabotageReset = null;
  let aircraftWheelScreech = null;

  for (let index = 0; index < exports.generals_miscaudio_slot_count(); ++index) {
    const slot = readMiscAudioSlot(exports, memory, index);
    preview.push(slot);

    if (slot.field === "RadarNotifyUnitUnderAttackSound") {
      radarUnitUnderAttack = slot;
    } else if (slot.field === "RadarNotifyInfiltrationSound") {
      radarInfiltration = slot;
    } else if (slot.field === "DefectorTimerDingSound") {
      defectorDing = slot;
    } else if (slot.field === "CrateSalvage") {
      crateSalvage = slot;
    } else if (slot.field === "SabotageShutDownBuilding") {
      sabotagePower = slot;
    } else if (slot.field === "SabotageResetTimeBuilding") {
      sabotageReset = slot;
    } else if (slot.field === "AircraftWheelScreech") {
      aircraftWheelScreech = slot;
    }
  }

  return {
    file: entry.name,
    slotCount: exports.generals_miscaudio_slot_count(),
    fieldCount: exports.generals_miscaudio_field_count(),
    assignedCount: exports.generals_miscaudio_assigned_count(),
    eventCount: exports.generals_miscaudio_event_count(),
    noSoundCount: exports.generals_miscaudio_no_sound_count(),
    missingCount: exports.generals_miscaudio_missing_count(),
    lineCount: exports.generals_miscaudio_line_count(),
    preview,
    radarUnitUnderAttack,
    radarInfiltration,
    defectorDing,
    crateSalvage,
    sabotagePower,
    sabotageReset,
    aircraftWheelScreech,
  };
}

function renderMiscAudioParse(result) {
  if (!result) {
    renderMiscAudioEmpty("no miscellaneous audio data");
    return;
  }

  elements.miscAudioSlots.textContent = `${result.slotCount} slots`;
  elements.miscAudioEvents.textContent = `${result.eventCount} hooks`;
  elements.miscAudioNoSound.textContent = `${result.noSoundCount} NoSound`;
  elements.miscAudioMissing.textContent = `${result.missingCount} unset`;

  if (result.sabotagePower) {
    elements.miscAudioFirst.textContent = `MiscAudio: ${result.sabotagePower.field} -> ${result.sabotagePower.event}, ${result.eventCount} hooks`;
  } else {
    const first = result.preview[0];
    elements.miscAudioFirst.textContent = first ? `MiscAudio: ${first.field}` : "no miscellaneous audio data";
  }

  const lines = [
    `${result.file}: ${result.slotCount} native slots, ${result.assignedCount} assigned, ${result.eventCount} active hooks`,
    `${result.fieldCount} source fields, ${result.noSoundCount} NoSound, ${result.missingCount} unset-or-muted slots, ${result.lineCount} lines`,
  ];

  for (const slot of [
    result.radarUnitUnderAttack,
    result.radarInfiltration,
    result.defectorDing,
    result.crateSalvage,
    result.sabotagePower,
    result.sabotageReset,
    result.aircraftWheelScreech,
  ]) {
    if (slot) {
      lines.push(formatMiscAudioSlot(slot));
    }
  }

  lines.push("");
  lines.push(...result.preview.slice(0, 16).map(formatMiscAudioSlot));
  elements.miscAudioListing.textContent = lines.join("\n");
}

function renderDamageFxEmpty(reason) {
  elements.damageFxTemplates.textContent = "0 templates";
  elements.damageFxAssignments.textContent = "0 fields";
  elements.damageFxMajor.textContent = "0 major";
  elements.damageFxThrottle.textContent = "0 throttle";
  elements.damageFxFirst.textContent = reason;
  elements.damageFxListing.textContent = reason;
}

function readDamageFxString(exports, memory, ptrFn, sizeFn, ...args) {
  const ptr = exports[ptrFn](...args);
  const size = exports[sizeFn](...args);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readDamageFxTemplateName(exports, memory, index) {
  return readDamageFxString(
    exports,
    memory,
    "generals_damagefx_template_name_ptr",
    "generals_damagefx_template_name_size",
    index
  );
}

function readDamageFxCellString(exports, memory, prefix, templateIndex, damageType, veterancy) {
  return readDamageFxString(
    exports,
    memory,
    `generals_damagefx_cell_${prefix}_ptr`,
    `generals_damagefx_cell_${prefix}_size`,
    templateIndex,
    damageType,
    veterancy
  );
}

function parseDamageFxPayload(bytes) {
  const { exports, memory } = damageFxRuntime;
  const inputOffset = exports.generals_damagefx_input_ptr();

  if (bytes.length > exports.generals_damagefx_input_capacity()) {
    throw new Error(`DamageFX payload exceeds ${exports.generals_damagefx_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const templateCount = exports.generals_damagefx_parse(bytes.length);

  if (templateCount < 0 || exports.generals_damagefx_error_count() !== 0) {
    throw new Error(`DamageFX parse failed with ${exports.generals_damagefx_error_count()} errors`);
  }

  return templateCount;
}

function readDamageFxCell(exports, memory, templateIndex, damageType) {
  const regularVeterancy = 0;
  return {
    amount: exports.generals_damagefx_cell_amount_x100(templateIndex, damageType, regularVeterancy),
    major: readDamageFxCellString(exports, memory, "major_fx", templateIndex, damageType, regularVeterancy),
    minor: readDamageFxCellString(exports, memory, "minor_fx", templateIndex, damageType, regularVeterancy),
    throttle: exports.generals_damagefx_cell_throttle_time(templateIndex, damageType, regularVeterancy),
  };
}

function readDamageFxTemplate(exports, memory, index) {
  return {
    index,
    name: readDamageFxTemplateName(exports, memory, index),
    line: exports.generals_damagefx_template_line(index),
    assignments: exports.generals_damagefx_template_assignment_count(index),
    explosion: readDamageFxCell(exports, memory, index, 0),
    crush: readDamageFxCell(exports, memory, index, 1),
    water: readDamageFxCell(exports, memory, index, 12),
  };
}

function formatDamageFxCell(cell) {
  const major = cell.major || "none";
  const minor = cell.minor || "none";
  return `${major}/${minor}, amount ${formatRealX100(cell.amount)}, throttle ${cell.throttle}`;
}

function formatDamageFxTemplate(template) {
  return `${template.name}: ${template.assignments} fields; explosion ${formatDamageFxCell(template.explosion)}; crush ${formatDamageFxCell(template.crush)}; water ${template.water.major || "none"}/${template.water.minor || "none"}`;
}

function parseDamageFxEntries(entries, archiveMemory) {
  const entry = findEntry(entries, "data/ini/damagefx.ini");
  if (!entry) {
    return null;
  }

  const { exports, memory } = damageFxRuntime;
  parseDamageFxPayload(entryBytes(entry, archiveMemory));

  const preview = [];
  let defaultDamage = null;
  let crushableCar = null;
  let tank = null;
  let infantry = null;
  let empty = null;

  for (let index = 0; index < exports.generals_damagefx_template_count(); ++index) {
    const template = readDamageFxTemplate(exports, memory, index);
    if (preview.length < 8) {
      preview.push(template);
    }
    if (template.name === "DefaultDamageFX") {
      defaultDamage = template;
    } else if (template.name === "CrushableCarDamageFX") {
      crushableCar = template;
    } else if (template.name === "TankDamageFX") {
      tank = template;
    } else if (template.name === "InfantryDamageFX") {
      infantry = template;
    } else if (template.name === "EmptyDamageFX") {
      empty = template;
    }
  }

  return {
    templateCount: exports.generals_damagefx_template_count(),
    assignmentCount: exports.generals_damagefx_assignment_count(),
    resolvedUpdateCount: exports.generals_damagefx_resolved_update_count(),
    amountCellCount: exports.generals_damagefx_amount_cell_count(),
    majorFxCellCount: exports.generals_damagefx_major_fx_cell_count(),
    minorFxCellCount: exports.generals_damagefx_minor_fx_cell_count(),
    throttleCellCount: exports.generals_damagefx_throttle_cell_count(),
    veterancyAssignmentCount: exports.generals_damagefx_veterancy_assignment_count(),
    preview,
    defaultDamage,
    crushableCar,
    tank,
    infantry,
    empty,
  };
}

function renderDamageFxParse(result) {
  if (!result) {
    renderDamageFxEmpty("no damage FX data");
    return;
  }

  elements.damageFxTemplates.textContent = `${result.templateCount} templates`;
  elements.damageFxAssignments.textContent = `${result.assignmentCount} fields`;
  elements.damageFxMajor.textContent = `${result.majorFxCellCount} major`;
  elements.damageFxThrottle.textContent = `${result.throttleCellCount} throttle`;

  if (result.tank) {
    elements.damageFxFirst.textContent = `DamageFX: ${result.tank.name} -> ${result.tank.explosion.major}/${result.tank.explosion.minor}, amount ${formatRealX100(result.tank.explosion.amount)}`;
  } else {
    const first = result.preview[0];
    elements.damageFxFirst.textContent = first ? `DamageFX: ${first.name}` : "no damage FX data";
  }

  const lines = [
    `${result.templateCount} templates, ${result.assignmentCount} source fields, ${result.resolvedUpdateCount} resolved writes`,
    `cells amount ${result.amountCellCount}, major ${result.majorFxCellCount}, minor ${result.minorFxCellCount}, throttle ${result.throttleCellCount}`,
    `veterancy-specific fields ${result.veterancyAssignmentCount}`,
  ];

  for (const template of [
    result.defaultDamage,
    result.crushableCar,
    result.tank,
    result.infantry,
    result.empty,
  ]) {
    if (template) {
      lines.push(formatDamageFxTemplate(template));
    }
  }

  lines.push("");
  lines.push(...result.preview.map((template) => `${template.name}: ${template.assignments} fields, line ${template.line}`));
  elements.damageFxListing.textContent = lines.join("\n");
}

function renderCrateEmpty(reason) {
  elements.crateTemplates.textContent = "0 templates";
  elements.crateObjects.textContent = "0 choices";
  elements.crateOwned.textContent = "0 owned";
  elements.crateFields.textContent = "0 fields";
  elements.crateFirst.textContent = reason;
  elements.crateListing.textContent = reason;
}

function formatProbabilityX100(value) {
  return formatPercentX100(value * 100);
}

function readCrateString(exports, memory, ptrFn, sizeFn, ...args) {
  const ptr = exports[ptrFn](...args);
  const size = exports[sizeFn](...args);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readCrateTemplateString(exports, memory, prefix, index) {
  return readCrateString(
    exports,
    memory,
    `generals_crate_template_${prefix}_ptr`,
    `generals_crate_template_${prefix}_size`,
    index
  );
}

function parseCratePayload(bytes) {
  const { exports, memory } = crateRuntime;
  const inputOffset = exports.generals_crate_input_ptr();

  if (bytes.length > exports.generals_crate_input_capacity()) {
    throw new Error(`CrateData payload exceeds ${exports.generals_crate_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const templateCount = exports.generals_crate_parse(bytes.length);

  if (templateCount < 0 || exports.generals_crate_error_count() !== 0) {
    throw new Error(`CrateData parse failed with ${exports.generals_crate_error_count()} errors`);
  }

  return templateCount;
}

function readCrateObject(exports, memory, index) {
  return {
    name: readCrateString(
      exports,
      memory,
      "generals_crate_object_name_ptr",
      "generals_crate_object_name_size",
      index
    ),
    chance: exports.generals_crate_object_chance_x100(index),
    line: exports.generals_crate_object_line(index),
  };
}

function readCrateVeterancy(exports, memory, index) {
  return index >= 0
    ? readCrateString(
      exports,
      memory,
      "generals_crate_veterancy_name_ptr",
      "generals_crate_veterancy_name_size",
      index
    )
    : "any";
}

function readCrateTemplate(exports, memory, index) {
  const firstObject = exports.generals_crate_template_first_object(index);
  const objectCount = exports.generals_crate_template_object_count(index);
  const objects = Array.from({ length: objectCount }, (_, offset) => {
    return readCrateObject(exports, memory, firstObject + offset);
  });
  const veterancyLevel = exports.generals_crate_template_veterancy_level(index);
  return {
    index,
    name: readCrateTemplateString(exports, memory, "name", index),
    line: exports.generals_crate_template_line(index),
    fields: exports.generals_crate_template_field_count_at(index),
    creationChance: exports.generals_crate_template_creation_chance_x100(index),
    veterancy: readCrateVeterancy(exports, memory, veterancyLevel),
    killedByType: readCrateTemplateString(exports, memory, "killed_by_type", index),
    killerScience: readCrateTemplateString(exports, memory, "killer_science", index),
    ownedByMaker: exports.generals_crate_template_owned_by_maker(index),
    objects,
  };
}

function formatCrateTemplate(template) {
  const conditions = [
    `chance ${formatProbabilityX100(template.creationChance)}`,
    `veterancy ${template.veterancy}`,
  ];
  if (template.killedByType) {
    conditions.push(`killed by ${template.killedByType}`);
  }
  if (template.killerScience) {
    conditions.push(`science ${template.killerScience}`);
  }
  if (template.ownedByMaker) {
    conditions.push("owned by maker");
  }

  const objects = template.objects
    .map((object) => `${object.name} ${formatProbabilityX100(object.chance)}`)
    .join(", ");
  return `${template.name}: ${conditions.join(", ")} -> ${objects || "no crate object"}`;
}

function parseCrateEntries(entries, archiveMemory) {
  const entry = findEntry(entries, "data/ini/crate.ini");
  if (!entry) {
    return null;
  }

  const { exports, memory } = crateRuntime;
  parseCratePayload(entryBytes(entry, archiveMemory));

  const preview = [];
  let salvage = null;
  let eliteTank = null;
  let heroicTank = null;
  let gla100 = null;
  let gla2500 = null;

  for (let index = 0; index < exports.generals_crate_template_count(); ++index) {
    const template = readCrateTemplate(exports, memory, index);
    if (preview.length < 8) {
      preview.push(template);
    }
    if (template.name === "SalvageCrateData") {
      salvage = template;
    } else if (template.name === "EliteTankCrateData") {
      eliteTank = template;
    } else if (template.name === "HeroicTankCrateData") {
      heroicTank = template;
    } else if (template.name === "GLA02_Always100DollarCrate") {
      gla100 = template;
    } else if (template.name === "GLA02_Always2500DollarCrate") {
      gla2500 = template;
    }
  }

  return {
    templateCount: exports.generals_crate_template_count(),
    objectCount: exports.generals_crate_object_count(),
    fieldCount: exports.generals_crate_field_count(),
    ownedByMakerCount: exports.generals_crate_owned_by_maker_count(),
    veterancyConditionCount: exports.generals_crate_veterancy_condition_count(),
    kindofConditionCount: exports.generals_crate_kindof_condition_count(),
    scienceConditionCount: exports.generals_crate_science_condition_count(),
    preview,
    salvage,
    eliteTank,
    heroicTank,
    gla100,
    gla2500,
  };
}

function renderCrateParse(result) {
  if (!result) {
    renderCrateEmpty("no crate data");
    return;
  }

  elements.crateTemplates.textContent = `${result.templateCount} templates`;
  elements.crateObjects.textContent = `${result.objectCount} choices`;
  elements.crateOwned.textContent = `${result.ownedByMakerCount} owned`;
  elements.crateFields.textContent = `${result.fieldCount} fields`;

  if (result.salvage?.objects[0]) {
    const object = result.salvage.objects[0];
    elements.crateFirst.textContent = `CrateData: ${result.salvage.name} -> ${object.name} ${formatProbabilityX100(object.chance)}, ${result.salvage.killerScience}/${result.salvage.killedByType}`;
  } else {
    const first = result.preview[0];
    elements.crateFirst.textContent = first ? `CrateData: ${first.name}` : "no crate data";
  }

  const lines = [
    `${result.templateCount} templates, ${result.objectCount} weighted crate choices, ${result.fieldCount} source fields`,
    `conditions veterancy ${result.veterancyConditionCount}, kindof ${result.kindofConditionCount}, science ${result.scienceConditionCount}, owned ${result.ownedByMakerCount}`,
  ];

  for (const template of [
    result.salvage,
    result.eliteTank,
    result.heroicTank,
    result.gla100,
    result.gla2500,
  ]) {
    if (template) {
      lines.push(formatCrateTemplate(template));
    }
  }

  lines.push("");
  lines.push(...result.preview.map((template) => `${template.name}: ${template.objects.length} choices, ${template.fields} fields, line ${template.line}`));
  elements.crateListing.textContent = lines.join("\n");
}

function renderOclEmpty(reason) {
  elements.oclLists.textContent = "0 lists";
  elements.oclNuggets.textContent = "0 nuggets";
  elements.oclDebris.textContent = "0 debris";
  elements.oclPayloads.textContent = "0 payloads";
  elements.oclFirst.textContent = reason;
  elements.oclListing.textContent = reason;
}

function readOclString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readOclListName(exports, memory, index) {
  return readOclString(
    exports,
    memory,
    "generals_ocl_list_name_ptr",
    "generals_ocl_list_name_size",
    index
  );
}

function readOclTypeName(exports, memory, type) {
  return readOclString(
    exports,
    memory,
    "generals_ocl_type_name_ptr",
    "generals_ocl_type_name_size",
    type
  );
}

function readOclNuggetString(exports, memory, prefix, index) {
  return readOclString(
    exports,
    memory,
    `generals_ocl_nugget_${prefix}_ptr`,
    `generals_ocl_nugget_${prefix}_size`,
    index
  );
}

function parseOclPayload(bytes) {
  const { exports, memory } = oclRuntime;
  const inputOffset = exports.generals_ocl_input_ptr();

  if (bytes.length > exports.generals_ocl_input_capacity()) {
    throw new Error(`OCL payload exceeds ${exports.generals_ocl_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const listCount = exports.generals_ocl_parse(bytes.length);

  if (listCount < 0 || exports.generals_ocl_error_count() !== 0) {
    throw new Error(`OCL parse failed with ${exports.generals_ocl_error_count()} errors`);
  }

  return listCount;
}

function readOclNugget(exports, memory, index) {
  if (index < 0) {
    return null;
  }

  const type = exports.generals_ocl_nugget_type(index);
  return {
    type: readOclTypeName(exports, memory, type),
    line: exports.generals_ocl_nugget_line(index),
    fields: exports.generals_ocl_nugget_field_count(index),
    target: readOclNuggetString(exports, memory, "target", index),
    secondary: readOclNuggetString(exports, memory, "secondary", index),
    disposition: readOclNuggetString(exports, memory, "disposition", index),
    particleSystem: readOclNuggetString(exports, memory, "particle_system", index),
    count: exports.generals_ocl_nugget_count_value(index),
    mass: exports.generals_ocl_nugget_mass_x100(index),
  };
}

function formatOclNugget(nugget) {
  if (!nugget) {
    return "empty";
  }

  const target = nugget.target ? ` ${nugget.target}` : "";
  const secondary = nugget.secondary ? ` -> ${nugget.secondary}` : "";
  const count = nugget.count !== 1 ? ` x${nugget.count}` : "";
  return `${nugget.type}${target}${secondary}${count}`;
}

function parseOclEntries(entries, archiveMemory) {
  const oclEntry = findEntry(entries, "data/ini/objectcreationlist.ini");
  if (!oclEntry) {
    return null;
  }

  const { exports, memory } = oclRuntime;
  const listCount = parseOclPayload(entryBytes(oclEntry, archiveMemory));
  const preview = [];
  let damagedBarrel = null;
  let fireWall = null;
  let genericCar = null;
  let daisyCutter = null;
  let neutronMissile = null;
  let scudStorm = null;

  for (let index = 0; index < listCount; ++index) {
    const firstNugget = exports.generals_ocl_list_first_nugget(index);
    const list = {
      name: readOclListName(exports, memory, index),
      line: exports.generals_ocl_list_line(index),
      nuggets: exports.generals_ocl_list_nugget_count(index),
      first: readOclNugget(exports, memory, firstNugget),
    };

    if (preview.length < 12) {
      preview.push(list);
    }
    if (list.name === "OCL_CreateDamagedBarrel") {
      damagedBarrel = list;
    } else if (list.name === "OCL_FireWallSegment") {
      fireWall = list;
    } else if (list.name === "OCL_GenericCarExplode") {
      genericCar = list;
    } else if (list.name === "SUPERWEAPON_DaisyCutter") {
      daisyCutter = list;
    } else if (list.name === "SUPERWEAPON_NeutronMissile") {
      neutronMissile = list;
    } else if (list.name === "SUPERWEAPON_ScudStorm") {
      scudStorm = list;
    }
  }

  return {
    file: oclEntry.name,
    listCount,
    nuggetCount: exports.generals_ocl_nugget_count(),
    fieldCount: exports.generals_ocl_field_count(),
    createObjectCount: exports.generals_ocl_type_count(0),
    createDebrisCount: exports.generals_ocl_type_count(1),
    applyRandomForceCount: exports.generals_ocl_type_count(2),
    deliverPayloadCount: exports.generals_ocl_type_count(3),
    fireWeaponCount: exports.generals_ocl_type_count(4),
    attackCount: exports.generals_ocl_type_count(5),
    preview,
    damagedBarrel,
    fireWall,
    genericCar,
    daisyCutter,
    neutronMissile,
    scudStorm,
  };
}

function renderOclParse(result) {
  if (!result) {
    renderOclEmpty("no object creation list data");
    return;
  }

  elements.oclLists.textContent = `${result.listCount} lists`;
  elements.oclNuggets.textContent = `${result.nuggetCount} nuggets`;
  elements.oclDebris.textContent = `${result.createDebrisCount} debris`;
  elements.oclPayloads.textContent = `${result.deliverPayloadCount} payloads`;

  if (result.damagedBarrel) {
    elements.oclFirst.textContent = `${result.file}: ${result.damagedBarrel.name} -> ${formatOclNugget(result.damagedBarrel.first)}`;
  } else {
    const first = result.preview[0];
    elements.oclFirst.textContent = first ? `${result.file}: ${first.name}` : "no object creation list data";
  }

  const lines = [
    `${result.listCount} lists, ${result.nuggetCount} nuggets, ${result.fieldCount} fields`,
    `types object ${result.createObjectCount}, debris ${result.createDebrisCount}, force ${result.applyRandomForceCount}, payload ${result.deliverPayloadCount}, weapon ${result.fireWeaponCount}, attack ${result.attackCount}`,
  ];

  if (result.damagedBarrel) {
    lines.push(`${result.damagedBarrel.name}: ${formatOclNugget(result.damagedBarrel.first)}, ${result.damagedBarrel.first.disposition}, particle ${result.damagedBarrel.first.particleSystem}`);
  }
  if (result.fireWall) {
    lines.push(`${result.fireWall.name}: ${formatOclNugget(result.fireWall.first)}, ${result.fireWall.first.disposition}`);
  }
  if (result.genericCar) {
    lines.push(`${result.genericCar.name}: ${result.genericCar.nuggets} nuggets, first ${formatOclNugget(result.genericCar.first)}, mass ${formatRealX100(result.genericCar.first.mass)}`);
  }
  if (result.daisyCutter) {
    lines.push(`${result.daisyCutter.name}: ${formatOclNugget(result.daisyCutter.first)}`);
  }
  if (result.neutronMissile) {
    lines.push(`${result.neutronMissile.name}: ${formatOclNugget(result.neutronMissile.first)}`);
  }
  if (result.scudStorm) {
    lines.push(`${result.scudStorm.name}: ${formatOclNugget(result.scudStorm.first)}`);
  }

  lines.push("");
  lines.push(...result.preview.map((list) => `${list.name}: ${list.nuggets} nuggets, ${formatOclNugget(list.first)}, line ${list.line}`));
  elements.oclListing.textContent = lines.join("\n");
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

function renderGameDataEmpty(reason) {
  elements.gameDataFields.textContent = "0 fields";
  elements.gameDataCash.textContent = "0 cash";
  elements.gameDataBonuses.textContent = "0 bonuses";
  elements.gameDataBones.textContent = "0 bones";
  elements.gameDataFirst.textContent = reason;
  elements.gameDataListing.textContent = reason;
}

function readGameDataString(exports, memory, prefix) {
  const ptr = exports[`generals_gamedata_${prefix}_ptr`]();
  const size = exports[`generals_gamedata_${prefix}_size`]();
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function readGameDataIndexedString(exports, memory, kind, prefix, index) {
  const ptr = exports[`generals_gamedata_${kind}_${prefix}_ptr`](index);
  const size = exports[`generals_gamedata_${kind}_${prefix}_size`](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function parseGameDataPayload(bytes) {
  const { exports, memory } = gameDataRuntime;
  const inputOffset = exports.generals_gamedata_input_ptr();

  if (bytes.length > exports.generals_gamedata_input_capacity()) {
    throw new Error(`GameData payload exceeds ${exports.generals_gamedata_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const parsedCount = exports.generals_gamedata_parse(bytes.length);

  if (parsedCount < 0 || exports.generals_gamedata_error_count() !== 0) {
    throw new Error(`GameData parse failed with ${exports.generals_gamedata_error_count()} errors`);
  }

  return parsedCount;
}

function parseGameDataEntries(entries, archiveMemory) {
  const gameDataEntry = findEntry(entries, "data/ini/gamedata.ini");
  if (!gameDataEntry) {
    return null;
  }

  const { exports, memory } = gameDataRuntime;
  parseGameDataPayload(entryBytes(gameDataEntry, archiveMemory));

  if (exports.generals_gamedata_block_count() === 0) {
    return null;
  }

  return {
    fieldCount: exports.generals_gamedata_field_count(),
    weaponBonusCount: exports.generals_gamedata_weapon_bonus_count(),
    publicBoneCount: exports.generals_gamedata_standard_public_bone_count(),
    vertexWaterCount: exports.generals_gamedata_vertex_water_count(),
    shellMapName: readGameDataString(exports, memory, "shell_map_name"),
    mapName: readGameDataString(exports, memory, "map_name"),
    moveHintName: readGameDataString(exports, memory, "move_hint_name"),
    terrainLOD: readGameDataString(exports, memory, "terrain_lod"),
    timeOfDay: readGameDataString(exports, memory, "time_of_day"),
    weather: readGameDataString(exports, memory, "weather"),
    specialPowerViewObject: readGameDataString(exports, memory, "special_power_view_object"),
    autoFireSmallPrefix: readGameDataString(exports, memory, "auto_fire_particle_small_prefix"),
    autoFireSmallSystem: readGameDataString(exports, memory, "auto_fire_particle_small_system"),
    fpsLimit: exports.generals_gamedata_frames_per_second_limit(),
    useTrees: exports.generals_gamedata_use_trees(),
    useWaterPlane: exports.generals_gamedata_use_water_plane(),
    cameraPitch: exports.generals_gamedata_camera_pitch_x100(),
    cameraHeight: exports.generals_gamedata_camera_height_x100(),
    minCameraHeight: exports.generals_gamedata_min_camera_height_x100(),
    maxCameraHeight: exports.generals_gamedata_max_camera_height_x100(),
    waterPositionZ: exports.generals_gamedata_water_position_z_x100(),
    waterExtentX: exports.generals_gamedata_water_extent_x_x100(),
    waterExtentY: exports.generals_gamedata_water_extent_y_x100(),
    valuePerSupplyBox: exports.generals_gamedata_value_per_supply_box(),
    buildSpeed: exports.generals_gamedata_build_speed_x100(),
    refundPercent: exports.generals_gamedata_refund_percent_x100(),
    sellPercentage: exports.generals_gamedata_sell_percentage_x100(),
    maxParticleCount: exports.generals_gamedata_max_particle_count(),
    defaultStartingCash: exports.generals_gamedata_default_starting_cash(),
    networkDisconnectTime: exports.generals_gamedata_network_disconnect_time(),
    firstWeaponBonus: exports.generals_gamedata_weapon_bonus_count() > 0 ? {
      bonus: readGameDataIndexedString(exports, memory, "weapon_bonus", "bonus", 0),
      field: readGameDataIndexedString(exports, memory, "weapon_bonus", "field", 0),
      percent: exports.generals_gamedata_weapon_bonus_percent_x100(0),
    } : null,
    firstPublicBone: exports.generals_gamedata_standard_public_bone_count() > 0
      ? readGameDataIndexedString(exports, memory, "standard_public_bone", "name", 0)
      : "",
    firstVertexWater: exports.generals_gamedata_vertex_water_count() > 0 ? {
      map: readGameDataIndexedString(exports, memory, "vertex_water", "map", 0),
      angle: exports.generals_gamedata_vertex_water_angle_x100(0),
      xGridCells: exports.generals_gamedata_vertex_water_x_grid_cells(0),
      yGridCells: exports.generals_gamedata_vertex_water_y_grid_cells(0),
      gridSize: exports.generals_gamedata_vertex_water_grid_size_x100(0),
    } : null,
  };
}

function renderGameDataParse(result) {
  if (!result) {
    renderGameDataEmpty("no game data");
    return;
  }

  elements.gameDataFields.textContent = `${result.fieldCount} fields`;
  elements.gameDataCash.textContent = `${result.defaultStartingCash} cash`;
  elements.gameDataBonuses.textContent = `${result.weaponBonusCount} bonuses`;
  elements.gameDataBones.textContent = `${result.publicBoneCount} bones`;
  elements.gameDataFirst.textContent = `GameData: ${result.shellMapName}, ${result.fpsLimit} FPS, cash ${result.defaultStartingCash}`;

  const lines = [
    `shell ${result.shellMapName}`,
    `default map ${result.mapName}, move hint ${result.moveHintName}`,
    `render ${result.terrainLOD}, ${result.timeOfDay}/${result.weather}, trees ${result.useTrees ? "yes" : "no"}, water ${result.useWaterPlane ? "yes" : "no"}`,
    `camera pitch ${formatRealX100(result.cameraPitch)}, height ${formatRealX100(result.cameraHeight)} (${formatRealX100(result.minCameraHeight)}-${formatRealX100(result.maxCameraHeight)})`,
    `water z ${formatRealX100(result.waterPositionZ)}, extent ${formatRealX100(result.waterExtentX)} x ${formatRealX100(result.waterExtentY)}`,
    `economy cash ${result.defaultStartingCash}, supply box ${result.valuePerSupplyBox}, build ${formatRealX100(result.buildSpeed)}, refund ${formatPercentX100(result.refundPercent)}, sell ${formatPercentX100(result.sellPercentage)}`,
    `particles ${result.maxParticleCount}, auto fire ${result.autoFireSmallPrefix}/${result.autoFireSmallSystem}, view object ${result.specialPowerViewObject}`,
    `network disconnect ${result.networkDisconnectTime} ms`,
  ];

  if (result.firstWeaponBonus) {
    lines.push(`weapon bonus ${result.firstWeaponBonus.bonus} ${result.firstWeaponBonus.field} ${formatPercentX100(result.firstWeaponBonus.percent)}`);
  }
  if (result.firstPublicBone) {
    lines.push(`public bones ${result.publicBoneCount}, first ${result.firstPublicBone}`);
  }
  if (result.firstVertexWater) {
    lines.push(`vertex water ${result.vertexWaterCount}, ${result.firstVertexWater.map}, ${result.firstVertexWater.xGridCells}x${result.firstVertexWater.yGridCells} grid ${formatRealX100(result.firstVertexWater.gridSize)}, angle ${formatRealX100(result.firstVertexWater.angle)}`);
  }

  elements.gameDataListing.textContent = lines.join("\n");
}

function renderAIDataEmpty(reason) {
  elements.aiDataFields.textContent = "0 scalars";
  elements.aiDataSides.textContent = "0 sides";
  elements.aiDataBuildLists.textContent = "0 lists";
  elements.aiDataStructures.textContent = "0 structures";
  elements.aiDataFirst.textContent = reason;
  elements.aiDataListing.textContent = reason;
}

function readAIDataString(exports, memory, ptrFn, sizeFn, ...args) {
  const ptr = exports[ptrFn](...args);
  const size = exports[sizeFn](...args);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function parseAIDataPayload(bytes) {
  const { exports, memory } = aiDataRuntime;
  const inputOffset = exports.generals_aidata_input_ptr();

  if (bytes.length > exports.generals_aidata_input_capacity()) {
    throw new Error(`AIData payload exceeds ${exports.generals_aidata_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const parsedCount = exports.generals_aidata_parse(bytes.length);

  if (parsedCount < 0 || exports.generals_aidata_error_count() !== 0) {
    throw new Error(`AIData parse failed with ${exports.generals_aidata_error_count()} errors`);
  }

  return parsedCount;
}

function readAIDataScalar(exports, memory, index) {
  return {
    name: readAIDataString(exports, memory, "generals_aidata_scalar_name_ptr", "generals_aidata_scalar_name_size", index),
    raw: readAIDataString(exports, memory, "generals_aidata_scalar_raw_ptr", "generals_aidata_scalar_raw_size", index),
    value: exports.generals_aidata_scalar_value_x100(index),
    line: exports.generals_aidata_scalar_line(index),
    assigned: exports.generals_aidata_scalar_assigned(index),
  };
}

function findAIDataScalar(exports, memory, name) {
  for (let index = 0; index < exports.generals_aidata_scalar_field_count(); ++index) {
    const scalar = readAIDataScalar(exports, memory, index);
    if (scalar.name === name) {
      return scalar;
    }
  }

  return null;
}

function readAIDataSide(exports, memory, index) {
  return {
    index,
    name: readAIDataString(exports, memory, "generals_aidata_side_name_ptr", "generals_aidata_side_name_size", index),
    line: exports.generals_aidata_side_line(index),
    fields: exports.generals_aidata_side_field_count_at(index),
    easy: exports.generals_aidata_side_resource_easy(index),
    normal: exports.generals_aidata_side_resource_normal(index),
    hard: exports.generals_aidata_side_resource_hard(index),
    baseDefense: readAIDataString(exports, memory, "generals_aidata_side_base_defense_ptr", "generals_aidata_side_base_defense_size", index),
    firstSkillSet: exports.generals_aidata_side_first_skill_set(index),
    skillSets: exports.generals_aidata_side_skill_set_count(index),
  };
}

function findAIDataSide(exports, memory, name) {
  for (let index = 0; index < exports.generals_aidata_side_count(); ++index) {
    const side = readAIDataSide(exports, memory, index);
    if (side.name === name) {
      return side;
    }
  }

  return null;
}

function readAIDataBuildList(exports, memory, index) {
  return {
    index,
    side: readAIDataString(exports, memory, "generals_aidata_build_list_side_ptr", "generals_aidata_build_list_side_size", index),
    line: exports.generals_aidata_build_list_line(index),
    firstStructure: exports.generals_aidata_build_list_first_structure(index),
    structures: exports.generals_aidata_build_list_structure_count(index),
  };
}

function findAIDataBuildList(exports, memory, sideName) {
  for (let index = 0; index < exports.generals_aidata_build_list_count(); ++index) {
    const buildList = readAIDataBuildList(exports, memory, index);
    if (buildList.side === sideName) {
      return buildList;
    }
  }

  return null;
}

function readAIDataStructure(exports, memory, index) {
  return {
    index,
    buildList: exports.generals_aidata_structure_build_list_index(index),
    template: readAIDataString(exports, memory, "generals_aidata_structure_template_ptr", "generals_aidata_structure_template_size", index),
    name: readAIDataString(exports, memory, "generals_aidata_structure_name_ptr", "generals_aidata_structure_name_size", index),
    line: exports.generals_aidata_structure_line(index),
    fields: exports.generals_aidata_structure_field_count_at(index),
    x: exports.generals_aidata_structure_x_x100(index),
    y: exports.generals_aidata_structure_y_x100(index),
    rebuilds: exports.generals_aidata_structure_rebuilds(index),
    angle: exports.generals_aidata_structure_angle_x100(index),
    initiallyBuilt: exports.generals_aidata_structure_initially_built(index),
    automaticallyBuild: exports.generals_aidata_structure_automatically_build(index),
  };
}

function formatAIDataStructure(structure) {
  if (!structure) {
    return "no structure";
  }

  const name = structure.name ? `${structure.template}/${structure.name}` : structure.template;
  return `${name} @ ${formatRealX100(structure.x)}/${formatRealX100(structure.y)}, angle ${formatRealX100(structure.angle)}, auto ${structure.automaticallyBuild ? "yes" : "no"}`;
}

function parseAIDataEntries(entries, archiveMemory) {
  const aiDataEntry = findEntry(entries, "data/ini/default/aidata.ini") ?? findEntry(entries, "data/ini/aidata.ini");
  if (!aiDataEntry) {
    return null;
  }

  const { exports, memory } = aiDataRuntime;
  const parsedCount = parseAIDataPayload(entryBytes(aiDataEntry, archiveMemory));

  const preview = [];
  for (let index = 0; index < Math.min(exports.generals_aidata_build_list_count(), 12); ++index) {
    preview.push(readAIDataBuildList(exports, memory, index));
  }

  const structureCount = exports.generals_aidata_structure_count();
  const scienceCount = exports.generals_aidata_science_count();

  return {
    file: aiDataEntry.name,
    parsedCount,
    lineCount: exports.generals_aidata_line_count(),
    scalarFieldCount: exports.generals_aidata_scalar_field_count(),
    scalarAssignmentCount: exports.generals_aidata_scalar_assignment_count(),
    scalarAssignedCount: exports.generals_aidata_scalar_assigned_count(),
    sideCount: exports.generals_aidata_side_count(),
    sideFieldCount: exports.generals_aidata_side_field_count(),
    skillSetCount: exports.generals_aidata_skill_set_count(),
    scienceCount,
    buildListCount: exports.generals_aidata_build_list_count(),
    structureCount,
    structureFieldCount: exports.generals_aidata_structure_field_count(),
    autoBuildCount: exports.generals_aidata_auto_build_count(),
    initiallyBuiltCount: exports.generals_aidata_initially_built_count(),
    structureSeconds: findAIDataScalar(exports, memory, "StructureSeconds"),
    teamSeconds: findAIDataScalar(exports, memory, "TeamSeconds"),
    wealthy: findAIDataScalar(exports, memory, "Wealthy"),
    attackUsesLineOfSight: findAIDataScalar(exports, memory, "AttackUsesLineOfSight"),
    america: findAIDataSide(exports, memory, "America"),
    toxin: findAIDataSide(exports, memory, "GLAToxinGeneral"),
    americaBuildList: findAIDataBuildList(exports, memory, "America"),
    toxinBuildList: findAIDataBuildList(exports, memory, "GLAToxinGeneral"),
    firstScience: scienceCount > 0 ? readAIDataString(exports, memory, "generals_aidata_science_name_ptr", "generals_aidata_science_name_size", 0) : "",
    lastScience: scienceCount > 0 ? readAIDataString(exports, memory, "generals_aidata_science_name_ptr", "generals_aidata_science_name_size", scienceCount - 1) : "",
    firstStructure: structureCount > 0 ? readAIDataStructure(exports, memory, 0) : null,
    lastStructure: structureCount > 0 ? readAIDataStructure(exports, memory, structureCount - 1) : null,
    preview,
  };
}

function renderAIDataParse(result) {
  if (!result) {
    renderAIDataEmpty("no AI data");
    return;
  }

  elements.aiDataFields.textContent = `${result.scalarAssignedCount}/${result.scalarFieldCount} scalars`;
  elements.aiDataSides.textContent = `${result.sideCount} sides`;
  elements.aiDataBuildLists.textContent = `${result.buildListCount} lists`;
  elements.aiDataStructures.textContent = `${result.structureCount} structures`;

  if (result.america) {
    const americaStructures = result.americaBuildList?.structures ?? 0;
    elements.aiDataFirst.textContent = `AIData: ${result.america.name} -> ${result.america.baseDefense}, ${americaStructures} structures, ${result.scienceCount} sciences`;
  } else {
    const first = result.preview[0];
    elements.aiDataFirst.textContent = first ? `AIData: ${first.side}` : "no AI data";
  }

  const lines = [
    `${result.file}: ${result.parsedCount} parsed records, ${result.scalarAssignedCount}/${result.scalarFieldCount} scalars, ${result.sideCount} sides, ${result.buildListCount} build lists, ${result.structureCount} structures`,
    `${result.sideFieldCount} side fields, ${result.skillSetCount} skill sets, ${result.scienceCount} sciences, ${result.structureFieldCount} structure fields`,
    `auto-build ${result.autoBuildCount}, initially-built ${result.initiallyBuiltCount}, ${result.lineCount} lines`,
  ];

  if (result.structureSeconds && result.teamSeconds && result.wealthy) {
    lines.push(`timing structure ${formatRealX100(result.structureSeconds.value)}s, team ${formatRealX100(result.teamSeconds.value)}s, wealthy ${formatRealX100(result.wealthy.value)}`);
  }
  if (result.attackUsesLineOfSight) {
    lines.push(`attack line-of-sight ${result.attackUsesLineOfSight.value ? "yes" : "no"}`);
  }
  if (result.america) {
    lines.push(`${result.america.name}: gatherers ${result.america.easy}/${result.america.normal}/${result.america.hard}, base ${result.america.baseDefense}, ${result.america.skillSets} skill sets, ${result.americaBuildList?.structures ?? 0} structures`);
  }
  if (result.toxin) {
    lines.push(`${result.toxin.name}: gatherers ${result.toxin.easy}/${result.toxin.normal}/${result.toxin.hard}, base ${result.toxin.baseDefense}, ${result.toxinBuildList?.structures ?? 0} structures`);
  }
  if (result.firstScience || result.lastScience) {
    lines.push(`sciences ${result.firstScience} ... ${result.lastScience}`);
  }
  if (result.firstStructure) {
    lines.push(`first ${formatAIDataStructure(result.firstStructure)}`);
  }
  if (result.lastStructure) {
    lines.push(`last ${formatAIDataStructure(result.lastStructure)}`);
  }

  lines.push("");
  lines.push(...result.preview.map((buildList) => `${buildList.side}: ${buildList.structures} structures, first index ${buildList.firstStructure}, line ${buildList.line}`));
  elements.aiDataListing.textContent = lines.join("\n");
}

function formatPixelArea(value) {
  if (value >= 1000 * 1000) {
    return `${(value / (1000 * 1000)).toFixed(1)}M px`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k px`;
  }
  return `${value} px`;
}

function renderMappedImageEmpty(reason) {
  elements.mappedImageImages.textContent = "0 images";
  elements.mappedImagePages.textContent = "0 pages";
  elements.mappedImageRotated.textContent = "0 rotated";
  elements.mappedImageArea.textContent = "0 px";
  elements.mappedImageFirst.textContent = reason;
  elements.mappedImageListing.textContent = reason;
}

function readMappedImageString(exports, memory, ptrFn, sizeFn, index) {
  const ptr = exports[ptrFn](index);
  const size = exports[sizeFn](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function parseMappedImagePayload(bytes) {
  const { exports, memory } = mappedImageRuntime;
  const inputOffset = exports.generals_mappedimage_input_ptr();

  if (bytes.length > exports.generals_mappedimage_input_capacity()) {
    throw new Error(`MappedImage payload exceeds ${exports.generals_mappedimage_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const imageCount = exports.generals_mappedimage_parse(bytes.length);

  if (imageCount < 0 || exports.generals_mappedimage_error_count() !== 0) {
    throw new Error(`MappedImage parse failed with ${exports.generals_mappedimage_error_count()} errors`);
  }

  return imageCount;
}

function readMappedImage(exports, memory, index) {
  return {
    index,
    name: readMappedImageString(exports, memory, "generals_mappedimage_name_ptr", "generals_mappedimage_name_size", index),
    texture: readMappedImageString(exports, memory, "generals_mappedimage_texture_ptr", "generals_mappedimage_texture_size", index),
    status: readMappedImageString(exports, memory, "generals_mappedimage_status_raw_ptr", "generals_mappedimage_status_raw_size", index),
    line: exports.generals_mappedimage_line(index),
    fields: exports.generals_mappedimage_field_count_at(index),
    textureWidth: exports.generals_mappedimage_texture_width(index),
    textureHeight: exports.generals_mappedimage_texture_height(index),
    left: exports.generals_mappedimage_left(index),
    top: exports.generals_mappedimage_top(index),
    right: exports.generals_mappedimage_right(index),
    bottom: exports.generals_mappedimage_bottom(index),
    width: exports.generals_mappedimage_image_width(index),
    height: exports.generals_mappedimage_image_height(index),
    statusMask: exports.generals_mappedimage_status_mask(index),
  };
}

function findMappedImage(exports, memory, name) {
  for (let index = 0; index < exports.generals_mappedimage_image_count(); ++index) {
    const image = readMappedImage(exports, memory, index);
    if (image.name === name) {
      return image;
    }
  }

  return null;
}

function formatMappedImage(image) {
  if (!image) {
    return "no image";
  }

  const status = image.status && image.status !== "NONE" ? `, ${image.status}` : "";
  return `${image.name}: ${image.texture}, ${image.width}x${image.height} from ${image.textureWidth}x${image.textureHeight}${status}`;
}

function parseMappedImageEntries(entries, archiveMemory) {
  const mappedEntries = entries.filter((entry) => {
    return entry.name.startsWith("data/ini/mappedimages/") && entry.name.endsWith(".ini");
  });
  if (mappedEntries.length === 0) {
    return null;
  }

  const sourceBytes = mappedEntries.reduce((total, entry) => total + entry.dataSize, 0);
  const combinedBytes = new Uint8Array(sourceBytes + mappedEntries.length - 1);
  let cursor = 0;
  for (let index = 0; index < mappedEntries.length; ++index) {
    const bytes = entryBytes(mappedEntries[index], archiveMemory);
    combinedBytes.set(bytes, cursor);
    cursor += bytes.length;
    if (index + 1 < mappedEntries.length) {
      combinedBytes[cursor++] = 10;
    }
  }

  const { exports, memory } = mappedImageRuntime;
  const imageCount = parseMappedImagePayload(combinedBytes);
  const texturePages = new Set();
  const preview = [];
  let totalArea = 0;

  for (let index = 0; index < imageCount; ++index) {
    const image = readMappedImage(exports, memory, index);
    texturePages.add(image.texture);
    totalArea += image.width * image.height;
    if (preview.length < 12) {
      preview.push(image);
    }
  }

  return {
    entryCount: mappedEntries.length,
    sourceBytes,
    imageCount,
    fieldCount: exports.generals_mappedimage_field_count(),
    textureAssignments: exports.generals_mappedimage_texture_assignment_count(),
    texturePages: texturePages.size,
    rotatedCount: exports.generals_mappedimage_rotated_count(),
    rawTextureCount: exports.generals_mappedimage_raw_texture_count(),
    noneStatusCount: exports.generals_mappedimage_none_status_count(),
    totalArea,
    first: imageCount > 0 ? readMappedImage(exports, memory, 0) : null,
    last: imageCount > 0 ? readMappedImage(exports, memory, imageCount - 1) : null,
    ruler: findMappedImage(exports, memory, "Ruler-Right End"),
    observer: findMappedImage(exports, memory, "SSObserverUSA"),
    purchasePower: findMappedImage(exports, memory, "GeneralsPowerWindow_American"),
    preview,
  };
}

function renderMappedImageParse(result) {
  if (!result) {
    renderMappedImageEmpty("no mapped image data");
    return;
  }

  elements.mappedImageImages.textContent = `${result.imageCount} images`;
  elements.mappedImagePages.textContent = `${result.texturePages} pages`;
  elements.mappedImageRotated.textContent = `${result.rotatedCount} rotated`;
  elements.mappedImageArea.textContent = formatPixelArea(result.totalArea);

  if (result.first) {
    elements.mappedImageFirst.textContent = `MappedImages: ${result.first.name} -> ${result.first.texture}, ${result.imageCount} images, ${result.texturePages} pages`;
  } else {
    elements.mappedImageFirst.textContent = "no mapped image data";
  }

  const lines = [
    `${result.entryCount} files, ${formatBytes(result.sourceBytes)}, ${result.imageCount} images, ${result.fieldCount} fields`,
    `${result.texturePages} texture pages, ${result.textureAssignments} texture refs, ${result.noneStatusCount} NONE, ${result.rotatedCount} rotated, ${result.rawTextureCount} raw`,
    `total image area ${formatPixelArea(result.totalArea)}`,
  ];

  for (const image of [
    result.first,
    result.ruler,
    result.observer,
    result.purchasePower,
    result.last,
  ]) {
    if (image) {
      lines.push(formatMappedImage(image));
    }
  }

  lines.push("");
  lines.push(...result.preview.map(formatMappedImage));
  elements.mappedImageListing.textContent = lines.join("\n");
}

function renderEnvironmentEmpty(reason) {
  elements.environmentWaterSets.textContent = "0 water";
  elements.environmentTransparency.textContent = "0 transparency";
  elements.environmentWeather.textContent = "0 weather";
  elements.environmentFields.textContent = "0 fields";
  elements.environmentFirst.textContent = reason;
  elements.environmentListing.textContent = reason;
}

function readEnvironmentString(exports, memory, ptrFn, sizeFn, ...args) {
  const ptr = exports[ptrFn](...args);
  const size = exports[sizeFn](...args);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function parseEnvironmentPayload(bytes) {
  const { exports, memory } = environmentRuntime;
  const inputOffset = exports.generals_environment_input_ptr();

  if (bytes.length > exports.generals_environment_input_capacity()) {
    throw new Error(`Environment payload exceeds ${exports.generals_environment_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const blockCount = exports.generals_environment_parse(bytes.length);

  if (blockCount < 0 || exports.generals_environment_error_count() !== 0) {
    throw new Error(`Environment parse failed with ${exports.generals_environment_error_count()} errors`);
  }

  return blockCount;
}

function readEnvironmentWaterSet(exports, memory, index) {
  return {
    index,
    name: readEnvironmentString(exports, memory, "generals_environment_water_set_name_ptr", "generals_environment_water_set_name_size", index),
    skyTexture: readEnvironmentString(exports, memory, "generals_environment_water_set_sky_texture_ptr", "generals_environment_water_set_sky_texture_size", index),
    waterTexture: readEnvironmentString(exports, memory, "generals_environment_water_set_water_texture_ptr", "generals_environment_water_set_water_texture_size", index),
    line: exports.generals_environment_water_set_line(index),
    fields: exports.generals_environment_water_set_field_count_at(index),
    vertex00: [
      exports.generals_environment_water_set_vertex_r(index, 0),
      exports.generals_environment_water_set_vertex_g(index, 0),
      exports.generals_environment_water_set_vertex_b(index, 0),
      exports.generals_environment_water_set_vertex_a(index, 0),
    ],
    diffuse: [
      exports.generals_environment_water_set_diffuse_r(index),
      exports.generals_environment_water_set_diffuse_g(index),
      exports.generals_environment_water_set_diffuse_b(index),
      exports.generals_environment_water_set_diffuse_a(index),
    ],
    transparentDiffuse: [
      exports.generals_environment_water_set_transparent_diffuse_r(index),
      exports.generals_environment_water_set_transparent_diffuse_g(index),
      exports.generals_environment_water_set_transparent_diffuse_b(index),
      exports.generals_environment_water_set_transparent_diffuse_a(index),
    ],
    uScroll: exports.generals_environment_water_set_u_scroll_per_ms_x10000(index),
    vScroll: exports.generals_environment_water_set_v_scroll_per_ms_x10000(index),
    skyTexelsPerUnit: exports.generals_environment_water_set_sky_texels_per_unit_x10000(index),
    repeat: exports.generals_environment_water_set_repeat_count(index),
  };
}

function findEnvironmentWaterSet(exports, memory, name) {
  for (let index = 0; index < exports.generals_environment_water_set_count(); ++index) {
    const waterSet = readEnvironmentWaterSet(exports, memory, index);
    if (waterSet.name === name) {
      return waterSet;
    }
  }

  return null;
}

function readEnvironmentTransparency(exports, memory, index) {
  return {
    index,
    line: exports.generals_environment_transparency_line(index),
    fields: exports.generals_environment_transparency_field_count_at(index),
    depth: exports.generals_environment_transparency_depth_x10000(index),
    minOpacity: exports.generals_environment_transparency_min_opacity_x10000(index),
    standingColor: [
      exports.generals_environment_transparency_standing_color_r(index),
      exports.generals_environment_transparency_standing_color_g(index),
      exports.generals_environment_transparency_standing_color_b(index),
    ],
    standingTexture: readEnvironmentString(exports, memory, "generals_environment_transparency_standing_water_texture_ptr", "generals_environment_transparency_standing_water_texture_size", index),
    radarColor: [
      exports.generals_environment_transparency_radar_color_r(index),
      exports.generals_environment_transparency_radar_color_g(index),
      exports.generals_environment_transparency_radar_color_b(index),
    ],
    skyboxN: readEnvironmentString(exports, memory, "generals_environment_transparency_skybox_texture_ptr", "generals_environment_transparency_skybox_texture_size", index, 0),
    additiveBlending: exports.generals_environment_transparency_additive_blending(index),
  };
}

function readEnvironmentWeather(exports, memory, index) {
  return {
    index,
    line: exports.generals_environment_weather_line(index),
    fields: exports.generals_environment_weather_field_count_at(index),
    snowTexture: readEnvironmentString(exports, memory, "generals_environment_weather_snow_texture_ptr", "generals_environment_weather_snow_texture_size", index),
    enabled: exports.generals_environment_weather_snow_enabled(index),
    pointSprites: exports.generals_environment_weather_use_point_sprites(index),
    frequencyScaleX: exports.generals_environment_weather_snow_frequency_scale_x_x10000(index),
    frequencyScaleY: exports.generals_environment_weather_snow_frequency_scale_y_x10000(index),
    amplitude: exports.generals_environment_weather_snow_amplitude_x10000(index),
    velocity: exports.generals_environment_weather_snow_velocity_x10000(index),
    pointSize: exports.generals_environment_weather_snow_point_size_x10000(index),
    maxPointSize: exports.generals_environment_weather_snow_max_point_size_x10000(index),
    minPointSize: exports.generals_environment_weather_snow_min_point_size_x10000(index),
    quadSize: exports.generals_environment_weather_snow_quad_size_x10000(index),
    boxDimensions: exports.generals_environment_weather_snow_box_dimensions_x10000(index),
    boxDensity: exports.generals_environment_weather_snow_box_density_x10000(index),
  };
}

function formatEnvironmentWaterSet(waterSet) {
  if (!waterSet) {
    return "no water set";
  }

  return `${waterSet.name}: sky ${waterSet.skyTexture}, water ${waterSet.waterTexture}, vertex ${waterSet.vertex00.join("/")}, diffuse ${waterSet.diffuse.join("/")}, scroll ${formatRealX10000(waterSet.uScroll)}/${formatRealX10000(waterSet.vScroll)}, repeat ${waterSet.repeat}, line ${waterSet.line}`;
}

function parseEnvironmentEntries(entries, archiveMemory) {
  const environmentEntries = [
    findEntry(entries, "data/ini/water.ini"),
    findEntry(entries, "data/ini/weather.ini"),
  ].filter(Boolean);

  if (environmentEntries.length === 0) {
    return null;
  }

  const sourceBytes = environmentEntries.reduce((total, entry) => total + entry.dataSize, 0);
  const combinedBytes = new Uint8Array(sourceBytes + environmentEntries.length - 1);
  let cursor = 0;
  for (let index = 0; index < environmentEntries.length; ++index) {
    const bytes = entryBytes(environmentEntries[index], archiveMemory);
    combinedBytes.set(bytes, cursor);
    cursor += bytes.length;
    if (index + 1 < environmentEntries.length) {
      combinedBytes[cursor++] = 10;
    }
  }

  const { exports, memory } = environmentRuntime;
  const blockCount = parseEnvironmentPayload(combinedBytes);
  const preview = [];
  for (let index = 0; index < exports.generals_environment_water_set_count(); ++index) {
    preview.push(readEnvironmentWaterSet(exports, memory, index));
  }

  return {
    files: environmentEntries.map((entry) => entry.name),
    sourceBytes,
    blockCount,
    waterSetCount: exports.generals_environment_water_set_count(),
    transparencyCount: exports.generals_environment_transparency_count(),
    weatherCount: exports.generals_environment_weather_count(),
    fieldCount: exports.generals_environment_field_count(),
    lineCount: exports.generals_environment_line_count(),
    morning: findEnvironmentWaterSet(exports, memory, "MORNING"),
    afternoon: findEnvironmentWaterSet(exports, memory, "AFTERNOON"),
    night: findEnvironmentWaterSet(exports, memory, "NIGHT"),
    transparency: exports.generals_environment_transparency_count() > 0
      ? readEnvironmentTransparency(exports, memory, 0)
      : null,
    weather: exports.generals_environment_weather_count() > 0
      ? readEnvironmentWeather(exports, memory, 0)
      : null,
    preview,
  };
}

function renderEnvironmentParse(result) {
  if (!result) {
    renderEnvironmentEmpty("no environment data");
    return;
  }

  elements.environmentWaterSets.textContent = `${result.waterSetCount} water`;
  elements.environmentTransparency.textContent = `${result.transparencyCount} transparency`;
  elements.environmentWeather.textContent = `${result.weatherCount} weather`;
  elements.environmentFields.textContent = `${result.fieldCount} fields`;

  if (result.morning) {
    const snowState = result.weather?.enabled ? "snow on" : "snow off";
    elements.environmentFirst.textContent = `Environment: ${result.morning.name} -> ${result.morning.waterTexture}, ${result.waterSetCount} water sets, ${snowState}`;
  } else {
    elements.environmentFirst.textContent = "environment data parsed";
  }

  const lines = [
    `${result.files.join(", ")}: ${formatBytes(result.sourceBytes)}, ${result.blockCount} blocks, ${result.fieldCount} fields, ${result.lineCount} lines`,
    `${result.waterSetCount} water sets, ${result.transparencyCount} transparency settings, ${result.weatherCount} weather settings`,
  ];

  for (const waterSet of [
    result.morning,
    result.afternoon,
    result.night,
  ]) {
    if (waterSet) {
      lines.push(formatEnvironmentWaterSet(waterSet));
    }
  }

  if (result.transparency) {
    lines.push(`WaterTransparency: depth ${formatRealX10000(result.transparency.depth)}, opacity ${formatRealX10000(result.transparency.minOpacity)}, standing ${result.transparency.standingTexture} ${result.transparency.standingColor.join("/")}, radar ${result.transparency.radarColor.join("/")}, additive ${result.transparency.additiveBlending ? "yes" : "no"}, skybox ${result.transparency.skyboxN}`);
  }
  if (result.weather) {
    lines.push(`Weather: ${result.weather.snowTexture}, enabled ${result.weather.enabled ? "yes" : "no"}, sprites ${result.weather.pointSprites ? "yes" : "no"}, velocity ${formatRealX10000(result.weather.velocity)}, amplitude ${formatRealX10000(result.weather.amplitude)}, box ${formatRealX10000(result.weather.boxDimensions)} @ ${formatRealX10000(result.weather.boxDensity)}`);
  }

  lines.push("");
  lines.push(...result.preview.map(formatEnvironmentWaterSet));
  elements.environmentListing.textContent = lines.join("\n");
}

function renderVideoEmpty(reason) {
  elements.videoCount.textContent = "0 videos";
  elements.videoFields.textContent = "0 fields";
  elements.videoLines.textContent = "0 lines";
  elements.videoComments.textContent = "0 comments";
  elements.videoFirst.textContent = reason;
  elements.videoListing.textContent = reason;
}

function readVideoString(exports, memory, prefix, index) {
  const ptr = exports[`generals_video_${prefix}_ptr`](index);
  const size = exports[`generals_video_${prefix}_size`](index);
  return ptr ? textDecoder.decode(memory.slice(ptr, ptr + size)) : "";
}

function parseVideoPayload(bytes) {
  const { exports, memory } = videoRuntime;
  const inputOffset = exports.generals_video_input_ptr();

  if (bytes.length > exports.generals_video_input_capacity()) {
    throw new Error(`Video payload exceeds ${exports.generals_video_input_capacity()} byte wasm buffer`);
  }

  memory.set(bytes, inputOffset);
  const videoCount = exports.generals_video_parse(bytes.length);

  if (videoCount < 0 || exports.generals_video_error_count() !== 0) {
    throw new Error(`Video parse failed with ${exports.generals_video_error_count()} errors`);
  }

  return videoCount;
}

function readVideo(exports, memory, index) {
  return {
    index,
    name: readVideoString(exports, memory, "name", index),
    filename: readVideoString(exports, memory, "filename", index),
    comment: readVideoString(exports, memory, "comment", index),
    line: exports.generals_video_line(index),
    fields: exports.generals_video_field_count_at(index),
  };
}

function findVideo(exports, memory, name) {
  for (let index = 0; index < exports.generals_video_count(); ++index) {
    const video = readVideo(exports, memory, index);
    if (video.name === name) {
      return video;
    }
  }

  return null;
}

function formatVideo(video) {
  if (!video) {
    return "no video";
  }

  const comment = video.comment ? `, ${video.comment}` : "";
  return `${video.name}: ${video.filename}${comment}, line ${video.line}`;
}

function parseVideoEntries(entries, archiveMemory) {
  const videoEntry = findEntry(entries, "data/ini/video.ini");
  if (!videoEntry) {
    return null;
  }

  const { exports, memory } = videoRuntime;
  const sourceBytes = videoEntry.dataSize;
  const videoCount = parseVideoPayload(entryBytes(videoEntry, archiveMemory));
  const preview = [];
  let commentCount = 0;

  for (let index = 0; index < videoCount; ++index) {
    const video = readVideo(exports, memory, index);
    if (video.comment) {
      ++commentCount;
    }
    if (preview.length < 12) {
      preview.push(video);
    }
  }

  return {
    file: videoEntry.name,
    sourceBytes,
    videoCount,
    fieldCount: exports.generals_video_field_count(),
    lineCount: exports.generals_video_line_count(),
    commentCount,
    first: videoCount > 0 ? readVideo(exports, memory, 0) : null,
    last: videoCount > 0 ? readVideo(exports, memory, videoCount - 1) : null,
    vsSmall: findVideo(exports, memory, "VSSmall"),
    thraxLeft: findVideo(exports, memory, "PortraitDrThraxLeft"),
    usa05: findVideo(exports, memory, "MD_USA05"),
    preview,
  };
}

function renderVideoParse(result) {
  if (!result) {
    renderVideoEmpty("no video data");
    return;
  }

  elements.videoCount.textContent = `${result.videoCount} videos`;
  elements.videoFields.textContent = `${result.fieldCount} fields`;
  elements.videoLines.textContent = `${result.lineCount} lines`;
  elements.videoComments.textContent = `${result.commentCount} comments`;

  if (result.first) {
    elements.videoFirst.textContent = `Video: ${result.first.name} -> ${result.first.filename}, ${result.videoCount} videos, ${result.fieldCount} fields`;
  } else {
    elements.videoFirst.textContent = "no video data";
  }

  const lines = [
    `${result.file}: ${formatBytes(result.sourceBytes)}, ${result.videoCount} videos, ${result.fieldCount} fields, ${result.lineCount} lines`,
    `${result.commentCount} commented definitions`,
  ];

  for (const video of [
    result.first,
    result.vsSmall,
    result.thraxLeft,
    result.usa05,
    result.last,
  ]) {
    if (video) {
      lines.push(formatVideo(video));
    }
  }

  lines.push("");
  lines.push(...result.preview.map(formatVideo));
  elements.videoListing.textContent = lines.join("\n");
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
    renderLocomotorEmpty("no locomotor data");
    renderFxListEmpty("no FX list data");
    renderParticleEmpty("no particle system data");
    renderAudioEmpty("no audio data");
    renderMiscAudioEmpty("no miscellaneous audio data");
    renderDamageFxEmpty("no damage FX data");
    renderCrateEmpty("no crate data");
    renderOclEmpty("no object creation list data");
    renderThingEmpty("no object data");
    renderCommandEmpty("no command data");
    renderProgressionEmpty("no progression data");
    renderPlayerEmpty("no player data");
    renderGameDataEmpty("no game data");
    renderAIDataEmpty("no AI data");
    renderMappedImageEmpty("no mapped image data");
    renderEnvironmentEmpty("no environment data");
    renderVideoEmpty("no video data");
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

  renderLocomotorParse(parseLocomotorEntries(entries, memory));
  renderFxListParse(parseFxListEntries(entries, memory));
  renderParticleParse(parseParticleEntries(entries, memory));
  renderAudioParse(parseAudioEntries(entries, memory));
  renderMiscAudioParse(parseMiscAudioEntries(entries, memory));
  renderDamageFxParse(parseDamageFxEntries(entries, memory));
  renderCrateParse(parseCrateEntries(entries, memory));
  renderOclParse(parseOclEntries(entries, memory));
  renderThingParse(parseThingEntries(entries, memory));
  renderCommandParse(parseCommandEntries(entries, memory));
  renderProgressionParse(parseProgressionEntries(entries, memory));
  renderPlayerParse(parsePlayerEntries(entries, memory));
  renderGameDataParse(parseGameDataEntries(entries, memory));
  renderAIDataParse(parseAIDataEntries(entries, memory));
  renderMappedImageParse(parseMappedImageEntries(entries, memory));
  renderEnvironmentParse(parseEnvironmentEntries(entries, memory));
  renderVideoParse(parseVideoEntries(entries, memory));
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
  const gameDataModule = await loadWasm("../dist/generals_gamedata.wasm");
  gameDataRuntime = {
    exports: gameDataModule.instance.exports,
    memory: new Uint8Array(gameDataModule.instance.exports.memory.buffer),
  };
  const aiDataModule = await loadWasm("../dist/generals_aidata.wasm");
  aiDataRuntime = {
    exports: aiDataModule.instance.exports,
    memory: new Uint8Array(aiDataModule.instance.exports.memory.buffer),
  };
  const mappedImageModule = await loadWasm("../dist/generals_mappedimage.wasm");
  mappedImageRuntime = {
    exports: mappedImageModule.instance.exports,
    memory: new Uint8Array(mappedImageModule.instance.exports.memory.buffer),
  };
  const environmentModule = await loadWasm("../dist/generals_environment.wasm");
  environmentRuntime = {
    exports: environmentModule.instance.exports,
    memory: new Uint8Array(environmentModule.instance.exports.memory.buffer),
  };
  const videoModule = await loadWasm("../dist/generals_video.wasm");
  videoRuntime = {
    exports: videoModule.instance.exports,
    memory: new Uint8Array(videoModule.instance.exports.memory.buffer),
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
  const locomotorModule = await loadWasm("../dist/generals_locomotor.wasm");
  locomotorRuntime = {
    exports: locomotorModule.instance.exports,
    memory: new Uint8Array(locomotorModule.instance.exports.memory.buffer),
  };
  const fxlistModule = await loadWasm("../dist/generals_fxlist.wasm");
  fxlistRuntime = {
    exports: fxlistModule.instance.exports,
    memory: new Uint8Array(fxlistModule.instance.exports.memory.buffer),
  };
  const particleModule = await loadWasm("../dist/generals_particle.wasm");
  particleRuntime = {
    exports: particleModule.instance.exports,
    memory: new Uint8Array(particleModule.instance.exports.memory.buffer),
  };
  const audioModule = await loadWasm("../dist/generals_audio.wasm");
  audioRuntime = {
    exports: audioModule.instance.exports,
    memory: new Uint8Array(audioModule.instance.exports.memory.buffer),
  };
  const miscAudioModule = await loadWasm("../dist/generals_miscaudio.wasm");
  miscAudioRuntime = {
    exports: miscAudioModule.instance.exports,
    memory: new Uint8Array(miscAudioModule.instance.exports.memory.buffer),
  };
  const damageFxModule = await loadWasm("../dist/generals_damagefx.wasm");
  damageFxRuntime = {
    exports: damageFxModule.instance.exports,
    memory: new Uint8Array(damageFxModule.instance.exports.memory.buffer),
  };
  const crateModule = await loadWasm("../dist/generals_crate.wasm");
  crateRuntime = {
    exports: crateModule.instance.exports,
    memory: new Uint8Array(crateModule.instance.exports.memory.buffer),
  };
  const oclModule = await loadWasm("../dist/generals_ocl.wasm");
  oclRuntime = {
    exports: oclModule.instance.exports,
    memory: new Uint8Array(oclModule.instance.exports.memory.buffer),
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
  if (!file || !bigRuntime || !iniRuntime || !gameDataRuntime || !aiDataRuntime || !mappedImageRuntime || !environmentRuntime || !videoRuntime || !armorRuntime || !weaponRuntime || !locomotorRuntime || !fxlistRuntime || !particleRuntime || !audioRuntime || !miscAudioRuntime || !damageFxRuntime || !crateRuntime || !oclRuntime || !thingRuntime || !commandRuntime || !progressionRuntime || !playerRuntime) {
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
