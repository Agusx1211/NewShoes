// threaded_boot_diag.mjs — DISPOSABLE P1c iteration diagnostic. Opens
// play.html?autostart=1&threads=1, then every 10s dumps the overlay progress
// line, the harness log tail, and the threaded status so a stuck boot names
// its phase. Exits after DIAG_SECONDS (default 300).
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const seconds = Number(process.env.DIAG_SECONDS ?? 300);

const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));
page.on("response", (response) => {
  if (response.status() >= 400) {
    console.log(`[http ${response.status()}] ${response.url()}`);
  }
});
page.on("requestfailed", (request) => {
  console.log(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ""}`);
});
page.on("console", (msg) => {
  const text = msg.text();
  if (!/still waiting|dependency:|end of list|willReadFrequently/.test(text)) {
    console.log(`[console] ${msg.type()}: ${text.slice(0, 300)}`);
  }
});
await page.goto(new URL("harness/play.html?autostart=1&threads=1", server.url).href, { waitUntil: "load" });

const startedAt = Date.now();
while (Date.now() - startedAt < seconds * 1000) {
  await page.waitForTimeout(10000);
  const info = await page.evaluate(() => {
    const logs = window.CnCPort?.state?.logs ?? [];
    return {
      cncPortType: typeof window.CnCPort,
      logCount: logs.length,
      progress: document.querySelector("#progress")?.textContent ?? "",
      overlayHidden: document.querySelector("#overlay")?.classList?.contains("hidden") ?? null,
      threadedMode: window.CnCPort?.state?.threadedMode ?? null,
      threadedStatus: window.CnCPort?.state?.threadedEngine ? {
        init: window.CnCPort.state.threadedEngine.initState,
        live: window.CnCPort.state.threadedEngine.live,
        loopActive: window.CnCPort.state.threadedEngine.loop?.active,
        clientFrames: window.CnCPort.state.threadedEngine.loop?.clientFrames,
        frame: window.CnCPort.state.threadedEngine.frame,
      } : null,
      logTail: logs.slice(-6).map((entry) => `${entry.message} ${JSON.stringify(entry.data ?? "").slice(0, 160)}`),
    };
  }).catch((error) => ({ evalError: error?.message }));
  console.log(`[diag +${Math.round((Date.now() - startedAt) / 1000)}s] ${JSON.stringify(info, null, 1)}`);
  if (info.overlayHidden === true) {
    console.log("[diag] overlay hidden — boot completed");
    break;
  }
}
await browser.close();
await server.close();
