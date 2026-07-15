export const LLM_AI_SCHEMA_VERSION = 1;
export const DEFAULT_LLM_AI_MANDATE = "Play to the best of your capability and win the game.";
export const LLM_AI_THINKING_EFFORTS = Object.freeze([
  "provider-default", "none", "minimal", "low", "medium", "high", "xhigh", "max",
]);
export const LLM_AI_TOOL_PROTOCOLS = Object.freeze(["auto", "native", "structured"]);

const PROFILE_NAME_LIMIT = 64;
const MODEL_LIMIT = 256;
const MANDATE_LIMIT = 8_192;

function requireString(value, label, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new TypeError(`${label} is required`);
  if (text.length > maxLength) throw new TypeError(`${label} must be at most ${maxLength} characters`);
  return text;
}

function integerInRange(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return parsed;
}

export function normalizeLlmEndpoint(value) {
  const text = requireString(value, "Endpoint", 2_048);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError("Endpoint must be an absolute HTTP or HTTPS URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Endpoint must use HTTP or HTTPS");
  }
  if (url.username || url.password) {
    throw new TypeError("Endpoint credentials belong in the API key field, not the URL");
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href.replace(/\/$/, "");
}

function apiUrl(endpoint, resource) {
  const url = new URL(`${normalizeLlmEndpoint(endpoint)}/`);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  if (/\/v1\/(chat\/completions|models)$/.test(normalizedPath)) {
    url.pathname = normalizedPath.replace(/\/(chat\/completions|models)$/, `/${resource}`);
  } else if (/\/v1$/.test(normalizedPath)) {
    url.pathname = `${normalizedPath}/${resource}`;
  } else {
    url.pathname = `${normalizedPath}/v1/${resource}`.replace(/^\/\//, "/");
  }
  return url.href;
}

export function llmChatCompletionsUrl(endpoint) {
  return apiUrl(endpoint, "chat/completions");
}

export function llmModelsUrl(endpoint) {
  return apiUrl(endpoint, "models");
}

export function llmProviderMetadataUrl(endpoint) {
  const url = new URL(`${normalizeLlmEndpoint(endpoint)}/`);
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  const providerRoot = normalizedPath.replace(/\/v1(?:\/(?:chat\/completions|models))?$/, "");
  url.pathname = `${providerRoot}/api/v0/models`.replace(/^\/\//, "/");
  return url.href;
}

export function createLlmAiProfile(input = {}, {
  cryptoImpl = globalThis.crypto,
  now = () => Date.now(),
} = {}) {
  const timestamp = now();
  const id = typeof input.id === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(input.id)
    ? input.id
    : cryptoImpl?.randomUUID?.();
  if (!id) throw new TypeError("A secure profile ID generator is unavailable");
  const thinkingEffort = input.thinkingEffort ?? "medium";
  if (!LLM_AI_THINKING_EFFORTS.includes(thinkingEffort)) {
    throw new TypeError("Thinking effort is not supported");
  }
  const toolProtocol = input.toolProtocol ?? "auto";
  if (!LLM_AI_TOOL_PROTOCOLS.includes(toolProtocol)) {
    throw new TypeError("Tool protocol is not supported");
  }
  const contextSize = integerInRange(input.contextSize ?? 131_072, "Context size", 4_096, 2_097_152);
  const responseTokens = integerInRange(input.responseTokens ?? 4_096, "Response token reserve", 256, 65_536);
  if (responseTokens >= contextSize) throw new TypeError("Response token reserve must be smaller than context size");
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (apiKey.length > 4_096) throw new TypeError("API key is too long");
  return Object.freeze({
    schemaVersion: LLM_AI_SCHEMA_VERSION,
    id,
    name: requireString(input.name, "Name", PROFILE_NAME_LIMIT),
    endpoint: normalizeLlmEndpoint(input.endpoint),
    model: requireString(input.model, "Model", MODEL_LIMIT),
    apiKey,
    thinkingEffort,
    contextSize,
    responseTokens,
    mandate: requireString(input.mandate ?? DEFAULT_LLM_AI_MANDATE, "Mandate", MANDATE_LIMIT),
    toolProtocol,
    planningIntervalMs: integerInRange(input.planningIntervalMs ?? 2_000,
      "Planning interval", 250, 60_000),
    requestTimeoutMs: integerInRange(input.requestTimeoutMs ?? 120_000,
      "Request timeout", 5_000, 600_000),
    maxConsecutiveFailures: integerInRange(input.maxConsecutiveFailures ?? 5,
      "Failure limit", 1, 100),
    classicFallback: input.classicFallback !== false,
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : timestamp,
    updatedAt: timestamp,
  });
}

export function publicLlmAiProfile(profile) {
  const { apiKey: _apiKey, ...publicProfile } = profile;
  return { ...publicProfile, hasApiKey: Boolean(profile.apiKey || profile.hasApiKey) };
}

function redactValue(value, secrets) {
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      /^(api[_-]?key|authorization|credentials?|password|secret|access[_-]?token|refresh[_-]?token|token)$/i.test(key)
        ? "[redacted]"
        : redactValue(entry, secrets),
    ]));
  }
  if (typeof value === "string") {
    return secrets.reduce((text, secret) => secret ? text.split(secret).join("[redacted]") : text, value);
  }
  return value;
}

