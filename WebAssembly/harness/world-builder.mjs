import createWorldBuilderModule from "../dist-world-builder/world-builder.js";
import { assetLibrary } from "./launcher-asset-manager.mjs";

const statusElement = document.querySelector("[data-world-builder-status]");
const renderCanvas = document.querySelector("#worldBuilderRenderCanvas");
const USER_DATA_DIRECTORY =
  "/home/web_user/Command and Conquer Generals Zero Hour Data";
const ENGINE_DIRECTORY = "/assets/world-builder";
const SYSTEM_MAP_DIRECTORY = `${ENGINE_DIRECTORY}/Maps`;

function report(message) {
  if (statusElement) statusElement.textContent = message;
}

function ensureDirectory(fs, path) {
  let current = "";
  for (const component of String(path).split("/").filter(Boolean)) {
    current += `/${component}`;
    try {
      fs.mkdir(current);
    } catch (error) {
      if (error?.errno !== 20) throw error;
    }
  }
}

function syncFilesystem(fs, populate) {
  return new Promise((resolve, reject) => {
    fs.syncfs(populate, (error) => error ? reject(error) : resolve());
  });
}

async function mountUserData(module) {
  const fs = module.FS;
  ensureDirectory(fs, USER_DATA_DIRECTORY);
  ensureDirectory(fs, SYSTEM_MAP_DIRECTORY);
  if (fs.filesystems?.IDBFS) {
    fs.mount(fs.filesystems.IDBFS, {}, USER_DATA_DIRECTORY);
    fs.mount(fs.filesystems.IDBFS, {}, SYSTEM_MAP_DIRECTORY);
    await syncFilesystem(fs, true);
  }
  ensureDirectory(fs, `${USER_DATA_DIRECTORY}/Maps`);
  module.worldBuilderUserDataPath = `${USER_DATA_DIRECTORY}/Maps`;
  module.worldBuilderPersistentPaths = [
    USER_DATA_DIRECTORY,
    SYSTEM_MAP_DIRECTORY,
  ];
}

const heldLibraryLocks = [];
let worldBuilderPresentationPort = null;
let worldBuilderPlatformActionFrame = 0;

function pollWorldBuilderPlatformActions(module) {
  module._BrowserWorldBuilderPollPlatformActions();
  worldBuilderPlatformActionFrame = requestAnimationFrame(
    () => pollWorldBuilderPlatformActions(module),
  );
}

async function holdInstalledLibraryLocks(archives) {
  if (!navigator.locks?.request) return;
  const installNames = new Set(archives.map(({ opfsPath }) =>
    String(opfsPath).split("/").filter(Boolean).slice(0, 2).join("/")));
  for (const installName of installNames) {
    if (!installName.startsWith("cnc-library/")) continue;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    heldLibraryLocks.push(release);
    await new Promise((resolve, reject) => {
      navigator.locks.request(
        `cnc-port-opfs-install:${installName.split("/")[1]}`,
        { mode: "shared" },
        (lock) => {
          if (!lock) throw new Error("The installed Zero Hour library is busy");
          resolve();
          return held;
        },
      ).catch(reject);
    });
  }
}

async function stageInstalledArchives(module) {
  report("Checking the installed Zero Hour game library…");
  const archives = await assetLibrary.archivesForLaunch((progress) => {
    if (progress?.detail) report(progress.detail);
  });
  await holdInstalledLibraryLocks(archives);

  ensureDirectory(module.FS, ENGINE_DIRECTORY);
  const map = {};
  for (const archive of archives) {
    const name = String(archive.name ?? "");
    if (!/^[A-Za-z0-9._ -]+\.big$/i.test(name) || !archive.opfsPath) {
      throw new Error(`Invalid installed archive record: ${name || "(unnamed)"}`);
    }
    const enginePath = `${ENGINE_DIRECTORY}/${name}`;
    module.FS.writeFile(enginePath, new Uint8Array(0));
    map[enginePath] = archive.opfsPath;
  }

  const registered = module.ccall(
    "cnc_port_opfs_register_prefix",
    "number",
    ["string"],
    [`${ENGINE_DIRECTORY}/`],
  );
  if (!(registered >= 1)) {
    throw new Error("World Builder could not register its installed game library");
  }
  module.FS.chdir(ENGINE_DIRECTORY);
  return { archives, map };
}

function waitForRealmMessage(target, predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.removeEventListener("message", onMessage);
      reject(new Error(`World Builder worker timed out waiting for ${label}`));
    }, timeoutMs);
    const onMessage = (event) => {
      const message = event?.data?.__cncRealm;
      if (!predicate(message)) return;
      clearTimeout(timer);
      target.removeEventListener("message", onMessage);
      resolve(message);
    };
    target.addEventListener("message", onMessage);
  });
}

