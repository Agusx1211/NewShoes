export const LLM_AI_SCHEMA_VERSION = 2;
export const DEFAULT_LLM_AI_MANDATE = "Play to the best of your capability and win the game.";
export const LLM_AI_THINKING_EFFORTS = Object.freeze([
  "provider-default", "none", "minimal", "low", "medium", "high", "xhigh", "max",
]);
export const LLM_AI_TOOL_PROTOCOLS = Object.freeze(["native", "structured"]);

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
  // Version-1 "auto" profiles silently changed protocols during a match. They
  // migrate to native and must be explicitly changed to the separate adapter.
  const requestedProtocol = input.toolProtocol ?? "native";
  const toolProtocol = requestedProtocol === "auto" ? "native" : requestedProtocol;
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
    routineObservationTokens: integerInRange(input.routineObservationTokens ?? 8_192,
      "Routine observation budget", 512, 65_536),
    toolResultTokens: integerInRange(input.toolResultTokens ?? 4_096,
      "Tool result budget", 256, 65_536),
    recentContextTokens: integerInRange(input.recentContextTokens ?? 20_000,
      "Recent context suffix", 1_024, 131_072),
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
    "Simulation time is authoritative: the engine runs at 30 logic frames per game-second. Use observation time.gameSeconds and time.sincePrevious to judge whether jobs, movement, scouting, income, or combat have had enough game time to progress.",
    "Act continuously until the authoritative game state reports victory, defeat, or cancellation. Never wait for approval and never claim an action happened unless its tool result confirms it.",
    "Operate only the assigned player. Treat fog of war, hidden entities, unavailable commands, resource limits, placement rules, and rejected actions as real constraints.",
    "GAME MODEL: This is a real-time base-building strategy game. Income pays for structures, units, and technology; prerequisites and sufficient power can gate what is available. Structures provide economy, power, technology, or production, while mobile units scout, fight, guard, and capture. Fog hides unobserved objects, and a contact handle alone does not imply an enemy; trust the owner field, threats, and objectives. Preserve the ability to earn, build, and produce while converting resources into forces. Only the authoritative outcome determines victory or defeat.",
    "You exclusively own strategic policy for this player. Classic strategic selection is disabled while your lease is active. The engine still executes accepted work orders, production queues, team completion, pathfinding, combat state machines, and deterministic commands.",
    "Use the semantic strategic tools deliberately: maintain income and power, expand production, scout, counter observed threats, assemble forces, assign missions, attack objectives, and recover from blocked jobs. Query bounded detail only when the compact routine observation does not answer a decision.",
    "Routine forces contain your and allied forces; threats separately contain currently visible enemy mobile combat forces. combat summarizes current numeric strength, confirmed attrition since the previous observation, and the local player's engine-scored cumulative combat record. facilities summarize your current base, jobs contain active or recent production/force work, missions identify active or recent squad orders, exact assigned/surviving membership, and their targets, and objectives are currently visible enemy structures with engine-derived roles. scoutingCoverage is persistent player-visible session memory: its row-major ?/s/r/v grid distinguishes cells never actually seen by this commander from stale, recent, and currently visible cells even when the map's engine shroud began explored. Build options include engine-derived roles and combatProfile metadata; use their target domains, preferred target classes, damage types, and range rather than guessing from opaque internal names. An enemy or allied lostContact delta means only that fog or visibility removed the contact; it does not prove destruction. Re-scout its lastKnownPosition or obtain authoritative terminal evidence before treating it as destroyed.",
    "Only a force summary with a non-null missionHandle can be passed to assign_mission; pass that value as assign_mission.squadHandle, not a descriptive force:* handle. Managed squads exclude builders and harvesters. Economic force summaries are deliberately not assignable through assign_mission; preserve them unless you intentionally move exact IDs with issue_order. Force archetypes are validated on request: query purpose force with readyOnly false, then use request_force to assemble a coherent engine-managed squad.",
    "Calls returned in one response execute sequentially in the listed order, but you receive all results only on the next planning turn. Chain calls only when later arguments are already known. assign_mission resolves every current non-economic member of its squad at execution time; units produced afterward are not assigned automatically. Compare a mission's survivingAssigned count with the current squad count before assuming reinforcements are participating.",
    "Use an objective's observable contact:N handle directly as assign_mission.targetHandle. Prefer direct target-handle missions/orders against a currently visible structure objective; use position attack-move when the exact target is no longer observable or you intentionally want to fight through a region. targetId N remains a lower-level equivalent of contact:N. When fog is the missing information, query_map_region with filter visibility returns row-major readable exploration rows; ? cells have never been explored, e cells were explored but are not currently visible, and v cells are visible now.",
    "Judge combat readiness from numeric force counts, damage, attrition, and objective progress rather than calling queued production or a small squad a large army. If repeated attacks trade poorly or feed reinforcements piecemeal, preserve the force with regroup or defend, rebuild, and then recommit. Respond to existential mobile threats, but normal matches end by eliminating enemy structures, not by chasing every transient contact.",
    "Planning priorities are memory, not engine work. Follow them with concrete production, force, or mission requests. If a ready-only build query is empty, inspect non-ready and validated-on-request options before concluding no action exists.",
    "A non-terminal match with no visible threats is not victory. Enemy structures may be objectives, and fog may require scouting before they can be observed. Continue making decisions until the authoritative outcome ends the match.",
    "Map-region queries are read-only terrain/shroud observations: they do not reveal fog and never return buildings. Engine-explored e cells may have been fogged since match start; use routine scoutingCoverage for persistent actual coverage, and discover currently visible buildings through routine objectives or inspect_entities.",
    "Prefer a short sequence of high-impact actions over repetitive polling. A wait is appropriate only while a confirmed action is progressing; do not spend consecutive turns waiting while the game is active and legal strategic, production, scouting, or combat actions remain. Re-observe after material tool results. If a tool fails, use the error to change the plan; do not repeat an identical invalid call indefinitely.",
    "Use only the supplied tools. Tool arguments are untrusted until the runtime validates them. A wait action means the current plan is progressing and the agent should wake on the next meaningful event or planning deadline.",
    `Tool protocol: ${toolProtocol}. Protocols never change automatically during a match. Keep private reasoning private; concise action notes may be recorded in the match session.`,
  ].join("\n\n");
}

