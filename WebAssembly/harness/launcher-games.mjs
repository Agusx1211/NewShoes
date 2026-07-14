import { loadOrCreateNetworkSettings, normalizeCommanderName, saveNetworkSettings } from "./multiplayer_identity.mjs";
import { createWarPinball } from "./launcher-pinball.mjs";
import { createWebRtcUdpEndpoint, webRtcUdpWireContract } from "./webrtc-udp-endpoint.mjs";

const GAME_PROTOCOL_VERSION = 1;
const GAME_PORT = 47471;
const CARD_BACK_PATH = "./assets/games/card-back-war.webp";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DIFFICULTIES = Object.freeze(["easy", "normal", "hard"]);

const soundState = { enabled: true, context: null };
try { soundState.enabled = window.localStorage.getItem("cnc-xp-games-sound") !== "off"; } catch { /* storage is optional */ }

const SOUND_RECIPES = Object.freeze({
  deal: [[420, 0, .035], [520, .045, .035], [660, .09, .045]],
  move: [[310, 0, .045], [410, .035, .05]],
  flip: [[560, 0, .035], [760, .03, .035]],
  capture: [[180, 0, .07], [120, .045, .09]],
  flag: [[690, 0, .045]],
  blast: [[95, 0, .18], [65, .03, .22]],
  error: [[170, 0, .08], [145, .09, .1]],
  connect: [[330, 0, .05], [440, .06, .05], [660, .12, .09]],
  disconnect: [[440, 0, .06], [250, .07, .11]],
  win: [[392, 0, .08], [523, .09, .08], [659, .18, .08], [784, .27, .16]],
});

function playGameSound(name) {
  if (!soundState.enabled || !SOUND_RECIPES[name]) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  soundState.context ||= new AudioContextClass();
  void soundState.context.resume();
  const start = soundState.context.currentTime + .005;
  for (const [frequency, offset, duration] of SOUND_RECIPES[name]) {
    const oscillator = soundState.context.createOscillator();
    const gain = soundState.context.createGain();
    oscillator.type = name === "blast" ? "sawtooth" : name === "capture" ? "square" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(name === "blast" ? .055 : .035, start + offset);
    gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration);
    oscillator.connect(gain).connect(soundState.context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + duration);
  }
}

function updateSoundButtons() {
  document.querySelectorAll("[data-game-sound]").forEach((button) => {
    button.textContent = soundState.enabled ? "🔊" : "🔇";
    button.title = soundState.enabled ? "Mute game sounds" : "Enable game sounds";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(soundState.enabled));
  });
}

function difficultyValue(root) {
  const value = root.querySelector("[data-game-difficulty]")?.value;
  return DIFFICULTIES.includes(value) ? value : "normal";
}

function difficultyOptions(spec) {
  const labels = spec.kind === "minesweeper"
    ? ["Beginner", "Intermediate", "Expert"]
    : spec.kind === "spider"
      ? ["1 suit", "2 suits", "4 suits"]
      : spec.kind === "solitaire"
        ? ["Draw 1", "Draw 3", "Draw 3 · one redeal"]
        : ["Recruit", "Regular", "Veteran"];
  return DIFFICULTIES.map((value, index) => `<option value="${value}"${value === "normal" ? " selected" : ""}>${labels[index]}</option>`).join("");
}

function captureMotion(root) {
  return new Map([...root.querySelectorAll("[data-motion-key]")].map((node) => [node.dataset.motionKey, node.getBoundingClientRect()]));
}

function playMotion(root, before, { fresh = false } = {}) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  requestAnimationFrame(() => {
    let freshIndex = 0;
    for (const node of root.querySelectorAll("[data-motion-key]")) {
      const previous = before?.get(node.dataset.motionKey);
      const current = node.getBoundingClientRect();
      if (previous) {
        const x = previous.left - current.left;
        const y = previous.top - current.top;
        if (Math.abs(x) > 1 || Math.abs(y) > 1) node.animate([
          { transform: `translate(${x}px, ${y}px) rotate(${Math.max(-5, Math.min(5, x / 28))}deg)`, zIndex: 200 },
          { transform: "translate(0, 0) rotate(0deg)", zIndex: 200 },
        ], { duration: 230, easing: "cubic-bezier(.2,.8,.2,1)" });
      } else if (fresh) {
        node.animate([
          { opacity: 0, transform: "translateY(-18px) rotate(-3deg) scale(.94)" },
          { opacity: 1, transform: "translateY(0) rotate(0deg) scale(1)" },
        ], { duration: 190, delay: Math.min(freshIndex++ * 12, 240), fill: "backwards", easing: "ease-out" });
      }
    }
  });
}

function installPointerDrag(node, { root, payload, dropSelector, onDrop }) {
  if (node.disabled) return;
  node.classList.add("is-draggable");
  let start = null;
  let ghost = null;
  let hover = null;
  let dragged = false;
  let suppressClick = false;

  const clear = () => {
    root.classList.remove("is-card-dragging");
    root.querySelectorAll(`${dropSelector}.is-drop-active, ${dropSelector}.is-drop-hover`).forEach((target) => target.classList.remove("is-drop-active", "is-drop-hover"));
    ghost?.remove();
    ghost = null;
    hover = null;
    start = null;
  };

  node.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  node.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    node.setPointerCapture(event.pointerId);
  });
  node.addEventListener("pointermove", (event) => {
    if (!start || start.pointerId !== event.pointerId) return;
    if (!dragged && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
    if (!dragged) {
      dragged = true;
      suppressClick = true;
      ghost = node.cloneNode(true);
      ghost.className = `${node.className} card-drag-ghost`;
      ghost.removeAttribute("data-motion-key");
      document.body.append(ghost);
      root.classList.add("is-card-dragging");
      root.querySelectorAll(dropSelector).forEach((target) => target.classList.add("is-drop-active"));
      playGameSound("flip");
    }
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(dropSelector);
    if (hover !== target) {
      hover?.classList.remove("is-drop-hover");
      hover = target && root.contains(target) ? target : null;
      hover?.classList.add("is-drop-hover");
    }
  });
  const finish = (event) => {
    if (!start || start.pointerId !== event.pointerId) return;
    const target = hover;
    const wasDragged = dragged;
    dragged = false;
    clear();
    if (wasDragged && target) onDrop(target, payload);
  };
  node.addEventListener("pointerup", finish);
  node.addEventListener("pointercancel", (event) => { dragged = false; finish(event); });
}

const GAME_SPECS = Object.freeze([
  { id: "solitaire", title: "Solitaire: Supply Drop", folderTitle: "Solitaire", subtitle: "Sort the requisitions before command notices.", icon: "#i-solitaire", kind: "solitaire" },
  { id: "spider", title: "Spider Solitaire: Web of Command", folderTitle: "Spider Solitaire", subtitle: "Untangle two decks of intelligence paperwork.", icon: "#i-spider", kind: "spider" },
  { id: "freecell", title: "FreeCell: Forward Cells", folderTitle: "FreeCell", subtitle: "Four forward cells, zero logistical excuses.", icon: "#i-freecell", kind: "freecell" },
  { id: "hearts", title: "Hearts & Minds", folderTitle: "Hearts", subtitle: "Win the operation by collecting no hearts or minds.", icon: "#i-hearts", kind: "hearts" },
  { id: "minesweeper", title: "Minesweeper: Demining Detail", folderTitle: "Minesweeper", subtitle: "The one game command insists is training.", icon: "#i-minesweeper", kind: "minesweeper" },
  { id: "pinball", title: "3D Pinball: Shock & Awe", folderTitle: "3D Pinball", subtitle: "Win the war one deeply impractical ricochet at a time.", icon: "#i-pinball", kind: "pinball", difficulty: false },
  { id: "backgammon", title: "Internet Backgammon: Supply Lines", folderTitle: "Internet Backgammon", subtitle: "Move every convoy home over the real P2P network.", icon: "#i-backgammon", kind: "backgammon", internet: true, maxPlayers: 2 },
  { id: "checkers", title: "Internet Checkers: Checkpoint", folderTitle: "Internet Checkers", subtitle: "Mandatory captures. Optional diplomacy.", icon: "#i-checkers", kind: "checkers", internet: true, maxPlayers: 2 },
  { id: "internethearts", title: "Internet Hearts: Coalition", folderTitle: "Internet Hearts", subtitle: "A four-seat coalition with completely aligned incentives.", icon: "#i-internet-hearts", kind: "hearts", internet: true, maxPlayers: 4 },
  { id: "reversi", title: "Internet Reversi: Territory Control", folderTitle: "Internet Reversi", subtitle: "Flip the map before the map flips you.", icon: "#i-reversi", kind: "reversi", internet: true, maxPlayers: 2 },
  { id: "spades", title: "Internet Spades: Joint Command", folderTitle: "Internet Spades", subtitle: "Bid jointly, blame your coalition partner privately.", icon: "#i-spades", kind: "spades", internet: true, maxPlayers: 4 },
]);

function shuffle(values) {
  for (let index = values.length - 1; index > 0; --index) {
    const pick = Math.floor(Math.random() * (index + 1));
    [values[index], values[pick]] = [values[pick], values[index]];
  }
  return values;
}

function clone(value) {
  return structuredClone(value);
}

function cardDeck(repeats = 1, suits = ["♠", "♥", "♦", "♣"]) {
  const deck = [];
  for (let copy = 0; copy < repeats; ++copy) {
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; ++rank) {
        deck.push({ id: `${copy}-${suit}-${rank}`, suit, rank, faceUp: true });
      }
    }
  }
  return deck;
}

function rankLabel(rank) {
  return ({ 1: "A", 11: "J", 12: "Q", 13: "K" })[rank] || String(rank);
}

function isRed(card) {
  return card?.suit === "♥" || card?.suit === "♦";
}

function cardName(card) {
  return `${rankLabel(card.rank)}${card.suit}`;
}

function gameWindow(spec, index) {
  const network = spec.internet ? `
    <section class="internet-ops" data-network-panel>
      <div class="internet-fields"><label>Room <input data-network-room maxlength="48" autocomplete="off"></label><label>Commander <input data-network-name maxlength="12" autocomplete="off"></label></div>
      <div class="internet-actions"><button type="button" data-network-host>Host operation</button><button type="button" data-network-join>Join operation</button><button type="button" data-network-leave disabled>Disconnect</button></div>
      <p data-network-status>Offline. Host or join a room to deploy.</p>
    </section>` : "";
  const width = [780, 880, 850, 800, 610, 820, 830, 760, 800, 760, 800][index];
  const height = [590, 650, 620, 610, 575, 700, 650, 650, 610, 650, 610][index];
  const difficulty = spec.difficulty === false ? "" : `<label class="game-difficulty"><span>Difficulty</span><select data-game-difficulty>${difficultyOptions(spec)}</select></label>`;
  return `<article id="${spec.id}Window" class="window xp-game-window" data-app="${spec.id}" style="--x: ${51 + (index % 4)}%; --y: ${43 + (index % 3)}%; --w: ${width}px; --h: ${height}px;" aria-label="${spec.title}">
    <header class="titlebar"><div class="titlebar-title"><span class="titlebar-app-icon"><svg><use href="${spec.icon}"/></svg></span><span>${spec.title}</span></div><div class="window-controls"><button type="button" data-window-action="minimize" aria-label="Minimize">—</button><button type="button" data-window-action="maximize" aria-label="Maximize">□</button><button type="button" data-window-action="close" aria-label="Close">×</button></div></header>
    <div class="xp-game-shell" data-game-root="${spec.id}">
      <nav class="xp-game-menu"><button type="button" data-game-new><u>G</u>ame</button><button type="button" data-game-help><u>H</u>elp</button>${difficulty}<button type="button" class="game-sound-toggle" data-game-sound></button><span>${spec.subtitle}</span></nav>
      ${network}
      <div class="xp-game-board" data-game-board aria-label="${spec.folderTitle} game board"></div>
      <footer class="xp-game-status"><span data-game-status>Ready for orders.</span><span>${spec.internet ? "Trystero/Nostr + direct WebRTC" : "Local browser game"}</span></footer>
    </div>
  </article>`;
}

function injectGameWindows() {
  const folderItems = GAME_SPECS.map((spec) => `<button type="button" class="games-folder-item" data-open="${spec.id}"><svg><use href="${spec.icon}"/></svg><strong>${spec.folderTitle}</strong><span>${spec.internet ? "Internet game" : "Classic game"}</span></button>`).join("");
  const folder = `<article id="gamesWindow" class="window games-folder-window" data-app="games" style="--x: 52%; --y: 44%; --w: 790px; --h: 570px;" aria-label="Games folder">
    <header class="titlebar"><div class="titlebar-title"><span class="titlebar-app-icon"><svg><use href="#i-games"/></svg></span><span>Games</span></div><div class="window-controls"><button type="button" data-window-action="minimize" aria-label="Minimize">—</button><button type="button" data-window-action="maximize" aria-label="Maximize">□</button><button type="button" data-window-action="close" aria-label="Close">×</button></div></header>
    <div class="games-folder-toolbar"><button type="button" disabled>‹ Back</button><button type="button" disabled>›</button><button type="button" disabled>↑</button><span>Address</span><input value="C:\\Documents and Settings\\Commander\\Start Menu\\Programs\\Games" readonly></div>
    <div class="games-folder-body"><aside><svg><use href="#i-games"/></svg><h1>Games</h1><p>Classic Windows downtime, requisitioned for the war effort.</p><hr><strong>Game tasks</strong><span>Double-clicking is optional. The bureaucracy is not.</span></aside><section class="games-folder-grid">${folderItems}</section></div>
    <footer class="games-folder-status">11 objects · 6 local classics · 5 real P2P Internet games · pinball requisition approved</footer>
  </article>`;
  document.querySelector("#windowLayer").insertAdjacentHTML("beforeend", `${folder}${GAME_SPECS.map(gameWindow).join("")}`);
}

