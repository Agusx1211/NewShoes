import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MapDocument } from "./world-builder-map.mjs";

const wasmRoot = resolve(import.meta.dirname, "..");
const archivePath = resolve(process.argv[2]
  || `${wasmRoot}/artifacts/real-assets/MapsZH.big`);
const archive = new Uint8Array(await readFile(archivePath));
const decoder = new TextDecoder("windows-1252");

function u32be(offset) {
  return (archive[offset] * 0x1000000 + archive[offset + 1] * 0x10000
    + archive[offset + 2] * 0x100 + archive[offset + 3]) >>> 0;
}

assert.equal(decoder.decode(archive.subarray(0, 4)), "BIGF");
const count = u32be(8);
let cursor = 16;
const maps = [];
for (let index = 0; index < count; index += 1) {
  const offset = u32be(cursor);
  const size = u32be(cursor + 4);
  const terminator = archive.indexOf(0, cursor + 8);
  assert.ok(terminator >= 0, "BIG directory entry must have a terminator");
  const name = decoder.decode(archive.subarray(cursor + 8, terminator));
  if (/\.map$/i.test(name)) maps.push({ name, bytes: archive.subarray(offset, offset + size) });
  cursor = terminator + 1;
}
assert.ok(maps.length >= 50, "retail MapsZH.big should contain the complete map corpus");

let compressed = 0;
let scripted = 0;
for (const fixture of maps) {
  const document = await MapDocument.fromBytes(fixture.bytes, { name: fixture.name });
  assert.deepEqual(document.serialize(), fixture.bytes,
    `${fixture.name} must round-trip with its original compression byte-for-byte`);
  if (decoder.decode(fixture.bytes.subarray(0, 4)) !== "CkMp") compressed += 1;

  const firstScript = document.sides?.players.flatMap((player) => [
    ...player.scripts,
    ...player.groups.flatMap((group) => group.scripts),
  ])[0];
  if (firstScript) {
    const preservedChildren = firstScript.children.map((child) => new Uint8Array(child.data));
    document.transaction("Retail script metadata edit", (map) =>
      map.updateScript(firstScript, { comment: `${firstScript.comment} [browser round-trip]` }));
    const edited = document.serialize({ preserveOriginal: false });
    const reopened = await MapDocument.fromBytes(edited, { name: fixture.name });
    const reopenedScript = reopened.sides.players.flatMap((player) => [
      ...player.scripts,
      ...player.groups.flatMap((group) => group.scripts),
    ])[0];
    assert.match(reopenedScript.comment, /\[browser round-trip\]$/);
    reopenedScript.children.forEach((child, index) =>
      assert.deepEqual(child.data, preservedChildren[index],
        `${fixture.name} script condition/action payload ${index} must survive metadata edits`));
    scripted += 1;
  } else {
    document.transaction("Retail height edit", (map) => {
      const index = map.terrainIndex(map.heightMap.border, map.heightMap.border);
      map.setElevation(map.heightMap.border, map.heightMap.border,
        map.heightMap.elevations[index] + 1);
    });
    const edited = document.serialize({ preserveOriginal: false });
    await MapDocument.fromBytes(edited, { name: fixture.name });
  }
}

assert.ok(compressed > 0, "retail corpus must exercise compressed map import");
assert.ok(scripted > 0, "retail corpus must exercise native script preservation");
console.log("world builder retail corpus passed", {
  maps: maps.length,
  compressed,
  scripted,
});
