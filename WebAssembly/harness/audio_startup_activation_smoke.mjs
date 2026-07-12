#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(process.env.CNC_AUDIO_HARNESS_ROOT ?? resolve(harnessRoot, ".."));
const coldLaunches = Math.max(1, Number(process.env.CNC_AUDIO_COLD_LAUNCHES ?? 3));
const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const results = [];

async function audioState(page) {
  return page.evaluate(async () => {
    // Use the long-standing aggregate state RPC so this gate can also run
    // against an unfixed parent tree where the two direct threaded diagnostic
    // routes do not exist yet. That makes the mutation/parent comparison test
    // the activation ordering, not merely the new diagnostics surface.
    const state = await window.CnCPort.rpc("state");
    return {
      audio: state.state?.browserAudioRuntime,
      mixer: state.state?.browserAudioMixerRuntime,
      userActivation: {
        isActive: navigator.userActivation?.isActive ?? null,
        hasBeenActive: navigator.userActivation?.hasBeenActive ?? null,
      },
      settingsOpen: document.querySelector("#settingsWindow")?.classList.contains("is-open") === true,
    };
  });
}

async function exposeReadyLauncher(page) {
  await page.evaluate(async () => {
    // The startup activation contract is asset-independent. Give the launcher
    // a tiny structurally valid OPFS manifest so its real launch button runs
    // the normal installed-library path without copying retail data.
    const installRoot = "cnc-library/install-audio-startup-test";
    const root = await navigator.storage.getDirectory();
    const library = await root.getDirectoryHandle("cnc-library", { create: true });
    await library.removeEntry("install-audio-startup-test", { recursive: true }).catch(() => {});
    const install = await library.getDirectoryHandle("install-audio-startup-test", { create: true });
    const archives = [];
    for (const spec of window.ZeroHArchiveSpecs) {
      const bytes = new Uint8Array(17);
      bytes[0] = 0x42;
      const handle = await install.getFileHandle(spec.name, { create: true });
      const writer = await handle.createWritable();
      await writer.write(bytes);
      await writer.close();
      archives.push({
        name: spec.name,
        bytes: bytes.byteLength,
        entryCount: 1,
        opfsPath: `${installRoot}/${spec.name}`,
      });
    }
    const installed = {
      version: 5,
      game: "zeroHour",
      root: installRoot,
      preparedAt: Date.now(),
      totalBytes: archives.reduce((sum, archive) => sum + archive.bytes, 0),
      includeVideos: false,
      archives,
      videos: [],
    };
    localStorage.setItem("zeroh-installed-library.v5", JSON.stringify(installed));
    localStorage.setItem("zeroh-library", JSON.stringify({
      source: "audio startup activation fixture",
      mode: "install",
      preparedAt: installed.preparedAt,
      totalBytes: installed.totalBytes,
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(
    window.CnCPort?.rpc && window.ZeroHAssetLibrary && window.ZeroHRuntime,
  ));
  await page.waitForSelector('[data-wizard-page="3"].is-visible [data-launch-game]');
}

try {
  for (let run = 0; run < coldLaunches; run += 1) {
    const profileDir = await mkdtemp(resolve(tmpdir(), `cnc-audio-startup-${run}-`));
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [
        "--autoplay-policy=user-gesture-required",
        "--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies",
      ],
    });
    try {
      const page = context.pages()[0] ?? await context.newPage();
      const url = new URL("harness/play.html?diag=lite", server.url);
      await page.goto(url.href, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => Boolean(
        window.CnCPort?.rpc && window.ZeroHAssetLibrary && window.ZeroHRuntime,
      ));

      const before = await audioState(page);
      assert.equal(before.audio.created, false, "cold profile created AudioContext before user intent");
      assert.equal(before.mixer.created, false, "cold profile created mixer before user intent");
      assert.equal(before.settingsOpen, false, "Settings was unexpectedly open before launch");

      await exposeReadyLauncher(page);
      const launchButton = page.locator('[data-wizard-page="3"].is-visible [data-launch-game]');
      await launchButton.focus();
      // Keyboard activation intentionally has no pointerdown. This pins the
      // regression where DOM-control keydown was filtered before audio resume.
      await page.keyboard.press("Enter");

      // This assertion is intentionally BEFORE any wait for a running context.
      // The old tree can eventually recover through the late `play.start`
      // fallback, but startup sounds may already have been requested by then.
      // The trusted launch event itself must have entered the audio activation
      // path synchronously, ahead of launcher archive/recorder awaits.
      const immediate = await audioState(page);
      assert.equal(immediate.audio.created, true,
        "launch activation returned before creating the AudioContext");
      assert.ok(immediate.audio.resumeAttempts >= 1,
        "launch activation returned before attempting AudioContext.resume()");
      assert.ok(["window.keydown", "window.click"].includes(immediate.audio.lastResumeTrigger),
        `launch used late/non-gesture resume trigger: ${immediate.audio.lastResumeTrigger}`);
      assert.notEqual(immediate.audio.lastResumeTrigger, "play.start",
        "late play.start fallback masked the launcher activation regression");
      assert.equal(immediate.audio.lastUserActivation?.isActive, true,
        "launch resume did not execute during the trusted input event");

      await page.waitForFunction(async () => {
        const result = await window.CnCPort.rpc("state");
        return result.state?.browserAudioRuntime?.contextState === "running";
      });
      const running = await audioState(page);
      assert.equal(running.settingsOpen, false, "audio required Settings navigation to start");
      assert.equal(running.audio.contextCreations, 1, "launch created duplicate AudioContexts");
      assert.equal(running.audio.lastUserActivation?.isActive, true,
        "resume did not begin inside active user activation");
      assert.equal(running.mixer.created, true, "launch did not create the mixer graph");
      assert.equal(running.mixer.creations, 1, "launch created duplicate mixer graphs");
      for (const bus of ["music", "sound", "sound3D", "speech"]) {
        assert.equal(running.mixer.buses?.[bus]?.connected, true, `${bus} mixer bus is disconnected`);
        assert.ok(Number.isFinite(running.mixer.buses?.[bus]?.gain), `${bus} mixer gain is invalid`);
      }

      const firstClock = running.audio.currentTimeSeconds;
      await page.waitForTimeout(150);
      const advanced = await audioState(page);
      assert.ok(advanced.audio.currentTimeSeconds > firstClock,
        `running AudioContext clock did not advance (${firstClock} -> ${advanced.audio.currentTimeSeconds})`);

      await page.evaluate(() => window.CnCPort.rpc("setBrowserAudioMixerVolumes", {
        trigger: "audio-startup-activation-smoke",
        scriptVolumes: { music: 0, sound: 0.4, sound3D: 0.5, speech: 0.25 },
        systemVolumes: { music: 0.9, sound: 0.5, sound3D: 0.2, speech: 0.8 },
        zoomVolume: 0.5,
      }));
      // A later ordinary activation is a recovery opportunity, not permission
      // to replace the live context, duplicate buses, or reset mute/volume.
      await page.mouse.click(4, 4);
      const afterRetry = await audioState(page);
      assert.equal(afterRetry.audio.contextCreations, 1, "recovery activation replaced AudioContext");
      assert.equal(afterRetry.mixer.creations, 1, "recovery activation duplicated mixer graph");
      assert.deepEqual(afterRetry.mixer.busGains, {
        music: 0,
        sound: 0.2,
        sound3D: 0.05,
        speech: 0.2,
      }, "recovery activation reset mute/volume state");

      const directDiagnostics = await page.evaluate(async () => Promise.all([
        window.CnCPort.rpc("browserAudioRuntime"),
        window.CnCPort.rpc("browserAudioMixerRuntime"),
      ]));
      assert.equal(directDiagnostics[0].ok, true,
        "threaded browserAudioRuntime diagnostic did not stay main-side");
      assert.equal(directDiagnostics[1].ok, true,
        "threaded browserAudioMixerRuntime diagnostic did not stay main-side");

      results.push({
        run,
        initialUserActivation: before.userActivation,
        launchTrigger: immediate.audio.lastResumeTrigger,
        finalTrigger: afterRetry.audio.lastResumeTrigger,
        resumeAttempts: afterRetry.audio.resumeAttempts,
        contextCreations: afterRetry.audio.contextCreations,
        mixerCreations: afterRetry.mixer.creations,
        clockAdvanceSeconds: Number(
          (advanced.audio.currentTimeSeconds - firstClock).toFixed(6),
        ),
      });
    } finally {
      await context.close();
      await rm(profileDir, { recursive: true, force: true });
    }
  }
} finally {
  await server.close();
}

process.stdout.write(`${JSON.stringify({ ok: true, coldLaunches, results }, null, 2)}\n`);
