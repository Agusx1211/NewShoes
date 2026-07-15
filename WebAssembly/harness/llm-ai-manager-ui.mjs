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
  return type.replaceAll(".", " › ");
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
  const eventList = byId("llmAiSessionEvents");
  eventList.replaceChildren();
  for (const event of events) {
    const row = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = `${event.sequence}. ${eventLabel(event.type)}`;
    const detail = document.createElement("pre");
    detail.textContent = JSON.stringify(redactLlmAiData(event.data, sessionProfile), null, 2);
    row.append(label, detail); eventList.append(row);
  }
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
