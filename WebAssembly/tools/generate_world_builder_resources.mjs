#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const wasmRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(wasmRoot, "..");
const resourceRoot = resolve(
  repositoryRoot,
  "GeneralsMD/Code/Tools/WorldBuilder/res",
);
const resourcePath = resolve(resourceRoot, "WorldBuilder.rc");
const resourceHeaderPath = resolve(resourceRoot, "resource.h");
const outputPath = resolve(
  wasmRoot,
  "world-builder/original-resources.json",
);

const standardIds = {
  IDOK: 1,
  IDCANCEL: 2,
  IDABORT: 3,
  IDRETRY: 4,
  IDIGNORE: 5,
  IDYES: 6,
  IDNO: 7,
  IDCLOSE: 8,
  IDHELP: 9,
  IDC_STATIC: -1,
  ID_SEPARATOR: 0,
  ID_FILE_NEW: 0xe100,
  ID_FILE_OPEN: 0xe101,
  ID_FILE_CLOSE: 0xe102,
  ID_FILE_SAVE: 0xe103,
  ID_FILE_SAVE_AS: 0xe104,
  ID_FILE_PAGE_SETUP: 0xe105,
  ID_FILE_PRINT_SETUP: 0xe106,
  ID_FILE_PRINT: 0xe107,
  ID_FILE_PRINT_DIRECT: 0xe108,
  ID_FILE_PRINT_PREVIEW: 0xe109,
  ID_FILE_MRU_FILE1: 0xe110,
  ID_FILE_MRU_FILE2: 0xe111,
  ID_FILE_MRU_FILE3: 0xe112,
  ID_FILE_MRU_FILE4: 0xe113,
  ID_EDIT_CLEAR: 0xe120,
  ID_EDIT_COPY: 0xe122,
  ID_EDIT_CUT: 0xe123,
  ID_EDIT_PASTE: 0xe125,
  ID_EDIT_REPLACE: 0xe129,
  ID_EDIT_UNDO: 0xe12b,
  ID_EDIT_REDO: 0xe12c,
  ID_NEXT_PANE: 0xe150,
  ID_PREV_PANE: 0xe151,
  ID_APP_ABOUT: 0xe140,
  ID_APP_EXIT: 0xe141,
  ID_VIEW_TOOLBAR: 0xe800,
  ID_VIEW_STATUS_BAR: 0xe801,
  ID_INDICATOR_CAPS: 0xe700,
  ID_INDICATOR_NUM: 0xe701,
  ID_INDICATOR_SCRL: 0xe702,
};

const dialogControlKeywords = new Set([
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function parseDefines(source) {
  const values = { ...standardIds };
  for (const match of source.matchAll(
    /^#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+(-?(?:0x[0-9a-f]+|\d+))\b/gmi,
  )) {
    values[match[1]] = Number.parseInt(match[2], 0);
  }
  return values;
}

function unquote(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed;
  return trimmed.slice(1, -1)
    .replaceAll('""', '"')
    .replaceAll("\\r", "\r")
    .replaceAll("\\n", "\n")
    .replaceAll("\\t", "\t")
    .replaceAll("\\\\", "\\");
}

function splitCommaSeparated(value) {
  const fields = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        current += '""';
        index += 1;
        continue;
      }
      quoted = !quoted;
      current += character;
      continue;
    }
    if (character === "," && !quoted) {
      fields.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  fields.push(current.trim());
  return fields;
}

function numeric(value, defines) {
  const trimmed = String(value ?? "").trim();
  if (Object.hasOwn(defines, trimmed)) return defines[trimmed];
  if (/^-?(?:0x[0-9a-f]+|\d+)$/i.test(trimmed)) {
    return Number.parseInt(trimmed, 0);
  }
  return null;
}

function findResourceBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  const declarationPattern =
    /^([A-Za-z_][A-Za-z0-9_]*)\s+(DIALOG(?:EX)?|MENU|TOOLBAR|ACCELERATORS)\b(.*)$/i;
  for (let index = 0; index < lines.length; index += 1) {
    const declaration = declarationPattern.exec(lines[index].trim());
    if (!declaration) continue;
    const header = [];
    const body = [];
    let began = false;
    let depth = 0;
    for (index += 1; index < lines.length; index += 1) {
      const rawLine = lines[index];
      const line = rawLine.trim();
      if (line === "BEGIN") {
        began = true;
        depth += 1;
        if (depth > 1) body.push(rawLine);
        continue;
      }
      if (line === "END" && began) {
        depth -= 1;
        if (depth === 0) break;
        body.push(rawLine);
        continue;
      }
      (began ? body : header).push(rawLine);
    }
    blocks.push({
      id: declaration[1],
      kind: declaration[2].toUpperCase(),
      declarationTail: declaration[3].trim(),
      header,
      body,
    });
  }
  return blocks;
}

