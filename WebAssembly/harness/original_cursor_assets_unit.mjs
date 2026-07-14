import assert from "node:assert/strict";
import {
  createOriginalCursorManifest,
  parseAniCursor,
  parseBigEntries,
} from "./original-cursor-assets.mjs";

const encoder = new TextEncoder();

function chunk(id, payload) {
  const bytes = new Uint8Array(8 + payload.byteLength + (payload.byteLength & 1));
  bytes.set(encoder.encode(id), 0);
  new DataView(bytes.buffer).setUint32(4, payload.byteLength, true);
  bytes.set(payload, 8);
  return bytes;
}

function concat(...parts) {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function syntheticCur(seed) {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 2, true);
  view.setUint16(4, 1, true);
  bytes[6] = 1;
  bytes[7] = 1;
  bytes[21] = seed;
  return bytes;
}

function syntheticAni(frameSeeds, sequence = frameSeeds.map((_value, index) => index)) {
  const header = new Uint8Array(36);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, 36, true);
  headerView.setUint32(4, frameSeeds.length, true);
  headerView.setUint32(8, sequence.length, true);
  headerView.setUint32(28, 4, true);
  const sequenceBytes = new Uint8Array(sequence.length * 4);
  const rateBytes = new Uint8Array(sequence.length * 4);
  sequence.forEach((value, index) => {
    new DataView(sequenceBytes.buffer).setUint32(index * 4, value, true);
    new DataView(rateBytes.buffer).setUint32(index * 4, index + 2, true);
  });
  const frameList = concat(encoder.encode("fram"),
    ...frameSeeds.map((seed) => chunk("icon", syntheticCur(seed))));
  const body = concat(encoder.encode("ACON"), chunk("anih", header),
    chunk("rate", rateBytes), chunk("seq ", sequenceBytes), chunk("LIST", frameList));
  const bytes = new Uint8Array(8 + body.byteLength);
  bytes.set(encoder.encode("RIFF"));
  new DataView(bytes.buffer).setUint32(4, body.byteLength, true);
  bytes.set(body, 8);
  return bytes;
}

function writeU32be(bytes, offset, value) {
  new DataView(bytes.buffer).setUint32(offset, value, false);
}

function syntheticBig(entries) {
  const values = entries.map(([path, data]) => ({ path: encoder.encode(path), data }));
  const dataStart = 16 + values.reduce((sum, entry) => sum + 9 + entry.path.byteLength, 0);
  const bytes = new Uint8Array(dataStart + values.reduce((sum, entry) => sum + entry.data.byteLength, 0));
  bytes.set(encoder.encode("BIGF"));
  new DataView(bytes.buffer).setUint32(4, bytes.byteLength, true);
  writeU32be(bytes, 8, values.length);
  let directory = 16;
  let dataOffset = dataStart;
  for (const entry of values) {
    writeU32be(bytes, directory, dataOffset);
    writeU32be(bytes, directory + 4, entry.data.byteLength);
    bytes.set(entry.path, directory + 8);
    directory += 9 + entry.path.byteLength;
    bytes.set(entry.data, dataOffset);
    dataOffset += entry.data.byteLength;
  }
  return bytes;
}

const attackAni = syntheticAni([11, 12], [0, 1, 0]);
const parsed = parseAniCursor(attackAni, "SCCAttack.ani");
assert.equal(parsed.frames.length, 2);
assert.deepEqual(parsed.sequence, [0, 1, 0]);
assert.deepEqual(parsed.rates, [2, 3, 4]);

const pack = syntheticBig([
  ["Data\\Cursors\\SCCPointer.ani", syntheticAni([7], [0])],
  ["Data\\Cursors\\SCCAttack.ani", attackAni],
]);
assert.equal(parseBigEntries(pack).size, 2);
const created = [];
const revoked = [];
const library = createOriginalCursorManifest(pack, {
  createObjectURL(blob) {
    created.push(blob);
    return `blob:cursor-${created.length}`;
  },
  revokeObjectURL(url) { revoked.push(url); },
});
assert.equal(library.manifest.source, "browser_library_cursor_pack");
assert.equal(library.manifest.cursors.sccpointer.frames.length, 1);
assert.match(library.manifest.cursors.sccpointer.frames[0], /^blob:cursor-/);
assert.deepEqual(library.manifest.cursors.sccattack.sequence, [0, 1, 0]);
assert.equal(created.length, 3);
assert.ok(created.every((blob) => blob.type === "image/x-icon"));
library.dispose();
library.dispose();
assert.deepEqual(new Set(revoked), new Set(["blob:cursor-1", "blob:cursor-2", "blob:cursor-3"]));

const partialCreated = [];
const partialRevoked = [];
assert.throws(() => createOriginalCursorManifest(syntheticBig([
  ["Data\\Cursors\\SCCPointer.ani", syntheticAni([1])],
]), {
  createObjectURL(blob) {
    partialCreated.push(blob);
    return `blob:partial-${partialCreated.length}`;
  },
  revokeObjectURL(url) { partialRevoked.push(url); },
}), /missing SCCPointer or SCCAttack/);
assert.equal(partialCreated.length, 1);
assert.deepEqual(partialRevoked, ["blob:partial-1"]);

console.log("original cursor assets unit: ok");
