# New Shoes agent bridge

This directory contains the optional Go process that turns authenticated REST
requests into data-layer operations on a running browser game. The browser
opens the connection outward, so the engine does not listen on a port and does
not need screenshots, OCR, DOM selectors, or synthetic browser clicks.

The current `cnc-agent/1` surface covers semantic shell UI observation, the
real engine action paths for pointer motion and shell gadgets, and read-only
battlefield/player/camera/terrain observation. Selection, orders, production,
placement, and the full agent-play proof remain tracked in
[issue #75](https://github.com/Agusx1211/NewShoes/issues/75).

## Run locally

```sh
cd AgentBridge
go run ./cmd/new-shoes-agent-bridge
```

The command binds to `127.0.0.1:18888` by default. It creates separate random
256-bit browser and REST credentials when `-engine-token` and `-api-token` are
omitted, then prints the browser configuration and REST bearer value once.
The two credentials must be distinct. Treat that output as secret. For a bridge
behind a TLS reverse proxy, pass its public socket address with
`-engine-url wss://host/engine`.

Configure the launcher before pressing Launch:

```js
await window.CnCPort.play.configure({
  agentBridge: {
    url: "ws://127.0.0.1:18888/engine",
    token: "the-token-printed-by-the-bridge",
    sessionId: "game-1",
  },
});
```

An embedding page can instead define the same object as
`window.CnCPortPlayConfig.agentBridge` before `play.mjs` loads. The credential
is not accepted in the page URL, is omitted from public status, and is not
recorded in issue dumps. If no configuration is provided, the adapter module is
not imported and no agent socket or reconnect timer exists.

## REST API

Every `/v1` request requires `Authorization: Bearer <token>`. Responses have
`Cache-Control: no-store`. First discover the exact session identifier:

```sh
curl -H 'Authorization: Bearer TOKEN' \
  http://127.0.0.1:18888/v1/sessions
```

Read the visible UI tree:

```sh
curl -H 'Authorization: Bearer TOKEN' \
  http://127.0.0.1:18888/v1/sessions/game-1/ui
```

The original shell reveals its main-menu controls only after initial pointer
motion. Send that motion through the engine input path before reading the menu:

```sh
curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"x":32,"y":32}' \
  http://127.0.0.1:18888/v1/sessions/game-1/input/pointer
```

Actions use both the integer engine window ID and, preferably, the decorated
window name returned by that snapshot. The name is an optimistic identity
guard: an action fails instead of targeting a recycled ID.

```sh
curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"windowId":123,"name":"MainMenu.wnd:ButtonSinglePlayer"}' \
  http://127.0.0.1:18888/v1/sessions/game-1/ui/activate

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"windowId":456,"name":"Lobby.wnd:EditName","text":"General"}' \
  http://127.0.0.1:18888/v1/sessions/game-1/ui/text

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"windowId":789,"name":"Lobby.wnd:MapList","index":3}' \
  http://127.0.0.1:18888/v1/sessions/game-1/ui/selection
```

List rows are paged separately when the snapshot's bounded visible rows are
not enough:

```text
GET /v1/sessions/game-1/ui/items?windowId=789&name=Lobby.wnd%3AMapList&offset=0&limit=64
```

Read the current battlefield either across the map or restricted to the
current tactical camera:

```sh
curl -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/world?mode=unrestricted'

curl -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/world?mode=camera'
```

The snapshot reports game/end state, the tactical camera, map extent, public
player roster, local-player economy, and observable objects. Object IDs are
stable opaque identifiers allocated only after an object is observable; they
do not expose gaps in the engine's private object sequence. Enemy economy and
locally controlled capabilities/motion are `null`. Objects hidden by shroud,
stealth, or client-side drawable policy are omitted. Camera mode additionally
omits observable objects outside the rendered tactical view.

Terrain is a bounded, caller-sized cell-center grid. Bounds must stay inside
the extent returned by `/world`; each axis is limited to 128 samples and the
grid to 16,384 samples:

```sh
curl -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/terrain?mode=camera&minX=0&minY=0&maxX=1000&maxY=1000&columns=32&rows=32'
```

Heights are `uint16le-base64` with zero reserved for unknown cells and the
reported offset/scale used for decoding. One byte per sample carries knowledge,
cliff, water, visible path type, and in-camera flags. Shrouded cells remain
unknown; explored fog exposes static height/cliff data but not water/path data;
camera mode masks every sample outside the current view.

`POST /v1/sessions/{session}/requests` exposes the versioned raw operation
envelope for forward-compatible clients. `POST` bodies are limited to 1 MiB,
browser messages to 4 MiB, list pages to 128 rows, and bridge calls to 30
seconds by default.

## Protocol boundary

The browser uses WebSocket subprotocol `cnc-agent.v1` and authenticates in its
first JSON `hello` frame. The protocol advertises capabilities explicitly.
`protocol.describe`, `input.pointerMove`, `world.snapshot`, `terrain.query`,
`ui.snapshot`, `ui.activate`, `ui.setText`, `ui.selectIndex`, and
`ui.listItems` are the currently advertised operations.

The C++ implementation owns observation and mutations. It traverses the real
`GameWindowManager` on demand and drives the original gadget input/system
messages. JavaScript only validates and forwards the raw protocol; Go owns
sessions, authentication, request correlation, timeouts, and the REST mapping.

Run the focused checks with:

```sh
go test ./...
go vet ./...
cd ../WebAssembly
npm run test:agent-bridge
```
