#!/usr/bin/env node

import { open, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { chromium } from "playwright";

import { startStaticServer } from "./static-server.mjs";

const harnessRoot = dirname(fileURLToPath(import.meta.url));
const wasmRoot = resolve(harnessRoot, "..");
const profileDir = String(process.env.WORLD_BUILDER_BROWSER_PROFILE ?? "").trim();
const archiveRoot = String(process.env.WORLD_BUILDER_ARCHIVE_ROOT ?? "").trim();
const serverPort = Number(process.env.WORLD_BUILDER_SERVER_PORT ?? 0);
const headless = process.env.WORLD_BUILDER_HEADLESS !== "0";
const timeoutMs = Number(process.env.WORLD_BUILDER_TIMEOUT_MS ?? 15 * 60 * 1000);
const terrainTimeoutMs = Number(
  process.env.WORLD_BUILDER_TERRAIN_TIMEOUT_MS ?? 60 * 1000,
);
const artifactRoot = resolve(
  process.env.WORLD_BUILDER_ARTIFACT_DIR ??
    join(wasmRoot, "artifacts/world-builder-runtime"),
);

if (!profileDir) {
  throw new Error("WORLD_BUILDER_BROWSER_PROFILE is required");
}
if (!archiveRoot) {
  throw new Error("WORLD_BUILDER_ARCHIVE_ROOT is required");
}
if (!Number.isSafeInteger(serverPort) || serverPort <= 0) {
  throw new Error("WORLD_BUILDER_SERVER_PORT must preserve the profile's OPFS origin");
}

const archiveSpecs = [
  ["INIZH.big", "INIZH.big"],
  ["EnglishZH.big", "EnglishZH.big"],
  ["WindowZH.big", "WindowZH.big"],
  ["MapsZH.big", "MapsZH.big"],
  ["MusicZH.big", "MusicZH.big"],
  ["GensecZH.big", "GensecZH.big"],
  ["TerrainZH.big", "TerrainZH.big"],
  ["TexturesZH.big", "TexturesZH.big"],
  ["W3DZH.big", "W3DZH.big"],
  ["W3DEnglishZH.big", "W3DEnglishZH.big"],
  ["SpeechZH.big", "SpeechZH.big"],
  ["SpeechEnglishZH.big", "SpeechEnglishZH.big"],
  ["AudioZH.big", "AudioZH.big"],
  ["AudioEnglishZH.big", "AudioEnglishZH.big"],
  ["ShadersZH.big", "ShadersZH.big"],
  ["ZZBase_INI.big", "INI.big"],
  ["LooseScripts.big", "LooseScripts.big"],
  ["ZZBase_English.big", "English.big"],
  ["ZZBase_Window.big", "Window.big"],
  ["ZZBase_Terrain.big", "Terrain.big"],
  ["ZZBase_Textures.big", "Textures.big"],
  ["ZZBase_W3D.big", "W3D.big"],
  ["ZZBase_Shaders.big", "Shaders.big"],
  ["ZZBase_Music.big", "base-generals/Music.big"],
  ["ZZBase_Audio.big", "base-generals/Audio.big"],
  ["ZZBase_AudioEnglish.big", "base-generals/AudioEnglish.big"],
  ["ZZBase_Speech.big", "base-generals/Speech.big"],
  ["ZZBase_SpeechEnglish.big", "base-generals/SpeechEnglish.big"],
  ["ZZBase_Maps.big", "base-generals/Maps.big"],
  ["Gensec.big", "Gensec.big"],
];

async function bigEntryCount(path) {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead !== header.length ||
        !["BIGF", "BIG4"].includes(header.subarray(0, 4).toString("ascii"))) {
      throw new Error(`${path} is not a supported BIG archive`);
    }
    return header.readUInt32BE(8);
  } finally {
    await file.close();
  }
}

const archives = await Promise.all(archiveSpecs.map(async ([name, sourceName]) => {
  const path = resolve(archiveRoot, sourceName);
  const metadata = await stat(path);
  return {
    name,
    bytes: metadata.size,
    entryCount: await bigEntryCount(path),
  };
}));

function expect(condition, message, details = null) {
  if (!condition) {
    throw new Error(`${message}${details == null ? "" : `: ${JSON.stringify(details)}`}`);
  }
}

function decodeScreenshot(png) {
  expect(
    png.subarray(0, 8).equals(Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])),
    "browser screenshot is not a PNG",
  );
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const compressed = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  expect(
    width > 0 && height > 0 && bitDepth === 8 && channels !== 0,
    "browser screenshot uses an unsupported PNG format",
    { width, height, bitDepth, colorType },
  );
  const packed = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  expect(
    packed.length === height * (stride + 1),
    "browser screenshot has unexpected scanline data",
    { actual: packed.length, expected: height * (stride + 1) },
  );
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  const pixels = Buffer.alloc(width * height * 3);
  const means = [0, 0, 0];
  const sums = [0, 0, 0];
  let brightInteriorPixels = 0;
  let nonBlackInteriorPixels = 0;
  let coloredInteriorPixels = 0;
  let count = 0;
  let input = 0;
  const paeth = (left, above, upperLeft) => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
      ? left
      : aboveDistance <= upperLeftDistance ? above : upperLeft;
  };
  for (let y = 0; y < height; ++y) {
    const filter = packed[input++];
    for (let x = 0; x < stride; ++x) {
      const raw = packed[input++];
      const left = x >= channels ? current[x - channels] : 0;
      const above = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : filter === 4 ? paeth(left, above, upperLeft) : null;
      expect(predictor != null, "browser screenshot has an unknown PNG filter", { filter });
      current[x] = (raw + predictor) & 0xff;
    }
    for (let x = 0; x < stride; x += channels) {
      count += 1;
      for (let channel = 0; channel < 3; ++channel) {
        const value = current[x + channel];
        pixels[(count - 1) * 3 + channel] = value;
        const delta = value - means[channel];
        means[channel] += delta / count;
        sums[channel] += delta * (value - means[channel]);
      }
      if (y >= Math.floor(height * 0.15)) {
        const red = current[x];
        const green = current[x + 1];
        const blue = current[x + 2];
        if (red >= 200 && green >= 200 && blue >= 200) {
          brightInteriorPixels += 1;
        }
        if (red + green + blue >= 72) {
          nonBlackInteriorPixels += 1;
        }
        if (Math.max(red, green, blue) - Math.min(red, green, blue) >= 6) {
          coloredInteriorPixels += 1;
        }
      }
    }
    current.copy(previous);
  }
  return {
    width,
    height,
    pixels,
    variation: Math.max(...sums.map((sum) => Math.sqrt(sum / count))),
    brightInteriorPixels,
    nonBlackInteriorPixels,
    coloredInteriorPixels,
  };
}

function screenshotDifference(firstPng, secondPng) {
  const first = decodeScreenshot(firstPng);
  const second = decodeScreenshot(secondPng);
  expect(
    first.width === second.width && first.height === second.height,
    "browser screenshots have different dimensions",
    {
      first: { width: first.width, height: first.height },
      second: { width: second.width, height: second.height },
    },
  );
  let changedPixels = 0;
  let absoluteDifference = 0;
  for (let offset = 0; offset < first.pixels.length; offset += 3) {
    const difference =
      Math.abs(first.pixels[offset] - second.pixels[offset]) +
      Math.abs(first.pixels[offset + 1] - second.pixels[offset + 1]) +
      Math.abs(first.pixels[offset + 2] - second.pixels[offset + 2]);
    absoluteDifference += difference;
    if (difference >= 24) changedPixels += 1;
  }
  return { changedPixels, absoluteDifference };
}

