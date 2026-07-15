#!/usr/bin/env node
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { canonicalSemanticValue } from "./llm-ai-strategy.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const opponent = String(process.env.LLM_AI_MATCH_OPPONENT ?? "easy").toLowerCase();
if (!new Set(["easy", "medium", "hard"]).has(opponent)) {
  throw new Error("LLM_AI_MATCH_OPPONENT must be easy, medium, or hard");
}
const endpoint = process.env.LLM_AI_ENDPOINT ?? "http://192.168.100.203:1234";
const model = process.env.LLM_AI_MODEL ?? "qwen3.6-35b-a3b-mtp@q8_k_xl";
const contextSize = Number(process.env.LLM_AI_CONTEXT_SIZE ?? 262_144);
const maximumSeconds = Number(process.env.LLM_AI_MATCH_MAX_SECONDS ?? 180);
const expectTerminal = process.env.LLM_AI_MATCH_EXPECT_TERMINAL === "1";
const minimumFrame = Number(process.env.LLM_AI_MATCH_MIN_FRAME
  ?? process.env.LLM_AI_MATCH_MIN_TERMINAL_FRAME ?? (expectTerminal ? 3_000 : 0));
const minimumActions = Number(process.env.LLM_AI_MATCH_MIN_ACTIONS
  ?? process.env.LLM_AI_MATCH_MIN_TERMINAL_ACTIONS ?? (expectTerminal ? 3 : 1));
const minimumOwnedObjects = Number(process.env.LLM_AI_MATCH_MIN_OWNED_OBJECTS ?? 0);
const requireStrategicCoverage = process.env.LLM_AI_MATCH_REQUIRE_STRATEGIC_COVERAGE !== "0";
const testFallbackTransfer = process.env.LLM_AI_MATCH_TEST_FALLBACK !== "0";
const dist = process.env.LLM_AI_MATCH_DIST ?? "dist-threaded";
const browserExecutable = process.env.LLM_AI_MATCH_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH;
const browserArgs = (process.env.LLM_AI_MATCH_BROWSER_ARGS ?? "")
  .split(/\s+/).filter(Boolean);
const profileDir = resolve(process.env.LLM_AI_MATCH_PROFILE_DIR
  ?? resolve(wasmRoot, `artifacts/pw-profiles/llm-ai-${opponent}`));
const screenshotPath = resolve(process.env.LLM_AI_MATCH_SCREENSHOT
  ?? resolve(wasmRoot, `artifacts/screenshots/llm-ai-vs-${opponent}.png`));
const sessionExportPath = process.env.LLM_AI_MATCH_SESSION_EXPORT
  ? resolve(process.env.LLM_AI_MATCH_SESSION_EXPORT)
  : null;
const keepProfile = process.env.LLM_AI_MATCH_KEEP_PROFILE === "1";
const runTag = Date.now().toString(36);

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function report(stage, details = {}) {
  process.stderr.write(`[llm-ai-match] ${stage} ${JSON.stringify(details)}\n`);
}

