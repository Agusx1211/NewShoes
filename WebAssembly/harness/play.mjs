// Human-driveable boot for the real cnc-port engine: replays the same RPC
// sequence the startup-vertical harness uses (mount whole-file archive set ->
// realEngineInit -> realEngineFrame loop). Mouse/keyboard/touch input already
// flows through bridge.js canvas listeners into the engine's Win32 queue.

const archiveSpecs = [
  { name: "INIZH.big" },
  { name: "EnglishZH.big" },
  { name: "WindowZH.big" },
  { name: "MapsZH.big" },
  { name: "MusicZH.big" },
  { name: "GensecZH.big" },
  { name: "TerrainZH.big" },
  { name: "TexturesZH.big" },
  { name: "W3DZH.big" },
  { name: "W3DEnglishZH.big" },
  { name: "SpeechZH.big" },
  { name: "AudioZH.big" },
  { name: "ShadersZH.big" },
  { name: "ZZBase_INI.big", sourceName: "INI.big" },
  { name: "ZZBase_English.big", sourceName: "English.big" },
  { name: "ZZBase_Window.big", sourceName: "Window.big" },
  { name: "ZZBase_Terrain.big", sourceName: "Terrain.big" },
  { name: "ZZBase_Textures.big", sourceName: "Textures.big" },
  { name: "ZZBase_W3D.big", sourceName: "W3D.big" },
  { name: "ZZBase_Music.big", sourceName: "base-generals/Music.big" },
  { name: "Gensec.big" },
];

const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start");
const progressNode = document.querySelector("#progress");
const fpsNode = document.querySelector("#fps");

function report(message) {
  progressNode.textContent = message;
}

function fail(message, detail) {
  console.error("[play]", message, detail ?? "");
  report(`FAILED: ${message}`);
  startButton.disabled = false;
}

