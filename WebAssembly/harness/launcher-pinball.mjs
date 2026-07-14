const TABLE_WIDTH = 600;
const TABLE_HEIGHT = 900;
const FIXED_STEP = 1 / 240;
const BALL_RADIUS = 11;
const MAX_BALL_SPEED = 1250;
const STORAGE_KEY = "cnc-shock-awe-pinball";

const ART_PATHS = Object.freeze({
  playfield: "./assets/games/pinball-playfield-war.png",
  bumperOff: "./assets/games/pinball-bumper-war-off.png",
  bumperOn: "./assets/games/pinball-bumper-war.png",
  flipper: "./assets/games/pinball-flipper-war.png",
  commandOff: "./assets/games/pinball-command-center-war-off.png",
  commandOn: "./assets/games/pinball-command-center-war.png",
  insertOff: "./assets/games/pinball-insert-war-off.png",
  insertOn: "./assets/games/pinball-insert-war-on.png",
});

const MISSIONS = Object.freeze([
  { id: "air", name: "AIR SUPERIORITY", event: "bumper", goal: 8, award: 35000, brief: "Strike the three radar domes 8 times." },
  { id: "supply", name: "SUPPLY LINES", event: "lane", goal: 4, award: 50000, brief: "Clear 4 illuminated convoy lanes." },
  { id: "targets", name: "TARGET ACQUISITION", event: "target", goal: 5, award: 75000, brief: "Drop 5 hardened field targets." },
  { id: "shock", name: "SHOCK & AWE", event: "ramp", goal: 3, award: 100000, brief: "Storm the command ramp 3 times." },
]);

const BUMPERS = Object.freeze([
  { id: "radar-a", x: 235, y: 235, radius: 34, kick: 335 },
  { id: "radar-b", x: 355, y: 242, radius: 34, kick: 335 },
  { id: "radar-c", x: 299, y: 332, radius: 31, kick: 315 },
]);

const TARGETS = Object.freeze([
  { id: "target-a", x: 106, y: 454, radius: 17 },
  { id: "target-b", x: 137, y: 497, radius: 17 },
  { id: "target-c", x: 460, y: 430, radius: 17 },
  { id: "target-d", x: 483, y: 480, radius: 17 },
  { id: "target-e", x: 445, y: 532, radius: 17 },
]);

const COMMAND_CENTER = Object.freeze({ id: "command-center", x: 462, y: 334, radius: 38, kick: 245, elasticity: .86 });

const LANES = Object.freeze([
  { id: "lane-a", x: 151, y: 116, label: "A" },
  { id: "lane-b", x: 242, y: 93, label: "I" },
  { id: "lane-c", x: 335, y: 93, label: "R" },
  { id: "lane-d", x: 427, y: 116, label: "+" },
]);

const WALLS = Object.freeze([
  { id: "outer-left-a", a: [52, 760], b: [30, 146], radius: 7, elasticity: .83 },
  { id: "outer-left-b", a: [30, 146], b: [92, 66], radius: 7, elasticity: .86 },
  { id: "outer-top-a", a: [92, 66], b: [468, 52], radius: 7, elasticity: .88 },
  { id: "outer-top-b", a: [468, 52], b: [527, 113], radius: 7, elasticity: .88 },
  { id: "outer-right", a: [577, 106], b: [577, 866], radius: 7, elasticity: .82 },
  { id: "launch-deflector", a: [520, 90], b: [576, 118], radius: 7, elasticity: .9 },
  { id: "launch-divider", a: [522, 185], b: [522, 845], radius: 6, elasticity: .78 },
  { id: "launch-guide", a: [522, 185], b: [493, 119], radius: 6, elasticity: .84 },
  { id: "top-guide", a: [493, 119], b: [451, 86], radius: 6, elasticity: .86 },
  { id: "left-outlane", a: [52, 756], b: [137, 828], radius: 8, elasticity: .72 },
  { id: "left-inlane", a: [87, 664], b: [183, 784], radius: 7, elasticity: .75 },
  { id: "right-inlane", a: [510, 665], b: [417, 784], radius: 7, elasticity: .75 },
  { id: "right-outlane", a: [463, 828], b: [522, 760], radius: 8, elasticity: .72 },
  { id: "left-bunker", a: [83, 554], b: [166, 624], radius: 9, elasticity: .82, event: "sling", kick: 105 },
  { id: "right-bunker", a: [510, 558], b: [431, 624], radius: 9, elasticity: .82, event: "sling", kick: 105 },
  { id: "ramp-left", a: [82, 404], b: [153, 300], radius: 6, elasticity: .76 },
  { id: "ramp-right", a: [186, 407], b: [170, 299], radius: 6, elasticity: .76 },
]);

const FLIPPER_DEFS = Object.freeze([
  { id: "left", base: [210, 812], length: 96, rest: .37, active: -.48 },
  { id: "right", base: [390, 812], length: 96, rest: Math.PI - .37, active: Math.PI + .48 },
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatScore(score) {
  return Math.max(0, Math.floor(score)).toLocaleString("en-US");
}

function closestPoint(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator ? clamp(((x - ax) * dx + (y - ay) * dy) / denominator, 0, 1) : 0;
  return { x: ax + dx * t, y: ay + dy * t, t };
}

function loadArt(paths) {
  return Object.fromEntries(Object.entries(paths).map(([key, source]) => {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    return [key, image];
  }));
}

function imageReady(image) {
  return image.complete && image.naturalWidth;
}

function readPersistentState(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    return { highScore: Math.max(0, Number(parsed?.highScore) || 0) };
  } catch {
    return { highScore: 0 };
  }
}

function savePersistentState(storage, highScore) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify({ highScore })); } catch { /* storage is optional */ }
}

