import assert from "node:assert/strict";
import {
  classifyCustomMapPackage,
  normalizeCustomMapName,
  safeCustomMapPackagePath,
} from "./custom-map-package-format.mjs";

const standard = classifyCustomMapPackage([
  { path: "Download Wrapper/Alpine Assault/Alpine Assault.map", size: 12 },
  { path: "Download Wrapper/Alpine Assault/Alpine Assault.tga", size: 8 },
  { path: "Download Wrapper/Alpine Assault/map.str", size: 4 },
]);
assert.deepEqual(standard.maps.map((map) => map.name), ["Alpine Assault"]);
assert.deepEqual(standard.maps[0].files.map((file) => file.path), [
  "Alpine Assault.map",
  "Alpine Assault.tga",
  "map.str",
]);

const mapsRoot = classifyCustomMapPackage([
  { path: "Maps/[RANK] Canyon/[RANK] Canyon.map", size: 9 },
  { path: "Maps/[RANK] Canyon/preview.tga", size: 3 },
]);
assert.equal(mapsRoot.maps[0].name, "[RANK] Canyon");
assert.deepEqual(mapsRoot.maps[0].files.map((file) => file.path), [
  "[RANK] Canyon.map",
  "preview.tga",
]);

const rootMap = classifyCustomMapPackage([
  { path: "Island Siege.map", size: 7 },
  { path: "Island Siege.tga", size: 5 },
]);
assert.equal(rootMap.maps[0].name, "Island Siege");

const multiple = classifyCustomMapPackage([
  { path: "Pack/Alpha/Alpha.map", size: 2 },
  { path: "Pack/Beta/Beta.map", size: 3 },
]);
assert.deepEqual(multiple.maps.map((map) => map.name), ["Alpha", "Beta"]);

const native = classifyCustomMapPackage([
  { path: "Bridge/Bridge.map", size: 10 },
  { path: "Bridge/helper.dll", size: 5 },
]);
assert.equal(native.maps[0].files.length, 1);
assert.match(native.warnings.join(" "), /Ignored 1 native Windows code file/);

assert.equal(safeCustomMapPackagePath("./Maps/Test/Test.map"), "Maps/Test/Test.map");
assert.equal(safeCustomMapPackagePath("../Test.map"), null);
assert.equal(safeCustomMapPackagePath("Maps/CON/CON.map"), null);
assert.equal(normalizeCustomMapName("Tournament Delta"), "Tournament Delta");
assert.throws(() => normalizeCustomMapName("Bad:Map"), /cannot use/);
assert.throws(() => classifyCustomMapPackage([{ path: "readme.txt", size: 1 }]), /No \.map/);
assert.throws(() => classifyCustomMapPackage([
  { path: "Pack/One.map", size: 1 },
  { path: "Pack/Two.map", size: 1 },
]), /standard MapName/);
assert.throws(() => classifyCustomMapPackage([
  { path: "Outer/Outer.map", size: 1 },
  { path: "Outer/Inner/Inner.map", size: 1 },
]), /nested map folders|another \.map/);

console.log("custom map package format unit passed", {
  standard: standard.maps[0].name,
  multiple: multiple.maps.length,
});
