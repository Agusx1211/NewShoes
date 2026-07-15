import {
  StableQueryPager,
  buildableOptions,
  compactRoutineObservation,
  hasCategory,
  hasSemanticTag,
  internalNameFromHandle,
  isConstructionComplete,
  normalizedEntity,
} from "./llm-ai-strategy.mjs";

const PRIORITIES = Object.freeze(["economy", "production", "technology", "defense", "scouting", "aggression"]);
const MISSIONS = Object.freeze(["defend", "scout", "capture", "harass", "attackRegion", "escort", "regroup"]);
const ORDERS = Object.freeze(["move", "attackMove", "attack", "guardPosition", "guardObject", "stop", "scatter"]);
const TARGETABLE_OFFENSIVE_MISSIONS = new Set(["harass", "attackRegion"]);
const TERMINAL_JOB_STATES = new Set(["blocked", "complete", "failed"]);
const MISSION_ARRIVAL_RADIUS = 250;
const MISSION_STALL_FRAMES = 15 * 30;
const MISSION_PROGRESS_DISTANCE = 25;

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

function position2d(value) {
  if (Array.isArray(value) && value.length >= 2) return { x: Number(value[0]), y: Number(value[1]) };
  if (value && typeof value === "object") return { x: Number(value.x), y: Number(value.y) };
  return null;
}

function missionTarget(job, raw) {
  if (job.position) return position2d(job.position);
  if (!Number.isInteger(job.targetId)) return null;
  return position2d((raw.objects || []).find((object) => object.id === job.targetId)?.position);
}

