import {
  StableQueryPager,
  buildableOptions,
  compactRoutineObservation,
  internalNameFromHandle,
  normalizedEntity,
} from "./llm-ai-strategy.mjs";

const PRIORITIES = Object.freeze(["economy", "production", "technology", "defense", "scouting", "aggression"]);
const MISSIONS = Object.freeze(["defend", "scout", "capture", "harass", "attackRegion", "escort", "regroup"]);
const ORDERS = Object.freeze(["move", "attackMove", "attack", "guardPosition", "guardObject", "stop", "scatter"]);

function objectValue(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function integer(value, label, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
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

function ids(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) throw new TypeError("objectIds must contain 1 through 128 IDs");
  const result = value.map((entry) => integer(entry, "objectId", 1));
  if (new Set(result).size !== result.length) throw new TypeError("objectIds must be unique");
  return result;
}

function point(value, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new TypeError("position is required");
    return { present: false, x: 0, y: 0 };
  }
  const position = objectValue(value, "position");
  return { present: true, x: finite(position.x, "position.x"), y: finite(position.y, "position.y") };
}

function engineError(reply, command) {
  const detail = reply?.result?.error ?? reply?.error;
  const error = new Error((typeof detail === "string" ? detail : detail?.message) || `${command} was rejected`);
  error.code = detail?.code || "engine_rejected";
  return error;
}

function publicError(error) {
  return { code: error?.code || "engine_rejected", message: error?.message || String(error) };
}

async function request(rpc, command, playerIndex, payload = {}) {
  const reply = await rpc(command, { playerIndex, ...payload });
  if (reply?.ok !== true || reply?.result?.ok !== true) throw engineError(reply, command);
  return reply.result;
}

export class LlmAiStrategicState {
  constructor({ rpc, playerIndex, profile }) {
    this.rpc = rpc;
    this.playerIndex = integer(playerIndex, "playerIndex", 0, 63);
    this.profile = profile;
    this.previousRaw = null;
    this.raw = null;
    this.catalog = null;
    this.catalogRevision = null;
    this.facilitySignature = "";
    this.priorities = Object.fromEntries(PRIORITIES.map((name) => [name, 50]));
    this.jobs = new Map();
    this.serial = 0;
    this.pager = new StableQueryPager();
  }

  call(command, payload) { return request(this.rpc, command, this.playerIndex, payload); }
  acquire() { return this.call("llmAiStrategyController", { controller: "llm" }); }
  release() { return this.call("llmAiStrategyController", { controller: "classic" }); }

  facilitySet(raw) {
    return (raw.objects || []).filter((object) => object.owner === raw.localPlayerIndex && object.categories?.includes("STRUCTURE"))
      .map((object) => `${object.id}:${object.template}`).sort().join("|");
  }

  async refreshCatalog() {
    const raw = await this.call("llmAiWorldSnapshot", { mode: "unrestricted", detail: "full", includeCapabilities: true });
    this.catalog = {
      templates: raw.templates || {}, commandSets: raw.commandSets || {},
      objectCapabilities: raw.objectCapabilities || {}, engineServices: raw.engineServices || {},
    };
    this.catalogRevision = `catalog:${raw.snapshotId}`;
  }

  updateJobs() {
    if (!this.raw) return;
    for (const job of this.jobs.values()) {
      if (["complete", "failed"].includes(job.state)) continue;
      if (job.type === "mission") {
        const members = (this.raw.objects || []).filter((object) => job.objectIds.includes(object.id));
        if (members.length === 0) {
          job.state = "failed"; job.blockedReason = "no assigned squad members remain observable";
        } else if (members.some((object) => /attack|combat|fire/i.test(object.motion?.ai?.state || ""))) job.state = "engaged";
        else if (members.some((object) => /move|path/i.test(object.motion?.ai?.state || ""))) job.state = "moving";
      } else if (job.type === "production" && job.internalName) {
        const produced = (this.raw.objects || []).filter((object) => object.owner === this.raw.localPlayerIndex
          && object.template === job.internalName && object.id !== job.preexistingObjectId);
        if (produced.some((object) => Number(object.construction) >= 1)) job.state = "complete";
        else if (produced.length > 0) job.state = "assembling";
      } else if (job.type === "force" && Number.isInteger(job.teamId)) {
        const members = (this.raw.objects || []).filter((object) => object.owner === this.raw.localPlayerIndex
          && object.teamId === job.teamId);
        if (members.length > 0 && members.every((object) => Number(object.construction) >= 1)) job.state = "complete";
        else if (members.length > 0) job.state = "assembling";
      }
      job.updatedFrame = this.raw.frame;
    }
  }

