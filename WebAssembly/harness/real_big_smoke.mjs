import { access, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const archivePath = resolve(wasmRoot, process.argv[2] ?? defaultArchivePath);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

if (!isInside(wasmRoot, archivePath)) {
  throw new Error(`archive must be inside ${wasmRoot}: ${archivePath}`);
}

await access(archivePath);
const archiveStat = await stat(archivePath);
if (!archiveStat.isFile() || archiveStat.size <= 0) {
  throw new Error(`archive is not a readable file: ${archivePath}`);
}

const archiveRelativePath = relative(wasmRoot, archivePath).split(sep).join("/");
const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const harnessUrl = new URL("harness/index.html", server.url).href;
  const moduleUrl = new URL("dist/gameengine-real-big-browser-smoke.js", server.url).href;
  const archiveUrl = new URL(archiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "real BIG browser smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before archive mount: ${JSON.stringify(bootResult)}`);
  }

  const mountResult = await page.evaluate((archiveUrl) => window.CnCPort.rpc("mountArchive", {
    url: archiveUrl,
    name: "INIZH.big",
  }), archiveUrl);
  const assetProbe = mountResult.state?.assetProbe;
  if (!mountResult.ok || !assetProbe?.ok) {
    throw new Error(`cnc-port archive mount failed: ${JSON.stringify(mountResult)}`);
  }
  if (!assetProbe.inizh?.armorIni
      || !assetProbe.inizh?.commandButtonIni
      || !assetProbe.inizh?.weaponIni) {
    throw new Error(`cnc-port INIZH probe missed required files: ${JSON.stringify(assetProbe)}`);
  }

  const result = await page.evaluate(async ({ moduleUrl, archiveUrl }) => {
    const moduleExports = await import(moduleUrl);
    const createModule =
      moduleExports.default ?? moduleExports.createGameEngineRealBigBrowserSmokeModule;
    const distUrl = new URL("../dist/", window.location.href).href;
    const module = await createModule({
      locateFile: (path) => new URL(path, distUrl).href,
    });

    const response = await fetch(archiveUrl);
    if (!response.ok) {
      throw new Error(`archive fetch failed: ${response.status} ${response.statusText}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    module.FS.mkdir("/assets");
    module.FS.writeFile("/assets/INIZH.big", bytes);

    const status = module.ccall(
      "run_real_big_smoke",
      "number",
      ["string"],
      ["/assets/INIZH.big"],
    );

    return {
      ok: status === 0,
      status,
      bytes: bytes.byteLength,
    };
  }, { moduleUrl, archiveUrl });

  if (!result.ok) {
    throw new Error(`browser real BIG smoke failed: ${JSON.stringify(result)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    archive: archiveRelativePath,
    bytes: result.bytes,
    cncPortAssetProbe: assetProbe,
    reader: "Win32BIGFileSystem",
    filesystem: "Emscripten MEMFS",
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
