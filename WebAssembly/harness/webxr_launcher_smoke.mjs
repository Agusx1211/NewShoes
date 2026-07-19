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

try {
  const page = await browser.newPage();
  await page.goto(new URL("harness/play.html?dist=dist-threaded", server.url).href,
    { waitUntil: "load" });
  await openVrSetting(page);
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
    requestSessionCalls: globalThis.__webXrLauncherRequestSessionCalls,
  }));
  assert.deepEqual(ready, {
    button: "Enter & launch VR",
    moduleLoaded: true,
    phase: "ready",
    rendererReady: true,
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
