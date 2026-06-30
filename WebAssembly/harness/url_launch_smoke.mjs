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
    window.__cncURLLaunchCalls = [];
    window.__cncURLLaunchLast = null;
    window.open = (url, target, features) => {
      const record = {
        url: String(url),
        target: String(target),
        features: String(features),
        opened: true,
      };
      window.__cncURLLaunchCalls.push(record);
      return { closed: false, location: { href: String(url) } };
    };
  });

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "Common URLLaunch browser bridge smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before URLLaunch probe: ${JSON.stringify(bootResult)}`);
  }

  const result = await page.evaluate(() => window.CnCPort.rpc("urlLaunchProbe"));
  const calls = await page.evaluate(() => window.__cncURLLaunchCalls);
  const launchCall = calls?.[0];
  const fatalEvents = browserEvents.filter((event) => event.type !== "console");

  if (!result.ok
      || result.command !== "urlLaunchProbe"
      || result.probe?.source !== "GeneralsMD original Common/Audio/urllaunch.cpp"
      || result.probe?.bridge !== "window.open"
      || result.probe?.escapedURL !== "file://license%20path/file%20%231.wma"
      || result.probe?.escaped !== true
      || result.probe?.nullLaunchFailed !== true
      || result.probe?.browserLaunch !== true
      || result.probe?.browserURL !== "https://www.ea.com/games/command-and-conquer?source=cnc-port"
      || result.urlLaunch?.before !== null
      || result.urlLaunch?.last?.url !== result.probe.browserURL
      || result.urlLaunch?.last?.target !== "_blank"
      || result.urlLaunch?.last?.features !== "noopener"
      || result.urlLaunch?.last?.opened !== true
      || calls?.length !== 1
      || launchCall?.url !== result.probe.browserURL
      || launchCall?.target !== "_blank"
      || launchCall?.features !== "noopener"
      || fatalEvents.length !== 0) {
    throw new Error(`URLLaunch browser bridge probe failed: ${JSON.stringify({
      result,
      calls,
      browserEvents,
    })}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-common-urllaunch-window-open",
    url: harnessUrl,
    probe: result.probe,
    urlLaunch: result.urlLaunch,
    browserEventCount: browserEvents.length,
    fatalBrowserEventCount: fatalEvents.length,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
