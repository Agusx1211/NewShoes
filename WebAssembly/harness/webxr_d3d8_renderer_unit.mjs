#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  convertWebXrProjectionToD3DDepth,
  createWebXrD3D8Renderer,
  createWebXrD3D8ViewOverride,
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
  onInputAction: (action) => inputActions.push(action),
});
renderer.onSessionStart();
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
  uiDraws: 0,
  pointerDraws: 0,
  inputSourceCount: 1,
  controllerPointer: null,
  enginePickRayReady: true,
  recenterCount: 0,
  visibilityState: "visible",
  inputSuspended: false,
  inputWaitingForNeutral: false,
  inputNeutralBlockers: [],
  comfort: {
    worldScale: 1,
    panelWidthMeters: 1.6,
    panelDistanceMeters: 1.5,
    heightOffsetMeters: 0,
    dominantHand: "right",
    stickDeadzone: 0.55,
    stickReleaseThreshold: 0.35,
  },
  error: null,
});

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
renderer.onSessionEnd();
assert.ok(inputActions.some((action) => action.type === "button"
  && action.button === "primary" && action.down === false),
"ending immersive mode must release held engine input");
assert.ok(inputActions.some((action) => action.type === "pickRay" && action.ray === null),
  "ending immersive mode must clear the native controller ray");
assert.equal(renderer.snapshot().controllerPointer, null);

console.log("WebXR D3D8 renderer unit: PASS");
