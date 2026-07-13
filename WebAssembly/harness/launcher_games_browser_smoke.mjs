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

  const cardBackResponse = await page.request.get(new URL("harness/assets/games/card-back-war.webp", server.url).href);
  assert.equal(cardBackResponse.status(), 200);
  assert.match(cardBackResponse.headers()["content-type"] || "", /^image\/webp/);

  await page.evaluate(() => window.ZeroHDesktop.openApp("solitaire"));
  const stockBefore = await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").stock.length);
  await page.locator("#solitaireWindow [data-stock] button").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").stock.length), stockBefore - 1);
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("solitaire").waste.length), 1);
  assert.match(await page.locator("#solitaireWindow .war-card.is-back").first().evaluate((card) => getComputedStyle(card).backgroundImage), /card-back-war\.webp/);
  await page.screenshot({ path: resolve(shotDir, "solitaire-supply-drop.png") });

  await page.evaluate(() => window.ZeroHDesktop.openApp("spider"));
  const spiderStock = await page.evaluate(() => window.ZeroHGames.snapshot("spider").stock.length);
  await page.locator("#spiderWindow [data-spider-deal]").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("spider").stock.length), spiderStock - 10);

  await page.evaluate(() => window.ZeroHDesktop.openApp("freecell"));
  await page.locator("#freecellWindow .card-column").first().locator(".war-card").last().click();
  await page.locator("#freecellWindow .free-cell-slot").first().click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("freecell").freeCells.filter(Boolean).length), 1);

  await page.evaluate(() => window.ZeroHDesktop.openApp("hearts"));
  const heartsHand = page.locator("#heartsWindow .trick-hand .war-card");
  for (let index = 0; index < 3; ++index) await heartsHand.nth(index).click();
  await page.locator("#heartsWindow .trick-orders button").click();
  assert.equal(await page.evaluate(() => window.ZeroHGames.snapshot("hearts").phase), "play");

  await page.evaluate(() => window.ZeroHDesktop.openApp("minesweeper"));
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
