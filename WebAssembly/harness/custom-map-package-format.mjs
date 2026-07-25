export const MAX_CUSTOM_MAP_INPUT_BYTES = 512 * 1024 * 1024;
export const MAX_CUSTOM_MAP_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_CUSTOM_MAP_FILES = 4096;
export const MAX_CUSTOM_MAPS_PER_IMPORT = 64;

const MAP_EXTENSION = /\.map$/i;
const NATIVE_CODE_EXTENSION = /\.(?:asi|bat|cmd|com|dll|exe|lnk|reg|sys)$/i;
const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function safePathSegment(value, maxLength = 120) {
  const segment = String(value ?? "");
  return segment.length > 0
    && segment.length <= maxLength
    && segment !== "."
    && segment !== ".."
    && !/[\x00-\x1f<>:"|?*]/.test(segment)
    && !/[ .]$/.test(segment)
    && !RESERVED_WINDOWS_NAME.test(segment);
}

export function normalizeCustomMapName(value) {
  const name = String(value ?? "").trim();
  if (!safePathSegment(name, 100)) {
    throw new Error("Map name contains characters that Zero Hour cannot use");
  }
  return name;
}

export function safeCustomMapPackagePath(value) {
  const path = String(value ?? "").replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
  if (!path || path.length > 240 || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
  const parts = path.split("/");
  if (parts.some((part) => !safePathSegment(part))) return null;
  return parts.join("/");
}

export function safeCustomMapRelativePath(value) {
  return safeCustomMapPackagePath(value);
}

function normalizedEntries(values) {
  const entries = [];
  const paths = new Set();
  for (const value of values ?? []) {
    if (value?.folder) continue;
    const path = safeCustomMapPackagePath(value?.path);
    const size = Number(value?.size);
    if (!path) throw new Error(`Map package contains an unsafe path: ${String(value?.path ?? "(unnamed)")}`);
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_CUSTOM_MAP_FILE_BYTES) {
      throw new Error(`${path}: map file must be between 1 byte and 256 MB`);
    }
    const key = path.toLowerCase();
    if (paths.has(key)) throw new Error(`${path}: map package contains a duplicate path`);
    paths.add(key);
    entries.push({ ...value, path, size });
  }
  if (entries.length === 0 || entries.length > MAX_CUSTOM_MAP_FILES) {
    throw new Error(`Map package must contain between 1 and ${MAX_CUSTOM_MAP_FILES} files`);
  }
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (totalBytes > MAX_CUSTOM_MAP_INPUT_BYTES) {
    throw new Error("Expanded map package exceeds the 512 MB browser limit");
  }
  return entries;
}

function candidateLayout(entry, allMapEntries) {
  const parts = entry.path.split("/");
  const fileName = parts.at(-1);
  const name = normalizeCustomMapName(fileName.replace(MAP_EXTENSION, ""));
  const parent = parts.at(-2) ?? "";
  if (parent.toLowerCase() === name.toLowerCase()) {
    return { entry, name: parent, root: parts.slice(0, -1).join("/") };
  }
  if (allMapEntries.length === 1) {
    return { entry, name, root: parts.slice(0, -1).join("/") };
  }
  return null;
}

export function classifyCustomMapPackage(values) {
  const entries = normalizedEntries(values);
  const mapEntries = entries.filter((entry) => MAP_EXTENSION.test(entry.path));
  if (mapEntries.length === 0) {
    throw new Error("No .map file was found. Choose a standard MapName/MapName.map folder or archive");
  }

  const layouts = mapEntries.map((entry) => candidateLayout(entry, mapEntries)).filter(Boolean);
  if (layouts.length === 0) {
    throw new Error("Map folders must use the standard MapName/MapName.map layout");
  }
  if (layouts.length > MAX_CUSTOM_MAPS_PER_IMPORT) {
    throw new Error(`A single import can contain at most ${MAX_CUSTOM_MAPS_PER_IMPORT} maps`);
  }

  const roots = new Set();
  for (const layout of layouts) {
    const key = layout.root.toLowerCase();
    if (roots.has(key)) throw new Error(`${layout.entry.path}: map package layout is ambiguous`);
    roots.add(key);
  }
  for (const left of layouts) {
    for (const right of layouts) {
      if (left === right || !left.root || !right.root) continue;
      if (right.root.toLowerCase().startsWith(`${left.root.toLowerCase()}/`)) {
        throw new Error(`${right.entry.path}: nested map folders are ambiguous`);
      }
    }
  }

  const ignoredNative = [];
  const maps = layouts.map((layout) => {
    const prefix = layout.root ? `${layout.root}/` : "";
    const packageFiles = entries.filter((entry) =>
      !prefix || entry.path.toLowerCase().startsWith(prefix.toLowerCase()));
    const otherMaps = packageFiles.filter((entry) =>
      MAP_EXTENSION.test(entry.path) && entry.path.toLowerCase() !== layout.entry.path.toLowerCase());
    if (otherMaps.length > 0) {
      throw new Error(`${layout.entry.path}: map folder contains another .map file`);
    }

    const paths = new Set();
    const files = [];
    for (const entry of packageFiles) {
      let relativePath = prefix ? entry.path.slice(prefix.length) : entry.path;
      if (entry.path.toLowerCase() === layout.entry.path.toLowerCase()) {
        relativePath = `${layout.name}.map`;
      }
      const safeRelativePath = safeCustomMapRelativePath(relativePath);
      if (!safeRelativePath) throw new Error(`${entry.path}: map-relative path is unsafe`);
      if (NATIVE_CODE_EXTENSION.test(safeRelativePath)) {
        ignoredNative.push(entry.path);
        continue;
      }
      const key = safeRelativePath.toLowerCase();
      if (paths.has(key)) throw new Error(`${safeRelativePath}: map contains a duplicate target path`);
      paths.add(key);
      files.push({
        sourcePath: entry.path,
        path: safeRelativePath,
        size: entry.size,
        source: entry,
      });
    }
    if (!paths.has(`${layout.name}.map`.toLowerCase())) {
      throw new Error(`${layout.name}: main .map file was not retained`);
    }
    return {
      name: layout.name,
      sourceRoot: layout.root,
      files,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    };
  });

  const names = new Set();
  for (const map of maps) {
    const key = map.name.toLowerCase();
    if (names.has(key)) throw new Error(`${map.name}: package contains the same map more than once`);
    names.add(key);
  }
  return {
    maps,
    warnings: ignoredNative.length > 0
      ? [`Ignored ${ignoredNative.length} native Windows code file(s); custom maps cannot run DLL/EXE code in the browser.`]
      : [],
  };
}
