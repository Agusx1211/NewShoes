import { MAP_HEIGHT_SCALE, MAP_XY_SCALE, MapDocument } from "./world-builder-map.mjs";
import { WorldBuilderStore } from "./world-builder-store.mjs";
import { loadWorldBuilderCatalog } from "./world-builder-catalog.mjs";

const TOOL_SPECS = Object.freeze([
  ["select", "⌖", "Select"],
  ["raise", "▲", "Raise"],
  ["lower", "▼", "Lower"],
  ["smooth", "≈", "Smooth"],
  ["flatten", "━", "Flatten"],
  ["terrain", "▧", "Terrain"],
  ["block", "▦", "Impassable"],
  ["unblock", "▥", "Passable"],
  ["object", "◆", "Object"],
  ["waypoint", "●", "Waypoint"],
  ["start", "★", "Start"],
  ["road", "╱", "Road"],
  ["scorch", "✹", "Scorch"],
  ["area", "⬡", "Area"],
  ["water", "≈", "Water"],
  ["erase", "×", "Erase"],
]);

const DEFAULT_OBJECT_PROPERTIES = Object.freeze({
  owner: "team",
  layer: "",
});

const state = {
  document: MapDocument.create(),
  store: new WorldBuilderStore(),
  currentPath: null,
  sidecars: new Map(),
  catalog: null,
  catalogError: null,
  tool: "select",
  brushRadius: 5,
  brushStrength: 4,
  selectedObject: null,
  selectedPolygon: null,
  selectedScript: null,
  selectedScriptPlayer: 0,
  selectedTerrain: 0,
  selectedCatalogObject: "",
  selectedRoad: "GravelRoad",
  scorchType: 0,
  scorchRadius: 20,
  selectedPlayer: 0,
  selectedTeam: 0,
  polygonDraft: [],
  roadDraft: null,
  pointer: null,
  dragging: false,
  flattenHeight: 0,
  activeTab: "objects",
  renderPending: false,
  currentSave: null,
  lastAutosaveRevision: -1,
};

function injectShell() {
  document.querySelector(".svg-sprite")?.insertAdjacentHTML("beforeend", `
    <symbol id="i-world-builder" viewBox="0 0 48 48">
      <path d="M5 8h38v32H5z" fill="#3e6577" stroke="#d9edf2" stroke-width="2"/>
      <path d="m7 34 9-11 7 6 7-12 11 17H7Z" fill="#86a358"/>
      <path d="m7 34 9-11 7 6 4-7 7 12H7Z" fill="#c7b26e" opacity=".8"/>
      <path d="M11 12h10M11 16h6M35 8v32M5 31h38" stroke="#eef7f8" opacity=".65"/>
      <path d="m30 10 8 8-15 15-9 2 2-9 14-16Z" fill="#edb84f" stroke="#684c24"/>
    </symbol>`);
  const desktopButton = document.createElement("button");
  desktopButton.className = "desktop-icon";
  desktopButton.type = "button";
  desktopButton.dataset.open = "worldBuilder";
  desktopButton.setAttribute("aria-label", "Open World Builder");
  desktopButton.innerHTML = `<span class="desktop-icon-art app-art"><svg><use href="#i-world-builder"/></svg></span><span>World Builder</span>`;
  document.querySelector(".desktop-icons")?.append(desktopButton);
  document.querySelector(".start-primary")?.insertAdjacentHTML("beforeend", `
    <button type="button" data-open="worldBuilder"><span class="start-icon"><svg><use href="#i-world-builder"/></svg></span>
      <div><strong>World Builder</strong><small>Create and play Zero Hour maps</small></div></button>`);
  document.querySelector("#windowLayer")?.insertAdjacentHTML("beforeend", `
    <article id="worldBuilderWindow" class="window world-builder-window" data-app="worldBuilder"
      style="--x: 52%; --y: 45%; --w: 1180px; --h: 760px;" aria-label="World Builder">
      <header class="titlebar">
        <div class="titlebar-title"><span class="titlebar-app-icon"><svg><use href="#i-world-builder"/></svg></span>
          <span data-wb-title>World Builder — Untitled Map</span></div>
        <div class="window-controls"><button type="button" data-window-action="minimize" aria-label="Minimize">—</button>
          <button type="button" data-window-action="maximize" aria-label="Maximize">□</button>
          <button type="button" data-window-action="close" aria-label="Close">×</button></div>
      </header>
      <div class="wb-shell">
        <nav class="wb-menubar" aria-label="World Builder menu">
          <button type="button" data-wb-action="new"><u>F</u>ile</button>
          <button type="button" data-wb-action="undo"><u>E</u>dit</button>
          <button type="button" data-wb-action="validate"><u>V</u>alidate</button>
          <span>Zero Hour map format · active mod profile</span>
        </nav>
        <div class="wb-commandbar">
          <div class="wb-file-actions">
            <button type="button" data-wb-action="new" title="New map (Ctrl+N)">New</button>
            <button type="button" data-wb-action="open" title="Open browser map library">Open</button>
            <button type="button" data-wb-action="import" title="Import a .map file">Import</button>
            <button type="button" class="primary" data-wb-action="save" title="Save (Ctrl+S)">Save</button>
            <button type="button" data-wb-action="save-as">Save as</button>
            <button type="button" data-wb-action="export">Export</button>
          </div>
          <i></i>
          <button type="button" data-wb-action="undo" title="Undo (Ctrl+Z)">↶</button>
          <button type="button" data-wb-action="redo" title="Redo (Ctrl+Y)">↷</button>
          <i></i>
          <button type="button" data-wb-action="validate">✓ Validate</button>
          <button type="button" class="playtest" data-wb-action="playtest">▶ Playtest in Zero Hour</button>
          <input type="file" data-wb-import accept=".map,.tga,.ini,application/octet-stream,image/x-tga" multiple hidden>
        </div>
        <div class="wb-workspace">
          <aside class="wb-tools" aria-label="Map tools">
            ${TOOL_SPECS.map(([id, icon, label]) => `<button type="button" data-wb-tool="${id}" title="${label}"><b>${icon}</b><span>${label}</span></button>`).join("")}
          </aside>
          <main class="wb-stage">
            <div class="wb-autosave-banner" data-wb-autosave-banner hidden>
              <span>A newer autosave is available for this mod profile.</span>
              <button type="button" data-wb-action="restore-autosave">Restore</button>
              <button type="button" data-wb-action="dismiss-autosave">Dismiss</button>
            </div>
            <div class="wb-canvas-wrap">
              <canvas data-wb-canvas width="900" height="600" aria-label="Top-down map editor"></canvas>
              <div class="wb-canvas-empty" data-wb-canvas-message hidden></div>
              <div class="wb-view-badge">2D editor view <span>•</span> W3D playtest uses the original engine</div>
            </div>
            <footer class="wb-statusbar">
              <span data-wb-status>Ready</span>
              <span data-wb-coordinates>X — · Y — · Z —</span>
              <span data-wb-summary></span>
            </footer>
          </main>
          <aside class="wb-inspector">
            <nav class="wb-tabs" aria-label="Inspector">
              <button type="button" data-wb-tab="objects">Objects</button>
              <button type="button" data-wb-tab="terrain">Terrain</button>
              <button type="button" data-wb-tab="areas">Areas</button>
              <button type="button" data-wb-tab="scripts">Scripts</button>
              <button type="button" data-wb-tab="sides">Players</button>
              <button type="button" data-wb-tab="map">Map</button>
            </nav>
            <div class="wb-panel" data-wb-panel="objects"></div>
            <div class="wb-panel" data-wb-panel="terrain" hidden></div>
            <div class="wb-panel" data-wb-panel="areas" hidden></div>
            <div class="wb-panel" data-wb-panel="scripts" hidden></div>
            <div class="wb-panel" data-wb-panel="sides" hidden></div>
            <div class="wb-panel" data-wb-panel="map" hidden></div>
          </aside>
        </div>
      </div>
      <dialog class="wb-dialog" data-wb-new-dialog>
        <form method="dialog">
          <header><h2>New Zero Hour map</h2><button value="cancel" aria-label="Close">×</button></header>
          <label>Map name<input name="name" value="Untitled Map" maxlength="120" required></label>
          <div class="wb-field-row"><label>Playable width<input name="width" type="number" min="32" max="1024" value="128"></label>
            <label>Playable height<input name="height" type="number" min="32" max="1024" value="128"></label></div>
          <div class="wb-field-row"><label>Border<input name="border" type="number" min="8" max="128" value="16"></label>
            <label>Initial elevation<input name="elevation" type="number" min="0" max="255" value="24"></label></div>
          <label>Base terrain<select name="terrain"><option>SandMediumType5</option></select></label>
          <p>World Builder stores maps in the active vanilla or mod-specific Zero Hour data folder.</p>
          <footer><button value="cancel">Cancel</button><button class="primary" value="create">Create map</button></footer>
        </form>
      </dialog>
      <dialog class="wb-dialog wb-library-dialog" data-wb-library-dialog>
        <form method="dialog">
          <header><h2>Map library</h2><button value="cancel" aria-label="Close">×</button></header>
          <div data-wb-library-list class="wb-library-list"><p>Loading maps…</p></div>
          <footer><button value="cancel">Close</button></footer>
        </form>
      </dialog>
      <dialog class="wb-dialog wb-save-dialog" data-wb-save-dialog>
        <form method="dialog">
          <header><h2>Save map as</h2><button value="cancel" aria-label="Close">×</button></header>
          <label>Map name<input name="name" maxlength="120" required></label>
          <p>The engine expects <code>Maps\\Name\\Name.map</code>. World Builder creates that layout automatically.</p>
          <footer><button value="cancel">Cancel</button><button class="primary" value="save">Save</button></footer>
        </form>
      </dialog>
      <dialog class="wb-dialog wb-validation-dialog" data-wb-validation-dialog>
        <form method="dialog">
          <header><h2>Map validation</h2><button value="cancel" aria-label="Close">×</button></header>
          <div data-wb-validation-results></div>
          <footer><button value="cancel">Close</button></footer>
        </form>
      </dialog>
    </article>`);
}

