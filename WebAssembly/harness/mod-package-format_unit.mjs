import assert from "node:assert/strict";
import {
  Sha256,
  classifyContainerEntries,
  createBigDirectory,
  enginePathFromContainerPath,
  modContentHash,
  parse7zSlt,
  validateBigReader,
} from "./mod-package-format.mjs";

assert.equal(new Sha256().update(new TextEncoder().encode("abc")).digestHex(),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
const long = new Uint8Array(1_000_000).fill(0x61);
assert.equal(new Sha256().update(long.subarray(0, 17)).update(long.subarray(17)).digestHex(),
  "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
assert.equal(modContentHash([{ name: "Content.BIG", size: 3, sha256: "a".repeat(64) }]),
  modContentHash([{ name: "content.big", size: 3, sha256: "A".repeat(64) }]));

const parsed = parse7zSlt([
  "  0M Scan /input/\b\bPath = Wrapper/Data/INI/GameData.ini",
  "Folder = -", "Size = 12", "Encrypted = -", "",
  "Path = Wrapper/ShockWave.big", "Folder = -", "Size = 99", "",
]);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].path, "Wrapper/Data/INI/GameData.ini");
assert.equal(enginePathFromContainerPath(parsed[0].path), "Data\\INI\\GameData.ini");
const classified = classifyContainerEntries([
  ...parsed,
  { path: "payload/Contra009Final.ctr", size: 41, folder: false },
  { path: "payload/ShockWave.gib", size: 42, folder: false },
  { path: "setup/helper.dll", size: 5, folder: false },
  { path: "payload.7z", size: 5, folder: false },
]);
assert.equal(classified.bigs.length, 3);
assert.equal(classified.loose.length, 1);
assert.equal(classified.ignoredNative.length, 1);
assert.equal(classified.nested.length, 1);

const payloadA = new TextEncoder().encode("hello");
const payloadB = new TextEncoder().encode("world!");
const directory = createBigDirectory([
  { enginePath: "Data\\INI\\A.ini", size: payloadA.length },
  { enginePath: "Data\\INI\\B.ini", size: payloadB.length },
]);
const archive = new Uint8Array(directory.totalSize);
archive.set(directory.header);
archive.set(payloadA, directory.files[0].dataOffset);
archive.set(payloadB, directory.files[1].dataOffset);
const validation = await validateBigReader({
  size: archive.byteLength,
  read: async (offset, length) => archive.subarray(offset, offset + length),
}, "synthetic mod");
assert.equal(validation.fileCount, 2);

const overlapping = archive.slice();
overlapping.set([0, 0, 0, 16], 16);
await assert.rejects(() => validateBigReader({
  size: overlapping.byteLength,
  read: async (offset, length) => overlapping.subarray(offset, offset + length),
}, "overlapping mod"), /overlaps its directory/);

console.log("mod package format unit passed", { bytes: archive.byteLength });
