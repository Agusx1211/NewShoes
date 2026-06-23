import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bigWasmPath = resolve(wasmDir, "dist/generals_big.wasm");
const particleWasmPath = resolve(wasmDir, "dist/generals_particle.wasm");
const archivePath = resolve(process.argv[2] ?? "artifacts/real-assets/INIZH.big");
const [bigWasmBytes, particleWasmBytes, archive] = await Promise.all([
  readFile(bigWasmPath),
  readFile(particleWasmPath),
  readFile(archivePath),
]);
const [bigModule, particleModule] = await Promise.all([
  WebAssembly.instantiate(bigWasmBytes, {}),
  WebAssembly.instantiate(particleWasmBytes, {}),
]);
const bigExports = bigModule.instance.exports;
const particleExports = particleModule.instance.exports;
const bigMemory = new Uint8Array(bigExports.memory.buffer);
const particleMemory = new Uint8Array(particleExports.memory.buffer);
const textDecoder = new TextDecoder();

bigMemory.set(archive, bigExports.generals_big_input_ptr());
const fileCount = bigExports.generals_big_parse(archive.length);

function readBigString(ptr, size) {
  return textDecoder.decode(bigMemory.slice(ptr, ptr + size));
}

function readParticleString(ptr, size) {
  return ptr ? textDecoder.decode(particleMemory.slice(ptr, ptr + size)) : "";
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

function parseParticlePayload(bytes) {
  if (bytes.length > particleExports.generals_particle_input_capacity()) {
    throw new Error(`ParticleSystem payload exceeds ${particleExports.generals_particle_input_capacity()} byte wasm buffer`);
  }

  particleMemory.set(bytes, particleExports.generals_particle_input_ptr());
  const parsedCount = particleExports.generals_particle_parse(bytes.length);
  if (parsedCount < 0 || particleExports.generals_particle_error_count() !== 0) {
    throw new Error(`ParticleSystem parse failed: parsed=${parsedCount}, errors=${particleExports.generals_particle_error_count()}`);
  }

  return parsedCount;
}

function templateString(prefix, index) {
  return readParticleString(
    particleExports[`generals_particle_template_${prefix}_ptr`](index),
    particleExports[`generals_particle_template_${prefix}_size`](index)
  );
}

function enumString(kind, index) {
  return readParticleString(
    particleExports[`generals_particle_${kind}_name_ptr`](index),
    particleExports[`generals_particle_${kind}_name_size`](index)
  );
}

function templateName(index) {
  return templateString("name", index);
}

function templateSummary(index) {
  const priority = particleExports.generals_particle_template_priority(index);
  const shader = particleExports.generals_particle_template_shader(index);
  const type = particleExports.generals_particle_template_type(index);
  const velocity = particleExports.generals_particle_template_velocity_type(index);
  const volume = particleExports.generals_particle_template_volume_type(index);
  return {
    index,
    name: templateName(index),
    line: particleExports.generals_particle_template_line(index),
    fields: particleExports.generals_particle_template_field_count_at(index),
    particleName: templateString("particle_name", index),
    slaveSystem: templateString("slave_system", index),
    attachedSystem: templateString("attached_system", index),
    priority: enumString("priority", priority),
    shader: enumString("shader", shader),
    type: enumString("type", type),
    velocity: enumString("velocity", velocity),
    volume: enumString("volume", volume),
    isOneShot: particleExports.generals_particle_template_is_one_shot(index),
    systemLifetime: particleExports.generals_particle_template_system_lifetime(index),
    lifetimeLow: particleExports.generals_particle_template_lifetime_low_x100(index),
    lifetimeHigh: particleExports.generals_particle_template_lifetime_high_x100(index),
    sizeLow: particleExports.generals_particle_template_size_low_x100(index),
    sizeHigh: particleExports.generals_particle_template_size_high_x100(index),
    burstDelayLow: particleExports.generals_particle_template_burst_delay_low_x100(index),
    burstDelayHigh: particleExports.generals_particle_template_burst_delay_high_x100(index),
    burstCountLow: particleExports.generals_particle_template_burst_count_low_x100(index),
    burstCountHigh: particleExports.generals_particle_template_burst_count_high_x100(index),
    initialDelayLow: particleExports.generals_particle_template_initial_delay_low_x100(index),
    initialDelayHigh: particleExports.generals_particle_template_initial_delay_high_x100(index),
    gravity: particleExports.generals_particle_template_gravity_x100(index),
    volumeRadius: particleExports.generals_particle_template_volume_radius_x100(index),
    volumeLength: particleExports.generals_particle_template_volume_length_x100(index),
    isHollow: particleExports.generals_particle_template_is_hollow(index),
    isGroundAligned: particleExports.generals_particle_template_is_ground_aligned(index),
    isEmitAboveGroundOnly: particleExports.generals_particle_template_is_emit_above_ground_only(index),
    isParticleUpTowardsEmitter: particleExports.generals_particle_template_is_particle_up_towards_emitter(index),
  };
}

function findTemplate(name) {
  for (let index = 0; index < particleExports.generals_particle_template_count(); ++index) {
    if (templateName(index) === name) {
      return templateSummary(index);
    }
  }

  throw new Error(`ParticleSystem not found: ${name}`);
}

const particleBytes = entryBytes("data/ini/particlesystem.ini");
const templateCount = parseParticlePayload(particleBytes);
const samples = {
  first: templateSummary(0),
  jetContrailThin: findTemplate("JetContrailThin"),
  smallTankStruckSmoke: findTemplate("SmallTankStruckSmoke"),
  nukeMushroomExplosion: findTemplate("NukeMushroomExplosion"),
  toxicShellExplosion: findTemplate("ToxicShellExplosion"),
};

const summary = {
  archive: archivePath,
  particleBytes: particleBytes.length,
  templateCount,
  fieldCount: particleExports.generals_particle_field_count(),
  lineCount: particleExports.generals_particle_line_count(),
  shaderNoneCount: particleExports.generals_particle_shader_count(0),
  shaderAdditiveCount: particleExports.generals_particle_shader_count(1),
  shaderAlphaCount: particleExports.generals_particle_shader_count(2),
  shaderAlphaTestCount: particleExports.generals_particle_shader_count(3),
  shaderMultiplyCount: particleExports.generals_particle_shader_count(4),
  typeParticleCount: particleExports.generals_particle_type_count(1),
  typeDrawableCount: particleExports.generals_particle_type_count(2),
  typeStreakCount: particleExports.generals_particle_type_count(3),
  typeVolumeParticleCount: particleExports.generals_particle_type_count(4),
  velocityOutwardCount: particleExports.generals_particle_velocity_count(5),
  volumeCylinderCount: particleExports.generals_particle_volume_count(5),
  priorityWeaponExplosionCount: particleExports.generals_particle_priority_count(1),
  priorityWeaponTrailCount: particleExports.generals_particle_priority_count(10),
  priorityCriticalCount: particleExports.generals_particle_priority_count(12),
  first: templateName(0),
  last: templateName(templateCount - 1),
  samples,
};

if (summary.particleBytes !== 1644103 ||
    summary.templateCount !== 1084 ||
    summary.fieldCount !== 58301 ||
    summary.lineCount !== 61554 ||
    summary.shaderNoneCount !== 1 ||
    summary.shaderAdditiveCount !== 587 ||
    summary.shaderAlphaCount !== 469 ||
    summary.shaderAlphaTestCount !== 26 ||
    summary.shaderMultiplyCount !== 1 ||
    summary.typeParticleCount !== 1049 ||
    summary.typeDrawableCount !== 1 ||
    summary.typeStreakCount !== 30 ||
    summary.typeVolumeParticleCount !== 4 ||
    summary.velocityOutwardCount !== 488 ||
    summary.volumeCylinderCount !== 430 ||
    summary.priorityWeaponExplosionCount !== 239 ||
    summary.priorityWeaponTrailCount !== 60 ||
    summary.priorityCriticalCount !== 394 ||
    summary.first !== "TsingMaTrailSmoke" ||
    summary.last !== "SonicRange1") {
  throw new Error(`unexpected ParticleSystem aggregate parse: ${JSON.stringify(summary)}`);
}

const first = samples.first;
if (first.index !== 0 ||
    first.priority !== "WEAPON_EXPLOSION" ||
    first.shader !== "ALPHA" ||
    first.type !== "PARTICLE" ||
    first.particleName !== "EXSmokNew1.tga" ||
    first.lifetimeLow !== 6000 ||
    first.lifetimeHigh !== 6000 ||
    first.sizeLow !== 500 ||
    first.sizeHigh !== 500 ||
    first.burstDelayLow !== 4000 ||
    first.burstDelayHigh !== 4000 ||
    first.burstCountLow !== 0 ||
    first.burstCountHigh !== 200 ||
    first.initialDelayLow !== 2000 ||
    first.initialDelayHigh !== 2000 ||
    first.velocity !== "OUTWARD" ||
    first.volume !== "SPHERE" ||
    first.volumeRadius !== 400) {
  throw new Error(`unexpected first ParticleSystem parse: ${JSON.stringify(first)}`);
}

const jetContrailThin = samples.jetContrailThin;
if (jetContrailThin.index !== 1 ||
    jetContrailThin.priority !== "WEAPON_TRAIL" ||
    jetContrailThin.type !== "STREAK" ||
    jetContrailThin.particleName !== "EXContrail.tga" ||
    jetContrailThin.sizeLow !== 10 ||
    jetContrailThin.sizeHigh !== 20 ||
    jetContrailThin.velocity !== "ORTHO" ||
    jetContrailThin.volume !== "LINE") {
  throw new Error(`unexpected JetContrailThin parse: ${JSON.stringify(jetContrailThin)}`);
}

const smallTankStruckSmoke = samples.smallTankStruckSmoke;
if (smallTankStruckSmoke.slaveSystem !== "TankStruckFlameSlave" ||
    smallTankStruckSmoke.priority !== "UNIT_DAMAGE_FX" ||
    smallTankStruckSmoke.volume !== "CYLINDER" ||
    smallTankStruckSmoke.volumeRadius !== 1000 ||
    smallTankStruckSmoke.burstDelayLow !== 9999900 ||
    smallTankStruckSmoke.burstCountLow !== 1500) {
  throw new Error(`unexpected SmallTankStruckSmoke parse: ${JSON.stringify(smallTankStruckSmoke)}`);
}

const nukeMushroomExplosion = samples.nukeMushroomExplosion;
if (nukeMushroomExplosion.priority !== "CRITICAL" ||
    nukeMushroomExplosion.shader !== "ADDITIVE" ||
    nukeMushroomExplosion.type !== "PARTICLE" ||
    nukeMushroomExplosion.lifetimeLow !== 30000 ||
    nukeMushroomExplosion.systemLifetime !== 100 ||
    nukeMushroomExplosion.sizeLow !== 100 ||
    nukeMushroomExplosion.sizeHigh !== 200 ||
    nukeMushroomExplosion.burstCountLow !== 2500 ||
    nukeMushroomExplosion.velocity !== "HEMISPHERICAL" ||
    nukeMushroomExplosion.volume !== "SPHERE" ||
    nukeMushroomExplosion.volumeRadius !== 1000 ||
    nukeMushroomExplosion.isHollow !== 1) {
  throw new Error(`unexpected NukeMushroomExplosion parse: ${JSON.stringify(nukeMushroomExplosion)}`);
}

const toxicShellExplosion = samples.toxicShellExplosion;
if (toxicShellExplosion.priority !== "WEAPON_EXPLOSION" ||
    toxicShellExplosion.shader !== "ADDITIVE" ||
    toxicShellExplosion.type !== "PARTICLE" ||
    toxicShellExplosion.particleName !== "EXexplo03.tga" ||
    toxicShellExplosion.volume !== "CYLINDER" ||
    toxicShellExplosion.volumeRadius !== 200 ||
    toxicShellExplosion.isEmitAboveGroundOnly !== 1) {
  throw new Error(`unexpected ToxicShellExplosion parse: ${JSON.stringify(toxicShellExplosion)}`);
}

console.log(JSON.stringify(summary, null, 2));