injectShell();

const root = document.querySelector("#worldBuilderWindow");
const canvas = root.querySelector("[data-wb-canvas]");
const context = canvas.getContext("2d", { alpha: false });
const statusNode = root.querySelector("[data-wb-status]");
const coordinatesNode = root.querySelector("[data-wb-coordinates]");
const summaryNode = root.querySelector("[data-wb-summary]");
const titleNode = root.querySelector("[data-wb-title]");
const importInput = root.querySelector("[data-wb-import]");
const newDialog = root.querySelector("[data-wb-new-dialog]");
const libraryDialog = root.querySelector("[data-wb-library-dialog]");
const saveDialog = root.querySelector("[data-wb-save-dialog]");
const validationDialog = root.querySelector("[data-wb-validation-dialog]");
let lastView = null;
let autosaveRecord = null;

function toast(title, message, kind) {
  window.ZeroHDesktop?.showToast(title, message, kind);
}

function setStatus(message) {
  statusNode.textContent = message;
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function hashColor(name) {
  let hash = 2166136261;
  for (const character of String(name)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 28% 42%)`;
}

function requestRender() {
  if (state.renderPending) return;
  state.renderPending = true;
  requestAnimationFrame(() => {
    state.renderPending = false;
    render();
  });
}

function fitView() {
  const document = state.document;
  const padding = 18;
  const scale = Math.min(
    (canvas.width - padding * 2) / document.worldWidth,
    (canvas.height - padding * 2) / document.worldHeight,
  );
  const width = document.worldWidth * scale;
  const height = document.worldHeight * scale;
  return {
    scale,
    left: (canvas.width - width) / 2,
    top: (canvas.height - height) / 2,
    width,
    height,
  };
}

function screenPoint(x, y) {
  const view = lastView || fitView();
  return {
    x: view.left + x * view.scale,
    y: view.top + view.height - y * view.scale,
  };
}

function worldPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const view = lastView || fitView();
  const x = (event.clientX - rect.left) * canvas.width / rect.width;
  const y = (event.clientY - rect.top) * canvas.height / rect.height;
  return {
    x: Math.max(0, Math.min(state.document.worldWidth, (x - view.left) / view.scale)),
    y: Math.max(0, Math.min(state.document.worldHeight, (view.top + view.height - y) / view.scale)),
  };
}

function terrainCell(point) {
  return {
    x: Math.max(0, Math.min(state.document.heightMap.width - 1, Math.round(point.x / MAP_XY_SCALE))),
    y: Math.max(0, Math.min(state.document.heightMap.height - 1, Math.round(point.y / MAP_XY_SCALE))),
  };
}

function terrainTextureIndex(tileValue) {
  const tile = tileValue >> 2;
  const textures = state.document.blend?.textures || [];
  return Math.max(0, textures.findIndex((texture) =>
    tile >= texture.firstTile && tile < texture.firstTile + texture.tileCount));
}

function renderTerrain(view) {
  const document = state.document;
  const width = Math.min(document.heightMap.width, 512);
  const height = Math.min(document.heightMap.height, 512);
  const preview = typeof OffscreenCanvas === "function"
    ? new OffscreenCanvas(width, height)
    : Object.assign(globalThis.document.createElement("canvas"), { width, height });
  const previewContext = preview.getContext("2d");
  const image = previewContext.createImageData(width, height);
  const colors = (document.blend?.textures || []).map((texture) => {
    const match = /hsl\((\d+)/.exec(hashColor(texture.name));
    const hue = Number(match?.[1] || 45) / 60;
    const chroma = 48;
    const x = chroma * (1 - Math.abs(hue % 2 - 1));
    const rgb = hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0]
      : hue < 3 ? [0, chroma, x] : hue < 4 ? [0, x, chroma]
        : hue < 5 ? [x, 0, chroma] : [chroma, 0, x];
    return rgb.map((value) => value + 58);
  });
  for (let py = 0; py < height; py += 1) {
    const cellY = Math.min(document.heightMap.height - 1,
      Math.floor((height - 1 - py) * document.heightMap.height / height));
    for (let px = 0; px < width; px += 1) {
      const cellX = Math.min(document.heightMap.width - 1,
        Math.floor(px * document.heightMap.width / width));
      const index = document.terrainIndex(cellX, cellY);
      const elevation = document.heightMap.elevations[index];
      const shade = 0.48 + elevation / (document.heightMap.version >= 5 ? 131070 : 510);
      const color = colors[terrainTextureIndex(document.blend?.tiles[index] || 0)] || [96, 106, 70];
      const target = (py * width + px) * 4;
      if (!document.isPassable(cellX, cellY)) {
        image.data[target] = Math.min(255, color[0] * shade + 95);
        image.data[target + 1] = color[1] * shade * 0.45;
        image.data[target + 2] = color[2] * shade * 0.45;
      } else {
        image.data[target] = color[0] * shade;
        image.data[target + 1] = color[1] * shade;
        image.data[target + 2] = color[2] * shade;
      }
      image.data[target + 3] = 255;
    }
  }
  previewContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = true;
  context.drawImage(preview, view.left, view.top, view.width, view.height);
}

function renderPolygons() {
  for (const polygon of state.document.polygons.polygons) {
    if (polygon.points.length < 2) continue;
    context.beginPath();
    polygon.points.forEach((point, index) => {
      const screen = screenPoint(point.x, point.y);
      if (!index) context.moveTo(screen.x, screen.y);
      else context.lineTo(screen.x, screen.y);
    });
    context.closePath();
    context.fillStyle = polygon.isWater ? "rgba(55,154,211,.3)" : "rgba(244,190,63,.16)";
    context.strokeStyle = polygon === state.selectedPolygon
      ? "#fff48a" : polygon.isWater ? "#68d8ff" : "#f1c251";
    context.lineWidth = polygon === state.selectedPolygon ? 2.5 : 1.2;
    context.fill();
    context.stroke();
  }
}

function renderObjects() {
  const waypoints = state.document.waypoints();
  const byId = new Map(waypoints.map((waypoint) => [waypoint.id, waypoint.object]));
  context.save();
  context.strokeStyle = "rgba(128,224,255,.7)";
  context.lineWidth = 1.5;
  context.setLineDash([4, 3]);
  for (const link of state.document.waypointLinks) {
    const start = byId.get(link.start);
    const end = byId.get(link.end);
    if (!start || !end) continue;
    const from = screenPoint(start.x, start.y);
    const to = screenPoint(end.x, end.y);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
  const starts = new Map(waypoints.map((waypoint) => [waypoint.object, waypoint.name]));
  for (const object of state.document.objects) {
    const screen = screenPoint(object.x, object.y);
    const waypointName = starts.get(object);
    const selected = object === state.selectedObject;
    context.save();
    context.translate(screen.x, screen.y);
    context.rotate(-object.angle);
    if (/^Player_\d+_Start$/i.test(waypointName || "")) {
      context.fillStyle = selected ? "#fff" : "#ffd857";
      context.strokeStyle = "#3b2c0b";
      context.lineWidth = 1.5;
      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const radius = point % 2 ? 4 : 9;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (!point) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.stroke();
    } else if (waypointName) {
      context.fillStyle = selected ? "#fff" : "#7ce4ff";
      context.beginPath();
      context.arc(0, 0, selected ? 6 : 4, 0, Math.PI * 2);
      context.fill();
    } else if (object.type === "Scorch") {
      const radius = Number(object.properties.find((item) => item.key === "objectRadius")?.value || 20);
      const screenRadius = Math.max(3, radius * (lastView?.scale || 1));
      context.fillStyle = selected ? "rgba(255,255,255,.7)" : "rgba(40,29,23,.7)";
      context.beginPath();
      context.ellipse(0, 0, screenRadius, screenRadius * .72, 0, 0, Math.PI * 2);
      context.fill();
    } else if (object.flags & 0x86) {
      context.fillStyle = selected ? "#fff" : "#d6c49b";
      context.fillRect(-5, -3, 10, 6);
      context.strokeStyle = "#4b3c25";
      context.strokeRect(-5, -3, 10, 6);
    } else {
      context.fillStyle = selected ? "#fff" : "#d87b54";
      context.strokeStyle = "#2b1510";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, -6);
      context.lineTo(5, 4);
      context.lineTo(-5, 4);
      context.closePath();
      context.fill();
      context.stroke();
    }
    context.restore();
  }
}

function renderDrafts() {
  if (state.roadDraft && state.pointer) {
    const start = screenPoint(state.roadDraft.x, state.roadDraft.y);
    const end = screenPoint(state.pointer.x, state.pointer.y);
    context.strokeStyle = "#fff2ae";
    context.lineWidth = 4;
    context.setLineDash([8, 5]);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.setLineDash([]);
  }
  if (state.polygonDraft.length) {
    context.strokeStyle = state.tool === "water" ? "#75ddff" : "#ffe273";
    context.fillStyle = state.tool === "water" ? "rgba(64,174,224,.22)" : "rgba(255,218,91,.15)";
    context.lineWidth = 2;
    context.beginPath();
    [...state.polygonDraft, ...(state.pointer ? [state.pointer] : [])].forEach((point, index) => {
      const screen = screenPoint(point.x, point.y);
      if (!index) context.moveTo(screen.x, screen.y);
      else context.lineTo(screen.x, screen.y);
    });
    if (state.polygonDraft.length > 2) context.closePath();
    context.fill();
    context.stroke();
  }
  if (state.pointer && ["raise", "lower", "smooth", "flatten", "terrain", "block", "unblock"].includes(state.tool)) {
    const screen = screenPoint(state.pointer.x, state.pointer.y);
    context.strokeStyle = "rgba(255,255,255,.9)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(screen.x, screen.y, state.brushRadius * MAP_XY_SCALE * (lastView?.scale || 1), 0, Math.PI * 2);
    context.stroke();
  }
}

function render() {
  if (!canvas.width || !canvas.height) return;
  lastView = fitView();
  context.fillStyle = "#17242a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  renderTerrain(lastView);
  const border = state.document.heightMap.border * MAP_XY_SCALE;
  const topLeft = screenPoint(border, state.document.worldHeight - border);
  const bottomRight = screenPoint(state.document.worldWidth - border, border);
  context.strokeStyle = "rgba(255,236,133,.9)";
  context.lineWidth = 1.3;
  context.setLineDash([6, 4]);
  context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  context.setLineDash([]);
  renderPolygons();
  renderObjects();
  renderDrafts();
  updateChrome();
}

function updateChrome() {
  const document = state.document;
  titleNode.textContent = `World Builder — ${document.name}${document.dirty ? " *" : ""}`;
  summaryNode.textContent = `${document.playableWidth}×${document.playableHeight} · ${document.objects.length} objects · ${document.waypoints().length} waypoints`;
  root.querySelectorAll("[data-wb-tool]").forEach((button) =>
    button.classList.toggle("is-active", button.dataset.wbTool === state.tool));
  root.querySelectorAll("[data-wb-tab]").forEach((button) =>
    button.classList.toggle("is-active", button.dataset.wbTab === state.activeTab));
  root.querySelectorAll('[data-wb-action="undo"]').forEach((button) => {
    button.disabled = state.document.undoStack.length === 0;
  });
  root.querySelectorAll('[data-wb-action="redo"]').forEach((button) => {
    button.disabled = state.document.redoStack.length === 0;
  });
}

function selectTab(tab) {
  state.activeTab = tab;
  root.querySelectorAll("[data-wb-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.wbPanel !== tab;
  });
  renderInspector();
  updateChrome();
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function labeledInput(label, value, onChange, options = {}) {
  const wrapper = createElement("label", "wb-field");
  wrapper.append(createElement("span", "", label));
  const input = document.createElement(options.multiline ? "textarea" : "input");
  input.value = value ?? "";
  if (options.type) input.type = options.type;
  if (options.step) input.step = options.step;
  input.addEventListener("change", () => onChange(input.value));
  wrapper.append(input);
  return wrapper;
}

function renderObjectsPanel(panel) {
  panel.replaceChildren();
  const heading = createElement("header", "wb-panel-heading");
  heading.append(createElement("div", "", "Object palette"));
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search installed objects…";
  heading.append(search);
  panel.append(heading);
  const palette = createElement("div", "wb-palette-list");
  const objects = state.catalog?.objects || [];
  const drawPalette = () => {
    const query = search.value.trim().toLowerCase();
    palette.replaceChildren();
    const matches = objects.filter((item) => !query || item.name.toLowerCase().includes(query)).slice(0, 240);
    if (!matches.length) {
      palette.append(createElement("p", "wb-empty-note",
        state.catalogError || (state.catalog ? "No objects match." : "Loading original object definitions…")));
      return;
    }
    for (const item of matches) {
      const button = createElement("button", state.selectedCatalogObject === item.name ? "is-selected" : "");
      button.type = "button";
      button.title = item.source;
      button.append(createElement("b", "", "◆"), createElement("span", "", item.name));
      button.addEventListener("click", () => {
        state.selectedCatalogObject = item.name;
        setTool("object");
        drawPalette();
      });
      palette.append(button);
    }
  };
  search.addEventListener("input", drawPalette);
  drawPalette();
  panel.append(palette);
  const scorchControls = createElement("section", "wb-selection-inspector");
  scorchControls.append(createElement("h3", "", "Scorch marks"));
  const scorchType = document.createElement("select");
  ["Scorch 1", "Scorch 2", "Scorch 3", "Scorch 4", "Shadow scorch"].forEach((label, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = label;
    scorchType.append(option);
  });
  scorchType.value = String(state.scorchType);
  scorchType.addEventListener("change", () => { state.scorchType = Number(scorchType.value); });
  const typeField = createElement("label", "wb-field");
  typeField.append(createElement("span", "", "Scorch type"), scorchType);
  scorchControls.append(typeField);
  scorchControls.append(labeledInput("Radius", state.scorchRadius, (value) => {
    state.scorchRadius = Math.max(1, Math.min(200, Number(value)));
    setTool("scorch");
  }, { type: "number", step: "1" }));
  const scorchButton = createElement("button", "", "Place scorch");
  scorchButton.type = "button";
  scorchButton.addEventListener("click", () => setTool("scorch"));
  scorchControls.append(scorchButton);
  panel.append(scorchControls);
  const selected = state.selectedObject;
  const inspector = createElement("section", "wb-selection-inspector");
  inspector.append(createElement("h3", "", selected ? "Selected object" : "Selection"));
  if (!selected) {
    inspector.append(createElement("p", "", "Choose Select, then click an object on the map."));
  } else {
    inspector.append(createElement("strong", "", selected.type));
    const row = createElement("div", "wb-field-row");
    row.append(
      labeledInput("X", selected.x, (value) => editObject(selected, "x", Number(value)), { type: "number", step: ".1" }),
      labeledInput("Y", selected.y, (value) => editObject(selected, "y", Number(value)), { type: "number", step: ".1" }),
    );
    inspector.append(row);
    inspector.append(labeledInput("Angle (radians)", selected.angle,
      (value) => editObject(selected, "angle", Number(value)), { type: "number", step: ".05" }));
    const owner = selected.properties.find((item) => item.key === "originalOwner")?.value || "team";
    inspector.append(labeledInput("Owner team", owner,
      (value) => state.document.transaction("Change object owner", (document) =>
        document.setObjectProperty(selected, "originalOwner", 3, value))));
    const layer = selected.properties.find((item) => item.key === "objectLayer")?.value || "";
    inspector.append(labeledInput("Layer", layer,
      (value) => state.document.transaction("Change object layer", (document) =>
        document.setObjectProperty(selected, "objectLayer", 3, value))));
    const waypointId = selected.properties.find((item) => item.key === "waypointID")?.value;
    if (Number.isInteger(waypointId)) {
      inspector.append(createElement("h3", "", "Waypoint links"));
      const target = document.createElement("select");
      for (const waypoint of state.document.waypoints().filter((item) => item.id !== waypointId)) {
        const option = document.createElement("option");
        option.value = String(waypoint.id);
        option.textContent = `${waypoint.name} (#${waypoint.id})`;
        target.append(option);
      }
      const addLink = createElement("button", "", "Link to waypoint");
      addLink.type = "button";
      addLink.disabled = !target.options.length;
      addLink.addEventListener("click", () => {
        state.document.transaction("Add waypoint link", (document) =>
          document.addWaypointLink(waypointId, Number(target.value)));
        renderInspector();
        requestRender();
      });
      inspector.append(target, addLink);
      for (const link of state.document.waypointLinks.filter((item) =>
        item.start === waypointId || item.end === waypointId)) {
        const other = link.start === waypointId ? link.end : link.start;
        const row = createElement("div", "wb-link-row");
        row.append(createElement("span", "", `Linked with waypoint #${other}`));
        const removeLink = createElement("button", "danger", "×");
        removeLink.type = "button";
        removeLink.addEventListener("click", () => {
          state.document.transaction("Remove waypoint link", (document) =>
            document.removeWaypointLink(link.start, link.end));
          renderInspector();
          requestRender();
        });
        row.append(removeLink);
        inspector.append(row);
      }
    }
    inspector.append(createElement("h3", "", "Native properties"));
    for (const item of selected.properties) {
      inspector.append(labeledInput(`${item.key} (${["bool", "int", "real", "text", "unicode"][item.type]})`,
        item.value, (value) => {
          const parsed = item.type === 0 ? /^(1|true|yes|on)$/i.test(value)
            : item.type === 1 ? Number.parseInt(value, 10)
              : item.type === 2 ? Number(value) : value;
          state.document.transaction(`Change ${item.key}`, (document) =>
            document.setObjectProperty(selected, item.key, item.type, parsed));
          renderInspector();
          requestRender();
        }, { type: item.type === 1 || item.type === 2 ? "number" : "text", step: item.type === 2 ? ".01" : "1" }));
    }
    const remove = createElement("button", "danger", "Delete object");
    remove.type = "button";
    remove.addEventListener("click", () => deleteObject(selected));
    inspector.append(remove);
  }
  panel.append(inspector);
}

