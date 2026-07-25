#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { MapDocument } from "./world-builder-map.mjs";
import { startStaticServer } from "./static-server.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const outputDir = resolve(process.env.WORLD_BUILDER_SHOTS || "/tmp/cnc-world-builder");
const screenshotPath = resolve(outputDir, "world-builder-playtest.png");
const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/world-builder-playtest");
const timeoutMs = Math.max(120_000, Number(process.env.WORLD_BUILDER_PLAYTEST_TIMEOUT_MS || 10 * 60_000));
const keepProfile = process.env.WORLD_BUILDER_KEEP_PROFILE === "1";
const browserArgs = String(process.env.WORLD_BUILDER_BROWSER_ARGS || "")
  .trim().split(/\s+/).filter(Boolean);
const expectedRenderer = String(process.env.WORLD_BUILDER_EXPECT_RENDERER || "").trim().toLowerCase();
const dist = /^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(process.env.WORLD_BUILDER_DIST || "")
  ? process.env.WORLD_BUILDER_DIST
  : "dist-threaded-release";

await mkdir(outputDir, { recursive: true });
if (!keepProfile) await rm(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });
const server = await startStaticServer({ root: wasmRoot });
const browser = await chromium.launchPersistentContext(profileDir, {
  viewport: { width: 1280, height: 800 },
  args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
});

function stage(message) {
  process.stderr.write(`[world-builder-playtest] ${message}\n`);
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(
    ({ requestedCommand, requestedPayload }) =>
      window.CnCPort.rpc(requestedCommand, requestedPayload),
    { requestedCommand: command, requestedPayload: payload },
  );
}

async function semanticWindow(page, name) {
  const snapshot = await rpc(page, "agentUiSnapshot");
  assert.equal(snapshot?.ok, true, `semantic UI snapshot failed for ${name}`);
  assert.equal(snapshot?.result?.ok, true, `semantic UI snapshot result failed for ${name}`);
  const candidate = snapshot.result.windows.find((window) =>
    window.name === name && window.visible && window.interactive);
  assert.ok(candidate, `semantic UI window is unavailable: ${name}`);
  return candidate;
}

async function selectIndex(page, name, index) {
  const window = await semanticWindow(page, name);
  const selected = await rpc(page, "agentUiSelectIndex", {
    windowId: window.id,
    name: window.name,
    index,
  });
  assert.equal(selected?.ok, true, `${name} row selection RPC failed`);
  assert.equal(selected?.result?.ok, true, `${name} row selection did not reach the engine`);
  assert.ok(selected.result.notificationHandled > 0,
    `${name} row selection did not invoke the original callback`);
}