async function prepareWorldBuilderWorker(module, opfsMap) {
  const worker = module.PThread?.unusedWorkers?.[0];
  if (!worker) {
    throw new Error("World Builder could not reserve its engine worker");
  }

  const realm = new MessageChannel();
  realm.port1.start();
  const connected = waitForRealmMessage(
    realm.port1,
    (message) => message?.cmd === "connected",
    10000,
    "worker command channel",
  );
  worker.postMessage({
    target: "setimmediate",
    __cncRealm: { cmd: "connect" },
  }, [realm.port2]);
  await connected;

  const pong = waitForRealmMessage(
    realm.port1,
    (message) => message?.cmd === "pong",
    10000,
    "worker readiness",
  );
  realm.port1.postMessage({
    __cncRealm: { cmd: "ping" },
  });
  await pong;

  if (typeof OffscreenCanvas !== "function" || typeof MessageChannel !== "function") {
    throw new Error("World Builder requires worker canvas presentation support");
  }
  const offscreen = new OffscreenCanvas(renderCanvas.width, renderCanvas.height);
  const bitmapContext = renderCanvas.getContext("bitmaprenderer");
  const fallbackContext = bitmapContext ? null : renderCanvas.getContext("2d");
  if (!bitmapContext && !fallbackContext) {
    throw new Error("World Builder could not create its visible map surface");
  }
  const presentationStats = {
    receivedFrames: 0,
    lastWidth: 0,
    lastHeight: 0,
    context: bitmapContext ? "bitmaprenderer" : "2d",
  };
  globalThis.worldBuilderPresentationStats = presentationStats;
  realm.port1.addEventListener("message", (event) => {
    const frame = event.data?.__cncRealm;
    if (frame?.cmd !== "worldBuilderFrame") return;
    const bitmap = frame?.bitmap;
    if (!(bitmap instanceof ImageBitmap)) return;
    if (frame.diagnostics) {
      globalThis.worldBuilderLastGraphicsDiagnostics = frame.diagnostics;
    }
    presentationStats.receivedFrames += 1;
    presentationStats.lastWidth = bitmap.width;
    presentationStats.lastHeight = bitmap.height;
    if (renderCanvas.width !== bitmap.width ||
        renderCanvas.height !== bitmap.height) {
      renderCanvas.width = bitmap.width;
      renderCanvas.height = bitmap.height;
    }
    try {
      if (bitmapContext) {
        bitmapContext.transferFromImageBitmap(bitmap);
      } else {
        fallbackContext.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
        fallbackContext.drawImage(bitmap, 0, 0);
        bitmap.close();
      }
    } finally {
      module._BrowserWorldBuilderReleaseFramePresentationPermit?.();
    }
    if (presentationStats.receivedFrames === 1) {
      console.debug("[world-builder] presented first engine frame", {
        width: presentationStats.lastWidth,
        height: presentationStats.lastHeight,
        context: presentationStats.context,
      });
    }
  });
  worldBuilderPresentationPort = realm.port1;

  const setupDone = waitForRealmMessage(
    realm.port1,
    (message) => message?.cmd === "setupDone",
    120000,
    "graphics and game-library setup",
  );
  realm.port1.postMessage({
    __cncRealm: {
      cmd: "setup",
      moduleUrl: new URL("./world_builder_realm_boot.mjs", import.meta.url).href,
      canvas: offscreen,
      options: {
        opfsMap,
        captureGraphicsDiagnostics:
          new URLSearchParams(globalThis.location.search).has("graphicsDiagnostics"),
      },
    },
  }, [offscreen]);
  const setup = await setupDone;
  if (setup.ok !== true) {
    throw new Error(setup.error || "World Builder worker setup failed");
  }
}

async function boot() {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer !== "function") {
    throw new Error(
      "World Builder requires a cross-origin-isolated browser page with worker support",
    );
  }
  report("Loading the original World Builder executable…");
  const module = await createWorldBuilderModule({
    canvas: renderCanvas,
    locateFile(path) {
      return new URL(`../dist-world-builder/${path}`, import.meta.url).href;
    },
    print(message) {
      console.log(`[world-builder] ${message}`);
    },
    printErr(message) {
      console.error(`[world-builder] ${message}`);
    },
  });

  await mountUserData(module);
  const { archives, map } = await stageInstalledArchives(module);
  report(`Mounting ${archives.length} original Zero Hour archives…`);
  await prepareWorldBuilderWorker(module, map);

  report("Starting the original World Builder application…");
  const result = module._BrowserWorldBuilderStart();
  if (result !== 0) {
    throw new Error(`World Builder worker start failed (${result})`);
  }
  worldBuilderPlatformActionFrame = requestAnimationFrame(
    () => pollWorldBuilderPlatformActions(module),
  );

  globalThis.worldBuilderModule = module;
}

globalThis.addEventListener("pagehide", () => {
  cancelAnimationFrame(worldBuilderPlatformActionFrame);
  worldBuilderPlatformActionFrame = 0;
  for (const release of heldLibraryLocks.splice(0)) release();
  worldBuilderPresentationPort?.close();
  worldBuilderPresentationPort = null;
});

boot().catch((error) => {
  console.error(error);
  document.documentElement.dataset.worldBuilderReady = "false";
  report(`World Builder could not start: ${error?.message ?? error}`);
});
