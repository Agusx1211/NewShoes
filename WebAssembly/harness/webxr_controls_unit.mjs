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

const actions = [];
const controls = createWebXrControls({ onAction: (action) => actions.push(action) });
const buttons = Array.from({ length: 6 }, () => ({ pressed: false, value: 0 }));
const right = {
  handedness: "right",
  profiles: ["generic-trigger-squeeze-thumbstick"],
  targetRayPose: { matrix: transform({ x: 2, y: 1, z: 3 }) },
  gamepad: { axes: [0, 0], buttons },
};
controls.update({ ...panel, time: 0, inputSources: [right] });
assert.deepEqual(actions.at(-1), {
  type: "pointer",
  target: "ui",
  point: { x: 800, y: 450 },
  ray: worldRay,
  handedness: "right",
});

buttons[0] = { pressed: true, value: 1 };
controls.update({ ...panel, time: 10, inputSources: [right] });
assert.ok(actions.some((action) => action.type === "button"
  && action.button === "primary" && action.down === true));
buttons[1] = { pressed: true, value: 1 };
buttons[4] = { pressed: true, value: 1 };
buttons[5] = { pressed: true, value: 1 };
right.gamepad.axes = [0, -0.8];
controls.update({ ...panel, time: 20, inputSources: [right] });
assert.ok(actions.some((action) => action.type === "button"
  && action.button === "secondary" && action.down === true));
assert.ok(actions.some((action) => action.type === "wheel" && action.steps === 1));
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "Escape" && action.down === true));
assert.ok(actions.some((action) => action.type === "recenter"));

const leftButtons = Array.from({ length: 6 }, () => ({ pressed: false, value: 0 }));
const left = {
  handedness: "left",
  profiles: ["generic-trigger-squeeze-thumbstick"],
  targetRayPose: { matrix: transform({ x: 2, y: 1, z: 3 }) },
  gamepad: { axes: [-0.8, 0.8], buttons: leftButtons },
};
controls.update({ ...panel, time: 30, inputSources: [right, left] });
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "ArrowLeft" && action.down === true));
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "ArrowDown" && action.down === true));
left.gamepad.axes = [0, 0];
controls.update({ ...panel, time: 40, inputSources: [right, left] });
assert.ok(actions.some((action) => action.type === "key"
  && action.code === "ArrowLeft" && action.down === false));

controls.update({ ...panel, time: 50, inputSources: [] });
assert.ok(actions.some((action) => action.type === "button"
  && action.button === "primary" && action.down === false),
"disconnecting a controller must release held engine buttons");
assert.ok(actions.some((action) => action.type === "pickRay" && action.ray === null),
  "losing all tracked targets must clear the native engine-world ray");
assert.equal(controls.snapshot().sourceCount, 0);

buttons[0] = { pressed: false, value: 0 };
buttons[1] = { pressed: false, value: 0 };
buttons[4] = { pressed: false, value: 0 };
buttons[5] = { pressed: false, value: 0 };
right.gamepad.axes = [0, 0];
right.targetRayPose.matrix = transform({ x: 2.81, y: 1, z: 3 });
controls.update({ ...panel, time: 60, inputSources: [right] });
assert.deepEqual(actions.at(-1), {
  type: "pointer",
  target: "world",
  point: { x: 800, y: 450 },
  ray: worldRay,
  handedness: "right",
}, "a ray outside the UI panel must retain an engine-world target");

console.log("WebXR controls unit: PASS");
