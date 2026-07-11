import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function websocketAcceptKey(key) {
  return createHash("sha1").update(`${key}${websocketGuid}`).digest("base64");
}

function encodeFrame(payload, opcode = 1) {
  const data = Buffer.from(payload);
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

function decodeFrames(client) {
  const frames = [];
  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (!fin) {
      throw new Error("fragmented WebSocket signaling frames are not supported");
    }
    if (length === 126) {
      if (client.buffer.length < offset + 2) break;
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) break;
      const bigLength = client.buffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(1024 * 1024)) {
        throw new Error("oversized WebSocket signaling frame");
      }
      length = Number(bigLength);
      offset += 8;
    }
    const maskBytes = masked ? 4 : 0;
    const frameBytes = offset + maskBytes + length;
    if (client.buffer.length < frameBytes) break;
    let payload = Buffer.from(client.buffer.subarray(offset + maskBytes, frameBytes));
    if (masked) {
      const mask = client.buffer.subarray(offset, offset + 4);
      for (let index = 0; index < payload.length; ++index) {
        payload[index] ^= mask[index % 4];
      }
    }
    client.buffer = client.buffer.subarray(frameBytes);
    frames.push({ opcode, payload });
  }
  return frames;
}

function cleanIdentifier(value, fallback, maxLength = 64) {
  const clean = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
  return clean || fallback;
}

function publicPeer(client) {
  return {
    peerId: client.peerId,
    displayName: client.displayName,
    virtualIp: client.virtualIp >>> 0,
  };
}

function virtualIpForSlot(slot, virtualIpBase) {
  return (((virtualIpBase >>> 0) & 0xffffff00) | slot) >>> 0;
}

