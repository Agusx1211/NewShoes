import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const url = process.env.CAMERA_ZOOM_URL || "https://127.0.0.1:8466/harness/play.html";
const executablePath = process.env.CAMERA_ZOOM_BROWSER
  || "/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome";
const shotDir = process.env.CAMERA_ZOOM_SHOTS || "/tmp/cnc-camera-zoom";
await mkdir(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--ignore-certificate-errors"],
});
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1365, height: 768 },
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.removeItem("cncPortCameraZoom.v1"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Game & Display settings" }).first().click();
  await page.waitForSelector("#settingsWindow.is-open #gamePanel:not([hidden])");

  const zoom = page.locator("#cameraZoomHeight");
  assert.equal(await zoom.inputValue(), "310");
  assert.equal(await page.locator("#cameraZoomHeightValue").textContent(), "310");
  await page.screenshot({ path: join(shotDir, "camera-zoom-default.png") });

  await zoom.evaluate((input) => {
    input.value = "500";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.equal(await page.locator("#cameraZoomHeightValue").textContent(), "500");
  assert.deepEqual(await page.evaluate(() => JSON.parse(
    localStorage.getItem("cncPortCameraZoom.v1"),
  )), { maxCameraHeight: 500 });
  await page.screenshot({ path: join(shotDir, "camera-zoom-500.png") });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Game & Display settings" }).first().click();
  await page.waitForSelector("#settingsWindow.is-open #gamePanel:not([hidden])");
  assert.equal(await page.locator("#cameraZoomHeight").inputValue(), "500");
  assert.equal(await page.evaluate(() => window.CnCPort?.play?.getMaxCameraHeight()), 500);
} finally {
  await browser.close();
}

process.stdout.write(`camera zoom browser smoke: OK (${shotDir})\n`);
