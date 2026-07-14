export const AGENT_PROTOCOL = "cnc-agent/1";
export const AGENT_SUBPROTOCOL = "cnc-agent.v1";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_LENGTH = 16 * 1024;
const CAPABILITIES = Object.freeze([
  "protocol.describe",
  "input.pointerMove",
  "ui.snapshot",
  "ui.activate",
  "ui.setText",
  "ui.selectIndex",
  "ui.listItems",
]);

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
  return Object.freeze({ url: url.href, token, sessionId });
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
      case "ui.selectIndex": {
        const reference = windowReference(args);
        const index = Number(args?.index);
        if (!Number.isInteger(index) || index < 0 || index > 0x7fffffff) {
          throw new ProtocolFault("invalid_arguments", "index must be a non-negative integer");
        }
        return engineRequest("agentUiSelectIndex", { ...reference, index });
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
          && message.sessionId === normalized.sessionId) {
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
