#!/usr/bin/env node
// Resolution architecture probe (temporary verification script).
//
// Drives play.html end to end and asserts the "engine owns the resolution"
// invariants:
//   1. Dynamic boot: the engine boots at the canvas CSS box x DPR (not
//      800x600), the canvas backing store equals the engine resolution.
//   2. Window resize in dynamic mode: the engine follows (debounced) and the
//      backing store tracks it.
//   3. The running page has no custom chrome by default; its host API can
//      enable the performance graph and manage fixed/dynamic display modes.
//   4. Fixed resolution via the host API lands the engine + backing store on
//      the exact WxH; the canvas letterboxes via CSS.
//   5. The shell survives every change (MainMenu window still present).
// Screenshots are captured at each stage for eyeballing.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
const profileDir = process.env.CNC_PROBE_PROFILE ?? "/tmp/cnc-resolution-probe-profile";
const keepProfile = process.env.CNC_PROBE_KEEP_PROFILE === "1";
if (!keepProfile) {
  rmSync(profileDir, { recursive: true, force: true });
}
mkdirSync(profileDir, { recursive: true });
// The threaded play page mounts ~2 GB into OPFS. Incognito launch() contexts
// use an in-memory OPFS backend capped below that on this machine; a fresh
// persistent context gives the probe the real disk-backed browser quota.
const browser = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  executablePath,
  viewport: { width: 1280, height: 800 },
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1400,940", ...extraArgs],
});
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.localStorage.removeItem("cncPortPerformanceOverlay.v1");
  });
  page.on("pageerror", (error) => console.error("[res-probe] pageerror", error.message));
  const url = new URL("harness/play.html", serverUrl);
  url.searchParams.set("autostart", "1");
  url.searchParams.set("diag", "lite");
  url.searchParams.set("dist", process.env.CNC_DIST ?? "dist-threaded-release");
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  console.error("[res-probe] booting (waiting for overlay to hide)...");
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: 900_000 });

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
      if (last.engine?.width === width && last.engine?.height === height
          && last.buffer.width === width && last.buffer.height === height) {
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
  const chromeDefault = await page.evaluate(() => ({
    gearPresent: Boolean(document.querySelector("#gearButton")),
    legacySettingsPresent: Boolean(document.querySelector("#settingsOverlay")),
    statusHudPresent: Boolean(document.querySelector("#hud")),
    exitButtonPresent: Boolean(document.querySelector("#exitRuntimeButton")),
    performanceHidden: document.querySelector("#performanceOverlay")?.classList.contains("hidden"),
    desktopSettingsControls: [
      "resolutionSelectLive",
      "fullscreenButton",
      "shaderTierSelect",
      "performanceOverlayToggle",
      "diagnosticsSelect",
    ].every((id) => Boolean(document.getElementById(id))),
    hostApi: typeof window.CnCPort?.play?.setPerformanceOverlay === "function"
      && typeof window.CnCPort?.play?.setDisplayMode === "function",
  }));
  check("running game has no custom chrome by default",
    chromeDefault.gearPresent === false
      && chromeDefault.legacySettingsPresent === false
      && chromeDefault.statusHudPresent === false
      && chromeDefault.exitButtonPresent === false
      && chromeDefault.performanceHidden === true,
    chromeDefault);
  check("play settings live in desktop window and host API",
    chromeDefault.desktopSettingsControls === true && chromeDefault.hostApi === true,
    chromeDefault);

  await page.evaluate(() => window.CnCPort.play.setPerformanceOverlay({
    enabled: true,
    historySeconds: 3,
    graphMaxMs: 40,
  }));
  // The boot sentinel hides just before the page's final display apply and
  // automatic loop start. Start it explicitly as well so this UI probe is
  // not coupled to a slow SwiftShader display-apply round trip.
  await page.evaluate(() => window.CnCPort.rpc("threadedStartLoop", {
    clientFps: 60,
    logicFps: 30,
  }));
  await page.waitForFunction(() => {
    const snapshot = window.CnCPort?.play?.getPerformanceSnapshot?.();
    return window.CnCPort?.state?.threadedEngine?.loop?.active === true
      && document.querySelector("#performanceOverlay")?.classList.contains("hidden") === false
      && snapshot?.engineFrameMs?.length > 2
      && snapshot?.presentationFrameMs?.length > 2;
  }, null, { timeout: 120_000 });
  await page.locator("#performanceOverlay").screenshot({
    path: `${outDir}/performance-overlay.png`,
  });
  const performanceProof = await page.evaluate(() => {
    const canvas = document.querySelector("#performanceGraph");
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparent = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 0) nonTransparent += 1;
    }
    return {
      config: window.CnCPort.play.getConfiguration().performanceOverlay,
      snapshot: window.CnCPort.play.getPerformanceSnapshot(),
      clientText: document.querySelector("#performanceClientFps")?.textContent,
      engineText: document.querySelector("#performanceEngineMs")?.textContent,
      graphPixels: nonTransparent,
    };
  });
  check("performance overlay renders rates, frame times, and graph",
    performanceProof.config.enabled === true
      && performanceProof.config.historySeconds === 3
      && performanceProof.snapshot.clientFps > 0
      && performanceProof.snapshot.engineFrameMs.length > 2
      && performanceProof.clientText !== "—"
      && performanceProof.engineText.endsWith(" ms")
      && performanceProof.graphPixels > 100,
    performanceProof);
  await page.evaluate(() => window.CnCPort.play.setPerformanceOverlay(false));
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

  // --- 3. fixed resolution via the host window API ---------------------------
  await page.evaluate(() => window.CnCPort.play.setDisplayMode({
    mode: "fixed",
    width: 1024,
    height: 768,
  }));
  state = await waitForEngineSize(1024, 768);
  console.error("[res-probe] post-fixed state", JSON.stringify(state));
  check("fixed engine==1024x768", state.engine?.width === 1024
    && state.engine?.height === 768, state.engine);
  check("fixed buffer==1024x768", state.buffer.width === 1024
    && state.buffer.height === 768, state.buffer);
  await shot("3-fixed-1024.png");

  // --- 4. back to dynamic ----------------------------------------------------
  await page.evaluate(() => window.CnCPort.play.setDisplayMode({ mode: "dynamic" }));
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
  if (!keepProfile) {
    rmSync(profileDir, { recursive: true, force: true });
  }
  await server?.close?.();
}
