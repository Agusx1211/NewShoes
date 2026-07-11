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
// The play page is threaded-only (2026-07-10, legacy path deleted): this
// check now guards the SHIPPING stepped-load path — the load session drains
// inside the engine-thread frame loop, where advanceLoadSession and the
// m_isInUpdate latch run identically. realEngineAnimReport is threaded-routed.
//
// Runtime: one full SwiftShader boot. Run via
//   npm run verify:stepped-load-validation
// after `npm run build:port:threaded:release`.
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, rm } from "node:fs/promises";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const server = await startStaticServer({ root: wasmRoot, port: 0, host: "127.0.0.1" });
// PERSISTENT context (fresh profile per run): ephemeral chromium.launch()
// contexts back OPFS with an in-memory filesystem capped at ~1.25GiB on this
// box — smaller than the archive set the threaded page streams to OPFS.
const profileDir = resolve(wasmRoot, "artifacts/pw-profiles/stepped-load-validation");
await rm(profileDir, { recursive: true, force: true });
await mkdir(profileDir, { recursive: true });
const browser = await chromium.launchPersistentContext(profileDir, {
  viewport: { width: 1280, height: 800 },
  args: ["--autoplay-policy=no-user-gesture-required"],
});

const SHIP_TEMPLATE = "AmericaVehicleBattleShip";
const SAMPLE_ATTEMPTS = 120;
const SAMPLE_INTERVAL_MS = 1000;

try {
  const page = await browser.newPage();
  const url = new URL("harness/play.html?autostart=1&diag=lite", server.url);
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
  // The profile holds a multi-GB OPFS archive copy; never leak it (a leaked
  // profile starves the next run's OPFS writes into silent mount stalls).
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
