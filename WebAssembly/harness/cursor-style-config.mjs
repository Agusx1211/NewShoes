export const CURSOR_STYLE_SETTINGS_KEY = "cncPortCursorStyle.v1";

export function normalizeCursorStyle(value) {
  return value === "system" ? "system" : "game";
}

export function loadCursorStyle(storage = globalThis.localStorage) {
  try {
    return normalizeCursorStyle(storage?.getItem(CURSOR_STYLE_SETTINGS_KEY));
  } catch {
    return "game";
  }
}

export function saveCursorStyle(storage = globalThis.localStorage, value) {
  const style = normalizeCursorStyle(value);
  try {
    storage?.setItem(CURSOR_STYLE_SETTINGS_KEY, style);
  } catch {
    // Persistence is optional; callers still apply the normalized value now.
  }
  return style;
}
