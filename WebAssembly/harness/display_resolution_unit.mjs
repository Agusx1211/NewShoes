#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  dynamicResolutionForBox,
  fitResolutionToLimits,
  isIOSLikeNavigator,
  isIPadLikeNavigator,
} from "./display-resolution.mjs";

function assertAspectMatches(actual, width, height, message) {
  const expectedRatio = width / height;
  const actualRatio = actual.width / actual.height;
  const roundingTolerance = 1 / Math.min(actual.width, actual.height);
  assert.ok(Math.abs(actualRatio - expectedRatio) <= roundingTolerance,
    `${message}: expected ${expectedRatio}, got ${actualRatio} (${actual.width}x${actual.height})`);
}

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

for (const profile of [
  { cssWidth: 390, cssHeight: 844, devicePixelRatio: 3, iosLike: true },
  { cssWidth: 844, cssHeight: 390, devicePixelRatio: 3, iosLike: true },
  { cssWidth: 768, cssHeight: 1024, devicePixelRatio: 2, iosLike: true, ipadLike: true },
  { cssWidth: 1366, cssHeight: 1024, devicePixelRatio: 2, iosLike: true, ipadLike: true },
  { cssWidth: 3440, cssHeight: 1440, devicePixelRatio: 2 },
]) {
  const result = dynamicResolutionForBox(profile);
  assertAspectMatches(result, profile.cssWidth, profile.cssHeight,
    `dynamic resolution must preserve the ${profile.cssWidth}x${profile.cssHeight} device box`);
}

const pixelLimitedPhone = dynamicResolutionForBox({
  cssWidth: 430,
  cssHeight: 932,
  devicePixelRatio: 3,
  iosLike: true,
});
assert.ok(pixelLimitedPhone.width * pixelLimitedPhone.height <= 2_400_000 + 4096,
  "the iOS pixel budget must lower both dimensions instead of changing aspect");

const extremeWide = fitResolutionToLimits(10_000, 1_000, 8_500_000);
assert.deepEqual(extremeWide, { width: 7680, height: 768 });
assertAspectMatches(extremeWide, 10_000, 1_000,
  "the engine width cap must scale height uniformly");

const extremePortrait = fitResolutionToLimits(100, 1_000, 8_500_000);
assert.deepEqual(extremePortrait, { width: 432, height: 4320 });
assertAspectMatches(extremePortrait, 100, 1_000,
  "incompatible authored minima must not distort an extreme device aspect");
assert.equal(dynamicResolutionForBox({
  cssWidth: 0,
  cssHeight: 768,
  devicePixelRatio: 2,
}), null);

console.log("display resolution unit: PASS");
