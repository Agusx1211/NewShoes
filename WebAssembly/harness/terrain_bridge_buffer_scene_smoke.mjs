#!/usr/bin/env node
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultIniArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const defaultMapsArchivePath = resolve(wasmRoot, "artifacts/real-assets/MapsZH.big");
const defaultTerrainArchivePath = resolve(wasmRoot, "artifacts/real-assets/TerrainZH.big");
const defaultBaseTerrainArchivePath = resolve(wasmRoot, "artifacts/real-assets/Terrain.big");
const defaultW3DArchivePath = resolve(wasmRoot, "artifacts/real-assets/W3DZH.big");
const defaultBaseW3DArchivePath = resolve(wasmRoot, "artifacts/real-assets/W3D.big");
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const defaultBaseTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/Textures.big");
const iniArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultIniArchivePath);
const mapsArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultMapsArchivePath);
const terrainArchivePath = resolve(wasmRoot, process.argv[4] ?? defaultTerrainArchivePath);
const legacyArchiveArgLayout = process.argv[5] !== undefined
  && /(?:^|[\\/])W3D/i.test(process.argv[5]);
const baseTerrainArchivePath = resolve(
  wasmRoot,
  legacyArchiveArgLayout ? defaultBaseTerrainArchivePath : (process.argv[5] ?? defaultBaseTerrainArchivePath),
);
const baseTerrainArchiveRequired = Boolean(process.argv[5]) && !legacyArchiveArgLayout;
const w3dArchivePath = resolve(
  wasmRoot,
  legacyArchiveArgLayout ? process.argv[5] : (process.argv[6] ?? defaultW3DArchivePath),
);
const explicitBaseW3DArchivePath = !legacyArchiveArgLayout
  && process.argv[7] !== undefined
  && /(?:^|[\\/])W3D\.big$/i.test(process.argv[7])
  ? process.argv[7]
  : undefined;
const baseW3DArchivePath = resolve(wasmRoot, explicitBaseW3DArchivePath ?? defaultBaseW3DArchivePath);
const baseW3DArchiveRequired = Boolean(explicitBaseW3DArchivePath);
const textureArchivePath = resolve(
  wasmRoot,
  legacyArchiveArgLayout
    ? (process.argv[6] ?? defaultTextureArchivePath)
    : (explicitBaseW3DArchivePath ? (process.argv[8] ?? defaultTextureArchivePath) : (process.argv[7] ?? defaultTextureArchivePath)),
);
const baseTextureArchivePath = resolve(
  wasmRoot,
  legacyArchiveArgLayout
    ? (process.argv[7] ?? defaultBaseTextureArchivePath)
    : (explicitBaseW3DArchivePath ? (process.argv[9] ?? defaultBaseTextureArchivePath) : (process.argv[8] ?? defaultBaseTextureArchivePath)),
);
const baseTextureArchiveRequired = !legacyArchiveArgLayout
  && Boolean(explicitBaseW3DArchivePath ? process.argv[9] : process.argv[8]);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-bridge-buffer-scene-canvas.png",
);

const runtimeArchivePath = "/assets/runtime-terrain-bridge-buffer-scene";
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const mapsArchiveMemfsPath = `${runtimeArchivePath}/MapsZH.big`;
const terrainArchiveMemfsMaskPath = `${runtimeArchivePath}/Terrain*.big`;
const terrainIniEntry = "Data\\INI\\Terrain.ini";
const roadsIniEntry = "Data\\INI\\Roads.ini";
const armorIniEntry = "Data\\INI\\Armor.ini";
const damageFxIniEntry = "Data\\INI\\DamageFX.ini";
const systemObjectIniEntry = "Data\\INI\\Object\\System.ini";
const mapEntry = process.env.CNC_PORT_BRIDGE_MAP_ENTRY ?? "Maps\\MD_CHI01\\MD_CHI01.map";
const renderTimeoutMs = Number(process.env.CNC_PORT_BRIDGE_RENDER_TIMEOUT_MS ?? 240000);
const treeModelsEntry = "Art\\W3D\\Models.txt";
const treeMeshEntry = "Art\\W3D\\PTDogwod01_S.W3D";
const treeTextureEntry = "Art\\Terrain\\PTDogwod01_S.tga";
const treeMaterialTextureEntry = "Art\\Textures\\ptdogwod01_s.dds";
const D3DCMP_EQUAL = 3;
const D3DTSS_TCI_CAMERASPACEPOSITION = 0x00020000;
const D3DTTFF_COUNT2 = 2;
const BODY_PRISTINE = 0;
const BODY_RUBBLE = 3;

function iniLayoutMatches(layout) {
  return layout?.source === "terrain-probe-tu-vs-real-ini-runtime"
    && layout?.matches === true
    && layout?.probe?.sizeofINI === layout?.runtime?.sizeofINI
    && layout?.probe?.offsets?.m_seps === layout?.runtime?.offsets?.m_seps
    && layout?.probe?.offsets?.m_sepsPercent === layout?.runtime?.offsets?.m_sepsPercent
    && layout?.probe?.offsets?.m_sepsColon === layout?.runtime?.offsets?.m_sepsColon
    && layout?.probe?.offsets?.m_sepsQuote === layout?.runtime?.offsets?.m_sepsQuote
    && layout?.probe?.separators?.seps === layout?.runtime?.separators?.seps
    && layout?.probe?.separators?.sepsPercent === layout?.runtime?.separators?.sepsPercent
    && layout?.probe?.separators?.sepsColon === layout?.runtime?.separators?.sepsColon
    && layout?.probe?.separators?.sepsQuote === layout?.runtime?.separators?.sepsQuote;
}

