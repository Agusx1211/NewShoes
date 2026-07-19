#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createWebXrRuntime,
  serializeWebXrInputSources,
  serializeWebXrViews,
} from "./webxr-runtime.mjs";

function matrix(seed) {
  return Float32Array.from({ length: 16 }, (_, index) => seed + index);
}

class FakeSession {
  constructor() {
    this.inputSources = [];
    this.listeners = new Map();
    this.frameCallbacks = [];
    this.referenceSpaceRequests = [];
    this.renderState = null;
    this.ended = false;
    this.visibilityState = "visible";
    this.isSystemKeyboardSupported = true;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  updateRenderState(state) {
    this.renderState = state;
  }

  async requestReferenceSpace(type) {
    this.referenceSpaceRequests.push(type);
    return { type };
  }

  requestAnimationFrame(callback) {
    this.frameCallbacks.push(callback);
    return this.frameCallbacks.length;
  }

  async end() {
    if (this.ended) return;
    this.ended = true;
    this.listeners.get("end")?.();
  }

  fireFrame(time, frame) {
    const callback = this.frameCallbacks.shift();
    assert.ok(callback, "an XR animation frame must be scheduled");
    callback(time, frame);
  }

  fireVisibility(visibilityState) {
    this.visibilityState = visibilityState;
    this.listeners.get("visibilitychange")?.();
  }
}

class FakeLayer {
  constructor(session, gl, options) {
    this.session = session;
    this.gl = gl;
    this.options = options;
    this.framebuffer = { kind: "xr-framebuffer" };
    this.framebufferWidth = 2048;
    this.framebufferHeight = 1024;
  }

