import assert from "node:assert/strict";
import { LlmAiAgentRuntime } from "./llm-ai-agent.mjs";
import {
  buildLlmAiChatRequest,
  completeLlmAiTurn,
  discoverLlmAiModels,
  LlmAiProviderError,
  probeLlmAiEndpoint,
} from "./llm-ai-openai-client.mjs";
import {
  approximateLlmTokens,
  buildLlmAiSystemPrompt,
  compactLlmConversation,
  conservativeLlmTokens,
  createLlmAiProfile,
  exportLlmAiSession,
  llmChatCompletionsUrl,
  llmModelsUrl,
  llmProviderMetadataUrl,
  publicLlmAiProfile,
} from "./llm-ai-profile.mjs";
import {
  StableQueryPager,
  boundLlmPayload,
  compactRoutineObservation,
} from "./llm-ai-strategy.mjs";
import { MemoryLlmAiStore } from "./llm-ai-store.mjs";
import { createLlmAiGameTools, LlmAiGameCoordinator } from "./llm-ai-game-runtime.mjs";
import { LlmAiStrategicState } from "./llm-ai-game-tools.mjs";

const cryptoImpl = { randomUUID: () => "00000000-0000-4000-8000-000000000001" };
const profile = createLlmAiProfile({
  name: "Qwen General",
  endpoint: "http://192.168.100.203:1234",
  model: "qwen3.6-35b-a3b-mtp@q8_k_xl",
  apiKey: "super-secret-key",
  thinkingEffort: "low",
  contextSize: 262_144,
  routineObservationTokens: 8_192,
  toolResultTokens: 4_096,
  recentContextTokens: 20_000,
}, { cryptoImpl, now: () => 100 });

