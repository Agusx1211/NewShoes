import SevenZip from "../node_modules/7z-wasm/7zz.es6.js";
import { inspectClickteamInstaller, readClickteamEntryReader } from "./clickteam-installer.mjs";
import { decompressBzip } from "./vendor/seek-bzip.min.mjs";
import {
  Sha256,
  classifyArchiveHeader,
  classifyContainerEntries,
  createBigDirectory,
  defaultArchiveEnabled,
  modContentHash,
  parse7zSlt,
  validateBigReader,
} from "./mod-package-format.mjs";

const MAX_INPUT_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_FILES = 200_000;
const CHUNK_BYTES = 4 * 1024 * 1024;
const MOD_ROOT_PATTERN = /^cnc-mods\/(mod-[a-f0-9-]{8,64})$/;
const CUSTOM_ARCHIVE_EXTENSION = /\.(?:ctr|gib)$/i;

let activeRequestId = null;
let activeSevenZipOutput = [];

function progress(phase, detail, completed = 0, total = 0) {
  self.postMessage({ kind: "progress", requestId: activeRequestId, phase, detail, completed, total });
}

function basename(path) {
  return String(path).replaceAll("\\", "/").split("/").pop() || "file";
}

function withoutExtension(path) {
  return basename(path).replace(/\.[^.]+$/, "");
}

function safeArchiveName(value, index) {
  const stem = basename(value).replace(/\.(?:big|ctr|gib)$/i, "").replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^\.+|\.+$/g, "").slice(0, 120) || "content";
  return `${String(index + 1).padStart(3, "0")}-${stem}.big`;
}

async function getDirectory(path, create = true) {
  let directory = await navigator.storage.getDirectory();
  for (const part of String(path).split("/").filter(Boolean)) {
    directory = await directory.getDirectoryHandle(part, { create });
  }
  return directory;
}

async function openOutput(path) {
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.pop();
  const directory = await getDirectory(parts.join("/"), true);
  const file = await directory.getFileHandle(name, { create: true });
  const output = await file.createSyncAccessHandle();
  output.truncate(0);
  return output;
}

async function removeOpfsPath(path) {
  const parts = String(path).split("/").filter(Boolean);
  const name = parts.pop();
  if (!name) return false;
  try {
    const parent = await getDirectory(parts.join("/"), false);
    await parent.removeEntry(name, { recursive: true });
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") return false;
    throw error;
  }
}

function writeAll(output, bytes, at, label) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = output.write(bytes.subarray(offset), { at: at + offset });
    if (!Number.isInteger(written) || written <= 0 || written > bytes.byteLength - offset) {
      throw new Error(`${label}: browser storage is full after ${at + offset} bytes. Remove an installed mod or free browser storage, then import again`);
    }
    offset += written;
  }
}

function blobReader(blob, label = blob.name) {
  return {
    size: blob.size,
    label,
    read: async (offset, length) => new Uint8Array(
      await blob.slice(offset, offset + length).arrayBuffer()),
  };
}

async function hasBigMagic(blob) {
  if (blob.size < 16) return false;
  const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return magic[0] === 0x42 && magic[1] === 0x49 && magic[2] === 0x47 && magic[3] === 0x46;
}

function sevenZipReader(sevenZip, path, label = path) {
  const size = Number(sevenZip.FS.stat(path).size);
  return {
    size,
    label,
    read: async (offset, length) => {
      const stream = sevenZip.FS.open(path, "r");
      try {
        const bytes = new Uint8Array(length);
        const count = sevenZip.FS.read(stream, bytes, 0, length, offset);
        if (count !== length) throw new Error(`${label}: short read at ${offset}`);
        return bytes;
      } finally {
        sevenZip.FS.close(stream);
      }
    },
  };
}

function removeMemfsTree(sevenZip, path) {
  try {
    const stat = sevenZip.FS.stat(path);
    if (sevenZip.FS.isDir(stat.mode)) {
      for (const name of sevenZip.FS.readdir(path)) {
        if (name !== "." && name !== "..") removeMemfsTree(sevenZip, `${path}/${name}`);
      }
      sevenZip.FS.rmdir(path);
    } else {
      sevenZip.FS.unlink(path);
    }
  } catch (error) {
    if (error?.errno !== 44) throw error;
  }
}

function run7z(sevenZip, args, label) {
  activeSevenZipOutput = [];
  const rc = sevenZip.callMain(args);
  if (rc !== 0) {
    const tail = activeSevenZipOutput.slice(-12).join("\n").trim();
    throw new Error(`${label} failed (7-Zip ${rc})${tail ? `: ${tail}` : ""}`);
  }
  return [...activeSevenZipOutput];
}

