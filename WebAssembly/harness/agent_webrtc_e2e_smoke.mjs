#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(wasmRoot, "..");
const relayPort = 18921;
const bridgePort = 18922;
const pagePort = 18923;
const engineToken = "webrtc-e2e-engine-token";
const apiToken = "webrtc-e2e-api-token";
const temporaryDirectory = await mkdtemp(join(tmpdir(), "new-shoes-agent-webrtc-"));
const bridgeBinary = join(temporaryDirectory, "new-shoes-agent-bridge");
await promisify(execFile)("go", ["build", "-o", bridgeBinary, "./cmd/new-shoes-agent-bridge"], {
  cwd: resolve(repositoryRoot, "AgentBridge"),
});

function start(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  return { child, output: () => output };
}

async function waitFor(url, process, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.child.exitCode != null) {
      throw new Error(`process exited while waiting for ${url}: ${process.output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The process has not bound its port yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`timed out waiting for ${url}: ${process.output()}`);
}

async function stop(process) {
  if (process.child.exitCode != null) return;
  process.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => process.child.once("exit", resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 5000)),
  ]);
}

const relay = start(process.execPath, [
  resolve(wasmRoot, "node_modules/wrangler/bin/wrangler.js"),
  "dev", "--local", "--ip", "127.0.0.1", "--port", String(relayPort),
  "--config", resolve(wasmRoot, "cloudflare/trystero-relay/wrangler.jsonc"),
], { cwd: wasmRoot });
const bridge = start(bridgeBinary, [
  "-listen", `127.0.0.1:${bridgePort}`,
  "-engine-url", `webrtc+insecure://127.0.0.1:${relayPort}/agent`,
  "-engine-token", engineToken,
  "-api-token", apiToken,
], { cwd: resolve(repositoryRoot, "AgentBridge") });

const pageServer = createServer(async (request, response) => {
  if (request.url === "/") {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<!doctype html><title>Agent WebRTC smoke</title>");
    return;
  }
  const path = resolve(wasmRoot, `.${new URL(request.url, "http://local").pathname}`);
  if (!path.startsWith(`${wasmRoot}/`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const content = await readFile(path);
    response.setHeader("content-type", extname(path) === ".mjs"
      ? "text/javascript; charset=utf-8" : "application/octet-stream");
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});

let browser;
try {
  await Promise.all([
    waitFor(`http://127.0.0.1:${relayPort}/health`, relay),
    waitFor(`http://127.0.0.1:${bridgePort}/healthz`, bridge),
    new Promise((resolveListen, rejectListen) => {
      pageServer.once("error", rejectListen);
      pageServer.listen(pagePort, "127.0.0.1", resolveListen);
    }),
  ]);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${pagePort}/`);
  const result = await page.evaluate(async ({ relayPort: port, token }) => {
    const { AgentWebRTCTransport } = await import("/harness/agent-webrtc-transport.mjs");
    const transport = new AgentWebRTCTransport(
      `webrtc+insecure://127.0.0.1:${port}/agent`, token,
    );
    return new Promise((resolveResult, rejectResult) => {
      const trace = [];
      const timer = setTimeout(() => rejectResult(
        new Error(`WebRTC probe timed out: ${JSON.stringify(trace)}`),
      ), 20000);
      transport.addEventListener("open", () => {
        trace.push("open");
        transport.send(JSON.stringify({
          type: "probe",
          protocol: "cnc-agent/1",
          token,
          sessionId: "e2e-smoke",
          playMode: "global",
        }));
      });
      transport.addEventListener("message", (event) => {
        trace.push(`message:${event.data}`);
        const message = JSON.parse(event.data);
        if (message.type === "probe" && message.ok === true) {
          clearTimeout(timer);
          transport.close(1000, "probe complete");
          resolveResult(message);
        }
      });
      transport.addEventListener("error", (event) => {
        trace.push(`error:${event.message ?? "unknown"}`);
        clearTimeout(timer);
        rejectResult(new Error(event.message ?? "WebRTC transport error"));
      });
      transport.addEventListener("close", (event) => {
        trace.push(`close:${event.code}:${event.reason}`);
      });
    });
  }, { relayPort, token: engineToken });
  if (result.protocol !== "cnc-agent/1" || result.sessionId !== "e2e-smoke") {
    throw new Error(`unexpected probe reply: ${JSON.stringify(result)}`);
  }
  const sessionsResponse = await fetch(`http://127.0.0.1:${bridgePort}/v1/sessions`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  const sessions = await sessionsResponse.json();
  if (!sessionsResponse.ok || sessions.sessions?.length !== 0) {
    throw new Error(`probe registered a playable session: ${JSON.stringify(sessions)}`);
  }
  await page.evaluate(async ({ relayPort: port, token }) => {
    const { AgentWebRTCTransport } = await import("/harness/agent-webrtc-transport.mjs");
    const transport = new AgentWebRTCTransport(
      `webrtc+insecure://127.0.0.1:${port}/agent`, token,
    );
    window.agentWebRTCSmokeTransport = transport;
    await new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error("WebRTC runtime hello timed out")), 20000);
      transport.addEventListener("open", () => transport.send(JSON.stringify({
        type: "hello",
        protocol: "cnc-agent/1",
        token,
        sessionId: "e2e-runtime",
        playMode: "global",
        capabilities: ["protocol.describe"],
      })));
      transport.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "hello" && message.ok === true) {
          clearTimeout(timer);
          resolveReady();
          return;
        }
        if (message.type === "request" && message.op === "protocol.describe") {
          transport.send(JSON.stringify({
            type: "response",
            id: message.id,
            ok: true,
            result: { protocol: "cnc-agent/1", transport: "webrtc-datachannel-json" },
          }));
        }
      });
      transport.addEventListener("error", (event) => {
        clearTimeout(timer);
        rejectReady(new Error(event.message ?? "WebRTC runtime transport error"));
      });
    });
  }, { relayPort, token: engineToken });
  const runtimeResponse = await fetch(
    `http://127.0.0.1:${bridgePort}/v1/sessions/e2e-runtime/requests`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op: "protocol.describe", args: {} }),
    },
  );
  const runtimeResult = await runtimeResponse.json();
  if (!runtimeResponse.ok || runtimeResult.result?.transport !== "webrtc-datachannel-json") {
    throw new Error(`REST request did not cross the WebRTC channel: ${JSON.stringify(runtimeResult)}`);
  }
  await page.evaluate(() => window.agentWebRTCSmokeTransport.close(1000, "runtime test complete"));
  const disconnectDeadline = Date.now() + 5000;
  let remainingSessions = ["e2e-runtime"];
  while (Date.now() < disconnectDeadline) {
    const response = await fetch(`http://127.0.0.1:${bridgePort}/v1/sessions`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    remainingSessions = (await response.json()).sessions ?? [];
    if (remainingSessions.length === 0) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  if (remainingSessions.length !== 0) {
    throw new Error(`closed WebRTC session remained registered: ${JSON.stringify(remainingSessions)}`);
  }
  console.log(JSON.stringify({
    ok: true,
    path: "browser-worker-go-webrtc",
    encryptedSignaling: true,
    authenticatedDataChannelProbe: true,
    restRoundTrip: true,
    playableSessionsCreated: 0,
  }));
} catch (error) {
  throw new Error(`${error.message}\nbridge:\n${bridge.output()}\nrelay:\n${relay.output()}`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose) => pageServer.close(resolveClose));
  await Promise.all([stop(bridge), stop(relay)]);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
