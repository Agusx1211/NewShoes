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
    copyBufferSubData: [],
    deletedBuffers: [],
    deletedVertexArrays: [],
    drawElements: [],
    fences: [],
    flushes: 0,
  };
  const gl = {
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    COPY_READ_BUFFER: 0x8f36,
    COPY_WRITE_BUFFER: 0x8f37,
    STREAM_DRAW: 0x88e0,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
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
    copyBufferSubData(readTarget, writeTarget, readOffset, writeOffset, byteLength) {
      calls.copyBufferSubData.push({
        readBuffer: bindings.get(readTarget),
        writeBuffer: bindings.get(writeTarget),
        readOffset,
        writeOffset,
        byteLength,
      });
    },
    deleteBuffer(buffer) {
      calls.deletedBuffers.push(buffer);
    },
    drawElements(primitive, count, type, offset) {
      calls.drawElements.push({ primitive, count, type, offset });
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
    getParameter(parameter) {
      return parameter === gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS ? 8 : 0;
    },
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

const terrainUvSource = new Float32Array([
  2, 7, 0, 0,
  3, 11, 0, 0,
  4, 13, 1, 0,
  5, 17, 0, 1,
]);
const terrainUvTarget = new Float32Array([
  0.25, 0.4375, 0, 0,
  0.375, 0.6875, 0, 0,
  0.5, 0.8125, 1, 0,
  0.925, 0.8625, 0, 1,
]);
const terrainUvScaleBias = diag.d3d8TerrainShroudUvScaleBias(
  terrainUvSource,
  terrainUvTarget,
);
assert.ok(terrainUvScaleBias);
assert.ok(Math.abs(terrainUvScaleBias[0] - 0.125) < 1e-6);
assert.ok(Math.abs(terrainUvScaleBias[1] - 0.0625) < 1e-6);
assert.ok(Math.abs(terrainUvScaleBias[2] - 0.3) < 1e-6);
assert.ok(Math.abs(terrainUvScaleBias[3] + 0.2) < 1e-6);
const nonAffineTerrainUvTarget = terrainUvTarget.slice();
nonAffineTerrainUvTarget[4] += 0.1;
assert.equal(
  diag.d3d8TerrainShroudUvScaleBias(terrainUvSource, nonAffineTerrainUvTarget),
  null,
);

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

for (const id of [101, 102]) {
  assert.equal(hooks.cncPortD3D8BufferCreate({
    kind: 1,
    id,
    byteSize: 128,
    usage: D3DUSAGE_WRITEONLY,
  }), 1);
  assert.equal(hooks.cncPortD3D8BufferUpdate({
    kind: 1,
    id,
    byteOffset: 0,
    bytes: new Uint8Array(128).fill(id),
  }), 1);
}
assert.equal(hooks.cncPortD3D8BufferCreate({
  kind: 2,
  id: 103,
  byteSize: 12,
  usage: D3DUSAGE_WRITEONLY,
}), 1);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 2,
  id: 103,
  byteOffset: 0,
  bytes: new Uint8Array(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer),
}), 1);
const repeatedBatch = {
  vertexResources: [
    diag.d3d8Buffers.get("vertex:101"),
    diag.d3d8Buffers.get("vertex:102"),
  ],
  indexResource: diag.d3d8Buffers.get("index:103"),
  vertexByteOffset: 0,
  vertexByteSize: 64,
  vertexCount: 4,
  vertexStride: 16,
  indexByteOffset: 0,
  unitIndexCount: 6,
  indexSize: 2,
};
const repeatedGeometry = diag.ensureD3D8RepeatedGeometry(repeatedBatch);
assert.ok(repeatedGeometry);
assert.equal(repeatedGeometry.indexCount, 12);
assert.equal(calls.copyBufferSubData.length, 2);
assert.equal(diag.ensureD3D8RepeatedGeometry(repeatedBatch), repeatedGeometry);
assert.equal(calls.copyBufferSubData.length, 2);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 101,
  byteOffset: 0,
  bytes: new Uint8Array(64).fill(42),
}), 1);
const refreshedRepeatedGeometry = diag.ensureD3D8RepeatedGeometry(repeatedBatch);
assert.ok(refreshedRepeatedGeometry);
assert.notEqual(refreshedRepeatedGeometry, repeatedGeometry);
assert.equal(calls.copyBufferSubData.length, 4);

const copyCallsBeforeMultiWorld = calls.copyBufferSubData.length;