function listArchive(sevenZip, archivePath) {
  return parse7zSlt(run7z(sevenZip, ["l", "-slt", "-ba", "--", archivePath], `Inspecting ${basename(archivePath)}`));
}

function extractEntry(sevenZip, archivePath, entryPath, outputRoot) {
  removeMemfsTree(sevenZip, outputRoot);
  sevenZip.FS.mkdir(outputRoot);
  run7z(sevenZip, ["x", "-y", "-spd", `-o${outputRoot}`, "--", archivePath, entryPath],
    `Extracting ${entryPath}`);
  const outputPath = `${outputRoot}/${entryPath.replaceAll("\\", "/")}`;
  sevenZip.FS.stat(outputPath);
  return outputPath;
}

async function createSevenZip(file) {
  const module = await SevenZip({
    locateFile: (path) => new URL(`../node_modules/7z-wasm/${path}`, import.meta.url).href,
    print: (line) => activeSevenZipOutput.push(String(line)),
    printErr: (line) => activeSevenZipOutput.push(String(line)),
  });
  module.FS.mkdir("/input");
  module.FS.mount(module.WORKERFS, { files: [file] }, "/input");
  return { module, inputPath: `/input/${file.name}` };
}

async function discoverContainerPayloads(sevenZip, inputPath) {
  const payloads = { bigs: [], loose: [], ignoredNative: [] };
  const queue = [{ archivePath: inputPath, depth: 0, label: basename(inputPath) }];
  let nestedIndex = 0;
  while (queue.length > 0) {
    const source = queue.shift();
    progress("inspect", `Inspecting ${source.label}`);
    const sourceReader = sevenZipReader(sevenZip, source.archivePath, source.label);
    const clickteam = /\.exe$/i.test(source.label)
      ? await inspectClickteamInstaller(sourceReader, { bzipDecompress: decompressBzip })
      : null;
    if (clickteam) {
      const entries = clickteam.entries.map((entry) => ({
        path: entry.path,
        size: entry.uncompressedSize,
        folder: false,
        clickteamEntry: entry,
      }));
      const classified = classifyContainerEntries(entries);
      const clickteamSource = { ...source, clickteam };
      payloads.bigs.push(...classified.bigs.map((entry) => ({ ...entry, source: clickteamSource })));
      payloads.loose.push(...classified.loose.map((entry) => ({ ...entry, source: clickteamSource })));
      payloads.ignoredNative.push(...classified.ignoredNative);
      continue;
    }
    const entries = listArchive(sevenZip, source.archivePath);
    if (entries.length > MAX_FILES) throw new Error(`${source.label}: package has too many entries`);
    if (entries.some((entry) => entry.encrypted)) throw new Error(`${source.label}: encrypted packages are not supported`);
    const classified = classifyContainerEntries(entries);
    payloads.bigs.push(...classified.bigs.map((entry) => ({ ...entry, source })));
    payloads.loose.push(...classified.loose.map((entry) => ({ ...entry, source })));
    payloads.ignoredNative.push(...classified.ignoredNative);
    if (source.depth >= 2 || classified.bigs.length > 0 || classified.loose.length > 0) continue;
    for (const nested of classified.nested.slice(0, 8)) {
      if (nested.size > 1536 * 1024 * 1024) continue;
      const scratch = `/nested-${source.depth}-${nestedIndex++}`;
      const extracted = extractEntry(sevenZip, source.archivePath, nested.path, scratch);
      queue.push({
        archivePath: extracted,
        depth: source.depth + 1,
        label: `${source.label} → ${nested.path}`,
      });
    }
  }
  return payloads;
}

async function withPayloadReader(payload, sevenZip, index, callback) {
  if (payload.file) return callback(blobReader(payload.file, payload.path));
  if (payload.clickteamEntry && payload.source?.clickteam) {
    const installerReader = sevenZipReader(sevenZip, payload.source.archivePath, payload.source.label);
    return callback(await readClickteamEntryReader(
      installerReader,
      payload.source.clickteam,
      payload.clickteamEntry,
      { bzipDecompress: decompressBzip },
    ));
  }
  const root = `/extract-${index}`;
  const extracted = extractEntry(sevenZip, payload.source.archivePath, payload.path, root);
  try {
    return await callback(sevenZipReader(sevenZip, extracted, payload.path));
  } finally {
    removeMemfsTree(sevenZip, root);
  }
}

