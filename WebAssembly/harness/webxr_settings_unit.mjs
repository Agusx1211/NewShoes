#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  DEFAULT_WEBXR_SETTINGS,
  WEBXR_SETTINGS_KEY,
  loadWebXrSettings,
  normalizeWebXrSettings,
  saveWebXrSettings,
  webXrRendererOptions,
} from "./webxr-settings.mjs";

assert.deepEqual(normalizeWebXrSettings(), DEFAULT_WEBXR_SETTINGS);
assert.deepEqual(normalizeWebXrSettings({
  dominantHand: "left",
  stickDeadzone: 0.63,
  worldScale: 9,
  panelWidthMeters: 0,
  panelDistanceMeters: 1.74,
  heightOffsetMeters: -0.38,
}), {
  dominantHand: "left",
  stickDeadzone: 0.65,
  worldScale: 1.5,
  panelWidthMeters: 1.2,
  panelDistanceMeters: 1.7,
  heightOffsetMeters: -0.4,
});

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
const saved = saveWebXrSettings(storage, {
  dominantHand: "left",
  stickDeadzone: 0.7,
  worldScale: 1.25,
  panelWidthMeters: 1.9,
  panelDistanceMeters: 2,
  heightOffsetMeters: 0.25,
});
assert.deepEqual(loadWebXrSettings(storage), saved);
assert.equal(typeof values.get(WEBXR_SETTINGS_KEY), "string");
assert.deepEqual(webXrRendererOptions(saved), {
  worldScale: 1.25,
  panelWidthMeters: 1.9,
  panelDistanceMeters: 2,
  heightOffsetMeters: 0.25,
  controlOptions: {
    bindings: { dominantHand: "left" },
    pressThreshold: 0.7,
    releaseThreshold: 0.5,
  },
});

const blockedStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};
assert.deepEqual(loadWebXrSettings(blockedStorage), DEFAULT_WEBXR_SETTINGS);
assert.deepEqual(saveWebXrSettings(blockedStorage, { dominantHand: "left" }), {
  ...DEFAULT_WEBXR_SETTINGS,
  dominantHand: "left",
});

console.log("WebXR settings unit: PASS");
