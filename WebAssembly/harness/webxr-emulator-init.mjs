// Playwright init-script test double for the browser APIs owned by a headset.
// Product WebXR code still runs unchanged against navigator.xr and XRWebGLLayer.
export function emulatedXrEyeSeparationMeters(stereo) {
  const views = Array.isArray(stereo?.views) ? stereo.views : [];
  const left = views.find((view) => view?.eye === "left")?.viewMatrix;
  const right = views.find((view) => view?.eye === "right")?.viewMatrix;
  if (left?.length !== 16 || right?.length !== 16) {
    throw new TypeError("emulated WebXR stereo diagnostics require left and right view matrices");
  }
  const separation = Math.hypot(
    Number(right[12]) - Number(left[12]),
    Number(right[13]) - Number(left[13]),
    Number(right[14]) - Number(left[14]),
  );
  if (!Number.isFinite(separation)) {
    throw new TypeError("emulated WebXR eye separation is not finite");
  }
  return separation;
}

export function installEmulatedWebXr({ settings = null } = {}) {
  if (settings) {
    localStorage.setItem("cncPortWebXrSettings.v1", JSON.stringify(settings));
  }

  const identity = () => [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
  const projection = [
    1.1, 0, 0, 0,
    0, 1.1, 0, 0,
    0, 0, -1.002, -1,
    0, 0, -0.2002, 0,
  ];
  const targetRaySpace = {};
  const targetRayMatrix = identity();
  const viewerMatrix = identity();
  const sessionAnchorMatrix = identity();
  const ipdMeters = 0.064;
  const inputSource = {
    handedness: "right",
    targetRayMode: "tracked-pointer",
    profiles: ["generic-trigger-squeeze-thumbstick"],
    targetRaySpace,
    gamepad: {
      id: "emulated WebXR controller",
      mapping: "xr-standard",
      connected: true,
      axes: [0, 0],
      buttons: Array.from({ length: 6 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
    },
  };

  class EmulatedXrSession extends EventTarget {
    constructor() {
      super();
      this.inputSources = [inputSource];
      this.renderState = null;
      this.ended = false;
      this.visibilityState = "visible";
      this.isSystemKeyboardSupported = true;
      this.timers = new Set();
    }

    updateRenderState(state) {
      this.renderState = state;
    }

    async requestReferenceSpace(type) {
      return { type };
    }

    requestAnimationFrame(callback) {
      if (this.ended) return 0;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (this.ended) return;
        const layer = this.renderState.baseLayer;
        const halfWidth = Math.floor(layer.framebufferWidth / 2);
        const makeView = (eye, x, eyeOffset) => {
          const eyeMatrix = [...viewerMatrix];
          eyeMatrix[12] += eyeOffset;
          return {
            eye,
            projectionMatrix: projection,
            transform: {
              matrix: eyeMatrix,
              inverse: { matrix: [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                -eyeMatrix[12], -eyeMatrix[13], -eyeMatrix[14], 1,
              ] },
            },
            viewport: { x, y: 0, width: halfWidth, height: layer.framebufferHeight },
          };
        };
        const views = [
          makeView("left", 0, -ipdMeters * 0.5),
          makeView("right", halfWidth, ipdMeters * 0.5),
        ];
        window.__emulatedXrStereo = {
          ipdMeters,
          views: views.map((view) => ({
            eye: view.eye,
            viewMatrix: [...view.transform.inverse.matrix],
          })),
        };
        const frame = {
          getViewerPose: () => ({
            transform: { matrix: [...viewerMatrix] },
            views,
          }),
          getPose: (space) => space === targetRaySpace
            ? { emulatedPosition: false, transform: { matrix: targetRayMatrix } }
            : null,
        };
        callback(performance.now(), frame);
      }, 16);
      this.timers.add(timer);
      return timer;
    }

    async end() {
      if (this.ended) return;
      this.ended = true;
      for (const timer of this.timers) clearTimeout(timer);
      this.timers.clear();
      this.dispatchEvent(new Event("end"));
    }
  }

  class EmulatedXrWebGlLayer {
    constructor(session, gl) {
      this.session = session;
      this.gl = gl;
      this.framebufferWidth = Math.max(2, gl.drawingBufferWidth);
      this.framebufferHeight = Math.max(1, gl.drawingBufferHeight);
      this.framebuffer = gl.createFramebuffer();
      this.color = gl.createTexture();
      this.depthStencil = gl.createRenderbuffer();
      gl.bindTexture(gl.TEXTURE_2D, this.color);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8,
        this.framebufferWidth, this.framebufferHeight, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthStencil);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8,
        this.framebufferWidth, this.framebufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, this.color, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT,
        gl.RENDERBUFFER, this.depthStencil);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("emulated XR framebuffer is incomplete");
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    getViewport(view) {
      return view.viewport;
    }
  }

  let session = null;
  let sessionCount = 0;
  Object.defineProperty(navigator, "xr", {
    configurable: true,
    value: {
      isSessionSupported: async (mode) => mode === "immersive-vr",
      requestSession: () => {
        sessionAnchorMatrix[12] = viewerMatrix[12];
        sessionAnchorMatrix[13] = viewerMatrix[13];
        sessionAnchorMatrix[14] = viewerMatrix[14];
        session = new EmulatedXrSession();
        sessionCount += 1;
        window.__emulatedXrSession = session;
        window.__emulatedXrSessionCount = sessionCount;
        return Promise.resolve(session);
      },
    },
  });
  Object.defineProperty(window, "XRWebGLLayer", {
    configurable: true,
    value: EmulatedXrWebGlLayer,
  });
  Object.defineProperty(WebGL2RenderingContext.prototype, "makeXRCompatible", {
    configurable: true,
    value: async function makeXRCompatible() {},
  });
  window.__emulatedXrSession = null;
  window.__emulatedXrSessionCount = 0;
  window.__emulatedXrStereo = null;

  const dispatchInputEdge = (index, down) => {
    const type = index === 0
      ? (down ? "selectstart" : "selectend")
      : index === 1 ? (down ? "squeezestart" : "squeezeend") : null;
    if (!type || !session) return;
    const event = new Event(type);
    Object.defineProperty(event, "inputSource", { value: inputSource });
    session.dispatchEvent(event);
  };
  window.__emulatedXrButton = (index, down) => {
    const wasDown = inputSource.gamepad.buttons[index]?.pressed === true;
    inputSource.gamepad.buttons[index] = {
      pressed: down === true,
      touched: down === true,
      value: down === true ? 1 : 0,
    };
    if (wasDown !== (down === true)) dispatchInputEdge(index, down === true);
  };
  window.__emulatedXrButtonTap = (index) => {
    window.__emulatedXrButton(index, true);
    window.__emulatedXrButton(index, false);
  };
  window.__emulatedXrTrigger = (down) => window.__emulatedXrButton(0, down);
  window.__emulatedXrAxes = (x, y) => {
    inputSource.gamepad.axes = [Number(x), Number(y)];
  };
  window.__emulatedXrPointAtEnginePixel = (x, y, width, height, panelWidth) => {
    const pixelWidth = Math.max(2, Number(width));
    const pixelHeight = Math.max(2, Number(height));
    const widthMeters = Number(panelWidth);
    const heightMeters = widthMeters * pixelHeight / pixelWidth;
    const u = Math.max(0, Math.min(1, Number(x) / (pixelWidth - 1)));
    const v = Math.max(0, Math.min(1, Number(y) / (pixelHeight - 1)));
    targetRayMatrix[12] = sessionAnchorMatrix[12] + (u - 0.5) * widthMeters;
    targetRayMatrix[13] = sessionAnchorMatrix[13] + (0.5 - v) * heightMeters;
    targetRayMatrix[14] = sessionAnchorMatrix[14];
  };
  window.__emulatedXrViewerPosition = (x, y, z) => {
    viewerMatrix[12] = Number(x);
    viewerMatrix[13] = Number(y);
    viewerMatrix[14] = Number(z);
  };
  window.__emulatedXrNeutral = () => {
    inputSource.gamepad.axes = [0, 0];
    for (let index = 0; index < inputSource.gamepad.buttons.length; index += 1) {
      inputSource.gamepad.buttons[index] = { pressed: false, touched: false, value: 0 };
    }
  };
  window.__emulatedXrVisibility = (visibilityState) => {
    if (!session) throw new Error("no emulated immersive session is active");
    session.visibilityState = String(visibilityState);
    session.dispatchEvent(new Event("visibilitychange"));
  };
}
