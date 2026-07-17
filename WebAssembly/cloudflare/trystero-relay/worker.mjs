import { schnorr } from "@noble/secp256k1";

const SERVICE = "newshoes-trystero-nostr-relay";
const EVENT_PREFIX = "event:";
const EVENT_INDEX_KEY = "event-index";
const SUBSCRIPTION_PREFIX = "subscriptions:";
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_RETAINED_EVENTS = 512;
const MAX_EVENT_AGE_SECONDS = 120;
const MAX_FUTURE_SKEW_SECONDS = 60;
const MAX_SUBSCRIPTIONS = 64;
const MAX_FILTERS = 4;
const MAX_TOPICS_PER_FILTER = 250;
const TRYSTERO_KIND_MIN = 20000;
const TRYSTERO_KIND_MAX = 29999;
const HEX_32 = /^[0-9a-f]{64}$/;
const HEX_64 = /^[0-9a-f]{128}$/;
const TRYSTERO_TOPIC = /^[0-9a-z]{20,40}$/;
const AGENT_ROOM = /^[0-9a-f]{64}$/;
const AGENT_ROLES = new Set(["bridge", "engine"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function hexBytes(value) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; ++index) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let hostname;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  const exact = String(env.ALLOWED_ORIGIN_HOSTS ?? "")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
  const suffixes = String(env.ALLOWED_ORIGIN_SUFFIXES ?? "")
    .split(",").map((suffix) => suffix.trim().toLowerCase()).filter(Boolean);
  return exact.includes(hostname)
    || suffixes.some((suffix) => suffix.startsWith(".") && hostname.endsWith(suffix));
}

function eventTopics(event) {
  if (!Array.isArray(event?.tags)) return [];
  return event.tags
    .filter((tag) => Array.isArray(tag) && tag[0] === "x" && typeof tag[1] === "string")
    .map((tag) => tag[1]);
}

export function matchesFilter(event, filter) {
  if (!event || !filter || typeof event !== "object" || typeof filter !== "object") return false;
  if (Array.isArray(filter.ids) && !filter.ids.some((id) => event.id.startsWith(id))) return false;
  if (Array.isArray(filter.authors)
      && !filter.authors.some((author) => event.pubkey.startsWith(author))) return false;
  if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
  if (Number.isFinite(filter.since) && event.created_at < filter.since) return false;
  if (Number.isFinite(filter.until) && event.created_at > filter.until) return false;
  if (Array.isArray(filter["#x"])) {
    const topics = eventTopics(event);
    if (!filter["#x"].some((topic) => topics.includes(topic))) return false;
  }
  return true;
}

function validFilter(filter) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return false;
  if (filter.ids != null
      && (!Array.isArray(filter.ids)
        || filter.ids.some((id) => typeof id !== "string" || !/^[0-9a-f]{1,64}$/.test(id)))) {
    return false;
  }
  if (filter.authors != null
      && (!Array.isArray(filter.authors)
        || filter.authors.some((author) =>
          typeof author !== "string" || !/^[0-9a-f]{1,64}$/.test(author)))) {
    return false;
  }
  if (filter["#x"] != null
      && (!Array.isArray(filter["#x"])
        || filter["#x"].length > MAX_TOPICS_PER_FILTER
        || filter["#x"].some((topic) => typeof topic !== "string" || !TRYSTERO_TOPIC.test(topic)))) {
    return false;
  }
  if (filter.kinds != null
      && (!Array.isArray(filter.kinds)
        || filter.kinds.some((kind) => !Number.isInteger(kind)
          || kind < TRYSTERO_KIND_MIN || kind > TRYSTERO_KIND_MAX))) {
    return false;
  }
  if (filter.since != null && !Number.isInteger(filter.since)) return false;
  if (filter.until != null && !Number.isInteger(filter.until)) return false;
  return true;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validateEvent(event, nowSeconds) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "event must be an object";
  if (!HEX_32.test(event.id ?? "")) return "event id must be 32-byte lowercase hex";
  if (!HEX_32.test(event.pubkey ?? "")) return "pubkey must be 32-byte lowercase hex";
  if (!HEX_64.test(event.sig ?? "")) return "signature must be 64-byte lowercase hex";
  if (!Number.isInteger(event.created_at)
      || event.created_at < nowSeconds - MAX_EVENT_AGE_SECONDS
      || event.created_at > nowSeconds + MAX_FUTURE_SKEW_SECONDS) {
    return "event timestamp is outside the relay retention window";
  }
  if (!Number.isInteger(event.kind)
      || event.kind < TRYSTERO_KIND_MIN || event.kind > TRYSTERO_KIND_MAX) {
    return "event kind is outside the Trystero range";
  }
  if (!Array.isArray(event.tags) || eventTopics(event).length !== 1
      || !TRYSTERO_TOPIC.test(eventTopics(event)[0])) {
    return "event must contain exactly one Trystero x topic tag";
  }
  if (typeof event.content !== "string" || encoder.encode(event.content).byteLength > MAX_MESSAGE_BYTES) {
    return "event content is missing or too large";
  }
  const expectedId = await sha256Hex(JSON.stringify([
    0, event.pubkey, event.created_at, event.kind, event.tags, event.content,
  ]));
  if (expectedId !== event.id) return "event id does not match its payload";
  try {
    if (!await schnorr.verifyAsync(
      hexBytes(event.sig), hexBytes(event.id), hexBytes(event.pubkey),
    )) {
      return "event signature is invalid";
    }
  } catch {
    return "event signature is invalid";
  }
  return null;
}

