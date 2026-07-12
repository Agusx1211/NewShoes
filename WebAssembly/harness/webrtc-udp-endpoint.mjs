import { getRelaySockets, joinRoom, selfId } from "./vendor/trystero-nostr.min.mjs";

const FRAME_MAGIC = 0x434e4331; // "CNC1"
const FRAME_HEADER_BYTES = 16;
const BROADCAST_IP = 0xffffffff;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const MAX_ROOM_PEERS = 8;
const TRYSTERO_APP_ID = "project-new-shoes-lan-v1";
const TRANSPORT_VERSION = 1;
const DATA_CHANNEL_LABEL = "cnc-udp-v1";
const DATA_CHANNEL_PROTOCOL = "cnc-generals-udp-v1";
const PUBLIC_NOSTR_RELAYS = Object.freeze([
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://nostr.wine",
  "wss://relay.sigit.io",
]);

function normalizedBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("WebRTC UDP payload must be binary data");
}

function encodeDatagram({ bytes, sourceIp, sourcePort, destinationIp, destinationPort }) {
  const payload = normalizedBytes(bytes);
  const frame = new Uint8Array(FRAME_HEADER_BYTES + payload.byteLength);
  const view = new DataView(frame.buffer);
  view.setUint32(0, FRAME_MAGIC);
  view.setUint32(4, sourceIp >>> 0);
  view.setUint16(8, sourcePort & 0xffff);
  view.setUint16(10, destinationPort & 0xffff);
  view.setUint32(12, destinationIp >>> 0);
  frame.set(payload, FRAME_HEADER_BYTES);
  return frame;
}

function decodeDatagram(value) {
  const frame = normalizedBytes(value);
  if (frame.byteLength < FRAME_HEADER_BYTES) {
    throw new Error("WebRTC UDP frame is shorter than its header");
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  if (view.getUint32(0) !== FRAME_MAGIC) {
    throw new Error("WebRTC UDP frame magic does not match");
  }
  return {
    sourceIp: view.getUint32(4),
    sourcePort: view.getUint16(8),
    destinationPort: view.getUint16(10),
    destinationIp: view.getUint32(12),
    bytes: frame.slice(FRAME_HEADER_BYTES),
  };
}

function safeError(error) {
  return error?.message ?? String(error);
}

function cleanLabel(value, fallback, maxLength = 80) {
  const label = String(value ?? "").trim().slice(0, maxLength);
  return label || fallback;
}

// Trystero peer IDs are random 20-character base62 strings. Map the full ID
// deterministically into 10/8 so peers do not need a central address allocator.
// A detected 24-bit collision fails the peer handshake rather than allowing an
// ambiguous LAN address into the original engine.
export function virtualIpForTrysteroPeer(peerId) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(String(peerId))) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let host = hash & 0x00ffffff;
  if (host === 0 || host === 0x00ffffff) host ^= 1;
  return (0x0a000000 | host) >>> 0;
}

function relayStates() {
  return Object.entries(getRelaySockets()).map(([url, socket]) => ({
    url,
    state: socket.readyState,
  }));
}

