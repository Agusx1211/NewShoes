export const TRANSFER_USER_DATA_DIR =
  "/home/web_user/Command and Conquer Generals Zero Hour Data";
export const TRANSFER_SAVE_DIR = `${TRANSFER_USER_DATA_DIR}/Save`;
export const TRANSFER_REPLAY_DIR = `${TRANSFER_USER_DATA_DIR}/Replays`;

const MAX_SAVE_BYTES = 512 * 1024 * 1024;
const MAX_REPLAY_BYTES = 64 * 1024 * 1024;
const REPLAY_MAGIC = new Uint8Array([0x47, 0x45, 0x4e, 0x52, 0x45, 0x50]);

function kindSpec(kind) {
  if (kind === "save") return { directory: TRANSFER_SAVE_DIR, extension: ".sav", maxBytes: MAX_SAVE_BYTES };
  if (kind === "replay") return { directory: TRANSFER_REPLAY_DIR, extension: ".rep", maxBytes: MAX_REPLAY_BYTES };
  throw new Error("Transfer user-data kind is invalid");
}

function safeName(kind, value) {
  const name = String(value ?? "").trim();
  const { extension } = kindSpec(kind);
  if (!name || name.length > 255 || /[\\/\0-\x1f]/.test(name)) {
    throw new Error("Transfer user-data filename is invalid");
  }
  if (!name.toLowerCase().endsWith(extension)) {
    throw new Error(`Transfer ${kind} filename must end in ${extension}`);
  }
  return name;
}

function safeDescriptor(value) {
  const kind = value?.kind;
  const name = safeName(kind, value?.name);
  const size = Number(value?.bytes);
  const { maxBytes } = kindSpec(kind);
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) {
    throw new Error(`Transfer ${kind} size is invalid`);
  }
  return { id: String(value?.id ?? ""), kind, name, bytes: size };
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Transfer user-data payload must be binary data");
}

function mkdirTree(FS, path) {
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current += `/${part}`;
    try {
      FS.mkdir(current);
    } catch {
      FS.stat(current);
    }
  }
}

function pathExists(FS, path) {
  try { FS.stat(path); return true; } catch { return false; }
}

function uniqueName(FS, directory, requested) {
  const dot = requested.lastIndexOf(".");
  const stem = requested.slice(0, dot);
  const extension = requested.slice(dot);
  let candidate = requested;
  let index = 2;
  while (pathExists(FS, `${directory}/${candidate}`)) {
    candidate = `${stem} (${index++})${extension}`;
  }
  return candidate;
}

