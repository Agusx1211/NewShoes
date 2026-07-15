---
name: run-zero-hour-agent-match
description: "Set up, launch, record, supervise, and clean up a Project New Shoes Zero Hour agent match using the real WebAssembly runtime and authenticated AgentBridge. Use when preparing a local or remote hardware-GPU match, configuring Global or Camera direct-control mode, handing the REST session to a playing agent, preserving terminal evidence and video, or diagnosing orchestration and shutdown problems."
---

# Run a Zero Hour Agent Match

Run the shipping engine through the authenticated match host, keep orchestration separate from the playing agent, and retain authoritative outcome and video evidence. Read [setup-and-cleanup.md](references/setup-and-cleanup.md) before launching.

## Define the run

Record these choices before starting:

- Unique session ID, port, browser profile, artifact directory, and process owner.
- `global` or `camera` play mode. It is fixed at host startup and cannot be changed through REST.
- Match configuration: map, starting cash, human faction, opponent faction and difficulty, and closed/observer slots.
- Direct-control or director policy. For direct control, prohibit player-created scripts and background controllers.
- Whether to record video and where the final artifact must be copied.

Do not put bridge credentials in logs, prompts, issue comments, filenames, URLs, or recordings. Give the playing agent only the REST base, REST bearer token, session ID, match constraints, and the `play-zero-hour` skill.

## Prepare and verify

Use the existing built runtime when it contains the intended code. Otherwise build the threaded release and the Go bridge as described in the reference. Run the focused Go and JavaScript tests before a consequential match. A remote bridge executable must match the remote machine architecture.

Use a hardware-GPU Chromium/Chrome. Treat SwiftShader, llvmpipe, or another software renderer as a failed setup. Use a unique browser profile and confirm that no process from another task owns the chosen port or artifact directory.

## Launch the host

Start `WebAssembly/harness/agent_bridge_match_host.mjs` through `npm run host:agent-bridge-match` with explicit environment variables for the session, play mode, distribution, browser, bridge executable, and optional video directory. Wait for the one-line ready record and confirm:

- The browser adapter and real engine runtime are started.
- `/v1/sessions` contains the intended session and fixed play mode.
- The renderer is a hardware GPU.
- The video directory is growing when recording is required.

For a manually launched browser, use the **Remote Agent** Windows app before launch: enable it, enter the printed WebSocket URL and browser token, choose the identical session/play mode, apply for next launch, and then launch Zero Hour. Do not pass the browser token in a page URL.

## Configure and hand off

Send one semantic pointer-motion request before inspecting the first main menu. Configure the match through `/ui` observations and `/ui/*` actions, reading controls and list rows rather than guessing IDs or indices. Re-read the lobby before launching and verify every slot and setting.

Hand the live REST session to the playing agent. The orchestrator may monitor world state, events, video growth, process health, and the final scoreboard read-only; it must not issue gameplay commands or distract the player unless the user explicitly asks for intervention.

## Require a terminal result

Keep the host alive until `game.outcome` or a replayed `game.outcome` event is terminal. Do not infer completion from a destroyed base, score screen, agent silence, timeout, or failed attack. Capture the retained end frame and scoreboard before shutdown.

Answer side questions as progress updates while supervision is active. Do not yield the supervising turn merely to answer a non-terminal question; doing so stops active monitoring.

## Shut down and preserve evidence

Signal the actual host process with `SIGINT` or `SIGTERM` and wait for its final `videoPath` record. When the host runs through SSH, do not kill only the local SSH transport: signal the remote host process and verify that its browser, recorder, and bridge children exited.

Copy the recording to its requested durable location, then validate codec, dimensions, duration, and size with `ffprobe`. Remove only task-owned temporary profiles, processes, ports, credentials, and remote staging directories. Keep source changes and requested recordings.
