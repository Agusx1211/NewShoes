#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createWebXrControls,
  intersectWebXrRayWithPanel,
} from "./webxr-controls.mjs";

function transform({ x = 0, y = 0, z = 0 } = {}) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ];
}

const worldRay = {
  origin: [10, 20, 30],
  end: [10, 20, 130],
};

const panel = {
  anchorTransform: transform({ x: 2, y: 1, z: 3 }),
  panelWidthMeters: 1.6,
  panelHeightMeters: 0.9,
  panelDistanceMeters: 1.5,
  backbufferWidth: 1600,
  backbufferHeight: 900,
  resolveWorldRay: () => worldRay,
};
const center = intersectWebXrRayWithPanel({
  ...panel,
  targetRayMatrix: transform({ x: 2, y: 1, z: 3 }),
});
assert.ok(center);
assert.deepEqual(center.point, { x: 800, y: 450 });
assert.ok(Math.abs(center.distanceMeters - 1.5) < 1e-6);

const rightEdge = intersectWebXrRayWithPanel({
  ...panel,
  targetRayMatrix: transform({ x: 2.8, y: 1, z: 3 }),
});
assert.deepEqual(rightEdge.point, { x: 1599, y: 450 });
assert.equal(intersectWebXrRayWithPanel({
  ...panel,
  targetRayMatrix: transform({ x: 2.81, y: 1, z: 3 }),
}), null, "rays outside the floating panel must not click the game");

function button(value = false) {
  return { pressed: value, value: value ? 1 : 0 };
}

function buttons() {
  return Array.from({ length: 6 }, () => button());
}

function findAction(actions, expected, start = 0) {
  return actions.findIndex((action, index) => index >= start
    && Object.entries(expected).every(([key, value]) => action[key] === value));
}

const actions = [];
const haptics = [];
const controls = createWebXrControls({ onAction: (action) => actions.push(action) });
const rightButtons = buttons();
const right = {
  handedness: "right",
  profiles: ["generic-trigger-squeeze-thumbstick"],
  targetRayPose: { matrix: transform({ x: 2, y: 1, z: 3 }) },
  gamepad: {
    mapping: "xr-standard",
    axes: [0, 0],
    buttons: rightButtons,
    hapticActuators: [{ pulse: (intensity, duration) => {
      haptics.push({ intensity, duration });
      return Promise.resolve(true);
    } }],
  },
};
const leftButtons = buttons();
const left = {
  handedness: "left",
  profiles: ["generic-trigger-squeeze-thumbstick"],
  targetRayPose: { matrix: transform({ x: 2.1, y: 1, z: 3 }) },
  gamepad: { mapping: "xr-standard", axes: [0, 0], buttons: leftButtons },
};

controls.update({ ...panel, time: 0, inputSources: [left, right] });
assert.deepEqual(actions.at(-1), {
  type: "pointer",
  target: "ui",
  point: { x: 800, y: 450 },
  ray: worldRay,
  handedness: "right",
});
assert.equal(controls.snapshot().paired, true);
assert.deepEqual(controls.snapshot().pointer.spatialRay, {
  origin: [2, 1, 3],
  end: [2, 1, 1.5],
}, "the compositor pointer must preserve the tracked reference-space ray");
assert.deepEqual(controls.snapshot().sources.map(({ handedness, role }) => ({ handedness, role })), [
  { handedness: "left", role: "offhand" },
  { handedness: "right", role: "dominant" },
]);

rightButtons[0] = button(true);
controls.update({ ...panel, time: 10, inputSources: [left, right] });
assert.equal(controls.snapshot().pointer.pressed, true);
assert.ok(actions.some((action) => action.type === "button"
  && action.button === "primary" && action.down === true));
assert.deepEqual(haptics, [{ intensity: 0.22, duration: 24 }]);

rightButtons[0] = button();
controls.update({ ...panel, time: 15, inputSources: [right, left] });
let start = actions.length;
leftButtons[0] = button(true);
rightButtons[1] = button(true);
controls.update({ ...panel, time: 20, inputSources: [right, left] });
assert.ok(findAction(actions, { type: "key", code: "AltLeft", down: true }, start)
  < findAction(actions, { type: "button", button: "secondary", down: true }, start),
"waypoint modifier must enter the original input stream before the contextual click");

leftButtons[0] = button();
rightButtons[1] = button();
controls.update({ ...panel, time: 25, inputSources: [right, left] });
start = actions.length;
leftButtons[1] = button(true);
rightButtons[0] = button(true);
controls.update({ ...panel, time: 30, inputSources: [right, left] });
assert.ok(findAction(actions, { type: "key", code: "ControlLeft", down: true }, start)
  < findAction(actions, { type: "button", button: "primary", down: true }, start),
"force-fire modifier must enter the original input stream before the primary click");

