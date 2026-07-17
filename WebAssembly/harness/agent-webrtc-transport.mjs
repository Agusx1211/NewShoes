const ROOM_CONTEXT = "cnc-agent-webrtc-room/v1:";
const SIGNAL_CONTEXT = "cnc-agent-webrtc-signal/v1:";
const CHANNEL_LABEL = "cnc-agent";
const CHANNEL_PROTOCOL = "cnc-agent.v1";
const ICE_SERVERS = Object.freeze([{ urls: Object.freeze([
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
  "stun:stun.cloudflare.com:3478",
]) }]);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64urlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64urlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function deriveAgentWebRTCPairing(token, cryptoImpl = globalThis.crypto) {
  const [roomDigest, signalDigest] = await Promise.all([
    cryptoImpl.subtle.digest("SHA-256", encoder.encode(`${ROOM_CONTEXT}${token}`)),
    cryptoImpl.subtle.digest("SHA-256", encoder.encode(`${SIGNAL_CONTEXT}${token}`)),
  ]);
  const key = await cryptoImpl.subtle.importKey(
    "raw", signalDigest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"],
  );
  return { room: bytesToHex(new Uint8Array(roomDigest)), key };
}

function eventWith(type, values = {}) {
  const event = new Event(type);
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(event, name, { value, enumerable: true });
  }
  return event;
}

