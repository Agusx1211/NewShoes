import assert from "node:assert/strict";
import {
  CAMERA_ZOOM_DEFAULT_HEIGHT,
  CAMERA_ZOOM_MAX_HEIGHT,
  CAMERA_ZOOM_MIN_HEIGHT,
  CAMERA_ZOOM_SETTINGS_KEY,
  loadCameraZoomHeight,
  normalizeCameraZoomHeight,
  saveCameraZoomHeight,
} from "./camera-zoom-config.mjs";

assert.equal(normalizeCameraZoomHeight(undefined), CAMERA_ZOOM_DEFAULT_HEIGHT);
assert.equal(normalizeCameraZoomHeight("not-a-number"), CAMERA_ZOOM_DEFAULT_HEIGHT);
assert.equal(normalizeCameraZoomHeight(309), CAMERA_ZOOM_MIN_HEIGHT);
assert.equal(normalizeCameraZoomHeight(506), CAMERA_ZOOM_MAX_HEIGHT);
assert.equal(normalizeCameraZoomHeight(454), 450);
assert.equal(normalizeCameraZoomHeight(456), 460);

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
};
assert.equal(loadCameraZoomHeight(storage), CAMERA_ZOOM_DEFAULT_HEIGHT);
assert.equal(saveCameraZoomHeight(storage, 497), 500);
assert.deepEqual(JSON.parse(values.get(CAMERA_ZOOM_SETTINGS_KEY)), { maxCameraHeight: 500 });
assert.equal(loadCameraZoomHeight(storage), 500);
values.set(CAMERA_ZOOM_SETTINGS_KEY, "corrupt");
assert.equal(loadCameraZoomHeight(storage), CAMERA_ZOOM_DEFAULT_HEIGHT);

process.stdout.write("camera zoom config unit: OK\n");