function setStatus(root, message) {
  root.querySelector("[data-game-status]").textContent = message;
}

function showToast(title, message, kind = "success") {
  window.ZeroHDesktop?.showToast(title, message, kind);
}

function createCardElement(card, { hidden = false, selected = false, disabled = false, label = null } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `war-card${hidden || !card?.faceUp ? " is-back" : ""}${selected ? " is-selected" : ""}${isRed(card) ? " is-red" : ""}`;
  button.disabled = disabled;
  if (card?.id) button.dataset.motionKey = `card:${card.id}`;
  if (hidden || !card?.faceUp) {
    button.style.setProperty("--card-back", `url(${JSON.stringify(CARD_BACK_PATH)})`);
    button.setAttribute("aria-label", label || "Face-down card");
  } else {
    const corner = document.createElement("span");
    corner.className = "war-card-corner";
    corner.innerHTML = `<b>${rankLabel(card.rank)}</b><i>${card.suit}</i>`;
    const suit = document.createElement("strong");
    suit.textContent = card.suit;
    button.append(corner, suit);
    button.setAttribute("aria-label", label || cardName(card));
  }
  return button;
}

function validDescendingAlternating(cards) {
  return cards.every((card, index) => !index || cards[index - 1].rank === card.rank + 1
    && isRed(cards[index - 1]) !== isRed(card));
}

function titlebarHelp(root, message) {
  root.querySelector("[data-game-help]").addEventListener("click", () => showToast("Field manual", message));
}

injectGameWindows();
document.querySelectorAll("[data-game-sound]").forEach((button) => button.addEventListener("click", () => {
  soundState.enabled = !soundState.enabled;
  try { window.localStorage.setItem("cnc-xp-games-sound", soundState.enabled ? "on" : "off"); } catch { /* storage is optional */ }
  updateSoundButtons();
  if (soundState.enabled) playGameSound("connect");
}));
updateSoundButtons();

function createMinesweeper(root) {
  const board = root.querySelector("[data-game-board]");
  board.innerHTML = `<div class="mine-command"><span>MINES <b data-mine-count>010</b></span><button type="button" data-mine-reset aria-label="Reset minefield">🙂</button><span>TIME <b data-mine-time>000</b></span></div><div class="mine-grid" data-mine-grid aria-label="Minefield"></div>`;
  const configurations = {
    easy: { rows: 9, columns: 9, total: 10, cellSize: 35 },
    normal: { rows: 16, columns: 16, total: 40, cellSize: 22 },
    hard: { rows: 16, columns: 30, total: 99, cellSize: 17 },
  };
  let rows;
  let columns;
  let total;
  let state;

  const neighbors = (cellIndex) => {
    const row = Math.floor(cellIndex / columns);
    const column = cellIndex % columns;
    const result = [];
    for (let y = -1; y <= 1; ++y) for (let x = -1; x <= 1; ++x) {
      const nextRow = row + y;
      const nextColumn = column + x;
      if ((x || y) && nextRow >= 0 && nextRow < rows && nextColumn >= 0 && nextColumn < columns) result.push(nextRow * columns + nextColumn);
    }
    return result;
  };

  const placeMines = (safeIndex) => {
    const choices = Array.from({ length: rows * columns }, (_, index) => index).filter((index) => index !== safeIndex);
    for (let count = 0; count < total; ++count) {
      const pick = Math.floor(Math.random() * choices.length);
      state.cells[choices.splice(pick, 1)[0]].mine = true;
    }
    state.cells.forEach((cell, index) => { cell.nearby = neighbors(index).filter((neighbor) => state.cells[neighbor].mine).length; });
  };

  const render = () => {
    const grid = board.querySelector("[data-mine-grid]");
    grid.style.setProperty("--mine-columns", String(columns));
    grid.style.setProperty("--mine-rows", String(rows));
    grid.style.setProperty("--mine-cell-size", `${configurations[state.difficulty].cellSize}px`);
    grid.replaceChildren();
    state.cells.forEach((cell, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `mine-cell${cell.revealed ? " is-revealed" : ""}${cell.flagged ? " is-flagged" : ""}${cell.revealed && cell.mine ? " is-mine" : ""}${cell.revealed && cell.nearby ? ` n${cell.nearby}` : ""}`;
      button.dataset.motionKey = `mine:${index}`;
      button.textContent = cell.flagged ? "⚑" : cell.revealed && cell.mine ? "✹" : cell.revealed && cell.nearby ? String(cell.nearby) : "";
      button.setAttribute("aria-label", cell.flagged ? "Flagged sector" : !cell.revealed ? "Uncleared sector" : cell.mine ? "Mine" : `${cell.nearby} adjacent mines`);
      button.addEventListener("click", () => reveal(index));
      button.addEventListener("contextmenu", (event) => { event.preventDefault(); flag(index); });
      grid.append(button);
    });
    const flags = state.cells.filter((cell) => cell.flagged).length;
    board.querySelector("[data-mine-count]").textContent = String(Math.max(0, total - flags)).padStart(3, "0");
    board.querySelector("[data-mine-time]").textContent = String(state.time).padStart(3, "0");
    board.querySelector("[data-mine-reset]").textContent = state.won ? "😎" : state.ended ? "😵" : "🙂";
  };

  const finish = (won) => {
    state.ended = true;
    state.won = won;
    clearInterval(state.timer);
    state.timer = null;
    if (!won) state.cells.forEach((cell) => { if (cell.mine) cell.revealed = true; });
    playGameSound(won ? "win" : "blast");
    setStatus(root, won ? `Sector cleared in ${state.time} seconds.` : "Mine triggered. The paperwork survived.");
    showToast(won ? "Sector cleared" : "Mine triggered", won ? "Demining detail may stand down." : "Command has authorized one more attempt.", won ? "success" : "warning");
    render();
  };

  const reveal = (index) => {
    const chosen = state.cells[index];
    if (state.ended || chosen.flagged || chosen.revealed) return;
    if (!state.started) {
      state.started = true;
      placeMines(index);
      state.timer = setInterval(() => { state.time = Math.min(999, state.time + 1); render(); }, 1000);
    }
    if (chosen.mine) { chosen.revealed = true; finish(false); return; }
    playGameSound("flip");
    const queue = [index];
    const visited = new Set();
    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      const cell = state.cells[current];
      if (cell.flagged || cell.mine) continue;
      cell.revealed = true;
      if (!cell.nearby) neighbors(current).forEach((neighbor) => queue.push(neighbor));
    }
    if (state.cells.filter((cell) => cell.revealed && !cell.mine).length === rows * columns - total) finish(true);
    else render();
  };

  const flag = (index) => {
    const cell = state.cells[index];
    if (state.ended || cell.revealed) return;
    cell.flagged = !cell.flagged;
    playGameSound("flag");
    render();
  };

  const reset = (announce = false) => {
    clearInterval(state?.timer);
    const difficulty = difficultyValue(root);
    ({ rows, columns, total } = configurations[difficulty]);
    state = { difficulty, rows, columns, total, cells: Array.from({ length: rows * columns }, () => ({ mine: false, nearby: 0, revealed: false, flagged: false })), started: false, ended: false, won: false, time: 0, timer: null };
    setStatus(root, `${columns}×${rows} sector · ${total} mines · right-click to flag. First click is safe.`);
    render();
    if (announce) playGameSound("deal");
  };

  board.querySelector("[data-mine-reset]").addEventListener("click", () => reset(true));
  root.querySelector("[data-game-new]").addEventListener("click", () => reset(true));
  root.querySelector("[data-game-difficulty]").addEventListener("change", () => reset(true));
  titlebarHelp(root, "Clear every safe square. Right-click a suspected mine to plant a flag. The first sector you inspect is guaranteed safe.");
  reset();
  return { reset, snapshot: () => clone({ ...state, timer: null }), reveal };
}

