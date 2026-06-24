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
};

const TEAM_COLORS = [
  { base: "#3b82f6", light: "#93c5fd", name: "USA" },
  { base: "#ef4444", light: "#fca5a5", name: "GLA" },
];

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

  spawnArmy(0, 160, [["Crusader", 2], ["Humvee", 3], ["Ranger", 5]]);
  spawnArmy(1, WORLD_W - 160, [["Crusader", 2], ["Humvee", 3], ["Ranger", 5]]);

  return { units, tick: 0, winner: null, events: [] };
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

  // Remove the dead and drop them from any selection.
  for (const unit of state.units) {
    if (unit.hp <= 0) {
      selection.delete(unit.id);
    }
  }
  state.units = state.units.filter((u) => u.hp > 0);

  state.tick++;

  const alive0 = state.units.some((u) => u.team === 0);
  const alive1 = state.units.some((u) => u.team === 1);
  if (!alive0 || !alive1) {
    state.winner = !alive0 && !alive1 ? "draw" : alive0 ? 0 : 1;
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
  if (k.color === "tank") {
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
  let p = 0;
  let e = 0;
  for (const u of state.units) {
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

  const resetBtn = document.querySelector("[data-play-reset]");
  if (resetBtn) resetBtn.addEventListener("click", () => reset((Math.floor(Date.now()) % 100000) + 1));
  const pauseBtn = document.querySelector("[data-play-pause]");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      paused = !paused;
      pauseBtn.textContent = paused ? "Resume" : "Pause";
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
      return state.units.length;
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
    world: { w: WORLD_W, h: WORLD_H },
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
