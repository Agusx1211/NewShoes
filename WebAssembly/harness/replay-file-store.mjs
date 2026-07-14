export const CNC_PORT_REPLAY_DIR =
  "/home/web_user/Command and Conquer Generals Zero Hour Data/Replays";
export const MAX_REPLAY_BYTES = 64 * 1024 * 1024;

const REPLAY_MAGIC = new Uint8Array([0x47, 0x45, 0x4e, 0x52, 0x45, 0x50]);

function replayName(value) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 255 || /[\\/\0-\x1f]/.test(name)) {
    throw new Error("Replay filename is invalid");
  }
  if (!/\.rep$/i.test(name)) {
    throw new Error("Replay filename must end in .rep");
  }
  return name;
}

function replayBytes(value) {
  const bytes = value instanceof Uint8Array
    ? value
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : ArrayBuffer.isView(value)
        ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
        : null;
  if (!bytes || bytes.byteLength < REPLAY_MAGIC.byteLength) {
    throw new Error("Replay is empty or truncated");
  }
  if (bytes.byteLength > MAX_REPLAY_BYTES) {
    throw new Error(`Replay exceeds the ${MAX_REPLAY_BYTES / 1024 / 1024} MB limit`);
  }
  if (!REPLAY_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new Error("Replay does not have a GENREP header");
  }
  return bytes;
}

function mkdirTree(FS, path) {
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current += `/${part}`;
    try {
      FS.mkdir(current);
    } catch (error) {
      try {
        FS.stat(current);
      } catch {
        throw error;
      }
    }
  }
}

function moduleFilesystem(module) {
  if (!module?.FS) throw new Error("Replay filesystem is unavailable");
  return module.FS;
}

function fileModified(stat) {
  const value = stat?.mtime instanceof Date ? stat.mtime : new Date(stat?.mtime ?? 0);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function uniqueReplayName(FS, requested, directory) {
  const dot = requested.toLowerCase().lastIndexOf(".rep");
  const stem = requested.slice(0, dot);
  const extension = requested.slice(dot);
  let candidate = requested;
  let index = 2;
  while (true) {
    try {
      FS.stat(`${directory}/${candidate}`);
      candidate = `${stem} (${index++})${extension}`;
    } catch {
      return candidate;
    }
  }
}

export function createReplayFileStore({
  ready,
  getModule,
  persist,
  directory = CNC_PORT_REPLAY_DIR,
}) {
  if (typeof ready !== "function" || typeof getModule !== "function" || typeof persist !== "function") {
    throw new TypeError("Replay store requires ready, getModule, and persist functions");
  }

  async function filesystem() {
    await ready();
    const FS = moduleFilesystem(getModule());
    mkdirTree(FS, directory);
    return FS;
  }

  async function list() {
    const FS = await filesystem();
    const files = [];
    for (const name of FS.readdir(directory)) {
      if (name === "." || name === ".." || !/\.rep$/i.test(name)) continue;
      const path = `${directory}/${name}`;
      try {
        const stat = FS.stat(path);
        if (typeof FS.isFile === "function" && !FS.isFile(stat.mode)) continue;
        files.push({ name, size: Number(stat.size), modified: fileModified(stat) });
      } catch {
        // A concurrently finalized recording can disappear between readdir/stat.
      }
    }
    files.sort((left, right) => left.name.localeCompare(right.name));
    return { ok: true, files, dir: directory };
  }

  async function read(name) {
    const safeName = replayName(name);
    const FS = await filesystem();
    const bytes = FS.readFile(`${directory}/${safeName}`, { encoding: "binary" });
    return new Uint8Array(bytes);
  }

  async function importFile(name, value) {
    const requested = replayName(name);
    const bytes = replayBytes(value);
    const FS = await filesystem();
    const finalName = uniqueReplayName(FS, requested, directory);
    const path = `${directory}/${finalName}`;
    FS.writeFile(path, bytes, { canOwn: false });
    const result = await persist("replay-import");
    if (!result?.ok) {
      try { FS.unlink(path); } catch { /* best-effort rollback */ }
      throw new Error(result?.error || "Replay could not be persisted");
    }
    return { ok: true, name: finalName, size: bytes.byteLength, persisted: true };
  }

  async function remove(name, { allowLastReplay = false } = {}) {
    const safeName = replayName(name);
    if (!allowLastReplay && safeName.toLowerCase() === "00000000.rep") {
      throw new Error("Last Replay is protected while the game runtime is open");
    }
    const FS = await filesystem();
    const path = `${directory}/${safeName}`;
    const backup = FS.readFile(path, { encoding: "binary" });
    FS.unlink(path);
    const result = await persist("replay-delete");
    if (!result?.ok) {
      FS.writeFile(path, backup, { canOwn: false });
      throw new Error(result?.error || "Replay deletion could not be persisted");
    }
    return { ok: true, name: safeName, persisted: true };
  }

  return { list, read, importFile, remove };
}
