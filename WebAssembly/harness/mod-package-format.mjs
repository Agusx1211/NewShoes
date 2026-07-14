const SHA256_INITIAL = Uint32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const ENGINE_ROOTS = new Set([
  "art", "audio", "data", "maps", "scripts", "shaders", "window",
]);
const NATIVE_CODE_EXTENSIONS = /\.(?:asi|bat|cmd|com|dll|exe|lnk|reg|sys)$/i;
const CONTAINER_EXTENSIONS = /\.(?:7z|exe|rar|zip)$/i;
// Several established Zero Hour launchers hide BIGF payloads behind a custom
// extension while selecting optional archives (Contra uses .ctr; ShockWave
// distributions have used .gib). The browser manager normalizes them to .big.
const BIG_PAYLOAD_EXTENSIONS = /\.(?:big|ctr|gib)$/i;

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

export class Sha256 {
  constructor() {
    this.state = new Uint32Array(SHA256_INITIAL);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.finished = false;
  }

  update(value) {
    if (this.finished) throw new Error("SHA-256 digest is already finalized");
    const bytes = value instanceof Uint8Array
      ? value
      : new Uint8Array(value.buffer ?? value, value.byteOffset ?? 0, value.byteLength);
    this.bytesHashed += bytes.byteLength;
    let offset = 0;
    if (this.bufferLength > 0) {
      const take = Math.min(64 - this.bufferLength, bytes.byteLength);
      this.buffer.set(bytes.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      offset += take;
      if (this.bufferLength === 64) {
        this.#compress(this.buffer);
        this.bufferLength = 0;
      }
    }
    while (offset + 64 <= bytes.byteLength) {
      this.#compress(bytes.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < bytes.byteLength) {
      this.buffer.set(bytes.subarray(offset), 0);
      this.bufferLength = bytes.byteLength - offset;
    }
    return this;
  }

  #compress(chunk) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) {
      const offset = index * 4;
      words[index] = (chunk[offset] * 0x1000000
        + chunk[offset + 1] * 0x10000
        + chunk[offset + 2] * 0x100
        + chunk[offset + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const before2 = words[index - 2];
      const before15 = words[index - 15];
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10);
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = this.state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + SHA256_K[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }

  digestHex() {
    if (!this.finished) {
      const bitLength = BigInt(this.bytesHashed) * 8n;
      this.buffer[this.bufferLength++] = 0x80;
      if (this.bufferLength > 56) {
        this.buffer.fill(0, this.bufferLength);
        this.#compress(this.buffer);
        this.bufferLength = 0;
      }
      this.buffer.fill(0, this.bufferLength, 56);
      for (let index = 0; index < 8; index += 1) {
        this.buffer[63 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
      }
      this.#compress(this.buffer);
      this.finished = true;
    }
    return Array.from(this.state, (word) => word.toString(16).padStart(8, "0")).join("");
  }
}

export function parse7zSlt(lines) {
  const entries = [];
  let current = null;
  for (const rawLine of lines) {
    let line = String(rawLine).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
    const embeddedPath = line.lastIndexOf("Path = ");
    if (embeddedPath > 0) line = line.slice(embeddedPath);
    if (!line.trim()) {
      if (current?.Path) entries.push(current);
      current = null;
      continue;
    }
    const separator = line.indexOf(" = ");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 3);
    if (key === "Path" && current?.Path) entries.push(current);
    current ||= {};
    current[key] = value;
  }
  if (current?.Path) entries.push(current);
  return entries.map((entry) => ({
    path: entry.Path,
    size: Number(entry.Size ?? 0),
    folder: entry.Folder === "+",
    encrypted: entry.Encrypted === "+",
    crc: entry.CRC || null,
  }));
}

export function safeContainerPath(value) {
  const path = String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.includes("\0")) return null;
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\x00-\x1f]/.test(part))) return null;
  return parts.join("/");
}

export function enginePathFromContainerPath(value) {
  const safe = safeContainerPath(value);
  if (!safe || /[^\x20-\x7e]/.test(safe)) return null;
  const parts = safe.split("/");
  const rootIndex = parts.findIndex((part) => ENGINE_ROOTS.has(part.toLowerCase()));
  if (rootIndex < 0 || rootIndex === parts.length - 1) return null;
  const enginePath = parts.slice(rootIndex).join("\\");
  return enginePath.length <= 259 ? enginePath : null;
}

