#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  bindAnalyticsUi,
  bucketBytes,
  bucketCount,
  bucketDuration,
  canonicalScopeRoot,
  createAnalytics,
  createGtagTransport,
  sanitizeEvent,
} from "./analytics.mjs";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

function mockTransport({ fail = false } = {}) {
  return {
    initializeCalls: 0,
    consent: [],
    events: [],
    clearCalls: 0,
    async initialize() { this.initializeCalls += 1; if (fail) throw new Error("blocked"); },
    updateConsent(value) { this.consent.push(value); },
    send(name, params) { if (fail) throw new Error("offline"); this.events.push({ name, params }); },
    clearState() { this.clearCalls += 1; },
  };
}

function analyticsFixture({ stored, navigatorLike = {}, transport = mockTransport(), forceEnabled = true } = {}) {
  const storage = memoryStorage(stored ? { "newShoesAnalyticsConsent.v1": stored } : {});
  const locationLike = new URL("https://newshoes.gg/harness/play.html?private=value#fragment");
  const documentLike = { querySelector: () => null };
  const windowLike = { location: locationLike };
  const analytics = createAnalytics({
    windowLike, documentLike, navigatorLike, locationLike, storage,
    measurementId: "G-TEST000000", forceEnabled, transport,
  });
  return { analytics, storage, transport, windowLike };
}

// Opt-out policy: a fresh production visitor initializes once and receives a
// single canonical-root page view. No query, fragment or harness path escapes.
{
  const { analytics, transport } = analyticsFixture();
  analytics.init();
  await tick();
  assert.equal(analytics.status().consent, "granted");
  assert.equal(transport.initializeCalls, 1);
  assert.deepEqual(transport.events[0], {
    name: "page_view",
    params: { page_location: "https://newshoes.gg/", page_path: "/", page_title: "Project New Shoes" },
  });
  analytics.init();
  await tick();
  assert.equal(transport.initializeCalls, 1, "repeated init must not load gtag twice");
}

// A stored opt-out and browser privacy signals are consulted before transport
// initialization, which means zero Google-facing work on return visits.
for (const fixture of [
  analyticsFixture({ stored: "denied" }),
  analyticsFixture({ navigatorLike: { globalPrivacyControl: true } }),
  analyticsFixture({ navigatorLike: { doNotTrack: "1" } }),
]) {
  fixture.analytics.init();
  await tick();
  assert.equal(fixture.transport.initializeCalls, 0);
  assert.equal(fixture.transport.events.length, 0);
  assert.equal(fixture.analytics.status().active, false);
  assert.equal(fixture.windowLike["ga-disable-G-TEST000000"], true);
}

// Revoke persists, clears GA state, stops events, and re-enable reuses the
// existing script/transport without another page view or duplicate load.
{
  const { analytics, storage, transport, windowLike } = analyticsFixture();
  analytics.init();
  await tick();
  assert.equal(analytics.track("app_view", { screen: "launcher" }), true);
  await analytics.setConsent("denied");
  assert.equal(storage.values.get("newShoesAnalyticsConsent.v1"), "denied");
  assert.equal(transport.clearCalls, 1);
  assert.equal(windowLike["ga-disable-G-TEST000000"], true);
  assert.equal(analytics.track("app_view", { screen: "settings" }), false);
  const countAfterRevoke = transport.events.length;
  await analytics.setConsent("granted");
  assert.equal(windowLike["ga-disable-G-TEST000000"], false);
  assert.equal(transport.initializeCalls, 1);
  assert.equal(transport.events.length, countAfterRevoke);
  assert.equal(analytics.track("app_view", { screen: "settings" }), true);
}

// Missing and malformed build configuration is a complete no-op even on the
// production hostname. Forks/local artifacts remain functional without it.
for (const measurementId of ["", "__GA_MEASUREMENT_ID__", "UA-OLD", "secret"] ) {
  const transport = mockTransport();
  const windowLike = { location: new URL("https://newshoes.gg/") };
  const analytics = createAnalytics({
    windowLike,
    documentLike: { querySelector: () => null }, navigatorLike: {},
    locationLike: new URL("https://newshoes.gg/"), storage: memoryStorage(),
    measurementId, transport,
  });
  analytics.init();
  await tick();
  assert.equal(transport.initializeCalls, 0);
  assert.equal(Object.keys(windowLike).some((key) => key.startsWith("ga-disable-")), false);
}

// Schema and buckets reject high-cardinality or sensitive input instead of
// truncating it into something that might still identify local media.
assert.deepEqual(sanitizeEvent("media_validation", { result: "ready", reason: "complete", source_type: "iso" }),
  { result: "ready", reason: "complete", source_type: "iso" });
