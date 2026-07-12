function resolveVideoUrl(videoPath) {
  const normalized = String(videoPath ?? "").replace(/^\/+/, "");
  return new URL(`../${normalized}`, import.meta.url).href;
}

function frameNumberForTime(session, mediaTime) {
  if (!(session.frames > 0) || !(session.durationSeconds > 0)) return 1;
  const frame = Math.floor((Math.max(0, mediaTime) / session.durationSeconds) * session.frames) + 1;
  return Math.max(1, Math.min(session.frames, frame));
}

export function createBinkVideoRuntime({ sendFrame, log = () => {} } = {}) {
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
      readyState: session.video.readyState,
      paused: session.video.paused,
      ended: session.video.ended,
      currentTime: session.video.currentTime,
      duration: session.video.duration,
      lastFrameNum: session.lastFrameNum,
      framesTransferred: session.framesTransferred,
    }));
  }

  function stopSession(session) {
    session.closed = true;
    if (session.frameCallbackId != null
        && typeof session.video.cancelVideoFrameCallback === "function") {
      session.video.cancelVideoFrameCallback(session.frameCallbackId);
    }
    session.video.pause();
    if (session.fallbackFrameHandler) {
      session.video.removeEventListener("timeupdate", session.fallbackFrameHandler);
      session.video.removeEventListener("seeked", session.fallbackFrameHandler);
    }
    session.video.removeAttribute("src");
    session.video.load();
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
      await session.video.play();
    } catch (error) {
      diagnostics.playFailures += 1;
      diagnostics.lastError = error?.message ?? String(error);
      log("Bink sidecar play failed", { handle: session.handle, error: diagnostics.lastError });
    }
    publishDiagnostics();
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
    video.src = resolveVideoUrl(payload.videoPath);
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
      canvas,
      context,
      closed: false,
      frameCallbackId: null,
      fallbackFrameHandler: null,
      lastFrameNum: Number(payload.frameNum ?? 1) >>> 0,
      framesTransferred: 0,
    };
    sessions.set(handle, session);
    diagnostics.opens += 1;
    video.addEventListener("loadeddata", () => {
      transferFrame(session, video.currentTime);
      scheduleFrames(session);
      void startSession(session);
    }, { once: true });
    video.addEventListener("error", () => {
      diagnostics.lastError = `video error ${video.error?.code ?? "unknown"}`;
      log("Bink sidecar video error", { handle, error: diagnostics.lastError });
      publishDiagnostics();
    });
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
        }
        break;
      }
      case "setVolume":
        session.video.volume = Math.max(0, Math.min(1, Number(payload.arg0 ?? 0) / 32768));
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
