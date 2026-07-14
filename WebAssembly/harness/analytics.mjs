// Replaced only in the generated Pages artifact by tools/build_pages_site.mjs.
// Keeping the production stream ID out of source also makes local/fork builds
// inert unless their builder deliberately supplies GA_MEASUREMENT_ID.
const DEFAULT_MEASUREMENT_ID = "__GA_MEASUREMENT_ID__";
const CONSENT_STORAGE_KEY = "newShoesAnalyticsConsent.v1";
const GOOGLE_TAG_ORIGIN = "https://www.googletagmanager.com";

const enumParam = (...values) => Object.freeze({ type: "enum", values: new Set(values) });
const booleanParam = Object.freeze({ type: "boolean" });

// Keep this deliberately boring. Every accepted value is a bounded enum or a
// boolean, so callers cannot accidentally send a filename, path, free text,
// device identifier, or precise measurement to Google Analytics.
export const EVENT_SCHEMAS = Object.freeze({
  app_view: Object.freeze({
    screen: enumParam("desktop", "launcher", "library", "settings", "files", "about"),
  }),
  launcher_navigation: Object.freeze({
    destination: enumParam("launcher", "library", "settings", "files", "about", "start_menu"),
  }),
  import_source_selected: Object.freeze({
    source_type: enumParam("folder", "iso"),
    part_count: enumParam("one", "two", "three_four", "five_plus"),
  }),
  media_parts_changed: Object.freeze({
    action: enumParam("add", "remove", "clear"),
    part_count: enumParam("zero", "one", "two", "three_four", "five_plus"),
  }),
  media_validation: Object.freeze({
    result: enumParam("ready", "incomplete", "failed"),
    reason: enumParam("complete", "missing_base", "missing_zero_hour", "missing_english", "unsupported", "unreadable", "unknown"),
    source_type: enumParam("folder", "iso"),
  }),
  storage_mode_selected: Object.freeze({
    mode: enumParam("once", "remember", "install"),
  }),
  storage_capacity: Object.freeze({
    available: enumParam("under_1gb", "1_2gb", "2_4gb", "4_8gb", "8_16gb", "16gb_plus", "unknown"),
    usage: enumParam("under_1gb", "1_2gb", "2_4gb", "4_8gb", "8_16gb", "16gb_plus", "unknown"),
  }),
  install_started: Object.freeze({
    mode: enumParam("once", "remember", "install"),
    source_type: enumParam("folder", "iso"),
  }),
  install_progress: Object.freeze({
    milestone: enumParam("start", "quarter", "half", "three_quarters", "complete"),
    mode: enumParam("once", "remember", "install"),
  }),
  install_completed: Object.freeze({
    mode: enumParam("once", "remember", "install"),
    duration: enumParam("under_30s", "30s_2m", "2m_5m", "5m_15m", "15m_plus", "unknown"),
  }),
  install_failed: Object.freeze({
    mode: enumParam("once", "remember", "install"),
    reason: enumParam("quota", "permission", "source_lost", "unsupported", "cancelled", "unknown"),
    duration: enumParam("under_30s", "30s_2m", "2m_5m", "5m_15m", "15m_plus", "unknown"),
  }),
  game_launch: Object.freeze({
    state: enumParam("started", "ready", "failed"),
    stage: enumParam("launcher", "archives", "engine", "display", "unknown"),
    duration: enumParam("under_10s", "10_30s", "30s_1m", "1_3m", "3m_plus", "unknown"),
  }),
  boot_milestone: Object.freeze({
    milestone: enumParam("audio", "archives_mounted", "engine_initialized", "first_frame"),
  }),
  game_exit: Object.freeze({
    kind: enumParam("game_to_desktop", "desktop_shutdown"),
    result: enumParam("success", "blocked_game", "blocked_storage", "close_requested", "redirected", "failed"),
  }),
  settings_section_view: Object.freeze({
    section: enumParam("appearance", "game", "multiplayer", "hardware", "privacy"),
  }),
  setting_changed: Object.freeze({
    category: enumParam("appearance", "audio", "display", "shader", "performance", "diagnostics", "privacy"),
    setting: enumParam("wallpaper", "ui_scale", "interface_sound", "reduce_motion", "resolution_mode", "fullscreen", "shader_tier", "cursor_style", "performance_overlay", "performance_window", "diagnostics_level", "analytics"),
    value: enumParam("enabled", "disabled", "dynamic", "fixed", "classic", "enhanced", "original", "system", "short", "medium", "long", "lite", "full", "granted", "denied"),
  }),
  audio_activation: Object.freeze({
    trigger: enumParam("pointer", "keyboard", "click", "play_start", "settings", "unknown"),
    result: enumParam("running", "suspended", "failed", "unavailable"),
    recovery: booleanParam,
  }),
  external_link: Object.freeze({
    category: enumParam("github", "steam", "ea", "docs", "privacy"),
  }),
  runtime_capabilities: Object.freeze({
    isolated: booleanParam,
    shared_memory: booleanParam,
    offscreen_canvas: booleanParam,
    webgl2: booleanParam,
  }),
});

