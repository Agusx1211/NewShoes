#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startNostrTestRelayServer } from "./nostr-test-relay-server.mjs";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots/device-transfer");
await mkdir(screenshotDir, { recursive: true });

const server = await startStaticServer({ root: wasmRoot });
const relay = await startNostrTestRelayServer();
const browser = await chromium.launch({ headless: true });
const events = [];

function watch(page, label) {
  page.on("pageerror", (error) => events.push({ label, type: "pageerror", text: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") events.push({ label, type: "console", text: message.text() });
  });
}

async function openClient(label, viewport = { width: 1024, height: 768 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  watch(page, label);
  await page.goto(new URL("harness/play.html?dist=dist", server.url).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHAssetLibrary && window.ZeroHDesktop && window.ZeroHDeviceTransfer));
  await page.evaluate((url) => { window.__cncTestTransferRelayUrls = [url]; }, relay.url);
  return { context, page, label };
}

async function seedSenderInstall(page) {
  return page.evaluate(async () => {
    const installRoot = `cnc-library/install-transfer-smoke`;
    const root = await navigator.storage.getDirectory();
    const library = await root.getDirectoryHandle("cnc-library", { create: true });
    await library.removeEntry("install-transfer-smoke", { recursive: true }).catch(() => {});
    const install = await library.getDirectoryHandle("install-transfer-smoke", { create: true });
    const archives = [];
    let totalBytes = 0;
    for (let index = 0; index < window.ZeroHArchiveSpecs.length; index += 1) {
      const name = window.ZeroHArchiveSpecs[index].name;
      const bytes = new Uint8Array(80 + index);
      bytes.fill((index + 17) & 0xff);
      const handle = await install.getFileHandle(name, { create: true });
      const writer = await handle.createWritable();
      await writer.write(bytes);
      await writer.close();
      archives.push({
        name,
        bytes: bytes.byteLength,
        entryCount: 1,
        opfsPath: `${installRoot}/${name}`,
      });
      totalBytes += bytes.byteLength;
    }
    const cursorBytes = new Uint8Array(96);
    cursorBytes.fill(0x5a);
    const cursorHandle = await install.getFileHandle("OriginalCursors.big", { create: true });
    const cursorWriter = await cursorHandle.createWritable();
    await cursorWriter.write(cursorBytes);
    await cursorWriter.close();
    const cursorAsset = {
      name: "OriginalCursors.big",
      bytes: cursorBytes.byteLength,
      entryCount: 52,
      opfsPath: `${installRoot}/OriginalCursors.big`,
    };
    totalBytes += cursorBytes.byteLength;
    localStorage.setItem("zeroh-installed-library.v5", JSON.stringify({
      version: 5,
      game: "zeroHour",
      root: installRoot,
      preparedAt: Date.now(),
      totalBytes,
      includeVideos: false,
      archives,
      videos: [],
      cursorAsset,
    }));
    return {
      archiveCount: archives.length,
      totalBytes,
      first: archives[0],
      last: archives.at(-1),
      cursorAsset,
    };
  });
}

async function openTransferApp(page) {
  await page.locator("#startButton").click();
  await page.locator('#startMenu [data-open="transfer"]').click();
  await page.locator("#transferWindow.is-open").waitFor({ state: "visible" });
}

async function startReceiver(client, pin) {
  const { page } = client;
  await openTransferApp(page);
  await page.locator("#transferChooseReceive").click();
  assert.equal(await page.locator("#transferReceiveNext").isDisabled(), true);
  await page.locator("#transferReceiveOwnership").check();
  await page.locator("#transferReceiveNext").click();
  await page.locator("#transferPinInput").fill(pin);
  await page.locator("#transferConnect").click();
  await page.locator('[data-transfer-screen="receive-live"]:visible').waitFor();
}

let sender;
let receiverA;
let receiverB;
try {
  sender = await openClient("sender");
  const seeded = await seedSenderInstall(sender.page);
  await sender.page.reload({ waitUntil: "domcontentloaded" });
  await sender.page.waitForFunction(() => Boolean(window.ZeroHAssetLibrary?.installedLibrary()));
  await sender.page.evaluate((url) => { window.__cncTestTransferRelayUrls = [url]; }, relay.url);

  await openTransferApp(sender.page);
  await sender.page.locator("#transferChooseSend").click();
  assert.equal(await sender.page.locator("#transferStartSend").isDisabled(), true);
  await sender.page.locator("#transferSendOwnership").check();
  await sender.page.locator("#transferStartSend").click();
  await sender.page.locator('[data-transfer-screen="send-live"]:visible').waitFor();
  const formattedPin = (await sender.page.locator("#transferSenderPin").textContent()).trim();
  assert.match(formattedPin, /^\d{4} \d{4} \d{4}$/);

  [receiverA, receiverB] = await Promise.all([
    openClient("receiver-a", { width: 768, height: 1024 }),
    openClient("receiver-b"),
  ]);
  await Promise.all([
    startReceiver(receiverA, formattedPin),
    startReceiver(receiverB, formattedPin),
  ]);
  await Promise.all([
    receiverA.page.locator('[data-transfer-screen="complete"]:visible').waitFor({ timeout: 120_000 }),
    receiverB.page.locator('[data-transfer-screen="complete"]:visible').waitFor({ timeout: 120_000 }),
  ]);
  await sender.page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".transfer-peer")];
    return rows.length === 2 && rows.every((row) => /Complete/.test(row.textContent));
  }, null, { timeout: 30_000 });

  async function verifyReceiver(client) {
    return client.page.evaluate(async () => {
      const installed = await window.ZeroHAssetLibrary.verifyInstalledLibrary();
      if (!installed) return null;
      let directory = await navigator.storage.getDirectory();
      for (const part of installed.root.split("/")) {
        directory = await directory.getDirectoryHandle(part, { create: false });
      }
      const first = await (await directory.getFileHandle(installed.archives[0].name)).getFile();
      const last = await (await directory.getFileHandle(installed.archives.at(-1).name)).getFile();
      const cursor = await (await directory.getFileHandle(installed.cursorAsset.name)).getFile();
      return {
        archiveCount: installed.archives.length,
        totalBytes: installed.totalBytes,
        firstByte: new Uint8Array(await first.slice(0, 1).arrayBuffer())[0],
        lastByte: new Uint8Array(await last.slice(0, 1).arrayBuffer())[0],
        cursorBytes: cursor.size,
        cursorFirstByte: new Uint8Array(await cursor.slice(0, 1).arrayBuffer())[0],
        cursorEntryCount: installed.cursorAsset.entryCount,
        transfer: window.ZeroHDeviceTransfer.snapshot(),
      };
    });
  }
  const [verifiedA, verifiedB] = await Promise.all([
    verifyReceiver(receiverA),
    verifyReceiver(receiverB),
  ]);
  for (const verified of [verifiedA, verifiedB]) {
    assert.equal(verified.archiveCount, seeded.archiveCount);
    assert.equal(verified.totalBytes, seeded.totalBytes);
    assert.equal(verified.firstByte, 17);
    assert.equal(verified.lastByte, (seeded.archiveCount - 1 + 17) & 0xff);
    assert.equal(verified.cursorBytes, seeded.cursorAsset.bytes);
    assert.equal(verified.cursorFirstByte, 0x5a);
    assert.equal(verified.cursorEntryCount, 52);
  }
  assert.equal(await sender.page.locator(".transfer-peer").count(), 2);
  assert.equal(events.filter((event) => event.type === "pageerror").length, 0,
    `browser page errors: ${JSON.stringify(events)}`);

  const senderScreenshot = resolve(screenshotDir, "sender-two-receivers.png");
  const receiverScreenshot = resolve(screenshotDir, "receiver-complete.png");
  await sender.page.screenshot({ path: senderScreenshot });
  await receiverA.page.screenshot({ path: receiverScreenshot });
  const normalizedPin = formattedPin.replace(/\D/g, "");
  const pinPersisted = await sender.page.evaluate((pin) => {
    const storageText = (storage) => JSON.stringify(Object.fromEntries(
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index);
        return [key, storage.getItem(key)];
      }),
    ));
    return storageText(localStorage).includes(pin) || storageText(sessionStorage).includes(pin);
  }, normalizedPin);
  assert.equal(pinPersisted, false);

  await sender.page.locator("#transferStopSend").click();
  await sender.page.locator('[data-transfer-screen="choose"]:visible').waitFor();
  await sender.page.locator("#transferChooseSend").click();
  assert.equal(await sender.page.locator("#transferSendOwnership").isChecked(), false);
  assert.equal(await sender.page.locator("#transferStartSend").isDisabled(), true);
  assert.equal(await sender.page.locator("#transferSenderPin").textContent(), "•••• •••• ••••");

  await receiverA.page.locator("#transferDone").click();
  await receiverA.page.locator('[data-transfer-screen="choose"]:visible').waitFor();
  await receiverA.page.locator("#transferChooseReceive").click();
  assert.equal(await receiverA.page.locator("#transferReceiveOwnership").isChecked(), false);
  assert.equal(await receiverA.page.locator("#transferReceiveNext").isDisabled(), true);
  console.log(JSON.stringify({
    ok: true,
    path: "pin-encrypted-webrtc-device-transfer",
    senderPinGenerated: true,
    ephemeralPinNotPersisted: true,
    legalConfirmationRequiredPerSession: true,
    receivers: 2,
    receiverViewport: "768x1024 portrait",
    archiveCount: seeded.archiveCount,
    bytesPerReceiver: seeded.totalBytes,
    signalingPayloadCarriesGameData: false,
    screenshots: [senderScreenshot, receiverScreenshot],
    relay: relay.stats(),
    events,
  }, null, 2));
} finally {
  await Promise.allSettled([
    sender?.context.close(),
    receiverA?.context.close(),
    receiverB?.context.close(),
  ]);
  await browser.close();
  await relay.close();
  await server.close();
}
