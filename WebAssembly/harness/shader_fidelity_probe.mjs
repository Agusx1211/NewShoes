#!/usr/bin/env node
// Threaded launcher/runtime shader audit. Uses a persistent Chrome profile so
// it exercises the same OPFS, pthread and OffscreenCanvas path as the human
// launcher instead of the retired legacy play harness. The profile may already
// contain an installed archive set; a development server can otherwise stage
// its symlinked artifacts into that profile for this run.
import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profileDir = process.env.CNC_PROFILE_DIR;
const harnessUrl = process.env.CNC_HARNESS_URL ?? "https://127.0.0.1:8443/harness/play.html";
const sourceOverride = process.env.CNC_SOURCE_OVERRIDE === "1";
const outPath = process.env.CNC_PROBE_OUT ?? "/tmp/cnc-shader-fidelity.png";
if (!profileDir) {
  throw new Error("CNC_PROFILE_DIR must name a dedicated persistent launcher profile");
}

const expectedCorpusManifest = [
  ["Shaders.big", "Shaders\\invmonochrome.pso", "pixel"],
  ["Shaders.big", "Shaders\\monochrome.pso", "pixel"],
  ["Shaders.big", "Shaders\\motionblur.pso", "pixel"],
  ["Shaders.big", "Shaders\\MotionBlur.vso", "vertex"],
  ["Shaders.big", "Shaders\\roadnoise2.pso", "pixel"],
  ["Shaders.big", "Shaders\\terrain.pso", "pixel"],
  ["Shaders.big", "Shaders\\terrainnoise.pso", "pixel"],
  ["Shaders.big", "Shaders\\terrainnoise2.pso", "pixel"],
  ["Shaders.big", "Shaders\\wave.pso", "pixel"],
  ["Shaders.big", "Shaders\\wave.vso", "vertex"],
  ["ShadersZH.big", "Shaders\\fterrain.pso", "pixel"],
  ["ShadersZH.big", "Shaders\\fterrain0.pso", "pixel"],
  ["ShadersZH.big", "Shaders\\fterrainnoise.pso", "pixel"],
  ["ShadersZH.big", "Shaders\\fterrainnoise2.pso", "pixel"],
  ["ShadersZH.big", "Shaders\\motionblur.pso", "pixel"],
  ["ShadersZH.big", "Shaders\\MotionBlur.vso", "vertex"],
  ["ShadersZH.big", "Shaders\\Trees.pso", "pixel"],
  ["ShadersZH.big", "Shaders\\Trees.vso", "vertex"],
];

const corpusOpcodes = new Map([
  [1, { name: "mov", params: 2 }],
  [2, { name: "add", params: 3 }],
  [4, { name: "mad", params: 4 }],
  [5, { name: "mul", params: 3 }],
  [6, { name: "rcp", params: 2 }],
  [8, { name: "dp3", params: 3 }],
  [9, { name: "dp4", params: 3 }],
  [18, { name: "lrp", params: 4 }],
  [20, { name: "m4x4", params: 3 }],
  [66, { name: "tex", params: 1 }],
  [67, { name: "texbem", params: 2 }],
]);

const textDecoder = new TextDecoder();

function readBigEntries(bytes, archive) {
  if (bytes.byteLength < 16 || textDecoder.decode(bytes.subarray(0, 4)) !== "BIGF") {
    throw new Error(`${archive} is not a valid BIGF archive`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8, false);
  let cursor = 16;
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 8 > bytes.byteLength) {
      throw new Error(`${archive} directory entry ${index} is truncated`);
    }
    const offset = view.getUint32(cursor, false);
    const size = view.getUint32(cursor + 4, false);
    cursor += 8;
    const nameStart = cursor;
    while (cursor < bytes.byteLength && bytes[cursor] !== 0) cursor += 1;
    if (cursor >= bytes.byteLength) {
      throw new Error(`${archive} directory entry ${index} has no name terminator`);
    }
    const name = textDecoder.decode(bytes.subarray(nameStart, cursor));
    cursor += 1;
    if (offset + size > bytes.byteLength) {
      throw new Error(`${archive}:${name} payload is out of bounds`);
    }
    entries.push({ name, bytes: bytes.subarray(offset, offset + size) });
  }
  return entries;
}