const FORBIDDEN_KEY = /(?:^|_)(?:file|filename|filepath|path|url|href|query|search|hash|text|dump|asset|asset_name|hardware_id|device_id|user_id|measurement_id|bytes|quota_bytes|disk_bytes)(?:_|$)/i;
const EVENT_NAME = /^[a-z][a-z0-9_]{0,39}$/;

export function sanitizeEvent(name, params = {}) {
  const schema = EVENT_SCHEMAS[name];
  if (!schema || !EVENT_NAME.test(name) || !params || typeof params !== "object" || Array.isArray(params)) return null;
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  if (entries.length > 25) return null;
  const clean = {};
  for (const [key, value] of entries) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || FORBIDDEN_KEY.test(key)) return null;
    const rule = schema[key];
    if (!rule) return null;
    if (rule.type === "boolean") {
      if (typeof value !== "boolean") return null;
      clean[key] = value;
    } else if (rule.type === "enum") {
      if (typeof value !== "string" || value.length > 100 || !rule.values.has(value)) return null;
      clean[key] = value;
    } else {
      return null;
    }
  }
  return clean;
}

export function bucketCount(value) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (count === 0) return "zero";
  if (count === 1) return "one";
  if (count === 2) return "two";
  if (count <= 4) return "three_four";
  return "five_plus";
}

export function bucketBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const gb = bytes / (1024 ** 3);
  if (gb < 1) return "under_1gb";
  if (gb < 2) return "1_2gb";
  if (gb < 4) return "2_4gb";
  if (gb < 8) return "4_8gb";
  if (gb < 16) return "8_16gb";
  return "16gb_plus";
}

export function bucketDuration(value, profile = "install") {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  if (profile === "launch") {
    if (ms < 10_000) return "under_10s";
    if (ms < 30_000) return "10_30s";
    if (ms < 60_000) return "30s_1m";
    if (ms < 180_000) return "1_3m";
    return "3m_plus";
  }
  if (ms < 30_000) return "under_30s";
  if (ms < 120_000) return "30s_2m";
  if (ms < 300_000) return "2m_5m";
  if (ms < 900_000) return "5m_15m";
  return "15m_plus";
}

export function canonicalScopeRoot(locationLike, documentLike) {
  const locationUrl = new URL(locationLike.href);
  let rootPath = locationUrl.pathname;
  const baseHref = documentLike?.querySelector?.("base[href]")?.href;
  if (baseHref) {
    const basePath = new URL(baseHref, locationUrl).pathname;
    if (basePath.endsWith("/harness/")) rootPath = basePath.slice(0, -"harness/".length);
  }
  rootPath = rootPath.replace(/\/harness\/play\.html$/, "/");
  if (!rootPath.endsWith("/")) rootPath = `${rootPath}/`;
  return `${locationUrl.origin}${rootPath}`;
}

function privacySignalEnabled(navigatorLike) {
  const dnt = String(navigatorLike?.doNotTrack ?? navigatorLike?.msDoNotTrack ?? "").toLowerCase();
  return navigatorLike?.globalPrivacyControl === true || dnt === "1" || dnt === "yes";
}

function productionHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "newshoes.gg"
    || host === "www.newshoes.gg"
    || host === "newshoes.pages.dev"
    || host.endsWith(".github.io");
}

function setGaDisabled(windowLike, measurementId, disabled) {
  if (!/^G-[A-Z0-9]+$/.test(String(measurementId || ""))) return;
  try { windowLike[`ga-disable-${measurementId}`] = disabled === true; } catch { /* inert host */ }
}

function readConsent(storage) {
  try {
    const value = storage?.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : "unset";
  } catch {
    return "unset";
  }
}

function writeConsent(storage, value) {
  try { storage?.setItem(CONSENT_STORAGE_KEY, value); } catch { /* optional persistence */ }
}

