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
assert.match(buildLlmAiSystemPrompt(profile), /classic AI remains the execution and safety substrate/);

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
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
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
  const turn = await completeLlmAiTurn({ ...profile, toolProtocol: "native" }, [
    { role: "system", content: "test" }, { role: "user", content: "move" },
  ], [tool], { fetchImpl });
  assert.equal(turn.protocol, "native");
  assert.deepEqual(turn.calls[0].arguments, { x: 10, y: 20 });
  assert.equal(requests[0].tool_choice, "required");
  assert.equal(requests[0].reasoning_effort, "low");
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

console.log("LLM AI unit: PASS");