async function waitForRpc() {
  for (let i = 0; i < 600; i += 1) {
    if (window.CnCPort?.rpc) {
      return window.CnCPort.rpc.bind(window.CnCPort);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("bridge RPC surface never appeared");
}

function buildArchives() {
  return archiveSpecs.map((spec) => {
    const sourceName = spec.sourceName ?? spec.name;
    return {
      name: spec.name,
      sourceName,
      url: new URL(`../artifacts/real-assets/${sourceName}`, window.location.href).href,
    };
  });
}

async function runFrameLoop(rpc) {
  let lastStamp = performance.now();
  let smoothedFps = 0;
  let running = true;

  const step = async () => {
    if (!running) {
      return;
    }
    try {
      // Minimal per-rAF stepping: verification harnesses use the richer frame
      // summary, but the human page only needs success/failure and frame time.
      const result = await rpc("realEngineFrameTick", { frames: 1 });
      if (result?.ok !== true) {
        running = false;
        fail("engine frame failed", result);
        return;
      }
    } catch (error) {
      running = false;
      fail("engine frame threw", error);
      return;
    }
    const now = performance.now();
    const instant = 1000 / Math.max(1, now - lastStamp);
    lastStamp = now;
    smoothedFps = smoothedFps === 0 ? instant : smoothedFps * 0.9 + instant * 0.1;
    fpsNode.textContent = smoothedFps.toFixed(1);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function start() {
  startButton.disabled = true;
  try {
    report("waiting for wasm bridge...");
    const rpc = await waitForRpc();

    // The human-playable page runs graphics diagnostics in "lite" mode: skip the
    // per-draw readPixels GPU syncs / probe objects / draw-history that the
    // regression harness needs but the player does not. Add ?diag=full to
    // restore full diagnostics for debugging.
    const diagParam = new URLSearchParams(window.location.search).get("diag");
    if (diagParam !== "full" && typeof window.__cncSetDiagLevel === "function") {
      window.__cncSetDiagLevel("lite");
    }

    report("downloading + mounting 21 archives (~1.3 GB, be patient)...");
    const mount = await rpc("mountArchives", {
      path: "/assets/real-init",
      verifyEach: false,
      archives: buildArchives(),
    });
    if (mount?.archiveSet?.archiveCount !== archiveSpecs.length) {
      fail("archive mount failed", mount?.error ?? mount?.archiveSet);
      return;
    }

    // The original ShellMapMD 3D menu background (the naval scene) renders
    // through the real lifecycle since fd3cea3 — default on; ?shellmap=0
    // opts out (faster boot, static backdrop).
    const shellMap = new URLSearchParams(window.location.search).get("shellmap") !== "0";
    report(`running real GameEngine::init() (~10-30s, shell map ${shellMap ? "on" : "off"})...`);
    const init = await rpc("realEngineInit", { runDirectory: "/assets/real-init", shellMap });
    if (init?.ok !== true || init?.frontier?.initReturned !== true) {
      fail("real engine init failed", init);
      return;
    }

    // The original menu waits for mouse movement before finishing its
    // first-run reveal transition; post two synthetic moves so the buttons
    // appear without the player having to wiggle the cursor first.
    for (const point of [{ x: 32, y: 32 }, { x: 96, y: 96 }]) {
      await rpc("postMessage", {
        message: 0x0200,
        lParam: ((point.y & 0xffff) << 16) | (point.x & 0xffff),
        point,
      });
      await rpc("realEngineFrame", { frames: 2 });
    }

    report("");
    overlay.classList.add("hidden");
    document.querySelector("#viewport").focus();
    await runFrameLoop(rpc);
  } catch (error) {
    fail(error?.message ?? String(error), error);
  }
}

startButton.addEventListener("click", () => {
  void start();
});

if (new URLSearchParams(window.location.search).get("autostart") === "1") {
  void start();
}

// --- "Build: N min ago" indicator -------------------------------------------
// Polls both wasm and bridge.js Last-Modified values via HEAD so a glance
// tells whether Codex shipped something new since this page loaded.
const buildAgeNode = document.querySelector("#buildAge");
let firstSeenBuildMs = null;

function relativeAge(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) {
    return `${s}s ago`;
  }
  if (s < 3600) {
    return `${Math.round(s / 60)} min ago`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  return `${Math.round(s / 86400)}d ago`;
}

async function headLastModifiedMs(url) {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    const lastModified = head.headers.get("last-modified");
    return lastModified ? Date.parse(lastModified) : null;
  } catch {
    return null;
  }
}

async function refreshBuildAge() {
  try {
    const [wasmBuiltMs, bridgeBuiltMs] = await Promise.all([
      headLastModifiedMs(new URL("../dist/cnc-port.wasm", window.location.href)),
      headLastModifiedMs(new URL("./bridge.js", window.location.href)),
    ]);
    const builtMs = Math.max(wasmBuiltMs ?? 0, bridgeBuiltMs ?? 0);
    if (builtMs === 0) {
      buildAgeNode.textContent = "?";
      return;
    }
    if (firstSeenBuildMs === null) {
      firstSeenBuildMs = builtMs;
    }
    buildAgeNode.title = new Date(builtMs).toLocaleString();
    if (builtMs > firstSeenBuildMs) {
      buildAgeNode.textContent = `${relativeAge(Date.now() - builtMs)} — NEW, reload`;
      buildAgeNode.classList.add("fresh");
    } else {
      buildAgeNode.textContent = relativeAge(Date.now() - builtMs);
    }
  } catch {
    buildAgeNode.textContent = "?";
  }
}
void refreshBuildAge();
setInterval(refreshBuildAge, 30_000);

// --- built-in console --------------------------------------------------------
// Renders the tail of the live harness log (window.CnCPort.state.logs, which
// includes wasm stdout lines like "cnc-port: ...") in an overlay panel.
const consolePanel = document.querySelector("#consolePanel");
const consoleToggle = document.querySelector("#consoleToggle");
let consoleTimer = null;

function formatLogEntry(entry) {
  const time = typeof entry.time === "string" ? entry.time.slice(11, 19) : "";
  let data = "";
  if (entry.data != null) {
    if (typeof entry.data.text === "string") {
      data = ` ${entry.data.text}`;
    } else {
      try {
        data = ` ${JSON.stringify(entry.data)}`;
        if (data.length > 240) {
          data = `${data.slice(0, 240)}…`;
        }
      } catch {
        data = "";
      }
    }
  }
  return `${time} ${entry.message}${data}`;
}

function renderConsole() {
  const logs = window.CnCPort?.state?.logs ?? [];
  const tail = logs.slice(-250);
  const atBottom = consolePanel.scrollHeight - consolePanel.scrollTop - consolePanel.clientHeight < 24;
  consolePanel.textContent = tail.map(formatLogEntry).join("\n") || "(no log entries yet)";
  if (atBottom) {
    consolePanel.scrollTop = consolePanel.scrollHeight;
  }
}

function toggleConsole() {
  const show = consolePanel.classList.contains("hidden");
  consolePanel.classList.toggle("hidden", !show);
  if (show) {
    renderConsole();
    consolePanel.scrollTop = consolePanel.scrollHeight;
    consoleTimer = setInterval(renderConsole, 1000);
  } else if (consoleTimer) {
    clearInterval(consoleTimer);
    consoleTimer = null;
  }
}

consoleToggle.addEventListener("click", toggleConsole);
window.addEventListener("keydown", (event) => {
  if (event.key === "`" && !event.repeat) {
    toggleConsole();
  }
});