function summarizeDrawHistory(drawHistory) {
  if (!Array.isArray(drawHistory)) {
    return [];
  }
  return drawHistory.map((draw, index) => ({
    index,
    ok: draw?.ok,
    primitiveType: draw?.primitiveType,
    vertexShaderFvf: draw?.vertexShaderFvf,
    vertexStride: draw?.vertexStride,
    vertexCount: draw?.vertexCount,
    indexCount: draw?.indexCount,
    alphaBlendEnable: draw?.renderState?.alphaBlendEnable,
    zEnable: draw?.renderState?.zEnable,
    zWriteEnable: draw?.renderState?.zWriteEnable,
    zFunc: draw?.renderState?.zFunc,
    cullMode: draw?.renderState?.cullMode,
    texture0Id: draw?.texture0?.id,
    texture0Sampled: draw?.texture0?.sampled,
    texture0TexCoordIndex: draw?.texture0?.texCoordIndex,
    texture0TextureTransformFlags: draw?.texture0?.textureTransformFlags,
    projected: draw?.vertexSummary?.projected,
    triangles: draw?.vertexSummary?.triangles,
    positionBounds: draw?.vertexSummary?.positionBounds,
    diffuse: draw?.vertexSummary?.diffuse,
    centerPixel: draw?.centerPixel,
  }));
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

async function checkedArchive(path, label) {
  if (!isInside(wasmRoot, path)) {
    throw new Error(`${label} must be inside ${wasmRoot}: ${path}`);
  }
  await access(path);
  const archiveStat = await stat(path);
  if (!archiveStat.isFile() || archiveStat.size <= 0) {
    throw new Error(`${label} is not a readable file: ${path}`);
  }
  return archiveStat;
}

async function optionalArchive(path, label, required = false) {
  try {
    return await checkedArchive(path, label);
  } catch (error) {
    if (required) {
      throw error;
    }
    return null;
  }
}

async function readBigArchive(path) {
  const archiveBytes = await readFile(path);
  if (archiveBytes.toString("latin1", 0, 4) !== "BIGF") {
    throw new Error(`Unsupported BIG archive magic in ${path}`);
  }

  const entryCount = archiveBytes.readUInt32BE(8);
  const entries = [];
  let cursor = 0x10;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (cursor + 8 > archiveBytes.byteLength) {
      throw new Error(`Truncated BIG directory in ${path}`);
    }

    const sourceOffset = archiveBytes.readUInt32BE(cursor);
    const bytes = archiveBytes.readUInt32BE(cursor + 4);
    cursor += 8;

    let nameEnd = cursor;
    while (nameEnd < archiveBytes.byteLength && archiveBytes[nameEnd] !== 0) {
      nameEnd++;
    }
    if (nameEnd >= archiveBytes.byteLength) {
      throw new Error(`Unterminated BIG entry name in ${path}`);
    }

    const name = archiveBytes.toString("latin1", cursor, nameEnd);
    cursor = nameEnd + 1;
    entries.push({ name, sourceOffset, bytes });
  }

  return { archiveBytes, entries };
}

function findEntry(entries, entryName) {
  return entries.find((entry) => entry.name.toLowerCase() === entryName.toLowerCase());
}

function uniqueSorted(entries) {
  return [...new Map(entries.map((entry) => [entry.toLowerCase(), entry])).values()].sort((left, right) =>
    left.localeCompare(right));
}

function parseBridgeAssetNames(roadsIniText) {
  const models = [];
  const textures = [];
  const bridgeBlock = /^\s*Bridge\s+[^\r\n]+([\s\S]*?)^\s*End\s*$/gmi;
  let match;
  while ((match = bridgeBlock.exec(roadsIniText))) {
    const body = match[1];
    for (const key of [
      "BridgeModelName",
      "BridgeModelNameDamaged",
      "BridgeModelNameReallyDamaged",
      "BridgeModelNameBroken",
    ]) {
      const field = new RegExp(`^\\s*${key}\\s*=\\s*([^\\r\\n]+)`, "mi").exec(body);
      if (field?.[1]?.trim()) {
        models.push(field[1].trim());
      }
    }
    for (const key of [
      "Texture",
      "TextureDamaged",
      "TextureReallyDamaged",
      "TextureBroken",
    ]) {
      const field = new RegExp(`^\\s*${key}\\s*=\\s*([^\\r\\n]+)`, "mi").exec(body);
      if (field?.[1]?.trim()) {
        textures.push(field[1].trim());
      }
    }
  }
  return { models: uniqueSorted(models), textures: uniqueSorted(textures) };
}

function selectW3DArchiveEntries(archive, bridgeAssets) {
  const entriesByLower = new Map(archive.entries.map((entry) => [entry.name.toLowerCase(), entry.name]));
  const bridgeModelEntries = bridgeAssets.models
    .flatMap((model) => [`Art\\W3D\\${model}.w3d`, `Art\\W3D\\${model}.W3D`])
    .map((entry) => entriesByLower.get(entry.toLowerCase()))
    .filter(Boolean);
  const broadBridgeModelEntries = archive.entries
    .filter((entry) => /^Art\\W3D\\.*(?:bridge|bridg|brdg|tbdoub|tampico).*\.(?:w3d)$/i.test(entry.name))
    .map((entry) => entry.name);
  return uniqueSorted([
    treeModelsEntry,
    treeMeshEntry,
    ...bridgeModelEntries,
    ...broadBridgeModelEntries,
  ].filter((entry) => entriesByLower.has(entry.toLowerCase())));
}

function selectTextureArchiveEntries(archive, bridgeAssets) {
  const entriesByLower = new Map(archive.entries.map((entry) => [entry.name.toLowerCase(), entry.name]));
  const bridgeTextureEntries = bridgeAssets.textures
    .flatMap((texture) => {
      const base = `Art\\Textures\\${texture}`;
      return [base, base.replace(/\.[^.\\]+$/i, ".dds"), base.replace(/\.[^.\\]+$/i, ".tga")];
    })
    .map((entry) => entriesByLower.get(entry.toLowerCase()))
    .filter(Boolean);
  const broadBridgeTextureEntries = archive.entries
    .filter((entry) => /^Art\\Textures\\.*(?:bridge|bridg|brdg|tbdoub|tampico).*\.(?:tga|dds)$/i.test(entry.name))
    .map((entry) => entry.name);
  const roadTextureEntries = archive.entries
    .filter((entry) => /^Art\\Textures\\tr.*\.(?:tga|dds)$/i.test(entry.name))
    .map((entry) => entry.name);
  return {
    entries: uniqueSorted([
      ...bridgeTextureEntries,
      ...broadBridgeTextureEntries,
      ...roadTextureEntries,
      treeMaterialTextureEntry,
    ].filter((entry) => entriesByLower.has(entry.toLowerCase()))),
    roadTextureEntries,
  };
}

