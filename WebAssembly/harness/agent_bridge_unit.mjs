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
