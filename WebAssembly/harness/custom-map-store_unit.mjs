import assert from "node:assert/strict";
import { createCustomMapStore } from "./custom-map-store.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function memoryFs() {
  const dirs = new Set(["/"]);
  const files = new Map();
  const normalize = (path) => String(path).replace(/\/+$/, "") || "/";
  const parent = (path) => normalize(path).slice(0, normalize(path).lastIndexOf("/")) || "/";
  const requireParent = (path) => {
    if (!dirs.has(parent(path))) throw new Error(`missing parent: ${parent(path)}`);
  };
  return {
    mkdir(path) {
      const value = normalize(path);
      requireParent(value);
      if (dirs.has(value)) throw Object.assign(new Error("exists"), { errno: 20 });
      dirs.add(value);
    },
    stat(path) {
      const value = normalize(path);
      if (dirs.has(value)) return { mode: 16384, size: 0, mtime: new Date(0) };
      if (files.has(value)) return { mode: 32768, size: files.get(value).length, mtime: new Date(1) };
      throw Object.assign(new Error("missing"), { errno: 44 });
    },
    isDir: (mode) => mode === 16384,
    isFile: (mode) => mode === 32768,
    readdir(path) {
      const value = normalize(path);
      if (!dirs.has(value)) throw new Error("missing");
      const prefix = value === "/" ? "/" : `${value}/`;
      const names = new Set([".", ".."]);
      for (const candidate of [...dirs, ...files.keys()]) {
        if (!candidate.startsWith(prefix) || candidate === value) continue;
        const name = candidate.slice(prefix.length).split("/")[0];
        if (name) names.add(name);
      }
      return [...names];
    },
    writeFile(path, bytes) {
      const value = normalize(path);
      requireParent(value);
      files.set(value, new Uint8Array(bytes));
    },
    readFile(path) {
      const bytes = files.get(normalize(path));
      if (!bytes) throw new Error("missing");
      return new Uint8Array(bytes);
    },
    unlink(path) {
      if (!files.delete(normalize(path))) throw new Error("missing");
    },
    rmdir(path) {
      const value = normalize(path);
      const prefix = `${value}/`;
      if ([...dirs, ...files.keys()].some((candidate) => candidate.startsWith(prefix))) {
        throw new Error("not empty");
      }
      if (!dirs.delete(value)) throw new Error("missing");
    },
    rename(from, to) {
      const source = normalize(from);
      const target = normalize(to);
      requireParent(target);
      if (files.has(source)) {
        const bytes = files.get(source);
        files.delete(source);
        files.set(target, bytes);
        return;
      }
      if (!dirs.has(source)) throw new Error("missing");
      const movedDirs = [...dirs].filter((path) => path === source || path.startsWith(`${source}/`));
      const movedFiles = [...files.keys()].filter((path) => path.startsWith(`${source}/`));
      for (const path of movedDirs) dirs.delete(path);
      for (const path of movedFiles) {
        const bytes = files.get(path);
        files.delete(path);
        files.set(`${target}${path.slice(source.length)}`, bytes);
      }
      for (const path of movedDirs) dirs.add(`${target}${path.slice(source.length)}`);
    },
    has: (path) => dirs.has(normalize(path)) || files.has(normalize(path)),
    bytes: (path) => files.get(normalize(path)),
  };
}

const storage = memoryStorage();
const FS = memoryFs();
const persistReasons = [];
const store = createCustomMapStore({
  ready: async () => {},
  getModule: () => ({ FS }),
  persist: async (reason) => {
    persistReasons.push(reason);
    return { ok: true };
  },
  storage,
  randomId: (() => {
    let id = 0;
    return () => `test-${++id}`;
  })(),
});

const mapPayload = (name, value, extra = []) => [{
  name,
  files: [
    { path: `${name}.map`, bytes: Uint8Array.from([value, value + 1]) },
    ...extra,
  ],
}];

await store.install("vanilla", mapPayload("Alpine Assault", 1, [
  { path: "Alpine Assault.tga", bytes: Uint8Array.of(9) },
]));
let inventory = await store.list("vanilla");
assert.deepEqual(inventory.maps.map((map) => map.name), ["Alpine Assault"]);
assert.equal(
  inventory.maps[0].path,
  "/home/web_user/Command and Conquer Generals Zero Hour Data/Maps/Alpine Assault/Alpine Assault.map",
);
assert.equal(inventory.maps[0].hasPreview, true);
assert.equal(inventory.maps[0].size, 3);
assert.equal(FS.has("/home/web_user/Command and Conquer Generals Zero Hour Data/Maps/Alpine Assault/Alpine Assault.map"), true);

await assert.rejects(() => store.install("vanilla", mapPayload("Alpine Assault", 4)), /already installed/);
await store.install("vanilla", mapPayload("Alpine Assault", 5), { replace: true });
assert.deepEqual(
  [...FS.bytes("/home/web_user/Command and Conquer Generals Zero Hour Data/Maps/Alpine Assault/Alpine Assault.map")],
  [5, 6],
);

await store.install("vanilla", mapPayload("Beta Basin", 7));
inventory = await store.list();
assert.deepEqual(inventory.maps.map((map) => map.name), ["Alpine Assault", "Beta Basin"]);
await store.remove("vanilla", "Alpine Assault");
inventory = await store.list("vanilla");
assert.deepEqual(inventory.maps.map((map) => map.name), ["Beta Basin"]);
assert.ok(persistReasons.includes("custom-map-update"));
assert.ok(persistReasons.includes("custom-map-transaction-cleanup"));

const rollbackFs = memoryFs();
let failUpdate = false;
const rollbackStore = createCustomMapStore({
  ready: async () => {},
  getModule: () => ({ FS: rollbackFs }),
  persist: async (reason) => failUpdate && reason === "custom-map-update"
    ? { ok: false, error: "quota full" }
    : { ok: true },
  storage,
  randomId: () => "rollback",
});
await rollbackStore.install("vanilla", mapPayload("Rollback Ridge", 11));
failUpdate = true;
await assert.rejects(
  () => rollbackStore.install("vanilla", mapPayload("Rollback Ridge", 20), { replace: true }),
  /quota full/,
);
assert.deepEqual(
  [...rollbackFs.bytes("/home/web_user/Command and Conquer Generals Zero Hour Data/Maps/Rollback Ridge/Rollback Ridge.map")],
  [11, 12],
);

console.log("custom map store unit passed", {
  maps: inventory.maps.length,
  persists: persistReasons.length,
});
