#!/usr/bin/env node
// Boots a shipping threaded skirmish, raises the real camera limit to 500,
// and pixel-checks ultrawide plus near-vertical terrain coverage on a large
// retail map. Screenshots and a compact JSON report are written to the output
// directory for review.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const harnessUrl = process.env.CNC_HARNESS_URL
  ?? "https://127.0.0.1:18757/harness/play.html";
const executablePath = process.env.CNC_CHROMIUM || undefined;
const profileDir = resolve(process.env.CNC_PROFILE_DIR
  ?? resolve(wasmRoot, "artifacts/pw-profiles/terrain-culling-orientation"));
const outputDir = resolve(process.env.CNC_TERRAIN_CULLING_OUTPUT
  ?? resolve(wasmRoot, "artifacts/terrain-culling"));
const bootTimeoutMs = Number(process.env.CNC_BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const reuseProfile = process.env.CNC_REUSE_PROFILE === "1";
const viewportWidth = Number(process.env.CNC_VIEWPORT_WIDTH ?? 3840);
const viewportHeight = Number(process.env.CNC_VIEWPORT_HEIGHT ?? 1080);
const requestedMap = String(process.env.CNC_SKIRMISH_MAP
  ?? "maps\\twilight flame\\twilight flame.map").trim();
const maxEdgeBlackFraction = Number(process.env.CNC_MAX_EDGE_BLACK_FRACTION ?? 0.01);
const expectedRenderer = String(process.env.CNC_EXPECTED_RENDERER ?? "").trim();

function expect(condition, message, detail = null) {
  if (!condition) {
    throw new Error(`${message}${detail == null ? "" : `: ${JSON.stringify(detail)}`}`);
  }
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function frameSummary(page) {
  const result = await rpc(page, "realEngineFrameSummary", { frames: 1 });
  expect(result?.ok === true, "frame summary failed", result);
  return result.frame;
}

function clientState(frame) {
  return frame?.clientState ?? frame;
}

async function waitForFrame(page, label, predicate, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await frameSummary(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last?.clientState ?? last)}`);
}

async function waitAndClickWindow(page, name, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await rpc(page, "clickWindowByName", { name });
    if (last?.ok === true) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`could not click ${name}: ${JSON.stringify(last)}`);
}

async function openSkirmishAndSetMap(page, map, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    await rpc(page, "clickWindowByName", { name: "MainMenu.wnd:ButtonSkirmish" });
    const roundDeadline = Math.min(deadline, Date.now() + 15_000);
    while (Date.now() < roundDeadline) {
      last = await rpc(page, "realEngineSetSkirmishMap", { map });
      if (last?.ok === true) return last;
      await page.waitForTimeout(500);
    }
  }
  throw new Error(`skirmish options did not become ready for ${map}: ${JSON.stringify(last)}`);
}

async function startSkirmish(page, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastClick = null;
  let lastFrame = null;
  while (Date.now() < deadline) {
    lastClick = await rpc(page, "clickWindowByName", {
      name: "SkirmishGameOptionsMenu.wnd:ButtonStart",
    });
    const roundDeadline = Math.min(deadline, Date.now() + 15_000);
    while (Date.now() < roundDeadline) {
      lastFrame = await frameSummary(page);
      const gameplay = clientState(lastFrame)?.gameplay;
      if (lastFrame?.loadSessionActive === true || gameplay?.loadingMap === true
          || gameplay?.inGame === true) {
        return;
      }
      await page.waitForTimeout(500);
    }
  }
  throw new Error(`skirmish did not start: ${JSON.stringify({ lastClick, lastFrame })}`);
}

async function waitForBoot(page) {
  const deadline = Date.now() + bootTimeoutMs;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const status = await page.evaluate(() => ({
      overlayHidden: document.querySelector("#overlay")?.classList.contains("hidden") === true,
      progress: document.querySelector("#progress")?.textContent ?? "",
      runtimeStarted: window.ZeroHRuntime?.started ?? null,
      threaded: window.CnCPort?.state?.threadedEngine == null ? null : {
        live: window.CnCPort.state.threadedEngine.live,
        initState: window.CnCPort.state.threadedEngine.initState,
        renderer: window.CnCPort.state.threadedEngine.graphics?.renderer ?? null,
      },
    }));
    if (status.overlayHidden) return status;
    if (Date.now() - lastLog >= 10_000) {
      lastLog = Date.now();
      process.stderr.write(`[terrain-culling] boot ${JSON.stringify(status)}\n`);
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error("shipping runtime boot timed out");
}

async function analyzeScreenshot(page, dataUrl) {
  return page.evaluate(async (url) => {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    // Keep the command bar out of the terrain-edge pixel sample.
    const terrainHeight = Math.max(1, Math.floor(canvas.height * 0.65));
    const pixels = context.getImageData(0, 0, canvas.width, terrainHeight).data;
    const edgeWidth = Math.max(1, Math.floor(canvas.width * 0.12));
    let exactBlack = 0;
    let nearBlack = 0;
    let edgeExactBlack = 0;
    let edgeNearBlack = 0;
    let edgeSamples = 0;
    for (let y = 0; y < terrainHeight; ++y) {
      for (let x = 0; x < canvas.width; ++x) {
        const offset = (y * canvas.width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const black = red === 0 && green === 0 && blue === 0;
        const dark = red <= 3 && green <= 3 && blue <= 3;
        if (black) exactBlack += 1;
        if (dark) nearBlack += 1;
        if (x < edgeWidth || x >= canvas.width - edgeWidth) {
          edgeSamples += 1;
          if (black) edgeExactBlack += 1;
          if (dark) edgeNearBlack += 1;
        }
      }
    }
    const samples = canvas.width * terrainHeight;
    return {
      width: canvas.width,
      height: canvas.height,
      terrainHeight,
      exactBlackFraction: exactBlack / samples,
      nearBlackFraction: nearBlack / samples,
      edgeExactBlackFraction: edgeExactBlack / edgeSamples,
      edgeNearBlackFraction: edgeNearBlack / edgeSamples,
    };
  }, dataUrl);
}

async function capture(page, label) {
  const [frame, screenshot] = await Promise.all([
    frameSummary(page),
    rpc(page, "screenshot"),
  ]);
  const dataUrl = typeof screenshot?.screenshot === "string"
    ? screenshot.screenshot
    : screenshot?.screenshot?.dataUrl;
  expect(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    `${label} screenshot is unavailable`, screenshot);
  const path = resolve(outputDir, `${label}.png`);
  await writeFile(path, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  return {
    label,
    path,
    view: frame?.view ?? frame?.clientState?.view ?? null,
    gameplay: (() => {
      const gameplay = frame?.gameplay ?? frame?.clientState?.gameplay;
      return gameplay == null ? null : {
        inGame: gameplay.inGame,
        logicFrame: gameplay.logicFrame,
        renderedObjectCount: gameplay.renderedObjectCount,
      };
    })(),
    pixels: await analyzeScreenshot(page, dataUrl),
  };
}

async function main() {
  if (!reuseProfile) {
    await rm(profileDir, { recursive: true, force: true });
  }
  await mkdir(profileDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath,
    ignoreHTTPSErrors: true,
    viewport: { width: viewportWidth, height: viewportHeight },
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=vulkan",
      "--enable-features=Vulkan",
      "--ignore-gpu-blocklist",
      "--remote-debugging-port=18758",
    ],
  });
  await context.addInitScript(([key, value]) => {
    localStorage.setItem(key, JSON.stringify({ maxCameraHeight: value }));
  }, ["cncPortCameraZoom.v1", 500]);
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(300_000);
  const consoleTail = [];
  page.on("console", (message) => {
    const text = `[${message.type()}] ${message.text()}`;
    consoleTail.push(text);
    if (consoleTail.length > 200) consoleTail.shift();
  });

  const report = {
    harnessUrl,
    config: {
      viewportWidth,
      viewportHeight,
      requestedMap,
      maxCameraHeight: 500,
      maxEdgeBlackFraction,
    },
    captures: [],
    consoleTail,
  };
  try {
    const url = new URL(harnessUrl);
    url.searchParams.set("autostart", "1");
    url.searchParams.set("dist", "dist-threaded-release");
    url.searchParams.set("shellmap", "0");
    url.searchParams.set("videos", "0");
    await page.goto(url.href, { waitUntil: "load" });
    await waitForBoot(page);
    process.stderr.write("[terrain-culling] boot complete\n");

    await waitAndClickWindow(page, "MainMenu.wnd:ButtonSinglePlayer");
    process.stderr.write("[terrain-culling] opened single-player menu\n");
    const mapCache = await rpc(page, "mapCacheProbe");
    const mapName = requestedMap || mapCache?.probe?.firstOfficialMultiplayerMap;
    expect(typeof mapName === "string" && mapName.length > 0,
      "no official multiplayer map is available", mapCache);
    const mapSet = await openSkirmishAndSetMap(page, mapName);
    expect(mapSet?.ok === true, "could not select the probe map", mapSet);
    report.map = mapName;
    process.stderr.write("[terrain-culling] opened skirmish menu\n");
    await startSkirmish(page);
    process.stderr.write("[terrain-culling] started skirmish load\n");
    const active = await waitForFrame(page, "active skirmish", (frame) => {
      const gameplay = clientState(frame)?.gameplay;
      return gameplay?.inGame === true
        && gameplay?.loadingMap === false
        && gameplay?.inputEnabled === true
        && Number(gameplay?.renderedObjectCount ?? 0) > 0;
    }, 8 * 60 * 1000);
    process.stderr.write("[terrain-culling] active skirmish ready\n");

    await page.waitForTimeout(3_000);
    const activeView = clientState(active)?.view;
    const mapWidth = activeView?.terrainDrawArea?.mapWidth;
    const mapHeight = activeView?.terrainDrawArea?.mapHeight;
    expect(Number.isFinite(mapWidth) && Number.isFinite(mapHeight),
      "terrain map dimensions are unavailable", activeView);
    const center = await rpc(page, "agentCameraLookAt", {
      x: mapWidth * 5,
      y: mapHeight * 5,
    });
    expect(center?.ok === true, "could not center the tactical view", center);
    const viewportBox = await page.locator("#viewport").boundingBox();
    expect(viewportBox != null, "runtime viewport has no browser geometry");
    await page.mouse.move(
      viewportBox.x + viewportBox.width / 2,
      viewportBox.y + viewportBox.height / 2,
    );
    for (let step = 0; step < 40; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(40);
    }
    await waitForFrame(page, "camera zoom to 500", (frame) => {
      const view = clientState(frame)?.view;
      return Number(view?.heightAboveGround ?? 0) >= 499
        && Number(view?.currentHeightAboveGround ?? 0) > 450;
    }, 30_000);
    report.captures.push(await capture(page, "center-high-zoom"));

    const interior = await rpc(page, "agentCameraLookAt", {
      x: mapWidth * 6,
      y: mapHeight * 3,
    });
    expect(interior?.ok === true, "could not position the tactical view", interior);
    await page.waitForTimeout(2_000);

    for (const [index, angle] of [0, Math.PI / 2, Math.PI, Math.PI * 1.5].entries()) {
      const orientation = await rpc(page, "agentCameraSetView", {
        pitch: -Math.PI / 5,
        angle,
        setPitch: true,
        setAngle: true,
      });
      expect(orientation?.ok === true, "orientation driver failed", orientation);
      await page.waitForTimeout(1_500);
      report.captures.push(await capture(page, `topdown-${index}`));
    }

    for (const evidence of report.captures) {
      expect(evidence.pixels.edgeExactBlackFraction <= maxEdgeBlackFraction,
        `${evidence.label} exposed black terrain at the viewport edge`, evidence);
    }
    report.worker = await page.evaluate(() => {
      const worker = window.CnCPort?.state?.threadedEngine;
      return worker == null ? null : {
        renderer: worker.graphics?.renderer ?? null,
        engineDisplaySize: worker.engineDisplaySize ?? null,
        canvas: worker.canvas ?? null,
        contextLost: worker.contextLost ?? null,
        frame: worker.frame == null ? null : {
          logicFrame: worker.frame.logicFrame,
          clientFrame: worker.frame.clientFrame,
          loadSessionActive: worker.frame.loadSessionActive,
        },
      };
    });
    if (expectedRenderer) {
      expect(new RegExp(expectedRenderer, "i").test(report.worker?.renderer ?? ""),
        "runtime did not use the expected renderer", report.worker);
    }
    report.ok = true;
    await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    report.ok = false;
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    await writeFile(resolve(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    throw error;
  } finally {
    let exitTimer = null;
    await Promise.race([
      page.evaluate(() => window.ZeroHRuntime?.exit?.()).catch(() => {}),
      new Promise((resolveTimeout) => {
        exitTimer = setTimeout(resolveTimeout, 5_000);
      }),
    ]);
    clearTimeout(exitTimer);
    await context.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
