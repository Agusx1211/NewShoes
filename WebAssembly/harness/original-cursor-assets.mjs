export const ORIGINAL_CURSOR_PACK_NAME = "OriginalCursors.big";
export const ORIGINAL_CURSOR_MANIFEST_SCHEMA = "cnc.original-ani-cursors.v1";
export const ORIGINAL_CURSOR_TIMING_UNIT_HZ = 60;

const textDecoder = new TextDecoder("windows-1252");

function ascii(bytes, offset, length) {
  return textDecoder.decode(bytes.subarray(offset, offset + length));
}

function u32le(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(offset, true);
}

function u32be(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(offset, false);
}

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Cursor assets must be supplied as binary data");
}

function riffChunks(bytes, start, end) {
  const chunks = [];
  let offset = start;
  while (offset + 8 <= end) {
    const id = ascii(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > end) throw new Error(`RIFF chunk ${id} extends past its container`);
    chunks.push({ id, dataStart, dataEnd });
    offset = dataEnd + (size & 1);
  }
  return chunks;
}

export function parseAniCursor(value, sourceFile = "cursor.ani") {
  const bytes = bytesOf(value);
  if (bytes.byteLength < 12
      || ascii(bytes, 0, 4) !== "RIFF"
      || ascii(bytes, 8, 4) !== "ACON") {
    throw new Error(`${sourceFile} is not a RIFF ACON animated cursor`);
  }

  const riffEnd = Math.min(bytes.byteLength, 8 + u32le(bytes, 4));
  let header = null;
  let rates = null;
  let sequence = null;
  const frames = [];

  for (const chunk of riffChunks(bytes, 12, riffEnd)) {
    if (chunk.id === "anih") {
      if (chunk.dataEnd - chunk.dataStart < 36) {
        throw new Error(`${sourceFile} has a truncated anih chunk`);
      }
      header = {
        stepCount: u32le(bytes, chunk.dataStart + 8),
        width: u32le(bytes, chunk.dataStart + 12),
        height: u32le(bytes, chunk.dataStart + 16),
        defaultRate: u32le(bytes, chunk.dataStart + 28),
      };
    } else if (chunk.id === "rate") {
      rates = [];
      for (let offset = chunk.dataStart; offset + 4 <= chunk.dataEnd; offset += 4) {
        rates.push(u32le(bytes, offset));
      }
    } else if (chunk.id === "seq ") {
      sequence = [];
      for (let offset = chunk.dataStart; offset + 4 <= chunk.dataEnd; offset += 4) {
        sequence.push(u32le(bytes, offset));
      }
    } else if (chunk.id === "LIST"
        && ascii(bytes, chunk.dataStart, 4) === "fram") {
      for (const frameChunk of riffChunks(bytes, chunk.dataStart + 4, chunk.dataEnd)) {
        if (frameChunk.id === "icon") {
          frames.push(bytes.slice(frameChunk.dataStart, frameChunk.dataEnd));
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

export function parseBigEntries(value, label = ORIGINAL_CURSOR_PACK_NAME) {
  const bytes = bytesOf(value);
  if (bytes.byteLength < 16 || ascii(bytes, 0, 4) !== "BIGF") {
    throw new Error(`${label} is not a BIGF archive`);
  }
  const archiveSize = u32le(bytes, 4);
  const entryCount = u32be(bytes, 8);
  if (archiveSize !== bytes.byteLength || entryCount > 4096) {
    throw new Error(`${label} has an invalid BIGF header`);
  }

  const entries = new Map();
  let cursor = 16;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 9 > bytes.byteLength) throw new Error(`${label} has a truncated directory`);
    const offset = u32be(bytes, cursor);
    const size = u32be(bytes, cursor + 4);
    let pathEnd = cursor + 8;
    while (pathEnd < bytes.byteLength && bytes[pathEnd] !== 0) pathEnd += 1;
    if (pathEnd >= bytes.byteLength || pathEnd === cursor + 8
        || offset > archiveSize || size > archiveSize - offset) {
      throw new Error(`${label} has an invalid directory entry`);
    }
    const path = ascii(bytes, cursor + 8, pathEnd - cursor - 8);
    const key = path.replaceAll("\\", "/").toLowerCase();
    if (entries.has(key)) throw new Error(`${label} contains duplicate entry ${path}`);
    entries.set(key, { path, bytes: bytes.slice(offset, offset + size) });
    cursor = pathEnd + 1;
  }
  return entries;
}

export function createOriginalCursorManifest(value, {
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  BlobType = Blob,
} = {}) {
  const entries = parseBigEntries(value);
  const cursors = {};
  const urls = [];
  const aniEntries = [...entries.values()]
    .filter((entry) => entry.path.toLowerCase().endsWith(".ani"))
    .sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }));

  try {
    for (const entry of aniEntries) {
      const sourceFile = entry.path.replaceAll("\\", "/").split("/").pop();
      const key = sourceFile.replace(/\.ani$/i, "").toLowerCase();
      if (cursors[key]) throw new Error(`duplicate cursor name after case folding: ${sourceFile}`);
      const parsed = parseAniCursor(entry.bytes, sourceFile);
      const frames = parsed.frames.map((frame) => {
        if (frame.byteLength < 6 || frame[0] !== 0 || frame[1] !== 0
            || frame[2] !== 2 || frame[3] !== 0) {
          throw new Error(`${sourceFile} contains a frame that is not a CUR image`);
        }
        const url = createObjectURL(new BlobType([frame], { type: "image/x-icon" }));
        urls.push(url);
        return url;
      });
      cursors[key] = {
        sourceFile,
        width: parsed.header.width,
        height: parsed.header.height,
        frames,
        sequence: parsed.sequence,
        rates: parsed.rates,
      };
    }

    if (!cursors.sccpointer || !cursors.sccattack) {
      throw new Error("Original cursor pack is missing SCCPointer or SCCAttack");
    }
  } catch (error) {
    urls.forEach((url) => revokeObjectURL(url));
    throw error;
  }

  let disposed = false;
  return {
    manifest: {
      schema: ORIGINAL_CURSOR_MANIFEST_SCHEMA,
      timingUnitHz: ORIGINAL_CURSOR_TIMING_UNIT_HZ,
      source: "browser_library_cursor_pack",
      cursors,
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      urls.forEach((url) => revokeObjectURL(url));
    },
  };
}