export function attachWebRtcSignalingServer({
  server,
  path = "/webrtc",
  maxPeersPerRoom = 8,
  virtualIpBase = ((10 << 24) | (77 << 16)),
} = {}) {
  if (!server) {
    throw new Error("attachWebRtcSignalingServer requires an HTTP server");
  }
  const clients = new Set();
  const rooms = new Map();
  const waiters = [];
  const stats = {
    source: "C&C WebRTC room signaling server",
    path,
    connections: 0,
    joined: 0,
    activeConnections: 0,
    activeRooms: 0,
    signalingMessages: 0,
    relayedSignals: 0,
    binaryFramesRejected: 0,
    gamePayloadBytes: 0,
    lastSignal: null,
  };

  function snapshot() {
    return {
      ...stats,
      activeConnections: [...clients].filter((client) => !client.socket.destroyed).length,
      activeRooms: rooms.size,
      rooms: [...rooms.entries()].map(([name, members]) => ({
        name,
        peers: [...members].map(publicPeer),
      })),
    };
  }

  function notifyWaiters() {
    const state = snapshot();
    for (let index = waiters.length - 1; index >= 0; --index) {
      const waiter = waiters[index];
      if (waiter.predicate(state)) {
        clearTimeout(waiter.timer);
        waiters.splice(index, 1);
        waiter.resolve(state);
      }
    }
  }

  function waitFor(predicate, label, timeoutMs = 10000) {
    const current = snapshot();
    if (predicate(current)) return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`${label} timed out: ${JSON.stringify(snapshot())}`));
        }, timeoutMs),
      };
      waiters.push(waiter);
    });
  }

  function send(client, message) {
    if (!client.socket.destroyed) {
      client.socket.write(encodeFrame(JSON.stringify(message)));
    }
  }

  function roomMembers(client) {
    return client.room ? rooms.get(client.room) : null;
  }

  function leave(client) {
    const members = roomMembers(client);
    if (members?.delete(client)) {
      for (const peer of members) {
        send(peer, { type: "peer-left", peerId: client.peerId });
      }
      if (members.size === 0) rooms.delete(client.room);
    }
    client.room = null;
    clients.delete(client);
    notifyWaiters();
  }

  function join(client, message) {
    if (client.room) {
      throw new Error("signaling connection already joined a room");
    }
    const roomName = cleanIdentifier(message.room, "room", 80);
    let members = rooms.get(roomName);
    if (!members) {
      members = new Set();
      rooms.set(roomName, members);
    }
    if (members.size >= maxPeersPerRoom) {
      throw new Error(`room ${roomName} is full`);
    }
    const usedSlots = new Set([...members].map((member) => member.virtualSlot));
    let virtualSlot = 1;
    while (usedSlots.has(virtualSlot)) virtualSlot += 1;
    const requestedId = cleanIdentifier(message.peerId, `peer-${randomUUID().slice(0, 8)}`);
    const usedIds = new Set([...members].map((member) => member.peerId));
    let peerId = requestedId;
    let suffix = 2;
    while (usedIds.has(peerId)) {
      peerId = `${requestedId.slice(0, 56)}-${suffix++}`;
    }
    client.room = roomName;
    client.peerId = peerId;
    client.displayName = cleanIdentifier(message.displayName, peerId, 80);
    client.virtualSlot = virtualSlot;
    client.virtualIp = virtualIpForSlot(virtualSlot, virtualIpBase);
    const existingPeers = [...members].map(publicPeer);
    members.add(client);
    stats.joined += 1;
    send(client, {
      type: "welcome",
      room: roomName,
      peerId,
      displayName: client.displayName,
      virtualIp: client.virtualIp,
      peers: existingPeers,
    });
    for (const peer of members) {
      if (peer !== client) {
        send(peer, { type: "peer-joined", peer: publicPeer(client) });
      }
    }
    notifyWaiters();
  }

  function relaySignal(client, message) {
    const members = roomMembers(client);
    if (!members) throw new Error("join a room before signaling");
    const target = [...members].find((peer) => peer.peerId === message.to);
    if (!target) throw new Error(`unknown signaling target ${message.to}`);
    send(target, {
      type: "signal",
      from: client.peerId,
      signal: message.signal,
    });
    stats.signalingMessages += 1;
    stats.relayedSignals += 1;
    stats.lastSignal = {
      room: client.room,
      from: client.peerId,
      to: target.peerId,
      kind: message.signal?.description?.type
        ?? (message.signal?.candidate ? "candidate" : "unknown"),
    };
    notifyWaiters();
  }

  function handleMessage(client, message) {
    if (!message || typeof message !== "object") {
      throw new Error("invalid signaling message");
    }
    if (message.type === "join") {
      join(client, message);
    } else if (message.type === "signal") {
      relaySignal(client, message);
    } else {
      throw new Error(`unsupported signaling message ${message.type}`);
    }
  }

  function upgrade(request, socket) {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== path) return;
      const key = request.headers["sec-websocket-key"];
      if (typeof key !== "string") {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
      socket.write([
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${websocketAcceptKey(key)}`,
        "\r\n",
      ].join("\r\n"));
      const client = {
        socket,
        buffer: Buffer.alloc(0),
        room: null,
        peerId: null,
        displayName: null,
        virtualIp: 0,
        virtualSlot: 0,
      };
      clients.add(client);
      stats.connections += 1;
      notifyWaiters();
      socket.on("data", (chunk) => {
        try {
          client.buffer = Buffer.concat([client.buffer, chunk]);
          for (const frame of decodeFrames(client)) {
            if (frame.opcode === 8) {
              socket.end(encodeFrame(Buffer.alloc(0), 8));
              leave(client);
            } else if (frame.opcode === 9) {
              socket.write(encodeFrame(frame.payload, 10));
            } else if (frame.opcode === 1) {
              try {
                handleMessage(client, JSON.parse(frame.payload.toString("utf8")));
              } catch (error) {
                send(client, { type: "error", error: error?.message ?? String(error) });
              }
            } else if (frame.opcode === 2) {
              stats.binaryFramesRejected += 1;
              stats.gamePayloadBytes += frame.payload.length;
              send(client, { type: "error", error: "game payloads must use WebRTC, not signaling" });
              notifyWaiters();
            }
          }
        } catch (error) {
          socket.destroy(error);
          leave(client);
        }
      });
      socket.on("close", () => leave(client));
      socket.on("error", () => leave(client));
    } catch {
      socket.destroy();
    }
  }

  server.on("upgrade", upgrade);
  return {
    server,
    path,
    stats: snapshot,
    waitForPeers: (count, timeoutMs) => waitFor(
      (state) => state.rooms.some((room) => room.peers.length >= count),
      `${count} WebRTC signaling room peer(s)`, timeoutMs),
    waitForSignals: (count, timeoutMs) => waitFor(
      (state) => state.relayedSignals >= count,
      `${count} relayed WebRTC signal(s)`, timeoutMs),
    close: () => {
      server.off("upgrade", upgrade);
      for (const client of [...clients]) {
        client.socket.destroy();
        leave(client);
      }
    },
  };
}

export async function startWebRtcSignalingServer({
  host = "127.0.0.1",
  port = 0,
  path = "/webrtc",
  maxPeersPerRoom = 8,
  virtualIpBase = ((10 << 24) | (77 << 16)),
} = {}) {
  const server = createServer((_, response) => {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("WebRTC signaling endpoint\n");
  });
  const signaling = attachWebRtcSignalingServer({ server, path, maxPeersPerRoom, virtualIpBase });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine WebRTC signaling server address");
  }
  const closeSignaling = signaling.close;
  return {
    ...signaling,
    host,
    port: address.port,
    url: `ws://${host === "0.0.0.0" ? "127.0.0.1" : host}:${address.port}${path}`,
    close: () => new Promise((resolve, reject) => {
      closeSignaling();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