export function redactLlmAiData(value, profile = null) {
  return redactValue(value, [profile?.apiKey].filter(Boolean));
}

export function exportLlmAiSession({ profile, session, events }) {
  return redactLlmAiData({
    format: "project-new-shoes-llm-ai-session",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: publicLlmAiProfile(profile),
    session,
    events,
  }, profile);
}

export function buildLlmAiSystemPrompt(profile, { toolProtocol = profile.toolProtocol } = {}) {
  return [
    `You are ${profile.name}, an autonomous Command & Conquer: Generals – Zero Hour commander.`,
    `MANDATE: ${profile.mandate}`,
    "No human is chatting with you during the match. Messages labelled ENVIRONMENT are authoritative game observations or tool results, not user requests.",
    "Act continuously until the authoritative game state reports victory, defeat, or cancellation. Never wait for approval and never claim an action happened unless its tool result confirms it.",
    "Operate only the assigned player. Treat fog of war, hidden entities, unavailable commands, resource limits, placement rules, and rejected actions as real constraints.",
    "The classic AI is the execution and safety substrate for this LLM slot. Use its strategic levers and semantic game tools deliberately: maintain income and power, expand production, scout, counter observed threats, assemble effective forces, attack objectives, and recover from failed plans. Prefer classic_ai_directive buildBuilding for strategic construction because the classic AI owns legal placement; use use_command construction only after inspecting terrain and nearby objects.",
    "Prefer a short sequence of high-impact actions over repetitive polling. A wait is appropriate only while a confirmed action is progressing; do not spend consecutive turns waiting while the game is active and legal strategic, production, scouting, or combat actions remain. Re-observe after material tool results. If a tool fails, use the error to change the plan; do not repeat an identical invalid call indefinitely.",
    "Use only the supplied tools. Tool arguments are untrusted until the runtime validates them. A wait action means the current plan is progressing and the agent should wake on the next meaningful event or planning deadline.",
    `Tool protocol: ${toolProtocol}. Keep private reasoning private; concise action notes may be recorded in the match session.`,
  ].join("\n\n");
}

export function approximateLlmTokens(messages) {
  return messages.reduce((total, message) => total + 8
    + Math.ceil(JSON.stringify(message).length / 4), 0);
}

export function compactLlmConversation(messages, {
  contextSize,
  responseTokens,
  targetFraction = 0.82,
} = {}) {
  const limit = Math.max(1_024, Math.floor((contextSize - responseTokens) * targetFraction));
  if (approximateLlmTokens(messages) <= limit) return { messages: [...messages], compacted: false };
  const system = messages.filter((message) => message.role === "system").slice(0, 1);
  const candidates = messages.slice(system.length);
  const retained = [];
  let used = approximateLlmTokens(system) + 80;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    const cost = approximateLlmTokens([candidate]);
    if (used + cost > limit && retained.length > 0) break;
    retained.unshift(candidate);
    used += cost;
  }
  while (retained[0]?.role === "tool") retained.shift();
  const omitted = candidates.length - retained.length;
  const marker = {
    role: "system",
    content: `CONTEXT COMPACTION: ${omitted} older environment/model/tool messages were omitted. The latest retained observations and tool results are authoritative. Re-observe before relying on omitted tactical detail.`,
  };
  return { messages: [...system, marker, ...retained], compacted: true, omitted };
}
