#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshot = resolve(wasmRoot, "artifacts/screenshots/replay-desktop-transfer.png");
const replayName = "desktop-transfer.rep";
const replayBytes = Buffer.from([0x47, 0x45, 0x4e, 0x52, 0x45, 0x50, 1, 2, 3, 4, 5, 6]);

await mkdir(dirname(screenshot), { recursive: true });
const server = await startStaticServer({ root: wasmRoot });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  await page.goto(new URL("harness/play.html?dist=dist", server.url).href, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CnCPort?.listReplays === "function");

  const prior = await page.evaluate(async (name) => {
    const listed = await window.CnCPort.listReplays();
    if (listed.files.some((file) => file.name === name)) {
      await window.CnCPort.deleteReplay(name, { allowLastReplay: true });
    }
    return listed;
  }, replayName);
  assert.equal(prior.ok, true);

  await page.locator('.desktop-icon[data-open="explorer"]').click();
  await page.locator('[data-folder-shortcut="replays"]').click();
  await page.locator("#fileInput").setInputFiles({
    name: replayName,
    mimeType: "application/octet-stream",
    buffer: replayBytes,
  });

  const row = page.locator(`.file-row:has-text("${replayName}")`);
  await row.waitFor({ state: "visible" });
  const listed = await page.evaluate(() => window.CnCPort.listReplays());
  assert.deepEqual(listed.files.map((file) => file.name), [replayName]);
  assert.equal(listed.files[0].size, replayBytes.byteLength);

  const downloadPromise = page.waitForEvent("download");
  await row.locator(".file-download").click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), replayName);
  const downloadPath = await download.path();
  assert.ok(downloadPath);
  assert.deepEqual(await readFile(downloadPath), replayBytes);
  await page.screenshot({ path: screenshot });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.CnCPort?.listReplays === "function");
  const afterReload = await page.evaluate(() => window.CnCPort.listReplays());
  assert.deepEqual(afterReload.files.map((file) => file.name), [replayName]);
  await page.evaluate((name) => window.CnCPort.deleteReplay(name, { allowLastReplay: true }), replayName);

  console.log(JSON.stringify({
    ok: true,
    replay: listed.files[0],
    downloadedBytes: replayBytes.byteLength,
    survivedReload: true,
    screenshot,
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