function createPinballAudio() {
  let context = null;
  let noiseBuffer = null;
  let lastRailAt = 0;

  const enabled = () => {
    try { return window.localStorage.getItem("cnc-xp-games-sound") !== "off"; } catch { return true; }
  };

  const prepare = () => {
    if (!enabled()) return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    context ||= new AudioContextClass();
    void context.resume();
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .28), context.sampleRate);
      const channel = noiseBuffer.getChannelData(0);
      for (let index = 0; index < channel.length; ++index) channel[index] = Math.random() * 2 - 1;
    }
    return context;
  };

  const tone = (ctx, { type = "triangle", from, to = from, duration, gain = .04, offset = 0 }) => {
    const start = ctx.currentTime + .004 + offset;
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    volume.gain.setValueAtTime(gain, start);
    volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(volume).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  };

  const noise = (ctx, { duration, gain, highpass = 300, offset = 0 }) => {
    const start = ctx.currentTime + .004 + offset;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const volume = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = highpass;
    volume.gain.setValueAtTime(gain, start);
    volume.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter).connect(volume).connect(ctx.destination);
    source.start(start);
    source.stop(start + duration);
  };

  const play = (name, strength = 1) => {
    const ctx = prepare();
    if (!ctx) return;
    const scale = clamp(strength, .35, 1.5);
    if (name === "flipper") {
      tone(ctx, { type: "square", from: 132, to: 76, duration: .055, gain: .035 * scale });
      noise(ctx, { duration: .035, gain: .018 * scale, highpass: 900 });
    } else if (name === "plunger") {
      tone(ctx, { type: "sawtooth", from: 82, to: 43, duration: .12, gain: .025 * scale });
      noise(ctx, { duration: .08, gain: .02 * scale, highpass: 500 });
    } else if (name === "launch") {
      tone(ctx, { type: "triangle", from: 95, to: 280, duration: .16, gain: .045 * scale });
      noise(ctx, { duration: .065, gain: .024 * scale, highpass: 700 });
    } else if (name === "bumper") {
      tone(ctx, { type: "square", from: 245, to: 116, duration: .075, gain: .055 * scale });
      tone(ctx, { type: "triangle", from: 510, to: 240, duration: .09, gain: .025 * scale, offset: .012 });
    } else if (name === "target") {
      tone(ctx, { type: "square", from: 190, to: 105, duration: .055, gain: .038 * scale });
      noise(ctx, { duration: .045, gain: .014 * scale, highpass: 1200 });
    } else if (name === "rail") {
      if (ctx.currentTime - lastRailAt < .045) return;
      lastRailAt = ctx.currentTime;
      noise(ctx, { duration: .035, gain: .012 * scale, highpass: 1800 });
      tone(ctx, { type: "triangle", from: 150, to: 105, duration: .045, gain: .012 * scale });
    } else if (name === "drain") {
      tone(ctx, { type: "sawtooth", from: 180, to: 52, duration: .42, gain: .04 });
      tone(ctx, { type: "triangle", from: 130, to: 39, duration: .48, gain: .025, offset: .05 });
    } else if (name === "mission") {
      [392, 523, 659, 784].forEach((frequency, index) => tone(ctx, { from: frequency, duration: .14, gain: .03, offset: index * .085 }));
    } else if (name === "extra") {
      [523, 659, 784, 1046].forEach((frequency, index) => tone(ctx, { type: "square", from: frequency, duration: .18, gain: .025, offset: index * .095 }));
    } else if (name === "tilt") {
      tone(ctx, { type: "sawtooth", from: 120, to: 72, duration: .65, gain: .045 });
    }
  };

  return { prepare, play };
}

function createMarkup(board) {
  board.innerHTML = `
    <div class="pinball-cabinet" data-pinball-cabinet>
      <aside class="pinball-score-panel" aria-label="Pinball status">
        <header><span>COMMAND NET</span><strong>SHOCK &amp; AWE</strong><small>3D PINBALL</small></header>
        <section class="pinball-led"><span>SCORE</span><b data-pinball-score>0</b><span>HIGH SCORE</span><b data-pinball-high-score>0</b></section>
        <section class="pinball-readout"><span>BALL <b data-pinball-ball>1 / 3</b></span><span>MULTIPLIER <b data-pinball-multiplier>1×</b></span></section>
        <section class="pinball-mission"><span>CURRENT OPERATION</span><strong data-pinball-mission>AIR SUPERIORITY</strong><p data-pinball-brief></p><div><i data-pinball-progress></i></div><small data-pinball-progress-label>0 / 8</small></section>
        <section class="pinball-orders"><b>FIELD CONTROLS</b><span><kbd>Z</kbd> left flipper</span><span><kbd>/</kbd> right flipper</span><span><kbd>SPACE</kbd> plunger</span><span><kbd>X</kbd> <kbd>.</kbd> <kbd>↑</kbd> nudge</span><span><kbd>F3</kbd> pause</span></section>
        <div class="pinball-message" data-pinball-message>HOLD SPACE TO CHARGE</div>
      </aside>
      <main class="pinball-table-wrap">
        <canvas class="pinball-table" data-pinball-canvas width="600" height="900" tabindex="0" aria-label="Shock and Awe pinball table. Use Z and slash for flippers, Space for the plunger, X period and Up Arrow to nudge."></canvas>
        <div class="pinball-plunger-meter" aria-hidden="true"><span>POWER</span><i><b data-pinball-power></b></i></div>
        <div class="pinball-touch-controls" aria-label="Pinball touch controls">
          <button type="button" data-pinball-control="left" aria-label="Left flipper">LEFT</button>
          <button type="button" data-pinball-control="nudge" aria-label="Nudge table">NUDGE</button>
          <button type="button" data-pinball-control="plunger" aria-label="Pull plunger">LAUNCH</button>
          <button type="button" data-pinball-control="right" aria-label="Right flipper">RIGHT</button>
        </div>
      </main>
    </div>`;
}

