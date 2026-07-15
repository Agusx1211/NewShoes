import { LlmAiAgentRuntime } from "./llm-ai-agent.mjs";
import {
  createLlmAiProfile,
  DEFAULT_LLM_AI_MANDATE,
  publicLlmAiProfile,
  redactLlmAiData,
} from "./llm-ai-profile.mjs";
import {
  discoverLlmAiModels,
  probeLlmAiEndpoint,
} from "./llm-ai-openai-client.mjs";
import { LlmAiStore } from "./llm-ai-store.mjs";

const desktop = window.ZeroHDesktop;
const store = new LlmAiStore();
let profiles = [];
let sessions = [];
let selectedProfileId = null;
let selectedSessionId = null;
let discoveredModels = [];
let pendingContextSize = null;
let contextEdited = false;
let discoveryGeneration = 0;
let discoveryTimer = null;

const byId = (id) => document.getElementById(id);
const profileForm = byId("llmAiProfileForm");
const status = byId("llmAiFormStatus");

function setStatus(message, kind = "") {
  status.textContent = message;
  status.classList.toggle("is-error", kind === "error");
  status.classList.toggle("is-success", kind === "success");
}

function selectedProfile() {
  return profiles.find((profile) => profile.id === selectedProfileId) || null;
}

function connectionInput() {
  return {
    endpoint: byId("llmAiEndpoint").value,
    apiKey: byId("llmAiApiKey").value,
    requestTimeoutMs: selectedProfile()?.requestTimeoutMs || 120_000,
  };
}

function formInput() {
  return {
    id: byId("llmAiProfileId").value || undefined,
    name: byId("llmAiName").value,
    endpoint: byId("llmAiEndpoint").value,
    model: byId("llmAiModel").value,
    apiKey: byId("llmAiApiKey").value,
    thinkingEffort: byId("llmAiThinking").value,
    contextSize: Number(byId("llmAiContext").value),
    routineObservationTokens: Number(byId("llmAiObservationTokens").value),
    toolResultTokens: Number(byId("llmAiToolResultTokens").value),
    recentContextTokens: Number(byId("llmAiRecentContextTokens").value),
    mandate: byId("llmAiMandate").value,
    toolProtocol: byId("llmAiToolProtocol").value,
    planningIntervalMs: Number(byId("llmAiPlanningInterval").value),
    classicFallback: byId("llmAiClassicFallback").checked,
  };
}

function clearDiagnostics() {
  byId("llmAiDiagnostics").hidden = true;
  byId("llmAiDiagnosticsSummary").textContent = "";
  byId("llmAiDiagnosticChecks").replaceChildren();
}

function renderDiagnostics(result = null, error = null) {
  const panel = byId("llmAiDiagnostics");
  const checks = result?.checks || error?.checks || [{
    id: error?.stage || "provider",
    status: "fail",
    label: "Diagnostic stopped",
    detail: error?.message || String(error),
  }];
  panel.hidden = false;
  byId("llmAiDiagnosticsSummary").textContent = result
    ? `${result.latencyMs} ms · ${result.protocol} protocol`
    : `Failed at ${error?.stage || "provider"}`;
  const list = byId("llmAiDiagnosticChecks");
  list.replaceChildren();
  for (const check of checks) {
    const item = document.createElement("li");
    item.className = check.status === "pass" ? "is-pass" : check.status === "fail" ? "is-fail" : "is-info";
    item.dataset.check = check.id;
    const label = document.createElement("strong");
    label.textContent = check.label;
    const detail = document.createElement("span");
    detail.textContent = check.detail;
    detail.title = check.detail;
    item.append(label, detail);
    list.append(item);
  }
}

function renderContextMetadata({ allowAutoApply = true } = {}) {
  const model = discoveredModels.find((candidate) => candidate.id === byId("llmAiModel").value.trim());
  const hint = byId("llmAiContextHint");
  const apply = byId("llmAiApplyContext");
  pendingContextSize = model?.contextSize || null;
  if (!pendingContextSize) {
    hint.textContent = discoveredModels.length > 0
      ? "Provider did not report this model's context"
      : "Manual until reported by the provider";
    apply.hidden = true;
    return;
  }
  hint.textContent = `${pendingContextSize.toLocaleString()} detected · ${model.contextSource}`;
  if (allowAutoApply && !contextEdited) byId("llmAiContext").value = String(pendingContextSize);
  const alreadyApplied = Number(byId("llmAiContext").value) === pendingContextSize;
  apply.textContent = `Use ${pendingContextSize.toLocaleString()}`;
  apply.hidden = alreadyApplied;
}

