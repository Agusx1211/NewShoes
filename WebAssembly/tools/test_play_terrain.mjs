// Verifies impassable terrain works: as both armies advance through the centre
// of the map, no living unit is ever left penetrating an obstacle blob, yet
// units still cross the map and engage (combat occurs). This exercises the
// obstacle collision resolution that lets units manoeuvre around terrain.
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

  const obstacles = await page.evaluate(() => window.__game.obstacles());
  if (!obstacles.length) {
    throw new Error("no terrain obstacles present");
  }

  // Step the auto-battle in chunks; after each chunk, assert no living unit is
  // inside any obstacle (allowing a 1px numerical tolerance).
  let maxPenetration = 0;
  for (let chunk = 0; chunk < 60; ++chunk) {
    const worst = await page.evaluate(() => {
      window.__game.step(0.5);
      let worst = 0;
      for (const u of window.__game.listUnits()) {
        const ur = window.__game.unitRadius(u.kind);
        for (const o of window.__game.obstacles()) {
          const d = Math.hypot(u.x - o.x, u.y - o.y);
          const pen = o.r + ur - d; // >0 means inside
          if (pen > worst) worst = pen;
        }
      }
      return worst;
    });
    if (worst > maxPenetration) maxPenetration = worst;
    if (worst > 1.5) {
      throw new Error(`a unit penetrated an obstacle by ${worst.toFixed(2)}px on chunk ${chunk}`);
    }
    const snap = await page.evaluate(() => window.__game.snapshot());
    if (snap.winner !== null) break;
  }

  const finalSnap = await page.evaluate(() => window.__game.snapshot());
  const startUnits = 20;
  const remaining = finalSnap.playerCount + finalSnap.enemyCount;
  if (remaining >= startUnits) {
    throw new Error(`units never engaged across the terrain (remaining ${remaining})`);
  }
  if (errors.length) {
    throw new Error(`page errors: ${errors.join("; ")}`);
  }

  console.log(JSON.stringify({
    url,
    obstacles: obstacles.length,
    maxPenetrationPx: Number(maxPenetration.toFixed(3)),
    finalSnap,
  }, null, 2));
  await page.close();
} finally {
  await browser.close();
  server.close();
}