assert.equal(sanitizeEvent("media_validation", { result: "ready", filename: "disc-1.iso" }), null);
assert.equal(sanitizeEvent("media_validation", { result: "ready", reason: "/Users/alice/game.iso", source_type: "iso" }), null);
assert.equal(sanitizeEvent("unknown_event", {}), null);
assert.equal(sanitizeEvent("setting_changed", { category: "audio", setting: "interface_sound", value: "73.125" }), null);
assert.equal(bucketCount(4), "three_four");
assert.equal(bucketBytes(3 * 1024 ** 3), "2_4gb");
assert.equal(bucketDuration(45_000), "30s_2m");
assert.equal(bucketDuration(45_000, "launch"), "30s_1m");

// Representative real call sites all pass the same closed schema.
{
  const { analytics, transport } = analyticsFixture();
  analytics.init();
  await tick();
  const cases = [
    ["import_source_selected", { source_type: "iso", part_count: "three_four" }],
    ["media_validation", { result: "ready", reason: "complete", source_type: "iso" }],
    ["install_started", { mode: "install", source_type: "iso" }],
    ["install_progress", { milestone: "half", mode: "install" }],
    ["install_completed", { mode: "install", duration: "2m_5m" }],
    ["game_launch", { state: "ready", stage: "display", duration: "30s_1m" }],
    ["audio_activation", { trigger: "play_start", result: "running", recovery: false }],
    ["setting_changed", { category: "shader", setting: "shader_tier", value: "enhanced" }],
    ["game_exit", { kind: "game_to_desktop", result: "success" }],
  ];
  for (const [name, params] of cases) assert.equal(analytics.track(name, params), true, name);
  assert.equal(transport.events.length, cases.length + 1);
  const serialized = JSON.stringify(transport.events);
  for (const forbidden of [".iso", "/Users/", "cncdump", "filename", "quota_bytes"]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden analytics content: ${forbidden}`);
  }
}

assert.equal(canonicalScopeRoot(
  new URL("https://owner.github.io/repo/?diag=full"),
  { querySelector: () => ({ href: "https://owner.github.io/repo/harness/" }) },
), "https://owner.github.io/repo/");
assert.equal(canonicalScopeRoot(
  new URL("https://owner.github.io/repo/harness/play.html?diag=full"),
  { querySelector: () => null },
), "https://owner.github.io/repo/");

// Official gtag URL/config and single-load contract, without a network.
{
  const appended = [];
  const documentLike = {
    cookie: "_ga=old; _ga_TEST000000=old",
    querySelector: () => null,
    createElement: () => ({ dataset: {}, addEventListener() {} }),
    head: { append(node) { appended.push(node); } },
  };
  const windowLike = { location: new URL("https://newshoes.gg/") };
  const transport = createGtagTransport({ windowLike, documentLike, measurementId: "G-TEST000000" });
  void transport.initialize();
  void transport.initialize();
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, "https://www.googletagmanager.com/gtag/js?id=G-TEST000000");
  assert.equal(windowLike.dataLayer.filter((entry) => entry[0] === "config").length, 1);
  const config = windowLike.dataLayer.find((entry) => entry[0] === "config")[2];
  assert.deepEqual(config, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const defaultConsent = windowLike.dataLayer.find((entry) => entry[0] === "consent" && entry[1] === "default")[2];
  assert.deepEqual(defaultConsent, { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
}

// Analytics failures remain isolated from launcher execution.
{
  const { analytics } = analyticsFixture({ transport: mockTransport({ fail: true }) });
  assert.doesNotThrow(() => analytics.init());
  await tick();
  assert.equal(analytics.track("app_view", { screen: "desktop" }), false);
}

// Binding is idempotent across relaunch-style initialization.
{
  const toggle = {
    checked: false, disabled: false, handlers: [],
    addEventListener(type, fn) { if (type === "change") this.handlers.push(fn); },
  };
  const status = { textContent: "" };
  const documentLike = {
    documentElement: { dataset: {} },
    querySelector(selector) { return selector === "#analyticsConsentToggle" ? toggle
      : selector === "#analyticsConsentStatus" ? status : null; },
    handlers: [],
    addEventListener(type, fn) { this.handlers.push([type, fn]); },
  };
  const { analytics } = analyticsFixture({ stored: "denied" });
  analytics.init();
  bindAnalyticsUi(analytics, documentLike);
  bindAnalyticsUi(analytics, documentLike);
  assert.equal(toggle.handlers.length, 1);
  assert.equal(documentLike.handlers.filter(([type]) => type === "click").length, 1);
}

console.log("Analytics privacy, schema, routing, transport, and lifecycle tests: OK");
