# Command & Conquer Generals WebAssembly Port

This directory contains the browser/WebAssembly port work.

The first checked-in targets are small, real game-data modules:

- Electronic Arts RefPack decoding from
  `Generals/Code/Libraries/Source/Compression/EAC/refdecode.cpp`
- BIG archive directory parsing based on the format handling in
  `Generals/Code/GameEngineDevice/Source/Win32Device/Common/Win32BIGFileSystem.cpp`
- INI block/property indexing based on the block style and type table in
  `Generals/Code/GameEngine/Source/Common/INI/INI.cpp`
- Zero Hour global startup/game data parsing based on
  `GeneralsMD/Code/GameEngine/Source/Common/GlobalData.cpp`
- Zero Hour AI tuning, side skill-set, and skirmish build-list parsing based on
  `GeneralsMD/Code/GameEngine/Source/GameLogic/AI/AI.cpp`
- Zero Hour mapped UI image parsing based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/System/Image.cpp`
- Zero Hour water and weather environment parsing based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/Water.cpp` and
  `GeneralsMD/Code/GameEngine/Source/GameClient/Snow.cpp`
- Zero Hour video definition parsing based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/VideoPlayer.cpp`
- Zero Hour multiplayer settings, lobby colors, player colors, and starting
  money parsing based on `GeneralsMD/Code/GameEngine/Source/Common/MultiplayerSettings.cpp`
  and `GeneralsMD/Code/GameEngine/Source/GameNetwork/GameSpy/Chat.cpp`
- Zero Hour static and dynamic game LOD parsing based on
  `GeneralsMD/Code/GameEngine/Source/Common/GameLOD.cpp`
- Zero Hour control bar scheme parsing based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/GUI/ControlBar/ControlBarScheme.cpp`
- Zero Hour armor template parsing based on
  `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Armor.cpp`
- Zero Hour weapon template parsing based on the core combat fields in
  `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Weapon.cpp`
- Zero Hour locomotor template parsing based on movement fields from
  `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/Locomotor.cpp`
- Zero Hour FX list parsing based on audiovisual effect nuggets from
  `GeneralsMD/Code/GameEngine/Source/GameClient/FXList.cpp`
- Zero Hour particle system template parsing based on
  `GeneralsMD/Code/GameEngine/Source/Common/INI/INIParticleSys.cpp` and
  `GeneralsMD/Code/GameEngine/Source/GameClient/System/ParticleSys.cpp`
- Zero Hour audio event, music track, and dialog event parsing based on
  `GeneralsMD/Code/GameEngine/Source/Common/INI/INIAudioEventInfo.cpp`
- Zero Hour miscellaneous audio hook parsing based on
  `GeneralsMD/Code/GameEngine/Source/Common/INI/INIMiscAudio.cpp`
- Zero Hour damage effect table parsing based on
  `GeneralsMD/Code/GameEngine/Source/Common/DamageFX.cpp`
- Zero Hour crate data parsing based on
  `GeneralsMD/Code/GameEngine/Source/GameLogic/System/CrateSystem.cpp`
- Zero Hour object creation list parsing based on action nuggets from
  `GeneralsMD/Code/GameEngine/Source/GameLogic/Object/ObjectCreationList.cpp`
- Zero Hour object/thing template parsing based on direct fields plus
  `ArmorSet`, `WeaponSet`, and production prerequisite links from
  `GeneralsMD/Code/GameEngine/Source/Common/Thing/ThingTemplate.cpp`
- Zero Hour command button and command set parsing based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/GUI/ControlBar/ControlBar.cpp`
- Zero Hour upgrade, special power, and science parsing based on
  `GeneralsMD/Code/GameEngine/Source/Common/System/Upgrade.cpp`,
  `GeneralsMD/Code/GameEngine/Source/Common/RTS/SpecialPower.cpp`, and
  `GeneralsMD/Code/GameEngine/Source/Common/RTS/Science.cpp`
- Zero Hour player/faction template parsing based on
  `GeneralsMD/Code/GameEngine/Source/Common/RTS/PlayerTemplate.cpp`
- Zero Hour terrain type parsing (texture, blend edges, terrain class, and
  construction restriction) based on
  `GeneralsMD/Code/GameEngine/Source/Common/INI/INITerrain.cpp` and
  `GeneralsMD/Code/GameEngine/Source/Common/TerrainTypes.cpp`
- Zero Hour road and bridge parsing (road width, bridge scale, radar color,
  bridge models, scaffold and tower objects) based on
  `GeneralsMD/Code/GameEngine/Source/Common/INI/INITerrainRoad.cpp`,
  `GeneralsMD/Code/GameEngine/Source/Common/INI/INITerrainBridge.cpp`, and
  `GeneralsMD/Code/GameEngine/Source/GameClient/Terrain/TerrainRoads.cpp`
- Zero Hour mouse cursor parsing (global tooltip/drag settings plus per-cursor
  image, texture, hotspot, animation, and text color) based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/Input/Mouse.cpp`
