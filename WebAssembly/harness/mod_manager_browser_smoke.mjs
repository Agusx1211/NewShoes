import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.MOD_MANAGER_URL || "https://127.0.0.1:8573/harness/play.html";
const executablePath = process.env.MOD_MANAGER_BROWSER
  || "/home/agusx1211/.cache/ms-playwright/chromium-1228/chrome-linux/chrome";
const shotDir = process.env.MOD_MANAGER_SHOTS || "/tmp/cnc-mod-manager-smoke";
await mkdir(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--ignore-certificate-errors"],
});
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHModManager?.store));

  const result = await page.evaluate(async () => {
    function crc32(bytes) {
      let crc = 0xffffffff;
      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
      return (crc ^ 0xffffffff) >>> 0;
    }
    function syntheticBig(path, payload) {
      const encoder = new TextEncoder();
      const pathBytes = encoder.encode(path);
      const dataOffset = 16 + 8 + pathBytes.length + 1;
      const bytes = new Uint8Array(dataOffset + payload.length);
      const view = new DataView(bytes.buffer);
      bytes.set(encoder.encode("BIGF"));
      view.setUint32(4, bytes.length, true);
      view.setUint32(8, 1, false);
      view.setUint32(12, 0, false);
      view.setUint32(16, dataOffset, false);
      view.setUint32(20, payload.length, false);
      bytes.set(pathBytes, 24);
      bytes.set(payload, dataOffset);
      return bytes;
    }
    function storedZip(path, payload) {
      const encoder = new TextEncoder();
      const name = encoder.encode(path);
      const crc = crc32(payload);
      const localSize = 30 + name.length + payload.length;
      const centralSize = 46 + name.length;
      const bytes = new Uint8Array(localSize + centralSize + 22);
      const view = new DataView(bytes.buffer);
      let offset = 0;
      view.setUint32(offset, 0x04034b50, true); offset += 4;
      view.setUint16(offset, 20, true); offset += 2;
      view.setUint16(offset, 0x0800, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint32(offset, crc, true); offset += 4;
      view.setUint32(offset, payload.length, true); offset += 4;
      view.setUint32(offset, payload.length, true); offset += 4;
      view.setUint16(offset, name.length, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      bytes.set(name, offset); offset += name.length;
      bytes.set(payload, offset); offset += payload.length;
      const centralOffset = offset;
      view.setUint32(offset, 0x02014b50, true); offset += 4;
      view.setUint16(offset, 20, true); offset += 2;
      view.setUint16(offset, 20, true); offset += 2;
      view.setUint16(offset, 0x0800, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint32(offset, crc, true); offset += 4;
      view.setUint32(offset, payload.length, true); offset += 4;
      view.setUint32(offset, payload.length, true); offset += 4;
      view.setUint16(offset, name.length, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint32(offset, 0, true); offset += 4;
      view.setUint32(offset, 0, true); offset += 4;
      bytes.set(name, offset); offset += name.length;
      view.setUint32(offset, 0x06054b50, true); offset += 4;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 0, true); offset += 2;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint32(offset, centralSize, true); offset += 4;
      view.setUint32(offset, centralOffset, true); offset += 4;
      view.setUint16(offset, 0, true);
      return bytes;
    }

    const store = window.ZeroHModManager.store;
    for (const mod of store.list()) {
      if (!store.active().mods.some((active) => active.id === mod.id)) await store.remove(mod.id);
    }
    const directBytes = syntheticBig("Data\\INI\\BrowserSmoke.ini", new TextEncoder().encode("TestValue = 1\n"));
    const direct = await store.importFiles([new File([directBytes], "BrowserSmoke.big")], {
      name: "Direct BIG Smoke",
      version: "1.0",
    });
    const zip = storedZip("Wrapper/Data/INI/LooseSmoke.ini", new TextEncoder().encode("LooseValue = 2\n"));
    const loose = await store.importFiles([new File([zip], "LooseSmoke.zip")], {
      name: "Loose ZIP Smoke",
      version: "2.0",
    });
    const composition = await store.apply([direct.mod.id, loose.mod.id]);
    await store.useVanilla();
    const saveBytes = new TextEncoder().encode("browser smoke save");
    const replayBytes = new Uint8Array([
      0x47, 0x45, 0x4e, 0x52, 0x45, 0x50, 0x01, 0x02, 0x03,
    ]);
    await window.CnCPort.importGameData("vanilla", "save", "Vanilla Browser Smoke.sav", saveBytes);
    await window.CnCPort.importGameData("vanilla", "replay", "Vanilla Browser Smoke.rep", replayBytes);
    await window.CnCPort.importGameData(composition.id, "save", "Mod Browser Smoke.sav", saveBytes);
    await window.CnCPort.importGameData(composition.id, "replay", "Mod Browser Smoke.rep", replayBytes);
    let unacknowledgedOverrideRejected = false;
    try {
      await window.CnCPort.copyGameDataOverride({
        sourceContextId: "vanilla",
        targetContextId: composition.id,
        kind: "save",
        name: "Vanilla Browser Smoke.sav",
      });
    } catch (error) {
      unacknowledgedOverrideRejected = /acknowledgement/i.test(error.message);
    }
    const gameData = await window.CnCPort.listGameData();
    window.ZeroHModManager.render();
    return {
      direct: direct.mod,
      loose: loose.mod,
      composition,
      installed: store.list().length,
      active: store.active().id,
      gameData,
      unacknowledgedOverrideRejected,
    };
  });

  assert.equal(result.installed, 2);
  assert.equal(result.active, "vanilla");
  assert.equal(result.direct.archives.length, 1);
  assert.equal(result.loose.archives.length, 1);
  assert.equal(result.loose.looseFileCount, undefined,
    "only normalized persistent metadata should leave the package worker");
  assert.match(result.direct.contentHash, /^[a-f0-9]{64}$/);
  assert.match(result.loose.contentHash, /^[a-f0-9]{64}$/);
  assert.notEqual(result.direct.contentHash, result.loose.contentHash);
  assert.deepEqual(result.composition.mods.map((mod) => mod.name), ["Direct BIG Smoke", "Loose ZIP Smoke"]);
  assert.equal(result.unacknowledgedOverrideRejected, true);
  assert.equal(result.gameData.activeId, "vanilla");
  const vanillaData = result.gameData.contexts.find((context) => context.id === "vanilla");
  const modData = result.gameData.contexts.find((context) => context.id === result.composition.id);
  assert.deepEqual(vanillaData.saves.map((file) => file.name), ["Vanilla Browser Smoke.sav"]);
  assert.deepEqual(vanillaData.replays.map((file) => file.name), ["Vanilla Browser Smoke.rep"]);
  assert.deepEqual(modData.saves.map((file) => file.name), ["Mod Browser Smoke.sav"]);
  assert.deepEqual(modData.replays.map((file) => file.name), ["Mod Browser Smoke.rep"]);

  await page.locator('.desktop-icon[data-open="mods"]').click();
  await page.waitForSelector("#modsWindow.is-open");
  assert.equal(await page.locator(".installed-mod-card").count(), 2);
  assert.match(await page.locator("#activeModBadge").textContent(), /Vanilla/);
  const screenshot = join(shotDir, "mod-manager-imported-packages.png");
  await page.screenshot({ path: screenshot });

  await page.locator('.desktop-icon[data-open="gameData"]').click();
  await page.waitForSelector("#gameDataWindow.is-open");
  await page.waitForFunction(() => document.querySelectorAll(".game-data-context").length === 2
    && document.querySelectorAll(".game-data-file-row").length === 4);
  assert.equal(await page.locator(".game-data-context.is-active").count(), 1);
  assert.match(await page.locator(".game-data-context.is-active").textContent(), /Vanilla/i);
  const vanillaSave = page.locator(".game-data-context", { hasText: "Vanilla" })
    .locator(".game-data-file-row", { hasText: "Vanilla Browser Smoke.sav" });
  await vanillaSave.getByRole("button", { name: "Copy to…" }).click();
  await page.waitForSelector("#compatibilityOverridePanel:not([hidden])");
  assert.equal(await page.locator("#compatibilityOverrideCopy").isDisabled(), true);
  const isolationScreenshot = join(shotDir, "save-replay-isolation-and-override.png");
  await page.screenshot({ path: isolationScreenshot });
  await page.locator("#compatibilityOverrideRisk").check();
  await page.locator("#compatibilityOverrideCopy").click();
  await page.waitForFunction(() => document.querySelectorAll(".game-data-file-row").length === 5);
  assert.match(await page.locator("#gameDataStatus").textContent(), /5 files across 2 isolated configurations/i);

  await page.evaluate(async () => {
    const store = window.ZeroHModManager.store;
    for (const mod of store.list()) await store.remove(mod.id);
    window.ZeroHModManager.render();
  });

  console.log("mod manager browser smoke passed", {
    screenshot,
    isolationScreenshot,
    composition: result.composition.id,
  });
} finally {
  await browser.close();
}