async function copyBigPayload(payload, sevenZip, outputPath, index, totals, {
  ignoreNativeWindows = false,
  acceptSize = null,
} = {}) {
  return withPayloadReader(payload, sevenZip, index, async (reader) => {
    if (ignoreNativeWindows) {
      // Contra packages place PE launcher utilities beside BIGF archives using
      // the same .ctr extension. Only the native alias is optional here.
      const header = await reader.read(0, Math.min(4, reader.size));
      if (classifyArchiveHeader(header) === "native-windows") return null;
    }
    await validateBigReader(reader, payload.path);
    acceptSize?.(reader.size);
    const output = await openOutput(outputPath);
    const hash = new Sha256();
    let offset = 0;
    try {
      while (offset < reader.size) {
        const bytes = await reader.read(offset, Math.min(CHUNK_BYTES, reader.size - offset));
        writeAll(output, bytes, offset, payload.path);
        hash.update(bytes);
        offset += bytes.byteLength;
        totals.completed += bytes.byteLength;
        progress("write", basename(outputPath), totals.completed, totals.total);
      }
      output.flush();
      if (output.getSize() !== reader.size) throw new Error(`${payload.path}: OPFS size mismatch`);
    } finally {
      output.close();
    }
    return { size: reader.size, sha256: hash.digestHex() };
  });
}

async function writeLooseBig(payloads, sevenZip, outputPath, indexBase, totals) {
  const directory = createBigDirectory(payloads);
  const output = await openOutput(outputPath);
  const hash = new Sha256();
  try {
    writeAll(output, directory.header, 0, outputPath);
    hash.update(directory.header);
    for (let index = 0; index < directory.files.length; index += 1) {
      const entry = directory.files[index];
      await withPayloadReader(entry, sevenZip, indexBase + index, async (reader) => {
        if (reader.size !== entry.size) throw new Error(`${entry.path}: size changed during import`);
        let sourceOffset = 0;
        while (sourceOffset < reader.size) {
          const bytes = await reader.read(sourceOffset, Math.min(CHUNK_BYTES, reader.size - sourceOffset));
          writeAll(output, bytes, entry.dataOffset + sourceOffset, entry.enginePath);
          hash.update(bytes);
          sourceOffset += bytes.byteLength;
          totals.completed += bytes.byteLength;
          progress("write", entry.enginePath, totals.completed, totals.total);
        }
      });
    }
    output.flush();
    if (output.getSize() !== directory.totalSize) throw new Error(`${outputPath}: OPFS size mismatch`);
  } finally {
    output.close();
  }
  return { size: directory.totalSize, sha256: hash.digestHex() };
}

function inferVersion(sourceName) {
  const match = String(sourceName).match(/(?:^|[^a-z])v?(\d+(?:[._-]\d+)+)/i);
  return match ? match[1].replaceAll("_", ".").replaceAll("-", ".") : "Unknown";
}

function uniqueLoosePayloads(payloads) {
  const paths = new Map();
  for (const payload of payloads) paths.set(payload.enginePath.toLowerCase(), payload);
  return [...paths.values()].sort((left, right) => left.enginePath.localeCompare(right.enginePath));
}

