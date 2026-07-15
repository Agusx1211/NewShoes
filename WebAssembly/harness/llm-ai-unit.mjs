import assert from "node:assert/strict";
import { LlmAiAgentRuntime } from "./llm-ai-agent.mjs";
import { completeLlmAiTurn } from "./llm-ai-openai-client.mjs";
import {
  approximateLlmTokens,
  buildLlmAiSystemPrompt,
  compactLlmConversation,
  createLlmAiProfile,
  exportLlmAiSession,
  llmChatCompletionsUrl,
  llmModelsUrl,
  publicLlmAiProfile,
} from "./llm-ai-profile.mjs";
import { MemoryLlmAiStore } from "./llm-ai-store.mjs";
import {
  createLlmAiGameTools,
  LlmAiGameCoordinator,
} from "./llm-ai-game-runtime.mjs";

const cryptoImpl = { randomUUID: () => "00000000-0000-4000-8000-000000000001" };
const profile = createLlmAiProfile({
  name: "Qwen General",
  endpoint: "http://192.168.100.203:1234",
  model: "qwen3.6-35b-a3b-mtp@q8_k_xl",
  apiKey: "super-secret-key",
  thinkingEffort: "low",
  contextSize: 262_144,
}, { cryptoImpl, now: () => 100 });

assert.equal(profile.mandate, "Play to the best of your capability and win the game.");
assert.equal(llmChatCompletionsUrl(profile.endpoint), "http://192.168.100.203:1234/v1/chat/completions");
assert.equal(llmChatCompletionsUrl("https://example.test/openai/v1"), "https://example.test/openai/v1/chat/completions");
assert.equal(llmModelsUrl("https://example.test/openai/v1/chat/completions"), "https://example.test/openai/v1/models");
assert.throws(() => createLlmAiProfile({ ...profile, endpoint: "file:///tmp/model" }), /HTTP or HTTPS/);
assert.throws(() => createLlmAiProfile({ ...profile, contextSize: 2_000 }), /Context size/);
assert.equal(publicLlmAiProfile(profile).apiKey, undefined);
assert.equal(publicLlmAiProfile(profile).hasApiKey, true);
assert.equal(publicLlmAiProfile(publicLlmAiProfile(profile)).hasApiKey, true);
assert.match(buildLlmAiSystemPrompt(profile), /No human is chatting/);
assert.match(buildLlmAiSystemPrompt(profile), /classic AI is the execution and safety substrate/);

const exported = exportLlmAiSession({
  profile,
  session: { id: "session-1", authorization: "Bearer super-secret-key" },
  events: [{ data: { apiKey: "super-secret-key", message: "sent super-secret-key" } }],
});
assert.equal(JSON.stringify(exported).includes("super-secret-key"), false);
assert.equal(exported.profile.hasApiKey, true);

const longMessages = [
  { role: "system", content: "system" },
  ...Array.from({ length: 30 }, (_, index) => ({ role: "user", content: `old-${index}-${"x".repeat(500)}` })),
  { role: "assistant", content: "latest plan" },
  { role: "user", content: "latest observation" },
];
const compacted = compactLlmConversation(longMessages, { contextSize: 4_096, responseTokens: 512 });
assert.equal(compacted.compacted, true);
assert.equal(compacted.messages[0].role, "system");
assert.match(compacted.messages[1].content, /CONTEXT COMPACTION/);
assert.equal(compacted.messages.at(-1).content, "latest observation");
assert(approximateLlmTokens(compacted.messages) < approximateLlmTokens(longMessages));

const tool = {
  name: "move_army",
  description: "Move the assigned army to a visible position.",
  parameters: {
    type: "object",
    properties: { x: { type: "number" }, y: { type: "number" } },
    required: ["x", "y"],
    additionalProperties: false,
  },
  execute: async () => ({ ok: true }),
};

