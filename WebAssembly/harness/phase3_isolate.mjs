// Temporary debug driver: phase-3 (real-init archive mount) in isolation.
// Usage: node harness/phase3_isolate.mjs [--step N]
// Steps: 1=mount only (no probes, no inventory), 2=+aggregate probe,
//        3=+audio inventory (full mountArchives), 4=+realEngineInit.
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";
import { stat } from "node:fs/promises";
import { resolve, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const wasmRoot = process.env.CNC_WASM_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
const archiveRoot = resolve(wasmRoot, "artifacts/real-assets");
const step = Number(process.argv[process.argv.indexOf("--step") + 1] || 4);

// keep in sync with startup_vertical_smoke.mjs realInitArchiveSpecs
const specs = [
  { name: "INI.big" }, { name: "INIZH.big" }, { name: "English.big" },
  { name: "EnglishZH.big" }, { name: "Window.big" }, { name: "WindowZH.big" },
  { name: "Terrain.big" }, { name: "TerrainZH.big" }, { name: "Textures.big" },
  { name: "TexturesZH.big" }, { name: "W3D.big" }, { name: "W3DZH.big" },
  { name: "W3DEnglishZH.big" }, { name: "MapsZH.big" }, { name: "Music.big", sourceName: "base-generals/Music.big" },
  { name: "MusicZH.big" }, { name: "AudioZH.big" }, { name: "AudioEnglishZH.big" }, { name: "SpeechZH.big" },
  { name: "SpeechEnglishZH.big" },
];

const server = await startStaticServer({ root: wasmRoot });
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("crash", () => console.error("[isolate] PAGE CRASHED"));
page.on("console", (msg) => {
  const t = msg.text();
  if (!t.includes("[wasm-harness]")) console.error("[isolate:console]", t.slice(0, 200));
});
page.on("pageerror", (e) => console.error("[isolate:pageerror]", String(e).slice(0, 200)));
await page.goto(new URL("harness/index.html", server.url).href, { waitUntil: "networkidle" });
await page.waitForFunction(() => Boolean(window.CnCPort?.rpc), null, { timeout: 180000 });
console.error("[isolate] booted, mounting step", step);

const archives = [];
for (const spec of specs) {
  const sourceName = spec.sourceName ?? spec.name;
  const path = resolve(archiveRoot, sourceName);
  const fileStat = await stat(path);
  archives.push({
    name: spec.name, sourceName,
    url: new URL(relative(wasmRoot, path).split(sep).join("/"), server.url).href,
    expectedBytes: fileStat.size,
  });
}

try {
  if (step === 1) {
    // raw per-archive fetch+write, nothing else
    for (const a of archives) {
      const r = await page.evaluate((one) =>
        window.CnCPort.rpc("mountArchives", { path: "/assets/real-init", verifyEach: false, archives: [one] }), a);
      console.error("[isolate] mounted", a.name, "ok:", r.ok, "err:", (r.error ?? "").slice(0, 120));
    }
  } else {
    const result = await page.evaluate((payload) =>
      window.CnCPort.rpc("mountArchives", payload), {
      path: "/assets/real-init", verifyEach: false, archives,
    });
    console.error("[isolate] mount ok:", result.ok, "count:", result.archiveSet?.archiveCount, "err:", result.error);
    if (step >= 4 && result.ok) {
      const init = await page.evaluate(() => window.CnCPort.rpc("realEngineInit", {
        runDirectory: "/assets/real-init",
      }));
      console.error("[isolate] realEngineInit:", JSON.stringify(init).slice(0, 400));
    }
  }
} catch (err) {
  console.error("[isolate] FAILED:", String(err).slice(0, 300));
}
await browser.close();
await server.close();
