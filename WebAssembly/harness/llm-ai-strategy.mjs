import { conservativeLlmTokens } from "./llm-ai-profile.mjs";

const LOGIC_FRAMES_PER_SECOND = 30;
const RECENT_WORK_FRAMES = 30 * LOGIC_FRAMES_PER_SECOND;

function serializedTokens(value, tokenizer) {
  return conservativeLlmTokens(value, { tokenizer });
}

function atomicSummary(value, handle = null) {
  if (typeof value === "string") {
    return { omitted: true, type: "string", characters: value.length, handle };
  }
  if (Array.isArray(value)) {
    return { omitted: true, type: "array", count: value.length, handle };
  }
  if (value && typeof value === "object") {
    const summary = { omitted: true, type: "object", handle };
    for (const [key, entry] of Object.entries(value)) {
      if (["string", "number", "boolean"].includes(typeof entry) && String(entry).length <= 128) {
        summary[key] = entry;
      }
    }
    return summary;
  }
  return value;
}

/** Bound an arbitrary serialized payload without slicing strings or records. */
export function boundLlmPayload(value, maxTokens, { tokenizer, handle = null } = {}) {
  const originalTokens = serializedTokens(value, tokenizer);
  if (originalTokens <= maxTokens) {
    return { value, budget: { maxTokens, serializedTokens: originalTokens, bounded: false } };
  }

  const data = [];
  const envelope = Array.isArray(value)
    ? { bounded: true, originalTokens, data }
    : { bounded: true, originalTokens };
  const omittedRecords = {};
  const appendRecord = (target, record) => {
    target.push(record);
    if (serializedTokens(envelope, tokenizer) <= maxTokens) return true;
    target.pop();
    const summary = atomicSummary(record, record?.handle || record?.id || null);
    target.push(summary);
    if (serializedTokens(envelope, tokenizer) <= maxTokens) return true;
    target.pop();
    return false;
  };
  if (Array.isArray(value)) {
    for (const record of value) if (!appendRecord(data, record)) break;
    envelope.omitted = Math.max(0, value.length - data.length);
  } else {
    for (const [key, entry] of Object.entries(value || {})) {
      if (Array.isArray(entry)) {
        envelope[key] = [];
        let included = 0;
        for (const record of entry) {
          if (!appendRecord(envelope[key], record)) break;
          included += 1;
        }
        if (included < entry.length) omittedRecords[key] = entry.length - included;
        continue;
      }
      envelope[key] = entry;
      if (serializedTokens(envelope, tokenizer) <= maxTokens) continue;
      envelope[key] = atomicSummary(entry, entry?.handle || entry?.id || null);
      if (serializedTokens(envelope, tokenizer) <= maxTokens) continue;
      delete envelope[key];
      break;
    }
    envelope.omittedRecords = omittedRecords;
    envelope.omitted = Math.max(0, Object.keys(value || {}).length
      - Object.keys(envelope).filter((key) => !["bounded", "originalTokens", "omittedRecords", "omitted"].includes(key)).length);
  }
  if (handle) envelope.handle = handle;
  if (serializedTokens(envelope, tokenizer) > maxTokens) {
    const minimal = { bounded: true, originalTokens, handle, omitted: true };
    return { value: minimal, budget: {
      maxTokens, serializedTokens: serializedTokens(minimal, tokenizer), bounded: true,
    } };
  }
  return { value: envelope, budget: {
    maxTokens, serializedTokens: serializedTokens(envelope, tokenizer), bounded: true,
  } };
}

function encodeCursor(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeCursor(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
}

function queryHash(value) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class StableQueryPager {
  constructor({ maximumSnapshots = 16 } = {}) {
    this.maximumSnapshots = maximumSnapshots;
    this.serial = 0;
    this.snapshots = new Map();
  }

  page(records, { filters = {}, order = ["handle", "asc"], limit = 24, cursor = null,
    revision = "current" } = {}) {
    const boundedLimit = Math.max(1, Math.min(64, Number(limit) || 24));
    const hash = queryHash({ filters, order });
    let snapshot;
    let offset = 0;
    if (cursor) {
      let decoded;
      try { decoded = decodeCursor(cursor); } catch { throw new TypeError("cursor is malformed"); }
      snapshot = this.snapshots.get(decoded.snapshot);
      if (!snapshot || snapshot.hash !== hash) throw new TypeError("cursor is stale or belongs to another query");
      offset = decoded.offset;
    } else {
      const id = `${revision}:${++this.serial}`;
      snapshot = { id, hash, records: structuredClone(records) };
      this.snapshots.set(id, snapshot);
      while (this.snapshots.size > this.maximumSnapshots) this.snapshots.delete(this.snapshots.keys().next().value);
    }
    const items = snapshot.records.slice(offset, offset + boundedLimit);
    const nextOffset = offset + items.length;
    return {
      appliedFilters: filters,
      order: { field: order[0], direction: order[1], tieBreak: "handle asc" },
      snapshot: snapshot.id,
      count: items.length,
      total: snapshot.records.length,
      nextCursor: nextOffset < snapshot.records.length
        ? encodeCursor({ snapshot: snapshot.id, offset: nextOffset }) : null,
      items,
    };
  }
}

export function canonicalSemanticValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
}

