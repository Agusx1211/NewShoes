#!/usr/bin/env node
// Real-mouse hover verification on the play page: moves the actual Playwright
// pointer (not engine-space postMessage) over the Single Player button at
// several resolutions and asserts the engine sees the cursor over the button
// (the same path the player's hover-highlight uses). Catches pointer->engine
// mapping regressions the click-through probes (which post engine-space
// coordinates directly) cannot.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.CNC_CHROMIUM ?? undefined;
const { chromium } = await import(executablePath ? "playwright-core" : "playwright");

// Either drive an already-running harness server (CNC_HARNESS_URL, e.g. the
// Mac at :8123) or start the local static server like the other gates.
let server = null;
let serverUrl = process.env.CNC_HARNESS_URL ?? null;
if (!serverUrl) {
  const { startStaticServer } = await import("./static-server.mjs");
  server = await startStaticServer({ root: wasmRoot });
  serverUrl = server.url;
}
function log(m){ console.error(`[hover] ${m}`); }
setTimeout(() => { console.error("[hover] WATCHDOG"); process.exit(3); }, 8 * 60 * 1000).unref();

const extraArgs = (process.env.CNC_CHROMIUM_ARGS ?? "")
  .split(",")
  .map((arg) => arg.trim())
  .filter(Boolean);
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--autoplay-policy=no-user-gesture-required", ...extraArgs],
});
let page;
async function rpc(name, payload = {}) {
  return page.evaluate(([command, data]) => window.CnCPort.rpc(command, data), [name, payload]);
}
function expectProbe(c, m, p = null) { if (!c) throw new Error(m + ": " + JSON.stringify(p)?.slice(0, 500)); }
async function frames(n) { const r = await rpc("realEngineFrame", { frames: n }); expectProbe(r?.ok === true, "frame failed", r?.abortMessage); return r; }

// Map an engine-space point to page CSS coordinates through the letterboxed
// canvas content box (inverse of bridge.js canvasInputPointFromEvent).
async function engineToPage(enginePoint) {
  return page.evaluate(([pt]) => {
    const canvas = document.querySelector("#viewport");
    const rect = canvas.getBoundingClientRect();
    const engine = window.CnCPort.state.engineDisplaySize ?? { width: canvas.width, height: canvas.height };
    let contentLeft = rect.left, contentTop = rect.top;
    let contentWidth = rect.width, contentHeight = rect.height;
    if (canvas.width > 0 && canvas.height > 0 && rect.width > 0 && rect.height > 0) {
      const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
      contentWidth = canvas.width * scale;
      contentHeight = canvas.height * scale;
      contentLeft = rect.left + (rect.width - contentWidth) / 2;
      contentTop = rect.top + (rect.height - contentHeight) / 2;
    }
    return {
      x: contentLeft + (pt.x + 0.5) * contentWidth / engine.width,
      y: contentTop + (pt.y + 0.5) * contentHeight / engine.height,
      engine,
    };
  }, [enginePoint]);
}

async function hoverCheck(label) {
  // find the Single Player button in engine space. The menu's first-run
  // reveal (and the re-push after a shell reflow) waits for REAL mouse
  // movement before finishing its transition, so jiggle the pointer along a
  // safe area while polling.
  let cs = null;
  for (let i = 0; i < 400; i += 1) {
    if (i % 20 === 0) {
      await page.mouse.move(200 + (i % 40), 500);
      await page.mouse.move(240 + (i % 40), 520);
    }
    const f = await frames(1);
    cs = f.frame?.clientState;
    if (cs?.mainMenu?.buttonSinglePlayer?.clickable === true && cs?.transition?.finished === true) break;
  }
  const button = cs?.mainMenu?.buttonSinglePlayer;
  expectProbe(button?.clickable === true, label + ": single player button never ready", cs?.mainMenu);
  const target = { x: button.centerX, y: button.centerY };
  const pagePoint = await engineToPage(target);
  log(`${label}: engine button center ${target.x},${target.y} -> page ${pagePoint.x.toFixed(1)},${pagePoint.y.toFixed(1)} (engine ${pagePoint.engine.width}x${pagePoint.engine.height})`);

  // real pointer move (two steps so a mousemove delta exists)
  await page.mouse.move(pagePoint.x - 40, pagePoint.y - 40);
  await frames(3);
  await page.mouse.move(pagePoint.x, pagePoint.y);
  await frames(6);

  const f = await frames(1);
  const input = f.frame?.clientState?.input;
  const mouse = input?.mouse;
  const dx = Math.abs((mouse?.x ?? -9999) - target.x);
  const dy = Math.abs((mouse?.y ?? -9999) - target.y);
  expectProbe(dx <= 3 && dy <= 3,
    label + ": engine cursor did not land on the button center", { mouse, target });

  // the engine window under the cursor must be the button (hover hit-test)
  const under = f.frame?.clientState?.mainMenu?.underButtonSinglePlayerCenter;
  const underOk = under?.window?.found === true && under.window.id === button.id;
  return { label, mouse: { x: mouse.x, y: mouse.y }, target, underOk };
}

let result = null;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const url = new URL("harness/play.html", serverUrl);
  url.searchParams.set("autostart", "1");
  url.searchParams.set("diag", "lite");
  url.searchParams.set("dist", process.env.CNC_DIST ?? "dist");
  // Legacy main-thread path, pinned explicitly: this probe's dist build has
  // no pthread runtime, so it must stay legacy when the prepared
  // threaded-by-default play-page flip lands.
  url.searchParams.set("threads", "0");
  if (process.env.CNC_NOSHELLMAP === "1") {
    url.searchParams.set("shellmap", "0");
  }
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  log("booting...");
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: 480_000 });

  const checks = [];
  checks.push(await hoverCheck("dynamic-boot-1280x800"));

  // fixed 1024x768 => letterboxed canvas; hover must map through the content box
  await page.evaluate(() => {
    const select = document.querySelector("#resolutionSelectLive");
    select.value = "1024x768";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 3000));
  for (let i = 0; i < 40; i += 1) await frames(2);
  checks.push(await hoverCheck("fixed-1024x768-letterboxed"));

  result = { ok: true, checks };
} catch (err) {
  console.error("[hover] FATAL:", err.message);
  result = { ok: false, error: err.message };
} finally {
  console.log(JSON.stringify(result ?? { ok: false }));
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10_000))]);
  await server?.close?.();
  process.exit(result?.ok ? 0 : 1);
}
