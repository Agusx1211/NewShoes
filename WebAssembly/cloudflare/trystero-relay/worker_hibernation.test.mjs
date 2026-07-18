import { schnorr, utils } from "@noble/secp256k1";
import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";

const encoder = new TextEncoder();

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedEvent(topic, content) {
  const secretKey = utils.randomSecretKey();
  const event = {
    pubkey: hex(schnorr.getPublicKey(secretKey)),
    created_at: Math.floor(Date.now() / 1000),
    kind: 23456,
    tags: [["x", topic]],
    content,
  };
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify([
    0, event.pubkey, event.created_at, event.kind, event.tags, event.content,
  ])));
  event.id = hex(new Uint8Array(digest));
  event.sig = hex(await schnorr.signAsync(new Uint8Array(digest), secretKey));
  return event;
}

async function connect(stub) {
  const response = await stub.fetch("https://relay.test/nostr", {
    headers: { Upgrade: "websocket" },
  });
  const socket = response.webSocket;
  if (!socket) throw new Error("Durable Object did not return a WebSocket");
  socket.accept();
  const messages = [];
  const waiters = [];
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    const index = waiters.findIndex(({ predicate }) => predicate(message));
    if (index < 0) {
      messages.push(message);
      return;
    }
    const [{ resolve, timer }] = waiters.splice(index, 1);
    clearTimeout(timer);
    resolve(message);
  });
  return {
    socket,
    next(predicate, timeoutMs = 5000) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiters.push(waiter);
        waiter.timer = setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter);
          if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
          reject(new Error(`timed out waiting for relay message: ${JSON.stringify(messages)}`));
        }, timeoutMs);
      });
    },
  };
}

test("restores live subscriptions but not retained events after hibernation", async () => {
  const stub = env.TRYSTERO_RELAY.getByName(`hibernation-${crypto.randomUUID()}`);
  const subscriber = await connect(stub);
  const publisher = await connect(stub);
  const topic = "a".repeat(40);

  const oversizedTopics = Array.from({ length: 250 }, (_, index) =>
    index.toString(36).padStart(40, "b"));
  const maximumTrysteroBatch = {
    kinds: Array.from({ length: 250 }, (_, index) => 20_000 + index),
    since: Math.floor(Date.now() / 1000),
    "#x": oversizedTopics,
  };
  subscriber.socket.send(JSON.stringify(["REQ", "maximum-batch", maximumTrysteroBatch]));
  await subscriber.next((message) => message[0] === "EOSE" && message[1] === "maximum-batch");
  subscriber.socket.send(JSON.stringify(["CLOSE", "maximum-batch"]));

  subscriber.socket.send(JSON.stringify([
    "REQ",
    "oversized",
    ...Array.from({ length: 4 }, () => maximumTrysteroBatch),
  ]));
  expect(await subscriber.next((message) => message[0] === "CLOSED"
    && message[1] === "oversized")).toEqual([
    "CLOSED", "oversized", "restricted: subscription state is too large",
  ]);

  subscriber.socket.send(JSON.stringify([
    "REQ", "subscriber", { kinds: [23456], "#x": [topic] },
  ]));
  await subscriber.next((message) => message[0] === "EOSE" && message[1] === "subscriber");

  const beforeEviction = await signedEvent(topic, "before-eviction");
  publisher.socket.send(JSON.stringify(["EVENT", beforeEviction]));
  await Promise.all([
    subscriber.next((message) => message[0] === "EVENT" && message[2]?.id === beforeEviction.id),
    publisher.next((message) => message[0] === "OK" && message[1] === beforeEviction.id),
  ]);

  await evictDurableObject(stub, { webSockets: "hibernate" });

  const lateSubscriber = await connect(stub);
  lateSubscriber.socket.send(JSON.stringify([
    "REQ", "late", { kinds: [23456], since: beforeEviction.created_at, "#x": [topic] },
  ]));
  expect(await lateSubscriber.next(() => true)).toEqual(["EOSE", "late"]);

  const afterEviction = await signedEvent(topic, "after-eviction");
  publisher.socket.send(JSON.stringify(["EVENT", afterEviction]));
  await Promise.all([
    subscriber.next((message) => message[0] === "EVENT" && message[2]?.id === afterEviction.id),
    lateSubscriber.next((message) => message[0] === "EVENT" && message[2]?.id === afterEviction.id),
    publisher.next((message) => message[0] === "OK" && message[1] === afterEviction.id),
  ]);

  subscriber.socket.close(1000, "reconnect");
  const reconnected = await connect(stub);
  reconnected.socket.send(JSON.stringify([
    "REQ", "reconnected", { kinds: [23456], "#x": [topic] },
  ]));
  await reconnected.next((message) => message[0] === "EOSE" && message[1] === "reconnected");
  await evictDurableObject(stub, { webSockets: "hibernate" });

  const afterReconnect = await signedEvent(topic, "after-reconnect-and-eviction");
  publisher.socket.send(JSON.stringify(["EVENT", afterReconnect]));
  await reconnected.next((message) => message[0] === "EVENT"
    && message[2]?.id === afterReconnect.id);

  const storageKeys = await runInDurableObject(stub, async (_, state) =>
    [...(await state.storage.list()).keys()]);
  expect(storageKeys).toEqual([]);

  publisher.socket.close(1000, "done");
  lateSubscriber.socket.close(1000, "done");
  reconnected.socket.close(1000, "done");
});
