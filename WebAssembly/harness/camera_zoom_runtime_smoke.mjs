// Verifies the launcher camera-zoom setting through the shipping threaded page:
// persisted setting -> real GameEngine init -> original skirmish menu/input path
// -> tactical camera zoom above the retail 310-unit limit.

import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";
import { CAMERA_ZOOM_SETTINGS_KEY } from "./camera-zoom-config.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const outputDir = resolve(process.env.CAMERA_ZOOM_OUTPUT_DIR
  ?? join(wasmRoot, "artifacts/screenshots/camera-zoom-runtime"));
const profileDir = resolve(process.env.CAMERA_ZOOM_PROFILE_DIR
  ?? join(wasmRoot, "artifacts/pw-profiles/camera-zoom-runtime"));
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
const bootTimeoutMs = Number(process.env.BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const matchTimeoutMs = Number(process.env.MATCH_TIMEOUT_MS ?? 6 * 60 * 1000);
const expectedRenderer = process.env.CAMERA_ZOOM_EXPECT_RENDERER || "";
const requestedSkirmishMap = String(process.env.CAMERA_ZOOM_SKIRMISH_MAP ?? "").trim();
const verbose = process.env.VERBOSE === "1";
const particleProbe = process.env.CAMERA_ZOOM_PARTICLE_PROBE === "1";
const particleProbeMs = Number(process.env.CAMERA_ZOOM_PARTICLE_PROBE_MS ?? 12000);
const particleProbeCopies = Number(process.env.CAMERA_ZOOM_PARTICLE_COPIES ?? 8);
const particleProbeTargetStructure =
  process.env.CAMERA_ZOOM_PARTICLE_TARGET_STRUCTURE === "1";
const particleProbeSystems = String(
  process.env.CAMERA_ZOOM_PARTICLE_SYSTEMS ?? "MOABDustWave,SubExplosionSmoke02")
  .split(",").map((name) => name.trim()).filter(Boolean);
const particleScreencastDir = process.env.CAMERA_ZOOM_PARTICLE_SCREENCAST_DIR
  ? resolve(process.env.CAMERA_ZOOM_PARTICLE_SCREENCAST_DIR) : null;
const requireParticleDraws = process.env.CAMERA_ZOOM_REQUIRE_PARTICLE_DRAWS === "1";

function expect(condition, message, detail = null) {
  if (!condition) {
    throw new Error(`${message}${detail == null ? "" : `\n${JSON.stringify(detail, null, 2)}`}`);
  }
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);
}

async function frameSummary(page) {
  const result = await rpc(page, "realEngineFrameSummary", { frames: 1 });
  expect(result?.ok === true && result?.aborted === false,
    "real engine frame summary failed", result);
  return result.frame;
}

async function fullFrame(page) {
  const result = await rpc(page, "realEngineFrame", { frames: 1 });
  expect(result?.ok === true && result?.aborted === false,
    "real engine full frame failed", result);
  return result.frame;
}

