#!/usr/bin/env node
/**
 * Verify that TheWin32Mouse is set in the real-engine-init path.
 *
 * Before the fix: TheWin32Mouse is NULL, so WndProc mouse cases silently drop.
 * After the fix: TheWin32Mouse = &browser_mouse(), so mouse events are dispatched.
 *
 * This test:
 * 1. Mounts range-backed (empty) archives
 * 2. Calls realEngineInit (the real-engine-init path)
 * 3. Probes originalWndProcInput to check mouse.attached
 *
 * Expected after fix: mouse.attached === true (TheWin32Mouse is set)
 * Expected before fix: mouse.attached === false (TheWin32Mouse is NULL)
 */

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

async function main() {
  console.error("[input-fix] starting TheWin32Mouse verification");

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || process.env.STARTUP_VERTICAL_BROWSER_EXECUTABLE || undefined,
    args: (process.env.STARTUP_VERTICAL_BROWSER_ARGS ?? "")
      .split(/\s+/).filter((a) => a.length > 0),
  });
  const server = await startStaticServer({ root: wasmRoot });
  const harnessUrl = new URL("harness/index.html", server.url).href;

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  // Phase 1: mount + realEngineInit
  console.error("[input-fix] mounting archives...");
  const mountResult = await page.evaluate(() =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", {
      archiveSet: [
        { offset: 0, size: 0, range: [0, 0] },
      ],
      runDirectory: "/assets/real-init",
    })
  );
  console.error("[input-fix] mount ok:", mountResult?.ok);

  console.error("[input-fix] realEngineInit...");
  const initResult = await page.evaluate(() =>
    window.CnCPort.rpc("realEngineInit", { runDirectory: "/assets/real-init" })
  );
  console.error("[input-fix] init ok:", initResult?.ok, "frontier:", JSON.stringify(initResult?.frontier));

  // Run a few frames to let the engine initialize
  console.error("[input-fix] running 10 frames...");
  const frames = await page.evaluate((n) =>
    window.CnCPort.rpc("realEngineFrame", { frames: n }), 10
  );
  console.error("[input-fix] frames ok:", frames?.ok);

  // Phase 2: probe originalWndProcInput to check TheWin32Mouse
  console.error("[input-fix] probing originalWndProcInput...");
  const probe = await page.evaluate(() =>
    window.CnCPort.rpc("originalWndProcInputProbe")
  );
  console.error("[input-fix] probe result:", JSON.stringify(probe, null, 2));

  const mouseAttached = probe?.probe?.mouse?.attached;
  const ready = probe?.probe?.ready;

  console.error("[input-fix] === VERIFICATION ===");
  console.error("[input-fix] realEngineInit succeeded:", initResult?.ok === true);
  console.error("[input-fix] mouse.attached (TheWin32Mouse == &browser_mouse()):", mouseAttached);
  console.error("[input-fix] originalWndProc ready:", ready);

  // After the fix, TheWin32Mouse should be set even though g_original_wndproc_ready is false
  // (because ensure_original_wndproc_input_window was not called)
  const fixVerified = mouseAttached === true;

  console.error("[input-fix] === RESULT ===");
  console.error("[input-fix] TheWin32Mouse is set in real-engine-init path:", fixVerified ? "YES (FIX WORKS)" : "NO (BUG STILL PRESENT)");

  const summary = {
    ok: fixVerified,
    mouseAttached,
    originalWndProcReady: ready,
    realEngineInitOk: initResult?.ok === true,
  };
  console.log(JSON.stringify(summary, null, 2));

  await browser.close();
  await server.close();

  process.exit(fixVerified ? 0 : 1);
}

main().catch((err) => {
  console.error("[input-fix] FATAL:", err);
  process.exit(1);
});
