import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_PROTOCOL,
  AGENT_SUBPROTOCOL,
  createAgentBridgeConnection,
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
    capabilities: [
      "protocol.describe",
      "input.pointerMove",
      "camera.lookAt",
      "game.select",
      "game.order",
      "game.command",
      "world.snapshot",
      "terrain.query",
      "ui.snapshot",
      "ui.activate",
      "ui.setText",
      "ui.selectIndex",
      "ui.listItems",
    ],
  });
  socket.receive({
    type: "hello",
    ok: true,
    protocol: AGENT_PROTOCOL,
    sessionId: "match-alpha",
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

test("maps bounded world and terrain observations to engine RPC", async () => {
  FakeWebSocket.instances.length = 0;
  const calls = [];
  const controller = createAgentBridgeConnection({
    config: { url: "ws://localhost/engine", token: "token", sessionId: "world" },
    rpc: async (command, payload) => {
      calls.push({ command, payload });
      return { ok: true, result: { ok: true, command } };
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({ type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "world" });
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
        mode: "unrestricted",
        minX: 0,
        minY: 10,
        maxX: 1000,
        maxY: 900,
        columns: 64,
        rows: 32,
      },
    },
  ]);
  assert.equal(socket.sent[1].id, "world-1");
  assert.equal(socket.sent[1].ok, true);
  assert.equal(socket.sent[2].id, "terrain-1");
  assert.equal(socket.sent[2].ok, true);
  controller.stop();
});

test("maps semantic gameplay actions to bounded engine RPC", async () => {
  FakeWebSocket.instances.length = 0;
  const calls = [];
  const controller = createAgentBridgeConnection({
    config: { url: "ws://localhost/engine", token: "token", sessionId: "actions" },
    rpc: async (command, payload) => {
      calls.push({ command, payload });
      return { ok: true, result: { ok: true, accepted: true } };
    },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({ type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "actions" });
  socket.receive({
    type: "request", id: "select", op: "game.select", args: { objectIds: [3, 7] },
  });
  socket.receive({
    type: "request", id: "order", op: "game.order",
    args: { action: "attackMove", objectIds: [3, 7], position: { x: 500, y: 750 } },
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
    type: "request", id: "camera", op: "camera.lookAt", args: { x: 400, y: 300 },
  });
  await flush();
  await flush();
  await flush();
  await flush();

  assert.deepEqual(calls, [
    { command: "agentGameSelect", payload: { objectIds: "3,7" } },
    {
      command: "agentGameOrder",
      payload: { action: "attackMove", objectIds: "3,7", targetId: 0, x: 500, y: 750 },
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
      },
    },
    { command: "agentCameraLookAt", payload: { x: 400, y: 300 } },
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
  socket.receive({ type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "bad-actions" });
  socket.receive({
    type: "request", id: "duplicates", op: "game.order",
    args: { action: "move", objectIds: [2, 2], position: { x: 1, y: 2 } },
  });
  await flush();
  assert.equal(calls, 0);
  assert.equal(socket.sent[1].error.code, "invalid_arguments");
  controller.stop();
});

test("rejects invalid observation modes and oversized terrain grids", async () => {
  FakeWebSocket.instances.length = 0;
  let calls = 0;
  const controller = createAgentBridgeConnection({
    config: { url: "ws://localhost/engine", token: "token", sessionId: "bounds" },
    rpc: async () => { calls += 1; },
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  });
  const socket = FakeWebSocket.instances[0];
  socket.open();
  socket.receive({ type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "bounds" });
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

  assert.equal(calls, 0);
  assert.equal(socket.sent[1].error.code, "invalid_arguments");
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
  socket.receive({ type: "hello", ok: true, protocol: AGENT_PROTOCOL, sessionId: "session" });
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
  }), /url must be/);
  assert.throws(() => createAgentBridgeConnection({
    config: { url: "https://example.com/engine", token: "token" },
    rpc: async () => {},
    WebSocketImpl: FakeWebSocket,
    cryptoImpl: { randomUUID: () => "unused" },
  }), /ws: or wss:/);
});
