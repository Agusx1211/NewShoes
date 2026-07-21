#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/webxr-launcher");
const screenshotPath = resolve(wasmRoot, "artifacts/screenshots/webxr-launcher-settings.png");
await rm(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });
await mkdir(dirname(screenshotPath), { recursive: true });

const server = await startStaticServer({ root: wasmRoot, port: 0, host: "0.0.0.0" });
const browser = await chromium.launchPersistentContext(profileDir, {
  viewport: { width: 1280, height: 800 },
});

async function openVrSetting(page) {
  await page.click('.desktop-icon[data-open="settings"]');
  await page.click("#gameTab");
  await page.waitForSelector("#webXrButton", { state: "visible" });
}

async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((control, next) => {
    control.value = String(next);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

try {
  const page = await browser.newPage();
  await page.goto(new URL("harness/play.html?dist=dist-threaded", server.url).href,
    { waitUntil: "load" });
  await openVrSetting(page);
  await page.selectOption("#webXrDominantHand", "left");
  await page.selectOption("#webXrRotationMode", "stepped");
  await page.uncheck("#webXrMotionVignette");
  await setRange(page, "#webXrStickDeadzone", 0.7);
  await setRange(page, "#webXrWorldScale", 1.25);
  await setRange(page, "#webXrPanelWidth", 1.9);
  await setRange(page, "#webXrPanelDistance", 2);
  await setRange(page, "#webXrHeightOffset", 0.25);
  const desktop = await page.evaluate(() => ({
    button: document.querySelector("#webXrButton")?.textContent,
    moduleLoaded: window.CnCPort?.state?.webxr?.moduleLoaded,
    requested: window.CnCPort?.state?.webxr?.rendererTransport?.requested,
  }));
  assert.deepEqual(desktop, {
    button: "Prepare VR",
    moduleLoaded: false,
    requested: false,
  }, "ordinary desktop load must not probe or import WebXR");

  await page.addInitScript(() => {
    globalThis.__webXrLauncherRequestSessionCalls = 0;
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: {
        isSessionSupported: async (mode) => mode === "immersive-vr",
        requestSession() {
          globalThis.__webXrLauncherRequestSessionCalls += 1;
          throw new Error("launcher smoke must not request a session during probe");
        },
      },
    });
    globalThis.XRWebGLLayer = class FakeXRWebGLLayer {};
  });
  await page.click("#webXrButton");
  await page.waitForURL((url) => url.searchParams.get("vr") === "1");
  await openVrSetting(page);
  const persisted = await page.evaluate(() => ({
    dominantHand: document.querySelector("#webXrDominantHand")?.value,
    rotationMode: document.querySelector("#webXrRotationMode")?.value,
    motionVignette: document.querySelector("#webXrMotionVignette")?.checked,
    stickDeadzone: document.querySelector("#webXrStickDeadzone")?.value,
    worldScale: document.querySelector("#webXrWorldScale")?.value,
    panelWidth: document.querySelector("#webXrPanelWidth")?.value,
    panelDistance: document.querySelector("#webXrPanelDistance")?.value,
    heightOffset: document.querySelector("#webXrHeightOffset")?.value,
  }));
  assert.deepEqual(persisted, {
    dominantHand: "left",
    rotationMode: "stepped",
    motionVignette: false,
    stickDeadzone: "0.7",
    worldScale: "1.25",
    panelWidth: "1.9",
    panelDistance: "2",
    heightOffset: "0.25",
  }, "VR comfort settings must persist across the opt-in reload");
  await page.waitForFunction(() => document.querySelector("#webXrButton")?.textContent
    === "Check headset");
  const prepared = await page.evaluate(() => ({
    moduleLoaded: window.CnCPort?.state?.webxr?.moduleLoaded,
    requested: window.CnCPort?.state?.webxr?.rendererTransport?.requested,
  }));
  assert.deepEqual(prepared, { moduleLoaded: false, requested: true },
    "the opt-in render lane must still wait for an explicit headset check");

  await page.click("#webXrButton");
  await page.waitForFunction(() => {
    const button = document.querySelector("#webXrButton");
    return button?.textContent === "Enter & launch VR" && button.disabled === false;
  }, null, { timeout: 60000 });
  await page.locator("#settingsWindow").screenshot({ path: screenshotPath });
  const ready = await page.evaluate(() => ({
    button: document.querySelector("#webXrButton")?.textContent,
    moduleLoaded: window.CnCPort?.state?.webxr?.moduleLoaded,
    phase: window.CnCPort?.state?.webxr?.phase,
    rendererReady: window.CnCPort?.state?.webxr?.renderer !== null,
    comfort: window.CnCPort?.state?.webxr?.renderer?.comfort,
    requestSessionCalls: globalThis.__webXrLauncherRequestSessionCalls,
  }));
  assert.deepEqual(ready, {
    button: "Enter & launch VR",
    moduleLoaded: true,
    phase: "ready",
    rendererReady: true,
    comfort: {
      worldScale: 1.25,
      panelWidthMeters: 1.9,
      panelDistanceMeters: 2,
      heightOffsetMeters: 0.25,
      dominantHand: "left",
      rotationMode: "stepped",
      motionVignette: false,
      stickDeadzone: 0.7,
      stickReleaseThreshold: 0.5,
    },
    requestSessionCalls: 0,
  }, "headset discovery may prepare rendering but must not consume immersive user activation");

  await page.click("#webXrButton");
  await page.waitForFunction(() => globalThis.__webXrLauncherRequestSessionCalls === 1);
  assert.equal(await page.evaluate(() => globalThis.__webXrLauncherRequestSessionCalls), 1,
    "the explicit Enter & launch click must be the operation that requests immersive-vr");

  console.log(`WebXR launcher smoke: PASS (${screenshotPath})`);
} finally {
  await browser.close();
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}
