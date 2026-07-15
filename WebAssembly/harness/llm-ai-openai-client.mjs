import {
  llmChatCompletionsUrl,
  llmModelsUrl,
  llmProviderMetadataUrl,
} from "./llm-ai-profile.mjs";

const MAX_ERROR_BODY = 4_096;
const DISCOVERY_TIMEOUT_MS = 30_000;
const SUPPLEMENTAL_METADATA_TIMEOUT_MS = 10_000;
const CONTEXT_FIELDS = Object.freeze(new Map([
  ["loaded_context_length", { priority: 100, label: "loaded context" }],
  ["context_length", { priority: 90, label: "context length" }],
  ["context_window", { priority: 90, label: "context window" }],
  ["max_context_length", { priority: 80, label: "maximum context" }],
  ["max_model_len", { priority: 80, label: "maximum model length" }],
  ["max_sequence_length", { priority: 80, label: "maximum sequence length" }],
  ["max_seq_len", { priority: 80, label: "maximum sequence length" }],
  ["n_ctx", { priority: 70, label: "runtime context" }],
  ["n_ctx_train", { priority: 60, label: "training context" }],
]));

export class LlmAiProviderError extends Error {
  constructor(message, {
    status = null,
    code = "provider_error",
    retryable = false,
    stage = null,
    checks = null,
  } = {}) {
    super(message);
    this.name = "LlmAiProviderError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.stage = stage;
    this.checks = checks;
  }
}

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("LLM request timed out", "TimeoutError"));
  }, timeoutMs);
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

function headers(profile) {
  const result = { "Content-Type": "application/json" };
  if (profile.apiKey) result.Authorization = `Bearer ${profile.apiKey}`;
  return result;
}

function requestTimeout(profile, maximum = DISCOVERY_TIMEOUT_MS) {
  const configured = Number(profile?.requestTimeoutMs);
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, maximum)
    : maximum;
}

function localNetworkRequestOptions(url) {
  if (globalThis.location?.protocol !== "https:") return {};
  try {
    return new URL(url).protocol === "http:" ? { targetAddressSpace: "local" } : {};
  } catch {
    return {};
  }
}

async function providerJson(fetchImpl, url, init, { timeoutMs, signal } = {}) {
  const timeout = withTimeout(signal, timeoutMs);
  let response;
  let text;
  try {
    response = await fetchImpl(url, {
      ...localNetworkRequestOptions(url),
      ...init,
      signal: timeout.signal,
    });
    text = await response.text();
  } catch (error) {
    if (timeout.timedOut()) {
      throw new LlmAiProviderError(`LLM request exceeded ${timeoutMs} ms`, {
        code: "timeout", retryable: true,
      });
    }
    if (timeout.signal.aborted) throw timeout.signal.reason ?? error;
    throw new LlmAiProviderError(`Could not reach LLM endpoint: ${error?.message || error}`, {
      code: "network_error", retryable: true,
    });
  } finally {
    timeout.dispose();
  }
  let json = null;
  try { json = text ? JSON.parse(text) : {}; } catch { /* reported below */ }
  if (!response.ok) {
    const message = json?.error?.message || json?.message || text.slice(0, MAX_ERROR_BODY)
      || `LLM endpoint returned HTTP ${response.status}`;
    throw new LlmAiProviderError(message, {
      status: response.status,
      code: json?.error?.code || "http_error",
      retryable: response.status === 408 || response.status === 409 || response.status === 429
        || response.status >= 500,
    });
  }
  if (json === null) {
    throw new LlmAiProviderError("LLM endpoint returned invalid JSON", {
      status: response.status, code: "invalid_json", retryable: true,
    });
  }
  return json;
}

