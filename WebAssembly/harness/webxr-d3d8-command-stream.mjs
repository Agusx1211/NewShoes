export const WEBXR_D3D8_COMMAND_STREAM_VERSION = 1;
export const WEBXR_D3D8_ACKNOWLEDGEMENT_WORDS = 2;

function validateAcknowledgement(acknowledgement) {
  if (!(acknowledgement instanceof Int32Array)
      || acknowledgement.length < WEBXR_D3D8_ACKNOWLEDGEMENT_WORDS
      || !(typeof SharedArrayBuffer === "function"
        && acknowledgement.buffer instanceof SharedArrayBuffer)) {
    throw new TypeError("WebXR D3D8 acknowledgement must be a shared two-word Int32Array");
  }
}

export function acknowledgeWebXrD3D8CommandFrame(acknowledgement, sequence, accepted) {
  validateAcknowledgement(acknowledgement);
  Atomics.store(acknowledgement, 1, (Number(sequence) >>> 0) | 0);
  Atomics.store(acknowledgement, 0, accepted === true ? 1 : -1);
  Atomics.notify(acknowledgement, 0);
}

export function submitWebXrD3D8CommandFrame({
  acknowledgement,
  packet,
  postFrame,
  timeoutMs = 5000,
} = {}) {
  validateAcknowledgement(acknowledgement);
  if (!Number.isInteger(packet?.sequence) || packet.sequence <= 0) {
    throw new TypeError("WebXR D3D8 frame submission requires a positive sequence");
  }
  if (typeof postFrame !== "function") {
    throw new TypeError("WebXR D3D8 frame submission requires postFrame");
  }
  const waitMs = Math.max(100, Math.min(30000, Number(timeoutMs) || 5000));
  Atomics.store(acknowledgement, 1, 0);
  Atomics.store(acknowledgement, 0, 0);
  postFrame(packet);
  const waitResult = Atomics.wait(acknowledgement, 0, 0, waitMs);
  const status = Atomics.load(acknowledgement, 0);
  const acknowledgedSequence = Atomics.load(acknowledgement, 1) >>> 0;
  // Main may acknowledge between postFrame() returning and wait() beginning,
  // which produces "not-equal". Only timeout/rejection/wrong-sequence fails.
  return waitResult !== "timed-out" && status === 1
    && acknowledgedSequence === (packet.sequence >>> 0);
}

const RECORDED_HOOKS = Object.freeze([
  "cncPortD3D8ResetState",
  "cncPortD3D8Clear",
  "cncPortD3D8SetViewport",
  "cncPortD3D8SetGammaRamp",
  "cncPortD3D8BackbufferResize",
  "cncPortD3D8BufferCreate",
  "cncPortD3D8BufferUpdate",
  "cncPortD3D8BufferRelease",
  "cncPortD3D8TextureCreate",
  "cncPortD3D8TextureUpdate",
  "cncPortD3D8VolumeTextureCreate",
  "cncPortD3D8VolumeTextureUpdate",
  "cncPortD3D8TextureRelease",
  "cncPortD3D8TextureBind",
  "cncPortD3D8BindFramebuffer",
  "cncPortD3D8DrawIndexed",
  "cncPortD3D8ShaderCreate",
  "cncPortD3D8ShaderDelete",
]);

function cloneCommandValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value === "string"
      || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return typeof value.slice === "function"
      ? value.slice()
      : new value.constructor(value);
  }
  if (value instanceof ArrayBuffer
      || (typeof SharedArrayBuffer === "function" && value instanceof SharedArrayBuffer)) {
    return value.slice(0);
  }
  if (typeof value !== "object") {
    throw new TypeError(`unsupported D3D8 command value: ${typeof value}`);
  }
  if (seen.has(value)) {
    throw new TypeError("cyclic D3D8 command payload");
  }
  seen.add(value);
  let clone;
  if (Array.isArray(value)) {
    clone = value.map((entry) => cloneCommandValue(entry, seen));
  } else {
    clone = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneCommandValue(entry, seen);
    }
  }
  seen.delete(value);
  return clone;
}

function commandValueBytes(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return 8;
  if (typeof value === "boolean") return 1;
  if (typeof value === "string") return value.length * 2;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer
      || (typeof SharedArrayBuffer === "function" && value instanceof SharedArrayBuffer)) {
    return value.byteLength;
  }
  if (typeof value !== "object" || seen.has(value)) return 0;
  seen.add(value);
  const bytes = Array.isArray(value)
    ? value.reduce((sum, entry) => sum + commandValueBytes(entry, seen), 0)
    : Object.entries(value).reduce((sum, [key, entry]) =>
        sum + key.length * 2 + commandValueBytes(entry, seen), 0);
  seen.delete(value);
  return bytes;
}

function validateDelegateHooks(delegateHooks) {
  if (!delegateHooks || typeof delegateHooks !== "object") {
    throw new TypeError("D3D8 command recorder requires delegate hooks");
  }
  for (const hook of RECORDED_HOOKS) {
    if (typeof delegateHooks[hook] !== "function") {
      throw new TypeError(`D3D8 command recorder missing delegate ${hook}`);
    }
  }
  for (const queryHook of [
    "cncPortD3D8NativeMode",
    "cncPortD3D8TextureSampleCenter",
    "cncPortD3D8ShaderTier",
  ]) {
    if (typeof delegateHooks[queryHook] !== "function") {
      throw new TypeError(`D3D8 command recorder missing query delegate ${queryHook}`);
    }
  }
}