function tags(record, field) {
  return Array.isArray(record?.[field]) ? record[field] : [];
}

export function hasSemanticTag(record, field, expected) {
  const wanted = canonicalSemanticValue(expected);
  return wanted !== "" && tags(record, field).some((value) => canonicalSemanticValue(value) === wanted);
}

export function hasCategory(record, expected) {
  return hasSemanticTag(record, "categories", expected);
}

export function terrainKnowledgeRows(result) {
  const columns = Number(result?.columns);
  const rows = Number(result?.rows);
  const encoded = result?.flags?.data;
  if (!Number.isSafeInteger(columns) || columns < 1 || columns > 128
      || !Number.isSafeInteger(rows) || rows < 1 || rows > 128
      || typeof encoded !== "string") {
    throw new TypeError("terrain visibility payload is invalid");
  }
  const binary = atob(encoded);
  if (binary.length !== columns * rows) {
    throw new TypeError("terrain flags have an unexpected size");
  }
  const symbols = ["?", "e", "v", "?"];
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) =>
      symbols[binary.charCodeAt(row * columns + column) & 0x03]).join(""));
}

export function isConstructionComplete(record) {
  const value = record?.construction;
  const progress = Number(value);
  if (value !== null && value !== undefined && Number.isFinite(progress)) return progress < 0 || progress >= 100;
  return !hasSemanticTag(record, "status", "underConstruction");
}

export function isStrategicEntity(record) {
  if (hasCategory(record, "projectile")) return false;
  return ["structure", "infantry", "vehicle", "aircraft"]
    .some((kind) => hasCategory(record, kind))
    || record?.capabilities?.orderable === true;
}

export function isEconomicUnit(record) {
  return hasCategory(record, "builder") || hasCategory(record, "harvester");
}

export function isManagedSquadMember(record, localPlayerIndex) {
  return record?.owner === localPlayerIndex && !hasCategory(record, "structure")
    && !isEconomicUnit(record)
    && record?.capabilities?.orderable === true && record?.capabilities?.mobile === true
    && isConstructionComplete(record);
}

export function managedSquadHandle(record, localPlayerIndex) {
  return isManagedSquadMember(record, localPlayerIndex) && Number.isInteger(record.teamId)
    ? `squad:${record.teamId}` : null;
}

export function coarseKind(record) {
  if (hasCategory(record, "structure")) return "structure";
  if (hasCategory(record, "aircraft")) return "aircraft";
  if (hasCategory(record, "vehicle")) return "vehicle";
  if (hasCategory(record, "infantry")) return "infantry";
  return "unit";
}

function semanticHandle(record, localPlayerIndex) {
  const prefix = record.owner === localPlayerIndex
    ? (hasCategory(record, "structure") ? "facility" : "unit") : "contact";
  return `${prefix}:${record.id}`;
}

function normalizedOwnership(record, localPlayerIndex) {
  if (record?.owner === localPlayerIndex) return "self";
  const relationship = canonicalSemanticValue(record?.relationship);
  if (["enemy", "enemies", "hostile"].includes(relationship)) return "enemy";
  if (["ally", "allies", "allied", "friendly"].includes(relationship)) return "allied";
  return relationship || "neutral";
}

function semanticRoles(record) {
  const kindTags = new Set(["structure", "aircraft", "vehicle", "infantry"]);
  return [...new Set(tags(record, "categories")
    .map(canonicalSemanticValue).filter((tag) => tag && !kindTags.has(tag)))];
}

function position2d(value) {
  if (Array.isArray(value) && value.length >= 2) return { x: Number(value[0]), y: Number(value[1]) };
  if (value && typeof value === "object") return { x: Number(value.x), y: Number(value.y) };
  return null;
}

