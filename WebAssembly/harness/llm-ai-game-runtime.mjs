import { LlmAiAgentRuntime } from "./llm-ai-agent.mjs";

const ORDER_ACTIONS = Object.freeze([
  "move", "attackMove", "attack", "guardPosition", "guardObject", "stop", "scatter",
]);
const CLASSIC_DIRECTIVES = Object.freeze([
  "buildBuilding", "buildUpgrade", "buildBaseDefense", "buildBaseDefenseStructure",
  "buildTeam", "recruitTeam", "buildBySupplies", "hunt", "teamDelay",
]);

function objectArguments(value, tool) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${tool} arguments must be an object`);
  }
  return value;
}

function integer(value, label, { minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new TypeError(`${label} must be a whole number from ${minimum} through ${maximum}`);
  }
  return parsed;
}

function finite(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be finite`);
  return parsed;
}

function position(argumentsValue, { required = false } = {}) {
  const hasPosition = argumentsValue.position !== undefined && argumentsValue.position !== null;
  if (!hasPosition) {
    if (required) throw new TypeError("position is required for this action");
    return { hasPosition: false, x: 0, y: 0 };
  }
  const value = objectArguments(argumentsValue.position, "position");
  return { hasPosition: true, x: finite(value.x, "position.x"), y: finite(value.y, "position.y") };
}

function objectIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new TypeError("objectIds must contain 1 through 128 observed object IDs");
  }
  const ids = value.map((id) => integer(id, "objectIds entry", { minimum: 1 }));
  if (new Set(ids).size !== ids.length) throw new TypeError("objectIds must not contain duplicates");
  return ids;
}

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

