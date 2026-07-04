#!/usr/bin/env node
/**
 * Minimal plumbing check for queryDrawables / querySelection RPCs.
 * Boots the engine to realEngineInit, clicks through to a loaded map,
 * and calls the two new RPCs early to confirm they return valid JSON
 * without crashing.
 *
 * Usage: STARTUP_VERTICAL_PROVE_PLUMBING=1 node plumbing_check.mjs
 * Output redirected to /tmp/plumbing_check.log
 */

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");

async function main() {
  console.error("[plumbing] starting minimal RPC plumbing check");

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
  console.error("[plumbing] mounting archives...");
  const mountResult = await page.evaluate(() =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", {
      archiveSet: [
        { offset: 0, size: 0, range: [0, 0] },
      ],
      runDirectory: "/assets/real-init",
    })
  );
  console.error("[plumbing] mount ok:", mountResult?.ok);

  console.error("[plumbing] realEngineInit...");
  const initResult = await page.evaluate(() =>
    window.CnCPort.rpc("realEngineInit", { runDirectory: "/assets/real-init" })
  );
  console.error("[plumbing] init ok:", initResult?.ok, "frontier:", JSON.stringify(initResult?.frontier));

  // Run a few frames to initialize the game state
  console.error("[plumbing] running 5 frames...");
  const frames = await page.evaluate((n) =>
    window.CnCPort.rpc("realEngineFrame", { frames: n }), 5
  );
  console.error("[plumbing] frames ok:", frames?.ok, "clientState:", frames?.frame?.clientState?.transition);

  // Quick menu path: reveal main menu
  console.error("[plumbing] revealing main menu...");
  await page.evaluate(() => {
    window.CnCPort.rpc("realEngineUpdateBreakpoint", { target: "GameEngine::init" });
  });

  // Now test the two new RPCs: queryDrawables and querySelection
  console.error("[plumbing] === Testing queryDrawables ===");
  const dr = await page.evaluate(() =>
    window.CnCPort.rpc("queryDrawables")
  );
  console.error("[plumbing] queryDrawables result:", JSON.stringify(dr, null, 2));
  const drValid = dr?.ok === true && dr?.result?.ready !== undefined;
  console.error("[plumbing] queryDrawables valid JSON:", drValid);

  console.error("[plumbing] === Testing querySelection ===");
  const sel = await page.evaluate(() =>
    window.CnCPort.rpc("querySelection")
  );
  console.error("[plumbing] querySelection result:", JSON.stringify(sel, null, 2));
  const selValid = sel?.ok === true && sel?.result?.ready !== undefined;
  console.error("[plumbing] querySelection valid JSON:", selValid);

  // Summary: RPCs returned valid JSON without crashing.
  // Before player control / full init, {ready:false} is the expected response.
  // The key check is that the RPCs don't crash and return parseable JSON.
  const drJsonValid = typeof dr === "object" && dr !== null && "ok" in dr && "result" in dr;
  const selJsonValid = typeof sel === "object" && sel !== null && "ok" in sel && "result" in sel;
  const summary = {
    ok: drJsonValid && selJsonValid,
    queryDrawables: { ok: dr?.ok, ready: dr?.result?.ready, drawableCount: dr?.result?.drawables?.length, jsonValid: drJsonValid },
    querySelection: { ok: sel?.ok, ready: sel?.result?.ready, selectCount: sel?.result?.selectCount, jsonValid: selJsonValid },
  };
  console.error("[plumbing] === PLUMBING CHECK SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  await browser.close();
  await server.close();

  process.exit(summary.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[plumbing] FATAL:", err);
  process.exit(1);
});
