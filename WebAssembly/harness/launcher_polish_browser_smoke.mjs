import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.LAUNCHER_POLISH_URL || "https://127.0.0.1:8457/harness/play.html";
const executablePath = process.env.LAUNCHER_POLISH_BROWSER
  || "/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome";
const shotDir = process.env.LAUNCHER_POLISH_SHOTS || "/tmp/cnc-launcher-polish";
await mkdir(shotDir, { recursive: true });

async function assertTaskbarInVisibleViewport(page, label) {
  const geometry = await page.evaluate(() => {
    const desktop = document.querySelector("#desktop").getBoundingClientRect();
    const taskbar = document.querySelector(".taskbar").getBoundingClientRect();
    const viewport = window.visualViewport;
    return {
      desktop: { top: desktop.top, bottom: desktop.bottom, height: desktop.height },
      taskbar: { top: taskbar.top, bottom: taskbar.bottom, height: taskbar.height },
      visibleTop: viewport?.offsetTop ?? 0,
      visibleBottom: (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight),
      innerHeight: window.innerHeight,
      dynamicViewportUnits: CSS.supports("height", "100dvh"),
    };
  });
  assert.ok(geometry.taskbar.top >= geometry.visibleTop - 1,
    `${label} taskbar must start inside the visible viewport: ${JSON.stringify(geometry)}`);
  assert.ok(geometry.taskbar.bottom <= geometry.visibleBottom + 1,
    `${label} taskbar must end inside the visible viewport: ${JSON.stringify(geometry)}`);
  assert.ok(Math.abs(geometry.taskbar.bottom - geometry.desktop.bottom) <= 1,
    `${label} taskbar must remain attached to the desktop bottom: ${JSON.stringify(geometry)}`);
  return geometry;
}

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

  const compatibilityChooserPromise = page.waitForEvent("filechooser");
  await page.locator("#pickFolderFallbackButton").click();
  const compatibilityChooser = await compatibilityChooserPromise;
  assert.equal(compatibilityChooser.isMultiple(), true,
    "the compatibility action must open the recursive folder input");

  const steamFolderScan = await page.evaluate(async () => {
    function writeU32be(bytes, offset, value) {
      bytes[offset] = value >>> 24;
      bytes[offset + 1] = value >>> 16;
      bytes[offset + 2] = value >>> 8;
      bytes[offset + 3] = value;
    }
    function syntheticBig(paths) {
      const encoder = new TextEncoder();
      const entries = paths.map((path) => ({ path: encoder.encode(path), data: new Uint8Array([1, 2, 3, 4]) }));
      const dataStart = 16 + entries.reduce((sum, entry) => sum + 9 + entry.path.length, 0);
      const bytes = new Uint8Array(dataStart + entries.length * 4);
      const view = new DataView(bytes.buffer);
      bytes.set(encoder.encode("BIGF"));
      view.setUint32(4, bytes.length, true);
      writeU32be(bytes, 8, entries.length);
      let directoryCursor = 16;
      let dataCursor = dataStart;
      for (const entry of entries) {
        writeU32be(bytes, directoryCursor, dataCursor);
        writeU32be(bytes, directoryCursor + 4, entry.data.length);
        bytes.set(entry.path, directoryCursor + 8);
        directoryCursor += 9 + entry.path.length;
        bytes.set(entry.data, dataCursor);
        dataCursor += entry.data.length;
      }
      return bytes;
    }
    function sourceFile(path, bytes) {
      const file = new File([bytes], path.split("/").pop());
      Object.defineProperty(file, "relativePath", { value: path });
      return file;
    }
    const root = "Command & Conquer Generals - Zero Hour";
    const baseRoot = `${root}/ZH_Generals`;
    const files = [];
    for (const spec of window.ZeroHArchiveSpecs) {
      if (spec.name === "LooseScripts.big") continue;
      const path = spec.name === "Gensec.big" ? `${baseRoot}/gensec.big`
        : spec.name.startsWith("ZZBase_") ? `${baseRoot}/${spec.sourceName}`
        : `${root}/${spec.sourceName}`;
      files.push(sourceFile(path, syntheticBig(
        spec.requiredEntries.length ? spec.requiredEntries : ["Data\\placeholder.bin"])),
      );
    }
    for (const name of ["SkirmishScripts.scb", "MultiplayerScripts.scb", "Scripts.ini"]) {
      files.push(sourceFile(`${root}/Data/Scripts/${name}`, new Uint8Array([1, 2, 3, 4])));
    }
    const bink = new Uint8Array(64);
    bink.set(new TextEncoder().encode("BIKi"));
    files.push(sourceFile(`${root}/Data/English/Movies/EA_LOGO.BIK`, bink));
    files.push(sourceFile(`${root}/PatchZH.big`, new Uint8Array([0, 1, 2, 3])));
    const result = await window.ZeroHAssetLibrary.scan(files);
    window.ZeroHAssetLibrary.includeVideos = true;
    const prepared = await window.ZeroHAssetLibrary.prepare("once");
    return {
      ok: result.ok,
      missing: result.missing,
      errors: result.errors,
      gensec: result.found.find((entry) => entry.name === "Gensec.big"),
      scripts: result.found.find((entry) => entry.name === "LooseScripts.big"),
      videoCount: result.videoCount,
      videoBytes: result.videoBytes,
      preparedVideos: prepared.videos,
    };
  });
  assert.equal(steamFolderScan.ok, true);
  assert.deepEqual(steamFolderScan.missing, []);
  assert.deepEqual(steamFolderScan.errors, []);
  assert.match(steamFolderScan.gensec?.source || "", /ZH_Generals\/gensec\.big$/);
  assert.equal(steamFolderScan.scripts?.sourceName, "loose installer scripts");
  assert.equal(steamFolderScan.videoCount, 1);
  assert.equal(steamFolderScan.videoBytes, 64);
  assert.equal(steamFolderScan.preparedVideos?.length, 1);
  assert.match(steamFolderScan.preparedVideos?.[0]?.opfsPath || "", /\/movies\/EA_LOGO\.BIK$/);
  await page.evaluate(() => {
    document.querySelectorAll("[data-wizard-page]").forEach((wizardPage) => {
      const visible = wizardPage.dataset.wizardPage === "2";
      wizardPage.classList.toggle("is-visible", visible);
      wizardPage.setAttribute("aria-hidden", String(!visible));
    });
  });
  const videoToggle = page.locator("#includeVideosToggle");
  assert.equal(await videoToggle.isChecked(), false,
    "optional videos must be disabled by default");
  await page.locator(".option-tooltip").hover();
  await page.locator("#includeVideosTooltip").waitFor({ state: "visible" });
  assert.match(await page.locator("#includeVideosTooltip").textContent(), /0\.9 GB.*longer/i,
    "the video option tooltip must explain its storage/time tradeoff");
  await page.locator(".optional-content-copy").click();
  assert.equal(await videoToggle.isChecked(), true,
    "the optional-video install choice must be selectable");
  await page.locator(".optional-content-copy").click();
  assert.equal(await videoToggle.isChecked(), false,
    "the optional-video install choice must return to its default-off state");
  await page.locator(".option-tooltip").hover();
  await page.waitForTimeout(200);
  const videoOptionShot = join(shotDir, "optional-video-install-choice.png");
  await page.screenshot({ path: videoOptionShot });
  await page.evaluate(() => {
    document.querySelectorAll("[data-wizard-page]").forEach((wizardPage) => {
      const visible = wizardPage.dataset.wizardPage === "1";
      wizardPage.classList.toggle("is-visible", visible);
      wizardPage.setAttribute("aria-hidden", String(!visible));
    });
  });

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
  const expectSingleGithubPopup = async (activate, label) => {
    const initialPages = githubContext.pages().length;
    const popupPromise = githubContext.waitForEvent("page");
    await activate();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(githubContext.pages().length, initialPages + 1, `${label} must add exactly one page`);
    assert.equal(popup.url(), "https://github.com/Agusx1211/NewShoes");
    await popup.close();
  };
  await githubShortcut.focus();
  await expectSingleGithubPopup(() => githubShortcut.press("Enter"), "keyboard activation");
  await expectSingleGithubPopup(() => githubShortcut.dblclick(), "desktop double-click");
  await githubContext.close();

  const mobileGithubContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await mobileGithubContext.route("https://github.com/Agusx1211/NewShoes", (route) => route.fulfill({
    status: 200, contentType: "text/html", body: "<!doctype html><title>Project New Shoes on GitHub</title>",
  }));
  const mobileGithub = await mobileGithubContext.newPage();
  await mobileGithub.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await mobileGithub.locator('#setupWindow [data-window-action="close"]').click();
  const mobileGithubShortcut = mobileGithub.locator("[data-github-shortcut]");
  const mobilePopupPromise = mobileGithubContext.waitForEvent("page");
  await mobileGithubShortcut.tap();
  const mobilePopup = await mobilePopupPromise;
  await mobilePopup.waitForLoadState("domcontentloaded");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(mobileGithubContext.pages().length, 2, "one mobile tap must open exactly one tab");
  assert.equal(mobilePopup.url(), "https://github.com/Agusx1211/NewShoes");
  await mobileGithubContext.close();

  const mobileContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const phoneTaskbar = await assertTaskbarInVisibleViewport(mobile, "phone portrait");
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
  await mobile.setViewportSize({ width: 390, height: 664 });
  await mobile.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const phoneTaskbarWithBrowserChrome = await assertTaskbarInVisibleViewport(mobile, "phone with expanded browser chrome");
  const phoneTaskbarShot = join(shotDir, "mobile-taskbar-phone.png");
  await mobile.screenshot({ path: phoneTaskbarShot });
  await mobileContext.close();

  const tabletContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 834, height: 1112 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const tablet = await tabletContext.newPage();
  await tablet.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const tabletTaskbar = await assertTaskbarInVisibleViewport(tablet, "tablet portrait");
  await tablet.locator("#startButton").click();
  const tabletStartBox = await tablet.locator("#startMenu").boundingBox();
  assert.ok(tabletStartBox && tabletStartBox.y >= 0 && tabletStartBox.y + tabletStartBox.height <= 1112,
    `tablet Start menu must remain inside the visible viewport: ${JSON.stringify(tabletStartBox)}`);
  const tabletTaskbarShot = join(shotDir, "mobile-taskbar-tablet.png");
  await tablet.screenshot({ path: tabletTaskbarShot });
  await tabletContext.close();

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
    screenshots: {
      fallbackShot,
      videoOptionShot,
      settingsShot,
      derivedShot,
      mobileOnboardingShot,
      mobileShot,
      phoneTaskbarShot,
      tabletTaskbarShot,
      shortShot,
    },
    mobileTaskbar: { phoneTaskbar, phoneTaskbarWithBrowserChrome, tabletTaskbar },
    presentation,
    steamFolderScan,
    projectUrl: "https://github.com/Agusx1211/NewShoes",
  }, null, 2)}\n`);
} finally {
  await browser.close();
}