function createSolitaire(root) {
  const board = root.querySelector("[data-game-board]");
  board.innerHTML = `<div class="card-table klondike-table"><div class="klondike-top"><div class="card-slot" data-stock aria-label="Supply stock"></div><div class="card-slot" data-waste aria-label="Waste pile"></div><div class="card-spacer"></div><div class="foundation-row" data-foundations></div></div><div class="tableau-row" data-tableau></div></div>`;
  let state;

  const sourceCards = (selection = state.selected) => {
    if (!selection) return [];
    if (selection.zone === "waste") return state.waste.slice(-1);
    if (selection.zone === "foundation") return state.foundations[selection.index].slice(-1);
    return state.tableau[selection.index].slice(selection.cardIndex);
  };

  const removeSelection = () => {
    const selection = state.selected;
    if (selection.zone === "waste") return state.waste.splice(-1);
    if (selection.zone === "foundation") return state.foundations[selection.index].splice(-1);
    return state.tableau[selection.index].splice(selection.cardIndex);
  };

  const afterMove = (selection, motion) => {
    let flipped = false;
    if (selection.zone === "tableau") {
      const column = state.tableau[selection.index];
      if (column.length && !column.at(-1).faceUp) { column.at(-1).faceUp = true; flipped = true; }
    }
    state.moves += 1;
    state.selected = null;
    if (state.foundations.every((pile) => pile.length === 13)) {
      state.won = true;
      setStatus(root, `All supplies sorted in ${state.moves} moves. Command is suspicious.`);
      showToast("Supply drop secured", "Every requisition reached the correct depot.");
      playGameSound("win");
    } else {
      playGameSound(flipped ? "flip" : "move");
    }
    render();
    playMotion(board, motion);
  };

  const moveToFoundation = (foundationIndex) => {
    if (!state.selected) return false;
    const cards = sourceCards();
    if (cards.length !== 1) return false;
    const pile = state.foundations[foundationIndex];
    const card = cards[0];
    const foundationSuit = ["♠", "♥", "♦", "♣"][foundationIndex];
    if (card.suit !== foundationSuit || (pile.length === 0 && card.rank !== 1)
      || (pile.length && pile.at(-1).rank + 1 !== card.rank)) return false;
    const motion = captureMotion(board);
    const selection = { ...state.selected };
    pile.push(...removeSelection());
    afterMove(selection, motion);
    return true;
  };

  const moveToTableau = (columnIndex) => {
    if (!state.selected) return false;
    const cards = sourceCards();
    const column = state.tableau[columnIndex];
    const first = cards[0];
    if (!cards.length || !validDescendingAlternating(cards)) return false;
    if (column.length ? column.at(-1).rank !== first.rank + 1 || isRed(column.at(-1)) === isRed(first) : first.rank !== 13) return false;
    const motion = captureMotion(board);
    const selection = { ...state.selected };
    column.push(...removeSelection());
    afterMove(selection, motion);
    return true;
  };

  const autoFoundation = (zone, index, cardIndex = null) => {
    state.selected = { zone, index, cardIndex };
    for (let foundation = 0; foundation < 4; ++foundation) if (moveToFoundation(foundation)) return;
    state.selected = null;
    render();
  };

  const dropSelection = (target, selection) => {
    state.selected = selection;
    const moved = target.dataset.cardDrop === "foundation"
      ? moveToFoundation(Number(target.dataset.foundationIndex))
      : target.dataset.cardDrop === "tableau"
        ? moveToTableau(Number(target.dataset.columnIndex))
        : false;
    if (!moved) { state.selected = null; playGameSound("error"); render(); }
  };

  const render = () => {
    const stock = board.querySelector("[data-stock]");
    stock.replaceChildren();
    const stockButton = state.stock.length ? createCardElement({ faceUp: false }, { hidden: true, label: `${state.stock.length} cards in supply stock` }) : document.createElement("button");
    stockButton.type = "button";
    stockButton.classList.add("empty-card-target");
    stockButton.setAttribute("aria-label", state.stock.length ? `${state.stock.length} cards in stock` : "Recycle waste pile");
    stockButton.addEventListener("click", () => {
      const motion = captureMotion(board);
      state.selected = null;
      if (state.stock.length) {
        const drawCount = state.difficulty === "easy" ? 1 : 3;
        for (let count = 0; count < drawCount && state.stock.length; ++count) {
          const card = state.stock.pop();
          card.faceUp = true;
          state.waste.push(card);
        }
      } else {
        if (state.difficulty === "hard" && state.redeals >= 1) {
          setStatus(root, "Veteran rules allow only one redeal. The remaining requisitions are final.");
          playGameSound("error");
          return;
        }
        state.stock = state.waste.reverse().map((card) => ({ ...card, faceUp: false }));
        state.waste = [];
        state.redeals += 1;
      }
      playGameSound("deal");
      render();
      playMotion(board, motion);
    });
    stock.append(stockButton);

    const waste = board.querySelector("[data-waste]");
    waste.replaceChildren();
    if (state.waste.length) {
      const card = state.waste.at(-1);
      const button = createCardElement(card, { selected: state.selected?.zone === "waste" });
      button.addEventListener("click", () => { state.selected = state.selected?.zone === "waste" ? null : { zone: "waste", index: 0, cardIndex: null }; render(); });
      button.addEventListener("dblclick", () => autoFoundation("waste", 0));
      installPointerDrag(button, { root, payload: { zone: "waste", index: 0, cardIndex: null }, dropSelector: ".card-drop-target", onDrop: dropSelection });
      waste.append(button);
    } else waste.innerHTML = `<span class="card-watermark">DROP</span>`;

    const foundations = board.querySelector("[data-foundations]");
    foundations.replaceChildren();
    state.foundations.forEach((pile, index) => {
      const slot = document.createElement("div");
      slot.className = "card-slot foundation-slot card-drop-target";
      slot.dataset.cardDrop = "foundation";
      slot.dataset.foundationIndex = String(index);
      slot.innerHTML = `<span class="card-watermark">${["♠", "♥", "♦", "♣"][index]}</span>`;
      if (pile.length) {
        const button = createCardElement(pile.at(-1), { selected: state.selected?.zone === "foundation" && state.selected.index === index });
        button.addEventListener("click", () => {
          if (state.selected && moveToFoundation(index)) return;
          state.selected = state.selected?.zone === "foundation" && state.selected.index === index ? null : { zone: "foundation", index, cardIndex: null };
          render();
        });
        installPointerDrag(button, { root, payload: { zone: "foundation", index, cardIndex: null }, dropSelector: ".card-drop-target", onDrop: dropSelection });
        slot.append(button);
      } else slot.addEventListener("click", () => moveToFoundation(index));
      foundations.append(slot);
    });

    const tableau = board.querySelector("[data-tableau]");
    tableau.replaceChildren();
    state.tableau.forEach((column, columnIndex) => {
      const pile = document.createElement("div");
      pile.className = "card-column card-drop-target";
      pile.dataset.cardDrop = "tableau";
      pile.dataset.columnIndex = String(columnIndex);
      pile.style.setProperty("--pile-size", String(Math.max(1, column.length)));
      if (!column.length) {
        const target = document.createElement("button");
        target.type = "button";
        target.className = "empty-card-target king-target";
        target.textContent = "K";
        target.addEventListener("click", () => moveToTableau(columnIndex));
        pile.append(target);
      }
      column.forEach((card, cardIndex) => {
        const selected = state.selected?.zone === "tableau" && state.selected.index === columnIndex && cardIndex >= state.selected.cardIndex;
        const button = createCardElement(card, { selected });
        button.style.setProperty("--stack-index", String(cardIndex));
        button.addEventListener("click", () => {
          if (state.selected && !(state.selected.zone === "tableau" && state.selected.index === columnIndex) && moveToTableau(columnIndex)) return;
          if (!card.faceUp) return;
          const cards = column.slice(cardIndex);
          state.selected = selected || !validDescendingAlternating(cards) ? null : { zone: "tableau", index: columnIndex, cardIndex };
          render();
        });
        button.addEventListener("dblclick", () => { if (cardIndex === column.length - 1 && card.faceUp) autoFoundation("tableau", columnIndex, cardIndex); });
        if (card.faceUp && validDescendingAlternating(column.slice(cardIndex))) installPointerDrag(button, {
          root, payload: { zone: "tableau", index: columnIndex, cardIndex }, dropSelector: ".card-drop-target", onDrop: dropSelection,
        });
        pile.append(button);
      });
      tableau.append(pile);
    });
    if (!state.won) setStatus(root, `${state.moves} moves · ${state.stock.length} cards await deployment · ${state.difficulty === "easy" ? "draw 1" : "draw 3"}.`);
  };

  const reset = (announce = false) => {
    const deck = shuffle(cardDeck()).map((card) => ({ ...card, faceUp: false }));
    const tableau = Array.from({ length: 7 }, () => []);
    for (let column = 0; column < 7; ++column) for (let row = 0; row <= column; ++row) {
      const card = deck.pop();
      card.faceUp = row === column;
      tableau[column].push(card);
    }
    state = { difficulty: difficultyValue(root), stock: deck, waste: [], foundations: [[], [], [], []], tableau, selected: null, moves: 0, redeals: 0, won: false };
    render();
    playMotion(board, null, { fresh: true });
    if (announce) playGameSound("deal");
  };

  root.querySelector("[data-game-new]").addEventListener("click", () => reset(true));
  root.querySelector("[data-game-difficulty]").addEventListener("change", () => reset(true));
  titlebarHelp(root, "Drag cards or click a source and destination. Build alternating-color columns downward, send Aces through Kings to the supply depots, and use only Kings to establish a new column.");
  reset();
  return { reset, snapshot: () => clone(state) };
}

function createSpider(root) {
  const board = root.querySelector("[data-game-board]");
  board.innerHTML = `<div class="card-table spider-table"><div class="spider-command"><div data-spider-complete></div><span>COMPLETED RUNS</span><button type="button" data-spider-deal aria-label="Deal another row"></button></div><div class="tableau-row spider-columns" data-spider-tableau></div></div>`;
  let state;

  const movableRun = (column, index) => column.slice(index).every((card, offset, cards) => card.faceUp
    && (!offset || cards[offset - 1].rank === card.rank + 1 && cards[offset - 1].suit === card.suit));

  const completeRuns = () => {
    const before = state.completed;
    for (const column of state.tableau) {
      let removed = true;
      while (removed && column.length >= 13) {
        removed = false;
        const run = column.slice(-13);
        if (run.every((card, index) => card.faceUp && card.rank === 13 - index && card.suit === run[0].suit)) {
          column.splice(-13);
          state.completed += 1;
          removed = true;
          if (column.length) column.at(-1).faceUp = true;
        }
      }
    }
    if (state.completed === 8) {
      state.won = true;
      setStatus(root, `Eight chains of command assembled in ${state.moves} moves.`);
      showToast("Web of command untangled", "All eight dossiers are in rank order. This will never happen at headquarters.");
    }
    return state.completed - before;
  };

  const moveTo = (destination) => {
    if (!state.selected) return;
    const source = state.tableau[state.selected.column];
    const cards = source.slice(state.selected.cardIndex);
    const target = state.tableau[destination];
    if (destination === state.selected.column || !movableRun(source, state.selected.cardIndex)) return;
    if (target.length && target.at(-1).rank !== cards[0].rank + 1) return;
    const motion = captureMotion(board);
    source.splice(state.selected.cardIndex);
    target.push(...cards);
    if (source.length) source.at(-1).faceUp = true;
    state.selected = null;
    state.moves += 1;
    const completed = completeRuns();
    playGameSound(state.won ? "win" : completed ? "capture" : "move");
    render();
    playMotion(board, motion);
    return true;
  };

  const deal = () => {
    if (state.stock.length < 10) return;
    if (state.tableau.some((column) => !column.length)) {
      setStatus(root, "Fill every empty column before requesting more paperwork.");
      showToast("Deal denied", "Command refuses to deliver into an empty column.", "warning");
      playGameSound("error");
      return;
    }
    const motion = captureMotion(board);
    state.tableau.forEach((column) => {
      const card = state.stock.pop();
      card.faceUp = true;
      column.push(card);
    });
    state.moves += 1;
    state.selected = null;
    const completed = completeRuns();
    playGameSound(state.won ? "win" : completed ? "capture" : "deal");
    render();
    playMotion(board, motion);
  };

  const dropSelection = (target, selection) => {
    state.selected = selection;
    if (!moveTo(Number(target.dataset.columnIndex))) {
      state.selected = null;
      playGameSound("error");
      render();
    }
  };

  const render = () => {
    const complete = board.querySelector("[data-spider-complete]");
    complete.replaceChildren();
    for (let index = 0; index < 8; ++index) {
      const marker = document.createElement("span");
      marker.textContent = index < state.completed ? "♠" : "·";
      marker.className = index < state.completed ? "is-complete" : "";
      complete.append(marker);
    }
    const dealButton = board.querySelector("[data-spider-deal]");
    dealButton.replaceChildren();
    dealButton.classList.toggle("has-cards", state.stock.length > 0);
    dealButton.style.setProperty("--card-back", `url(${JSON.stringify(CARD_BACK_PATH)})`);
    dealButton.textContent = state.stock.length ? String(state.stock.length / 10) : "NO RESERVES";
    dealButton.setAttribute("aria-label", state.stock.length ? `Deal ${state.stock.length / 10} remaining rows` : "No reserve deals remain");
    dealButton.disabled = !state.stock.length || state.won;

    const tableau = board.querySelector("[data-spider-tableau]");
    tableau.replaceChildren();
    state.tableau.forEach((column, columnIndex) => {
      const pile = document.createElement("div");
      pile.className = "card-column card-drop-target";
      pile.dataset.columnIndex = String(columnIndex);
      if (!column.length) {
        const target = document.createElement("button");
        target.type = "button";
        target.className = "empty-card-target";
        target.addEventListener("click", () => moveTo(columnIndex));
        pile.append(target);
      }
      column.forEach((card, cardIndex) => {
        const selected = state.selected?.column === columnIndex && cardIndex >= state.selected.cardIndex;
        const button = createCardElement(card, { selected });
        button.style.setProperty("--stack-index", String(cardIndex));
        button.addEventListener("click", () => {
          if (state.selected && state.selected.column !== columnIndex) { moveTo(columnIndex); return; }
          state.selected = selected || !card.faceUp || !movableRun(column, cardIndex) ? null : { column: columnIndex, cardIndex };
          render();
        });
        if (card.faceUp && movableRun(column, cardIndex)) installPointerDrag(button, {
          root, payload: { column: columnIndex, cardIndex }, dropSelector: ".card-drop-target", onDrop: dropSelection,
        });
        pile.append(button);
      });
      tableau.append(pile);
    });
    if (!state.won) setStatus(root, `${state.moves} moves · ${state.completed}/8 complete chains · ${state.stock.length / 10} reserve deals.`);
  };

  const reset = (announce = false) => {
    const difficulty = difficultyValue(root);
    const deck = shuffle(difficulty === "easy" ? cardDeck(8, ["♠"])
      : difficulty === "normal" ? cardDeck(4, ["♠", "♥"])
        : cardDeck(2)).map((card) => ({ ...card, faceUp: false }));
    const tableau = Array.from({ length: 10 }, () => []);
    for (let row = 0; row < 6; ++row) for (let column = 0; column < 10; ++column) {
      if (row === 5 && column >= 4) continue;
      const card = deck.pop();
      card.faceUp = row === (column < 4 ? 5 : 4);
      tableau[column].push(card);
    }
    state = { difficulty, stock: deck, tableau, selected: null, completed: 0, moves: 0, won: false };
    render();
    playMotion(board, null, { fresh: true });
    if (announce) playGameSound("deal");
  };

  board.querySelector("[data-spider-deal]").addEventListener("click", deal);
  root.querySelector("[data-game-new]").addEventListener("click", () => reset(true));
  root.querySelector("[data-game-difficulty]").addEventListener("change", () => reset(true));
  titlebarHelp(root, "Drag complete descending runs between columns. A same-suit King-to-Ace chain is extracted automatically; difficulty selects one, two, or four suits.");
  reset();
  return { reset, snapshot: () => clone(state) };
}

