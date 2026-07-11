#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CHUNK,
  readBigDirectory,
  scanBigForMaterialPass,
  scanW3DFile,
} from "./scan_w3d_material_pass.mjs";

function chunk(id, content = Buffer.alloc(0), { container = false } = {}) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(id, 0);
  header.writeUInt32LE((container ? 0x80000000 : 0) + content.length, 4);
  return Buffer.concat([header, content]);
}

function meshHeader3({ vertices, triangles }) {
  const header = Buffer.alloc(64);
  header.writeUInt32LE(vertices, 40);
  header.writeUInt32LE(triangles, 44);
  return chunk(CHUNK.MESH_HEADER3, header);
}

function materialInfo({ passes, vertexMaterials, shaders, textures }) {
  const info = Buffer.alloc(16);
  info.writeUInt32LE(passes, 0);
  info.writeUInt32LE(vertexMaterials, 4);
  info.writeUInt32LE(shaders, 8);
  info.writeUInt32LE(textures, 12);
  return chunk(CHUNK.MATERIAL_INFO, info);
}

function syntheticW3D() {
  const textures = chunk(
    CHUNK.TEXTURES,
    Buffer.concat([
      chunk(CHUNK.TEXTURE, chunk(CHUNK.TEXTURE_NAME, Buffer.from("first.tga\0", "ascii")), { container: true }),
      chunk(CHUNK.TEXTURE, chunk(CHUNK.TEXTURE_NAME, Buffer.from("second.tga\0", "ascii")), { container: true }),
    ]),
    { container: true },
  );

  const textureStage0 = chunk(
    CHUNK.TEXTURE_STAGE,
    Buffer.concat([
      chunk(CHUNK.TEXTURE_IDS, Buffer.from([1, 0, 0, 0])),
      chunk(CHUNK.STAGE_TEXCOORDS, Buffer.from([2, 0, 0, 0])),
    ]),
    { container: true },
  );
  const textureStage1 = chunk(
    CHUNK.TEXTURE_STAGE,
    Buffer.concat([
      chunk(CHUNK.TEXTURE_IDS, Buffer.from([3, 0, 0, 0])),
      chunk(CHUNK.PER_FACE_TEXCOORD_IDS, Buffer.from([4, 0, 0, 0])),
    ]),
    { container: true },
  );

  const pass = chunk(
    CHUNK.MATERIAL_PASS,
    Buffer.concat([
      chunk(CHUNK.VERTEX_MATERIAL_IDS, Buffer.from([0, 0, 0, 0])),
      chunk(CHUNK.SHADER_IDS, Buffer.from([0, 0, 0, 0])),
      chunk(CHUNK.DCG, Buffer.from([0, 0, 0, 0])),
      chunk(CHUNK.DIG, Buffer.from([0, 0, 0, 0])),
      chunk(CHUNK.SCG, Buffer.from([0, 0, 0, 0])),
      textureStage0,
      textureStage1,
    ]),
    { container: true },
  );

  return Buffer.concat([
    meshHeader3({ vertices: 11, triangles: 7 }),
    materialInfo({ passes: 1, vertexMaterials: 2, shaders: 3, textures: 4 }),
    textures,
    pass,
  ]);
}

function syntheticBig(path, payload) {
  const encodedPath = Buffer.from(path, "utf8");
  const directoryBytes = 8 + encodedPath.length + 1;
  const fileOffset = 0x10 + directoryBytes;
  const totalBytes = fileOffset + payload.length;
  const big = Buffer.alloc(totalBytes);

  big.write("BIGF", 0, "ascii");
  big.writeUInt32LE(totalBytes, 4);
  big.writeUInt32BE(1, 8);
  big.writeUInt32BE(0, 12);
  big.writeUInt32BE(fileOffset, 0x10);
  big.writeUInt32BE(payload.length, 0x14);
  encodedPath.copy(big, 0x18);
  big[0x18 + encodedPath.length] = 0;
  payload.copy(big, fileOffset);

  return big;
}

const w3d = syntheticW3D();
const scan = scanW3DFile(w3d, "art/w3d/synthetic.w3d");

assert.equal(scan.hasMeshHeader3, true);
assert.equal(scan.meshHeader3Count, 1);
assert.equal(scan.vertexCount, 11);
assert.equal(scan.triangleCount, 7);
assert.equal(scan.materialPassCount, 1);
assert.equal(scan.materialInfoChunks, 1);
assert.equal(scan.materialInfoPassCount, 1);
assert.equal(scan.materialCount, 2);
assert.equal(scan.shaderCount, 3);
assert.equal(scan.textureCount, 4);
assert.equal(scan.textureDefinitionChunks, 2);
assert.equal(scan.vertexMaterialIdsChunks, 1);
assert.equal(scan.shaderIdsChunks, 1);
assert.equal(scan.textureStageChunks, 2);
assert.equal(scan.textureIdsChunks, 2);
assert.equal(scan.stageTexcoordsChunks, 1);
assert.equal(scan.perFaceTexcoordIdsChunks, 1);
assert.equal(scan.dcgChunks, 1);
assert.equal(scan.digChunks, 1);
assert.equal(scan.scgChunks, 1);
assert.equal(scan.malformedChunks, 0);

const big = syntheticBig("Art/W3D/Synthetic.W3D", w3d);
const directory = readBigDirectory(big, "synthetic.big");
assert.equal(directory.numFiles, 1);
assert.equal(directory.entries[0].path, "Art/W3D/Synthetic.W3D");
assert.equal(directory.entries[0].size, w3d.length);

const tempDir = mkdtempSync(join(tmpdir(), "cnc-w3d-scan-"));
try {
  const bigPath = join(tempDir, "synthetic.big");
  writeFileSync(bigPath, big);
  const results = scanBigForMaterialPass(bigPath, { topN: 1, log: () => {} });
  assert.equal(results.length, 1);
  assert.equal(results[0].name, "Art/W3D/Synthetic.W3D");
  assert.equal(results[0].materialPassCount, 1);
  assert.equal(results[0].textureStageChunks, 2);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, scanned: scan.name }));
