import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const repoRoot = resolve(wasmRoot, "..");
const timeoutMs = Number(process.env.AGENT_BRIDGE_BOOT_TIMEOUT_MS ?? 15 * 60 * 1000);
const dist = process.env.AGENT_BRIDGE_DIST ?? "dist-threaded";
const browserExecutable = process.env.AGENT_BRIDGE_BROWSER_EXECUTABLE
  ?? process.env.CHROME_PATH;
const browserArgs = (process.env.AGENT_BRIDGE_BROWSER_ARGS ?? "")
  .split(/\s+/)
  .filter(Boolean);
const OPTIONAL_404_PATHS = new Set([
  "/artifacts/browser-video/bink/bink-browser-video-manifest.json",
  "/artifacts/real-assets/cursors/manifest.json",
]);

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function unusedPort() {
  const server = createServer();
  server.unref();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close((error) =>
    (error ? reject(error) : resolveClose())));
  return port;
}

async function waitFor(label, operation, accept, deadline = timeoutMs) {
  const started = Date.now();
  let last;
  while (Date.now() - started < deadline) {
    try {
      last = await operation();
      if (accept(last)) return last;
    } catch (error) {
      last = { error: error?.message ?? String(error) };
    }
    await delay(250);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)?.slice(0, 1000)}`);
}

function startBridge({ port, engineToken, apiToken }) {
  const executable = process.env.AGENT_BRIDGE_EXECUTABLE;
  const command = executable || "go";
  const args = [
    ...(executable ? [] : ["run", "./cmd/new-shoes-agent-bridge"]),
    `-listen=${process.env.AGENT_BRIDGE_SERVE_HOST ?? "127.0.0.1"}:${port}`,
    `-engine-url=ws://127.0.0.1:${port}/engine`,
    `-engine-token=${engineToken}`,
    `-api-token=${apiToken}`,
  ];
  const child = spawn(command, args, {
    cwd: resolve(repoRoot, "AgentBridge"),
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-16 * 1024);
  });
  child.on("error", (error) => {
    stderr = `${stderr}${error?.stack ?? error}`.slice(-16 * 1024);
  });
  child.failureDetail = () => stderr;
  return child;
}

