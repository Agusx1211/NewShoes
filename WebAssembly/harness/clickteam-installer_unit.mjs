import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import {
  decompressClickteamPayload,
  inspectClickteamInstaller,
  readClickteamEntry,
  readClickteamEntryReader,
} from "./clickteam-installer.mjs";
import { decompressBzip } from "./vendor/seek-bzip.min.mjs";

function setU16(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);
}

function setU32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function block(id, payload) {
  const bytes = new Uint8Array(8 + payload.byteLength);
  setU16(bytes, 0, id);
  setU16(bytes, 2, id === 0x7f7f ? 0 : 1);
  setU32(bytes, 4, payload.byteLength);
  bytes.set(payload, 8);
  return bytes;
}

function compressedPayload(value) {
  const compressed = new Uint8Array(deflateSync(value));
  const bytes = new Uint8Array(5 + compressed.byteLength);
  setU32(bytes, 0, value.byteLength);
  bytes[4] = 1;
  bytes.set(compressed, 5);
  return bytes;
}

const filePayload = new TextEncoder().encode("BIGF synthetic clickteam payload");
const compressedFile = new Uint8Array(deflateSync(filePayload));
const fileRecord = new Uint8Array(5 + compressedFile.byteLength);
fileRecord[4] = 1;
fileRecord.set(compressedFile, 5);
const path = new TextEncoder().encode("Wrapper\\Synthetic.big");
const nodeSize = 64 + path.byteLength + 1;
const fileList = new Uint8Array(4 + nodeSize);
setU16(fileList, 0, 1);
setU32(fileList, 4, nodeSize);
setU16(fileList, 8, 0);
setU32(fileList, 4 + 24, filePayload.byteLength);
setU32(fileList, 4 + 28, 0);
setU32(fileList, 4 + 32, fileRecord.byteLength);
fileList.set(path, 4 + 64);

const prefix = new Uint8Array(64);
prefix.set([0x4d, 0x5a]);
const signature = Uint8Array.from([0x77, 0x77, 0x67, 0x54, 0x29, 0x48]);
const listBlock = block(0x143a, compressedPayload(fileList));
const dataBlock = block(0x7f7f, fileRecord);
const installerBytes = new Uint8Array(prefix.byteLength + signature.byteLength
  + listBlock.byteLength + dataBlock.byteLength);
let output = 0;
for (const part of [prefix, signature, listBlock, dataBlock]) {
  installerBytes.set(part, output);
  output += part.byteLength;
}
const reader = {
  size: installerBytes.byteLength,
  read: async (offset, length) => installerBytes.slice(offset, offset + length),
};
const installer = await inspectClickteamInstaller(reader, { bzipDecompress: decompressBzip });
assert.equal(installer.version, 40);
assert.equal(installer.entries.length, 1);
assert.equal(installer.entries[0].path, "Wrapper\\Synthetic.big");
assert.deepEqual(await readClickteamEntry(reader, installer, installer.entries[0], {
  bzipDecompress: decompressBzip,
}), filePayload);
const entryReader = await readClickteamEntryReader(reader, installer, installer.entries[0], {
  bzipDecompress: decompressBzip,
});
assert.deepEqual(await entryReader.read(2, filePayload.byteLength - 4), filePayload.subarray(2, -2));
assert.equal(await inspectClickteamInstaller({
  size: 64,
  read: async (offset, length) => new Uint8Array(length),
}), null);

const truncatedBzip = Uint8Array.from(Buffer.from(
  "QlpoOTFBWSZTWRZpA+IAASvXgAAQQAAYAAAQLi/WIDAAuAphNNAaYhTCaaA0xApVQwmmJ6hpqIsEXJFkRZEWZFgi3ItyLUiwRckXJFmRfRF8IsEXkiwRdEWpF0RaEWxFgi2IvxFoReCLoi7kX8U=",
  "base64",
));
const decodedBzip = decompressBzip(truncatedBzip, 3300);
assert.equal(new TextDecoder().decode(decodedBzip), "Clickteam truncated BZip payload\n".repeat(100));

const truncatedDeflateSource = new TextEncoder().encode("Clickteam truncated deflate payload\n".repeat(100));
const truncatedDeflate = new Uint8Array(deflateSync(truncatedDeflateSource)).subarray(0, -4);
assert.deepEqual(
  await decompressClickteamPayload(1, truncatedDeflate, truncatedDeflateSource.byteLength),
  truncatedDeflateSource,
);

const largeSource = new Uint8Array(5 * 1024 * 1024 + 17);
for (let index = 0; index < largeSource.byteLength; index += 1) largeSource[index] = index & 0xff;
const largeCompressed = new Uint8Array(deflateSync(largeSource));
const largeRecord = new Uint8Array(5 + largeCompressed.byteLength);
largeRecord[4] = 1;
largeRecord.set(largeCompressed, 5);
const largeInstaller = { dataStart: 0 };
const largeEntry = {
  type: 0,
  path: "Large.big",
  offset: 0,
  compressedSize: largeRecord.byteLength,
  uncompressedSize: largeSource.byteLength,
};
const largeReader = await readClickteamEntryReader({
  size: largeRecord.byteLength,
  read: async (offset, length) => largeRecord.subarray(offset, offset + length),
}, largeInstaller, largeEntry);
assert.deepEqual(
  await largeReader.read(4 * 1024 * 1024 - 8, 32),
  largeSource.subarray(4 * 1024 * 1024 - 8, 4 * 1024 * 1024 + 24),
  "reader spans pako output chunks without joining the full payload",
);

const oversizedListHeader = new Uint8Array(5);
setU32(oversizedListHeader, 0, 129 * 1024 * 1024);
const oversizedListBlock = block(0x143a, oversizedListHeader);
const oversizedInstaller = new Uint8Array(prefix.byteLength + signature.byteLength
  + oversizedListBlock.byteLength);
oversizedInstaller.set(prefix);
oversizedInstaller.set(signature, prefix.byteLength);
oversizedInstaller.set(oversizedListBlock, prefix.byteLength + signature.byteLength);
await assert.rejects(() => inspectClickteamInstaller({
  size: oversizedInstaller.byteLength,
  read: async (offset, length) => oversizedInstaller.slice(offset, offset + length),
}), /safety limit/);

console.log("Clickteam installer unit passed", {
  installerBytes: installerBytes.byteLength,
  truncatedBzipBytes: truncatedBzip.byteLength,
});