function contextMetadata(value, source) {
  let best = null;
  const visit = (entry, path, depth) => {
    if (!entry || typeof entry !== "object" || depth > 5) return;
    for (const [key, child] of Object.entries(entry)) {
      const field = CONTEXT_FIELDS.get(key.toLowerCase());
      if (field) {
        const parsed = Number(child);
        if (Number.isInteger(parsed) && parsed >= 4_096 && parsed <= 2_097_152
          && (!best || field.priority > best.priority)) {
          best = {
            contextSize: parsed,
            contextSource: `${source} · ${field.label}`,
            contextField: [...path, key].join("."),
            priority: field.priority,
          };
        }
      }
      if (child && typeof child === "object") visit(child, [...path, key], depth + 1);
    }
  };
  visit(value, [], 0);
  if (!best) return null;
  const { priority: _priority, ...metadata } = best;
  return metadata;
}

function normalizedCapabilities(entry) {
  const values = Array.isArray(entry?.capabilities)
    ? entry.capabilities
    : Array.isArray(entry?.metadata?.capabilities) ? entry.metadata.capabilities : [];
  return [...new Set(values.filter((value) => typeof value === "string" && value.length <= 128))];
}

function normalizedModel(entry, source) {
  if (!entry || typeof entry.id !== "string" || !entry.id.trim()) return null;
  const context = contextMetadata(entry, source);
  const capabilities = normalizedCapabilities(entry);
  return {
    id: entry.id.trim(),
    ownedBy: typeof entry.owned_by === "string" ? entry.owned_by : null,
    state: typeof entry.state === "string" ? entry.state : null,
    capabilities,
    supportsTools: capabilities.some((capability) =>
      ["tool_use", "tools", "function_calling"].includes(capability.toLowerCase())) || null,
    contextSize: context?.contextSize ?? null,
    contextSource: context?.contextSource ?? null,
    contextField: context?.contextField ?? null,
  };
}

