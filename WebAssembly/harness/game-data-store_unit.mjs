import assert from "node:assert/strict";
import {
  createGameDataStore,
  gameDataDirectoryForContext,
  normalizeGameDataFileName,
} from "./game-data-store.mjs";
import { createModContext } from "./mod-context.mjs";

function memoryStorage(values = {}) {
  const map = new Map(Object.entries(values));
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
}

function memoryFs() {
  const dirs = new Set(["/"]);
  const files = new Map();
  const normalize = (path) => path.replace(/\/$/, "") || "/";
  return {
    mkdir(path) {
      const value = normalize(path);
      if (dirs.has(value)) throw Object.assign(new Error("exists"), { errno: 20 });
      dirs.add(value);
    },
    stat(path) {
      const value = normalize(path);
      if (dirs.has(value)) return { mode: 16384, size: 0, mtime: new Date(0) };
      if (files.has(value)) return { mode: 32768, size: files.get(value).length, mtime: new Date(0) };
      throw Object.assign(new Error("missing"), { errno: 44 });
    },
    isFile: (mode) => mode === 32768,
    readdir(path) {
      const value = normalize(path);
      if (!dirs.has(value)) throw new Error("missing");
      const prefix = value === "/" ? "/" : `${value}/`;
      const names = new Set([".", ".."]);
      for (const candidate of [...dirs, ...files.keys()]) {
        if (candidate.startsWith(prefix)) {
          const name = candidate.slice(prefix.length).split("/")[0];
          if (name) names.add(name);
        }
      }
      return [...names];
    },
    writeFile: (path, bytes) => files.set(normalize(path), new Uint8Array(bytes)),
    readFile(path) {
      const bytes = files.get(normalize(path));
      if (!bytes) throw new Error("missing");
      return new Uint8Array(bytes);
    },
    unlink: (path) => files.delete(normalize(path)),
  };
}

const context = await createModContext([{
    id: "mod-aaaaaaaa",
    name: "Alpha",
    version: "1",
    contentHash: "a".repeat(64),
    archives: [{
      opfsPath: "cnc-mods/mod-aaaaaaaa/archives/001-content.big",
      size: 10,
      sha256: "1".repeat(64),
    }],
  }]);
const contextId = context.id;
assert.match(gameDataDirectoryForContext(contextId), new RegExp(`${contextId}/Home/`));
assert.equal(normalizeGameDataFileName("Battle.sav", "save"), "Battle.sav");
assert.throws(() => normalizeGameDataFileName("Battle.rep", "save"), /\.sav/);
const storage = memoryStorage({
  "cncPortModLibrary.v1": JSON.stringify({ schema: 1, mods: context.mods }),
  "cncPortActiveModContext.v1": JSON.stringify(context),
  "cncPortModContextHistory.v1": JSON.stringify([context]),
});
const FS = memoryFs();
const store = createGameDataStore({
  ready: async () => {},
  getModule: () => ({ FS }),
  persist: async () => ({ ok: true }),
  storage,
});
await store.importFile("vanilla", "save", "Battle.sav", Uint8Array.from([1, 2, 3]));
await store.importFile("vanilla", "replay", "Battle.rep",
  Uint8Array.from([0x47, 0x45, 0x4e, 0x52, 0x45, 0x50, 1]));
await assert.rejects(() => store.importFile("vanilla", "replay", "Broken.rep", Uint8Array.from([1, 2, 3])),
  /GENREP/);
await assert.rejects(() => store.copyWithCompatibilityOverride({
  sourceContextId: "vanilla", targetContextId: contextId, kind: "save", name: "Battle.sav",
}), /acknowledgement/);
await store.copyWithCompatibilityOverride({
  sourceContextId: "vanilla",
  targetContextId: contextId,
  kind: "save",
  name: "Battle.sav",
  acknowledgeCompatibilityRisk: true,
});
await store.importFile(contextId, "replay", "00000000.rep",
  Uint8Array.from([0x47, 0x45, 0x4e, 0x52, 0x45, 0x50, 2]));
const inventory = await store.list();
assert.equal(inventory.contexts.find((candidate) => candidate.id === contextId).saves.length, 1);
assert.equal(inventory.contexts.find((candidate) => candidate.id === "vanilla").replays.length, 1);
await assert.rejects(() => store.remove(contextId, "replay", "00000000.rep"), /protected/);

console.log("game data store unit passed", { contexts: inventory.contexts.length });
