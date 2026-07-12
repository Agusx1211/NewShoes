import { createServer } from "node:http";
import { WebSocketServer } from "ws";

function matchesFilter(event, filter) {
  if (!event || !filter || typeof event !== "object" || typeof filter !== "object") return false;
  if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
  if (Number.isFinite(filter.since) && event.created_at < filter.since) return false;
  const topics = filter["#x"];
  if (Array.isArray(topics)) {
    const eventTopics = Array.isArray(event.tags)
      ? event.tags.filter((tag) => tag?.[0] === "x").map((tag) => tag[1])
      : [];
    if (!topics.some((topic) => eventTopics.includes(topic))) return false;
  }
  return true;
}

export async function startNostrTestRelayServer({
  host = "127.0.0.1",
  port = 0,
  path = "/nostr",
  maxRetainedEvents = 512,
} = {}) {
  const server = createServer((_, response) => {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Nostr test relay\n");
  });
  const websocketServer = new WebSocketServer({ server, path, maxPayload: 1024 * 1024 });
  const clients = new Set();
  const retainedEvents = [];
  const stats = {
    source: "local Nostr protocol test relay",
    connections: 0,
    subscriptions: 0,
    publishedEvents: 0,
    deliveredEvents: 0,
    textBytesReceived: 0,
    binaryMessagesRejected: 0,
    activeConnections: 0,
  };

  const send = (socket, message) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(message));
  };

  const deliverSubscription = (client, subscriptionId, filter, event) => {
    if (matchesFilter(event, filter)) {
      send(client.socket, ["EVENT", subscriptionId, event]);
      stats.deliveredEvents += 1;
    }
  };

  const deliver = (client, event) => {
    for (const [subscriptionId, filter] of client.subscriptions) {
      deliverSubscription(client, subscriptionId, filter, event);
    }
  };

  websocketServer.on("connection", (socket) => {
    const client = { socket, subscriptions: new Map() };
    clients.add(client);
    stats.connections += 1;
    stats.activeConnections = clients.size;

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        stats.binaryMessagesRejected += 1;
        send(socket, ["NOTICE", "binary messages are not accepted"]);
        return;
      }
      const text = data.toString("utf8");
      stats.textBytesReceived += Buffer.byteLength(text);
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        send(socket, ["NOTICE", "invalid JSON"]);
        return;
      }
      const [type, first, second] = Array.isArray(message) ? message : [];
      if (type === "REQ" && typeof first === "string" && second && typeof second === "object") {
        client.subscriptions.set(first, second);
        stats.subscriptions += 1;
        for (const event of retainedEvents) deliverSubscription(client, first, second, event);
        send(socket, ["EOSE", first]);
      } else if (type === "CLOSE" && typeof first === "string") {
        client.subscriptions.delete(first);
      } else if (type === "EVENT" && first && typeof first === "object") {
        retainedEvents.push(first);
        if (retainedEvents.length > maxRetainedEvents) retainedEvents.shift();
        stats.publishedEvents += 1;
        for (const target of clients) deliver(target, first);
        send(socket, ["OK", first.id ?? "", true, ""]);
      } else {
        send(socket, ["NOTICE", "unsupported Nostr message"]);
      }
    });

    const remove = () => {
      clients.delete(client);
      stats.activeConnections = clients.size;
    };
    socket.once("close", remove);
    socket.once("error", remove);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine Nostr test relay address");
  }

  return {
    host,
    port: address.port,
    url: `ws://${host}:${address.port}${path}`,
    stats: () => ({ ...stats, activeConnections: clients.size, retainedEvents: retainedEvents.length }),
    close: async () => {
      for (const client of clients) client.socket.terminate();
      await new Promise((resolve, reject) => websocketServer.close((error) => error ? reject(error) : resolve()));
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