function mergeModelCatalog(primaryEntries, supplementalEntries) {
  const models = new Map();
  const merge = (entry, source) => {
    const model = normalizedModel(entry, source);
    if (!model) return;
    const current = models.get(model.id);
    if (!current) {
      models.set(model.id, model);
      return;
    }
    models.set(model.id, {
      ...current,
      ownedBy: current.ownedBy || model.ownedBy,
      state: model.state || current.state,
      capabilities: [...new Set([...current.capabilities, ...model.capabilities])],
      supportsTools: current.supportsTools || model.supportsTools || null,
      contextSize: model.contextSize ?? current.contextSize,
      contextSource: model.contextSource ?? current.contextSource,
      contextField: model.contextField ?? current.contextField,
    });
  };
  primaryEntries.forEach((entry) => merge(entry, "OpenAI models metadata"));
  supplementalEntries.forEach((entry) => merge(entry, "provider runtime metadata"));
  return [...models.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export async function discoverLlmAiModels(connection, {
  fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
  const startedAt = performance.now();
  let response;
  try {
    response = await providerJson(fetchImpl, llmModelsUrl(connection.endpoint), {
      method: "GET",
      headers: headers(connection),
    }, { timeoutMs: requestTimeout(connection), signal });
  } catch (error) {
    if (error instanceof LlmAiProviderError && !error.stage) error.stage = "reachability";
    throw error;
  }

  const primaryEntries = Array.isArray(response.data) ? response.data : [];
  let supplementalEntries = [];
  let metadataWarning = null;
  try {
    const supplemental = await providerJson(fetchImpl, llmProviderMetadataUrl(connection.endpoint), {
      method: "GET",
      headers: headers(connection),
    }, { timeoutMs: requestTimeout(connection, SUPPLEMENTAL_METADATA_TIMEOUT_MS), signal });
    supplementalEntries = Array.isArray(supplemental.data) ? supplemental.data : [];
  } catch (error) {
    if (signal?.aborted) throw error;
    metadataWarning = error?.message || String(error);
  }

  const models = mergeModelCatalog(primaryEntries, supplementalEntries);
  return {
    ok: true,
    models,
    reportedModels: models.map((model) => model.id),
    metadataAvailable: supplementalEntries.length > 0,
    metadataWarning,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

function requestBody(profile, messages, { stream = false, sessionId = null } = {}) {
  const body = {
    model: profile.model,
    messages,
    temperature: 0,
    max_tokens: profile.responseTokens,
  };
  if (stream) {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  if (/qwen/i.test(profile.model)) {
    if (profile.thinkingEffort !== "provider-default") {
      body.enable_thinking = !["none", "off"].includes(profile.thinkingEffort);
    }
  } else if (profile.thinkingEffort !== "provider-default") {
    body.reasoning_effort = profile.thinkingEffort;
  }
  if (sessionId && /(^|\.)api\.openai\.com$/i.test(new URL(profile.endpoint).hostname)) {
    body.prompt_cache_key = sessionId.slice(0, 64);
  }
  return body;
}

function chatTools(tools) {
  return tools.map(({ name, description, parameters }) => ({
    type: "function",
    function: {
      name,
      description,
      parameters,
    },
  }));
}

export function buildLlmAiChatRequest(profile, messages, tools, {
  protocol = profile.toolProtocol,
  sessionId = null,
} = {}) {
  if (protocol === "structured") {
    return {
      ...requestBody(profile, [...messages, structuredProtocolMessage(tools)], { sessionId }),
      response_format: structuredSchema(tools),
    };
  }
  return {
    ...requestBody(profile, messages, { stream: true, sessionId }),
    tools: chatTools(tools),
  };
}

function usageFrom(response) {
  const usage = response?.usage || {};
  return {
    promptTokens: usage.prompt_tokens ?? null,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
  };
}

function extractJsonObject(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(unfenced); } catch { /* try a bounded object below */ }
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(unfenced.slice(first, last + 1)); } catch { return null; }
}

function structuredSchema(tools) {
  return {
    type: "json_schema",
    json_schema: {
      name: "zero_hour_agent_action",
      schema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["tool", "wait", "finish"] },
          tool: { type: "string", enum: ["", ...tools.map((tool) => tool.name)] },
          arguments: { type: "object" },
          note: { type: "string" },
        },
        required: ["action", "tool", "arguments", "note"],
        additionalProperties: false,
      },
    },
  };
}

function structuredProtocolMessage(tools) {
  return {
    role: "system",
    content: [
      "COMPATIBILITY TOOL PROTOCOL: Return one JSON object with action=tool|wait|finish, tool, arguments, and a short note.",
      "For action=tool, tool must be one listed below and arguments must match its schema. For wait or finish use an empty tool and empty arguments.",
      "A finish request is advisory; the runtime accepts it only after authoritative terminal game state.",
      ...tools.map((tool) => `${tool.name}: ${tool.description}\narguments=${JSON.stringify(tool.parameters)}`),
    ].join("\n\n"),
  };
}

function validateStructuredAction(value, tools) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LlmAiProviderError("Model did not return a structured agent action", {
      code: "invalid_action", retryable: true,
    });
  }
  const action = value.action;
  if (!["tool", "wait", "finish"].includes(action)) {
    throw new LlmAiProviderError("Model returned an unknown agent action", {
      code: "invalid_action", retryable: true,
    });
  }
  const tool = typeof value.tool === "string" ? value.tool : "";
  const args = value.arguments;
  if (action === "tool" && !tools.some((candidate) => candidate.name === tool)) {
    throw new LlmAiProviderError(`Model requested unavailable tool ${tool || "(empty)"}`, {
      code: "unknown_tool", retryable: true,
    });
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new LlmAiProviderError("Model tool arguments must be a JSON object", {
      code: "invalid_arguments", retryable: true,
    });
  }
  return {
    action,
    tool,
    arguments: args,
    note: typeof value.note === "string" ? value.note.slice(0, 2_048) : "",
  };
}

async function createCompletion(profile, body, { fetchImpl, signal }) {
  const startedAt = performance.now();
  const response = await providerJson(fetchImpl, llmChatCompletionsUrl(profile.endpoint), {
    method: "POST",
    headers: headers(profile),
    body: JSON.stringify(body),
  }, { timeoutMs: profile.requestTimeoutMs, signal });
  return { response, latencyMs: Math.round(performance.now() - startedAt) };
}

function providerErrorCode(message, status, fallback = "http_error") {
  if (status === 413 || /context (?:length|window)|too many tokens|maximum.*tokens/i.test(message)) {
    return "context_overflow";
  }
  return fallback;
}