function renderTerrainPanel(panel) {
  panel.replaceChildren();
  panel.append(createElement("h3", "", "Brush"));
  const radius = labeledInput("Radius (cells)", state.brushRadius, (value) => {
    state.brushRadius = Math.max(1, Math.min(64, Number(value)));
  }, { type: "range" });
  radius.querySelector("input").min = "1";
  radius.querySelector("input").max = "64";
  panel.append(radius);
  const strength = labeledInput("Height strength", state.brushStrength, (value) => {
    state.brushStrength = Math.max(1, Math.min(32, Number(value)));
  }, { type: "range" });
  strength.querySelector("input").min = "1";
  strength.querySelector("input").max = "32";
  panel.append(strength);
  panel.append(createElement("h3", "", "Map textures"));
  const textures = createElement("div", "wb-texture-list");
  (state.document.blend?.textures || []).forEach((texture, index) => {
    const button = createElement("button", state.selectedTerrain === index ? "is-selected" : "");
    button.type = "button";
    const swatch = createElement("i");
    swatch.style.background = hashColor(texture.name);
    button.append(swatch, createElement("span", "", texture.name));
    button.addEventListener("click", () => {
      state.selectedTerrain = index;
      setTool("terrain");
      renderInspector();
    });
    textures.append(button);
  });
  panel.append(textures);
  panel.append(createElement("h3", "", "Installed terrain"));
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Add a terrain definition…";
  panel.append(search);
  const results = createElement("div", "wb-catalog-results");
  const drawResults = () => {
    results.replaceChildren();
    const query = search.value.trim().toLowerCase();
    if (!query) return;
    for (const item of (state.catalog?.terrains || [])
      .filter((candidate) => candidate.name.toLowerCase().includes(query)).slice(0, 80)) {
      const button = createElement("button", "", `+ ${item.name}`);
      button.type = "button";
      button.addEventListener("click", () => {
        state.document.transaction("Add terrain texture", (document) => {
          state.selectedTerrain = document.addTerrainTexture(item.name, { width: item.cellWidth });
        });
        setTool("terrain");
        renderInspector();
        requestRender();
      });
      results.append(button);
    }
  };
  search.addEventListener("input", drawResults);
  panel.append(results);
}

