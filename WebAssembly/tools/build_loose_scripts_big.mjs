#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const output = resolve(process.argv[3] ?? `${root}/LooseScripts.big`);

const entries = [
  {
    source: "SkirmishScripts.scb",
    path: "Data\\Scripts\\SkirmishScripts.scb",
  },
  {
    source: "MultiplayerScripts.scb",
    path: "Data\\Scripts\\MultiplayerScripts.scb",
  },
  {
    source: "Scripts.ini",
    path: "Data\\Scripts\\Scripts.ini",
  },
];

function writeUInt32BE(bytes, offset, value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`BIG integer out of range: ${value}`);
  }
  bytes[offset] = Math.floor(value / 0x1000000) & 0xff;
  bytes[offset + 1] = Math.floor(value / 0x10000) & 0xff;
  bytes[offset + 2] = Math.floor(value / 0x100) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function writeUInt32LE(bytes, offset, value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`BIG integer out of range: ${value}`);
  }
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = Math.floor(value / 0x100) & 0xff;
  bytes[offset + 2] = Math.floor(value / 0x10000) & 0xff;
  bytes[offset + 3] = Math.floor(value / 0x1000000) & 0xff;
}

const encoder = new TextEncoder();
const loaded = [];
for (const entry of entries) {
  const bytes = new Uint8Array(await readFile(resolve(root, entry.source)));
  const pathBytes = encoder.encode(entry.path);
  loaded.push({ ...entry, bytes, pathBytes });
}

const directoryBytes = loaded.reduce(
  (sum, entry) => sum + 8 + entry.pathBytes.byteLength + 1,
  0,
);
const dataStart = 0x10 + directoryBytes;
const totalBytes = dataStart + loaded.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
const archive = new Uint8Array(totalBytes);
archive.set([0x42, 0x49, 0x47, 0x46], 0);
// Original Win32BIGFileSystem reads the archive-size field directly on
// little-endian x86. Count and directory entry fields remain big-endian.
writeUInt32LE(archive, 4, totalBytes);
writeUInt32BE(archive, 8, loaded.length);
writeUInt32BE(archive, 12, 0);

let directoryCursor = 0x10;
let dataCursor = dataStart;
for (const entry of loaded) {
  writeUInt32BE(archive, directoryCursor, dataCursor);
  writeUInt32BE(archive, directoryCursor + 4, entry.bytes.byteLength);
  archive.set(entry.pathBytes, directoryCursor + 8);
  archive[directoryCursor + 8 + entry.pathBytes.byteLength] = 0;
  archive.set(entry.bytes, dataCursor);
  directoryCursor += 8 + entry.pathBytes.byteLength + 1;
  dataCursor += entry.bytes.byteLength;
}

await writeFile(output, archive);
console.log(output);