async function invokeMenuCommand(page, heading, commandId) {
  const menuHeading = page.locator(
    ".wb-main-frame .wb-menu-root > li > .wb-menu-heading",
    { hasText: heading },
  ).first();
  const command = menuHeading.locator("xpath=..").locator(
    `[data-command-id="${commandId}"]`,
  );
  await command.evaluate((button) => {
    for (
      let entry = button.closest("li");
      entry && entry.closest(".wb-menu-root");
      entry = entry.parentElement?.closest("li")
    ) {
      entry.classList.add("open");
    }
  });
  await command.waitFor({ state: "visible" });
  await command.click({ force: true });
}

async function invokeNonModalMenuCommand(page, heading, commandId) {
  const sequence = await page.evaluate(() =>
    globalThis.worldBuilderOriginalRuntimeState?.sequence ?? 0);
  await invokeMenuCommand(page, heading, commandId);
  await page.waitForFunction(({ after, command }) =>
    (globalThis.worldBuilderOriginalRuntimeState?.events ?? []).some(
      (event) =>
        event.sequence > after &&
        event.kind === 0 &&
        event.message === command,
    ), { after: sequence, command: commandId }, { timeout: 60000 });
}

async function readMenuCommandState(page, heading, commandId) {
  const menuHeading = page.locator(
    ".wb-main-frame .wb-menu-root > li > .wb-menu-heading",
    { hasText: heading },
  ).first();
  const command = menuHeading.locator("xpath=..").locator(
    `[data-command-id="${commandId}"]`,
  );
  const request = await command.evaluate((button) => {
    const frame = button.closest(".wb-main-frame");
    const key = `${frame?.dataset.windowId ?? "0"}:${button.dataset.commandId}`;
    const host =
      globalThis.worldBuilderModule?.worldBuilderMfcHost ??
      globalThis.Module?.worldBuilderMfcHost;
    host?.updateCommand(
      Number(frame?.dataset.windowId ?? "0"),
      Number(button.dataset.commandId),
    );
    return {
      key,
      token:
        globalThis.worldBuilderCommandStateProgress?.requested?.[key] ?? 0,
    };
  });
  let progress = null;
  const commandStateDeadline = Date.now() + 60000;
  while (Date.now() < commandStateDeadline) {
    progress = await page.evaluate(({ key }) => ({
      requested:
        globalThis.worldBuilderCommandStateProgress?.requested?.[key] ?? 0,
      completed:
        globalThis.worldBuilderCommandStateProgress?.completed?.[key] ?? 0,
      history: (globalThis.worldBuilderCommandStateHistory ?? [])
        .filter((entry) => `${entry.window}:${entry.command}` === key)
        .slice(-8),
    }), request);
    if (request.token > 0 && progress.completed >= request.token) break;
    await page.waitForTimeout(50);
  }
  expect(
    request.token > 0 && progress?.completed >= request.token,
    "the native command-state query did not complete",
    { request, progress },
  );
  const state = await command.evaluate((button) => {
    const commandDiagnostics = (
      globalThis.worldBuilderCommandStateHistory ?? []
    ).filter((entry) => entry.command === Number(button.dataset.commandId))
      .slice(-8);
    const latest = commandDiagnostics.at(-1);
    return {
      disabled: button.disabled,
      checked: button.classList.contains("checked"),
      handled: Boolean((latest?.state ?? 0) & 1),
      stateMask: latest?.state ?? 0,
      text: button.textContent,
      commandDiagnostics,
    };
  });
  return state;
}

async function auditOriginalMainMenuCommands(page) {
  const menuCommands = await page.evaluate(() =>
    [...document.querySelectorAll(
      ".wb-main-frame .wb-menu-root > li",
    )].flatMap((menu) => {
      const heading = menu.querySelector(":scope > .wb-menu-heading")
        ?.textContent ?? "";
      return [...menu.querySelectorAll("[data-command-id]")].map((command) => ({
        heading,
        commandId: Number(command.dataset.commandId),
        text: command.textContent,
      }));
    }));
  const originalUnboundCommands = new Set([
    32772, // The original 2D view only; the shipping app creates WbView3d.
    32927, // The original 2D view only; the shipping app creates WbView3d.
    33337, // Generate Report has no original message-map binding.
    57607, // Printing is only bound by the inactive original 2D view.
    57609, // Print Preview is only bound by the inactive original 2D view.
  ]);
  const evidence = [];
  for (const command of menuCommands) {
    console.log(
      "[world-builder-runtime] complete menu audit",
      command.heading,
      command.commandId,
    );
    const state = await readMenuCommandState(
      page,
      command.heading,
      command.commandId,
    );
    const expectedHandled = !originalUnboundCommands.has(command.commandId);
    expect(
      state.handled === expectedHandled &&
        (expectedHandled || state.disabled),
      `original menu command ${command.commandId} has the wrong native binding state`,
      { command, state, expectedHandled },
    );
    evidence.push({
      ...command,
      handled: state.handled,
      enabled: !state.disabled,
      checked: state.checked,
    });
  }
  expect(
    evidence.length >= 94 && evidence.length <= 97,
    "the complete native main-menu audit did not cover every original command",
    { count: evidence.length },
  );
  return evidence;
}

async function verifyToggleCommand(page, heading, commandId) {
  const before = await readMenuCommandState(page, heading, commandId);
  expect(!before.disabled, `${heading} command ${commandId} is disabled`, before);
  await invokeNonModalMenuCommand(page, heading, commandId);
  const toggled = await readMenuCommandState(page, heading, commandId);
  expect(
    toggled.checked !== before.checked,
    `${heading} command ${commandId} did not toggle`,
    { before, toggled },
  );
  await invokeNonModalMenuCommand(page, heading, commandId);
  const restored = await readMenuCommandState(page, heading, commandId);
  expect(
    restored.checked === before.checked,
    `${heading} command ${commandId} did not restore its original state`,
    { before, toggled, restored },
  );
  return { commandId, before: before.checked, toggled: toggled.checked };
}

async function verifyDialogCommand(
  page,
  { heading, commandId, resourceId, closeControlId = 2 },
) {
  const commandState = await readMenuCommandState(page, heading, commandId);
  expect(
    !commandState.disabled,
    `${heading} command ${commandId} is disabled`,
    commandState,
  );
  await invokeMenuCommand(page, heading, commandId);
  const dialog = page.locator(`.wb-dialog[data-resource-id="${resourceId}"]`);
  await dialog.waitFor({ state: "visible" });
  const evidence = await dialog.evaluate((element) => ({
    resourceId: Number(element.dataset.resourceId),
    title: element.querySelector(
      ":scope > .wb-titlebar .wb-title-text",
    )?.textContent ?? "",
    controls: element.querySelectorAll(".wb-control").length,
  }));
  expect(
    evidence.controls > 0,
    `dialog resource ${resourceId} has no original controls`,
    evidence,
  );
  const close = dialog.locator(`[data-control-id="${closeControlId}"]`);
  expect(
    await close.count() === 1,
    `dialog resource ${resourceId} has no close control ${closeControlId}`,
    evidence,
  );
  await close.click();
  await dialog.waitFor({ state: "hidden" });
  return evidence;
}

async function invokeToolbarCommand(page, commandId) {
  const button = page.locator(
    `.wb-main-frame .wb-toolbar [data-command-id="${commandId}"]`,
  );
  expect(await button.count() === 1, `toolbar command ${commandId} is missing`);
  expect(
    !await button.isDisabled(),
    `toolbar command ${commandId} is disabled`,
  );
  const sequence = await page.evaluate(() =>
    globalThis.worldBuilderOriginalRuntimeState?.sequence ?? 0);
  await button.click({ timeout: 60000 });
  await page.waitForFunction(({ after, command }) =>
    (globalThis.worldBuilderOriginalRuntimeState?.events ?? []).some(
      (event) =>
        event.sequence > after &&
        event.kind === 0 &&
        event.message === command,
    ), { after: sequence, command: commandId }, { timeout: 60000 });
  return button.getAttribute("aria-label");
}

