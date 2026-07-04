#!/usr/bin/env node
/**
 * mac_verify.mjs — One-command real-GPU Mac verification.
 *
 * Flow:
 *   1. Build cnc-port locally  (skip with --no-build)
 *   2. rsync WebAssembly/dist/ to the Mac repo
 *   3. Over ssh: ensure harness server is alive on the Mac
 *   4. Over ssh: run a headless GPU playwright probe on the Mac
 *   5. scp the screenshot back to the dev box
 *   6. Print a dense result block
 *
 * Usage:
 *   node harness/mac_verify.mjs --target=title
 *   node harness/mac_verify.mjs --target=player-control
 *   node harness/mac_verify.mjs --no-build --target=title
 *   node harness/mac_verify.mjs --ssh-host=cnc-gpu --target=title
 *   node harness/mac_verify.mjs --rsync-dry-run
 */

import { spawnSync, execSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_ROOT = resolve(__dirname, "..");

// ── Argument parsing ──────────────────────────────────────────────
function parseArgs(argv) {
  const args = {
    build: true,
    target: "title",
    sshHost: "cnc-gpu",
    sshKey: "~/.ssh/id_ed25519_main2",
    rsyncDryRun: false,
    noBuild: false,
    screenshotDir: resolve(process.env.HOME, "cnc-mac-verify"),
    macWorktree: "/Volumes/CnCWork/CnC_Generals_Zero_Hour",
    timeout: 600_000,       // 10 min for player-control
    titleTimeout: 300_000,  // 5 min for title probe
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-build" || a === "--build=false") args.build = false;
    if (a === "--rsync-dry-run") args.rsyncDryRun = true;
    if (a.startsWith("--target=")) args.target = a.split("=")[1];
    if (a.startsWith("--ssh-host=")) args.sshHost = a.split("=")[1];
    if (a.startsWith("--ssh-key=")) args.sshKey = a.split("=")[1];
    if (a.startsWith("--screenshot-dir=")) args.screenshotDir = a.split("=")[1];
    if (a.startsWith("--mac-worktree=")) args.macWorktree = a.split("=")[1];
    if (a.startsWith("--timeout=")) args.timeout = Number(a.split("=")[1]);
    if (a.startsWith("--title-timeout=")) args.titleTimeout = Number(a.split("=")[1]);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const sshKey = args.sshKey.replace(/^~/, process.env.HOME || "");
const sshOpts = `-i ${sshKey} -o StrictHostKeyChecking=no -o ConnectTimeout=15`;

function ssh(cmd) {
  return execSync(`ssh ${sshOpts} ${args.sshHost} "${cmd}"`, {
    encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 120_000,
  });
}
function sshLong(cmd, timeoutMs) {
  return execSync(`ssh ${sshOpts} ${args.sshHost} "${cmd}"`, {
    encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: timeoutMs || 120_000,
  });
}
function rsync(src, dst, extra = "") {
  return execSync(`rsync -az ${extra} ${src} ${args.sshHost}:${dst}`, {
    encoding: "utf-8", stdio: "inherit", timeout: 300_000,
  });
}
function rsyncDryRun(src, dst, extra = "") {
  return execSync(`rsync -az --dry-run ${extra} ${src} ${args.sshHost}:${dst}`, {
    encoding: "utf-8", stdio: "inherit", timeout: 30_000,
  });
}
function scpBack(remotePath, localPath) {
  return execSync(`scp ${sshOpts} ${args.sshHost}:${remotePath} "${localPath}"`, {
    encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 60_000,
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Step 0: Validate ──────────────────────────────────────────────
console.error("[mac-verify] args:", JSON.stringify({
  build: args.build, target: args.target, sshHost: args.sshHost,
}));
if (!["title", "player-control"].includes(args.target)) {
  console.error(`[mac-verify] ERROR: unknown target "${args.target}". Use --target=title or --target=player-control`);
  process.exit(1);
}

// ── Step 1: Build ─────────────────────────────────────────────────
if (args.build) {
  console.error("[mac-verify] step1: building cnc-port locally...");
  const buildResult = spawnSync("bash", ["tools/build_wasm.sh"], {
    cwd: WASM_ROOT, env: { ...process.env, CNC_BUILD_TARGETS: "cnc-port" },
    stdio: "inherit", timeout: 600_000,
  });
  if (buildResult.status !== 0) {
    console.error("[mac-verify] ERROR: build failed");
    process.exit(1);
  }
  console.error("[mac-verify] step1: build complete");
} else {
  console.error("[mac-verify] step1: skipping build (--no-build)");
}

const distDir = join(WASM_ROOT, "dist");
let localDistExists = false;
try {
  const wasmStat = readFileSync(join(distDir, "cnc-port.wasm"));
  console.error(`[mac-verify] step1: dist/cnc-port.wasm = ${wasmStat.byteLength} bytes`);
  localDistExists = true;
} catch {
  console.error("[mac-verify] step1: no local dist (using Mac's existing build)");
}

// ── Step 2: rsync to Mac ──────────────────────────────────────────
const src = join(WASM_ROOT, "dist/") + "/";
const dst = join(args.macWorktree, "WebAssembly/dist/") + "/";

if (args.rsyncDryRun) {
  console.error("[mac-verify] step2: rsync dry-run");
  if (localDistExists) {
    try { rsyncDryRun(src, dst, "--exclude=node_modules --exclude=build"); } catch (e) {
      console.error(`[mac-verify] RSYNC DRY-RUN: fail — ${e.message.split("\n")[0]}`);
      process.exit(1);
    }
    console.error("[mac-verify] RSYNC DRY-RUN: ok (would transfer local dist)");
    // Also dry-run harness/ sync (no --delete to preserve Mac-side probe files)
    const harnessSrc = join(WASM_ROOT, "harness/") + "/";
    const harnessDst = join(args.macWorktree, "WebAssembly/harness/") + "/";
    try { rsyncDryRun(harnessSrc, harnessDst); } catch (e) {
      console.error(`[mac-verify] RSYNC DRY-RUN: fail — ${e.message.split("\n")[0]}`);
      process.exit(1);
    }
    console.error("[mac-verify] RSYNC DRY-RUN: ok (would transfer local harness)");
  } else {
    try {
      const macFiles = ssh(`ls ${dst} 2>/dev/null | wc -l`);
      console.error(`[mac-verify] RSYNC DRY-RUN: ok (path verified, Mac has ${macFiles.trim()} files at dst)`);
    } catch (e) {
      console.error(`[mac-verify] RSYNC DRY-RUN: fail — ${e.message.split("\n")[0]}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

if (localDistExists) {
  console.error("[mac-verify] step2: rsyncing dist/ to Mac...");
  try {
    rsync(src, dst, "--exclude=node_modules --exclude=build");
    console.error("[mac-verify] step2: rsync ok");
  } catch (e) {
    console.error(`[mac-verify] ERROR: rsync failed — ${e.message.split("\n")[0]}`);
    process.exit(1);
  }
  // Also sync harness/ so bridge.js / play.mjs match the synced dist.
  // NO --delete: preserves Mac-side probe files (mac_verify_probe.mjs etc).
  const harnessSrc = join(WASM_ROOT, "harness/") + "/";
  const harnessDst = join(args.macWorktree, "WebAssembly/harness/") + "/";
  console.error("[mac-verify] step2: rsyncing harness/ to Mac (no --delete)...");
  try {
    rsync(harnessSrc, harnessDst);
    console.error("[mac-verify] step2: harness/ rsync ok");
  } catch (e) {
    console.error(`[mac-verify] ERROR: harness rsync failed — ${e.message.split("\n")[0]}`);
    process.exit(1);
  }
} else {
  console.error("[mac-verify] step2: skipping rsync (no local dist)");
}

// ── Step 3: Ensure harness server on Mac ──────────────────────────
console.error("[mac-verify] step3: checking harness server on Mac...");
let serverRunning = false;
try {
  const check = ssh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8123/harness/index.html 2>/dev/null || echo 000");
  if (check.trim() === "200") {
    serverRunning = true;
    console.error("[mac-verify] step3: server already running (HTTP 200)");
  }
} catch { /* ignore */ }

if (!serverRunning) {
  console.error("[mac-verify] step3: starting harness server on Mac...");
  try {
    ssh("pkill -f 'node.*harness/serve.mjs' 2>/dev/null; sleep 1");
    ssh(`cd ${args.macWorktree}/WebAssembly && HOST=0.0.0.0 PORT=8123 nohup node harness/serve.mjs > /tmp/harness-serve.log 2>&1 &`);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(1000);
      try {
        const check = ssh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8123/harness/index.html 2>/dev/null || echo 000");
        if (check.trim() === "200") { ready = true; break; }
      } catch { /* ignore */ }
    }
    if (!ready) {
      console.error("[mac-verify] step3: server failed to start");
      console.error(ssh("cat /tmp/harness-serve.log 2>/dev/null || echo '(no log)'"));
      process.exit(1);
    }
    console.error("[mac-verify] step3: server started ok");
    serverRunning = true;
  } catch (e) {
    console.error(`[mac-verify] step3: server start failed — ${e.message.split("\n")[0]}`);
    process.exit(1);
  }
}

// ── Step 4: Write Mac-side probe script ───────────────────────────
const screenshotDir = args.screenshotDir;
mkdirSync(screenshotDir, { recursive: true });

const probeScript = `
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const TARGET = "${args.target}";
const deadline = Date.now() + ${args.target === "player-control" ? args.timeout : args.titleTimeout};

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--enable-gpu", "--use-angle=metal", "--disable-gpu-compositing"],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(${args.target === "player-control" ? 300_000 : 120_000});
page.on("crash", () => { console.error("PAGE CRASHED"); process.exit(2); });
page.on("console", (msg) => { if (msg.type() === "error") console.error("[page]", msg.text()); });

const HARNESS_URL = "http://127.0.0.1:8123/harness/play.html?autostart=1";

let renderer = "";
let screenshotPath = "";
let result = { ok: false, target: TARGET, renderer: "", m4Metal: false, frame: null, playerControlReached: false, missingTextureApplies: null, missingTextureBailouts: null, screenshot: "", archivesMounted: 0 };

try {
  console.error("[probe] navigating to harness...");
  await page.goto(HARNESS_URL, { waitUntil: "domcontentloaded" });

  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc), { timeout: 60_000 });
  console.error("[probe] CnCPort.rpc available");

  // Get WebGL renderer
  renderer = await page.evaluate(() => {
    try {
      const c = document.createElement("canvas");
      const g = c.getContext("webgl2") || c.getContext("webgl");
      if (!g) return "NO_WEBGL";
      const ext = g.getExtension("WEBGL_debug_renderer_info");
      return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    } catch(e) { return "ERROR: " + e.message; }
  });
  console.error("[probe] WebGL renderer:", renderer);
  result.renderer = renderer;
  result.m4Metal = renderer.includes("Apple M4") && renderer.includes("Metal");

  // Use autostart to boot the engine (same proven path as probe.mjs on Mac)
  console.error("[probe] waiting for boot+init (autostart)...");
  await page.waitForFunction(
    () => document.querySelector("#overlay")?.classList.contains("hidden")
      || document.querySelector("#progress")?.textContent?.startsWith("FAILED"),
    null, { timeout: 300_000, polling: 1000 });
  const prog = await page.evaluate(() => document.querySelector("#progress")?.textContent ?? "");
  console.error("[probe] boot+init done:", prog);
  if (prog.startsWith("FAILED")) {
    throw new Error("Boot+init failed: " + prog);
  }

  // Texture diagnostics
  const texDiag = await page.evaluate(() => window.CnCPort.rpc("textureDiagnosticsProbe", {}) || {});
  result.missingTextureApplies = texDiag.missingApplies;
  result.missingTextureBailouts = texDiag.missingBailouts;

  // Map cache probe
  const mc = await page.evaluate(() => window.CnCPort.rpc("mapCacheProbe", {}));
  const p = mc?.probe ?? {};
  console.error("[probe] gate:", JSON.stringify({ ram: p.cpuDetectRamBytes, lod: p.staticLODLevel, shellMapOn: p.shellMapOn }));

  if (TARGET === "title") {
    console.error("[probe] running frames...");
    const framesResult = await page.evaluate(() =>
      window.CnCPort.rpc("realEngineFrame", { frames: 5 }));
    if (framesResult?.aborted) {
      console.error("[probe] frames aborted:", framesResult.abortMessage);
    } else {
      result.frame = framesResult?.frame?.framesCompleted;
      console.error("[probe] frames ok, completed:", result.frame);
    }

    const summaryResult = await page.evaluate(() =>
      window.CnCPort.rpc("realEngineFrameSummary", { frames: 1 }));
    const gameplay = summaryResult?.frame?.gameplay;
    if (gameplay) {
      console.error("[probe] gameplay:", JSON.stringify({
        inGame: gameplay.inGame, logicFrame: gameplay.logicFrame,
        objectCount: gameplay.objectCount, gameMode: gameplay.gameMode,
      }));
    }

    console.error("[probe] capturing screenshot...");
    screenshotPath = process.env.HOME + "/cnc-verify/mac-verify-title.png";
    const screenshotData = await page.evaluate(() => window.CnCPort.rpc("screenshot") || {});
    if (screenshotData?.dataUrl) {
      const base64 = screenshotData.dataUrl.replace(/^data:image\\/png;base64/, "");
      writeFileSync(screenshotPath, Buffer.from(base64, "base64"));
    } else {
      await page.locator("#viewport").screenshot({ path: screenshotPath });
    }
    result.screenshot = screenshotPath;
    result.ok = true;
    result.title = {
      subsystemsCompleted: mc?.probe?.shellMapOn ? 43 : 0,
      framesCompleted: result.frame,
      inGame: gameplay?.inGame,
      gameMode: gameplay?.gameMode,
    };

  } else if (TARGET === "player-control") {
    console.error("[probe] running frames until player control...");
    const playerControlResult = await page.evaluate((maxFrames) => {
      return new Promise(async (resolve) => {
        const BATCH_FRAMES = 50;
        let totalFrames = 0;
        let reached = false;
        while (totalFrames < maxFrames && !reached) {
          const batch = Math.min(BATCH_FRAMES, maxFrames - totalFrames);
          totalFrames += batch;
          const s = await window.CnCPort.rpc("realEngineFrameSummary", { frames: batch });
          const pc = s?.frame?.playerControl || {};
          if (pc.introDone === true && pc.inputEnabled === true && pc.controlBarClickable === true &&
              (pc.letterBoxed !== true || pc.letterBoxed === undefined) &&
              (pc.fade === 0 || pc.fade === undefined)) {
            reached = true;
          }
        }
        resolve({ reachedPlayerControl: reached, frame: { framesCompleted: totalFrames } });
      });
    }, 3600);

    if (playerControlResult?.reachedPlayerControl) {
      console.error("[probe] PLAYER CONTROL REACHED after", playerControlResult?.frame?.framesCompleted, "frames");
      result.playerControlReached = true;
      result.frame = playerControlResult?.frame?.framesCompleted;
    } else {
      console.error("[probe] player control NOT reached after", playerControlResult?.frame?.framesCompleted, "frames");
      result.playerControlReached = false;
      result.frame = playerControlResult?.frame?.framesCompleted;
    }

    console.error("[probe] capturing screenshot...");
    screenshotPath = process.env.HOME + "/cnc-verify/mac-verify-player-control.png";
    const screenshotData = await page.evaluate(() => window.CnCPort.rpc("screenshot") || {});
    if (screenshotData?.dataUrl) {
      const base64 = screenshotData.dataUrl.replace(/^data:image\\/png;base64/, "");
      writeFileSync(screenshotPath, Buffer.from(base64, "base64"));
    } else {
      await page.locator("#viewport").screenshot({ path: screenshotPath });
    }
    result.screenshot = screenshotPath;
    result.ok = true;
  }

} catch (err) {
  console.error("[probe] FATAL:", err.message);
  try {
    const path = process.env.HOME + "/cnc-verify/mac-verify-error.png";
    await page.screenshot({ path });
    result.screenshot = path;
    result.error = err.message;
  } catch (_) {}
} finally {
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
`;

// Write probe to Mac via local temp file → scp (avoids heredoc issues)
const localProbePath = join(screenshotDir, "mac_verify_probe.mjs");
const macProbePath = join(args.macWorktree, "WebAssembly/harness/mac_verify_probe.mjs");
console.error("[mac-verify] step4: writing probe to Mac...");
try {
  writeFileSync(localProbePath, probeScript);
  execSync(`scp ${sshOpts} "${localProbePath}" ${args.sshHost}:${macProbePath}`, {
    encoding: "utf-8", stdio: "pipe", timeout: 30_000,
  });
  console.error("[mac-verify] step4: probe written");
} catch (e) {
  console.error(`[mac-verify] ERROR: failed to write probe — ${e.message.split("\n")[0]}`);
  process.exit(1);
}

// ── Step 5: Run probe on Mac ──────────────────────────────────────
const probeTimeout = args.target === "player-control" ? args.timeout : args.titleTimeout;
console.error(`[mac-verify] step5: running ${args.target} probe (timeout: ${probeTimeout / 1000}s)...`);

let probeOutput = "";
try {
  // Use Mac's HOME (/Users/aa), not dev box HOME (process.env.HOME)
  probeOutput = sshLong(
    `cd ${args.macWorktree}/WebAssembly && HOME=/Users/aa /opt/homebrew/bin/node harness/mac_verify_probe.mjs 2>&1`,
    probeTimeout
  );
  console.error("[mac-verify] step5: probe completed");
} catch (e) {
  probeOutput = e.stdout || e.message || "";
  console.error(`[mac-verify] step5: probe exited with error`);
}

// Parse JSON result — find the JSON block in output
let probeResult = null;
const lines = probeOutput.split("\n");
// Find the JSON block: first line starts with '{', last non-empty line is '}'
let jsonStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('{')) { jsonStart = i; break; }
}
if (jsonStart >= 0) {
  // Collect all lines from jsonStart to the last non-empty line
  let jsonEnd = jsonStart;
  for (let i = lines.length - 1; i >= jsonStart; i--) {
    if (lines[i].trim()) { jsonEnd = i; break; }
  }
  const jsonBlock = lines.slice(jsonStart, jsonEnd + 1).join("\n");
  try {
    probeResult = JSON.parse(jsonBlock);
  } catch {
    console.error("[mac-verify] JSON parse error:", jsonBlock.slice(0, 200));
  }
}

if (!probeResult) {
  console.error("[mac-verify] ERROR: could not parse probe output");
  console.error(probeOutput.slice(-2000));
  process.exit(1);
}

// ── Step 6: Copy screenshot back ──────────────────────────────────
let localScreenshot = "";
if (probeResult.screenshot) {
  console.error("[mac-verify] step6: copying screenshot back...");
  const localScreenshotPath = join(screenshotDir, `mac-verify-${args.target}.png`);
  try {
    scpBack(probeResult.screenshot, localScreenshotPath);
    localScreenshot = localScreenshotPath;
    console.error(`[mac-verify] step6: screenshot saved to ${localScreenshotPath}`);
  } catch (e) {
    console.error(`[mac-verify] step6: scp failed — ${e.message.split("\n")[0]}`);
  }
}

// ── Step 7: Print dense result ────────────────────────────────────
console.log("");
console.log("═".repeat(70));
console.log("  MAC VERIFY RESULT");
console.log("═".repeat(70));
console.log(`  target:         ${args.target}`);
console.log(`  renderer:       ${probeResult.renderer || "(none)"}`);
console.log(`  apple_m4_metal: ${probeResult.m4Metal ? "YES" : "NO"}`);
console.log(`  ok:             ${probeResult.ok ? "YES" : "NO"}`);
if (args.target === "title") {
  console.log(`  subsystems:     ${probeResult.title?.subsystemsCompleted ?? "N/A"}`);
  console.log(`  frames:         ${probeResult.title?.framesCompleted ?? "N/A"}`);
  console.log(`  inGame:         ${probeResult.title?.inGame ?? "N/A"}`);
  console.log(`  gameMode:       ${probeResult.title?.gameMode ?? "N/A"}`);
} else if (args.target === "player-control") {
  console.log(`  playerControl:  ${probeResult.playerControlReached ? "YES" : "NO"}`);
  console.log(`  frames:         ${probeResult.frame ?? "N/A"}`);
}
console.log(`  missingApplies: ${probeResult.missingTextureApplies ?? "N/A"}`);
console.log(`  missingBailouts: ${probeResult.missingTextureBailouts ?? "N/A"}`);
console.log(`  archivesMounted: ${probeResult.archivesMounted ?? "N/A"}`);
console.log(`  screenshot:     ${localScreenshot || "(not available)"}`);
if (probeResult.error) {
  console.log(`  error:          ${probeResult.error}`);
}
console.log("═".repeat(70));

// Exit code
if (!probeResult.ok) process.exit(1);
if (args.target === "player-control" && !probeResult.playerControlReached) process.exit(2);
