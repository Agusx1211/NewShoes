export const MULTIPLAYER_NETWORK_LIFECYCLE = Object.freeze({
  OFFLINE: 0,
  CONNECTING: 1,
  DISCOVERY_ONLINE: 2,
  PEER_READY: 3,
  ERROR: 4,
});

export const SHARED_MULTIPLAYER_NETWORK_STATE = Object.freeze({
  VIRTUAL_IP: 0,
  DIAGNOSTICS_ENABLED: 1,
  LIFECYCLE: 2,
  CONNECTION_GENERATION: 3,
  PEER_GENERATION: 4,
  OPEN_RELAYS: 5,
  RELAY_COUNT: 6,
  OPEN_PEERS: 7,
  PEER_COUNT: 8,
  RECONNECT_COUNT: 9,
  WORDS: 10,
});

const STATUS_SEQUENCE = 0;
const STATUS_LENGTH = 1;
const STATUS_CONTROL_WORDS = 2;
const DEFAULT_STATUS_BYTES = 768;

function statusViews(channel) {
  if (!channel || !(channel.control instanceof SharedArrayBuffer)
      || !(channel.bytes instanceof SharedArrayBuffer)
      || !Number.isInteger(channel.maxBytes) || channel.maxBytes < 1) {
    throw new TypeError("invalid shared multiplayer network status channel");
  }
  return {
    control: new Int32Array(channel.control),
    bytes: new Uint8Array(channel.bytes),
  };
}
export function createSharedMultiplayerNetworkStatus(maxBytes = DEFAULT_STATUS_BYTES) {
  if (!Number.isInteger(maxBytes) || maxBytes < 64) {
    throw new RangeError("shared multiplayer network status capacity must be at least 64 bytes");
  }
  return {
    maxBytes,
    control: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * STATUS_CONTROL_WORDS),
    bytes: new SharedArrayBuffer(maxBytes),
  };
}

// One main-realm writer publishes through an odd/even sequence. The engine
// worker retries if it observes an in-progress write, so native UI text never
// sees a partially copied UTF-8 status.
export function writeSharedMultiplayerNetworkStatus(channel, value) {
  const { control, bytes } = statusViews(channel);
  const encoded = new TextEncoder().encode(String(value ?? ""));
  const length = Math.min(encoded.byteLength, channel.maxBytes);
  let sequence = Atomics.load(control, STATUS_SEQUENCE);
  if ((sequence & 1) !== 0) sequence += 1;
  Atomics.store(control, STATUS_SEQUENCE, sequence + 1);
  bytes.fill(0);
  bytes.set(encoded.subarray(0, length));
  Atomics.store(control, STATUS_LENGTH, length);
  Atomics.store(control, STATUS_SEQUENCE, sequence + 2);
  return length;
}

export function readSharedMultiplayerNetworkStatus(channel) {
  const { control, bytes } = statusViews(channel);
  for (let attempt = 0; attempt < 4; ++attempt) {
    const before = Atomics.load(control, STATUS_SEQUENCE);
    if ((before & 1) !== 0) continue;
    const length = Math.max(0, Math.min(
      Atomics.load(control, STATUS_LENGTH), channel.maxBytes));
    const copy = bytes.slice(0, length);
    const after = Atomics.load(control, STATUS_SEQUENCE);
    if (before === after && (after & 1) === 0) {
      return new TextDecoder().decode(copy);
    }
  }
  return "Discovery status is updating";
}

function cleanLabel(value, fallback, maxLength = 80) {
  const label = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return label || fallback;
}

function relayHost(endpoint, configuration) {
  const configured = endpoint?.projectRelay
    ?? configuration?.relayUrls?.[0]
    ?? "relay.newshoes.gg";
  try {
    return new URL(String(configured)).host || cleanLabel(configured, "unavailable", 64);
  } catch {
    return cleanLabel(configured, "unavailable", 64);
  }
}

export function formatMultiplayerNetworkStatus({
  phase = "offline",
  endpoint = null,
  configuration = null,
  error = null,
} = {}) {
  const relay = relayHost(endpoint, configuration);
  const room = cleanLabel(endpoint?.room ?? configuration?.room, "not selected", 32);
  if (phase === "connecting") {
    return `Network: connecting | Relay: ${relay}\nRoom: ${room}`;
  }
  if (phase === "error" || error) {
    const detail = cleanLabel(error ?? endpoint?.lastError,
      "connection failed", 32);
    return `Network: error | Relay: ${relay} | Reconnect\nRoom: ${room} | ${detail}`;
  }
  if (phase === "offline" || !endpoint) {
    return `Network: offline | Relay: ${relay} | Reconnect\nRoom: ${room}`;
  }
  const openRelays = Math.max(0, Number(endpoint.openRelays) || 0);
  const relayCount = Math.max(openRelays, Number(endpoint.relays?.length) || 0);
  const openPeers = Math.max(0, Number(endpoint.openPeers) || 0);
  const peerCount = Math.max(openPeers, Number(endpoint.peerCount) || 0);
  const discovery = endpoint.discoveryConnected === true ? "online" : "waiting";
  return `Network: ${discovery} | Relay: ${relay} ${openRelays}/${relayCount}`
    + ` | Peers: ${openPeers}/${peerCount}\nRoom: ${room}`;
}