  async observe({ assignment, match, reason }) {
    const raw = await this.call("llmAiWorldSnapshot", { mode: "unrestricted", detail: "full", includeCapabilities: false });
    const signature = this.facilitySet(raw);
    if (!this.catalog || signature !== this.facilitySignature) {
      await this.refreshCatalog();
      this.facilitySignature = signature;
    }
    this.previousRaw = this.raw;
    this.raw = raw;
    this.updateJobs();
    return compactRoutineObservation(raw, {
      assignment, match, reason, previous: this.previousRaw, priorities: this.priorities,
      jobs: [...this.jobs.values()], catalogRevision: this.catalogRevision,
      maxTokens: this.profile.routineObservationTokens,
    });
  }

  async focused() {
    this.raw = await this.call("llmAiWorldSnapshot", { mode: "unrestricted", detail: "full", includeCapabilities: false });
    this.updateJobs();
    return this.raw;
  }

  newJob(type, details) {
    const job = {
      id: `${type === "mission" ? "mission" : "job"}:${++this.serial}`,
      type, state: type === "mission" ? "moving" : "queued", blockedReason: null,
      createdFrame: this.raw?.frame ?? 0, updatedFrame: this.raw?.frame ?? 0, ...details,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  checkpointState() {
    const local = this.raw?.players?.find((player) => player.local);
    const jobs = [...this.jobs.values()];
    return {
      mandate: this.profile.mandate,
      decisions: { priorities: this.priorities },
      basesAndRegions: { catalogRevision: this.catalogRevision },
      economy: local?.economy || null,
      forcesAndMissions: jobs.filter((job) => job.type === "mission").map(publicJob),
      productionPlan: jobs.filter((job) => job.type !== "mission").map(publicJob),
      threats: null,
      unresolvedErrors: jobs.filter((job) => job.blockedReason).map((job) => ({ id: job.id, reason: job.blockedReason })),
      liveIds: jobs.map((job) => job.id), frame: this.raw?.frame ?? null,
    };
  }
}

function publicJob(job) {
  const { internalName: _internalName, preexistingObjectId: _preexisting, ...visible } = job;
  return visible;
}

function pageOptions(args, filters, field, direction, revision) {
  return {
    filters, order: [field, direction], revision,
    limit: args.limit === undefined ? 24 : integer(args.limit, "limit", 1, 64), cursor: args.cursor || null,
  };
}

export function createStrategicGameTools({ rpc, playerIndex, planningIntervalMs = 2_000, profile, state }) {
  const strategic = state || new LlmAiStrategicState({ rpc, playerIndex, profile });
  const budget = profile?.toolResultTokens ?? 4_096;
  const call = (command, payload) => strategic.call(command, payload);
  return [
    {
      name: "set_priorities",
      description: "Set any strategic priority from 0 to 100: economy, production, technology, defense, scouting, aggression. Omitted fields retain their values. Freshness: current session. Cost: no engine query and one small bounded result.",
      parameters: { type: "object", minProperties: 1, properties: Object.fromEntries(PRIORITIES.map((name) => [name, { type: "integer", minimum: 0, maximum: 100 }])), additionalProperties: false },
      validate(args) {
        const value = objectValue(args, "set_priorities arguments");
        if (!PRIORITIES.some((name) => value[name] !== undefined)) throw new TypeError("at least one priority is required");
        for (const name of PRIORITIES) if (value[name] !== undefined) integer(value[name], name, 0, 100);
      },
      execute(args) {
        for (const name of PRIORITIES) if (args[name] !== undefined) strategic.priorities[name] = Number(args[name]);
        return { ok: true, priorities: { ...strategic.priorities } };
      },
    },
    {
      name: "query_buildable_options",
      description: `Query revisioned buildable options filtered by purpose, maxCost, prerequisite state, exact production source, and readyOnly. Prerequisite states: ready, blocked, complete, unknown, validated-on-request. Sort handle|cost asc|desc; default handle asc, stable handle-asc tie-break. Page 1-64, default 24. Cursor binds exact catalog snapshot, filters, and ordering. Returns appliedFilters/order/snapshot/count/total/nextCursor. Refreshes when facilities change. Hard result limit ${budget} tokens.`,
      parameters: { type: "object", properties: {
        purpose: { type: "string", enum: ["any", "structure", "infantry", "vehicle", "aircraft", "technology", "force"] },
        maxCost: { type: "integer", minimum: 0 }, readyOnly: { type: "boolean" },
        prerequisite: { type: "string", enum: ["any", "ready", "blocked", "complete", "unknown", "validated-on-request"] },
        source: { type: "string", maxLength: 128 }, sort: { type: "string", enum: ["handle", "cost"] },
        direction: { type: "string", enum: ["asc", "desc"] }, limit: { type: "integer", minimum: 1, maximum: 64 }, cursor: { type: "string", maxLength: 2048 },
      }, additionalProperties: false },
      execute(args) {
        const prerequisiteState = (record) => {
          if (record.prerequisites === "complete") return "complete";
          if (record.prerequisites === "validated-on-request") return "validated-on-request";
          if (record.prerequisites === "unknown") return "unknown";
          return record.ready ? "ready" : "blocked";
        };
        const filters = {
          purpose: args.purpose || "any", maxCost: args.maxCost ?? null,
          prerequisite: args.prerequisite || "any", source: args.source || null,
          readyOnly: args.readyOnly === true,
        };
        const field = args.sort || "handle"; const direction = args.direction || "asc";
        const records = buildableOptions(strategic.catalog).filter((record) =>
          (filters.purpose === "any" || record.purpose === filters.purpose)
          && (filters.maxCost === null || record.cost === null || record.cost <= filters.maxCost)
          && (filters.prerequisite === "any" || prerequisiteState(record) === filters.prerequisite)
          && (filters.source === null || record.source === filters.source)
          && (!filters.readyOnly || record.ready));
        records.sort((left, right) => {
          const comparison = field === "cost" ? (left.cost ?? Number.MAX_SAFE_INTEGER) - (right.cost ?? Number.MAX_SAFE_INTEGER)
            : left.handle.localeCompare(right.handle);
          return (direction === "desc" ? -comparison : comparison) || left.handle.localeCompare(right.handle);
        });
        return strategic.pager.page(records, pageOptions(args, filters, field, direction, strategic.catalogRevision));
      },
    },
    {
      name: "request_production",
      description: "Request a structure or technology by stable build:/upgrade: optionHandle. The original engine owns prerequisites, payment, work queues, and legal placement. Returns a stable job with queued/assembling/blocked/complete/failed state. Freshness: execution frame; one engine request; bounded result.",
      parameters: { type: "object", properties: { optionHandle: { type: "string", maxLength: 320 } }, required: ["optionHandle"], additionalProperties: false },
      validate(args) { objectValue(args, "request_production arguments"); },
      async execute(args) {
        const option = buildableOptions(strategic.catalog).find((candidate) => candidate.handle === args.optionHandle);
        if (!option) throw new TypeError("optionHandle is not in the current catalog revision");
        const upgrade = args.optionHandle.startsWith("upgrade:");
        const internalName = internalNameFromHandle(args.optionHandle, upgrade ? "upgrade" : "build");
        const existing = strategic.raw?.objects?.find((object) => object.owner === strategic.playerIndex && object.template === internalName);
        const job = strategic.newJob("production", { optionHandle: args.optionHandle, internalName, preexistingObjectId: existing?.id ?? null });
        try {
          const result = await call("llmAiEngineRequest", { action: upgrade ? "buildUpgrade" : "buildBuilding", name: internalName, value: 0 });
          return { ok: true, job: publicJob(job), engine: result };
        } catch (error) {
          job.state = "blocked"; job.blockedReason = error?.message || String(error);
          return { ok: false, job: publicJob(job), error: publicError(error) };
        }
      },
    },
    {
      name: "request_force",
      description: "Request a force: team archetype from query_buildable_options. Original work orders, factories, and team completion execute the request without selecting it. mode assemble|recruit; recruitRadius applies only to recruit. Returns a stable job. Freshness: catalog revision; one engine request.",
      parameters: { type: "object", properties: {
        archetypeHandle: { type: "string", maxLength: 320 }, mode: { type: "string", enum: ["assemble", "recruit"] }, recruitRadius: { type: "number", minimum: 0, maximum: 5000 },
      }, required: ["archetypeHandle"], additionalProperties: false },
      validate(args) { internalNameFromHandle(objectValue(args, "request_force arguments").archetypeHandle, "force"); },
      async execute(args) {
        const internalName = internalNameFromHandle(args.archetypeHandle, "force");
        if (!strategic.catalog?.engineServices?.teamPrototypes?.includes(internalName)) throw new TypeError("archetypeHandle is stale");
        const recruit = args.mode === "recruit";
        const job = strategic.newJob("force", { archetypeHandle: args.archetypeHandle, internalName });
        try {
          const result = await call("llmAiEngineRequest", { action: recruit ? "recruitTeam" : "buildTeam", name: internalName, value: recruit ? finite(args.recruitRadius ?? 300, "recruitRadius") : 0 });
          job.teamId = result.teamId;
          job.squadHandle = Number.isInteger(result.teamId) ? `squad:${result.teamId}` : null;
          job.state = recruit ? "complete" : "assembling";
          return { ok: true, job: publicJob(job), engine: result };
        } catch (error) {
          job.state = "blocked"; job.blockedReason = error?.message || String(error);
          return { ok: false, job: publicJob(job), error: publicError(error) };
        }
      },
    },
    {
      name: "assign_mission",
      description: "Assign a stable squad handle (preferred) or exceptional explicit object IDs to defend, scout, capture, harass, attackRegion, escort, or regroup. Uses original synchronized order, pathfinding, and combat execution. position is required except escort uses targetId. Returns persistent mission ID/state. Freshness: execution frame; one command result.",
      parameters: { type: "object", properties: {
        mission: { type: "string", enum: MISSIONS }, squadHandle: { type: "string", pattern: "^squad:[0-9]+$", maxLength: 64 },
        objectIds: { type: "array", minItems: 1, maxItems: 128, items: { type: "integer", minimum: 1 } },
        targetId: { type: "integer", minimum: 1 }, position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false },
      }, required: ["mission"], additionalProperties: false },
      validate(args) {
        const value = objectValue(args, "assign_mission arguments");
        const hasSquad = typeof value.squadHandle === "string";
        const hasIds = value.objectIds !== undefined;
        if (hasSquad === hasIds) throw new TypeError("provide exactly one of squadHandle or objectIds");
        if (hasSquad && !/^squad:\d+$/.test(value.squadHandle)) throw new TypeError("squadHandle is invalid");
        if (hasIds) ids(value.objectIds);
        if (value.mission === "escort") integer(value.targetId, "targetId", 1); else point(value.position, true);
      },
      async execute(args) {
        this.validate(args);
        let objectIds;
        if (args.squadHandle) {
          const raw = await strategic.focused();
          const teamId = integer(args.squadHandle.slice("squad:".length), "squad team ID", 1);
          objectIds = (raw.objects || []).filter((object) => object.owner === raw.localPlayerIndex
            && object.teamId === teamId && !object.categories?.includes("STRUCTURE")).map((object) => object.id);
          if (objectIds.length === 0) throw new TypeError("squadHandle has no current controllable members");
        } else objectIds = ids(args.objectIds);
        const position = point(args.position);
        const action = args.mission === "escort" ? "guardObject" : ["harass", "attackRegion", "capture"].includes(args.mission)
          ? "attackMove" : args.mission === "defend" ? "guardPosition" : "move";
        const job = strategic.newJob("mission", { mission: args.mission, squadHandle: args.squadHandle || null, objectIds, targetId: args.targetId ?? null, position: position.present ? { x: position.x, y: position.y } : null });
        try {
          const result = await call("llmAiGameOrder", { action, objectIds: objectIds.join(","), targetId: args.targetId ?? 0, x: position.x, y: position.y });
          return { ok: true, mission: publicJob(job), engine: result };
        } catch (error) {
          job.state = "blocked"; job.blockedReason = error?.message || String(error);
          return { ok: false, mission: publicJob(job), error: publicError(error) };
        }
      },
    },
    {
      name: "inspect_job",
      description: "Inspect one job/mission by stable ID. Returns queued, assembling, blocked, moving, engaged, complete, or failed and blockedReason. Freshness: latest observation. No engine query; bounded result.",
      parameters: { type: "object", properties: { id: { type: "string", maxLength: 128 } }, required: ["id"], additionalProperties: false },
      execute(args) { const job = strategic.jobs.get(args.id); if (!job) throw new TypeError("unknown job or mission ID"); return { ok: true, job: publicJob(job) }; },
    },
    {
      name: "inspect_entities",
      description: `Inspect bounded squad/contact/base/facility/objective records by scope, exact stable handles, owner, and kind. Sort handle asc|desc, stable handle tie-break. Page 1-64 default 24. Cursor binds the exact world snapshot so state changes cannot reorder later pages. Returns filters/order/snapshot/count/total/nextCursor. One snapshot for a new query; hard result ${budget} tokens.`,
      parameters: { type: "object", properties: {
        owner: { type: "string", enum: ["self", "allied", "enemy", "any"] }, kind: { type: "string", enum: ["unit", "infantry", "vehicle", "aircraft", "structure", "any"] },
        scope: { type: "string", enum: ["any", "squad", "contact", "base", "facility", "objective"] },
        handles: { type: "array", maxItems: 64, items: { type: "string", maxLength: 128 } },
        direction: { type: "string", enum: ["asc", "desc"] }, limit: { type: "integer", minimum: 1, maximum: 64 }, cursor: { type: "string", maxLength: 2048 },
      }, additionalProperties: false },
      async execute(args) {
        const raw = args.cursor ? strategic.raw : await strategic.focused();
        const filters = { scope: args.scope || "any", owner: args.owner || "any", kind: args.kind || "any", handles: args.handles || [] }; const direction = args.direction || "asc";
        let records = (raw?.objects || []).filter((object) => object.owner === raw.localPlayerIndex || ["allies", "enemies"].includes(object.relationship))
          .map((object) => normalizedEntity(object, raw.localPlayerIndex)).filter((record) =>
            (filters.owner === "any" || record.owner === filters.owner) && (filters.kind === "any" || record.kind === filters.kind)
            && (filters.handles.length === 0 || filters.handles.includes(record.handle) || filters.handles.includes(record.squadHandle)));
        if (filters.scope === "squad") records = records.filter((record) => record.owner === "self" && record.kind !== "structure");
        if (filters.scope === "contact") records = records.filter((record) => record.owner !== "self");
        if (["base", "facility"].includes(filters.scope)) records = records.filter((record) => record.owner === "self" && record.kind === "structure");
        if (filters.scope === "objective") records = [{ handle: "objective:match", kind: "objective", owner: "self", state: raw?.game?.outcome || "playing", frame: raw?.frame }];
        records.sort((left, right) => (direction === "desc" ? -1 : 1) * left.handle.localeCompare(right.handle));
        return strategic.pager.page(records, pageOptions(args, filters, "handle", direction, `world:${raw?.snapshotId}`));
      },
    },
    {
      name: "query_map_region",
      description: `Query a bounded fog-filtered region at coarse 16x16, medium 32x32, or fine 45x45 resolution for terrain|route|construction. Unknown cells stay hidden. Row-major order; returned frame/bounds/resolution/filter define freshness. No pagination; one terrain query; hard result ${budget} tokens.`,
      parameters: { type: "object", properties: {
        minX: { type: "number" }, minY: { type: "number" }, maxX: { type: "number" }, maxY: { type: "number" },
        resolution: { type: "string", enum: ["coarse", "medium", "fine"] }, filter: { type: "string", enum: ["terrain", "route", "construction"] },
      }, required: ["minX", "minY", "maxX", "maxY", "resolution", "filter"], additionalProperties: false },
      validate(args) { if (finite(args.minX, "minX") >= finite(args.maxX, "maxX") || finite(args.minY, "minY") >= finite(args.maxY, "maxY")) throw new TypeError("bounds must be ordered"); },
      async execute(args) {
        const size = { coarse: 16, medium: 32, fine: 45 }[args.resolution];
        const result = await call("llmAiTerrainQuery", { mode: "unrestricted", minX: Number(args.minX), minY: Number(args.minY), maxX: Number(args.maxX), maxY: Number(args.maxY), columns: size, rows: size });
        const { height, flags, ...metadata } = result;
        return {
          appliedFilter: args.filter, appliedResolution: args.resolution, order: "row-major", ...metadata,
          ...(args.filter !== "route" ? { height } : {}),
          ...(args.filter !== "terrain" ? { flags } : {}),
        };
      },
    },
    {
      name: "issue_order",
      description: "Exceptional low-level order when assign_mission cannot express the need. Uses current owned public IDs. Position is required for move/attackMove/guardPosition; targetId for attack/guardObject. Prefer the mission layer. Freshness: execution frame; one bounded result.",
      parameters: { type: "object", properties: {
        action: { type: "string", enum: ORDERS }, objectIds: { type: "array", minItems: 1, maxItems: 128, items: { type: "integer", minimum: 1 } },
        targetId: { type: "integer", minimum: 0 }, position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false },
      }, required: ["action", "objectIds"], additionalProperties: false },
      validate(args) { ids(args.objectIds); if (["move", "attackMove", "guardPosition"].includes(args.action)) point(args.position, true); if (["attack", "guardObject"].includes(args.action)) integer(args.targetId, "targetId", 1); },
      execute(args) { const position = point(args.position); return call("llmAiGameOrder", { action: args.action, objectIds: ids(args.objectIds).join(","), targetId: args.targetId ?? 0, x: position.x, y: position.y }); },
    },
    {
      name: "use_command",
      description: "Exceptional exact facility command using sourceId and command from the current catalog. Ordinary construction/technology belongs in request_production, whose engine service owns legal placement. Direct construction requires a queried position and real availability. One bounded command result.",
      parameters: { type: "object", properties: {
        sourceId: { type: "integer", minimum: 1 }, command: { type: "string", minLength: 1, maxLength: 256 }, targetId: { type: "integer", minimum: 0 },
        position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false }, angle: { type: "number" },
      }, required: ["sourceId", "command"], additionalProperties: false },
      validate(args) { integer(args.sourceId, "sourceId", 1); if (typeof args.command !== "string" || !args.command.trim()) throw new TypeError("command is required"); if (args.position) point(args.position); },
      execute(args) { const position = point(args.position); return call("llmAiGameCommand", { sourceId: args.sourceId, command: args.command.trim(), targetId: args.targetId ?? 0, x: position.x, y: position.y, angle: args.angle ?? 0, hasPosition: position.present }); },
    },
    {
      name: "wait_for_tick",
      description: "Keep confirmed jobs and missions running until the next observation/planning deadline. Freshness: next tick; no engine mutation; small bounded result.",
      parameters: { type: "object", properties: { note: { type: "string", maxLength: 1024 } }, additionalProperties: false },
      execute() { return { ok: true, action: "wait", resumesAfterMs: planningIntervalMs }; },
    },
  ];
}
