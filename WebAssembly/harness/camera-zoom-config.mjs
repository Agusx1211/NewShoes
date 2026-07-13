export const CAMERA_ZOOM_SETTINGS_KEY = "cncPortCameraZoom.v1";
export const CAMERA_ZOOM_DEFAULT_HEIGHT = 310;
export const CAMERA_ZOOM_MIN_HEIGHT = 310;
export const CAMERA_ZOOM_MAX_HEIGHT = 500;
export const CAMERA_ZOOM_STEP = 10;

export function normalizeCameraZoomHeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return CAMERA_ZOOM_DEFAULT_HEIGHT;
  }
  const stepped = Math.round(numeric / CAMERA_ZOOM_STEP) * CAMERA_ZOOM_STEP;
  return Math.min(CAMERA_ZOOM_MAX_HEIGHT, Math.max(CAMERA_ZOOM_MIN_HEIGHT, stepped));
}

export function loadCameraZoomHeight(storage) {
  try {
    const stored = JSON.parse(storage?.getItem(CAMERA_ZOOM_SETTINGS_KEY) ?? "null");
    return normalizeCameraZoomHeight(stored?.maxCameraHeight);
  } catch {
    return CAMERA_ZOOM_DEFAULT_HEIGHT;
  }
}

export function saveCameraZoomHeight(storage, value) {
  const maxCameraHeight = normalizeCameraZoomHeight(value);
  try {
    storage?.setItem(CAMERA_ZOOM_SETTINGS_KEY, JSON.stringify({ maxCameraHeight }));
  } catch {
    // Persistence is optional; the normalized setting still applies this boot.
  }
  return maxCameraHeight;
}
