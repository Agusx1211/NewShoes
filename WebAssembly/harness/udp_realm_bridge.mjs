const CONTROL_WORDS = 4;
const METADATA_WORDS = 9;
const WRITE_INDEX = 0;
const READ_INDEX = 1;
const ITEM_COUNT = 2;
const DROPPED_COUNT = 3;
const BRIDGE_SEQUENCE = 6;
const QUEUED_AT_US_LOW = 7;
const QUEUED_AT_US_HIGH = 8;

function epochMicroseconds() {
  const monotonicMs = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : 0;
  const timeOrigin = typeof performance !== "undefined" && Number.isFinite(performance.timeOrigin)
    ? performance.timeOrigin
    : Date.now() - monotonicMs;
  return Math.round((timeOrigin + monotonicMs) * 1000);
}

function writeSafeIntegerWords(metadata, offset, value) {
  const safe = Number.isSafeInteger(value) && value >= 0 ? value : 0;
  metadata[offset] = safe >>> 0;
  metadata[offset + 1] = Math.floor(safe / 0x100000000) >>> 0;
}

function readSafeIntegerWords(metadata, offset) {
  return metadata[offset] + metadata[offset + 1] * 0x100000000;
}

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("shared UDP datagram payload must be binary");
}

function ringViews(ring) {
  if (!ring || !(ring.control instanceof SharedArrayBuffer)
      || !(ring.metadata instanceof SharedArrayBuffer)
      || !(ring.payload instanceof SharedArrayBuffer)) {
    throw new TypeError("invalid shared UDP ring");
  }
  return {
    control: new Int32Array(ring.control),
    metadata: new Uint32Array(ring.metadata),
    payload: new Uint8Array(ring.payload),
  };
}

export function createSharedUdpRing({ capacity = 256, maxBytes = 2048 } = {}) {
  if (!Number.isInteger(capacity) || capacity < 1
      || !Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("shared UDP ring dimensions must be positive integers");
  }
  return {
    capacity,
    maxBytes,
    control: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * CONTROL_WORDS),
    metadata: new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT
      * METADATA_WORDS * capacity),
    payload: new SharedArrayBuffer(maxBytes * capacity),
  };
}

export function createSharedUdpBridge(options = {}) {
  return {
    outgoing: createSharedUdpRing(options),
    incoming: createSharedUdpRing(options),
    // [0] virtual IPv4 address, [1] detailed network diagnostics enabled.
    state: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2),
  };
}

export function clearSharedUdpRing(ring) {
  const { control } = ringViews(ring);
  for (let index = 0; index < CONTROL_WORDS; ++index) Atomics.store(control, index, 0);
}

export function sharedUdpRingCount(ring) {
  return Atomics.load(ringViews(ring).control, ITEM_COUNT);
}

export function enqueueSharedUdpDatagram(ring, datagram) {
  const bytes = bytesOf(datagram?.bytes);
  const { control, metadata, payload } = ringViews(ring);
  if (bytes.byteLength > ring.maxBytes
      || Atomics.load(control, ITEM_COUNT) >= ring.capacity) {
    Atomics.add(control, DROPPED_COUNT, 1);
    return false;
  }

  const writeIndex = Atomics.load(control, WRITE_INDEX);
  const metadataOffset = writeIndex * METADATA_WORDS;
  const payloadOffset = writeIndex * ring.maxBytes;
  payload.set(bytes, payloadOffset);
  metadata[metadataOffset] = bytes.byteLength;
  metadata[metadataOffset + 1] = datagram.ip >>> 0;
  metadata[metadataOffset + 2] = datagram.port & 0xffff;
  metadata[metadataOffset + 3] = datagram.sourceIp >>> 0;
  metadata[metadataOffset + 4] = datagram.sourcePort & 0xffff;
  metadata[metadataOffset + 5] = datagram.destinationPort & 0xffff;
  metadata[metadataOffset + BRIDGE_SEQUENCE] = Number(datagram.bridgeSequence ?? 0) >>> 0;
  writeSafeIntegerWords(metadata, metadataOffset + QUEUED_AT_US_LOW,
    Number(datagram.bridgeQueuedAtUs ?? epochMicroseconds()));
  Atomics.store(control, WRITE_INDEX, (writeIndex + 1) % ring.capacity);
  Atomics.add(control, ITEM_COUNT, 1);
  return true;
}

