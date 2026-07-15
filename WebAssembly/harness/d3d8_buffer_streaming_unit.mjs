#!/usr/bin/env node

import assert from "node:assert/strict";
import { createD3D8Executor } from "./d3d8_executor.mjs";

const D3DUSAGE_WRITEONLY = 0x8;
const D3DUSAGE_DYNAMIC = 0x200;
const D3DLOCK_NOOVERWRITE = 0x1000;
const D3DLOCK_DISCARD = 0x2000;

function createFakeGl() {
  let nextBufferId = 0;
  let nextSyncId = 0;
  const bindings = new Map();
  const calls = {
    bufferData: [],
    bufferSubData: [],
    deletedBuffers: [],
    deletedVertexArrays: [],
    fences: [],
    flushes: 0,
  };
  const gl = {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STREAM_DRAW: 0x88e0,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    createBuffer() {
      nextBufferId += 1;
      return { id: nextBufferId };
    },
    bindBuffer(target, buffer) {
      bindings.set(target, buffer);
    },
    bufferData(target, dataOrSize, usage) {
      calls.bufferData.push({
        target,
        buffer: bindings.get(target),
        byteLength: typeof dataOrSize === "number" ? dataOrSize : dataOrSize.byteLength,
        directUpload: typeof dataOrSize !== "number",
        usage,
      });
    },
    bufferSubData(target, byteOffset, bytes) {
      calls.bufferSubData.push({
        target,
        buffer: bindings.get(target),
        byteOffset,
        byteLength: bytes.byteLength,
      });
    },
    deleteBuffer(buffer) {
      calls.deletedBuffers.push(buffer);
    },
    fenceSync() {
      nextSyncId += 1;
      const sync = { id: nextSyncId, status: gl.TIMEOUT_EXPIRED };
      calls.fences.push(sync);
      return sync;
    },
    clientWaitSync(sync) {
      return sync.status;
    },
    deleteSync() {},
    flush() { calls.flushes += 1; },
    bindVertexArray() {},
    deleteVertexArray(vertexArray) { calls.deletedVertexArrays.push(vertexArray); },
    getExtension() { return null; },
    getContextAttributes() { return { stencil: true }; },
  };
  return { gl, calls };
}

const { gl, calls } = createFakeGl();
const { hooks, diag } = createD3D8Executor({
  canvas: {
    width: 1,
    height: 1,
    addEventListener() {},
  },
  gl,
  fallbackContext: null,
  log() {},
  state: { canvas: {}, graphics: {} },
});

function vertexArrayKey(vertexBufferId) {
  return {
    vertexBufferId,
    vertexByteOffset: 0,
    vertexStride: 16,
    positionAttrib: 0,
    normalAttrib: -1,
    diffuseAttrib: -1,
    specularAttrib: -1,
    texCoord0Attrib: -1,
    texCoord1Attrib: -1,
    positionComponents: 3,
    pretransformed: 0,
    normalOffset: -1,
    diffuseOffset: -1,
    specularOffset: -1,
    canSampleTexture0: 0,
    texture0UsesVertexTexCoord: 0,
    texture0Offset: -1,
    canSampleTexture1: 0,
    texture1UsesVertexTexCoord: 0,
    texture1Offset: -1,
  };
}

assert.equal(hooks.cncPortD3D8BufferCreate({
  kind: 1,
  id: 1,
  byteSize: 16,
  usage: D3DUSAGE_WRITEONLY,
}), 1);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 1,
  byteOffset: 0,
  bytes: new Uint8Array(16).fill(1),
}), 1);
const staticResource = diag.d3d8Buffers.get("vertex:1");
const initialStaticBuffer = staticResource.buffer;
staticResource.gpuReferenced = true;
const subDataCallsBeforeRename = calls.bufferSubData.length;
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 1,
  byteOffset: 0,
  bytes: new Uint8Array(16).fill(2),
}), 1);
assert.notEqual(staticResource.buffer, initialStaticBuffer);
assert.notEqual(staticResource.bindingId, staticResource.id);
assert.equal(calls.bufferSubData.length, subDataCallsBeforeRename);
assert.deepEqual(calls.bufferData.at(-1), {
  target: gl.ARRAY_BUFFER,
  buffer: staticResource.buffer,
  byteLength: 16,
  directUpload: true,
  usage: gl.STATIC_DRAW,
});
assert.equal(calls.deletedBuffers.includes(initialStaticBuffer), true);

