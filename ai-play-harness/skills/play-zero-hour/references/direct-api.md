# Direct-control API

All requests use the supplied session REST base and bearer token. The bridge fixes play mode to `global` or `camera` when the session starts; a client cannot change or bypass it.

## Observe

```text
GET /v1/sessions
GET /v1/sessions/{session}/world?detail=tactical&includeCapabilities=true
GET /v1/sessions/{session}/world?detail=tactical
GET /v1/sessions/{session}/events?wakeOnly=true&minSeverity=warning
GET /v1/sessions/{session}/terrain?...bounded grid query...
GET /v1/sessions/{session}/minimap?columns=32&rows=32
GET /v1/sessions/{session}/hud
GET /v1/sessions/{session}/ui
GET /v1/sessions/{session}/ui/items?windowId=...&name=...&offset=...&limit=...
```

The compact world snapshot contains short object records. With `includeCapabilities=true`, reusable definitions live in top-level `templates`, `commandSets`, and `playerCommandSets`; live object state is keyed by object ID in `objectCapabilities`, and live science/shortcut state is in `playerCommandState`. Join catalogs locally instead of asking the engine to repeat definitions on every tactical read.

Object IDs are stable opaque handles created only for observable objects. Hidden, shrouded, undrawable, or undetected objects are absent. Enemy economy and private motion are not exposed. Camera mode additionally limits tactical objects and terrain samples to the rendered view. The minimap follows the original radar, shroud, stealth, disguise, and perceived-color rules and intentionally returns contacts rather than exact object identities.

The SSE event stream accepts replay cursors plus `types`, `relationships`, `objectIds`, region, severity, and wake-only filters. Heartbeats do not wake the listener. After `stream.resync`, fetch a new world snapshot. Always retain a periodic strategic snapshot; the event stream reports changes, not the absence of a pending decision.

## Execute by advertised route

Every discovered command has an `execution` value:

| `execution` | Endpoint | Scope |
| --- | --- | --- |
| `order` | `/game/orders` | Movement, attack, guard, waypoint, formation, stop, scatter |
| `command` | `/game/commands` | Construction, training, upgrades, selling, evacuation, special powers, weapon modes |
| `playerCommand` | `/game/player-commands` | Science purchase, shortcut powers, select-all-of-type |
| `production` | `/game/production` | Cancel a queued unit or upgrade |
| `container` | `/game/container` | Exit an individual passenger |
| `beacon` | `/game/beacons` | Place, remove, or rename a multiplayer beacon |

Common calls:

```json
POST /game/selection
{"objectIds":[10,11,12]}

POST /game/commands
{"sourceId":4,"command":"<advertised command>","position":{"x":1250,"y":390},"angle":0}

POST /game/orders
{"action":"attackMove","objectIds":[10,11,12],"position":{"x":2200,"y":1800},"bestEffort":true}

POST /game/context
{"objectIds":[10,11],"targetId":27}

POST /game/player-commands
{"commandSet":"<advertised set>","command":"<advertised command>","position":{"x":900,"y":700}}

POST /game/production
{"sourceId":9,"action":"cancel","productionId":41}

POST /game/container
{"containerId":17,"action":"exit","passengerId":18}
```

Orders support `move`, `attackMove`, `attack`, `guardPosition`, `guardObject`, `forceMove`, `forceAttackGround`, `forceAttackObject`, `waypoint`, `formation`, `stop`, and `scatter`. Guard modes are `normal`, `withoutPursuit`, and `flyingOnly`. Context runs the original right-click evaluator for repair, heal, dock, enter, hijack, car bomb, sabotage, salvage, resume construction, capture, hack, rally, movement, and attack.

Use `/camera` to set look-at position and `/camera/view` for angle, pitch, or zoom. Angles are radians; the engine normalizes or clamps values. In camera mode, selection, new target objects and positions, construction sites, and placed powers must be visible. Selection persists while panning.

Use `/chat` for game chat and semantic `/ui/*` endpoints for shell setup. Before the first main-menu snapshot, send one `/input/pointer` motion because the original shell reveals its buttons after initial pointer movement. `/requests` exposes the same versioned raw operations for forward compatibility; it does not bypass session policy.

## Treat calls as asynchronous

The bridge validates ownership, current availability, funds, prerequisites, placement, observability, and command type before posting the real engine message. `accepted` means posted, not completed. Re-observe on a useful cadence to confirm completion, rejection by later game state, cooldown, casualties, or changed ownership.

Strict group orders reject atomically when any source is invalid. `bestEffort:true` submits the same order per source and reports accepted IDs plus structured rejections. Use it when losses may make a cached group stale, not when atomic formation semantics matter.

Terminal `game.outcome`, `endFrame`, and the final scoreboard remain retained after the native score transition. They are also replayable from `events?types=game.outcome&after=0` until the next match begins.
