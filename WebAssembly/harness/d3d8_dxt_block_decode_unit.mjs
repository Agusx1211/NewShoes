#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";
import { createD3D8Executor } from "./d3d8_executor.mjs";

const D3DFMT_DXT1 = 0x31545844;
const D3DFMT_DXT3 = 0x33545844;
const D3DFMT_DXT5 = 0x35545844;

function createFakeGl() {
  let activeTexture = 0x84c0;
  let boundTexture = null;
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
    createTexture() { return {}; },
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

function decodeThroughNoS3tcUpload(format, bytes) {
  const { gl, uploads } = createFakeGl();
  const { hooks } = createD3D8Executor({
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

  assert.equal(hooks.cncPortD3D8TextureCreate({
    id: 1,
    width: 4,
    height: 4,
    levels: 1,
    format,
    pool: 1,
  }), 1);
  assert.equal(hooks.cncPortD3D8TextureUpdate({
    id: 1,
    level: 0,
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    format,
    bytes,
  }), 1);

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].internalFormat, gl.RGBA8);
  assert.equal(uploads[0].format, gl.RGBA);
  assert.equal(uploads[0].type, gl.UNSIGNED_BYTE);
  return uploads[0].bytes;
}

function packDxt5AlphaSelectors(alpha0, alpha1, selectors) {
  assert.equal(selectors.length, 16);
  const bytes = new Uint8Array(8);
  bytes[0] = alpha0;
  bytes[1] = alpha1;
  for (let texel = 0; texel < selectors.length; ++texel) {
    const selector = selectors[texel];
    assert.ok(selector >= 0 && selector <= 7);
    for (let selectorBit = 0; selectorBit < 3; ++selectorBit) {
      if ((selector & (1 << selectorBit)) === 0) continue;
      const streamBit = texel * 3 + selectorBit;
      bytes[2 + Math.floor(streamBit / 8)] |= 1 << (streamBit % 8);
    }
  }
  return bytes;
}

test("DXT3 color blocks always use four-color interpolation", () => {
  const block = new Uint8Array([
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x00, 0x00,
    0xff, 0xff,
    0xff, 0xff, 0xff, 0xff,
  ]);
  const rgba = decodeThroughNoS3tcUpload(D3DFMT_DXT3, block);

  assert.equal(rgba.length, 4 * 4 * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    assert.deepEqual(Array.from(rgba.subarray(offset, offset + 4)), [170, 170, 170, 255]);
  }
});

test("DXT5 color blocks always use four-color interpolation", () => {
  const block = new Uint8Array([
    0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00,
    0xff, 0xff,
    0xff, 0xff, 0xff, 0xff,
  ]);
  const rgba = decodeThroughNoS3tcUpload(D3DFMT_DXT5, block);

  assert.equal(rgba.length, 4 * 4 * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    assert.deepEqual(Array.from(rgba.subarray(offset, offset + 4)), [170, 170, 170, 255]);
  }
});

test("DXT5 preserves all 48 bits of alpha selectors", () => {
  const selectors = [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7];
  const alphaBytes = packDxt5AlphaSelectors(255, 0, selectors);
  const block = new Uint8Array([
    ...alphaBytes,
    0x00, 0xf8,
    0xe0, 0x07,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const rgba = decodeThroughNoS3tcUpload(D3DFMT_DXT5, block);
  const expectedAlpha = [255, 0, 219, 182, 146, 109, 73, 36];

  assert.equal(rgba.length, 4 * 4 * 4);
  for (let texel = 0; texel < selectors.length; ++texel) {
    const offset = texel * 4;
    assert.deepEqual(
      Array.from(rgba.subarray(offset, offset + 4)),
      [255, 0, 0, expectedAlpha[selectors[texel]]],
    );
  }
});

test("DXT1 retains three-color transparent mode", () => {
  const block = new Uint8Array([
    0x00, 0x00,
    0xff, 0xff,
    0xff, 0xff, 0xff, 0xff,
  ]);
  const rgba = decodeThroughNoS3tcUpload(D3DFMT_DXT1, block);

  assert.equal(rgba.length, 4 * 4 * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    assert.deepEqual(Array.from(rgba.subarray(offset, offset + 4)), [0, 0, 0, 0]);
  }
});
