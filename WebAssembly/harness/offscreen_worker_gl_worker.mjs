// offscreen_worker_gl_worker.mjs — dedicated-worker half of the OffscreenCanvas
// WebGL2 feasibility smoke ("the browser as a 2003 PC" P0 spike, JS-only lane).
//
// Receives a transferred OffscreenCanvas, creates a WebGL2 context on it,
// reports the renderer string, then animates a color-cycling clear plus one
// triangle. Prefers requestAnimationFrame (available in dedicated workers in
// modern Chromium); falls back to setTimeout(16) and reports which loop drove
// the animation. Also services a "busy" command that synchronously blocks this
// worker thread for N ms so the page can observe blocked-worker presentation
// behavior (the load-screen question: frames only present when this thread
// yields to its event loop).

let gl = null;
let program = null;
let phaseLocation = null;
let frame = 0;
let loopMode = "none";
let rafStallWatchdog = null;

const vertexSource = `#version 300 es
layout(location = 0) in vec2 position;
uniform float phase;
void main() {
  float c = cos(phase);
  float s = sin(phase);
  gl_Position = vec4(mat2(c, s, -s, c) * position * 0.7, 0.0, 1.0);
}
`;

const fragmentSource = `#version 300 es
precision highp float;
uniform float phase;
out vec4 color;
void main() {
  color = vec4(0.5 + 0.5 * sin(phase * 3.0),
               0.5 + 0.5 * cos(phase * 2.0),
               1.0,
               1.0);
}
`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function initGl(canvas) {
  gl = canvas.getContext("webgl2", { antialias: false });
  if (!gl) {
    return { webgl2InWorker: false, rendererString: null };
  }

  // Renderer string: prefer the unmasked WEBGL_debug_renderer_info value,
  // fall back to the plain RENDERER parameter.
  let rendererString = null;
  try {
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    rendererString = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  } catch {
    rendererString = String(gl.getParameter(gl.RENDERER));
  }

  program = gl.createProgram();
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  gl.useProgram(program);
  phaseLocation = gl.getUniformLocation(program, "phase");

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([0.0, 0.9, -0.85, -0.7, 0.85, -0.7]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, canvas.width, canvas.height);

  return { webgl2InWorker: true, rendererString };
}

function drawFrame() {
  const phase = frame * 0.08;
  // Bright, cycling clear color so screenshots are unambiguously non-black.
  gl.clearColor(
    0.35 + 0.3 * Math.sin(phase),
    0.35 + 0.3 * Math.sin(phase + 2.1),
    0.35 + 0.3 * Math.sin(phase + 4.2),
    1.0,
  );
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.uniform1f(phaseLocation, phase);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  frame += 1;
  self.postMessage({ kind: "frame", frame });
}

function startSetTimeoutLoop() {
  const tick = () => {
    drawFrame();
    setTimeout(tick, 16);
  };
  setTimeout(tick, 16);
}

function startAnimation() {
  const rafInWorker = typeof self.requestAnimationFrame === "function";
  if (rafInWorker) {
    loopMode = "raf";
    const tick = () => {
      drawFrame();
      self.requestAnimationFrame(tick);
    };
    self.requestAnimationFrame(tick);
    // Watchdog: if rAF exists but never fires in this headless configuration,
    // fall back to setTimeout and say so — the smoke reports loopMode.
    rafStallWatchdog = setTimeout(() => {
      if (frame === 0) {
        loopMode = "setTimeout-fallback-raf-stalled";
        self.postMessage({ kind: "loopModeChanged", loopMode });
        startSetTimeoutLoop();
      }
    }, 1500);
  } else {
    loopMode = "setTimeout";
    startSetTimeoutLoop();
  }
  return { rafInWorker, loopMode };
}

self.onmessage = (event) => {
  const message = event.data ?? {};
  if (message.kind === "init") {
    try {
      const glInfo = initGl(message.canvas);
      if (!glInfo.webgl2InWorker) {
        self.postMessage({
          kind: "ready",
          webgl2InWorker: false,
          rendererString: null,
          rafInWorker: typeof self.requestAnimationFrame === "function",
          loopMode: "none",
        });
        return;
      }
      const loopInfo = startAnimation();
      self.postMessage({ kind: "ready", ...glInfo, ...loopInfo });
    } catch (error) {
      self.postMessage({
        kind: "ready",
        webgl2InWorker: false,
        rendererString: null,
        rafInWorker: typeof self.requestAnimationFrame === "function",
        loopMode: "none",
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      });
    }
    return;
  }

  if (message.kind === "busy") {
    // Announce, then synchronously block this worker thread. Any queued
    // rAF/setTimeout animation callbacks cannot run until the spin ends, so
    // no new frames can be drawn or presented during the block.
    const frameAtStart = frame;
    self.postMessage({ kind: "busyStarted", frameAtStart });
    const deadline = performance.now() + Number(message.ms ?? 2000);
    while (performance.now() < deadline) {
      // Hard spin — deliberately hold the worker's event loop.
    }
    self.postMessage({ kind: "busyEnded", frameAtStart, frameAtEnd: frame });
  }
};

self.postMessage({ kind: "boot" });
