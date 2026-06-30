#!/usr/bin/env node
// verify_websocket_transport_frontier.mjs
//
// Source-only verifier for the current browser networking transport frontier.
// It pins two facts that must stay true until the production browser transport
// adapter replaces the original native socket path:
//
//   1. Original `Transport` still owns a concrete, non-virtual `UDP` instance
//      and `doSend`/`doRecv` write/read `TransportMessageHeader + payload`
//      through `UDP::Write` / `UDP::Read`.
//   2. The browser WebSocket smoke now carries the encrypted
//      `Transport::queueSend` wire image, then validates the receive-side
//      decrypt/CRC/magic contract before feeding the focused original
//      `Transport::m_inBuffer` / `ConnectionManager` / `FrameDataManager`
//      readiness path.
//
// Open (NOT claimed complete by this verifier):
//   - Replacing `m_udpsock = NEW UDP()` with a browser WebSocket/WebRTC
//     transport adapter/factory that `Transport::doSend` and `doRecv` own.
//   - Removing the focused accept RPC that injects after WebSocket delivery.
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
  udp: {},
  transportHeader: {},
  transportCpp: {},
  wasmWireProbe: {},
  browserHarness: {},
};

const udpBody = classBody(sourceEntries.udpH, "UDP");
assertPresent(
  errors,
  facts.udp,
  "classLine",
  lineNumber(sourceEntries.udpH.lines, (line) => /^\s*class\s+UDP\b/.test(line)),
  "UDP class",
);
assertAbsent(errors, facts.udp, "hasVirtualMethod", /\bvirtual\b/.test(udpBody), "UDP virtual method");