async function importPackage(payload) {
  const files = Array.isArray(payload.files) ? payload.files.filter((file) => file instanceof File) : [];
  if (files.length === 0 || files.length > MAX_FILES) throw new Error("Choose a mod archive, installer, BIG file, or folder");
  const inputBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (inputBytes <= 0 || inputBytes > MAX_INPUT_BYTES) throw new Error("Mod input must be between 1 byte and 4 GiB");
  const modId = `mod-${crypto.randomUUID().toLowerCase()}`;
  const outputRoot = `cnc-mods/${modId}`;
  const sourceName = files.length === 1
    ? files[0].name
    : String(files[0].webkitRelativePath || "").replaceAll("\\", "/").split("/")[0] || "Folder mod";
  let sevenZip = null;
  const discovered = { bigs: [], loose: [], ignoredNative: [] };
  try {
    if (files.length === 1 && await hasBigMagic(files[0])) {
      discovered.bigs.push({ path: files[0].name, size: files[0].size, file: files[0] });
    } else if (files.length === 1 && !files[0].webkitRelativePath) {
      const created = await createSevenZip(files[0]);
      sevenZip = created.module;
      Object.assign(discovered, await discoverContainerPayloads(sevenZip, created.inputPath));
    } else {
      const entries = files.map((file) => ({
        path: file.webkitRelativePath || file.name,
        size: file.size,
        folder: false,
        file,
      }));
      const classified = classifyContainerEntries(entries);
      discovered.bigs = classified.bigs;
      discovered.loose = classified.loose;
      discovered.ignoredNative = classified.ignoredNative;
    }

    discovered.loose = uniqueLoosePayloads(discovered.loose);
    const expandedBytes = discovered.bigs.reduce((sum, entry) => sum + entry.size, 0)
      + discovered.loose.reduce((sum, entry) => sum + entry.size, 0);
    if (expandedBytes <= 0) {
      throw new Error("No Zero Hour BIG archives or loose engine files were found in this package");
    }
    const generatedDirectory = discovered.loose.length > 0 ? createBigDirectory(discovered.loose) : null;
    let acceptedExpandedBytes = discovered.bigs
      .filter((entry) => !CUSTOM_ARCHIVE_EXTENSION.test(entry.path))
      .reduce((sum, entry) => sum + entry.size, generatedDirectory?.totalSize ?? 0);
    if (acceptedExpandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error("Expanded mod exceeds the 4 GiB browser limit");
    }
    const totals = {
      completed: 0,
      total: discovered.bigs.reduce((sum, entry) => sum + entry.size, 0)
        + (generatedDirectory?.totalSize ?? 0),
    };
    const archives = [];
    let customArchiveCount = 0;
    for (let index = 0; index < discovered.bigs.length; index += 1) {
      const entry = discovered.bigs[index];
      const customArchive = CUSTOM_ARCHIVE_EXTENSION.test(entry.path);
      const name = safeArchiveName(entry.path, archives.length);
      const opfsPath = `${outputRoot}/archives/${name}`;
      const result = await copyBigPayload(entry, sevenZip, opfsPath, index, totals, {
        ignoreNativeWindows: customArchive,
        acceptSize: customArchive ? (size) => {
          acceptedExpandedBytes += size;
          if (acceptedExpandedBytes > MAX_EXPANDED_BYTES) {
            throw new Error("Expanded mod exceeds the 4 GiB browser limit");
          }
        } : null,
      });
      if (!result) {
        discovered.ignoredNative.push({ path: entry.path, size: entry.size, folder: false });
        totals.completed += entry.size;
        progress("write", `Ignoring native ${basename(entry.path)}`, totals.completed, totals.total);
        continue;
      }
      archives.push({ opfsPath, name, enabled: defaultArchiveEnabled(entry.path), ...result });
      if (customArchive) customArchiveCount += 1;
    }
    if (discovered.loose.length > 0) {
      const name = safeArchiveName("loose-content.big", archives.length);
      const opfsPath = `${outputRoot}/archives/${name}`;
      const result = await writeLooseBig(
        discovered.loose, sevenZip, opfsPath, discovered.bigs.length, totals);
      archives.push({ opfsPath, name, enabled: true, ...result });
    }
    if (archives.length === 0) {
      throw new Error("No Zero Hour BIG archives or loose engine files were found in this package");
    }
    const contentHash = modContentHash(archives);
    const warnings = [];
    if (discovered.ignoredNative.length > 0) {
      warnings.push(`Ignored ${discovered.ignoredNative.length} native Windows code file(s); DLL/EXE code cannot run in the browser.`);
    }
    if (customArchiveCount > 0) {
      const disabled = archives.filter((archive) => !archive.enabled).length;
      warnings.push(`Found ${customArchiveCount} launcher-controlled archive(s). Review the archive switches; ${disabled} optional or alternate archive(s) start disabled.`);
    }
    const requestedName = String(payload.name ?? "").trim();
    const requestedVersion = String(payload.version ?? "").trim();
    return {
      id: modId,
      name: requestedName.slice(0, 120) || withoutExtension(sourceName).slice(0, 120) || "Imported mod",
      version: requestedVersion.slice(0, 80) || inferVersion(sourceName),
      sourceName: sourceName.slice(0, 255),
      contentHash,
      archives,
      warnings,
      installedAt: new Date().toISOString(),
      totalBytes: archives.reduce((sum, archive) => sum + archive.size, 0),
      looseFileCount: discovered.loose.length,
    };
  } catch (error) {
    await removeOpfsPath(outputRoot).catch(() => {});
    throw error;
  }
}

self.onmessage = async (event) => {
  const message = event.data ?? {};
  const requestId = String(message.requestId ?? "");
  if (!requestId) {
    self.postMessage({ kind: "result", requestId: null, ok: false, error: "Mod operation has no request ID" });
    return;
  }
  if (activeRequestId !== null) {
    self.postMessage({
      kind: "result",
      requestId,
      ok: false,
      error: "Another mod operation is still running",
    });
    return;
  }
  activeRequestId = requestId;
  try {
    let result;
    if (message.command === "import") {
      result = await importPackage(message);
    } else if (message.command === "remove") {
      const root = String(message.root ?? "").replace(/^\/+|\/+$/g, "");
      if (!MOD_ROOT_PATTERN.test(root)) throw new Error("Refusing to remove an unmanaged mod path");
      result = { removed: await removeOpfsPath(root) };
    } else {
      throw new Error(`Unknown mod worker command: ${message.command}`);
    }
    self.postMessage({ kind: "result", requestId, ok: true, result });
  } catch (error) {
    console.error("Mod package worker operation failed", error?.stack || error);
    self.postMessage({
      kind: "result",
      requestId,
      ok: false,
      error: error?.message ?? String(error),
    });
  } finally {
    activeRequestId = null;
  }
};