function roundedPosition(value) {
  const position = position2d(value);
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return { x: Math.round(position.x * 10) / 10, y: Math.round(position.y * 10) / 10 };
}

function healthPercent(record) {
  const health = Array.isArray(record?.health)
    ? { current: record.health[0], max: record.health[1] } : record?.health;
  return Number.isFinite(health?.current) && health?.max > 0
    ? Math.max(0, Math.round(100 * health.current / health.max)) : null;
}

function normalizedCapabilities(record) {
  const capabilities = record?.capabilities;
  if (!capabilities || typeof capabilities !== "object") return null;
  const result = {};
  for (const name of ["selectable", "orderable", "mobile", "attack", "production"]) {
    if (typeof capabilities[name] === "boolean") result[name] = capabilities[name];
  }
  for (const name of ["weaponRange", "visionRange"]) {
    const value = capabilities[name];
    if (value !== null && value !== undefined && Number.isFinite(Number(value))) result[name] = Number(value);
  }
  return Object.keys(result).length > 0 ? result : null;
}

function summarizeForces(objects, localPlayerIndex) {
  const groups = new Map();
  for (const object of objects) {
    const owner = normalizedOwnership(object, localPlayerIndex);
    if (!["self", "allied", "enemy"].includes(owner)) continue;
    if (coarseKind(object) === "structure" || !isStrategicEntity(object)) continue;
    const ownership = owner === "self" ? "owned" : owner;
    const economicRole = hasCategory(object, "builder") ? "builder"
      : hasCategory(object, "harvester") ? "harvester" : null;
    const squadHandle = owner === "self" ? managedSquadHandle(object, localPlayerIndex) : null;
    const handle = squadHandle || `force:${ownership}:${economicRole || coarseKind(object)}`;
    const current = groups.get(handle) || {
      handle, missionHandle: squadHandle, ownership, count: 0, damaged: 0, incomplete: 0,
      composition: {}, _roles: new Set(), _positions: [],
    };
    current.count += 1;
    const kind = coarseKind(object);
    current.composition[kind] = (current.composition[kind] || 0) + 1;
    for (const role of semanticRoles(object)) current._roles.add(role);
    const position = roundedPosition(object.position);
    if (position) current._positions.push(position);
    const health = Array.isArray(object.health)
      ? { current: object.health[0], max: object.health[1] } : object.health;
    if (health?.max > 0 && health.current < health.max * 0.7) current.damaged += 1;
    if (!isConstructionComplete(object)) current.incomplete += 1;
    groups.set(handle, current);
  }
  return [...groups.values()].map((group) => {
    const kinds = Object.keys(group.composition).sort();
    const position = group._positions.length > 0 ? {
      x: Math.round(group._positions.reduce((sum, entry) => sum + entry.x, 0)
        / group._positions.length * 10) / 10,
      y: Math.round(group._positions.reduce((sum, entry) => sum + entry.y, 0)
        / group._positions.length * 10) / 10,
    } : null;
    return {
      handle: group.handle,
      missionHandle: group.missionHandle,
      ownership: group.ownership,
      kind: kinds.length === 1 ? kinds[0] : "mixed",
      composition: group.composition,
      roles: [...group._roles].sort(),
      count: group.count,
      damaged: group.damaged,
      incomplete: group.incomplete,
      position,
    };
  }).sort((left, right) => left.handle.localeCompare(right.handle));
}

function summarizeFacilities(objects, localPlayerIndex) {
  return objects.filter((object) => object.owner === localPlayerIndex
      && coarseKind(object) === "structure")
    .map((object) => ({
      handle: semanticHandle(object, localPlayerIndex),
      roles: semanticRoles(object),
      health: healthPercent(object),
      construction: isConstructionComplete(object)
        ? { state: "complete" }
        : { state: "constructing", percent: object.construction },
      position: roundedPosition(object.position),
    }))
    .sort((left, right) => left.handle.localeCompare(right.handle));
}

function summarizeProduction(objects, localPlayerIndex) {
  const result = [];
  for (const object of objects) {
    if (object.owner !== localPlayerIndex) continue;
    const queue = object.capabilities?.productionQueue;
    if (!Array.isArray(queue) || queue.length === 0) continue;
    result.push({ facility: semanticHandle(object, localPlayerIndex), queue: queue.map((entry) => ({
      type: entry.type ?? entry.kind ?? null,
      name: entry.name ?? null,
      progress: entry.progress ?? entry.percentComplete ?? null,
    })) });
  }
  return result.sort((left, right) => left.facility.localeCompare(right.facility));
}

