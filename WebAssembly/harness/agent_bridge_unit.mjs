import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_PROTOCOL,
  AGENT_SUBPROTOCOL,
  createAgentBridgeConnection,
  probeAgentBridgeConnection,
} from "./agent_bridge.mjs";

class FakeWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static instances = [];

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  emit(name, detail = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener(detail);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  receive(value) {
    this.emit("message", { data: JSON.stringify(value) });
  }

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  close(code, reason) {
    this.readyState = 3;
    this.emit("close", { code, reason, wasClean: code === 1000 });
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("probes bridge authentication without creating a runtime controller", async () => {
  FakeWebSocket.instances.length = 0;
  const pending = probeAgentBridgeConnection({
    config: {
      url: "ws://127.0.0.1:18888/engine?private=1",
      token: "engine-token",
      sessionId: "probe-alpha",
      playMode: "camera",
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  assert.deepEqual(socket.sent, [{
    type: "probe",
    protocol: AGENT_PROTOCOL,
    token: "engine-token",
    sessionId: "probe-alpha",
    playMode: "camera",
  }]);
  socket.receive({
    type: "probe",
    ok: true,
    protocol: AGENT_PROTOCOL,
    sessionId: "probe-alpha",
    playMode: "camera",
  });
  assert.deepEqual(await pending, {
    ok: true,
    protocol: AGENT_PROTOCOL,
    endpoint: "ws://127.0.0.1:18888/engine",
    sessionId: "probe-alpha",
    playMode: "camera",
  });
  assert.equal(socket.readyState, 3);
});

test("reports a rejected bridge probe", async () => {
  FakeWebSocket.instances.length = 0;
  const pending = probeAgentBridgeConnection({
    config: {
      url: "ws://127.0.0.1:18888/engine",
      token: "wrong-token",
      sessionId: "probe-rejected",
      playMode: "global",
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.close(1008, "invalid engine hello");
  await assert.rejects(pending, /rejected the browser token or play mode/);
});

test("authenticates and maps raw UI requests to engine-thread RPC", async () => {
  FakeWebSocket.instances.length = 0;
  const calls = [];
  const controller = createAgentBridgeConnection({
    config: {
      url: "ws://127.0.0.1:18888/engine?ignored-in-status=1",
      token: "engine-token",
      sessionId: "match-alpha",
    },
    rpc: async (command, payload) => {
      calls.push({ command, payload });
      return { ok: true, result: { ok: true, windows: [{ id: 7 }] } };
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  assert.equal(socket.url, "ws://127.0.0.1:18888/engine?ignored-in-status=1");
  assert.deepEqual(socket.protocols, [AGENT_SUBPROTOCOL]);

  socket.open();
  assert.deepEqual(socket.sent[0], {
    type: "hello",
    protocol: AGENT_PROTOCOL,
    token: "engine-token",
    sessionId: "match-alpha",
    playMode: "global",
    capabilities: [
      "protocol.describe",
      "input.pointerMove",
      "camera.lookAt",
      "camera.setView",
      "game.select",
      "game.order",
      "game.context",
      "game.command",
      "game.playerCommand",
      "game.production",
      "game.container",
      "game.beacon",
      "world.snapshot",
      "terrain.query",
      "minimap.snapshot",
      "hud.snapshot",
      "chat.send",
      "ui.snapshot",
      "ui.activate",
      "ui.setText",
      "ui.submit",
      "ui.selectIndex",
      "ui.setValue",
      "ui.selectTab",
      "ui.listItems",
    ],
  });
  socket.receive({
    type: "hello",
    ok: true,
    protocol: AGENT_PROTOCOL,
    sessionId: "match-alpha",
    playMode: "global",
  });
  socket.receive({
    type: "request",
    id: "request-1",
    op: "ui.snapshot",
    args: { includeHidden: false },
  });
  await flush();

  assert.deepEqual(calls, [{ command: "agentUiSnapshot", payload: { includeHidden: false } }]);
  assert.deepEqual(socket.sent[1], {
    type: "response",
    id: "request-1",
    ok: true,
    result: { ok: true, windows: [{ id: 7 }] },
  });
  assert.equal(controller.snapshot().connected, true);
  assert.equal(controller.snapshot().endpoint, "ws://127.0.0.1:18888/engine");

  socket.receive({
    type: "request",
    id: "request-2",
    op: "input.pointerMove",
    args: { x: 32, y: 96 },
  });
  await flush();
  assert.deepEqual(calls[1], {
    command: "postMessage",
    payload: {
      message: 0x0200,
      wParam: 0,
      lParam: (96 << 16) | 32,
      point: { x: 32, y: 96 },
    },
  });
  assert.deepEqual(socket.sent[2], {
    type: "response",
    id: "request-2",
    ok: true,
    result: { ok: true, x: 32, y: 96 },
  });
  controller.stop();
});

test("maps HUD and advanced UI controls to engine-thread RPC", async () => {
  FakeWebSocket.instances.length = 0;
  const calls = [];
  const controller = createAgentBridgeConnection({
    config: { url: "ws://localhost/engine", token: "token", sessionId: "controls" },
    rpc: async (command, payload) => {
      calls.push({ command, payload });
      return { ok: true, result: { ok: true } };
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({
    type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "controls", playMode: "global",
  });
  socket.receive({
    type: "request",
    id: "value-1",
    op: "ui.setValue",
    args: { windowId: 17, name: "Options.wnd:VolumeSlider", value: 73 },
  });
  socket.receive({
    type: "request",
    id: "tab-1",
    op: "ui.selectTab",
    args: { windowId: 19, name: "Options.wnd:Tabs", index: 2 },
  });
  socket.receive({
    type: "request",
    id: "submit-1",
    op: "ui.submit",
    args: { windowId: 23, name: "LanLobbyMenu.wnd:TextEntryChat" },
  });
  socket.receive({ type: "request", id: "hud-1", op: "hud.snapshot", args: {} });
  socket.receive({
    type: "request",
    id: "chat-1",
    op: "chat.send",
    args: { text: "  Attack now  ", audience: "allies" },
  });
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();

  assert.deepEqual(calls, [
    {
      command: "agentUiSetValue",
      payload: { windowId: 17, name: "Options.wnd:VolumeSlider", value: 73 },
    },
    {
      command: "agentUiSelectTab",
      payload: { windowId: 19, name: "Options.wnd:Tabs", index: 2 },
    },
    {
      command: "agentUiSubmit",
      payload: { windowId: 23, name: "LanLobbyMenu.wnd:TextEntryChat" },
    },
    { command: "agentHudSnapshot", payload: {} },
    { command: "agentChatSend", payload: { text: "Attack now", audience: "allies" } },
  ]);
  controller.stop();
});

test("maps bounded world and terrain observations to engine RPC", async () => {
  FakeWebSocket.instances.length = 0;
  const calls = [];
  const controller = createAgentBridgeConnection({
    config: {
      url: "ws://localhost/engine", token: "token", sessionId: "world", playMode: "camera",
    },
    rpc: async (command, payload) => {
      calls.push({ command, payload });
      return { ok: true, result: { ok: true, command } };
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({
    type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "world", playMode: "camera",
  });
  socket.receive({
    type: "request",
    id: "world-1",
    op: "world.snapshot",
    args: { mode: "camera", detail: "tactical", includeCapabilities: true },
  });
  socket.receive({
    type: "request",
    id: "terrain-1",
    op: "terrain.query",
    args: {
      mode: "unrestricted",
      minX: 0,
      minY: 10,
      maxX: 1000,
      maxY: 900,
      columns: 64,
      rows: 32,
    },
  });
  socket.receive({
    type: "request", id: "minimap-1", op: "minimap.snapshot", args: { columns: 48, rows: 24 },
  });
  await flush();
  await flush();
  await flush();

  assert.deepEqual(calls, [
    {
      command: "agentWorldSnapshot",
      payload: { mode: "camera", detail: "tactical", includeCapabilities: true },
    },
    {
      command: "agentTerrainQuery",
      payload: {
        mode: "camera",
        minX: 0,
        minY: 10,
        maxX: 1000,
        maxY: 900,
        columns: 64,
        rows: 32,
      },
    },
    { command: "agentMinimapSnapshot", payload: { columns: 48, rows: 24 } },
  ]);
  assert.equal(socket.sent[1].id, "world-1");
  assert.equal(socket.sent[1].ok, true);
  assert.equal(socket.sent[2].id, "terrain-1");
  assert.equal(socket.sent[2].ok, true);
  assert.equal(socket.sent[3].id, "minimap-1");
  assert.equal(socket.sent[3].ok, true);
  controller.stop();
});

test("maps semantic gameplay actions to bounded engine RPC", async () => {
  FakeWebSocket.instances.length = 0;
  const calls = [];
  const controller = createAgentBridgeConnection({
    config: {
      url: "ws://localhost/engine", token: "token", sessionId: "actions", playMode: "camera",
    },
    rpc: async (command, payload) => {
      calls.push({ command, payload });
      return { ok: true, result: { ok: true, accepted: true } };
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({
    type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "actions", playMode: "camera",
  });
  socket.receive({
    type: "request", id: "select", op: "game.select", args: { objectIds: [3, 7] },
  });
  socket.receive({
    type: "request", id: "order", op: "game.order",
    args: { action: "attackMove", objectIds: [3, 7], position: { x: 500, y: 750 } },
  });
  socket.receive({
    type: "request", id: "context", op: "game.context",
    args: { objectIds: [3, 7], targetId: 11 },
  });
  socket.receive({
    type: "request", id: "command", op: "game.command",
    args: {
      sourceId: 9,
      command: "Command_ConstructChinaPowerPlant",
      position: { x: 120, y: 240 },
      angle: 1.25,
    },
  });
  socket.receive({
    type: "request", id: "player-command", op: "game.playerCommand",
    args: {
      commandSet: "AmericaScienceCommandSetRank1",
      command: "Command_PurchaseSciencePaladinTank",
    },
  });
  socket.receive({
    type: "request", id: "production", op: "game.production",
    args: { sourceId: 9, action: "cancel", productionId: 41 },
  });
  socket.receive({
    type: "request", id: "container", op: "game.container",
    args: { containerId: 17, action: "exit", passengerId: 18 },
  });
  socket.receive({
    type: "request", id: "beacon", op: "game.beacon",
    args: { action: "place", position: { x: 610, y: 820 } },
  });
  socket.receive({
    type: "request", id: "camera", op: "camera.lookAt", args: { x: 400, y: 300 },
  });
  socket.receive({
    type: "request", id: "camera-view", op: "camera.setView", args: { angle: 0.5, zoom: 0.8 },
  });
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();
  await flush();

  assert.deepEqual(calls, [
    { command: "agentGameSelect", payload: { objectIds: "3,7", cameraBound: true } },
    {
      command: "agentGameOrder",
      payload: {
        action: "attackMove", objectIds: "3,7", targetId: 0, x: 500, y: 750,
        guardMode: 0, cameraBound: true,
      },
    },
    {
      command: "agentGameContext",
      payload: {
        objectIds: "3,7", targetId: 11, x: 0, y: 0, hasPosition: false, cameraBound: true,
      },
    },
    {
      command: "agentGameCommand",
      payload: {
        sourceId: 9,
        command: "Command_ConstructChinaPowerPlant",
        targetId: 0,
        x: 120,
        y: 240,
        angle: 1.25,
        hasPosition: true,
        cameraBound: true,
      },
    },
    {
      command: "agentGamePlayerCommand",
      payload: {
        commandSet: "AmericaScienceCommandSetRank1",
        command: "Command_PurchaseSciencePaladinTank",
        targetId: 0,
        x: 0,
        y: 0,
        angle: 0,
        hasPosition: false,
        cameraBound: true,
      },
    },
    {
      command: "agentGameProduction",
      payload: {
        sourceId: 9, action: "cancel", productionId: 41, upgrade: "", cameraBound: true,
      },
    },
    {
      command: "agentGameContainer",
      payload: { containerId: 17, action: "exit", passengerId: 18, cameraBound: true },
    },
    {
      command: "agentGameBeacon",
      payload: {
        action: "place", beaconId: 0, x: 610, y: 820, text: "", cameraBound: true,
      },
    },
    { command: "agentCameraLookAt", payload: { x: 400, y: 300 } },
    {
      command: "agentCameraSetView",
      payload: {
        angle: 0.5, pitch: 0, zoom: 0.8, setAngle: true, setPitch: false, setZoom: true,
      },
    },
  ]);
  assert.equal(socket.sent.at(-1).ok, true);
  controller.stop();
});

test("rejects invalid gameplay object IDs without touching the engine", async () => {
  FakeWebSocket.instances.length = 0;
  let calls = 0;
  const controller = createAgentBridgeConnection({
    config: { url: "ws://localhost/engine", token: "token", sessionId: "bad-actions" },
    rpc: async () => { calls += 1; },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({
    type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "bad-actions", playMode: "global",
  });
  socket.receive({
    type: "request", id: "duplicates", op: "game.order",
    args: { action: "move", objectIds: [2, 2], position: { x: 1, y: 2 } },
  });
  await flush();
  assert.equal(calls, 0);
  assert.equal(socket.sent[1].error.code, "invalid_arguments");
  controller.stop();
});

test("fixes observation mode at launch and rejects oversized terrain grids", async () => {
  FakeWebSocket.instances.length = 0;
  const calls = [];
  const controller = createAgentBridgeConnection({
    config: { url: "ws://localhost/engine", token: "token", sessionId: "bounds" },
    rpc: async (command, payload) => {
      calls.push({ command, payload });
      return { ok: true, result: { ok: true } };
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({
    type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "bounds", playMode: "global",
  });
  socket.receive({
    type: "request",
    id: "bad-mode",
    op: "world.snapshot",
    args: { mode: "omniscient" },
  });
  socket.receive({
    type: "request",
    id: "bad-grid",
    op: "terrain.query",
    args: { minX: 0, minY: 0, maxX: 10, maxY: 10, columns: 129, rows: 1 },
  });
  socket.receive({
    type: "request",
    id: "bad-detail",
    op: "world.snapshot",
    args: { detail: "verbose", includeCapabilities: "yes" },
  });
  await flush();
  await flush();
  await flush();

  assert.deepEqual(calls, [{
    command: "agentWorldSnapshot",
    payload: { mode: "unrestricted", detail: "full", includeCapabilities: false },
  }]);
  assert.equal(socket.sent[1].ok, true);
  assert.equal(socket.sent[2].error.code, "invalid_arguments");
  assert.equal(socket.sent[3].error.code, "invalid_arguments");
  controller.stop();
});

test("rejects unsupported operations without touching the engine", async () => {
  FakeWebSocket.instances.length = 0;
  let calls = 0;
  const controller = createAgentBridgeConnection({
    config: { url: "ws://localhost/engine", token: "token", sessionId: "session" },
    rpc: async () => { calls += 1; },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({
    type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "session", playMode: "global",
  });
  socket.receive({ type: "request", id: "bad-op", op: "game.winNow", args: {} });
  await flush();

  assert.equal(calls, 0);
  assert.deepEqual(socket.sent[1], {
    type: "response",
    id: "bad-op",
    ok: false,
    error: { code: "unsupported_operation", message: "unsupported operation: game.winNow" },
  });
  controller.stop();
});

test("does not execute operations before the authenticated hello", async () => {
  FakeWebSocket.instances.length = 0;
  let calls = 0;
  const controller = createAgentBridgeConnection({
    config: { url: "ws://localhost/engine", token: "token", sessionId: "session" },
    rpc: async () => { calls += 1; },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({ type: "request", id: "too-early", op: "ui.snapshot", args: {} });
  await flush();

  assert.equal(calls, 0);
  assert.equal(socket.readyState, 3);
  assert.equal(controller.snapshot().connected, false);
  controller.stop();
});

test("requires explicit opt-in URL and token", () => {
  assert.throws(() => createAgentBridgeConnection({
    config: null,
    rpc: async () => {},
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  }), /configuration must be an object/);
  assert.throws(() => createAgentBridgeConnection({
    config: { url: "https://example.com/engine", token: "token" },
    rpc: async () => {},
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  }), /ws: or wss:/);
});