rightButtons[0] = button();
leftButtons[1] = button();
leftButtons[4] = button(true);
controls.update({ ...panel, time: 35, inputSources: [right, left] });
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "ShiftLeft" && action.down === true));

leftButtons[4] = button();
left.gamepad.axes = [-0.8, 0.8];
controls.update({ ...panel, time: 40, inputSources: [right, left] });
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "ArrowLeft" && action.down === true));
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "ArrowDown" && action.down === true));

left.gamepad.axes = [0, -0.9];
leftButtons[3] = button(true);
leftButtons[1] = button(true);
start = actions.length;
controls.update({ ...panel, time: 45, inputSources: [right, left] });
assert.ok(findAction(actions,
  { type: "key", code: "ControlLeft", down: true }, start)
  < findAction(actions, { type: "key", code: "Digit1", down: true }, start),
"offhand stick-click radial must reach the original control-group digit path");

right.gamepad.axes = [0.8, -0.8];
controls.update({ ...panel, time: 50, inputSources: [left, right] });
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "Numpad6" && action.down === true));
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "Numpad8" && action.down === true));

rightButtons[4] = button(true);
rightButtons[5] = button(true);
rightButtons[3] = button(true);
controls.update({ ...panel, time: 55, inputSources: [left, right] });
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "KeyA" && action.down === true));
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "Escape" && action.down === true));
assert.ok(actions.some((action) => action.type === "recenter"));

left.gamepad.axes = [0, 0];
right.gamepad.axes = [0, 0];
leftButtons[1] = button();
controls.update({ ...panel, time: 60, inputSources: [right, left] });
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "ArrowLeft" && action.down === false));
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "Numpad6" && action.down === false));

controls.update({ ...panel, time: 65, inputSources: [] });
assert.ok(actions.some((action) => action.type === "button"
  && action.button === "primary" && action.down === false),
"disconnecting a controller must release held engine buttons");
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "ShiftLeft" && action.down === false),
"disconnecting the offhand must release held original-engine modifiers");
assert.ok(actions.some((action) => action.type === "pickRay" && action.ray === null),
  "losing all tracked targets must clear the native engine-world ray");
assert.equal(controls.snapshot().sourceCount, 0);

for (let index = 0; index < rightButtons.length; index += 1) rightButtons[index] = button();
right.gamepad.axes = [0, 0];
right.targetRayPose.matrix = transform({ x: 2.81, y: 1, z: 3 });
controls.update({ ...panel, time: 70, inputSources: [right] });
assert.deepEqual(actions.at(-1), {
  type: "pointer",
  target: "world",
  point: { x: 800, y: 450 },
  ray: worldRay,
  handedness: "right",
}, "a ray outside the UI panel must retain an engine-world target");
assert.deepEqual(controls.snapshot().pointer.spatialRay, {
  origin: [2.81, 1, 3],
  end: [2.81, 1, -1.5],
}, "battlefield feedback must retain the tracked ray without fabricating an engine hit");

const fallbackActions = [];
const fallback = createWebXrControls({ onAction: (action) => fallbackActions.push(action) });
right.targetRayPose.matrix = transform({ x: 2, y: 1, z: 3 });
const fallbackUpdate = (time) => fallback.update({ ...panel, time, inputSources: [right] });
fallbackUpdate(0);
assert.equal(fallback.snapshot().paired, false);

rightButtons[4] = button(true);
fallbackUpdate(10);
rightButtons[4] = button();
fallbackUpdate(20);
assert.ok(findAction(fallbackActions, { type: "key", code: "ShiftLeft", down: false })
  < findAction(fallbackActions, { type: "key", code: "KeyA", down: true }),
"a one-controller A/X tap must release its Shift layer before attack-move");

let fallbackStart = fallbackActions.length;
rightButtons[5] = button(true);
fallbackUpdate(30);
rightButtons[5] = button();
fallbackUpdate(40);
assert.notEqual(findAction(fallbackActions,
  { type: "key", code: "Escape", down: true }, fallbackStart), -1);

fallbackStart = fallbackActions.length;
rightButtons[4] = button(true);
rightButtons[5] = button(true);
fallbackUpdate(50);
rightButtons[4] = button();
rightButtons[5] = button();
fallbackUpdate(60);
assert.notEqual(findAction(fallbackActions, { type: "recenter" }, fallbackStart), -1);
assert.equal(findAction(fallbackActions,
  { type: "key", code: "KeyA", down: true }, fallbackStart), -1);
assert.equal(findAction(fallbackActions,
  { type: "key", code: "Escape", down: true }, fallbackStart), -1);

