import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const runtimeArchives = [
  "INIZH.big",
  "W3DZH.big",
  "W3DEnglishZH.big",
  "TexturesZH.big",
  "TerrainZH.big",
  "WindowZH.big",
  "ShadersZH.big",
  "MapsZH.big",
  "AudioZH.big",
  "AudioEnglishZH.big",
  "SpeechZH.big",
  "SpeechEnglishZH.big",
  "MusicZH.big",
  "Music.big",
  "EnglishZH.big",
  "GensecZH.big",
  "Gensec.big",
];

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const archiveRoot = resolve(wasmRoot, process.argv[2] ?? defaultArchiveRoot);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

if (!isInside(wasmRoot, archiveRoot)) {
  throw new Error(`archive root must be inside ${wasmRoot}: ${archiveRoot}`);
}

const archives = [];
for (const name of runtimeArchives) {
  const path = resolve(archiveRoot, name);
  if (!isInside(archiveRoot, path)) {
    throw new Error(`archive path escaped ${archiveRoot}: ${path}`);
  }

  await access(path);
  const fileStat = await stat(path);
  if (!fileStat.isFile() || fileStat.size <= 0) {
    throw new Error(`archive is not a readable file: ${path}`);
  }

  archives.push({
    name,
    bytes: fileStat.size,
    urlPath: relative(wasmRoot, path).split(sep).join("/"),
  });
}

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const moduleUrl = new URL("dist/gameengine-real-big-browser-smoke.js", server.url).href;
  const archiveInputs = archives.map((archive) => ({
    name: archive.name,
    bytes: archive.bytes,
    url: new URL(archive.urlPath, server.url).href,
  }));

  await page.goto(harnessUrl, { waitUntil: "networkidle" });

  const results = await page.evaluate(async ({ moduleUrl, archives }) => {
    const moduleExports = await import(moduleUrl);
    const createModule =
      moduleExports.default ?? moduleExports.createGameEngineRealBigBrowserSmokeModule;
    const distUrl = new URL("../dist/", window.location.href).href;
    const module = await createModule({
      locateFile: (path) => new URL(path, distUrl).href,
    });

    module.FS.mkdir("/assets");

    const archiveResults = [];
    for (const archive of archives) {
      const response = await fetch(archive.url);
      if (!response.ok) {
        throw new Error(`${archive.name} fetch failed: ${response.status} ${response.statusText}`);
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      const memfsPath = `/assets/${archive.name}`;
      module.FS.writeFile(memfsPath, bytes);

      let status;
      try {
        status = module.ccall(
          "run_real_big_index_smoke",
          "number",
          ["string"],
          [memfsPath],
        );
      } finally {
        module.FS.unlink(memfsPath);
      }

      archiveResults.push({
        name: archive.name,
        expectedBytes: archive.bytes,
        fetchedBytes: bytes.byteLength,
        ok: status === 0 && bytes.byteLength === archive.bytes,
        status,
      });
    }

    return archiveResults;
  }, { moduleUrl, archives: archiveInputs });

  const failed = results.filter((archive) => !archive.ok);
  if (failed.length > 0) {
    throw new Error(`browser runtime archive smoke failed: ${JSON.stringify(failed)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archives: results,
    archiveCount: results.length,
    totalBytes: results.reduce((sum, archive) => sum + archive.fetchedBytes, 0),
    reader: "Win32BIGFileSystem",
    filesystem: "Emscripten MEMFS",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