function fileEntries(FS, kind) {
  const { directory, extension, maxBytes } = kindSpec(kind);
  mkdirTree(FS, directory);
  const files = [];
  for (const name of FS.readdir(directory)) {
    if (name === "." || name === ".." || !name.toLowerCase().endsWith(extension)) continue;
    const path = `${directory}/${name}`;
    try {
      const stat = FS.stat(path);
      if (typeof FS.isFile === "function" && !FS.isFile(stat.mode)) continue;
      const bytes = Number(stat.size);
      if (Number.isSafeInteger(bytes) && bytes > 0 && bytes <= maxBytes) {
        files.push({ kind, name, bytes });
      }
    } catch {
      // A live save or replay may disappear between readdir and stat.
    }
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

function readBytes(FS, path, offset, length) {
  const stream = FS.open(path, "r");
  try {
    const bytes = new Uint8Array(length);
    const read = FS.read(stream, bytes, 0, length, offset);
    return read === length ? bytes : bytes.slice(0, read);
  } finally {
    FS.close(stream);
  }
}

export function createTransferUserDataStore({ ready, getModule, persist, randomId = () => crypto.randomUUID() }) {
  if (typeof ready !== "function" || typeof getModule !== "function" || typeof persist !== "function") {
    throw new TypeError("Transfer user-data store requires ready, getModule, and persist functions");
  }

  async function filesystem() {
    await ready();
    const FS = getModule()?.FS;
    if (!FS) throw new Error("Transfer user-data filesystem is unavailable");
    mkdirTree(FS, TRANSFER_SAVE_DIR);
    mkdirTree(FS, TRANSFER_REPLAY_DIR);
    return FS;
  }

  async function list({ includeSaves = false, includeReplays = false } = {}) {
    const FS = await filesystem();
    const files = [];
    if (includeSaves) files.push(...fileEntries(FS, "save"));
    if (includeReplays) files.push(...fileEntries(FS, "replay"));
    return files.map((file, index) => ({ ...file, id: `user-${index + 1}` }));
  }

  async function readChunk(descriptor, offset, length) {
    const file = safeDescriptor(descriptor);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.bytes
        || !Number.isSafeInteger(length) || length < 0 || offset + length > file.bytes) {
      throw new Error("Transfer user-data read range is invalid");
    }
    const FS = await filesystem();
    const { directory } = kindSpec(file.kind);
    const path = `${directory}/${file.name}`;
    if (Number(FS.stat(path).size) !== file.bytes) throw new Error(`${file.name} changed during transfer`);
    return readBytes(FS, path, offset, length);
  }

  async function beginImport(values) {
    const files = values.map(safeDescriptor);
    const ids = new Set(files.map((file) => file.id));
    if (files.some((file) => !file.id) || ids.size !== files.length) {
      throw new Error("Transfer user-data file identifiers are invalid");
    }
    const FS = await filesystem();
    let index = 0;
    let current = null;
    let finished = false;
    const staged = [];

    function ensureActive() {
      if (finished) throw new Error("Transfer user-data session is closed");
    }

    function removeStaged() {
      for (const file of staged) {
        try { FS.unlink(file.tempPath); } catch { /* best-effort rollback */ }
        try { FS.unlink(file.finalPath); } catch { /* not renamed yet */ }
      }
    }

    async function beginFile(id) {
      ensureActive();
      if (current || index >= files.length || files[index].id !== id) {
        throw new Error("Transfer user-data file order is invalid");
      }
      const file = files[index];
      const { directory } = kindSpec(file.kind);
      const finalName = uniqueName(FS, directory, file.name);
      const tempPath = `${directory}/.newshoes-transfer-${randomId()}.part`;
      current = {
        ...file,
        finalName,
        finalPath: `${directory}/${finalName}`,
        tempPath,
        stream: FS.open(tempPath, "w"),
        written: 0,
      };
      staged.push(current);
      return { ...file, finalName };
    }

    async function writeChunk(id, offset, value) {
      ensureActive();
      const bytes = asBytes(value);
      if (!current || current.id !== id || offset !== current.written
          || current.written + bytes.byteLength > current.bytes) {
        throw new Error("Transfer user-data chunk is out of order");
      }
      const written = FS.write(current.stream, bytes, 0, bytes.byteLength, current.written);
      if (written !== bytes.byteLength) throw new Error(`Could not write all of ${current.name}`);
      current.written += written;
    }

    async function finishFile(id) {
      ensureActive();
      if (!current || current.id !== id || current.written !== current.bytes) {
        throw new Error("Transfer user-data file is incomplete");
      }
      FS.close(current.stream);
      current.stream = null;
      if (current.kind === "replay") {
        const header = readBytes(FS, current.tempPath, 0, REPLAY_MAGIC.byteLength);
        if (!REPLAY_MAGIC.every((byte, magicIndex) => header[magicIndex] === byte)) {
          throw new Error(`${current.name} does not have a GENREP header`);
        }
      }
      current = null;
      index += 1;
    }

    async function finish() {
      ensureActive();
      if (current || index !== files.length) throw new Error("Transfer user-data session is incomplete");
      try {
        for (const file of staged) FS.rename(file.tempPath, file.finalPath);
        const result = await persist("device-transfer-import");
        if (!result?.ok) throw new Error(result?.error || "Transferred saves and replays could not be persisted");
        finished = true;
        return staged.map(({ id, kind, name, finalName, bytes }) => ({ id, kind, name, finalName, bytes }));
      } catch (error) {
        removeStaged();
        await persist("device-transfer-rollback").catch(() => {});
        finished = true;
        throw error;
      }
    }

    async function abort() {
      if (finished) return;
      if (current?.stream) {
        try { FS.close(current.stream); } catch { /* already closed */ }
      }
      removeStaged();
      current = null;
      finished = true;
    }

    return { beginFile, writeChunk, finishFile, finish, abort };
  }

  return { list, readChunk, beginImport };
}
