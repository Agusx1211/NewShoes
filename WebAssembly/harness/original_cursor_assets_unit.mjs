import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import {
  convertCurFrameToPng,
  createOriginalCursorManifest,
  decodeCurFrame,
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
  const width = 2;
  const height = 2;
  const bitmapBytes = 40 + 16 * 4 + 8 + 8;
  const bytes = new Uint8Array(22 + bitmapBytes);
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 2, true);
  view.setUint16(4, 1, true);
  bytes[6] = width;
  bytes[7] = height;
  view.setUint16(10, 1, true);
  view.setUint16(12, 1, true);
  view.setUint32(14, bitmapBytes, true);
  view.setUint32(18, 22, true);
  view.setUint32(22, 40, true);
  view.setInt32(26, width, true);
  view.setInt32(30, height * 2, true);
  view.setUint16(34, 1, true);
  view.setUint16(36, 4, true);
  view.setUint32(42, 16, true);
  view.setUint32(54, 16, true);
  const palette = 22 + 40;
  bytes.set([seed, seed + 1, seed + 2, 0], palette + 4);
  const pixels = palette + 16 * 4;
  bytes[pixels] = 0x10;
  bytes[pixels + 4] = 0x01;
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
const decoded = decodeCurFrame(parsed.frames[0], "SCCAttack frame 0");
assert.deepEqual({ width: decoded.width, height: decoded.height, hotspot: decoded.hotspot },
  { width: 2, height: 2, hotspot: [1, 1] });
assert.deepEqual([...decoded.rgba.subarray(0, 4)], [0, 0, 0, 255]);
assert.deepEqual([...decoded.rgba.subarray(4, 8)], [13, 12, 11, 255]);
const converted = convertCurFrameToPng(parsed.frames[0], "SCCAttack frame 0");
assert.deepEqual([...converted.png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
const pngView = new DataView(converted.png.buffer, converted.png.byteOffset, converted.png.byteLength);
assert.equal(pngView.getUint32(16, false), 2);
assert.equal(pngView.getUint32(20, false), 2);
const idatOffset = 33;
assert.equal(new TextDecoder().decode(converted.png.subarray(idatOffset + 4, idatOffset + 8)), "IDAT");
const idatLength = pngView.getUint32(idatOffset, false);
const scanlines = inflateSync(converted.png.subarray(idatOffset + 8, idatOffset + 8 + idatLength));
assert.equal(scanlines.byteLength, 2 * (1 + 2 * 4));
assert.equal(scanlines[0], 0);
assert.deepEqual([...scanlines.subarray(1, 9)], [...decoded.rgba.subarray(0, 8)]);

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
assert.deepEqual(library.manifest.cursors.sccpointer.hotspot, [1, 1]);
assert.equal(library.manifest.cursors.sccpointer.mimeType, "image/png");
assert.deepEqual(library.manifest.cursors.sccattack.sequence, [0, 1, 0]);
assert.equal(created.length, 3);
assert.ok(created.every((blob) => blob.type === "image/png"));
assert.ok((await Promise.all(created.map(async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return bytes[0] === 0x89 && bytes[1] === 0x50;
}))).every(Boolean));
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
