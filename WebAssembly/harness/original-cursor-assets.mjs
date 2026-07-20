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

function u16le(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint16(offset, true);
}

function i32le(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getInt32(offset, true);
}

function checkedRange(bytes, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
      || offset < 0 || length < 0 || offset > bytes.byteLength - length) {
    throw new Error(`${label} is outside the CUR frame`);
  }
}

export function decodeCurFrame(value, sourceFile = "cursor.cur") {
  const bytes = bytesOf(value);
  if (bytes.byteLength < 22 || u16le(bytes, 0) !== 0
      || u16le(bytes, 2) !== 2 || u16le(bytes, 4) !== 1) {
    throw new Error(`${sourceFile} is not a single-image Windows CUR frame`);
  }

  const directoryWidth = bytes[6] || 256;
  const directoryHeight = bytes[7] || 256;
  const hotspot = [u16le(bytes, 10), u16le(bytes, 12)];
  const imageBytes = u32le(bytes, 14);
  const imageOffset = u32le(bytes, 18);
  checkedRange(bytes, imageOffset, imageBytes, `${sourceFile} image`);
  if (imageBytes < 40 || u32le(bytes, imageOffset) < 40) {
    throw new Error(`${sourceFile} does not contain a supported DIB cursor image`);
  }

  const dibWidth = i32le(bytes, imageOffset + 4);
  const storedHeight = i32le(bytes, imageOffset + 8);
  const planes = u16le(bytes, imageOffset + 12);
  const bitsPerPixel = u16le(bytes, imageOffset + 14);
  const compression = u32le(bytes, imageOffset + 16);
  const width = dibWidth;
  const height = storedHeight / 2;
  if (!Number.isInteger(height) || width !== directoryWidth || height !== directoryHeight
      || planes !== 1 || bitsPerPixel !== 4 || compression !== 0) {
    throw new Error(`${sourceFile} has an unsupported CUR bitmap layout`);
  }
  if (hotspot[0] >= width || hotspot[1] >= height) {
    throw new Error(`${sourceFile} has a hotspot outside its image`);
  }

  const headerBytes = u32le(bytes, imageOffset);
  const paletteEntries = u32le(bytes, imageOffset + 32) || 16;
  const paletteOffset = imageOffset + headerBytes;
  const xorOffset = paletteOffset + paletteEntries * 4;
  const xorStride = Math.ceil(width * 4 / 32) * 4;
  const andOffset = xorOffset + xorStride * height;
  const andStride = Math.ceil(width / 32) * 4;
  const imageEnd = imageOffset + imageBytes;
  if (paletteOffset < imageOffset || andOffset + andStride * height > imageEnd) {
    throw new Error(`${sourceFile} has cursor bitmap data outside its declared image`);
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const storedRow = height - 1 - y;
    const colorRow = xorOffset + storedRow * xorStride;
    const maskRow = andOffset + storedRow * andStride;
    for (let x = 0; x < width; x += 1) {
      const destination = (y * width + x) * 4;
      const masked = ((bytes[maskRow + Math.floor(x / 8)] >>> (7 - (x % 8))) & 1) !== 0;
      const packed = bytes[colorRow + Math.floor(x / 2)];
      const paletteIndex = x % 2 === 0 ? packed >>> 4 : packed & 0x0f;
      if (paletteIndex >= paletteEntries) {
        throw new Error(`${sourceFile} references a missing cursor palette entry`);
      }
      const color = paletteOffset + paletteIndex * 4;
      rgba[destination] = bytes[color + 2];
      rgba[destination + 1] = bytes[color + 1];
      rgba[destination + 2] = bytes[color];
      rgba[destination + 3] = masked ? 0 : 255;
    }
  }

  return { width, height, hotspot, rgba };
}

function u32beBytes(value) {
  return Uint8Array.from([
    value >>> 24, value >>> 16 & 0xff, value >>> 8 & 0xff, value & 0xff,
  ]);
}

function crc32(parts) {
  let crc = 0xffffffff;
  for (const bytes of parts) {
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  return concatBytes(
    u32beBytes(data.byteLength), typeBytes, data,
    u32beBytes(crc32([typeBytes, data])),
  );
}

function concatBytes(...parts) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function uncompressedZlib(bytes) {
  const blocks = [];
  for (let offset = 0; offset < bytes.byteLength;) {
    const length = Math.min(65535, bytes.byteLength - offset);
    const final = offset + length === bytes.byteLength ? 1 : 0;
    blocks.push(Uint8Array.from([
      final, length & 0xff, length >>> 8, (~length) & 0xff, ((~length) >>> 8) & 0xff,
    ]), bytes.subarray(offset, offset + length));
    offset += length;
  }
  let first = 1;
  let second = 0;
  for (const byte of bytes) {
    first = (first + byte) % 65521;
    second = (second + first) % 65521;
  }
  return concatBytes(Uint8Array.from([0x78, 0x01]), ...blocks,
    u32beBytes(((second << 16) | first) >>> 0));
}

export function encodeRgbaPng(width, height, rgba) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width <= 0 || height <= 0 || rgba.byteLength !== width * height * 4) {
    throw new Error("Invalid RGBA image dimensions");
  }
  const rows = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32beBytes(width), 0);
  ihdr.set(u32beBytes(height), 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return concatBytes(
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", uncompressedZlib(rows)),
    pngChunk("IEND"),
  );
}

export function convertCurFrameToPng(value, sourceFile = "cursor.cur") {
  const decoded = decodeCurFrame(value, sourceFile);
  return { ...decoded, png: encodeRgbaPng(decoded.width, decoded.height, decoded.rgba) };
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
      const convertedFrames = parsed.frames.map((frame, index) =>
        convertCurFrameToPng(frame, `${sourceFile} frame ${index}`));
      const hotspot = convertedFrames[0].hotspot;
      if (convertedFrames.some((frame) => frame.width !== convertedFrames[0].width
          || frame.height !== convertedFrames[0].height
          || frame.hotspot[0] !== hotspot[0] || frame.hotspot[1] !== hotspot[1])) {
        throw new Error(`${sourceFile} changes dimensions or hotspot between frames`);
      }
      const frames = convertedFrames.map((frame) => {
        const url = createObjectURL(new BlobType([frame.png], { type: "image/png" }));
        urls.push(url);
        return url;
      });
      cursors[key] = {
        sourceFile,
        width: convertedFrames[0].width,
        height: convertedFrames[0].height,
        hotspot,
        mimeType: "image/png",
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
