const CONTROL_WORDS = 4;
const METADATA_WORDS = 6;
const WRITE_INDEX = 0;
const READ_INDEX = 1;
const ITEM_COUNT = 2;
const DROPPED_COUNT = 3;

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
    state: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
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
  };
  Atomics.store(control, READ_INDEX, (readIndex + 1) % ring.capacity);
  Atomics.sub(control, ITEM_COUNT, 1);
  return datagram;
}

export function sharedUdpRingDropped(ring) {
  return Atomics.load(ringViews(ring).control, DROPPED_COUNT);
}