function renderModelCatalog(result) {
  discoveredModels = result?.models || [];
  const options = byId("llmAiModelOptions");
  options.replaceChildren();
  for (const model of discoveredModels) {
    const option = document.createElement("option");
    option.value = model.id;
    option.label = [
      model.contextSize ? `${model.contextSize.toLocaleString()} ctx` : "context unknown",
      model.supportsTools ? "tool use" : null,
      model.state,
    ].filter(Boolean).join(" · ");
    options.append(option);
  }
  const current = byId("llmAiModel");
  if (!current.value.trim() && discoveredModels.length > 0) current.value = discoveredModels[0].id;
  const selectedIsReported = discoveredModels.some((model) => model.id === current.value.trim());
  byId("llmAiModelHint").textContent = discoveredModels.length === 0
    ? "Provider returned no model names"
    : `${discoveredModels.length} available${selectedIsReported ? " · selected model reported" : " · custom model retained"}`;
  renderContextMetadata();
}

async function loadModels({ automatic = false } = {}) {
  if (!byId("llmAiEndpoint").value.trim()) {
    discoveredModels = [];
    byId("llmAiModelOptions").replaceChildren();
    byId("llmAiModelHint").textContent = "Enter an endpoint to discover models";
    renderContextMetadata();
    return null;
  }
  const generation = ++discoveryGeneration;
  const button = byId("llmAiDiscoverModels");
  button.disabled = true;
  byId("llmAiModelHint").textContent = "Loading provider catalog…";
  if (!automatic) setStatus("Loading available models and context metadata…");
  try {
    const result = await discoverLlmAiModels(connectionInput());
    if (generation !== discoveryGeneration) return null;
    renderModelCatalog(result);
    if (!automatic) {
      const context = pendingContextSize
        ? ` Context detected: ${pendingContextSize.toLocaleString()} tokens.`
        : " The provider did not report a context limit.";
      setStatus(`Loaded ${result.models.length} model${result.models.length === 1 ? "" : "s"} in ${result.latencyMs} ms.${context}`, "success");
    }
    return result;
  } catch (error) {
    if (generation !== discoveryGeneration) return null;
    discoveredModels = [];
    byId("llmAiModelOptions").replaceChildren();
    byId("llmAiModelHint").textContent = `Discovery unavailable: ${error.message}`;
    renderContextMetadata();
    if (!automatic) throw error;
    return null;
  } finally {
    if (generation === discoveryGeneration) button.disabled = false;
  }
}

function queueModelDiscovery() {
  clearTimeout(discoveryTimer);
  discoveryGeneration += 1;
  if (!byId("llmAiEndpoint").value.trim()) {
    void loadModels({ automatic: true });
    return;
  }
  discoveryTimer = setTimeout(() => void loadModels({ automatic: true }), 350);
}

function fillForm(profile = null) {
  clearTimeout(discoveryTimer);
  discoveryGeneration += 1;
  discoveredModels = [];
  pendingContextSize = null;
  contextEdited = Boolean(profile);
  selectedProfileId = profile?.id || null;
  byId("llmAiProfileId").value = profile?.id || "";
  byId("llmAiName").value = profile?.name || "";
  byId("llmAiEndpoint").value = profile?.endpoint || "";
  byId("llmAiModel").value = profile?.model || "";
  byId("llmAiApiKey").value = profile?.apiKey || "";
  byId("llmAiThinking").value = profile?.thinkingEffort || "medium";
  byId("llmAiContext").value = String(profile?.contextSize || 262_144);
  byId("llmAiMandate").value = profile?.mandate || DEFAULT_LLM_AI_MANDATE;
  byId("llmAiToolProtocol").value = profile?.toolProtocol === "structured" ? "structured" : "native";
  byId("llmAiObservationTokens").value = String(profile?.routineObservationTokens || 8_192);
  byId("llmAiToolResultTokens").value = String(profile?.toolResultTokens || 4_096);
  byId("llmAiRecentContextTokens").value = String(profile?.recentContextTokens || 20_000);
  byId("llmAiPlanningInterval").value = String(profile?.planningIntervalMs || 2_000);
  byId("llmAiClassicFallback").checked = profile?.classicFallback !== false;
  byId("llmAiFormTitle").textContent = profile ? profile.name : "New commander";
  byId("llmAiDeleteProfile").disabled = !profile;
  byId("llmAiDuplicateProfile").disabled = !profile;
  byId("llmAiSavedBadge").hidden = true;
  byId("llmAiModelOptions").replaceChildren();
  byId("llmAiModelHint").textContent = profile?.endpoint
    ? "Loading provider catalog…"
    : "Enter an endpoint to discover models";
  renderContextMetadata();
  clearDiagnostics();
  setStatus(profile
    ? `Last saved ${new Date(profile.updatedAt).toLocaleString()}. The API key is local and never included in exports.`
    : "Profiles and session traces stay in this browser.");
  renderProfiles();
  if (profile?.endpoint) queueModelDiscovery();
}

