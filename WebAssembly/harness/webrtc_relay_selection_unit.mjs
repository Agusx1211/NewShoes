#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  DEFAULT_MULTIPLAYER_NOSTR_RELAYS,
  PROJECT_NOSTR_RELAY,
  hybridNostrRelayUrls,
} from "./webrtc-udp-endpoint.mjs";

assert.equal(DEFAULT_MULTIPLAYER_NOSTR_RELAYS.length, 5);
assert.equal(DEFAULT_MULTIPLAYER_NOSTR_RELAYS[0], PROJECT_NOSTR_RELAY);
assert.equal(new Set(DEFAULT_MULTIPLAYER_NOSTR_RELAYS).size,
  DEFAULT_MULTIPLAYER_NOSTR_RELAYS.length);
assert(DEFAULT_MULTIPLAYER_NOSTR_RELAYS.slice(1).every((url) => /^wss:\/\//.test(url)));
assert.deepEqual(hybridNostrRelayUrls("project-new-shoes-lan-v1"),
  DEFAULT_MULTIPLAYER_NOSTR_RELAYS);
assert.notDeepEqual(hybridNostrRelayUrls("project-new-shoes-library-transfer-v1").slice(1),
  DEFAULT_MULTIPLAYER_NOSTR_RELAYS.slice(1));
assert.throws(() => hybridNostrRelayUrls("", 4), /application ID/);
assert.throws(() => hybridNostrRelayUrls("valid", 0), /at least one public relay/);

console.log("WebRTC hybrid Nostr relay selection: PASS");
