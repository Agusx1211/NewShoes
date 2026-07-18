const DEFAULT_LIMITS = Object.freeze({
  packets: 100_000,
  packetBytes: 32 * 1024 * 1024,
  events: 100_000,
  rtcSamples: 7_200,
  engineSamples: 14_400,
});

function nowTimestamp() {
  const monotonicMs = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : 0;
  const timeOrigin = typeof performance !== "undefined" && Number.isFinite(performance.timeOrigin)
    ? performance.timeOrigin
    : Date.now() - monotonicMs;
  return {
    at: new Date().toISOString(),
    epochUs: Math.round((timeOrigin + monotonicMs) * 1000),
    monotonicMs: Number(monotonicMs.toFixed(3)),
  };
}

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new Uint8Array(0);
}

function bytesToHex(value) {
  const bytes = bytesOf(value);
  let result = "";
  for (let index = 0; index < bytes.length; ++index) {
    result += bytes[index].toString(16).padStart(2, "0");
  }
  return result;
}

class BoundedQueue {
  #values = [];
  #head = 0;

  get length() {
    return this.#values.length - this.#head;
  }

  push(value) {
    this.#values.push(value);
    return this.length;
  }

  shift() {
    if (this.length === 0) return undefined;
    const value = this.#values[this.#head];
    this.#values[this.#head] = undefined;
    this.#head += 1;
    if (this.#head * 2 >= this.#values.length) {
      this.#values = this.#values.slice(this.#head);
      this.#head = 0;
    }
    return value;
  }

  clear() {
    this.#values = [];
    this.#head = 0;
  }

  map(callback) {
    const result = new Array(this.length);
    for (let index = 0; index < result.length; ++index) {
      result[index] = callback(this.#values[this.#head + index], index, this);
    }
    return result;
  }
}

function pushBounded(list, value, limit, onEvict = null) {
  list.push(value);
  while (list.length > limit) {
    const removed = list.shift();
    onEvict?.(removed);
  }
}

function cloneJson(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { serializationError: true };
  }
}

export class NetworkDiagnosticsRecorder {
  constructor(limits = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.enabled = false;
    this.startedAt = null;
    this.stoppedAt = null;
    this.sequence = 0;
    this.packetBytes = 0;
    this.packets = new BoundedQueue();
    this.events = new BoundedQueue();
    this.rtcSamples = new BoundedQueue();
    this.engineSamples = new BoundedQueue();
    this.totals = {
      packets: 0,
      packetBytes: 0,
      events: 0,
      rtcSamples: 0,
      engineSamples: 0,
    };
    this.evicted = {
      packets: 0,
      packetBytes: 0,
      events: 0,
      rtcSamples: 0,
      engineSamples: 0,
    };
  }

  setEnabled(enabled, { reset = enabled, reason = "settings" } = {}) {
    const next = enabled === true;
    if (next && reset) this.clear();
    this.enabled = next;
    if (next) {
      this.startedAt = nowTimestamp();
      this.stoppedAt = null;
      this.recordEvent("capture.started", { reason });
    } else if (this.startedAt) {
      this.recordEvent("capture.stopped", { reason }, { force: true });
      this.stoppedAt = nowTimestamp();
    }
    return this.enabled;
  }

  clear() {
    this.sequence = 0;
    this.packetBytes = 0;
    this.packets.clear();
    this.events.clear();
    this.rtcSamples.clear();
    this.engineSamples.clear();
    for (const key of Object.keys(this.totals)) this.totals[key] = 0;
    for (const key of Object.keys(this.evicted)) this.evicted[key] = 0;
  }

  recordPacket(packet) {
    if (!this.enabled) return null;
    const bytes = bytesOf(packet?.bytes);
    const entry = {
      seq: ++this.sequence,
      ...nowTimestamp(),
      kind: "packet",
      direction: packet?.direction ?? "unknown",
      phase: packet?.phase ?? null,
      traceId: packet?.traceId ?? null,
      outcome: packet?.outcome ?? "delivered",
      byteLength: bytes.byteLength,
      payloadHex: bytesToHex(bytes),
      sourceIp: packet?.sourceIp == null ? null : Number(packet.sourceIp) >>> 0,
      sourcePort: packet?.sourcePort == null ? null : Number(packet.sourcePort) & 0xffff,
      destinationIp: packet?.destinationIp == null ? null : Number(packet.destinationIp) >>> 0,
      destinationPort: packet?.destinationPort == null ? null : Number(packet.destinationPort) & 0xffff,
      peerId: packet?.peerId ?? null,
      transportFrameBytes: packet?.transportFrameBytes ?? null,
      workerQueuedAtUs: packet?.workerQueuedAtUs ?? null,
      bridgeQueueDelayUs: packet?.bridgeQueueDelayUs ?? null,
      channel: cloneJson(packet?.channel ?? null),
      detail: cloneJson(packet?.detail ?? null),
    };
    this.totals.packets += 1;
    this.totals.packetBytes += bytes.byteLength;
    this.packetBytes += bytes.byteLength;
    this.packets.push(entry);
    while (this.packets.length > this.limits.packets
        || this.packetBytes > this.limits.packetBytes) {
      const removed = this.packets.shift();
      this.packetBytes -= removed?.byteLength ?? 0;
      this.evicted.packets += 1;
      this.evicted.packetBytes += removed?.byteLength ?? 0;
    }
    return entry;
  }

  recordEvent(type, detail = {}, { force = false } = {}) {
    if (!this.enabled && !force) return null;
    const entry = {
      seq: ++this.sequence,
      ...nowTimestamp(),
      kind: "event",
      type,
      detail: cloneJson(detail),
    };
    this.totals.events += 1;
    pushBounded(this.events, entry, this.limits.events, () => {
      this.evicted.events += 1;
    });
    return entry;
  }

  recordRtcSample(sample) {
    if (!this.enabled) return null;
    const entry = { seq: ++this.sequence, ...nowTimestamp(), ...cloneJson(sample) };
    this.totals.rtcSamples += 1;
    pushBounded(this.rtcSamples, entry, this.limits.rtcSamples, () => {
      this.evicted.rtcSamples += 1;
    });
    return entry;
  }

  recordEngineSample(sample) {
    if (!this.enabled) return null;
    const entry = { seq: ++this.sequence, ...nowTimestamp(), ...cloneJson(sample) };
    this.totals.engineSamples += 1;
    pushBounded(this.engineSamples, entry, this.limits.engineSamples, () => {
      this.evicted.engineSamples += 1;
    });
    return entry;
  }

  snapshot() {
    return {
      schema: "cnc.network-diagnostics.v1",
      ...this.summary(),
      packets: this.packets.map((entry) => ({ ...entry })),
      events: this.events.map((entry) => ({ ...entry })),
      rtcSamples: this.rtcSamples.map((entry) => ({ ...entry })),
      engineSamples: this.engineSamples.map((entry) => ({ ...entry })),
    };
  }

  summary() {
    return {
      enabled: this.enabled,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      limits: { ...this.limits },
      retained: {
        packets: this.packets.length,
        packetBytes: this.packetBytes,
        events: this.events.length,
        rtcSamples: this.rtcSamples.length,
        engineSamples: this.engineSamples.length,
      },
      totals: { ...this.totals },
      evicted: { ...this.evicted },
      complete: Object.values(this.evicted).every((count) => count === 0),
    };
  }
}

export const networkDiagnostics = new NetworkDiagnosticsRecorder();
export { nowTimestamp as networkDiagnosticTimestamp };
