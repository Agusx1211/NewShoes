import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const outputDir = process.env.WORLD_BUILDER_SHOTS || "/tmp/cnc-world-builder";
await mkdir(outputDir, { recursive: true });
const server = await startStaticServer({ root: wasmRoot });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("harness/play.html", server.url).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.ZeroHDesktop && window.ZeroHWorldBuilder);
  await page.evaluate(() => {
    window.ZeroHDesktop.openApp("worldBuilder");
    window.ZeroHWorldBuilder.newDocument({
      name: "Browser Smoke",
      playableWidth: 72,
      playableHeight: 64,
      border: 10,
      elevation: 22,
      terrain: "SandMediumType5",
    });
    const map = window.ZeroHWorldBuilder.document;
    map.transaction("Smoke fixtures", (document) => {
      document.addWaypoint("Player_1_Start", 180, 180);
      document.addWaypoint("Player_2_Start", 700, 620);
      document.addObject("AmericaCommandCenter", 260, 260);
      document.addScorch(430, 360, { type: 1, radius: 24 });
    });
  });
  await page.waitForSelector("#worldBuilderWindow.is-open");

  const canvas = page.locator("#worldBuilderWindow [data-wb-canvas]");
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox, "World Builder canvas must be visible");
  await page.evaluate(() => window.ZeroHWorldBuilder.selectTool("raise"));
  await page.mouse.move(canvasBox.x + canvasBox.width * .45, canvasBox.y + canvasBox.height * .5);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width * .55, canvasBox.y + canvasBox.height * .55, { steps: 8 });
  await page.mouse.up();

  const edited = await page.evaluate(() => {
    const document = window.ZeroHWorldBuilder.document;
    return {
      snapshot: window.ZeroHWorldBuilder.snapshot(),
      maxHeight: Math.max(...document.heightMap.elevations),
      errors: document.validate().filter((issue) => issue.severity === "error"),
    };
  });
  assert.equal(edited.snapshot.dirty, true);
  assert.ok(edited.maxHeight > 22, "pointer-driven height brush must edit terrain");
  assert.deepEqual(edited.errors, []);

  const saved = await page.evaluate(() => window.ZeroHWorldBuilder.save("Browser Smoke"));
  assert.match(saved.path, /\/Maps\/Browser Smoke\/Browser Smoke\.map$/);
  assert.equal(saved.sidecars, 1);
  const idbRecord = await page.evaluate(async ({ databaseName, mapPath }) => {
    const database = await new Promise((resolveRequest, rejectRequest) => {
      const request = indexedDB.open(databaseName, 21);
      request.onsuccess = () => resolveRequest(request.result);
      request.onerror = () => rejectRequest(request.error);
    });
    const transaction = database.transaction("FILE_DATA", "readonly");
    const store = transaction.objectStore("FILE_DATA");
    const request = store.getAllKeys();
    const keys = await new Promise((resolveRequest, rejectRequest) => {
      request.onsuccess = () => resolveRequest(request.result);
      request.onerror = () => rejectRequest(request.error);
    });
    const mapRequest = store.get(mapPath);
    const map = await new Promise((resolveRequest, rejectRequest) => {
      mapRequest.onsuccess = () => resolveRequest(mapRequest.result);
      mapRequest.onerror = () => rejectRequest(mapRequest.error);
    });
    database.close();
    return {
      keys,
      mapBytes: map.contents.byteLength,
      mapMode: map.mode,
    };
  }, {
    databaseName: "/home/web_user/Command and Conquer Generals Zero Hour Data",
    mapPath: saved.path,
  });
  assert.ok(idbRecord.mapBytes > 1000);
  assert.equal(idbRecord.mapMode, 0o100666);
  assert.ok(idbRecord.keys.some((key) => /Browser Smoke\.tga$/.test(key)),
    "save must install a matching native map-preview sidecar");

  const colors = await canvas.evaluate((element) => {
    const data = element.getContext("2d").getImageData(0, 0, element.width, element.height).data;
    const samples = new Set();
    for (let index = 0; index < data.length; index += 64) {
      samples.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
    }
    return samples.size;
  });
  assert.ok(colors > 8, "editor canvas must contain meaningful terrain and authoring overlays");
  await page.screenshot({ path: resolve(outputDir, "world-builder-authored-map.png") });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.ZeroHDesktop && window.ZeroHWorldBuilder);
  await page.evaluate(() => window.ZeroHDesktop.openApp("worldBuilder"));
  await page.locator('#worldBuilderWindow [data-wb-action="open"]').last().click();
  await page.waitForSelector(".wb-library-list article");
  assert.match(await page.locator(".wb-library-list article").first().innerText(), /Browser Smoke/);
  await page.locator(".wb-library-list article button.primary").click();
  await page.waitForFunction(() => window.ZeroHWorldBuilder.snapshot().name === "Browser Smoke");
  const reopened = await page.evaluate(() => window.ZeroHWorldBuilder.snapshot());
  assert.equal(reopened.objects, 4);
  assert.equal(reopened.waypoints, 2);
  assert.equal(reopened.sidecars, 1);
  assert.deepEqual(errors, []);

  console.log(JSON.stringify({
    ok: true,
    mapBytes: idbRecord.mapBytes,
    colors,
    screenshot: resolve(outputDir, "world-builder-authored-map.png"),
    reopened,
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
