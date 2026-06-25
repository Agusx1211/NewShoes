import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const port = Number(process.env.PORT ?? 8080);
const server = await startStaticServer({ root: wasmRoot, port });

console.log(`Harness serving ${new URL("harness/index.html", server.url).href}`);

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
