import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const repoRoot = resolve(wasmRoot, "..");

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function unusedPort() {
  const server = createServer();
  server.unref();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose, reject) => server.close((error) =>
    (error ? reject(error) : resolveClose())));
  return port;
}

async function waitFor(label, operation, accept, timeoutMs = 120000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try {
      last = await operation();
      if (accept(last)) return last;
    } catch (error) {
      last = { error: error?.message ?? String(error) };
    }
    await delay(250);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)?.slice(0, 1000)}`);
}

function startBridge({ port, engineToken, apiToken, playMode }) {
  const executable = process.env.AGENT_BRIDGE_EXECUTABLE;
  const command = executable || "go";
  const args = [
    ...(executable ? [] : ["run", "./cmd/new-shoes-agent-bridge"]),
    `-listen=127.0.0.1:${port}`,
    `-engine-url=ws://127.0.0.1:${port}/engine`,
    `-engine-token=${engineToken}`,
    `-api-token=${apiToken}`,
    `-play-mode=${playMode}`,
  ];
  const child = spawn(command, args, {
    cwd: resolve(repoRoot, "AgentBridge"),
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.pipe(process.stderr);
  return child;
}

async function stopBridge(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([once(child, "exit"), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function main() {
  const port = Number(process.env.AGENT_BRIDGE_PORT) || await unusedPort();
  const engineToken = process.env.AGENT_BRIDGE_ENGINE_TOKEN || randomUUID();
  const apiToken = process.env.AGENT_BRIDGE_API_TOKEN || randomUUID();
  const sessionId = process.env.AGENT_BRIDGE_SESSION_ID || `match-${randomUUID()}`;
  const playMode = process.env.AGENT_BRIDGE_PLAY_MODE || "global";
  const bridgeBase = `http://127.0.0.1:${port}`;
  const bridge = startBridge({ port, engineToken, apiToken, playMode });
  const staticServer = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/agent-bridge-match-host");
  const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
  await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  let browser;
  try {
    await waitFor("Go bridge health", () => fetch(`${bridgeBase}/healthz`),
      (response) => response.ok, 30000);
    const browserArgs = (process.env.AGENT_BRIDGE_BROWSER_ARGS ?? "")
      .split(/\s+/)
      .filter(Boolean);
    browser = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      ...(process.env.AGENT_BRIDGE_BROWSER_EXECUTABLE
        ? { executablePath: process.env.AGENT_BRIDGE_BROWSER_EXECUTABLE }
        : {}),
      args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
    });
    await browser.addInitScript((config) => {
      window.CnCPortPlayConfig = config;
    }, {
      agentBridge: {
        url: `ws://127.0.0.1:${port}/engine`,
        token: engineToken,
        sessionId,
        playMode,
      },
    });
    const page = await browser.newPage();
    page.on("pageerror", (error) => process.stderr.write(`[match-host] page error: ${error}\n`));
    page.on("console", (message) => {
      if (message.type() === "error") process.stderr.write(`[match-host] console: ${message.text()}\n`);
    });
    const renderer = await page.evaluate(() => {
      const context = document.createElement("canvas").getContext("webgl2");
      const extension = context?.getExtension("WEBGL_debug_renderer_info");
      return extension
        ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : context?.getParameter(context.RENDERER) ?? "unknown";
    });
    if (/swiftshader|llvmpipe|software/i.test(renderer)) {
      throw new Error(`browser did not use a hardware GPU: ${renderer}`);
    }
    const pageUrl = new URL(
      `harness/play.html?autostart=1&dist=${process.env.AGENT_BRIDGE_DIST ?? "dist-threaded"}`,
      staticServer.url,
    );
    await page.goto(pageUrl.href, { waitUntil: "load" });
    await waitFor("browser agent adapter", () => page.evaluate(() => ({
      bridge: window.CnCPort?.getAgentBridgeState?.() ?? null,
      runtimeStarted: window.ZeroHRuntime?.started === true,
    })), (state) => state.bridge?.connected === true && state.runtimeStarted === true, 180000);
    await waitFor("authenticated session", async () => {
      const response = await fetch(`${bridgeBase}/v1/sessions`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      return { status: response.status, body: await response.json() };
    }, (reply) => reply.status === 200
      && reply.body.sessions?.some((session) => session.id === sessionId), 30000);

    process.stdout.write(`${JSON.stringify({
      ready: true,
      bridgeBase,
      apiToken,
      sessionId,
      playMode,
      renderer,
      pageUrl: pageUrl.href,
    })}\n`);

    await new Promise((resolveStop) => {
      process.once("SIGINT", resolveStop);
      process.once("SIGTERM", resolveStop);
    });
    await page.screenshot({
      path: resolve(screenshotDir, "agent-bridge-match-host-final.png"),
    }).catch(() => {});
  } finally {
    if (browser) await browser.close();
    await staticServer.close();
    await stopBridge(bridge);
    await rm(profileDir, { recursive: true, force: true });
  }
}

await main();