export function dequeueSharedUdpDatagram(ring) {
  const { control, metadata, payload } = ringViews(ring);
  if (Atomics.load(control, ITEM_COUNT) <= 0) return null;

  const readIndex = Atomics.load(control, READ_INDEX);
  const metadataOffset = readIndex * METADATA_WORDS;
  const length = metadata[metadataOffset];
  if (length > ring.maxBytes) {
    Atomics.add(control, DROPPED_COUNT, 1);
    Atomics.store(control, READ_INDEX, (readIndex + 1) % ring.capacity);
    Atomics.sub(control, ITEM_COUNT, 1);
    return null;
  }
  const payloadOffset = readIndex * ring.maxBytes;
  const bytes = payload.slice(payloadOffset, payloadOffset + length);
  const datagram = {
    bytes,
    ip: metadata[metadataOffset + 1] >>> 0,
    port: metadata[metadataOffset + 2] & 0xffff,
    sourceIp: metadata[metadataOffset + 3] >>> 0,
    sourcePort: metadata[metadataOffset + 4] & 0xffff,
    destinationPort: metadata[metadataOffset + 5] & 0xffff,
    bridgeSequence: metadata[metadataOffset + BRIDGE_SEQUENCE] >>> 0,
    bridgeQueuedAtUs: readSafeIntegerWords(metadata, metadataOffset + QUEUED_AT_US_LOW),
  };
  Atomics.store(control, READ_INDEX, (readIndex + 1) % ring.capacity);
  Atomics.sub(control, ITEM_COUNT, 1);
  return datagram;
}

export function createSharedUdpPortDemultiplexer(ring, {
  maxDeferred = ring?.capacity ?? 0,
  maxDeferredAgeMs = 30000,
  now = () => performance.now(),
  onEvent = null,
} = {}) {
  if (!Number.isInteger(maxDeferred) || maxDeferred < 1) {
    throw new RangeError("shared UDP deferred capacity must be a positive integer");
  }
  if (!Number.isFinite(maxDeferredAgeMs) || maxDeferredAgeMs <= 0
      || typeof now !== "function") {
    throw new RangeError("shared UDP deferred lifetime must be positive");
  }
  const deferredByPort = new Map();
  let deferredCount = 0;

  const emit = (type, detail) => {
    if (typeof onEvent === "function") onEvent(type, detail);
  };
  const pruneExpired = () => {
    const currentTime = now();
    for (const [port, queue] of deferredByPort) {
      while (queue.length > 0 && currentTime - queue[0].deferredAtMs >= maxDeferredAgeMs) {
        const { datagram } = queue.shift();
        deferredCount -= 1;
        emit("bridge.incoming.deferred-expired", {
          traceId: `in-${datagram.bridgeSequence ?? 0}`,
          bridgeSequence: datagram.bridgeSequence ?? 0,
          byteLength: datagram.bytes.byteLength,
          destinationPort: datagram.destinationPort,
          maxDeferredAgeMs,
        });
      }
      if (queue.length === 0) deferredByPort.delete(port);
    }
  };
  const takeDeferred = (port) => {
    const queue = deferredByPort.get(port);
    if (!queue?.length) return null;
    const { datagram } = queue.shift();
    deferredCount -= 1;
    if (queue.length === 0) deferredByPort.delete(port);
    return datagram;
  };
  const defer = (datagram, requestedPort) => {
    const traceId = `in-${datagram.bridgeSequence ?? 0}`;
    if (deferredCount >= maxDeferred) {
      emit("bridge.incoming.deferred-overflow", {
        traceId,
        bridgeSequence: datagram.bridgeSequence ?? 0,
        byteLength: datagram.bytes.byteLength,
        destinationPort: datagram.destinationPort,
        requestedPort,
        deferredCount,
        maxDeferred,
      });
      return;
    }
    let queue = deferredByPort.get(datagram.destinationPort);
    if (!queue) {
      queue = [];
      deferredByPort.set(datagram.destinationPort, queue);
    }
    queue.push({ datagram, deferredAtMs: now() });
    deferredCount += 1;
    emit("bridge.incoming.deferred-for-port", {
      traceId,
      bridgeSequence: datagram.bridgeSequence ?? 0,
      byteLength: datagram.bytes.byteLength,
      destinationPort: datagram.destinationPort,
      requestedPort,
      deferredCount,
    });
  };

  return {
    clear() {
      deferredByPort.clear();
      deferredCount = 0;
    },
    receive({ capacity, port } = {}) {
      const requestedPort = Number(port) & 0xffff;
      pruneExpired();
      let datagram = takeDeferred(requestedPort);
      while (datagram === null) {
        datagram = dequeueSharedUdpDatagram(ring);
        if (datagram === null) return null;
        if (datagram.destinationPort !== requestedPort) {
          defer(datagram, requestedPort);
          datagram = null;
        }
      }
      if (datagram.bytes.byteLength > Number(capacity ?? 0)) {
        emit("bridge.incoming.capacity-drop", {
          traceId: `in-${datagram.bridgeSequence ?? 0}`,
          bridgeSequence: datagram.bridgeSequence ?? 0,
          destinationPort: datagram.destinationPort,
          byteLength: datagram.bytes.byteLength,
          capacity: Number(capacity ?? 0),
        });
        return null;
      }
      return datagram;
    },
    snapshot() {
      return {
        deferredCount,
        maxDeferred,
        maxDeferredAgeMs,
        ports: [...deferredByPort.entries()].map(([port, queue]) => ({
          port,
          count: queue.length,
        })),
      };
    },
  };
}

export function sharedUdpRingDropped(ring) {
  return Atomics.load(ringViews(ring).control, DROPPED_COUNT);
}
