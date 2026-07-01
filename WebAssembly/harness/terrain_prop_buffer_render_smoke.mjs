#!/usr/bin/env node
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/W3DZH.big");
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const archivePath = resolve(wasmRoot, process.argv[2] ?? defaultArchivePath);
const textureArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultTextureArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(
  screenshotDir,
  "harness-smoke-ww3d-terrain-prop-buffer-render-canvas.png",
);
const runtimeArchivePath = "/assets/runtime-terrain-prop-buffer-render";
const meshArchiveMemfsPath = `${runtimeArchivePath}/W3DZH.big`;
const textureArchiveMemfsPath = `${runtimeArchivePath}/TexturesZH.big`;
const propMeshEntry = "Art\\W3D\\CINE_Moon.W3D";
const propTextureEntry = "Art\\Textures\\cine_moon.dds";

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function withTimeout(promise, milliseconds, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

if (!isInside(wasmRoot, archivePath)) {
  throw new Error(`archive must be inside ${wasmRoot}: ${archivePath}`);
}
if (!isInside(wasmRoot, textureArchivePath)) {
  throw new Error(`texture archive must be inside ${wasmRoot}: ${textureArchivePath}`);
}

await access(archivePath);
const archiveStat = await stat(archivePath);
if (!archiveStat.isFile() || archiveStat.size <= 0) {
  throw new Error(`archive is not a readable file: ${archivePath}`);
}
await access(textureArchivePath);
const textureArchiveStat = await stat(textureArchivePath);
if (!textureArchiveStat.isFile() || textureArchiveStat.size <= 0) {
  throw new Error(`texture archive is not a readable file: ${textureArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const archiveRelativePath = relative(wasmRoot, archivePath).split(sep).join("/");
const textureArchiveRelativePath = relative(wasmRoot, textureArchivePath).split(sep).join("/");
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
  const archiveUrl = new URL(archiveRelativePath, server.url).href;
  const textureArchiveUrl = new URL(textureArchiveRelativePath, server.url).href;

  await withTimeout(page.goto(harnessUrl, { waitUntil: "networkidle" }), 30000, "prop-buffer harness page load");
  await withTimeout(page.waitForFunction(() => Boolean(window.CnCPort?.rpc)), 30000, "prop-buffer RPC readiness");

  const bootResult = await withTimeout(
    page.evaluate(() => window.CnCPort.rpc("boot", {
      source: "original W3DPropBuffer render smoke",
    })),
    30000,
    "prop-buffer boot RPC",
  );
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D prop-buffer render: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await withTimeout(
    page.evaluate((payload) => window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
      path: runtimeArchivePath,
      archives: [
        {
          url: archiveUrl,
          name: "W3DZH.big",
          expectedSourceBytes: archiveStat.size,
          sourceArchive: archivePath,
          entries: [propMeshEntry],
        },
        {
          url: textureArchiveUrl,
          name: "TexturesZH.big",
          expectedSourceBytes: textureArchiveStat.size,
          sourceArchive: textureArchivePath,
          entries: [propTextureEntry],
        },
      ],
    }),
    30000,
    "prop-buffer range-backed archive mount",
  );
  const meshArchive = archiveMountResult.archiveSet?.archives?.[0];
  const textureArchive = archiveMountResult.archiveSet?.archives?.[1];
  const meshEntry = meshArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === propMeshEntry.toLowerCase());
  const textureEntry = textureArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === propTextureEntry.toLowerCase());
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 2
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || meshArchive?.path !== meshArchiveMemfsPath
      || textureArchive?.path !== textureArchiveMemfsPath
      || meshEntry?.reader !== "browser fetch Range"
      || textureEntry?.reader !== "browser fetch Range"
      || meshEntry?.bytes <= 0
      || textureEntry?.bytes <= 0
      || archiveMountResult.archiveSet?.probes?.some((probe) => !probe.ok)) {
    throw new Error(`range-backed prop-buffer archive registration failed: ${JSON.stringify(archiveMountResult)}`);
  }

  const result = await withTimeout(
    page.evaluate((payload) => window.CnCPort.rpc("ww3dTerrainPropBufferRender", payload), {
      archivePath: meshArchiveMemfsPath,
      textureArchivePath: textureArchiveMemfsPath,
    }),
    60000,
    "W3D prop-buffer render RPC",
  );
  await page.locator("#viewport").screenshot({ path: screenshotPath });

  if (!result.ok
      || result.command !== "ww3dTerrainPropBufferRender"
      || result.probe?.source !== "ww3d_terrain_prop_buffer_render_probe"
      || !result.probe?.path?.includes("W3DPropBuffer addProp")
      || result.probe?.asset?.model !== "CINE_MOON"
      || result.probe?.results?.runtimeAssetSystemInstalled !== true
      || result.probe?.results?.textureFileFactoryInstalled !== true
      || result.probe?.results?.meshFileExists !== true
      || result.probe?.results?.textureFileExists !== true
      || result.probe?.results?.initialized !== true
      || result.probe?.results?.propTypeCreated !== true
      || result.probe?.results?.propRenderObjectCreated !== true
      || result.probe?.results?.propRenderObjectClassId !== 0
      || result.probe?.results?.propMeshNormalized !== true
      || result.probe?.results?.propVisibleForCamera !== true
      || result.probe?.results?.removePropInvoked !== true
      || result.probe?.results?.propRemoved !== true
      || result.probe?.results?.clearPropsInvoked !== true
      || result.probe?.props?.afterAdd !== 1
      || result.probe?.props?.typesAfterAdd !== 1
      || result.probe?.props?.afterClear !== 0
      || result.probe?.calls?.drawIndexed < 1
      || result.browserProbe?.ok !== true
      || result.browserProbe?.texture0?.sampled !== true
      || result.browserProbe?.usedPersistentBuffers !== true
      || result.bufferDelta?.creates < 2
      || result.bufferDelta?.updates < 2
      || result.textureDelta?.creates < 1
      || result.textureDelta?.updates < 1
      || result.textureDelta?.binds < 1
      || result.screenshot?.coverage?.coloredPixelCount <= 0) {
    throw new Error(`W3D prop-buffer render failed: ${JSON.stringify(result)}`);
  }

  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during W3D prop-buffer render: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-terrain-prop-buffer-render",
    url: harnessUrl,
    screenshot: screenshotPath,
    archiveSet: archiveMountResult.archiveSet,
    probe: result.probe,
    browserProbe: result.browserProbe,
    bufferDelta: result.bufferDelta,
    textureDelta: result.textureDelta,
    coverage: result.screenshot.coverage,
    renderer: "original W3DPropBuffer over WW3DAssetManager shipped model creation and browser D3D8/WebGL2 draw",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