async function waitForFrame(
  page,
  label,
  predicate,
  timeoutMs = 120000,
  readFrame = frameSummary,
) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readFrame(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} timed out\n${JSON.stringify({
    transition: last?.clientState?.transition ?? null,
    shell: last?.clientState?.shell ?? null,
    mainMenu: last?.clientState?.mainMenu ?? null,
    skirmishMenu: last?.clientState?.skirmishMenu ?? null,
    gameplay: last?.gameplay ?? last?.clientState?.gameplay ?? null,
    view: last?.view ?? last?.clientState?.view ?? null,
  }, null, 2)}`);
}

async function enginePointToCss(page, point) {
  return page.locator("#viewport").evaluate((canvas, enginePoint) => {
    const rect = canvas.getBoundingClientRect();
    const engineSize = window.CnCPort?.state?.engineDisplaySize;
    if (!engineSize?.width || !engineSize?.height) return null;
    return {
      x: rect.left + enginePoint.x * rect.width / engineSize.width,
      y: rect.top + enginePoint.y * rect.height / engineSize.height,
    };
  }, point);
}

async function moveToEnginePoint(page, point) {
  const cssPoint = await enginePointToCss(page, point);
  expect(Number.isFinite(cssPoint?.x) && Number.isFinite(cssPoint?.y),
    "could not map engine input coordinates to the canvas", { point, cssPoint });
  await page.mouse.move(cssPoint.x, cssPoint.y, { steps: 4 });
  return cssPoint;
}

async function clickEngineButton(page, button, label) {
  expect(button?.clickable === true, `${label} is not clickable`, button);
  const point = { x: button.centerX, y: button.centerY };
  const cssPoint = await moveToEnginePoint(page, point);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  return { point, cssPoint };
}

async function captureViewport(page, path) {
  const shot = await rpc(page, "screenshot");
  const dataUrl = typeof shot?.screenshot === "string"
    ? shot.screenshot
    : shot?.screenshot?.dataUrl;
  expect(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    "screenshot RPC did not return a PNG", shot);
  const bytes = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");
  expect(bytes.length > 10 * 1024, "runtime screenshot is unexpectedly small", { bytes: bytes.length });
  await writeFile(path, bytes);
  return bytes.length;
}

async function engineRenderer(page) {
  await page.waitForFunction(() =>
    Boolean(window.CnCPort?.state?.threadedEngine?.graphics?.renderer),
  null, { timeout: 30000, polling: 250 });
  return page.evaluate(() => window.CnCPort.state.threadedEngine.graphics.renderer);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  if (process.env.CAMERA_ZOOM_REUSE_PROFILE !== "1") {
    await rm(profileDir, { recursive: true, force: true });
  }
  await mkdir(profileDir, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot, host: "127.0.0.1", port: 0 });
  const browser = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      "--autoplay-policy=no-user-gesture-required",
      ...(process.env.CAMERA_ZOOM_BROWSER_ARGS ?? "")
        .split(/\s+/)
        .filter(Boolean),
    ],
  });
  const summary = { setting: 500 };
  let page = null;

  try {
    await browser.addInitScript(([key, value]) => {
      localStorage.setItem(key, JSON.stringify({ maxCameraHeight: value }));
    }, [CAMERA_ZOOM_SETTINGS_KEY, summary.setting]);

    page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.on("console", (message) => {
      if (verbose) process.stderr.write(`[camera-zoom-runtime] ${message.type()}: ${message.text()}\n`);
    });
    const url = new URL(
      `harness/play.html?autostart=1&dist=${process.env.CAMERA_ZOOM_DIST ?? "dist-threaded-release"}&shellmap=0`, server.url);
    if (requireParticleDraws) {
      url.searchParams.set("perfCounters", "1");
    }
    await page.goto(url.href, { waitUntil: "load" });
    await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: bootTimeoutMs });

    const frontierResult = await rpc(page, "realEngineFrontier");
    summary.frontier = frontierResult?.frontier ?? null;
    summary.engineRenderer = await engineRenderer(page);
    expect(summary.frontier?.initReturned === true, "real threaded engine did not initialize", summary.frontier);
    expect(summary.frontier?.maxCameraHeight === 500,
      "launcher camera setting did not reach GlobalData before engine initialization", summary.frontier);
    if (expectedRenderer) {
      expect(new RegExp(expectedRenderer, "i").test(summary.engineRenderer),
        "engine worker did not use the expected renderer", {
          expectedRenderer,
          actualRenderer: summary.engineRenderer,
        });
    }

    await moveToEnginePoint(page, { x: 32, y: 32 });
    await page.waitForTimeout(250);
    await moveToEnginePoint(page, { x: 96, y: 96 });

    let frame = await waitForFrame(
      page,
      "main menu",
      (candidate) => candidate?.clientState?.mainMenu?.buttonSinglePlayer?.clickable === true,
      120000,
      fullFrame,
    );
    summary.singlePlayerClick = await clickEngineButton(
      page, frame.clientState.mainMenu.buttonSinglePlayer, "Single Player button");

    frame = await waitForFrame(
      page,
      "single-player menu",
      (candidate) => candidate?.clientState?.mainMenu?.buttonSkirmish?.clickable === true,
      120000,
      fullFrame,
    );
    summary.skirmishClick = await clickEngineButton(
      page, frame.clientState.mainMenu.buttonSkirmish, "Skirmish button");

    // The animated faction menu can consume the first release while the
    // transition group is settling. Retry the same real input path only when
    // the original button becomes clickable again.
    for (let retry = 0; retry < 3; ++retry) {
      await page.waitForTimeout(2000);
      frame = await fullFrame(page);
      if (frame?.clientState?.skirmishMenu?.buttonStart?.clickable === true) break;
      const retryButton = frame?.clientState?.mainMenu?.buttonSkirmish;
      if (retryButton?.clickable === true) {
        summary.skirmishClickRetry = await clickEngineButton(
          page, retryButton, `Skirmish button retry ${retry + 1}`);
      }
    }

    frame = await waitForFrame(
      page,
      "skirmish options",
      (candidate) => candidate?.clientState?.skirmishMenu?.buttonStart?.clickable === true,
      120000,
      fullFrame,
    );
    if (requestedSkirmishMap) {
      const mapSet = await rpc(page, "realEngineSetSkirmishMap", {
        map: requestedSkirmishMap,
      });
      expect(mapSet?.ok === true && Boolean(mapSet.result?.applied),
        "requested particle-probe skirmish map was not applied", mapSet);
      summary.skirmishMapSet = mapSet.result;
    }
    summary.startClick = await clickEngineButton(
      page, frame.clientState.skirmishMenu.buttonStart, "Start button");

    frame = await waitForFrame(page, "active skirmish", (candidate) => {
      const gameplay = candidate?.gameplay ?? candidate?.clientState?.gameplay;
      return gameplay?.inGame === true
        && gameplay?.loadingMap === false
        && gameplay?.inputEnabled === true
        && Number(gameplay?.renderedObjectCount ?? 0) > 0;
    }, matchTimeoutMs);
    summary.activeGameplay = frame.gameplay ?? frame.clientState?.gameplay ?? null;

    if (particleProbe) {
      const drawables = await rpc(page, "queryDrawables");
      const target = (drawables?.result?.drawables ?? drawables?.drawables?.drawables ?? [])
        .find((drawable) =>
        drawable.localOwned === true && drawable.worldPos &&
          (!particleProbeTargetStructure || drawable.structure === true));
      expect(Boolean(target), "particle probe could not find a visible local drawable", drawables);
      const probePosition = {
        x: target.worldPos.x,
        y: target.worldPos.y,
        z: target.worldPos.z,
      };
      const camera = await rpc(page, "agentCameraLookAt", {
        x: probePosition.x,
        y: probePosition.y,
      });
      expect(camera?.ok === true, "particle probe could not center its target", camera);
      await page.waitForTimeout(1000);
      summary.particleProbe = {
        target, probePosition, triggers: [], statusSamples: [],
      };
      const sampleStatus = async (label) => {
        const status = await rpc(page, "threadedStatus");
        summary.particleProbe.statusSamples.push({
          label,
          elapsedMs: Date.now() - probeStartedAt,
          frame: status?.status?.frame ?? null,
          contextLost: status?.status?.contextLost ?? null,
          d3d8Perf: status?.status?.graphics?.d3d8Perf ?? null,
        });
      };
      const spawnWave = async () => {
        for (let copy = 0; copy < particleProbeCopies; ++copy) {
          for (const name of particleProbeSystems) {
            const trigger = await rpc(page, "realEngineSpawnParticleSystem", {
              name,
              x: probePosition.x + (copy % 4) * 8,
              y: probePosition.y + Math.floor(copy / 4) * 8,
              z: probePosition.z,
              useViewPosition: false,
              clampToTerrain: true,
            });
            expect(trigger?.ok === true, "threaded particle trigger failed", { name, trigger });
            summary.particleProbe.triggers.push({ name, result: trigger.result });
          }
        }
      };
      const probeStartedAt = Date.now();
      let screencastSession = null;
      let screencastSerial = 0;
      const screencastWrites = [];
      if (particleScreencastDir) {
        await mkdir(particleScreencastDir, { recursive: true });
        screencastSession = await browser.newCDPSession(page);
        screencastSession.on("Page.screencastFrame", (event) => {
          screencastSerial += 1;
          screencastSession.send("Page.screencastFrameAck", {
            sessionId: event.sessionId,
          }).catch(() => {});
          screencastWrites.push(writeFile(
            join(particleScreencastDir,
              `particle-${String(screencastSerial).padStart(5, "0")}.png`),
            Buffer.from(event.data, "base64"),
          ));
        });
        await screencastSession.send("Page.startScreencast", {
          format: "png",
          maxWidth: 640,
          maxHeight: 400,
          everyNthFrame: 1,
        });
      }
      await spawnWave();
      await sampleStatus("initial");
      while (Date.now() - probeStartedAt < particleProbeMs) {
        const elapsedMs = Date.now() - probeStartedAt;
        await page.waitForTimeout(Math.min(250, particleProbeMs - elapsedMs));
      }
      if (screencastSession) {
        await screencastSession.send("Page.stopScreencast");
        await Promise.all(screencastWrites);
        summary.particleProbe.screencastFrames = {
          directory: particleScreencastDir,
          count: screencastSerial,
        };
        expect(screencastSerial > 0,
          "particle probe did not capture any browser frames");
      }
      await sampleStatus("final");
      const finalDrawables = await rpc(page, "queryDrawables");
      summary.particleProbe.targetAfter =
        (finalDrawables?.result?.drawables ?? finalDrawables?.drawables?.drawables ?? [])
          .find((drawable) => Number(drawable.objectId ?? drawable.id) ===
            Number(target.objectId ?? target.id)) ?? null;
      if (requireParticleDraws) {
        const initialDraws = Number(
          summary.particleProbe.statusSamples[0]?.d3d8Perf?.particleProgramDraws ?? 0);
        const finalDraws = Number(
          summary.particleProbe.statusSamples.at(-1)?.d3d8Perf?.particleProgramDraws ?? 0);
        expect(finalDraws > initialDraws,
          "particle probe produced no visible particle draws", { initialDraws, finalDraws });
      }
      summary.particleProbe.screenshotBytes = await captureViewport(
        page, join(outputDir, "threaded-particle-probe.png"));
      await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
      return;
    }

    const viewportBox = await page.locator("#viewport").boundingBox();
    expect(viewportBox != null, "runtime viewport has no browser geometry");
    await page.mouse.move(
      viewportBox.x + viewportBox.width / 2,
      viewportBox.y + viewportBox.height / 2,
    );
    for (let step = 0; step < 24; step += 1) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(40);
    }
    frame = await waitForFrame(page, "camera zoom into retail range", (candidate) => {
      const view = candidate?.view ?? candidate?.clientState?.view;
      return Number(view?.heightAboveGround ?? 500) < 300
        && Number(view?.currentHeightAboveGround ?? 500) < 350;
    }, 30000);
    summary.beforeZoom = frame.view ?? frame.clientState?.view ?? null;
    summary.beforeScreenshotBytes = await captureViewport(
      page, join(outputDir, "camera-zoom-before.png"));

    for (let step = 0; step < 40; step += 1) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(40);
    }

    frame = await waitForFrame(page, "camera zoom to configured limit", (candidate) => {
      const view = candidate?.view ?? candidate?.clientState?.view;
      return Number(view?.heightAboveGround ?? 0) >= 499
        && Number(view?.currentHeightAboveGround ?? 0) > 450;
    }, 30000);
    summary.afterZoom = frame.view ?? frame.clientState?.view ?? null;
    expect(summary.afterZoom.currentHeightAboveGround <= 505,
      "camera exceeded the configured 500-unit upper bound", summary.afterZoom);
    expect(
      summary.afterZoom.currentHeightAboveGround
        > summary.beforeZoom.currentHeightAboveGround + 100,
      "wheel input did not produce a meaningful camera-height change",
      { beforeZoom: summary.beforeZoom, afterZoom: summary.afterZoom },
    );
    summary.afterScreenshotBytes = await captureViewport(
      page, join(outputDir, "camera-zoom-500.png"));

    await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    if (page) {
      await page.evaluate(() => window.ZeroHRuntime?.exit?.()).catch(() => null);
    }
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