function applyStreamChunk(accumulator, chunk) {
  if (typeof chunk?.id === "string") accumulator.id ||= chunk.id;
  if (chunk?.usage) accumulator.usage = chunk.usage;
  const choice = Array.isArray(chunk?.choices) ? chunk.choices[0] : null;
  if (!choice) return;
  if (choice.finish_reason) accumulator.finishReason = choice.finish_reason;
  const delta = choice.delta || {};
  if (typeof delta.content === "string") accumulator.content += delta.content;
  for (const field of ["reasoning_content", "reasoning", "reasoning_text"]) {
    if (typeof delta[field] === "string" && delta[field]) {
      accumulator.reasoningContent += delta[field];
      break;
    }
  }
  for (const toolDelta of delta.tool_calls || []) {
    const index = Number.isInteger(toolDelta.index) ? toolDelta.index : accumulator.toolCalls.size;
    const call = accumulator.toolCalls.get(index) || {
      id: "", type: "function", function: { name: "", arguments: "" },
    };
    if (toolDelta.id) call.id = toolDelta.id;
    if (toolDelta.type) call.type = toolDelta.type;
    if (toolDelta.function?.name) call.function.name += toolDelta.function.name;
    if (toolDelta.function?.arguments) call.function.arguments += toolDelta.function.arguments;
    accumulator.toolCalls.set(index, call);
  }
}

export async function parseLlmAiCompletionStream(response, { signal } = {}) {
  if (!response?.body?.getReader) throw new LlmAiProviderError("LLM streaming response has no readable body", {
    code: "missing_stream", retryable: true,
  });
  const accumulator = {
    id: null, content: "", reasoningContent: "", finishReason: null,
    usage: null, toolCalls: new Map(),
  };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const consumeEvent = (event) => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let chunk;
    try { chunk = JSON.parse(data); } catch {
      throw new LlmAiProviderError("LLM endpoint emitted invalid streaming JSON", {
        code: "invalid_stream", retryable: true,
      });
    }
    applyStreamChunk(accumulator, chunk);
  };
  while (true) {
    if (signal?.aborted) throw signal.reason || new Error("Request aborted");
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const event of events) consumeEvent(event);
    if (done) break;
  }
  if (buffer.trim()) consumeEvent(buffer);
  return {
    id: accumulator.id,
    choices: [{
      finish_reason: accumulator.finishReason,
      message: {
        role: "assistant", content: accumulator.content || null,
        reasoning_content: accumulator.reasoningContent || undefined,
        tool_calls: [...accumulator.toolCalls.entries()].sort((left, right) => left[0] - right[0]).map((entry) => entry[1]),
      },
    }],
    usage: accumulator.usage,
  };
}