function renderProfiles() {
  const list = byId("llmAiProfileList");
  list.replaceChildren();
  byId("llmAiProfileEmpty").hidden = profiles.length > 0;
  for (const profile of profiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `llm-ai-profile-card${profile.id === selectedProfileId ? " is-selected" : ""}`;
    const name = document.createElement("strong");
    name.textContent = profile.name;
    const model = document.createElement("small");
    model.textContent = profile.model;
    model.title = profile.model;
    const endpoint = document.createElement("small");
    endpoint.textContent = profile.endpoint;
    endpoint.title = profile.endpoint;
    const state = document.createElement("small");
    state.className = "llm-ai-profile-state";
    state.textContent = `${profile.contextSize.toLocaleString()} ctx · ${profile.toolProtocol}`;
    button.append(name, model, endpoint, state);
    button.addEventListener("click", () => fillForm(profile));
    list.append(button);
  }
}

function formatDuration(session) {
  const end = session.endedAt || Date.now();
  const seconds = Math.max(0, Math.round((end - session.startedAt) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function renderSessions() {
  const list = byId("llmAiSessionList");
  list.replaceChildren();
  byId("llmAiSessionEmpty").hidden = sessions.length > 0;
  for (const session of sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `llm-ai-session-card${session.id === selectedSessionId ? " is-selected" : ""}`;
    const profile = profiles.find((candidate) => candidate.id === session.profileId);
    const title = document.createElement("strong");
    title.textContent = profile?.name || session.profileSnapshot?.name || "Deleted commander";
    const state = document.createElement("small");
    state.textContent = `${session.status}${session.outcome ? ` · ${session.outcome}` : ""} · ${formatDuration(session)}`;
    const date = document.createElement("small");
    date.textContent = new Date(session.startedAt).toLocaleString();
    button.append(title, state, date);
    button.addEventListener("click", () => void runUiAction(() => selectSession(session.id)));
    list.append(button);
  }
}

function eventLabel(type) {
  return readableLabel(type.replaceAll(".", " › "));
}

function transcriptElement(tag, className = "", text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null) element.textContent = String(text);
  return element;
}

function readableLabel(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function formatRelativeTime(timestamp, startedAt) {
  if (!Number.isFinite(timestamp) || !Number.isFinite(startedAt)) return "";
  const seconds = Math.max(0, Math.round((timestamp - startedAt) / 100) / 10);
  return `+${seconds.toFixed(1)}s`;
}

function compactValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    if (value.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
      return value.map(compactValue).join(", ");
    }
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
    return `${Math.round(value.x)}, ${Math.round(value.y)}`;
  }
  const identity = [value.handle, value.id, value.name, value.type, value.state]
    .filter((item, index, values) => item !== undefined && values.indexOf(item) === index);
  if (identity.length > 0) return identity.map(compactValue).join(" · ");
  const serialized = JSON.stringify(value);
  return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
}

function appendChips(parent, entries) {
  const visible = entries.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (visible.length === 0) return;
  const chips = transcriptElement("div", "llm-ai-transcript-chips");
  for (const [label, value, tone = ""] of visible) {
    const chip = transcriptElement("span", `llm-ai-transcript-chip${tone ? ` is-${tone}` : ""}`);
    chip.append(
      transcriptElement("small", "", label),
      transcriptElement("strong", "", compactValue(value)),
    );
    chips.append(chip);
  }
  parent.append(chips);
}

function appendKeyValues(parent, record, { omit = [], limit = 10 } = {}) {
  if (!record || typeof record !== "object") return;
  const entries = Object.entries(record)
    .filter(([key, value]) => !omit.includes(key) && value !== undefined)
    .slice(0, limit);
  if (entries.length === 0) return;
  const list = transcriptElement("dl", "llm-ai-transcript-fields");
  for (const [key, value] of entries) {
    list.append(
      transcriptElement("dt", "", readableLabel(key)),
      transcriptElement("dd", "", compactValue(value)),
    );
  }
  parent.append(list);
}

function rawEventDetails(event) {
  const details = transcriptElement("details", "llm-ai-raw-details");
  const pre = transcriptElement("pre");
  details.append(transcriptElement("summary", "", `Raw event data · #${event.sequence} ${event.type}`), pre);
  details.addEventListener("toggle", () => {
    if (details.open && !pre.textContent) pre.textContent = JSON.stringify(event.data, null, 2);
  });
  return details;
}

function transcriptCard(event, kind, title, subtitle, startedAt) {
  const row = transcriptElement("li", `llm-ai-transcript-card is-${kind}`);
  row.dataset.eventType = event.type;
  const header = transcriptElement("header", "llm-ai-transcript-header");
  const heading = transcriptElement("div");
  heading.append(transcriptElement("strong", "", title));
  if (subtitle) heading.append(transcriptElement("span", "", subtitle));
  header.append(
    heading,
    transcriptElement("time", "", formatRelativeTime(event.timestamp, startedAt)),
  );
  row.append(header);
  return row;
}

function toolResultSummary(event) {
  if (!event) return { ok: null, message: "No result recorded" };
  const data = event.data || {};
  const result = data.result || {};
  const ok = data.ok ?? result.ok ?? null;
  const message = result.error || data.error || result.message
    || (result.job ? `Job ${result.job.id || "queued"} · ${result.job.state || result.job.type || "accepted"}` : null)
    || (result.mission ? `Mission ${result.mission.id || result.mission.handle || "accepted"}` : null)
    || (ok === true ? "Completed successfully" : ok === false ? "Action failed" : "Result recorded");
  return { ok, message, result };
}

function renderToolCall(call, resultEvent, index) {
  const result = toolResultSummary(resultEvent);
  const item = transcriptElement("section", `llm-ai-tool-call${result.ok === false ? " is-error" : result.ok === true ? " is-success" : ""}`);
  const header = transcriptElement("header");
  const number = transcriptElement("span", "llm-ai-tool-order", index + 1);
  const name = transcriptElement("strong", "", readableLabel(call.name || "Tool call"));
  const handle = transcriptElement("code", "", call.name || "unknown_tool");
  const statusText = result.ok === false ? "Failed" : result.ok === true ? "Succeeded" : "Pending";
  header.append(number, name, handle, transcriptElement("span", "llm-ai-tool-status", statusText));
  item.append(header);
  appendKeyValues(item, call.arguments, { limit: 12 });
  const outcome = transcriptElement("div", "llm-ai-tool-result", result.message);
  item.append(outcome);
  if (result.result && typeof result.result === "object") {
    const details = transcriptElement("details", "llm-ai-tool-result-details");
    details.append(transcriptElement("summary", "", "Result details"));
    appendKeyValues(details, result.result, { omit: ["ok", "error", "message"], limit: 12 });
    if (details.childElementCount > 1) item.append(details);
  }
  return item;
}

function renderDecisionEvent(event, turn, resultByCallId, startedAt) {
  const data = event.data || {};
  const calls = Array.isArray(data.calls) ? data.calls : [];
  const row = transcriptCard(
    event,
    "turn",
    `Turn ${turn}`,
    calls.length === 0 ? "No strategic action" : `${calls.length} action${calls.length === 1 ? "" : "s"}, executed in order`,
    startedAt,
  );
  const usage = data.usage || {};
  appendChips(row, [
    ["Provider", data.latencyMs === undefined ? null : `${Number(data.latencyMs).toLocaleString()} ms`],
    ["Tokens", usage.totalTokens],
    ["Cached", usage.cachedTokens],
    ["Reasoning", usage.reasoningTokens],
    ["Finish", data.finishReason],
  ]);
  if (data.reasoningContent || data.action?.note) {
    const reasoning = transcriptElement("details", "llm-ai-reasoning");
    reasoning.append(
      transcriptElement("summary", "", "Model reasoning"),
      transcriptElement("div", "", data.reasoningContent || data.action.note),
    );
    row.append(reasoning);
  }
  if (calls.length > 0) {
    const callList = transcriptElement("div", "llm-ai-tool-calls");
    calls.forEach((call, index) => callList.append(renderToolCall(call, resultByCallId.get(call.id), index)));
    row.append(callList);
  } else if (data.action) {
    const action = transcriptElement("section", "llm-ai-tool-call");
    action.append(transcriptElement("strong", "", readableLabel(data.action.tool || data.action.action || "Decision")));
    appendKeyValues(action, data.action.arguments || data.action);
    row.append(action);
  }
  row.append(rawEventDetails(event));
  return row;
}

function forceCount(forces) {
  return (forces || []).reduce((total, force) => total + (Number(force.count) || 0), 0);
}

function renderCollection(parent, label, values, describe) {
  if (!Array.isArray(values) || values.length === 0) return;
  const section = transcriptElement("section", "llm-ai-state-collection");
  section.append(transcriptElement("strong", "", `${label} (${values.length})`));
  const list = transcriptElement("ul");
  for (const value of values) list.append(transcriptElement("li", "", describe(value)));
  section.append(list);
  parent.append(section);
}

function describeForce(force) {
  const composition = Object.entries(force.composition || {})
    .map(([kind, count]) => `${count} ${kind}`).join(", ");
  return [force.handle, composition || `${force.count || 0} units`, force.roles?.join("/"), force.position ? `at ${compactValue(force.position)}` : null]
    .filter(Boolean).join(" · ");
}

function describeFacility(facility) {
  const construction = facility.construction?.state === "constructing"
    ? `${compactValue(facility.construction.percent)}% built`
    : facility.construction?.state;
  return [facility.handle, facility.roles?.join("/"), `${compactValue(facility.health)}% health`, construction, facility.position ? `at ${compactValue(facility.position)}` : null]
    .filter(Boolean).join(" · ");
}

function describeContact(contact) {
  return [contact.handle, contact.kind || contact.type, contact.count ? `${contact.count} units` : null, contact.position ? `at ${compactValue(contact.position)}` : null]
    .filter(Boolean).join(" · ");
}

function describeWork(work) {
  const assigned = work.assignedAtStart === undefined ? null
    : `${compactValue(work.survivingAssigned)}/${compactValue(work.assignedAtStart)} assigned survive`;
  const composition = work.survivingComposition
    && Object.keys(work.survivingComposition).length > 0
    ? compactValue(work.survivingComposition) : null;
  return [
    work.id,
    work.mission || work.optionHandle || work.type,
    work.squadHandle,
    work.state,
    assigned,
    composition,
    work.position ? `at ${compactValue(work.position)}` : null,
    work.target ? `target ${work.target}` : null,
    work.blockedReason,
  ].filter(Boolean).join(" · ");
}

function describeDelta(delta) {
  const change = delta.amount ?? delta.delta ?? delta.healthDelta;
  return [readableLabel(delta.type || "change"), delta.handle, delta.owner, delta.kind, change === undefined ? null : compactValue(change), delta.position ? `at ${compactValue(delta.position)}` : null]
    .filter(Boolean).join(" · ");
}

function appendDeltas(parent, deltas) {
  if (!Array.isArray(deltas) || deltas.length === 0) return;
  const group = transcriptElement("div", "llm-ai-state-deltas");
  group.append(transcriptElement("strong", "", "Changes since the previous view"));
  const list = transcriptElement("ul");
  for (const delta of deltas) list.append(transcriptElement("li", `is-${delta.type || "change"}`, describeDelta(delta)));
  group.append(list);
  parent.append(group);
}

function appendScoutingCoverage(parent, coverage) {
  if (!coverage || !Array.isArray(coverage.coverage)) return;
  const group = transcriptElement("div", "llm-ai-state-collection");
  group.append(transcriptElement("strong", "", "Scouting coverage"));
  group.append(transcriptElement("p", "", [
    `${compactValue(coverage.observedPercent)}% observed`,
    `${compactValue(coverage.neverVisible)} cells never visible`,
    `rows ${coverage.order || "minY to maxY"}`,
  ].join(" · ")));
  group.append(transcriptElement("pre", "llm-ai-scouting-grid",
    coverage.coverage.join("\n")));
  parent.append(group);
}

function renderObservationEvent(event, startedAt) {
  const data = event.data || {};
  const observation = data.observation || data;
  const reason = data.reason || observation.reason;
  const title = reason === "match-start" ? "Match start" : "State seen by the model";
  const gameClock = formatClock(observation.time?.gameSeconds);
  const row = transcriptCard(event, "observation", title, [gameClock ? `Game ${gameClock}` : null, observation.frame === undefined ? null : `frame ${observation.frame}`].filter(Boolean).join(" · "), startedAt);
  const economy = observation.economy || {};
  appendChips(row, [
    ["Money", economy.money],
    ["Power", economy.powerSufficient === undefined ? null : economy.powerSufficient ? "sufficient" : "shortage", economy.powerSufficient === false ? "warning" : ""],
    ["Units", forceCount(observation.forces)],
    ["Facilities", observation.facilities?.length ?? 0],
    ["Threats", observation.threats?.length ?? 0, observation.threats?.length ? "warning" : ""],
    ["Combat ready", observation.combat?.ownedReady],
    ["Recent losses", observation.combat?.sincePrevious?.ownedUnitsLost,
      observation.combat?.sincePrevious?.ownedUnitsLost ? "warning" : ""],
    ["Match losses", observation.combat?.cumulative?.unitsLost,
      observation.combat?.cumulative?.unitsLost ? "warning" : ""],
    ["Enemy units destroyed", observation.combat?.cumulative?.enemyUnitsDestroyed],
    ["Enemy structures destroyed", observation.combat?.cumulative?.enemyStructuresDestroyed],
    ["Map observed", observation.scoutingCoverage?.observedPercent === undefined
      ? null : `${compactValue(observation.scoutingCoverage.observedPercent)}%`],
    ["Jobs", observation.jobs?.length ?? 0],
    ["Missions", observation.missions?.length ?? 0],
    ["Objectives", observation.objectives?.length ?? 0],
  ]);
  appendDeltas(row, observation.deltas);
  const hasState = [observation.forces, observation.facilities, observation.jobs,
    observation.missions, observation.threats, observation.objectives]
    .some((values) => Array.isArray(values) && values.length > 0)
    || Array.isArray(observation.scoutingCoverage?.coverage);
  if (hasState) {
    const details = transcriptElement("details", "llm-ai-state-details");
    details.append(transcriptElement("summary", "", "State details available to the model"));
    renderCollection(details, "Forces", observation.forces, describeForce);
    renderCollection(details, "Facilities", observation.facilities, describeFacility);
    renderCollection(details, "Jobs", observation.jobs, describeWork);
    renderCollection(details, "Missions", observation.missions, describeWork);
    renderCollection(details, "Threats", observation.threats, describeContact);
    renderCollection(details, "Objectives", observation.objectives, describeContact);
    appendScoutingCoverage(details, observation.scoutingCoverage);
    row.append(details);
  }
  row.append(rawEventDetails(event));
  return row;
}

function renderReactionEvent(event, startedAt) {
  const data = event.data || {};
  const gameClock = Number.isFinite(data.frame) ? formatClock(data.frame / 30) : null;
  const row = transcriptCard(event, "reaction", "Engine update", [gameClock ? `Game ${gameClock}` : null, data.frame === undefined ? null : `frame ${data.frame}`].filter(Boolean).join(" · "), startedAt);
  appendDeltas(row, data.deltas);
  appendChips(row, [
    ["Active missions", data.missions?.length],
    ["Production queues", data.production?.length],
    ["Outcome", data.outcome],
  ]);
  row.append(rawEventDetails(event));
  return row;
}

function renderGenericEvent(event, startedAt) {
  const isError = event.type.includes("error") || event.type.includes("recovery");
  const row = transcriptCard(event, isError ? "error" : "lifecycle", eventLabel(event.type), null, startedAt);
  if (event.type === "session.started") {
    appendChips(row, [
      ["Commander", event.data?.profile?.name],
      ["Model", event.data?.profile?.model],
      ["Map", event.data?.metadata?.map],
      ["Slot", event.data?.metadata?.slot],
    ]);
  } else {
    appendKeyValues(row, event.data, { omit: ["profile", "metadata"], limit: 10 });
  }
  row.append(rawEventDetails(event));
  return row;
}

function renderFoldedEvents(events, startedAt) {
  if (events.length === 0) return null;
  const representative = events[0];
  const row = transcriptCard(
    representative,
    "transport",
    "Low-level transport log",
    `${events.length} request, response, dispatch, and execution event${events.length === 1 ? "" : "s"} folded into the readable turns above`,
    startedAt,
  );
  const details = transcriptElement("details", "llm-ai-raw-details llm-ai-raw-transport");
  const pre = transcriptElement("pre");
  details.append(transcriptElement("summary", "", "Open complete low-level event data"), pre);
  details.addEventListener("toggle", () => {
    if (details.open && !pre.textContent) {
      pre.textContent = JSON.stringify(events.map(({ sequence, timestamp, type, data }) => ({ sequence, timestamp, type, data })), null, 2);
    }
  });
  row.append(details);
  return row;
}

const FOLDED_EVENT_TYPES = new Set([
  "model.request",
  "model.response",
  "tool.called",
  "tool.result",
  "engine.execution",
  "environment.query",
]);

function renderTranscript(events, session, sessionProfile) {
  const eventList = byId("llmAiSessionEvents");
  eventList.replaceChildren();
  const safeEvents = events.map((event) => ({
    ...event,
    data: redactLlmAiData(event.data, sessionProfile),
  }));
  const resultByCallId = new Map(safeEvents
    .filter((event) => event.type === "tool.result" && event.data?.callId)
    .map((event) => [event.data.callId, event]));
  let turn = 0;
  const foldedEvents = [];
  for (const event of safeEvents) {
    if (FOLDED_EVENT_TYPES.has(event.type)) {
      foldedEvents.push(event);
      continue;
    }
    if (event.type === "model.decision") {
      eventList.append(renderDecisionEvent(event, ++turn, resultByCallId, session.startedAt));
    } else if (event.type === "environment.observation") {
      eventList.append(renderObservationEvent(event, session.startedAt));
    } else if (event.type === "engine.reaction") {
      eventList.append(renderReactionEvent(event, session.startedAt));
    } else {
      eventList.append(renderGenericEvent(event, session.startedAt));
    }
  }
  const foldedLog = renderFoldedEvents(foldedEvents, session.startedAt);
  if (foldedLog) eventList.append(foldedLog);
}

async function selectSession(id) {
  selectedSessionId = id;
  renderSessions();
  const session = sessions.find((candidate) => candidate.id === id);
  const events = await store.listEvents(id);
  const sessionProfile = profiles.find((candidate) => candidate.id === session.profileId) || null;
  byId("llmAiSessionTitle").textContent = session.profileSnapshot?.name || "LLM AI session";
  byId("llmAiSessionSummary").textContent = `${new Date(session.startedAt).toLocaleString()} · ${session.status}${session.outcome ? ` · ${session.outcome}` : ""}`;
  byId("llmAiExportSession").disabled = false;
  byId("llmAiDeleteSession").disabled = false;
  const metrics = byId("llmAiSessionMetrics");
  metrics.replaceChildren();
  for (const [label, value] of [
    ["Status", session.status],
    ["Turns", session.turns || 0],
    ["Tools", session.toolCalls || 0],
    ["Requests", session.providerRequests || 0],
    ["Provider time", `${(session.providerLatencyMs || 0).toLocaleString()} ms`],
    ["Cached tokens", (session.cachedTokens || 0).toLocaleString()],
    ["Tokens", (session.totalTokens || 0).toLocaleString()],
    ["Duration", formatDuration(session)],
  ]) {
    const card = document.createElement("div");
    const strong = document.createElement("strong"); strong.textContent = String(value);
    const span = document.createElement("span"); span.textContent = label;
    card.append(strong, span); metrics.append(card);
  }
  renderTranscript(events, session, sessionProfile);
}

async function refresh() {
  [profiles, sessions] = await Promise.all([store.listProfiles(), store.listSessions()]);
  if (selectedProfileId && !profiles.some((profile) => profile.id === selectedProfileId)) selectedProfileId = null;
  if (selectedSessionId && !sessions.some((session) => session.id === selectedSessionId)) selectedSessionId = null;
  renderProfiles();
  renderSessions();
}

async function syncProfileCatalog() {
  if (typeof window.CnCPort?.rpc !== "function") {
    throw new Error("The game bridge is unavailable");
  }
  const result = await window.CnCPort.rpc("realEngineSetLlmAiProfiles", {
    profiles: profiles.map(({ id, name }) => ({ id, name })),
  });
  if (result?.ok !== true) {
    throw new Error(`The game rejected the LLM commander list: ${result?.error ?? "unknown error"}`);
  }
  return result;
}

async function runUiAction(action) {
  try {
    await action();
  } catch (error) {
    setStatus(error?.message || String(error), "error");
  }
}

function switchView(view) {
  document.querySelectorAll("[data-llm-ai-view]").forEach((button) =>
    button.classList.toggle("is-selected", button.dataset.llmAiView === view));
  byId("llmAiProfilesView").hidden = view !== "profiles";
  byId("llmAiSessionsView").hidden = view !== "sessions";
  if (view === "sessions") void runUiAction(refresh);
}

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = profileForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const profile = await store.saveProfile(formInput());
    await refresh();
    await syncProfileCatalog();
    fillForm(profiles.find((candidate) => candidate.id === profile.id));
    byId("llmAiSavedBadge").hidden = false;
    setStatus(`${profile.name} is saved in browser storage and ready for a player slot.`, "success");
    desktop?.showToast("LLM commander saved", `${profile.name} is available to Zero Hour.`);
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    submit.disabled = false;
  }
});

