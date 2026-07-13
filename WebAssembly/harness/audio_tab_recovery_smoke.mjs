#!/usr/bin/env node

import assert from "node:assert/strict";
import { chromium } from "playwright";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    let visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    class LifecycleAudioContext extends EventTarget {
      constructor() {
        super();
        this.state = "suspended";
        this.currentTime = 0;
        this.baseLatency = 0;
        this.outputLatency = 0;
        this.destination = {};
        this.resumeCalls = 0;
        this.suspendCalls = 0;
        globalThis.__lifecycleAudioContext = this;
      }

      createGain() {
        return {
          gain: { value: 1 },
          connect() {},
          disconnect() {},
        };
      }

      async resume() {
        this.resumeCalls += 1;
        this.state = "running";
        this.currentTime += 0.1;
        this.dispatchEvent(new Event("statechange"));
      }

      async suspend() {
        this.suspendCalls += 1;
        this.state = "suspended";
        this.dispatchEvent(new Event("statechange"));
      }

      async close() {
        this.state = "closed";
        this.dispatchEvent(new Event("statechange"));
      }
    }

    Object.defineProperty(globalThis, "AudioContext", {
      configurable: true,
      value: LifecycleAudioContext,
    });
    globalThis.__setLifecycleVisibility = (state) => {
      visibilityState = state;
    };
  });

  const page = await context.newPage();
  await page.goto(new URL("harness/play.html?diag=lite", server.url).href, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  await page.mouse.click(4, 4);
  await page.waitForFunction(async () => {
    const result = await window.CnCPort.rpc("browserAudioRuntime");
    return result.browserAudioRuntime?.contextState === "running";
  });
  await page.evaluate(() => window.CnCPort.rpc("setBrowserAudioMixerVolumes", {
    trigger: "audio-tab-recovery-smoke",
    scriptVolumes: { music: 0, sound: 0.4, sound3D: 0.5, speech: 0.25 },
    systemVolumes: { music: 0.9, sound: 0.5, sound3D: 0.2, speech: 0.8 },
    zoomVolume: 0.5,
  }));

  async function suspendWhileHidden() {
    return page.evaluate(async () => {
      window.__setLifecycleVisibility("hidden");
      const before = window.__lifecycleAudioContext.resumeCalls;
      await window.__lifecycleAudioContext.suspend();
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 0));
      return {
        before,
        after: window.__lifecycleAudioContext.resumeCalls,
        state: window.__lifecycleAudioContext.state,
      };
    });
  }

  async function assertRecovered(trigger, activate) {
    const hidden = await suspendWhileHidden();
    assert.equal(hidden.state, "suspended", "hidden AudioContext did not suspend");
    assert.equal(hidden.after, hidden.before, "hidden statechange resumed background audio");

    await page.evaluate(activate);
    await page.waitForFunction((expectedTrigger) => window.CnCPort.rpc("browserAudioRuntime")
      .then((result) => result.browserAudioRuntime?.contextState === "running"
        && result.browserAudioRuntime?.lastResumeTrigger === expectedTrigger), trigger);
  }

  await assertRecovered("document.visibilitychange", () => {
    window.__setLifecycleVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await assertRecovered("window.focus", () => {
    window.__setLifecycleVisibility("visible");
    window.dispatchEvent(new Event("focus"));
  });
  await assertRecovered("window.pageshow", () => {
    window.__setLifecycleVisibility("visible");
    window.dispatchEvent(new Event("pageshow"));
  });

  await page.evaluate(async () => {
    window.__setLifecycleVisibility("visible");
    await window.__lifecycleAudioContext.suspend();
  });
  await page.waitForFunction(() => window.CnCPort.rpc("browserAudioRuntime")
    .then((result) => result.browserAudioRuntime?.contextState === "running"
      && result.browserAudioRuntime?.lastResumeTrigger === "context.statechange"));

  const result = await page.evaluate(async () => {
    const [audio, mixer] = await Promise.all([
      window.CnCPort.rpc("browserAudioRuntime"),
      window.CnCPort.rpc("browserAudioMixerRuntime"),
    ]);
    return {
      audio: audio.browserAudioRuntime,
      mixer: mixer.browserAudioMixerRuntime,
      resumeCalls: window.__lifecycleAudioContext.resumeCalls,
      suspendCalls: window.__lifecycleAudioContext.suspendCalls,
    };
  });

  assert.equal(result.audio.contextCreations, 1, "tab recovery replaced the AudioContext");
  assert.equal(result.mixer.creations, 1, "tab recovery duplicated the mixer graph");
  assert.deepEqual(result.mixer.busGains, {
    music: 0,
    sound: 0.2,
    sound3D: 0.05,
    speech: 0.2,
  }, "tab recovery reset mute/volume state");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    resumeCalls: result.resumeCalls,
    suspendCalls: result.suspendCalls,
    contextCreations: result.audio.contextCreations,
    mixerCreations: result.mixer.creations,
    busGains: result.mixer.busGains,
  }, null, 2)}\n`);

  await context.close();
} finally {
  await browser.close();
  await server.close();
}