const multiWorldBatch = {
  geometries: [
    {
      vertexResource: diag.d3d8Buffers.get("vertex:101"),
      vertexByteOffset: 0,
      vertexByteSize: 128,
      vertexCount: 4,
      vertexStride: 32,
      indexResource: diag.d3d8Buffers.get("index:103"),
      indexByteOffset: 0,
      indexCount: 6,
      indexSize: 2,
      baseVertexIndex: 0,
      minVertexIndex: 0,
    },
    {
      vertexResource: diag.d3d8Buffers.get("vertex:102"),
      vertexByteOffset: 0,
      vertexByteSize: 128,
      vertexCount: 4,
      vertexStride: 32,
      indexResource: diag.d3d8Buffers.get("index:103"),
      indexByteOffset: 0,
      indexCount: 6,
      indexSize: 2,
      baseVertexIndex: 0,
      minVertexIndex: 0,
    },
  ],
  worldTransforms: [
    new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      10, 20, 30, 1,
    ]),
  ],
};
assert.equal(diag.ensureD3D8MultiWorldGeometry(multiWorldBatch), null);
const multiWorldGeometry = diag.ensureD3D8MultiWorldGeometry(multiWorldBatch);
assert.ok(multiWorldGeometry);
assert.equal(multiWorldGeometry.indexCount, 12);
assert.equal(calls.copyBufferSubData.length, copyCallsBeforeMultiWorld);
assert.equal(diag.ensureD3D8MultiWorldGeometry(multiWorldBatch), multiWorldGeometry);
assert.equal(calls.copyBufferSubData.length, copyCallsBeforeMultiWorld);
multiWorldBatch.worldTransforms[1][12] = 11;
assert.equal(diag.ensureD3D8MultiWorldGeometry(multiWorldBatch), null);
const movedMultiWorldGeometry = diag.ensureD3D8MultiWorldGeometry(multiWorldBatch);
assert.ok(movedMultiWorldGeometry);
assert.notEqual(movedMultiWorldGeometry, multiWorldGeometry);
multiWorldBatch.worldTransforms[1][12] = 10;
assert.equal(diag.ensureD3D8MultiWorldGeometry(multiWorldBatch), multiWorldGeometry);
assert.equal(hooks.cncPortD3D8BufferUpdate({
  kind: 1,
  id: 102,
  byteOffset: 0,
  bytes: new Uint8Array(128).fill(24),
}), 1);
const refreshedMultiWorldGeometry = diag.ensureD3D8MultiWorldGeometry(multiWorldBatch);
assert.ok(refreshedMultiWorldGeometry);
assert.notEqual(refreshedMultiWorldGeometry, multiWorldGeometry);
assert.equal(calls.copyBufferSubData.length, copyCallsBeforeMultiWorld);

let flushedNativeRepeatedBatch = null;
globalThis.__cncSetDiagLevel("lite");
diag.queueD3D8PendingDrawBatch({
  stateHash: 11,
  derivedStateHash: 22,
  primitiveType: 4,
  vertexBufferId: 101,
  vertexResource: diag.d3d8Buffers.get("vertex:101"),
  indexBufferId: 103,
  indexResource: diag.d3d8Buffers.get("index:103"),
  vertexByteOffset: 0,
  vertexByteSize: 128,
  vertexCount: 4,
  vertexStride: 32,
  vertexShaderFvf: 0x112,
  baseVertexIndex: 0,
  minVertexIndex: 0,
  transformMask: 7,
  worldTransformRevision: 31,
  viewTransformRevision: 32,
  projectionTransformRevision: 33,
  pixelShaderHandle: 0,
  texture0Id: 0,
  texture1Id: 0,
  texture2Id: 0,
  texture3Id: 0,
  texture4Id: 0,
  glPrimitive: 4,
  indexType: 0x1403,
  indexSize: 2,
  indexByteOffset: 0,
  indexCount: 6,
  nextIndexByteOffset: 12,
  flushRepeatedGeometry(batch) {
    flushedNativeRepeatedBatch = batch;
    return 1;
  },
});
assert.equal(hooks.cncPortD3D8CanAppendRepeatedDraws(), true);
assert.equal(hooks.cncPortD3D8AppendRepeatedDraws(new Uint32Array([9999])), 0);
assert.equal(hooks.cncPortD3D8AppendRepeatedDraws(new Uint32Array([102])), 1);
diag.flushD3D8PendingDrawBatch("nativeRepeatedUnit");
assert.ok(flushedNativeRepeatedBatch);
assert.equal(flushedNativeRepeatedBatch.logicalDraws, 2);
assert.equal(flushedNativeRepeatedBatch.indexCount, 12);
assert.deepEqual(
  flushedNativeRepeatedBatch.vertexResources.map((resource) => resource.id),
  [101, 102],
);
globalThis.__cncSetDiagLevel("full");

diag.d3d8Textures.set(700, {
  width: 4,
  height: 4,
  depth: 1,
  levels: 1,
  format: 21,
  type: "2d",
  uploads: 1,
});
assert.equal(hooks.cncPortD3D8TextureBind({ stage: 0, id: 700 }), 1);
diag.queueD3D8PendingDrawBatch({
  glPrimitive: 4,
  indexCount: 6,
  indexType: 0x1403,
  indexByteOffset: 12,
});
const drawsBeforeRedundantTextureBind = calls.drawElements.length;
assert.equal(hooks.cncPortD3D8TextureBind({ stage: 0, id: 700 }), 1);
assert.equal(calls.drawElements.length, drawsBeforeRedundantTextureBind);
assert.equal(hooks.cncPortD3D8TextureBind({ stage: 0, id: 0 }), 1);
assert.deepEqual(calls.drawElements.at(-1), {
  primitive: 4,
  count: 6,
  type: 0x1403,
  offset: 12,
});
assert.equal(diag.d3d8PerfSummary().drawBatchFlushReasons.textureBind, 1);

console.log(JSON.stringify({
  ok: true,
  source: "d3d8-buffer-streaming-unit",
  renamedStaticBuffer: staticResource.bindingId,
  renamedPlainDynamicBuffer: plainDynamicResource.bindingId,
  bufferDataCalls: calls.bufferData.length,
  bufferSubDataCalls: calls.bufferSubData.length,
  copyBufferSubDataCalls: calls.copyBufferSubData.length,
  fenceCount: calls.fences.length,
  flushCount: calls.flushes,
  drawElements: calls.drawElements.length,
  dynamicRangePoolLimit: poolLimit,
  trimmedDynamicRangeSlots: cappedSummary.dynamicRangeSlotsDeleted,
}));
