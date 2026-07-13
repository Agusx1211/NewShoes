import assert from "node:assert/strict";
import {
  createTransferUserDataStore,
  TRANSFER_REPLAY_DIR,
  TRANSFER_SAVE_DIR,
} from "./transfer-user-data-store.mjs";

function fakeFilesystem() {
  const files = new Map();
  const directories = new Set(["/"]);
  const FS = {
    mkdir(path) {
      if (directories.has(path)) throw new Error("exists");
      directories.add(path);
    },
    stat(path) {
      if (directories.has(path)) return { mode: 0o040000, size: 0 };
      const bytes = files.get(path);
      if (!bytes) throw new Error("missing");
      return { mode: 0o100000, size: bytes.byteLength };
    },
    isFile(mode) { return (mode & 0o170000) === 0o100000; },
    readdir(path) {
      if (!directories.has(path)) throw new Error("missing directory");
      return [".", "..", ...[...files.keys()]
        .filter((entry) => entry.startsWith(`${path}/`) && !entry.slice(path.length + 1).includes("/"))
        .map((entry) => entry.slice(path.length + 1))];
    },
    open(path, mode) {
      if (mode === "w") files.set(path, new Uint8Array(0));
      if (!files.has(path)) throw new Error("missing file");
      return { path, mode, closed: false };
    },
    read(stream, target, targetOffset, length, position) {
      const source = files.get(stream.path);
      const slice = source.subarray(position, position + length);
      target.set(slice, targetOffset);
      return slice.byteLength;
    },
    write(stream, source, sourceOffset, length, position) {
      const previous = files.get(stream.path);
      const next = new Uint8Array(Math.max(previous.byteLength, position + length));
      next.set(previous);
      next.set(source.subarray(sourceOffset, sourceOffset + length), position);
      files.set(stream.path, next);
      return length;
    },
    close(stream) { stream.closed = true; },
    unlink(path) {
      if (!files.delete(path)) throw new Error("missing file");
    },
    rename(from, to) {
      const bytes = files.get(from);
      if (!bytes) throw new Error("missing source");
      files.set(to, bytes);
      files.delete(from);
    },
  };
  return { FS, files };
}

const fake = fakeFilesystem();
const replay = new Uint8Array([0x47, 0x45, 0x4e, 0x52, 0x45, 0x50, 7, 8, 9]);
const save = new Uint8Array([10, 11, 12, 13]);
let randomSequence = 0;
const persistReasons = [];
const store = createTransferUserDataStore({
  ready: async () => {},
  getModule: () => ({ FS: fake.FS }),
  persist: async (reason) => { persistReasons.push(reason); return { ok: true }; },
  randomId: () => `test-${++randomSequence}`,
});
fake.FS.mkdir("/home");
fake.FS.mkdir("/home/web_user");
fake.FS.mkdir("/home/web_user/Command and Conquer Generals Zero Hour Data");
fake.FS.mkdir(TRANSFER_SAVE_DIR);
fake.FS.mkdir(TRANSFER_REPLAY_DIR);
fake.files.set(`${TRANSFER_SAVE_DIR}/campaign.sav`, save);
fake.files.set(`${TRANSFER_REPLAY_DIR}/battle.rep`, replay);

const listed = await store.list({ includeSaves: true, includeReplays: true });
assert.deepEqual(listed.map(({ kind, name, bytes }) => ({ kind, name, bytes })), [
  { kind: "save", name: "campaign.sav", bytes: 4 },
  { kind: "replay", name: "battle.rep", bytes: 9 },
]);
assert.deepEqual(await store.readChunk(listed[0], 1, 2), new Uint8Array([11, 12]));

const incoming = [
  { id: "save-new", kind: "save", name: "campaign.sav", bytes: 3 },
  { id: "replay-new", kind: "replay", name: "match.rep", bytes: replay.byteLength },
];
const session = await store.beginImport(incoming);
await session.beginFile("save-new");
await session.writeChunk("save-new", 0, new Uint8Array([21, 22]));
await session.writeChunk("save-new", 2, new Uint8Array([23]));
await session.finishFile("save-new");
await session.beginFile("replay-new");
await session.writeChunk("replay-new", 0, replay.subarray(0, 5));
await session.writeChunk("replay-new", 5, replay.subarray(5));
await session.finishFile("replay-new");
const imported = await session.finish();
assert.equal(imported[0].finalName, "campaign (2).sav");
assert.equal(imported[1].finalName, "match.rep");
assert.deepEqual(fake.files.get(`${TRANSFER_SAVE_DIR}/campaign (2).sav`), new Uint8Array([21, 22, 23]));
assert.deepEqual(fake.files.get(`${TRANSFER_REPLAY_DIR}/match.rep`), replay);
assert.deepEqual(persistReasons, ["device-transfer-import"]);

const invalidReplay = await store.beginImport([
  { id: "bad", kind: "replay", name: "bad.rep", bytes: 6 },
]);
await invalidReplay.beginFile("bad");
await invalidReplay.writeChunk("bad", 0, new Uint8Array(6));
await assert.rejects(() => invalidReplay.finishFile("bad"), /GENREP/);
await invalidReplay.abort();
assert.equal([...fake.files.keys()].some((path) => path.includes("test-3")), false);

console.log("transfer user-data store unit: PASS");
