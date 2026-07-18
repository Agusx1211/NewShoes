import assert from "node:assert/strict";
import { createReplayFileStore, CNC_PORT_REPLAY_DIR, MAX_REPLAY_BYTES } from "./replay-file-store.mjs";

function fakeFilesystem() {
  const entries = new Map();
  const directories = new Set(["/"]);
  const FS = {
    mkdir(path) {
      if (directories.has(path)) throw Object.assign(new Error("exists"), { errno: 20 });
      directories.add(path);
    },
    stat(path) {
      if (directories.has(path)) return { mode: 0o040000, size: 0, mtime: new Date(0) };
      const entry = entries.get(path);
      if (!entry) throw Object.assign(new Error("missing"), { errno: 44 });
      return { mode: 0o100000, size: entry.byteLength, mtime: new Date("2026-07-13T00:00:00Z") };
    },
    isFile(mode) { return (mode & 0o170000) === 0o100000; },
    readdir(path) {
      if (!directories.has(path)) throw new Error("missing directory");
      return [".", "..", ...[...entries.keys()]
        .filter((entry) => entry.startsWith(`${path}/`) && !entry.slice(path.length + 1).includes("/"))
        .map((entry) => entry.slice(path.length + 1))];
    },
    writeFile(path, bytes) { entries.set(path, new Uint8Array(bytes)); },
    readFile(path) {
      const entry = entries.get(path);
      if (!entry) throw new Error("missing file");
      return new Uint8Array(entry);
    },
    unlink(path) {
      if (!entries.delete(path)) throw new Error("missing file");
    },
  };
  return { FS, entries };
}

const fake = fakeFilesystem();
const persistReasons = [];
const replayDirectory = `${CNC_PORT_REPLAY_DIR}/isolated-context`;
const store = createReplayFileStore({
  ready: async () => {},
  getModule: () => ({ FS: fake.FS }),
  persist: async (reason) => { persistReasons.push(reason); return { ok: true }; },
  directory: replayDirectory,
});
const retailShape = new Uint8Array([0x47, 0x45, 0x4e, 0x52, 0x45, 0x50, 1, 2, 3, 4]);

const first = await store.importFile("battle.rep", retailShape);
assert.deepEqual(first, { ok: true, name: "battle.rep", size: 10, persisted: true });
const second = await store.importFile("battle.rep", retailShape.buffer);
assert.equal(second.name, "battle (2).rep");
const volatile = await store.importFile("profile-only.rep", retailShape, { durable: false });
assert.deepEqual(volatile,
  { ok: true, name: "profile-only.rep", size: 10, persisted: false });
assert.deepEqual((await store.list()).files.map((file) => file.name),
  ["battle (2).rep", "battle.rep", "profile-only.rep"]);
assert.deepEqual(await store.read("battle.rep"), retailShape);
assert.deepEqual(persistReasons, ["replay-import", "replay-import"]);

await assert.rejects(() => store.importFile("not-a-replay.rep", new Uint8Array([1, 2, 3, 4, 5, 6])), /GENREP/);
await assert.rejects(() => store.importFile("../escape.rep", retailShape), /invalid/);
await assert.rejects(() => store.importFile("missing-extension", retailShape), /\.rep/);
await assert.rejects(() => store.importFile("huge.rep", new Uint8Array(MAX_REPLAY_BYTES + 1)), /64 MB/);

fake.FS.writeFile(`${replayDirectory}/00000000.rep`, retailShape);
await assert.rejects(() => store.remove("00000000.rep"), /protected/);
await store.remove("battle.rep");
assert.deepEqual((await store.list()).files.map((file) => file.name),
  ["00000000.rep", "battle (2).rep", "profile-only.rep"]);
assert.equal(persistReasons.at(-1), "replay-delete");

console.log("replay file store unit: PASS");
