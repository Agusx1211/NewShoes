#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(wasmRoot, "..");
const worldBuilderRoot = resolve(
  repositoryRoot,
  "GeneralsMD/Code/Tools/WorldBuilder",
);
const resourcePath = resolve(worldBuilderRoot, "res/WorldBuilder.rc");
const resourceHeaderPath = resolve(worldBuilderRoot, "res/resource.h");
const projectPath = resolve(worldBuilderRoot, "WorldBuilder.dsp");
const defaultOutputPath = resolve(
  wasmRoot,
  "world-builder/original-parity-inventory.json",
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function resolveOriginalPath(root, path) {
  const requested = normalizedPath(path);
  let current = root;
  const resolvedParts = [];
  let caseExact = true;
  for (const part of requested.split("/")) {
    if (!existsSync(current)) return { exists: false, caseExact: false, resolvedPath: requested };
    const entries = readdirSync(current);
    const exact = entries.find((entry) => entry === part);
    const resolved = exact ?? entries.find((entry) => entry.toLowerCase() === part.toLowerCase());
    if (!resolved) return { exists: false, caseExact: false, resolvedPath: requested };
    if (resolved !== part) caseExact = false;
    resolvedParts.push(resolved);
    current = resolve(current, resolved);
  }
  return {
    exists: true,
    caseExact,
    resolvedPath: resolvedParts.join("/"),
  };
}

function parseDefines(source) {
  const values = {};
  for (const match of source.matchAll(
    /^#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(-?(?:0x[0-9a-f]+|\d+))\b/gmi,
  )) {
    values[match[1]] = Number.parseInt(match[2], 0);
  }
  return values;
}

function parseProjectSources(source) {
  return [...source.matchAll(/^SOURCE=(.+)$/gmi)]
    .map((match) => normalizedPath(match[1].trim()))
    .filter((path) => /^(?:src|include)\//i.test(path))
    .map((path) => ({ path, ...resolveOriginalPath(worldBuilderRoot, path) }));
}

function blockKind(line) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+(DIALOG(?:EX)?|MENU|TOOLBAR|ACCELERATORS)\b/i.exec(line);
  return match ? { id: match[1], kind: match[2].toUpperCase() } : null;
}

function collectBlocks(lines) {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const declaration = blockKind(lines[index].trim());
    if (!declaration) continue;
    const body = [];
    let began = false;
    let depth = 0;
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      if (trimmed === "BEGIN") {
        began = true;
        depth += 1;
      } else if (trimmed === "END" && began) {
        depth -= 1;
        if (depth === 0) break;
      }
      if (began) body.push(line);
    }
    blocks.push({ ...declaration, lines: body });
  }
  return blocks;
}

function unquote(value) {
  return String(value || "")
    .trim()
    .replace(/^"|"$/g, "")
    .replaceAll('""', '"');
}

function parseMenu(block, defines) {
  const commands = [];
  const popups = [];
  let pendingPopup = null;
  let depth = 0;
  for (const rawLine of block.lines) {
    const line = rawLine.trim();
    const popup = /^POPUP\s+("(?:""|[^"])*")/i.exec(line);
    if (popup) {
      pendingPopup = unquote(popup[1]);
      continue;
    }
    if (line === "BEGIN") {
      depth += 1;
      if (pendingPopup !== null) {
        popups.push(pendingPopup);
        pendingPopup = null;
      }
      continue;
    }
    if (line === "END") {
      if (depth > 0) {
        depth -= 1;
        popups.pop();
      }
      continue;
    }
    const item = /^MENUITEM\s+("(?:""|[^"])*")\s*,\s*([A-Za-z_][A-Za-z0-9_]*)/i.exec(line);
    if (!item) continue;
    const id = item[2];
    commands.push({
      id,
      value: defines[id] ?? null,
      label: unquote(item[1]),
      path: [...popups],
    });
  }
  return { id: block.id, commands };
}

function parseToolbar(block, defines) {
  const buttons = [];
  for (const rawLine of block.lines) {
    const match = /^\s*BUTTON\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(rawLine);
    if (!match) continue;
    buttons.push({
      id: match[1],
      value: defines[match[1]] ?? null,
    });
  }
  return { id: block.id, buttons };
}