export function conservativeLlmTokens(value, { tokenizer } = {}) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (typeof tokenizer === "function") {
    const exact = Number(tokenizer(serialized));
    if (Number.isInteger(exact) && exact >= 0) return exact;
  }
  const bytes = typeof TextEncoder === "function"
    ? new TextEncoder().encode(serialized).length : serialized.length * 2;
  return Math.ceil(bytes / 3) + 4;
}

export function approximateLlmTokens(messages, options = {}) {
  return conservativeLlmTokens(messages, options) + messages.length * 4;
}

export function estimateLlmRequestTokens(messages, tools, profile, options = {}) {
  return approximateLlmTokens(messages, options)
    + conservativeLlmTokens((tools || []).map(({ name, description, parameters }) =>
      ({ name, description, parameters })), options)
    + profile.responseTokens;
}

function conversationGroups(messages) {
  const groups = [];
  for (let index = 0; index < messages.length;) {
    const message = messages[index];
    if (message.role === "assistant" && Array.isArray(message.tool_calls)
      && message.tool_calls.length > 0) {
      const ids = new Set(message.tool_calls.map((call) => call.id));
      const group = [message];
      index += 1;
      while (index < messages.length && messages[index].role === "tool"
        && ids.has(messages[index].tool_call_id)) {
        group.push(messages[index]);
        index += 1;
      }
      groups.push(group);
      continue;
    }
    groups.push([message]);
    index += 1;
  }
  return groups;
}

function checkpointMessage(strategicState, priorSummary, omittedGroups) {
  const retainedPrior = priorSummary && typeof priorSummary === "object"
    ? Object.fromEntries(Object.entries(priorSummary).filter(([key]) => key !== "priorSummary"))
    : priorSummary || null;
  return {
    role: "system",
    content: `STRATEGIC CHECKPOINT\n${JSON.stringify({
      version: 1,
      omittedGroups,
      priorSummary: retainedPrior,
      ...strategicState,
    })}`,
  };
}

export function compactLlmConversation(messages, {
  contextSize,
  responseTokens,
  recentContextTokens = 20_000,
} = {}, {
  tools = [],
  strategicState = {},
  tokenizer,
  force = false,
} = {}) {
  const system = messages.slice(0, 1);
  const previousCheckpoint = messages.find((message, index) => index > 0
    && message.role === "system" && message.content?.startsWith("STRATEGIC CHECKPOINT\n"));
  let priorSummary = null;
  if (previousCheckpoint) {
    try { priorSummary = JSON.parse(previousCheckpoint.content.slice("STRATEGIC CHECKPOINT\n".length)); }
    catch { priorSummary = { unavailable: true }; }
  }
  const candidates = messages.slice(1).filter((message) => message !== previousCheckpoint);
  const currentEstimate = estimateLlmRequestTokens(messages, tools,
    { responseTokens }, { tokenizer });
  const hardLimit = contextSize;
  const triggerLimit = Math.floor(contextSize * 0.90);
  if (!force && currentEstimate <= triggerLimit) {
    return { messages: [...messages], compacted: false, estimatedTokens: currentEstimate };
  }

  const groups = conversationGroups(candidates);
  const retainedGroups = [];
  let suffixTokens = 0;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const cost = approximateLlmTokens(groups[index], { tokenizer });
    if (retainedGroups.length > 0 && suffixTokens + cost > recentContextTokens) break;
    retainedGroups.unshift(groups[index]);
    suffixTokens += cost;
  }
  let omittedGroups = groups.length - retainedGroups.length;
  let checkpoint = checkpointMessage(strategicState, priorSummary, omittedGroups);
  let compacted = [...system, checkpoint, ...retainedGroups.flat()];
  while (retainedGroups.length > 0
    && estimateLlmRequestTokens(compacted, tools, { responseTokens }, { tokenizer }) > hardLimit) {
    retainedGroups.shift();
    omittedGroups += 1;
    checkpoint = checkpointMessage(strategicState, priorSummary, omittedGroups);
    compacted = [...system, checkpoint, ...retainedGroups.flat()];
  }
  return {
    messages: compacted,
    compacted: true,
    omitted: candidates.length - retainedGroups.flat().length,
    omittedGroups,
    retainedMessages: retainedGroups.flat().length,
    estimatedTokens: estimateLlmRequestTokens(compacted, tools, { responseTokens }, { tokenizer }),
  };
}
