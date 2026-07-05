import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

function usage() {
  console.error("usage: node harness/replay_issue_dump.mjs <dump.cncdump.json> [--issue=issue-001] [--out=artifacts/issue-replays]");
  process.exit(2);
}

function parseArgs(argv) {
  const args = { dumpPath: null, issueId: null, outDir: "artifacts/issue-replays" };
  for (const arg of argv) {
    if (arg.startsWith("--issue=")) {
      args.issueId = arg.slice("--issue=".length);
    } else if (arg.startsWith("--out=")) {
      args.outDir = arg.slice("--out=".length);
    } else if (!args.dumpPath) {
      args.dumpPath = arg;
    } else {
      usage();
    }
  }
  if (!args.dumpPath) {
    usage();
  }
  return args;
}

function win32PointLParam(point) {
  return ((point.y & 0xffff) << 16) | (point.x & 0xffff);
}

function findIssue(dump, issueId) {
  if (issueId) {
    const issue = dump.issues?.find((candidate) => candidate.id === issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found in dump`);
    }
    return issue;
  }
  return dump.issues?.[0] ?? null;
}

function inputEventsForIssue(dump, issue) {
  const markerFrame = Number(issue?.markerFrame ?? Number.POSITIVE_INFINITY);
  return (dump.timeline ?? [])
    .filter((event) => event?.type?.startsWith("input."))
    .filter((event) => {
      const frame = Number(event.frame);
      return !Number.isFinite(markerFrame) || !Number.isFinite(frame) || frame <= markerFrame;
    })
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

async function rpc(page, command, payload = {}) {
  const result = await page.evaluate(
    ([cmd, data]) => window.CnCPort.rpc(cmd, data),
    [command, payload],
  );
  if (result?.ok !== true) {
    throw new Error(`${command} failed: ${JSON.stringify(result).slice(0, 1200)}`);
  }
  return result;
}

async function runFrames(page, frames) {
  let remaining = Math.max(0, Math.floor(frames));
  while (remaining > 0) {
    const batch = Math.min(remaining, 60);
    await rpc(page, "realEngineFrameTick", { frames: batch });
    remaining -= batch;
  }
}

async function replayInputEvent(page, event) {
  const data = event.data ?? {};
  if (event.type === "input.pointer" || event.type === "input.wheel") {
    const message = data.win32Message;
    if (message?.message != null) {
      const point = message.point ?? data.enginePoint ?? { x: 0, y: 0 };
      await rpc(page, "postMessage", {
        message: Number(message.message),
        wParam: Number(message.wParam ?? 0),
        lParam: Number(message.lParam ?? win32PointLParam(point)),
        point,
      });
    }
    return;
  }
  if (event.type === "input.key") {
    const key = data.key && data.key !== "Unidentified" ? data.key : data.code;
    if (!key) {
      return;
    }
    if (data.eventType === "keydown") {
      await page.keyboard.down(key);
    } else if (data.eventType === "keyup") {
      await page.keyboard.up(key);
    }
  }
}

function replayUrl(serverUrl, dump) {
  const params = new URLSearchParams();
  params.set("autostart", "1");
  params.set("replay", "1");
  params.set("shellmap", dump.replay?.shellMap === false ? "0" : "1");
  if (dump.replay?.diagLevel === "full" || dump.replay?.diagLevel === "lite") {
    params.set("diag", dump.replay.diagLevel);
  } else {
    params.set("diag", "lite");
  }
  return new URL(`harness/play.html?${params}`, serverUrl).href;
}

const args = parseArgs(process.argv.slice(2));
const dump = JSON.parse(await readFile(args.dumpPath, "utf8"));
const issue = findIssue(dump, args.issueId);
if (!issue) {
  throw new Error("Dump has no issues to replay");
}

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const outDir = resolve(wasmRoot, args.outDir);
await mkdir(outDir, { recursive: true });

const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(300_000);
  const url = replayUrl(server.url, dump);
  console.error(`[replay] loading ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => document.querySelector("#overlay")?.classList.contains("hidden")
      || document.querySelector("#progress")?.textContent?.startsWith("FAILED"),
    null,
    { timeout: 300_000, polling: 1_000 },
  );
  const progress = await page.locator("#progress").textContent();
  if (progress?.startsWith("FAILED")) {
    throw new Error(progress);
  }

  const events = inputEventsForIssue(dump, issue);
  const firstFrame = Number(events.find((event) => Number.isFinite(Number(event.frame)))?.frame ?? 0);
  let currentFrame = firstFrame;
  console.error(`[replay] replaying ${events.length} input events to ${issue.id} frame=${issue.markerFrame}`);
  for (const event of events) {
    const frame = Number(event.frame);
    if (Number.isFinite(frame)) {
      await runFrames(page, Math.max(0, frame - currentFrame));
      currentFrame = Math.max(currentFrame, frame);
    }
    await replayInputEvent(page, event);
  }
  const markerFrame = Number(issue.markerFrame);
  if (Number.isFinite(markerFrame)) {
    await runFrames(page, Math.max(0, markerFrame - currentFrame));
  }
  const state = await rpc(page, "state", {});
  const screenshot = await page.locator("#viewport").screenshot();
  const baseName = `${dump.id ?? "dump"}-${issue.id}`;
  const screenshotPath = resolve(outDir, `${baseName}.png`);
  const statePath = resolve(outDir, `${baseName}.state.json`);
  await writeFile(screenshotPath, screenshot);
  await writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({
    ok: true,
    issue: issue.id,
    inputEvents: events.length,
    screenshot: screenshotPath,
    state: statePath,
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
