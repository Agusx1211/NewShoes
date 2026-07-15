import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extractBestRetailIco,
  extractBestRetailPeIcon,
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

function syntheticIconDib(size, red) {
  const pixels = size * size * 4;
  const mask = size * Math.ceil(size / 32) * 4;
  const bytes = new Uint8Array(40 + pixels + mask);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 40, true);
  view.setInt32(4, size, true);
  view.setInt32(8, size * 2, true);
  view.setUint16(12, 1, true);
  view.setUint16(14, 32, true);
  view.setUint32(20, pixels, true);
  for (let offset = 40; offset < 40 + pixels; offset += 4) {
    bytes[offset] = 0x35;
    bytes[offset + 1] = 0x72;
    bytes[offset + 2] = red;
    bytes[offset + 3] = 0xff;
  }
  return bytes;
}

function syntheticIco() {
  const frames = [syntheticIconDib(16, 0x90), syntheticIconDib(32, 0xe0)];
  const directoryEnd = 6 + frames.length * 16;
  const bytes = new Uint8Array(directoryEnd + frames.reduce((sum, frame) => sum + frame.length, 0));
  const view = new DataView(bytes.buffer);
  view.setUint16(2, 1, true);
  view.setUint16(4, frames.length, true);
  let frameOffset = directoryEnd;
  frames.forEach((frame, index) => {
    const cursor = 6 + index * 16;
    const size = index ? 32 : 16;
    bytes[cursor] = size;
    bytes[cursor + 1] = size;
    view.setUint16(cursor + 4, 1, true);
    view.setUint16(cursor + 6, 32, true);
    view.setUint32(cursor + 8, frame.length, true);
    view.setUint32(cursor + 12, frameOffset, true);
    bytes.set(frame, frameOffset);
    frameOffset += frame.length;
  });
  return new Blob([bytes], { type: "image/x-icon" });
}

function syntheticPeIcon() {
  const frame = syntheticIconDib(32, 0xd8);
  const rawOffset = 0x200;
  const resourceRva = 0x1000;
  const frameOffset = 0xc0;
  const resourceSize = frameOffset + frame.length;
  const bytes = new Uint8Array(rawOffset + resourceSize);
  const view = new DataView(bytes.buffer);
  bytes.set([0x4d, 0x5a], 0);
  view.setUint32(0x3c, 0x80, true);
  bytes.set([0x50, 0x45, 0, 0], 0x80);
  view.setUint16(0x84, 0x14c, true);
  view.setUint16(0x86, 1, true);
  view.setUint16(0x94, 0xe0, true);
  const optional = 0x98;
  view.setUint16(optional, 0x10b, true);
  view.setUint32(optional + 92, 16, true);
  view.setUint32(optional + 112, resourceRva, true);
  view.setUint32(optional + 116, resourceSize, true);
  const section = optional + 0xe0;
  bytes.set(new TextEncoder().encode(".rsrc"), section);
  view.setUint32(section + 8, resourceSize, true);
  view.setUint32(section + 12, resourceRva, true);
  view.setUint32(section + 16, resourceSize, true);
  view.setUint32(section + 20, rawOffset, true);
  const resourceView = new DataView(bytes.buffer, rawOffset);
  const writeDirectory = (offset, entries) => {
    resourceView.setUint16(offset + 14, entries.length, true);
    entries.forEach(([id, child, directory], index) => {
      resourceView.setUint32(offset + 16 + index * 8, id, true);
      resourceView.setUint32(offset + 20 + index * 8, child | (directory ? 0x80000000 : 0), true);
    });
  };
  writeDirectory(0x00, [[3, 0x20, true], [14, 0x60, true]]);
  writeDirectory(0x20, [[1, 0x38, true]]);
  writeDirectory(0x38, [[0x409, 0x50, false]]);
  resourceView.setUint32(0x50, resourceRva + frameOffset, true);
  resourceView.setUint32(0x54, frame.length, true);
  writeDirectory(0x60, [[1, 0x78, true]]);
  writeDirectory(0x78, [[0x409, 0x90, false]]);
  resourceView.setUint32(0x90, resourceRva + 0xa0, true);
  resourceView.setUint32(0x94, 20, true);
  resourceView.setUint16(0xa2, 1, true);
  resourceView.setUint16(0xa4, 1, true);
  bytes[rawOffset + 0xa6] = 32;
  bytes[rawOffset + 0xa7] = 32;
  resourceView.setUint16(0xaa, 1, true);
  resourceView.setUint16(0xac, 32, true);
  resourceView.setUint32(0xae, frame.length, true);
  resourceView.setUint16(0xb2, 1, true);
  bytes.set(frame, rawOffset + frameOffset);
  return new Blob([bytes], { type: "application/vnd.microsoft.portable-executable" });
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
  assert.match(key, /^retail-art-v2-[a-f0-9]{8}$/);
  assert.notEqual(key, retailPresentationKey([{ name: "EnglishZH.big", bytes: 1235, entryCount: 9 }]));
}