function renderAreasPanel(panel) {
  panel.replaceChildren();
  const controls = createElement("div", "wb-area-actions");
  for (const [tool, label] of [["area", "+ Trigger area"], ["water", "+ Water area"]]) {
    const button = createElement("button", "", label);
    button.type = "button";
    button.addEventListener("click", () => setTool(tool));
    controls.append(button);
  }
  panel.append(controls);
  const list = createElement("div", "wb-area-list");
  for (const polygon of state.document.polygons.polygons) {
    const button = createElement("button", polygon === state.selectedPolygon ? "is-selected" : "");
    button.type = "button";
    button.append(createElement("b", "", polygon.isWater ? "≈" : "⬡"),
      createElement("span", "", polygon.name),
      createElement("small", "", `${polygon.points.length} points`));
    button.addEventListener("click", () => {
      state.selectedPolygon = polygon;
      state.selectedObject = null;
      renderInspector();
      requestRender();
    });
    list.append(button);
  }
  panel.append(list);
  if (state.selectedPolygon) {
    const polygon = state.selectedPolygon;
    const inspector = createElement("section", "wb-selection-inspector");
    inspector.append(createElement("h3", "", "Selected area"));
    inspector.append(labeledInput("Name", polygon.name, (value) => {
      state.document.transaction("Rename area", () => { polygon.name = value; state.document.dirtyChunks.add("PolygonTriggers"); });
      renderInspector();
    }));
    if (polygon.isWater) {
      inspector.append(labeledInput("Water height", polygon.points[0]?.z || 0, (value) => {
        state.document.transaction("Change water height", () => {
          polygon.points.forEach((point) => { point.z = Number(value); });
          state.document.dirtyChunks.add("PolygonTriggers");
        });
        requestRender();
      }, { type: "number", step: ".5" }));
    }
    const remove = createElement("button", "danger", "Delete area");
    remove.type = "button";
    remove.addEventListener("click", () => {
      state.document.transaction("Delete area", () => {
        state.document.polygons.polygons = state.document.polygons.polygons.filter((item) => item !== polygon);
        state.document.dirtyChunks.add("PolygonTriggers");
      });
      state.selectedPolygon = null;
      renderInspector();
      requestRender();
    });
    inspector.append(remove);
    panel.append(inspector);
  }
}

function allScripts() {
  return (state.document.sides?.players || []).flatMap((player) => [
    ...player.scripts.map((script) => ({ player: player.index, group: null, script })),
    ...player.groups.flatMap((group) =>
      group.scripts.map((script) => ({ player: player.index, group: group.name, script }))),
  ]);
}

function renderScriptsPanel(panel) {
  panel.replaceChildren();
  const heading = createElement("div", "wb-panel-heading");
  heading.append(createElement("div", "", "Native map scripts"));
  const player = document.createElement("select");
  const definitions = state.document.sides?.definitions || [];
  definitions.forEach((definition, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = dictValue(definition.properties, "playerDisplayName",
      dictValue(definition.properties, "playerName", `Player ${index + 1}`));
    player.append(option);
  });
  state.selectedScriptPlayer = Math.min(state.selectedScriptPlayer, Math.max(0, definitions.length - 1));
  player.value = String(state.selectedScriptPlayer);
  player.disabled = !definitions.length;
  player.addEventListener("change", () => { state.selectedScriptPlayer = Number(player.value); });
  const add = createElement("button", "", "+ Script");
  add.type = "button";
  add.disabled = !definitions.length;
  add.addEventListener("click", () => {
    state.document.transaction("Add script", (document) => {
      state.selectedScript = document.addScript(state.selectedScriptPlayer, {
        name: `Script ${allScripts().length + 1}`,
      });
    });
    renderInspector();
  });
  const addGroup = createElement("button", "", "+ Group");
  addGroup.type = "button";
  addGroup.disabled = !definitions.length;
  addGroup.addEventListener("click", () => {
    state.document.transaction("Add script group", (document) =>
      document.addScriptGroup(state.selectedScriptPlayer, {
        name: `Group ${(document.sides.players[state.selectedScriptPlayer]?.groups.length || 0) + 1}`,
      }));
    renderInspector();
  });
  heading.append(player, add, addGroup);
  panel.append(heading);
  const scripts = allScripts();
  if (!scripts.length) {
    panel.append(createElement("p", "wb-empty-note", definitions.length
      ? "This map has no scripts yet. Add a script or group for one of its players."
      : "Add a player before authoring scripts. Imported native condition and action trees remain lossless."));
    return;
  }
  const list = createElement("div", "wb-script-list");
  for (const item of scripts) {
    const button = createElement("button", item.script === state.selectedScript ? "is-selected" : "");
    button.type = "button";
    button.append(createElement("b", "", item.script.active ? "▶" : "Ⅱ"),
      createElement("span", "", item.script.name),
      createElement("small", "", item.group || `Player ${item.player + 1}`));
    button.addEventListener("click", () => {
      state.selectedScript = item.script;
      renderInspector();
    });
    list.append(button);
  }
  panel.append(list);
  const script = state.selectedScript;
  if (!script) return;
  const form = createElement("section", "wb-selection-inspector");
  form.append(createElement("h3", "", "Script metadata"));
  form.append(labeledInput("Name", script.name, (value) => editScript(script, { name: value })));
  form.append(labeledInput("Comment", script.comment, (value) => editScript(script, { comment: value }), { multiline: true }));
  const delay = labeledInput("Evaluation delay", script.delay,
    (value) => editScript(script, { delay: Number(value) }), { type: "number" });
  form.append(delay);
  const flags = createElement("div", "wb-script-flags");
  for (const [key, label] of [
    ["active", "Active"], ["oneShot", "One shot"], ["easy", "Easy"],
    ["normal", "Normal"], ["hard", "Hard"], ["subroutine", "Subroutine"],
  ]) {
    const wrapper = createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = script[key];
    input.addEventListener("change", () => editScript(script, { [key]: input.checked }));
    wrapper.append(input, document.createTextNode(label));
    flags.append(wrapper);
  }
  form.append(flags);
  const native = createElement("p", "wb-native-note");
  const conditionCount = script.children.filter((child) => child.name === "OrCondition").length;
  const actionCount = script.children.filter((child) => /^ScriptAction/.test(child.name)).length;
  native.textContent = `${conditionCount} native condition tree${conditionCount === 1 ? "" : "s"} · ${actionCount} native action list${actionCount === 1 ? "" : "s"} preserved`;
  form.append(native);
  const appendNativeNode = (entry, depth = 0) => {
    if (!entry.native) return;
    const node = createElement("section", "wb-native-script-node");
    node.style.marginLeft = `${depth * 8}px`;
    if (entry.native.kind === "or") {
      node.append(createElement("strong", "", "OR condition group"));
      form.append(node);
      entry.native.children.forEach((child) => appendNativeNode(child, depth + 1));
      return;
    }
    const branch = entry.native.kind === "ScriptActionFalse" ? "False action"
      : entry.native.kind === "ScriptAction" ? "Action" : "Condition";
    node.append(createElement("strong", "", `${branch} type ${entry.native.type}`),
      createElement("small", "", entry.native.nameKey === null
        ? `native v${entry.chunk.version}`
        : `key 0x${entry.native.nameKey.toString(16)}`));
    entry.native.parameters.forEach((parameter, index) => {
      if (parameter.type === 16) {
        node.append(labeledInput(`Parameter ${index + 1} · coordinate`,
          parameter.coordinate.join(", "), (value) => {
            const coordinate = value.split(",").map(Number);
            if (coordinate.length !== 3 || coordinate.some((item) => !Number.isFinite(item))) return;
            state.document.transaction("Edit script coordinate", (document) =>
              document.updateScriptParameter(parameter, { coordinate }));
          }));
      } else {
        node.append(labeledInput(`Parameter ${index + 1} · text`, parameter.string, (value) =>
          state.document.transaction("Edit script parameter", (document) =>
            document.updateScriptParameter(parameter, { string: value }))));
        const row = createElement("div", "wb-field-row");
        row.append(labeledInput("Integer", parameter.integer, (value) =>
          state.document.transaction("Edit script parameter", (document) =>
            document.updateScriptParameter(parameter, { integer: value })), { type: "number" }),
        labeledInput("Real", parameter.real, (value) =>
          state.document.transaction("Edit script parameter", (document) =>
            document.updateScriptParameter(parameter, { real: value })), { type: "number", step: ".01" }));
        node.append(row);
      }
    });
    form.append(node);
  };
  for (const entry of script.native || []) appendNativeNode(entry);
  const remove = createElement("button", "danger", "Delete script");
  remove.type = "button";
  remove.addEventListener("click", () => {
    state.document.transaction("Delete script", (document) => document.removeScript(script));
    state.selectedScript = null;
    renderInspector();
  });
  form.append(remove);
  panel.append(form);
}

