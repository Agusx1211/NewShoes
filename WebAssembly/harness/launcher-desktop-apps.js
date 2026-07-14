(() => {
  "use strict";

  const desktop = window.ZeroHDesktop;
  const FILESYSTEM_KEY = "zeroh-filesystem-v1";
  const MAX_IMPORT_BYTES = 512 * 1024;
  const TEXT_EXTENSIONS = new Set(["txt", "md", "ini", "log", "json", "cfg"]);
  const LEGACY_WELCOME_CONTENT = "Welcome, Commander.\n\nThis Notepad document lives on the Project New Shoes virtual drive. Edit it, save it, close the browser, and open it again from My Files.\n\nUseful places:\n- Game Saves\n- Replays\n- Screenshots\n- Mods\n";
  const WELCOME_CONTENT = LEGACY_WELCOME_CONTENT.replace("\n- Mods\n", "\n");

  function seedFileSystem() {
    const modified = new Date().toISOString();
    return {
      version: 3,
      nodes: [
        { id: "root", parent: null, type: "folder", name: "New Shoes Drive", modified },
        { id: "saves", parent: "root", type: "folder", name: "Game Saves", modified },
        { id: "replays", parent: "root", type: "folder", name: "Replays", modified },
        { id: "notes", parent: "root", type: "folder", name: "Notes", modified },
        { id: "screens", parent: "root", type: "folder", name: "Screenshots", modified },
        { id: "note-1", parent: "notes", type: "file", kind: "text", name: "Welcome to Project New Shoes.txt", modified, size: WELCOME_CONTENT.length, content: WELCOME_CONTENT },
        { id: "note-2", parent: "notes", type: "file", kind: "text", name: "Battle plan.txt", modified, size: 151, content: "BATTLE PLAN\n===========\n1. Secure both supply docks.\n2. Scout the northern ridge.\n3. Keep one dozer in reserve.\n4. Do not panic.\n" },
      ],
    };
  }

  function loadFileSystem() {
    try {
      const stored = JSON.parse(localStorage.getItem(FILESYSTEM_KEY));
      if ((stored?.version === 2 || stored?.version === 3)
          && Array.isArray(stored.nodes) && stored.nodes.some((node) => node.id === "root")) {
        if (stored.version === 2) {
          stored.version = 3;
          stored.nodes = stored.nodes.filter((node) => node.id !== "mods" && node.id !== "mod-readme");
          const welcome = stored.nodes.find((node) => node.id === "note-1");
          if (welcome?.content === LEGACY_WELCOME_CONTENT) {
            welcome.content = WELCOME_CONTENT;
            welcome.size = WELCOME_CONTENT.length;
          }
          try { localStorage.setItem(FILESYSTEM_KEY, JSON.stringify(stored)); } catch { /* optional migration */ }
        }
        return stored;
      }
    } catch { /* seed a fresh drive */ }
    return seedFileSystem();
  }

  let fileSystem = loadFileSystem();
  let currentFolderId = "root";
  let selectedNodeId = null;
  let folderHistory = ["root"];
  let folderHistoryIndex = 0;
  let filePromptMode = "folder";
  let fileView = "list";
  let storageView = false;
  let managedReplayNodes = [];
  let replayRefreshPromise = null;

  const nodeById = (id) => fileSystem.nodes.find((node) => node.id === id)
    || managedReplayNodes.find((node) => node.id === id);
  const childrenOf = (id) => [
    ...fileSystem.nodes.filter((node) => node.parent === id),
    ...managedReplayNodes.filter((node) => node.parent === id),
  ];
  const extensionOf = (name) => name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  const isTextNode = (node) => node?.kind === "text" || TEXT_EXTENSIONS.has(extensionOf(node?.name || ""));

  function persistFileSystem() {
    try {
      localStorage.setItem(FILESYSTEM_KEY, JSON.stringify(fileSystem));
      return true;
    } catch {
      desktop.showToast("Drive is full", "This browser could not persist that change.", "warning");
      return false;
    }
  }

  function snapshotFileSystem() {
    return JSON.stringify(fileSystem);
  }

  function restoreFileSystem(snapshot) {
    fileSystem = JSON.parse(snapshot);
  }

  function formatBytes(bytes = 0) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatModified(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function uniqueName(parent, requested, ignoredId = null) {
    const siblings = childrenOf(parent).filter((node) => node.id !== ignoredId).map((node) => node.name.toLowerCase());
    if (!siblings.includes(requested.toLowerCase())) return requested;
    const dot = requested.lastIndexOf(".");
    const base = dot > 0 ? requested.slice(0, dot) : requested;
    const extension = dot > 0 ? requested.slice(dot) : "";
    let index = 2;
    while (siblings.includes(`${base} (${index})${extension}`.toLowerCase())) index += 1;
    return `${base} (${index})${extension}`;
  }

  function pathTo(nodeId) {
    const path = [];
    let node = nodeById(nodeId);
    while (node) {
      path.unshift(node);
      node = node.parent ? nodeById(node.parent) : null;
    }
    return path;
  }

  function nodeIcon(node) {
    if (node.type === "folder") return "#i-folder";
    if (node.kind === "replay") return "#i-replay";
    if (node.kind === "image") return "#i-image";
    if (isTextNode(node)) return "#i-text";
    return "#i-save";
  }

  function typeLabel(node) {
    if (node.type === "folder") return "File folder";
    return { save: "Game save", replay: "Replay", image: "PNG image", archive: "Archive", text: "Text document" }[node.kind] || "File";
  }

  function renderAddressBar() {
    const bar = document.querySelector("#fileAddressBar");
    bar.replaceChildren();
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.innerHTML = '<use href="#i-drive"/>';
    bar.append(icon);
    pathTo(currentFolderId).forEach((node, index, path) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = node.name;
      button.addEventListener("click", () => navigateTo(node.id));
      bar.append(button);
      if (index < path.length - 1) {
        const separator = document.createElement("b");
        separator.textContent = "›";
        bar.append(separator);
      }
    });
  }

  function renderExplorer() {
    const folder = nodeById(currentFolderId) || nodeById("root");
    currentFolderId = folder.id;
    const query = document.querySelector("#fileSearch").value.trim().toLowerCase();
    const nodes = childrenOf(folder.id)
      .filter((node) => node.name.toLowerCase().includes(query))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "folder" ? -1 : 1));
    const list = document.querySelector("#fileList");
    list.classList.toggle("is-grid", fileView === "grid");
    list.hidden = nodes.length === 0;
    document.querySelector(".file-list-head").hidden = fileView === "grid" || nodes.length === 0;
    document.querySelectorAll("[data-file-view]").forEach((button) => {
      const selected = button.dataset.fileView === fileView;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    list.replaceChildren();

    nodes.forEach((node) => {
      const row = document.createElement("div");
      row.className = `file-row${node.id === selectedNodeId ? " is-selected" : ""}`;
      row.dataset.nodeId = node.id;
      row.role = "listitem";
      row.tabIndex = 0;
      row.setAttribute("aria-label", `${node.name}, ${typeLabel(node)}`);
      row.innerHTML = `<span><i class="file-check"></i></span><span class="file-name"><svg><use href="${nodeIcon(node)}"/></svg><strong></strong></span><span><i class="file-type">${typeLabel(node)}</i></span><span>${formatModified(node.modified)}</span><span>${node.type === "folder" ? "—" : formatBytes(node.size)}</span><button type="button" class="file-download" aria-label="${node.type === "folder" ? "Open folder" : "Download file"}"><svg><use href="${node.type === "folder" ? "#i-folder" : "#i-download"}"/></svg></button>`;
      row.querySelector("strong").textContent = node.name;
      row.addEventListener("click", (event) => {
        if (event.target.closest(".file-download")) return;
        selectedNodeId = selectedNodeId === node.id ? null : node.id;
        renderExplorer();
      });
      row.addEventListener("dblclick", () => openNode(node));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter") openNode(node);
        if (event.key === " ") {
          event.preventDefault();
          selectedNodeId = selectedNodeId === node.id ? null : node.id;
          renderExplorer();
          document.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`)?.focus();
        }
      });
      row.querySelector(".file-download").addEventListener("click", () => node.type === "folder" ? navigateTo(node.id) : downloadNode(node));
      list.append(row);
    });

    document.querySelector("#explorerTitle").textContent = `${folder.name} - My Files`;
    document.querySelector("#fileEmptyState").hidden = nodes.length > 0;
    document.querySelector("#fileCount").textContent = `${nodes.length} item${nodes.length === 1 ? "" : "s"}`;
    const selected = nodeById(selectedNodeId);
    document.querySelector("#selectedFileStatus").textContent = selected ? `${selected.name} selected` : "Select a file or folder";
    document.querySelector("#fileBackButton").disabled = folderHistoryIndex <= 0;
    document.querySelector("#fileForwardButton").disabled = folderHistoryIndex >= folderHistory.length - 1;
    document.querySelector("#fileUpButton").disabled = !folder.parent;
    document.querySelectorAll("[data-folder-shortcut]").forEach((button) => button.classList.toggle("is-selected", button.dataset.folderShortcut === folder.id));
    document.querySelectorAll("[data-folder-count]").forEach((badge) => { badge.textContent = String(childrenOf(badge.dataset.folderCount).length); });
    renderAddressBar();
  }

  function renderStorageAddressBar() {
    const bar = document.querySelector("#fileAddressBar");
    bar.replaceChildren();
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.innerHTML = '<use href="#i-drive"/>';
    const label = document.createElement("span");
    label.textContent = "Browser Storage";
    bar.append(icon, label);
  }

  async function renderManagedStorage() {
    const list = document.querySelector("#managedStorageList");
    const empty = document.querySelector("#managedStorageEmpty");
    const summary = document.querySelector("#managedStorageSummary");
    list.replaceChildren();
    empty.hidden = true;
    summary.textContent = "Calculating usage…";
    try {
      const inventory = await window.ZeroHAssetLibrary.managedStorageInventory();
      if (!storageView) return;
      const free = Math.max(0, inventory.quota - inventory.usage);
      summary.textContent = `${formatBytes(inventory.usage)} used · ${formatBytes(free)} available to this site`;
      document.querySelector("#managedStorageCount").textContent =
        `${inventory.entries.length} storage set${inventory.entries.length === 1 ? "" : "s"}`;
      empty.hidden = inventory.entries.length > 0;
      list.hidden = inventory.entries.length === 0;
      for (const entry of inventory.entries) {
        const details = document.createElement("details");
        details.className = "managed-storage-set";
        const row = document.createElement("summary");
        row.innerHTML = '<span class="managed-storage-set-title"><strong></strong><span></span></span>'
          + '<span class="managed-storage-state"></span><span class="managed-storage-size"></span>'
          + '<button type="button" class="managed-storage-delete">Delete</button>';
        row.querySelector("strong").textContent = entry.name;
        row.querySelector(".managed-storage-set-title span").textContent =
          `${entry.detail} · ${entry.files.length} file${entry.files.length === 1 ? "" : "s"}`;
        const state = row.querySelector(".managed-storage-state");
        state.textContent = entry.state;
        state.classList.add(entry.state);
        row.querySelector(".managed-storage-size").textContent = formatBytes(entry.totalBytes);
        const remove = row.querySelector(".managed-storage-delete");
        remove.disabled = !entry.deletable;
        remove.title = entry.deletable ? `Delete ${entry.name}` : "This storage set is currently in use";
        remove.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (desktop.preparingLibrary) {
            desktop.showToast("Installation in progress", "Wait until Project New Shoes finishes copying the game files before changing browser storage.", "warning");
            return;
          }
          remove.disabled = true;
          try {
            const result = await window.ZeroHAssetLibrary.deleteManagedStorage(entry.path);
            window.dispatchEvent(new CustomEvent("zeroh:managed-storage-changed", {
              detail: result,
            }));
            desktop.showToast("Storage deleted", `${entry.name} was removed.`);
          } catch (error) {
            desktop.showToast("Could not delete storage", error?.message || String(error), "warning");
          }
          await renderManagedStorage();
        });
        const files = document.createElement("div");
        files.className = "managed-storage-files";
        for (const file of entry.files.sort((left, right) => left.path.localeCompare(right.path))) {
          const fileRow = document.createElement("div");
          fileRow.className = "managed-storage-file";
          const name = document.createElement("span");
          const size = document.createElement("span");
          name.textContent = file.path;
          size.textContent = formatBytes(file.bytes);
          fileRow.append(name, size);
          files.append(fileRow);
        }
        details.append(row, files);
        list.append(details);
      }
    } catch (error) {
      summary.textContent = "Storage inventory unavailable";
      list.hidden = true;
      empty.hidden = false;
      desktop.showToast("Could not inspect browser storage", error?.message || String(error), "warning");
    }
  }

  function showManagedStorage() {
    storageView = true;
    document.querySelector("#virtualFilePanel").hidden = true;
    document.querySelector("#managedStoragePanel").hidden = false;
    document.querySelector("#fileSearch").disabled = true;
    document.querySelector("#explorerTitle").textContent = "Browser Storage - My Files";
    document.querySelectorAll("[data-folder-shortcut]").forEach((button) => button.classList.remove("is-selected"));
    document.querySelector("#browserStorageShortcut").classList.add("is-selected");
    ["#fileBackButton", "#fileForwardButton", "#fileUpButton"].forEach((selector) => {
      document.querySelector(selector).disabled = true;
    });
    renderStorageAddressBar();
    void renderManagedStorage();
  }

  function navigateTo(folderId, addHistory = true) {
    const folder = nodeById(folderId);
    if (!folder || folder.type !== "folder") return;
    storageView = false;
    document.querySelector("#virtualFilePanel").hidden = false;
    document.querySelector("#managedStoragePanel").hidden = true;
    document.querySelector("#fileSearch").disabled = false;
    document.querySelector("#browserStorageShortcut").classList.remove("is-selected");
    currentFolderId = folder.id;
    selectedNodeId = null;
    document.querySelector("#fileSearch").value = "";
    if (addHistory && folderHistory[folderHistoryIndex] !== folder.id) {
      folderHistory = folderHistory.slice(0, folderHistoryIndex + 1);
      folderHistory.push(folder.id);
      folderHistoryIndex = folderHistory.length - 1;
    }
    renderExplorer();
    if (folder.id === "replays") void refreshManagedReplays();
  }

  function setFileView(view) {
    if (view !== "list" && view !== "grid") return;
    fileView = view;
    renderExplorer();
  }

  function openNode(node) {
    if (node.type === "folder") return navigateTo(node.id);
    if (isTextNode(node)) return openTextFile(node.id);
    void downloadNode(node);
  }

  function blobForNode(node) {
    if (node.encoding === "data-url" && typeof node.content === "string") {
      const [header, data] = node.content.split(",");
      const mime = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
      const binary = atob(data);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new Blob([bytes], { type: mime });
    }
    if (typeof node.content !== "string") return null;
    return new Blob([node.content], { type: isTextNode(node) ? "text/plain" : "application/octet-stream" });
  }

  async function downloadNode(node) {
    let blob;
    let name = node.name;
    if (node.type === "folder") {
      const ids = new Set([node.id]);
      let changed = true;
      while (changed) {
        changed = false;
        fileSystem.nodes.forEach((item) => { if (item.parent && ids.has(item.parent) && !ids.has(item.id)) { ids.add(item.id); changed = true; } });
      }
      blob = new Blob([JSON.stringify(fileSystem.nodes.filter((item) => ids.has(item.id)), null, 2)], { type: "application/json" });
      name = `${node.name}.new-shoes-folder.json`;
    } else if (node.source === "engine-replay") {
      try {
        const bytes = await window.CnCPort?.readReplay?.(node.name);
        if (!bytes) throw new Error("Replay filesystem is unavailable");
        blob = new Blob([bytes], { type: "application/octet-stream" });
      } catch (error) {
        desktop.showToast("Replay download failed", error?.message || String(error), "warning");
        return;
      }
    } else {
      blob = blobForNode(node);
      if (!blob) {
        desktop.showToast("File data unavailable", `${node.name} has no retained browser-local content.`, "warning");
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 100);
    desktop.showToast("Download ready", name);
  }

  function openFilePrompt(mode) {
    const selected = nodeById(selectedNodeId);
    if (mode === "rename" && !selected) return desktop.showToast("Select an item", "Choose a file or folder to rename.", "warning");
    filePromptMode = mode;
    document.querySelector("#filePromptLabel").textContent = mode === "folder" ? "New folder name" : "New name";
    document.querySelector("#filePromptInput").value = mode === "rename" ? selected.name : "New Folder";
    document.querySelector("#filePrompt").hidden = false;
    document.querySelector("#filePromptInput").focus();
    document.querySelector("#filePromptInput").select();
  }

  function closeFilePrompt() { document.querySelector("#filePrompt").hidden = true; }

  function submitFilePrompt() {
    const input = document.querySelector("#filePromptInput");
    const requested = input.value.trim().replace(/[\\/:*?"<>|]/g, "-");
    if (!requested) return input.focus();
    const snapshot = snapshotFileSystem();
    let confirmation;
    if (filePromptMode === "folder") {
      fileSystem.nodes.push({ id: `folder-${Date.now()}`, parent: currentFolderId, type: "folder", name: uniqueName(currentFolderId, requested), modified: new Date().toISOString() });
      confirmation = ["Folder created", requested];
    } else {
      const node = nodeById(selectedNodeId);
      if (!node) return closeFilePrompt();
      node.name = uniqueName(node.parent, requested, node.id);
      node.modified = new Date().toISOString();
      confirmation = ["Item renamed", node.name];
    }
    if (!persistFileSystem()) restoreFileSystem(snapshot);
    else desktop.showToast(...confirmation);
    closeFilePrompt();
    renderExplorer();
  }

  async function deleteSelectedNode() {
    const node = nodeById(selectedNodeId);
    if (!node || node.id === "root") return desktop.showToast("Select an item", "Choose a file or folder to delete.", "warning");
    if (node.source === "engine-replay") {
      try {
        await window.CnCPort.deleteReplay(node.name, {
          allowLastReplay: !window.ZeroHRuntime?.started,
        });
        selectedNodeId = null;
        await refreshManagedReplays();
        desktop.showToast("Replay deleted", node.name);
      } catch (error) {
        desktop.showToast("Replay could not be deleted", error?.message || String(error), "warning");
      }
      return;
    }
    const snapshot = snapshotFileSystem();
    const deleted = new Set([node.id]);
    let changed = true;
    while (changed) {
      changed = false;
      fileSystem.nodes.forEach((item) => { if (item.parent && deleted.has(item.parent) && !deleted.has(item.id)) { deleted.add(item.id); changed = true; } });
    }
    fileSystem.nodes = fileSystem.nodes.filter((item) => !deleted.has(item.id));
    selectedNodeId = null;
    if (!persistFileSystem()) {
      restoreFileSystem(snapshot);
      renderExplorer();
      return;
    }
    renderExplorer();
    desktop.showToast("Deleted", node.name);
  }

  async function importFiles(files) {
    if (currentFolderId === "replays") {
      const rejected = [];
      let imported = 0;
      for (const file of files) {
        if (extensionOf(file.name) !== "rep") {
          rejected.push(`${file.name} (not a .rep file)`);
          continue;
        }
        try {
          await window.CnCPort.importReplay(file.name, await file.arrayBuffer());
          imported += 1;
        } catch (error) {
          rejected.push(`${file.name} (${error?.message || String(error)})`);
        }
      }
      await refreshManagedReplays();
      if (imported) desktop.showToast("Replay import complete", `${imported} replay${imported === 1 ? "" : "s"} added to Zero Hour.`);
      if (rejected.length) desktop.showToast("Some replays were not imported", rejected.join(", "), "warning");
      return;
    }

    const snapshot = snapshotFileSystem();
    const rejected = [];
    let imported = 0;
    for (const file of files) {
      if (file.size > MAX_IMPORT_BYTES) {
        rejected.push(`${file.name} (${formatBytes(file.size)})`);
        continue;
      }
      const extension = extensionOf(file.name);
      const node = { id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`, parent: currentFolderId, type: "file", kind: TEXT_EXTENSIONS.has(extension) ? "text" : extension === "rep" ? "replay" : extension === "sav" ? "save" : extension.match(/png|jpg|jpeg|webp/) ? "image" : "archive", name: uniqueName(currentFolderId, file.name), modified: new Date().toISOString(), size: file.size };
      try {
        if (node.kind === "text") {
          node.content = await file.text();
        } else {
          const buffer = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < buffer.length; offset += 0x8000) {
            binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000));
          }
          node.content = `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
          node.encoding = "data-url";
        }
      } catch {
        rejected.push(file.name);
        continue;
      }
      fileSystem.nodes.push(node);
      imported += 1;
    }
    if (imported && !persistFileSystem()) {
      restoreFileSystem(snapshot);
      imported = 0;
    }
    renderExplorer();
    if (imported) desktop.showToast("Import complete", `${imported} file${imported === 1 ? "" : "s"} added to ${nodeById(currentFolderId).name}.`);
    if (rejected.length) {
      desktop.showToast("Some files were not imported", `Virtual Drive keeps files up to 512 KB. Skipped ${rejected.join(", ")}.`, "warning");
    }
  }

  async function migrateVirtualReplays() {
    const legacy = fileSystem.nodes.filter((node) => node.parent === "replays"
      && node.type === "file" && node.kind === "replay" && node.source !== "engine-replay");
    if (!legacy.length || typeof window.CnCPort?.importReplay !== "function") return;
    const migrated = [];
    for (const node of legacy) {
      const blob = blobForNode(node);
      if (!blob) continue;
      try {
        await window.CnCPort.importReplay(node.name, await blob.arrayBuffer());
        migrated.push(node.id);
      } catch {
        // Keep the virtual-drive copy if the real replay store rejects it.
      }
    }
    if (migrated.length) {
      fileSystem.nodes = fileSystem.nodes.filter((node) => !migrated.includes(node.id));
      persistFileSystem();
    }
  }

  async function refreshManagedReplays(render = true) {
    if (replayRefreshPromise) return replayRefreshPromise;
    replayRefreshPromise = (async () => {
      try {
        await migrateVirtualReplays();
        const result = await window.CnCPort?.listReplays?.();
        managedReplayNodes = (result?.files || []).map((file) => ({
          id: `engine-replay-${encodeURIComponent(file.name)}`,
          parent: "replays",
          type: "file",
          kind: "replay",
          source: "engine-replay",
          name: file.name,
          modified: file.modified || new Date().toISOString(),
          size: Number(file.size || 0),
        }));
      } catch (error) {
        managedReplayNodes = [];
        if (currentFolderId === "replays") {
          desktop.showToast("Replays unavailable", error?.message || String(error), "warning");
        }
      } finally {
        replayRefreshPromise = null;
      }
      if (render) renderExplorer();
      return managedReplayNodes;
    })();
    return replayRefreshPromise;
  }

  // Notepad
  let openNoteId = null;
  let noteDirty = false;

  function updateNotepadStatus() {
    const editor = document.querySelector("#notepadEditor");
    const beforeCursor = editor.value.slice(0, editor.selectionStart);
    const lines = beforeCursor.split("\n");
    document.querySelector("#notepadStats").textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1} · ${editor.value.length} characters`;
    document.querySelector("#notepadSaveState").textContent = noteDirty ? "Modified" : openNoteId ? "Saved on New Shoes Drive" : "New document";
    const fileName = document.querySelector("#notepadFileName").value || "Untitled.txt";
    document.querySelector("#notepadTitle").textContent = `${noteDirty ? "*" : ""}${fileName} - Notepad`;
  }

  function newNote() {
    openNoteId = null;
    noteDirty = false;
    document.querySelector("#notepadFileName").value = "Untitled.txt";
    document.querySelector("#notepadEditor").value = "";
    updateNotepadStatus();
  }

  function openTextFile(nodeId) {
    const node = nodeById(nodeId);
    if (!node || !isTextNode(node)) return;
    openNoteId = node.id;
    noteDirty = false;
    document.querySelector("#notepadFileName").value = node.name;
    document.querySelector("#notepadEditor").value = node.content || "";
    updateNotepadStatus();
    desktop.openApp("notepad");
  }

  function saveNote() {
    const editor = document.querySelector("#notepadEditor");
    let fileName = document.querySelector("#notepadFileName").value.trim() || "Untitled.txt";
    if (!extensionOf(fileName)) fileName += ".txt";
    const snapshot = snapshotFileSystem();
    const previousOpenNoteId = openNoteId;
    let node = nodeById(openNoteId);
    if (!node) {
      node = { id: `note-${Date.now()}`, parent: "notes", type: "file", kind: "text", name: uniqueName("notes", fileName), modified: new Date().toISOString(), size: 0, content: "" };
      fileSystem.nodes.push(node);
      openNoteId = node.id;
    }
    node.name = uniqueName(node.parent, fileName, node.id);
    node.content = editor.value;
    node.size = new Blob([editor.value]).size;
    node.modified = new Date().toISOString();
    document.querySelector("#notepadFileName").value = node.name;
    if (!persistFileSystem()) {
      restoreFileSystem(snapshot);
      openNoteId = previousOpenNoteId;
      noteDirty = true;
      renderExplorer();
      updateNotepadStatus();
      return;
    }
    noteDirty = false;
    renderExplorer();
    updateNotepadStatus();
    desktop.showToast("Document saved", `Notes\\${node.name}`);
  }

  // Browser
  const browserPages = {
    "newshoes://start": `<main class="net-home"><section class="net-hero"><div class="net-mark"><svg><use href="#i-system"/></svg></div><p>PROJECT NEW SHOES LOCAL INTRANET</p><h1>COMMAND NET</h1><span>Local services are online. Choose a channel.</span></section><section class="net-cards"><button data-browser-page="newshoes://manual"><b>01</b><strong>FIELD MANUAL</strong><span>How this desktop works</span></button><button data-browser-page="newshoes://status"><b>02</b><strong>SYSTEM STATUS</strong><span>Runtime and storage telemetry</span></button><button data-browser-page="newshoes://games"><b>03</b><strong>GAMES</strong><span>Command-approved downtime</span></button></section><footer>NEWSHOES://LOCAL-NET · BROWSER-LOCAL UPLINK</footer></main>`,
    "newshoes://manual": `<main class="net-document"><header><span>PROJECT NEW SHOES FIELD MANUAL</span><h1>Browser desktop quick start</h1></header><section><h2>Game library</h2><p>Open the Game Launcher, select an owned disc image or installation folder, then choose temporary, remembered, or browser-installed storage.</p><h2>My Files</h2><p>Double-click folders to navigate. Text files open in Notepad. Imports smaller than 512 KB are retained and can be downloaded again.</p><h2>Desktop controls</h2><p>Drag title bars, double-click a title to maximize, and use the taskbar to minimize or restore applications.</p><h2>External web</h2><p>Type a URL in the address bar. Sites that disallow embedding can always be opened with the ↗ button.</p></section></main>`,
    "newshoes://status": `<main class="net-status-page"><header><span>UPLINK TELEMETRY</span><h1>Local runtime status</h1></header><div class="status-grid"><article><i></i><strong>WASM RUNTIME</strong><b>READY</b><span>Real engine bridge loaded</span></article><article><i></i><strong>LOCAL DRIVE</strong><b>OPFS</b><span>Private browser filesystem available</span></article><article><i></i><strong>GRAPHICS</strong><b>WEBGL2</b><span>Live capability report in Settings</span></article><article><i></i><strong>NETWORK</strong><b>WEBRTC</b><span>Optional peer-to-peer transport</span></article></div></main>`,
    "newshoes://games": `<main class="net-document games-link-page"><header><span>RECREATION CHANNEL</span><h1>Games</h1></header><section><p>Command has authorized a short break. The classics have been requisitioned and given a completely unnecessary military briefing.</p><button data-browser-open-app="games">Open Games folder</button></section></main>`,
  };
  let browserHistory = ["newshoes://start"];
  let browserIndex = 0;

  function normalizeAddress(value) {
    const address = value.trim();
    if (address.startsWith("newshoes://")) return address.toLowerCase();
    if (/^https?:\/\//i.test(address)) {
      try { return new URL(address).href; } catch { /* search for malformed URLs */ }
    }
    if (/^[\w.-]+\.[a-z]{2,}/i.test(address)) return `https://${address}`;
    return `https://duckduckgo.com/?q=${encodeURIComponent(address)}`;
  }

  function renderBrowser(address) {
    const page = document.querySelector("#browserPage");
    const frame = document.querySelector("#browserFrame");
    document.querySelector("#browserAddress").value = address;
    if (browserPages[address]) {
      frame.hidden = true;
      frame.removeAttribute("src");
      page.hidden = false;
      page.innerHTML = browserPages[address];
      page.querySelectorAll("[data-browser-page]").forEach((button) => button.addEventListener("click", () => navigateBrowser(button.dataset.browserPage)));
      page.querySelectorAll("[data-browser-open-app]").forEach((button) => button.addEventListener("click", () => desktop.openApp(button.dataset.browserOpenApp)));
      document.querySelector("#browserStatus").textContent = "Local intranet · ready";
    } else {
      page.hidden = true;
      frame.hidden = false;
      frame.src = address;
      document.querySelector("#browserStatus").textContent = `Loading ${new URL(address).hostname}…`;
    }
    document.querySelector("#browserBack").disabled = browserIndex <= 0;
    document.querySelector("#browserForward").disabled = browserIndex >= browserHistory.length - 1;
  }

  function navigateBrowser(rawAddress, addHistory = true) {
    const address = normalizeAddress(rawAddress);
    if (addHistory && browserHistory[browserIndex] !== address) {
      browserHistory = browserHistory.slice(0, browserIndex + 1);
      browserHistory.push(address);
      browserIndex = browserHistory.length - 1;
    }
    renderBrowser(address);
  }

  // Bind filesystem.
  document.querySelector("#fileSearch").addEventListener("input", renderExplorer);
  document.querySelector("#fileBackButton").addEventListener("click", () => { if (folderHistoryIndex > 0) { folderHistoryIndex -= 1; navigateTo(folderHistory[folderHistoryIndex], false); } });
  document.querySelector("#fileForwardButton").addEventListener("click", () => { if (folderHistoryIndex < folderHistory.length - 1) { folderHistoryIndex += 1; navigateTo(folderHistory[folderHistoryIndex], false); } });
  document.querySelector("#fileUpButton").addEventListener("click", () => { const parent = nodeById(currentFolderId)?.parent; if (parent) navigateTo(parent); });
  document.querySelectorAll("[data-folder-shortcut]").forEach((button) => button.addEventListener("click", () => navigateTo(button.dataset.folderShortcut)));
  document.querySelector("#browserStorageShortcut").addEventListener("click", showManagedStorage);
  document.querySelector("#refreshManagedStorageButton").addEventListener("click", () => void renderManagedStorage());
  document.querySelector("#cleanStaleStorageButton").addEventListener("click", async () => {
    const result = await window.ZeroHAssetLibrary.collectStaleRuntimeStorage();
    window.dispatchEvent(new CustomEvent("zeroh:managed-storage-changed"));
    desktop.showToast("Temporary storage cleaned",
      result.removed.length ? `${result.removed.length} stale launch set${result.removed.length === 1 ? "" : "s"} removed.` : "No removable temporary launch files were found.");
    await renderManagedStorage();
  });
  document.querySelector("#newFolderButton").addEventListener("click", () => openFilePrompt("folder"));
  document.querySelector("#renameFileButton").addEventListener("click", () => openFilePrompt("rename"));
  document.querySelector("#deleteFileButton").addEventListener("click", () => void deleteSelectedNode());
  document.querySelectorAll("[data-file-view]").forEach((button) => button.addEventListener("click", () => setFileView(button.dataset.fileView)));
  document.querySelector("#downloadFileButton").addEventListener("click", () => { const node = nodeById(selectedNodeId); if (node) void downloadNode(node); else desktop.showToast("Select an item", "Choose something to download.", "warning"); });
  document.querySelector("#importFileButton").addEventListener("click", () => document.querySelector("#fileInput").click());
  document.querySelector("#fileInput").addEventListener("change", async (event) => { if (event.target.files.length) await importFiles([...event.target.files]); event.target.value = ""; });
  document.querySelector("#filePromptCancel").addEventListener("click", closeFilePrompt);
  document.querySelector("#filePromptForm").addEventListener("submit", (event) => { event.preventDefault(); submitFilePrompt(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.querySelector("#filePrompt").hidden) closeFilePrompt();
  });

  // Bind Notepad.
  const editor = document.querySelector("#notepadEditor");
  editor.addEventListener("input", () => { noteDirty = true; updateNotepadStatus(); });
  ["click", "keyup"].forEach((eventName) => editor.addEventListener(eventName, updateNotepadStatus));
  document.querySelector("#notepadFileName").addEventListener("input", () => { noteDirty = true; updateNotepadStatus(); });
  document.querySelector("#noteNewButton").addEventListener("click", newNote);
  document.querySelector("#noteSaveButton").addEventListener("click", saveNote);
  document.querySelector("#noteOpenButton").addEventListener("click", () => { navigateTo("notes"); desktop.openApp("explorer"); desktop.showToast("Open a note", "Double-click any text document in Notes."); });
  document.querySelector("#noteDownloadButton").addEventListener("click", () => void downloadNode({ name: document.querySelector("#notepadFileName").value || "Untitled.txt", type: "file", kind: "text", content: editor.value, size: new Blob([editor.value]).size }));
  document.querySelector("#noteSelectAllButton").addEventListener("click", () => { editor.focus(); editor.select(); });
  document.querySelector("#noteWrapButton").addEventListener("click", () => { editor.classList.toggle("no-wrap"); desktop.showToast("Word wrap", editor.classList.contains("no-wrap") ? "Disabled" : "Enabled"); });
  document.querySelector("#noteHelpButton").addEventListener("click", () => desktop.showToast("Notepad", "Documents save to the Notes folder on your New Shoes Drive."));

  // Bind Browser.
  document.querySelector("#browserAddressForm").addEventListener("submit", (event) => { event.preventDefault(); navigateBrowser(document.querySelector("#browserAddress").value); });
  document.querySelector("#browserHome").addEventListener("click", () => navigateBrowser("newshoes://start"));
  document.querySelector("#browserReload").addEventListener("click", () => renderBrowser(browserHistory[browserIndex]));
  document.querySelector("#browserBack").addEventListener("click", () => { if (browserIndex > 0) { browserIndex -= 1; renderBrowser(browserHistory[browserIndex]); } });
  document.querySelector("#browserForward").addEventListener("click", () => { if (browserIndex < browserHistory.length - 1) { browserIndex += 1; renderBrowser(browserHistory[browserIndex]); } });
  document.querySelector("#browserExternal").addEventListener("click", () => { const address = browserHistory[browserIndex]; if (/^https?:\/\//.test(address)) window.open(address, "_blank", "noopener"); else desktop.showToast("Local page", "This page only exists inside Project New Shoes Browser."); });
  document.querySelector("#browserFrame").addEventListener("load", (event) => {
    if (!event.currentTarget.hidden) {
      document.querySelector("#browserStatus").textContent = "External page requested · use ↗ if the site blocks embedding";
    }
  });
  document.querySelectorAll(".browser-favorites [data-browser-page]").forEach((button) => button.addEventListener("click", () => navigateBrowser(button.dataset.browserPage)));

  window.addEventListener("zeroh:reset-apps", () => {
    try { localStorage.removeItem(FILESYSTEM_KEY); } catch { /* storage is optional */ }
    fileSystem = seedFileSystem();
    currentFolderId = "root";
    selectedNodeId = null;
    folderHistory = ["root"];
    folderHistoryIndex = 0;
    persistFileSystem();
    newNote();
    navigateTo("root", false);
    window.ZeroHGames?.resetAll();
  });
  window.addEventListener("cncport:runtimeclosed", () => void refreshManagedReplays());

  persistFileSystem();
  renderExplorer();
  void refreshManagedReplays();
  newNote();
  renderBrowser("newshoes://start");

  window.ZeroHApps = { navigateTo, showManagedStorage, openTextFile, getFileSystem: () => fileSystem };
})();