- Zero Hour EVA event parsing (announcer priority, check/expiration timing, and
  nested per-side sound lists) based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/Eva.cpp`
- Zero Hour campaign parsing (campaign metadata plus nested mission map,
  objective, briefing, and progression fields) based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/System/CampaignManager.cpp`
- Zero Hour Generals' Challenge persona parsing (per-position player template,
  bio strings, portraits, campaign link, and taunt sounds) based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/GUI/ChallengeGenerals.cpp`
- Zero Hour window transition parsing (per-group fire-once flag plus nested
  window name, transition style, and frame delay) based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/GUI/GameWindowTransitions.cpp`
- Zero Hour credits parsing (scroll settings, RGBA colors, style mode switches,
  and quoted-string-aware text and blank line entries) based on
  `GeneralsMD/Code/GameEngine/Source/GameClient/Credits.cpp`

RefPack, BIG, INI, global game data, AI data, mapped images, environment settings, video definitions, multiplayer settings, game LOD, control bar scheme, armor, weapon, locomotor, FX list, particle
system, audio event, miscellaneous audio hooks, damage FX, crate data, object creation list, object template, command UI,
progression, player/faction, terrain type, road/bridge, mouse cursor, EVA event, campaign, Generals' Challenge, window transition, and credits support are needed before browser-side loading
of original combat configuration can work. These targets build with Emscripten
when available and fall back to raw Clang wasm builds for dependency-free smoke
testing where possible. Later targets can add more typed gameplay object
factories, filesystem, browser loop, and SDL/WebGL integration.

## Build

```bash
npm run build:wasm
```

Output:

`dist/generals_refpack.wasm`

`dist/generals_big.wasm`

`dist/generals_ini.wasm`

`dist/generals_gamedata.wasm`

`dist/generals_aidata.wasm`

`dist/generals_mappedimage.wasm`

`dist/generals_environment.wasm`

`dist/generals_video.wasm`

`dist/generals_multiplayer.wasm`

`dist/generals_gamelod.wasm`

`dist/generals_controlbar.wasm`

`dist/generals_armor.wasm`

`dist/generals_weapon.wasm`

`dist/generals_locomotor.wasm`

`dist/generals_fxlist.wasm`

`dist/generals_particle.wasm`

`dist/generals_audio.wasm`

`dist/generals_miscaudio.wasm`

`dist/generals_damagefx.wasm`

`dist/generals_crate.wasm`

`dist/generals_ocl.wasm`

`dist/generals_thing.wasm`

`dist/generals_command.wasm`

`dist/generals_progression.wasm`

`dist/generals_player.wasm`

`dist/generals_terrain.wasm`

`dist/generals_roads.wasm`

`dist/generals_mouse.wasm`

`dist/generals_eva.wasm`

`dist/generals_campaign.wasm`

`dist/generals_challenge.wasm`

`dist/generals_transition.wasm`

`dist/generals_credits.wasm`

## Smoke Test

```bash
npm run test:wasm
```

## Browser Validation

Install the local JavaScript dependencies first:

```bash
npm install
```

Then run:

```bash
npm run validate
```

This builds the wasm targets, runs synthetic module tests, runs real asset tests
when `artifacts/real-assets/INIZH.big` exists, starts a local static server,
opens the harness in Chromium through Playwright, waits for the wasm decode and
real data checks to pass, and writes screenshots to:

`artifacts/screenshots/refpack-harness-desktop.png`

`artifacts/screenshots/refpack-harness-mobile.png`

## Real Asset Probe

If the Zero Hour Disc BIN images exist under `../assets`, convert the raw
MODE1/2352 tracks to ignored ISO images, extract `INIZH.big`, and parse it with
the wasm module:

```bash
npm run extract:real-big
npm run test:real-big
npm run test:real-ini
npm run test:real-gamedata
npm run test:real-aidata
npm run test:real-mappedimage
npm run test:real-environment
npm run test:real-video
npm run test:real-multiplayer
npm run test:real-gamelod
npm run test:real-controlbar
npm run test:real-armor
npm run test:real-weapon
npm run test:real-locomotor
npm run test:real-fxlist
npm run test:real-particle
npm run test:real-audio
npm run test:real-miscaudio
npm run test:real-damagefx
npm run test:real-crate
npm run test:real-ocl
npm run test:real-thing
npm run test:real-command
npm run test:real-progression
npm run test:real-player
npm run test:real-terrain
npm run test:real-roads
npm run test:real-mouse
npm run test:real-eva
npm run test:real-campaign
npm run test:real-challenge
npm run test:real-transition
npm run test:real-credits
```

The extracted archive stays under ignored `artifacts/real-assets/`.
