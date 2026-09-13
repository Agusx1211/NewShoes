// Exercise the shipping worker's direct frame RPC with its paced loop stopped.
// Preserving the drawing buffer prevents screenshot capture from redrawing and
// accidentally concealing an unfinished frame. Requires the normal game assets.
import { chromium } from "playwright";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = process.env.THREADED_FRAME_FLUSH_DIST ?? "dist-threaded-release";
const artifactRoot = resolve(wasmRoot, process.env.THREADED_FRAME_FLUSH_ARTIFACTS
  ?? "artifacts/threaded-frame-flush");
const browserArgs = (process.env.THREADED_FRAME_FLUSH_BROWSER_ARGS ?? "")
  .split(/\s+/).filter(Boolean);
const expect = (condition, message, detail) => {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(detail)}`);
};
expect(/^dist(?:[-_][A-Za-z0-9_-]+)?$/.test(dist), "invalid dist", dist);
await mkdir(artifactRoot, { recursive: true });
const server = await startStaticServer({ root: wasmRoot });
// Match the player's disk-backed OPFS quota; incognito contexts can keep the
// archive set in memory and run out of space during import.
const profileDir = await mkdtemp(resolve(artifactRoot, "profile-"));
let browser;
try {
  browser = await chromium.launchPersistentContext(profileDir, {
    headless: true, viewport: { width: 1280, height: 800 },
    args: ["--autoplay-policy=no-user-gesture-required", ...browserArgs],
  });
  const page = await browser.newPage();
  page.on("pageerror", error => console.error(error.message));
  const rpc = (command, payload = {}) => page.evaluate(
    ({ command, payload }) => window.CnCPort.rpc(command, payload), { command, payload });
  const url = new URL("harness/play.html", server.url);
  for (const [key, value] of Object.entries({
    autostart: "1", dist, preserveBuffer: "1", diag: "lite",
    perfCounters: "1", d3d8FrameQueue: "1",
  })) url.searchParams.set(key, value);
  await page.goto(url.href, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const engine = window.CnCPort?.state?.threadedEngine;
    return engine?.loop?.active === true && engine.frame?.loadSessionActive === false
      && (engine.loop.clientFrames ?? 0) > 40;
  }, null, { timeout: 15 * 60 * 1000, polling: 1000 });
  const stopped = await rpc("threadedStopLoop", { timeoutMs: 120000 });
  expect(stopped.ok === true, "worker loop did not stop", stopped);
  const initial = await rpc("threadedStatus");
  const renderer = initial.status?.graphics?.renderer;
  if (process.env.THREADED_FRAME_FLUSH_EXPECT_GPU) {
    expect(renderer?.includes(process.env.THREADED_FRAME_FLUSH_EXPECT_GPU),
      "unexpected renderer", renderer);
  }
  let previous = initial.status?.graphics?.d3d8Perf;
  expect(previous?.frameCommandQueueEnabled === true && previous.countersEnabled === true,
    "frame queue and counters are required", previous);
  const frames = [];
  for (let index = 0; index < 3; index += 1) {
    const frame = await rpc("realEngineFrameSummary", { frames: 1 });
    expect(frame.ok === true, "direct engine frame failed", frame);
    const status = await rpc("threadedStatus");
    const perf = status.status?.graphics?.d3d8Perf;
    const queued = perf.frameCommandQueuedDraws - previous.frameCommandQueuedDraws;
    const replayed = perf.frameCommandReplayedDraws - previous.frameCommandReplayedDraws;
    expect(queued > 0 && replayed === queued, "direct frame left queued draws unfinished",
      { index, queued, replayed });
    const shot = await rpc("screenshot");
    const dataUrl = typeof shot.screenshot === "string" ? shot.screenshot : shot.screenshot?.dataUrl;
    expect(dataUrl?.startsWith("data:image/png;base64,"), "screenshot failed", shot);
    const pixels = await page.evaluate(async dataUrl => {
      const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset] > 8 || data[offset + 1] > 8 || data[offset + 2] > 8) colored += 1;
      }
      return { width: canvas.width, height: canvas.height, colored };
    }, dataUrl);
    expect(pixels.colored > pixels.width * pixels.height * 0.005,
      "direct frame screenshot is blank", pixels);
    await writeFile(resolve(artifactRoot, `frame-${index}.png`),
      Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
    frames.push({ queued, replayed, pixels });
    previous = perf;
  }
  const result = { ok: true, dist, renderer, frames };
  await writeFile(resolve(artifactRoot, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
}