{
  const ico = await extractBestRetailIco(syntheticIco());
  assert.deepEqual(ico.image, { width: 32, height: 32, bitsPerPixel: 32, encoding: "dib" });
  assert.equal(ico.blob.type, "image/x-icon");
  const pe = await extractBestRetailPeIcon(syntheticPeIcon());
  assert.deepEqual(pe.image, { width: 32, height: 32, bitsPerPixel: 32, encoding: "dib" });
  assert.equal(pe.blob.type, "image/x-icon");
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
  const [html, presentationSource, launcherSource, buildInfoSource, entrySource] = await Promise.all([
    readFile(new URL("./play.html", import.meta.url), "utf8"),
    readFile(new URL("./launcher-retail-presentation.mjs", import.meta.url), "utf8"),
    readFile(new URL("./launcher.js", import.meta.url), "utf8"),
    readFile(new URL("./launcher-build-info.js", import.meta.url), "utf8"),
    readFile(new URL("./launcher-entry.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(html, /data-open-settings="game"/);
  assert.match(html, /data-bink-video-sidecars="auto"/);
  assert.match(html, /id="includeVideosToggle"[^>]*disabled/);
  assert.match(html, /id="includeVideosDescription">Checking video playback support/);
  assert.match(html, /I purchased and installed it online/);
  assert.match(html, /I own the original discs/);
  assert.match(html, /id="pickFolderFallbackButton"/);
  assert.match(html, /Windows blocked the Steam folder\? Use compatibility folder picker/);
  assert.match(html, /nested <code>ZH_Generals<\/code>/);
  assert.match(html, /store\.steampowered\.com\/bundle\/39394/);
  assert.match(html, /ea\.com\/games\/command-and-conquer\/command-and-conquer-the-ultimate-collection/);
  assert.match(html, /id="endSessionButton"[^>]*>[\s\S]*Shut down/);
  assert.match(html, /data-github-shortcut[^>]*href="https:\/\/github\.com\/Agusx1211\/NewShoes"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /data-github-shortcut[^>]*data-single-activation-shortcut/);
  assert.match(html, /id="i-github"/);
  assert.match(html, /id="aboutVersion"/);
  assert.match(html, /id="aboutBuildCommit"/);
  assert.match(html, /id="aboutChangelog"/);
  assert.match(entrySource, /import "\.\/launcher-build-info\.js"/);
  assert.match(buildInfoSource, /new URL\("\.\/build-info\.json", import\.meta\.url\)/);
  assert.match(buildInfoSource, /PROJECT_URL = "https:\/\/github\.com\/Agusx1211\/NewShoes"/);
  assert.match(buildInfoSource, /\$\{PROJECT_URL\}\/commit\/\$\{commit\}/);
  assert.match(launcherSource, /probeBinkVideoSupport/);
  assert.match(launcherSource, /Zero Hour will launch without movies/);
  assert.match(html, /data-retail-banner/);
  assert.match(html, /data-retail-icon/);
  assert.doesNotMatch(html, /data-retail-presentation(?:\s|=)/);
  assert.doesNotMatch(presentationSource, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/,
    "retail presentation derivation must remain browser-local");
  assert.match(launcherSource, /data-single-activation-shortcut[\s\S]*event\.detail > 1[\s\S]*event\.preventDefault\(\)/,
    "desktop external shortcuts must coalesce the second click of a double-click");
  assert.match(launcherSource, /pickFolderFallbackButton[\s\S]*folderInput[\s\S]*\.click\(\)/,
    "the Program Files compatibility path must open the webkitdirectory picker");
}

process.stdout.write("launcher polish smoke: OK\n");