function createFreeCell(root) {
  const board = root.querySelector("[data-game-board]");
  board.innerHTML = `<div class="card-table freecell-table"><div class="freecell-top"><div class="freecell-reserves" data-freecells></div><span>FORWARD CELLS</span><div class="foundation-row" data-free-foundations></div></div><div class="tableau-row freecell-columns" data-free-tableau></div></div>`;
  let state;

  const sourceCards = () => {
    if (!state.selected) return [];
    if (state.selected.zone === "cell") return state.freeCells[state.selected.index] ? [state.freeCells[state.selected.index]] : [];
    if (state.selected.zone === "foundation") return state.foundations[state.selected.index].slice(-1);
    return state.cascades[state.selected.index].slice(state.selected.cardIndex);
  };

  const removeSelection = () => {
    const selection = state.selected;
    if (selection.zone === "cell") {
      const card = state.freeCells[selection.index];
      state.freeCells[selection.index] = null;
      return [card];
    }
    if (selection.zone === "foundation") return state.foundations[selection.index].splice(-1);
    return state.cascades[selection.index].splice(selection.cardIndex);
  };

  const finishMove = (motion) => {
    state.selected = null;
    state.moves += 1;
    if (state.foundations.every((pile) => pile.length === 13)) {
      state.won = true;
      setStatus(root, `All personnel extracted in ${state.moves} moves.`);
      showToast("Forward cells evacuated", "Nobody was left behind, including the paperwork.");
      playGameSound("win");
    } else {
      playGameSound("move");
    }
    render();
    playMotion(board, motion);
  };

  const moveFoundation = (index) => {
    const cards = sourceCards();
    if (cards.length !== 1) return false;
    const pile = state.foundations[index];
    const card = cards[0];
    const foundationSuit = ["♠", "♥", "♦", "♣"][index];
    if (card.suit !== foundationSuit || (pile.length && pile.at(-1).rank + 1 !== card.rank)
      || (!pile.length && card.rank !== 1)) return false;
    const motion = captureMotion(board);
    pile.push(...removeSelection());
    finishMove(motion);
    return true;
  };

  const moveCell = (index) => {
    if (state.freeCells[index] || sourceCards().length !== 1) return false;
    const motion = captureMotion(board);
    state.freeCells[index] = removeSelection()[0];
    finishMove(motion);
    return true;
  };

  const moveCascade = (destination) => {
    const cards = sourceCards();
    if (!cards.length || !validDescendingAlternating(cards)) return false;
    const target = state.cascades[destination];
    if (state.selected.zone === "cascade" && state.selected.index === destination) return false;
    if (target.length && (target.at(-1).rank !== cards[0].rank + 1 || isRed(target.at(-1)) === isRed(cards[0]))) return false;
    const emptyCells = state.freeCells.filter((card) => !card).length;
    const emptyColumns = state.cascades.filter((column, index) => !column.length && index !== destination).length;
    const capacity = (emptyCells + 1) * (2 ** emptyColumns);
    if (cards.length > capacity) {
      setStatus(root, `That formation needs ${cards.length} spaces; current maneuver capacity is ${capacity}.`);
      return false;
    }
    const motion = captureMotion(board);
    target.push(...removeSelection());
    finishMove(motion);
    return true;
  };

  const autoFoundation = (zone, index, cardIndex = null) => {
    state.selected = { zone, index, cardIndex };
    for (let foundation = 0; foundation < 4; ++foundation) if (moveFoundation(foundation)) return;
    state.selected = null;
    render();
  };

  const dropSelection = (target, selection) => {
    state.selected = selection;
    const moved = target.dataset.cardDrop === "cell"
      ? moveCell(Number(target.dataset.cellIndex))
      : target.dataset.cardDrop === "foundation"
        ? moveFoundation(Number(target.dataset.foundationIndex))
        : target.dataset.cardDrop === "cascade"
          ? moveCascade(Number(target.dataset.columnIndex))
          : false;
    if (!moved) { state.selected = null; playGameSound("error"); render(); }
  };

  const render = () => {
    const cells = board.querySelector("[data-freecells]");
    cells.replaceChildren();
    state.freeCells.forEach((card, index) => {
      const slot = document.createElement("div");
      slot.className = "card-slot free-cell-slot card-drop-target";
      slot.dataset.cardDrop = "cell";
      slot.dataset.cellIndex = String(index);
      if (card) {
        const button = createCardElement(card, { selected: state.selected?.zone === "cell" && state.selected.index === index });
        button.addEventListener("click", () => {
          if (state.selected && moveCell(index)) return;
          state.selected = state.selected?.zone === "cell" && state.selected.index === index ? null : { zone: "cell", index, cardIndex: null };
          render();
        });
        button.addEventListener("dblclick", () => autoFoundation("cell", index));
        installPointerDrag(button, { root, payload: { zone: "cell", index, cardIndex: null }, dropSelector: ".card-drop-target", onDrop: dropSelection });
        slot.append(button);
      } else {
        slot.innerHTML = `<span class="card-watermark">CELL</span>`;
        slot.addEventListener("click", () => moveCell(index));
      }
      cells.append(slot);
    });

    const foundations = board.querySelector("[data-free-foundations]");
    foundations.replaceChildren();
    state.foundations.forEach((pile, index) => {
      const slot = document.createElement("div");
      slot.className = "card-slot foundation-slot card-drop-target";
      slot.dataset.cardDrop = "foundation";
      slot.dataset.foundationIndex = String(index);
      slot.innerHTML = `<span class="card-watermark">${["♠", "♥", "♦", "♣"][index]}</span>`;
      if (pile.length) {
        const button = createCardElement(pile.at(-1), { selected: state.selected?.zone === "foundation" && state.selected.index === index });
        button.addEventListener("click", () => {
          if (state.selected && moveFoundation(index)) return;
          state.selected = { zone: "foundation", index, cardIndex: null };
          render();
        });
        installPointerDrag(button, { root, payload: { zone: "foundation", index, cardIndex: null }, dropSelector: ".card-drop-target", onDrop: dropSelection });
        slot.append(button);
      } else slot.addEventListener("click", () => moveFoundation(index));
      foundations.append(slot);
    });

    const cascades = board.querySelector("[data-free-tableau]");
    cascades.replaceChildren();
    state.cascades.forEach((column, columnIndex) => {
      const pile = document.createElement("div");
      pile.className = "card-column card-drop-target";
      pile.dataset.cardDrop = "cascade";
      pile.dataset.columnIndex = String(columnIndex);
      if (!column.length) {
        const target = document.createElement("button");
        target.type = "button";
        target.className = "empty-card-target";
        target.addEventListener("click", () => moveCascade(columnIndex));
        pile.append(target);
      }
      column.forEach((card, cardIndex) => {
        const selected = state.selected?.zone === "cascade" && state.selected.index === columnIndex && cardIndex >= state.selected.cardIndex;
        const button = createCardElement(card, { selected });
        button.style.setProperty("--stack-index", String(cardIndex));
        button.addEventListener("click", () => {
          if (state.selected && !(state.selected.zone === "cascade" && state.selected.index === columnIndex) && moveCascade(columnIndex)) return;
          const cards = column.slice(cardIndex);
          state.selected = selected || !validDescendingAlternating(cards) ? null : { zone: "cascade", index: columnIndex, cardIndex };
          render();
        });
        button.addEventListener("dblclick", () => { if (cardIndex === column.length - 1) autoFoundation("cascade", columnIndex, cardIndex); });
        if (validDescendingAlternating(column.slice(cardIndex))) installPointerDrag(button, {
          root, payload: { zone: "cascade", index: columnIndex, cardIndex }, dropSelector: ".card-drop-target", onDrop: dropSelection,
        });
        pile.append(button);
      });
      cascades.append(pile);
    });
    if (!state.won) setStatus(root, `${state.moves} moves · ${state.freeCells.filter((card) => !card).length} forward cells available.`);
  };

  const createDeal = () => {
    const cascades = Array.from({ length: 8 }, () => []);
    shuffle(cardDeck()).forEach((card, index) => cascades[index % 8].push(card));
    return cascades;
  };

  const dealMobility = (cascades) => {
    const tops = cascades.map((column) => column.at(-1));
    let score = tops.reduce((total, card) => total + (card.rank <= 3 ? 8 - card.rank * 2 : 0), 0);
    for (const card of tops) for (const target of tops) if (card !== target && target.rank === card.rank + 1 && isRed(target) !== isRed(card)) score += 3;
    for (const column of cascades) {
      const aceDepth = [...column].reverse().findIndex((card) => card.rank === 1);
      if (aceDepth >= 0) score += Math.max(0, 7 - aceDepth);
    }
    return score;
  };

  const reset = (announce = false) => {
    const difficulty = difficultyValue(root);
    const candidates = Array.from({ length: 18 }, createDeal).sort((a, b) => dealMobility(b) - dealMobility(a));
    const cascades = difficulty === "easy" ? candidates[0] : difficulty === "hard" ? candidates.at(-1) : candidates[9];
    state = { difficulty, cascades, freeCells: [null, null, null, null], foundations: [[], [], [], []], selected: null, moves: 0, won: false };
    render();
    playMotion(board, null, { fresh: true });
    if (announce) playGameSound("deal");
  };

  root.querySelector("[data-game-new]").addEventListener("click", () => reset(true));
  root.querySelector("[data-game-difficulty]").addEventListener("change", () => reset(true));
  titlebarHelp(root, "Drag cards and formations between columns, cells, and foundations. Each forward cell holds one card; empty columns multiply the size of a formation you can move.");
  reset();
  return { reset, snapshot: () => clone(state) };
}

