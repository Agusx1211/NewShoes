#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  await page.evaluate(() => {
    window.__cncLaunchWebBrowserCalls = [];
    window.__cncLaunchWebBrowserLast = null;
    window.open = (url, target, features) => {
      const record = {
        url: String(url),
        target: String(target),
        features: String(features),
        opened: true,
      };
      window.__cncLaunchWebBrowserCalls.push(record);
      window.__cncLaunchWebBrowserLast = record;
      return { closed: false, location: { href: String(url) } };
    };
  });

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "WWLib LaunchWebBrowser browser bridge smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before LaunchWebBrowser probe: ${JSON.stringify(bootResult)}`);
  }

  const result = await page.evaluate(() => window.CnCPort.rpc("launchWebBrowserProbe"));
  const calls = await page.evaluate(() => window.__cncLaunchWebBrowserCalls);
  const launchCall = calls?.[0];
  const fatalEvents = browserEvents.filter((event) => event.type !== "console");

  if (!result.ok
      || result.command !== "launchWebBrowserProbe"
      || result.probe?.source !== "GeneralsMD original WWLib LaunchWeb.cpp"
      || result.probe?.bridge !== "window.open"
      || result.probe?.nullUrl !== false
      || result.probe?.emptyUrl !== false
      || result.probe?.browserLaunch !== true
      || result.probe?.browserUrl !== "https://www.ea.com/games/command-and-conquer"
      || result.launchWeb?.before !== null
      || result.launchWeb?.last?.url !== result.probe.browserUrl
      || result.launchWeb?.last?.target !== "_blank"
      || result.launchWeb?.last?.features !== "noopener"
      || result.launchWeb?.last?.opened !== true
      || calls?.length !== 1
      || launchCall?.url !== result.probe.browserUrl
      || launchCall?.target !== "_blank"
      || launchCall?.features !== "noopener"
      || fatalEvents.length !== 0) {
    throw new Error(`LaunchWebBrowser browser bridge probe failed: ${JSON.stringify({
      result,
      calls,
      browserEvents,
    })}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-wwlib-launchweb-window-open",
    url: harnessUrl,
    probe: result.probe,
    launchWeb: result.launchWeb,
    browserEventCount: browserEvents.length,
    fatalBrowserEventCount: fatalEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
