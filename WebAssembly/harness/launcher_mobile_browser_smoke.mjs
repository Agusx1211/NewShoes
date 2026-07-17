import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const shotDir = process.env.LAUNCHER_MOBILE_SHOTS || "/tmp/cnc-launcher-mobile";
const executablePath = process.env.LAUNCHER_MOBILE_BROWSER || undefined;
await mkdir(shotDir, { recursive: true });

const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
let browser;
const screenshots = {};

function assertInside(inner, outer, label) {
  assert.ok(inner.x >= outer.x - 1, `${label} must not overflow left: ${JSON.stringify({ inner, outer })}`);
  assert.ok(inner.y >= outer.y - 1, `${label} must not overflow top: ${JSON.stringify({ inner, outer })}`);
  assert.ok(inner.x + inner.width <= outer.x + outer.width + 1,
    `${label} must not overflow right: ${JSON.stringify({ inner, outer })}`);
  assert.ok(inner.y + inner.height <= outer.y + outer.height + 1,
    `${label} must not overflow bottom: ${JSON.stringify({ inner, outer })}`);
}

async function visibleRects(locator) {
  return locator.evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden";
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
}

async function assertTouchTargets(locator, label, minimum = 44) {
  const rects = await visibleRects(locator);
  assert.ok(rects.length > 0, `${label} must expose at least one visible target`);
  rects.forEach((rect, index) => {
    assert.ok(rect.width >= minimum && rect.height >= minimum,
      `${label} target ${index + 1} must be at least ${minimum}px: ${JSON.stringify(rect)}`);
  });
  return rects;
}

const phoneProfiles = [
  { name: "phone-portrait", width: 390, height: 844, startColumns: 2, taskLabels: false },
  { name: "phone-landscape", width: 844, height: 390, startColumns: 5, taskLabels: true },
];

try {
  browser = await chromium.launch({ executablePath, headless: true });
  for (const profile of phoneProfiles) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(new URL("harness/play.html", server.url).href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.ZeroHDesktop));

    const shell = await page.evaluate(() => ({
      coarsePointer: matchMedia("(pointer: coarse)").matches,
      taskbarHeight: getComputedStyle(document.documentElement).getPropertyValue("--taskbar-height").trim(),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    assert.equal(shell.coarsePointer, true, `${profile.name} must exercise coarse-pointer layout`);
    assert.equal(shell.taskbarHeight, "50px", `${profile.name} must activate the phone taskbar`);
    assert.ok(shell.horizontalOverflow <= 1, `${profile.name} must not overflow horizontally: ${JSON.stringify(shell)}`);

    const viewport = { x: 0, y: 0, width: profile.width, height: profile.height };
    const taskbar = await page.locator(".taskbar").boundingBox();
    const launcherWindow = await page.locator("#setupWindow").boundingBox();
    assert.ok(taskbar && launcherWindow);
    assertInside(taskbar, viewport, `${profile.name} taskbar`);
    assertInside(launcherWindow, { ...viewport, height: taskbar.y }, `${profile.name} launcher window`);
    await assertTouchTargets(page.locator("#setupWindow .window-controls button"), `${profile.name} window controls`);
    assert.equal(await page.locator('#setupWindow [data-window-action="maximize"]').isHidden(), true,
      `${profile.name} must hide meaningless maximize chrome`);

    const launcherShot = resolve(shotDir, `${profile.name}-launcher.png`);
    await page.screenshot({ path: launcherShot });
    screenshots[`${profile.name}Launcher`] = launcherShot;

    await page.locator('#setupWindow [data-window-action="close"]').tap();
    const desktopArea = { ...viewport, height: taskbar.y };
    const iconRects = await visibleRects(page.locator(".desktop-icon"));
    assert.ok(iconRects.length >= 13, `${profile.name} must expose every installed desktop shortcut`);
    iconRects.forEach((rect, index) => {
      assertInside(rect, desktopArea, `${profile.name} desktop shortcut ${index + 1}`);
      assert.ok(rect.height >= 80, `${profile.name} desktop shortcut ${index + 1} must be touch sized`);
    });

    await page.locator("#startButton").tap();
    await page.waitForTimeout(180);
    const startMenu = await page.locator("#startMenu").boundingBox();
    assert.ok(startMenu);
    assertInside(startMenu, desktopArea, `${profile.name} Start menu`);
    const startColumns = await page.locator(".start-primary").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length);
    assert.equal(startColumns, profile.startColumns, `${profile.name} must use the expected app grid`);
    const startContentFits = await page.locator(".start-content").evaluate((element) =>
      element.scrollHeight <= element.clientHeight + 1);
    assert.equal(startContentFits, true, `${profile.name} must expose all Start actions without scrolling`);
    await assertTouchTargets(page.locator(".start-primary button"), `${profile.name} primary Start actions`);
    await assertTouchTargets(page.locator(".start-secondary > button"), `${profile.name} secondary Start actions`);
    const primaryFontSize = await page.locator(".start-primary strong").first().evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize));
    assert.ok(primaryFontSize >= 11, `${profile.name} app names must remain readable`);

    const drawerShot = resolve(shotDir, `${profile.name}-app-drawer.png`);
    await page.screenshot({ path: drawerShot });
    screenshots[`${profile.name}Drawer`] = drawerShot;

    await page.locator('.start-secondary [data-open="settings"]').tap();
    await page.waitForSelector("#settingsWindow.is-open.is-active");
    assert.equal(await page.locator("#startMenu").isHidden(), true);
    assert.equal(await page.locator(".settings-nav").evaluate((element) => getComputedStyle(element).display), "flex");
    await assertTouchTargets(page.locator(".settings-nav button"), `${profile.name} settings tabs`);

    await page.locator("#startButton").tap();
    await page.waitForTimeout(180);
    await page.locator('.start-primary [data-open="explorer"]').tap();
    await page.waitForSelector("#explorerWindow.is-open.is-active");
    const taskButtons = page.locator("#taskButtons .task-button");
    assert.equal(await taskButtons.count(), 2, `${profile.name} taskbar must track both open apps`);
    assert.deepEqual(await taskButtons.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))),
      ["My Files", "Project New Shoes Settings"],
      `${profile.name} task buttons must retain accessible app names`);
    await assertTouchTargets(taskButtons, `${profile.name} task switcher`);
    const labelDisplay = await taskButtons.first().locator("span").evaluate((element) => getComputedStyle(element).display);
    assert.equal(labelDisplay === "none", !profile.taskLabels,
      `${profile.name} task labels must match the available width`);
    await page.getByRole("button", { name: "Project New Shoes Settings", exact: true }).tap();
    assert.equal(await page.locator("#settingsWindow").evaluate((element) => element.classList.contains("is-active")), true,
      `${profile.name} task switcher must restore Settings`);

    const navigationShot = resolve(shotDir, `${profile.name}-settings.png`);
    await page.screenshot({ path: navigationShot });
    screenshots[`${profile.name}Settings`] = navigationShot;
    assert.deepEqual(pageErrors, [], `${profile.name} must not raise page errors`);
    await context.close();
  }

  process.stdout.write(`${JSON.stringify({ ok: true, screenshots }, null, 2)}\n`);
} finally {
  await browser?.close();
  await server.close();
}
