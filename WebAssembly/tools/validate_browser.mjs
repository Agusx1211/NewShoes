import { createServer } from "node:http";
import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotsDir = resolve(webRoot, "artifacts/screenshots");
const realBigPaths = [
  resolve(webRoot, "artifacts/real-assets/INIZH.big"),
  resolve(webRoot, "artifacts/real-assets/Gensec.big"),
];

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/public/index.html" : url.pathname;
  const localPath = normalize(join(webRoot, pathname));

  if (!localPath.startsWith(webRoot)) {
    return null;
  }

  return localPath;
}

const server = createServer(async (request, response) => {
  const localPath = resolveRequestPath(request.url ?? "/");

  if (!localPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(localPath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(extname(localPath)) ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolveListen) => {
  server.listen(0, "127.0.0.1", resolveListen);
});

const address = server.address();
const url = `http://127.0.0.1:${address.port}/public/index.html`;
const browser = await chromium.launch();
let realAsset = null;

try {
  for (const realBigPath of realBigPaths) {
    try {
      await access(realBigPath);
      realAsset = realBigPath;
      break;
    } catch {
      realAsset = null;
    }
  }
} catch {
  realAsset = null;
}

try {
  const viewports = [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const captures = [];
  await mkdir(screenshotsDir, { recursive: true });

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(url);
    await page.waitForSelector('body[data-validation="pass"]', { timeout: 10000 });
    if (realAsset) {
      const expectedFirstFile = realAsset.endsWith("INIZH.big") ? "data/ini/armor.ini" : "generalsb.sec";
      const expectedIniFirst = realAsset.endsWith("INIZH.big") ? "data/ini/armor.ini: Armor NoArmor" : "no ini: empty";
      const expectedGameDataFirst = realAsset.endsWith("INIZH.big")
        ? "GameData: Maps\\ShellMapMD\\ShellMapMD.map, 30 FPS, cash 10000"
        : "no game data";
      const expectedAIDataFirst = realAsset.endsWith("INIZH.big")
        ? "AIData: America -> AmericaPatriotBattery, 18 structures, 168 sciences"
        : "no AI data";
      const expectedMappedImageFirst = realAsset.endsWith("INIZH.big")
        ? "MappedImages: LoadPageHuge -> loadpageuserinterface.tga, 1231 images, 117 pages"
        : "no mapped image data";
      const expectedEnvironmentFirst = realAsset.endsWith("INIZH.big")
        ? "Environment: MORNING -> TSWater.tga, 4 water sets, snow off"
        : "no environment data";
      const expectedVideoFirst = realAsset.endsWith("INIZH.big")
        ? "Video: Sizzle -> sizzle_review, 41 videos, 82 fields"
        : "no video data";
      const expectedMultiplayerFirst = realAsset.endsWith("INIZH.big")
        ? "Multiplayer: 8 colors, default $10000, shroud off"
        : "no multiplayer data";
      const expectedGameLodFirst = realAsset.endsWith("INIZH.big")
        ? "GameLOD: High static -> 3000 particles, dynamic VeryHigh at 25 FPS"
        : "no game LOD data";
      const expectedArmorFirst = realAsset.endsWith("INIZH.big") ? "data/ini/armor.ini: NoArmor (5 assignments)" : "no armor data";
      const expectedWeaponFirst = realAsset.endsWith("INIZH.big") ? "data/ini/weapon.ini: MarauderTankGun (ARMOR_PIERCING)" : "no weapon data";
      const expectedLocomotorFirst = realAsset.endsWith("INIZH.big")
        ? "data/ini/locomotor.ini: BasicHumanLocomotor GROUND RUBBLE, speed 20, TWO_LEGS"
        : "no locomotor data";
      const expectedFxListFirst = realAsset.endsWith("INIZH.big")
        ? "data/ini/fxlist.ini: WeaponFX_ToxinShellWeapon -> ParticleSystem ToxicShellExplosion"
        : "no FX list data";
      const expectedParticleFirst = realAsset.endsWith("INIZH.big")
        ? "data/ini/particlesystem.ini: TsingMaTrailSmoke -> EXSmokNew1.tga, ALPHA/PARTICLE"
        : "no particle system data";
      const expectedAudioFirst = realAsset.endsWith("INIZH.big")
        ? "Audio: GenericTankMoveLoop -> vgenlo2a vgenlo2b vgenlo2c, LOW"
        : "no audio data";
      const expectedMiscAudioFirst = realAsset.endsWith("INIZH.big")
        ? "MiscAudio: SabotageShutDownBuilding -> SabotageBuildingPower, 34 hooks"
        : "no miscellaneous audio data";
      const expectedDamageFxFirst = realAsset.endsWith("INIZH.big")
        ? "DamageFX: TankDamageFX -> FX_DamageTankStruck/FX_DamageTankStruck, amount 2"
        : "no damage FX data";
      const expectedCrateFirst = realAsset.endsWith("INIZH.big")
        ? "CrateData: SalvageCrateData -> SalvageCrate 100%, SCIENCE_GLA/SALVAGER"
        : "no crate data";
      const expectedOclFirst = realAsset.endsWith("INIZH.big")
        ? "data/ini/objectcreationlist.ini: OCL_CreateDamagedBarrel -> CreateDebris PMBarrel01_D1"
        : "no object creation list data";
      const expectedThingFirst = realAsset.endsWith("INIZH.big")
        ? "data/ini/object/americavehicle.ini: AmericaVehicleHumvee -> HumveeGun / HumveeArmor, needs AmericaWarFactory"
        : "no object data";
      const expectedCommandFirst = realAsset.endsWith("INIZH.big")
        ? "AmericaDozerCommandSet: 1 Command_ConstructAmericaPowerPlant -> AmericaPowerPlant"
        : "no command data";
      const expectedProgressionFirst = realAsset.endsWith("INIZH.big")
        ? "SuperweaponDaisyCutter -> SCIENCE_DaisyCutter (1 point)"
        : "no progression data";
      const expectedPlayerFirst = realAsset.endsWith("INIZH.big")
        ? "FactionAmerica: America/USA, starts AmericaCommandCenter + AmericaVehicleDozer"
        : "no player data";
      const expectedTerrainFirst = realAsset.endsWith("INIZH.big")
        ? "AsphaltType1: ASPHALT, TXAsph01a.tga"
        : "no terrain data";
      const expectedControlBarFirst = realAsset.endsWith("INIZH.big")
        ? "America8x6: America, 800x600, hud SALogo"
        : "no control bar data";
      const expectedRoadsFirst = realAsset.endsWith("INIZH.big")
        ? "TwoLane: road, TRTwoLane.tga, width 35"
        : "no roads data";
      const expectedMouseFirst = realAsset.endsWith("INIZH.big")
        ? "Normal: SCCPointer / SCCPointer"
        : "no mouse data";
      const expectedEvaFirst = realAsset.endsWith("INIZH.big")
        ? "LowPower: priority 2, 13 sides, EvaUSA_LowPower"
        : "no EVA data";
      const expectedCampaignFirst = realAsset.endsWith("INIZH.big")
        ? "TRAINING: CAMPAIGN:TRAINING, 1 mission, first Mission01"
        : "no campaign data";
      const expectedChallengeFirst = realAsset.endsWith("INIZH.big")
        ? "0: FactionAmericaAirForceGeneral, CHALLENGE_0, enabled"
        : "no challenge data";
      const expectedTransitionFirst = realAsset.endsWith("INIZH.big")
        ? "MainMenuFade: 1 window, fire once, MainMenu.wnd:MainMenuRuler/WINFADE"
        : "no transition data";
      await page.setInputFiles("[data-big-file]", realAsset);
      await page.waitForFunction(([expectedFile, expectedIni, expectedGameData, expectedAIData, expectedMappedImage, expectedEnvironment, expectedVideo, expectedMultiplayer, expectedGameLod, expectedArmor, expectedWeapon, expectedLocomotor, expectedFxList, expectedParticle, expectedAudio, expectedMiscAudio, expectedDamageFx, expectedCrate, expectedOcl, expectedThing, expectedCommand, expectedProgression, expectedPlayer, expectedTerrain, expectedControlBar, expectedRoads, expectedMouse, expectedEva, expectedCampaign, expectedChallenge, expectedTransition]) => {
        return document.body.dataset.validation === "pass" &&
          document.querySelector("[data-big-first]")?.textContent === expectedFile &&
          document.querySelector("[data-ini-first]")?.textContent === expectedIni &&
          document.querySelector("[data-gamedata-first]")?.textContent === expectedGameData &&
          document.querySelector("[data-aidata-first]")?.textContent === expectedAIData &&
          document.querySelector("[data-mappedimage-first]")?.textContent === expectedMappedImage &&
          document.querySelector("[data-environment-first]")?.textContent === expectedEnvironment &&
          document.querySelector("[data-video-first]")?.textContent === expectedVideo &&
          document.querySelector("[data-multiplayer-first]")?.textContent === expectedMultiplayer &&
          document.querySelector("[data-gamelod-first]")?.textContent === expectedGameLod &&
          document.querySelector("[data-armor-first]")?.textContent === expectedArmor &&
          document.querySelector("[data-weapon-first]")?.textContent === expectedWeapon &&
          document.querySelector("[data-locomotor-first]")?.textContent === expectedLocomotor &&
          document.querySelector("[data-fxlist-first]")?.textContent === expectedFxList &&
          document.querySelector("[data-particle-first]")?.textContent === expectedParticle &&
          document.querySelector("[data-audio-first]")?.textContent === expectedAudio &&
          document.querySelector("[data-miscaudio-first]")?.textContent === expectedMiscAudio &&
          document.querySelector("[data-damagefx-first]")?.textContent === expectedDamageFx &&
          document.querySelector("[data-crate-first]")?.textContent === expectedCrate &&
          document.querySelector("[data-ocl-first]")?.textContent === expectedOcl &&
          document.querySelector("[data-thing-first]")?.textContent === expectedThing &&
          document.querySelector("[data-command-first]")?.textContent === expectedCommand &&
          document.querySelector("[data-progression-first]")?.textContent === expectedProgression &&
          document.querySelector("[data-player-first]")?.textContent === expectedPlayer &&
          document.querySelector("[data-terrain-first]")?.textContent === expectedTerrain &&
          document.querySelector("[data-controlbar-first]")?.textContent === expectedControlBar &&
          document.querySelector("[data-roads-first]")?.textContent === expectedRoads &&
          document.querySelector("[data-mouse-first]")?.textContent === expectedMouse &&
          document.querySelector("[data-eva-first]")?.textContent === expectedEva &&
          document.querySelector("[data-campaign-first]")?.textContent === expectedCampaign &&
          document.querySelector("[data-challenge-first]")?.textContent === expectedChallenge &&
          document.querySelector("[data-transition-first]")?.textContent === expectedTransition;
      }, [expectedFirstFile, expectedIniFirst, expectedGameDataFirst, expectedAIDataFirst, expectedMappedImageFirst, expectedEnvironmentFirst, expectedVideoFirst, expectedMultiplayerFirst, expectedGameLodFirst, expectedArmorFirst, expectedWeaponFirst, expectedLocomotorFirst, expectedFxListFirst, expectedParticleFirst, expectedAudioFirst, expectedMiscAudioFirst, expectedDamageFxFirst, expectedCrateFirst, expectedOclFirst, expectedThingFirst, expectedCommandFirst, expectedProgressionFirst, expectedPlayerFirst, expectedTerrainFirst, expectedControlBarFirst, expectedRoadsFirst, expectedMouseFirst, expectedEvaFirst, expectedCampaignFirst, expectedChallengeFirst, expectedTransitionFirst]);
    }
    const viewportScreenshotPath = resolve(screenshotsDir, `refpack-harness-${viewport.name}.png`);
    const status = await page.locator("[data-status]").textContent();
    const decoded = await page.locator("[data-output]").textContent();
    await page.screenshot({ path: viewportScreenshotPath, fullPage: true });
    await page.close();
    captures.push({ ...viewport, status, decoded, screenshot: viewportScreenshotPath });
  }

  console.log(JSON.stringify({
    url,
    status: captures[0].status,
    decoded: captures[0].decoded,
    realAsset,
    screenshot: captures[0].screenshot,
    screenshots: captures.map((capture) => capture.screenshot),
  }, null, 2));
} finally {
  await browser.close();
  server.close();
}
