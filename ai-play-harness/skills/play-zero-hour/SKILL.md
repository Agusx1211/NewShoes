---
name: play-zero-hour
description: "Play a Command & Conquer Generals: Zero Hour match to its terminal outcome through the New Shoes authenticated direct-control API. Use for autonomous skirmish play when an agent needs a faction-neutral guide to game systems, semantic controls, capability discovery, event-driven cadence, camera-bound interaction, and authoritative outcome handling without a prescribed strategy or director scripts."
---

# Play Zero Hour

Play continuously until `game.outcome` is terminal. Choose the strategy from the live faction, map, opponent, resources, threats, and available capabilities; this skill explains mechanics and control semantics, not what to build or when to attack.

## Establish the control surface

1. Confirm the session, fixed play mode, faction, opponents, map, starting cash, and live game phase.
2. Read [direct-api.md](references/direct-api.md) for observations, semantic endpoints, advertised `execution` routes, and asynchronous command behavior.
3. Read [game-mechanics.md](references/game-mechanics.md) for the systems exposed to a player: economy, power, production, technology, upgrades, rank sciences, powers, movement, combat, transports, terrain, visibility, and victory state.
4. Fetch `world?detail=tactical&includeCapabilities=true`. Cache the reusable catalogs; omit capabilities from frequent reads until ownership, tech, unit types, or command sets change.
5. Open a filtered event stream as a wakeup channel. Keep periodic strategic snapshots because event silence does not imply that queues, resources, cooldowns, or idle units need no decision.

Use direct API calls only when the match forbids director mode. Do not create scripts, background controllers, or other independent players in that mode.

## Maintain two tempos

Run both tempos without allowing either to monopolize attention:

- Strategic pass, initially about every 10–20 real seconds: inspect outcome, resources, power, builders, construction, production queues, tech, upgrades, science points, power cooldowns, forces, known threats, and map information. Adjust the interval to game speed and current pressure.
- Tactical pass, woken by contact, attack, destruction, completion, an expiring cooldown, or a planned maneuver: refresh the relevant view and IDs, issue a small coherent set of orders, verify acceptance, then return to the strategic pass.

Use events to avoid blind polling. Do not poll after every projectile or movement frame. On `stream.resync`, refresh world state and capability catalogs. Keep a short ledger of actions still in flight and the frame or condition that warrants checking them again.

## Make decisions from systems, not a recipe

At each strategic pass, inspect these independent decision areas:

- Economy: current funds, observable supply sources, collectors, builders, income continuity, construction, and queued spending.
- Power: production, consumption, sufficiency, and the consequences of pending or destroyed structures.
- Capability progression: producer command sets, prerequisites, available upgrades, tech state, rank, unspent science points, owned sciences, and shortcut-power cooldowns.
- Force state: available units, health, veterancy, weapons, ranges, target classes, containment, current orders, losses, and nearby threats.
- Information: camera footprint, explored terrain, shroud, radar/minimap availability, visible contacts, and stale observations.
- Match state: player activity, victory conditions, terminal outcome, and retained scoreboard.

Decide the build order, composition, expansion, defenses, timing, targets, and risk tolerance yourself. Do not interpret the list as a mandate to purchase every capability or follow one faction's conventional plan.

## Execute advertised capabilities

Never guess command names. Join each object's `commandSet` to the cached `commandSets`, or use `playerCommandSets` for player-level actions. Inspect live availability in `objectCapabilities` or `playerCommandState`, then send the exact advertised names through their `execution` route.

An accepted request means the original engine message was posted. Construction, production, upgrades, movement, powers, and combat remain asynchronous; confirm their effects in later state. Refresh capabilities after a prerequisite, ownership, rank, producer, or command-set change rather than repeatedly requesting the same catalogs.

## Control groups and the camera

Use group orders when the same intent applies to several units. `bestEffort:true` lets surviving valid members proceed when IDs have gone stale; strict orders are atomic. `attackMove` moves toward a position while engaging encountered enemies, whereas direct `attack`, force-fire, guard, waypoint, formation, stop, scatter, and context actions express different intent. Select the action that matches your strategy.

In camera mode, pan first and refresh visible objects before selecting new units or targets. A selected force remains usable after panning, but new targets, target positions, construction sites, and placed powers must be in the tactical view. Global mode removes the camera footprint restriction but still respects fog, stealth, radar, and other human information rules.

## Finish and report

Continue making decisions through setbacks; do not stop merely because an attack failed or the position became poor. Stop only after an authoritative snapshot or event reports terminal `game.outcome`. Record outcome, end frame, retained scoreboard, and any requested recording artifact.
