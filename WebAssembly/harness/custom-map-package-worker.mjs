import SevenZip from "../node_modules/7z-wasm/7zz.es6.js";
import { parse7zSlt } from "./mod-package-format.mjs";
import {
  MAX_CUSTOM_MAP_INPUT_BYTES,
  classifyCustomMapPackage,
} from "./custom-map-package-format.mjs";

let activeRequestId = null;
let activeSevenZipOutput = [];

function progress(phase, detail, completed = 0, total = 0) {
  self.postMessage({ kind: "progress", requestId: activeRequestId, phase, detail, completed, total });
}

function run7z(sevenZip, args, label) {
  activeSevenZipOutput = [];
  const result = sevenZip.callMain(args);
  if (result !== 0) {
    const tail = activeSevenZipOutput.slice(-12).join("\n").trim();
    throw new Error(`${label} failed (7-Zip ${result})${tail ? `: ${tail}` : ""}`);
  }
  return [...activeSevenZipOutput];
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

function removeTree(FS, path) {
  try {
    const stat = FS.stat(path);
    if (FS.isDir(stat.mode)) {
      for (const name of FS.readdir(path)) {
        if (name !== "." && name !== "..") removeTree(FS, `${path}/${name}`);
      }
      FS.rmdir(path);
    } else {
      FS.unlink(path);
    }
  } catch (error) {
    if (error?.errno !== 44) throw error;
  }
}

function extractEntry(sevenZip, archivePath, entryPath, index) {
  const root = `/extract-${index}`;
  removeTree(sevenZip.FS, root);
  sevenZip.FS.mkdir(root);
  run7z(
    sevenZip,
    ["x", "-y", "-spd", `-o${root}`, "--", archivePath, entryPath],
    `Extracting ${entryPath}`,
  );
  const path = `${root}/${entryPath.replaceAll("\\", "/")}`;
  const stat = sevenZip.FS.stat(path);
  if (sevenZip.FS.isDir(stat.mode)) throw new Error(`${entryPath}: expected a file`);
  return { root, path, size: Number(stat.size) };
}

function readSevenZipFile(sevenZip, path, size) {
  const stream = sevenZip.FS.open(path, "r");
  try {
    const bytes = new Uint8Array(size);
    const count = sevenZip.FS.read(stream, bytes, 0, size, 0);
    if (count !== size) throw new Error(`${path}: extracted file was truncated`);
    return bytes;
  } finally {
    sevenZip.FS.close(stream);
  }
}

async function importMapPackage(payload) {
  const files = Array.from(payload.files ?? []).filter((file) => file instanceof File);
  if (files.length === 0) throw new Error("Choose a map archive or folder first");
  const inputBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (inputBytes <= 0 || inputBytes > MAX_CUSTOM_MAP_INPUT_BYTES) {
    throw new Error("Map input must be between 1 byte and 512 MB");
  }

  let sevenZip = null;
  let archivePath = null;
  let entries;
  const directFiles = new Map();
  if (files.length === 1 && !files[0].webkitRelativePath && !/\.map$/i.test(files[0].name)) {
    progress("inspect", `Inspecting ${files[0].name}`);
    const created = await createSevenZip(files[0]);
    sevenZip = created.module;
    archivePath = created.inputPath;
    entries = parse7zSlt(run7z(
      sevenZip,
      ["l", "-slt", "-ba", "--", archivePath],
      `Inspecting ${files[0].name}`,
    ));
    if (entries.some((entry) => entry.encrypted)) {
      throw new Error("Encrypted map archives are not supported");
    }
  } else {
    entries = files.map((file) => {
      const path = file.webkitRelativePath || file.name;
      directFiles.set(path.replaceAll("\\", "/").toLowerCase(), file);
      return { path, size: file.size, folder: false };
    });
  }

  const classified = classifyCustomMapPackage(entries);
  const total = classified.maps.reduce((sum, map) => sum + map.totalBytes, 0);
  let completed = 0;
  let fileIndex = 0;
  const transfers = [];
  const maps = [];
  for (const map of classified.maps) {
    const outputFiles = [];
    for (const descriptor of map.files) {
      progress("extract", descriptor.sourcePath, completed, total);
      let bytes;
      const direct = directFiles.get(descriptor.sourcePath.toLowerCase());
      if (direct) {
        bytes = new Uint8Array(await direct.arrayBuffer());
      } else {
        const extracted = extractEntry(sevenZip, archivePath, descriptor.sourcePath, fileIndex);
        try {
          if (extracted.size !== descriptor.size) {
            throw new Error(`${descriptor.sourcePath}: extracted size changed`);
          }
          bytes = readSevenZipFile(sevenZip, extracted.path, extracted.size);
        } finally {
          removeTree(sevenZip.FS, extracted.root);
        }
      }
      if (bytes.byteLength !== descriptor.size) throw new Error(`${descriptor.sourcePath}: file was truncated`);
      outputFiles.push({ path: descriptor.path, size: bytes.byteLength, bytes });
      transfers.push(bytes.buffer);
      completed += bytes.byteLength;
      fileIndex += 1;
      progress("extract", descriptor.sourcePath, completed, total);
    }
    maps.push({ name: map.name, totalBytes: map.totalBytes, files: outputFiles });
  }
  return { result: { maps, warnings: classified.warnings }, transfers };
}

self.onmessage = async (event) => {
  const message = event.data ?? {};
  const requestId = String(message.requestId ?? "");
  if (!requestId) {
    self.postMessage({ kind: "result", requestId: null, ok: false, error: "Map operation has no request ID" });
    return;
  }
  if (activeRequestId !== null) {
    self.postMessage({ kind: "result", requestId, ok: false, error: "Another map import is still running" });
    return;
  }
  activeRequestId = requestId;
  try {
    if (message.command !== "import") throw new Error(`Unknown map worker command: ${message.command}`);
    const { result, transfers } = await importMapPackage(message);
    self.postMessage({ kind: "result", requestId, ok: true, result }, transfers);
  } catch (error) {
    console.error("Custom map package operation failed", error?.stack || error);
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
