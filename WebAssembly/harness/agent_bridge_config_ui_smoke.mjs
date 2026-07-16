import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(wasmRoot, "..");
const screenshotDir = process.env.AGENT_BRIDGE_UI_SHOTS
  ?? resolve(wasmRoot, "artifacts/screenshots");
const executablePath = process.env.AGENT_BRIDGE_UI_BROWSER
  ?? process.env.CHROME_PATH;
const browserSecret = `browser-secret-${randomUUID()}`;
const apiToken = randomUUID();

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

function startBridge(port) {
  return spawn("go", [
    "run", "./cmd/new-shoes-agent-bridge",
    `-listen=127.0.0.1:${port}`,
    `-engine-url=ws://127.0.0.1:${port}/engine`,
    `-engine-token=${browserSecret}`,
    `-api-token=${apiToken}`,
    "-play-mode=camera",
  ], {
    cwd: resolve(repoRoot, "AgentBridge"),
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "pipe"],
  });
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

async function waitForBridge(url, child) {
  const deadline = Date.now() + 30000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Go bridge exited with ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) return;
    } catch (error) {
      lastError = error?.message ?? String(error);
    }
    await delay(100);
  }
  throw new Error(`Go bridge did not become healthy: ${lastError}`);
}

async function bridgeSessions(url) {
  const response = await fetch(`${url}/v1/sessions`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  assert.equal(response.ok, true);
  return (await response.json()).sessions;
}

async function openRemoteAgent(page) {
  await page.waitForFunction(() => Boolean(window.CnCPort?.play && window.ZeroHDesktop));
  await page.locator('.desktop-icon[data-open="agentBridge"]').click();
  await page.waitForSelector("#agentBridgeWindow.is-open.is-active");
}

await mkdir(screenshotDir, { recursive: true });
const bridgePort = await unusedPort();
const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
const bridge = startBridge(bridgePort);
const server = await startStaticServer({ root: wasmRoot, host: "0.0.0.0", port: 0 });
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});

