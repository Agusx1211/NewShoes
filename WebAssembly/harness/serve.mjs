import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_HTTPS_PORT, startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "127.0.0.1";
const issueDumpRoot = resolve(wasmRoot, "artifacts/issue-dumps");
const certDir = resolve(harnessRoot, ".certs");

// HTTPS listener. The play page's threaded default needs SharedArrayBuffer,
// which Chrome only grants on trustworthy origins — plain http:// over a LAN
// IP does not qualify, and there is NO legacy single-thread fallback (owner
// directive 2026-07-10): insecure origins redirect to this listener instead.
//   HTTPS_PORT=<port>  force a specific port
//   HTTPS_PORT=0       disable the HTTPS listener
//   unset              default to 8443 whenever the server is reachable
//                      beyond localhost, or a cert already exists (the
//                      persistent self-signed cert in harness/.certs keeps
//                      the browser trust decision sticky across restarts —
//                      never delete/regenerate it casually, and never rsync
//                      one box's .certs over another's).
const hostIsLocalhostOnly = host === "127.0.0.1" || host === "localhost" || host === "::1";
const httpsPortEnv = process.env.HTTPS_PORT;
let httpsPort = null;
if (httpsPortEnv !== undefined && httpsPortEnv !== "") {
  const parsed = Number(httpsPortEnv);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid HTTPS_PORT: ${httpsPortEnv}`);
  }
  httpsPort = parsed > 0 ? parsed : null;
} else if (!hostIsLocalhostOnly || existsSync(resolve(certDir, "cert.pem"))) {
  httpsPort = DEFAULT_HTTPS_PORT;
}

const server = await startStaticServer({ root: wasmRoot, port, host, issueDumpRoot, httpsPort, certDir });

console.log(`Harness serving ${new URL("harness/index.html", server.url).href}`);
console.log(`Playable page   ${new URL("harness/play.html", server.url).href}`);
if (server.httpsUrl) {
  console.log(`HTTPS play page ${new URL("harness/play.html", server.httpsUrl).href}`);
  console.log(`HTTPS cert      ${server.certPath} (self-signed; trust once per device)`);
}
console.log(`Issue dumps     ${issueDumpRoot}`);

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