function auditCorpusProgram(archive, entry) {
  const view = new DataView(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength);
  if (entry.bytes.byteLength < 8 || entry.bytes.byteLength % 4 !== 0) {
    return { archive, name: entry.name, type: "unknown", model: null,
      instructions: [], endTerminated: false, fullyAccounted: false };
  }
  const version = view.getUint32(0, true);
  const shaderType = (version & 0xffff0000) >>> 0;
  const type = shaderType === 0xffff0000 ? "pixel"
    : shaderType === 0xfffe0000 ? "vertex" : "unknown";
  const instructions = [];
  let cursor = 4;
  let parameterTokens = 0;
  let unsupportedOpcode = null;
  let endTerminated = false;
  while (cursor + 3 < entry.bytes.byteLength) {
    const token = view.getUint32(cursor, true);
    if (token === 0x0000ffff) {
      cursor += 4;
      endTerminated = true;
      break;
    }
    const opcode = token & 0xffff;
    const info = corpusOpcodes.get(opcode);
    if (!info) {
      unsupportedOpcode = opcode;
      break;
    }
    const instructionBytes = (1 + info.params) * 4;
    if (cursor + instructionBytes > entry.bytes.byteLength) {
      break;
    }
    instructions.push(info.name);
    parameterTokens += info.params;
    cursor += instructionBytes;
  }
  return {
    archive,
    name: entry.name,
    type,
    model: `${(version >>> 8) & 0xff}.${version & 0xff}`,
    instructions,
    instructionTokens: instructions.length,
    parameterTokens,
    unsupportedOpcode,
    endTerminated,
    parsedBytes: cursor,
    payloadBytes: entry.bytes.byteLength,
    fullyAccounted: endTerminated && unsupportedOpcode === null
      && cursor === entry.bytes.byteLength,
  };
}

async function auditShippedCorpus() {
  const programs = [];
  for (const archive of ["Shaders.big", "ShadersZH.big"]) {
    const bytes = new Uint8Array(await readFile(resolve(
      wasmRoot, "artifacts/real-assets", archive,
    )));
    for (const entry of readBigEntries(bytes, archive)) {
      programs.push(auditCorpusProgram(archive, entry));
    }
  }
  return programs;
}

async function readSourceMetadata() {
  let gitSha = process.env.CNC_SOURCE_SHA ?? null;
  let gitRef = process.env.CNC_SOURCE_REF ?? null;
  try {
    if (!gitSha) {
      gitSha = (await execFile("git", ["rev-parse", "HEAD"], { cwd: wasmRoot })).stdout.trim();
    }
    if (!gitRef) {
      gitRef = (await execFile("git", ["branch", "--show-current"], { cwd: wasmRoot })).stdout.trim();
    }
  } catch {
    // Synced verification trees may not carry a usable worktree .git file;
    // final/release runs provide CNC_SOURCE_SHA explicitly.
  }
  return {
    gitSha,
    gitRef,
    harnessUrl,
    sourceOverride,
    script: "harness/shader_fidelity_probe.mjs",
    capturedAt: new Date().toISOString(),
  };
}

function pngBytesFromDataUrl(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl ?? "");
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((value, index) => bytes[index] === value) ? bytes : null;
}

async function closeContextBounded(context, timeoutMs = 5_000) {
  if (!context) return { attempted: false, graceful: true, error: null };
  let timeout;
  try {
    const closePagesAndContext = async () => {
      await Promise.all(context.pages().map((page) =>
        page.close({ runBeforeUnload: false })));
      await context.close();
    };
    const result = await Promise.race([
      closePagesAndContext().then(() => "closed"),
      new Promise((resolveTimeout) => {
        timeout = setTimeout(() => resolveTimeout("timeout"), timeoutMs);
      }),
    ]);
    clearTimeout(timeout);
    return { attempted: true, graceful: result === "closed", error: null };
  } catch (error) {
    clearTimeout(timeout);
    return { attempted: true, graceful: false, error: error?.message ?? String(error) };
  }
}