function parseMenu(block, defines) {
  const root = [];
  const containers = [root];
  let pendingPopup = null;
  for (const rawLine of block.body) {
    const line = rawLine.trim();
    const popup = /^POPUP\s+("(?:""|[^"])*")(.*)$/i.exec(line);
    if (popup) {
      pendingPopup = {
        type: "popup",
        label: unquote(popup[1]),
        flags: popup[2].trim(),
        items: [],
      };
      containers.at(-1).push(pendingPopup);
      continue;
    }
    if (line === "BEGIN") {
      if (pendingPopup !== null) {
        containers.push(pendingPopup.items);
        pendingPopup = null;
      }
      continue;
    }
    if (line === "END") {
      if (containers.length > 1) containers.pop();
      continue;
    }
    if (/^MENUITEM\s+SEPARATOR\b/i.test(line)) {
      containers.at(-1).push({ type: "separator" });
      continue;
    }
    const item = /^MENUITEM\s+("(?:""|[^"])*")\s*,\s*([A-Za-z_][A-Za-z0-9_]*)(.*)$/i.exec(
      line,
    );
    if (!item) continue;
    containers.at(-1).push({
      type: "command",
      label: unquote(item[1]),
      id: item[2],
      value: numeric(item[2], defines),
      flags: item[3].replace(/^,/, "").trim(),
    });
  }
  return {
    id: block.id,
    value: numeric(block.id, defines),
    items: root,
  };
}

function parseToolbar(block, defines) {
  const dimensions = splitCommaSeparated(
    block.declarationTail.replace(/^(?:DISCARDABLE\s+)?/i, ""),
  )
    .map((value) => numeric(value, defines));
  const items = [];
  for (const rawLine of block.body) {
    const line = rawLine.trim();
    if (/^SEPARATOR\b/i.test(line)) {
      items.push({ type: "separator" });
      continue;
    }
    const button = /^BUTTON\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(line);
    if (!button) continue;
    items.push({
      type: "button",
      id: button[1],
      value: numeric(button[1], defines),
    });
  }
  return {
    id: block.id,
    value: numeric(block.id, defines),
    buttonWidth: dimensions[0],
    buttonHeight: dimensions[1],
    items,
  };
}

function parseAccelerators(block, defines) {
  const statements = [];
  for (const rawLine of block.body) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(?:"|VK_)/i.test(line)) {
      statements.push(line);
    } else if (statements.length > 0) {
      statements[statements.length - 1] += ` ${line}`;
    }
  }
  const entries = [];
  for (const statement of statements) {
    const fields = splitCommaSeparated(statement);
    if (fields.length < 2) continue;
    entries.push({
      key: unquote(fields[0]),
      id: fields[1],
      value: numeric(fields[1], defines),
      flags: fields.slice(2),
    });
  }
  return {
    id: block.id,
    value: numeric(block.id, defines),
    entries,
  };
}

function dialogStatements(body) {
  const statements = [];
  for (const rawLine of body) {
    const line = rawLine.trim();
    const keyword = /^([A-Za-z][A-Za-z0-9]*)\b/.exec(line)?.[1]?.toUpperCase();
    if (keyword && dialogControlKeywords.has(keyword)) {
      statements.push(line);
    } else if (statements.length > 0 && line) {
      statements[statements.length - 1] += ` ${line}`;
    }
  }
  return statements;
}

function controlKind(keyword, className, style) {
  if (keyword.includes("BUTTON") ||
      ["AUTO3STATE", "AUTOCHECKBOX", "AUTORADIOBUTTON", "CHECKBOX", "GROUPBOX", "RADIOBUTTON", "STATE3"].includes(keyword)) {
    return "button";
  }
  if (keyword === "EDITTEXT") return /ES_MULTILINE/i.test(style) ? "rich-edit" : "edit";
  if (keyword === "COMBOBOX") return "combo-box";
  if (keyword === "LISTBOX") return "list-box";
  if (keyword === "SCROLLBAR") return "scroll-bar";
  if (["LTEXT", "CTEXT", "RTEXT", "ICON"].includes(keyword)) return "static";
  if (keyword !== "CONTROL") return "generic";
  if (/button/i.test(className)) return "button";
  if (/edit/i.test(className)) return "edit";
  if (/static/i.test(className)) return "static";
  if (/combobox/i.test(className)) return "combo-box";
  if (/listbox/i.test(className)) return "list-box";
  if (/listview/i.test(className)) return "list-control";
  if (/treeview/i.test(className)) return "tree-control";
  if (/trackbar/i.test(className)) return "slider";
  if (/progress/i.test(className)) return "progress";
  if (/tabcontrol/i.test(className)) return "tab-control";
  return "generic";
}

