#!/usr/bin/env node

import assert from "node:assert/strict";
import { createD3D8Executor } from "./d3d8_executor.mjs";

const D3DFMT_DXT1 = 0x31545844;

function createFakeGl() {
  let activeTexture = 0x84c0;
  let boundTexture = null;
  let nextTextureId = 0;
  const uploads = [];
  const gl = {
    ACTIVE_TEXTURE: 0x84e0,
    TEXTURE0: 0x84c0,
    TEXTURE_2D: 0x0de1,
    TEXTURE_BINDING_2D: 0x8069,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812f,
    RGBA8: 0x8058,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    UNPACK_ALIGNMENT: 0x0cf5,
    getExtension() { return null; },
    getContextAttributes() { return { stencil: true }; },
    createTexture() {
      nextTextureId += 1;
      return { id: nextTextureId };
    },
    deleteTexture() {},
    activeTexture(value) { activeTexture = value; },
    getParameter(parameter) {
      if (parameter === gl.ACTIVE_TEXTURE) return activeTexture;
      if (parameter === gl.TEXTURE_BINDING_2D) return boundTexture;
      throw new Error(`unexpected getParameter(${parameter})`);
    },
    bindTexture(target, texture) {
      assert.equal(target, gl.TEXTURE_2D);
      boundTexture = texture;
    },
    texParameteri() {},
    pixelStorei() {},
    texImage2D(target, level, internalFormat, width, height, border, format, type, bytes) {
      uploads.push({ target, level, internalFormat, width, height, border, format, type, bytes });
    },
    texSubImage2D() {
      throw new Error("the first upload should allocate level-zero storage");
    },
  };
  return { gl, uploads };
}

const { gl, uploads } = createFakeGl();
const { hooks, diag } = createD3D8Executor({
  canvas: {
    width: 4,
    height: 4,
    addEventListener() {},
  },
  gl,
  s3tc: null,
  fallbackContext: null,
  log() {},
  state: { canvas: {}, graphics: {} },
});

assert.equal(globalThis.__cncSetDiagLevel("lite"), "lite");
assert.equal(diag.s3tc(), null);
assert.equal(hooks.cncPortD3D8TextureCreate({
  id: 7,
  width: 4,
  height: 4,
  levels: 1,
  format: D3DFMT_DXT1,
  pool: 1,
}), 1);

// RGB565 red and green endpoints, with every selector choosing red.
const redDxt1Block = new Uint8Array([
  0x00, 0xf8,
  0xe0, 0x07,
  0x00, 0x00, 0x00, 0x00,
]);
assert.equal(hooks.cncPortD3D8TextureUpdate({
  id: 7,
  level: 0,
  x: 0,
  y: 0,
  width: 4,
  height: 4,
  format: D3DFMT_DXT1,
  bytes: redDxt1Block,
}), 1);

assert.equal(uploads.length, 1);
assert.equal(uploads[0].internalFormat, gl.RGBA8);
assert.equal(uploads[0].format, gl.RGBA);
assert.equal(uploads[0].type, gl.UNSIGNED_BYTE);
assert.equal(uploads[0].bytes.length, 4 * 4 * 4);
for (let offset = 0; offset < uploads[0].bytes.length; offset += 4) {
  assert.deepEqual(Array.from(uploads[0].bytes.subarray(offset, offset + 4)), [255, 0, 0, 255]);
}

const resource = diag.d3d8Textures.get(7);
assert.equal(resource.storage, "rgba8");
assert.equal(resource.initializedLevels.has("0"), true);

console.log("d3d8 DXT1 CPU fallback unit: ok");
