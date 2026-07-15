#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PAGES_HARNESS_FILES } from "./pages_site_manifest.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const recorderSource = await readFile(resolve(wasmRoot, "harness/issue-recorder.mjs"), "utf8");
const playSource = await readFile(resolve(wasmRoot, "harness/play.mjs"), "utf8");
const bridgeSource = await readFile(resolve(wasmRoot, "harness/bridge.js"), "utf8");
const crashSource = await readFile(resolve(wasmRoot, "harness/crash-diagnostics.mjs"), "utf8");
const playHtml = await readFile(resolve(wasmRoot, "harness/play.html"), "utf8");
const runtimeCss = await readFile(resolve(wasmRoot, "harness/launcher-runtime.css"), "utf8");

const forbidden = [
  ["periodic crash-draft timer", /DRAFT_PERSIST_INTERVAL_MS|persistDraft\(["']periodic["']\)/],
  ["idle crash-draft scheduling", /scheduleDraftPersist|requestIdleCallback/],
  ["browser session marker", /cnc_issue_recorder_session|SESSION_MARKER_KEY|updateSessionMarker/],
  ["page-lifecycle persistence", /bindLifecycleCapture|markSessionClosed/],
  ["previous-session crash recovery", /recoveredCrash|downloadRecoveredCrashReport/],
  ["normal threaded-status crash polling", /contextLossReported|status\?\.contextLost/],
];

const combinedSource = `${recorderSource}\n${playSource}`;
for (const [description, pattern] of forbidden) {
  assert.doesNotMatch(combinedSource, pattern, `Crash diagnostics reintroduced ${description}`);
}

assert.doesNotMatch(recorderSource, /captureCrash|CrashDiagnostics|CRASH_RPC_TIMEOUT/,
  "Crash-only logic leaked into the always-loaded issue recorder");
assert.doesNotMatch(playSource, /^\s*import\s+.*crash-diagnostics/m,
  "Crash diagnostics must not be statically imported");
assert.doesNotMatch(`${playSource}\n${bridgeSource}`, /cncport:runtimefatal|dispatchRuntimeFatal/,
  "Crash diagnostics reintroduced a normal-runtime fatal event hook");
assert.doesNotMatch(`${playSource}\n${playHtml}\n${runtimeCss}`, /querySelector\(["']#crash|id=["']crashModal|\.crash-modal/,
  "Crash-dialog DOM or CSS leaked into normal page startup");
assert.ok(PAGES_HARNESS_FILES.includes("crash-diagnostics.mjs"),
  "Hosted builds would omit the lazy crash diagnostics module");

const required = [
  ["failure-only dynamic import", playSource, /import\(["']\.\/crash-diagnostics\.mjs["']\)/],
  ["existing failure-path integration", playSource, /showRuntimeCrash\(\{ kind, stage, message, detail, error \}\)/],
  ["fatal capture entry point", crashSource, /function captureCrash\(recorder, failure\)/],
  ["crash-time diagnostics", crashSource, /async function captureCrashDiagnostics\(recorder\)/],
  ["explicit crash report download", crashSource, /async function downloadCrashReport\(/],
  ["failure-only dialog installation", crashSource, /function installCrashDialog\(\)/],
];
for (const [description, source, pattern] of required) {
  assert.match(source, pattern, `Crash diagnostics lost ${description}`);
}

console.log("crash diagnostics zero-steady-state-work contract passed");
