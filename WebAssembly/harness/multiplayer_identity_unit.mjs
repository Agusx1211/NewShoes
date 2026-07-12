import assert from "node:assert/strict";
import {
  COMMANDER_NAME_MAX_LENGTH,
  DEFAULT_NETWORK_ROOM,
  LEGACY_NETWORK_SETTINGS_KEY,
  NETWORK_SETTINGS_KEY,
  generateCommanderName,
  loadOrCreateNetworkSettings,
  normalizeCommanderName,
  saveNetworkSettings,
} from "./multiplayer_identity.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    value: (key) => values.get(key) ?? null,
  };
}

const deterministic = () => Uint8Array.from([0, 0, 0, 1, 2, 3]);
const generated = generateCommanderName(deterministic);
assert.equal(generated, "MadTank0123");
assert.ok(generated.length <= COMMANDER_NAME_MAX_LENGTH);

const freshStorage = memoryStorage();
const fresh = loadOrCreateNetworkSettings({ storage: freshStorage, randomBytes: deterministic });
assert.equal(fresh.room, DEFAULT_NETWORK_ROOM);
assert.equal(fresh.name, generated);
assert.deepEqual(JSON.parse(freshStorage.value(NETWORK_SETTINGS_KEY)), fresh);

const reloaded = loadOrCreateNetworkSettings({
  storage: freshStorage,
  randomBytes: () => Uint8Array.from([31, 31, 9, 9, 9, 9]),
});
assert.equal(reloaded.name, generated, "a browser install must retain one commander identity");

const legacyStorage = memoryStorage({
  [LEGACY_NETWORK_SETTINGS_KEY]: JSON.stringify({ room: "", name: "OldCommanderName" }),
});
const migrated = loadOrCreateNetworkSettings({ storage: legacyStorage, randomBytes: deterministic });
assert.equal(migrated.room, DEFAULT_NETWORK_ROOM);
assert.equal(migrated.name, "OldCommander");

saveNetworkSettings(legacyStorage, { room: "", name: "Tiny:Tank,Commander" });
const intentionalOffline = loadOrCreateNetworkSettings({ storage: legacyStorage, randomBytes: deterministic });
assert.equal(intentionalOffline.room, "", "v2 must preserve an intentional offline room");
assert.equal(intentionalOffline.name, "TinyTankComm");

const queryOverride = loadOrCreateNetworkSettings({
  storage: freshStorage,
  queryParams: new URLSearchParams("room=test-room&peer=Query;CommanderLong"),
  randomBytes: deterministic,
});
assert.equal(queryOverride.room, "test-room");
assert.equal(queryOverride.name, "QueryCommand");
assert.equal(normalizeCommanderName("  A:B,C;D  "), "ABCD");
assert.equal(normalizeCommanderName("Tänk 🚜 Boss"), "Tnk  Boss");

console.log("multiplayer identity unit passed", {
  defaultRoom: DEFAULT_NETWORK_ROOM,
  generated,
  combinations: 32 * 32 * (36 ** 4),
});