async function within(promise, label, timeoutMs = 60_000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(label, operation, accept, timeoutMs = 120_000, intervalMs = 250) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      last = await operation();
      if (accept(last)) return last;
    } catch (error) {
      last = { error: error?.message ?? String(error) };
    }
    await delay(intervalMs);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(last)?.slice(0, 2000)}`);
}

async function rpc(page, command, payload = {}) {
  return page.evaluate(async ({ requestedCommand, requestedPayload }) =>
    window.CnCPort.rpc(requestedCommand, requestedPayload), {
    requestedCommand: command,
    requestedPayload: payload,
  });
}

function requireResult(reply, label) {
  if (reply?.ok !== true || reply?.result?.ok !== true) {
    throw new Error(`${label} failed: ${JSON.stringify(reply)}`);
  }
  return reply.result;
}

async function visibleWindow(page, name, timeoutMs = 120_000) {
  return waitFor(name, async () => {
    const result = requireResult(await rpc(page, "agentUiSnapshot"), "UI snapshot");
    return result.windows.find((window) => window.name === name && window.visible && window.interactive) ?? null;
  }, Boolean, timeoutMs);
}

async function activate(page, name) {
  const window = await visibleWindow(page, name);
  return requireResult(await rpc(page, "agentUiActivate", {
    windowId: window.id,
    name: window.name,
  }), `activate ${name}`);
}

async function activateUntilVisible(page, targetName, destinationName, timeoutMs = 120_000) {
  let nextAttempt = 0;
  return waitFor(`${targetName} -> ${destinationName}`, async () => {
    const snapshot = requireResult(await rpc(page, "agentUiSnapshot"), "UI snapshot");
    const destination = snapshot.windows.find((window) =>
      window.name === destinationName && window.visible && window.interactive);
    if (destination) return { ready: true, destination };
    const target = snapshot.windows.find((window) =>
      window.name === targetName && window.visible && window.interactive);
    if (target && Date.now() >= nextAttempt) {
      nextAttempt = Date.now() + 1_000;
      const activation = await rpc(page, "agentUiActivate", {
        windowId: target.id,
        name: target.name,
      });
      return { ready: false, target: target.name, activation };
    }
    return { ready: false, target: target?.name ?? null };
  }, (state) => state.ready, timeoutMs, 250);
}

async function selectRow(page, windowName, predicate) {
  const window = await visibleWindow(page, windowName);
  const items = requireResult(await rpc(page, "agentUiListItems", {
    windowId: window.id,
    name: window.name,
    offset: 0,
    limit: 128,
  }), `list ${windowName}`);
  const row = items.rows.find((candidate) => predicate(candidate.cells.join(" ")));
  if (!row) throw new Error(`${windowName} has no matching row: ${JSON.stringify(items.rows)}`);
  const selected = requireResult(await rpc(page, "agentUiSelectIndex", {
    windowId: window.id,
    name: window.name,
    index: row.index,
  }), `select ${windowName} row ${row.index}`);
  if (selected.notificationHandled === 0) {
    throw new Error(`${windowName} selection did not reach its real menu callback`);
  }
  return { row, selected };
}

async function main() {
  report("starting", { opponent, endpoint, model, contextSize, dist, maximumSeconds });
  if (!keepProfile) await rm(profileDir, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  await mkdir(dirname(screenshotPath), { recursive: true });
  if (sessionExportPath) await mkdir(dirname(sessionExportPath), { recursive: true });
  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  let browser;
  const pageErrors = [];
  const consoleErrors = [];
  try {
    browser = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      ...(browserExecutable ? { executablePath: browserExecutable } : {}),
      args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(300_000);
    page.on("pageerror", (error) => {
      const message = error?.message ?? String(error);
      pageErrors.push(message);
      report("page error", { message });
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
        report("console error", { message: message.text() });
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        report("HTTP failure", { status: response.status(), url: response.url() });
      }
    });
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_debug_renderer_info");
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : gl?.getParameter(gl.RENDERER) ?? "unknown";
    });
    report("browser ready", { renderer });
    const url = new URL(`harness/play.html?autostart=1&dist=${dist}&shellmap=0`, server.url);
    await page.goto(url.href, { waitUntil: "load" });
    let nextBootReport = 0;
    let nextPointerWake = 0;
    let pointerWakeX = 32;
    await waitFor("real engine main menu", async () => {
      const state = await page.evaluate(() => ({
        runtime: window.ZeroHRuntime?.started === true,
        progress: document.querySelector("#launchStatus")?.textContent ?? "",
        engine: window.CnCPort?.state?.threadedEngine
          ? {
              active: window.CnCPort.state.threadedEngine.loop?.active === true,
              frame: window.CnCPort.state.threadedEngine.frame?.frame ?? null,
              clientFrames: window.CnCPort.state.threadedEngine.loop?.clientFrames ?? null,
              loadSessionActive:
                window.CnCPort.state.threadedEngine.frame?.loadSessionActive ?? null,
            }
          : null,
      }));
      const uiReply = await rpc(page, "agentUiSnapshot").catch((error) => ({
        ok: false,
        error: error?.message ?? String(error),
      }));
      const windows = uiReply?.result?.windows ?? [];
      state.singlePlayer = windows.some((window) =>
        window.name === "MainMenu.wnd:ButtonSinglePlayer" && window.visible && window.interactive);
      state.ui = {
        ok: uiReply?.ok === true && uiReply?.result?.ok === true,
        error: uiReply?.result?.error ?? uiReply?.error ?? null,
        windowCount: uiReply?.result?.windowCount ?? null,
        visible: windows.filter((window) => window.visible).slice(0, 12)
          .map((window) => window.name),
      };
      if (state.runtime && !state.singlePlayer && Date.now() >= nextPointerWake) {
        nextPointerWake = Date.now() + 1_000;
        const point = { x: pointerWakeX, y: pointerWakeX };
        pointerWakeX = pointerWakeX === 32 ? 96 : 32;
        const pointerReply = await rpc(page, "postMessage", {
          message: 0x0200,
          wParam: 0,
          lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
          point,
        });
        state.pointerWake = { point, ok: pointerReply?.ok === true };
      }
      if (Date.now() >= nextBootReport) {
        nextBootReport = Date.now() + 10_000;
        report("boot progress", state);
      }
      return state;
    }, (state) => state.runtime && state.singlePlayer, 15 * 60_000, 500);
    report("main menu ready");

    const savedProfile = await page.evaluate(async (configuration) => {
      const profile = await window.ZeroHLlmAi.store.saveProfile(configuration);
      await window.ZeroHLlmAi.refresh();
      await window.ZeroHLlmAi.syncProfileCatalog();
      return { id: profile.id, name: profile.name, model: profile.model, contextSize: profile.contextSize };
    }, {
      name: `Qwen ${opponent[0].toUpperCase()}${opponent.slice(1)} Challenger ${runTag}`,
      endpoint,
      model,
      apiKey: process.env.LLM_AI_API_KEY ?? "",
      thinkingEffort: process.env.LLM_AI_THINKING_EFFORT ?? "high",
      contextSize,
      responseTokens: Number(process.env.LLM_AI_RESPONSE_TOKENS ?? 4096),
      mandate: process.env.LLM_AI_MANDATE
        ?? `Defeat the ${opponent} classic AI. Build a resilient economy, scout, counter threats, produce a balanced force, and attack decisively until victory.`,
      toolProtocol: process.env.LLM_AI_TOOL_PROTOCOL ?? "native",
      routineObservationTokens: Number(process.env.LLM_AI_OBSERVATION_TOKENS ?? 8_192),
      toolResultTokens: Number(process.env.LLM_AI_TOOL_RESULT_TOKENS ?? 4_096),
      recentContextTokens: Number(process.env.LLM_AI_RECENT_CONTEXT_TOKENS ?? 20_000),
      planningIntervalMs: Number(process.env.LLM_AI_PLANNING_INTERVAL_MS ?? 2_000),
      requestTimeoutMs: Number(process.env.LLM_AI_REQUEST_TIMEOUT_MS ?? 120_000),
      maxConsecutiveFailures: 5,
      classicFallback: true,
    });
    report("profile saved", savedProfile);

    await activateUntilVisible(
      page, "MainMenu.wnd:ButtonSinglePlayer", "MainMenu.wnd:ButtonSkirmish");
    await activateUntilVisible(
      page, "MainMenu.wnd:ButtonSkirmish", "SkirmishGameOptionsMenu.wnd:ButtonStart");
    report("skirmish menu ready");

    const mapCache = await rpc(page, "mapCacheProbe");
    const map = mapCache?.probe?.officialMultiplayerMaps
      ?.filter((candidate) => candidate.players >= 3)
      .sort((left, right) => left.players - right.players)[0];
    if (!map?.key) throw new Error(`No official map with three starts was found: ${JSON.stringify(mapCache)}`);
    requireResult(await rpc(page, "realEngineSetSkirmishMap", { map: map.key }), "set skirmish map");
    await delay(500);
    report("map selected", map);

    const observerSelection = await selectRow(
      page, "SkirmishGameOptionsMenu.wnd:ComboBoxPlayerTemplate0", (text) => /observer/i.test(text));
    const llmSelection = await selectRow(
      page, "SkirmishGameOptionsMenu.wnd:ComboBoxPlayer1",
      (text) => text.includes(`LLM: ${savedProfile.name}`));
    const opponentSelection = await selectRow(
      page, "SkirmishGameOptionsMenu.wnd:ComboBoxPlayer2",
      (text) => new RegExp(`^${opponent}`, "i").test(text.trim()));
    report("players selected", {
      observer: observerSelection.row.cells,
      llm: llmSelection.row.cells,
      opponent: opponentSelection.row.cells,
    });

    await page.evaluate(() => window.ZeroHLlmAiGameRuntime.stop("verification setup"));
    await activate(page, "SkirmishGameOptionsMenu.wnd:ButtonStart");
    report("match start requested");
    const assignments = await waitFor("authoritative LLM assignment", () =>
      rpc(page, "realEngineLlmAiAssignments"), (reply) => reply?.result?.playable === true
        && reply.result.assignments?.some((assignment) => assignment.profileId === savedProfile.id
          && assignment.playerActive && assignment.computerPlayer), 8 * 60_000, 500);
    let assignment = assignments.result.assignments.find((candidate) =>
      candidate.profileId === savedProfile.id);
    if (assignment.strategyController !== "llm") {
      throw new Error(`LLM slot did not own the exclusive strategy lease: ${JSON.stringify(assignment)}`);
    }
    report("assignment active", assignment);

    const assignedBeforeUpdates = assignment;
    assignment = await waitFor("LLM-owned strategy update loop", async () => {
      const state = requireResult(await rpc(page, "realEngineLlmAiAssignments"), "active assignments");
      return state.assignments.find((candidate) => candidate.profileId === savedProfile.id);
    }, (candidate) => candidate?.strategyController === "llm"
      && candidate.controllerNeutralUpdates > assignedBeforeUpdates.controllerNeutralUpdates,
    3 * 60_000, 100);
    if (assignment.classicStrategyUpdates !== assignedBeforeUpdates.classicStrategyUpdates) {
      throw new Error(`classic strategy advanced before the fallback test: ${JSON.stringify({
        initial: assignedBeforeUpdates, active: assignment,
      })}`);
    }

    let fallbackEvidence = null;
    if (testFallbackTransfer) {
      const toClassic = requireResult(await rpc(page, "llmAiStrategyController", {
        playerIndex: assignment.playerIndex, controller: "classic",
      }), "transfer strategy lease to classic");
      const classicActive = await waitFor("observable classic fallback", async () => {
        const state = requireResult(await rpc(page, "realEngineLlmAiAssignments"), "fallback assignments");
        return state.assignments.find((candidate) => candidate.profileId === savedProfile.id);
      }, (candidate) => candidate?.strategyController === "classic"
        && candidate.classicStrategyUpdates > assignment.classicStrategyUpdates, 30_000, 100);
      const toLlm = requireResult(await rpc(page, "llmAiStrategyController", {
        playerIndex: assignment.playerIndex, controller: "llm",
      }), "return strategy lease to LLM");
      // The engine may take more classic ticks between observing classicActive and
      // executing the synchronous transfer RPC. The transfer result is the exact
      // counter value at the ownership boundary.
      const classicCount = toLlm.classicStrategyUpdates;
      const llmRestored = await waitFor("classic strategy freeze after LLM restore", async () => {
        const state = requireResult(await rpc(page, "realEngineLlmAiAssignments"), "restored assignments");
        return state.assignments.find((candidate) => candidate.profileId === savedProfile.id);
      }, (candidate) => candidate?.strategyController === "llm"
        && candidate.controllerNeutralUpdates > classicActive.controllerNeutralUpdates + 10, 30_000, 100);
      if (llmRestored.classicStrategyUpdates !== classicCount) {
        throw new Error(`classic policy continued after the LLM lease was restored: ${JSON.stringify(llmRestored)}`);
      }
      fallbackEvidence = { toClassic, classicActive, toLlm, llmRestored };
      assignment = llmRestored;
      report("exclusive fallback transfer verified", fallbackEvidence);
    }
    await page.evaluate(() => window.ZeroHLlmAiGameRuntime.start());

    const sessionStarted = await waitFor("LLM session start", () => page.evaluate(async (profileId) => {
      const sessions = await window.ZeroHLlmAi.store.listSessions({ profileId });
      if (!sessions[0]) return null;
      return {
        session: sessions[0],
        events: await window.ZeroHLlmAi.store.listEvents(sessions[0].id),
      };
    }, savedProfile.id), (value) => value?.events?.some((event) => event.type === "session.started")
      && value.events.some((event) => event.type === "environment.observation"), 120_000, 500);
    report("session active", { sessionId: sessionStarted.session.id });

    const startedAt = Date.now();
    let latest = sessionStarted;
    let world = null;
    let terminal = false;
    let authoritativeOutcome = null;
    let lastProgressSignature = "";
    let lastFailureCount = 0;
    const competition = {
      peakOwnedObjects: 0,
      peakVisibleEnemies: 0,
      peakMoney: 0,
      successfulActions: 0,
      productionActions: 0,
      movementActions: 0,
      combatReactions: 0,
    };
    while (Date.now() - startedAt < maximumSeconds * 1_000) {
      let worldReply;
      [latest, worldReply] = await within(Promise.all([
        page.evaluate(async (sessionId) => ({
          session: await window.ZeroHLlmAi.store.getSession(sessionId),
          events: await window.ZeroHLlmAi.store.listEvents(sessionId),
        }), sessionStarted.session.id),
        rpc(page, "llmAiWorldSnapshot", {
          playerIndex: assignment.playerIndex,
          mode: "unrestricted",
          detail: "tactical",
          includeCapabilities: false,
        }),
      ]), "match evidence poll");
      if (worldReply?.result?.ok === true && worldReply.result.game) world = worldReply;
      const outcomeEvent = latest.events.findLast((event) => event.type === "match.outcome"
        && event.data?.authoritative === true);
      authoritativeOutcome = outcomeEvent?.data?.outcome ?? latest.session.outcome
        ?? world?.result?.game?.outcome ?? null;
      terminal = ["victory", "defeat", "ended"].includes(authoritativeOutcome);
      const objects = world?.result?.objects ?? [];
      const player = world?.result?.players?.find((candidate) => candidate.local === true);
      competition.peakOwnedObjects = Math.max(competition.peakOwnedObjects,
        objects.filter((object) => object.owner === assignment.playerIndex).length);
      competition.peakVisibleEnemies = Math.max(competition.peakVisibleEnemies,
        objects.filter((object) => ["enemy", "enemies", "hostile"]
          .includes(canonicalSemanticValue(object.relationship))).length);
      competition.peakMoney = Math.max(competition.peakMoney, player?.economy?.money ?? 0);
      competition.successfulActions = latest.events.filter((event) => event.type === "tool.result"
        && event.data?.ok === true && ![
          "wait_for_tick", "query_buildable_options", "inspect_job", "inspect_entities", "query_map_region",
          "set_priorities",
        ].includes(event.data?.name)).length;
      competition.productionActions = latest.events.filter((event) => event.type === "tool.result"
        && event.data?.ok === true && ["request_production", "request_force"].includes(event.data?.name)).length;
      competition.movementActions = latest.events.filter((event) => event.type === "tool.result"
        && event.data?.ok === true && ["assign_mission", "issue_order"].includes(event.data?.name)).length;
      competition.combatReactions = latest.events.filter((event) => event.type === "engine.reaction"
        && ((event.data?.deltas || []).some((delta) => ["damaged", "disappeared"].includes(delta.type))
          || (event.data?.missions || []).some((mission) => mission.state === "engaged"))).length;
      const progressSignature = [
        latest.session.turns,
        latest.session.toolCalls,
        latest.session.failures,
      ].join(":");
      if (progressSignature !== lastProgressSignature) {
        lastProgressSignature = progressSignature;
        const modelError = latest.session.failures > lastFailureCount
          ? latest.events.findLast((event) => event.type === "model.error") : null;
        lastFailureCount = latest.session.failures;
        report("session progress", {
          turns: latest.session.turns,
          toolCalls: latest.session.toolCalls,
          failures: latest.session.failures,
          frame: world?.result?.frame ?? null,
          outcome: authoritativeOutcome,
          lastModelError: modelError?.data ?? null,
        });
        if (sessionExportPath) {
          await writeFile(sessionExportPath, `${JSON.stringify({ checkpoint: true, ...latest }, null, 2)}\n`);
        }
      }
      const competitiveEnough = Number(world?.result?.frame ?? 0) >= minimumFrame
        && competition.successfulActions >= minimumActions
        && competition.peakOwnedObjects >= minimumOwnedObjects
        && (!requireStrategicCoverage || (competition.productionActions > 0
          && competition.movementActions > 0 && competition.combatReactions > 0));
      if (!expectTerminal && latest.session.turns >= 2 && competitiveEnough) break;
      if (terminal && latest.session.status === "completed") break;
      await delay(1_000);
    }

    await page.screenshot({ path: screenshotPath });
    await page.evaluate(() => window.ZeroHLlmAiGameRuntime.stop("LLM match verification captured"));
    await waitFor("LLM session quiescence", () => page.evaluate(() => ({
      active: window.ZeroHLlmAiGameRuntime.active.size,
    })), (value) => value.active === 0, 30_000, 100);
    latest = await page.evaluate(async (sessionId) => ({
      session: await window.ZeroHLlmAi.store.getSession(sessionId),
      events: await window.ZeroHLlmAi.store.listEvents(sessionId),
    }), sessionStarted.session.id);
    const eventTypes = Object.fromEntries([...new Set(latest.events.map((event) => event.type))]
      .map((type) => [type, latest.events.filter((event) => event.type === type).length]));
    const toolCalls = latest.events.filter((event) => event.type === "tool.called");
    const callsById = new Map(toolCalls.map((event) => [event.data?.callId, event]));
    const toolResults = latest.events.filter((event) => event.type === "tool.result").map((event) => ({
      callId: event.data?.callId,
      name: event.data?.name,
      arguments: callsById.get(event.data?.callId)?.data?.arguments ?? null,
      ok: event.data?.ok,
      code: event.data?.result?.error?.code ?? null,
      message: event.data?.result?.error?.message ?? null,
    }));
    const successfulActions = toolResults.filter((result) => result.ok
      && !["wait_for_tick", "query_buildable_options", "inspect_job", "inspect_entities", "query_map_region", "set_priorities"].includes(result.name));
    const modelRequests = latest.events.filter((event) => event.type === "model.request");
    const modelResponses = latest.events.filter((event) => event.type === "model.response");
    const modelErrors = latest.events.filter((event) => event.type === "model.error");
    const modelDecisions = latest.events.filter((event) => event.type === "model.decision");
    const engineExecutions = latest.events.filter((event) => event.type === "engine.execution");
    const engineReactions = latest.events.filter((event) => event.type === "engine.reaction");
    if (pageErrors.length > 0 || consoleErrors.length > 0) {
      throw new Error(`browser errors occurred during the match: ${JSON.stringify({
        pageErrors,
        consoleErrors,
      })}`);
    }
    if (latest.session.turns < 1 || successfulActions.length < 1) {
      throw new Error(`LLM commander produced no successful game action: ${JSON.stringify({
        session: latest.session,
        toolResults,
        eventTypes,
      })}`);
    }
    if (modelRequests.length !== modelResponses.length + modelErrors.length
        || latest.session.providerRequests !== modelRequests.length) {
      throw new Error(`provider request evidence is incomplete: ${JSON.stringify({
        providerRequests: latest.session.providerRequests,
        requests: modelRequests.length,
        responses: modelResponses.length,
        errors: modelErrors.length,
      })}`);
    }
    if (modelDecisions.length < 1 || modelDecisions.some((event) => event.data?.protocol !== "native")) {
      throw new Error(`match did not use native model tool calls exclusively: ${JSON.stringify(modelDecisions)}`);
    }
    const expectedEngineExecutions = toolResults.filter((result) => [
      "request_production", "request_force", "assign_mission", "issue_order", "use_command",
    ].includes(result.name));
    if (engineExecutions.length !== expectedEngineExecutions.length || engineReactions.length < modelDecisions.length) {
      throw new Error(`session provenance is incomplete: ${JSON.stringify({
        decisions: modelDecisions.length, executions: engineExecutions.length,
        expectedEngineExecutions: expectedEngineExecutions.length, reactions: engineReactions.length,
      })}`);
    }
    if (latest.events.some((event) => event.type === "strategy.ownership_transferred")) {
      throw new Error("classic fallback took ownership during the LLM evidence match");
    }
    if (expectTerminal && !terminal) {
      throw new Error(`match did not reach a terminal outcome in ${maximumSeconds}s: ${JSON.stringify({
        session: latest.session,
        frame: world?.result?.frame ?? null,
        outcome: world?.result?.game?.outcome ?? null,
        competition,
        toolResults,
      })}`);
    }
    if (expectTerminal && (!latest.events.some((event) => event.type === "match.outcome"
          && event.data?.authoritative === true)
        || !latest.events.some((event) => event.type === "session.completed"))) {
      throw new Error(`terminal match lacks authoritative outcome evidence: ${JSON.stringify(eventTypes)}`);
    }
    if (Number(world?.result?.frame ?? 0) < minimumFrame
        || competition.successfulActions < minimumActions
        || competition.peakOwnedObjects < minimumOwnedObjects) {
      throw new Error(`match was not competitive enough: ${JSON.stringify({
        frame: world?.result?.frame ?? null,
        minimumFrame,
        successfulActions: competition.successfulActions,
        minimumActions,
        minimumOwnedObjects,
        competition,
      })}`);
    }
    if (requireStrategicCoverage && (competition.productionActions < 1
        || competition.movementActions < 1 || competition.combatReactions < 1)) {
      throw new Error(`match lacks attributable production, movement, or combat evidence: ${JSON.stringify(competition)}`);
    }

    const finalAssignments = requireResult(
      await rpc(page, "realEngineLlmAiAssignments"), "final LLM assignments");
    const finalAssignment = finalAssignments.assignments.find((candidate) =>
      candidate.profileId === savedProfile.id);
    const authoritativeOutcomeEvent = latest.events.findLast((event) =>
      event.type === "match.outcome" && event.data?.authoritative === true);
    const finalStrategy = expectTerminal && latest.session.status === "completed"
      ? authoritativeOutcomeEvent?.data?.strategy || finalAssignment : finalAssignment;
    if (finalStrategy?.strategyController !== "llm"
        || finalStrategy.classicStrategyUpdates !== assignment.classicStrategyUpdates
        || finalStrategy.controllerNeutralUpdates <= assignment.controllerNeutralUpdates) {
      throw new Error(`strategy ownership was not exclusive while neutral execution advanced: ${JSON.stringify({
        initial: assignment, final: finalAssignment, outcome: authoritativeOutcomeEvent?.data,
      })}`);
    }

    const exported = await page.evaluate(
      (sessionId) => window.ZeroHLlmAi.store.exportSession(sessionId), latest.session.id);
    if (JSON.stringify(exported).includes(process.env.LLM_AI_API_KEY ?? "__no_key__")) {
      throw new Error("session export contained the configured API key");
    }
    if (sessionExportPath) {
      await writeFile(sessionExportPath, `${JSON.stringify(exported, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      renderer,
      opponent,
      map,
      profile: savedProfile,
      selections: {
        observer: observerSelection.row.cells,
        llm: llmSelection.row.cells,
        opponent: opponentSelection.row.cells,
      },
      assignment,
      session: {
        id: latest.session.id,
        status: latest.session.status,
        turns: latest.session.turns,
        toolCalls: latest.session.toolCalls,
        failures: latest.session.failures,
        totalTokens: latest.session.totalTokens,
        providerRequests: latest.session.providerRequests,
        providerLatencyMs: latest.session.providerLatencyMs,
        cachedTokens: latest.session.cachedTokens,
        cacheHitRequests: latest.session.cacheHitRequests,
        outcome: latest.session.outcome,
      },
      gameOutcome: authoritativeOutcome,
      worldFrame: world?.result?.frame ?? null,
      verification: { expectTerminal, minimumFrame, minimumActions, minimumOwnedObjects },
      competition,
      strategyOwnership: { initial: assignment, final: finalAssignment, fallbackEvidence },
      eventTypes,
      toolResults,
      screenshot: screenshotPath,
      sessionExport: sessionExportPath,
      pageErrors,
      consoleErrors,
    }, null, 2)}\n`);
  } finally {
    if (browser) await browser.close();
    await server.close();
    if (!keepProfile) await rm(profileDir, { recursive: true, force: true });
  }
}

await main();