assert.equal(hooks.cncPortD3D8BufferCreate({
  kind: 1,
  id: 4,
  byteSize: 16,
  usage: D3DUSAGE_WRITEONLY,
}), 1);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 4,
  byteOffset: 0,
  bytes: new Uint8Array(16).fill(9),
}), 1);
const cachedResource = diag.d3d8Buffers.get("vertex:4");
const cachedVertexArray = { id: "renamed-buffer-vao" };
const unrelatedVertexArray = { id: "unrelated-vao" };
diag.rememberD3D8VertexArray(
  vertexArrayKey(cachedResource.bindingId),
  91,
  cachedVertexArray,
  { id: "index-91" },
);
diag.rememberD3D8VertexArray(
  vertexArrayKey(92),
  93,
  unrelatedVertexArray,
  { id: "index-93" },
);
cachedResource.gpuReferenced = true;
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 4,
  byteOffset: 0,
  bytes: new Uint8Array(16).fill(10),
}), 1);
assert.equal(calls.deletedVertexArrays.includes(cachedVertexArray), true);
assert.equal(calls.deletedVertexArrays.includes(unrelatedVertexArray), false);
assert.equal(diag.d3d8PerfSummary().vertexArrayCacheEntries, 1);

assert.equal(hooks.cncPortD3D8BufferCreate({
  kind: 1,
  id: 5,
  byteSize: 16,
  usage: D3DUSAGE_WRITEONLY,
}), 1);
const releasedVertexArray = { id: "released-vertex-buffer-vao" };
diag.rememberD3D8VertexArray(
  vertexArrayKey(5),
  94,
  releasedVertexArray,
  { id: "index-94" },
);
assert.equal(hooks.cncPortD3D8BufferRelease({ kind: 1, id: 5 }), 1);
assert.equal(calls.deletedVertexArrays.includes(releasedVertexArray), true);
assert.equal(calls.deletedVertexArrays.includes(unrelatedVertexArray), false);
assert.equal(diag.d3d8PerfSummary().vertexArrayCacheEntries, 1);

assert.equal(hooks.cncPortD3D8BufferCreate({
  kind: 2,
  id: 6,
  byteSize: 16,
  usage: D3DUSAGE_WRITEONLY,
}), 1);
const releasedIndexArray = { id: "released-index-buffer-vao" };
diag.rememberD3D8VertexArray(
  vertexArrayKey(95),
  6,
  releasedIndexArray,
  diag.d3d8Buffers.get("index:6").buffer,
);
assert.equal(hooks.cncPortD3D8BufferRelease({ kind: 2, id: 6 }), 1);
assert.equal(calls.deletedVertexArrays.includes(releasedIndexArray), true);
assert.equal(calls.deletedVertexArrays.includes(unrelatedVertexArray), false);
assert.equal(diag.d3d8PerfSummary().vertexArrayCacheEntries, 1);

assert.equal(hooks.cncPortD3D8BufferCreate({
  kind: 1,
  id: 2,
  byteSize: 32,
  usage: D3DUSAGE_DYNAMIC,
}), 1);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 2,
  byteOffset: 0,
  bytes: new Uint8Array(8).fill(3),
}), 1);
const plainDynamicResource = diag.d3d8Buffers.get("vertex:2");
const initialDynamicBuffer = plainDynamicResource.buffer;
plainDynamicResource.gpuReferenced = true;
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 2,
  byteOffset: 0,
  bytes: new Uint8Array(8).fill(4),
}), 1);
assert.notEqual(plainDynamicResource.buffer, initialDynamicBuffer);
assert.deepEqual(calls.bufferData.at(-1), {
  target: gl.ARRAY_BUFFER,
  buffer: plainDynamicResource.buffer,
  byteLength: 32,
  directUpload: false,
  usage: gl.STREAM_DRAW,
});
assert.deepEqual(calls.bufferSubData.at(-1), {
  target: gl.ARRAY_BUFFER,
  buffer: plainDynamicResource.buffer,
  byteOffset: 0,
  byteLength: 8,
});

