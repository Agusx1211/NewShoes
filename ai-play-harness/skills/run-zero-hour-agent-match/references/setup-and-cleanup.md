# Setup and cleanup reference

Run commands from the repository worktree that owns the task. Follow repository `AGENTS.md` and local private instructions before using remote hardware or starting a service.

## Build and focused checks

```sh
cd AgentBridge
go test ./...
go vet ./...
go build -o /tmp/new-shoes-agent-bridge ./cmd/new-shoes-agent-bridge

cd ../WebAssembly
npm run test:agent-bridge
npm run build:port:threaded:release
```

Run the UI or browser bridge smoke when the change touches those paths. When deploying to a different architecture, build the bridge for that target, for example:

```sh
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -o /tmp/new-shoes-agent-bridge-linux-amd64 \
  ./cmd/new-shoes-agent-bridge
```

The runtime still needs the normal Project New Shoes retail assets and WebAssembly dependencies. Prefer an existing verified checkout or task-owned staging directory; do not copy user assets into the repository or commit them.

## Match-host environment

`WebAssembly/harness/agent_bridge_match_host.mjs` accepts:

| Variable | Meaning |
| --- | --- |
| `AGENT_BRIDGE_SESSION_ID` | Unique public session label |
| `AGENT_BRIDGE_PLAY_MODE` | Fixed `global` or `camera` policy |
| `AGENT_BRIDGE_PORT` | Optional fixed loopback port; otherwise selected automatically |
| `AGENT_BRIDGE_DIST` | Distribution directory, normally `dist-threaded-release` |
| `AGENT_BRIDGE_EXECUTABLE` | Optional prebuilt bridge binary; otherwise `go run` |
| `AGENT_BRIDGE_BROWSER_EXECUTABLE` | Hardware-GPU Chromium/Chrome executable |
| `AGENT_BRIDGE_BROWSER_ARGS` | Platform-specific GPU arguments when required |
| `AGENT_BRIDGE_VIDEO_DIR` | Optional output directory for 1280×800 WebM recording |
| `AGENT_BRIDGE_ENGINE_TOKEN` | Optional browser credential; generated when omitted |
| `AGENT_BRIDGE_API_TOKEN` | Optional REST credential; generated when omitted |

Keep engine and API credentials distinct. Prefer generated values, and never print them again after the host's one-time ready record.

Example local launch:

```sh
cd WebAssembly
AGENT_BRIDGE_SESSION_ID="match-$(date +%Y%m%d-%H%M%S)" \
AGENT_BRIDGE_PLAY_MODE=camera \
AGENT_BRIDGE_DIST=dist-threaded-release \
AGENT_BRIDGE_EXECUTABLE=/tmp/new-shoes-agent-bridge \
AGENT_BRIDGE_BROWSER_EXECUTABLE=/path/to/hardware-gpu-chrome \
AGENT_BRIDGE_VIDEO_DIR="$PWD/artifacts/match-videos/current" \
npm run host:agent-bridge-match
```

For a remote GPU machine, run this same host there from a task-owned checkout or staging directory. Forward only the loopback REST port through an authenticated transport. Track the remote host PID explicitly so shutdown reaches the host rather than only the transport process.

## Ready and health checks

The host prints a JSON ready record containing the REST base, one-time API token, session, play mode, renderer, and page URL. Keep it private. Verify the session using authenticated `GET /v1/sessions` and require the intended ID and mode.

Before menu observation:

```text
POST /v1/sessions/{session}/input/pointer
{"x":32,"y":32}
```

Use `/ui`, `/ui/items`, and semantic `/ui/activate`, `/ui/text`, `/ui/submit`, `/ui/selection`, `/ui/value`, and `/ui/tab` calls for setup. Confirm the final lobby snapshot before pressing Play.

During the match, monitor these read-only signals:

- Host, browser, bridge, and recorder process health.
- Periodic `/world?detail=tactical` outcome/economy summaries.
- A filtered `game.outcome` event subscription or replay cursor.
- Video file growth.
- Playing-agent liveness and its eventual terminal report.

The orchestrator should not send game orders in a direct-control evaluation.

## Terminal capture and shutdown

Query the retained terminal snapshot before stopping:

```text
GET /v1/sessions/{session}/world?detail=tactical
GET /v1/sessions/{session}/events?types=game.outcome&after=0
```

Preserve `game.outcome`, `endFrame`, `scoreboard`, match configuration, play mode, and whether scripts/director control were allowed.

Send `SIGINT` or `SIGTERM` to the match-host Node process. Wait for the JSON `videoPath` line, then verify no task-owned match host, bridge, browser, or recorder remains. An SSH disconnect is not completion evidence.

Validate and move the recording:

```sh
ffprobe -v error \
  -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate \
  -of json /path/to/match.webm
```

Finally remove task-owned temporary browser profiles and remote staging files. Never remove another task's directory or an uncommitted worktree.