  getViewport(view) {
    return view.viewport;
  }
}

const unavailable = createWebXrRuntime({
  navigatorLike: {},
  secureContext: true,
  XRWebGLLayerCtor: FakeLayer,
});
assert.deepEqual((await unavailable.probe()).support, {
  secureContext: true,
  apiAvailable: false,
  layerApiAvailable: true,
  immersiveVrSupported: false,
  reason: "WebXR is unavailable in this browser",
});
assert.equal(unavailable.snapshot().phase, "unavailable");

const insecure = createWebXrRuntime({
  navigatorLike: { xr: { isSessionSupported() {}, requestSession() {} } },
  secureContext: false,
  XRWebGLLayerCtor: FakeLayer,
});
assert.equal((await insecure.probe()).support.reason,
  "WebXR immersive sessions require a secure context");

let requestSessionCalls = 0;
const sessions = [new FakeSession(), new FakeSession()];
const session = sessions[0];
const xr = {
  async isSessionSupported(mode) {
    assert.equal(mode, "immersive-vr");
    return true;
  },
  requestSession(mode, options) {
    requestSessionCalls += 1;
    assert.equal(mode, "immersive-vr");
    assert.deepEqual(options, { optionalFeatures: ["local-floor"] });
    const requested = sessions[requestSessionCalls - 1];
    assert.ok(requested, "runtime requested an unexpected third immersive session");
    return Promise.resolve(requested);
  },
};
const stateChanges = [];
const runtime = createWebXrRuntime({
  navigatorLike: { xr },
  secureContext: true,
  XRWebGLLayerCtor: FakeLayer,
  onStateChange: (state) => stateChanges.push(state),
});
assert.equal((await runtime.probe()).phase, "ready");

await assert.rejects(runtime.start(null), /native renderer adapter/);
assert.equal(requestSessionCalls, 0,
  "invalid renderers must be rejected before requesting an immersive session");

const glCalls = [];
const gl = {
  FRAMEBUFFER: 0x8d40,
  async makeXRCompatible() {
    glCalls.push("makeXRCompatible");
  },
  bindFramebuffer(target, framebuffer) {
    glCalls.push(["bindFramebuffer", target, framebuffer]);
  },
};
const rendererEvents = [];
const renderer = {
  gl,
  onSessionStart(context) {
    rendererEvents.push(["start", context.referenceSpaceType]);
  },
  renderFrame(context) {
    rendererEvents.push(["frame", context]);
  },
  onSessionVisibilityChange(context) {
    rendererEvents.push(["visibility", context.visibilityState]);
  },
  onSessionEnd(context) {
    rendererEvents.push(["end", context.reason]);
  },
};

const started = await runtime.start(renderer);
assert.equal(requestSessionCalls, 1);
assert.equal(started.phase, "running");
assert.equal(started.referenceSpaceType, "local-floor");
assert.deepEqual(started.framebuffer, { width: 2048, height: 1024 });
assert.deepEqual(session.referenceSpaceRequests, ["local-floor"]);
assert.equal(session.renderState.baseLayer instanceof FakeLayer, true);
assert.deepEqual(glCalls, ["makeXRCompatible"]);
assert.deepEqual(rendererEvents, [["start", "local-floor"]]);

const leftView = {
  eye: "left",
  projectionMatrix: matrix(10),
  transform: { matrix: matrix(30), inverse: { matrix: matrix(50) } },
  viewport: { x: 0, y: 0, width: 1024, height: 1024 },
};
const rightView = {
  eye: "right",
  projectionMatrix: matrix(70),
  transform: { matrix: matrix(90), inverse: { matrix: matrix(110) } },
  viewport: { x: 1024, y: 0, width: 1024, height: 1024 },
};
const targetRaySpace = { kind: "target-ray" };
const gripSpace = { kind: "grip" };
session.inputSources = [{
  handedness: "right",
  targetRayMode: "tracked-pointer",
  profiles: ["oculus-touch-v3", "generic-trigger-squeeze-thumbstick"],
  targetRaySpace,
  gripSpace,
  gamepad: {
    id: "right controller",
    mapping: "xr-standard",
    connected: true,
    axes: [0.25, -0.5],
    buttons: [{ pressed: true, touched: true, value: 1 }],
  },
}];
const frame = {
  getViewerPose(referenceSpace) {
    assert.equal(referenceSpace.type, "local-floor");
    return { views: [leftView, rightView] };
  },
  getPose(space, referenceSpace) {
    assert.equal(referenceSpace.type, "local-floor");
    return {
      emulatedPosition: space === targetRaySpace,
      transform: { matrix: space === targetRaySpace ? matrix(130) : matrix(150) },
    };
  },
};
session.fireFrame(123.5, frame);

const frameEvent = rendererEvents.find(([kind]) => kind === "frame")[1];
assert.equal(frameEvent.views.length, 2);
assert.equal(frameEvent.views[0].eye, "left");
assert.deepEqual(frameEvent.views[1].viewport,
  { x: 1024, y: 0, width: 1024, height: 1024 });
assert.deepEqual(frameEvent.views[0].projectionMatrix, Array.from(matrix(10)));
assert.deepEqual(frameEvent.views[0].viewMatrix, Array.from(matrix(50)));
assert.equal(frameEvent.inputSources.length, 1);
assert.equal(frameEvent.inputSources[0].handedness, "right");
assert.equal(frameEvent.inputSources[0].targetRayPose.emulatedPosition, true);
assert.equal(frameEvent.inputSources[0].gripPose.emulatedPosition, false);
assert.deepEqual(frameEvent.inputSources[0].gamepad.axes, [0.25, -0.5]);
assert.deepEqual(glCalls[1], ["bindFramebuffer", gl.FRAMEBUFFER,
  session.renderState.baseLayer.framebuffer]);
assert.deepEqual(runtime.snapshot(), {
  phase: "running",
  support: {
    secureContext: true,
    apiAvailable: true,
    layerApiAvailable: true,
    immersiveVrSupported: true,
    reason: null,
  },
  referenceSpaceType: "local-floor",
  frames: 1,
  lastFrameTime: 123.5,
  viewCount: 2,
  inputSourceCount: 1,
  visibilityState: "visible",
  inputSuspended: false,
  systemKeyboardSupported: true,
  framebuffer: { width: 2048, height: 1024 },
  error: null,
});

assert.equal(serializeWebXrViews({ views: [leftView] }, session.renderState.baseLayer)[0].eye,
  "left");
assert.equal(serializeWebXrInputSources(frame, { type: "local-floor" }, session.inputSources)[0]
  .profiles[0], "oculus-touch-v3");

session.fireVisibility("visible-blurred");
assert.equal(runtime.snapshot().visibilityState, "visible-blurred");
assert.equal(runtime.snapshot().inputSuspended, true);
assert.deepEqual(rendererEvents.at(-1), ["visibility", "visible-blurred"]);
session.fireVisibility("visible");
assert.equal(runtime.snapshot().inputSuspended, false);
assert.deepEqual(rendererEvents.at(-1), ["visibility", "visible"]);

await runtime.stop("unit-test");
assert.equal(runtime.snapshot().phase, "ready");
assert.equal(runtime.snapshot().systemKeyboardSupported, null);
assert.equal(rendererEvents.at(-1)[0], "end");
assert.equal(rendererEvents.at(-1)[1], "session-ended");
assert.ok(stateChanges.some((state) => state.phase === "starting"));
assert.ok(stateChanges.some((state) => state.phase === "running"));

const reentrySession = sessions[1];
reentrySession.inputSources = session.inputSources;
const reentered = await runtime.start(renderer);
assert.equal(requestSessionCalls, 2,
  "re-entering VR must acquire a fresh immersive session");
assert.equal(reentered.phase, "running");
assert.equal(reentrySession.renderState.baseLayer instanceof FakeLayer, true);
assert.deepEqual(reentrySession.referenceSpaceRequests, ["local-floor"]);
reentrySession.fireFrame(456.25, frame);
assert.equal(runtime.snapshot().frames, 1,
  "a new session must restart its own XR frame count");
assert.equal(runtime.snapshot().lastFrameTime, 456.25);
assert.equal(rendererEvents.filter(([kind]) => kind === "start").length, 2,
  "the shipping renderer must be reactivated for the new session");
await runtime.stop("reentry-unit-test");
assert.equal(runtime.snapshot().phase, "ready");
assert.equal(reentrySession.ended, true);

const failedSession = new FakeSession();
const startFailureRuntime = createWebXrRuntime({
  navigatorLike: { xr: {
    isSessionSupported: async () => true,
    requestSession: async () => failedSession,
  } },
  secureContext: true,
  XRWebGLLayerCtor: FakeLayer,
});
await startFailureRuntime.probe();
await assert.rejects(startFailureRuntime.start({
  gl: {
    bindFramebuffer() {},
    async makeXRCompatible() {
      throw new Error("XR compatibility failed");
    },
  },
  renderFrame() {},
}), /XR compatibility failed/);
assert.equal(failedSession.ended, true,
  "a failed session start must end the acquired XR session");
assert.equal(failedSession.listeners.has("visibilitychange"), false,
  "a failed session start must remove its visibility listener");

console.log("WebXR runtime unit: PASS");
