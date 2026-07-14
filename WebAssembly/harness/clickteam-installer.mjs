// Clickteam Install Creator format decoder. The block and file-list layouts are
// adapted from cicdec 3.0.1 by William Engelmann (BSD-3-Clause); see
// vendor/cicdec-LICENSE.txt. This module parses data only and never executes the
// Windows installer stub.

import "./vendor/pako.es5.min.js";

const SIGNATURE = Uint8Array.from([0x77, 0x77, 0x67, 0x54, 0x29, 0x48]);
const FILE_LIST_BLOCK = 0x143a;
const FILE_DATA_BLOCK = 0x7f7f;
const MAX_SIGNATURE_SCAN = 64 * 1024 * 1024;
const MAX_FILE_COUNT = 200_000;
const MAX_FILE_LIST_BYTES = 128 * 1024 * 1024;

function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u16(bytes, offset) {
  return view(bytes).getUint16(offset, true);
}

function u32(bytes, offset) {
  return view(bytes).getUint32(offset, true);
}

function checkedAdd(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${label}: integer overflow`);
  return result;
}

async function readExact(reader, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0
      || checkedAdd(offset, length, label) > reader.size) {
    throw new Error(`${label}: read is outside the installer`);
  }
  const bytes = await reader.read(offset, length);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== length) {
    throw new Error(`${label}: short read at ${offset}`);
  }
  return bytes;
}

async function findSignature(reader) {
  const limit = Math.min(reader.size, MAX_SIGNATURE_SCAN);
  const chunkSize = 1024 * 1024;
  let carry = new Uint8Array();
  for (let offset = 0; offset < limit; offset += chunkSize) {
    const current = await readExact(reader, offset, Math.min(chunkSize, limit - offset), "Clickteam signature");
    const bytes = new Uint8Array(carry.byteLength + current.byteLength);
    bytes.set(carry);
    bytes.set(current, carry.byteLength);
    for (let index = 0; index <= bytes.byteLength - SIGNATURE.byteLength; index += 1) {
      let matches = true;
      for (let signatureIndex = 0; signatureIndex < SIGNATURE.byteLength; signatureIndex += 1) {
        if (bytes[index + signatureIndex] !== SIGNATURE[signatureIndex]) {
          matches = false;
          break;
        }
      }
      if (matches) return offset - carry.byteLength + index;
    }
    carry = bytes.slice(Math.max(0, bytes.byteLength - SIGNATURE.byteLength + 1));
  }
  return -1;
}

function inflateClickteamChunks(bytes, expectedSize) {
  const Inflate = globalThis.pako?.Inflate;
  if (typeof Inflate !== "function") {
    throw new Error("Clickteam deflate support is unavailable");
  }

  // Install Creator commonly stops after producing the declared bytes without
  // writing the zlib checksum/trailer. Streaming without Z_FINISH preserves the
  // valid output while all size and archive validation remains exact.
  const inflater = new Inflate({ chunkSize: Math.min(Math.max(expectedSize, 64 * 1024), 4 * 1024 * 1024) });
  const chunks = [];
  inflater.onData = (chunk) => chunks.push(chunk.slice());
  inflater.onEnd = (status) => { inflater.err = status; };
  const accepted = inflater.push(bytes, false);
  if (!accepted || inflater.err) {
    throw new Error(`Clickteam deflate payload is corrupt${inflater.msg ? `: ${inflater.msg}` : ""}`);
  }
  if (!inflater.ended && inflater.strm.next_out > 0) {
    chunks.push(inflater.strm.output.slice(0, inflater.strm.next_out));
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (total !== expectedSize) {
    throw new Error(`Clickteam payload expanded to ${total} bytes; expected ${expectedSize}`);
  }
  return chunks;
}

function joinChunks(chunks, total) {
  if (chunks.length === 1 && chunks[0].byteLength === total) return chunks[0];
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function decompressClickteamPayload(method, payload, expectedSize, bzipDecompress = null) {
  let result;
  if (method === 0) {
    result = payload;
  } else if (method === 1) {
    result = joinChunks(inflateClickteamChunks(payload, expectedSize), expectedSize);
  } else if (method === 2 && bzipDecompress) {
    result = await bzipDecompress(payload, expectedSize);
  } else if (method === 2) {
    throw new Error("Clickteam BZip2 payload needs an archive decoder");
  } else {
    throw new Error(`Unsupported Clickteam compression method ${method}`);
  }
  if (!(result instanceof Uint8Array) || result.byteLength !== expectedSize) {
    throw new Error(`Clickteam payload expanded to ${result?.byteLength ?? 0} bytes; expected ${expectedSize}`);
  }
  return result;
}

function byteReader(chunks, size, label) {
  const starts = [];
  let total = 0;
  for (const chunk of chunks) {
    starts.push(total);
    total += chunk.byteLength;
  }
  if (total !== size) throw new Error(`${label}: decompressed size mismatch`);
  return {
    size,
    label,
    async read(offset, length) {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
          || offset < 0 || length < 0 || offset + length > size) {
        throw new Error(`${label}: read is outside the decompressed file`);
      }
      if (length === 0) return new Uint8Array();
      const exact = chunks.findIndex((chunk, index) => offset >= starts[index]
        && offset + length <= starts[index] + chunk.byteLength);
      if (exact >= 0) {
        const localOffset = offset - starts[exact];
        return chunks[exact].subarray(localOffset, localOffset + length);
      }
      const result = new Uint8Array(length);
      let sourceOffset = offset;
      let outputOffset = 0;
      for (let index = 0; index < chunks.length && outputOffset < length; index += 1) {
        const chunkStart = starts[index];
        const chunkEnd = chunkStart + chunks[index].byteLength;
        if (sourceOffset >= chunkEnd) continue;
        const localOffset = Math.max(0, sourceOffset - chunkStart);
        const count = Math.min(length - outputOffset, chunks[index].byteLength - localOffset);
        result.set(chunks[index].subarray(localOffset, localOffset + count), outputOffset);
        sourceOffset += count;
        outputOffset += count;
      }
      return result;
    },
  };
}

async function unpackBlock(reader, offset, blockSize, bzipDecompress) {
  if (blockSize < 5 || blockSize > MAX_FILE_LIST_BYTES) {
    throw new Error("Clickteam file-list block has an invalid size");
  }
  const header = await readExact(reader, offset, 5, "Clickteam block header");
  const expectedSize = u32(header, 0);
  if (expectedSize === 0 || expectedSize > MAX_FILE_LIST_BYTES) {
    throw new Error("Clickteam file list exceeds the browser safety limit");
  }
  const method = header[4];
  const payload = await readExact(reader, offset + 5, blockSize - 5, "Clickteam block payload");
  return decompressClickteamPayload(method, payload, expectedSize, bzipDecompress);
}

function filePath(bytes, start, end) {
  if (start < 0 || end < start || end > bytes.byteLength) return null;
  let zero = start;
  while (zero < end && bytes[zero] !== 0) zero += 1;
  if (zero === start) return "";
  return new TextDecoder("windows-1252").decode(bytes.subarray(start, zero));
}

function parseNode(bytes, start, version) {
  let cursor = start;
  const wideSize = version >= 35 || version === 20;
  const minimum = wideSize ? 6 : 4;
  if (cursor + minimum > bytes.byteLength) throw new Error("file node header is truncated");
  const nodeSize = wideSize ? u32(bytes, cursor) : u16(bytes, cursor);
  cursor += wideSize ? 4 : 2;
  const type = u16(bytes, cursor);
  cursor += 2;
  const end = checkedAdd(start, nodeSize, "Clickteam file node");
  if (nodeSize < minimum || end > bytes.byteLength) throw new Error("file node has an invalid size");
  const entry = {
    type,
    offset: 0,
    compressedSize: 0,
    uncompressedSize: 0,
    index: 0,
    path: "",
    nodeEnd: end,
  };
  if (type !== 0) return entry;

  const skip = (count) => {
    cursor += count;
    if (cursor > end) throw new Error("file node fields exceed the node");
  };
  const read16 = () => { if (cursor + 2 > end) throw new Error("file node is truncated"); const value = u16(bytes, cursor); cursor += 2; return value; };
  const read32 = () => { if (cursor + 4 > end) throw new Error("file node is truncated"); const value = u32(bytes, cursor); cursor += 4; return value; };

  if (version >= 40) {
    skip(3);
    const emptyMarker = bytes[cursor];
    skip(1);
    if (emptyMarker === 0xe2) {
      skip(30);
    } else {
      skip(14);
      entry.uncompressedSize = read32();
      entry.offset = read32();
      entry.compressedSize = read32();
      skip(4 + 24);
    }
  } else if (version >= 35) {
    skip(3);
    const emptyMarker = bytes[cursor];
    skip(1);
    skip(emptyMarker === 0xe2 ? 30 : 14);
    entry.uncompressedSize = read32();
    entry.offset = read32();
    entry.compressedSize = read32();
    read32();
    entry.index = read32();
    skip(2 + 24);
  } else if (version >= 30) {
    skip(2);
    entry.offset = read32();
    entry.compressedSize = read32();
    read32();
    entry.uncompressedSize = read32();
    skip(18);
    entry.index = read32();
    skip(24);
  } else if (version >= 24) {
    skip(2);
    entry.offset = read32();
    entry.compressedSize = read32();
    read32();
    entry.uncompressedSize = read32();
    skip(16 + 24);
  } else {
    skip(14);
    entry.uncompressedSize = read32();
    entry.offset = read32();
    entry.compressedSize = read32();
    skip(24);
  }
  entry.path = filePath(bytes, cursor, end);
  return entry;
}

function parseFileList(bytes, dataStart, installerSize) {
  if (bytes.byteLength < 4) throw new Error("Clickteam file list is truncated");
  const count = u16(bytes, 0);
  if (count <= 0 || count > MAX_FILE_COUNT) throw new Error(`Clickteam file count ${count} is invalid`);
  for (const version of [40, 35, 30, 24, 20]) {
    try {
      let cursor = 4;
      const entries = [];
      for (let index = 0; index < count; index += 1) {
        const entry = parseNode(bytes, cursor, version);
        cursor = entry.nodeEnd;
        if (entry.type !== 0) continue;
        if (typeof entry.path !== "string" || /[\0\x01-\x1f]/.test(entry.path)
            || entry.offset > installerSize || entry.index > 1_000_000_000
            || (entry.compressedSize === 0 && entry.uncompressedSize > 3_000_000_000)
            || (entry.uncompressedSize > 10 && entry.compressedSize > 10
              && entry.compressedSize > entry.uncompressedSize * 5)) {
          throw new Error("file metadata is invalid");
        }
        const recordEnd = checkedAdd(dataStart,
          checkedAdd(entry.offset, entry.compressedSize, "Clickteam file record"),
          "Clickteam file record");
        if (recordEnd > installerSize) throw new Error("file record exceeds the installer");
        entries.push(Object.freeze({ ...entry, version }));
      }
      if (cursor !== bytes.byteLength) throw new Error("file list has trailing data");
      return { version, entries };
    } catch {
      // Try the next known Install Creator layout.
    }
  }
  throw new Error("Unsupported Clickteam Install Creator file-list layout");
}

export async function inspectClickteamInstaller(reader, { bzipDecompress = null } = {}) {
  if (!reader || !Number.isSafeInteger(reader.size) || reader.size < 64 || typeof reader.read !== "function") {
    return null;
  }
  const signatureOffset = await findSignature(reader);
  if (signatureOffset < 0) return null;
  let cursor = signatureOffset + SIGNATURE.byteLength;
  let fileList = null;
  let dataStart = -1;
  while (cursor + 8 <= reader.size) {
    const header = await readExact(reader, cursor, 8, "Clickteam data block");
    const blockId = u16(header, 0);
    const blockSize = u32(header, 4);
    const blockStart = cursor + 8;
    const blockEnd = checkedAdd(blockStart, blockSize, "Clickteam data block");
    if (blockSize === 0 || blockEnd > reader.size) throw new Error("Clickteam data block has an invalid size");
    if (blockId === FILE_LIST_BLOCK) {
      fileList = await unpackBlock(reader, blockStart, blockSize, bzipDecompress);
    } else if (blockId === FILE_DATA_BLOCK) {
      dataStart = blockStart;
      break;
    }
    cursor = blockEnd;
  }
  if (!fileList || dataStart < 0) throw new Error("Clickteam installer is missing its file list or data block");
  const parsed = parseFileList(fileList, dataStart, reader.size);
  return Object.freeze({
    format: "clickteam-install-creator",
    version: parsed.version,
    dataStart,
    entries: Object.freeze(parsed.entries),
  });
}

export async function readClickteamEntry(reader, installer, entry, { bzipDecompress = null } = {}) {
  const decompressed = await readClickteamEntryReader(reader, installer, entry, { bzipDecompress });
  const result = new Uint8Array(decompressed.size);
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < result.byteLength; offset += chunkSize) {
    result.set(await decompressed.read(offset, Math.min(chunkSize, result.byteLength - offset)), offset);
  }
  return result;
}

export async function readClickteamEntryReader(reader, installer, entry, { bzipDecompress = null } = {}) {
  if (!installer || !entry || entry.type !== 0) throw new Error("Invalid Clickteam file entry");
  if (entry.uncompressedSize === 0) return byteReader([new Uint8Array()], 0, entry.path || "Clickteam file");
  if (entry.compressedSize < 5) throw new Error(`${entry.path}: compressed record is truncated`);
  const recordOffset = installer.dataStart + entry.offset;
  const record = await readExact(reader, recordOffset, entry.compressedSize, entry.path || "Clickteam file");
  const method = record[4];
  const payload = record.subarray(5);
  const chunks = method === 1
    ? inflateClickteamChunks(payload, entry.uncompressedSize)
    : [await decompressClickteamPayload(method, payload, entry.uncompressedSize, bzipDecompress)];
  return byteReader(chunks, entry.uncompressedSize, entry.path || "Clickteam file");
}