try {
  await waitForBridge(bridgeUrl, bridge);
  const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
  const page = await context.newPage();
  const pageErrors = [];
  const requestedScripts = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.resourceType() === "script") requestedScripts.push(request.url());
  });

  await page.goto(new URL("harness/play.html", server.url).href, {
    waitUntil: "domcontentloaded",
  });
  await openRemoteAgent(page);

  assert.equal(await page.locator('[data-open="agentBridge"]').count(), 2,
    "Remote Agent must appear on the desktop and in the Start menu");
  assert.equal(await page.locator('#taskButtons [data-app="agentBridge"]').count(), 1);
  assert.equal(await page.locator("#agentBridgeStatus").getAttribute("data-state"), "disabled");
  assert.equal(await page.locator("#agentBridgeFields").evaluate((fields) => fields.disabled), true);
  assert.equal(await page.locator("#agentBridgeToken").getAttribute("type"), "password");
  assert.equal(await page.locator("#agentBridgeTest").isDisabled(), true);

  await page.locator(".agent-bridge-enable").click();
  await page.locator("#agentBridgeUrl").fill("http://127.0.0.1:18888/engine");
  await page.locator("#agentBridgeToken").fill(browserSecret);
  await page.locator("#agentBridgeSession").fill("camera-ui-smoke");
  await page.locator("#agentBridgeMode").selectOption("camera");
  await page.locator("#agentBridgeApply").click();
  await page.waitForSelector("#agentBridgeError:not([hidden])");
  assert.match(await page.locator("#agentBridgeError").textContent(), /ws: or wss:/);
  assert.deepEqual(await page.evaluate(() => window.CnCPort.play.getConfiguration().agentBridge), {
    configured: false,
  });

  await page.locator("#agentBridgeUrl").fill(`ws://127.0.0.1:${bridgePort}/engine`);
  await page.locator("#agentBridgeApply").click();
  await page.waitForFunction(() => window.CnCPort.play.getConfiguration().agentBridge.configured);

  const memoryOnlySnapshot = await page.evaluate((secret) => {
    const configuration = window.CnCPort.play.getConfiguration();
    const stored = [];
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        stored.push([key, storage.getItem(key)]);
      }
    }
    return {
      configuration,
      publicJsonContainsSecret: JSON.stringify(configuration).includes(secret),
      storageContainsSecret: JSON.stringify(stored).includes(secret),
      hostConfigContainsSecret: JSON.stringify(window.CnCPortPlayConfig ?? {}).includes(secret),
    };
  }, browserSecret);
  assert.deepEqual(memoryOnlySnapshot.configuration.agentBridge, {
    configured: true,
    url: `ws://127.0.0.1:${bridgePort}/engine`,
    sessionId: "camera-ui-smoke",
    playMode: "camera",
  });
  assert.equal(memoryOnlySnapshot.publicJsonContainsSecret, false);
  assert.equal(memoryOnlySnapshot.storageContainsSecret, false);
  assert.equal(memoryOnlySnapshot.hostConfigContainsSecret, false);
  assert.equal(requestedScripts.some((url) => /\/agent_bridge\.mjs(?:\?|$)/.test(url)), false,
    "applying remembered settings must not import the runtime bridge adapter");

  await page.reload({ waitUntil: "domcontentloaded" });
  await openRemoteAgent(page);
  assert.equal(await page.locator("#agentBridgeEnabled").isChecked(), true);
  assert.equal(await page.locator("#agentBridgeUrl").inputValue(),
    `ws://127.0.0.1:${bridgePort}/engine`);
  assert.equal(await page.locator("#agentBridgeSession").inputValue(), "camera-ui-smoke");
  assert.equal(await page.locator("#agentBridgeMode").inputValue(), "camera");
  assert.equal(await page.locator("#agentBridgeToken").inputValue(), "",
    "the browser token must remain memory-only without explicit opt-in");
  assert.deepEqual(await page.evaluate(() => window.CnCPort.play.getConfiguration().agentBridge), {
    configured: false,
  });

  await page.locator("#agentBridgeToken").fill(browserSecret);
  await page.locator("#agentBridgeRememberToken").check();
  await page.locator("#agentBridgeTest").click();
  await page.waitForFunction(() =>
    document.querySelector("#agentBridgeStatus")?.dataset.state === "connected");
  assert.match(await page.locator("#agentBridgeStatus").textContent(), /connection verified/i);
  assert.deepEqual(await bridgeSessions(bridgeUrl), [],
    "a connection test must not register a playable engine session");

  await page.locator("#agentBridgeApply").click();
  await page.waitForFunction(() => window.CnCPort.play.getConfiguration().agentBridge.configured);
  assert.equal(await page.evaluate((secret) => localStorage.getItem(
    "cncPortAgentBridgeSettings.v1",
  ).includes(secret), browserSecret), true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await openRemoteAgent(page);
  assert.equal(await page.locator("#agentBridgeToken").inputValue(), browserSecret);
  assert.equal(await page.locator("#agentBridgeRememberToken").isChecked(), true);
  assert.equal(await page.locator("#agentBridgeForm").getAttribute("data-configured"), "true");
  assert.match(await page.locator("#agentBridgeStatus").textContent(), /Ready for the next launch/);

  await page.locator("#agentBridgeTest").click();
  await page.waitForFunction(() =>
    document.querySelector("#agentBridgeStatus")?.dataset.state === "connected");
  const screenshot = resolve(screenshotDir, "agent-bridge-config-ui.png");
  await page.locator("#agentBridgeWindow").screenshot({ path: screenshot });

  await page.locator("#agentBridgeTokenReveal").click();
  assert.equal(await page.locator("#agentBridgeToken").getAttribute("type"), "text");
  assert.equal(await page.locator("#agentBridgeTokenReveal").getAttribute("aria-pressed"), "true");
  await page.locator("#agentBridgeTokenReveal").click();
  assert.equal(await page.locator("#agentBridgeToken").getAttribute("type"), "password");

  await page.locator("#agentBridgeRememberToken").uncheck();
  assert.equal(await page.evaluate((secret) => localStorage.getItem(
    "cncPortAgentBridgeSettings.v1",
  ).includes(secret), browserSecret), false,
  "turning token remembering off must remove the persisted credential immediately");
  await page.locator(".agent-bridge-enable").click();
  await page.locator("#agentBridgeApply").click();
  await page.waitForFunction(() => !window.CnCPort.play.getConfiguration().agentBridge.configured);
  assert.equal(await page.locator("#agentBridgeFields").evaluate((fields) => fields.disabled), true);
  assert.deepEqual(await bridgeSessions(bridgeUrl), []);
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({ ok: true, screenshot }, null, 2));
} finally {
  await browser.close();
  await server.close();
  await stopBridge(bridge);
}
