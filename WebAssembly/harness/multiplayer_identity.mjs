export const DEFAULT_NETWORK_ROOM = "default-room";
export const COMMANDER_NAME_MAX_LENGTH = 12;
export const NETWORK_SETTINGS_KEY = "cncPortNetworkSettings.v2";
export const LEGACY_NETWORK_SETTINGS_KEY = "cncPortNetworkSettings.v1";

// Four-character words leave four characters for a base-36 suffix. The
// resulting 32 * 32 * 36^4 combinations provide over 1.7 billion readable
// identities while still fitting the original LAN protocol's 12-char limit.
const COMMANDER_ADJECTIVES = Object.freeze([
  "Mad", "Red", "Big", "Lil", "Odd", "Hot", "Icy", "Zen",
  "Wry", "Shy", "Sly", "Dry", "Wet", "Raw", "Epic", "Mega",
  "Mini", "Wild", "Neon", "Fuzz", "Grim", "Good", "Bad", "Loud",
  "Soft", "Fast", "Slow", "Rude", "Nice", "Zany", "Bold", "Nerd",
]);
const COMMANDER_NOUNS = Object.freeze([
  "Tank", "Toad", "Yak", "Orca", "Crab", "Moth", "Duck", "Goat",
  "Bear", "Wolf", "Boar", "Kiwi", "Frog", "Newt", "Mole", "Pug",
  "Owl", "Ant", "Eel", "Ape", "Ram", "Cat", "Dog", "Fox",
  "Cow", "Bat", "Emu", "Wasp", "Lynx", "Ibex", "Carp", "Seal",
]);
const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function browserRandomBytes(length) {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(bytes);
  }
  for (let index = 0; index < bytes.length; ++index) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function normalizeCommanderName(value) {
  // The original LAN preference is converted through AsciiString and carried
  // in a fixed 12-byte field, so normalize the launcher to that same domain.
  return Array.from(String(value ?? "").trim().replace(/[^\x20-\x7e]|[,:;]/g, ""))
    .slice(0, COMMANDER_NAME_MAX_LENGTH)
    .join("")
    .trim();
}

export function generateCommanderName(randomBytes = browserRandomBytes) {
  const bytes = randomBytes(6);
  if (!(bytes instanceof Uint8Array) || bytes.length < 6) {
    throw new TypeError("commander-name random source must return at least six bytes");
  }
  const adjective = COMMANDER_ADJECTIVES[bytes[0] % COMMANDER_ADJECTIVES.length];
  const noun = COMMANDER_NOUNS[bytes[1] % COMMANDER_NOUNS.length];
  const suffix = Array.from(bytes.subarray(2, 6),
    (byte) => BASE36[byte % BASE36.length]).join("");
  return `${adjective}${noun}${suffix}`;
}

function readStoredObject(storage, key) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveNetworkSettings(storage, settings) {
  const persisted = {
    room: String(settings?.room ?? "").trim(),
    name: normalizeCommanderName(settings?.name),
    iceServerUrl: String(settings?.iceServerUrl ?? "").trim(),
    iceUsername: String(settings?.iceUsername ?? ""),
  };
  try {
    storage?.setItem(NETWORK_SETTINGS_KEY, JSON.stringify(persisted));
  } catch {
    // Storage is optional; callers still use the returned settings this page.
  }
  return persisted;
}

export function loadOrCreateNetworkSettings({
  storage,
  queryParams = new URLSearchParams(),
  randomBytes = browserRandomBytes,
} = {}) {
  const current = readStoredObject(storage, NETWORK_SETTINGS_KEY);
  const legacy = current ? null : readStoredObject(storage, LEGACY_NETWORK_SETTINGS_KEY);
  const stored = current ?? legacy ?? {};
  const storedRoom = String(stored.room ?? "").trim();
  const room = queryParams.has("room")
    ? String(queryParams.get("room") ?? "").trim()
    : current ? storedRoom : (storedRoom || DEFAULT_NETWORK_ROOM);
  const requestedName = queryParams.has("peer") ? queryParams.get("peer") : stored.name;
  const name = normalizeCommanderName(requestedName) || generateCommanderName(randomBytes);
  return saveNetworkSettings(storage, {
    room,
    name,
    iceServerUrl: queryParams.has("ice") ? queryParams.get("ice") : stored.iceServerUrl,
    iceUsername: queryParams.has("iceUser") ? queryParams.get("iceUser") : stored.iceUsername,
  });
}
