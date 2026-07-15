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
const preserveProfile = process.env.AGENT_BRIDGE_PRESERVE_PROFILE === "1";
const staticPort = Number(process.env.AGENT_BRIDGE_STATIC_PORT ?? 0);
if (!Number.isInteger(staticPort) || staticPort < 0 || staticPort > 65535) {
  throw new Error("AGENT_BRIDGE_STATIC_PORT must be an integer from 0 through 65535");
}
const OPTIONAL_404_PATHS = new Set([
  "/artifacts/browser-video/bink/bink-browser-video-manifest.json",
  "/artifacts/real-assets/cursors/manifest.json",
]);

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function collectSSE(response, messages) {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true }).replaceAll("\r\n", "\n");
    for (;;) {
      const boundary = buffered.indexOf("\n\n");
      if (boundary < 0) break;
      const block = buffered.slice(0, boundary);
      buffered = buffered.slice(boundary + 2);
      let event = "";
      let id = null;
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("id: ")) id = Number(line.slice(4));
        else if (line.startsWith("data: ")) data.push(line.slice(6));
      }
      if (event) {
        messages.push({
          event,
          id,
          data: data.length ? JSON.parse(data.join("\n")) : null,
        });
      }
    }
  }
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

function startBridge({ port, engineToken, apiToken, playMode }) {
  const executable = process.env.AGENT_BRIDGE_EXECUTABLE;
  const command = executable || "go";
  const args = [
    ...(executable ? [] : ["run", "./cmd/new-shoes-agent-bridge"]),
    `-listen=${process.env.AGENT_BRIDGE_SERVE_HOST ?? "127.0.0.1"}:${port}`,
    `-engine-url=ws://127.0.0.1:${port}/engine`,
    `-engine-token=${engineToken}`,
    `-api-token=${apiToken}`,
    `-play-mode=${playMode}`,
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
  const playMode = "camera";
  const bridgeBase = `http://127.0.0.1:${port}`;
  const bridge = startBridge({ port, engineToken, apiToken, playMode });
  const server = await startStaticServer({
    root: wasmRoot,
    port: staticPort,
    host: process.env.AGENT_BRIDGE_SERVE_HOST ?? "127.0.0.1",
  });
  const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/agent-bridge-browser-smoke");
  const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
  if (!preserveProfile) await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  let browser;
  let eventStreamAbort;
  let eventCollector;
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
        playMode,
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
    page.on("pageerror", (error) => {
      const detail = error?.message ?? String(error);
      pageErrors.push(detail);
      process.stderr.write(`[agent-bridge-browser] page error ${detail}\n`);
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
        process.stderr.write(`[agent-bridge-browser] console error ${message.text()}\n`);
      }
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
    let lastBootReport = "";
    let nextBootReport = 0;
    const adapterState = await waitFor("browser agent adapter", async () => {
      const state = await page.evaluate(() => ({
        bridge: window.CnCPort?.getAgentBridgeState?.() ?? null,
        progress: document.querySelector("#launchStatus")?.textContent ?? "",
        runtimeStarted: window.ZeroHRuntime?.started === true,
      }));
      const report = JSON.stringify(state);
      if (report !== lastBootReport || Date.now() >= nextBootReport) {
        process.stderr.write(`[agent-bridge-browser] boot ${report}\n`);
        lastBootReport = report;
        nextBootReport = Date.now() + 30_000;
      }
      return state;
    }, (state) => state.bridge?.configured === true, timeoutMs);
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
        && reply.body.sessions?.some((session) =>
          session.id === sessionId && session.playMode === playMode),
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
    let pointerWakeX = 161;
    const mainMenu = await waitFor("semantic main-menu snapshot",
      async () => {
        if (Date.now() >= nextPointerWake) {
          nextPointerWake = Date.now() + 1000;
          await rest(pointerPath, {
            method: "POST",
            body: JSON.stringify({ x: pointerWakeX, y: 160 }),
          });
          pointerWakeX = pointerWakeX === 160 ? 161 : 160;
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
    const armyCombo = skirmishOptions.body.result.windows.find((window) =>
      window.name === "SkirmishGameOptionsMenu.wnd:ComboBoxPlayerTemplate0");
    if (!armyCombo || armyCombo.kind !== "comboBox" || !armyCombo.actions.includes("listItems")) {
      throw new Error(`human army selector was not semantically accessible: ${JSON.stringify(
        armyCombo,
      )}`);
    }
    const armyItemsParameters = new URLSearchParams({
      windowId: String(armyCombo.id),
      name: armyCombo.name,
      offset: "0",
      limit: "64",
    });
    const armyItems = await rest(`${sessionPath}/ui/items?${armyItemsParameters}`);
    const usaArmy = armyItems.body.result?.rows?.find((row) =>
      row.cells.some((cell) => /^USA\b/i.test(cell.trim())));
    if (armyItems.status !== 200 || !usaArmy) {
      throw new Error(`USA army was not exposed by semantic list items: ${JSON.stringify(
        armyItems,
      )}`);
    }
    const armySelection = await rest(`${sessionPath}/ui/selection`, {
      method: "POST",
      body: JSON.stringify({
        windowId: armyCombo.id,
        name: armyCombo.name,
        index: usaArmy.index,
      }),
    });
    if (armySelection.status !== 200 || armySelection.body.result?.ok !== true) {
      throw new Error(`USA army selection failed: ${JSON.stringify(armySelection)}`);
    }
    await waitFor("semantic USA army selection", () => rest(snapshotsPath),
      (reply) => reply.status === 200
        && reply.body.result?.windows?.some((window) =>
          window.name === armyCombo.name
          && window.comboBox?.selectedIndex === usaArmy.index),
      30_000);
    const skirmishSlider = skirmishOptions.body.result.windows.find((window) =>
      (window.kind === "horizontalSlider" || window.kind === "verticalSlider")
      && window.visible === true
      && window.interactive === true
      && window.actions?.includes("setValue")
      && Number.isInteger(window.slider?.value)
      && Number.isInteger(window.slider?.min)
      && Number.isInteger(window.slider?.max)
      && window.slider.min < window.slider.max);
    if (!skirmishSlider) {
      throw new Error("skirmish options exposed no semantic slider value control");
    }
    const originalSliderValue = skirmishSlider.slider.value;
    const changedSliderValue = originalSliderValue === skirmishSlider.slider.min
      ? skirmishSlider.slider.max : skirmishSlider.slider.min;
    const sliderChange = await rest(`${sessionPath}/ui/value`, {
      method: "POST",
      body: JSON.stringify({
        windowId: skirmishSlider.id,
        name: skirmishSlider.name,
        value: changedSliderValue,
      }),
    });
    if (sliderChange.status !== 200 || sliderChange.body.result?.value !== changedSliderValue) {
      throw new Error(`semantic slider change failed: ${JSON.stringify(sliderChange)}`);
    }
    await waitFor("semantic slider state change", () => rest(snapshotsPath),
      (reply) => reply.status === 200
        && reply.body.result?.windows?.some((window) =>
          window.id === skirmishSlider.id && window.slider?.value === changedSliderValue),
      30_000);
    const sliderRestore = await rest(`${sessionPath}/ui/value`, {
      method: "POST",
      body: JSON.stringify({
        windowId: skirmishSlider.id,
        name: skirmishSlider.name,
        value: originalSliderValue,
      }),
    });
    if (sliderRestore.status !== 200 || sliderRestore.body.result?.value !== originalSliderValue) {
      throw new Error(`semantic slider restore failed: ${JSON.stringify(sliderRestore)}`);
    }
    const skirmishCheckbox = skirmishOptions.body.result.windows.find((window) =>
      (window.kind === "checkBox" || window.kind === "radioButton")
      && window.visible === true);
    if (!skirmishCheckbox || typeof skirmishCheckbox.checked !== "boolean") {
      throw new Error(`check-like gadget omitted authoritative state: ${JSON.stringify(
        skirmishCheckbox,
      )}`);
    }
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
    const forbiddenGlobalWorld = await rest(`${worldPath}?mode=unrestricted`);
    if (forbiddenGlobalWorld.status !== 400
        || forbiddenGlobalWorld.body.error?.code !== "invalid_request") {
      throw new Error(`camera session accepted a global observation override: ${JSON.stringify(
        forbiddenGlobalWorld,
      )}`);
    }
    const liveWorld = await waitFor("live camera-bound world observation",
      () => rest(worldPath),
      (reply) => reply.status === 200
        && reply.body.result?.game?.mode === "skirmish"
        && reply.body.result?.game?.playable === true
        && reply.body.result?.objects?.some((object) => object.capabilities !== null)
        && reply.body.result?.players?.some((player) => player.local && player.economy !== null),
      Math.min(timeoutMs, 8 * 60_000));
    const world = liveWorld.body.result;
    const hudReply = await rest(`${sessionPath}/hud`);
    const hud = hudReply.body.result;
    if (hudReply.status !== 200 || hud?.ok !== true
        || !Array.isArray(hud.messages)
        || !Array.isArray(hud.timers)
        || typeof hud.messagesVisible !== "boolean"
        || typeof hud.timersVisible !== "boolean"
        || !(hud.popup === null || typeof hud.popup === "object")
        || !(hud.subtitle === null || Array.isArray(hud.subtitle?.lines))) {
      throw new Error(`HUD snapshot violated semantic contract: ${JSON.stringify(hudReply)}`);
    }
    const objectIds = world.objects.map((object) => object.id);
    if (world.truncated === true
        || world.objects.some((object) => object.shroud !== "clear" && object.shroud !== "partial")
        || world.players.some((player) => !player.local && player.economy !== null)
        || objectIds.some((id) => !Number.isSafeInteger(id) || id < 1)
        || new Set(objectIds).size !== objectIds.length
        || "worldObjectCount" in world
        || "visibilityRejectedCount" in world
        || "cameraRejectedCount" in world) {
      throw new Error(`camera-bound world violated visibility contract: ${JSON.stringify({
        truncated: world.truncated,
        objectCount: world.objectCount,
        shroud: [...new Set(world.objects.map((object) => object.shroud))],
        remoteEconomy: world.players.filter((player) => !player.local).map((player) => player.economy),
      })}`);
    }
    const tacticalCapabilitiesReply = await rest(
      `${worldPath}?detail=tactical&includeCapabilities=true`,
    );
    const tacticalCapabilities = tacticalCapabilitiesReply.body.result;
    const localTacticalCapability = Object.values(
      tacticalCapabilities?.objectCapabilities ?? {},
    ).find((capability) => capability?.orderable === true);
    if (tacticalCapabilitiesReply.status !== 200
        || tacticalCapabilities?.observationDetail !== "tactical"
        || !tacticalCapabilities.objects?.every((object) =>
          Array.isArray(object.position) && object.position.length === 3
          && !("capabilities" in object))
        || typeof tacticalCapabilities.templates !== "object"
        || typeof tacticalCapabilities.commandSets !== "object"
        || !localTacticalCapability
        || typeof localTacticalCapability.commandState !== "object") {
      throw new Error(`tactical capability catalog violated compact contract: ${JSON.stringify(
        tacticalCapabilitiesReply,
      )}`);
    }
    const tacticalReply = await rest(`${worldPath}?detail=tactical`);
    const tactical = tacticalReply.body.result;
    const fullBytes = Buffer.byteLength(JSON.stringify(world));
    const tacticalBytes = Buffer.byteLength(JSON.stringify(tactical));
    if (tacticalReply.status !== 200
        || "templates" in tactical
        || "commandSets" in tactical
        || "objectCapabilities" in tactical
        || tacticalBytes >= fullBytes) {
      throw new Error(`tactical snapshot was not compact: ${JSON.stringify({
        status: tacticalReply.status,
        fullBytes,
        tacticalBytes,
        keys: Object.keys(tactical ?? {}),
      })}`);
    }
    const originalCameraView = {
      angle: world.camera.angle,
      pitch: world.camera.pitch,
      zoom: world.camera.zoom,
    };
    const requestedCameraView = {
      angle: originalCameraView.angle + 0.25,
      zoom: originalCameraView.zoom > 0.3
        ? originalCameraView.zoom - 0.05 : originalCameraView.zoom + 0.05,
    };
    const cameraViewChange = await rest(`${sessionPath}/camera/view`, {
      method: "POST",
      body: JSON.stringify(requestedCameraView),
    });
    const appliedCameraView = cameraViewChange.body.result;
    if (cameraViewChange.status !== 200
        || !Number.isFinite(appliedCameraView?.angle)
        || !Number.isFinite(appliedCameraView?.pitch)
        || !Number.isFinite(appliedCameraView?.zoom)) {
      throw new Error(`semantic camera view change failed: ${JSON.stringify(cameraViewChange)}`);
    }
    await waitFor("semantic camera view state", () => rest(worldPath),
      (reply) => reply.status === 200
        && Math.abs(reply.body.result?.camera?.angle - appliedCameraView.angle) < 0.001
        && Math.abs(reply.body.result?.camera?.zoom - appliedCameraView.zoom) < 0.001,
      30_000);
    const cameraViewRestore = await rest(`${sessionPath}/camera/view`, {
      method: "POST",
      body: JSON.stringify(originalCameraView),
    });
    if (cameraViewRestore.status !== 200
        || Math.abs(cameraViewRestore.body.result?.angle - originalCameraView.angle) >= 0.001
        || Math.abs(cameraViewRestore.body.result?.pitch - originalCameraView.pitch) >= 0.001
        || Math.abs(cameraViewRestore.body.result?.zoom - originalCameraView.zoom) >= 0.001) {
      throw new Error(`semantic camera view restore failed: ${JSON.stringify(cameraViewRestore)}`);
    }
    const cameraWorldReply = await rest(worldPath);
    const cameraWorld = cameraWorldReply.body.result;
    if (cameraWorldReply.status !== 200
        || cameraWorld?.observationMode !== "camera"
        || cameraWorld.objectCount > world.objectCount
        || cameraWorld.objects.some((object) => object.screen === null)) {
      throw new Error(`camera world violated view contract: ${JSON.stringify(cameraWorldReply)}`);
    }

    const terrainExtent = world.terrain.extent;
    const terrainParameters = new URLSearchParams({
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
        || terrain?.observationMode !== "camera"
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
    const minimapReply = await waitFor("available fog-safe minimap",
      () => rest(`${sessionPath}/minimap?columns=32&rows=32`),
      (reply) => reply.status === 200 && reply.body.result?.available === true,
      30_000);
    const minimap = minimapReply.body.result;
    const minimapKnowledge = minimap?.knowledge?.data
      ? Buffer.from(minimap.knowledge.data, "base64")
      : Buffer.alloc(0);
    if (minimapReply.status !== 200
        || minimap?.available !== true
        || minimap.columns !== 32
        || minimap.rows !== 32
        || minimapKnowledge.length !== 32 * 32
        || minimap.knownCount < 1
        || minimap.visibleCount < 1
        || !Array.isArray(minimap.camera)
        || minimap.camera.length !== 4
        || !Array.isArray(minimap.contacts)
        || minimap.contactCount !== minimap.contacts.length
        || minimap.contactCount < 1
        || minimap.contacts.some((contact) => !Array.isArray(contact) || contact.length !== 5)
        || "objects" in minimap) {
      throw new Error(`minimap violated compact radar contract: ${JSON.stringify({
        status: minimapReply.status,
        minimap,
        knowledgeBytes: minimapKnowledge.length,
      })}`);
    }
    await delay(2000);
    const repeatedWorldReply = await rest(worldPath);
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

    const builder = repeatedWorld.objects.find((object) =>
      object.capabilities !== null && object.categories.includes("builder"));
    const construction = builder?.capabilities?.commands
      ?.filter((command) => command.type === "construct"
        && command.product?.availability === "available")
      .sort((left, right) => {
        const priority = (command) => command.product.categories.includes("power") ? 0 : 1;
        return priority(left) - priority(right) || left.product.cost - right.product.cost;
      })[0];
    if (!builder || !construction) {
      throw new Error(`live match exposed no available construction command: ${JSON.stringify({
        builders: repeatedWorld.objects
          .filter((object) => object.categories.includes("builder"))
          .map(({ id, template, capabilities }) => ({
            id,
            template,
            commands: capabilities?.commands,
          })),
      })}`);
    }

    const eventMessages = [];
    eventStreamAbort = new AbortController();
    const eventParameters = new URLSearchParams({
      types: "stream.baseline,construction.started,economy.changed",
      relationships: "self",
    });
    const eventResponse = await fetch(`${bridgeBase}${sessionPath}/events?${eventParameters}`, {
      headers: authorization,
      signal: eventStreamAbort.signal,
    });
    if (!eventResponse.ok
        || !eventResponse.headers.get("content-type")?.startsWith("text/event-stream")) {
      throw new Error(`event stream failed: ${eventResponse.status}`);
    }
    eventCollector = collectSSE(eventResponse, eventMessages).catch((error) => {
      if (error?.name !== "AbortError") throw error;
    });
    const streamBaseline = await waitFor("camera-bound tactical event baseline",
      () => eventMessages.find((message) => message.event === "stream.baseline"),
      (message) => message?.data?.observationMode === "camera"
        && Number.isSafeInteger(message.id) && message.id > 0,
      30000);

    const selectionReply = await rest(`${sessionPath}/game/selection`, {
      method: "POST",
      body: JSON.stringify({ objectIds: [builder.id] }),
    });
    if (selectionReply.status !== 200 || selectionReply.body.result?.accepted !== true) {
      throw new Error(`semantic selection failed: ${JSON.stringify(selectionReply)}`);
    }

    const outsideCell = [...flagBytes.entries()]
      .filter(([, flags]) => (flags & 0x80) === 0)
      .map(([index]) => {
        const column = index % terrain.columns;
        const row = Math.floor(index / terrain.columns);
        const position = {
          x: terrainExtent.lo.x
            + ((column + 0.5) / terrain.columns) * (terrainExtent.hi.x - terrainExtent.lo.x),
          y: terrainExtent.lo.y
            + ((row + 0.5) / terrain.rows) * (terrainExtent.hi.y - terrainExtent.lo.y),
        };
        const distance = (position.x - builder.position.x) ** 2
          + (position.y - builder.position.y) ** 2;
        return { position, distance };
      })
      .sort((left, right) => right.distance - left.distance)[0];
    if (!outsideCell) {
      throw new Error("terrain observation exposed no point outside the tactical camera");
    }
    const outsideOrder = await rest(`${sessionPath}/game/orders`, {
      method: "POST",
      body: JSON.stringify({
        action: "move", objectIds: [builder.id], position: outsideCell.position,
      }),
    });
    if (outsideOrder.status !== 422 || outsideOrder.body.error?.code !== "camera_bound") {
      throw new Error(`camera-bound order accepted an offscreen target: ${JSON.stringify(
        outsideOrder,
      )}`);
    }
    const panOutside = await rest(`${sessionPath}/camera`, {
      method: "POST",
      body: JSON.stringify(outsideCell.position),
    });
    if (panOutside.status !== 200 || panOutside.body.result?.ok !== true) {
      throw new Error(`camera pan to target failed: ${JSON.stringify(panOutside)}`);
    }
    const pannedOrder = await rest(`${sessionPath}/game/orders`, {
      method: "POST",
      body: JSON.stringify({
        action: "move", objectIds: [builder.id], position: outsideCell.position,
      }),
    });
    if (pannedOrder.status !== 200 || pannedOrder.body.result?.accepted !== true) {
      throw new Error(`camera pan did not unlock the visible target: ${JSON.stringify(pannedOrder)}`);
    }
    const stopPannedOrder = await rest(`${sessionPath}/game/orders`, {
      method: "POST",
      body: JSON.stringify({ action: "stop", objectIds: [builder.id] }),
    });
    if (stopPannedOrder.status !== 200 || stopPannedOrder.body.result?.accepted !== true) {
      throw new Error(`camera-bound stop failed for selected unit: ${JSON.stringify(stopPannedOrder)}`);
    }

    const lookAtReply = await rest(`${sessionPath}/camera`, {
      method: "POST",
      body: JSON.stringify({ x: builder.position.x, y: builder.position.y }),
    });
    if (lookAtReply.status !== 200 || lookAtReply.body.result?.ok !== true) {
      throw new Error(`semantic camera control failed: ${JSON.stringify(lookAtReply)}`);
    }

    const constructionOffsets = [
      [120, 0], [0, 120], [-120, 0], [0, -120],
      [160, 80], [-160, 80], [160, -80], [-160, -80],
      [220, 0], [0, 220], [-220, 0], [0, -220],
      [220, 140], [-220, 140], [220, -140], [-220, -140],
      [300, 0], [0, 300], [-300, 0], [0, -300],
    ];
    let constructionReply;
    let constructionPosition;
    const rejectedPositions = [];
    for (const [offsetX, offsetY] of constructionOffsets) {
      const position = {
        x: builder.position.x + offsetX,
        y: builder.position.y + offsetY,
      };
      if (position.x < terrainExtent.lo.x || position.x > terrainExtent.hi.x
          || position.y < terrainExtent.lo.y || position.y > terrainExtent.hi.y) {
        continue;
      }
      const reply = await rest(`${sessionPath}/game/commands`, {
        method: "POST",
        body: JSON.stringify({
          sourceId: builder.id,
          command: construction.name,
          position,
          angle: 0,
        }),
      });
      if (reply.status === 200 && reply.body.result?.accepted === true) {
        constructionReply = reply;
        constructionPosition = position;
        break;
      }
      rejectedPositions.push({ position, status: reply.status, error: reply.body.error });
    }
    if (!constructionReply) {
      throw new Error(`no legal construction position was accepted: ${JSON.stringify({
        builder: { id: builder.id, template: builder.template, position: builder.position },
        construction,
        rejectedPositions,
      })}`);
    }

    const previousIds = new Set(repeatedWorld.objects.map((object) => object.id));
    const worldAfterConstructionReply = await waitFor("semantic construction state change",
      () => rest(worldPath),
      (reply) => reply.status === 200
        && reply.body.result?.objects?.some((object) =>
          !previousIds.has(object.id)
          && object.template === construction.product.template
          && object.capabilities !== null),
      60000);
    const worldAfterConstruction = worldAfterConstructionReply.body.result;
    const constructedObject = worldAfterConstruction.objects.find((object) =>
      !previousIds.has(object.id)
      && object.template === construction.product.template
      && object.capabilities !== null);
    const moneyBeforeConstruction = repeatedWorld.players.find((player) => player.local)?.economy?.money;
    const moneyAfterConstruction = worldAfterConstruction.players
      .find((player) => player.local)?.economy?.money;
    if (!constructedObject || !(moneyAfterConstruction < moneyBeforeConstruction)) {
      throw new Error(`accepted construction lacked authoritative effects: ${JSON.stringify({
        constructionReply,
        constructedObject,
        moneyBeforeConstruction,
        moneyAfterConstruction,
      })}`);
    }
    const stopBuilderForContext = await rest(`${sessionPath}/game/orders`, {
      method: "POST",
      body: JSON.stringify({ action: "stop", objectIds: [builder.id] }),
    });
    if (stopBuilderForContext.status !== 200
        || stopBuilderForContext.body.result?.accepted !== true) {
      throw new Error(`builder stop before context action failed: ${JSON.stringify(
        stopBuilderForContext,
      )}`);
    }
    await waitFor("builder stopped before context action", () => rest(worldPath),
      (reply) => {
        const observedBuilder = reply.body.result?.objects?.find((object) => object.id === builder.id);
        return reply.status === 200
          && observedBuilder?.motion?.ai?.goalObjectId !== constructedObject.id;
      },
      30_000);
    const constructionContext = await rest(`${sessionPath}/game/context`, {
      method: "POST",
      body: JSON.stringify({ objectIds: [builder.id], targetId: constructedObject.id }),
    });
    if (constructionContext.status !== 200
        || constructionContext.body.result?.accepted !== true
        || constructionContext.body.result?.action !== "resumeConstruction") {
      throw new Error(`native construction context action failed: ${JSON.stringify(
        constructionContext,
      )}`);
    }
    const constructionEvent = await waitFor("coalesced semantic construction event",
      () => eventMessages.find((message) =>
        message.event === "construction.started"
        && message.data?.objectIds?.includes(constructedObject.id)),
      (message) => message?.id > streamBaseline.id
        && message.data?.relationship === "self"
        && message.data?.wake === false,
      30000);
    if (eventMessages.length > 16) {
      throw new Error(`filtered event stream was unexpectedly noisy: ${JSON.stringify(eventMessages)}`);
    }
    const matchScreenshot = resolve(screenshotDir, "agent-bridge-live-skirmish.png");
    const matchPixels = await page.screenshot({ path: matchScreenshot });

    eventStreamAbort.abort();
    await eventCollector.catch(() => {});
    eventStreamAbort = null;
    eventCollector = null;

    const completedBaseReply = await waitFor("completed structures for terminal retention",
      () => rest(worldPath),
      (reply) => {
        const result = reply.body.result;
        if (reply.status !== 200 || result?.game?.playable !== true) return false;
        const localStructures = result.objects?.filter((object) =>
          object.owner === result.localPlayerIndex
          && object.categories?.includes("structure")) ?? [];
        return localStructures.length >= 2
          && localStructures.every((object) => (object.construction < 0
            || object.construction >= 0.999)
            && object.capabilities?.commands?.some((command) => command.type === "sell"));
      },
      60_000);
    const completedBase = completedBaseReply.body.result;
    const sellableStructures = completedBase.objects
      .filter((object) => object.owner === completedBase.localPlayerIndex
        && object.categories?.includes("structure"))
      .map((object) => ({
        ...object,
        sell: object.capabilities.commands.find((command) => command.type === "sell"),
      }))
      .sort((left, right) => Number(left.template.includes("CommandCenter"))
        - Number(right.template.includes("CommandCenter")));
    for (const [index, structure] of sellableStructures.entries()) {
      const sold = await rest(`${sessionPath}/game/commands`, {
        method: "POST",
        body: JSON.stringify({ sourceId: structure.id, command: structure.sell.name }),
      });
      if (sold.status !== 200 || sold.body.result?.accepted !== true) {
        throw new Error(`semantic sell failed: ${JSON.stringify({ structure, sold })}`);
      }
      if (index + 1 < sellableStructures.length) {
        await waitFor(`sold structure ${structure.id}`,
          () => rest(worldPath),
          (reply) => reply.status === 200
            && !reply.body.result?.objects?.some((object) => object.id === structure.id
              && !object.status?.includes("sold")),
          30_000);
      }
    }

    const retainedWorldReply = await waitFor("durable post-score terminal outcome",
      () => rest(worldPath),
      (reply) => reply.status === 200
        && reply.body.result?.game?.playable === false
        && reply.body.result?.game?.outcome === "defeat"
        && reply.body.result?.game?.outcomeRetained === true
        && reply.body.result?.game?.scoreboardRetained === true
        && reply.body.result?.game?.endFrame > 0
        && reply.body.result?.scoreboard?.length === 2
        && reply.body.result.scoreboard.some((score) =>
          score.local === true && score.outcome === "defeat")
        && reply.body.result.scoreboard.some((score) =>
          score.relationship === "enemies" && score.outcome === "victory"),
      60_000);
    const retainedWorld = retainedWorldReply.body.result;

    const retainedEventMessages = [];
    eventStreamAbort = new AbortController();
    const retainedEventResponse = await fetch(
      `${bridgeBase}${sessionPath}/events?types=game.outcome&wakeOnly=true&after=0`,
      { headers: authorization, signal: eventStreamAbort.signal },
    );
    if (!retainedEventResponse.ok
        || !retainedEventResponse.headers.get("content-type")?.startsWith("text/event-stream")) {
      throw new Error(`retained outcome event stream failed: ${retainedEventResponse.status}`);
    }
    eventCollector = collectSSE(retainedEventResponse, retainedEventMessages).catch((error) => {
      if (error?.name !== "AbortError") throw error;
    });
    const retainedOutcomeEvent = await waitFor("retained outcome event baseline",
      () => retainedEventMessages.find((message) => message.event === "game.outcome"),
      (message) => message?.data?.details?.outcome === "defeat"
        && message.data.details.endFrame === retainedWorld.game.endFrame
        && typeof message.data.details.retained === "boolean"
        && message.data.details.scoreboard?.length === 2
        && message.data.wake === true
        && Number.isSafeInteger(message.id)
        && message.id > 0,
      30_000);
    const scoreScreenReply = await waitFor("semantic score screen after retained outcome",
      () => rest(snapshotsPath),
      (reply) => reply.status === 200
        && reply.body.result?.windows?.some((window) =>
          window.name === "ScoreScreen.wnd:ParentScoreScreen")
        && reply.body.result.windows.some((window) =>
          window.name === "ScoreScreen.wnd:ButtonOk"
          && window.actions?.includes("activate")),
      30_000);
    const scoreWindows = scoreScreenReply.body.result.windows;
    const tacticalAnalysis = scoreWindows.find((window) =>
      window.name === "ScoreScreen.wnd:StaticTextWarSchool");
    if (tacticalAnalysis?.text !== "Tactical Analysis") {
      throw new Error(`score screen omitted live dynamic static text: ${JSON.stringify(
        tacticalAnalysis,
      )}`);
    }

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
      uiControls: {
        slider: skirmishSlider.name,
        sliderRange: [skirmishSlider.slider.min, skirmishSlider.slider.max],
        sliderRoundTrip: [originalSliderValue, changedSliderValue, originalSliderValue],
        checkLike: skirmishCheckbox.name,
        checked: skirmishCheckbox.checked,
      },
      hud: {
        frame: hud.frame,
        messageCount: hud.messages.length,
        timerCount: hud.timers.length,
        popup: hud.popup !== null,
        subtitle: hud.subtitle !== null,
      },
      world: {
        frame: worldAfterConstruction.frame,
        objectCount: worldAfterConstruction.objectCount,
        cameraObjectCount: cameraWorld.objectCount,
        localMoney: moneyAfterConstruction,
        fullBytes,
        tacticalBytes,
      },
      gameplay: {
        selectedObjectId: builder.id,
        command: construction.name,
        contextAction: constructionContext.body.result.action,
        contextMessageType: constructionContext.body.result.messageType,
        product: construction.product.template,
        position: constructionPosition,
        constructedObjectId: constructedObject.id,
        construction: constructedObject.construction,
        moneySpent: moneyBeforeConstruction - moneyAfterConstruction,
      },
      events: {
        observationMode: streamBaseline.data.observationMode,
        baselineCursor: streamBaseline.id,
        constructionCursor: constructionEvent.id,
        deliveredCount: eventMessages.length,
        constructionType: constructionEvent.event,
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
      minimap: {
        available: minimap.available,
        forced: minimap.forced,
        hasRadar: minimap.hasRadar,
        contactCount: minimap.contactCount,
        knownCount: minimap.knownCount,
        visibleCount: minimap.visibleCount,
        knowledgeBytes: minimapKnowledge.length,
      },
      cameraPolicy: {
        playMode,
        cameraViewRoundTrip: {
          original: originalCameraView,
          changed: appliedCameraView,
          restored: cameraViewRestore.body.result,
        },
        globalOverrideRejected: true,
        offscreenOrderRejected: true,
        panUnlockedOrder: true,
        outsideTarget: outsideCell.position,
      },
      terminal: {
        outcome: retainedWorld.game.outcome,
        endFrame: retainedWorld.game.endFrame,
        retained: retainedWorld.game.outcomeRetained,
        postMatchMode: retainedWorld.game.mode,
        eventCursor: retainedOutcomeEvent.id,
        eventRetained: retainedOutcomeEvent.data.details.retained,
        eventReplayedAfterZero: true,
        scoreScreenWindowCount: scoreScreenReply.body.result.windowCount,
        scoreboard: retainedWorld.scoreboard,
      },
      expectedOptional404s: httpFailures.map((failure) => new URL(failure.url).pathname),
      screenshots: [
        mainScreenshot,
        submenuScreenshot,
        optionsScreenshot,
        matchScreenshot,
      ],
    }, null, 2)}\n`);
  } catch (error) {
    const bridgeError = bridge.failureDetail();
    throw new Error(`${error?.stack ?? error}`
      + `${pageDiagnostic ? `\npage diagnostic: ${JSON.stringify(pageDiagnostic)}` : ""}`
      + `${consoleErrors.length ? `\nconsole errors:\n${consoleErrors.join("\n")}` : ""}`
      + `${httpFailures.length ? `\nHTTP failures:\n${JSON.stringify(httpFailures, null, 2)}` : ""}`
      + `${bridgeError ? `\nbridge stderr:\n${bridgeError}` : ""}`);
  } finally {
    eventStreamAbort?.abort();
    await eventCollector?.catch(() => {});
    if (browser) await browser.close();
    await server.close();
    await stopBridge(bridge);
    if (!preserveProfile) await rm(profileDir, { recursive: true, force: true });
  }
}

await main();
