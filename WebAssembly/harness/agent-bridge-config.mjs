export const AGENT_BRIDGE_SETTINGS_KEY = "cncPortAgentBridgeSettings.v1";

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  url: "webrtc://relay.newshoes.gg/agent",
  token: "",
  sessionId: "game-1",
  playMode: "global",
  rememberToken: false,
});

function validStoredURL(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) return null;
  try {
    const url = new URL(value);
    return ["ws:", "wss:", "webrtc:", "webrtc+insecure:"].includes(url.protocol)
      ? url.href : null;
  } catch {
    return null;
  }
}

function validSessionID(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 128
    && /^[A-Za-z0-9._-]+$/.test(value);
}

function availableStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function normalizeAgentBridgeConfiguration(config, cryptoImpl = globalThis.crypto) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("agent bridge configuration must be an object");
  }
  const rawUrl = String(config.url ?? "");
  if (rawUrl.length === 0 || rawUrl.length > 4096) {
    throw new TypeError("agent bridge URL must be a non-empty string of at most 4096 characters");
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError("agent bridge URL is invalid");
  }
  if (!["ws:", "wss:", "webrtc:", "webrtc+insecure:"].includes(url.protocol)) {
    throw new TypeError("agent bridge URL must use webrtc:, ws:, or wss:");
  }
  const token = String(config.token ?? "");
  if (token.length === 0 || token.length > 4096) {
    throw new TypeError("agent bridge token must be a non-empty string of at most 4096 characters");
  }
  const rawSessionId = String(config.sessionId ?? "");
  if (rawSessionId === "" && (!cryptoImpl || typeof cryptoImpl.randomUUID !== "function")) {
    throw new TypeError("crypto.randomUUID is unavailable");
  }
  const sessionId = rawSessionId || cryptoImpl.randomUUID();
  if (!validSessionID(sessionId)) {
    throw new TypeError("agent bridge session ID may contain only letters, numbers, dot, underscore, and hyphen (128 characters maximum)");
  }
  const playMode = String(config.playMode ?? "global");
  if (playMode !== "global" && playMode !== "camera") {
    throw new TypeError("agent bridge play mode must be global or camera");
  }
  return Object.freeze({ url: url.href, token, sessionId, playMode });
}

export function loadAgentBridgeSettings(storage) {
  try {
    const stored = JSON.parse(
      availableStorage(storage)?.getItem(AGENT_BRIDGE_SETTINGS_KEY) ?? "null",
    );
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return { ...DEFAULT_SETTINGS };
    }
    const rememberToken = stored.rememberToken === true
      && typeof stored.token === "string"
      && stored.token.length > 0
      && stored.token.length <= 4096;
    return {
      enabled: stored.enabled === true,
      url: validStoredURL(stored.url) ?? DEFAULT_SETTINGS.url,
      token: rememberToken ? stored.token : "",
      sessionId: validSessionID(stored.sessionId)
        ? stored.sessionId : DEFAULT_SETTINGS.sessionId,
      playMode: stored.playMode === "camera" ? "camera" : "global",
      rememberToken,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAgentBridgeSettings(storage, settings) {
  const normalized = {
    enabled: settings?.enabled === true,
    url: validStoredURL(settings?.url) ?? DEFAULT_SETTINGS.url,
    sessionId: validSessionID(settings?.sessionId)
      ? settings.sessionId : DEFAULT_SETTINGS.sessionId,
    playMode: settings?.playMode === "camera" ? "camera" : "global",
    rememberToken: settings?.rememberToken === true,
  };
  const token = String(settings?.token ?? "");
  if (normalized.rememberToken && token.length > 0 && token.length <= 4096) {
    normalized.token = token;
  } else {
    normalized.rememberToken = false;
  }
  try {
    availableStorage(storage)?.setItem(AGENT_BRIDGE_SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    // Persistence is optional; the in-memory launch configuration still applies.
  }
  return {
    ...normalized,
    token: normalized.rememberToken ? normalized.token : "",
  };
}

export function forgetAgentBridgeToken(storage) {
  const settings = loadAgentBridgeSettings(storage);
  return saveAgentBridgeSettings(storage, {
    ...settings,
    token: "",
    rememberToken: false,
  });
}
