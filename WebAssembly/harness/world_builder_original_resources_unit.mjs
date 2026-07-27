#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildWorldBuilderResources } from "../tools/generate_world_builder_resources.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const generated = JSON.parse(readFileSync(
  resolve(wasmRoot, "world-builder/original-resources.json"),
  "utf8",
));
const resources = buildWorldBuilderResources();
const flattenMenuItems = (items) => items.flatMap((item) =>
  item.type === "popup" ? [item, ...flattenMenuItems(item.items)] : [item]);

assert.deepEqual(generated, resources);
assert.equal(resources.dialogs.length, 62);
assert.equal(resources.menus.length, 3);
assert.equal(resources.toolbars.length, 3);
assert.equal(resources.accelerators.length, 1);

const dialog = resources.dialogs.find(({ id }) => id === "IDD_CellWidth");
assert.deepEqual(
  {
    caption: dialog?.caption,
    width: dialog?.width,
    height: dialog?.height,
  },
  { caption: "Cell Width", width: 186, height: 95 },
);
assert.deepEqual(
  dialog.controls.map(({ id, value, label, x, y, width, height }) => ({
    id,
    value,
    label,
    x,
    y,
    width,
    height,
  })),
  [
    { id: "IDOK", value: 1, label: "OK", x: 129, y: 7, width: 50, height: 14 },
    { id: "IDCANCEL", value: 2, label: "Cancel", x: 129, y: 24, width: 50, height: 14 },
    { id: "IDC_STATIC", value: -1, label: "Cell Width:", x: 16, y: 39, width: 35, height: 9 },
    { id: "IDC_CELL_WIDTH", value: 1001, label: "", x: 59, y: 35, width: 54, height: 14 },
  ],
);

const mapMenu = resources.menus.find(({ id }) => id === "IDR_MAPDOC");
const fileMenu = mapMenu?.items.find(
  ({ type, label }) => type === "popup" && label === "&File",
);
assert.ok(fileMenu);
assert.equal(
  fileMenu.items.find(({ id }) => id === "ID_FILE_OPEN")?.value,
  0xe101,
);
assert.ok(fileMenu.items.some(({ type }) => type === "separator"));

const viewMenu = mapMenu?.items.find(
  ({ type, label }) => type === "popup" && label === "&View",
);
assert.equal(
  viewMenu.items.find(({ id }) => id === "ID_VIEW_TOOLBAR")?.value,
  0xe800,
);
assert.equal(
  viewMenu.items.find(({ id }) => id === "ID_VIEW_STATUS_BAR")?.value,
  0xe801,
);
assert.equal(
  resources.menus.flatMap(({ items }) => flattenMenuItems(items)).some(
    ({ type, value }) => type === "command" && value == null,
  ),
  false,
  "top-level original menu commands must have numeric MFC command IDs",
);

const mainToolbar = resources.toolbars.find(({ id }) => id === "IDR_MAINFRAME");
assert.equal(mainToolbar.buttonWidth, 16);
assert.equal(mainToolbar.buttonHeight, 15);
assert.ok(mainToolbar.items.some(({ type }) => type === "separator"));

const accelerator = resources.accelerators[0].entries.find(
  ({ id }) => id === "ID_EDIT_REDO",
);
assert.deepEqual(accelerator.flags, ["VIRTKEY", "SHIFT", "CONTROL", "NOINVERT"]);

const eula = resources.strings.find(({ id }) => id === "IDS_EULA_AGREEMENT1");
assert.ok(eula?.text.includes("Electronic Arts Inc"));

console.log("original World Builder runtime resources passed", {
  dialogs: resources.dialogs.length,
  controls: resources.dialogs.reduce(
    (count, resource) => count + resource.controls.length,
    0,
  ),
  menus: resources.menus.length,
  toolbars: resources.toolbars.length,
  strings: resources.strings.length,
  files: resources.files.length,
});
