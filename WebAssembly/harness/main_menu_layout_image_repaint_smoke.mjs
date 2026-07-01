#!/usr/bin/env node
import { access, mkdir, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const defaultWindowArchivePath = resolve(wasmRoot, "artifacts/real-assets/WindowZH.big");
const defaultIniArchivePath = resolve(wasmRoot, "artifacts/real-assets/INIZH.big");
const defaultEnglishArchivePath = resolve(wasmRoot, "artifacts/real-assets/EnglishZH.big");
const defaultTextureArchivePath = resolve(wasmRoot, "artifacts/real-assets/TexturesZH.big");
const windowArchivePath = resolve(wasmRoot, process.argv[2] ?? defaultWindowArchivePath);
const iniArchivePath = resolve(wasmRoot, process.argv[3] ?? defaultIniArchivePath);
const englishArchivePath = resolve(wasmRoot, process.argv[4] ?? defaultEnglishArchivePath);
const textureArchivePath = resolve(wasmRoot, process.argv[5] ?? defaultTextureArchivePath);
const screenshotDir = resolve(wasmRoot, "artifacts/screenshots");
const repaintScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-image-repaint-canvas.png",
);
const disabledButtonScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-disabled-button-repaint-canvas.png",
);
const hiliteButtonScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-hilite-button-repaint-canvas.png",
);
const pushedButtonScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-pushed-button-repaint-canvas.png",
);
const staticTextScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-static-text-repaint-canvas.png",
);
const singlePlayerScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-single-player-repaint-canvas.png",
);
const loadReplayScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-load-replay-repaint-canvas.png",
);
const difficultyScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-difficulty-repaint-canvas.png",
);
const factionLogoScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-faction-logo-repaint-canvas.png",
);

const D3DPT_TRIANGLELIST = 4;
const D3DTOP_DISABLE = 1;
const D3DTOP_MODULATE = 4;
const D3DTA_DIFFUSE = 0;
const D3DTA_TEXTURE = 2;
const runtimeArchivePath = "/assets/runtime-main-menu-layout-image-repaint";
const windowArchiveMemfsPath = `${runtimeArchivePath}/WindowZH.big`;
const iniArchiveMemfsPath = `${runtimeArchivePath}/INIZH.big`;
const englishArchiveMemfsPath = `${runtimeArchivePath}/EnglishZH.big`;
const textureArchiveMemfsPath = `${runtimeArchivePath}/TexturesZH.big`;
const layoutEntry = "Window\\Menus\\MainMenu.wnd";
const logoTextureEntry = "Data\\English\\Art\\Textures\\SCSmShellUserInterface512_001.tga";
const gameTextCsfEntry = "Data\\English\\generals.csf";
const rulerTextureEntry = "Art\\Textures\\mainmenuruleruserinterface.tga";
const factionLogoTextureEntry = "Art\\Textures\\sclogosuserinterface512_001.tga";
const logoMappedImageEntry =
  "Data\\INI\\MappedImages\\TextureSize_512\\SCSmShellUserInterface512.INI";
const factionLogoMappedImageEntry =
  "Data\\INI\\MappedImages\\TextureSize_512\\SCLogosUserInterface512.INI";
const mappedImageIniEntries = [
  "Data\\INI\\MappedImages\\HandCreated\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGameUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeLoad512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeSelect512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeWinLoss512.INI",
  factionLogoMappedImageEntry,
  "Data\\INI\\MappedImages\\TextureSize_512\\SCPurchasePowers512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCShellUserInterface512.INI",
  logoMappedImageEntry,
  "Data\\INI\\MappedImages\\TextureSize_512\\SNUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SSUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SUUserInterface512.INI",
];

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith(sep));
}

function withTimeout(promise, milliseconds, label) {
  let timeout;
  const timer = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(timeout));
}

function assertArchivePath(path, label) {
  if (!isInside(wasmRoot, path)) {
    throw new Error(`${label} must be inside ${wasmRoot}: ${path}`);
  }
}

assertArchivePath(windowArchivePath, "Window archive");
assertArchivePath(iniArchivePath, "INI archive");
assertArchivePath(englishArchivePath, "English archive");
assertArchivePath(textureArchivePath, "texture archive");

await access(windowArchivePath);
await access(iniArchivePath);
await access(englishArchivePath);
await access(textureArchivePath);
const windowArchiveStat = await stat(windowArchivePath);
const iniArchiveStat = await stat(iniArchivePath);
const englishArchiveStat = await stat(englishArchivePath);
const textureArchiveStat = await stat(textureArchivePath);
if (!windowArchiveStat.isFile() || windowArchiveStat.size <= 0) {
  throw new Error(`Window archive is not a readable file: ${windowArchivePath}`);
}
if (!iniArchiveStat.isFile() || iniArchiveStat.size <= 0) {
  throw new Error(`INI archive is not a readable file: ${iniArchivePath}`);
}
if (!englishArchiveStat.isFile() || englishArchiveStat.size <= 0) {
  throw new Error(`English archive is not a readable file: ${englishArchivePath}`);
}
if (!textureArchiveStat.isFile() || textureArchiveStat.size <= 0) {
  throw new Error(`texture archive is not a readable file: ${textureArchivePath}`);
}

await mkdir(screenshotDir, { recursive: true });

const windowArchiveRelativePath = relative(wasmRoot, windowArchivePath).split(sep).join("/");
const iniArchiveRelativePath = relative(wasmRoot, iniArchivePath).split(sep).join("/");
const englishArchiveRelativePath = relative(wasmRoot, englishArchivePath).split(sep).join("/");
const textureArchiveRelativePath = relative(wasmRoot, textureArchivePath).split(sep).join("/");
const server = await startStaticServer({ root: wasmRoot });
let browser;
const browserEvents = [];

