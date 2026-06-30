#!/usr/bin/env node
// verify_websocket_transport_frontier.mjs
//
// Source-only verifier for the browser networking transport vertical.
// It pins the current production-shaped path:
//
//   1. Original `Transport` still owns the original concrete `UDP` object and
//      still calls `UDP::Write` / `UDP::Read` from `doSend` / `doRecv`.
//   2. The wasm build retargets `UDP` behind that original API to browser-owned
//      datagram queues.
//   3. The WebSocket smoke carries the encrypted wire image between two browser
//      contexts, then proves destination bytes enter `Transport::doRecv` before
//      `ConnectionManager::doRelay` reaches `FrameDataManager`.
//
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

const SOURCES = {
  transportH: "GeneralsMD/Code/GameEngine/Include/GameNetwork/Transport.h",
  transportCpp: "GeneralsMD/Code/GameEngine/Source/GameNetwork/Transport.cpp",
  udpH: "GeneralsMD/Code/GameEngine/Include/GameNetwork/udp.h",
  udpCpp: "GeneralsMD/Code/GameEngine/Source/GameNetwork/udp.cpp",
  wasmProbe: "WebAssembly/src/wasm_gamenetwork_probe.cpp",
  bridge: "WebAssembly/harness/bridge.js",
  websocketSmoke: "WebAssembly/harness/network_websocket_transport_smoke.mjs",
  packageJson: "WebAssembly/package.json",
  cmake: "WebAssembly/CMakeLists.txt",
};

function readSource(relPath) {
  const abs = resolve(REPO_ROOT, relPath);
  const text = readFileSync(abs, "utf8");
  return { relPath, abs, text, lines: text.split(/\r?\n/) };
}

function lineNumber(lines, predicate) {
  for (let i = 0; i < lines.length; i += 1) {
    if (predicate(lines[i], i)) return i + 1;
  }
  return -1;
}

function functionBodyLineRange(lines, definitionLine) {
  if (definitionLine <= 0) return null;
  let bodyStart = -1;
  let depth = 0;
  for (let i = definitionLine - 1; i < lines.length; i += 1) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        if (bodyStart === -1) bodyStart = i + 1;
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (bodyStart !== -1 && depth === 0) {
          return { start: bodyStart, end: i + 1 };
        }
      }
    }
  }
  return null;
}

function firstMatchInRange(lines, startLine, endLine, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  for (let i = Math.max(startLine - 1, 0); i < endLine && i < lines.length; i += 1) {
    if (re.test(lines[i])) return i + 1;
  }
  return -1;
}

function classBody(source, className) {
  const start = source.text.indexOf(`class ${className}`);
  if (start < 0) return "";
  const brace = source.text.indexOf("{", start);
  if (brace < 0) return "";
  let depth = 0;
  for (let i = brace; i < source.text.length; i += 1) {
    const ch = source.text[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.text.slice(brace + 1, i);
    }
  }
  return "";
}

function assertPresent(errors, facts, key, actual, label) {
  facts[key] = actual;
  if (actual <= 0) errors.push(`${label} not found`);
}

function assertAbsent(errors, facts, key, actual, label) {
  facts[key] = actual;
  if (actual) errors.push(`${label} should be absent`);
}

function assertRangeContains(errors, facts, source, range, key, pattern, label) {
  if (!range) {
    errors.push(`${label} range missing`);
    facts[key] = -1;
    return;
  }
  assertPresent(
    errors,
    facts,
    key,
    firstMatchInRange(source.lines, range.start, range.end, pattern),
    label,
  );
}

const sourceEntries = Object.fromEntries(
  Object.entries(SOURCES).map(([key, relPath]) => [key, readSource(relPath)]),
);

const errors = [];
const facts = {
  sources: SOURCES,
  udpHeader: {},
  udpBackend: {},
  transport: {},
  wasmProbe: {},
  browserHarness: {},
};

const udpBody = classBody(sourceEntries.udpH, "UDP");
assertPresent(
  errors,
  facts.udpHeader,
  "classLine",
  lineNumber(sourceEntries.udpH.lines, (line) => /^\s*class\s+UDP\b/.test(line)),
  "UDP class",
);
assertAbsent(errors, facts.udpHeader, "hasVirtualMethod", /\bvirtual\b/.test(udpBody), "UDP virtual method");

const transportH = sourceEntries.transportH;
assertPresent(
  errors,
  facts.transport,
  "udpMemberLine",
  lineNumber(transportH.lines, (line) => /\bUDP\s*\*\s*m_udpsock\b/.test(line)),
  "Transport concrete UDP member",
);
assertPresent(
  errors,
  facts.transport,
  "doSendDeclLine",
  lineNumber(transportH.lines, (line) => /\bBool\s+doSend\b/.test(line)),
  "Transport::doSend declaration",
);
assertPresent(
  errors,
  facts.transport,
  "doRecvDeclLine",
  lineNumber(transportH.lines, (line) => /\bBool\s+doRecv\b/.test(line)),
  "Transport::doRecv declaration",
);

