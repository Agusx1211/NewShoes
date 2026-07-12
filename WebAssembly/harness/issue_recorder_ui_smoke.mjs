import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotRoot = resolve(wasmRoot, "artifacts/screenshots");
const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(60_000);
  await page.goto(new URL("harness/play.html?diag=lite", server.url).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc && window.CnCIssueRecorder));
  await page.evaluate(() => {
    window.CnCIssueRecorder.setRpc(window.CnCPort.rpc.bind(window.CnCPort));
    window.CnCIssueRecorder.noteFrame(
      "realEngineFrameTick",
      { frames: 1 },
      { ok: true, frame: { framesCompleted: 77 }, state: { frame: 0 } },
      1.5,
    );
    document.querySelector("#overlay")?.classList.add("hidden");
  });
  await page.locator('[data-open="settings"]').first().click();
  assert.equal(await page.locator("#multiplayerPanel #networkDiagnosticsToggle").count(), 0);
  assert.equal(await page.locator("#gamePanel #networkDiagnosticsToggle").count(), 1);
  await page.locator('[data-settings-tab="game"]').click();
  await page.locator("#networkDiagnosticsToggle").check();
  const networkSetting = await page.evaluate(async () => ({
    stored: localStorage.getItem("cncPortNetworkDiagnosticsEnabled.v1"),
    snapshot: window.__cncNetworkDiagnosticsSnapshot?.(),
    bundle: await window.CnCIssueRecorder.buildBundle("ui-network-diagnostics"),
  }));
  assert.equal(networkSetting.stored, "true");
  assert.equal(networkSetting.snapshot?.enabled, true);
  assert.equal(networkSetting.bundle?.networkDiagnostics?.schema, "cnc.network-diagnostics.v1");
  assert.equal(networkSetting.bundle?.manifest?.counts?.networkPackets, 0);
  await page.locator("#deepCapture").uncheck();
  await page.locator("#videoCapture").uncheck();
  await page.locator("#recordToggle").click();
  await page.evaluate(() => {
    const runtime = document.querySelector("#launchOverlay");
    if (runtime) {
      runtime.hidden = false;
      runtime.classList.add("is-running");
    }
    document.querySelector("#launchLoader")?.setAttribute("hidden", "");
  });
  await page.locator("#captureOverlay:not(.hidden)").waitFor();
  assert.match(await page.locator("#captureOverlayTitle").textContent(), /Recording/);
  assert.equal(await page.locator("#captureOverlayDismiss").isDisabled(), true);
  await mkdir(screenshotRoot, { recursive: true });
  await page.screenshot({ path: resolve(screenshotRoot, "issue-capture-overlay-ui-smoke.png") });
  await page.locator("#captureOverlayIssue").click();
  await page.locator("#issueModal:not(.hidden)").waitFor();
  await page.locator("#issueTitle").click();
  await page.keyboard.type("UI smoke");
  await page.locator("#issueComment").click();
  await page.keyboard.type("Annotated issue capture without booting wasm.");
  await expectInputValue(page, "#issueTitle", "UI smoke");
  await expectInputValue(page, "#issueComment", "Annotated issue capture without booting wasm.");
  const box = await page.locator("#issueAnnotationCanvas").boundingBox();
  assert.ok(box, "annotation canvas should be visible");
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 120);
  await page.mouse.up();
  await page.locator("#issueSave").click();
  await page.waitForFunction(() => window.CnCIssueRecorder?.issues?.length === 1);
  const issue = await page.evaluate(() => {
    const saved = window.CnCIssueRecorder.issues[0];
    return {
      id: saved.id,
      title: saved.title,
      comment: saved.comment,
      markerFrame: saved.markerFrame,
      strokeCount: saved.annotation.strokeCount,
      hasScreenshot: typeof saved.screenshot.dataUrl === "string" && saved.screenshot.dataUrl.startsWith("data:image/png"),
      hasAnnotated: typeof saved.annotation.annotatedDataUrl === "string" && saved.annotation.annotatedDataUrl.startsWith("data:image/png"),
    };
  });
  assert.equal(issue.id, "issue-001");
  assert.equal(issue.title, "UI smoke");
  assert.ok(issue.comment.includes("Annotated"));
  assert.equal(issue.markerFrame, 77);
  assert.equal(issue.strokeCount, 1);
  assert.equal(issue.hasScreenshot, true);
  assert.equal(issue.hasAnnotated, true);
  await page.locator("#captureOverlayToggle").click();
  await page.waitForFunction(() => window.CnCIssueRecorder?.recording === false);
  assert.match(await page.locator("#captureOverlayTitle").textContent(), /stopped/i);
  assert.equal(await page.locator("#captureOverlay").isVisible(), true);
  await page.locator("#captureOverlayToggle").click();
  await page.waitForFunction(() => window.CnCIssueRecorder?.recording === true);

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#captureOverlayDownload").click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /in-game-overlay\.cncdump\.json$/);
  const downloadPath = await download.path();
  assert.ok(downloadPath, "capture overlay did not produce a downloadable issue dump");
  const downloadedDump = JSON.parse(await readFile(downloadPath, "utf8"));
  assert.equal(downloadedDump.schema, "cnc.issue-dump.v1");
  assert.equal(downloadedDump.issues[0].title, "UI smoke");
  assert.equal(downloadedDump.networkDiagnostics.schema, "cnc.network-diagnostics.v1");

  await page.locator("#captureOverlayToggle").click();
  await page.waitForFunction(() => window.CnCIssueRecorder?.recording === false);
  await page.locator("#captureOverlayDismiss").click();
  await page.locator("#captureOverlay").waitFor({ state: "hidden" });
  console.log("issue recorder UI smoke passed");
} finally {
  await browser.close();
  await server.close();
}

async function expectInputValue(page, selector, expected) {
  const value = await page.locator(selector).inputValue();
  assert.equal(value, expected);
}