try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("console", (message) => {
    browserEvents.push({ type: "console", level: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    browserEvents.push({ type: "pageerror", message: error?.message ?? String(error) });
  });
  page.on("crash", () => {
    browserEvents.push({ type: "crash" });
  });

  const harnessUrl = new URL("harness/index.html", server.url).href;
  const windowArchiveUrl = new URL(windowArchiveRelativePath, server.url).href;
  const iniArchiveUrl = new URL(iniArchiveRelativePath, server.url).href;
  const englishArchiveUrl = new URL(englishArchiveRelativePath, server.url).href;
  const textureArchiveUrl = new URL(textureArchiveRelativePath, server.url).href;

  await page.goto(harnessUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.CnCPort?.rpc));

  const bootResult = await page.evaluate(() => window.CnCPort.rpc("boot", {
    source: "W3D MainMenu WindowLayout image repaint render smoke",
  }));
  if (!bootResult.ok || bootResult.state.wasm !== "loaded") {
    throw new Error(`cnc-port boot failed before W3D MainMenu WindowLayout image repaint: ${JSON.stringify(bootResult)}`);
  }

  const archiveMountResult = await page.evaluate((payload) =>
    window.CnCPort.rpc("mountRangeBackedArchiveSet", payload), {
      path: runtimeArchivePath,
      register: false,
      archives: [
        {
          url: windowArchiveUrl,
          name: "WindowZH.big",
          expectedSourceBytes: windowArchiveStat.size,
          sourceArchive: windowArchivePath,
          entries: [layoutEntry],
        },
        {
          url: iniArchiveUrl,
          name: "INIZH.big",
          expectedSourceBytes: iniArchiveStat.size,
          sourceArchive: iniArchivePath,
          entries: mappedImageIniEntries,
        },
        {
          url: englishArchiveUrl,
          name: "EnglishZH.big",
          expectedSourceBytes: englishArchiveStat.size,
          sourceArchive: englishArchivePath,
          entries: [logoTextureEntry, gameTextCsfEntry],
        },
        {
          url: textureArchiveUrl,
          name: "TexturesZH.big",
          expectedSourceBytes: textureArchiveStat.size,
          sourceArchive: textureArchivePath,
          entries: [rulerTextureEntry, factionLogoTextureEntry],
        },
      ],
    });
  const rangeWindowArchive = archiveMountResult.archiveSet?.archives?.[0];
  const rangeIniArchive = archiveMountResult.archiveSet?.archives?.[1];
  const rangeEnglishArchive = archiveMountResult.archiveSet?.archives?.[2];
  const rangeTextureArchive = archiveMountResult.archiveSet?.archives?.[3];
  const windowEntry = rangeWindowArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === layoutEntry.toLowerCase());
  const logoMappedImageArchiveEntry = rangeIniArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === logoMappedImageEntry.toLowerCase());
  const logoTextureArchiveEntry = rangeEnglishArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === logoTextureEntry.toLowerCase());
  const gameTextCsfArchiveEntry = rangeEnglishArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === gameTextCsfEntry.toLowerCase());
  const rulerTextureArchiveEntry = rangeTextureArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === rulerTextureEntry.toLowerCase());
  const factionLogoTextureArchiveEntry = rangeTextureArchive?.entries?.find((entry) =>
    entry.path.toLowerCase() === factionLogoTextureEntry.toLowerCase());
  if (!archiveMountResult.ok
      || archiveMountResult.command !== "mountRangeBackedArchiveSet"
      || archiveMountResult.archiveSet?.path !== runtimeArchivePath
      || archiveMountResult.archiveSet?.archiveCount !== 4
      || archiveMountResult.archiveSet?.storage !== "range-backed-subset-big"
      || archiveMountResult.archiveSet?.reader !== "browser fetch Range -> synthesized BIG"
      || archiveMountResult.archiveSet?.registered !== false
      || archiveMountResult.archiveSet?.sourceTotalBytes !==
        windowArchiveStat.size + iniArchiveStat.size + englishArchiveStat.size + textureArchiveStat.size
      || archiveMountResult.archiveSet?.totalBytes >= archiveMountResult.archiveSet?.sourceTotalBytes
      || archiveMountResult.archiveSet?.probes?.length !== 0
      || rangeWindowArchive?.path !== windowArchiveMemfsPath
      || rangeWindowArchive?.storage !== "range-backed-subset-big"
      || rangeWindowArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeWindowArchive?.sourceBytes !== windowArchiveStat.size
      || rangeWindowArchive?.entryCount !== 1
      || rangeIniArchive?.path !== iniArchiveMemfsPath
      || rangeIniArchive?.storage !== "range-backed-subset-big"
      || rangeIniArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeIniArchive?.sourceBytes !== iniArchiveStat.size
      || rangeIniArchive?.entryCount !== mappedImageIniEntries.length
      || rangeEnglishArchive?.path !== englishArchiveMemfsPath
      || rangeEnglishArchive?.storage !== "range-backed-subset-big"
      || rangeEnglishArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeEnglishArchive?.sourceBytes !== englishArchiveStat.size
      || rangeEnglishArchive?.entryCount !== 2
      || rangeTextureArchive?.path !== textureArchiveMemfsPath
      || rangeTextureArchive?.storage !== "range-backed-subset-big"
      || rangeTextureArchive?.reader !== "browser fetch Range -> synthesized BIG"
      || rangeTextureArchive?.sourceBytes !== textureArchiveStat.size
      || rangeTextureArchive?.entryCount !== 2
      || windowEntry?.sourceOffset !== 4140728
      || windowEntry?.bytes !== 208561
      || windowEntry?.reader !== "browser fetch Range"
      || logoMappedImageArchiveEntry?.sourceOffset !== 4498544
      || logoMappedImageArchiveEntry?.bytes !== 45179
      || logoMappedImageArchiveEntry?.reader !== "browser fetch Range"
      || logoTextureArchiveEntry?.sourceOffset !== 61823560
      || logoTextureArchiveEntry?.bytes !== 1048620
      || logoTextureArchiveEntry?.reader !== "browser fetch Range"
      || gameTextCsfArchiveEntry?.sourceOffset !== 24612
      || gameTextCsfArchiveEntry?.bytes !== 925054
      || gameTextCsfArchiveEntry?.reader !== "browser fetch Range"
      || rulerTextureArchiveEntry?.sourceOffset !== 152340144
      || rulerTextureArchiveEntry?.bytes !== 4194348
      || factionLogoTextureArchiveEntry?.sourceOffset !== 189933456
      || factionLogoTextureArchiveEntry?.bytes !== 1048620
      || rulerTextureArchiveEntry?.reader !== "browser fetch Range"
      || factionLogoTextureArchiveEntry?.reader !== "browser fetch Range") {
    throw new Error(`range-backed MainMenu image archive subset mount failed: ${JSON.stringify(archiveMountResult)}`);
  }

  let repaintResult;
  try {
    repaintResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutImageRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout image repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout image repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const stage0 = repaintResult.probe?.draw?.renderState?.textureStages?.[0];
  const stage1 = repaintResult.probe?.draw?.renderState?.textureStages?.[1];
  const expectedExtraButtons = [
    ["MainMenu.wnd:ButtonMultiplayer", "GUI:Multiplayer", 156, 36],
    ["MainMenu.wnd:ButtonLoadReplay", "GUI:ReplayMenu", 196, 35],
    ["MainMenu.wnd:ButtonOptions", "GUI:Options", 236, 36],
    ["MainMenu.wnd:ButtonCredits", "GUI:Credits", 276, 36],
    ["MainMenu.wnd:ButtonExit", "GUI:Exit", 316, 36],
  ];
  const extraButtons = repaintResult.probe?.layout?.extraButtons ?? [];
  const extraButtonsValid = expectedExtraButtons.every(([name, label, y, height], index) => {
    const button = extraButtons[index];
    const proof = repaintResult.extraButtonRegions?.[index];
    return button?.name === name
      && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
      && button?.systemFunc === "GadgetPushButtonSystem"
      && button?.inputFunc === "GadgetPushButtonInput"
      && button?.x === 540
      && button?.y === y
      && button?.width === 208
      && button?.height === height
      && button?.hidden === false
      && button?.labelExists === true
      && button?.textNonEmpty === true
      && button?.imagesBound === true
      && button?.images?.[0] === "Buttons-Left"
      && button?.images?.[1] === "Buttons-Middle"
      && button?.images?.[2] === "Buttons-Right"
      && button?.text?.label === label
      && button?.text?.length > 0
      && button?.text?.width > 0
      && button?.text?.height > 0
      && proof?.region?.coloredPixelCount >= 20
      && proof?.textRegion?.coloredPixelCount >= 20
      && proof?.textRegion?.maxComponent >= 180;
  });
  if (!repaintResult.ok
      || repaintResult.command !== "ww3dMainMenuLayoutImageRepaint"
      || repaintResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || repaintResult.probe?.mode !== "buttonSinglePlayer"
      || !repaintResult.probe?.originalPaths?.includes("parseDrawData IMAGE -> TheMappedImageCollection->findImageByName")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:MainMenuRuler -> W3DGameWinDefaultDraw")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:Logo -> W3DGameWinDefaultDraw")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonSinglePlayer -> W3DGadgetPushButtonImageDraw")
      || !repaintResult.probe?.originalPaths?.includes("GameText::fetch(GUI:SinglePlayer) -> W3DDisplayString::draw button label")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonMultiplayer -> W3DGadgetPushButtonImageDraw")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonLoadReplay -> W3DGadgetPushButtonImageDraw")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonOptions -> W3DGadgetPushButtonImageDraw")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonCredits -> W3DGadgetPushButtonImageDraw")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonExit -> W3DGadgetPushButtonImageDraw")
      || !repaintResult.probe?.originalPaths?.includes("GameText::fetch(main visible button labels) -> W3DDisplayString::draw button labels")
      || !repaintResult.probe?.originalPaths?.includes("MainMenu.wnd:StaticTextSelectDifficulty -> W3DGadgetStaticTextDraw")
      || repaintResult.probe?.archives?.windowEntry !== layoutEntry
      || repaintResult.probe?.archives?.mappedImageEntry !== logoMappedImageEntry
      || repaintResult.probe?.archives?.textureEntry !== logoTextureEntry
      || repaintResult.probe?.archives?.rulerTextureEntry !== rulerTextureEntry
      || repaintResult.probe?.results?.runtimeAssetSystemInstalled !== true
      || repaintResult.probe?.results?.mappedCollectionLoaded !== true
      || repaintResult.probe?.results?.mappedImages !== 1186
      || repaintResult.probe?.results?.targetImageBound !== true
      || repaintResult.probe?.results?.rulerImageBound !== true
      || repaintResult.probe?.results?.buttonImagesBound !== true
      || repaintResult.probe?.results?.gameTextCsfExists !== true
      || repaintResult.probe?.results?.gameTextCreated !== true
      || repaintResult.probe?.results?.gameTextInitialized !== true
      || repaintResult.probe?.results?.buttonTextLabelExists !== true
      || repaintResult.probe?.results?.buttonTextNonEmpty !== true
      || repaintResult.probe?.results?.buttonTextDisplayStringBound !== true
      || repaintResult.probe?.results?.buttonTextSizeComputed !== true
      || repaintResult.probe?.results?.extraButtonLabelsExist !== true
      || repaintResult.probe?.results?.extraButtonTextNonEmpty !== true
      || repaintResult.probe?.results?.extraButtonsFound !== true
      || repaintResult.probe?.results?.extraButtonsCallbackBound !== true
      || repaintResult.probe?.results?.extraButtonsImagesBound !== true
      || repaintResult.probe?.results?.extraButtonsTextDisplayStringBound !== true
      || repaintResult.probe?.results?.extraButtonsTextSizeComputed !== true
      || repaintResult.probe?.results?.extraButtonsVisible !== true
      || repaintResult.probe?.results?.texturePreloaded !== true
      || repaintResult.probe?.results?.rulerTexturePreloaded !== true
      || repaintResult.probe?.results?.textureResolved !== true
      || repaintResult.probe?.results?.rulerTextureResolved !== true
      || repaintResult.probe?.results?.textureHasD3DSurface !== true
      || repaintResult.probe?.results?.rulerTextureHasD3DSurface !== true
      || repaintResult.probe?.layout?.path !== "Menus/MainMenu.wnd"
      || repaintResult.probe?.layout?.root?.name !== "MainMenu.wnd:MainMenuParent"
      || repaintResult.probe?.layout?.root?.drawFunc !== "W3DNoDraw"
      || repaintResult.probe?.layout?.ruler?.name !== "MainMenu.wnd:MainMenuRuler"
      || repaintResult.probe?.layout?.ruler?.drawFunc !== "W3DGameWinDefaultDraw"
      || repaintResult.probe?.layout?.ruler?.image !== "MainMenuRuler"
      || repaintResult.probe?.layout?.ruler?.x !== 0
      || repaintResult.probe?.layout?.ruler?.y !== 0
      || repaintResult.probe?.layout?.ruler?.width !== 800
      || repaintResult.probe?.layout?.ruler?.height !== 600
      || repaintResult.probe?.layout?.target?.name !== "MainMenu.wnd:Logo"
      || repaintResult.probe?.layout?.target?.drawFunc !== "W3DGameWinDefaultDraw"
      || repaintResult.probe?.layout?.target?.image !== "GeneralsLogo"
      || repaintResult.probe?.layout?.target?.x !== 504
      || repaintResult.probe?.layout?.target?.y !== 16
      || repaintResult.probe?.layout?.target?.width !== 287
      || repaintResult.probe?.layout?.target?.height !== 94
      || repaintResult.probe?.layout?.button?.name !== "MainMenu.wnd:ButtonSinglePlayer"
      || repaintResult.probe?.layout?.button?.drawFunc !== "W3DGadgetPushButtonImageDraw"
      || repaintResult.probe?.layout?.button?.systemFunc !== "GadgetPushButtonSystem"
      || repaintResult.probe?.layout?.button?.inputFunc !== "GadgetPushButtonInput"
      || repaintResult.probe?.layout?.button?.x !== 540
      || repaintResult.probe?.layout?.button?.y !== 116
      || repaintResult.probe?.layout?.button?.width !== 208
      || repaintResult.probe?.layout?.button?.height !== 36
      || repaintResult.probe?.layout?.button?.images?.[0] !== "Buttons-Left"
      || repaintResult.probe?.layout?.button?.images?.[1] !== "Buttons-Middle"
      || repaintResult.probe?.layout?.button?.images?.[2] !== "Buttons-Right"
      || repaintResult.probe?.layout?.button?.text?.label !== "GUI:SinglePlayer"
      || repaintResult.probe?.layout?.button?.text?.length <= 0
      || repaintResult.probe?.layout?.button?.text?.width <= 0
      || repaintResult.probe?.layout?.button?.text?.height <= 0
      || repaintResult.probe?.image?.name !== "GeneralsLogo"
      || repaintResult.probe?.image?.filename !== "SCSmShellUserInterface512_001.tga"
      || repaintResult.probe?.image?.status !== 0
      || repaintResult.probe?.image?.rotated !== false
      || repaintResult.probe?.image?.textureWidth !== 512
      || repaintResult.probe?.image?.textureHeight !== 512
      || repaintResult.probe?.image?.width !== 370
      || repaintResult.probe?.image?.height !== 120
      || repaintResult.probe?.rulerImage?.name !== "MainMenuRuler"
      || repaintResult.probe?.rulerImage?.filename !== "MainMenuRuleruserinterface.tga"
      || repaintResult.probe?.rulerImage?.status !== 0
      || repaintResult.probe?.rulerImage?.rotated !== false
      || repaintResult.probe?.rulerImage?.textureWidth !== 1024
      || repaintResult.probe?.rulerImage?.textureHeight !== 1024
      || repaintResult.probe?.rulerImage?.width !== 800
      || repaintResult.probe?.rulerImage?.height !== 600
      || repaintResult.probe?.buttonImages?.left?.name !== "Buttons-Left"
      || repaintResult.probe?.buttonImages?.left?.filename !== "SCSmShellUserInterface512_001.tga"
      || repaintResult.probe?.buttonImages?.middle?.name !== "Buttons-Middle"
      || repaintResult.probe?.buttonImages?.middle?.filename !== "SCSmShellUserInterface512_001.tga"
      || repaintResult.probe?.buttonImages?.right?.name !== "Buttons-Right"
      || repaintResult.probe?.buttonImages?.right?.filename !== "SCSmShellUserInterface512_001.tga"
      || repaintResult.probe?.gameText?.csfPath !== "data\\english\\generals.csf"
      || repaintResult.probe?.gameText?.created !== true
      || repaintResult.probe?.gameText?.initialized !== true
      || repaintResult.probe?.gameText?.buttonLabelExists !== true
      || repaintResult.probe?.gameText?.buttonTextNonEmpty !== true
      || repaintResult.probe?.gameText?.extraButtonLabelsExist !== true
      || repaintResult.probe?.gameText?.extraButtonTextNonEmpty !== true
      || extraButtons.length !== expectedExtraButtons.length
      || !extraButtonsValid
      || String(repaintResult.probe?.texture?.name ?? "").toLowerCase() !==
        "scsmshelluserinterface512_001.tga"
      || repaintResult.probe?.texture?.archiveEntry !== logoTextureEntry
      || repaintResult.probe?.texture?.width !== 512
      || repaintResult.probe?.texture?.height !== 512
      || repaintResult.probe?.texture?.uploadedLevels !== repaintResult.probe?.texture?.levels
      || String(repaintResult.probe?.rulerTexture?.name ?? "").toLowerCase() !==
        "mainmenuruleruserinterface.tga"
      || repaintResult.probe?.rulerTexture?.archiveEntry !== rulerTextureEntry
      || repaintResult.probe?.rulerTexture?.width !== 1024
      || repaintResult.probe?.rulerTexture?.height !== 1024
      || repaintResult.probe?.rulerTexture?.uploadedLevels !== repaintResult.probe?.rulerTexture?.levels
      || repaintResult.probe?.calls?.displayImageDraws < 6
      || repaintResult.probe?.calls?.drawIndexed < 6
      || repaintResult.probe?.calls?.browserTextureCreate < 2
      || repaintResult.probe?.calls?.browserTextureUpdate < 2
      || repaintResult.probe?.calls?.browserTextureBind < 2
      || repaintResult.probe?.draw?.primitiveType !== D3DPT_TRIANGLELIST
      || repaintResult.probe?.draw?.vertexCount !== 4
      || repaintResult.probe?.draw?.primitiveCount !== 2
      || repaintResult.probe?.draw?.vertexStride !== 44
      || repaintResult.probe?.draw?.screenRect?.left !== 504
      || repaintResult.probe?.draw?.screenRect?.top !== 16
      || repaintResult.probe?.draw?.screenRect?.right !== 791
      || repaintResult.probe?.draw?.screenRect?.bottom !== 110
      || stage0?.colorOp !== D3DTOP_MODULATE
      || stage0?.colorArg1 !== D3DTA_TEXTURE
      || stage0?.colorArg2 !== D3DTA_DIFFUSE
      || stage1?.colorOp !== D3DTOP_DISABLE
      || repaintResult.browserProbe?.source !== "browser_d3d8_draw_indexed"
      || repaintResult.browserProbe?.texture0?.sampled !== true
      || repaintResult.browserProbe?.vertexCount !== 4
      || repaintResult.browserProbe?.vertexStride !== 44
      || repaintResult.browserProbe?.indexCount !== 6
      || repaintResult.coloredLogoPixelCount < 1
      || repaintResult.coloredRulerPixelCount < 4
      || repaintResult.buttonRegion?.coloredPixelCount < 20
      || repaintResult.buttonTextRegion?.coloredPixelCount < 20
      || repaintResult.buttonTextRegion?.maxComponent < 180) {
    throw new Error(`W3D MainMenu WindowLayout image repaint render failed: ${JSON.stringify({
      ok: repaintResult.ok,
      bridgeInputPaths: repaintResult.bridgeInputPaths,
      probe: repaintResult.probe,
      browserProbe: repaintResult.browserProbe,
      logoPixels: repaintResult.logoPixels,
      rulerPixels: repaintResult.rulerPixels,
      buttonPixels: repaintResult.buttonPixels,
      buttonRegion: repaintResult.buttonRegion,
      buttonTextRegion: repaintResult.buttonTextRegion,
      extraButtonRegions: repaintResult.extraButtonRegions,
      coloredLogoPixelCount: repaintResult.coloredLogoPixelCount,
      coloredRulerPixelCount: repaintResult.coloredRulerPixelCount,
      coloredButtonPixelCount: repaintResult.coloredButtonPixelCount,
      screenshot: {
        width: repaintResult.screenshot?.width,
        height: repaintResult.screenshot?.height,
        centerPixel: repaintResult.screenshot?.centerPixel,
      },
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: repaintScreenshot });

  let disabledButtonResult;
  try {
    disabledButtonResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutDisabledButtonRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout disabled button image repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout disabled button image repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  if (!disabledButtonResult.ok
      || disabledButtonResult.command !== "ww3dMainMenuLayoutDisabledButtonRepaint"
      || disabledButtonResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || disabledButtonResult.probe?.mode !== "disabledButtonSinglePlayer"
      || !disabledButtonResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonSinglePlayer disabled -> W3DGadgetPushButtonImageDraw disabled image triplet")
      || disabledButtonResult.probe?.results?.buttonDisabledMappedImagesFound !== true
      || disabledButtonResult.probe?.results?.buttonDisabledImagesBound !== true
      || disabledButtonResult.probe?.results?.buttonDisabledStateRequested !== true
      || disabledButtonResult.probe?.results?.buttonEnabledBeforeStateChange !== true
      || disabledButtonResult.probe?.results?.buttonEnabledAfterStateChange !== false
      || disabledButtonResult.probe?.results?.buttonRenderedDisabledState !== true
      || disabledButtonResult.probe?.layout?.button?.name !== "MainMenu.wnd:ButtonSinglePlayer"
      || disabledButtonResult.probe?.layout?.button?.enabled !== false
      || disabledButtonResult.probe?.layout?.button?.renderState !== "disabled"
      || disabledButtonResult.probe?.layout?.button?.disabledStateRequested !== true
      || disabledButtonResult.probe?.layout?.button?.disabledImagesBound !== true
      || disabledButtonResult.probe?.layout?.button?.images?.[0] !== "Buttons-Disabled-Left"
      || disabledButtonResult.probe?.layout?.button?.images?.[1] !== "Buttons-Disabled-Middle"
      || disabledButtonResult.probe?.layout?.button?.images?.[2] !== "Buttons-Disabled-Right"
      || disabledButtonResult.probe?.disabledButtonImages?.left?.name !== "Buttons-Disabled-Left"
      || disabledButtonResult.probe?.disabledButtonImages?.middle?.name !== "Buttons-Disabled-Middle"
      || disabledButtonResult.probe?.disabledButtonImages?.right?.name !== "Buttons-Disabled-Right"
      || disabledButtonResult.probe?.disabledButtonImages?.left?.filename !== "SCSmShellUserInterface512_001.tga"
      || disabledButtonResult.probe?.disabledButtonImages?.middle?.filename !== "SCSmShellUserInterface512_001.tga"
      || disabledButtonResult.probe?.disabledButtonImages?.right?.filename !== "SCSmShellUserInterface512_001.tga"
      || !Array.isArray(disabledButtonResult.probe?.display?.imageDrawNames)
      || !disabledButtonResult.probe.display.imageDrawNames.includes("Buttons-Disabled-Left")
      || !disabledButtonResult.probe.display.imageDrawNames.includes("Buttons-Disabled-Middle")
      || !disabledButtonResult.probe.display.imageDrawNames.includes("Buttons-Disabled-Right")
      || disabledButtonResult.buttonRegion?.coloredPixelCount < 20
      || disabledButtonResult.buttonTextRegion?.coloredPixelCount < 20
      || disabledButtonResult.buttonTextRegion?.maxComponent < 64
      || disabledButtonResult.coloredLogoPixelCount < 1
      || disabledButtonResult.coloredRulerPixelCount < 4) {
    throw new Error(`W3D MainMenu disabled button repaint did not prove the original disabled image path: ${JSON.stringify({
      ok: disabledButtonResult.ok,
      probe: disabledButtonResult.probe,
      buttonRegion: disabledButtonResult.buttonRegion,
      buttonTextRegion: disabledButtonResult.buttonTextRegion,
      coloredLogoPixelCount: disabledButtonResult.coloredLogoPixelCount,
      coloredRulerPixelCount: disabledButtonResult.coloredRulerPixelCount,
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: disabledButtonScreenshot });

  let hiliteButtonResult;
  try {
    hiliteButtonResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutHiliteButtonRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout hilite button image repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout hilite button image repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  if (!hiliteButtonResult.ok
      || hiliteButtonResult.command !== "ww3dMainMenuLayoutHiliteButtonRepaint"
      || hiliteButtonResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || hiliteButtonResult.probe?.mode !== "hiliteButtonSinglePlayer"
      || !hiliteButtonResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonSinglePlayer hilite -> W3DGadgetPushButtonImageDraw hilite image triplet")
      || hiliteButtonResult.probe?.results?.buttonHiliteMappedImagesFound !== true
      || hiliteButtonResult.probe?.results?.buttonHiliteImagesBound !== true
      || hiliteButtonResult.probe?.results?.buttonHiliteStateRequested !== true
      || hiliteButtonResult.probe?.results?.buttonHilitedBeforeStateChange !== false
      || hiliteButtonResult.probe?.results?.buttonHilitedAfterStateChange !== true
      || hiliteButtonResult.probe?.results?.buttonRenderedHiliteState !== true
      || hiliteButtonResult.probe?.layout?.button?.name !== "MainMenu.wnd:ButtonSinglePlayer"
      || hiliteButtonResult.probe?.layout?.button?.enabled !== true
      || hiliteButtonResult.probe?.layout?.button?.renderState !== "hilite"
      || hiliteButtonResult.probe?.layout?.button?.hiliteStateRequested !== true
      || hiliteButtonResult.probe?.layout?.button?.hilited !== true
      || hiliteButtonResult.probe?.layout?.button?.hiliteImagesBound !== true
      || hiliteButtonResult.probe?.layout?.button?.images?.[0] !== "Buttons-HiLite-Left"
      || hiliteButtonResult.probe?.layout?.button?.images?.[1] !== "Buttons-HiLite-Middle"
      || hiliteButtonResult.probe?.layout?.button?.images?.[2] !== "Buttons-HiLite-Right"
      || hiliteButtonResult.probe?.hiliteButtonImages?.left?.name !== "Buttons-HiLite-Left"
      || hiliteButtonResult.probe?.hiliteButtonImages?.middle?.name !== "Buttons-HiLite-Middle"
      || hiliteButtonResult.probe?.hiliteButtonImages?.right?.name !== "Buttons-HiLite-Right"
      || hiliteButtonResult.probe?.hiliteButtonImages?.left?.filename !== "SCSmShellUserInterface512_001.tga"
      || hiliteButtonResult.probe?.hiliteButtonImages?.middle?.filename !== "SCSmShellUserInterface512_001.tga"
      || hiliteButtonResult.probe?.hiliteButtonImages?.right?.filename !== "SCSmShellUserInterface512_001.tga"
      || !Array.isArray(hiliteButtonResult.probe?.display?.imageDrawNames)
      || !hiliteButtonResult.probe.display.imageDrawNames.includes("Buttons-HiLite-Left")
      || !hiliteButtonResult.probe.display.imageDrawNames.includes("Buttons-HiLite-Middle")
      || !hiliteButtonResult.probe.display.imageDrawNames.includes("Buttons-HiLite-Right")
      || hiliteButtonResult.buttonRegion?.coloredPixelCount < 20
      || hiliteButtonResult.buttonTextRegion?.coloredPixelCount < 20
      || hiliteButtonResult.buttonTextRegion?.maxComponent < 180
      || hiliteButtonResult.coloredLogoPixelCount < 1
      || hiliteButtonResult.coloredRulerPixelCount < 4) {
    throw new Error(`W3D MainMenu hilite button repaint did not prove the original hilite image path: ${JSON.stringify({
      ok: hiliteButtonResult.ok,
      probe: hiliteButtonResult.probe,
      buttonRegion: hiliteButtonResult.buttonRegion,
      buttonTextRegion: hiliteButtonResult.buttonTextRegion,
      coloredLogoPixelCount: hiliteButtonResult.coloredLogoPixelCount,
      coloredRulerPixelCount: hiliteButtonResult.coloredRulerPixelCount,
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: hiliteButtonScreenshot });

  let pushedButtonResult;
  try {
    pushedButtonResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutPushedButtonRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout pushed button image repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout pushed button image repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  if (!pushedButtonResult.ok
      || pushedButtonResult.command !== "ww3dMainMenuLayoutPushedButtonRepaint"
      || pushedButtonResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || pushedButtonResult.probe?.mode !== "pushedButtonSinglePlayer"
      || !pushedButtonResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonSinglePlayer pushed -> W3DGadgetPushButtonImageDraw hilite-selected image triplet")
      || pushedButtonResult.probe?.results?.buttonPushedMappedImagesFound !== true
      || pushedButtonResult.probe?.results?.buttonPushedImagesBound !== true
      || pushedButtonResult.probe?.results?.buttonPushedStateRequested !== true
      || pushedButtonResult.probe?.results?.buttonHilitedBeforeStateChange !== false
      || pushedButtonResult.probe?.results?.buttonSelectedBeforeStateChange !== false
      || pushedButtonResult.probe?.results?.buttonHilitedAfterStateChange !== true
      || pushedButtonResult.probe?.results?.buttonSelectedAfterStateChange !== true
      || pushedButtonResult.probe?.results?.buttonRenderedPushedState !== true
      || pushedButtonResult.probe?.layout?.button?.name !== "MainMenu.wnd:ButtonSinglePlayer"
      || pushedButtonResult.probe?.layout?.button?.enabled !== true
      || pushedButtonResult.probe?.layout?.button?.renderState !== "pushed"
      || pushedButtonResult.probe?.layout?.button?.pushedStateRequested !== true
      || pushedButtonResult.probe?.layout?.button?.hilited !== true
      || pushedButtonResult.probe?.layout?.button?.selected !== true
      || pushedButtonResult.probe?.layout?.button?.pushedImagesBound !== true
      || pushedButtonResult.probe?.layout?.button?.images?.[0] !== "Buttons-Pushed-Left"
      || pushedButtonResult.probe?.layout?.button?.images?.[1] !== "Buttons-Pushed-Middle"
      || pushedButtonResult.probe?.layout?.button?.images?.[2] !== "Buttons-Pushed-Right"
      || pushedButtonResult.probe?.pushedButtonImages?.left?.name !== "Buttons-Pushed-Left"
      || pushedButtonResult.probe?.pushedButtonImages?.middle?.name !== "Buttons-Pushed-Middle"
      || pushedButtonResult.probe?.pushedButtonImages?.right?.name !== "Buttons-Pushed-Right"
      || pushedButtonResult.probe?.pushedButtonImages?.left?.filename !== "SCSmShellUserInterface512_001.tga"
      || pushedButtonResult.probe?.pushedButtonImages?.middle?.filename !== "SCSmShellUserInterface512_001.tga"
      || pushedButtonResult.probe?.pushedButtonImages?.right?.filename !== "SCSmShellUserInterface512_001.tga"
      || !Array.isArray(pushedButtonResult.probe?.display?.imageDrawNames)
      || !pushedButtonResult.probe.display.imageDrawNames.includes("Buttons-Pushed-Left")
      || !pushedButtonResult.probe.display.imageDrawNames.includes("Buttons-Pushed-Middle")
      || !pushedButtonResult.probe.display.imageDrawNames.includes("Buttons-Pushed-Right")
      || pushedButtonResult.buttonRegion?.coloredPixelCount < 20
      || pushedButtonResult.buttonTextRegion?.coloredPixelCount < 20
      || pushedButtonResult.buttonTextRegion?.maxComponent < 180
      || pushedButtonResult.coloredLogoPixelCount < 1
      || pushedButtonResult.coloredRulerPixelCount < 4) {
    throw new Error(`W3D MainMenu pushed button repaint did not prove the original pushed image path: ${JSON.stringify({
      ok: pushedButtonResult.ok,
      probe: pushedButtonResult.probe,
      buttonRegion: pushedButtonResult.buttonRegion,
      buttonTextRegion: pushedButtonResult.buttonTextRegion,
      coloredLogoPixelCount: pushedButtonResult.coloredLogoPixelCount,
      coloredRulerPixelCount: pushedButtonResult.coloredRulerPixelCount,
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: pushedButtonScreenshot });

  let staticTextResult;
  try {
    staticTextResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutStaticTextRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout static text repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout static text repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  if (!staticTextResult.ok
      || staticTextResult.command !== "ww3dMainMenuLayoutStaticTextRepaint"
      || staticTextResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || staticTextResult.probe?.mode !== "staticTextSelectDifficulty"
      || !staticTextResult.probe?.originalPaths?.includes("MainMenu.wnd:StaticTextSelectDifficulty -> W3DGadgetStaticTextDraw")
      || !staticTextResult.probe?.originalPaths?.includes("GameText::fetch(GUI:SelectDifficulty) -> W3DDisplayString::draw static text")
      || staticTextResult.probe?.results?.staticTextLabelExists !== true
      || staticTextResult.probe?.results?.staticTextNonEmpty !== true
      || staticTextResult.probe?.results?.staticTextFound !== true
      || staticTextResult.probe?.results?.staticTextCallbackBound !== true
      || staticTextResult.probe?.results?.staticTextUserDataBound !== true
      || staticTextResult.probe?.results?.staticTextDisplayStringBound !== true
      || staticTextResult.probe?.results?.staticTextSizeComputed !== true
      || staticTextResult.probe?.layout?.staticText?.name !== "MainMenu.wnd:StaticTextSelectDifficulty"
      || staticTextResult.probe?.layout?.staticText?.drawFunc !== "W3DGadgetStaticTextDraw"
      || staticTextResult.probe?.layout?.staticText?.systemFunc !== "GadgetStaticTextSystem"
      || staticTextResult.probe?.layout?.staticText?.inputFunc !== "GadgetStaticTextInput"
      || staticTextResult.probe?.layout?.staticText?.x !== 540
      || staticTextResult.probe?.layout?.staticText?.y !== 116
      || staticTextResult.probe?.layout?.staticText?.width !== 216
      || staticTextResult.probe?.layout?.staticText?.height !== 36
      || staticTextResult.probe?.layout?.staticText?.initialHidden !== true
      || staticTextResult.probe?.layout?.staticText?.hidden !== false
      || staticTextResult.probe?.layout?.staticText?.visibilityFocused !== true
      || staticTextResult.probe?.layout?.staticText?.centered !== false
      || staticTextResult.probe?.layout?.staticText?.centeredVertically !== true
      || staticTextResult.probe?.layout?.staticText?.leftMargin !== 7
      || staticTextResult.probe?.layout?.staticText?.topMargin !== 7
      || staticTextResult.probe?.layout?.staticText?.text?.label !== "GUI:SelectDifficulty"
      || staticTextResult.probe?.layout?.staticText?.text?.length <= 0
      || staticTextResult.probe?.layout?.staticText?.text?.width <= 0
      || staticTextResult.probe?.layout?.staticText?.text?.height <= 0
      || staticTextResult.probe?.gameText?.staticTextLabelExists !== true
      || staticTextResult.probe?.gameText?.staticTextNonEmpty !== true
      || staticTextResult.probe?.calls?.displayImageDraws < 2
      || staticTextResult.probe?.calls?.drawIndexed < 3
      || staticTextResult.coloredLogoPixelCount < 1
      || staticTextResult.coloredRulerPixelCount < 4
      || staticTextResult.staticTextRegion?.coloredPixelCount < 20
      || staticTextResult.staticTextRegion?.maxComponent < 180) {
    throw new Error(`W3D MainMenu WindowLayout static text repaint failed: ${JSON.stringify({
      ok: staticTextResult.ok,
      probe: staticTextResult.probe,
      staticTextRegion: staticTextResult.staticTextRegion,
      coloredLogoPixelCount: staticTextResult.coloredLogoPixelCount,
      coloredRulerPixelCount: staticTextResult.coloredRulerPixelCount,
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: staticTextScreenshot });

  let singlePlayerResult;
  try {
    singlePlayerResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutSinglePlayerRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout Single Player dropdown repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout Single Player dropdown repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const expectedSinglePlayerButtons = [
    ["MainMenu.wnd:ButtonUSA", "GUI:USA", 116, 36],
    ["MainMenu.wnd:ButtonGLA", "GUI:GLA", 156, 36],
    ["MainMenu.wnd:ButtonChina", "GUI:CHINA_Caps", 196, 35],
    ["MainMenu.wnd:ButtonChallenge", "GUI:Generals_Challenge", 236, 36],
    ["MainMenu.wnd:ButtonSkirmish", "GUI:Skirmish", 276, 36],
    ["MainMenu.wnd:ButtonSingleBack", "GUI:Back", 316, 35],
  ];
  const singlePlayerButtons = singlePlayerResult.probe?.layout?.singlePlayerButtons ?? [];
  const singlePlayerButtonsValid = expectedSinglePlayerButtons.every(([name, label, y, height], index) => {
    const button = singlePlayerButtons[index];
    const proof = singlePlayerResult.singlePlayerButtonRegions?.[index];
    return button?.name === name
      && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
      && button?.systemFunc === "GadgetPushButtonSystem"
      && button?.inputFunc === "GadgetPushButtonInput"
      && button?.x === 540
      && button?.y === y
      && button?.width === 208
      && button?.height === height
      && button?.hidden === false
      && button?.labelExists === true
      && button?.textNonEmpty === true
      && button?.imagesBound === true
      && button?.images?.[0] === "Buttons-Left"
      && button?.images?.[1] === "Buttons-Middle"
      && button?.images?.[2] === "Buttons-Right"
      && button?.text?.label === label
      && button?.text?.length > 0
      && button?.text?.width > 0
      && button?.text?.height > 0
      && proof?.region?.coloredPixelCount >= 20
      && proof?.textRegion?.coloredPixelCount >= 20
      && proof?.textRegion?.maxComponent >= 180;
  });
  if (!singlePlayerResult.ok
      || singlePlayerResult.command !== "ww3dMainMenuLayoutSinglePlayerRepaint"
      || singlePlayerResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || singlePlayerResult.probe?.mode !== "singlePlayerDropdown"
      || !singlePlayerResult.probe?.originalPaths?.includes("MainMenu.wnd:MapBorder -> PassSelectedButtonsToParentSystem")
      || !singlePlayerResult.probe?.originalPaths?.includes("MainMenu.wnd:EarthMap -> PassSelectedButtonsToParentSystem")
      || !singlePlayerResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonUSA -> W3DGadgetPushButtonImageDraw")
      || !singlePlayerResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonGLA -> W3DGadgetPushButtonImageDraw")
      || !singlePlayerResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonChina -> W3DGadgetPushButtonImageDraw")
      || !singlePlayerResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonChallenge -> W3DGadgetPushButtonImageDraw")
      || !singlePlayerResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonSkirmish -> W3DGadgetPushButtonImageDraw")
      || !singlePlayerResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonSingleBack -> W3DGadgetPushButtonImageDraw")
      || !singlePlayerResult.probe?.originalPaths?.includes("GameText::fetch(single-player dropdown button labels) -> W3DDisplayString::draw button labels")
      || singlePlayerResult.probe?.results?.singlePlayerButtonLabelsExist !== true
      || singlePlayerResult.probe?.results?.singlePlayerButtonTextNonEmpty !== true
      || singlePlayerResult.probe?.results?.singlePlayerDropdownFound !== true
      || singlePlayerResult.probe?.results?.singlePlayerDropdownCallbackBound !== true
      || singlePlayerResult.probe?.results?.singlePlayerEarthMapFound !== true
      || singlePlayerResult.probe?.results?.singlePlayerEarthMapCallbackBound !== true
      || singlePlayerResult.probe?.results?.singlePlayerButtonsFound !== true
      || singlePlayerResult.probe?.results?.singlePlayerButtonsCallbackBound !== true
      || singlePlayerResult.probe?.results?.singlePlayerButtonsImagesBound !== true
      || singlePlayerResult.probe?.results?.singlePlayerButtonsTextDisplayStringBound !== true
      || singlePlayerResult.probe?.results?.singlePlayerButtonsTextSizeComputed !== true
      || singlePlayerResult.probe?.results?.singlePlayerDropdownHidden !== false
      || singlePlayerResult.probe?.results?.singlePlayerEarthMapHidden !== false
      || singlePlayerResult.probe?.results?.singlePlayerButtonsVisible !== true
      || singlePlayerResult.probe?.layout?.singlePlayerDropdown?.name !== "MainMenu.wnd:MapBorder"
      || singlePlayerResult.probe?.layout?.singlePlayerDropdown?.x !== 532
      || singlePlayerResult.probe?.layout?.singlePlayerDropdown?.y !== 108
      || singlePlayerResult.probe?.layout?.singlePlayerDropdown?.width !== 224
      || singlePlayerResult.probe?.layout?.singlePlayerDropdown?.height !== 252
      || singlePlayerResult.probe?.layout?.singlePlayerDropdown?.systemFunc !== "PassSelectedButtonsToParentSystem"
      || singlePlayerResult.probe?.layout?.singlePlayerDropdown?.hidden !== false
      || singlePlayerResult.probe?.layout?.singlePlayerEarthMap?.name !== "MainMenu.wnd:EarthMap"
      || singlePlayerResult.probe?.layout?.singlePlayerEarthMap?.x !== 532
      || singlePlayerResult.probe?.layout?.singlePlayerEarthMap?.y !== 108
      || singlePlayerResult.probe?.layout?.singlePlayerEarthMap?.width !== 224
      || singlePlayerResult.probe?.layout?.singlePlayerEarthMap?.height !== 244
      || singlePlayerResult.probe?.layout?.singlePlayerEarthMap?.systemFunc !== "PassSelectedButtonsToParentSystem"
      || singlePlayerResult.probe?.layout?.singlePlayerEarthMap?.drawFunc !== "W3DGameWinDefaultDraw"
      || singlePlayerResult.probe?.layout?.singlePlayerEarthMap?.hidden !== false
      || singlePlayerResult.probe?.gameText?.singlePlayerButtonLabelsExist !== true
      || singlePlayerResult.probe?.gameText?.singlePlayerButtonTextNonEmpty !== true
      || singlePlayerButtons.length !== expectedSinglePlayerButtons.length
      || !singlePlayerButtonsValid
      || singlePlayerResult.probe?.calls?.displayImageDraws < 8
      || singlePlayerResult.probe?.calls?.drawIndexed < 8
      || singlePlayerResult.coloredLogoPixelCount < 1
      || singlePlayerResult.coloredRulerPixelCount < 4) {
    throw new Error(`W3D MainMenu WindowLayout Single Player dropdown repaint failed: ${JSON.stringify({
      ok: singlePlayerResult.ok,
      probe: singlePlayerResult.probe,
      singlePlayerButtonRegions: singlePlayerResult.singlePlayerButtonRegions,
      coloredLogoPixelCount: singlePlayerResult.coloredLogoPixelCount,
      coloredRulerPixelCount: singlePlayerResult.coloredRulerPixelCount,
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: singlePlayerScreenshot });

  let loadReplayResult;
  try {
    loadReplayResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutLoadReplayRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout load replay dropdown repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout load replay dropdown repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const expectedLoadReplayButtons = [
    ["MainMenu.wnd:ButtonLoadGame", "GUI:MainMenuLoadGame", 116, 35],
    ["MainMenu.wnd:ButtonReplay", "GUI:MainMenuLoadReplay", 156, 35],
    ["MainMenu.wnd:ButtonLoadReplayBack", "GUI:Back", 196, 36],
  ];
  const loadReplayButtons = loadReplayResult.probe?.layout?.loadReplayButtons ?? [];
  const loadReplayButtonsValid = expectedLoadReplayButtons.every(([name, label, y, height], index) => {
    const button = loadReplayButtons[index];
    const proof = loadReplayResult.loadReplayButtonRegions?.[index];
    return button?.name === name
      && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
      && button?.systemFunc === "GadgetPushButtonSystem"
      && button?.inputFunc === "GadgetPushButtonInput"
      && button?.x === 540
      && button?.y === y
      && button?.width === 208
      && button?.height === height
      && button?.hidden === false
      && button?.labelExists === true
      && button?.textNonEmpty === true
      && button?.imagesBound === true
      && button?.images?.[0] === "Buttons-Left"
      && button?.images?.[1] === "Buttons-Middle"
      && button?.images?.[2] === "Buttons-Right"
      && button?.text?.label === label
      && button?.text?.length > 0
      && button?.text?.width > 0
      && button?.text?.height > 0
      && proof?.region?.coloredPixelCount >= 20
      && proof?.textRegion?.coloredPixelCount >= 20
      && proof?.textRegion?.maxComponent >= 180;
  });
  if (!loadReplayResult.ok
      || loadReplayResult.command !== "ww3dMainMenuLayoutLoadReplayRepaint"
      || loadReplayResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || loadReplayResult.probe?.mode !== "loadReplayDropdown"
      || !loadReplayResult.probe?.originalPaths?.includes("MainMenu.wnd:MapBorder3 -> PassSelectedButtonsToParentSystem")
      || !loadReplayResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonLoadGame -> W3DGadgetPushButtonImageDraw")
      || !loadReplayResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonReplay -> W3DGadgetPushButtonImageDraw")
      || !loadReplayResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonLoadReplayBack -> W3DGadgetPushButtonImageDraw")
      || !loadReplayResult.probe?.originalPaths?.includes("GameText::fetch(load-replay dropdown button labels) -> W3DDisplayString::draw button labels")
      || loadReplayResult.probe?.results?.loadReplayButtonLabelsExist !== true
      || loadReplayResult.probe?.results?.loadReplayButtonTextNonEmpty !== true
      || loadReplayResult.probe?.results?.loadReplayDropdownFound !== true
      || loadReplayResult.probe?.results?.loadReplayDropdownCallbackBound !== true
      || loadReplayResult.probe?.results?.loadReplayButtonsFound !== true
      || loadReplayResult.probe?.results?.loadReplayButtonsCallbackBound !== true
      || loadReplayResult.probe?.results?.loadReplayButtonsImagesBound !== true
      || loadReplayResult.probe?.results?.loadReplayButtonsTextDisplayStringBound !== true
      || loadReplayResult.probe?.results?.loadReplayButtonsTextSizeComputed !== true
      || loadReplayResult.probe?.results?.loadReplayDropdownHidden !== false
      || loadReplayResult.probe?.results?.loadReplayButtonsVisible !== true
      || loadReplayResult.probe?.layout?.loadReplayDropdown?.name !== "MainMenu.wnd:MapBorder3"
      || loadReplayResult.probe?.layout?.loadReplayDropdown?.x !== 532
      || loadReplayResult.probe?.layout?.loadReplayDropdown?.y !== 108
      || loadReplayResult.probe?.layout?.loadReplayDropdown?.width !== 224
      || loadReplayResult.probe?.layout?.loadReplayDropdown?.height !== 132
      || loadReplayResult.probe?.layout?.loadReplayDropdown?.systemFunc !== "PassSelectedButtonsToParentSystem"
      || loadReplayResult.probe?.layout?.loadReplayDropdown?.hidden !== false
      || loadReplayResult.probe?.gameText?.loadReplayButtonLabelsExist !== true
      || loadReplayResult.probe?.gameText?.loadReplayButtonTextNonEmpty !== true
      || loadReplayButtons.length !== expectedLoadReplayButtons.length
      || !loadReplayButtonsValid
      || loadReplayResult.probe?.calls?.displayImageDraws < 5
      || loadReplayResult.probe?.calls?.drawIndexed < 5
      || loadReplayResult.coloredLogoPixelCount < 1
      || loadReplayResult.coloredRulerPixelCount < 4) {
    throw new Error(`W3D MainMenu WindowLayout load replay dropdown repaint failed: ${JSON.stringify({
      ok: loadReplayResult.ok,
      probe: loadReplayResult.probe,
      loadReplayButtonRegions: loadReplayResult.loadReplayButtonRegions,
      coloredLogoPixelCount: loadReplayResult.coloredLogoPixelCount,
      coloredRulerPixelCount: loadReplayResult.coloredRulerPixelCount,
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: loadReplayScreenshot });

  let difficultyResult;
  try {
    difficultyResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutDifficultyRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout difficulty dropdown repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout difficulty dropdown repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const expectedDifficultyButtons = [
    ["MainMenu.wnd:ButtonEasy", "GUI:EasyCaps", 156, 35],
    ["MainMenu.wnd:ButtonMedium", "GUI:MediumDifficultyCaps", 196, 35],
    ["MainMenu.wnd:ButtonHard", "GUI:HardCaps", 236, 36],
    ["MainMenu.wnd:ButtonDiffBack", "GUI:Back", 276, 36],
  ];
  const difficultyButtons = difficultyResult.probe?.layout?.difficultyButtons ?? [];
  const difficultyButtonsValid = expectedDifficultyButtons.every(([name, label, y, height], index) => {
    const button = difficultyButtons[index];
    const proof = difficultyResult.difficultyButtonRegions?.[index];
    return button?.name === name
      && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
      && button?.systemFunc === "GadgetPushButtonSystem"
      && button?.inputFunc === "GadgetPushButtonInput"
      && button?.x === 540
      && button?.y === y
      && button?.width === 208
      && button?.height === height
      && button?.hidden === false
      && button?.labelExists === true
      && button?.textNonEmpty === true
      && button?.imagesBound === true
      && button?.images?.[0] === "Buttons-Left"
      && button?.images?.[1] === "Buttons-Middle"
      && button?.images?.[2] === "Buttons-Right"
      && button?.text?.label === label
      && button?.text?.length > 0
      && button?.text?.width > 0
      && button?.text?.height > 0
      && proof?.region?.coloredPixelCount >= 20
      && proof?.textRegion?.coloredPixelCount >= 20
      && proof?.textRegion?.maxComponent >= 180;
  });
  if (!difficultyResult.ok
      || difficultyResult.command !== "ww3dMainMenuLayoutDifficultyRepaint"
      || difficultyResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || difficultyResult.probe?.mode !== "difficultyDropdown"
      || !difficultyResult.probe?.originalPaths?.includes("MainMenu.wnd:MapBorder4 -> PassSelectedButtonsToParentSystem")
      || !difficultyResult.probe?.originalPaths?.includes("MainMenu.wnd:EarthMap4 -> PassSelectedButtonsToParentSystem")
      || !difficultyResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonEasy -> W3DGadgetPushButtonImageDraw")
      || !difficultyResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonMedium -> W3DGadgetPushButtonImageDraw")
      || !difficultyResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonHard -> W3DGadgetPushButtonImageDraw")
      || !difficultyResult.probe?.originalPaths?.includes("MainMenu.wnd:ButtonDiffBack -> W3DGadgetPushButtonImageDraw")
      || !difficultyResult.probe?.originalPaths?.includes("GameText::fetch(difficulty dropdown button labels) -> W3DDisplayString::draw button labels")
      || !difficultyResult.probe?.originalPaths?.includes("MainMenu.wnd:StaticTextSelectDifficulty -> W3DGadgetStaticTextDraw")
      || difficultyResult.probe?.results?.difficultyButtonLabelsExist !== true
      || difficultyResult.probe?.results?.difficultyButtonTextNonEmpty !== true
      || difficultyResult.probe?.results?.difficultyDropdownFound !== true
      || difficultyResult.probe?.results?.difficultyDropdownCallbackBound !== true
      || difficultyResult.probe?.results?.difficultyEarthMapFound !== true
      || difficultyResult.probe?.results?.difficultyEarthMapCallbackBound !== true
      || difficultyResult.probe?.results?.difficultyButtonsFound !== true
      || difficultyResult.probe?.results?.difficultyButtonsCallbackBound !== true
      || difficultyResult.probe?.results?.difficultyButtonsImagesBound !== true
      || difficultyResult.probe?.results?.difficultyButtonsTextDisplayStringBound !== true
      || difficultyResult.probe?.results?.difficultyButtonsTextSizeComputed !== true
      || difficultyResult.probe?.results?.difficultyDropdownHidden !== false
      || difficultyResult.probe?.results?.difficultyEarthMapHidden !== false
      || difficultyResult.probe?.results?.difficultyButtonsVisible !== true
      || difficultyResult.probe?.results?.staticTextFound !== true
      || difficultyResult.probe?.results?.staticTextCallbackBound !== true
      || difficultyResult.probe?.results?.staticTextDisplayStringBound !== true
      || difficultyResult.probe?.results?.staticTextSizeComputed !== true
      || difficultyResult.probe?.layout?.difficultyDropdown?.name !== "MainMenu.wnd:MapBorder4"
      || difficultyResult.probe?.layout?.difficultyDropdown?.x !== 532
      || difficultyResult.probe?.layout?.difficultyDropdown?.y !== 108
      || difficultyResult.probe?.layout?.difficultyDropdown?.width !== 224
      || difficultyResult.probe?.layout?.difficultyDropdown?.height !== 212
      || difficultyResult.probe?.layout?.difficultyDropdown?.systemFunc !== "PassSelectedButtonsToParentSystem"
      || difficultyResult.probe?.layout?.difficultyDropdown?.hidden !== false
      || difficultyResult.probe?.layout?.difficultyEarthMap?.name !== "MainMenu.wnd:EarthMap4"
      || difficultyResult.probe?.layout?.difficultyEarthMap?.x !== 532
      || difficultyResult.probe?.layout?.difficultyEarthMap?.y !== 108
      || difficultyResult.probe?.layout?.difficultyEarthMap?.width !== 224
      || difficultyResult.probe?.layout?.difficultyEarthMap?.height !== 212
      || difficultyResult.probe?.layout?.difficultyEarthMap?.systemFunc !== "PassSelectedButtonsToParentSystem"
      || difficultyResult.probe?.layout?.difficultyEarthMap?.drawFunc !== "W3DGameWinDefaultDraw"
      || difficultyResult.probe?.layout?.difficultyEarthMap?.hidden !== false
      || difficultyResult.probe?.layout?.staticText?.name !== "MainMenu.wnd:StaticTextSelectDifficulty"
      || difficultyResult.probe?.layout?.staticText?.x !== 540
      || difficultyResult.probe?.layout?.staticText?.y !== 116
      || difficultyResult.probe?.layout?.staticText?.width !== 216
      || difficultyResult.probe?.layout?.staticText?.height !== 36
      || difficultyResult.probe?.layout?.staticText?.initialHidden !== true
      || difficultyResult.probe?.layout?.staticText?.hidden !== false
      || difficultyResult.probe?.layout?.staticText?.visibilityFocused !== true
      || difficultyResult.probe?.layout?.staticText?.text?.label !== "GUI:SelectDifficulty"
      || difficultyResult.probe?.layout?.staticText?.text?.length <= 0
      || difficultyResult.probe?.layout?.staticText?.text?.width <= 0
      || difficultyResult.probe?.layout?.staticText?.text?.height <= 0
      || difficultyResult.probe?.gameText?.difficultyButtonLabelsExist !== true
      || difficultyResult.probe?.gameText?.difficultyButtonTextNonEmpty !== true
      || difficultyResult.probe?.gameText?.staticTextLabelExists !== true
      || difficultyResult.probe?.gameText?.staticTextNonEmpty !== true
      || difficultyButtons.length !== expectedDifficultyButtons.length
      || !difficultyButtonsValid
      || difficultyResult.probe?.calls?.displayImageDraws < 6
      || difficultyResult.probe?.calls?.drawIndexed < 7
      || difficultyResult.coloredLogoPixelCount < 1
      || difficultyResult.coloredRulerPixelCount < 4
      || difficultyResult.staticTextRegion?.coloredPixelCount < 20
      || difficultyResult.staticTextRegion?.maxComponent < 180) {
    throw new Error(`W3D MainMenu WindowLayout difficulty dropdown repaint failed: ${JSON.stringify({
      ok: difficultyResult.ok,
      probe: difficultyResult.probe,
      difficultyButtonRegions: difficultyResult.difficultyButtonRegions,
      staticTextRegion: difficultyResult.staticTextRegion,
      coloredLogoPixelCount: difficultyResult.coloredLogoPixelCount,
      coloredRulerPixelCount: difficultyResult.coloredRulerPixelCount,
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: difficultyScreenshot });

  let factionLogoResult;
  try {
    factionLogoResult = await withTimeout(
      page.evaluate((payload) => window.CnCPort.rpc("ww3dMainMenuLayoutFactionLogoRepaint", payload), {
        archiveDirectoryPath: runtimeArchivePath,
        windowArchivePath: windowArchiveMemfsPath,
        iniArchivePath: iniArchiveMemfsPath,
        textureArchivePath: englishArchiveMemfsPath,
        rulerTextureArchivePath: textureArchiveMemfsPath,
      }),
      45000,
      "W3D MainMenu WindowLayout faction logo repaint",
    );
  } catch (error) {
    throw new Error(`W3D MainMenu WindowLayout faction logo repaint crashed: ${error?.message ?? String(error)}; browser events: ${JSON.stringify(browserEvents)}`);
  }

  const expectedFactionLogos = [
    ["MainMenu.wnd:WinFactionUS", "SAFactionLogo96_US", 67, 423, 96, 96],
    ["MainMenu.wnd:WinFactionGLA", "SUFactionLogo96_GLA", 211, 423, 96, 96],
    ["MainMenu.wnd:WinFactionChina", "SNFactionLogo96_China", 352, 423, 96, 96],
    ["MainMenu.wnd:WinFactionTraining", "Training96", 497, 423, 93, 84],
    ["MainMenu.wnd:WinFactionSkirmish", "Skirmish96", 640, 423, 96, 96],
  ];
  const factionLogos = factionLogoResult.probe?.layout?.factionLogos ?? [];
  const factionLogosValid = expectedFactionLogos.every(([name, image, x, y, imageWidth, imageHeight], index) => {
    const logo = factionLogos[index];
    const proof = factionLogoResult.factionLogoRegions?.[index];
    return logo?.name === name
      && logo?.image === image
      && logo?.filename === "SCLogosUserInterface512_001.tga"
      && logo?.x === x
      && logo?.y === y
      && logo?.width === 96
      && logo?.height === 96
      && logo?.drawFunc === "W3DGameWinDefaultDraw"
      && logo?.systemFunc === "GameWinDefaultSystem"
      && logo?.initialHidden === true
      && logo?.hidden === false
      && logo?.imageWidth === imageWidth
      && logo?.imageHeight === imageHeight
      && logo?.found === true
      && logo?.callbackBound === true
      && logo?.mappedImageFound === true
      && logo?.imageBound === true
      && proof?.region?.coloredPixelCount >= 20
      && proof?.region?.maxComponent >= 64;
  });
  if (!factionLogoResult.ok
      || factionLogoResult.command !== "ww3dMainMenuLayoutFactionLogoRepaint"
      || factionLogoResult.probe?.source !== "ww3d_main_menu_layout_image_repaint_probe"
      || factionLogoResult.probe?.mode !== "factionLogoStrip"
      || !factionLogoResult.probe?.originalPaths?.includes("MainMenu.wnd faction logo strip -> W3DGameWinDefaultDraw")
      || !factionLogoResult.probe?.originalPaths?.includes("SCLogos mapped-image INI -> TexturesZH.big texture")
      || factionLogoResult.probe?.archives?.factionLogoMappedImageEntry !== factionLogoMappedImageEntry
      || factionLogoResult.probe?.archives?.factionLogoTextureEntry !== factionLogoTextureEntry
      || factionLogoResult.probe?.results?.factionLogoMappedIniExists !== true
      || factionLogoResult.probe?.results?.factionLogoTextureFileExists !== true
      || factionLogoResult.probe?.results?.mappedImages !== 1186
      || factionLogoResult.probe?.results?.factionLogoMappedImagesFound !== true
      || factionLogoResult.probe?.results?.factionLogoWindowsFound !== true
      || factionLogoResult.probe?.results?.factionLogoWindowsCallbackBound !== true
      || factionLogoResult.probe?.results?.factionLogoImagesBound !== true
      || factionLogoResult.probe?.results?.factionLogosVisible !== true
      || factionLogos.length !== expectedFactionLogos.length
      || !factionLogosValid
      || factionLogoResult.probe?.calls?.displayImageDraws < 7
      || factionLogoResult.probe?.calls?.drawIndexed < 7
      || factionLogoResult.probe?.calls?.browserTextureCreate < 3
      || factionLogoResult.probe?.calls?.browserTextureUpdate < 3
      || factionLogoResult.probe?.calls?.browserTextureBind < 3
      || factionLogoResult.coloredLogoPixelCount < 1
      || factionLogoResult.coloredRulerPixelCount < 4) {
    throw new Error(`W3D MainMenu WindowLayout faction logo repaint failed: ${JSON.stringify({
      ok: factionLogoResult.ok,
      probe: factionLogoResult.probe,
      factionLogoRegions: factionLogoResult.factionLogoRegions,
      coloredLogoPixelCount: factionLogoResult.coloredLogoPixelCount,
      coloredRulerPixelCount: factionLogoResult.coloredRulerPixelCount,
    })}`);
  }

  await page.locator("#viewport").screenshot({ path: factionLogoScreenshot });

  const browserFailures = browserEvents.filter((event) =>
    event.type === "pageerror" || event.type === "crash");
  if (browserFailures.length > 0) {
    throw new Error(`browser failures during W3D MainMenu WindowLayout image repaint: ${JSON.stringify(browserFailures)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    path: "browser-ww3d-main-menu-layout-image-repaint",
    url: harnessUrl,
    screenshot: repaintScreenshot,
    disabledButtonScreenshot,
    hiliteButtonScreenshot,
    pushedButtonScreenshot,
    staticTextScreenshot,
    singlePlayerScreenshot,
    loadReplayScreenshot,
    difficultyScreenshot,
    factionLogoScreenshot,
    archives: {
      window: windowArchiveMemfsPath,
      ini: iniArchiveMemfsPath,
      texture: englishArchiveMemfsPath,
      rulerTexture: textureArchiveMemfsPath,
    },
    originalPaths: repaintResult.probe.originalPaths,
    disabledButtonOriginalPaths: disabledButtonResult.probe.originalPaths,
    hiliteButtonOriginalPaths: hiliteButtonResult.probe.originalPaths,
    pushedButtonOriginalPaths: pushedButtonResult.probe.originalPaths,
    singlePlayerOriginalPaths: singlePlayerResult.probe.originalPaths,
    loadReplayOriginalPaths: loadReplayResult.probe.originalPaths,
    difficultyOriginalPaths: difficultyResult.probe.originalPaths,
    factionLogoOriginalPaths: factionLogoResult.probe.originalPaths,
    layout: repaintResult.probe.layout,
    image: repaintResult.probe.image,
    rulerImage: repaintResult.probe.rulerImage,
    buttonImages: repaintResult.probe.buttonImages,
    disabledButtonImages: disabledButtonResult.probe.disabledButtonImages,
    disabledButtonLayout: disabledButtonResult.probe.layout.button,
    disabledButtonImageDrawNames: disabledButtonResult.probe.display.imageDrawNames,
    hiliteButtonImages: hiliteButtonResult.probe.hiliteButtonImages,
    hiliteButtonLayout: hiliteButtonResult.probe.layout.button,
    hiliteButtonImageDrawNames: hiliteButtonResult.probe.display.imageDrawNames,
    pushedButtonImages: pushedButtonResult.probe.pushedButtonImages,
    pushedButtonLayout: pushedButtonResult.probe.layout.button,
    pushedButtonImageDrawNames: pushedButtonResult.probe.display.imageDrawNames,
    gameText: repaintResult.probe.gameText,
    difficultyGameText: difficultyResult.probe.gameText,
    texture: repaintResult.probe.texture,
    rulerTexture: repaintResult.probe.rulerTexture,
    calls: repaintResult.probe.calls,
    draw: repaintResult.probe.draw,
    logoPixels: repaintResult.logoPixels,
    rulerPixels: repaintResult.rulerPixels,
    buttonPixels: repaintResult.buttonPixels,
    buttonRegion: repaintResult.buttonRegion,
    buttonTextRegion: repaintResult.buttonTextRegion,
    disabledButtonRegion: disabledButtonResult.buttonRegion,
    disabledButtonTextRegion: disabledButtonResult.buttonTextRegion,
    hiliteButtonRegion: hiliteButtonResult.buttonRegion,
    hiliteButtonTextRegion: hiliteButtonResult.buttonTextRegion,
    pushedButtonRegion: pushedButtonResult.buttonRegion,
    pushedButtonTextRegion: pushedButtonResult.buttonTextRegion,
    extraButtons,
    extraButtonRegions: repaintResult.extraButtonRegions,
    singlePlayerDropdown: singlePlayerResult.probe.layout.singlePlayerDropdown,
    singlePlayerEarthMap: singlePlayerResult.probe.layout.singlePlayerEarthMap,
    singlePlayerButtons,
    singlePlayerButtonRegions: singlePlayerResult.singlePlayerButtonRegions,
    loadReplayDropdown: loadReplayResult.probe.layout.loadReplayDropdown,
    loadReplayButtons,
    loadReplayButtonRegions: loadReplayResult.loadReplayButtonRegions,
    difficultyDropdown: difficultyResult.probe.layout.difficultyDropdown,
    difficultyEarthMap: difficultyResult.probe.layout.difficultyEarthMap,
    difficultyButtons,
    difficultyButtonRegions: difficultyResult.difficultyButtonRegions,
    factionLogos,
    factionLogoRegions: factionLogoResult.factionLogoRegions,
    staticText: staticTextResult.probe.layout.staticText,
    staticTextRegion: staticTextResult.staticTextRegion,
    difficultyStaticText: difficultyResult.probe.layout.staticText,
    difficultyStaticTextRegion: difficultyResult.staticTextRegion,
    coloredLogoPixelCount: repaintResult.coloredLogoPixelCount,
    coloredRulerPixelCount: repaintResult.coloredRulerPixelCount,
    coloredButtonPixelCount: repaintResult.coloredButtonPixelCount,
    staticTextColoredLogoPixelCount: staticTextResult.coloredLogoPixelCount,
    staticTextColoredRulerPixelCount: staticTextResult.coloredRulerPixelCount,
    difficultyColoredLogoPixelCount: difficultyResult.coloredLogoPixelCount,
    difficultyColoredRulerPixelCount: difficultyResult.coloredRulerPixelCount,
    factionLogoColoredLogoPixelCount: factionLogoResult.coloredLogoPixelCount,
    factionLogoColoredRulerPixelCount: factionLogoResult.coloredRulerPixelCount,
    renderer: "WindowLayout::load MainMenu.wnd from WindowZH.big through parseDrawData mapped image bindings, W3DGameWinDefaultDraw, W3DDisplay::drawImage, TextureClass, and browser D3D8/WebGL2 bridge",
    browserEventCount: browserEvents.length,
  }));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