const transport = sourceEntries.transportCpp;
const initLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::init\s*\(\s*UnsignedInt/.test(line));
const doSendLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::doSend\s*\(/.test(line));
const doRecvLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::doRecv\s*\(/.test(line));
const queueSendLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::queueSend\s*\(/.test(line));
const initRange = functionBodyLineRange(transport.lines, initLine);
const doSendRange = functionBodyLineRange(transport.lines, doSendLine);
const doRecvRange = functionBodyLineRange(transport.lines, doRecvLine);
const queueSendRange = functionBodyLineRange(transport.lines, queueSendLine);

assertRangeContains(errors, facts.transport, transport, initRange, "newUdpLine", /m_udpsock\s*=\s*NEW\s+UDP\s*\(\s*\)/, "Transport::init concrete UDP allocation");
assertRangeContains(errors, facts.transport, transport, doSendRange, "writeLine", /m_udpsock->Write\s*\(/, "Transport::doSend UDP write");
assertRangeContains(errors, facts.transport, transport, doRecvRange, "readLine", /m_udpsock->Read\s*\(/, "Transport::doRecv UDP read");
assertRangeContains(errors, facts.transport, transport, doRecvRange, "decryptLine", /decryptBuf\s*\(\s*buf\s*,\s*len\s*\)/, "Transport::doRecv decrypt");
assertRangeContains(errors, facts.transport, transport, queueSendRange, "encryptLine", /encryptBuf\s*\(\s*\(unsigned char \*\)&m_outBuffer\[i\]/, "Transport::queueSend encryption");

const udpCpp = sourceEntries.udpCpp;
const udpWriteLine = lineNumber(udpCpp.lines, (line) => /\bInt\s+UDP::Write\s*\(/.test(line));
const udpReadLine = lineNumber(udpCpp.lines, (line) => /\bInt\s+UDP::Read\s*\(/.test(line));
const udpWriteRange = functionBodyLineRange(udpCpp.lines, udpWriteLine);
const udpReadRange = functionBodyLineRange(udpCpp.lines, udpReadLine);
assertPresent(
  errors,
  facts.udpBackend,
  "emscriptenBranchLine",
  lineNumber(udpCpp.lines, (line) => /#ifdef\s+__EMSCRIPTEN__/.test(line)),
  "wasm UDP backend branch",
);
assertPresent(
  errors,
  facts.udpBackend,
  "adapterStateLine",
  lineNumber(udpCpp.lines, (line) => /BrowserUdpAdapterState\s+g_browser_udp_adapter/.test(line)),
  "browser UDP adapter state",
);
assertPresent(
  errors,
  facts.udpBackend,
  "pushIncomingExportLine",
  lineNumber(udpCpp.lines, (line) => /cnc_port_browser_udp_adapter_push_incoming/.test(line)),
  "browser UDP incoming push hook",
);
assertPresent(
  errors,
  facts.udpBackend,
  "popOutgoingExportLine",
  lineNumber(udpCpp.lines, (line) => /cnc_port_browser_udp_adapter_pop_outgoing/.test(line)),
  "browser UDP outgoing pop hook",
);
assertRangeContains(errors, facts.udpBackend, udpCpp, udpWriteRange, "writePushOutgoingLine", /g_browser_udp_adapter\.outgoing/, "UDP::Write pushes outgoing adapter datagram");
assertRangeContains(errors, facts.udpBackend, udpCpp, udpWriteRange, "writeCountLine", /g_browser_udp_adapter\.writes/, "UDP::Write records adapter write");
assertRangeContains(errors, facts.udpBackend, udpCpp, udpReadRange, "readPopIncomingLine", /g_browser_udp_adapter\.incoming/, "UDP::Read pops incoming adapter datagram");
assertRangeContains(errors, facts.udpBackend, udpCpp, udpReadRange, "readSockaddrLine", /from->sin_addr\.s_addr\s*=\s*htonl\s*\(\s*ip\s*\)/, "UDP::Read fills sockaddr source");

const wasm = sourceEntries.wasmProbe;
const wireBuildLine = lineNumber(wasm.lines, (line) => /cnc_port_build_browser_network_transport_wire_packet/.test(line));
const wireAcceptLine = lineNumber(wasm.lines, (line) => /cnc_port_accept_browser_network_transport_wire_packet/.test(line));
const wireBuildRange = functionBodyLineRange(wasm.lines, wireBuildLine);
const wireAcceptRange = functionBodyLineRange(wasm.lines, wireAcceptLine);
assertRangeContains(errors, facts.wasmProbe, wasm, wireBuildRange, "clearBeforeSendLine", /cnc_port_browser_udp_adapter_clear\s*\(/, "wire build clears browser UDP adapter");
assertRangeContains(errors, facts.wasmProbe, wasm, wireBuildRange, "transportInitLine", /transport\.init\s*\(/, "wire build initializes original Transport");
assertRangeContains(errors, facts.wasmProbe, wasm, wireBuildRange, "queueSendLine", /transport\.queueSend\s*\(/, "wire build queues through original Transport");
assertRangeContains(errors, facts.wasmProbe, wasm, wireBuildRange, "doSendLine", /transport\.doSend\s*\(/, "wire build drives original Transport::doSend");
assertRangeContains(errors, facts.wasmProbe, wasm, wireBuildRange, "popOutgoingLine", /cnc_port_browser_udp_adapter_pop_outgoing\s*\(/, "wire build pops adapter outgoing datagram");
assertRangeContains(errors, facts.wasmProbe, wasm, wireBuildRange, "productionTrueLine", /\\"productionTransport\\":true/, "wire build reports production transport");
assertRangeContains(errors, facts.wasmProbe, wasm, wireAcceptRange, "pushIncomingLine", /cnc_port_browser_udp_adapter_push_incoming\s*\(/, "wire accept pushes adapter incoming datagram");
assertRangeContains(errors, facts.wasmProbe, wasm, wireAcceptRange, "transportPointerInitLine", /transport->init\s*\(/, "wire accept initializes original Transport");
assertRangeContains(errors, facts.wasmProbe, wasm, wireAcceptRange, "doRecvLine", /transport->doRecv\s*\(/, "wire accept drives original Transport::doRecv");
assertRangeContains(errors, facts.wasmProbe, wasm, wireAcceptRange, "managerTransportLine", /manager->m_transport\s*=\s*transport/, "wire accept gives doRecv transport to ConnectionManager");
assertRangeContains(errors, facts.wasmProbe, wasm, wireAcceptRange, "doRelayLine", /manager->doRelay\s*\(/, "wire accept drives original ConnectionManager::doRelay");
assertRangeContains(errors, facts.wasmProbe, wasm, wireAcceptRange, "acceptProductionTrueLine", /\\"productionTransport\\":true/, "wire accept reports production transport");

const bridge = sourceEntries.bridge;
assertPresent(
  errors,
  facts.browserHarness,
  "bridgeBuildCwrapLine",
  lineNumber(bridge.lines, (line) => /cnc_port_build_browser_network_transport_wire_packet/.test(line)),
  "bridge wire build cwrap",
);
assertPresent(
  errors,
  facts.browserHarness,
  "bridgeAcceptCwrapLine",
  lineNumber(bridge.lines, (line) => /cnc_port_accept_browser_network_transport_wire_packet/.test(line)),
  "bridge wire accept cwrap",
);

const smoke = sourceEntries.websocketSmoke;
assertPresent(
  errors,
  facts.browserHarness,
  "smokeProductionRelayLine",
  lineNumber(smoke.lines, (line) => /productionTransport:\s*true/.test(line)),
  "WebSocket smoke production transport report",
);
assertPresent(
  errors,
  facts.browserHarness,
  "smokeDoSendAdapterLine",
  lineNumber(smoke.lines, (line) => /Transport::doSend -> browser UDP adapter Write/.test(line)),
  "WebSocket smoke doSend adapter assertion",
);
assertPresent(
  errors,
  facts.browserHarness,
  "smokeDoRecvAdapterLine",
  lineNumber(smoke.lines, (line) => /browser UDP adapter Read -> Transport::doRecv/.test(line)),
  "WebSocket smoke doRecv adapter assertion",
);
assertPresent(
  errors,
  facts.browserHarness,
  "smokeWebSocketSendLine",
  lineNumber(smoke.lines, (line) => /socket\.send\s*\(\s*bytes\s*\)/.test(line)),
  "WebSocket smoke binary send",
);
assertAbsent(
  errors,
  facts.browserHarness,
  "smokePacketAcceptDependency",
  /packetAccept/.test(smoke.text),
  "WebSocket smoke focused packetAccept dependency",
);
assertPresent(
  errors,
  facts.browserHarness,
  "packageScriptLine",
  lineNumber(sourceEntries.packageJson.lines, (line) => /"verify:websocket-transport-frontier"\s*:/.test(line)),
  "package verify:websocket-transport-frontier script",
);
assertPresent(
  errors,
  facts.browserHarness,
  "cmakeBuildExportLine",
  lineNumber(sourceEntries.cmake.lines, (line) => /_cnc_port_build_browser_network_transport_wire_packet/.test(line)),
  "CMake wire build export",
);
assertPresent(
  errors,
  facts.browserHarness,
  "cmakeAcceptExportLine",
  lineNumber(sourceEntries.cmake.lines, (line) => /_cnc_port_accept_browser_network_transport_wire_packet/.test(line)),
  "CMake wire accept export",
);

const report = {
  ok: errors.length === 0,
  source: "websocket-transport-frontier",
  verified:
    "Original Transport doSend/doRecv now move encrypted wire bytes through a wasm browser UDP adapter, with WebSocket delivery into ConnectionManager/FrameData readiness.",
  open:
    "Replace the harness datagram queue handoff with a live WebSocket/WebRTC endpoint shared by two browser game clients.",
  facts,
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exit(1);
