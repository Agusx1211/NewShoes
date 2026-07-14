#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.argv[2] || "cloudflare-dist");
const expectedBuildInfo = JSON.parse(await readFile(resolve(root, "harness/build-info.json"), "utf8"));
const expectedChangelogEntries = expectedBuildInfo.release.changelog
  .reduce((total, section) => total + section.entries.length, 0);
const mime = new Map([
  [".css", "text/css; charset=utf-8"], [".html", "text/html; charset=utf-8"], [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"], [".json", "application/json; charset=utf-8"], [".md", "text/markdown; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".png", "image/png"], [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"], [".webp", "image/webp"],
]);
const requiredHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
};
const rolloutSeedName = "__cloudflare_worker_retirement_seed.html";
const oldWorkerSource = await readFile(new URL("./fixtures/coi-serviceworker-18b95831.js", import.meta.url), "utf8");
let serveOldServiceWorker = false;

function inside(parent, child) {
  const name = relative(parent, child);
  return name === "" || (!name.startsWith("..") && !name.startsWith(sep));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname === `/${rolloutSeedName}`) {
    const body = "<!doctype html><meta charset=utf-8><title>Cloudflare worker retirement seed</title>";
    response.writeHead(200, { ...requiredHeaders, "content-length": Buffer.byteLength(body), "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(body);
    return;
  }
  if (serveOldServiceWorker && url.pathname === "/coi-serviceworker.js") {
    response.writeHead(200, { "content-length": Buffer.byteLength(oldWorkerSource), "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
    response.end(oldWorkerSource);
    return;
  }
  if (url.pathname === "/launcher.html" || url.pathname === "/harness/play.html") {
    response.writeHead(302, { ...requiredHeaders, location: `/${url.search}` });
    response.end();
    return;
  }
  const name = decodeURIComponent(url.pathname.slice(1)) || "index.html";
  const path = resolve(root, name);
  if (!inside(root, path)) {
    response.writeHead(403, requiredHeaders);
    response.end();
    return;
  }
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      ...requiredHeaders,
      "cache-control": "no-store",
      "content-length": info.size,
      "content-type": mime.get(extname(path)) || "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404, { ...requiredHeaders, "content-type": "text/plain" });
    response.end("not found");
  }
});

await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: "allow" });
const page = await context.newPage();
const errors = [];
const navigationHeaders = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("response", (response) => {
  if (response.request().isNavigationRequest()) navigationHeaders.push(response.headers());
  if (response.status() >= 400
      && !/__cnc_(build_info|https_info)/.test(response.url())
      && !/\/artifacts\/real-assets\/cursors\/manifest\.json(?:\?|$)/.test(response.url())) errors.push(`${response.status()} ${response.url()}`);
});

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
  await page.waitForFunction(() => window.crossOriginIsolated
    && typeof SharedArrayBuffer === "function" && Boolean(window.CnCPort?.rpc), null, { timeout: 30000 });
  if (page.url() !== baseUrl) throw new Error(`Cloudflare launcher exposed a non-root URL: ${page.url()}`);
  const initial = await page.evaluate(async () => ({
    isolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
    controlled: Boolean(navigator.serviceWorker.controller),
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    launcherVisible: Boolean(document.querySelector("#desktop")?.getClientRects().length),
  }));
  if (!initial.isolated || !initial.sharedArrayBuffer || !initial.launcherVisible || initial.controlled || initial.registrations !== 0) {
    throw new Error(`Direct-header launch contract failed: ${JSON.stringify(initial)}`);
  }
  if (navigationHeaders.length !== 1
      || navigationHeaders[0]["cross-origin-opener-policy"] !== "same-origin"
      || navigationHeaders[0]["cross-origin-embedder-policy"] !== "require-corp") {
    throw new Error(`First response did not establish direct isolation: ${JSON.stringify(navigationHeaders)}`);
  }
  const wasm = await page.evaluate(async () => {
    const response = await fetch(new URL("../dist-threaded-release/cnc-port.wasm", document.baseURI), { cache: "no-store" });
    return { ok: response.ok, type: response.headers.get("content-type"), bytes: (await response.arrayBuffer()).byteLength };
  });
  if (!wasm.ok || wasm.type !== "application/wasm" || wasm.bytes < 1024) throw new Error(`Wasm delivery failed: ${JSON.stringify(wasm)}`);
  await page.waitForFunction(() => window.ZeroHDesktop?.videoSupport?.checking === false);
  const videoSupport = await page.evaluate(() => ({
    policy: document.documentElement.dataset.binkVideoSidecars,
    support: window.ZeroHDesktop.videoSupport,
    disabled: document.querySelector("#includeVideosToggle")?.disabled,
    description: document.querySelector("#includeVideosDescription")?.textContent || "",
  }));
  if (videoSupport.policy !== "transcode"
      || videoSupport.support?.available !== true
      || videoSupport.support?.mode !== "transcode"
      || videoSupport.disabled !== false
      || !/prepare and play original movies locally/i.test(videoSupport.description)) {
    throw new Error(`Hosted optional-video support failed: ${JSON.stringify(videoSupport)}`);
  }
  const videoRuntime = await page.evaluate(async () => {
    const base = new URL("../video-runtime/", document.baseURI);
    const manifestResponse = await fetch(new URL("ffmpeg-core-manifest.json", base));
    const manifest = await manifestResponse.json();
    const scriptResponse = await fetch(new URL(manifest.coreScript, base));
    const parts = [];
    let total = 0;
    for (const part of manifest.wasmParts) {
      const response = await fetch(new URL(part.name, base));
      const bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
        .map((value) => value.toString(16).padStart(2, "0")).join("");
      total += bytes.byteLength;
      parts.push({ ok: response.ok, bytes: bytes.byteLength, digest, expected: part });
    }
    return { manifestOk: manifestResponse.ok, scriptOk: scriptResponse.ok, manifest, total, parts };
  });
  if (!videoRuntime.manifestOk || !videoRuntime.scriptOk
      || videoRuntime.total !== videoRuntime.manifest.wasmBytes
      || videoRuntime.parts.some((part) => !part.ok
        || part.bytes !== part.expected.bytes || part.digest !== part.expected.sha256)) {
    throw new Error(`Hosted video runtime delivery failed: ${JSON.stringify(videoRuntime)}`);
  }
  const videoScreenshot = process.env.CLOUDFLARE_VIDEO_SUPPORT_SCREENSHOT
    || process.env.CLOUDFLARE_VIDEO_UNAVAILABLE_SCREENSHOT;
  if (videoScreenshot) {
    await page.evaluate(() => {
      document.querySelectorAll("[data-wizard-page]").forEach((wizardPage) => {
        const visible = wizardPage.dataset.wizardPage === "2";
        wizardPage.classList.toggle("is-visible", visible);
        wizardPage.setAttribute("aria-hidden", String(!visible));
      });
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: videoScreenshot, fullPage: true });
  }
  const prep = await page.evaluate(() => window.CnCPort.rpc("mountArchives", { archives: [] }));
  if (prep.ok !== false || !/Missing archive list/.test(prep.error || "")) throw new Error(`Unexpected empty mount: ${JSON.stringify(prep)}`);
  const videoFallbackMount = await page.evaluate(async () => {
    const bytes = new Uint8Array(64);
    bytes.set(new TextEncoder().encode("BIGF"));
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return window.CnCPort.rpc("mountArchives", {
      path: "/assets/deployment-video-fallback",
      verifyEach: false,
      includeVideos: true,
      archives: [{
        name: "DeploymentVideoFallback.big",
        url: `data:application/octet-stream;base64,${btoa(binary)}`,
        expectedBytes: bytes.byteLength,
      }],
    });
  });
  if (videoFallbackMount.ok !== true
      || videoFallbackMount.archiveSet?.archiveCount !== 1
      || videoFallbackMount.state?.binkVideoAssets?.unavailable !== true) {
    throw new Error(`Missing optional-video sources blocked archive mounting: ${JSON.stringify(videoFallbackMount)}`);
  }
  await page.waitForFunction(() => window.CnCPort?.state?.threadedMode === true, null, { timeout: 30000 });
  const runtime = await page.evaluate(() => ({
    heapShared: window.CnCPort.engineModule()?.HEAP8?.buffer instanceof SharedArrayBuffer,
    canvasTransferred: (() => { try { document.querySelector("#viewport").transferControlToOffscreen(); return false; } catch { return true; } })(),
  }));
  if (!Object.values(runtime).every(Boolean)) throw new Error(`Threaded runtime failed: ${JSON.stringify(runtime)}`);
  await page.locator('.desktop-icon[data-open="about"]').click();
  await page.waitForSelector("#publicLegalNotice", { state: "visible" });
  await page.waitForFunction((version) => document.querySelector("#aboutVersion")?.textContent === version,
    expectedBuildInfo.release.version);
  const about = await page.evaluate(() => ({
    version: document.querySelector("#aboutVersion")?.textContent || "",
    buildHref: document.querySelector("#aboutBuildCommit")?.href || "",
    changelogEntries: document.querySelectorAll("#aboutChangelog li").length,
  }));
  if (about.version !== expectedBuildInfo.release.version
      || !about.buildHref.endsWith(`/commit/${expectedBuildInfo.git.commit}`)
      || about.changelogEntries !== expectedChangelogEntries) {
    throw new Error(`About build information failed: ${JSON.stringify(about)}`);
  }
  if (errors.length) throw new Error(`Unexpected browser errors:\n${errors.join("\n")}`);

  const legacyContext = await browser.newContext({ serviceWorkers: "allow" });
  const legacyPage = await legacyContext.newPage();
  try {
    await legacyPage.goto(`${baseUrl}harness/play.html?diag=lite`, { waitUntil: "domcontentloaded" });
    await legacyPage.waitForURL(`${baseUrl}?diag=lite`, { timeout: 30000 });
    await legacyPage.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
    if (!await legacyPage.evaluate(() => window.crossOriginIsolated)) throw new Error("Legacy redirect lost isolation");
  } finally {
    await legacyContext.close();
  }

  const retirementContext = await browser.newContext({ serviceWorkers: "allow" });
  const retirementPage = await retirementContext.newPage();
  try {
    serveOldServiceWorker = true;
    await retirementPage.goto(`${baseUrl}${rolloutSeedName}`, { waitUntil: "domcontentloaded" });
    await retirementPage.evaluate(async () => {
      await navigator.serviceWorker.register("./coi-serviceworker.js", { scope: "./", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolveController, rejectController) => {
          const timer = setTimeout(() => rejectController(new Error("Old worker did not claim the retirement seed")), 10000);
          navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timer); resolveController(); }, { once: true });
        });
      }
    });
    serveOldServiceWorker = false;
    await retirementPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await retirementPage.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
    await retirementPage.waitForFunction(async () => !navigator.serviceWorker.controller
      && (await navigator.serviceWorker.getRegistrations()).length === 0, null, { timeout: 30000 });
    const retired = await retirementPage.evaluate(() => ({
      isolated: window.crossOriginIsolated,
      sharedArrayBuffer: typeof SharedArrayBuffer === "function",
      launcherVisible: Boolean(document.querySelector("#desktop")?.getClientRects().length),
    }));
    if (!Object.values(retired).every(Boolean) || retirementPage.url() !== baseUrl) {
      throw new Error(`Legacy worker retirement failed: ${JSON.stringify({ retired, url: retirementPage.url() })}`);
    }
  } finally {
    serveOldServiceWorker = false;
    await retirementContext.close();
  }

  const screenshot = process.env.CLOUDFLARE_SMOKE_SCREENSHOT;
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    initial,
    wasm,
    videoSupport,
    videoRuntime: { total: videoRuntime.total, parts: videoRuntime.parts.length },
    videoFallbackMount: {
      ok: videoFallbackMount.ok,
      archiveCount: videoFallbackMount.archiveSet?.archiveCount,
      binkVideoAssets: videoFallbackMount.state?.binkVideoAssets,
    },
    runtime,
    legacyRedirect: true,
    oldWorkerRetired: true,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