function summarizeObjectives(objects, localPlayerIndex) {
  return objects.filter((object) => normalizedOwnership(object, localPlayerIndex) === "enemy"
      && coarseKind(object) === "structure")
    .map((object) => {
      const health = Array.isArray(object.health)
        ? { current: object.health[0], max: object.health[1] } : object.health;
      return {
        handle: semanticHandle(object, localPlayerIndex),
        kind: "structure",
        roles: semanticRoles(object),
        position: object.position,
        health: health?.max > 0 ? Math.round(100 * health.current / health.max) : null,
        construction: isConstructionComplete(object)
          ? { state: "complete" }
          : { state: "constructing", percent: object.construction },
      };
    })
    .sort((left, right) => left.handle.localeCompare(right.handle));
}

function objectDelta(previous, current, localPlayerIndex) {
  if (!previous) return [];
  const relevant = (object) => ["self", "allied", "enemy"]
    .includes(normalizedOwnership(object, localPlayerIndex)) && isStrategicEntity(object);
  const before = new Map((previous.objects || []).filter(relevant)
    .map((object) => [object.id, object]));
  const after = new Map((current.objects || []).filter(relevant)
    .map((object) => [object.id, object]));
  const deltas = [];
  for (const object of after.values()) {
    const prior = before.get(object.id);
    if (!prior) deltas.push({
      type: "appeared",
      handle: semanticHandle(object, localPlayerIndex),
      owner: normalizedOwnership(object, localPlayerIndex),
      kind: coarseKind(object),
    });
    else {
      const oldHealth = Array.isArray(prior.health) ? prior.health[0] : prior.health?.current;
      const newHealth = Array.isArray(object.health) ? object.health[0] : object.health?.current;
      if (Number.isFinite(oldHealth) && Number.isFinite(newHealth) && newHealth < oldHealth) {
        deltas.push({
          type: "damaged",
          handle: semanticHandle(object, localPlayerIndex),
          owner: normalizedOwnership(object, localPlayerIndex),
          kind: coarseKind(object),
          healthLost: Math.round(oldHealth - newHealth),
        });
      }
    }
  }
  for (const object of before.values()) {
    if (after.has(object.id)) continue;
    const owner = normalizedOwnership(object, localPlayerIndex);
    const health = Array.isArray(object.health) ? object.health[0] : object.health?.current;
    deltas.push({
      type: Number.isFinite(health) && health <= 0 ? "destroyed"
        : owner === "self" ? "lost" : "lostContact",
      handle: semanticHandle(object, localPlayerIndex),
      owner,
      kind: coarseKind(object),
      lastKnownPosition: roundedPosition(object.position),
      lastKnownHealth: healthPercent(object),
    });
  }
  return deltas.sort((left, right) => left.handle.localeCompare(right.handle));
}

function nonnegativeDifference(current, previous, fallback) {
  const currentNumber = Number(current);
  const previousNumber = Number(previous);
  return Number.isFinite(currentNumber) && Number.isFinite(previousNumber)
    ? Math.max(0, currentNumber - previousNumber) : fallback;
}

function summarizeCombat(objects, deltas, localPlayerIndex, currentRecord, previousRecord) {
  const ownedCombat = objects.filter((object) => isManagedSquadMember(object, localPlayerIndex));
  const visibleEnemyCombat = objects.filter((object) =>
    normalizedOwnership(object, localPlayerIndex) === "enemy"
      && coarseKind(object) !== "structure" && !isEconomicUnit(object));
  const visibleEnemyStructures = objects.filter((object) =>
    normalizedOwnership(object, localPlayerIndex) === "enemy"
      && coarseKind(object) === "structure");
  return {
    ownedReady: ownedCombat.length,
    ownedDamaged: ownedCombat.filter((object) => {
      const health = healthPercent(object);
      return health !== null && health < 100;
    }).length,
    visibleEnemies: visibleEnemyCombat.length,
    visibleEnemyStructures: visibleEnemyStructures.length,
    cumulative: currentRecord || null,
    sincePrevious: {
      ownedUnitsLost: nonnegativeDifference(currentRecord?.unitsLost, previousRecord?.unitsLost,
        deltas.filter((delta) => delta.owner === "self"
          && delta.type === "lost" && delta.kind !== "structure").length),
      confirmedEnemyUnitsDestroyed: nonnegativeDifference(
        currentRecord?.enemyUnitsDestroyed, previousRecord?.enemyUnitsDestroyed,
        deltas.filter((delta) => delta.owner === "enemy"
          && delta.type === "destroyed" && delta.kind !== "structure").length),
      confirmedEnemyStructuresDestroyed: nonnegativeDifference(
        currentRecord?.enemyStructuresDestroyed, previousRecord?.enemyStructuresDestroyed,
        deltas.filter((delta) => delta.owner === "enemy"
          && delta.type === "destroyed" && delta.kind === "structure").length),
    },
  };
}