function missionDistance(job, members, raw) {
  const target = missionTarget(job, raw);
  const positions = members.map((member) => position2d(member.position))
    .filter((position) => position && Number.isFinite(position.x) && Number.isFinite(position.y));
  if (!target || positions.length === 0 || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  const distances = positions.map((position) => Math.hypot(position.x - target.x, position.y - target.y))
    .sort((left, right) => left - right);
  return distances[Math.floor(distances.length / 2)];
}

function isOrderableMissionMember(object, playerIndex) {
  return object.owner === playerIndex && !hasCategory(object, "structure")
    && object.capabilities?.orderable === true && object.capabilities?.mobile === true
    && isConstructionComplete(object);
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
    this.lastObservedRaw = null;
    this.raw = null;
    this.catalog = null;
    this.catalogRevision = null;
    this.catalogSignature = "";
    this.priorities = Object.fromEntries(PRIORITIES.map((name) => [name, 50]));
    this.jobs = new Map();
    this.serial = 0;
    this.pager = new StableQueryPager();
  }

  call(command, payload) { return request(this.rpc, command, this.playerIndex, payload); }
  acquire() { return this.call("llmAiStrategyController", { controller: "llm" }); }
  release() { return this.call("llmAiStrategyController", { controller: "classic" }); }

  catalogSourceSignature(raw) {
    return (raw.objects || []).filter((object) => object.owner === raw.localPlayerIndex
      && (hasCategory(object, "structure") || hasCategory(object, "builder")
        || (object.capabilities?.commands || []).some((command) => command.product || command.upgrade)))
      .map((object) => {
        const commands = (object.capabilities?.commands || []).map((command) => [
          command.name,
          command.product?.template || null,
          command.product?.availability || null,
          command.upgrade?.name || null,
          command.upgrade?.complete ?? null,
        ]);
        return JSON.stringify([object.id, object.template, object.capabilities?.commandSet || null, commands]);
      }).sort().join("|");
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
      if (TERMINAL_JOB_STATES.has(job.state)) continue;
      if (job.type === "mission") {
        const members = (this.raw.objects || []).filter((object) => job.objectIds.includes(object.id));
        const distance = missionDistance(job, members, this.raw);
        if (members.length === 0) {
          job.state = "failed"; job.blockedReason = "no assigned squad members remain observable";
        } else if (members.some((object) => /attack|combat|fire/i.test(object.motion?.ai?.state || "")
            || hasSemanticTag(object, "status", "attacking") || hasSemanticTag(object, "status", "firing"))) {
          job.state = "engaged"; job.blockedReason = null;
          job._lastProgressFrame = this.raw.frame;
        } else if (members.some((object) => /move|path/i.test(object.motion?.ai?.state || ""))) {
          job.state = "moving"; job.blockedReason = null;
          job._lastProgressFrame = this.raw.frame;
          if (Number.isFinite(distance)) job._bestDistance = Math.min(job._bestDistance ?? Infinity, distance);
        } else if (Number.isFinite(distance) && distance <= MISSION_ARRIVAL_RADIUS) {
          job.state = "complete"; job.blockedReason = null;
        } else if (Number.isFinite(distance)
            && distance < (job._bestDistance ?? Infinity) - MISSION_PROGRESS_DISTANCE) {
          job.state = "moving"; job.blockedReason = null;
          job._bestDistance = distance;
          job._lastProgressFrame = this.raw.frame;
        } else if (this.raw.frame - (job._lastProgressFrame ?? job.createdFrame) >= MISSION_STALL_FRAMES) {
          job.state = "blocked"; job.blockedReason = "assigned members are idle before reaching the mission destination";
        }
      } else if (job.type === "production" && job.internalName) {
        if (job.optionHandle?.startsWith("upgrade:")) {
          const option = buildableOptions(this.catalog)
            .find((candidate) => candidate.handle === job.optionHandle);
          if (option?.prerequisites === "complete") job.state = "complete";
          else if (option) job.state = "assembling";
          job.updatedFrame = this.raw.frame;
          continue;
        }
        const preexisting = new Set(job.preexistingObjectIds || []);
        const produced = (this.raw.objects || []).filter((object) => object.owner === this.raw.localPlayerIndex
          && object.template === job.internalName && !preexisting.has(object.id));
        if (produced.some(isConstructionComplete)) job.state = "complete";
        else if (produced.length > 0) job.state = "assembling";
      } else if (job.type === "force" && Number.isInteger(job.teamId)) {
        const members = (this.raw.objects || []).filter((object) => object.owner === this.raw.localPlayerIndex
          && object.teamId === job.teamId);
        if (members.length > 0 && members.every(isConstructionComplete)) job.state = "complete";
        else if (members.length > 0) job.state = "assembling";
      }
      job.updatedFrame = this.raw.frame;
    }
  }

  async observe({ assignment, match, reason }) {
    const raw = await this.call("llmAiWorldSnapshot", { mode: "unrestricted", detail: "full", includeCapabilities: false });
    const signature = this.catalogSourceSignature(raw);
    if (!this.catalog || signature !== this.catalogSignature) {
      await this.refreshCatalog();
      this.catalogSignature = signature;
    }
    this.raw = raw;
    this.updateJobs();
    const observation = compactRoutineObservation(raw, {
      assignment, match, reason, previous: this.lastObservedRaw, priorities: this.priorities,
      jobs: [...this.jobs.values()], catalogRevision: this.catalogRevision,
      maxTokens: this.profile.routineObservationTokens,
    });
    this.lastObservedRaw = raw;
    return observation;
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
    if (type === "mission" && this.raw) {
      const members = (this.raw.objects || []).filter((object) => job.objectIds.includes(object.id));
      const distance = missionDistance(job, members, this.raw);
      if (Number.isFinite(distance)) job._bestDistance = distance;
      job._lastProgressFrame = job.createdFrame;
    }
    this.jobs.set(job.id, job);
    return job;
  }

  supersedeMissions(replacement) {
    const replacementIds = new Set(replacement.objectIds || []);
    for (const job of this.jobs.values()) {
      if (job === replacement || job.type !== "mission" || ["complete", "failed"].includes(job.state)) continue;
      const sameSquad = replacement.squadHandle && replacement.squadHandle === job.squadHandle;
      const sharedMember = (job.objectIds || []).some((id) => replacementIds.has(id));
      if (!sameSquad && !sharedMember) continue;
      job.state = "failed";
      job.blockedReason = `superseded by ${replacement.id}`;
      job.updatedFrame = this.raw?.frame ?? job.updatedFrame;
    }
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
      unresolvedErrors: jobs.filter((job) => job.blockedReason && !job.blockedReason.startsWith("superseded by "))
        .map((job) => ({ id: job.id, reason: job.blockedReason })),
      liveIds: jobs.filter((job) => !TERMINAL_JOB_STATES.has(job.state)).map((job) => job.id),
      frame: this.raw?.frame ?? null,
    };
  }
}

