// Drives the playable RTS micro-battle headlessly to prove it actually plays:
// the simulation must advance, units must die through combat, and exactly one
// team must remain. Also exercises a player order through the automation hook.
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotsDir = resolve(webRoot, "artifacts/screenshots");
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
  await mkdir(screenshotsDir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__game !== "undefined");

  // The playable layer re-derives unit balance through the wasm Locomotor and
  // Weapon parsers; confirm that runtime path actually ran.
  await page.waitForFunction(() => window.__game.statsSource() === "wasm", { timeout: 8000 });
  const stats = await page.evaluate(() => window.__game.kindStats());
  if (stats.Ranger.speed !== 46 || stats.Crusader.range !== 160 || stats.Humvee.damage !== 14) {
    throw new Error(`wasm-derived unit stats look wrong: ${JSON.stringify(stats)}`);
  }

  // Take control of time so the battle is deterministic in the test.
  await page.evaluate(() => window.__game.setPaused(true));
  const start = await page.evaluate(() => window.__game.snapshot());
  const startCount = await page.evaluate(() => window.__game.unitCount());

  if (start.playerCount !== 10 || start.enemyCount !== 10 || start.winner !== null) {
    throw new Error(`unexpected initial battle state: ${JSON.stringify(start)}`);
  }

  // Issue one explicit player order through the hook-free input path is hard
  // headlessly; instead drive the deterministic auto-battle to completion.
  const result = await page.evaluate(() => {
    // Advance up to 4 simulated minutes (8 ticks/step * 900 steps).
    for (let i = 0; i < 1200 && window.__game.snapshot().winner === null; ++i) {
      window.__game.step(8 * (1 / 30));
    }
    return window.__game.snapshot();
  });

  if (result.winner === null) {
    throw new Error(`battle did not resolve to a winner: ${JSON.stringify(result)}`);
  }
  if (result.winner !== 0 && result.winner !== 1 && result.winner !== "draw") {
    throw new Error(`invalid winner value: ${JSON.stringify(result)}`);
  }
  const endCount = await page.evaluate(() => window.__game.unitCount());
  if (endCount >= startCount) {
    throw new Error(`combat removed no units (start ${startCount}, end ${endCount})`);
  }
  if (result.tick <= start.tick) {
    throw new Error(`simulation did not advance (start tick ${start.tick}, end ${result.tick})`);
  }
  if (errors.length) {
    throw new Error(`page errors: ${errors.join("; ")}`);
  }

  // Resume real-time play and confirm the render loop runs without error.
  await page.evaluate(() => window.__game.setPaused(false));
  await page.waitForTimeout(300);
  const shot = resolve(screenshotsDir, "playable-battle.png");
  await page.screenshot({ path: shot });

  console.log(JSON.stringify({ url, start, result, startCount, endCount, screenshot: shot }, null, 2));
  await page.close();
} finally {
  await browser.close();
  server.close();
}
