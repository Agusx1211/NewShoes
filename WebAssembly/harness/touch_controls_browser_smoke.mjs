import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const wasmRoot = resolve(new URL("..", import.meta.url).pathname);
const screenshotRoot = process.env.TOUCH_CONTROLS_SHOTS || "/tmp/newshoes-touch-controls";
const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto(new URL("harness/play.html", server.url).href, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.CnCPort?.getTouchControlsState));
  await page.evaluate(() => {
    const overlay = document.querySelector("#launchOverlay");
    overlay.hidden = false;
    overlay.classList.add("is-running");
    document.querySelector("#launchLoader").hidden = true;
    document.querySelector("#viewport").hidden = false;
  });

  assert.equal(await page.locator("#touchControls").isVisible(), true,
    "touch-capable browsers must expose the game controls");
  assert.equal(await page.locator("[data-touch-guide]").isVisible(), true,
    "the gesture guide must be discoverable on first use");
  const toolbarGeometry = await page.locator(".touchToolbar button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }));
  assert.ok(toolbarGeometry.every(({ width, height }) => width >= 48 && height >= 48),
    `primary touch targets are too small: ${JSON.stringify(toolbarGeometry)}`);

  await page.locator("[data-touch-action='dismiss-help']").click();
  await page.locator(".touchToolbar [data-touch-action='keys']").click();
  assert.equal(await page.locator("[data-touch-key-panel]").isVisible(), true);
  assert.equal(await page.locator("[data-touch-key='KeyA']").count(), 1);
  assert.equal(await page.locator("[data-touch-key='F12']").count(), 1);
  assert.equal(await page.locator("[data-touch-key='NumpadEnter']").count(), 1);
  await mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({ path: resolve(screenshotRoot, "iphone-portrait-keys.png") });
  await page.locator(".touchKeyPanel [data-touch-action='keys']").click();

  const stableGeometry = await page.evaluate(() => {
    const overlay = document.querySelector("#launchOverlay").getBoundingClientRect();
    const canvas = document.querySelector("#viewport").getBoundingClientRect();
    return { overlayHeight: overlay.height, canvasHeight: canvas.height };
  });
  await page.locator("[data-touch-action='type']").click();
  assert.equal(await page.locator("#touchTextInput").evaluate((node) =>
    document.activeElement === node), true);
  assert.equal(await page.evaluate(() =>
    document.documentElement.classList.contains("touch-keyboard-open")), true);
  await page.setViewportSize({ width: 390, height: 560 });
  await page.waitForTimeout(50);
  const frozenGeometry = await page.evaluate(() => {
    const overlay = document.querySelector("#launchOverlay").getBoundingClientRect();
    const canvas = document.querySelector("#viewport").getBoundingClientRect();
    return { overlayHeight: overlay.height, canvasHeight: canvas.height };
  });
  assert.deepEqual(frozenGeometry, stableGeometry,
    "opening a virtual keyboard must not resize the desktop or game canvas");
  await page.screenshot({ path: resolve(screenshotRoot, "iphone-keyboard-layout-frozen.png") });
  await page.locator("[data-touch-text-done]").click();
  await page.waitForTimeout(50);
  await page.locator("[data-touch-action='type']").click();
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() =>
    document.documentElement.classList.contains("touch-keyboard-open")), true,
    "reopening during delayed viewport cleanup must preserve the frozen layout");
  assert.notEqual(await page.evaluate(() =>
    document.documentElement.style.getPropertyValue("--touch-frozen-viewport-height")), "");
  await page.locator("[data-touch-text-done]").click();
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() =>
    document.documentElement.classList.contains("touch-keyboard-open")), false);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(100);
  assert.equal(await page.locator("#touchControls").isVisible(), true);
  await page.screenshot({ path: resolve(screenshotRoot, "ipad-landscape-touch-controls.png") });
  await page.evaluate(() => {
    const state = window.CnCPort.state;
    state.engineDisplaySize = { width: 844, height: 390 };
    state.touchUi = {
      ok: true,
      focusedInputMode: "numeric",
      entries: [{
        rect: { x: 100, y: 100, width: 180, height: 54 },
        inputMode: "numeric",
        focused: true,
      }],
    };
    const canvas = document.querySelector("#viewport");
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + 190;
    const clientY = rect.top + 127;
    const dispatch = (type, timeStamp) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 77,
      pointerType: "touch",
      clientX,
      clientY,
      timeStamp,
      isPrimary: true,
    }));
    dispatch("pointerdown", 10);
    dispatch("pointerup", 30);
  });
  await page.waitForFunction(() => document.activeElement?.id === "touchTextInput");
  assert.equal(await page.locator("#touchTextInput").getAttribute("inputmode"), "numeric",
    "tapping an engine numeric entry should synchronously request the numeric keyboard");
  const textBarState = await page.locator("#touchTextBar").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      hidden: node.hidden,
      display: getComputedStyle(node).display,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      rootRect: (() => {
        const root = document.querySelector("#touchControls").getBoundingClientRect();
        return { x: root.x, y: root.y, width: root.width, height: root.height };
      })(),
      frozenHeight: getComputedStyle(document.documentElement)
        .getPropertyValue("--touch-frozen-viewport-height"),
      inset: getComputedStyle(document.documentElement).getPropertyValue("--touch-keyboard-inset"),
    };
  });
  assert.equal(await page.locator("#touchTextBar").isVisible(), true,
    `the native numeric input proxy should stay visible above the virtual keyboard: ${JSON.stringify(textBarState)}`);
  await page.screenshot({ path: resolve(screenshotRoot, "ipad-landscape-numeric-entry.png") });

  console.log(`touch controls browser: ok (${screenshotRoot})`);
} finally {
  await browser.close();
  await server.close();
}