function publicJob(job) {
  const {
    internalName: _internalName,
    preexistingObjectIds: _preexisting,
    _bestDistance,
    _lastProgressFrame,
    ...visible
  } = job;
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
      description: "Record planning weights from 0 to 100 for economy, production, technology, defense, scouting, and aggression. This updates controller memory but does not itself queue engine work; follow it with production, force, or mission actions. Omitted fields retain their values. Freshness: current session. Cost: no engine query and one small bounded result.",
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
      description: `Query revisioned structure, infantry, vehicle, aircraft, technology, and force options filtered by purpose, maxCost, prerequisite state, exact production source, and readyOnly. Prerequisite states: ready, blocked, complete, unknown, validated-on-request. Force archetypes are validated-on-request, so discover them with readyOnly false. If a ready-only query is empty, retry without that filter before concluding nothing can be built. Sort handle|cost asc|desc; default handle asc, stable handle-asc tie-break. Page 1-64, default 24. Cursor binds exact catalog snapshot, filters, and ordering. Returns appliedFilters/order/snapshot/count/total/nextCursor. Refreshes when production sources or their availability change. Hard result limit ${budget} tokens.`,
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
        const available = buildableOptions(strategic.catalog);
        const matchesStableFilters = (record) =>
          (filters.purpose === "any" || record.purpose === filters.purpose)
          && (filters.maxCost === null || record.cost === null || record.cost <= filters.maxCost)
          && (filters.prerequisite === "any" || prerequisiteState(record) === filters.prerequisite)
          && (filters.source === null || record.source === filters.source);
        const records = available.filter((record) => matchesStableFilters(record)
          && (!filters.readyOnly || record.ready));
        records.sort((left, right) => {
          const comparison = field === "cost" ? (left.cost ?? Number.MAX_SAFE_INTEGER) - (right.cost ?? Number.MAX_SAFE_INTEGER)
            : left.handle.localeCompare(right.handle);
          return (direction === "desc" ? -comparison : comparison) || left.handle.localeCompare(right.handle);
        });
        const page = strategic.pager.page(records, pageOptions(args, filters, field, direction, strategic.catalogRevision));
        if (filters.readyOnly && page.total === 0 && available.some(matchesStableFilters)) {
          page.hint = "Matching options exist but are not currently marked ready; retry with readyOnly false to inspect blocked or validated-on-request choices.";
        }
        return page;
      },
    },
    {
      name: "request_production",
      description: "Request a structure, unit, or technology by stable build:/produce:/upgrade: optionHandle. The original engine owns prerequisites, payment, work queues, and legal placement. Returns a stable job with queued/assembling/blocked/complete/failed state. Freshness: catalog revision and execution frame; one engine request; bounded result.",
      parameters: { type: "object", properties: { optionHandle: { type: "string", maxLength: 320 } }, required: ["optionHandle"], additionalProperties: false },
      validate(args) { objectValue(args, "request_production arguments"); },
      async execute(args) {
        const option = buildableOptions(strategic.catalog).find((candidate) => candidate.handle === args.optionHandle);
        if (!option) throw new TypeError("optionHandle is not in the current catalog revision");
        const [productHandle] = args.optionHandle.split("@facility:");
        const upgrade = productHandle.startsWith("upgrade:");
        const unit = productHandle.startsWith("produce:");
        const internalName = internalNameFromHandle(productHandle, upgrade ? "upgrade" : unit ? "produce" : "build");
        const preexistingObjectIds = (strategic.raw?.objects || [])
          .filter((object) => object.owner === strategic.playerIndex && object.template === internalName)
          .map((object) => object.id);
        const job = strategic.newJob("production", {
          optionHandle: args.optionHandle, internalName, preexistingObjectIds,
        });
        try {
          const result = unit
            ? await call("llmAiGameCommand", {
                sourceId: integer(internalNameFromHandle(option.source, "facility"), "production source ID", 1),
                command: option.command, targetId: 0, x: 0, y: 0, angle: 0, hasPosition: false,
              })
            : await call("llmAiEngineRequest", {
                action: upgrade ? "buildUpgrade" : "buildBuilding", name: internalName, value: 0,
              });
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
      description: "Assign a stable squad handle (preferred) or exceptional explicit object IDs to defend, scout, capture, harass, attackRegion, escort, or regroup. Uses original synchronized order, pathfinding, and combat execution. defend, scout, capture, and regroup require position; escort requires targetId; harass and attackRegion accept either position or an observable targetId. Returns persistent mission ID/state. Freshness: execution frame; one command result.",
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
        if (value.mission === "escort") integer(value.targetId, "targetId", 1);
        else if (TARGETABLE_OFFENSIVE_MISSIONS.has(value.mission)) {
          if (value.targetId === undefined && value.position === undefined) {
            throw new TypeError(`${value.mission} requires position or targetId`);
          }
          if (value.targetId !== undefined) integer(value.targetId, "targetId", 1);
          if (value.position !== undefined) point(value.position, true);
        } else point(value.position, true);
      },
      async execute(args) {
        this.validate(args);
        let objectIds;
        if (args.squadHandle) {
          const raw = await strategic.focused();
          const teamId = integer(args.squadHandle.slice("squad:".length), "squad team ID", 1);
          objectIds = (raw.objects || []).filter((object) => object.owner === raw.localPlayerIndex
            && object.teamId === teamId && isOrderableMissionMember(object, raw.localPlayerIndex)).map((object) => object.id);
          if (objectIds.length === 0) throw new TypeError("squadHandle has no current orderable mobile members");
        } else objectIds = ids(args.objectIds);
        const position = point(args.position);
        const action = args.mission === "escort" ? "guardObject"
          : TARGETABLE_OFFENSIVE_MISSIONS.has(args.mission) && args.targetId ? "attack"
            : ["harass", "attackRegion", "capture"].includes(args.mission) ? "attackMove"
              : args.mission === "defend" ? "guardPosition" : "move";
        const job = strategic.newJob("mission", { mission: args.mission, squadHandle: args.squadHandle || null, objectIds, targetId: args.targetId ?? null, position: position.present ? { x: position.x, y: position.y } : null });
        try {
          const result = await call("llmAiGameOrder", { action, objectIds: objectIds.join(","), targetId: args.targetId ?? 0, x: position.x, y: position.y });
          strategic.supersedeMissions(job);
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
        let records = (raw?.objects || []).map((object) => normalizedEntity(object, raw.localPlayerIndex))
          .filter((record) => ["self", "allied", "enemy"].includes(record.owner)).filter((record) =>
            (filters.owner === "any" || record.owner === filters.owner) && (filters.kind === "any" || record.kind === filters.kind)
            && (filters.handles.length === 0 || filters.handles.includes(record.handle) || filters.handles.includes(record.squadHandle)));
        if (filters.scope === "squad") records = records.filter((record) => record.owner === "self" && record.kind !== "structure");
        if (filters.scope === "contact") records = records.filter((record) => record.owner !== "self");
        if (["base", "facility"].includes(filters.scope)) records = records.filter((record) => record.owner === "self" && record.kind === "structure");
        if (filters.scope === "objective") {
          records = records.filter((record) => record.owner === "enemy" && record.kind === "structure");
          if (raw?.game?.outcome) records.unshift({ handle: "objective:match", kind: "objective", owner: "self", state: raw.game.outcome, frame: raw.frame });
        }
        records.sort((left, right) => (direction === "desc" ? -1 : 1) * left.handle.localeCompare(right.handle));
        return strategic.pager.page(records, pageOptions(args, filters, "handle", direction, `world:${raw?.snapshotId}`));
      },
    },
    {
      name: "query_map_region",
      description: `Query a bounded fog-filtered terrain region at coarse 16x16, medium 32x32, or fine 45x45 resolution. terrain returns heights, route returns traversal flags, and construction returns terrain build-placement flags; construction does not search for structures or objectives. Use inspect_entities for world objects. Unknown cells stay hidden. Row-major order; returned frame/bounds/resolution/filter define freshness. No pagination; one terrain query; hard result ${budget} tokens.`,
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