export class AgentWebRTCTransport extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url, token, {
    WebSocketImpl = globalThis.WebSocket,
    RTCPeerConnectionImpl = globalThis.RTCPeerConnection,
    cryptoImpl = globalThis.crypto,
  } = {}) {
    super();
    if (typeof WebSocketImpl !== "function") throw new TypeError("WebSocket is unavailable");
    if (typeof RTCPeerConnectionImpl !== "function") {
      throw new TypeError("WebRTC is unavailable in this browser");
    }
    this.url = url;
    this.token = token;
    this.WebSocketImpl = WebSocketImpl;
    this.RTCPeerConnectionImpl = RTCPeerConnectionImpl;
    this.cryptoImpl = cryptoImpl;
    this.readyState = AgentWebRTCTransport.CONNECTING;
    this.signalSocket = null;
    this.peer = null;
    this.channel = null;
    this.key = null;
    this.pendingCandidates = [];
    this.signalTail = Promise.resolve();
    void this.#connect().catch((error) => this.#fail(error));
  }

  async #connect() {
    const pairing = await deriveAgentWebRTCPairing(this.token, this.cryptoImpl);
    this.key = pairing.key;
    const signalURL = new URL(this.url);
    signalURL.protocol = signalURL.protocol === "webrtc+insecure:" ? "ws:" : "wss:";
    signalURL.searchParams.set("room", pairing.room);
    signalURL.searchParams.set("role", "engine");
    const socket = new this.WebSocketImpl(signalURL.href);
    this.signalSocket = socket;
    socket.addEventListener("message", (event) => {
      this.signalTail = this.signalTail
        .then(() => this.#handleSignalEnvelope(event.data))
        .catch((error) => this.#fail(error));
    });
    socket.addEventListener("error", () => this.#dispatchError("WebRTC signaling error"));
    socket.addEventListener("close", (event) => {
      if (this.readyState < AgentWebRTCTransport.CLOSING) {
        this.#finishClose(event.code || 1006, "WebRTC signaling closed", false);
      }
    });
  }

  async #encrypt(signal) {
    const iv = this.cryptoImpl.getRandomValues(new Uint8Array(12));
    const encrypted = await this.cryptoImpl.subtle.encrypt(
      { name: "AES-GCM", iv }, this.key, encoder.encode(JSON.stringify(signal)),
    );
    const envelope = new Uint8Array(iv.length + encrypted.byteLength);
    envelope.set(iv);
    envelope.set(new Uint8Array(encrypted), iv.length);
    return base64urlEncode(envelope);
  }

  async #decrypt(payload) {
    const envelope = base64urlDecode(payload);
    if (envelope.byteLength < 29) throw new Error("Invalid encrypted WebRTC signal");
    const plain = await this.cryptoImpl.subtle.decrypt(
      { name: "AES-GCM", iv: envelope.subarray(0, 12) }, this.key, envelope.subarray(12),
    );
    return JSON.parse(decoder.decode(plain));
  }

  async #sendSignal(signal) {
    if (this.signalSocket?.readyState !== (this.WebSocketImpl.OPEN ?? 1)) return;
    this.signalSocket.send(JSON.stringify({ type: "signal", payload: await this.#encrypt(signal) }));
  }

  async #handleSignalEnvelope(raw) {
    const envelope = JSON.parse(typeof raw === "string" ? raw : "");
    if (envelope?.type !== "signal" || typeof envelope.payload !== "string") return;
    const signal = await this.#decrypt(envelope.payload);
    if (signal.type === "offer") {
      await this.#acceptOffer(signal.sdp);
    } else if (signal.type === "candidate" && signal.candidate) {
      if (this.peer?.remoteDescription) await this.peer.addIceCandidate(signal.candidate);
      else this.pendingCandidates.push(signal.candidate);
    }
  }

  async #acceptOffer(sdp) {
    const previousPeer = this.peer;
    this.peer = null;
    previousPeer?.close();
    const peer = new this.RTCPeerConnectionImpl({ iceServers: ICE_SERVERS });
    this.peer = peer;
    peer.addEventListener("icecandidate", (event) => {
      if (event.candidate) void this.#sendSignal({ type: "candidate", candidate: event.candidate.toJSON() });
    });
    peer.addEventListener("connectionstatechange", () => {
      if (peer !== this.peer) return;
      if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        this.#finishClose(1006, `WebRTC peer ${peer.connectionState}`, false);
      }
    });
    peer.addEventListener("datachannel", (event) => this.#bindChannel(event.channel));
    await peer.setRemoteDescription({ type: "offer", sdp });
    for (const candidate of this.pendingCandidates.splice(0)) await peer.addIceCandidate(candidate);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await this.#sendSignal({ type: "answer", sdp: answer.sdp });
  }

  #bindChannel(channel) {
    if (channel.label !== CHANNEL_LABEL || channel.protocol !== CHANNEL_PROTOCOL || !channel.ordered) {
      channel.close();
      this.#fail(new Error("Bridge opened an incompatible WebRTC data channel"));
      return;
    }
    this.channel = channel;
    channel.addEventListener("open", () => {
      if (this.readyState !== AgentWebRTCTransport.CONNECTING) return;
      this.readyState = AgentWebRTCTransport.OPEN;
      this.dispatchEvent(eventWith("open"));
    });
    channel.addEventListener("message", (event) => {
      this.dispatchEvent(eventWith("message", { data: event.data }));
    });
    channel.addEventListener("error", (event) => this.#dispatchError(
      event.error?.message ? `WebRTC data channel error: ${event.error.message}`
        : "WebRTC data channel error",
    ));
    channel.addEventListener("close", () => this.#finishClose(1000, "WebRTC data channel closed", true));
  }

  #dispatchError(message) {
    this.dispatchEvent(eventWith("error", { message }));
  }

  #fail(error) {
    this.#dispatchError(error?.message ?? String(error));
    this.#finishClose(1006, error?.message ?? "WebRTC transport failed", false);
  }

  #finishClose(code, reason, wasClean) {
    if (this.readyState === AgentWebRTCTransport.CLOSED) return;
    this.readyState = AgentWebRTCTransport.CLOSED;
    this.channel?.close();
    this.peer?.close();
    if (this.signalSocket?.readyState < (this.WebSocketImpl.CLOSING ?? 2)) this.signalSocket.close();
    this.dispatchEvent(eventWith("close", { code, reason, wasClean }));
  }

  send(data) {
    if (this.readyState !== AgentWebRTCTransport.OPEN) throw new Error("WebRTC transport is not open");
    this.channel.send(data);
  }

  close(code = 1000, reason = "") {
    if (this.readyState >= AgentWebRTCTransport.CLOSING) return;
    this.readyState = AgentWebRTCTransport.CLOSING;
    this.channel?.close();
    this.#finishClose(code, reason, true);
  }
}

export function createAgentTransport(config, options = {}) {
  if (new URL(config.url).protocol.startsWith("webrtc")) {
    return new AgentWebRTCTransport(config.url, config.token, options);
  }
  return new (options.WebSocketImpl ?? globalThis.WebSocket)(config.url, [CHANNEL_PROTOCOL]);
}
