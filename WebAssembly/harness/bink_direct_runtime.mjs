const QUEUED_FRAMES = 3;
const AUDIO_VIDEO_START_DELAY_MS = 60;

function clampVolume(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function stopAudio(session) {
  for (const source of session.audioSources) {
    try { source.stop(); } catch { /* already stopped */ }
  }
  session.audioSources.clear();
  try { session.audioGain?.disconnect(); } catch { /* already disconnected */ }
  session.audioGain = null;
  session.audioNextTime = null;
}

export function createBinkDirectVideoRuntime({
  sendFrame,
  resolveSource,
  audioContext = () => null,
  onPreparation = () => {},
  log = () => {},
} = {}) {
  if (typeof sendFrame !== "function" || typeof resolveSource !== "function") {
    throw new Error("createBinkDirectVideoRuntime requires sendFrame and resolveSource");
  }

  const sessions = new Map();
  const diagnostics = {
    mode: "direct",
    opens: 0,
    closes: 0,
    decodedFrames: 0,
    transferredBytes: 0,
    audioSamples: 0,
    decoderBytes: null,
    playFailures: 0,
    lastError: null,
    active: [],
  };

  function publishDiagnostics() {
    diagnostics.active = [...sessions.values()].map((session) => ({
      handle: session.handle,
      sourcePath: session.sourcePath,
      videoPath: session.videoPath,
      lastFrameNum: session.lastFrameNum,
      framesTransferred: session.framesTransferred,
      queuedFrames: session.queue.length,
      preparing: session.preparing,
      decoderEnded: session.decoderEnded,
      audioScheduledTo: session.audioNextTime,
    }));
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

  function stopSession(session) {
    if (session.closed) return;
    session.closed = true;
    session.sourceAbort.abort();
    if (session.presentationTimer != null) clearTimeout(session.presentationTimer);
    session.presentationTimer = null;
    session.queue.length = 0;
    stopAudio(session);
    try { session.worker?.postMessage({ type: "close" }); } catch { /* worker already gone */ }
    session.worker?.terminate();
    session.worker = null;
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

  function establishClock(session, frame) {
    if (session.clockStartMs != null) return;
    let context = null;
    if (frame.audio && frame.audioChannels > 0 && frame.audioSampleRate > 0) {
      try { context = audioContext(); } catch { /* video can continue muted */ }
    }
    const startDelay = context ? AUDIO_VIDEO_START_DELAY_MS : 0;
    session.clockStartMs = performance.now() + startDelay;
    session.clockStartFrame = frame.frameNum;
    session.audioContext = context;
    if (context) {
      if (context.state === "suspended") {
        context.resume?.().catch((error) => {
          diagnostics.playFailures += 1;
          log("Bink audio resume failed", { error: error?.message ?? String(error) });
        });
      }
      session.audioGain = context.createGain();
      session.audioGain.gain.value = session.volume;
      session.audioGain.connect(context.destination);
      session.audioNextTime = context.currentTime + startDelay / 1000;
    }
  }

  function scheduleAudio(session, frame) {
    const context = session.audioContext;
    const samples = frame.audio;
    const channels = frame.audioChannels;
    const sampleRate = frame.audioSampleRate;
    if (!context || !session.audioGain || !samples || channels <= 0 || sampleRate <= 0) return;
    const sampleFrames = Math.floor(samples.length / channels);
    if (sampleFrames <= 0) return;
    try {
      const buffer = context.createBuffer(channels, sampleFrames, sampleRate);
      for (let channel = 0; channel < channels; channel += 1) {
        const output = buffer.getChannelData(channel);
        for (let index = 0; index < sampleFrames; index += 1) {
          output[index] = samples[index * channels + channel] / 32768;
        }
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(session.audioGain);
      source.addEventListener?.("ended", () => session.audioSources.delete(source), { once: true });
      session.audioSources.add(source);
      const start = Math.max(session.audioNextTime ?? context.currentTime, context.currentTime + 0.005);
      source.start(start);
      session.audioNextTime = start + sampleFrames / sampleRate;
      diagnostics.audioSamples += samples.length;
    } catch (error) {
      diagnostics.playFailures += 1;
      diagnostics.lastError = error?.message ?? String(error);
      log("Bink audio scheduling failed", { handle: session.handle, error: diagnostics.lastError });
    }
  }

  function requestDecode(session) {
    if (session.closed || session.failed || session.decodeInFlight || session.decoderEnded
        || session.queue.length >= QUEUED_FRAMES) return;
    session.decodeInFlight = true;
    session.worker.postMessage({ type: "decode", generation: session.generation });
  }

  function presentNext(session) {
    session.presentationTimer = null;
    if (session.closed || session.queue.length === 0) return;
    const frame = session.queue[0];
    const target = session.clockStartMs
      + (frame.frameNum - session.clockStartFrame) * (frame.frameDurationUs / 1000);
    const delay = target - performance.now();
    if (delay > 1) {
      session.presentationTimer = setTimeout(() => presentNext(session), delay);
      return;
    }
    session.queue.shift();
    session.lastFrameNum = frame.frameNum;
    session.framesTransferred += 1;
    diagnostics.decodedFrames += 1;
    diagnostics.transferredBytes += frame.bytes.byteLength;
    try {
      sendFrame({
        handle: session.handle,
        frameNum: frame.frameNum,
        width: frame.width,
        height: frame.height,
        bytes: frame.bytes,
      });
    } catch (error) {
      failSession(session, error);
      return;
    }
    requestDecode(session);
    publishDiagnostics();
    if (session.queue.length > 0) presentNext(session);
  }

  function queueFrame(session, message) {
    const frame = {
      frameNum: Number(message.frameNum) >>> 0,
      width: Number(message.width) >>> 0,
      height: Number(message.height) >>> 0,
      frameDurationUs: Number(message.frameDurationUs) >>> 0,
      bytes: message.bytes,
      audio: message.audio,
      audioChannels: Number(message.audioChannels) >>> 0,
      audioSampleRate: Number(message.audioSampleRate) >>> 0,
    };
    if (frame.width !== session.width || frame.height !== session.height
        || frame.frameNum < 1 || frame.frameNum > session.frames
        || !(frame.bytes instanceof Uint8Array)
        || frame.bytes.byteLength !== frame.width * frame.height * 4
        || frame.frameDurationUs <= 0) {
      throw new Error("Compact Bink decoder returned invalid frame metadata");
    }
    establishClock(session, frame);
    scheduleAudio(session, frame);
    session.queue.push(frame);
    session.queue.sort((left, right) => left.frameNum - right.frameNum);
    if (session.preparing) {
      session.preparing = false;
      onPreparation({
        phase: "ready",
        handle: session.handle,
        sourcePath: session.sourcePath,
        decoderBytes: diagnostics.decoderBytes,
      });
    }
    requestDecode(session);
    if (session.presentationTimer == null) presentNext(session);
  }

  function failSession(session, error) {
    if (session.closed || session.failed) return;
    session.failed = true;
    session.preparing = false;
    if (session.presentationTimer != null) clearTimeout(session.presentationTimer);
    session.presentationTimer = null;
    session.queue.length = 0;
    stopAudio(session);
    diagnostics.lastError = error?.message ?? String(error);
    log("Bink direct decode failed", { handle: session.handle, error: diagnostics.lastError });
    onPreparation({
      phase: error?.name === "AbortError" ? "cancelled" : "error",
      handle: session.handle,
      sourcePath: session.sourcePath,
      ...(error?.name === "AbortError" ? {} : { error: diagnostics.lastError }),
    });
    sendFailureFrame(session);
    session.worker?.terminate();
    session.worker = null;
    publishDiagnostics();
  }

  function handleWorkerMessage(session, message) {
    if (session.closed || session.failed || Number(message?.generation) !== session.generation) return;
    if (message.type === "ready") {
      if (Number(message.width) !== session.width || Number(message.height) !== session.height
          || Number(message.frames) !== session.frames || !(Number(message.frameDurationUs) > 0)) {
        failSession(session, new Error("Compact Bink decoder metadata does not match the installed movie"));
        return;
      }
      diagnostics.decoderBytes = Number(message.decoderBytes);
      requestDecode(session);
    } else if (message.type === "frame") {
      session.decodeInFlight = false;
      try { queueFrame(session, message); } catch (error) { failSession(session, error); }
    } else if (message.type === "end") {
      session.decodeInFlight = false;
      session.decoderEnded = true;
      publishDiagnostics();
    } else if (message.type === "error") {
      session.decodeInFlight = false;
      failSession(session, new Error(message.error || "Compact Bink decoder failed"));
    }
  }

  async function prepareSession(session, payload) {
    try {
      onPreparation({ phase: "start", handle: session.handle, sourcePath: session.sourcePath });
      const prepared = await resolveSource(payload, { signal: session.sourceAbort.signal });
      if (session.closed || session.failed) return;
      const worker = new Worker(new URL("./bink_decode_worker.mjs", import.meta.url), { type: "module" });
      session.worker = worker;
      worker.onmessage = (event) => handleWorkerMessage(session, event.data ?? {});
      worker.onerror = (event) => {
        event.preventDefault();
        failSession(session, new Error(event.message || "Compact Bink decoder worker crashed"));
      };
      worker.onmessageerror = () => failSession(session, new Error("Compact Bink decoder returned unreadable data"));
      session.generation += 1;
      worker.postMessage({
        type: "open",
        generation: session.generation,
        source: prepared.source,
      }, [prepared.source]);
    } catch (error) {
      failSession(session, error);
    }
  }

  function open(payload) {
    const handle = Number(payload?.handle ?? 0) >>> 0;
    const width = Number(payload?.width ?? 0) >>> 0;
    const height = Number(payload?.height ?? 0) >>> 0;
    const frames = Number(payload?.frames ?? 0) >>> 0;
    if (!handle || !width || !height || !frames || !payload?.videoPath) return;
    close({ handle });
    const session = {
      handle,
      sourcePath: String(payload.sourcePath ?? ""),
      videoPath: String(payload.videoPath),
      width,
      height,
      frames,
      closed: false,
      failed: false,
      preparing: true,
      sourceAbort: new AbortController(),
      worker: null,
      generation: 0,
      decodeInFlight: false,
      decoderEnded: false,
      queue: [],
      presentationTimer: null,
      clockStartMs: null,
      clockStartFrame: 1,
      audioContext: null,
      audioGain: null,
      audioNextTime: null,
      audioSources: new Set(),
      failureFrameSent: false,
      volume: 1,
      lastFrameNum: Number(payload.frameNum ?? 1) >>> 0,
      framesTransferred: 0,
    };
    sessions.set(handle, session);
    diagnostics.opens += 1;
    void prepareSession(session, payload);
    publishDiagnostics();
  }

  function seek(session, frameNum) {
    if (!session.worker || session.closed || session.failed) return;
    session.generation += 1;
    session.decodeInFlight = true;
    session.decoderEnded = false;
    session.queue.length = 0;
    if (session.presentationTimer != null) clearTimeout(session.presentationTimer);
    session.presentationTimer = null;
    stopAudio(session);
    session.clockStartMs = null;
    session.clockStartFrame = frameNum;
    session.worker.postMessage({ type: "seek", generation: session.generation, frameNum });
  }

  function event(payload) {
    const handle = Number(payload?.handle ?? 0) >>> 0;
    const session = sessions.get(handle);
    if (!session) return;
    if (payload?.event === "gotoFrame") {
      const frameNum = Math.max(1, Math.min(session.frames, Number(payload.arg0 ?? 1) >>> 0));
      seek(session, frameNum);
    } else if (payload?.event === "setVolume") {
      session.volume = clampVolume(Number(payload.arg0 ?? 0) / 32768);
      if (session.audioGain && session.audioContext) {
        session.audioGain.gain.setValueAtTime(session.volume, session.audioContext.currentTime);
      }
    }
    publishDiagnostics();
  }

  function cancelActive() {
    const session = [...sessions.values()].find((entry) => entry.preparing && !entry.closed);
    if (!session) return false;
    session.sourceAbort.abort(new DOMException("Movie decoding was cancelled", "AbortError"));
    failSession(session, new DOMException("Movie decoding was cancelled", "AbortError"));
    return true;
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
    cancelActive,
    shutdown,
    snapshot: () => {
      publishDiagnostics();
      return { ...diagnostics, active: diagnostics.active.map((entry) => ({ ...entry })) };
    },
  };
}