export function createWebXrD3D8CommandRecorder({
  delegateHooks,
  materializeDrawPayload,
  onFrame,
  onError = null,
  maxCommands = 250_000,
  maxBytes = 64 * 1024 * 1024,
} = {}) {
  validateDelegateHooks(delegateHooks);
  if (typeof materializeDrawPayload !== "function") {
    throw new TypeError("D3D8 command recorder requires draw payload materialization");
  }
  if (typeof onFrame !== "function") {
    throw new TypeError("D3D8 command recorder requires an onFrame consumer");
  }
  const commandLimit = Math.max(1, Number(maxCommands) >>> 0);
  const byteLimit = Math.max(1024, Number(maxBytes) >>> 0);
  let sequence = 0;
  let commands = [];
  let bytes = 0;
  let failure = null;

  function snapshot() {
    return {
      version: WEBXR_D3D8_COMMAND_STREAM_VERSION,
      sequence,
      queuedCommands: commands.length,
      queuedBytes: bytes,
      maxCommands: commandLimit,
      maxBytes: byteLimit,
      failed: failure !== null,
      error: failure,
    };
  }

  function fail(error) {
    failure = error?.message ?? String(error);
    onError?.(new Error(failure), snapshot());
    return false;
  }

  function enqueue(hook, args) {
    if (failure) return false;
    try {
      const ownedArgs = cloneCommandValue(args);
      const command = { hook, args: ownedArgs };
      const commandBytes = hook.length * 2 + commandValueBytes(ownedArgs);
      if (commands.length + 1 > commandLimit) {
        throw new Error(`WebXR D3D8 command limit exceeded (${commandLimit})`);
      }
      if (bytes + commandBytes > byteLimit) {
        throw new Error(`WebXR D3D8 command byte limit exceeded (${byteLimit})`);
      }
      commands.push(command);
      bytes += commandBytes;
      return true;
    } catch (error) {
      return fail(error);
    }
  }

  const hooks = {};
  for (const hook of RECORDED_HOOKS) {
    hooks[hook] = (...args) => {
      let ownedDrawArgs = args;
      if (hook === "cncPortD3D8DrawIndexed") {
        try {
          ownedDrawArgs = [materializeDrawPayload(args[0])];
        } catch (error) {
          fail(error);
          return delegateHooks[hook](...args);
        }
      }
      const result = delegateHooks[hook](...args);
      enqueue(hook, ownedDrawArgs);
      return result;
    };
  }
  for (const queryHook of [
    "cncPortD3D8NativeMode",
    "cncPortD3D8TextureSampleCenter",
    "cncPortD3D8ShaderTier",
  ]) {
    hooks[queryHook] = (...args) => delegateHooks[queryHook](...args);
  }
  hooks.cncPortD3D8Present = (metadata = {}) => {
    if (failure) return false;
    const delegatePresent = delegateHooks.cncPortD3D8Present;
    if (typeof delegatePresent !== "function" || delegatePresent(metadata) !== true) {
      return fail(new Error("D3D8 present delegate rejected the frame"));
    }
    if (!enqueue("cncPortD3D8Present", [metadata])) return false;
    const packet = {
      version: WEBXR_D3D8_COMMAND_STREAM_VERSION,
      sequence: sequence + 1,
      present: cloneCommandValue(metadata),
      commands,
      commandBytes: bytes,
    };
    let accepted = false;
    try {
      accepted = onFrame(packet) === true;
    } catch (error) {
      return fail(error);
    }
    if (!accepted) {
      return fail(new Error("WebXR D3D8 frame consumer rejected the frame"));
    }
    sequence += 1;
    commands = [];
    bytes = 0;
    return true;
  };

  function reset() {
    commands = [];
    bytes = 0;
    failure = null;
    return snapshot();
  }

  return { hooks, snapshot, reset };
}

export function replayWebXrD3D8CommandFrame(packet, executorHooks) {
  if (packet?.version !== WEBXR_D3D8_COMMAND_STREAM_VERSION) {
    throw new Error(`unsupported WebXR D3D8 command stream version ${packet?.version}`);
  }
  if (!Number.isInteger(packet.sequence) || packet.sequence <= 0) {
    throw new Error("WebXR D3D8 frame has an invalid sequence");
  }
  if (!Array.isArray(packet.commands) || packet.commands.length === 0) {
    throw new Error("WebXR D3D8 frame has no commands");
  }
  for (const command of packet.commands) {
    const hook = command?.hook;
    const executor = executorHooks?.[hook];
    if (typeof executor !== "function") {
      throw new Error(`WebXR D3D8 executor does not implement ${hook}`);
    }
    const result = executor(...(Array.isArray(command.args) ? command.args : []));
    if (hook === "cncPortD3D8Present" && result !== true) {
      throw new Error("WebXR D3D8 executor rejected Present");
    }
  }
  return {
    sequence: packet.sequence,
    commands: packet.commands.length,
    commandBytes: Number(packet.commandBytes ?? 0),
  };
}

export const WEBXR_D3D8_RECORDED_HOOKS = RECORDED_HOOKS;