async function prepareInstalledLibrary(page) {
  const setup = await page.evaluate(async (inputs) => {
    const installName = "install-world-builder-runtime";
    const installRoot = `cnc-library/${installName}`;
    const root = await navigator.storage.getDirectory();
    const directory = async (path, create = false) => {
      let current = root;
      for (const part of String(path).split("/").filter(Boolean)) {
        current = await current.getDirectoryHandle(part, { create });
      }
      return current;
    };
    const validate = async (candidate) => {
      for (const input of inputs) {
        try {
          const file = await (await candidate.getFileHandle(input.name)).getFile();
          if (file.size !== input.bytes) return false;
        } catch {
          return false;
        }
      }
      return true;
    };

    let installed = null;
    try {
      installed = await directory(installRoot);
      if (!await validate(installed)) installed = null;
    } catch {
      installed = null;
    }

    let sourcePath = null;
    if (!installed) {
      const archiveNamespaces = await directory("cnc-archives");
      for await (const [namespace, handle] of archiveNamespaces.entries()) {
        if (handle.kind !== "directory") continue;
        const candidates = [
          `cnc-archives/${namespace}/assets/real-init`,
          `cnc-archives/${namespace}/assets/runtime-frame-profile`,
        ];
        for (const candidatePath of candidates) {
          try {
            const candidate = await directory(candidatePath);
            if (await validate(candidate)) {
              sourcePath = candidatePath;
              break;
            }
          } catch {
          }
        }
        if (sourcePath) break;
      }
      if (!sourcePath) {
        throw new Error("No complete retail archive set exists in this profile's OPFS");
      }
      const library = await directory("cnc-library", true);
      try {
        await library.removeEntry(installName, { recursive: true });
      } catch {
      }
      installed = await directory(installRoot, true);
    }
    return { installRoot, sourcePath };
  }, archives);

  if (setup.sourcePath) {
    for (const [index, archive] of archives.entries()) {
      process.stdout.write(
        `[world-builder-runtime] installing ${index + 1}/${archives.length} ${archive.name}\n`,
      );
      await page.evaluate(async ({ sourcePath, installRoot, archive: input }) => {
        const root = await navigator.storage.getDirectory();
        const directory = async (path) => {
          let current = root;
          for (const part of String(path).split("/").filter(Boolean)) {
            current = await current.getDirectoryHandle(part);
          }
          return current;
        };
        const source = await directory(sourcePath);
        const target = await directory(installRoot);
        const sourceFile = await (await source.getFileHandle(input.name)).getFile();
        const targetHandle = await target.getFileHandle(input.name, { create: true });
        const existing = await targetHandle.getFile();
        if (existing.size === input.bytes) return;
        const writable = await targetHandle.createWritable();
        await sourceFile.stream().pipeTo(writable);
      }, { sourcePath: setup.sourcePath, installRoot: setup.installRoot, archive });
    }
  }

  return page.evaluate(({ installRoot, archives: inputs }) => {
    const installed = {
      version: 5,
      game: "zeroHour",
      root: installRoot,
      archives: inputs.map((archive) => ({
        ...archive,
        opfsPath: `${installRoot}/${archive.name}`,
      })),
      videos: [],
      cursorAsset: null,
      includeVideos: false,
      totalBytes: inputs.reduce((total, archive) => total + archive.bytes, 0),
    };
    localStorage.setItem("zeroh-installed-library.v5", JSON.stringify(installed));
    return installed;
  }, { installRoot: setup.installRoot, archives });
}