export function isRelevantStrategicWork(job, frame) {
  if (!["complete", "failed", "blocked"].includes(job.state)) return true;
  if (job.blockedReason?.startsWith("superseded by ")) return false;
  return frame - (job.updatedFrame ?? job.createdFrame ?? 0) <= RECENT_WORK_FRAMES;
}

function missionMembers(job, raw) {
  const assigned = new Set(job.objectIds || []);
  return (raw.objects || []).filter((object) => assigned.has(object.id)
    && isManagedSquadMember(object, raw.localPlayerIndex));
}

function composition(records) {
  return records.reduce((result, record) => {
    const kind = coarseKind(record);
    result[kind] = (result[kind] || 0) + 1;
    return result;
  }, {});
}

function routineWork(jobs, raw) {
  const frame = raw.frame;
  const relevant = jobs.filter((job) => isRelevantStrategicWork(job, frame));
  return {
    missions: relevant.filter((job) => job.type === "mission").map((job) => {
      const surviving = missionMembers(job, raw);
      return {
        id: job.id,
        squadHandle: job.squadHandle || null,
        mission: job.mission || null,
        state: job.state,
        assignedAtStart: (job.objectIds || []).length,
        survivingAssigned: surviving.length,
        survivingComposition: composition(surviving),
        position: job.position || null,
        target: Number.isInteger(job.targetId) ? `contact:${job.targetId}` : null,
        blockedReason: job.blockedReason || null,
      };
    }),
    jobs: relevant.filter((job) => job.type !== "mission").map((job) => ({
      id: job.id,
      type: job.type,
      state: job.state,
      optionHandle: job.optionHandle || job.archetypeHandle || null,
      squadHandle: job.squadHandle || null,
      blockedReason: job.blockedReason || null,
    })),
  };
}

export function compactRoutineObservation(raw, {
  assignment, match, reason, previous = null, priorities = {}, jobs = [], catalogRevision = null,
  scoutingCoverage = null, maxTokens = 8_192, tokenizer,
} = {}) {
  const local = (raw.players || []).find((player) => player.index === raw.localPlayerIndex || player.local);
  const relevant = (raw.objects || []).filter((object) =>
    ["self", "allied", "enemy"].includes(normalizedOwnership(object, raw.localPlayerIndex))
      && isStrategicEntity(object));
  const previousFrame = Number(previous?.frame);
  const elapsedFrames = Number.isFinite(previousFrame)
    ? Math.max(0, raw.frame - previousFrame) : 0;
  const deltas = objectDelta(previous, raw, raw.localPlayerIndex);
  const work = routineWork(jobs, raw);
  const previousLocal = (previous?.players || []).find((player) =>
    player.index === raw.localPlayerIndex || player.local);
  const observation = {
    schema: "new-shoes.llm-routine/4",
    snapshot: raw.snapshotId,
    frame: raw.frame,
    time: {
      logicFramesPerSecond: LOGIC_FRAMES_PER_SECOND,
      gameSeconds: Math.round(raw.frame / LOGIC_FRAMES_PER_SECOND * 10) / 10,
      sincePrevious: {
        frames: elapsedFrames,
        gameSeconds: Math.round(elapsedFrames / LOGIC_FRAMES_PER_SECOND * 10) / 10,
      },
    },
    reason,
    assignment,
    match,
    game: raw.game,
    terrain: raw.terrain?.extent ? { extent: raw.terrain.extent } : null,
    scoutingCoverage,
    strategyController: raw.strategyController || assignment?.strategyController || "llm",
    economy: local?.economy || null,
    priorities,
    forces: summarizeForces(relevant.filter((object) =>
      normalizedOwnership(object, raw.localPlayerIndex) !== "enemy"), raw.localPlayerIndex),
    combat: summarizeCombat(relevant, deltas, raw.localPlayerIndex,
      local?.combatRecord, previousLocal?.combatRecord),
    facilities: summarizeFacilities(relevant, raw.localPlayerIndex),
    production: summarizeProduction(relevant, raw.localPlayerIndex),
    jobs: work.jobs,
    missions: work.missions,
    threats: summarizeForces(relevant.filter((object) =>
      normalizedOwnership(object, raw.localPlayerIndex) === "enemy"
      && !isEconomicUnit(object)), raw.localPlayerIndex),
    objectives: raw.game?.outcome
      ? [{ handle: "objective:match", state: raw.game.outcome }]
      : summarizeObjectives(relevant, raw.localPlayerIndex),
    deltas,
    catalogRevision,
    detailTools: ["inspect_entities", "inspect_job", "query_buildable_options", "query_map_region"],
  };
  const result = boundLlmPayload(observation, maxTokens, { tokenizer, handle: `snapshot:${raw.snapshotId}` });
  return result.value;
}

