# New Shoes agent bridge

This directory contains the optional Go process that turns authenticated REST
requests into data-layer operations on a running browser game. The browser
opens the connection outward, so the engine does not listen on a port and does
not need screenshots, OCR, DOM selectors, or synthetic browser clicks.

The current `cnc-agent/1` surface covers semantic shell UI observation, the
real engine action paths for pointer motion and shell gadgets, filtered
battlefield/player/camera/terrain observation, and semantic match actions. Live
object command sets drive selection, movement, combat, construction, production,
upgrades, supported special powers, and camera movement through the original
deterministic message stream. The independent full-match proof is tracked in
[issue #75](https://github.com/Agusx1211/NewShoes/issues/75).

## Run locally

```sh
cd AgentBridge
go run ./cmd/new-shoes-agent-bridge
# Or bind observation and actions to the tactical camera:
go run ./cmd/new-shoes-agent-bridge -play-mode=camera
```

The command binds to `127.0.0.1:18888` by default. It creates separate random
256-bit browser and REST credentials when `-engine-token` and `-api-token` are
omitted, then prints the browser configuration and REST bearer value once.
The two credentials must be distinct. Treat that output as secret. For a bridge
behind a TLS reverse proxy, pass its public socket address with
`-engine-url wss://host/engine`.

Before pressing Launch, open **Remote Agent** from the Project New Shoes
desktop or Start menu:

1. Turn on **Enable Remote Agent**.
2. Paste the bridge's printed WebSocket URL and browser token.
3. Choose a session ID and the same Global or Camera play mode used by the
   bridge process.
4. Select **Apply for next launch**, then launch Zero Hour normally.

The app validates and stages the connection immediately. The socket opens only
after the real engine and its frame loop are ready. The browser token lives only
in page memory: it is a password field, is never stored in local or session
storage, and is omitted from public status and issue dumps.

Automation or embedding hosts can configure the same pre-launch state without
the app:

```js
await window.CnCPort.play.configure({
  agentBridge: {
    url: "ws://127.0.0.1:18888/engine",
    token: "the-token-printed-by-the-bridge",
    sessionId: "game-1",
    playMode: "global",
  },
});
```

An embedding page can also define the same object as
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

Read transient in-match information that is drawn outside the window tree—UI
messages (including received game chat), popup briefings, currently revealed
military-subtitle lines, and named timers:

```sh
curl -H 'Authorization: Bearer TOKEN' \
  http://127.0.0.1:18888/v1/sessions/game-1/hud
```

During a multiplayer match, send through the original filtered network-chat
path. Received lines appear in the HUD snapshot with the same text and player
color a human sees:

```sh
curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Attack now","audience":"allies"}' \
  http://127.0.0.1:18888/v1/sessions/game-1/chat
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
  -d '{"windowId":456,"name":"LanLobbyMenu.wnd:TextEntryChat"}' \
  http://127.0.0.1:18888/v1/sessions/game-1/ui/submit

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"windowId":789,"name":"Lobby.wnd:MapList","index":3}' \
  http://127.0.0.1:18888/v1/sessions/game-1/ui/selection

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"windowId":321,"name":"Options.wnd:SliderSFXVolume","value":73}' \
  http://127.0.0.1:18888/v1/sessions/game-1/ui/value

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"windowId":654,"name":"Options.wnd:TabControl","index":2}' \
  http://127.0.0.1:18888/v1/sessions/game-1/ui/tab
```

Checkbox and radio snapshots expose `checked`; sliders expose inclusive
`min`, `max`, and `value`; progress bars expose their percentage; and tab
controls expose the active index plus an enabled bitmap. Slider and tab writes
go through the original gadget messages and pane-selection code.

List rows are paged separately when the snapshot's bounded visible rows are
not enough:

```text
GET /v1/sessions/game-1/ui/items?windowId=789&name=Lobby.wnd%3AMapList&offset=0&limit=64
```

The bridge starts in fixed `global` or `camera` play mode. The choice is made
with `-play-mode`, repeated in the browser configuration, authenticated in the
engine hello, and reported by `/v1/sessions`; it cannot be changed by a REST
request. Read the current battlefield using that session policy:

```sh
curl -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/world'

# Compact records for a fast tactical loop. Fetch reusable definitions and
# per-object capabilities when needed, then omit them from frequent reads.
curl -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/world?detail=tactical&includeCapabilities=true'
curl -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/world?detail=tactical'
```

The snapshot reports game/end state, the tactical camera, map extent, public
player roster, local-player economy, and observable objects. Object IDs are
stable opaque identifiers allocated only after an object is observable; they
do not expose gaps in the engine's private object sequence. Enemy economy and
non-locally controlled motion are `null` in full snapshots. Objects hidden by
shroud, stealth, or client-side drawable policy are omitted. Camera mode
additionally omits observable objects outside the rendered tactical view.

`detail=tactical` replaces the large per-object discovery records with compact
combat records. Their `position` is `[x,y,z]` and `health` is `[current,max]`.
With `includeCapabilities=true`, reusable template and command definitions are
reported once in the top-level `templates`, `commandSets`, and
`playerCommandSets` dictionaries; live state is keyed by opaque object ID in
`objectCapabilities`, while `playerCommandState` reports current General Point
science availability and shortcut-power readiness. Object state explicitly
distinguishes `selectable` from `orderable`, reports containment and passengers,
current weapons/range/damage/target classes, production queues, command
availability, and real special-power source/cooldown state. Omit the capability
dictionaries from high-frequency tactical reads after discovery.

### Tactical event stream

The Go bridge can maintain the fast tactical loop and deliver bounded,
coalesced changes as authenticated server-sent events. It does not poll until a
client opens this endpoint:

```sh
curl -N -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/events'
```

Each event has a monotonically increasing `cursor`, simulation `frame`,
`snapshotId`, severity, compact object IDs/area/details, and a `wake` flag. A
cheap background controller can consume every event while a planning model
uses a deliberately quiet subscription such as:

```sh
curl -N -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/events?wakeOnly=true&minSeverity=warning'
```

Optional comma-separated `types`, `relationships`, and `objectIds` filters and
an all-or-nothing `minX`, `minY`, `maxX`, `maxY` region further narrow delivery.
`relationships` accepts `self`, `allies`, `enemies`, `neutral`, and `unknown`.
The event source uses the session's fog-safe observation mode; a camera stream
therefore cannot derive changes from objects outside the current tactical view.

Reconnect with the standard `Last-Event-ID` header or the equivalent `after`
query parameter. The bridge retains a bounded replay ring during a short idle
grace period. A client that falls behind receives `stream.resync` with the
current and oldest available cursors and must refresh `/world`; the bridge
never grows an unbounded queue. Heartbeats are SSE comments, so they keep the
connection alive without waking an event listener. `stream.baseline` marks the
first authoritative snapshot, and `game.outcome` is a critical wake event.
When the browser advertises `hud.snapshot`, an unfiltered stream also emits
`hud.message`, `hud.popup`, `hud.popupClosed`, `hud.subtitle`, and `hud.timer`.
New messages/popups and the start of a subtitle can wake a listener; subtitle
typing and timer countdown updates stay informational. A `types=` filter that
does not name a `hud.*` event avoids the extra HUD read entirely.

Diffing, replay cursors, filters, severity, and coalescing intentionally live
in Go as API sugar. The engine remains the authority for compact snapshots,
fog/stealth filtering, stable opaque identities, and terminal results. The
watcher stops after the idle grace period when no subscribers remain. Poll,
capability-refresh, coalescing, idle, heartbeat, and replay limits can be tuned
with the bridge command's `-event-*` flags.

Terrain is a bounded, caller-sized cell-center grid. Bounds must stay inside
the extent returned by `/world`; each axis is limited to 128 samples and the
grid to 16,384 samples:

```sh
curl -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/terrain?minX=0&minY=0&maxX=1000&maxY=1000&columns=32&rows=32'
```

Heights are `uint16le-base64` with zero reserved for unknown cells and the
reported offset/scale used for decoding. One byte per sample carries knowledge,
cliff, water, visible path type, and in-camera flags. Shrouded cells remain
unknown; explored fog exposes static height/cliff data but not water/path data;
camera mode masks every sample outside the current view.

The read-only minimap uses the original radar availability, shroud, priority,
stealth, disguise, and perceived-color rules. It returns a compact base64
knowledge grid, quantized contact tuples, and the current camera footprint,
without object IDs, templates, exact world positions, or a minimap command
surface. If the local player has no radar, or a script hides it, the response
is `available:false` and contains no map data:

```sh
curl -H 'Authorization: Bearer TOKEN' \
  'http://127.0.0.1:18888/v1/sessions/game-1/minimap?columns=32&rows=32'
```

Move the tactical camera without synthesizing mouse input:

```sh
curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"x":1000,"y":800}' \
  http://127.0.0.1:18888/v1/sessions/game-1/camera

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"angle":0.5,"pitch":0.2,"zoom":0.8}' \
  http://127.0.0.1:18888/v1/sessions/game-1/camera/view
```

Angles and pitch are radians. The original view implementation normalizes the
angle and clamps pitch and zoom to the map's playable camera limits; the
response and subsequent world snapshot report the applied values.

Full `/world` objects include current command sets, production queues, movement
goals, and capability flags. The compact form separates command definitions
from live object and player state. Command entries identify their semantic type,
`execution` route, and, when applicable, product, cost, build time, availability,
upgrade, science, or special power. Clients must send the exact advertised
command name back with the object ID from the observation:

```sh
curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"sourceId":4,"command":"Command_ConstructChinaPowerPlant",\
       "position":{"x":1250.5,"y":390.5},"angle":0}' \
  http://127.0.0.1:18888/v1/sessions/game-1/game/commands

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"sourceId":8,"command":"Command_ConstructChinaTankBattlemaster"}' \
  http://127.0.0.1:18888/v1/sessions/game-1/game/commands
```

The command endpoint validates that the source still owns that live command,
checks current prerequisites/funds and construction legality in the engine, and
returns `accepted` after posting the real game message. Observe `/world` to
confirm its asynchronous simulation effects. Unsupported command types fail
explicitly; they never report canned success.

Commands whose `execution` is `playerCommand` come from a top-level player
command set instead of one object. This includes spending General Points and
using shortcut special powers:

```sh
curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"commandSet":"AmericaScienceCommandSetRank1",\
       "command":"Command_PurchaseSciencePaladinTank"}' \
  http://127.0.0.1:18888/v1/sessions/game-1/game/player-commands
```

Other advertised execution routes cover queue cancellation, individual
passenger exit, and multiplayer beacons:

```sh
curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"sourceId":9,"action":"cancel","productionId":41}' \
  http://127.0.0.1:18888/v1/sessions/game-1/game/production

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"containerId":17,"action":"exit","passengerId":18}' \
  http://127.0.0.1:18888/v1/sessions/game-1/game/container
```

Selection and tactical group orders use the same opaque IDs:

```sh
curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"objectIds":[10,11,12]}' \
  http://127.0.0.1:18888/v1/sessions/game-1/game/selection

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"action":"attackMove","objectIds":[10,11,12],\
       "position":{"x":2200,"y":1800}}' \
  http://127.0.0.1:18888/v1/sessions/game-1/game/orders

curl -X POST -H 'Authorization: Bearer TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"objectIds":[10,11],"targetId":27}' \
  http://127.0.0.1:18888/v1/sessions/game-1/game/context
```

Orders support `move`, `attackMove`, `attack`, `guardPosition`, `guardObject`,
`forceMove`, `forceAttackGround`, `forceAttackObject`, `waypoint`, `formation`,
`stop`, and `scatter`. Guard orders optionally accept `guardMode` as `normal`,
`withoutPursuit`, or `flyingOnly`. Object-targeted orders require a currently observable
target, and `attack` additionally requires an enemy relationship. Context
actions accept exactly one observable object target or world position and run
the original right-click evaluator. The response reports the action it chose;
this covers repair/get-repaired, heal, dock, enter/hijack/car-bomb/sabotage,
salvage, resume construction, capture/hack, rally, movement, and attack without
duplicating those ownership and validity rules in the bridge. A world
snapshot reports the authoritative terminal result as `game.outcome` once the
original victory conditions end the match. Because the native score-screen
transition resets live game state, the WebAssembly adapter retains `endFrame`
and `outcome` after that transition and marks `game.outcomeRetained=true`.
It also preserves the participating players' final score ledger—winner/loser,
calculated score, units and buildings built/lost/destroyed, and money
earned/spent—in `scoreboard`, with `game.scoreboardRetained=true`. The result
remains queryable from `/world` until the next match begins and is recoverable,
including that ledger, from the bounded event replay with
`events?types=game.outcome&after=0`; clients do not have to catch a one-frame
terminal snapshot.

Strict group orders remain atomic: one stale or invalid source rejects the
group. For long-running controllers that deliberately prefer progress over
formation semantics, `bestEffort:true` is bridge-side sugar. It submits the
same raw order once per source and returns `acceptedObjectIds` plus structured
`rejected` entries, so a destroyed unit cannot discard the live units' order.

In camera mode, selection, target objects, target positions, construction, and
special-power locations are checked against the current tactical view inside
the engine. A unit selected while visible remains usable after the camera pans,
matching the original select-then-pan interaction. Global mode retains the
fog-safe whole-map action surface. The raw request envelope passes through the
same browser-held session policy and cannot bypass these checks.

`POST /v1/sessions/{session}/requests` exposes the versioned raw operation
envelope for forward-compatible clients. `POST` bodies are limited to 1 MiB,
browser messages to 4 MiB, list pages to 128 rows, and bridge calls to 30
seconds by default.

## Protocol boundary

The browser uses WebSocket subprotocol `cnc-agent.v1` and authenticates in its
first JSON `hello` frame. The protocol advertises capabilities explicitly.
`protocol.describe`, `input.pointerMove`, `camera.lookAt`, `camera.setView`, `game.select`,
`game.order`, `game.context`, `game.command`, `game.playerCommand`, `game.production`,
`game.container`, `game.beacon`, `world.snapshot`, `terrain.query`,
`minimap.snapshot`, `hud.snapshot`, `chat.send`, `ui.snapshot`,
`ui.activate`, `ui.setText`, `ui.submit`, `ui.selectIndex`, `ui.setValue`, `ui.selectTab`,
and `ui.listItems` are the currently advertised operations.

The SSE endpoint is not another engine operation. It is a bridge-side view
built from authenticated `world.snapshot` calls and, only for HUD-aware
subscriptions, `hud.snapshot` calls while subscribed. This keeps the raw browser
protocol small and the disabled path free of background work.

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
npm run test:agent-bridge-ui
npm run test:agent-bridge-browser
```

For a long-lived manual or independent-agent match, `npm run
host:agent-bridge-match` starts the authenticated bridge, real browser runtime,
and an otherwise untouched shell session. It prints the ephemeral REST endpoint,
token, and session ID once connected and remains alive until interrupted. Use a
hardware-GPU browser and treat the printed credentials as secrets.

Set `AGENT_BRIDGE_VIDEO_DIR` to an artifact directory to record the complete
1280×800 browser session. The host prints the final `.webm` path after a clean
shutdown has flushed the recording.

The end-to-end acceptance runs used that host on an RTX 4080. A separate player
with only the REST endpoint first left the default global-mode skirmish settings
untouched, played one USA Superweapon human against one GLA Stealth `Easy Army`,
and reached the authoritative terminal result `game.outcome="victory"` at frame
27,791. A second independent run used fixed camera mode, played one USA human
against one GLA Stealth `Easy Army`, and won at frame 26,667. The retained
post-score snapshot still reported that exact end frame and victory. Neither run
used DOM access, screenshots, browser automation, source inspection, or a
non-REST control path.
