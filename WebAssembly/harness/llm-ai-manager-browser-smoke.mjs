import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotPath = process.env.LLM_AI_MANAGER_SCREENSHOT || "/tmp/new-shoes-llm-ai-manager.png";
await mkdir(dirname(screenshotPath), { recursive: true });

const provider = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Content-Type", "application/json");
  if (request.method === "OPTIONS") { response.end("{}"); return; }
  if (request.url === "/v1/models") {
    response.end(JSON.stringify({ object: "list", data: [{ id: "browser-smoke-model", object: "model" }] }));
    return;
  }
  if (request.url === "/api/v0/models") {
    response.end(JSON.stringify({
      object: "list",
      data: [{
        id: "browser-smoke-model",
        object: "model",
        state: "loaded",
        loaded_context_length: 131_072,
        max_context_length: 262_144,
        capabilities: ["tool_use"],
      }],
    }));
    return;
  }
  if (request.url === "/v1/chat/completions" && request.method === "POST") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const structured = Boolean(body.response_format);
      const promptedProbe = /probe="([^"]+)"/.exec(
        body.messages?.find((message) => message.content?.includes("report_ready with ready=true"))?.content || "")?.[1];
      const probe = body.tools?.[0]?.function?.parameters?.properties?.probe?.enum?.[0] || promptedProbe;
      if (structured) {
        response.end(JSON.stringify({
          id: "browser-structured",
          choices: [{
            finish_reason: "stop",
            message: {
            role: "assistant",
            content: "",
            reasoning_content: JSON.stringify({
              action: "tool", tool: "report_ready", arguments: { ready: true, probe }, note: "ready",
            }),
            tool_calls: [],
            },
          }],
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        }));
        return;
      }
      response.setHeader("Content-Type", "text/event-stream");
      const send = (chunk) => response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      send({ id: "browser-native", choices: [{ delta: { reasoning_content: "Checking the exact probe. " } }] });
      send({ id: "browser-native", choices: [{ delta: { tool_calls: [{
        index: 0, id: "call_browser_probe", type: "function", function: { name: "report_", arguments: '{"ready":true,' },
      }] } }] });
      send({ id: "browser-native", choices: [{ delta: { tool_calls: [{
        index: 0, function: { name: "ready", arguments: `"probe":${JSON.stringify(probe)}}` },
      }] }, finish_reason: "tool_calls" }] });
      send({ id: "browser-native", choices: [], usage: {
        prompt_tokens: 20, completion_tokens: 10, total_tokens: 30,
      } });
      response.end("data: [DONE]\n\n");
    });
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: { message: "not found" } }));
});

