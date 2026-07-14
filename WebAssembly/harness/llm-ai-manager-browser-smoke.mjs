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
  if (request.url === "/v1/chat/completions" && request.method === "POST") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const structured = Boolean(body.response_format);
      response.end(JSON.stringify({
        id: structured ? "browser-structured" : "browser-native-missing",
        choices: [{
          finish_reason: "stop",
          message: structured ? {
            role: "assistant",
            content: "",
            reasoning_content: JSON.stringify({
              action: "tool", tool: "report_ready", arguments: { ready: true }, note: "ready",
            }),
            tool_calls: [],
          } : {
            role: "assistant", content: "", reasoning_content: "<tool_call>report_ready</tool_call>", tool_calls: [],
          },
        }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }));
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
  const playUrl = new URL("harness/play.html", staticServer.url);
  playUrl.searchParams.set("dist", "dist");
  await page.goto(playUrl.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHLlmAi?.store && window.ZeroHDesktop));
  await page.locator('.desktop-icon[data-open="llmAi"]').click();
  await page.waitForSelector("#llmAiWindow.is-open");
  await page.locator("#llmAiName").fill("Browser General");
  await page.locator("#llmAiModel").fill("browser-smoke-model");
  await page.locator("#llmAiEndpoint").fill(`http://127.0.0.1:${providerPort}`);
  await page.locator("#llmAiApiKey").fill("browser-ultra-secret");
  await page.locator("#llmAiThinking").selectOption("low");
  await page.locator("#llmAiContext").fill("262144");
  await page.locator("#llmAiMandate").fill("Build a resilient economy, adapt, and win.");
  await page.locator("#llmAiProfileForm").evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => document.querySelector("#llmAiFormStatus")?.textContent.includes("ready for a player slot"));
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
  await page.waitForFunction(() => document.querySelector("#llmAiFormStatus")?.textContent.includes("structured protocol"));
  assert.match(await page.locator("#llmAiFormStatus").textContent(), /structured-action fallback/i);

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
      type: "model.turn",
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
  assert.equal(persisted.session.outcome, "victory");
  assert.equal(JSON.stringify(persisted.exported).includes("browser-ultra-secret"), false);

  await page.locator('.desktop-icon[data-open="llmAi"]').click();
  await page.locator('[data-llm-ai-view="sessions"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".llm-ai-session-card").length === 1);
  await page.locator(".llm-ai-session-card").click();
  await page.waitForFunction(() => document.querySelectorAll("#llmAiSessionEvents li").length === 1);
  assert.match(await page.locator("#llmAiSessionSummary").textContent(), /victory/i);
  assert.equal(await page.locator("#llmAiSessionEvents").textContent().then((text) => text.includes("browser-ultra-secret")), false);
  await page.screenshot({ path: screenshotPath });

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
