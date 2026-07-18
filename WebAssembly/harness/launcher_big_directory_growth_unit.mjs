import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const workerUrl = new URL("./launcher-asset-worker.js", import.meta.url);
const workerSource = await readFile(workerUrl, "utf8");

let allocatedBytes = 0;
function CountingUint8Array(value, ...rest) {
  if (typeof value === "number") allocatedBytes += value;
  return new Uint8Array(value, ...rest);
}

const workerGlobal = {
  ZeroHArchiveSpecs: [],
  postMessage() {},
};
const context = vm.createContext({
  console,
  importScripts() {},
  self: workerGlobal,
  TextDecoder,
  TextEncoder,
  Uint8Array: CountingUint8Array,
});
vm.runInContext(
  `${workerSource}\nself.__validateBigReader = validateBigReader;`,
  context,
  { filename: workerUrl.pathname },
);

function setU32BE(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function setU32LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

function makeArchive(entryCount) {
  const encoder = new TextEncoder();
  const records = [];
  let directoryBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    const path = `Data\\Synthetic\\entry-${String(index).padStart(5, "0")}-${"x".repeat(210)}.bin`;
    const encoded = encoder.encode(path);
    const record = new Uint8Array(8 + encoded.byteLength + 1);
    record.set(encoded, 8);
    records.push({ path, record });
    directoryBytes += record.byteLength;
  }

  const archiveSize = 16 + directoryBytes;
  const archive = new Uint8Array(archiveSize);
  archive.set(new TextEncoder().encode("BIGF"), 0);
  setU32LE(archive, 4, archiveSize);
  setU32BE(archive, 8, entryCount);
  let cursor = 16;
  for (const { record } of records) {
    setU32BE(record, 0, archiveSize);
    archive.set(record, cursor);
    cursor += record.byteLength;
  }
  return { archive, directoryBytes, requiredPath: records.at(-1).path };
}

function readerFor(bytes) {
  return {
    size: bytes.byteLength,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}

const fixture = makeArchive(8192);
allocatedBytes = 0;
const startedAt = performance.now();
const validation = await workerGlobal.__validateBigReader(
  readerFor(fixture.archive),
  "large synthetic BIGF",
  [fixture.requiredPath],
);
const elapsedMs = performance.now() - startedAt;
const benchmarkAllocatedBytes = allocatedBytes;
const allocationAmplification = benchmarkAllocatedBytes / fixture.directoryBytes;
const chunkSize = 64 * 1024;
const fixedGrowthChunks = Math.floor(fixture.directoryBytes / chunkSize);
const fixedGrowthRemainder = fixture.directoryBytes % chunkSize;
const fixedGrowthAllocatedBytes = chunkSize * fixedGrowthChunks * (fixedGrowthChunks + 1) / 2
  + (fixedGrowthRemainder ? fixture.directoryBytes : 0);
const allocationReduction = fixedGrowthAllocatedBytes / benchmarkAllocatedBytes;

assert.equal(validation.entryCount, 8192);
assert.ok(allocationAmplification < 3,
  `directory growth allocated ${benchmarkAllocatedBytes} bytes for ${fixture.directoryBytes} bytes `
  + `(${allocationAmplification.toFixed(2)}x amplification in ${elapsedMs.toFixed(2)} ms)`);
assert.ok(allocationReduction > 7,
  `geometric growth only reduced fixed-growth allocations by ${allocationReduction.toFixed(2)}x`);

const retailScale = makeArchive(560);
allocatedBytes = 0;
await workerGlobal.__validateBigReader(readerFor(retailScale.archive), "retail-scale BIGF");
const retailAllocatedBytes = allocatedBytes;
assert.equal(retailAllocatedBytes, 393216,
  "small retail-scale directories retain the existing three-chunk allocation profile");

await assert.rejects(
  () => workerGlobal.__validateBigReader(readerFor(retailScale.archive), "required entry", ["missing.bin"]),
  /required game content is missing/,
);
const overlapping = retailScale.archive.slice();
setU32BE(overlapping, 16, 16);
await assert.rejects(
  () => workerGlobal.__validateBigReader(readerFor(overlapping), "overlapping entry"),
  /overlaps the directory/,
);

console.log(JSON.stringify({
  ok: true,
  entries: validation.entryCount,
  directoryBytes: fixture.directoryBytes,
  allocatedBytes: benchmarkAllocatedBytes,
  allocationAmplification,
  fixedGrowthAllocatedBytes,
  allocationReduction,
  retailAllocatedBytes,
  elapsedMs,
}));