byId("llmAiNewProfile").addEventListener("click", () => {
  switchView("profiles");
  fillForm();
  byId("llmAiName").focus();
});

byId("llmAiDeleteProfile").addEventListener("click", () => void runUiAction(async () => {
  const profile = selectedProfile();
  if (!profile) return;
  await store.deleteProfile(profile.id);
  selectedProfileId = null;
  await refresh();
  await syncProfileCatalog();
  fillForm();
  setStatus(`${profile.name} was removed. Existing session snapshots remain available.`);
}));

byId("llmAiDuplicateProfile").addEventListener("click", () => void runUiAction(async () => {
  const profile = selectedProfile();
  if (!profile) return;
  const duplicate = await store.saveProfile({ ...profile, id: undefined, name: `${profile.name} Copy` });
  await refresh();
  await syncProfileCatalog();
  fillForm(profiles.find((candidate) => candidate.id === duplicate.id));
  setStatus("Duplicate saved. Endpoint credentials were copied only within this browser.", "success");
}));

byId("llmAiDiscoverModels").addEventListener("click", () =>
  void runUiAction(() => loadModels()));

for (const id of ["llmAiEndpoint", "llmAiApiKey"]) {
  byId(id).addEventListener("change", () => {
    clearDiagnostics();
    queueModelDiscovery();
  });
}

