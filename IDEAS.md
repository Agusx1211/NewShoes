# IDEAS.md - Deferred and experimental ideas

Non-blocking ideas live here so `TODO.md` stays focused on the active open
port checklist. When an idea becomes current work, promote the next concrete
action into `TODO.md`; keep the longer rationale here.

Search `DONE.md` before turning an idea into work, so completed history is not
rediscovered as a new plan.

---

## Future / experimental: "LLM plays CnC" harness

Once a playable skirmish boots (M6+) the engine already has the right seams for
an external/LLM player, so the harness is the real work, not engine surgery.
Key facts from the original source that make this tractable:

- The strategic AI is a pluggable subclass: `Player::setPlayerType()`
  (`Source/Common/RTS/Player.cpp:768`) creates either `AIPlayer` or
  `AISkirmishPlayer` as `Player::m_ai`, and `Player::update()` calls
  `m_ai->update()` each frame. An LLM player is a third subclass of `AIPlayer`
  whose `update()` defers to an out-of-process LLM instead of the hardcoded
  heuristics in `doBaseBuilding`/`doTeamBuilding`/`selectTeamToBuild`.
- The action vocabulary is finite and already a message bus: `MSG_DO_*` /
  `MSG_QUEUE_*` in `Include/Common/MessageStream.h` (MOVE, ATTACK_OBJECT,
  GUARD_POSITION, QUEUE_UNIT_CREATE, QUEUE_UPGRADE, SET_RALLY_POINT,
  DO_SPECIAL_POWER, FORCE_ATTACK_GROUND, SCATTER, STOP, ...). These are the
  same GameMessages human mouse clicks are translated into by
  `GameClient/MessageStream/*Xlat.cpp`. The LLM action layer maps text /
  function-calls onto this enum plus ObjectIDs/locations.
- The observation layer exists: `PartitionManager`
  (`getClosestObject`, `iterateObjectsInRange`) is the spatial "what can I see"
  query; `Player` holds its own unit list; `TheBuildAssistant->buildObjectNow`
  is how buildings get placed.
- The tactical micro is free: per-unit `AIUpdate` modules (`JetAIUpdate`,
  `DozerAIUpdate`, `TurretAI`, pathfinding in `AIPathfind.cpp`) run for every
  unit regardless of who owns them, so the LLM only needs to do strategy
  (economy, build order, army comp, where/when to attack, generals' powers),
  not per-unit micro.

Tasks to promote when M6+ makes this actionable:

- Add an `LLMPlayer : AIPlayer` subclass whose `update()` pauses/steps the sim
  and asks an out-of-process model for the next orders. Keep this single-player
  only; it breaks multiplayer lockstep.
- Add sim pause/step control so a multi-second LLM round-trip does not stall or
  desync the deterministic sim. This should reuse the harness stepping needed
  for M6.
- Build an observation serializer that turns fog-of-war-filtered game state
  into a token-budgeted model prompt: spatial summary, threats near base, own
  units, enemy contacts, build queues, money, power, and tech tier.
- Add an action parser with a constrained-output schema (function calling /
  JSON) that grounds LLM output onto real `MSG_DO_*` / `MSG_QUEUE_*` messages,
  valid ObjectIDs, and world coordinates.
- Expose the flow through the harness RPC control surface: boot, set LLM as a
  side's player, start match, step, read back state, and capture screenshot.
- Establish an evaluation baseline: can an LLM beat the built-in skirmish AI on
  easy?
- Decide per-frame vs per-decision cadence and batch orders to bound call rate.
