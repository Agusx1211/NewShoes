#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildWorldBuilderInventory } from "../tools/generate_world_builder_inventory.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(wasmRoot, "..");
const inventoryPath = resolve(
  wasmRoot,
  "world-builder/original-parity-inventory.json",
);
const inventory = buildWorldBuilderInventory();
const generated = JSON.parse(readFileSync(inventoryPath, "utf8"));

assert.deepEqual(generated, inventory, "the checked-in original World Builder inventory is stale");
assert.equal(inventory.schema, "project-new-shoes/original-world-builder-parity/v1");
assert.ok(inventory.summary.cppFiles >= 99, "the complete original C++ source list is not inventoried");
assert.ok(inventory.summary.headerFiles >= 98, "the complete original header list is not inventoried");
assert.ok(inventory.summary.menuCommands >= 100, "the original menu command surface is incomplete");
assert.ok(inventory.summary.toolbarButtons >= 35, "the original toolbar surface is incomplete");
assert.ok(inventory.summary.acceleratorEntries >= 20, "the original accelerator surface is incomplete");
assert.ok(inventory.summary.dialogs >= 35, "the original dialog surface is incomplete");
assert.ok(inventory.summary.dialogControls >= 300, "the original dialog control surface is incomplete");
assert.ok(inventory.summary.messageMaps >= 30, "the original MFC message-map surface is incomplete");
assert.ok(inventory.summary.messageBindings >= 200, "the original command bindings are incomplete");

for (const file of inventory.projectFiles) {
  assert.equal(file.exists, true, `original project file is missing: ${file.path}`);
}
for (const resource of inventory.fileResources) {
  assert.equal(resource.exists, true, `original UI resource is missing: ${resource.path}`);
}

const cppFiles = new Set(inventory.projectFiles.map((file) => file.path));
for (const required of [
  "src/WorldBuilder.cpp",
  "src/WorldBuilderDoc.cpp",
  "src/WorldBuilderView.cpp",
  "src/wbview.cpp",
  "src/wbview3d.cpp",
  "src/WHeightMapEdit.cpp",
  "src/CUndoable.cpp",
  "src/ScriptDialog.cpp",
  "src/teamsdialog.cpp",
]) {
  assert.ok(cppFiles.has(required), `original project omits ${required}`);
}

const commandIds = new Set([
  ...inventory.menus.flatMap((menu) => menu.commands.map((command) => command.id)),
  ...inventory.toolbars.flatMap((toolbar) => toolbar.buttons.map((button) => button.id)),
]);
for (const required of [
  "ID_FILE_NEW",
  "ID_FILE_OPEN",
  "ID_FILE_SAVE",
  "ID_EDIT_UNDO",
  "ID_EDIT_REDO",
  "ID_BRUSH_TOOL",
  "ID_MOLD_TOOL",
  "ID_WATER_TOOL",
  "ID_ROAD_TOOL",
  "ID_SCRIPT_EDIT",
  "ID_TEAM_EDIT",
]) {
  assert.ok(commandIds.has(required), `original command is not inventoried: ${required}`);
}

const boundArguments = new Set(inventory.messageMaps.flatMap((map) =>
  map.bindings.flatMap((binding) => binding.arguments)));
assert.ok(
  boundArguments.has("ID_WINDOW_2DWINDOW"),
  "the original dynamic 2D window command binding is not inventoried",
);

const dialogIds = new Set(inventory.dialogs.map((dialog) => dialog.id));
for (const required of [
  "IDD_NewHeightMap",
  "IDD_TERRAIN_MATERIAL",
  "IDD_OBJECT_OPTIONS",
  "IDD_MAPOBJECT_PROPS",
  "IDD_ScriptDialog",
  "IDD_TEAMS_DIALOG",
  "IDD_PLAYERLIST",
  "IDD_MAP_SETTINGS",
]) {
  assert.ok(dialogIds.has(required), `original dialog is not inventoried: ${required}`);
}

assert.equal(
  existsSync(resolve(wasmRoot, "harness/world-builder-app.mjs")),
  false,
  "a parallel JavaScript World Builder must not become the original application implementation",
);
assert.equal(
  existsSync(resolve(wasmRoot, "harness/world-builder-map.mjs")),
  false,
  "a parallel JavaScript map model must not become the original application implementation",
);

console.log("original World Builder parity inventory passed", inventory.summary);
