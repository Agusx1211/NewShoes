import assert from "node:assert/strict";
import {
  P2P_AUTO_CONNECT_ENABLED,
  shouldAutoConnectP2p,
} from "./multiplayer_launch_policy.mjs";

assert.equal(P2P_AUTO_CONNECT_ENABLED, false);
assert.equal(shouldAutoConnectP2p("default-room"), false,
  "the default room must not start P2P discovery during game launch");
assert.equal(shouldAutoConnectP2p("private-room"), false,
  "an explicitly entered room must not block launch while P2P is disabled");

console.log("multiplayer launch policy unit passed");
