import { browserBinkTranscodeSupport } from "./bink_transcoder.mjs";

export const BINK_VIDEO_MANIFEST_URL = new URL(
  "../artifacts/browser-video/bink/bink-browser-video-manifest.json",
  import.meta.url,
).href;

export const BINK_TRANSCODE_RUNTIME_MANIFEST_URL = new URL(
  "../video-runtime/ffmpeg-core-manifest.json",
  import.meta.url,
).href;

const HOSTED_VIDEO_UNAVAILABLE_REASON =
  "Original-video playback is unavailable in this hosted build because browser-compatible movie copies are not packaged with it.";

export function binkVideoPolicy() {
  return globalThis.document?.documentElement?.dataset?.binkVideoSidecars ?? "auto";
}

function validateBinkVideoManifest(manifest) {
  if (manifest?.ok !== true || !Array.isArray(manifest.payloads) || manifest.payloads.length === 0) {
    throw new Error("Bink video manifest is incomplete");
  }
  for (const payload of manifest.payloads) {
    const sourceFile = String(payload?.sourceFile ?? "");
    const outputFile = String(payload?.outputFile ?? "");
    if (!/^[A-Za-z0-9_.-]+\.bik$/i.test(sourceFile)
        || !/^[A-Za-z0-9_.-]+\.webm$/i.test(outputFile)
        || !(Number(payload?.frames) > 0)
        || !(Number(payload?.width) > 0)
        || !(Number(payload?.height) > 0)
        || !(Number(payload?.outputDurationSeconds) > 0)) {
      throw new Error(`Bink video manifest contains an invalid payload for ${sourceFile || "an unnamed movie"}`);
    }
  }
  return manifest;
}

export async function loadBinkVideoManifest({
  policy = binkVideoPolicy(),
  url = BINK_VIDEO_MANIFEST_URL,
  fetchImpl = globalThis.fetch?.bind(globalThis),
} = {}) {
  if (policy === "unavailable") {
    throw new Error(HOSTED_VIDEO_UNAVAILABLE_REASON);
  }
  if (policy === "transcode") {
    throw new Error("The hosted Bink manifest is generated from the selected user-owned movies");
  }
  if (policy !== "auto") {
    throw new Error(`Unknown Bink video sidecar policy: ${policy}`);
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("Bink video manifest cannot be loaded because fetch is unavailable");
  }
  let response;
  try {
    response = await fetchImpl(url, { cache: "no-store" });
  } catch (error) {
    throw new Error(`Bink video manifest request failed: ${error?.message ?? String(error)}`);
  }
  if (!response?.ok) {
    throw new Error(`Bink video manifest fetch failed (${response?.status ?? "unknown"})`);
  }
  const contentType = response.headers?.get?.("content-type") ?? "unknown content type";
  let manifest;
  try {
    manifest = JSON.parse(await response.text());
  } catch {
    throw new Error(`Bink video manifest response is not JSON (${contentType})`);
  }
  return validateBinkVideoManifest(manifest);
}

export async function probeBinkVideoSupport(options = {}) {
  const policy = options.policy ?? binkVideoPolicy();
  if (policy === "transcode") {
    const support = browserBinkTranscodeSupport(options.scope ?? globalThis);
    if (!support.available) return { ...support, payloadCount: 0, mode: "transcode" };
    try {
      const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
      if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
      const response = await fetchImpl(
        options.runtimeUrl ?? BINK_TRANSCODE_RUNTIME_MANIFEST_URL,
        { cache: "no-store" },
      );
      if (!response?.ok) throw new Error(`decoder manifest failed (${response?.status ?? "unknown"})`);
      const runtime = JSON.parse(await response.text());
      if (runtime?.schema !== "cnc-zh-browser-video-runtime/v1"
          || runtime?.coreVersion !== "0.12.10"
          || runtime?.coreScript !== "ffmpeg-core.js"
          || !Array.isArray(runtime?.wasmParts)
          || runtime.wasmParts.length < 2
          || runtime.wasmParts.some((part, index) =>
            part?.name !== `ffmpeg-core.wasm.part${index}`
            || !(Number(part?.bytes) > 0)
            || !/^[a-f0-9]{64}$/.test(String(part?.sha256)))) {
        throw new Error("decoder manifest is invalid");
      }
      return { available: true, payloadCount: 0, reason: null, mode: "transcode" };
    } catch (error) {
      return {
        available: false,
        payloadCount: 0,
        reason: `On-device video preparation is unavailable: ${error?.message ?? String(error)}`,
        mode: "transcode",
      };
    }
  }
  try {
    const manifest = await loadBinkVideoManifest({ ...options, policy });
    return {
      available: true,
      payloadCount: manifest.payloads.length,
      reason: null,
      mode: "sidecar",
    };
  } catch (error) {
    return {
      available: false,
      payloadCount: 0,
      reason: error?.message ?? String(error),
      mode: policy,
    };
  }
}

