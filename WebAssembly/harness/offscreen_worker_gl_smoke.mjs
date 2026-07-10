// offscreen_worker_gl_smoke.mjs — JS-only feasibility smoke for the
// engine-thread architecture ("the browser as a 2003 PC", IDEAS.md):
// proves OffscreenCanvas + WebGL2 works from a dedicated worker under this
// dev box's headless SwiftShader Chromium (the CI baseline), and documents
// the blocked-worker presentation behavior that governs load screens.
//
// What it proves:
//   1. transferControlToOffscreen() -> module worker -> getContext("webgl2")
//      succeeds off the main thread (renderer string reported).
//   2. requestAnimationFrame availability in a dedicated worker (with a
//      setTimeout(16) fallback that is reported, never silently used).
//   3. Frames drawn in the worker actually PRESENT on the page's placeholder
//      canvas: Playwright element screenshots are non-black and two shots
//      ~10 frames apart differ.
//   4. While the worker is synchronously blocked (busy-loop ~2s), the MAIN
//      thread keeps ticking, the canvas keeps showing the last presented
//      frame (frozen, not broken), no new frame presents during the block,
//      and animation resumes after the block.
//
// Run: node harness/offscreen_worker_gl_smoke.mjs

import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");

// --- Minimal PNG decode (8-bit RGB/RGBA, non-interlaced — what Playwright
// emits) so the smoke can assert on real pixels without a PNG dependency. ---

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("not a PNG");
  }
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  let pos = 8;
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString("latin1", pos + 4, pos + 8);
    const data = buffer.subarray(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(
      `unsupported PNG layout (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`,
    );
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowIn = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const rowOut = pixels.subarray(y * stride, (y + 1) * stride);
    const prevRow = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? rowOut[x - channels] : 0;
      const b = prevRow ? prevRow[x] : 0;
      const c = x >= channels && prevRow ? prevRow[x - channels] : 0;
      let value = rowIn[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) value += paeth(a, b, c);
      else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      rowOut[x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function pixelStats(image) {
  const { pixels, channels } = image;
  let lumaSum = 0;
  let maxChannel = 0;
  const colors = new Set();
  const count = pixels.length / channels;
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    lumaSum += (r * 299 + g * 587 + b * 114) / 1000;
    if (r > maxChannel) maxChannel = r;
    if (g > maxChannel) maxChannel = g;
    if (b > maxChannel) maxChannel = b;
    if (colors.size < 4096) colors.add((r << 16) | (g << 8) | b);
  }
  return {
    meanLuma: Number((lumaSum / count).toFixed(2)),
    maxChannel,
    distinctColors: colors.size,
  };
}

function diffRatio(imageA, imageB) {
  if (
    imageA.width !== imageB.width ||
    imageA.height !== imageB.height ||
    imageA.channels !== imageB.channels
  ) {
    return 1;
  }
  const { channels } = imageA;
  let differing = 0;
  const count = imageA.pixels.length / channels;
  for (let i = 0; i < imageA.pixels.length; i += channels) {
    if (
      imageA.pixels[i] !== imageB.pixels[i] ||
      imageA.pixels[i + 1] !== imageB.pixels[i + 1] ||
      imageA.pixels[i + 2] !== imageB.pixels[i + 2]
    ) {
      differing += 1;
    }
  }
  return Number((differing / count).toFixed(4));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
  const browser = await chromium.launch();
  let failure = null;
  const summary = {
    smoke: "offscreen-worker-gl",
    webgl2InWorker: false,
    rendererString: null,
    rafInWorker: null,
    loopMode: null,
    framesPresented: 0,
    mainThreadTicksDuringBlock: null,
    framesDrawnDuringBlock: null,
    presentedDuringBlock: null,
    blockObservedMs: null,
    screenshots: {},
  };

  try {
    const page = await browser.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        process.stderr.write(`[page:error] ${msg.text()}\n`);
      }
    });
    page.on("pageerror", (error) => {
      process.stderr.write(`[page:pageerror] ${error?.message ?? error}\n`);
    });

    const url = new URL("harness/offscreen_worker_gl_smoke.html", server.url).href;
    await page.goto(url, { waitUntil: "load" });

    // 1-2. Transfer the canvas to the worker, create WebGL2 there.
    const info = await page.evaluate(() => window.__startOffscreenGl());
    summary.webgl2InWorker = info.webgl2InWorker === true;
    summary.rendererString = info.rendererString ?? null;
    summary.rafInWorker = info.rafInWorker ?? null;
    summary.loopMode = info.loopMode ?? null;
    if (info.error) {
      process.stderr.write(`[worker:init-error] ${info.error}\n`);
    }
    if (info.transferControlAvailable === false) {
      throw new Error("CRITICAL: transferControlToOffscreen is unavailable in this Chromium");
    }
    if (!summary.webgl2InWorker) {
      throw new Error(
        "CRITICAL: getContext('webgl2') on an OffscreenCanvas in a dedicated worker returned null",
      );
    }

    // 3. Let the worker animate, capture two screenshots ~10 frames apart.
    const canvas = page.locator("#glcanvas");
    const shoot = async (name) => {
      const path = resolve(screenshotDir, `offscreen_worker_gl_${name}.png`);
      const png = await canvas.screenshot({ path });
      summary.screenshots[name] = path;
      return decodePng(png);
    };

    await page.evaluate(() => window.__waitForFrames(15));
    const shotA = await shoot("anim_a");
    const frameAtShotA = await page.evaluate(() => window.__frameCount());
    await page.evaluate((target) => window.__waitForFrames(target), frameAtShotA + 10);
    const shotB = await shoot("anim_b");
    summary.loopMode = await page.evaluate(() => window.__loopMode());
    summary.framesPresented = await page.evaluate(() => window.__frameCount());
    const statsA = pixelStats(shotA);
    const animDiff = diffRatio(shotA, shotB);

    // 4-5. Block the worker for ~2s; observe main-thread liveness + canvas.
    const blockMs = 2000;
    await page.evaluate((ms) => window.__beginBusyBlock(ms), blockMs);
    await sleep(300);
    const shotBlock1 = await shoot("block_early");
    await sleep(900);
    const shotBlock2 = await shoot("block_late");
    const busyEnd = await page.evaluate(() => window.__awaitBusyEnd());
    summary.mainThreadTicksDuringBlock = busyEnd.mainThreadTicksDuringBlock;
    summary.framesDrawnDuringBlock = busyEnd.framesDrawnDuringBlock;
    summary.blockObservedMs = Number(busyEnd.blockObservedMs.toFixed(0));
    const blockDiff = diffRatio(shotBlock1, shotBlock2);
    summary.presentedDuringBlock = blockDiff > 0 || busyEnd.framesDrawnDuringBlock > 0;
    const statsBlock = pixelStats(shotBlock2);

    // Resume: animation continues after the block.
    await page.evaluate(
      (target) => window.__waitForFrames(target),
      busyEnd.frameAtEnd + 10,
    );
    const shotResume = await shoot("resume");
    const resumeDiff = diffRatio(shotBlock2, shotResume);

    const checks = [];
    checks.push(["webgl2 context created in worker", summary.webgl2InWorker]);
    checks.push(["renderer string reported", typeof summary.rendererString === "string" && summary.rendererString.length > 0]);
    checks.push(["worker animation produced frames", summary.framesPresented >= 25]);
    checks.push([`animated canvas screenshot is non-black (meanLuma=${statsA.meanLuma} maxChannel=${statsA.maxChannel})`, statsA.meanLuma >= 8 && statsA.distinctColors >= 2]);
    checks.push([`screenshots ~10 frames apart differ (diffRatio=${animDiff})`, animDiff > 0.001]);
    checks.push([`main-thread rAF kept ticking during 2s worker block (ticks=${summary.mainThreadTicksDuringBlock})`, summary.mainThreadTicksDuringBlock >= 30]);
    checks.push([`worker drew no frames while blocked (framesDrawnDuringBlock=${summary.framesDrawnDuringBlock})`, summary.framesDrawnDuringBlock === 0]);
    checks.push([`canvas kept last frame during block, non-black (meanLuma=${statsBlock.meanLuma})`, statsBlock.meanLuma >= 8]);
    checks.push([`animation resumed after block (diffRatio=${resumeDiff})`, resumeDiff > 0.001]);

    for (const [name, ok] of checks) {
      process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}\n`);
    }
    // Finding, not an assertion: whether any frame presented DURING the block
    // (expected: no — a blocked engine thread means a frozen, not broken,
    // load screen).
    process.stdout.write(
      `info  presentedDuringBlock=${summary.presentedDuringBlock} ` +
        `(blockScreenshotDiffRatio=${blockDiff}, expected no presentation while blocked)\n`,
    );
    process.stdout.write(`info  rendererString=${JSON.stringify(summary.rendererString)}\n`);
    process.stdout.write(
      `info  rafInWorker=${summary.rafInWorker} loopMode=${summary.loopMode} ` +
        `framesPresented=${summary.framesPresented} blockObservedMs=${summary.blockObservedMs}\n`,
    );

    const failed = checks.filter(([, ok]) => !ok);
    if (failed.length > 0) {
      failure = `offscreen worker GL smoke failed: ${failed.map(([n]) => n).join(", ")}`;
    }
  } catch (error) {
    failure = error instanceof Error ? error.stack ?? error.message : String(error);
  } finally {
    await browser.close();
    await server.close();
  }

  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (failure) {
    process.stderr.write(`${failure}\n`);
    process.exit(1);
  }
  process.stdout.write("offscreen worker GL smoke: OK\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
