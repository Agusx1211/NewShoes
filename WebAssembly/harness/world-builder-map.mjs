const ASCII = new TextDecoder("windows-1252");
const UTF8 = new TextEncoder();
const MAP_MAGIC = "CkMp";
const CHUNK_HEADER_BYTES = 10;
const MAX_SYMBOLS = 100_000;
const MAX_CHUNKS = 1_000_000;
const MAX_MAP_BYTES = 512 * 1024 * 1024;

export const MAP_XY_SCALE = 10;
export const MAP_HEIGHT_SCALE = 0.625;

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Expected map bytes");
}

function ascii(value) {
  return ASCII.decode(value);
}

function concat(parts) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function cloneBytes(value) {
  return new Uint8Array(value);
}

class Reader {
  constructor(value, label = "map") {
    this.bytes = bytes(value);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.offset = 0;
    this.label = label;
  }

  ensure(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.byteLength) {
      throw new Error(`${this.label}: unexpected end of data at ${this.offset}`);
    }
  }

  remaining() {
    return this.bytes.byteLength - this.offset;
  }

  u8() {
    this.ensure(1);
    return this.bytes[this.offset++];
  }

  u16() {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  i16() {
    this.ensure(2);
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32() {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  i32() {
    this.ensure(4);
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32() {
    this.ensure(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  take(length) {
    this.ensure(length);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  string() {
    const length = this.u16();
    return ascii(this.take(length));
  }

  unicode() {
    const length = this.u16();
    const value = this.take(length * 2);
    return new TextDecoder("utf-16le").decode(value);
  }
}

class Writer {
  constructor() {
    this.parts = [];
    this.length = 0;
  }

  append(value) {
    const part = bytes(value);
    this.parts.push(part);
    this.length += part.byteLength;
    return this;
  }

  number(size, setter, value) {
    const part = new Uint8Array(size);
    new DataView(part.buffer)[setter](0, value, true);
    return this.append(part);
  }

  u8(value) { return this.append(Uint8Array.of(value & 0xff)); }
  u16(value) { return this.number(2, "setUint16", value); }
  i16(value) { return this.number(2, "setInt16", value); }
  u32(value) { return this.number(4, "setUint32", value >>> 0); }
  i32(value) { return this.number(4, "setInt32", value | 0); }
  f32(value) { return this.number(4, "setFloat32", Number(value)); }

  string(value = "") {
    const encoded = UTF8.encode(String(value));
    if (encoded.byteLength > 0xffff) throw new Error("Map string is too long");
    return this.u16(encoded.byteLength).append(encoded);
  }

  unicode(value = "") {
    const text = String(value);
    if (text.length > 0xffff) throw new Error("Map string is too long");
    this.u16(text.length);
    for (let index = 0; index < text.length; index += 1) this.u16(text.charCodeAt(index));
    return this;
  }

  finish() {
    return concat(this.parts);
  }
}

function refPackDecode(input, expectedSize) {
  const source = bytes(input);
  if (source.byteLength < 5) throw new Error("RefPack stream is truncated");
  let cursor = 0;
  const type = (source[cursor++] << 8) | source[cursor++];
  const sizeBytes = type & 0x8000 ? 4 : 3;
  if (type & 0x100) cursor += sizeBytes;
  let declaredSize = 0;
  for (let index = 0; index < sizeBytes; index += 1) {
    if (cursor >= source.byteLength) throw new Error("RefPack header is truncated");
    declaredSize = declaredSize * 256 + source[cursor++];
  }
  const outputSize = expectedSize || declaredSize;
  if (!outputSize || outputSize > MAX_MAP_BYTES || declaredSize !== outputSize) {
    throw new Error("RefPack map has an invalid uncompressed size");
  }
  const output = new Uint8Array(outputSize);
  let target = 0;
  const literal = (count) => {
    if (cursor + count > source.byteLength || target + count > output.byteLength) {
      throw new Error("RefPack literal extends outside the map");
    }
    output.set(source.subarray(cursor, cursor + count), target);
    cursor += count;
    target += count;
  };
  const reference = (distance, count) => {
    let from = target - distance;
    if (from < 0 || target + count > output.byteLength) {
      throw new Error("RefPack reference extends outside the map");
    }
    for (let index = 0; index < count; index += 1) output[target++] = output[from++];
  };
  for (;;) {
    if (cursor >= source.byteLength) throw new Error("RefPack stream has no terminator");
    const first = source[cursor++];
    if (!(first & 0x80)) {
      if (cursor >= source.byteLength) throw new Error("RefPack short command is truncated");
      const second = source[cursor++];
      literal(first & 3);
      reference(1 + ((first & 0x60) << 3) + second, ((first & 0x1c) >> 2) + 3);
    } else if (!(first & 0x40)) {
      if (cursor + 2 > source.byteLength) throw new Error("RefPack medium command is truncated");
      const second = source[cursor++];
      const third = source[cursor++];
      literal(second >> 6);
      reference(1 + ((second & 0x3f) << 8) + third, (first & 0x3f) + 4);
    } else if (!(first & 0x20)) {
      if (cursor + 3 > source.byteLength) throw new Error("RefPack long command is truncated");
      const second = source[cursor++];
      const third = source[cursor++];
      const fourth = source[cursor++];
      literal(first & 3);
      reference(1 + (((first & 0x10) >> 4) << 16) + (second << 8) + third,
        (((first & 0x0c) >> 2) << 8) + fourth + 5);
    } else {
      const count = ((first & 0x1f) << 2) + 4;
      if (count <= 112) {
        literal(count);
      } else {
        literal(first & 3);
        break;
      }
    }
  }
  if (target !== output.byteLength) {
    throw new Error(`RefPack map decoded ${target} of ${output.byteLength} bytes`);
  }
  return output;
}

async function inflateMap(input, expectedSize) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot import the rare zlib-compressed Generals map format");
  }
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream("deflate"));
  const output = new Uint8Array(await new Response(stream).arrayBuffer());
  if (output.byteLength !== expectedSize) {
    throw new Error(`Zlib map decoded ${output.byteLength} of ${expectedSize} bytes`);
  }
  return output;
}

export async function decompressMap(value) {
  const source = bytes(value);
  if (source.byteLength < 4 || source.byteLength > MAX_MAP_BYTES) {
    throw new Error("Map file is empty or unreasonably large");
  }
  const magic = ascii(source.subarray(0, 4));
  if (magic === MAP_MAGIC) return cloneBytes(source);
  if (source.byteLength < 8) throw new Error("Map compression header is truncated");
  const expectedSize = new DataView(source.buffer, source.byteOffset + 4, 4).getUint32(0, true);
  if (!expectedSize || expectedSize > MAX_MAP_BYTES) throw new Error("Map has an invalid size");
  if (magic === "EAR\0") return refPackDecode(source.subarray(8), expectedSize);
  if (/^ZL[1-9]\0$/.test(magic)) return inflateMap(source.subarray(8), expectedSize);
  throw new Error(`Unsupported map header ${JSON.stringify(magic)}`);
}

function parseChunkSequence(value, symbols, label) {
  const reader = new Reader(value, label);
  const chunks = [];
  while (reader.remaining()) {
    if (reader.remaining() < CHUNK_HEADER_BYTES) {
      throw new Error(`${label}: ${reader.remaining()} trailing bytes cannot form a chunk`);
    }
    if (chunks.length >= MAX_CHUNKS) throw new Error(`${label}: too many chunks`);
    const id = reader.u32();
    const version = reader.u16();
    const size = reader.i32();
    if (size < 0 || size > reader.remaining()) throw new Error(`${label}: chunk ${id} has an invalid size`);
    const name = symbols.byId.get(id);
    if (!name) throw new Error(`${label}: chunk references unknown symbol ${id}`);
    chunks.push({ id, name, version, data: cloneBytes(reader.take(size)) });
  }
  return chunks;
}

function parseArchive(uncompressed) {
  const reader = new Reader(uncompressed);
  if (ascii(reader.take(4)) !== MAP_MAGIC) throw new Error("Map is not a CkMp file");
  const count = reader.i32();
  if (count <= 0 || count > MAX_SYMBOLS) throw new Error("Map symbol table is invalid");
  const entries = [];
  const byId = new Map();
  const byName = new Map();
  for (let index = 0; index < count; index += 1) {
    const length = reader.u8();
    const name = ascii(reader.take(length));
    const id = reader.u32();
    if (!name || !id || byId.has(id) || byName.has(name)) {
      throw new Error("Map symbol table contains a duplicate or invalid entry");
    }
    const entry = { id, name };
    entries.push(entry);
    byId.set(id, name);
    byName.set(name, id);
  }
  const symbols = { entries, byId, byName };
  return { symbols, chunks: parseChunkSequence(reader.take(reader.remaining()), symbols, "map") };
}

function ensureSymbol(archive, name) {
  let id = archive.symbols.byName.get(name);
  if (id) return id;
  id = Math.max(0, ...archive.symbols.entries.map((entry) => entry.id)) + 1;
  const entry = { id, name };
  archive.symbols.entries.push(entry);
  archive.symbols.byId.set(id, name);
  archive.symbols.byName.set(name, id);
  return id;
}

function encodeChunk(chunk) {
  return new Writer()
    .u32(chunk.id)
    .u16(chunk.version)
    .i32(chunk.data.byteLength)
    .append(chunk.data)
    .finish();
}

function encodeArchive(archive) {
  const writer = new Writer().append(UTF8.encode(MAP_MAGIC)).i32(archive.symbols.entries.length);
  for (const { id, name } of archive.symbols.entries) {
    const encoded = UTF8.encode(name);
    if (!encoded.byteLength || encoded.byteLength > 255) throw new Error(`Invalid map symbol ${name}`);
    writer.u8(encoded.byteLength).append(encoded).u32(id);
  }
  for (const chunk of archive.chunks) writer.append(encodeChunk(chunk));
  return writer.finish();
}

function nestedChunk(archive, name, version, data) {
  return { id: ensureSymbol(archive, name), name, version, data };
}

function parseDict(reader, symbols) {
  const count = reader.u16();
  const properties = [];
  for (let index = 0; index < count; index += 1) {
    const packed = reader.i32();
    const type = packed & 0xff;
    const id = packed >>> 8;
    const key = symbols.byId.get(id);
    if (!key || type > 4) throw new Error(`Invalid map dictionary entry ${id}/${type}`);
    let value;
    if (type === 0) value = reader.u8() !== 0;
    if (type === 1) value = reader.i32();
    if (type === 2) value = reader.f32();
    if (type === 3) value = reader.string();
    if (type === 4) value = reader.unicode();
    properties.push({ key, type, value });
  }
  return properties;
}

function writeDict(properties, archive) {
  const writer = new Writer().u16(properties.length);
  for (const property of properties) {
    const type = Number(property.type);
    if (!Number.isInteger(type) || type < 0 || type > 4) {
      throw new Error(`Invalid dictionary type for ${property.key}`);
    }
    writer.i32((ensureSymbol(archive, property.key) << 8) | type);
    if (type === 0) writer.u8(property.value ? 1 : 0);
    if (type === 1) writer.i32(property.value);
    if (type === 2) writer.f32(property.value);
    if (type === 3) writer.string(property.value);
    if (type === 4) writer.unicode(property.value);
  }
  return writer.finish();
}

function parseHeightMap(chunk) {
  const reader = new Reader(chunk.data, "HeightMapData");
  const width = reader.u32();
  const height = reader.u32();
  const border = reader.u32();
  if (width < 3 || height < 3 || width * height > 16_777_216) {
    throw new Error("Height map dimensions are invalid");
  }
  const boundaryCount = reader.u32();
  if (boundaryCount > 1024) throw new Error("Height map has too many boundaries");
  const boundaries = [];
  for (let index = 0; index < boundaryCount; index += 1) {
    boundaries.push(chunk.version >= 6
      ? { x1: reader.u32(), y1: reader.u32(), x2: reader.u32(), y2: reader.u32() }
      : { x1: 0, y1: 0, x2: reader.u32(), y2: reader.u32() });
  }
  const area = reader.u32();
  if (area !== width * height) throw new Error("Height map area does not match its dimensions");
  const elementBytes = chunk.version >= 5 ? 2 : 1;
  if (reader.remaining() !== area * elementBytes) throw new Error("Height map elevation data is invalid");
  const elevations = new Uint16Array(area);
  for (let index = 0; index < area; index += 1) {
    elevations[index] = elementBytes === 2 ? reader.u16() : reader.u8();
  }
  return { version: chunk.version, width, height, border, boundaries, elevations };
}

function writeHeightMap(heightMap) {
  const writer = new Writer()
    .u32(heightMap.width)
    .u32(heightMap.height)
    .u32(heightMap.border)
    .u32(heightMap.boundaries.length);
  for (const boundary of heightMap.boundaries) {
    if (heightMap.version >= 6) writer.u32(boundary.x1).u32(boundary.y1);
    writer.u32(boundary.x2).u32(boundary.y2);
  }
  writer.u32(heightMap.width * heightMap.height);
  for (const elevation of heightMap.elevations) {
    if (heightMap.version >= 5) writer.u16(elevation);
    else writer.u8(elevation);
  }
  return writer.finish();
}

function parseBlend(chunk, heightMap) {
  const reader = new Reader(chunk.data, "BlendTileData");
  const area = reader.u32();
  if (area !== heightMap.width * heightMap.height) throw new Error("Blend tile area is invalid");
  const indexBytes = chunk.version >= 14 && chunk.version < 24 ? 4 : 2;
  const readArray = () => {
    const values = new Uint32Array(area);
    for (let index = 0; index < area; index += 1) {
      values[index] = indexBytes === 4 ? reader.u32() : reader.u16();
    }
    return values;
  };
  const tiles = readArray();
  const blends = readArray();
  const extraBlends = readArray();
  const cliffs = readArray();
  let passabilityWidth = heightMap.width;
  if (chunk.version === 7) passabilityWidth = Math.floor((passabilityWidth + 1) / 8) * 8;
  const impassability = chunk.version > 6
    ? cloneBytes(reader.take(Math.ceil(passabilityWidth / 8) * heightMap.height))
    : new Uint8Array(0);
  const tailOffset = reader.offset;
  const tail = cloneBytes(reader.take(reader.remaining()));
  const metadata = new Reader(tail, "BlendTileData metadata");
  const textures = [];
  try {
    const textureCellCount = metadata.u32();
    const blendCount = metadata.u32();
    const cliffCount = metadata.u32();
    const textureCount = metadata.u32();
    if (textureCount > 4096) throw new Error("too many terrain textures");
    for (let index = 0; index < textureCount; index += 1) {
      textures.push({
        firstTile: metadata.u32(),
        tileCount: metadata.u32(),
        width: metadata.u32(),
        reserved: metadata.u32(),
        name: metadata.string(),
      });
    }
    return {
      version: chunk.version,
      area,
      indexBytes,
      tiles,
      blends,
      extraBlends,
      cliffs,
      impassability,
      passabilityWidth,
      tail,
      tailOffset,
      textureCellCount,
      blendCount,
      cliffCount,
      textures,
    };
  } catch {
    return {
      version: chunk.version,
      area,
      indexBytes,
      tiles,
      blends,
      extraBlends,
      cliffs,
      impassability,
      passabilityWidth,
      tail,
      tailOffset,
      textures,
    };
  }
}

function writeBlend(blend) {
  const writer = new Writer().u32(blend.area);
  for (const values of [blend.tiles, blend.blends, blend.extraBlends, blend.cliffs]) {
    for (const value of values) {
      if (blend.indexBytes === 4) writer.u32(value);
      else writer.u16(value);
    }
  }
  return writer.append(blend.impassability).append(blend.tail).finish();
}

function parseObjects(chunk, symbols) {
  const objects = [];
  for (const objectChunk of parseChunkSequence(chunk.data, symbols, "ObjectsList")) {
    if (objectChunk.name !== "Object") continue;
    const reader = new Reader(objectChunk.data, "Object");
    objects.push({
      version: objectChunk.version,
      x: reader.f32(),
      y: reader.f32(),
      z: reader.f32(),
      angle: reader.f32(),
      flags: reader.u32(),
      type: reader.string(),
      properties: parseDict(reader, symbols),
    });
    if (reader.remaining()) throw new Error("Object has trailing data");
  }
  return objects;
}

function writeObjects(objects, archive) {
  return concat(objects.map((object) => encodeChunk(nestedChunk(
    archive,
    "Object",
    object.version || 3,
    new Writer()
      .f32(object.x)
      .f32(object.y)
      .f32(object.z)
      .f32(object.angle)
      .u32(object.flags)
      .string(object.type)
      .append(writeDict(object.properties || [], archive))
      .finish(),
  ))));
}

function parsePolygons(chunk) {
  const reader = new Reader(chunk.data, "PolygonTriggers");
  const count = reader.u32();
  if (count > 100_000) throw new Error("PolygonTriggers has an invalid count");
  const polygons = [];
  for (let index = 0; index < count; index += 1) {
    const polygon = {
      name: reader.string(),
      layer: chunk.version >= 4 ? reader.string() : "",
      id: reader.u32(),
      isWater: chunk.version >= 2 ? reader.u8() !== 0 : false,
      isRiver: chunk.version >= 3 ? reader.u8() !== 0 : false,
      riverStart: chunk.version >= 3 ? reader.u32() : 0,
      points: [],
    };
    if (chunk.version >= 5) throw new Error("This World Builder supports Generals and Zero Hour polygons only");
    const pointCount = reader.u32();
    if (pointCount > 1_000_000) throw new Error("Polygon has an invalid point count");
    for (let point = 0; point < pointCount; point += 1) {
      polygon.points.push({ x: reader.i32(), y: reader.i32(), z: reader.i32() });
    }
    polygons.push(polygon);
  }
  if (reader.remaining()) throw new Error("PolygonTriggers has trailing data");
  return { version: chunk.version, polygons };
}

function writePolygons(value) {
  const writer = new Writer().u32(value.polygons.length);
  for (const polygon of value.polygons) {
    writer.string(polygon.name);
    if (value.version >= 4) writer.string(polygon.layer || "");
    writer.u32(polygon.id);
    if (value.version >= 2) writer.u8(polygon.isWater ? 1 : 0);
    if (value.version >= 3) writer.u8(polygon.isRiver ? 1 : 0).u32(polygon.riverStart || 0);
    writer.u32(polygon.points.length);
    for (const point of polygon.points) {
      writer.i32(Math.round(point.x)).i32(Math.round(point.y)).i32(Math.round(point.z));
    }
  }
  return writer.finish();
}

function parseWaypointLinks(chunk) {
  const reader = new Reader(chunk.data, "WaypointsList");
  const count = reader.u32();
  if (count > 1_000_000 || reader.remaining() !== count * 8) {
    throw new Error("Waypoint link data is invalid");
  }
  return Array.from({ length: count }, () => ({ start: reader.i32(), end: reader.i32() }));
}

function writeWaypointLinks(links) {
  const writer = new Writer().u32(links.length);
  for (const link of links) writer.i32(link.start).i32(link.end);
  return writer.finish();
}

function readBuildItem(reader, version) {
  const item = {
    buildingName: reader.string(),
    templateName: reader.string(),
    x: reader.f32(),
    y: reader.f32(),
    z: reader.f32(),
    angle: reader.f32(),
    initiallyBuilt: reader.u8() !== 0,
    rebuilds: reader.i32(),
    script: "",
    health: 100,
    whiner: true,
    unsellable: false,
    repairable: true,
  };
  if (version >= 3) {
    item.script = reader.string();
    item.health = reader.i32();
    item.whiner = reader.u8() !== 0;
    item.unsellable = reader.u8() !== 0;
    item.repairable = reader.u8() !== 0;
  }
  return item;
}

function writeBuildItem(writer, item, version) {
  writer
    .string(item.buildingName)
    .string(item.templateName)
    .f32(item.x)
    .f32(item.y)
    .f32(item.z)
    .f32(item.angle)
    .u8(item.initiallyBuilt ? 1 : 0)
    .i32(item.rebuilds);
  if (version >= 3) {
    writer
      .string(item.script || "")
      .i32(item.health ?? 100)
      .u8(item.whiner ? 1 : 0)
      .u8(item.unsellable ? 1 : 0)
      .u8(item.repairable ? 1 : 0);
  }
}

function readScriptParameter(reader) {
  const type = reader.i32();
  if (type === 16) {
    return { type, coordinate: [reader.f32(), reader.f32(), reader.f32()] };
  }
  return {
    type,
    integer: reader.i32(),
    real: reader.f32(),
    string: reader.string(),
  };
}

function writeScriptParameter(writer, parameter) {
  writer.i32(parameter.type);
  if (parameter.type === 16) {
    for (const value of parameter.coordinate) writer.f32(value);
  } else {
    writer.i32(parameter.integer).f32(parameter.real).string(parameter.string);
  }
}

function parseNativeScriptNode(chunk, symbols) {
  if (chunk.name === "OrCondition") {
    return {
      kind: "or",
      children: parseChunkSequence(chunk.data, symbols, "OrCondition")
        .map((child) => ({ chunk: child, native: parseNativeScriptNode(child, symbols) })),
    };
  }
  if (!["Condition", "ScriptAction", "ScriptActionFalse"].includes(chunk.name)) return null;
  const reader = new Reader(chunk.data, chunk.name);
  const type = reader.i32();
  const keyed = (chunk.name === "Condition" && chunk.version >= 4)
    || (chunk.name !== "Condition" && chunk.version >= 2);
  const nameKey = keyed ? reader.u32() : null;
  const count = reader.i32();
  if (count < 0 || count > 64) throw new Error(`${chunk.name} has an invalid parameter count`);
  const parameters = Array.from({ length: count }, () => readScriptParameter(reader));
  if (reader.remaining()) throw new Error(`${chunk.name} has trailing parameter data`);
  return { kind: chunk.name, type, nameKey, parameters };
}

function writeNativeScriptNode(chunk, native) {
  if (!native) return;
  if (native.kind === "or") {
    for (const child of native.children) writeNativeScriptNode(child.chunk, child.native);
    chunk.data = concat(native.children.map(({ chunk: child }) => encodeChunk(child)));
    return;
  }
  const writer = new Writer().i32(native.type);
  if (native.nameKey !== null) writer.u32(native.nameKey);
  writer.i32(native.parameters.length);
  for (const parameter of native.parameters) writeScriptParameter(writer, parameter);
  chunk.data = writer.finish();
}

function parseScriptChunk(chunk, symbols) {
  const reader = new Reader(chunk.data, chunk.name);
  const script = {
    chunk,
    name: reader.string(),
    comment: reader.string(),
    conditionComment: reader.string(),
    actionComment: reader.string(),
    active: reader.u8() !== 0,
    oneShot: reader.u8() !== 0,
    easy: reader.u8() !== 0,
    normal: reader.u8() !== 0,
    hard: reader.u8() !== 0,
    subroutine: reader.u8() !== 0,
    delay: chunk.version >= 2 ? reader.i32() : 0,
  };
  script.children = parseChunkSequence(reader.take(reader.remaining()), symbols, `Script ${script.name}`);
  script.native = script.children.map((child) => ({
    chunk: child,
    native: parseNativeScriptNode(child, symbols),
  }));
  return script;
}

function parseScriptGroup(chunk, symbols) {
  const reader = new Reader(chunk.data, "ScriptGroup");
  const group = {
    chunk,
    name: reader.string(),
    active: reader.u8() !== 0,
    subroutine: chunk.version >= 2 ? reader.u8() !== 0 : false,
  };
  group.children = parseChunkSequence(reader.take(reader.remaining()), symbols, `ScriptGroup ${group.name}`);
  group.scripts = group.children
    .filter((child) => child.name === "Script")
    .map((child) => parseScriptChunk(child, symbols));
  return group;
}

function parseSides(chunk, symbols) {
  const reader = new Reader(chunk.data, "SidesList");
  const playerCount = reader.i32();
  if (playerCount < 0 || playerCount > 64) throw new Error("SidesList has an invalid player count");
  const definitions = [];
  for (let player = 0; player < playerCount; player += 1) {
    const properties = parseDict(reader, symbols);
    const buildCount = reader.i32();
    if (buildCount < 0 || buildCount > 100_000) throw new Error("SidesList has an invalid build list");
    const builds = [];
    for (let build = 0; build < buildCount; build += 1) builds.push(readBuildItem(reader, chunk.version));
    definitions.push({ properties, builds });
  }
  const teamCount = chunk.version >= 2 ? reader.i32() : 0;
  if (teamCount < 0 || teamCount > 100_000) throw new Error("SidesList has an invalid team count");
  const teams = [];
  for (let team = 0; team < teamCount; team += 1) teams.push(parseDict(reader, symbols));
  const prefix = cloneBytes(chunk.data.subarray(0, reader.offset));
  const children = parseChunkSequence(reader.take(reader.remaining()), symbols, "SidesList children");
  const playerScripts = children.find((child) => child.name === "PlayerScriptsList");
  const lists = playerScripts
    ? parseChunkSequence(playerScripts.data, symbols, "PlayerScriptsList")
    : [];
  const players = lists.filter((child) => child.name === "ScriptList").map((list, index) => {
    const listChildren = parseChunkSequence(list.data, symbols, `ScriptList ${index}`);
    return {
      index,
      chunk: list,
      children: listChildren,
      scripts: listChildren
        .filter((child) => child.name === "Script")
        .map((script) => parseScriptChunk(script, symbols)),
      groups: listChildren
        .filter((child) => child.name === "ScriptGroup")
        .map((group) => parseScriptGroup(group, symbols)),
    };
  });
  return {
    version: chunk.version,
    prefix,
    children,
    playerScripts,
    players,
    definitions,
    teams,
    playerCount,
    teamCount,
  };
}

function writeScript(script) {
  const writer = new Writer()
    .string(script.name)
    .string(script.comment)
    .string(script.conditionComment)
    .string(script.actionComment)
    .u8(script.active ? 1 : 0)
    .u8(script.oneShot ? 1 : 0)
    .u8(script.easy ? 1 : 0)
    .u8(script.normal ? 1 : 0)
    .u8(script.hard ? 1 : 0)
    .u8(script.subroutine ? 1 : 0);
  if (script.chunk.version >= 2) writer.i32(script.delay);
  for (const child of script.native || []) writeNativeScriptNode(child.chunk, child.native);
  for (const child of script.children) writer.append(encodeChunk(child));
  script.chunk.data = writer.finish();
}

function writeScriptGroup(group) {
  const writer = new Writer().string(group.name).u8(group.active ? 1 : 0);
  if (group.chunk.version >= 2) writer.u8(group.subroutine ? 1 : 0);
  for (const script of group.scripts) writeScript(script);
  for (const child of group.children) writer.append(encodeChunk(child));
  group.chunk.data = writer.finish();
}

function writeSides(sides, archive) {
  for (const player of sides.players) {
    for (const script of player.scripts) writeScript(script);
    for (const group of player.groups) writeScriptGroup(group);
    player.chunk.data = concat(player.children.map(encodeChunk));
  }
  if (sides.playerScripts) sides.playerScripts.data = concat(sides.players.map(({ chunk }) => encodeChunk(chunk)));
  const writer = new Writer().i32(sides.definitions.length);
  for (const definition of sides.definitions) {
    writer.append(writeDict(definition.properties, archive)).i32(definition.builds.length);
    for (const build of definition.builds) writeBuildItem(writer, build, sides.version);
  }
  if (sides.version >= 2) {
    writer.i32(sides.teams.length);
    for (const team of sides.teams) writer.append(writeDict(team, archive));
  }
  return concat([writer.finish(), ...sides.children.map(encodeChunk)]);
}

function property(object, key) {
  return object.properties?.find((candidate) => candidate.key === key);
}

function upsertProperty(object, key, type, value) {
  object.properties ||= [];
  const current = property(object, key);
  if (current) {
    current.type = type;
    current.value = value;
  } else {
    object.properties.push({ key, type, value });
  }
}

function defaultLighting() {
  const writer = new Writer().u32(2);
  const directions = [
    [0.28, -0.42, -0.86],
    [-0.65, 0.18, -0.5],
    [0.45, 0.62, -0.38],
  ];
  for (let time = 0; time < 4; time += 1) {
    const level = [0.72, 0.88, 0.58, 0.26][time];
    for (let light = 0; light < 3; light += 1) {
      const strength = light ? level * 0.18 : level;
      writer
        .f32(strength * 0.42).f32(strength * 0.42).f32(strength * 0.46)
        .f32(strength).f32(strength * 0.96).f32(strength * 0.88)
        .f32(directions[light][0]).f32(directions[light][1]).f32(directions[light][2]);
      writer
        .f32(strength * 0.42).f32(strength * 0.42).f32(strength * 0.46)
        .f32(strength).f32(strength * 0.96).f32(strength * 0.88)
        .f32(directions[light][0]).f32(directions[light][1]).f32(directions[light][2]);
    }
  }
  return writer.u32(0x80000000).finish();
}

function readLight(reader) {
  return {
    ambient: [reader.f32(), reader.f32(), reader.f32()],
    diffuse: [reader.f32(), reader.f32(), reader.f32()],
    position: [reader.f32(), reader.f32(), reader.f32()],
  };
}

function writeLight(writer, light) {
  for (const value of [...light.ambient, ...light.diffuse, ...light.position]) writer.f32(value);
}

function parseLighting(chunk) {
  const reader = new Reader(chunk.data, "GlobalLighting");
  const value = {
    version: chunk.version,
    timeOfDay: reader.i32(),
    times: [],
    shadowColor: 0x80000000,
  };
  for (let time = 0; time < 4; time += 1) {
    const terrain = [readLight(reader)];
    const objects = [readLight(reader)];
    if (chunk.version >= 2) {
      objects.push(readLight(reader), readLight(reader));
    }
    if (chunk.version >= 3) {
      terrain.push(readLight(reader), readLight(reader));
    }
    value.times.push({ terrain, objects });
  }
  if (reader.remaining() === 4) value.shadowColor = reader.u32();
  if (reader.remaining()) throw new Error("GlobalLighting has trailing data");
  return value;
}

function writeLighting(lighting) {
  const writer = new Writer().i32(lighting.timeOfDay);
  for (const time of lighting.times) {
    writeLight(writer, time.terrain[0]);
    writeLight(writer, time.objects[0]);
    if (lighting.version >= 2) {
      writeLight(writer, time.objects[1]);
      writeLight(writer, time.objects[2]);
    }
    if (lighting.version >= 3) {
      writeLight(writer, time.terrain[1]);
      writeLight(writer, time.terrain[2]);
    }
  }
  return writer.u32(lighting.shadowColor).finish();
}

function defaultSides(archive) {
  const players = [
    ["", "Neutral", ""],
    ["PlyrCivilian", "PlyrCivilian", "FactionCivilian"],
    ["SkirmishAmerica", "SkirmishAmerica", "FactionAmerica"],
    ["SkirmishChina", "SkirmishChina", "FactionChina"],
    ["SkirmishGLA", "SkirmishGLA", "FactionGLA"],
    ["SkirmishAmericaAirForceGeneral", "SkirmishAmericaAirForceGeneral",
      "FactionAmericaAirForceGeneral"],
    ["SkirmishAmericaLaserGeneral", "SkirmishAmericaLaserGeneral",
      "FactionAmericaLaserGeneral"],
    ["SkirmishAmericaSuperWeaponGeneral", "SkirmishAmericaSuperWeaponGeneral",
      "FactionAmericaSuperWeaponGeneral"],
    ["SkirmishChinaTankGeneral", "SkirmishChinaTankGeneral", "FactionChinaTankGeneral"],
    ["SkirmishChinaNukeGeneral", "SkirmishChinaNukeGeneral", "FactionChinaNukeGeneral"],
    ["SkirmishChinaInfantryGeneral", "SkirmishChinaInfantryGeneral",
      "FactionChinaInfantryGeneral"],
    ["SkirmishGLADemolitionGeneral", "SkirmishGLADemolitionGeneral",
      "FactionGLADemolitionGeneral"],
    ["SkirmishGLAToxinGeneral", "SkirmishGLAToxinGeneral", "FactionGLAToxinGeneral"],
    ["SkirmishGLAStealthGeneral", "SkirmishGLAStealthGeneral",
      "FactionGLAStealthGeneral"],
  ];
  const writer = new Writer().i32(players.length);
  for (const [name, displayName, faction] of players) {
    writer.append(writeDict([
      { key: "playerName", type: 3, value: name },
      { key: "playerIsHuman", type: 0, value: false },
      { key: "playerDisplayName", type: 4, value: displayName },
      { key: "playerFaction", type: 3, value: faction },
      { key: "playerEnemies", type: 3, value: "" },
      { key: "playerAllies", type: 3, value: "" },
    ], archive)).i32(0);
  }
  writer.i32(players.length);
  for (const [name] of players) {
    writer.append(writeDict([
      { key: "teamName", type: 3, value: `team${name}` },
      { key: "teamOwner", type: 3, value: name },
      { key: "teamIsSingleton", type: 0, value: true },
    ], archive));
  }
  const scriptLists = players.map(() =>
    encodeChunk(nestedChunk(archive, "ScriptList", 1, new Uint8Array())));
  const scripts = encodeChunk(nestedChunk(
    archive,
    "PlayerScriptsList",
    5,
    concat(scriptLists),
  ));
  return writer.append(scripts).finish();
}

function defaultBlend(width, height, terrain, terrainWidth) {
  const area = width * height;
  const cellWidth = Math.max(1, Math.min(16, Math.round(terrainWidth)));
  const tileCount = cellWidth * cellWidth;
  const writer = new Writer().u32(area);
  for (let array = 0; array < 4; array += 1) {
    for (let index = 0; index < area; index += 1) writer.u16(0);
  }
  writer.append(new Uint8Array(Math.ceil(width / 8) * height));
  writer
    .u32(tileCount)
    .u32(1)
    .u32(1)
    .u32(1)
    .u32(0).u32(tileCount).u32(cellWidth).u32(0).string(terrain)
    .u32(0)
    .u32(0);
  return writer.finish();
}

function snapshotState(document) {
  return {
    archive: structuredClone(document.archive),
    heightMap: structuredClone(document.heightMap),
    blend: structuredClone(document.blend),
    world: structuredClone(document.world),
    objects: structuredClone(document.objects),
    polygons: structuredClone(document.polygons),
    waypointLinks: structuredClone(document.waypointLinks),
    sides: structuredClone(document.sides),
    lighting: structuredClone(document.lighting),
    dirtyChunks: [...document.dirtyChunks],
    name: document.name,
  };
}

export class MapDocument {
  static async fromBytes(value, { name = "Imported Map" } = {}) {
    const source = cloneBytes(bytes(value));
    const uncompressed = await decompressMap(source);
    return new MapDocument(parseArchive(uncompressed), { name, source });
  }

  static create({
    name = "Untitled Map",
    playableWidth = 128,
    playableHeight = 128,
    border = 16,
    elevation = 24,
    terrain = "SandMediumType5",
    terrainWidth = 1,
  } = {}) {
    const width = Math.round(playableWidth) + Math.round(border) * 2;
    const height = Math.round(playableHeight) + Math.round(border) * 2;
    if (width < 35 || height < 35 || width > 2048 || height > 2048) {
      throw new Error("Playable map dimensions must be between 3 and 2016 cells");
    }
    const archive = {
      symbols: { entries: [], byId: new Map(), byName: new Map() },
      chunks: [],
    };
    const add = (chunkName, version, data) => archive.chunks.push(nestedChunk(archive, chunkName, version, data));
    add("HeightMapData", 4, new Writer()
      .u32(width).u32(height).u32(border).u32(1)
      .u32(playableWidth).u32(playableHeight)
      .u32(width * height)
      .append(new Uint8Array(width * height).fill(Math.max(0, Math.min(255, elevation))))
      .finish());
    add("BlendTileData", 8, defaultBlend(width, height, terrain, terrainWidth));
    add("WorldInfo", 1, writeDict([
      { key: "weather", type: 1, value: 0 },
      { key: "music", type: 3, value: "" },
    ], archive));
    add("SidesList", 3, defaultSides(archive));
    add("ObjectsList", 3, new Uint8Array());
    add("PolygonTriggers", 4, writePolygons({
      version: 4,
      polygons: [{
        name: "Default Water",
        layer: "",
        id: 1,
        isWater: true,
        isRiver: false,
        riverStart: 0,
        points: [
          { x: -border * MAP_XY_SCALE, y: -border * MAP_XY_SCALE, z: 7 },
          { x: (playableWidth + border) * MAP_XY_SCALE, y: -border * MAP_XY_SCALE, z: 7 },
          { x: (playableWidth + border) * MAP_XY_SCALE, y: (playableHeight + border) * MAP_XY_SCALE, z: 7 },
          { x: -border * MAP_XY_SCALE, y: (playableHeight + border) * MAP_XY_SCALE, z: 7 },
        ],
      }],
    }));
    add("GlobalLighting", 3, defaultLighting());
    add("WaypointsList", 1, new Writer().u32(0).finish());
    return new MapDocument(archive, { name, source: null });
  }

  constructor(archive, { name, source }) {
    this.archive = archive;
    this.name = name;
    this.sourceBytes = source;
    this.dirtyChunks = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.cleanRevision = 0;
    this.revision = 0;
    this.#hydrate();
  }

  #chunk(name) {
    return this.archive.chunks.find((chunk) => chunk.name === name);
  }

  #hydrate() {
    const heightChunk = this.#chunk("HeightMapData");
    if (!heightChunk) throw new Error("Map has no HeightMapData chunk");
    this.heightMap = parseHeightMap(heightChunk);
    const blendChunk = this.#chunk("BlendTileData");
    this.blend = blendChunk ? parseBlend(blendChunk, this.heightMap) : null;
    const worldChunk = this.#chunk("WorldInfo");
    this.world = worldChunk ? parseDict(new Reader(worldChunk.data, "WorldInfo"), this.archive.symbols) : [];
    const objectsChunk = this.#chunk("ObjectsList");
    this.objects = objectsChunk ? parseObjects(objectsChunk, this.archive.symbols) : [];
    const polygonChunk = this.#chunk("PolygonTriggers");
    this.polygons = polygonChunk ? parsePolygons(polygonChunk) : { version: 4, polygons: [] };
    const waypointChunk = this.#chunk("WaypointsList");
    this.waypointLinks = waypointChunk ? parseWaypointLinks(waypointChunk) : [];
    const sidesChunk = this.#chunk("SidesList");
    this.sides = sidesChunk ? parseSides(sidesChunk, this.archive.symbols) : null;
    const lightingChunk = this.#chunk("GlobalLighting");
    this.lighting = lightingChunk ? parseLighting(lightingChunk) : null;
  }

  get dirty() {
    return this.revision !== this.cleanRevision;
  }

  get playableWidth() {
    return this.heightMap.width - this.heightMap.border * 2;
  }

  get playableHeight() {
    return this.heightMap.height - this.heightMap.border * 2;
  }

  get worldWidth() {
    return this.heightMap.width * MAP_XY_SCALE;
  }

  get worldHeight() {
    return this.heightMap.height * MAP_XY_SCALE;
  }

  transaction(label, callback) {
    const before = snapshotState(this);
    callback(this);
    this.undoStack.push({ label, state: before });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.revision += 1;
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ label: entry.label, state: snapshotState(this) });
    this.#restore(entry.state);
    this.revision -= 1;
    return true;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.undoStack.push({ label: entry.label, state: snapshotState(this) });
    this.#restore(entry.state);
    this.revision += 1;
    return true;
  }

  #restore(state) {
    this.archive = state.archive;
    this.heightMap = state.heightMap;
    this.blend = state.blend;
    this.world = state.world;
    this.objects = state.objects;
    this.polygons = state.polygons;
    this.waypointLinks = state.waypointLinks;
    this.sides = state.sides;
    this.lighting = state.lighting;
    this.dirtyChunks = new Set(state.dirtyChunks);
    this.name = state.name;
  }

  terrainIndex(x, y) {
    return y * this.heightMap.width + x;
  }

  setElevation(x, y, value) {
    if (x < 0 || y < 0 || x >= this.heightMap.width || y >= this.heightMap.height) return;
    const max = this.heightMap.version >= 5 ? 65535 : 255;
    this.heightMap.elevations[this.terrainIndex(x, y)] = Math.max(0, Math.min(max, Math.round(value)));
    this.dirtyChunks.add("HeightMapData");
  }

  setPassable(x, y, passable) {
    if (!this.blend?.impassability.byteLength || x < 0 || y < 0
        || x >= this.blend.passabilityWidth || y >= this.heightMap.height) return;
    const offset = y * Math.ceil(this.blend.passabilityWidth / 8) + Math.floor(x / 8);
    const mask = 1 << (x % 8);
    if (passable) this.blend.impassability[offset] &= ~mask;
    else this.blend.impassability[offset] |= mask;
    this.dirtyChunks.add("BlendTileData");
  }

  isPassable(x, y) {
    if (!this.blend?.impassability.byteLength) return true;
    const offset = y * Math.ceil(this.blend.passabilityWidth / 8) + Math.floor(x / 8);
    return (this.blend.impassability[offset] & (1 << (x % 8))) === 0;
  }

  setTerrain(x, y, textureIndex) {
    const texture = this.blend?.textures[textureIndex];
    if (!texture) return;
    const index = this.terrainIndex(x, y);
    this.blend.tiles[index] = texture.firstTile * 4;
    this.blend.blends[index] = 0;
    this.blend.extraBlends[index] = 0;
    this.blend.cliffs[index] = 0;
    this.dirtyChunks.add("BlendTileData");
  }

  addTerrainTexture(name, { width = 1 } = {}) {
    if (!this.blend) throw new Error("Map has no terrain blend data");
    const existing = this.blend.textures.findIndex((texture) =>
      texture.name.toLowerCase() === String(name).toLowerCase());
    if (existing >= 0) return existing;
    const cellWidth = Math.max(1, Math.min(16, Math.round(width)));
    const tileCount = cellWidth * cellWidth;
    const firstTile = this.blend.textureCellCount;
    const tailReader = new Reader(this.blend.tail, "BlendTileData metadata");
    const textureCellCount = tailReader.u32();
    const blendCount = tailReader.u32();
    const cliffCount = tailReader.u32();
    const textureCount = tailReader.u32();
    for (let index = 0; index < textureCount; index += 1) {
      tailReader.u32();
      tailReader.u32();
      tailReader.u32();
      tailReader.u32();
      tailReader.string();
    }
    const remainder = cloneBytes(tailReader.take(tailReader.remaining()));
    const texture = {
      firstTile,
      tileCount,
      width: cellWidth,
      reserved: 0,
      name: String(name),
    };
    this.blend.textures.push(texture);
    const writer = new Writer()
      .u32(textureCellCount + tileCount)
      .u32(blendCount)
      .u32(cliffCount)
      .u32(textureCount + 1);
    for (const candidate of this.blend.textures) {
      writer
        .u32(candidate.firstTile)
        .u32(candidate.tileCount)
        .u32(candidate.width)
        .u32(candidate.reserved || 0)
        .string(candidate.name);
    }
    this.blend.tail = writer.append(remainder).finish();
    this.blend.textureCellCount += tileCount;
    this.dirtyChunks.add("BlendTileData");
    return this.blend.textures.length - 1;
  }

  addObject(type, x, y, options = {}) {
    const uniqueNumber = Math.max(0, ...this.objects.map((candidate) => {
      const match = / (\d+)$/.exec(property(candidate, "uniqueID")?.value || "");
      return match ? Number(match[1]) : 0;
    })) + 1;
    const defaults = [
      { key: "objectInitialHealth", type: 1, value: 100 },
      { key: "objectEnabled", type: 0, value: true },
      { key: "objectIndestructible", type: 0, value: false },
      { key: "objectUnsellable", type: 0, value: false },
      { key: "objectPowered", type: 0, value: true },
      { key: "objectRecruitableAI", type: 0, value: true },
      { key: "objectTargetable", type: 0, value: true },
      { key: "originalOwner", type: 3, value: options.owner || "team" },
      { key: "uniqueID", type: 3, value: options.uniqueId || `${type} ${uniqueNumber}` },
      { key: "objectLayer", type: 3, value: options.layer || "" },
    ];
    const mergedProperties = new Map(defaults.map((value) => [value.key, value]));
    for (const value of structuredClone(options.properties || [])) mergedProperties.set(value.key, value);
    const object = {
      version: 3,
      type,
      x,
      y,
      z: options.z ?? this.sampleWorldElevation(x, y),
      angle: options.angle ?? 0,
      flags: options.flags ?? 0,
      properties: [...mergedProperties.values()],
    };
    this.objects.push(object);
    this.dirtyChunks.add("ObjectsList");
    return object;
  }

  addWaypoint(name, x, y, { id = null } = {}) {
    const waypointId = id ?? Math.max(0, ...this.waypoints().map((waypoint) => waypoint.id)) + 1;
    return this.addObject("*Waypoints/Waypoint", x, y, {
      layer: /^Player_\d+_Start$/i.test(name) ? "Start Points" : "Waypoints",
      uniqueId: name,
      properties: [
        { key: "waypointID", type: 1, value: waypointId },
        { key: "waypointName", type: 3, value: name },
      ],
    });
  }

  addWaypointLink(start, end) {
    if (!Number.isInteger(start) || !Number.isInteger(end) || start === end) {
      throw new Error("Waypoint links require two different waypoint IDs");
    }
    if (!this.waypoints().some((waypoint) => waypoint.id === start)
        || !this.waypoints().some((waypoint) => waypoint.id === end)) {
      throw new Error("Waypoint link references a missing waypoint");
    }
    if (!this.waypointLinks.some((link) => link.start === start && link.end === end)) {
      this.waypointLinks.push({ start, end });
      this.dirtyChunks.add("WaypointsList");
    }
  }

  removeWaypointLink(start, end) {
    this.waypointLinks = this.waypointLinks.filter((link) =>
      !(link.start === start && link.end === end));
    this.dirtyChunks.add("WaypointsList");
  }

  addScorch(x, y, { type = 0, radius = 20 } = {}) {
    return this.addObject("Scorch", x, y, {
      owner: "team",
      layer: "Scorches",
      properties: [
        { key: "scorchType", type: 1, value: Math.max(0, Math.min(4, Math.round(type))) },
        { key: "objectRadius", type: 2, value: Math.max(1, Number(radius)) },
      ],
    });
  }

  addPlayer({
    name,
    displayName = name,
    faction = "FactionCivilian",
    human = false,
    allies = "",
    enemies = "",
  }) {
    if (!this.sides) throw new Error("Map has no SidesList chunk");
    const internalName = String(name || "").trim();
    if (this.sides.definitions.some((definition) =>
      property({ properties: definition.properties }, "playerName")?.value === internalName)) {
      throw new Error(`Player ${internalName || "(neutral)"} already exists`);
    }
    const definition = {
      properties: [
        { key: "playerName", type: 3, value: internalName },
        { key: "playerIsHuman", type: 0, value: Boolean(human) },
        { key: "playerDisplayName", type: 4, value: String(displayName || internalName) },
        { key: "playerFaction", type: 3, value: String(faction) },
        { key: "playerEnemies", type: 3, value: String(enemies) },
        { key: "playerAllies", type: 3, value: String(allies) },
      ],
      builds: [],
    };
    this.sides.definitions.push(definition);
    this.sides.playerCount = this.sides.definitions.length;
    this.#ensureScriptList(this.sides.definitions.length - 1);
    this.dirtyChunks.add("SidesList");
    return definition;
  }

  setPlayerProperty(playerIndex, key, type, value) {
    const player = this.sides?.definitions[playerIndex];
    if (!player) throw new Error("Player does not exist");
    upsertProperty(player, key, type, value);
    this.dirtyChunks.add("SidesList");
  }

  removePlayer(playerIndex) {
    const definition = this.sides?.definitions[playerIndex];
    if (!definition) return;
    const playerName = String(property(
      { properties: definition.properties },
      "playerName",
    )?.value || "");
    this.sides.definitions.splice(playerIndex, 1);
    this.sides.players.splice(playerIndex, 1);
    this.sides.players.forEach((player, index) => {
      player.index = index;
    });
    this.sides.teams = this.sides.teams.filter((team) =>
      String(property({ properties: team }, "teamOwner")?.value || "") !== playerName);
    this.sides.playerCount = this.sides.definitions.length;
    this.sides.teamCount = this.sides.teams.length;
    this.dirtyChunks.add("SidesList");
  }

  addTeam({ name, owner = "", properties = [] }) {
    if (!this.sides) throw new Error("Map has no SidesList chunk");
    if (!String(name || "").trim()) throw new Error("Team name is required");
    const values = [
      { key: "teamName", type: 3, value: String(name) },
      { key: "teamOwner", type: 3, value: String(owner) },
      { key: "teamIsSingleton", type: 0, value: true },
    ];
    for (const item of structuredClone(properties)) {
      upsertProperty({ properties: values }, item.key, item.type, item.value);
    }
    this.sides.teams.push(values);
    this.sides.teamCount = this.sides.teams.length;
    this.dirtyChunks.add("SidesList");
    return values;
  }

  setTeamProperty(teamIndex, key, type, value) {
    const team = this.sides?.teams[teamIndex];
    if (!team) throw new Error("Team does not exist");
    upsertProperty({ properties: team }, key, type, value);
    this.dirtyChunks.add("SidesList");
  }

  removeTeam(teamIndex) {
    if (!this.sides?.teams[teamIndex]) return;
    this.sides.teams.splice(teamIndex, 1);
    this.sides.teamCount = this.sides.teams.length;
    this.dirtyChunks.add("SidesList");
  }

  addBuildListItem(playerIndex, value) {
    const player = this.sides?.definitions[playerIndex];
    if (!player) throw new Error("Build list player does not exist");
    const item = {
      buildingName: String(value.buildingName || value.templateName || "Building"),
      templateName: String(value.templateName || ""),
      x: Number(value.x || 0),
      y: Number(value.y || 0),
      z: Number(value.z || 0),
      angle: Number(value.angle || 0),
      initiallyBuilt: Boolean(value.initiallyBuilt),
      rebuilds: Number.isInteger(value.rebuilds) ? value.rebuilds : 0,
      script: String(value.script || ""),
      health: Number.isInteger(value.health) ? value.health : 100,
      whiner: value.whiner !== false,
      unsellable: Boolean(value.unsellable),
      repairable: value.repairable !== false,
    };
    player.builds.push(item);
    this.dirtyChunks.add("SidesList");
    return item;
  }

  removeBuildListItem(playerIndex, buildIndex) {
    const player = this.sides?.definitions[playerIndex];
    if (!player?.builds[buildIndex]) return;
    player.builds.splice(buildIndex, 1);
    this.dirtyChunks.add("SidesList");
  }

  setLightingTimeOfDay(value) {
    if (!this.lighting) throw new Error("Map has no GlobalLighting chunk");
    this.lighting.timeOfDay = Math.max(1, Math.min(4, Math.round(value)));
    this.dirtyChunks.add("GlobalLighting");
  }

  waypoints() {
    return this.objects
      .map((object) => ({
        object,
        id: property(object, "waypointID")?.value,
        name: property(object, "waypointName")?.value,
      }))
      .filter((waypoint) => Number.isInteger(waypoint.id) && waypoint.name);
  }

  setObjectProperty(object, key, type, value) {
    upsertProperty(object, key, type, value);
    this.dirtyChunks.add("ObjectsList");
  }

  addPolygon(polygon) {
    const value = {
      name: polygon.name || `Area ${this.polygons.polygons.length + 1}`,
      layer: polygon.layer || "",
      id: polygon.id ?? Math.max(0, ...this.polygons.polygons.map((candidate) => candidate.id)) + 1,
      isWater: Boolean(polygon.isWater),
      isRiver: Boolean(polygon.isRiver),
      riverStart: polygon.riverStart || 0,
      points: structuredClone(polygon.points || []),
    };
    this.polygons.polygons.push(value);
    this.dirtyChunks.add("PolygonTriggers");
    return value;
  }

  updateScript(script, patch) {
    for (const key of [
      "name", "comment", "conditionComment", "actionComment",
      "active", "oneShot", "easy", "normal", "hard", "subroutine", "delay",
    ]) {
      if (Object.hasOwn(patch, key)) script[key] = patch[key];
    }
    this.dirtyChunks.add("SidesList");
  }

  #ensureScriptList(playerIndex) {
    if (!this.sides || !this.sides.definitions[playerIndex]) {
      throw new Error("Add the script's player before adding scripts");
    }
    if (!this.sides.playerScripts) {
      this.sides.playerScripts = nestedChunk(
        this.archive,
        "PlayerScriptsList",
        5,
        new Uint8Array(),
      );
      this.sides.children.push(this.sides.playerScripts);
    }
    while (this.sides.players.length <= playerIndex) {
      const chunk = nestedChunk(this.archive, "ScriptList", 1, new Uint8Array());
      const player = {
        index: this.sides.players.length,
        chunk,
        children: [],
        scripts: [],
        groups: [],
      };
      this.sides.players.push(player);
    }
    return this.sides.players[playerIndex];
  }

  addScript(playerIndex, { name = "New Script", group = null } = {}) {
    const player = this.#ensureScriptList(playerIndex);
    const chunk = nestedChunk(this.archive, "Script", 2, new Uint8Array());
    const script = {
      chunk,
      name: String(name),
      comment: "",
      conditionComment: "",
      actionComment: "",
      active: true,
      oneShot: true,
      easy: true,
      normal: true,
      hard: true,
      subroutine: false,
      delay: 0,
      children: [],
      native: [],
    };
    if (group) {
      group.scripts.push(script);
      group.children.push(chunk);
    } else {
      player.scripts.push(script);
      player.children.push(chunk);
    }
    this.dirtyChunks.add("SidesList");
    return script;
  }

  addScriptGroup(playerIndex, { name = "New Group" } = {}) {
    const player = this.#ensureScriptList(playerIndex);
    const chunk = nestedChunk(this.archive, "ScriptGroup", 2, new Uint8Array());
    const group = {
      chunk,
      name: String(name),
      active: true,
      subroutine: false,
      children: [],
      scripts: [],
    };
    player.groups.push(group);
    player.children.push(chunk);
    this.dirtyChunks.add("SidesList");
    return group;
  }

  removeScript(script) {
    for (const player of this.sides?.players || []) {
      const directIndex = player.scripts.indexOf(script);
      if (directIndex >= 0) {
        player.scripts.splice(directIndex, 1);
        player.children = player.children.filter((child) => child !== script.chunk);
        this.dirtyChunks.add("SidesList");
        return true;
      }
      for (const group of player.groups) {
        const index = group.scripts.indexOf(script);
        if (index < 0) continue;
        group.scripts.splice(index, 1);
        group.children = group.children.filter((child) => child !== script.chunk);
        this.dirtyChunks.add("SidesList");
        return true;
      }
    }
    return false;
  }

  updateScriptParameter(parameter, patch) {
    if (parameter.type === 16 && patch.coordinate) {
      parameter.coordinate = patch.coordinate.map(Number);
    } else {
      if (Object.hasOwn(patch, "integer")) parameter.integer = Number.parseInt(patch.integer, 10) || 0;
      if (Object.hasOwn(patch, "real")) parameter.real = Number(patch.real) || 0;
      if (Object.hasOwn(patch, "string")) parameter.string = String(patch.string);
    }
    this.dirtyChunks.add("SidesList");
  }

  sampleWorldElevation(x, y) {
    const cellX = Math.max(0, Math.min(this.heightMap.width - 1, Math.round(x / MAP_XY_SCALE)));
    const cellY = Math.max(0, Math.min(this.heightMap.height - 1, Math.round(y / MAP_XY_SCALE)));
    const scale = this.heightMap.version >= 5 ? 0.0390625 : MAP_HEIGHT_SCALE;
    return this.heightMap.elevations[this.terrainIndex(cellX, cellY)] * scale;
  }

  validate() {
    const issues = [];
    const starts = new Set();
    for (const waypoint of this.waypoints()) {
      const match = /^Player_(\d+)_Start$/i.exec(waypoint.name);
      if (match) {
        const number = Number(match[1]);
        if (starts.has(number)) issues.push({ severity: "error", message: `Duplicate Player_${number}_Start` });
        starts.add(number);
      }
    }
    if (starts.size < 2) {
      issues.push({ severity: "error", message: "Skirmish maps need at least two Player_N_Start waypoints" });
    }
    const expected = Array.from({ length: starts.size }, (_, index) => index + 1);
    if (starts.size && expected.some((number) => !starts.has(number))) {
      issues.push({ severity: "error", message: "Player start waypoint numbers must be contiguous from 1" });
    }
    const border = this.heightMap.border * MAP_XY_SCALE;
    const minX = border;
    const minY = border;
    const maxX = (this.heightMap.width - this.heightMap.border) * MAP_XY_SCALE;
    const maxY = (this.heightMap.height - this.heightMap.border) * MAP_XY_SCALE;
    for (const object of this.objects) {
      if (object.x < 0 || object.y < 0 || object.x > this.worldWidth || object.y > this.worldHeight) {
        issues.push({ severity: "error", message: `${object.type} is outside the terrain` });
      } else if (object.x < minX || object.y < minY || object.x > maxX || object.y > maxY) {
        issues.push({ severity: "warning", message: `${object.type} is inside the map border` });
      }
    }
    for (const polygon of this.polygons.polygons) {
      if (polygon.points.length < 3) {
        issues.push({ severity: "error", message: `${polygon.name} needs at least three points` });
      }
    }
    if (!this.blend) issues.push({ severity: "error", message: "Map has no BlendTileData chunk" });
    return issues;
  }

  serialize({ preserveOriginal = true } = {}) {
    if (preserveOriginal && !this.dirty && this.sourceBytes) return cloneBytes(this.sourceBytes);
    const rewrites = new Map([
      ["HeightMapData", () => writeHeightMap(this.heightMap)],
      ["BlendTileData", () => writeBlend(this.blend)],
      ["WorldInfo", () => writeDict(this.world, this.archive)],
      ["ObjectsList", () => writeObjects(this.objects, this.archive)],
      ["PolygonTriggers", () => writePolygons(this.polygons)],
      ["WaypointsList", () => writeWaypointLinks(this.waypointLinks)],
      ["SidesList", () => writeSides(this.sides, this.archive)],
      ["GlobalLighting", () => writeLighting(this.lighting)],
    ]);
    for (const name of this.dirtyChunks) {
      const chunk = this.#chunk(name);
      const rewrite = rewrites.get(name);
      if (!chunk || !rewrite) throw new Error(`Cannot rewrite missing or unsupported chunk ${name}`);
      chunk.data = rewrite();
    }
    return encodeArchive(this.archive);
  }

  markSaved() {
    this.cleanRevision = this.revision;
    this.sourceBytes = this.serialize({ preserveOriginal: false });
    this.dirtyChunks.clear();
  }

  summary() {
    return {
      name: this.name,
      width: this.heightMap.width,
      height: this.heightMap.height,
      playableWidth: this.playableWidth,
      playableHeight: this.playableHeight,
      border: this.heightMap.border,
      objects: this.objects.length,
      waypoints: this.waypoints().length,
      waypointLinks: this.waypointLinks.length,
      polygons: this.polygons.polygons.length,
      players: this.sides?.definitions.length || 0,
      teams: this.sides?.teams.length || 0,
      buildListItems: this.sides?.definitions.reduce((total, player) =>
        total + player.builds.length, 0) || 0,
      scripts: this.sides?.players.reduce((total, player) =>
        total + player.scripts.length
          + player.groups.reduce((groupTotal, group) => groupTotal + group.scripts.length, 0), 0) || 0,
      textures: this.blend?.textures.map((texture) => texture.name) || [],
      timeOfDay: this.lighting?.timeOfDay ?? null,
      chunks: this.archive.chunks.map(({ name, version, data }) => ({
        name,
        version,
        bytes: data.byteLength,
      })),
      issues: this.validate(),
      dirty: this.dirty,
    };
  }
}

export const WorldBuilderBinary = Object.freeze({
  Reader,
  Writer,
  parseArchive,
  encodeArchive,
  parseChunkSequence,
  parseDict,
  writeDict,
  refPackDecode,
});
