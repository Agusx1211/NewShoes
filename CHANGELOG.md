# Changelog

Every release records each included pull request as a short, linked line. The
repository `release` skill describes the promotion workflow from `dev` to
`main`.

## [Unreleased]

## [0.4.0] - 2026-07-19

- Remember Remote Agent settings and add an authenticated pre-launch connection test ([PR #121](https://github.com/Agusx1211/NewShoes/pull/121)).
- Connect AgentBridge directly over encrypted WebRTC DataChannels ([PR #127](https://github.com/Agusx1211/NewShoes/pull/127)).
- Make the launcher desktop usable on phone-sized portrait and landscape viewports ([PR #130](https://github.com/Agusx1211/NewShoes/pull/130)).
- Add direct two-finger mobile map gestures and preserve the live device aspect ratio ([PR #134](https://github.com/Agusx1211/NewShoes/pull/134)).
- Fix DXT1 CPU-fallback startup when S3TC texture support is unavailable ([PR #133](https://github.com/Agusx1211/NewShoes/pull/133)).
- Keep smoke particles visible when water reflections render before the main scene ([PR #136](https://github.com/Agusx1211/NewShoes/pull/136)).
- Correct DXT3 and DXT5 CPU-fallback alpha and color decoding ([PR #138](https://github.com/Agusx1211/NewShoes/pull/138)).
- Fall back to exclusive OPFS access when Safari rejects read-only sync handles ([PR #123](https://github.com/Agusx1211/NewShoes/pull/123)).
- Wait for the relaunched Exit window before the threaded play gate clicks it ([PR #139](https://github.com/Agusx1211/NewShoes/pull/139)).
- Retarget the GameEngine startup-order verifier to stepped initialization ([PR #141](https://github.com/Agusx1211/NewShoes/pull/141)).
- Bound BIG directory validation allocation growth while preserving archive checks ([PR #143](https://github.com/Agusx1211/NewShoes/pull/143)).
- Retarget the GameLogic new-game verifier to stepped map loading ([PR #145](https://github.com/Agusx1211/NewShoes/pull/145)).
- Avoid Durable Object storage writes while hardening hybrid Trystero discovery ([PR #214](https://github.com/Agusx1211/NewShoes/pull/214)).
- Restore real WW3D and browser-D3D8 linkage in the GameLogic runtime smoke ([PR #146](https://github.com/Agusx1211/NewShoes/pull/146)).
- Repair the launcher Bink browser smoke with a valid test-owned fixture ([PR #147](https://github.com/Agusx1211/NewShoes/pull/147)).
- Parallelize launcher folder metadata reads with stable bounded concurrency ([PR #149](https://github.com/Agusx1211/NewShoes/pull/149)).
- Preserve the ParticleInfo dynamic type when particle-system merging fails ([PR #151](https://github.com/Agusx1211/NewShoes/pull/151)).
- Prevent Miles audio cleanup loops from stalling on null entries ([PR #153](https://github.com/Agusx1211/NewShoes/pull/153)).
- Resolve extensionless files and dotted directories by path separators ([PR #155](https://github.com/Agusx1211/NewShoes/pull/155)).
- Bound missile garrison-kill iteration by the actual occupant list ([PR #158](https://github.com/Agusx1211/NewShoes/pull/158)).
- Make oriented-box inequality the logical complement of equality ([PR #160](https://github.com/Agusx1211/NewShoes/pull/160)).
- Restore script condition-team context after subroutine calls ([PR #162](https://github.com/Agusx1211/NewShoes/pull/162)).
- Preserve cardinal spline bookkeeping through polymorphic key insertion ([PR #164](https://github.com/Agusx1211/NewShoes/pull/164)).
- Remove undefined behavior from WWMath floor conversion ([PR #166](https://github.com/Agusx1211/NewShoes/pull/166)).
- Restore SimpleSceneClass scene-ID dispatch through const base pointers ([PR #169](https://github.com/Agusx1211/NewShoes/pull/169)).
- Restore AI state-machine exit cleanup callbacks ([PR #173](https://github.com/Agusx1211/NewShoes/pull/173)).
- Fully initialize FileInfo outputs before filesystem lookup ([PR #175](https://github.com/Agusx1211/NewShoes/pull/175)).
- Build scripted shroud masks from every human player ([PR #177](https://github.com/Agusx1211/NewShoes/pull/177)).
- Reject unknown WND gadget types without returning an indeterminate window ([PR #179](https://github.com/Agusx1211/NewShoes/pull/179)).
- Make saturated network-diagnostics retention amortized constant time ([PR #181](https://github.com/Agusx1211/NewShoes/pull/181)).
- Parse WebpageURL definitions safely without a browser subsystem ([PR #183](https://github.com/Agusx1211/NewShoes/pull/183)).
- Make saturated issue-recorder event retention amortized constant time ([PR #185](https://github.com/Agusx1211/NewShoes/pull/185)).
- Initialize zero-radius EMP and leaflet attack iteration safely ([PR #187](https://github.com/Agusx1211/NewShoes/pull/187)).
- Initialize rider-stealth fallbacks when a rider has no stealth module ([PR #190](https://github.com/Agusx1211/NewShoes/pull/190)).
- Give UseRiderStealth an explicit disabled module-data default ([PR #191](https://github.com/Agusx1211/NewShoes/pull/191)).
- Cancel pending partition updates when partition data detaches ([PR #193](https://github.com/Agusx1211/NewShoes/pull/193)).
- Match GameSpy thread string-array allocation and deletion ([PR #195](https://github.com/Agusx1211/NewShoes/pull/195)).
- Keep the ThingTemplate Body discriminator outside ModuleType ([PR #197](https://github.com/Agusx1211/NewShoes/pull/197)).
- Use an in-range sentinel for old script-condition migration ([PR #199](https://github.com/Agusx1211/NewShoes/pull/199)).
- Recognize Chinook combat-drop states through their raw state IDs ([PR #201](https://github.com/Agusx1211/NewShoes/pull/201)).
- Format localized crash reasons safely in the narrow crash log ([PR #203](https://github.com/Agusx1211/NewShoes/pull/203)).
- Validate flight-deck runway layouts before indexing fixed storage ([PR #205](https://github.com/Agusx1211/NewShoes/pull/205)).
- Require scripted garrison targets to be structures ([PR #207](https://github.com/Agusx1211/NewShoes/pull/207)).
- Reject non-positive cached-file read sizes without moving the stream ([PR #209](https://github.com/Agusx1211/NewShoes/pull/209)).
- Match array allocation and deletion in the online login menu ([PR #215](https://github.com/Agusx1211/NewShoes/pull/215)).
- Match terrain-background index-array allocation and deletion ([PR #217](https://github.com/Agusx1211/NewShoes/pull/217)).
- Sort compatible GameSpy lobby games before CRC mismatches ([PR #219](https://github.com/Agusx1211/NewShoes/pull/219)).
- Return the discovered dozer command set from AcademyStats object iteration ([PR #221](https://github.com/Agusx1211/NewShoes/pull/221)).
- Re-enter guard outer states after save loading ([PR #223](https://github.com/Agusx1211/NewShoes/pull/223)).
- Reject oversized particle-cannon outer-node counts during INI parsing ([PR #225](https://github.com/Agusx1211/NewShoes/pull/225)).
- Smooth large-skirmish replay stalls and prevent Worker supply-state re-entry loops ([PR #213](https://github.com/Agusx1211/NewShoes/pull/213)).
- Preserve successfully disarmed mines, booby traps, and demo traps ([PR #228](https://github.com/Agusx1211/NewShoes/pull/228)).
- Play every configured clip in AC_ALL audio events ([PR #230](https://github.com/Agusx1211/NewShoes/pull/230)).
- Apply authored rally offsets to both AI building paths ([PR #232](https://github.com/Agusx1211/NewShoes/pull/232)).
- Reject CAMEO_FLASH actions when their command button is unavailable ([PR #235](https://github.com/Agusx1211/NewShoes/pull/235)).
- Correct Vector3 quick-length component ordering ([PR #236](https://github.com/Agusx1211/NewShoes/pull/236)).
- Reject invalid ENEMY_SIGHTED relationships before partition filtering ([PR #239](https://github.com/Agusx1211/NewShoes/pull/239)).
- Set version 0.4.0 and complete its audited release inventory ([PR #244](https://github.com/Agusx1211/NewShoes/pull/244)).
- Clear focus-latched selection modes so unit clicks and friendly transport commands recover ([PR #249](https://github.com/Agusx1211/NewShoes/pull/249)).
- Keep the main-scene smoke and dust request intact when water reflections flush first ([PR #257](https://github.com/Agusx1211/NewShoes/pull/257)).
- Finalize the 0.4.0 release inventory after the last integrated fixes ([PR #269](https://github.com/Agusx1211/NewShoes/pull/269)).

## [0.3.0] - 2026-07-16

- Prevent terrain scorch depth bias from leaking into shroud and results rendering ([PR #114](https://github.com/Agusx1211/NewShoes/pull/114)).
- Fix biased skirmish random-faction assignments while preserving deterministic RNG progression ([PR #109](https://github.com/Agusx1211/NewShoes/pull/109)).
- Add complete mobile touch controls, virtual keyboard integration, and gesture coverage ([PR #110](https://github.com/Agusx1211/NewShoes/pull/110)).
- Expand terrain rendering to cover ultrawide high-zoom and near-vertical camera views ([PR #113](https://github.com/Agusx1211/NewShoes/pull/113)).
- Set version 0.3.0 and complete its audited release inventory ([PR #116](https://github.com/Agusx1211/NewShoes/pull/116)).
- Reduce automatic iPad rendering to the CSS pixel grid to lower GPU pressure ([PR #111](https://github.com/Agusx1211/NewShoes/pull/111)).
- Add native Anonymous and Ranked multiplayer UI with LAN status and reconnect recovery ([PR #112](https://github.com/Agusx1211/NewShoes/pull/112)).
- Complete the 0.3.0 inventory after the final green integrations ([PR #117](https://github.com/Agusx1211/NewShoes/pull/117)).

## [0.2.0] - 2026-07-15

- Replace Arcade with ten themed Windows XP game apps, including five networked Internet games ([PR #55](https://github.com/Agusx1211/NewShoes/pull/55)).
- Add drag-and-drop, touch controls, animations, difficulty settings, and synthesized audio across the XP games ([PR #55](https://github.com/Agusx1211/NewShoes/pull/55)).
- Fix stale sorted particle shader replay state that intermittently hid smoke and dust effects ([PR #65](https://github.com/Agusx1211/NewShoes/pull/65)).
- Replace the hosted FFmpeg runtime with a lazy 104 KiB direct classic-Bink decoder ([PR #70](https://github.com/Agusx1211/NewShoes/pull/70)).
- Add bounded Bink video, audio, and seek playback with integrity, size, source, and deployment guards ([PR #70](https://github.com/Agusx1211/NewShoes/pull/70)).
- Restore original animated Zero Hour cursors through the threaded browser runtime with a system-pointer setting ([PR #74](https://github.com/Agusx1211/NewShoes/pull/74)).
- Preserve derived cursor packs through browser installation and encrypted device transfer ([PR #74](https://github.com/Agusx1211/NewShoes/pull/74)).
- Add a failure-only Windows-style crash dialog and downloadable diagnostics reports with no steady-state reporter work ([PR #69](https://github.com/Agusx1211/NewShoes/pull/69)).
- Add a browser mod manager with ordered content identities and original-engine `-mod` mounting ([PR #73](https://github.com/Agusx1211/NewShoes/pull/73)).
- Import practical BIG, folder, ZIP, 7z, RAR, NSIS, nested, and Clickteam mod distributions without executing native payloads ([PR #73](https://github.com/Agusx1211/NewShoes/pull/73)).
- Isolate saves, replays, device transfers, and multiplayer by exact mod composition and transfer installed mod libraries ([PR #73](https://github.com/Agusx1211/NewShoes/pull/73)).
- Base feature work on `dev` and require completed agent changes to be handed off through signed pull requests ([PR #72](https://github.com/Agusx1211/NewShoes/pull/72)).
- Set version `0.2.0` and seed its release inventory ([PR #77](https://github.com/Agusx1211/NewShoes/pull/77)).
- Select the launcher-compatible Contra X Beta 2 archive set so its custom UI renders correctly ([PR #84](https://github.com/Agusx1211/NewShoes/pull/84)).
- Generate evidence-backed public project documentation and crawler discovery resources from one canonical record ([PR #82](https://github.com/Agusx1211/NewShoes/pull/82)).
- Keep browser LAN diagnostics read-only so observation cannot desynchronize multiplayer lockstep ([PR #90](https://github.com/Agusx1211/NewShoes/pull/90)).
- Avoid synchronous WebGL buffer upload stalls by rotating in-flight dynamic buffer ranges ([PR #98](https://github.com/Agusx1211/NewShoes/pull/98)).
- Stream large issue-dump serialization in bounded chunks without exceeding JavaScript string limits ([PR #100](https://github.com/Agusx1211/NewShoes/pull/100)).
- Bound retired WebGL streaming buffers and invalidate dependent vertex arrays before deletion ([PR #101](https://github.com/Agusx1211/NewShoes/pull/101)).
- Preserve unrelated cached vertex arrays when transient renderer buffers are released ([PR #103](https://github.com/Agusx1211/NewShoes/pull/103)).
- Add configurable autonomous LLM commanders with exclusive strategy ownership and durable session evidence ([PR #95](https://github.com/Agusx1211/NewShoes/pull/95)).
- Add an opt-in semantic remote-play API with global and camera-bound control, tactical events, and a Go bridge ([PR #94](https://github.com/Agusx1211/NewShoes/pull/94)).
- Complete the audited 0.2.0 release inventory after the final integrated changes ([PR #105](https://github.com/Agusx1211/NewShoes/pull/105)).

## [0.1.0] - 2026-07-13

- Establish `dev` as the integration branch and preserve trusted PR previews ([PR #45](https://github.com/Agusx1211/NewShoes/pull/45)).
- Add the `release` skill with versioned promotions and issue-closure accounting ([PR #45](https://github.com/Agusx1211/NewShoes/pull/45)).
- Add canonical `VERSION` and linked `CHANGELOG.md` release metadata ([PR #45](https://github.com/Agusx1211/NewShoes/pull/45)).
- Record the exact build commit in local, deployed, and issue-dump metadata ([PR #45](https://github.com/Agusx1211/NewShoes/pull/45)).
- Show the version, build commit link, and release notes in the fake Windows UI ([PR #45](https://github.com/Agusx1211/NewShoes/pull/45)).
- Keep explosion scorch decals stable above terrain ([PR #32](https://github.com/Agusx1211/NewShoes/pull/32)).
- Restore river water after Shader Model 1 program switches ([PR #33](https://github.com/Agusx1211/NewShoes/pull/33)).
- Render Tech Reinforcement Pad towers without over-broad alpha cutout ([PR #42](https://github.com/Agusx1211/NewShoes/pull/42)).
- Flush threaded renderer batches per frame to prevent bright terrain blocks ([PR #41](https://github.com/Agusx1211/NewShoes/pull/41)).
- Restore authorized game audio after returning to the browser tab ([PR #38](https://github.com/Agusx1211/NewShoes/pull/38)).
- Add a persistent configurable camera zoom setting up to 500 units ([PR #44](https://github.com/Agusx1211/NewShoes/pull/44)).
- Persist, import, export, and play original replay files ([PR #39](https://github.com/Agusx1211/NewShoes/pull/39)).
- Deploy accepted `dev` builds through a trusted Cloudflare handoff ([PR #49](https://github.com/Agusx1211/NewShoes/pull/49)).
- Complete original browser save, load, overwrite, delete, and relaunch flows ([PR #46](https://github.com/Agusx1211/NewShoes/pull/46)).
- Shut down and relaunch the runtime after the original engine exits ([PR #31](https://github.com/Agusx1211/NewShoes/pull/31)).
- Add encrypted multi-device game file transfer with staged installation ([PR #50](https://github.com/Agusx1211/NewShoes/pull/50)).
- Synchronize agent GitHub identity rules from `main` back into `dev` ([PR #52](https://github.com/Agusx1211/NewShoes/pull/52)).
- Finalize version `0.1.0` and its complete release inventory ([PR #53](https://github.com/Agusx1211/NewShoes/pull/53)).