function sseResponse(events) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`));
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function nativeToolEvents({ id = "response-1", callId = "call-1", name = "move_army", argumentsValue = { x: 10, y: 20 } } = {}) {
  const argumentsText = JSON.stringify(argumentsValue);
  const split = Math.max(1, Math.floor(argumentsText.length / 2));
  return [
    { id, choices: [{ delta: { reasoning_content: "consider " }, finish_reason: null }] },
    { id, choices: [{ delta: { tool_calls: [{ index: 0, id: callId, type: "function", function: { name, arguments: argumentsText.slice(0, split) } }] }, finish_reason: null }] },
    { id, choices: [{ delta: { reasoning_content: "act", tool_calls: [{ index: 0, function: { arguments: argumentsText.slice(split) } }] }, finish_reason: null }] },
    { id, choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    { id, choices: [], usage: { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 6 }, completion_tokens: 5, total_tokens: 15 } },
    "[DONE]",
  ];
}

assert.equal(profile.schemaVersion, 2);
assert.equal(profile.toolProtocol, "native");
assert.equal(createLlmAiProfile({ ...profile, toolProtocol: "auto" }).toolProtocol, "native");
assert.equal(profile.mandate, "Play to the best of your capability and win the game.");
assert.equal(llmChatCompletionsUrl(profile.endpoint), "http://192.168.100.203:1234/v1/chat/completions");
assert.equal(llmChatCompletionsUrl("https://example.test/openai/v1"), "https://example.test/openai/v1/chat/completions");
assert.equal(llmModelsUrl("https://example.test/openai/v1/chat/completions"), "https://example.test/openai/v1/models");
assert.equal(llmProviderMetadataUrl("https://example.test/openai/v1"), "https://example.test/openai/api/v0/models");
assert.throws(() => createLlmAiProfile({ ...profile, endpoint: "file:///tmp/model" }), /HTTP or HTTPS/);
assert.throws(() => createLlmAiProfile({ ...profile, routineObservationTokens: 10 }), /Routine observation budget/);
assert.equal(publicLlmAiProfile(profile).apiKey, undefined);
assert.equal(publicLlmAiProfile(profile).hasApiKey, true);
assert.match(buildLlmAiSystemPrompt(profile), /exclusively own strategic policy/);
assert.match(buildLlmAiSystemPrompt(profile), /Classic strategic selection is disabled/);

const exported = exportLlmAiSession({
  profile,
  session: { id: "session-1", authorization: "Bearer super-secret-key" },
  events: [{ data: { apiKey: "super-secret-key", message: "sent super-secret-key" } }],
});
assert.equal(JSON.stringify(exported).includes("super-secret-key"), false);

// Semantic checkpoints preserve complete tool-call/result groups and a 20k-style recent suffix.
{
  const oldCall = { role: "assistant", content: null, tool_calls: [{ id: "old-call", type: "function", function: { name: "inspect_job", arguments: "{}" } }] };
  const oldResult = { role: "tool", tool_call_id: "old-call", content: "{\"ok\":true}" };
  const recentCall = { role: "assistant", content: null, tool_calls: [{ id: "recent-call", type: "function", function: { name: "wait_for_tick", arguments: "{}" } }] };
  const recentResult = { role: "tool", tool_call_id: "recent-call", content: "{\"ok\":true}" };
  const messages = [
    { role: "system", content: "stable-prefix" },
    ...Array.from({ length: 20 }, (_, index) => ({ role: "user", content: `old-${index}-${"x".repeat(500)}` })),
    oldCall, oldResult, { role: "user", content: "latest observation" }, recentCall, recentResult,
  ];
  const compacted = compactLlmConversation(messages, {
    contextSize: 4_096, responseTokens: 512, recentContextTokens: 1_024,
  }, {
    tools: [{ name: "wait_for_tick", description: "wait", parameters: { type: "object" } }],
    strategicState: { mandate: profile.mandate, liveIds: ["mission:7"], unresolvedErrors: [] },
    force: true,
  });
  assert.equal(compacted.compacted, true);
  assert.equal(compacted.messages[0].content, "stable-prefix");
  assert.match(compacted.messages[1].content, /^STRATEGIC CHECKPOINT/);
  assert.match(compacted.messages[1].content, /mission:7/);
  const recentIndex = compacted.messages.findIndex((message) => message.tool_calls?.[0]?.id === "recent-call");
  assert(recentIndex > 0 && compacted.messages[recentIndex + 1]?.tool_call_id === "recent-call");
  assert.notEqual(compacted.messages[2]?.role, "tool");
  assert(approximateLlmTokens(compacted.messages) < approximateLlmTokens(messages));
  const again = compactLlmConversation(compacted.messages, {
    contextSize: 4_096, responseTokens: 512, recentContextTokens: 1_024,
  }, { tools: [], strategicState: { mandate: profile.mandate, liveIds: ["mission:8"] }, force: true });
  const checkpoint = JSON.parse(again.messages[1].content.split("\n")[1]);
  assert(checkpoint.priorSummary, "later checkpoints retain the prior structured summary");
  assert.equal(checkpoint.liveIds[0], "mission:8");
}

// Model discovery merges OpenAI and runtime metadata, preferring loaded context.
{
  const requested = [];
  const fetchImpl = async (url, init) => {
    requested.push({ url, authorization: init.headers.Authorization });
    if (url.endsWith("/v1/models")) return new Response(JSON.stringify({ data: [
      { id: "alpha", metadata: { context_window: 32_768 } }, { id: profile.model },
    ] }), { status: 200 });
    if (url.endsWith("/api/v0/models")) return new Response(JSON.stringify({ data: [{
      id: profile.model, state: "loaded", loaded_context_length: 262_144,
      max_context_length: 524_288, capabilities: ["tool_use"],
    }] }), { status: 200 });
    throw new Error(`Unexpected ${url}`);
  };
  const discovered = await discoverLlmAiModels(profile, { fetchImpl });
  assert.deepEqual(discovered.reportedModels, ["alpha", profile.model]);
  assert.equal(discovered.models[1].contextSize, 262_144);
  assert.equal(discovered.models[1].supportsTools, true);
  assert(requested.every((entry) => entry.authorization === "Bearer super-secret-key"));
}

const tool = {
  name: "move_army",
  description: "Move an army.",
  parameters: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false },
  execute: async () => ({ ok: true }),
};

// Fixture matches the known-good pi/Qwen request: streaming, enable_thinking,
// no tool_choice, no strict:false, and exact reasoning/tool history replay.
{
  const history = [
    { role: "system", content: "stable" },
    { role: "assistant", content: null, reasoning_content: "prior reasoning", tool_calls: [{ id: "prior-call", type: "function", function: { name: "move_army", arguments: "{\"x\":1,\"y\":2}" } }] },
    { role: "tool", tool_call_id: "prior-call", content: "{\"ok\":true}" },
  ];
  const body = buildLlmAiChatRequest(profile, history, [tool], { sessionId: "session-qwen" });
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(body.enable_thinking, true);
  assert.equal(body.reasoning_effort, undefined);
  assert.equal(body.tool_choice, undefined);
  assert.equal(body.tools[0].function.strict, undefined);
  assert.equal(body.messages[1].reasoning_content, "prior reasoning");
  assert.equal(body.messages[2].tool_call_id, "prior-call");
  const appendedHistory = [...history,
    { role: "user", content: "next strategic tick" },
    { role: "assistant", content: null, tool_calls: [{ id: "next-call", type: "function", function: { name: "move_army", arguments: "{\"x\":3,\"y\":4}" } }] },
    { role: "tool", tool_call_id: "next-call", content: "{\"ok\":true}" },
  ];
  const appendedBody = buildLlmAiChatRequest(profile, appendedHistory, [tool], { sessionId: "session-qwen" });
  assert.equal(JSON.stringify(appendedBody.messages.slice(0, history.length)), JSON.stringify(body.messages),
    "normal turns preserve a byte-identical append-only message prefix");
  assert.equal(JSON.stringify(appendedBody.tools), JSON.stringify(body.tools), "tool definitions remain byte-stable");

  const requests = [];
  let targetAddressSpace = null;
  const previousLocation = globalThis.location;
  globalThis.location = { protocol: "https:" };
  let turn;
  try {
    turn = await completeLlmAiTurn(profile, history, [tool], {
      sessionId: "session-qwen",
      fetchImpl: async (_url, init) => {
        requests.push(JSON.parse(init.body)); targetAddressSpace = init.targetAddressSpace;
        return sseResponse(nativeToolEvents());
      },
    });
  } finally {
    if (previousLocation === undefined) delete globalThis.location; else globalThis.location = previousLocation;
  }
  assert.equal(requests.length, 1);
  assert.equal(turn.protocol, "native");
  assert.deepEqual(turn.calls[0].arguments, { x: 10, y: 20 });
  assert.equal(turn.reasoningContent, "consider act");
  assert.equal(turn.assistantMessage.reasoning_content, "consider act");
  assert.equal(turn.usage.totalTokens, 15);
  assert.equal(turn.usage.cachedTokens, 6);
  assert.equal(targetAddressSpace, "local");
}

// Native mode fails clearly and performs no hidden structured retry.
{
  let requests = 0;
  await assert.rejects(() => completeLlmAiTurn(profile, [{ role: "system", content: "test" }], [tool], {
    fetchImpl: async () => {
      requests += 1;
      return sseResponse([{ id: "no-tool", choices: [{ delta: { content: "hello" }, finish_reason: "stop" }] }, "[DONE]"]);
    },
  }), /never switches protocols automatically/);
  assert.equal(requests, 1);
}

// The separately selected adapter is one explicit request, never a mid-match fallback.
{
  let requests = 0;
  const structuredProfile = createLlmAiProfile({ ...profile, toolProtocol: "structured" });
  const turn = await completeLlmAiTurn(structuredProfile, [{ role: "system", content: "test" }], [tool], {
    fetchImpl: async (_url, init) => {
      requests += 1;
      const body = JSON.parse(init.body);
      assert(body.response_format);
      return new Response(JSON.stringify({ id: "structured", choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ action: "tool", tool: "move_army", arguments: { x: 3, y: 4 }, note: "move" }),
      } }], usage: { total_tokens: 4 } }), { status: 200 });
    },
  });
  assert.equal(requests, 1);
  assert.equal(turn.protocol, "structured");
}

// Diagnostics use the same native streaming request builder/parser as a match.
{
  let chatRequests = 0;
  const result = await probeLlmAiEndpoint(profile, {
    probeId: "one-time-probe",
    fetchImpl: async (url, init) => {
      if (url.endsWith("/v1/models")) return new Response(JSON.stringify({ data: [{ id: profile.model }] }), { status: 200 });
      if (url.endsWith("/api/v0/models")) return new Response(JSON.stringify({ data: [{ id: profile.model, loaded_context_length: 262_144, capabilities: ["tool_use"] }] }), { status: 200 });
      chatRequests += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.stream, true);
      const expected = body.tools[0].function.parameters.properties.probe.enum[0];
      return sseResponse(nativeToolEvents({ callId: "probe-call", name: "report_ready", argumentsValue: { ready: true, probe: expected } }));
    },
  });
  assert.equal(chatRequests, 1);
  assert.equal(result.protocol, "native");
  assert(result.checks.every((check) => check.status === "pass"));
}

// Routine observations and arbitrary tool results are hard-bounded only after
// serialization; oversized records become summaries with stable handles.
{
  const objects = Array.from({ length: 200 }, (_, id) => ({
    id: id + 1, owner: id % 2 ? 4 : 5, relationship: id % 2 ? "allies" : "enemies",
    categories: [id % 3 ? "VEHICLE" : "STRUCTURE"], position: [id, id, 0],
    health: [100 - (id % 20), 100], construction: 1, status: [], template: `Internal${id}`,
  }));
  const observation = compactRoutineObservation({
    snapshotId: 9, frame: 100, localPlayerIndex: 4, game: { outcome: "playing" },
    players: [{ index: 4, local: true, economy: { money: 5_000, powerSufficient: true } }], objects,
  }, { maxTokens: 512, assignment: { playerIndex: 4 }, jobs: [] });
  assert(conservativeLlmTokens(observation) <= 512);
  assert.equal(JSON.stringify(observation).includes("Internal199"), false, "routine state omits internal execution names");

  const previousStrategic = { frame: 60, objects: [] };
  const strategic = compactRoutineObservation({
    snapshotId: 10, frame: 120, localPlayerIndex: 4, game: { outcome: null },
    terrain: { extent: { lo: [0, 0, 0], hi: [3_000, 3_000, 100] } },
    players: [{ index: 4, local: true, economy: { money: 1_000 } }],
    objects: [{ id: 91, owner: 5, relationship: "enemies", categories: ["STRUCTURE"],
      position: [2_500, 2_800, 0], health: [750, 1_000], construction: 1 }],
  }, { maxTokens: 2_048, assignment: { playerIndex: 4 }, jobs: [], previous: previousStrategic });
  assert.deepEqual(strategic.time, { logicFramesPerSecond: 30, gameSeconds: 4,
    sincePrevious: { frames: 60, gameSeconds: 2 } });
  assert.deepEqual(strategic.terrain.extent.hi, [3_000, 3_000, 100]);
  assert.deepEqual(strategic.objectives, [{ handle: "contact:91", kind: "structure",
    position: [2_500, 2_800, 0], health: 75,
    construction: { state: "constructing", percent: 1 } }]);

  const huge = { ok: true, items: [{ handle: "contact:77", detail: "z".repeat(100_000) }] };
  const bounded = boundLlmPayload(huge, 256);
  assert(conservativeLlmTokens(bounded.value) <= 256);
  assert.match(JSON.stringify(bounded.value), /contact:77/);
  assert.equal(JSON.stringify(bounded.value).includes("zzzzzzzzzz"), false, "strings are summarized, never sliced");

  const oversizedPage = new StableQueryPager().page([huge.items[0]], {
    filters: { handle: "contact:77" }, order: ["handle", "asc"], limit: 1, revision: "oversized-r1",
  });
  const boundedPage = boundLlmPayload(oversizedPage, 256);
  assert(conservativeLlmTokens(boundedPage.value) <= 256);
  assert.match(JSON.stringify(boundedPage.value), /contact:77/, "an oversized paginated record retains its stable handle");
}

// Pagination is deterministic, filter/order-bound, and stable across state changes.
{
  const pager = new StableQueryPager();
  const records = ["a", "b", "c", "d"].map((handle, index) => ({ handle, cost: index }));
  const first = pager.page(records, { filters: { ready: true }, order: ["handle", "asc"], limit: 2, revision: "r1" });
  assert.deepEqual(first.items.map((item) => item.handle), ["a", "b"]);
  const second = pager.page([{ handle: "aa" }, ...records], {
    filters: { ready: true }, order: ["handle", "asc"], limit: 2, cursor: first.nextCursor, revision: "r2",
  });
  assert.deepEqual(second.items.map((item) => item.handle), ["c", "d"], "cursor retains the exact prior snapshot");
  assert.equal(second.snapshot, first.snapshot);
  assert.throws(() => pager.page(records, { filters: { ready: false }, order: ["handle", "asc"], cursor: first.nextCursor }), /another query/);
}

// Strategic tools expose the middle layer and document bounded query contracts.
{
  const calls = [];
  const rpc = async (command, payload) => {
    calls.push({ command, payload });
    return { ok: true, result: { ok: true, accepted: true, command } };
  };
  const tools = createLlmAiGameTools({ rpc, playerIndex: 4, planningIntervalMs: 2_000, profile });
  assert.deepEqual(tools.map((entry) => entry.name), [
    "set_priorities", "query_buildable_options", "request_production", "request_force",
    "assign_mission", "inspect_job", "inspect_entities", "query_map_region",
    "issue_order", "use_command", "wait_for_tick",
  ]);
  for (const name of ["query_buildable_options", "inspect_entities", "query_map_region"]) {
    assert.match(tools.find((entry) => entry.name === name).description, /Freshness|snapshot|frame/i);
    assert.match(tools.find((entry) => entry.name === name).description, /hard result|bounded/i);
  }
  const order = tools.find((entry) => entry.name === "issue_order");
  order.validate({ action: "attackMove", objectIds: [2, 3], position: { x: 10, y: 20 } });
  await order.execute({ action: "attackMove", objectIds: [2, 3], position: { x: 10, y: 20 } });
  assert.equal(calls[0].command, "llmAiGameOrder");
}

// Stable squad handles resolve to current engine-owned team members, and force
// jobs keep the squad handle returned by the original team machinery.
{
  const calls = [];
  const world = {
    snapshotId: 3, frame: 40, localPlayerIndex: 4,
    objects: [
      { id: 21, owner: 4, teamId: 9, categories: ["VEHICLE"] },
      { id: 22, owner: 4, teamId: 9, categories: ["INFANTRY"] },
    ],
  };
  const rpc = async (command, payload) => {
    calls.push({ command, payload });
    if (command === "llmAiWorldSnapshot") return { ok: true, result: { ok: true, ...world } };
    if (command === "llmAiEngineRequest") return { ok: true, result: { ok: true, teamId: 12, frame: 40 } };
    return { ok: true, result: { ok: true, accepted: true, frame: 40 } };
  };
  const state = new LlmAiStrategicState({ rpc, playerIndex: 4, profile });
  state.raw = world;
  state.catalog = { engineServices: { teamPrototypes: ["attack-force"] }, commandSets: {}, objectCapabilities: {} };
  state.catalogRevision = "catalog:3";
  const tools = createLlmAiGameTools({ rpc, playerIndex: 4, profile, state });
  const mission = await tools.find((entry) => entry.name === "assign_mission").execute({
    mission: "attackRegion", squadHandle: "squad:9", position: { x: 100, y: 200 },
  });
  assert.equal(mission.ok, true);
  assert.equal(calls.find((entry) => entry.command === "llmAiGameOrder").payload.objectIds, "21,22");
  const force = await tools.find((entry) => entry.name === "request_force").execute({
    archetypeHandle: "force:attack-force", mode: "assemble",
  });
  assert.equal(force.job.squadHandle, "squad:12");
  assert.equal(force.job.state, "assembling");
}

// Provider overflow creates a coherent semantic checkpoint and retries exactly once.
{
  let now = 1_000;
  let attempts = 0;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile({ ...profile, contextSize: 4_096, responseTokens: 512, recentContextTokens: 1_024 }, { cryptoImpl, now: () => now++ });
  const runtime = new LlmAiAgentRuntime({
    profile: saved, tools: [{ ...tool, name: "issue_order", execute: async () => ({ ok: true }) }],
    observe: async () => ({ game: { outcome: "playing" }, missions: [], catalogRevision: "r1" }),
    store: memory, cryptoImpl, now: () => now++,
    getStrategicState: () => ({ mandate: saved.mandate, liveIds: ["mission:1"], unresolvedErrors: [] }),
    complete: async (_profile, messages) => {
      attempts += 1;
      if (attempts === 1) { const error = new Error("maximum context length exceeded"); error.code = "context_overflow"; throw error; }
      assert(messages.some((message) => message.content?.startsWith("STRATEGIC CHECKPOINT")));
      return {
        protocol: "native", calls: [{ id: "wait-call", name: "issue_order", arguments: {} }],
        assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: "wait-call", type: "function", function: { name: "issue_order", arguments: "{}" } }] },
        reasoningContent: "", finishReason: "tool_calls", usage: { totalTokens: 5 }, latencyMs: 7, responseId: "retry-ok",
      };
    },
  });
  await runtime.start();
  await runtime.step();
  assert.equal(attempts, 2);
  assert.equal(runtime.session.providerRequests, 2);
  assert.equal(runtime.session.providerLatencyMs, 7);
  const events = await memory.listEvents(runtime.session.id);
  assert.equal(events.filter((event) => event.type === "model.request").length, 2);
  assert.equal(events.filter((event) => event.type === "model.decision").length, 1);
  assert.equal(events.filter((event) => event.type === "engine.execution").length, 1);
  assert.equal(events.filter((event) => event.type === "engine.reaction").length, 1);
  assert(events.some((event) => event.type === "context.compacted" && event.data.reason === "provider-overflow"));
  const assistantIndex = runtime.messages.findIndex((message) => message.tool_calls?.[0]?.id === "wait-call");
  assert.equal(runtime.messages[assistantIndex + 1].tool_call_id, "wait-call");
}

// A deterministic malformed native response receives bounded correction context before retrying.
{
  let now = 1_500;
  let attempts = 0;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile({ ...profile, maxConsecutiveFailures: 3,
    classicFallback: false }, { cryptoImpl, now: () => now++ });
  const runtime = new LlmAiAgentRuntime({
    profile: saved, tools: [tool], observe: async () => ({ game: { outcome: "playing" } }),
    store: memory, cryptoImpl, now: () => now++,
    complete: async (_profile, messages) => {
      attempts += 1;
      if (attempts === 1) {
        const error = new LlmAiProviderError("native response contained prose only", {
          code: "missing_tool_call", retryable: true,
        });
        throw error;
      }
      assert(messages.at(-1)?.content?.startsWith("ENVIRONMENT PROVIDER RESPONSE REJECTED"));
      return {
        protocol: "native", calls: [{ id: "corrected-call", name: tool.name, arguments: { x: 4 } }],
        assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: "corrected-call",
          type: "function", function: { name: tool.name, arguments: "{\"x\":4}" } }] },
        reasoningContent: "", finishReason: "tool_calls", usage: { totalTokens: 4 },
        latencyMs: 3, responseId: "corrected",
      };
    },
  });
  await runtime.start();
  const first = await runtime.step();
  assert.equal(first.terminal, false);
  assert.equal(runtime.session.failures, 1);
  await runtime.step();
  assert.equal(attempts, 2);
  assert.equal(runtime.session.turns, 1);
  const events = await memory.listEvents(runtime.session.id);
  assert(events.some((event) => event.type === "model.correction_requested"
    && event.data.rejectedResponse.code === "missing_tool_call"));
}

// Recovery keeps the provider's native tool schema stable and rejects a
// temporarily disallowed call through an observable tool result.
{
  let now = 1_750;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile(profile, { cryptoImpl, now: () => now++ });
  const informational = { ...tool, name: "query_buildable_options" };
  const runtime = new LlmAiAgentRuntime({
    profile: saved, tools: [tool, informational],
    observe: async () => ({ game: { outcome: "playing" }, threats: [{ handle: "force:enemy:unit" }] }),
    store: memory, cryptoImpl, now: () => now++,
    complete: async (_profile, _messages, availableTools) => {
      assert.deepEqual(availableTools.map((candidate) => candidate.name),
        [tool.name, informational.name]);
      return {
        protocol: "native", calls: [{ id: "restricted-call", name: informational.name, arguments: {} }],
        assistantMessage: { role: "assistant", content: null, tool_calls: [{ id: "restricted-call",
          type: "function", function: { name: informational.name, arguments: "{}" } }] },
        reasoningContent: "", finishReason: "tool_calls", usage: { totalTokens: 4 },
        latencyMs: 3, responseId: "stable-schema",
      };
    },
  });
  await runtime.start();
  runtime.nonActionStreak = 2;
  await runtime.step();
  const events = await memory.listEvents(runtime.session.id);
  const request = events.find((event) => event.type === "model.request");
  assert.equal(request.data.toolCount, 2);
  assert.equal(request.data.allowedToolCount, 1);
  assert(events.some((event) => event.type === "tool.result"
    && event.data.result.error.code === "recovery_tool_unavailable"));
}

// Once visible threats disappear, recovery permits bounded reconnaissance but
// removes waiting until a remaining objective is found.
{
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile(profile, { cryptoImpl, now: () => 1_900 });
  const query = { ...tool, name: "inspect_entities" };
  const wait = { ...tool, name: "wait_for_tick" };
  const runtime = new LlmAiAgentRuntime({
    profile: saved, tools: [tool, query, wait],
    observe: async () => ({ game: { outcome: "playing" }, threats: [] }),
    store: memory, cryptoImpl, now: () => 1_900,
  });
  await runtime.start();
  runtime.nonActionStreak = 2;
  const recovery = runtime.recoveryToolSet();
  assert.equal(recovery.reason, "find-remaining-objective");
  assert.deepEqual(recovery.tools.map((candidate) => candidate.name), [tool.name, query.name]);
}

// Fallback is a single observable ownership transfer and terminates model inference.
{
  let now = 2_000;
  let requests = 0;
  let transfers = 0;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile({ ...profile, maxConsecutiveFailures: 1, classicFallback: true }, { cryptoImpl, now: () => now++ });
  const runtime = new LlmAiAgentRuntime({
    profile: saved, tools: [tool], observe: async () => ({ game: { outcome: "playing" } }),
    store: memory, cryptoImpl, now: () => now++,
    complete: async () => { requests += 1; throw new Error("provider unreachable"); },
    transferToClassic: async () => { transfers += 1; return { previousController: "llm", controller: "classic", frame: 12 }; },
  });
  await runtime.start();
  const result = await runtime.step();
  assert.equal(result.terminal, true);
  assert.equal(runtime.session.status, "fallback");
  assert.equal(requests, 1);
  assert.equal(transfers, 1);
  await runtime.step();
  assert.equal(requests, 1, "the model never runs after lease transfer");
  const events = await memory.listEvents(runtime.session.id);
  assert(events.some((event) => event.type === "strategy.ownership_transferred"));
}

// Coordinator claims the explicit lease before starting one runtime per assignment.
{
  let starts = 0;
  let leaseClaims = 0;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile(profile, { cryptoImpl, now: () => 3_000 });
  class FakeRuntime {
    constructor() { this.session = null; }
    async start(metadata) { starts += 1; assert.equal(metadata.strategyLease.controller, "llm"); this.session = { id: `s${starts}`, status: "running" }; }
    async run() { this.session.status = "completed"; return this.session; }
  }
  const rpc = async (command) => {
    if (command === "llmAiStrategyController") {
      leaseClaims += 1;
      return { ok: true, result: { ok: true, previousController: "llm", controller: "llm" } };
    }
    assert.equal(command, "realEngineLlmAiAssignments");
    return { ok: true, result: { ok: true, playable: true, authoritative: true, gameMode: 2, gameId: 9, seed: 10, map: "TestMap", frame: 100, assignments: [{
      slot: 1, playerIndex: 4, profileId: saved.id, displayName: "Qwen General",
      playerActive: true, computerPlayer: true, strategyController: "llm",
    }] } };
  };
  const coordinator = new LlmAiGameCoordinator({ rpc, store: memory, AgentRuntime: FakeRuntime });
  await coordinator.reconcileNow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(starts, 1);
  assert.equal(leaseClaims, 1);
  await coordinator.reconcileNow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(starts, 1, "completed assignment does not restart in the same match");
}

console.log("LLM AI unit: PASS");
