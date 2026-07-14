import { LlmAiAgentRuntime } from "./llm-ai-agent.mjs";
import {
  createLlmAiProfile,
  DEFAULT_LLM_AI_MANDATE,
  publicLlmAiProfile,
  redactLlmAiData,
} from "./llm-ai-profile.mjs";
import { probeLlmAiEndpoint } from "./llm-ai-openai-client.mjs";
import { LlmAiStore } from "./llm-ai-store.mjs";

const desktop = window.ZeroHDesktop;
const store = new LlmAiStore();
let profiles = [];
let sessions = [];
let selectedProfileId = null;
let selectedSessionId = null;

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

function formInput() {
  return {
    id: byId("llmAiProfileId").value || undefined,
    name: byId("llmAiName").value,
    endpoint: byId("llmAiEndpoint").value,
    model: byId("llmAiModel").value,
    apiKey: byId("llmAiApiKey").value,
    thinkingEffort: byId("llmAiThinking").value,
    contextSize: Number(byId("llmAiContext").value),
    mandate: byId("llmAiMandate").value,
    toolProtocol: byId("llmAiToolProtocol").value,
    planningIntervalMs: Number(byId("llmAiPlanningInterval").value),
    classicFallback: byId("llmAiClassicFallback").checked,
  };
}

function fillForm(profile = null) {
  selectedProfileId = profile?.id || null;
  byId("llmAiProfileId").value = profile?.id || "";
  byId("llmAiName").value = profile?.name || "";
  byId("llmAiEndpoint").value = profile?.endpoint || "";
  byId("llmAiModel").value = profile?.model || "";
  byId("llmAiApiKey").value = profile?.apiKey || "";
  byId("llmAiThinking").value = profile?.thinkingEffort || "medium";
  byId("llmAiContext").value = String(profile?.contextSize || 262_144);
  byId("llmAiMandate").value = profile?.mandate || DEFAULT_LLM_AI_MANDATE;
  byId("llmAiToolProtocol").value = profile?.toolProtocol || "auto";
  byId("llmAiPlanningInterval").value = String(profile?.planningIntervalMs || 2_000);
  byId("llmAiClassicFallback").checked = profile?.classicFallback !== false;
  byId("llmAiFormTitle").textContent = profile ? profile.name : "New commander";
  byId("llmAiDeleteProfile").disabled = !profile;
  byId("llmAiDuplicateProfile").disabled = !profile;
  byId("llmAiSavedBadge").hidden = true;
  setStatus(profile
    ? `Last saved ${new Date(profile.updatedAt).toLocaleString()}. The API key is local and never included in exports.`
    : "Profiles and session traces stay in this browser.");
  renderProfiles();
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

byId("llmAiTestEndpoint").addEventListener("click", async () => {
  const button = byId("llmAiTestEndpoint");
  button.disabled = true;
  setStatus("Checking model discovery and tool-call compatibility…");
  try {
    const profile = createLlmAiProfile(formInput());
    const result = await probeLlmAiEndpoint(profile);
    const compatibility = result.compatibility
      ? " Native calls were unavailable, so the validated structured-action fallback was selected."
      : "";
    setStatus(`Connected in ${result.latencyMs} ms · ${result.protocol} protocol · model available.${compatibility}`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    button.disabled = false;
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
