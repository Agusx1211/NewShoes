const IMMERSIVE_VR_MODE = "immersive-vr";
const LOCAL_FLOOR_REFERENCE_SPACE = "local-floor";
const LOCAL_REFERENCE_SPACE = "local";

function errorText(error) {
  return error?.message ?? String(error);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function copyMatrix(matrix) {
  if (!matrix || typeof matrix.length !== "number" || matrix.length !== 16) {
    return null;
  }
  return Array.from(matrix, (value) => finiteNumber(value));
}

function copyPose(pose) {
  if (!pose) return null;
  return {
    emulatedPosition: pose.emulatedPosition === true,
    matrix: copyMatrix(pose.transform?.matrix),
  };
}

function copyGamepad(gamepad) {
  if (!gamepad) return null;
  return {
    id: String(gamepad.id ?? ""),
    mapping: String(gamepad.mapping ?? ""),
    connected: gamepad.connected !== false,
    axes: Array.from(gamepad.axes ?? [], (value) => finiteNumber(value)),
    buttons: Array.from(gamepad.buttons ?? [], (button) => ({
      pressed: button?.pressed === true,
      touched: button?.touched === true,
      value: finiteNumber(button?.value),
    })),
  };
}

export function serializeWebXrInputSources(frame, referenceSpace, inputSources, sourceId = null) {
  return Array.from(inputSources ?? [], (source, index) => ({
    id: (typeof sourceId === "function" ? sourceId(source, index) : null) ?? index,
    index,
    handedness: String(source?.handedness ?? "none"),
    targetRayMode: String(source?.targetRayMode ?? "tracked-pointer"),
    profiles: Array.from(source?.profiles ?? [], (profile) => String(profile)),
    targetRayPose: source?.targetRaySpace
      ? copyPose(frame.getPose(source.targetRaySpace, referenceSpace))
      : null,
    gripPose: source?.gripSpace
      ? copyPose(frame.getPose(source.gripSpace, referenceSpace))
      : null,
    gamepad: copyGamepad(source?.gamepad),
  }));
}

export function serializeWebXrViews(pose, layer) {
  return Array.from(pose?.views ?? [], (view, index) => {
    const viewport = layer.getViewport(view);
    if (!viewport) {
      throw new Error(`WebXR compositor did not provide viewport for view ${index}`);
    }
    return {
      index,
      eye: String(view?.eye ?? "none"),
      projectionMatrix: copyMatrix(view?.projectionMatrix),
      viewMatrix: copyMatrix(view?.transform?.inverse?.matrix),
      transformMatrix: copyMatrix(view?.transform?.matrix),
      viewport: {
        x: finiteNumber(viewport.x),
        y: finiteNumber(viewport.y),
        width: finiteNumber(viewport.width),
        height: finiteNumber(viewport.height),
      },
    };
  });
}

function validateRenderer(renderer) {
  if (!renderer || typeof renderer !== "object") {
    throw new TypeError("WebXR start requires a native renderer adapter");
  }
  const gl = renderer.gl;
  if (!gl || typeof gl.bindFramebuffer !== "function") {
    throw new TypeError("WebXR renderer adapter requires its main-realm WebGL2 context");
  }
  if (typeof gl.makeXRCompatible !== "function") {
    throw new TypeError("WebXR renderer WebGL2 context cannot be made XR-compatible");
  }
  if (typeof renderer.renderFrame !== "function") {
    throw new TypeError("WebXR renderer adapter requires renderFrame(frameContext)");
  }
  return gl;
}

function initialSupportSnapshot(secureContext) {
  return {
    secureContext: secureContext === true,
    apiAvailable: false,
    layerApiAvailable: false,
    immersiveVrSupported: null,
    reason: null,
  };
}

export function createWebXrRuntime({
  navigatorLike = globalThis.navigator,
  secureContext = globalThis.isSecureContext,
  XRWebGLLayerCtor = globalThis.XRWebGLLayer,
  onStateChange = null,
} = {}) {
  let active = null;
  const inputSourceIds = new WeakMap();
  let nextInputSourceId = 1;
  let probePromise = null;
  let startPromise = null;
  let finalizePromise = null;
  let state = {
    phase: "idle",
    support: initialSupportSnapshot(secureContext),
    referenceSpaceType: null,
    frames: 0,
    lastFrameTime: null,
    viewCount: 0,
    inputSourceCount: 0,
    visibilityState: null,
    inputSuspended: false,
    systemKeyboardSupported: null,
    framebuffer: null,
    error: null,
  };

  function snapshot() {
    return {
      ...state,
      support: { ...state.support },
      framebuffer: state.framebuffer ? { ...state.framebuffer } : null,
    };
  }

  function publish(patch) {
    state = { ...state, ...patch };
    const current = snapshot();
    onStateChange?.(current);
    return current;
  }

  async function probe() {
    if (probePromise) return probePromise;
    probePromise = (async () => {
      const xr = navigatorLike?.xr;
      const support = {
        secureContext: secureContext === true,
        apiAvailable: Boolean(xr && typeof xr.isSessionSupported === "function"
          && typeof xr.requestSession === "function"),
        layerApiAvailable: typeof XRWebGLLayerCtor === "function",
        immersiveVrSupported: false,
        reason: null,
      };
      if (!support.secureContext) {
        support.reason = "WebXR immersive sessions require a secure context";
      } else if (!support.apiAvailable) {
        support.reason = "WebXR is unavailable in this browser";
      } else if (!support.layerApiAvailable) {
        support.reason = "XRWebGLLayer is unavailable in this browser";
      } else {
        try {
          support.immersiveVrSupported = await xr.isSessionSupported(IMMERSIVE_VR_MODE);
          if (!support.immersiveVrSupported) {
            support.reason = "No immersive-vr device is available";
          }
        } catch (error) {
          support.reason = `WebXR support probe failed: ${errorText(error)}`;
        }
      }
      publish({
        phase: support.immersiveVrSupported ? "ready" : "unavailable",
        support,
        error: support.reason,
      });
      return snapshot();
    })();
    try {
      return await probePromise;
    } finally {
      probePromise = null;
    }
  }

  async function finalizeSession(session, reason, error = null) {
    if (finalizePromise) return finalizePromise;
    finalizePromise = (async () => {
      const current = active;
      if (!current || current.session !== session) return snapshot();
      active = null;
      current.session.removeEventListener?.("visibilitychange", current.visibilityListener);
      try {
        await current.renderer.onSessionEnd?.({ reason, error });
      } catch (cleanupError) {
        error ??= cleanupError;
      }
      return publish({
        phase: error ? "failed" : "ready",
        referenceSpaceType: null,
        visibilityState: null,
        inputSuspended: false,
        systemKeyboardSupported: null,
        framebuffer: null,
        error: error ? errorText(error) : null,
      });
    })();
    try {
      return await finalizePromise;
    } finally {
      finalizePromise = null;
    }
  }

  function handleSessionVisibility(session) {
    const current = active;
    if (!current || current.session !== session) return;
    const visibilityState = String(session.visibilityState ?? "visible");
    const inputSuspended = visibilityState !== "visible";
    try {
      current.renderer.onSessionVisibilityChange?.({
        session,
        visibilityState,
        inputSuspended,
      });
      publish({ visibilityState, inputSuspended });
    } catch (error) {
      publish({ phase: "failed", error: errorText(error) });
      void session.end()
        .catch(() => {})
        .finally(() => finalizeSession(session, "visibility-error", error));
    }
  }

  function scheduleFrame(session) {
    session.requestAnimationFrame((time, frame) => {
      const current = active;
      if (!current || current.session !== session) return;
      scheduleFrame(session);
      try {
        const pose = frame.getViewerPose(current.referenceSpace);
        if (!pose) return;
        current.gl.bindFramebuffer(current.gl.FRAMEBUFFER, current.layer.framebuffer);
        const views = serializeWebXrViews(pose, current.layer);
        const inputSources = serializeWebXrInputSources(
          frame,
          current.referenceSpace,
          session.inputSources,
          (source, index) => {
            if (!source || typeof source !== "object") return index;
            if (!inputSourceIds.has(source)) inputSourceIds.set(source, nextInputSourceId++);
            return inputSourceIds.get(source);
          },
        );
        current.renderer.renderFrame({
          time: finiteNumber(time),
          frame,
          pose,
          views,
          inputSources,
          session,
          referenceSpace: current.referenceSpace,
          referenceSpaceType: current.referenceSpaceType,
          layer: current.layer,
          gl: current.gl,
        });
        publish({
          phase: "running",
          frames: state.frames + 1,
          lastFrameTime: finiteNumber(time),
          viewCount: views.length,
          inputSourceCount: inputSources.length,
          error: null,
        });
      } catch (error) {
        publish({ phase: "failed", error: errorText(error) });
        void session.end()
          .catch(() => {})
          .finally(() => finalizeSession(session, "render-error", error));
      }
    });
  }

  async function start(renderer) {
    if (startPromise) return startPromise;
    if (active) return snapshot();
    const gl = validateRenderer(renderer);
    if (state.support.immersiveVrSupported !== true) {
      throw new Error("Probe immersive-vr support before starting from a user gesture");
    }

    // requestSession must be invoked before the first await so a click handler
    // retains the transient user activation required by immersive WebXR.
    let sessionRequest;
    try {
      sessionRequest = navigatorLike.xr.requestSession(IMMERSIVE_VR_MODE, {
        optionalFeatures: [LOCAL_FLOOR_REFERENCE_SPACE],
      });
    } catch (error) {
      publish({ phase: "failed", error: errorText(error) });
      throw error;
    }
    publish({ phase: "starting", error: null });
    startPromise = (async () => {
      let session = null;
      let visibilityListener = null;
      try {
        session = await sessionRequest;
        const endListener = () => {
          void finalizeSession(session, "session-ended");
        };
        visibilityListener = () => handleSessionVisibility(session);
        session.addEventListener("end", endListener, { once: true });
        session.addEventListener("visibilitychange", visibilityListener);

        await gl.makeXRCompatible();
        const layer = new XRWebGLLayerCtor(session, gl, {
          alpha: false,
          antialias: false,
          depth: true,
          stencil: true,
        });
        session.updateRenderState({ baseLayer: layer });

        let referenceSpace;
        let referenceSpaceType = LOCAL_FLOOR_REFERENCE_SPACE;
        try {
          referenceSpace = await session.requestReferenceSpace(referenceSpaceType);
        } catch (_error) {
          referenceSpaceType = LOCAL_REFERENCE_SPACE;
          referenceSpace = await session.requestReferenceSpace(referenceSpaceType);
        }

        active = { session, renderer, gl, layer, referenceSpace, referenceSpaceType,
          visibilityListener };
        await renderer.onSessionStart?.({
          session,
          gl,
          layer,
          referenceSpace,
          referenceSpaceType,
        });
        publish({
          phase: "running",
          referenceSpaceType,
          frames: 0,
          lastFrameTime: null,
          viewCount: 0,
          inputSourceCount: Number(session.inputSources?.length ?? 0),
          visibilityState: String(session.visibilityState ?? "visible"),
          inputSuspended: String(session.visibilityState ?? "visible") !== "visible",
          systemKeyboardSupported: session.isSystemKeyboardSupported === true,
          framebuffer: {
            width: finiteNumber(layer.framebufferWidth),
            height: finiteNumber(layer.framebufferHeight),
          },
          error: null,
        });
        scheduleFrame(session);
        return snapshot();
      } catch (error) {
        if (session) {
          session.removeEventListener?.("visibilitychange", visibilityListener);
          try {
            await session.end();
          } catch (_endError) {
            // The start error remains authoritative.
          }
        }
        active = null;
        publish({
          phase: "failed",
          referenceSpaceType: null,
          visibilityState: null,
          inputSuspended: false,
          framebuffer: null,
          error: errorText(error),
        });
        throw error;
      }
    })();
    try {
      return await startPromise;
    } finally {
      startPromise = null;
    }
  }

  async function stop(reason = "requested") {
    const current = active;
    if (!current) return snapshot();
    publish({ phase: "ending" });
    try {
      await current.session.end();
    } finally {
      await finalizeSession(current.session, reason);
    }
    return snapshot();
  }

  return { probe, start, stop, snapshot };
}

export const WEBXR_IMMERSIVE_VR_MODE = IMMERSIVE_VR_MODE;
