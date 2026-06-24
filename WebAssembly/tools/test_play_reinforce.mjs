// Verifies the reinforcement mechanic: a player can commit a bounded pool of
// extra units, the pool decrements and caps at zero, and the new units join the
// battle. This is the player-agency / production-style subsystem.
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
    const before = { count: window.__game.unitCount(), pool: window.__game.reinforcementsLeft(0) };
    const accepted = [];
    for (let i = 0; i < 7; ++i) {
      accepted.push(window.__game.reinforce(0));
    }
    const after = { count: window.__game.unitCount(), pool: window.__game.reinforcementsLeft(0) };
    return { before, after, accepted };
  });

  if (result.before.pool !== 5 || result.before.count !== 20) {
    throw new Error(`unexpected initial reinforcement state: ${JSON.stringify(result.before)}`);
  }
  // Exactly 5 should be accepted, then the pool is exhausted.
  const acceptedCount = result.accepted.filter(Boolean).length;
  if (acceptedCount !== 5) {
    throw new Error(`expected 5 accepted reinforcements, got ${acceptedCount}: ${JSON.stringify(result.accepted)}`);
  }
  if (result.after.count !== 25 || result.after.pool !== 0) {
    throw new Error(`reinforcements did not apply/cap correctly: ${JSON.stringify(result.after)}`);
  }
  if (result.accepted[5] !== false || result.accepted[6] !== false) {
    throw new Error(`over-cap reinforcements were not rejected: ${JSON.stringify(result.accepted)}`);
  }

  // The reinforced army must still drive the battle to a decisive end.
  const final = await page.evaluate(() => {
    for (let i = 0; i < 1600 && window.__game.snapshot().winner === null; ++i) {
      window.__game.step(8 * (1 / 30));
    }
    return window.__game.snapshot();
  });
  if (final.winner === null) {
    throw new Error(`reinforced battle did not resolve: ${JSON.stringify(final)}`);
  }
  if (errors.length) {
    throw new Error(`page errors: ${errors.join("; ")}`);
  }

  console.log(JSON.stringify({ url, ...result, final }, null, 2));
  await page.close();
} finally {
  await browser.close();
  server.close();
}
