#!/usr/bin/env node
// Resolution architecture probe (temporary verification script).
//
// Drives play.html end to end and asserts the "engine owns the resolution"
// invariants:
//   1. Dynamic boot: the engine boots at the canvas CSS box x DPR (not
//      800x600), the canvas backing store equals the engine resolution.
//   2. Window resize in dynamic mode: the engine follows (debounced) and the
//      backing store tracks it.
//   3. Fixed resolution via the settings select: engine + backing store land
//      on the exact WxH; the canvas letterboxes via CSS.
//   4. The shell survives every change (MainMenu window still present).
// Screenshots are captured at each stage for eyeballing.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.CNC_CHROMIUM ?? undefined;
const playwrightModule = executablePath ? "playwright-core" : "playwright";
const { chromium } = await import(playwrightModule);

// Either drive an already-running harness server (CNC_HARNESS_URL, e.g. the
// Mac at :8123) or start the local static server like the other gates.
let server = null;
let serverUrl = process.env.CNC_HARNESS_URL ?? null;
if (!serverUrl) {
  const { startStaticServer } = await import("./static-server.mjs");
  server = await startStaticServer({ root: wasmRoot });
  serverUrl = server.url;
}
const outDir = process.env.CNC_PROBE_OUT ?? "/tmp/cnc-resolution-probe";
mkdirSync(outDir, { recursive: true });

setTimeout(() => {
  console.error("[res-probe] WATCHDOG: 20 minutes elapsed");
  process.exit(3);
}, 20 * 60 * 1000).unref();

const failures = [];
function check(name, ok, detail) {
  console.error(`[res-probe] ${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail ?? null)}`);
  if (!ok) {
    failures.push({ name, detail });
  }
}

const extraArgs = (process.env.CNC_CHROMIUM_ARGS ?? "")
  .split(",")
  .map((arg) => arg.trim())
  .filter(Boolean);
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1400,940", ...extraArgs],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (error) => console.error("[res-probe] pageerror", error.message));
  const url = new URL("harness/play.html", serverUrl);
  url.searchParams.set("autostart", "1");
  url.searchParams.set("diag", "lite");
  url.searchParams.set("dist", process.env.CNC_DIST ?? "dist");
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  console.error("[res-probe] booting (waiting for overlay to hide)...");
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: 480_000 });

  const readDisplayState = async () => await page.evaluate(async () => {
    const frame = await window.CnCPort.rpc("realEngineFrame", { frames: 1 });
    const canvas = document.querySelector("#viewport");
    const rect = canvas.getBoundingClientRect();
    return {
      engine: frame?.frame?.clientState?.display ?? null,
      buffer: { width: canvas.width, height: canvas.height },
      cssBox: { width: Math.round(rect.width), height: Math.round(rect.height) },
      dpr: window.devicePixelRatio || 1,
      shell: frame?.frame?.clientState?.shell ?? null,
    };
  });

  const settle = async (ms) => await new Promise((resolve) => setTimeout(resolve, ms));

  // Poll (advancing frames) until the engine reports the expected resolution.
  // Dynamic applies retry while a load session is active (the shellmap can
  // still be streaming in right after boot), so allow generous time.
  const waitForEngineSize = async (width, height, timeoutMs = 60_000) => {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      last = await readDisplayState();
      if (last.engine?.width === width && last.engine?.height === height) {
        return last;
      }
      await settle(1000);
    }
    return last;
  };


  // Canvas capture via the bridge's own screenshot RPC (snapshotCanvas): the
  // play page's continuous frame loop starves Playwright's page.screenshot
  // compositor path, and without preserveDrawingBuffer only a capture taken
  // by the bridge right after a draw is reliable.
  const shot = async (name) => {
    const dataUrl = await page.evaluate(async () => {
      const result = await window.CnCPort.rpc("screenshot");
      return result?.screenshot?.dataUrl ?? result?.screenshot ?? null;
    });
    const prefix = "data:image/png;base64,";
    if (typeof dataUrl === "string" && dataUrl.startsWith(prefix)) {
      writeFileSync(`${outDir}/${name}`, Buffer.from(dataUrl.slice(prefix.length), "base64"));
    } else {
      console.error(`[res-probe] screenshot ${name} unavailable`);
    }
  };


  // --- 1. dynamic boot -------------------------------------------------------
  let state = await readDisplayState();
  console.error("[res-probe] post-boot state", JSON.stringify(state));
  const expectBoot = { width: 1280, height: 800 };
  check("dynamic-boot engine==viewport", state.engine?.width === expectBoot.width
    && state.engine?.height === expectBoot.height, state.engine);
  check("dynamic-boot buffer==engine", state.buffer.width === state.engine?.width
    && state.buffer.height === state.engine?.height, state.buffer);
  await shot("1-dynamic-boot.png");

  // --- 2. window resize in dynamic mode -------------------------------------
  await page.setViewportSize({ width: 1000, height: 700 });
  state = await waitForEngineSize(1000, 700);
  console.error("[res-probe] post-resize state", JSON.stringify(state));
  check("dynamic-resize engine follows", state.engine?.width === 1000
    && state.engine?.height === 700, state.engine);
  check("dynamic-resize buffer==engine", state.buffer.width === state.engine?.width
    && state.buffer.height === state.engine?.height, state.buffer);
  await shot("2-dynamic-resize.png");

  // --- 3. fixed resolution via the settings select ---------------------------
  await page.evaluate(() => {
    document.querySelector("#gearButton")?.click();
    const select = document.querySelector("#resolutionSelectLive");
    select.value = "1024x768";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  state = await waitForEngineSize(1024, 768);
  console.error("[res-probe] post-fixed state", JSON.stringify(state));
  check("fixed engine==1024x768", state.engine?.width === 1024
    && state.engine?.height === 768, state.engine);
  check("fixed buffer==1024x768", state.buffer.width === 1024
    && state.buffer.height === 768, state.buffer);
  await shot("3-fixed-1024.png");

  // --- 4. back to dynamic ----------------------------------------------------
  await page.evaluate(() => {
    const select = document.querySelector("#resolutionSelectLive");
    select.value = "dynamic";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  state = await waitForEngineSize(1000, 700);
  console.error("[res-probe] back-to-dynamic state", JSON.stringify(state));
  check("dynamic-return engine==viewport", state.engine?.width === 1000
    && state.engine?.height === 700, state.engine);
  await shot("4-dynamic-return.png");

  // --- 5. shell still alive (menu present after all the reflows) -------------
  check("shell alive after reflows", state.shell?.screenCount >= 1
    && typeof state.shell?.topFilename === "string"
    && state.shell.topFilename.length > 0, state.shell);

  const ok = failures.length === 0;
  console.log(JSON.stringify({ ok, failures, outDir }));
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error("[res-probe] FATAL", error);
  console.log(JSON.stringify({ ok: false, error: error?.message ?? String(error) }));
  process.exit(2);
} finally {
  await Promise.race([browser.close(), new Promise((done) => setTimeout(done, 10_000))]);
  await server?.close?.();
}
