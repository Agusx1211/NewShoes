import { LlmAiAgentRuntime } from "./llm-ai-agent.mjs";
import { createStrategicGameTools, LlmAiStrategicState } from "./llm-ai-game-tools.mjs";

function engineError(reply, command) {
  const detail = reply?.result?.error ?? reply?.error;
  const message = typeof detail === "string" ? detail : detail?.message;
  const error = new Error(message || `${command} was rejected by the game`);
  error.code = detail?.code || "engine_rejected";
  return error;
}

async function engineRequest(rpc, command, payload = {}) {
  const reply = await rpc(command, payload);
  if (reply?.ok !== true || reply?.result?.ok !== true) throw engineError(reply, command);
  return reply.result;
}

export function createLlmAiGameTools(options) {
  return createStrategicGameTools(options);
}

function assignmentKey(matchKey, assignment) {
  return `${matchKey}:${assignment.slot}:${assignment.playerIndex}:${assignment.profileId}`;
}

export class LlmAiGameCoordinator {
  constructor({
    rpc,
    store,
    AgentRuntime = LlmAiAgentRuntime,
    pollIntervalMs = 1_000,
    setIntervalImpl = (...args) => globalThis.setInterval(...args),
    clearIntervalImpl = (...args) => globalThis.clearInterval(...args),
    onSessionChanged = () => {},
  } = {}) {
    if (typeof rpc !== "function") throw new TypeError("LLM game coordinator requires the game RPC bridge");
    if (!store) throw new TypeError("LLM game coordinator requires the profile/session store");
    this.rpc = rpc;
    this.store = store;
    this.AgentRuntime = AgentRuntime;
    this.pollIntervalMs = pollIntervalMs;
    this.setIntervalImpl = setIntervalImpl;
    this.clearIntervalImpl = clearIntervalImpl;
    this.onSessionChanged = onSessionChanged;
    this.active = new Map();
    this.completed = new Set();
    this.interval = null;
    this.reconciling = null;
    this.lastPlayable = false;
    this.lastFrame = 0;
    this.lastIdentity = "";
    this.matchSerial = 0;
    this.lastState = null;
  }

  assignments() {
    return engineRequest(this.rpc, "realEngineLlmAiAssignments");
  }

  abortActive(reason) {
    for (const entry of this.active.values()) {
      if (!entry.controller.signal.aborted) entry.controller.abort(new Error(reason));
    }
  }

  matchKey(state) {
    const identity = `${state.gameMode}:${state.gameId}:${state.seed}:${state.map}`;
    if (!this.lastPlayable || state.frame < this.lastFrame || identity !== this.lastIdentity) {
      this.matchSerial += 1;
      this.completed.clear();
    }
    this.lastPlayable = true;
    this.lastFrame = state.frame;
    this.lastIdentity = identity;
    return `${identity}:${this.matchSerial}`;
  }

  async startAssignment(state, matchKeyValue, assignment) {
    const key = assignmentKey(matchKeyValue, assignment);
    if (this.active.has(key) || this.completed.has(key)) return;
    const profile = await this.store.getProfile(assignment.profileId);
    if (!profile) return;

    const controller = new AbortController();
    const strategic = new LlmAiStrategicState({
      rpc: this.rpc, playerIndex: assignment.playerIndex, profile,
    });
    const lease = state.gameMode === 2
      ? await strategic.acquire()
      : { controller: assignment.strategyController, previousController: assignment.strategyController };
    if (lease.controller !== "llm") throw new Error("The LLM strategy lease is not active");

    const tools = createLlmAiGameTools({
      rpc: this.rpc, playerIndex: assignment.playerIndex,
      planningIntervalMs: profile.planningIntervalMs, profile, state: strategic,
    });
    const assignmentContext = {
      slot: assignment.slot, playerIndex: assignment.playerIndex,
      profileId: assignment.profileId, commander: profile.name, strategyController: "llm",
    };
    const match = { map: state.map, gameMode: state.gameMode, authoritative: state.authoritative };
    const runtime = new this.AgentRuntime({
      profile, tools, store: this.store,
      observe: ({ reason }) => strategic.observe({ assignment: assignmentContext, match, reason }),
      getStrategicState: () => strategic.checkpointState(),
      transferToClassic: () => strategic.release(),
    });
    const entry = { key, matchKey: matchKeyValue, assignment, controller, runtime, strategic };
    this.active.set(key, entry);
    entry.promise = runtime.start({
      matchKey: matchKeyValue, map: state.map, gameMode: state.gameMode,
      slot: assignment.slot, playerIndex: assignment.playerIndex,
      displayName: assignment.displayName, strategyLease: lease,
    }).then(() => {
      void this.onSessionChanged(runtime.session);
      return runtime.run({ signal: controller.signal });
    }).then(async (session) => {
      if (["completed", "failed", "fallback"].includes(session?.status)) this.completed.add(key);
      await this.onSessionChanged(session);
      return session;
    }).catch(async (error) => {
      this.completed.add(key);
      await this.onSessionChanged(runtime.session);
      console.error(`LLM commander ${profile.name} stopped`, error);
      return runtime.session;
    }).finally(() => {
      if (this.active.get(key) === entry) this.active.delete(key);
    });
  }

  async reconcileNow() {
    if (this.reconciling) return this.reconciling;
    this.reconciling = this.reconcile().finally(() => { this.reconciling = null; });
    return this.reconciling;
  }

  async reconcile() {
    const state = await this.assignments();
    this.lastState = state;
    if (!state.playable || !state.authoritative) {
      this.abortActive(!state.authoritative ? "This browser is not the match authority" : "Match ended");
      if (!state.playable) {
        this.lastPlayable = false;
        this.lastFrame = 0;
      }
      return state;
    }
    const matchKeyValue = this.matchKey(state);
    const validAssignments = state.assignments.filter((assignment) =>
      assignment.playerActive === true && assignment.computerPlayer === true
      && Number.isInteger(assignment.playerIndex) && assignment.profileId);
    const expected = new Set(validAssignments.map((assignment) => assignmentKey(matchKeyValue, assignment)));
    for (const [key, entry] of this.active) {
      if (!expected.has(key) && !entry.controller.signal.aborted) {
        entry.controller.abort(new Error("LLM player assignment changed"));
      }
    }
    await Promise.all(validAssignments.map((assignment) => this.startAssignment(state, matchKeyValue, assignment)));
    return state;
  }

  start() {
    if (this.interval !== null) return;
    void this.reconcileNow().catch(() => {});
    this.interval = this.setIntervalImpl(() => void this.reconcileNow().catch(() => {}), this.pollIntervalMs);
  }

  stop(reason = "LLM game coordinator stopped") {
    if (this.interval !== null) this.clearIntervalImpl(this.interval);
    this.interval = null;
    this.abortActive(reason);
  }
}

if (typeof window !== "undefined" && window.ZeroHLlmAi && typeof window.CnCPort?.rpc === "function") {
  const coordinator = new LlmAiGameCoordinator({
    rpc: window.CnCPort.rpc.bind(window.CnCPort), store: window.ZeroHLlmAi.store,
    onSessionChanged: () => window.ZeroHLlmAi.refresh(),
  });
  window.ZeroHLlmAiGameRuntime = coordinator;
  coordinator.start();
  window.addEventListener("beforeunload", () => coordinator.stop("Browser page closed"), { once: true });
}