function consentCommand(granted) {
  return {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
}

function clearAnalyticsCookies(documentLike, locationLike, measurementId) {
  try {
    const names = new Set(["_ga", `_ga_${measurementId.replace(/^G-/, "")}`]);
    for (const pair of String(documentLike.cookie || "").split(";")) {
      const name = pair.split("=", 1)[0]?.trim();
      if (name?.startsWith("_ga")) names.add(name);
    }
    const host = String(locationLike?.hostname || "");
    const domains = ["", host, host ? `.${host}` : ""];
    for (const name of names) {
      for (const domain of domains) {
        const domainPart = domain ? `; Domain=${domain}` : "";
        documentLike.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax${domainPart}`;
      }
    }
  } catch {
    // Cookie access can be blocked independently of localStorage.
  }
}

export function createGtagTransport({ windowLike, documentLike, measurementId = DEFAULT_MEASUREMENT_ID }) {
  let initialized = false;
  let scriptPromise = null;
  // Google consumes the Arguments objects produced by its canonical gtag
  // wrapper. Plain arrays look equivalent but initialize without emitting
  // collection requests.
  function command() {
    windowLike.dataLayer = windowLike.dataLayer || [];
    windowLike.dataLayer.push(arguments);
  }
  return {
    async initialize() {
      if (initialized) return scriptPromise;
      initialized = true;
      command("consent", "default", consentCommand(false));
      command("set", "ads_data_redaction", true);
      command("js", new Date());
      command("consent", "update", consentCommand(true));
      command("config", measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      windowLike.gtag = windowLike.gtag || command;
      scriptPromise = new Promise((resolve) => {
        const existing = documentLike.querySelector(`script[data-new-shoes-ga4="${measurementId}"]`);
        if (existing) { resolve(); return; }
        const script = documentLike.createElement("script");
        script.async = true;
        script.dataset.newShoesGa4 = measurementId;
        script.src = `${GOOGLE_TAG_ORIGIN}/gtag/js?id=${encodeURIComponent(measurementId)}`;
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener("error", resolve, { once: true });
        (documentLike.head || documentLike.documentElement).append(script);
      });
      return scriptPromise;
    },
    updateConsent(granted) {
      if (initialized) command("consent", "update", consentCommand(granted));
    },
    clearState() {
      clearAnalyticsCookies(documentLike, windowLike.location, measurementId);
    },
    send(name, params) {
      if (initialized) command("event", name, params);
    },
    get initialized() { return initialized; },
  };
}

export function createAnalytics(options = {}) {
  const windowLike = options.windowLike ?? globalThis.window;
  const documentLike = options.documentLike ?? windowLike?.document;
  const navigatorLike = options.navigatorLike ?? windowLike?.navigator;
  const locationLike = options.locationLike ?? windowLike?.location;
  const storage = options.storage ?? windowLike?.localStorage;
  const measurementId = options.measurementId ?? DEFAULT_MEASUREMENT_ID;
  const blockedByPrivacySignal = privacySignalEnabled(navigatorLike);
  const validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId);
  const enabledEnvironment = validMeasurementId
    && (options.forceEnabled === true || productionHost(locationLike?.hostname));
  const transport = options.transport ?? createGtagTransport({ windowLike, documentLike, measurementId });
  const now = options.now ?? (() => Date.now());
  const storedConsent = readConsent(storage);
  // Product policy is opt-out: a first production visit starts enabled. An
  // explicit stored denial is consulted synchronously before the transport is
  // initialized, so returning visitors who opted out make no Google request.
  let consent = blockedByPrivacySignal ? "denied"
    : storedConsent === "denied" ? "denied" : "granted";
  // This synchronous kill switch is honored by gtag itself. It must be in
  // place before initialize() can append the Google tag on an opted-out or
  // browser-privacy-signal visit.
  setGaDisabled(windowLike, measurementId, consent !== "granted");
  let active = false;
  let initialized = false;
  let transportInitialized = false;
  let pageViewSent = false;
  const listeners = new Set();

  function notify() {
    const snapshot = api.status();
    for (const listener of listeners) {
      try { listener(snapshot); } catch { /* UI listeners cannot break analytics */ }
    }
  }

  function sendPageView() {
    if (!active || pageViewSent) return false;
    pageViewSent = true;
    const root = canonicalScopeRoot(locationLike, documentLike);
    try {
      transport.send("page_view", {
        page_location: root,
        page_path: new URL(root).pathname,
        page_title: "Project New Shoes",
      });
      return true;
    } catch {
      return false;
    }
  }

  async function activate() {
    if (!enabledEnvironment || blockedByPrivacySignal || consent !== "granted") return false;
    if (active) return true;
    active = true;
    try {
      if (!transportInitialized) {
        transportInitialized = true;
        await Promise.resolve(transport.initialize());
      }
      if (!active || consent !== "granted") return false;
      transport.updateConsent?.(true);
      sendPageView();
      return true;
    } catch {
      // Ad blockers, CSP, offline mode and tag failures must not affect boot.
      active = false;
      return false;
    }
  }

  const api = {
    measurementId,
    init() {
      if (initialized) return api;
      initialized = true;
      if (blockedByPrivacySignal) writeConsent(storage, "denied");
      if (consent === "granted") void activate();
      notify();
      return api;
    },
    async setConsent(next) {
      const requested = next === "granted" ? "granted" : "denied";
      consent = blockedByPrivacySignal ? "denied" : requested;
      setGaDisabled(windowLike, measurementId, consent !== "granted");
      writeConsent(storage, consent);
      if (consent === "granted") await activate();
      else {
        active = false;
        try { transport.updateConsent?.(false); } catch { /* isolated */ }
        try { transport.clearState?.(); } catch { /* isolated */ }
      }
      notify();
      return api.status();
    },
    track(name, params = {}) {
      if (!active || consent !== "granted") return false;
      const clean = sanitizeEvent(name, params);
      if (!clean) return false;
      try {
        transport.send(name, clean);
        return true;
      } catch {
        return false;
      }
    },
    status() {
      return Object.freeze({
        consent,
        active,
        initialized,
        available: enabledEnvironment && !blockedByPrivacySignal,
        privacySignal: blockedByPrivacySignal,
      });
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bucketCount,
    bucketBytes,
    bucketDuration,
    now,
  };
  return api;
}

function externalLinkCategory(anchor) {
  let url;
  try { url = new URL(anchor.href); } catch { return null; }
  if (url.hostname === "github.com") return "github";
  if (url.hostname === "store.steampowered.com") return "steam";
  if (url.hostname === "www.ea.com" || url.hostname === "ea.com") return "ea";
  if (url.hostname === "policies.google.com" && url.pathname.startsWith("/privacy")) return "privacy";
  if (anchor.dataset.analyticsLink === "docs") return "docs";
  return null;
}

export function bindAnalyticsUi(analytics, documentLike = document) {
  if (!analytics || documentLike.documentElement.dataset.analyticsBound === "true") return;
  documentLike.documentElement.dataset.analyticsBound = "true";
  const toggle = documentLike.querySelector("#analyticsConsentToggle");
  const statusText = documentLike.querySelector("#analyticsConsentStatus");

  const render = (status) => {
    if (toggle) {
      toggle.checked = status.consent === "granted" && status.available;
      toggle.disabled = !status.available;
    }
    if (statusText) {
      statusText.textContent = status.privacySignal
        ? "Analytics is off because Global Privacy Control or Do Not Track is enabled."
        : !status.available
          ? "Analytics is disabled in local development and automated tests."
          : status.consent === "granted"
            ? "Anonymous usage analytics is on. You can turn it off at any time."
            : "Anonymous usage analytics is off.";
    }
  };
  analytics.subscribe(render);
  render(analytics.status());
  toggle?.addEventListener("change", () => {
    const value = toggle.checked ? "granted" : "denied";
    void analytics.setConsent(value).then(() => {
      analytics.track("setting_changed", { category: "privacy", setting: "analytics", value });
    });
  });
  documentLike.addEventListener("click", (event) => {
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    const category = externalLinkCategory(anchor);
    if (category) analytics.track("external_link", { category });
  }, { capture: true });
}

export function installAnalytics(windowLike = window) {
  if (windowLike.ZeroHAnalytics) return windowLike.ZeroHAnalytics;
  const testOptions = windowLike.__NEW_SHOES_ANALYTICS_TEST__ || {};
  const analytics = createAnalytics({ windowLike, ...testOptions });
  windowLike.ZeroHAnalytics = analytics;
  analytics.init();
  bindAnalyticsUi(analytics, windowLike.document);
  analytics.track("runtime_capabilities", {
    isolated: windowLike.crossOriginIsolated === true,
    shared_memory: typeof windowLike.SharedArrayBuffer === "function",
    offscreen_canvas: typeof windowLike.OffscreenCanvas === "function",
    webgl2: (() => {
      try { return Boolean(windowLike.document.createElement("canvas").getContext("webgl2")); }
      catch { return false; }
    })(),
  });
  analytics.track("app_view", { screen: "desktop" });
  return analytics;
}

if (typeof window !== "undefined" && typeof document !== "undefined") installAnalytics(window);
