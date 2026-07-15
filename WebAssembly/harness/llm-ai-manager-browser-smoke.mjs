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
const sessionScreenshotPath = process.env.LLM_AI_MANAGER_SESSION_SCREENSHOT || "/tmp/new-shoes-llm-ai-manager-session.png";
await mkdir(dirname(screenshotPath), { recursive: true });
await mkdir(dirname(sessionScreenshotPath), { recursive: true });

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
    const startedAt = Date.now() - 12_000;
    const session = {
      id: "browser-session-1",
      profileId: profile.id,
      profileSnapshot: { ...(await window.ZeroHLlmAi.listProfiles())[0] },
      status: "completed",
      outcome: "victory",
      startedAt,
      endedAt: Date.now(),
      updatedAt: Date.now(),
      turns: 1,
      toolCalls: 2,
      failures: 1,
      providerRequests: 1,
      providerLatencyMs: 842,
      cachedTokens: 768,
      totalTokens: 1_234,
    };
    await window.ZeroHLlmAi.store.createSession(session);
    const events = [
      {
        type: "session.started",
        data: { profile: { name: "Browser General", model: "browser-smoke-model" }, metadata: { map: "Cairo Commandos" } },
      },
      {
        type: "environment.observation",
        data: {
          reason: "match-start",
          observation: {
            frame: 7,
            time: { gameSeconds: 0.2 },
            economy: { money: 8_500, powerSufficient: true },
            combat: { ownedReady: 0, ownedDamaged: 0, visibleEnemies: 0,
              visibleEnemyStructures: 0, sincePrevious: { ownedUnitsLost: 0,
                confirmedEnemyUnitsDestroyed: 0, confirmedEnemyStructuresDestroyed: 0 } },
            forces: [{
              handle: "force:owned:builder",
              count: 1,
              composition: { infantry: 1 },
              roles: ["builder", "harvester"],
              position: { x: 2630.5, y: 2940.5 },
            }],
            facilities: [{
              handle: "facility:28",
              roles: ["commandcenter", "factory"],
              health: 100,
              construction: { state: "complete" },
              position: { x: 2712.5, y: 2968.8 },
            }],
            missions: [],
            jobs: [],
            threats: [],
            objectives: [],
            deltas: [],
          },
        },
      },
      { type: "model.request", data: { turn: 1 } },
      { type: "model.response", data: { responseId: "browser-response-1" } },
      {
        type: "model.decision",
        data: {
          authorization: "Bearer browser-ultra-secret",
          protocol: "native",
          responseId: "browser-response-1",
          latencyMs: 842,
          usage: { promptTokens: 992, cachedTokens: 768, completionTokens: 242, reasoningTokens: 128, totalTokens: 1_234 },
          finishReason: "tool_calls",
          reasoningContent: "The opening economy is healthy. Queue a worker first, then test whether the reported squad is available for scouting.",
          calls: [
            {
              id: "call-produce",
              name: "request_production",
              arguments: { type: "unit", name: "GLAInfantryWorker", count: 1, facilityHandle: "facility:28" },
            },
            {
              id: "call-mission",
              name: "assign_mission",
              arguments: { squadHandle: "squad:99", mission: "scout", target: { x: 1750, y: 1750 } },
            },
          ],
        },
      },
      { type: "tool.called", data: { callId: "call-produce", name: "request_production" } },
      {
        type: "tool.result",
        data: {
          callId: "call-produce",
          name: "request_production",
          ok: true,
          result: { ok: true, job: { id: "job:41", state: "queued", type: "unit", name: "GLAInfantryWorker" } },
        },
      },
      { type: "engine.execution", data: { callId: "call-produce", name: "request_production", ok: true, jobId: "job:41", state: "queued" } },
      { type: "tool.called", data: { callId: "call-mission", name: "assign_mission" } },
      {
        type: "tool.result",
        data: {
          callId: "call-mission",
          name: "assign_mission",
          ok: false,
          result: { ok: false, error: "Unknown squad handle squad:99; use a missionHandle from the force list." },
        },
      },
      {
        type: "engine.reaction",
        data: {
          frame: 332,
          outcome: null,
          deltas: [{ type: "appeared", handle: "unit:32", owner: "self", kind: "infantry" }],
          missions: [],
          production: [{ facility: "facility:28", queue: [{ type: "unit", name: "GLAInfantryWorker", progress: 83.9 }] }],
        },
      },
      {
        type: "environment.observation",
        data: {
          reason: "planning-interval",
          observation: {
            frame: 340,
            time: { gameSeconds: 11.3 },
            economy: { money: 8_300, powerSufficient: true },
            scoutingCoverage: {
              observedPercent: 25, neverVisible: 192, order: "row-major minY to maxY",
              coverage: [
                "????????????????", "????vvvv????????", "????vrrv????????", "????vvvv????????",
                "????????????????", "????????????????", "????????????????", "????????????????",
                "????????????????", "????????????????", "????????????????", "????????????????",
                "????????????????", "????????????????", "????????????????", "????????????????",
              ],
            },
            combat: { ownedReady: 2, ownedDamaged: 0, visibleEnemies: 2,
              visibleEnemyStructures: 0, cumulative: { unitsLost: 3,
                enemyUnitsDestroyed: 4, enemyStructuresDestroyed: 1 },
              sincePrevious: { ownedUnitsLost: 1,
                confirmedEnemyUnitsDestroyed: 0, confirmedEnemyStructuresDestroyed: 0 } },
            forces: [{ handle: "force:owned:builder", count: 2, composition: { infantry: 2 }, roles: ["builder", "harvester"] }],
            facilities: [{ handle: "facility:28", roles: ["commandcenter", "factory"], health: 100, construction: { state: "complete" } }],
            commands: [{ source: "facility:28", sourceId: 28,
              command: "Command_TestStrike", type: "specialPower",
              targeting: "position", ready: true, sourceCount: 1 }],
            jobs: [{ id: "job:41", type: "production", state: "assembling",
              optionHandle: "produce:GLAInfantryWorker@facility:28", squadHandle: null, blockedReason: null }],
            missions: [{ id: "mission:42", squadHandle: "squad:5", mission: "scout",
              state: "moving", assignedAtStart: 4, survivingAssigned: 3,
              survivingComposition: { infantry: 3 },
              progress: { elapsedGameSeconds: 8.4, assignedLost: 1,
                currentSquadCount: 5, reinforcementsAwaitingAssignment: 2,
                playerCombatSinceStart: { ownedUnitsLost: 1,
                  confirmedEnemyUnitsDestroyed: 2,
                  confirmedEnemyStructuresDestroyed: 1 } },
              position: { x: 1750, y: 1750 }, target: null, blockedReason: null }],
            threats: [{ handle: "contact:404", kind: "vehicle", count: 2, position: { x: 2010, y: 1800 } }],
            objectives: [{ handle: "objective:supply:4", type: "supply", position: { x: 1880, y: 1650 } }],
            deltas: [
              { type: "appeared", handle: "unit:32", owner: "self", kind: "infantry" },
              { type: "appeared", handle: "contact:404", owner: "enemy", kind: "vehicle" },
            ],
          },
        },
      },
      { type: "match.outcome", data: { outcome: "victory", frame: 360, gameSeconds: 12 } },
      { type: "session.completed", data: { outcome: "victory", turns: 1, toolCalls: 2 } },
    ];
    for (const [index, event] of events.entries()) {
      await window.ZeroHLlmAi.store.appendEvent({
        sessionId: session.id,
        sequence: index + 1,
        timestamp: startedAt + (index * 800),
        ...event,
      });
    }
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
  await page.waitForFunction(() => document.querySelectorAll(".llm-ai-transcript-card").length >= 6);
  assert.match(await page.locator("#llmAiSessionSummary").textContent(), /victory/i);
  assert.equal(await page.locator(".llm-ai-transcript-card.is-turn").count(), 1);
  assert.equal(await page.locator(".llm-ai-tool-call").count(), 2);
  assert.equal(await page.locator(".llm-ai-tool-call.is-success").count(), 1);
  assert.equal(await page.locator(".llm-ai-tool-call.is-error").count(), 1);
  assert.match(await page.locator(".llm-ai-transcript-card.is-turn").textContent(), /Turn 1.*Request production.*Assign mission.*Unknown squad handle/is);
  const observationText = await page.locator(".llm-ai-transcript-card.is-observation").last().textContent();
  assert.match(observationText, /Money.*8,300.*Threats.*1.*Recent losses.*1.*Match losses.*3.*Enemy units destroyed.*4.*Enemy structures destroyed.*1.*Map observed.*25%.*Command_TestStrike.*sourceId 28.*job:41.*mission:42.*3\/4 assigned survive.*2 reinforcements await assignment.*since start: lost 1, destroyed 2 units \/ 1 structures.*contact:404/is);
  assert.match(observationText, /Scouting coverage.*192 cells never visible/is);
  assert.equal(await page.locator(".llm-ai-raw-details").count() >= 6, true);
  assert.equal(await page.locator(".llm-ai-raw-details[open]").count(), 0);
  const turnRaw = page.locator(".llm-ai-transcript-card.is-turn > .llm-ai-raw-details");
  assert.equal(await turnRaw.locator("pre").textContent(), "", "raw JSON should render lazily");
  await turnRaw.locator("summary").click();
  await page.waitForFunction(() => document.querySelector(".llm-ai-transcript-card.is-turn > .llm-ai-raw-details pre")?.textContent.includes("[redacted]"));
  assert.match(await turnRaw.locator("pre").textContent(), /"authorization": "\[redacted\]"/);
  await turnRaw.locator("summary").click();
  assert.equal(await page.locator("#llmAiSessionEvents").textContent().then((text) => text.includes("browser-ultra-secret")), false);
  const latestObservation = page.locator(".llm-ai-transcript-card.is-observation").last();
  await latestObservation.locator(".llm-ai-state-details > summary").click();
  await latestObservation.scrollIntoViewIfNeeded();
  await page.locator("#llmAiWindow").screenshot({ path: sessionScreenshotPath });
  assert.deepEqual(pageErrors, []);

  console.log("LLM AI manager browser smoke: PASS", {
    screenshotPath,
    sessionScreenshotPath,
    profileId: created.profileId,
    sessionId: created.sessionId,
  });
} finally {
  await browser.close();
  await staticServer.close();
  await new Promise((resolveClose) => provider.close(resolveClose));
}
