import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_BRIDGE_SETTINGS_KEY,
  forgetAgentBridgeToken,
  loadAgentBridgeSettings,
  normalizeAgentBridgeConfiguration,
  saveAgentBridgeSettings,
} from "./agent-bridge-config.mjs";

class MemoryStorage {
  constructor(value = null) {
    this.value = value;
  }

  getItem(key) {
    return key === AGENT_BRIDGE_SETTINGS_KEY ? this.value : null;
  }

  setItem(key, value) {
    if (key === AGENT_BRIDGE_SETTINGS_KEY) this.value = value;
  }
}

test("persists non-secret Remote Agent settings by default", () => {
  const storage = new MemoryStorage();
  const saved = saveAgentBridgeSettings(storage, {
    enabled: true,
    url: "ws://bridge.test:18888/engine",
    token: "memory-only-secret",
    sessionId: "match-one",
    playMode: "camera",
    rememberToken: false,
  });
  assert.deepEqual(saved, {
    enabled: true,
    url: "ws://bridge.test:18888/engine",
    sessionId: "match-one",
    playMode: "camera",
    rememberToken: false,
    token: "",
  });
  assert.equal(storage.value.includes("memory-only-secret"), false);
  assert.deepEqual(loadAgentBridgeSettings(storage), saved);
});

test("persists and explicitly forgets an opted-in browser token", () => {
  const storage = new MemoryStorage();
  saveAgentBridgeSettings(storage, {
    enabled: true,
    url: "wss://bridge.test/engine",
    token: "remembered-secret",
    sessionId: "game-1",
    playMode: "global",
    rememberToken: true,
  });
  assert.equal(loadAgentBridgeSettings(storage).token, "remembered-secret");
  const forgotten = forgetAgentBridgeToken(storage);
  assert.equal(forgotten.rememberToken, false);
  assert.equal(forgotten.token, "");
  assert.equal(storage.value.includes("remembered-secret"), false);
});

test("ignores corrupt stored values and normalizes runtime configuration", () => {
  const storage = new MemoryStorage("not-json");
  assert.deepEqual(loadAgentBridgeSettings(storage), {
    enabled: false,
    url: "ws://127.0.0.1:18888/engine",
    token: "",
    sessionId: "game-1",
    playMode: "global",
    rememberToken: false,
  });
  assert.deepEqual(normalizeAgentBridgeConfiguration({
    url: "ws://bridge.test/engine",
    token: "secret",
    sessionId: "",
    playMode: "camera",
  }, { randomUUID: () => "generated-session" }), {
    url: "ws://bridge.test/engine",
    token: "secret",
    sessionId: "generated-session",
    playMode: "camera",
  });
});
