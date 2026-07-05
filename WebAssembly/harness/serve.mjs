import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "127.0.0.1";
const issueDumpRoot = resolve(wasmRoot, "artifacts/issue-dumps");
const server = await startStaticServer({ root: wasmRoot, port, host, issueDumpRoot });

console.log(`Harness serving ${new URL("harness/index.html", server.url).href}`);
console.log(`Playable page   ${new URL("harness/play.html", server.url).href}`);
console.log(`Issue dumps     ${issueDumpRoot}`);

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