async function withTimeout(label, promise, timeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

const iniArchiveStat = await checkedArchive(iniArchivePath, "INI archive");
const mapsArchiveStat = await checkedArchive(mapsArchivePath, "Maps archive");
const terrainArchiveStat = await checkedArchive(terrainArchivePath, "Terrain archive");
const w3dArchiveStat = await checkedArchive(w3dArchivePath, "W3D archive");
const textureArchiveStat = await checkedArchive(textureArchivePath, "Texture archive");
const iniArchive = await readBigArchive(iniArchivePath);
const mapsArchive = await readBigArchive(mapsArchivePath);
const terrainArchive = await readBigArchive(terrainArchivePath);
const w3dArchive = await readBigArchive(w3dArchivePath);
const textureArchive = await readBigArchive(textureArchivePath);
const roadsIniArchiveEntry = findEntry(iniArchive.entries, roadsIniEntry);
if (!roadsIniArchiveEntry) {
  throw new Error(`INI archive is missing ${roadsIniEntry}: ${iniArchivePath}`);
}
const armorIniArchiveEntry = findEntry(iniArchive.entries, armorIniEntry);
if (!armorIniArchiveEntry) {
  throw new Error(`INI archive is missing ${armorIniEntry}: ${iniArchivePath}`);
}
const damageFxIniArchiveEntry = findEntry(iniArchive.entries, damageFxIniEntry);
if (!damageFxIniArchiveEntry) {
  throw new Error(`INI archive is missing ${damageFxIniEntry}: ${iniArchivePath}`);
}
const systemObjectIniArchiveEntry = findEntry(iniArchive.entries, systemObjectIniEntry);
if (!systemObjectIniArchiveEntry) {
  throw new Error(`INI archive is missing ${systemObjectIniEntry}: ${iniArchivePath}`);
}
const roadsIniText = iniArchive.archiveBytes.toString(
  "latin1",
  roadsIniArchiveEntry.sourceOffset,
  roadsIniArchiveEntry.sourceOffset + roadsIniArchiveEntry.bytes,
);
const mapArchiveEntry = findEntry(mapsArchive.entries, mapEntry);
if (!mapArchiveEntry) {
  throw new Error(`Maps archive is missing selected map entry ${mapEntry}: ${mapsArchivePath}`);
}

const bridgeAssets = parseBridgeAssetNames(roadsIniText);
const terrainArchiveEntries = terrainArchive.entries
  .filter((entry) => /^Art\\Terrain\\.*\.(?:tga|dds)$/i.test(entry.name))
  .map((entry) => entry.name);
const terrainArchives = [{
  sourcePath: terrainArchivePath,
  memfsName: basename(terrainArchivePath),
  stat: terrainArchiveStat,
  entries: terrainArchiveEntries,
  optionalBase: false,
}];
const baseTerrainArchiveStat = await optionalArchive(
  baseTerrainArchivePath,
  "Base terrain archive",
  baseTerrainArchiveRequired,
);
if (baseTerrainArchiveStat !== null && baseTerrainArchivePath !== terrainArchivePath) {
  const baseTerrainArchive = await readBigArchive(baseTerrainArchivePath);
  const baseTerrainArchiveEntries = baseTerrainArchive.entries
    .filter((entry) => /^Art\\Terrain\\.*\.(?:tga|dds)$/i.test(entry.name))
    .map((entry) => entry.name);
  if (baseTerrainArchiveEntries.length === 0) {
    throw new Error(`Base terrain archive has no Art\\Terrain image entries: ${baseTerrainArchivePath}`);
  }
  terrainArchives.push({
    sourcePath: baseTerrainArchivePath,
    memfsName: basename(baseTerrainArchivePath),
    stat: baseTerrainArchiveStat,
    entries: baseTerrainArchiveEntries,
    optionalBase: true,
  });
}
const w3dArchiveEntries = selectW3DArchiveEntries(w3dArchive, bridgeAssets);
const w3dArchives = [{
  sourcePath: w3dArchivePath,
  memfsName: basename(w3dArchivePath),
  stat: w3dArchiveStat,
  entries: w3dArchiveEntries,
  optionalBase: false,
}];
const baseW3DArchiveStat = await optionalArchive(
  baseW3DArchivePath,
  "Base W3D archive",
  baseW3DArchiveRequired,
);
if (baseW3DArchiveStat !== null && baseW3DArchivePath !== w3dArchivePath) {
  const baseW3DArchive = await readBigArchive(baseW3DArchivePath);
  const baseW3DArchiveEntries = selectW3DArchiveEntries(baseW3DArchive, bridgeAssets);
  if (baseW3DArchiveEntries.length === 0) {
    throw new Error(`Base W3D archive has no bridge or tree model entries: ${baseW3DArchivePath}`);
  }
  w3dArchives.push({
    sourcePath: baseW3DArchivePath,
    memfsName: basename(baseW3DArchivePath),
    stat: baseW3DArchiveStat,
    entries: baseW3DArchiveEntries,
    optionalBase: true,
  });
}
const primaryTextureSelection = selectTextureArchiveEntries(textureArchive, bridgeAssets);
const textureArchiveEntries = primaryTextureSelection.entries;
const roadTextureEntries = primaryTextureSelection.roadTextureEntries;
const textureArchives = [{
  sourcePath: textureArchivePath,
  memfsName: basename(textureArchivePath),
  stat: textureArchiveStat,
  entries: textureArchiveEntries,
  optionalBase: false,
}];
const baseTextureArchiveStat = await optionalArchive(
  baseTextureArchivePath,
  "Base texture archive",
  baseTextureArchiveRequired,
);
if (baseTextureArchiveStat !== null && baseTextureArchivePath !== textureArchivePath) {
  const baseTextureArchive = await readBigArchive(baseTextureArchivePath);
  const baseTextureArchiveEntries = selectTextureArchiveEntries(baseTextureArchive, bridgeAssets).entries;
  if (baseTextureArchiveEntries.length === 0) {
    throw new Error(`Base texture archive has no bridge, road, or tree texture entries: ${baseTextureArchivePath}`);
  }
  textureArchives.push({
    sourcePath: baseTextureArchivePath,
    memfsName: basename(baseTextureArchivePath),
    stat: baseTextureArchiveStat,
    entries: baseTextureArchiveEntries,
    optionalBase: true,
  });
}
if (terrainArchiveEntries.length === 0) {
  throw new Error(`Terrain archive has no Art\\Terrain image entries: ${terrainArchivePath}`);
}
if (!terrainArchiveEntries.some((entry) => entry.toLowerCase() === treeTextureEntry.toLowerCase())) {
  throw new Error(`Terrain archive does not contain ${treeTextureEntry}: ${terrainArchivePath}`);
}
if (w3dArchiveEntries.length === 0) {
  throw new Error(`W3D archive has no bridge-like model entries: ${w3dArchivePath}`);
}
if (textureArchiveEntries.length === 0) {
  throw new Error(`Texture archive has no bridge-like texture entries: ${textureArchivePath}`);
}
if (roadTextureEntries.length === 0) {
  throw new Error(`Texture archive has no road-like Art\\Textures\\tr* entries: ${textureArchivePath}`);
}
if (!w3dArchiveEntries.some((entry) => entry.toLowerCase() === treeMeshEntry.toLowerCase())
    || !textureArchiveEntries.some((entry) => entry.toLowerCase() === treeMaterialTextureEntry.toLowerCase())) {
  throw new Error(`Tree sidecar assets are missing from W3D/texture archives`);
}

await mkdir(screenshotDir, { recursive: true });

const iniArchiveRelativePath = relative(wasmRoot, iniArchivePath).split(sep).join("/");
const mapsArchiveRelativePath = relative(wasmRoot, mapsArchivePath).split(sep).join("/");
const terrainArchiveMounts = terrainArchives.map((archive) => ({
  ...archive,
  memfsPath: `${runtimeArchivePath}/${archive.memfsName}`,
  urlPath: relative(wasmRoot, archive.sourcePath).split(sep).join("/"),
}));
const w3dArchiveMounts = w3dArchives.map((archive) => ({
  ...archive,
  memfsPath: `${runtimeArchivePath}/${archive.memfsName}`,
  urlPath: relative(wasmRoot, archive.sourcePath).split(sep).join("/"),
}));
const textureArchiveMounts = textureArchives.map((archive) => ({
  ...archive,
  memfsPath: `${runtimeArchivePath}/${archive.memfsName}`,
  urlPath: relative(wasmRoot, archive.sourcePath).split(sep).join("/"),
}));
const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  const iniArchiveUrl = new URL(iniArchiveRelativePath, server.url).href;
  const mapsArchiveUrl = new URL(mapsArchiveRelativePath, server.url).href;

  await withTimeout(
    "terrain bridge-buffer scene harness page load",
    page.goto(harnessUrl, { waitUntil: "networkidle" }),
    30000,
  );
  await withTimeout(
    "terrain bridge-buffer scene RPC readiness",
    page.waitForFunction(() => Boolean(window.CnCPort?.rpc)),
    30000,
  );

  const bootResult = await withTimeout(
    "terrain bridge-buffer scene boot RPC",
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "W3D bridge-buffer scene renderBridge smoke",
    })),
    30000,
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D bridge-buffer scene: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await withTimeout(
    "terrain bridge-buffer scene archive mount RPC",
    page.evaluate((payload) =>
      window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
        path: runtimeArchivePath,
        register: false,
        verifyEach: false,
        archives: [
          {
            url: iniArchiveUrl,
            name: "INIZH.big",
            expectedSourceBytes: iniArchiveStat.size,
            sourceArchive: iniArchivePath,
            entries: [
              terrainIniEntry,
              roadsIniEntry,
              armorIniEntry,
              damageFxIniEntry,
              systemObjectIniEntry,
            ],
          },
          {
            url: mapsArchiveUrl,
            name: "MapsZH.big",
            expectedSourceBytes: mapsArchiveStat.size,
            sourceArchive: mapsArchivePath,
            entries: [mapEntry],
          },
          ...terrainArchiveMounts.map((archive) => ({
            url: new URL(archive.urlPath, server.url).href,
            name: archive.memfsName,
            expectedSourceBytes: archive.stat.size,
            sourceArchive: archive.sourcePath,
            entries: archive.entries,
          })),
          ...w3dArchiveMounts.map((archive) => ({
            url: new URL(archive.urlPath, server.url).href,
            name: archive.memfsName,
            expectedSourceBytes: archive.stat.size,
            sourceArchive: archive.sourcePath,
            entries: archive.entries,
          })),
          ...textureArchiveMounts.map((archive) => ({
            url: new URL(archive.urlPath, server.url).href,
            name: archive.memfsName,
            expectedSourceBytes: archive.stat.size,
            sourceArchive: archive.sourcePath,
            entries: archive.entries,
          })),
        ],
      }),
    120000,
  );
  const mountedArchives = archiveMountResult.archiveSet?.archives ?? [];
  const findMountedArchive = (name) =>
    mountedArchives.find((archive) => archive.path === `${runtimeArchivePath}/${name}`);
  const rangeIniArchive = findMountedArchive("INIZH.big");
  const rangeMapsArchive = findMountedArchive("MapsZH.big");
  const rangeTerrainArchive = findMountedArchive(basename(terrainArchivePath));
  const rangeW3DArchive = findMountedArchive(basename(w3dArchivePath));
  const rangeTextureArchive = findMountedArchive(basename(textureArchivePath));
  const mountedTerrainArchives = terrainArchiveMounts.map((archive) => findMountedArchive(archive.memfsName));
  const mountedW3DArchives = w3dArchiveMounts.map((archive) => findMountedArchive(archive.memfsName));
  const mountedTextureArchives = textureArchiveMounts.map((archive) => findMountedArchive(archive.memfsName));
  const findMountedEntry = (archive, entryName) =>
    archive?.entries?.find((entry) => entry.path.toLowerCase() === entryName.toLowerCase());
  const findMountedEntryInArchives = (archives, entryName) =>
    archives
      .map((archive) => findMountedEntry(archive, entryName))
      .find(Boolean);
  const treeTerrainMountedEntry = findMountedEntry(rangeTerrainArchive, treeTextureEntry);
  const treeModelsMountedEntry = findMountedEntryInArchives(mountedW3DArchives, treeModelsEntry);
  const treeMeshMountedEntry = findMountedEntryInArchives(mountedW3DArchives, treeMeshEntry);
  const treeMaterialTextureMountedEntry = findMountedEntryInArchives(
    mountedTextureArchives,
    treeMaterialTextureEntry,
  );
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 2 + terrainArchiveMounts.length + w3dArchiveMounts.length + textureArchiveMounts.length
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || !terrainArchiveMounts.some((archive) => archive.optionalBase)
      || !w3dArchiveMounts.some((archive) => archive.optionalBase)
      || !textureArchiveMounts.some((archive) => archive.optionalBase)
      || rangeIniArchive?.path !== iniArchiveMemfsPath
      || rangeMapsArchive?.path !== mapsArchiveMemfsPath
      || rangeTerrainArchive?.path !== `${runtimeArchivePath}/${basename(terrainArchivePath)}`
      || rangeW3DArchive?.path !== `${runtimeArchivePath}/${basename(w3dArchivePath)}`
      || rangeTextureArchive?.path !== `${runtimeArchivePath}/${basename(textureArchivePath)}`
      || mountedTerrainArchives.some((archive) => archive?.entries?.length <= 0)
      || mountedW3DArchives.some((archive) => archive?.entries?.length <= 0)
      || mountedTextureArchives.some((archive) => archive?.entries?.length <= 0)
      || findMountedEntry(rangeIniArchive, terrainIniEntry)?.bytes !== 25758
      || findMountedEntry(rangeIniArchive, roadsIniEntry)?.bytes !== roadsIniArchiveEntry.bytes
      || findMountedEntry(rangeIniArchive, armorIniEntry)?.bytes !== armorIniArchiveEntry.bytes
      || findMountedEntry(rangeIniArchive, damageFxIniEntry)?.bytes !== damageFxIniArchiveEntry.bytes
      || findMountedEntry(rangeIniArchive, systemObjectIniEntry)?.bytes !== systemObjectIniArchiveEntry.bytes
      || findMountedEntry(rangeMapsArchive, mapEntry)?.bytes !== mapArchiveEntry.bytes
      || treeTerrainMountedEntry?.bytes <= 0
      || treeModelsMountedEntry?.bytes <= 0
      || treeMeshMountedEntry?.bytes <= 0
      || treeMaterialTextureMountedEntry?.bytes <= 0) {
    throw new Error(`Runtime terrain bridge-buffer scene archives mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let result;
  try {
    result = await withTimeout(
      "terrain bridge-buffer scene render RPC",
      page.evaluate((payload) =>
        window.CnCPort.rpc("ww3dTerrainBridgeBufferScene", payload), {
          iniArchivePath: iniArchiveMemfsPath,
          mapsArchivePath: mapsArchiveMemfsPath,
          terrainArchivePath: terrainArchiveMemfsMaskPath,
          runtimeArchiveDirectory: `${runtimeArchivePath}/`,
          runtimeArchiveMask: "*.big",
          mapEntry,
        }),
      renderTimeoutMs,
    );
  } catch (error) {
    throw new Error(`terrain bridge-buffer scene render RPC failed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents.slice(-40))}`);
  }
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  const bridgePathfinderNewMapSucceeded =
    result.probe?.results?.bridgeLogicPathfinderNewMapInvoked === true
    && result.probe?.results?.bridgeLogicPathfinderNewMapException === false
    && result.probe?.results?.bridgeLogicPathfinderNewMapSkippedForBrowserSafety === false
    && result.probe?.results?.bridgeLogicPathfinderTerrainCliffQueries > 0
    && result.probe?.results?.bridgeLogicPathfinderTerrainCliffRenderObjectQueries === result.probe?.results?.bridgeLogicPathfinderTerrainCliffQueries
    && result.probe?.results?.bridgeLogicPathfinderTerrainFlatWaterQueries > result.probe?.results?.bridgeLogicPathfinderTerrainCliffQueries
    && result.probe?.results?.bridgeLogicPathfinderAfterNewMapBridgeLayerCells > 0
    && result.probe?.results?.bridgeLogicPathfinderAfterNewMapClearCells > 0
    && result.probe?.results?.bridgeLogicPathfinderAfterNewMapGroundCells > 0
    && result.probe?.results?.bridgeLogicPathfinderChangeToBrokenInvoked === true
    && result.probe?.results?.bridgeLogicPathfinderAfterBrokenBridgeLayerCells > 0
    && result.probe?.results?.bridgeLogicPathfinderAfterBrokenClearCells === 0
    && result.probe?.results?.bridgeLogicPathfinderAfterBrokenBridgeImpassableCells > 0
    && result.probe?.results?.bridgeLogicPathfinderChangeToRepairedInvoked === true
    && result.probe?.results?.bridgeLogicPathfinderAfterRepairedBridgeLayerCells > 0
    && result.probe?.results?.bridgeLogicPathfinderAfterRepairedClearCells > 0;

  if (!result.ok
      || result.command !== "ww3dTerrainBridgeBufferScene"
      || result.probe?.source !== "ww3d_terrain_bridge_buffer_scene_probe"
      || result.probe?.path !== "original WorldHeightMap + HeightMapRenderObjClass::Render -> W3DRoadBuffer::drawRoads + BaseHeightMapRenderObjClass::renderTrees -> ThingFactory::newObject(GenericBridge) -> GameLogic::destroyObject/update-processDestroyList(temp GenericBridge) -> ThingFactory::newDrawable(GenericBridge) -> GameClient::destroyDrawable(temp GenericBridge) -> W3DBridgeBuffer::loadBridges(&W3DTerrainLogic,FALSE) -> TerrainLogic::addBridgeToLogic -> AIPathfind::newMap/classifyMap -> Pathfinder::changeBridgeState(broken/repaired) -> GameLogic::findObjectByID(GenericBridge) -> Object::attemptDamage(GenericBridge) -> TerrainLogic::updateBridgeDamageStates -> Object::kill(GenericBridge) -> TerrainLogic::updateBridgeDamageStates -> Object::attemptHealingFromSoleBenefactor(GenericBridge) -> TerrainLogic::updateBridgeDamageStates -> Object::setDisabledUntil/checkDisabledStatus(GenericBridge) -> Object::goInvulnerable(GenericBridge) -> TerrainLogic::updateCenter -> TerrainLogic-retained W3DBridgeBuffer::drawBridges(FALSE) -> W3DBridge::renderBridge + bridge shroud overlay -> GameLogic::destroyObject/update-processDestroyList(GenericBridge)"
      || result.probe?.results?.runtimeAssetSystemInstalled !== true
      || result.probe?.results?.modelsFileExists !== true
      || result.probe?.results?.meshFileExists !== true
      || result.probe?.results?.treeTextureFileExists !== true
      || result.probe?.results?.materialTextureFileExists !== true
      || result.probe?.results?.roadBufferInstalled !== true
      || result.probe?.results?.roadBufferInitialized !== true
      || result.probe?.results?.loadRoadsInvoked !== true
      || result.probe?.results?.roadDrawInvoked !== true
      || (result.probe?.results?.roadDrawCallDelta ?? 0) <= 0
      || result.probe?.results?.roadSceneDrawFlushed !== true
      || result.probe?.results?.treeBufferInstalled !== true
      || result.probe?.results?.treeDataConfigured !== true
      || result.probe?.results?.addTreeInvoked !== true
      || result.probe?.results?.updateTreeInvoked !== true
      || result.probe?.results?.treeNeedToDrawAfterScene !== false
      || result.probe?.results?.treeDrawInvoked !== true
      || (result.probe?.results?.treeDrawCallDelta ?? 0) <= 0
      || result.probe?.results?.treeSceneDrawFlushed !== true
      || result.probe?.results?.scriptEngineReady !== true
      || result.probe?.results?.objectRuntime?.moduleFactoryReady !== true
      || result.probe?.results?.objectRuntime?.gameLogicReady !== true
      || result.probe?.results?.objectRuntime?.playerListReady !== true
      || result.probe?.results?.objectRuntime?.radarReady !== true
      || result.probe?.results?.objectRuntime?.damageFXReady !== true
      || result.probe?.results?.objectRuntime?.armorReady !== true
      || result.probe?.results?.objectRuntime?.genericBridgeTemplateLoaded !== true
      || result.probe?.results?.objectRuntime?.partitionReady !== true
      || result.probe?.results?.objectRuntime?.objectScriptEngineReady !== true
      || result.probe?.results?.objectRuntime?.newObjectTemplateFound !== true
      || result.probe?.results?.objectRuntime?.newObjectInvoked !== true
      || result.probe?.results?.objectRuntime?.newObjectException !== false
      || result.probe?.results?.objectRuntime?.newObjectReturned !== true
      || result.probe?.results?.objectRuntime?.newObjectID <= 0
      || result.probe?.results?.objectRuntime?.newObjectLookupFound !== true
      || result.probe?.results?.objectRuntime?.newObjectLookupMatches !== true
      || result.probe?.results?.objectRuntime?.newObjectBodyReady !== true
      || result.probe?.results?.objectRuntime?.newObjectCountAfterCreate !== result.probe?.results?.objectRuntime?.newObjectCountBefore + 1
      || result.probe?.results?.objectRuntime?.newObjectCountAfterDestroy !== result.probe?.results?.objectRuntime?.newObjectCountBefore
      || result.probe?.results?.objectRuntime?.newObjectDestroyedBeforeProcess !== true
      || result.probe?.results?.objectRuntime?.newObjectLookupAfterDestroyNull !== true
      || result.probe?.results?.objectRuntime?.newDrawableScopeReady !== true
      || result.probe?.results?.objectRuntime?.newDrawableTemplateFound !== true
      || result.probe?.results?.objectRuntime?.newDrawableInvoked !== true
      || result.probe?.results?.objectRuntime?.newDrawableException !== false
      || result.probe?.results?.objectRuntime?.newDrawableReturned !== true
      || result.probe?.results?.objectRuntime?.newDrawableID <= 0
      || result.probe?.results?.objectRuntime?.newDrawableLookupFound !== true
      || result.probe?.results?.objectRuntime?.newDrawableLookupMatches !== true
      || result.probe?.results?.objectRuntime?.newDrawableFirstMatches !== true
      || result.probe?.results?.objectRuntime?.newDrawableDrawModuleReady !== true
      || result.probe?.results?.objectRuntime?.newDrawableCountAfterCreate !== result.probe?.results?.objectRuntime?.newDrawableCountBefore + 1
      || result.probe?.results?.objectRuntime?.newDrawableCountAfterDestroy !== result.probe?.results?.objectRuntime?.newDrawableCountBefore
      || result.probe?.results?.objectRuntime?.newDrawableDestroyInvoked !== true
      || result.probe?.results?.objectRuntime?.newDrawableLookupAfterDestroyNull !== true
      || result.probe?.results?.bridgeBufferInstalled !== true
      || result.probe?.results?.loadBridgesInvoked !== true
      || result.probe?.results?.terrainLogicInstalledForDraw !== true
      || result.probe?.results?.terrainLogicRetainedForDraw !== true
      || result.probe?.results?.bridgeLogicSeedInfoAvailable !== true
      || result.probe?.results?.bridgeLogicSeededForDraw !== true
      || result.probe?.results?.bridgeLogicCountAfterSeed <= 0
      || result.probe?.results?.bridgeLogicFirstIndexAfterSeed !== 0
      || result.probe?.results?.bridgeLogicFirstDamageStateAfterSeed !== BODY_PRISTINE
      || result.probe?.results?.bridgeLogicObjectLookupInvoked !== true
      || result.probe?.results?.bridgeLogicObjectLookupBridgeID <= 0
      || result.probe?.results?.bridgeLogicObjectLookupFoundID !== result.probe?.results?.bridgeLogicObjectLookupBridgeID
      || result.probe?.results?.bridgeLogicObjectLookupFoundBridgeObject !== true
      || result.probe?.results?.bridgeLogicObjectLookupMatchesBridgeID !== true
      || result.probe?.results?.bridgeLogicObjectLookupInvalidIDNull !== true
      || result.probe?.results?.bridgeLogicObjectLookupHighIDNull !== true
      || result.probe?.results?.bridgeLogicFirstBodyDamageStateAfterSeed !== BODY_PRISTINE
      || result.probe?.results?.bridgeLogicFirstBodyHealthAfterSeed !== 1
      || result.probe?.results?.bridgeLogicFirstBodyMaxHealthAfterSeed !== 1
      || result.probe?.results?.bridgeLogicAttemptDamageInvoked !== true
      || result.probe?.results?.bridgeLogicAttemptDamageChangedState !== false
      || result.probe?.results?.bridgeLogicAttemptDamageActualDealt <= 0
      || result.probe?.results?.bridgeLogicAttemptDamageActualClipped !== 0
      || result.probe?.results?.bridgeLogicAttemptDamageNoEffect !== false
      || result.probe?.results?.bridgeLogicBodyDamageStateAfterAttemptDamage !== BODY_PRISTINE
      || result.probe?.results?.bridgeLogicBodyHealthAfterAttemptDamage !== 1
      || result.probe?.results?.bridgeLogicBodyMaxHealthAfterAttemptDamage !== 1
      || result.probe?.results?.bridgeLogicDamageStateAfterAttemptUpdate !== BODY_PRISTINE
      || result.probe?.results?.bridgeLogicDamageStateChangedAfterAttemptUpdate !== false
      || result.probe?.results?.bridgeLogicBrokenAfterAttemptUpdate !== false
      || result.probe?.results?.bridgeLogicRepairedAfterAttemptUpdate !== false
      || result.probe?.results?.bridgeLogicKillInvoked !== true
      || result.probe?.results?.bridgeLogicKillObjectStillPresent !== true
      || result.probe?.results?.bridgeLogicKillDestroyedStatus !== false
      || result.probe?.results?.bridgeLogicBodyDamageStateAfterKill !== BODY_PRISTINE
      || result.probe?.results?.bridgeLogicBodyHealthAfterKill !== 1
      || result.probe?.results?.bridgeLogicBodyMaxHealthAfterKill !== 1
      || result.probe?.results?.bridgeLogicDamageStateAfterKillUpdate !== BODY_PRISTINE
      || result.probe?.results?.bridgeLogicDamageStateChangedAfterKillUpdate !== false
      || result.probe?.results?.bridgeLogicBrokenAfterKillUpdate !== false
      || result.probe?.results?.bridgeLogicRepairedAfterKillUpdate !== false
      || result.probe?.results?.bridgeLogicSoleHealingInvoked !== true
      || result.probe?.results?.bridgeLogicSoleHealingNullSourceAccepted !== false
      || result.probe?.results?.bridgeLogicSoleHealingFirstAccepted !== true
      || result.probe?.results?.bridgeLogicSoleHealingRepeatAccepted !== true
      || result.probe?.results?.bridgeLogicSoleHealingBenefactorMatchesBridge !== true
      || result.probe?.results?.bridgeLogicSoleHealingObjectStillPresent !== true
      || result.probe?.results?.bridgeLogicSoleHealingDestroyedStatus !== false
      || result.probe?.results?.bridgeLogicBodyDamageStateAfterSoleHealing !== BODY_PRISTINE
      || result.probe?.results?.bridgeLogicBodyHealthAfterSoleHealing !== 1
      || result.probe?.results?.bridgeLogicBodyMaxHealthAfterSoleHealing !== 1
      || result.probe?.results?.bridgeLogicDamageStateAfterSoleHealingUpdate !== BODY_PRISTINE
      || result.probe?.results?.bridgeLogicDamageStateChangedAfterSoleHealingUpdate !== false
      || result.probe?.results?.bridgeLogicBrokenAfterSoleHealingUpdate !== false
      || result.probe?.results?.bridgeLogicRepairedAfterSoleHealingUpdate !== false
      || result.probe?.results?.bridgeLogicDisabledTimerInvoked !== true
      || result.probe?.results?.bridgeLogicDisabledTimerClearInactiveReturned !== false
      || result.probe?.results?.bridgeLogicDisabledTimerInitiallyDisabled !== false
      || result.probe?.results?.bridgeLogicDisabledTimerInitialUntilAny !== 0
      || result.probe?.results?.bridgeLogicDisabledTimerExpirationFrame !== result.probe?.results?.bridgeLogicDisabledTimerFrameBeforeSet + 2
      || result.probe?.results?.bridgeLogicDisabledTimerDisabledAfterSet !== true
      || result.probe?.results?.bridgeLogicDisabledTimerDisabledByEmpAfterSet !== true
      || result.probe?.results?.bridgeLogicDisabledTimerUntilEmpAfterSet !== result.probe?.results?.bridgeLogicDisabledTimerExpirationFrame
      || result.probe?.results?.bridgeLogicDisabledTimerUntilAnyAfterSet !== result.probe?.results?.bridgeLogicDisabledTimerExpirationFrame
      || result.probe?.results?.bridgeLogicDisabledTimerDisabledAfterEarlyCheck !== true
      || result.probe?.results?.bridgeLogicDisabledTimerDisabledByEmpAfterEarlyCheck !== true
      || result.probe?.results?.bridgeLogicDisabledTimerUntilEmpAfterEarlyCheck !== result.probe?.results?.bridgeLogicDisabledTimerExpirationFrame
      || result.probe?.results?.bridgeLogicDisabledTimerUntilAnyAfterEarlyCheck !== result.probe?.results?.bridgeLogicDisabledTimerExpirationFrame
      || result.probe?.results?.bridgeLogicDisabledTimerFrameAfterExpiryCheck !== result.probe?.results?.bridgeLogicDisabledTimerExpirationFrame
      || result.probe?.results?.bridgeLogicDisabledTimerDisabledAfterExpiryCheck !== false
      || result.probe?.results?.bridgeLogicDisabledTimerDisabledByEmpAfterExpiryCheck !== false
      || result.probe?.results?.bridgeLogicDisabledTimerUntilEmpAfterExpiryCheck !== 0
      || result.probe?.results?.bridgeLogicDisabledTimerUntilAnyAfterExpiryCheck !== 0
      || result.probe?.results?.bridgeLogicInvulnerableStateInvoked !== true
      || result.probe?.results?.bridgeLogicInvulnerableInitiallyUndetectedDefector !== false
      || result.probe?.results?.bridgeLogicInvulnerableUndetectedDefectorAfterPositive !== true
      || result.probe?.results?.bridgeLogicInvulnerableUndetectedDefectorAfterZero !== false
      || result.probe?.results?.bridgeDrawFirstDamageStateAfterInvulnerableStateScene !== BODY_PRISTINE
      || result.probe?.results?.bridgeDrawDamageSyncPrimed !== true
      || result.probe?.results?.bridgeDrawDamageSyncObservedDuringDraw !== true
      || result.probe?.results?.bridgeDrawDamageSyncForcedMismatch !== true
      || result.probe?.results?.bridgeDrawDamageSyncMatchedTerrainAfterDraw !== true
      || result.probe?.results?.bridgeDrawDamageSyncBridgeIndex !== result.probe?.results?.bridgeLogicFirstIndexAfterSeed
      || result.probe?.results?.bridgeDrawDamageSyncTerrainState !== BODY_PRISTINE
      || result.probe?.results?.bridgeDrawDamageSyncVisualStateBeforePrime !== BODY_PRISTINE
      || result.probe?.results?.bridgeDrawDamageSyncVisualStateBeforeDraw !== BODY_RUBBLE
      || result.probe?.results?.bridgeDrawDamageSyncVisualStateAfterDraw !== BODY_PRISTINE
      || result.probe?.results?.bridgeDrawDamageSyncVerticesBeforeDraw <= 0
      || result.probe?.results?.bridgeDrawDamageSyncIndicesBeforeDraw <= 0
      || result.probe?.results?.bridgeDrawDamageSyncVerticesAfterDraw <= 0
      || result.probe?.results?.bridgeDrawDamageSyncIndicesAfterDraw <= 0
      || result.probe?.results?.bridgeLogicDestroyListInvoked !== true
      || result.probe?.results?.bridgeLogicDestroyListBridgeID !== result.probe?.results?.bridgeLogicObjectLookupBridgeID
      || result.probe?.results?.bridgeLogicDestroyListObjectCountBeforeDestroy <= 0
      || result.probe?.results?.bridgeLogicDestroyListObjectCountAfterDestroyObject !== result.probe?.results?.bridgeLogicDestroyListObjectCountBeforeDestroy
      || result.probe?.results?.bridgeLogicDestroyListObjectCountAfterProcess + 1 !== result.probe?.results?.bridgeLogicDestroyListObjectCountBeforeDestroy
      || result.probe?.results?.bridgeLogicDestroyListLookupBeforeDestroy !== true
      || result.probe?.results?.bridgeLogicDestroyListDestroyedBeforeDestroy !== false
      || result.probe?.results?.bridgeLogicDestroyListDestroyedAfterDestroyObject !== true
      || result.probe?.results?.bridgeLogicDestroyListLookupAfterDestroyObject !== true
      || result.probe?.results?.bridgeLogicDestroyListLookupAfterProcessNull !== true
      || result.probe?.results?.bridgeLogicAiPathfinderAvailable !== true
      || result.probe?.results?.bridgeLogicFirstLayerAfterSeed !== 2
      || result.probe?.results?.bridgeLogicPathfinderMapInvoked !== true
      || result.probe?.results?.bridgeLogicPathfinderLayer !== result.probe?.results?.bridgeLogicFirstLayerAfterSeed
      || result.probe?.results?.bridgeLogicPathfinderPreflightMinX !== 0
      || result.probe?.results?.bridgeLogicPathfinderPreflightMinY !== 0
      || !bridgePathfinderNewMapSucceeded
      || result.probe?.results?.bridgeDrawTerrainLogicBridgeCount <= 0
      || result.probe?.results?.bridgeDrawEnabledBridgeCount <= 0
      || result.probe?.results?.bridgeDrawWrapperInvoked !== true
      || result.probe?.results?.bridgeDrawWrapperWireframe !== false
      || result.probe?.results?.bridgeTerrainRenderObjectPinned !== true
      || result.probe?.results?.bridgeShroudOverlaySuppressed !== false
      || result.probe?.results?.bridgeShroudTextureReady !== true
      || result.probe?.results?.bridgeShroudDrawSeen !== true
      || (result.probe?.results?.bridgeDrawCallDelta ?? 0) < 2
      || result.probe?.results?.bridgeSceneDrawFlushed !== true
      || result.probe?.ini?.roadsParsed !== true
      || result.probe?.ini?.bridgeCount <= 0
      || !iniLayoutMatches(result.probe?.iniLayout)
      || result.probe?.map?.entry !== mapEntry
      || result.probe?.map?.parsed !== true
      || result.probe?.logicalTerrain?.loadReturned !== true
      || result.probe?.logicalTerrain?.loadException !== false
      || result.probe?.logicalTerrain?.sourceFilenameMatches !== true
      || result.probe?.logicalTerrain?.mapObjectsPresentAfterLoad !== true
      || result.probe?.logicalTerrain?.mapObjectsUsed !== true
      || result.probe?.logicalTerrain?.roadPairsWithRoadType <= 0
      || result.probe?.logicalTerrain?.bridgePairsWithBridgeType <= 0
      || result.probe?.logicalTerrain?.timeOfDayNotified !== true
      || result.probe?.logicalTerrain?.notifiedTimeOfDay !== result.probe?.logicalTerrain?.mapTimeOfDay
      || result.probe?.logicalTerrain?.selectedTemplateSubstitutedInLogicalList !== false
      || result.probe?.results?.bridgePairMapObjectsInstalled !== false
      || result.probe?.bridgeObjects?.templateSubstitutedForAvailableAssets !== false
      || result.probe?.bridgeObjects?.selectedTemplateSubstitutedInLogicalList !== false
      || result.probe?.bridgeObjects?.selectedOriginalName !== result.probe?.bridgeObjects?.selectedInstalledName
      || result.probe?.terrain?.renderObject !== "ProbeHeightMapRenderObjWithBridgeBuffer"
      || result.probe?.terrain?.tileDiagnostics?.patchCells !== 1024
      || result.probe?.terrain?.tileDiagnostics?.patchCellsWithSource !== 1024
      || result.probe?.terrain?.tileDiagnostics?.patchCellsMissingSource !== 0
      || result.probe?.bridgeObjects?.pairs <= 0
      || result.probe?.bridgeObjects?.pairsWithBridgeType <= 0
      || result.probe?.bridgeObjects?.candidatesWithAssetsAndSource <= 0
      || result.probe?.bridgeObjects?.selectedPatchSourceCells !== 1024
      || result.probe?.bridgeObjects?.selectedModelAvailable !== true
      || result.probe?.bridgeObjects?.selectedTextureAvailable !== true
      || result.probe?.bridges?.afterLoad <= 0
      || result.probe?.bridges?.verticesAfterUpdate <= 0
      || result.probe?.bridges?.indicesAfterUpdate <= 0
      || result.probe?.roads?.afterLoad <= 0
      || result.probe?.roads?.segmentsWithVertices <= 0
      || result.probe?.roads?.typesWithDrawData <= 0
      || result.probe?.roads?.totalTypeVertices <= 0
      || result.probe?.roads?.totalTypeIndices <= 0
      || result.probe?.tree?.model !== "PTDogwod01_S"
      || result.probe?.tree?.texture !== "PTDogwod01_S.tga"
      || result.probe?.tree?.tilesAfterScene <= 0
      || result.probe?.scene?.renderPath?.includes("W3DRoadBuffer::drawRoads") !== true
      || result.probe?.scene?.renderPath?.includes("BaseHeightMapRenderObjClass::renderTrees") !== true
      || result.probe?.scene?.renderPath?.includes("W3DBridgeBuffer::drawBridges(FALSE, TheTerrainLogic)") !== true
      || result.probe?.scene?.renderPath?.includes("W3DBridge::renderBridge") !== true
      || result.probe?.draw?.vertexShaderFvf !== 338
      || result.probe?.draw?.vertexStride !== 36
      || result.browserProbe?.vertexShaderFvf !== 338
      || result.browserProbe?.vertexStride !== 36
      || result.browserProbe?.texture0?.sampled !== true
      || result.browserProbe?.renderState?.zFunc !== D3DCMP_EQUAL
      || result.browserProbe?.texture0?.texCoordIndex !== D3DTSS_TCI_CAMERASPACEPOSITION
      || result.browserProbe?.texture0?.textureTransformFlags !== D3DTTFF_COUNT2
      || result.browserProbe?.vertexDiagnostics?.projected?.visible <= 0
      || result.drawSequence?.roadAfterTerrain !== true
      || result.drawSequence?.bridgeAfterTerrain !== true
      || result.drawSequence?.bridgeShroudAfterBridge !== true
      || result.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`terrain bridge-buffer scene smoke failed: ${JSON.stringify({
      ok: result.ok,
      probeOk: result.probe?.ok,
      map: result.probe?.map,
      logicalTerrain: result.probe?.logicalTerrain,
      terrain: result.probe?.terrain,
      bridgeObjects: result.probe?.bridgeObjects,
      bridges: result.probe?.bridges,
      roads: result.probe?.roads,
      tree: result.probe?.tree,
      results: result.probe?.results,
      draw: result.probe?.draw,
      browserProbe: {
        ok: result.browserProbe?.ok,
        vertexShaderFvf: result.browserProbe?.vertexShaderFvf,
        vertexStride: result.browserProbe?.vertexStride,
        projected: result.browserProbe?.vertexDiagnostics?.projected,
        texture0: result.browserProbe?.texture0,
        centerPixel: result.browserProbe?.centerPixel,
      },
      drawSequence: result.drawSequence,
      drawHistory: summarizeDrawHistory(result.drawHistory),
      bufferDelta: result.bufferDelta,
      textureDelta: result.textureDelta,
      coverage: result.screenshot?.coverage,
    })}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-bridge-buffer-scene",
    reader: "browser Range subset BIGs loaded by runtime-owned Win32BIGFileSystem",
    archives: {
      ini: {
        path: rangeIniArchive.path,
        terrainEntry: terrainIniEntry,
        roadsEntry: roadsIniEntry,
        armorEntry: armorIniEntry,
        damageFxEntry: damageFxIniEntry,
        systemObjectEntry: systemObjectIniEntry,
        parser: "GameEngine/Common/INI.cpp::load + INITerrain.cpp + INITerrainRoad.cpp + INITerrainBridge.cpp + TerrainRoads.cpp",
        originalIniParser: true,
        terrainTypeCount: result.probe.ini.terrainTypeCount,
        roadCount: result.probe.ini.roadCount,
        bridgeCount: result.probe.ini.bridgeCount,
        layout: result.probe.iniLayout,
      },
      maps: { path: rangeMapsArchive.path, entry: mapEntry },
      terrain: {
        path: terrainArchiveMemfsMaskPath,
        primaryPath: rangeTerrainArchive.path,
        optionalBasePresent: terrainArchiveMounts.some((archive) => archive.optionalBase),
        archives: terrainArchiveMounts.map((archive, index) => ({
          path: mountedTerrainArchives[index]?.path,
          optionalBase: archive.optionalBase,
          terrainImageEntries: archive.entries.length,
        })),
        treeTextureEntry,
      },
      w3d: {
        path: rangeW3DArchive.path,
        optionalBasePresent: w3dArchiveMounts.some((archive) => archive.optionalBase),
        archives: w3dArchiveMounts.map((archive, index) => ({
          path: mountedW3DArchives[index]?.path,
          optionalBase: archive.optionalBase,
          modelEntries: archive.entries.length,
        })),
        modelsEntry: treeModelsEntry,
        treeMeshEntry,
        bridgeModelEntries: w3dArchiveEntries,
      },
      textures: {
        path: rangeTextureArchive.path,
        optionalBasePresent: textureArchiveMounts.some((archive) => archive.optionalBase),
        archives: textureArchiveMounts.map((archive, index) => ({
          path: mountedTextureArchives[index]?.path,
          optionalBase: archive.optionalBase,
          textureEntries: archive.entries.length,
        })),
        treeMaterialTextureEntry,
        roadTextureEntries,
        bridgeTextureEntries: textureArchiveEntries,
      },
    },
    probe: result.probe,
    map: result.probe.map,
    logicalTerrain: result.probe.logicalTerrain,
    terrain: result.probe.terrain,
    scene: result.probe.scene,
    bridgeObjects: result.probe.bridgeObjects,
    bridges: result.probe.bridges,
    roads: result.probe.roads,
    tree: result.probe.tree,
    calls: result.probe.calls,
    draw: result.probe.draw,
    browserProbe: result.browserProbe,
    drawSequence: result.drawSequence,
    coverage: result.screenshot.coverage,
    bufferDelta: result.bufferDelta,
    textureDelta: result.textureDelta,
    screenshot: screenshotPath,
  }));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
