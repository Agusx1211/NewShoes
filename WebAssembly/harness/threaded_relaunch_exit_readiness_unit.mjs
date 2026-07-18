#!/usr/bin/env node

import assert from "node:assert/strict";

import { waitForRelaunchExitReady } from "./threaded_relaunch_exit.mjs";

function querySample(ready = true) {
  return {
    ok: ready,
    result: {
      found: ready,
      // The shipped Exit control can remain under a manager-hidden visual
      // parent while the named-window RPC can still route input to it.
      clickable: false,
      hidden: false,
      managerHidden: true,
    },
  };
}

const samples = [
  // Reproduces the observed transient: one query can find the Exit window
  // before the next engine-loop sample removes it again.
  querySample(true),
  querySample(false),
  querySample(true),
  querySample(true),
  querySample(true),
  querySample(true),
];
let sampleIndex = 0;
const page = {
  async evaluate(_callback) {
    return samples[sampleIndex++];
  },
  async waitForTimeout() {},
};

const result = await waitForRelaunchExitReady(page, {
  timeoutMs: 10000,
  pollMs: 0,
  stableSamples: 4,
});
assert.equal(result.ready, true);
assert.equal(result.sampleCount, 6, "transient readiness must reset the stability window");
assert.equal(result.stableSamples, 4);
assert.equal(result.queryResponse.result.clickable, false,
  "named-window readiness must not depend on visual hit-test state");

process.stdout.write("threaded relaunch Exit readiness unit: OK\n");