export function buildPreparedBinkManifest(videos = []) {
  const payloads = videos.map((video) => {
    const sourceFile = String(video?.name ?? "");
    const frames = Number(video?.frames);
    const width = Number(video?.width);
    const height = Number(video?.height);
    const fpsNum = Number(video?.fpsNum);
    const fpsDen = Number(video?.fpsDen);
    const sourceSize = Number(video?.bytes);
    const duration = frames * fpsDen / fpsNum;
    if (!/^[A-Za-z0-9_.-]+\.bik$/i.test(sourceFile)
        || !Number.isSafeInteger(frames) || frames <= 0
        || !Number.isSafeInteger(width) || width <= 0
        || !Number.isSafeInteger(height) || height <= 0
        || !Number.isSafeInteger(fpsNum) || fpsNum <= 0
        || !Number.isSafeInteger(fpsDen) || fpsDen <= 0
        || !Number.isSafeInteger(sourceSize) || sourceSize <= 44
        || !/^[0-9a-f]{88}$/i.test(String(video?.headerHex ?? ""))) {
      throw new Error(`Prepared Bink metadata is invalid for ${sourceFile || "an unnamed movie"}`);
    }
    return {
      sourceFile,
      sourceSize,
      sourceHeaderHex: String(video.headerHex),
      frames,
      width,
      height,
      fpsNum,
      fpsDen,
      sourceAudioStreams: Number(video.audioTracks ?? 0),
      outputFile: sourceFile.replace(/\.bik$/i, ".webm"),
      outputFrameCount: frames,
      outputDurationSeconds: duration,
      outputVideoCodec: "vp8",
      outputAudioCodecs: Number(video.audioTracks ?? 0) > 0 ? ["pcm_s16le"] : [],
      preparation: "on-device",
    };
  });
  return validateBinkVideoManifest({
    ok: payloads.length > 0,
    schema: "cnc-zh-bink-browser-video-manifest/v1",
    generatedBy: "browser-on-device",
    payloads,
  });
}

function resolveVideoUrl(videoPath) {
  const normalized = String(videoPath ?? "").replace(/^\/+/, "");
  return new URL(`../${normalized}`, import.meta.url).href;
}

function frameNumberForTime(session, mediaTime) {
  if (!(session.frames > 0) || !(session.durationSeconds > 0)) return 1;
  const frame = Math.floor((Math.max(0, mediaTime) / session.durationSeconds) * session.frames) + 1;
  return Math.max(1, Math.min(session.frames, frame));
}

