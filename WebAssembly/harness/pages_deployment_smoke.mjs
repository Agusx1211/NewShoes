#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.argv[2] || "pages-dist");
const prefix = "/CnC_Generals_Zero_Hour/";
const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
]);

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === prefix.slice(0, -1)) {
    response.writeHead(302, { location: prefix });
    response.end();
    return;
  }
  if (!url.pathname.startsWith(prefix)) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
    return;
  }
  const relativeName = decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
  const path = resolve(root, relativeName);
  if (!inside(root, path)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "content-length": info.size,
      "content-type": mime.get(extname(path)) || "application/octet-stream",
      "cache-control": "no-store",
      // Intentionally no COOP/COEP. The Pages artifact must establish these
      // through its own scoped service worker.
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }
});

await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}${prefix}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "allow" });
const page = await context.newPage();
const navigationHeaders = [];
const errors = [];

page.on("response", (response) => {
  if (response.request().isNavigationRequest()) navigationHeaders.push(response.headers());
  if (response.status() >= 400
      && !/__cnc_(build_info|https_info)/.test(response.url())
      && !/\/artifacts\/real-assets\/cursors\/manifest\.json(?:\?|$)/.test(response.url())) {
    errors.push(`${response.status()} ${response.url()}`);
  }
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForURL(`${baseUrl}harness/play.html`, { timeout: 30000 });
  await page.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc && window.ZeroHAssetLibrary), null, { timeout: 30000 });

  const isolation = await page.evaluate(() => ({
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
    controlled: Boolean(navigator.serviceWorker.controller),
    launcherVisible: Boolean(document.querySelector("#desktop")?.getClientRects().length),
  }));
  if (!Object.values(isolation).every(Boolean)) {
    throw new Error(`Pages isolation/launcher checks failed: ${JSON.stringify(isolation)}`);
  }
  if (!navigationHeaders.some((headers) => !headers["cross-origin-opener-policy"])
      || !navigationHeaders.some((headers) => headers["cross-origin-opener-policy"] === "same-origin"
        && headers["cross-origin-embedder-policy"] === "require-corp")) {
    throw new Error(`Expected an unisolated first navigation and an isolated service-worker navigation: ${JSON.stringify(navigationHeaders)}`);
  }

  const wasm = await page.evaluate(async () => {
    const response = await fetch("../dist-threaded-release/cnc-port.wasm", { cache: "no-store" });
    return { ok: response.ok, type: response.headers.get("content-type"), bytes: (await response.arrayBuffer()).byteLength };
  });
  if (!wasm.ok || wasm.type !== "application/wasm" || wasm.bytes < 1024) {
    throw new Error(`Wasm delivery check failed: ${JSON.stringify(wasm)}`);
  }

  // An empty mount is rejected after module/realm preparation. Reaching the
  // threadedMode state proves the actual Emscripten pthread worker accepted
  // the transferred viewport OffscreenCanvas; no proprietary assets are used.
  const prep = await page.evaluate(() => window.CnCPort.rpc("mountArchives", { archives: [] }));
  if (prep.ok !== false || !/Missing archive list/.test(prep.error || "")) {
    throw new Error(`Unexpected empty-mount result: ${JSON.stringify(prep)}`);
  }
  await page.waitForFunction(() => window.CnCPort?.state?.threadedMode === true, null, { timeout: 30000 });
  const runtime = await page.evaluate(() => ({
    threadedMode: window.CnCPort.state.threadedMode,
    heapShared: window.CnCPort.engineModule()?.HEAP8?.buffer instanceof SharedArrayBuffer,
    canvasTransferred: (() => {
      try { document.querySelector("#viewport").transferControlToOffscreen(); return false; }
      catch { return true; }
    })(),
  }));
  if (!Object.values(runtime).every(Boolean)) throw new Error(`Threaded runtime checks failed: ${JSON.stringify(runtime)}`);
  if (errors.length) throw new Error(`Unexpected browser errors:\n${errors.join("\n")}`);

  const screenshot = process.env.PAGES_SMOKE_SCREENSHOT;
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });

  await page.locator('.desktop-icon[data-open="about"]').click();
  await page.waitForSelector("#publicLegalNotice", { state: "visible" });
  const notice = await page.evaluate(() => ({
    text: document.querySelector("#publicLegalNotice")?.textContent || "",
    license: document.querySelector('#publicLegalNotice a[href="../legal.html"]')?.href || "",
    source: [...document.querySelectorAll("#publicLegalNotice a")]
      .find((link) => link.textContent.includes("Corresponding source"))?.href || "",
  }));
  if (!/Copyright.*no warranty/i.test(notice.text)
      || !notice.license.endsWith(`${prefix}legal.html`)
      || !notice.source.startsWith("https://github.com/")) {
    throw new Error(`Launcher legal notice check failed: ${JSON.stringify(notice)}`);
  }
  const legalScreenshot = process.env.PAGES_SMOKE_LEGAL_SCREENSHOT;
  if (legalScreenshot) await page.screenshot({ path: legalScreenshot, fullPage: true });

  const legalPage = await context.newPage();
  await legalPage.goto(`${baseUrl}legal.html`, { waitUntil: "domcontentloaded" });
  const legal = await legalPage.evaluate(async () => {
    const license = await (await fetch("./LICENSE.md")).text();
    return {
      text: document.body.innerText,
      source: [...document.querySelectorAll("a")]
        .find((link) => link.textContent.toLowerCase().includes("corresponding source"))?.href || "",
      completeLicense: license.includes("ADDITIONAL TERMS per GNU GPL Section 7")
        && license.includes("Disclaimer of Warranty"),
    };
  });
  await legalPage.close();
  if (!/modified browser port/i.test(legal.text)
      || !/absolutely no warranty/i.test(legal.text)
      || !legal.completeLicense
      || !legal.source.startsWith("https://github.com/")) {
    throw new Error(`Conveyed legal/source check failed: ${JSON.stringify(legal)}`);
  }

  await page.goto(`${baseUrl}?coi-sw=unregister`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#coi-status")?.textContent.includes("disabled"), null, { timeout: 30000 });
  const remainingRegistrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  if (remainingRegistrations !== 0) throw new Error(`Isolation worker unregister left ${remainingRegistrations} registrations`);

  const deepContext = await browser.newContext({ serviceWorkers: "allow" });
  const deepPage = await deepContext.newPage();
  const deepUrl = `${baseUrl}harness/play.html?diag=lite`;
  try {
    await deepPage.goto(deepUrl, { waitUntil: "domcontentloaded" });
    await deepPage.waitForURL(deepUrl, { timeout: 30000 });
    await deepPage.waitForFunction(() => window.crossOriginIsolated
      && typeof SharedArrayBuffer === "function"
      && Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
  } finally {
    await deepContext.close();
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    isolation,
    wasm,
    runtime,
    directDeepLink: true,
    legalNotice: true,
    unregister: true,
    navigations: navigationHeaders.length,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