function dictValue(properties, key, fallback = "") {
  return properties?.find((item) => item.key === key)?.value ?? fallback;
}

function rgbHex(values) {
  return `#${values.map((value) =>
    Math.max(0, Math.min(255, Math.round(Number(value) * 255))).toString(16).padStart(2, "0")).join("")}`;
}

function hexRgb(value) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function renderSidesPanel(panel) {
  panel.replaceChildren();
  const sides = state.document.sides;
  if (!sides) {
    panel.append(createElement("p", "wb-error-note", "This map has no native SidesList chunk."));
    return;
  }

  const playerHeading = createElement("div", "wb-panel-heading");
  playerHeading.append(createElement("div", "", "Players"));
  const addPlayer = createElement("button", "", "+ Player");
  addPlayer.type = "button";
  addPlayer.addEventListener("click", () => {
    const number = sides.definitions.length + 1;
    state.document.transaction("Add player", (document) => document.addPlayer({
      name: `Plyr${number}`,
      displayName: `Player ${number}`,
      faction: state.catalog?.players[0]?.name || "FactionCivilian",
    }));
    state.selectedPlayer = sides.definitions.length - 1;
    renderInspector();
  });
  playerHeading.append(addPlayer);
  panel.append(playerHeading);

  const players = createElement("div", "wb-side-list");
  sides.definitions.forEach((player, index) => {
    const button = createElement("button", index === state.selectedPlayer ? "is-selected" : "");
    button.type = "button";
    button.append(createElement("b", "", dictValue(player.properties, "playerIsHuman", false) ? "H" : "AI"),
      createElement("span", "", dictValue(player.properties, "playerDisplayName",
        dictValue(player.properties, "playerName", "(Neutral)"))),
      createElement("small", "", dictValue(player.properties, "playerFaction", "")));
    button.addEventListener("click", () => {
      state.selectedPlayer = index;
      renderInspector();
    });
    players.append(button);
  });
  panel.append(players);

  const player = sides.definitions[state.selectedPlayer];
  if (player) {
    const editor = createElement("section", "wb-selection-inspector");
    editor.append(createElement("h3", "", "Player properties"));
    const edit = (label, key, type = 3, options = {}) =>
      labeledInput(label, dictValue(player.properties, key, type === 0 ? false : ""), (value) => {
        const parsed = type === 0 ? /^(1|true|yes|on)$/i.test(value) : value;
        state.document.transaction(`Change ${key}`, (document) =>
          document.setPlayerProperty(state.selectedPlayer, key, type, parsed));
        renderInspector();
      }, options);
    editor.append(edit("Internal name", "playerName"));
    editor.append(edit("Display name", "playerDisplayName", 4));
    const factionField = createElement("label", "wb-field");
    factionField.append(createElement("span", "", "Faction"));
    const faction = document.createElement("select");
    const currentFaction = dictValue(player.properties, "playerFaction", "FactionCivilian");
    const factionNames = new Set([
      currentFaction,
      ...(state.catalog?.players || []).map((item) => item.name),
    ]);
    for (const name of factionNames) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      faction.append(option);
    }
    faction.value = currentFaction;
    faction.addEventListener("change", () => {
      state.document.transaction("Change player faction", (document) =>
        document.setPlayerProperty(state.selectedPlayer, "playerFaction", 3, faction.value));
      renderInspector();
    });
    factionField.append(faction);
    editor.append(factionField);
    const human = createElement("label", "wb-check-field");
    const humanInput = document.createElement("input");
    humanInput.type = "checkbox";
    humanInput.checked = Boolean(dictValue(player.properties, "playerIsHuman", false));
    humanInput.addEventListener("change", () => {
      state.document.transaction("Change player control", (document) =>
        document.setPlayerProperty(state.selectedPlayer, "playerIsHuman", 0, humanInput.checked));
      renderInspector();
    });
    human.append(humanInput, document.createTextNode("Human-controlled"));
    editor.append(human, edit("Allies (space-separated internal names)", "playerAllies"),
      edit("Enemies (space-separated internal names)", "playerEnemies"));

    editor.append(createElement("h3", "", "Skirmish build list"));
    player.builds.forEach((build, buildIndex) => {
      const row = createElement("div", "wb-build-row");
      row.append(createElement("span", "", `${build.buildingName} · ${build.templateName}`));
      const remove = createElement("button", "danger", "×");
      remove.type = "button";
      remove.addEventListener("click", () => {
        state.document.transaction("Remove build-list item", (document) =>
          document.removeBuildListItem(state.selectedPlayer, buildIndex));
        renderInspector();
      });
      row.append(remove);
      editor.append(row);
    });
    const addBuild = createElement("button", "", `+ ${state.selectedCatalogObject || "selected object"} to build list`);
    addBuild.type = "button";
    addBuild.disabled = !state.selectedCatalogObject;
    addBuild.addEventListener("click", () => {
      state.document.transaction("Add build-list item", (document) =>
        document.addBuildListItem(state.selectedPlayer, {
          buildingName: `${state.selectedCatalogObject} ${player.builds.length + 1}`,
          templateName: state.selectedCatalogObject,
          x: document.worldWidth / 2,
          y: document.worldHeight / 2,
        }));
      renderInspector();
    });
    editor.append(addBuild);
    const removePlayer = createElement("button", "danger", "Delete player");
    removePlayer.type = "button";
    removePlayer.addEventListener("click", () => {
      state.document.transaction("Delete player", (document) =>
        document.removePlayer(state.selectedPlayer));
      state.selectedPlayer = Math.max(0, Math.min(state.selectedPlayer, sides.definitions.length - 1));
      renderInspector();
    });
    editor.append(removePlayer);
    panel.append(editor);
  }

  const teamHeading = createElement("div", "wb-panel-heading");
  teamHeading.append(createElement("div", "", "Teams"));
  const addTeam = createElement("button", "", "+ Team");
  addTeam.type = "button";
  addTeam.addEventListener("click", () => {
    const number = sides.teams.length + 1;
    const owner = dictValue(sides.definitions[state.selectedPlayer]?.properties, "playerName", "");
    state.document.transaction("Add team", (document) =>
      document.addTeam({ name: `team${number}`, owner }));
    state.selectedTeam = sides.teams.length - 1;
    renderInspector();
  });
  teamHeading.append(addTeam);
  panel.append(teamHeading);
  const teams = createElement("div", "wb-side-list");
  sides.teams.forEach((team, index) => {
    const button = createElement("button", index === state.selectedTeam ? "is-selected" : "");
    button.type = "button";
    button.append(createElement("b", "", "T"),
      createElement("span", "", dictValue(team, "teamName", `Team ${index + 1}`)),
      createElement("small", "", dictValue(team, "teamOwner", "")));
    button.addEventListener("click", () => {
      state.selectedTeam = index;
      renderInspector();
    });
    teams.append(button);
  });
  panel.append(teams);
  const team = sides.teams[state.selectedTeam];
  if (team) {
    const editor = createElement("section", "wb-selection-inspector");
    editor.append(createElement("h3", "", "Team properties"));
    for (const [label, key] of [["Name", "teamName"], ["Owner player", "teamOwner"]]) {
      editor.append(labeledInput(label, dictValue(team, key, ""), (value) => {
        state.document.transaction(`Change ${key}`, (document) =>
          document.setTeamProperty(state.selectedTeam, key, 3, value));
        renderInspector();
      }));
    }
    const removeTeam = createElement("button", "danger", "Delete team");
    removeTeam.type = "button";
    removeTeam.addEventListener("click", () => {
      state.document.transaction("Delete team", (document) => document.removeTeam(state.selectedTeam));
      state.selectedTeam = Math.max(0, Math.min(state.selectedTeam, sides.teams.length - 1));
      renderInspector();
    });
    editor.append(removeTeam);
    panel.append(editor);
  }
}

