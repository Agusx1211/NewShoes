import assert from "node:assert/strict";
import { TouchGestureRecognizer } from "./touch-controls.mjs";

function pointer(pointerId, clientX, clientY, timeStamp = 0) {
  return { pointerId, clientX, clientY, timeStamp };
}

function harness() {
  const actions = [];
  const timers = new Map();
  let nextTimer = 1;
  const recognizer = new TouchGestureRecognizer({
    emit: (action) => actions.push(action),
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
  ], "a stationary one-finger gesture must become one primary click");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 20, 30, 10));
  test.recognizer.pointerMove(pointer(1, 35, 50, 20));
  test.recognizer.pointerMove(pointer(1, 45, 60, 30));
  test.recognizer.pointerUp(pointer(1, 45, 60, 40));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 0, down: true, point: { x: 20, y: 30 } },
    { button: 0, down: false, point: { x: 45, y: 60 } },
  ], "one-finger movement must hold a real primary drag from the original anchor");
  assert.equal(test.actions.some((action) => action.type === "tap"), false);
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
  assert.deepEqual(buttonActions(test.actions), [], "the first half of a two-finger gesture must not leak a click");
  test.recognizer.pointerMove(pointer(1, 100, 100, 20));
  test.recognizer.pointerMove(pointer(2, 140, 100, 21));
  test.recognizer.flushMultiGesture(22);
  test.recognizer.pointerUp(pointer(1, 100, 100, 30));
  test.recognizer.pointerUp(pointer(2, 140, 100, 31));
  assert.deepEqual(navigationActions(test.actions), [{
    type: "navigate",
    previousPoint: { x: 100, y: 80 },
    point: { x: 120, y: 100 },
    scale: 1,
    radians: 0,
    timestamp: 22,
  }], "two-finger translation must emit one direct camera transform");
  assert.deepEqual(buttonActions(test.actions), [],
    "camera navigation must not synthesize a contextual click or order");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 80, 80, 10));
  test.recognizer.pointerDown(pointer(2, 120, 80, 11));
  test.recognizer.pointerMove(pointer(1, 70, 80, 20));
  test.recognizer.pointerMove(pointer(2, 130, 80, 21));
  test.recognizer.flushMultiGesture(22);
  test.recognizer.pointerUp(pointer(1, 70, 80, 30));
  test.recognizer.pointerUp(pointer(2, 130, 80, 31));
  const [navigation] = navigationActions(test.actions);
  assert.deepEqual(navigation.previousPoint, { x: 100, y: 80 });
  assert.deepEqual(navigation.point, { x: 100, y: 80 });
  assert.equal(navigation.scale, 1.5, "pinch-out must preserve its continuous scale");
  assert.equal(navigation.radians, 0);
  assert.deepEqual(buttonActions(test.actions), [], "a pure pinch must not click or start camera pan");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 80, 100, 10));
  test.recognizer.pointerDown(pointer(2, 120, 100, 11));
  const radians = Math.PI / 12;
  const left = { x: 100 - Math.cos(radians) * 20, y: 100 - Math.sin(radians) * 20 };
  const right = { x: 100 + Math.cos(radians) * 20, y: 100 + Math.sin(radians) * 20 };
  test.recognizer.pointerMove(pointer(1, left.x, left.y, 20));
  test.recognizer.pointerMove(pointer(2, right.x, right.y, 21));
  test.recognizer.flushMultiGesture(22);
  test.recognizer.pointerUp(pointer(1, left.x, left.y, 30));
  test.recognizer.pointerUp(pointer(2, right.x, right.y, 31));
  const [navigation] = navigationActions(test.actions);
  assert.ok(Math.abs(navigation.scale - 1) < 1e-12,
    "a constant-radius twist must not change scale");
  assert.ok(Math.abs(navigation.radians - radians) < 1e-12,
    "two-finger twist must preserve its continuous angle");
  assert.deepEqual(buttonActions(test.actions), [],
    "a pure twist must not emit primary/context buttons");
}

{
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 100, 200, 10));
  test.recognizer.pointerDown(pointer(2, 200, 200, 11));
  test.recognizer.pointerMove(pointer(1, 130, 190, 20));
  test.recognizer.pointerMove(pointer(2, 250, 250, 21));
  test.recognizer.flushMultiGesture(22);
  const [navigation] = navigationActions(test.actions);
  assert.deepEqual(navigation.previousPoint, { x: 150, y: 200 });
  assert.deepEqual(navigation.point, { x: 190, y: 220 });
  assert.ok(navigation.scale > 1.3 && navigation.scale < 1.4);
  assert.ok(navigation.radians > 0.4 && navigation.radians < 0.5);
  assert.equal(test.recognizer.snapshot().navigationActive, true,
    "translation, pinch, and twist must remain one active navigation gesture");
  test.recognizer.flushMultiGesture(23);
  assert.equal(navigationActions(test.actions).length, 1,
    "stationary fingers must not create camera velocity");
  test.recognizer.pointerUp(pointer(1, 130, 190, 30));
  test.recognizer.pointerUp(pointer(2, 250, 250, 31));
  assert.deepEqual(buttonActions(test.actions), [],
    "combined navigation must not leak an order on release");
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
  ], "two-finger tap must provide a fast context-click alternative");
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
  const test = harness();
  test.recognizer.pointerDown(pointer(1, 10, 10, 10));
  test.recognizer.pointerMove(pointer(1, 40, 40, 20));
  test.recognizer.pointerCancel(pointer(1, 42, 42, 30));
  assert.deepEqual(buttonActions(test.actions), [
    { button: 0, down: true, point: { x: 10, y: 10 } },
    { button: 0, down: false, point: { x: 42, y: 42 } },
  ], "pointer cancellation must release a committed engine button without a ghost click");
  assert.equal(test.recognizer.snapshot().phase, "idle");
}

console.log("touch controls unit: ok");
