import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startNostrTestRelayServer } from "./nostr-test-relay-server.mjs";
import { startStaticServer } from "./static-server.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const shotDir = process.env.LAUNCHER_GAMES_SHOTS || "/tmp/cnc-launcher-games";
await mkdir(shotDir, { recursive: true });
const server = await startStaticServer({ root: wasmRoot });
const relay = await startNostrTestRelayServer();
const browser = await chromium.launch({ headless: true });

async function pageWithErrors(context, label, errors) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`${label}: ${error.message}`));
  await page.goto(new URL("harness/play.html", server.url).href, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.ZeroHGames?.specs?.length === 10);
  return page;
}

async function pointerDrag(page, source, target) {
  const [from, to] = await Promise.all([source.boundingBox(), target.boundingBox()]);
  assert.ok(from && to, "drag source and target must be visible");
  await page.mouse.move(from.x + from.width / 2, from.y + Math.min(18, from.height / 2));
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

try {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
  const page = await pageWithErrors(context, "local", errors);

  await page.evaluate(() => window.ZeroHDesktop.openApp("games"));
  await page.waitForSelector("#gamesWindow.is-open");
  assert.equal(await page.locator(".games-folder-item").count(), 10);
  assert.equal(await page.locator('.window[data-app="arcade"], [data-open="arcade"], #i-arcade').count(), 0);
  assert.equal(await page.locator(".xp-game-window").count(), 10);
  assert.deepEqual(await page.locator(".games-folder-item strong").allTextContents(), [
    "Solitaire", "Spider Solitaire", "FreeCell", "Hearts", "Minesweeper",
    "Internet Backgammon", "Internet Checkers", "Internet Hearts", "Internet Reversi", "Internet Spades",
  ]);
  await page.screenshot({ path: resolve(shotDir, "games-folder.png") });

  await page.evaluate(() => window.ZeroHDesktop.openApp("solitaire"));
  const soundButton = page.locator("#solitaireWindow [data-game-sound]");
  assert.equal(await soundButton.getAttribute("aria-pressed"), "true");
  await soundButton.click();
  assert.equal(await soundButton.getAttribute("aria-pressed"), "false");
  await soundButton.click();
  assert.equal(await soundButton.getAttribute("aria-pressed"), "true");

  for (const id of await page.evaluate(() => window.ZeroHGames.specs.map((spec) => spec.id))) {
    await page.evaluate((appId) => window.ZeroHDesktop.openApp(appId), id);
    const fit = await page.locator(`#${id}Window [data-game-board]`).evaluate((board) => ({
      horizontal: board.scrollWidth <= board.clientWidth + 1,
      vertical: board.scrollHeight <= board.clientHeight + 1,
    }));
    assert.deepEqual(fit, { horizontal: true, vertical: true }, `${id} must fit its default XP window`);
  }

  const cardBackResponse = await page.request.get(new URL("harness/assets/games/card-back-war.webp", server.url).href);
  assert.equal(cardBackResponse.status(), 200);
  assert.match(cardBackResponse.headers()["content-type"] || "", /^image\/webp/);

  await page.evaluate(() => window.ZeroHDesktop.openApp("solitaire"));
  const stockBefore = await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").stock.length);
  await page.locator("#solitaireWindow [data-stock] button").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").stock.length), stockBefore - 3);
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").waste.length), 3);
  assert.ok(await page.locator("#solitaireWindow .war-card.is-draggable").count() > 0);
  await page.locator("#solitaireWindow [data-game-difficulty]").selectOption("easy");
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").difficulty), "easy");
  const easyStock = await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").stock.length);
  await page.locator("#solitaireWindow [data-stock] button").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").stock.length), easyStock - 1);
  assert.match(await page.locator("#solitaireWindow .war-card.is-back").first().evaluate((card) => getComputedStyle(card).backgroundImage), /card-back-war\.webp/);
  await page.screenshot({ path: resolve(shotDir, "solitaire-supply-drop.png") });

  await page.evaluate(() => window.ZeroHDesktop.openApp("spider"));
  assert.equal(await page.evaluate(() => new Set([
    ...window.ZeroHGames.snapshot("spider").stock,
    ...window.ZeroHGames.snapshot("spider").tableau.flat(),
  ].map((card) => card.suit)).size), 2);
  await page.locator("#spiderWindow [data-game-difficulty]").selectOption("hard");
  assert.equal(await page.evaluate(() => new Set([
    ...window.ZeroHGames.snapshot("spider").stock,
    ...window.ZeroHGames.snapshot("spider").tableau.flat(),
  ].map((card) => card.suit)).size), 4);
  assert.equal(await page.locator("#spiderWindow .war-card.is-draggable").count(), 10);
  const spiderStock = await page.evaluate(() => window.ZeroHGames.snapshot("spider").stock.length);
  await page.locator("#spiderWindow [data-spider-deal]").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("spider").stock.length), spiderStock - 10);
  await page.screenshot({ path: resolve(shotDir, "spider-veteran-four-suit.png") });

  await page.evaluate(() => window.ZeroHDesktop.openApp("freecell"));
  await page.locator("#freecellWindow [data-game-difficulty]").selectOption("easy");
  const freeCard = page.locator("#freecellWindow .card-column").first().locator(".war-card").last();
  await pointerDrag(page, freeCard, page.locator("#freecellWindow .free-cell-slot").first());
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("freecell").freeCells.filter(Boolean).length), 1);
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame)));
  assert.ok(await page.locator("#freecellWindow [data-game-board]").evaluate((board) => board.getAnimations({ subtree: true }).length) > 0,
    "dragged cards must animate between piles");
  await page.screenshot({ path: resolve(shotDir, "freecell-drag-drop.png") });

  await page.evaluate(() => window.ZeroHDesktop.openApp("hearts"));
  await page.locator("#heartsWindow [data-game-difficulty]").selectOption("hard");
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("hearts").difficulty), "hard");
  const heartsHand = page.locator("#heartsWindow .trick-hand .war-card");
  for (let index = 0; index < 3; ++index) await heartsHand.nth(index).click();
  await page.locator("#heartsWindow .trick-orders button").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("hearts").phase), "play");
  const heartsBeforePlay = await page.evaluate(() => window.ZeroHGames.snapshot("hearts").hands[0].length);
  await pointerDrag(page, page.locator("#heartsWindow .trick-hand .war-card:not(:disabled)").first(), page.locator("#heartsWindow .trick-center"));
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("hearts").hands[0].length), heartsBeforePlay - 1);
  await page.screenshot({ path: resolve(shotDir, "hearts-veteran-drag-play.png") });

  await page.evaluate(() => window.ZeroHDesktop.openApp("minesweeper"));
  for (const [difficulty, cells] of [["easy", 81], ["normal", 256], ["hard", 480]]) {
    await page.locator("#minesweeperWindow [data-game-difficulty]").selectOption(difficulty);
    assert.equal(await page.locator("#minesweeperWindow .mine-cell").count(), cells);
  }
  await page.locator("#minesweeperWindow .mine-cell").first().click();
  const mineState = await page.evaluate(() => window.ZeroHGames.snapshot("minesweeper"));
  assert.equal(mineState.cells[0].mine, false, "the first inspected sector must be safe");
  assert.ok(mineState.cells.some((cell) => cell.revealed));
  await page.screenshot({ path: resolve(shotDir, "minesweeper-demining-detail.png") });

  for (const [id, selector, count] of [
    ["backgammon", ".bg-point", 24],
    ["checkers", ".checker-piece", 24],
    ["internethearts", ".trick-hand .war-card", 13],
    ["reversi", ".reversi-square span", 4],
    ["spades", ".trick-hand .war-card", 13],
  ]) {
    await page.evaluate((appId) => window.ZeroHDesktop.openApp(appId), id);
    assert.equal(await page.locator(`#${id}Window ${selector}`).count(), count, `${id} must render its complete opening position`);
    if (id === "backgammon") await page.screenshot({ path: resolve(shotDir, "internet-backgammon.png") });
  }

  async function hostSolo(id) {
    await page.evaluate(({ appId, relayUrl }) => window.ZeroHGames.connectInternet(appId, {
      role: "host", room: `solo-${appId}`, name: "SoloGeneral", relayUrls: [relayUrl],
    }), { appId: id, relayUrl: relay.url });
    await page.evaluate((appId) => window.ZeroHDesktop.openApp(appId), id);
  }

  await hostSolo("backgammon");
  await page.locator("#backgammonWindow .bg-point.is-selectable").first().click();
  await page.locator("#backgammonWindow .bg-point.is-destination").first().click();
  assert.ok(await page.evaluate(() => window.ZeroHGames.snapshot("backgammon").moves) > 0);
  await page.evaluate(() => window.ZeroHGames.disconnectInternet("backgammon"));

  await hostSolo("checkers");
  await page.locator("#checkersWindow [data-game-difficulty]").selectOption("hard");
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("checkers").difficulty), "hard");
  await page.locator("#checkersWindow .checker-piece.is-movable").first().click();
  await page.locator("#checkersWindow .checkers-square.is-destination").first().click();
  assert.ok(await page.evaluate(() => window.ZeroHGames.snapshot("checkers").moves) > 0);
  await page.evaluate(() => window.ZeroHGames.disconnectInternet("checkers"));

  await hostSolo("internethearts");
  const internetHeartsHand = page.locator("#internetheartsWindow .trick-hand .war-card");
  for (let index = 0; index < 3; ++index) await internetHeartsHand.nth(index).click();
  await page.locator("#internetheartsWindow .trick-orders button").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("internethearts").phase), "play");
  await page.evaluate(() => window.ZeroHGames.disconnectInternet("internethearts"));

  await hostSolo("spades");
  await page.locator("#spadesWindow .trick-orders button").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("spades").phase), "play");
  await page.evaluate(() => window.ZeroHGames.disconnectInternet("spades"));

  const host = await pageWithErrors(context, "host", errors);
  const joiner = await pageWithErrors(context, "joiner", errors);
  const room = `launcher-games-${Date.now()}`;
  await host.evaluate(({ roomName, relayUrl }) => window.ZeroHGames.connectInternet("reversi", {
    role: "host", room: roomName, name: "RedTankA1", relayUrls: [relayUrl],
  }), { roomName: room, relayUrl: relay.url });
  await joiner.evaluate(({ roomName, relayUrl }) => window.ZeroHGames.connectInternet("reversi", {
    role: "join", room: roomName, name: "BlueTankB2", relayUrls: [relayUrl],
  }), { roomName: room, relayUrl: relay.url });
  await joiner.waitForFunction(() => window.ZeroHGames.networkSnapshot("reversi")?.localSeat === 1, null, { timeout: 20_000 });
  await host.waitForFunction(() => window.ZeroHGames.networkSnapshot("reversi")?.network?.openPeers === 1, null, { timeout: 20_000 });

  const networkState = await host.evaluate(() => window.ZeroHGames.networkSnapshot("reversi").network);
  assert.equal(networkState.discoveryStrategy, "trystero-nostr");
  assert.equal(networkState.signalingTransport, "Trystero decentralized Nostr discovery/ICE");
  assert.equal(networkState.relayTransport, false);
  assert.equal(networkState.peers[0].channelLabel, "cnc-udp-v1");
  assert.equal(networkState.peers[0].channelProtocol, "cnc-generals-udp-v1");

  await host.evaluate(() => window.ZeroHDesktop.openApp("reversi"));
  await joiner.evaluate(() => window.ZeroHDesktop.openApp("reversi"));
  await host.locator("#reversiWindow [data-game-difficulty]").selectOption("hard");
  await joiner.waitForFunction(() => window.ZeroHGames.snapshot("reversi").difficulty === "hard");
  assert.equal(await joiner.locator("#reversiWindow [data-game-difficulty]").inputValue(), "hard");
  assert.equal(await joiner.locator("#reversiWindow [data-game-difficulty]").isDisabled(), true);
  await host.locator("#reversiWindow .reversi-square.is-legal").first().click();
  await joiner.waitForFunction(() => window.ZeroHGames.snapshot("reversi").moves === 1);
  const [hostGame, joinerGame] = await Promise.all([
    host.evaluate(() => window.ZeroHGames.snapshot("reversi")),
    joiner.evaluate(() => window.ZeroHGames.snapshot("reversi")),
  ]);
  assert.deepEqual(joinerGame.board, hostGame.board, "host-authoritative state must arrive over the reused endpoint");
  assert.equal(joinerGame.turn, 1);
  await joiner.screenshot({ path: resolve(shotDir, "internet-reversi-p2p.png") });
  await joiner.evaluate(() => window.ZeroHGames.disconnectInternet("reversi"));
  await host.waitForFunction(() => window.ZeroHGames.snapshot("reversi").moves > 1, null, { timeout: 20_000 });
  assert.ok(await host.evaluate(() => window.ZeroHGames.snapshot("reversi").moves) > hostGame.moves,
    "a bot must assume a disconnected commander's seat without resetting the match");

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    ok: true,
    games: 10,
    internetGames: 5,
    signaling: networkState.discoveryStrategy,
    dataChannel: `${networkState.peers[0].channelLabel}/${networkState.peers[0].channelProtocol}`,
    synchronizedReversiMoves: joinerGame.moves,
    screenshots: shotDir,
  }, null, 2));
} finally {
  await browser.close();
  await relay.close();
  await server.close();
}
