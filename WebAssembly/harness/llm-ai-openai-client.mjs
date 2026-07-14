import {
  llmChatCompletionsUrl,
  llmModelsUrl,
} from "./llm-ai-profile.mjs";

const MAX_ERROR_BODY = 4_096;

export class LlmAiProviderError extends Error {
  constructor(message, { status = null, code = "provider_error", retryable = false } = {}) {
    super(message);
    this.name = "LlmAiProviderError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
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

async function providerJson(fetchImpl, url, init, { timeoutMs, signal } = {}) {
  const timeout = withTimeout(signal, timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: timeout.signal });
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
  const text = await response.text();
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

function requestBody(profile, messages) {
  const body = {
    model: profile.model,
    messages,
    temperature: 0,
    max_tokens: profile.responseTokens,
  };
  if (profile.thinkingEffort !== "provider-default") {
    body.reasoning_effort = profile.thinkingEffort;
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
      strict: false,
    },
  }));
}

function usageFrom(response) {
  const usage = response?.usage || {};
  return {
    promptTokens: usage.prompt_tokens ?? null,
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
      strict: false,
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

async function structuredCompletion(profile, messages, tools, options, compatibility = null) {
  const body = {
    ...requestBody(profile, [...messages, structuredProtocolMessage(tools)]),
    response_format: structuredSchema(tools),
  };
  const { response, latencyMs } = await createCompletion(profile, body, options);
  const message = response?.choices?.[0]?.message;
  if (!message) throw new LlmAiProviderError("LLM response has no assistant message", {
    code: "missing_message", retryable: true,
  });
  const raw = message.content || message.reasoning_content || "";
  const action = validateStructuredAction(extractJsonObject(raw), tools);
  return {
    protocol: "structured",
    compatibility,
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
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
  if (!Array.isArray(tools) || tools.length === 0) throw new TypeError("At least one agent tool is required");
  if (profile.toolProtocol === "structured") {
    return structuredCompletion(profile, messages, tools, { fetchImpl, signal });
  }
  const body = {
    ...requestBody(profile, messages),
    tools: chatTools(tools),
    tool_choice: "required",
    parallel_tool_calls: false,
  };
  const { response, latencyMs } = await createCompletion(profile, body, { fetchImpl, signal });
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
        content: message.content || "",
        tool_calls: message.tool_calls,
      },
      reasoningContent: message.reasoning_content || "",
      finishReason: response.choices[0].finish_reason || null,
      usage: usageFrom(response),
      latencyMs,
      responseId: response.id || null,
    };
  }
  if (profile.toolProtocol === "native") {
    throw new LlmAiProviderError("Model did not emit a native tool call", {
      code: "missing_tool_call", retryable: true,
    });
  }
  return structuredCompletion(profile, messages, tools, { fetchImpl, signal }, {
    reason: "native_tool_calls_missing",
    reasoningContent: message.reasoning_content || "",
    firstResponseId: response.id || null,
    firstLatencyMs: latencyMs,
  });
}

export async function probeLlmAiEndpoint(profile, {
  fetchImpl = globalThis.fetch,
  signal,
  deep = true,
} = {}) {
  const startedAt = performance.now();
  const response = await providerJson(fetchImpl, llmModelsUrl(profile.endpoint), {
    method: "GET",
    headers: headers(profile),
  }, { timeoutMs: profile.requestTimeoutMs, signal });
  const models = Array.isArray(response.data) ? response.data.map((entry) => entry?.id).filter(Boolean) : [];
  const modelAvailable = models.length === 0 || models.includes(profile.model);
  if (!modelAvailable) {
    throw new LlmAiProviderError(`Configured model was not reported by the endpoint (${models.length} available)`, {
      code: "model_unavailable", retryable: false,
    });
  }
  let protocol = "models-only";
  let compatibility = null;
  if (deep) {
    const probeTool = {
      name: "report_ready",
      description: "Confirm that the agent tool protocol is operational.",
      parameters: {
        type: "object",
        properties: { ready: { type: "boolean" } },
        required: ["ready"],
        additionalProperties: false,
      },
    };
    const turn = await completeLlmAiTurn(profile, [
      { role: "system", content: "This is an endpoint compatibility probe. Use report_ready with ready=true." },
      { role: "user", content: "ENVIRONMENT: run the compatibility probe now." },
    ], [probeTool], { fetchImpl, signal });
    const probeArguments = turn.protocol === "native"
      ? turn.calls?.find((call) => call.name === probeTool.name)?.arguments
      : turn.action?.tool === probeTool.name ? turn.action.arguments : null;
    if (probeArguments?.ready !== true) {
      throw new LlmAiProviderError("Model did not confirm the requested tool call", {
        code: "tool_probe_failed", retryable: false,
      });
    }
    protocol = turn.protocol;
    compatibility = turn.compatibility;
  }
  return {
    ok: true,
    model: profile.model,
    reportedModels: models,
    protocol,
    compatibility,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}
