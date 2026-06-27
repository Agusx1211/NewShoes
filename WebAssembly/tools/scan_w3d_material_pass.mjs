#!/usr/bin/env node
/**
 * Scan a W3DZH.big archive for .w3d files containing W3D_CHUNK_MATERIAL_PASS (0x38) chunks.
 * Reports which meshes use the modern material-pass install path vs legacy per-tri materials.
 *
 * Usage: node tools/scan_w3d_material_pass.mjs path/to/W3DZH.big [--top N]
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// W3D chunk IDs (from w3d_file.h)
export const CHUNK = {
  MESH_HEADER3:       0x1F,
  MATERIAL_PASS:      0x38,
  VERTEX_MATERIAL_IDS:0x39,
  SHADER_IDS:         0x3A,
  DCG:                0x3B,
  DIG:                0x3C,
  SCG:                0x3E,
  TEXTURE_STAGE:      0x48,
  TEXTURE_IDS:        0x49,
  STAGE_TEXCOORDS:    0x4A,
  PER_FACE_TEXCOORD_IDS: 0x4B,
  VERTEX_MATERIALS:   0x2A,
  SHADERS:            0x29,
  TEXTURES:           0x30,
  TEXTURE:            0x31,
  TEXTURE_NAME:       0x32,
  MATERIAL_INFO:      0x28,
};

function fail(message) {
  throw new Error(message);
}

export function readBigDirectory(data, bigPath = "<buffer>") {
  const magic = data.subarray(0, 4).toString("ascii");
  if (magic !== "BIGF") {
    fail(`Not a valid BIGF archive: ${bigPath}`);
  }

  const fileSize = data.readUInt32BE(4);
  const numFiles = data.readUInt32BE(8);
  let dirOffset = 0x10;
  const entries = [];

  for (let i = 0; i < numFiles; i++) {
    if (dirOffset + 8 > data.length) {
      fail(`BIGF directory ended while reading entry ${i} in ${bigPath}`);
    }

    const fileOffset = data.readUInt32BE(dirOffset);
    const fileSize2 = data.readUInt32BE(dirOffset + 4);
    let pathEnd = dirOffset + 8;
    while (pathEnd < data.length && data[pathEnd] !== 0) pathEnd++;
    if (pathEnd >= data.length) {
      fail(`BIGF directory entry ${i} has no terminating NUL in ${bigPath}`);
    }

    const fullPath = data.subarray(dirOffset + 8, pathEnd).toString("utf8");
    if (fileOffset + fileSize2 > data.length) {
      fail(`BIGF entry ${fullPath} extends past archive end in ${bigPath}`);
    }

    entries.push({ offset: fileOffset, size: fileSize2, path: fullPath });
    dirOffset = pathEnd + 1;
  }

  return { magic, fileSize, numFiles, entries };
}

export function scanBigForMaterialPass(bigPath, options = {}) {
  const topN = options.topN ?? 10;
  const log = options.log ?? console.log;
  const data = readFileSync(bigPath);
  const { numFiles, entries } = readBigDirectory(data, bigPath);

  log(`BIG file: ${bigPath}`);
  log(`Total files in archive: ${numFiles}`);

  const w3dEntries = entries.filter(e => e.path.toLowerCase().endsWith('.w3d'));
  log(`.w3d files found: ${w3dEntries.length}`);

  // Scan each W3D file for MATERIAL_PASS chunks
  const results = [];

  for (const entry of w3dEntries) {
    if (entry.size < 8) continue;

    const w3dData = data.subarray(entry.offset, entry.offset + entry.size);
    const analysis = scanW3DFile(w3dData, entry.path);
    results.push(analysis);
  }

  // Sort by material pass count descending
  results.sort((a, b) => {
    if (b.materialPassCount !== a.materialPassCount) return b.materialPassCount - a.materialPassCount;
    return a.name.localeCompare(b.name);
  });

  log(`\n=== Top ${topN} meshes by MATERIAL_PASS chunk count ===`);
  for (let i = 0; i < Math.min(topN, results.length); i++) {
    const r = results[i];
    if (r.materialPassCount > 0 || r.vertexCount > 0) {
      log(
        `#${i+1} ${r.name.padEnd(45)} passes=${String(r.materialPassCount).padStart(3)} ` +
        `meshes=${String(r.meshHeader3Count).padStart(2)} ` +
        `verts=${String(r.vertexCount).padStart(5)} tris=${String(r.triangleCount).padStart(6)} ` +
        `infoPasses=${String(r.materialInfoPassCount).padStart(2)} ` +
        `materials=${String(r.materialCount).padStart(2)} shaders=${String(r.shaderCount).padStart(3)} ` +
        `textures=${String(r.textureCount).padStart(3)} texDefs=${String(r.textureDefinitionChunks).padStart(3)}`
      );
    }
  }

  // Summary statistics
  const withMaterialPass = results.filter(r => r.materialPassCount > 0);
  const withoutMaterialPass = results.filter(r => r.materialPassCount === 0);
  const materialPassPercent = results.length > 0
    ? (withMaterialPass.length / results.length * 100).toFixed(1)
    : "0.0";
  const withoutMaterialPassPercent = results.length > 0
    ? (withoutMaterialPass.length / results.length * 100).toFixed(1)
    : "0.0";

  log(`\n=== Summary ===`);
  log(`Total .w3d files scanned: ${results.length}`);
  log(`Files with MATERIAL_PASS chunks: ${withMaterialPass.length} (${materialPassPercent}%)`);
  log(`Files without MATERIAL_PASS chunks: ${withoutMaterialPass.length} (${withoutMaterialPassPercent}%)`);

  if (withMaterialPass.length > 0) {
    log(`\n=== Best candidates for MATERIAL_PASS install path exercise ===`);
    const topCandidates = withMaterialPass.filter(r => r.materialPassCount >= 2).slice(0, 15);
    for (const r of topCandidates) {
      log(
        `  ${r.name.padEnd(45)} passes=${String(r.materialPassCount).padStart(3)} ` +
        `verts=${String(r.vertexCount).padStart(5)} tris=${String(r.triangleCount).padStart(6)} ` +
        `materials=${String(r.materialCount).padStart(2)} shaders=${String(r.shaderCount).padStart(3)}`
      );
    }
  }

  return results;
}

export function scanW3DFile(data, path = "<buffer>") {
  const result = {
    name: path,
    materialPassCount: 0,
    materialInfoChunks: 0,
    materialInfoPassCount: 0,
    vertexMaterialIdsChunks: 0,
    shaderIdsChunks: 0,
    textureStageChunks: 0,
    textureIdsChunks: 0,
    textureDefinitionChunks: 0,
    stageTexcoordsChunks: 0,
    dcgChunks: 0,
    digChunks: 0,
    scgChunks: 0,
    perFaceTexcoordIdsChunks: 0,
    vertexCount: 0,
    triangleCount: 0,
    meshHeader3Count: 0,
    materialCount: 0,
    shaderCount: 0,
    textureCount: 0,
    hasMeshHeader3: false,
    malformedChunks: 0,
  };

  scanChunkRange(data, 0, data.length, result);

  return result;
}

function scanChunkRange(data, start, end, result) {
  let offset = start;
  while (offset + 8 <= end) {
    const chunkId = data.readUInt32LE(offset);
    const rawSize = data.readUInt32LE(offset + 4);
    const isSubChunk = !!(rawSize & 0x80000000);
    const chunkSize = rawSize & 0x7FFFFFFF;
    const contentOffset = offset + 8;
    const contentEnd = contentOffset + chunkSize;

    if (contentEnd > end) {
      result.malformedChunks++;
      return;
    }

    if (isSubChunk && chunkSize > 0) {
      processChunk(chunkId, data, contentOffset, chunkSize, result);
      scanChunkRange(data, contentOffset, contentEnd, result);
    } else {
      processChunk(chunkId, data, contentOffset, chunkSize, result);
    }

    offset = contentEnd;
  }
}

function processChunk(chunkId, data, contentOffset, chunkSize, result) {
  if (chunkId === CHUNK.MESH_HEADER3 && chunkSize >= 64) {
    result.hasMeshHeader3 = true;
    result.meshHeader3Count++;
    const header = data.slice(contentOffset, contentOffset + Math.min(chunkSize, 64));
    result.vertexCount += header.readUInt32LE(40);
    result.triangleCount += header.readUInt32LE(44);
  }

  if (chunkId === CHUNK.MATERIAL_PASS) {
    result.materialPassCount++;
  }

  switch (chunkId) {
    case CHUNK.VERTEX_MATERIAL_IDS: result.vertexMaterialIdsChunks++; break;
    case CHUNK.SHADER_IDS: result.shaderIdsChunks++; break;
    case CHUNK.DCG: result.dcgChunks++; break;
    case CHUNK.DIG: result.digChunks++; break;
    case CHUNK.SCG: result.scgChunks++; break;
    case CHUNK.TEXTURE_STAGE: result.textureStageChunks++; break;
    case CHUNK.TEXTURE_IDS: result.textureIdsChunks++; break;
    case CHUNK.TEXTURE: result.textureDefinitionChunks++; break;
    case CHUNK.STAGE_TEXCOORDS: result.stageTexcoordsChunks++; break;
    case CHUNK.PER_FACE_TEXCOORD_IDS: result.perFaceTexcoordIdsChunks++; break;
  }

  if (chunkId === CHUNK.MATERIAL_INFO && chunkSize >= 16) {
    result.materialInfoChunks++;
    result.materialInfoPassCount += data.readUInt32LE(contentOffset);
    result.materialCount += data.readUInt32LE(contentOffset + 4);
    result.shaderCount += data.readUInt32LE(contentOffset + 8);
    result.textureCount += data.readUInt32LE(contentOffset + 12);
  } else if (chunkId === CHUNK.SHADERS && chunkSize >= 4 && result.materialInfoChunks === 0) {
    result.shaderCount = Math.floor(chunkSize / 16);
  }
}

function runCli(args) {
  if (args.length < 1 || !existsSync(args[0])) {
    console.error("usage: node scan_w3d_material_pass.mjs path/to/W3DZH.big [--top N]");
    process.exit(2);
  }

  const bigPath = resolve(args[0]);
  let topN = 10;
  const topIdx = args.indexOf("--top");
  if (topIdx >= 0 && topIdx + 1 < args.length) {
    topN = parseInt(args[topIdx + 1], 10);
  }

  try {
    scanBigForMaterialPass(bigPath, { topN });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli(process.argv.slice(2));
}
