import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extractRetailPresentationFromBig,
  retailPresentationKey,
  retailPresentationSource,
} from "./launcher-retail-presentation.mjs";
import { PROJECT_GITHUB_URL, requestOsShutdown } from "./launcher-os-shutdown.mjs";

function writeU32be(bytes, offset, value) {
  bytes[offset] = value >>> 24;
  bytes[offset + 1] = value >>> 16;
  bytes[offset + 2] = value >>> 8;
  bytes[offset + 3] = value;
}

function syntheticBmp() {
  const width = 16;
  const height = 16;
  const rowBytes = width * 3;
  const bytes = new Uint8Array(54 + rowBytes * height);
  bytes.set([0x42, 0x4d]);
  new DataView(bytes.buffer).setUint32(2, bytes.length, true);
  new DataView(bytes.buffer).setUint32(10, 54, true);
  new DataView(bytes.buffer).setUint32(14, 40, true);
  new DataView(bytes.buffer).setInt32(18, width, true);
  new DataView(bytes.buffer).setInt32(22, height, true);
  new DataView(bytes.buffer).setUint16(26, 1, true);
  new DataView(bytes.buffer).setUint16(28, 24, true);
  new DataView(bytes.buffer).setUint32(34, rowBytes * height, true);
  for (let offset = 54; offset < bytes.length; offset += 3) {
    bytes.set([0x26, 0x72, 0xc2], offset);
  }
  return bytes;
}

function syntheticBig(path, payload) {
  const pathBytes = new TextEncoder().encode(path);
  const dataOffset = 16 + 8 + pathBytes.length + 1;
  const bytes = new Uint8Array(dataOffset + payload.length);
  bytes.set(new TextEncoder().encode("BIGF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length, true);
  writeU32be(bytes, 8, 1);
  writeU32be(bytes, 16, dataOffset);
  writeU32be(bytes, 20, payload.length);
  bytes.set(pathBytes, 24);
  bytes[dataOffset - 1] = 0;
  bytes.set(payload, dataOffset);
  return new Blob([bytes], { type: "application/octet-stream" });
}

{
  const source = retailPresentationSource;
  const result = await extractRetailPresentationFromBig(syntheticBig(source.entry, syntheticBmp()));
  assert.equal(result.archive, "EnglishZH.big");
  assert.equal(result.entry, "Data\\English\\Install_Final.bmp");
  assert.deepEqual(result.image, { width: 16, height: 16, bitsPerPixel: 24 });
  assert.equal(result.blob.type, "image/bmp");
  assert.equal(result.blob.size, syntheticBmp().length);
  const key = retailPresentationKey([{ name: "EnglishZH.big", bytes: 1234, entryCount: 9 }]);
  assert.match(key, /^retail-art-v1-[a-f0-9]{8}$/);
  assert.notEqual(key, retailPresentationKey([{ name: "EnglishZH.big", bytes: 1235, entryCount: 9 }]));
}

{
  const events = [];
  let redirect = null;
  const result = requestOsShutdown({
    gameRunning: false,
    storageBusy: false,
    closeWindow: () => events.push("close"),
    navigate: (url) => { redirect = url; events.push("redirect"); },
    schedule: (callback, delay) => { events.push(`wait:${delay}`); callback(); },
    isDocumentHidden: () => false,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(events, ["close", "wait:450", "redirect"]);
  assert.equal(redirect, PROJECT_GITHUB_URL);
  const blockedEvents = [];
  assert.equal(requestOsShutdown({
    gameRunning: true,
    storageBusy: false,
    closeWindow: () => blockedEvents.push("close"),
    navigate: () => blockedEvents.push("navigate"),
    schedule: () => blockedEvents.push("schedule"),
    isDocumentHidden: () => false,
  }).reason, "game-running");
  assert.deepEqual(blockedEvents, [], "OS shutdown must not close or redirect a running game");
  assert.equal(requestOsShutdown({
    gameRunning: false, storageBusy: true, closeWindow() {}, navigate() {}, schedule() {}, isDocumentHidden: () => false,
  }).reason, "storage-busy");
}

{
  const [html, presentationSource] = await Promise.all([
    readFile(new URL("./play.html", import.meta.url), "utf8"),
    readFile(new URL("./launcher-retail-presentation.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-open-settings="game"/);
  assert.match(html, /I purchased and installed it online/);
  assert.match(html, /I own the original discs/);
  assert.match(html, /store\.steampowered\.com\/bundle\/39394/);
  assert.match(html, /ea\.com\/games\/command-and-conquer\/command-and-conquer-the-ultimate-collection/);
  assert.match(html, /id="endSessionButton"[^>]*>[\s\S]*Shut down/);
  assert.doesNotMatch(presentationSource, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/,
    "retail presentation derivation must remain browser-local");
}

process.stdout.write("launcher polish smoke: OK\n");
