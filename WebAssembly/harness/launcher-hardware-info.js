(() => {
  "use strict";

  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  const panels = [...document.querySelectorAll("[data-settings-panel]")];
  const reportRoot = document.querySelector("#hardwareReport");
  const refreshButton = document.querySelector("#refreshHardwareReport");
  const copyButton = document.querySelector("#copyHardwareReport");
  let hasScanned = false;
  let lastReport = null;

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "Not exposed";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = Math.max(0, bytes);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
  }

  function yesNo(value, yes = "Supported", no = "Unavailable") {
    return [value ? yes : no, value ? "good" : "bad"];
  }

  function browserName(userAgent) {
    const rules = [
      [/Edg\/([\d.]+)/, "Microsoft Edge"],
      [/OPR\/([\d.]+)/, "Opera"],
      [/Firefox\/([\d.]+)/, "Firefox"],
      [/Chrome\/([\d.]+)/, "Chromium"],
      [/Version\/([\d.]+).*Safari/, "Safari"],
    ];
    const match = rules.map(([pattern, name]) => ({ match: userAgent.match(pattern), name })).find((item) => item.match);
    return match ? `${match.name} ${match.match[1]}` : "Unidentified browser";
  }

  async function userAgentDetails() {
    if (!navigator.userAgentData) return null;
    const details = {
      brands: navigator.userAgentData.brands?.map((brand) => `${brand.brand} ${brand.version}`).join(", "),
      mobile: navigator.userAgentData.mobile,
      platform: navigator.userAgentData.platform,
    };
    try {
      Object.assign(details, await navigator.userAgentData.getHighEntropyValues([
        "architecture", "bitness", "model", "platformVersion", "fullVersionList", "wow64",
      ]));
    } catch {
      details.restricted = true;
    }
    return details;
  }

  function graphicsDetails() {
    const canvas = document.createElement("canvas");
    const attributes = { alpha: false, antialias: false, powerPreference: "high-performance" };
    const gl = canvas.getContext("webgl2", attributes) || canvas.getContext("webgl", attributes) || canvas.getContext("experimental-webgl", attributes);
    if (!gl) return { available: false, api: "No WebGL context", rows: [] };

    const webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "Hidden by browser";
    const vendor = debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : "Hidden by browser";
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    const extensions = gl.getSupportedExtensions() || [];
    const rows = [
      ["Graphics API", webgl2 ? "WebGL 2" : "WebGL 1", webgl2 ? "good" : "warn"],
      ["GPU renderer", renderer, "neutral"],
      ["GPU vendor", vendor, "neutral"],
      ["WebGL version", gl.getParameter(gl.VERSION), "neutral"],
      ["Shader language", gl.getParameter(gl.SHADING_LANGUAGE_VERSION), "neutral"],
      ["Maximum texture", `${gl.getParameter(gl.MAX_TEXTURE_SIZE).toLocaleString()} × ${gl.getParameter(gl.MAX_TEXTURE_SIZE).toLocaleString()}`, "neutral"],
      ["Maximum renderbuffer", `${gl.getParameter(gl.MAX_RENDERBUFFER_SIZE).toLocaleString()} px`, "neutral"],
      ["Maximum viewport", `${viewport[0].toLocaleString()} × ${viewport[1].toLocaleString()}`, "neutral"],
      ["Texture image units", String(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)), "neutral"],
      ["Combined texture units", String(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)), "neutral"],
      ["Vertex attributes", String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)), "neutral"],
      ["Reported extensions", String(extensions.length), "neutral"],
    ];
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { available: true, webgl2, api: webgl2 ? "WebGL 2" : "WebGL 1", renderer, rows };
  }

  async function storageDetails() {
    const result = { estimate: null, persisted: null };
    try { result.estimate = await navigator.storage?.estimate(); } catch { /* private mode may block this */ }
    try { result.persisted = await navigator.storage?.persisted(); } catch { /* not exposed */ }
    return result;
  }

  async function batteryDetails() {
    if (!navigator.getBattery) return null;
    try {
      const battery = await navigator.getBattery();
      return { level: battery.level, charging: battery.charging };
    } catch {
      return null;
    }
  }

  function feature(label, supported, note = "") {
    return { label, supported: Boolean(supported), note };
  }

  function row(label, value, tone = "neutral") {
    return { label, value: value ?? "Not exposed", tone };
  }

  async function collectReport() {
    const [ua, storage, battery] = await Promise.all([userAgentDetails(), storageDetails(), batteryDetails()]);
    const graphics = graphicsDetails();
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const directoryInput = "webkitdirectory" in document.createElement("input");
    const wasm = typeof WebAssembly !== "undefined";
    const threads = typeof SharedArrayBuffer !== "undefined" && typeof Atomics !== "undefined" && window.crossOriginIsolated;
    const opfs = Boolean(navigator.storage?.getDirectory);
    const directoryAccess = Boolean(window.showDirectoryPicker || directoryInput);
    const audio = Boolean(window.AudioContext || window.webkitAudioContext);
    const storageEstimate = storage.estimate || {};
    const used = storageEstimate.usage;
    const quota = storageEstimate.quota;
    const free = Number.isFinite(quota) && Number.isFinite(used) ? quota - used : NaN;
    const darkMode = matchMedia("(prefers-color-scheme: dark)").matches;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = matchMedia("(pointer: coarse)").matches;

    const features = [
      feature("WebAssembly core", wasm, "Required for the game engine"),
      feature("Streaming WASM compilation", wasm && WebAssembly.instantiateStreaming, "Faster engine startup"),
      feature("WASM threads", threads, window.crossOriginIsolated ? "Shared memory available" : "Requires cross-origin isolation"),
      feature("SharedArrayBuffer", typeof SharedArrayBuffer !== "undefined", "Required for threaded builds"),
      feature("WebGL 2", graphics.webgl2, "Preferred renderer"),
      feature("WebGPU", navigator.gpu, "Optional future renderer; normally requires HTTPS"),
      feature("File picker", window.showOpenFilePicker || window.File, "Open local disc images"),
      feature("Directory picker", directoryAccess, window.showDirectoryPicker ? "Persistent handle API exposed" : "Folder-input fallback"),
      feature("Origin-private filesystem", opfs, "Fast browser-local installation target"),
      feature("IndexedDB", window.indexedDB, "Metadata and save index"),
      feature("Cache Storage", window.caches, "Offline runtime cache"),
      feature("Service Worker", navigator.serviceWorker, "Offline launcher shell; requires HTTPS"),
      feature("Web Workers", window.Worker, "Background asset processing"),
      feature("OffscreenCanvas", window.OffscreenCanvas, "Worker-side rendering support"),
      feature("Web Audio", audio, "Game audio output"),
      feature("Gamepad API", navigator.getGamepads, "Optional controller input"),
      feature("Pointer Lock", "pointerLockElement" in document, "Relative mouse input"),
      feature("Fullscreen", document.fullscreenEnabled, "Immersive game canvas"),
      feature("Web Locks", navigator.locks, "Coordinate game-file access"),
      feature("BroadcastChannel", window.BroadcastChannel, "Coordinate multiple launcher tabs"),
      feature("Compression Streams", window.DecompressionStream, "In-browser archive streams"),
      feature("WebCodecs", window.VideoDecoder, "Efficient intro/video decoding"),
      feature("WebHID", navigator.hid, "Optional peripheral access; normally requires HTTPS"),
      feature("WebUSB", navigator.usb, "Optional peripheral access; normally requires HTTPS"),
      feature("Clipboard", navigator.clipboard, "Copy diagnostics; normally requires HTTPS"),
    ];

    let score = 0;
    score += wasm ? 25 : 0;
    score += graphics.webgl2 ? 20 : graphics.available ? 12 : 0;
    score += directoryAccess ? 15 : 0;
    score += window.indexedDB ? 10 : 0;
    score += opfs ? 10 : 0;
    score += audio ? 8 : 0;
    score += document.fullscreenEnabled ? 4 : 0;
    score += threads ? 8 : 0;
    score = Math.min(100, score);

    const grade = score >= 90 ? "Excellent" : score >= 75 ? "Game ready" : score >= 55 ? "Compatible" : "Limited";
    const groups = [
      {
        title: "Browser & session",
        subtitle: "What the current tab is allowed to reveal",
        rows: [
          row("Browser", browserName(navigator.userAgent)),
          row("Client hints", ua?.brands || "Not exposed"),
          row("User agent", navigator.userAgent),
          row("Platform", [ua?.platform || navigator.platform, ua?.platformVersion].filter(Boolean).join(" ")),
          row("Architecture", [ua?.architecture, ua?.bitness && `${ua.bitness}-bit`, ua?.wow64 ? "WOW64" : ""].filter(Boolean).join(" · ") || "Not exposed"),
          row("Device model", ua?.model || "Not exposed"),
          row("Languages", navigator.languages?.join(", ") || navigator.language),
          row("Time zone", Intl.DateTimeFormat().resolvedOptions().timeZone),
          row("Secure context", ...yesNo(window.isSecureContext, "Yes", "No — advanced APIs may be restricted")),
          row("Cross-origin isolated", ...yesNo(window.crossOriginIsolated, "Yes", "No — threaded WASM is restricted")),
          row("Cookies", ...yesNo(navigator.cookieEnabled, "Enabled", "Disabled")),
        ],
      },
      {
        title: "Device & display",
        subtitle: "Privacy-limited hardware hints exposed by the browser",
        rows: [
          row("Logical processors", navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} threads` : "Not exposed"),
          row("Device memory hint", navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "Not exposed"),
          row("Touch points", String(navigator.maxTouchPoints || 0)),
          row("Primary pointer", coarsePointer ? "Coarse / touch" : "Fine / mouse"),
          row("Screen resolution", `${screen.width} × ${screen.height} CSS px`),
          row("Available screen", `${screen.availWidth} × ${screen.availHeight} CSS px`),
          row("Current viewport", `${innerWidth} × ${innerHeight} CSS px`),
          row("Device pixel ratio", String(devicePixelRatio)),
          row("Physical render size", `${Math.round(innerWidth * devicePixelRatio)} × ${Math.round(innerHeight * devicePixelRatio)} px`),
          row("Color depth", `${screen.colorDepth}-bit`),
          row("Color scheme", darkMode ? "Dark preferred" : "Light preferred"),
          row("Reduced motion", reducedMotion ? "Requested" : "Not requested"),
        ],
      },
      { title: "Graphics adapter", subtitle: "Read from a temporary, non-rendering graphics context", rows: graphics.rows.length ? graphics.rows.map(([label, value, tone]) => row(label, value, tone)) : [row("Graphics API", "No WebGL context available", "bad")] },
      {
        title: "Storage",
        subtitle: "Origin quota—not total disk capacity",
        rows: [
          row("Origin usage", formatBytes(used)),
          row("Origin quota", formatBytes(quota)),
          row("Estimated free quota", formatBytes(free)),
          row("Persistent storage", storage.persisted === null ? "Not exposed" : storage.persisted ? "Granted" : "Not granted", storage.persisted ? "good" : "warn"),
          row("Origin-private filesystem", ...yesNo(opfs)),
          row("IndexedDB", ...yesNo(window.indexedDB)),
          row("Local storage", ...yesNo(window.localStorage)),
        ],
      },
      {
        title: "Network & power",
        subtitle: "Connection figures are estimates and may change",
        rows: [
          row("Online state", navigator.onLine ? "Online" : "Offline", navigator.onLine ? "good" : "bad"),
          row("Connection type", connection?.type || "Not exposed"),
          row("Effective type", connection?.effectiveType?.toUpperCase() || "Not exposed"),
          row("Estimated downlink", Number.isFinite(connection?.downlink) ? `${connection.downlink} Mbps` : "Not exposed"),
          row("Estimated round trip", Number.isFinite(connection?.rtt) ? `${connection.rtt} ms` : "Not exposed"),
          row("Data saver", connection?.saveData ? "Enabled" : connection ? "Disabled" : "Not exposed", connection?.saveData ? "warn" : "neutral"),
          row("Battery", battery ? `${Math.round(battery.level * 100)}% · ${battery.charging ? "charging" : "on battery"}` : "Not exposed"),
        ],
      },
      {
        title: "WebAssembly runtime",
        subtitle: "Core capabilities relevant to a native-game port",
        rows: [
          row("WebAssembly", ...yesNo(wasm)),
          row("Streaming compilation", ...yesNo(wasm && WebAssembly.instantiateStreaming)),
          row("SharedArrayBuffer", ...yesNo(typeof SharedArrayBuffer !== "undefined")),
          row("Atomics", ...yesNo(typeof Atomics !== "undefined")),
          row("Thread-ready context", ...yesNo(threads, "Ready", "Not ready — COOP/COEP required")),
          row("WASM BigInt integration", ...yesNo(wasm && typeof BigInt64Array !== "undefined")),
          row("WASM exception API", ...yesNo(wasm && WebAssembly.Exception)),
        ],
      },
    ];

    return {
      generatedAt: new Date().toISOString(),
      score,
      grade,
      graphics: { api: graphics.api, renderer: graphics.renderer || "Unavailable" },
      runtime: { wasm, threads },
      secureContext: window.isSecureContext,
      groups,
      features,
    };
  }

  function renderRows(rows) {
    const list = document.createElement("dl");
    list.className = "hardware-rows";
    rows.forEach((item) => {
      const wrapper = document.createElement("div");
      const term = document.createElement("dt");
      const value = document.createElement("dd");
      term.textContent = item.label;
      value.textContent = item.value;
      value.className = `hardware-value is-${item.tone}`;
      wrapper.append(term, value);
      list.append(wrapper);
    });
    return list;
  }

  function renderReport(report) {
    reportRoot.replaceChildren();
    report.groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "hardware-group";
      const header = document.createElement("header");
      const title = document.createElement("h2");
      const subtitle = document.createElement("p");
      title.textContent = group.title;
      subtitle.textContent = group.subtitle;
      header.append(title, subtitle);
      section.append(header, renderRows(group.rows));
      reportRoot.append(section);
    });

    const apiSection = document.createElement("section");
    apiSection.className = "hardware-group api-section";
    apiSection.innerHTML = "<header><h2>Browser API matrix</h2><p>Surface area available to the launcher in this session</p></header>";
    const apiGrid = document.createElement("div");
    apiGrid.className = "api-grid";
    report.features.forEach((item) => {
      const card = document.createElement("article");
      card.className = `api-card ${item.supported ? "is-supported" : "is-missing"}`;
      const status = item.supported ? "✓" : "×";
      card.innerHTML = `<span class="api-status">${status}</span><div><strong></strong><small></small></div>`;
      card.querySelector("strong").textContent = item.label;
      card.querySelector("small").textContent = item.note;
      apiGrid.append(card);
    });
    apiSection.append(apiGrid);
    reportRoot.append(apiSection);

    const score = document.querySelector("#hardwareScore");
    score.textContent = `${report.score}%`;
    score.className = report.score >= 75 ? "is-good" : report.score >= 55 ? "is-warn" : "is-bad";
    document.querySelector("#hardwareGrade").textContent = report.grade;
    document.querySelector("#graphicsSummary").textContent = report.graphics.api;
    document.querySelector("#graphicsDetail").textContent = report.graphics.renderer;
    document.querySelector("#runtimeSummary").textContent = report.runtime.wasm ? report.runtime.threads ? "WASM + threads" : "WebAssembly" : "Unavailable";
    document.querySelector("#runtimeDetail").textContent = report.runtime.threads ? "Shared memory ready" : "Single-thread profile";
    document.querySelector("#hardwareTimestamp").textContent = `Scanned ${new Date(report.generatedAt).toLocaleString()}`;

    const notice = document.querySelector("#hardwareNotice");
    notice.hidden = report.secureContext;
    notice.innerHTML = report.secureContext ? "" : "<strong>Plain HTTP session</strong><span>Some storage, file-handle, worker, WebGPU and threaded-WASM capabilities require HTTPS plus cross-origin isolation in production.</span>";
  }

  async function refreshReport() {
    refreshButton.disabled = true;
    refreshButton.textContent = "Scanning…";
    reportRoot.setAttribute("aria-busy", "true");
    try {
      lastReport = await collectReport();
      renderReport(lastReport);
      hasScanned = true;
      return true;
    } catch (error) {
      lastReport = null;
      const failure = document.createElement("div");
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      failure.className = "hardware-error";
      title.textContent = "Scan failed";
      detail.textContent = error?.message || String(error);
      failure.append(title, detail);
      reportRoot.replaceChildren(failure);
      return false;
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = "↻ Refresh";
      reportRoot.removeAttribute("aria-busy");
    }
  }

  async function copyReport() {
    if (!lastReport && !await refreshReport()) return;
    const text = JSON.stringify(lastReport, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      window.ZeroHDesktop?.showToast("Hardware report copied", "The local capability report is on your clipboard.");
    } catch {
      window.ZeroHDesktop?.showToast("Clipboard unavailable", "This browser requires HTTPS or clipboard permission.", "warning");
    }
  }

  function selectTab(tabName) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.settingsTab === tabName;
      tab.classList.toggle("is-selected", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach((panel) => { panel.hidden = panel.dataset.settingsPanel !== tabName; });
    if (tabName === "hardware" && !hasScanned) refreshReport();
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.settingsTab)));
  tabs.forEach((tab, index) => tab.addEventListener("keydown", (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    selectTab(tabs[nextIndex].dataset.settingsTab);
  }));
  refreshButton.addEventListener("click", refreshReport);
  copyButton.addEventListener("click", copyReport);
  selectTab(tabs.find((tab) => tab.classList.contains("is-selected"))?.dataset.settingsTab || "appearance");
})();