export class WebRtcUdpEndpoint {
  constructor({
    room,
    peerId = null,
    displayName = null,
    iceServers = [],
    relayUrls = null,
    onDatagram = () => {},
    onStateChange = () => {},
  }) {
    if (typeof room !== "string" || room.trim().length === 0) {
      throw new Error("WebRTC UDP endpoint requires a room name");
    }
    if (relayUrls != null && (!Array.isArray(relayUrls) || relayUrls.length === 0
        || relayUrls.some((url) => !/^wss?:\/\//i.test(String(url))))) {
      throw new Error("Trystero relay URLs must be a non-empty ws:// or wss:// array");
    }
    this.room = room.trim();
    this.peerId = selfId;
    this.requestedPeerId = cleanLabel(peerId, selfId, 64);
    this.displayName = cleanLabel(displayName, this.requestedPeerId);
    this.localIp = virtualIpForTrysteroPeer(selfId);
    this.iceServers = Array.isArray(iceServers) ? iceServers : [];
    this.relayUrls = relayUrls
      ? [...new Set(relayUrls.map((url) => String(url).trim()))]
      : [...PUBLIC_NOSTR_RELAYS];
    this.onDatagram = onDatagram;
    this.onStateChange = onStateChange;
    this.discoveryRoom = null;
    this.discoveryConnected = false;
    this.closed = false;
    this.peers = new Map();
    this.pendingPeerMetadata = new Map();
    this.pendingPeerIds = new Set();
    this.waiters = [];
    this.lastError = null;
    this.stats = {
      discoveryErrors: 0,
      handshakes: 0,
      sent: 0,
      sentBytes: 0,
      received: 0,
      receivedBytes: 0,
      dropped: 0,
      channelOpens: 0,
      channelCloses: 0,
    };
  }

  snapshot() {
    const peers = [...this.peers.values()].map((peer) => ({
      peerId: peer.peerId,
      requestedPeerId: peer.requestedPeerId,
      displayName: peer.displayName,
      virtualIp: peer.virtualIp >>> 0,
      connectionState: peer.connection.connectionState,
      iceConnectionState: peer.connection.iceConnectionState,
      channelState: peer.channel?.readyState ?? null,
      bufferedAmount: peer.channel?.bufferedAmount ?? 0,
      channelLabel: peer.channel?.label ?? null,
      channelProtocol: peer.channel?.protocol ?? null,
      ordered: peer.channel?.ordered ?? null,
      maxRetransmits: peer.channel?.maxRetransmits ?? null,
    }));
    const openPeers = peers.filter((peer) => peer.channelState === "open").length;
    const relays = relayStates();
    return {
      source: "browser Trystero WebRTC P2P UDP endpoint",
      browserTransport: "dedicated WebRTC RTCDataChannel peer mesh",
      signalingTransport: "Trystero decentralized Nostr discovery/ICE",
      discoveryStrategy: "trystero-nostr",
      productionTransport: true,
      relayTransport: false,
      enabled: !this.closed,
      connected: this.discoveryConnected || openPeers > 0,
      signalingConnected: this.discoveryConnected,
      discoveryConnected: this.discoveryConnected,
      ready: openPeers > 0,
      room: this.room,
      peerId: this.peerId,
      requestedPeerId: this.requestedPeerId,
      displayName: this.displayName,
      localIp: this.localIp >>> 0,
      relays,
      openRelays: relays.filter((relay) => relay.state === WebSocket.OPEN).length,
      peers,
      peerCount: peers.length,
      openPeers,
      ...this.stats,
      lastError: this.lastError,
    };
  }

  notifyState() {
    const state = this.snapshot();
    this.onStateChange(state);
    for (let index = this.waiters.length - 1; index >= 0; --index) {
      const waiter = this.waiters[index];
      if (waiter.predicate(state)) {
        clearTimeout(waiter.timer);
        this.waiters.splice(index, 1);
        waiter.resolve(state);
      }
    }
  }

  waitFor(predicate, label, timeoutMs = 10000) {
    const current = this.snapshot();
    if (predicate(current)) return Promise.resolve(current);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error(`${label} timed out: ${JSON.stringify(this.snapshot())}`));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  waitForOpenPeers(count, timeoutMs = 10000) {
    return this.waitFor((state) => state.openPeers >= count,
      `${count} WebRTC data channel peer(s)`, timeoutMs);
  }

  localMetadata() {
    return {
      transportVersion: TRANSPORT_VERSION,
      peerId: this.requestedPeerId,
      displayName: this.displayName,
      virtualIp: this.localIp >>> 0,
    };
  }

  validateRemoteMetadata(transportPeerId, value) {
    if (!value || typeof value !== "object" || value.transportVersion !== TRANSPORT_VERSION) {
      throw new Error(`peer ${transportPeerId} uses an incompatible LAN transport`);
    }
    const virtualIp = Number(value.virtualIp) >>> 0;
    if (virtualIp !== virtualIpForTrysteroPeer(transportPeerId)) {
      throw new Error(`peer ${transportPeerId} advertised an invalid virtual IP`);
    }
    const collision = [...this.peers.values(), ...this.pendingPeerMetadata.values()]
      .find((peer) => peer.peerId !== transportPeerId && peer.virtualIp === virtualIp);
    if (collision) {
      throw new Error(`virtual IP collision between ${transportPeerId} and ${collision.peerId}`);
    }
    return {
      peerId: transportPeerId,
      requestedPeerId: cleanLabel(value.peerId, transportPeerId, 64),
      displayName: cleanLabel(value.displayName, value.peerId ?? transportPeerId),
      virtualIp,
    };
  }

  async exchangePeerMetadata(transportPeerId, send, receive, isInitiator) {
    this.pendingPeerIds.add(transportPeerId);
    try {
      const remotePeerIds = new Set([
        ...this.peers.keys(),
        ...this.pendingPeerMetadata.keys(),
        ...this.pendingPeerIds,
      ]);
      if (remotePeerIds.size >= MAX_ROOM_PEERS) {
        throw new Error(`room is full (${MAX_ROOM_PEERS} peers maximum)`);
      }
      let remote;
      if (isInitiator) {
        await send(this.localMetadata());
        remote = (await receive()).data;
      } else {
        remote = (await receive()).data;
        await send(this.localMetadata());
      }
      const metadata = this.validateRemoteMetadata(transportPeerId, remote);
      this.pendingPeerMetadata.set(transportPeerId, metadata);
      this.stats.handshakes += 1;
    } finally {
      this.pendingPeerIds.delete(transportPeerId);
    }
  }

  async waitForDiscoveryRelay(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (!this.closed && Date.now() < deadline) {
      if (relayStates().some((relay) => relay.state === WebSocket.OPEN)) {
        this.discoveryConnected = true;
        this.lastError = null;
        this.notifyState();
        return this.snapshot();
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Trystero discovery relay timed out after ${timeoutMs}ms`);
  }

  async connect(timeoutMs = 20000) {
    if (this.discoveryRoom) return this.snapshot();
    this.closed = false;
    const relayConfig = { urls: this.relayUrls, redundancy: this.relayUrls.length };
    this.discoveryRoom = joinRoom({
      appId: TRYSTERO_APP_ID,
      relayConfig,
      turnConfig: this.iceServers,
    }, this.room, {
      handshakeTimeoutMs: timeoutMs,
      onPeerHandshake: (peerId, send, receive, isInitiator) =>
        this.exchangePeerMetadata(peerId, send, receive, isInitiator),
      onJoinError: ({ error, peerId }) => {
        if (peerId) this.pendingPeerMetadata.delete(peerId);
        this.stats.discoveryErrors += 1;
        this.lastError = peerId ? `${peerId}: ${error}` : error;
        this.notifyState();
      },
    });
    this.discoveryRoom.onPeerJoin = (peerId) => this.addPeer(peerId);
    this.discoveryRoom.onPeerLeave = (peerId) => this.removePeer(peerId);
    return this.waitForDiscoveryRelay(timeoutMs);
  }

  addPeer(peerId) {
    if (this.closed || this.peers.has(peerId)) return;
    const metadata = this.pendingPeerMetadata.get(peerId);
    const connection = this.discoveryRoom?.getPeers()[peerId];
    if (!metadata || !connection) {
      this.lastError = `Trystero peer ${peerId} joined without negotiated metadata`;
      this.notifyState();
      return;
    }
    this.pendingPeerMetadata.delete(peerId);
    const peer = {
      ...metadata,
      connection,
      channel: null,
      dataChannelHandler: null,
      connectionStateHandler: null,
    };
    peer.dataChannelHandler = ({ channel }) => {
      if (channel.label === DATA_CHANNEL_LABEL && channel.protocol === DATA_CHANNEL_PROTOCOL) {
        this.attachChannel(peer, channel);
      }
    };
    connection.addEventListener("datachannel", peer.dataChannelHandler);
    peer.connectionStateHandler = () => {
      if (connection.connectionState === "failed") {
        this.lastError = `WebRTC peer ${peer.peerId} connection failed`;
      }
      this.notifyState();
    };
    connection.addEventListener("connectionstatechange", peer.connectionStateHandler);
    this.peers.set(peerId, peer);
    if (selfId < peerId) {
      this.attachChannel(peer, connection.createDataChannel(DATA_CHANNEL_LABEL, {
        ordered: true,
        protocol: DATA_CHANNEL_PROTOCOL,
      }));
    }
    this.notifyState();
  }

  attachChannel(peer, channel) {
    if (peer.channel && peer.channel !== channel) {
      channel.close();
      return;
    }
    peer.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = MAX_BUFFERED_BYTES / 2;
    channel.onopen = () => {
      this.stats.channelOpens += 1;
      this.lastError = null;
      this.notifyState();
    };
    channel.onclose = () => {
      this.stats.channelCloses += 1;
      this.notifyState();
    };
    channel.onerror = () => {
      this.lastError = `WebRTC data channel error from ${peer.peerId}`;
      this.notifyState();
    };
    channel.onmessage = (event) => void this.handleDatagram(peer, event.data);
  }

  async handleDatagram(peer, raw) {
    try {
      const value = raw instanceof Blob ? await raw.arrayBuffer() : raw;
      const datagram = decodeDatagram(value);
      if (datagram.sourceIp !== peer.virtualIp) {
        throw new Error(`WebRTC peer ${peer.peerId} sent a spoofed virtual IP`);
      }
      if (datagram.destinationIp !== BROADCAST_IP && datagram.destinationIp !== this.localIp) {
        this.stats.dropped += 1;
        this.notifyState();
        return;
      }
      this.stats.received += 1;
      this.stats.receivedBytes += datagram.bytes.byteLength;
      this.lastError = null;
      this.onDatagram({
        bytes: datagram.bytes,
        ip: datagram.sourceIp,
        port: datagram.sourcePort,
        destinationIp: datagram.destinationIp,
        destinationPort: datagram.destinationPort,
        peerId: peer.peerId,
      });
      this.notifyState();
    } catch (error) {
      this.stats.dropped += 1;
      this.lastError = safeError(error);
      this.notifyState();
    }
  }

  sendDatagram({ bytes, ip, port, sourceIp = 0, sourcePort = 0 }) {
    if (this.closed) return -7;
    const payload = normalizedBytes(bytes);
    const destinationIp = ip >>> 0;
    const frame = encodeDatagram({
      bytes: payload,
      sourceIp: this.localIp || (sourceIp >>> 0),
      sourcePort,
      destinationIp,
      destinationPort: port,
    });
    const broadcast = destinationIp === BROADCAST_IP;
    const targets = [...this.peers.values()].filter((peer) =>
      (broadcast || peer.virtualIp === destinationIp) && peer.channel?.readyState === "open");
    if (!broadcast && targets.length === 0) {
      this.lastError = `No open WebRTC peer for virtual IP ${destinationIp}`;
      this.notifyState();
      return -7;
    }
    if (targets.some((peer) => peer.channel.bufferedAmount + frame.byteLength > MAX_BUFFERED_BYTES)) {
      this.stats.dropped += 1;
      this.lastError = "WebRTC peer send buffer is full";
      this.notifyState();
      return -5;
    }
    for (const peer of targets) peer.channel.send(frame);
    this.stats.sent += 1;
    this.stats.sentBytes += payload.byteLength;
    this.lastError = null;
    this.notifyState();
    return payload.byteLength;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.removeEventListener("datachannel", peer.dataChannelHandler);
      peer.connection.removeEventListener("connectionstatechange", peer.connectionStateHandler);
      peer.channel?.close();
      this.peers.delete(peerId);
    }
    this.pendingPeerIds.delete(peerId);
    this.pendingPeerMetadata.delete(peerId);
    this.notifyState();
  }

  close() {
    this.closed = true;
    this.discoveryConnected = false;
    for (const peer of this.peers.values()) {
      peer.connection.removeEventListener("datachannel", peer.dataChannelHandler);
      peer.connection.removeEventListener("connectionstatechange", peer.connectionStateHandler);
      peer.channel?.close();
    }
    this.peers.clear();
    this.pendingPeerIds.clear();
    this.pendingPeerMetadata.clear();
    const room = this.discoveryRoom;
    this.discoveryRoom = null;
    const leavePromise = room ? room.leave().catch(() => {}) : Promise.resolve();
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("WebRTC UDP endpoint closed"));
    }
    this.notifyState();
    return leavePromise;
  }
}

export function createWebRtcUdpEndpoint(options) {
  return new WebRtcUdpEndpoint(options);
}

export const webRtcUdpWireContract = Object.freeze({
  magic: FRAME_MAGIC,
  headerBytes: FRAME_HEADER_BYTES,
  broadcastIp: BROADCAST_IP,
  reliable: true,
  ordered: true,
  discovery: "trystero-nostr",
  dataChannelLabel: DATA_CHANNEL_LABEL,
  dataChannelProtocol: DATA_CHANNEL_PROTOCOL,
});