function send(socket, message) {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // The close/error callback owns cleanup for disconnected sockets.
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: SERVICE,
        protocol: "nostr-nip-01-trystero-subset",
        gameplayTraffic: false,
      });
    }
    if (url.pathname === "/agent") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket upgrade", { status: 426 });
      }
      const room = url.searchParams.get("room") ?? "";
      const role = url.searchParams.get("role") ?? "";
      if (!AGENT_ROOM.test(room) || !AGENT_ROLES.has(role)) {
        return new Response("Invalid agent signaling room or role", { status: 400 });
      }
      const origin = request.headers.get("origin");
      if ((role === "engine" && !allowedOrigin(request, env)) || (role === "bridge" && origin)) {
        return new Response("Origin is not allowed", { status: 403 });
      }
      return env.AGENT_SIGNALING.getByName(room).fetch(request);
    }
    if (url.pathname !== "/nostr") return new Response("Not found", { status: 404 });
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    if (!allowedOrigin(request, env)) return new Response("Origin is not allowed", { status: 403 });
    return env.TRYSTERO_RELAY.getByName("global").fetch(request);
  },
};

export class AgentSignalingRelay {
  constructor(ctx) {
    this.ctx = ctx;
    this.sessions = new Map();
    for (const socket of ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (AGENT_ROLES.has(attachment?.role)) this.sessions.set(socket, attachment.role);
    }
  }

  fetch(request) {
    const role = new URL(request.url).searchParams.get("role");
    for (const [socket, existingRole] of this.sessions) {
      if (existingRole === role) {
        this.sessions.delete(socket);
        socket.close(4000, "Replaced by a newer peer");
      }
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ role });
    this.ctx.acceptWebSocket(server);
    this.sessions.set(server, role);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcastPresence() {
    const roles = new Set(this.sessions.values());
    for (const [socket, role] of this.sessions) {
      send(socket, { type: "peer", present: roles.has(role === "bridge" ? "engine" : "bridge") });
    }
  }

  webSocketMessage(socket, rawMessage) {
    const bytes = typeof rawMessage === "string"
      ? encoder.encode(rawMessage)
      : new Uint8Array(rawMessage);
    if (bytes.byteLength > MAX_MESSAGE_BYTES) {
      socket.close(1009, "Signal is too large");
      return;
    }
    let message;
    try {
      message = JSON.parse(typeof rawMessage === "string" ? rawMessage : decoder.decode(bytes));
    } catch {
      socket.close(1007, "Invalid signal JSON");
      return;
    }
    if (message?.type !== "signal" || typeof message.payload !== "string"
        || message.payload.length < 1 || message.payload.length > MAX_MESSAGE_BYTES) {
      socket.close(1008, "Invalid encrypted signal envelope");
      return;
    }
    const sourceRole = this.sessions.get(socket);
    if (!sourceRole) return;
    for (const [target, role] of this.sessions) {
      if (role !== sourceRole) send(target, { type: "signal", payload: message.payload });
    }
  }

  remove(socket) {
    this.sessions.delete(socket);
    this.broadcastPresence();
  }

  webSocketClose(socket) {
    this.remove(socket);
  }

  webSocketError(socket) {
    this.remove(socket);
  }
}

export class TrysteroNostrRelay {
  constructor(ctx) {
    this.ctx = ctx;
    this.sessions = new Map();
    const sockets = ctx.getWebSockets();
    for (const socket of sockets) {
      const attachment = socket.deserializeAttachment();
      if (attachment?.id) this.sessions.set(socket, { id: attachment.id, subscriptions: new Map() });
    }
    ctx.blockConcurrencyWhile(async () => {
      await Promise.all([...this.sessions.entries()].map(async ([socket, session]) => {
        const saved = await ctx.storage.get(`${SUBSCRIPTION_PREFIX}${session.id}`);
        session.subscriptions = new Map(Array.isArray(saved) ? saved : []);
        this.sessions.set(socket, session);
      }));
    });
  }

