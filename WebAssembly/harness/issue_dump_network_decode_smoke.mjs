import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = await mkdtemp(resolve(tmpdir(), "cnc-network-dump-"));
const dumpPath = resolve(root, "network.cncdump.json");
const output = resolve(root, "decoded");
const decoder = resolve(process.cwd(), "../.claude/skills/issue-dump-analysis/scripts/decode_issue_dump.py");

try {
  await writeFile(dumpPath, JSON.stringify({
    schema: "cnc.issue-dump.v1",
    id: "network-test",
    generatedAt: "2026-07-12T00:00:00.000Z",
    manifest: { counts: {} },
    timeline: [],
    frameSamples: [],
    crash: {
      schema: "cnc.crash.v1",
      id: "network-test-crash",
      capturedAt: "2026-07-12T00:00:00.000Z",
      markerFrame: 42,
      primary: {
        kind: "engine-worker",
        stage: "running",
        message: "worker stopped",
        error: { name: "Error", message: "worker stopped" },
      },
      related: [],
      diagnostics: { rpc: {}, memory: {} },
    },
    issues: [],
    logs: [],
    networkDiagnostics: {
      schema: "cnc.network-diagnostics.v1",
      enabled: true,
      complete: true,
      retained: { packets: 1, packetBytes: 3, events: 1, rtcSamples: 1, engineSamples: 1 },
      totals: { packets: 1, packetBytes: 3, events: 1, rtcSamples: 1, engineSamples: 1 },
      evicted: { packets: 0, packetBytes: 0, events: 0, rtcSamples: 0, engineSamples: 0 },
      packets: [{ epochUs: 1_000_000, direction: "send", outcome: "sent", payloadHex: "0102ff" }],
      events: [{ epochUs: 1_100_000, type: "bridge.incoming.enqueued" }],
      rtcSamples: [{ epochUs: 1_200_000, peers: [] }],
      engineSamples: [{ epochUs: 1_300_000, network: { frameDataReady: false } }],
    },
  }), "utf8");
  const { stdout } = await execFileAsync("python3", [decoder, dumpPath, "--out", output]);
  const summary = JSON.parse(stdout);
  assert.equal(summary.networkDiagnostics.complete, true);
  assert.equal(summary.crash.kind, "engine-worker");
  assert.equal(summary.crash.stage, "running");
  assert.deepEqual(summary.crash.diagnosticKeys, ["memory", "rpc"]);
  assert.equal(summary.networkDiagnostics.directions.send, 1);
  assert.equal(summary.networkDiagnostics.outcomes.sent, 1);
  const packets = await readFile(resolve(output, "network/packets.ndjson"), "utf8");
  assert.match(packets, /"payloadHex":"0102ff"/);
  const engine = await readFile(resolve(output, "network/engine-lockstep.ndjson"), "utf8");
  assert.match(engine, /"frameDataReady":false/);
  const crash = await readFile(resolve(output, "crash.redacted.json"), "utf8");
  assert.match(crash, /"engine-worker"/);
  console.log("issue dump network extraction smoke passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
