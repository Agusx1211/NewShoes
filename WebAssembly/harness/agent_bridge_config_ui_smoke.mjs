import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const screenshotDir = process.env.AGENT_BRIDGE_UI_SHOTS
  ?? resolve(wasmRoot, "artifacts/screenshots");
const executablePath = process.env.AGENT_BRIDGE_UI_BROWSER
  ?? process.env.CHROME_PATH;
const browserSecret = "browser-secret-never-persist";

await mkdir(screenshotDir, { recursive: true });
const server = await startStaticServer({ root: wasmRoot, host: "0.0.0.0", port: 0 });
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});

try {
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
  await page.waitForFunction(() => Boolean(window.CnCPort?.play && window.ZeroHDesktop));

  assert.equal(await page.locator('[data-open="agentBridge"]').count(), 2,
    "Remote Agent must appear on the desktop and in the Start menu");
  await page.locator('.desktop-icon[data-open="agentBridge"]').click();
  await page.waitForSelector("#agentBridgeWindow.is-open.is-active");
  assert.equal(await page.locator('#taskButtons [data-app="agentBridge"]').count(), 1);
  assert.equal(await page.locator("#agentBridgeStatus").getAttribute("data-state"), "disabled");
  assert.equal(await page.locator("#agentBridgeFields").evaluate((fields) => fields.disabled), true);
  assert.equal(await page.locator("#agentBridgeToken").getAttribute("type"), "password");

  await page.locator(".agent-bridge-enable").click();
  assert.equal(await page.locator("#agentBridgeEnabled").isChecked(), true);
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

  await page.locator("#agentBridgeUrl").fill("ws://127.0.0.1:18888/engine");
  await page.locator("#agentBridgeApply").click();
  await page.waitForFunction(() => window.CnCPort.play.getConfiguration().agentBridge.configured);

  const securitySnapshot = await page.evaluate((secret) => {
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
  assert.deepEqual(securitySnapshot.configuration.agentBridge, {
    configured: true,
    url: "ws://127.0.0.1:18888/engine",
    sessionId: "camera-ui-smoke",
    playMode: "camera",
  });
  assert.equal(securitySnapshot.publicJsonContainsSecret, false);
  assert.equal(securitySnapshot.storageContainsSecret, false);
  assert.equal(securitySnapshot.hostConfigContainsSecret, false);
  assert.equal(await page.locator("#agentBridgeForm").getAttribute("data-configured"), "true");
  assert.equal(await page.locator("#agentBridgeStatus").getAttribute("data-state"), "ready");
  assert.match(await page.locator("#agentBridgeStatus").textContent(), /Ready for the next launch/);

  await page.locator("#agentBridgeTokenReveal").click();
  assert.equal(await page.locator("#agentBridgeToken").getAttribute("type"), "text");
  assert.equal(await page.locator("#agentBridgeTokenReveal").getAttribute("aria-pressed"), "true");
  await page.locator("#agentBridgeTokenReveal").click();
  assert.equal(await page.locator("#agentBridgeToken").getAttribute("type"), "password");

  const screenshot = resolve(screenshotDir, "agent-bridge-config-ui.png");
  await page.locator("#agentBridgeWindow").screenshot({ path: screenshot });

  await page.locator(".agent-bridge-enable").click();
  assert.equal(await page.locator("#agentBridgeEnabled").isChecked(), false);
  await page.locator("#agentBridgeApply").click();
  await page.waitForFunction(() => !window.CnCPort.play.getConfiguration().agentBridge.configured);
  assert.equal(await page.locator("#agentBridgeFields").evaluate((fields) => fields.disabled), true);
  assert.equal(requestedScripts.some((url) => /\/agent_bridge\.mjs(?:\?|$)/.test(url)), false,
    "configuring the app must not import or start the runtime bridge adapter");
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({ ok: true, screenshot }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