  async fetch(request) {
    if (this.ctx.getWebSockets().length >= 4096) {
      return new Response("Relay connection capacity reached", { status: 503 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID();
    server.serializeAttachment({ id });
    this.ctx.acceptWebSocket(server);
    this.sessions.set(server, { id, subscriptions: new Map() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async retainedEvents(filters) {
    const index = await this.ctx.storage.get(EVENT_INDEX_KEY) ?? [];
    if (!Array.isArray(index) || index.length === 0) return [];
    const stored = await this.ctx.storage.get(index.map(({ id }) => `${EVENT_PREFIX}${id}`));
    return index
      .map(({ id }) => stored.get(`${EVENT_PREFIX}${id}`))
      .filter((event) => event && filters.some((filter) => matchesFilter(event, filter)));
  }

  async storeEvent(event, nowSeconds) {
    let duplicate = false;
    await this.ctx.storage.transaction(async (txn) => {
      const current = await txn.get(EVENT_INDEX_KEY) ?? [];
      if (current.some(({ id }) => id === event.id)) {
        duplicate = true;
        return;
      }
      const retained = current
        .filter((entry) => entry.created_at >= nowSeconds - MAX_EVENT_AGE_SECONDS)
        .concat({ id: event.id, created_at: event.created_at });
      const pruned = retained.splice(0, Math.max(0, retained.length - MAX_RETAINED_EVENTS));
      if (pruned.length > 0) {
        await txn.delete(pruned.map(({ id }) => `${EVENT_PREFIX}${id}`));
      }
      await txn.put({
        [`${EVENT_PREFIX}${event.id}`]: event,
        [EVENT_INDEX_KEY]: retained,
      });
    });
    return duplicate;
  }

  async persistSubscriptions(session) {
    await this.ctx.storage.put(
      `${SUBSCRIPTION_PREFIX}${session.id}`,
      [...session.subscriptions.entries()],
    );
  }

  async webSocketMessage(socket, rawMessage) {
    const bytes = typeof rawMessage === "string"
      ? encoder.encode(rawMessage)
      : new Uint8Array(rawMessage);
    if (bytes.byteLength > MAX_MESSAGE_BYTES) {
      send(socket, ["NOTICE", "message is too large"]);
      return;
    }
    let message;
    try {
      message = JSON.parse(typeof rawMessage === "string" ? rawMessage : decoder.decode(bytes));
    } catch {
      send(socket, ["NOTICE", "invalid JSON"]);
      return;
    }
    const session = this.sessions.get(socket);
    if (!session || !Array.isArray(message)) return;
    const [type, first, ...rest] = message;
    if (type === "REQ") {
      if (typeof first !== "string" || first.length === 0 || first.length > 128
          || rest.length === 0 || rest.length > MAX_FILTERS || !rest.every(validFilter)) {
        send(socket, ["CLOSED", typeof first === "string" ? first : "", "invalid: unsupported filter"]);
        return;
      }
      if (!session.subscriptions.has(first) && session.subscriptions.size >= MAX_SUBSCRIPTIONS) {
        send(socket, ["CLOSED", first, "restricted: subscription limit reached"]);
        return;
      }
      session.subscriptions.set(first, rest);
      await this.persistSubscriptions(session);
      for (const event of await this.retainedEvents(rest)) send(socket, ["EVENT", first, event]);
      send(socket, ["EOSE", first]);
      return;
    }
    if (type === "CLOSE") {
      if (typeof first === "string") {
        session.subscriptions.delete(first);
        await this.persistSubscriptions(session);
      }
      return;
    }
    if (type === "EVENT") {
      const event = first;
      const error = await validateEvent(event, Math.floor(Date.now() / 1000));
      if (error) {
        console.warn("Rejected Trystero Nostr event", {
          reason: error,
          id: typeof event?.id === "string" ? event.id : null,
          kind: event?.kind ?? null,
          topicShapes: eventTopics(event).map((topic) => ({
            length: topic.length,
            lowercaseHex: /^[0-9a-f]+$/.test(topic),
          })),
        });
        send(socket, ["OK", event?.id ?? "", false, `invalid: ${error}`]);
        return;
      }
      const duplicate = await this.storeEvent(event, Math.floor(Date.now() / 1000));
      if (!duplicate) {
        for (const [target, targetSession] of this.sessions) {
          for (const [subscriptionId, filters] of targetSession.subscriptions) {
            if (filters.some((filter) => matchesFilter(event, filter))) {
              send(target, ["EVENT", subscriptionId, event]);
            }
          }
        }
      }
      send(socket, ["OK", event.id, true, duplicate ? "duplicate: already stored" : ""]);
      return;
    }
    send(socket, ["NOTICE", "unsupported Nostr message"]);
  }

  async removeSession(socket) {
    const session = this.sessions.get(socket);
    this.sessions.delete(socket);
    if (session) await this.ctx.storage.delete(`${SUBSCRIPTION_PREFIX}${session.id}`);
  }

  async webSocketClose(socket, code, reason) {
    await this.removeSession(socket);
    socket.close(code, reason);
  }

  async webSocketError(socket) {
    await this.removeSession(socket);
  }
}
