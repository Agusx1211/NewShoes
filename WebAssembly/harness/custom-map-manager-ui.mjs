import { CustomMapPackageImporter } from "./custom-map-package-importer.mjs";

const desktop = window.ZeroHDesktop;
const progress = document.querySelector("#customMapImportProgress");
let inventory = null;
let importBusy = false;

const importer = new CustomMapPackageImporter({
  onProgress: (event) => {
    const fraction = event.total > 0 ? ` · ${Math.round(event.completed / event.total * 100)}%` : "";
    progress.textContent = `${event.detail || event.phase}${fraction}`;
  },
});

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
}

function toast(title, detail, kind) {
  desktop?.showToast(title, detail, kind);
}

async function bridgeReady() {
  const started = performance.now();
  while (!window.CnCPort?.listCustomMaps) {
    if (performance.now() - started > 20_000) throw new Error("Custom-map filesystem did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return window.CnCPort;
}

function setImportBusy(busy) {
  importBusy = busy;
  document.querySelectorAll("#customMapImportPackageButton, #customMapImportFolderButton")
    .forEach((element) => { element.disabled = busy; });
}

function mapCard(map) {
  const card = document.createElement("article");
  card.className = "custom-map-card";
  const icon = document.createElement("span");
  icon.className = "custom-map-card-icon";
  icon.innerHTML = '<svg><use href="#i-map"/></svg>';
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = map.name;
  const detail = document.createElement("small");
  const features = [
    `${map.fileCount} file${map.fileCount === 1 ? "" : "s"}`,
    formatBytes(map.size),
    map.hasPreview ? "preview included" : "no preview image",
  ];
  detail.textContent = features.join(" · ");
  copy.append(title, detail);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger-text";
  remove.textContent = "Remove";
  remove.addEventListener("click", async () => {
    if (!confirm(`Remove ${map.name} from ${inventory.contextLabel}?`)) return;
    remove.disabled = true;
    try {
      const bridge = await bridgeReady();
      const result = await bridge.deleteCustomMap(inventory.contextId, map.name);
      toast("Custom map removed", `${map.name} was deleted from this launch configuration.`);
      if (result.cleanupWarning) toast("Map cleanup will retry", result.cleanupWarning, "warning");
      await refreshMaps();
    } catch (error) {
      toast("Could not remove map", error.message, "warning");
      remove.disabled = false;
    }
  });
  card.append(icon, copy, remove);
  return card;
}

function renderMaps() {
  document.querySelector("#customMapContextBadge").textContent = inventory.contextLabel;
  document.querySelector("#customMapContextBadge").title =
    `Maps are stored only for ${inventory.contextLabel}`;
  document.querySelector("#customMapEmpty").hidden = inventory.maps.length > 0;
  const list = document.querySelector("#customMapList");
  list.hidden = inventory.maps.length === 0;
  list.replaceChildren(...inventory.maps.map(mapCard));
  const mapCount = inventory.maps.length;
  document.querySelector("#customMapStatus").textContent = mapCount
    ? `${mapCount} custom map${mapCount === 1 ? "" : "s"} · ${formatBytes(inventory.totalBytes)} · available in the original User Maps list.`
    : `No custom maps installed for ${inventory.contextLabel}.`;
  if (inventory.cleanupWarning) toast("Map cleanup will retry", inventory.cleanupWarning, "warning");
}

async function refreshMaps() {
  document.querySelector("#customMapStatus").textContent = "Reading the active Zero Hour Maps folder…";
  try {
    const bridge = await bridgeReady();
    inventory = await bridge.listCustomMaps();
    renderMaps();
  } catch (error) {
    document.querySelector("#customMapStatus").textContent = `Could not load custom maps: ${error.message}`;
  }
}

async function importFiles(files) {
  if (importBusy || !files?.length) return;
  setImportBusy(true);
  progress.textContent = "Inspecting map package…";
  try {
    await navigator.storage?.persist?.().catch(() => false);
    const imported = await importer.importFiles(files);
    const bridge = await bridgeReady();
    inventory = await bridge.listCustomMaps();
    const installedNames = new Set(inventory.maps.map((map) => map.name.toLowerCase()));
    const conflicts = imported.maps.filter((map) => installedNames.has(map.name.toLowerCase()));
    if (conflicts.length > 0 && !confirm(
      `${conflicts.map((map) => map.name).join(", ")} already ${conflicts.length === 1 ? "exists" : "exist"} `
      + `in ${inventory.contextLabel}. Replace ${conflicts.length === 1 ? "it" : "them"}?`,
    )) {
      progress.textContent = "Import cancelled; installed maps were not changed.";
      return;
    }
    const result = await bridge.installCustomMaps(inventory.contextId, imported.maps, {
      replace: conflicts.length > 0,
    });
    const names = result.installed.join(", ");
    const warning = imported.warnings.join(" ");
    progress.textContent = `${names} installed locally.${warning ? ` ${warning}` : ""}`;
    toast(
      result.installed.length === 1 ? "Custom map installed" : "Custom maps installed",
      `${names} ${result.installed.length === 1 ? "is" : "are"} ready in User Maps.`,
    );
    if (warning) toast("Some package files were ignored", warning, "warning");
    if (result.cleanupWarning) toast("Map cleanup will retry", result.cleanupWarning, "warning");
    await refreshMaps();
  } catch (error) {
    progress.textContent = `Import failed: ${error.message}`;
    toast("Custom map import failed", error.message, "warning");
  } finally {
    setImportBusy(false);
  }
}

document.querySelector("#customMapImportPackageButton").addEventListener("click", () =>
  document.querySelector("#customMapImportPackageInput").click());
document.querySelector("#customMapImportFolderButton").addEventListener("click", () =>
  document.querySelector("#customMapImportFolderInput").click());
for (const input of [
  document.querySelector("#customMapImportPackageInput"),
  document.querySelector("#customMapImportFolderInput"),
]) {
  input.addEventListener("change", () => {
    const files = [...input.files];
    input.value = "";
    void importFiles(files);
  });
}
document.querySelector("#refreshCustomMapsButton").addEventListener("click", () => void refreshMaps());
document.querySelectorAll('[data-open="maps"]').forEach((button) =>
  button.addEventListener("click", () => void refreshMaps()));

window.ZeroHMapManager = {
  importer,
  refresh: refreshMaps,
  get inventory() { return inventory; },
};