async function activate(page, name) {
  const window = await semanticWindow(page, name);
  const activated = await rpc(page, "agentUiActivate", {
    windowId: window.id,
    name: window.name,
  });
  assert.equal(activated?.ok, true, `${name} activation RPC failed`);
  assert.equal(activated?.result?.ok, true, `${name} activation did not reach the engine`);
}

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  const pageErrors = [];
  const consoleLines = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    const line = `${message.type()}: ${message.text()}`;
    consoleLines.push(line);
    if (consoleLines.length > 500) consoleLines.shift();
  });

  const url = new URL("harness/play.html", server.url);
  url.searchParams.set("autostart", "0");
  url.searchParams.set("dist", dist);
  url.searchParams.set("shellmap", "0");
  url.searchParams.set("videos", "0");
  url.searchParams.set("diag", "lite");
  stage("opening the shipping browser desktop");
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(
    window.CnCPort?.rpc
      && window.ZeroHRuntime?.launch
      && window.ZeroHWorldBuilder
      && window.ZeroHArchiveSpecs?.length,
  ));

  const prepared = await page.evaluate(() => {
    const encodePath = (path) => String(path).split("/").map(encodeURIComponent).join("/");
    const archives = window.ZeroHArchiveSpecs.map((spec) => ({
      name: spec.name,
      sourceName: spec.sourceName || spec.name,
      url: new URL(
        `../artifacts/real-assets/${encodePath(
          spec.artifactSourceName || spec.sourceName || spec.name,
        )}`,
        document.baseURI,
      ).href,
    }));
    window.ZeroHAssetLibrary.preparedArchives = archives;
    return archives.map(({ name, sourceName }) => ({ name, sourceName }));
  });
  assert.equal(prepared.length, 30, "the complete retail archive contract must be mounted");

  stage("authoring and saving a native two-player map");
  const authored = await page.evaluate(() => {
    window.ZeroHDesktop.openApp("worldBuilder");
    window.ZeroHWorldBuilder.newDocument({
      name: "World Builder Playtest",
      playableWidth: 96,
      playableHeight: 96,
      border: 12,
      elevation: 24,
      terrain: "SandMediumType5",
    });
    const map = window.ZeroHWorldBuilder.document;
    map.transaction("Playtest fixtures", (document) => {
      document.addWaypoint("Player_1_Start", 260, 260);
      document.addWaypoint("Player_2_Start", 700, 700);
      document.addObject("AmericaVehicleHumvee", 380, 340, {
        angle: Math.PI * 0.25,
      });
      document.addScorch(500, 500, { type: 1, radius: 26 });
      document.setElevation(50, 50, 31);
      document.setPassable(51, 50, false);
    });
    return {
      summary: window.ZeroHWorldBuilder.snapshot(),
      issues: map.validate(),
    };
  });
  assert.deepEqual(authored.issues.filter((issue) => issue.severity === "error"), []);
  assert.equal(authored.summary.waypoints, 2);

  stage("launching Playtest through the World Builder shipping action");
  const playtest = await page.evaluate(async () => {
    try {
      return { result: await window.ZeroHWorldBuilder.playtest() };
    } catch (error) {
      const filesystem = (() => {
        try {
          const module = window.CnCPort.engineModule();
          const maps = "/home/web_user/Command and Conquer Generals Zero Hour Data/Maps";
          const folder = `${maps}/World Builder Playtest`;
          const map = `${folder}/World Builder Playtest.map`;
          return {
            maps: module.FS.readdir(maps),
            folder: module.FS.readdir(folder),
            map: module.FS.stat(map),
          };
        } catch (filesystemError) {
          return { error: filesystemError?.message || String(filesystemError) };
        }
      })();
      return {
        error: error?.message || String(error),
        detail: error?.launchDetail || null,
        progress: document.querySelector("#progress")?.textContent || "",
        cache: await window.CnCPort.rpc("mapCacheProbe", {}).catch(() => null),
        refresh: await window.CnCPort.rpc("mapCacheRefresh", {}).catch(() => null),
        filesystem,
      };
    }
  });
  assert.equal(playtest.error, undefined,
    `World Builder playtest launch failed: ${JSON.stringify(playtest)}`);
  const { result } = playtest;
  assert.equal(result?.map?.players, 2,
    `the original map cache did not classify the authored map as two-player: ${JSON.stringify(result)}`);
  assert.match(result.map.key, /World Builder Playtest\.map$/i);
  assert.equal(result?.applied?.applied?.toLowerCase(), result.map.key.toLowerCase());

  const mountedBytes = await page.evaluate((path) => {
    const filesystem = window.CnCPort.engineModule().FS;
    return Array.from(filesystem.readFile(path));
  }, result.record.path);
  const mountedDocument = await MapDocument.fromBytes(Uint8Array.from(mountedBytes), {
    name: result.record.name,
  });
  assert.equal(mountedDocument.sides.definitions.length, 14,
    "the mounted map lost its standard skirmish sides");
  assert.equal(mountedDocument.objects.length, 4,
    "the mounted map lost authored objects or start positions");

  const cache = await rpc(page, "mapCacheProbe");
  const selectedPath = cache?.probe?.skirmishGameInfo?.map;
  assert.equal(String(selectedPath).toLowerCase(), result.map.key.toLowerCase(),
    "the original SkirmishGameInfo did not retain the World Builder map");

  stage("configuring a real AI opponent and starting the authored map");
  await selectIndex(page, "SkirmishGameOptionsMenu.wnd:ComboBoxPlayer1", 2);
  let startAccepted = false;
  for (let attempt = 0; attempt < 20 && !startAccepted; attempt += 1) {
    try {
      await activate(page, "SkirmishGameOptionsMenu.wnd:ButtonStart");
    } catch {
      const snapshot = await rpc(page, "agentUiSnapshot");
      const startStillVisible = snapshot?.result?.windows?.some((window) =>
        window.name === "SkirmishGameOptionsMenu.wnd:ButtonStart"
          && window.visible && window.interactive);
      if (!startStillVisible) {
        startAccepted = true;
        break;
      }
      throw new Error("the original skirmish Start button stopped accepting activation");
    }
    startAccepted = await page.waitForFunction(() => {
      const frame = window.CnCPort?.state?.threadedEngine?.frame;
      return frame?.loadSessionActive === true || frame?.gameplay?.inGame === true;
    }, null, { timeout: 3_000, polling: 100 }).then(() => true).catch(() => false);
  }
  assert.equal(startAccepted, true, "the original skirmish menu did not start a load session");

  const playDeadline = Date.now() + timeoutMs;
  let nextLoadReport = 0;
  let liveState = null;
  while (Date.now() < playDeadline) {
    const runtime = await page.evaluate(() => {
      const engine = window.CnCPort?.state?.threadedEngine;
      return {
        frame: engine?.frame || null,
        loop: engine?.loop || null,
        abort: engine?.abort || null,
      };
    });
    const sampled = await rpc(page, "realEngineFrameSummary", { frames: 1 });
    liveState = { runtime, sampled };
    const frameState = sampled?.frame;
    const logicFrame = Number(frameState?.logicFrame ?? frameState?.gameplay?.logicFrame ?? 0);
    if (frameState?.loadSessionActive === false
        && logicFrame > 0
        && frameState?.gameplay?.inGame === true
        && Number(frameState?.gameplay?.objectCount || 0) > 0) {
      break;
    }
    if (Date.now() >= nextLoadReport) {
      nextLoadReport = Date.now() + 10_000;
      stage(`load state ${JSON.stringify({
        loadSessionActive: frameState?.loadSessionActive,
        logicFrame,
        inGame: frameState?.gameplay?.inGame,
        objectCount: frameState?.gameplay?.objectCount,
        drawableCount: frameState?.gameplay?.drawableCount,
        localPlayer: frameState?.gameplay?.localPlayer,
        loop: runtime.loop,
        abort: runtime.abort,
      })}`);
    }
    await page.waitForTimeout(500);
  }
  assert.equal(liveState?.sampled?.frame?.gameplay?.inGame, true,
    `authored map did not enter gameplay: ${JSON.stringify({
      liveState,
      console: consoleLines.slice(-100),
    })}`);
  assert.ok(Number(liveState?.sampled?.frame?.gameplay?.objectCount || 0) > 0,
    `authored map did not create gameplay objects: ${JSON.stringify({
      liveState,
      console: consoleLines.slice(-100),
    })}`);

  const frame = await rpc(page, "realEngineFrameSummary", { frames: 3 });
  assert.equal(frame?.ok, true, "real-engine frame sampling failed");
  assert.equal(frame?.aborted, false, `real engine aborted: ${frame?.abortMessage || ""}`);
  assert.equal(frame?.frame?.exceptionCaught, false, "real engine caught an exception");
  assert.equal(frame?.frame?.gameplay?.inGame, true, "authored map did not enter gameplay");
  assert.ok(frame.frame.gameplay.objectCount > 0, "authored map did not create gameplay objects");

  const drawables = await rpc(page, "queryDrawables");
  const drawableList = drawables?.result?.drawables
    || drawables?.drawables?.drawables
    || drawables?.drawables
    || [];
  assert.ok(drawableList.length > 0, "authored map did not expose real W3D drawables");

  await page.locator("#viewport").screenshot({ path: screenshotPath });
  const pixels = await page.locator("#viewport").evaluate((canvas) => {
    let context = null;
    try {
      context = canvas.getContext("webgl2");
    } catch {
      // Threaded builds transfer the live context to the engine worker.
    }
    let snapshot = null;
    if (!context) {
      const scratch = document.createElement("canvas");
      scratch.width = canvas.width;
      scratch.height = canvas.height;
      snapshot = scratch.getContext("2d", { willReadFrequently: true });
      snapshot?.drawImage(canvas, 0, 0);
    }
    if (!context && !snapshot) return { colors: 0, visible: 0 };
    const width = canvas.width;
    const height = canvas.height;
    const sample = new Uint8Array(4);
    const colors = new Set();
    let visible = 0;
    for (let y = 1; y < 8; y += 1) {
      for (let x = 1; x < 12; x += 1) {
        const sampleX = Math.floor(width * x / 12);
        const sampleY = Math.floor(height * y / 8);
        if (context) {
          context.readPixels(
            sampleX,
            height - sampleY - 1,
            1,
            1,
            context.RGBA,
            context.UNSIGNED_BYTE,
            sample,
          );
        } else {
          sample.set(snapshot.getImageData(sampleX, sampleY, 1, 1).data);
        }
        colors.add(`${sample[0]},${sample[1]},${sample[2]}`);
        if (sample[0] + sample[1] + sample[2] > 12) visible += 1;
      }
    }
    return { colors: colors.size, visible };
  });
  assert.ok(pixels.visible > 0 && pixels.colors > 1,
    `real W3D frame lacked visible pixel variation: ${JSON.stringify(pixels)}`);
  assert.deepEqual(pageErrors, []);

  const graphics = await page.evaluate(() => {
    const threaded = window.CnCPort?.state?.threadedEngine;
    if (threaded) {
      return {
        renderer: threaded.graphics?.renderer ?? null,
        contextLost: threaded.contextLost === true,
      };
    }
    const context = document.querySelector("#viewport")?.getContext("webgl2");
    const debug = context?.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: context?.getParameter(
        debug?.UNMASKED_RENDERER_WEBGL ?? context?.RENDERER,
      ) ?? null,
      contextLost: context?.isContextLost() ?? true,
    };
  });
  assert.equal(graphics.contextLost, false, "the World Builder playtest lost its WebGL context");
  assert.ok(!expectedRenderer || String(graphics.renderer).toLowerCase().includes(expectedRenderer),
    `the World Builder playtest did not use the expected renderer: ${JSON.stringify(graphics)}`);

  console.log(JSON.stringify({
    ok: true,
    map: result.map,
    saved: result.record,
    gameplay: {
      logicFrame: frame.frame.logicFrame ?? frame.frame.gameplay.logicFrame,
      objectCount: frame.frame.gameplay.objectCount,
      drawableCount: drawableList.length,
    },
    graphics,
    pixels,
    screenshot: screenshotPath,
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
  if (!keepProfile) await rm(profileDir, { recursive: true, force: true });
}
