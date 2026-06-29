import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

function assertWin32GameEngineProbe(probe, context) {
  if (!probe?.ok
      || probe.source !== "GeneralsMD/Code/GameEngineDevice/Source/Win32Device/Common/Win32GameEngine.cpp"
      || probe.originalHeader !== "GeneralsMD/Code/GameEngineDevice/Include/Win32Device/Common/Win32GameEngine.h"
      || probe.service !== "Win32GameEngine::serviceWindowsOS"
      || probe.serviceHelper !== "cnc_port_win32_service_windows_os_message_pump"
      || probe.constructorBoundary !== "Win32GameEngine construction requires linked GameEngine vtable/typeinfo and owned startup singleton lifetime"
      || probe.destructorBoundary !== "GameEngine::~GameEngine owns full startup singleton lifetime"
      || probe.nextRequired !== "ownedGameEngineSingletonLifetime"
      || probe.registerWindowClass !== true
      || probe.windowCreated !== true
      || probe.constructionSkipped !== true
      || probe.destructorSkipped !== true) {
    throw new Error(`${context} Win32GameEngine source/header boundary mismatch: ${JSON.stringify(probe)}`);
  }

  const errorMode = probe.errorMode;
  if (errorMode?.beforeConstructorContract !== 64
      || errorMode.constructorPrevious !== 64
      || errorMode.afterConstructorContract !== errorMode.constructorMode
      || errorMode.constructorMode !== 1
      || errorMode.beforeManualRestore !== errorMode.constructorMode
      || errorMode.afterManualRestore !== errorMode.previous) {
    throw new Error(`${context} Win32GameEngine error-mode contract mismatch: ${JSON.stringify(errorMode)}`);
  }

  const messagePump = probe.messagePump;
  if (messagePump?.queued !== true
      || messagePump.queueBeforeService !== 1
      || messagePump.queueAfterService !== 0
      || messagePump.createMessages !== 1
      || messagePump.userMessages !== 1
      || messagePump.destroyMessages !== 1
      || messagePump.seenMessage !== 1090
      || messagePump.seenWParam !== 0x1234
      || messagePump.seenLParam !== 0x5678
      || messagePump.seenMessageTime !== 24680) {
    throw new Error(`${context} Win32GameEngine message pump mismatch: ${JSON.stringify(messagePump)}`);
  }
}

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