const failures = [];
function check(name, ok, detail) {
  process.stderr.write(`[shader-fidelity] ${ok ? "PASS" : "FAIL"} ${name}`
    + ` ${JSON.stringify(detail ?? null)}\n`);
  if (!ok) failures.push({ name, detail });
}

let context = null;
let runError = null;
let verificationComplete = false;
let evidence = {};
const source = await readSourceMetadata();

try {
  const shippedCorpus = await auditShippedCorpus();
  const playwrightPath = process.env.CNC_PLAYWRIGHT_PATH
    ?? resolve(wasmRoot, "node_modules/playwright/index.js");
  const playwright = await import(playwrightPath);
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  const chromiumArgs = (process.env.CNC_CHROMIUM_ARGS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    args: [
      "--ignore-certificate-errors",
      "--autoplay-policy=no-user-gesture-required",
      "--enable-unsafe-swiftshader",
      ...chromiumArgs,
    ],
    executablePath: process.env.CNC_CHROMIUM || undefined,
  });

  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(300_000);
  if (sourceOverride) {
    const overrides = new Map([
      ["bridge.js", resolve(wasmRoot, "harness/bridge.js")],
      ["d3d8_executor.mjs", resolve(wasmRoot, "harness/d3d8_executor.mjs")],
      ["engine_realm_boot.mjs", resolve(wasmRoot, "harness/engine_realm_boot.mjs")],
    ]);
    await page.route("**/harness/*", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").pop();
      const path = overrides.get(name);
      if (!path) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: await readFile(path),
      });
    });
  }

  const url = new URL(harnessUrl);
  url.searchParams.set("shaderTier", "ps11");
  url.searchParams.set("autostart", "1");
  process.stderr.write(`[shader-fidelity] navigate ${url.href}\n`);
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.ZeroHRuntime && window.CnCPort));
  process.stderr.write("[shader-fidelity] launcher ready\n");
  await page.waitForFunction(() => window.ZeroHRuntime.started === true);
  process.stderr.write("[shader-fidelity] runtime started\n");
  const enabled = await page.evaluate(() =>
    window.CnCPort.rpc("d3d8SM1ShaderAudit", { enable: true }));
  if (enabled?.ok !== true || enabled?.enabled !== true) {
    throw new Error(`worker shader audit did not enable: ${JSON.stringify(enabled)}`);
  }

  const renderDeadline = Date.now() + 300_000;
  let renderStatus = null;
  while (Date.now() < renderDeadline) {
    renderStatus = await page.evaluate(() => window.CnCPort.rpc("threadedStatus", {}));
    const status = renderStatus?.status ?? renderStatus;
    const perf = status?.graphics?.d3d8Perf ?? {};
    if (status?.initState === "done" && status?.frame?.loadSessionActive === false
        && perf.sm1ShaderDraws > 0 && perf.sm1TranslatedVsDraws > 0) {
      break;
    }
    await page.waitForTimeout(2_000);
  }
  const settled = renderStatus?.status ?? renderStatus;
  if (settled?.graphics?.d3d8Perf?.sm1TranslatedVsDraws <= 0) {
    throw new Error(`ps11 scene did not reach translated vertex draws: ${JSON.stringify(settled)}`);
  }
  await page.waitForTimeout(4_000);

  const result = await page.evaluate(async () => {
    const audit = await window.CnCPort.rpc("d3d8SM1ShaderAudit", {});
    const status = await window.CnCPort.rpc("threadedStatus", {});
    const screenshot = await window.CnCPort.rpc("screenshot", {});
    const dataUrl = screenshot?.screenshot?.dataUrl ?? screenshot?.screenshot ?? null;
    let screenshotAnalysis = { ok: false, error: "PNG data URL missing" };
    if (screenshot?.ok === true && typeof dataUrl === "string"
        && dataUrl.startsWith("data:image/png;base64,")) {
      try {
        const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = bitmap.width;
        sampleCanvas.height = bitmap.height;
        const context2d = sampleCanvas.getContext("2d", { willReadFrequently: true });
        context2d.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = context2d.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
        const colors = new Set();
        let minLuminance = 255;
        let maxLuminance = 0;
        let nonTransparentSamples = 0;
        const columns = 32;
        const rows = 20;
        for (let row = 0; row < rows; row += 1) {
          const y = Math.min(sampleCanvas.height - 1,
            Math.floor(((row + 0.5) / rows) * sampleCanvas.height));
          for (let column = 0; column < columns; column += 1) {
            const x = Math.min(sampleCanvas.width - 1,
              Math.floor(((column + 0.5) / columns) * sampleCanvas.width));
            const offset = (y * sampleCanvas.width + x) * 4;
            const r = pixels[offset];
            const g = pixels[offset + 1];
            const b = pixels[offset + 2];
            const a = pixels[offset + 3];
            colors.add(`${r},${g},${b},${a}`);
            if (a > 0) nonTransparentSamples += 1;
            const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
            minLuminance = Math.min(minLuminance, luminance);
            maxLuminance = Math.max(maxLuminance, luminance);
          }
        }
        screenshotAnalysis = {
          ok: true,
          width: sampleCanvas.width,
          height: sampleCanvas.height,
          sampleCount: columns * rows,
          nonTransparentSamples,
          uniqueColorCount: colors.size,
          luminanceRange: maxLuminance - minLuminance,
        };
      } catch (error) {
        screenshotAnalysis = { ok: false, error: error?.message ?? String(error) };
      }
    }
    return { audit, status, screenshot, screenshotAnalysis, dataUrl };
  });
  process.stderr.write("[shader-fidelity] audit and screenshot captured\n");

  const audit = result.audit?.audit ?? {};
  const status = result.status?.status ?? result.status ?? {};
  const perf = status.graphics?.d3d8Perf ?? {};
  const relativeShaders = (audit.vertexShaders ?? []).filter((shader) =>
    (shader.relativeConstantReads ?? []).length > 0);
  const relativeHandles = new Set(relativeShaders.map((shader) => shader.handle));
  const relativePairs = (audit.pairs ?? []).filter((pair) => relativeHandles.has(pair.vsHandle));
  const linkedPairs = audit.linkedPairs ?? [];
  const linkedPairKeys = new Set(linkedPairs.filter((pair) => pair.linked === true)
    .map((pair) => `${pair.vsHandle}|${pair.psHandle}`));
  const auditPairsLinked = (audit.pairs ?? []).every((pair) =>
    linkedPairKeys.has(`${pair.vsHandle}|${pair.psHandle}`));

  const actualManifest = shippedCorpus.map((shader) =>
    [shader.archive, shader.name, shader.type]).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const expectedManifest = [...expectedCorpusManifest].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)));
  check("source SHA recorded", /^[0-9a-f]{40}$/.test(source.gitSha ?? ""), source);
  check("ps11 tier active", status.shaderTier === "ps11", {
    tier: status.shaderTier,
    renderer: status.graphics?.renderer,
  });
  check("complete shell-map shader set registered",
    (audit.pixelShaders?.length ?? 0) === 13 && (audit.vertexShaders?.length ?? 0) === 1,
    { pixel: audit.pixelShaders?.length, vertex: audit.vertexShaders?.length });
  check("exact retail shader manifest and streams",
    JSON.stringify(actualManifest) === JSON.stringify(expectedManifest)
      && shippedCorpus.every((shader) => shader.model === "1.1")
      && shippedCorpus.every((shader) => shader.endTerminated && shader.fullyAccounted)
      && shippedCorpus.every((shader) => shader.unsupportedOpcode === null)
      && shippedCorpus.every((shader) => shader.instructionTokens > 0
        && shader.parsedBytes === shader.payloadBytes),
    shippedCorpus);

  const expectedShellMapPixelSignatures = [
    "tex,dp3,mul,lrp",
    "tex,mov,mul",
    "tex,mov,mul,mul,mov",
    "tex,tex,lrp,mul",
    "tex,tex,mul,mul",
    "tex,tex,tex,lrp,mul,mul",
    "tex,tex,tex,mul,mul,mul",
    "tex,tex,tex,mul,mul,mul",
    "tex,tex,tex,tex,lrp,mul,mul,mul",
    "tex,tex,tex,tex,mul,mad,mul",
    "tex,tex,tex,tex,mul,mul,add,mul,add",
    "tex,tex,tex,tex,mul,mul,mul,mul",
    "tex,tex,texbem,mul,mul,add",
  ].sort();
  const actualPixelSignatures = (audit.pixelShaders ?? [])
    .map((shader) => shader.instructions.join(",")).sort();
  check("all shell-map pixel programs translated",
    JSON.stringify(actualPixelSignatures) === JSON.stringify(expectedShellMapPixelSignatures),
    actualPixelSignatures);
  check("all 19 shader pairs linked without fallback",
    linkedPairs.length === 19
      && linkedPairs.every((pair) => pair.linked === true)
      && perf.sm1PairProgramsLinked === 19
      && perf.sm1PairProgramsLinked === linkedPairs.length
      && perf.sm1PairProgramFailures === 0
      && perf.sm1FallbackDraws === 0
      && auditPairsLinked,
    {
      linkedPairs: linkedPairs.length,
      perfLinked: perf.sm1PairProgramsLinked,
      failures: perf.sm1PairProgramFailures,
      fallbacks: perf.sm1FallbackDraws,
      auditPairsLinked,
    });
  check("relative-address vertex shader identified", relativeShaders.length === 1,
    relativeShaders);
  check("relative-address shader draws", relativePairs.some((pair) => pair.draws > 0),
    relativePairs);
  check("tree/wind constants change across rendered frames",
    relativePairs.some((pair) => pair.vertexConstantStateChanges > 1), relativePairs);

  const screenshotBytes = pngBytesFromDataUrl(result.dataUrl);
  check("screenshot RPC returned a valid nonempty PNG",
    result.screenshot?.ok === true && screenshotBytes !== null && screenshotBytes.byteLength > 10_000,
    { rpcOk: result.screenshot?.ok, bytes: screenshotBytes?.byteLength ?? 0 });
  check("screenshot is visible and varied",
    result.screenshotAnalysis?.ok === true
      && result.screenshotAnalysis.width >= 640
      && result.screenshotAnalysis.height >= 480
      && result.screenshotAnalysis.nonTransparentSamples === result.screenshotAnalysis.sampleCount
      && result.screenshotAnalysis.uniqueColorCount >= 32
      && result.screenshotAnalysis.luminanceRange >= 32,
    result.screenshotAnalysis);
  if (screenshotBytes) {
    await writeFile(outPath, screenshotBytes);
  }

  evidence = {
    source,
    renderer: status.graphics?.renderer ?? null,
    frames: {
      logic: status.frame?.logicFrame ?? null,
      client: status.frame?.clientFrame ?? null,
    },
    shaderPerf: {
      pixelShadersRegistered: perf.sm1PixelShadersRegistered,
      vertexShadersRegistered: perf.sm1VertexShadersRegistered,
      pairProgramsLinked: perf.sm1PairProgramsLinked,
      pairProgramFailures: perf.sm1PairProgramFailures,
      shaderDraws: perf.sm1ShaderDraws,
      translatedVsDraws: perf.sm1TranslatedVsDraws,
      fallbackDraws: perf.sm1FallbackDraws,
    },
    shippedCorpus,
    audit,
    screenshot: {
      path: outPath,
      bytes: screenshotBytes?.byteLength ?? 0,
      analysis: result.screenshotAnalysis,
    },
  };
  verificationComplete = failures.length === 0;
} catch (error) {
  runError = error?.stack ?? error?.message ?? String(error);
  process.stderr.write(`[shader-fidelity] ERROR ${runError}\n`);
}

const close = await closeContextBounded(context);
if (!close.graceful) {
  runError ??= close.error
    ? `browser context close failed: ${close.error}`
    : "browser context close timed out";
}
const ok = verificationComplete && failures.length === 0 && runError === null;
const report = { ok, ...evidence, close, failures, error: runError };
await new Promise((resolveWrite) => {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`, resolveWrite);
});

const exitCode = ok ? 0 : 1;
process.exitCode = exitCode;
if (!close.graceful) {
  process.exit(exitCode);
}