export function normalizedEntity(record, localPlayerIndex) {
  const health = Array.isArray(record.health)
    ? { current: record.health[0], max: record.health[1] } : record.health;
  return {
    handle: semanticHandle(record, localPlayerIndex),
    kind: coarseKind(record),
    owner: normalizedOwnership(record, localPlayerIndex),
    squadHandle: managedSquadHandle(record, localPlayerIndex),
    roles: semanticRoles(record),
    position: record.position,
    health,
    construction: record.construction,
    status: record.status,
    capabilities: normalizedCapabilities(record),
    motion: record.motion?.ai ? {
      state: record.motion.ai.state,
      goal: record.motion.ai.goalObjectId ? `contact:${record.motion.ai.goalObjectId}` : null,
      goalPosition: record.motion.ai.goalPosition,
    } : null,
  };
}

export function buildableOptions(catalog) {
  const definitions = catalog?.commandSets || {};
  const states = catalog?.objectCapabilities || {};
  const engineBuildings = new Set(catalog?.engineServices?.availableBuildingTemplates || []);
  const engineUpgrades = new Set(catalog?.engineServices?.availableUpgrades || []);
  const records = [];
  for (const [sourceId, capability] of Object.entries(states)) {
    const commands = definitions[capability?.commandSet] || [];
    for (const command of commands) {
      const state = capability?.commandState?.[command.name] || {};
      const source = `facility:${sourceId}`;
      if (command.product && hasCategory(command.product, "structure")
          && engineBuildings.has(command.product.template)) records.push({
        handle: `build:${command.product.template}`,
        purpose: "structure",
        roles: semanticRoles(command.product),
        combatProfile: command.product.combatProfile || null,
        cost: command.product.cost,
        buildFrames: command.product.buildFrames,
        prerequisites: state.availability || "unknown",
        ready: state.availability === "available",
        source,
        command: command.name,
      });
      const productKind = command.product ? coarseKind(command.product) : null;
      if (command.type === "produce" && ["infantry", "vehicle", "aircraft"].includes(productKind)) {
        records.push({
          handle: `produce:${command.product.template}@${source}`,
          purpose: productKind,
          roles: semanticRoles(command.product),
          combatProfile: command.product.combatProfile || null,
          cost: command.product.cost,
          buildFrames: command.product.buildFrames,
          prerequisites: state.availability || "unknown",
          ready: state.availability === "available",
          source,
          command: command.name,
        });
      }
      if (command.upgrade && engineUpgrades.has(command.upgrade.name)) records.push({
        handle: `upgrade:${command.upgrade.name}`,
        purpose: "technology",
        cost: command.upgrade.cost,
        buildFrames: command.upgrade.buildFrames,
        prerequisites: state.complete ? "complete" : "available",
        ready: !state.complete,
        source,
        command: command.name,
      });
    }
  }
  for (const name of catalog?.engineServices?.teamPrototypes || []) records.push({
    handle: `force:${name}`, purpose: "force", cost: null, buildFrames: null,
    prerequisites: "validated-on-request", ready: false, source: "engine:team-factory",
  });
  const unique = new Map();
  for (const record of records) {
    const key = `${record.handle}:${record.source}`;
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()].sort((left, right) =>
    left.handle.localeCompare(right.handle) || left.source.localeCompare(right.source));
}

export function internalNameFromHandle(handle, prefix) {
  const expected = `${prefix}:`;
  if (typeof handle !== "string" || !handle.startsWith(expected) || handle.length <= expected.length) {
    throw new TypeError(`handle must start with ${expected}`);
  }
  return handle.slice(expected.length);
}
