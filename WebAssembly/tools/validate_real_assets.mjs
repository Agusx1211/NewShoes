import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const wasmDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const realArchive = resolve(wasmDir, "artifacts/real-assets/INIZH.big");
const checks = [
  ["tools/test_real_ini_asset.mjs"],
  ["tools/test_real_gamedata_asset.mjs"],
  ["tools/test_real_aidata_asset.mjs"],
  ["tools/test_real_mappedimage_asset.mjs"],
  ["tools/test_real_environment_asset.mjs"],
  ["tools/test_real_video_asset.mjs"],
  ["tools/test_real_multiplayer_asset.mjs"],
  ["tools/test_real_gamelod_asset.mjs"],
  ["tools/test_real_controlbar_asset.mjs"],
  ["tools/test_real_armor_asset.mjs"],
  ["tools/test_real_weapon_asset.mjs"],
  ["tools/test_real_locomotor_asset.mjs"],
  ["tools/test_real_fxlist_asset.mjs"],
  ["tools/test_real_particle_asset.mjs"],
  ["tools/test_real_audio_asset.mjs"],
  ["tools/test_real_miscaudio_asset.mjs"],
  ["tools/test_real_damagefx_asset.mjs"],
  ["tools/test_real_crate_asset.mjs"],
  ["tools/test_real_ocl_asset.mjs"],
  ["tools/test_real_thing_asset.mjs"],
  ["tools/test_real_command_asset.mjs"],
  ["tools/test_real_progression_asset.mjs"],
  ["tools/test_real_player_asset.mjs"],
  ["tools/test_real_terrain_asset.mjs"],
  ["tools/test_real_roads_asset.mjs"],
  ["tools/test_real_mouse_asset.mjs"],
  ["tools/test_real_eva_asset.mjs"],
  ["tools/test_real_campaign_asset.mjs"],
  ["tools/test_real_challenge_asset.mjs"],
];

try {
  await access(realArchive);
} catch {
  console.log(JSON.stringify({
    skipped: true,
    reason: "real asset archive not found",
    expected: realArchive,
  }, null, 2));
  process.exit(0);
}

function runNode(args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: wasmDir,
      stdio: "inherit",
    });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

for (const check of checks) {
  await runNode(check);
}