export function createBinkVideoRuntime({
  sendFrame,
  resolveMedia = null,
  onPreparation = () => {},
  log = () => {},
} = {}) {
  if (typeof sendFrame !== "function") {
    throw new Error("createBinkVideoRuntime requires sendFrame");
  }

  const sessions = new Map();
  const diagnostics = {
    opens: 0,
    closes: 0,
    decodedFrames: 0,
    transferredBytes: 0,
    playFailures: 0,
    lastError: null,
    active: [],
  };

  function publishDiagnostics() {
    diagnostics.active = [...sessions.values()].map((session) => ({
      handle: session.handle,
      sourcePath: session.sourcePath,
      videoPath: session.videoPath,
      readyState: session.video?.readyState ?? 0,
      paused: session.video?.paused ?? true,
      ended: session.video?.ended ?? false,
      currentTime: session.video?.currentTime ?? 0,
      duration: session.video?.duration ?? null,
      lastFrameNum: session.lastFrameNum,
      framesTransferred: session.framesTransferred,
      preparing: session.preparing,
    }));
  }

  function stopSession(session) {
    session.closed = true;
    session.mediaAbort?.abort();
    if (session.frameCallbackId != null
        && typeof session.video.cancelVideoFrameCallback === "function") {
      session.video.cancelVideoFrameCallback(session.frameCallbackId);
    }
    session.video.pause();
    session.audio?.pause();
    if (session.fallbackFrameHandler) {
      session.video.removeEventListener("timeupdate", session.fallbackFrameHandler);
      session.video.removeEventListener("seeked", session.fallbackFrameHandler);
    }
    if (session.endedFrameHandler) {
      session.video.removeEventListener("ended", session.endedFrameHandler);
    }
    session.video.removeAttribute("src");
    session.video.load();
    if (session.audio) {
      session.audio.removeAttribute("src");
      session.audio.load();
    }
    session.preparedMedia?.revoke?.();
    session.canvas.width = 1;
    session.canvas.height = 1;
  }

  function close(payload) {
    const handle = Number(payload?.handle ?? 0) >>> 0;
    const session = sessions.get(handle);
    if (!session) return;
    stopSession(session);
    sessions.delete(handle);
    diagnostics.closes += 1;
    publishDiagnostics();
  }

  function transferFrame(session, mediaTime) {
    if (session.closed || session.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    try {
      if (session.audio?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          && Math.abs(session.audio.currentTime - mediaTime) > 0.15) {
        session.audio.currentTime = mediaTime;
      }
      session.context.drawImage(session.video, 0, 0, session.width, session.height);
      const image = session.context.getImageData(0, 0, session.width, session.height);
      const bytes = new Uint8Array(image.data.buffer);
      // Canvas returns RGBA bytes. BINKSURFACE32 writes X8R8G8B8 memory,
      // whose little-endian byte order is BGRA; the D3D8 upload path then
      // performs the existing BGRA-to-WebGL RGBA conversion.
      for (let offset = 0; offset < bytes.byteLength; offset += 4) {
        const red = bytes[offset];
        bytes[offset] = bytes[offset + 2];
        bytes[offset + 2] = red;
        bytes[offset + 3] = 0xff;
      }
      const frameNum = frameNumberForTime(session, mediaTime);
      session.lastFrameNum = frameNum;
      session.framesTransferred += 1;
      diagnostics.decodedFrames += 1;
      diagnostics.transferredBytes += bytes.byteLength;
      sendFrame({
        handle: session.handle,
        frameNum,
        width: session.width,
        height: session.height,
        bytes,
      });
      publishDiagnostics();
    } catch (error) {
      diagnostics.lastError = error?.message ?? String(error);
      log("Bink frame transfer failed", { handle: session.handle, error: diagnostics.lastError });
    }
  }

  function scheduleFrames(session) {
    if (session.closed) return;
    if (typeof session.video.requestVideoFrameCallback === "function") {
      session.frameCallbackId = session.video.requestVideoFrameCallback((_now, metadata) => {
        transferFrame(session, Number(metadata?.mediaTime ?? session.video.currentTime));
        scheduleFrames(session);
      });
      return;
    }
    session.fallbackFrameHandler = () => transferFrame(session, session.video.currentTime);
    session.video.addEventListener("timeupdate", session.fallbackFrameHandler);
    session.video.addEventListener("seeked", session.fallbackFrameHandler);
  }

  async function startSession(session) {
    try {
      const plays = [session.video.play()];
      if (session.audio) plays.push(session.audio.play());
      const results = await Promise.allSettled(plays);
      if (results[0].status === "rejected") throw results[0].reason;
      if (results[1]?.status === "rejected") {
        log("Bink sidecar audio play failed", {
          handle: session.handle,
          error: results[1].reason?.message ?? String(results[1].reason),
        });
      }
    } catch (error) {
      diagnostics.playFailures += 1;
      diagnostics.lastError = error?.message ?? String(error);
      log("Bink sidecar play failed", { handle: session.handle, error: diagnostics.lastError });
    }
    publishDiagnostics();
  }

  function waitForMedia(element) {
    if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error(`media error ${element.error?.code ?? "unknown"}`)); };
      const cleanup = () => {
        element.removeEventListener("loadeddata", loaded);
        element.removeEventListener("error", failed);
      };
      element.addEventListener("loadeddata", loaded, { once: true });
      element.addEventListener("error", failed, { once: true });
    });
  }

  function sendFailureFrame(session) {
    if (session.closed || session.failureFrameSent) return;
    session.failureFrameSent = true;
    const bytes = new Uint8Array(session.width * session.height * 4);
    sendFrame({
      handle: session.handle,
      frameNum: session.frames,
      width: session.width,
      height: session.height,
      bytes,
    });
  }

  async function prepareSession(session, payload) {
    try {
      onPreparation({ phase: "start", handle: session.handle, sourcePath: session.sourcePath });
      const prepared = typeof resolveMedia === "function"
        ? await resolveMedia(payload, { signal: session.mediaAbort.signal }) : null;
      if (session.closed) {
        prepared?.revoke?.();
        return;
      }
      session.preparedMedia = prepared;
      session.video.src = prepared?.videoUrl ?? resolveVideoUrl(payload.videoPath);
      session.video.muted = prepared?.videoOnly === true;
      if (prepared?.audioUrl) {
        session.audio = document.createElement("audio");
        session.audio.preload = "auto";
        session.audio.src = prepared.audioUrl;
        session.audio.volume = session.volume;
      }
      session.video.volume = session.audio ? 0 : session.volume;
      await Promise.all([waitForMedia(session.video), session.audio ? waitForMedia(session.audio) : null]);
      if (session.closed) return;
      session.preparing = false;
      transferFrame(session, session.video.currentTime);
      scheduleFrames(session);
      await startSession(session);
      onPreparation({
        phase: "ready",
        handle: session.handle,
        sourcePath: session.sourcePath,
        cached: prepared?.cached === true,
      });
    } catch (error) {
      if (session.closed) return;
      session.preparing = false;
      if (error?.name === "AbortError") {
        onPreparation({
          phase: "cancelled",
          handle: session.handle,
          sourcePath: session.sourcePath,
        });
        sendFailureFrame(session);
        publishDiagnostics();
        return;
      }
      diagnostics.lastError = error?.message ?? String(error);
      log("Bink media preparation failed", { handle: session.handle, error: diagnostics.lastError });
      onPreparation({
        phase: "error",
        handle: session.handle,
        sourcePath: session.sourcePath,
        error: diagnostics.lastError,
      });
      sendFailureFrame(session);
      publishDiagnostics();
    }
  }

  function open(payload) {
    const handle = Number(payload?.handle ?? 0) >>> 0;
    const width = Number(payload?.width ?? 0) >>> 0;
    const height = Number(payload?.height ?? 0) >>> 0;
    if (!handle || !width || !height || !payload?.videoPath) return;
    close({ handle });

    const video = document.createElement("video");
    video.preload = "auto";
    video.playsInline = true;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      diagnostics.lastError = "2D canvas context unavailable";
      return;
    }

    const session = {
      handle,
      sourcePath: String(payload.sourcePath ?? ""),
      videoPath: String(payload.videoPath),
      width,
      height,
      frames: Number(payload.frames ?? 0) >>> 0,
      durationSeconds: Number(payload.durationSeconds ?? 0),
      video,
      audio: null,
      canvas,
      context,
      closed: false,
      preparing: true,
      mediaAbort: new AbortController(),
      preparedMedia: null,
      failureFrameSent: false,
      volume: 1,
      frameCallbackId: null,
      fallbackFrameHandler: null,
      endedFrameHandler: null,
      lastFrameNum: Number(payload.frameNum ?? 1) >>> 0,
      framesTransferred: 0,
    };
    sessions.set(handle, session);
    diagnostics.opens += 1;
    session.endedFrameHandler = () => {
      // requestVideoFrameCallback reports the timestamp of the last decoded
      // sample, which can map to Frames-1 even though playback has ended.
      // Bink's original caller waits for FrameNum == Frames before applying
      // its logo/copyright hold and advancing to the next movie.
      transferFrame(session, session.durationSeconds || session.video.duration);
      session.audio?.pause();
    };
    video.addEventListener("ended", session.endedFrameHandler);
    void prepareSession(session, payload);
    publishDiagnostics();
  }

  function event(payload) {
    const handle = Number(payload?.handle ?? 0) >>> 0;
    const session = sessions.get(handle);
    if (!session) return;
    switch (payload?.event) {
      case "gotoFrame": {
        const frameNum = Math.max(1, Math.min(session.frames, Number(payload.arg0 ?? 1) >>> 0));
        if (session.durationSeconds > 0 && session.frames > 0) {
          session.video.currentTime = ((frameNum - 1) / session.frames) * session.durationSeconds;
          if (session.audio) session.audio.currentTime = session.video.currentTime;
        }
        break;
      }
      case "setVolume":
        session.volume = Math.max(0, Math.min(1, Number(payload.arg0 ?? 0) / 32768));
        session.video.volume = session.audio ? 0 : session.volume;
        if (session.audio) session.audio.volume = session.volume;
        break;
      default:
        break;
    }
    publishDiagnostics();
  }

  function shutdown() {
    for (const session of sessions.values()) stopSession(session);
    sessions.clear();
    publishDiagnostics();
  }

  return {
    open,
    event,
    close,
    shutdown,
    snapshot: () => {
      publishDiagnostics();
      return { ...diagnostics, active: diagnostics.active.map((entry) => ({ ...entry })) };
    },
  };
}
