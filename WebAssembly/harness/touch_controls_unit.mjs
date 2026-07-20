import assert from "node:assert/strict";
import { TouchGestureRecognizer } from "./touch-controls.mjs";

function pointer(pointerId, clientX, clientY, timeStamp = 0) {
  return { pointerId, clientX, clientY, timeStamp };
}

function harness({ oneFingerDragModeAtPoint } = {}) {
  const actions = [];
  const timers = new Map();
  let nextTimer = 1;
  const recognizer = new TouchGestureRecognizer({
    emit: (action) => actions.push(action),
    oneFingerDragModeAtPoint,
    setTimer(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
  });
  return {
    actions,
    recognizer,
    fireTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

function buttonActions(actions) {
  return actions.filter((action) => action.type === "button")
    .map(({ button, down, point }) => ({ button, down, point }));
}

function navigationActions(actions) {
  return actions.filter((action) => action.type === "navigate");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 50, 70, 10));
  assert.deepEqual(buttonActions(test.actions), [], "touch-down must not commit an engine button");
  test.recognizer.pointerUp(pointer(1, 50, 70, 20));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 0, down: true, point: { x: 50, y: 70 } },
    { button: 0, down: false, point: { x: 50, y: 70 } },
  ], "a stationary one-finger gesture must remain one primary click");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 20, 30, 10));
  test.recognizer.pointerMove(pointer(1, 35, 50, 20));
  test.recognizer.flushGesture(21);
  test.recognizer.pointerMove(pointer(1, 45, 60, 30));
  test.recognizer.flushGesture(31);
  test.recognizer.flushGesture(32);
  test.recognizer.pointerUp(pointer(1, 45, 60, 40));
  assert.deepEqual(navigationActions(test.actions).map((action) => ({
    gesture: action.gesture,
    previousPoint: action.previousPoint,
    point: action.point,
    scale: action.scale,
    radians: action.radians,
  })), [
    { gesture: "pan", previousPoint: { x: 20, y: 30 }, point: { x: 35, y: 50 }, scale: 1, radians: 0 },
    { gesture: "pan", previousPoint: { x: 35, y: 50 }, point: { x: 45, y: 60 }, scale: 1, radians: 0 },
  ], "one finger must pan the map directly from its original contact point");
  assert.deepEqual(buttonActions(test.actions), [], "map panning must not leak a click or selection drag");
  assert.equal(test.recognizer.snapshot().phase, "idle");
}

{
  const test = harness({ oneFingerDragModeAtPoint: () => "drag" });
  test.recognizer.pointerDown(pointer(1, 20, 30, 10));
  test.recognizer.pointerMove(pointer(1, 35, 50, 20));
  test.recognizer.pointerMove(pointer(1, 45, 60, 30));
  test.recognizer.pointerUp(pointer(1, 45, 60, 40));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 0, down: true, point: { x: 20, y: 30 } },
    { button: 0, down: false, point: { x: 45, y: 60 } },
  ], "an engine UI surface must retain its real primary drag");
  assert.deepEqual(navigationActions(test.actions), []);
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 100, 120, 10));
  test.fireTimers();
  test.recognizer.pointerUp(pointer(1, 100, 120, 700));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 2, down: true, point: { x: 100, y: 120 } },
    { button: 2, down: false, point: { x: 100, y: 120 } },
  ], "long-press must produce one context click and swallow lift");
  assert.equal(test.actions.filter((action) => action.type === "haptic").length, 1);
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 80, 80, 10));
  test.recognizer.pointerDown(pointer(2, 120, 80, 11));
  test.recognizer.pointerMove(pointer(1, 100, 100, 20));
  test.recognizer.flushGesture(20);
  assert.deepEqual(buttonActions(test.actions), [],
    "one sequential pointer sample must not misclassify a parallel two-finger drag");
  assert.deepEqual(navigationActions(test.actions), []);
  test.recognizer.pointerMove(pointer(2, 140, 100, 21));
  test.recognizer.flushGesture(22);
  test.recognizer.pointerUp(pointer(1, 100, 100, 30));
  test.recognizer.pointerUp(pointer(2, 140, 100, 31));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 0, down: true, point: { x: 100, y: 80 } },
    { button: 0, down: false, point: { x: 120, y: 100 } },
  ], "parallel two-finger movement must provide a real marquee-selection drag");
  assert.deepEqual(navigationActions(test.actions), [],
    "marquee selection must not move the camera");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 80, 80, 10));
  test.recognizer.pointerDown(pointer(2, 120, 80, 11));
  test.recognizer.pointerMove(pointer(1, 70, 80, 20));
  test.recognizer.pointerMove(pointer(2, 130, 80, 21));
  test.recognizer.flushGesture(22);
  test.recognizer.pointerUp(pointer(1, 70, 80, 30));
  test.recognizer.pointerUp(pointer(2, 130, 80, 31));
  const [navigation] = navigationActions(test.actions);
  assert.equal(navigation.gesture, "pinch");
  assert.deepEqual(navigation.previousPoint, { x: 100, y: 80 });
  assert.deepEqual(navigation.point, { x: 100, y: 80 });
  assert.equal(navigation.scale, 1.5, "pinch-out must preserve its continuous scale");
  assert.equal(navigation.radians, 0, "two fingers must not rotate the camera");
  assert.deepEqual(buttonActions(test.actions), [], "a pinch must not click or marquee-select");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 80, 100, 10));
  test.recognizer.pointerDown(pointer(2, 120, 100, 11));
  const radians = Math.PI / 8;
  const left = { x: 100 - Math.cos(radians) * 20, y: 100 - Math.sin(radians) * 20 };
  const right = { x: 100 + Math.cos(radians) * 20, y: 100 + Math.sin(radians) * 20 };
  test.recognizer.pointerMove(pointer(1, left.x, left.y, 20));
  test.recognizer.pointerMove(pointer(2, right.x, right.y, 21));
  test.recognizer.flushGesture(22);
  test.recognizer.pointerUp(pointer(1, left.x, left.y, 30));
  test.recognizer.pointerUp(pointer(2, right.x, right.y, 31));
  assert.deepEqual(navigationActions(test.actions), [],
    "a two-finger twist must not rotate after rotation moves to three fingers");
  assert.deepEqual(buttonActions(test.actions), [],
    "an unrecognized two-finger twist must be swallowed instead of becoming a context tap");
}