await mkdir(artifactRoot, { recursive: true });
const server = await startStaticServer({
  root: wasmRoot,
  port: serverPort,
  host: "0.0.0.0",
});
let context;
try {
  context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1440, height: 1000 },
    args: ["--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const pages = context.pages();
  const page = pages[0] ?? await context.newPage();
  for (const extra of pages.slice(1)) await extra.close();
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);
  let rejectRuntimeError;
  const runtimeError = new Promise((_, reject) => {
    rejectRuntimeError = reject;
  });
  page.on("console", (message) => {
    void Promise.all(message.args().map((argument) => argument.jsonValue()))
      .then((arguments_) => {
        const details = arguments_.length > 1
          ? ` ${JSON.stringify(arguments_.slice(1))}`
          : "";
        process.stdout.write(
          `[world-builder page:${message.type()}] ${message.text()}${details}\n`,
        );
      })
      .catch(() => {
        process.stdout.write(
          `[world-builder page:${message.type()}] ${message.text()}\n`,
        );
      });
  });
  page.on("pageerror", (error) => {
    process.stderr.write(`[world-builder pageerror] ${error.stack ?? error.message}\n`);
    rejectRuntimeError(error);
  });

  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  const installed = await prepareInstalledLibrary(page);
  process.stdout.write(
    `[world-builder-runtime] prepared ${installed.archives.length} archives\n`,
  );

  const worldBuilderUrl = new URL("harness/world-builder.html", server.url);
  worldBuilderUrl.searchParams.set("graphicsDiagnostics", "1");
  await page.goto(worldBuilderUrl.href, {
    waitUntil: "domcontentloaded",
  });
  const eula = page.locator('.wb-dialog[data-resource-id="231"]');
  await Promise.race([eula.waitFor({ state: "visible" }), runtimeError]);
  const eulaEvidence = await eula.evaluate((dialog) => ({
    title: dialog.querySelector(".wb-title-text")?.textContent ?? "",
    textLength: dialog.querySelector("textarea")?.value.length ?? 0,
    buttons: [...dialog.querySelectorAll("button")].map((button) => button.textContent),
    bounds: (() => {
      const { x, y, width, height } = dialog.getBoundingClientRect();
      return { x, y, width, height };
    })(),
  }));
  expect(eulaEvidence.title === "EA TOOLS END USER LICENSE",
    "the original EULA dialog did not open", eulaEvidence);
  expect(eulaEvidence.textLength > 1000,
    "the original EULA text was not populated", eulaEvidence);
  await page.screenshot({
    path: join(artifactRoot, "original-eula.png"),
    fullPage: true,
  });
  await eula.getByRole("button", { name: "Accept Terms" }).click();

  await Promise.race([
    page.waitForFunction(
      () => document.documentElement.dataset.worldBuilderReady === "true" ||
        document.documentElement.dataset.worldBuilderReady === "false",
    ),
    runtimeError,
  ]);
  const status = await page.locator("[data-world-builder-status]").textContent();
  expect(
    await page.evaluate(() =>
      document.documentElement.dataset.worldBuilderReady === "true"),
    "the original World Builder did not reach its running state",
    { status },
  );

  const mainEvidence = await page.evaluate(() => ({
    title: document.querySelector(".wb-main-frame > .wb-titlebar")?.textContent ?? "",
    menuHeadings: [...document.querySelectorAll(
      ".wb-main-frame .wb-menu-root > li > .wb-menu-heading",
    )].map((button) => button.textContent),
    menuCommands: document.querySelectorAll(
      ".wb-main-frame .wb-menubar [data-command-id]",
    ).length,
    toolbarButtons: document.querySelectorAll(".wb-toolbar button").length,
    dialogs: document.querySelectorAll(".wb-dialog:not([hidden])").length,
    canvases: document.querySelectorAll(".wb-main-frame canvas").length,
    windows: [...(globalThis.worldBuilderModule?.worldBuilderMfcHost?.windows?.values?.()
      ?? [])]
      .filter((record) =>
        record.visible && record.element?.matches?.(".wb-window"))
      .map((record) => {
        const { x, y, width, height } = record.element.getBoundingClientRect();
        return {
          id: record.id,
          parent: record.parent,
          resourceId: record.resourceId,
          className: record.className,
          title: record.text,
          rect: record.rect,
          bounds: { x, y, width, height },
        };
      }),
  }));
  expect(mainEvidence.title.includes("Command & Conquer Generals World Builder"),
    "the original main frame was not created", mainEvidence);
  expect(
    JSON.stringify(mainEvidence.menuHeadings) === JSON.stringify([
      "File",
      "Edit",
      "View",
      "Window",
      "Texture Sizing",
      "Validation",
      "Help",
    ]),
    "the main menu did not expose every original top-level menu",
    mainEvidence,
  );
  expect(
    mainEvidence.menuCommands >= 94 && mainEvidence.menuCommands <= 97,
    "the main menu is missing original commands", mainEvidence);
  expect(mainEvidence.toolbarButtons === 35,
    "the original main-frame toolbar is incomplete", mainEvidence);
  expect(mainEvidence.canvases >= 1,
    "the original editor view has no render surface", mainEvidence);

  for (const heading of mainEvidence.menuHeadings) {
    const button = page.locator(
      ".wb-main-frame .wb-menu-root > li > .wb-menu-heading",
      { hasText: heading },
    ).first();
    await button.click();
    const visibleCommands = await button.locator("xpath=..").locator(
      ".wb-menu-popup > li > button:not([hidden])",
    ).count();
    expect(visibleCommands > 0, `the ${heading} menu did not open`);
    await button.click();
  }

  const screenshotPath = join(artifactRoot, "original-main-frame.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const visibleVariation =
    decodeScreenshot(await readFile(screenshotPath)).variation;
  expect(visibleVariation > 15,
    "the rendered World Builder frame is visually blank", { visibleVariation });

  await invokeMenuCommand(page, "Help", 57664);
  const about = page.locator('.wb-dialog[data-resource-id="100"]');
  await Promise.race([about.waitFor({ state: "visible" }), runtimeError]);
  const aboutEvidence = await about.evaluate((dialog) => ({
    title: dialog.querySelector(".wb-title-text")?.textContent ?? "",
    text: dialog.textContent,
    bitmap: dialog.querySelector("img")?.getAttribute("src") ?? "",
  }));
  expect(
      aboutEvidence.title === "About Generals World Builder" &&
      aboutEvidence.text.includes("WorldBuilder Version 0.8") &&
      /^(?:data:image\/|blob:)/.test(aboutEvidence.bitmap),
    "the original About dialog is incomplete",
    aboutEvidence,
  );
  await page.screenshot({
    path: join(artifactRoot, "original-about.png"),
    fullPage: true,
  });
  await about.locator('[data-control-id="1"]').click();
  await about.waitFor({ state: "hidden" });

  const frameCountBeforeNew = await page.locator(".wb-main-frame").count();
  await invokeMenuCommand(page, "File", 57600);
  const newMap = page.locator('.wb-dialog[data-resource-id="133"]');
  await Promise.race([newMap.waitFor({ state: "visible" }), runtimeError]);
  for (const [controlId, value] of [
    [1008, "64"],
    [1003, "64"],
    [1004, "10"],
    [1002, "16"],
  ]) {
    await newMap.locator(`[data-control-id="${controlId}"]`).fill(value);
  }
  await newMap.locator('[data-control-id="1"]').click();
  await newMap.waitFor({ state: "hidden" });
  await page.waitForTimeout(500);
  const frameCountAfterNew = await page.locator(".wb-main-frame").count();
  expect(
    frameCountBeforeNew === 1 && frameCountAfterNew === 1,
    "File > New created a second SDI frame instead of reusing the original frame",
    { frameCountBeforeNew, frameCountAfterNew },
  );

  const view = page.locator(".wb-main-frame .wb-view-stack").first();
  const viewBounds = await view.boundingBox();
  expect(
    viewBounds && viewBounds.width >= 600 && viewBounds.height >= 400,
    "the real 3D editing view is not usable",
    viewBounds,
  );
  const initialDocumentState = await page.evaluate(() =>
    globalThis.worldBuilderOriginalRuntimeState?.latest ?? null);
  expect(
    initialDocumentState?.hasDocument === true &&
      initialDocumentState?.heightMap?.width > 0 &&
      initialDocumentState?.heightMap?.height > 0,
    "the original document did not expose a real height map",
    initialDocumentState,
  );
  const initialSaveState = await readMenuCommandState(page, "File", 57603);
  const initialUndoState = await readMenuCommandState(page, "Edit", 57643);
  expect(initialSaveState.disabled,
    "a new unchanged map incorrectly enables Save", initialSaveState);
  expect(initialUndoState.disabled,
    "a new unchanged map incorrectly enables Undo", initialUndoState);

  // These are persistent original view toggles. Drive them to the normal
  // filled, entire-map view before capturing pixels so a saved profile cannot
  // invert the test.
  const initialShowEntireState = await readMenuCommandState(page, "View", 32943);
  if (!initialShowEntireState.checked) {
    await invokeNonModalMenuCommand(page, "View", 32943);
  }
  const showEntireState = await readMenuCommandState(page, "View", 32943);
  expect(showEntireState.checked,
    "the original Show All of 3D Map command did not remain enabled",
    { initialShowEntireState, showEntireState });
  const initialWireframeState = await readMenuCommandState(
    page,
    "View",
    32934,
  );
  if (initialWireframeState.checked) {
    await invokeNonModalMenuCommand(page, "View", 32934);
  }
  const wireframeState = await readMenuCommandState(page, "View", 32934);
  expect(
    !wireframeState.checked,
    "the original Wireframe command did not remain disabled",
    { initialWireframeState, wireframeState },
  );
  const terrainDeadline = Date.now() + terrainTimeoutMs;
  const renderSurface = page.locator("#worldBuilderRenderCanvas");
  let terrainEvidence = null;
  let beforeEditSurface = null;
  let latestTerrainCandidate = null;
  while (Date.now() < terrainDeadline) {
    const candidate = await renderSurface.screenshot();
    latestTerrainCandidate = candidate;
    const evidence = decodeScreenshot(candidate);
    if (
      evidence.variation > 8 &&
      evidence.nonBlackInteriorPixels > 200000 &&
      evidence.coloredInteriorPixels > 50000
    ) {
      terrainEvidence = {
        variation: evidence.variation,
        brightInteriorPixels: evidence.brightInteriorPixels,
        nonBlackInteriorPixels: evidence.nonBlackInteriorPixels,
        coloredInteriorPixels: evidence.coloredInteriorPixels,
      };
      beforeEditSurface = candidate;
      break;
    }
    await page.waitForTimeout(250);
  }
  if (beforeEditSurface == null && latestTerrainCandidate != null) {
    await writeFile(
      join(artifactRoot, "new-map-initial-render-failure.png"),
      latestTerrainCandidate,
    );
    const graphicsDiagnostics = await page.evaluate(() =>
      globalThis.worldBuilderLastGraphicsDiagnostics ?? null);
    await writeFile(
      join(artifactRoot, "new-map-initial-render-failure.json"),
      `${JSON.stringify(graphicsDiagnostics, null, 2)}\n`,
    );
  }
  expect(
    beforeEditSurface != null,
    "the real 3D editing view did not present the new terrain",
    terrainEvidence,
  );

  const beforeEditPath = join(artifactRoot, "new-map-before-edit.png");
  const beforeEdit = await view.screenshot({ path: beforeEditPath });
  beforeEditSurface = await renderSurface.screenshot({
    path: join(artifactRoot, "new-map-before-edit-surface.png"),
  });

  const moundButton = page.locator('.wb-toolbar-button[aria-label="Mound"]');
  await moundButton.click();
  const moundOptions = page.locator('.wb-dialog[data-resource-id="144"]');
  await moundOptions.waitFor({ state: "visible" });
  for (const [controlId, value] of [
    [1037, "7"],
    [1010, "2"],
    [1005, "6"],
  ]) {
    await moundOptions.locator(`[data-control-id="${controlId}"]`).fill(value);
  }
  await page.waitForTimeout(100);
  await page.mouse.move(
    viewBounds.x + viewBounds.width * 0.5,
    viewBounds.y + viewBounds.height * 0.5,
  );
  await page.mouse.down();
  await page.mouse.move(
    viewBounds.x + viewBounds.width * 0.56,
    viewBounds.y + viewBounds.height * 0.53,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForFunction((initialHash) => {
    const latest = globalThis.worldBuilderOriginalRuntimeState?.latest;
    return latest?.kind === 4 &&
      latest.message === 0x0202 &&
      latest.modified === true &&
      latest.heightMap?.hash !== initialHash;
  }, initialDocumentState.heightMap.hash);
  const committedMoundState = await page.evaluate(() =>
    globalThis.worldBuilderOriginalRuntimeState?.latest ?? null);
  const immediateEditedSaveState = await readMenuCommandState(
    page,
    "File",
    57603,
  );

  let afterEditSurface = null;
  let moundPixelDifference = null;
  const moundFrameDeadline = Date.now() + 30000;
  while (Date.now() < moundFrameDeadline) {
    const candidate = await renderSurface.screenshot();
    const difference = screenshotDifference(beforeEditSurface, candidate);
    if (difference.changedPixels > 200) {
      afterEditSurface = candidate;
      moundPixelDifference = difference;
      break;
    }
    await page.waitForTimeout(100);
  }
  expect(
    afterEditSurface != null,
    "the committed original Mound edit did not reach the real render view",
    { committedMoundState, moundPixelDifference },
  );
  const afterEditPath = join(artifactRoot, "new-map-after-mound.png");
  const afterEdit = await view.screenshot({ path: afterEditPath });
  afterEditSurface = await renderSurface.screenshot({
    path: join(artifactRoot, "new-map-after-mound-surface.png"),
  });
  moundPixelDifference = screenshotDifference(
    beforeEditSurface,
    afterEditSurface,
  );
  const editedSaveState = await readMenuCommandState(page, "File", 57603);
  const editedUndoState = await readMenuCommandState(page, "Edit", 57643);
  const editedRedoState = await readMenuCommandState(page, "Edit", 57644);
  expect(!editedSaveState.disabled,
    "the original Mound transaction did not enable Save",
    {
      committedMoundState,
      immediateEditedSaveState,
      editedSaveState,
    });
  expect(!editedUndoState.disabled,
    "the original Mound transaction did not enable Undo", editedUndoState);
  expect(editedRedoState.disabled,
    "Redo was enabled before the original Mound transaction was undone",
    editedRedoState);

  const pointerButton = page.locator(
    '.wb-toolbar-button[aria-label="Select and Move"]',
  ).first();
  await pointerButton.click();
  await page.waitForFunction(() => {
    const latest = globalThis.worldBuilderOriginalRuntimeState?.latest;
    return latest?.kind === 0 &&
      latest.message === 32921 &&
      latest.tool?.mound === false;
  });
  const normalizedEditDeadline = Date.now() + 30000;
  while (Date.now() < normalizedEditDeadline) {
    const candidate = await renderSurface.screenshot();
    if (screenshotDifference(beforeEditSurface, candidate).changedPixels > 200) {
      afterEditSurface = candidate;
      break;
    }
    await page.waitForTimeout(100);
  }
  expect(
    screenshotDifference(beforeEditSurface, afterEditSurface).changedPixels >
      200,
    "the committed Mound terrain was not visible after leaving the tool",
  );
  await renderSurface.screenshot({
    path: join(artifactRoot, "new-map-after-mound-surface.png"),
  });

  await invokeMenuCommand(page, "Edit", 57643);
  await page.waitForFunction((initialHash) => {
    const latest = globalThis.worldBuilderOriginalRuntimeState?.latest;
    return latest?.kind === 0 &&
      latest.message === 57643 &&
      latest.modified === true &&
      latest.heightMap?.hash === initialHash;
  }, initialDocumentState.heightMap.hash);
  let undoSurface = null;
  const undoFrameDeadline = Date.now() + 30000;
  while (Date.now() < undoFrameDeadline) {
    const candidate = await renderSurface.screenshot();
    const baselineDifference = screenshotDifference(beforeEditSurface, candidate);
    const editDifference = screenshotDifference(afterEditSurface, candidate);
    if (baselineDifference.changedPixels < 100 &&
        editDifference.changedPixels > 200) {
      undoSurface = candidate;
      break;
    }
    await page.waitForTimeout(100);
  }
  expect(undoSurface != null,
    "Undo did not restore the original terrain in the real render view");
  const undoneUndoState = await readMenuCommandState(page, "Edit", 57643);
  const undoneRedoState = await readMenuCommandState(page, "Edit", 57644);
  expect(undoneUndoState.disabled,
    "Undo remained enabled after reverting the only edit", undoneUndoState);
  expect(!undoneRedoState.disabled,
    "Redo did not enable after reverting the Mound edit", undoneRedoState);

  await invokeMenuCommand(page, "Edit", 57644);
  await page.waitForFunction((editedHash) => {
    const latest = globalThis.worldBuilderOriginalRuntimeState?.latest;
    return latest?.kind === 0 &&
      latest.message === 57644 &&
      latest.modified === true &&
      latest.heightMap?.hash === editedHash;
  }, committedMoundState.heightMap.hash);
  let redoSurface = null;
  const redoFrameDeadline = Date.now() + 30000;
  while (Date.now() < redoFrameDeadline) {
    const candidate = await renderSurface.screenshot();
    const difference = screenshotDifference(beforeEditSurface, candidate);
    if (difference.changedPixels > 200) {
      redoSurface = candidate;
      break;
    }
    await page.waitForTimeout(100);
  }
  expect(redoSurface != null,
    "Redo did not restore the Mound edit in the real render view");
  const redoneUndoState = await readMenuCommandState(page, "Edit", 57643);
  const redoneRedoState = await readMenuCommandState(page, "Edit", 57644);
  expect(!redoneUndoState.disabled,
    "Undo did not re-enable after redoing the Mound edit", redoneUndoState);
  expect(redoneRedoState.disabled,
    "Redo remained enabled after replaying the only edit", redoneRedoState);

  console.log(
    "[world-builder-runtime] presentation",
    JSON.stringify(await page.evaluate(() => globalThis.worldBuilderPresentationStats)),
  );
  const overlayEvidence = await view.locator(".wb-view-overlay").evaluate((overlay) => {
    const context = overlay.getContext("2d");
    return {
      attributes: context?.getContextAttributes?.() ?? null,
      centerPixel: context
        ? [...context.getImageData(
          Math.floor(overlay.width / 2),
          Math.floor(overlay.height / 2),
          1,
          1,
        ).data]
        : null,
    };
  });
  console.log("[world-builder-runtime] overlay", JSON.stringify(overlayEvidence));
  await page.locator("#worldBuilderRenderCanvas").screenshot({
    path: join(artifactRoot, "new-map-render-surface.png"),
  });
  await view.locator(".wb-view-overlay").screenshot({
    path: join(artifactRoot, "new-map-overlay.png"),
  });
  expect(
    committedMoundState.modified === true &&
      committedMoundState.heightMap.hash !== initialDocumentState.heightMap.hash &&
      moundPixelDifference.changedPixels > 200 &&
      !beforeEdit.equals(afterEdit),
    "the original Mound tool did not visibly alter the real map view",
    {
      initialDocumentState,
      committedMoundState,
      moundPixelDifference,
    },
  );

  const mapName = `BrowserParity${Date.now()}`;
  console.log("[world-builder-runtime] opening the original Save Map dialog");
  await invokeMenuCommand(page, "File", 57603);
  const saveMap = page.locator('.wb-dialog[data-resource-id="167"]');
  await Promise.race([saveMap.waitFor({ state: "visible" }), runtimeError]);
  console.log("[world-builder-runtime] saving", mapName);
  await saveMap.locator('[data-control-id="1052"]').fill(mapName);
  await saveMap.locator('[data-control-id="1"]').click();
  await saveMap.waitFor({ state: "hidden" });
  await page.waitForFunction((editedHash) => {
    const latest = globalThis.worldBuilderOriginalRuntimeState?.latest;
    return latest?.kind === 0 &&
      latest.message === 57603 &&
      latest.modified === false &&
      latest.heightMap?.hash === editedHash;
  }, committedMoundState.heightMap.hash);
  console.log("[world-builder-runtime] original Save Map dialog closed");
  const mapPath = await page.evaluate((name) =>
    `${globalThis.worldBuilderModule.worldBuilderUserDataPath}/${name}/${name}.map`,
  mapName);
  try {
    await page.waitForFunction((path) => {
      try {
        return globalThis.worldBuilderModule.FS.stat(path).size > 1024;
      } catch {
        return false;
      }
    }, mapPath, { timeout: 30000 });
  } catch (error) {
    const saveDiagnostic = await page.evaluate(({ path, name }) => {
      const fs = globalThis.worldBuilderModule.FS;
      const inspect = (candidate) => {
        try {
          const metadata = fs.stat(candidate);
          return { path: candidate, size: metadata.size, mode: metadata.mode };
        } catch (failure) {
          return { path: candidate, error: String(failure) };
        }
      };
      const parent = path.slice(0, path.lastIndexOf("/"));
      return {
        expected: inspect(path),
        directory: inspect(parent),
        mapsEntries: (() => {
          try {
            return fs.readdir(globalThis.worldBuilderModule.worldBuilderUserDataPath);
          } catch (failure) {
            return [String(failure)];
          }
        })(),
        dialogs: [...document.querySelectorAll(".wb-dialog:not([hidden])")].map(
          (dialog) => ({
            resourceId: dialog.dataset.resourceId ?? "",
            title: dialog.querySelector(".wb-title-text")?.textContent ?? "",
            text: dialog.textContent,
          }),
        ),
        messageBoxes: [...document.querySelectorAll(".wb-message-box")].map(
          (box) => box.textContent,
        ),
        name,
      };
    }, { path: mapPath, name: mapName });
    throw new Error(
      `the original map serializer did not produce a usable file: ${
        JSON.stringify(saveDiagnostic)
      }`,
      { cause: error },
    );
  }
  console.log("[world-builder-runtime] serialized", mapPath);
  const savedMap = await page.evaluate((path) => {
    const module = globalThis.worldBuilderModule;
    const data = module.FS.readFile(path);
    return {
      path,
      bytes: data.byteLength,
      firstBytes: [...data.slice(0, 16)],
    };
  }, mapPath);
  expect(savedMap.bytes > 1024,
    "the original map serializer did not write a usable map", savedMap);
  const savedSaveState = await readMenuCommandState(page, "File", 57603);
  expect(savedSaveState.disabled,
    "Save remained enabled after the original serializer completed",
    savedSaveState);

  await invokeMenuCommand(page, "File", 57601);
  const openMap = page.locator('.wb-dialog[data-resource-id="166"]');
  await Promise.race([openMap.waitFor({ state: "visible" }), runtimeError]);
  const mapList = openMap.locator('[data-control-id="1051"]');
  await mapList.selectOption({ label: mapName });
  await openMap.locator('[data-control-id="1"]').click();
  await openMap.waitFor({ state: "hidden" });
  await page.waitForFunction((editedHash) => {
    const latest = globalThis.worldBuilderOriginalRuntimeState?.latest;
    return latest?.kind === 0 &&
      latest.message === 57601 &&
      latest.modified === false &&
      latest.heightMap?.hash === editedHash;
  }, committedMoundState.heightMap.hash);
  const reopenedDocumentState = await page.evaluate(() =>
    globalThis.worldBuilderOriginalRuntimeState?.latest ?? null);
  await page.waitForTimeout(250);
  const frameCountAfterOpen = await page.locator(".wb-main-frame").count();
  expect(frameCountAfterOpen === 1,
    "File > Open created a second SDI frame", { frameCountAfterOpen });
  await view.screenshot({
    path: join(artifactRoot, "reopened-real-map.png"),
  });
  const recentFileState = await readMenuCommandState(page, "File", 57616);
  expect(
    recentFileState.handled &&
      !recentFileState.disabled &&
      recentFileState.text.includes(mapName),
    "the original MFC recent-file menu did not remember the reopened map",
    recentFileState,
  );

  await page.evaluate(() => {
    globalThis.worldBuilderInterceptGameLaunch = true;
    globalThis.worldBuilderLastGameLaunch = null;
  });
  await invokeMenuCommand(page, "File", 32993);
  await page.waitForFunction(
    () => globalThis.worldBuilderLastGameLaunch?.url,
    null,
    { timeout: 60000 },
  );
  const jumpToGameEvidence = await page.evaluate(() => {
    const launch = globalThis.worldBuilderLastGameLaunch;
    const url = new URL(launch.url);
    return {
      mapPath: launch.mapPath,
      pathname: url.pathname,
      initialFile: url.searchParams.get("worldBuilderMap"),
      shellMap: url.searchParams.get("shellmap"),
      autostart: url.searchParams.get("autostart"),
    };
  });
  expect(
    jumpToGameEvidence.pathname.endsWith("/play.html") &&
      jumpToGameEvidence.initialFile === jumpToGameEvidence.mapPath &&
      jumpToGameEvidence.mapPath === mapPath &&
      jumpToGameEvidence.shellMap === "0" &&
      jumpToGameEvidence.autostart === "1",
    "Jump to Game did not hand the saved map to the real game launcher",
    jumpToGameEvidence,
  );
  await page.evaluate(() => {
    globalThis.worldBuilderInterceptReportDownload = true;
    globalThis.worldBuilderLastReport = null;
  });
  await invokeNonModalMenuCommand(page, "File", 33006);
  await page.waitForFunction(
    () => globalThis.worldBuilderLastReport?.bytes > 0,
  );
  const reportEvidence = await page.evaluate(() => {
    const report = globalThis.worldBuilderLastReport;
    const text = new TextDecoder().decode(
      globalThis.worldBuilderModule.FS.readFile(report.path),
    );
    return {
      ...report,
      hasDocumentHeader: text.includes("Dump of Doc Contents"),
      hasTeams: text.includes("Teams"),
      hasScripts: text.includes("Scripts"),
    };
  });
  expect(
    reportEvidence.bytes > 100 &&
      reportEvidence.path === `${mapPath}.txt` &&
      reportEvidence.hasDocumentHeader &&
      reportEvidence.hasTeams &&
      reportEvidence.hasScripts,
    "Dump Map To File did not publish the original C++ report",
    reportEvidence,
  );

  const toolbarCommands = [
    32958,
    32921,
    32962,
    32771,
    32900,
    32901,
    32791,
    32955,
    32986,
    32902,
    32792,
    32913,
    32903,
    32905,
    32922,
    32918,
    32937,
    32924,
    61467,
    33007,
    32979,
    32972,
    32964,
    32968,
    33330,
  ];
  const toolbarEvidence = [];
  for (const commandId of toolbarCommands) {
    console.log("[world-builder-runtime] toolbar audit", commandId);
    toolbarEvidence.push({
      commandId,
      label: await invokeToolbarCommand(page, commandId),
    });
  }
  console.log("[world-builder-runtime] toolbar audit reset", 32921);
  await invokeToolbarCommand(page, 32921);

  const inactiveToolbarState = await page.locator(
    '.wb-main-frame .wb-toolbar [data-command-id="32906"]',
  ).evaluate((button) => ({
    disabled: button.disabled,
    label: button.getAttribute("aria-label"),
  }));
  expect(
    inactiveToolbarState.disabled,
    "the original unbound Auto Edge In toolbar resource was enabled",
    inactiveToolbarState,
  );

  const inactive2dCommands = [];
  for (const commandId of [32772, 32927]) {
    console.log("[world-builder-runtime] inactive 2D audit", commandId);
    const state = await readMenuCommandState(page, "View", commandId);
    expect(
      state.disabled && !state.checked,
      `inactive original 2D command ${commandId} was not disabled`,
      state,
    );
    inactive2dCommands.push({ commandId, disabled: state.disabled });
  }

  const toggleCommands = [
    33342,
    32926,
    32966,
    32969,
    32976,
    33003,
    33004,
    33008,
    33009,
    33010,
    33326,
    33331,
    33012,
    33340,
    33346,
    33011,
    32934,
    32944,
    33339,
    32945,
    33335,
    32956,
    32939,
    32954,
  ];
  const toggleEvidence = [];
  for (const commandId of toggleCommands) {
    console.log("[world-builder-runtime] toggle audit", commandId);
    toggleEvidence.push(await verifyToggleCommand(page, "View", commandId));
  }

  const frameBarEvidence = [];
  for (const [commandId, selector] of [
    [0xe800, ".wb-toolbar"],
    [0xe801, ".wb-statusbar"],
  ]) {
    console.log("[world-builder-runtime] frame bar audit", commandId);
    const before = await page.locator(selector).isVisible();
    frameBarEvidence.push(
      await verifyToggleCommand(page, "View", commandId),
    );
    expect(
      await page.locator(selector).isVisible() === before,
      `frame bar ${commandId} did not return to its original visibility`,
    );
  }

  const filterEvidence = [];
  for (const commandId of [
    33001,
    32994,
    32995,
    32996,
    32997,
    32998,
    32999,
    33000,
    33002,
    33327,
    33341,
  ]) {
    console.log("[world-builder-runtime] selection filter audit", commandId);
    await invokeNonModalMenuCommand(page, "Edit", commandId);
    const state = await readMenuCommandState(page, "Edit", commandId);
    expect(
      state.checked,
      `object-selection filter ${commandId} did not become active`,
      state,
    );
    filterEvidence.push(commandId);
  }
  await invokeNonModalMenuCommand(page, "Edit", 33001);

  const dialogEvidence = [];
  for (const specification of [
    { heading: "File", commandId: 32917, resourceId: 133 },
    {
      heading: "Edit",
      commandId: 32957,
      resourceId: 152,
      closeControlId: 1,
    },
    {
      heading: "Edit",
      commandId: 32975,
      resourceId: 172,
      closeControlId: 1,
    },
    { heading: "Edit", commandId: 33325, resourceId: 221 },
    { heading: "Edit", commandId: 32978, resourceId: 188 },
    { heading: "Edit", commandId: 32970, resourceId: 170 },
    { heading: "View", commandId: 33343, resourceId: 230 },
  ]) {
    console.log(
      "[world-builder-runtime] modal dialog audit",
      specification.commandId,
      specification.resourceId,
    );
    dialogEvidence.push(await verifyDialogCommand(page, specification));
  }

  const modelessEvidence = [];
  for (const { heading, commandId, resourceId } of [
    { heading: "Edit", commandId: 32965, resourceId: 154 },
    { heading: "Edit", commandId: 33333, resourceId: 225 },
    { heading: "Edit", commandId: 32977, resourceId: 175 },
  ]) {
    console.log(
      "[world-builder-runtime] modeless dialog audit",
      commandId,
      resourceId,
    );
    await invokeNonModalMenuCommand(page, heading, commandId);
    const dialog = page.locator(
      `.wb-dialog[data-resource-id="${resourceId}"]`,
    );
    await dialog.waitFor({ state: "visible" });
    modelessEvidence.push(await dialog.evaluate((element) => ({
      resourceId: Number(element.dataset.resourceId),
      title: element.querySelector(
        ":scope > .wb-titlebar .wb-title-text",
      )?.textContent ?? "",
      controls: element.querySelectorAll(".wb-control").length,
    })));
    if (resourceId !== 175) {
      await dialog.getByRole("button", { name: "Close" }).click();
      await dialog.waitFor({ state: "hidden" });
    }
  }
  const scripts = page.locator('.wb-dialog[data-resource-id="175"]');
  await scripts.locator('[data-control-id="2"]').click({ force: true });
  await scripts.waitFor({ state: "hidden" });

  console.log("[world-builder-runtime] layers context-menu audit");
  const layersState = await readMenuCommandState(page, "View", 33015);
  console.log("[world-builder-runtime] layers initial state", layersState.checked);
  if (!layersState.checked) {
    await invokeNonModalMenuCommand(page, "View", 33015);
  }
  const layers = page.locator('.wb-dialog[data-resource-id="216"]');
  await layers.waitFor({ state: "visible" });
  console.log("[world-builder-runtime] layers visible");
  const layersEvidence = await layers.evaluate((element) => ({
    title: element.querySelector(
      ":scope > .wb-titlebar .wb-title-text",
    )?.textContent ?? "",
    treeItems: element.querySelectorAll('[role="treeitem"]').length,
  }));
  const initialLayerItems = layers.locator('[role="treeitem"]');
  const openLayerContextMenu = async (layer) => {
    await layer.evaluate((element) => {
      const row = element.querySelector(":scope > .wb-tree-row") ?? element;
      const bounds = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
        clientX: bounds.left + 8,
        clientY: bounds.top + bounds.height / 2,
        screenX: bounds.left + 8,
        screenY: bounds.top + bounds.height / 2,
      }));
    });
  };
  await openLayerContextMenu(initialLayerItems.first());
  const layerContextMenu = page.locator(".wb-context-menu");
  await layerContextMenu.waitFor({ state: "visible", timeout: 10000 });
  console.log("[world-builder-runtime] layers context menu visible");
  const insertLayerButton = layerContextMenu.getByRole("button", {
    name: "Insert New Layer",
  });
  const insertLayerHitTest = await insertLayerButton.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const target = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return {
      bounds: {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
      },
      hit: target === button || button.contains(target),
      hitClass: target?.className ?? "",
    };
  });
  expect(
    insertLayerHitTest.hit,
    "the original Layers List context menu was not pointer-accessible",
    insertLayerHitTest,
  );
  await insertLayerButton.click({ force: true, timeout: 10000 });
  console.log("[world-builder-runtime] layers insert command selected");
  const layerNameEditor = layers.locator('input[type="text"]').last();
  await layerNameEditor.waitFor({ state: "visible", timeout: 10000 });
  await layerNameEditor.fill("Browser Parity Layer");
  await layerNameEditor.press("Enter");
  const addedLayer = layers.getByRole("treeitem", {
    name: "Browser Parity Layer",
  });
  await addedLayer.waitFor({ state: "visible" });
  await page.waitForFunction((label) => {
    const item = [...document.querySelectorAll(
      '.wb-dialog[data-resource-id="216"] [role="treeitem"]',
    )].find((candidate) =>
      candidate.querySelector(":scope > .wb-tree-row > .wb-tree-label")
        ?.textContent === label);
    const bounds = item?.getBoundingClientRect();
    const visible = item && bounds && bounds.width > 0 && bounds.height > 0;
    const stability = globalThis.worldBuilderLayerTreeStability ??= {
      element: null,
      observations: 0,
    };
    if (stability.element === item && visible) {
      stability.observations += 1;
    } else {
      stability.element = visible ? item : null;
      stability.observations = visible ? 1 : 0;
    }
    return stability.observations >= 3;
  }, "Browser Parity Layer", { polling: 50, timeout: 10000 });
  console.log("[world-builder-runtime] layers insert/rename complete");
  await openLayerContextMenu(addedLayer);
  await layerContextMenu.waitFor({ state: "visible" });
  const mergeLayerMenu = layerContextMenu.locator("summary", {
    hasText: "Merge Layer into",
  });
  expect(
    await mergeLayerMenu.count() === 1,
    "the original dynamic Layers List merge menu was not created",
  );
  await mergeLayerMenu.click();
  const mergeTargets = await mergeLayerMenu.locator("xpath=..").getByRole(
    "button",
  ).allTextContents();
  expect(
    mergeTargets.some((label) => label.includes("Default Object Layer")),
    "the original Layers List merge menu has no real destination layers",
    mergeTargets,
  );
  await page.keyboard.press("Escape");
  await openLayerContextMenu(addedLayer);
  await layerContextMenu.waitFor({ state: "visible" });
  await layerContextMenu.getByRole("button", {
    name: "Delete Current Layer",
  }).click();
  await addedLayer.waitFor({ state: "detached" });
  console.log("[world-builder-runtime] layers delete complete");
  const layerContextEvidence = {
    insertedAndRenamed: true,
    mergeTargets,
    restoredTreeItems: await layers.locator('[role="treeitem"]').count(),
  };
  expect(
    layerContextEvidence.restoredTreeItems === layersEvidence.treeItems,
    "the Layers List context-menu insert/delete cycle did not restore the map",
    layerContextEvidence,
  );
  if (!layersState.checked) {
    await invokeNonModalMenuCommand(page, "View", 33015);
    await layers.waitFor({ state: "hidden" });
  }
  const completeMenuEvidence = await auditOriginalMainMenuCommands(page);
  const gamePage = await context.newPage();
  gamePage.setDefaultTimeout(timeoutMs);
  gamePage.setDefaultNavigationTimeout(timeoutMs);
  gamePage.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      process.stdout.write(
        `[jump-to-game page:${message.type()}] ${message.text()}\n`,
      );
    }
  });
  const gamePageErrors = [];
  gamePage.on("pageerror", (error) => {
    gamePageErrors.push(error.stack ?? error.message);
  });
  const gameUrl = new URL(jumpToGameEvidence.pathname, server.url);
  gameUrl.searchParams.set("worldBuilderMap", jumpToGameEvidence.mapPath);
  gameUrl.searchParams.set("shellmap", "0");
  gameUrl.searchParams.set("autostart", "1");
  gameUrl.searchParams.set("dist", "dist-world-builder");
  await gamePage.goto(gameUrl.href, { waitUntil: "domcontentloaded" });
  const gameInitTimeoutMs = Number(
    process.env.WORLD_BUILDER_GAME_INIT_TIMEOUT_MS ?? 600000,
  );
  const gameInitDeadline = Date.now() + gameInitTimeoutMs;
  let gameBootState = null;
  let nextGameBootReport = 0;
  while (Date.now() < gameInitDeadline) {
    gameBootState = await gamePage.evaluate(() => ({
      status: document.querySelector("#launchStatus")?.textContent ?? "",
      init: globalThis.CnCPort?.state?.realEngineInit ?? null,
    }));
    if (gameBootState.init?.frontier?.initReturned === true) break;
    if (Date.now() >= nextGameBootReport) {
      console.log(
        "[world-builder-runtime] Jump to Game boot",
        JSON.stringify({
          status: gameBootState.status,
          stepIndex: gameBootState.init?.frontier?.stepIndex,
          stepCount: gameBootState.init?.frontier?.stepCount,
          aborted: gameBootState.init?.aborted,
        }),
      );
      nextGameBootReport = Date.now() + 30000;
    }
    await gamePage.waitForTimeout(250);
  }
  expect(
    gameBootState?.init?.frontier?.initReturned === true,
    "the real game engine did not finish initializing the World Builder map",
    { gameBootState, gamePageErrors },
  );
  const gameInitEvidence = await gamePage.evaluate(() => {
    const init = globalThis.CnCPort.state.realEngineInit;
    return {
      locationSearch: globalThis.location.search,
      initReturned: init.frontier?.initReturned === true,
      requestedInitialFile: init.requestedInitialFile ?? "",
      workerRequestedInitialFile: init.workerRequestedInitialFile ?? "",
      commandLine: init.frontier?.commandLine ?? "",
      initialFile: init.frontier?.initialFile ?? "",
      aborted: init.aborted === true,
      abortMessage: init.abortMessage ?? "",
    };
  });
  expect(
    gameInitEvidence.initReturned &&
      !gameInitEvidence.aborted &&
      gameInitEvidence.requestedInitialFile === jumpToGameEvidence.mapPath &&
      gameInitEvidence.workerRequestedInitialFile === jumpToGameEvidence.mapPath &&
      gameInitEvidence.initialFile === jumpToGameEvidence.mapPath &&
      gameInitEvidence.commandLine.includes("-file") &&
      gameInitEvidence.commandLine.includes(jumpToGameEvidence.mapPath),
    "the real game engine did not receive the World Builder map",
    { gameInitEvidence, gamePageErrors },
  );
  let gameFrameEvidence = null;
  const gameDeadline = Date.now() + 180000;
  while (Date.now() < gameDeadline) {
    const result = await gamePage.evaluate(() =>
      globalThis.CnCPort.rpc("realEngineFrameSummary", { frames: 4 }));
    expect(
      result?.ok === true && result?.aborted === false,
      "the real game engine failed while loading the World Builder map",
      result,
    );
    gameFrameEvidence = result.frame;
    const gameplay = result.frame?.clientState?.gameplay ??
      result.frame?.gameplay;
    if (gameplay?.inGame === true && gameplay?.loadingMap === false) break;
    await gamePage.waitForTimeout(100);
  }
  const launchedGameplay = gameFrameEvidence?.clientState?.gameplay ??
    gameFrameEvidence?.gameplay;
  expect(
    launchedGameplay?.inGame === true &&
      launchedGameplay?.loadingMap === false &&
      Number(launchedGameplay?.logicFrame ?? -1) >= 0,
    "Jump to Game did not enter a real playable match with the edited map",
    { launchedGameplay, gamePageErrors },
  );
  await gamePage.locator("#viewport").screenshot({
    path: join(artifactRoot, "jump-to-game-real-map.png"),
  });
  const gameLaunchEvidence = {
    init: gameInitEvidence,
    gameplay: launchedGameplay,
    screenshot: join(artifactRoot, "jump-to-game-real-map.png"),
  };
  await gamePage.close();

  process.stdout.write(`${JSON.stringify({
    ok: true,
    status,
    eula: eulaEvidence,
    main: mainEvidence,
    visibleVariation,
    interactions: {
      about: aboutEvidence,
      frameCountBeforeNew,
      frameCountAfterNew,
      terrainEvidence,
      initialDocumentState,
      committedMoundState,
      moundPixelDifference,
      moundChangedPixels: moundPixelDifference.changedPixels,
      savedMap,
      reopenedDocumentState,
      frameCountAfterOpen,
      recentFileState,
      jumpToGameEvidence,
      reportEvidence,
      toolbarEvidence,
      inactiveToolbarState,
      inactive2dCommands,
      toggleEvidence,
      frameBarEvidence,
      filterEvidence,
      dialogEvidence,
      modelessEvidence,
      layersEvidence,
      layerContextEvidence,
      completeMenuEvidence,
      gameLaunchEvidence,
    },
    artifacts: artifactRoot,
  }, null, 2)}\n`);
} finally {
  if (context) {
    for (const page of context.pages()) {
      await page.evaluate(async () => {
        const module = globalThis.worldBuilderModule;
        const root = module?.worldBuilderUserDataPath;
        const fs = module?.FS;
        if (!root || !fs) return;
        const removeTree = (path) => {
          for (const name of fs.readdir(path)) {
            if (name === "." || name === "..") continue;
            const child = `${path}/${name}`;
            if (fs.isDir(fs.stat(child).mode)) removeTree(child);
            else fs.unlink(child);
          }
          fs.rmdir(path);
        };
        for (const name of fs.readdir(root)) {
          if (/^BrowserParity\d+$/.test(name)) {
            removeTree(`${root}/${name}`);
          }
        }
        if (fs.filesystems?.IDBFS) {
          await new Promise((resolve, reject) => {
            fs.syncfs(false, (error) => error ? reject(error) : resolve());
          });
        }
      }).catch(() => {});
    }
  }
  await context?.close();
  await server.close();
}
