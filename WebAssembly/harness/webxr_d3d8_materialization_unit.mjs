#!/usr/bin/env node
import assert from "node:assert/strict";
import { createD3D8Executor } from "./d3d8_executor.mjs";

const memory = new ArrayBuffer(64 * 1024);
const heapU8 = new Uint8Array(memory);
const heapU16 = new Uint16Array(memory);
const heapU32 = new Uint32Array(memory);
const heapF32 = new Float32Array(memory);
const heapF64 = new Float64Array(memory);

const gl = {
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
  getExtension() { return null; },
  getParameter(parameter) {
    return parameter === this.MAX_COMBINED_TEXTURE_IMAGE_UNITS ? 8 : 0;
  },
  getContextAttributes() { return { stencil: true }; },
};

const { diag } = createD3D8Executor({
  canvas: { width: 1, height: 1, addEventListener() {} },
  gl,
  fallbackContext: null,
  log() {},
  state: { canvas: {}, graphics: {} },
  getHeapU8: () => heapU8,
  getHeapU16: () => heapU16,
  getHeapU32: () => heapU32,
  getHeapF32: () => heapF32,
  getHeapF64: () => heapF64,
});

const identity = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];
const viewPrefix = [
  0.3048, 0, 0, 0,
  0, 0.3048, 0, 0,
  0, 0, -0.3048, 0,
  0.032, 0, 0, 1,
];
diag.setD3D8XrViewOverride({
  viewPrefix,
  projection: identity,
  viewport: { x: 0, y: 0, width: 800, height: 900 },
  targetWidth: 1600,
  targetHeight: 900,
});
assert.deepEqual(
  Array.from(diag.computeD3D8XrClipTransform(identity, identity)),
  viewPrefix.map(Math.fround),
  "programmable vertex output must receive the same WebXR eye transform as fixed-function draws",
);
diag.setD3D8XrViewOverride(null);

const pointers = {
  renderState: 1024,
  clipPlanes: 4096,
  lights: 4608,
  material: 8192,
  world: 8448,
  view: 8704,
  projection: 8960,
  texture0: 9216,
  psConstants: 9472,
  vsConstants: 9728,
};

function writeMatrix(pointer, seed) {
  const offset = pointer >>> 2;
  for (let index = 0; index < 16; index += 1) {
    heapF32[offset + index] = seed + index;
  }
}

const renderStateOffset = pointers.renderState >>> 2;
for (let index = 0; index < 50 + 8 * 29; index += 1) {
  heapU32[renderStateOffset + index] = index + 1;
}
const clipOffset = pointers.clipPlanes >>> 2;
for (let index = 0; index < 24; index += 1) heapF32[clipOffset + index] = 100 + index;
const lightOffset = pointers.lights >>> 2;
for (let index = 0; index < 8 * 27; index += 1) heapU32[lightOffset + index] = index + 200;
const materialOffset = pointers.material >>> 2;
for (let index = 0; index < 17; index += 1) heapF32[materialOffset + index] = 300 + index;
writeMatrix(pointers.world, 400);
writeMatrix(pointers.view, 500);
writeMatrix(pointers.projection, 600);
writeMatrix(pointers.texture0, 700);
const psOffset = pointers.psConstants >>> 2;
for (let index = 0; index < 8 * 4; index += 1) heapF32[psOffset + index] = 800 + index;
const vsOffset = pointers.vsConstants >>> 2;
for (let index = 0; index < 96 * 4; index += 1) heapF32[vsOffset + index] = 900 + index;

const treeShroud = { c32: [1, 2, 3, 4], c33: [5, 6, 7, 8] };
const materialized = diag.materializeD3D8DrawPayload({
  __reusedD3D8DrawPayload: true,
  statePayloadPointers: true,
  transformMask: 7,
  vertexShaderFvf: 0x80000001,
  pixelShaderHandle: 11,
  transforms: {
    world: pointers.world,
    view: pointers.view,
    projection: pointers.projection,
    texture0: pointers.texture0,
    texture1: 0,
    texture2: 0,
    texture3: 0,
  },
  renderStatePtr: pointers.renderState,
  clipPlanesPtr: pointers.clipPlanes,
  lightsPtr: pointers.lights,
  materialPtr: pointers.material,
  psConstantsPtr: pointers.psConstants,
  vsConstantsPtr: pointers.vsConstants,
  treeShroud,
});

assert.equal(materialized.__reusedD3D8DrawPayload, false);
assert.equal(materialized.statePayloadPointers, false);
assert.equal(materialized.statePayloadCanonical, true);
assert.deepEqual(materialized.transforms.world.slice(0, 3), [400, 401, 402]);
assert.deepEqual(materialized.transforms.view.slice(0, 3), [500, 501, 502]);
assert.deepEqual(materialized.transforms.projection.slice(0, 3), [600, 601, 602]);
assert.deepEqual(materialized.transforms.texture0.slice(0, 3), [700, 701, 702]);
assert.equal(materialized.transforms.texture1, null);
assert.equal(materialized.renderState.cullMode, 1);
assert.equal(materialized.renderState.textureStages.length, 8);
assert.deepEqual(materialized.clipPlanes[0], [100, 101, 102, 103]);
assert.equal(materialized.lights.length, 8);
assert.equal(materialized.material.power, 316);
assert.deepEqual(materialized.psConstants.slice(0, 3), [800, 801, 802]);
assert.deepEqual(materialized.vsConstants.slice(0, 3), [900, 901, 902]);
assert.deepEqual(materialized.treeShroud, treeShroud);

heapF32[pointers.world >>> 2] = -1;
heapU32[renderStateOffset] = 999;
heapF32[psOffset] = -2;
treeShroud.c32[0] = 999;
assert.equal(materialized.transforms.world[0], 400,
  "materialized transforms must not alias wasm memory");
assert.equal(materialized.renderState.cullMode, 1,
  "materialized render state must not alias wasm memory");
assert.equal(materialized.psConstants[0], 800,
  "materialized constants must not alias wasm memory");
assert.equal(materialized.treeShroud.c32[0], 1,
  "materialized tree-shroud constants must not alias reused JS state");

assert.throws(() => diag.materializeD3D8DrawPayload({
  statePayloadPointers: true,
  transformMask: 7,
  transforms: { world: 0, view: pointers.view, projection: pointers.projection },
  renderStatePtr: pointers.renderState,
  clipPlanesPtr: pointers.clipPlanes,
  lightsPtr: pointers.lights,
  materialPtr: pointers.material,
}), /missing pointer/);

console.log("WebXR D3D8 materialization unit: PASS");
