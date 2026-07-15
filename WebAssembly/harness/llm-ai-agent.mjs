import {
  buildLlmAiSystemPrompt,
  compactLlmConversation,
  publicLlmAiProfile,
  redactLlmAiData,
} from "./llm-ai-profile.mjs";
import { completeLlmAiTurn, LlmAiProviderError } from "./llm-ai-openai-client.mjs";
import { boundLlmPayload } from "./llm-ai-strategy.mjs";

const INFORMATIONAL_TOOLS = new Set([
  "set_priorities", "query_buildable_options", "inspect_entities", "inspect_job", "query_map_region", "wait_for_tick",
]);
const ACTIVE_JOB_STATES = new Set(["queued", "assembling", "moving", "engaged"]);
const PROVIDER_CONTRACT_ERRORS = new Set([
  "invalid_action", "invalid_arguments", "invalid_json", "invalid_stream", "invalid_tool_call",
  "missing_message", "missing_stream", "missing_tool_call", "unknown_tool",
]);
const RECOVERY_THRESHOLD = 2;

function boundedJson(value, maximumTokens = 4_096, tokenizer = null) {
  return JSON.stringify(boundLlmPayload(value, maximumTokens, { tokenizer }).value);
}

function defaultTerminal(observation) {
  const outcome = observation?.game?.outcome ?? observation?.outcome;
  return observation?.terminal === true
    || (typeof outcome === "string" && !["", "playing", "running", "unknown"].includes(outcome.toLowerCase()));
}

function defaultOutcome(observation) {
  return observation?.game?.outcome ?? observation?.outcome ?? null;
}