async function stopBridge(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([once(child, "exit"), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const port = await unusedPort();
  const engineToken = randomUUID();
  const apiToken = randomUUID();
  const sessionId = `browser-smoke-${randomUUID()}`;
  const bridgeBase = `http://127.0.0.1:${port}`;
  const bridge = startBridge({ port, engineToken, apiToken });
  const server = await startStaticServer({
    root: wasmRoot,
    port: 0,
    host: process.env.AGENT_BRIDGE_SERVE_HOST ?? "127.0.0.1",
  });
  const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/agent-bridge-browser-smoke");
  const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  let browser;
  let pageDiagnostic = null;
  const consoleErrors = [];
  const httpFailures = [];
  try {
    process.stderr.write(`[agent-bridge-browser] launcher ${server.url}\n`);
    process.stderr.write(`[agent-bridge-browser] bridge ${bridgeBase}\n`);
    await waitFor("Go bridge health", () => fetch(`${bridgeBase}/healthz`),
      (response) => response.ok, 30000);
    browser = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      ...(browserExecutable ? { executablePath: browserExecutable } : {}),
      args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
    });
    await browser.addInitScript((config) => {
      window.CnCPortPlayConfig = config;
    }, {
      agentBridge: {
        url: `ws://127.0.0.1:${port}/engine`,
        token: engineToken,
        sessionId,
      },
    });

    const page = await browser.newPage();
    const renderer = await page.evaluate(() => {
      const context = document.createElement("canvas").getContext("webgl2");
      const extension = context?.getExtension("WEBGL_debug_renderer_info");
      return extension
        ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : context?.getParameter(context.RENDERER) ?? "unknown";
    });
    if (/swiftshader|llvmpipe|software/i.test(renderer)) {
      throw new Error(`browser did not use a hardware GPU: ${renderer}`);
    }
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error?.message ?? String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        httpFailures.push({ status: response.status(), url: response.url() });
      }
    });
    const localServerUrl = new URL(server.url);
    localServerUrl.hostname = "127.0.0.1";
    const pageUrl = new URL(`harness/play.html?autostart=1&dist=${dist}`, localServerUrl);
    await page.goto(pageUrl.href, { waitUntil: "load" });
    pageDiagnostic = await page.evaluate(() => ({
      hostConfigured: Boolean(window.CnCPortPlayConfig?.agentBridge),
      hostTokenLength: String(window.CnCPortPlayConfig?.agentBridge?.token ?? "").length,
      publicConfiguration: window.CnCPort?.play?.getConfiguration?.().agentBridge ?? null,
      bridgeState: window.CnCPort?.getAgentBridgeState?.() ?? null,
    }));
    process.stderr.write(`[agent-bridge-browser] page ${JSON.stringify(pageDiagnostic)}\n`);
    const adapterState = await waitFor("browser agent adapter", () => page.evaluate(() => ({
      bridge: window.CnCPort?.getAgentBridgeState?.() ?? null,
      progress: document.querySelector("#launchStatus")?.textContent ?? "",
      runtimeStarted: window.ZeroHRuntime?.started === true,
    })), (state) => state.bridge?.configured === true, timeoutMs);
    process.stderr.write(`[agent-bridge-browser] adapter ${JSON.stringify(adapterState)}\n`);

    const authorization = { Authorization: `Bearer ${apiToken}` };
    const rest = async (path, options = {}) => {
      const response = await fetch(`${bridgeBase}${path}`, {
        ...options,
        headers: {
          ...authorization,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      });
      const body = await response.json();
      return { status: response.status, body };
    };
    await waitFor("authenticated browser session",
      () => rest("/v1/sessions"),
      (reply) => reply.status === 200
        && reply.body.sessions?.some((session) => session.id === sessionId),
      30000);

    const sessionPath = `/v1/sessions/${encodeURIComponent(sessionId)}`;
    const snapshotsPath = `${sessionPath}/ui`;
    const pointerPath = `${sessionPath}/input/pointer`;
    const pointer = await rest(
      pointerPath,
      { method: "POST", body: JSON.stringify({ x: 160, y: 160 }) },
    );
    if (pointer.status !== 200 || pointer.body.result?.ok !== true) {
      throw new Error(`pointer move failed: ${JSON.stringify(pointer)}`);
    }
    let nextPointerWake = 0;
    const mainMenu = await waitFor("semantic main-menu snapshot",
      async () => {
        if (Date.now() >= nextPointerWake) {
          nextPointerWake = Date.now() + 1000;
          await rest(pointerPath, {
            method: "POST",
            body: JSON.stringify({ x: 160, y: 160 }),
          });
        }
        return rest(snapshotsPath);
      },
      (reply) => reply.status === 200
        && reply.body.result?.windows?.some((window) =>
          window.name === "MainMenu.wnd:ButtonSinglePlayer"
          && window.kind === "button"
          && window.visible === true
          && window.interactive === true),
      Math.min(timeoutMs, 5 * 60_000));
    const singlePlayer = mainMenu.body.result.windows.find((window) =>
      window.name === "MainMenu.wnd:ButtonSinglePlayer");
    const unrestrictedMenu = await rest(`${snapshotsPath}?includeHidden=true`);
    const unrestrictedSinglePlayer = unrestrictedMenu.body.result?.windows?.find((window) =>
      window.name === singlePlayer.name);
    if (unrestrictedMenu.status !== 200
        || unrestrictedSinglePlayer?.visible !== true
        || unrestrictedSinglePlayer?.interactive !== true) {
      throw new Error(`unrestricted snapshot lost visible UI: ${JSON.stringify({
        status: unrestrictedMenu.status,
        windowCount: unrestrictedMenu.body.result?.windowCount,
        truncated: unrestrictedMenu.body.result?.truncated,
        singlePlayer: unrestrictedSinglePlayer,
      })}`);
    }
    const mainScreenshot = resolve(screenshotDir, "agent-bridge-main-menu.png");
    const mainPixels = await page.screenshot({ path: mainScreenshot });

    const stale = await rest(
      `/v1/sessions/${encodeURIComponent(sessionId)}/ui/activate`,
      {
        method: "POST",
        body: JSON.stringify({
          windowId: singlePlayer.id,
          name: `${singlePlayer.name}-stale`,
        }),
      },
    );
    if (stale.status !== 404 || stale.body.error?.code !== "stale_window") {
      throw new Error(`stale-window guard failed: ${JSON.stringify(stale)}`);
    }

    const activation = await rest(
      `/v1/sessions/${encodeURIComponent(sessionId)}/ui/activate`,
      {
        method: "POST",
        body: JSON.stringify({ windowId: singlePlayer.id, name: singlePlayer.name }),
      },
    );
    if (activation.status !== 200 || activation.body.result?.ok !== true) {
      throw new Error(`single-player activation failed: ${JSON.stringify(activation)}`);
    }
    const submenu = await waitFor("semantic single-player submenu",
      () => rest(snapshotsPath),
      (reply) => reply.status === 200
        && reply.body.result?.windows?.some((window) =>
          window.name === "MainMenu.wnd:ButtonSkirmish"
          && window.visible === true
          && window.interactive === true),
      30000);
    const submenuScreenshot = resolve(screenshotDir, "agent-bridge-single-player-menu.png");
    const submenuPixels = await page.screenshot({ path: submenuScreenshot });

    const skirmishButton = submenu.body.result.windows.find((window) =>
      window.name === "MainMenu.wnd:ButtonSkirmish");
    const skirmishActivation = await rest(
      `/v1/sessions/${encodeURIComponent(sessionId)}/ui/activate`,
      {
        method: "POST",
        body: JSON.stringify({ windowId: skirmishButton.id, name: skirmishButton.name }),
      },
    );
    if (skirmishActivation.status !== 200 || skirmishActivation.body.result?.ok !== true) {
      throw new Error(`skirmish activation failed: ${JSON.stringify(skirmishActivation)}`);
    }
    const skirmishOptions = await waitFor("semantic skirmish options",
      () => rest(snapshotsPath),
      (reply) => reply.status === 200
        && reply.body.result?.windows?.some((window) =>
          window.name === "SkirmishGameOptionsMenu.wnd:ButtonStart"
          && window.visible === true
          && window.interactive === true),
      60000);
    const startButton = skirmishOptions.body.result.windows.find((window) =>
      window.name === "SkirmishGameOptionsMenu.wnd:ButtonStart");
    const optionsScreenshot = resolve(screenshotDir, "agent-bridge-skirmish-options.png");
    const optionsPixels = await page.screenshot({ path: optionsScreenshot });
    const startActivation = await rest(
      `/v1/sessions/${encodeURIComponent(sessionId)}/ui/activate`,
      {
        method: "POST",
        body: JSON.stringify({ windowId: startButton.id, name: startButton.name }),
      },
    );
    if (startActivation.status !== 200 || startActivation.body.result?.ok !== true) {
      throw new Error(`skirmish start failed: ${JSON.stringify(startActivation)}`);
    }

    const worldPath = `/v1/sessions/${encodeURIComponent(sessionId)}/world`;
    const unrestrictedWorld = await waitFor("live unrestricted world observation",
      () => rest(`${worldPath}?mode=unrestricted`),
      (reply) => reply.status === 200
        && reply.body.result?.game?.mode === "skirmish"
        && reply.body.result?.game?.playable === true
        && reply.body.result?.objects?.some((object) => object.capabilities !== null)
        && reply.body.result?.players?.some((player) => player.local && player.economy !== null),
      Math.min(timeoutMs, 8 * 60_000));
    const world = unrestrictedWorld.body.result;
    const objectIds = world.objects.map((object) => object.id);
    if (world.truncated === true
        || world.objects.some((object) => object.shroud !== "clear" && object.shroud !== "partial")
        || world.players.some((player) => !player.local && player.economy !== null)
        || objectIds.some((id) => !Number.isSafeInteger(id) || id < 1)
        || new Set(objectIds).size !== objectIds.length
        || "worldObjectCount" in world
        || "visibilityRejectedCount" in world
        || "cameraRejectedCount" in world) {
      throw new Error(`unrestricted world violated visibility contract: ${JSON.stringify({
        truncated: world.truncated,
        objectCount: world.objectCount,
        shroud: [...new Set(world.objects.map((object) => object.shroud))],
        remoteEconomy: world.players.filter((player) => !player.local).map((player) => player.economy),
      })}`);
    }
    const cameraWorldReply = await rest(`${worldPath}?mode=camera`);
    const cameraWorld = cameraWorldReply.body.result;
    if (cameraWorldReply.status !== 200
        || cameraWorld?.observationMode !== "camera"
        || cameraWorld.objectCount > world.objectCount
        || cameraWorld.objects.some((object) => object.screen === null)) {
      throw new Error(`camera world violated view contract: ${JSON.stringify(cameraWorldReply)}`);
    }

    const terrainExtent = world.terrain.extent;
    const terrainParameters = new URLSearchParams({
      mode: "unrestricted",
      minX: String(terrainExtent.lo.x),
      minY: String(terrainExtent.lo.y),
      maxX: String(terrainExtent.hi.x),
      maxY: String(terrainExtent.hi.y),
      columns: "32",
      rows: "32",
    });
    const terrainReply = await rest(
      `/v1/sessions/${encodeURIComponent(sessionId)}/terrain?${terrainParameters}`,
    );
    const terrain = terrainReply.body.result;
    const heightBytes = terrain?.height?.data
      ? Buffer.from(terrain.height.data, "base64")
      : Buffer.alloc(0);
    const flagBytes = terrain?.flags?.data
      ? Buffer.from(terrain.flags.data, "base64")
      : Buffer.alloc(0);
    if (terrainReply.status !== 200
        || terrain?.columns !== 32
        || terrain?.rows !== 32
        || terrain.knownCount < 1
        || terrain.visibleCount < 1
        || terrain.visibleCount >= 32 * 32
        || terrain.knownCount < terrain.visibleCount
        || heightBytes.length !== 32 * 32 * 2
        || flagBytes.length !== 32 * 32) {
      throw new Error(`terrain observation violated compact visibility contract: ${JSON.stringify({
        status: terrainReply.status,
        terrain,
        heightBytes: heightBytes.length,
        flagBytes: flagBytes.length,
      })}`);
    }
    terrainParameters.set("mode", "camera");
    const cameraTerrainReply = await rest(
      `/v1/sessions/${encodeURIComponent(sessionId)}/terrain?${terrainParameters}`,
    );
    const cameraTerrain = cameraTerrainReply.body.result;
    if (cameraTerrainReply.status !== 200
        || cameraTerrain?.observationMode !== "camera"
        || cameraTerrain.inCameraCount < 1
        || cameraTerrain.inCameraCount >= 32 * 32
        || cameraTerrain.knownCount > cameraTerrain.inCameraCount
        || cameraTerrain.knownCount > terrain.knownCount) {
      throw new Error(`camera terrain violated view contract: ${JSON.stringify(cameraTerrainReply)}`);
    }
    await delay(2000);
    const repeatedWorldReply = await rest(`${worldPath}?mode=unrestricted`);
    const repeatedWorld = repeatedWorldReply.body.result;
    const repeatedById = new Map(
      repeatedWorld?.objects?.map((object) => [object.id, object]) ?? [],
    );
    const localReferences = world.objects.filter((object) => object.capabilities !== null);
    if (repeatedWorldReply.status !== 200
        || localReferences.some((object) => repeatedById.get(object.id)?.template !== object.template)) {
      throw new Error(`world object identities were not stable: ${JSON.stringify({
        status: repeatedWorldReply.status,
        before: localReferences.map(({ id, template }) => ({ id, template })),
        after: repeatedWorld?.objects?.map(({ id, template }) => ({ id, template })),
      })}`);
    }
    const matchScreenshot = resolve(screenshotDir, "agent-bridge-live-skirmish.png");
    const matchPixels = await page.screenshot({ path: matchScreenshot });

    if (mainPixels.length < 10 * 1024
        || submenuPixels.length < 10 * 1024
        || optionsPixels.length < 10 * 1024
        || matchPixels.length < 10 * 1024) {
      throw new Error("browser screenshots were unexpectedly small");
    }
    const unexpectedHttpFailures = httpFailures.filter((failure) =>
      failure.status !== 404 || !OPTIONAL_404_PATHS.has(new URL(failure.url).pathname));
    const expected404Count = httpFailures.length - unexpectedHttpFailures.length;
    let remainingExpected404Messages = expected404Count;
    const unexpectedConsoleErrors = consoleErrors.filter((message) => {
      const expected = message === "Failed to load resource: the server responded with a status of 404 (Not Found)"
        && remainingExpected404Messages > 0;
      if (expected) remainingExpected404Messages -= 1;
      return !expected;
    });
    if (pageErrors.length !== 0
        || unexpectedHttpFailures.length !== 0
        || unexpectedConsoleErrors.length !== 0) {
      throw new Error(`browser errors: ${JSON.stringify({
        pageErrors,
        unexpectedHttpFailures,
        unexpectedConsoleErrors,
      })}`);
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      protocol: mainMenu.body.result.protocol,
      renderer,
      sessionId,
      mainMenuWindowCount: mainMenu.body.result.windowCount,
      unrestrictedWindowCount: unrestrictedMenu.body.result.windowCount,
      unrestrictedTruncated: unrestrictedMenu.body.result.truncated,
      submenuWindowCount: submenu.body.result.windowCount,
      skirmishOptionsWindowCount: skirmishOptions.body.result.windowCount,
      staleWindowGuard: true,
      pointerWake: true,
      unrestrictedPreservesVisible: true,
      activation: singlePlayer.name,
      skirmishActivation: skirmishButton.name,
      startActivation: startButton.name,
      world: {
        frame: repeatedWorld.frame,
        objectCount: repeatedWorld.objectCount,
        cameraObjectCount: cameraWorld.objectCount,
        localMoney: world.players.find((player) => player.local)?.economy?.money,
      },
      terrain: {
        knownCount: terrain.knownCount,
        visibleCount: terrain.visibleCount,
        cameraKnownCount: cameraTerrain.knownCount,
        cameraSampleCount: cameraTerrain.inCameraCount,
        sampleCount: terrain.columns * terrain.rows,
        heightBytes: heightBytes.length,
        flagBytes: flagBytes.length,
      },
      expectedOptional404s: httpFailures.map((failure) => new URL(failure.url).pathname),
      screenshots: [mainScreenshot, submenuScreenshot, optionsScreenshot, matchScreenshot],
    }, null, 2)}\n`);
  } catch (error) {
    const bridgeError = bridge.failureDetail();
    throw new Error(`${error?.stack ?? error}`
      + `${pageDiagnostic ? `\npage diagnostic: ${JSON.stringify(pageDiagnostic)}` : ""}`
      + `${consoleErrors.length ? `\nconsole errors:\n${consoleErrors.join("\n")}` : ""}`
      + `${httpFailures.length ? `\nHTTP failures:\n${JSON.stringify(httpFailures, null, 2)}` : ""}`
      + `${bridgeError ? `\nbridge stderr:\n${bridgeError}` : ""}`);
  } finally {
    if (browser) await browser.close();
    await server.close();
    await stopBridge(bridge);
    await rm(profileDir, { recursive: true, force: true });
  }
}

await main();