await new Promise((resolveListen, rejectListen) => {
  provider.once("error", rejectListen);
  provider.listen(0, "127.0.0.1", () => { provider.off("error", rejectListen); resolveListen(); });
});
const providerPort = provider.address().port;
const staticServer = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1", httpsPort: null });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error?.message ?? String(error)));
  const playUrl = new URL("harness/play.html", staticServer.url);
  playUrl.searchParams.set("dist", "dist");
  await page.goto(playUrl.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(
    window.ZeroHLlmAi?.store && window.ZeroHLlmAiGameRuntime && window.ZeroHDesktop));
  assert.equal(await page.evaluate(() => window.ZeroHLlmAiGameRuntime.interval !== null), true);
  await page.locator('.desktop-icon[data-open="llmAi"]').click();
  await page.waitForSelector("#llmAiWindow.is-open");
  await page.locator("#llmAiEndpoint").fill(`http://127.0.0.1:${providerPort}`);
  await page.locator("#llmAiApiKey").fill("browser-ultra-secret");
  await page.locator("#llmAiDiscoverModels").click();
  await page.waitForFunction(() => document.querySelector("#llmAiModel")?.value === "browser-smoke-model");
  assert.equal(await page.locator("#llmAiContext").inputValue(), "131072");
  assert.match(await page.locator("#llmAiContextHint").textContent(), /131,072 detected.*provider runtime metadata/i);
  assert.match(await page.locator("#llmAiModelHint").textContent(), /1 available.*selected model reported/i);
  await page.locator("#llmAiContext").fill("65536");
  await page.locator("#llmAiDiscoverModels").click();
  await page.waitForFunction(() => document.querySelector("#llmAiFormStatus")?.textContent.includes("Loaded 1 model"));
  assert.equal(await page.locator("#llmAiContext").inputValue(), "65536", "discovery must preserve an explicit context value");
  assert.equal(await page.locator("#llmAiApplyContext").isVisible(), true);
  await page.locator("#llmAiApplyContext").click();
  assert.equal(await page.locator("#llmAiContext").inputValue(), "131072");
  await page.locator("#llmAiName").fill("Browser General");
  await page.locator("#llmAiThinking").selectOption("low");
  await page.locator("#llmAiObservationTokens").fill("6144");
  await page.locator("#llmAiToolResultTokens").fill("3072");
  await page.locator("#llmAiRecentContextTokens").fill("18432");
  await page.locator("#llmAiMandate").fill("Build a resilient economy, adapt, and win.");
  await page.locator("#llmAiProfileForm").evaluate((form) => form.requestSubmit());
  try {
    await page.waitForFunction(() => document.querySelector("#llmAiFormStatus")?.textContent.includes("ready for a player slot"));
  } catch (error) {
    const detail = await page.evaluate(() => ({
      status: document.querySelector("#llmAiFormStatus")?.textContent,
      valid: document.querySelector("#llmAiProfileForm")?.checkValidity(),
      invalid: [...document.querySelectorAll("#llmAiProfileForm :invalid")].map((element) => element.id),
    }));
    throw new Error(`Commander save did not complete: ${JSON.stringify(detail)}`, { cause: error });
  }
  assert.equal(await page.locator(".llm-ai-profile-card").count(), 1);
  const catalogSync = await page.evaluate(async () => ({
    result: await window.ZeroHLlmAi.syncProfileCatalog(),
    catalog: window.CnCPort.state.llmAiProfileCatalog,
  }));
  assert.equal(catalogSync.result.applied, true, JSON.stringify(catalogSync));
  assert.equal(catalogSync.result.result.profileCount, 1);
  assert.equal(catalogSync.catalog.length, 1);
  assert.equal(catalogSync.catalog[0].name, "Browser General");
  assert.match(catalogSync.catalog[0].id, /^[A-Za-z0-9._-]+$/);

  await page.locator("#llmAiTestEndpoint").click();
  await page.waitForFunction(() => document.querySelector("#llmAiFormStatus")?.textContent.includes("native protocol"));
  assert.doesNotMatch(await page.locator("#llmAiFormStatus").textContent(), /fallback/i);
  assert.equal(await page.locator("#llmAiDiagnosticChecks li").count(), 5);
  assert.equal(await page.locator("#llmAiDiagnosticChecks li.is-pass").count(), 5);
  assert.match(await page.locator('[data-check="tool"] span').textContent(), /one-time probe.*native function call/i);
  await page.waitForTimeout(1_000);
  await page.screenshot({ path: screenshotPath });

  const created = await page.evaluate(async () => {
    const [profile] = await window.ZeroHLlmAi.store.listProfiles();
    const session = {
      id: "browser-session-1",
      profileId: profile.id,
      profileSnapshot: { ...(await window.ZeroHLlmAi.listProfiles())[0] },
      status: "completed",
      outcome: "victory",
      startedAt: Date.now() - 12_000,
      endedAt: Date.now(),
      updatedAt: Date.now(),
      turns: 3,
      toolCalls: 5,
      failures: 0,
      totalTokens: 1_234,
    };
    await window.ZeroHLlmAi.store.createSession(session);
    await window.ZeroHLlmAi.store.appendEvent({
      sessionId: session.id,
      sequence: 1,
      timestamp: Date.now(),
      type: "model.decision",
      data: { authorization: "Bearer browser-ultra-secret", result: "victory" },
    });
    return { profileId: profile.id, sessionId: session.id };
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHLlmAi?.store));
  const persisted = await page.evaluate(async ({ profileId, sessionId }) => ({
    profile: await window.ZeroHLlmAi.store.getProfile(profileId),
    session: await window.ZeroHLlmAi.store.getSession(sessionId),
    exported: await window.ZeroHLlmAi.store.exportSession(sessionId),
  }), created);
  assert.equal(persisted.profile.name, "Browser General");
  assert.equal(persisted.profile.apiKey, "browser-ultra-secret");
  assert.equal(persisted.profile.routineObservationTokens, 6144);
  assert.equal(persisted.profile.toolResultTokens, 3072);
  assert.equal(persisted.profile.recentContextTokens, 18432);
  assert.equal(persisted.session.outcome, "victory");
  assert.equal(JSON.stringify(persisted.exported).includes("browser-ultra-secret"), false);

  await page.locator('.desktop-icon[data-open="llmAi"]').click();
  await page.locator('[data-llm-ai-view="sessions"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".llm-ai-session-card").length === 1);
  await page.locator(".llm-ai-session-card").click();
  await page.waitForFunction(() => document.querySelectorAll("#llmAiSessionEvents li").length === 1);
  assert.match(await page.locator("#llmAiSessionSummary").textContent(), /victory/i);
  assert.equal(await page.locator("#llmAiSessionEvents").textContent().then((text) => text.includes("browser-ultra-secret")), false);
  assert.deepEqual(pageErrors, []);

  console.log("LLM AI manager browser smoke: PASS", {
    screenshotPath,
    profileId: created.profileId,
    sessionId: created.sessionId,
  });
} finally {
  await browser.close();
  await staticServer.close();
  await new Promise((resolveClose) => provider.close(resolveClose));
}
