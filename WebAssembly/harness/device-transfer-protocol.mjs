export const DEVICE_TRANSFER_APP_ID = "project-new-shoes-device-transfer-v1";
export const DEVICE_TRANSFER_VERSION = 2;
export const DEVICE_TRANSFER_CHUNK_BYTES = 64 * 1024;
export const DEVICE_TRANSFER_CHECKPOINT_BYTES = 2 * 1024 * 1024;

const PIN_DIGITS = 12;
const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const HEADER_LENGTH_BYTES = 4;
const PBKDF2_ITERATIONS = 250_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const envelopeContext = textEncoder.encode(`${DEVICE_TRANSFER_APP_ID}:envelope-v1`);

function asBytes(value) {
  if (value == null) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Transfer payload must be binary data");
}

export function normalizeTransferPin(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== PIN_DIGITS) {
    throw new Error("Enter the complete 12-digit transfer code");
  }
  return digits;
}

export function formatTransferPin(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, PIN_DIGITS);
  return digits.match(/.{1,4}/g)?.join(" ") ?? "";
}

export function generateTransferPin(random = crypto) {
  const digits = [];
  const batch = new Uint8Array(24);
  while (digits.length < PIN_DIGITS) {
    random.getRandomValues(batch);
    for (const byte of batch) {
      // Rejection sampling avoids modulo bias while retaining leading zeroes.
      if (byte < 250) digits.push(String(byte % 10));
      if (digits.length === PIN_DIGITS) break;
    }
  }
  return digits.join("");
}

export async function deriveTransferKey(pin, subtle = crypto.subtle) {
  const normalized = normalizeTransferPin(pin);
  const material = await subtle.importKey(
    "raw",
    textEncoder.encode(normalized),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey({
    name: "PBKDF2",
    salt: textEncoder.encode(`${DEVICE_TRANSFER_APP_ID}:${normalized}`),
    iterations: PBKDF2_ITERATIONS,
    hash: "SHA-256",
  }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealTransferMessage(key, message, payload = null, cryptoApi = crypto) {
  const header = textEncoder.encode(JSON.stringify(message));
  if (header.byteLength > 64 * 1024) throw new Error("Transfer message header is too large");
  const bytes = asBytes(payload);
  const plaintext = new Uint8Array(HEADER_LENGTH_BYTES + header.byteLength + bytes.byteLength);
  new DataView(plaintext.buffer).setUint32(0, header.byteLength);
  plaintext.set(header, HEADER_LENGTH_BYTES);
  plaintext.set(bytes, HEADER_LENGTH_BYTES + header.byteLength);
  const iv = cryptoApi.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(await cryptoApi.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: envelopeContext,
  }, key, plaintext));
  const envelope = new Uint8Array(1 + IV_BYTES + ciphertext.byteLength);
  envelope[0] = ENVELOPE_VERSION;
  envelope.set(iv, 1);
  envelope.set(ciphertext, 1 + IV_BYTES);
  return envelope;
}

export async function openTransferMessage(key, value, subtle = crypto.subtle) {
  const envelope = asBytes(value);
  if (envelope.byteLength < 1 + IV_BYTES + 16 || envelope[0] !== ENVELOPE_VERSION) {
    throw new Error("Transfer message envelope is invalid");
  }
  const iv = envelope.subarray(1, 1 + IV_BYTES);
  const plaintext = new Uint8Array(await subtle.decrypt({
    name: "AES-GCM",
    iv,
    additionalData: envelopeContext,
  }, key, envelope.subarray(1 + IV_BYTES)));
  if (plaintext.byteLength < HEADER_LENGTH_BYTES) throw new Error("Transfer message is truncated");
  const headerBytes = new DataView(
    plaintext.buffer,
    plaintext.byteOffset,
    plaintext.byteLength,
  ).getUint32(0);
  if (headerBytes > plaintext.byteLength - HEADER_LENGTH_BYTES) {
    throw new Error("Transfer message header is truncated");
  }
  const message = JSON.parse(textDecoder.decode(
    plaintext.subarray(HEADER_LENGTH_BYTES, HEADER_LENGTH_BYTES + headerBytes),
  ));
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    throw new Error("Transfer message header is invalid");
  }
  return {
    message,
    payload: plaintext.slice(HEADER_LENGTH_BYTES + headerBytes),
  };
}

export function formatTransferBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${Math.round(bytes)} B`;
}

export function formatTransferRate(bytes, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return "0 B/s";
  return `${formatTransferBytes((Number(bytes) || 0) * 1000 / elapsedMs)}/s`;
}
