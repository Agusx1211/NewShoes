import { createLlmAiProfile } from "./llm-ai-profile.mjs";
import { probeLlmAiEndpoint } from "./llm-ai-openai-client.mjs";

const endpoint = process.env.LLM_AI_ENDPOINT || "http://192.168.100.203:1234";
const model = process.env.LLM_AI_MODEL || "qwen3.6-35b-a3b-mtp@q8_k_xl";
const profile = createLlmAiProfile({
  name: "Endpoint verification",
  endpoint,
  model,
  apiKey: process.env.LLM_AI_API_KEY || "",
  thinkingEffort: process.env.LLM_AI_THINKING_EFFORT || "low",
  contextSize: Number(process.env.LLM_AI_CONTEXT_SIZE || 262_144),
  responseTokens: 512,
  toolProtocol: "native",
  mandate: "Verify the tool protocol.",
});

const result = await probeLlmAiEndpoint(profile);
if (!result.ok) throw new Error("Endpoint probe did not succeed");
if (!process.env.LLM_AI_ENDPOINT) {
  if (result.contextSize !== 262_144) {
    throw new Error(`Expected provider context discovery to report 262144, got ${result.contextSize}`);
  }
  if (result.modelInfo?.supportsTools !== true) {
    throw new Error("Expected provider metadata to advertise tool use");
  }
}
console.log("LLM AI live endpoint: PASS", {
  endpoint,
  model,
  protocol: result.protocol,
  reportedModels: result.reportedModels,
  detectedContextSize: result.contextSize,
  contextSource: result.contextSource,
  metadataToolUse: result.modelInfo?.supportsTools ?? null,
  checks: result.checks.map(({ id, status }) => ({ id, status })),
  latencyMs: result.latencyMs,
});