export function classifyContainerEntries(entries) {
  const bigs = [];
  const looseByPath = new Map();
  const nested = [];
  const ignoredNative = [];
  for (const entry of entries) {
    if (entry?.folder) continue;
    const path = safeContainerPath(entry?.path);
    const size = Number(entry?.size);
    if (!path || !Number.isSafeInteger(size) || size <= 0) continue;
    if (BIG_PAYLOAD_EXTENSIONS.test(path)) {
      bigs.push({ ...entry, path, size });
      continue;
    }
    if (CONTAINER_EXTENSIONS.test(path)) nested.push({ ...entry, path, size });
    if (NATIVE_CODE_EXTENSIONS.test(path)) {
      ignoredNative.push(path);
      continue;
    }
    const enginePath = enginePathFromContainerPath(path);
    if (enginePath) looseByPath.set(enginePath.toLowerCase(), { ...entry, path, size, enginePath });
  }
  return {
    bigs,
    loose: [...looseByPath.values()].sort((left, right) => left.enginePath.localeCompare(right.enginePath)),
    nested,
    ignoredNative,
  };
}

function setU32BE(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function setU32LE(bytes, offset, value) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

export function createBigDirectory(entries) {
  const encoder = new TextEncoder();
  const normalized = entries.map((entry) => {
    const path = String(entry.enginePath ?? "");
    const pathBytes = encoder.encode(path);
    const size = Number(entry.size);
    if (!path || pathBytes.byteLength > 259 || !Number.isSafeInteger(size) || size <= 0) {
      throw new Error(`Invalid loose mod file for BIG archive: ${path || "(unnamed)"}`);
    }
    return { ...entry, pathBytes, size };
  });
  const directoryBytes = normalized.reduce((sum, entry) => sum + 8 + entry.pathBytes.byteLength + 1, 0);
  const dataStart = 16 + directoryBytes;
  const totalSize = dataStart + normalized.reduce((sum, entry) => sum + entry.size, 0);
  if (totalSize > 0xffffffff) throw new Error("Generated BIG archive exceeds the 4 GiB format limit");
  const header = new Uint8Array(dataStart);
  header.set([0x42, 0x49, 0x47, 0x46], 0);
  setU32LE(header, 4, totalSize);
  setU32BE(header, 8, normalized.length);
  setU32BE(header, 12, 0);
  let directoryOffset = 16;
  let dataOffset = dataStart;
  const files = [];
  for (const entry of normalized) {
    setU32BE(header, directoryOffset, dataOffset);
    setU32BE(header, directoryOffset + 4, entry.size);
    header.set(entry.pathBytes, directoryOffset + 8);
    directoryOffset += 8 + entry.pathBytes.byteLength + 1;
    files.push({ ...entry, dataOffset });
    dataOffset += entry.size;
  }
  return { header, files, totalSize };
}

function u32be(bytes, offset) {
  return (bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100 + bytes[offset + 3]) >>> 0;
}

function u32le(bytes, offset) {
  return (bytes[offset] + bytes[offset + 1] * 0x100
    + bytes[offset + 2] * 0x10000 + bytes[offset + 3] * 0x1000000) >>> 0;
}

export async function validateBigReader({ size, read }, label = "BIG archive") {
  if (!Number.isSafeInteger(size) || size < 16) throw new Error(`${label}: archive is too small`);
  const bytes = await read(0, Math.min(size, 64 * 1024 * 1024));
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "BIGF") throw new Error(`${label}: missing BIGF header`);
  const declaredSize = u32le(bytes, 4);
  const count = u32be(bytes, 8);
  if (declaredSize !== size) throw new Error(`${label}: declared size ${declaredSize} does not match ${size}`);
  if (count > 200000) throw new Error(`${label}: unreasonable file count ${count}`);
  let cursor = 16;
  let firstDataOffset = size;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 9 > bytes.byteLength) throw new Error(`${label}: directory exceeds validation limit`);
    const offset = u32be(bytes, cursor);
    const fileSize = u32be(bytes, cursor + 4);
    let end = cursor + 8;
    while (end < bytes.byteLength && bytes[end] !== 0 && end - cursor <= 268) end += 1;
    if (end >= bytes.byteLength || end === cursor + 8 || end - cursor > 268) {
      throw new Error(`${label}: invalid path for entry ${index}`);
    }
    if (offset + fileSize > size) throw new Error(`${label}: invalid extent for entry ${index}`);
    firstDataOffset = Math.min(firstDataOffset, offset);
    cursor = end + 1;
  }
  if (firstDataOffset < cursor) throw new Error(`${label}: file data overlaps its directory`);
  return { size, fileCount: count, directoryBytes: cursor - 16 };
}
