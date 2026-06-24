// A minimal but genuinely playable real-time-strategy micro-battle running in
// the browser. It renders to a canvas, runs a fixed-timestep simulation with
// movement and combat, takes mouse input (select / move / attack), and ends
// with a decisive winner. Unit stats mirror the kinds of values parsed by the
// WebAssembly INI modules (locomotor speed, weapon range/damage, body health,
// armor), connecting this interactive layer to the data layer.

const WORLD_W = 1200;
const WORLD_H = 760;
const TICK_DT = 1 / 30; // fixed simulation timestep (seconds)

// Deterministic PRNG (mulberry32) so battles and tests are reproducible.
function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Representative unit archetypes. The numbers echo the shape of the parsed
// game data: speed ~ Locomotor, range/damage ~ Weapon, hp ~ Body, armor scales
// incoming damage like an Armor template.
const UNIT_KINDS = {
  Ranger: { label: "Ranger", hp: 90, speed: 46, range: 90, damage: 9, cooldown: 0.5, armor: 1.0, radius: 8, color: "infantry" },
  Humvee: { label: "Humvee", hp: 240, speed: 95, range: 130, damage: 14, cooldown: 0.4, armor: 0.8, radius: 12, color: "vehicle" },
  Crusader: { label: "Crusader", hp: 520, speed: 56, range: 160, damage: 46, cooldown: 1.2, armor: 0.55, radius: 15, color: "tank" },
  // A stationary command center: high health, cannot move or fire, but is a
  // valid target. Destroying it wins the battle outright.
  Base: { label: "Command Center", hp: 2200, speed: 0, range: 0, damage: 0, cooldown: 1, armor: 0.5, radius: 26, color: "base" },
};

const TEAM_COLORS = [
  { base: "#3b82f6", light: "#93c5fd", name: "USA" },
  { base: "#ef4444", light: "#fca5a5", name: "GLA" },
];

// Where the unit balance came from: the hardcoded archetypes, or the values
// re-derived at runtime by feeding INI text through the wasm parsers.
let statsSource = "defaults";

// Re-derive unit speed (Locomotor), weapon range and damage (Weapon) by running
// the actual WebAssembly parsers on INI snippets, so the playable layer is
// driven by the same code path as the data harness. Falls back to the
// hardcoded archetypes if the modules are unavailable. Snippet values match the
// defaults, so the battle stays deterministic regardless.
async function loadStatsFromWasm() {
  const loadModule = async (name) => {
    const bytes = await (await fetch(`../dist/${name}`)).arrayBuffer();
    return (await WebAssembly.instantiate(bytes, {})).instance.exports;
  };
  const feed = (exp, prefix, text) => {
    const bytes = new TextEncoder().encode(text);
    const mem = new Uint8Array(exp.memory.buffer);
    mem.set(bytes, exp[`generals_${prefix}_input_ptr`]());
    exp[`generals_${prefix}_parse`](bytes.length);
    return mem;
  };
  const readName = (exp, mem, prefix, i) => {
    const ptr = exp[`generals_${prefix}_name_ptr`](i);
    const size = exp[`generals_${prefix}_name_size`](i);
    return new TextDecoder().decode(mem.slice(ptr, ptr + size));
  };

  try {
    const [loco, weap] = await Promise.all([
      loadModule("generals_locomotor.wasm"),
      loadModule("generals_weapon.wasm"),
    ]);

    const locoIni = Object.entries(UNIT_KINDS)
      .map(([id, k]) => `Locomotor Play${id}\n  Surfaces = GROUND\n  Speed = ${k.speed}\nEnd\n`)
      .join("");
    const lm = feed(loco, "locomotor", locoIni);
    if (loco.generals_locomotor_error_count() !== 0) {
      throw new Error("locomotor parse error");
    }
    for (let i = 0; i < loco.generals_locomotor_template_count(); ++i) {
      const id = readName(loco, lm, "locomotor_template", i).replace(/^Play/, "");
      if (UNIT_KINDS[id]) {
        UNIT_KINDS[id].speed = loco.generals_locomotor_template_speed_x100(i) / 100;
      }
    }

    const weapIni = Object.entries(UNIT_KINDS)
      .map(([id, k]) => `Weapon Play${id}Gun\n  PrimaryDamage = ${k.damage}.0\n  AttackRange = ${k.range}.0\n  DelayBetweenShots = 500\nEnd\n`)
      .join("");
    const wm = feed(weap, "weapon", weapIni);
    if (weap.generals_weapon_error_count() !== 0) {
      throw new Error("weapon parse error");
    }
    for (let i = 0; i < weap.generals_weapon_template_count(); ++i) {
      const id = readName(weap, wm, "weapon_template", i).replace(/^Play/, "").replace(/Gun$/, "");
      if (UNIT_KINDS[id]) {
        UNIT_KINDS[id].damage = weap.generals_weapon_template_primary_damage_x100(i) / 100;
        UNIT_KINDS[id].range = weap.generals_weapon_template_attack_range_x100(i) / 100;
      }
    }

    statsSource = "wasm";
  } catch {
    statsSource = "defaults";
  }
}

