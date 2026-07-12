import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  P2P_AUTO_CONNECT_ENABLED,
  registerP2pBestEffort,
  shouldAutoConnectP2p,
} from "./multiplayer_launch_policy.mjs";

assert.equal(P2P_AUTO_CONNECT_ENABLED, true);
assert.equal(shouldAutoConnectP2p("default-room"), true);
assert.equal(shouldAutoConnectP2p(""), false);

const successCalls = [];
const success = await registerP2pBestEffort({
  rpc: async (command, payload) => {
    successCalls.push({ command, payload });
    return { ok: true, runtime: { endpoint: { localIp: 0x0a000001 } } };
  },
  room: "default-room",
  peerId: "GeneralTest",
  displayName: "GeneralTest",
});
assert.equal(success.ok, true);
assert.equal(successCalls.length, 1);
assert.equal(successCalls[0].command, "browserWebRtcEndpointConnect");
assert.equal(successCalls[0].payload.room, "default-room");

const failureCalls = [];
const failure = await registerP2pBestEffort({
  rpc: async (command) => {
    failureCalls.push(command);
    return command === "browserWebRtcEndpointConnect"
      ? { ok: false, error: "relay unavailable", runtime: { enabled: true } }
      : { ok: true };
  },
  room: "default-room",
});
await Promise.resolve();
assert.deepEqual(failureCalls, [
  "browserWebRtcEndpointConnect",
  "browserWebRtcEndpointDisconnect",
]);
assert.deepEqual(failure, {
  ok: false,
  skipped: false,
  error: "relay unavailable",
  runtime: { enabled: true },
  cleanupStarted: true,
});

const rejectionCalls = [];
const rejection = await registerP2pBestEffort({
  rpc: async (command) => {
    rejectionCalls.push(command);
    if (command === "browserWebRtcEndpointConnect") throw new Error("registration rejected");
    return { ok: true };
  },
  room: "default-room",
});
await Promise.resolve();
assert.equal(rejection.ok, false);
assert.equal(rejection.error, "registration rejected");
assert.deepEqual(rejectionCalls, [
  "browserWebRtcEndpointConnect",
  "browserWebRtcEndpointDisconnect",
]);

const timeoutCalls = [];
const timeoutAttempt = registerP2pBestEffort({
  rpc: (command) => {
    timeoutCalls.push(command);
    if (command === "browserWebRtcEndpointConnect") return new Promise(() => {});
    return Promise.resolve({ ok: true });
  },
  room: "default-room",
  timeoutMs: 10,
});
const timedOut = await timeoutAttempt;
await Promise.resolve();
assert.equal(timedOut.ok, false);
assert.match(timedOut.error, /timed out after 10ms/);
assert.deepEqual(timeoutCalls, [
  "browserWebRtcEndpointConnect",
  "browserWebRtcEndpointDisconnect",
]);

const playSource = await readFile(new URL("./play.mjs", import.meta.url), "utf8");
assert.match(playSource, /void registerP2pBestEffort\(/,
  "game startup must launch P2P registration without awaiting it");
assert.doesNotMatch(playSource, /await registerP2pBestEffort\(/,
  "game startup must never await P2P registration");

console.log("multiplayer launch policy unit passed");