{
  const test = harness();
  const center = { x: 100, y: 340 / 3 };
  const start = [{ x: 80, y: 100 }, { x: 120, y: 100 }, { x: 100, y: 140 }];
  const radians = Math.PI / 9;
  const rotated = start.map((point) => ({
    x: center.x + (point.x - center.x) * Math.cos(radians)
      - (point.y - center.y) * Math.sin(radians),
    y: center.y + (point.x - center.x) * Math.sin(radians)
      + (point.y - center.y) * Math.cos(radians),
  }));
  start.forEach((point, index) => test.recognizer.pointerDown(
    pointer(index + 1, point.x, point.y, 10 + index)));
  rotated.forEach((point, index) => test.recognizer.pointerMove(
    pointer(index + 1, point.x, point.y, 20 + index)));
  test.recognizer.flushGesture(24);
  rotated.forEach((point, index) => test.recognizer.pointerUp(
    pointer(index + 1, point.x, point.y, 30 + index)));
  const [navigation] = navigationActions(test.actions);
  assert.equal(navigation.gesture, "rotate");
  assert.equal(navigation.scale, 1);
  assert.deepEqual(navigation.previousPoint, navigation.point,
    "three-finger rotation must not translate the camera");
  assert.ok(Math.abs(navigation.radians - radians) < 1e-12,
    "three-finger rotation must preserve the fitted touch angle");
  assert.deepEqual(buttonActions(test.actions), [],
    "three-finger rotation must not click or select");
}

{
  const test = harness();
  const start = [{ x: 80, y: 100 }, { x: 120, y: 100 }, { x: 100, y: 140 }];
  start.forEach((point, index) => test.recognizer.pointerDown(
    pointer(index + 1, point.x, point.y, 10 + index)));
  const moved = start.map((point) => ({ x: point.x + 40, y: point.y + 25 }));
  moved.forEach((point, index) => test.recognizer.pointerMove(
    pointer(index + 1, point.x, point.y, 20 + index)));
  test.recognizer.flushGesture(24);
  moved.forEach((point, index) => test.recognizer.pointerUp(
    pointer(index + 1, point.x, point.y, 30 + index)));
  assert.deepEqual(navigationActions(test.actions), [],
    "parallel three-finger movement must not pan or rotate");
  assert.deepEqual(buttonActions(test.actions), [],
    "parallel three-finger movement must not select or click");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 30, 30, 10));
  test.recognizer.pointerDown(pointer(2, 70, 30, 11));
  test.recognizer.pointerUp(pointer(1, 30, 30, 20));
  test.recognizer.pointerUp(pointer(2, 70, 30, 21));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 2, down: true, point: { x: 50, y: 30 } },
    { button: 2, down: false, point: { x: 50, y: 30 } },
  ], "a stationary two-finger tap must remain a fast context-click alternative");
}

{
  const test = harness();
  test.recognizer.armSecondary(true);
  test.recognizer.pointerDown(pointer(1, 60, 90, 10));
  test.recognizer.pointerUp(pointer(1, 60, 90, 20));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 2, down: true, point: { x: 60, y: 90 } },
    { button: 2, down: false, point: { x: 60, y: 90 } },
  ]);
  assert.equal(test.recognizer.snapshot().secondaryArmed, false,
    "explicit Order mode must consume itself after the next tap");
}

{
  const test = harness({ oneFingerDragModeAtPoint: () => "drag" });
  test.recognizer.pointerDown(pointer(1, 10, 10, 10));
  test.recognizer.pointerMove(pointer(1, 40, 40, 20));
  test.recognizer.pointerCancel(pointer(1, 42, 42, 30));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 0, down: true, point: { x: 10, y: 10 } },
    { button: 0, down: false, point: { x: 42, y: 42 } },
  ], "pointer cancellation must release a committed engine UI drag without a ghost click");
  assert.equal(test.recognizer.snapshot().phase, "idle");
}

console.log("touch controls unit: ok");