export function createWarPinball(root) {
  const board = root.querySelector("[data-game-board]");
  createMarkup(board);
  const canvas = board.querySelector("[data-pinball-canvas]");
  const context = canvas.getContext("2d", { alpha: false });
  const windowElement = root.closest(".window");
  const art = loadArt(ART_PATHS);
  const audio = createPinballAudio();
  const storage = (() => { try { return window.localStorage; } catch { return null; } })();
  const persistent = readPersistentState(storage);

  const dom = {
    score: board.querySelector("[data-pinball-score]"),
    highScore: board.querySelector("[data-pinball-high-score]"),
    ball: board.querySelector("[data-pinball-ball]"),
    multiplier: board.querySelector("[data-pinball-multiplier]"),
    mission: board.querySelector("[data-pinball-mission]"),
    brief: board.querySelector("[data-pinball-brief]"),
    progress: board.querySelector("[data-pinball-progress]"),
    progressLabel: board.querySelector("[data-pinball-progress-label]"),
    message: board.querySelector("[data-pinball-message]"),
    power: board.querySelector("[data-pinball-power]"),
    status: root.querySelector("[data-game-status]"),
  };

  let state;
  let previousFrame = performance.now();
  let accumulator = 0;
  let animationFrame = 0;
  let lastHudKey = "";

  const currentMission = () => MISSIONS[state.missionIndex];

  const freshBall = () => ({ x: 552, y: 819, vx: 0, vy: 0, radius: BALL_RADIUS, previousY: 819 });

  const initialState = () => ({
    phase: "ready",
    paused: false,
    score: 0,
    highScore: persistent.highScore,
    ballNumber: 1,
    ballsTotal: 3,
    ball: freshBall(),
    plunger: 0,
    plungerHeld: false,
    flippers: FLIPPER_DEFS.map((flipper) => ({ angle: flipper.rest, omega: 0, pressed: false })),
    simTime: 0,
    serveAt: 0,
    ballSaverUntil: 0,
    tilt: 0,
    tilted: false,
    multiplier: 1,
    laneLights: new Set(),
    targetLights: new Set(),
    lampUntil: Object.create(null),
    contacts: new Set(),
    zoneContacts: new Set(),
    launchGateReady: true,
    missionIndex: 0,
    missionProgress: 0,
    extraBallAwarded: false,
    combo: 0,
    comboUntil: 0,
    flashes: [],
    shakeX: 0,
    shakeY: 0,
    message: "HOLD SPACE TO CHARGE",
    previousHighScore: persistent.highScore,
  });

  const setMessage = (message) => {
    state.message = message;
    dom.status.textContent = message;
  };

  const updateHud = (force = false) => {
    const mission = currentMission();
    const hudKey = [state.score, state.highScore, state.ballNumber, state.ballsTotal, state.multiplier, state.missionIndex, state.missionProgress, state.message, state.phase, state.paused].join(":");
    if (!force && hudKey === lastHudKey) return;
    lastHudKey = hudKey;
    dom.score.textContent = formatScore(state.score);
    dom.highScore.textContent = formatScore(state.highScore);
    dom.ball.textContent = `${state.ballNumber} / ${state.ballsTotal}`;
    dom.multiplier.textContent = `${state.multiplier}×`;
    dom.mission.textContent = mission.name;
    dom.brief.textContent = mission.brief;
    dom.progress.style.width = `${clamp(state.missionProgress / mission.goal, 0, 1) * 100}%`;
    dom.progressLabel.textContent = `${Math.min(state.missionProgress, mission.goal)} / ${mission.goal}`;
    dom.message.textContent = state.paused ? "OPERATION PAUSED" : state.message;
    dom.message.dataset.kind = state.tilted ? "tilt" : state.phase === "gameover" ? "gameover" : "";
  };

  const addFlash = (x, y, color = "#ffd96b", radius = 48) => {
    state.flashes.push({ x, y, color, radius, life: .22, maxLife: .22 });
  };

  const award = (base, message = null) => {
    if (state.tilted || state.phase === "gameover") return;
    const now = state.simTime;
    state.combo = now <= state.comboUntil ? Math.min(5, state.combo + 1) : 1;
    state.comboUntil = now + 2.7;
    const comboBonus = state.combo >= 3 ? state.combo : 1;
    state.score += base * state.multiplier * comboBonus;
    if (state.score > state.highScore) {
      state.highScore = state.score;
      savePersistentState(storage, state.highScore);
    }
    if (!state.extraBallAwarded && state.score >= 250000) {
      state.extraBallAwarded = true;
      state.ballsTotal++;
      setMessage("EXTRA BALL REQUISITIONED");
      audio.play("extra");
    } else if (message) setMessage(state.combo >= 3 ? `${message} · ${state.combo} HIT COMBO` : message);
  };

  const advanceMission = (event) => {
    const mission = currentMission();
    if (state.tilted || event !== mission.event) return;
    state.missionProgress++;
    if (state.missionProgress < mission.goal) return;
    award(mission.award, `${mission.name} COMPLETE`);
    audio.play("mission");
    addFlash(300, 162, "#8ee6ff", 135);
    state.lampUntil[COMMAND_CENTER.id] = state.simTime + .75;
    state.missionIndex = (state.missionIndex + 1) % MISSIONS.length;
    state.missionProgress = 0;
    if (state.missionIndex === 0) state.multiplier = Math.min(10, state.multiplier + 1);
  };

  const collisionEvent = (event, object) => {
    if (!event || state.tilted) return;
    if (event === "bumper") {
      state.lampUntil[object.id] = state.simTime + .2;
      award(1000, "RADAR STRIKE");
      advanceMission("bumper");
      audio.play("bumper");
      addFlash(object.x, object.y, "#ffce54", 58);
    } else if (event === "target") {
      const firstHit = !state.targetLights.has(object.id);
      state.targetLights.add(object.id);
      award(firstHit ? 2500 : 750, firstHit ? "TARGET DOWN" : "TARGET HIT");
      if (firstHit) advanceMission("target");
      audio.play("target");
      addFlash(object.x, object.y, "#ff7b52", 38);
      if (state.targetLights.size === TARGETS.length) {
        state.targetLights.clear();
        state.multiplier = Math.min(10, state.multiplier + 1);
        award(15000, "TARGET BANK CLEARED");
      }
    } else if (event === "sling") {
      award(250, "DEFLECTOR");
      audio.play("target", .7);
    } else if (event === "command") {
      state.lampUntil[object.id] = state.simTime + .34;
      award(7500, "COMMAND CENTER LOCK");
      audio.play("bumper", .85);
      addFlash(object.x, object.y, "#8ee6ff", 62);
    }
  };

  const collideCircle = (object, event, nextContacts) => {
    const ball = state.ball;
    const dx = ball.x - object.x;
    const dy = ball.y - object.y;
    const minimum = ball.radius + object.radius;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimum * minimum) return false;
    const distance = Math.sqrt(distanceSquared) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    const penetration = minimum - distance;
    ball.x += nx * penetration;
    ball.y += ny * penetration;
    const normalVelocity = ball.vx * nx + ball.vy * ny;
    if (normalVelocity < 0) {
      const elasticity = object.elasticity ?? .84;
      ball.vx -= (1 + elasticity) * normalVelocity * nx;
      ball.vy -= (1 + elasticity) * normalVelocity * ny;
    }
    if (!state.contacts.has(object.id) && !nextContacts.has(object.id)) {
      const kick = object.kick || 0;
      ball.vx += nx * kick;
      ball.vy += ny * kick;
      collisionEvent(event, object);
    }
    nextContacts.add(object.id);
    return true;
  };

  const collideSegment = (wall, nextContacts) => {
    const ball = state.ball;
    const [ax, ay] = wall.a;
    const [bx, by] = wall.b;
    const point = closestPoint(ball.x, ball.y, ax, ay, bx, by);
    let dx = ball.x - point.x;
    let dy = ball.y - point.y;
    const minimum = ball.radius + wall.radius;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimum * minimum) return false;
    let distance = Math.sqrt(distanceSquared);
    if (distance < .0001) {
      const length = Math.hypot(bx - ax, by - ay) || 1;
      dx = -(by - ay) / length;
      dy = (bx - ax) / length;
      distance = 1;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const penetration = minimum - Math.sqrt(distanceSquared);
    ball.x += nx * penetration;
    ball.y += ny * penetration;
    const normalVelocity = ball.vx * nx + ball.vy * ny;
    if (normalVelocity < 0) {
      ball.vx -= (1 + wall.elasticity) * normalVelocity * nx;
      ball.vy -= (1 + wall.elasticity) * normalVelocity * ny;
      const tangentX = -ny;
      const tangentY = nx;
      const tangentVelocity = ball.vx * tangentX + ball.vy * tangentY;
      ball.vx -= tangentVelocity * tangentX * .018;
      ball.vy -= tangentVelocity * tangentY * .018;
      if (!state.contacts.has(wall.id) && !nextContacts.has(wall.id)) {
        if (wall.kick) {
          ball.vx += nx * wall.kick;
          ball.vy += ny * wall.kick;
        }
        collisionEvent(wall.event, { ...wall, x: point.x, y: point.y });
        if (!wall.event && Math.abs(normalVelocity) > 130) audio.play("rail", Math.abs(normalVelocity) / 500);
      }
    }
    nextContacts.add(wall.id);
    return true;
  };

  const flipperEnd = (definition, flipper) => ({
    x: definition.base[0] + Math.cos(flipper.angle) * definition.length,
    y: definition.base[1] + Math.sin(flipper.angle) * definition.length,
  });

  const collideFlipper = (definition, flipper, nextContacts) => {
    const ball = state.ball;
    const [baseX, baseY] = definition.base;
    const end = flipperEnd(definition, flipper);
    const point = closestPoint(ball.x, ball.y, baseX, baseY, end.x, end.y);
    let dx = ball.x - point.x;
    let dy = ball.y - point.y;
    const minimum = ball.radius + 13;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimum * minimum) return false;
    let distance = Math.sqrt(distanceSquared);
    if (distance < .0001) {
      dx = -Math.sin(flipper.angle);
      dy = Math.cos(flipper.angle);
      distance = 1;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const penetration = minimum - Math.sqrt(distanceSquared);
    ball.x += nx * penetration;
    ball.y += ny * penetration;
    const armX = point.x - baseX;
    const armY = point.y - baseY;
    const surfaceX = -flipper.omega * armY;
    const surfaceY = flipper.omega * armX;
    const relativeX = ball.vx - surfaceX;
    const relativeY = ball.vy - surfaceY;
    const normalVelocity = relativeX * nx + relativeY * ny;
    if (normalVelocity < 0) {
      ball.vx -= 1.82 * normalVelocity * nx;
      ball.vy -= 1.82 * normalVelocity * ny;
      if (flipper.pressed && Math.abs(flipper.omega) > 2) {
        const reach = .35 + .65 * point.t;
        ball.vx += surfaceX * .72 * reach;
        ball.vy += surfaceY * .72 * reach;
      }
    }
    nextContacts.add(`flipper-${definition.id}`);
    return true;
  };

  const triggerZones = () => {
    const nextZones = new Set();
    if (state.launchGateReady && state.ball.previousY >= 190 && state.ball.y < 190 && state.ball.x > 525 && state.ball.vy < 0) {
      state.launchGateReady = false;
      state.ball.x = 507;
      state.ball.y = 155;
      state.ball.vx = -760;
      state.ball.vy = 165;
      award(5000, "LAUNCH-LANE SKILL SHOT");
      audio.play("launch", .75);
      addFlash(505, 155, "#8ee6ff", 54);
    }
    for (const lane of LANES) {
      const distance = Math.hypot(state.ball.x - lane.x, state.ball.y - lane.y);
      if (distance >= 23) continue;
      nextZones.add(lane.id);
      if (state.zoneContacts.has(lane.id)) continue;
      state.laneLights.add(lane.id);
      award(1500, `CONVOY LANE ${lane.label}`);
      advanceMission("lane");
      audio.play("target", .8);
      addFlash(lane.x, lane.y, "#8ee6ff", 34);
      if (state.laneLights.size === LANES.length) {
        state.laneLights.clear();
        state.multiplier = Math.min(10, state.multiplier + 1);
        award(20000, "CONVOY COMPLETE");
      }
    }
    const crossedRamp = state.ball.previousY >= 414 && state.ball.y < 414 && state.ball.vy < 0 && state.ball.x >= 83 && state.ball.x <= 183;
    if (crossedRamp) {
      award(5000, "COMMAND RAMP");
      advanceMission("ramp");
      audio.play("launch", .7);
      addFlash(136, 350, "#99e6ff", 70);
    }
    state.zoneContacts = nextZones;
  };

  const spawnBall = (saved = false) => {
    state.ball = freshBall();
    state.phase = "ready";
    state.plunger = 0;
    state.plungerHeld = false;
    state.contacts.clear();
    state.zoneContacts.clear();
    state.launchGateReady = true;
    state.tilt = 0;
    state.tilted = false;
    state.ballSaverUntil = state.simTime + 9;
    setMessage(saved ? "BALL SAVED · HOLD SPACE" : "HOLD SPACE TO CHARGE");
  };

  const finishBall = () => {
    audio.play("drain");
    if (!state.tilted && state.simTime < state.ballSaverUntil) {
      state.phase = "serving";
      state.serveAt = state.simTime + .75;
      setMessage("BALL SAVED");
      return;
    }
    state.phase = "serving";
    state.serveAt = state.simTime + 1.15;
    state.score += state.multiplier * 2500;
    state.multiplier = 1;
    state.laneLights.clear();
    state.targetLights.clear();
    if (state.ballNumber >= state.ballsTotal) {
      state.phase = "gameover";
      setMessage(state.score > state.previousHighScore ? "NEW HIGH SCORE" : "OPERATION COMPLETE");
      state.highScore = Math.max(state.highScore, state.score);
      savePersistentState(storage, state.highScore);
    } else {
      state.ballNumber++;
      setMessage(`BALL ${state.ballNumber} READY`);
    }
  };

  const updateFlippers = (dt) => {
    state.flippers.forEach((flipper, index) => {
      const definition = FLIPPER_DEFS[index];
      const target = flipper.pressed && !state.tilted ? definition.active : definition.rest;
      const delta = target - flipper.angle;
      const maxDelta = (flipper.pressed ? 22 : 12) * dt;
      const movement = clamp(delta, -maxDelta, maxDelta);
      flipper.angle += movement;
      flipper.omega = movement / dt;
    });
  };

  const update = (dt) => {
    state.simTime += dt;
    state.tilt = Math.max(0, state.tilt - dt * .16);
    state.shakeX *= .86;
    state.shakeY *= .86;
    state.flashes.forEach((flash) => { flash.life -= dt; });
    state.flashes = state.flashes.filter((flash) => flash.life > 0);
    updateFlippers(dt);

    if (state.phase === "serving" && state.simTime >= state.serveAt) {
      spawnBall(state.message === "BALL SAVED");
      return;
    }
    if (state.phase !== "ready" && state.phase !== "playing") return;
    if (state.phase === "ready") {
      if (state.plungerHeld) state.plunger = Math.min(1, state.plunger + dt * .72);
      state.ball.x = 552;
      state.ball.y = 819 + state.plunger * 28;
      state.ball.vx = 0;
      state.ball.vy = 0;
      return;
    }

    const ball = state.ball;
    ball.previousY = ball.y;
    ball.vy += 535 * dt;
    const damping = Math.pow(.99965, dt * 240);
    ball.vx *= damping;
    ball.vy *= damping;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > MAX_BALL_SPEED) {
      ball.vx *= MAX_BALL_SPEED / speed;
      ball.vy *= MAX_BALL_SPEED / speed;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    const nextContacts = new Set();
    for (let iteration = 0; iteration < 3; ++iteration) {
      WALLS.forEach((wall) => collideSegment(wall, nextContacts));
      BUMPERS.forEach((bumper) => collideCircle({ ...bumper, elasticity: .88 }, "bumper", nextContacts));
      collideCircle(COMMAND_CENTER, "command", nextContacts);
      TARGETS.forEach((target) => collideCircle({ ...target, elasticity: .72, kick: 72 }, "target", nextContacts));
      state.flippers.forEach((flipper, index) => collideFlipper(FLIPPER_DEFS[index], flipper, nextContacts));
    }
    state.contacts = nextContacts;
    triggerZones();

    if (ball.y > 925 || ball.x < -40 || ball.x > 640) finishBall();
    if (state.combo && state.simTime > state.comboUntil) state.combo = 0;
  };

  const setControl = (control, pressed) => {
    audio.prepare();
    if (control === "left" || control === "right") {
      const index = control === "left" ? 0 : 1;
      if (state.flippers[index].pressed === pressed) return;
      state.flippers[index].pressed = pressed;
      if (pressed && !state.tilted) audio.play("flipper");
      return;
    }
    if (control !== "plunger" || state.phase !== "ready") return;
    if (pressed) {
      if (!state.plungerHeld) audio.play("plunger");
      state.plungerHeld = true;
      setMessage("RELEASE SPACE TO LAUNCH");
    } else if (state.plungerHeld) {
      const power = Math.max(.16, state.plunger);
      state.plungerHeld = false;
      state.phase = "playing";
      state.ball.y = 814;
      state.ball.vx = 0;
      state.ball.vy = -(700 + power * 650);
      state.ballSaverUntil = state.simTime + 9;
      state.plunger = 0;
      setMessage("BALL IN PLAY");
      audio.play("launch", .65 + power * .55);
    }
  };

  const nudge = (direction = "up") => {
    if (state.phase !== "playing" || state.tilted) return;
    audio.prepare();
    const impulse = 94;
    if (direction === "left") {
      state.ball.vx -= impulse;
      state.shakeX = -8;
    } else if (direction === "right") {
      state.ball.vx += impulse;
      state.shakeX = 8;
    } else {
      state.ball.vy -= impulse;
      state.shakeY = -7;
    }
    state.tilt += .34;
    if (state.tilt >= 1) {
      state.tilted = true;
      state.flippers.forEach((flipper) => { flipper.pressed = false; });
      setMessage("TILT · CONTROLS LOCKED");
      audio.play("tilt");
    } else if (state.tilt >= .58) setMessage("DANGER · TILT WARNING");
  };

  const togglePause = () => {
    if (state.phase === "gameover") return;
    state.paused = !state.paused;
    setMessage(state.paused ? "OPERATION PAUSED" : state.phase === "ready" ? "HOLD SPACE TO CHARGE" : "BALL IN PLAY");
    if (!state.paused) previousFrame = performance.now();
  };

  const reset = () => {
    persistent.highScore = Math.max(persistent.highScore, state?.highScore || 0);
    state = initialState();
    lastHudKey = "";
    accumulator = 0;
    setMessage("HOLD SPACE TO CHARGE");
    updateHud(true);
  };

  const isInteractive = () => windowElement.classList.contains("is-open")
    && !windowElement.classList.contains("is-minimized")
    && document.visibilityState !== "hidden";

  const drawFallbackPlayfield = () => {
    const gradient = context.createLinearGradient(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    gradient.addColorStop(0, "#26372f");
    gradient.addColorStop(.5, "#53604a");
    gradient.addColorStop(1, "#182822");
    context.fillStyle = gradient;
    context.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    context.fillStyle = "rgba(10, 23, 20, .56)";
    context.beginPath();
    context.moveTo(18, 880);
    context.lineTo(18, 135);
    context.quadraticCurveTo(20, 28, 130, 20);
    context.lineTo(480, 20);
    context.quadraticCurveTo(586, 38, 590, 140);
    context.lineTo(590, 880);
    context.closePath();
    context.fill();
  };

  const drawRail = (wall) => {
    if (wall.id.startsWith("outer-") || wall.id === "launch-guide" || wall.id === "top-guide" || wall.id === "launch-deflector") return;
    const [ax, ay] = wall.a;
    const [bx, by] = wall.b;
    const isRamp = wall.id.startsWith("ramp-");
    const isLane = wall.id.includes("lane");
    const width = wall.event === "sling" ? 9 : isRamp ? 6 : isLane ? 7 : 6;
    context.lineCap = "round";
    context.strokeStyle = "rgba(0, 0, 0, .55)";
    context.lineWidth = width + 5;
    context.beginPath();
    context.moveTo(ax + 3, ay + 6);
    context.lineTo(bx + 3, by + 6);
    context.stroke();
    context.strokeStyle = wall.event === "sling" ? "#b89445" : isRamp ? "#507f76" : isLane ? "#777b65" : "#606c66";
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(ax, ay);
    context.lineTo(bx, by);
    context.stroke();
    context.strokeStyle = "rgba(240, 222, 157, .42)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(ax - 1, ay - 2);
    context.lineTo(bx - 1, by - 2);
    context.stroke();
  };

  const drawPairedLamp = (offImage, onImage, lit, x, y, width, height) => {
    if (imageReady(offImage)) {
      context.drawImage(offImage, x, y, width, height);
      if (lit && imageReady(onImage)) context.drawImage(onImage, x, y, width, height);
      return true;
    }
    if (!imageReady(onImage)) return false;
    context.drawImage(onImage, x, y, width, height);
    return true;
  };

  const drawBumper = (bumper) => {
    const lit = state.simTime < (state.lampUntil[bumper.id] || 0);
    context.save();
    context.translate(bumper.x, bumper.y);
    if (lit) {
      context.shadowColor = "#ffd765";
      context.shadowBlur = 28;
    }
    if (!drawPairedLamp(art.bumperOff, art.bumperOn, lit, -52, -52, 104, 104)) {
      const gradient = context.createRadialGradient(-12, -15, 3, 0, 0, 45);
      gradient.addColorStop(0, "#fff1a3");
      gradient.addColorStop(.25, "#c95539");
      gradient.addColorStop(.72, "#5d2a25");
      gradient.addColorStop(1, "#202b28");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(0, 0, 43, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "#d8c17d";
      context.lineWidth = 4;
      context.stroke();
    }
    context.restore();
  };

  const drawTarget = (target) => {
    const lit = state.targetLights.has(target.id);
    context.save();
    context.translate(target.x, target.y);
    context.rotate(-.52);
    context.fillStyle = "rgba(0,0,0,.52)";
    context.fillRect(-18, -11, 42, 28);
    context.fillStyle = lit ? "#7c3329" : "#a59c72";
    context.strokeStyle = lit ? "#ffb35e" : "#d8cc9e";
    context.lineWidth = 3;
    context.fillRect(-21, -17, 40, 28);
    context.strokeRect(-21, -17, 40, 28);
    context.fillStyle = lit ? "#ffd26d" : "#414b42";
    context.font = "bold 13px Arial";
    context.textAlign = "center";
    context.fillText("×", -1, 3);
    context.restore();
  };

  const drawFlipper = (definition, flipper) => {
    const [x, y] = definition.base;
    context.save();
    context.translate(x, y);
    context.rotate(flipper.angle);
    context.shadowColor = "rgba(0, 0, 0, .6)";
    context.shadowBlur = 8;
    context.shadowOffsetY = 7;
    if (imageReady(art.flipper)) context.drawImage(art.flipper, -20, -28, 126, 56);
    else {
      const gradient = context.createLinearGradient(0, -14, 0, 14);
      gradient.addColorStop(0, "#f1d78c");
      gradient.addColorStop(.45, "#b99045");
      gradient.addColorStop(1, "#644722");
      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(-13, -14, definition.length + 24, 28, 14);
      context.fill();
      context.strokeStyle = "#34291d";
      context.lineWidth = 3;
      context.stroke();
    }
    context.restore();
  };

  const drawLane = (lane) => {
    const lit = state.laneLights.has(lane.id);
    context.save();
    context.translate(lane.x, lane.y);
    if (lit) {
      context.shadowColor = "#8ee6ff";
      context.shadowBlur = 18;
    }
    if (!drawPairedLamp(art.insertOff, art.insertOn, lit, -22, -12, 44, 24)) {
      context.fillStyle = lit ? "#bdf6ff" : "#273b39";
      context.strokeStyle = lit ? "#fff" : "#70908a";
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(0, 0, 17, 10, 0, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    context.fillStyle = lit ? "#21444a" : "#9ab4a9";
    context.font = "bold 12px Arial";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(lane.label, 0, 1);
    context.restore();
  };

  const drawBall = () => {
    if (state.phase === "serving" || state.phase === "gameover") return;
    const ball = state.ball;
    context.save();
    context.translate(ball.x, ball.y);
    context.fillStyle = "rgba(0, 0, 0, .45)";
    context.beginPath();
    context.ellipse(5, 8, ball.radius * 1.08, ball.radius * .78, 0, 0, Math.PI * 2);
    context.fill();
    const gradient = context.createRadialGradient(-4, -5, 1, 0, 0, ball.radius);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(.22, "#e5eff1");
    gradient.addColorStop(.55, "#8d9a9d");
    gradient.addColorStop(.82, "#3d494c");
    gradient.addColorStop(1, "#11191b");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, ball.radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#c5d1d3";
    context.lineWidth = 1.2;
    context.stroke();
    context.restore();
  };

  const draw = () => {
    context.save();
    context.translate(state.shakeX, state.shakeY);
    context.fillStyle = "#0b1412";
    context.fillRect(-12, -12, TABLE_WIDTH + 24, TABLE_HEIGHT + 24);
    if (imageReady(art.playfield)) context.drawImage(art.playfield, 0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    else drawFallbackPlayfield();

    context.fillStyle = "rgba(25, 53, 47, .72)";
    context.beginPath();
    context.moveTo(72, 405);
    context.lineTo(130, 286);
    context.lineTo(187, 405);
    context.lineTo(166, 420);
    context.lineTo(120, 335);
    context.lineTo(91, 418);
    context.closePath();
    context.fill();
    context.strokeStyle = "#7fc0b5";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "#9ed9d0";
    context.font = "bold 13px Arial";
    context.textAlign = "center";
    context.font = "bold 10px Arial";
    context.fillText("COMMAND RAMP", 132, 388);

    LANES.forEach(drawLane);
    WALLS.forEach(drawRail);
    BUMPERS.forEach(drawBumper);
    TARGETS.forEach(drawTarget);

    context.save();
    context.translate(462, 334);
    const commandLit = state.simTime < (state.lampUntil[COMMAND_CENTER.id] || 0);
    if (!drawPairedLamp(art.commandOff, art.commandOn, commandLit, -58, -58, 116, 116)) {
      context.fillStyle = "#263a35";
      context.strokeStyle = "#d5ba70";
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, 40, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = "#d65a3e";
      context.fillRect(-7, -35, 14, 70);
      context.fillRect(-35, -7, 70, 14);
    }
    context.restore();

    state.flippers.forEach((flipper, index) => drawFlipper(FLIPPER_DEFS[index], flipper));
    for (const flash of state.flashes) {
      const alpha = clamp(flash.life / flash.maxLife, 0, 1);
      const gradient = context.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flash.radius);
      gradient.addColorStop(0, `${flash.color}${Math.floor(alpha * 210).toString(16).padStart(2, "0")}`);
      gradient.addColorStop(1, `${flash.color}00`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(flash.x, flash.y, flash.radius, 0, Math.PI * 2);
      context.fill();
    }
    drawBall();

    if (state.paused || state.tilted || state.phase === "gameover") {
      context.fillStyle = "rgba(4, 10, 9, .58)";
      context.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
      context.fillStyle = state.tilted ? "#ff785f" : "#f4d475";
      context.font = "bold 46px 'Lucida Console', monospace";
      context.textAlign = "center";
      context.shadowColor = "#000";
      context.shadowBlur = 8;
      context.fillText(state.paused ? "PAUSED" : state.tilted ? "TILT" : "GAME OVER", TABLE_WIDTH / 2, TABLE_HEIGHT / 2);
    }
    context.restore();
    dom.power.style.height = `${Math.round(state.plunger * 100)}%`;
    updateHud();
  };

  const frame = (now) => {
    const elapsed = Math.min((now - previousFrame) / 1000, .05);
    previousFrame = now;
    if (isInteractive() && !state.paused) {
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps++ < 16) {
        update(FIXED_STEP);
        accumulator -= FIXED_STEP;
      }
      if (steps >= 16) accumulator = 0;
    } else accumulator = 0;
    draw();
    animationFrame = requestAnimationFrame(frame);
  };

  const keyControl = (event) => {
    if (event.code === "KeyZ" || event.code === "ArrowLeft") return "left";
    if (event.code === "Slash" || event.code === "ArrowRight") return "right";
    if (event.code === "Space" || event.code === "ArrowDown") return "plunger";
    return null;
  };

  const onKeyDown = (event) => {
    if (!isInteractive() || event.target.matches("input, select, textarea")) return;
    const control = keyControl(event);
    if (control) {
      event.preventDefault();
      if (!event.repeat) setControl(control, true);
    } else if (!event.repeat && (event.code === "KeyX" || event.code === "Period" || event.code === "ArrowUp")) {
      event.preventDefault();
      nudge(event.code === "KeyX" ? "left" : event.code === "Period" ? "right" : "up");
    } else if (!event.repeat && (event.code === "F3" || event.code === "KeyP")) {
      event.preventDefault();
      togglePause();
    } else if (!event.repeat && event.code === "F2") {
      event.preventDefault();
      reset();
    }
  };

  const onKeyUp = (event) => {
    const control = keyControl(event);
    if (control) {
      event.preventDefault();
      setControl(control, false);
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => {
    state.flippers.forEach((flipper) => { flipper.pressed = false; });
    if (state.plungerHeld) setControl("plunger", false);
  });
  window.addEventListener("beforeunload", () => cancelAnimationFrame(animationFrame), { once: true });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button > 2) return;
    canvas.focus({ preventScroll: true });
    const control = event.button === 1 ? "plunger" : event.button === 2 || event.offsetX >= canvas.clientWidth / 2 ? "right" : "left";
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.pointerControl = control;
    setControl(control, true);
  });
  const releaseCanvasControl = (event) => {
    const control = canvas.dataset.pointerControl;
    if (!control) return;
    delete canvas.dataset.pointerControl;
    setControl(control, false);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerup", releaseCanvasControl);
  canvas.addEventListener("pointercancel", releaseCanvasControl);

  board.querySelectorAll("[data-pinball-control]").forEach((button) => {
    const control = button.dataset.pinballControl;
    if (control === "nudge") {
      button.addEventListener("click", () => nudge("up"));
      return;
    }
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      setControl(control, true);
    });
    const release = (event) => {
      setControl(control, false);
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
  });

  root.querySelector("[data-game-new]").addEventListener("click", reset);
  root.querySelector("[data-game-help]").addEventListener("click", () => window.ZeroHDesktop?.showToast(
    "Shock & Awe field manual",
    "Hold Space to charge the plunger. Z and / fire the flippers. X, period, and Up Arrow nudge the table, but repeated nudges cause a tilt. Complete the operation shown on the command display to raise the score multiplier.",
  ));

  reset();
  animationFrame = requestAnimationFrame(frame);

  return {
    reset,
    snapshot: () => ({
      phase: state.phase,
      paused: state.paused,
      score: state.score,
      highScore: state.highScore,
      ballNumber: state.ballNumber,
      ballsTotal: state.ballsTotal,
      ball: { x: state.ball.x, y: state.ball.y, vx: state.ball.vx, vy: state.ball.vy },
      flippers: state.flippers.map((flipper) => ({ angle: flipper.angle, pressed: flipper.pressed })),
      plunger: state.plunger,
      tilt: state.tilt,
      tilted: state.tilted,
      multiplier: state.multiplier,
      mission: { id: currentMission().id, progress: state.missionProgress, goal: currentMission().goal },
      lights: {
        bumpers: BUMPERS.filter((bumper) => state.simTime < (state.lampUntil[bumper.id] || 0)).map((bumper) => bumper.id),
        command: state.simTime < (state.lampUntil[COMMAND_CENTER.id] || 0),
        lanes: [...state.laneLights],
      },
      fixedStep: FIXED_STEP,
    }),
  };
}
