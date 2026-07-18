#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { schnorr, utils } from "@noble/secp256k1";
import WebSocket from "ws";
import { TrysteroNostrRelay } from "../cloudflare/trystero-relay/worker.mjs";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = resolve(wasmRoot, "cloudflare/trystero-relay/wrangler.jsonc");
const port = Number.parseInt(process.env.CNC_TRYSTERO_RELAY_TEST_PORT ?? "18920", 10);
const baseUrl = `http://127.0.0.1:${port}`;
const socketUrl = `ws://127.0.0.1:${port}/nostr`;
const child = spawn(process.execPath, [
  resolve(wasmRoot, "node_modules/wrangler/bin/wrangler.js"),
  "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--config", config,
], { cwd: wasmRoot, stdio: ["ignore", "pipe", "pipe"] });
let childOutput = "";
child.stdout.on("data", (chunk) => { childOutput += chunk; });
child.stderr.on("data", (chunk) => { childOutput += chunk; });

function expect(condition, message, payload = null) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(payload)}`);
}

function hexBytes(value) {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

async function waitForHealth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`wrangler exited early: ${childOutput}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch {
      // Wrangler has not bound its local port yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`timed out waiting for relay Worker: ${childOutput}`);
}

function connect(origin = "https://newshoes.gg") {
  return new Promise((resolveConnect, reject) => {
    const socket = new WebSocket(socketUrl, { headers: { Origin: origin } });
    const messages = [];
    const waiters = [];
    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      const waiterIndex = waiters.findIndex(({ predicate }) => predicate(message));
      if (waiterIndex >= 0) {
        const [{ resolve: resolveWaiter, timer }] = waiters.splice(waiterIndex, 1);
        clearTimeout(timer);
        resolveWaiter(message);
      } else {
        messages.push(message);
      }
    });
    socket.once("open", () => resolveConnect({
      socket,
      next(predicate, timeoutMs = 5000) {
        const messageIndex = messages.findIndex(predicate);
        if (messageIndex >= 0) return Promise.resolve(messages.splice(messageIndex, 1)[0]);
        return new Promise((resolveMessage, rejectMessage) => {
          const waiter = { predicate, resolve: resolveMessage, timer: null };
          waiters.push(waiter);
          waiter.timer = setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            rejectMessage(new Error(`timed out waiting for relay message; queued=${JSON.stringify(messages)}`));
          }, timeoutMs);
        });
      },
    }));
    socket.once("error", reject);
  });
}

