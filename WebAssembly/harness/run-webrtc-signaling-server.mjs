#!/usr/bin/env node
import { startWebRtcSignalingServer } from "./webrtc-signaling-server.mjs";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 8090);
const path = process.env.SIGNALING_PATH ?? "/webrtc";
const server = await startWebRtcSignalingServer({ host, port, path });

console.log(`Project New Shoes WebRTC signaling listening on ws://${host}:${server.port}${path}`);
console.log("Only room membership and SDP/ICE cross this server; game packets remain peer-to-peer.");

async function shutdown() {
  await server.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
