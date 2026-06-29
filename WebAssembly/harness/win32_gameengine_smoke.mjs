import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { assertWin32GameEngineProbe } from "./win32_gameengine_assertions.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

const server = await startStaticServer({ root: wasmRoot });
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const harnessUrl = new URL("harness/index.html", server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const result = await page.evaluate(() => window.CnCPort.rpc("win32GameEngineProbe"));
  if (!result.ok) {
    throw new Error(`Win32GameEngine probe RPC failed: ${JSON.stringify(result)}`);
  }
  assertWin32GameEngineProbe(result.probe, "browser wasm");

  console.log(JSON.stringify({
    ok: true,
    url: harnessUrl,
    probe: result.probe,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