function renderMapPanel(panel) {
  panel.replaceChildren();
  const summary = state.document.summary();
  panel.append(createElement("h3", "", "Map settings"));
  panel.append(labeledInput("Name", state.document.name, (value) => {
    state.document.transaction("Rename map", (document) => { document.name = value; });
    renderInspector();
    requestRender();
  }));
  const facts = createElement("dl", "wb-map-facts");
  for (const [label, value] of [
    ["Playable", `${summary.playableWidth} × ${summary.playableHeight}`],
    ["Stored grid", `${summary.width} × ${summary.height}`],
    ["Border", summary.border],
    ["Objects", summary.objects],
    ["Waypoints", summary.waypoints],
    ["Areas", summary.polygons],
    ["Scripts", summary.scripts],
    ["Textures", summary.textures.length],
  ]) {
    const row = document.createElement("div");
    row.append(createElement("dt", "", label), createElement("dd", "", String(value)));
    facts.append(row);
  }
  panel.append(facts);
  if (state.document.lighting) {
    panel.append(createElement("h3", "", "Global lighting"));
    const timeField = createElement("label", "wb-field");
    timeField.append(createElement("span", "", "Active time of day"));
    const time = document.createElement("select");
    ["Morning", "Afternoon", "Evening", "Night"].forEach((label, index) => {
      const option = document.createElement("option");
      option.value = String(index + 1);
      option.textContent = label;
      time.append(option);
    });
    time.value = String(state.document.lighting.timeOfDay);
    time.addEventListener("change", () => {
      state.document.transaction("Change time of day", (document) =>
        document.setLightingTimeOfDay(Number(time.value)));
      renderInspector();
    });
    timeField.append(time);
    panel.append(timeField);
    const profile = state.document.lighting.times[Math.max(0, state.document.lighting.timeOfDay - 1)]
      || state.document.lighting.times[0];
    for (const [label, light] of [
      ["Terrain ambient", profile.terrain[0]],
      ["Object ambient", profile.objects[0]],
      ["Terrain diffuse", profile.terrain[0]],
      ["Object diffuse", profile.objects[0]],
    ]) {
      const field = createElement("label", "wb-field");
      field.append(createElement("span", "", label));
      const input = document.createElement("input");
      input.type = "color";
      const member = label.includes("ambient") ? "ambient" : "diffuse";
      input.value = rgbHex(light[member]);
      input.addEventListener("change", () => {
        state.document.transaction(`Change ${label.toLowerCase()}`, () => {
          light[member] = hexRgb(input.value);
          state.document.dirtyChunks.add("GlobalLighting");
        });
        requestRender();
      });
      field.append(input);
      panel.append(field);
    }
  }
  panel.append(createElement("h3", "", "World properties"));
  const properties = createElement("div", "wb-property-list");
  for (const item of state.document.world) {
    const row = createElement("label");
    row.append(createElement("span", "", item.key));
    const input = document.createElement("input");
    input.value = String(item.value);
    input.addEventListener("change", () => {
      state.document.transaction(`Change ${item.key}`, () => {
        item.value = item.type === 0 ? /^(1|true|yes)$/i.test(input.value)
          : item.type === 1 ? Number.parseInt(input.value, 10)
            : item.type === 2 ? Number(input.value) : input.value;
        state.document.dirtyChunks.add("WorldInfo");
      });
    });
    row.append(input);
    properties.append(row);
  }
  panel.append(properties);
  panel.append(createElement("h3", "", "Native chunks"));
  const chunks = createElement("div", "wb-chunk-list");
  for (const chunk of summary.chunks) {
    const row = createElement("div");
    row.append(createElement("span", "", chunk.name),
      createElement("small", "", `v${chunk.version} · ${formatBytes(chunk.bytes)}`));
    chunks.append(row);
  }
  panel.append(chunks);
}

function renderInspector() {
  const panel = root.querySelector(`[data-wb-panel="${state.activeTab}"]`);
  if (!panel) return;
  if (state.activeTab === "objects") renderObjectsPanel(panel);
  if (state.activeTab === "terrain") renderTerrainPanel(panel);
  if (state.activeTab === "areas") renderAreasPanel(panel);
  if (state.activeTab === "scripts") renderScriptsPanel(panel);
  if (state.activeTab === "sides") renderSidesPanel(panel);
  if (state.activeTab === "map") renderMapPanel(panel);
}

function setTool(tool) {
  state.tool = tool;
  if (!["area", "water"].includes(tool)) state.polygonDraft.length = 0;
  if (tool !== "road") state.roadDraft = null;
  if (tool === "terrain") selectTab("terrain");
  if (["object", "select", "erase", "waypoint", "start", "road", "scorch"].includes(tool)) selectTab("objects");
  if (["area", "water"].includes(tool)) selectTab("areas");
  setStatus(`${TOOL_SPECS.find(([id]) => id === tool)?.[2] || tool} tool`);
  requestRender();
}

function editObject(object, key, value) {
  if (!Number.isFinite(value)) return;
  state.document.transaction(`Change object ${key}`, () => {
    object[key] = value;
    if (key === "x" || key === "y") object.z = state.document.sampleWorldElevation(object.x, object.y);
    state.document.dirtyChunks.add("ObjectsList");
  });
  requestRender();
}

function editScript(script, patch) {
  state.document.transaction("Edit script metadata", (document) => document.updateScript(script, patch));
  renderInspector();
  requestRender();
}

function deleteObject(object) {
  state.document.transaction("Delete object", () => {
    state.document.objects = state.document.objects.filter((candidate) => candidate !== object);
    state.document.dirtyChunks.add("ObjectsList");
  });
  state.selectedObject = null;
  renderInspector();
  requestRender();
}

function closestObject(point) {
  let best = null;
  let distance = Infinity;
  for (const object of state.document.objects) {
    const candidate = Math.hypot(object.x - point.x, object.y - point.y);
    if (candidate < distance) {
      best = object;
      distance = candidate;
    }
  }
  return distance <= 24 / (lastView?.scale || 1) ? best : null;
}

function applyBrush(point) {
  const document = state.document;
  const center = terrainCell(point);
  const radius = state.brushRadius;
  const xMin = Math.max(0, center.x - radius);
  const xMax = Math.min(document.heightMap.width - 1, center.x + radius);
  const yMin = Math.max(0, center.y - radius);
  const yMax = Math.min(document.heightMap.height - 1, center.y + radius);
  const pending = [];
  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      const distance = Math.hypot(x - center.x, y - center.y);
      if (distance > radius) continue;
      const weight = Math.max(0.1, 1 - distance / Math.max(1, radius));
      const index = document.terrainIndex(x, y);
      if (state.tool === "raise") document.setElevation(x, y,
        document.heightMap.elevations[index] + state.brushStrength * weight);
      if (state.tool === "lower") document.setElevation(x, y,
        document.heightMap.elevations[index] - state.brushStrength * weight);
      if (state.tool === "flatten") document.setElevation(x, y,
        document.heightMap.elevations[index] * (1 - weight) + state.flattenHeight * weight);
      if (state.tool === "smooth") {
        let total = 0;
        let count = 0;
        for (let sy = Math.max(0, y - 1); sy <= Math.min(document.heightMap.height - 1, y + 1); sy += 1) {
          for (let sx = Math.max(0, x - 1); sx <= Math.min(document.heightMap.width - 1, x + 1); sx += 1) {
            total += document.heightMap.elevations[document.terrainIndex(sx, sy)];
            count += 1;
          }
        }
        pending.push([x, y, document.heightMap.elevations[index] * (1 - weight) + total / count * weight]);
      }
      if (state.tool === "terrain") document.setTerrain(x, y, state.selectedTerrain);
      if (state.tool === "block") document.setPassable(x, y, false);
      if (state.tool === "unblock") document.setPassable(x, y, true);
    }
  }
  for (const [x, y, value] of pending) document.setElevation(x, y, value);
}

function finishPolygon() {
  if (state.polygonDraft.length < 3) {
    setStatus("A polygon needs at least three points");
    return;
  }
  const isWater = state.tool === "water";
  const height = isWater
    ? state.document.sampleWorldElevation(state.polygonDraft[0].x, state.polygonDraft[0].y)
    : 0;
  state.document.transaction(`Add ${isWater ? "water" : "trigger"} area`, (document) => {
    state.selectedPolygon = document.addPolygon({
      name: `${isWater ? "Water" : "Area"} ${document.polygons.polygons.length + 1}`,
      isWater,
      points: state.polygonDraft.map((point) => ({ ...point, z: height })),
    });
  });
  state.polygonDraft = [];
  renderInspector();
  requestRender();
}

