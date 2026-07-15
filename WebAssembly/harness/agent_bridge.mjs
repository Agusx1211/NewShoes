export const AGENT_PROTOCOL = "cnc-agent/1";
export const AGENT_SUBPROTOCOL = "cnc-agent.v1";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_LENGTH = 16 * 1024;
const CAPABILITIES = Object.freeze([
  "protocol.describe",
  "input.pointerMove",
  "camera.lookAt",
  "camera.setView",
  "game.select",
  "game.order",
  "game.context",
  "game.command",
  "game.playerCommand",
  "game.production",
  "game.container",
  "game.beacon",
  "world.snapshot",
  "terrain.query",
  "minimap.snapshot",
  "hud.snapshot",
  "chat.send",
  "ui.snapshot",
  "ui.activate",
  "ui.setText",
  "ui.submit",
  "ui.selectIndex",
  "ui.setValue",
  "ui.selectTab",
  "ui.listItems",
]);
const ORDER_ACTIONS = new Set([
  "move", "attackMove", "forceMove", "attack", "forceAttackGround", "forceAttackObject",
  "waypoint", "guardPosition", "guardObject", "stop", "scatter", "formation",
]);
const POSITION_ORDER_ACTIONS = new Set([
  "move", "attackMove", "forceMove", "forceAttackGround", "waypoint", "guardPosition",
]);
const TARGET_ORDER_ACTIONS = new Set(["attack", "forceAttackObject", "guardObject"]);
const GUARD_MODES = new Map([["normal", 0], ["withoutPursuit", 1], ["flyingOnly", 2]]);

class ProtocolFault extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ProtocolFault";
    this.code = code;
    this.details = details;
  }
}

