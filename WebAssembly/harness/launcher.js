(() => {
  "use strict";

  const DEFAULT_LAUNCHER_LOGO = "01";
  const LOGO_DECISION_VERSION = "round-01-folded-command";
  const LAYOUT_VERSION = "launcher-centered-v1";

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch { /* storage is optional */ }
  }

  if (storageGet("zeroh-logo-decision") !== LOGO_DECISION_VERSION) {
    storageSet("zeroh-selected-logo", DEFAULT_LAUNCHER_LOGO);
    storageSet("zeroh-logo-decision", LOGO_DECISION_VERSION);
  }

  const APP_META = {
    setup: { title: "ZeroH Game Launcher", launcherLogo: true },
    explorer: { title: "My Files", icon: "#i-folder" },
    browser: { title: "ZeroH Browser", icon: "#i-browser" },
    notepad: { title: "Notepad", icon: "#i-note" },
    arcade: { title: "ZeroH Arcade", icon: "#i-arcade" },
    programs: { title: "Game Library", icon: "#i-apps" },
    settings: { title: "ZeroH Desktop Settings", icon: "#i-gear" },
    about: { title: "About ZeroH", icon: "#i-info" },
  };

  const state = {
    z: 20,
    wizardStep: 1,
    source: null,
    storageMode: "once",
    launching: false,
    library: readStoredLibrary(),
    windowLayout: readWindowLayout(),
  };

  const desktop = document.querySelector("#desktop");
  const startMenu = document.querySelector("#startMenu");
  const startButton = document.querySelector("#startButton");
  const taskButtons = document.querySelector("#taskButtons");
  const launchOverlay = document.querySelector("#launchOverlay");
  let interfaceAudioContext = null;

  function readStoredLibrary() {
    try { return JSON.parse(storageGet("zeroh-library") || storageGet("fielddesk-library")) || null; }
    catch { return null; }
  }

  function persistLibrary() {
    if (!state.library || state.library.mode === "once") {
      storageRemove("zeroh-library");
      storageRemove("fielddesk-library");
      return true;
    }
    const stored = storageSet("zeroh-library", JSON.stringify(state.library));
    storageRemove("fielddesk-library");
    return stored;
  }

  function readWindowLayout() {
    try {
      const layout = JSON.parse(storageGet("zeroh-window-layout")) || {};
      if (storageGet("zeroh-layout-version") !== LAYOUT_VERSION) {
        delete layout.setup;
        storageSet("zeroh-window-layout", JSON.stringify(layout));
        storageSet("zeroh-layout-version", LAYOUT_VERSION);
      }
      return layout;
    } catch {
      return {};
    }
  }

  function saveWindowLayout(windowEl) {
    if (window.innerWidth <= 760) return;
    const appId = windowEl.dataset.app;
    const previous = state.windowLayout[appId] || {};
    const next = { ...previous, maximized: windowEl.classList.contains("is-maximized") };
    if (!next.maximized) {
      const windowRect = windowEl.getBoundingClientRect();
      const layerRect = document.querySelector("#windowLayer").getBoundingClientRect();
      next.left = Math.round(windowRect.left - layerRect.left);
      next.top = Math.round(windowRect.top - layerRect.top);
    }
    state.windowLayout[appId] = next;
    storageSet("zeroh-window-layout", JSON.stringify(state.windowLayout));
  }

  function restoreWindowLayout() {
    if (window.innerWidth <= 760) return;
    document.querySelectorAll(".window").forEach((windowEl) => {
      const saved = state.windowLayout[windowEl.dataset.app];
      if (!saved) return;
      if (saved.maximized) {
        windowEl.classList.add("is-maximized");
        windowEl.style.removeProperty("left");
        windowEl.style.removeProperty("top");
        windowEl.style.transform = "none";
      } else if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
        windowEl.style.left = `${saved.left}px`;
        windowEl.style.top = `${saved.top}px`;
        windowEl.style.transform = "none";
      }
    });
  }

  function constrainWindow(windowEl) {
    if (window.innerWidth <= 760 || windowEl.classList.contains("is-maximized")) return;
    const layerRect = document.querySelector("#windowLayer").getBoundingClientRect();
    const windowRect = windowEl.getBoundingClientRect();
    const currentLeft = windowRect.left - layerRect.left;
    const currentTop = windowRect.top - layerRect.top;
    const left = Math.min(Math.max(0, currentLeft), Math.max(0, layerRect.width - windowRect.width));
    const top = Math.min(Math.max(0, currentTop), Math.max(0, layerRect.height - windowRect.height));
    if (Math.abs(left - currentLeft) > 0.5 || Math.abs(top - currentTop) > 0.5) {
      windowEl.style.left = `${Math.round(left)}px`;
      windowEl.style.top = `${Math.round(top)}px`;
      windowEl.style.transform = "none";
    }
  }

  function showToast(title, message, kind = "success") {
    const toast = document.createElement("div");
    toast.className = `toast${kind === "warning" ? " warning" : ""}`;
    toast.innerHTML = `<span class="toast-icon">${kind === "warning" ? "!" : "✓"}</span><div><strong></strong><span></span></div>`;
    toast.querySelector("strong").textContent = title;
    toast.querySelector(":scope > div > span").textContent = message;
    document.querySelector("#toastRegion").append(toast);
    window.setTimeout(() => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 220);
    }, 3200);
  }

  function playInterfaceSound(kind = "open") {
    if (!document.querySelector("#soundToggle")?.checked) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      interfaceAudioContext ||= new AudioContext();
      void interfaceAudioContext.resume().catch(() => {});
      const now = interfaceAudioContext.currentTime;
      const oscillator = interfaceAudioContext.createOscillator();
      const gain = interfaceAudioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = { open: 620, close: 420, menu: 520, enabled: 740 }[kind] || 560;
      gain.gain.setValueAtTime(0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      oscillator.connect(gain).connect(interfaceAudioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.05);
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        gain.disconnect();
      }, { once: true });
    } catch {
      // Audio output is optional and may be blocked by browser policy.
    }
  }

  async function refreshStorageUI() {
    try {
      const estimate = await navigator.storage?.estimate?.();
      const quota = Number(estimate?.quota);
      const usage = Number(estimate?.usage);
      if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(usage)) {
        throw new Error("Storage estimate unavailable");
      }
      const free = Math.max(0, quota - usage);
      const label = free >= 1024 ** 3
        ? `${(free / 1024 ** 3).toFixed(1)} GB free`
        : `${Math.round(free / 1024 ** 2)} MB free`;
      document.querySelectorAll("[data-storage-free]").forEach((node) => { node.textContent = label; });
      const usedPercent = Math.min(100, Math.max(0, (usage / quota) * 100));
      document.querySelectorAll(".storage-meter-small > i span, .start-storage > i span")
        .forEach((node) => { node.style.width = `${usedPercent.toFixed(1)}%`; });
    } catch {
      document.querySelectorAll("[data-storage-free]").forEach((node) => { node.textContent = "Space unavailable"; });
      document.querySelectorAll(".storage-meter-small > i span, .start-storage > i span")
        .forEach((node) => { node.style.width = "0%"; });
    }
  }

  function syncStorageModeUI() {
    document.querySelectorAll('input[name="storageMode"]').forEach((input) => {
      input.checked = input.value === state.storageMode;
      input.closest(".storage-choice")?.classList.toggle("is-selected", input.checked);
    });
    document.querySelector("#spaceWarning").hidden = state.storageMode !== "install";
  }

  function setRememberAvailability(available) {
    const input = document.querySelector('input[name="storageMode"][value="remember"]');
    if (!input) return;
    input.disabled = !available;
    const choice = input.closest(".storage-choice");
    choice?.classList.toggle("is-disabled", !available);
    const note = choice?.querySelector("small");
    if (note) note.textContent = available
      ? "Keep browser permission to this source when supported."
      : "This source cannot retain a reusable browser permission.";
    if (!available && state.storageMode === "remember") {
      state.storageMode = "once";
      syncStorageModeUI();
    }
  }

  function setSourcePickerBusy(busy) {
    document.querySelectorAll("#pickImageButton, #pickFolderButton, #addMoreImagesButton, .selected-media-remove").forEach((button) => {
      button.disabled = busy;
    });
    document.querySelector("#scanPanel").setAttribute("aria-busy", String(busy));
  }

  function sourceChangeNeedsReload() {
    if (!window.ZeroHRuntime?.started) return false;
    showToast("Reload required", "The running engine owns the current archives. Reload ZeroH before selecting a different source.", "warning");
    return true;
  }

  function focusWindow(windowEl) {
    document.querySelectorAll(".window.is-active").forEach((el) => el.classList.remove("is-active"));
    windowEl.classList.add("is-active");
    windowEl.style.zIndex = String(++state.z);
    syncTaskbarState();
  }

  function openApp(appId) {
    const windowEl = document.querySelector(`.window[data-app="${appId}"]`);
    if (!windowEl) return;
    const wasOpen = windowEl.classList.contains("is-open");
    windowEl.classList.add("is-open");
    windowEl.classList.remove("is-minimized");
    constrainWindow(windowEl);
    focusWindow(windowEl);
    closeStartMenu();
    if (!wasOpen) renderTaskbar();
    playInterfaceSound("open");
  }

  function closeWindow(windowEl) {
    windowEl.classList.remove("is-open", "is-minimized", "is-active");
    focusTopWindow();
    renderTaskbar();
    playInterfaceSound("close");
  }

  function minimizeWindow(windowEl) {
    windowEl.classList.add("is-minimized");
    windowEl.classList.remove("is-active");
    focusTopWindow();
    syncTaskbarState();
    playInterfaceSound("close");
  }

  function focusTopWindow() {
    const topWindow = [...document.querySelectorAll(".window.is-open:not(.is-minimized)")]
      .sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0))
      .at(-1);
    if (topWindow) focusWindow(topWindow);
  }

  function toggleMaximize(windowEl) {
    const maximizing = !windowEl.classList.contains("is-maximized");
    if (maximizing) {
      saveWindowLayout(windowEl);
      windowEl.classList.add("is-maximized");
      windowEl.style.removeProperty("left");
      windowEl.style.removeProperty("top");
      windowEl.style.transform = "none";
      state.windowLayout[windowEl.dataset.app].maximized = true;
      storageSet("zeroh-window-layout", JSON.stringify(state.windowLayout));
    } else {
      windowEl.classList.remove("is-maximized");
      const saved = state.windowLayout[windowEl.dataset.app];
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
        windowEl.style.left = `${saved.left}px`;
        windowEl.style.top = `${saved.top}px`;
      }
      windowEl.style.transform = "none";
      constrainWindow(windowEl);
      saveWindowLayout(windowEl);
    }
    focusWindow(windowEl);
  }

  function renderTaskbar() {
    taskButtons.replaceChildren();
    document.querySelectorAll(".window.is-open").forEach((windowEl) => {
      const appId = windowEl.dataset.app;
      const meta = APP_META[appId];
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.app = appId;
      button.className = `task-button${windowEl.classList.contains("is-active") && !windowEl.classList.contains("is-minimized") ? " is-active" : ""}`;
      const icon = meta.launcherLogo
        ? `<img src="${getLauncherLogoPath()}" alt="">`
        : `<svg><use href="${meta.icon}"/></svg>`;
      button.innerHTML = `${icon}<span>${meta.title}</span>`;
      button.addEventListener("click", () => {
        if (windowEl.classList.contains("is-minimized")) {
          windowEl.classList.remove("is-minimized");
          focusWindow(windowEl);
        } else if (windowEl.classList.contains("is-active")) {
          minimizeWindow(windowEl);
        } else {
          focusWindow(windowEl);
        }
      });
      taskButtons.append(button);
    });
  }

  function syncTaskbarState() {
    taskButtons.querySelectorAll(".task-button").forEach((button) => {
      const windowEl = document.querySelector(`.window[data-app="${button.dataset.app}"]`);
      button.classList.toggle("is-active", Boolean(windowEl?.classList.contains("is-active") && !windowEl.classList.contains("is-minimized")));
    });
  }

  function closeStartMenu() {
    startMenu.hidden = true;
    startButton.classList.remove("is-active");
    startButton.setAttribute("aria-expanded", "false");
  }

  function getLauncherLogoPath(id = storageGet("zeroh-selected-logo") || DEFAULT_LAUNCHER_LOGO) {
    const number = Number(id);
    const validId = /^\d{2}$/.test(id || "") && number >= 1 && number <= 20 ? id : DEFAULT_LAUNCHER_LOGO;
    return validId === DEFAULT_LAUNCHER_LOGO
      ? "./assets/launcher-logo.webp"
      : `./assets/logos/logo-${validId}.webp`;
  }

  function applyLauncherLogo(id) {
    const path = getLauncherLogoPath(id);
    document.querySelectorAll("[data-launcher-logo-image]").forEach((image) => {
      image.src = path;
    });
    document.querySelector('link[rel="icon"]')?.setAttribute("href", path);
    const taskbarLogo = taskButtons.querySelector('.task-button[data-app="setup"] img');
    if (taskbarLogo) taskbarLogo.src = path;
  }

  function openLogoLab() {
    closeStartMenu();
    window.open("./logos.html", "zeroh-logo-lab");
  }

  function bindWindows() {
    document.querySelectorAll(".window").forEach((windowEl) => {
      windowEl.addEventListener("pointerdown", () => focusWindow(windowEl));
      const titlebar = windowEl.querySelector(".titlebar");
      titlebar.addEventListener("dblclick", (event) => {
        if (!event.target.closest("button")) toggleMaximize(windowEl);
      });
      titlebar.addEventListener("pointerdown", (event) => beginDrag(event, windowEl));
      windowEl.querySelectorAll("[data-window-action]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const action = button.dataset.windowAction;
          if (action === "close") closeWindow(windowEl);
          if (action === "minimize") minimizeWindow(windowEl);
          if (action === "maximize") toggleMaximize(windowEl);
        });
      });
    });
  }

  function beginDrag(event, windowEl) {
    if (event.button !== 0 || event.target.closest("button") || windowEl.classList.contains("is-maximized") || window.innerWidth <= 760) return;
    event.preventDefault();
    const rect = windowEl.getBoundingClientRect();
    const layerRect = document.querySelector("#windowLayer").getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const startLeft = rect.left - layerRect.left;
    const startTop = rect.top - layerRect.top;
    let finalLeft = startLeft;
    let finalTop = startTop;
    let dragFrame = 0;
    windowEl.style.left = `${startLeft}px`;
    windowEl.style.top = `${startTop}px`;
    windowEl.style.transform = "none";
    windowEl.classList.add("dragging");
    windowEl.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      finalLeft = Math.max(0, Math.min(layerRect.width - rect.width, moveEvent.clientX - layerRect.left - offsetX));
      finalTop = Math.max(0, Math.min(layerRect.height - rect.height, moveEvent.clientY - layerRect.top - offsetY));
      if (!dragFrame) {
        dragFrame = window.requestAnimationFrame(() => {
          windowEl.style.transform = `translate3d(${finalLeft - startLeft}px, ${finalTop - startTop}px, 0)`;
          dragFrame = 0;
        });
      }
    };
    const end = () => {
      if (dragFrame) window.cancelAnimationFrame(dragFrame);
      windowEl.classList.remove("dragging");
      windowEl.style.left = `${finalLeft}px`;
      windowEl.style.top = `${finalTop}px`;
      windowEl.style.transform = "none";
      saveWindowLayout(windowEl);
      windowEl.removeEventListener("pointermove", move);
      windowEl.removeEventListener("pointerup", end);
      windowEl.removeEventListener("pointercancel", end);
    };
    windowEl.addEventListener("pointermove", move);
    windowEl.addEventListener("pointerup", end);
    windowEl.addEventListener("pointercancel", end);
  }

  function setWizardStep(step) {
    state.wizardStep = step;
    document.querySelectorAll("[data-wizard-page]").forEach((page) => {
      const visible = Number(page.dataset.wizardPage) === step;
      page.classList.toggle("is-visible", visible);
      page.setAttribute("aria-hidden", String(!visible));
    });
    document.querySelectorAll("[data-step-indicator]").forEach((indicator) => {
      const number = Number(indicator.dataset.stepIndicator);
      indicator.classList.toggle("is-current", number === step);
      indicator.classList.toggle("is-complete", number < step);
      if (number === step) indicator.setAttribute("aria-current", "step");
      else indicator.removeAttribute("aria-current");
    });
  }

  async function scanSource(source) {
    renderSelectedMedia(source);
    setSourcePickerBusy(true);
    setRememberAvailability(Boolean(source.handles?.length));
    if (state.library?.mode === "once") {
      state.library = null;
      updateLibraryUI();
    }
    state.source = source;
    const panel = document.querySelector("#scanPanel");
    const fill = document.querySelector("#scanFill");
    const percent = document.querySelector("#scanPercent");
    const title = document.querySelector("#scanTitle");
    const detail = document.querySelector("#scanDetail");
    panel.hidden = false;
    fill.style.width = "0%";
    percent.textContent = "0%";
    title.textContent = "Reading file list…";
    detail.textContent = "Nothing is uploaded. This happens locally in your browser.";
    try {
      const result = await window.ZeroHAssetLibrary.scan(source.files, {
        handles: source.handles,
        onProgress(progress) {
          const ratio = progress.total ? progress.completed / progress.total : 0;
          const value = Math.min(99, Math.round(ratio * 100));
          fill.style.width = `${value}%`;
          percent.textContent = `${value}%`;
          title.textContent = "Looking for original game archives…";
          detail.textContent = progress.detail;
        },
      });
      fill.style.width = "100%";
      percent.textContent = "100%";
      source.scan = result;
      document.querySelector("#detectedSourceName").textContent = source.name;
      document.querySelector("#detectedSummary").textContent =
        `${result.found.length} archives · ${(result.totalBytes / 1024 ** 3).toFixed(1)} GB`;
      document.querySelector("#installSizeEstimate").textContent =
        `~${(result.totalBytes / 1024 ** 3).toFixed(1)} GB`;
      if (!result.ok) {
        title.textContent = "More original media is required";
        detail.textContent = `Missing: ${missingSourceSummary(result.missing)}`;
        showToast("Incomplete game library", "Add the remaining discs, or remove media selected by mistake.", "warning");
        setWizardStep(1);
        return;
      }
      title.textContent = "Compatible Zero Hour files found";
      detail.textContent = "All required Zero Hour and Generals base-data archives passed the local media inventory.";
      if (result.errors.length) {
        showToast("Some source files were ignored", `${result.errors.length} unreadable or unsupported file${result.errors.length === 1 ? " was" : "s were"} skipped; the required library is complete.`, "warning");
      }
      setWizardStep(2);
    } catch (error) {
      title.textContent = "Could not read this source";
      detail.textContent = error?.message || String(error);
      percent.textContent = "!";
      showToast("Asset scan failed", detail.textContent, "warning");
    } finally {
      setSourcePickerBusy(false);
    }
  }

  function sourceFromFiles(files, kind, sourceHandles = []) {
    const list = [...files];
    if (!list.length) return null;
    const first = list[0];
    const folderName = first.webkitRelativePath?.split("/")[0];
    const handles = [...sourceHandles];
    const source = {
      kind,
      name: kind === "folder" ? (folderName || handles[0]?.name || "Installed game folder") : "",
      countLabel: `${list.length} file${list.length === 1 ? "" : "s"}`,
      files: list,
      handles,
      items: kind === "image" ? list.map((file, index) => ({ file, handle: handles[index] || null })) : [{
        file: null,
        handle: handles[0] || null,
        name: folderName || handles[0]?.name || "Installed game folder",
        size: list.reduce((sum, file) => sum + file.size, 0),
        fileCount: list.length,
      }],
    };
    updateSourceIdentity(source);
    return source;
  }

  function formatSourceBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MB`;
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  function updateSourceIdentity(source) {
    if (source.kind === "image") {
      source.files = source.items.map((item) => item.file);
      source.handles = source.items.map((item) => item.handle).filter(Boolean);
      source.name = source.items.length === 1 ? source.items[0].file.name : `${source.items.length} selected media files`;
      source.countLabel = `${source.items.length} file${source.items.length === 1 ? "" : "s"}`;
    }
    return source;
  }

  function mergeImageSource(source) {
    if (state.source?.kind !== "image") return source;
    const merged = [...state.source.items];
    const keys = new Set(merged.map(({ file }) => `${file.name}\0${file.size}\0${file.lastModified}`));
    for (const item of source.items) {
      const key = `${item.file.name}\0${item.file.size}\0${item.file.lastModified}`;
      if (!keys.has(key)) {
        merged.push(item);
        keys.add(key);
      }
    }
    state.source.items = merged;
    return updateSourceIdentity(state.source);
  }

  function renderSelectedMedia(source = state.source) {
    const panel = document.querySelector("#selectedMediaPanel");
    const list = document.querySelector("#selectedMediaList");
    const items = source?.items || [];
    panel.hidden = items.length === 0;
    document.querySelector("#selectedMediaCount").textContent = items.length
      ? `${items.length} item${items.length === 1 ? "" : "s"}` : "";
    document.querySelector("#addMoreImagesButton").hidden = source?.kind !== "image";
    list.replaceChildren(...items.map((item, index) => {
      const file = item.file;
      const row = document.createElement("li");
      const name = file?.name || item.name || "Original game files";
      const detail = file ? "Disc image or archive" : `${item.fileCount || source.files.length} files in folder`;
      row.innerHTML = `<span class="selected-media-icon" aria-hidden="true">${file ? "◉" : "▰"}</span>`
        + `<span class="selected-media-name"><strong></strong><span></span></span>`
        + `<span class="selected-media-size">${formatSourceBytes(file?.size ?? item.size)}</span>`
        + `<button type="button" class="selected-media-remove" data-remove-media="${index}">×</button>`;
      row.querySelector("strong").textContent = name;
      row.querySelector(".selected-media-name span").textContent = detail;
      row.querySelector("button").setAttribute("aria-label", `Remove ${name}`);
      return row;
    }));
    document.querySelector("#detectedMediaList").replaceChildren(...items.map((item, index) => {
      const chip = document.createElement("span");
      const name = item.file?.name || item.name || "Original game files";
      chip.className = "detected-media-item";
      chip.innerHTML = `<span></span><button type="button" class="selected-media-remove" data-remove-media="${index}">×</button>`;
      chip.querySelector("span").textContent = name;
      chip.querySelector("button").setAttribute("aria-label", `Remove ${name}`);
      return chip;
    }));
  }

  function missingSourceSummary(names) {
    const labels = names.map((name) => name === "LooseScripts.big" ? "Zero Hour Data/Scripts" : name);
    return labels.length <= 6 ? labels.join(", ")
      : `${labels.slice(0, 6).join(", ")} and ${labels.length - 6} more`;
  }

  async function prepareLibrary() {
    const button = document.querySelector("#prepareLibraryButton");
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = state.storageMode === "install" ? "Installing original assets…" : "Preparing…";
    try {
      const result = await window.ZeroHAssetLibrary.prepare(state.storageMode, (progress) => {
        const ratio = progress.total ? progress.completed / progress.total : 0;
        button.textContent = `${progress.detail} · ${Math.round(ratio * 100)}%`;
      });
      const totalBytes = result.archives.reduce((sum, archive) => sum + archive.bytes, 0);
      state.storageMode = result.effectiveMode || state.storageMode;
      syncStorageModeUI();
      state.library = {
        source: state.source?.name || "Original game media",
        mode: state.storageMode,
        preparedAt: Date.now(),
        totalBytes,
      };
      const metadataStored = persistLibrary();
      updateLibraryUI();
      setWizardStep(3);
      await refreshStorageUI();
      showToast("Library ready", state.storageMode === "install"
        ? "Original assets are installed in private browser storage."
        : "Zero Hour is ready to launch from your local files.");
      if (result.warning) showToast(result.warning.title || "Storage warning", result.warning.message || String(result.warning), "warning");
      if (!metadataStored) showToast("Launcher preference not saved", "The library is ready now, but this browser could not retain its launcher shortcut state.", "warning");
    } catch (error) {
      showToast("Library preparation failed", error?.message || String(error), "warning");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function updateLibraryUI() {
    const mode = state.library?.mode || "once";
    const labelsByMode = {
      once: { ready: "Temporary session", state: "Available for this session", location: "Local source" },
      remember: { ready: "Source remembered", state: "Source permission remembered", location: "Linked source" },
      install: { ready: "Installed in browser", state: "Installed in this browser", location: "Browser storage" },
    };
    const labels = labelsByMode[mode];
    document.querySelector("#readyStorageLabel").textContent = labels.ready;
    document.querySelector("#readyMessage").textContent = state.library
      ? `Zero Hour is ${mode === "install" ? "installed and ready without the original media" : "available from your selected source"}.`
      : "Add the original Generals and Zero Hour media to begin.";
    document.querySelectorAll(".library-state-label").forEach((label) => {
      label.textContent = state.library ? labels.state : "Original files required";
    });
    document.querySelectorAll(".library-size span").forEach((el) => { el.textContent = state.library ? labels.location : "Local source"; });
    const installed = mode === "install";
    const hasShortcuts = Boolean(state.library && (mode === "remember" || installed));
    document.querySelectorAll("[data-game-shortcut]").forEach((shortcut) => { shortcut.hidden = !hasShortcuts; });
    document.querySelectorAll("[data-launch-game]").forEach((button) => {
      const label = state.library ? "Launch game" : "Original files required";
      button.disabled = false;
      if (button.classList.contains("launch-button")) {
        button.replaceChildren(Object.assign(document.createElement("span"), {
          textContent: state.library ? "▶" : "⌁",
        }), ` ${label}`);
      } else if (button.classList.contains("row-launch")) {
        button.textContent = label;
      }
    });
    document.querySelector("#storageUsedValue").textContent = installed ? ((state.library?.totalBytes || 0) / 1024 ** 3).toFixed(1) : "0";
    document.querySelector("#storageCopyText").textContent = installed ? "Game assets are available for one-click launches from browser storage." : "No game assets are stored in this browser yet.";
    document.querySelector(".storage-donut").style.background = installed ? "conic-gradient(#548cab 0 270deg, #d3a448 270deg 276deg, #d6e0e5 276deg)" : "conic-gradient(#548cab 0 4deg, #d6e0e5 4deg)";
  }

  async function launchGame() {
    closeStartMenu();
    if (!state.library) {
      openApp("setup");
      setWizardStep(1);
      showToast("Original files required", "Add your original Generals and Zero Hour media before launching.", "warning");
      return;
    }
    if (state.launching) return;
    state.launching = true;
    document.querySelectorAll("[data-launch-game]").forEach((button) => { button.disabled = true; });
    launchOverlay.hidden = false;
    document.querySelector("#launchLoader").hidden = false;
    document.querySelector("#viewport").hidden = true;
    document.querySelector("#exitRuntimeButton").hidden = true;
    document.querySelector("#launchGameTitle").textContent = "ZERO HOUR";
    const fill = document.querySelector("#launchProgressFill");
    const status = document.querySelector("#launchStatus");
    const mount = document.querySelector("#stageMount");
    const engine = document.querySelector("#stageEngine");
    fill.style.width = "6%";
    status.textContent = "Preparing browser filesystem…";
    mount.textContent = "○ Mount";
    engine.textContent = "○ Engine";
    mount.classList.remove("is-done");
    engine.classList.remove("is-done");
    try {
      if (state.library.mode === "remember" && !window.ZeroHAssetLibrary.preparedArchives) {
        status.textContent = "Restoring permission to your original files…";
        const scan = await window.ZeroHAssetLibrary.restoreRemembered({ requestPermission: true });
        if (!scan?.ok) throw new Error("The remembered source no longer contains the complete game library");
        await window.ZeroHAssetLibrary.prepare("remember");
      }
      await window.ZeroHAssetLibrary.archivesForLaunch((progress) => {
        status.textContent = `Staging ${progress.detail}…`;
        fill.style.width = `${Math.min(34, Math.round((progress.completed / progress.total) * 34))}%`;
      });
      mount.textContent = "◌ Mount";
      await window.ZeroHRuntime.launch();
    } catch (error) {
      launchOverlay.hidden = true;
      showToast("Launch failed", error?.message || String(error), "warning");
    } finally {
      state.launching = false;
      updateLibraryUI();
    }
  }

  async function exitRuntime() {
    await window.ZeroHRuntime?.exit();
    showToast("Returned to ZeroH", "The real engine is paused and your saves were flushed.");
  }

  function updateClock() {
    const now = new Date();
    document.querySelector("#clockTime").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    document.querySelector("#clockDate").textContent = now.toLocaleDateString([], { month: "short", day: "2-digit" }).toUpperCase();
  }

  function loadSettings() {
    let settings = {};
    try { settings = JSON.parse(storageGet("zeroh-settings")) || {}; } catch { /* use defaults */ }
    desktop.dataset.wallpaper = settings.wallpaper || "command";
    document.querySelectorAll("[data-set-wallpaper]").forEach((button) => button.classList.toggle("is-selected", button.dataset.setWallpaper === desktop.dataset.wallpaper));
    document.querySelector("#scaleSelect").value = settings.scale || "1";
    document.documentElement.style.setProperty("--ui-scale", settings.scale || "1");
    document.querySelector("#soundToggle").checked = Boolean(settings.sound);
    document.querySelector("#motionToggle").checked = Boolean(settings.reduceMotion);
    document.body.classList.toggle("reduce-motion", Boolean(settings.reduceMotion));
  }

  function saveSettings() {
    const settings = {
      wallpaper: desktop.dataset.wallpaper,
      scale: document.querySelector("#scaleSelect").value,
      sound: document.querySelector("#soundToggle").checked,
      reduceMotion: document.querySelector("#motionToggle").checked,
    };
    storageSet("zeroh-settings", JSON.stringify(settings));
    document.body.classList.toggle("reduce-motion", settings.reduceMotion);
    document.documentElement.style.setProperty("--ui-scale", settings.scale);
  }

  document.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => openApp(button.dataset.open)));
  document.querySelectorAll("[data-open-setup]").forEach((button) => button.addEventListener("click", () => openApp("setup")));
  document.querySelectorAll("[data-launch-game]").forEach((button) => button.addEventListener("click", launchGame));

  startButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const shouldOpen = startMenu.hidden;
    startMenu.hidden = !shouldOpen;
    startButton.classList.toggle("is-active", shouldOpen);
    startButton.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) playInterfaceSound("menu");
  });
  startMenu.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", closeStartMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeStartMenu();
    }
  });

  document.querySelector("#pickImageButton").addEventListener("click", async () => {
    if (sourceChangeNeedsReload()) return;
    try {
      const files = await window.ZeroHAssetLibrary.pickImages();
      if (!files) return document.querySelector("#imageInput").click();
      const source = sourceFromFiles(files, "image", window.ZeroHAssetLibrary.sourceHandles);
      if (source) {
        await scanSource(mergeImageSource(source));
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast("Could not open media", error?.message || String(error), "warning");
    }
  });
  document.querySelector("#pickFolderButton").addEventListener("click", async () => {
    if (sourceChangeNeedsReload()) return;
    try {
      const files = await window.ZeroHAssetLibrary.pickFolder();
      if (!files) return document.querySelector("#folderInput").click();
      const source = sourceFromFiles(files, "folder", window.ZeroHAssetLibrary.sourceHandles);
      if (source) {
        await scanSource(source);
      }
    } catch (error) {
      if (error?.name !== "AbortError") showToast("Could not open folder", error?.message || String(error), "warning");
    }
  });
  document.querySelector("#imageInput").addEventListener("change", (event) => {
    const source = sourceFromFiles(event.target.files, "image");
    event.target.value = "";
    if (source) void scanSource(mergeImageSource(source));
  });
  document.querySelector("#folderInput").addEventListener("change", (event) => {
    const source = sourceFromFiles(event.target.files, "folder");
    event.target.value = "";
    if (source) void scanSource(source);
  });
  document.querySelector("#addMoreImagesButton").addEventListener("click", () => {
    document.querySelector("#pickImageButton").click();
  });
  async function removeSelectedMedia(event) {
    const button = event.target.closest("[data-remove-media]");
    if (!button || sourceChangeNeedsReload()) return;
    const index = Number(button.dataset.removeMedia);
    if (!state.source?.items?.[index]) return;
    state.source.items.splice(index, 1);
    if (state.source.kind === "image" && state.source.items.length) {
      updateSourceIdentity(state.source);
      await scanSource(state.source);
      return;
    }
    await window.ZeroHAssetLibrary.clearSource();
    state.source = null;
    renderSelectedMedia(null);
    document.querySelector("#scanPanel").hidden = true;
    setRememberAvailability(false);
  }
  document.querySelector("#selectedMediaList").addEventListener("click", removeSelectedMedia);
  document.querySelector("#detectedMediaList").addEventListener("click", removeSelectedMedia);
  document.querySelectorAll("[data-wizard-back]").forEach((button) => button.addEventListener("click", () => setWizardStep(Math.max(1, state.wizardStep - 1))));
  document.querySelectorAll('input[name="storageMode"]').forEach((input) => input.addEventListener("change", () => {
    state.storageMode = input.value;
    syncStorageModeUI();
  }));
  document.querySelector("#prepareLibraryButton").addEventListener("click", prepareLibrary);
  document.querySelector("#changeSourceButton").addEventListener("click", () => {
    if (sourceChangeNeedsReload()) return;
    document.querySelector("#scanPanel").hidden = true;
    setWizardStep(1);
  });

  document.querySelector("#forgetLibraryButton").addEventListener("click", async () => {
    await window.ZeroHAssetLibrary.forget();
    state.library = null;
    storageRemove("zeroh-library");
    storageRemove("fielddesk-library");
    updateLibraryUI();
    await refreshStorageUI();
    setWizardStep(1);
    openApp("setup");
    showToast("Library forgotten", window.ZeroHRuntime?.started
      ? "Stored assets were cleared. Reload ZeroH before selecting replacement files."
      : "Source permissions and installed browser copies were cleared.");
  });
  document.querySelector("#endSessionButton").addEventListener("click", () => {
    closeStartMenu();
    document.querySelectorAll(".window.is-open").forEach((windowEl) => {
      if (windowEl.dataset.app !== "setup") closeWindow(windowEl);
    });
    openApp("setup");
    setWizardStep(state.library ? 3 : 1);
    showToast("Session refreshed", "ZeroH is ready for the next launch.");
  });

  document.querySelectorAll("[data-set-wallpaper]").forEach((button) => button.addEventListener("click", () => {
    desktop.dataset.wallpaper = button.dataset.setWallpaper;
    document.querySelectorAll("[data-set-wallpaper]").forEach((item) => item.classList.toggle("is-selected", item === button));
    saveSettings();
  }));
  document.querySelectorAll(".library-row .more-button").forEach((button) => button.addEventListener("click", () => {
    showToast("Zero Hour library", "Use the Game Launcher to change the source or browser-storage mode.");
  }));
  document.querySelector(".tray-status").addEventListener("click", () => openApp("programs"));
  document.querySelector(".tray-network").addEventListener("click", () => {
    openApp("settings");
    document.querySelector('[data-settings-tab="multiplayer"]')?.click();
  });
  document.querySelectorAll("[data-open-logo-lab]").forEach((button) => button.addEventListener("click", openLogoLab));
  window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin && event.data?.type === "zeroh-logo-selected") applyLauncherLogo(event.data.id);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === "zeroh-selected-logo") applyLauncherLogo(event.newValue);
    if (["zeroh-library", "fielddesk-library", "zeroh-installed-library.v3", "zeroh-installed-library.v2"].includes(event.key)) {
      state.library = readStoredLibrary();
      void reconcileStoredLibrary();
    }
  });
  window.addEventListener("resize", () => {
    document.querySelectorAll(".window.is-open").forEach(constrainWindow);
  });
  ["#scaleSelect", "#soundToggle", "#motionToggle"].forEach((selector) => document.querySelector(selector).addEventListener("change", () => {
    saveSettings();
    if (selector === "#soundToggle" && document.querySelector(selector).checked) playInterfaceSound("enabled");
  }));
  document.querySelector("#resetConceptButton").addEventListener("click", async () => {
    await window.ZeroHAssetLibrary.forget();
    storageRemove("zeroh-library");
    storageRemove("zeroh-settings");
    storageRemove("fielddesk-library");
    storageRemove("fielddesk-settings");
    storageRemove("zeroh-window-layout");
    storageSet("zeroh-selected-logo", DEFAULT_LAUNCHER_LOGO);
    storageRemove("zeroh-logo-shortlist");
    state.windowLayout = {};
    document.querySelectorAll(".window").forEach((windowEl) => {
      windowEl.classList.remove("is-maximized");
      windowEl.style.removeProperty("left");
      windowEl.style.removeProperty("top");
      windowEl.style.removeProperty("transform");
    });
    state.library = null;
    setWizardStep(1);
    loadSettings();
    updateLibraryUI();
    applyLauncherLogo();
    window.dispatchEvent(new CustomEvent("zeroh:reset-apps"));
    showToast("ZeroH reset", window.ZeroHRuntime?.started
      ? "Browser data was cleared. Reload ZeroH before selecting replacement files."
      : "Library permissions, browser assets and desktop settings were cleared.");
  });

  document.querySelector("#exitRuntimeButton").addEventListener("click", exitRuntime);

  bindWindows();
  restoreWindowLayout();
  document.querySelectorAll(".window.is-open").forEach(constrainWindow);
  renderTaskbar();
  loadSettings();
  applyLauncherLogo();
  updateLibraryUI();
  syncStorageModeUI();
  void refreshStorageUI();
  setRememberAvailability(typeof window.showOpenFilePicker === "function"
    || typeof window.showDirectoryPicker === "function");
  updateClock();
  window.setInterval(updateClock, 30_000);

  async function reconcileStoredLibrary() {
    const installed = await window.ZeroHAssetLibrary.verifyInstalledLibrary();
    const mode = state.library?.mode;
    const invalidStoredState = state.library && !["remember", "install"].includes(mode);
    const missingInstalledData = mode === "install" && !installed;
    const missingRememberedSource = mode === "remember"
      && !await window.ZeroHAssetLibrary.hasRememberedSource();
    if (invalidStoredState || missingInstalledData || missingRememberedSource) {
      state.library = null;
      storageRemove("zeroh-library");
      storageRemove("fielddesk-library");
    }
    if (installed && state.library?.mode !== "install") {
      state.library = {
        source: "Installed browser library",
        mode: "install",
        preparedAt: installed.preparedAt,
        totalBytes: installed.totalBytes,
      };
      persistLibrary();
    }
    if (state.library) {
      state.source = { name: state.library.source, countLabel: "Zero Hour" };
      state.storageMode = state.library.mode;
      syncStorageModeUI();
      setWizardStep(3);
    } else {
      setWizardStep(1);
    }
    updateLibraryUI();
  }

  void reconcileStoredLibrary();

  window.ZeroHDesktop = { openApp, showToast };
})();
