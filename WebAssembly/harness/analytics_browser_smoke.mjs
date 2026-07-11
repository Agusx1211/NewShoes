#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = Number(process.env.ANALYTICS_SMOKE_PORT || 8147);
const httpsPort = Number(process.env.ANALYTICS_SMOKE_HTTPS_PORT || 8467);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["harness/serve.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, HOST: "0.0.0.0", PORT: String(port), HTTPS_PORT: String(httpsPort) },
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${origin}/harness/play.html`)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("analytics browser-smoke server did not start");
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    window.__analyticsMock = { initializeCalls: 0, consent: [], events: [], clears: 0 };
    window.__NEW_SHOES_ANALYTICS_TEST__ = {
      forceEnabled: true,
      measurementId: "G-TEST000000",
      transport: {
        initialize() { window.__analyticsMock.initializeCalls += 1; },
        updateConsent(value) { window.__analyticsMock.consent.push(value); },
        send(name, params) { window.__analyticsMock.events.push({ name, params }); },
        clearState() { window.__analyticsMock.clears += 1; },
      },
    };
  });
  const page = await context.newPage();
  const offOrigin = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(origin)) offOrigin.push(request.url());
  });
  await page.goto(`${origin}/harness/play.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHAnalytics && window.ZeroHDesktop));
  const initial = await page.evaluate(() => ({
    status: window.ZeroHAnalytics.status(),
    mock: window.__analyticsMock,
    rootView: window.__analyticsMock.events.find((event) => event.name === "page_view"),
  }));
  assert.equal(initial.status.active, true);
  assert.equal(initial.mock.initializeCalls, 1);
  assert.equal(initial.rootView.params.page_location, `${origin}/`);
  assert.deepEqual(offOrigin, [], "mock analytics browser smoke must make no off-origin request");

  await page.evaluate(() => window.ZeroHDesktop.openSettingsPanel("privacy"));
  await page.locator("#analyticsConsentToggle").uncheck();
  await page.waitForFunction(() => window.ZeroHAnalytics.status().consent === "denied");
  const revoked = await page.evaluate(() => ({
    preference: localStorage.getItem("newShoesAnalyticsConsent.v1"),
    disabled: window["ga-disable-G-TEST000000"],
    mock: window.__analyticsMock,
  }));
  assert.equal(revoked.preference, "denied");
  assert.equal(revoked.disabled, true);
  assert.equal(revoked.mock.clears, 1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHAnalytics && window.ZeroHDesktop));
  const returnVisit = await page.evaluate(() => ({ status: window.ZeroHAnalytics.status(), mock: window.__analyticsMock, disabled: window["ga-disable-G-TEST000000"] }));
  assert.equal(returnVisit.status.active, false);
  assert.equal(returnVisit.mock.initializeCalls, 0, "stored opt-out must prevent tag initialization before UI boot");
  assert.equal(returnVisit.mock.events.length, 0);
  assert.equal(returnVisit.disabled, true);

  await page.evaluate(() => window.ZeroHDesktop.openSettingsPanel("privacy"));
  await page.locator("#analyticsConsentToggle").check();
  await page.waitForFunction(() => window.ZeroHAnalytics.status().active === true);
  await page.evaluate(() => window.ZeroHDesktop.openSettingsPanel("game"));
  const enabled = await page.evaluate(() => window.__analyticsMock);
  assert.equal(enabled.initializeCalls, 1);
  assert.equal(await page.evaluate(() => window["ga-disable-G-TEST000000"]), false);
  assert.equal(enabled.events.filter((event) => event.name === "settings_section_view" && event.params.section === "game").length, 1);
  assert.deepEqual(offOrigin, []);
  console.log("Analytics browser opt-out, return-visit, re-enable, and no-network smoke: OK");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
