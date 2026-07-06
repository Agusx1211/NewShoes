import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const outDir = resolve(process.env.SHELLMAP_CAPTURE_DIR ?? "/Users/aa/cnc-verify/shellmap-texture-labels");
const captureFrames = (process.env.SHELLMAP_CAPTURE_FRAMES ?? "360,720")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const assertCutoutDepth = process.env.SHELLMAP_ASSERT_CUTOUT_DEPTH === "1";
const assertInfantryTextures = process.env.SHELLMAP_ASSERT_INFANTRY_TEXTURES === "1";
const assertBattleFxTextures = process.env.SHELLMAP_ASSERT_BATTLE_FX_TEXTURES === "1";
const assertionMode = assertCutoutDepth || assertInfantryTextures || assertBattleFxTextures;
const drawHistoryLimit = Number(process.env.SHELLMAP_DRAW_HISTORY_LIMIT ?? (assertionMode ? 4096 : 256));

const archiveSpecs = [
  { name: "INIZH.big" },
  { name: "EnglishZH.big" },
  { name: "WindowZH.big" },
  { name: "MapsZH.big" },
  { name: "MusicZH.big" },
  { name: "GensecZH.big" },
  { name: "TerrainZH.big" },
  { name: "TexturesZH.big" },
  { name: "W3DZH.big" },
  { name: "W3DEnglishZH.big" },
  { name: "SpeechZH.big" },
  { name: "AudioZH.big" },
  { name: "ShadersZH.big" },
  { name: "ZZBase_INI.big", sourceName: "INI.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

function buildArchives(baseUrl) {
  return archiveSpecs.map((spec) => {
    const sourceName = spec.sourceName ?? spec.name;
    return {
      name: spec.name,
      sourceName,
      url: new URL(`artifacts/real-assets/${sourceName}`, baseUrl).href,
    };
  });
}

function compactDraw(draw, labelById) {
  const texture0Id = Number(draw.texture0?.id ?? 0);
  const texture1Id = Number(draw.texture1?.id ?? 0);
  return {
    seq: draw.drawSequence,
    primitiveType: draw.primitiveType,
    fvf: draw.vertexShaderFvf,
    stride: draw.vertexStride,
    vertexCount: draw.vertexCount,
    indexCount: draw.indexCount,
    renderState: draw.renderState,
    appliedRenderState: draw.appliedRenderState,
    texture0: { ...draw.texture0, label: labelById.get(texture0Id) ?? null },
    texture1: { ...draw.texture1, label: labelById.get(texture1Id) ?? null },
    vertexSummary: draw.vertexSummary,
    preDrawCenterPixel: draw.preDrawCenterPixel,
    centerPixel: draw.centerPixel,
  };
}

function topTextureNames(history) {
  const counts = new Map();
  for (const draw of history) {
    const texture = draw.texture0 ?? {};
    const label = texture.label ?? {};
    const name = label.name || label.path || `(id ${texture.id ?? 0})`;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 24)
    .map(([name, count]) => ({ name, count }));
}

function textureLabelName(texture) {
  return String(texture?.label?.name ?? texture?.label?.path ?? "").toLowerCase();
}

function drawUsesTexture(draw, nameFragment) {
  return textureLabelName(draw.texture0).includes(nameFragment) ||
    textureLabelName(draw.texture1).includes(nameFragment);
}

function isOpaqueDepthWritingDraw(draw) {
  const state = draw.renderState ?? {};
  return Number(state.alphaTestEnable ?? 0) === 0 &&
    Number(state.alphaBlendEnable ?? 0) === 0 &&
    Number(state.zEnable ?? 0) !== 0 &&
    Number(state.zWriteEnable ?? 0) !== 0;
}

function isBlendedDraw(draw) {
  return Number(draw.renderState?.alphaBlendEnable ?? 0) !== 0;
}

function hasImplicitCutout(draw) {
  return draw.appliedRenderState?.implicitAlphaCutout?.enabled === true;
}

function pixelLooksWhite(pixel) {
  return Array.isArray(pixel)
    && pixel[0] >= 220
    && pixel[1] >= 220
    && pixel[2] >= 220
    && pixel[3] >= 200;
}

function pixelLooksBlack(pixel) {
  return Array.isArray(pixel)
    && pixel[0] <= 8
    && pixel[1] <= 8
    && pixel[2] <= 8
    && pixel[3] >= 200;
}

function pixelHasVisibleColor(pixel) {
  return Array.isArray(pixel)
    && pixel[3] > 0
    && Math.max(pixel[0], pixel[1], pixel[2]) > 8;
}

function isGeneratedInfantryTexture(texture) {
  return textureLabelName(texture).startsWith("#-16711936#zhca_ui");
}

function textureSamplePixels(texture) {
  const pixels = [];
  for (const pixel of Object.values(texture?.samplePixels ?? {})) {
    if (Array.isArray(pixel)) {
      pixels.push(pixel);
    }
  }
  for (const sample of texture?.sampleVertexPixels ?? []) {
    if (Array.isArray(sample?.pixel)) {
      pixels.push(sample.pixel);
    }
  }
  return pixels;
}

function assertShellmapCutoutDepth(captures) {
  const errors = [];
  const draws = captures.flatMap((capture) =>
    capture.history.map((draw) => ({ ...draw, targetFrame: capture.targetFrame })));
  const battleshipCutouts = draws.filter((draw) =>
    drawUsesTexture(draw, "avbattlesh") && isOpaqueDepthWritingDraw(draw));
  const chinookCutouts = draws.filter((draw) =>
    drawUsesTexture(draw, "avchinook") && isOpaqueDepthWritingDraw(draw));
  const comancheBlends = draws.filter((draw) =>
    drawUsesTexture(draw, "avcomanche_p") && isBlendedDraw(draw));
  const shockwaveBlends = draws.filter((draw) =>
    drawUsesTexture(draw, "exshockwav") && isBlendedDraw(draw));

  if (battleshipCutouts.length < 6) {
    errors.push(`expected several opaque depth-writing avbattlesh draws, got ${battleshipCutouts.length}`);
  }
  if (chinookCutouts.length < 1) {
    errors.push("expected at least one opaque depth-writing avchinook draw");
  }
  if (comancheBlends.length < 1) {
    errors.push("expected at least one blended avcomanche_p draw");
  }
  if (shockwaveBlends.length < 1) {
    errors.push("expected at least one blended exshockwav draw");
  }

  const missingCutout = [...battleshipCutouts, ...chinookCutouts]
    .filter((draw) => !hasImplicitCutout(draw))
    .map((draw) => draw.seq)
    .slice(0, 16);
  if (missingCutout.length) {
    errors.push(`opaque texture-alpha depth draws missing implicit cutout at seq ${missingCutout.join(",")}`);
  }

  const blendedWithCutout = [...comancheBlends, ...shockwaveBlends]
    .filter((draw) => hasImplicitCutout(draw))
    .map((draw) => draw.seq)
    .slice(0, 16);
  if (blendedWithCutout.length) {
    errors.push(`blended effect/air draws unexpectedly used implicit cutout at seq ${blendedWithCutout.join(",")}`);
  }

  return {
    source: "shellmap-cutout-depth",
    ok: errors.length === 0,
    errors,
    counts: {
      battleshipCutouts: battleshipCutouts.length,
      chinookCutouts: chinookCutouts.length,
      comancheBlends: comancheBlends.length,
      shockwaveBlends: shockwaveBlends.length,
    },
  };
}

function assertShellmapInfantryTextures(captures) {
  const errors = [];
  const textureRecords = [];
  const draws = captures.flatMap((capture) =>
    capture.history.map((draw) => ({ ...draw, targetFrame: capture.targetFrame })));

  for (const draw of draws) {
    for (const texture of [draw.texture0, draw.texture1]) {
      if (isGeneratedInfantryTexture(texture)) {
        textureRecords.push({ draw, texture });
      }
    }
  }

  const uniqueTextures = new Set(textureRecords.map(({ texture }) =>
    textureLabelName(texture)));
  if (textureRecords.length < 8) {
    errors.push(`expected at least 8 generated infantry texture draws, got ${textureRecords.length}`);
  }
  if (uniqueTextures.size < 3) {
    errors.push(`expected at least 3 generated infantry texture names, got ${uniqueTextures.size}`);
  }

  const notReady = [];
  const notSampled = [];
  const badStorage = [];
  const missingUploads = [];
  const whiteOnly = [];

  for (const { draw, texture } of textureRecords) {
    const name = textureLabelName(texture);
    if (texture.ready !== true) {
      notReady.push({ seq: draw.seq, name });
    }
    if (texture.sampled !== true) {
      notSampled.push({ seq: draw.seq, name });
    }
    if (texture.storage !== "rgba8") {
      badStorage.push({ seq: draw.seq, name, storage: texture.storage ?? null });
    }
    if (Number(texture.uploads ?? 0) < 1) {
      missingUploads.push({ seq: draw.seq, name, uploads: texture.uploads ?? null });
    }
    const hasNonWhiteSample = textureSamplePixels(texture).some((pixel) =>
      pixelHasVisibleColor(pixel) && !pixelLooksWhite(pixel) && !pixelLooksBlack(pixel));
    if (!hasNonWhiteSample) {
      whiteOnly.push({ seq: draw.seq, name });
    }
  }

  if (notReady.length) {
    errors.push(`generated infantry textures not ready at seq ${notReady.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (notSampled.length) {
    errors.push(`generated infantry textures not sampled at seq ${notSampled.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (badStorage.length) {
    errors.push(`generated infantry textures not rgba8 at seq ${badStorage.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (missingUploads.length) {
    errors.push(`generated infantry textures missing uploads at seq ${missingUploads.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (whiteOnly.length) {
    errors.push(`generated infantry textures only exposed white/black samples at seq ${whiteOnly.slice(0, 8).map((item) => item.seq).join(",")}`);
  }

  return {
    source: "shellmap-infantry-textures",
    ok: errors.length === 0,
    errors,
    counts: {
      drawCount: textureRecords.length,
      uniqueTextureCount: uniqueTextures.size,
      notReady: notReady.length,
      notSampled: notSampled.length,
      badStorage: badStorage.length,
      missingUploads: missingUploads.length,
      whiteOnly: whiteOnly.length,
    },
    textures: Array.from(uniqueTextures).sort(),
  };
}

function assertShellmapBattleFxTextures(captures) {
  const errors = [];
  const effectFragments = new Map([
    ["shockwave", "exshockwav"],
    ["cloud", "excloud"],
    ["wave", "exwave"],
    ["explosion", "exexplo"],
  ]);
  const requiredFragments = ["shockwave", "cloud", "wave"];
  const textureRecords = [];
  const draws = captures.flatMap((capture) =>
    capture.history.map((draw) => ({ ...draw, targetFrame: capture.targetFrame })));

  for (const draw of draws) {
    for (const texture of [draw.texture0, draw.texture1]) {
      const name = textureLabelName(texture);
      const kind = Array.from(effectFragments.entries())
        .find(([, fragment]) => name.includes(fragment))?.[0] ?? null;
      if (kind != null) {
        textureRecords.push({ draw, texture, kind, name });
      }
    }
  }

  const recordsByKind = new Map();
  for (const record of textureRecords) {
    const records = recordsByKind.get(record.kind) ?? [];
    records.push(record);
    recordsByKind.set(record.kind, records);
  }

  if (textureRecords.length < 16) {
    errors.push(`expected at least 16 shell-map battle FX texture draws, got ${textureRecords.length}`);
  }
  for (const kind of requiredFragments) {
    const count = recordsByKind.get(kind)?.length ?? 0;
    if (count < 1) {
      errors.push(`expected at least one ${kind} battle FX texture draw`);
    }
  }

  const notReady = [];
  const notSampled = [];
  const missingUploads = [];
  const notBlended = [];
  for (const record of textureRecords) {
    const { draw, texture, name, kind } = record;
    if (texture.ready !== true) {
      notReady.push({ seq: draw.seq, name });
    }
    if (texture.sampled !== true) {
      notSampled.push({ seq: draw.seq, name });
    }
    if (Number(texture.uploads ?? 0) < 1) {
      missingUploads.push({ seq: draw.seq, name, uploads: texture.uploads ?? null });
    }
    if (kind !== "explosion" && !isBlendedDraw(draw)) {
      notBlended.push({ seq: draw.seq, name });
    }
  }

  if (notReady.length) {
    errors.push(`battle FX textures not ready at seq ${notReady.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (notSampled.length) {
    errors.push(`battle FX textures not sampled at seq ${notSampled.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (missingUploads.length) {
    errors.push(`battle FX textures missing uploads at seq ${missingUploads.slice(0, 8).map((item) => item.seq).join(",")}`);
  }
  if (notBlended.length) {
    errors.push(`transparent battle FX textures were not blended at seq ${notBlended.slice(0, 8).map((item) => item.seq).join(",")}`);
  }

  return {
    source: "shellmap-battle-fx-textures",
    ok: errors.length === 0,
    errors,
    counts: Object.fromEntries(Array.from(effectFragments.keys()).map((kind) =>
      [kind, recordsByKind.get(kind)?.length ?? 0])),
    drawCount: textureRecords.length,
    textures: Array.from(new Set(textureRecords.map((record) => record.name))).sort(),
  };
}

function combineAssertions(results) {
  if (results.length === 0) {
    return null;
  }
  if (results.length === 1) {
    return results[0];
  }
  return {
    source: "shellmap-combined",
    ok: results.every((result) => result.ok),
    errors: results.flatMap((result) => result.errors ?? []),
    results,
  };
}

async function main() {
  if (captureFrames.length === 0) {
    throw new Error("no capture frames requested");
  }
  await mkdir(outDir, { recursive: true });

  const server = await startStaticServer({ root: wasmRoot });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SHELLMAP_BROWSER_EXECUTABLE
      ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: (process.env.SHELLMAP_BROWSER_ARGS ?? "--enable-gpu --use-angle=metal --disable-gpu-compositing")
      .split(/\s+/)
      .filter(Boolean),
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(300000);
  page.setDefaultNavigationTimeout(300000);
  page.on("pageerror", (error) => {
    console.error(`[shellmap-labels] pageerror ${error.stack ?? error.message}`);
  });

  const rpc = (command, payload = {}) =>
    page.evaluate(([name, data]) => window.CnCPort.rpc(name, data), [command, payload]);

  try {
    await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));
    await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
    await page.evaluate((limit) => window.__cncSetD3D8SceneDrawHistoryLimit?.(limit), drawHistoryLimit);

    console.error("[shellmap-labels] mounting archives");
    const mount = await rpc("mountArchives", {
      path: "/assets/real-init",
      verifyEach: false,
      archives: buildArchives(server.url),
    });
    if (mount?.archiveSet?.archiveCount !== archiveSpecs.length) {
      throw new Error(`archive mount failed: ${JSON.stringify(mount?.archiveSet ?? mount)}`);
    }

    console.error("[shellmap-labels] real init shell map");
    const init = await rpc("realEngineInit", { runDirectory: "/assets/real-init", shellMap: true });
    if (init?.ok !== true || init?.frontier?.initReturned !== true) {
      throw new Error(`real init failed: ${JSON.stringify(init?.frontier ?? init)}`);
    }

    for (const point of [{ x: 32, y: 32 }, { x: 96, y: 96 }]) {
      await rpc("postMessage", {
        message: 0x0200,
        lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
        point,
      });
      await rpc("realEngineFrameSummary", { frames: 2 });
    }

    let completedFrames = 4;
    const captures = [];
    for (const targetFrame of captureFrames.sort((left, right) => left - right)) {
      const liteFrames = Math.max(0, targetFrame - completedFrames - 1);
      if (liteFrames > 0) {
        await page.evaluate(() => window.__cncSetDiagLevel?.("lite"));
        const liteResult = await rpc("realEngineFrameSummary", { frames: liteFrames });
        completedFrames = Number(liteResult?.frame?.framesCompleted ?? completedFrames + liteFrames);
      }

      await page.evaluate(() => window.__cncSetDiagLevel?.("full"));
      const result = await rpc("realEngineFrameSummary", { frames: 1 });
      completedFrames = Number(result?.frame?.framesCompleted ?? completedFrames + 1);

      const screenshotPath = resolve(outDir, `shellmap-frame-${targetFrame}.png`);
      await page.locator("#viewport").screenshot({ path: screenshotPath });

      const labels = result?.frame?.textureDiagnostics?.labels ?? [];
      const labelById = new Map(labels.map((label) => [Number(label.id), label]));
      const history = (result?.state?.graphics?.d3d8SceneDrawHistory ?? [])
        .map((draw) => compactDraw(draw, labelById));

      const capture = {
        targetFrame,
        frameCompleted: completedFrames,
        screenshotPath,
        textureDiagnostics: result?.frame?.textureDiagnostics ?? null,
        lastD3D8Clear: result?.state?.graphics?.lastD3D8Clear ?? null,
        historyLength: history.length,
        historySeqRange: history.length ? [history[0].seq, history[history.length - 1].seq] : [],
        topTextures: topTextureNames(history),
        history,
      };
      captures.push(capture);
      console.error(`[shellmap-labels] captured target=${targetFrame} completed=${completedFrames} history=${history.length} labels=${labels.length}`);
    }

    const renderer = await page.evaluate(() => {
      const canvas = document.querySelector("#viewport");
      const gl = canvas?.getContext("webgl2");
      const debugInfo = gl?.getExtension("WEBGL_debug_renderer_info");
      return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null;
    });
    const assertions = combineAssertions([
      assertCutoutDepth ? assertShellmapCutoutDepth(captures) : null,
      assertInfantryTextures ? assertShellmapInfantryTextures(captures) : null,
      assertBattleFxTextures ? assertShellmapBattleFxTextures(captures) : null,
    ].filter(Boolean));
    const summary = { ok: assertions?.ok ?? true, renderer, assertions, captures };
    await writeFile(resolve(outDir, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({
      ok: summary.ok,
      renderer,
      assertions,
      captures: captures.map((capture) => ({
        targetFrame: capture.targetFrame,
        frameCompleted: capture.frameCompleted,
        historyLength: capture.historyLength,
        labels: capture.textureDiagnostics?.labels?.length ?? 0,
        screenshotPath: capture.screenshotPath,
        topTextures: capture.topTextures.slice(0, 8),
      })),
    }, null, 2));
    if (assertions && !assertions.ok) {
      throw new Error(`shell-map assertions failed: ${assertions.errors.join("; ")}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