function boundedString(value, field, maxLength = 256, { optional = false } = {}) {
  if (optional && (value === undefined || value === "")) return "";
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new ProtocolFault("invalid_arguments", `${field} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value;
}

function windowReference(args) {
  const windowId = Number(args?.windowId);
  if (!Number.isInteger(windowId) || windowId < -0x80000000 || windowId > 0x7fffffff) {
    throw new ProtocolFault("invalid_arguments", "windowId must be a signed 32-bit integer");
  }
  const name = args?.name === undefined
    ? ""
    : boundedString(args.name, "name", 256, { optional: true });
  return { windowId, name };
}

function pointerPosition(args) {
  const x = Number(args?.x);
  const y = Number(args?.y);
  if (!Number.isInteger(x) || x < 0 || x > 0x7fff
      || !Number.isInteger(y) || y < 0 || y > 0x7fff) {
    throw new ProtocolFault(
      "invalid_arguments",
      "x and y must be integers from 0 through 32767",
    );
  }
  return { x, y };
}

function observationMode(playMode) {
  return playMode === "camera" ? "camera" : "unrestricted";
}

function worldObservation(args, playMode) {
  const mode = observationMode(playMode);
  const detail = args?.detail ?? "full";
  if (detail !== "full" && detail !== "tactical") {
    throw new ProtocolFault("invalid_arguments", "detail must be full or tactical");
  }
  const includeCapabilities = args?.includeCapabilities ?? false;
  if (typeof includeCapabilities !== "boolean") {
    throw new ProtocolFault("invalid_arguments", "includeCapabilities must be true or false");
  }
  return { mode, detail, includeCapabilities };
}

function terrainQuery(args, playMode) {
  const mode = observationMode(playMode);
  const minX = Number(args?.minX);
  const minY = Number(args?.minY);
  const maxX = Number(args?.maxX);
  const maxY = Number(args?.maxY);
  if (![minX, minY, maxX, maxY].every(Number.isFinite)
      || minX >= maxX || minY >= maxY) {
    throw new ProtocolFault(
      "invalid_arguments",
      "minX, minY, maxX, and maxY must be finite ordered bounds",
    );
  }
  const columns = Number(args?.columns ?? 32);
  const rows = Number(args?.rows ?? 32);
  if (!Number.isInteger(columns) || columns < 1 || columns > 128
      || !Number.isInteger(rows) || rows < 1 || rows > 128
      || columns * rows > 16384) {
    throw new ProtocolFault(
      "invalid_arguments",
      "rows and columns must be integers from 1 through 128 with at most 16384 samples",
    );
  }
  return { mode, minX, minY, maxX, maxY, columns, rows };
}

function minimapQuery(args) {
  const columns = Number(args?.columns ?? 32);
  const rows = Number(args?.rows ?? 32);
  if (!Number.isInteger(columns) || columns < 1 || columns > 128
      || !Number.isInteger(rows) || rows < 1 || rows > 128
      || columns * rows > 16384) {
    throw new ProtocolFault(
      "invalid_arguments",
      "rows and columns must be integers from 1 through 128 with at most 16384 cells",
    );
  }
  return { columns, rows };
}

function objectId(value, field, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === 0)) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 0x7fffffff) {
    throw new ProtocolFault("invalid_arguments", `${field} must be a positive 32-bit integer`);
  }
  return parsed;
}

function objectIdList(args) {
  if (!Array.isArray(args?.objectIds) || args.objectIds.length < 1 || args.objectIds.length > 128) {
    throw new ProtocolFault("invalid_arguments", "objectIds must contain 1 through 128 object IDs");
  }
  const values = args.objectIds.map((value, index) => objectId(value, `objectIds[${index}]`));
  if (new Set(values).size !== values.length) {
    throw new ProtocolFault("invalid_arguments", "objectIds must not contain duplicates");
  }
  return values.join(",");
}

function worldPosition(value, field = "position") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProtocolFault("invalid_arguments", `${field} must contain finite x and y coordinates`);
  }
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new ProtocolFault("invalid_arguments", `${field}.x and ${field}.y must be finite numbers`);
  }
  return { x, y };
}

function gameOrder(args) {
  const action = boundedString(args?.action, "action", 64);
  if (!ORDER_ACTIONS.has(action)) {
    throw new ProtocolFault("invalid_arguments", "unsupported tactical action");
  }
  const objectIds = objectIdList(args);
  const needsPosition = POSITION_ORDER_ACTIONS.has(action);
  const needsTarget = TARGET_ORDER_ACTIONS.has(action);
  const position = needsPosition ? worldPosition(args?.position) : { x: 0, y: 0 };
  const targetId = needsTarget ? objectId(args?.targetId, "targetId") : 0;
  const isGuard = action === "guardPosition" || action === "guardObject";
  const guardModeName = args?.guardMode ?? "normal";
  if (!isGuard && args?.guardMode !== undefined) {
    throw new ProtocolFault("invalid_arguments", "guardMode is only used by guard orders");
  }
  if (!GUARD_MODES.has(guardModeName)) {
    throw new ProtocolFault(
      "invalid_arguments", "guardMode must be normal, withoutPursuit, or flyingOnly",
    );
  }
  return { action, objectIds, targetId, ...position, guardMode: GUARD_MODES.get(guardModeName) };
}

function gameCommand(args) {
  const sourceId = objectId(args?.sourceId, "sourceId");
  const command = boundedString(args?.command, "command", 256);
  const targetId = objectId(args?.targetId, "targetId", { optional: true });
  const hasPosition = args?.position !== undefined && args.position !== null;
  const position = hasPosition ? worldPosition(args.position) : { x: 0, y: 0 };
  const angle = args?.angle === undefined ? 0 : Number(args.angle);
  if (!Number.isFinite(angle)) {
    throw new ProtocolFault("invalid_arguments", "angle must be a finite number");
  }
  return { sourceId, command, targetId, ...position, angle, hasPosition };
}

function gamePlayerCommand(args) {
  const commandSet = boundedString(args?.commandSet, "commandSet", 256);
  const command = boundedString(args?.command, "command", 256);
  const targetId = objectId(args?.targetId, "targetId", { optional: true });
  const hasPosition = args?.position !== undefined && args.position !== null;
  const position = hasPosition ? worldPosition(args.position) : { x: 0, y: 0 };
  const angle = args?.angle === undefined ? 0 : Number(args.angle);
  if (!Number.isFinite(angle)) {
    throw new ProtocolFault("invalid_arguments", "angle must be a finite number");
  }
  return { commandSet, command, targetId, ...position, angle, hasPosition };
}

function gameProduction(args) {
  const sourceId = objectId(args?.sourceId, "sourceId");
  const action = boundedString(args?.action, "action", 32);
  if (action !== "cancel") {
    throw new ProtocolFault("invalid_arguments", "production action must be cancel");
  }
  const productionId = args?.productionId === undefined || args.productionId === null
    ? 0 : Number(args.productionId);
  const upgrade = args?.upgrade === undefined
    ? "" : boundedString(args.upgrade, "upgrade", 256);
  if ((!Number.isInteger(productionId) || productionId < 0 || productionId > 0x7fffffff)
      || ((productionId > 0) === (upgrade.length > 0))) {
    throw new ProtocolFault(
      "invalid_arguments", "provide exactly one positive productionId or upgrade name",
    );
  }
  return { sourceId, action, productionId, upgrade };
}

function gameContainer(args) {
  const containerId = objectId(args?.containerId, "containerId");
  const action = boundedString(args?.action, "action", 32);
  if (action !== "exit") {
    throw new ProtocolFault("invalid_arguments", "container action must be exit");
  }
  return { containerId, action, passengerId: objectId(args?.passengerId, "passengerId") };
}

function gameBeacon(args) {
  const action = boundedString(args?.action, "action", 32);
  if (action !== "place" && action !== "remove" && action !== "setText") {
    throw new ProtocolFault("invalid_arguments", "beacon action must be place, remove, or setText");
  }
  const position = action === "place" ? worldPosition(args?.position) : { x: 0, y: 0 };
  const beaconId = action === "place" ? 0 : objectId(args?.beaconId, "beaconId");
  const text = action === "setText" ? (args?.text ?? "") : "";
  if (typeof text !== "string" || text.length > 255) {
    throw new ProtocolFault("invalid_arguments", "beacon text must be at most 255 UTF-16 code units");
  }
  return { action, beaconId, ...position, text };
}

function gameContext(args) {
  const objectIds = objectIdList(args);
  const hasTarget = args?.targetId !== undefined && args.targetId !== null && args.targetId !== 0;
  const hasPosition = args?.position !== undefined && args.position !== null;
  if (hasTarget === hasPosition) {
    throw new ProtocolFault("invalid_arguments", "provide exactly one targetId or position");
  }
  const targetId = hasTarget ? objectId(args.targetId, "targetId") : 0;
  const position = hasPosition ? worldPosition(args.position) : { x: 0, y: 0 };
  return { objectIds, targetId, ...position, hasPosition };
}

function cameraView(args) {
  const result = {};
  for (const field of ["angle", "pitch", "zoom"]) {
    if (args?.[field] === undefined || args[field] === null) continue;
    const value = Number(args[field]);
    if (!Number.isFinite(value)) {
      throw new ProtocolFault("invalid_arguments", `${field} must be a finite number`);
    }
    result[field] = value;
  }
  if (Object.keys(result).length === 0) {
    throw new ProtocolFault("invalid_arguments", "provide at least one angle, pitch, or zoom");
  }
  return result;
}

function normalizeConfig(config, cryptoImpl) {
  const url = new URL(boundedString(config?.url, "url", 4096));
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new TypeError("agent bridge URL must use ws: or wss:");
  }
  const token = boundedString(config?.token, "token", 4096);
  const sessionId = config?.sessionId === undefined || config.sessionId === ""
    ? cryptoImpl.randomUUID()
    : boundedString(config.sessionId, "sessionId", 128);
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) {
    throw new TypeError("agent bridge sessionId may contain only letters, numbers, dot, underscore, and hyphen");
  }
  const playMode = config?.playMode ?? "global";
  if (playMode !== "global" && playMode !== "camera") {
    throw new TypeError("agent bridge playMode must be global or camera");
  }
  return Object.freeze({ url: url.href, token, sessionId, playMode });
}

function publicEndpoint(url) {
  const parsed = new URL(url);
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export function createAgentBridgeConnection({
  config,
  rpc,
  WebSocketImpl = globalThis.WebSocket,
  cryptoImpl = globalThis.crypto,
  setTimeoutImpl = globalThis.setTimeout.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout.bind(globalThis),
  onStatus = () => {},
} = {}) {
  if (typeof rpc !== "function") throw new TypeError("agent bridge requires the engine RPC function");
  if (typeof WebSocketImpl !== "function") throw new TypeError("WebSocket is unavailable");
  if (!cryptoImpl || typeof cryptoImpl.randomUUID !== "function") {
    throw new TypeError("crypto.randomUUID is unavailable");
  }

  const normalized = normalizeConfig(config, cryptoImpl);
  let socket = null;
  let stopped = false;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let authenticated = false;
  let requestTail = Promise.resolve();
  let state = {
    configured: true,
    protocol: AGENT_PROTOCOL,
    endpoint: publicEndpoint(normalized.url),
    sessionId: normalized.sessionId,
    playMode: normalized.playMode,
    phase: "idle",
    connected: false,
    reconnectAttempt: 0,
    lastError: null,
  };

  function publish(patch) {
    state = { ...state, ...patch };
    onStatus({ ...state });
  }

  async function engineRequest(command, payload) {
    const reply = await rpc(command, payload);
    if (reply?.ok !== true) {
      const engineError = reply?.result?.error;
      throw new ProtocolFault(
        engineError?.code ?? "engine_error",
        engineError?.message ?? reply?.error ?? `${command} failed`,
      );
    }
    return reply.result;
  }

  async function executeOperation(op, args) {
    switch (op) {
      case "protocol.describe":
        return {
          protocol: AGENT_PROTOCOL,
          capabilities: [...CAPABILITIES],
          observation: "request-driven",
          transport: "raw-websocket-json",
          playMode: normalized.playMode,
        };
      case "input.pointerMove": {
        const point = pointerPosition(args);
        const reply = await rpc("postMessage", {
          message: 0x0200,
          wParam: 0,
          lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
          point,
        });
        if (reply?.ok !== true) {
          throw new ProtocolFault(
            "engine_error",
            reply?.error ?? "pointer move failed",
          );
        }
        return { ok: true, ...point };
      }
      case "camera.lookAt":
        return engineRequest("agentCameraLookAt", worldPosition(args));
      case "camera.setView": {
        const view = cameraView(args);
        return engineRequest("agentCameraSetView", {
          angle: view.angle ?? 0,
          pitch: view.pitch ?? 0,
          zoom: view.zoom ?? 0,
          setAngle: view.angle !== undefined,
          setPitch: view.pitch !== undefined,
          setZoom: view.zoom !== undefined,
        });
      }
      case "game.select":
        return engineRequest("agentGameSelect", {
          objectIds: objectIdList(args), cameraBound: normalized.playMode === "camera",
        });
      case "game.order":
        return engineRequest("agentGameOrder", {
          ...gameOrder(args), cameraBound: normalized.playMode === "camera",
        });
      case "game.context":
        return engineRequest("agentGameContext", {
          ...gameContext(args), cameraBound: normalized.playMode === "camera",
        });
      case "game.command":
        return engineRequest("agentGameCommand", {
          ...gameCommand(args), cameraBound: normalized.playMode === "camera",
        });
      case "game.playerCommand":
        return engineRequest("agentGamePlayerCommand", {
          ...gamePlayerCommand(args), cameraBound: normalized.playMode === "camera",
        });
      case "game.production":
        return engineRequest("agentGameProduction", {
          ...gameProduction(args), cameraBound: normalized.playMode === "camera",
        });
      case "game.container":
        return engineRequest("agentGameContainer", {
          ...gameContainer(args), cameraBound: normalized.playMode === "camera",
        });
      case "game.beacon":
        return engineRequest("agentGameBeacon", {
          ...gameBeacon(args), cameraBound: normalized.playMode === "camera",
        });
      case "world.snapshot":
        return engineRequest("agentWorldSnapshot", worldObservation(args, normalized.playMode));
      case "terrain.query":
        return engineRequest("agentTerrainQuery", terrainQuery(args, normalized.playMode));
      case "minimap.snapshot":
        return engineRequest("agentMinimapSnapshot", minimapQuery(args));
      case "hud.snapshot":
        return engineRequest("agentHudSnapshot", {});
      case "chat.send": {
        const text = typeof args?.text === "string" ? args.text.trim() : "";
        if (text.length < 1 || text.length > 255 || /[\x00-\x1f\x7f]/u.test(text)) {
          throw new ProtocolFault(
            "invalid_arguments",
            "text must contain 1 through 255 UTF-16 code units without control characters",
          );
        }
        const audience = args?.audience ?? "everyone";
        if (audience !== "everyone" && audience !== "allies") {
          throw new ProtocolFault("invalid_arguments", "audience must be everyone or allies");
        }
        return engineRequest("agentChatSend", { text, audience });
      }
      case "ui.snapshot":
        if (args?.includeHidden !== undefined && typeof args.includeHidden !== "boolean") {
          throw new ProtocolFault("invalid_arguments", "includeHidden must be boolean");
        }
        return engineRequest("agentUiSnapshot", { includeHidden: args?.includeHidden === true });
      case "ui.activate":
        return engineRequest("agentUiActivate", windowReference(args));
      case "ui.setText": {
        const reference = windowReference(args);
        if (typeof args?.text !== "string" || args.text.length > MAX_TEXT_LENGTH) {
          throw new ProtocolFault("invalid_arguments", `text must be a string of at most ${MAX_TEXT_LENGTH} characters`);
        }
        return engineRequest("agentUiSetText", { ...reference, text: args.text });
      }
      case "ui.submit":
        return engineRequest("agentUiSubmit", windowReference(args));
      case "ui.selectIndex": {
        const reference = windowReference(args);
        const index = Number(args?.index);
        if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) {
          throw new ProtocolFault("invalid_arguments", "index must be a non-negative integer");
        }
        return engineRequest("agentUiSelectIndex", { ...reference, index });
      }
      case "ui.setValue": {
        const reference = windowReference(args);
        const value = Number(args?.value);
        if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) {
          throw new ProtocolFault("invalid_arguments", "value must be a signed 32-bit integer");
        }
        return engineRequest("agentUiSetValue", { ...reference, value });
      }
      case "ui.selectTab": {
        const reference = windowReference(args);
        const index = Number(args?.index);
        if (!Number.isInteger(index) || index < 0 || index > 7) {
          throw new ProtocolFault("invalid_arguments", "index must be an integer from 0 through 7");
        }
        return engineRequest("agentUiSelectTab", { ...reference, index });
      }
      case "ui.listItems": {
        const reference = windowReference(args);
        const offset = args?.offset === undefined ? 0 : Number(args.offset);
        const limit = args?.limit === undefined ? 64 : Number(args.limit);
        if (!Number.isInteger(offset) || offset < 0) {
          throw new ProtocolFault("invalid_arguments", "offset must be a non-negative integer");
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > 128) {
          throw new ProtocolFault("invalid_arguments", "limit must be an integer from 1 through 128");
        }
        return engineRequest("agentUiListItems", { ...reference, offset, limit });
      }
      default:
        throw new ProtocolFault("unsupported_operation", `unsupported operation: ${op}`);
    }
  }

  function sendOn(target, payload) {
    if (target !== socket || target.readyState !== (WebSocketImpl.OPEN ?? 1)) return false;
    let encoded = JSON.stringify(payload);
    if (byteLength(encoded) > MAX_RESPONSE_BYTES) {
      encoded = JSON.stringify({
        type: "response",
        id: payload.id,
        ok: false,
        error: { code: "response_too_large", message: "engine response exceeded 4 MiB" },
      });
    }
    target.send(encoded);
    return true;
  }

  async function handleRequest(target, message) {
    const id = boundedString(message?.id, "id", 128);
    const op = boundedString(message?.op, "op", 128);
    if (message.args !== undefined
        && (message.args === null || typeof message.args !== "object" || Array.isArray(message.args))) {
      throw new ProtocolFault("invalid_request", "args must be a JSON object");
    }
    try {
      const result = await executeOperation(op, message.args ?? {});
      sendOn(target, { type: "response", id, ok: true, result });
    } catch (error) {
      const fault = error instanceof ProtocolFault
        ? error
        : new ProtocolFault("internal_error", error?.message ?? String(error));
      sendOn(target, {
        type: "response",
        id,
        ok: false,
        error: {
          code: fault.code,
          message: fault.message,
          ...(fault.details === undefined ? {} : { details: fault.details }),
        },
      });
    }
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer !== null) return;
    const delay = Math.min(5000, 250 * (2 ** Math.min(reconnectAttempt, 5)));
    reconnectAttempt += 1;
    publish({
      phase: "reconnecting",
      connected: false,
      reconnectAttempt,
    });
    reconnectTimer = setTimeoutImpl(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect() {
    if (stopped) return;
    authenticated = false;
    publish({ phase: "connecting", connected: false });
    let target;
    try {
      target = new WebSocketImpl(normalized.url, [AGENT_SUBPROTOCOL]);
      socket = target;
    } catch (error) {
      publish({ lastError: error?.message ?? String(error) });
      scheduleReconnect();
      return;
    }

    target.addEventListener("open", () => {
      if (target !== socket || stopped) return;
      target.send(JSON.stringify({
        type: "hello",
        protocol: AGENT_PROTOCOL,
        token: normalized.token,
        sessionId: normalized.sessionId,
        playMode: normalized.playMode,
        capabilities: [...CAPABILITIES],
      }));
      publish({ phase: "authenticating", connected: false, lastError: null });
    });
    target.addEventListener("message", (event) => {
      if (target !== socket || stopped) return;
      const raw = typeof event.data === "string" ? event.data : "";
      if (byteLength(raw) > MAX_REQUEST_BYTES) {
        target.close(1009, "request exceeds 1 MiB");
        return;
      }
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        target.close(1007, "invalid JSON");
        return;
      }
      if (message?.type === "hello" && message.ok === true
          && message.protocol === AGENT_PROTOCOL
          && message.sessionId === normalized.sessionId
          && message.playMode === normalized.playMode) {
        authenticated = true;
        reconnectAttempt = 0;
        publish({ phase: "connected", connected: true, reconnectAttempt: 0, lastError: null });
        return;
      }
      if (message?.type !== "request") return;
      if (!authenticated) {
        target.close(1008, "engine session is not authenticated");
        return;
      }
      requestTail = requestTail
        .then(() => handleRequest(target, message))
        .catch((error) => {
          sendOn(target, {
            type: "response",
            id: typeof message?.id === "string" ? message.id : "",
            ok: false,
            error: { code: "invalid_request", message: error?.message ?? String(error) },
          });
        });
    });
    target.addEventListener("error", () => {
      if (target === socket) publish({ lastError: "WebSocket transport error" });
    });
    target.addEventListener("close", (event) => {
      if (target !== socket) return;
      socket = null;
      publish({
        phase: stopped ? "stopped" : "disconnected",
        connected: false,
        lastError: stopped || event.wasClean ? state.lastError : `WebSocket closed (${event.code})`,
      });
      scheduleReconnect();
    });
  }

  connect();
  return {
    snapshot: () => ({ ...state }),
    stop() {
      stopped = true;
      if (reconnectTimer !== null) clearTimeoutImpl(reconnectTimer);
      reconnectTimer = null;
      const target = socket;
      socket = null;
      if (target && target.readyState < (WebSocketImpl.CLOSING ?? 2)) {
        target.close(1000, "runtime stopped");
      }
      publish({ phase: "stopped", connected: false });
    },
  };
}
