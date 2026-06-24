// Proves the battle is genuinely human-controllable: it drives real mouse
// events through Playwright to select a player unit and issue a move order to a
// far corner, then verifies the unit actually obeys (moves toward the commanded
// point) rather than only auto-engaging.
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
  const page = await browser.newPage({ viewport: { width: 1320, height: 980 } });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__game !== "undefined");

  // Freeze the clock so only our commanded movement happens.
  await page.evaluate(() => window.__game.setPaused(true));

  const box = await page.evaluate(() => {
    const c = document.querySelector("[data-play-canvas]");
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, w: window.__game.world.w, h: window.__game.world.h };
  });
  const toScreen = (wx, wy) => ({
    x: box.left + (wx / box.w) * box.width,
    y: box.top + (wy / box.h) * box.height,
  });

  // Pick a player unit and a far destination corner away from it.
  const unit = await page.evaluate(() => window.__game.listUnits().find((u) => u.team === 0));
  if (!unit) {
    throw new Error("no player unit to control");
  }
  const dest = { x: box.w - 80, y: box.h - 80 };
  const distBefore = Math.hypot(dest.x - unit.x, dest.y - unit.y);

  // Left-click the unit to select it.
  const sel = toScreen(unit.x, unit.y);
  await page.mouse.click(sel.x, sel.y, { button: "left" });
  const selectionSize = await page.evaluate(() => window.__game.selectionSize());
  if (selectionSize < 1) {
    throw new Error(`left-click did not select a unit (selection ${selectionSize})`);
  }

  // Right-click the far corner to issue a move order.
  const dst = toScreen(dest.x, dest.y);
  await page.mouse.click(dst.x, dst.y, { button: "right" });

  // Advance ~2.5s of simulation and confirm the unit moved toward the order.
  await page.evaluate(() => window.__game.step(2.5));
  const after = await page.evaluate((id) => window.__game.unit(id), unit.id);
  if (!after) {
    throw new Error("commanded unit vanished");
  }
  const distAfter = Math.hypot(dest.x - after.x, dest.y - after.y);
  const moved = Math.hypot(after.x - unit.x, after.y - unit.y);

  if (moved < 20) {
    throw new Error(`commanded unit did not move (moved ${moved.toFixed(1)}px)`);
  }
  if (distAfter >= distBefore - 20) {
    throw new Error(`unit did not move toward the order (before ${distBefore.toFixed(1)}, after ${distAfter.toFixed(1)})`);
  }
  if (errors.length) {
    throw new Error(`page errors: ${errors.join("; ")}`);
  }

  console.log(JSON.stringify({
    url,
    controlledUnit: unit.id,
    selectionSize,
    movedPx: Math.round(moved),
    distanceToOrderBefore: Math.round(distBefore),
    distanceToOrderAfter: Math.round(distAfter),
    obeyedOrder: after.order,
  }, null, 2));
  await page.close();
} finally {
  await browser.close();
  server.close();
}