assert.equal(hooks.cncPortD3D8BufferCreate({
  kind: 1,
  id: 3,
  byteSize: 32,
  usage: D3DUSAGE_DYNAMIC,
}), 1);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 3,
  byteOffset: 0,
  bytes: new Uint8Array(8).fill(5),
  lockFlags: D3DLOCK_DISCARD,
}), 1);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 3,
  byteOffset: 8,
  bytes: new Uint8Array(8).fill(6),
  lockFlags: D3DLOCK_NOOVERWRITE,
}), 1);
const ringResource = diag.d3d8Buffers.get("vertex:3");
assert.deepEqual(ringResource.dynRanges.map(({ start, end }) => ({ start, end })), [
  { start: 0, end: 16 },
]);
const firstRangeSlot = diag.ensureD3D8DynamicRangeUploaded(
  ringResource,
  ringResource.dynRanges[0],
);
assert.ok(firstRangeSlot);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 3,
  byteOffset: 16,
  bytes: new Uint8Array(8).fill(7),
  lockFlags: D3DLOCK_NOOVERWRITE,
}), 1);
assert.deepEqual(ringResource.dynRanges.map(({ start, end }) => ({ start, end })), [
  { start: 0, end: 16 },
  { start: 16, end: 24 },
]);
const sharedSlot = diag.ensureD3D8DynamicSharedBufferCurrent(ringResource);
assert.ok(sharedSlot);
assert.equal(diag.ensureD3D8DynamicSharedBufferCurrent(ringResource), sharedSlot);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 3,
  byteOffset: 24,
  bytes: new Uint8Array(8).fill(8),
  lockFlags: D3DLOCK_NOOVERWRITE,
}), 1);
assert.equal(ringResource.dynSharedSlot, null);

const directSlot = diag.acquireD3D8DynamicRangeSlot(gl.ARRAY_BUFFER);
diag.retireD3D8BufferSlots([directSlot]);
const whileBusySlot = diag.acquireD3D8DynamicRangeSlot(gl.ARRAY_BUFFER);
assert.notEqual(whileBusySlot, directSlot);
for (const sync of calls.fences) {
  sync.status = gl.ALREADY_SIGNALED;
}
diag.drainD3D8BufferRetirements();
const afterFenceSlot = diag.acquireD3D8DynamicRangeSlot(gl.ARRAY_BUFFER);
assert.ok([directSlot, firstRangeSlot, sharedSlot].includes(afterFenceSlot));
const flushesBeforeRetirementBatch = calls.flushes;
for (let index = 0; index < 64; index += 1) {
  const slot = diag.acquireD3D8DynamicRangeSlot(gl.ARRAY_BUFFER);
  diag.retireD3D8BufferSlots([slot]);
}
assert.equal(calls.flushes, flushesBeforeRetirementBatch + 2);

for (const sync of calls.fences) {
  sync.status = gl.ALREADY_SIGNALED;
}
diag.drainD3D8BufferRetirements();
const poolLimit = diag.d3d8PerfSummary().dynamicRangePoolLimitPerTarget;
const cappedSlots = [];
for (let index = 0; index < poolLimit + 2; index += 1) {
  cappedSlots.push(diag.acquireD3D8DynamicRangeSlot(gl.ARRAY_BUFFER));
}
const deletedBeforePoolTrim = calls.deletedBuffers.length;
diag.retireD3D8BufferSlots(cappedSlots);
calls.fences.at(-1).status = gl.ALREADY_SIGNALED;
diag.drainD3D8BufferRetirements();
const cappedSummary = diag.d3d8PerfSummary();
assert.equal(cappedSummary.dynamicRangePoolSlots, poolLimit);
assert.equal(cappedSummary.dynamicRangeSlotsDeleted, 2);
assert.equal(calls.deletedBuffers.length, deletedBeforePoolTrim + 2);

console.log(JSON.stringify({
  ok: true,
  source: "d3d8-buffer-streaming-unit",
  renamedStaticBuffer: staticResource.bindingId,
  renamedPlainDynamicBuffer: plainDynamicResource.bindingId,
  bufferDataCalls: calls.bufferData.length,
  bufferSubDataCalls: calls.bufferSubData.length,
  fenceCount: calls.fences.length,
  flushCount: calls.flushes,
  dynamicRangePoolLimit: poolLimit,
  trimmedDynamicRangeSlots: cappedSummary.dynamicRangeSlotsDeleted,
}));
