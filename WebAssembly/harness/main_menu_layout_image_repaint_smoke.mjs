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
const staticTextScreenshot = resolve(
  screenshotDir,
  "harness-smoke-ww3d-main-menu-layout-static-text-repaint-canvas.png",
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
const logoMappedImageEntry =
  "Data\\INI\\MappedImages\\TextureSize_512\\SCSmShellUserInterface512.INI";
const mappedImageIniEntries = [
  "Data\\INI\\MappedImages\\HandCreated\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\HandCreatedMappedImages.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SAUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGameUserInterface512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeLoad512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeSelect512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCGenChallengeWinLoss512.INI",
  "Data\\INI\\MappedImages\\TextureSize_512\\SCLogosUserInterface512.INI",
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
          entries: [rulerTextureEntry],
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
      || rangeTextureArchive?.entryCount !== 1
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
      || rulerTextureArchiveEntry?.reader !== "browser fetch Range") {
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
    ["MainMenu.wnd:ButtonMultiplayer", "GUI:Multiplayer", 156],
    ["MainMenu.wnd:ButtonOptions", "GUI:Options", 236],
    ["MainMenu.wnd:ButtonCredits", "GUI:Credits", 276],
    ["MainMenu.wnd:ButtonExit", "GUI:Exit", 316],
  ];
  const extraButtons = repaintResult.probe?.layout?.extraButtons ?? [];
  const extraButtonsValid = expectedExtraButtons.every(([name, label, y], index) => {
    const button = extraButtons[index];
    const proof = repaintResult.extraButtonRegions?.[index];
    return button?.name === name
      && button?.drawFunc === "W3DGadgetPushButtonImageDraw"
      && button?.systemFunc === "GadgetPushButtonSystem"
      && button?.inputFunc === "GadgetPushButtonInput"
      && button?.x === 540
      && button?.y === y
      && button?.width === 208
      && button?.height === 36
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
      || repaintResult.probe?.results?.mappedImages < 5
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
      || repaintResult.probe?.calls?.displayImageDraws < 5
      || repaintResult.probe?.calls?.drawIndexed < 5
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
    staticTextScreenshot,
    archives: {
      window: windowArchiveMemfsPath,
      ini: iniArchiveMemfsPath,
      texture: englishArchiveMemfsPath,
      rulerTexture: textureArchiveMemfsPath,
    },
    originalPaths: repaintResult.probe.originalPaths,
    layout: repaintResult.probe.layout,
    image: repaintResult.probe.image,
    rulerImage: repaintResult.probe.rulerImage,
    buttonImages: repaintResult.probe.buttonImages,
    gameText: repaintResult.probe.gameText,
    texture: repaintResult.probe.texture,
    rulerTexture: repaintResult.probe.rulerTexture,
    calls: repaintResult.probe.calls,
    draw: repaintResult.probe.draw,
    logoPixels: repaintResult.logoPixels,
    rulerPixels: repaintResult.rulerPixels,
    buttonPixels: repaintResult.buttonPixels,
    buttonRegion: repaintResult.buttonRegion,
    buttonTextRegion: repaintResult.buttonTextRegion,
    extraButtons,
    extraButtonRegions: repaintResult.extraButtonRegions,
    staticText: staticTextResult.probe.layout.staticText,
    staticTextRegion: staticTextResult.staticTextRegion,
    coloredLogoPixelCount: repaintResult.coloredLogoPixelCount,
    coloredRulerPixelCount: repaintResult.coloredRulerPixelCount,
    coloredButtonPixelCount: repaintResult.coloredButtonPixelCount,
    staticTextColoredLogoPixelCount: staticTextResult.coloredLogoPixelCount,
    staticTextColoredRulerPixelCount: staticTextResult.coloredRulerPixelCount,
    renderer: "WindowLayout::load MainMenu.wnd from WindowZH.big through parseDrawData mapped image bindings, W3DGameWinDefaultDraw, W3DDisplay::drawImage, TextureClass, and browser D3D8/WebGL2 bridge",
    browserEventCount: browserEvents.length,
  }));
} finally {
  if (browser) {
    await browser.close();
  }
  await server.close();
}