export function createLlmAiGameTools({ rpc, playerIndex, planningIntervalMs }) {
  if (typeof rpc !== "function") throw new TypeError("LLM game tools require the game RPC bridge");
  const player = integer(playerIndex, "playerIndex", { minimum: 0, maximum: 63 });
  const call = (command, payload) => engineRequest(rpc, command, { playerIndex: player, ...payload });
  return [
    {
      name: "issue_order",
      description: "Order one or more of your currently observed selectable objects. Use public IDs from objects. move, attackMove, and guardPosition require position; attack and guardObject require targetId.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ORDER_ACTIONS },
          objectIds: { type: "array", minItems: 1, maxItems: 128, items: { type: "integer", minimum: 1 } },
          targetId: { type: "integer", minimum: 0 },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
            additionalProperties: false,
          },
        },
        required: ["action", "objectIds"],
        additionalProperties: false,
      },
      validate(args) {
        const value = objectArguments(args, "issue_order");
        if (!ORDER_ACTIONS.includes(value.action)) throw new TypeError("action is not a supported order");
        objectIds(value.objectIds);
        if (["move", "attackMove", "guardPosition"].includes(value.action)) position(value, { required: true });
        if (["attack", "guardObject"].includes(value.action)) {
          integer(value.targetId, "targetId", { minimum: 1 });
        }
      },
      execute(args) {
        const pos = position(args);
        return call("llmAiGameOrder", {
          action: args.action,
          objectIds: objectIds(args.objectIds).join(","),
          targetId: args.targetId === undefined ? 0 : integer(args.targetId, "targetId", { minimum: 0 }),
          x: pos.x,
          y: pos.y,
        });
      },
    },
    {
      name: "use_command",
      description: "Execute an exact command from one of your object's advertised command set. Use sourceId and command name from objectCapabilities/commandSets. Production, upgrades, construction, powers, selling, evacuation, and other supported engine commands use their real availability and placement rules. Do not guess or repeat construction coordinates: after illegal_build_location, query different terrain or use classic_ai_directive buildBuilding so the classic AI chooses legal placement.",
      parameters: {
        type: "object",
        properties: {
          sourceId: { type: "integer", minimum: 1 },
          command: { type: "string", minLength: 1, maxLength: 256 },
          targetId: { type: "integer", minimum: 0 },
          position: {
            type: "object",
            properties: { x: { type: "number" }, y: { type: "number" } },
            required: ["x", "y"],
            additionalProperties: false,
          },
          angle: { type: "number" },
        },
        required: ["sourceId", "command"],
        additionalProperties: false,
      },
      validate(args) {
        const value = objectArguments(args, "use_command");
        integer(value.sourceId, "sourceId", { minimum: 1 });
        if (typeof value.command !== "string" || !value.command.trim() || value.command.length > 256) {
          throw new TypeError("command must be an advertised command name");
        }
        if (value.targetId !== undefined) integer(value.targetId, "targetId", { minimum: 0 });
        if (value.position !== undefined) position(value);
        if (value.angle !== undefined) finite(value.angle, "angle");
      },
      execute(args) {
        const pos = position(args);
        return call("llmAiGameCommand", {
          sourceId: integer(args.sourceId, "sourceId", { minimum: 1 }),
          command: args.command.trim(),
          targetId: args.targetId === undefined ? 0 : integer(args.targetId, "targetId", { minimum: 0 }),
          x: pos.x,
          y: pos.y,
          angle: args.angle === undefined ? 0 : finite(args.angle, "angle"),
          hasPosition: pos.hasPosition,
        });
      },
    },
    {
      name: "classic_ai_directive",
      description: "Steer the real classic skirmish AI's strategic queues. Prefer buildBuilding for strategic construction: name must be an exact classicAi.availableBuildingTemplates entry and the AI handles placement. buildBaseDefenseStructure uses availableBaseDefenseTemplates, upgrades use availableUpgrades, and teams use teamPrototypes. value is flank(0/1), recruit radius, whole-number minimum supplies, hunt(0/1), or whole-number team-delay seconds as appropriate. Direct directives are intentionally rejected in multiplayer to preserve determinism.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: CLASSIC_DIRECTIVES },
          name: { type: "string", maxLength: 256 },
          value: { type: "number" },
        },
        required: ["action"],
        additionalProperties: false,
      },
      validate(args) {
        const value = objectArguments(args, "classic_ai_directive");
        if (!CLASSIC_DIRECTIVES.includes(value.action)) throw new TypeError("action is not a supported classic directive");
        if (value.name !== undefined && (typeof value.name !== "string" || value.name.length > 256)) {
          throw new TypeError("name must be a short engine identifier");
        }
        if (value.value !== undefined) finite(value.value, "value");
      },
      execute(args) {
        return call("llmAiClassicDirective", {
          action: args.action,
          name: args.name?.trim() || "",
          value: args.value === undefined ? 0 : finite(args.value, "value"),
        });
      },
    },
    {
      name: "query_terrain",
      description: "Inspect a rectangular map area using fog-filtered terrain samples before expansion, construction, or route planning. Unknown cells remain hidden. Returns compact base64 height and flags grids plus decoding metadata.",
      parameters: {
        type: "object",
        properties: {
          minX: { type: "number" }, minY: { type: "number" },
          maxX: { type: "number" }, maxY: { type: "number" },
          columns: { type: "integer", minimum: 1, maximum: 128 },
          rows: { type: "integer", minimum: 1, maximum: 128 },
        },
        required: ["minX", "minY", "maxX", "maxY", "columns", "rows"],
        additionalProperties: false,
      },
      validate(args) {
        const value = objectArguments(args, "query_terrain");
        const minX = finite(value.minX, "minX");
        const minY = finite(value.minY, "minY");
        const maxX = finite(value.maxX, "maxX");
        const maxY = finite(value.maxY, "maxY");
        if (minX >= maxX || minY >= maxY) throw new TypeError("terrain bounds must be ordered");
        const columns = integer(value.columns, "columns", { minimum: 1, maximum: 128 });
        const rows = integer(value.rows, "rows", { minimum: 1, maximum: 128 });
        if (columns * rows > 16_384) throw new TypeError("terrain query may contain at most 16384 samples");
      },
      execute(args) {
        return call("llmAiTerrainQuery", {
          mode: "unrestricted",
          minX: finite(args.minX, "minX"), minY: finite(args.minY, "minY"),
          maxX: finite(args.maxX, "maxX"), maxY: finite(args.maxY, "maxY"),
          columns: integer(args.columns, "columns", { minimum: 1, maximum: 128 }),
          rows: integer(args.rows, "rows", { minimum: 1, maximum: 128 }),
        });
      },
    },
    {
      name: "wait_for_tick",
      description: "Keep the current plan running without issuing a new order. The runtime will observe again now and wake after the configured planning interval.",
      parameters: {
        type: "object",
        properties: { note: { type: "string", maxLength: 1024 } },
        additionalProperties: false,
      },
      validate(args) {
        const value = objectArguments(args, "wait_for_tick");
        if (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 1024)) {
          throw new TypeError("note is too long");
        }
      },
      execute() {
        return { ok: true, action: "wait", resumesAfterMs: planningIntervalMs };
      },
    },
  ];
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

  async assignments() {
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
    const tools = createLlmAiGameTools({
      rpc: this.rpc,
      playerIndex: assignment.playerIndex,
      planningIntervalMs: profile.planningIntervalMs,
    });
    const observe = async ({ reason }) => {
      const observation = await engineRequest(this.rpc, "llmAiWorldSnapshot", {
        playerIndex: assignment.playerIndex,
        mode: "unrestricted",
        detail: "tactical",
        includeCapabilities: true,
      });
      return {
        assignment: {
          slot: assignment.slot,
          playerIndex: assignment.playerIndex,
          profileId: assignment.profileId,
          commander: profile.name,
        },
        match: {
          map: state.map,
          gameMode: state.gameMode,
          authoritative: state.authoritative,
        },
        reason,
        ...observation,
      };
    };
    const runtime = new this.AgentRuntime({ profile, tools, observe, store: this.store });
    const entry = { key, matchKey: matchKeyValue, assignment, controller, runtime };
    this.active.set(key, entry);
    entry.promise = runtime.start({
      matchKey: matchKeyValue,
      map: state.map,
      gameMode: state.gameMode,
      slot: assignment.slot,
      playerIndex: assignment.playerIndex,
      displayName: assignment.displayName,
    }).then(() => {
      void this.onSessionChanged(runtime.session);
      return runtime.run({ signal: controller.signal });
    }).then(async (session) => {
      if (session?.status === "completed" || session?.status === "failed") this.completed.add(key);
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
    await Promise.all(validAssignments.map((assignment) =>
      this.startAssignment(state, matchKeyValue, assignment)));
    return state;
  }

  start() {
    if (this.interval !== null) return;
    void this.reconcileNow().catch(() => {});
    this.interval = this.setIntervalImpl(() => {
      void this.reconcileNow().catch(() => {});
    }, this.pollIntervalMs);
  }

  stop(reason = "LLM game coordinator stopped") {
    if (this.interval !== null) this.clearIntervalImpl(this.interval);
    this.interval = null;
    this.abortActive(reason);
  }
}

if (typeof window !== "undefined" && window.ZeroHLlmAi && typeof window.CnCPort?.rpc === "function") {
  const coordinator = new LlmAiGameCoordinator({
    rpc: window.CnCPort.rpc.bind(window.CnCPort),
    store: window.ZeroHLlmAi.store,
    onSessionChanged: () => window.ZeroHLlmAi.refresh(),
  });
  window.ZeroHLlmAiGameRuntime = coordinator;
  coordinator.start();
  window.addEventListener("beforeunload", () => coordinator.stop("Browser page closed"), { once: true });
}
