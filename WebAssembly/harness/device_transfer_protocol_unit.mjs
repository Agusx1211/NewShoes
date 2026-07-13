import assert from "node:assert/strict";
import {
  deriveTransferKey,
  formatTransferPin,
  generateTransferPin,
  normalizeTransferPin,
  openTransferMessage,
  sealTransferMessage,
} from "./device-transfer-protocol.mjs";

for (let index = 0; index < 100; index += 1) {
  assert.match(generateTransferPin(), /^\d{12}$/);
}
assert.equal(formatTransferPin("123456789012"), "1234 5678 9012");
assert.equal(formatTransferPin("1234-5678 9012 more"), "1234 5678 9012");
assert.equal(normalizeTransferPin("1234 5678 9012"), "123456789012");
assert.throws(() => normalizeTransferPin("1234"), /12-digit/);

const key = await deriveTransferKey("1234 5678 9012");
const payload = new Uint8Array([0, 1, 2, 3, 254, 255]);
const envelope = await sealTransferMessage(key, {
  type: "chunk",
  fileId: "archive-1",
  offset: 42,
}, payload);
const exposesPayload = envelope.some((_, offset) =>
  offset + payload.length <= envelope.length
  && payload.every((byte, index) => envelope[offset + index] === byte));
assert.equal(exposesPayload, false, "ciphertext must not expose the plaintext payload");
const opened = await openTransferMessage(key, envelope);
assert.deepEqual(opened.message, { type: "chunk", fileId: "archive-1", offset: 42 });
assert.deepEqual(opened.payload, payload);

const wrongKey = await deriveTransferKey("9999 8888 7777");
await assert.rejects(() => openTransferMessage(wrongKey, envelope), /operation|decrypt/i);
const tampered = envelope.slice();
tampered[tampered.length - 1] ^= 1;
await assert.rejects(() => openTransferMessage(key, tampered), /operation|decrypt/i);

console.log("device transfer protocol unit: PASS");