function handlePoint(point) {
  const document = state.document;
  if (["raise", "lower", "smooth", "flatten", "terrain", "block", "unblock"].includes(state.tool)) {
    applyBrush(point);
    return;
  }
  if (state.tool === "select") {
    state.selectedObject = closestObject(point);
    state.selectedPolygon = null;
    renderInspector();
    requestRender();
  } else if (state.tool === "erase") {
    const object = closestObject(point);
    if (object) deleteObject(object);
  } else if (state.tool === "object") {
    if (!state.selectedCatalogObject) {
      setStatus("Choose an installed object from the palette first");
      return;
    }
    document.addObject(state.selectedCatalogObject, point.x, point.y, DEFAULT_OBJECT_PROPERTIES);
  } else if (state.tool === "waypoint") {
    const name = `Waypoint ${document.waypoints().length + 1}`;
    state.selectedObject = document.addWaypoint(name, point.x, point.y);
  } else if (state.tool === "start") {
    const starts = document.waypoints().filter((waypoint) => /^Player_\d+_Start$/i.test(waypoint.name));
    state.selectedObject = document.addWaypoint(`Player_${starts.length + 1}_Start`, point.x, point.y);
  } else if (state.tool === "road") {
    if (!state.roadDraft) {
      state.roadDraft = point;
      setStatus("Click the road end point");
      return;
    }
    document.addObject(state.selectedRoad, state.roadDraft.x, state.roadDraft.y, {
      flags: 0x2,
      owner: "team",
      layer: "Roads",
    });
    document.addObject(state.selectedRoad, point.x, point.y, {
      flags: 0x4,
      owner: "team",
      layer: "Roads",
    });
    state.roadDraft = null;
  } else if (state.tool === "scorch") {
    state.selectedObject = document.addScorch(point.x, point.y, {
      type: state.scorchType,
      radius: state.scorchRadius,
    });
  } else if (["area", "water"].includes(state.tool)) {
    state.polygonDraft.push(point);
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  const point = worldPoint(event);
  state.pointer = point;
  state.dragging = true;
  const cell = terrainCell(point);
  state.flattenHeight = state.document.heightMap.elevations[state.document.terrainIndex(cell.x, cell.y)];
  const brushTool = ["raise", "lower", "smooth", "flatten", "terrain", "block", "unblock"].includes(state.tool);
  const immediateTool = ["object", "waypoint", "start", "scorch"].includes(state.tool)
    || (state.tool === "road" && state.roadDraft);
  if (brushTool || immediateTool) {
    state.document.transaction(`${state.tool} tool`, () => handlePoint(point));
  } else {
    handlePoint(point);
  }
  requestRender();
});

canvas.addEventListener("pointermove", (event) => {
  const point = worldPoint(event);
  state.pointer = point;
  const z = state.document.sampleWorldElevation(point.x, point.y);
  coordinatesNode.textContent = `X ${point.x.toFixed(1)} · Y ${point.y.toFixed(1)} · Z ${z.toFixed(1)}`;
  if (state.dragging && ["raise", "lower", "smooth", "flatten", "terrain", "block", "unblock"].includes(state.tool)) {
    applyBrush(point);
  }
  requestRender();
});

canvas.addEventListener("pointerup", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  state.dragging = false;
  renderInspector();
  requestRender();
});
canvas.addEventListener("pointercancel", () => { state.dragging = false; });
canvas.addEventListener("pointerleave", () => {
  if (!state.dragging) {
    state.pointer = null;
    coordinatesNode.textContent = "X — · Y — · Z —";
    requestRender();
  }
});
canvas.addEventListener("dblclick", (event) => {
  if (!["area", "water"].includes(state.tool)) return;
  event.preventDefault();
  if (state.polygonDraft.length > 1) state.polygonDraft.pop();
  finishPolygon();
});

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    requestRender();
  }
}
new ResizeObserver(resizeCanvas).observe(canvas);

function confirmDiscard() {
  return !state.document.dirty || window.confirm("Discard unsaved World Builder changes?");
}

function showNewDialog() {
  if (!confirmDiscard()) return;
  const terrainSelect = newDialog.querySelector('[name="terrain"]');
  terrainSelect.replaceChildren();
  const terrains = state.catalog?.terrains?.length
    ? state.catalog.terrains
    : [{ name: "SandMediumType5" }];
  for (const terrain of terrains) {
    const option = document.createElement("option");
    option.value = terrain.name;
    option.textContent = terrain.name;
    if (terrain.name === "SandMediumType5") option.selected = true;
    terrainSelect.append(option);
  }
  newDialog.showModal();
}

newDialog.addEventListener("close", () => {
  if (newDialog.returnValue !== "create") return;
  const data = new FormData(newDialog.querySelector("form"));
  try {
    const terrain = state.catalog?.terrains.find((item) => item.name === data.get("terrain"));
    state.document = MapDocument.create({
      name: data.get("name"),
      playableWidth: Number(data.get("width")),
      playableHeight: Number(data.get("height")),
      border: Number(data.get("border")),
      elevation: Number(data.get("elevation")),
      terrain: data.get("terrain"),
      terrainWidth: terrain?.cellWidth || 1,
    });
    state.currentPath = null;
    state.currentSave = null;
    state.sidecars = new Map();
    clearSelection();
    renderInspector();
    requestRender();
    setStatus("New map created");
  } catch (error) {
    toast("Could not create map", error.message, "warning");
  }
});

function clearSelection() {
  state.selectedObject = null;
  state.selectedPolygon = null;
  state.selectedScript = null;
  state.polygonDraft = [];
  state.roadDraft = null;
}

