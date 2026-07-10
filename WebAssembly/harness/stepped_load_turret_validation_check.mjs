// Regression check: stepped map loading must preserve the GameLogic-update
// context that W3DModelDraw/ModelConditionInfo validation requires.
//
// Bug history (2026-07-10): GameLogic::advanceLoadSession() advanced later
// load slices from GameEngine::update(), outside GameLogic::update(), so
// isInGameLogicUpdate() was FALSE during them and validateTurretInfo /
// validateWeaponBarrelInfo / validateStuffForTimeAndWeather refused to run
// for map-placed objects created in those slices. Their model states
// permanently lacked TURRETS_VALID/BARRELS_VALID: shellmap battleship guns
// never rotated and default-visible muzzle-flash meshes were never hidden.
// Fixed by latching m_isInUpdate inside advanceLoadSession().
//
// This check boots the real engine through the DEFAULT stepped load into the
// shellmap and asserts that AmericaVehicleBattleShip — a map-placed vehicle
// configured with two turrets and six barrels — finishes load with its
// turret/barrel metadata resolved (the anim report only emits those sections
// when TURRETS_VALID/BARRELS_VALID are set).
//
// Runtime: one full SwiftShader boot (~4-6 min). Run via
//   npm run verify:stepped-load-validation
// after `npm run build:port`.
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });

const SHIP_TEMPLATE = "AmericaVehicleBattleShip";
const SAMPLE_ATTEMPTS = 120;
const SAMPLE_INTERVAL_MS = 1000;

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // threads=0: this check exercises the LEGACY stepped-load path on the play
  // page explicitly (stays correct when the prepared threaded-by-default flip
  // lands on the play page).
  const url = new URL("harness/play.html?autostart=1&diag=lite&threads=0&dist=dist", server.url);
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
  console.log("navigated; waiting for stepped-load boot (SwiftShader, up to 10 min)");
  await page.waitForSelector("#overlay.hidden", { state: "attached", timeout: 600_000 });
  console.log("booted; sampling anim report for battleship turret/barrel validity");

  let sawShip = false;
  let validated = null;
  for (let i = 0; i < SAMPLE_ATTEMPTS && !validated; i += 1) {
    const ships = await page.evaluate(async (tmpl) => {
      const r = await window.CnCPort.rpc("realEngineAnimReport", { maxEntries: 48 });
      const rep = r?.report ?? r ?? {};
      return (rep.drawables ?? []).filter((e) => e.tmpl === tmpl)
        .map((e) => ({ oid: e.oid, turrets: (e.turrets ?? []).length, barrels: (e.barrels ?? []).length }));
    }, SHIP_TEMPLATE);
    if (ships.length) {
      sawShip = true;
      validated = ships.find((s) => s.turrets > 0 && s.barrels > 0) ?? null;
      if (i % 10 === 0 || validated) {
        console.log(`sample ${i}: ships=${ships.length}`, JSON.stringify(ships.slice(0, 2)));
      }
    }
    if (!validated) {
      await new Promise((r) => setTimeout(r, SAMPLE_INTERVAL_MS));
    }
  }

  assert.ok(sawShip, `never saw a ${SHIP_TEMPLATE} drawable in the anim report — shellmap did not reach the battleship sequence`);
  assert.ok(
    validated,
    `${SHIP_TEMPLATE} present but its turret/barrel metadata never validated (no turrets[]/barrels[] sections) — ` +
    "map-placed objects created in stepped load slices are missing TURRETS_VALID/BARRELS_VALID again " +
    "(check the m_isInUpdate latch in GameLogic::advanceLoadSession)");
  console.log(`PASS: ${SHIP_TEMPLATE} oid${validated.oid} validated with ${validated.turrets} turret slot(s) and ${validated.barrels} barrel record(s) after default stepped load`);
} finally {
  await browser.close().catch(() => {});
  await server.close?.();
}
