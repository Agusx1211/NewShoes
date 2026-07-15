import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const packageDirectory = process.env.REAL_MOD_DIR
  ? resolve(process.env.REAL_MOD_DIR)
  : null;
if (!packageDirectory) throw new Error("Set REAL_MOD_DIR to the directory containing the real ModDB downloads");
const allPackages = [
  { file: "ShockWaveV1201.zip", name: "ShockWave", archives: 13, clickteam: true },
  { file: "ROTRBeta_185.zip", name: "Rise of the Reds", archives: 14, clickteam: true },
  { file: "MODDB_Ver11.rar", name: "The End of Days", archives: 11 },
  { file: "Contra009Final.rar", name: "Contra", archives: 8, disabled: 5 },
  {
    file: "ContraXBeta2.zip",
    name: "Contra X Beta 2",
    archives: 24,
    disabled: 11,
    native: true,
    optional: true,
  },
];
const requestedPackages = new Set(String(process.env.REAL_MOD_PACKAGES || "")
  .split(",").map((value) => value.trim()).filter(Boolean));
const packages = requestedPackages.size > 0
  ? allPackages.filter((item) => requestedPackages.has(item.file))
  : allPackages.filter((item) => !item.optional);
if (packages.length === 0 || (requestedPackages.size > 0 && packages.length !== requestedPackages.size)) {
  throw new Error("REAL_MOD_PACKAGES contains an unknown test package");
}
for (const item of packages) await stat(join(packageDirectory, item.file));

const screenshotDirectory = resolve(process.env.REAL_MOD_SCREENSHOT_DIR || "/tmp/cnc-real-mod-smoke");
await mkdir(screenshotDirectory, { recursive: true });
// A non-persistent Playwright context is an incognito profile and Chromium
// intentionally gives it a much smaller OPFS quota. Use a disposable regular
// profile so this test can prove that several large mods coexist.
const profileDirectory = await mkdtemp(join(tmpdir(), "cnc-real-mod-profile-"));
const launchOptions = {
  headless: true,
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 1100 },
};
const browserExecutable = String(process.env.REAL_MOD_BROWSER_EXECUTABLE ?? "").trim();
if (browserExecutable) launchOptions.executablePath = browserExecutable;
const browserArgs = String(process.env.REAL_MOD_BROWSER_ARGS ?? "").trim();
if (browserArgs) launchOptions.args = browserArgs.split(/\s+/).filter(Boolean);
const context = await chromium.launchPersistentContext(profileDirectory, launchOptions);
const page = context.pages()[0] ?? await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") console.error(`[browser] ${message.text()}`);
});
page.on("requestfailed", (request) => {
  const error = request.failure()?.errorText || "unknown error";
  if (error !== "net::ERR_ABORTED") console.error(`[request failed] ${error} ${request.url()}`);
});

try {
  await page.goto(process.env.CNC_HARNESS_URL || "https://127.0.0.1:8573/harness/play.html", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForFunction(() => Boolean(window.ZeroHModManager?.store), null, { timeout: 120_000 });
  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? null;
  });
  console.log("browser renderer", renderer);
  console.log("browser storage", await page.evaluate(async () => ({
    estimate: await navigator.storage.estimate(),
    persisted: await navigator.storage.persisted(),
  })));
  await page.locator('.desktop-icon[data-open="mods"]').click();
  await page.waitForSelector("#modsWindow.is-open");

  for (const item of packages) {
    const before = await page.evaluate(() => window.ZeroHModManager.store.list().length);
    await page.locator("#modImportName").fill(item.name);
    await page.locator("#modImportPackageInput").setInputFiles(join(packageDirectory, item.file));
    await page.waitForFunction((count) => {
      const progress = document.querySelector("#modImportProgress")?.textContent || "";
      return window.ZeroHModManager.store.list().length === count + 1 || progress.startsWith("Import failed:");
    }, before, { timeout: 30 * 60_000 });
    const progress = await page.locator("#modImportProgress").textContent();
    if (progress.startsWith("Import failed:")) throw new Error(`${item.file}: ${progress}`);
    const imported = await page.evaluate(() => window.ZeroHModManager.store.list().at(-1));
    assert.equal(imported.name, item.name);
    assert.ok(imported.archives.length >= item.archives,
      `${item.file} should expose at least ${item.archives} engine archives`);
    if (item.disabled != null) {
      assert.equal(imported.archives.filter((archive) => !archive.enabled).length, item.disabled);
    }
    if (item.clickteam || item.native) {
      assert.match(imported.warnings.join(" "), /native Windows code/i);
    }
    console.log("imported", item.file, {
      archives: imported.archives.length,
      bytes: imported.totalBytes,
      disabled: imported.archives.filter((archive) => !archive.enabled).length,
      hash: imported.contentHash,
    });
  }

  for (const item of packages) {
    await page.locator(".installed-mod-card", { hasText: item.name })
      .locator(".installed-mod-selection input").check();
  }
  await page.locator("#modApplyButton").click();
  await page.waitForFunction((count) => window.ZeroHModManager?.store.active().mods.length === count,
    packages.length, { timeout: 120_000 });
  await page.locator('.desktop-icon[data-open="mods"]').click();
  await page.waitForSelector("#modsWindow.is-open");

  const result = await page.evaluate(() => {
    const context = window.ZeroHModManager.store.active();
    return {
      id: context.id,
      labels: context.mods.map((mod) => mod.name),
      selectedArchives: context.mods.reduce((sum, mod) =>
        sum + mod.archives.filter((archive) => archive.enabled).length, 0),
    };
  });
  assert.deepEqual(result.labels, packages.map((item) => item.name));
  assert.match(result.id, /^[a-f0-9]{64}$/);
  assert.equal(await page.locator(".installed-mod-selection input:checked").count(), packages.length);
  assert.equal(await page.locator("#activeModBadge").textContent(), result.labels.join(" + "));
  const runLabel = packages.map((item) => item.file.replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()).join("-");
  const screenshot = join(screenshotDirectory, `${runLabel}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  const bottomScreenshot = join(screenshotDirectory, `${runLabel}-bottom.png`);
  await page.locator(".installed-mod-card").last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: bottomScreenshot, fullPage: true });

  await page.evaluate(async () => {
    const store = window.ZeroHModManager.store;
    await store.useVanilla();
    for (const mod of store.list()) await store.remove(mod.id);
    window.ZeroHModManager.render();
  });
  console.log("real ModDB package smoke passed", { screenshot, bottomScreenshot, renderer, ...result });
} finally {
  await context.close();
  await rm(profileDirectory, { recursive: true, force: true });
}
