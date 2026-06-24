// Verifies the veterancy mechanic: as the battle plays out, at least one unit
// scores enough kills to be promoted (veteran/elite), and promoted units track
// a higher kill count. This is the Rank-style progression layer.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/public/play.html" : url.pathname;
  const localPath = normalize(join(webRoot, pathname));
  if (!localPath.startsWith(webRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const body = await readFile(localPath);
    response.writeHead(200, { "Content-Type": contentTypes.get(extname(localPath)) ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const { port } = server.address();
const url = `http://127.0.0.1:${port}/public/play.html`;
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1300, height: 980 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__game !== "undefined");
  await page.evaluate(() => window.__game.setPaused(true));

  // Every unit starts green with no kills.
  const startVet = await page.evaluate(() => window.__game.maxVeterancy());
  if (startVet !== 0) {
    throw new Error(`units did not start at green veterancy (got ${startVet})`);
  }

  const result = await page.evaluate(() => {
    let peakVeterancy = 0;
    let peakKills = 0;
    for (let i = 0; i < 1600 && window.__game.snapshot().winner === null; ++i) {
      window.__game.step(8 * (1 / 30));
      const v = window.__game.maxVeterancy();
      if (v > peakVeterancy) peakVeterancy = v;
      for (const u of window.__game.listUnits()) {
        if (u.kills > peakKills) peakKills = u.kills;
      }
      if (peakVeterancy >= 2) break;
    }
    return { peakVeterancy, peakKills, winner: window.__game.snapshot().winner };
  });

  if (result.peakVeterancy < 1) {
    throw new Error(`no unit was ever promoted: ${JSON.stringify(result)}`);
  }
  if (result.peakKills < 2) {
    throw new Error(`kill tracking looks wrong: ${JSON.stringify(result)}`);
  }
  if (errors.length) {
    throw new Error(`page errors: ${errors.join("; ")}`);
  }

  console.log(JSON.stringify({ url, startVeterancy: startVet, ...result }, null, 2));
  await page.close();
} finally {
  await browser.close();
  server.close();
}