function createCheckers(root, submit) {
  const board = root.querySelector("[data-game-board]");
  board.innerHTML = `<div class="versus-strip"><span data-checkers-red>RED CHECKPOINT</span><b data-checkers-turn>WAITING</b><span data-checkers-black>BLACK CHECKPOINT</span></div><div class="checkers-board" data-checkers-board aria-label="Checkers board"></div>`;
  let state;
  let localSeat = 0;

  const owner = (piece) => piece > 0 ? 0 : piece < 0 ? 1 : null;
  const rowOf = (index) => Math.floor(index / 8);
  const columnOf = (index) => index % 8;
  const moveCandidates = (from, capturesOnly = false) => {
    const piece = state.board[from];
    if (!piece) return [];
    const seat = owner(piece);
    const directions = Math.abs(piece) === 2 ? [-1, 1] : [seat === 0 ? -1 : 1];
    const result = [];
    for (const rowDirection of directions) for (const columnDirection of [-1, 1]) {
      const row = rowOf(from);
      const column = columnOf(from);
      const nearRow = row + rowDirection;
      const nearColumn = column + columnDirection;
      if (nearRow < 0 || nearRow > 7 || nearColumn < 0 || nearColumn > 7) continue;
      const near = nearRow * 8 + nearColumn;
      if (!capturesOnly && !state.board[near]) result.push({ from, to: near, capture: null });
      const farRow = row + rowDirection * 2;
      const farColumn = column + columnDirection * 2;
      if (farRow < 0 || farRow > 7 || farColumn < 0 || farColumn > 7) continue;
      const far = farRow * 8 + farColumn;
      if (state.board[near] && owner(state.board[near]) !== seat && !state.board[far]) result.push({ from, to: far, capture: near });
    }
    return result;
  };

  const legalMoves = (seat) => {
    const sources = state.forced != null ? [state.forced] : state.board.map((_, index) => index).filter((index) => owner(state.board[index]) === seat);
    const moves = sources.flatMap((index) => moveCandidates(index));
    const captures = moves.filter((move) => move.capture != null);
    return captures.length ? captures : moves.filter((move) => move.capture == null);
  };

  const advanceBots = () => {
    let guard = 0;
    while (state.winner == null && !state.humans.includes(state.turn) && guard++ < 80) {
      const moves = legalMoves(state.turn);
      if (!moves.length) { state.winner = 1 - state.turn; break; }
      const choice = state.difficulty === "easy" ? moves[Math.floor(Math.random() * moves.length)]
        : state.difficulty === "hard" ? [...moves].sort((a, b) => {
          const score = (move) => (move.capture != null ? 50 : 0)
            + ([0, 7].includes(rowOf(move.to)) ? 35 : 0)
            + (3.5 - Math.abs(columnOf(move.to) - 3.5)) * 2;
          return score(b) - score(a);
        })[0] : moves.find((move) => move.capture != null) || moves[0];
      apply({ type: "move", from: choice.from, to: choice.to }, state.turn, true);
    }
  };

  const apply = (action, seat, bot = false) => {
    if (state.winner != null || action?.type !== "move" || seat !== state.turn) return false;
    const move = legalMoves(seat).find((candidate) => candidate.from === Number(action.from) && candidate.to === Number(action.to));
    if (!move) return false;
    const sourceRect = board.querySelector(`[data-checkers-square="${move.from}"] .checker-piece`)?.getBoundingClientRect();
    let piece = state.board[move.from];
    state.board[move.from] = 0;
    state.board[move.to] = piece;
    if (move.capture != null) state.board[move.capture] = 0;
    const destinationRow = rowOf(move.to);
    if (piece === 1 && destinationRow === 0) piece = state.board[move.to] = 2;
    if (piece === -1 && destinationRow === 7) piece = state.board[move.to] = -2;
    state.selected = null;
    state.moves += 1;
    const continuedCaptures = move.capture != null ? moveCandidates(move.to, true).filter((candidate) => candidate.capture != null) : [];
    if (continuedCaptures.length) state.forced = move.to;
    else {
      state.forced = null;
      state.turn = 1 - state.turn;
      if (!legalMoves(state.turn).length) state.winner = seat;
    }
    if (!bot) advanceBots();
    render();
    const movedPiece = board.querySelector(`[data-checkers-square="${move.to}"] .checker-piece`);
    if (sourceRect && movedPiece && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const destinationRect = movedPiece.getBoundingClientRect();
      movedPiece.animate([
        { transform: `translate(${sourceRect.left - destinationRect.left}px, ${sourceRect.top - destinationRect.top}px) scale(1.08)`, zIndex: 20 },
        { transform: "translate(0, 0) scale(1)", zIndex: 20 },
      ], { duration: move.capture != null ? 260 : 210, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    if (!bot) playGameSound(state.winner != null ? "win" : move.capture != null ? "capture" : "move");
    return true;
  };

  const render = () => {
    const grid = board.querySelector("[data-checkers-board]");
    grid.replaceChildren();
    const legal = state.winner == null && state.turn === localSeat ? legalMoves(localSeat) : [];
    const movable = new Set(legal.map((move) => move.from));
    const destinations = new Set(state.selected == null ? [] : legal.filter((move) => move.from === state.selected).map((move) => move.to));
    state.board.forEach((piece, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `checkers-square${(rowOf(index) + columnOf(index)) % 2 ? " is-dark" : ""}${destinations.has(index) ? " is-destination" : ""}`;
      button.dataset.checkersSquare = String(index);
      button.setAttribute("aria-label", piece ? `${owner(piece) === 0 ? "Red" : "Black"}${Math.abs(piece) === 2 ? " king" : " checker"}` : "Empty square");
      if (piece) {
        const checker = document.createElement("span");
        checker.className = `checker-piece ${owner(piece) === 0 ? "is-red" : "is-black"}${Math.abs(piece) === 2 ? " is-king" : ""}${state.selected === index ? " is-selected" : ""}${movable.has(index) ? " is-movable" : ""}`;
        checker.textContent = Math.abs(piece) === 2 ? "★" : "";
        button.append(checker);
      }
      button.addEventListener("click", () => {
        if (destinations.has(index)) submit({ type: "move", from: state.selected, to: index });
        else if (movable.has(index)) { state.selected = state.selected === index ? null : index; render(); }
      });
      grid.append(button);
    });
    board.querySelector("[data-checkers-turn]").textContent = state.winner == null ? `${state.turn === 0 ? "RED" : "BLACK"} TO MOVE` : `${state.winner === 0 ? "RED" : "BLACK"} CONTROLS THE CHECKPOINT`;
    setStatus(root, state.winner == null ? `${state.moves} moves · ${state.forced != null ? "Continue the capture." : "Captures are mandatory."}` : `Operation complete after ${state.moves} moves.`);
  };

  const reset = (humans = state?.humans || [0, 1], difficulty = difficultyValue(root)) => {
    const cells = Array(64).fill(0);
    for (let row = 0; row < 3; ++row) for (let column = 0; column < 8; ++column) if ((row + column) % 2) cells[row * 8 + column] = -1;
    for (let row = 5; row < 8; ++row) for (let column = 0; column < 8; ++column) if ((row + column) % 2) cells[row * 8 + column] = 1;
    state = { difficulty, board: cells, turn: 0, selected: null, forced: null, winner: null, moves: 0, humans: [...humans] };
    root.querySelector("[data-game-difficulty]").value = difficulty;
    advanceBots();
    render();
  };

  root.querySelector("[data-game-new]").addEventListener("click", () => submit({ type: "new" }));
  root.querySelector("[data-game-difficulty]").addEventListener("change", (event) => submit({ type: "difficulty", value: event.target.value }));
  titlebarHelp(root, "Move diagonally on dark squares. Captures are mandatory, and a capturing checker must continue while another jump is available.");
  reset();
  return {
    reset,
    apply(action, seat) {
      if (action?.type === "new") { reset(state.humans, state.difficulty); playGameSound("deal"); return true; }
      if (action?.type === "difficulty" && seat === 0 && DIFFICULTIES.includes(action.value)) { reset(state.humans, action.value); playGameSound("deal"); return true; }
      return apply(action, seat);
    },
    configureHumans(humans) { reset(humans, difficultyValue(root)); },
    updateHumans(humans) { state.humans = [...humans]; advanceBots(); render(); },
    setLocalSeat(seat) { localSeat = seat; root.querySelector("[data-game-difficulty]").disabled = seat !== 0; render(); },
    load(next) { state = clone(next); state.selected = null; root.querySelector("[data-game-difficulty]").value = state.difficulty; render(); },
    snapshot: () => clone({ ...state, selected: null }),
  };
}

function createReversi(root, submit) {
  const board = root.querySelector("[data-game-board]");
  board.innerHTML = `<div class="versus-strip"><span>BLACK OPS <b data-reversi-black>2</b></span><strong data-reversi-turn>WAITING</strong><span>WHITE OPS <b data-reversi-white>2</b></span></div><div class="reversi-board" data-reversi-board aria-label="Reversi board"></div>`;
  let state;
  let localSeat = 0;
  const directions = [-9, -8, -7, -1, 1, 7, 8, 9];
  const seatValue = (seat) => seat === 0 ? 1 : -1;
  const rowOf = (index) => Math.floor(index / 8);
  const columnOf = (index) => index % 8;

  const flipsFor = (index, seat) => {
    if (state.board[index]) return [];
    const own = seatValue(seat);
    const flips = [];
    for (const step of directions) {
      const line = [];
      let current = index + step;
      while (current >= 0 && current < 64 && Math.abs((current % 8) - ((current - step) % 8)) <= 1 && state.board[current] === -own) {
        line.push(current);
        current += step;
      }
      if (line.length && current >= 0 && current < 64 && Math.abs((current % 8) - ((current - step) % 8)) <= 1 && state.board[current] === own) flips.push(...line);
    }
    return flips;
  };

  const legalMoves = (seat) => state.board.map((_, index) => index).filter((index) => flipsFor(index, seat).length);

  const advanceBots = () => {
    let guard = 0;
    while (!state.ended && !state.humans.includes(state.turn) && guard++ < 64) {
      const moves = legalMoves(state.turn);
      if (!moves.length) {
        state.turn = 1 - state.turn;
        if (!legalMoves(state.turn).length) state.ended = true;
      } else {
        const choice = state.difficulty === "easy" ? moves[Math.floor(Math.random() * moves.length)]
          : [...moves].sort((a, b) => {
            const score = (index) => flipsFor(index, state.turn).length
              + ([0, 7, 56, 63].includes(index) ? (state.difficulty === "hard" ? 100 : 20) : 0)
              + (state.difficulty === "hard" && (rowOf(index) === 0 || rowOf(index) === 7 || columnOf(index) === 0 || columnOf(index) === 7) ? 12 : 0);
            return score(b) - score(a);
          })[0];
        apply({ type: "place", index: choice }, state.turn, true);
      }
    }
  };

  const apply = (action, seat, bot = false) => {
    if (state.ended || action?.type !== "place" || seat !== state.turn) return false;
    const index = Number(action.index);
    const flips = flipsFor(index, seat);
    if (!flips.length) return false;
    state.board[index] = seatValue(seat);
    flips.forEach((cell) => { state.board[cell] = seatValue(seat); });
    state.turn = 1 - seat;
    state.moves += 1;
    if (!legalMoves(state.turn).length) {
      state.turn = seat;
      if (!legalMoves(state.turn).length) state.ended = true;
    }
    if (!bot) advanceBots();
    render();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) for (const changed of [index, ...flips]) {
      board.querySelector(`[data-reversi-square="${changed}"] span`)?.animate([
        { transform: "rotateY(90deg) scale(.75)" },
        { transform: "rotateY(0deg) scale(1.08)", offset: .7 },
        { transform: "rotateY(0deg) scale(1)" },
      ], { duration: 260, easing: "ease-out" });
    }
    if (!bot) playGameSound(state.ended ? "win" : flips.length > 2 ? "capture" : "move");
    return true;
  };

  const render = () => {
    const grid = board.querySelector("[data-reversi-board]");
    grid.replaceChildren();
    const moves = state.ended || state.turn !== localSeat ? new Set() : new Set(legalMoves(localSeat));
    state.board.forEach((piece, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `reversi-square${moves.has(index) ? " is-legal" : ""}`;
      button.dataset.reversiSquare = String(index);
      button.setAttribute("aria-label", piece === 1 ? "Black unit" : piece === -1 ? "White unit" : moves.has(index) ? "Legal deployment" : "Empty territory");
      if (piece) {
        const disk = document.createElement("span");
        disk.className = piece === 1 ? "is-black" : "is-white";
        button.append(disk);
      }
      button.addEventListener("click", () => { if (moves.has(index)) submit({ type: "place", index }); });
      grid.append(button);
    });
    const black = state.board.filter((piece) => piece === 1).length;
    const white = state.board.filter((piece) => piece === -1).length;
    board.querySelector("[data-reversi-black]").textContent = String(black);
    board.querySelector("[data-reversi-white]").textContent = String(white);
    board.querySelector("[data-reversi-turn]").textContent = state.ended ? (black === white ? "STALEMATE" : `${black > white ? "BLACK" : "WHITE"} CONTROLS THE MAP`) : `${state.turn === 0 ? "BLACK" : "WHITE"} TO DEPLOY`;
    setStatus(root, state.ended ? `Final territory: ${black} black, ${white} white.` : `${state.moves} deployments · bracket enemy units to flip them.`);
  };

  const reset = (humans = state?.humans || [0, 1], difficulty = difficultyValue(root)) => {
    const cells = Array(64).fill(0);
    cells[27] = cells[36] = -1;
    cells[28] = cells[35] = 1;
    state = { difficulty, board: cells, turn: 0, moves: 0, ended: false, humans: [...humans] };
    root.querySelector("[data-game-difficulty]").value = difficulty;
    advanceBots();
    render();
  };

  root.querySelector("[data-game-new]").addEventListener("click", () => submit({ type: "new" }));
  root.querySelector("[data-game-difficulty]").addEventListener("change", (event) => submit({ type: "difficulty", value: event.target.value }));
  titlebarHelp(root, "Deploy a disk so one or more straight lines of enemy units are bracketed between the new disk and your territory. Every bracketed unit flips allegiance.");
  reset();
  return {
    reset,
    apply(action, seat) {
      if (action?.type === "new") { reset(state.humans, state.difficulty); playGameSound("deal"); return true; }
      if (action?.type === "difficulty" && seat === 0 && DIFFICULTIES.includes(action.value)) { reset(state.humans, action.value); playGameSound("deal"); return true; }
      return apply(action, seat);
    },
    configureHumans(humans) { reset(humans, difficultyValue(root)); },
    updateHumans(humans) { state.humans = [...humans]; advanceBots(); render(); },
    setLocalSeat(seat) { localSeat = seat; root.querySelector("[data-game-difficulty]").disabled = seat !== 0; render(); },
    load(next) { state = clone(next); root.querySelector("[data-game-difficulty]").value = state.difficulty; render(); },
    snapshot: () => clone(state),
  };
}

function createBackgammon(root, submit) {
  const board = root.querySelector("[data-game-board]");
  board.innerHTML = `<div class="backgammon-command"><span>SUPPLY <b data-bg-off-0>0</b>/15</span><div data-bg-dice></div><strong data-bg-turn>WAITING</strong><span>OPPOSITION <b data-bg-off-1>0</b>/15</span></div><div class="backgammon-board"><div class="bg-half bg-top" data-bg-top></div><div class="bg-bar"><button type="button" data-bg-bar="1">BAR <b>0</b></button><span>NO MAN'S LAND</span><button type="button" data-bg-bar="0">BAR <b>0</b></button></div><div class="bg-half bg-bottom" data-bg-bottom></div><div class="bg-bear"><button type="button" data-bg-bear="1">Opposition off</button><button type="button" data-bg-bear="0">Bear supply off</button></div></div>`;
  let state;
  let localSeat = 0;
  let selected = null;
  const owner = (count) => count > 0 ? 0 : count < 0 ? 1 : null;
  const sign = (seat) => seat === 0 ? 1 : -1;

  const allHome = (seat) => state.bar[seat] === 0 && state.points.every((count, index) => owner(count) !== seat || (seat === 0 ? index <= 5 : index >= 18));
  const canLand = (index, seat) => index >= 0 && index < 24 && !(owner(state.points[index]) === 1 - seat && Math.abs(state.points[index]) >= 2);
  const entryFor = (seat, die) => seat === 0 ? 24 - die : die - 1;

  const legalMoves = (seat) => {
    const result = [];
    state.remainingDice.forEach((die, dieIndex) => {
      if (state.bar[seat] > 0) {
        const to = entryFor(seat, die);
        if (canLand(to, seat)) result.push({ from: "bar", to, die, dieIndex });
        return;
      }
      state.points.forEach((count, from) => {
        if (owner(count) !== seat) return;
        const to = seat === 0 ? from - die : from + die;
        if (to >= 0 && to < 24) {
          if (canLand(to, seat)) result.push({ from, to, die, dieIndex });
          return;
        }
        if (!allHome(seat)) return;
        const exact = seat === 0 ? from + 1 === die : 24 - from === die;
        const overshoot = seat === 0
          ? die > from + 1 && !state.points.some((value, index) => owner(value) === seat && index > from)
          : die > 24 - from && !state.points.some((value, index) => owner(value) === seat && index < from);
        if (exact || overshoot) result.push({ from, to: "off", die, dieIndex });
      });
    });
    return result;
  };

  const roll = () => {
    const first = 1 + Math.floor(Math.random() * 6);
    const second = 1 + Math.floor(Math.random() * 6);
    state.dice = [first, second];
    state.remainingDice = first === second ? [first, first, first, first] : [first, second];
  };

  const nextTurn = () => {
    state.turn = 1 - state.turn;
    selected = null;
    roll();
    if (!legalMoves(state.turn).length) {
      state.passes += 1;
      state.turn = 1 - state.turn;
      roll();
    }
  };

  const advanceBots = () => {
    let guard = 0;
    while (state.winner == null && !state.humans.includes(state.turn) && guard++ < 80) {
      const moves = legalMoves(state.turn);
      if (!moves.length) { nextTurn(); continue; }
      const hit = moves.find((move) => move.to !== "off" && owner(state.points[move.to]) === 1 - state.turn && Math.abs(state.points[move.to]) === 1);
      const bear = moves.find((move) => move.to === "off");
      const choice = state.difficulty === "easy" ? moves[Math.floor(Math.random() * moves.length)]
        : state.difficulty === "hard" ? [...moves].sort((a, b) => {
          const score = (move) => (move.to === "off" ? 80 : 0)
            + (move.to !== "off" && owner(state.points[move.to]) === 1 - state.turn && Math.abs(state.points[move.to]) === 1 ? 55 : 0)
            + (typeof move.from === "number" && typeof move.to === "number" ? Math.abs(move.to - move.from) : 0);
          return score(b) - score(a);
        })[0] : hit || bear || moves[0];
      apply({ type: "move", from: choice.from, to: choice.to, die: choice.die }, state.turn, true);
    }
  };

  const apply = (action, seat, bot = false) => {
    if (state.winner != null || action?.type !== "move" || seat !== state.turn) return false;
    const move = legalMoves(seat).find((candidate) => String(candidate.from) === String(action.from)
      && String(candidate.to) === String(action.to) && candidate.die === Number(action.die));
    if (!move) return false;
    const sourceRect = move.from === "bar" ? null : board.querySelector(`[data-point="${move.from}"] .bg-checker-stack i:last-of-type`)?.getBoundingClientRect();
    const hit = move.to !== "off" && owner(state.points[move.to]) === 1 - seat && Math.abs(state.points[move.to]) === 1;
    if (move.from === "bar") state.bar[seat] -= 1;
    else state.points[move.from] -= sign(seat);
    if (move.to === "off") state.borne[seat] += 1;
    else {
      if (owner(state.points[move.to]) === 1 - seat && Math.abs(state.points[move.to]) === 1) {
        state.points[move.to] = 0;
        state.bar[1 - seat] += 1;
      }
      state.points[move.to] += sign(seat);
    }
    state.remainingDice.splice(move.dieIndex, 1);
    state.moves += 1;
    selected = null;
    if (state.borne[seat] === 15) state.winner = seat;
    else if (!state.remainingDice.length || !legalMoves(seat).length) nextTurn();
    if (!bot) advanceBots();
    render();
    if (sourceRect && move.to !== "off" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const checker = board.querySelector(`[data-point="${move.to}"] .bg-checker-stack i:last-of-type`);
      const destinationRect = checker?.getBoundingClientRect();
      if (checker && destinationRect) checker.animate([
        { transform: `translate(${sourceRect.left - destinationRect.left}px, ${sourceRect.top - destinationRect.top}px) scale(1.15)`, zIndex: 20 },
        { transform: "translate(0, 0) scale(1)", zIndex: 20 },
      ], { duration: 250, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    if (!bot) playGameSound(state.winner != null ? "win" : hit ? "capture" : move.to === "off" ? "flip" : "move");
    return true;
  };

  const pointButton = (index, upsideDown = false) => {
    const count = state.points[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `bg-point${upsideDown ? " is-down" : ""}`;
    button.dataset.point = String(index);
    const checkerCount = Math.abs(count);
    const stack = document.createElement("span");
    stack.className = "bg-checker-stack";
    for (let checker = 0; checker < Math.min(5, checkerCount); ++checker) {
      const disk = document.createElement("i");
      disk.className = owner(count) === 0 ? "is-supply" : "is-opposition";
      stack.append(disk);
    }
    if (checkerCount > 5) {
      const total = document.createElement("b");
      total.textContent = String(checkerCount);
      stack.append(total);
    }
    button.append(stack);
    const moves = state.turn === localSeat ? legalMoves(localSeat) : [];
    const selectable = moves.some((move) => String(move.from) === String(index));
    const destination = selected != null && moves.some((move) => String(move.from) === String(selected) && move.to === index);
    button.classList.toggle("is-selected", selected === index);
    button.classList.toggle("is-selectable", selectable);
    button.classList.toggle("is-destination", destination);
    button.setAttribute("aria-label", `Point ${index + 1}, ${checkerCount} ${owner(count) === 0 ? "supply" : owner(count) === 1 ? "opposition" : "checkers"}`);
    button.addEventListener("click", () => {
      if (destination) {
        const move = moves.find((candidate) => String(candidate.from) === String(selected) && candidate.to === index);
        submit({ type: "move", from: move.from, to: move.to, die: move.die });
      } else if (selectable) { selected = selected === index ? null : index; render(); }
    });
    return button;
  };

  const render = () => {
    const top = board.querySelector("[data-bg-top]");
    const bottom = board.querySelector("[data-bg-bottom]");
    top.replaceChildren(...Array.from({ length: 12 }, (_, offset) => pointButton(12 + offset, true)));
    bottom.replaceChildren(...Array.from({ length: 12 }, (_, offset) => pointButton(11 - offset)));
    board.querySelectorAll("[data-bg-bar]").forEach((button) => {
      const seat = Number(button.dataset.bgBar);
      button.querySelector("b").textContent = String(state.bar[seat]);
      const selectable = state.turn === localSeat && seat === localSeat && state.bar[seat] > 0;
      button.classList.toggle("is-selectable", selectable);
      button.classList.toggle("is-selected", selected === "bar" && selectable);
      button.disabled = !selectable;
      button.onclick = () => { selected = selected === "bar" ? null : "bar"; render(); };
    });
    board.querySelectorAll("[data-bg-bear]").forEach((button) => {
      const seat = Number(button.dataset.bgBear);
      const moves = state.turn === localSeat && seat === localSeat ? legalMoves(localSeat).filter((move) => move.to === "off" && String(move.from) === String(selected)) : [];
      button.disabled = !moves.length;
      button.onclick = () => { const move = moves[0]; submit({ type: "move", from: move.from, to: "off", die: move.die }); };
    });
    const dice = board.querySelector("[data-bg-dice]");
    dice.replaceChildren(...state.remainingDice.map((die) => {
      const dieNode = document.createElement("i");
      dieNode.textContent = String(die);
      return dieNode;
    }));
    board.querySelector("[data-bg-off-0]").textContent = String(state.borne[0]);
    board.querySelector("[data-bg-off-1]").textContent = String(state.borne[1]);
    board.querySelector("[data-bg-turn]").textContent = state.winner == null ? `${state.turn === 0 ? "SUPPLY" : "OPPOSITION"} MOVES` : `${state.winner === 0 ? "SUPPLY" : "OPPOSITION"} LINE SECURED`;
    setStatus(root, state.winner == null ? `${state.moves} moves · select a checker, then a highlighted point.` : `All 15 checkers withdrawn after ${state.moves} moves.`);
  };

  const reset = (humans = state?.humans || [0, 1], difficulty = difficultyValue(root)) => {
    const points = Array(24).fill(0);
    points[23] = 2; points[12] = 5; points[7] = 3; points[5] = 5;
    points[0] = -2; points[11] = -5; points[16] = -3; points[18] = -5;
    state = { difficulty, points, bar: [0, 0], borne: [0, 0], turn: 0, dice: [], remainingDice: [], winner: null, moves: 0, passes: 0, humans: [...humans] };
    root.querySelector("[data-game-difficulty]").value = difficulty;
    selected = null;
    roll();
    advanceBots();
    render();
  };

  root.querySelector("[data-game-new]").addEventListener("click", () => submit({ type: "new" }));
  root.querySelector("[data-game-difficulty]").addEventListener("change", (event) => submit({ type: "difficulty", value: event.target.value }));
  titlebarHelp(root, "Move supply checkers toward point 1 and opposition toward point 24. Hit exposed blots, re-enter bar units first, then bear all 15 units off from your home sector.");
  reset();
  return {
    reset,
    apply(action, seat) {
      if (action?.type === "new") { reset(state.humans, state.difficulty); playGameSound("deal"); return true; }
      if (action?.type === "difficulty" && seat === 0 && DIFFICULTIES.includes(action.value)) { reset(state.humans, action.value); playGameSound("deal"); return true; }
      return apply(action, seat);
    },
    configureHumans(humans) { reset(humans, difficultyValue(root)); },
    updateHumans(humans) { state.humans = [...humans]; advanceBots(); render(); },
    setLocalSeat(seat) { localSeat = seat; selected = null; root.querySelector("[data-game-difficulty]").disabled = seat !== 0; render(); },
    load(next) { state = clone(next); selected = null; root.querySelector("[data-game-difficulty]").value = state.difficulty; render(); },
    snapshot: () => clone(state),
  };
}

function createTrickGame(root, submit, mode) {
  const heartsMode = mode === "hearts";
  const board = root.querySelector("[data-game-board]");
  board.innerHTML = `<div class="trick-score" data-trick-score></div><div class="trick-table"><div class="trick-opponents" data-trick-opponents></div><div class="trick-center" data-trick-center></div><div class="trick-orders" data-trick-orders></div><div class="trick-hand" data-trick-hand></div></div>`;
  let state;
  let localSeat = 0;

  const sortHand = (hand) => hand.sort((a, b) => ["♣", "♦", "♠", "♥"].indexOf(a.suit) - ["♣", "♦", "♠", "♥"].indexOf(b.suit) || a.rank - b.rank);
  const rankPower = (card) => card.rank === 1 ? 14 : card.rank;
  const botHeartPass = (hand) => (state?.difficulty === "easy" ? shuffle([...hand]) : [...hand].sort((a, b) => {
    const danger = (card) => card.suit === "♠" && card.rank === 12 ? 100 : card.suit === "♥" ? 50 + rankPower(card) : rankPower(card);
    return danger(b) - danger(a);
  })).slice(0, 3).map((card) => card.id);
  const botBid = (hand) => state?.difficulty === "easy" ? 1 + Math.floor(Math.random() * 4) : Math.max(1, Math.min(13, Math.round(hand.reduce((total, card) => total
    + (rankPower(card) >= 13 ? 0.8 : rankPower(card) === 12 ? 0.35 : 0)
    + (card.suit === "♠" ? (state?.difficulty === "hard" ? .28 : .18) : 0), 0))));

  const botCard = (legal) => {
    if (state.difficulty === "easy") return legal[Math.floor(Math.random() * legal.length)];
    const leadSuit = state.trick[0]?.card.suit;
    const currentPower = state.trick.length ? Math.max(...state.trick.filter((play) => play.card.suit === leadSuit).map((play) => rankPower(play.card)), 0) : 0;
    return [...legal].sort((a, b) => {
      const score = (card) => {
        const penalty = heartsMode ? (card.suit === "♥" ? 20 : card.suit === "♠" && card.rank === 12 ? 45 : 0) : card.suit === "♠" ? 16 : 0;
        const losesTrick = leadSuit && card.suit === leadSuit && rankPower(card) < currentPower;
        return state.difficulty === "hard" && losesTrick ? -40 - rankPower(card) : penalty + rankPower(card);
      };
      return score(a) - score(b);
    })[0];
  };

  const legalCards = (seat) => {
    const hand = state.hands[seat];
    if (state.phase !== "play" || state.turn !== seat) return [];
    if (state.trick.length) {
      const leadSuit = state.trick[0].card.suit;
      const follow = hand.filter((card) => card.suit === leadSuit);
      if (follow.length) return follow;
      if (heartsMode && state.tricksPlayed === 0) {
        const safe = hand.filter((card) => card.suit !== "♥" && !(card.suit === "♠" && card.rank === 12));
        if (safe.length) return safe;
      }
      return hand;
    }
    if (heartsMode && state.tricksPlayed === 0) return hand.filter((card) => card.suit === "♣" && card.rank === 2);
    if (heartsMode && !state.heartsBroken) {
      const nonHearts = hand.filter((card) => card.suit !== "♥");
      if (nonHearts.length) return nonHearts;
    }
    if (!heartsMode && !state.spadesBroken) {
      const nonSpades = hand.filter((card) => card.suit !== "♠");
      if (nonSpades.length) return nonSpades;
    }
    return hand;
  };

  const trickWinner = () => {
    const leadSuit = state.trick[0].card.suit;
    const candidates = heartsMode || !state.trick.some((play) => play.card.suit === "♠")
      ? state.trick.filter((play) => play.card.suit === leadSuit)
      : state.trick.filter((play) => play.card.suit === "♠");
    return candidates.sort((a, b) => rankPower(b.card) - rankPower(a.card))[0].seat;
  };

  const beginHeartsPlay = () => {
    state.phase = "play";
    const holder = state.hands.findIndex((hand) => hand.some((card) => card.suit === "♣" && card.rank === 2));
    state.turn = holder;
    state.leader = holder;
  };

  const finishPassing = () => {
    if (!state.passConfirmed.every(Boolean)) return;
    const direction = [1, 3, 2, 0][state.round % 4];
    if (direction) {
      const transfers = state.passSelected.map((ids, seat) => ids.map((id) => state.hands[seat].find((card) => card.id === id)));
      for (let seat = 0; seat < 4; ++seat) state.hands[seat] = state.hands[seat].filter((card) => !state.passSelected[seat].includes(card.id));
      for (let seat = 0; seat < 4; ++seat) state.hands[(seat + direction) % 4].push(...transfers[seat]);
      state.hands.forEach(sortHand);
    }
    state.passSelected = [[], [], [], []];
    beginHeartsPlay();
  };

  const dealRound = () => {
    const hands = Array.from({ length: 4 }, () => []);
    shuffle(cardDeck()).forEach((card, index) => hands[index % 4].push(card));
    hands.forEach(sortHand);
    state.hands = hands;
    state.trick = [];
    state.lastTrick = [];
    state.tricksPlayed = 0;
    state.heartsBroken = false;
    state.spadesBroken = false;
    state.leader = 0;
    state.turn = 0;
    if (heartsMode) {
      const direction = [1, 3, 2, 0][state.round % 4];
      state.phase = direction ? "pass" : "play";
      state.passSelected = [[], [], [], []];
      state.passConfirmed = [0, 1, 2, 3].map((seat) => !state.humans.includes(seat) || !direction);
      for (let seat = 0; seat < 4; ++seat) if (!state.humans.includes(seat) && direction) state.passSelected[seat] = botHeartPass(state.hands[seat]);
      if (!direction) beginHeartsPlay();
      else finishPassing();
    } else {
      state.phase = "bid";
      state.bids = [null, null, null, null];
      state.bidConfirmed = [0, 1, 2, 3].map((seat) => !state.humans.includes(seat));
      for (let seat = 0; seat < 4; ++seat) if (!state.humans.includes(seat)) state.bids[seat] = botBid(state.hands[seat]);
      state.tricksWon = [0, 0, 0, 0];
    }
  };

  const finishRound = () => {
    if (heartsMode) {
      const moon = state.roundPoints.findIndex((points) => points === 26);
      if (moon >= 0) for (let seat = 0; seat < 4; ++seat) state.scores[seat] += seat === moon ? 0 : 26;
      else for (let seat = 0; seat < 4; ++seat) state.scores[seat] += state.roundPoints[seat];
      state.roundPoints = [0, 0, 0, 0];
      if (state.scores.some((score) => score >= 100)) {
        const low = Math.min(...state.scores);
        state.winners = state.scores.map((score, seat) => score === low ? seat : -1).filter((seat) => seat >= 0);
        state.phase = "ended";
        return;
      }
    } else {
      for (let team = 0; team < 2; ++team) {
        const bid = state.bids[team] + state.bids[team + 2];
        const tricks = state.tricksWon[team] + state.tricksWon[team + 2];
        state.teamScores[team] += tricks >= bid ? bid * 10 + (tricks - bid) : -bid * 10;
      }
      if (state.teamScores.some((score) => Math.abs(score) >= 500)) {
        const high = Math.max(...state.teamScores);
        state.winners = [state.teamScores.indexOf(high), state.teamScores.indexOf(high) + 2];
        state.phase = "ended";
        return;
      }
    }
    state.round += 1;
    dealRound();
  };

  const playCard = (seat, cardId, bot = false) => {
    const card = legalCards(seat).find((candidate) => candidate.id === cardId);
    if (!card) return false;
    const motion = bot ? null : captureMotion(board);
    const completesTrick = state.trick.length === 3;
    state.hands[seat] = state.hands[seat].filter((candidate) => candidate.id !== card.id);
    state.trick.push({ seat, card });
    if (card.suit === "♥") state.heartsBroken = true;
    if (card.suit === "♠") state.spadesBroken = true;
    state.turn = (seat + 1) % 4;
    if (state.trick.length === 4) {
      const winner = trickWinner();
      state.lastTrick = state.trick;
      if (heartsMode) state.roundPoints[winner] += state.trick.reduce((points, play) => points + (play.card.suit === "♥" ? 1 : play.card.suit === "♠" && play.card.rank === 12 ? 13 : 0), 0);
      else state.tricksWon[winner] += 1;
      state.trick = [];
      state.tricksPlayed += 1;
      state.leader = winner;
      state.turn = winner;
      if (!state.hands[0].length) finishRound();
    }
    if (!bot) advanceBots();
    render();
    if (!bot) {
      playMotion(board, motion);
      playGameSound(state.phase === "ended" ? "win" : completesTrick ? "capture" : "move");
    }
    return true;
  };

  const advanceBots = () => {
    let guard = 0;
    if (state.phase === "pass") finishPassing();
    if (state.phase === "bid" && state.bidConfirmed.every(Boolean)) {
      state.phase = "play";
      state.turn = state.leader;
    }
    while (state.phase === "play" && !state.humans.includes(state.turn) && guard++ < 80) {
      const seat = state.turn;
      const legal = legalCards(seat);
      const choice = botCard(legal);
      if (!choice) break;
      playCard(seat, choice.id, true);
    }
  };

  const apply = (action, seat) => {
    if (action?.type === "new") { reset(state.humans, state.difficulty); playGameSound("deal"); return true; }
    if (action?.type === "difficulty" && seat === 0 && DIFFICULTIES.includes(action.value)) {
      reset(state.humans, action.value);
      playGameSound("deal");
      return true;
    }
    if (!state.humans.includes(seat)) return false;
    if (heartsMode && state.phase === "pass") {
      if (action?.type === "toggle-pass" && !state.passConfirmed[seat]) {
        const card = state.hands[seat].find((candidate) => candidate.id === action.cardId);
        if (!card) return false;
        const selected = state.passSelected[seat];
        if (selected.includes(card.id)) selected.splice(selected.indexOf(card.id), 1);
        else if (selected.length < 3) selected.push(card.id);
        else return false;
        playGameSound("flip");
        render();
        return true;
      }
      if (action?.type === "commit-pass" && state.passSelected[seat].length === 3) {
        state.passConfirmed[seat] = true;
        finishPassing();
        advanceBots();
        playGameSound("move");
        render();
        return true;
      }
      return false;
    }
    if (!heartsMode && state.phase === "bid" && action?.type === "bid" && !state.bidConfirmed[seat]) {
      const bid = Math.max(1, Math.min(13, Math.floor(Number(action.value))));
      if (!Number.isFinite(bid)) return false;
      state.bids[seat] = bid;
      state.bidConfirmed[seat] = true;
      advanceBots();
      playGameSound("move");
      render();
      return true;
    }
    if (action?.type === "play") return playCard(seat, action.cardId);
    return false;
  };

  const dropTrickCard = (target, card) => {
    if (target.dataset.cardDrop === "orders" && state.phase === "pass") {
      submit({ type: "toggle-pass", cardId: card.id });
      return;
    }
    if (target.dataset.cardDrop === "play" && state.phase === "play" && legalCards(localSeat).some((candidate) => candidate.id === card.id)) {
      submit({ type: "play", cardId: card.id });
      return;
    }
    playGameSound("error");
  };

  const render = () => {
    root.querySelector("[data-game-difficulty]").value = state.difficulty;
    const scores = board.querySelector("[data-trick-score]");
    if (heartsMode) scores.innerHTML = state.scores.map((score, seat) => `<span class="${seat === localSeat ? "is-local" : ""}">C${seat + 1} <b>${score}</b>${state.roundPoints?.[seat] ? ` +${state.roundPoints[seat]}` : ""}</span>`).join("");
    else scores.innerHTML = `<span class="is-local">YOUR TEAM <b>${state.teamScores[localSeat % 2]}</b></span><span>ROUND ${state.round + 1}</span><span>OTHER TEAM <b>${state.teamScores[1 - (localSeat % 2)]}</b></span>`;

    const opponents = board.querySelector("[data-trick-opponents]");
    opponents.replaceChildren();
    for (let offset = 1; offset < 4; ++offset) {
      const seat = (localSeat + offset) % 4;
      const panel = document.createElement("div");
      panel.className = `trick-opponent seat-${offset}`;
      panel.innerHTML = `<strong>COMMANDER ${seat + 1}</strong><span>${state.hands[seat].length} cards</span><small>${heartsMode ? `${state.scores[seat]} pts` : `bid ${state.bids?.[seat] ?? "?"} · ${state.tricksWon?.[seat] ?? 0} tricks`}</small>`;
      opponents.append(panel);
    }

    const center = board.querySelector("[data-trick-center]");
    center.className = "trick-center trick-drop-target card-drop-target";
    center.dataset.cardDrop = "play";
    center.replaceChildren();
    const shownTrick = state.trick.length ? state.trick : state.lastTrick;
    shownTrick.forEach((play) => {
      const card = createCardElement(play.card, { disabled: true, label: `Commander ${play.seat + 1} played ${cardName(play.card)}` });
      card.classList.add(`trick-seat-${(play.seat - localSeat + 4) % 4}`);
      center.append(card);
    });

    const orders = board.querySelector("[data-trick-orders]");
    orders.className = "trick-orders trick-drop-target card-drop-target";
    orders.dataset.cardDrop = "orders";
    orders.replaceChildren();
    if (heartsMode && state.phase === "pass" && state.humans.includes(localSeat)) {
      const direction = ["left", "right", "across", "hold"][state.round % 4];
      const copy = document.createElement("span");
      copy.textContent = `Select three cards to pass ${direction}.`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = state.passConfirmed[localSeat] ? "Orders sent" : `Pass ${state.passSelected[localSeat].length}/3`;
      button.disabled = state.passSelected[localSeat].length !== 3 || state.passConfirmed[localSeat];
      button.addEventListener("click", () => submit({ type: "commit-pass" }));
      orders.append(copy, button);
    } else if (!heartsMode && state.phase === "bid" && state.humans.includes(localSeat)) {
      const label = document.createElement("label");
      label.textContent = "Contract ";
      const select = document.createElement("select");
      for (let bid = 1; bid <= 13; ++bid) select.add(new Option(String(bid), String(bid)));
      select.value = String(state.bids[localSeat] ?? 3);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = state.bidConfirmed[localSeat] ? `Bid ${state.bids[localSeat]}` : "Submit bid";
      button.disabled = state.bidConfirmed[localSeat];
      button.addEventListener("click", () => submit({ type: "bid", value: Number(select.value) }));
      label.append(select);
      orders.append(label, button);
    } else {
      const copy = document.createElement("span");
      copy.textContent = state.phase === "ended" ? `Commander ${state.winners.map((seat) => seat + 1).join(" & ")} wins.` : state.turn === localSeat ? "Your operation." : `Commander ${state.turn + 1} is considering the consequences.`;
      orders.append(copy);
    }

    const hand = board.querySelector("[data-trick-hand]");
    hand.replaceChildren();
    const legal = new Set(legalCards(localSeat).map((card) => card.id));
    state.hands[localSeat].forEach((card, index) => {
      const selectedForPass = state.passSelected?.[localSeat]?.includes(card.id);
      const button = createCardElement(card, { selected: selectedForPass, disabled: state.phase === "play" && !legal.has(card.id) });
      button.style.setProperty("--hand-index", String(index));
      button.addEventListener("click", () => {
        if (state.phase === "pass") submit({ type: "toggle-pass", cardId: card.id });
        else if (state.phase === "play" && legal.has(card.id)) submit({ type: "play", cardId: card.id });
      });
      if (state.phase === "pass" && !state.passConfirmed[localSeat]) installPointerDrag(button, {
        root, payload: card, dropSelector: '.trick-drop-target[data-card-drop="orders"]', onDrop: dropTrickCard,
      });
      else if (state.phase === "play" && legal.has(card.id)) installPointerDrag(button, {
        root, payload: card, dropSelector: '.trick-drop-target[data-card-drop="play"]', onDrop: dropTrickCard,
      });
      hand.append(button);
    });
    const phaseLabel = ({ pass: "Passing intelligence", bid: "Negotiating contract", play: "Trick in progress", ended: "Operation complete" })[state.phase];
    setStatus(root, `${phaseLabel} · round ${state.round + 1} · ${state.tricksPlayed}/13 tricks.`);
  };

  const reset = (humans = state?.humans || [0], difficulty = difficultyValue(root)) => {
    state = {
      difficulty, humans: [...humans], round: 0, phase: "deal", hands: [[], [], [], []], trick: [], lastTrick: [], tricksPlayed: 0,
      scores: [0, 0, 0, 0], roundPoints: [0, 0, 0, 0], teamScores: [0, 0], bids: [null, null, null, null],
      bidConfirmed: [false, false, false, false], tricksWon: [0, 0, 0, 0], heartsBroken: false, spadesBroken: false,
      leader: 0, turn: 0, winners: [], passSelected: [[], [], [], []], passConfirmed: [false, false, false, false],
    };
    root.querySelector("[data-game-difficulty]").value = difficulty;
    dealRound();
    advanceBots();
    render();
    playMotion(board, null, { fresh: true });
  };

  root.querySelector("[data-game-new]").addEventListener("click", () => submit({ type: "new" }));
  root.querySelector("[data-game-difficulty]").addEventListener("change", (event) => submit({ type: "difficulty", value: event.target.value }));
  titlebarHelp(root, heartsMode
    ? "Drag a card to the orders strip to pass it, or to the table to play it. Follow suit: every heart costs one point and the Queen of Spades costs thirteen."
    : "Bid your expected tricks, then drag a legal card to the table. Spades trump other suits after they are broken; opposite seats score as a team.");
  reset();
  const updateHumans = (humans) => {
    state.humans = [...humans];
    if (heartsMode && state.phase === "pass") {
      for (let seat = 0; seat < 4; ++seat) if (!state.humans.includes(seat) && !state.passConfirmed[seat]) {
        state.passSelected[seat] = botHeartPass(state.hands[seat]);
        state.passConfirmed[seat] = true;
      }
    } else if (!heartsMode && state.phase === "bid") {
      for (let seat = 0; seat < 4; ++seat) if (!state.humans.includes(seat) && !state.bidConfirmed[seat]) {
        state.bids[seat] = botBid(state.hands[seat]);
        state.bidConfirmed[seat] = true;
      }
    }
    advanceBots();
    render();
  };
  return {
    reset,
    apply,
    configureHumans(humans) { reset(humans, difficultyValue(root)); },
    updateHumans,
    setLocalSeat(seat) { localSeat = seat; root.querySelector("[data-game-difficulty]").disabled = seat !== 0; render(); },
    load(next) { state = clone(next); root.querySelector("[data-game-difficulty]").value = state.difficulty; render(); },
    snapshot: () => clone(state),
  };
}

function createInternetSession(spec, root, game) {
  const roomInput = root.querySelector("[data-network-room]");
  const nameInput = root.querySelector("[data-network-name]");
  const hostButton = root.querySelector("[data-network-host]");
  const joinButton = root.querySelector("[data-network-join]");
  const leaveButton = root.querySelector("[data-network-leave]");
  const statusNode = root.querySelector("[data-network-status]");
  let endpoint = null;
  let role = null;
  let localSeat = 0;
  let peerSeats = new Map();
  let joinTimer = null;
  let connecting = false;
  let storage = null;
  try { storage = window.localStorage; } catch { /* private browsing can deny storage */ }
  const settings = loadOrCreateNetworkSettings({ storage, queryParams: new URLSearchParams(window.location.search) });
  roomInput.value = settings.room;
  nameInput.value = settings.name;

  const setNetworkStatus = (message, kind = "") => {
    statusNode.textContent = message;
    statusNode.dataset.kind = kind;
  };

  const currentIceServers = () => {
    const url = document.querySelector("#networkStun")?.value.trim();
    if (!url) return [];
    const server = { urls: [url] };
    const username = document.querySelector("#networkIceUsername")?.value;
    const credential = document.querySelector("#networkIceCredential")?.value;
    if (username) server.username = username;
    if (credential) server.credential = credential;
    return [server];
  };

  const wireMessage = (message) => encoder.encode(JSON.stringify({ v: GAME_PROTOCOL_VERSION, game: spec.id, ...message }));

  const send = (message, peerId = null) => {
    if (!endpoint) return false;
    const peer = peerId ? endpoint.snapshot().peers.find((candidate) => candidate.peerId === peerId) : null;
    const written = endpoint.sendDatagram({
      bytes: wireMessage(message),
      ip: peer?.virtualIp ?? webRtcUdpWireContract.broadcastIp,
      port: GAME_PORT,
      sourcePort: GAME_PORT,
    });
    return written > 0;
  };

  const broadcastState = () => send({ type: "state", state: game.snapshot() });

  const humanSeats = () => [0, ...[...peerSeats.values()].filter((seat) => seat >= 1)].sort((a, b) => a - b);

  const assignSeat = (peerId) => {
    if (peerSeats.has(peerId)) return peerSeats.get(peerId);
    const occupied = new Set(peerSeats.values());
    let seat = -1;
    for (let candidate = 1; candidate < spec.maxPlayers; ++candidate) if (!occupied.has(candidate)) { seat = candidate; break; }
    peerSeats.set(peerId, seat);
    if (seat >= 1) game.configureHumans(humanSeats());
    return seat;
  };

  const parseMessage = (datagram) => {
    if (datagram.destinationPort !== GAME_PORT) return null;
    try {
      const message = JSON.parse(decoder.decode(datagram.bytes));
      return message?.v === GAME_PROTOCOL_VERSION && message.game === spec.id ? message : null;
    } catch {
      return null;
    }
  };

  const onDatagram = (datagram) => {
    const message = parseMessage(datagram);
    if (!message) return;
    if (role === "host") {
      if (message.type === "join" || message.type === "state-request") {
        const seat = assignSeat(datagram.peerId);
        send({ type: "welcome", seat, state: game.snapshot(), host: nameInput.value }, datagram.peerId);
        broadcastState();
        setNetworkStatus(seat >= 0 ? `${message.name || "A commander"} joined seat ${seat + 1}.` : "Room is full; the new peer is observing.", "online");
        playGameSound("connect");
      } else if (message.type === "action") {
        const seat = peerSeats.get(datagram.peerId);
        if (seat >= 1 && game.apply(message.action, seat)) broadcastState();
      }
      return;
    }
    if (role === "join" && message.type === "welcome") {
      localSeat = Number(message.seat);
      clearInterval(joinTimer);
      joinTimer = null;
      if (localSeat >= 0) {
        game.setLocalSeat(localSeat);
        game.load(message.state);
        setNetworkStatus(`Connected to ${message.host || "host"} as seat ${localSeat + 1}.`, "online");
      } else {
        game.load(message.state);
        setNetworkStatus("Room full. Connected as an observer.", "warning");
      }
    } else if (role === "join" && message.type === "state") game.load(message.state);
  };

  const disconnect = async () => {
    clearInterval(joinTimer);
    joinTimer = null;
    const closing = endpoint;
    endpoint = null;
    role = null;
    peerSeats = new Map();
    connecting = false;
    await closing?.close();
    hostButton.disabled = false;
    joinButton.disabled = false;
    leaveButton.disabled = true;
    roomInput.disabled = false;
    nameInput.disabled = false;
    setNetworkStatus("Offline. Host or join a room to deploy.");
    if (closing) playGameSound("disconnect");
  };

  const connect = async ({ role: requestedRole, room = roomInput.value, name = nameInput.value, relayUrls = null, iceServers = null } = {}) => {
    if (connecting || endpoint) await disconnect();
    const roomCode = String(room || "").trim();
    const commander = normalizeCommanderName(name);
    if (!roomCode || !commander) throw new Error("Room and commander name are required");
    connecting = true;
    role = requestedRole === "join" ? "join" : "host";
    roomInput.value = roomCode;
    nameInput.value = commander;
    saveNetworkSettings(storage, { ...settings, room: roomCode, name: commander });
    hostButton.disabled = true;
    joinButton.disabled = true;
    leaveButton.disabled = false;
    roomInput.disabled = true;
    nameInput.disabled = true;
    setNetworkStatus(`Contacting the New Shoes relay for ${roomCode}…`);
    try {
      endpoint = createWebRtcUdpEndpoint({
        room: `xp-games-v${GAME_PROTOCOL_VERSION}:${spec.id}:${roomCode}`,
        peerId: commander,
        displayName: commander,
        iceServers: iceServers || currentIceServers(),
        relayUrls,
        onDatagram,
        onStateChange: (networkState) => {
          if (!endpoint || networkState.lastError) {
            if (networkState.lastError) setNetworkStatus(networkState.lastError, "warning");
            return;
          }
          if (role === "host") {
            const activePeers = new Set(networkState.peers.map((peer) => peer.peerId));
            const departed = [...peerSeats.keys()].filter((peerId) => !activePeers.has(peerId));
            if (departed.length) {
              const departedSeats = departed.map((peerId) => peerSeats.get(peerId));
              departed.forEach((peerId) => peerSeats.delete(peerId));
              if (departedSeats.some((seat) => seat >= 1)) {
                game.updateHumans(humanSeats());
                broadcastState();
                setNetworkStatus("A commander disconnected; bots have assumed their orders.", "warning");
              }
            } else if (networkState.openPeers > 0) setNetworkStatus(`${networkState.openPeers} peer${networkState.openPeers === 1 ? "" : "s"} on direct WebRTC.`, "online");
          }
        },
      });
      const networkState = await endpoint.connect(20000);
      connecting = false;
      playGameSound("connect");
      if (role === "host") {
        localSeat = 0;
        game.setLocalSeat(0);
        game.configureHumans([0]);
        setNetworkStatus(`Hosting ${roomCode}. Waiting on the direct channel.`, "online");
      } else {
        setNetworkStatus(`Signaling ready for ${roomCode}. Waiting for host…`);
        const requestJoin = () => send({ type: "join", name: commander });
        requestJoin();
        joinTimer = setInterval(requestJoin, 1000);
      }
      return networkState;
    } catch (error) {
      const message = error?.message || String(error);
      await disconnect();
      setNetworkStatus(message, "warning");
      playGameSound("error");
      throw error;
    }
  };

  const submit = (action) => {
    if (!endpoint || localSeat < 0) {
      setNetworkStatus("Connect to a room before issuing game orders.", "warning");
      playGameSound("error");
      return false;
    }
    if (role === "host") {
      const accepted = game.apply(action, 0);
      if (accepted) broadcastState();
      return accepted;
    }
    return send({ type: "action", action });
  };

  hostButton.addEventListener("click", () => void connect({ role: "host" }).catch((error) => showToast("Could not host game", error.message, "warning")));
  joinButton.addEventListener("click", () => void connect({ role: "join" }).catch((error) => showToast("Could not join game", error.message, "warning")));
  leaveButton.addEventListener("click", () => void disconnect());
  root.closest(".window").querySelector('[data-window-action="close"]').addEventListener("click", () => void disconnect());
  return { connect, disconnect, submit, snapshot: () => ({ role, localSeat, network: endpoint?.snapshot() ?? null, peers: Object.fromEntries(peerSeats) }) };
}

const controllers = new Map();
const internetSessions = new Map();

function installLocalGame(spec, factory) {
  const root = document.querySelector(`[data-game-root="${spec.id}"]`);
  const controller = factory(root);
  controllers.set(spec.id, controller);
}

function installInternetGame(spec, factory) {
  const root = document.querySelector(`[data-game-root="${spec.id}"]`);
  let session;
  const controller = factory(root, (action) => session.submit(action));
  session = createInternetSession(spec, root, controller);
  controllers.set(spec.id, controller);
  internetSessions.set(spec.id, session);
}

installLocalGame(GAME_SPECS.find((spec) => spec.id === "minesweeper"), createMinesweeper);
installLocalGame(GAME_SPECS.find((spec) => spec.id === "pinball"), createWarPinball);
installLocalGame(GAME_SPECS.find((spec) => spec.id === "solitaire"), createSolitaire);
installLocalGame(GAME_SPECS.find((spec) => spec.id === "spider"), createSpider);
installLocalGame(GAME_SPECS.find((spec) => spec.id === "freecell"), createFreeCell);
{
  const spec = GAME_SPECS.find((candidate) => candidate.id === "hearts");
  const root = document.querySelector(`[data-game-root="${spec.id}"]`);
  let controller;
  controller = createTrickGame(root, (action) => controller.apply(action, 0), "hearts");
  controllers.set(spec.id, controller);
}
installInternetGame(GAME_SPECS.find((spec) => spec.id === "backgammon"), createBackgammon);
installInternetGame(GAME_SPECS.find((spec) => spec.id === "checkers"), createCheckers);
installInternetGame(GAME_SPECS.find((spec) => spec.id === "internethearts"), (root, submit) => createTrickGame(root, submit, "hearts"));
installInternetGame(GAME_SPECS.find((spec) => spec.id === "reversi"), createReversi);
installInternetGame(GAME_SPECS.find((spec) => spec.id === "spades"), (root, submit) => createTrickGame(root, submit, "spades"));

function resetAll() {
  for (const session of internetSessions.values()) void session.disconnect();
  for (const controller of controllers.values()) controller.reset();
}

window.addEventListener("beforeunload", () => { for (const session of internetSessions.values()) void session.disconnect(); });
window.ZeroHGames = {
  specs: GAME_SPECS,
  resetAll,
  snapshot: (id) => controllers.get(id)?.snapshot() ?? null,
  networkSnapshot: (id) => internetSessions.get(id)?.snapshot() ?? null,
  connectInternet: (id, options) => internetSessions.get(id)?.connect(options),
  disconnectInternet: (id) => internetSessions.get(id)?.disconnect(),
};