function parseAccelerators(block, defines) {
  const entries = [];
  for (const rawLine of block.lines) {
    const match = /^\s*(?:"(?:""|[^"])*"|VK_[A-Za-z0-9_]+)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*,?\s*(.*)$/i.exec(
      rawLine,
    );
    if (!match) continue;
    const key = rawLine.slice(0, rawLine.indexOf(",")).trim();
    entries.push({
      id: match[1],
      value: defines[match[1]] ?? null,
      key: unquote(key),
      flags: match[2].split(",").map((flag) => flag.trim()).filter(Boolean),
    });
  }
  return { id: block.id, entries };
}

const controlKeywords = new Set([
  "AUTO3STATE",
  "AUTOCHECKBOX",
  "AUTORADIOBUTTON",
  "CHECKBOX",
  "COMBOBOX",
  "CONTROL",
  "CTEXT",
  "DEFPUSHBUTTON",
  "EDITTEXT",
  "GROUPBOX",
  "ICON",
  "LISTBOX",
  "LTEXT",
  "PUSHBUTTON",
  "RADIOBUTTON",
  "RTEXT",
  "SCROLLBAR",
  "STATE3",
]);

function parseDialogControl(line, defines) {
  const keywordMatch = /^\s*([A-Z][A-Z0-9_]*)\s+(.+)$/i.exec(line);
  if (!keywordMatch || !controlKeywords.has(keywordMatch[1].toUpperCase())) return null;
  const keyword = keywordMatch[1].toUpperCase();
  const rest = keywordMatch[2];
  const directId = new Set(["COMBOBOX", "EDITTEXT", "LISTBOX", "SCROLLBAR"]);
  const idMatch = directId.has(keyword)
    ? /^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest)
    : /,\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
  if (!idMatch) return null;
  const id = idMatch[1];
  return {
    kind: keyword,
    id,
    value: defines[id] ?? null,
  };
}

function parseDialog(block, defines) {
  const controls = [];
  let caption = "";
  for (const rawLine of block.lines) {
    const captionMatch = /^\s*CAPTION\s+("(?:""|[^"])*")/i.exec(rawLine);
    if (captionMatch) caption = unquote(captionMatch[1]);
    const control = parseDialogControl(rawLine, defines);
    if (control) controls.push(control);
  }
  return {
    id: block.id,
    value: defines[block.id] ?? null,
    caption,
    controls,
  };
}

function parseFileResources(lines, defines) {
  const resources = [];
  for (const rawLine of lines) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+(BITMAP|CURSOR|ICON)\s+(?:[A-Z]+\s+)*"([^"]+)"/i.exec(
      rawLine,
    );
    if (!match) continue;
    const path = normalizedPath(match[3]);
    resources.push({
      id: match[1],
      value: defines[match[1]] ?? null,
      kind: match[2].toUpperCase(),
      path,
      ...resolveOriginalPath(resolve(worldBuilderRoot, "res"), path),
    });
  }
  return resources;
}

function splitMacroArguments(value) {
  const argumentsList = [];
  let current = "";
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      argumentsList.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) argumentsList.push(current.trim());
  return argumentsList;
}

function parseMessageMaps(sourceFiles) {
  const maps = [];
  for (const sourceFile of sourceFiles) {
    if (!sourceFile.path.toLowerCase().endsWith(".cpp") || !sourceFile.exists) continue;
    const source = readFileSync(resolve(worldBuilderRoot, sourceFile.resolvedPath), "utf8");
    for (const mapMatch of source.matchAll(
      /BEGIN_MESSAGE_MAP\s*\(\s*([^,]+)\s*,\s*([^)]+)\)([\s\S]*?)END_MESSAGE_MAP\s*\(\s*\)/g,
    )) {
      const bindings = [];
      for (const rawLine of mapMatch[3].split(/\r?\n/)) {
        const line = rawLine.replace(/\/\/.*$/, "").trim();
        const binding = /^(ON_[A-Z0-9_]+)\s*\((.*)\)\s*$/.exec(line);
        if (!binding) continue;
        bindings.push({
          macro: binding[1],
          arguments: splitMacroArguments(binding[2]),
        });
      }
      maps.push({
        className: mapMatch[1].trim(),
        baseClass: mapMatch[2].trim(),
        source: sourceFile.path,
        bindings,
      });
    }
  }
  return maps;
}

