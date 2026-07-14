import {
  buildLlmAiSystemPrompt,
  compactLlmConversation,
  publicLlmAiProfile,
  redactLlmAiData,
} from "./llm-ai-profile.mjs";
import { completeLlmAiTurn, LlmAiProviderError } from "./llm-ai-openai-client.mjs";

function boundedJson(value, maximum = 128 * 1024) {
  const text = JSON.stringify(value ?? null);
  if (text.length <= maximum) return text;
  return JSON.stringify({
    truncated: true,
    originalCharacters: text.length,
    preview: text.slice(0, maximum),
  });
}

function defaultTerminal(observation) {
  const outcome = observation?.game?.outcome ?? observation?.outcome;
  return observation?.terminal === true
    || (typeof outcome === "string" && !["", "playing", "running", "unknown"].includes(outcome.toLowerCase()));
}

function defaultOutcome(observation) {
  return observation?.game?.outcome ?? observation?.outcome ?? null;
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(signal.reason);
    }, { once: true });
  });
}

export class LlmAiAgentRuntime {
  constructor({
    profile,
    tools,
    observe,
    store,
    complete = completeLlmAiTurn,
    cryptoImpl = globalThis.crypto,
    now = () => Date.now(),
    sleep = delay,
    isTerminal = defaultTerminal,
  }) {
    if (!profile?.id) throw new TypeError("Agent runtime requires a saved profile");
    if (!Array.isArray(tools) || tools.length === 0) throw new TypeError("Agent runtime requires tools");
    if (typeof observe !== "function") throw new TypeError("Agent runtime requires an observation function");
    if (!store) throw new TypeError("Agent runtime requires a session store");
    if (new Set(tools.map((tool) => tool.name)).size !== tools.length) throw new TypeError("Agent tool names must be unique");
    for (const tool of tools) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(tool.name) || typeof tool.execute !== "function") {
        throw new TypeError("Each agent tool requires a valid name and execute function");
      }
    }
    this.profile = profile;
    this.tools = tools;
    this.observe = observe;
    this.store = store;
    this.complete = complete;
    this.crypto = cryptoImpl;
    this.now = now;
    this.sleep = sleep;
    this.isTerminal = isTerminal;
    this.session = null;
    this.sequence = 0;
    this.messages = [];
    this.lastObservation = null;
    this.consecutiveFailures = 0;
  }

  async event(type, data = {}) {
    const event = {
      sessionId: this.session.id,
      sequence: ++this.sequence,
      timestamp: this.now(),
      type,
      data: redactLlmAiData(data, this.profile),
    };
    await this.store.appendEvent(event);
    return event;
  }

  async start(metadata = {}) {
    if (this.session) throw new Error("Agent runtime already started");
    const id = this.crypto?.randomUUID?.();
    if (!id) throw new TypeError("A secure session ID generator is unavailable");
    const startedAt = this.now();
    this.session = {
      schemaVersion: 1,
      id,
      profileId: this.profile.id,
      profileSnapshot: publicLlmAiProfile(this.profile),
      status: "running",
      startedAt,
      updatedAt: startedAt,
      endedAt: null,
      outcome: null,
      turns: 0,
      toolCalls: 0,
      failures: 0,
      totalTokens: 0,
      metadata,
    };
    await this.store.createSession(this.session);
    this.messages = [{ role: "system", content: buildLlmAiSystemPrompt(this.profile) }];
    await this.event("session.started", { profile: this.session.profileSnapshot, metadata });
    await this.captureObservation("match-start");
    if (this.isTerminal(this.lastObservation)) await this.finish("terminal-at-start");
    return this.session;
  }

  async captureObservation(reason) {
    const observation = await this.observe({ reason, session: this.session });
    this.lastObservation = observation;
    const content = `ENVIRONMENT OBSERVATION (${reason})\n${boundedJson(observation)}`;
    this.messages.push({ role: "user", content });
    await this.event("environment.observation", { reason, observation });
    return observation;
  }

  compactContext() {
    const compacted = compactLlmConversation(this.messages, this.profile);
    this.messages = compacted.messages;
    return compacted;
  }

  async executeTool(call, protocol) {
    const tool = this.tools.find((candidate) => candidate.name === call.name);
    if (!tool) throw new Error(`Unavailable tool ${call.name}`);
    await this.event("tool.called", {
      protocol,
      callId: call.id ?? null,
      name: call.name,
      arguments: call.arguments,
    });
    let result;
    try {
      if (typeof tool.validate === "function") tool.validate(call.arguments);
      result = await tool.execute(call.arguments, {
        session: this.session,
        observation: this.lastObservation,
      });
      await this.event("tool.result", {
        callId: call.id ?? null,
        name: call.name,
        ok: true,
        result,
      });
    } catch (error) {
      result = { ok: false, error: { code: error?.code || "tool_error", message: error?.message || String(error) } };
      await this.event("tool.result", {
        callId: call.id ?? null,
        name: call.name,
        ok: false,
        result,
      });
    }
    this.session.toolCalls += 1;
    return result;
  }

  async step({ signal } = {}) {
    if (!this.session) await this.start();
    if (this.session.status === "completed" || this.session.status === "failed" || this.session.status === "cancelled") {
      return { terminal: true, session: this.session };
    }
    const compaction = this.compactContext();
    if (compaction.compacted) await this.event("context.compacted", { omitted: compaction.omitted });
    let turn;
    try {
      turn = await this.complete(this.profile, this.messages, this.tools, { signal });
    } catch (error) {
      this.consecutiveFailures += 1;
      this.session.failures += 1;
      await this.event("model.error", {
        code: error?.code || "model_error",
        message: error?.message || String(error),
        retryable: error instanceof LlmAiProviderError ? error.retryable : false,
        consecutiveFailures: this.consecutiveFailures,
      });
      const exhausted = this.consecutiveFailures >= this.profile.maxConsecutiveFailures;
      if (exhausted && !this.profile.classicFallback) {
        await this.fail(error);
        throw error;
      }
      await this.store.updateSession(this.session.id, {
        status: exhausted ? "degraded" : "running",
        failures: this.session.failures,
      });
      return { terminal: false, error, degraded: exhausted };
    }
    this.consecutiveFailures = 0;
    this.session.turns += 1;
    this.session.totalTokens += turn.usage?.totalTokens || 0;
    await this.event("model.turn", {
      protocol: turn.protocol,
      compatibility: turn.compatibility || null,
      responseId: turn.responseId,
      latencyMs: turn.latencyMs,
      usage: turn.usage,
      finishReason: turn.finishReason,
      reasoningContent: turn.reasoningContent,
      action: turn.action || null,
      calls: turn.calls?.map(({ id, name, arguments: args }) => ({ id, name, arguments: args })) || [],
    });
    this.messages.push(turn.assistantMessage);

    let requestedFinish = false;
    if (turn.protocol === "native") {
      for (const call of turn.calls) {
        const result = await this.executeTool(call, turn.protocol);
        this.messages.push({ role: "tool", tool_call_id: call.id, content: boundedJson(result) });
      }
    } else if (turn.action.action === "tool") {
      const call = { id: null, name: turn.action.tool, arguments: turn.action.arguments };
      const result = await this.executeTool(call, turn.protocol);
      this.messages.push({
        role: "user",
        content: `ENVIRONMENT TOOL RESULT (${call.name})\n${boundedJson(result)}`,
      });
    } else if (turn.action.action === "finish") {
      requestedFinish = true;
    } else {
      await this.event("agent.waiting", { note: turn.action.note || "" });
    }

    await this.captureObservation("after-agent-turn");
    if (this.isTerminal(this.lastObservation)) {
      await this.finish("authoritative-outcome");
      return { terminal: true, session: this.session, turn };
    }
    if (requestedFinish) {
      await this.event("agent.finish_rejected", {
        reason: "authoritative game state is not terminal",
      });
      this.messages.push({
        role: "user",
        content: "ENVIRONMENT: finish rejected because the authoritative game state is not terminal. Continue playing.",
      });
    }
    this.session.status = "running";
    await this.store.updateSession(this.session.id, {
      status: this.session.status,
      turns: this.session.turns,
      toolCalls: this.session.toolCalls,
      failures: this.session.failures,
      totalTokens: this.session.totalTokens,
    });
    return { terminal: false, session: this.session, turn };
  }

  async run({ signal } = {}) {
    if (!this.session) await this.start();
    try {
      while (!signal?.aborted && !["completed", "failed", "cancelled"].includes(this.session.status)) {
        const result = await this.step({ signal });
        if (result.terminal) break;
        const failureDelay = result.error
          ? Math.min(30_000, this.profile.planningIntervalMs * (2 ** Math.min(this.consecutiveFailures, 4)))
          : this.profile.planningIntervalMs;
        await this.sleep(failureDelay, signal);
      }
      if (signal?.aborted && !["completed", "failed"].includes(this.session.status)) {
        await this.cancel(signal.reason?.message || "cancelled");
      }
    } catch (error) {
      if (signal?.aborted) await this.cancel(signal.reason?.message || "cancelled");
      else if (this.session.status !== "failed") await this.fail(error);
      if (!signal?.aborted) throw error;
    }
    return this.session;
  }

  async finish(reason) {
    const endedAt = this.now();
    this.session = {
      ...this.session,
      status: "completed",
      endedAt,
      updatedAt: endedAt,
      outcome: defaultOutcome(this.lastObservation),
    };
    await this.event("session.completed", { reason, outcome: this.session.outcome });
    await this.store.updateSession(this.session.id, this.session);
  }

  async fail(error) {
    const endedAt = this.now();
    this.session = { ...this.session, status: "failed", endedAt, updatedAt: endedAt };
    await this.event("session.failed", { code: error?.code || "runtime_error", message: error?.message || String(error) });
    await this.store.updateSession(this.session.id, this.session);
  }

  async cancel(reason = "cancelled") {
    const endedAt = this.now();
    this.session = { ...this.session, status: "cancelled", endedAt, updatedAt: endedAt };
    await this.event("session.cancelled", { reason });
    await this.store.updateSession(this.session.id, this.session);
  }
}
