import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8080);
const server = await startStaticServer({ root: harnessRoot, port });

console.log(`Harness serving ${server.url}`);

process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});
