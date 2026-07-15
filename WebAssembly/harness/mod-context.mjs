import { Sha256 } from "./mod-package-format.mjs";

export const MOD_CONTEXT_SCHEMA = 1;
export const MOD_LIBRARY_KEY = "cncPortModLibrary.v1";
export const MOD_ACTIVE_CONTEXT_KEY = "cncPortActiveModContext.v1";
export const MOD_CONTEXT_HISTORY_KEY = "cncPortModContextHistory.v1";

export const CNC_PORT_USER_DATA_HOME = "/home/web_user";
export const CNC_PORT_USER_DATA_LEAF = "Command and Conquer Generals Zero Hour Data";
export const CNC_PORT_USER_DATA_DIR = `${CNC_PORT_USER_DATA_HOME}/${CNC_PORT_USER_DATA_LEAF}`;
export const CNC_PORT_MOD_DATA_ROOT = `${CNC_PORT_USER_DATA_DIR}/ModData`;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MOD_ID_PATTERN = /^mod-[a-f0-9-]{8,64}$/;
const OPFS_ARCHIVE_PATTERN = /^cnc-mods\/(mod-[a-f0-9-]{8,64})\/archives\/([a-zA-Z0-9._ -]+\.big)$/i;

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function safeText(value, maxLength) {
  const text = String(value ?? "").trim();
  return text && text.length <= maxLength ? text : null;
}

function normalizeArchive(value, ownerId) {
  const archive = plainObject(value);
  const path = String(archive?.opfsPath ?? "");
  const match = OPFS_ARCHIVE_PATTERN.exec(path);
  const size = Number(archive?.size);
  const sha256 = String(archive?.sha256 ?? "").toLowerCase();
  if (!match || match[1] !== ownerId || !Number.isSafeInteger(size) || size <= 0
      || !SHA256_PATTERN.test(sha256)) {
    return null;
  }
  return Object.freeze({
    opfsPath: path,
    name: match[2],
    size,
    sha256,
    enabled: archive.enabled !== false,
  });
}

export function normalizeInstalledMod(value) {
  const mod = plainObject(value);
  const id = String(mod?.id ?? "");
  const name = safeText(mod?.name, 120);
  const contentHash = String(mod?.contentHash ?? "").toLowerCase();
  if (!MOD_ID_PATTERN.test(id) || !name || !SHA256_PATTERN.test(contentHash)
      || !Array.isArray(mod.archives) || mod.archives.length === 0 || mod.archives.length > 512) {
    return null;
  }
  const archives = mod.archives.map((archive) => normalizeArchive(archive, id));
  if (archives.some((archive) => !archive)) return null;
  const archivePaths = new Set(archives.map((archive) => archive.opfsPath.toLowerCase()));
  if (archivePaths.size !== archives.length) return null;
  const warnings = Array.isArray(mod.warnings)
    ? mod.warnings.map((warning) => safeText(warning, 500)).filter(Boolean).slice(0, 100)
    : [];
  return Object.freeze({
    id,
    name,
    version: safeText(mod.version, 80) ?? "Unknown",
    sourceName: safeText(mod.sourceName, 255) ?? name,
    contentHash,
    archives: Object.freeze(archives),
    warnings: Object.freeze(warnings),
    installedAt: safeText(mod.installedAt, 40),
    totalBytes: archives.reduce((sum, archive) => sum + archive.size, 0),
  });
}

export function normalizeModLibrary(value) {
  const input = plainObject(value);
  if (!input || input.schema !== MOD_CONTEXT_SCHEMA || !Array.isArray(input.mods)) {
    return Object.freeze({ schema: MOD_CONTEXT_SCHEMA, mods: Object.freeze([]) });
  }
  const mods = input.mods.map(normalizeInstalledMod).filter(Boolean);
  const unique = [];
  const ids = new Set();
  for (const mod of mods) {
    if (ids.has(mod.id)) continue;
    ids.add(mod.id);
    unique.push(mod);
  }
  return Object.freeze({ schema: MOD_CONTEXT_SCHEMA, mods: Object.freeze(unique) });
}

function readStoredObject(storage, key) {
  try {
    return plainObject(JSON.parse(storage?.getItem(key) ?? "null"));
  } catch {
    return null;
  }
}

export function loadModLibrary(storage = globalThis.localStorage) {
  return normalizeModLibrary(readStoredObject(storage, MOD_LIBRARY_KEY));
}