byId("llmAiModel").addEventListener("input", () => {
  clearDiagnostics();
  renderContextMetadata();
});

byId("llmAiContext").addEventListener("input", () => {
  contextEdited = true;
  renderContextMetadata({ allowAutoApply: false });
});

byId("llmAiApplyContext").addEventListener("click", () => {
  if (!pendingContextSize) return;
  byId("llmAiContext").value = String(pendingContextSize);
  contextEdited = false;
  renderContextMetadata();
  clearDiagnostics();
});

byId("llmAiTestEndpoint").addEventListener("click", async () => {
  const button = byId("llmAiTestEndpoint");
  const discoveryButton = byId("llmAiDiscoverModels");
  button.disabled = true;
  discoveryButton.disabled = true;
  clearDiagnostics();
  setStatus("Running reachability, model, context, query, and exact tool-call diagnostics…");
  try {
    const profile = createLlmAiProfile(formInput());
    const result = await probeLlmAiEndpoint(profile);
    renderModelCatalog(result);
    renderDiagnostics(result);
    const context = result.contextSize
      ? ` · ${result.contextSize.toLocaleString()} context detected`
      : " · context remains manual";
    setStatus(`Connected in ${result.latencyMs} ms · ${result.protocol} protocol · exact tool arguments verified${context}.`, "success");
  } catch (error) {
    renderDiagnostics(null, error);
    setStatus(error.message, "error");
  } finally {
    button.disabled = false;
    discoveryButton.disabled = false;
  }
});

