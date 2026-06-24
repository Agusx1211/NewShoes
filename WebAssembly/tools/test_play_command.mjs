// Verifies army-wide command: "Select army" selects every mobile player unit,
// and "Rally" orders the whole selection to assault the enemy command center,
// after which those units actually close on the enemy base.
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

  const result = await page.evaluate(() => {
    const playerMobile = window.__game.listUnits().filter((u) => u.team === 0 && u.kind !== "Base").length;
    const selected = window.__game.selectAll();
    const ordered = window.__game.rallyAll();
    const enemyBase = window.__game.listUnits().find((u) => u.team === 1 && u.kind === "Base");
    const avgDistBefore = window.__game
      .listUnits()
      .filter((u) => u.team === 0 && u.kind !== "Base")
      .reduce((s, u) => s + Math.hypot(enemyBase.x - u.x, enemyBase.y - u.y), 0) / playerMobile;
    // Advance and measure how much the army closed on the enemy base.
    window.__game.step(3.0);
    const survivors = window.__game.listUnits().filter((u) => u.team === 0 && u.kind !== "Base");
    const avgDistAfter = survivors.reduce((s, u) => s + Math.hypot(enemyBase.x - u.x, enemyBase.y - u.y), 0) / Math.max(1, survivors.length);
    const allOrdered = survivors.every((u) => u.order !== null);
    return { playerMobile, selected, ordered, avgDistBefore, avgDistAfter, allOrdered, survivors: survivors.length };
  });

  if (result.selected !== result.playerMobile || result.selected < 1) {
    throw new Error(`select-army did not select the whole army: ${JSON.stringify(result)}`);
  }
  if (result.ordered !== result.playerMobile) {
    throw new Error(`rally did not order the whole army: ${JSON.stringify(result)}`);
  }
  if (result.avgDistAfter >= result.avgDistBefore - 30) {
    throw new Error(`rallied army did not advance on the enemy base: ${JSON.stringify(result)}`);
  }
  if (errors.length) {
    throw new Error(`page errors: ${errors.join("; ")}`);
  }

  console.log(JSON.stringify({
    url,
    army: result.playerMobile,
    selected: result.selected,
    ordered: result.ordered,
    advancedPx: Math.round(result.avgDistBefore - result.avgDistAfter),
    allOrdered: result.allOrdered,
  }, null, 2));
  await page.close();
} finally {
  await browser.close();
  server.close();
}