let canvas, ctx;
let state;
let selection = new Set();
let dragStart = null;
let dragNow = null;
let paused = false;
let lastFrame = 0;
let accumulator = 0;

function createState(seed) {
  const rng = makeRng(seed);
  const units = [];
  let nextId = 1;

  function spawnArmy(team, baseX, composition) {
    let row = 0;
    for (const [kind, count] of composition) {
      for (let i = 0; i < count; ++i) {
        const k = UNIT_KINDS[kind];
        const y = 120 + row * 70 + i * 34 + (rng() - 0.5) * 12;
        const x = baseX + (rng() - 0.5) * 40 + row * 18;
        units.push({
          id: nextId++,
          team,
          kind,
          x,
          y: Math.max(40, Math.min(WORLD_H - 40, y)),
          hp: k.hp,
          maxHp: k.hp,
          cooldownRemaining: 0,
          order: null, // {type:'move'|'attack', x, y, targetId}
          flash: 0,
        });
      }
      row++;
    }
  }

  function spawnBase(team, x) {
    const k = UNIT_KINDS.Base;
    units.push({
      id: nextId++,
      team,
      kind: "Base",
      x,
      y: WORLD_H / 2,
      hp: k.hp,
      maxHp: k.hp,
      cooldownRemaining: 0,
      order: null,
      flash: 0,
    });
  }

  spawnBase(0, 56);
  spawnBase(1, WORLD_W - 56);
  spawnArmy(0, 200, [["Crusader", 2], ["Humvee", 3], ["Ranger", 5]]);
  spawnArmy(1, WORLD_W - 200, [["Crusader", 2], ["Humvee", 3], ["Ranger", 5]]);

  // Impassable terrain blobs (rock/cliff — the kind of terrain the Terrain
  // module marks with RestrictConstruction) placed down the centre, forcing
  // units to manoeuvre around them.
  const obstacles = [
    { x: WORLD_W / 2, y: 150, r: 54 },
    { x: WORLD_W / 2 - 70, y: WORLD_H / 2, r: 70 },
    { x: WORLD_W / 2 + 80, y: WORLD_H - 170, r: 60 },
  ];

  return {
    units,
    obstacles,
    nextId,
    reinforcements: { 0: 5, 1: 5 },
    enemyReinforceTick: 0,
    tick: 0,
    winner: null,
    events: [],
  };
}

// Spawn one reinforcement unit for a team at its back edge. Bounded by the
// per-team reinforcement pool, so the battle still terminates.
function spawnReinforcement(team, kind = "Humvee") {
  if (state.winner || state.reinforcements[team] <= 0) {
    return false;
  }
  if (!state.units.some((u) => u.team === team)) {
    return false; // a wiped-out team cannot reinforce
  }
  const k = UNIT_KINDS[kind];
  const baseX = team === 0 ? 70 : WORLD_W - 70;
  const offset = (state.reinforcements[team] % 5) * 36;
  state.units.push({
    id: state.nextId++,
    team,
    kind,
    x: baseX,
    y: WORLD_H / 2 - 72 + offset,
    hp: k.hp,
    maxHp: k.hp,
    cooldownRemaining: 0,
    order: null,
    flash: 0,
  });
  state.reinforcements[team] -= 1;
  return true;
}