async function openLibrary() {
  const list = root.querySelector("[data-wb-library-list]");
  list.replaceChildren(createElement("p", "", "Loading maps…"));
  if (!libraryDialog.open) libraryDialog.showModal();
  try {
    const maps = await state.store.listMaps();
    list.replaceChildren();
    if (!maps.length) {
      list.append(createElement("p", "wb-empty-note", "No user maps are stored in this profile yet."));
      return;
    }
    for (const map of maps) {
      const row = createElement("article");
      const details = createElement("div");
      details.append(createElement("strong", "", map.name),
        createElement("span", "", `${formatBytes(map.bytes)} · ${new Date(map.modifiedAt).toLocaleString()}`));
      const open = createElement("button", "primary", "Open");
      open.type = "button";
      open.addEventListener("click", async () => {
        if (!confirmDiscard()) return;
        try {
          setStatus(`Opening ${map.name}…`);
          const mapPackage = await state.store.readMapPackage(map.path);
          state.document = await MapDocument.fromBytes(mapPackage.contents, { name: map.name });
          state.sidecars = mapPackage.sidecars;
          state.currentPath = map.path;
          state.currentSave = map;
          clearSelection();
          libraryDialog.close();
          renderInspector();
          requestRender();
          setStatus(`${map.name} opened`);
        } catch (error) {
          toast("Could not open map", error.message, "warning");
        }
      });
      const remove = createElement("button", "danger", "Delete");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete ${map.name} from this browser profile?`)) return;
        await state.store.deleteMap(map.path);
        await openLibrary();
      });
      row.append(details, open, remove);
      list.append(row);
    }
  } catch (error) {
    list.replaceChildren(createElement("p", "wb-error-note", error.message));
  }
}

async function save(name = state.document.name) {
  const issues = state.document.validate();
  if (issues.some((issue) => issue.severity === "error")) {
    toast("Map saved with validation errors", "Use Validate before playtesting.", "warning");
  }
  setStatus(`Saving ${name}…`);
  const contents = state.document.serialize({ preserveOriginal: false });
  const previewName = `${String(name).trim()}.tga`;
  state.sidecars.set(previewName, createTgaPreview());
  const record = await state.store.saveMap(name, contents, state.sidecars);
  state.document.name = record.name;
  state.document.markSaved();
  state.currentPath = record.path;
  state.currentSave = record;
  await state.store.clearAutosave().catch(() => {});
  state.lastAutosaveRevision = state.document.revision;
  setStatus(`${record.name} saved · ${formatBytes(record.bytes)}`);
  toast("Map saved", `${record.name} is ready in Zero Hour.`);
  requestRender();
  return record;
}

function createTgaPreview(size = 256) {
  const preview = document.createElement("canvas");
  preview.width = size;
  preview.height = size;
  const previewContext = preview.getContext("2d", { alpha: false });
  previewContext.fillStyle = "#17242a";
  previewContext.fillRect(0, 0, size, size);
  const ratio = Math.min(size / canvas.width, size / canvas.height);
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;
  previewContext.drawImage(canvas, (size - width) / 2, (size - height) / 2, width, height);
  const rgba = previewContext.getImageData(0, 0, size, size).data;
  const output = new Uint8Array(18 + size * size * 4);
  output[2] = 2;
  output[12] = size & 0xff;
  output[13] = size >> 8;
  output[14] = size & 0xff;
  output[15] = size >> 8;
  output[16] = 32;
  output[17] = 0x28;
  for (let source = 0, target = 18; source < rgba.length; source += 4, target += 4) {
    output[target] = rgba[source + 2];
    output[target + 1] = rgba[source + 1];
    output[target + 2] = rgba[source];
    output[target + 3] = 255;
  }
  return output;
}

function showSaveAs() {
  saveDialog.querySelector('[name="name"]').value = state.document.name;
  saveDialog.showModal();
}

saveDialog.addEventListener("close", () => {
  if (saveDialog.returnValue !== "save") return;
  const name = new FormData(saveDialog.querySelector("form")).get("name");
  void save(name).catch((error) => toast("Could not save map", error.message, "warning"));
});

function downloadMap() {
  const data = state.document.serialize({ preserveOriginal: false });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
  link.download = `${state.document.name}.map`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
  setStatus(`Exported ${formatBytes(data.byteLength)}`);
}

async function importMap(files) {
  const selected = [...(files || [])];
  const file = selected.find((candidate) => /\.map$/i.test(candidate.name));
  if (!file || !confirmDiscard()) {
    if (selected.length) throw new Error("Choose one .map file and any of its sidecars");
    return;
  }
  setStatus(`Importing ${file.name}…`);
  const name = file.name.replace(/\.map$/i, "") || "Imported Map";
  state.document = await MapDocument.fromBytes(await file.arrayBuffer(), { name });
  state.sidecars = new Map(await Promise.all(selected
    .filter((candidate) => candidate !== file)
    .map(async (candidate) => [candidate.name, new Uint8Array(await candidate.arrayBuffer())])));
  state.currentPath = null;
  state.currentSave = null;
  clearSelection();
  renderInspector();
  requestRender();
  setStatus(`${file.name} imported losslessly`);
}

function validateMap() {
  const results = root.querySelector("[data-wb-validation-results]");
  const issues = state.document.validate();
  results.replaceChildren();
  if (!issues.length) {
    results.append(createElement("div", "wb-validation-ok", "✓ Map is ready for a Zero Hour playtest."));
  } else {
    for (const issue of issues) {
      const row = createElement("div", `wb-validation-${issue.severity}`);
      row.append(createElement("b", "", issue.severity === "error" ? "!" : "⚠"),
        createElement("span", "", issue.message));
      results.append(row);
    }
  }
  validationDialog.showModal();
  return issues;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForWindow(name, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  let nextShellWake = 0;
  let shellWakeCoordinate = 32;
  while (Date.now() < deadline) {
    const reply = await window.CnCPort.rpc("agentUiSnapshot", {});
    const candidate = reply?.result?.windows?.find((item) =>
      item.name === name && item.visible && item.interactive);
    if (candidate) return candidate;
    if (name === "MainMenu.wnd:ButtonSinglePlayer" && Date.now() >= nextShellWake) {
      const point = { x: shellWakeCoordinate, y: shellWakeCoordinate };
      shellWakeCoordinate = shellWakeCoordinate === 32 ? 96 : 32;
      nextShellWake = Date.now() + 1_000;
      await window.CnCPort.rpc("postMessage", {
        message: 0x0200,
        wParam: 0,
        lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
        point,
      });
    }
    await sleep(250);
  }
  throw new Error(`Zero Hour did not expose ${name}`);
}

async function activateUntilWindow(actionName, expectedName, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  let lastAttempt = 0;
  while (Date.now() < deadline) {
    const reply = await window.CnCPort.rpc("agentUiSnapshot", {});
    const windows = reply?.result?.windows || [];
    const expected = windows.find((item) =>
      item.name === expectedName && item.visible && item.interactive);
    if (expected) return expected;
    const action = windows.find((item) =>
      item.name === actionName && item.visible && item.interactive);
    if (action && Date.now() - lastAttempt >= 1_000) {
      lastAttempt = Date.now();
      await window.CnCPort.rpc("agentUiActivate", {
        windowId: action.id,
        name: action.name,
      });
    }
    await sleep(250);
  }
  throw new Error(`Zero Hour did not open ${expectedName}`);
}

async function playtest() {
  const issues = state.document.validate();
  if (issues.some((issue) => issue.severity === "error")) {
    validateMap();
    throw new Error("Fix validation errors before playtesting");
  }
  const record = await save(state.document.name);
  setStatus("Starting the original Zero Hour engine…");
  await window.ZeroHRuntime.launch();
  await waitForWindow("MainMenu.wnd:ButtonSinglePlayer");
  await activateUntilWindow(
    "MainMenu.wnd:ButtonSinglePlayer",
    "MainMenu.wnd:ButtonSkirmish",
  );
  await activateUntilWindow(
    "MainMenu.wnd:ButtonSkirmish",
    "SkirmishGameOptionsMenu.wnd:ButtonStart",
  );
  const refreshed = await window.CnCPort.rpc("mapCacheRefresh", {});
  if (!refreshed?.ok || !refreshed?.result?.ok) {
    throw new Error(refreshed?.result?.error || "Zero Hour could not refresh its user-map cache");
  }
  const cache = await window.CnCPort.rpc("mapCacheProbe", {});
  const maps = cache?.probe?.userMultiplayerMaps || [];
  const expected = record.path.replaceAll("/", "\\").toLowerCase();
  const map = maps.find((candidate) =>
    candidate.key.toLowerCase() === expected
      || candidate.key.toLowerCase().endsWith(`\\${record.name.toLowerCase()}\\${record.name.toLowerCase()}.map`));
  if (!map) throw new Error(`Zero Hour did not discover ${record.name} in its user-map cache`);
  const applied = await window.CnCPort.rpc("realEngineSetSkirmishMap", { map: map.key });
  if (!applied?.ok || !applied?.result?.applied) {
    throw new Error(applied?.result?.error || "Zero Hour rejected the map");
  }
  setStatus(`${record.name} selected in the original skirmish menu`);
  toast("World Builder playtest", "Map loaded in Zero Hour. Choose armies and press Start.");
  return { record, map, applied: applied.result };
}

async function handleAction(action) {
  if (action === "new") showNewDialog();
  if (action === "open") await openLibrary();
  if (action === "import") importInput.click();
  if (action === "save") {
    if (state.currentPath) await save(state.document.name);
    else showSaveAs();
  }
  if (action === "save-as") showSaveAs();
  if (action === "export") downloadMap();
  if (action === "undo" && state.document.undo()) {
    clearSelection();
    renderInspector();
    requestRender();
  }
  if (action === "redo" && state.document.redo()) {
    clearSelection();
    renderInspector();
    requestRender();
  }
  if (action === "validate") validateMap();
  if (action === "playtest") await playtest();
  if (action === "restore-autosave" && autosaveRecord) {
    state.document = await MapDocument.fromBytes(autosaveRecord.contents, { name: autosaveRecord.name });
    state.document.revision = 1;
    state.document.cleanRevision = 0;
    state.currentPath = null;
    root.querySelector("[data-wb-autosave-banner]").hidden = true;
    clearSelection();
    renderInspector();
    requestRender();
    setStatus(`Restored autosave from ${new Date(autosaveRecord.modifiedAt).toLocaleString()}`);
  }
  if (action === "dismiss-autosave") {
    root.querySelector("[data-wb-autosave-banner]").hidden = true;
    await state.store.clearAutosave();
  }
}

root.querySelectorAll("[data-wb-action]").forEach((button) => {
  button.addEventListener("click", () => void handleAction(button.dataset.wbAction)
    .catch((error) => toast("World Builder", error.message, "warning")));
});
root.querySelectorAll("[data-wb-tool]").forEach((button) =>
  button.addEventListener("click", () => setTool(button.dataset.wbTool)));
root.querySelectorAll("[data-wb-tab]").forEach((button) =>
  button.addEventListener("click", () => selectTab(button.dataset.wbTab)));
importInput.addEventListener("change", () => {
  void importMap(importInput.files)
    .catch((error) => toast("Could not import map", error.message, "warning"))
    .finally(() => { importInput.value = ""; });
});

root.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey) {
    const action = { s: "save", z: event.shiftKey ? "redo" : "undo", y: "redo", n: "new", o: "open" }[event.key.toLowerCase()];
    if (action) {
      event.preventDefault();
      void handleAction(action).catch((error) => toast("World Builder", error.message, "warning"));
    }
  } else if (event.key === "Enter" && ["area", "water"].includes(state.tool)) {
    finishPolygon();
  } else if (event.key === "Delete" && state.selectedObject) {
    deleteObject(state.selectedObject);
  } else if (event.key === "Escape") {
    state.polygonDraft = [];
    state.roadDraft = null;
    requestRender();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.document.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

async function loadCatalog() {
  try {
    state.catalog = await loadWorldBuilderCatalog({
      onProgress: (message) => setStatus(message),
    });
    state.selectedCatalogObject ||= state.catalog.objects[0]?.name || "";
    state.selectedRoad = state.catalog.roads[0]?.name || "GravelRoad";
    setStatus(`Loaded ${state.catalog.objects.length} objects and ${state.catalog.terrains.length} terrains`);
  } catch (error) {
    state.catalogError = error.message;
    setStatus("Install original game files to populate the World Builder palette");
  }
  renderInspector();
}

async function checkAutosave() {
  try {
    autosaveRecord = await state.store.readAutosave();
    if (autosaveRecord) root.querySelector("[data-wb-autosave-banner]").hidden = false;
  } catch {
    // Autosave is optional when private browsing disables IndexedDB.
  }
}

setInterval(() => {
  if (!state.document.dirty || state.lastAutosaveRevision === state.document.revision) return;
  const contents = state.document.serialize({ preserveOriginal: false });
  void state.store.saveAutosave(state.document.name, contents, state.document.summary())
    .then(() => {
      state.lastAutosaveRevision = state.document.revision;
      setStatus(`Autosaved ${new Date().toLocaleTimeString()}`);
    })
    .catch(() => {});
}, 15_000);

selectTab("objects");
setTool("select");
resizeCanvas();
void loadCatalog();
void checkAutosave();

window.ZeroHWorldBuilder = Object.freeze({
  newDocument(options) {
    state.document = MapDocument.create(options);
    state.currentPath = null;
    state.sidecars = new Map();
    clearSelection();
    renderInspector();
    requestRender();
    return state.document.summary();
  },
  async importBytes(value, options) {
    state.document = await MapDocument.fromBytes(value, options);
    state.currentPath = null;
    state.sidecars = new Map();
    clearSelection();
    renderInspector();
    requestRender();
    return state.document.summary();
  },
  async save(name) {
    return save(name || state.document.name);
  },
  async playtest() {
    return playtest();
  },
  selectTool: setTool,
  snapshot() {
    return {
      ...state.document.summary(),
      tool: state.tool,
      selectedObject: state.selectedObject?.type || null,
      currentPath: state.currentPath,
      sidecars: state.sidecars.size,
      catalog: state.catalog ? {
        objects: state.catalog.objects.length,
        terrains: state.catalog.terrains.length,
        roads: state.catalog.roads.length,
        context: state.catalog.context.label,
      } : null,
    };
  },
  get document() {
    return state.document;
  },
});