async function createStreamingCompletion(profile, body, { fetchImpl, signal }) {
  const startedAt = performance.now();
  const timeout = withTimeout(signal, profile.requestTimeoutMs);
  try {
    const response = await fetchImpl(llmChatCompletionsUrl(profile.endpoint), {
      ...localNetworkRequestOptions(llmChatCompletionsUrl(profile.endpoint)),
      method: "POST", headers: headers(profile), body: JSON.stringify(body), signal: timeout.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* bounded text below */ }
      const message = json?.error?.message || json?.message || text.slice(0, MAX_ERROR_BODY)
        || `LLM endpoint returned HTTP ${response.status}`;
      throw new LlmAiProviderError(message, {
        status: response.status, code: providerErrorCode(message, response.status, json?.error?.code),
        retryable: response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
      });
    }
    const parsed = await parseLlmAiCompletionStream(response, { signal: timeout.signal });
    return { response: parsed, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    if (timeout.timedOut()) {
      error = new LlmAiProviderError(`LLM request exceeded ${profile.requestTimeoutMs} ms`, {
        code: "timeout", retryable: true,
      });
    } else if (!(error instanceof LlmAiProviderError) && !timeout.signal.aborted) {
      error = new LlmAiProviderError(`Could not reach LLM endpoint: ${error?.message || error}`, {
        code: "network_error", retryable: true,
      });
    }
    error.latencyMs = Math.round(performance.now() - startedAt);
    throw error;
  } finally {
    timeout.dispose();
  }
}

async function structuredCompletion(profile, messages, tools, options) {
  const body = buildLlmAiChatRequest(profile, messages, tools, {
    protocol: "structured", sessionId: options.sessionId,
  });
  const { response, latencyMs } = await createCompletion(profile, body, options);
  const message = response?.choices?.[0]?.message;
  if (!message) throw new LlmAiProviderError("LLM response has no assistant message", {
    code: "missing_message", retryable: true,
  });
  const raw = message.content || message.reasoning_content || "";
  const action = validateStructuredAction(extractJsonObject(raw), tools);
  return {
    protocol: "structured",
    action,
    assistantMessage: { role: "assistant", content: JSON.stringify(action) },
    reasoningContent: message.reasoning_content || "",
    finishReason: response.choices[0].finish_reason || null,
    usage: usageFrom(response),
    latencyMs,
    responseId: response.id || null,
  };
}

export async function completeLlmAiTurn(profile, messages, tools, {
  fetchImpl = globalThis.fetch,
  signal,
  sessionId = null,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
  if (!Array.isArray(tools) || tools.length === 0) throw new TypeError("At least one agent tool is required");
  if (profile.toolProtocol === "structured") {
    return structuredCompletion(profile, messages, tools, { fetchImpl, signal, sessionId });
  }
  const body = buildLlmAiChatRequest(profile, messages, tools, { protocol: "native", sessionId });
  const { response, latencyMs } = await createStreamingCompletion(profile, body, { fetchImpl, signal });
  const message = response?.choices?.[0]?.message;
  if (!message) throw new LlmAiProviderError("LLM response has no assistant message", {
    code: "missing_message", retryable: true,
  });
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    const calls = message.tool_calls.map((call) => {
      if (typeof call?.id !== "string" || !call.id) {
        throw new LlmAiProviderError("Model returned a tool call without an ID", {
          code: "invalid_tool_call", retryable: true,
        });
      }
      const name = call?.function?.name;
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new LlmAiProviderError(`Model requested unavailable tool ${name || "(empty)"}`, {
        code: "unknown_tool", retryable: true,
      });
      let args;
      try { args = JSON.parse(call.function.arguments || "{}"); } catch {
        throw new LlmAiProviderError(`Model returned invalid JSON arguments for ${name}`, {
          code: "invalid_arguments", retryable: true,
        });
      }
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new LlmAiProviderError(`Model arguments for ${name} must be an object`, {
          code: "invalid_arguments", retryable: true,
        });
      }
      return { id: call.id, name, arguments: args };
    });
    return {
      protocol: "native",
      calls,
      assistantMessage: {
        role: "assistant",
        content: message.content || null,
        ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
        tool_calls: message.tool_calls,
      },
      reasoningContent: message.reasoning_content || "",
      finishReason: response.choices[0].finish_reason || null,
      usage: usageFrom(response),
      latencyMs,
      responseId: response.id || null,
    };
  }
  const error = new LlmAiProviderError("Model did not emit a native tool call; this profile never switches protocols automatically", {
    code: "missing_tool_call", retryable: true,
  });
  error.latencyMs = latencyMs;
  throw error;
}

