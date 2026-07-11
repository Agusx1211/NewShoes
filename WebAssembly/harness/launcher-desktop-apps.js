(() => {
  "use strict";

  const desktop = window.ZeroHDesktop;
  const FILESYSTEM_KEY = "zeroh-filesystem-v1";
  const MAX_IMPORT_BYTES = 512 * 1024;
  const TEXT_EXTENSIONS = new Set(["txt", "md", "ini", "log", "json", "cfg"]);

  function seedFileSystem() {
    const modified = new Date().toISOString();
    return {
      version: 2,
      nodes: [
        { id: "root", parent: null, type: "folder", name: "ZeroH Drive", modified },
        { id: "saves", parent: "root", type: "folder", name: "Game Saves", modified },
        { id: "replays", parent: "root", type: "folder", name: "Replays", modified },
        { id: "notes", parent: "root", type: "folder", name: "Notes", modified },
        { id: "screens", parent: "root", type: "folder", name: "Screenshots", modified },
        { id: "mods", parent: "root", type: "folder", name: "Mods", modified },
        { id: "note-1", parent: "notes", type: "file", kind: "text", name: "Welcome to ZeroH.txt", modified, size: 268, content: "Welcome, Commander.\n\nThis Notepad document lives on the ZeroH virtual drive. Edit it, save it, close the browser, and open it again from My Files.\n\nUseful places:\n- Game Saves\n- Replays\n- Screenshots\n- Mods\n" },
        { id: "note-2", parent: "notes", type: "file", kind: "text", name: "Battle plan.txt", modified, size: 151, content: "BATTLE PLAN\n===========\n1. Secure both supply docks.\n2. Scout the northern ridge.\n3. Keep one dozer in reserve.\n4. Do not panic.\n" },
        { id: "mod-readme", parent: "mods", type: "file", kind: "text", name: "About mods.txt", modified, size: 150, content: "MOD STAGING AREA\n================\nImported files remain in this browser workspace. The game currently launches only original unmodified runtime archives.\n" },
      ],
    };
  }

  function loadFileSystem() {
    try {
      const stored = JSON.parse(localStorage.getItem(FILESYSTEM_KEY));
      if (stored?.version === 2 && Array.isArray(stored.nodes) && stored.nodes.some((node) => node.id === "root")) return stored;
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

  const nodeById = (id) => fileSystem.nodes.find((node) => node.id === id);
  const childrenOf = (id) => fileSystem.nodes.filter((node) => node.parent === id);
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

  function navigateTo(folderId, addHistory = true) {
    const folder = nodeById(folderId);
    if (!folder || folder.type !== "folder") return;
    currentFolderId = folder.id;
    selectedNodeId = null;
    document.querySelector("#fileSearch").value = "";
    if (addHistory && folderHistory[folderHistoryIndex] !== folder.id) {
      folderHistory = folderHistory.slice(0, folderHistoryIndex + 1);
      folderHistory.push(folder.id);
      folderHistoryIndex = folderHistory.length - 1;
    }
    renderExplorer();
  }

  function setFileView(view) {
    if (view !== "list" && view !== "grid") return;
    fileView = view;
    renderExplorer();
  }

  function openNode(node) {
    if (node.type === "folder") return navigateTo(node.id);
    if (isTextNode(node)) return openTextFile(node.id);
    downloadNode(node);
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

  function downloadNode(node) {
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
      name = `${node.name}.zeroh-folder.json`;
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

  function deleteSelectedNode() {
    const node = nodeById(selectedNodeId);
    if (!node || node.id === "root") return desktop.showToast("Select an item", "Choose a file or folder to delete.", "warning");
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

  // Notepad
  let openNoteId = null;
  let noteDirty = false;

  function updateNotepadStatus() {
    const editor = document.querySelector("#notepadEditor");
    const beforeCursor = editor.value.slice(0, editor.selectionStart);
    const lines = beforeCursor.split("\n");
    document.querySelector("#notepadStats").textContent = `Ln ${lines.length}, Col ${lines.at(-1).length + 1} · ${editor.value.length} characters`;
    document.querySelector("#notepadSaveState").textContent = noteDirty ? "Modified" : openNoteId ? "Saved on ZeroH Drive" : "New document";
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
    "zeroh://start": `<main class="net-home"><section class="net-hero"><div class="net-mark"><svg><use href="#i-system"/></svg></div><p>ZEROH LOCAL INTRANET</p><h1>COMMAND NET</h1><span>Local services are online. Choose a channel.</span></section><section class="net-cards"><button data-browser-page="zeroh://manual"><b>01</b><strong>FIELD MANUAL</strong><span>How this desktop works</span></button><button data-browser-page="zeroh://status"><b>02</b><strong>SYSTEM STATUS</strong><span>Runtime and storage telemetry</span></button><button data-browser-page="zeroh://arcade"><b>03</b><strong>FIELD ARCADE</strong><span>Authorized downtime</span></button></section><footer>ZEROH://LOCAL-NET · BROWSER-LOCAL UPLINK</footer></main>`,
    "zeroh://manual": `<main class="net-document"><header><span>ZEROH FIELD MANUAL</span><h1>Browser desktop quick start</h1></header><section><h2>Game library</h2><p>Open the Game Launcher, select an owned disc image or installation folder, then choose temporary, remembered, or browser-installed storage.</p><h2>My Files</h2><p>Double-click folders to navigate. Text files open in Notepad. Imports smaller than 512 KB are retained and can be downloaded again.</p><h2>Desktop controls</h2><p>Drag title bars, double-click a title to maximize, and use the taskbar to minimize or restore applications.</p><h2>External web</h2><p>Type a URL in the address bar. Sites that disallow embedding can always be opened with the ↗ button.</p></section></main>`,
    "zeroh://status": `<main class="net-status-page"><header><span>UPLINK TELEMETRY</span><h1>Local runtime status</h1></header><div class="status-grid"><article><i></i><strong>WASM RUNTIME</strong><b>READY</b><span>Real engine bridge loaded</span></article><article><i></i><strong>LOCAL DRIVE</strong><b>OPFS</b><span>Private browser filesystem available</span></article><article><i></i><strong>GRAPHICS</strong><b>WEBGL2</b><span>Live capability report in Settings</span></article><article><i></i><strong>NETWORK</strong><b>WEBRTC</b><span>Optional peer-to-peer transport</span></article></div></main>`,
    "zeroh://arcade": `<main class="net-document arcade-link-page"><header><span>RECREATION CHANNEL</span><h1>Field Arcade</h1></header><section><p>Command has authorized a short break. Clear a minefield or exercise signal recall.</p><button data-browser-open-app="arcade">Open ZeroH Arcade</button></section></main>`,
  };
  let browserHistory = ["zeroh://start"];
  let browserIndex = 0;

  function normalizeAddress(value) {
    const address = value.trim();
    if (address.startsWith("zeroh://")) return address.toLowerCase();
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

  // Minefield
  const MINE_SIZE = 9;
  const MINE_TOTAL = 10;
  let mineState;

  function mineNeighbors(index) {
    const row = Math.floor(index / MINE_SIZE);
    const column = index % MINE_SIZE;
    const neighbors = [];
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        const nextRow = row + rowOffset;
        const nextColumn = column + columnOffset;
        if ((rowOffset || columnOffset) && nextRow >= 0 && nextRow < MINE_SIZE && nextColumn >= 0 && nextColumn < MINE_SIZE) neighbors.push(nextRow * MINE_SIZE + nextColumn);
      }
    }
    return neighbors;
  }

  function placeMines(safeIndex) {
    const choices = Array.from({ length: MINE_SIZE * MINE_SIZE }, (_, index) => index).filter((index) => index !== safeIndex);
    for (let count = 0; count < MINE_TOTAL; count += 1) {
      const pick = Math.floor(Math.random() * choices.length);
      mineState.cells[choices.splice(pick, 1)[0]].mine = true;
    }
    mineState.cells.forEach((cell, index) => { cell.nearby = mineNeighbors(index).filter((neighbor) => mineState.cells[neighbor].mine).length; });
  }

  function renderMinefield() {
    const grid = document.querySelector("#mineGrid");
    grid.replaceChildren();
    mineState.cells.forEach((cell, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `mine-cell${cell.revealed ? " is-revealed" : ""}${cell.flagged ? " is-flagged" : ""}${cell.revealed && cell.mine ? " is-mine" : ""}${cell.revealed && cell.nearby ? ` n${cell.nearby}` : ""}`;
      button.textContent = cell.flagged ? "⚑" : cell.revealed && cell.mine ? "✹" : cell.revealed && cell.nearby ? String(cell.nearby) : "";
      button.setAttribute("aria-label", cell.flagged ? "Flagged cell" : !cell.revealed ? "Hidden cell"
        : cell.mine ? "Revealed mine" : cell.nearby ? `${cell.nearby} adjacent mines` : "Clear cell");
      button.addEventListener("click", () => revealMineCell(index));
      button.addEventListener("contextmenu", (event) => { event.preventDefault(); toggleMineFlag(index); });
      grid.append(button);
    });
    const flags = mineState.cells.filter((cell) => cell.flagged).length;
    document.querySelector("#mineCount").textContent = String(Math.max(0, MINE_TOTAL - flags)).padStart(2, "0");
    document.querySelector("#mineTimer").textContent = String(mineState.time).padStart(3, "0");
    document.querySelector("#mineReset").textContent = mineState.won ? "😎" : mineState.ended ? "😵" : "🙂";
  }

  function startMineTimer() {
    if (mineState.timer) return;
    mineState.timer = window.setInterval(() => {
      mineState.time = Math.min(999, mineState.time + 1);
      document.querySelector("#mineTimer").textContent = String(mineState.time).padStart(3, "0");
    }, 1000);
  }

  function finishMinefield(won) {
    mineState.ended = true;
    mineState.won = won;
    window.clearInterval(mineState.timer);
    mineState.timer = null;
    if (!won) mineState.cells.forEach((cell) => { if (cell.mine) cell.revealed = true; });
    desktop.showToast(won ? "Sector cleared" : "Mine triggered", won ? `Minefield secured in ${mineState.time} seconds.` : "Reset the board and try another approach.", won ? "success" : "warning");
    renderMinefield();
  }

  function revealMineCell(index) {
    if (mineState.ended || mineState.cells[index].flagged || mineState.cells[index].revealed) return;
    if (!mineState.started) {
      mineState.started = true;
      placeMines(index);
      startMineTimer();
    }
    if (mineState.cells[index].mine) {
      mineState.cells[index].revealed = true;
      return finishMinefield(false);
    }
    const queue = [index];
    const visited = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      const cell = mineState.cells[current];
      if (cell.flagged || cell.mine) continue;
      cell.revealed = true;
      if (cell.nearby === 0) mineNeighbors(current).forEach((neighbor) => queue.push(neighbor));
    }
    if (mineState.cells.filter((cell) => cell.revealed && !cell.mine).length === MINE_SIZE * MINE_SIZE - MINE_TOTAL) return finishMinefield(true);
    renderMinefield();
  }

  function toggleMineFlag(index) {
    const cell = mineState.cells[index];
    if (mineState.ended || cell.revealed) return;
    cell.flagged = !cell.flagged;
    renderMinefield();
  }

  function resetMinefield() {
    if (mineState?.timer) window.clearInterval(mineState.timer);
    mineState = { cells: Array.from({ length: MINE_SIZE * MINE_SIZE }, () => ({ mine: false, nearby: 0, revealed: false, flagged: false })), started: false, ended: false, won: false, time: 0, timer: null };
    renderMinefield();
  }

  // Signal Match
  const MEMORY_SIGNALS = ["◆", "●", "▲", "✦", "⬢", "⌁", "✚", "◈"];
  let memoryState;
  let memoryGeneration = 0;

  function shuffle(values) {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const pick = Math.floor(Math.random() * (index + 1));
      [values[index], values[pick]] = [values[pick], values[index]];
    }
    return values;
  }

  function renderMemory() {
    const grid = document.querySelector("#memoryGrid");
    grid.replaceChildren();
    memoryState.cards.forEach((card, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `memory-card${card.revealed || card.matched ? " is-revealed" : ""}${card.matched ? " is-matched" : ""}`;
      button.innerHTML = `<span>${card.revealed || card.matched ? card.signal : "?"}</span>`;
      button.setAttribute("aria-label", card.matched ? `Matched ${card.signal}` : card.revealed ? `Signal ${card.signal}` : "Hidden signal");
      button.addEventListener("click", () => revealMemoryCard(index));
      grid.append(button);
    });
    document.querySelector("#memoryMoves").textContent = String(memoryState.moves);
    document.querySelector("#memoryPairs").textContent = `${memoryState.pairs}/8`;
  }

  function revealMemoryCard(index) {
    const card = memoryState.cards[index];
    if (memoryState.locked || card.revealed || card.matched) return;
    card.revealed = true;
    memoryState.open.push(index);
    renderMemory();
    if (memoryState.open.length < 2) return;
    memoryState.moves += 1;
    renderMemory();
    const [first, second] = memoryState.open;
    if (memoryState.cards[first].signal === memoryState.cards[second].signal) {
      memoryState.cards[first].matched = true;
      memoryState.cards[second].matched = true;
      memoryState.cards[first].revealed = false;
      memoryState.cards[second].revealed = false;
      memoryState.open = [];
      memoryState.pairs += 1;
      if (memoryState.pairs === 8) desktop.showToast("Signals decoded", `All pairs matched in ${memoryState.moves} moves.`);
      renderMemory();
    } else {
      memoryState.locked = true;
      const generation = memoryGeneration;
      window.setTimeout(() => {
        if (generation !== memoryGeneration) return;
        memoryState.cards[first].revealed = false;
        memoryState.cards[second].revealed = false;
        memoryState.open = [];
        memoryState.locked = false;
        renderMemory();
      }, 650);
    }
  }

  function resetMemory() {
    memoryGeneration += 1;
    memoryState = { cards: shuffle([...MEMORY_SIGNALS, ...MEMORY_SIGNALS]).map((signal) => ({ signal, revealed: false, matched: false })), open: [], moves: 0, pairs: 0, locked: false };
    renderMemory();
  }

  // Bind filesystem.
  document.querySelector("#fileSearch").addEventListener("input", renderExplorer);
  document.querySelector("#fileBackButton").addEventListener("click", () => { if (folderHistoryIndex > 0) { folderHistoryIndex -= 1; navigateTo(folderHistory[folderHistoryIndex], false); } });
  document.querySelector("#fileForwardButton").addEventListener("click", () => { if (folderHistoryIndex < folderHistory.length - 1) { folderHistoryIndex += 1; navigateTo(folderHistory[folderHistoryIndex], false); } });
  document.querySelector("#fileUpButton").addEventListener("click", () => { const parent = nodeById(currentFolderId)?.parent; if (parent) navigateTo(parent); });
  document.querySelectorAll("[data-folder-shortcut]").forEach((button) => button.addEventListener("click", () => navigateTo(button.dataset.folderShortcut)));
  document.querySelector("#newFolderButton").addEventListener("click", () => openFilePrompt("folder"));
  document.querySelector("#renameFileButton").addEventListener("click", () => openFilePrompt("rename"));
  document.querySelector("#deleteFileButton").addEventListener("click", deleteSelectedNode);
  document.querySelectorAll("[data-file-view]").forEach((button) => button.addEventListener("click", () => setFileView(button.dataset.fileView)));
  document.querySelector("#downloadFileButton").addEventListener("click", () => { const node = nodeById(selectedNodeId); if (node) downloadNode(node); else desktop.showToast("Select an item", "Choose something to download.", "warning"); });
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
  document.querySelector("#noteDownloadButton").addEventListener("click", () => downloadNode({ name: document.querySelector("#notepadFileName").value || "Untitled.txt", type: "file", kind: "text", content: editor.value, size: new Blob([editor.value]).size }));
  document.querySelector("#noteSelectAllButton").addEventListener("click", () => { editor.focus(); editor.select(); });
  document.querySelector("#noteWrapButton").addEventListener("click", () => { editor.classList.toggle("no-wrap"); desktop.showToast("Word wrap", editor.classList.contains("no-wrap") ? "Disabled" : "Enabled"); });
  document.querySelector("#noteHelpButton").addEventListener("click", () => desktop.showToast("Notepad", "Documents save to the Notes folder on your ZeroH Drive."));

  // Bind Browser.
  document.querySelector("#browserAddressForm").addEventListener("submit", (event) => { event.preventDefault(); navigateBrowser(document.querySelector("#browserAddress").value); });
  document.querySelector("#browserHome").addEventListener("click", () => navigateBrowser("zeroh://start"));
  document.querySelector("#browserReload").addEventListener("click", () => renderBrowser(browserHistory[browserIndex]));
  document.querySelector("#browserBack").addEventListener("click", () => { if (browserIndex > 0) { browserIndex -= 1; renderBrowser(browserHistory[browserIndex]); } });
  document.querySelector("#browserForward").addEventListener("click", () => { if (browserIndex < browserHistory.length - 1) { browserIndex += 1; renderBrowser(browserHistory[browserIndex]); } });
  document.querySelector("#browserExternal").addEventListener("click", () => { const address = browserHistory[browserIndex]; if (/^https?:\/\//.test(address)) window.open(address, "_blank", "noopener"); else desktop.showToast("Local page", "This page only exists inside ZeroH Browser."); });
  document.querySelector("#browserFrame").addEventListener("load", (event) => {
    if (!event.currentTarget.hidden) {
      document.querySelector("#browserStatus").textContent = "External page requested · use ↗ if the site blocks embedding";
    }
  });
  document.querySelectorAll(".browser-favorites [data-browser-page]").forEach((button) => button.addEventListener("click", () => navigateBrowser(button.dataset.browserPage)));

  // Bind Arcade.
  const arcadeTabs = [...document.querySelectorAll("[data-arcade-tab]")];
  function selectArcadeTab(button) {
    arcadeTabs.forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("is-selected", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll("[data-arcade-panel]").forEach((panel) => panel.classList.toggle("is-visible", panel.dataset.arcadePanel === button.dataset.arcadeTab));
  }
  arcadeTabs.forEach((button, index) => {
    button.addEventListener("click", () => selectArcadeTab(button));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = arcadeTabs[(index + (event.key === "ArrowRight" ? 1 : -1) + arcadeTabs.length) % arcadeTabs.length];
      next.focus();
      selectArcadeTab(next);
    });
  });
  document.querySelector("#mineReset").addEventListener("click", resetMinefield);
  document.querySelector("#memoryReset").addEventListener("click", resetMemory);

  window.addEventListener("zeroh:reset-apps", () => {
    localStorage.removeItem(FILESYSTEM_KEY);
    fileSystem = seedFileSystem();
    currentFolderId = "root";
    selectedNodeId = null;
    folderHistory = ["root"];
    folderHistoryIndex = 0;
    persistFileSystem();
    newNote();
    renderExplorer();
    resetMinefield();
    resetMemory();
  });

  persistFileSystem();
  renderExplorer();
  newNote();
  renderBrowser("zeroh://start");
  resetMinefield();
  resetMemory();

  window.ZeroHApps = { navigateTo, openTextFile, getFileSystem: () => fileSystem };
})();