function connectAgent(role, room, origin = null) {
  return new Promise((resolveConnect, reject) => {
    const headers = origin ? { Origin: origin } : {};
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/agent?room=${room}&role=${role}`,
      { headers },
    );
    const messages = [];
    const waiters = [];
    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      const waiterIndex = waiters.findIndex(({ predicate }) => predicate(message));
      if (waiterIndex >= 0) {
        const [{ resolve: resolveWaiter, timer }] = waiters.splice(waiterIndex, 1);
        clearTimeout(timer);
        resolveWaiter(message);
      } else messages.push(message);
    });
    socket.once("open", () => resolveConnect({
      socket,
      next(predicate, timeoutMs = 5000) {
        const messageIndex = messages.findIndex(predicate);
        if (messageIndex >= 0) return Promise.resolve(messages.splice(messageIndex, 1)[0]);
        return new Promise((resolveMessage, rejectMessage) => {
          const waiter = { predicate, resolve: resolveMessage, timer: null };
          waiters.push(waiter);
          waiter.timer = setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            rejectMessage(new Error(`timed out waiting for agent signal; queued=${JSON.stringify(messages)}`));
          }, timeoutMs);
        });
      },
    }));
    socket.once("error", reject);
  });
}

async function signedEvent(topic, content) {
  const secretKey = utils.randomSecretKey();
  const pubkey = Buffer.from(schnorr.getPublicKey(secretKey)).toString("hex");
  const event = {
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 23456,
    tags: [["x", topic]],
    content,
  };
  event.id = createHash("sha256")
    .update(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]))
    .digest("hex");
  event.sig = Buffer.from(await schnorr.signAsync(hexBytes(event.id), secretKey)).toString("hex");
  return event;
}

function memorySocket(attachment) {
  let savedAttachment = structuredClone(attachment);
  return {
    messages: [],
    deserializeAttachment() {
      return structuredClone(savedAttachment);
    },
    serializeAttachment(value) {
      savedAttachment = structuredClone(value);
    },
    savedAttachment() {
      return structuredClone(savedAttachment);
    },
    send(message) {
      this.messages.push(JSON.parse(message));
    },
    close() {},
  };
}

async function verifyMemoryOnlyRelay() {
  const topic = "c".repeat(40);
  const filter = { kinds: [23456], "#x": [topic] };
  const subscriber = memorySocket({
    id: "subscriber",
    subscriptions: [["restored-subscription", [filter]]],
  });
  const lateSubscriber = memorySocket({ id: "late-subscriber", subscriptions: [] });
  const publisher = memorySocket({ id: "publisher", subscriptions: [] });
  const sockets = [subscriber, lateSubscriber, publisher];
  const ctx = {
    getWebSockets: () => sockets,
    get storage() {
      throw new Error("Trystero relay must not access Durable Object storage");
    },
  };
  const relay = new TrysteroNostrRelay(ctx);
  const firstEvent = await signedEvent(topic, "memory-only-first-event");
  await relay.webSocketMessage(publisher, JSON.stringify(["EVENT", firstEvent]));
  expect(subscriber.messages.some((message) => message[0] === "EVENT"
    && message[1] === "restored-subscription" && message[2]?.id === firstEvent.id),
  "subscription attachment was not restored for live routing", subscriber.messages);

  lateSubscriber.messages.length = 0;
  await relay.webSocketMessage(lateSubscriber, JSON.stringify([
    "REQ", "late-subscription", { ...filter, since: firstEvent.created_at },
  ]));
  expect(lateSubscriber.messages.some((message) => message[0] === "EVENT"
    && message[2]?.id === firstEvent.id),
  "warm in-memory event was not replayed to a late subscriber", lateSubscriber.messages);
  expect(lateSubscriber.savedAttachment().subscriptions[0]?.[0] === "late-subscription",
    "subscription was not saved in the WebSocket attachment", lateSubscriber.savedAttachment());

  lateSubscriber.messages.length = 0;
  const rehydratedRelay = new TrysteroNostrRelay(ctx);
  const secondEvent = await signedEvent(topic, "memory-only-second-event");
  await rehydratedRelay.webSocketMessage(publisher, JSON.stringify(["EVENT", secondEvent]));
  expect(lateSubscriber.messages.some((message) => message[0] === "EVENT"
    && message[1] === "late-subscription" && message[2]?.id === secondEvent.id),
  "subscription attachment was not restored after relay reconstruction", lateSubscriber.messages);
}

const sockets = [];
try {
  await verifyMemoryOnlyRelay();
  const health = await waitForHealth();
  expect(health.ok === true && health.gameplayTraffic === false,
    "relay health contract is incorrect", health);

  const subscriber = await connect();
  const publisher = await connect();
  sockets.push(subscriber.socket, publisher.socket);
  const topic = "a".repeat(40);
  const subscriptionId = "live-subscription";
  subscriber.socket.send(JSON.stringify([
    "REQ", subscriptionId, { kinds: [23456], since: Math.floor(Date.now() / 1000), "#x": [topic] },
  ]));
  await subscriber.next((message) => message[0] === "EOSE" && message[1] === subscriptionId);

  const event = await signedEvent(topic, "encrypted-trystero-sdp");
  publisher.socket.send(JSON.stringify(["EVENT", event]));
  const [delivered, accepted] = await Promise.all([
    subscriber.next((message) => message[0] === "EVENT" && message[2]?.id === event.id),
    publisher.next((message) => message[0] === "OK" && message[1] === event.id),
  ]);
  expect(delivered[2].content === event.content && accepted[2] === true,
    "valid signed event was not routed", { delivered, accepted });

  const lateSubscriber = await connect();
  sockets.push(lateSubscriber.socket);
  lateSubscriber.socket.send(JSON.stringify([
    "REQ", "late-subscription", { kinds: [23456], since: event.created_at, "#x": [topic] },
  ]));
  const retained = await lateSubscriber.next((message) =>
    message[0] === "EVENT" && message[1] === "late-subscription");
  await lateSubscriber.next((message) => message[0] === "EOSE" && message[1] === "late-subscription");
  expect(retained[2]?.id === event.id, "late subscriber did not receive retained discovery", retained);

  const tampered = { ...event, content: "tampered" };
  publisher.socket.send(JSON.stringify(["EVENT", tampered]));
  const rejected = await publisher.next((message) => message[0] === "OK" && message[2] === false);
  expect(rejected[3]?.startsWith("invalid:"), "tampered event was not rejected", rejected);

  const agentRoom = "b".repeat(64);
  const bridge = await connectAgent("bridge", agentRoom);
  const engine = await connectAgent("engine", agentRoom, "https://newshoes.gg");
  sockets.push(bridge.socket, engine.socket);
  await Promise.all([
    bridge.next((message) => message.type === "peer" && message.present === true),
    engine.next((message) => message.type === "peer" && message.present === true),
  ]);
  const opaquePayload = "encrypted-sdp-not-readable-by-relay";
  bridge.socket.send(JSON.stringify({ type: "signal", payload: opaquePayload }));
  const routedSignal = await engine.next((message) => message.type === "signal");
  expect(routedSignal.payload === opaquePayload, "opaque agent signaling was not routed", routedSignal);

  const denied = await new Promise((resolveDenied) => {
    const socket = new WebSocket(socketUrl, { headers: { Origin: "https://attacker.example" } });
    socket.once("unexpected-response", (_, response) => resolveDenied(response.statusCode));
    socket.once("open", () => resolveDenied(101));
    socket.once("error", () => {});
  });
  expect(denied === 403, "unapproved browser origin reached the relay", denied);

  console.log(JSON.stringify({
    ok: true,
    path: "cloudflare-trystero-relay",
    health,
    validEventAccepted: true,
    retainedLateJoin: true,
    invalidEventRejected: true,
    originGate: true,
    opaqueAgentSignaling: true,
    durableObjectStorageWrites: false,
  }));
} finally {
  for (const socket of sockets) socket.close();
  child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    if (child.exitCode != null) resolveExit();
    else child.once("exit", resolveExit);
    setTimeout(resolveExit, 5000);
  });
}
