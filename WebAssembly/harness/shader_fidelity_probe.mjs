#!/usr/bin/env node
// Threaded launcher/runtime shader audit. Uses a persistent Chrome profile so
// it exercises the same OPFS, pthread and OffscreenCanvas path as the human
// launcher instead of the retired legacy play harness. The profile may already
// contain an installed archive set; a development server can otherwise stage
// its symlinked artifacts into that profile for this run.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profileDir = process.env.CNC_PROFILE_DIR;
const harnessUrl = process.env.CNC_HARNESS_URL ?? "https://127.0.0.1:8443/harness/play.html";
const sourceOverride = process.env.CNC_SOURCE_OVERRIDE === "1";
const outPath = process.env.CNC_PROBE_OUT ?? "/tmp/cnc-shader-fidelity.png";
if (!profileDir) {
  throw new Error("CNC_PROFILE_DIR must name a dedicated persistent launcher profile");
}

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

function readBigEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8, false);
  let cursor = 16;
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const offset = view.getUint32(cursor, false);
    const size = view.getUint32(cursor + 4, false);
    cursor += 8;
    const nameStart = cursor;
    while (bytes[cursor] !== 0) cursor += 1;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, cursor));
    cursor += 1;
    entries.push({ name, bytes: bytes.subarray(offset, offset + size) });
  }
  return entries;
}

function auditCorpusProgram(archive, entry) {
  const view = new DataView(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength);
  const version = view.getUint32(0, true);
  const shaderType = (version & 0xffff0000) >>> 0;
  const type = shaderType === 0xffff0000 ? "pixel"
    : shaderType === 0xfffe0000 ? "vertex" : "unknown";
  const instructions = [];
  let cursor = 4;
  while (cursor + 3 < entry.bytes.byteLength) {
    const token = view.getUint32(cursor, true);
    if (token === 0x0000ffff) break;
    const info = corpusOpcodes.get(token & 0xffff);
    if (!info) {
      instructions.push(`unsupported:${token & 0xffff}`);
      break;
    }
    instructions.push(info.name);
    cursor += (1 + info.params) * 4;
  }
  return {
    archive,
    name: entry.name,
    type,
    model: `${(version >>> 8) & 0xff}.${version & 0xff}`,
    instructions,
  };
}

async function auditShippedCorpus() {
  const programs = [];
  for (const archive of ["Shaders.big", "ShadersZH.big"]) {
    const bytes = new Uint8Array(await readFile(resolve(
      wasmRoot, "artifacts/real-assets", archive,
    )));
    for (const entry of readBigEntries(bytes)) {
      programs.push(auditCorpusProgram(archive, entry));
    }
  }
  return programs;
}

const shippedCorpus = await auditShippedCorpus();

const playwrightPath = process.env.CNC_PLAYWRIGHT_PATH
  ?? resolve(wasmRoot, "node_modules/playwright/index.js");
const playwright = await import(playwrightPath);
const chromium = playwright.chromium ?? playwright.default?.chromium;
const chromiumArgs = (process.env.CNC_CHROMIUM_ARGS ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const context = await chromium.launchPersistentContext(profileDir, {
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

const failures = [];
function check(name, ok, detail) {
  process.stderr.write(`[shader-fidelity] ${ok ? "PASS" : "FAIL"} ${name}`
    + ` ${JSON.stringify(detail ?? null)}\n`);
  if (!ok) failures.push({ name, detail });
}

try {
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
  process.stderr.write("[shader-fidelity] launch requested by autostart\n");
  await page.waitForFunction(() => window.ZeroHRuntime.started === true);
  process.stderr.write("[shader-fidelity] runtime started\n");
  await page.evaluate(() => window.CnCPort.rpc("d3d8SM1ShaderAudit", { enable: true }));
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
  // Observe several more presentation frames after the first translated tree
  // draw so the relative-constant audit has a real wind-animation interval.
  await page.waitForTimeout(4_000);

  const result = await page.evaluate(async () => {
    const audit = await window.CnCPort.rpc("d3d8SM1ShaderAudit", {});
    const status = await window.CnCPort.rpc("threadedStatus", {});
    const screenshot = await window.CnCPort.rpc("screenshot", {});
    return { audit, status, screenshot };
  });
  process.stderr.write("[shader-fidelity] audit captured\n");
  const screenshotData = result.screenshot?.screenshot?.dataUrl
    ?? result.screenshot?.screenshot ?? null;
  if (typeof screenshotData === "string" && screenshotData.includes(",")) {
    await writeFile(outPath, Buffer.from(screenshotData.split(",")[1], "base64"));
  }

  const audit = result.audit?.audit ?? {};
  const relativeShaders = (audit.vertexShaders ?? []).filter((shader) =>
    (shader.relativeConstantReads ?? []).length > 0);
  const relativeHandles = new Set(relativeShaders.map((shader) => shader.handle));
  const relativePairs = (audit.pairs ?? []).filter((pair) => relativeHandles.has(pair.vsHandle));
  const perf = result.status?.status?.graphics?.d3d8Perf
    ?? result.status?.graphics?.d3d8Perf
    ?? {};
  check("ps11 tier active", result.status?.status?.shaderTier === "ps11"
    || result.status?.shaderTier === "ps11", result.status?.status ?? result.status);
  check("complete shell-map shader set registered",
    (audit.pixelShaders?.length ?? 0) === 13 && (audit.vertexShaders?.length ?? 0) >= 1,
    { pixel: audit.pixelShaders?.length, vertex: audit.vertexShaders?.length });
  check("all 18 retail shader files inventoried", shippedCorpus.length === 18
    && shippedCorpus.filter((shader) => shader.type === "pixel").length === 14
    && shippedCorpus.filter((shader) => shader.type === "vertex").length === 4
    && shippedCorpus.every((shader) => shader.model === "1.1")
    && shippedCorpus.every((shader) =>
      shader.instructions.every((instruction) => !instruction.startsWith("unsupported:"))),
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
  check("all linked programs succeeded", perf.sm1PairProgramFailures === 0,
    { failures: perf.sm1PairProgramFailures, linked: perf.sm1PairProgramsLinked });
  check("relative-address vertex shader identified", relativeShaders.length > 0,
    relativeShaders);
  check("relative-address shader draws", relativePairs.some((pair) => pair.draws > 0),
    relativePairs);
  check("tree/wind constants change across rendered frames",
    relativePairs.some((pair) => pair.vertexConstantStateChanges > 1
      && pair.vertexConstantUploads > 1), relativePairs);

  process.stdout.write(`${JSON.stringify({
    ok: failures.length === 0,
    renderer: result.status?.status?.graphics?.renderer ?? result.status?.graphics?.renderer,
    perf,
    shippedCorpus,
    audit,
    screenshot: outPath,
    failures,
  }, null, 2)}\n`);
} finally {
  // A broken runtime shutdown must not leave a verification profile locked.
  // The close track owns that bug; this shader probe gives Playwright a short
  // graceful window, then terminates its own process/browser tree.
  const forcedExit = setTimeout(() => process.exit(failures.length > 0 ? 1 : 0), 5_000);
  await context.close();
  clearTimeout(forcedExit);
}

if (failures.length > 0) process.exitCode = 1;
