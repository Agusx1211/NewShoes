import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";
import { attachWebRtcSignalingServer } from "./webrtc-signaling-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "127.0.0.1";
const issueDumpRoot = resolve(wasmRoot, "artifacts/issue-dumps");
const server = await startStaticServer({ root: wasmRoot, port, host, issueDumpRoot });
const signaling = attachWebRtcSignalingServer({ server: server.server });

console.log(`Harness serving ${new URL("harness/index.html", server.url).href}`);
console.log(`Playable page   ${new URL("harness/play.html", server.url).href}`);
console.log(`Issue dumps     ${issueDumpRoot}`);
console.log(`WebRTC signal  ${new URL("webrtc", server.url).href.replace(/^http/, "ws")}`);

process.on("SIGINT", async () => {
  signaling.close();
  await server.close();
  process.exit(0);
});
