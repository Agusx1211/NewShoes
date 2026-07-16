# Changelog

Every release records each included pull request as a short, linked line. The
repository `release` skill describes the promotion workflow from `dev` to
`main`.

## [Unreleased]

## [0.3.0] - 2026-07-16

- Prevent terrain scorch depth bias from leaking into shroud and results rendering ([PR #114](https://github.com/Agusx1211/NewShoes/pull/114)).
- Fix biased skirmish random-faction assignments while preserving deterministic RNG progression ([PR #109](https://github.com/Agusx1211/NewShoes/pull/109)).
- Add complete mobile touch controls, virtual keyboard integration, and gesture coverage ([PR #110](https://github.com/Agusx1211/NewShoes/pull/110)).
- Expand terrain rendering to cover ultrawide high-zoom and near-vertical camera views ([PR #113](https://github.com/Agusx1211/NewShoes/pull/113)).
- Set version 0.3.0 and complete its audited release inventory ([PR #116](https://github.com/Agusx1211/NewShoes/pull/116)).
- Reduce automatic iPad rendering to the CSS pixel grid to lower GPU pressure ([PR #111](https://github.com/Agusx1211/NewShoes/pull/111)).
- Add native Anonymous and Ranked multiplayer UI with LAN status and reconnect recovery ([PR #112](https://github.com/Agusx1211/NewShoes/pull/112)).

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