assertPresent(
  errors,
  facts.transportHeader,
  "udpIncludeLine",
  lineNumber(sourceEntries.transportH.lines, (line) => /#include\s+"GameNetwork\/udp\.h"/.test(line)),
  "Transport.h UDP include",
);
assertPresent(
  errors,
  facts.transportHeader,
  "udpMemberLine",
  lineNumber(sourceEntries.transportH.lines, (line) => /\bUDP\s*\*\s*m_udpsock\b/.test(line)),
  "Transport concrete UDP member",
);
assertPresent(
  errors,
  facts.transportHeader,
  "queueSendDeclLine",
  lineNumber(sourceEntries.transportH.lines, (line) => /\bBool\s+queueSend\b/.test(line)),
  "Transport::queueSend declaration",
);
assertPresent(
  errors,
  facts.transportHeader,
  "doSendDeclLine",
  lineNumber(sourceEntries.transportH.lines, (line) => /\bBool\s+doSend\b/.test(line)),
  "Transport::doSend declaration",
);
assertPresent(
  errors,
  facts.transportHeader,
  "doRecvDeclLine",
  lineNumber(sourceEntries.transportH.lines, (line) => /\bBool\s+doRecv\b/.test(line)),
  "Transport::doRecv declaration",
);

const transport = sourceEntries.transportCpp;
const initLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::init\s*\(\s*UnsignedInt/.test(line));
const doSendLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::doSend\s*\(/.test(line));
const doRecvLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::doRecv\s*\(/.test(line));
const queueSendLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::queueSend\s*\(/.test(line));
const isGeneralsPacketLine = lineNumber(transport.lines, (line) => /\bBool\s+Transport::isGeneralsPacket\s*\(/.test(line));
facts.transportCpp.definitions = { initLine, doSendLine, doRecvLine, queueSendLine, isGeneralsPacketLine };

const initRange = functionBodyLineRange(transport.lines, initLine);
const doSendRange = functionBodyLineRange(transport.lines, doSendLine);
const doRecvRange = functionBodyLineRange(transport.lines, doRecvLine);
const queueSendRange = functionBodyLineRange(transport.lines, queueSendLine);
const isGeneralsPacketRange = functionBodyLineRange(transport.lines, isGeneralsPacketLine);

assertRangeContains(errors, facts.transportCpp, transport, initRange, "newUdpLine", /m_udpsock\s*=\s*NEW\s+UDP\s*\(\s*\)/, "Transport::init concrete UDP allocation");
assertRangeContains(errors, facts.transportCpp, transport, initRange, "bindLine", /m_udpsock->Bind\s*\(/, "Transport::init UDP bind");
assertRangeContains(errors, facts.transportCpp, transport, doSendRange, "writeLine", /m_udpsock->Write\s*\(/, "Transport::doSend UDP write");
assertRangeContains(errors, facts.transportCpp, transport, doSendRange, "headerPayloadSendLine", /m_outBuffer\[i\]\.length\s*\+\s*sizeof\s*\(\s*TransportMessageHeader\s*\)/, "Transport::doSend header+payload byte count");
assertRangeContains(errors, facts.transportCpp, transport, doRecvRange, "readLine", /m_udpsock->Read\s*\(/, "Transport::doRecv UDP read");
assertRangeContains(errors, facts.transportCpp, transport, doRecvRange, "decryptLine", /decryptBuf\s*\(\s*buf\s*,\s*len\s*\)/, "Transport::doRecv decrypt");
assertRangeContains(errors, facts.transportCpp, transport, doRecvRange, "lengthLine", /incomingMessage\.length\s*=\s*len\s*-\s*sizeof\s*\(\s*TransportMessageHeader\s*\)/, "Transport::doRecv payload length assignment");
assertRangeContains(errors, facts.transportCpp, transport, doRecvRange, "packetCheckLine", /isGeneralsPacket\s*\(\s*&incomingMessage\s*\)/, "Transport::doRecv packet validation");
assertRangeContains(errors, facts.transportCpp, transport, queueSendRange, "magicLine", /header\.magic\s*=\s*GENERALS_MAGIC_NUMBER/, "Transport::queueSend magic");
assertRangeContains(errors, facts.transportCpp, transport, queueSendRange, "crcLine", /computeCRC\s*\(/, "Transport::queueSend CRC");
assertRangeContains(errors, facts.transportCpp, transport, queueSendRange, "encryptLine", /encryptBuf\s*\(\s*\(unsigned char \*\)&m_outBuffer\[i\]/, "Transport::queueSend encryption");
assertRangeContains(errors, facts.transportCpp, transport, isGeneralsPacketRange, "magicCheckLine", /header\.magic\s*!=\s*GENERALS_MAGIC_NUMBER/, "Transport::isGeneralsPacket magic check");
assertRangeContains(errors, facts.transportCpp, transport, isGeneralsPacketRange, "crcCheckLine", /crc\.get\(\)\s*!=\s*msg->header\.crc/, "Transport::isGeneralsPacket CRC check");

const wasm = sourceEntries.wasmProbe;
const wireBuildLine = lineNumber(wasm.lines, (line) => /cnc_port_build_browser_network_transport_wire_packet/.test(line));
const wireAcceptLine = lineNumber(wasm.lines, (line) => /cnc_port_accept_browser_network_transport_wire_packet/.test(line));
const wireBuildRange = functionBodyLineRange(wasm.lines, wireBuildLine);
const wireAcceptRange = functionBodyLineRange(wasm.lines, wireAcceptLine);
assertPresent(
  errors,
  facts.wasmWireProbe,
  "buildExportLine",
  wireBuildLine,
  "wasm wire build export",
);
assertPresent(
  errors,
  facts.wasmWireProbe,
  "acceptExportLine",
  wireAcceptLine,
  "wasm wire accept export",
);
assertRangeContains(errors, facts.wasmWireProbe, wasm, wireBuildRange, "queueSendLine", /transport\.queueSend\s*\(/, "wasm Transport::queueSend wire builder");
assertRangeContains(errors, facts.wasmWireProbe, wasm, wireBuildRange, "wireEncodeLine", /g_browser_network_transport_wire_hex/, "wasm encrypted wire hex export");
assertRangeContains(errors, facts.wasmWireProbe, wasm, wireAcceptRange, "wireDecodeLine", /decode_hex_with_capacity\s*\(/, "wasm encrypted wire hex decode");
assertRangeContains(errors, facts.wasmWireProbe, wasm, wireAcceptRange, "crcValidateLine", /transport_message_has_valid_crc\s*\(/, "wasm transport CRC validation in wire accept");
assertRangeContains(errors, facts.wasmWireProbe, wasm, wireAcceptRange, "oldAcceptBridgeLine", /packet_accept_json\s*=\s*cnc_port_accept_browser_network_transport_packet\s*\(/, "wasm wire accept feeds existing focused frame-data accept path");

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
assertPresent(
  errors,
  facts.browserHarness,
  "buildRpcLine",
  lineNumber(bridge.lines, (line) => /browserNetworkTransportBuildWirePacket/.test(line)),
  "bridge wire build RPC",
);
assertPresent(
  errors,
  facts.browserHarness,
  "acceptRpcLine",
  lineNumber(bridge.lines, (line) => /browserNetworkTransportAcceptWirePacket/.test(line)),
  "bridge wire accept RPC",
);

const smoke = sourceEntries.websocketSmoke;
assertPresent(
  errors,
  facts.browserHarness,
  "smokeBuildRpcLine",
  lineNumber(smoke.lines, (line) => /browserNetworkTransportBuildWirePacket/.test(line)),
  "WebSocket smoke wire build RPC",
);
assertPresent(
  errors,
  facts.browserHarness,
  "smokeAcceptRpcLine",
  lineNumber(smoke.lines, (line) => /browserNetworkTransportAcceptWirePacket/.test(line)),
  "WebSocket smoke wire accept RPC",
);
assertPresent(
  errors,
  facts.browserHarness,
  "smokeWebSocketSendLine",
  lineNumber(smoke.lines, (line) => /socket\.send\s*\(\s*bytes\s*\)/.test(line)),
  "WebSocket smoke binary send",
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
    "Original Transport still owns concrete UDP, while the browser WebSocket smoke carries encrypted Transport::queueSend wire bytes through receive-side decrypt/CRC validation into the focused original frame-data readiness path.",
  open:
    "Replace concrete UDP allocation/read/write under Transport::doSend/doRecv with a browser WebSocket/WebRTC adapter/factory.",
  facts,
  errors,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length > 0) process.exit(1);
