import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");

const defaultGcPath = resolve(wasmRoot, "artifacts/real-assets/GC_Background.bik");
const defaultVsPath = resolve(wasmRoot, "artifacts/real-assets/VS_small.bik");
const defaultManifestPath = resolve(
  wasmRoot,
  "artifacts/browser-video/bink/bink-browser-video-manifest.json",
);

const gcPath = resolve(wasmRoot, process.argv[2] ?? defaultGcPath);
const vsPath = resolve(wasmRoot, process.argv[3] ?? defaultVsPath);
const manifestPath = resolve(wasmRoot, process.argv[4] ?? defaultManifestPath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const screenshotPath = resolve(screenshotDir, "harness-smoke-bink-w3d-video-buffer-upload.png");

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function assertInsideWasm(path, label) {
  if (!isInside(wasmRoot, path)) {
    throw new Error(`${label} must be inside ${wasmRoot}: ${path}`);
  }
}

function pixelHasColor(pixel, threshold = 8) {
  return Array.isArray(pixel)
    && pixel.length >= 4
    && (pixel[0] > threshold || pixel[1] > threshold || pixel[2] > threshold);
}

for (const [path, label] of [
  [gcPath, "GC_Background.bik"],
  [vsPath, "VS_small.bik"],
  [manifestPath, "Bink browser video manifest"],
]) {
  assertInsideWasm(path, label);
  const s = await stat(path);
  if (!s.isFile() || s.size <= 0) {
    throw new Error(`${label} is not a readable file: ${path}`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!manifest.ok || manifest.schema !== "cnc-zh-bink-browser-video-manifest/v1") {
  throw new Error(`Unexpected Bink browser manifest state: ${JSON.stringify(manifest)}`);
}

const payloads = manifest.payloads.map((payload) => {
  const outputPath = resolve(payload.outputPath);
  assertInsideWasm(outputPath, `${payload.name} output video`);
  return {
    name: payload.name,
    outputPath,
    relativeOutputPath: relative(wasmRoot, outputPath).split(sep).join("/"),
    width: payload.width,
    height: payload.height,
    outputDurationSeconds: payload.outputDurationSeconds,
  };
});

await mkdir(screenshotDir, { recursive: true });

const gcBytes = await readFile(gcPath);
const vsBytes = await readFile(vsPath);
const manifestBytes = await readFile(manifestPath);

const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1040, height: 760 } });
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });

  const moduleUrl = new URL("dist/bink-w3d-video-buffer-browser-smoke.js", server.url).href;
  const runtimeResult = await page.evaluate(async ({ moduleUrl, gcBytes, vsBytes, manifestText, sidecarPayloads }) => {
    function ensureDirectory(fs, path) {
      const parts = path.split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current += `/${part}`;
        try {
          fs.mkdir(current);
        } catch (error) {
          if (error?.code !== "EEXIST") {
            throw error;
          }
        }
      }
    }

    function waitForEvent(target, eventName, timeoutMs) {
      return new Promise((resolveEvent, rejectEvent) => {
        const timeout = setTimeout(() => {
          cleanup();
          rejectEvent(new Error(`${eventName} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timeout);
          target.removeEventListener(eventName, onEvent);
          target.removeEventListener("error", onError);
        };
        const onEvent = () => {
          cleanup();
          resolveEvent();
        };
        const onError = () => {
          cleanup();
          rejectEvent(new Error(`${eventName} failed: video error ${target.error?.code ?? "unknown"}`));
        };
        target.addEventListener(eventName, onEvent, { once: true });
        target.addEventListener("error", onError, { once: true });
      });
    }

    async function decodeSidecarFrame(payload) {
      const wasmBaseUrl = new URL("../", window.location.href).href;
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.src = new URL(payload.relativeOutputPath, wasmBaseUrl).href;
      await waitForEvent(video, "loadedmetadata", 10000);
      await waitForEvent(video, "canplay", 10000);

      const seekTarget = Math.min(
        Math.max(0.05, payload.outputDurationSeconds / 3),
        Math.max(0.05, video.duration - 0.05),
      );
      video.currentTime = seekTarget;
      await waitForEvent(video, "seeked", 10000);

      const canvas = document.createElement("canvas");
      canvas.width = payload.width;
      canvas.height = payload.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

      const preview = document.createElement("canvas");
      preview.width = Math.min(320, payload.width);
      preview.height = Math.max(1, Math.round(payload.height * (preview.width / payload.width)));
      const previewContext = preview.getContext("2d");
      previewContext.drawImage(video, 0, 0, preview.width, preview.height);
      preview.dataset.name = payload.name;
      document.body.append(preview);

      return {
        width: payload.width,
        height: payload.height,
        pixels,
      };
    }

    function checksum(bytes) {
      let value = 0;
      for (let i = 0; i < bytes.length; ++i) {
        value = (value + bytes[i]) >>> 0;
      }
      return value >>> 0;
    }

    function sampleNonzeroPixel(bytes) {
      for (let i = 0; i + 3 < bytes.length; i += 4) {
        if ((bytes[i] | bytes[i + 1] | bytes[i + 2] | bytes[i + 3]) !== 0) {
          return [bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]];
        }
      }
      return null;
    }

    document.body.style.margin = "0";
    document.body.style.background = "#202020";
    const statusPanel = document.querySelector(".status");
    if (statusPanel) {
      statusPanel.style.display = "none";
    }
    const viewport = document.querySelector("#viewport");
    if (!viewport) {
      throw new Error("Harness viewport canvas is missing");
    }

    const moduleExports = await import(moduleUrl);
    const createModule =
      moduleExports.default ?? moduleExports.createBinkW3DVideoBufferBrowserSmokeModule;
    const distUrl = new URL("../dist/", window.location.href).href;
    const bridgeCallbacks = window.CnCPort?.d3d8BridgeCallbacks?.();
    if (!bridgeCallbacks?.cncPortD3D8DrawIndexed) {
      throw new Error("CnCPort D3D8 bridge callbacks are unavailable");
    }
    const binkEvents = [];
    const copyEvents = [];
    const textureCreates = [];
    const textureUpdates = [];
    const textureReleases = [];
    const textureBinds = [];
    const drawEvents = [];
    const liveTextures = new Set();

    const module = await createModule({
      locateFile: (path) => new URL(path, distUrl).href,
      cncPortD3D8Clear: bridgeCallbacks.cncPortD3D8Clear,
      cncPortD3D8SetViewport: bridgeCallbacks.cncPortD3D8SetViewport,
      cncPortD3D8BufferCreate: bridgeCallbacks.cncPortD3D8BufferCreate,
      cncPortD3D8BufferUpdate: bridgeCallbacks.cncPortD3D8BufferUpdate,
      cncPortD3D8BufferRelease: bridgeCallbacks.cncPortD3D8BufferRelease,
      cncPortD3D8VolumeTextureCreate: bridgeCallbacks.cncPortD3D8VolumeTextureCreate,
      cncPortD3D8VolumeTextureUpdate: bridgeCallbacks.cncPortD3D8VolumeTextureUpdate,
      cncPortBinkVideoOpen: (event) => {
        binkEvents.push({ type: "open", ...event });
      },
      cncPortBinkVideoEvent: (event) => {
        binkEvents.push({ type: event.event, ...event });
      },
      cncPortBinkVideoClose: (event) => {
        binkEvents.push({ type: "close", ...event });
      },
      cncPortD3D8TextureCreate: (event) => {
        textureCreates.push({ ...event });
        liveTextures.add(event.id >>> 0);
        return bridgeCallbacks.cncPortD3D8TextureCreate(event);
      },
      cncPortD3D8TextureUpdate: (event) => {
        const bytes = event.bytes ?? new Uint8Array();
        textureUpdates.push({
          ...event,
          bytes: undefined,
          byteLength: bytes.length,
          checksum: checksum(bytes),
          samplePixel: sampleNonzeroPixel(bytes),
        });
        return bridgeCallbacks.cncPortD3D8TextureUpdate(event);
      },
      cncPortD3D8TextureBind: (event) => {
        textureBinds.push({ ...event });
        return bridgeCallbacks.cncPortD3D8TextureBind(event);
      },
      cncPortD3D8TextureRelease: (event) => {
        textureReleases.push({ ...event });
        liveTextures.delete(event.id >>> 0);
        return bridgeCallbacks.cncPortD3D8TextureRelease(event);
      },
      cncPortD3D8DrawIndexed: (event) => {
        drawEvents.push({
          primitiveType: event.primitiveType,
          vertexBufferId: event.vertexBufferId,
          indexBufferId: event.indexBufferId,
          vertexCount: event.vertexCount,
          indexCount: event.indexCount,
          vertexStride: event.vertexStride,
          texture0BeforeDraw: window.CnCPort?.state?.graphics?.d3d8Textures?.boundTextures?.["0"] ?? null,
        });
        return bridgeCallbacks.cncPortD3D8DrawIndexed(event);
      },
    });

    ensureDirectory(module.FS, "artifacts/real-assets");
    ensureDirectory(module.FS, "artifacts/browser-video/bink");
    module.FS.writeFile("artifacts/real-assets/GC_Background.bik", new Uint8Array(gcBytes));
    module.FS.writeFile("artifacts/real-assets/VS_small.bik", new Uint8Array(vsBytes));
    module.FS.writeFile(
      "artifacts/browser-video/bink/bink-browser-video-manifest.json",
      manifestText,
    );

    const decodedFrames = new Map();
    for (const payload of sidecarPayloads) {
      decodedFrames.set(payload.relativeOutputPath, await decodeSidecarFrame(payload));
    }

    module.cncPortBinkCopyToBuffer = (event) => {
      const decoded = decodedFrames.get(event.videoPath);
      if (!decoded) {
        throw new Error(`No decoded sidecar frame cached for ${event.videoPath}`);
      }
      if (!module.HEAPU8) {
        throw new Error("Emscripten module does not expose HEAPU8");
      }
      if ((event.flags >>> 0) !== 3) {
        throw new Error(`Expected BINKSURFACE32 copy, got flags ${event.flags}`);
      }

      const dest = event.dest >>> 0;
      const destPitch = event.destPitch >>> 0;
      const destHeight = event.destHeight >>> 0;
      const destX = event.destX >>> 0;
      const destY = event.destY >>> 0;
      const rowStart = destX * 4;
      const rowCapacityBytes = destPitch > rowStart ? destPitch - rowStart : 0;
      const copyWidth = Math.min(decoded.width, event.width >>> 0, Math.floor(rowCapacityBytes / 4));
      const copyHeight = Math.min(
        decoded.height,
        event.height >>> 0,
        destHeight > destY ? destHeight - destY : 0,
      );
      if (dest === 0 || copyWidth <= 0 || copyHeight <= 0) {
        throw new Error(`Invalid Bink copy destination: ${JSON.stringify(event)}`);
      }

      let bytesWritten = 0;
      let writtenChecksum = 0;
      const rowBytes = copyWidth * 4;
      for (let y = 0; y < copyHeight; ++y) {
        const source = y * decoded.width * 4;
        const target = dest + (destY + y) * destPitch + rowStart;
        const row = decoded.pixels.subarray(source, source + rowBytes);
        module.HEAPU8.set(row, target);
        bytesWritten += row.length;
        for (let i = 0; i < row.length; ++i) {
          writtenChecksum = (writtenChecksum + row[i]) >>> 0;
        }
      }

      copyEvents.push({
        ...event,
        copyWidth,
        copyHeight,
        bytesWritten,
        checksum: writtenChecksum,
      });
      return true;
    };

    const status = module.ccall(
      "run_bink_w3d_video_buffer_upload_smoke",
      "number",
      [],
      [],
    );

    return {
      ok: status === 0,
      status,
      binkEvents,
      copyEvents,
      textureCreates,
      textureUpdates,
      textureReleases,
      textureBinds,
      drawEvents,
      lastDrawProbe: window.CnCPort?.state?.graphics?.lastD3D8DrawIndexed ?? null,
      liveTextureCount: liveTextures.size,
    };
  }, {
    moduleUrl,
    gcBytes: Array.from(gcBytes),
    vsBytes: Array.from(vsBytes),
    manifestText: manifestBytes.toString("utf8"),
    sidecarPayloads: payloads.map((payload) => ({
      relativeOutputPath: payload.relativeOutputPath,
      name: payload.name,
      width: payload.width,
      height: payload.height,
      outputDurationSeconds: payload.outputDurationSeconds,
    })),
  });

  if (!runtimeResult.ok) {
    throw new Error(`Bink W3DVideoBuffer upload smoke failed: ${JSON.stringify({
      status: runtimeResult.status,
      recentBrowserEvents: browserEvents.slice(-20),
      binkEventCount: runtimeResult.binkEvents?.length ?? 0,
      copyEventCount: runtimeResult.copyEvents?.length ?? 0,
      textureCreateCount: runtimeResult.textureCreates?.length ?? 0,
      textureUpdateCount: runtimeResult.textureUpdates?.length ?? 0,
      textureReleaseCount: runtimeResult.textureReleases?.length ?? 0,
      textureBindCount: runtimeResult.textureBinds?.length ?? 0,
      drawEventCount: runtimeResult.drawEvents?.length ?? 0,
      lastDrawProbe: runtimeResult.lastDrawProbe ?? null,
    })}`);
  }

  const binkEvents = runtimeResult.binkEvents ?? [];
  const copyEvents = runtimeResult.copyEvents ?? [];
  const textureCreates = runtimeResult.textureCreates ?? [];
  const textureUpdates = runtimeResult.textureUpdates ?? [];
  const textureReleases = runtimeResult.textureReleases ?? [];
  const textureBinds = runtimeResult.textureBinds ?? [];
  const drawEvents = runtimeResult.drawEvents ?? [];
  const lastDrawProbe = runtimeResult.lastDrawProbe ?? null;

  if (copyEvents.length !== 696) {
    throw new Error(`Expected six hundred ninety-six Bink copy events, got ${copyEvents.length}: ${JSON.stringify(copyEvents)}`);
  }
  for (const event of copyEvents) {
    if (event.bytesWritten <= 0 || event.checksum === 0) {
      throw new Error(`Bink copy hook did not write decoded pixels: ${JSON.stringify(event)}`);
    }
  }

  for (const expected of [
    {
      videoPath: "artifacts/browser-video/bink/GC_Background.webm",
      textureWidth: 1024,
      textureHeight: 1024,
      visibleWidth: 800,
      visibleHeight: 600,
    },
    {
      videoPath: "artifacts/browser-video/bink/VS_small.webm",
      textureWidth: 128,
      textureHeight: 128,
      visibleWidth: 96,
      visibleHeight: 120,
    },
  ]) {
    const copy = copyEvents.find((event) =>
      event.videoPath === expected.videoPath &&
      event.copyWidth === expected.visibleWidth &&
      event.copyHeight === expected.visibleHeight &&
      event.destPitch === expected.textureWidth * 4,
    );
    if (!copy) {
      throw new Error(`Missing decoded copy for ${expected.videoPath}: ${JSON.stringify(copyEvents)}`);
    }

    const create = textureCreates.find((event) =>
      event.width === expected.textureWidth &&
      event.height === expected.textureHeight &&
      event.levels === 1 &&
      event.format === 22,
    );
    if (!create) {
      throw new Error(`Missing W3DVideoBuffer texture create for ${expected.videoPath}: ${JSON.stringify(textureCreates)}`);
    }

    const upload = textureUpdates.find((event) =>
      event.width === expected.textureWidth &&
      event.height === expected.textureHeight &&
      event.pitch === expected.textureWidth * 4 &&
      event.rowBytes === expected.textureWidth * 4 &&
      event.format === 22 &&
      event.checksum !== 0 &&
      Array.isArray(event.samplePixel),
    );
    if (!upload) {
      throw new Error(`Missing nonzero W3DVideoBuffer texture upload for ${expected.videoPath}: ${JSON.stringify(textureUpdates)}`);
    }
  }

  const openCount = binkEvents.filter((event) => event.type === "open").length;
  const closeCount = binkEvents.filter((event) => event.type === "close").length;
  const copyCompleteCount = binkEvents.filter((event) => event.type === "copyComplete").length;
  if (openCount !== 11 || closeCount !== 11 || copyCompleteCount !== 696) {
    throw new Error(`Unexpected Bink lifecycle counts: ${JSON.stringify(binkEvents)}`);
  }

  const nonzeroTextureBinds = textureBinds.filter((event) => (event.id >>> 0) !== 0);
  if (nonzeroTextureBinds.length < 11) {
    throw new Error(`Expected W3DDisplay::drawVideoBuffer to bind each distinct Bink texture: ${JSON.stringify(textureBinds)}`);
  }

  if (drawEvents.length < 696) {
    throw new Error(`Expected at least six hundred ninety-six W3DDisplay::drawVideoBuffer indexed draws: ${JSON.stringify(drawEvents)}`);
  }

  if (
    !lastDrawProbe
    || lastDrawProbe.source !== "browser_d3d8_draw_indexed"
    || lastDrawProbe.usedPersistentBuffers !== true
    || lastDrawProbe.usedTransforms !== true
    || lastDrawProbe.usedIdentityClipSpace !== true
    || lastDrawProbe.primitiveType !== 4
    || lastDrawProbe.vertexCount !== 4
    || lastDrawProbe.indexCount !== 6
    || lastDrawProbe.vertexStride !== 44
    || lastDrawProbe.texture0?.ready !== true
    || lastDrawProbe.texture0?.sampled !== true
    || lastDrawProbe.texture0?.format !== 22
    || lastDrawProbe.texture0?.storage !== "rgba8"
    || lastDrawProbe.texture0?.combiner?.supported !== true
    || lastDrawProbe.texture0?.combiner?.colorOp !== 4
    || lastDrawProbe.texture0?.combiner?.colorArg1 !== 2
    || lastDrawProbe.texture0?.combiner?.colorArg2 !== 0
    || !pixelHasColor(lastDrawProbe.centerPixel, 0)
  ) {
    throw new Error(`Bink W3DDisplay presentation draw probe failed: ${JSON.stringify(lastDrawProbe)}`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });

  // Keep green logs readable; thrown failures above still include full probes.
  const texture0 = lastDrawProbe?.texture0 ?? null;
  const lastDrawSummary = {
    source: lastDrawProbe?.source ?? null,
    primitiveType: lastDrawProbe?.primitiveType ?? null,
    vertexCount: lastDrawProbe?.vertexCount ?? null,
    indexCount: lastDrawProbe?.indexCount ?? null,
    vertexStride: lastDrawProbe?.vertexStride ?? null,
    texture0: {
      id: texture0?.id ?? null,
      format: texture0?.format ?? null,
      storage: texture0?.storage ?? null,
      ready: texture0?.ready ?? null,
      sampled: texture0?.sampled ?? null,
      combiner: {
        colorOp: texture0?.combiner?.colorOp ?? null,
        colorArg1: texture0?.combiner?.colorArg1 ?? null,
        colorArg2: texture0?.combiner?.colorArg2 ?? null,
      },
    },
    centerPixel: lastDrawProbe?.centerPixel ?? null,
  };

  console.log(JSON.stringify({
    ok: true,
    source: "WebAssembly/harness/bink_w3d_video_buffer_upload_smoke.mjs",
    manifestPath,
    screenshotPath,
    browserEvents,
    counts: {
      binkEvents: binkEvents.length,
      binkOpen: binkEvents.filter((event) => event.type === "open").length,
      binkClose: binkEvents.filter((event) => event.type === "close").length,
      binkCopyComplete: binkEvents.filter((event) => event.type === "copyComplete").length,
      copyEvents: copyEvents.length,
      textureCreates: textureCreates.length,
      textureUpdates: textureUpdates.length,
      textureReleases: textureReleases.length,
      textureBinds: textureBinds.length,
      drawEvents: drawEvents.length,
      liveTextureCount: runtimeResult.liveTextureCount ?? null,
    },
    drawSummaries: drawEvents,
    lastDraw: lastDrawSummary,
    copyChecksums: copyEvents.map((event) => ({
      videoPath: event.videoPath,
      copyWidth: event.copyWidth,
      copyHeight: event.copyHeight,
      bytesWritten: event.bytesWritten,
      checksum: event.checksum,
    })),
    uploadChecksums: textureUpdates.map((event) => ({
      id: event.id,
      width: event.width,
      height: event.height,
      format: event.format,
      byteLength: event.byteLength,
      checksum: event.checksum,
      samplePixel: event.samplePixel,
    })),
  }, null, 2));
} catch (error) {
  throw new Error(
    `Bink W3DVideoBuffer upload browser smoke failed: ${error?.message ?? String(error)}; ` +
    `browser events: ${JSON.stringify(browserEvents)}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