function isContextOverflow(error) {
  return error?.code === "context_overflow" || error?.status === 413
    || /context (?:length|window)|too many tokens|maximum.*tokens/i.test(error?.message || "");
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const abort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
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
    getStrategicState = () => ({}),
    transferToClassic = null,
    tokenizer = null,
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
    this.getStrategicState = getStrategicState;
    this.transferToClassic = transferToClassic;
    this.tokenizer = tokenizer;
    this.session = null;
    this.sequence = 0;
    this.messages = [];
    this.lastObservation = null;
    this.consecutiveFailures = 0;
    this.failedToolSignatures = new Map();
    this.actionFailureStreak = 0;
    this.nonActionStreak = 0;
    this.lastFailedActionTool = null;
    this.observedOutcome = null;
    this.authoritativeOutcome = null;
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
      providerRequests: 0,
      providerLatencyMs: 0,
      cachedTokens: 0,
      cacheHitRequests: 0,
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
    const bounded = boundLlmPayload(observation, this.profile.routineObservationTokens, {
      tokenizer: this.tokenizer, handle: `observation:${this.sequence + 1}`,
    });
    this.lastObservation = bounded.value;
    const content = `ENVIRONMENT OBSERVATION (${reason})\n${JSON.stringify(bounded.value)}`;
    this.messages.push({ role: "user", content });
    await this.event("environment.observation", { reason, observation: bounded.value, budget: bounded.budget });
    const outcome = bounded.value?.game?.outcome ?? bounded.value?.outcome ?? null;
    if (this.isTerminal(bounded.value) && outcome !== this.observedOutcome) {
      this.observedOutcome = outcome;
      await this.event("match.outcome", {
        authoritative: true, outcome, frame: bounded.value?.frame ?? null,
      });
    }
    if (reason === "after-agent-turn") {
      await this.event("engine.reaction", {
        frame: bounded.value?.frame ?? null,
        outcome: bounded.value?.game?.outcome ?? null,
        deltas: bounded.value?.deltas ?? [],
        missions: bounded.value?.missions ?? [],
        production: bounded.value?.production ?? [],
      });
    }
    return bounded.value;
  }

  async finishIfTerminal(reason) {
    try {
      await this.captureObservation(reason);
    } catch (error) {
      await this.event("environment.error", {
        reason,
        code: error?.code || "observation_error",
        message: error?.message || String(error),
      });
      return false;
    }
    if (!this.isTerminal(this.lastObservation)) return false;
    await this.finish(reason);
    return true;
  }

  setAuthoritativeOutcome({ outcome, frame = null, endFrame = null, strategy = null } = {}) {
    if (!new Set(["victory", "defeat", "ended"]).has(String(outcome).toLowerCase())) {
      throw new TypeError("Authoritative outcome must be victory, defeat, or ended");
    }
    this.authoritativeOutcome = {
      outcome: String(outcome).toLowerCase(), frame, endFrame, strategy,
    };
  }

  async finishAuthoritativeOutcome(reason = "authoritative-match-state") {
    if (!this.authoritativeOutcome || this.session?.status === "completed") return false;
    const evidence = this.authoritativeOutcome;
    this.lastObservation = {
      ...(this.lastObservation || {}),
      frame: evidence.frame ?? evidence.endFrame ?? this.lastObservation?.frame ?? null,
      terminal: true,
      game: { ...(this.lastObservation?.game || {}), outcome: evidence.outcome,
        endFrame: evidence.endFrame ?? this.lastObservation?.game?.endFrame ?? null },
    };
    if (this.observedOutcome !== evidence.outcome) {
      this.observedOutcome = evidence.outcome;
      await this.event("match.outcome", {
        authoritative: true, source: "assignment-state", ...evidence,
      });
    }
    await this.finish(reason);
    return true;
  }

  compactContext({ force = false } = {}) {
    const compacted = compactLlmConversation(this.messages, this.profile, {
      tools: this.tools,
      strategicState: this.getStrategicState(),
      tokenizer: this.tokenizer,
      force,
    });
    this.messages = compacted.messages;
    return compacted;
  }

  recordToolOutcome(name, ok) {
    if (INFORMATIONAL_TOOLS.has(name)) {
      if (ok) this.nonActionStreak += 1;
      return;
    }
    this.nonActionStreak = 0;
    if (ok) {
      this.actionFailureStreak = 0;
      this.lastFailedActionTool = null;
      this.failedToolSignatures.clear();
      return;
    }
    this.actionFailureStreak += 1;
    this.lastFailedActionTool = name;
  }

  toolFailureStateKey() {
    const observation = this.lastObservation || {};
    return JSON.stringify({
      catalogRevision: observation.catalogRevision ?? null,
      money: observation.economy?.money ?? null,
      powerSufficient: observation.economy?.powerSufficient ?? null,
      forces: (observation.forces || []).map((force) => [
        force.handle, force.count, force.missionHandle,
      ]),
      objectives: (observation.objectives || []).map((objective) => [
        objective.handle, objective.health,
      ]),
      commands: (observation.commands || []).map((command) => [
        command.sourceId, command.command, command.ready,
      ]),
      production: (observation.production || []).map((facility) => [
        facility.facility,
        (facility.queue || []).map((entry) => [entry.name, entry.progress]),
      ]),
    });
  }

  recoveryToolSet() {
    const recoveryRequired = this.actionFailureStreak >= RECOVERY_THRESHOLD
      || this.nonActionStreak >= RECOVERY_THRESHOLD;
    if (!recoveryRequired) return { tools: this.tools, recoveryRequired: false };
    const needsSearch = this.nonActionStreak >= RECOVERY_THRESHOLD
      && Array.isArray(this.lastObservation?.threats)
      && this.lastObservation.threats.length === 0
      && !this.isTerminal(this.lastObservation);
    if (needsSearch) {
      return {
        tools: this.tools.filter((tool) => tool.name !== "wait_for_tick"),
        recoveryRequired: true,
        reason: "find-remaining-objective",
      };
    }
    const recoveryTools = this.tools.filter((tool) =>
      !["set_priorities", "wait_for_tick"].includes(tool.name));
    return {
      tools: recoveryTools,
      recoveryRequired: true,
      reason: "require-gameplay-action",
    };
  }

  async requireRecovery(tools, reason) {
    const recovery = {
      reason,
      actionFailureStreak: this.actionFailureStreak,
      nonActionStreak: this.nonActionStreak,
      lastFailedTool: this.lastFailedActionTool,
      toolsAvailableThisTurn: tools.map((tool) => tool.name),
      catalogRevision: this.lastObservation?.catalogRevision ?? null,
      activeMissions: (this.lastObservation?.missions ?? [])
        .filter((mission) => ACTIVE_JOB_STATES.has(mission.state)),
    };
    this.messages.push({
      role: "user",
      content: `ENVIRONMENT RECOVERY REQUIRED\n${boundedJson(recovery, this.profile.routineObservationTokens, this.tokenizer)}\n${reason === "find-remaining-objective"
        ? "The match is non-terminal with no visible threat. Do not wait. Use an allowed detail query or send a surviving squad to scout a distinct map region, then attack any discovered structure objective."
        : "Issue a materially different gameplay action now. Use an available detail query first when a current stable handle is missing; do not guess identifiers or repeat rejected arguments. The failed action type remains available with changed arguments or after relevant world state changes."}\nOnly toolsAvailableThisTurn are currently permitted. Detail queries do not clear this restriction; include a successful gameplay action.`,
    });
    await this.event("agent.recovery_required", recovery);
  }

  async requireProviderCorrection(error) {
    if (!PROVIDER_CONTRACT_ERRORS.has(error?.code)) return;
    const correction = {
      rejectedResponse: { code: error.code, message: error.message || String(error) },
      requiredProtocol: this.profile.toolProtocol,
      availableTools: this.tools.map((tool) => tool.name),
    };
    this.messages.push({
      role: "user",
      content: `ENVIRONMENT PROVIDER RESPONSE REJECTED\n${boundedJson(correction,
        Math.min(this.profile.toolResultTokens, 1_024), this.tokenizer)}\nReturn a valid ${this.profile.toolProtocol} tool call on the next response. Do not answer with prose alone.`,
    });
    await this.event("model.correction_requested", correction);
  }

  async executeTool(call, protocol, allowedTools = this.tools) {
    const tool = this.tools.find((candidate) => candidate.name === call.name);
    if (!tool) throw new Error(`Unavailable tool ${call.name}`);
    await this.event("tool.called", {
      protocol,
      callId: call.id ?? null,
      name: call.name,
      arguments: call.arguments,
    });
    const signature = JSON.stringify([call.name, call.arguments]);
    const failureStateKey = this.toolFailureStateKey();
    const previousFailure = this.failedToolSignatures.get(signature);
    if (previousFailure && previousFailure.stateKey !== failureStateKey) {
      this.failedToolSignatures.delete(signature);
    }
    const allowed = allowedTools.some((candidate) => candidate.name === call.name);
    let result;
    let eventExtra = {};
    if (!allowed) {
      result = {
        ok: false,
        error: {
          code: "recovery_tool_unavailable",
          message: `${call.name} is temporarily unavailable during action recovery. Choose one of: ${allowedTools.map((candidate) => candidate.name).join(", ")}.`,
        },
      };
      eventExtra = { recoveryRestriction: true };
    } else if (this.failedToolSignatures.has(signature)) {
      const repeatedFailure = this.failedToolSignatures.get(signature);
      repeatedFailure.repetitions += 1;
      result = {
        ok: false,
        error: {
          code: "repeated_invalid_action",
          message: `This exact call already failed with ${repeatedFailure.code} in the current observed state. Change the arguments, query current state, or wait for a relevant state change.`,
        },
      };
      eventExtra = { blockedRepeat: repeatedFailure.repetitions };
    } else {
      try {
        if (typeof tool.validate === "function") tool.validate(call.arguments);
        result = await tool.execute(call.arguments, {
          session: this.session,
          observation: this.lastObservation,
        });
      } catch (error) {
        result = { ok: false, error: { code: error?.code || "tool_error", message: error?.message || String(error) } };
      }
    }
    const rawOk = result?.ok !== false && !result?.error;
    if (!rawOk && !eventExtra.recoveryRestriction && !eventExtra.blockedRepeat) {
      this.failedToolSignatures.set(signature, {
        code: result?.error?.code || "tool_error", repetitions: 1, stateKey: failureStateKey,
      });
    }
    const bounded = boundLlmPayload(result, this.profile.toolResultTokens, {
      tokenizer: this.tokenizer, handle: `tool-result:${call.id || this.session.toolCalls + 1}`,
    });
    result = bounded.value;
    const ok = result?.ok !== false && !result?.error;
    await this.event("tool.result", {
      callId: call.id ?? null, name: call.name, ok, result, budget: bounded.budget, ...eventExtra,
    });
    const execution = {
      callId: call.id ?? null, name: call.name, ok,
      jobId: result?.job?.id ?? result?.mission?.id ?? result?.jobId ?? null,
      state: result?.job?.state ?? result?.mission?.state ?? result?.state ?? null,
      error: result?.error ?? null,
    };
    if (call.name === "set_priorities") await this.event("controller.state_changed", execution);
    else if (INFORMATIONAL_TOOLS.has(call.name)) await this.event("environment.query", execution);
    else await this.event("engine.execution", execution);
    this.recordToolOutcome(call.name, ok);
    this.session.toolCalls += 1;
    return result;
  }

  async step({ signal } = {}) {
    if (!this.session) await this.start();
    if (["completed", "failed", "cancelled", "fallback"].includes(this.session.status)) {
      return { terminal: true, session: this.session };
    }
    const compaction = this.compactContext();
    if (compaction.compacted) await this.event("context.compacted", { omitted: compaction.omitted });
    const recovery = this.recoveryToolSet();
    if (recovery.recoveryRequired) await this.requireRecovery(recovery.tools, recovery.reason);
    let turn;
    const requestModel = async (attempt, reason) => {
      const requestNumber = ++this.session.providerRequests;
      await this.event("model.request", {
        requestNumber, attempt, reason, protocol: this.profile.toolProtocol,
        messageCount: this.messages.length, toolCount: this.tools.length,
        allowedToolCount: recovery.tools.length,
      });
      try {
        // Keep the native schema stable for provider prefix caching and for valid
        // tool names already present in conversation history. Recovery restrictions
        // are enforced by executeTool with an explicit result the model can observe.
        const response = await this.complete(this.profile, this.messages, this.tools, {
          signal, sessionId: this.session.id,
        });
        this.session.providerLatencyMs += response.latencyMs || 0;
        this.session.cachedTokens += response.usage?.cachedTokens || 0;
        if ((response.usage?.cachedTokens || 0) > 0) this.session.cacheHitRequests += 1;
        await this.event("model.response", {
          requestNumber, responseId: response.responseId, latencyMs: response.latencyMs,
          usage: response.usage, finishReason: response.finishReason,
        });
        return response;
      } catch (error) {
        this.session.providerLatencyMs += error?.latencyMs || 0;
        await this.event("model.error", {
          requestNumber, code: error?.code || "model_error",
          message: error?.message || String(error), latencyMs: error?.latencyMs || null,
          retryable: error instanceof LlmAiProviderError ? error.retryable : false,
        });
        throw error;
      }
    };
    try {
      turn = await requestModel(1, "strategic-turn");
    } catch (error) {
      if (signal?.aborted && await this.finishAuthoritativeOutcome()) {
        return { terminal: true, error, session: this.session };
      }
      if (isContextOverflow(error)) {
        const overflowCompaction = this.compactContext({ force: true });
        await this.event("context.compacted", {
          reason: "provider-overflow", omitted: overflowCompaction.omitted,
          omittedGroups: overflowCompaction.omittedGroups,
        });
        try {
          turn = await requestModel(2, "overflow-retry");
        } catch (retryError) {
          error = retryError;
        }
      }
      if (turn) {
        // The interrupted turn was retried from a semantic checkpoint.
      } else {
        this.consecutiveFailures += 1;
        this.session.failures += 1;
        const exhausted = this.consecutiveFailures >= this.profile.maxConsecutiveFailures;
        if (exhausted) {
          if (!this.profile.classicFallback || typeof this.transferToClassic !== "function") {
            await this.fail(error);
            throw error;
          }
          const transition = await this.transferToClassic();
          if (transition?.controller !== "classic") throw new Error("Classic fallback lease transfer was not confirmed");
          const endedAt = this.now();
          this.session = { ...this.session, status: "fallback", endedAt, updatedAt: endedAt };
          await this.event("strategy.ownership_transferred", {
            from: "llm", to: "classic", reason: "failure-limit", transition,
          });
          await this.store.updateSession(this.session.id, this.session);
          return { terminal: true, error, fallback: true, session: this.session };
        }
        await this.store.updateSession(this.session.id, {
          status: "running",
          failures: this.session.failures,
          providerRequests: this.session.providerRequests,
          providerLatencyMs: this.session.providerLatencyMs,
          cachedTokens: this.session.cachedTokens,
          cacheHitRequests: this.session.cacheHitRequests,
        });
        if (await this.finishIfTerminal("after-model-error")) {
          return { terminal: true, error, session: this.session };
        }
        // Keep correction as the final message so deterministic providers do not
        // overlook it behind the fresh observation captured above.
        await this.requireProviderCorrection(error);
        return { terminal: false, error };
      }
    }
    this.consecutiveFailures = 0;
    this.session.turns += 1;
    this.session.totalTokens += turn.usage?.totalTokens || 0;
    await this.event("model.decision", {
      protocol: turn.protocol,
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
        const result = await this.executeTool(call, turn.protocol, recovery.tools);
        this.messages.push({ role: "tool", tool_call_id: call.id,
          content: boundedJson(result, this.profile.toolResultTokens, this.tokenizer) });
      }
    } else if (turn.action.action === "tool") {
      const call = { id: null, name: turn.action.tool, arguments: turn.action.arguments };
      const result = await this.executeTool(call, turn.protocol, recovery.tools);
      this.messages.push({
        role: "user",
        content: `ENVIRONMENT TOOL RESULT (${call.name})\n${boundedJson(result, this.profile.toolResultTokens, this.tokenizer)}`,
      });
    } else if (turn.action.action === "finish") {
      requestedFinish = true;
    } else {
      this.nonActionStreak += 1;
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
      this.nonActionStreak += 1;
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
      providerRequests: this.session.providerRequests,
      providerLatencyMs: this.session.providerLatencyMs,
      cachedTokens: this.session.cachedTokens,
      cacheHitRequests: this.session.cacheHitRequests,
    });
    return { terminal: false, session: this.session, turn };
  }

  async run({ signal } = {}) {
    if (!this.session) await this.start();
    try {
      while (!signal?.aborted && !["completed", "failed", "cancelled", "fallback"].includes(this.session.status)) {
        const result = await this.step({ signal });
        if (result.terminal) break;
        const failureDelay = result.error
          ? Math.min(30_000, this.profile.planningIntervalMs * (2 ** Math.min(this.consecutiveFailures, 4)))
          : this.profile.planningIntervalMs;
        await this.sleep(failureDelay, signal);
      }
      if (signal?.aborted && !["completed", "failed"].includes(this.session.status)) {
        if (!await this.finishAuthoritativeOutcome()
            && !await this.finishIfTerminal("runtime-stopped")) {
          await this.cancel(signal.reason?.message || "cancelled");
        }
      }
    } catch (error) {
      if (signal?.aborted) {
        if (!await this.finishAuthoritativeOutcome()
            && !await this.finishIfTerminal("runtime-stopped")) {
          await this.cancel(signal.reason?.message || "cancelled");
        }
      }
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