export function saveModLibrary(storage, value) {
  const library = normalizeModLibrary(value);
  storage?.setItem(MOD_LIBRARY_KEY, JSON.stringify(library));
  return library;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(value, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle?.digest) throw new Error("SHA-256 is unavailable in this browser");
  const bytes = new TextEncoder().encode(String(value));
  return bytesToHex(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", bytes)));
}

function compositionIdentityText(mods) {
  return JSON.stringify({
    schema: MOD_CONTEXT_SCHEMA,
    orderedMods: mods.map((mod) => ({
      contentHash: mod.contentHash,
      enabledArchives: mod.archives.filter((archive) => archive.enabled)
        .map((archive) => archive.sha256),
    })),
  });
}

function compositionIdentitySync(mods) {
  return new Sha256().update(new TextEncoder().encode(compositionIdentityText(mods))).digestHex();
}

export async function createModContext(mods, { cryptoImpl = globalThis.crypto } = {}) {
  if (!Array.isArray(mods)) throw new TypeError("Mod composition must be an ordered array");
  const normalized = mods.map(normalizeInstalledMod);
  if (normalized.some((mod) => !mod)) throw new Error("Mod composition contains an invalid package");
  const ids = new Set(normalized.map((mod) => mod.id));
  if (ids.size !== normalized.length) throw new Error("A mod can only appear once in a composition");
  if (normalized.length === 0) return vanillaModContext();
  if (normalized.some((mod) => !mod.archives.some((archive) => archive.enabled))) {
    throw new Error("Each enabled mod must have at least one archive selected");
  }
  const id = await sha256Text(compositionIdentityText(normalized), cryptoImpl);
  return Object.freeze({
    schema: MOD_CONTEXT_SCHEMA,
    id,
    label: normalized.map((mod) => mod.name).join(" + "),
    mods: Object.freeze(normalized),
    createdAt: new Date().toISOString(),
  });
}

export function vanillaModContext() {
  return Object.freeze({
    schema: MOD_CONTEXT_SCHEMA,
    id: "vanilla",
    label: "Vanilla Zero Hour",
    mods: Object.freeze([]),
    createdAt: null,
  });
}

export function normalizeActiveModContext(value, library = null) {
  const context = plainObject(value);
  if (!context || context.schema !== MOD_CONTEXT_SCHEMA) return vanillaModContext();
  if (context.id === "vanilla" && Array.isArray(context.mods) && context.mods.length === 0) {
    return vanillaModContext();
  }
  if (!SHA256_PATTERN.test(String(context.id ?? "")) || !Array.isArray(context.mods)
      || context.mods.length === 0) {
    return vanillaModContext();
  }
  const normalized = context.mods.map(normalizeInstalledMod);
  if (normalized.some((mod) => !mod)) return vanillaModContext();
  if (new Set(normalized.map((mod) => mod.id)).size !== normalized.length) return vanillaModContext();
  if (normalized.some((mod) => !mod.archives.some((archive) => archive.enabled))) {
    return vanillaModContext();
  }
  if (compositionIdentitySync(normalized) !== context.id) return vanillaModContext();
  if (library) {
    const available = new Map(normalizeModLibrary(library).mods.map((mod) => [mod.id, mod.contentHash]));
    if (normalized.some((mod) => available.get(mod.id) !== mod.contentHash)) return vanillaModContext();
  }
  return Object.freeze({
    schema: MOD_CONTEXT_SCHEMA,
    id: context.id,
    label: safeText(context.label, 500) ?? normalized.map((mod) => mod.name).join(" + "),
    mods: Object.freeze(normalized),
    createdAt: safeText(context.createdAt, 40),
  });
}

export function loadActiveModContext(storage = globalThis.localStorage) {
  const library = loadModLibrary(storage);
  return normalizeActiveModContext(readStoredObject(storage, MOD_ACTIVE_CONTEXT_KEY), library);
}

export function saveActiveModContext(storage, value) {
  const context = normalizeActiveModContext(value, loadModLibrary(storage));
  storage?.setItem(MOD_ACTIVE_CONTEXT_KEY, JSON.stringify(context));
  const history = loadModContextHistory(storage);
  const withoutCurrent = history.filter((candidate) => candidate.id !== context.id);
  storage?.setItem(MOD_CONTEXT_HISTORY_KEY, JSON.stringify([
    context,
    ...withoutCurrent,
  ].slice(0, 100)));
  return context;
}

export function loadModContextHistory(storage = globalThis.localStorage) {
  let values = [];
  try {
    const parsed = JSON.parse(storage?.getItem(MOD_CONTEXT_HISTORY_KEY) ?? "[]");
    if (Array.isArray(parsed)) values = parsed;
  } catch {
    return [vanillaModContext()];
  }
  const contexts = [vanillaModContext()];
  const ids = new Set(["vanilla"]);
  for (const value of values) {
    const context = normalizeActiveModContext(value);
    if (context.id === "vanilla" || ids.has(context.id)) continue;
    ids.add(context.id);
    contexts.push(context);
  }
  return contexts;
}

export function modContextPaths(context) {
  const normalized = normalizeActiveModContext(context);
  const home = normalized.id === "vanilla"
    ? CNC_PORT_USER_DATA_HOME
    : `${CNC_PORT_MOD_DATA_ROOT}/${normalized.id}/Home`;
  const userDataDir = `${home}/${CNC_PORT_USER_DATA_LEAF}`;
  return Object.freeze({
    home,
    userDataDir,
    saveDir: `${userDataDir}/Save`,
    replayDir: `${userDataDir}/Replays`,
  });
}

export function deriveMultiplayerRoom(baseRoom, context) {
  const room = String(baseRoom ?? "").trim();
  if (!room) return "";
  const normalized = normalizeActiveModContext(context);
  return `pns-v${MOD_CONTEXT_SCHEMA}:${normalized.id}:${room}`;
}

export function activeModMountPlan(context) {
  const normalized = normalizeActiveModContext(context);
  return normalized.mods.flatMap((mod, modIndex) => mod.archives
    .filter((archive) => archive.enabled)
    .map((archive, archiveIndex) => ({
      modId: mod.id,
      modName: mod.name,
      opfsPath: archive.opfsPath,
      name: `${String(modIndex + 1).padStart(3, "0")}-${String(archiveIndex + 1).padStart(3, "0")}-${archive.name}`
        .replace(/[^A-Za-z0-9_.-]/g, "_"),
      size: archive.size,
    })));
}
