import assert from "node:assert/strict";
import { NetworkDiagnosticsRecorder } from "./network-diagnostics.mjs";
import {
  createSharedUdpPortDemultiplexer,
  createSharedUdpRing,
  dequeueSharedUdpDatagram,
  enqueueSharedUdpDatagram,
} from "./udp_realm_bridge.mjs";

const recorder = new NetworkDiagnosticsRecorder({
  packets: 2,
  packetBytes: 4,
  events: 2,
  rtcSamples: 1,
  engineSamples: 1,
});
assert.equal(recorder.recordPacket({ bytes: Uint8Array.of(1) }), null);
recorder.setEnabled(true, { reason: "unit" });
recorder.recordPacket({
  direction: "send",
  phase: "datachannel.send",
  traceId: "out-1",
  bytes: Uint8Array.of(0x00, 0x7f, 0xff),
  sourceIp: 1,
  sourcePort: 8088,
  destinationIp: 2,
  destinationPort: 8088,
});
recorder.recordPacket({ direction: "receive", bytes: Uint8Array.of(4, 5) });
recorder.recordEvent("bridge.dequeue", { traceId: "in-1" });
recorder.recordRtcSample({ peers: [{ currentRoundTripTime: 0.004 }] });
recorder.recordEngineSample({ frame: { logicFrame: 12 }, network: { frameDataReady: false } });
const snapshot = recorder.snapshot();
assert.equal(snapshot.packets.length, 1);
assert.equal(snapshot.packets[0].payloadHex, "0405");
assert.equal(snapshot.evicted.packets, 1);
assert.equal(snapshot.evicted.packetBytes, 3);
assert.equal(snapshot.complete, false);
assert.equal(snapshot.rtcSamples.length, 1);
assert.equal(snapshot.engineSamples[0].network.frameDataReady, false);

const ring = createSharedUdpRing({ capacity: 2, maxBytes: 16 });
const queuedAtUs = 1_783_872_550_123_456;
assert.equal(enqueueSharedUdpDatagram(ring, {
  bytes: Uint8Array.of(9, 8, 7),
  ip: 0x0a000002,
  port: 8088,
  sourceIp: 0x0a000001,
  sourcePort: 8088,
  destinationPort: 8088,
  bridgeSequence: 42,
  bridgeQueuedAtUs: queuedAtUs,
}), true);
const datagram = dequeueSharedUdpDatagram(ring);
assert.deepEqual([...datagram.bytes], [9, 8, 7]);
assert.equal(datagram.bridgeSequence, 42);
assert.equal(datagram.bridgeQueuedAtUs, queuedAtUs);

const multiplexedRing = createSharedUdpRing({ capacity: 8, maxBytes: 16 });
const demultiplexEvents = [];
const demultiplexer = createSharedUdpPortDemultiplexer(multiplexedRing, {
  onEvent: (type, detail) => demultiplexEvents.push({ type, detail }),
});
for (const [bridgeSequence, destinationPort, value] of [
  [1, 8086, 6],
  [2, 8088, 8],
  [3, 8086, 7],
  [4, 8088, 9],
]) {
  assert.equal(enqueueSharedUdpDatagram(multiplexedRing, {
    bytes: Uint8Array.of(value),
    ip: 1,
    port: destinationPort,
    sourceIp: 2,
    sourcePort: destinationPort,
    destinationPort,
    bridgeSequence,
  }), true);
}
const gameOne = demultiplexer.receive({ capacity: 16, port: 8088 });
const gameTwo = demultiplexer.receive({ capacity: 16, port: 8088 });
const lobbyOne = demultiplexer.receive({ capacity: 16, port: 8086 });
const lobbyTwo = demultiplexer.receive({ capacity: 16, port: 8086 });
assert.deepEqual([gameOne.bridgeSequence, gameTwo.bridgeSequence], [2, 4]);
assert.deepEqual([lobbyOne.bridgeSequence, lobbyTwo.bridgeSequence], [1, 3]);
assert.deepEqual([...gameOne.bytes, ...gameTwo.bytes], [8, 9]);
assert.deepEqual([...lobbyOne.bytes, ...lobbyTwo.bytes], [6, 7]);
assert.equal(demultiplexer.receive({ capacity: 16, port: 8088 }), null);
assert.deepEqual(demultiplexer.snapshot(), {
  deferredCount: 0,
  maxDeferred: 8,
  maxDeferredAgeMs: 30000,
  ports: [],
});
assert.deepEqual(demultiplexEvents.map((event) => [
  event.type,
  event.detail.bridgeSequence,
  event.detail.destinationPort,
]), [
  ["bridge.incoming.deferred-for-port", 1, 8086],
  ["bridge.incoming.deferred-for-port", 3, 8086],
]);

let demultiplexNow = 0;
const expiringRing = createSharedUdpRing({ capacity: 2, maxBytes: 16 });
const expirationEvents = [];
const expiringDemultiplexer = createSharedUdpPortDemultiplexer(expiringRing, {
  maxDeferredAgeMs: 100,
  now: () => demultiplexNow,
  onEvent: (type, detail) => expirationEvents.push({ type, detail }),
});
assert.equal(enqueueSharedUdpDatagram(expiringRing, {
  bytes: Uint8Array.of(6),
  ip: 1,
  port: 8086,
  sourceIp: 2,
  sourcePort: 8086,
  destinationPort: 8086,
  bridgeSequence: 5,
}), true);
assert.equal(expiringDemultiplexer.receive({ capacity: 16, port: 8088 }), null);
demultiplexNow = 100;
assert.equal(expiringDemultiplexer.receive({ capacity: 16, port: 8088 }), null);
assert.equal(expiringDemultiplexer.snapshot().deferredCount, 0);
assert.equal(expirationEvents.at(-1).type, "bridge.incoming.deferred-expired");
assert.equal(expirationEvents.at(-1).detail.traceId, "in-5");

console.log("network diagnostics unit checks passed");
