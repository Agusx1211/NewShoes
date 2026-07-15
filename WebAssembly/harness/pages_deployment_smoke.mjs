#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { verifyAgentResources } from "./agent_resources_smoke.mjs";

const root = resolve(process.argv[2] || "pages-dist");
const expectedBuildInfo = JSON.parse(await readFile(resolve(root, "harness/build-info.json"), "utf8"));
const expectedChangelogEntries = expectedBuildInfo.release.changelog
  .reduce((total, section) => total + section.entries.length, 0);
const testWorkerRollout = process.argv.includes("--worker-rollout");
const prefix = "/CnC_Generals_Zero_Hour/";
const rolloutSeedName = "__coi_rollout_seed.html";
const rolloutWorkerVersion = "project-new-shoes.pages-root.v1";
const oldWorkerRevision = "18b95831";
const oldWorkerSha256 = "a5b1bdd23a433a580ed71de93d5429efd3878101b3426e3d0d671ae5e0304c16";
const oldWorkerSource = await readFile(new URL("./fixtures/coi-serviceworker-18b95831.js", import.meta.url), "utf8");
if (createHash("sha256").update(oldWorkerSource).digest("hex") !== oldWorkerSha256) {
  throw new Error(`The ${oldWorkerRevision} rollout worker fixture no longer matches its pinned digest`);
}
let serveOldServiceWorker = false;
const mime = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".xml", "application/xml; charset=utf-8"],
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
  const relativeName = decodeURIComponent(url.pathname.startsWith(prefix)
    ? url.pathname.slice(prefix.length)
    : url.pathname.slice(1)) || "index.html";
  if (relativeName === rolloutSeedName) {
    const body = "<!doctype html><meta charset=utf-8><title>Service worker rollout seed</title>";
    response.writeHead(200, {
      "content-length": Buffer.byteLength(body),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else response.end(body);
    return;
  }
  if (serveOldServiceWorker && relativeName === "coi-serviceworker.js") {
    response.writeHead(200, {
      "content-length": Buffer.byteLength(oldWorkerSource),
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else response.end(oldWorkerSource);
    return;
  }
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
  await page.waitForURL(baseUrl, { timeout: 30000 });
  await page.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc && window.ZeroHAssetLibrary), null, { timeout: 30000 });
  const firstPathname = new URL(page.url()).pathname;
  if (firstPathname !== prefix) throw new Error(`First launcher URL is not the Pages scope root: ${page.url()}`);

  const isolation = await page.evaluate(() => ({
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === "function",
    controlled: Boolean(navigator.serviceWorker.controller),
    launcherVisible: Boolean(document.querySelector("#desktop")?.getClientRects().length),
  }));
  if (!Object.values(isolation).every(Boolean)) {
    throw new Error(`Pages isolation/launcher checks failed: ${JSON.stringify(isolation)}`);
  }
  const agentResources = await verifyAgentResources(page);
  if (!navigationHeaders.some((headers) => !headers["cross-origin-opener-policy"])
      || !navigationHeaders.some((headers) => headers["cross-origin-opener-policy"] === "same-origin"
        && headers["cross-origin-embedder-policy"] === "require-corp")) {
    throw new Error(`Expected an unisolated first navigation and an isolated service-worker navigation: ${JSON.stringify(navigationHeaders)}`);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(baseUrl, { timeout: 30000 });
  await page.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
  await page.waitForFunction(() => window.crossOriginIsolated
    && typeof SharedArrayBuffer === "function"
    && Boolean(navigator.serviceWorker.controller)
    && Boolean(window.CnCPort?.rpc), null, { timeout: 30000 });
  const reloadPathname = new URL(page.url()).pathname;
  if (reloadPathname !== prefix) throw new Error(`Reloaded launcher URL is not the Pages scope root: ${page.url()}`);

  const wasm = await page.evaluate(async () => {
    const response = await fetch(new URL("../dist-threaded-release/cnc-port.wasm", document.baseURI), { cache: "no-store" });
    return { ok: response.ok, type: response.headers.get("content-type"), bytes: (await response.arrayBuffer()).byteLength };
  });
  if (!wasm.ok || wasm.type !== "application/wasm" || wasm.bytes < 1024) {
    throw new Error(`Wasm delivery check failed: ${JSON.stringify(wasm)}`);
  }

  await page.waitForFunction(() => window.ZeroHDesktop?.videoSupport?.checking === false);
  const videoSupport = await page.evaluate(() => ({
    policy: document.documentElement.dataset.binkVideoSidecars,
    support: window.ZeroHDesktop.videoSupport,
    disabled: document.querySelector("#includeVideosToggle")?.disabled,
    description: document.querySelector("#includeVideosDescription")?.textContent || "",
  }));
  if (videoSupport.policy !== "direct"
      || videoSupport.support?.available !== true
      || videoSupport.support?.mode !== "direct"
      || videoSupport.disabled !== false
      || !/play original movies directly/i.test(videoSupport.description)) {
    throw new Error(`Hosted optional-video support failed: ${JSON.stringify(videoSupport)}`);
  }
  const videoRuntime = await page.evaluate(async () => {
    const base = new URL("../video-runtime/", document.baseURI);
    const manifestResponse = await fetch(new URL("bink-decoder-manifest.json", base));
    const manifest = await manifestResponse.json();
    const response = await fetch(new URL(manifest.wasmFile, base));
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((value) => value.toString(16).padStart(2, "0")).join("");
    return { manifestOk: manifestResponse.ok, wasmOk: response.ok, manifest, bytes: bytes.byteLength, digest };
  });
  if (!videoRuntime.manifestOk || !videoRuntime.wasmOk
      || videoRuntime.bytes !== videoRuntime.manifest.wasmBytes
      || videoRuntime.bytes > 128 * 1024
      || videoRuntime.digest !== videoRuntime.manifest.wasmSha256) {
    throw new Error(`Hosted video runtime delivery failed: ${JSON.stringify(videoRuntime)}`);
  }

  // The empty mount validates before worker startup, so prepare the realm
  // explicitly afterward. Reaching threadedMode proves the actual Emscripten
  // pthread worker accepted the transferred viewport OffscreenCanvas.
  const emptyMount = await page.evaluate(() => window.CnCPort.rpc("mountArchives", { archives: [] }));
  if (emptyMount.ok !== false || !/Missing archive list/.test(emptyMount.error || "")) {
    throw new Error(`Unexpected empty-mount result: ${JSON.stringify(emptyMount)}`);
  }
  const prep = await page.evaluate(() => window.CnCPort.rpc("threadedStatus", {}));
  if (prep.ok !== true || prep.threaded !== true) {
    throw new Error(`Threaded realm preparation failed: ${JSON.stringify(prep)}`);
  }
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
  await page.waitForFunction((version) => document.querySelector("#aboutVersion")?.textContent === version,
    expectedBuildInfo.release.version);
  const notice = await page.evaluate(() => ({
    text: document.querySelector("#publicLegalNotice")?.textContent || "",
    license: document.querySelector('#publicLegalNotice a[href="../legal.html"]')?.href || "",
    source: [...document.querySelectorAll("#publicLegalNotice a")]
      .find((link) => link.textContent.includes("Corresponding source"))?.href || "",
    version: document.querySelector("#aboutVersion")?.textContent || "",
    buildHref: document.querySelector("#aboutBuildCommit")?.href || "",
    changelogEntries: document.querySelectorAll("#aboutChangelog li").length,
  }));
  if (!/Copyright.*no warranty/i.test(notice.text)
      || !notice.license.endsWith(`${prefix}legal.html`)
      || !notice.source.startsWith("https://github.com/")
      || notice.version !== expectedBuildInfo.release.version
      || !notice.buildHref.endsWith(`/commit/${expectedBuildInfo.git.commit}`)
      || notice.changelogEntries !== expectedChangelogEntries) {
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
    await deepPage.waitForURL(`${baseUrl}?diag=lite`, { timeout: 30000 });
    await deepPage.waitForFunction(() => window.crossOriginIsolated
      && typeof SharedArrayBuffer === "function"
      && Boolean(navigator.serviceWorker.controller), null, { timeout: 30000 });
    if (new URL(deepPage.url()).pathname !== prefix) {
      throw new Error(`Legacy play URL did not recover to the Pages scope root: ${deepPage.url()}`);
    }
  } finally {
    await deepContext.close();
  }

  const rootContext = await browser.newContext({ serviceWorkers: "allow" });
  const rootPage = await rootContext.newPage();
  const rootBaseUrl = `http://127.0.0.1:${address.port}/`;
  try {
    await rootPage.goto(rootBaseUrl, { waitUntil: "domcontentloaded" });
    await rootPage.waitForURL(rootBaseUrl, { timeout: 30000 });
    await rootPage.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
    await rootPage.waitForFunction(() => window.crossOriginIsolated
      && typeof SharedArrayBuffer === "function"
      && Boolean(navigator.serviceWorker.controller)
      && Boolean(window.CnCPort?.rpc), null, { timeout: 30000 });
    if (new URL(rootPage.url()).pathname !== "/") {
      throw new Error(`Domain-root launcher exposed a noncanonical path: ${rootPage.url()}`);
    }
    await rootPage.reload({ waitUntil: "domcontentloaded" });
    await rootPage.waitForURL(rootBaseUrl, { timeout: 30000 });
    await rootPage.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
    await rootPage.waitForFunction(() => window.crossOriginIsolated
      && typeof SharedArrayBuffer === "function"
      && Boolean(navigator.serviceWorker.controller)
      && Boolean(window.CnCPort?.rpc), null, { timeout: 30000 });
    if (new URL(rootPage.url()).pathname !== "/") {
      throw new Error(`Reloaded domain-root launcher exposed a noncanonical path: ${rootPage.url()}`);
    }

    // Chrome's force reload bypasses the service worker for one navigation.
    // The bootstrap page is therefore unisolated and has no controller, even
    // though the registration still owns an activated isolation worker. The
    // bootstrap must verify registration.active and navigate once normally;
    // requiring a controller on the bypassed document strands users on the
    // "could not start the threaded runtime" screen until Chrome restarts.
    const devtools = await rootContext.newCDPSession(rootPage);
    await devtools.send("Network.enable");
    await devtools.send("Network.setBypassServiceWorker", { bypass: true });
    await rootPage.reload({ waitUntil: "domcontentloaded" });
    await devtools.send("Network.setBypassServiceWorker", { bypass: false });
    await rootPage.waitForURL(rootBaseUrl, { timeout: 30000 });
    await rootPage.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
    await rootPage.waitForFunction(() => window.crossOriginIsolated
      && typeof SharedArrayBuffer === "function"
      && Boolean(navigator.serviceWorker.controller)
      && Boolean(window.CnCPort?.rpc), null, { timeout: 30000 });
    if (new URL(rootPage.url()).pathname !== "/") {
      throw new Error(`Force-reloaded domain-root launcher exposed a noncanonical path: ${rootPage.url()}`);
    }
  } finally {
    await rootContext.close();
  }

  let workerRollout = null;
  if (testWorkerRollout) {
    const rolloutContext = await browser.newContext({ serviceWorkers: "allow" });
    const rolloutPage = await rolloutContext.newPage();
    const rolloutErrors = [];
    let rolloutNavigations = 0;
    rolloutPage.on("pageerror", (error) => rolloutErrors.push(`pageerror: ${error.message}`));
    rolloutPage.on("response", (response) => {
    if (response.status() >= 400
        && !/__cnc_(build_info|https_info)/.test(response.url())
        && !/\/artifacts\/real-assets\/cursors\/manifest\.json(?:\?|$)/.test(response.url())) {
      rolloutErrors.push(`${response.status()} ${response.url()}`);
    }
    });
    try {
    serveOldServiceWorker = true;
    await rolloutPage.goto(`${baseUrl}${rolloutSeedName}`, { waitUntil: "domcontentloaded" });
    await rolloutPage.evaluate(async () => {
      await navigator.serviceWorker.register("./coi-serviceworker.js", {
        scope: "./",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolveController, rejectController) => {
          const timer = setTimeout(() => rejectController(new Error("Old worker did not claim the seed page")), 10000);
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            clearTimeout(timer);
            resolveController();
          }, { once: true });
        });
      }
    });
    const oldVersion = await rolloutPage.evaluate(() => new Promise((resolveVersion) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolveVersion(null), 500);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolveVersion(event.data?.version || null);
      };
      navigator.serviceWorker.controller.postMessage(
        { type: "project-new-shoes:coi-worker-version" },
        [channel.port2],
      );
    }));
    if (oldVersion !== null) {
      throw new Error(`Pinned ${oldWorkerRevision} worker unexpectedly reported version ${oldVersion}`);
    }

    serveOldServiceWorker = false;
    rolloutPage.on("framenavigated", (frame) => {
      if (frame === rolloutPage.mainFrame()) rolloutNavigations += 1;
    });
    const rolloutUrl = `${baseUrl}?diag=lite#rollout-proof`;
    await rolloutPage.goto(rolloutUrl, { waitUntil: "domcontentloaded" });
    await rolloutPage.waitForURL(rolloutUrl, { timeout: 30000 });
    try {
      await rolloutPage.waitForSelector("#desktop", { state: "visible", timeout: 30000 });
    } catch (cause) {
      const diagnostics = await rolloutPage.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const controllerVersion = await new Promise((resolveVersion) => {
          if (!navigator.serviceWorker.controller) {
            resolveVersion(null);
            return;
          }
          const channel = new MessageChannel();
          const timer = setTimeout(() => resolveVersion(null), 500);
          channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolveVersion(event.data?.version || null);
          };
          navigator.serviceWorker.controller.postMessage(
            { type: "project-new-shoes:coi-worker-version" },
            [channel.port2],
          );
        });
        return {
          url: location.href,
          title: document.title,
          readyState: document.readyState,
          status: document.querySelector("#coi-status")?.textContent || null,
          error: document.querySelector("#coi-error")?.textContent || null,
          isolated: window.crossOriginIsolated,
          controlled: Boolean(navigator.serviceWorker.controller),
          controllerVersion,
          registrations: registrations.map((registration) => ({
            scope: registration.scope,
            active: registration.active?.state || null,
            waiting: registration.waiting?.state || null,
            installing: registration.installing?.state || null,
          })),
        };
      }).catch((error) => ({ evaluationError: error.message }));
      throw new Error(`Rollout launcher did not appear: ${cause.message}\n${JSON.stringify(diagnostics, null, 2)}\n${rolloutErrors.join("\n")}`);
    }
    await rolloutPage.waitForFunction((expectedVersion) => new Promise((resolveVersion) => {
      if (!window.crossOriginIsolated || typeof SharedArrayBuffer !== "function"
          || !navigator.serviceWorker.controller || !window.CnCPort?.rpc) {
        resolveVersion(false);
        return;
      }
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolveVersion(false), 250);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolveVersion(event.data?.version === expectedVersion);
      };
      navigator.serviceWorker.controller.postMessage(
        { type: "project-new-shoes:coi-worker-version" },
        [channel.port2],
      );
    }), rolloutWorkerVersion, { timeout: 30000 });
    const rolloutLocation = new URL(rolloutPage.url());
    if (rolloutLocation.pathname !== prefix
        || rolloutLocation.search !== "?diag=lite"
        || rolloutLocation.hash !== "#rollout-proof") {
      throw new Error(`Worker rollout lost the canonical URL, query, or fragment: ${rolloutPage.url()}`);
    }
    if (rolloutNavigations < 2 || rolloutNavigations > 4) {
      throw new Error(`Worker rollout missed its navigation bound of 2-4: ${rolloutNavigations}`);
    }

    const rolloutPrep = await rolloutPage.evaluate(() => window.CnCPort.rpc("mountArchives", { archives: [] }));
    if (rolloutPrep.ok !== false || !/Missing archive list/.test(rolloutPrep.error || "")) {
      throw new Error(`Unexpected rollout empty-mount result: ${JSON.stringify(rolloutPrep)}`);
    }
    await rolloutPage.waitForFunction(() => window.CnCPort?.state?.threadedMode === true, null, { timeout: 30000 });
    const rolloutRuntime = await rolloutPage.evaluate(() => ({
      heapShared: window.CnCPort.engineModule()?.HEAP8?.buffer instanceof SharedArrayBuffer,
      canvasTransferred: (() => {
        try { document.querySelector("#viewport").transferControlToOffscreen(); return false; }
        catch { return true; }
      })(),
    }));
    if (!Object.values(rolloutRuntime).every(Boolean)) {
      throw new Error(`Threaded runtime failed after worker rollout: ${JSON.stringify(rolloutRuntime)}`);
    }
    if (rolloutErrors.length) throw new Error(`Unexpected rollout browser errors:\n${rolloutErrors.join("\n")}`);
      workerRollout = {
        fromRevision: oldWorkerRevision,
        toVersion: rolloutWorkerVersion,
        navigations: rolloutNavigations,
        canonicalLocationPreserved: true,
        threadedRuntime: true,
      };
    } finally {
      serveOldServiceWorker = false;
      await rolloutContext.close();
    }
  }

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    isolation,
    agentResources,
    wasm,
    videoSupport,
    videoRuntime: { bytes: videoRuntime.bytes, abiVersion: videoRuntime.manifest.abiVersion },
    runtime,
    canonicalPath: { first: firstPathname, reload: reloadPathname },
    domainRootCanonical: true,
    forceReloadRecovery: true,
    workerRollout,
    legacyPlayRecovery: true,
    legalNotice: true,
    unregister: true,
    navigations: navigationHeaders.length,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
