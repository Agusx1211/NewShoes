import assert from "node:assert/strict";
import { ModPackageStore } from "./mod-package-store.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function fakeMod(id, name, hash, archiveHash) {
  return {
    id,
    name,
    version: "1",
    contentHash: hash,
    archives: [{
      opfsPath: `cnc-mods/${id}/archives/001-content.big`,
      size: 100,
      sha256: archiveHash,
    }],
  };
}

const storage = memoryStorage();
const store = new ModPackageStore({ storage, workerFactory: () => {
  throw new Error("worker should not be needed by composition tests");
} });
const alpha = fakeMod("mod-aaaaaaaa", "Alpha", "a".repeat(64), "1".repeat(64));
const beta = fakeMod("mod-bbbbbbbb", "Beta", "b".repeat(64), "2".repeat(64));
storage.setItem("cncPortModLibrary.v1", JSON.stringify({ schema: 1, mods: [alpha, beta] }));

const selected = await store.apply([beta.id, alpha.id]);
assert.deepEqual(selected.mods.map((mod) => mod.name), ["Beta", "Alpha"]);
assert.equal(store.active().id, selected.id);
assert.equal(store.list().length, 2);
store.setArchiveEnabled(alpha.id, alpha.archives[0].opfsPath, false);
await assert.rejects(() => store.apply([alpha.id]), /at least one archive/);
store.setArchiveEnabled(alpha.id, alpha.archives[0].opfsPath, true);
await assert.rejects(() => store.remove(beta.id), /Disable this mod/);
await store.useVanilla();
assert.equal(store.active().id, "vanilla");

console.log("mod package store unit passed", { selected: selected.id });
