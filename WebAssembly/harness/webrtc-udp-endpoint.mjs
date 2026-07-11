const FRAME_MAGIC = 0x434e4331; // "CNC1"
const FRAME_HEADER_BYTES = 16;
const BROADCAST_IP = 0xffffffff;
const MAX_BUFFERED_BYTES = 1024 * 1024;

function normalizedBytes(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
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

export class WebRtcUdpEndpoint {
  constructor({
    signalingUrl,
    room,
    peerId = null,
    displayName = null,
    iceServers = [],
    onDatagram = () => {},
    onStateChange = () => {},
    peerConnectionFactory = (configuration) => new RTCPeerConnection(configuration),
    webSocketFactory = (url) => new WebSocket(url),
  }) {
    if (typeof signalingUrl !== "string" || signalingUrl.length === 0) {
      throw new Error("WebRTC UDP endpoint requires a signaling URL");
    }
    if (typeof room !== "string" || room.length === 0) {
      throw new Error("WebRTC UDP endpoint requires a room name");
    }
    this.signalingUrl = signalingUrl;
    this.room = room;
    this.requestedPeerId = peerId;
    this.displayName = displayName;
    this.iceServers = Array.isArray(iceServers) ? iceServers : [];
    this.onDatagram = onDatagram;
    this.onStateChange = onStateChange;
    this.peerConnectionFactory = peerConnectionFactory;
    this.webSocketFactory = webSocketFactory;
    this.socket = null;
    this.peerId = null;
    this.localIp = 0;
    this.signalingConnected = false;
    this.closed = false;
    this.peers = new Map();
    this.peerDirectory = new Map();
    this.waiters = [];
    this.lastError = null;
    this.stats = {
      signalingSent: 0,
      signalingReceived: 0,
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
      displayName: peer.displayName,
      virtualIp: peer.virtualIp >>> 0,
      connectionState: peer.connection.connectionState,
      iceConnectionState: peer.connection.iceConnectionState,
      channelState: peer.channel?.readyState ?? null,
      bufferedAmount: peer.channel?.bufferedAmount ?? 0,
    }));
    const openPeers = peers.filter((peer) => peer.channelState === "open").length;
    return {
      source: "browser WebRTC P2P UDP endpoint",
      browserTransport: "WebRTC RTCDataChannel peer mesh",
      signalingTransport: "WebSocket SDP/ICE only",
      productionTransport: true,
      relayTransport: false,
      enabled: !this.closed,
      connected: this.signalingConnected || openPeers > 0,
      signalingConnected: this.signalingConnected,
      ready: openPeers > 0,
      signalingUrl: this.signalingUrl,
      room: this.room,
      peerId: this.peerId,
      localIp: this.localIp >>> 0,
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
    if (predicate(current)) {
      return Promise.resolve(current);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) {
            this.waiters.splice(index, 1);
          }
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

  async connect(timeoutMs = 10000) {
    if (this.socket) {
      return this.snapshot();
    }
    this.closed = false;
    const socket = this.webSocketFactory(this.signalingUrl);
    this.socket = socket;
    socket.onmessage = (event) => {
      void this.handleSignalingMessage(event.data);
    };
    socket.onerror = () => {
      this.lastError = "WebRTC signaling WebSocket error";
      this.notifyState();
    };
    socket.onclose = () => {
      this.signalingConnected = false;
      if (!this.closed) {
        this.lastError = this.lastError ?? "WebRTC signaling WebSocket closed";
      }
      this.notifyState();
    };
    socket.onopen = () => {
      this.sendSignal({
        type: "join",
        room: this.room,
        peerId: this.requestedPeerId,
        displayName: this.displayName,
      });
    };
    return this.waitFor((state) => state.signalingConnected, "WebRTC signaling welcome", timeoutMs);
  }

  sendSignal(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebRTC signaling socket is not open");
    }
    this.socket.send(JSON.stringify(message));
    this.stats.signalingSent += 1;
  }

  async handleSignalingMessage(raw) {
    try {
      const message = JSON.parse(typeof raw === "string" ? raw : await raw.text());
      this.stats.signalingReceived += 1;
      if (message.type === "welcome") {
        this.peerId = message.peerId;
        this.localIp = message.virtualIp >>> 0;
        this.signalingConnected = true;
        this.lastError = null;
        for (const peer of message.peers ?? []) {
          this.rememberPeer(peer);
          await this.ensurePeer(peer, true);
        }
      } else if (message.type === "peer-joined") {
        this.rememberPeer(message.peer);
      } else if (message.type === "peer-left") {
        this.removePeer(message.peerId);
      } else if (message.type === "signal") {
        await this.handlePeerSignal(message.from, message.signal);
      } else if (message.type === "error") {
        throw new Error(message.error || "WebRTC signaling server rejected the request");
      }
      this.notifyState();
    } catch (error) {
      this.lastError = safeError(error);
      this.notifyState();
    }
  }

  rememberPeer(peer) {
    if (!peer?.peerId || peer.peerId === this.peerId) {
      return;
    }
    this.peerDirectory.set(peer.peerId, {
      peerId: peer.peerId,
      displayName: peer.displayName ?? peer.peerId,
      virtualIp: peer.virtualIp >>> 0,
    });
  }

  async ensurePeer(peerDescription, initiator) {
    this.rememberPeer(peerDescription);
    const known = this.peerDirectory.get(peerDescription.peerId);
    if (!known) {
      throw new Error(`Unknown WebRTC peer ${peerDescription.peerId}`);
    }
    let peer = this.peers.get(known.peerId);
    if (peer) {
      return peer;
    }
    const connection = this.peerConnectionFactory({ iceServers: this.iceServers });
    peer = {
      ...known,
      connection,
      channel: null,
      pendingCandidates: [],
    };
    this.peers.set(peer.peerId, peer);
    connection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.sendSignal({
          type: "signal",
          to: peer.peerId,
          signal: { candidate: candidate.toJSON ? candidate.toJSON() : candidate },
        });
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed") {
        this.lastError = `WebRTC peer ${peer.peerId} connection failed`;
      }
      this.notifyState();
    };
    connection.ondatachannel = ({ channel }) => this.attachChannel(peer, channel);
    if (initiator) {
      this.attachChannel(peer, connection.createDataChannel("cnc-udp-v1", {
        ordered: true,
        protocol: "cnc-generals-udp-v1",
      }));
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      this.sendSignal({
        type: "signal",
        to: peer.peerId,
        signal: { description: connection.localDescription },
      });
    }
    this.notifyState();
    return peer;
  }

  attachChannel(peer, channel) {
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
    channel.onmessage = (event) => {
      void this.handleDatagram(peer, event.data);
    };
  }

  async handlePeerSignal(fromPeerId, signal) {
    const directoryPeer = this.peerDirectory.get(fromPeerId) ?? {
      peerId: fromPeerId,
      displayName: fromPeerId,
      virtualIp: 0,
    };
    const peer = await this.ensurePeer(directoryPeer, false);
    const connection = peer.connection;
    if (signal?.description) {
      await connection.setRemoteDescription(signal.description);
      for (const candidate of peer.pendingCandidates.splice(0)) {
        await connection.addIceCandidate(candidate);
      }
      if (signal.description.type === "offer") {
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        this.sendSignal({
          type: "signal",
          to: peer.peerId,
          signal: { description: connection.localDescription },
        });
      }
    } else if (signal?.candidate) {
      if (connection.remoteDescription) {
        await connection.addIceCandidate(signal.candidate);
      } else {
        peer.pendingCandidates.push(signal.candidate);
      }
    }
  }

  async handleDatagram(peer, raw) {
    try {
      const value = raw instanceof Blob ? await raw.arrayBuffer() : raw;
      const datagram = decodeDatagram(value);
      if (peer.virtualIp !== 0 && datagram.sourceIp !== peer.virtualIp) {
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
    if (this.closed) {
      return -7;
    }
    const payload = normalizedBytes(bytes);
    const destinationIp = ip >>> 0;
    const actualSourceIp = this.localIp || (sourceIp >>> 0);
    const frame = encodeDatagram({
      bytes: payload,
      sourceIp: actualSourceIp,
      sourcePort,
      destinationIp,
      destinationPort: port,
    });
    const broadcast = destinationIp === BROADCAST_IP;
    const targets = [...this.peers.values()].filter((peer) =>
      (broadcast || peer.virtualIp === destinationIp)
      && peer.channel?.readyState === "open");
    if (!broadcast && targets.length === 0) {
      this.lastError = `No open WebRTC peer for virtual IP ${destinationIp}`;
      this.notifyState();
      return -7;
    }
    for (const peer of targets) {
      if (peer.channel.bufferedAmount + frame.byteLength > MAX_BUFFERED_BYTES) {
        this.stats.dropped += 1;
        this.lastError = `WebRTC peer ${peer.peerId} send buffer is full`;
        this.notifyState();
        return -5;
      }
    }
    for (const peer of targets) {
      peer.channel.send(frame);
    }
    this.stats.sent += 1;
    this.stats.sentBytes += payload.byteLength;
    this.lastError = null;
    this.notifyState();
    return payload.byteLength;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.channel?.close();
      peer.connection.close();
      this.peers.delete(peerId);
    }
    this.peerDirectory.delete(peerId);
    this.notifyState();
  }

  close() {
    this.closed = true;
    this.signalingConnected = false;
    for (const peer of this.peers.values()) {
      peer.channel?.close();
      peer.connection.close();
    }
    this.peers.clear();
    this.peerDirectory.clear();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("WebRTC UDP endpoint closed"));
    }
    this.notifyState();
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
});