fallbackStart = fallbackActions.length;
rightButtons[2] = button(true);
rightButtons[0] = button(true);
fallbackUpdate(70);
assert.ok(findAction(fallbackActions,
  { type: "key", code: "ControlLeft", down: true }, fallbackStart)
  < findAction(fallbackActions,
    { type: "button", button: "primary", down: true }, fallbackStart));
rightButtons[0] = button();
rightButtons[2] = button();
fallbackUpdate(80);

fallbackStart = fallbackActions.length;
rightButtons[3] = button(true);
rightButtons[1] = button(true);
fallbackUpdate(90);
assert.ok(findAction(fallbackActions,
  { type: "key", code: "AltLeft", down: true }, fallbackStart)
  < findAction(fallbackActions,
    { type: "button", button: "secondary", down: true }, fallbackStart));
rightButtons[1] = button();
rightButtons[3] = button();
fallbackUpdate(100);

fallbackStart = fallbackActions.length;
rightButtons[3] = button(true);
right.gamepad.axes = [0, -0.9];
fallbackUpdate(110);
assert.notEqual(findAction(fallbackActions,
  { type: "key", code: "Digit1", down: true }, fallbackStart), -1);
assert.equal(findAction(fallbackActions,
  { type: "key", code: "AltLeft", down: true }, fallbackStart), -1,
"the one-controller group radial must not accidentally request Alt/view mode");
rightButtons[3] = button();
right.gamepad.axes = [0, 0];
fallbackUpdate(120);

fallbackStart = fallbackActions.length;
rightButtons[5] = button(true);
right.gamepad.axes = [0.8, -0.8];
fallbackUpdate(130);
assert.notEqual(findAction(fallbackActions,
  { type: "key", code: "Numpad6", down: true }, fallbackStart), -1);
assert.notEqual(findAction(fallbackActions,
  { type: "key", code: "Numpad8", down: true }, fallbackStart), -1);
rightButtons[5] = button();
right.gamepad.axes = [0, 0];
fallbackUpdate(140);
assert.equal(findAction(fallbackActions,
  { type: "key", code: "Escape", down: true }, fallbackStart), -1,
"using the one-controller camera layer must suppress its cancel tap");

const customActions = [];
const custom = createWebXrControls({
  bindings: { dominantHand: "left", buttons: { primaryAction: 2 } },
  pressThreshold: 0.7,
  releaseThreshold: 0.4,
  onAction: (action) => customActions.push(action),
});
leftButtons[2] = button(true);
left.gamepad.axes = [0.6, 0];
custom.update({ ...panel, inputSources: [right, left] });
assert.equal(custom.snapshot().dominantHand, "left");
assert.equal(findAction(customActions,
  { type: "key", code: "Numpad6", down: true }), -1,
"configured dead zones must apply to camera axes");
assert.notEqual(findAction(customActions,
  { type: "key", code: "KeyA", down: true }), -1,
"button bindings must be remappable without changing the engine bridge");

assert.throws(() => createWebXrControls({ pressThreshold: 0.3, releaseThreshold: 0.4 }),
  /release threshold/);

const anonymous = createWebXrControls();
anonymous.update({ ...panel, inputSources: [
  { handedness: "none", gamepad: { axes: [], buttons: [] } },
  { handedness: "none", gamepad: { axes: [], buttons: [] } },
] });
assert.equal(anonymous.snapshot().sourceCount, 2,
  "controllers without handedness or browser IDs must retain separate state");

const resumeActions = [];
const resumeControls = createWebXrControls({ onAction: (action) => resumeActions.push(action) });
const resumeButtons = buttons();
const resumeSource = {
  handedness: "right",
  targetRayPose: { matrix: transform({ x: 2, y: 1, z: 3 }) },
  gamepad: { axes: [0, 0], buttons: resumeButtons },
};
resumeButtons[0] = button(true);
resumeControls.update({ ...panel, inputSources: [resumeSource] });
resumeControls.suspend();
const resumeStart = resumeActions.length;
resumeControls.update({ ...panel, inputSources: [resumeSource] });
assert.equal(resumeControls.snapshot().waitingForNeutral, true);
assert.equal(findAction(resumeActions,
  { type: "button", button: "primary", down: true }, resumeStart), -1,
  "a held trigger must not click again when XR visibility resumes");
resumeButtons[0] = { pressed: false, touched: true, value: 0.45 };
resumeControls.update({ ...panel, inputSources: [resumeSource] });
assert.equal(resumeControls.snapshot().waitingForNeutral, true,
  "a partially released analog trigger must remain blocked");
resumeButtons[0] = button();
resumeControls.update({ ...panel, inputSources: [resumeSource] });
assert.equal(resumeControls.snapshot().waitingForNeutral, false);
assert.equal(resumeControls.snapshot().sourceCount, 1);

console.log("WebXR controls unit: PASS");
