#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  convertWebXrProjectionToD3DDepth,
  createWebXrD3D8Renderer,
  createWebXrD3D8ViewOverride,
  createWebXrEngineListenerPose,
  createWebXrEnginePickRay,
} from "./webxr-d3d8-renderer.mjs";

const identity = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);
const eyeView = new Float32Array(identity);
eyeView[12] = 0.032;
const projection = new Float32Array(identity);
projection[10] = -1.02;
projection[11] = -1;
projection[14] = -0.202;
projection[15] = 0;
const view = {
  viewMatrix: eyeView,
  projectionMatrix: projection,
  viewport: { x: 0, y: 0, width: 800, height: 900 },
};
const override = createWebXrD3D8ViewOverride({
  anchorTransform: identity,
  view,
  framebufferWidth: 1600,
  framebufferHeight: 900,
});
assert.ok(Math.abs(override.viewPrefix[0] - 0.3048) < 0.000001);
assert.ok(Math.abs(override.viewPrefix[5] - 0.3048) < 0.000001);
assert.ok(Math.abs(override.viewPrefix[10] + 0.3048) < 0.000001,
  "D3D +Z forward must become WebXR -Z forward");
assert.ok(Math.abs(override.viewPrefix[12] - 0.032) < 0.000001,
  "per-eye translation remains measured in meters");
const convertedProjection = convertWebXrProjectionToD3DDepth(projection);
for (let column = 0; column < 4; column += 1) {
  const d3dZ = convertedProjection[column * 4 + 2];
  const w = convertedProjection[column * 4 + 3];
  assert.ok(Math.abs((2 * d3dZ - w) - projection[column * 4 + 2]) < 0.000001,
    "the shared D3D shader must reconstruct exact WebXR clip depth");
}
const enginePickRay = createWebXrEnginePickRay({
  targetRayMatrix: identity,
  anchorTransform: identity,
  engineViewMatrix: identity,
  engineUnitsPerMeter: 2,
  rayLengthEngineUnits: 10,
});
assert.deepEqual(enginePickRay.origin, [0, 0, 0]);
assert.deepEqual(enginePickRay.end, [0, 0, 10],
  "WebXR -Z must map to the engine camera's +Z-forward world ray");
const translatedViewer = new Float32Array(identity);
translatedViewer[12] = 1;
translatedViewer[13] = 2;
translatedViewer[14] = -3;
const engineListenerPose = createWebXrEngineListenerPose({
  viewerTransform: translatedViewer,
  anchorTransform: identity,
  engineViewMatrix: identity,
  engineUnitsPerMeter: 2,
});
assert.deepEqual(engineListenerPose, {
  offset: { x: 2, y: 4, z: 6 },
  orientation: {
    frontX: 0,
    frontY: 0,
    frontZ: 1,
    upX: 0,
    upY: 1,
    upZ: 0,
  },
}, "the XR viewer pose must use the same scale and handedness as engine rendering");
const yawedViewer = new Float32Array([
  0, 0, 1, 0,
  0, 1, 0, 0,
  -1, 0, 0, 0,
  0, 0, 0, 1,
]);
assert.deepEqual(createWebXrEngineListenerPose({
  viewerTransform: yawedViewer,
  anchorTransform: identity,
  engineViewMatrix: identity,
}), {
  offset: { x: 0, y: 0, z: 0 },
  orientation: {
    frontX: 1,
    frontY: 0,
    frontZ: 0,
    upX: 0,
    upY: 1,
    upZ: 0,
  },
}, "XR head rotation must control the listener orientation, not only its position");

