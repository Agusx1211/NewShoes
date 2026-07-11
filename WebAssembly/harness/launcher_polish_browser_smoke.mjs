import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.LAUNCHER_POLISH_URL || "https://127.0.0.1:8457/harness/play.html";
const executablePath = process.env.LAUNCHER_POLISH_BROWSER
  || "/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome";
const shotDir = process.env.LAUNCHER_POLISH_SHOTS || "/tmp/cnc-launcher-polish";
await mkdir(shotDir, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true, args: ["--ignore-certificate-errors"] });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1365, height: 768 } });
  const localRequests = [];
  const page = await context.newPage();
  page.on("request", (request) => localRequests.push(request.url()));
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#setupWindow.is-open");
  assert.equal(await page.locator("[data-retail-presentation]:visible").count(), 0);
  const fallbackShot = join(shotDir, "launcher-fallback-art.png");
  await page.screenshot({ path: fallbackShot });

  await page.getByRole("button", { name: "Game & Display settings" }).first().click();
  await page.waitForSelector("#settingsWindow.is-open #gamePanel:not([hidden])");
  assert.equal(await page.locator("#gameTab").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator("#appearancePanel").isHidden(), true);
  const settingsShot = join(shotDir, "game-display-deep-link.png");
  await page.screenshot({ path: settingsShot });

  const presentation = await page.evaluate(async () => {
    const width = 320;
    const height = 180;
    const stride = Math.ceil((width * 3) / 4) * 4;
    const bmp = new Uint8Array(54 + stride * height);
    const view = new DataView(bmp.buffer);
    bmp.set([0x42, 0x4d]);
    view.setUint32(2, bmp.length, true);
    view.setUint32(10, 54, true);
    view.setUint32(14, 40, true);
    view.setInt32(18, width, true);
    view.setInt32(22, height, true);
    view.setUint16(26, 1, true);
    view.setUint16(28, 24, true);
    view.setUint32(34, stride * height, true);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = 54 + y * stride + x * 3;
        bmp[offset] = 35 + Math.floor((x / width) * 90);
        bmp[offset + 1] = 65 + Math.floor((y / height) * 100);
        bmp[offset + 2] = x > width * 0.58 && y > height * 0.22 ? 225 : 115;
      }
    }
    const path = "Data\\English\\Install_Final.bmp";
    const pathBytes = new TextEncoder().encode(path);
    const dataOffset = 16 + 8 + pathBytes.length + 1;
    const big = new Uint8Array(dataOffset + bmp.length);
    const bigView = new DataView(big.buffer);
    big.set(new TextEncoder().encode("BIGF"), 0);
    bigView.setUint32(4, big.length, true);
    bigView.setUint32(8, 1, false);
    bigView.setUint32(16, dataOffset, false);
    bigView.setUint32(20, bmp.length, false);
    big.set(pathBytes, 24);
    big[dataOffset - 1] = 0;
    big.set(bmp, dataOffset);
    const root = await navigator.storage.getDirectory();
    const fixture = await root.getDirectoryHandle("launcher-polish-fixture", { create: true });
    const handle = await fixture.getFileHandle("EnglishZH.big", { create: true });
    const writer = await handle.createWritable();
    await writer.write(big);
    await writer.close();
    const archives = [{
      name: "EnglishZH.big",
      bytes: big.length,
      entryCount: 1,
      opfsPath: "launcher-polish-fixture/EnglishZH.big",
    }];
    const module = await import("./launcher-retail-presentation.mjs");
    const key = module.retailPresentationKey(archives);
    window.ZeroHAssetLibrary.preparedArchives = archives;
    const applied = await window.ZeroHDesktop.refreshRetailPresentation(key);
    document.querySelector("[data-game-shortcut]").hidden = false;
    window.ZeroHDesktop.openApp("programs");
    return {
      key,
      source: applied?.source,
      visibleImages: [...document.querySelectorAll("[data-retail-presentation]")]
        .filter((image) => !image.hidden && image.src.startsWith("blob:")).length,
      decoratedSurfaces: document.querySelectorAll(".has-retail-art").length,
      networkPrimitive: /\bfetch\s*\(/.test(module.extractRetailPresentationFromBig.toString()),
    };
  });
  assert.equal(presentation.source, "user-owned retail archive");
  assert.equal(presentation.visibleImages, 3);
  assert.equal(presentation.decoratedSurfaces, 3);
  assert.equal(presentation.networkPrimitive, false);
  const derivedShot = join(shotDir, "user-owned-derived-art.png");
  await page.screenshot({ path: derivedShot });
  const origin = new URL(baseUrl).origin;
  const externalRequests = localRequests.filter((url) => !url.startsWith(origin) && !url.startsWith(`blob:${origin}`));
  assert.deepEqual(externalRequests, [],
    `retail art derivation must not upload or fetch outside the launcher origin: ${externalRequests.join(", ")}`);
  await context.close();

  const mobileContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await mobile.locator(".ownership-help details").first().click();
  assert.equal(await mobile.locator(".wizard-main").evaluate((node) => node.scrollHeight > node.clientHeight), true);
  const mobileOnboardingShot = join(shotDir, "mobile-ownership-onboarding.png");
  await mobile.screenshot({ path: mobileOnboardingShot });
  await mobile.getByRole("button", { name: "Game & Display settings" }).first().click();
  assert.equal(await mobile.locator("#gamePanel").isVisible(), true);
  assert.equal(await mobile.locator(".settings-nav").evaluate((node) => getComputedStyle(node).display), "flex");
  const mobileShot = join(shotDir, "mobile-game-settings.png");
  await mobile.screenshot({ path: mobileShot });
  await mobileContext.close();

  const shortContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1024, height: 500 } });
  const short = await shortContext.newPage();
  await short.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await short.locator("#startButton").click();
  const startBox = await short.locator("#startMenu").boundingBox();
  assert.ok(startBox && startBox.y >= 0 && startBox.y + startBox.height <= 500);
  assert.equal(await short.getByRole("button", { name: "Game & Display", exact: true }).isVisible(), true);
  const shortShot = join(shotDir, "short-screen-start-menu.png");
  await short.screenshot({ path: shortShot });
  await shortContext.close();

  const shutdownContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 800, height: 600 } });
  await shutdownContext.route("https://github.com/electronicarts/CnC_Generals_Zero_Hour", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><title>Project source</title>",
  }));
  const shutdown = await shutdownContext.newPage();
  let closeAttempted = false;
  await shutdown.exposeFunction("markShutdownCloseAttempted", () => { closeAttempted = true; });
  await shutdown.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await shutdown.evaluate(() => {
    window.close = () => { void window.markShutdownCloseAttempted(); };
  });
  await shutdown.locator("#startButton").click();
  await shutdown.getByRole("button", { name: "Shut down" }).click();
  await shutdown.waitForURL("https://github.com/electronicarts/CnC_Generals_Zero_Hour");
  assert.equal(closeAttempted, true);
  await shutdownContext.close();

  process.stdout.write(`${JSON.stringify({
    ok: true,
    screenshots: { fallbackShot, settingsShot, derivedShot, mobileOnboardingShot, mobileShot, shortShot },
    presentation,
    projectUrl: "https://github.com/electronicarts/CnC_Generals_Zero_Hour",
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
