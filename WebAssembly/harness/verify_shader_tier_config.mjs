#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createD3D8Executor } from "./d3d8_executor.mjs";
import { startStaticServer } from "./static-server.mjs";
import {
  DEFAULT_SHADER_TIER,
  resolveShaderTier,
} from "./shader-tier-config.mjs";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = process.env.CNC_PROBE_OUT ?? "/tmp/cnc-shader-tier-default";
mkdirSync(outputDir, { recursive: true });

assert.equal(DEFAULT_SHADER_TIER, "ps11");
assert.deepEqual(resolveShaderTier(), { tier: "ps11", source: "default" });
assert.deepEqual(resolveShaderTier({ storedTier: "ff" }), {
  tier: "ff",
  source: "localStorage",
});
assert.deepEqual(resolveShaderTier({ search: "?shaderTier=ff", storedTier: "ps11" }), {
  tier: "ff",
  source: "url",
});
assert.deepEqual(resolveShaderTier({ search: "?shaderTier=ps11", storedTier: "ff" }), {
  tier: "ps11",
  source: "url",
});
assert.deepEqual(resolveShaderTier({
  forcedTier: "ff",
  search: "?shaderTier=ps11",
  storedTier: "ps11",
}), { tier: "ff", source: "forced" });
assert.deepEqual(resolveShaderTier({ search: "?shaderTier=unknown", storedTier: "unknown" }), {
  tier: "ps11",
  source: "default",
});

const executorState = { canvas: {}, graphics: {} };
const executor = createD3D8Executor({
  canvas: {
    width: 1,
    height: 1,
    addEventListener() {},
    getContext() { return null; },
  },
  gl: null,
  fallbackContext: null,
  log() {},
  state: executorState,
});
delete globalThis.__cncD3D8ShaderTier;
assert.equal(executor.hooks.cncPortD3D8ShaderTier(), 1);
assert.deepEqual(globalThis.__cncD3D8ShaderTierLast, { tier: 1, source: "default" });
globalThis.__cncD3D8ShaderTier = "ff";
assert.equal(executor.hooks.cncPortD3D8ShaderTier(), 0);
assert.deepEqual(globalThis.__cncD3D8ShaderTierLast, { tier: 0, source: "forced" });
delete globalThis.__cncD3D8ShaderTier;

const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launch({ headless: true });

async function readPlaySelection({ storedTier = null, urlTier = null, screenshot = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (storedTier) {
    await context.addInitScript((tier) => localStorage.setItem("cncPortShaderTier", tier), storedTier);
  }
  const page = await context.newPage();
  const url = new URL("harness/play.html", server.url);
  url.searchParams.set("dist", "dist-threaded-release");
  if (urlTier) {
    url.searchParams.set("shaderTier", urlTier);
  }
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.CnCPort?.play?.getShaderTier === "function");
  const result = await page.evaluate(() => ({
    effective: window.CnCPort.play.getShaderTier(),
    configured: window.CnCPort.play.getConfiguration().shaderTier,
    selected: document.querySelector("#shaderTierSelect")?.value ?? null,
  }));
  if (screenshot) {
    await page.click('[data-open="settings"]');
    await page.click('[data-settings-tab="game"]');
    await page.locator("#settingsWindow").screenshot({ path: resolve(outputDir, screenshot) });
  }
  await context.close();
  return result;
}

try {
  assert.deepEqual(await readPlaySelection({ screenshot: "pixel-shaders-default-settings.png" }), {
    effective: "ps11",
    configured: "ps11",
    selected: "ps11",
  });
  assert.deepEqual(await readPlaySelection({ storedTier: "ff" }), {
    effective: "ff",
    configured: "ff",
    selected: "ff",
  });
  assert.deepEqual(await readPlaySelection({ storedTier: "ff", urlTier: "ps11" }), {
    effective: "ps11",
    configured: "ps11",
    selected: "ps11",
  });
  assert.deepEqual(await readPlaySelection({ storedTier: "ps11", urlTier: "ff" }), {
    effective: "ff",
    configured: "ff",
    selected: "ff",
  });
  console.error(`[shader-tier-config] PASS screenshot=${resolve(outputDir, "pixel-shaders-default-settings.png")}`);
} finally {
  await browser.close();
  await server.close();
}