const log = [];
const hooks = new Proxy({}, {
  get(_target, hook) {
    if (typeof hook !== "string") return undefined;
    return (...args) => {
      log.push(["hook", hook, ...args]);
      return hook === "cncPortD3D8DrawIndexed" ? 1 : true;
    };
  },
});
const diag = {
  bindD3D8ExternalFramebuffer: (...args) => log.push(["bindExternal", ...args]),
  setD3D8XrViewOverride: (...args) => log.push(["override", ...args]),
  invalidateD3D8ExternalGlState: () => log.push(["invalidateExternal"]),
  flushD3D8PendingDrawBatch: (...args) => log.push(["flush", ...args]),
};
const gl = {
  FRAMEBUFFER: 0x8d40,
  COLOR_BUFFER_BIT: 0x4000,
  DEPTH_BUFFER_BIT: 0x0100,
  STENCIL_BUFFER_BIT: 0x0400,
  SCISSOR_TEST: 0x0c11,
  colorMask: (...args) => log.push(["colorMask", ...args]),
  clearColor: (...args) => log.push(["clearColor", ...args]),
  depthMask: (...args) => log.push(["depthMask", ...args]),
  clearDepth: (...args) => log.push(["clearDepth", ...args]),
  stencilMask: (...args) => log.push(["stencilMask", ...args]),
  clearStencil: (...args) => log.push(["clearStencil", ...args]),
  getContextAttributes: () => ({ stencil: true }),
  enable: (...args) => log.push(["enable", ...args]),
  viewport: (...args) => log.push(["viewport", ...args]),
  scissor: (...args) => log.push(["scissor", ...args]),
  clear: (...args) => log.push(["clear", ...args]),
  bindFramebuffer: (...args) => log.push(["glBindFramebuffer", ...args]),
};
const inputActions = [];
const audioListenerPoses = [];
const worldScene = { active: true, newGameCount: 1, clearGameDataCount: 0 };
assert.throws(() => createWebXrD3D8Renderer({
  gl,
  executorHooks: hooks,
  executorDiag: diag,
  worldScale: 0,
}), /positive world scale/);
assert.throws(() => createWebXrD3D8Renderer({
  gl,
  executorHooks: hooks,
  executorDiag: diag,
  panelDistanceMeters: 0,
}), /positive panel geometry/);
const renderer = createWebXrD3D8Renderer({
  gl,
  executorHooks: hooks,
  executorDiag: diag,
  worldSceneState: () => worldScene,
  onInputAction: (action) => inputActions.push(action),
  onAudioListenerPose: (pose) => audioListenerPoses.push(pose),
});
renderer.onSessionStart();
assert.equal(audioListenerPoses.at(-1), null,
  "session entry must clear any stale XR audio listener pose");
