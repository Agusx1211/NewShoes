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
    const iconSize = 32;
    const iconPixels = iconSize * iconSize * 4;
    const iconMask = iconSize * Math.ceil(iconSize / 32) * 4;
    const iconFrame = new Uint8Array(40 + iconPixels + iconMask);
    const iconFrameView = new DataView(iconFrame.buffer);
    iconFrameView.setUint32(0, 40, true);
    iconFrameView.setInt32(4, iconSize, true);
    iconFrameView.setInt32(8, iconSize * 2, true);
    iconFrameView.setUint16(12, 1, true);
    iconFrameView.setUint16(14, 32, true);
    iconFrameView.setUint32(20, iconPixels, true);
    for (let offset = 40; offset < 40 + iconPixels; offset += 4) {
      iconFrame[offset] = 0x35;
      iconFrame[offset + 1] = 0x72;
      iconFrame[offset + 2] = 0xe0;
      iconFrame[offset + 3] = 0xff;
    }
    const icon = new Uint8Array(22 + iconFrame.length);
    const iconView = new DataView(icon.buffer);
    iconView.setUint16(2, 1, true);
    iconView.setUint16(4, 1, true);
    icon[6] = iconSize;
    icon[7] = iconSize;
    iconView.setUint16(10, 1, true);
    iconView.setUint16(12, 32, true);
    iconView.setUint32(14, iconFrame.length, true);
    iconView.setUint32(18, 22, true);
    icon.set(iconFrame, 22);
    const module = await import("./launcher-retail-presentation.mjs");
    const key = module.retailPresentationKey(archives);
    window.ZeroHAssetLibrary.preparedArchives = archives;
    window.ZeroHAssetLibrary.presentationIconCandidate = {
      blob: new Blob([icon], { type: "image/x-icon" }),
      name: "GeneralsZH.ico",
    };
    const applied = await window.ZeroHDesktop.refreshRetailPresentation(key);
    document.querySelector("[data-game-shortcut]").hidden = false;
    window.ZeroHDesktop.openApp("programs");
    const iconImages = [...document.querySelectorAll("[data-retail-icon]")]
      .filter((image) => !image.hidden && image.src.startsWith("blob:"));
    const cached = await window.ZeroHAssetLibrary.presentationForLibrary(key, { cache: true });
    return {
      key,
      source: applied?.source,
      iconSource: document.documentElement.dataset.retailIconSource,
      visibleBanners: [...document.querySelectorAll("[data-retail-banner]")]
        .filter((image) => !image.hidden && image.src.startsWith("blob:")).length,
      visibleIcons: iconImages.length,
      iconDimensions: iconImages.map((image) => [image.naturalWidth, image.naturalHeight]),
      iconObjectFit: iconImages.map((image) => getComputedStyle(image).objectFit),
      decoratedSurfaces: document.querySelectorAll(".has-retail-art").length,
      cachedIcon: cached?.iconBlob instanceof Blob && cached.iconImage?.width === 32,
      networkPrimitive: /\bfetch\s*\(/.test(module.extractRetailPresentationFromBig.toString()),
    };
  });
  assert.equal(presentation.source, "user-owned retail archive");
  assert.equal(presentation.iconSource, "user-owned retail icon");
  assert.equal(presentation.visibleBanners, 1);
  assert.equal(presentation.visibleIcons, 2);
  assert.deepEqual(presentation.iconDimensions, [[32, 32], [32, 32]]);
  assert.deepEqual(presentation.iconObjectFit, ["contain", "contain"]);
  assert.equal(presentation.decoratedSurfaces, 3);
  assert.equal(presentation.cachedIcon, true);
  assert.equal(presentation.networkPrimitive, false);
  const derivedShot = join(shotDir, "user-owned-derived-art.png");
  await page.screenshot({ path: derivedShot });
  const origin = new URL(baseUrl).origin;
  const externalRequests = localRequests.filter((url) => !url.startsWith(origin) && !url.startsWith(`blob:${origin}`));
  assert.deepEqual(externalRequests, [],
    `retail art derivation must not upload or fetch outside the launcher origin: ${externalRequests.join(", ")}`);
  const reset = await page.evaluate(async () => {
    await window.ZeroHAssetLibrary.forget();
    await window.ZeroHDesktop.refreshRetailPresentation(null);
    return {
      visibleIcons: document.querySelectorAll("[data-retail-icon]:not([hidden])").length,
      visibleBanners: document.querySelectorAll("[data-retail-banner]:not([hidden])").length,
      decoratedSurfaces: document.querySelectorAll(".has-retail-art").length,
      iconSource: document.documentElement.dataset.retailIconSource || null,
    };
  });
  assert.deepEqual(reset, { visibleIcons: 0, visibleBanners: 0, decoratedSurfaces: 0, iconSource: null });
  await context.close();

  const githubContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1024, height: 768 } });
  await githubContext.route("https://github.com/Agusx1211/NewShoes", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><title>Project New Shoes on GitHub</title>",
  }));
  const githubPage = await githubContext.newPage();
  await githubPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const githubShortcut = githubPage.locator("[data-github-shortcut]");
  await githubShortcut.waitFor({ state: "visible" });
  assert.equal(await githubShortcut.getAttribute("href"), "https://github.com/Agusx1211/NewShoes");
  assert.equal(await githubShortcut.getAttribute("target"), "_blank");
  assert.equal(await githubShortcut.getAttribute("rel"), "noopener noreferrer");
  assert.equal(await githubShortcut.getByText("GitHub Repository", { exact: true }).isVisible(), true);
  assert.equal(await githubShortcut.locator('use[href="#i-github"]').count(), 1);
  await githubShortcut.focus();
  const popupPromise = githubPage.waitForEvent("popup");
  await githubShortcut.press("Enter");
  const githubPopup = await popupPromise;
  await githubPopup.waitForLoadState("domcontentloaded");
  assert.equal(githubPopup.url(), "https://github.com/Agusx1211/NewShoes");
  await githubContext.close();

  const mobileContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const mobileGithubBox = await mobile.locator("[data-github-shortcut]").boundingBox();
  assert.ok(mobileGithubBox && mobileGithubBox.x >= 0 && mobileGithubBox.x + mobileGithubBox.width <= 390);
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
  await shutdownContext.route("https://github.com/Agusx1211/NewShoes", (route) => route.fulfill({
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
  await shutdown.waitForURL("https://github.com/Agusx1211/NewShoes");
  assert.equal(closeAttempted, true);
  await shutdownContext.close();

  process.stdout.write(`${JSON.stringify({
    ok: true,
    screenshots: { fallbackShot, settingsShot, derivedShot, mobileOnboardingShot, mobileShot, shortShot },
    presentation,
    projectUrl: "https://github.com/Agusx1211/NewShoes",
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
