import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.CUSTOM_MAP_MANAGER_URL || "https://127.0.0.1:8573/harness/play.html";
const executablePath = process.env.CUSTOM_MAP_MANAGER_BROWSER
  || "/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome";
const shotDir = process.env.CUSTOM_MAP_MANAGER_SHOTS || "/tmp/cnc-custom-map-manager-smoke";
await mkdir(shotDir, { recursive: true });

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path);
    const payload = file.bytes;
    const local = new Uint8Array(30 + name.length + payload.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc32(payload), true);
    localView.setUint32(18, payload.length, true);
    localView.setUint32(22, payload.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(payload, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, crc32(payload), true);
    centralView.setUint32(20, payload.length, true);
    centralView.setUint32(24, payload.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(localOffset + centralSize + 22);
  let offset = 0;
  for (const part of localParts) {
    output.set(part, offset);
    offset += part.length;
  }
  const centralOffset = offset;
  for (const part of centralParts) {
    output.set(part, offset);
    offset += part.length;
  }
  const end = new DataView(output.buffer, offset, 22);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  return output;
}

const mapName = "Browser Canyon";
const archive = storedZip([
  { path: `${mapName}/${mapName}.map`, bytes: new TextEncoder().encode("synthetic map smoke") },
  { path: `${mapName}/${mapName}.tga`, bytes: Uint8Array.from([0, 0, 2, 0, 0, 0, 0, 0]) },
  { path: `${mapName}/map.str`, bytes: new TextEncoder().encode("Map:Name\\nBrowser Canyon\\nEND\\n") },
]);

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--ignore-certificate-errors"],
});
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => {
    process.stderr.write(`[custom-map-manager] page error: ${error.stack ?? error.message}\n`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      process.stderr.write(`[custom-map-manager] console error: ${message.text()}\n`);
    }
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHMapManager && window.CnCPort?.listCustomMaps));
  await page.locator('.desktop-icon[data-open="maps"]').click();
  await page.waitForSelector("#mapsWindow.is-open");
  await page.waitForFunction(() => /No custom maps installed/i.test(
    document.querySelector("#customMapStatus")?.textContent ?? ""));

  await page.locator("#customMapImportPackageInput").setInputFiles({
    name: "Browser-Canyon.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  try {
    await page.waitForFunction((name) => [...document.querySelectorAll(".custom-map-card strong")]
      .some((element) => element.textContent === name), mapName);
  } catch (error) {
    const detail = await page.evaluate(() => ({
      progress: document.querySelector("#customMapImportProgress")?.textContent ?? "",
      status: document.querySelector("#customMapStatus")?.textContent ?? "",
    }));
    throw new Error(`Map import did not finish: ${JSON.stringify(detail)}`, { cause: error });
  }
  assert.match(await page.locator("#customMapStatus").textContent(), /1 custom map/i);
  assert.match(await page.locator(".custom-map-card").textContent(), /preview included/i);
  assert.equal(
    await page.evaluate(() => window.ZeroHMapManager.inventory.maps[0].path),
    `/home/web_user/Command and Conquer Generals Zero Hour Data/Maps/${mapName}/${mapName}.map`,
  );

  const stored = await page.evaluate((name) => {
    const FS = window.CnCPort.engineModule().FS;
    const root = `/home/web_user/Command and Conquer Generals Zero Hour Data/Maps/${name}`;
    return {
      map: [...FS.readFile(`${root}/${name}.map`, { encoding: "binary" })],
      files: FS.readdir(root).filter((entry) => entry !== "." && entry !== "..").sort(),
      cacheExists: (() => {
        try {
          FS.stat("/home/web_user/Command and Conquer Generals Zero Hour Data/Maps/MapCache.ini");
          return true;
        } catch {
          return false;
        }
      })(),
    };
  }, mapName);
  assert.deepEqual(stored.files, [`${mapName}.map`, `${mapName}.tga`, "map.str"].sort());
  assert.equal(new TextDecoder().decode(Uint8Array.from(stored.map)), "synthetic map smoke");
  assert.equal(stored.cacheExists, false);

  const screenshot = join(shotDir, "custom-map-manager-installed.png");
  await page.screenshot({ path: screenshot });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHMapManager && window.CnCPort?.listCustomMaps));
  await page.locator('.desktop-icon[data-open="maps"]').click();
  await page.waitForFunction((name) => [...document.querySelectorAll(".custom-map-card strong")]
    .some((element) => element.textContent === name), mapName);
  assert.match(await page.locator("#customMapStatus").textContent(), /1 custom map/i);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".custom-map-card").getByRole("button", { name: "Remove" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".custom-map-card").length === 0);
  assert.match(await page.locator("#customMapStatus").textContent(), /No custom maps installed/i);

  console.log("custom map manager browser smoke passed", { screenshot, mapName });
} finally {
  await browser.close();
}