{
  const requests = [];
  let targetAddressSpace = null;
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    targetAddressSpace = init.targetAddressSpace ?? null;
    return new Response(JSON.stringify({
      id: "native-1",
      choices: [{ finish_reason: "tool_calls", message: {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call-1", type: "function", function: { name: "move_army", arguments: "{\"x\":10,\"y\":20}" } }],
      } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const previousLocation = globalThis.location;
  globalThis.location = { protocol: "https:" };
  let turn;
  try {
    turn = await completeLlmAiTurn({ ...profile, toolProtocol: "native" }, [
      { role: "system", content: "test" }, { role: "user", content: "move" },
    ], [tool], { fetchImpl });
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
  assert.equal(turn.protocol, "native");
  assert.deepEqual(turn.calls[0].arguments, { x: 10, y: 20 });
  assert.equal(requests[0].tool_choice, "required");
  assert.equal(requests[0].reasoning_effort, "low");
  assert.equal(targetAddressSpace, "local");
}

{
  const fetchImpl = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      init.signal.addEventListener("abort", () => controller.error(init.signal.reason), { once: true });
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await assert.rejects(() => completeLlmAiTurn({
    ...profile,
    toolProtocol: "native",
    requestTimeoutMs: 20,
  }, [
    { role: "system", content: "test" }, { role: "user", content: "wait for a body" },
  ], [tool], { fetchImpl }), /exceeded 20 ms/);
}

{
  const requests = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    const structured = Boolean(body.response_format);
    return new Response(JSON.stringify({
      id: structured ? "structured-2" : "native-missing-1",
      choices: [{ finish_reason: "stop", message: structured ? {
        role: "assistant",
        content: "",
        reasoning_content: JSON.stringify({
          action: "tool", tool: "move_army", arguments: { x: 30, y: 40 }, note: "advance",
        }),
        tool_calls: [],
      } : { role: "assistant", content: "", reasoning_content: "I should call a tool", tool_calls: [] } }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const turn = await completeLlmAiTurn({ ...profile, toolProtocol: "auto" }, [
    { role: "system", content: "test" }, { role: "user", content: "move" },
  ], [tool], { fetchImpl });
  assert.equal(turn.protocol, "structured");
  assert.equal(turn.compatibility.reason, "native_tool_calls_missing");
  assert.deepEqual(turn.action.arguments, { x: 30, y: 40 });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].response_format.type, "json_schema");
}

{
  let nextTime = 1_000;
  let observations = 0;
  const calls = [];
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile({ ...profile, apiKey: "runtime-secret" }, {
    cryptoImpl,
    now: () => nextTime++,
  });
  const runtime = new LlmAiAgentRuntime({
    profile: saved,
    tools: [{ ...tool, execute: async (args) => { calls.push(args); return { ok: true, orderId: 7 }; } }],
    observe: async () => (++observations === 1
      ? { game: { outcome: "playing" }, money: 10_000 }
      : { game: { outcome: "victory" }, money: 5_000 }),
    store: memory,
    complete: async () => ({
      protocol: "structured",
      compatibility: null,
      action: { action: "tool", tool: "move_army", arguments: { x: 1, y: 2 }, note: "attack" },
      assistantMessage: { role: "assistant", content: "{\"action\":\"tool\"}" },
      reasoningContent: "private plan",
      finishReason: "stop",
      usage: { totalTokens: 42 },
      latencyMs: 12,
      responseId: "turn-1",
    }),
    cryptoImpl,
    now: () => nextTime++,
  });
  await runtime.start({ map: "Test Map" });
  const result = await runtime.step();
  assert.equal(result.terminal, true);
  assert.equal(runtime.session.status, "completed");
  assert.equal(runtime.session.outcome, "victory");
  assert.deepEqual(calls, [{ x: 1, y: 2 }]);
  const events = await memory.listEvents(runtime.session.id);
  assert(events.some((event) => event.type === "tool.result" && event.data.ok));
  assert(events.some((event) => event.type === "session.completed"));
  const bundle = await memory.exportSession(runtime.session.id);
  assert.equal(JSON.stringify(bundle).includes("runtime-secret"), false);
}

{
  let executions = 0;
  let nextTime = 2_000;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile(profile, { cryptoImpl, now: () => nextTime++ });
  const runtime = new LlmAiAgentRuntime({
    profile: saved,
    tools: [{
      ...tool,
      async execute() {
        executions += 1;
        const error = new Error("objectsInTheWay");
        error.code = "illegal_build_location";
        throw error;
      },
    }],
    observe: async () => ({ game: { outcome: "playing" } }),
    store: memory,
    cryptoImpl,
    now: () => nextTime++,
  });
  await runtime.start();
  const call = { id: "blocked-repeat", name: "move_army", arguments: { x: 1, y: 2 } };
  const first = await runtime.executeTool(call, "native");
  const repeated = await runtime.executeTool(call, "native");
  assert.equal(first.error.code, "illegal_build_location");
  assert.equal(repeated.error.code, "repeated_invalid_action");
  assert.equal(executions, 1, "an identical failed action must not reach the engine twice in a row");
}

{
  let nextTime = 2_500;
  let failedExecutions = 0;
  let recoveredExecutions = 0;
  const offeredTools = [];
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile(profile, { cryptoImpl, now: () => nextTime++ });
  const failedTool = {
    ...tool,
    name: "failed_action",
    async execute() {
      failedExecutions += 1;
      const error = new Error("blocked");
      error.code = "engine_rejected";
      throw error;
    },
  };
  const recoveryTool = {
    ...tool,
    name: "recovery_action",
    async execute() {
      recoveredExecutions += 1;
      return { accepted: true };
    },
  };
  const waitingTool = { ...tool, name: "wait_for_tick" };
  let turn = 0;
  const runtime = new LlmAiAgentRuntime({
    profile: saved,
    tools: [failedTool, recoveryTool, waitingTool],
    observe: async () => ({
      assignment: { playerIndex: 4 },
      game: { outcome: "playing" },
      objects: [{ id: 77, owner: 4 }],
      classicAi: { availableBuildingTemplates: ["ChinaPowerPlant"] },
    }),
    store: memory,
    complete: async (_profile, _messages, tools) => {
      offeredTools.push(tools.map((entry) => entry.name));
      turn += 1;
      const name = turn < 3 ? "failed_action" : "recovery_action";
      return {
        protocol: "native",
        calls: [{ id: `recovery-${turn}`, name, arguments: { x: 1, y: 2 } }],
        assistantMessage: { role: "assistant", content: "", tool_calls: [] },
        usage: { totalTokens: 1 },
      };
    },
    cryptoImpl,
    now: () => nextTime++,
  });
  await runtime.start();
  await runtime.step();
  await runtime.step();
  await runtime.step();
  assert.deepEqual(offeredTools[2], ["recovery_action"]);
  assert.equal(failedExecutions, 1, "repeated failed calls must stay outside the engine");
  assert.equal(recoveredExecutions, 1);
  assert.equal(runtime.actionFailureStreak, 0);
  const events = await memory.listEvents(runtime.session.id);
  const recovery = events.find((event) => event.type === "agent.recovery_required");
  assert.deepEqual(recovery.data.toolsAvailableThisTurn, ["recovery_action"]);
  assert.deepEqual(recovery.data.exactBuildingTemplates, ["ChinaPowerPlant"]);
  assert.deepEqual(recovery.data.currentOwnedObjectIds, [77]);
}

{
  let nextTime = 2_750;
  const offeredTools = [];
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile(profile, { cryptoImpl, now: () => nextTime++ });
  let turn = 0;
  const runtime = new LlmAiAgentRuntime({
    profile: saved,
    tools: [tool, { ...tool, name: "wait_for_tick" }],
    observe: async () => ({ game: { outcome: "playing" } }),
    store: memory,
    complete: async (_profile, _messages, tools) => {
      offeredTools.push(tools.map((entry) => entry.name));
      turn += 1;
      const action = turn < 3
        ? { action: "wait", note: "still considering" }
        : { action: "tool", tool: "move_army", arguments: { x: 3, y: 4 } };
      return {
        protocol: "structured",
        action,
        assistantMessage: { role: "assistant", content: JSON.stringify(action) },
        usage: { totalTokens: 1 },
      };
    },
    cryptoImpl,
    now: () => nextTime++,
  });
  await runtime.start();
  await runtime.step();
  await runtime.step();
  await runtime.step();
  assert.deepEqual(offeredTools[2], ["move_army"], "repeated waits must force an action-only turn");
  assert.equal(runtime.nonActionStreak, 0);
}

{
  let observations = 0;
  let nextTime = 3_000;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile({ ...profile, classicFallback: true }, {
    cryptoImpl,
    now: () => nextTime++,
  });
  const runtime = new LlmAiAgentRuntime({
    profile: saved,
    tools: [tool],
    observe: async () => ({
      game: { outcome: ++observations === 1 ? "playing" : "victory" },
    }),
    store: memory,
    complete: async () => { throw new Error("provider unavailable"); },
    cryptoImpl,
    now: () => nextTime++,
  });
  await runtime.start();
  const result = await runtime.step();
  assert.equal(result.terminal, true);
  assert.equal(runtime.session.status, "completed");
  assert.equal(runtime.session.outcome, "victory");
  assert.equal(runtime.session.failures, 1);
}

{
  let observations = 0;
  let nextTime = 4_000;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile(profile, { cryptoImpl, now: () => nextTime++ });
  const runtime = new LlmAiAgentRuntime({
    profile: saved,
    tools: [tool],
    observe: async () => ({
      game: { outcome: ++observations === 1 ? "playing" : "defeat" },
    }),
    store: memory,
    cryptoImpl,
    now: () => nextTime++,
  });
  await runtime.start();
  const controller = new AbortController();
  controller.abort(new Error("Match ended"));
  await runtime.run({ signal: controller.signal });
  assert.equal(runtime.session.status, "completed");
  assert.equal(runtime.session.outcome, "defeat");
}

{
  const calls = [];
  const rpc = async (command, payload) => {
    calls.push({ command, payload });
    return { ok: true, result: { ok: true, accepted: true, command } };
  };
  const tools = createLlmAiGameTools({ rpc, playerIndex: 4, planningIntervalMs: 2_000 });
  assert.deepEqual(tools.map((entry) => entry.name), [
    "issue_order", "use_command", "classic_ai_directive", "query_terrain", "wait_for_tick",
  ]);
  const order = tools.find((entry) => entry.name === "issue_order");
  order.validate({ action: "attackMove", objectIds: [2, 3], position: { x: 10, y: 20 } });
  await order.execute({ action: "attackMove", objectIds: [2, 3], position: { x: 10, y: 20 } });
  assert.deepEqual(calls[0], {
    command: "llmAiGameOrder",
    payload: { playerIndex: 4, action: "attackMove", objectIds: "2,3", targetId: 0, x: 10, y: 20 },
  });
  assert.throws(() => order.validate({ action: "attack", objectIds: [2] }), /targetId/);
  const command = tools.find((entry) => entry.name === "use_command");
  await command.execute({ sourceId: 7, command: "Command_ConstructAmericaPowerPlant", position: { x: 4, y: 5 } });
  assert.equal(calls[1].command, "llmAiGameCommand");
  assert.equal(calls[1].payload.hasPosition, true);
  const waiting = await tools.find((entry) => entry.name === "wait_for_tick").execute({});
  assert.deepEqual(waiting, { ok: true, action: "wait", resumesAfterMs: 2_000 });
}

{
  let playable = true;
  let starts = 0;
  const memory = new MemoryLlmAiStore();
  const saved = await memory.saveProfile(profile, { cryptoImpl, now: () => 200 });
  class FakeRuntime {
    constructor({ profile: assignedProfile }) {
      assert.equal(assignedProfile.id, saved.id);
      this.session = null;
    }
    async start(metadata) {
      starts += 1;
      this.session = { id: `session-${starts}`, status: "running", metadata };
    }
    async run() {
      this.session.status = "completed";
      return this.session;
    }
  }
  const rpc = async (command) => {
    assert.equal(command, "realEngineLlmAiAssignments");
    return { ok: true, result: {
      ok: true,
      playable,
      authoritative: true,
      gameMode: 2,
      gameId: 9,
      seed: 10,
      map: "TestMap",
      frame: playable ? 100 : 0,
      assignments: playable ? [{
        slot: 1,
        playerIndex: 4,
        profileId: saved.id,
        displayName: "Qwen General",
        playerActive: true,
        computerPlayer: true,
      }] : [],
    } };
  };
  const coordinator = new LlmAiGameCoordinator({ rpc, store: memory, AgentRuntime: FakeRuntime });
  await coordinator.reconcileNow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(starts, 1);
  assert.equal(coordinator.completed.size, 1);
  await coordinator.reconcileNow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(starts, 1, "a completed commander must not restart during the same match");
  playable = false;
  await coordinator.reconcileNow();
  playable = true;
  await coordinator.reconcileNow();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(starts, 2, "a new playable match must start a new commander session");
}

console.log("LLM AI unit: PASS");
