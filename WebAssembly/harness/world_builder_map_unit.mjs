import assert from "node:assert/strict";
import { MapDocument, WorldBuilderBinary, decompressMap } from "./world-builder-map.mjs";

function refPackLiteral(value) {
  const source = new Uint8Array(value);
  const parts = [Uint8Array.of(
    0x45, 0x41, 0x52, 0,
    source.byteLength & 0xff,
    (source.byteLength >>> 8) & 0xff,
    (source.byteLength >>> 16) & 0xff,
    (source.byteLength >>> 24) & 0xff,
    0x10, 0xfb,
    (source.byteLength >>> 16) & 0xff,
    (source.byteLength >>> 8) & 0xff,
    source.byteLength & 0xff,
  )];
  let offset = 0;
  while (source.byteLength - offset >= 4) {
    const count = Math.min(112, Math.floor((source.byteLength - offset) / 4) * 4);
    parts.push(Uint8Array.of(0xe0 + (count - 4) / 4), source.subarray(offset, offset + count));
    offset += count;
  }
  parts.push(Uint8Array.of(0xfc | (source.byteLength - offset)), source.subarray(offset));
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(size);
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.byteLength;
  }
  return output;
}

const document = MapDocument.create({
  name: "Browser Forge",
  playableWidth: 96,
  playableHeight: 80,
  border: 12,
  elevation: 30,
  terrain: "SandMediumType5",
  terrainWidth: 4,
});
assert.deepEqual(document.summary().textures, ["SandMediumType5"]);
assert.equal(document.blend.textures[0].tileCount, 16);
assert.equal(document.dirty, false);

document.archive.symbols.entries.push({ id: 65_000, name: "FutureEditorData" });
document.archive.symbols.byId.set(65_000, "FutureEditorData");
document.archive.symbols.byName.set("FutureEditorData", 65_000);
document.archive.chunks.push({
  id: 65_000,
  name: "FutureEditorData",
  version: 9,
  data: Uint8Array.of(17, 34, 51, 68),
});

document.transaction("Author map", (map) => {
  map.setElevation(20, 20, 80);
  map.setPassable(20, 20, false);
  const texture = map.addTerrainTexture("GrassMedium", { width: 2 });
  map.setTerrain(21, 20, texture);
  map.addObject("AmericaCommandCenter", 300, 300, { owner: "teamPlyrAmerica" });
  map.addScorch(320, 320, { type: 2, radius: 26 });
  const first = map.addWaypoint("Player_1_Start", 240, 240);
  const second = map.addWaypoint("Player_2_Start", 720, 600);
  const firstId = first.properties.find((item) => item.key === "waypointID").value;
  const secondId = second.properties.find((item) => item.key === "waypointID").value;
  map.addWaypointLink(firstId, secondId);
  map.addPolygon({
    name: "River",
    isWater: true,
    points: [
      { x: 300, y: 400, z: 12 },
      { x: 550, y: 400, z: 12 },
      { x: 550, y: 470, z: 12 },
      { x: 300, y: 470, z: 12 },
    ],
  });
  map.addPlayer({ name: "PlyrBrowser", displayName: "Browser", faction: "FactionCivilian" });
  map.addTeam({ name: "teamPlyrBrowser", owner: "PlyrBrowser" });
  map.addBuildListItem(14, {
    buildingName: "Command Center",
    templateName: "AmericaCommandCenter",
    x: 300,
    y: 300,
    initiallyBuilt: true,
  });
  map.addScript(14, { name: "Browser Authored Script" });
  const group = map.addScriptGroup(14, { name: "Browser Authored Group" });
  map.addScript(14, { name: "Grouped Script", group });
  map.setLightingTimeOfDay(4);
});

assert.equal(document.summary().issues.filter((issue) => issue.severity === "error").length, 0);
assert.equal(document.summary().waypointLinks, 1);
assert.equal(document.summary().buildListItems, 1);
assert.equal(document.summary().timeOfDay, 4);
assert.equal(document.undo(), true);
assert.equal(document.objects.length, 0);
assert.equal(document.redo(), true);
assert.equal(document.objects.length, 4);

const encoded = document.serialize({ preserveOriginal: false });
const parsed = await MapDocument.fromBytes(encoded, { name: "Browser Forge" });
assert.equal(parsed.heightMap.elevations[parsed.terrainIndex(20, 20)], 80);
assert.equal(parsed.isPassable(20, 20), false);
assert.equal(parsed.objects.some((object) => object.type === "AmericaCommandCenter"), true);
assert.equal(parsed.objects.some((object) => object.type === "Scorch"), true);
assert.equal(parsed.waypointLinks.length, 1);
assert.equal(parsed.sides.definitions.length, 15);
assert.equal(parsed.sides.teams.length, 15);
assert.equal(parsed.sides.definitions[14].builds.length, 1);
assert.deepEqual(parsed.sides.players[14].scripts.map((script) => script.name),
  ["Browser Authored Script"]);
assert.deepEqual(parsed.sides.players[14].groups[0].scripts.map((script) => script.name),
  ["Grouped Script"]);
assert.equal(parsed.lighting.timeOfDay, 4);
assert.deepEqual(parsed.archive.chunks.find((chunk) => chunk.name === "FutureEditorData").data,
  Uint8Array.of(17, 34, 51, 68));

assert.deepEqual(parsed.serialize(), encoded, "an untouched imported CkMp map must round-trip byte-for-byte");
const compressed = refPackLiteral(encoded);
assert.deepEqual(await decompressMap(compressed), encoded);
const compressedDocument = await MapDocument.fromBytes(compressed, { name: "Compressed" });
assert.deepEqual(compressedDocument.serialize(), compressed,
  "an untouched RefPack map must retain its original compressed bytes");

const removedPlayer = await MapDocument.fromBytes(encoded, { name: "Remove Player" });
removedPlayer.transaction("Remove custom player", (map) => map.removePlayer(14));
const removedPlayerRoundTrip = await MapDocument.fromBytes(
  removedPlayer.serialize({ preserveOriginal: false }),
  { name: "Remove Player" },
);
assert.equal(removedPlayerRoundTrip.sides.definitions.length, 14);
assert.equal(removedPlayerRoundTrip.sides.players.length, 14);
assert.equal(removedPlayerRoundTrip.sides.teams.length, 14);

const archive = WorldBuilderBinary.parseArchive(encoded);
assert.ok(archive.chunks.some((chunk) => chunk.name === "HeightMapData"));
await assert.rejects(() => MapDocument.fromBytes(Uint8Array.of(1, 2, 3, 4)), /truncated|Unsupported map header/);
await assert.rejects(() => MapDocument.fromBytes(encoded.subarray(0, encoded.byteLength - 7)),
  /unexpected end|invalid size|trailing bytes/);

console.log("world builder map unit passed", {
  bytes: encoded.byteLength,
  chunks: archive.chunks.length,
  objects: parsed.objects.length,
  players: parsed.sides.definitions.length,
});
