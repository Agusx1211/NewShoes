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
      const result = await rpc("realEngineFrame", { frames: 1 });
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
