import assert from "node:assert/strict";
import { NetworkDiagnosticsRecorder } from "./network-diagnostics.mjs";
import {
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

console.log("network diagnostics unit checks passed");
