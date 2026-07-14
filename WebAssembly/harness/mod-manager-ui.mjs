import { ModPackageStore } from "./mod-package-store.mjs";

const desktop = window.ZeroHDesktop;
const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

const importProgress = document.querySelector("#modImportProgress");
const store = new ModPackageStore({
  onProgress: (event) => {
    const fraction = event.total > 0 ? ` · ${Math.round(event.completed / event.total * 100)}%` : "";
    importProgress.textContent = `${event.detail || event.phase}${fraction}`;
  },
});
let enabledOrder = store.active().mods.map((mod) => mod.id);
let importBusy = false;

function selectionKey(mods) {
  return JSON.stringify(mods.map((mod) => ({
    id: mod.id,
    archives: mod.archives.filter((archive) => archive.enabled).map((archive) => archive.sha256),
  })));
}

function toast(title, detail, kind) {
  desktop?.showToast(title, detail, kind);
}

function setImportBusy(busy) {
  importBusy = busy;
  document.querySelectorAll("#modImportPackageButton, #modImportFolderButton, #modImportName, #modImportVersion")
    .forEach((element) => { element.disabled = busy; });
}

function modCard(mod, enabledIndex) {
  const enabled = enabledIndex >= 0;
  const card = document.createElement("article");
  card.className = `installed-mod-card${enabled ? " is-enabled" : ""}`;
  const selection = document.createElement("label");
  selection.className = "installed-mod-selection";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = enabled;
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = mod.name;
  const detail = document.createElement("small");
  detail.textContent = `${mod.version} · ${formatBytes(mod.totalBytes)} · ${mod.archives.length} BIG archive${mod.archives.length === 1 ? "" : "s"}`;
  copy.append(title, detail);
  selection.append(checkbox, copy);
  const hash = document.createElement("code");
  hash.textContent = mod.contentHash.slice(0, 12);
  hash.title = `Content identity: ${mod.contentHash}`;
  const controls = document.createElement("div");
  controls.className = "installed-mod-controls";
  const up = document.createElement("button");
  up.type = "button"; up.textContent = "↑"; up.title = "Load earlier";
  const down = document.createElement("button");
  down.type = "button"; down.textContent = "↓"; down.title = "Load later";
  const remove = document.createElement("button");
  remove.type = "button"; remove.textContent = "Remove"; remove.className = "danger-text";
  up.disabled = !enabled || enabledIndex === 0;
  down.disabled = !enabled || enabledIndex === enabledOrder.length - 1;
  up.addEventListener("click", () => {
    [enabledOrder[enabledIndex - 1], enabledOrder[enabledIndex]] = [enabledOrder[enabledIndex], enabledOrder[enabledIndex - 1]];
    renderMods();
  });
  down.addEventListener("click", () => {
    [enabledOrder[enabledIndex], enabledOrder[enabledIndex + 1]] = [enabledOrder[enabledIndex + 1], enabledOrder[enabledIndex]];
    renderMods();
  });
  checkbox.addEventListener("change", () => {
    enabledOrder = checkbox.checked
      ? [...enabledOrder, mod.id]
      : enabledOrder.filter((id) => id !== mod.id);
    renderMods();
  });
  remove.addEventListener("click", async () => {
    remove.disabled = true;
    try {
      await store.remove(mod.id);
      enabledOrder = enabledOrder.filter((id) => id !== mod.id);
      toast("Mod removed", `${mod.name} was deleted from this browser.`);
      renderMods();
    } catch (error) {
      toast("Could not remove mod", error.message, "warning");
      remove.disabled = false;
    }
  });
  controls.append(up, down, remove);
  card.append(selection, hash, controls);
  if (mod.archives.length > 1) {
    const archiveList = document.createElement("div");
    archiveList.className = "installed-mod-archives";
    const heading = document.createElement("strong");
    heading.textContent = "Package archives";
    archiveList.append(heading);
    for (const archive of mod.archives) {
      const option = document.createElement("label");
      const archiveCheckbox = document.createElement("input");
      archiveCheckbox.type = "checkbox";
      archiveCheckbox.checked = archive.enabled;
      archiveCheckbox.addEventListener("change", () => {
        try {
          store.setArchiveEnabled(mod.id, archive.opfsPath, archiveCheckbox.checked);
          renderMods();
        } catch (error) {
          toast("Could not change archive", error.message, "warning");
          archiveCheckbox.checked = archive.enabled;
        }
      });
      const name = document.createElement("span");
      name.textContent = archive.name.replace(/^\d{3}-/, "");
      const size = document.createElement("small");
      size.textContent = formatBytes(archive.size);
      option.append(archiveCheckbox, name, size);
      archiveList.append(option);
    }
    card.append(archiveList);
  }
  if (mod.warnings.length > 0) {
    const warning = document.createElement("p");
    warning.className = "installed-mod-warning";
    warning.textContent = mod.warnings.join(" ");
    card.append(warning);
  }
  return card;
}