export async function probeLlmAiEndpoint(profile, {
  fetchImpl = globalThis.fetch,
  signal,
  deep = true,
  probeId,
  cryptoImpl = globalThis.crypto,
} = {}) {
  const startedAt = performance.now();
  const discovery = await discoverLlmAiModels(profile, { fetchImpl, signal });
  const modelInfo = discovery.models.find((model) => model.id === profile.model) || null;
  const modelAvailable = discovery.models.length === 0 || Boolean(modelInfo);
  const checks = [{
    id: "reachability",
    status: "pass",
    label: "Endpoint reachable",
    detail: `Model discovery responded in ${discovery.latencyMs} ms.`,
  }];
  if (!modelAvailable) {
    throw new LlmAiProviderError(`Configured model was not reported by the endpoint (${discovery.models.length} available)`, {
      code: "model_unavailable",
      retryable: false,
      stage: "model",
      checks: [...checks, {
        id: "model",
        status: "fail",
        label: "Model unavailable",
        detail: `${profile.model} is not present in the provider catalog.`,
      }],
    });
  }
  checks.push({
      id: "model",
      status: "pass",
      label: "Model available",
      detail: discovery.models.length > 0
        ? `${profile.model} is present in a catalog of ${discovery.models.length}.`
        : "The provider returned an empty catalog and accepted the configured model name.",
    }, {
      id: "context",
      status: modelInfo?.contextSize ? "pass" : "info",
      label: modelInfo?.contextSize ? "Context detected" : "Context not reported",
      detail: modelInfo?.contextSize
        ? `${modelInfo.contextSize.toLocaleString()} tokens from ${modelInfo.contextSource}.`
        : "Keep the configured context value unless the provider documents another limit.",
    });
  let protocol = "models-only";
  let compatibility = null;
  if (deep) {
    const expectedProbe = typeof probeId === "string" && probeId
      ? probeId
      : cryptoImpl?.randomUUID?.() || `probe-${Date.now()}-${Math.round(performance.now())}`;
    const probeTool = {
      name: "report_ready",
      description: "Confirm that the endpoint received this exact diagnostic query and can call an agent tool.",
      parameters: {
        type: "object",
        properties: {
          ready: { type: "boolean", description: "Must be true." },
          probe: {
            type: "string",
            enum: [expectedProbe],
            description: "Return the exact one-time diagnostic probe value.",
          },
        },
        required: ["ready", "probe"],
        additionalProperties: false,
      },
    };
    let turn;
    try {
      turn = await completeLlmAiTurn(profile, [
        {
          role: "system",
          content: `This is an endpoint compatibility probe. Use report_ready with ready=true and probe=${JSON.stringify(expectedProbe)}.`,
        },
        { role: "user", content: "ENVIRONMENT: run the exact compatibility tool probe now." },
      ], [probeTool], { fetchImpl, signal });
    } catch (error) {
      if (error instanceof LlmAiProviderError) {
        if (!error.stage) error.stage = "query";
        error.checks = [...checks, {
          id: error.stage,
          status: "fail",
          label: error.stage === "tool" ? "Tool call failed" : "Test query failed",
          detail: error.message,
        }];
      }
      throw error;
    }
    const probeArguments = turn.protocol === "native"
      ? turn.calls?.find((call) => call.name === probeTool.name)?.arguments
      : turn.action?.tool === probeTool.name ? turn.action.arguments : null;
    if (probeArguments?.ready !== true || probeArguments?.probe !== expectedProbe) {
      throw new LlmAiProviderError("Model did not return the exact requested diagnostic tool arguments", {
        code: "tool_probe_failed",
        retryable: false,
        stage: "tool",
        checks: [...checks, {
          id: "query",
          status: "pass",
          label: "Test query completed",
          detail: `The chat completion returned in ${turn.latencyMs ?? 0} ms.`,
        }, {
          id: "tool",
          status: "fail",
          label: "Exact tool call failed",
          detail: "The returned tool arguments did not contain the one-time probe value.",
        }],
      });
    }
    protocol = turn.protocol;
    compatibility = turn.compatibility;
    checks.push({
      id: "query",
      status: "pass",
      label: "Test query completed",
      detail: `The chat completion returned in ${turn.latencyMs ?? 0} ms.`,
    }, {
      id: "tool",
      status: "pass",
      label: "Exact tool call verified",
      detail: protocol === "structured"
        ? "The separately selected structured adapter returned the one-time probe."
        : "The model echoed the one-time probe through a native function call.",
    });
  }
  return {
    ok: true,
    model: profile.model,
    reportedModels: discovery.reportedModels,
    models: discovery.models,
    modelInfo,
    contextSize: modelInfo?.contextSize ?? null,
    contextSource: modelInfo?.contextSource ?? null,
    protocol,
    compatibility,
    checks,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}
