// Convert the original Windows animated cursors into browser-consumable CUR
// frames plus a timing manifest. The source .ANI files remain user-supplied
// game assets; generated files live under gitignored artifacts/real-assets.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const sourceDir = resolve(process.argv[2] ?? "artifacts/real-assets/cursor-source");
const outputDir = resolve(process.argv[3] ?? "artifacts/real-assets/cursors");

function readChunks(buffer, start, end) {
  const chunks = [];
  let offset = start;
  while (offset + 8 <= end) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > end) {
      throw new Error(`RIFF chunk ${id} extends past its container`);
    }
    chunks.push({ id, dataStart, dataEnd });
    offset = dataEnd + (size & 1);
  }
  return chunks;
}

function parseAni(buffer, sourceFile) {
  if (buffer.length < 12
      || buffer.toString("ascii", 0, 4) !== "RIFF"
      || buffer.toString("ascii", 8, 12) !== "ACON") {
    throw new Error(`${sourceFile} is not a RIFF ACON animated cursor`);
  }

  const riffEnd = Math.min(buffer.length, 8 + buffer.readUInt32LE(4));
  let header = null;
  let rates = null;
  let sequence = null;
  const frames = [];

  for (const chunk of readChunks(buffer, 12, riffEnd)) {
    if (chunk.id === "anih") {
      if (chunk.dataEnd - chunk.dataStart < 36) {
        throw new Error(`${sourceFile} has a truncated anih chunk`);
      }
      header = {
        stepCount: buffer.readUInt32LE(chunk.dataStart + 8),
        width: buffer.readUInt32LE(chunk.dataStart + 12),
        height: buffer.readUInt32LE(chunk.dataStart + 16),
        defaultRate: buffer.readUInt32LE(chunk.dataStart + 28),
      };
    } else if (chunk.id === "rate") {
      rates = [];
      for (let offset = chunk.dataStart; offset + 4 <= chunk.dataEnd; offset += 4) {
        rates.push(buffer.readUInt32LE(offset));
      }
    } else if (chunk.id === "seq ") {
      sequence = [];
      for (let offset = chunk.dataStart; offset + 4 <= chunk.dataEnd; offset += 4) {
        sequence.push(buffer.readUInt32LE(offset));
      }
    } else if (chunk.id === "LIST"
        && buffer.toString("ascii", chunk.dataStart, chunk.dataStart + 4) === "fram") {
      for (const frameChunk of readChunks(buffer, chunk.dataStart + 4, chunk.dataEnd)) {
        if (frameChunk.id === "icon") {
          frames.push(Buffer.from(buffer.subarray(frameChunk.dataStart, frameChunk.dataEnd)));
        }
      }
    }
  }

  if (!header || frames.length === 0) {
    throw new Error(`${sourceFile} has no ANI header or embedded cursor frames`);
  }
  const stepCount = header.stepCount || sequence?.length || frames.length;
  const resolvedSequence = Array.from({ length: stepCount }, (_unused, index) =>
    sequence?.[index] ?? (index % frames.length));
  if (resolvedSequence.some((frameIndex) => frameIndex >= frames.length)) {
    throw new Error(`${sourceFile} references a cursor frame outside its frame list`);
  }
  const defaultRate = Math.max(1, header.defaultRate || 1);
  const resolvedRates = Array.from({ length: stepCount }, (_unused, index) =>
    Math.max(1, rates?.[index] || defaultRate));
  return { header, frames, sequence: resolvedSequence, rates: resolvedRates };
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const cursors = {};
const sourceFiles = (await readdir(sourceDir))
  .filter((name) => name.toLowerCase().endsWith(".ani"))
  .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

for (const sourceFile of sourceFiles) {
  const key = basename(sourceFile, extname(sourceFile)).toLowerCase();
  if (cursors[key]) {
    throw new Error(`duplicate cursor name after case folding: ${sourceFile}`);
  }
  const parsed = parseAni(await readFile(join(sourceDir, sourceFile)), sourceFile);
  const cursorDir = join(outputDir, key);
  await mkdir(cursorDir, { recursive: true });
  const frameFiles = [];
  for (let index = 0; index < parsed.frames.length; index += 1) {
    const frameFile = `frame-${String(index).padStart(3, "0")}.cur`;
    const frame = parsed.frames[index];
    if (frame.length < 6 || frame.readUInt16LE(0) !== 0 || frame.readUInt16LE(2) !== 2) {
      throw new Error(`${sourceFile} frame ${index} is not an embedded CUR image`);
    }
    await writeFile(join(cursorDir, frameFile), frame);
    frameFiles.push(`${key}/${frameFile}`);
  }
  cursors[key] = {
    sourceFile,
    width: parsed.header.width,
    height: parsed.header.height,
    frames: frameFiles,
    sequence: parsed.sequence,
    rates: parsed.rates,
  };
}

if (Object.keys(cursors).length === 0) {
  throw new Error(`no .ANI cursor files found in ${sourceDir}`);
}

const manifest = {
  schema: "cnc.original-ani-cursors.v1",
  timingUnitHz: 60,
  cursors,
};
await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${Object.keys(cursors).length} original animated cursors extracted\n`);