function renderMods() {
  const mods = store.list();
  const active = store.active();
  document.querySelector("#activeModBadge").textContent = active.label;
  document.querySelector("#activeModBadge").title = `Composition identity: ${active.id}`;
  document.querySelector("#installedModEmpty").hidden = mods.length > 0;
  const list = document.querySelector("#installedModList");
  list.hidden = mods.length === 0;
  list.replaceChildren();
  const byId = new Map(mods.map((mod) => [mod.id, mod]));
  const ordered = [
    ...enabledOrder.map((id) => byId.get(id)).filter(Boolean),
    ...mods.filter((mod) => !enabledOrder.includes(mod.id)),
  ];
  enabledOrder = enabledOrder.filter((id) => byId.has(id));
  ordered.forEach((mod) => list.append(modCard(mod, enabledOrder.indexOf(mod.id))));
  document.querySelector("#modConfigurationSummary").textContent = enabledOrder.length
    ? `${enabledOrder.length} enabled · later mods override earlier mods · apply to launch this exact composition`
    : "No mods enabled. The next launch will use vanilla Zero Hour.";
  const configured = enabledOrder.map((id) => byId.get(id)).filter(Boolean);
  const unchanged = selectionKey(active.mods) === selectionKey(configured);
  document.querySelector("#modApplyButton").disabled = unchanged;
}

async function importFiles(files) {
  if (importBusy || !files?.length) return;
  setImportBusy(true);
  importProgress.textContent = "Inspecting package…";
  try {
    const result = await store.importFiles(files, {
      name: document.querySelector("#modImportName").value,
      version: document.querySelector("#modImportVersion").value,
    });
    document.querySelector("#modImportName").value = "";
    document.querySelector("#modImportVersion").value = "";
    importProgress.textContent = result.duplicate
      ? `${result.mod.name} is already installed (identical content).`
      : `${result.mod.name} ${result.mod.version} imported · ${formatBytes(result.mod.totalBytes)}.`;
    toast(result.duplicate ? "Mod already installed" : "Mod imported",
      result.duplicate ? "The uploaded package has the same content identity." : `${result.mod.name} is ready to enable.`);
    renderMods();
  } catch (error) {
    importProgress.textContent = `Import failed: ${error.message}`;
    toast("Mod import failed", error.message, "warning");
  } finally {
    setImportBusy(false);
  }
}

document.querySelector("#modImportPackageButton").addEventListener("click", () =>
  document.querySelector("#modImportPackageInput").click());
document.querySelector("#modImportFolderButton").addEventListener("click", () =>
  document.querySelector("#modImportFolderInput").click());
for (const input of [document.querySelector("#modImportPackageInput"), document.querySelector("#modImportFolderInput")]) {
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = "";
    void importFiles(files);
  });
}
document.querySelector("#modApplyButton").addEventListener("click", async () => {
  try {
    const context = await store.apply(enabledOrder);
    toast("Launch configuration applied", `${context.label}. Reloading the runtime…`);
    location.reload();
  } catch (error) {
    toast("Could not apply mods", error.message, "warning");
  }
});
document.querySelector("#modUseVanillaButton").addEventListener("click", async () => {
  await store.useVanilla();
  toast("Vanilla selected", "Reloading without mods…");
  location.reload();
});

let gameDataInventory = null;
let overrideSelection = null;

