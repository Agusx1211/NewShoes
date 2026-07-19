export const WEBXR_SETTINGS_KEY = "cncPortWebXrSettings.v1";

export const DEFAULT_WEBXR_SETTINGS = Object.freeze({
  dominantHand: "right",
  stickDeadzone: 0.55,
  worldScale: 1,
  panelWidthMeters: 1.6,
  panelDistanceMeters: 1.5,
  heightOffsetMeters: 0,
});

function boundedNumber(value, fallback, minimum, maximum, step) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.max(minimum, Math.min(maximum, number));
  const decimals = String(step).split(".")[1]?.length ?? 0;
  return Number((Math.round(clamped / step) * step).toFixed(decimals));
}

export function normalizeWebXrSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    dominantHand: source.dominantHand === "left" ? "left" : "right",
    stickDeadzone: boundedNumber(source.stickDeadzone,
      DEFAULT_WEBXR_SETTINGS.stickDeadzone, 0.35, 0.8, 0.05),
    worldScale: boundedNumber(source.worldScale,
      DEFAULT_WEBXR_SETTINGS.worldScale, 0.75, 1.5, 0.05),
    panelWidthMeters: boundedNumber(source.panelWidthMeters,
      DEFAULT_WEBXR_SETTINGS.panelWidthMeters, 1.2, 2.2, 0.1),
    panelDistanceMeters: boundedNumber(source.panelDistanceMeters,
      DEFAULT_WEBXR_SETTINGS.panelDistanceMeters, 1, 2.5, 0.1),
    heightOffsetMeters: boundedNumber(source.heightOffsetMeters,
      DEFAULT_WEBXR_SETTINGS.heightOffsetMeters, -0.75, 0.75, 0.05),
  };
}

export function loadWebXrSettings(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    return normalizeWebXrSettings(JSON.parse(target?.getItem(WEBXR_SETTINGS_KEY) ?? "null"));
  } catch {
    return normalizeWebXrSettings();
  }
}

export function saveWebXrSettings(storage, value) {
  const settings = normalizeWebXrSettings(value);
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    target?.setItem(WEBXR_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage is optional; the normalized settings remain active in memory.
  }
  return settings;
}

export function webXrRendererOptions(value) {
  const settings = normalizeWebXrSettings(value);
  return {
    worldScale: settings.worldScale,
    panelWidthMeters: settings.panelWidthMeters,
    panelDistanceMeters: settings.panelDistanceMeters,
    heightOffsetMeters: settings.heightOffsetMeters,
    controlOptions: {
      bindings: { dominantHand: settings.dominantHand },
      pressThreshold: settings.stickDeadzone,
      releaseThreshold: Number(Math.max(0.15, settings.stickDeadzone - 0.2).toFixed(2)),
    },
  };
}