document.querySelectorAll("[data-llm-ai-view]").forEach((button) =>
  button.addEventListener("click", () => switchView(button.dataset.llmAiView)));

byId("llmAiExportSession").addEventListener("click", () => void runUiAction(async () => {
  if (!selectedSessionId) return;
  const exported = await store.exportSession(selectedSessionId);
  const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `zero-hour-llm-session-${selectedSessionId}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}));

byId("llmAiDeleteSession").addEventListener("click", () => void runUiAction(async () => {
  if (!selectedSessionId) return;
  await store.deleteSession(selectedSessionId);
  selectedSessionId = null;
  await refresh();
  byId("llmAiSessionTitle").textContent = "Select a session";
  byId("llmAiSessionSummary").textContent = "Model turns, tools, errors, timing, and outcome are recorded locally.";
  byId("llmAiSessionMetrics").replaceChildren();
  byId("llmAiSessionEvents").replaceChildren();
  byId("llmAiExportSession").disabled = true;
  byId("llmAiDeleteSession").disabled = true;
}));

window.ZeroHLlmAi = Object.freeze({
  store,
  AgentRuntime: LlmAiAgentRuntime,
  refresh,
  syncProfileCatalog,
  async listProfiles() { return (await store.listProfiles()).map(publicLlmAiProfile); },
  async getProfile(id) { return store.getProfile(id); },
});

try {
  await refresh();
  fillForm(profiles[0] || null);
  void syncProfileCatalog().catch((error) => {
    setStatus(`Profiles are saved, but game-slot sync failed: ${error.message}`, "error");
  });
} catch (error) {
  setStatus(`LLM AI browser storage is unavailable: ${error.message}`, "error");
  desktop?.showToast("LLM AI storage unavailable", error.message, "warning");
}
