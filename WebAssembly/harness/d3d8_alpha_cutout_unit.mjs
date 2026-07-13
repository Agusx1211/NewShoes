#!/usr/bin/env node

import assert from "node:assert/strict";
import { createD3D8Executor } from "./d3d8_executor.mjs";

const D3DFMT_A8R8G8B8 = 21;
const D3DFMT_DXT1 = 0x31545844;
const D3DFMT_DXT5 = 0x35545844;

function makeDxt5Block(alphaSelectors) {
  assert.equal(alphaSelectors.length, 16);
  const block = new Uint8Array(16);
  block[0] = 255;
  block[1] = 0;
  let packed = 0;
  for (let texel = 0; texel < alphaSelectors.length; ++texel) {
    packed += alphaSelectors[texel] * (2 ** (texel * 3));
  }
  for (let byte = 0; byte < 6; ++byte) {
    block[2 + byte] = Math.floor(packed / (2 ** (byte * 8))) & 0xff;
  }
  return block;
}

function makeDxt1Block(colorSelectors) {
  assert.equal(colorSelectors.length, 16);
  const block = new Uint8Array(8);
  block[0] = 0;
  block[1] = 0;
  block[2] = 0xff;
  block[3] = 0xff;
  let packed = 0;
  for (let texel = 0; texel < colorSelectors.length; ++texel) {
    packed += colorSelectors[texel] * (2 ** (texel * 2));
  }
  for (let byte = 0; byte < 4; ++byte) {
    block[4 + byte] = Math.floor(packed / (2 ** (byte * 8))) & 0xff;
  }
  return block;
}

const { diag } = createD3D8Executor({
  canvas: {
    width: 1,
    height: 1,
    addEventListener() {},
    getContext() { return null; },
  },
  gl: null,
  fallbackContext: null,
  log() {},
  state: { canvas: {}, graphics: {} },
});

const mostlyOpaqueDxt5 = makeDxt5Block([
  1, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
]);
const mostlyTransparentDxt5 = makeDxt5Block([
  0, 1, 1, 1,
  1, 1, 1, 1,
  1, 1, 1, 1,
  1, 1, 1, 1,
]);
const dxt1Cutout = makeDxt1Block([
  3, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
]);

const mostlyOpaqueCoverage = diag.d3d8TextureAlphaCoverage(
  D3DFMT_DXT5, mostlyOpaqueDxt5, 4, 4);
const mostlyTransparentCoverage = diag.d3d8TextureAlphaCoverage(
  D3DFMT_DXT5, mostlyTransparentDxt5, 4, 4);
assert.deepEqual(mostlyOpaqueCoverage, {
  nonzeroTexels: 15,
  totalTexels: 16,
  nonzeroCoverage: 15 / 16,
});
assert.deepEqual(mostlyTransparentCoverage, {
  nonzeroTexels: 1,
  totalTexels: 16,
  nonzeroCoverage: 1 / 16,
});
assert.equal(
  diag.d3d8TextureAlphaCoverage(D3DFMT_DXT1, dxt1Cutout, 4, 4).nonzeroTexels,
  15,
);
assert.deepEqual(
  diag.d3d8TextureAlphaCoverage(
    D3DFMT_A8R8G8B8,
    new Uint8Array([
      1, 2, 3, 255,
      4, 5, 6, 0,
    ]),
    2,
    1,
  ),
  { nonzeroTexels: 1, totalTexels: 2, nonzeroCoverage: 0.5 },
);

const textureStage0 = {
  alphaOp: 4,
  alphaArg0: 1,
  alphaArg1: 2,
  alphaArg2: 0,
  resultArg: 1,
};
const renderState = {
  alphaTestEnable: 0,
  alphaBlendEnable: 0,
  zEnable: 1,
  zWriteEnable: 1,
  textureStages: [textureStage0, { alphaOp: 1 }],
};
const eligibleTexture = {
  format: D3DFMT_DXT5,
  alphaCoverage: mostlyOpaqueCoverage,
};
const ineligibleTexture = {
  format: D3DFMT_DXT5,
  alphaCoverage: mostlyTransparentCoverage,
};

assert.equal(diag.d3d8TextureSupportsImplicitAlphaCutout(eligibleTexture), true);
assert.equal(diag.d3d8TextureSupportsImplicitAlphaCutout(ineligibleTexture), false);
assert.equal(
  diag.d3d8ImplicitAlphaCutoutThreshold(
    renderState, true, eligibleTexture, false, null),
  1 / 255,
);
assert.equal(
  diag.d3d8ImplicitAlphaCutoutThreshold(
    renderState, true, ineligibleTexture, false, null),
  -1,
);
assert.equal(
  diag.d3d8ImplicitAlphaCutoutThreshold({
    ...renderState,
    textureStages: [textureStage0, {
      alphaOp: 4,
      alphaArg0: 0,
      alphaArg1: 1,
      alphaArg2: 2,
      resultArg: 1,
    }],
  }, true, eligibleTexture, true, ineligibleTexture),
  -1,
);
assert.equal(
  diag.d3d8ImplicitAlphaCutoutThreshold(
    { ...renderState, alphaTestEnable: 1 }, true, eligibleTexture, false, null),
  -1,
);
assert.equal(
  diag.d3d8ImplicitAlphaCutoutThreshold(
    { ...renderState, alphaBlendEnable: 1 }, true, eligibleTexture, false, null),
  -1,
);

console.log(JSON.stringify({
  ok: true,
  source: "d3d8-alpha-cutout-unit",
  mostlyOpaqueCoverage,
  mostlyTransparentCoverage,
}));