let completion = null;
const worldDraw = {
  statePayloadCanonical: true,
  vertexShaderFvf: 0x002,
  transformMask: 7,
  transforms: { world: identity, view: identity, projection: identity },
};
assert.equal(renderer.acceptFrame({
  version: 1,
  sequence: 7,
  present: { backBufferWidth: 1280, backBufferHeight: 720 },
  commands: [
    { hook: "cncPortD3D8BufferUpdate", args: [{ id: 1, bytes: new Uint8Array([1]) }] },
    { hook: "cncPortD3D8BindFramebuffer", args: [{ colorTextureId: 0 }] },
    { hook: "cncPortD3D8Clear", args: [3, 1, 2, 3, 255, 1, 0] },
    { hook: "cncPortD3D8TextureBind", args: [{ stage: 0, id: 2 }] },
    { hook: "cncPortD3D8DrawIndexed", args: [worldDraw] },
    { hook: "cncPortD3D8Present", args: [{}] },
  ],
}, (accepted) => { completion = accepted; }), true);
renderer.renderFrame({
  pose: { transform: { matrix: identity } },
  views: [view, { ...view, viewport: { x: 800, y: 0, width: 800, height: 900 } }],
  inputSources: [{ handedness: "left" }],
  layer: { framebuffer: {}, framebufferWidth: 1600, framebufferHeight: 900 },
});
assert.equal(completion, true);
assert.equal(log.filter((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8BufferUpdate").length, 1,
"resource updates execute once per engine frame");
assert.equal(log.filter((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8DrawIndexed").length, 2,
"world geometry executes once per compositor view");
assert.equal(log.some((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8Present"), false,
"D3D Present must not replace the compositor framebuffer");
assert.deepEqual(renderer.snapshot(), {
  active: true,
  frames: 1,
  sequence: 7,
  viewCount: 2,
  worldDraws: 2,
  retainedWorldDraws: 0,
  retainedWorldCommandCount: 1,
  uiDraws: 0,
  pointerDraws: 0,
  vignetteDraws: 0,
  vignetteFrames: 0,
  inputSourceCount: 1,
  controllerPointer: null,
  enginePickRayReady: true,
  audioListenerPoseReady: true,
  recenterCount: 0,
  visibilityState: "visible",
  inputSuspended: false,
  inputWaitingForNeutral: false,
  inputNeutralBlockers: [],
  cameraMotion: { active: false, turning: false, panning: false, zooming: false },
  comfort: {
    worldScale: 1,
    panelWidthMeters: 1.6,
    panelDistanceMeters: 1.5,
    heightOffsetMeters: 0,
    dominantHand: "right",
    rotationMode: "continuous",
    motionVignette: true,
    stickDeadzone: 0.55,
    stickReleaseThreshold: 0.35,
  },
  error: null,
});
assert.deepEqual(audioListenerPoses.at(-1), {
  offset: { x: 0, y: 0, z: 0 },
  orientation: {
    frontX: 0,
    frontY: 0,
    frontZ: 1,
    upX: 0,
    upY: 1,
    upZ: 0,
  },
}, "the compositor must publish a head-tracked listener pose after receiving an engine view");

const trackedButtons = Array.from({ length: 6 }, (_, index) =>
  ({ pressed: index === 0, value: index === 0 ? 1 : 0 }));
const trackedSource = {
  handedness: "right",
  profiles: ["generic-trigger-squeeze-thumbstick"],
  targetRayPose: { matrix: identity },
  gamepad: { axes: [0, 0], buttons: trackedButtons },
};
const trackedFrame = {
  time: 20,
  pose: { transform: { matrix: identity } },
  views: [view],
  inputSources: [trackedSource],
  layer: { framebuffer: {}, framebufferWidth: 1600, framebufferHeight: 900 },
};
renderer.renderFrame(trackedFrame);
assert.ok(inputActions.some((action) => action.type === "pointer"
  && action.target === "ui"
  && action.point.x === 640 && action.point.y === 360
  && action.ray?.end?.[2] > action.ray?.origin?.[2]),
"the compositor controller ray must resolve to engine client coordinates");
assert.ok(inputActions.some((action) => action.type === "button"
  && action.button === "primary" && action.down === true),
"controller trigger must enter the original engine input bridge");
renderer.onSessionVisibilityChange({ visibilityState: "visible-blurred" });
assert.equal(renderer.snapshot().inputSuspended, true);
assert.equal(renderer.snapshot().controllerPointer, null);
assert.ok(inputActions.some((action) => action.type === "button"
  && action.button === "primary" && action.down === false),
"losing exclusive XR visibility must release held engine input");
renderer.onSessionVisibilityChange({ visibilityState: "visible" });
assert.equal(renderer.getControlsState().waitingForNeutral, true,
  "resuming XR input must wait for controllers to return to neutral");
renderer.renderFrame({ ...trackedFrame, time: 30 });
assert.equal(renderer.snapshot().controllerPointer, null);
trackedButtons[0] = { pressed: false, value: 0 };
renderer.renderFrame({ ...trackedFrame, time: 40 });
assert.equal(renderer.getControlsState().waitingForNeutral, false);
assert.equal(renderer.snapshot().controllerPointer?.target, "ui",
  "neutral controls must re-arm tracked pointing after visibility resumes");
let shutdownFrameAccepted = null;
assert.equal(renderer.acceptFrame({
  version: 1,
  sequence: 8,
  present: { backBufferWidth: 1280, backBufferHeight: 720 },
  commandBytes: 32,
  commands: [
    { hook: "cncPortD3D8BindFramebuffer", args: [{ colorTextureId: 0 }] },
    { hook: "cncPortD3D8Present", args: [{}] },
  ],
}, (accepted) => { shutdownFrameAccepted = accepted; }), true);
renderer.onSessionEnd();
assert.equal(shutdownFrameAccepted, true,
  "session exit must drain its pending frame through the default executor");
assert.ok(log.some((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8Present"),
  "the drained shutdown frame must reach the ordinary Window executor");
assert.equal(audioListenerPoses.at(-1), null,
  "session exit must restore the ordinary engine-owned audio listener");
assert.ok(inputActions.some((action) => action.type === "button"
  && action.button === "primary" && action.down === false),
"ending immersive mode must release held engine input");
assert.ok(inputActions.some((action) => action.type === "pickRay" && action.ray === null),
  "ending immersive mode must clear the native controller ray");
assert.equal(renderer.snapshot().controllerPointer, null);

const drawCountBeforeReentry = log.filter((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8DrawIndexed").length;
const logLengthBeforeReentry = log.length;
renderer.onSessionStart();
let reentryFrameAccepted = null;
assert.equal(renderer.acceptFrame({
  version: 1,
  sequence: 9,
  present: { backBufferWidth: 1280, backBufferHeight: 720 },
  commands: [
    { hook: "cncPortD3D8BindFramebuffer", args: [{ colorTextureId: 0 }] },
    { hook: "cncPortD3D8Present", args: [{}] },
  ],
}, (accepted) => { reentryFrameAccepted = accepted; }), true);
renderer.renderFrame({
  pose: { transform: { matrix: identity } },
  views: [view, { ...view, viewport: { x: 800, y: 0, width: 800, height: 900 } }],
  inputSources: [],
  layer: { framebuffer: {}, framebufferWidth: 1600, framebufferHeight: 900 },
});
assert.equal(reentryFrameAccepted, true);
assert.equal(log.filter((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8DrawIndexed").length, drawCountBeforeReentry + 2,
"ordinary session replacement must replay the retained world once per compositor view");
const reboundTextures = log.slice(logLengthBeforeReentry)
  .filter((entry) => entry[0] === "hook" && entry[1] === "cncPortD3D8TextureBind")
  .map((entry) => entry[2]);
assert.deepEqual(reboundTextures, Array.from({ length: 8 }, (_, stage) => ({
  stage,
  id: stage === 0 ? 2 : 0,
})),
"retained world replay must restore its exact texture-stage bindings");
assert.equal(renderer.snapshot().retainedWorldDraws, 2);
assert.equal(renderer.snapshot().retainedWorldCommandCount, 1);
assert.equal(renderer.snapshot().enginePickRayReady, true);

worldScene.active = false;
assert.equal(renderer.acceptFrame({
  version: 1,
  sequence: 10,
  present: { backBufferWidth: 1280, backBufferHeight: 720 },
  commands: [
    { hook: "cncPortD3D8BindFramebuffer", args: [{ colorTextureId: 0 }] },
    { hook: "cncPortD3D8Present", args: [{}] },
  ],
}, () => {}), true);
renderer.renderFrame({
  pose: { transform: { matrix: identity } },
  views: [view],
  inputSources: [],
  layer: { framebuffer: {}, framebufferWidth: 1600, framebufferHeight: 900 },
});
assert.equal(log.filter((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8DrawIndexed").length, drawCountBeforeReentry + 2,
"leaving the match must invalidate the retained world before shell composition");
assert.equal(renderer.snapshot().retainedWorldCommandCount, 0);
assert.equal(renderer.snapshot().enginePickRayReady, false);

const lostRenderer = createWebXrD3D8Renderer({ gl, executorHooks: hooks, executorDiag: diag });
lostRenderer.onSessionStart();
let lostFrameAccepted = null;
const presentCountBeforeLoss = log.filter((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8Present").length;
assert.equal(lostRenderer.acceptFrame({
  version: 1,
  sequence: 11,
  present: { backBufferWidth: 1280, backBufferHeight: 720 },
  commands: [
    { hook: "cncPortD3D8BindFramebuffer", args: [{ colorTextureId: 0 }] },
    { hook: "cncPortD3D8Present", args: [{}] },
  ],
}, (accepted) => { lostFrameAccepted = accepted; }), true);
lostRenderer.onSessionEnd({
  reason: "graphics-context-lost",
  error: new Error("test WebXR graphics context loss"),
});
assert.equal(lostFrameAccepted, false,
  "a lost graphics context must reject rather than falsely drain its pending frame");
assert.equal(log.filter((entry) => entry[0] === "hook"
  && entry[1] === "cncPortD3D8Present").length, presentCountBeforeLoss,
  "context-loss cleanup must not claim a Present on the lost executor");
assert.equal(lostRenderer.snapshot().active, false);
assert.equal(lostRenderer.snapshot().error, "test WebXR graphics context loss");

console.log("WebXR D3D8 renderer unit: PASS");
