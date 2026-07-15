import assert from "node:assert/strict";
import {
  SHARED_MULTIPLAYER_NETWORK_STATE,
  createSharedMultiplayerNetworkStatus,
  formatMultiplayerNetworkStatus,
  readSharedMultiplayerNetworkStatus,
  writeSharedMultiplayerNetworkStatus,
} from "./multiplayer-network-status.mjs";
import { createSharedUdpBridge } from "./udp_realm_bridge.mjs";

const channel = createSharedMultiplayerNetworkStatus(128);
assert.equal(writeSharedMultiplayerNetworkStatus(channel,
  "Discovery: connecting | Relay: relay.newshoes.gg"), 48);
assert.equal(readSharedMultiplayerNetworkStatus(channel),
  "Discovery: connecting | Relay: relay.newshoes.gg");

const bridge = createSharedUdpBridge({ capacity: 2, maxBytes: 64 });
assert.equal(new Int32Array(bridge.state).length,
  SHARED_MULTIPLAYER_NETWORK_STATE.WORDS);
writeSharedMultiplayerNetworkStatus(bridge.networkStatus, "Discovery: offline");
assert.equal(readSharedMultiplayerNetworkStatus(bridge.networkStatus), "Discovery: offline");

assert.equal(formatMultiplayerNetworkStatus({
  phase: "connecting",
  configuration: { room: "default-room", relayUrls: null },
}), "Discovery: connecting | Relay: relay.newshoes.gg | Room: default-room");

assert.equal(formatMultiplayerNetworkStatus({
  phase: "online",
  endpoint: {
    projectRelay: "wss://relay.newshoes.gg/nostr",
    room: "default-room",
    discoveryConnected: true,
    openRelays: 1,
    relays: [{ state: 1 }],
    openPeers: 1,
    peerCount: 2,
  },
}), "Discovery: online | Relay: relay.newshoes.gg (1/1) | Peers: 1/2 | Room: default-room");

assert.match(formatMultiplayerNetworkStatus({
  phase: "error",
  error: "Trystero discovery relay timed out after 20000ms",
}), /^Discovery: offline \| Relay: relay\.newshoes\.gg \| Trystero discovery relay timed out/);
assert.match(formatMultiplayerNetworkStatus({
  phase: "error",
  error: "Trystero discovery relay timed out after 20000ms",
}), /Select Reconnect$/);

console.log("multiplayer network status unit: PASS");
