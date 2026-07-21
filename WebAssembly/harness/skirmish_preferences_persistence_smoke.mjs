#!/usr/bin/env node

import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const artifactRoot = resolve(
  process.env.SKIRMISH_PREFERENCES_ARTIFACT_DIR
    ?? join(wasmRoot, "artifacts/skirmish-preferences-persistence"),
);
const profileDir = join(artifactRoot, "browser-profile");
const distDir = process.env.SKIRMISH_PREFERENCES_DIST ?? "dist-threaded-release";
const bootTimeoutMs = Number(process.env.SKIRMISH_PREFERENCES_BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const browserExecutablePath = process.env.SKIRMISH_PREFERENCES_BROWSER_EXECUTABLE
  ?? process.env.CHROME_PATH;
const browserArgs = (process.env.SKIRMISH_PREFERENCES_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);
const expectedGpuRenderer = process.env.SKIRMISH_PREFERENCES_EXPECT_GPU ?? null;
const verbose = process.env.VERBOSE === "1";
const expectedProfileName = "Persistent Commander";
const preferencesPath = "/home/web_user/Command and Conquer Generals Zero Hour Data/Skirmish.ini";

function expect(condition, message, payload = null) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(payload)}`);
}

function log(message) {
  process.stdout.write(`[skirmish-preferences] ${message}\n`);
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(
    ({ command: name, payload: data }) => window.CnCPort.rpc(name, data),
    { command, payload },
  );
}

async function captureViewport(page, filename) {
  const shot = await rpc(page, "screenshot");
  const dataUrl = typeof shot?.screenshot === "string"
    ? shot.screenshot
    : shot?.screenshot?.dataUrl;
  expect(typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,"),
    "screenshot RPC returned no PNG", shot);
  const path = join(artifactRoot, filename);
  await writeFile(path, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
  return path;
}

async function clickUntilWindow(page, sourceName, targetName, attempts = 80) {
  let lastClick = null;
  let lastTarget = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastClick = await rpc(page, "clickWindowByName", { name: sourceName });
    await page.waitForTimeout(500);
    lastTarget = await rpc(page, "queryWindowByName", { name: targetName });
    if (lastTarget?.result?.found === true
        && lastTarget.result.clickable === true
        && lastTarget.result.managerHidden !== true) {
      return lastTarget.result;
    }
  }
  throw new Error(`clicking ${sourceName} did not expose ${targetName}: ${JSON.stringify({
    lastClick,
    lastTarget,
  })}`);
}

async function openSkirmishOptions(page) {
  await clickUntilWindow(page, "MainMenu.wnd:ButtonSinglePlayer", "MainMenu.wnd:ButtonSkirmish");
  await clickUntilWindow(
    page,
    "MainMenu.wnd:ButtonSkirmish",
    "SkirmishGameOptionsMenu.wnd:ButtonStart",
  );
  return rpc(page, "mapCacheProbe");
}

async function openPlayPage(browser, serverUrl, label) {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.on("console", (message) => {
    const line = `${label} ${message.type()}: ${message.text()}`;
    if (verbose || message.type() === "error") process.stderr.write(`${line}\n`);
  });
  page.on("pageerror", (error) => {
    const line = `${label} pageerror: ${error.stack ?? error.message}`;
    process.stderr.write(`${line}\n`);
  });
  const url = new URL("harness/play.html", serverUrl);
  url.searchParams.set("autostart", "1");
  url.searchParams.set("dist", distDir);
  url.searchParams.set("shellmap", "0");
  await page.goto(url.href, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const engine = window.CnCPort?.state?.threadedEngine;
    return window.ZeroHRuntime?.started === true
      && engine?.loop?.active === true
      && engine?.frame?.loadSessionActive === false
      && (engine.loop.clientFrames ?? 0) > 30;
  }, null, { timeout: bootTimeoutMs, polling: 1000 });
  await page.waitForFunction(() => Boolean(window.ZeroHLlmAi?.store), null, {
    timeout: bootTimeoutMs,
  });
  const renderer = await page.evaluate(() =>
    String(window.CnCPort?.state?.threadedEngine?.graphics?.renderer ?? ""));
  if (expectedGpuRenderer) {
    expect(renderer.includes(expectedGpuRenderer), "unexpected worker GPU renderer", {
      renderer,
      expectedGpuRenderer,
    });
  }
  const viewport = await page.locator("#viewport").boundingBox();
  if (viewport) await page.mouse.move(viewport.x + 80, viewport.y + 80);
  log(`${label} runtime ready (${renderer || "renderer unavailable"})`);
  return page;
}

async function saveProfile(page) {
  return page.evaluate(async (name) => {
    const profile = await window.ZeroHLlmAi.store.saveProfile({
      id: "persistent-commander",
      name,
      endpoint: "http://127.0.0.1:1",
      model: "persistence-smoke",
      thinkingEffort: "none",
      contextSize: 16_384,
      responseTokens: 1_024,
      requestTimeoutMs: 5_000,
      classicFallback: true,
    });
    await window.ZeroHLlmAi.refresh();
    await window.ZeroHLlmAi.syncProfileCatalog();
    return { id: profile.id, name: profile.name };
  }, expectedProfileName);
}

async function syncProfiles(page) {
  return page.evaluate(async () => {
    await window.ZeroHLlmAi.refresh();
    await window.ZeroHLlmAi.syncProfileCatalog();
    return window.ZeroHLlmAi.listProfiles();
  });
}

async function selectRow(page, windowName, predicateDescription, predicate) {
  const snapshot = await rpc(page, "agentUiSnapshot");
  const window = snapshot?.result?.windows?.find((candidate) =>
    candidate.name === windowName && candidate.visible && candidate.interactive);
  expect(Boolean(window), `${windowName} is unavailable`, snapshot);
  const items = await rpc(page, "agentUiListItems", {
    windowId: window.id,
    name: window.name,
    offset: 0,
    limit: 128,
  });
  const row = items?.result?.rows?.find((candidate) => predicate(candidate.cells.join(" ")));
  expect(Boolean(row), `${windowName} has no ${predicateDescription} row`, items);
  const selected = await rpc(page, "agentUiSelectIndex", {
    windowId: window.id,
    name: window.name,
    index: row.index,
  });
  expect(selected?.ok === true && selected?.result?.ok === true
      && selected.result.notificationHandled > 0,
  `${windowName} selection did not reach the real callback`, selected);
  return { index: row.index, cells: row.cells };
}

async function startMatch(page) {
  let loadSeen = false;
  for (let attempt = 0; attempt < 16 && !loadSeen; attempt += 1) {
    await rpc(page, "clickWindowByName", { name: "SkirmishGameOptionsMenu.wnd:ButtonStart" });
    loadSeen = await page.waitForFunction(() =>
      window.CnCPort?.state?.threadedEngine?.frame?.loadSessionActive === true,
    null, { timeout: 10000, polling: 500 }).then(() => true).catch(() => false);
  }
  expect(loadSeen, "skirmish load session never started");
  await page.waitForFunction(() => {
    const frame = window.CnCPort?.state?.threadedEngine?.frame;
    return frame?.loadSessionActive === false && Number(frame.logicFrame ?? 0) > 120;
  }, null, { timeout: 20 * 60 * 1000, polling: 1000 });
}

async function readPreferences(page) {
  return page.evaluate((path) => {
    const module = window.CnCPort.engineModule();
    return new TextDecoder().decode(module.FS.readFile(path));
  }, preferencesPath);
}

async function main() {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const browser = await chromium.launchPersistentContext(profileDir, {
    viewport: { width: 1280, height: 800 },
    ...(browserExecutablePath ? { executablePath: browserExecutablePath } : {}),
    args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
  });
  const summary = {};
  try {
    log("selecting an LLM commander and starting a real match");
    const firstPage = await openPlayPage(browser, server.url, "first");
    summary.profile = await saveProfile(firstPage);
    await openSkirmishOptions(firstPage);
    summary.selection = await selectRow(
      firstPage,
      "SkirmishGameOptionsMenu.wnd:ComboBoxPlayer1",
      expectedProfileName,
      (text) => text.includes(`LLM: ${expectedProfileName}`),
    );
    const selected = await rpc(firstPage, "mapCacheProbe");
    summary.selectedSlot = selected?.probe?.skirmishGameInfo?.slots?.[1] ?? null;
    expect(summary.selectedSlot?.llmAi === true
        && summary.selectedSlot?.llmAiProfileId === summary.profile.id,
    "real skirmish slot did not receive the LLM profile", summary.selectedSlot);

    await startMatch(firstPage);
    await firstPage.evaluate(() => window.ZeroHLlmAiGameRuntime?.stop("persistence smoke"));
    summary.matchScreenshot = await captureViewport(firstPage, "match-with-llm-commander.png");
    summary.preferences = await readPreferences(firstPage);
    expect(summary.preferences.includes(`LlmAiProfile1 = ${summary.profile.id}`),
      "Skirmish.ini did not record the LLM profile selection", summary.preferences);
    summary.firstExit = await firstPage.evaluate(() => window.ZeroHRuntime.exit());
    expect(summary.firstExit?.ok === true, "first runtime did not close cleanly", summary.firstExit);
    await firstPage.close();

    log("booting a fresh runtime and reopening the skirmish menu");
    const secondPage = await openPlayPage(browser, server.url, "second");
    summary.profilesAfterRelaunch = await syncProfiles(secondPage);
    const restored = await openSkirmishOptions(secondPage);
    summary.restoredSlot = restored?.probe?.skirmishGameInfo?.slots?.[1] ?? null;
    summary.restoredScreenshot = await captureViewport(
      secondPage,
      "llm-commander-restored-after-relaunch.png",
    );
    expect(summary.restoredSlot?.llmAi === true
        && summary.restoredSlot?.llmAiProfileId === summary.profile.id,
    "fresh runtime did not restore the selected LLM commander", summary.restoredSlot);

    await secondPage.evaluate(async (profileId) => {
      await window.ZeroHLlmAi.store.deleteProfile(profileId);
      await window.ZeroHLlmAi.refresh();
      await window.ZeroHLlmAi.syncProfileCatalog();
    }, summary.profile.id);
    summary.secondExit = await secondPage.evaluate(() => window.ZeroHRuntime.exit());
    expect(summary.secondExit?.ok === true, "second runtime did not close cleanly", summary.secondExit);
    await secondPage.close();

    log("checking the classic fallback after deleting the browser profile");
    const thirdPage = await openPlayPage(browser, server.url, "third");
    summary.profilesAfterDelete = await syncProfiles(thirdPage);
    const fallback = await openSkirmishOptions(thirdPage);
    summary.fallbackSlot = fallback?.probe?.skirmishGameInfo?.slots?.[1] ?? null;
    expect(summary.profilesAfterDelete.length === 0
        && summary.fallbackSlot?.ai === true
        && summary.fallbackSlot?.llmAi === false,
    "deleted LLM profile did not fall back to its classic AI state", {
      profiles: summary.profilesAfterDelete,
      slot: summary.fallbackSlot,
    });
    summary.thirdExit = await thirdPage.evaluate(() => window.ZeroHRuntime.exit());
    expect(summary.thirdExit?.ok === true, "third runtime did not close cleanly", summary.thirdExit);
    await thirdPage.close();
  } finally {
    await browser.close();
    await server.close();
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write("skirmish preferences persistence smoke: OK\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