function unitById(id) {
  return state.units.find((u) => u.id === id && u.hp > 0);
}

function nearestEnemy(unit) {
  let best = null;
  let bestD2 = Infinity;
  for (const other of state.units) {
    if (other.team === unit.team || other.hp <= 0) {
      continue;
    }
    const dx = other.x - unit.x;
    const dy = other.y - unit.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = other;
    }
  }
  return best;
}

function moveToward(unit, tx, ty, dt) {
  const k = UNIT_KINDS[unit.kind];
  const dx = tx - unit.x;
  const dy = ty - unit.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) {
    return 0;
  }
  const step = Math.min(dist, k.speed * dt);
  unit.x += (dx / dist) * step;
  unit.y += (dy / dist) * step;
  return dist - step;
}

function applySeparation(dt) {
  // Light repulsion so units do not perfectly stack (deterministic, no rng).
  for (let i = 0; i < state.units.length; ++i) {
    const a = state.units[i];
    if (a.hp <= 0) continue;
    const ra = UNIT_KINDS[a.kind].radius;
    for (let j = i + 1; j < state.units.length; ++j) {
      const b = state.units[j];
      if (b.hp <= 0) continue;
      const rb = UNIT_KINDS[b.kind].radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = ra + rb;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < min) {
        const push = ((min - d) / 2) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

function resolveObstacles() {
  // Push any unit overlapping an impassable blob back out to its edge; the
  // removed inward component leaves tangential motion, so units slide around.
  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    const ur = UNIT_KINDS[unit.kind].radius;
    for (const o of state.obstacles) {
      const dx = unit.x - o.x;
      const dy = unit.y - o.y;
      const min = o.r + ur;
      const d = Math.hypot(dx, dy);
      if (d > 0 && d < min) {
        unit.x = o.x + (dx / d) * min;
        unit.y = o.y + (dy / d) * min;
      } else if (d === 0) {
        unit.x = o.x + min;
      }
    }
    unit.x = Math.max(8, Math.min(WORLD_W - 8, unit.x));
    unit.y = Math.max(8, Math.min(WORLD_H - 8, unit.y));
  }
}

function stepOnce() {
  if (state.winner) {
    return;
  }
  const dt = TICK_DT;
  state.events.length = 0;

  for (const unit of state.units) {
    if (unit.hp <= 0) {
      continue;
    }
    const k = UNIT_KINDS[unit.kind];
    if (unit.cooldownRemaining > 0) {
      unit.cooldownRemaining = Math.max(0, unit.cooldownRemaining - dt);
    }
    if (unit.flash > 0) {
      unit.flash = Math.max(0, unit.flash - dt);
    }

    // Explicit move order: travel to the point, ignoring combat until arrived.
    if (unit.order && unit.order.type === "move") {
      const remaining = moveToward(unit, unit.order.x, unit.order.y, dt);
      if (remaining <= 1) {
        unit.order = null;
      }
      continue;
    }

    // Acquire a target: an explicit attack target if alive, else nearest enemy.
    let target = null;
    if (unit.order && unit.order.type === "attack") {
      target = unitById(unit.order.targetId);
      if (!target) {
        unit.order = null;
      }
    }
    if (!target) {
      target = nearestEnemy(unit);
    }
    if (!target) {
      continue;
    }

    const dist = Math.hypot(target.x - unit.x, target.y - unit.y);
    if (dist <= k.range) {
      if (unit.cooldownRemaining <= 0) {
        const armor = UNIT_KINDS[target.kind].armor;
        target.hp -= k.damage * armor;
        unit.cooldownRemaining = k.cooldown;
        unit.flash = 0.12;
        state.events.push({ ax: unit.x, ay: unit.y, bx: target.x, by: target.y, team: unit.team });
      }
    } else {
      // Close to just within weapon range.
      const stopDist = Math.max(0, dist - k.range * 0.9);
      const dx = target.x - unit.x;
      const dy = target.y - unit.y;
      moveToward(unit, unit.x + (dx / dist) * stopDist, unit.y + (dy / dist) * stopDist, dt);
    }
  }

  applySeparation(dt);
  resolveObstacles();

  // Remove the dead and drop them from any selection.
  for (const unit of state.units) {
    if (unit.hp <= 0) {
      selection.delete(unit.id);
    }
  }
  state.units = state.units.filter((u) => u.hp > 0);

  state.tick++;

  // The enemy commits a reinforcement when it falls behind (deterministic).
  if (state.tick - state.enemyReinforceTick >= 120 && !state.winner) {
    let t0 = 0;
    let t1 = 0;
    for (const u of state.units) {
      if (u.team === 0) t0++;
      else t1++;
    }
    if (t1 > 0 && t1 < t0 && state.reinforcements[1] > 0) {
      spawnReinforcement(1, "Humvee");
      state.enemyReinforceTick = state.tick;
    }
  }

  // Objective victory: destroy the enemy command center, or — if both sides run
  // out of mobile units while bases stand — a stalemate draw (keeps it finite).
  let base0 = false;
  let base1 = false;
  let mobile0 = false;
  let mobile1 = false;
  for (const u of state.units) {
    const isBase = u.kind === "Base";
    if (u.team === 0) {
      if (isBase) base0 = true;
      else mobile0 = true;
    } else {
      if (isBase) base1 = true;
      else mobile1 = true;
    }
  }
  if (!base0 && !base1) {
    state.winner = "draw";
  } else if (!base0) {
    state.winner = 1;
  } else if (!base1) {
    state.winner = 0;
  } else if (!mobile0 && !mobile1 && state.reinforcements[0] <= 0 && state.reinforcements[1] <= 0) {
    state.winner = "draw";
  }
}

function step(seconds) {
  const ticks = Math.max(1, Math.round(seconds / TICK_DT));
  for (let i = 0; i < ticks && !state.winner; ++i) {
    stepOnce();
  }
}

// ---- Rendering ---------------------------------------------------------------

function drawTerrain() {
  ctx.fillStyle = "#1f2733";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.strokeStyle = "rgba(120,140,160,0.10)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD_H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }
  for (const o of state.obstacles) {
    ctx.fillStyle = "#3a3327";
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,100,70,0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawUnit(unit) {
  const k = UNIT_KINDS[unit.kind];
  const team = TEAM_COLORS[unit.team];
  if (selection.has(unit.id)) {
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(unit.x, unit.y, k.radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = unit.flash > 0 ? team.light : team.base;
  if (k.color === "base") {
    ctx.fillRect(unit.x - k.radius, unit.y - k.radius, k.radius * 2, k.radius * 2);
    ctx.strokeStyle = team.light;
    ctx.lineWidth = 2;
    ctx.strokeRect(unit.x - k.radius, unit.y - k.radius, k.radius * 2, k.radius * 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(unit.x - 6, unit.y - 6, 12, 12);
  } else if (k.color === "tank") {
    ctx.fillRect(unit.x - k.radius, unit.y - k.radius * 0.7, k.radius * 2, k.radius * 1.4);
  } else if (k.color === "vehicle") {
    ctx.beginPath();
    ctx.moveTo(unit.x, unit.y - k.radius);
    ctx.lineTo(unit.x + k.radius, unit.y + k.radius);
    ctx.lineTo(unit.x - k.radius, unit.y + k.radius);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(unit.x, unit.y, k.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  // HP bar.
  const frac = Math.max(0, unit.hp / unit.maxHp);
  const w = k.radius * 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(unit.x - k.radius, unit.y - k.radius - 8, w, 4);
  ctx.fillStyle = frac > 0.5 ? "#22c55e" : frac > 0.25 ? "#eab308" : "#ef4444";
  ctx.fillRect(unit.x - k.radius, unit.y - k.radius - 8, w * frac, 4);
}

function drawEvents() {
  for (const e of state.events) {
    ctx.strokeStyle = e.team === 0 ? "rgba(147,197,253,0.9)" : "rgba(252,165,165,0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(e.ax, e.ay);
    ctx.lineTo(e.bx, e.by);
    ctx.stroke();
  }
}

function drawSelectionBox() {
  if (dragStart && dragNow) {
    const x = Math.min(dragStart.x, dragNow.x);
    const y = Math.min(dragStart.y, dragNow.y);
    const w = Math.abs(dragNow.x - dragStart.x);
    const h = Math.abs(dragNow.y - dragStart.y);
    ctx.strokeStyle = "rgba(253,224,71,0.8)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(253,224,71,0.08)";
    ctx.fillRect(x, y, w, h);
  }
}

function render() {
  drawTerrain();
  drawEvents();
  for (const unit of state.units) {
    drawUnit(unit);
  }
  drawSelectionBox();
  updateHud();
}

function counts() {
  // Mobile units only — the command centers are reported via their HP bars.
  let p = 0;
  let e = 0;
  for (const u of state.units) {
    if (u.kind === "Base") continue;
    if (u.team === 0) p++;
    else e++;
  }
  return { p, e };
}

function updateHud() {
  const { p, e } = counts();
  const playerEl = document.querySelector("[data-play-player]");
  const enemyEl = document.querySelector("[data-play-enemy]");
  const tickEl = document.querySelector("[data-play-tick]");
  const statusEl = document.querySelector("[data-play-status]");
  const reinforceBtn = document.querySelector("[data-play-reinforce]");
  if (reinforceBtn) {
    const left = state.reinforcements[0];
    reinforceBtn.textContent = `Reinforce (${left})`;
    reinforceBtn.disabled = left <= 0 || state.winner !== null;
  }
  const sourceEl = document.querySelector("[data-play-source]");
  if (sourceEl) {
    sourceEl.textContent = statsSource === "wasm" ? "balance: wasm-parsed (Locomotor + Weapon)" : "balance: defaults";
  }
  if (playerEl) playerEl.textContent = `${p}`;
  if (enemyEl) enemyEl.textContent = `${e}`;
  if (tickEl) tickEl.textContent = `${state.tick}`;
  if (statusEl) {
    if (state.winner === 0) statusEl.textContent = "Victory — USA wins";
    else if (state.winner === 1) statusEl.textContent = "Defeat — GLA wins";
    else if (state.winner === "draw") statusEl.textContent = "Mutual annihilation";
    else statusEl.textContent = `${selection.size} selected`;
  }
}

function frame(now) {
  if (!lastFrame) lastFrame = now;
  let delta = (now - lastFrame) / 1000;
  lastFrame = now;
  if (delta > 0.25) delta = 0.25;
  if (!paused) {
    accumulator += delta;
    while (accumulator >= TICK_DT) {
      stepOnce();
      accumulator -= TICK_DT;
    }
  }
  render();
  requestAnimationFrame(frame);
}

// ---- Input -------------------------------------------------------------------

function worldFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * WORLD_W,
    y: ((ev.clientY - rect.top) / rect.height) * WORLD_H,
  };
}

function unitAt(pt) {
  let best = null;
  let bestD = Infinity;
  for (const u of state.units) {
    const d = Math.hypot(u.x - pt.x, u.y - pt.y);
    if (d < UNIT_KINDS[u.kind].radius + 6 && d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function bindInput() {
  canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
  canvas.addEventListener("mousedown", (ev) => {
    const pt = worldFromEvent(ev);
    if (ev.button === 0) {
      dragStart = pt;
      dragNow = pt;
    } else if (ev.button === 2) {
      issueOrder(pt);
    }
  });
  canvas.addEventListener("mousemove", (ev) => {
    if (dragStart) dragNow = worldFromEvent(ev);
  });
  window.addEventListener("mouseup", (ev) => {
    if (ev.button !== 0 || !dragStart) return;
    const end = worldFromEvent(ev);
    finalizeSelection(dragStart, end);
    dragStart = null;
    dragNow = null;
  });
}

function finalizeSelection(a, b) {
  selection.clear();
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  if (Math.hypot(b.x - a.x, b.y - a.y) < 6) {
    const u = unitAt(b);
    if (u && u.team === 0) selection.add(u.id);
    return;
  }
  for (const u of state.units) {
    if (u.team === 0 && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) {
      selection.add(u.id);
    }
  }
}

function issueOrder(pt) {
  const target = unitAt(pt);
  const ids = [...selection];
  ids.forEach((id, index) => {
    const u = unitById(id);
    if (!u) return;
    if (target && target.team !== 0) {
      u.order = { type: "attack", targetId: target.id };
    } else {
      const angle = (index / Math.max(1, ids.length)) * Math.PI * 2;
      u.order = { type: "move", x: pt.x + Math.cos(angle) * 18, y: pt.y + Math.sin(angle) * 18 };
    }
  });
}

// ---- Boot --------------------------------------------------------------------

function reset(seed) {
  state = createState(seed ?? 1337);
  selection.clear();
  accumulator = 0;
  paused = false;
}

function boot() {
  canvas = document.querySelector("[data-play-canvas]");
  ctx = canvas.getContext("2d");
  canvas.width = WORLD_W;
  canvas.height = WORLD_H;
  reset(1337);
  bindInput();

  // Best-effort: re-derive balance through the wasm parsers (non-blocking).
  loadStatsFromWasm();

  const resetBtn = document.querySelector("[data-play-reset]");
  if (resetBtn) resetBtn.addEventListener("click", () => reset((Math.floor(Date.now()) % 100000) + 1));
  const pauseBtn = document.querySelector("[data-play-pause]");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.textContent = paused ? "Resume" : "Pause";
    });
  }
  const reinforceBtn = document.querySelector("[data-play-reinforce]");
  if (reinforceBtn) {
    reinforceBtn.addEventListener("click", () => {
      spawnReinforcement(0, "Humvee");
    });
  }

  requestAnimationFrame(frame);

  // Headless test / automation hook.
  window.__game = {
    reset,
    snapshot() {
      const c = counts();
      return { tick: state.tick, playerCount: c.p, enemyCount: c.e, winner: state.winner };
    },
    setPaused(value) {
      paused = value;
    },
    step,
    stepOnce,
    unitCount() {
      return state.units.filter((u) => u.kind !== "Base").length;
    },
    listUnits() {
      return state.units.map((u) => ({
        id: u.id,
        team: u.team,
        kind: u.kind,
        x: u.x,
        y: u.y,
        hp: u.hp,
        order: u.order ? u.order.type : null,
      }));
    },
    unit(id) {
      const u = unitById(id);
      return u ? { id: u.id, team: u.team, x: u.x, y: u.y, hp: u.hp, order: u.order ? u.order.type : null } : null;
    },
    selectionSize() {
      return selection.size;
    },
    statsSource() {
      return statsSource;
    },
    obstacles() {
      return state.obstacles.map((o) => ({ x: o.x, y: o.y, r: o.r }));
    },
    unitRadius(kind) {
      return UNIT_KINDS[kind] ? UNIT_KINDS[kind].radius : 0;
    },
    reinforce(team = 0, kind = "Humvee") {
      return spawnReinforcement(team, kind);
    },
    reinforcementsLeft(team = 0) {
      return state.reinforcements[team];
    },
    loadStatsFromWasm,
    kindStats() {
      return JSON.parse(JSON.stringify(UNIT_KINDS));
    },
    world: { w: WORLD_W, h: WORLD_H },
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