async function bridgeReady() {
  const started = performance.now();
  while (!window.CnCPort?.listGameData) {
    if (performance.now() - started > 20_000) throw new Error("Game-data bridge did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.CnCPort;
}

function fileDownload(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function beginOverride(context, file) {
  overrideSelection = { sourceContextId: context.id, kind: file.kind, name: file.name };
  document.querySelector("#compatibilityOverrideSource").textContent =
    `${file.name} from ${context.label}`;
  const target = document.querySelector("#compatibilityOverrideTarget");
  target.replaceChildren();
  for (const candidate of gameDataInventory.contexts.filter((value) => value.id !== context.id)) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = candidate.label;
    target.append(option);
  }
  document.querySelector("#compatibilityOverrideRisk").checked = false;
  document.querySelector("#compatibilityOverrideCopy").disabled = true;
  document.querySelector("#compatibilityOverridePanel").hidden = false;
}

function gameDataFileRow(context, file) {
  const row = document.createElement("div");
  row.className = "game-data-file-row";
  const icon = document.createElement("span");
  icon.innerHTML = `<svg><use href="${file.kind === "save" ? "#i-save" : "#i-replay"}"/></svg>`;
  const copy = document.createElement("span");
  const name = document.createElement("strong"); name.textContent = file.name;
  const details = document.createElement("small");
  details.textContent = `${file.kind === "save" ? "Save" : "Replay"} · ${formatBytes(file.size)}${file.modified ? ` · ${new Date(file.modified).toLocaleString()}` : ""}`;
  copy.append(name, details);
  const actions = document.createElement("div");
  const download = document.createElement("button"); download.type = "button"; download.textContent = "Download";
  const override = document.createElement("button"); override.type = "button"; override.textContent = "Copy to…";
  const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Delete"; remove.className = "danger-text";
  override.disabled = gameDataInventory.contexts.length < 2;
  download.addEventListener("click", async () => {
    try { fileDownload(await window.CnCPort.readGameData(context.id, file.kind, file.name), file.name); }
    catch (error) { toast("Download failed", error.message, "warning"); }
  });
  override.addEventListener("click", () => beginOverride(context, file));
  remove.addEventListener("click", async () => {
    if (!confirm(`Delete ${file.name} from ${context.label}?`)) return;
    try {
      await window.CnCPort.deleteGameData(context.id, file.kind, file.name);
      toast("Game data deleted", file.name);
      await refreshGameData();
    } catch (error) { toast("Delete failed", error.message, "warning"); }
  });
  actions.append(download, override, remove);
  row.append(icon, copy, actions);
  return row;
}

function renderGameData() {
  const list = document.querySelector("#gameDataContextList");
  list.replaceChildren();
  let fileCount = 0;
  for (const context of gameDataInventory.contexts) {
    const section = document.createElement("section");
    section.className = `game-data-context${context.active ? " is-active" : ""}`;
    const header = document.createElement("header");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = context.label;
    if (context.active) {
      const badge = document.createElement("em"); badge.textContent = "ACTIVE"; title.append(" ", badge);
    }
    const detail = document.createElement("span");
    detail.textContent = context.mods.length
      ? context.mods.map((mod) => `${mod.name} ${mod.version}`).join(" + ")
      : "Unmodified Zero Hour";
    copy.append(title, detail);
    const size = document.createElement("span"); size.textContent = formatBytes(context.totalBytes);
    header.append(copy, size);
    section.append(header);
    const files = [...context.saves, ...context.replays];
    fileCount += files.length;
    if (files.length === 0) {
      const empty = document.createElement("p"); empty.className = "game-data-context-empty"; empty.textContent = "No saves or replays in this configuration."; section.append(empty);
    } else {
      files.forEach((file) => section.append(gameDataFileRow(context, file)));
    }
    list.append(section);
  }
  document.querySelector("#gameDataStatus").textContent =
    `${fileCount} file${fileCount === 1 ? "" : "s"} across ${gameDataInventory.contexts.length} isolated configuration${gameDataInventory.contexts.length === 1 ? "" : "s"}.`;
}

async function refreshGameData() {
  document.querySelector("#gameDataStatus").textContent = "Reading isolated save and replay folders…";
  try {
    const bridge = await bridgeReady();
    gameDataInventory = await bridge.listGameData();
    renderGameData();
  } catch (error) {
    document.querySelector("#gameDataStatus").textContent = `Could not load game data: ${error.message}`;
  }
}

async function importGameDataFile(file, kind) {
  if (!file) return;
  try {
    const bridge = await bridgeReady();
    gameDataInventory ||= await bridge.listGameData();
    await bridge.importGameData(gameDataInventory.activeId, kind, file.name, new Uint8Array(await file.arrayBuffer()));
    toast(`${kind === "save" ? "Save" : "Replay"} imported`, `${file.name} was added to the active configuration.`);
    await refreshGameData();
  } catch (error) { toast("Import failed", error.message, "warning"); }
}

document.querySelector("#refreshGameDataButton").addEventListener("click", () => void refreshGameData());
document.querySelector("#importSaveButton").addEventListener("click", () => document.querySelector("#importSaveInput").click());
document.querySelector("#importReplayDataButton").addEventListener("click", () => document.querySelector("#importReplayDataInput").click());
document.querySelector("#importSaveInput").addEventListener("change", (event) => {
  const [file] = event.target.files; event.target.value = ""; void importGameDataFile(file, "save");
});
document.querySelector("#importReplayDataInput").addEventListener("change", (event) => {
  const [file] = event.target.files; event.target.value = ""; void importGameDataFile(file, "replay");
});
document.querySelector("#compatibilityOverrideRisk").addEventListener("change", (event) => {
  document.querySelector("#compatibilityOverrideCopy").disabled = !event.target.checked;
});
document.querySelector("#compatibilityOverrideCancel").addEventListener("click", () => {
  document.querySelector("#compatibilityOverridePanel").hidden = true;
  overrideSelection = null;
});
document.querySelector("#compatibilityOverrideCopy").addEventListener("click", async () => {
  if (!overrideSelection) return;
  try {
    await window.CnCPort.copyGameDataOverride({
      ...overrideSelection,
      targetContextId: document.querySelector("#compatibilityOverrideTarget").value,
      acknowledgeCompatibilityRisk: document.querySelector("#compatibilityOverrideRisk").checked,
    });
    document.querySelector("#compatibilityOverridePanel").hidden = true;
    overrideSelection = null;
    toast("Compatibility copy created", "The source file was preserved and a copy was added to the target configuration.");
    await refreshGameData();
  } catch (error) { toast("Compatibility copy failed", error.message, "warning"); }
});

document.querySelectorAll('[data-open="gameData"]').forEach((button) =>
  button.addEventListener("click", () => void refreshGameData()));
renderMods();

window.ZeroHModManager = {
  store,
  render: renderMods,
  refreshGameData,
  get enabledOrder() { return [...enabledOrder]; },
};
