#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  WEBXR_D3D8_RECORDED_HOOKS,
  acknowledgeWebXrD3D8CommandFrame,
  createWebXrD3D8CommandRecorder,
  replayWebXrD3D8CommandFrame,
  submitWebXrD3D8CommandFrame,
} from "./webxr-d3d8-command-stream.mjs";

function makeDelegates(log) {
  const hooks = {};
  for (const hook of WEBXR_D3D8_RECORDED_HOOKS) {
    hooks[hook] = (...args) => {
      log.push([hook, ...args]);
      if (hook === "cncPortD3D8BindFramebuffer") return 1;
      if (hook === "cncPortD3D8ShaderCreate") return true;
      return undefined;
    };
  }
  hooks.cncPortD3D8NativeMode = () => ({ width: 1920, height: 1080 });
  hooks.cncPortD3D8TextureSampleCenter = () => [1, 2, 3, 4];
  hooks.cncPortD3D8ShaderTier = () => "ps11";
  hooks.cncPortD3D8Present = (metadata) => {
    log.push(["cncPortD3D8Present", metadata]);
    return true;
  };
  return hooks;
}

const delegateLog = [];
const packets = [];
const recorder = createWebXrD3D8CommandRecorder({
  delegateHooks: makeDelegates(delegateLog),
  materializeDrawPayload: (payload) => ({
    ...payload,
    statePayloadPointers: false,
    statePayloadCanonical: true,
    transforms: { world: Array.from({ length: 16 }, (_, index) => index) },
  }),
  onFrame: (packet) => {
    packets.push(packet);
    return true;
  },
});

assert.deepEqual(recorder.hooks.cncPortD3D8NativeMode(), { width: 1920, height: 1080 });
assert.equal(recorder.hooks.cncPortD3D8ShaderTier(), "ps11");
assert.equal(recorder.snapshot().queuedCommands, 0,
  "synchronous queries must not enter the graphics stream");

const bytes = new Uint8Array([1, 2, 3, 4]);
recorder.hooks.cncPortD3D8Clear(1, 32, 64, 128, 255, 1, 0);
recorder.hooks.cncPortD3D8BufferUpdate({ id: 7, bytes });
const bindResult = recorder.hooks.cncPortD3D8BindFramebuffer({
  colorTextureId: 9,
  depthTextureId: 10,
  width: 1024,
  height: 1024,
});
assert.equal(bindResult, 1, "synchronous delegate return must be preserved");
recorder.hooks.cncPortD3D8DrawIndexed({
  statePayloadPointers: true,
  primitiveType: 4,
  vertexBufferId: 7,
  indexBufferId: 8,
});
bytes.fill(99);
assert.equal(recorder.hooks.cncPortD3D8Present({
  presentCalls: 12,
  backBufferWidth: 1280,
  backBufferHeight: 720,
}), true);

assert.equal(packets.length, 1);
const packet = packets[0];
assert.equal(packet.sequence, 1);
assert.deepEqual(packet.commands.map(({ hook }) => hook), [
  "cncPortD3D8Clear",
  "cncPortD3D8BufferUpdate",
  "cncPortD3D8BindFramebuffer",
  "cncPortD3D8DrawIndexed",
  "cncPortD3D8Present",
]);
assert.deepEqual(Array.from(packet.commands[1].args[0].bytes), [1, 2, 3, 4],
  "recorded resource bytes must not alias mutable producer storage");
assert.equal(packet.commands[3].args[0].statePayloadCanonical, true);
assert.equal(packet.commands[3].args[0].statePayloadPointers, false);
assert.equal(recorder.snapshot().queuedCommands, 0);

const replayLog = [];
const replayResult = replayWebXrD3D8CommandFrame(packet, makeDelegates(replayLog));
assert.deepEqual(replayResult, {
  sequence: 1,
  commands: 5,
  commandBytes: packet.commandBytes,
});
assert.deepEqual(replayLog.map(([hook]) => hook), packet.commands.map(({ hook }) => hook));

let overflowError = null;
const overflow = createWebXrD3D8CommandRecorder({
  delegateHooks: makeDelegates([]),
  materializeDrawPayload: (payload) => ({ ...payload }),
  onFrame: () => true,
  onError: (error) => { overflowError = error; },
  maxCommands: 1,
  maxBytes: 1024,
});
overflow.hooks.cncPortD3D8Clear(1, 0, 0, 0, 0, 1, 0);
overflow.hooks.cncPortD3D8SetViewport({ width: 100, height: 100 });
assert.match(overflowError.message, /command limit exceeded/);
assert.equal(overflow.hooks.cncPortD3D8Present({ presentCalls: 1 }), false,
  "an overflowed stream must fail Present instead of dropping commands");
assert.equal(overflow.snapshot().failed, true);
assert.equal(overflow.reset().failed, false);

assert.throws(() => replayWebXrD3D8CommandFrame({
  version: 999,
  sequence: 1,
  commands: [],
}, {}), /unsupported/);

const acknowledgement = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2));
assert.equal(submitWebXrD3D8CommandFrame({
  acknowledgement,
  packet,
  postFrame: (submitted) => {
    acknowledgeWebXrD3D8CommandFrame(acknowledgement, submitted.sequence, true);
  },
}), true, "an acknowledgement racing ahead of Atomics.wait must be accepted");
assert.equal(submitWebXrD3D8CommandFrame({
  acknowledgement,
  packet,
  postFrame: (submitted) => {
    acknowledgeWebXrD3D8CommandFrame(acknowledgement, submitted.sequence, false);
  },
}), false, "a rejected main-realm replay must fail the worker frame");
assert.equal(submitWebXrD3D8CommandFrame({
  acknowledgement,
  packet,
  postFrame: (submitted) => {
    acknowledgeWebXrD3D8CommandFrame(acknowledgement, submitted.sequence + 1, true);
  },
}), false, "an acknowledgement for the wrong frame must not advance the engine");

console.log("WebXR D3D8 command stream unit: PASS");
