#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  dynamicResolutionForBox,
  isIOSLikeNavigator,
  isIPadLikeNavigator,
} from "./display-resolution.mjs";

const ipadNavigator = {
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15",
  platform: "iPad",
  maxTouchPoints: 5,
};
assert.equal(isIPadLikeNavigator(ipadNavigator), true);
assert.equal(isIOSLikeNavigator(ipadNavigator), true);

const desktopModeIPadNavigator = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
};
assert.equal(isIPadLikeNavigator(desktopModeIPadNavigator), true);
assert.equal(isIOSLikeNavigator(desktopModeIPadNavigator), true);
assert.equal(isIPadLikeNavigator({
  userAgent: desktopModeIPadNavigator.userAgent,
  platform: "MacIntel",
  maxTouchPoints: 0,
}), false);
assert.equal(isIPadLikeNavigator({
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
  platform: "iPhone",
  maxTouchPoints: 5,
}), false);

// Dynamic iPad rendering follows CSS pixels instead of multiplying the
// backing store by DPR. This keeps the formerly working 1024x768-class load.
assert.deepEqual(dynamicResolutionForBox({
  cssWidth: 1024,
  cssHeight: 768,
  devicePixelRatio: 2,
  iosLike: true,
  ipadLike: true,
}), { width: 1024, height: 768 });
assert.deepEqual(dynamicResolutionForBox({
  cssWidth: 1366,
  cssHeight: 1024,
  devicePixelRatio: 2,
  iosLike: true,
  ipadLike: true,
}), { width: 1366, height: 1024 });

// Portrait layouts are raised uniformly to the original UI's minimum width;
// the aspect ratio is retained instead of independently clamping one axis.
assert.deepEqual(dynamicResolutionForBox({
  cssWidth: 768,
  cssHeight: 1024,
  devicePixelRatio: 2,
  iosLike: true,
  ipadLike: true,
}), { width: 800, height: 1067 });

// Non-iPad behavior is intentionally unchanged.
assert.deepEqual(dynamicResolutionForBox({
  cssWidth: 1280,
  cssHeight: 800,
  devicePixelRatio: 2,
}), { width: 2560, height: 1600 });
assert.deepEqual(dynamicResolutionForBox({
  cssWidth: 430,
  cssHeight: 932,
  devicePixelRatio: 3,
  iosLike: true,
  ipadLike: false,
}), { width: 1052, height: 2281 });
assert.equal(dynamicResolutionForBox({
  cssWidth: 0,
  cssHeight: 768,
  devicePixelRatio: 2,
}), null);

console.log("display resolution unit: PASS");
