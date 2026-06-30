import { createHash } from "node:crypto";
import { createServer } from "node:http";

const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function websocketAcceptKey(key) {
  return createHash("sha1").update(`${key}${websocketGuid}`).digest("base64");
}

function encodeFrame(payload, opcode = 2) {
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
  const messages = [];
  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (!fin) {
      throw new Error("fragmented WebSocket frames are not supported by this smoke relay");
    }
    if (length === 126) {
      if (client.buffer.length < offset + 2) {
        break;
      }
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) {
        break;
      }
      const bigLength = client.buffer.readBigUInt64BE(offset);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("oversized WebSocket frame");
      }
      length = Number(bigLength);
      offset += 8;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = offset + maskLength + length;
    if (client.buffer.length < frameLength) {
      break;
    }

    let payload = client.buffer.subarray(offset + maskLength, frameLength);
    if (masked) {
      const mask = client.buffer.subarray(offset, offset + 4);
      payload = Buffer.from(payload);
      for (let index = 0; index < payload.length; ++index) {
        payload[index] ^= mask[index % 4];
      }
    } else {
      payload = Buffer.from(payload);
    }

    client.buffer = client.buffer.subarray(frameLength);
    messages.push({ opcode, payload });
  }
  return messages;
}

export async function startBinaryWebSocketRelayServer({ port = 0, path = "/relay" } = {}) {
  const server = createServer();
  const clients = new Set();
  const waiters = [];
  const stats = {
    source: "browser WebSocket binary relay server",
    path,
    connections: 0,
    activeConnections: 0,
    receivedFrames: 0,
    forwardedFrames: 0,
    receivedBytes: 0,
    forwardedBytes: 0,
    lastFrame: null,
  };

  function snapshot() {
    return {
      ...stats,
      activeConnections: clients.size,
    };
  }

  function notifyWaiters() {
    for (let index = waiters.length - 1; index >= 0; --index) {
      const waiter = waiters[index];
      if (waiter.predicate(snapshot())) {
        clearTimeout(waiter.timer);
        waiters.splice(index, 1);
        waiter.resolve(snapshot());
      }
    }
  }

  function waitFor(predicate, label, timeoutMs = 5000) {
    const current = snapshot();
    if (predicate(current)) {
      return Promise.resolve(current);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          reject(new Error(`${label} timed out: ${JSON.stringify(snapshot())}`));
        }, timeoutMs),
      };
      waiters.push(waiter);
    });
  }

  function removeClient(client) {
    if (clients.delete(client)) {
      notifyWaiters();
    }
  }

  function broadcast(sender, payload) {
    let forwarded = 0;
    for (const client of clients) {
      if (client === sender || client.socket.destroyed) {
        continue;
      }
      client.socket.write(encodeFrame(payload, 2));
      forwarded += 1;
      stats.forwardedFrames += 1;
      stats.forwardedBytes += payload.length;
    }
    return forwarded;
  }

  server.on("upgrade", (request, socket) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const key = request.headers["sec-websocket-key"];
      if (requestUrl.pathname !== path || typeof key !== "string") {
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
        id: `browser-client-${stats.connections}`,
        socket,
        buffer: Buffer.alloc(0),
      };
      stats.connections += 1;
      clients.add(client);
      notifyWaiters();

      socket.on("data", (chunk) => {
        try {
          client.buffer = Buffer.concat([client.buffer, chunk]);
          for (const frame of decodeFrames(client)) {
            if (frame.opcode === 8) {
              socket.end(encodeFrame(Buffer.alloc(0), 8));
              removeClient(client);
              continue;
            }
            if (frame.opcode === 9) {
              socket.write(encodeFrame(frame.payload, 10));
              continue;
            }
            if (frame.opcode !== 1 && frame.opcode !== 2) {
              continue;
            }
            const forwarded = broadcast(client, frame.payload);
            stats.receivedFrames += 1;
            stats.receivedBytes += frame.payload.length;
            stats.lastFrame = {
              from: client.id,
              opcode: frame.opcode,
              bytes: frame.payload.length,
              forwarded,
            };
            notifyWaiters();
          }
        } catch (error) {
          socket.destroy(error);
          removeClient(client);
        }
      });
      socket.on("close", () => removeClient(client));
      socket.on("error", () => removeClient(client));
    } catch {
      socket.destroy();
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine WebSocket relay server address");
  }

  return {
    server,
    url: `ws://127.0.0.1:${address.port}${path}`,
    stats: snapshot,
    waitForConnections: (count, timeoutMs) =>
      waitFor((state) => state.activeConnections >= count, `${count} WebSocket connection(s)`, timeoutMs),
    waitForForwardedFrames: (count, timeoutMs) =>
      waitFor((state) => state.forwardedFrames >= count, `${count} forwarded WebSocket frame(s)`, timeoutMs),
    close: () => new Promise((resolveClose, rejectClose) => {
      for (const client of clients) {
        client.socket.destroy();
      }
      server.close((error) => error ? rejectClose(error) : resolveClose());
    }),
  };
}
