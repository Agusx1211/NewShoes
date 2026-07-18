import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  FILE_METADATA_READ_CONCURRENCY,
  filesFromHandles,
} from "./launcher-file-collector.mjs";

const fileCount = 256;
const delayMs = 4;
let activeReads = 0;
let maxConcurrentReads = 0;

const entries = Array.from({ length: fileCount }, (_, index) => {
  const name = `file-${String(index).padStart(4, "0")}.bin`;
  return [name, {
    kind: "file",
    async getFile() {
      activeReads += 1;
      maxConcurrentReads = Math.max(maxConcurrentReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      activeReads -= 1;
      return new File([new Uint8Array([index & 0xff])], name);
    },
  }];
});
const root = {
  kind: "directory",
  name: "Zero Hour",
  async queryPermission() { return "granted"; },
  async *entries() { for (const entry of entries) yield entry; },
};

const startedAt = performance.now();
const files = await filesFromHandles([root]);
const elapsedMs = Number((performance.now() - startedAt).toFixed(1));

assert.equal(files.length, fileCount);
assert.equal(files[0].relativePath, "Zero Hour/file-0000.bin");
assert.equal(files.at(-1).relativePath, "Zero Hour/file-0255.bin");
assert.ok(maxConcurrentReads > 1, JSON.stringify({ elapsedMs, maxConcurrentReads }));
assert.ok(maxConcurrentReads <= FILE_METADATA_READ_CONCURRENCY,
  JSON.stringify({ maxConcurrentReads, limit: FILE_METADATA_READ_CONCURRENCY }));

const nestedRoot = {
  kind: "directory",
  name: "Install",
  async queryPermission() { return "granted"; },
  async *entries() {
    yield ["first.bin", {
      kind: "file",
      async getFile() {
        await new Promise((resolve) => setTimeout(resolve, 12));
        return new File(["first"], "first.bin");
      },
    }];
    yield ["Data", {
      kind: "directory",
      async *entries() {
        yield ["nested-a.bin", {
          kind: "file",
          async getFile() { return new File(["a"], "nested-a.bin"); },
        }];
        yield ["nested-b.bin", {
          kind: "file",
          async getFile() { return new File(["b"], "nested-b.bin"); },
        }];
      },
    }];
    yield ["last.bin", {
      kind: "file",
      async getFile() { return new File(["last"], "last.bin"); },
    }];
  },
};
const nestedFiles = await filesFromHandles([nestedRoot]);
assert.deepEqual(nestedFiles.map((file) => file.relativePath), [
  "Install/first.bin",
  "Install/Data/nested-a.bin",
  "Install/Data/nested-b.bin",
  "Install/last.bin",
]);

let permissionRequests = 0;
const promptedFile = {
  kind: "file",
  name: "prompted.big",
  async queryPermission() { return "prompt"; },
  async requestPermission() { permissionRequests += 1; return "granted"; },
  async getFile() { return new File(["big"], "prompted.big"); },
};
const promptedFiles = await filesFromHandles([promptedFile], true);
assert.equal(permissionRequests, 1);
assert.equal(promptedFiles[0].relativePath, "prompted.big");
await assert.rejects(filesFromHandles([promptedFile]), /Permission is required/);

let failedReadCalls = 0;
const failedEntries = Array.from({ length: 64 }, (_, index) => [`failure-${index}.bin`, {
  kind: "file",
  async getFile() {
    failedReadCalls += 1;
    if (index === 0) throw new Error("metadata read failed");
    await new Promise((resolve) => setTimeout(resolve, 4));
    return new File([String(index)], `failure-${index}.bin`);
  },
}]);
const failedRoot = {
  kind: "directory",
  name: "Failed",
  async queryPermission() { return "granted"; },
  async *entries() { for (const entry of failedEntries) yield entry; },
};
await assert.rejects(filesFromHandles([failedRoot]), /metadata read failed/);
await new Promise((resolve) => setTimeout(resolve, 10));
assert.ok(failedReadCalls <= FILE_METADATA_READ_CONCURRENCY,
  JSON.stringify({ failedReadCalls, limit: FILE_METADATA_READ_CONCURRENCY }));

console.log(JSON.stringify({
  ok: true,
  path: "launcher-file-collector",
  fileCount,
  delayMs,
  elapsedMs,
  maxConcurrentReads,
  concurrencyLimit: FILE_METADATA_READ_CONCURRENCY,
  stableDepthFirstOrder: true,
  permissionFlowPreserved: true,
  stopsAfterReadFailure: true,
}));