function parseDialogControl(statement, defines) {
  const keywordMatch = /^([A-Za-z][A-Za-z0-9]*)\s+([\s\S]*)$/i.exec(statement);
  if (!keywordMatch) return null;
  const keyword = keywordMatch[1].toUpperCase();
  const fields = splitCommaSeparated(keywordMatch[2]);
  let label = "";
  let id;
  let className = "";
  let styleIndex;
  let coordinateIndex;
  if (["EDITTEXT", "COMBOBOX", "LISTBOX", "SCROLLBAR"].includes(keyword)) {
    [id] = fields;
    coordinateIndex = 1;
    styleIndex = 5;
  } else if (keyword === "CONTROL") {
    [label, id, className] = fields;
    styleIndex = 3;
    coordinateIndex = 4;
  } else if (keyword === "ICON") {
    [label, id] = fields;
    coordinateIndex = 2;
    styleIndex = 6;
  } else {
    [label, id] = fields;
    coordinateIndex = 2;
    styleIndex = 6;
  }
  if (id === undefined) return null;
  const x = numeric(fields[coordinateIndex], defines);
  const y = numeric(fields[coordinateIndex + 1], defines);
  const width = numeric(fields[coordinateIndex + 2], defines);
  const height = numeric(fields[coordinateIndex + 3], defines);
  const style = keyword === "CONTROL"
    ? (fields[styleIndex] ?? "")
    : fields.slice(styleIndex).filter(Boolean).join(", ");
  const extendedStyle = keyword === "CONTROL"
    ? (fields[coordinateIndex + 4] ?? "")
    : "";
  return {
    keyword,
    kind: controlKind(keyword, unquote(className), style),
    id,
    value: numeric(id, defines),
    label: unquote(label),
    className: unquote(className),
    x,
    y,
    width,
    height,
    style,
    extendedStyle,
  };
}

function parseDialog(block, defines) {
  const dimensions = splitCommaSeparated(
    block.declarationTail.replace(/^(?:DISCARDABLE\s+)?/i, ""),
  ).slice(-4).map((value) => numeric(value, defines));
  const headerSource = block.header.join("\n");
  const caption = /^\s*CAPTION\s+("(?:""|[^"])*")/mi.exec(headerSource);
  const style = /^\s*STYLE\s+(.+)$/mi.exec(headerSource);
  const font = /^\s*FONT\s+(.+)$/mi.exec(headerSource);
  return {
    id: block.id,
    value: numeric(block.id, defines),
    x: dimensions[0],
    y: dimensions[1],
    width: dimensions[2],
    height: dimensions[3],
    caption: caption ? unquote(caption[1]) : "",
    style: style?.[1]?.trim() ?? "",
    font: font?.[1]?.trim() ?? "",
    controls: dialogStatements(block.body)
      .map((statement) => parseDialogControl(statement, defines))
      .filter(Boolean),
  };
}

function parseStrings(source, defines) {
  const strings = [];
  const stringTablePattern = /STRINGTABLE[^\r\n]*\r?\nBEGIN([\s\S]*?)\r?\nEND/g;
  for (const table of source.matchAll(stringTablePattern)) {
    for (const match of table[1].matchAll(
      /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+("(?:""|[^"])*")/gm,
    )) {
      strings.push({
        id: match[1],
        value: numeric(match[1], defines),
        text: unquote(match[2]),
      });
    }
  }
  return strings;
}

function parseFileResources(source, defines) {
  const resources = [];
  for (const match of source.matchAll(
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s+(BITMAP|CURSOR|ICON)\s+(?:[A-Z]+\s+)*"([^"]+)"/gmi,
  )) {
    resources.push({
      id: match[1],
      value: numeric(match[1], defines),
      kind: match[2].toLowerCase(),
      path: match[3].replaceAll("\\", "/"),
    });
  }
  return resources;
}

export function buildWorldBuilderResources() {
  const resourceSource = readFileSync(resourcePath, "utf8");
  const resourceHeaderSource = readFileSync(resourceHeaderPath, "utf8");
  const defines = parseDefines(resourceHeaderSource);
  const blocks = findResourceBlocks(resourceSource);
  return {
    schema: "project-new-shoes/original-world-builder-resources/v1",
    authoritativeSource: "GeneralsMD/Code/Tools/WorldBuilder/res/WorldBuilder.rc",
    resourceSha256: sha256(resourceSource),
    resourceHeaderSha256: sha256(resourceHeaderSource),
    menus: blocks.filter((block) => block.kind === "MENU")
      .map((block) => parseMenu(block, defines)),
    toolbars: blocks.filter((block) => block.kind === "TOOLBAR")
      .map((block) => parseToolbar(block, defines)),
    accelerators: blocks.filter((block) => block.kind === "ACCELERATORS")
      .map((block) => parseAccelerators(block, defines)),
    dialogs: blocks.filter((block) => block.kind.startsWith("DIALOG"))
      .map((block) => parseDialog(block, defines)),
    strings: parseStrings(resourceSource, defines),
    files: parseFileResources(resourceSource, defines),
  };
}

function serialize() {
  return `${JSON.stringify(buildWorldBuilderResources(), null, 2)}\n`;
}

const argumentsSet = new Set(process.argv.slice(2));
if (argumentsSet.has("--write")) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, serialize());
  console.log(outputPath);
} else if (argumentsSet.has("--check")) {
  if (!existsSync(outputPath)) {
    throw new Error(`Missing generated resources: ${outputPath}`);
  }
  if (readFileSync(outputPath, "utf8") !== serialize()) {
    throw new Error(
      "Original World Builder browser resources are stale; run npm run generate:world-builder-resources",
    );
  }
  console.log(`Original World Builder browser resources are current: ${outputPath}`);
} else if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(serialize());
}
