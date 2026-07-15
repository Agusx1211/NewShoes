# Game mechanics exposed by the harness

Use this as a neutral system map. It describes what can matter and where to observe or control it; it does not recommend a faction, build order, composition, target priority, or timing.

## Information and time

- The simulation keeps advancing while the agent reasons and calls tools.
- `frame`, `snapshotId`, event cursors, and object IDs let the agent detect stale state.
- Fog, shroud, stealth, disguise, radar availability, and camera policy limit information as they do for a human player.
- Terrain queries expose known height, cliffs, water, and path classes. The minimap exposes only information allowed by the original radar rules.
- Full snapshots are useful for discovery; compact tactical snapshots and filtered events are the normal live loop.

## Economy, ownership, and construction

- Local economy reports money. Observable supply sources, collectors, workers/builders, captures, and losses explain whether income can continue.
- Builders advertise legal construction commands, product cost/build time, current availability, and placement requirements.
- Buildings and units expose owner, relationship, health, construction completion, status, and command set.
- Construction and training consume time after acceptance. Producers expose their queues; queue entries can be cancelled by production ID when advertised.
- Capture, salvage, repair, docking, resuming unfinished construction, and related interactions use the original context evaluator rather than invented bridge rules.

## Power

- The local player reports power production, consumption, and sufficiency.
- Building completion, loss, capture, sale, and some upgrades can change the balance.
- Insufficient power affects powered game systems according to the original engine. Observe live availability and progress instead of assuming a command remains usable.

## Production, technology, and upgrades

- Each producer's command set is the authoritative catalog for units, buildings, upgrades, powers, modes, and other actions it currently owns.
- Product metadata includes template categories, cost, and build frames. Templates describe relevant unit/building capabilities without repeating them on every object.
- Tech prerequisites and ownership can change command availability. Refresh capability state after new construction, captures, upgrades, rank changes, or producer loss.
- Upgrades may apply to a player, object type, weapon, production path, economy, detection, or another subsystem. Use advertised names and live state; do not infer an upgrade from display text alone.
- Selling, evacuation, rally points, weapon modes, special-power construction, and cancellation appear through their advertised execution routes.

## Rank, General Points, and special powers

- Combat experience changes rank and may award science-purchase points.
- `playerCommandSets` contains rank science commands and faction shortcut commands. `playerCommandState` reports points, ownership, prerequisites, availability, source object, readiness, percent ready, and ready frame.
- Purchase sciences only through an available advertised player command. A science can unlock a unit, modifier, or one or more levels of a power.
- Special powers may require an owned science, a surviving source object, a legal target or visible position, and a completed cooldown. A shortcut is not evidence that all requirements are met; inspect its live state.
- Object-level powers and shortcut powers use different advertised routes even when they represent related effects.

## Selection, movement, and combat

- Selection establishes the current group. In camera mode, newly selected objects must be in view; selection persists while the camera moves.
- `move` travels to a position. `attackMove` travels while engaging encountered legal enemies. `attack` targets an observed enemy. Force-fire variants intentionally override normal target choice.
- Guard orders defend a position or object with normal, no-pursuit, or flying-only behavior. Waypoints, formation, stop, and scatter express other original command intents.
- Live object state can expose health, veterancy, weapons, range, damage, target classes, containment, current goals, production, and command availability. Decide grouping and target selection from that state.
- Direct command acceptance does not imply that pathfinding succeeds, a target survives, a weapon is in range, or the source survives to execute it.

## Transports, garrisons, and special interactions

- Containers expose observable passengers and capacity-related state. Use an advertised evacuation command for all passengers or the container route for one passenger.
- Context actions cover entering transports or structures, hijacking, car-bombing, sabotage, capture, hacking, healing, repair, salvage, and other original right-click behaviors when legal.
- Railed transports, combat drops, targeted-fire modes, and construction powers appear as ordinary discovered commands; use their declared route and argument requirements.
- Multiplayer beacons and chat are available but do not replace game orders.

## Camera, HUD, and shell

- Camera look-at, angle, pitch, and zoom use the original playable limits. Camera mode constrains tactical observation and spatial actions to the view; global mode remains fog-safe but is not camera-bound.
- HUD snapshots expose human-visible messages, popups, subtitles, and timers. UI snapshots and semantic gadget actions drive menus, lists, tabs, text fields, sliders, and buttons through the original UI path.
- The first shell menu may require one pointer-motion event before its buttons render.

## Victory and retained results

- The authoritative terminal value is `game.outcome`, not an inferred absence of enemies or structures.
- After the native score-screen transition clears live match objects, the harness retains outcome, end frame, and each participant's result, score, unit/building statistics, and money totals.
- Continue until terminal state unless the user explicitly authorizes surrender or early termination.