export function buildWorldBuilderInventory() {
  const resourceSource = readFileSync(resourcePath, "utf8");
  const resourceHeaderSource = readFileSync(resourceHeaderPath, "utf8");
  const projectSource = readFileSync(projectPath, "utf8");
  const defines = parseDefines(resourceHeaderSource);
  const sourceFiles = parseProjectSources(projectSource);
  const resourceLines = resourceSource.split(/\r?\n/);
  const blocks = collectBlocks(resourceLines);
  const menus = blocks.filter((block) => block.kind === "MENU")
    .map((block) => parseMenu(block, defines));
  const toolbars = blocks.filter((block) => block.kind === "TOOLBAR")
    .map((block) => parseToolbar(block, defines));
  const accelerators = blocks.filter((block) => block.kind === "ACCELERATORS")
    .map((block) => parseAccelerators(block, defines));
  const dialogs = blocks.filter((block) => block.kind.startsWith("DIALOG"))
    .map((block) => parseDialog(block, defines));
  const fileResources = parseFileResources(resourceLines, defines);
  const messageMaps = parseMessageMaps(sourceFiles);
  const menuCommands = menus.flatMap((menu) => menu.commands);
  const toolbarButtons = toolbars.flatMap((toolbar) => toolbar.buttons);
  const acceleratorEntries = accelerators.flatMap((table) => table.entries);
  const dialogControls = dialogs.flatMap((dialog) => dialog.controls);
  const messageBindings = messageMaps.flatMap((map) => map.bindings);

  return {
    schema: "project-new-shoes/original-world-builder-parity/v1",
    authoritativeSources: {
      project: relative(repositoryRoot, projectPath),
      projectSha256: sha256(projectSource),
      resource: relative(repositoryRoot, resourcePath),
      resourceSha256: sha256(resourceSource),
      resourceHeader: relative(repositoryRoot, resourceHeaderPath),
      resourceHeaderSha256: sha256(resourceHeaderSource),
    },
    summary: {
      projectFiles: sourceFiles.length,
      cppFiles: sourceFiles.filter((file) => file.path.toLowerCase().endsWith(".cpp")).length,
      headerFiles: sourceFiles.filter((file) => file.path.toLowerCase().endsWith(".h")).length,
      menus: menus.length,
      menuCommands: menuCommands.length,
      toolbars: toolbars.length,
      toolbarButtons: toolbarButtons.length,
      acceleratorTables: accelerators.length,
      acceleratorEntries: acceleratorEntries.length,
      dialogs: dialogs.length,
      dialogControls: dialogControls.length,
      fileResources: fileResources.length,
      caseMismatchedPaths: [
        ...sourceFiles,
        ...fileResources,
      ].filter((file) => file.exists && !file.caseExact).length,
      messageMaps: messageMaps.length,
      messageBindings: messageBindings.length,
    },
    projectFiles: sourceFiles,
    menus,
    toolbars,
    accelerators,
    dialogs,
    fileResources,
    messageMaps,
  };
}

function serializedInventory() {
  return `${JSON.stringify(buildWorldBuilderInventory(), null, 2)}\n`;
}

const args = new Set(process.argv.slice(2));
if (args.has("--write")) {
  mkdirSync(dirname(defaultOutputPath), { recursive: true });
  writeFileSync(defaultOutputPath, serializedInventory());
  console.log(defaultOutputPath);
} else if (args.has("--check")) {
  if (!existsSync(defaultOutputPath)) {
    throw new Error(`Missing generated inventory: ${defaultOutputPath}`);
  }
  const expected = serializedInventory();
  const actual = readFileSync(defaultOutputPath, "utf8");
  if (actual !== expected) {
    throw new Error("Original World Builder parity inventory is stale; run npm run generate:world-builder-parity");
  }
  console.log(`Original World Builder parity inventory is current: ${defaultOutputPath}`);
} else if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(serializedInventory());
}
